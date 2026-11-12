const isoDate = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

export function validateLeaveReportRange(from, to, maxDays = 366) {
  if (!isoDate(from) || !isoDate(to)) return { valid: false, code: 'DATE_INVALID' };
  if (from > to) return { valid: false, code: 'DATE_ORDER' };
  const days = (Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000 + 1;
  if (days > maxDays) return { valid: false, code: 'DATE_RANGE_TOO_LARGE', days };
  return { valid: true, days };
}

export function defaultLeaveReportRange(today) {
  if (!isoDate(today)) throw new Error('วันที่ปัจจุบันไม่ถูกต้อง');
  return { from: today.slice(0, 7) + '-01', to: today };
}

const finiteNonNegative = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const validStatus = value => ['pending', 'approved', 'rejected', 'cancelled'].includes(value);

export function validateLeaveManagerQueueResponse(value) {
  if (!value || !Array.isArray(value.items) || !Number.isInteger(value.pending_count) || value.pending_count < 0 ||
      !Number.isInteger(value.total_count) || value.total_count < 0 || typeof value.has_more !== 'boolean' ||
      !Array.isArray(value.available_groups) || value.items.some(row => !row?.id || !validStatus(row.status) ||
        !finiteNonNegative(Number(row.requested_days)))) throw new Error('ข้อมูลรายการคำขอลาไม่ครบ');
  return value;
}

export function validateLeaveManagerReportResponse(value) {
  const summary = value?.summary;
  if (!value || !Array.isArray(value.items) || !summary || !summary.status_counts ||
      !Array.isArray(summary.by_employee) || !Array.isArray(summary.by_type) ||
      value.date_basis !== 'leave_date' || typeof value.has_more !== 'boolean' ||
      !Number.isInteger(value.total_count) || !Number.isInteger(summary.request_count) ||
      !Number.isInteger(summary.employee_count) || !Number.isInteger(summary.overlap_anomaly_count) ||
      ['pending', 'approved', 'rejected', 'cancelled'].some(key => !Number.isInteger(summary.status_counts[key])) ||
      ![summary.approved_days, summary.approved_full_days, summary.approved_half_periods,
        summary.approved_half_day_equivalent].every(item => item === null || finiteNonNegative(Number(item))) ||
      value.items.some(row => !row?.id || !validStatus(row.status) || !finiteNonNegative(Number(row.days_in_period)))) {
    throw new Error('ข้อมูลรายงานการลาไม่ครบ');
  }
  return value;
}

export function formatLeaveDays(value) {
  const number = Number(value);
  if (!finiteNonNegative(number)) return '—';
  return Number.isInteger(number) ? String(number) : number.toFixed(1);
}
