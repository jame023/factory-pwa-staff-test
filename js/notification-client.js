import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './config.js?v=1.3.403';
import { getSupabaseLineAccessToken } from './auth.js?v=1.3.403';
import { decodeVapidKey } from './report-push-subscription.js?v=1.3.403';

const FUNCTION_URL = SUPABASE_URL.replace(/\/+$/, '') + '/functions/v1/factory-notifications';

async function request(path, init = {}, returnResponse = false) {
  const token = getSupabaseLineAccessToken();
  if (!token) throw new Error('SESSION_EXPIRED');
  const response = await fetch(SUPABASE_URL.replace(/\/+$/, '') + path, {
    ...init,
    signal: init.signal || AbortSignal.timeout(15000),
    cache: 'no-store',
    redirect: 'error',
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {})
    }
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch {}
  if (!response.ok) {
    if (response.status === 401) throw new Error('SESSION_EXPIRED');
    if (response.status === 403) throw new Error('ไม่มีสิทธิ์ใช้การแจ้งเตือน');
    if (response.status === 404) throw new Error('ยังไม่ได้ติดตั้งระบบแจ้งเตือนบน Supabase');
    throw new Error('เชื่อมต่อระบบแจ้งเตือนไม่สำเร็จ');
  }
  return returnResponse ? response : data;
}

export async function readUnreadNotificationCount() {
  const params = new URLSearchParams({ select: 'id', read_at: 'is.null' });
  const response = await request('/rest/v1/factory_notification_inbox?' + params, {
    method: 'HEAD', headers: { Prefer: 'count=exact', Range: '0-0' }
  }, true);
  const match = /\/(\d+)$/.exec(response.headers.get('content-range') || '');
  const count = match ? Number(match[1]) : NaN;
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('ตรวจจำนวนแจ้งเตือนไม่สำเร็จ');
  return count;
}

export async function readNotificationInbox(options = 100) {
  const input=typeof options==='number'?{limit:options}:options;
  const params=new URLSearchParams({select:'id,kind,title,body,route,data,created_at,read_at',order:'created_at.desc,id.desc',limit:String(Math.max(1,Math.min(100,Number(input.limit)||25)))});
  if(input.kind)params.set('kind','eq.'+input.kind);
  for(const key of ['from','to'])if(input[key]&&!/^\d{4}-\d{2}-\d{2}$/.test(input[key]))throw new Error('วันที่ไม่ถูกต้อง');
  if(input.from)params.append('created_at','gte.'+input.from+'T00:00:00+07:00');
  if(input.to){const end=new Date(input.to+'T00:00:00+07:00');end.setUTCDate(end.getUTCDate()+1);params.append('created_at','lt.'+end.toISOString());}
  if(input.before){const {created_at,id}=input.before;if(!/^[0-9a-f-]{36}$/i.test(id)||!Number.isFinite(Date.parse(created_at)))throw new Error('ตัวแบ่งหน้าไม่ถูกต้อง');const stamp=new Date(created_at).toISOString();params.set('or',`(created_at.lt.${stamp},and(created_at.eq.${stamp},id.lt.${id}))`);}
  const rows=await request('/rest/v1/factory_notification_inbox?'+params);
  if(!Array.isArray(rows))throw new Error('รูปแบบรายการแจ้งเตือนไม่ถูกต้อง');
  return rows;
}

export function withNotificationTimeout(promise,ms=8000) {
  let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('ระบบแจ้งเตือนยังไม่พร้อม กรุณาลองอีกครั้ง')),ms);})]).finally(()=>clearTimeout(timer));
}
async function readyRegistration(){
  return withNotificationTimeout(navigator.serviceWorker.ready);
}

export async function markNotificationRead(id) {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error('NOTIFICATION_ID_INVALID');
  const params = new URLSearchParams({ id: 'eq.' + id, select: 'id,read_at' });
  const rows = await request('/rest/v1/factory_notification_inbox?' + params, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ read_at: new Date().toISOString() })
  });
  if (!Array.isArray(rows) || rows.length !== 1) throw new Error('ไม่พบรายการแจ้งเตือน');
  globalThis.dispatchEvent?.(new Event('factory-notification-inbox-changed'));
  return rows[0];
}

export async function summarizeCalendarChanges(recordIds) {
  if (!Array.isArray(recordIds) || recordIds.length < 1 || recordIds.length > 366 || recordIds.some(id => typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id))) {
    throw new Error('ข้อมูลปฏิทินสำหรับสรุปไม่ถูกต้อง');
  }
  return await rpc('factory_notification_calendar_summary', { p_record_ids: recordIds });
}

async function rpc(name, body) {
  return request('/rest/v1/rpc/' + name, { method: 'POST', body: JSON.stringify(body) });
}

function subscriptionBody(subscription) {
  const json = subscription?.toJSON?.();
  if (!json?.endpoint || !json?.keys?.p256dh || !json?.keys?.auth) throw new Error('PUSH_SUBSCRIPTION_INVALID');
  return json;
}

export async function enableDeviceNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in globalThis) || !('Notification' in globalThis)) {
    throw new Error('อุปกรณ์หรือเบราว์เซอร์นี้ยังไม่รองรับการแจ้งเตือนเมื่อปิดแอป');
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { status: 'permission_not_granted' };
  const registration = await readyRegistration();
  const publicKeyResponse = await fetch(FUNCTION_URL + '?action=vapid-public-key', {
    method: 'GET',
    signal: AbortSignal.timeout(10000),
    cache: 'no-store',
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY },
    redirect: 'error'
  });
  if (!publicKeyResponse.ok) throw new Error('ไม่สามารถเตรียมการแจ้งเตือนบนอุปกรณ์ได้');
  const { publicKey } = await publicKeyResponse.json();
  const applicationServerKey = decodeVapidKey(publicKey);
  let subscription = await withNotificationTimeout(registration.pushManager.getSubscription());
  let created = false;
  if (!subscription) {
    subscription = await withNotificationTimeout(registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey }),15000);
    created = true;
  }
  try {
    const json = subscriptionBody(subscription);
    await rpc('factory_notification_push_save', {
      p_endpoint: json.endpoint,
      p_p256dh: json.keys.p256dh,
      p_auth_key: json.keys.auth
    });
  } catch (error) {
    if (created) await withNotificationTimeout(subscription.unsubscribe(),15000).catch(() => {});
    throw error;
  }
  return { status: 'enabled' };
}

export async function disableDeviceNotifications() {
  if (!('serviceWorker' in navigator)) throw new Error('อุปกรณ์นี้ยังไม่รองรับการแจ้งเตือน');
  const registration = await readyRegistration();
  const subscription = await withNotificationTimeout(registration.pushManager?.getSubscription());
  if (!subscription) return { status: 'already_disabled' };
  await rpc('factory_notification_push_remove', { p_endpoint: subscription.endpoint });
  if (!await withNotificationTimeout(subscription.unsubscribe(),15000)) throw new Error('ปิดการแจ้งเตือนบนอุปกรณ์ไม่สำเร็จ');
  return { status: 'disabled' };
}

export async function readDeviceNotificationState() {
  if (!('serviceWorker' in navigator) || !('PushManager' in globalThis) || !('Notification' in globalThis)) {
    return { supported: false, enabled: false, permission: 'unsupported' };
  }
  const registration=await withNotificationTimeout(navigator.serviceWorker.getRegistration());
  if(!registration?.active)return {supported:true,enabled:false,permission:Notification.permission,ready:false};
  const subscription=await withNotificationTimeout(registration.pushManager.getSubscription());
  let registered=false;
  if(subscription&&Notification.permission==='granted')registered=await withNotificationTimeout(rpc('factory_notification_push_status',{p_endpoint:subscription.endpoint}));
  return {supported:true,enabled:Boolean(subscription)&&registered===true&&Notification.permission==='granted',permission:Notification.permission,ready:true};
}
