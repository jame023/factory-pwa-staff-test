import * as workApi from "../../adapters/package07.js?v=1.3.322";
import { overtimeGroupsForContext } from "../../js/ot-service.js?v=1.3.322";
import { escapeHtml as e, bangkokToday, thaiDateTime } from "../../js/utils.js?v=1.3.260";
import { requireOnlineAction } from "../../js/offline.js?v=1.3.260";
import { isOvertimeDateAllowed, previousBangkokDate } from "../../js/ot-date-rules.js?v=1.3.260";
import { showStatusModal, isStatusModalOpen } from "../../components/status-modal.js?v=1.3.295";
import { getAuthContext } from "../../js/access-context.js?v=1.3.260";
import { formatReportedDuration, OT_REPORT_PAGE_SIZE, validateExecutiveOtResponse, validateOtReportRange } from "../../js/executive-ot-report-rules.js?v=1.3.322";
import { loadingView } from "../../components/loading.js?v=1.3.186";

const MAX_PHOTOS=5, MAX_FILE_BYTES=512*1024, MAX_TOTAL_BYTES=2*1024*1024, MAX_SOURCE_BYTES=20*1024*1024;
const formatDuration=row=>{
  const minutes=Number.isInteger(row?.duration_minutes)?row.duration_minutes:Math.round(Number(row?.hours)*60);
  if(!Number.isFinite(minutes))return "--:--";
  return String(Math.floor(minutes/60)).padStart(2,"0")+":"+String(minutes%60).padStart(2,"0");
};
const TYPES=["image/png","image/jpeg","image/webp"];
const canvasBlob=(canvas,quality)=>new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",quality));
async function compressImage(file,targetBytes) {
  if(file.size<=targetBytes)return {file,compressed:false};
  if(typeof createImageBitmap!=="function")throw new Error("เบราว์เซอร์นี้ยังบีบอัดรูปอัตโนมัติไม่ได้ กรุณาใช้รูปขนาดเล็กลง");
  let bitmap;
  try{bitmap=await createImageBitmap(file);}catch{throw new Error("เปิดรูปนี้เพื่อบีบอัดไม่ได้ กรุณาเลือกรูป JPG, PNG หรือ WebP");}
  try {
    let scale=Math.min(1,2000/Math.max(bitmap.width,bitmap.height));
    const canvas=document.createElement("canvas"),ctx=canvas.getContext("2d");
    if(!ctx)throw new Error("เตรียมพื้นที่บีบอัดรูปไม่สำเร็จ");
    let quality=.88,blob=null;
    for(let attempt=0;attempt<10;attempt++){
      canvas.width=Math.max(1,Math.round(bitmap.width*scale));
      canvas.height=Math.max(1,Math.round(bitmap.height*scale));
      ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
      blob=await canvasBlob(canvas,quality);
      if(blob&&blob.size<=targetBytes){
        const base=file.name.replace(/\.[^.]+$/,"");
        return {file:new File([blob],base+".jpg",{type:"image/jpeg",lastModified:Date.now()}),compressed:true};
      }
      if(attempt%2===0)quality=Math.max(.42,quality-.12);
      else scale*=.82;
    }
    throw new Error("บีบอัดรูปให้พอดีไม่ได้ กรุณาเลือกรูปที่เล็กลง");
  } finally {bitmap.close?.();}
}

function managerActorKey() {
  const auth=getAuthContext();
  return `${auth.authenticated}|${auth.active}|${auth.employee_id||""}|${auth.role||""}|${auth.permissions_version||""}`;
}

function reportDateLabel(value) {
  const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value||""));
  return match?`${match[3]}/${match[2]}/${match[1]}`:"วันที่ไม่ถูกต้อง";
}

function reportStatusLabel(value) {
  return value==="submitted"?"ส่งรายงานแล้ว":String(value||"สถานะไม่ระบุ");
}

async function renderExecutiveOtDashboard(root, context) {
  const today=bangkokToday(),firstOfMonth=`${today.slice(0,7)}-01`,filterKey=`factory-pwa-ot-report-filter:${encodeURIComponent(managerActorKey())}`;
  let initialFilters={from:firstOfMonth,to:today,query:"",group:""};
  try{const saved=JSON.parse(sessionStorage.getItem(filterKey)||"null");if(saved&&typeof saved.from==="string"&&typeof saved.to==="string"&&typeof saved.query==="string"&&typeof saved.group==="string"&&saved.query.length<=100&&validateOtReportRange(saved.from,saved.to).valid)initialFilters={from:saved.from,to:saved.to,query:saved.query,group:saved.group};}catch{}
  const state={filters:initialFilters,items:[],employees:[],hasMore:false,offset:0,
    totalCount:0,employeeCount:0,daysCount:0,totalMinutes:0,snapshot:"",availableGroups:[],querySeq:0,detailSeq:0,
    queryController:null,detailController:null,activeDetail:null,modal:null,disposed:false};
  root.innerHTML='<div class="page-heading"><div><p class="eyebrow">Overtime</p><h1>รายงาน OT</h1><p>แสดงระยะเวลาที่พนักงานรายงาน โดยอ้างอิงวันที่ทำ OT (เวลาไทย)</p></div><button class="button" data-manager-refresh type="button">รีเฟรช</button></div>'+
    '<form class="card card-pad manager-filter-grid ot-manager-filters" data-manager-filters novalidate><label class="field"><span>ชื่อหรือรหัสพนักงาน</span><input name="query" type="search" maxlength="100" placeholder="ค้นหาชื่อหรือรหัส"></label>'+
    '<label class="field"><span>กลุ่มงานของรายงาน</span><select name="group"><option value="">ทุกกลุ่มที่มีสิทธิ์</option></select></label>'+
    '<label class="field"><span>วันที่ทำ OT เริ่ม</span><input name="from" type="date" value="'+e(initialFilters.from)+'" required></label>'+
    '<label class="field"><span>วันที่ทำ OT สิ้นสุด</span><input name="to" type="date" value="'+e(initialFilters.to)+'" required></label>'+
    '<div class="manager-filter-actions"><button class="button button-primary" type="submit">แสดงผล</button> <button class="button" data-manager-clear type="button">ล้างตัวกรอง</button></div>'+
    '<p class="help-text manager-filter-note">ใช้กลุ่มงานที่บันทึกไว้กับรายงาน OT · รวมวันเริ่มและวันสิ้นสุด · เขตเวลา Asia/Bangkok</p></form>'+
    '<div class="ot-manager-loading" data-manager-refreshing aria-live="polite" hidden></div>'+
    '<section class="ot-manager-summary" aria-label="สรุปรายงาน OT"><h2>สรุปตามตัวกรอง</h2><div class="ot-manager-summary-grid">'+
    '<article class="card card-pad"><span>รายงาน OT</span><strong data-manager-report-count>—</strong></article><article class="card card-pad"><span>พนักงานไม่ซ้ำ</span><strong data-manager-employee-count>—</strong></article><article class="card card-pad"><span>วันที่ทำ OT ไม่ซ้ำ</span><strong data-manager-day-count>—</strong></article><article class="card card-pad"><span>ระยะเวลาที่รายงานรวม</span><strong data-manager-total-duration>—</strong></article></div></section>'+
    '<section class="ot-manager-people"><div class="section-title"><h2>สรุปรายบุคคล</h2><span class="small-muted">เรียงตามชื่อพนักงาน</span></div><div data-manager-employees></div></section>'+
    '<section class="ot-manager-list"><div class="section-title"><h2>รายการรายงาน OT</h2><span class="small-muted" data-manager-list-count></span></div><div data-manager-list aria-live="polite"></div><div class="ot-manager-more"><button class="button" data-manager-more type="button" hidden>โหลดเพิ่ม</button></div></section>'+ 
    '<dialog class="admin-record-detail-dialog" data-manager-detail-dialog aria-labelledby="manager-ot-detail-title"><div class="admin-record-detail-dialog__body"><header class="admin-record-detail-dialog__header"><h2 id="manager-ot-detail-title">รายละเอียดทำงานล่วงเวลา (OT)</h2><button class="button admin-record-detail-dialog__close admin-detail-close-button" type="button" data-manager-detail-close aria-label="ปิดรายละเอียด">×</button></header><div class="screen-detail-content" data-manager-detail-content aria-live="polite"></div><footer class="admin-record-detail-dialog__footer"><button class="button button-primary" type="button" data-manager-detail-close>ปิดรายละเอียด</button></footer></div></dialog>';
  const form=root.querySelector("[data-manager-filters]"),list=root.querySelector("[data-manager-list]"),detailDialog=root.querySelector("[data-manager-detail-dialog]"),detailHost=root.querySelector("[data-manager-detail-content]");
  form.elements.query.value=initialFilters.query;
  const closeModal=key=>{const modal=state[key];if(modal){state[key]=null;modal.close();}};
  const resetDetail=()=>{
    state.detailSeq++;state.detailController?.abort();state.detailController=null;state.activeDetail=null;
    if(detailDialog.open)detailDialog.close();
    detailHost.replaceChildren();
  };
  detailDialog.querySelectorAll("[data-manager-detail-close]").forEach(button=>button.addEventListener("click",resetDetail));
  detailDialog.addEventListener("cancel",event=>{event.preventDefault();resetDetail();});
  const setLoadingMessage=message=>{const loading=root.querySelector("[data-manager-refreshing]");loading.innerHTML=message?loadingView(message):"";loading.hidden=!message;};
  const authCurrent=actor=>!state.disposed&&!context.signal?.aborted&&managerActorKey()===actor;
  const escape=e;
  const clearSensitiveResults=()=>{
    state.items=[];state.employees=[];state.hasMore=false;state.offset=0;state.totalCount=0;state.employeeCount=0;state.daysCount=0;state.totalMinutes=0;state.snapshot="";
    resetDetail();list.replaceChildren();root.querySelector("[data-manager-employees]").replaceChildren();
    for(const selector of ["[data-manager-report-count]","[data-manager-employee-count]","[data-manager-day-count]","[data-manager-total-duration]"])root.querySelector(selector).textContent="—";
    closeModal("modal");
  };
  const drawSummary=data=>{
    root.querySelector("[data-manager-report-count]").textContent=String(data.total_count);
    root.querySelector("[data-manager-employee-count]").textContent=String(data.employee_count);
    root.querySelector("[data-manager-day-count]").textContent=String(data.ot_days_count);
    root.querySelector("[data-manager-total-duration]").textContent=`${formatReportedDuration(data.total_duration_minutes)} (ชั่วโมง:นาที)`;
    root.querySelector("[data-manager-list-count]").textContent=`${state.items.length} จาก ${data.total_count} รายงาน`;
    const groupSelect=form.elements.group,selected=state.filters.group;
    const safeGroups=data.available_groups.filter(group=>["สกรีน","ผลิต","ขนส่ง"].includes(group));
    state.availableGroups=safeGroups;
    groupSelect.innerHTML='<option value="">ทุกกลุ่มที่มีสิทธิ์</option>'+safeGroups.map(group=>'<option value="'+escape(group)+'">'+escape(group)+'</option>').join("");
    groupSelect.value=safeGroups.includes(selected)?selected:"";
    root.querySelector("[data-manager-employees]").innerHTML=data.employees.length?data.employees.map(person=>{
      const groupNames=Array.isArray(person.groups)?person.groups.filter(Boolean).join(", "):"—";
      return '<article class="card card-pad ot-manager-person"><div class="ot-manager-person-heading"><div><h3>'+escape(person.employee_name||"ไม่ระบุชื่อ")+'</h3><p class="small-muted">'+(person.employee_code?'รหัส '+escape(person.employee_code)+' · ':'')+'กลุ่มจากรายงาน: '+escape(groupNames||"—")+'</p></div><button class="button button-small" type="button" data-manager-person="'+escape(person.employee_id)+'">ดูรายการ</button></div><div class="ot-manager-person-metrics"><span>'+Number(person.report_count)+' รายงาน</span><span>'+Number(person.ot_days_count)+' วัน</span><strong>'+formatReportedDuration(Number(person.total_duration_minutes))+'</strong></div></article>';
    }).join(""):'<p class="empty-state">ไม่พบรายงาน OT สำหรับสรุปรายบุคคล</p>';
  };
  const drawList=()=>{
    resetDetail();
    root.querySelector("[data-manager-list-count]").textContent=`${state.items.length} จาก ${state.totalCount} รายงาน`;
    list.innerHTML=state.items.length?state.items.map(row=>'<article class="card card-pad ot-manager-report"><div class="ot-manager-report-head"><div><h3>'+escape(reportDateLabel(row.date))+'</h3><p><strong>'+escape(row.employee_name||"ไม่ระบุชื่อ")+'</strong>'+(row.employee_code?' · '+escape(row.employee_code):'')+' · '+escape(row.group_name||"ไม่ระบุกลุ่ม")+'</p></div><span class="badge badge-info">'+formatReportedDuration(Number(row.duration_minutes))+'</span></div><p class="ot-manager-report-details">'+escape(row.details||"ไม่มีรายละเอียด")+'</p><p class="small-muted">'+Number(row.attachment_count)+' รูป · ส่งเมื่อ '+escape(thaiDateTime(row.created_at))+' · '+escape(reportStatusLabel(row.status||"submitted"))+'</p><button class="button button-small" type="button" data-open-manager-report="'+escape(row.id)+'">ดูรายละเอียด</button></article>').join(""):'<p class="empty-state">ไม่พบรายงานในช่วงนี้</p>';
    list.querySelectorAll("[data-open-manager-report]").forEach(button=>button.addEventListener("click",()=>void openDetail(button.dataset.openManagerReport)));
    root.querySelector("[data-manager-more]").hidden=!state.hasMore;
  };
  const renderError=(error,retry)=>{
    const title=error?.code==="PERMISSION_DENIED"?"ไม่มีสิทธิ์":error?.code==="SESSION_EXPIRED"?"Session หมดอายุ":"ไม่สามารถโหลดข้อมูลได้";
    closeModal("modal");state.modal=showStatusModal({title,message:error?.message||"เชื่อมต่อข้อมูลรายงาน OT ไม่สำเร็จ",tone:"error",close:()=>closeModal("modal"),retry:error?.code==="PERMISSION_DENIED"||error?.code==="SESSION_EXPIRED"?null:()=>{closeModal("modal");void retry();}});
  };
  const readFilters=()=>({from:form.elements.from.value,to:form.elements.to.value,query:form.elements.query.value.trim(),group:form.elements.group.value});
  async function load({reset=true,filters=state.filters}={}){
    if(state.disposed||context.signal?.aborted)return false;
    const range=validateOtReportRange(filters.from,filters.to);
    if(!range.valid){
      const message=range.code==="DATE_ORDER"?"วันที่เริ่มต้องไม่หลังวันที่สิ้นสุด":range.code==="DATE_RANGE_TOO_LARGE"?"ช่วงวันที่กว้างเกิน 366 วัน กรุณาเลือกช่วงให้แคบลง":"กรุณาตรวจวันที่เริ่มและวันที่สิ้นสุด";
      closeModal("modal");state.modal=showStatusModal({title:"ช่วงวันที่ไม่ถูกต้อง",message,tone:"error",close:()=>closeModal("modal")});return false;
    }
    const seq=++state.querySeq,actor=managerActorKey(),controller=new AbortController();
    try{sessionStorage.setItem(filterKey,JSON.stringify(filters));}catch{}
    state.queryController?.abort();state.queryController=controller;
    const routeAbort=()=>controller.abort();context.signal?.addEventListener("abort",routeAbort,{once:true});
    if(reset){state.filters={...filters};state.items=[];state.offset=0;state.totalCount=0;state.employeeCount=0;state.daysCount=0;state.totalMinutes=0;state.snapshot="";state.employees=[];drawList();
      closeModal("modal");setLoadingMessage("กำลังโหลดรายงาน OT · กำลังคำนวณสรุปจาก Supabase…");
    } else setLoadingMessage("กำลังโหลดรายการ OT เพิ่ม…");
    try{
      const result=validateExecutiveOtResponse(await workApi.readExecutiveOvertimeDashboard({...filters,limit:OT_REPORT_PAGE_SIZE,offset:reset?0:state.offset},{signal:controller.signal}));
      if(seq!==state.querySeq)return false;
      if(!authCurrent(actor)){clearSensitiveResults();return false;}
      const snapshot=String(result.snapshot_updated_at||"");
      if(!reset&&(Number(result.total_count)!==state.totalCount||Number(result.total_duration_minutes)!==state.totalMinutes||snapshot!==state.snapshot)){
        setLoadingMessage("ข้อมูลเปลี่ยนระหว่างโหลด กำลังคำนวณสรุปและโหลดรายการใหม่…");
        return await load({reset:true,filters:state.filters});
      }
      state.items=reset?result.items:[...state.items,...result.items];state.offset=state.items.length;
      state.totalCount=Number(result.total_count);state.employeeCount=Number(result.employee_count);state.daysCount=Number(result.ot_days_count);
      state.totalMinutes=Number(result.total_duration_minutes);state.snapshot=snapshot;state.hasMore=result.has_more;state.employees=result.employees;
      drawSummary(result);drawList();closeModal("modal");setLoadingMessage("");return true;
    }catch(error){
      if(seq!==state.querySeq||controller.signal.aborted)return false;
      if(!authCurrent(actor)){clearSensitiveResults();return false;}
       if(reset){resetDetail();state.items=[];state.employees=[];list.innerHTML='<p class="empty-state">โหลดข้อมูลไม่สำเร็จ</p>';root.querySelector("[data-manager-employees]").replaceChildren();root.querySelector("[data-manager-report-count]").textContent="—";root.querySelector("[data-manager-employee-count]").textContent="—";root.querySelector("[data-manager-day-count]").textContent="—";root.querySelector("[data-manager-total-duration]").textContent="—";root.querySelector("[data-manager-more]").hidden=true;}
      renderError(error,()=>load({reset:true,filters:state.filters}));return false;
    }finally{
      context.signal?.removeEventListener("abort",routeAbort);
      if(state.queryController===controller)state.queryController=null;
      if(seq===state.querySeq)setLoadingMessage("");
    }
  }
  async function openDetail(id,{keepDialogOpen=false}={}){
    if(state.disposed||context.signal?.aborted||!id)return;
    if(state.detailController){state.detailController.abort();state.detailController=null;}
    const seq=++state.detailSeq,actor=managerActorKey(),controller=new AbortController();state.detailController=controller;state.activeDetail=id;
    if(!detailDialog.open){if(typeof detailDialog.showModal==="function")detailDialog.showModal();else detailDialog.setAttribute("open","");}
    const routeAbort=()=>controller.abort();context.signal?.addEventListener("abort",routeAbort,{once:true});
    const showDetailLoading=message=>{detailHost.innerHTML='<div class="ot-manager-detail">'+loadingView(message)+'</div>';};
    if(!keepDialogOpen)detailHost.replaceChildren();
    showDetailLoading("กำลังโหลดรายละเอียด OT…");
    try{
      const report=await workApi.readOvertimeReport(id,"manager",{signal:controller.signal,onPhase:message=>{if(seq===state.detailSeq&&state.activeDetail===id&&authCurrent(actor))showDetailLoading(message);}});
      if(seq!==state.detailSeq||state.activeDetail!==id)return;
      if(!authCurrent(actor)){clearSensitiveResults();return;}
      const files=Array.isArray(report.attachments)?report.attachments:[];
      detailHost.innerHTML='<div class="ot-manager-detail"><h4>'+escape(report.employee_name||"ไม่ระบุชื่อ")+'</h4><p><strong>รหัสพนักงาน:</strong> '+escape(report.employee_code||"—")+' · <strong>กลุ่มงานของรายงาน:</strong> '+escape(report.group_name||"—")+'</p><p><strong>วันที่ทำ OT:</strong> '+escape(reportDateLabel(report.date))+' · <strong>ระยะเวลาที่รายงาน:</strong> '+formatReportedDuration(Number(report.duration_minutes))+'</p><p><strong>สถานะ:</strong> '+escape(reportStatusLabel(report.status||"submitted"))+'</p><div class="ot-manager-full-details"><strong>รายละเอียดงาน</strong><p>'+escape(report.details||"ไม่มีรายละเอียด")+'</p></div><p class="small-muted">ส่งเมื่อ '+escape(thaiDateTime(report.created_at))+' · แก้ไขล่าสุด '+escape(thaiDateTime(report.updated_at))+'</p><div class="ot-evidence-grid">'+(files.length?files.map((file,index)=>file.image_error||!file.signed_url?'<article class="ot-evidence-item ot-evidence-error"><span>'+escape(file.name||`รูป ${index+1}`)+'</span><p>โหลดรูปหลักฐานไม่สำเร็จ</p><button class="button button-small" type="button" data-retry-manager-photo>โหลดรูปอีกครั้ง</button></article>':'<a class="ot-evidence-item" href="'+escape(file.signed_url)+'" target="_blank" rel="noreferrer"><img data-evidence-image alt="'+escape(file.name||"รูปหลักฐาน")+'" src="'+escape(file.signed_url)+'"><span>'+escape(file.name||"รูปหลักฐาน")+'</span></a>').join(""):'<p class="small-muted">รายงานนี้ไม่มีรูปหลักฐานแนบ</p>')+'</div></div>';
      detailHost.querySelectorAll("[data-retry-manager-photo]").forEach(button=>button.addEventListener("click",()=>void openDetail(id,{keepDialogOpen:true})));
      detailHost.querySelectorAll("img[data-evidence-image]").forEach(img=>img.addEventListener("error",()=>{const link=img.closest(".ot-evidence-item");if(link){link.classList.add("ot-evidence-error");link.innerHTML='<span>รูปหลักฐานหมดอายุหรือโหลดไม่สำเร็จ</span><button class="button button-small" type="button">โหลดรูปอีกครั้ง</button>';link.querySelector("button").addEventListener("click",()=>void openDetail(id,{keepDialogOpen:true}));}}));
    }catch(error){
      if(seq!==state.detailSeq||controller.signal.aborted||state.activeDetail!==id)return;
      if(!authCurrent(actor)){clearSensitiveResults();return;}
      const title=error?.code==="PERMISSION_DENIED"?"ไม่มีสิทธิ์":error?.code==="SESSION_EXPIRED"?"Session หมดอายุ":"เปิดรายละเอียดไม่สำเร็จ";
      detailHost.innerHTML='<div class="notice notice-danger" role="alert"><strong>'+escape(title)+'</strong><p>'+escape(error?.message||"ไม่พบรายงาน OT หรือไม่มีสิทธิ์เปิดรายการนี้")+'</p></div>'+(['PERMISSION_DENIED','SESSION_EXPIRED'].includes(error?.code)?'':'<button class="button button-primary" type="button" data-retry-manager-detail>ลองโหลดรายละเอียดอีกครั้ง</button>');
      detailHost.querySelector("[data-retry-manager-detail]")?.addEventListener("click",()=>void openDetail(id,{keepDialogOpen:true}));
    }finally{context.signal?.removeEventListener("abort",routeAbort);if(state.detailController===controller)state.detailController=null;}
  }
  form.addEventListener("submit",event=>{event.preventDefault();void load({reset:true,filters:readFilters()});});
  root.querySelector("[data-manager-clear]").addEventListener("click",()=>{form.elements.query.value="";form.elements.group.value="";form.elements.from.value=firstOfMonth;form.elements.to.value=today;void load({reset:true,filters:{from:firstOfMonth,to:today,query:"",group:""}});});
  root.querySelector("[data-manager-refresh]").addEventListener("click",()=>void load({reset:true,filters:state.filters}));
  root.querySelector("[data-manager-more]").addEventListener("click",()=>void load({reset:false,filters:state.filters}));
  root.querySelector("[data-manager-employees]").addEventListener("click",event=>{const button=event.target.closest("[data-manager-person]");if(!button)return;form.elements.query.value=button.dataset.managerPerson;form.requestSubmit();});
  root.querySelector("[data-manager-refresh]").disabled=false;
  context.onDataChange?.(()=>load({reset:true,filters:state.filters}));
  if(context.signal){
     context.signal.addEventListener("abort",()=>{state.disposed=true;state.querySeq++;state.queryController?.abort();resetDetail();closeModal("modal");},{once:true});
  }
  await load({reset:true,filters:state.filters});
}

export async function render(root, context) {
  const manager=(context.user.role==="admin" || context.user.role==="executive") && context.workspace !== "employee";
  if(manager){await renderExecutiveOtDashboard(root,context);return;}
  const showForm=context.workspace==="employee" && (context.user.role==="admin" || overtimeGroupsForContext(context.user).length>0);
  let rows=[], selectedFiles=[], existingFiles=[], editing=null, pendingRecoveryDate='', previewUrls=[], historyOffset=0, historyTotalMinutes=0, loadSequence=0, historyCount=0;
  const clearPreviewUrls=()=>{previewUrls.forEach(url=>URL.revokeObjectURL(url));previewUrls=[];};
  const draw=()=>{
    root.querySelector("[data-ot-list]").innerHTML=rows.map(row=>{
      const auth=getAuthContext(),canEdit=(!manager&&(auth.role==='admin'||overtimeGroupsForContext(auth).length>0))||(auth.role==='admin'&&(row.owner_id||row.employee_id)===auth.employee_id);
      const employeeLabel=manager&&row.employee_name?'<p class="small-muted">พนักงาน: '+e(row.employee_name)+' · '+e(row.group_name||'')+'</p>':'';
      return '<article class="card card-pad attendance-section ot-record"><div class="ot-record-heading"><h3>'+e(row.date||"")+'</h3><span class="badge badge-info">'+e(formatDuration(row))+' OT</span></div>'+employeeLabel+'<p class="small-muted">ส่งเมื่อ '+e(thaiDateTime(row.created_at||row.createdAt))+' · '+Number(row.attachment_count||0)+' รูป</p><p class="ot-record-details">'+e(row.details||"")+'</p><button class="button button-small" type="button" data-open-report="'+e(row.id)+'">ดูรายละเอียด</button>'+(canEdit?' <button class="button button-small" type="button" data-edit-report="'+e(row.id)+'">แก้ไข</button>':'')+'</article>';
    }).join("")||'<p class="empty-state">ยังไม่มีรายการ OT</p>';
    const total=root.querySelector("[data-ot-total]");if(total)total.textContent=`รวม ${Math.floor(historyTotalMinutes/60)} ชั่วโมง ${historyTotalMinutes%60} นาที`;
    const more=root.querySelector("[data-ot-more]");if(more)more.hidden=rows.length>=historyCount;
  };
  root.innerHTML='<div class="page-heading"><div><p class="eyebrow">Overtime</p><h1>'+(manager?"รายงาน OT":"กรอกข้อมูล OT")+'</h1><p>'+(manager?"ตรวจรายการ OT รายละเอียดงาน และรูปหลักฐานของพนักงาน":"บันทึกงานที่ทำล่วงเวลาเพื่อให้ผู้บริหารตรวจสอบ")+'</p></div><button class="button" data-refresh>รีเฟรช</button></div><p class="notice notice-warning">ข้อมูล OT และรูปแนบจะบันทึกใน Supabase หลังยืนยันสำเร็จ</p>'+
  (showForm?'<section class="card form-card ot-form-card"><div class="ot-form-intro"><span class="ot-form-icon" aria-hidden="true">◷</span><div><h2>บันทึก OT</h2><p>กรอกรายละเอียดงาน พร้อมแนบรูปประกอบได้สูงสุด '+MAX_PHOTOS+' รูป</p></div></div><form data-ot-form><div class="form-grid"><label class="field"><span>วันที่ทำ OT</span><div class="ot-date-control"><span>เลือกวันที่</span><input name="date" type="date" value="'+e(bangkokToday())+'" required></div></label><label class="field"><span>ระยะเวลา OT (HH:MM)</span><div class="ot-duration-control"><div class="ot-time-control"><div class="ot-time-segment"><span>ชั่วโมง</span><select name="durationHour" required aria-label="ชั่วโมง OT"></select></div><span class="ot-time-separator" aria-hidden="true">:</span><div class="ot-time-segment"><span>นาที</span><select name="durationMinute" required aria-label="นาที OT"></select></div></div></div><span class="help-text">เลือกชั่วโมง 00–12 และนาที 00–59 ได้ทุกค่า (สูงสุด 12:59)</span></label><label class="field field-full"><span>รายละเอียดงานที่ทำ</span><textarea name="details" minlength="5" maxlength="1000" required placeholder="ระบุงานที่ทำและผลที่ได้"></textarea><span class="help-text">ช่วยให้ผู้บริหารตรวจสอบงาน OT ได้ชัดเจน</span></label><div class="field field-full"><span class="field-label">รูปหลักฐาน <span class="ot-optional">ไม่บังคับ</span></span><div class="ot-upload-box" data-dropzone><div class="ot-upload-mark" aria-hidden="true">＋</div><div class="ot-upload-copy"><strong>เพิ่มรูปภาพหลักฐาน</strong><span>เลือกได้ครั้งละหลายรูป หรือเพิ่มรูปภายหลังได้</span><small>PNG, JPG หรือ WebP • GIF แบบเคลื่อนไหวยังไม่รองรับ • ระบบบีบอัดรูปใหญ่ให้อัตโนมัติ • สูงสุด 5 รูป • รวมไม่เกิน 2 MB</small></div><label class="button button-small ot-upload-button" for="ot-photo-input">เลือกรูป<input id="ot-photo-input" name="photoInput" class="ot-file-input" type="file" accept="image/png,image/jpeg,image/webp" multiple></label></div><div class="ot-photo-status" data-photo-status aria-live="polite">ยังไม่ได้เลือกรูป</div><div class="ot-photo-grid" data-photo-grid></div></div></div><div class="ot-recorder"><span class="ot-recorder-avatar" aria-hidden="true">'+e((context.user.name||"พ").slice(0,1))+'</span><div><span class="ot-recorder-label">ผู้บันทึก</span><strong>'+e(context.user.name)+'</strong><small>ยืนยันจากบัญชีที่เข้าสู่ระบบ</small></div></div><button class="button button-primary ot-submit" type="submit">ส่งข้อมูล OT</button></form></section>':"")+
  '<div class="section-title"><h2>'+(manager?'รายการ OT ทั้งหมด':'ประวัติ OT ของฉัน')+'</h2></div><div class="ot-history-filters"><label class="field"><span>เดือนที่ทำ OT</span><input type="month" data-ot-month></label><p class="small-muted">ตัวกรองอ้างอิงวันที่ทำ OT · <span data-ot-total>กำลังโหลดผลรวม</span></p></div><div data-ot-list></div><button class="button" data-ot-more hidden>โหลดเพิ่ม</button><div data-ot-detail-host></div>';
  const form=root.querySelector("[data-ot-form]");
  const dateInput=form?.elements.date;
  const refreshDateValidity=()=>{
    if(!dateInput)return;
    const today=bangkokToday(),earliest=previousBangkokDate(today),keepOriginal=Boolean((editing&&dateInput.value===editing.originalDate)||(pendingRecoveryDate&&dateInput.value===pendingRecoveryDate));
    const unchangedOriginal=editing&&dateInput.value===editing.originalDate?editing.originalDate:pendingRecoveryDate;
    dateInput.min=keepOriginal&&unchangedOriginal<earliest?unchangedOriginal:earliest;
    dateInput.max=today;
    dateInput.setCustomValidity(dateInput.value&&!keepOriginal&&!isOvertimeDateAllowed(dateInput.value,today)?"\u{e40}\u{e25}\u{e37}\u{e2d}\u{e01}\u{e27}\u{e31}\u{e19}\u{e17}\u{e35}\u{e48}\u{e44}\u{e14}\u{e49}\u{e40}\u{e09}\u{e1e}\u{e32}\u{e30}\u{e27}\u{e31}\u{e19}\u{e19}\u{e35}\u{e49}\u{e2b}\u{e23}\u{e37}\u{e2d}\u{e40}\u{e21}\u{e37}\u{e48}\u{e2d}\u{e27}\u{e32}\u{e19}\u{e15}\u{e32}\u{e21}\u{e40}\u{e27}\u{e25}\u{e32}\u{e44}\u{e17}\u{e22}":"");
  };
  dateInput?.addEventListener("input",refreshDateValidity);
  dateInput?.addEventListener("change",refreshDateValidity);
dateInput?.insertAdjacentHTML("afterend",'<span class="help-text">\u{e1a}\u{e31}\u{e19}\u{e17}\u{e36}\u{e01}\u{e44}\u{e14}\u{e49}\u{e15}\u{e31}\u{e49}\u{e07}\u{e41}\u{e15}\u{e48}\u{e40}\u{e21}\u{e37}\u{e48}\u{e2d}\u{e27}\u{e32}\u{e19}\u{e16}\u{e36}\u{e07}\u{e27}\u{e31}\u{e19}\u{e19}\u{e35}\u{e49}\u{e15}\u{e32}\u{e21}\u{e40}\u{e27}\u{e25}\u{e32}\u{e44}\u{e17}\u{e22}\u{20}\u{b7}\u{20}\u{e07}\u{e32}\u{e19}\u{e02}\u{e49}\u{e32}\u{e21}\u{e40}\u{e17}\u{e35}\u{e48}\u{e22}\u{e07}\u{e04}\u{e37}\u{e19}\u{e43}\u{e2b}\u{e49}\u{e19}\u{e31}\u{e1a}\u{e15}\u{e32}\u{e21}\u{e27}\u{e31}\u{e19}\u{e17}\u{e35}\u{e48}\u{e40}\u{e23}\u{e34}\u{e48}\u{e21}\u{20}\u{4f}\u{54}</span>');
  refreshDateValidity();
  if(form){
    const auth=getAuthContext(),groups=overtimeGroupsForContext(auth);
    const selected=groups.includes(auth.selected_group)?auth.selected_group:groups[0];
    form.insertAdjacentHTML('afterbegin','<label class="field"><span>กลุ่มงานที่ทำ OT</span><select name="otGroup" required>'+ (groups.length?groups.map(group=>'<option value="'+e(group)+'"'+(group===selected?' selected':'')+'>'+e(group)+'</option>').join(''):'<option value="">ไม่มีสิทธิ์กลุ่มงาน OT</option>')+'</select></label><p><button class="button button-small" type="button" data-recover-ot>ตรวจรายการส่งค้าง</button> <button class="button button-small" type="button" data-abandon-ot hidden>ยกเลิกรายการส่งค้าง</button> <button class="button button-small" type="button" data-cancel-edit hidden>ยกเลิกการแก้ไข</button></p>');
  }

  const durationHour=form?.elements.durationHour, durationMinute=form?.elements.durationMinute;
  if(durationHour)for(let hour=0;hour<=12;hour++){const value=String(hour).padStart(2,"0"),option=document.createElement("option");option.value=value;option.textContent=value;durationHour.append(option);}
  if(durationMinute)for(let minute=0;minute<60;minute++){const value=String(minute).padStart(2,"0"),option=document.createElement("option");option.value=value;option.textContent=value;durationMinute.append(option);}



  const fileInput=form?.elements.photoInput, previewGrid=form?.querySelector("[data-photo-grid]");
  const photoStatus=form?.querySelector("[data-photo-status]"), dropzone=form?.querySelector("[data-dropzone]");
  previewGrid?.insertAdjacentHTML('beforebegin','<div class="ot-photo-grid" data-existing-photos></div>');
  const existingGrid=form?.querySelector('[data-existing-photos]');
  const drawFiles=()=>{
    clearPreviewUrls();
    if(existingGrid)existingGrid.innerHTML=existingFiles.map((file,index)=>'<article class="ot-photo-card"><img src="'+e(file.signed_url)+'" alt="รูปเดิม '+e(file.name)+'"><div class="ot-photo-info"><strong>'+e(file.name)+'</strong><span>รูปเดิม · '+(file.byte_size/1024).toFixed(0)+' KB</span></div><button class="ot-photo-remove" type="button" data-remove-existing="'+index+'">นำออก</button></article>').join("");
    previewGrid.innerHTML=selectedFiles.map((file,index)=>{
      const url=URL.createObjectURL(file);previewUrls.push(url);
      return '<article class="ot-photo-card"><img src="'+e(url)+'" alt="ตัวอย่าง '+e(file.name)+'"><div class="ot-photo-info"><strong>'+e(file.name)+'</strong><span>'+(file.size/1024).toFixed(0)+' KB</span></div><button class="ot-photo-remove" type="button" data-remove-photo="'+index+'" aria-label="ลบรูป '+e(file.name)+'">ลบ</button></article>';
    }).join("");
    const count=selectedFiles.length+existingFiles.length;
    photoStatus.textContent=count?"เลือกแล้ว "+count+" จาก "+MAX_PHOTOS+" รูป":"ยังไม่ได้เลือกรูป";
    form.querySelector(".ot-upload-button")?.classList.toggle("is-disabled",count>=MAX_PHOTOS);
  };
  const addFiles=async files=>{
    const incoming=Array.from(files||[]);if(!incoming.length)return;
    if(existingFiles.length+selectedFiles.length+incoming.length>MAX_PHOTOS){context.showToast("แนบได้สูงสุด "+MAX_PHOTOS+" รูป","error");return;}
    if(incoming.some(file=>!TYPES.includes(file.type)||file.size>MAX_SOURCE_BYTES)){context.showToast("เลือกรูป PNG, JPG หรือ WebP ที่มีขนาดไม่เกิน 20 MB ต่อรูป (GIF แบบเคลื่อนไหวยังไม่รองรับ)","error");return;}
    const modal=showStatusModal({title:"กำลังเตรียมรูป",message:"กำลังตรวจชนิดและบีบอัดภาพ",tone:"working",dismissOnEscape:false});
    photoStatus.textContent="กำลังตรวจและปรับขนาดรูป…";dropzone?.classList.add("is-processing");
    try{
      let total=existingFiles.reduce((sum,file)=>sum+file.byte_size,0)+selectedFiles.reduce((sum,file)=>sum+file.size,0),compressedCount=0;
      const processed=[];
      for(const file of incoming){
        const target=Math.min(MAX_FILE_BYTES,MAX_TOTAL_BYTES-total);
        if(target<16*1024)throw new Error("พื้นที่รูปที่เหลือไม่พอ กรุณาลบรูปบางรูปก่อน");
        const result=await compressImage(file,target);
        processed.push(result.file);total+=result.file.size;
        if(result.compressed)compressedCount++;
      }
      selectedFiles.push(...processed);drawFiles();modal.update({title:"เตรียมรูปสำเร็จ",message:"รูปพร้อมแนบในรายงานแล้ว",tone:"success",close:()=>modal.close()});
      if(compressedCount)context.showToast("บีบอัดรูปขนาดใหญ่ให้อัตโนมัติแล้ว "+compressedCount+" รูป","success");
    }catch(error){photoStatus.textContent=selectedFiles.length?"เลือกรูปเพิ่มไม่สำเร็จ • รายการเดิมยังอยู่":"เพิ่มรูปไม่สำเร็จ";modal.update({title:"เตรียมรูปไม่สำเร็จ",message:error.message||"ตรวจไฟล์รูปไม่ได้",tone:"error",close:()=>modal.close()});}
    finally{dropzone?.classList.remove("is-processing");}
  };
  fileInput?.addEventListener("change",()=>{void addFiles(fileInput.files);fileInput.value="";});
  previewGrid?.addEventListener("click",event=>{const button=event.target.closest("[data-remove-photo]");if(button){selectedFiles.splice(Number(button.dataset.removePhoto),1);drawFiles();}});
  existingGrid?.addEventListener("click",event=>{const button=event.target.closest("[data-remove-existing]");if(button){existingFiles.splice(Number(button.dataset.removeExisting),1);drawFiles();}});
  dropzone?.addEventListener("dragover",event=>{event.preventDefault();dropzone.classList.add("is-dragging");});
  dropzone?.addEventListener("dragleave",event=>{if(!dropzone.contains(event.relatedTarget))dropzone.classList.remove("is-dragging");});
  dropzone?.addEventListener("drop",event=>{event.preventDefault();dropzone.classList.remove("is-dragging");void addFiles(event.dataTransfer?.files);});
  function resetForm(){
    editing=null;pendingRecoveryDate='';existingFiles=[];selectedFiles=[];form.elements.otGroup.disabled=false;
    form.elements.otGroup.querySelector('[data-temporary-group]')?.remove();
    form.reset();form.elements.date.value=bangkokToday();refreshDateValidity();form.querySelector('[data-cancel-edit]').hidden=true;form.querySelector('[data-abandon-ot]').hidden=true;
    form.querySelector('[type="submit"]').textContent="ส่งข้อมูล OT";drawFiles();
  }
  function fillEdit(report,values=report,keepPaths=null){
    editing={id:report.id,version:Number(report.version),originalDate:report.date||values.date||''};
    existingFiles=(report.attachments||[]).filter(file=>!keepPaths||keepPaths.includes(file.path));
    form.elements.date.value=values.date||'';refreshDateValidity();
    form.elements.durationHour.value=String(Math.floor(values.duration_minutes/60)).padStart(2,'0');
    form.elements.durationMinute.value=String(values.duration_minutes%60).padStart(2,'0');
    form.elements.details.value=values.details||'';
    if(![...form.elements.otGroup.options].some(option=>option.value===report.group_name)){
      const option=document.createElement('option');option.value=report.group_name;option.textContent=report.group_name;option.dataset.temporaryGroup='true';form.elements.otGroup.append(option);
    }
    form.elements.otGroup.value=report.group_name;form.elements.otGroup.disabled=true;
    form.querySelector('[data-cancel-edit]').hidden=false;
    form.querySelector('[type="submit"]').textContent="บันทึกการแก้ไข";drawFiles();
  }
  form?.querySelector('[data-cancel-edit]')?.addEventListener('click',async event=>{
    if(!editing){resetForm();return;}
    const button=event.currentTarget,auth=getAuthContext();if(button.disabled)return;
    button.disabled=true;form.inert=true;
    const modal=showStatusModal({title:"กำลังตรวจรายการแก้ไขค้าง",message:"กำลังตรวจ Supabase ก่อนปิดแบบฟอร์มแก้ไข",tone:"working",dismissOnEscape:false});
    try{
      const result=await workApi.abandonOvertimeEdit(auth.employee_id);
      if(context.signal?.aborted||getAuthContext().employee_id!==auth.employee_id){modal.close();return;}
      if(result.state==='none'){resetForm();modal.close();return;}
      if(result.state==='saved'){
        resetForm();const historyLoaded=await load({reset:true});
        modal.update({title:"พบการแก้ไขที่บันทึกแล้ว",message:historyLoaded?result.superseded?"ระบบตรวจพบการแก้ไขเดิมและมีการแก้ไขภายหลัง กรุณาตรวจข้อมูลล่าสุด":result.cleanupPending?"ระบบตรวจ Audit แล้วและเก็บไฟล์ที่ต้องล้างไว้ตรวจต่อ":"ระบบบันทึกและตรวจ Audit แล้ว":"ยืนยันการแก้ไขเดิมแล้ว แต่โหลดประวัติไม่สำเร็จ กรุณารีเฟรช",tone:historyLoaded?"success":"error",close:()=>modal.close()});return;
      }
      if(!result.cleanupPending)resetForm();const historyLoaded=await load({reset:true});
      modal.update({title:result.cleanupPending?"ยกเลิก request แล้ว แต่ไฟล์ยังต้องจัดการ":"ยกเลิกรายการแก้ไขค้างแล้ว",message:result.cleanupPending?"ระบบเข้าคิวไฟล์ชั่วคราวแล้ว ปุ่มยกเลิกการแก้ไขยังอยู่สำหรับลองล้างอีกครั้ง":historyLoaded?"ยืนยันว่าไม่มีการแก้ไขถูกบันทึกแล้ว สามารถปิดแบบฟอร์มได้":"ยกเลิก request เดิมแล้ว แต่โหลดประวัติไม่สำเร็จ กรุณารีเฟรช",tone:result.cleanupPending||!historyLoaded?"error":"success",close:()=>modal.close()});
    }catch(error){modal.update({title:"ปิดแบบฟอร์มแก้ไขไม่ได้",message:error.message||"ยังยืนยันกับ Supabase ไม่ได้",tone:"error",close:()=>modal.close(),retry:()=>{modal.close();button.click();}});}
    finally{button.disabled=false;form.inert=false;}
  });
  form?.addEventListener("submit",async event=>{
    event.preventDefault();if(!requireOnlineAction("ส่งข้อมูล OT"))return;
    const button=form.querySelector('[type="submit"]');if(button.disabled)return;
    const editMode=Boolean(editing);
    button.disabled=true;form.inert=true;button.textContent=editMode?"กำลังบันทึกการแก้ไข…":"กำลังส่งรายงาน OT…";
    let modal=showStatusModal({title:"กำลังตรวจสอบข้อมูล",message:"กำลังเตรียมส่งรายงาน OT",tone:"working",dismissOnEscape:false});
    try{
      const values=Object.fromEntries(new FormData(form));
      const durationText=String(values.durationHour||"").padStart(2,"0")+":"+String(values.durationMinute||"").padStart(2,"0");
      const durationMatch=/^(\d{2}):(\d{2})$/.exec(durationText);
      const durationMinutes=durationMatch?Number(durationMatch[1])*60+Number(durationMatch[2]):0;
      if(!durationMatch||!(/^(?:0\d|1[0-2]):[0-5]\d$/).test(durationText)||durationMinutes<1||durationMinutes>779)throw new Error("กรุณาเลือกระยะเวลา OT ตั้งแต่ 00:01 ถึง 12:59");
      if(!/^\d{4}-\d{2}-\d{2}$/.test(values.date)||Number.isNaN(Date.parse(values.date+"T00:00:00Z")))throw new Error("กรุณาเลือกวันที่ทำ OT ให้ถูกต้อง"); if(!isOvertimeDateAllowed(values.date,bangkokToday())&&!(editMode&&values.date===editing.originalDate)&&values.date!==pendingRecoveryDate)throw Object.assign(new Error("OT date must be today or yesterday (Bangkok time)."),{code:"OT_DATE_OUT_OF_RANGE"});
      if(String(values.details||"").trim().length<5)throw new Error("กรุณาระบุรายละเอียดงานอย่างน้อย 5 ตัวอักษร");
      const auth=getAuthContext();
      if(!auth.authenticated||!auth.active)throw Object.assign(new Error("Session หมดอายุหรือบัญชีไม่ได้ใช้งาน"),{code:"SESSION_EXPIRED"});
      if(!editMode&&(!['สกรีน','ผลิต','ขนส่ง'].includes(values.otGroup)||(auth.role!=='admin'&&!(auth.groups||[]).includes(values.otGroup))))throw Object.assign(new Error("เลือกกลุ่มงานที่ได้รับสิทธิ์กรอก OT ก่อนส่งรายงาน"),{code:"PERMISSION_DENIED"});
      modal.update({title:editMode?"กำลังบันทึกการแก้ไข":"กำลังส่งรายงาน OT",message:selectedFiles.length?"กำลังอัปโหลดรูปและบันทึกข้อมูล":"กำลังบันทึกข้อมูล",tone:"working"});
      const payload={date:values.date,duration_minutes:durationMinutes,details:String(values.details).trim(),files:[...selectedFiles],owner_id:auth.employee_id};
      const result=editMode?await workApi.editOvertimeReport({...payload,id:editing.id,expected_version:editing.version,keep_attachments:[...existingFiles]}):await workApi.submitOvertimeRequest({...payload,group_name:values.otGroup});
      modal.update({title:"กำลังตรวจสอบข้อมูล",message:"กำลังอ่านรายงานกลับจาก Supabase",tone:"working"});
      resetForm();
      const historyLoaded=await load({reset:true});
      if(historyLoaded)modal.update({title:editMode?"บันทึกการแก้ไขสำเร็จ":"ส่งรายงาน OT สำเร็จ",message:result?.superseded?"การแก้ไขนี้บันทึกแล้ว และมีการแก้ไขภายหลัง กรุณาตรวจข้อมูลล่าสุด":result?.cleanupPending?"บันทึกและตรวจ Audit แล้ว ไฟล์เดิมที่ถอดออกถูกบันทึกไว้เพื่อจัดการต่อ":"บันทึกและอ่านข้อมูลกลับจาก Supabase แล้ว",tone:"success",close:()=>modal.close()});
      else modal.update({title:"บันทึกรายงานแล้ว",message:"ตรวจรายงานที่บันทึกกลับแล้ว แต่โหลดประวัติไม่สำเร็จ กรุณารีเฟรชประวัติ",tone:"error",close:()=>modal.close()});
    }catch(error){modal.update({title:error.code==="PERMISSION_DENIED"?"ไม่มีสิทธิ์":error.code==="SESSION_EXPIRED"?"Session หมดอายุ":editMode?"บันทึกการแก้ไขไม่สำเร็จ":"ส่งรายงาน OT ไม่สำเร็จ",message:error.message||"ไม่สามารถเชื่อมต่อได้",tone:"error",close:()=>modal.close(),retry:error.code==="EDIT_CONFLICT"?null:()=>{modal.close();form.requestSubmit();}});}
    finally{button.disabled=false;form.inert=false;button.textContent=editing?"บันทึกการแก้ไข":"ส่งข้อมูล OT";}
  });
  async function load({reset=true}={}){
    const seq=++loadSequence,employee=getAuthContext().employee_id,refresh=root.querySelector("[data-refresh]"),month=root.querySelector("[data-ot-month]")?.value;
    if(refresh)refresh.disabled=true;
    let modal=null;if(reset&&!isStatusModalOpen())modal=showStatusModal({title:"กำลังโหลดประวัติ OT",message:"กำลังอ่านข้อมูลจาก Supabase",tone:"working"});
    try{
      const from=month?`${month}-01`:"1900-01-01",to=month?new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10):"2999-12-31";
      const page=await workApi.listOvertimeRequests({from,to,limit:25,offset:reset?0:historyOffset,scope:manager&&context.user.role==='admin'?'admin':'self'});if(seq!==loadSequence||getAuthContext().employee_id!==employee)return false;
      if(!Array.isArray(page?.items)||page.total_count==null||page.total_duration_minutes==null||!Number.isSafeInteger(Number(page.total_count))||Number(page.total_count)<0||!Number.isSafeInteger(Number(page.total_duration_minutes))||Number(page.total_duration_minutes)<0)throw new Error("ข้อมูลประวัติ OT ที่ได้รับไม่สมบูรณ์");
      const items=page.items;
      rows=reset?items:[...rows,...items];historyOffset=rows.length;historyCount=Number(page.total_count);historyTotalMinutes=Number(page.total_duration_minutes);draw();modal?.close();return true;
    }catch(error){if(seq!==loadSequence||getAuthContext().employee_id!==employee)return false;if(reset){rows=[];root.querySelector("[data-ot-list]").innerHTML='<p class="empty-state">โหลดประวัติ OT ไม่สำเร็จ</p>';root.querySelector("[data-ot-total]").textContent="ไม่สามารถโหลดผลรวม";root.querySelector("[data-ot-more]").hidden=true;}modal?.update({title:"โหลดประวัติ OT ไม่สำเร็จ",message:error.message||"ไม่สามารถเชื่อมต่อได้",tone:"error",close:()=>modal.close(),retry:()=>{modal.close();void load({reset:true});}});return false;}
    finally{if(refresh)refresh.disabled=false;}
  }
  root.querySelector("[data-ot-month]")?.addEventListener("change",()=>{historyOffset=0;void load({reset:true});});
  root.querySelector("[data-ot-more]")?.addEventListener("click",()=>void load({reset:false}));
  root.querySelector("[data-ot-list]")?.addEventListener("click",async event=>{
    const editButton=event.target.closest("[data-edit-report]");
    if(editButton&&form){
      if(editing||form.elements.details.value.trim()||selectedFiles.length){const warning=showStatusModal({title:"มีข้อมูลในฟอร์ม",message:"กรุณาส่งหรือจัดการข้อมูลที่กำลังกรอกก่อนเปิดรายการแก้ไข",tone:"error",close:()=>warning.close()});return;}
      const modal=showStatusModal({title:"กำลังโหลดรายงาน",message:"กำลังตรวจสิทธิ์และโหลดรูปเดิม",tone:"working"});
      const employee=getAuthContext().employee_id;
      try{
        const report=await workApi.readOvertimeReport(editButton.dataset.editReport);
        if(context.signal?.aborted||getAuthContext().employee_id!==employee){modal.close();return;}
        if(!Number.isSafeInteger(Number(report.version)))throw new Error("ไม่พบรุ่นรายงานสำหรับป้องกันการแก้ชนกัน");
        fillEdit(report);modal.update({title:"พร้อมแก้ไขรายงาน",message:"แก้ข้อมูลและรูปได้ รูปเดิมจะยังอยู่จนกว่าจะบันทึกสำเร็จ",tone:"info",close:()=>{modal.close();form.scrollIntoView({block:"start",behavior:"smooth"});}});
      }catch(error){modal.update({title:"เปิดแก้ไขไม่สำเร็จ",message:error.message||"ไม่สามารถเชื่อมต่อได้",tone:"error",close:()=>modal.close()});}
      return;
    }
    const button=event.target.closest("[data-open-report]");if(!button)return;
    const modal=showStatusModal({title:"กำลังโหลดรายละเอียด OT",message:"กำลังตรวจสิทธิ์และโหลดรูปหลักฐาน",tone:"working"});
    const employee=getAuthContext().employee_id;
    try{const report=await workApi.readOvertimeReport(button.dataset.openReport,manager&&context.user.role==='admin'?'admin':'self');if(getAuthContext().employee_id!==employee){modal.close();return;}const host=root.querySelector("[data-ot-detail-host]");
      host.innerHTML='<section class="card card-pad ot-detail"><button class="button button-small" data-close-detail>ปิดรายละเอียด</button><h2>'+e(report.date)+'</h2>'+(manager?'<p><strong>พนักงาน:</strong> '+e(report.employee_name||'—')+' · '+e(report.group_name||'')+'</p>':'')+'<p><strong>ระยะเวลา:</strong> '+e(formatDuration(report))+'</p><p>'+e(report.details)+'</p><p>สร้าง '+e(thaiDateTime(report.created_at))+' · แก้ไข '+e(thaiDateTime(report.updated_at))+'</p><div class="ot-evidence-grid">'+(report.attachments||[]).map(file=>'<a class="ot-evidence-item" href="'+e(file.signed_url)+'" target="_blank" rel="noreferrer"><img src="'+e(file.signed_url)+'" alt="'+e(file.name)+'"><span>'+e(file.name)+'</span></a>').join("")+'</div></section>';
      host.querySelector("[data-close-detail]").onclick=()=>host.replaceChildren();modal.update({title:"โหลดรายละเอียดสำเร็จ",message:"เปิดดูข้อมูลและรูปหลักฐานได้แล้ว",tone:"success",close:()=>modal.close()});
    }catch(error){modal.update({title:"เปิดรายละเอียดไม่สำเร็จ",message:error.message||"ไม่มีสิทธิ์หรือเชื่อมต่อไม่ได้",tone:"error",close:()=>modal.close()});}
  });
  async function recoverPending(){
    if(!form||isStatusModalOpen())return;
    const auth=getAuthContext();if(!auth.authenticated||!auth.active)return;
    const modal=showStatusModal({title:"กำลังตรวจรายการส่งค้าง",message:"กำลังตรวจรายงานเดิมจาก Supabase",tone:"working",dismissOnEscape:false});
    form.inert=true;
    try{
      const editResult=await workApi.recoverOvertimeEdit(auth.employee_id);
      if(context.signal?.aborted||getAuthContext().employee_id!==auth.employee_id){modal.close();return;}
      if(editResult.state==='saved'){
        const historyLoaded=await load({reset:true});
        modal.update({title:"ตรวจพบการแก้ไขเดิมแล้ว",message:!historyLoaded?"ตรวจ Audit แล้ว แต่โหลดประวัติไม่สำเร็จ กรุณารีเฟรช":editResult.superseded?"การแก้ไขเดิมบันทึกแล้ว และมีการแก้ไขภายหลัง กรุณาตรวจข้อมูลล่าสุด":editResult.cleanupPending?"ตรวจ Audit แล้ว ไฟล์เดิมที่ถอดออกถูกบันทึกไว้เพื่อจัดการต่อ":"บันทึกการแก้ไขและตรวจ Audit แล้ว",tone:historyLoaded?"success":"error",close:()=>modal.close()});return;
      }
      if(editResult.state==='conflict'){
        modal.update({title:"รายงานถูกแก้ไขแล้ว",message:"รายการแก้ไขค้างใช้ข้อมูลรุ่นเก่า กรุณาเปิดรายละเอียดล่าสุดก่อนแก้ไขใหม่",tone:"error",close:()=>modal.close()});return;
      }
      if(editResult.state==='pending'){
        if(editing||form.elements.details.value.trim()||selectedFiles.length){modal.update({title:"มีการแก้ไขค้าง",message:"ข้อมูลที่กำลังกรอกยังอยู่ กรุณาจัดการฟอร์มก่อนกดตรวจรายการส่งค้างอีกครั้ง",tone:"error",close:()=>modal.close()});return;}
        fillEdit(editResult.report,editResult,editResult.keep_paths);
        const names=editResult.file_names||[];
        if(names.length)photoStatus.textContent="กรุณาเลือกรูปใหม่ชุดเดิมอีกครั้ง: "+names.join(', ');
        modal.update({title:"พบการแก้ไขค้าง",message:"ยังไม่พบผลการแก้ไข ข้อมูลเดิมถูกนำกลับมา กรุณาตรวจและบันทึกซ้ำด้วยข้อมูลชุดเดิม",detail:names.length?"เลือกรูปใหม่ชุดเดิมอีกครั้ง: "+names.join(', '):"",tone:"info",close:()=>modal.close()});return;
      }
      const result=await workApi.recoverOvertimeAttempt(auth.employee_id);
      if(context.signal?.aborted||getAuthContext().employee_id!==auth.employee_id){modal.close();return;}
      if(result.state==='none'){modal.close();return;}
      if(result.state==='saved'){
        form.querySelector('[data-abandon-ot]').hidden=true;
        const historyLoaded=await load({reset:true});
        modal.update({title:"ตรวจพบรายงานเดิมแล้ว",message:historyLoaded?"รายงานก่อนหน้าบันทึกและตรวจ Audit แล้ว สามารถเริ่มรายการใหม่ได้":"รายงานก่อนหน้าบันทึกและตรวจ Audit แล้ว แต่โหลดประวัติไม่สำเร็จ กรุณารีเฟรชประวัติ",tone:historyLoaded?"success":"error",close:()=>modal.close()});return;
      }
      if(form.elements.details.value.trim()||selectedFiles.length){
        modal.update({title:"มีรายการส่งค้าง",message:"ยังไม่พบรายงานเดิมในระบบ ข้อมูลที่กำลังกรอกยังอยู่ กรุณาจัดการข้อมูลในฟอร์มก่อนกดตรวจรายการส่งค้างอีกครั้ง",tone:"error",close:()=>modal.close()});return;
      }
      form.querySelector('[data-abandon-ot]').hidden=false;
      pendingRecoveryDate=result.date||'';form.elements.date.value=pendingRecoveryDate;refreshDateValidity();
      form.elements.durationHour.value=String(Math.floor(result.duration_minutes/60)).padStart(2,'0');
      form.elements.durationMinute.value=String(result.duration_minutes%60).padStart(2,'0');
      form.elements.details.value=result.details||'';
      const names=result.file_names||[];
      photoStatus.textContent=names.length?'กรุณาเลือกรูปเดิมอีกครั้ง: '+names.join(', '):'รายการเดิมไม่มีรูปแนบ';
      if([...form.elements.otGroup.options].some(option=>option.value===result.group_name))form.elements.otGroup.value=result.group_name;
      const groupNote=form.elements.otGroup.value!==result.group_name?' สิทธิ์กลุ่ม '+result.group_name+' ไม่พร้อมใช้งาน กรุณาติดต่อผู้ดูแล':'';
      modal.update({title:"พบรายการส่งค้าง",message:"ยังไม่พบรายงานเดิม ข้อมูลเดิมถูกนำกลับมาแล้ว กรุณาตรวจและส่งซ้ำด้วยข้อมูลชุดเดิม"+groupNote,detail:names.length?'เลือกรูปเดิมอีกครั้ง: '+names.join(', '):'',tone:"info",close:()=>modal.close()});
    }catch(error){modal.update({title:"ตรวจรายการส่งค้างไม่สำเร็จ",message:error.message||"ไม่สามารถเชื่อมต่อได้",tone:"error",close:()=>modal.close(),retry:()=>{modal.close();void recoverPending();}});}
    finally{form.inert=false;}
  }
  form?.querySelector('[data-recover-ot]')?.addEventListener('click',()=>void recoverPending());
  form?.querySelector('[data-abandon-ot]')?.addEventListener('click',async event=>{
    const button=event.currentTarget,auth=getAuthContext();if(button.disabled)return;
    button.disabled=true;form.inert=true;
    const modal=showStatusModal({title:"กำลังตรวจรายการก่อนยกเลิก",message:"กำลังตรวจ request เดิมและไฟล์ที่อาจอัปโหลดแล้ว",tone:"working",dismissOnEscape:false});
    try{
      const result=await workApi.abandonOvertimeAttempt(auth.employee_id);
      if(context.signal?.aborted||getAuthContext().employee_id!==auth.employee_id){modal.close();return;}
      if(result.state==='saved'){
        resetForm();const historyLoaded=await load({reset:true});
        modal.update({title:"พบรายงานที่บันทึกแล้ว",message:historyLoaded?"ระบบยืนยันว่า Supabase บันทึกรายงานเดิมแล้ว จึงไม่ได้ยกเลิก":"ยืนยันรายงานเดิมแล้ว แต่โหลดประวัติไม่สำเร็จ กรุณารีเฟรช",tone:historyLoaded?"success":"error",close:()=>modal.close()});return;
      }
      if(!result.cleanupPending)resetForm();const historyLoaded=await load({reset:true});
      modal.update({title:result.cleanupPending?"ยกเลิก request แล้ว แต่ไฟล์ยังต้องจัดการ":"ยกเลิกรายการส่งค้างแล้ว",message:result.cleanupPending?"ระบบเข้าคิวไฟล์ชั่วคราวแล้ว ปุ่มยกเลิกรายการส่งค้างยังอยู่สำหรับลองล้างอีกครั้ง":historyLoaded?"ยืนยันว่าไม่มีรายงานเดิมและจัดการไฟล์ชั่วคราวแล้ว สามารถเริ่มรายการใหม่ได้":"ยกเลิก request เดิมแล้ว แต่โหลดประวัติไม่สำเร็จ กรุณารีเฟรช",tone:result.cleanupPending||!historyLoaded?"error":"success",close:()=>modal.close()});
    }catch(error){modal.update({title:"ยกเลิกรายการส่งค้างไม่สำเร็จ",message:error.message||"ยังยืนยันกับ Supabase ไม่ได้",tone:"error",close:()=>modal.close(),retry:()=>{modal.close();button.click();}});}
    finally{button.disabled=false;form.inert=false;}
  });
  root.querySelector("[data-refresh]").addEventListener("click",load);
  context.onDataChange?.(load);await load();if(!isStatusModalOpen())await recoverPending();
  window.addEventListener("pagehide",clearPreviewUrls,{once:true});
}



