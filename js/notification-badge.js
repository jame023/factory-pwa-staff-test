import { escapeHtml } from './utils.js?v=1.3.408';
import { iconMarkup } from './ui-icons.js?v=1.3.408';

let state = { count: null, error: false };

function presentation() {
  const count = state.count;
  const badge = state.error ? '!' : count > 99 ? '99+' : count > 0 ? String(count) : '';
  const label = state.error ? 'เปิดแจ้งเตือน — ตรวจจำนวนที่ยังไม่อ่านไม่สำเร็จ'
    : count === null ? 'เปิดแจ้งเตือน — กำลังตรวจจำนวนที่ยังไม่อ่าน'
    : count > 0 ? `เปิดแจ้งเตือน — ยังไม่อ่าน ${count} รายการ` : 'เปิดแจ้งเตือน — ไม่มีรายการที่ยังไม่อ่าน';
  return { badge, label };
}

export function notificationBellMarkup() {
  const { badge, label } = presentation();
  return '<a class="button button-small notification-header-link notification-inbox-bell" href="#/notifications" data-notification-inbox-link aria-label="'+escapeHtml(label)+'" title="'+escapeHtml(label)+'" data-count-error="'+String(state.error)+'">'+
    '<span class="notification-bell-symbol" aria-hidden="true">'+iconMarkup('bell')+'</span><span class="notification-inbox-count" data-notification-unread-badge aria-hidden="true"'+(!badge?' hidden':'')+'>'+escapeHtml(badge)+'</span></a>';
}

export function setNotificationBadge(count, { error = false } = {}) {
  if (count !== null && (!Number.isSafeInteger(count) || count < 0)) throw new Error('จำนวนแจ้งเตือนไม่ถูกต้อง');
  state = { count, error };
  const next = presentation();
  document.querySelectorAll('[data-notification-inbox-link]').forEach(link => {
    link.setAttribute('aria-label',next.label);
    link.title=next.label;
    link.dataset.countError=String(error);
    const badge=link.querySelector('[data-notification-unread-badge]');
    if(badge){badge.textContent=next.badge;badge.hidden=!next.badge;}
  });
}
