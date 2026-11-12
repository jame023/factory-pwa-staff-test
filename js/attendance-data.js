import { attendanceCalculation, monthlyOverview } from './business-rules.js?v=1.3.186';
import { createManagerAttendanceFixture } from './manager-attendance-fixture.js?v=1.3.186';
import { bangkokToday } from './utils.js?v=1.3.186';

export function normalizeAttendanceRecord(row) {
  const checkIn=row.checkIn || '',checkOut=row.checkOut || '';
  if(checkOut && !checkIn)throw new Error('กรุณาระบุเวลาเข้าก่อนเวลาออก');
  if(checkIn && checkOut && checkOut<checkIn)throw new Error('เวลาออกต้องไม่ก่อนเวลาเข้า');
  const special=row.absent || ['leave','absent','holiday'].includes(row.workdayStatus);
  const result=attendanceCalculation(checkIn,checkOut,{source:row.calculationSource || 'rfid03',extraOtEligible:row.extraOtEligible===true});
  const status=special ? row.absent ? 'absent' : row.workdayStatus : checkOut ? result.workdayStatus==='ครึ่งวัน' ? 'present-half' : 'present-full' : checkIn ? 'in-progress' : 'unrecorded';
  return {...row,checkIn,checkOut,status,workdayStatus:special?status:'present',absent:status==='absent',
    lateMinutes:special?0:result.recordedLateMinutes,earlyLeaveMinutes:special?0:checkOut?result.earlyLeaveMinutes:0,
    overtimeMinutes:special?0:checkOut?result.overtimeMinutes:0};
}
export function attendanceRecords(state) {
  if(Array.isArray(state.attendanceRecords))return state.attendanceRecords;
  const today=bangkokToday();
  const fixture=createManagerAttendanceFixture({startDate:today.slice(0,7)+'-01',endDate:today},today);
  const rows=fixture.daily.map(row=>normalizeAttendanceRecord({id:'attendance:'+row.employeeId+':'+row.date,employeeId:row.employeeId,employee:row.name,groups:row.groups,date:row.date,
    checkIn:row.checkIn.slice(0,5),checkOut:row.checkOut.slice(0,5),workdayStatus:row.leaveDays?'leave':row.absenceDays?'absent':'present',absent:row.absenceDays>0,leaveStatus:row.leaveDays?'ลากิจ':'',workdayWeight:row.workdayWeight,calculationSource:'rfid03'}));
  const owner=state.employees.find(row=>row.id==='mock-employee');
  if(owner && state.attendance)rows.push(normalizeAttendanceRecord({...state.attendance,id:'mock-attendance',employeeId:owner.id,employee:owner.name,groups:[owner.group || 'ออฟฟิต'],calculationSource:'rfid03'}));
  return rows;
}
export function personalAttendanceRows(rows,userId) {
  return rows.filter(row=>row.employeeId===userId).map(row=>({...row,checkIn:row.checkIn || null,checkOut:row.checkOut || null}));
}
export function attendanceDashboard(rows,query={}) {
  const startDate=query.startDate || bangkokToday().slice(0,7)+'-01',endDate=query.endDate || bangkokToday();
  // Reuse existing query validation without using its synthetic report output.
  createManagerAttendanceFixture({...query,startDate,endDate},bangkokToday());
  const directory=new Map(rows.map(row=>[row.employeeId,{id:row.employeeId,name:row.employee,groups:row.groups || []}]));
  const employees=[...directory.values()];
  const filtered=employees.filter(row=>row.name.includes(String(query.name || '').trim()));
  const ids=new Set(filtered.map(row=>row.id));
  const selected=rows.filter(row=>ids.has(row.employeeId)&&row.date>=startDate&&row.date<=endDate);
  const daily=selected.map(row=>({date:row.date,employeeId:row.employeeId,name:row.employee,groups:row.groups || [],checkIn:row.checkIn,checkOut:row.checkOut,
    dayStatus:row.status==='holiday'?'หยุด':row.workdayWeight===.5?'ครึ่งวัน':'เต็มวัน',
    lateMinutes:row.lateMinutes,earlyMinutes:row.earlyLeaveMinutes,overtimeMinutes:row.overtimeMinutes,
    status:({leave:'ลา',absent:'ขาด',holiday:'หยุด','in-progress':'เข้างาน','present-full':'เลิกงาน','present-half':'เลิกงาน',unrecorded:'ยังไม่มีข้อมูล'})[row.status],note:row.updatedAt?'แก้ไขโดย Admin':''}));
  const summaries=filtered.map(person=>{
    const own=selected.filter(row=>row.employeeId===person.id),weights=Object.fromEntries(own.filter(row=>row.status!=='holiday').map(row=>[row.date,row.workdayWeight ?? 1]));
    const m=monthlyOverview(own.map(row=>({...row,workdayStatus:row.status==='present-full'?'เต็มวัน':row.status==='present-half'?'ครึ่งวัน':''})),own.filter(row=>row.status==='leave').map(row=>({date:row.date,amount:row.workdayWeight ?? 1,status:'approved'})),weights,bangkokToday());
    const sum=key=>own.reduce((n,row)=>n+(row[key] || 0),0);
    return {...person,workdays:Object.values(weights).reduce((a,b)=>a+b,0),attendanceDays:m.attendanceDays,leaveDays:m.leaveDays,absenceDays:m.absenceDays,
      lateDays:own.filter(row=>row.lateMinutes>0).length,lateMinutes:sum('lateMinutes'),earlyDays:own.filter(row=>row.earlyLeaveMinutes>0).length,earlyMinutes:sum('earlyLeaveMinutes'),overtimeDays:own.filter(row=>row.overtimeMinutes>0).length,overtimeMinutes:sum('overtimeMinutes')};
  });
  const keys=['workdays','attendanceDays','leaveDays','absenceDays','lateDays','lateMinutes','earlyDays','earlyMinutes','overtimeDays','overtimeMinutes'];
  const totals=Object.fromEntries(keys.map(key=>[key,summaries.reduce((n,row)=>n+row[key],0)]));
  daily.sort((a,b)=>b.date.localeCompare(a.date)||a.name.localeCompare(b.name,'th'));
  return {source:'mock',employees,startDate,endDate,summaries,daily,totals};
}
