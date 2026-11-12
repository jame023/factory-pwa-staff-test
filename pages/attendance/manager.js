import { subscribeStore } from "../../js/state.js?v=1.3.186";
import { APP_MODE } from "../../js/config.js?v=1.3.316";
import { readAttendanceDashboard } from "../../adapters/package03.js?v=1.3.316";
import { showStatusModal } from "../../components/status-modal.js?v=1.3.295";
import { bangkokToday, escapeHtml, thaiDate } from "../../js/utils.js?v=1.3.186";
import { normalizeExecutiveAttendanceRows, summarizeExecutiveAttendance, validateAttendanceRange } from "../../js/executive-attendance-rules.js?v=1.3.316";

const esc = value => escapeHtml(value == null ? "" : String(value));
const groupsText = groups => Array.isArray(groups) && groups.length ? groups.join(", ") : "—";
const metric = (label, value, hint, unit = "") => {
  const available = value !== null && value !== undefined;
  return '<div class="attendance-summary-metric"><span>' + esc(label) + '</span><strong>' +
    (available ? esc(value) + (unit ? " " + esc(unit) : "") : "—") +
    '</strong><small>' + esc(available ? hint : hint || "ยังไม่คำนวณ") + '</small></div>';
};
const rangeLabel = (start, end) => thaiDate(start) + " – " + thaiDate(end) + " (รวมวันเริ่มและวันสิ้นสุด · Asia/Bangkok)";

export function localFixtureShape(data, range) {
  if (data?.source?.kind === "real") return data;
  const byName = new Map((Array.isArray(data?.summaries) ? data.summaries : []).map((row, index) => [String(row.name || "—"), { ...row, fixtureId: row.id || row.employeeId || "fixture-summary-" + index }]));
  const people = new Map();
  const addPerson = (id, name, groups = [], employeeCode = null) => {
    if (!people.has(id)) people.set(id, { id, name: String(name || "—"), groups: [], employeeCode: employeeCode || null, active: true });
    const person = people.get(id);
    person.groups = [...new Set([...person.groups, ...(Array.isArray(groups) ? groups : [])].filter(Boolean))];
  };
  for (const [name, row] of byName) addPerson(row.fixtureId, name, row.groups || [], row.employeeCode);
  const rows = (Array.isArray(data?.daily) ? data.daily : []).filter(row => row.date >= range.startDate && row.date <= range.endDate);
  const rawRows = rows.map((row, index) => {
    const name = String(row.name || "—");
    const employee = byName.get(name);
    const employeeId = String(row.employeeId || employee?.fixtureId || "fixture-name-" + name);
    addPerson(employeeId, name, employee?.groups || (row.group ? [row.group] : []), employee?.employeeCode);
    return { id: String(row.id || "fixture-attendance-" + index), employeeId, group: row.group || null, date: row.date,
      checkIn: row.checkIn || null, checkOut: row.checkOut || null };
  });
  const employeeRows = [...people.values()];
  const daily = normalizeExecutiveAttendanceRows(rawRows, employeeRows, range);
  const summaries = summarizeExecutiveAttendance(employeeRows, daily);
  return { ...data, employees: employeeRows, summaries, daily,
    availableGroups: [...new Set(employeeRows.flatMap(person => person.groups))].sort((a, b) => a.localeCompare(b, "th")),
    startDate: range.startDate, endDate: range.endDate,
    currentDate: data?.currentDate || bangkokToday(), attendanceRowCount: daily.length,
    source: { kind: data?.source?.kind || "mock", asOf: data?.source?.asOf || new Date().toISOString() } };
}

export function renderDaily(data, date) {
  const rows = (Array.isArray(data?.daily) ? data.daily : []).filter(row => row.date === date);
  if (!rows.length) return '<p class="empty-state">ยังไม่มีข้อมูลลงเวลาสำหรับวันที่ ' + esc(thaiDate(date)) + '</p>';
  const mobile = '<div class="attendance-mobile-list attendance-mobile-list--daily">' + rows.map(row =>
    '<article class="attendance-person-card"><div class="attendance-person-card__head"><div><h3>' + esc(row.name) + '</h3><span class="attendance-person-card__group">' + esc(row.group || "—") + '</span></div><span class="attendance-pill attendance-pill--neutral">' + esc(row.status) + '</span></div>' +
    '<div class="attendance-person-card__times"><div><span>เวลาเข้า</span><strong>' + esc(row.checkIn || "—") + '</strong></div><div><span>เวลาออก</span><strong>' + esc(row.checkOut || "—") + '</strong></div></div></article>'
  ).join("") + '</div>';
  const table = '<div class="table-wrap attendance-table-wrap" tabindex="0" role="region" aria-label="รายละเอียดรายวัน เลื่อนแนวนอนเพื่อดูทุกคอลัมน์"><table class="attendance-table--daily"><thead><tr><th scope="col">ชื่อพนักงาน</th><th scope="col">กลุ่มงาน</th><th scope="col">เวลาเข้า</th><th scope="col">เวลาออก</th><th scope="col">สถานะ</th></tr></thead><tbody>' + rows.map(row =>
    '<tr><td>' + esc(row.name) + '</td><td>' + esc(row.group || "—") + '</td><td>' + esc(row.checkIn || "—") + '</td><td>' + esc(row.checkOut || "—") + '</td><td>' + esc(row.status) + '</td></tr>'
  ).join("") + '</tbody></table></div>';
  return mobile + table;
}

export function renderSummaries(data, filters) {
  const term = filters.search.trim().toLocaleLowerCase("th");
  const selectedGroup = filters.group;
  const rows = (Array.isArray(data?.summaries) ? data.summaries : []).filter(row => {
    const searchMatch = !term || row.name.toLocaleLowerCase("th").includes(term) || String(row.employeeCode || "").toLocaleLowerCase("th").includes(term);
    const groupMatch = !selectedGroup || (Array.isArray(row.groups) && row.groups.includes(selectedGroup));
    return searchMatch && groupMatch;
  });
  if (!rows.length) return '<p class="empty-state">' + (data?.employees?.length ? "ไม่พบพนักงานตามตัวกรอง" : "ไม่มีพนักงานในขอบเขตสิทธิ์ปัจจุบัน") + '</p>';
  const noAttendance = data.attendanceRowCount === 0;
  const notice = noAttendance ? '<p class="notice notice-warning">ยังไม่มีข้อมูลเพียงพอสำหรับคำนวณ attendance ในช่วงนี้</p>' : '';
  const cards = rows.map(row => {
    const attendanceHint = row.attendanceDays == null ? "ยังไม่มีข้อมูล" : "วันที่มีเวลาเข้า";
    return '<article class="attendance-person-card"><div class="attendance-person-card__head"><div><h3>' + esc(row.name) + '</h3>' +
      (row.employeeCode ? '<span class="attendance-person-card__group">รหัส ' + esc(row.employeeCode) + '</span>' : '') +
      '<span class="attendance-person-card__group">' + esc(groupsText(row.groups)) + '</span></div></div><div class="attendance-summary-metrics">' +
      metric("วันทำงาน", null, "ไม่มีปฏิทิน") +
      metric("มาทำงาน", noAttendance ? null : row.attendanceDays, attendanceHint, "วัน") +
      metric("วันลา", null, "ไม่มีข้อมูลอนุมัติ") +
      metric("ขาดงาน", null, "ไม่มีปฏิทิน/เกณฑ์") +
      metric("มาสาย", null, "ไม่มีเวลาเริ่ม/เกณฑ์") +
      metric("ออกก่อนเวลา", null, "ไม่มีเวลาเลิก/เกณฑ์") +
      metric("OT", null, "ยังไม่คำนวณ") + '</div></article>';
  }).join("");
  return notice + '<div class="attendance-mobile-list attendance-mobile-list--summary">' + cards + '</div>';
}

function errorMessage(error) {
  if (error?.code === "SESSION_EXPIRED" || error?.code === "AUTH_SESSION_MISSING") return "Session หมดอายุ กรุณาเข้าสู่ระบบ LINE อีกครั้ง";
  if (error?.code === "PERMISSION_DENIED") return "ไม่มีสิทธิ์ดูข้อมูลผู้บริหาร";
  if (error?.code === "NETWORK_ERROR") return "เชื่อมต่อเครือข่ายไม่ได้ กรุณาตรวจอินเทอร์เน็ตแล้วลองใหม่";
  if (error?.code === "BACKEND_NOT_READY") return "Supabase ยังติดตั้ง RPC รายงานเวลาสำหรับผู้บริหารไม่ครบ";
  if (["RANGE_INVALID", "RANGE_TOO_LARGE", "TOO_MANY_ATTENDANCE_ROWS", "TOO_MANY_EMPLOYEES", "TOO_MANY_GROUPS"].includes(error?.code)) return error.message;
  return "ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่";
}

function setRetryState(root, message, retry) {
  root.replaceChildren(document.createTextNode(message));
  const button = document.createElement("button");
  button.className = "button button-small";
  button.type = "button";
  button.textContent = "ลองใหม่";
  button.addEventListener("click", retry, { once: true });
  root.append(button);
}

export async function renderManagerAttendance(root, { signal, showToast, onDataChange }) {
  let currentDate = bangkokToday();
  let summaryController = null;
  let dailyController = null;
  let summaryVersion = 0;
  let dailyVersion = 0;
  let loadingModal = null;
  const blockingLoads = new Map();
  const defaultRange = () => ({ start: bangkokToday().slice(0, 7) + "-01", end: bangkokToday() });

  root.innerHTML = '<div class="page-heading"><div><p class="eyebrow">Supabase · ผู้บริหาร</p><h1>เวลาเข้าออก</h1><p>รายละเอียดการลงเวลาและสรุปตามข้อมูลที่บัญชีนี้มีสิทธิ์อ่าน</p></div></div>' +
    '<section class="attendance-section attendance-latest"><div class="section-title"><div><h2>รายละเอียดรายวัน</h2><p class="small-muted" data-today-date></p></div><button class="button button-small" type="button" data-retry-today>รีเฟรช</button></div><p class="small-muted">รายละเอียดวันนี้ตามเวลา Asia/Bangkok</p><div data-daily-status role="status" aria-live="polite"></div><div data-daily-results></div></section>' +
    '<section class="card card-pad attendance-section manager-filters"><div class="section-title"><div><h2>ค้นหาพนักงานและดูสรุปตามช่วงวันที่</h2><p class="small-muted">ตัวกรองมีผลเฉพาะตารางสรุปแต่ละคน</p></div></div><form novalidate data-manager-filters><div class="manager-filter-grid">' +
      '<div class="field"><label for="manager-search">ชื่อหรือรหัสพนักงาน</label><input id="manager-search" name="search" type="search" autocomplete="off" placeholder="พิมพ์ชื่อหรือรหัส"></div>' +
      '<div class="field"><label for="manager-group">กลุ่มงาน</label><select id="manager-group" name="group"><option value="">ทุกกลุ่มที่บัญชีนี้อ่านได้</option></select></div>' +
      '<div class="field"><label for="manager-start">วันที่เริ่ม</label><input id="manager-start" name="startDate" type="date" required></div>' +
      '<div class="field"><label for="manager-end">วันที่สิ้นสุด</label><input id="manager-end" name="endDate" type="date" required></div>' +
      '<div class="manager-filter-action"><button class="button button-primary" type="submit">แสดงผล</button> <button class="button" type="button" data-clear-filters>ล้างตัวกรอง</button></div>' +
    '</div><p class="help-text">ค่าเริ่มต้นคือวันที่ 1 ของเดือนนี้ถึงวันนี้ รวมวันเริ่มและวันสิ้นสุด; จำกัดไม่เกิน 366 วันต่อคำค้นหา</p></form></section>' +
    '<section class="attendance-section attendance-summary-section"><div class="section-title"><div><h2>ตารางสรุปแต่ละคน</h2><p class="small-muted" data-summary-range></p></div></div><p class="small-muted">กลุ่มบนการ์ดและตัวกรองอ้างอิง main_group กับ employee_groups ที่ active ในปัจจุบัน; หนึ่งการ์ดต่อ employee_id</p><div data-summary-status role="status" aria-live="polite"></div><div data-summary-results></div></section>';

  const form = root.querySelector("form");
  const dailyDateLabel = root.querySelector("[data-today-date]");
  const dailyStatus = root.querySelector("[data-daily-status]");
  const dailyResults = root.querySelector("[data-daily-results]");
  const summaryStatus = root.querySelector("[data-summary-status]");
  const summaryRange = root.querySelector("[data-summary-range]");
  const summaryResults = root.querySelector("[data-summary-results]");
  const summaryButton = form.querySelector('button[type="submit"]');
  const groupSelect = form.elements.group;
  const dateValues = defaultRange();
  form.elements.startDate.value = dateValues.start;
  form.elements.endDate.value = dateValues.end;

  function startBlockingLoad(message) {
    const key = Symbol(message);
    blockingLoads.set(key, message);
    const combined = [...blockingLoads.values()].join(" · ");
    if (!loadingModal || !loadingModal.isOpen()) loadingModal = showStatusModal({ title: "กำลังโหลดข้อมูล", message: combined, tone: "working" });
    else loadingModal.update({ title: "กำลังโหลดข้อมูล", message: combined, tone: "working" });
    return () => {
      blockingLoads.delete(key);
      if (!blockingLoads.size) { loadingModal?.close(); loadingModal = null; }
      else loadingModal?.update({ title: "กำลังโหลดข้อมูล", message: [...blockingLoads.values()].join(" · "), tone: "working" });
    };
  }

  async function loadDaily() {
    if (signal?.aborted) return;
    const version = ++dailyVersion;
    dailyController?.abort();
    dailyController = new AbortController();
    const requestSignal = dailyController.signal;
    const browserDate = bangkokToday();
    currentDate = browserDate;
    dailyDateLabel.textContent = "กำลังตรวจวันที่อ้างอิงตามเวลาไทย…";
    dailyStatus.textContent = "กำลังโหลดรายละเอียดรายวัน…";
    const finish = startBlockingLoad("กำลังโหลดรายละเอียดรายวัน");
    try {
      const data = await readAttendanceDashboard({ todayOnly: true, startDate: browserDate, endDate: browserDate }, { signal: requestSignal });
      if (version !== dailyVersion || requestSignal.aborted || signal?.aborted) return;
      const referenceDate = data.currentDate || browserDate;
      const shaped = localFixtureShape(data, { startDate: referenceDate, endDate: referenceDate, days: 1 });
      currentDate = shaped.currentDate;
      dailyDateLabel.textContent = "วันที่ " + thaiDate(currentDate);
      dailyResults.innerHTML = renderDaily(shaped, currentDate);
      dailyStatus.textContent = shaped.source.kind === "real" ? "แหล่งข้อมูล: Supabase attendance" : "ข้อมูล Fixture สำหรับตรวจหน้าจอเท่านั้น";
    } catch (error) {
      if (version !== dailyVersion || requestSignal.aborted || signal?.aborted || error?.name === "AbortError") return;
      dailyResults.replaceChildren();
      setRetryState(dailyStatus, errorMessage(error), () => void loadDaily());
    } finally {
      finish();
    }
  }

  function updateGroupOptions(groups, selected) {
    const options = ['<option value="">ทุกกลุ่มที่บัญชีนี้อ่านได้</option>', ...groups.map(group => '<option value="' + esc(group) + '">' + esc(group) + '</option>')];
    if (selected && !groups.includes(selected)) options.push('<option value="' + esc(selected) + '">ไม่พบในกลุ่มที่บัญชีนี้อ่านได้: ' + esc(selected) + '</option>');
    groupSelect.innerHTML = options.join("");
    if ([...groupSelect.options].some(option => option.value === selected)) groupSelect.value = selected;
  }

  async function loadSummary() {
    if (signal?.aborted) return;
    const formValues = Object.fromEntries(new FormData(form));
    const query = { search: String(formValues.search || "").trim(), name: String(formValues.search || "").trim(), group: String(formValues.group || "").trim(),
      startDate: String(formValues.startDate || ""), endDate: String(formValues.endDate || "") };
    let range;
    try { range = validateAttendanceRange(query.startDate, query.endDate); }
    catch (error) {
      summaryVersion++;
      summaryController?.abort();
      summaryButton.disabled = false;
      summaryResults.replaceChildren();
      summaryRange.textContent = "";
      summaryStatus.textContent = errorMessage(error);
      return;
    }
    const version = ++summaryVersion;
    summaryController?.abort();
    summaryController = new AbortController();
    const requestSignal = summaryController.signal;
    summaryRange.textContent = rangeLabel(range.startDate, range.endDate);
    summaryStatus.textContent = "กำลังคำนวณสรุปตามช่วงวันที่…";
    summaryResults.replaceChildren();
    summaryButton.disabled = true;
    const finish = startBlockingLoad("กำลังคำนวณสรุปตามช่วงวันที่");
    try {
      const data = await readAttendanceDashboard(query, { signal: requestSignal });
      if (version !== summaryVersion || requestSignal.aborted || signal?.aborted) return;
      if (data.startDate !== range.startDate || data.endDate !== range.endDate) throw Object.assign(new Error("ช่วงวันที่จากระบบไม่ตรงกับช่วงที่เลือก"), { code: "INVALID_ATTENDANCE_DATA" });
      const shaped = localFixtureShape(data, range);
      const filterState = { search: query.search, group: query.group };
      const availableGroups = Array.isArray(shaped.availableGroups) ? shaped.availableGroups : [];
      updateGroupOptions(availableGroups, query.group);
      summaryResults.innerHTML = renderSummaries(shaped, filterState);
      summaryStatus.textContent = shaped.source.kind === "real" ? "สรุปคำนวณจาก attendance ที่อ่านได้ในขอบเขตสิทธิ์ปัจจุบัน" : "ข้อมูล Fixture สำหรับตรวจหน้าจอเท่านั้น";
    } catch (error) {
      if (version !== summaryVersion || requestSignal.aborted || signal?.aborted || error?.name === "AbortError") return;
      summaryResults.replaceChildren();
      setRetryState(summaryStatus, errorMessage(error), () => void loadSummary());
    } finally {
      if (version === summaryVersion) summaryButton.disabled = false;
      finish();
    }
  }

  form.addEventListener("submit", event => { event.preventDefault(); void loadSummary(); });
  root.querySelector("[data-clear-filters]").addEventListener("click", () => {
    const next = defaultRange();
    form.elements.search.value = "";
    groupSelect.value = "";
    form.elements.startDate.value = next.start;
    form.elements.endDate.value = next.end;
    void loadSummary();
  });
  root.querySelector("[data-retry-today]").addEventListener("click", () => void loadDaily());

  let lastBangkokDate = bangkokToday();
  const refreshDateIfChanged = () => {
    const next = bangkokToday();
    if (next !== lastBangkokDate) { lastBangkokDate = next; currentDate = next; void loadDaily(); }
  };
  const interval = setInterval(refreshDateIfChanged, 60_000);
  const onFocus = () => { lastBangkokDate = bangkokToday(); void loadDaily(); };
  const onVisibility = () => { if (!document.hidden) { lastBangkokDate = bangkokToday(); void loadDaily(); } };
  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onVisibility);
  const cleanup = () => {
    clearInterval(interval);
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("visibilitychange", onVisibility);
    summaryController?.abort();
    dailyController?.abort();
    loadingModal?.close();
    loadingModal = null;
  };
  signal?.addEventListener("abort", cleanup, { once: true });
  if (APP_MODE === "mock" && !onDataChange) {
    const unsubscribe = subscribeStore(() => { if (!signal?.aborted) { void loadDaily(); void loadSummary(); } });
    signal?.addEventListener("abort", unsubscribe, { once: true });
  }
  onDataChange?.(() => { void loadDaily(); void loadSummary(); });
  await Promise.all([loadDaily(), loadSummary()]);
}
