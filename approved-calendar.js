import * as calendarApi from "../../adapters/package08.js?v=1.3.186";
import { watchChanges, mockLiveEnabled } from "../../js/live-updates.js?v=1.3.186";
import { bangkokToday, escapeHtml, thaiDate } from "../../js/utils.js?v=1.3.186";

const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

function renderMonth(month, approvedLeaves = []) {
  const first = new Date(month + "-01T00:00:00Z");
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const leaves = approvedLeaves.filter(row => row.date?.startsWith(month) && row.employee);
  const byDate = new Map();
  for (const row of leaves) {
    if (!byDate.has(row.date)) byDate.set(row.date, []);
    byDate.get(row.date).push(row);
  }
  const padding = Array.from({ length: first.getUTCDay() }, () => '<div aria-hidden="true"></div>').join("");
  const cells = Array.from({ length: lastDay }, (_, index) => {
    const day = index + 1;
    const date = month + "-" + String(day).padStart(2, "0");
    const people = byDate.get(date) || [];
    const label = thaiDate(date) + (people.length
      ? " อนุมัติลา " + people.map(row => row.employee + " " + (row.period || "เต็มวัน")).join(", ")
      : " ไม่มีผู้ได้รับอนุมัติลา");
    return '<div class="calendar-cell leave-calendar-day' + (people.length ? ' has-approved-leave' : '') +
      (date === bangkokToday() ? ' is-today' : '') + '" aria-label="' + escapeHtml(label) +
      '"><strong>' + day + '</strong>' + (people.length
        ? '<span class="leave-calendar-count">ลา ' + people.length + ' คน</span>' +
          '<span class="leave-calendar-person">' + escapeHtml(people[0].employee) + '</span>' +
          (people.length > 1 ? '<span class="leave-calendar-more">+' + (people.length - 1) + ' คน</span>' : '')
        : '') + '</div>';
  }).join("");
  const dates = [...byDate.keys()].sort();
  const details = dates.length ? dates.map(date =>
    '<article class="leave-calendar-detail"><h3>' + escapeHtml(thaiDate(date)) + '</h3><ul>' +
    byDate.get(date).map(row => '<li><strong>' + escapeHtml(row.employee) + '</strong><span>' +
      escapeHtml(row.period || "เต็มวัน") + ' • ' + escapeHtml(row.group || "ไม่ระบุกลุ่ม") +
      '</span></li>').join("") + '</ul></article>').join("")
    : '<p class="empty-state">เดือนนี้ยังไม่มีวันลาที่อนุมัติ</p>';
  return '<div class="calendar-grid leave-calendar-grid" aria-label="ปฏิทินวันลาที่อนุมัติ">' +
    ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."].map(day => '<span class="small-muted">' + day + '</span>').join("") +
    padding + cells + '</div><div class="leave-calendar-details"><h3>รายชื่อผู้ได้รับอนุมัติลา</h3>' +
    details + '</div>';
}

export function mountApprovedLeaveCalendar(root, context) {
  const section = root.querySelector("[data-leave-calendar]");
  if (!section) return;
  let month = root.dataset.leaveCalendarMonth || bangkokToday().slice(0, 7);
  let revision = 0;
  let busy = false;
  section.innerHTML = '<div class="leave-calendar-heading"><div><h2>ปฏิทินกลาง • วันลาที่อนุมัติ</h2>' +
    '<p class="help-text">ทุกกลุ่มงาน • แสดงชื่อ วันลา และช่วงเวลา ไม่แสดงเหตุผลหรือเอกสารส่วนตัว</p></div>' +
    '<label class="field" for="leave-calendar-month">เลือกเดือน' +
    '<input id="leave-calendar-month" type="month" value="' + escapeHtml(month) + '"></label></div>' +
    '<div data-leave-calendar-body></div>';
  const input = section.querySelector("#leave-calendar-month");
  const body = section.querySelector("[data-leave-calendar-body]");
  async function load() {
    const current = ++revision;
    busy = true;
    input.disabled = true;
    body.innerHTML = '<p class="page-loading" role="status">กำลังอ่านวันลาที่อนุมัติ…</p>';
    try {
      const data = await calendarApi.readCalendar(month);
      if (context.signal?.aborted || !root.contains(section) || current !== revision) return;
      body.innerHTML = renderMonth(month, data.approvedLeaves || []);
    } catch (error) {
      if (context.signal?.aborted || !root.contains(section) || current !== revision) return;
      body.innerHTML = '<p class="notice notice-danger" role="alert">อ่านปฏิทินวันลาไม่สำเร็จ กรุณาลองอีกครั้ง</p>' +
        '<button class="button button-small" type="button" data-retry-leave-calendar>ลองอีกครั้ง</button>';
      body.querySelector("[data-retry-leave-calendar]")?.addEventListener("click", () => { void load(); });
      context.showToast(error.message || "อ่านปฏิทินวันลาไม่สำเร็จ", "error");
    } finally {
      if (current === revision) {
        busy = false;
        input.disabled = false;
      }
    }
  }
  input.addEventListener("change", () => {
    if (!monthPattern.test(input.value)) return;
    month = input.value;
    root.dataset.leaveCalendarMonth = month;
    void load();
  });
  if (mockLiveEnabled) {
    root._leaveCalendarWatcher = watchChanges(() => load(), {
      signal: context.signal,
      busy: () => busy,
      onError: () => context.showToast("อัปเดตปฏิทินวันลาไม่สำเร็จ", "error")
    });
  }
  void load();
}
