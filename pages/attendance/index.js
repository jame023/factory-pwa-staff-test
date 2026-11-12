import { APP_MODE } from "../../js/config.js?v=1.3.251";
import * as attendanceApi from "../../adapters/package10.js?v=1.3.260";
import { statCard } from "../../components/app-card.js?v=1.3.340";
import { bangkokToday, escapeHtml, thaiDate } from "../../js/utils.js?v=1.3.186";
import { renderManagerAttendance } from "./manager.js?v=1.3.316";

export const attendancePeriodForDay = day => Number(day) <= 15 ? "first" : "second";
export function attendancePeriodRange(month, period) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !["first", "second"].includes(period)) throw new Error("ช่วงวันที่ไม่ถูกต้อง");
  const lastDay = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  const first = period === "first" ? 1 : 16;
  const last = period === "first" ? 15 : lastDay;
  return { from: `${month}-${String(first).padStart(2, "0")}`, to: `${month}-${String(last).padStart(2, "0")}`, lastDay };
}
const selectedPeriod = () => attendancePeriodForDay(bangkokToday().slice(8, 10));
const safeText = value => escapeHtml(value == null || value === "" ? "—" : String(value));
const periodTitle = (month, period, range) => {
  const monthName = new Date(`${month}-01T00:00:00Z`).toLocaleDateString("th-TH", { month: "long", year: "numeric", timeZone: "UTC" });
  return `${period === "first" ? "วันที่ 1–15" : `วันที่ 16–${range.lastDay}`} ${monthName}`;
};
function renderProfile(profile) {
  return '<section class="card card-pad"><h2>บัญชีพนักงาน</h2><dl class="my-profile-fields">' +
    '<div><dt>ชื่อพนักงาน</dt><dd>' + safeText(profile.name) + '</dd></div>' +
    '<div><dt>รหัสพนักงาน</dt><dd>' + safeText(profile.code) + '</dd></div>' +
    '<div><dt>กลุ่มงานหลัก</dt><dd>' + safeText(profile.mainGroup) + '</dd></div>' +
    '<div><dt>กลุ่มงานที่ได้รับสิทธิ์และยังใช้งาน</dt><dd>' + safeText(profile.groups.length ? profile.groups.join("、") : null) + '</dd></div>' +
    '</dl></section>';
}
function renderHistory(data, profile) {
  const range = attendancePeriodRange(data.month, data.period);
  const rows = data.history.map(row => '<article class="list-row"><div class="list-main">' +
    '<div class="list-title">' + safeText(thaiDate(row.date)) + '</div>' +
    '<div class="list-meta">เวลาเข้า ' + safeText(row.checkIn) + ' · เวลาออก ' + safeText(row.checkOut) + '</div>' +
    (row.status ? '<div class="list-meta">สถานะ: ' + safeText(row.status) + '</div>' : '') +
    (row.detail ? '<div class="list-meta">' + safeText(row.detail) + '</div>' : '') +
    '</div></article>').join("");
  const summary = data.summary;
  return '<section class="card card-pad"><div class="section-title"><div><h2>สรุปช่วงที่แสดง</h2><p class="small-muted">' + safeText(periodTitle(data.month, data.period, range)) + '</p></div></div>' +
    '<div class="grid grid-3">' +
      statCard("วันที่มีรายการ", summary.daysWithRecords, "ในช่วงที่แสดง") +
      statCard("รายการที่มีเวลาเข้า–ออกครบ", summary.completeEntries, "นับตามรายการ") +
      statCard("รายการที่ยังไม่มีเวลาออก", summary.missingCheckOut, "มีเวลาเข้าแต่ไม่มีเวลาออก") +
    '</div></section>' +
    '<section class="card card-pad"><h2>ประวัติ ' + safeText(periodTitle(data.month, data.period, range)) + '</h2>' +
    '<div class="list">' + (rows || '<p class="empty-state">ยังไม่มีประวัติในช่วงนี้</p>') + '</div>' +
    '<p class="small-muted">แสดงข้อมูลจาก Supabase · เขตเวลา Asia/Bangkok</p></section>';
}
function isSessionError(error) { return ["SESSION_EXPIRED", "PERMISSION_DENIED"].includes(error?.code); }

export async function render(root, { user, showToast = () => {}, signal, onDataChange }) {
  if (["executive", "admin"].includes(user?.role)) return renderManagerAttendance(root, { signal, showToast, onDataChange });
  const expectedEmployeeId = user?.employee_id || user?.id;
  let month = bangkokToday().slice(0, 7);
  let period = selectedPeriod();
  let profileVersion = 0;
  let historyVersion = 0;
  let historyController;
  let profileController;
  root.innerHTML = '<div class="page-heading"><div><p class="eyebrow">บัญชีและเวลา</p><h1>ข้อมูลของฉัน</h1><p>ข้อมูลส่วนตัวและประวัติตามช่วงครึ่งเดือน</p></div><button class="button button-small" data-refresh>รีเฟรช</button></div>' +
    '<section class="card card-pad form-grid"><div class="field"><label for="attendance-month">เลือกเดือนและปี</label><input id="attendance-month" type="month" value="' + month + '"></div><div class="field"><label for="attendance-period">ช่วงวันที่</label><select id="attendance-period"><option value="first">วันที่ 1–15</option><option value="second">วันที่ 16–สิ้นเดือน</option></select></div></section>' +
    '<div data-profile-status role="status" aria-live="polite"></div><div data-profile-content></div>' +
    '<div data-history-status role="status" aria-live="polite"></div><div data-history-content></div>';
  const refresh = root.querySelector("[data-refresh]");
  const monthInput = root.querySelector("#attendance-month");
  const periodInput = root.querySelector("#attendance-period");
  const profileStatus = root.querySelector("[data-profile-status]");
  const profileContent = root.querySelector("[data-profile-content]");
  const historyStatus = root.querySelector("[data-history-status]");
  const historyContent = root.querySelector("[data-history-content]");
  const abortAll = () => { profileController?.abort(); historyController?.abort(); historyVersion++; };
  signal?.addEventListener("abort", abortAll, { once: true });

  async function loadHistory(profile) {
    const version = ++historyVersion;
    historyController?.abort();
    historyController = new AbortController();
    if (signal?.aborted) return;
    const requestPeriod = period;
    periodInput.value = period;
    const range = attendancePeriodRange(month, period);
    historyContent.replaceChildren();
    historyStatus.innerHTML = '<p class="page-loading">กำลังโหลดประวัติ</p>';
    try {
      const data = await attendanceApi.readMyAttendance({ month, period }, { signal: historyController.signal });
      if (version !== historyVersion || signal?.aborted || data.month !== month || data.period !== period || profile.id !== expectedEmployeeId) return;
      if (data.source?.kind !== "real") throw new Error("หน้านี้ต้องอ่านข้อมูลจริงจาก Supabase เท่านั้น");
      if (data.from !== range.from || data.to !== range.to) throw new Error("ช่วงวันที่จากระบบไม่ตรงกับช่วงที่เลือก");
      historyContent.innerHTML = renderHistory(data, profile);
      historyStatus.textContent = "";
    } catch (error) {
      if (version !== historyVersion || signal?.aborted || error?.name === "AbortError") return;
      historyContent.replaceChildren();
      const message = error?.code === "SESSION_EXPIRED" ? "Session หมดอายุ กรุณาเข้าสู่ระบบ LINE อีกครั้ง" :
        error?.code === "PERMISSION_DENIED" ? "ไม่มีสิทธิ์ดูข้อมูล" : "ไม่สามารถโหลดข้อมูลได้";
      historyStatus.innerHTML = '<div class="notice notice-danger"><p>' + message + '</p><button class="button button-small" data-retry-history>ลองใหม่</button></div>';
      root.querySelector("[data-retry-history]")?.addEventListener("click", () => void loadHistory(profile), { once: true });
      showToast(message, "error");
    }
  }

  async function loadProfile() {
    const requestVersion = ++profileVersion;
    profileController?.abort(); historyController?.abort(); historyVersion++;
    profileController = new AbortController();
    if (signal?.aborted) return;
    refresh.disabled = true;
    profileContent.replaceChildren(); historyContent.replaceChildren();
    profileStatus.innerHTML = '<p class="page-loading">กำลังโหลดข้อมูลของฉัน</p>';
    historyStatus.textContent = "";
    try {
      if (APP_MODE !== "supabase-line" && APP_MODE !== "production") throw new Error("ต้องใช้ Session จริงเพื่ออ่านข้อมูลบัญชี");
      const profile = await attendanceApi.readMyProfile({ signal: profileController.signal });
      if (requestVersion !== profileVersion || profileController.signal.aborted || signal?.aborted) return;
      if (profile.source?.kind !== "real" || profile.id !== expectedEmployeeId || !Array.isArray(profile.groups)) throw Object.assign(new Error("ยืนยันเจ้าของข้อมูลไม่สำเร็จ"), { code: "PERMISSION_DENIED" });
      profileContent.innerHTML = renderProfile(profile);
      profileStatus.textContent = "";
      await loadHistory(profile);
    } catch (error) {
      if (requestVersion !== profileVersion || profileController.signal.aborted || signal?.aborted || error?.name === "AbortError") return;
      profileContent.replaceChildren(); historyContent.replaceChildren();
      const message = isSessionError(error) ? (error.code === "SESSION_EXPIRED" ? "Session หมดอายุ กรุณาเข้าสู่ระบบ LINE อีกครั้ง" : "ไม่มีสิทธิ์ดูข้อมูล") : "ไม่สามารถโหลดข้อมูลได้";
      profileStatus.innerHTML = '<div class="notice notice-danger"><p>' + message + '</p><button class="button button-small" data-retry-profile>ลองใหม่</button></div>';
      root.querySelector("[data-retry-profile]")?.addEventListener("click", () => void loadProfile(), { once: true });
      showToast(message, "error");
    } finally { if (requestVersion === profileVersion) refresh.disabled = false; }
  }

  monthInput.addEventListener("change", event => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value)) return;
    month = event.target.value;
    if (profileContent.firstElementChild) {
      const profile = { id: expectedEmployeeId };
      loadHistory(profile);
    }
  });
  periodInput.addEventListener("change", event => {
    if (!["first", "second"].includes(event.target.value)) return;
    period = event.target.value;
    if (profileContent.firstElementChild) void loadHistory({ id: expectedEmployeeId });
  });
  refresh.addEventListener("click", () => void loadProfile());
  let observedPeriod = period;
  const refreshPeriodIfChanged = () => {
    const next = selectedPeriod();
    if (next !== observedPeriod) { observedPeriod = next; period = next; periodInput.value = next; if (profileContent.firstElementChild) void loadProfile(); }
  };
  window.addEventListener("focus", refreshPeriodIfChanged);
  document.addEventListener("visibilitychange", refreshPeriodIfChanged);
  signal?.addEventListener("abort", () => {
    window.removeEventListener("focus", refreshPeriodIfChanged);
    document.removeEventListener("visibilitychange", refreshPeriodIfChanged);
  }, { once: true });
  const periodCheck = setInterval(refreshPeriodIfChanged, 60000);
  signal?.addEventListener("abort", () => clearInterval(periodCheck), { once: true });
  await loadProfile();
}

