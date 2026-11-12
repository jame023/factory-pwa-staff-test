export const OT_REPORT_PAGE_SIZE = 25;
export const OT_REPORT_MAX_RANGE_DAYS = 366;

export function formatReportedDuration(minutes) {
  if (!Number.isSafeInteger(minutes) || minutes < 0) return "--:--";
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function validDateOnly(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function validateOtReportRange(from, to, maxDays = OT_REPORT_MAX_RANGE_DAYS) {
  if (!validDateOnly(from) || !validDateOnly(to)) return { valid: false, code: "DATE_INVALID" };
  if (from > to) return { valid: false, code: "DATE_ORDER" };
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const days = Math.floor((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000) + 1;
  if (days > maxDays) return { valid: false, code: "DATE_RANGE_TOO_LARGE", days };
  return { valid: true, days };
}

export function validateExecutiveOtResponse(value) {
  const result = value && typeof value === "object" ? value : {};
  const nonnegative = n => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
  if (!Array.isArray(result.items) || !Array.isArray(result.employees) || !Array.isArray(result.available_groups)
    || !nonnegative(result.total_count) || !nonnegative(result.employee_count)
    || !nonnegative(result.ot_days_count) || !nonnegative(result.total_duration_minutes)
    || typeof result.has_more !== "boolean") {
    throw Object.assign(new Error("ข้อมูลรายงาน OT ที่ได้รับไม่ครบ กรุณาลองโหลดใหม่"), { code: "INVALID_RESPONSE" });
  }
  for (const row of result.items) {
    if (!row || typeof row.id !== "string" || !Number.isSafeInteger(row.duration_minutes)
      || row.duration_minutes < 1 || row.duration_minutes > 779
      || !nonnegative(row.attachment_count)) {
      throw Object.assign(new Error("พบข้อมูลรายงาน OT ที่ไม่สมบูรณ์ กรุณาติดต่อผู้ดูแล"), { code: "INVALID_RESPONSE" });
    }
  }
  for (const person of result.employees) {
    if (!person || typeof person.employee_id !== "string" || !nonnegative(person.report_count)
      || !nonnegative(person.ot_days_count) || !nonnegative(person.total_duration_minutes)) {
      throw Object.assign(new Error("พบข้อมูลสรุปรายบุคคลที่ไม่สมบูรณ์ กรุณาลองโหลดใหม่"), { code: "INVALID_RESPONSE" });
    }
  }
  return result;
}
