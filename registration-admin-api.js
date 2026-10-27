import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js?v=1.3.199';
import { getSupabaseLineAccessToken, checkSupabaseSession } from './auth.js?v=1.3.205';

export const ORDINARY_GROUPS = Object.freeze(['ออฟฟิศ','สกรีน','ผลิต','ขนส่ง']);
const messages = {
 ACTIVE_ADMIN_REQUIRED:'ไม่มีสิทธิ์: ต้องเป็น Admin ที่ยังใช้งานอยู่',
 REQUEST_ALREADY_REVIEWED:'คำขอถูกดำเนินการไปแล้ว กรุณาตรวจสถานะล่าสุด',
 SELF_REVIEW_DENIED:'ไม่สามารถตรวจอนุมัติคำขอของตนเอง',
 PREVIEW_CHANGED:'ข้อมูลเปลี่ยนหลังสร้าง Preview กรุณาตรวจสอบใหม่',
 VERIFIED_LINE_IDENTITY_MISMATCH:'ข้อมูล LINE ไม่ตรงกับหลักฐานยืนยันตัวตนของผู้ส่งคำขอ',
 EMPLOYEE_CODE_CONFLICT:'รหัสพนักงานซ้ำกับบัญชีอื่น',
 EMPLOYEE_CODE_IDENTITY_CONFLICT:'รหัสพนักงานไม่ตรงกับบัญชี LINE เดิม',
 PRIVILEGED_GROUP_DENIED:'ไม่อนุญาตให้สมัครสิทธิ์ Admin หรือผู้บริหาร',
 PRIVILEGED_ACCOUNT_USE_GROUP_ADMIN:'บัญชีนี้มีสิทธิ์สูง กรุณาใช้หน้าจัดการสิทธิ์กลุ่มงาน',
 ORDINARY_GROUPS_AND_MAIN_REQUIRED:'เลือกกลุ่มงานที่อนุญาต และให้กลุ่มงานหลักอยู่ในกลุ่มงานที่เลือก',
 EXPLICIT_PERMISSION_UPDATE_REQUIRED:'บัญชีนี้มีอยู่แล้ว ต้องระบุว่าเป็นการอัปเดตสิทธิ์',
 REACTIVATION_CONFIRMATION_REQUIRED:'ต้องยืนยันเปิดใช้งานบัญชีที่ถูกระงับอีกครั้ง',
 REJECTION_REASON_REQUIRED:'กรุณาระบุเหตุผลไม่อนุมัติ',
 ACCOUNT_ALREADY_EXISTS:'บัญชีนี้มีอยู่แล้ว',
 INACTIVE_ACCOUNT_CONFIRMATION_REQUIRED:'พบบัญชีที่ถูกระงับ ต้องยืนยันการเปิดใช้งาน',
 ACCOUNT_MODE_MISMATCH:'รูปแบบดำเนินการไม่ตรงกับบัญชีปัจจุบัน',
};
export const reviewMessage = code => messages[code] || code;
export async function getRegistrationAdminContext(){
 const state=await checkSupabaseSession();
 if(state.role!=='admin')throw Object.assign(new Error('ไม่มีสิทธิ์: ต้องเป็น Admin ที่ยังใช้งานอยู่'),{status:403});
 const accessToken=getSupabaseLineAccessToken();
 if(!accessToken)throw Object.assign(new Error('Session หมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง'),{status:401});
 return {accessToken};
}
async function request(path, body) {
 const {accessToken}=await getRegistrationAdminContext();
 const response=await fetch(SUPABASE_URL+'/rest/v1/'+path,{
  method:body===undefined?'GET':'POST',cache:'no-store',redirect:'error',
  headers:{apikey:SUPABASE_PUBLISHABLE_KEY,Authorization:'Bearer '+accessToken,
   'Content-Type':'application/json',Accept:'application/json'},
  ...(body===undefined?{}:{body:JSON.stringify(body)})
 });
 const data=await response.json().catch(()=>null);
 if(!response.ok){
  const raw=String(data?.message||''); const code=Object.keys(messages).find(key=>raw.includes(key));
  const message=code?messages[code]:response.status===401?'Session หมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง':
   response.status===403?'ไม่มีสิทธิ์':data?.code==='23505'?'พบข้อมูลซ้ำ ไม่สามารถอนุมัติได้':data?.code==='23514'?'ไม่สามารถบันทึกแบบ Atomic ได้':'ยังยืนยันผลไม่ได้ กรุณาตรวจสถานะล่าสุดก่อนลองใหม่';
  throw Object.assign(new Error(message),{code:code||data?.code,status:response.status});
 }
 return data;
}
export async function listRegistrationRequests(filters={}) {
 const params=new URLSearchParams({select:'*',order:'created_at.desc,id.desc',limit:'50',offset:String(filters.offset||0)});
 if(filters.status)params.set('status','eq.'+filters.status);
 for(const [key,column] of [['name','employee_name'],['line','line_display_name'],['code','employee_code']])
  if(filters[key]?.trim())params.set(column,'ilike.*'+filters[key].trim().replace(/[\\%_]/g,c=>'\\'+c).replace(/\*/g,'')+'*');
 if(filters.group)params.set('assigned_groups','cs.'+JSON.stringify([filters.group]));
 if(filters.from)params.append('created_at','gte.'+filters.from+'T00:00:00+07:00');
 if(filters.to)params.append('created_at','lte.'+filters.to+'T23:59:59.999999+07:00');
 const rows=await request('registration_requests?'+params);
 const reviewers=[...new Set(rows.map(r=>r.reviewed_by).filter(Boolean))];
 if(!reviewers.length)return rows;
 const employees=await request('employees?'+new URLSearchParams({select:'id,employee_name',id:'in.('+reviewers.join(',')+')'}));
 return rows.map(r=>({...r,reviewer_name:employees.find(e=>e.id===r.reviewed_by)?.employee_name}));
}
export const getApprovalPreview=(id,input={})=>request('rpc/get_registration_approval_preview',{p_request_id:id,p_input:input});
export async function getRegistrationRequestById(id){
 const plan=await getApprovalPreview(id);
 const params=new URLSearchParams({select:'action,old_value,new_value,created_at,actor_employee_id',table_name:'eq.registration_requests',record_id:'eq.'+id,order:'created_at.asc'});
 const history=await request('audit_logs?'+params);
 let reviewer=null;
 if(plan.request.reviewed_by){const rows=await request('employees?'+new URLSearchParams({select:'employee_name',id:'eq.'+plan.request.reviewed_by}));reviewer=rows[0]?.employee_name;}
 return {...plan,history,reviewer};
}
// Audit is written exclusively inside the RPC transaction. This contract verifies receipts.
export async function createAuditLog({audit_ids}){
 if(!Array.isArray(audit_ids)||!audit_ids.length)throw new Error('ไม่มีหลักฐาน Audit Log');
 const rows=await request('audit_logs?'+new URLSearchParams({select:'id,action,actor_employee_id,table_name,record_id,new_value',id:'in.('+audit_ids.join(',')+')'}));
 if(rows.length!==audit_ids.length)throw new Error('ตรวจสอบ Audit Log ไม่ครบ');
 return rows;
}
async function verifyResult(id,result,status){
 const saved=await getRegistrationRequestById(id);
 if(saved.request.status!==status||saved.request.reviewed_by!==result.request.reviewed_by||saved.request.reviewed_at!==result.request.reviewed_at||saved.request.review_reason!==result.request.review_reason)throw new Error('อ่านผลคำขอกลับไม่ตรง กรุณาตรวจสถานะล่าสุด');
 const audits=await createAuditLog(result);
 if(!audits.some(a=>a.record_id===id&&a.action===(status==='approved'?'APPROVE_REGISTRATION':'REJECT_REGISTRATION')&&a.actor_employee_id===saved.request.reviewed_by))throw new Error('ตรวจสอบประวัติอนุมัติไม่สำเร็จ');
 if(status==='approved'){
  const e=saved.employee;
  if(!e||e.id!==saved.request.approved_employee_id||e.active!==true||e.main_group!==saved.request.assigned_main_group||
   !saved.request.assigned_groups.every(g=>saved.existing_groups.some(x=>x.group_name===g&&x.active===true)))throw new Error('บัญชีหรือสิทธิ์ที่อ่านกลับไม่ครบ');
 }
 return saved;
}
export async function approveRegistrationRequest(id,input){return verifyResult(id,await request('rpc/approve_registration_request',{p_request_id:id,p_input:input}),'approved');}
export async function rejectRegistrationRequest(id,reason){return verifyResult(id,await request('rpc/reject_registration_request',{p_request_id:id,p_reason:reason}),'rejected');}


