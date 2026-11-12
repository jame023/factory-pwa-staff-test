const BUCKET = "factory-record-attachments";
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_FILES = 10;
const fail = (message, code = "DELIVERY_API_ERROR") => Object.assign(new Error(message), { code });
const encodePath = path => path.split("/").map(encodeURIComponent).join("/");

export function normalizeDeliveryBillNumber(value) {
  const bill = String(value ?? "").trim().toUpperCase();
  if (!/^SD[0-9]{9}$/.test(bill)) throw fail("เลขที่บิลต้องเป็น SD ตามด้วยตัวเลข 9 หลัก", "VALIDATION_ERROR");
  return bill;
}

export function normalizeDeliveryEventAt(value) {
  const local = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(local))
    throw fail("วันที่และเวลาขนส่งไม่ถูกต้อง", "VALIDATION_ERROR");
  const withSeconds = local.length === 16 ? `${local}:00` : local;
  const date = new Date(`${withSeconds}+07:00`);
  const parts = Number.isFinite(date.getTime()) ? Object.fromEntries(new Intl.DateTimeFormat("en-CA", {timeZone:"Asia/Bangkok", year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", second:"2-digit", hourCycle:"h23"}).formatToParts(date).map(part=>[part.type,part.value])) : {};
  const actual = `${parts.year||""}-${parts.month||""}-${parts.day||""}T${parts.hour||""}:${parts.minute||""}:${parts.second||""}`;
  if (!Number.isFinite(date.getTime()) || actual !== withSeconds)
    throw fail("วันที่และเวลาขนส่งไม่ถูกต้อง", "VALIDATION_ERROR");
  return date.toISOString();
}

export async function deriveDeliveryRequestId(ownerId,input,files) {
  const descriptors=[];
  for(const file of files||[])descriptors.push({name:file.name,type:file.type,size:file.size,sha256:await sha256Bytes(file)});
  const canonical=JSON.stringify({ownerId,itemNameId:input.itemNameId||"",billNumber:normalizeDeliveryBillNumber(input.billNumber),
    quantity:String(Number(input.quantity)),eventAt:normalizeDeliveryEventAt(input.dateTime),files:descriptors});
  const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(canonical))).slice(0,16);
  digest[6]=(digest[6]&0x0f)|0x50;digest[8]=(digest[8]&0x3f)|0x80;
  const hex=[...digest].map(value=>value.toString(16).padStart(2,"0")).join("");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

async function sha256Bytes(file) {
  const hash=await crypto.subtle.digest("SHA-256",await file.arrayBuffer());
  return [...new Uint8Array(hash)].map(value=>value.toString(16).padStart(2,"0")).join("");
}

function fileExtension(mime) {
  return mime === "image/jpeg" ? "jpg" : mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : null;
}

export function createDeliveryService({ url, key, token: initialToken, getToken }) {
  const base = String(url || "").replace(/\/$/, "");
  const boundToken = initialToken || (typeof getToken === "function" ? getToken() : "");
  const accessToken = () => {
    const current = typeof getToken === "function" ? getToken() : boundToken;
    if (!boundToken || !current || current !== boundToken) throw fail("Session เปลี่ยนหรือหมดอายุ กรุณาเข้าสู่ระบบและตรวจรายการเดิม", "SESSION_EXPIRED");
    return boundToken;
  };
  const ownerId = () => {
    try { const part=accessToken().split(".")[1];return JSON.parse(atob(part.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(part.length/4)*4,"="))).app_metadata?.employee_id || ""; }
    catch { throw fail("Session บัญชีไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่", "SESSION_EXPIRED"); }
  };
  const headers = extra => ({ apikey:key, Authorization:`Bearer ${accessToken()}`, ...extra });

  async function readJson(response, fallback) {
    let raw;
    try { raw = await response.text(); }
    catch (cause) { throw Object.assign(fail("ได้รับผลจาก Supabase ไม่ครบ กรุณาตรวจรายการเดิมก่อนลองซ้ำ", "NETWORK_ERROR"), { cause }); }
    let value = null; try { value = raw ? JSON.parse(raw) : null; } catch {}
    if (response.status === 401) throw fail("Session หมดอายุ กรุณาเข้าสู่ระบบ LINE อีกครั้ง", "SESSION_EXPIRED");
    if (response.status === 403 || response.status === 42501) throw fail("ไม่มีสิทธิ์ดำเนินการ", "PERMISSION_DENIED");
    if (!response.ok) {
      const message = String(value?.message || value?.error || fallback);
      if (/DELIVERY_(?:REQUEST|EDIT)_CONFLICT/.test(message) || value?.code === "40001") throw fail("รายการเปลี่ยนแปลงจากหน้าอื่น กรุณาโหลดประวัติใหม่", "CONFLICT");
      if (value?.code === "PGRST202") throw fail("ระบบบันทึกการขนส่งยังไม่ได้ติดตั้งบน Supabase", "BACKEND_NOT_READY");
      throw fail(message, value?.code || "DELIVERY_API_ERROR");
    }
    return value;
  }

  async function rpc(name, body) {
    let response;
    try {
      response = await fetch(`${base}/rest/v1/rpc/${name}`, { method:"POST", cache:"no-store", redirect:"error",
        headers:headers({ "Content-Type":"application/json", Accept:"application/json" }), body:JSON.stringify(body) });
    } catch (cause) { if (cause?.code === "SESSION_EXPIRED") throw cause; throw Object.assign(fail("เชื่อมต่อ Supabase ไม่ได้ กรุณาตรวจอินเทอร์เน็ต", "NETWORK_ERROR"), { cause }); }
    return readJson(response, "เรียกข้อมูลการขนส่งไม่สำเร็จ");
  }

  async function sha256(file) {
    const hash = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    return [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, "0")).join("");
  }

  async function prepareFiles(files, requestId) {
    if (!Array.isArray(files) || files.length < 1 || files.length > MAX_FILES) throw fail("แนบรูปหลักฐาน 1–10 รูป", "VALIDATION_ERROR");
    const result = [];
    for (const [index, file] of files.entries()) {
      const extension = fileExtension(file?.type);
      if (!(file instanceof File) || !extension || file.size < 1 || file.size > MAX_FILE_BYTES)
        throw fail(`รูป ${file?.name || "ที่เลือก"} ต้องเป็น JPG, PNG หรือ WebP และหลังบีบอัดไม่เกิน 1 MB`, "VALIDATION_ERROR");
      const digest = await sha256(file);
      const seed = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${requestId}|${index}|${file.name}|${digest}`));
      const hex = [...new Uint8Array(seed)].slice(0,16).map(value => value.toString(16).padStart(2,"0")).join("");
      const id = `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
      result.push({ file, path:`deliveries/${ownerId()}/${requestId}/${id}.${extension}`, original_name:file.name.slice(0,120), mime_type:file.type, byte_size:file.size, sha256:digest });
    }
    return result;
  }

  const metadataFor = files => files.map(({path,original_name,mime_type,byte_size,sha256}) => ({path,original_name,mime_type,byte_size,sha256}));

  async function upload(file) {
    let response;
    try { response = await fetch(`${base}/storage/v1/object/${BUCKET}/${encodePath(file.path)}`, {
      method:"POST", cache:"no-store", redirect:"error", headers:headers({ "Content-Type":file.mime_type, "x-upsert":"false" }), body:file.file }); }
    catch (cause) { if (cause?.code === "SESSION_EXPIRED") throw cause; throw Object.assign(fail(`อัปโหลดรูป ${file.original_name} ไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ต`, "NETWORK_ERROR"), { cause }); }
    if (response.status === 409) {
      let existing;
      try { existing = await fetch(`${base}/storage/v1/object/authenticated/${BUCKET}/${encodePath(file.path)}`, { cache:"no-store", redirect:"error", headers:headers({ Accept:file.mime_type }) }); }
      catch (cause) { throw Object.assign(fail(`ตรวจรูปเดิม ${file.original_name} ไม่สำเร็จ`, "NETWORK_ERROR"), { cause }); }
      if (!existing.ok) throw fail(`พบรูปเดิม ${file.original_name} แต่ตรวจสอบไม่ได้`, "ATTACHMENT_CONFLICT");
      const bytes = await existing.arrayBuffer();
      if (bytes.byteLength !== file.byte_size || (existing.headers.get("Content-Type") || "").split(";")[0] !== file.mime_type || await sha256(new File([bytes], file.original_name, {type:file.mime_type})) !== file.sha256)
        throw fail(`รูปเดิม ${file.original_name} ไม่ตรงกับข้อมูลที่ส่ง`, "ATTACHMENT_CONFLICT");
      return;
    }
    await readJson(response, `อัปโหลดรูป ${file.original_name} ไม่สำเร็จ`);
  }

  async function signedImage(path) {
    const response = await fetch(`${base}/storage/v1/object/sign/${BUCKET}/${encodePath(path)}`, { method:"POST", cache:"no-store", redirect:"error",
      headers:headers({ "Content-Type":"application/json", Accept:"application/json" }), body:JSON.stringify({ expiresIn:1800 }) });
    const signed = await readJson(response, "ไม่มีสิทธิ์เปิดรูปหลักฐานนี้");
    const url = signed?.signedURL || signed?.signedUrl;
    if (!url) throw fail("Supabase ไม่คืนลิงก์รูปที่มีสิทธิ์", "STORAGE_READ_ERROR");
    return /^https?:\/\//i.test(url) ? url : `${base}${url.startsWith("/storage/v1/") ? "" : "/storage/v1"}${url.startsWith("/") ? "" : "/"}${url}`;
  }

  async function cleanup(requestId, paths) {
    if (!paths.length) return;
    const tracked = await rpc("delivery_abort", { p_request_id:requestId, p_paths:paths });
    if (Number(tracked) === 0) return; // The request was already committed; never delete referenced files.
    const response = await fetch(`${base}/storage/v1/object/${BUCKET}`, { method:"DELETE", cache:"no-store", redirect:"error",
      headers:headers({ "Content-Type":"application/json", Accept:"application/json" }), body:JSON.stringify({ prefixes:paths }) });
    await readJson(response, "ล้างไฟล์ที่ยังไม่ผูกกับรายการไม่สำเร็จ");
    const confirmed = await rpc("delivery_cleanup_confirm", { p_paths:paths });
    if (Number(confirmed) < 1) throw fail("ไฟล์ที่อัปโหลดบางส่วนยังคงค้างอยู่", "CLEANUP_PENDING");
  }

  async function detail(id) {
    const row = await rpc("delivery_detail", { p_id:id });
    if (!row || row.id !== id) throw fail("ไม่พบรายการขนส่ง", "NOT_FOUND");
    if (row.audit_verified !== true) throw fail("อ่านรายการได้แต่ตรวจ Audit ไม่ครบ กรุณาตรวจรายการเดิมก่อน", "AUDIT_READBACK_FAILED");
    const attachments = await Promise.all((row.attachments || []).map(async file => ({ ...file, signed_url:await signedImage(file.path) })));
    return { ...row, attachments };
  }

  return {
    options: async () => rpc("delivery_options", {}),
    history: filters => rpc("delivery_history", { p_query:filters.query || "", p_from:filters.from || null, p_to:filters.to || null,
      p_status:filters.status || null, p_limit:filters.limit || 25, p_offset:filters.offset || 0 }),
    detail,
    async create(input, files, requestId, onPhase=()=>{}) {
      onPhase("กำลังตรวจสอบข้อมูล");
      const billNumber = normalizeDeliveryBillNumber(input.billNumber);
      const quantity = Number(input.quantity);
      if (!input.itemNameId) throw fail("กรุณาเลือกรายการสินค้า", "VALIDATION_ERROR");
      if (!Number.isFinite(quantity) || quantity <= 0) throw fail("จำนวนต้องเป็นตัวเลขมากกว่า 0", "VALIDATION_ERROR");
      const eventAt = normalizeDeliveryEventAt(input.dateTime);
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId || "")) throw fail("รหัสคำขอไม่ถูกต้อง", "VALIDATION_ERROR");
      onPhase("กำลังเตรียมรูป");
      const uploadFiles = await prepareFiles(files, requestId), metadata = metadataFor(uploadFiles);
      const request = { p_request_id:requestId, p_item_name_id:input.itemNameId, p_bill_number:billNumber, p_quantity:quantity, p_event_at:eventAt, p_files:metadata };
      const prepared = await rpc("delivery_prepare", request);
      if (prepared?.state === "committed" && prepared.id) return detail(prepared.id);
      try {
        for (const [index,file] of uploadFiles.entries()) { onPhase(`กำลังอัปโหลดหลักฐาน ${index+1}/${uploadFiles.length}`); await upload(file); }
      } catch (error) {
        try { await cleanup(requestId, metadata.map(file=>file.path)); }
        catch { throw fail(`${error.message} • มีไฟล์ชั่วคราวที่ต้องติดตามต่อ กรุณาตรวจรายการเดิม`, "CLEANUP_UNCONFIRMED"); }
        throw fail(`${error.message} • ยังไม่มีรายการที่ยืนยันแล้ว กรุณากดบันทึกใหม่เพื่อเริ่มคำขอถัดไป`, "RETRY_NEW_REQUEST");
      }
      let committed;
      onPhase("กำลังบันทึกการขนส่ง");
      try { committed = await rpc("delivery_commit", { p_request_id:requestId }); }
      catch (error) {
        const resolved = await rpc("delivery_resolve", { p_request_id:requestId }).catch(() => null);
        if (resolved?.state === "committed" && resolved.id) return detail(resolved.id);
        try { await cleanup(requestId, metadata.map(file=>file.path)); }
        catch { throw fail("ยังยืนยันผลบันทึกไม่ได้ และระบบติดตามไฟล์ที่ต้องตรวจต่อไว้แล้ว", "CLEANUP_UNCONFIRMED"); }
        throw error;
      }
      if (!committed?.id || committed.request_id !== requestId) throw fail("บันทึกแล้วแต่ยังอ่านผลยืนยันไม่ได้ กรุณาตรวจประวัติเดิมก่อนส่งซ้ำ", "READBACK_REQUIRED");
      const saved = await detail(committed.id);
      if (saved.request_id !== requestId || saved.item_name_id !== input.itemNameId || saved.bill_number !== billNumber || Number(saved.quantity) !== quantity || saved.attachments?.length !== files.length)
        throw fail("บันทึกแล้วแต่ข้อมูลอ่านกลับไม่ตรง กรุณาตรวจรายการเดิม", "READBACK_MISMATCH");
      return saved;
    },
    async cancel(id, expectedVersion) {
      const result = await rpc("delivery_cancel", { p_id:id, p_expected_version:expectedVersion });
      if (!result?.id || result.id !== id || result.status !== "ยกเลิก" || result.audit_verified !== true)
        throw fail("ยังตรวจสอบผลยกเลิกรายการและ Audit ไม่สำเร็จ", "READBACK_MISMATCH");
      return detail(id);
    }
  };
}
