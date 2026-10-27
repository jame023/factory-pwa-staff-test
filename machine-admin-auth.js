import { verifySession, revokeSession } from './session-manager.js?v=1.3.205';
import { authProvider, getSupabaseLineAccessToken } from './auth.js?v=1.3.205';
import { APP_MODE, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_LINE_PROVIDER } from './config.js?v=1.3.186';
import { startPkceOAuth, completePkceOAuth } from './pkce-oauth.js?v=1.3.186';

const SESSION_KEY = 'factory-pwa-machine-supabase-session-v1';

const RETURN_HASH_KEY = 'factory-pwa-machine-return-hash-v1';
let machineSessionPromise = null;

function claimsFrom(token) {
  const part = token.split('.')[1]?.replace(/-/g, '+').replace(/_/g, '/');
  if (!part) throw new Error('Supabase access token ไม่ถูกต้อง');
  return JSON.parse(decodeURIComponent(Array.from(atob(part.padEnd(Math.ceil(part.length / 4) * 4, '=')))
    .map(char => '%' + char.charCodeAt(0).toString(16).padStart(2, '0')).join('')));
}

async function authRequest(path, body, token) {
  const response = await fetch(new URL(path, SUPABASE_URL), { method:'POST', cache:'no-store',
    headers:{ apikey:SUPABASE_PUBLISHABLE_KEY, 'Content-Type':'application/json', ...(token ? { Authorization:`Bearer ${token}` } : {}) },
    body:JSON.stringify(body) });
  const value = await response.json().catch(() => null);
  if (!response.ok) throw new Error(value?.msg || value?.message || 'เชื่อมต่อ Supabase Auth ไม่สำเร็จ');
  return value;
}

async function loadMachineAdminSession() {
  const callback = await completePkceOAuth({ supabaseUrl:SUPABASE_URL, publishableKey:SUPABASE_PUBLISHABLE_KEY });
  if (callback?.error) throw new Error(callback.error);
  let saved = callback?.accessToken ? callback : null;
  if (!saved) {
    try { saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch (_) { saved = null; }
  }
  if (!saved?.accessToken) return null;
  let claims = claimsFrom(saved.accessToken);
  if (Number(claims.exp) * 1000 < Date.now() + 60000) {
    if (!saved.refreshToken) throw new Error('Session หมดอายุและไม่มี refresh token กรุณาเข้าสู่ระบบ LINE ใหม่');
    const refreshed = await authRequest('/auth/v1/token?grant_type=refresh_token', { refresh_token:saved.refreshToken });
    saved = { accessToken:refreshed.access_token, refreshToken:refreshed.refresh_token,
      expiresAt:Date.now() + Number(refreshed.expires_in || 3600) * 1000 };
    claims = claimsFrom(saved.accessToken);
  }
  const role = claims.app_metadata?.role;
  const employeeId = claims.app_metadata?.employee_id;
  if (!['admin','employee','executive'].includes(role) || typeof employeeId !== 'string' || !employeeId) {
    sessionStorage.removeItem(SESSION_KEY);
    throw new Error('บัญชี LINE นี้ยังไม่มีสิทธิ์ใน Factory PWA');
  }
  const response = await fetch(new URL('/auth/v1/user', SUPABASE_URL), {
    headers:{ apikey:SUPABASE_PUBLISHABLE_KEY, Authorization:`Bearer ${saved.accessToken}` }, cache:'no-store' });
  const authUser = await response.json().catch(() => null);
  if (!response.ok || !(authUser?.identities || []).some(identity => identity.provider === SUPABASE_LINE_PROVIDER)) {
    sessionStorage.removeItem(SESSION_KEY);
    throw new Error('ไม่พบ LINE identity ที่เชื่อมกับ Factory PWA');
  }
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(saved));
  const returnHash = sessionStorage.getItem(RETURN_HASH_KEY);
  if (returnHash) { sessionStorage.removeItem(RETURN_HASH_KEY); history.replaceState(null, '', location.pathname + returnHash); }
  return { accessToken:saved.accessToken,
    user:{ id:employeeId, authUserId:authUser.id,
      name:authUser.user_metadata?.name || authUser.user_metadata?.full_name || 'ผู้ใช้ LINE',
      role, groups:[], calendarGroups:[], accessGroups:[], active:true } };
}

export async function loginToMachineAdmin() {
  if(APP_MODE==='supabase-line')return authProvider.login();
  machineSessionPromise = null;
  sessionStorage.setItem(RETURN_HASH_KEY, location.hash || '#/admin/machines');
  await startPkceOAuth({ supabaseUrl:SUPABASE_URL, provider:SUPABASE_LINE_PROVIDER,
    redirectTo:location.origin + location.pathname + (location.hash || "#/admin/machines") });
}

export async function logoutFromMachineAdmin(accessToken) {
  if(APP_MODE==='supabase-line')return revokeSession('logout');
  machineSessionPromise = null;
  sessionStorage.removeItem(SESSION_KEY);
  if (accessToken) await authRequest('/auth/v1/logout', {}, accessToken);
}

export function getMachineAdminSession() {
  if(APP_MODE==='supabase-line')return (async()=>{
    const current=await verifySession();
    if(!current?.authenticated)return null;
    if(current.user.role!=='admin')throw Object.assign(new Error('ไม่มีสิทธิ์ดำเนินการ'),{code:'PERMISSION_DENIED',status:403});
    const accessToken=getSupabaseLineAccessToken();
    if(!accessToken)throw Object.assign(new Error('Session หมดอายุ'),{code:'SESSION_EXPIRED',status:401});
    return {accessToken,user:current.user};
  })();
  if (!machineSessionPromise) {
    // Keep the result through route re-renders. Otherwise a callback failure can be replaced by a second read after its one-time PKCE code was consumed.
    machineSessionPromise = loadMachineAdminSession();
  }
  return machineSessionPromise;
}

