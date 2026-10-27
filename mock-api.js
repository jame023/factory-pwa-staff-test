import { requireActiveItemName } from './active-item-names.js?v=1.3.186';
import { attendanceRecords, personalAttendanceRows, attendanceDashboard, normalizeAttendanceRecord } from "./attendance-data.js?v=1.3.186";
import { canReadLeaveNotice, leaveMediaPreview } from "./leave-media.js?v=1.3.186";
import { createMockReport, acceptMockReport, reportNotice, REPORT_KINDS } from "./report-inbox.js?v=1.3.186";
import { assertActive, assertWorkStart, assertWorkEnd, normalizeCalendar, deliveryValues, productionTotals, requestId, assertUndo, validDay } from "./business-rules.js?v=1.3.186";
import { validateLeaveSubmission, storedLeaveItems, assertLeaveCancellation } from "./leave-rules.js?v=1.3.186";
import { createManagerAttendanceFixture } from "./manager-attendance-fixture.js?v=1.3.186";
import { getStore, updateStore } from "./state.js?v=1.3.186";
import { sleep, bangkokToday } from "./utils.js?v=1.3.186";
import { authProvider } from "./auth.js?v=1.3.205";
import { assertMockPermission, calendarGroupsForUser, canAccessModule, isProductionEmployee, isScreenEmployee, PRODUCTION_WORK_MACHINES, SCREEN_WORK_MACHINES } from "./permissions.js?v=1.3.186";
import { validateRecord, RECORD_SCHEMAS } from "./record-schema.js?v=1.3.186";
import { createAttendanceFixture } from "./attendance-fixture.js?v=1.3.186";

const clone = value => JSON.parse(JSON.stringify(value));
const newId = prefix => prefix + "-" + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2));
const recordDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || "") ? value : value
  ? new Intl.DateTimeFormat("en-CA", { timeZone:"Asia/Bangkok", year:"numeric", month:"2-digit", day:"2-digit" }).format(new Date(value)) : "";
const rowsFor = (state, category) => category === "attendance" ? attendanceRecords(state)
  : category === "calendar" ? state.calendar.entries : state[category];
function audit(next, user, action, recordId) {
  next.auditLog.unshift({ id:newId("audit"), actor:user.name, action, recordId, createdAt:new Date().toISOString() });
  next.auditLog = next.auditLog.slice(0, 200);
}
function notifyCalendarChanges(next, records) {
  next.calendarNotifications ||= [];
  const groups = [...new Set(records.map(row => row.group))];
  groups.forEach(group => next.calendarNotifications.unshift({
    id:newId("calendar-notification"), group, createdAt:new Date().toISOString(), source:"mock",
    entries:records.filter(row => row.group === group).map(row => ({date:row.date,status:row.status}))
  }));
  next.calendarNotifications = next.calendarNotifications.slice(0,100);
}
function notifyLeaveChange(next,request,event,eventId=null) {
  next.leaveNotifications ||= [];
  const id = eventId || request.id + ":" + event;
  if(next.leaveNotifications.some(row=>row.id===id))return;
  next.leaveNotifications.unshift({id,event,requestId:request.id,employeeId:request.employeeId,employee:request.employee,
    status:request.status,period:request.period,dates:storedLeaveItems(request).map(row=>({date:row.date,label:row.label})),
    media:{assetId:"mock-leave-status-card",mimeType:"image/svg+xml"},rejectionReason:request.rejectionReason || "",createdAt:new Date().toISOString(),source:"mock"});
  next.leaveNotifications=next.leaveNotifications.slice(0,200);
}
function readReport(state, period) {
  const today = bangkokToday();
  let start = today;
  if (period === "month") start = today.slice(0, 7) + "-01";
  if (period === "week") {
    const day = new Date(today + "T00:00:00Z");
    day.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 6) % 7);
    start = day.toISOString().slice(0, 10);
  }
  const within = value => { const date = recordDate(value); return date >= start && date <= today; };
  const production = state.production.filter(row => within(row.date || row.createdAt));
  const attendance = within(state.attendance.date) ? state.attendance : null;
  const totals = new Map();
  production.forEach(row => totals.set(row.operator, (totals.get(row.operator) || 0) + Number(row.quantity)));
  return {
    present: attendance?.checkIn ? 1 : 0, late: Number(attendance?.lateMinutes || 0) > 0 ? 1 : 0,
    leave: state.leaveRequests.filter(row => row.status === "approved" && row.startDate <= today && row.endDate >= start).length,
    absent: attendance?.absent ? 1 : 0, production: production.reduce((sum, row) => sum + Number(row.quantity || 0), 0),
    delivery: state.deliveries.filter(row => row.status !== "ยกเลิก" && within(row.dateTime || row.createdAt)).length,
    outstanding: [...totals].sort((a, b) => b[1] - a[1])[0]?.[0] || "—", source:{kind:"mock",asOf:new Date().toISOString()}
  };
}

export const createMockApi = sessionProvider => async (module, action, payload = {}) => {
  await sleep();
  const key = module + "." + action;
  const session = await sessionProvider.getSession();
  if (!session?.user) throw new Error("บัญชีถูกระงับหรือยังไม่ได้เข้าสู่ระบบ");
  const { user } = session;
  assertActive(user);
  assertMockPermission(user.role, key);
  if (key.startsWith("package01.screenManual.") && user.role === "employee" && !isScreenEmployee(user)) throw new Error("เฉพาะพนักงานกลุ่มสกรีนเท่านั้น");
  if (module === "package04" && !canAccessModule(user, "delivery")) throw new Error("เฉพาะพนักงานกลุ่ม ขนส่ง เท่านั้น");
  if (module === "package07" && key.startsWith("package07.ot.") && !canAccessModule(user, "ot")) throw new Error("ไม่มีสิทธิ์ใช้งานข้อมูล OT");
  if (module === "package07" && !key.startsWith("package07.ot.") && !canAccessModule(user, "work-session")) throw new Error("เริ่มงาน/จบงานสำหรับกลุ่มผลิตหรือสกรีนเท่านั้น กลุ่มขนส่งไม่มีสิทธิ์");
  if (module === "package05" && !canAccessModule(user, "production-record")) throw new Error("เฉพาะพนักงานกลุ่มผลิตเท่านั้น");
  const actorField = { "package04.delivery.create":"sender", "package05.production.create":"operator",
    "package07.work.start":"employee", "package09.leave.submit":"employee" }[key];
  if (actorField && payload[actorField] !== undefined && payload[actorField] !== user.name) {
    throw new Error("ไม่สามารถเปลี่ยนชื่อผู้บันทึกหรือเปลี่ยนชื่อผู้ส่งได้");
  }
  if (/\.(create|start|end|submit|review|save|cancel|undo)$/.test(action) && globalThis.navigator?.onLine === false) {
    throw new Error("ออฟไลน์: ยังไม่บันทึกรายการและไม่มีการส่งอัตโนมัติ");
  }
  if (module === "package09" && user.active === false) throw new Error("บัญชีนี้ถูกระงับใช้งาน");
  const state = getStore();
    if (key === "package04.delivery.create" && user.deliveryAccess?.allowed !== true) throw new Error("ยังไม่มีข้อมูลสิทธิ์บันทึกการขนส่งจากชีต");
    const createCategory={"package01.screenManual.create":"screenEntries","package04.delivery.create":"deliveries","package05.production.create":"production"}[key];
    const submittedRequestId=createCategory ? requestId(payload.requestId) : null;
    if(createCategory){
      const old=state[createCategory].find(row=>row.requestId===submittedRequestId);
      if(old){if(old.employeeId!==user.id)throw new Error("Request ID เป็นของบัญชีอื่น");return clone({...old,duplicate:true});}
    }
  const visible = category => clone(state[category].filter(row => user.role !== "employee" || row.employeeId === user.id));
  const created = category => {
    const record = { ...payload, ...(submittedRequestId ? {requestId:submittedRequestId} : {}), id:newId(category), employeeId:user.id, employee:user.name, createdAt:new Date().toISOString() };
    updateStore(next => { next[category].unshift(record); audit(next, user, key, record.id); });
    return clone(record);
  };
  switch (key) {
    case "package03.attendance.dashboard": return attendanceDashboard(attendanceRecords(state),payload);
    case "package03.attendance.read":
      return clone({ attendance:state.attendance });
    case "package01.screenManual.read": return visible("screenEntries");
    case "package01.screenManual.create": {
      if(user.role === "admin")throw new Error("กรุณาเพิ่มข้อมูลสกรีนผ่านศูนย์ควบคุม Admin พร้อมระบุเหตุผล");
      if (!isScreenEmployee(user) && user.role !== "admin") throw new Error("เฉพาะพนักงานกลุ่มสกรีนเท่านั้น");
      const data = {
        date:String(payload.date || "").trim(), sheetName:String(payload.sheetName || "").trim(),
        enteredPack:payload.enteredPack === "" || payload.enteredPack == null ? null : Number(payload.enteredPack),
        missingBottles:payload.missingBottles === "" || payload.missingBottles == null ? null : Number(payload.missingBottles),
        productionDamagedBottles:payload.productionDamagedBottles === "" || payload.productionDamagedBottles == null ? null : Number(payload.productionDamagedBottles),
        note:String(payload.note || "").trim(), operatorName:user.name
      };
      if (!validDay(data.date)) throw new Error("กรุณาเลือกวันที่ให้ถูกต้อง");
      if (!["สกรีน B1 (แพ็คคอยาว)", "สกรีน B2 (คอสั้น)", "สกรีน B3 (คอยาว)"].includes(data.sheetName)) throw new Error("กรุณาเลือกเครื่องสกรีน B1, B2 หรือ B3");
      const counts = [data.enteredPack, data.missingBottles, data.productionDamagedBottles].filter(value => value !== null);
      if (!counts.length || counts.some(value => !Number.isFinite(value) || value < 0)) throw new Error("กรอกจำนวนตั้งแต่ 0 ขึ้นไปอย่างน้อยหนึ่งช่อง");
      if (data.note.length > 500) throw new Error("หมายเหตุต้องไม่เกิน 500 ตัวอักษร");
      if((state.dailyCloses || []).some(row=>row.date===data.date && row.sheetName===data.sheetName && row.closed))throw new Error("ปิดยอดวันและเครื่องนี้แล้ว กรุณาเปิดยอดก่อนแก้ไข");
      payload = data;
      return created("screenEntries");
    }
    case "package04.delivery.list": return visible("deliveries");
    case "package04.delivery.options": {
      const access = user.deliveryAccess;
      return clone({ allowed:access?.allowed === true, products:access?.allowed === true && Array.isArray(access.products) ? access.products : [],
        sender:access?.allowed === true ? user.name : "", source:"mock",directorySnapshotDate:user.directorySnapshotDate || null });
    }
    case "package04.delivery.create":
      if (user.deliveryAccess?.allowed !== true) throw new Error("ยังไม่มีข้อมูลสิทธิ์บันทึกการขนส่งจากชีต");
      if (!Array.isArray(user.deliveryAccess.products) || !user.deliveryAccess.products.includes(payload.product)) throw new Error("กรุณาเลือกสินค้าที่ได้รับสิทธิ์จากรายการ");
      if (payload.sender !== undefined && payload.sender !== user.name) throw new Error("ไม่สามารถเปลี่ยนชื่อผู้ส่งได้");
      payload = {...validateRecord("deliveries", { ...payload, sender:user.name }),...deliveryValues(payload,user)};
      return created("deliveries");
    case "package04.delivery.undo": {
      const row=state.deliveries.find(item=>item.id===payload.id);
      assertUndo(row,user);
      updateStore(next=>{const item=next.deliveries.find(item=>item.id===row.id);item.legacyStatus="UNDONE";item.status="ยกเลิก";item.undoneAt=new Date().toISOString();audit(next,user,key,item.id);});
      return clone(getStore().deliveries.find(item=>item.id===row.id));
    }
    case "package05.production.list": return visible("production");
    case "package05.production.create":
      if (user.role === "employee" && !PRODUCTION_WORK_MACHINES.includes(payload.machine)) throw new Error("กลุ่มผลิตใช้เครื่อง A1, A2 หรือ C1 เท่านั้น");
      payload = {...validateRecord("production", { ...payload, operator:user.name }),...productionTotals(payload.quantity,payload.defective)};
      return created("production");
    case "package06.reports.inbox.read": {
      const kind=payload.kind || "all";
      if(kind!=="all"&&!Object.hasOwn(REPORT_KINDS,kind))throw new Error("ชนิดรายงานไม่ถูกต้อง");
      return clone((state.reportInbox || []).filter(row=>kind==="all"||row.kind===kind));
    }
    case "package06.reports.notifications.read":
      return ["executive","admin"].includes(user.role) ? clone((state.reportInbox || []).map(reportNotice)) : [];
    case "package06.reports.preview.create": {
      const input=createMockReport(payload.kind,bangkokToday());
      let result;
      updateStore(next=>{result=acceptMockReport(next,input);});
      return clone(result);
    }
    case "package06.reports.read": return clone(readReport(state, payload.period));
    case "package07.work.options": return clone({orders:Array.isArray(user.workAccess?.orders)?user.workAccess.orders:[],source:"mock",directorySnapshotDate:user.directorySnapshotDate || null});
    case "package07.work.read": return visible("workSessions");
    case "package07.ot.read": return clone(state.otRequests.filter(row => user.role !== "employee" || row.employeeId === user.id));
    case "package07.ot.submit": {
      const date=String(payload.date || ""), details=String(payload.details || "").trim(), hours=Number(payload.hours);
      const legacyPhoto=String(payload.photo || "");
      const photos=Array.isArray(payload.photos) ? payload.photos : (legacyPhoto ? [legacyPhoto] : []);
      const validPhoto=value=>typeof value==="string" && /^data:image\/(png|jpeg|webp|gif);base64,/.test(value) && value.length<=720000;
      if(!validDay(date) || !Number.isFinite(hours) || hours < 1/60 || hours > 12+59/60 || details.length < 5 || details.length > 1000) throw new Error("กรุณาตรวจวันที่ ชั่วโมง OT และรายละเอียดงาน");
      if(photos.length>5 || photos.some(photo=>!validPhoto(typeof photo==="string" ? photo : photo?.dataUrl)) || photos.reduce((sum,photo)=>sum+(typeof photo==="string" ? photo.length : photo.dataUrl.length),0)>2880000) throw new Error("แนบรูปได้สูงสุด 5 รูป • ไม่เกิน 512 KB ต่อรูป และรวมไม่เกิน 2 MB");
      const durationMinutes=hours*60; if(Math.abs(durationMinutes-Math.round(durationMinutes))>1e-7) throw new Error("ระยะเวลา OT ต้องระบุเป็นนาที");
      const normalizedPhotos=photos.map(photo=>typeof photo==="string" ? photo : photo.dataUrl);
      payload={date,details,hours:Math.round(durationMinutes)/60,photo:normalizedPhotos[0] || "",photos:normalizedPhotos}; return created("otRequests");
    }
    case "package07.work.start": {
      // Work-session storage remains the existing development adapter. Names supplied by
      // the live catalogue must be checked in Supabase rather than the old snapshot.
      let workUser = user;
      if (payload.workType === 'สกรีน' && payload.itemNameId) {
        const item = await requireActiveItemName(payload.itemNameId, payload.orderName);
        workUser = { ...user, workAccess:{ ...user.workAccess, orders:[item.item_name] } };
      }
      assertWorkStart(payload,workUser,state.workSessions);
      if (isProductionEmployee(user) && (payload.workType !== "ผลิต" || !PRODUCTION_WORK_MACHINES.includes(payload.machine))) {
        throw new Error("กลุ่มผลิตเริ่มได้เฉพาะงานผลิต เครื่อง A1, A2 หรือ C1");
      }
      if (isScreenEmployee(user) && payload.workType !== "สกรีน") throw new Error("กลุ่มสกรีนเริ่มงานได้เฉพาะประเภทสกรีน");
      if (isScreenEmployee(user) && !SCREEN_WORK_MACHINES.includes(payload.machine)) throw new Error("กลุ่มสกรีนใช้ได้เฉพาะเครื่อง B1, B2 หรือ B3");
      if (state.workSessions.some(row => row.employeeId === user.id && !row.endedAt)) throw new Error("มีงานที่กำลังทำอยู่แล้ว");
      payload = validateRecord("workSessions", { ...payload, employee:user.name, quantity:0,
        orderName:payload.workType === "สกรีน" ? payload.orderName : "",
        startedAt:new Date().toISOString(), endedAt:"" });
      return created("workSessions");
    }
    case "package07.work.end": {
      const active = state.workSessions.find(row => row.id === payload.id && !row.endedAt);
      if (!active || (user.role === "employee" && active.employeeId !== user.id)) throw new Error("ไม่พบงานที่คุณกำลังทำ");
      if ((typeof payload.quantity !== "number" && typeof payload.quantity !== "string") || String(payload.quantity).trim() === "" ||
          !Number.isInteger(Number(payload.quantity)) || Number(payload.quantity) < 0) throw new Error("กรุณาใส่จำนวนเต็มตั้งแต่ 0 ขึ้นไปก่อนจบงาน");
      assertWorkEnd(active,payload.quantity);
      updateStore(next => {
        const item = next.workSessions.find(row => row.id === payload.id);
        item.endedAt = new Date().toISOString();
        item.quantity = Number(payload.quantity);
        audit(next, user, key, payload.id);
      });
      return clone(getStore().workSessions.find(row => row.id === payload.id));
    }
    case "package08.calendar.notifications.read": {
      const allowed = user.role === "employee" ? calendarGroupsForUser(user,state.calendar.groups) : [];
      return clone((state.calendarNotifications || []).filter(row => allowed.includes(row.group)));
    }
    case "package08.calendar.read": {
      if (typeof payload.month !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(payload.month)) throw new Error("กรุณาเลือกเดือนให้ถูกต้อง");
      const groups = calendarGroupsForUser(user, state.calendar.groups);
      if (payload.group !== undefined && !groups.includes(payload.group)) throw new Error("ไม่มีสิทธิ์ดูปฏิทินกลุ่มนี้");
      const selected = payload.group === undefined ? groups : [payload.group];
      return clone({ groups, month:payload.month,
        entries:state.calendar.entries.filter(row => row.date.startsWith(payload.month) && selected.includes(row.group)),
        approvedLeaves:state.leaveRequests.filter(row=>row.status==="approved").flatMap(row=>storedLeaveItems(row)
          .filter(day=>day.date.startsWith(payload.month)).map(day=>({requestId:row.id,employee:row.employee,date:day.date,period:day.label,group:row.group || ""}))) });
    }
    case "package08.calendar.batch.save": {
      if (!Array.isArray(payload.entries) || !payload.entries.length || payload.entries.length > 366) throw new Error("เลือก 1–366 รายการต่อครั้ง");
      const seen = new Set();
      const records = payload.entries.map(entry => {
        const data = validateRecord("calendar", normalizeCalendar(entry));
        if (!state.calendar.groups.includes(data.group) || !Number.isFinite(Date.parse(data.date + "T00:00:00Z")) || new Date(data.date + "T00:00:00Z").toISOString().slice(0,10) !== data.date) throw new Error("วันที่หรือกลุ่มงานไม่ถูกต้อง");
        const recordKey = data.group + "|" + data.date;
        if (seen.has(recordKey)) throw new Error("วันที่และกลุ่มงานซ้ำในรายการ");
        seen.add(recordKey);
        const existing = state.calendar.entries.find(row => row.date === data.date && row.group === data.group);
        return { ...data, id:existing?.id || newId("calendar"), updatedAt:new Date().toISOString() };
      });
      updateStore(next => {
        next.calendar.entries = next.calendar.entries.filter(row => !seen.has(row.group + "|" + row.date));
        next.calendar.entries.push(...records);
        records.forEach(record => audit(next,user,key,record.id));
        notifyCalendarChanges(next,records);
      });
      return clone(records);
    }
    case "package08.calendar.save": {
      const data = validateRecord("calendar", normalizeCalendar(payload));
      const existing = state.calendar.entries.find(row => row.date === data.date && row.group === data.group);
      const record = { ...data, id:existing?.id || newId("calendar"), updatedAt:new Date().toISOString() };
      updateStore(next => {
        next.calendar.entries = next.calendar.entries.filter(row => row.id !== record.id);
        next.calendar.entries.push(record); audit(next, user, key, record.id);
        notifyCalendarChanges(next,[record]);
      });
      return clone(record);
    }
    case "package09.leave.read": return visible("leaveRequests");
    case "package09.leave.notices.read":
    case "package09.leave.notifications.read": {
      const manager=["executive","admin"].includes(user.role);
      const office=(user.calendarGroups || user.groups || []).includes("ออฟฟิต");
      return clone((state.leaveNotifications || []).filter(row=>canReadLeaveNotice(row,user))
        .map(row=>({id:row.id,createdAt:row.createdAt,source:"mock",mediaPreview:leaveMediaPreview(row),
          title:row.event==="submitted" ? "มีคำขอลารออนุมัติ" : row.event==="cancelled" ? "ยกเลิกคำขอลา" : row.status==="approved" ? "อนุมัติการลาแล้ว" : "ปฏิเสธการลาแล้ว",
          body:row.employee+"\n"+row.dates.map(day=>day.date+" • "+day.label).join("\n")+
            (row.employeeId===user.id && row.rejectionReason ? "\nเหตุผล: "+row.rejectionReason : ""),
          route:manager ? "executive/leave" : row.employeeId===user.id ? "employee/leave" : "employee/leave"})));
    }
    case "package09.leave.submit": {
      const values=validateLeaveSubmission(payload,user,state.leaveRequests,state.calendar.entries);
      const record={...values,id:newId("leave"),employeeId:user.id,employee:user.name,createdAt:new Date().toISOString()};
      updateStore(next=>{next.leaveRequests.unshift(record);audit(next,user,key,record.id);notifyLeaveChange(next,record,"submitted");});
      return clone(record);
    }
    case "package09.leave.review": {
      if (!["approved", "rejected"].includes(payload.decision)) throw new Error("สถานะการอนุมัติไม่ถูกต้อง");
      const rejectionReason=String(payload.rejectionReason||"").trim();
      if(payload.decision==="rejected" && !rejectionReason)throw new Error("กรุณาระบุเหตุผลที่ไม่อนุมัติการลา");
      if(rejectionReason.length>500)throw new Error("เหตุผลที่ไม่อนุมัติต้องไม่เกิน 500 ตัวอักษร");
      const target=state.leaveRequests.find(row=>row.id===payload.id && row.status==="pending");
      if(!target)throw new Error("คำขอนี้ถูกพิจารณาแล้ว");
      updateStore(next=>{
        const item=next.leaveRequests.find(row=>row.id===payload.id);
        if(item.status!=="pending")throw new Error("คำขอนี้ถูกพิจารณาแล้ว");
        item.status=payload.decision;item.reviewedAt=new Date().toISOString();item.reviewedBy=user.name;
        item.rejectionReason=payload.decision==="rejected"?rejectionReason:"";
        audit(next,user,key,item.id);notifyLeaveChange(next,item,"decided");
      });
      return clone(getStore().leaveRequests.find(row=>row.id===payload.id));
    }
    case "package09.leave.cancel": {
      const target=state.leaveRequests.find(row=>row.id===payload.id);
      assertLeaveCancellation(target,user,payload.reason,bangkokToday());
      updateStore(next=>{const item=next.leaveRequests.find(row=>row.id===payload.id);
        item.previousStatus=item.status;item.status="cancelled";item.cancelledAt=new Date().toISOString();item.cancellationReason=String(payload.reason).trim();
        audit(next,user,key,item.id);notifyLeaveChange(next,item,"cancelled");});
      return clone(getStore().leaveRequests.find(row=>row.id===payload.id));
    }
case "package10.attendance.read": {
      const records=personalAttendanceRows(attendanceRecords(state),user.id);
      const current=records.find(row=>row.date===bangkokToday()) || {date:bangkokToday(),checkIn:'',checkOut:'',lateMinutes:0,earlyLeaveMinutes:0,overtimeMinutes:0,workdayStatus:'unrecorded',absent:false};
      return createAttendanceFixture(payload,{attendance:current,records});
    }
    case "package10.attendance.notifications.read":
      return clone((state.attendanceNotifications || []).map(row=>({id:row.id,createdAt:row.createdAt,title:"มีการแก้ไขเวลาเข้าออก",body:user.role!=="employee" || user.id===row.employeeId ? "Admin แก้ไขข้อมูลของ "+row.employee+" • "+row.date : "Admin แก้ไขข้อมูลเวลาเข้าออกแล้ว กรุณาตรวจสอบข้อมูลล่าสุด",route:user.role==="admin"?"admin":user.role==="executive"?"executive/attendance":"employee/attendance"})));
    case "package10.attendance.manager":
      if (user.role === "employee") throw new Error("ไม่มีสิทธิ์ดูสรุปทีม");
      return clone({ pendingLeaves:state.leaveRequests.filter(row => row.status === "pending").length,
        date:state.attendance.date, source:{ kind:"mock" } });
    case "package11.admin.read":
      return clone({ moduleCount:10, auditCount:state.auditLog.length, employeeCount:state.employees.length, status:"mock", auditLog:state.auditLog });
    case "package11.records.list": {
      if (!Object.hasOwn(RECORD_SCHEMAS, payload.category)) throw new Error("ไม่พบหมวดข้อมูล");
      return clone(rowsFor(state, payload.category));
    }
    case "package11.records.save": {
      const { category, id, values } = payload;
      let data = validateRecord(category, category === "calendar" ? normalizeCalendar(values) : values);
      const existing = rowsFor(state, category).find(row => row.id === id);
      if (id && !existing) throw new Error("ไม่พบรายการที่ต้องการแก้ไข");
      const reason=String(payload.reason || "").trim();
      if(!reason || reason.length>500)throw new Error("กรุณาระบุเหตุผลแก้ไขไม่เกิน 500 ตัวอักษร");
      if(existing && JSON.stringify(existing)!==JSON.stringify(payload.expectedBefore))throw new Error("ข้อมูลเปลี่ยนหลังตรวจสอบ กรุณาโหลดใหม่");
      if(category==='screenEntries' && !existing) {
        if(reason.length<3)throw new Error("กรุณาระบุเหตุผลเพิ่มข้อมูลอย่างน้อย 3 ตัวอักษร");
        if(data.operatorName!==user.name)throw new Error("ผู้บันทึกต้องตรงกับบัญชี Admin ที่เข้าสู่ระบบ");
        if((state.dailyCloses || []).some(row=>row.date===data.date && row.sheetName===data.sheetName && row.closed))throw new Error("ปิดยอดวันและเครื่องนี้แล้ว กรุณาเปิดยอดก่อนเพิ่มข้อมูล");
      }
      if (category === "calendar" && state.calendar.entries.some(row => row.date === data.date && row.group === data.group && row.id !== id)) {
        throw new Error("วันที่และกลุ่มนี้มีรายการแล้ว กรุณาแก้รายการเดิม");
      }
      const ownerName = data.employee || data.operator || data.sender || data.operatorName;
      let owner = state.employees.find(row => row.name === ownerName);
      if(category === "attendance") {
        const directory=[...attendanceRecords(state).map(row=>({id:row.employeeId,name:row.employee,group:row.groups?.[0]})),...state.employees];
        const matches=[...new Map(directory.filter(row=>row.name===data.employee).map(row=>[row.id,row])).values()];
        if(matches.length!==1 || matches[0].active===false)throw new Error("กรุณาเลือกชื่อพนักงานที่ตรงกันเพียงคนเดียว");
        owner=matches[0];
        if(!existing && data.workdayStatus==='present' && !data.checkIn)throw new Error("กรุณาระบุเวลาเข้าสำหรับการลงเวลาแทนเครื่องสแกน");
        if(reason.length<3)throw new Error("กรุณาระบุเหตุผลลงเวลาหรือแก้ไขอย่างน้อย 3 ตัวอักษร");
        if(existing && existing.employeeId!==owner.id)throw new Error("ไม่สามารถเปลี่ยนเจ้าของรายการเวลาเข้าออก");
        if(attendanceRecords(state).some(row=>row.id!==id && row.employeeId===owner.id && row.date===data.date))throw new Error("พนักงานนี้มีรายการวันที่เลือกแล้ว กรุณาแก้ไขรายการเดิม");
      }
      if (category === "leaveRequests") {
        const matches = state.employees.filter(row => existing?.employeeId ? row.id===existing.employeeId && row.name===data.employee : row.name===data.employee);
        if(matches.length!==1 || matches[0].active===false)throw new Error("กรุณาเลือกพนักงานที่ใช้งานและมีชื่อ/รหัสตรงกันเพียงคนเดียว");
        owner = matches[0];
        if(!existing) {
          if(data.status!=="pending")throw new Error("การลาแทนต้องส่งเป็นคำขอรออนุมัติก่อน");
          const groups=owner.calendarGroups || owner.groups || String(owner.group || "").split(/[,，;]+/).map(value=>value.trim()).filter(Boolean);
          data={...data,...validateLeaveSubmission({...data,images:values.images || []},{...owner,calendarGroups:groups},state.leaveRequests,state.calendar.entries,new Date(),{adminProxy:{actor:user,reason}})};
        }
      }
      if (category === "otRequests") {
        const matches=state.employees.filter(row=>row.active!==false && row.role==='employee' && row.name===data.employee);
        if(matches.length!==1)throw new Error("กรุณาเลือกพนักงานที่ใช้งานและมีชื่อไม่ซ้ำกัน");
        owner=matches[0];
        if(existing && existing.employeeId!==owner.id)throw new Error("ไม่สามารถเปลี่ยนเจ้าของรายการ OT เดิม");
      }
      let record = { ...existing, ...data, id:existing?.id || newId(category), updatedAt:new Date().toISOString() };
      if(category==='screenEntries' && !existing)Object.assign(record,{createdAt:record.updatedAt,createdBy:user.id,createdVia:'ADMIN_MANUAL'});
      if(category==='otRequests' && !existing)Object.assign(record,{createdAt:record.updatedAt,createdBy:user.id,createdVia:'ADMIN_PROXY'});
      if(category === "attendance")record=normalizeAttendanceRecord({...record,employeeId:owner.id,employee:owner.name,groups:existing?.groups || [owner.group || "ออฟฟิต"],calculationSource:"admin11"});
      if(category === "attendance" && !existing)Object.assign(record,{createdVia:"MANUAL_ADMIN",createdBy:user.id,createdAt:record.updatedAt});
      if(category === "leaveRequests") {
        if(!existing)Object.assign(record,{createdAt:new Date().toISOString(),createdVia:"ADMIN_PROXY",proxyBy:user.id,proxyReason:reason});
        if(existing && existing.status!==record.status && ["approved","rejected"].includes(record.status))Object.assign(record,{reviewedAt:new Date().toISOString(),reviewedBy:user.name,rejectionReason:record.status==="rejected" ? reason : ""});
      }
      if (["workSessions", "leaveRequests", "deliveries", "production", "screenEntries", "otRequests"].includes(category)) record.employeeId = owner?.id || existing?.employeeId || user.id;
      if(category==='screenEntries' && !existing)record.employeeId=user.id;
      if (category === "workSessions" && !record.endedAt && state.workSessions.some(row => row.employeeId === record.employeeId && !row.endedAt && row.id !== id)) {
        throw new Error("พนักงานนี้มีงานที่กำลังทำอยู่แล้ว");
      }
      if(category === "workSessions" && !record.endedAt && state.workSessions.some(row=>row.machine===record.machine&&!row.endedAt&&row.id!==id))throw new Error("เครื่องจักรกำลังถูกใช้งานอยู่");
      updateStore(next => {
        if (category === "attendance") {
          next.attendanceRecords=attendanceRecords(next).map(row=>({...row}));
          const index=next.attendanceRecords.findIndex(row=>row.id===record.id);
          if(index<0)next.attendanceRecords.push(record);else next.attendanceRecords[index]=record;
          if(record.employeeId==="mock-employee")next.attendance={...record};
        }
        else {
          const rows = category === "calendar" ? next.calendar.entries : next[category];
          const index = rows.findIndex(row => row.id === record.id);
          if (index < 0) rows.unshift(record); else rows[index] = record;
        }
        audit(next, user, category + (existing ? ".edit" : ".create"), record.id);
        Object.assign(next.auditLog[0],{reason,before:existing || null,after:record});
        if(category === "attendance" && (!existing || Object.keys(data).some(key=>JSON.stringify(existing[key])!==JSON.stringify(record[key])))) {
          next.attendanceNotifications ||= [];
          next.attendanceNotifications.unshift({id:"attendance-edit:"+next.auditLog[0].id,employeeId:record.employeeId,employee:record.employee,date:record.date,operation:existing?'edit':'manual-create',createdAt:record.updatedAt});
          next.attendanceNotifications=next.attendanceNotifications.slice(0,200);
        }
        if(category === "leaveRequests" && (!existing || existing.status!==record.status)) {
          const event=record.status==="pending" ? "submitted" : "decided";
          notifyLeaveChange(next,record,event,record.id+":"+event+":"+next.auditLog[0].id);
        }
      });
      return clone(record);
    }
    default: throw new Error("ไม่รู้จัก mock action: " + key);
  }
};
export const mockRequest = createMockApi(authProvider);


