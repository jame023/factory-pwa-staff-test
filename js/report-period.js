// Date-only periods in Bangkok calendar dates. These helpers do not schedule a job.
export function reportPeriod(kind, endDate) {
  if (!['daily','weekly'].includes(kind) || typeof endDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(endDate))
    throw new Error('REPORT_PERIOD_INVALID');
  const end=new Date(endDate+'T00:00:00Z');
  if (!Number.isFinite(end.getTime()) || end.toISOString().slice(0,10)!==endDate) throw new Error('REPORT_DATE_INVALID');
  if (kind==='weekly' && end.getUTCDay()!==0) throw new Error('WEEKLY_END_MUST_BE_SUNDAY');
  const start=new Date(end);
  if (kind==='weekly') start.setUTCDate(start.getUTCDate()-6);
  return {kind,startDate:start.toISOString().slice(0,10),endDate,timezone:'Asia/Bangkok',
    scheduledLocalTime:kind==='weekly'?'18:00':'20:50',key:kind+':'+endDate};
}
