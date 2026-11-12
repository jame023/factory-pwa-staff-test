import { createClient } from '../vendor/supabase-js-2.118.0.js';

export const LEAVE_BUCKET = 'factory-record-attachments';
const RECEIPT_PREFIX = 'factory-leave-operation-v1:';
const failure = (code, message, extra={}) => Object.assign(new Error(message), {code,...extra});
const hex = bytes => [...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,'0')).join('');
const digest = async blob => hex(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()));
export const mapLeave = data => ({...data.record.payload,id:data.record.id,employeeId:data.record.owner_id,category:data.record.category,
  group:data.record.group_name,createdAt:data.record.created_at,updatedAt:data.record.updated_at,
  requestId:data.record.request_id,createdBy:data.record.created_by,updatedBy:data.record.updated_by,reviewerId:data.record.reviewed_by,reviewedAt:data.record.reviewed_at,
  recordReason:data.record.reason,attachments:data.attachments||[],audit:data.audit});

export function createLeaveService({url,key,token,getToken,fetchImpl=fetch,storage:providedStorage}) {
  const current = () => {
    if (!token || getToken()!==token) throw failure('SESSION_CHANGED','บัญชีหรือ Session เปลี่ยนแล้ว กรุณาเปิดหน้านี้ใหม่');
  };
  const storage = providedStorage || createClient(url,key,{accessToken:async()=>{current();return token;},
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}).storage.from(LEAVE_BUCKET);
  async function rpc(name,input={},options={}) {
    current();
    if(options.signal?.aborted)throw new DOMException('การอ่านข้อมูลถูกยกเลิก','AbortError');
    let response;
    try { response=await fetchImpl(url.replace(/\/$/,'')+'/rest/v1/rpc/factory_leave_'+name,{method:'POST',cache:'no-store',redirect:'error',
      headers:{apikey:key,Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(input),signal:options.signal}); }
    catch(cause) {
      if(options.signal?.aborted||cause?.name==='AbortError')throw cause;
      throw failure('NETWORK_ERROR','ไม่สามารถเชื่อมต่อ Supabase ได้ ข้อมูลในฟอร์มยังอยู่',{cause});
    }
    if(options.signal?.aborted)throw new DOMException('การอ่านข้อมูลถูกยกเลิก','AbortError');
    current(); const data=await response.json().catch(()=>null);
    if(!response.ok) {
      const match=/^([A-Z_]+):\s*(.+)$/s.exec(data?.message||'');
      if(match) throw failure(match[1],match[2]);
      if(response.status===401)throw failure('SESSION_EXPIRED','Session หมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง');
      if(response.status===403)throw failure('FORBIDDEN','ไม่มีสิทธิ์อ่านหรือจัดการคำขอนี้');
      if(['PGRST202','42P01','42883'].includes(data?.code))throw failure('NOT_CONFIGURED','ระบบคำขอลายังไม่พร้อมใช้งาน กรุณาติดต่อผู้ดูแล');
      throw failure('API_ERROR','อ่านหรือบันทึกคำขอไม่สำเร็จ กรุณาลองใหม่');
    }
    return data;
  }
  const options=()=>rpc('options');
  const detail=async (id,options={})=>mapLeave(await rpc('get',{p_id:id},options));
  const managerQueuePage=async (filters={},options={})=>rpc('manager_queue_page',{
    p_status:filters.status||'pending',p_group:filters.group||null,p_type:filters.type||null,
    p_query:String(filters.query||'').trim(),p_limit:filters.limit??25,p_offset:filters.offset??0
  },options);
  const managerReportPage=async (filters={},options={})=>rpc('manager_report_page',{
    p_from:filters.from,p_to:filters.to,p_status:filters.status||'all',p_employee_id:filters.employeeId||null,
    p_group:filters.group||null,p_type:filters.type||null,p_query:String(filters.query||'').trim(),
    p_limit:filters.limit??25,p_offset:filters.offset??0
  },options);
  const adminProxySubmit=async ({requestId,employeeId,group,adminReason,input})=>{
    const actor=(await options()).employee_id;
    const {images,...leaveInput}=input||{};
    if(Array.isArray(images)&&images.length)throw failure('VALIDATION_ERROR','การยื่นลาแทนยังไม่รองรับรูปแนบ');
    const result=await rpc('admin_proxy_submit',{p_request_id:requestId,p_employee_id:employeeId,p_group:group,p_input:{...leaveInput,attachments:[]},p_admin_reason:adminReason});
    if(result?.state!=='committed'||!result.id||!result.audit_id)throw failure('INCOMPLETE_WRITE','ยังยืนยันคำขอลาแทนและ Audit ไม่ได้');
    const saved=await detail(result.id);
    if(saved.employeeId!==employeeId||saved.group!==group||saved.requestId!==requestId||saved.createdBy!==actor||saved.updatedBy!==actor||
      saved.audit?.id!==result.audit_id||saved.audit?.actor_employee_id!==actor||saved.status!=='pending'||saved.adminProxy!==true||saved.adminProxyReason!==String(adminReason||'').trim())
      throw failure('READBACK_MISMATCH','ข้อมูลคำขอหรือผู้ยื่นแทนที่อ่านกลับไม่ตรง กรุณาตรวจสอบประวัติก่อนส่งซ้ำ');
    return saved;
  };
  const list=async(scope='self')=>(await rpc('list',{p_scope:scope})).map(mapLeave);
  const historyPage=async({limit=25,offset=0,status='all',from=null,to=null,dateBasis='leave'}={})=>{const page=await rpc('history_page',{p_limit:limit,p_offset:offset,p_status:status,p_from:from,p_to:to,p_date_basis:dateBasis});return {...page,items:(page.items||[]).map(mapLeave)}};
  const receiptKey=(actor,id)=>RECEIPT_PREFIX+actor+':'+id;
  function persist(actor,id,value) {
    try { const old=JSON.parse(sessionStorage.getItem(receiptKey(actor,id))||'{}');sessionStorage.setItem(receiptKey(actor,id),JSON.stringify({...old,...value})); }
    catch { throw failure('RECOVERY_UNAVAILABLE','ไม่สามารถเก็บหมายเลขติดตามการส่งได้ กรุณาอนุญาตพื้นที่เก็บข้อมูลของเว็บไซต์'); }
  }
  function forget(actor,id){sessionStorage.removeItem(receiptKey(actor,id));}
  async function cleanup(paths,actor) {
    const pending=[];
    for(const path of [...new Set(paths||[])]) {
      if(!path.startsWith('leaveRequests/'+actor+'/')) { pending.push(path);continue; }
      try {
        current(); const result=await storage.remove([path]); current();
        if(result.error)throw result.error;
        const check=await storage.download(path);current();
        if(!check.error || ![400,404].includes(Number(check.error.statusCode||check.error.status)))pending.push(path);
      } catch {pending.push(path);}
    }
    return pending;
  }
  async function verify(receipt,expected) {
    if(receipt.state!=='committed'||!receipt.id||!receipt.audit_id)throw failure('INCOMPLETE_WRITE','ยังยืนยันคำขอและ Audit ไม่ได้');
    const current=await detail(receipt.id);
    const saved=receipt.committed_snapshot?mapLeave(receipt.committed_snapshot):current;
    if(!current.audit?.id || !saved.audit?.id || saved.audit.id!==receipt.audit_id || saved.updatedAt!==receipt.updated_at ||
      current.id!==saved.id || current.employeeId!==saved.employeeId)
      throw failure('AUDIT_MISSING','พบคำขอแล้วแต่ยังตรวจสอบ Audit ไม่สำเร็จ กรุณาโหลดประวัติก่อนส่งซ้ำ');
    if(!expected || saved.category!=='leaveRequests'||saved.audit.actor_employee_id!==expected.actor||saved.updatedBy!==expected.actor)
      throw failure('READBACK_MISMATCH','ผลที่อ่านกลับไม่ตรงผู้ดำเนินการ กรุณาตรวจสอบประวัติก่อนส่งซ้ำ');
    const {operation,input,id,requestId}=expected;
    if(id && saved.id!==id || operation!=='review' && saved.employeeId!==expected.actor || operation==='create' && (saved.requestId!==requestId||saved.createdBy!==expected.actor))
      throw failure('READBACK_MISMATCH','ผลที่อ่านกลับไม่ตรงเจ้าของหรือหมายเลขคำขอ');
    if(['create','edit'].includes(operation)) {
      const attachments=(saved.attachments||[]).map(a=>({storage_path:a.storage_path,original_name:a.original_name,mime_type:a.mime_type,byte_size:a.byte_size,sha256:a.sha256})).sort((a,b)=>a.storage_path.localeCompare(b.storage_path));
      const planned=[...input.attachments].sort((a,b)=>a.storage_path.localeCompare(b.storage_path));
      if(saved.status!=='pending'||saved.type!==input.type||saved.startDate!==input.startDate||saved.endDate!==input.endDate||saved.reason!==input.reason||
        JSON.stringify(saved.requestedDates)!==JSON.stringify(input.dates)||JSON.stringify(attachments)!==JSON.stringify(planned))
        throw failure('READBACK_MISMATCH','ข้อมูลหรือรูปแนบที่อ่านกลับไม่ตรงกับคำขอ กรุณาตรวจสอบประวัติก่อนส่งซ้ำ');
    } else if(operation==='cancel' && (saved.status!=='cancelled'||saved.cancellationReason!==input.reason) ||
      operation==='review' && (saved.status!==input.decision||saved.reviewerId!==expected.actor))
      throw failure('READBACK_MISMATCH','สถานะที่อ่านกลับไม่ตรงกับรายการที่ส่ง');
    return {...current,changedSinceCommit:current.updatedAt!==saved.updatedAt};
  }
  async function recover() {
    const actor=(await options()).employee_id; const recovered=[],pending=[];
    const keys=Object.keys(sessionStorage).filter(k=>k.startsWith(RECEIPT_PREFIX+actor+':'));
    for(const keyName of keys) {
      const id=keyName.slice(keyName.lastIndexOf(':')+1);
      let local; try{local=JSON.parse(sessionStorage.getItem(keyName));}catch{continue;}
      try {
        const result=await rpc('resolve',{p_request_id:id,p_abort:true});
        if(result.state==='committed')recovered.push(await verify(result,local.expected));
        const paths=result.state==='aborted' ? result.paths : result.state==='committed' ? (result.removed_paths||local.cleanup||[]) : [];
        const remaining=await cleanup(paths,actor);
        if(remaining.length){persist(actor,id,{id,cleanup:remaining});pending.push({requestId:id,paths:remaining,state:'cleanup'});}
        else forget(actor,id);
      } catch(error){pending.push({requestId:id,paths:local.cleanup||local.paths||[],message:error.message,state:'unconfirmed'});}
    }
    return {recovered,pending};
  }
  async function mutate(operation,p={}) {
    const progress=p.onProgress||(()=>{}); const actor=(await options()).employee_id;
    const attempt=p.attempt||(p.attempt={});
    // Resolve a previous unknown result before allocating any new operation or file path.
    if(attempt.unknown) {
      const result=await rpc('resolve',{p_request_id:attempt.id,p_abort:true});
      if(result.state==='committed'){
        const local=JSON.parse(sessionStorage.getItem(receiptKey(actor,attempt.id))||'{}');
        const saved=await verify(result,local.expected),remaining=await cleanup(result.removed_paths||[],actor);
        if(remaining.length)persist(actor,attempt.id,{id:attempt.id,cleanup:remaining});else forget(actor,attempt.id);
        attempt.done=true;return {saved,recovered:true,cleanup:remaining};
      }
      if(result.state!=='aborted'&&result.state!=='not_found')throw failure('UNCONFIRMED','ยังยืนยันการส่งเดิมไม่ได้ กรุณาลองตรวจสอบอีกครั้ง');
      const pending=await cleanup(result.paths||[],actor);
      if(pending.length)persist(actor,attempt.id,{id:attempt.id,cleanup:pending});else forget(actor,attempt.id);
      attempt.id=null;attempt.plans=null;attempt.signature=null;attempt.unknown=false;
    }
    attempt.id ||= crypto.randomUUID();
    progress('กำลังเตรียมรูป');
    const files=p.files||[];
    if(files.length+(p.attachments||[]).length>5)throw failure('VALIDATION_ERROR','แนบรูปได้สูงสุด 5 รูป');
    if(!attempt.plans) {
      attempt.plans=[];
      for(const file of files) {
        if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size<1||file.size>1048576)
          throw failure('VALIDATION_ERROR',file.name+': ใช้ JPG, PNG หรือ WebP ขนาดไม่เกิน 1 MB');
        const extension={"image/jpeg":"jpg","image/png":"png","image/webp":"webp"}[file.type];
        attempt.plans.push({file,metadata:{storage_path:'leaveRequests/'+actor+'/'+attempt.id+'/'+crypto.randomUUID()+'.'+extension,
          original_name:file.name.slice(0,120),mime_type:file.type,byte_size:file.size,sha256:await digest(file)}});
      }
    }
    const cleanAttachment=a=>({storage_path:a.storage_path,original_name:a.original_name,mime_type:a.mime_type,byte_size:a.byte_size,sha256:a.sha256});
    const input=['create','edit'].includes(operation) ? {type:p.type,startDate:p.startDate,endDate:p.endDate,
      dates:p.dates,reason:String(p.reason||'').trim(),attachments:[...(p.attachments||[]).map(cleanAttachment),...attempt.plans.map(x=>x.metadata)]}
      : {reason:String(p.reason||'').trim(),...(operation==='review'?{decision:p.decision}:{})};
    const signature=JSON.stringify({operation,id:p.id||null,version:p.updatedAt||null,input});
    if(attempt.signature && attempt.signature!==signature)throw failure('IDEMPOTENCY_CONFLICT','ข้อมูลเปลี่ยนจากการส่งเดิม กรุณาตรวจผลการส่งเดิมก่อนเริ่มใหม่');
    attempt.signature=signature;
    const paths=attempt.plans.map(x=>x.metadata.storage_path);
    const expected={actor,operation,input,id:p.id||null,requestId:attempt.id};
    persist(actor,attempt.id,{id:attempt.id,paths,expected});
    let result;
    try {
      progress('กำลังตรวจสอบข้อมูล');
      result=await rpc('prepare',{p_operation:operation,p_request_id:attempt.id,p_record_id:p.id||null,p_expected_updated_at:p.updatedAt||null,p_input:input});
      if(result.state!=='committed') {
        let done=0;
        for(const plan of attempt.plans) {
          progress('กำลังอัปโหลดรูป '+(++done)+'/'+attempt.plans.length);
          current(); let upload;
          try{upload=await storage.upload(plan.metadata.storage_path,plan.file,{upsert:false,contentType:plan.file.type,metadata:{sha256:plan.metadata.sha256}});}catch(error){upload={error};}
          current();
          if(upload.error) {
            // A lost upload response is resolved by reading the immutable path and comparing bytes.
            const check=await storage.download(plan.metadata.storage_path);current();
            if(check.error || check.data.size!==plan.metadata.byte_size || await digest(check.data)!==plan.metadata.sha256)
              throw failure('UPLOAD_FAILED',plan.file.name+': อัปโหลดรูปไม่สำเร็จ');
          }
        }
        progress(operation==='edit'?'กำลังบันทึกการแก้ไข':operation==='cancel'?'กำลังยกเลิกคำขอ':operation==='review'?'กำลังบันทึกผลพิจารณา':'กำลังส่งคำขอ');
        result=await rpc('apply',{p_request_id:attempt.id});
      }
      progress('กำลังตรวจข้อมูลที่บันทึกและ Audit');
      const saved=await verify(result,expected); const remaining=await cleanup(result.removed_paths||[],actor);
      if(remaining.length)persist(actor,attempt.id,{id:attempt.id,cleanup:remaining});else forget(actor,attempt.id);
      attempt.done=true; return {saved,cleanup:remaining};
    } catch(error) {
      // Resolving and aborting locks the same operation as apply; cleanup cannot race a late commit.
      let resolved;
      try{resolved=await rpc('resolve',{p_request_id:attempt.id,p_abort:true});}
      catch{attempt.unknown=true;throw failure('UNCONFIRMED','ยังยืนยันผลการส่งไม่ได้ ข้อมูลในฟอร์มยังอยู่ กดส่งอีกครั้งเพื่อตรวจรายการเดิมก่อน',{cause:error});}
      if(resolved.state==='committed') {
        try {
          const saved=await verify(resolved,expected);const remaining=await cleanup(resolved.removed_paths||[],actor);
          if(remaining.length)persist(actor,attempt.id,{id:attempt.id,cleanup:remaining});else forget(actor,attempt.id);
          attempt.done=true;return {saved,recovered:true,cleanup:remaining};
        }catch(verifyError){attempt.unknown=true;throw verifyError;}
      }
      const remaining=await cleanup(resolved.paths||paths,actor);
      if(remaining.length)persist(actor,attempt.id,{id:attempt.id,cleanup:remaining});else forget(actor,attempt.id);
      attempt.id=null;attempt.plans=null;attempt.signature=null;
      throw Object.assign(error,{cleanup:remaining});
    }
  }
  async function images(id,options={}) {
    const saved=await detail(id,options); const result=[];
    for(const a of saved.attachments) {
      if(options.signal?.aborted)throw new DOMException('การอ่านรูปถูกยกเลิก','AbortError');
      current(); const signed=await storage.createSignedUrl(a.storage_path,60);current();
      if(signed.error||!signed.data?.signedUrl)throw failure('IMAGE_UNAVAILABLE',a.original_name+': เปิดรูปไม่สำเร็จ');
      result.push({name:a.original_name,url:signed.data.signedUrl});
    }
    return result;
  }
  return {options,list,historyPage,managerQueuePage,managerReportPage,detail,recover,images,mutate,adminProxySubmit,calendar:month=>rpc('calendar',{p_month:month})};
}
