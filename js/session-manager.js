import { authProvider, clearSupabaseSession } from './auth.js?v=1.3.205';
import { loadSession } from './session-vault.js?v=1.3.191';

let state='unknown', context=null, pending=null, revision=0, ending=false;
const subscribers=new Set();
const channel=typeof window!=='undefined'&&typeof BroadcastChannel==='function'?new BroadcastChannel('factory-pwa-auth-state-v26'):null;
const EVENT_KEY='factory-pwa-auth-event';
function publish(next,detail={}) {
  state=next;
  for(const subscriber of subscribers) subscriber({state,context,...detail});
}
export function listenAuthState(callback) {subscribers.add(callback);return ()=>subscribers.delete(callback);}
export function broadcastAuthState(reason='revoked') {
  // No identity, role or credentials cross this channel. It only invalidates.
  const event={reason,id:crypto.randomUUID()};
  channel?.postMessage(event);localStorage.setItem(EVENT_KEY,JSON.stringify(event));
}
export async function getStoredSession() {
  const saved=await loadSession();
  return saved?{stored:true,session_reference:'factory-pwa-auth-sdk',expires_at:saved.expires_at||Math.floor(saved.expiresAt/1000)}:null;
}
export function getAuthContext() {return state==='authenticated'?context:null;}
export function getCurrentEmployee() {return getAuthContext()?.user||null;}
export function getCurrentEmployeeGroups() {return [...(getCurrentEmployee()?.groups||[])];}
export function resolveCurrentRole() {return getCurrentEmployee()?.role||null;}
export async function clearLocalSession() {
  context=null;revision++;
  localStorage.removeItem('factory-pwa-last-group');
  await clearSupabaseSession();
}
export async function revokeSession(reason='revoked',broadcast=true) {
  if(ending) return;
  ending=true;revision++;context=null;
  const next=/inactive|ระงับ/.test(reason)?'blocked':/expired|หมดอายุ/.test(reason)?'expired':reason==='logout'?'unauthenticated':'revoked';
  publish(next,{reason});
  if(broadcast) broadcastAuthState(reason);
  try {await clearLocalSession();}
  finally {ending=false;}
}
export function verifySession({forceRefresh=false}={}) {
  if(ending) return Promise.resolve(null);
  if(pending) return pending;
  const version=revision;
  const previous=context;
  context=null;publish('checking',{phase:forceRefresh?'กำลังต่ออายุ Session':'กำลังตรวจสอบ Session'});
  pending=(async()=>{
    try {
      const hadSession=await getStoredSession();
      const latest=await authProvider.getSession({forceRefresh,onPhase:phase=>{if(version===revision)publish('checking',{phase});}});
      if(version!==revision) return null;
      if(!latest) {if(hadSession)await revokeSession('session_expired');else publish('unauthenticated');return null;}
      if(latest.applicant) {publish('unauthenticated',{applicant:latest});return latest;}
      const changed=previous && JSON.stringify([previous.main_group,previous.user.role,previous.groups])!==JSON.stringify([latest.main_group,latest.user.role,latest.groups]);
      context=Object.freeze({...latest,user:Object.freeze({...latest.user,groups:Object.freeze([...latest.user.groups])}),groups:Object.freeze([...latest.groups])});
      publish('authenticated',{changed:Boolean(changed)});
      return context;
    } catch(error) {
      if(version!==revision) return null;
      const transient=error instanceof TypeError || error.name==='AuthRetryableFetchError' || error.status>=500 || error.status===429 || error.code==='NETWORK_ERROR' || ['TimeoutError','AbortError'].includes(error.name);
      if(transient) {context=null;publish('error',{reason:'ไม่สามารถตรวจสอบ Session ได้ กรุณาตรวจอินเทอร์เน็ตแล้วลองใหม่'});throw error;}
      await revokeSession(error.code||error.message);
      throw error;
    } finally {pending=null;}
  })();
  return pending;
}
export function refreshSession() {return verifySession({forceRefresh:true});}
function invalidated(event) {
  if(!event?.reason) return;
  void revokeSession(event.reason,false).catch(()=>{});
}
if(channel) channel.onmessage=event=>invalidated(event.data);
if(typeof window!=='undefined')window.addEventListener('storage',event=>{
  if(event.key===EVENT_KEY && event.newValue) {try{invalidated(JSON.parse(event.newValue));}catch{}}
  if(event.key==='factory-pwa-session-signed-out' && event.newValue==='1') invalidated({reason:'logout'});
});



