import { MOCK_STORAGE_KEY } from './config.js?v=1.3.186';
export function notificationReadKey(userId) {
  if(typeof userId!=='string' || !userId.trim())throw new Error('ไม่พบบัญชีสำหรับรับทราบแจ้งเตือน');
  return MOCK_STORAGE_KEY+':notice-read:'+encodeURIComponent(userId);
}
const validId=id=>typeof id==='string' && id.length>0 && id.length<=512;
export function readAcknowledgedIds(userId,storage=globalThis.localStorage) {
  const raw=storage?.getItem(notificationReadKey(userId));
  if(!raw)return new Set();
  try {const saved=JSON.parse(raw);return new Set(saved.version===1 && Array.isArray(saved.ids) ? saved.ids.filter(validId) : []);}
  catch {return new Set();}
}
export function acknowledgeNotifications(userId,ids,storage=globalThis.localStorage) {
  if(!storage?.getItem || !storage?.setItem)throw new Error('ไม่สามารถบันทึกสถานะรับทราบในเบราว์เซอร์นี้ได้');
  if(!Array.isArray(ids) || ids.some(id=>!validId(id)))throw new Error('รายการแจ้งเตือนไม่ถูกต้อง');
  const merged=readAcknowledgedIds(userId,storage);
  ids.forEach(id=>merged.add(id));
  // Producers retain at most 600 live events. Keep ample history without caching message contents.
  const saved=[...merged].slice(-2000);
  storage.setItem(notificationReadKey(userId),JSON.stringify({version:1,ids:saved}));
  return new Set(saved);
}
