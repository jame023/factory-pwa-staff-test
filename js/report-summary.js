const bangkokDate = value => {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(date);
};
const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const inRange = (value, start, today) => {
  const date = bangkokDate(value);
  return Boolean(date && date >= start && date <= today);
};

export function summarizeReportCategories(source, start, today) {
  const rows = Object.fromEntries(Object.entries(source).map(([key, value]) => [key, Array.isArray(value) ? value : []]));
  const attendance = rows.attendance.filter(row => inRange(row.date, start, today));
  const leave = rows.leaveRequests.filter(row => row.startDate <= today && row.endDate >= start);
  const calendar = rows.calendar.filter(row => inRange(row.date, start, today));
  const sessions = rows.workSessions.filter(row => inRange(row.startedAt || row.date || row.createdAt, start, today));
  const screenEntries = rows.screenEntries.filter(row => inRange(row.date || row.createdAt, start, today));
  const production = rows.production.filter(row => inRange(row.date || row.createdAt, start, today));
  const deliveries = rows.deliveries.filter(row => row.status !== 'ยกเลิก' && row.status !== 'cancelled' && inRange(row.dateTime || row.createdAt, start, today));
  const overtime = rows.otRequests.filter(row => inRange(row.date || row.createdAt, start, today));
  const isWorkday = row => !['หยุด', 'holiday', 'วันหยุด'].includes(row.status);
  const countStatuses = (items, status) => items.filter(row => row.status === status).length;

  return {
    attendance: {
      records: attendance.length,
      present: attendance.filter(row => row.checkIn).length,
      late: attendance.filter(row => number(row.lateMinutes) > 0).length,
      absent: attendance.filter(row => row.absent === true || row.workdayStatus === 'absent').length
    },
    leave: {
      requests: leave.length,
      approved: countStatuses(leave, 'approved'),
      pending: countStatuses(leave, 'pending'),
      rejected: countStatuses(leave, 'rejected')
    },
    calendar: {
      entries: calendar.length,
      workdays: calendar.filter(isWorkday).length,
      holidays: calendar.filter(row => !isWorkday(row)).length
    },
    workSessions: {
      total: sessions.length,
      completed: sessions.filter(row => row.endedAt).length,
      inProgress: sessions.filter(row => !row.endedAt).length,
      screen: sessions.filter(row => row.workType === 'สกรีน').length,
      production: sessions.filter(row => row.workType === 'ผลิต').length
    },
    screen: {
      entries: screenEntries.length,
      goodPacks: screenEntries.reduce((sum, row) => sum + number(row.enteredPack), 0),
      screenDefects: screenEntries.reduce((sum, row) => sum + number(row.missingBottles), 0),
      productionDefects: screenEntries.reduce((sum, row) => sum + number(row.productionDamagedBottles), 0)
    },
    production: {
      entries: production.length,
      quantity: production.reduce((sum, row) => sum + number(row.quantity), 0),
      defective: production.reduce((sum, row) => sum + number(row.defective), 0)
    },
    delivery: {
      entries: deliveries.length,
      quantity: deliveries.reduce((sum, row) => sum + number(row.quantity), 0)
    },
    overtime: {
      reports: overtime.length,
      employees: new Set(overtime.map(row => row.employeeId || row.employee || row.owner_id).filter(Boolean)).size,
      minutes: Math.round(overtime.reduce((sum, row) => sum + (Number.isInteger(Number(row.duration_minutes)) ? Number(row.duration_minutes) : number(row.hours) * 60), 0))
    }
  };
}
