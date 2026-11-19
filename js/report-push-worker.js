// A push must not contain private report details. The signed-in application
// loads the actual report after the user opens it.
self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data?.json() || {}; } catch (_) { /* use generic text */ }
  const messages = {
    daily_report: ['สรุปประจำวันพร้อมดูแล้ว', 'เปิดแอปเพื่อดูภาพรวมทุกหมวดของวันนี้'],
    weekly_report: ['สรุปประจำสัปดาห์พร้อมดูแล้ว', 'เปิดแอปเพื่อดูภาพรวมทุกหมวดของสัปดาห์นี้'],
    leave_submitted: ['มีคำขอลาใหม่', 'เปิดแอปเพื่อตรวจสอบคำขอ'],
    leave_approved: ['คำขอลาได้รับอนุมัติ', 'เปิดแอปเพื่อดูสถานะคำขอ'],
    leave_rejected: ['คำขอลาถูกปฏิเสธ', 'เปิดแอปเพื่อดูสถานะคำขอ'],
    calendar: ['ปฏิทินกลุ่มงานมีการเปลี่ยนแปลง', 'เปิดแอปเพื่อดูวันที่และสถานะที่ปรับปรุง'],
    registration: ['มีคำขอสมัครเข้าใช้งาน', 'เปิดแอปเพื่อตรวจสอบคำขอ'],
    attendance_scan: ['มีการบันทึกเวลาเข้า–ออก', 'เปิดแอปเพื่อตรวจสอบเวลา สถานะมาสาย และ OT']
  };
  const [title, body] = messages[payload.kind] || ['มีแจ้งเตือนใหม่', 'เปิดแอปเพื่อดูรายละเอียด'];
  const eventId = typeof payload.eventId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.eventId) ? payload.eventId : '';
  event.waitUntil(self.registration.showNotification(title, {
    body,
    ...(eventId ? {tag: 'factory-notification-' + eventId} : {}),
    data: { route: '#/notifications' },
    icon: new URL('assets/icons/factory-192.png', self.registration.scope).href
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(self.registration.scope);
  target.hash = '/notifications';
  event.waitUntil(self.clients.openWindow(target.href));
});
