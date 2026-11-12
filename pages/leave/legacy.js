import { renderLeaveMedia } from "../../js/leave-media.js?v=1.3.186";
import * as api from "../../adapters/package09-legacy.js?v=1.3.259";
import * as adminApi from "../../adapters/package11.js?v=1.3.186";
import { enumerateLeaveDates, storedLeaveItems, isLeaveSubmissionOpen, LEAVE_WINDOW_MESSAGE } from "../../js/leave-rules-legacy.js?v=1.3.259";
import { mountApprovedLeaveCalendar } from "./approved-calendar-legacy.js?v=1.3.259";
import { escapeHtml as e, thaiDate, statusText, bangkokToday } from "../../js/utils.js?v=1.3.186";
import { canManage } from "../../js/permissions.js?v=1.3.186";
import { requireOnlineAction } from "../../js/offline.js?v=1.3.186";
import { confirmAction } from "../../components/modal.js?v=1.3.186";

const MAX_LEAVE_PHOTOS = 5;
const MAX_LEAVE_FILE_BYTES = 1024 * 1024;
const MAX_LEAVE_SOURCE_BYTES = 20 * 1024 * 1024;
const LEAVE_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

async function prepareLeavePhoto(file) {
  if (file.size <= MAX_LEAVE_FILE_BYTES) return { file, compressed: false };
  if (typeof createImageBitmap !== "function") throw new Error("เบราว์เซอร์นี้บีบอัดรูปไม่ได้ กรุณาใช้รูปที่เล็กลง");
  let bitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new Error("เปิดรูปเพื่อบีบอัดไม่ได้ กรุณาเลือกรูป JPG, PNG หรือ WebP"); }
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("เตรียมพื้นที่บีบอัดรูปไม่สำเร็จ");
    let scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    let quality = .88;
    for (let attempt = 0; attempt < 10; attempt++) {
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= MAX_LEAVE_FILE_BYTES) {
        const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
        return { file: new File([blob], name, { type: "image/jpeg", lastModified: Date.now() }), compressed: true };
      }
      if (attempt % 2 === 0) quality = Math.max(.42, quality - .12);
      else scale *= .82;
    }
    throw new Error("บีบอัดรูปให้ไม่เกิน 1 MB ไม่ได้ กรุณาใช้รูปที่เล็กลง");
  } finally { bitmap.close?.(); }
}

export async function render(root, context) {
  root._leaveCalendarWatcher?.stop();
  root._leaveCalendarWatcher = null;
  root.classList.add("leave-page");
  root.innerHTML = '<p class="page-loading">กำลังอ่านคำขอลา…</p>';
  let rows, notices, employeeDirectory = [];
  try {
    [rows,notices,employeeDirectory] = await Promise.all([
      api.listLeaveRequests(), api.readLeaveNoticeHistory(),
      context.user.role === "admin" && context.workspace !== "employee" ? adminApi.listRecords("employees") : Promise.resolve([])
    ]);
  }
  catch(error) { root.innerHTML='<p role="alert">อ่านคำขอลาไม่สำเร็จ กรุณาเปิดหน้าใหม่</p>'; context.showToast(error.message,"error"); return; }
  if (context.signal?.aborted) return;
  const manage = canManage(context.user.role) && context.workspace !== "employee";
  if (context.workspace === "employee") rows = rows.filter(row => row.employeeId === context.user.id);
  const details = item =>
    '<div class="leave-request-heading"><h3>'+e(item.employee)+'</h3><span class="leave-type">'+e(item.type)+'</span></div>'+
    '<div class="leave-dates"><span class="leave-detail-label">วันที่และช่วงเวลาที่ขอลา</span>'+storedLeaveItems(item).map(day=>
      '<div class="leave-date-row"><strong>'+e(thaiDate(day.date))+'</strong><span>'+e(day.label)+'</span></div>').join('')+'</div>'+
    '<div class="leave-reason"><span class="leave-detail-label">เหตุผลการลา</span><p>'+e(item.reason || '—')+'</p></div>'+
    '<p class="leave-attachments">รูปแนบ: '+(item.attachments?.length || 0)+' รูป</p>';

  const employeeForm = (context.user.role === "employee" || (context.user.role === "admin" && context.workspace === "employee")) ? `
    <section class="card form-card leave-form-card">
      <div class="ot-form-intro"><span class="ot-form-icon" aria-hidden="true">✎</span><div>
        <h2>ส่งคำขอลา</h2><p>เลือกวันที่และช่วงเวลาที่ต้องการลา พร้อมระบุเหตุผล</p>
      </div></div>
      <form id="leave-form">
        <div class="form-grid leave-form-grid">
          <label class="field field-full">ประเภทลา
            <select name="type" required><option>ลากิจ</option><option>ลาป่วย</option></select>
          </label>
          <label class="field">วันเริ่มลา<input name="startDate" type="date" required></label>
          <label class="field">วันสิ้นสุดลา<input name="endDate" type="date" required></label>
          <div class="field field-full leave-day-options" data-days></div>
          <label class="field field-full">เหตุผลการลา
            <textarea name="reason" required maxlength="500" placeholder="ระบุเหตุผลให้ผู้บริหารพิจารณา"></textarea>
          </label>
          <div class="field field-full">
            <span class="field-label">รูปแนบ / ใบรับรองแพทย์ <span class="ot-optional">ไม่บังคับ</span></span>
            <div class="ot-upload-box" data-dropzone>
              <div class="ot-upload-mark" aria-hidden="true">＋</div>
              <div class="ot-upload-copy"><strong>เพิ่มรูปประกอบคำขอลา</strong>
                <span>เลือกได้หลายรูป เพิ่มภายหลัง หรือลบก่อนส่งคำขอได้</span>
                <small>JPG, PNG หรือ WebP • บีบอัดรูปใหญ่ให้อัตโนมัติ • สูงสุด 5 รูป รูปละไม่เกิน 1 MB</small>
              </div>
              <label class="button button-small ot-upload-button" for="leave-photo-input">เลือกรูป
                <input id="leave-photo-input" name="photoInput" class="ot-file-input" type="file" accept="image/jpeg,image/png,image/webp" multiple>
              </label>
            </div>
            <div class="ot-photo-status" data-photo-status role="status" aria-live="polite">ยังไม่ได้เลือกรูป</div>
            <div class="ot-photo-grid" data-photo-grid></div>
          </div>
        </div>
        <p class="help-text leave-rule-note">รูปแนบจะถูกส่งและบันทึกพร้อมคำขอใน Supabase • ส่งคำขอได้เฉพาะ 05:00–21:00 น. เวลาไทย • ลากิจไม่เกิน 2 วันต่อครั้ง / 2 ครั้งต่อเดือน • ลาป่วยไม่มีใบรับรองไม่เกิน 1 ครั้งต่อเดือน</p>
        <button class="button button-primary leave-submit" type="submit">ส่งคำขอ</button>
      </form>
    </section>` : "";
  root.innerHTML = '<div class="page-heading"><h1>'+(manage?'จัดการการลา':'ขอลา')+'</h1></div><p class="notice">คำขออ่านและบันทึกใน Supabase • การแจ้งเตือนถึงอุปกรณ์ยังไม่เปิดใช้งาน</p>'+
    (context.user.role === "admin" && manage ? '<section class="card card-pad attendance-section"><h2>สร้างคำขอลาแทนพนักงาน</h2><p class="help-text">คำขอจะถูกส่งเป็นสถานะรออนุมัติ และแจ้งผู้บริหารตามกฎเดิมของการลา โดยต้องระบุเหตุผลของ Admin</p><form id="admin-proxy-leave-form"><div class="form-grid"><label class="field field-full">พนักงาน<select name="employee" required><option value="">เลือกพนักงาน</option>'+employeeDirectory.filter(item=>item.active!==false).map(item=>'<option value="'+e(item.name)+'">'+e(item.name)+' • '+e(item.group || '')+'</option>').join('')+'</select></label><label class="field">ประเภทลา<select name="type" required><option>ลากิจ</option><option>ลาป่วย</option></select></label><label class="field">ช่วงเวลา<select name="period" required><option>เต็มวัน</option><option>ครึ่งวันเช้า</option><option>ครึ่งวันบ่าย</option></select></label><label class="field">วันเริ่มลา<input name="startDate" type="date" required></label><label class="field">วันสิ้นสุดลา<input name="endDate" type="date" required></label><label class="field field-full">เหตุผลการลา<textarea name="reason" required maxlength="500"></textarea></label><label class="field field-full">เหตุผลการทำรายการแทน<textarea name="proxyReason" required minlength="3" maxlength="300"></textarea></label></div><button class="button button-primary" type="submit">ส่งคำขอลาแทน</button></form></section>' : '') +
    employeeForm+
    (manage ? '<section class="card card-pad attendance-section"><h2>รออนุมัติ</h2>'+ (rows.filter(row=>row.status==='pending').map(item=>'<article class="card card-pad attendance-section leave-request" data-request="'+e(item.id)+'">'+details(item)+'<label class="field">เหตุผลปฏิเสธ (กรอกเมื่อไม่อนุมัติ)<textarea data-rejection maxlength="500" placeholder="ระบุเหตุผลให้ผู้ขอลาทราบ"></textarea></label><div class="form-actions leave-decision-actions"><button class="button button-primary" data-decision="approved">อนุมัติ</button><button class="button button-danger" data-decision="rejected">ปฏิเสธ</button></div></article>').join('') || '<p>ไม่มีคำขอรออนุมัติ</p>')+'</section>' : '')+
    '<section class="card card-pad attendance-section" data-leave-calendar></section>'+
    '<section class="card card-pad attendance-section"><h2>ประวัติคำขอ</h2>'+ (rows.map(item=>'<article class="card card-pad attendance-section leave-request" data-request="'+e(item.id)+'">'+details(item)+'<strong class="leave-status" data-status="'+e(item.status)+'">'+e(statusText(item.status))+'</strong>'+(item.rejectionReason?'<p>เหตุผลปฏิเสธ: '+e(item.rejectionReason)+'</p>':'')+(item.employeeId===context.user.id && ['pending','approved'].includes(item.status) && storedLeaveItems(item).at(-1)?.date>=bangkokToday() ? '<label class="field">เหตุผลยกเลิก<textarea data-cancel-reason maxlength="500"></textarea></label><button class="button button-danger" data-cancel>ยกเลิกคำขอ</button>' : '')+'</article>').join('') || '<p>ยังไม่มีคำขอ</p>')+'</section>';
  root.insertAdjacentHTML('beforeend','<section class="card card-pad attendance-section"><h2>รูปแจ้งผลและประวัติแจ้งเตือนการลา</h2><p class="help-text">แสดงตามสิทธิ์ผู้ขอ / ผู้บริหาร / ออฟฟิต • อ่านข้อมูลจาก Supabase</p>'+ (notices.map(notice=>'<article class="leave-request card card-pad attendance-section"><h3>'+e(notice.title)+'</h3><p style="white-space:pre-wrap">'+e(notice.body)+'</p>'+ (renderLeaveMedia(notice.mediaPreview)||'<p class="help-text">รายการเดิมยังไม่มีรูปแนบแจ้งผล</p>')+'</article>').join('') || '<p>ยังไม่มีประวัติแจ้งเตือนการลา</p>')+'</section>');
  mountApprovedLeaveCalendar(root, context);
  const form = root.querySelector('#leave-form');
  const proxyForm = root.querySelector('#admin-proxy-leave-form');
  const fileInput = form?.elements.photoInput;
  const photoGrid = form?.querySelector('[data-photo-grid]');
  const photoStatus = form?.querySelector('[data-photo-status]');
  const dropzone = form?.querySelector('[data-dropzone]');
  const submitButton = form?.querySelector('[type="submit"]');
  let selectedPhotos = [];
  let previewUrls = [];
  let processingPhotos = false;
  const clearPreviewUrls = () => { previewUrls.forEach(url => URL.revokeObjectURL(url)); previewUrls = []; };
  context.signal?.addEventListener('abort', clearPreviewUrls, { once: true });
  function drawPhotos() {
    if (!photoGrid) return;
    clearPreviewUrls();
    photoGrid.innerHTML = selectedPhotos.map((file, index) => {
      const url = URL.createObjectURL(file);
      previewUrls.push(url);
      return '<article class="ot-photo-card"><img src="' + e(url) + '" alt="ตัวอย่าง ' + e(file.name) +
        '"><div class="ot-photo-info"><strong>' + e(file.name) + '</strong><span>' +
        (file.size / 1024).toFixed(0) + ' KB</span></div><button class="ot-photo-remove" type="button" data-remove-photo="' +
        index + '" aria-label="ลบรูป ' + e(file.name) + '">ลบ</button></article>';
    }).join('');
    photoStatus.textContent = selectedPhotos.length
      ? 'เลือกแล้ว ' + selectedPhotos.length + ' จาก ' + MAX_LEAVE_PHOTOS + ' รูป'
      : 'ยังไม่ได้เลือกรูป';
  }
  async function addPhotos(files) {
    const incoming = Array.from(files || []);
    if (!incoming.length || processingPhotos) return;
    if (selectedPhotos.length + incoming.length > MAX_LEAVE_PHOTOS) {
      context.showToast('แนบได้สูงสุด ' + MAX_LEAVE_PHOTOS + ' รูป', 'error');
      return;
    }
    if (incoming.some(file => !LEAVE_IMAGE_TYPES.includes(file.type) || file.size <= 0 || file.size > MAX_LEAVE_SOURCE_BYTES)) {
      context.showToast('เลือกรูป JPG, PNG หรือ WebP ขนาดต้นฉบับไม่เกิน 20 MB ต่อรูป', 'error');
      return;
    }
    processingPhotos = true;
    fileInput.disabled = true;
    submitButton.disabled = true;
    dropzone.classList.add('is-processing');
    photoStatus.textContent = 'กำลังตรวจและปรับขนาดรูป…';
    try {
      const prepared = [];
      let compressed = 0;
      for (const photo of incoming) {
        const result = await prepareLeavePhoto(photo);
        prepared.push(result.file);
        if (result.compressed) compressed++;
      }
      if (context.signal?.aborted) return;
      selectedPhotos.push(...prepared);
      drawPhotos();
      if (compressed) context.showToast('บีบอัดรูปใหญ่ให้อัตโนมัติแล้ว ' + compressed + ' รูป', 'success');
    } catch (error) {
      photoStatus.textContent = selectedPhotos.length ? 'เพิ่มรูปไม่สำเร็จ • รูปเดิมยังอยู่' : 'เพิ่มรูปไม่สำเร็จ';
      context.showToast(error.message || 'เพิ่มรูปไม่สำเร็จ', 'error');
    } finally {
      processingPhotos = false;
      fileInput.disabled = false;
      submitButton.disabled = false;
      dropzone.classList.remove('is-processing');
    }
  }
  fileInput?.addEventListener('change', () => { void addPhotos(fileInput.files); fileInput.value = ''; });
  photoGrid?.addEventListener('click', event => {
    const button = event.target.closest('[data-remove-photo]');
    if (!button || processingPhotos) return;
    selectedPhotos.splice(Number(button.dataset.removePhoto), 1);
    drawPhotos();
  });
  dropzone?.addEventListener('dragover', event => { event.preventDefault(); dropzone.classList.add('is-dragging'); });
  dropzone?.addEventListener('dragleave', event => {
    if (!dropzone.contains(event.relatedTarget)) dropzone.classList.remove('is-dragging');
  });
  dropzone?.addEventListener('drop', event => {
    event.preventDefault();
    dropzone.classList.remove('is-dragging');
    void addPhotos(event.dataTransfer?.files);
  });
  proxyForm?.addEventListener('submit', async event => {
    event.preventDefault();
    if (!requireOnlineAction('สร้างคำขอลาแทน')) return;
    const button = proxyForm.querySelector('[type="submit"]');
    if (button.disabled) return;
    const values = Object.fromEntries(new FormData(proxyForm));
    if (values.endDate < values.startDate) { context.showToast('วันสิ้นสุดต้องไม่ก่อนวันเริ่มลา','error'); return; }
    if (values.period !== 'เต็มวัน' && values.startDate !== values.endDate) { context.showToast('ลาครึ่งวันต้องเป็นวันเดียวกัน','error'); return; }
    button.disabled = true; button.textContent = 'กำลังส่งคำขอแทน…';
    try {
      const confirmed = await confirmAction({title:'ยืนยันสร้างคำขอลาแทน',message:'คำขอจะเข้าสถานะรออนุมัติและแจ้งผู้บริหาร',confirmLabel:'ส่งคำขอ'});
      if (!confirmed) return;
      await adminApi.saveRecord('leaveRequests', null, {employee:values.employee,type:values.type,startDate:values.startDate,endDate:values.endDate,period:values.period,reason:values.reason,status:'pending'}, null, values.proxyReason);
      context.showToast('สร้างคำขอลาแทนแล้ว','success');
      await render(root, context);
    } catch (error) { context.showToast(error.message || 'สร้างคำขอลาแทนไม่สำเร็จ','error'); }
    finally { button.disabled = false; button.textContent = 'ส่งคำขอลาแทน'; }
  });
  function drawDays() {
    const target=form.querySelector('[data-days]');
    try { target.innerHTML=enumerateLeaveDates(form.elements.startDate.value,form.elements.endDate.value).map(date=>'<label>'+e(thaiDate(date))+'<select data-date="'+date+'"><option value="full">เต็มวัน</option><option value="morning">ครึ่งวันเช้า</option><option value="afternoon">ครึ่งวันบ่าย</option><option value="none">ไม่ลา</option></select></label>').join('')+'<p class="help-text">วันหยุดตามปฏิทินกลุ่มจะไม่นับเป็นวันลา</p>'; }
    catch { target.innerHTML=''; }
  }
  form?.elements.startDate.addEventListener('change',drawDays);
  form?.elements.endDate.addEventListener('change',drawDays);
  form?.addEventListener('submit',async event=>{
    event.preventDefault();
    const button=submitButton;
    if(button.disabled || processingPhotos || !requireOnlineAction('ส่งคำขอลา'))return;
    if(!isLeaveSubmissionOpen()){context.showToast(LEAVE_WINDOW_MESSAGE,'error');return;}
    button.disabled=true; button.textContent='กำลังส่ง…';
    try {
      await api.submitLeaveRequest({type:form.elements.type.value,startDate:form.elements.startDate.value,endDate:form.elements.endDate.value,reason:form.elements.reason.value,
        dates:[...form.querySelectorAll('[data-date]')].map(el=>({date:el.dataset.date,period:el.value})),
        images:await Promise.all(selectedPhotos.map(file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve({name:file.name,mimeType:file.type,size:file.size,dataUrl:reader.result});reader.onerror=()=>reject(new Error("อ่านรูปแนบไม่สำเร็จ"));reader.readAsDataURL(file);})))});
      clearPreviewUrls();
      context.showToast('ส่งคำขอลาแล้ว','success'); await render(root,context);
    } catch(error) { context.showToast(error.message,'error'); }
    finally { button.disabled=false; button.textContent='ส่งคำขอ'; }
  });
  root.querySelectorAll('[data-decision],[data-cancel]').forEach(button=>button.addEventListener('click',async()=>{
    const article=button.closest('[data-request]');
    const controls=[...article.querySelectorAll('button,textarea')];
    if(controls.some(el=>el.disabled) || !requireOnlineAction('พิจารณาหรือยกเลิกคำขอลา'))return;
    const cancel=button.hasAttribute('data-cancel'), decision=button.dataset.decision;
    const reason=article.querySelector(cancel?'[data-cancel-reason]':'[data-rejection]')?.value.trim() || '';
    if((cancel || decision==='rejected') && !reason){context.showToast('กรุณาระบุเหตุผล','error');return;}
    controls.forEach(el=>{el.disabled=true;});
    const original=button.textContent;
    try {
      if(!await confirmAction({title:cancel?'ยืนยันยกเลิกคำขอ':decision==='approved'?'ยืนยันอนุมัติ':'ยืนยันปฏิเสธ',message:'เปลี่ยนสถานะคำขอใน Supabase',confirmLabel:'ยืนยัน',danger:cancel || decision==='rejected'}))return;
      if(context.signal?.aborted)return;
      button.textContent='กำลังบันทึก…';
      if(cancel)await api.cancelLeaveRequest(article.dataset.request,reason);
      else await api.reviewLeaveRequest(article.dataset.request,decision,reason);
      context.showToast('บันทึกสถานะคำขอลาแล้ว','success'); await render(root,context);
    }catch(error){context.showToast(error.message,'error');}
    finally{controls.forEach(el=>{el.disabled=false;});button.textContent=original;}
  }));
}


