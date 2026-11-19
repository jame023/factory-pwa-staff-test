import {
  disableDeviceNotifications,
  enableDeviceNotifications,
  markNotificationRead,
  readDeviceNotificationState,
  readNotificationInbox
} from '../../js/notification-client.js?v=1.3.402';
import { escapeHtml as e } from '../../js/utils.js?v=1.3.402';

const number = value => Number(value || 0).toLocaleString('th-TH');
const duration = value => {
  const minutes = Number(value || 0);
  return String(Math.floor(minutes / 60)).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0');
};
const metric = (label, value, unit = '') => '<div class="notification-report-metric"><span>' + e(label) + '</span><strong>' + e(number(value)) + (unit ? ' ' + e(unit) : '') + '</strong></div>';

function snapshotMarkup(report) {
  const categories = report?.categories;
  if (!categories || typeof categories !== 'object') return '';
  const cards = [
    ['เวลาเข้า–ออก', categories.attendance, [['รายการ', 'records'], ['มาทำงาน', 'present'], ['มาสาย', 'late'], ['ขาดงาน', 'absent']]],
    ['การลา', categories.leave, [['คำขอ', 'requests'], ['อนุมัติ', 'approved'], ['รอตรวจ', 'pending'], ['ปฏิเสธ', 'rejected']]],
    ['ปฏิทินงาน', categories.calendar, [['วัน', 'entries'], ['กำหนดทำงาน', 'workdays'], ['วันหยุด', 'holidays']]],
    ['เริ่มงาน–จบงาน', categories.workSessions, [['งาน', 'total'], ['จบแล้ว', 'completed'], ['กำลังทำ', 'inProgress']]],
    ['งานสกรีน', categories.screen, [['รายการ', 'entries'], ['แพ็คดี', 'goodPacks'], ['เสียจากสกรีน', 'screenDefects'], ['เสียจากผลิต', 'productionDefects']]],
    ['งานผลิต', categories.production, [['รายการ', 'entries'], ['จำนวนผลิต', 'quantity'], ['ของเสีย', 'defective']]],
    ['การขนส่ง', categories.delivery, [['รายการ', 'entries'], ['จำนวนสินค้า', 'quantity']]],
    ['OT', categories.overtime, [['รายงาน', 'reports'], ['พนักงาน', 'employees'], ['เวลารวม', 'minutes', 'duration']]]
  ];
  return '<section class="notification-report"><h3>สรุปรวมทุกหมวด</h3><div class="notification-report-grid">' + cards.map(([title, data, fields]) => {
    if (!data) return '';
    return '<article class="notification-report-card"><h4>' + e(title) + '</h4><div>' + fields.map(([label, key, kind]) =>
      '<p><span>' + e(label) + '</span><strong>' + e(kind === 'duration' ? duration(data[key]) : number(data[key])) + (kind === 'duration' ? '' : '') + '</strong></p>'
    ).join('') + '</div></article>';
  }).join('') + '</div><p class="small-muted">ช่วง ' + e(report.source?.from || '') + ' – ' + e(report.source?.to || '') + ' · ข้อมูล ณ ' + e(report.source?.asOf ? new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(report.source.asOf)) : '—') + '</p></section>';
}

function eventDetails(row) {
  const data = row.data && typeof row.data === 'object' ? row.data : {};
  if (data.report) return snapshotMarkup(data.report);
  const facts = [];
  if (data.employee_name) facts.push(['พนักงาน', data.employee_name]);
  if (data.start_date || data.end_date) facts.push(['วันที่ลา', [data.start_date, data.end_date].filter(Boolean).join(' – ')]);
  if (data.period) facts.push(['ช่วงเวลา', data.period]);
  if (data.group) facts.push(['กลุ่มงาน', data.group]);
  if (data.date) facts.push(['วันที่', data.date]);
  if (data.status) facts.push(['สถานะ', data.status]);
  if (Array.isArray(data.entries) && data.entries.length) facts.push(['วันที่และสถานะที่บันทึก', data.entries.map(item => [item.date, item.status].filter(Boolean).join(' • ')).join(' / ')]);
  return facts.length ? '<dl class="notification-event-facts">' + facts.map(([label, value]) => '<div><dt>' + e(label) + '</dt><dd>' + e(value) + '</dd></div>').join('') + '</dl>' : '';
}

function dateLabel(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(date);
}

function safeRoute(route, row, context) {
  if (row?.kind === 'daily_report' || row?.kind === 'weekly_report') {
    const role = context?.user?.role || context?.role;
    return role === 'executive' ? '#/executive/reports' : '#/employee/reports';
  }
  const allowed = new Set([
    '#/notifications',
    '#/employee/leave',
    '#/executive/leave',
    '#/employee/reports',
    '#/executive/registration-requests',
    '#/admin/registration-requests'
  ]);
  return allowed.has(route) ? route : '#/notifications';
}

export async function render(root, context) {
  let generation=0,deviceGeneration=0,busy=false,rows=[],hasMore=false;
  let filters={kind:'',from:'',to:''};
  root.innerHTML='<div class="page-heading"><div><h1>แจ้งเตือนระบบงาน</h1><p>รายงานและรายการที่เกี่ยวข้องกับคุณ</p></div><button class="button" type="button" data-refresh>รีเฟรช</button></div>'+
    '<section class="card card-pad notification-push-card" data-device-card aria-live="polite">กำลังตรวจสถานะอุปกรณ์…</section>'+
    '<section class="card card-pad attendance-section"><form data-inbox-filter class="form-grid"><label class="field">ประเภท<select name="kind"><option value="">ทั้งหมด</option><option value="daily_report">สรุปรายวัน</option><option value="weekly_report">สรุปรายสัปดาห์</option><option value="leave_submitted">คำขอลาใหม่</option><option value="leave_approved">ลาอนุมัติ</option><option value="leave_rejected">ลาปฏิเสธ</option><option value="calendar">ปฏิทิน</option><option value="registration">สมัครสมาชิก</option><option value="attendance_scan">สแกนบัตร</option></select></label><label class="field">ตั้งแต่วันที่<input type="date" name="from"></label><label class="field">ถึงวันที่<input type="date" name="to"></label><div class="form-actions"><button class="button" type="submit">ค้นหา</button></div></form></section>'+
    '<section class="notification-inbox-list" data-inbox-items aria-label="รายการแจ้งเตือน"></section><div data-inbox-status role="status"></div><button class="button" type="button" data-inbox-more hidden>โหลดรายการเก่าเพิ่มเติม</button>';
  const deviceHost=root.querySelector('[data-device-card]'),list=root.querySelector('[data-inbox-items]'),status=root.querySelector('[data-inbox-status]'),more=root.querySelector('[data-inbox-more]');
  const alive=()=>!context.signal?.aborted&&root.isConnected;
  const paintRows=()=>{
    list.innerHTML=rows.length?rows.map(row=>{
      const report=row.kind==='daily_report'||row.kind==='weekly_report';
      return '<article class="notification-inbox-item'+(row.read_at?'':' is-unread')+'" data-notification-id="'+e(row.id)+'"><div class="notification-inbox-item-heading"><div><h2>'+e(row.title)+'</h2><time datetime="'+e(row.created_at)+'">'+e(dateLabel(row.created_at))+'</time></div>'+(!row.read_at?'<span class="notification-unread-badge">ใหม่</span>':'')+'</div><p class="notification-inbox-body">'+e(row.body)+'</p>'+eventDetails(row)+'<div class="form-actions"><a class="button button-small" href="'+e(safeRoute(row.route,row,context))+'">'+(report?'ดูรายงาน':'เปิดข้อมูล')+'</a>'+(!row.read_at?'<button class="button button-small" type="button" data-mark-read>รับทราบ</button>':'')+'</div></article>';
    }).join(''):'<p class="empty-state">ไม่พบข้อความตามเงื่อนไข</p>';
  };
  async function load(append=false){
    const version=++generation;
    const cursor=append&&rows.length?rows[rows.length-1]:null;
    status.textContent='กำลังโหลดข้อความ…';more.disabled=true;
    try{
      const page=await readNotificationInbox({...filters,limit:25,...(cursor?{before:cursor}:{})});
      if(version!==generation||!alive())return;
      rows=append?[...rows,...page.filter(row=>!rows.some(old=>old.id===row.id))]:page;
      hasMore=page.length===25;paintRows();status.textContent='แสดง '+rows.length+' รายการ';
    }catch(error){
      if(version!==generation||!alive())return;
      status.innerHTML='<p>'+e(error.message||'โหลดข้อความไม่สำเร็จ')+'</p><button class="button" type="button" data-inbox-retry>ลองใหม่</button>';
      status.querySelector('button').onclick=()=>void load(append);
    }finally{if(version===generation&&alive()){more.hidden=!hasMore;more.disabled=false;}}
  }
  async function loadDevice(){
    const version=++deviceGeneration;
    try{
      const device=await readDeviceNotificationState();
      if(version!==deviceGeneration||!alive())return;
      const text=!device.supported?'อุปกรณ์นี้ยังไม่รองรับการแจ้งเตือน':device.ready===false?'ระบบแจ้งเตือนยังไม่พร้อม กรุณาลองอีกครั้ง':device.permission==='denied'?'การแจ้งเตือนถูกปิดในการตั้งค่าเบราว์เซอร์':device.enabled?'เปิดรับการแจ้งเตือนแล้ว':'เปิดรับการแจ้งเตือน แม้ปิดแอปอยู่';
      deviceHost.innerHTML='<div><h2>แจ้งเตือนบนอุปกรณ์</h2><p>'+e(text)+'</p></div>'+(device.supported?'<button type="button" class="notification-switch" role="switch" aria-checked="'+device.enabled+'" aria-label="'+(device.enabled?'ปิด':'เปิด')+'การแจ้งเตือนอุปกรณ์นี้" data-action-feedback="false"><span class="notification-switch-track" aria-hidden="true"><span></span></span><span>'+(device.enabled?'เปิด':'ปิด')+'</span></button>':'');
      deviceHost.querySelector('button')?.addEventListener('click',async event=>{
        if(busy)return;busy=true;const button=event.currentTarget;button.disabled=true;
        try{
          const result=await (device.enabled?disableDeviceNotifications():enableDeviceNotifications());
          window.dispatchEvent(new CustomEvent('factory-device-notifications-changed',{detail:{...device,enabled:result.status==='enabled',source:'page'}}));
          context.showToast(result.status==='permission_not_granted'?'ยังไม่ได้อนุญาตการแจ้งเตือน':'อัปเดตการแจ้งเตือนแล้ว',result.status==='permission_not_granted'?'info':'success');
        }catch(error){context.showToast(error.message||'ตั้งค่าไม่สำเร็จ','error');}
        finally{busy=false;if(alive())void loadDevice();}
      });
    }catch(error){
      if(version!==deviceGeneration||!alive())return;
      deviceHost.innerHTML='<div><h2>แจ้งเตือนบนอุปกรณ์</h2><p>'+e(error.message||'อ่านสถานะอุปกรณ์ไม่สำเร็จ')+'</p><button class="button" type="button">ตรวจสถานะอีกครั้ง</button></div>';
      deviceHost.querySelector('button').onclick=()=>void loadDevice();
    }
  }
  list.addEventListener('click',async event=>{
    const button=event.target.closest('[data-mark-read]');if(!button||busy)return;
    const id=button.closest('[data-notification-id]').dataset.notificationId;busy=true;button.disabled=true;
    try{const updated=await markNotificationRead(id);const row=rows.find(row=>row.id===id);if(row)row.read_at=updated.read_at;if(alive())paintRows();}
    catch(error){context.showToast(error.message||'บันทึกไม่สำเร็จ','error');if(button.isConnected)button.disabled=false;}
    finally{busy=false;}
  });
  more.onclick=()=>void load(true);
  root.querySelector('[data-refresh]').onclick=()=>{void load();void loadDevice();};
  root.querySelector('[data-inbox-filter]').onsubmit=event=>{event.preventDefault();const data=new FormData(event.currentTarget);const next=Object.fromEntries(data);if(next.from&&next.to&&next.from>next.to){context.showToast('วันสิ้นสุดต้องไม่ก่อนวันเริ่ม','error');return;}filters=next;void load();};
  const onDevice=event=>{if(event.detail?.source==='header')void loadDevice();};
  window.addEventListener('factory-device-notifications-changed',onDevice);
  context.signal?.addEventListener('abort',()=>window.removeEventListener('factory-device-notifications-changed',onDevice),{once:true});
  context.onDataChange?.(()=>void load());
  void loadDevice();
  await load();
}
