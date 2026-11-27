// Only Supabase session data and a short-lived PKCE verifier are stored here.
// LINE provider tokens are never persisted.
// Encryption at rest does not protect against malicious same-origin JavaScript.
const DATABASE = 'factory-pwa-session-v1';
const STORE = 'vault';
let opening;
function database() {
  opening ||= new Promise((resolve,reject) => {
    const request = indexedDB.open(DATABASE,1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('เปิดที่เก็บ Session ไม่สำเร็จ'));
  });
  return opening;
}
async function read(key) {
  const db = await database();
  return new Promise((resolve,reject) => {
    const tx = db.transaction(STORE,'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function write(entries) {
  const db = await database();
  return new Promise((resolve,reject) => {
    const tx = db.transaction(STORE,'readwrite');
    for (const [key,value] of entries) value === undefined ? tx.objectStore(STORE).delete(key) : tx.objectStore(STORE).put(value,key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('บันทึก Session ไม่สำเร็จ'));
  });
}
export async function saveSession(session) {
  const key = await read('key') || await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(JSON.stringify(session)));
  await write([['key',key],['session',{iv,ciphertext}]]);
}
export async function loadSession() {
  const [key,saved] = await Promise.all([read('key'),read('session')]);
  if (!key || !saved) return null;
  try { return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:saved.iv},key,saved.ciphertext))); }
  catch (_) { await deleteSession(); return null; }
}
export async function deleteSession() { await write([['session',undefined],['key',undefined]]); }
export async function saveOAuthAttempt(attempt) {
  const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(JSON.stringify(attempt)));
  await write([['oauth-key',key],['oauth-attempt',{iv,ciphertext}]]);
}
export async function loadOAuthAttempt() {
  const [key,saved]=await Promise.all([read('oauth-key'),read('oauth-attempt')]);
  if(!key||!saved)return null;
  try {return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:saved.iv},key,saved.ciphertext)));}
  catch {await deleteOAuthAttempt();return null;}
}
export async function deleteOAuthAttempt(){await write([['oauth-key',undefined],['oauth-attempt',undefined]]);}
export function withOAuthLock(action) {
  if(!navigator.locks)throw new Error('เบราว์เซอร์นี้ไม่รองรับการยืนยัน LINE กรุณาเปิดด้วย Chrome รุ่นล่าสุด');
  return navigator.locks.request('factory-pwa-oauth',action);
}
export function withSessionLock(action) {
  // Do not rotate persistent credentials without cross-tab serialization.
  if (!navigator.locks) throw new Error('Browser รุ่นนี้ไม่รองรับการเก็บ Session อย่างปลอดภัย กรุณาอัปเดต Browser');
  return navigator.locks.request('factory-pwa-session',action);
}
