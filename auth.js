import { loadSession, deleteSession, withSessionLock } from './session-vault.js?v=1.3.191';
import { getAuthClient } from './supabase-auth-client.js?v=1.3.205';
import { APP_MODE, MOCK_USERS, ROLE_LABELS, MOCK_SESSION_ROLE, MOCK_SESSION_GROUP, LINE_LIFF_ID, API_BASE_URL,
  SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_LINE_PROVIDER } from "./config.js?v=1.3.186";
import { startPkceOAuth, completePkceOAuth } from "./pkce-oauth.js?v=1.3.186";

import { requestReadOnly } from "./read-only-api.js?v=1.3.186";
import { normalizeRole, normalizeGroup } from "./permissions.js?v=1.3.186";
import { ACTIVE_DIRECTORY_NAMES, DIRECTORY_SNAPSHOT_DATE } from './directory-snapshot.js?v=1.3.186';
import { getStore } from './state.js?v=1.3.186';

const MOCK_LOGIN_KEY = "factory-pwa-demo-login-v1";
const LINE_SIGNED_OUT_KEY = "factory-pwa-line-signed-out-v1";
const SESSION_ROLES = new Set(["employee", "executive", "admin"]);
const SESSION_GROUPS = new Set(["ผลิต", "สกรีน", "ขนส่ง", "ออฟฟิต"]);
const SUPABASE_SESSION_KEY = "factory-pwa-line-supabase-session-v1";
let liffPromise;

export class AuthProvider {
  async getSession() { throw new Error("AuthProvider.getSession must be implemented"); }
  async login() { throw new Error("AuthProvider.login must be implemented"); }
  async logout() { throw new Error("AuthProvider.logout must be implemented"); }
  async setRole() { throw new Error("Role switching is available only in mock auth"); }
}

export class MockAuthProvider extends AuthProvider {
  constructor(role = MOCK_SESSION_ROLE, group = null) {
    super();
    const user = MOCK_USERS.find(item => item.role === role);
    if (!user) throw new Error("ไม่พบบทบาทสำหรับเซสชันทดสอบ");
    const canonicalGroup = normalizeGroup(group);
    const previewGroups = role === "employee" && SESSION_GROUPS.has(canonicalGroup) ? [canonicalGroup] : (user.groups || []).map(normalizeGroup);
    Object.defineProperty(this, "user", { value:Object.freeze({ ...user,
      directorySnapshotDate:DIRECTORY_SNAPSHOT_DATE,
      workAccess:Object.freeze({orders:Object.freeze(role==='admin' || previewGroups.includes('สกรีน') ? [...ACTIVE_DIRECTORY_NAMES] : [])}),
      deliveryAccess:Object.freeze({allowed:role==='admin' || previewGroups.includes('ขนส่ง'),products:Object.freeze(role==='admin' || previewGroups.includes('ขนส่ง') ? [...ACTIVE_DIRECTORY_NAMES] : [])}),
      groups:Object.freeze([...previewGroups]), calendarGroups:Object.freeze([...new Set(previewGroups
        .filter(value => SESSION_GROUPS.has(value)))]) }), writable:false });
  }
  async getSession() {
    if (localStorage.getItem(MOCK_LOGIN_KEY) !== "1") return null;
    const stored = getStore().employees.find(person=>person.id===this.user.id);
    const edited = !!stored?.updatedAt;
    const role = edited ? normalizeRole(stored.role) : this.user.role;
    const groups = edited ? [...new Set(String(stored.group || '').split(/[,，;]+/).map(value=>normalizeGroup(value.trim())).filter(Boolean))] : [...this.user.groups];
    const user = { ...this.user, role, groups, calendarGroups:groups.filter(value=>SESSION_GROUPS.has(value)),
      active:stored?.active!==false, name:edited ? stored.name : this.user.name,
      workAccess:{orders:role==='admin' || groups.includes('สกรีน') ? [...ACTIVE_DIRECTORY_NAMES] : []},
      deliveryAccess:{allowed:role==='admin' || groups.includes('ขนส่ง'),products:role==='admin' || groups.includes('ขนส่ง') ? [...ACTIVE_DIRECTORY_NAMES] : []} };
    if (user.active === false) return null;
    return { user, provider: "development-mock", label: ROLE_LABELS[role] };
  }
  async login() {
    localStorage.setItem(MOCK_LOGIN_KEY, "1");
    const session = await this.getSession();
    if (!session) throw new Error("บัญชีตัวอย่างถูกปิดใช้งาน");
    return session;
  }
  async logout() { localStorage.removeItem(MOCK_LOGIN_KEY); }
  async setRole() { throw new Error("เซสชันนี้ล็อกบทบาทไว้ ไม่สามารถเปลี่ยนสิทธิ์จากหน้าแอปได้"); }
}

export class DevelopmentAuthProvider extends AuthProvider {
  async getSession() {
    const session = await requestReadOnly("session", "read");
    if (session.provider !== "development-fixture" || !["employee","manager"].includes(session.user?.role) ||
        typeof session.user.id !== "string" || typeof session.user.name !== "string" ||
        !session.user.id.startsWith("fixture-") || session.user.name.length > 100) {
      throw new Error("เซสชัน API ทดสอบไม่ถูกต้อง");
    }
    const role = normalizeRole(session.user.role);
    return { user: { id:session.user.id, name:session.user.name, role },
      provider:session.provider, label:ROLE_LABELS[role] };
  }
  async login() { return this.getSession(); }
  async logout() { throw new Error("ออกจากระบบบัญชีทดสอบโดยปิดเซิร์ฟเวอร์ทดสอบ"); }
}

function authApiUrl(path) {
  const base = new URL(API_BASE_URL || "./api/v1/", globalThis.location.href);
  if (base.origin !== globalThis.location.origin || base.search || base.hash || base.username || base.password) {
    throw new Error("ที่อยู่บริการยืนยันตัวตนไม่ถูกต้อง");
  }
  return new URL(path, base);
}

function validateServerSession(envelope) {
  const user = envelope?.ok === true ? envelope.data?.user : null;
  if (!user || typeof user.id !== "string" || !user.id || user.id.length > 160 ||
      typeof user.name !== "string" || !user.name.trim() || user.name.length > 100) {
    throw new Error("ข้อมูลบัญชีที่ยืนยันแล้วไม่ถูกต้อง");
  }
  const role = normalizeRole(user.role);
  if (!SESSION_ROLES.has(role) || user.active === false) throw new Error("บัญชีนี้ยังไม่มีสิทธิ์เข้าใช้งาน");
  const groups = Array.isArray(user.groups) ? [...new Set(user.groups.filter(value => typeof value === "string")
    .map(normalizeGroup).filter(value => SESSION_GROUPS.has(value)))] : [];
  const allowedProducts = values => Array.isArray(values) ? values.filter(value=>typeof value==="string" && value.length<=120) : [];
  return { user:{ id:user.id, name:user.name.trim(), role, groups,
    calendarGroups:Array.isArray(user.calendarGroups) ? user.calendarGroups.map(normalizeGroup).filter(value=>SESSION_GROUPS.has(value)) : groups,
    workAccess:{orders:allowedProducts(user.workAccess?.orders)},
    deliveryAccess:{allowed:user.deliveryAccess?.allowed===true, products:allowedProducts(user.deliveryAccess?.products)},
    active:true }, provider:"line-session", label:ROLE_LABELS[role] };
}

async function loadLiff() {
  if (!LINE_LIFF_ID) throw new Error("ยังไม่ได้ตั้งค่า LIFF สำหรับ PWA");
  if (globalThis.liff) return globalThis.liff;
  liffPromise ||= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://static.line-scdn.net/liff/edge/versions/2.31.1/sdk.js";
    script.async = true;
    script.onload = () => globalThis.liff ? resolve(globalThis.liff) : reject(new Error("โหลดบริการ LINE ไม่สำเร็จ"));
    script.onerror = () => reject(new Error("เชื่อมต่อบริการ LINE ไม่สำเร็จ"));
    document.head.append(script);
  });
  return liffPromise;
}

export class LineLiffAuthProvider extends AuthProvider {
  async backendSession() {
    const response = await fetch(authApiUrl("session"), { method:"GET", credentials:"same-origin", cache:"no-store",
      redirect:"error", headers:{ Accept:"application/json" } });
    if (response.status === 401) return null;
    if (!response.ok) throw new Error(response.status === 404 ? "backend ยืนยันตัวตนยังไม่พร้อมใช้งาน" : "ตรวจสอบเซสชันไม่สำเร็จ");
    const envelope = await response.json().catch(() => null);
    return validateServerSession(envelope);
  }
  async exchangeLineToken(liff) {
    const idToken = liff.getIDToken();
    if (typeof idToken !== "string" || !idToken || idToken.length > 10000) throw new Error("ไม่พบ LINE ID token กรุณาเข้าสู่ระบบ LINE ใหม่");
    const response = await fetch(authApiUrl("auth/line/session"), { method:"POST", credentials:"same-origin", cache:"no-store",
      redirect:"error", headers:{ Accept:"application/json", "Content-Type":"application/json" }, body:JSON.stringify({idToken}) });
    if (!response.ok) throw new Error(response.status === 403 ? "บัญชี LINE นี้ยังไม่มีสิทธิ์ในระบบ" : "ยืนยันบัญชีกับระบบไม่สำเร็จ");
    const envelope = await response.json().catch(() => null);
    return validateServerSession(envelope);
  }
  async resumeLineSession() {
    if (!LINE_LIFF_ID || localStorage.getItem(LINE_SIGNED_OUT_KEY) === "1") return null;
    const liff = await loadLiff();
    await liff.init({ liffId:LINE_LIFF_ID });
    return liff.isLoggedIn() ? this.exchangeLineToken(liff) : null;
  }
  async getSession() {
    if (localStorage.getItem(LINE_SIGNED_OUT_KEY) === "1") return null;
    const session = await this.backendSession();
    if (session) return session;
    try { return await this.resumeLineSession(); }
    catch (error) {
      if (error.message === "ยังไม่ได้ตั้งค่า LIFF สำหรับ PWA") return null;
      throw error;
    }
  }
  async login() {
    localStorage.removeItem(LINE_SIGNED_OUT_KEY);
    const liff = await loadLiff();
    await liff.init({ liffId:LINE_LIFF_ID });
    if (!liff.isLoggedIn()) {
      liff.login({ redirectUri:globalThis.location.href });
      return null;
    }
    await this.exchangeLineToken(liff);
    const session = await this.backendSession();
    if (!session) throw new Error("ระบบยังไม่สร้าง session ที่ยืนยันแล้ว");
    return session;
  }
  async logout() {
    localStorage.setItem(LINE_SIGNED_OUT_KEY, "1");
    const response = await fetch(authApiUrl("auth/logout"), { method:"POST", credentials:"same-origin", cache:"no-store",
      redirect:"error", headers:{ Accept:"application/json", "Content-Type":"application/json" }, body:"{}" });
    if (!response.ok) throw new Error("ออกจากระบบไม่สำเร็จ กรุณาลองอีกครั้ง");
  }
}

export class PwaAuthProvider extends LineLiffAuthProvider {}



function decodeClaims(token) {
  const segment = token.split(".")[1]?.replace(/-/g, "+").replace(/_/g, "/");
  if (!segment) throw new Error("ไม่สามารถยืนยันตัวตนได้");
  try {
    return JSON.parse(decodeURIComponent(Array.from(atob(segment.padEnd(Math.ceil(segment.length / 4) * 4, "=")))
      .map(char => "%" + char.charCodeAt(0).toString(16).padStart(2, "0")).join("")));
  } catch (_) { throw new Error("ไม่สามารถยืนยันตัวตนได้"); }
}

async function supabaseRequest(path, { method = "GET", token, body } = {}) {
  const headers = { apikey:SUPABASE_PUBLISHABLE_KEY, Accept:"application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(new URL(path, SUPABASE_URL), { method, headers,
    body:body === undefined ? undefined : JSON.stringify(body), cache:"no-store", redirect:"error" });
  const value = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error("เชื่อมต่อระบบยืนยันตัวตนไม่ได้");
    error.status = response.status;
    error.authMessage = String(value?.msg || value?.message || value?.error_description || "");
    throw error;
  }
  return value;
}

let currentAccessToken = '';
let currentAccessExpiry = 0;
async function clearStoredSession() {
  currentAccessToken = ''; currentAccessExpiry = 0;
  sessionStorage.removeItem(SUPABASE_SESSION_KEY);
  sessionStorage.removeItem('factory-pwa-machine-supabase-session-v1');
  localStorage.removeItem('factory-pwa-last-group');
  localStorage.setItem('factory-pwa-session-signed-out','1');
  await deleteSession();
}
export async function clearSupabaseSession() {
  try {
    const result=await getAuthClient().auth.signOut({scope:'local'});
    if(result.error && ![401,403,404].includes(result.error.status))throw result.error;
  }
  finally { await withSessionLock(clearStoredSession); }
}
function authFailure(reason) {
  const messages = {inactive:'บัญชีถูกระงับการใช้งาน', not_found:'ยังไม่มีบัญชีในระบบ',
    session_expired:'Session หมดอายุ ต้องยืนยัน LINE ใหม่', permissions_changed:'สิทธิ์ถูกเปลี่ยน กรุณาตรวจสอบใหม่',
    invalid_identity:'ต้องยืนยัน LINE ใหม่', data_conflict:'ข้อมูลสิทธิ์ไม่สอดคล้อง กรุณาติดต่อ Admin'};
  const error = new Error(messages[reason] || 'ไม่สามารถตรวจสอบ Session ได้');
  error.code = reason; return error;
}
async function sessionStatus(token) {
  const result = await supabaseRequest('/rest/v1/rpc/factory_session_status',{method:'POST',token,body:{}});
  if (result?.authorized !== true) throw authFailure(result?.reason || 'invalid_identity');
  return result;
}
export async function checkSupabaseSession() {
  const token=getSupabaseLineAccessToken();
  if (!token) throw authFailure('session_expired');
  return sessionStatus(token);
}
export function getSupabaseLineAccessToken() {
  if(localStorage.getItem('factory-pwa-session-signed-out')==='1')return '';
  if(currentAccessExpiry > Date.now())return currentAccessToken;
  // Compatibility for existing API imports: only an access token, never a refresh token.
  try{const saved=JSON.parse(sessionStorage.getItem(SUPABASE_SESSION_KEY)||'null');return saved?.expiresAt>Date.now()?saved.accessToken||'':'';}catch{return '';}
}

function roleForGroups(groups) {
  if (groups.includes("Admin")) return "admin";
  if (groups.includes("ผู้บริหาร")) return "executive";
  return groups.length ? "employee" : "none";
}

export class SupabaseLineAuthProvider extends AuthProvider {
  async login() {
    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !SUPABASE_LINE_PROVIDER) {
      throw new Error("การตั้งค่า LINE Login ยังไม่ครบ");
    }
    await startPkceOAuth({ supabaseUrl:SUPABASE_URL, provider:SUPABASE_LINE_PROVIDER,
      redirectTo:globalThis.location.origin + globalThis.location.pathname + globalThis.location.hash });
    return null;
  }

  async getSession({forceRefresh=false,onPhase=()=>{}}={}) {
    const client=getAuthClient();
    // The callback contains Supabase tokens only. Never persist provider tokens.
    const callback=await completePkceOAuth({supabaseUrl:SUPABASE_URL,publishableKey:SUPABASE_PUBLISHABLE_KEY});
    if (callback?.error) throw authFailure('invalid_identity');
    if (callback?.accessToken) {
      localStorage.removeItem('factory-pwa-session-signed-out');
      const imported=await client.auth.setSession({access_token:callback.accessToken,refresh_token:callback.refreshToken});
      if(imported.error) throw imported.error;
    } else if(localStorage.getItem('factory-pwa-session-signed-out')==='1') return null;
    let {data,error}=forceRefresh ? await client.auth.refreshSession() : await client.auth.getSession();
    if(error) throw error;
    let saved=data?.session;
    if(!saved) return null;
    onPhase('กำลังตรวจสอบบัญชี');
    let authUser=await client.auth.getUser(saved.access_token);
    if(authUser.error) throw authUser.error;
    const identity=(authUser.data.user?.identities || []).find(i=>i.provider===SUPABASE_LINE_PROVIDER);
    if(!identity || !/^U[0-9a-fA-F]{32}$/.test(identity.identity_data?.sub||'')) throw authFailure('invalid_identity');
    let claims=decodeClaims(saved.access_token);
    let metadata=claims.app_metadata || {};
    // An applicant has an Auth session, never an application authorization context.
    if(metadata.employee_status==='not_found' && metadata.role==='applicant') {
      const applicant=await supabaseRequest('/rest/v1/rpc/registration_current_identity',{method:'POST',token:saved.access_token,body:{}});
      if(applicant.employee_exists) {
        const next=await client.auth.refreshSession();
        if(next.error) throw next.error;
        saved=next.data.session; claims=decodeClaims(saved.access_token);metadata=claims.app_metadata||{};
      } else {
        currentAccessToken=saved.access_token;currentAccessExpiry=saved.expires_at*1000;
    sessionStorage.setItem(SUPABASE_SESSION_KEY,JSON.stringify({accessToken:currentAccessToken,expiresAt:currentAccessExpiry}));
        return {authenticated:false,applicant:true,provider:'supabase-line',identity:applicant,
          session_expiry:new Date(currentAccessExpiry).toISOString()};
      }
    }
    onPhase('กำลังตรวจสอบสิทธิ์');
    let state;
    try {state=await sessionStatus(saved.access_token);}
    catch(error) {
      if(error.code!=='permissions_changed') throw error;
      const next=await client.auth.refreshSession();
      if(next.error) throw next.error;
      saved=next.data.session;claims=decodeClaims(saved.access_token);
      state=await sessionStatus(saved.access_token);
    }
    const employeeId=state.employee_id;
    const params=new URLSearchParams({select:'id,employee_name,line_display_name,line_user_id,main_group,active',id:`eq.${employeeId}`});
    const employees=await supabaseRequest('/rest/v1/employees?'+params,{token:saved.access_token});
    const employee=Array.isArray(employees)&&employees.length===1?employees[0]:null;
    if(!employee || employee.active!==true) throw authFailure(employee?'inactive':'not_found');
    if(employee.line_user_id!==identity.identity_data.sub || employee.id!==employeeId) throw authFailure('invalid_identity');
    const groupParams=new URLSearchParams({select:'group_name',employee_id:`eq.${employeeId}`,active:'eq.true'});
    const memberships=await supabaseRequest('/rest/v1/employee_groups?'+groupParams,{token:saved.access_token});
    if(!Array.isArray(memberships)) throw authFailure('data_conflict');
    const groups=[...new Set(memberships.map(row=>row.group_name))].sort();
    const role=roleForGroups(groups);
    // Read again to reject a mixed snapshot during an Admin change.
    const finalState=await sessionStatus(saved.access_token);
    if(role!==finalState.role || employee.main_group!==finalState.main_group ||
      JSON.stringify(groups)!==JSON.stringify([...finalState.groups].sort()) || !groups.includes(employee.main_group)) {
      throw authFailure('permissions_changed');
    }
    currentAccessToken=saved.access_token;currentAccessExpiry=saved.expires_at*1000;
    sessionStorage.setItem(SUPABASE_SESSION_KEY,JSON.stringify({accessToken:currentAccessToken,expiresAt:currentAccessExpiry}));
    localStorage.removeItem('factory-pwa-session-signed-out');
    return {authenticated:true,provider:'supabase-line',label:ROLE_LABELS[role],
      session_id:claims.session_id,employee_id:employee.id,employee_name:employee.employee_name,
      main_group:employee.main_group,groups,active:true,
      issued_at:claims.iat,expires_at:saved.expires_at,last_verified_at:Date.now(),
      session_expiry:new Date(currentAccessExpiry).toISOString(),
      user:{id:employee.id,employee_id:employee.id,authUserId:authUser.data.user.id,
        name:employee.employee_name,lineDisplayName:employee.line_display_name||'',main_group:employee.main_group,
        role,groups,calendarGroups:groups.filter(value=>SESSION_GROUPS.has(value)),active:true}};
  }
  async logout() { return clearSupabaseSession(); }
}

export function createAuthProvider(mode) {
  return mode === "mock" ? new MockAuthProvider(MOCK_SESSION_ROLE, MOCK_SESSION_GROUP) : mode === "supabase-line"
    ? new SupabaseLineAuthProvider() : mode === "development"
    ? new DevelopmentAuthProvider() : new PwaAuthProvider();
}
export const authProvider = createAuthProvider(APP_MODE);






