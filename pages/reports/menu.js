import { appCard } from "../../components/app-card.js?v=1.3.340";
import { canAccessModule } from "../../js/permissions.js?v=1.3.340";

const executiveMenus = [
  { module:"attendance", route:"executive/attendance", icon:"🪪", title:"เวลาเข้าออก", hint:"ดูเวลาเข้าออกและสถานะพนักงาน" },
  { module:"work-session", route:"executive/work-session", icon:"▶️", title:"ข้อมูลการทำงาน", hint:"ดูงานที่พนักงานบันทึก" },
  { module:"leave", route:"executive/leave", icon:"📝", title:"คำขอลา", hint:"ตรวจคำขอลาและประวัติการลา" },
  { module:"calendar", route:"executive/calendar", icon:"📅", title:"ปฏิทินการทำงาน", hint:"กำหนดวันทำงานของแต่ละกลุ่ม" },
  { module:"production", route:"executive/production", icon:"🖨️", title:"ข้อมูลสกรีน", hint:"ดูรายการงานสกรีนที่บันทึกแล้ว" },
  { module:"delivery", route:"executive/delivery", icon:"🚚", title:"ข้อมูลการขนส่ง", hint:"ดูรายการขนส่งที่บันทึกแล้ว" },
  { module:"production-record", route:"executive/production-record", icon:"🏭", title:"ข้อมูลผลิต", hint:"ดูยอดผลิตที่บันทึกแล้ว" },
  { module:"reports", route:"executive/reports", icon:"📊", title:"รายงานสรุป", hint:"ดูภาพรวมรายวัน รายสัปดาห์ และพนักงานดีเด่น" },
  { module:"ot", route:"executive/ot", icon:"⏱️", title:"รายงาน OT", hint:"ตรวจรายการ OT รายละเอียดงาน และรูปหลักฐาน" }
];

export async function render(root, { user } = {}) {
  const visibleMenus = executiveMenus.filter(item => canAccessModule(user, item.module));
  root.innerHTML =
    '<div class="page-heading"><div><p class="eyebrow">ระบบโรงงาน SIP</p><h1>เมนูรายงาน</h1>' +
    '<p>เลือกดูข้อมูลแต่ละหมวดหรือรายงานที่ต้องการ</p></div></div>' +
    '<div class="section-title"><div><h2>ข้อมูลแยกตามหมวด</h2></div></div>' +
    '<div class="module-grid">' + visibleMenus.filter(item => !["reports","ot"].includes(item.module)).map(appCard).join("") + '</div>' +
    '<div class="section-title"><div><h2>รายงาน</h2></div></div>' +
    '<div class="module-grid">' + visibleMenus.filter(item => ["reports","ot"].includes(item.module)).map(appCard).join("") + '</div>';
}
