const BUCKET = "factory-record-attachments";
const MAX_FILE_BYTES = 512 * 1024;
const MAX_TOTAL_BYTES = 2 * 1024 * 1024;
const MAX_FILES = 5;
const fail = (message, code = "OT_API_ERROR") => Object.assign(new Error(message), { code });
const encodePath = path => path.split("/").map(encodeURIComponent).join("/");
const ALL_OT_GROUPS = Object.freeze(["สกรีน", "ผลิต", "ขนส่ง"]);
export const overtimeGroupsForContext = context => context?.role === "admin"
  ? [...ALL_OT_GROUPS]
  : [...new Set((context?.groups || []).filter(group => ALL_OT_GROUPS.includes(group)))];

export function createOtService({ url, key, token: initialToken, getToken }) {
  const base = String(url || "").replace(/\/$/, "");
  const boundToken = initialToken || (typeof getToken === "function" ? getToken() : "");
  const accessToken = () => {
    const current = typeof getToken === "function" ? getToken() : boundToken;
    if (!boundToken || !current || current !== boundToken) throw fail("Session เปลี่ยนหรือหมดอายุ กรุณาเข้าสู่ระบบและตรวจรายการเดิม", "SESSION_EXPIRED");
    return boundToken;
  };
  const headers = extra => ({ apikey: key, Authorization: `Bearer ${accessToken()}`, ...extra });
  async function readJson(response, fallback) {
    let raw;
    try { raw = await response.text(); }
    catch (cause) { throw Object.assign(fail("ได้รับผลตอบกลับจาก Supabase ไม่ครบ กรุณาตรวจรายการเดิมก่อนลองซ้ำ", "NETWORK_ERROR"), { cause }); }
    let value = null;
    try { value = raw ? JSON.parse(raw) : null; } catch {}
    if (response.status === 401) throw fail("Session หมดอายุ กรุณาเข้าสู่ระบบ LINE อีกครั้ง", "SESSION_EXPIRED");
    if (response.status === 403 || response.status === 42501) throw fail("ไม่มีสิทธิ์ใช้งาน OT", "PERMISSION_DENIED");
    if (!response.ok) {
      const message = value?.message || value?.error || fallback;
      const code = value?.code || "OT_API_ERROR";
      if (code === "22023" && String(message).includes("OT_DATA_ANOMALY")) throw fail("พบข้อมูล OT เก่าหรือข้อมูลระยะเวลาที่ไม่ตรงกัน ระบบหยุดสรุปเพื่อไม่แสดงยอดคลาดเคลื่อน", "OT_DATA_ANOMALY");
      if (code === "P0002" && String(message).includes("OT_NOT_FOUND")) throw fail("ไม่พบรายงาน OT หรือไม่มีสิทธิ์เปิดรายการนี้", "NOT_FOUND");
      if (code === "PGRST202" && String(message).includes("ot_report_detail_manager")) throw fail("รายละเอียดรายงาน OT สำหรับผู้บริหารยังไม่ได้ติดตั้งบน Supabase", "BACKEND_NOT_READY");
      if (String(message).includes("OT_EDIT_CONFLICT")) throw fail("รายงานนี้ถูกแก้ไขจากหน้าอื่นแล้ว กรุณาเปิดข้อมูลล่าสุดก่อนแก้ไข", "EDIT_CONFLICT");
      if (String(message).includes("OT_REQUEST_CONFLICT") || code === "23505") throw fail("คำขอนี้เคยส่งด้วยข้อมูลชุดอื่นแล้ว กรุณาตรวจประวัติ OT ก่อนเริ่มรายการใหม่", "IDEMPOTENCY_CONFLICT");
      throw fail(message, code);
    }
    return value;
  }
  async function rpc(name, body, {signal}={}) {
    let response;
    try {
      response = await fetch(`${base}/rest/v1/rpc/${name}`, {
        method: "POST", cache: "no-store", redirect: "error",
        headers: headers({ "Content-Type": "application/json", Accept: "application/json" }),
        body: JSON.stringify(body), signal
      });
    } catch (error) { if(error?.code==="SESSION_EXPIRED")throw error; throw Object.assign(fail("เชื่อมต่อ Supabase ไม่ได้ กรุณาตรวจอินเทอร์เน็ต", "NETWORK_ERROR"), { cause: error }); }
    return readJson(response, "เรียกข้อมูล OT ไม่สำเร็จ");
  }
  async function rest(path) {
    let response;
    try { response = await fetch(`${base}/rest/v1/${path}`, { cache: "no-store", redirect: "error", headers: headers({ Accept: "application/json" }) }); }
    catch (error) { if(error?.code==="SESSION_EXPIRED")throw error; throw Object.assign(fail("เชื่อมต่อ Supabase ไม่ได้ กรุณาตรวจอินเทอร์เน็ต", "NETWORK_ERROR"), { cause: error }); }
    return readJson(response, "อ่านข้อมูล OT ไม่สำเร็จ");
  }
  async function hashFile(file) {
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
  }
  async function attachmentPath(ownerId, requestId, index, name, sha256, mime) {
    const pathSeed = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${requestId}|${index}|${name}|${sha256}`));
    const hex = [...new Uint8Array(pathSeed)].slice(0, 16).map(byte => byte.toString(16).padStart(2, "0")).join("");
    const fileId = `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`;
    const ext = mime === "image/jpeg" ? "jpg" : mime === "image/png" ? "png" : "webp";
    return `otRequests/${ownerId}/${requestId}/${fileId}.${ext}`;
  }
  async function normalizeFiles(files, ownerId, requestId, hashes) {
    if (!Array.isArray(files) || files.length > MAX_FILES) throw fail("แนบรูปได้ไม่เกิน 5 รูป", "VALIDATION_ERROR");
    let total = 0;
    const result = [];
    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      if (!(file instanceof File) || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw fail("รองรับเฉพาะรูป JPG, PNG และ WebP; GIF แบบเคลื่อนไหวยังไม่รองรับ", "VALIDATION_ERROR");
      if (file.size < 1 || file.size > MAX_FILE_BYTES) throw fail(`รูป ${file.name} มีขนาดหลังเตรียมเกิน 512 KB`, "VALIDATION_ERROR");
      total += file.size;
      if (total > MAX_TOTAL_BYTES) throw fail("รูปทั้งหมดรวมกันต้องไม่เกิน 2 MB", "VALIDATION_ERROR");
      const sha256 = hashes[index];
      const path = await attachmentPath(ownerId, requestId, index, file.name, sha256, file.type);
      result.push({ file, path, original_name: file.name.slice(0, 120), mime_type: file.type, byte_size: file.size, sha256 });
    }
    return result;
  }
  async function filesFromSignature(metadata, ownerId, requestId) {
    if (!Array.isArray(metadata) || metadata.length > MAX_FILES) throw fail("ข้อมูลรูปของรายการเดิมไม่สมบูรณ์", "RECOVERY_ERROR");
    const result=[];
    for (const [index,file] of metadata.entries()) {
      if (typeof file.name !== "string" || !["image/jpeg","image/png","image/webp"].includes(file.type) || !/^[0-9a-f]{64}$/.test(file.sha256 || "") || !Number.isInteger(file.size) || file.size<1 || file.size>MAX_FILE_BYTES)
        throw fail("ข้อมูลรูปของรายการเดิมไม่สมบูรณ์ กรุณาติดต่อผู้ดูแล", "RECOVERY_ERROR");
      result.push({path:await attachmentPath(ownerId,requestId,index,file.name,file.sha256,file.type),original_name:file.name.slice(0,120),mime_type:file.type,byte_size:file.size,sha256:file.sha256});
    }
    return result;
  }
  async function upload(file) {
    let response;
    try {
      response = await fetch(`${base}/storage/v1/object/${BUCKET}/${encodePath(file.path)}`, {
        method: "POST", cache: "no-store", redirect: "error",
        headers: headers({ "Content-Type": file.mime_type, "x-upsert": "false" }), body: file.file
      });
    } catch (error) { if(error?.code==="SESSION_EXPIRED")throw error; throw Object.assign(fail(`อัปโหลดรูป ${file.original_name} ไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ต`, "NETWORK_ERROR"), { cause: error, fileName: file.original_name }); }
    if (response.status === 409) {
      await verifyExistingUpload(file);
      return { created: false };
    }
    await readJson(response, `อัปโหลดรูป ${file.original_name} ไม่สำเร็จ`);
    return { created: true };
  }
  async function verifyExistingUpload(file) {
    let response;
    try {
      response = await fetch(`${base}/storage/v1/object/authenticated/${BUCKET}/${encodePath(file.path)}`, {
        method: "GET", cache: "no-store", redirect: "error",
        headers: headers({ Accept: file.mime_type })
      });
    } catch (error) {
      if (error?.code === "SESSION_EXPIRED") throw error;
      throw Object.assign(fail(`ตรวจรูปเดิม ${file.original_name} ไม่สำเร็จ กรุณาลองใหม่`, "NETWORK_ERROR"), { cause: error, fileName: file.original_name });
    }
    if (!response.ok) {
      if (response.status === 401) throw fail("Session หมดอายุ กรุณาเข้าสู่ระบบ LINE อีกครั้ง", "SESSION_EXPIRED");
      if (response.status === 403) throw fail("ไม่มีสิทธิ์ตรวจรูปเดิม กรุณาติดต่อผู้ดูแล", "PERMISSION_DENIED");
      throw fail(`พบไฟล์เดิมแต่ตรวจเนื้อหารูป ${file.original_name} ไม่ได้`, "ATTACHMENT_CONFLICT");
    }
    let bytes;
    try { bytes = await response.arrayBuffer(); }
    catch (cause) { throw Object.assign(fail(`อ่านรูปเดิม ${file.original_name} ไม่ครบ กรุณาลองใหม่`, "NETWORK_ERROR"), { cause, fileName: file.original_name }); }
    const mime = (response.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
    const sha256 = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(byte => byte.toString(16).padStart(2, "0")).join("");
    if (bytes.byteLength !== file.byte_size || mime !== file.mime_type || sha256 !== file.sha256) {
      throw fail(`ไฟล์เดิม ${file.original_name} ไม่ตรงกับรูปที่เลือก กรุณาติดต่อผู้ดูแลก่อนส่งซ้ำ`, "ATTACHMENT_CONFLICT");
    }
    return true;
  }
  async function removeStaged(paths, requestId) {
    if (!paths.length) return;
    try {
      const tracked=await rpc("ot_cleanup_track",{p_request_id:requestId,p_paths:paths,p_failure:"รอตรวจและล้างไฟล์ที่ยังไม่ผูกกับรายงาน"});
      if(Number(tracked)!==paths.length)throw new Error("บางไฟล์มีรายการอ้างอิงอยู่แล้ว");
    } catch(error) { throw fail(`ติดตามไฟล์ค้างไม่ได้ (${error.message}) กรุณาตรวจรายการเดิม`,"CLEANUP_UNTRACKED"); }
    try {
      const response = await fetch(`${base}/storage/v1/object/${BUCKET}`, {
        method: "DELETE", cache: "no-store", redirect: "error",
        headers: headers({ "Content-Type": "application/json", Accept: "application/json" }),
        body: JSON.stringify({ prefixes: paths })
      });
      await readJson(response, "ล้างรูปที่ยังไม่ได้ผูกกับรายงานไม่สำเร็จ");
      const confirmed=await rpc("ot_cleanup_confirm",{p_paths:paths});
      if(Number(confirmed)!==paths.length)throw new Error("ยังมีไฟล์หรือข้อมูลอ้างอิงค้างอยู่");
    } catch (error) {
      throw fail("บันทึกรายงานไม่สำเร็จ ระบบติดตามไฟล์ที่ต้องล้างไว้แล้ว กรุณาลองอีกครั้ง", "CLEANUP_QUEUED");
    }
  }
  async function existingSubmission(requestId, input, files) {
    const existing = await rpc("ot_submission_verify", {
      p_request_id:requestId,p_date:input.date,p_duration_minutes:input.duration_minutes,
      p_details:input.details,p_group_name:input.group_name,p_files:filePayload(files)
    });
    if (!existing) return null;
    if (existing.audit_verified !== true) throw fail("ตรวจ Audit ของรายงานไม่สำเร็จ กรุณาลองตรวจรายการเดิมอีกครั้ง", "AUDIT_READBACK_FAILED");
    return existing;
  }
  async function signedImage(path, {signal}={}) {
    let response;
    try {
      response = await fetch(`${base}/storage/v1/object/sign/${BUCKET}/${encodePath(path)}`, {
        method: "POST", cache: "no-store", redirect: "error",
        headers: headers({ "Content-Type": "application/json", Accept: "application/json" }),
        body: JSON.stringify({ expiresIn: 1800 }), signal
      });
    } catch (error) { if(error?.code==="SESSION_EXPIRED")throw error; throw Object.assign(fail("เปิดรูปหลักฐานไม่ได้ กรุณาลองใหม่", "NETWORK_ERROR"), { cause:error }); }
    const result = await readJson(response, "ไม่มีสิทธิ์เปิดรูปหลักฐานนี้");
    const signed = result?.signedURL || result?.signedUrl;
    if (!signed) throw fail("Supabase ไม่คืนลิงก์รูปที่มีสิทธิ์", "STORAGE_READ_ERROR");
    if (/^https?:\/\//i.test(signed)) return signed;
    if (signed.startsWith("/storage/v1/")) return base + signed;
    return `${base}/storage/v1${signed.startsWith("/") ? "" : "/"}${signed}`;
  }
  const filePayload = files => files.map(({path,original_name,mime_type,byte_size,sha256})=>({path,original_name,mime_type,byte_size,sha256}));
  const editPayload = (input,requestId,files) => ({p_id:input.id,p_expected_version:input.expected_version,p_request_id:requestId,
    p_date:input.date,p_duration_minutes:input.duration_minutes,p_details:input.details,p_keep_paths:input.keep_paths,p_files:filePayload(files)});
  async function cleanupRetired(paths) {
    if (!paths.length) return true;
    try {
      const response=await fetch(`${base}/storage/v1/object/${BUCKET}`,{method:"DELETE",cache:"no-store",redirect:"error",
        headers:headers({"Content-Type":"application/json",Accept:"application/json"}),body:JSON.stringify({prefixes:paths})});
      await readJson(response,"ล้างรูปเดิมไม่สำเร็จ");
      const confirmed=await rpc("ot_cleanup_confirm",{p_paths:paths});
      if(Number(confirmed)!==paths.length)throw new Error("ยังมีไฟล์หรือข้อมูลอ้างอิงค้างอยู่");
      return true;
    } catch { return false; } // The edit RPC has already queued these paths transactionally.
  }
  async function confirmEdit(requestId,input,files) {
    const resolved=await rpc("ot_edit_resolve",{p_request_id:requestId});
    if(!resolved)return null;
    if(resolved.audit_verified!==true||resolved.record_id!==input.id||Number(resolved.version)!==input.expected_version+1)
      throw fail("ตรวจ Audit หรือรุ่นของการแก้ไขไม่สำเร็จ", "AUDIT_READBACK_FAILED");
    const saved=await rpc("ot_report_edit",editPayload(input,requestId,files));
    if(!saved || saved.audit_verified!==true || saved.record_id!==input.id || Number(saved.version)!==Number(resolved.version))
      throw fail("ตรวจผลการแก้ไขไม่สำเร็จ", "READBACK_FAILED");
    const report=await rpc("ot_report_detail",{p_id:input.id});
    const expectedPaths=[...input.keep_paths,...files.map(file=>file.path)].sort();
    const actualPaths=(report?.attachments||[]).map(file=>file.path).sort();
    if(!report || !Number.isSafeInteger(Number(report.version)) || Number(report.version)<Number(saved.version))
      throw fail("ตรวจรุ่นรายงานที่บันทึกไม่สำเร็จ", "READBACK_FAILED");
    const superseded=Number(report.version)>Number(saved.version);
    if(!superseded && (report.date!==input.date ||
      Number(report.duration_minutes)!==input.duration_minutes || report.details!==input.details ||
      JSON.stringify(expectedPaths)!==JSON.stringify(actualPaths)))
      throw fail("บันทึกแล้วแต่ข้อมูลเปลี่ยนระหว่างตรวจ กรุณาเปิดรายละเอียดล่าสุด", "READBACK_FAILED");
    return {report,removed_paths:saved.removed_paths||[],superseded};
  }
  return {
    async history({ from, to, limit = 25, offset = 0, scope = "self" }) {
      const name = scope === "admin" ? "ot_report_history_admin" : "ot_report_history";
      return rpc(name, { p_from: from, p_to: to, p_limit: limit, p_offset: offset });
    },
    async detail(id, scope = "self", options = {}) {
      const name = scope === "admin" ? "ot_report_detail_admin" : scope === "manager" ? "ot_report_detail_manager" : "ot_report_detail";
      const report = await rpc(name, { p_id: id }, options);
      options.onPhase?.((report.attachments || []).length ? "กำลังโหลดรูปหลักฐาน…" : "กำลังโหลดรายละเอียด OT…");
      const settled = await Promise.allSettled((report.attachments || []).map(file => signedImage(file.path, options)));
      const attachments = (report.attachments || []).map((file, index) => settled[index].status === "fulfilled"
        ? { ...file, signed_url: settled[index].value, image_error: false }
        : { ...file, signed_url: "", image_error: true });
      return { ...report, attachments };
    },
    async recover(ownerId) {
      if (!ownerId || !crypto?.subtle) throw fail("ไม่พบ Session สำหรับตรวจรายงานเดิม", "SESSION_EXPIRED");
      const attemptKey = `factory-pwa-ot-attempt:${ownerId}`;
      let attempt, input;
      try { attempt = JSON.parse(sessionStorage.getItem(attemptKey) || "null"); if (attempt) input = JSON.parse(attempt.signature); }
      catch { throw fail("ข้อมูลการส่งเดิมเสียหาย กรุณาติดต่อผู้ดูแลเพื่อตรวจรายงาน", "RECOVERY_ERROR"); }
      if (!attempt) return { state:"none" };
      if (!/^[0-9a-f-]{36}$/i.test(attempt.requestId || "") || !input || !/^\d{4}-\d{2}-\d{2}$/.test(input.date || "") || !Number.isInteger(input.duration_minutes) || input.duration_minutes<1 || input.duration_minutes>779 || typeof input.details!=="string" || input.details.length<5 || input.details.length>1000 || !["สกรีน","ผลิต","ขนส่ง"].includes(input.group_name) || !Array.isArray(input.files) || input.files.length > MAX_FILES)
        throw fail("ข้อมูลการส่งเดิมไม่สมบูรณ์ กรุณาติดต่อผู้ดูแลเพื่อตรวจรายงาน", "RECOVERY_ERROR");
      const files = await filesFromSignature(input.files,ownerId,attempt.requestId);
      const saved = await existingSubmission(attempt.requestId,input,files);
      if (saved) { sessionStorage.removeItem(attemptKey); return {state:"saved",report:saved}; }
      return {state:"pending",date:input.date,duration_minutes:input.duration_minutes,details:input.details,group_name:input.group_name,file_names:input.files.map(file=>file.name)};
    },
    async abandon(ownerId) {
      if(!ownerId)throw fail("ไม่พบ Session สำหรับยกเลิกรายการค้าง","SESSION_EXPIRED");
      const key=`factory-pwa-ot-attempt:${ownerId}`;
      let attempt,input;
      try{attempt=JSON.parse(sessionStorage.getItem(key)||"null");if(attempt)input=JSON.parse(attempt.signature);}catch{throw fail("ข้อมูลรายการค้างเสียหาย กรุณาตรวจประวัติก่อน","RECOVERY_ERROR");}
      if(!attempt||!/^[0-9a-f-]{36}$/i.test(attempt.requestId||"")||!input||!Array.isArray(input.files))throw fail("ไม่พบรายการส่งค้างที่ยกเลิกได้","NOT_FOUND");
      const files=await filesFromSignature(input.files,ownerId,attempt.requestId);
      const result=await rpc("ot_submission_abort",{p_request_id:attempt.requestId});
      if(result?.state==="saved"){
        const report=await existingSubmission(attempt.requestId,input,files);
        if(!report)throw fail("พบรายงานเดิม แต่ตรวจ Audit ไม่สำเร็จ กรุณาเปิดประวัติก่อน","READBACK_FAILED");
        sessionStorage.removeItem(key);
        return {state:"saved",report};
      }
      if(result?.state!=="aborted")throw fail("ยังยืนยันการยกเลิกรายการค้างไม่ได้","ABORT_UNCONFIRMED");
      let cleanupPending=false;
      try{await removeStaged(files.map(file=>file.path),attempt.requestId);}catch(error){
        if(error.code==="CLEANUP_UNTRACKED")throw error;
        cleanupPending=true;
      }
      if(!cleanupPending)sessionStorage.removeItem(key);
      return {state:"aborted",cleanupPending};
    },
    async recoverEdit(ownerId) {
      if(!ownerId || !crypto?.subtle) throw fail("ไม่พบ Session สำหรับตรวจการแก้ไขเดิม","SESSION_EXPIRED");
      const key=`factory-pwa-ot-edit-attempt:${ownerId}`;
      let attempt,input;
      try {attempt=JSON.parse(sessionStorage.getItem(key)||"null");if(attempt)input=JSON.parse(attempt.signature);}
      catch {throw fail("ข้อมูลการแก้ไขเดิมเสียหาย กรุณาติดต่อผู้ดูแล","RECOVERY_ERROR");}
      if(!attempt)return {state:"none"};
      if(!/^[0-9a-f-]{36}$/i.test(attempt.requestId||"") || !input || !/^[0-9a-f-]{36}$/i.test(input.id||"") ||
        !Number.isSafeInteger(input.expected_version)||input.expected_version<0||!/^\d{4}-\d{2}-\d{2}$/.test(input.date||"")||
        !Number.isInteger(input.duration_minutes)||input.duration_minutes<1||input.duration_minutes>779||
        typeof input.details!=="string"||input.details.length<5||input.details.length>1000||!Array.isArray(input.keep_paths)||
        input.keep_paths.length+input.files?.length>MAX_FILES)
        throw fail("ข้อมูลการแก้ไขเดิมไม่สมบูรณ์ กรุณาติดต่อผู้ดูแล","RECOVERY_ERROR");
      const files=await filesFromSignature(input.files,ownerId,attempt.requestId);
      const confirmed=await confirmEdit(attempt.requestId,input,files);
      if(confirmed){
        const cleanupDone=await cleanupRetired(confirmed.removed_paths);
        if(cleanupDone)sessionStorage.removeItem(key);
        return {state:"saved",report:confirmed.report,cleanupPending:!cleanupDone,superseded:confirmed.superseded};
      }
      const report=await rpc("ot_report_detail",{p_id:input.id});
      if(Number(report.version)!==input.expected_version){
        const late=await confirmEdit(attempt.requestId,input,files);
        if(late){const done=await cleanupRetired(late.removed_paths);if(done)sessionStorage.removeItem(key);return {state:"saved",report:late.report,cleanupPending:!done,superseded:late.superseded};}
        await removeStaged(files.map(file=>file.path),attempt.requestId);
        sessionStorage.removeItem(key);
        return {state:"conflict"};
      }
      report.attachments=await Promise.all((report.attachments||[]).map(async file=>({...file,signed_url:await signedImage(file.path)})));
      return {state:"pending",...input,report,file_names:input.files.map(file=>file.name)};
    },
    async abandonEdit(ownerId) {
      if(!ownerId)throw fail("ไม่พบ Session สำหรับยกเลิกรายการแก้ไขค้าง","SESSION_EXPIRED");
      const key=`factory-pwa-ot-edit-attempt:${ownerId}`;
      let attempt,input;
      try{attempt=JSON.parse(sessionStorage.getItem(key)||"null");if(attempt)input=JSON.parse(attempt.signature);}catch{throw fail("ข้อมูลรายการแก้ไขค้างเสียหาย กรุณาตรวจประวัติก่อน","RECOVERY_ERROR");}
      if(!attempt)return {state:"none"};
      if(!/^[0-9a-f-]{36}$/i.test(attempt.requestId||"")||!input||!/^[0-9a-f-]{36}$/i.test(input.id||"")||!Array.isArray(input.files))throw fail("ข้อมูลรายการแก้ไขค้างไม่สมบูรณ์","RECOVERY_ERROR");
      const files=await filesFromSignature(input.files,ownerId,attempt.requestId);
      const result=await rpc("ot_edit_abort",{p_request_id:attempt.requestId,p_record_id:input.id});
      if(result?.state==="saved"){
        const confirmed=await confirmEdit(attempt.requestId,input,files);
        if(!confirmed)throw fail("พบการแก้ไขเดิม แต่ตรวจ Audit ไม่สำเร็จ กรุณาเปิดรายงานล่าสุดก่อน","READBACK_FAILED");
        const done=await cleanupRetired(confirmed.removed_paths);if(done)sessionStorage.removeItem(key);
        return {state:"saved",report:confirmed.report,cleanupPending:!done,superseded:confirmed.superseded};
      }
      if(result?.state!=="aborted")throw fail("ยังยืนยันการยกเลิกรายการแก้ไขไม่ได้","ABORT_UNCONFIRMED");
      let cleanupPending=false;
      try{await removeStaged(files.map(file=>file.path),attempt.requestId);}catch(error){if(error.code==="CLEANUP_UNTRACKED")throw error;cleanupPending=true;}
      if(!cleanupPending)sessionStorage.removeItem(key);
      return {state:"aborted",cleanupPending};
    },
    async edit(input) {
      if(!crypto?.subtle||!input.owner_id)throw fail("ไม่พบ Session สำหรับแก้รายงาน","SESSION_EXPIRED");
      if(!Array.isArray(input.keep_attachments)||!Array.isArray(input.files)||
        input.keep_attachments.length+input.files.length>MAX_FILES)throw fail("แนบรูปได้ไม่เกิน 5 รูป","VALIDATION_ERROR");
      let total=0;
      for(const file of input.keep_attachments){if(!file.path||!Number.isInteger(file.byte_size)||file.byte_size<1||file.byte_size>MAX_FILE_BYTES)throw fail("ข้อมูลรูปเดิมไม่ถูกต้อง","VALIDATION_ERROR");total+=file.byte_size;}
      const hashes=[];
      for(const file of input.files){
        if(!(file instanceof File)||!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size<1||file.size>MAX_FILE_BYTES)throw fail(`รูป ${file.name||""} ไม่รองรับหรือเกิน 512 KB`,"VALIDATION_ERROR");
        total+=file.size;hashes.push(await hashFile(file));
      }
      if(total>MAX_TOTAL_BYTES)throw fail("รูปทั้งหมดรวมกันต้องไม่เกิน 2 MB","VALIDATION_ERROR");
      const payload={id:input.id,expected_version:input.expected_version,date:input.date,duration_minutes:input.duration_minutes,details:input.details,
        keep_paths:input.keep_attachments.map(file=>file.path).sort(),files:input.files.map((file,index)=>({name:file.name,type:file.type,size:file.size,sha256:hashes[index]}))};
      const signature=JSON.stringify(payload),key=`factory-pwa-ot-edit-attempt:${input.owner_id}`;
      let attempt;try{attempt=JSON.parse(sessionStorage.getItem(key)||"null");}catch{}
      if(attempt&&attempt.signature!==signature)throw fail("มีการแก้ไขชุดเดิมที่ยังต้องตรวจผล กรุณาตรวจรายการส่งค้างก่อน","IDEMPOTENCY_CONFLICT");
      if(!attempt){const requestId=crypto.randomUUID?.();if(!requestId)throw fail("สร้างรหัสป้องกันการส่งซ้ำไม่ได้","UNSUPPORTED_BROWSER");attempt={requestId,signature};sessionStorage.setItem(key,JSON.stringify(attempt));}
      const files=await normalizeFiles(input.files,input.owner_id,attempt.requestId,hashes);
      const prior=await confirmEdit(attempt.requestId,payload,files);
      if(prior){const done=await cleanupRetired(prior.removed_paths);if(done)sessionStorage.removeItem(key);return {report:prior.report,cleanupPending:!done,superseded:prior.superseded};}
      let acknowledged=false;
      try{
        for(const file of files)await upload(file);
        await rpc("ot_report_edit",editPayload(payload,attempt.requestId,files));acknowledged=true;
        const confirmed=await confirmEdit(attempt.requestId,payload,files);
        if(!confirmed)throw fail("ตรวจผลการแก้ไขไม่สำเร็จ","READBACK_FAILED");
        const done=await cleanupRetired(confirmed.removed_paths);if(done)sessionStorage.removeItem(key);
        return {report:confirmed.report,cleanupPending:!done,superseded:confirmed.superseded};
      }catch(error){
        if(acknowledged)throw Object.assign(fail("บันทึกการแก้ไขแล้ว แต่ตรวจข้อมูลกลับไม่สำเร็จ กรุณาตรวจรายการเดิม","READBACK_FAILED"),{cause:error});
        if(error.code==="NETWORK_ERROR"){
          try{const confirmed=await confirmEdit(attempt.requestId,payload,files);if(confirmed){const done=await cleanupRetired(confirmed.removed_paths);if(done)sessionStorage.removeItem(key);return {report:confirmed.report,cleanupPending:!done,superseded:confirmed.superseded};}}
          catch(resolveError){if(resolveError.code==="IDEMPOTENCY_CONFLICT")throw resolveError;}
          throw error;
        }
        let cleanupFailed=false;
        await removeStaged(files.map(file=>file.path),attempt.requestId).catch(cleanupError=>{cleanupFailed=true;error.message=`${error.message}. ${cleanupError.message}`;});
        if(!cleanupFailed&&error.code!=="IDEMPOTENCY_CONFLICT")sessionStorage.removeItem(key);
        throw error;
      }
    },
    async submit(input) {
      if (!crypto?.subtle) throw fail("เบราว์เซอร์นี้ยังเตรียมข้อมูลรูปอย่างปลอดภัยไม่ได้", "UNSUPPORTED_BROWSER");
      if (!input.owner_id) throw fail("ไม่พบพนักงานที่เข้าสู่ระบบ กรุณาเข้าสู่ระบบใหม่", "SESSION_EXPIRED");
      const rawFiles = input.files || [];
      if (!Array.isArray(rawFiles) || rawFiles.length > MAX_FILES) throw fail("แนบรูปได้ไม่เกิน 5 รูป", "VALIDATION_ERROR");
      const hashes = [];
      let preparedBytes = 0;
      for (const file of rawFiles) {
        if (!(file instanceof File) || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw fail("รองรับเฉพาะรูป JPG, PNG และ WebP; GIF แบบเคลื่อนไหวยังไม่รองรับ", "VALIDATION_ERROR");
        if (file.size < 1 || file.size > MAX_FILE_BYTES) throw fail(`รูป ${file.name} มีขนาดหลังเตรียมเกิน 512 KB`, "VALIDATION_ERROR");
        preparedBytes += file.size;
        if (preparedBytes > MAX_TOTAL_BYTES) throw fail("รูปทั้งหมดรวมกันต้องไม่เกิน 2 MB", "VALIDATION_ERROR");
        hashes.push(await hashFile(file));
      }
      const signature = JSON.stringify({ date:input.date, duration_minutes:input.duration_minutes, details:input.details,
        group_name:input.group_name, files:rawFiles.map((file,index)=>({name:file.name,type:file.type,size:file.size,sha256:hashes[index]})) });
      const attemptKey = `factory-pwa-ot-attempt:${input.owner_id}`;
      let attempt;
      try { attempt = JSON.parse(sessionStorage.getItem(attemptKey) || "null"); } catch {}
      if (attempt && attempt.signature !== signature) throw fail("มีการส่ง OT ชุดเดิมที่ยังต้องตรวจผล กรุณาคงข้อมูลเดิมแล้วลองใหม่ก่อนเริ่มรายการอื่น", "IDEMPOTENCY_CONFLICT");
      if (!attempt) {
        const requestId = crypto.randomUUID?.() || `${crypto.randomUUID?.() || ""}`;
        if (!requestId) throw fail("สร้างรหัสป้องกันการส่งซ้ำไม่ได้ กรุณาอัปเดตเบราว์เซอร์", "UNSUPPORTED_BROWSER");
        attempt = { requestId, signature };
        sessionStorage.setItem(attemptKey, JSON.stringify(attempt));
      }
      const requestId = attempt.requestId;
      const files = await normalizeFiles(rawFiles, input.owner_id, requestId, hashes);
      const prior = await existingSubmission(requestId, input, files);
      if (prior) { sessionStorage.removeItem(attemptKey); return prior; }
      let writeAcknowledged = false;
      try {
        for (const file of files) {
          await upload(file);
        }
        const saved = await rpc("ot_report_submit", {
          p_request_id: requestId, p_date: input.date, p_duration_minutes: input.duration_minutes,
          p_details: input.details, p_group_name: input.group_name,
          p_files: files.map(({ path, original_name, mime_type, byte_size, sha256 }) => ({ path, original_name, mime_type, byte_size, sha256 }))
        });
        writeAcknowledged = true;
        const confirmed = await existingSubmission(requestId, input, files);
        if (!confirmed || confirmed.id !== saved.id) throw fail("บันทึกแล้วแต่ตรวจข้อมูลกลับไม่สำเร็จ กรุณาตรวจประวัติก่อนส่งซ้ำ", "READBACK_FAILED");
        sessionStorage.removeItem(attemptKey);
        return confirmed;
      } catch (error) {
        if (writeAcknowledged) {
          throw Object.assign(fail("บันทึกรายงานแล้ว แต่ตรวจข้อมูลกลับไม่สำเร็จ กรุณาลองตรวจรายการเดิมอีกครั้ง", "READBACK_FAILED"), { cause: error });
        }
        if (error.code === "NETWORK_ERROR") {
          try {
            const resolved = await existingSubmission(requestId, input, files);
            if (resolved) { sessionStorage.removeItem(attemptKey); return resolved; }
          } catch (resolveError) { if (resolveError.code === "IDEMPOTENCY_CONFLICT") throw resolveError; }
          // Keep staged files and the request id so retry can resolve the uncertain write.
          throw error;
        }
        let cleanupFailed=false;
        await removeStaged(files.map(file=>file.path), requestId).catch(cleanupError => { cleanupFailed=true; error.message = `${error.message}. ${cleanupError.message}`; });
        if (!cleanupFailed && error.code !== "IDEMPOTENCY_CONFLICT") sessionStorage.removeItem(attemptKey);
        throw error;
      }
    }
  };
}
