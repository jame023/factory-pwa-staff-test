import {escapeHtml as e,thaiDateTime} from './utils.js?v=1.3.409';

export const LEAVE_ENTITLEMENT_POLICY='factory-leave-policy-v1.3.408';
const monthPattern=/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/;
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const invalid=()=>{throw Object.assign(new Error('ยังตรวจยืนยันสิทธิ์คงเหลือไม่ได้ กรุณาลองใหม่หรือติดต่อผู้ดูแล'),{code:'ENTITLEMENT_INVALID'});};
const number=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;

export function buildLeaveEntitlementRequest({months,recordId=null,updatedAt=null}={}) {
  if(!Array.isArray(months)||months.length<1||months.length>13||months.some(month=>typeof month!=='string'||!monthPattern.test(month))||new Set(months).size!==months.length)invalid();
  if((recordId!==null&&!uuidPattern.test(recordId))||Boolean(recordId)!==Boolean(updatedAt)||
    (updatedAt!==null&&(typeof updatedAt!=='string'||!Number.isFinite(Date.parse(updatedAt)))))invalid();
  return {p_months:[...months].sort(),p_exclude_record_id:recordId,p_expected_updated_at:updatedAt};
}

export function leaveEntitlementMonths(dates,fallbackMonth) {
  if(!Array.isArray(dates)||!monthPattern.test(fallbackMonth))invalid();
  const months=[...new Set(dates.filter(day=>day.period!=='none').map(day=>{
    if(typeof day.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(day.date)||
      !Number.isFinite(Date.parse(day.date+'T00:00:00Z'))||new Date(day.date+'T00:00:00Z').toISOString().slice(0,10)!==day.date)invalid();
    return day.date.slice(0,7);
  }))].sort();
  buildLeaveEntitlementRequest({months:months.length?months:[fallbackMonth]});
  return months.length?months:[fallbackMonth];
}

export function validateLeaveEntitlement(data,{employeeId,months,recordId=null}={}) {
  if(!uuidPattern.test(employeeId)||!data||data.schema_version!==1||data.policy_version!==LEAVE_ENTITLEMENT_POLICY||
    data.employee_id!==employeeId||data.excluded_record_id!==recordId||data.time_zone!=='Asia/Bangkok'||data.period_basis!=='leave_date'||data.annual_limit!==null||
    typeof data.as_of!=='string'||!Number.isFinite(Date.parse(data.as_of))||!Array.isArray(data.months)||data.months.length!==months?.length)invalid();
  const expected=[...months].sort();
  for(const [index,row] of data.months.entries()){
    if(row.month!==expected[index])invalid();
    for(const [key,unit,limit] of [['personal','day',2],['sick_without_attachment','request',1]]){
      const quota=row[key];
      if(!quota||quota.unit!==unit||quota.limit!==limit||quota.quota_mode!=='monthly'||
        ![quota.pending,quota.approved,quota.used,quota.remaining].every(number)||
        quota.pending+quota.approved!==quota.used||quota.remaining!==Math.max(0,limit-quota.used)||quota.over_limit!==(quota.used>limit)||
        [quota.pending,quota.approved,quota.used,quota.remaining].some(value=>unit==='day'?!Number.isInteger(value*2):!Number.isInteger(value)))invalid();
    }
    const attached=row.sick_with_attachment;
    if(!attached||attached.quota_mode!=='none'||attached.limit!==null||attached.remaining!==null)invalid();
  }
  return data;
}

const format=value=>new Intl.NumberFormat('th-TH',{maximumFractionDigits:1}).format(value);
const thaiMonth=month=>new Intl.DateTimeFormat('th-TH',{month:'long',year:'numeric',timeZone:'Asia/Bangkok'}).format(new Date(month+'-01T00:00:00+07:00'));
export function renderLeaveEntitlement(data) {
  return data.months.map(row=>{
    const quota=(label,value,unit)=>`<div class="leave-entitlement-row"><div><strong>${label}</strong><p>อนุมัติแล้ว ${format(value.approved)} ${unit} • รอตรวจ ${format(value.pending)} ${unit}</p>${value.over_limit?'<p class="field-error">ยอดเดิมเกินโควตาของเดือนนี้ กรุณาติดต่อผู้ดูแล</p>':''}</div><div class="leave-entitlement-value"><strong>เหลือ ${format(value.remaining)} ${unit}</strong><small>จาก ${format(value.limit)} ${unit}ต่อเดือน</small></div></div>`;
    return `<div class="leave-entitlement-month"><h4>${e(thaiMonth(row.month))}</h4>${quota('ลากิจ',row.personal,'วัน')}${quota('ลาป่วยไม่มีรูปแนบ',row.sick_without_attachment,'ครั้ง')}<div class="leave-entitlement-row"><strong>ลาป่วยมีรูปแนบ</strong><span>ไม่จำกัดโควตารายเดือน</span></div></div>`;
  }).join('')+
    `${data.excluded_record_id?'<p class="help-text">ไม่รวมคำขอที่กำลังแก้ไข</p>':''}<details class="leave-entitlement-rules"><summary>ดูวิธีนับสิทธิ์</summary><p class="help-text">รวมคำขอรอตรวจและอนุมัติแล้ว ไม่รวมคำขอที่ไม่อนุมัติหรือยกเลิก • นับตามเดือนที่ลา</p><p class="help-text">ลาป่วยไม่มีรูปแนบนับ 1 คำขอเป็น 1 ครั้ง แม้เลือกครึ่งวันหรือหลายวัน • การส่งยังขึ้นกับเวลา วันซ้ำ และเงื่อนไขของคำขอ</p></details><p class="small-muted">ข้อมูล ณ ${e(thaiDateTime(data.as_of))} • ยังไม่หักรายการที่กำลังกรอก</p>`;
}

export function mountLeaveEntitlement(host,{read,employeeId,signal,alive=()=>true}) {
  let ticket=0,requestController,stopped=false,signature=null,phase='idle',lastInput,blocked=false;
  host.innerHTML='<div class="leave-entitlement-heading"><h3>สิทธิ์ลาคงเหลือ</h3><button class="button button-small" type="button" data-entitlement-refresh aria-label="รีเฟรชสิทธิ์ลาคงเหลือ">รีเฟรช</button></div><div data-entitlement-content role="status" aria-live="polite"></div>';
  const content=host.querySelector('[data-entitlement-content]'),button=host.querySelector('[data-entitlement-refresh]');
  const valid=()=>!stopped&&!signal?.aborted&&alive();
  function paintBusy(value){host.setAttribute('aria-busy',String(value));button.disabled=value||blocked;}
  function unavailable(message='ยังอ่านสิทธิ์คงเหลือไม่ได้ กรุณาลองใหม่หรือติดต่อผู้ดูแล'){
    requestController?.abort();ticket++;signature=null;phase='error';
    if(valid()){paintBusy(false);content.innerHTML=`<p class="notice notice-warning">${e(message)}</p><p class="help-text">ยังไม่มีตัวเลขคงเหลือที่ยืนยันได้</p>`;}
  }
  async function refresh(input,{force=false}={}) {
    if(!valid())return;
    let request;
    try{request=buildLeaveEntitlementRequest(input);}catch{unavailable();return;}
    const key=JSON.stringify(request);
    lastInput={months:request.p_months,recordId:request.p_exclude_record_id,updatedAt:request.p_expected_updated_at};
    if(!force&&signature===key&&['loading','ready'].includes(phase))return;
    signature=key;phase='loading';const mine=++ticket;
    requestController?.abort();requestController=new AbortController();
    paintBusy(true);content.innerHTML='<p class="page-loading">กำลังอ่านสิทธิ์ลาคงเหลือ…</p>';
    try{
      const data=await read({...lastInput,employeeId},{signal:requestController.signal});
      if(!valid()||mine!==ticket)return;
      validateLeaveEntitlement(data,{employeeId,months:lastInput.months,recordId:lastInput.recordId});
      phase='ready';content.innerHTML=renderLeaveEntitlement(data);
    }catch(error){
      if(!valid()||mine!==ticket)return;
      phase='error';signature=null;
      const message=error.code==='ENTITLEMENT_POLICY_UNAVAILABLE'?'ยังตรวจสิทธิ์คงเหลือไม่ได้ กรุณาติดต่อผู้ดูแลให้ตรวจการตั้งค่าการลา':'ยังอ่านสิทธิ์คงเหลือไม่ได้ กรุณาลองใหม่หรือติดต่อผู้ดูแล';
      content.innerHTML=`<p class="notice notice-warning">${message}</p><p class="help-text">ยังไม่มีตัวเลขคงเหลือที่ยืนยันได้</p>`;
    }finally{if(valid()&&mine===ticket)paintBusy(false);}
  }
  function stop(){stopped=true;requestController?.abort();ticket++;signal?.removeEventListener('abort',stop);}
  signal?.addEventListener('abort',stop,{once:true});
  button.addEventListener('click',()=>{if(!blocked&&lastInput)void refresh(lastInput,{force:true});});
  return {refresh,unavailable,stop,setBlocked(value){blocked=Boolean(value);button.disabled=blocked||phase==='loading';}};
}
