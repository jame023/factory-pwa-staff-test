import { ORDINARY_GROUPS, getRegistrationAdminContext, listRegistrationRequests, getRegistrationRequestById, getApprovalPreview, approveRegistrationRequest, rejectRegistrationRequest, reviewMessage } from '../../js/registration-admin-api.js?v=1.3.201';
import { showStatusModal } from '../../components/status-modal.js?v=1.3.186';
const esc=value=>String(value??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=value=>value?new Date(value).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'}):'—';
const masked=value=>value?value.slice(0,5)+'••••••••'+value.slice(-4):'—';
const statusLabel={pending:'รอตรวจสอบ',approved:'อนุมัติแล้ว',rejected:'ไม่อนุมัติ',cancelled:'ยกเลิก'};
export async function render(root,context){
 let rows=[],busy=false,loaded=false,filters={status:'pending',offset:0},detail=null,preview=null,overlay=null;
 let previousOverflow='',previousFocus=null;
 const current=()=>!context.signal.aborted&&root.isConnected;
 function closeDetail(){
  if(!overlay)return;
  overlay.remove();overlay=null;document.body.style.overflow=previousOverflow;
  if(previousFocus?.isConnected)previousFocus.focus();
 }
 context.signal.addEventListener('abort',()=>closeDetail(),{once:true});
 function draw(){
  if(!current())return;
  const advanced=['line','group','from','to'].some(key=>filters[key]);
  const input=(key,label)=>'<label class="field">'+label+'<input name="'+key+'" maxlength="100" value="'+esc(filters[key]||'')+'"></label>';
  root.innerHTML='<section class="registration-admin"><header class="registration-heading"><div><p class="eyebrow">จัดการสมาชิก</p><h1>ตรวจคำขอสมัครสมาชิก</h1><p>ตรวจข้อมูลผู้สมัครและกำหนดกลุ่มงานก่อนอนุมัติ</p></div><div class="registration-heading-actions"><a class="button" href="#/admin">หน้า Admin</a></div></header>'+
   '<form data-filter class="card registration-filters"><div class="registration-section-heading"><h2>ค้นหาคำขอ</h2><span>เริ่มจากสถานะ ชื่อ หรือรหัสพนักงาน</span></div><div class="registration-filter-main"><label class="field">สถานะ<select name="status">'+Object.entries(statusLabel).map(([v,t])=>'<option value="'+v+'" '+(filters.status===v?'selected':'')+'>'+t+'</option>').join('')+'</select></label>'+input('name','ชื่อผู้สมัคร')+input('code','รหัสพนักงาน')+'</div>'+
   '<details class="registration-advanced" '+(advanced?'open':'')+'><summary>ตัวกรองเพิ่มเติม <span>LINE · กลุ่มงาน · ช่วงวันที่</span></summary><div class="registration-filter-extra">'+input('line','LINE Display Name')+
   '<label class="field">กลุ่มงานที่ Admin กำหนด<select name="group"><option value="">ทุกกลุ่ม</option>'+ORDINARY_GROUPS.map(g=>'<option '+(g===filters.group?'selected':'')+'>'+g+'</option>').join('')+'</select></label>'+
   '<label class="field">ส่งคำขอตั้งแต่<input name="from" type="date" value="'+esc(filters.from||'')+'"></label><label class="field">ถึงวันที่<input name="to" type="date" value="'+esc(filters.to||'')+'"></label></div></details>'+
   '<div class="registration-filter-actions"><button class="button" type="button" data-reset-filter>ล้างตัวกรอง</button><button class="button button-primary" type="submit">ค้นหา / รีเฟรช</button></div></form>'+
   '<section class="card registration-results" aria-labelledby="registration-results-title"><div class="registration-results-heading"><div><h2 id="registration-results-title">รายการคำขอ <span class="registration-result-count">'+rows.length+'</span></h2><p>แสดงตามตัวกรองที่เลือก · เลือกดูรายละเอียดก่อนตรวจคำขอ</p></div><span class="registration-current-filter">'+esc(statusLabel[filters.status]||'รอตรวจสอบ')+'</span></div>'+
   '<div class="registration-table-wrap"><table class="registration-table"><thead><tr><th scope="col">ผู้สมัคร</th><th scope="col">กลุ่มงาน</th><th scope="col">วันที่ส่งคำขอ</th><th scope="col">สถานะการตรวจ</th><th scope="col">ดำเนินการ</th></tr></thead><tbody>'+rows.map(r=>'<tr><td data-label="ผู้สมัคร" class="registration-applicant"><strong>'+esc(r.employee_name)+'</strong><span class="registration-meta">LINE: '+esc(r.line_display_name)+'</span><span class="registration-code">รหัส: '+esc(r.employee_code||'ยังไม่ระบุ')+'</span></td><td data-label="กลุ่มงาน"><strong class="registration-group">'+esc(r.assigned_main_group||r.requested_main_group||'รอ Admin กำหนด')+'</strong><span class="registration-meta">'+esc((r.assigned_main_group?(r.assigned_groups||[]):(r.requested_groups||[])).join(', ')||'ยังไม่มีกลุ่มงาน')+'</span></td><td data-label="วันที่ส่งคำขอ"><span class="registration-date">'+esc(date(r.created_at))+'</span></td><td data-label="สถานะการตรวจ"><span class="registration-status registration-status--'+esc(r.status)+'">'+esc(statusLabel[r.status])+'</span>'+(r.reviewed_at?'<span class="registration-meta">'+esc(date(r.reviewed_at))+'</span><span class="registration-meta">โดย '+esc(r.reviewer_name||r.reviewed_by||'—')+'</span>':'<span class="registration-meta">ยังไม่ได้ตรวจคำขอ</span>')+'</td><td data-label="ดำเนินการ" class="registration-actions-cell"><div class="registration-row-actions"><button class="button registration-detail-button" data-detail="'+esc(r.id)+'">ดูรายละเอียด</button>'+(r.status==='pending'?'<button class="button button-primary" data-approve="'+esc(r.id)+'">อนุมัติ</button><button class="button registration-reject-button" data-reject="'+esc(r.id)+'">ไม่อนุมัติ</button>':'')+'</div></td></tr>').join('')+(rows.length?'':'<tr><td colspan="5" class="registration-empty"><strong>ไม่พบคำขอตามตัวกรอง</strong><span>ลองเปลี่ยนสถานะหรือล้างตัวกรองเพื่อค้นหาอีกครั้ง</span></td></tr>')+'</tbody></table></div>'+
   '<footer class="registration-pagination"><span>รายการ '+(rows.length?filters.offset+1:0)+'–'+(filters.offset+rows.length)+' <small>แสดงสูงสุด 50 รายการต่อหน้า</small></span><div><button class="button" data-prev '+(!filters.offset?'disabled':'')+'>ก่อนหน้า</button><button class="button" data-next '+(rows.length<50?'disabled':'')+'>ถัดไป</button></div></footer></section></section>';
  root.querySelector('[data-reset-filter]').onclick=()=>{filters={status:'pending',offset:0};void load();};
  if(!loaded)root.querySelector('tbody').innerHTML='<tr><td colspan="5">กำลังเตรียมข้อมูลคำขอ กรุณากดค้นหา / รีเฟรชอีกครั้ง</td></tr>';
  root.querySelector('[data-filter]').onsubmit=event=>{event.preventDefault();const next=Object.fromEntries(new FormData(event.target));if(next.from&&next.to&&next.from>next.to)return errorPopup('กรุณาตรวจช่วงวันที่');filters={...next,offset:0};void load();};
  root.querySelector('[data-prev]').onclick=()=>{filters.offset=Math.max(0,filters.offset-50);void load();};
  root.querySelector('[data-next]').onclick=()=>{filters.offset+=50;void load();};
  for(const type of ['detail','approve','reject'])root.querySelectorAll('[data-'+type+']').forEach(b=>b.onclick=()=>void open(b.dataset[type],type));
 }
 function errorPopup(message){const modal=showStatusModal({title:'ไม่สามารถดำเนินการได้',message,tone:'error',dismissOnEscape:false});modal.update({title:'ไม่สามารถดำเนินการได้',message,tone:'error',close:()=>modal.close()});}
 async function operation(message,work,success){
  if(busy)return;busy=true;closeDetail();
  const modal=showStatusModal({message,tone:'working',dismissOnEscape:false});
  try{const value=await work();if(!current()){modal.close();return;}if(success)modal.update({title:success,message:success,tone:'success',close:()=>modal.close()});else modal.close();return value;}
  catch(error){if(current()){rows=[];loaded=false;draw();}modal.update({title:'ไม่สามารถดำเนินการได้',message:error.message,tone:'error',detail:'หากการเชื่อมต่อขัดข้อง ให้รีเฟรชตรวจสถานะล่าสุดก่อนลองใหม่',close:()=>modal.close()});}
  finally{busy=false;}
 }
 async function load(){await operation('กำลังโหลดคำขอ',async()=>{await getRegistrationAdminContext();rows=await listRegistrationRequests(filters);loaded=true;draw();});}
 async function open(id,type){
  const value=await operation('กำลังตรวจสอบคำขอ',()=>getRegistrationRequestById(id));
  if(!value||!current())return;detail=value;preview=null;showDetail(type);
 }
 function showDetail(type='detail'){
  closeDetail();previousOverflow=document.body.style.overflow;previousFocus=document.activeElement;document.body.style.overflow='hidden';
  const r=detail.request;overlay=document.createElement('div');overlay.className='registration-review-backdrop';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-labelledby','review-title');
  const field=(label,value)=>'<div><dt>'+esc(label)+'</dt><dd>'+esc(value)+'</dd></div>';
  overlay.innerHTML='<section class="registration-review-card"><h2 id="review-title">'+(preview?'Approval Preview':'รายละเอียดคำขอ')+'</h2><dl class="work-manager-fields">'+
   field('ข้อมูล LINE',detail.line_verified?'ยืนยันตรงกับหลักฐานผู้ส่งคำขอแล้ว':'ยังยืนยันข้อมูล LINE ไม่ได้')+field('LINE User ID',masked(r.line_user_id))+field('LINE Display Name',r.line_display_name)+field('ชื่อผู้สมัคร',r.employee_name)+field('รหัสพนักงาน',r.employee_code)+field('เบอร์โทรศัพท์',r.phone)+field('กลุ่มงานหลักที่ขอ',r.requested_main_group||'ให้ Admin กำหนด')+field('กลุ่มงานที่ขอ',r.requested_groups.join(', ')||'ให้ Admin กำหนด')+field('หมายเหตุ',r.note)+field('วันที่ส่งคำขอ',date(r.created_at))+field('สถานะ',statusLabel[r.status])+field('ผู้ตรวจสอบ',detail.reviewer||r.reviewed_by)+field('วันที่ตรวจสอบ',date(r.reviewed_at))+field('เหตุผล',r.review_reason)+
   field('บัญชีที่ LINE ตรงกัน',detail.employee?detail.employee.employee_name+' · '+(detail.employee.employee_code||'ไม่มีรหัส')+' · '+(detail.employee.active?'ใช้งานอยู่':'ถูกระงับ'):'ยังไม่มีบัญชี')+'</dl><h3>ประวัติสถานะ</h3><ul>'+detail.history.map(h=>'<li>'+esc(date(h.created_at))+' · '+esc(h.action)+' · '+esc(h.new_value?.status||'pending')+'</li>').join('')+'</ul>'+
   detail.warnings.map(w=>'<p class="notice notice-warning">'+esc(reviewMessage(w))+'</p>').join('')+
   (detail.code_matches||[]).map(e=>'<p class="notice notice-warning">รหัสพนักงานซ้ำ: '+esc(e.employee_name)+' · '+esc(e.employee_code)+'</p>').join('')+
   (r.status==='pending'?(preview?
    '<div class="notice"><h3>ผลที่จะเกิด</h3><p>'+esc(preview.mode==='create'?'สร้างบัญชีพนักงานใหม่':preview.mode==='reactivate'?'เปิดใช้งานบัญชีเดิมและเพิ่มสิทธิ์':'อัปเดตสิทธิ์ของบัญชีเดิม')+'</p><p>ตั้ง active = true · กลุ่มงานหลัก '+esc(preview.main_group)+'</p><p>กลุ่มงานที่ให้สิทธิ์: '+esc(preview.groups.join(', '))+'</p><p>สิทธิ์ใหม่/เปิดใช้งาน: '+esc(preview.groups.filter(g=>!preview.existing_groups.some(e=>e.group_name===g&&e.active)).join(', ')||'ไม่มีสิทธิ์เพิ่ม')+'</p></div>'+preview.warnings.map(w=>'<p class="notice notice-warning">'+esc(reviewMessage(w))+'</p>').join('')+preview.errors.map(w=>'<p class="notice notice-error">'+esc(reviewMessage(w))+'</p>').join('')+
    '<div class="form-actions"><button class="button button-primary" data-confirm '+(!preview.can_approve?'disabled':'')+'>ยืนยันอนุมัติ</button><button class="button" data-back>กลับไปกำหนดสิทธิ์</button></div>':
    '<form data-approval><h3>กลุ่มงานที่ Admin กำหนด</h3><p>ผู้สมัครส่งข้อมูลส่วนตัวเท่านั้น กลุ่มงานกำหนดโดย Admin</p><div class="form-grid">'+ORDINARY_GROUPS.map(g=>'<label><input name="groups" type="checkbox" value="'+g+'"> '+g+'</label>').join('')+'</div><label class="field">กลุ่มงานหลัก<select name="main_group"><option value="">เลือกกลุ่มงานหลัก</option>'+ORDINARY_GROUPS.map(g=>'<option>'+g+'</option>').join('')+'</select></label><label class="field">การดำเนินการ<select name="mode"><option value="create">สร้างบัญชีใหม่</option><option value="reactivate" '+(detail.employee&&!detail.employee.active?'selected':'')+'>เปิดใช้งานบัญชีที่ถูกระงับ</option><option value="update_permissions" '+(detail.employee?.active?'selected':'')+'>อัปเดตสิทธิ์บัญชีที่มีอยู่แล้ว</option></select></label><label><input name="confirm_reactivate" type="checkbox"> ยืนยันเปิดใช้งานบัญชีที่ถูกระงับอีกครั้ง</label><label class="field">เหตุผล / หมายเหตุการอนุมัติ<textarea name="reason" maxlength="2000"></textarea></label><button class="button button-primary">สร้าง Preview และตรวจข้อมูลซ้ำ</button></form>')+
    (!preview?'<form data-rejection><h3>ไม่อนุมัติคำขอ</h3><label class="field">เหตุผล (จำเป็น)<textarea name="reason" required maxlength="2000"></textarea></label><button class="button">ยืนยันไม่อนุมัติ</button></form>':''):'')+
   '<div class="form-actions"><button class="button" data-close>ยกเลิก / ปิด</button></div></section>';
  document.body.append(overlay);overlay.querySelector('[data-close]').onclick=closeDetail;
  overlay.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();closeDetail();}if(event.key==='Tab'){const items=[...overlay.querySelectorAll('button:not([disabled]),input,select,textarea')];if(event.shiftKey&&document.activeElement===items[0]){event.preventDefault();items.at(-1).focus();}else if(!event.shiftKey&&document.activeElement===items.at(-1)){event.preventDefault();items[0].focus();}}});
  overlay.querySelector('button,input,select,textarea')?.focus();
  overlay.querySelector('[data-approval]')?.addEventListener('submit',async event=>{
   event.preventDefault();if(busy)return;const form=new FormData(event.target);
   const input={groups:form.getAll('groups'),main_group:form.get('main_group'),mode:form.get('mode'),confirm_reactivate:form.has('confirm_reactivate'),reason:form.get('reason')};
   const value=await operation('กำลังสร้าง Preview และตรวจข้อมูลซ้ำ',()=>getApprovalPreview(r.id,input));
   if(value){preview={...value,input};showDetail();}
  });
  overlay.querySelector('[data-back]')?.addEventListener('click',()=>{preview=null;showDetail();});
  overlay.querySelector('[data-confirm]')?.addEventListener('click',()=>void operation('กำลังอนุมัติคำขอ · สร้างบัญชี สิทธิ์ และประวัติพร้อมกัน',async()=>{
   await approveRegistrationRequest(r.id,{...preview.input,expected_preview:preview.preview_token});rows=await listRegistrationRequests(filters);draw();
  },'อนุมัติสำเร็จ'));
  overlay.querySelector('[data-rejection]')?.addEventListener('submit',event=>{event.preventDefault();const reason=new FormData(event.target).get('reason').trim();if(!reason)return;void operation('กำลังไม่อนุมัติและบันทึกประวัติ',async()=>{await rejectRegistrationRequest(r.id,reason);rows=await listRegistrationRequests(filters);draw();},'ไม่อนุมัติสำเร็จ');});
  if(type==='reject')overlay.querySelector('[data-rejection] textarea')?.focus();
 }
 draw();await load();
}


