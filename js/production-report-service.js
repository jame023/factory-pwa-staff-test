import { createClient } from '../vendor/supabase-js-2.118.0.js?v=1.3.407';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './config.js?v=1.3.407';
import { getSupabaseLineAccessToken } from './auth.js?v=1.3.407';

export const PRODUCTION_REPORT_BUCKET = 'factory-production-report-photos';
const fail = (message, code='API_ERROR') => Object.assign(new Error(message), {code});
const TYPES = new Set(['image/jpeg','image/png','image/webp']);
const extensionFor = type => ({'image/jpeg':'jpg','image/png':'png','image/webp':'webp'})[type];
const validUuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value||''));

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
      if(response.status===401)throw fail('Session หมดอายุ กรุณาเข้าสู่ระบบ LINE อีกครั้ง','SESSION_EXPIRED');
      if(response.status===403)throw fail('บัญชีนี้ไม่มีสิทธิ์ทำรายการนี้','PERMISSION_DENIED');
      if(data?.code==='PGRST205'||data?.code==='42P01')throw fail('ฐานข้อมูลรายงานการผลิตยังไม่ได้ติดตั้งบน Supabase','BACKEND_NOT_READY');
      throw Object.assign(fail('บันทึกหรืออ่านรายงานการผลิตไม่สำเร็จ กรุณาลองใหม่','API_ERROR'),{status:response.status});
    }
    current();return data;
  }
  async function listReports({limit=40}={}) {
    const params=new URLSearchParams({select:'id,owner_id,sender_name,machine_name,photo_path,submitted_at',order:'submitted_at.desc,id.desc',limit:String(Math.min(100,Math.max(1,limit)))});
    const rows=await request('/rest/v1/factory_production_reports?'+params.toString());
    if(!Array.isArray(rows))throw fail('ข้อมูลรายงานการผลิตจากระบบไม่ถูกต้อง','INVALID_RESPONSE');
    return rows;
  }
  async function submit({machineId,file,ownerId}) {
    if(!validUuid(machineId)||!validUuid(ownerId))throw fail('ข้อมูลเครื่องจักรหรือบัญชีไม่ถูกต้อง','VALIDATION_ERROR');
    if(!(file instanceof File)||!TYPES.has(file.type)||file.size<1||file.size>512*1024)throw fail('กรุณาเลือกรูป JPG, PNG หรือ WebP ขนาดไม่เกิน 512 KB','VALIDATION_ERROR');
    const id=crypto.randomUUID(),photoId=crypto.randomUUID(),path='productionReports/'+ownerId+'/'+id+'/'+photoId+'.'+extensionFor(file.type);
    let insertAttempted=false;
    try {
      current();
      const result=await storage.upload(path,file,{upsert:false,contentType:file.type,cacheControl:'3600'});
      current();if(result.error)throw fail('อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่','UPLOAD_FAILED');
      insertAttempted=true;
      const saved=await request('/rest/v1/factory_production_reports?select=id,owner_id,sender_name,machine_name,photo_path,submitted_at',{
        method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({id,machine_id:machineId,photo_path:path})
      });
      if(!Array.isArray(saved)||saved.length!==1||saved[0].id!==id||saved[0].owner_id!==ownerId||saved[0].photo_path!==path)
        throw fail('บันทึกแล้วแต่ตรวจยืนยันข้อมูลกลับไม่สำเร็จ กรุณาตรวจรายการล่าสุดก่อนส่งซ้ำ','READBACK_FAILED');
      return saved[0];
    } catch(error) {
      if(!insertAttempted||(error.status>=400&&error.status<500))try{await storage.remove([path]);}catch{}
      throw error;
    }
  }
  async function signedPhoto(path) {
    if(typeof path!=='string'||!path.startsWith('productionReports/'))throw fail('เส้นทางรูปไม่ถูกต้อง','INVALID_PATH');
    current();const result=await storage.createSignedUrl(path,90);current();
    if(result.error||!result.data?.signedUrl)throw fail('เปิดรูปไม่สำเร็จ หรือไม่มีสิทธิ์ดูรูปนี้','PHOTO_UNAVAILABLE');
    return result.data.signedUrl;
  }
  return Object.freeze({listReports,submit,signedPhoto});
}
