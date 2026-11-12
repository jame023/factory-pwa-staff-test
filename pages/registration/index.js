import {hideActionPopup} from '../../components/action-popup.js?v=1.3.186';
import {escapeHtml as esc,thaiDateTime} from '../../js/utils.js?v=1.3.186';
import {showStatusModal,isStatusModalOpen} from '../../components/status-modal.js?v=1.3.295';
import {createRegistrationRequest,validateRegistration,refreshMyRegistrationStatus,checkApprovedEmployeeStatus} from '../../js/registration-api.js?v=1.3.198';

const STATUS_LABELS={pending:'รอ Admin ตรวจสอบ',approved:'อนุมัติแล้ว',rejected:'ไม่ได้รับอนุมัติ',cancelled:'ยกเลิกแล้ว'};
const STATUS_COPY={pending:'คำขอสมัครสมาชิกอยู่ระหว่างตรวจสอบ',approved:'คำขอได้รับอนุมัติแล้ว',rejected:'คำขอไม่ได้รับอนุมัติ',cancelled:'คำขอนี้ถูกยกเลิก'};

export async function mountRegistration(root,{logout}){
 let identity,requests=[],latestAccount=null,checkedAt=null,draft={employee_name:'',employee_code:'',phone:'',note:''},busy=false;
 const date=value=>value?thaiDateTime(value):'—';
 const identityMarkup=()=>'<section class="card card-pad"><p class="eyebrow">ยืนยันตัวตนด้วย LINE แล้ว</p><h2>ข้อมูลผู้สมัคร</h2><p>ชื่อ LINE: <strong>'+esc(identity?.line_display_name||'—')+'</strong></p><span class="badge badge-success">ยืนยันตัวตนแล้ว</span></section>';
 const actions=(status,ready=false)=>'<div class="registration-actions">'+(status==='approved'&&ready?'<button class="button button-primary" data-login>เข้าสู่ระบบ</button>':'')+'<button class="button" data-check>ตรวจสอบสถานะอีกครั้ง</button>'+(['rejected','cancelled'].includes(status)?'<button class="button button-primary" data-new>ส่งคำขอใหม่</button>':'')+'<button class="button" data-exit>กลับหน้าเข้าสู่ระบบ</button><button class="button" data-exit>ออกจากระบบ LINE</button></div>';
 function wire(status,ready=false){
  root.querySelectorAll('[data-exit]').forEach(b=>b.onclick=()=>{if(!busy&&!isStatusModalOpen())void logout();});
  root.querySelector('[data-check]')?.addEventListener('click',()=>load({refresh:true}));
  root.querySelector('[data-new]')?.addEventListener('click',form);
  root.querySelector('[data-login]')?.addEventListener('click',()=>{if(!busy&&!isStatusModalOpen()&&ready)void logout();});
 }
 function historyMarkup(){
  if(requests.length<2)return '';
  return '<details class="card card-pad registration-history"><summary>ประวัติคำขอของฉัน ('+(requests.length-1)+')</summary><ol>'+requests.slice(1).map(r=>'<li><strong>'+esc(STATUS_LABELS[r.status]||'ไม่ทราบสถานะ')+'</strong><span>'+esc(date(r.created_at))+'</span></li>').join('')+'</ol></details>';
 }
 function renderStatus(){
  const request=requests[0];if(!request){form();return;}
  const approved=request.status==='approved',ready=approved&&latestAccount?.ready===true;
  const title=request.status==='pending'?STATUS_COPY.pending:approved&&!ready?'ได้รับอนุมัติแล้ว แต่ระบบกำลังเตรียมสิทธิ์':STATUS_COPY[request.status]||'สถานะคำขอสมัครสมาชิก';
  const groups=approved?(latestAccount?.groups||[]).map(g=>g.group_name):(request.requested_groups||[]);
  const groupsText=groups.length?groups.join(', '):approved?'ยังไม่มีกลุ่มงานที่ใช้งานได้':'รอ Admin/ผู้บริหารกำหนด';
  const reviewedAt=request.reviewed_at||(request.status==='cancelled'?request.updated_at:null);
  const readiness=approved?(ready?'<p class="notice notice-success">บัญชีพร้อมใช้งาน กรุณาเข้าสู่ระบบเพื่อให้ระบบตรวจสิทธิ์อีกครั้ง</p>':'<p class="notice notice-warning">ได้รับอนุมัติแล้ว แต่ระบบกำลังเตรียมสิทธิ์ บัญชียังเข้าใช้งานไม่ได้</p>'):'';
  const reason=request.review_reason?'<dt>เหตุผล</dt><dd>'+esc(request.review_reason)+'</dd>':'';
  const desc=request.status==='pending'?'<p>กรุณารอ Admin ตรวจสอบ คำขอนี้ยังไม่มีสิทธิ์เข้าใช้งานระบบ</p>':request.status==='rejected'?'<p>กรุณาติดต่อ Admin หากต้องการสอบถามเกี่ยวกับผลการตรวจสอบ</p>':request.status==='cancelled'?'<p>คำขอนี้ยังเข้าใช้งานระบบไม่ได้</p>':'';
  const mainGroup=approved&&latestAccount?.main_group?latestAccount.main_group:(request.requested_main_group||'—');
  root.innerHTML='<div class="registration-page"><header><p class="eyebrow">สถานะคำขอสมัครสมาชิก</p><h1>'+esc(title)+'</h1></header>'+identityMarkup()+'<section class="card card-pad"><span class="badge '+(ready?'badge-success':'badge-warning')+'">'+esc(STATUS_LABELS[request.status]||'ไม่ทราบสถานะ')+'</span><dl><dt>ชื่อผู้สมัคร</dt><dd>'+esc(request.employee_name||'—')+'</dd><dt>ชื่อ LINE</dt><dd>'+esc(request.line_display_name||identity?.line_display_name||'—')+'</dd><dt>รหัสพนักงาน</dt><dd>'+esc(request.employee_code||'—')+'</dd><dt>กลุ่มงานหลัก</dt><dd>'+esc(mainGroup)+'</dd><dt>กลุ่มงาน</dt><dd>'+esc(groupsText)+'</dd><dt>วันที่ส่งคำขอ</dt><dd>'+esc(date(request.created_at))+'</dd><dt>'+(request.status==='cancelled'?'วันที่ยกเลิก':'วันที่ตรวจสอบ')+'</dt><dd>'+esc(date(reviewedAt))+'</dd><dt>อัปเดตล่าสุด</dt><dd>'+esc(date(checkedAt))+'</dd>'+reason+'</dl>'+readiness+desc+actions(request.status,ready)+'</section>'+historyMarkup()+'</div>';
  wire(request.status,ready);
 }
 function form(){
  root.innerHTML='<div class="registration-page"><header><p class="eyebrow">เริ่มต้นใช้งานระบบโรงงาน SIP</p><h1>สมัครสมาชิก</h1><p>กรอกข้อมูลเพื่อส่งให้ Admin/ผู้บริหารตรวจสอบ</p></header>'+identityMarkup()+'<form class="card card-pad" data-registration><h2>ข้อมูลผู้สมัคร</h2><div class="field"><label for="reg-name">ชื่อ–นามสกุล</label><input id="reg-name" name="employee_name" autocomplete="name" required maxlength="160" value="'+esc(draft.employee_name)+'"></div><div class="field"><label for="reg-code">รหัสพนักงาน (ถ้ามี)</label><input id="reg-code" name="employee_code" maxlength="80" value="'+esc(draft.employee_code)+'"></div><div class="field"><label for="reg-phone">เบอร์โทรศัพท์ (ไม่บังคับ)</label><input id="reg-phone" name="phone" type="tel" autocomplete="tel" maxlength="20" value="'+esc(draft.phone)+'"></div><p class="notice">กลุ่มงานหลักและกลุ่มงานจะกำหนดโดย Admin/ผู้บริหารหลังตรวจสอบคำขอ</p><div class="field"><label for="reg-note">หมายเหตุเพิ่มเติม (ไม่บังคับ)</label><textarea id="reg-note" name="note" maxlength="2000" rows="4">'+esc(draft.note)+'</textarea></div><p data-error role="alert" class="notice notice-warning" hidden></p><div class="registration-actions"><button class="button button-primary" type="submit">ตรวจสอบข้อมูลก่อนส่ง</button><button class="button" type="button" data-exit>ยกเลิก</button></div></form></div>';
  wire('');const f=root.querySelector('form');
  f.onsubmit=e=>{e.preventDefault();if(busy||isStatusModalOpen())return;draft=Object.fromEntries(['employee_name','employee_code','phone','note'].map(k=>[k,f.elements[k].value.trim()]));try{validateRegistration(draft);summary();}catch(error){const p=f.querySelector('[data-error]');p.hidden=false;p.textContent=error.message;}};
 }
 function summary(){
  hideActionPopup();
  root.innerHTML='<div class="registration-page"><h1>สรุปก่อนส่งคำขอ</h1>'+identityMarkup()+'<section class="card card-pad"><dl>'+[['ชื่อผู้สมัคร',draft.employee_name],['รหัสพนักงาน',draft.employee_code],['เบอร์โทรศัพท์',draft.phone],['หมายเหตุ',draft.note]].map(([k,v])=>'<dt>'+k+'</dt><dd>'+esc(v||'—')+'</dd>').join('')+'</dl><div class="registration-actions"><button class="button button-primary" data-submit>ส่งคำขอสมัครสมาชิก</button><button class="button" data-edit>กลับไปแก้ไข</button><button class="button" data-exit>ยกเลิก</button></div></section></div>';
  wire('');root.querySelector('[data-edit]').onclick=form;root.querySelector('[data-submit]').onclick=confirm;
 }
 function confirm(){
  hideActionPopup();if(busy||isStatusModalOpen())return;
  const m=showStatusModal({title:'ยืนยันส่งคำขอ',tone:'info',message:'ตรวจสอบข้อมูลเรียบร้อยแล้วใช่หรือไม่ เมื่อส่งแล้วต้องรอ Admin ตรวจสอบ',dismissOnEscape:false,retry:()=>{if(busy)return;busy=true;root.inert=true;m.update({title:'กำลังส่งคำขอ',message:'กำลังตรวจสอบข้อมูล',tone:'working'});void submit(m);},close:()=>m.close()});
  document.querySelector('[data-status-retry]').textContent='ยืนยันส่งคำขอ';document.querySelector('[data-status-close]').textContent='กลับไปแก้ไข';
 }
 async function submit(m){
  try{
   validateRegistration(draft);m.update({title:'กำลังบันทึกคำขอ',message:'กำลังบันทึกคำขอ',tone:'working'});
   await createRegistrationRequest({...draft});
   const result=await refreshMyRegistrationStatus();identity=result.identity;requests=result.requests;latestAccount=null;checkedAt=new Date().toISOString();renderStatus();
   m.update({title:'ส่งคำขอสำเร็จ',message:'คำขอถูกบันทึกแล้วและรอ Admin ตรวจสอบ',tone:'success',close:()=>m.close()});
  }catch(error){m.update({title:'ไม่สามารถส่งคำขอได้',message:error.message||'ไม่สามารถส่งคำขอได้',tone:'error',close:()=>m.close()});}
  finally{busy=false;root.inert=false;if(m.isOpen())document.querySelector('[data-global-status-modal] [data-status-close]').textContent='ปิด';}
 }
 async function load({refresh=false}={}){
  hideActionPopup();if(busy||isStatusModalOpen())return;busy=true;
  const m=showStatusModal({title:refresh?'กำลังโหลดสถานะคำขอ':'กำลังตรวจสอบ Session',message:'กำลังโหลดสถานะคำขอ',dismissOnEscape:false});root.inert=true;
  try{
   m.update({title:'กำลังตรวจสอบ Session',message:'กำลังตรวจสอบ Session',tone:'working'});
   const result=await refreshMyRegistrationStatus();identity=result.identity;requests=result.requests;latestAccount=null;
   if(requests[0]?.status==='approved'){m.update({title:'กำลังตรวจสอบบัญชี',message:'กำลังตรวจสอบบัญชี',tone:'working'});latestAccount=await checkApprovedEmployeeStatus(requests[0].id);}
   checkedAt=new Date().toISOString();renderStatus();m.update({title:'สถานะอัปเดตแล้ว',message:requests[0]?.status==='pending'?'ยังรอตรวจสอบ':requests[0]?.status==='approved'&&!latestAccount?.ready?'บัญชียังไม่พร้อม':'สถานะอัปเดตแล้ว',tone:'success',close:()=>m.close()});
  }catch(error){
   const expired=error?.status===401||String(error?.message||'').includes('Session หมดอายุ'),noAccess=error?.status===403||String(error?.message||'').includes('ไม่มีสิทธิ์');
   latestAccount=null;root.innerHTML='<section class="card card-pad"><h1>ไม่สามารถโหลดสถานะได้</h1><p>กรุณาตรวจสอบสถานะอีกครั้ง หรือยืนยันตัวตนใหม่</p><button class="button" data-check>ตรวจสอบสถานะอีกครั้ง</button><button class="button" data-exit>กลับหน้าเข้าสู่ระบบ</button></section>';wire('');
   m.update({title:expired?'Session หมดอายุ':noAccess?'ไม่มีสิทธิ์ดูข้อมูล':'ไม่สามารถโหลดสถานะได้',message:expired?'กรุณายืนยันตัวตนใหม่ด้วย LINE':noAccess?'ไม่สามารถอ่านคำขอนี้ได้':'กรุณาลองตรวจสอบสถานะอีกครั้ง',tone:'error',close:()=>{m.close();if(expired)void logout();}});
  }finally{root.inert=false;busy=false;}
 }
 await load();
}
