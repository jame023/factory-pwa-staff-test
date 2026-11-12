import { normalizeRoute, safeReturnRoute } from './route-policy.js?v=1.3.333';
import { requireAccess, getAuthContext as accessContext, resolveDefaultRoute } from './access-context.js?v=1.3.333';
import { authProvider } from './auth.js?v=1.3.205';
import { verifySession,refreshSession,revokeSession,listenAuthState,getAuthContext } from './session-manager.js?v=1.3.205';
import { startRouter,stopRouter,refreshRoute,invalidateRoute,canNavigateBack,navigateBack } from './router.js?v=1.3.333';
import { renderAppHeader } from '../components/app-header.js?v=1.3.278';
import { renderBottomNav } from '../components/bottom-nav.js?v=1.3.340';
import { renderLoginScreen } from '../components/login-screen.js?v=1.3.333';
import { showStatusModal,isStatusModalOpen } from '../components/status-modal.js?v=1.3.295';
import { showToast } from '../components/toast.js?v=1.3.186';
import { hideActionPopup } from '../components/action-popup.js?v=1.3.186';
import { escapeHtml } from './utils.js?v=1.3.186';
import { startCalendarNotifications } from './notifications.js?v=1.3.340';

const page=document.getElementById('page-root'),header=document.getElementById('header-root'),nav=document.getElementById('nav-root'),loading=document.getElementById('page-loading');
let modal,session,stopNotifications,timer,working=false,started=false,applicantMounted=false;
let booting=null,permissionsRefresh;
const RETURN_KEY='factory-pwa-return-route-v33';
function rememberReturn() {
  const target=safeReturnRoute(location.hash);
  if(target)try{sessionStorage.setItem(RETURN_KEY,target);}catch{}
}
function takeReturn() {
  try {const target=safeReturnRoute(sessionStorage.getItem(RETURN_KEY));sessionStorage.removeItem(RETURN_KEY);return target;}catch{return null;}
}
rememberReturn();
function mask(value) {
  for(const root of [page,header,nav]) {root.hidden=value;root.inert=value;}
  loading.hidden=true;
}
function closeModal() {modal?.close();modal=null;}
function loginScreen(reason='') {
  reason=({logout:'ออกจากระบบแล้ว กรุณายืนยัน LINE ใหม่',session_expired:'Session หมดอายุ ต้องยืนยัน LINE ใหม่',inactive:'บัญชีถูกระงับ กรุณาติดต่อ Admin',not_found:'ไม่พบบัญชีพนักงาน กรุณายืนยัน LINE ใหม่',invalid_identity:'ข้อมูลตัวตนไม่ตรงกัน ต้องยืนยัน LINE ใหม่',permissions_changed:'สิทธิ์ถูกเปลี่ยน กรุณายืนยัน LINE ใหม่',data_conflict:'ข้อมูลสิทธิ์ไม่สอดคล้อง กรุณาติดต่อ Admin'})[reason]||reason;
  stopRouter();stopNotifications?.();session=null;started=false;applicantMounted=false;
  header.replaceChildren();nav.replaceChildren();
  const publicPath=location.hash.replace(/^#/, '');
  if(!['','/','/login','/login/line','/register','/register/status','/unauthorized','/account-blocked','/not-found'].includes(publicPath))history.replaceState(null,'','#/login');
  const publicMessage=publicPath==='/account-blocked'?'บัญชีถูกระงับ':publicPath==='/unauthorized'?'ไม่มีสิทธิ์เข้าหน้านี้':publicPath==='/not-found'?'ไม่พบหน้าที่ต้องการ':'';
  page.innerHTML=(publicMessage?'<section class="notice notice-danger"><h1>'+publicMessage+'</h1></section>':'')+renderLoginScreen(reason);mask(false);
  const authenticationButtons=page.querySelectorAll('[data-auth-login],[data-auth-register]');
  const startAuthentication=async event=>{
    if(working)return;working=true;
    const button=event.currentTarget;
    authenticationButtons.forEach(item=>{item.disabled=true;item.setAttribute('data-action-feedback','false');});
    modal=showStatusModal({message:button.hasAttribute('data-auth-register')?'กำลังยืนยัน LINE เพื่อสมัครสมาชิก':'กำลังยืนยันตัวตนด้วย LINE',tone:'working'});
    try {await authProvider.login();}catch(error){closeModal();working=false;loginScreen(error.message);}
  };
  authenticationButtons.forEach(button=>button.addEventListener('click',startAuthentication));
}
function chrome() {
  const path=location.hash.replace(/^#/, '');
  const workspaceLabel=path.startsWith('/admin')?'Admin':path.startsWith('/executive')?'ผู้บริหาร':(accessContext().selected_workspace||accessContext().selected_group);
  const homeRoute=accessContext()?.role==='admin'?'admin':'home';
  const currentRoute=normalizeRoute(location.hash).slice(1);
  header.innerHTML=renderAppHeader({...session.user,workspaceLabel},{canGoBack:canNavigateBack()});nav.innerHTML=renderBottomNav(currentRoute,homeRoute);
  header.querySelector('[data-auth-logout]')?.setAttribute('data-action-feedback','false');
  header.querySelector('[data-auth-logout]')?.addEventListener('click',logout);
  
}
async function logout() {
  if(working||isStatusModalOpen())return;working=true;takeReturn();stopRouter();started=false;session=null;header.replaceChildren();nav.replaceChildren();mask(true);
  modal=showStatusModal({message:'กำลังออกจากระบบ',tone:'working'});
  let message='ออกจากระบบสำเร็จ';
  try{await revokeSession('logout');}catch{message='ออกจากระบบในเครื่องแล้ว แต่ยังยืนยันการตัด Session ที่ Server ไม่สำเร็จ';}
  finally{closeModal();working=false;history.replaceState(null,'','#/login');loginScreen(message);}
}
async function routeGuard({signal}={}) {
  let path=normalizeRoute(location.hash);
  // Resolve Home only after requireAccess obtains fresh permissions.
  const decision=await requireAccess(path==='/home'?'/':path,{signal});
  if(signal?.aborted)return false;
  session=getAuthContext();
  if(!session?.authenticated)return false;
  path=!decision.allowed?decision.redirect:['/','/home','/login','/login/line'].includes(path)?resolveDefaultRoute():decision.path;
  if(['/','/home','/login','/login/line'].includes(decision.path)){
    const next=await requireAccess(path,{signal});
    if(signal?.aborted)return false;
    path=next.allowed?next.path:next.redirect;
  }
  history.replaceState(null,'','#'+path);
  session={...session,user:{...session.user,selectedGroup:accessContext().selected_group}};
  chrome();return true;
}
function unavailable() {
  stopRouter();started=false;applicantMounted=false;session=null;
  header.replaceChildren();nav.replaceChildren();
  page.innerHTML='<section class="ui-access-state card"><h1>ไม่สามารถตรวจสอบสิทธิ์ได้</h1><p>กรุณาตรวจสอบการเชื่อมต่อ แล้วลองใหม่ ข้อมูลที่ต้องมีสิทธิ์ถูกหยุดไว้ชั่วคราว</p><button class="button button-primary" data-access-retry>ลองใหม่</button><button class="button" data-access-logout>ออกจากระบบ</button></section>';
  mask(false);
  page.querySelector('[data-access-retry]').onclick=()=>void boot();
  page.querySelector('[data-access-logout]').onclick=()=>void logout();
}
listenAuthState(event=>{
  clearTimeout(timer);stopNotifications?.();
  if(event.state==='checking') {
    hideActionPopup();
    mask(true);
    if(modal?.isOpen())modal.update({message:event.phase,tone:'working'});
    else modal=showStatusModal({message:event.phase,tone:'working'});
    return;
  }
  closeModal();
  if(event.state==='authenticated') {
    session=event.context;mask(false);
    if(event.changed){
      invalidateRoute();header.replaceChildren();nav.replaceChildren();mask(true);
      showToast('สิทธิ์ของคุณมีการเปลี่ยนแปลง กำลังตรวจหน้าที่เข้าได้');
      clearTimeout(permissionsRefresh);permissionsRefresh=setTimeout(()=>void refreshRoute(),0);
    }
    stopNotifications=startCalendarNotifications(session.user,showToast);
    const delay=Math.min(10000,Math.max(1000,Date.parse(session.session_expiry)-Date.now()-60000));
    timer=setTimeout(()=>{
      if(document.hidden)return;
      if(isStatusModalOpen()){timer=setTimeout(()=>void resume(),1000);return;}
      void resume();
    },delay);
  } else if(event.applicant) {
    session=event.applicant;mask(false);
  } else {
    clearTimeout(permissionsRefresh);
    if(event.state==='error'){unavailable();return;}
    if(!working&&event.state==='unauthenticated')rememberReturn();
    stopRouter();started=false;
    history.replaceState(null,'',event.state==='blocked'?'#/account-blocked':'#/login');
    if(working){mask(true);return;}
    loginScreen(event.reason||'');
  }
});
async function resume() {
  if(working)return;
  if(!session && !getAuthContext())return;
  // Re-render through the same guard so removed rights cannot leave an old page mounted.
  try {
    if(session?.applicant) {await boot();return;}
    await (Date.parse(session.session_expiry)-Date.now()<60000?refreshSession():verifySession());
  }catch{}
}
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){mask(true);stopNotifications?.();return;}
  void resume();
});
window.addEventListener('focus',()=>void resume());
window.addEventListener('pageshow',event=>{if(event.persisted){mask(true);void boot();}});
window.addEventListener('pagehide',()=>{mask(true);stopRouter();started=false;clearTimeout(timer);stopNotifications?.();});
window.addEventListener('hashchange',()=>{if(!session?.authenticated && !applicantMounted){rememberReturn();void boot();}});
async function bootOnce() {
  try {
    session=await verifySession();
    if(!session)return;
    if(session.applicant) {
      stopRouter();started=false;
      applicantMounted=true;const {mountRegistration}=await import('../pages/registration/index.js?v=1.3.333');
      if(!session?.applicant||!applicantMounted)return;
      const registrationRoot=document.createElement('div');page.replaceChildren(registrationRoot);
      await mountRegistration(registrationRoot,{logout});
      if(registrationRoot.isConnected&&applicantMounted)timer=setTimeout(()=>void boot(),10000);return;
    }
    if(!started){started=true;
      const path=location.hash;
      if(!path||['#/login','#/'].includes(path)){
        history.replaceState(null,'','#'+(takeReturn()||resolveDefaultRoute()));
      }
      await startRouter({root:page,loading,userProvider:()=>session?.user,routeChanged:()=>{chrome();},toast:showToast,beforeRoute:routeGuard});
      if(getAuthContext()&&!isStatusModalOpen()){
        hideActionPopup();
        modal=showStatusModal({message:'เข้าสู่ระบบอัตโนมัติสำเร็จ',tone:'success'});
        const success=modal;setTimeout(()=>{if(modal===success)closeModal();},700);
      }
    } else {await refreshRoute();}
  }catch{}
}
function boot(){
  if(booting)return booting;
  booting=bootOnce().finally(()=>{booting=null;});return booting;
}
export function startSessionApp(){void boot();}



