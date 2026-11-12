import { MOCK_STORAGE_KEY, MOCK_USERS } from "./config.js?v=1.3.186";
import { normalizeRole, normalizeGroup } from "./permissions.js?v=1.3.186";
import { bangkokToday } from "./utils.js?v=1.3.186";

const makeInitialState = () => ({
  employees: MOCK_USERS.map(user => ({ ...user, group: "ออฟฟิต", active: true })),
  auditLog: [],
  devices: [
    { id: "mock-gateway", name: "Gateway", state: "เชื่อมต่อ", last: "วันนี้ 08:42", pending: 0 },
    { id: "mock-rfid", name: "RFID", state: "พร้อม", last: "วันนี้ 08:41", pending: 0 },
    { id: "mock-c6", name: "ESP32-C6", state: "พร้อม", last: "วันนี้ 08:40", pending: 0 },
    { id: "mock-h2", name: "ESP32-H2", state: "พร้อม", last: "วันนี้ 08:39", pending: 0 }
  ],
  attendance: {
    date: bangkokToday(), checkIn: "08:04", checkOut: "", lateMinutes: 4,
    earlyLeaveMinutes: 0, overtimeMinutes: 0, workdayStatus: "present",
    leaveStatus: "ไม่มี", absent: false
  },
  workSessions: [],
  otRequests: [],
  leaveRequests: [
    { id: "mock-leave-001", type: "ลากิจ", startDate: bangkokToday(), endDate: bangkokToday(),
      period: "เต็มวัน", reason: "ข้อมูลตัวอย่างสำหรับทดสอบ", status: "pending", createdAt: new Date().toISOString() }
  ],
  calendar: { groups: ["สกรีน", "ผลิต", "ขนส่ง", "ออฟฟิต"], entries: [] },
  deliveries: [],
  production: [],
  productionWork: [],
  screenEntries: [],
  reports: {
    today: { present: 18, late: 2, leave: 1, absent: 0, production: 1240, delivery: 7, outstanding: "พนักงานตัวอย่าง" },
    week: { present: 92, late: 8, leave: 4, absent: 2, production: 6820, delivery: 31, outstanding: "พนักงานตัวอย่าง" },
    month: { present: 384, late: 26, leave: 18, absent: 7, production: 27140, delivery: 126, outstanding: "พนักงานตัวอย่าง" }
  }
});

let cached = null;
const listeners = new Set();
const clone = (value) => JSON.parse(JSON.stringify(value));
export function getStore() {
  if (cached) return cached;
  try {
    const stored = globalThis.localStorage?.getItem(MOCK_STORAGE_KEY);
    cached = stored ? JSON.parse(stored) : makeInitialState();
  } catch {
    cached = makeInitialState();
  }
  const initial = makeInitialState();
  cached.employees ||= initial.employees;
  cached.employees = cached.employees.map(item => ({ ...item, role: normalizeRole(item.role),
    group:normalizeGroup(item.group),
    ...(Array.isArray(item.groups) ? {groups:[...new Set(item.groups.map(normalizeGroup))]} : {}),
    ...(Array.isArray(item.calendarGroups) ? {calendarGroups:[...new Set(item.calendarGroups.map(normalizeGroup))]} : {}) }));
  cached.devices ||= initial.devices;
  cached.productionWork ||= initial.productionWork;
  cached.auditLog ||= [];
  if (!cached.screenDetailsPreviewSeeded) {
    const date = bangkokToday();
    const examples = [
      {id:"mock-screen-preview-b1",sheetName:"สกรีน B1 (แพ็คคอยาว)",enteredPack:120,missingBottles:3,productionDamagedBottles:1,operatorName:"พนักงานสกรีนตัวอย่าง ก",employeeId:"mock-screen-person-a",createdAt:date+"T09:00:00+07:00",note:"ข้อมูลจำลอง: บันทึกยอดแพ็คและแยกยอดเสียของ B1"},
      {id:"mock-screen-preview-b2",sheetName:"สกรีน B2 (คอสั้น)",enteredPack:95,missingBottles:2,productionDamagedBottles:0,operatorName:"พนักงานสกรีนตัวอย่าง ข",employeeId:"mock-screen-person-b",createdAt:date+"T10:00:00+07:00",note:"ข้อมูลจำลอง: ไม่มีของเสียจากผลิตในรายการนี้"},
      {id:"mock-screen-preview-b3",sheetName:"สกรีน B3 (คอยาว)",enteredPack:110,missingBottles:0,productionDamagedBottles:2,operatorName:"พนักงานสกรีนตัวอย่าง ค",employeeId:"mock-screen-person-c",createdAt:date+"T11:00:00+07:00",note:"ข้อมูลจำลอง: ไม่มีของเสียจากสกรีนในรายการนี้"}
    ];
    cached.screenEntries ||= [];
    examples.forEach(row => { if (!cached.screenEntries.some(item=>item.id===row.id)) cached.screenEntries.push({...row,date,employee:row.operatorName}); });
    cached.screenDetailsPreviewSeeded = true;
    try { globalThis.localStorage?.setItem(MOCK_STORAGE_KEY,JSON.stringify(cached)); } catch {}
  }
  if (!cached.deliveryDetailsPreviewSeeded) {
    const date = bangkokToday();
    const examples = [
      {id:"mock-delivery-preview-001",product:"สินค้าตัวอย่าง A",quantity:120,sender:"พนักงานส่งของตัวอย่าง ก",employeeId:"mock-delivery-person-a",dateTime:date+"T09:15:00+07:00",status:"ส่งสำเร็จ",note:"ข้อมูลจำลอง: ตรวจนับสินค้าครบก่อนส่ง"},
      {id:"mock-delivery-preview-002",product:"สินค้าตัวอย่าง B",quantity:80,sender:"พนักงานส่งของตัวอย่าง ข",employeeId:"mock-delivery-person-b",dateTime:date+"T10:30:00+07:00",status:"ส่งสำเร็จ",note:"ข้อมูลจำลอง: ส่งครบตามจำนวนที่บันทึก"},
      {id:"mock-delivery-preview-003",product:"สินค้าตัวอย่าง C",quantity:50,sender:"พนักงานส่งของตัวอย่าง ก",employeeId:"mock-delivery-person-a",dateTime:date+"T11:00:00+07:00",status:"ยกเลิก",note:"ข้อมูลจำลอง: ยกเลิกก่อนนำสินค้าออก"}
    ];
    cached.deliveries ||= [];
    examples.forEach(row => { if (!cached.deliveries.some(item=>item.id===row.id)) cached.deliveries.push({...row,employee:row.sender,createdAt:row.dateTime}); });
    cached.deliveryDetailsPreviewSeeded = true;
    try { globalThis.localStorage?.setItem(MOCK_STORAGE_KEY,JSON.stringify(cached)); } catch {}
  }
  // One-time synthetic leave examples; reviewed examples are never recreated.
  if (!cached.leavePendingPreviewSeeded) {
    const examples = [
      { id:"mock-leave-preview-personal", employeeId:"mock-preview-production", employee:"พนักงานผลิตตัวอย่าง", type:"ลากิจ", period:"เต็มวัน", reason:"ตัวอย่าง: ติดต่อหน่วยงานราชการ" },
      { id:"mock-leave-preview-sick", employeeId:"mock-preview-screen", employee:"พนักงานสกรีนตัวอย่าง", type:"ลาป่วย", period:"ครึ่งวันเช้า", reason:"ตัวอย่าง: ไปพบแพทย์" }
    ];
    cached.leaveRequests ||= [];
    examples.forEach(item => {
      if (!cached.leaveRequests.some(row => row.id === item.id)) cached.leaveRequests.push({ ...item,
        startDate:bangkokToday(), endDate:bangkokToday(), status:"pending", createdAt:new Date().toISOString() });
    });
    cached.leavePendingPreviewSeeded = true;
    try { globalThis.localStorage?.setItem(MOCK_STORAGE_KEY, JSON.stringify(cached)); } catch {}
  }
  cached.calendar ||= initial.calendar;
  cached.calendar.entries ||= [];
  cached.calendar.groups = [...new Set((cached.calendar.groups || initial.calendar.groups).map(normalizeGroup))];
  cached.calendar.entries = cached.calendar.entries.map(item=>({...item,group:normalizeGroup(item.group)}));
  cached.screenEntries ||= [];
  for (const category of ["workSessions", "otRequests", "leaveRequests", "deliveries", "production", "screenEntries"]) {
    cached[category] ||= [];
    cached[category] = cached[category].map(item => ({ employeeId: "mock-employee", employee: "พนักงานตัวอย่าง", ...item }));
  }
  return cached;
}
export function updateStore(mutator) {
  const next = clone(getStore());
  mutator(next);
  cached = next;
  try { globalThis.localStorage?.setItem(MOCK_STORAGE_KEY, JSON.stringify(next)); } catch {}
  for (const listener of listeners) listener(cached);
  return cached;
}
export function subscribeStore(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function resetMockStore() {
  cached = makeInitialState();
  try { globalThis.localStorage?.setItem(MOCK_STORAGE_KEY, JSON.stringify(cached)); } catch {}
  for (const listener of listeners) listener(cached);
  return cached;
}

globalThis.addEventListener?.("storage", event => {
  if (event.key !== MOCK_STORAGE_KEY && event.key !== null) return;
  cached = null;
  for (const listener of listeners) listener(getStore());
});
