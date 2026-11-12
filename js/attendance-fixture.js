import { attendanceCalculation, monthlyOverview } from "./business-rules.js?v=1.3.186";
import { bangkokToday } from "./utils.js?v=1.3.186";
import { inAttendancePeriod, normalizeAttendanceQuery } from "./attendance-contract.js?v=1.3.186";

// Synthetic rows only. Time metrics use the inspected Package03 rules; monthly weights use Package10.
export function createAttendanceFixture(input = {}, options = {}) {
  const query = normalizeAttendanceQuery(input);
  const today = options.today || bangkokToday();
  const examples = [
    [1,"present-full","08:00","17:00",0,0,0],
    [2,"present-half","08:10","12:00",10,0,0],
    [3,"leave",null,null,null,null,null],
    [4,"absent",null,null,null,null,null],
    [5,"holiday",null,null,null,null,null],
    [6,"in-progress","08:00",null,0,null,null],
    [7,"present-full","08:00","18:30",0,0,90],
    [16,"present-full","08:00","17:00",0,0,0],
    [17,"leave",null,null,null,null,null],
    [18,"absent",null,null,null,null,null],
    [19,"present-half","08:00","12:00",0,0,0],
    [28,"present-full","08:00","16:30",0,30,0]
  ];
  const rows = options.records || examples.map(([day,status,checkIn,checkOut,lateMinutes,earlyLeaveMinutes,overtimeMinutes]) => ({
    date: query.month + "-" + String(day).padStart(2,"0"), status,
    checkIn, checkOut, lateMinutes, earlyLeaveMinutes, overtimeMinutes
  }));
  const a = options.attendance || {};
  const supplied = Boolean(options.attendance);
  const currentDate = a.date || today;
  const currentStatus = a.absent || a.workdayStatus === "absent" ? "absent"
    : a.workdayStatus === "leave" ? "leave" : a.workdayStatus === "holiday" ? "holiday"
    : a.checkOut ? "present-full" : a.checkIn || !supplied ? "in-progress" : "unrecorded";
  const current = {
    date: currentDate, status: currentStatus,
    checkIn: supplied ? a.checkIn || null : (options.role === "manager" ? "08:00" : "08:04"), checkOut: a.checkOut || null,
    lateMinutes: a.lateMinutes ?? (options.role === "manager" ? 0 : 4),
    earlyLeaveMinutes: supplied ? a.earlyLeaveMinutes ?? null : null,
    overtimeMinutes: supplied ? a.overtimeMinutes ?? null : null
  };
  const selected = rows.filter(row => (options.records || row.date !== currentDate) && inAttendancePeriod(row.date, query));
  if (!options.records && inAttendancePeriod(currentDate, query)) selected.push(current);
  for(const row of selected){
    if(!row.checkIn)continue;
    if(options.records)continue;
    const calculated=attendanceCalculation(row.checkIn,row.checkOut);
    row.lateMinutes=calculated.recordedLateMinutes;
    row.earlyLeaveMinutes=row.checkOut ? calculated.earlyLeaveMinutes : null;
    row.overtimeMinutes=row.checkOut ? calculated.overtimeMinutes : null;
    if(row.checkOut)row.status=calculated.workdayStatus==="ครึ่งวัน"?"present-half":"present-full";
  }
  selected.sort((a,b) => b.date.localeCompare(a.date));
  const total = field => selected.some(row => row[field] !== null)
    ? selected.reduce((sum,row) => sum + (row[field] ?? 0),0) : null;
  const weights=Object.fromEntries(selected.filter(row=>row.status!=="holiday").map(row=>[row.date,row.workdayWeight ?? 1]));
  const monthly=monthlyOverview(selected.map(row=>({...row,workdayStatus:row.status==="present-full"?"เต็มวัน":row.status==="present-half"?"ครึ่งวัน":""})),
    selected.filter(row=>row.status==="leave").map(row=>({date:row.date,amount:1,status:"approved"})),weights,today);
  const summary = {
    attendanceDays: monthly.attendanceDays,
    leaveDays: monthly.leaveDays,
    absentDays: monthly.absenceDays,
    lateMinutes: total("lateMinutes"), earlyLeaveMinutes: total("earlyLeaveMinutes"), overtimeMinutes: total("overtimeMinutes")
  };
  const { status, ...fields } = selected.find(row=>row.date===currentDate) || current;
  return { ...fields, workdayStatus: status, absent: supplied ? Boolean(a.absent) : false, leaveStatus: a.leaveStatus || null, ...query, summary,
    history: selected, calendarDays: selected.map(({date,status}) => ({date,status})),
    source: { kind: options.kind || "mock", asOf: new Date().toISOString(), timeZone: "Asia/Bangkok" } };
}
