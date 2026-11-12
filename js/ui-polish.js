import { ICONS, routeIcon } from './ui-icons.js?v=1.3.340';

// Add decorative icon attributes only. Never replace controls or change names,
// values, listeners, visibility, session state or authorization.
document.body.classList.add('sip-ui');
const rules=[
 [/^(ดูรายละเอียด|แสดงรายละเอียด)/,'eye'],[/^(เพิ่ม|สร้างใหม่|ส่งคำขอใหม่)/,'plus'],
 [/^(แก้ไข|จัดการสิทธิ์)/,'edit'],[/^(บันทึก|ตรวจสอบและบันทึก)/,'save'],
 [/^(ค้นหา)/,'search'],[/^(ล้าง|รีเฟรช|ตรวจสอบสถานะ|ลองใหม่)/,'refresh'],
 [/^(ไม่อนุมัติ|ยืนยันไม่อนุมัติ|ปิดใช้งาน)/,'close'],[/^(อนุมัติ|ยืนยันอนุมัติ|เปิดใช้งาน)/,'check'],
 [/^(ปิด|ยกเลิก)/,'close'],[/^(กลับ|ก่อนหน้า)/,'back'],[/^(ถัดไป)/,'arrow'],
 [/^(ออกจากระบบ)/,'logout'],[/^(เข้าสู่ระบบ|ยืนยัน.*LINE)/,'login']
];
const uri=name=>'url("data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">'+ICONS[name]+'</svg>')+'")';
function decorate(element) {
 if(!(element instanceof Element))return;
 for(const control of [element,...element.querySelectorAll('button,a.button,h1')]) {
  if(!control.matches('button,a.button,h1')||control.closest('.admin-hub,.workspace-hub')||control.querySelector('svg'))continue;
  if(control.matches('h1')) {control.dataset.uiIcon=control.closest('.login-screen')?'login':routeIcon(location.hash);control.style.setProperty('--ui-icon',uri(control.dataset.uiIcon));continue;}
  if(control.closest('[data-global-status-modal]')||control.classList.contains('employee-editor-close')||control.closest('.calendar-grid'))continue;
  const label=control.textContent.trim(),match=rules.find(([pattern])=>pattern.test(label));
  if(match){control.dataset.uiIcon=match[1];control.style.setProperty('--ui-icon',uri(match[1]));}
 }
}
let queued=false;
const pending=new Set();
const observer=new MutationObserver(records=>{
 for(const record of records)for(const node of record.addedNodes)if(node instanceof Element)pending.add(node);
 if(queued||!pending.size)return;
 queued=true;requestAnimationFrame(()=>{queued=false;for(const node of pending)if(node.isConnected)decorate(node);pending.clear();});
});
decorate(document.body);
observer.observe(document.body,{childList:true,subtree:true});
window.addEventListener('hashchange',()=>decorate(document.getElementById('page-root')));
