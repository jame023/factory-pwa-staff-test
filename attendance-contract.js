import { bangkokToday } from "./utils.js?v=1.3.186";

export const ATTENDANCE_STATUSES = Object.freeze([
  "present-full", "present-half", "in-progress", "leave", "absent", "holiday", "scheduled", "unrecorded"
]);
export function normalizeAttendanceQuery(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).some(key => !["month", "period"].includes(key))) {
    throw new Error("คำขออ่านข้อมูลมีตัวเลือกที่ไม่รองรับ");
  }
  const month = input.month ?? bangkokToday().slice(0, 7);
  const period = input.period ?? "all";
  if (typeof month !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month.startsWith("0000")) {
    throw new Error("กรุณาเลือกเดือนให้ถูกต้อง");
  }
  if (!["all", "first", "second"].includes(period)) throw new Error("ช่วงเดือนนี้ไม่รองรับ");
  return { month, period };
}
export function inAttendancePeriod(date, { month, period }) {
  return date.startsWith(month + "-") && (period === "all" ||
    (period === "first" ? Number(date.slice(-2)) <= 15 : Number(date.slice(-2)) >= 16));
}

const fail = () => { throw new Error("รูปแบบข้อมูลเวลาทำงานจาก API ไม่ถูกต้อง"); };
const dateValue = value => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail();
  const parsed = new Date(value + "T00:00:00Z");
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) fail();
  return value;
};
const timeValue = value => {
  if (value === null) return null;
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) fail();
  return value;
};
const metric = value => {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) fail();
  return value;
};
const statusValue = value => {
  if (!ATTENDANCE_STATUSES.includes(value)) fail();
  return value;
};
function rowValue(row) {
  if (!row || typeof row !== "object") fail();
  return {
    date: dateValue(row.date), checkIn: timeValue(row.checkIn), checkOut: timeValue(row.checkOut),
    status: statusValue(row.status), lateMinutes: metric(row.lateMinutes),
    earlyLeaveMinutes: metric(row.earlyLeaveMinutes), overtimeMinutes: metric(row.overtimeMinutes)
  };
}
export function validateAttendanceResponse(data, query) {
  if (!data || data.month !== query.month || data.period !== query.period ||
      !Array.isArray(data.history) || !Array.isArray(data.calendarDays) ||
      data.history.length > 31 || data.calendarDays.length > 31 ||
      !(data.absent === null || typeof data.absent === "boolean") ||
      !(data.leaveStatus === null || (typeof data.leaveStatus === "string" && data.leaveStatus.length <= 80)) ||
      !data.source || !["mock", "development-fixture", "real"].includes(data.source.kind)) fail();
  const today = rowValue({ ...data, status: data.workdayStatus });
  const history = data.history.map(rowValue);
  const calendarDays = data.calendarDays.map(row => ({
    date: dateValue(row.date), status: statusValue(row.status)
  }));
  for (const rows of [history, calendarDays]) {
    if (new Set(rows.map(row => row.date)).size !== rows.length ||
        rows.some(row => !inAttendancePeriod(row.date, query))) fail();
  }
  const summary = {};
  for (const key of ["attendanceDays", "leaveDays", "absentDays", "lateMinutes", "earlyLeaveMinutes", "overtimeMinutes"]) {
    summary[key] = metric(data.summary?.[key]);
  }
  if (typeof data.source.asOf !== "string" || !Number.isFinite(Date.parse(data.source.asOf))) fail();
  // Construct the field allowlist; never pass internal backend rows/tokens through to UI.
  const { status, ...todayFields } = today;
  return { ...todayFields, workdayStatus: status, absent: data.absent, leaveStatus: data.leaveStatus,
    ...query, history, calendarDays, summary,
    source: { kind: data.source.kind, asOf: data.source.asOf, timeZone: "Asia/Bangkok" } };
}
export function validateManagerResponse(data) {
  if (!data || !Number.isSafeInteger(data.pendingLeaves) || data.pendingLeaves < 0 ||
      !["mock", "development-fixture", "real"].includes(data.source?.kind)) fail();
  return { pendingLeaves: data.pendingLeaves, date: dateValue(data.date), source: { kind: data.source.kind } };
}
