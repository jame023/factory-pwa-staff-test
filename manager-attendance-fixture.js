import { attendanceCalculation } from "./business-rules.js?v=1.3.186";
import { bangkokToday } from "./utils.js?v=1.3.186";

// Synthetic development data only. Real names and calculated totals must come
// from an authenticated, read-only backend joining the existing Sheet sources.
const roster = [
  { id:"demo-production", name:"พนักงานผลิตตัวอย่าง", groups:["ผลิต"] },
  { id:"demo-screen", name:"พนักงานสกรีนตัวอย่าง", groups:["สกรีน"] },
  { id:"demo-delivery", name:"พนักงานส่งของตัวอย่าง", groups:["ขนส่ง"] },
  { id:"demo-office", name:"พนักงานออฟฟิตตัวอย่าง", groups:["ออฟฟิต"] }
];
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || "") &&
  Number.isFinite(Date.parse(value + "T00:00:00Z")) && new Date(value + "T00:00:00Z").toISOString().slice(0,10) === value;
const metrics = ["workdays","attendanceDays","leaveDays","absenceDays","lateDays","lateMinutes","earlyDays","earlyMinutes","overtimeDays","overtimeMinutes"];
export function createManagerAttendanceFixture(query = {}, today = bangkokToday()) {
  const startDate = query.startDate || today.slice(0,7) + "-01";
  const endDate = query.endDate || today;
  const name = String(query.name || "").trim();
  if (!validDate(startDate) || !validDate(endDate) || startDate > endDate ||
      (Date.parse(endDate) - Date.parse(startDate)) / 86400000 > 366 || name.length > 100) {
    throw new Error("เลือกช่วงวันที่ให้ถูกต้อง ไม่เกิน 367 วัน");
  }
  const employees = roster.filter(person => person.name.includes(name));
  const daily = [];
  for (let stamp = Date.parse(startDate); stamp <= Math.min(Date.parse(endDate),Date.parse(today)); stamp += 86400000) {
    const day = new Date(stamp);
    const date = day.toISOString().slice(0,10);
    if ([0,6].includes(day.getUTCDay())) continue;
    employees.forEach((person,index) => {
      const n = day.getUTCDate();
      const leave = (n + index) % 13 === 0;
      const absent = !leave && (n + index) % 17 === 0;
      const half = day.getUTCDay() === 5;
      const working = !leave && !absent;
      const active = date === today && working;
      const lateMinutes = working && (n + index) % 4 === 0 ? 10 + index : 0;
      const earlyMinutes = working && !active && (n + index) % 7 === 0 ? 15 : 0;
      const overtimeMinutes = working && !active && !half && !earlyMinutes && (n + index) % 3 === 0 ? 60 : 0;
      daily.push({ date, employeeId:person.id, name:person.name, groups:person.groups,
        checkIn:working ? (lateMinutes ? "08:" + String(lateMinutes).padStart(2,"0") + ":00" : "07:50:00") : "",
        checkOut:working && !active ? (half ? "12:00:00" : earlyMinutes ? "16:45:00" : overtimeMinutes ? "18:00:00" : "17:00:00") : "",
        dayStatus:half ? "ครึ่งวัน" : "เต็มวัน", workdayWeight:half ? 0.5 : 1,
        attendanceDays:working && !active ? (half ? 0.5 : 1) : 0,
        leaveDays:leave ? (half ? 0.5 : 1) : 0, absenceDays:absent ? (half ? 0.5 : 1) : 0,
        lateMinutes, earlyMinutes, overtimeMinutes,
        status:leave ? "ลา" : absent ? "ขาด" : active ? "เข้างาน" : "เลิกงาน",
        note:active ? "ยังไม่มีเวลาออก • ไม่สรุปเป็นขาดงาน" : leave ? "ลากิจ (ข้อมูลจำลอง)" : "" });
    });
  }
  for(const row of daily){
    if(!row.checkIn)continue;
    const result=attendanceCalculation(row.checkIn,row.checkOut);
    row.lateMinutes=result.recordedLateMinutes;
    row.earlyMinutes=row.checkOut?result.earlyLeaveMinutes:0;
    row.overtimeMinutes=row.checkOut?result.overtimeMinutes:0;
    row.dayStatus=result.workdayStatus;
    row.attendanceDays=row.checkOut?Math.min(result.workdayStatus==="เต็มวัน"?1:.5,row.workdayWeight):0;
  }
  const summaries = employees.map(person => {
    const rows = daily.filter(row => row.employeeId === person.id);
    const sum = field => rows.reduce((total,row) => total + row[field],0);
    return { ...person, workdays:sum("workdayWeight"), attendanceDays:sum("attendanceDays"),
      leaveDays:sum("leaveDays"), absenceDays:sum("absenceDays"),
      lateDays:rows.filter(row => row.lateMinutes > 0).length, lateMinutes:sum("lateMinutes"),
      earlyDays:rows.filter(row => row.earlyMinutes > 0).length, earlyMinutes:sum("earlyMinutes"),
      overtimeDays:rows.filter(row => row.overtimeMinutes > 0).length, overtimeMinutes:sum("overtimeMinutes") };
  });
  const totals = Object.fromEntries(metrics.map(key => [key,summaries.reduce((sum,row) => sum + row[key],0)]));
  daily.sort((a,b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name,"th"));
  return { source:"mock", employees:roster, startDate,endDate,summaries,daily,totals };
}
