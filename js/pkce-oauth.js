import {saveOAuthAttempt,loadOAuthAttempt,deleteOAuthAttempt,withOAuthLock} from './session-vault.js?v=1.3.412';
const VERIFIER_KEY = 'factory-pwa-p18-pkce-verifier';
const CALLBACK_CODE_KEY='factory-pwa-machine-oauth-code-v1';
const ATTEMPT_TTL_MS=10*60*1000;
let completing;

function base64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export async function startPkceOAuth({ supabaseUrl, provider, redirectTo }) {
  const random = crypto.getRandomValues(new Uint8Array(32));
  const verifier = base64Url(random);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = base64Url(new Uint8Array(digest));
  await withOAuthLock(async()=>{
    await saveOAuthAttempt({verifier,createdAt:Date.now(),supabaseOrigin:new URL(supabaseUrl).origin});
    sessionStorage.setItem(VERIFIER_KEY, verifier);
    sessionStorage.removeItem(CALLBACK_CODE_KEY);
  });

  const authorize = new URL('/auth/v1/authorize', supabaseUrl);
  authorize.searchParams.set('provider', provider);
  authorize.searchParams.set('redirect_to', redirectTo);
  authorize.searchParams.set('code_challenge', challenge);
  authorize.searchParams.set('code_challenge_method', 's256');
  location.assign(authorize.href);
}

export function completePkceOAuth(options) {
  if(completing)return completing;
  completing=withOAuthLock(()=>exchangeCallback(options)).finally(()=>{completing=null;});
  return completing;
}
async function exchangeCallback({ supabaseUrl, publishableKey }) {
  const params = new URLSearchParams(location.search);
  const error = params.get('error_description') || params.get('error');
  const code = params.get('code') || sessionStorage.getItem(CALLBACK_CODE_KEY);
  if (!code && !error) return null;

  if(code)sessionStorage.setItem(CALLBACK_CODE_KEY,code);
  if (params.has('code') || error) history.replaceState(null, '', location.pathname+location.hash);
  if (error) {sessionStorage.removeItem(CALLBACK_CODE_KEY);return {error:'LINE ไม่สามารถยืนยันการเข้าสู่ระบบได้ กรุณาลองใหม่',errorCode:'oauth_provider_error'};}
  const attempt=await loadOAuthAttempt();
  const age=Date.now()-Number(attempt?.createdAt);
  const validAttempt=attempt&&Number.isFinite(age)&&age>=0&&age<ATTEMPT_TTL_MS&&
    attempt.supabaseOrigin===new URL(supabaseUrl).origin&&/^[A-Za-z0-9_-]{43,128}$/.test(attempt.verifier||'');
  const legacyVerifier=sessionStorage.getItem(VERIFIER_KEY);
  const verifier=validAttempt?attempt.verifier:(!attempt&&/^[A-Za-z0-9_-]{43,128}$/.test(legacyVerifier||'')?legacyVerifier:null);
  if(!verifier){
    if(attempt)await deleteOAuthAttempt();
    sessionStorage.removeItem(VERIFIER_KEY);sessionStorage.removeItem(CALLBACK_CODE_KEY);
    return {error:'ไม่พบข้อมูลเริ่มล็อกอินหรือข้อมูลหมดอายุ กรุณากดเข้าสู่ระบบใหม่ในเบราว์เซอร์เดิม',errorCode:'oauth_verifier_missing'};
  }

  let response;
  try {response = await fetch(new URL('/auth/v1/token?grant_type=pkce', supabaseUrl), {
    method: 'POST',
    headers: { apikey: publishableKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ auth_code: code, code_verifier: verifier }),
    cache: 'no-store',
    signal:AbortSignal.timeout(15000)
  });}catch{return {error:'เชื่อมต่อเพื่อยืนยัน LINE ไม่สำเร็จ กรุณาโหลดหน้านี้ใหม่เพื่อลองต่อ',errorCode:'oauth_network_error'};}
  let session;
  try{session=await response.json();}catch{return {error:'อ่านผลยืนยัน LINE ไม่สำเร็จ กรุณากดเข้าสู่ระบบใหม่',errorCode:'oauth_exchange_failed'};}
  if(response.status>=500||response.status===429)return {error:'ระบบยืนยัน LINE ยังไม่พร้อม กรุณาโหลดหน้านี้ใหม่เพื่อลองต่อ',errorCode:'oauth_network_error'};
  sessionStorage.removeItem(VERIFIER_KEY);sessionStorage.removeItem(CALLBACK_CODE_KEY);
  await deleteOAuthAttempt();
  if (!response.ok || !session?.access_token || !session?.refresh_token) {
    return {error:'ผลล็อกอินหมดอายุหรือถูกใช้แล้ว กรุณากดเข้าสู่ระบบใหม่อีกครั้ง',errorCode:'oauth_exchange_failed'};
  }
  return { accessToken: session.access_token, refreshToken: session.refresh_token,
    expiresAt: Date.now() + Number(session.expires_in || 3600) * 1000 };
}

