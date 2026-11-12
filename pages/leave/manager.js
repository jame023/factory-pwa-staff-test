import * as api from '../../adapters/package09.js?v=1.3.324';
import { escapeHtml as e, bangkokToday, thaiDate, thaiDateTime, statusText } from '../../js/utils.js?v=1.3.186';
import { storedLeaveItems } from '../../js/leave-rules.js?v=1.3.186';
import { mountApprovedLeaveCalendar } from './approved-calendar.js?v=1.3.186';
import { canManage } from '../../js/permissions.js?v=1.3.186';
import { getAuthContext } from '../../js/access-context.js?v=1.3.260';
import { showStatusModal } from '../../components/status-modal.js?v=1.3.295';
import { loadingView } from '../../components/loading.js?v=1.3.186';
import { defaultLeaveReportRange, formatLeaveDays, validateLeaveManagerQueueResponse,
  validateLeaveManagerReportResponse, validateLeaveReportRange } from '../../js/leave-manager-rules.js?v=1.3.324';

const LEAVE_GROUPS=['ออฟฟิศ','สกรีน','ผลิต','ขนส่ง'];
const QUEUE_SIZE=25,REPORT_SIZE=25;
const validStatus=value=>['pending','approved','rejected','cancelled'].includes(value);
const dateLabel=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||''))?thaiDate(value):'—';
const periodLabel=value=>({full:'เต็มวัน',morning:'ครึ่งวันเช้า',afternoon:'ครึ่งวันบ่าย',none:'ไม่ลา',
  'เต็มวัน':'เต็มวัน','ครึ่งวันเช้า':'ครึ่งวันเช้า','ครึ่งวันบ่าย':'ครึ่งวันบ่าย','ไม่ลา':'ไม่ลา'})[value]||'ไม่ระบุช่วง';
const statusOptions='<option value="pending">รอตรวจ</option><option value="approved">อนุมัติแล้ว</option><option value="rejected">ไม่อนุมัติ</option><option value="cancelled">ยกเลิกแล้ว</option><option value="all">ทุกสถานะ</option>';
const escapeAttr=e;

function actorKey(){
  const auth=getAuthContext();
  return `${auth.authenticated}|${auth.active}|${auth.employee_id||''}|${auth.role||''}|${auth.permissions_version||''}`;
}
function currentMatches(key){
  const auth=getAuthContext();
  return key===actorKey()&&auth.authenticated===true&&auth.active===true&&canManage(auth.role);
}
function operationErrorTitle(error){
  if(['PERMISSION_DENIED','FORBIDDEN','LEAVE_SELF_REVIEW_BLOCKED'].includes(error?.code))return 'ไม่มีสิทธิ์';
  if(error?.code==='SESSION_EXPIRED'||error?.code==='SESSION_CHANGED')return 'Session หมดอายุหรือเปลี่ยนบัญชี';
  if(['STATUS_CONFLICT','VERSION_CONFLICT','CONFLICT'].includes(error?.code))return 'ข้อมูลเปลี่ยนแปลง กรุณาโหลดใหม่';
  if(error?.code==='NETWORK_ERROR'||error?.code==='API_ERROR')return 'ไม่สามารถเชื่อมต่อได้';
  if(error?.code==='DATA_ANOMALY')return 'พบข้อมูลที่ต้องตรวจสอบ';
  return 'ดำเนินการไม่สำเร็จ';
}
function fillGroupSelect(select,groups,selected=''){
  const unique=[...new Set((groups||[]).filter(group=>LEAVE_GROUPS.includes(group)))];
  select.innerHTML='<option value="">ทุกกลุ่มงานในขอบเขตสิทธิ์</option>'+unique.map(group=>`<option value="${e(group)}">${e(group)}</option>`).join('');
  select.value=unique.includes(selected)?selected:'';
}
function readSaved(key,fallback,validate){
  try{const value=JSON.parse(sessionStorage.getItem(key)||'null');return validate(value)?value:fallback;}catch{return fallback;}
}
function saveFilters(key,value){try{sessionStorage.setItem(key,JSON.stringify(value));}catch{}}
function labelReview(value){return value==='approved'?'อนุมัติ':value==='rejected'?'ไม่อนุมัติ':'ดำเนินการ';}

export async function renderLeaveManager(root,context){
  const auth=getAuthContext();
  if(!auth.authenticated||auth.active!==true||!canManage(auth.role)){
    root.innerHTML='<section class="card card-pad"><h1>ไม่มีสิทธิ์</h1><p>บัญชีนี้ไม่มีสิทธิ์ตรวจคำขอลา</p></section>';return;
  }
  const actor=actorKey(),today=bangkokToday(),defaultRange=defaultLeaveReportRange(today);
  const queueKey=`factory-pwa-leave-queue-filter:${encodeURIComponent(actor)}`;
  const reportKey=`factory-pwa-leave-report-filter:${encodeURIComponent(actor)}`;
  const defaultQueue={query:'',group:'',type:'',status:'pending'};
  const defaultReport={...defaultRange,query:'',group:'',type:'',status:'all'};
  const queueSaved=readSaved(queueKey,defaultQueue,x=>!!x&&typeof x.query==='string'&&x.query.length<=100&&
    typeof x.group==='string'&&typeof x.type==='string'&&(validStatus(x.status)||x.status==='all'));
  const reportSaved=readSaved(reportKey,defaultReport,x=>x&&typeof x.from==='string'&&typeof x.to==='string'&&
    typeof x.query==='string'&&x.query.length<=100&&typeof x.group==='string'&&typeof x.type==='string'&&
    (x.status==='all'||validStatus(x.status))&&validateLeaveReportRange(x.from,x.to).valid);
  const state={queueFilters:{...defaultQueue,...queueSaved},reportFilters:{...defaultReport,...reportSaved},
    queueRows:[],queueOffset:0,queueTotal:0,pendingCount:0,queueHasMore:false,queueLoaded:false,
    reportRows:[],reportOffset:0,reportTotal:0,reportSummary:null,reportSignature:'',reportHasMore:false,reportLoaded:false,
    queueSeq:0,reportSeq:0,detailSeq:0,queueController:null,reportController:null,detailController:null,
    activeDetail:null,dialog:null,statusModal:null,reviewAttempts:new Map(),disposed:false,actor};

  root.innerHTML=`<div class="page-heading leave-manager-heading"><div><p class="eyebrow">Supabase • ผู้บริหารและ Admin</p><h1>คำขอลา</h1><p>รายการรอตรวจและรายงานแยกส่วนกัน • ขอบเขตข้อมูลตรวจจากบัญชีปัจจุบัน</p></div><button class="button" data-leave-manager-refresh type="button">รีเฟรช</button></div>
    <section class="card card-pad leave-manager-pending" aria-live="polite"><div><span>คำขอรอตรวจในขอบเขตสิทธิ์</span><strong data-pending-count>—</strong></div><p data-pending-caption>ไม่นับคำขอที่ผู้ตรวจเป็นเจ้าของหรือยื่นแทนเองในรายการที่ดำเนินการได้</p></section>
    <nav class="leave-manager-tabs" role="tablist" aria-label="ส่วนคำขอลา"><button type="button" role="tab" aria-selected="true" aria-controls="leave-manager-queue" data-leave-tab="queue">รายการรอตรวจ</button><button type="button" role="tab" aria-selected="false" aria-controls="leave-manager-report" data-leave-tab="report">รายงานการลา</button></nav>
    <section id="leave-manager-queue" class="leave-manager-panel" role="tabpanel" data-leave-panel="queue">
      <section class="card card-pad attendance-section"><div class="section-title"><div><h2>รายการคำขอ</h2><p class="small-muted">จำนวนรอตรวจด้านบนเป็นทุกคำขอที่ผู้ตรวจมีสิทธิ์ ส่วนตัวกรองด้านล่างเปลี่ยนเฉพาะรายการนี้</p></div></div>
        <form class="manager-filter-grid leave-manager-filters" data-manager-filters novalidate data-leave-queue-form>
          <label class="field"><span>ชื่อหรือรหัสพนักงาน</span><input name="query" type="search" maxlength="100" placeholder="ค้นหาชื่อ รหัส หรือเลขรายการ" value="${e(queueSaved.query)}"></label>
          <label class="field"><span>กลุ่มงาน</span><select name="group"></select></label>
          <label class="field"><span>ประเภทลา</span><select name="type"><option value="">ทุกประเภท</option><option value="ลากิจ">ลากิจ</option><option value="ลาป่วย">ลาป่วย</option></select></label>
          <label class="field"><span>สถานะรายการ</span><select name="status">${statusOptions}</select></label>
          <div class="manager-filter-actions"><button class="button button-primary" type="submit">แสดงรายการ</button> <button class="button" data-clear-queue type="button">ล้างตัวกรอง</button></div>
        </form><div class="leave-manager-list-meta" data-queue-meta></div><div data-queue-content>${loadingView('กำลังโหลดคำขอลา…')}</div>
      </section>
      <section class="card card-pad attendance-section" data-leave-calendar></section>
    </section>
    <section id="leave-manager-report" class="leave-manager-panel" role="tabpanel" data-leave-panel="report" hidden>
      <section class="card card-pad attendance-section"><div class="section-title"><div><h2>รายงานการลา</h2><p class="small-muted">อ้างวันที่ลา Asia/Bangkok • แสดงส่วนของวันที่ทับซ้อนช่วงที่เลือก • วันที่ส่งและวันที่ตรวจแสดงแยกกัน</p></div></div>
        <form class="manager-filter-grid leave-manager-filters" data-manager-filters novalidate data-leave-report-form>
          <label class="field"><span>วันที่ลาเริ่ม</span><input name="from" type="date" required value="${e(reportSaved.from)}"></label>
          <label class="field"><span>วันที่ลาสิ้นสุด</span><input name="to" type="date" required value="${e(reportSaved.to)}"></label>
          <label class="field"><span>ชื่อหรือรหัสพนักงาน</span><input name="query" type="search" maxlength="100" placeholder="ค้นหาชื่อ รหัส หรือเลขรายการ" value="${e(reportSaved.query)}"></label>
          <label class="field"><span>กลุ่มงาน</span><select name="group"></select></label>
          <label class="field"><span>ประเภทลา</span><select name="type"><option value="">ทุกประเภท</option><option value="ลากิจ">ลากิจ</option><option value="ลาป่วย">ลาป่วย</option></select></label>
          <label class="field"><span>สถานะ</span><select name="status">${statusOptions}</select></label>
          <div class="manager-filter-actions"><button class="button button-primary" type="submit">แสดงผล</button> <button class="button" data-clear-report type="button">ล้างตัวกรอง</button></div>
          <p class="help-text leave-report-default-note">ค่าเริ่มต้น: วันที่ 1 ของเดือนนี้ถึงวันนี้ • ช่วงรายงานไม่ใช้ตัวกรองครึ่งเดือนของหน้าพนักงาน</p>
        </form>
        <div data-report-result>${loadingView('เลือกช่วงวันที่แล้วกดแสดงผล')}</div>
      </section>
    </section>
    <dialog class="admin-record-detail-dialog leave-manager-detail-dialog" data-leave-detail-dialog aria-labelledby="leave-detail-title"><div class="admin-record-detail-header"><h2 id="leave-detail-title">รายละเอียดคำขอลา</h2><button type="button" class="button button-small" data-close-leave-detail>ปิด</button></div><div class="admin-record-detail-content" data-leave-detail-content></div></dialog>`;

  const queueForm=root.querySelector('[data-leave-queue-form]'),reportForm=root.querySelector('[data-leave-report-form]');
  const queueHost=root.querySelector('[data-queue-content]'),queueMeta=root.querySelector('[data-queue-meta]');
  const reportHost=root.querySelector('[data-report-result]'),dialog=root.querySelector('[data-leave-detail-dialog]'),detailHost=root.querySelector('[data-leave-detail-content]');
  state.dialog=dialog;
  const groups=auth.role==='admin'?LEAVE_GROUPS:(LEAVE_GROUPS.includes(auth.main_group)?[auth.main_group]:[]);
  fillGroupSelect(queueForm.elements.group,groups,queueSaved.group);
  fillGroupSelect(reportForm.elements.group,groups,reportSaved.group);
  queueForm.elements.type.value=queueSaved.type;queueForm.elements.status.value=queueSaved.status;
  reportForm.elements.type.value=reportSaved.type;reportForm.elements.status.value=reportSaved.status;
  state.queueFilters.group=queueForm.elements.group.value;state.queueFilters.type=queueForm.elements.type.value;
  state.reportFilters.group=reportForm.elements.group.value;state.reportFilters.type=reportForm.elements.type.value;

  const closeStatus=()=>{state.statusModal?.close();state.statusModal=null;};
  const linkedController=()=>{
    const controller=new AbortController();
    const abort=()=>controller.abort();
    if(context.signal?.aborted)abort();else context.signal?.addEventListener('abort',abort,{once:true});
    return {controller,cleanup:()=>context.signal?.removeEventListener('abort',abort)};
  };
  const onAbort=()=>{
    state.disposed=true;state.queueSeq++;state.reportSeq++;state.detailSeq++;
    state.queueController?.abort();state.reportController?.abort();state.detailController?.abort();
    closeStatus();if(dialog?.open)dialog.close();root.replaceChildren();
  };
  context.signal?.addEventListener('abort',onAbort,{once:true});
  const alive=()=>!state.disposed&&!context.signal?.aborted&&root.isConnected&&currentMatches(actor);
  const statusError=(error,retry)=>{
    if(!alive())return;
    closeStatus();
    state.statusModal=showStatusModal({title:operationErrorTitle(error),message:error?.message||'ไม่สามารถอ่านข้อมูลจาก Supabase ได้',
      tone:'error',close:closeStatus,retry:retry?()=>{closeStatus();void retry();}:null});
  };
  const renderQueue=()=>{
    const queueLabel=state.queueFilters.status==='pending'?'คิวรอตรวจ (pending)':state.queueFilters.status==='all'?'คำขอทุกสถานะ':`คำขอสถานะ ${statusText(state.queueFilters.status)} (ไม่ใช่คิวรอตรวจ)`;
    queueMeta.textContent=`กำลังดู${queueLabel} • แสดง ${state.queueRows.length} จาก ${state.queueTotal} รายการตามตัวกรอง`;
    const list=state.queueRows.length?state.queueRows.map(row=>`<article class="card card-pad leave-manager-request" data-leave-row="${e(row.id)}">
      <div class="leave-manager-request-heading"><div><h3>${e(row.employee_name||'ไม่ระบุชื่อ')}</h3><p>${row.employee_code?`รหัส ${e(row.employee_code)} · `:''}${e(row.group_name||'ไม่ระบุกลุ่ม')}</p></div><span class="leave-status" data-status="${e(row.status)}">${e(statusText(row.status))}</span></div>
      <div class="leave-manager-request-facts"><span>${e(row.type||'ไม่ระบุประเภท')}</span><span>${e(dateLabel(row.start_date))} – ${e(dateLabel(row.end_date))}</span><span>${formatLeaveDays(row.requested_days)} วัน</span><span>ส่งเมื่อ ${e(thaiDateTime(row.created_at))}</span>${Number(row.attachment_count)>0?`<span>มีหลักฐาน ${Number(row.attachment_count)} รูป</span>`:''}</div>
      <button class="button button-small" type="button" data-open-leave-detail="${e(row.id)}">${row.status==='pending'?'เปิดและพิจารณา':'ดูรายละเอียด'}</button>
    </article>`).join(''):'<p class="empty-state">ไม่มีคำขอตามตัวกรองนี้</p>';
    const error=state.queueError?`<div class="notice notice-danger" role="alert"><strong>โหลดรายการไม่สำเร็จ</strong><p>${e(state.queueError)}</p><button class="button button-small" type="button" data-retry-queue>ลองโหลดใหม่</button></div>`:'';
    queueHost.innerHTML=list+error+(state.queueHasMore?'<div class="form-actions"><button class="button" type="button" data-more-queue>โหลดรายการถัดไป</button></div>':'');
    queueHost.querySelectorAll('[data-open-leave-detail]').forEach(button=>button.addEventListener('click',()=>void openDetail(button.dataset.openLeaveDetail)));
    queueHost.querySelector('[data-more-queue]')?.addEventListener('click',()=>void loadQueue({reset:false}));
    queueHost.querySelector('[data-retry-queue]')?.addEventListener('click',()=>void loadQueue({reset:true}));
  };
  async function loadQueue({reset=true}={}){
    if(!alive())return false;
    const seq=++state.queueSeq,linked=linkedController(),controller=linked.controller;
    state.queueController?.abort();state.queueController=controller;
    const filters={...state.queueFilters,limit:QUEUE_SIZE,offset:reset?0:state.queueOffset};
    state.queueError='';saveFilters(queueKey,state.queueFilters);
    if(reset){state.queueRows=[];state.queueOffset=0;state.queueTotal=0;state.queueHasMore=false;queueMeta.textContent='กำลังโหลดรายการ…';queueHost.innerHTML=loadingView('กำลังโหลดคำขอลา…');}
    else queueHost.insertAdjacentHTML('beforeend',loadingView('กำลังโหลดรายการถัดไป…'));
    try{
      const result=validateLeaveManagerQueueResponse(await api.readLeaveManagerQueuePage(filters,{signal:controller.signal}));
      if(seq!==state.queueSeq||controller.signal.aborted||!alive())return false;
      if(!reset&&state.queueLoaded&&(result.pending_count!==state.pendingCount||result.total_count!==state.queueTotal)){
        return await loadQueue({reset:true});
      }
      state.queueRows=reset?result.items:[...state.queueRows,...result.items];
      state.queueOffset=state.queueRows.length;state.queueTotal=result.total_count;state.pendingCount=result.pending_count;
      state.queueHasMore=result.has_more;state.queueLoaded=true;
      root.querySelector('[data-pending-count]').textContent=String(result.pending_count);
      root.querySelector('[data-pending-caption]').textContent=`รอตรวจทั้งหมดในขอบเขตที่มีสิทธิ์ • ตัวกรองรายการไม่เปลี่ยนตัวเลขนี้`;
      fillGroupSelect(queueForm.elements.group,result.available_groups,state.queueFilters.group);
      state.queueFilters.group=queueForm.elements.group.value;renderQueue();return true;
    }catch(error){
      if(seq!==state.queueSeq||controller.signal.aborted||!alive())return false;
      state.queueError=error?.message||'ไม่สามารถเชื่อมต่อได้';
      if(reset){state.queueRows=[];state.queueTotal=0;state.queueHasMore=false;state.queueLoaded=false;root.querySelector('[data-pending-count]').textContent='—';}
      renderQueue();return false;
    }finally{linked.cleanup();if(state.queueController===controller)state.queueController=null;}
  }

  const renderSummary=summary=>{
    const approvedDays=summary.approved_days===null?'ต้องตรวจข้อมูลซ้ำ':formatLeaveDays(summary.approved_days);
    const halfCount=summary.approved_half_periods===null?'—':formatLeaveDays(summary.approved_half_periods);
    const halfEquivalent=summary.approved_half_day_equivalent===null?'—':formatLeaveDays(summary.approved_half_day_equivalent);
    const overlap=Number(summary.overlap_anomaly_count)||0;
    return `<div class="leave-report-summary-grid">
      <article><span>คำขอในผลลัพธ์</span><strong>${Number(summary.request_count)}</strong></article>
      <article><span>พนักงานไม่ซ้ำ</span><strong>${Number(summary.employee_count)}</strong></article>
      <article><span>วันลาอนุมัติในช่วง</span><strong>${approvedDays}</strong><small>หน่วยวันเต็มเทียบเท่า • approved เท่านั้น</small></article>
      <article><span>ครึ่งวันอนุมัติ</span><strong>${halfCount} ช่วง</strong><small>เทียบเท่า ${halfEquivalent} วัน</small></article>
    </div>
    <p class="leave-report-status-counts"><strong>แยกจำนวนคำขอ:</strong> รอตรวจ ${Number(summary.status_counts.pending)} · อนุมัติ ${Number(summary.status_counts.approved)} · ไม่อนุมัติ ${Number(summary.status_counts.rejected)} · ยกเลิก ${Number(summary.status_counts.cancelled)}</p>
    ${overlap?`<p class="notice notice-danger" role="alert">พบวันลาซ้อนกัน ${overlap} วันในคำขอ pending/approved ระบบระงับยอดวันลาอนุมัติไว้เพื่อไม่บวกซ้ำ กรุณาตรวจข้อมูลต้นทาง</p>`:''}
    <section class="leave-report-subsection"><h3>สรุปรายบุคคล</h3><div class="leave-report-people">${summary.by_employee.length?summary.by_employee.map(person=>`<article class="card card-pad"><h4>${e(person.employee_name||'ไม่ระบุชื่อ')}</h4><p>${person.employee_code?`รหัส ${e(person.employee_code)} · `:''}${e((person.groups||[]).join(', ')||'ไม่ระบุกลุ่ม')}</p><div class="leave-report-person-metrics"><span>${Number(person.request_count)} คำขอ</span><span>อนุมัติ ${Number(person.approved_requests)} คำขอ</span><strong>อนุมัติ ${person.approved_days===null?'—':formatLeaveDays(person.approved_days)} วัน</strong><span>ครึ่งวัน ${person.approved_half_periods===null?'—':formatLeaveDays(person.approved_half_periods)} ช่วง</span></div></article>`).join(''):'<p class="empty-state">ไม่มีคำขอในช่วงและขอบเขตนี้</p>'}</div></section>
    <section class="leave-report-subsection"><h3>แยกตามประเภทลา</h3><div class="leave-report-types">${summary.by_type.length?summary.by_type.map(item=>`<article class="card card-pad"><h4>${e(item.type||'ไม่ระบุประเภท')}</h4><p>${Number(item.request_count)} คำขอ · อนุมัติ ${Number(item.approved_requests)} คำขอ</p><p>วันลาอนุมัติ ${item.approved_days===null?'—':formatLeaveDays(item.approved_days)} วัน</p></article>`).join(''):'<p class="empty-state">ไม่มีข้อมูลตามประเภทลา</p>'}</div></section>`;
  };
  const renderReport=()=>{
    if(!state.reportSummary)return;
    const rows=state.reportRows.length?state.reportRows.map(row=>`<article class="card card-pad leave-manager-request leave-report-request">
      <div class="leave-manager-request-heading"><div><h3>${e(row.employee_name||'ไม่ระบุชื่อ')}</h3><p>${row.employee_code?`รหัส ${e(row.employee_code)} · `:''}${e(row.group_name||'ไม่ระบุกลุ่ม')}</p></div><span class="leave-status" data-status="${e(row.status)}">${e(statusText(row.status))}</span></div>
      <div class="leave-manager-request-facts"><span>${e(row.type||'ไม่ระบุประเภท')}</span><span>ช่วงคำขอ ${e(dateLabel(row.start_date))} – ${e(dateLabel(row.end_date))}</span><span>ขอ ${formatLeaveDays(row.requested_days)} วัน</span><span>อยู่ในช่วงรายงาน ${formatLeaveDays(row.days_in_period)} วัน</span><span>ส่งเมื่อ ${e(thaiDateTime(row.created_at))}</span>${row.reviewed_at?`<span>ตรวจเมื่อ ${e(thaiDateTime(row.reviewed_at))}</span>`:''}</div>
      <button class="button button-small" type="button" data-open-leave-detail="${e(row.id)}">ดูรายละเอียด</button>
    </article>`).join(''):'<p class="empty-state">ไม่พบคำขอตามช่วงวันที่และตัวกรองนี้</p>';
    reportHost.innerHTML=renderSummary(state.reportSummary)+`<section class="leave-report-subsection"><h3>รายการคำขอในช่วงที่เลือก</h3><p class="small-muted">${e(dateLabel(state.reportFilters.from))} ถึง ${e(dateLabel(state.reportFilters.to))} • ${e(state.reportFilters.status==='all'?'ทุกสถานะ':statusText(state.reportFilters.status))} • วันที่ส่งไม่ใช้แทนวันที่ลา</p><div class="leave-report-list-meta">${state.reportRows.length} จาก ${state.reportTotal} รายการ</div>${rows}${state.reportError?`<div class="notice notice-danger" role="alert"><strong>โหลดรายการต่อไม่สำเร็จ</strong><p>${e(state.reportError)}</p><button class="button button-small" type="button" data-retry-report>ลองโหลดใหม่</button></div>`:''}${state.reportHasMore?'<div class="form-actions"><button class="button" type="button" data-more-report>โหลดรายการถัดไป</button></div>':''}</section>`;
    reportHost.querySelectorAll('[data-open-leave-detail]').forEach(button=>button.addEventListener('click',()=>void openDetail(button.dataset.openLeaveDetail)));
    reportHost.querySelector('[data-more-report]')?.addEventListener('click',()=>void loadReport({reset:false}));
    reportHost.querySelector('[data-retry-report]')?.addEventListener('click',()=>void loadReport({reset:false}));
  };
  async function loadReport({reset=true}={}){
    if(!alive())return false;
    const range=validateLeaveReportRange(state.reportFilters.from,state.reportFilters.to);
    if(!range.valid){
      const message=range.code==='DATE_ORDER'?'วันที่เริ่มต้องไม่หลังวันที่สิ้นสุด':range.code==='DATE_RANGE_TOO_LARGE'?'ช่วงวันที่กว้างเกิน 366 วัน กรุณาเลือกช่วงให้แคบลง':'กรุณาตรวจวันที่เริ่มและวันที่สิ้นสุด';
      state.reportLoaded=false;state.reportSummary=null;state.reportRows=[];reportHost.innerHTML=`<p class="notice notice-danger" role="alert">${e(message)}</p>`;
      statusError(Object.assign(new Error(message),{code:'VALIDATION_ERROR'}));return false;
    }
    const seq=++state.reportSeq,linked=linkedController(),controller=linked.controller;
    state.reportController?.abort();state.reportController=controller;
    const filters={...state.reportFilters,limit:REPORT_SIZE,offset:reset?0:state.reportOffset};
    state.reportError='';saveFilters(reportKey,state.reportFilters);
    if(reset){state.reportRows=[];state.reportOffset=0;state.reportTotal=0;state.reportSummary=null;state.reportHasMore=false;reportHost.innerHTML=loadingView('กำลังคำนวณรายงานการลาจาก Supabase…');}
    else reportHost.insertAdjacentHTML('beforeend',loadingView('กำลังโหลดรายการถัดไป…'));
    try{
      const result=validateLeaveManagerReportResponse(await api.readLeaveManagerReportPage(filters,{signal:controller.signal}));
      if(seq!==state.reportSeq||controller.signal.aborted||!alive())return false;
      const signature=JSON.stringify(result.summary);
      if(!reset&&state.reportLoaded&&(result.total_count!==state.reportTotal||signature!==state.reportSignature))return await loadReport({reset:true});
      state.reportRows=reset?result.items:[...state.reportRows,...result.items];state.reportOffset=state.reportRows.length;
      state.reportTotal=result.total_count;state.reportSummary=result.summary;state.reportSignature=signature;
      state.reportHasMore=result.has_more;state.reportLoaded=true;state.reportError='';renderReport();return true;
    }catch(error){
      if(seq!==state.reportSeq||controller.signal.aborted||!alive())return false;
      state.reportError=error?.message||'ไม่สามารถเชื่อมต่อได้';
      if(reset){state.reportRows=[];state.reportTotal=0;state.reportSummary=null;state.reportHasMore=false;state.reportLoaded=false;reportHost.innerHTML=`<div class="notice notice-danger" role="alert"><strong>${e(operationErrorTitle(error))}</strong><p>${e(state.reportError)}</p><button class="button button-small" type="button" data-retry-report>ลองโหลดใหม่</button></div>`;
        reportHost.querySelector('[data-retry-report]')?.addEventListener('click',()=>void loadReport({reset:true}));}
      else renderReport();
      return false;
    }finally{linked.cleanup();if(state.reportController===controller)state.reportController=null;}
  }

  function closeDetail(){if(dialog.open)dialog.close();state.activeDetail=null;state.detailController?.abort();state.detailController=null;}
  function detailDates(item){
    let dates=[];try{dates=storedLeaveItems(item);}catch{}
    if(!dates.length)return '<p class="small-muted">ไม่พบรายการวันลาที่อ่านได้</p>';
    return `<ul class="leave-manager-detail-days">${dates.map(day=>`<li><strong>${e(dateLabel(day.date))}</strong><span>${e(periodLabel(day.period||day.label))}</span></li>`).join('')}</ul>`;
  }
  function drawDetail(item,employeeCode=''){
    const own=item.employeeId===getAuthContext().employee_id||item.createdBy===getAuthContext().employee_id;
    const reviewScope=auth.role==='admin'||(auth.role==='executive'&&item.group===getAuthContext().main_group);
    const canReview=item.status==='pending'&&!own&&reviewScope;
    const audit=item.audit||null;
    detailHost.innerHTML=`<div class="leave-manager-detail">
      <div class="leave-manager-detail-person"><h3>${e(item.employee||'ไม่ระบุชื่อ')}</h3><p>${employeeCode?`รหัสพนักงาน ${e(employeeCode)} · `:''}${item.employeeId?`รหัสบัญชี ${e(item.employeeId)}`:''}${item.group?` · ${e(item.group)}`:''}</p></div>
      <dl class="leave-manager-detail-grid"><div><dt>ประเภทลา</dt><dd>${e(item.type||'—')}</dd></div><div><dt>สถานะ</dt><dd><span class="leave-status" data-status="${e(item.status)}">${e(statusText(item.status))}</span></dd></div>
        <div><dt>ช่วงที่ขอลา</dt><dd>${e(dateLabel(item.startDate))} – ${e(dateLabel(item.endDate))}</dd></div><div><dt>จำนวนตามคำขอ</dt><dd>${formatLeaveDays(item.totalDays)} วัน</dd></div>
        <div><dt>วันที่ส่ง</dt><dd>${e(thaiDateTime(item.createdAt))}</dd></div><div><dt>แก้ไขล่าสุด</dt><dd>${e(thaiDateTime(item.updatedAt))}</dd></div>
        <div><dt>ผู้ตรวจ</dt><dd>${e(item.reviewedBy||item.reviewerId||'—')}</dd></div><div><dt>วันที่ตรวจ</dt><dd>${e(item.reviewedAt?thaiDateTime(item.reviewedAt):'—')}</dd></div></dl>
      <section class="leave-manager-detail-section"><h4>รายละเอียดวันและช่วงลา</h4>${detailDates(item)}</section>
      <section class="leave-manager-detail-section"><h4>เหตุผล</h4><p class="leave-manager-reason">${e(item.reason||'—')}</p></section>
      ${item.status==='rejected'&&item.rejectionReason?`<section class="leave-manager-detail-section"><h4>เหตุผลไม่อนุมัติ</h4><p class="leave-manager-reason">${e(item.rejectionReason)}</p></section>`:''}
      ${item.status==='cancelled'&&item.cancellationReason?`<section class="leave-manager-detail-section"><h4>เหตุผลยกเลิก</h4><p class="leave-manager-reason">${e(item.cancellationReason)}</p></section>`:''}
      ${item.adminProxy?`<p class="small-muted">คำขอนี้ส่งแทนโดย Admin${item.adminProxyReason?` • ${e(item.adminProxyReason)}`:''}</p>`:''}
      <section class="leave-manager-detail-section"><h4>หลักฐานแนบ</h4><div data-leave-proof>${item.attachments?.length?`<p>${item.attachments.length} รูปแนบถูกเก็บใน private Storage</p><button class="button button-small" type="button" data-load-leave-proof>เปิดหลักฐาน</button>`:'<p class="small-muted">คำขอนี้ไม่มีรูปแนบ</p>'}</div></section>
      ${audit?`<section class="leave-manager-detail-section"><h4>Audit ล่าสุด</h4><p>${e(audit.action||'มีบันทึกการเปลี่ยนแปลง')} · ผู้ดำเนินการ ${e(audit.actor_employee_id||'—')} · ${e(thaiDateTime(audit.created_at))}</p></section>`:'<p class="small-muted">ไม่พบ Audit ล่าสุดในรายละเอียดที่อ่านได้</p>'}
      ${item.status==='pending'&&own?'<p class="notice notice-warning">ผู้ตรวจเป็นเจ้าของหรือเป็นผู้ยื่นแทนคำขอนี้ จึงยังไม่เปิดให้พิจารณาจนกว่าจะยืนยันนโยบาย</p>':''}
      ${canReview?`<section class="leave-manager-review"><h4>ผลพิจารณา</h4><label class="field"><span>เหตุผลเมื่อไม่อนุมัติ (จำเป็น)</span><textarea data-rejection-reason maxlength="500" placeholder="ระบุเหตุผลให้ผู้ขอลาทราบ"></textarea></label><p class="small-muted">ผลอนุมัติหรือไม่อนุมัติใช้วันและช่วงตามคำขอเดิม ไม่แก้ไขเนื้อหาคำขอ</p><div class="form-actions"><button class="button button-primary" type="button" data-decision="approved">อนุมัติ</button><button class="button button-danger" type="button" data-decision="rejected">ไม่อนุมัติ</button></div></section>`:''}
      </div>`;
    detailHost.querySelector('[data-load-leave-proof]')?.addEventListener('click',()=>void loadProof(item.id));
    detailHost.querySelectorAll('[data-decision]').forEach(button=>button.addEventListener('click',()=>void prepareReview(item,button.dataset.decision)));
    detailHost.querySelectorAll('[data-proof-retry]').forEach(button=>button.addEventListener('click',()=>void loadProof(item.id)));
    detailHost.querySelectorAll('img[data-leave-image]').forEach(image=>image.addEventListener('error',()=>{
      image.hidden=true;const proof=image.closest('[data-leave-proof]');if(!proof)return;
      const notice=document.createElement('p');notice.className='notice notice-danger';notice.textContent='มีหลักฐานแนบแต่โหลดรูปนี้ไม่สำเร็จ';
      const retry=document.createElement('button');retry.type='button';retry.className='button button-small';retry.dataset.proofRetry='true';retry.textContent='โหลดรูปอีกครั้ง';retry.addEventListener('click',()=>void loadProof(item.id));proof.append(notice,retry);
    }));
  }
  async function openDetail(id,{preserveReason=false}={}){
    if(!alive()||!id)return;
    const listRow=state.queueRows.find(row=>row.id===id)||state.reportRows.find(row=>row.id===id);
    state.detailEmployeeCode=listRow?.employee_code||'';
    const priorReason=preserveReason?detailHost.querySelector('[data-rejection-reason]')?.value:'';
    state.detailController?.abort();const seq=++state.detailSeq,linked=linkedController(),controller=linked.controller;state.detailController=controller;state.activeDetail=id;
    if(!dialog.open){if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');}
    detailHost.innerHTML=loadingView('กำลังโหลดรายละเอียดคำขอลา…');
    closeStatus();state.statusModal=showStatusModal({title:'กำลังโหลดรายละเอียด',message:'อ่านข้อมูลล่าสุดจาก Supabase',tone:'working'});
    try{
      const item=await api.readLeaveDetail(id,{signal:controller.signal});
      if(seq!==state.detailSeq||controller.signal.aborted||!alive()||state.activeDetail!==id)return;
      closeStatus();drawDetail(item,state.detailEmployeeCode);
      if(preserveReason&&detailHost.querySelector('[data-rejection-reason]'))detailHost.querySelector('[data-rejection-reason]').value=priorReason||'';
    }catch(error){
      if(seq!==state.detailSeq||controller.signal.aborted||!alive()||state.activeDetail!==id)return;
      closeStatus();detailHost.innerHTML=`<div class="notice notice-danger" role="alert"><strong>${e(operationErrorTitle(error))}</strong><p>${e(error?.message||'เปิดรายละเอียดไม่สำเร็จ')}</p><button class="button button-small" type="button" data-retry-detail>ลองโหลดรายละเอียดอีกครั้ง</button></div>`;
      detailHost.querySelector('[data-retry-detail]')?.addEventListener('click',()=>void openDetail(id,{preserveReason:true}));
    }finally{linked.cleanup();if(state.detailController===controller)state.detailController=null;}
  }
  async function loadProof(id){
    if(!alive()||state.activeDetail!==id)return;
    const host=detailHost.querySelector('[data-leave-proof]');if(!host)return;
    const seq=state.detailSeq,linked=linkedController(),controller=linked.controller;
    closeStatus();state.statusModal=showStatusModal({title:'กำลังโหลดหลักฐาน',message:'ขอ signed URL ชั่วคราวจาก private Storage',tone:'working'});
    try{
      const images=await api.readLeaveImages(id,{signal:controller.signal});
      if(seq!==state.detailSeq||controller.signal.aborted||!alive()||state.activeDetail!==id)return;
      closeStatus();
      if(!images.length){host.innerHTML='<p class="small-muted">คำขอนี้ไม่มีรูปหลักฐานแนบ</p>';return;}
      host.innerHTML=`<div class="leave-manager-proof-grid">${images.map((image,index)=>`<figure><img data-leave-image src="${escapeAttr(image.url)}" alt="หลักฐาน ${index+1}: ${e(image.name||'รูปแนบ')}"><figcaption>${e(image.name||`รูปแนบ ${index+1}`)}</figcaption></figure>`).join('')}</div>`;
      detailHost.querySelectorAll('img[data-leave-image]').forEach(image=>image.addEventListener('error',()=>{
        image.hidden=true;const proof=image.closest('[data-leave-proof]');if(!proof)return;
        if(!proof.querySelector('[data-proof-load-failed]')){const notice=document.createElement('p');notice.className='notice notice-danger';notice.dataset.proofLoadFailed='true';notice.textContent='มีหลักฐานแนบแต่โหลดรูปไม่สำเร็จ';const retry=document.createElement('button');retry.type='button';retry.className='button button-small';retry.dataset.proofRetry='true';retry.textContent='ขอรูปอีกครั้ง';retry.addEventListener('click',()=>void loadProof(id));proof.append(notice,retry);}
      }));
    }catch(error){
      if(seq!==state.detailSeq||controller.signal.aborted||!alive()||state.activeDetail!==id)return;
      closeStatus();host.innerHTML=`<p class="notice notice-danger" role="alert">${e(error?.message||'มีหลักฐานแนบแต่โหลดรูปไม่สำเร็จ')}</p><button class="button button-small" type="button" data-proof-retry>ลองโหลดหลักฐานอีกครั้ง</button>`;
      host.querySelector('[data-proof-retry]')?.addEventListener('click',()=>void loadProof(id));
    }finally{linked.cleanup();}
  }
  async function prepareReview(item,decision){
    if(!alive()||!validStatus(decision)||!['approved','rejected'].includes(decision)||state.statusModal)return;
    const rejection=detailHost.querySelector('[data-rejection-reason]');
    const reason=decision==='rejected'?String(rejection?.value||'').trim():'อนุมัติคำขอลา';
    if(decision==='rejected'&&(!reason||reason.length>500)){
      rejection?.setCustomValidity(reason?'ระบุเหตุผลไม่เกิน 500 ตัวอักษร':'กรุณาระบุเหตุผลไม่อนุมัติ');rejection?.reportValidity();rejection?.focus();return;
    }
    if(rejection)rejection.setCustomValidity('');
    const current=getAuthContext(),id=current.employee_id;
    if(item.employeeId===id||item.createdBy===id){statusError(Object.assign(new Error('ยังไม่มีนโยบายอนุญาตให้ตรวจคำขอที่ผู้ตรวจเป็นเจ้าของหรือยื่นแทนเอง'),{code:'PERMISSION_DENIED'}));return;}
    if(!(current.role==='admin'||(current.role==='executive'&&item.group===current.main_group))){statusError(Object.assign(new Error('ไม่มีสิทธิ์พิจารณาคำขอในกลุ่มงานนี้'),{code:'PERMISSION_DENIED'}));return;}
    closeStatus();state.statusModal=showStatusModal({title:'กำลังตรวจสอบสถานะล่าสุด',message:'โหลดคำขอและสิทธิ์ปัจจุบันก่อนยืนยัน',tone:'working'});
    const linked=linkedController(),controller=linked.controller;
    try{
      const latest=await api.readLeaveDetail(item.id,{signal:controller.signal});
      if(controller.signal.aborted||!alive()||state.activeDetail!==item.id)return;
      if(latest.status!=='pending')throw Object.assign(new Error('คำขอนี้ดำเนินการแล้วหรือเปลี่ยนสถานะ กรุณาโหลดรายการใหม่'),{code:'STATUS_CONFLICT'});
      if(latest.employeeId===id||latest.createdBy===id||!(current.role==='admin'||(current.role==='executive'&&latest.group===current.main_group)))
        throw Object.assign(new Error('ไม่มีสิทธิ์พิจารณาคำขอลานี้'),{code:'PERMISSION_DENIED'});
      const dayList=storedLeaveItems(latest).map(day=>`${dateLabel(day.date)} ${periodLabel(day.period||day.label)}`).join(', ');
      state.statusModal.update({title:'ยืนยันผลพิจารณา',message:`${labelReview(decision)}คำขอของ ${latest.employee||'ไม่ระบุชื่อ'}?`,
        detail:`${latest.type||'ลา'} • ${dateLabel(latest.startDate)} ถึง ${dateLabel(latest.endDate)} • ${formatLeaveDays(latest.totalDays)} วัน • ${dayList}`,
        tone:'info',confirmLabel:decision==='approved'?'ยืนยันอนุมัติ':'ยืนยันไม่อนุมัติ',
        confirm:()=>{void commitReview(latest,decision,reason);},close:closeStatus});
    }catch(error){
      if(!controller.signal.aborted&&alive())statusError(error,()=>openDetail(item.id,{preserveReason:true}));
    }finally{linked.cleanup();}
  }
  async function commitReview(latest,decision,reason){
    if(!alive()||state.statusModal===null)return;
    const current=getAuthContext(),attemptKey=latest.id+':'+decision,attempt=state.reviewAttempts.get(attemptKey)||{};
    const recoveryKey=`factory-pwa-leave-review-v1:${encodeURIComponent(current.employee_id)}:${latest.id}:${decision}`;
    if(!attempt.id){try{const saved=JSON.parse(sessionStorage.getItem(recoveryKey)||'null');if(saved?.id)attempt.id=saved.id;}catch{}}
    attempt.id ||= crypto.randomUUID();
    try{sessionStorage.setItem(recoveryKey,JSON.stringify({id:attempt.id}));}catch{}
    state.reviewAttempts.set(attemptKey,attempt);
    const modal=state.statusModal;modal.update({title:decision==='approved'?'กำลังอนุมัติ':'กำลังบันทึกผลไม่อนุมัติ',message:'ใช้ workflow เดิมและรอผลอ่านกลับพร้อม Audit',tone:'working'});
    detailHost.querySelectorAll('[data-decision]').forEach(button=>button.disabled=true);
    try{
      const result=await api.mutateLeaveRequest('review',{id:latest.id,decision,reason,updatedAt:latest.updatedAt,attempt,
        onProgress:message=>{if(alive()&&state.statusModal===modal)modal.update({title:decision==='approved'?'กำลังอนุมัติ':'กำลังบันทึกผลไม่อนุมัติ',message,tone:'working'});}});
      if(!alive()||state.statusModal!==modal)return;
      const saved=result?.saved;
      if(!saved||saved.status!==decision||saved.reviewerId!==current.employee_id||!saved.reviewedAt||
          saved.audit?.actor_employee_id!==current.employee_id||!saved.audit?.id||
          (decision==='rejected'&&saved.rejectionReason!==reason))
        throw Object.assign(new Error('อ่านสถานะ ผู้ตรวจ เวลา หรือ Audit กลับมาไม่ครบ กรุณาตรวจสอบคำขอก่อนทำซ้ำ'),{code:'INCOMPLETE_WRITE'});
      try{sessionStorage.removeItem(recoveryKey);}catch{}
      state.statusModal.update({title:decision==='approved'?'อนุมัติสำเร็จ':'บันทึกผลสำเร็จ',
        message:`${latest.employee||'พนักงาน'} • ${dateLabel(latest.startDate)} – ${dateLabel(latest.endDate)} • ${formatLeaveDays(latest.totalDays)} วัน`,
        detail:`ผู้ตรวจ ${current.employee_id} • ${thaiDateTime(saved.reviewedAt)} • Audit ${saved.audit.id}`,
        tone:'success',close:closeStatus});
      drawDetail(saved,state.detailEmployeeCode);void loadQueue({reset:true});if(state.reportLoaded)void loadReport({reset:true});
      root._refreshLeaveCalendar?.();
    }catch(error){
      if(!alive()||state.statusModal!==modal)return;
      if(attempt.id===null||error?.code==='OPERATION_ABORTED')try{sessionStorage.removeItem(recoveryKey);}catch{}
      detailHost.querySelectorAll('[data-decision]').forEach(button=>button.disabled=false);
      const retry=()=>openDetail(latest.id,{preserveReason:true});
      statusError(error,retry);
    }
  }

  root.querySelectorAll('[data-leave-tab]').forEach(button=>button.addEventListener('click',()=>{
    if(!alive())return;
    const tab=button.dataset.leaveTab;
    root.querySelectorAll('[data-leave-tab]').forEach(item=>item.setAttribute('aria-selected',String(item===button)));
    root.querySelectorAll('[data-leave-panel]').forEach(panel=>panel.hidden=panel.dataset.leavePanel!==tab);
    if(tab==='report'&&!state.reportLoaded)void loadReport({reset:true});
  }));
  queueForm.addEventListener('submit',event=>{event.preventDefault();state.queueFilters={query:queueForm.elements.query.value.trim(),group:queueForm.elements.group.value,
    type:queueForm.elements.type.value,status:queueForm.elements.status.value};void loadQueue({reset:true});});
  root.querySelector('[data-clear-queue]').addEventListener('click',()=>{
    queueForm.elements.query.value='';queueForm.elements.group.value='';queueForm.elements.type.value='';queueForm.elements.status.value='pending';
    state.queueFilters={...defaultQueue};void loadQueue({reset:true});
  });
  reportForm.addEventListener('submit',event=>{event.preventDefault();state.reportFilters={from:reportForm.elements.from.value,to:reportForm.elements.to.value,
    query:reportForm.elements.query.value.trim(),group:reportForm.elements.group.value,type:reportForm.elements.type.value,status:reportForm.elements.status.value};
    if(!validateLeaveReportRange(state.reportFilters.from,state.reportFilters.to).valid){void loadReport({reset:true});return;}state.reportLoaded=false;void loadReport({reset:true});});
  root.querySelector('[data-clear-report]').addEventListener('click',()=>{
    reportForm.elements.from.value=defaultRange.from;reportForm.elements.to.value=defaultRange.to;reportForm.elements.query.value='';
    reportForm.elements.group.value='';reportForm.elements.type.value='';reportForm.elements.status.value='all';
    state.reportFilters={...defaultReport};state.reportLoaded=false;void loadReport({reset:true});
  });
  root.querySelector('[data-leave-manager-refresh]').addEventListener('click',()=>{
    state.queueLoaded=false;void loadQueue({reset:true});if(!root.querySelector('[data-leave-panel="report"]').hidden){state.reportLoaded=false;void loadReport({reset:true});}
    root._refreshLeaveCalendar?.();
  });
  root.querySelector('[data-close-leave-detail]').addEventListener('click',closeDetail);
  dialog.addEventListener('click',event=>{if(event.target===dialog)closeDetail();});
  dialog.addEventListener('close',()=>{state.activeDetail=null;state.detailController?.abort();state.detailController=null;});

  if(context.workspace==='employee'&&auth.role==='admin'){
    root.classList.add('leave-manager-admin-workspace');
  }
  if(alive())mountApprovedLeaveCalendar(root,context);
  void loadQueue({reset:true});
  return {refresh:()=>{void loadQueue({reset:true});if(state.reportLoaded)void loadReport({reset:true});root._refreshLeaveCalendar?.();}};
}
