import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js?v=1.3.198';
import { getSupabaseLineAccessToken } from './auth.js?v=1.3.205';

const REQUEST_FIELDS='id,employee_name,employee_code,phone,note,line_display_name,requested_main_group,requested_groups,status,reviewed_at,review_reason,created_at,updated_at';
function safeError(data,status){
 const message=String(data?.message||data?.error_description||'');
 if(status===401||/SESSION_EXPIRED|JWT expired|invalid JWT/i.test(message))return 'Session หมดอายุ กรุณายืนยัน LINE ใหม่';
 if(status===403||/42501|permission denied|ไม่มีสิทธิ์/i.test(message))return 'ไม่มีสิทธิ์ดูข้อมูล';
 return 'ไม่สามารถโหลดสถานะได้';
}
export async function registrationRequest(path,body){
 const token=getSupabaseLineAccessToken();
 if(!token)throw Object.assign(new Error('Session หมดอายุ กรุณายืนยัน LINE ใหม่'),{status:401});
 const response=await fetch(SUPABASE_URL+path,{method:body===undefined?'GET':'POST',cache:'no-store',redirect:'error',
  headers:{apikey:SUPABASE_PUBLISHABLE_KEY,Authorization:'Bearer '+token,Accept:'application/json',...(body===undefined?{}:{'Content-Type':'application/json'})},
  ...(body===undefined?{}:{body:JSON.stringify(body)})});
 const data=await response.json().catch(()=>null);
 if(!response.ok)throw Object.assign(new Error(safeError(data,response.status)),{status:response.status});
 return data;
}
export const getCurrentVerifiedIdentity=()=>registrationRequest('/rest/v1/rpc/registration_current_identity',{});
export async function checkExistingEmployee(){
 const identity=await getCurrentVerifiedIdentity();
 return {exists:identity.employee_exists===true,active:identity.employee_active===true};
}
async function readOwnRequests(identity){
 if(!identity?.line_user_id)throw Object.assign(new Error('ไม่มีสิทธิ์ดูข้อมูล'),{status:403});
 const query=new URLSearchParams({select:REQUEST_FIELDS,line_user_id:'eq.'+identity.line_user_id,order:'created_at.desc'});
 return registrationRequest('/rest/v1/registration_requests?'+query);
}
export async function getMyRegistrationRequests(){const identity=await getCurrentVerifiedIdentity();return readOwnRequests(identity);}
export async function getMyLatestRegistrationRequest(){return (await getMyRegistrationRequests())[0]||null;}
export async function refreshMyRegistrationStatus(){
 const identity=await getCurrentVerifiedIdentity();
 const requests=await readOwnRequests(identity);
 return {identity,requests};
}
export async function checkApprovedEmployeeStatus(requestId){
 if(typeof requestId!=='string'||!requestId)throw Object.assign(new Error('ไม่มีสิทธิ์ดูข้อมูล'),{status:403});
 await getCurrentVerifiedIdentity();
 const status=await registrationRequest('/rest/v1/rpc/registration_approved_account_status',{p_request_id:requestId});
 if(status?.authorized!==true)throw Object.assign(new Error('ไม่มีสิทธิ์ดูข้อมูล'),{status:403});
 return status;
}
export function validateRegistration(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('ข้อมูลไม่ถูกต้อง');
 if(['requested_main_group','requested_groups','main_group','groups'].some(k=>Object.hasOwn(input,k)))throw new Error('กลุ่มงานหลักและกลุ่มงานให้ Admin/ผู้บริหารเป็นผู้กำหนด');
 if(Object.keys(input).some(k=>!['employee_name','employee_code','phone','note'].includes(k)))throw new Error('ข้อมูลไม่ถูกต้อง');
 if(typeof input.employee_name!=='string'||!input.employee_name.trim())throw new Error('ข้อมูลไม่ครบ: กรุณากรอกชื่อ–นามสกุล');
 for(const [key,max] of [['employee_name',160],['employee_code',80],['phone',20],['note',2000]])if(input[key]!=null&&(typeof input[key]!=='string'||input[key].length>max))throw new Error('กรุณาตรวจสอบข้อมูลที่กรอก');
 if(input.phone&&!/^\+?[0-9][0-9 ()-]{6,19}$/.test(input.phone))throw new Error('กรุณาตรวจสอบรูปแบบเบอร์โทรศัพท์');
 return input;
}
// Audit receipts confirm backend-written records; callers cannot write arbitrary audit entries.
export async function createAuditLog({id,audit_id=null}){
 const ok=await registrationRequest('/rest/v1/rpc/registration_audit_receipt',{p_id:id,p_audit_id:audit_id});
 if(ok!==true)throw new Error('บันทึกคำขอแล้ว แต่ตรวจสอบ Audit Log ไม่สำเร็จ กรุณาตรวจสอบสถานะ');
 return ok;
}
export async function createRegistrationRequest(input){
 validateRegistration(input);
 const result=await registrationRequest('/rest/v1/rpc/registration_create',{p_input:input});
 const row=result?.request;
 if(!row?.id||row.status!=='pending')throw new Error('ไม่สามารถยืนยันผลการบันทึกคำขอ');
 const saved=await getMyLatestRegistrationRequest();
 if(saved?.id!==row.id||saved.status!=='pending')throw new Error('อ่านข้อมูลคำขอกลับไม่สำเร็จ กรุณาตรวจสอบสถานะ');
 for(const key of ['employee_name','employee_code','phone','note'])if((saved[key]||'')!==(input[key]?.trim()||''))throw new Error('ข้อมูลที่อ่านกลับไม่ตรงกับคำขอ');
 if(saved.requested_main_group!==null||!Array.isArray(saved.requested_groups)||saved.requested_groups.length!==0)throw new Error('คำขอสมัครต้องยังไม่มีกลุ่มงานที่กำหนด');
 await createAuditLog({id:row.id,audit_id:result.audit_id});
 return saved;
}
export async function updatePendingRegistrationRequest(){throw new Error('Pass นี้ยังไม่เปิดแก้ไขคำขอที่ส่งแล้ว');}
export async function cancelRegistrationRequest(id){
 const result=await registrationRequest('/rest/v1/rpc/registration_cancel',{p_id:id});
 const row=await getMyLatestRegistrationRequest();
 if(row?.id!==id||row.status!=='cancelled')throw new Error('อ่านผลยกเลิกกลับไม่สำเร็จ');
 await createAuditLog({id,audit_id:result.audit_id});
 return row;
}


