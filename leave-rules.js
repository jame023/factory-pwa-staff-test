const periodMap = {full:{amount:1,label:"เต็มวัน"},morning:{amount:0.5,label:"ครึ่งวันเช้า"},afternoon:{amount:0.5,label:"ครึ่งวันบ่าย"},none:{amount:0,label:"ไม่ลา"}};
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || "") && Number.isFinite(Date.parse(value+"T00:00:00Z")) && new Date(value+"T00:00:00Z").toISOString().slice(0,10)===value;
export const LEAVE_WINDOW_MESSAGE = "ระบบรับคำขอลาเวลา 05:00–21:00 น. (เวลาไทย) เท่านั้น";
export function isLeaveSubmissionOpen(now = new Date()) {
  const time = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone:"Asia/Bangkok", hour:"2-digit", minute:"2-digit", second:"2-digit", hourCycle:"h23"
  }).formatToParts(now).map(part => [part.type,part.value]));
  const seconds = Number(time.hour)*3600 + Number(time.minute)*60 + Number(time.second);
  return seconds >= 18000 && seconds <= 75659;
}
export function enumerateLeaveDates(start,end) {
  if(!validDate(start)||!validDate(end)||start>end)throw new Error("ช่วงวันที่ลาไม่ถูกต้อง");
  const count=(Date.parse(end)-Date.parse(start))/86400000+1;
  if(count>366)throw new Error("ช่วงวันที่ลาต้องไม่เกิน 366 วัน");
  return Array.from({length:count},(_,i)=>new Date(Date.parse(start)+i*86400000).toISOString().slice(0,10));
}
export function storedLeaveItems(row) {
  if(Array.isArray(row.leaveItems))return row.leaveItems;
  const code=Object.keys(periodMap).find(k=>periodMap[k].label===row.period)||"full";
  return enumerateLeaveDates(row.startDate,row.endDate).map(date=>({date,period:code,...periodMap[code]}));
}
export function validateLeaveSubmission(input,user,rows,calendar,now=new Date(),options={}) {
  const proxy = options.adminProxy;
  if(proxy && (proxy.actor?.role!=="admin" || proxy.actor.active===false || !proxy.actor.id || String(proxy.reason || "").trim().length<3 || String(proxy.reason || "").trim().length>300))throw new Error("การลาแทนต้องเป็น Admin และระบุเหตุผล 3–300 ตัวอักษร");
  if(!proxy && !isLeaveSubmissionOpen(now))throw new Error(LEAVE_WINDOW_MESSAGE);
  const groups=(user.calendarGroups || user.groups || []).map(g=>g==="ส่งของ"?"ขนส่ง":g);
  const group=user.primaryWorkGroup || user.workGroup || (groups.length===1 ? groups[0] : "");
  if(!["ผลิต","สกรีน","ขนส่ง","ออฟฟิต"].includes(group) || !groups.includes(group))throw new Error("บัญชีนี้ยังไม่ได้กำหนดกลุ่มงานหลักที่ชัดเจน");
  if(!["ลากิจ","ลาป่วย"].includes(input.type))throw new Error("ประเภทการลาไม่ถูกต้อง");
  const reason=String(input.reason||"").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,"").trim().slice(0,500);
  if(!reason)throw new Error("กรุณากรอกเหตุผลการลา");
  const range=enumerateLeaveDates(input.startDate,input.endDate);
  let items;
  if(Object.hasOwn(input,"dates")) {
    if(!Array.isArray(input.dates)||input.dates.length!==range.length)throw new Error("กรุณากำหนดช่วงลาให้ครบทุกวันที่เลือก");
    const seen=new Set();
    items=input.dates.map(row=>{
      if(!range.includes(row.date)||seen.has(row.date)||!Object.hasOwn(periodMap,row.period))throw new Error("รายละเอียดวันลาซ้ำหรือไม่ถูกต้อง");
      seen.add(row.date);return {date:row.date,period:row.period,...periodMap[row.period]};
    });
  } else {
    const code=Object.keys(periodMap).find(k=>periodMap[k].label===input.period && k!=="none");
    if(!code || code!=="full" && range.length!==1)throw new Error("ครึ่งวันเลือกได้เฉพาะการลาวันเดียว");
    items=range.map(date=>({date,period:code,...periodMap[code]}));
  }
  const calendarMap=new Map(calendar.filter(row=>!row.group||row.group===group).sort((a,b)=>Number(!!a.group)-Number(!!b.group)).map(row=>[row.date,row.status]));
  items=items.filter(row=>row.amount>0 && calendarMap.get(row.date)!=="หยุด").sort((a,b)=>a.date.localeCompare(b.date));
  if(!items.length)throw new Error("วันที่เลือกลาเป็นวันหยุดทั้งหมด หรือกำหนดเป็นไม่ลาทั้งหมด");
  const totalDays=items.reduce((sum,row)=>sum+row.amount,0);
  if(input.type==="ลากิจ"&&totalDays>2)throw new Error("ลากิจได้ไม่เกิน 2 วันต่อครั้ง");
  const occupied=rows.filter(row=>["pending","approved"].includes(row.status));
  if(occupied.some(row=>storedLeaveItems(row).some(day=>items.some(item=>item.date===day.date))))throw new Error("มีผู้ขอลารออนุมัติหรือมีผู้ลาแล้วในวันที่เลือก กรุณาติดต่อออฟฟิตหากต้องการขอลา");
  const images=input.images || [];
  if(!Array.isArray(images)||images.length>5)throw new Error("แนบรูปได้สูงสุด 5 รูป");
  let totalBytes=0;
  const attachments=images.map(image=>{
    if(!["image/jpeg","image/png","image/webp"].includes(image.mimeType)||!Number.isInteger(image.size)||image.size<=0||image.size>1048576)throw new Error("แนบ JPEG/PNG/WebP ขนาดไม่เกิน 1 MB ต่อรูป");
    totalBytes+=image.size;return {name:String(image.name||"รูปแนบ").slice(0,120),mimeType:image.mimeType,size:image.size};
  });
  if(totalBytes>5242880)throw new Error("รูปทั้งหมดต้องไม่เกิน 5 MB");
  const months=new Set(items.map(row=>row.date.slice(0,7)));
  for(const month of months) {
    const existing=occupied.filter(row=>row.employeeId===user.id&&row.type===input.type&&storedLeaveItems(row).some(day=>day.date.startsWith(month)));
    const count=new Set(existing.filter(row=>input.type==="ลากิจ" || !(row.attachments?.length || row.hasMedicalCertificate)).map(row=>row.id)).size;
    if(input.type==="ลากิจ"&&count>=2)throw new Error("ลากิจครบโควตาเดือน "+month+" แล้ว (สูงสุด 2 ครั้งต่อเดือน)");
    if(input.type==="ลาป่วย"&&!attachments.length&&count>=1)throw new Error("ลาป่วยโดยไม่มีใบรับรองแพทย์ครบโควตาเดือน "+month+" แล้ว (สูงสุด 1 ครั้งต่อเดือน)");
  }
  return {type:input.type,reason,startDate:input.startDate,endDate:input.endDate,group,
    period:new Set(items.map(row=>row.label)).size===1?items[0].label:"หลายช่วงเวลา",
    leaveItems:items,totalDays,attachments,hasMedicalCertificate:attachments.length>0,status:"pending"};
}
export function assertLeaveCancellation(row,user,reason,today) {
  if(!row||row.employeeId!==user.id)throw new Error("คุณไม่มีสิทธิ์ยกเลิกคำขอลานี้");
  if(!["pending","approved"].includes(row.status))throw new Error("ยกเลิกได้เฉพาะคำขอที่รออนุมัติหรืออนุมัติแล้ว");
  const last=storedLeaveItems(row).at(-1)?.date;
  if(!last||today>last)throw new Error("ยกเลิกได้ถึงวันสิ้นสุดการลาเท่านั้น");
  if(!String(reason||"").trim()||String(reason).length>500)throw new Error("กรุณาระบุเหตุผลยกเลิกไม่เกิน 500 ตัวอักษร");
}
