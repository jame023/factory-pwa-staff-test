import { getLiveAdminContext } from '../../js/live-admin-context.js?v=1.3.407';
import { escapeHtml, thaiDateTime } from '../../js/utils.js?v=1.3.407';
import { APP_VERSION } from '../../js/config.js?v=1.3.407';

const stamp = value => value ? thaiDateTime(value) : 'ยังไม่มีข้อมูล';
const number = value => Number.isSafeInteger(value) && value >= 0 ? String(value) : 'ยังตรวจสอบไม่ได้';

export async function render(root, context = {}) {
  let busy = false;
  const alive = () => !context.signal?.aborted;
  async function refresh() {
    if (busy || !alive()) return;
    busy = true;
    root.innerHTML = '<section class="card card-pad" aria-busy="true"><h1>สถานะระบบ</h1><p>กำลังตรวจสอบข้อมูลล่าสุด…</p></section>';
    try {
      const live = await getLiveAdminContext();
      if (!alive()) return;
      if (!live.session || live.session.user.role !== 'admin') throw new Error('เฉพาะ Admin เท่านั้นที่ตรวจสถานะระบบได้');
      const data = await live.repository.getSystemStatus(context.signal);
      if (!alive()) return;
      if (!data || !data.rfid || !data.push || !data.scheduler || !data.reports) throw new Error('ข้อมูลสถานะระบบไม่ครบ กรุณาลองอีกครั้ง');
      const card = (title, content) => '<section class="card card-pad"><h2>'+escapeHtml(title)+'</h2>'+content+'</section>';
      const line = (label, value) => '<p><strong>'+escapeHtml(label)+':</strong> '+escapeHtml(value)+'</p>';
      root.innerHTML = '<div class="system-status-page"><div class="page-heading"><div><h1>สถานะระบบ</h1><p>ข้อมูลล่าสุด '+escapeHtml(stamp(data.checked_at))+' · แอปรุ่น '+escapeHtml(APP_VERSION)+'</p></div><button class="button button-primary" type="button" data-status-refresh>ตรวจสอบใหม่</button></div><div class="system-status-grid">'+
        card('เครื่องอ่านบัตร RFID',line('เครื่องที่ลงทะเบียน',number(data.rfid.registered))+line('เครื่องที่เปิดใช้งาน',number(data.rfid.active))+line('ติดต่อระบบล่าสุด',stamp(data.rfid.last_seen_at))+line('รับรายการสแกนล่าสุด',stamp(data.rfid.last_received_at))+(data.rfid.registered===0?'<p class="notice notice-warning">ยังไม่มีเครื่องอ่านบัตรลงทะเบียน จึงยังตรวจการแตะบัตรจากเครื่องจริงไม่ได้</p>':''))+
        card('รายงานอัตโนมัติ',line('รายวัน', 'ทุกวัน 20:50 น. เวลาไทย')+line('สร้างสรุปรายวันล่าสุด',stamp(data.reports.daily_at))+line('รายสัปดาห์','ทุกวันอาทิตย์ 18:00 น. เวลาไทย')+line('สร้างสรุปรายสัปดาห์ล่าสุด',stamp(data.reports.weekly_at))+'<p class="help-text">เวลานี้เป็นเวลาสร้างรายการในแอป การรับแจ้งเตือนบนอุปกรณ์ต้องตรวจแยก</p>')+
        card('การส่งแจ้งเตือน',line('รอส่ง',number(data.push.pending))+line('กำลังส่ง',number(data.push.processing))+line('ค้างเกิน 5 นาที',number(data.push.stale))+line('ส่งไม่สำเร็จ / ยืนยันผลไม่ได้',number(data.push.failed))+line('ประมวลผลเสร็จ',number(data.push.processed))+line('อุปกรณ์ที่เปิดรับ',number(data.push.active_subscriptions))+line('ผู้ให้บริการรับข้อความล่าสุด',stamp(data.push.last_provider_accept_at))+'<p class="help-text">ผู้ให้บริการรับข้อความแล้ว ยังไม่ยืนยันว่าอุปกรณ์แสดงหรือผู้ใช้เปิดอ่าน ไม่มีปุ่มส่งซ้ำในหน้านี้</p>')+
        card('ตัวตั้งเวลา',line('สถานะ',data.scheduler.active?'เปิดใช้งาน':'ยังไม่เปิดใช้งาน')+line('ตรวจรอบล่าสุด',stamp(data.scheduler.last_at))+line('ผลรอบล่าสุด',data.scheduler.last_status==='succeeded'?'ทำงานสำเร็จ':data.scheduler.last_status||'ยังไม่มีข้อมูล'))+
        '</div></div>';
      root.querySelector('[data-status-refresh]')?.addEventListener('click',()=>void refresh());
    } catch(error) {
      if (!alive()) return;
      root.innerHTML='<section class="card card-pad"><h1>สถานะระบบ</h1><p role="alert">'+escapeHtml(error.message||'ตรวจสถานะระบบไม่สำเร็จ')+'</p><button class="button" type="button" data-status-retry>ลองใหม่</button></section>';
      root.querySelector('[data-status-retry]')?.addEventListener('click',()=>void refresh());
    } finally { busy=false; }
  }
  await refresh();
}
