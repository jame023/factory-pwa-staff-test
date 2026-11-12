import { validDay } from './business-rules.js?v=1.3.186';
export const REPORT_KINDS=Object.freeze({daily:'สรุปรายวัน',weekly:'สรุปรายสัปดาห์',outstanding:'พนักงานดีเด่น'});
const metricKeys=['present','late','leave','absent','production','delivery'];
const plain=(value,max)=>{
  if(typeof value!=='string'||!value.trim()||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))throw new Error('ข้อความรายงานไม่ถูกต้อง');
  return value.trim();
};
// Wire shape only. Authentication and delivery are separate future backend responsibilities.
export function normalizeReportEnvelope(input){
  if(!input||input.schemaVersion!==1||!Object.hasOwn(REPORT_KINDS,input.kind))throw new Error('ชนิดหรือเวอร์ชันรายงานไม่ถูกต้อง');
  if(!['mock','google-apps-script'].includes(input.source)||input.timeZone!=='Asia/Bangkok')throw new Error('แหล่งหรือเขตเวลารายงานไม่ถูกต้อง');
  const eventId=plain(input.eventId,120);
  if(!/^[A-Za-z0-9:_-]+$/.test(eventId))throw new Error('Event ID ไม่ถูกต้อง');
  const startDate=input.period?.startDate,endDate=input.period?.endDate;
  if(!validDay(startDate)||!validDay(endDate)||startDate>endDate||Date.parse(endDate)-Date.parse(startDate)>365*86400000)throw new Error('ช่วงรายงานไม่ถูกต้อง');
  if(input.kind==='daily'&&startDate!==endDate)throw new Error('รายวันต้องเป็นวันเดียวกัน');
  if(input.kind==='weekly'&&Date.parse(endDate)-Date.parse(startDate)>6*86400000)throw new Error('รายสัปดาห์ต้องไม่เกิน 7 วัน');
  if(typeof input.generatedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(input.generatedAt)||!Number.isFinite(Date.parse(input.generatedAt)))throw new Error('เวลาสร้างรายงานไม่ถูกต้อง');
  const metrics={};
  for(const key of metricKeys){const value=input.metrics?.[key]??null;if(value!==null&&(typeof value!=='number'||!Number.isFinite(value)||value<0||value>1e12))throw new Error('ตัวเลขรายงานไม่ถูกต้อง');metrics[key]=value;}
  const sections=input.sections??[];
  if(!Array.isArray(sections)||sections.length>20)throw new Error('รายละเอียดรายงานมากเกินกำหนด');
  const winners=input.winners??[];
  if(!Array.isArray(winners)||winners.length>20)throw new Error('รายชื่อพนักงานดีเด่นไม่ถูกต้อง');
  return {schemaVersion:1,eventId,kind:input.kind,source:input.source,timeZone:'Asia/Bangkok',title:plain(input.title,160),
    period:{startDate,endDate},generatedAt:new Date(input.generatedAt).toISOString(),metrics,
    sections:sections.map(section=>{if(!Array.isArray(section.lines)||section.lines.length>30)throw new Error('รายละเอียดหัวข้อไม่ถูกต้อง');return {title:plain(section.title,160),lines:section.lines.map(line=>plain(line,1000))};}),
    winners:winners.map(winner=>({name:plain(winner.name,100),reason:plain(winner.reason,500)})),
    rulesVersion:plain(input.rulesVersion,100)};
}
export function createMockReport(kind,today){
  if(!Object.hasOwn(REPORT_KINDS,kind)||!validDay(today))throw new Error('ชนิดรายงานหรือวันที่ไม่ถูกต้อง');
  const date=new Date(today+'T00:00:00Z');date.setUTCDate(date.getUTCDate()-((date.getUTCDay()+6)%7));
  const startDate=kind==='daily'?today:date.toISOString().slice(0,10);
  return normalizeReportEnvelope({schemaVersion:1,eventId:'mock:report:'+kind+':'+startDate+':'+today,kind,source:'mock',timeZone:'Asia/Bangkok',
    title:REPORT_KINDS[kind]+' • ตัวอย่างจำลอง',period:{startDate,endDate:today},generatedAt:new Date().toISOString(),
    metrics:kind==='outstanding'?{}:{present:18,late:2,leave:1,absent:0,production:1240,delivery:7},
    sections:[{title:'รายละเอียดตัวอย่าง',lines:['รายงานนี้จำลองช่องทางรับจาก Google เท่านั้น ไม่ใช่ผลจากชีตจริง','เมื่อเชื่อมจริง ใช้รายงานและกฎจาก Package 06 เดิม ไม่จัดอันดับใหม่ใน PWA']}],
    winners:kind==='outstanding'?[{name:'พนักงานตัวอย่าง',reason:'ตัวอย่างผลที่ Backend ส่งมา • ยังไม่ได้ประเมินด้วยกฎจริง'}]:[],rulesVersion:'mock-preview-only'});
}
export function acceptMockReport(next,input){
  const report=normalizeReportEnvelope(input);
  if(report.source!=='mock')throw new Error('V1 รับเฉพาะรายงานจำลอง ยังไม่เปิดรับ Google จริง');
  next.reportInbox ||= [];
  const existing=next.reportInbox.find(row=>row.eventId===report.eventId);
  if(existing){
    const comparable=value=>{const {generatedAt,...content}=normalizeReportEnvelope(value);return JSON.stringify(content);};
    if(comparable(existing)!==comparable(report))throw new Error('Event ID ซ้ำแต่เนื้อหารายงานต่างกัน');
    return {...existing,duplicate:true};
  }
  const record={...report,receivedAt:new Date().toISOString(),deliveryState:'accepted-local-mock'};
  next.reportInbox.unshift(record);next.reportInbox=next.reportInbox.slice(0,100);
  return record;
}
export function reportNotice(report){
  return {id:'report:'+report.eventId,source:'mock',createdAt:report.receivedAt,title:report.title,
    body:report.period.startDate+' – '+report.period.endDate+'\nมีรายงานใหม่ในหมวดสรุป (จำลอง)',route:'executive/reports'};
}
