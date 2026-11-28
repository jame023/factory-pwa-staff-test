import { createClient } from '../vendor/supabase-js-2.118.0.js?v=1.3.412';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './config.js?v=1.3.412';
import { getSupabaseLineAccessToken } from './auth.js?v=1.3.412';

export const PRODUCTION_REPORT_BUCKET = 'factory-production-report-photos';
const fail = (message, code='API_ERROR') => Object.assign(new Error(message), {code});
const TYPES = new Set(['image/jpeg','image/png','image/webp']);
const extensionFor = type => ({'image/jpeg':'jpg','image/png':'png','image/webp':'webp'})[type];
const validUuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value||''));
const REPORT_COLUMNS='id,owner_id,machine_id,sender_name,machine_name,photo_path,submitted_at';
const ATTEMPT_PREFIX='factory-production-report-pending-v1:';

export function createProductionReportService({token=getSupabaseLineAccessToken(), fetchImpl=fetch}={}) {
  const current = () => {
    if (!token || getSupabaseLineAccessToken() !== token) throw fail('Session เปลี่ยนหรือหมดอายุ กรุณาเปิดหน้านี้ใหม่','SESSION_EXPIRED');
  };
  const base=SUPABASE_URL.replace(/\/$/,'');
  const storage=createClient(base,SUPABASE_PUBLISHABLE_KEY,{accessToken:async()=>{current();return token;},
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}).storage.from(PRODUCTION_REPORT_BUCKET);
  async function request(path,init={}) {
    current();
    let response;
    try { response=await fetchImpl(base+path,{...init,cache:'no-store',redirect:'error',headers:{
      apikey:SUPABASE_PUBLISHABLE_KEY,Authorization:'Bearer '+token,Accept:'application/json',
      ...(init.body?{'Content-Type':'application/json'}:{}),...(init.headers||{})
    }}); }
    catch(cause){throw Object.assign(fail('เชื่อมต่อระบบไม่ได้ กรุณาตรวจอินเทอร์เน็ตแล้วลองใหม่','NETWORK_ERROR'),{cause});}
    const raw=await response.text();let data=null;try{data=raw?JSON.parse(raw):null;}catch{}
    if(!response.ok){
      if(response.status===401)throw Object.assign(fail('Session หมดอายุ กรุณาเข้าสู่ระบบ LINE อีกครั้ง','SESSION_EXPIRED'),{status:401});
      if(response.status===403)throw Object.assign(fail('บัญชีนี้ไม่มีสิทธิ์ทำรายการนี้','PERMISSION_DENIED'),{status:403});
      if(data?.code==='PGRST205'||data?.code==='42P01')throw Object.assign(fail('ฐานข้อมูลรายงานการผลิตยังไม่ได้ติดตั้งบน Supabase','BACKEND_NOT_READY'),{status:response.status});
      throw Object.assign(fail('บันทึกหรืออ่านรายงานการผลิตไม่สำเร็จ กรุณาลองใหม่','API_ERROR'),{status:response.status});
    }
    current();return data;
  }
  async function listReports({limit=40}={}) {
    const params=new URLSearchParams({select:REPORT_COLUMNS,order:'submitted_at.desc,id.desc',limit:String(Math.min(100,Math.max(1,limit)))});
    const rows=await request('/rest/v1/factory_production_reports?'+params.toString());
    if(!Array.isArray(rows))throw fail('ข้อมูลรายงานการผลิตจากระบบไม่ถูกต้อง','INVALID_RESPONSE');
    return rows;
  }
  function getPending(ownerId) {
    if(!validUuid(ownerId))throw fail('ข้อมูลบัญชีไม่ถูกต้อง','VALIDATION_ERROR');
    let attempt;
    try{attempt=JSON.parse(sessionStorage.getItem(ATTEMPT_PREFIX+ownerId)||'null');}
    catch{throw fail('อ่านรายการส่งค้างไม่ได้ กรุณาตรวจประวัติก่อนส่งใหม่','RECOVERY_ERROR');}
    if(attempt&&(!validUuid(attempt.id)||attempt.ownerId!==ownerId||!validUuid(attempt.machineId)||
      !/^[a-f0-9]{64}$/.test(attempt.digest)||!TYPES.has(attempt.type)||
      !Number.isInteger(attempt.size)||attempt.size<1||attempt.size>512*1024||
      typeof attempt.path!=='string'||!attempt.path.startsWith('productionReports/'+ownerId+'/'+attempt.id+'/')||
      !/\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(attempt.path)))
      throw fail('ข้อมูลรายการส่งค้างไม่ถูกต้อง กรุณาตรวจประวัติก่อนส่งใหม่','RECOVERY_ERROR');
    return attempt;
  }
  function remember(attempt,create=false) {
    const stored=getPending(attempt.ownerId);
    if(create?Boolean(stored):stored?.id!==attempt.id)
      throw fail('หน้ารายงานนี้มีการดำเนินการต่อแล้ว กรุณารีเฟรชเพื่อตรวจรายการล่าสุด','REPORT_SUPERSEDED');
    try{sessionStorage.setItem(ATTEMPT_PREFIX+attempt.ownerId,JSON.stringify(attempt));}
    catch{throw fail('เก็บรหัสป้องกันการส่งซ้ำไม่ได้ กรุณาอนุญาตพื้นที่จัดเก็บของเบราว์เซอร์','RECOVERY_ERROR');}
  }
  function forget(attempt){
    if(getPending(attempt.ownerId)?.id===attempt.id)sessionStorage.removeItem(ATTEMPT_PREFIX+attempt.ownerId);
  }
  async function findSaved(attempt) {
    const params=new URLSearchParams({select:REPORT_COLUMNS,id:'eq.'+attempt.id,owner_id:'eq.'+attempt.ownerId,limit:'1'});
    const rows=await request('/rest/v1/factory_production_reports?'+params);
    if(!Array.isArray(rows)||rows.length>1)throw fail('ตรวจรายการส่งค้างไม่สำเร็จ','INVALID_RESPONSE');
    if(!rows.length)return null;
    const row=rows[0];
    if(row.id!==attempt.id||row.owner_id!==attempt.ownerId||row.machine_id!==attempt.machineId||row.photo_path!==attempt.path)
      throw fail('รายการที่บันทึกไม่ตรงกับคำขอ กรุณาติดต่อ Admin ก่อนส่งใหม่','IDEMPOTENCY_CONFLICT');
    return row;
  }
  async function recoverPending(ownerId) {
    current();const attempt=getPending(ownerId);
    if(!attempt)return {state:'none'};
    const report=await findSaved(attempt);
    if(report){forget(attempt);return {state:'saved',report};}
    return {state:'pending',machineId:attempt.machineId};
  }
  let submitting=false;
  async function submit(input) {
    if(submitting)throw fail('กำลังตรวจรายการเดิม กรุณารอสักครู่','REPORT_BUSY');
    submitting=true;
    try{return await submitAttempt(input);}finally{submitting=false;}
  }
  async function submitAttempt({machineId,file,ownerId}) {
    current();
    if(!validUuid(machineId)||!validUuid(ownerId))throw fail('ข้อมูลเครื่องจักรหรือบัญชีไม่ถูกต้อง','VALIDATION_ERROR');
    if(!(file instanceof File)||!TYPES.has(file.type)||file.size<1||file.size>512*1024)throw fail('กรุณาเลือกรูป JPG, PNG หรือ WebP ขนาดไม่เกิน 512 KB','VALIDATION_ERROR');
    const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))].map(n=>n.toString(16).padStart(2,'0')).join('');
    current();
    let attempt=getPending(ownerId);
    if(attempt){
      if(attempt.machineId!==machineId||attempt.digest!==digest||attempt.type!==file.type||attempt.size!==file.size)
        throw fail('มีรายงานที่ยังไม่ยืนยัน กรุณาใช้เครื่องจักรและรูปเดิม หรือตรวจรายการล่าสุดก่อนส่งใหม่','REPORT_PENDING');
      const prior=await findSaved(attempt);
      if(prior){forget(attempt);return prior;}
    }else{
      const id=crypto.randomUUID();
      attempt={id,ownerId,machineId,digest,type:file.type,size:file.size,
        path:'productionReports/'+ownerId+'/'+id+'/'+crypto.randomUUID()+'.'+extensionFor(file.type),uploaded:false,uploadAttempted:false,insertAttempted:false};
      remember(attempt,true);
    }
    const earlierInsertUnresolved=attempt.insertAttempted===true;
    let insertAttempted=false;
    try {
      current();
      if(!attempt.uploaded){
        const retryUpload=attempt.uploadAttempted;
        attempt.uploadAttempted=true;remember(attempt);
        const result=await storage.upload(attempt.path,file,{upsert:false,contentType:file.type,cacheControl:'3600'});
        current();
        if(result.error&&!(retryUpload&&String(result.error.statusCode)==='409'))throw fail('อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่ด้วยรูปเดิม','UPLOAD_FAILED');
        attempt.uploaded=true;remember(attempt);
      }
      attempt.insertAttempted=true;remember(attempt);insertAttempted=true;
      const saved=await request('/rest/v1/factory_production_reports?select='+REPORT_COLUMNS,{
        method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({id:attempt.id,machine_id:machineId,photo_path:attempt.path})
      });
      if(!Array.isArray(saved)||saved.length!==1||saved[0].id!==attempt.id||saved[0].owner_id!==ownerId||saved[0].machine_id!==machineId||saved[0].photo_path!==attempt.path)
        throw fail('บันทึกแล้วแต่ตรวจยืนยันข้อมูลกลับไม่สำเร็จ กรุณาตรวจรายการล่าสุดก่อนส่งซ้ำ','READBACK_FAILED');
      forget(attempt);
      return saved[0];
    } catch(error) {
      if(insertAttempted){
        try{const prior=await findSaved(attempt);if(prior){forget(attempt);return prior;}}
        catch(resolveError){if(resolveError.code==='IDEMPOTENCY_CONFLICT')throw resolveError;}
        // Release only a first insert that was definitely rejected. A rejected
        // retry does not prove an earlier in-flight transaction cannot commit.
        if(!earlierInsertUnresolved&&error.status>=400&&error.status<500&&![401,403,409].includes(error.status))try{
          current();const removed=await storage.remove([attempt.path]);current();
          if(!removed.error)forget(attempt);
        }catch{}
      }
      if(getPending(ownerId))error.message+=' • เก็บรหัสรายการเดิมไว้แล้ว กรุณาลองใหม่ด้วยรูปและเครื่องจักรเดิม';
      throw error;
    }
  }
  async function signedPhoto(path) {
    if(typeof path!=='string'||!path.startsWith('productionReports/'))throw fail('เส้นทางรูปไม่ถูกต้อง','INVALID_PATH');
    current();const result=await storage.createSignedUrl(path,90);current();
    if(result.error||!result.data?.signedUrl)throw fail('เปิดรูปไม่สำเร็จ หรือไม่มีสิทธิ์ดูรูปนี้','PHOTO_UNAVAILABLE');
    return result.data.signedUrl;
  }
  return Object.freeze({listReports,submit,signedPhoto,getPending,recoverPending});
}
