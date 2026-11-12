import * as attendanceApi from "../../adapters/package10.js?v=1.3.250";
import * as workApi from "../../adapters/package07.js?v=1.3.186";
import * as leaveApi from "../../adapters/package09.js?v=1.3.186";
import { appCard, statCard } from "../../components/app-card.js?v=1.3.340";
import { bangkokToday, escapeHtml, thaiDate } from "../../js/utils.js?v=1.3.186";
import { APP_MODE } from "../../js/config.js?v=1.3.186";
import { canAccessModule, isProductionEmployee, isScreenEmployee } from "../../js/permissions.js?v=1.3.186";

const employeeModules = [
  { route:"attendance", icon:"🪪", title:"ข้อมูลของฉัน", hint:"ดูเวลาเข้าออกและสถานะ" },
  { route:"leave", icon:"📝", title:"ขอลา", hint:"ส่งคำขอและติดตามสถานะ" },
  { route:"calendar", icon:"📅", title:"ปฏิทินงาน", hint:"ดูวันที่ทำงานตามกลุ่ม" },
  { route:"delivery", icon:"🚚", title:"บันทึกการขนส่ง", hint:"เลือกสินค้าและบันทึกจำนวน" },
  { route:"production", icon:"🖨️", title:"งานสกรีน", hint:"เริ่มงาน–จบงาน และบันทึกยอดสกรีนในหน้าเดียว" },
  { route:"production-record", icon:"🏭", title:"งานผลิต", hint:"เริ่มงาน–จบงาน และบันทึกยอดผลิตในหน้าเดียว" }
  ,{ route:"ot", icon:"⏱️", title:"กรอกข้อมูล OT", hint:"บันทึกงานล่วงเวลา พร้อมรายละเอียดและรูปหลักฐาน" }
];
const executiveModules = [
  { route:"reports-menu", icon:"📊", title:"เมนูรายงาน", hint:"รวมข้อมูลแยกตามหมวดและรายงานทั้งหมด" },
  { route:"manage", icon:"🗂️", title:"เมนูจัดการข้อมูล", hint:"จัดการข้อมูลพนักงาน กลุ่มงาน และรายการของระบบ" }
];
const adminModules = [
  { route:"admin/registrations", icon:"📋", title:"ตรวจคำขอสมัครสมาชิก", hint:"ตรวจ LINE กำหนดกลุ่มงาน และอนุมัติคำขอ" },
  { route:"employee", icon:"👷", title:"หน้าพนักงาน", hint:"ใช้ทุกฟังก์ชันกรอกข้อมูล" },
  { route:"executive", icon:"📊", title:"หน้าผู้บริหาร", hint:"ดูข้อมูล อนุมัติลา และตั้งปฏิทิน" },
  { route:"admin", icon:"⚙️", title:"แก้ไขข้อมูลทั้งหมด", hint:"เลือกหมวดเพื่อเพิ่มหรือแก้ไขข้อมูล" }
];

export async function render(root, { user, signal, workspace }) {
  root.innerHTML = '<div class="page-loading"><span class="loading-spinner"></span><span>กำลังโหลดภาพรวม…</span></div>';
  if (APP_MODE === "development") {
    const data = await attendanceApi.readMyAttendance({}, { signal });
    root.innerHTML = '<section class="card hero-card"><h1>สวัสดี ' + escapeHtml(user.name) +
      '</h1><p>อ่านข้อมูลจาก API ทดสอบในเครื่อง</p></section>' +
      '<p class="notice notice-warning">LOCAL FIXTURE • ข้อมูลทดสอบ ไม่มีข้อมูล Production</p>' +
      '<div class="grid grid-2">' + statCard("เวลาเข้า",data.checkIn || "—","วันนี้") +
      statCard("เวลาออก",data.checkOut || "ยังไม่มีข้อมูล","วันนี้") + '</div>' +
      '<div class="section-title"><h2>เมนูที่เปิด API ทดสอบ</h2></div><div class="module-grid">' +
      appCard(employeeModules[0]) + '</div>';
    return;
  }
  const [attendance, work, leaves] = await Promise.all([
    attendanceApi.readMyAttendance(), canAccessModule(user, "work-session") ? workApi.listWorkSessions() : Promise.resolve([]), leaveApi.listLeaveRequests()
  ]);
  const active = work.find(item => !item.endedAt);
  const pending = leaves.filter(item => item.status === "pending").length;
  const role = user.role === "admin" && ["employee", "executive"].includes(workspace) ? workspace : user.role;
  const title = { employee:"หน้าพนักงาน", executive:"หน้าผู้บริหาร", admin:"หน้า Admin" }[role];
  const description = { employee:user.groups?.some(group => ["ออฟฟิต","ออฟฟิศ"].includes(group)) ? "ดูข้อมูลของฉัน ส่งคำขอลา และตรวจปฏิทินงาน" : "กรอกข้อมูลงาน การขนส่ง ข้อมูลสกรีน และขอลา",
    executive:"ดูข้อมูลที่พนักงานบันทึก แยกตามหมวด พร้อมจัดการลาและปฏิทิน",
    admin:"ใช้งานได้ทั้งหน้าพนักงานและผู้บริหาร พร้อมแก้ไขข้อมูลทุกหมวด" }[role];
  const modules = role === "employee" ? employeeModules : role === "executive" ? executiveModules : adminModules;
  const visible = modules.filter(item => canAccessModule(user, item.route)).map(item => ({
    ...item, route:role === "admin" ? item.route : role + "/" + item.route
  }));
  root.innerHTML =
    '<section class="card hero-card"><div class="hero-date">' + escapeHtml(thaiDate(bangkokToday())) +
    '</div><h1>' + escapeHtml(title) + '</h1><p>' + escapeHtml(description) + '</p></section>' +
    (role === "employee" ? '<div class="grid grid-3" style="margin-top:.8rem">' +
      statCard("เวลาเข้าของฉัน", attendance.checkIn || "—", attendance.checkOut ? "ออก " + attendance.checkOut : "วันนี้") +
      (canAccessModule(user, "work-session") ? statCard("งานที่กำลังทำ", String(work.filter(item => !item.endedAt).length), active ? active.machine : "ยังไม่มีงาน") : "") +
      statCard("คำขอลารออนุมัติ", String(pending), "รายการตามสิทธิ์บัญชี") +
    '</div>' : '') + (user.role === "admin" && role !== "admin" ? '<p><a class="button" href="#/home">กลับหน้า Admin</a></p>' : '') +
    '<div class="section-title"><div><h2>' + (role === "employee" ? "กรอกข้อมูล" : role === "executive" ? "ข้อมูลแยกตามหมวด" : "เลือกหน้าที่ต้องการใช้งาน") + '</h2></div></div>' +
    '<div class="module-grid">' + visible.map(appCard).join("") + "</div>" +
    '<p class="small-muted" style="margin-top:1rem">ข้อมูลหน้าหลักอ่านจาก Supabase ตามสิทธิ์ของบัญชี</p>';
}


