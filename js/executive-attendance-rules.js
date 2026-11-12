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
    const normalized = {
      id: row.id,
      employeeId: row.employeeId,
      name: employee.name,
      employeeCode: employee.employeeCode || null,
      group: typeof row.group === "string" && row.group.trim() ? row.group.trim() : null,
      date,
      checkIn: row.checkIn || null,
      checkOut: row.checkOut || null,
      status: row.checkIn && row.checkOut ? "ลงเวลาครบรายการ" : row.checkIn ? "ยังไม่มีเวลาออก" : row.checkOut ? "รายการไม่มีเวลาเข้า" : "รายการไม่มีเวลาเข้าและออก"
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
    return {
      ...employee,
      workdays: null,
      attendanceDays: sourceHasRows ? attendedDates.size : null,
      leaveDays: null,
      absenceDays: null,
      lateDays: null,
      lateMinutes: null,
      earlyDays: null,
      earlyMinutes: null,
      overtimeDays: null,
      overtimeMinutes: null
    };
  });
}

export function formatMinuteDuration(minutes) {
  if (!Number.isSafeInteger(minutes) || minutes < 0) return "—";
  return String(Math.floor(minutes / 60)).padStart(2, "0") + ":" + String(minutes % 60).padStart(2, "0");
}
