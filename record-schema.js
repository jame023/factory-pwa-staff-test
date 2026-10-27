import { bangkokToday } from "./utils.js?v=1.3.186";

const field = (key, label, type = "text", extra = {}) => ({ key, label, type, ...extra });
const required = { required: true };
const nonnegative = { required: true, min: 0, step: 1 };
export const WORK_MACHINES = Object.freeze(["A1", "A2", "B1", "B2", "B3", "C1"]);
export const WORK_TYPES = Object.freeze(["ผลิต", "สกรีน"]);
export const LEAVE_TYPES = Object.freeze(["ลากิจ", "ลาป่วย"]);
export const RECORD_SCHEMAS = {
  employees: { label: "พนักงานและสิทธิ์", fields: [
    field("name", "ชื่อพนักงาน", "text", required),
    field("role", "บทบาท", "select", { options: ["employee", "executive", "admin"], labels: ["พนักงาน", "ผู้บริหาร", "Admin"] }),
    field("group", "กลุ่มงาน", "select", { options: ["สกรีน", "ผลิต", "ขนส่ง", "ออฟฟิต"] }),
    field("active", "สถานะ", "select", { options: ["true", "false"], labels: ["ใช้งาน", "ระงับใช้งาน"] })
  ] },
  attendance: { label: "เวลาเข้าออก", fields: [
    field("employee", "พนักงาน", "text", required),
    field("date", "วันที่", "date", required), field("checkIn", "เวลาเข้า", "time"), field("checkOut", "เวลาออก", "time"),
    field("lateMinutes", "มาสาย (นาที)", "number", {...nonnegative,readOnly:true}),
    field("earlyLeaveMinutes", "ออกก่อน (นาที)", "number", {...nonnegative,readOnly:true}),
    field("overtimeMinutes", "OT (นาที)", "number", {...nonnegative,readOnly:true}),
    field("workdayStatus", "สถานะวันทำงาน", "select", { options: ["present", "leave", "absent", "holiday"] }),
    field("leaveStatus", "รายละเอียดลา", "text", { maxLength:80 }), field("absent", "ขาดงาน", "select", { options: ["false", "true"], labels: ["ไม่ขาด", "ขาด"] })
  ] },
  workSessions: { label: "เริ่มงาน–จบงาน", fields: [
    field("employee", "พนักงาน", "text", required), field("machine", "เครื่องจักร", "select", { ...required, options: WORK_MACHINES }),
    field("workType", "ประเภทงาน", "select", { ...required, options: WORK_TYPES }), field("orderName", "ชื่อออเดอร์"),
    field("quantity", "จำนวน", "number", nonnegative), field("startedAt", "เริ่มงาน", "datetime-local", required),
    field("endedAt", "จบงาน", "datetime-local"), field("note", "หมายเหตุ", "textarea")
  ] },
  leaveRequests: { label: "การลา", fields: [
    field("employee", "พนักงาน", "text", required),
    field("type", "ประเภทลา", "select", { options: LEAVE_TYPES }),
    field("startDate", "วันเริ่มลา", "date", required), field("endDate", "วันสิ้นสุด", "date", required),
    field("period", "ช่วงเวลา", "select", { options: ["เต็มวัน", "ครึ่งวันเช้า", "ครึ่งวันบ่าย"] }),
    field("reason", "เหตุผล", "textarea", required),
    field("status", "สถานะ", "select", { options: ["pending", "approved", "rejected"], labels: ["รออนุมัติ", "อนุมัติแล้ว", "ปฏิเสธ"] })
  ] },
  calendar: { label: "ปฏิทินงาน", fields: [
    field("date", "วันที่", "date", required),
    field("group", "กลุ่มงาน", "select", { options: ["สกรีน", "ผลิต", "ขนส่ง", "ออฟฟิต"] }),
    field("status", "ประเภทวัน", "select", { options: ["เต็มวัน", "ครึ่งวัน", "หยุด"] })
  ] },
  deliveries: { label: "การขนส่ง", fields: [
    field("product", "สินค้า", "text", required),
    field("quantity", "จำนวน", "number", { required: true, min: .01, step: "any" }),
    field("sender", "ผู้ส่ง", "text", required), field("dateTime", "วันที่เวลา", "datetime-local", required),
    field("status", "สถานะ", "select", { options: ["ส่งสำเร็จ", "ยกเลิก"] })
  ] },
  production: { label: "การผลิต", fields: [
    field("date", "วันที่ผลิต", "date", required),
    field("machine", "เครื่อง / กลุ่ม", "select", { options: ["A1", "A2", "C1", "B1", "B2", "B3", "แพ็ค"] }),
    field("quantity", "จำนวนใบ", "number", nonnegative), field("defective", "ของเสีย", "number", nonnegative),
    field("operator", "ผู้บันทึก", "text", required), field("note", "หมายเหตุ", "textarea")
  ] },
  screenEntries: { label: "งานสกรีน", fields: [
    field("date", "วันที่", "date", required),
    field("sheetName", "เครื่องจักร", "select", {options:["สกรีน B1 (แพ็คคอยาว)","สกรีน B2 (คอสั้น)","สกรีน B3 (คอยาว)"]}),
    field("operatorName", "ผู้บันทึก", "text", required),
    field("enteredPack", "จำนวนแพ็คที่ได้ของวันนี้", "number", {min:0,step:"any",nullable:true}),
    field("missingBottles", "จำนวนเสียจากสกรีน", "number", {min:0,step:"any",nullable:true}),
    field("productionDamagedBottles", "จำนวนเสียจากผลิต", "number", {min:0,step:"any",nullable:true}),
    field("note", "หมายเหตุ", "textarea")
  ] },
  otRequests: { label: "ข้อมูล OT", fields: [
    field("employee", "พนักงาน", "text", {required:true}),
    field("date", "วันที่", "date", required), field("hours", "ชั่วโมง OT", "number", {required:true,min:1/60,max:12+59/60,step:"any"}),
    field("details", "รายละเอียดงาน", "textarea", {required:true,maxLength:1000}),
    field("photo", "รูปหลักฐาน (ข้อมูลจำลอง)", "image-data", {maxLength:720000})
  ] }
};

export function validateRecord(category, input = {}) {
  const schema = RECORD_SCHEMAS[category];
  if (!schema) throw new Error("ไม่พบหมวดข้อมูล");
  const output = {};
  for (const spec of schema.fields) {
    let value = String(input[spec.key] ?? "").trim();
    if (spec.required && !value) throw new Error("กรุณาระบุ " + spec.label);
    if (value.length > (spec.maxLength ?? 500)) throw new Error(spec.label + " ยาวเกินกำหนด");
    if (spec.options && !spec.options.includes(value)) throw new Error(spec.label + " ไม่ถูกต้อง");
    if (spec.key === "photo" && value && !/^data:image\/(png|jpeg|webp|gif);base64,/.test(value)) throw new Error(spec.label + " ต้องเป็นรูป PNG, JPG, GIF หรือ WebP");
    if (spec.type === "number") {
      if (spec.nullable && value === "") { output[spec.key] = null; continue; }
      value = Number(value);
      if (!Number.isFinite(value) || value < (spec.min ?? 0) || (spec.step === 1 && !Number.isInteger(value))) {
        throw new Error(spec.label + " ต้องเป็นจำนวนที่ถูกต้อง");
      }
    }
    if (spec.type === "date" && value) {
      const parsed = new Date(value + "T00:00:00Z");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
        throw new Error(spec.label + " ไม่ถูกต้อง");
      }
    }
    if (spec.type === "time" && value && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error(spec.label + " ไม่ถูกต้อง");
    if (spec.type === "datetime-local" && value) {
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) || Number.isNaN(new Date(value).getTime())) throw new Error(spec.label + " ไม่ถูกต้อง");
      value = new Date(value).toISOString();
    }
    if (spec.key === "active" || spec.key === "absent") value = value === "true";
    output[spec.key] = value;
  }
  if (category === "screenEntries" && [output.enteredPack,output.missingBottles,output.productionDamagedBottles].every(value=>value===null)) throw new Error("กรอกจำนวนอย่างน้อยหนึ่งช่อง");
  if (category === "production" && output.defective > output.quantity) throw new Error("ของเสียต้องไม่เกินจำนวนใบ");
  if (category === "otRequests") { const minutes=output.hours*60; if(output.hours>12+59/60 || minutes<1 || Math.abs(minutes-Math.round(minutes))>1e-7) throw new Error("ระยะเวลา OT ต้องอยู่ระหว่าง 00:01 ถึง 12:59 และระบุเป็นนาที"); output.hours=Math.round(minutes)/60; }
  if (category === "leaveRequests" && output.endDate < output.startDate) throw new Error("วันสิ้นสุดต้องไม่ก่อนวันเริ่มลา");
  if (category === "leaveRequests" && output.period !== "เต็มวัน" && output.startDate !== output.endDate) throw new Error("ลาครึ่งวันต้องเป็นวันเดียวกัน");
  if (category === "workSessions" && output.endedAt && output.endedAt < output.startedAt) throw new Error("จบงานต้องไม่ก่อนเริ่มงาน");
  if (category === "attendance" && output.workdayStatus === "absent") output.absent = true;
  if (category === "attendance" && output.absent) output.workdayStatus = "absent";
  return output;
}

export function blankRecord(category) {
  return Object.fromEntries(RECORD_SCHEMAS[category].fields.map(spec => [spec.key,
    spec.options?.[0] ?? (spec.nullable ? "" : spec.type === "date" ? bangkokToday() : spec.type === "number" ? 0 : "")]));
}
