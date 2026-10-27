import { escapeHtml } from './utils.js?v=1.3.186';
const assets=Object.freeze({submitted:'leave-notice-pending.svg',approved:'leave-notice-approved.svg',rejected:'leave-notice-rejected.svg',cancelled:'leave-notice-cancelled.svg'});
export function canReadLeaveNotice(row,user){
  if(!user?.id||user.active===false||!['employee','executive','admin'].includes(user.role)||!['submitted','decided','cancelled'].includes(row.event))return false;
  const manager=['executive','admin'].includes(user.role);
  const office=user.role==='employee'&&(user.calendarGroups || user.groups || []).includes('ออฟฟิต');
  return row.event==='submitted'?manager:manager||office||row.employeeId===user.id;
}
// A real producer may supply ONLY an opaque private asset identifier, never a Drive/public URL.
export function normalizeLeaveMedia(value,{mock=false}={}){
  if(!value||typeof value.assetId!=='string'||!/^[A-Za-z0-9_-]{1,120}$/.test(value.assetId))throw new Error('รหัสรูปแจ้งผลไม่ถูกต้อง');
  const types=mock?['image/svg+xml','image/png','image/jpeg','image/webp']:['image/png','image/jpeg','image/webp'];
  if(!types.includes(value.mimeType))throw new Error('ชนิดรูปแจ้งผลไม่ถูกต้อง');
  return {assetId:value.assetId,mimeType:value.mimeType};
}
export function leaveMediaPreview(row){
  if(row.source!=='mock'||!row.media)return null;
  const media=normalizeLeaveMedia(row.media,{mock:true});
  if(media.assetId!=='mock-leave-status-card')return null;
  const status=row.event==='submitted'?'submitted':row.event==='cancelled'?'cancelled':row.status;
  if(!Object.hasOwn(assets,status))return null;
  return {src:'./assets/previews/'+assets[status],alt:'รูปตัวอย่างแจ้งสถานะการลา • ไม่ใช่รูปจาก Apps Script จริง'};
}
export function renderLeaveMedia(preview){
  if(!preview||!Object.values(assets).some(file=>preview.src==='./assets/previews/'+file))return '';
  return '<details class="leave-notice-media"><summary>ดูรูปแจ้งสถานะการลา (ตัวอย่าง)</summary><figure><img src="'+escapeHtml(preview.src)+'" alt="'+escapeHtml(preview.alt)+'" width="720" height="380" loading="lazy"><figcaption>ภาพจำลอง • ยังไม่เชื่อมรูปจาก Apps Script</figcaption></figure><p class="help-text">หากรูปไม่แสดง สามารถอ่านสถานะและวันที่จากข้อความแจ้งเตือนได้</p></details>';
}
