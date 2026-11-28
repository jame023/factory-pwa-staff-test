import { APP_MODE, APP_NAME, ROLE_LABELS } from "../js/config.js?v=1.3.412";
import { escapeHtml } from "../js/utils.js?v=1.3.412";
import { notificationBellMarkup } from '../js/notification-badge.js?v=1.3.412';
import { iconMarkup } from '../js/ui-icons.js?v=1.3.412';

export function renderAppHeader(user) {
  return '<div class="app-header"><div class="header-inner sip-header-layout">' +
    '<div class="header-brand-row">' +
      '<a class="brand" href="#/home" aria-label="ระบบโรงงาน SIP หน้าแรก">' +
        '<img class="brand-mark" src="./assets/icons/sip-logo.png" alt="" width="48" height="48">' +
        '<span class="brand-copy"><span class="brand-title">' + escapeHtml(APP_NAME) + '</span></span>' +
      '</a>' + notificationBellMarkup() +
    '</div>' +
    '<div class="header-tools">' +
      '<div class="header-context">' +
        (APP_MODE === 'supabase-line' ? '<span class="workspace-switch" aria-label="พื้นที่ปัจจุบัน">พื้นที่: '+escapeHtml(user.workspaceLabel||'ยังไม่ได้เลือก')+'</span>' : '') +
        '<span class="mode-pill">' + (APP_MODE === "mock" ? "DEV MOCK" : APP_MODE === "development" ? "LOCAL API" : "LINE") + '</span>' +
        '<span class="badge badge-info" aria-label="บทบาทที่ได้รับ">' + escapeHtml(ROLE_LABELS[user.role]) + '</span>' +
        (APP_MODE === "mock" && user.groups?.length ? '<span class="badge badge-info" aria-label="กลุ่มจำลอง">' + escapeHtml(user.groups.join(" / ")) + '</span>' : '') +
      '</div>' +
      '<div class="header-actions">' +
        (APP_MODE === 'supabase-line' ?
          '<button class="button button-small notification-header-toggle" type="button" role="switch" aria-checked="false" aria-label="กำลังโหลดสถานะการแจ้งเตือน" data-device-notification-toggle data-action-feedback="false" disabled><span class="header-action-icon" aria-hidden="true">'+iconMarkup('bell')+'</span><span>แจ้งเตือน</span><span class="notification-switch-track" aria-hidden="true"><span></span></span><span data-device-notification-state>กำลังโหลด</span></button>' : '') +
        (APP_MODE !== "development" ? '<button class="button button-small" type="button" data-auth-logout>ออกจากระบบ</button>' : '') +
      '</div>' +
    '</div></div></div>';
}
