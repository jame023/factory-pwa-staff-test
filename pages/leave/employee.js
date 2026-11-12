import * as api from '../../adapters/package09.js?v=1.3.253';
import {enumerateLeaveDates,storedLeaveItems,isLeaveSubmissionOpen,LEAVE_WINDOW_MESSAGE} from '../../js/leave-rules.js?v=1.3.253';
import {prepareLeavePhoto} from '../../js/leave-images.js?v=1.3.253';
import {escapeHtml as e,thaiDate} from '../../js/utils.js?v=1.3.186';
import {showStatusModal,isStatusModalOpen} from '../../components/status-modal.js?v=1.3.295';
import {confirmAction} from '../../components/modal.js?v=1.3.186';
import {mountApprovedLeaveCalendar} from './approved-calendar.js?v=1.3.253';
const statusText=status=>({pending:'รอตรวจสอบ',approved:'อนุมัติแล้ว',rejected:'ไม่อนุมัติ',cancelled:'ยกเลิกแล้ว'}[status]||status);

export async function renderEmployeeLeave(root,context) {
  const generation=(root._leaveGeneration||0)+1;root._leaveGeneration=generation;
  const alive=()=>!context.signal?.aborted&&root._leaveGeneration===generation;
  let modal,previewUrls=[],imageExpiry,busy=false,processing=false,editing=null,files=[],retained=[],attempt={},rows=[],options,unresolvedCancel=false,recoveryBlocked=false;
  let historyMeta={has_more:false,total:0},historyRequest=0,historyStatus="all",historyFrom="",historyTo="",historyDateBasis="leave";
  const revoke=()=>{previewUrls.forEach(URL.revokeObjectURL);previewUrls=[];};
  context.signal?.addEventListener('abort',()=>{revoke();clearTimeout(imageExpiry);modal?.close();},{once:true});
  const status=(message,tone='working',detail='')=>{
    if(!alive())return null;
    const state={title:tone==='error'?'ดำเนินการไม่สำเร็จ':'คำขอลา',message,tone,detail,...(tone==='working'?{}:{close:()=>modal?.close()})};
    if(!modal?.isOpen())modal=showStatusModal(state);
    else modal.update(state);
    return modal;
  };
  root._leaveCalendarWatcher?.stop();root.classList.add('leave-page');
  root.innerHTML='<p class="page-loading" role="status">กำลังโหลดคำขอ…</p>';
  let recovery;
  try {
    status('กำลังโหลดคำขอ');
    options=await api.readLeaveOptions();
    recovery=await api.recoverLeaveOperations();
    historyMeta=await api.readLeaveHistoryPage({limit:25,offset:0,status:historyStatus,dateBasis:historyDateBasis});
    rows=historyMeta.items||[];
    if(!alive())return;
    modal?.close();
  }catch(error){
    if(!alive())return;
    status(error.message,'error');
    root.innerHTML='<section class="card card-pad"><h1>คำขอลา</h1><p class="notice notice-danger" role="alert">โหลดคำขอไม่สำเร็จ</p><button class="button" type="button" data-retry>ลองอีกครั้ง</button></section>';
    root.querySelector('[data-retry]').onclick=()=>{modal?.close();void renderEmployeeLeave(root,context);};return;
  }
  const serverOffset=Date.parse(options.server_time)-Date.now();
  const holidays=new Set(options.holidays||[]);
  root.innerHTML=`<div class="page-heading"><h1>ขอลา</h1></div>
    <p class="notice">คำขอและรูปแนบอ่านจาก Supabase • ส่ง แก้ไข และยกเลิกได้เวลา 05:00–ก่อน 21:00 น. เวลาไทย</p>
    <div data-recovery role="status"></div>
    <section class="card form-card leave-form-card"><div class="ot-form-intro"><span class="ot-form-icon" aria-hidden="true">✎</span><div><h2 data-form-title>ส่งคำขอลา</h2><p>เลือกวันที่และช่วงเวลาที่ต้องการลา พร้อมระบุเหตุผล</p></div></div>
    <form id="leave-form" novalidate><div class="form-grid leave-form-grid">
      <label class="field field-full">ชื่อผู้ขอลา<input name="employee" readonly value="${e(options.employee_name)}"></label>
      <label class="field field-full">ประเภทลา<select name="type" required><option>ลากิจ</option><option>ลาป่วย</option></select></label>
      <label class="field">วันเริ่มลา<input name="startDate" type="date" required></label>
      <label class="field">วันสิ้นสุดลา<input name="endDate" type="date" required></label>
      <div class="field field-full leave-day-options" data-days></div>
      <label class="field field-full">เหตุผลการลา<textarea name="reason" required maxlength="500" placeholder="ระบุเหตุผลให้ผู้บริหารพิจารณา"></textarea></label>
      <div class="field field-full"><span class="field-label">รูปแนบ / ใบรับรองแพทย์ <span class="ot-optional">ไม่บังคับ</span></span>
      <div class="ot-upload-box" data-dropzone><div class="ot-upload-mark" aria-hidden="true">＋</div><div class="ot-upload-copy"><strong>เพิ่มรูปประกอบคำขอลา</strong><span>เลือกได้หลายรูป เพิ่มภายหลัง หรือลบก่อนส่งคำขอได้</span><small>JPG, PNG หรือ WebP • สูงสุด 5 รูป • ต้นฉบับไม่เกิน 20 MB • บีบอัดให้ไม่เกิน 1 MB ต่อรูป</small></div>
        <label class="button button-small ot-upload-button" for="leave-photo-input">เลือกรูป<input id="leave-photo-input" name="photoInput" class="ot-file-input" type="file" accept="image/jpeg,image/png,image/webp" multiple></label></div>
        <div class="ot-photo-status" data-photo-status role="status" aria-live="polite"></div><div class="ot-photo-grid" data-photo-grid></div></div>
      <div class="field field-full notice" data-summary aria-live="polite">เลือกช่วงวันที่เพื่อดูสรุป</div>
      </div><p class="help-text leave-rule-note">ลากิจไม่เกิน 2 วันต่อครั้ง / 2 ครั้งต่อเดือน • ลาป่วยไม่มีใบรับรองไม่เกิน 1 ครั้งต่อเดือน • วันที่มีคำขอ pending หรือ approved แล้วไม่สามารถขอซ้ำได้ • นับวันหยุดเฉพาะที่ระบุไว้ในปฏิทินกลุ่มงาน</p>
      <div class="form-actions"><button class="button button-primary leave-submit" type="submit">ส่งคำขอ</button><button class="button" type="button" data-stop-edit hidden>เลิกแก้ไข</button></div><p data-unconfirmed class="notice notice-danger" hidden></p>
    </form></section><section class="card card-pad attendance-section" data-leave-calendar></section>
    <section class="card card-pad attendance-section"><div class="page-heading"><h2>ประวัติคำขอของฉัน</h2><button type="button" class="button button-small" data-refresh>รีเฟรช</button></div><p class="help-text">ตัวกรองวันที่อ้างอิงวันที่ลา</p><div class="form-grid leave-history-filters" data-history-filters><label class="field">สถานะ<select data-history-status><option value="all">ทุกสถานะ</option><option value="pending">รอตรวจสอบ</option><option value="approved">อนุมัติแล้ว</option><option value="rejected">ไม่อนุมัติ</option><option value="cancelled">ยกเลิกแล้ว</option></select></label><label class="field">อ้างอิงวันที่<select data-history-date-basis><option value="leave">วันที่ลา</option><option value="submitted">วันที่ส่งคำขอ</option></select></label><label class="field">ตั้งแต่<input type="date" data-history-from></label><label class="field">ถึง<input type="date" data-history-to></label></div><div data-history></div><button class="button button-small" type="button" data-history-more hidden>โหลดเพิ่ม</button></section>
    <section class="card card-pad attendance-section" data-detail hidden tabindex="-1"></section>`;
  const form=root.querySelector('#leave-form'),submit=form.querySelector('[type=submit]'),dayBox=form.querySelector('[data-days]'),photoBox=form.querySelector('[data-photo-grid]');  root.addEventListener('change',event=>{if(event.target.matches('[data-history-status],[data-history-from],[data-history-to],[data-history-date-basis]'))void loadHistory(true);},{signal:context.signal});
  root.addEventListener('click',event=>{if(event.target.closest('[data-history-more]'))void loadHistory(false);if(event.target.closest('[data-history-retry]'))void loadHistory(true);},{signal:context.signal});
  function lock(locked) {
    form.querySelectorAll('input,select,textarea,button').forEach(el=>{el.disabled=locked;});
    root.querySelectorAll('[data-refresh],[data-view],[data-edit],[data-cancel]').forEach(el=>{el.disabled=locked;});
    if(!locked&&(attempt.unknown||unresolvedCancel||recoveryBlocked)){
      form.querySelectorAll('input,select,textarea,button').forEach(el=>{el.disabled=true;});
      root.querySelectorAll('[data-view],[data-edit],[data-cancel]').forEach(el=>{el.disabled=true;});
      if(attempt.unknown&&!unresolvedCancel&&!recoveryBlocked)submit.disabled=false;
      root.querySelector('[data-refresh]').disabled=false;
    }
  }
  function changed(){if(!attempt.unknown){attempt={};}}
  function chosenDates(){return [...dayBox.querySelectorAll('[data-date]')].map(el=>({date:el.dataset.date,period:el.value}));}
  function summary() {
    const dates=chosenDates().filter(d=>d.period!=='none'&&!holidays.has(d.date));
    const total=dates.reduce((n,d)=>n+(d.period==='full'?1:.5),0);
    const target=form.querySelector('[data-summary]');
    target.textContent=dates.length?`${thaiDate(form.elements.startDate.value)} – ${thaiDate(form.elements.endDate.value)} • ${dates.length} วันที่เลือก • รวม ${total} วัน`:'เลือกวันและช่วงเวลาลาอย่างน้อยครึ่งวัน';
    return {dates,total};
  }
  function drawDays(values) {
    const previous=new Map((values||chosenDates()).map(d=>[d.date,d.period]));
    try {
      dayBox.innerHTML=enumerateLeaveDates(form.elements.startDate.value,form.elements.endDate.value).map(date=>
        `<label>${e(thaiDate(date))}${holidays.has(date)?' • วันหยุดตามปฏิทินกลุ่ม':''}<select data-date="${date}" aria-label="ช่วงเวลาลา ${date}">${[['full','เต็มวัน'],['morning','ครึ่งวันเช้า'],['afternoon','ครึ่งวันบ่าย'],['none','ไม่ลา']].map(([code,label])=>`<option value="${code}" ${(previous.get(date)||'full')===code?'selected':''}>${label}</option>`).join('')}</select></label>`).join('');
    }catch{dayBox.innerHTML='';}
    summary();
  }
  function drawPhotos() {
    revoke();photoBox.innerHTML=retained.map((a,i)=>`<article class="ot-photo-card"><p>${e(a.original_name)}</p><span>รูปเดิมที่บันทึกไว้</span><button type="button" class="button button-small" data-remove-old="${i}">นำรูปออก</button></article>`).join('')+
      files.map((file,i)=>{const url=URL.createObjectURL(file);previewUrls.push(url);return `<article class="ot-photo-card"><img src="${e(url)}" alt="${e(file.name)}"><p>${e(file.name)}</p><button type="button" class="button button-small" data-remove-new="${i}">ลบรูป</button></article>`;}).join('');
    form.querySelector('[data-photo-status]').textContent=`เลือกแล้ว ${retained.length+files.length}/5 รูป`;
  }
  async function addPhotos(incoming) {
    if(busy||processing||attempt.unknown||isStatusModalOpen())return;
    const added=[...(incoming||[])];if(!added.length)return;
    if(files.length+retained.length+added.length>5){status('แนบรูปได้สูงสุด 5 รูป','error');return;}
    processing=true;lock(true);status('กำลังเตรียมรูป');
    try {
      const prepared=[];for(const file of added){const result=await prepareLeavePhoto(file);if(!alive())return;prepared.push(result.file);}
      files.push(...prepared);changed();drawPhotos();modal?.close();
    }catch(error){if(alive())status(error.message,'error');}
    finally{processing=false;if(alive())lock(false);}
  }
async function loadHistory(resetPage=true) {
    const ticket=++historyRequest;
    const statusField=root.querySelector('[data-history-status]'),fromField=root.querySelector('[data-history-from]'),toField=root.querySelector('[data-history-to]'),basisField=root.querySelector('[data-history-date-basis]');
    historyStatus=statusField?.value||'all';historyFrom=fromField?.value||'';historyTo=toField?.value||'';historyDateBasis=basisField?.value||'leave';
    if(Boolean(historyFrom)!==Boolean(historyTo)) {
      root.querySelector('[data-history]').innerHTML='<p class="notice notice-danger" role="alert">กรุณาระบุวันที่เริ่มต้นและสิ้นสุดให้ครบ</p>';
      return;
    }
    const offset=resetPage?0:rows.length;
    root.querySelector('[data-history-more]').disabled=true;
    if(resetPage)root.querySelector('[data-history]').innerHTML='<p class="page-loading" role="status">กำลังโหลดประวัติคำขอ…</p>';
    try {
      const page=await api.readLeaveHistoryPage({limit:25,offset,status:historyStatus,from:historyFrom||null,to:historyTo||null,dateBasis:historyDateBasis});
      if(!alive()||ticket!==historyRequest)return;
      historyMeta=page;
      const next=page.items||[];
      if(resetPage)rows=next;
      else {const seen=new Set(rows.map(row=>row.id));rows=[...rows,...next.filter(row=>!seen.has(row.id))];}
      history();
    } catch(error) {
      if(!alive()||ticket!==historyRequest)return;
      root.querySelector('[data-history]').innerHTML='<p class="notice notice-danger" role="alert">ไม่สามารถโหลดประวัติคำขอได้</p><button class="button button-small" type="button" data-history-retry>ลองอีกครั้ง</button>';
      context.showToast(error.message||'ไม่สามารถโหลดประวัติคำขอได้','error');
    } finally {if(ticket===historyRequest&&alive())root.querySelector('[data-history-more]').disabled=false;}
  }

  function history() {
    const target=root.querySelector('[data-history]');
    target.innerHTML=rows.length?rows.map(r=>`<article class="card card-pad attendance-section leave-request" data-request="${e(r.id)}"><div class="leave-request-heading"><h3>${e(r.type)}</h3><strong class="leave-status" data-status="${e(r.status)}">${e(statusText(r.status))}</strong></div><p>${e(thaiDate(r.startDate))} – ${e(thaiDate(r.endDate))} • ${e(r.totalDays??'—')} วัน</p><p>ส่งเมื่อ ${e(new Intl.DateTimeFormat('th-TH',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Bangkok'}).format(new Date(r.createdAt)))}</p><p class="leave-reason">${e(r.reason)}</p><p>รูปแนบ ${r.attachments.length} รูป</p><div class="form-actions"><button class="button button-small" type="button" data-view="${e(r.id)}">ดูรายละเอียด</button>${r.status==='pending'?'<button class="button button-small" type="button" data-edit="'+e(r.id)+'">แก้ไข</button><button class="button button-danger button-small" type="button" data-cancel="'+e(r.id)+'">ยกเลิกคำขอ</button>':''}</div></article>`).join(''):(historyMeta.total?'<p data-empty>ไม่พบคำขอในช่วงนี้</p>':'<p data-empty>ยังไม่มีคำขอในช่วงนี้</p>');
    const more=root.querySelector('[data-history-more]');more.hidden=!historyMeta.has_more;more.textContent=`โหลดเพิ่ม (${rows.length}/${historyMeta.total||0})`;
  }
  function reset() {
    editing=null;files=[];retained=[];attempt={};form.reset();form.elements.employee.value=options.employee_name;
    form.querySelector('[data-stop-edit]').hidden=true;root.querySelector('[data-form-title]').textContent='ส่งคำขอลา';submit.textContent='ส่งคำขอ';form.querySelector('[data-unconfirmed]').hidden=true;drawDays([]);drawPhotos();
  }
  async function save(operation,data) {
    status(operation==='cancel'?'กำลังยกเลิกคำขอ':'กำลังตรวจสอบข้อมูล');
    const result=await api.mutateLeaveRequest(operation,{...data,onProgress:message=>status(message)});
    if(!alive())return;
    void root._refreshLeaveCalendar?.();
    await loadHistory(true);
    if(operation!=='cancel')reset();else unresolvedCancel=false;
    const detailBox=root.querySelector('[data-detail]');detailBox.hidden=true;detailBox.replaceChildren();clearTimeout(imageExpiry);
    status(result.cleanup?.length?'คำขอบันทึกและตรวจ Audit แล้ว แต่ยังล้างไฟล์ที่ไม่ใช้บางไฟล์ไม่ได้':result.saved.changedSinceCommit?'บันทึกคำขอแล้วและมีข้อมูลใหม่ภายหลัง กรุณาตรวจสถานะล่าสุดในประวัติ':operation==='cancel'?'ยกเลิกคำขอแล้ว':operation==='edit'?'บันทึกการแก้ไขและตรวจข้อมูลกลับสำเร็จ':result.recovered?'พบคำขอที่บันทึกไว้แล้ว ตรวจข้อมูลและ Audit สำเร็จ':'ส่งคำขอและตรวจข้อมูลกลับสำเร็จ',result.cleanup?.length?'error':'success',result.cleanup?.length?'หมายเลขติดตามและ object path ถูกเก็บไว้สำหรับลองล้างอีกครั้งเมื่อเปิดหน้า':'' );
  }
  form.addEventListener('change',event=>{changed();if(['startDate','endDate'].includes(event.target.name))drawDays();else summary();});
  form.elements.photoInput.addEventListener('change',()=>{void addPhotos(form.elements.photoInput.files);form.elements.photoInput.value='';});
  photoBox.addEventListener('click',event=>{
    if(busy||processing||attempt.unknown)return;
    const old=event.target.closest('[data-remove-old]'),fresh=event.target.closest('[data-remove-new]');
    if(old)retained.splice(Number(old.dataset.removeOld),1);else if(fresh)files.splice(Number(fresh.dataset.removeNew),1);else return;
    changed();drawPhotos();
  });
  const dropzone=form.querySelector('[data-dropzone]');
  dropzone.addEventListener('dragover',event=>event.preventDefault());dropzone.addEventListener('drop',event=>{event.preventDefault();void addPhotos(event.dataTransfer?.files);});
  form.querySelector('[data-stop-edit]').onclick=()=>{if(!busy&&!attempt.unknown)reset();};
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(busy||processing||isStatusModalOpen())return;
    try {
      if(!isLeaveSubmissionOpen(new Date(Date.now()+serverOffset)))throw new Error(LEAVE_WINDOW_MESSAGE);
      enumerateLeaveDates(form.elements.startDate.value,form.elements.endDate.value);
      if(!form.elements.reason.value.trim())throw new Error('กรุณากรอกเหตุผลการลา');
      if(!summary().total)throw new Error('เลือกวันและช่วงเวลาลาอย่างน้อยครึ่งวัน');
      busy=true;lock(true);
      if(!attempt.unknown&&!await confirmAction({title:editing?'ยืนยันบันทึกการแก้ไข':'ยืนยันส่งคำขอลา',message:form.querySelector('[data-summary]').textContent,confirmLabel:editing?'บันทึกการแก้ไข':'ส่งคำขอ'}))return;
      if(!alive())return;
      await save(editing?'edit':'create',{id:editing?.id,updatedAt:editing?.updatedAt,type:form.elements.type.value,startDate:form.elements.startDate.value,endDate:form.elements.endDate.value,dates:chosenDates(),reason:form.elements.reason.value,files,attachments:retained,attempt});
    }catch(error){if(alive()){status(error.message,'error',error.cleanup?.length?'ยังมีไฟล์ที่รอล้าง ระบบเก็บหมายเลขติดตามไว้แล้ว':'');const notice=form.querySelector('[data-unconfirmed]');notice.hidden=!attempt.unknown;notice.textContent='ยังไม่ทราบผลการส่งเดิม ข้อมูลถูกเก็บไว้ กดส่งอีกครั้งเพื่อตรวจสอบก่อนเริ่มรายการใหม่';}}
    finally{busy=false;if(alive())lock(false);}
  });
  root.querySelector('[data-refresh]').onclick=async()=>{
    if(busy||processing||isStatusModalOpen())return;busy=true;lock(true);status('กำลังโหลดคำขอ');
    try{if(recoveryBlocked||attempt.unknown||unresolvedCancel){modal?.close();await renderEmployeeLeave(root,context);return;}await loadHistory(true);if(alive())modal?.close();}
    catch(error){if(alive())status(error.message,'error');}finally{busy=false;if(alive())lock(false);}
  };
  root.querySelector('[data-history]').addEventListener('click',async event=>{
    const button=event.target.closest('[data-view],[data-edit],[data-cancel]');if(!button||busy||processing||attempt.unknown||isStatusModalOpen())return;
    busy=true;lock(true);status('กำลังโหลดรายละเอียดคำขอ');
    try {
      const id=button.dataset.view||button.dataset.edit||button.dataset.cancel;const row=await api.readLeaveDetail(id);if(!alive())return;
      if(button.dataset.edit) {
        if(row.status!=='pending')throw new Error('คำขอไม่ได้อยู่ในสถานะ pending แล้ว กรุณารีเฟรช');
        editing=row;files=[];retained=[...row.attachments];attempt={};
        form.elements.type.value=row.type;form.elements.startDate.value=row.startDate;form.elements.endDate.value=row.endDate;form.elements.reason.value=row.reason;
        drawDays(row.requestedDates||storedLeaveItems(row));drawPhotos();root.querySelector('[data-form-title]').textContent='แก้ไขคำขอลา pending';submit.textContent='บันทึกการแก้ไข';form.querySelector('[data-stop-edit]').hidden=false;modal?.close();form.scrollIntoView({block:'start'});return;
      }
      let photos=[];if(row.attachments.length&&!button.dataset.cancel){status('กำลังเปิดรูปแนบตามสิทธิ์');photos=await api.readLeaveImages(id);if(!alive())return;}
      modal?.close();const box=root.querySelector('[data-detail]');clearTimeout(imageExpiry);
      box.innerHTML=`<div class="page-heading"><h2>รายละเอียดคำขอ</h2><button class="button button-small" type="button" data-close-detail>ปิดรายละเอียด</button></div><p>${e(row.employee)} • ${e(row.type)} • ${e(statusText(row.status))}</p><div class="leave-dates">${storedLeaveItems(row).map(d=>`<div class="leave-date-row"><strong>${e(thaiDate(d.date))}</strong><span>${e(d.label)}</span></div>`).join('')}</div><p>รวม ${e(row.totalDays??'—')} วัน</p><div class="leave-reason"><span class="leave-detail-label">เหตุผล</span><p>${e(row.reason)}</p></div>${row.reviewedBy?`<p>ผู้ตรวจสอบ: ${e(row.reviewedBy)} • ${e(row.reviewedAt||'')}</p>`:''}${row.rejectionReason?`<p>เหตุผลไม่อนุมัติ: ${e(row.rejectionReason)}</p>`:''}${row.cancellationReason?`<p>เหตุผลยกเลิก: ${e(row.cancellationReason)}</p>`:''}<p>หมายเลขคำขอ: ${e(row.requestId||row.id)}</p><div class="ot-photo-grid" data-private-images>${photos.map(p=>`<figure class="ot-photo-card"><img src="${e(p.url)}" alt="${e(p.name)}"><figcaption>${e(p.name)}</figcaption></figure>`).join('')}</div>${button.dataset.cancel?'<label class="field">เหตุผลยกเลิก<textarea maxlength="500" data-cancel-reason></textarea></label><button type="button" class="button button-danger" data-confirm-cancel>ยืนยันยกเลิกคำขอ</button>':''}`;
      box.hidden=false;box.focus();box.scrollIntoView({block:'start'});
      box.querySelector('[data-close-detail]').onclick=()=>{box.hidden=true;box.replaceChildren();clearTimeout(imageExpiry);};
      if(photos.length)imageExpiry=setTimeout(()=>{if(alive()&&box.querySelector('[data-private-images]'))box.querySelector('[data-private-images]').innerHTML='<p>ลิงก์รูปหมดอายุแล้ว กรุณาเปิดรายละเอียดอีกครั้ง</p>';},55000);
      const cancelAttempt={};box.querySelector('[data-confirm-cancel]')?.addEventListener('click',async()=>{
        if(busy||isStatusModalOpen())return;const reason=box.querySelector('[data-cancel-reason]').value.trim();if(!reason){status('กรุณาระบุเหตุผลยกเลิก','error');return;}
        busy=true;lock(true);const cancelButton=box.querySelector('[data-confirm-cancel]');cancelButton.disabled=true;
        try{if(!await confirmAction({title:'ยืนยันยกเลิกคำขอ pending',message:'คำขอจะเปลี่ยนเป็นยกเลิกแล้วและเก็บ Audit พร้อมเหตุผล',confirmLabel:'ยกเลิกคำขอ',danger:true}))return;if(alive())await save('cancel',{id:row.id,updatedAt:row.updatedAt,reason,attempt:cancelAttempt});}
        catch(error){if(alive()){unresolvedCancel=Boolean(cancelAttempt.unknown);if(unresolvedCancel){box.querySelector('[data-cancel-reason]').disabled=true;box.querySelector('[data-close-detail]').disabled=true;}status(error.message,'error');}}finally{busy=false;if(alive()){lock(false);cancelButton.disabled=false;}}
      });
    }catch(error){if(alive())status(error.message,'error');}finally{busy=false;if(alive())lock(false);}
  });
  const recoveryBox=root.querySelector('[data-recovery]');
  recoveryBlocked=recovery.pending.some(item=>item.state==='unconfirmed');
  if(recovery.pending.length)recoveryBox.innerHTML='<p class="notice notice-danger">ยังมีการส่งหรือไฟล์ที่ต้องตรวจต่อ '+recovery.pending.length+' รายการ ระบบเก็บหมายเลขติดตามไว้ กรุณารีเฟรชเมื่อเชื่อมต่อได้</p>';
  else if(recovery.recovered.length)recoveryBox.innerHTML='<p class="notice">ตรวจพบและอ่านคำขอที่บันทึกไว้จากการส่งครั้งก่อนแล้ว '+recovery.recovered.length+' รายการ</p>';
  reset();history();lock(false);mountApprovedLeaveCalendar(root,context);
}
