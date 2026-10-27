import { APP_MODE } from "../js/config.js?v=1.3.186";
import { escapeHtml } from "../js/utils.js?v=1.3.186";

export function renderLoginScreen(message = "") {
  const mock = APP_MODE === "mock";
  const heading = mock ? "เข้าสู่ระบบตัวอย่าง" : "เข้าสู่ระบบด้วย LINE";
  const description = mock
    ? "ทางเข้าระบบเดียวสำหรับพนักงานกลุ่มผลิต สกรีน ขนส่ง ออฟฟิต ผู้บริหาร และ Admin ตอนนี้เป็นโหมดจำลอง ยังไม่ตรวจ LINE หรือสิทธิจากชีตจริง"
    : "ยืนยันตัวตนด้วย LINE แล้วระบบจะแสดงหน้าตามบทบาทและกลุ่มงานที่ได้รับอนุญาตจากข้อมูลสิทธิที่ตรวจสอบแล้ว";  return '<section class="login-screen card card-pad" aria-labelledby="login-title">' +
    '<div class="login-brand"><img src="./assets/icons/sip-logo.png" alt="" width="64" height="64"><div><p class="eyebrow">ระบบโรงงาน SIP</p><h1 id="login-title">' + heading + '</h1></div></div>' +
    '<p class="login-description">' + description + '</p>' +
    (message ? '<p class="notice notice-warning" role="alert">' + escapeHtml(message) + '</p>' : '') +
    '<button class="button button-primary login-submit" type="button" data-auth-login>' + (mock ? "เข้าสู่ระบบตัวอย่าง" : "ยืนยันตัวตนด้วย LINE") + '</button>' +
    (message === 'ยังไม่มีบัญชีในระบบ' ? '<button class="button login-submit" type="button" disabled aria-describedby="signup-later">สมัครสมาชิก (Pass ถัดไป)</button><p id="signup-later" class="help-text">ยังไม่เปิดรับสมัคร กรุณาติดต่อ Admin</p>' : '') +
    '<p class="help-text login-privacy">ระบบจะไม่เก็บ LINE token ไว้ในเครื่อง สิทธิ์ใช้งานต้องมาจาก backend เท่านั้น</p>' +
    '</section>';
}

