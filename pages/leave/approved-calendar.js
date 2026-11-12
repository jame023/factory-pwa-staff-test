import * as leaveApi from "../../adapters/package09.js?v=1.3.253";
import { bangkokToday, escapeHtml, thaiDate } from "../../js/utils.js?v=1.3.186";

const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const standardGroups = ["สกรีน", "ผลิต", "ขนส่ง", "ออฟฟิศ", "ผู้บริหาร", "Admin"];
const groupNames = new Map([["screen", "สกรีน"], ["screening", "สกรีน"], ["production", "ผลิต"], ["produce", "ผลิต"], ["delivery", "ขนส่ง"], ["transport", "ขนส่ง"], ["office", "ออฟฟิศ"], ["executive", "ผู้บริหาร"], ["admin", "Admin"]]);
function normalizeGroup(value) {
  const raw = String(value || "").trim();
  return groupNames.get(raw.toLowerCase()) || raw;
}
function periodLabel(value) {
  return ({ full: "เต็มวัน", morning: "ครึ่งวันเช้า", afternoon: "ครึ่งวันบ่าย", "เต็มวัน": "เต็มวัน", "ครึ่งวันเช้า": "ครึ่งวันเช้า", "ครึ่งวันบ่าย": "ครึ่งวันบ่าย" })[value] || "ไม่ระบุช่วงลา";
}
function rowsForMonth(data, month) {
  const source = Array.isArray(data) ? data : (data?.approvedLeaves || []);
  const unique = new Map();
  for (const item of source) {
    if (!item || typeof item.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(item.date) || !item.date.startsWith(month)) continue;
    const row = { date: item.date, employee: String(item.employee || item.display_name || "").trim(), group: normalizeGroup(item.group || item.group_name), period: periodLabel(item.period || item.label) };
    if (!row.employee) continue;
    unique.set([row.date, row.employee, row.group, row.period].join("\u0000"), row);
  }
  return [...unique.values()].sort((a, b) => a.date.localeCompare(b.date) || a.group.localeCompare(b.group, "th") || a.employee.localeCompare(b.employee, "th") || a.period.localeCompare(b.period, "th"));
}
function renderMonth(month, leaves, selectedDate, groupFilter) {
  const first = new Date(month + "-01T00:00:00Z");
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const visible = leaves.filter(row => groupFilter === "all" || row.group === groupFilter);
  const byDate = new Map();
  for (const row of visible) { if (!byDate.has(row.date)) byDate.set(row.date, []); byDate.get(row.date).push(row); }
  const padding = Array.from({ length: first.getUTCDay() }, () => '<span aria-hidden="true"></span>').join("");
  const cells = Array.from({ length: lastDay }, (_, index) => {
    const date = month + "-" + String(index + 1).padStart(2, "0"), people = byDate.get(date) || [];
    const peopleCount = new Set(people.map(row => row.employee)).size;
    const label = thaiDate(date) + (peopleCount ? ` ลา ${peopleCount} คน` : " ไม่มีผู้ได้รับอนุมัติลา");
    return `<button class="calendar-cell leave-calendar-day${people.length ? " has-approved-leave" : ""}${date === bangkokToday() ? " is-today" : ""}${date === selectedDate ? " is-selected" : ""}" type="button" data-leave-date="${date}" aria-pressed="${date === selectedDate}" aria-label="${escapeHtml(label)}"><strong>${index + 1}</strong>${peopleCount ? `<span class="leave-calendar-count">ลา ${peopleCount} คน</span><span class="leave-calendar-periods">เต็ม ${people.filter(row=>row.period==="เต็มวัน").length} • เช้า ${people.filter(row=>row.period==="ครึ่งวันเช้า").length} • บ่าย ${people.filter(row=>row.period==="ครึ่งวันบ่าย").length}</span>` : ""}</button>`;
  }).join("");
  const selected = byDate.get(selectedDate) || [];
  const personPeriods = new Map();
  for (const row of selected) { if (!personPeriods.has(row.employee)) personPeriods.set(row.employee, new Set()); personPeriods.get(row.employee).add(row.period); }
  const anomalies = [...personPeriods].filter(([, periods]) => periods.size > 1).map(([name]) => name);
  const warning = anomalies.length ? `<p class="notice notice-danger" role="alert">ตรวจสอบรายการซ้ำในวันเดียว: ${anomalies.map(escapeHtml).join(", ")} มีหลายช่วงลาที่อนุมัติ</p>` : "";  const details = selected.length ? `${warning}<ul>${selected.map(row => `<li><strong>${escapeHtml(row.employee)}</strong><span>${escapeHtml(row.group || "ไม่ระบุกลุ่ม")} • ${escapeHtml(row.period)}</span></li>`).join("")}</ul>` : '<p class="empty-state">ไม่มีผู้ได้รับอนุมัติลาในวันนี้</p>';
  return `<div class="calendar-grid leave-calendar-grid" aria-label="ปฏิทินวันลาที่อนุมัติ">${["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."].map(day => `<span class="small-muted">${day}</span>`).join("")}${padding}${cells}</div><div class="leave-calendar-details"><h3>รายชื่อผู้ลา • ${escapeHtml(thaiDate(selectedDate))}</h3>${details}</div>`;
}
export function mountApprovedLeaveCalendar(root, context) {
  const section = root.querySelector("[data-leave-calendar]");
  if (!section) return;
  let month = root.dataset.leaveCalendarMonth || bangkokToday().slice(0, 7), selectedDate = bangkokToday(), groupFilter = "all", revision = 0, busy = false, leaves = [];
  section.innerHTML = '<div class="leave-calendar-heading"><div><h2>ปฏิทินผู้ได้รับอนุมัติลา</h2><p class="help-text">แสดงเฉพาะชื่อ กลุ่มงาน วันที่ และช่วงลา</p></div><label class="field" for="leave-calendar-month">เดือน<input id="leave-calendar-month" type="month" value="' + escapeHtml(month) + '"></label><label class="field" for="leave-calendar-group">กลุ่มงาน<select id="leave-calendar-group"><option value="all">ทุกกลุ่มงาน</option></select></label></div><div class="form-actions"><button class="button button-small" type="button" data-month-prev aria-label="เดือนก่อนหน้า">เดือนก่อนหน้า</button><button class="button button-small" type="button" data-month-today>เดือนปัจจุบัน</button><button class="button button-small" type="button" data-month-next aria-label="เดือนถัดไป">เดือนถัดไป</button><button class="button button-small" type="button" data-refresh-calendar>รีเฟรช</button></div><p class="calendar-legend"><span class="calendar-legend-item">เต็ม = เต็มวัน</span><span class="calendar-legend-item">เช้า = ครึ่งวันเช้า</span><span class="calendar-legend-item">บ่าย = ครึ่งวันบ่าย</span></p><div data-leave-calendar-body></div>';
  const input = section.querySelector("#leave-calendar-month"), groupSelect = section.querySelector("#leave-calendar-group"), body = section.querySelector("[data-leave-calendar-body]");
  function showError(error) {
    body.innerHTML = '<p class="notice notice-danger" role="alert">ไม่สามารถโหลดข้อมูลปฏิทินการลาได้</p><button class="button button-small" type="button" data-retry-leave-calendar>ลองอีกครั้ง</button>';
    body.querySelector("[data-retry-leave-calendar]")?.addEventListener("click", () => { void load(); });
    context.showToast(error?.message || "ไม่สามารถโหลดข้อมูลปฏิทินการลาได้", "error");
  }
  function draw() {
    body.innerHTML = renderMonth(month, leaves, selectedDate, groupFilter);
    body.querySelectorAll("[data-leave-date]").forEach(button => button.addEventListener("click", () => { selectedDate = button.dataset.leaveDate; draw(); }));
  }
  async function load() {
    const current = ++revision;
    busy = true; body.innerHTML = '<p class="page-loading" role="status">กำลังโหลดปฏิทินการลา…</p>';
    try {
      const result = await leaveApi.readApprovedLeaveCalendar(month);
      if (context.signal?.aborted || !root.contains(section) || current !== revision) return;
      leaves = rowsForMonth(result, month);
      if (!selectedDate.startsWith(month)) selectedDate = month + "-01";
      const groups = [...new Set([...standardGroups, ...leaves.map(row => row.group).filter(Boolean)])].sort((a, b) => a.localeCompare(b, "th"));
      groupSelect.innerHTML = '<option value="all">ทุกกลุ่มงาน</option>' + groups.map(group => `<option value="${escapeHtml(group)}">${escapeHtml(group)}</option>`).join("");
      groupSelect.value = groups.includes(groupFilter) ? groupFilter : "all";
      groupFilter = groupSelect.value;
      if (!monthPattern.test(month)) throw new Error("เดือนที่เลือกไม่ถูกต้อง");
      if (!leaves.length) body.innerHTML = '<p class="empty-state">ไม่มีผู้ได้รับอนุมัติลาในช่วงนี้</p>';
      else draw();
    } catch (error) {
      if (!context.signal?.aborted && root.contains(section) && current === revision) showError(error);
    } finally { if (current === revision) busy = false; }
  }
  function changeMonth(value) {
    if (!monthPattern.test(value) || value === month) return;
    month = value; root.dataset.leaveCalendarMonth = month; selectedDate = month === bangkokToday().slice(0, 7) ? bangkokToday() : month + "-01"; input.value = month; void load();
  }
  input.addEventListener("change", () => changeMonth(input.value));
  groupSelect.addEventListener("change", () => { groupFilter = groupSelect.value; if (leaves.length) draw(); });
  section.querySelector("[data-month-prev]").addEventListener("click", () => { const d = new Date(month + "-01T00:00:00Z"); d.setUTCMonth(d.getUTCMonth() - 1); changeMonth(d.toISOString().slice(0, 7)); });
  section.querySelector("[data-month-next]").addEventListener("click", () => { const d = new Date(month + "-01T00:00:00Z"); d.setUTCMonth(d.getUTCMonth() + 1); changeMonth(d.toISOString().slice(0, 7)); });
  section.querySelector("[data-month-today]").addEventListener("click", () => { const todayMonth=bangkokToday().slice(0, 7); if(month===todayMonth){selectedDate=bangkokToday();draw();} else changeMonth(todayMonth); });
  section.querySelector("[data-refresh-calendar]").addEventListener("click", () => { if (!busy) void load(); });
  const onVisible = () => { if (document.visibilityState === "visible" && root.contains(section)) void load(); };
  document.addEventListener("visibilitychange", onVisible);
  context.signal?.addEventListener("abort", () => document.removeEventListener("visibilitychange", onVisible), { once: true });
    root._refreshLeaveCalendar = () => load();
  context.signal?.addEventListener("abort", () => { if (root._refreshLeaveCalendar) delete root._refreshLeaveCalendar; }, { once: true });
void load();
}