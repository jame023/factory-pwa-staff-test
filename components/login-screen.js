import { APP_MODE } from "../js/config.js?v=1.3.186";
import { escapeHtml } from "../js/utils.js?v=1.3.186";

export function renderLoginScreen(message = "") {
  const mock = APP_MODE === "mock";
  const heading = mock ? "เข้าสู่ระบบตัวอย่าง" : "เข้าสู่ระบบด้วย LINE";
  const signedOut = message === "ออกจากระบบสำเร็จ";
  return '<section class="login-screen card card-pad" aria-labelledby="login-title">' +
    '<div class="login-brand"><img src="./assets/icons/sip-logo.png" alt="" width="64" height="64"><div><p class="eyebrow">ระบบโรงงาน SIP</p><h1 id="login-title">' + heading + '</h1></div></div>' +
    (mock ? '<p class="login-description">พื้นที่สาธิตสำหรับทดลองใช้งาน</p>' : '') +
    (message ? '<p class="notice ' + (signedOut ? 'notice-success" role="status' : 'notice-warning" role="alert') + '">' + escapeHtml(message) + '</p>' : '') +
    '<div class="login-actions">' +
      '<button class="button button-primary login-submit" type="button" data-auth-login>' + (mock ? "เข้าสู่ระบบตัวอย่าง" : "เข้าสู่ระบบ") + '</button>' +
      (mock ? '' : '<button class="button login-register" type="button" data-auth-register>สมัครสมาชิก</button>') +
    '</div>' +
    '</section>';
}
