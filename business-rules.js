// Portable rules from inspected legacy sources. No transport, URLs or credentials.
export const WORKDAY_STATUSES = Object.freeze(['เต็มวัน','ครึ่งวัน','หยุด']);
export const GROUPS = Object.freeze(['สกรีน','ผลิต','ขนส่ง','ออฟฟิต']);
export const MAX_PRODUCTION_COUNT=1000000000;
export function text(value,label,max=500,required=false){
  const output=String(value ?? '').trim();
  if(required && !output)throw new Error('กรุณาระบุ'+label);
  if(output.length>max)throw new Error(label+'ยาวเกิน '+max+' ตัวอักษร');
  return output;
}
export function validDay(value){
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') && Number.isFinite(Date.parse(value+'T00:00:00Z')) && new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
}
export function count(value,label,{optional=false,integer=true,max=MAX_PRODUCTION_COUNT}={}){
  if(optional && (value==null || String(value).trim()===''))return null;
  if(!['string','number'].includes(typeof value) || String(value).trim()==='')throw new Error('กรุณาระบุ'+label);
  const output=Number(value);
  if(!Number.isFinite(output)||output<0||output>max||integer&&!Number.isInteger(output))throw new Error(label+'ไม่ถูกต้อง');
  return output;
}
export function requestId(value){
  if(!/^[A-Za-z0-9_-]{12,100}$/.test(value || ''))throw new Error('Request ID ไม่ถูกต้อง');
  return value;
}
export function imageMetadata(images,{required=false,maxImages=5,maxBytes=1048576}={}){
  if(!Array.isArray(images)||images.length>maxImages||required&&!images.length)throw new Error('จำนวนรูปหลักฐานไม่ถูกต้อง');
  return images.map(image=>{
    if(!['image/jpeg','image/png','image/webp'].includes(image.mimeType)||!Number.isInteger(image.size)||image.size<=0||image.size>maxBytes)throw new Error('ชนิดหรือขนาดรูปไม่ถูกต้อง');
    return {name:text(image.name,'ชื่อไฟล์',120),mimeType:image.mimeType,size:image.size};
  });
}
export function primaryGroup(user){
  const groups=[...new Set((user.calendarGroups || user.groups || []).map(value=>value==='ส่งของ'?'ขนส่ง':value))];
  if(groups.some(group=>!GROUPS.includes(group)))throw new Error('กลุ่มงานไม่ถูกต้อง');
  const primary=user.primaryWorkGroup || (groups.length===1 ? groups[0] : '');
  if(!primary||!groups.includes(primary))throw new Error('กรุณากำหนดกลุ่มงานหลักจากกลุ่มสิทธิ์');
  return primary;
}
export function assertActive(user){
  if(!user?.id || !user.name || user.active===false)throw new Error('บัญชีไม่พร้อมใช้งานหรือถูกระงับ');
}
export function normalizeCalendar(entry){
  const status=entry.status==='ทำงาน'?'เต็มวัน':entry.status;
  if(!validDay(entry.date)||!GROUPS.includes(entry.group)||!WORKDAY_STATUSES.includes(status))throw new Error('วันที่ กลุ่มงาน หรือสถานะปฏิทินไม่ถูกต้อง');
  return {...entry,status};
}
export function productionTotals(produced,enteredDefective,pendingAdjustments=[]){
  const quantity=count(produced,'จำนวนผลิต'), entered=count(enteredDefective,'จำนวนเสีย');
  if(quantity<=0)throw new Error('จำนวนผลิตต้องมากกว่า 0');
  const screenDefectiveAdded=pendingAdjustments.reduce((sum,row)=>sum+count(row.amount,'เสียจากสกรีน'),0);
  const defective=entered+screenDefectiveAdded;
  if(defective>quantity)throw new Error('จำนวนเสียรวมต้องไม่เกินจำนวนผลิต');
  return {quantity,enteredDefective:entered,screenDefectiveAdded,defective,good:quantity-defective,defectRate:defective/quantity};
}
export function deliveryValues(input,user){
  if(user.deliveryAccess?.allowed!==true || !user.deliveryAccess.products?.includes(input.product))throw new Error('สินค้าไม่อยู่ในรายการที่ได้รับสิทธิ์');
  const billNumber=text(input.billNumber,'เลขที่บิล',11,true).toUpperCase();
  if(!/^SD\d{9}$/.test(billNumber))throw new Error('เลขที่บิลต้องเป็น SD ตามด้วยตัวเลข 9 หลัก');
  const images=imageMetadata(input.images || [],{required:true,maxImages:10,maxBytes:5*1024*1024});
  return {billNumber,images,note:text(input.note,'หมายเหตุ'),sender:user.name,status:'ส่งสำเร็จ',legacyStatus:'SAVED'};
}
export function assertUndo(record,user,now=Date.now(),windowMs=120000){
  if(!record||record.employeeId!==user.id)throw new Error('รายการนี้ไม่ใช่ของบัญชีนี้');
  if(record.legacyStatus==='UNDONE')throw new Error('รายการถูกยกเลิกแล้ว');
  const savedAt=Date.parse(record.createdAt);
  if(!Number.isFinite(savedAt)||now-savedAt>windowMs||now<savedAt)throw new Error('หมดเวลายกเลิก 2 นาทีแล้ว');
}
export function assertWorkStart(input,user,rows){
  if(rows.some(row=>!row.endedAt&&(row.employeeId===user.id || row.employee===user.name)))throw new Error('มีงานที่ยังไม่จบอยู่แล้ว');
  if(rows.some(row=>!row.endedAt&&row.machine===input.machine))throw new Error('เครื่องจักรกำลังถูกใช้งานอยู่');
  if(input.workType==='สกรีน' && !user.workAccess?.orders?.includes(input.orderName))throw new Error('กรุณาเลือกชื่อออเดอร์ที่ Active จากรายการสิทธิ์');
}
export function assertWorkEnd(row,quantity){
  const value=count(quantity,'จำนวนจบงาน');
  if(row.workType==='สกรีน'&&value<=0)throw new Error('จำนวนสกรีนตอนจบงานต้องเป็นจำนวนเต็มมากกว่า 0');
  return value;
}
const seconds=value=>{
  const match=/^(\d{1,2}):([0-5]\d)(?::([0-5]\d))?$/.exec(value || '');
  return match&&Number(match[1])<24 ? Number(match[1])*3600+Number(match[2])*60+Number(match[3]||0) : -1;
};
// Package03 and Package11 have DIFFERENT extra-OT rules. Keep source explicit.
// Extra-OT eligibility must be supplied by a trusted future backend, never inferred from a frontend name.
export function attendanceCalculation(checkIn,checkOut,{source='rfid03',extraOtEligible=false,voided=false}={}){
  if(!['rfid03','admin11'].includes(source))throw new Error('ต้องระบุแหล่งกฎเวลา');
  if(voided)return {lateMinutes:0,earlyLeaveMinutes:0,overtimeMinutes:0,workdayStatus:'',status:'VOID'};
  const start=seconds(checkIn),end=seconds(checkOut),afternoon=start>=43200;
  const lateMinutes=start>28800 ? Math.ceil((start-28800)/60):0;
  const workdayStatus=afternoon?'ครึ่งวัน':end<0?'':end>=57600?'เต็มวัน':'ครึ่งวัน';
  const earlyLeaveMinutes=end>=57600&&end<61200 ? Math.ceil((61200-end)/60):0;
  let overtimeMinutes=0;
  if(start>=0&&end>start){
    if(end<57600&&!afternoon&&end>43200)overtimeMinutes=Math.ceil((end-43200)/60);
    else if(end>=62400){overtimeMinutes=Math.ceil((end-61200)/60);if(end>=70800)overtimeMinutes-=30;}
  }
  if(extraOtEligible && end>=0 && (source==='rfid03' ? start>=0&&start<25200 : true))overtimeMinutes+=60;
  return {lateMinutes,recordedLateMinutes:afternoon?0:lateMinutes,lateStatus:afternoon?'เข้างานบ่าย':lateMinutes>0?'มาสาย':'',earlyLeaveMinutes,overtimeMinutes:Math.max(0,overtimeMinutes),workdayStatus,status:end>=0?'เลิกงาน':start>=0?'เข้างาน':''};
}
// Package10 monthly overview: missing checkout covers absence, it is not a completed day.
export function monthlyOverview(rows,leaveRows,workdayWeights,today){
  const attendance={},missing={},presence={},leave={};
  for(const row of rows){
    const weight=row.workdayStatus==='เต็มวัน'?1:row.workdayStatus==='ครึ่งวัน'?.5:0;
    if(weight>(attendance[row.date] || 0))attendance[row.date]=weight;
    if(row.checkIn&&!row.checkOut&&!weight)missing[row.date]=true;
    if(row.checkIn||row.checkOut)presence[row.date]=true;
  }
  for(const row of leaveRows){
    if(row.status!=='approved'||!workdayWeights[row.date])continue;
    const maximum=workdayWeights[row.date],weight=Math.min(Number(row.amount)||1,maximum);
    if(weight<maximum&&!presence[row.date])continue;
    leave[row.date]=Math.max(leave[row.date]||0,weight);
  }
  const sum=values=>Object.values(values).reduce((total,value)=>total+value,0);
  const elapsed=Object.keys(workdayWeights).filter(date=>date<=today);
  const elapsedScheduled=elapsed.reduce((total,date)=>total+workdayWeights[date],0);
  const elapsedAttendance=Object.keys(attendance).filter(date=>date<=today).reduce((total,date)=>total+Math.min(attendance[date],workdayWeights[date]||0),0);
  const checkoutCoverage=Object.keys(missing).filter(date=>date<=today&&!attendance[date]).reduce((total,date)=>total+(workdayWeights[date]||0),0);
  const elapsedLeave=Object.keys(leave).filter(date=>date<=today).reduce((total,date)=>total+leave[date],0);
  return {workdays:sum(workdayWeights),attendanceDays:sum(attendance),leaveDays:sum(leave),absenceDays:Math.max(0,elapsedScheduled-elapsedAttendance-checkoutCoverage-elapsedLeave)};
}
