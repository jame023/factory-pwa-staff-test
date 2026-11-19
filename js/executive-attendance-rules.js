const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;

export const MAX_ATTENDANCE_RANGE_DAYS = 366;

function dateOnlyValue(value) {
  if (typeof value !== "string" || !DATE_ONLY.test(value)) return null;
  const time = Date.parse(value + "T00:00:00.000Z");
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : null;
}

export function validateAttendanceRange(startDate, endDate) {
  const start = dateOnlyValue(startDate);
  const end = dateOnlyValue(endDate);
  if (start === null || end === null || start > end) {
    throw Object.assign(new Error("ช่วงวันที่ไม่ถูกต้อง"), { code: "RANGE_INVALID" });
  }
  const days = Math.floor((end - start) / DAY_MS) + 1;
  if (days > MAX_ATTENDANCE_RANGE_DAYS) {
    throw Object.assign(new Error("ช่วงวันที่กว้างเกิน 366 วัน กรุณาเลือกช่วงที่แคบลง"), { code: "RANGE_TOO_LARGE" });
  }
  return { startDate, endDate, days };
}

export function normalizeExecutiveAttendanceRows(rows, employees, range) {
  const { startDate, endDate } = validateAttendanceRange(range.startDate, range.endDate);
  const employeesById = new Map((Array.isArray(employees) ? employees : []).map(employee => [employee.id, employee]));
  const seenIds = new Map();
  const seenEmployeeDates = new Map();
  const result = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row.id !== "string" || typeof row.employeeId !== "string") {
      throw Object.assign(new Error("ข้อมูลลงเวลาไม่ครบฟิลด์อ้างอิง"), { code: "INVALID_ATTENDANCE_DATA" });
    }
    const date = dateOnlyValue(row.date) === null ? null : row.date;
    if (!date || date < startDate || date > endDate) {
      throw Object.assign(new Error("วันที่ในรายการลงเวลาไม่ตรงกับช่วงที่ค้นหา"), { code: "INVALID_ATTENDANCE_DATA" });
    }
    const employee = employeesById.get(row.employeeId);
    if (!employee) {
      throw Object.assign(new Error("มีรายการลงเวลาที่ไม่มีชื่อพนักงานในขอบเขตสิทธิ์ปัจจุบัน"), { code: "EMPLOYEE_SCOPE_MISMATCH" });
    }
    for (const field of ["checkIn", "checkOut"]) {
      if (row[field] != null && row[field] !== "" && (typeof row[field] !== "string" || !CLOCK.test(row[field]))) {
        throw Object.assign(new Error("รูปแบบเวลาในรายการลงเวลาไม่ถูกต้อง"), { code: "INVALID_ATTENDANCE_DATA" });
      }
    }
    const workdayCredit = row.workdayCredit == null ? null : Number(row.workdayCredit);
    if (workdayCredit !== null && ![0, 0.5, 1].includes(workdayCredit)) {
      throw Object.assign(new Error("เครดิตวันทำงานไม่ถูกต้อง"), { code: "INVALID_ATTENDANCE_DATA" });
    }
    const normalized = {
      id: row.id,
      employeeId: row.employeeId,
      name: employee.name,
      employeeCode: employee.employeeCode || null,
      group: typeof row.group === "string" && row.group.trim() ? row.group.trim() : null,
      date,
      checkIn: row.checkIn || null,
      checkOut: row.checkOut || null,
      status: typeof row.statusLabel === "string" && row.statusLabel.trim() ? row.statusLabel.trim() :
        row.checkIn && row.checkOut ? "ลงเวลาครบรายการ" : row.checkIn ? "ยังไม่มีเวลาออก" : row.checkOut ? "รายการไม่มีเวลาเข้า" : "รายการไม่มีเวลาเข้าและออก",
      statusLabel: typeof row.statusLabel === "string" ? row.statusLabel.trim() : null,
      attendanceStatus: typeof row.attendanceStatus === "string" ? row.attendanceStatus : null,
      entryStatus: typeof row.entryStatus === "string" ? row.entryStatus : null,
      approvedLeavePeriod: row.approvedLeavePeriod ?? null,
      workPeriod: row.workPeriod ?? null,
      workStatus: row.workStatus ?? null,
      workdayCredit,
      isLate: row.isLate === true,
      lateMinutes: Number.isSafeInteger(row.lateMinutes) && row.lateMinutes >= 0 ? row.lateMinutes : null,
      earlyLeaveMinutes: Number.isSafeInteger(row.earlyLeaveMinutes) && row.earlyLeaveMinutes >= 0 ? row.earlyLeaveMinutes : null,
      overtimeGrossMinutes: Number.isSafeInteger(row.overtimeGrossMinutes) && row.overtimeGrossMinutes >= 0 ? row.overtimeGrossMinutes : null,
      overtimeBreakMinutes: Number.isSafeInteger(row.overtimeBreakMinutes) && row.overtimeBreakMinutes >= 0 ? row.overtimeBreakMinutes : null,
      overtimeMinutes: Number.isSafeInteger(row.overtimeMinutes) && row.overtimeMinutes >= 0 ? row.overtimeMinutes : null,
      acceptedScanCount: Number.isSafeInteger(row.acceptedScanCount) ? row.acceptedScanCount : null,
      recordSource: row.recordSource === "rfid" ? "rfid" : "legacy",
      detail: typeof row.detail === "string" && row.detail.trim() ? row.detail.trim() : null
    };
    const priorId = seenIds.get(row.id);
    if (priorId) {
      if (JSON.stringify(priorId) !== JSON.stringify(normalized)) {
        throw Object.assign(new Error("รหัสรายการลงเวลาซ้ำแต่รายละเอียดไม่ตรงกัน"), { code: "DUPLICATE_ATTENDANCE_RECORD" });
      }
      continue;
    }
    const employeeDate = `${row.employeeId}\u0000${date}`;
    if (seenEmployeeDates.has(employeeDate)) {
      throw Object.assign(new Error("พบรายการลงเวลามากกว่าหนึ่งรายการต่อพนักงานต่อวัน"), { code: "DUPLICATE_ATTENDANCE_DAY" });
    }
    seenIds.set(row.id, normalized);
    seenEmployeeDates.set(employeeDate, row.id);
    result.push(normalized);
  }
  return result.sort((a, b) => (a.group || "").localeCompare(b.group || "", "th") ||
    a.name.localeCompare(b.name, "th") || a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

export function summarizeExecutiveAttendance(employees, attendanceRows, sourceHasRows = Array.isArray(attendanceRows) && attendanceRows.length > 0) {
  const uniqueEmployees = new Map();
  for (const employee of Array.isArray(employees) ? employees : []) {
    if (!employee || typeof employee.id !== "string") continue;
    const current = uniqueEmployees.get(employee.id);
    const groups = [...new Set([...(current?.groups || []), ...(Array.isArray(employee.groups) ? employee.groups : [])]
      .filter(group => typeof group === "string" && group.trim()).map(group => group.trim()))].sort((a, b) => a.localeCompare(b, "th"));
    uniqueEmployees.set(employee.id, {
      id: employee.id,
      name: String(employee.name || "—"),
      employeeCode: employee.employeeCode || null,
      groups,
      active: employee.active === true
    });
  }
  const rowsByEmployee = new Map();
  for (const row of Array.isArray(attendanceRows) ? attendanceRows : []) {
    const list = rowsByEmployee.get(row.employeeId) || [];
    list.push(row);
    rowsByEmployee.set(row.employeeId, list);
  }
  return [...uniqueEmployees.values()].sort((a, b) => a.name.localeCompare(b.name, "th") || a.id.localeCompare(b.id)).map(employee => {
    const rows = rowsByEmployee.get(employee.id) || [];
    const attendedDates = new Set(rows.filter(row => row.checkIn).map(row => row.date));
    const rfidRows = rows.filter(row => row.recordSource === "rfid");
    const creditedRows = rfidRows.filter(row => row.workdayCredit !== null);
    const completedRfidRows = rfidRows.filter(row => row.checkIn && row.checkOut);
    const legacyDates = new Set(rows.filter(row => row.recordSource !== "rfid" && row.checkIn && !rfidRows.some(rfid => rfid.date === row.date)).map(row => row.date));
    const hasCompletedAttendance = creditedRows.length > 0 || legacyDates.size > 0;
    return {
      ...employee,
      workdays: null,
      attendanceDays: !sourceHasRows ? null : hasCompletedAttendance ?
        creditedRows.reduce((sum, row) => sum + row.workdayCredit, 0) + legacyDates.size : null,
      inProgressDays: rows.length ? new Set(rows.filter(row => row.checkIn && !row.checkOut).map(row => row.date)).size : null,
      leaveDays: null,
      absenceDays: null,
      lateDays: rfidRows.length ? rfidRows.filter(row => row.isLate).length : null,
      lateMinutes: rfidRows.length ? rfidRows.reduce((sum, row) => sum + (row.lateMinutes || 0), 0) : null,
      earlyDays: completedRfidRows.length ? completedRfidRows.filter(row => (row.earlyLeaveMinutes || 0) > 0).length : null,
      earlyMinutes: completedRfidRows.length ? completedRfidRows.reduce((sum, row) => sum + (row.earlyLeaveMinutes || 0), 0) : null,
      overtimeDays: completedRfidRows.length ? completedRfidRows.filter(row => (row.overtimeMinutes || 0) > 0).length : null,
      overtimeMinutes: completedRfidRows.length ? completedRfidRows.reduce((sum, row) => sum + (row.overtimeMinutes || 0), 0) : null
    };
  });
}

export function formatMinuteDuration(minutes) {
  if (!Number.isSafeInteger(minutes) || minutes < 0) return "—";
  return String(Math.floor(minutes / 60)).padStart(2, "0") + ":" + String(minutes % 60).padStart(2, "0");
}
