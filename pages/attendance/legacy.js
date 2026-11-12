import { subscribeStore } from "../../js/state.js?v=1.3.186";
import { APP_MODE } from "../../js/config.js?v=1.3.186";
import { renderManagerAttendance } from "./manager.js?v=1.3.316";
import * as attendanceApi from "../../adapters/package10.js?v=1.3.186";
import { statCard, attendanceToneClass } from "../../components/app-card.js?v=1.3.340";
import { bangkokToday, escapeHtml, thaiDate } from "../../js/utils.js?v=1.3.186";

const labels = {
  "present-full":"เต็มวัน", "present-half":"ครึ่งวัน", "in-progress":"กำลังทำงาน",
  leave:"ลา", absent:"ขาด", holiday:"หยุด", scheduled:"วันทำงาน", unrecorded:"ยังไม่มีข้อมูล"
};
const badge = status => status === "absent" ? "badge-danger" :
  status === "leave" ? "attendance-tone attendance-tone-leave" : "";
const minutes = value => value === null ? "—" : value + " นาที";
const days = value => value === null ? "—" : value + " วัน";
const historyPeriod = () => Number(bangkokToday().slice(8,10)) <= 15 ? "first" : "second";
const calendarLabels = { ...labels, "in-progress":"ทำงาน", scheduled:"รอ", unrecorded:"—" };
function calendar(data) {
  const first = data.period === "second" ? 16 : 1;
  const nextMonth = new Date(data.month + "-01T00:00:00Z");
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1, 0);
  const last = data.period === "first" ? 15 : nextMonth.getUTCDate();
  const start = new Date(data.month + "-" + String(first).padStart(2,"0") + "T00:00:00Z");
  const padding = (start.getUTCDay() + 6) % 7;
  const known = new Map(data.calendarDays.map(row => [row.date,row.status]));
  let cells = Array.from({length:padding}, () => '<div aria-hidden="true"></div>').join("");
  for (let day = first; day <= last; day++) {
    const date = data.month + "-" + String(day).padStart(2,"0");
    const status = known.get(date) || "unrecorded";
    cells += '<div class="calendar-cell attendance-day ' + badge(status) + '" aria-label="' +
      escapeHtml(thaiDate(date) + " " + labels[status]) + '"><strong>' + day +
      '</strong><span>' + escapeHtml(calendarLabels[status]) + '</span></div>';
  }
  return '<section class="card card-pad" aria-label="ปฏิทินเวลาทำงาน"><h2>ปฏิทินของฉัน</h2>' +
    '<div class="calendar-grid attendance-calendar">' +
    ["จ.","อ.","พ.","พฤ.","ศ.","ส.","อา."].map(day => '<span class="small-muted">' + day + '</span>').join("") +
    cells + '</div><p class="help-text">วันที่ยังไม่มีข้อมูลจะไม่ถูกสรุปเป็นวันขาดโดยหน้าแอป</p></section>';
}
function renderData(data, manager) {
  const source = data.source.kind === "real" ? "ข้อมูลจาก Supabase" : data.source.kind === "mock" ? "ข้อมูลจำลองในแอป" : data.source.kind === "development-fixture" ? "ข้อมูลทดสอบจาก API ในเครื่อง" : "ข้อมูลจากระบบ";
  const historyRows = rows => rows.map(row => '<div class="list-row"><div class="list-main">' +
    '<div class="list-title">' + escapeHtml(thaiDate(row.date)) + '</div><div class="list-meta">เข้า ' +
    escapeHtml(row.checkIn || "—") + ' • ออก ' + escapeHtml(row.checkOut || "—") +
    '</div><div class="list-meta attendance-history-metrics"><span class="' + attendanceToneClass("late",row.lateMinutes) + '">มาสาย ' + minutes(row.lateMinutes) + '</span><span class="' + attendanceToneClass("early",row.earlyLeaveMinutes) + '">ออกก่อนเวลา ' + minutes(row.earlyLeaveMinutes) + '</span>' +
    ' • OT ' + minutes(row.overtimeMinutes) + '</div></div><span class="badge ' + badge(row.status) + '">' +
    escapeHtml(labels[row.status]) + '</span></div>').join("") || '<p class="empty-state">ยังไม่มีข้อมูลในช่วงนี้</p>';
  const lastDay = new Date(Date.UTC(Number(data.month.slice(0,4)),Number(data.month.slice(5,7)),0)).getUTCDate();
  const firstHalf = historyPeriod() === "first";
  const visibleHistory = data.history.filter(row => firstHalf ? Number(row.date.slice(8,10)) <= 15 : Number(row.date.slice(8,10)) >= 16);
  const historyHeading = firstHalf ? "วันที่ 1–15" : "วันที่ 16–" + lastDay;
  return '<p class="notice notice-warning">' + source + ' </p>' +
    '<section class="card card-pad"><div class="status-row"><strong>ข้อมูลวันที่: ' + escapeHtml(thaiDate(data.date)) +
    '</strong><span class="badge ' + badge(data.workdayStatus) + '">' + labels[data.workdayStatus] + '</span></div></section>' +
    '<div class="grid grid-3 attendance-section">' +
      statCard("เวลาเข้า",data.checkIn || "—","วันที่แสดงด้านบน") + statCard("เวลาออก",data.checkOut || "—","วันที่แสดงด้านบน") +
      statCard("มาสาย",minutes(data.lateMinutes),"วันที่แสดงด้านบน","late") + statCard("ออกก่อนเวลา",minutes(data.earlyLeaveMinutes),"วันที่แสดงด้านบน","early") +
      statCard("OT",minutes(data.overtimeMinutes),"วันที่แสดงด้านบน") +
      statCard("การลา / ขาด",data.leaveStatus || "—",data.absent === null ? "ยังไม่มีสถานะขาด" : data.absent ? "ขาดงาน" : "ไม่ขาด") +
    '</div><div class="section-title"><h2>สรุปเดือนที่เลือก</h2></div><div class="grid grid-3">' +
      statCard("มาทำงาน",days(data.summary.attendanceDays),"เต็มวัน / ครึ่งวัน") +
      statCard("วันลา",days(data.summary.leaveDays),"ตามข้อมูลที่ส่งกลับ","leave") +
      statCard("ขาดงาน",days(data.summary.absentDays),"ตามข้อมูลที่ส่งกลับ","absent") +
      statCard("มาสายรวม",minutes(data.summary.lateMinutes),"เดือนที่เลือก","late-total") +
      statCard("ออกก่อนรวม",minutes(data.summary.earlyLeaveMinutes),"เดือนที่เลือก","early-total") +
      statCard("OT รวม",minutes(data.summary.overtimeMinutes),"เดือนที่เลือก") +
    '</div><div class="attendance-section">' + calendar(data) + '</div>' +
    '<section class="card card-pad attendance-section"><h2>ประวัติเดือนที่เลือก</h2>' +
    '<div class="attendance-history-half"><h3>' + historyHeading + '</h3><div class="list">' + historyRows(visibleHistory) + '</div></div></section>' +
    (manager ? '<section class="card card-pad attendance-section"><h2>งานรอผู้บริหาร</h2><p>คำขอลารออนุมัติ ' +
      manager.pendingLeaves + ' รายการ</p><p class="help-text">ข้อมูลสรุปจาก Supabase อ่านอย่างเดียว</p></section>' : "") +
    '<p class="small-muted">— หมายถึงยังไม่มีข้อมูล • เขตเวลา Asia/Bangkok</p>';
}

export async function render(root, { user, showToast, signal, onDataChange }) {
  if (["executive", "admin"].includes(user.role)) return renderManagerAttendance(root,{signal,showToast,onDataChange});
  let month = bangkokToday().slice(0,7);
  let currentHistoryPeriod = historyPeriod();
  let version = 0;
  let controller;
  root.innerHTML = '<div class="page-heading"><div><p class="eyebrow">Attendance</p><h1>' + (user.role === "employee" ? 'ข้อมูลของฉัน' : 'เวลาพนักงาน') + '</h1>' +
    '<p>ดูข้อมูลวันนี้และประวัติแยกตามครึ่งเดือน</p></div><button class="button button-small" data-refresh>รีเฟรช</button></div>' +
    '<section class="card card-pad"><div class="field"><label for="attendance-month">เลือกเดือน</label>' +
    '<input id="attendance-month" type="month" value="' + month + '"></div></section>' +
    '<div data-load-status role="status" aria-live="polite"></div><div data-attendance-content></div>';
  const refresh = root.querySelector("[data-refresh]");
  const status = root.querySelector("[data-load-status]");
  const content = root.querySelector("[data-attendance-content]");
  const cancel = () => controller?.abort();
  signal?.addEventListener("abort",cancel,{once:true});
  async function load() {
    const requestVersion = ++version;
    cancel(); controller = new AbortController();
    if (signal?.aborted) return;
    refresh.disabled = true;
    content.replaceChildren();
    status.innerHTML = '<div class="page-loading">กำลังอ่านเวลาทำงาน…</div>';
    try {
      const query = {month,period:"all"};
      const [data,manager] = await Promise.all([
        attendanceApi.readMyAttendance(query,{signal:controller.signal}),
        ["executive","admin"].includes(user.role) ? attendanceApi.readManagerAttendanceOverview({signal:controller.signal}) : null
      ]);
      if (requestVersion !== version || signal?.aborted) return;
      content.innerHTML = renderData(data,manager);
      status.textContent = "";
    } catch (error) {
      if (requestVersion !== version || signal?.aborted || error.name === "AbortError") return;
      status.innerHTML = '<p class="notice notice-danger">อ่านข้อมูลไม่สำเร็จ กดรีเฟรชเพื่อลองใหม่</p>';
      showToast(error.message || "อ่านข้อมูลไม่สำเร็จ","error");
    } finally { if (requestVersion === version) refresh.disabled = false; }
  }
  root.querySelector("#attendance-month").addEventListener("change",event => { month = event.target.value; load(); });
  refresh.addEventListener("click",load);
  if(APP_MODE === "mock" && !onDataChange) {
    const unsubscribe=subscribeStore(()=>{ if(!signal?.aborted)void load(); });
    signal?.addEventListener("abort",unsubscribe,{once:true});
  }
  onDataChange?.(load);
  if (signal) {
    const periodCheck = setInterval(() => {
      if (signal.aborted) return;
      const nextPeriod = historyPeriod();
      if (nextPeriod !== currentHistoryPeriod) {
        currentHistoryPeriod = nextPeriod;
        void load();
      }
    }, 60000);
    signal.addEventListener("abort",() => clearInterval(periodCheck),{once:true});
  }
  await load();
}


