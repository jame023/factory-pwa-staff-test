import { startCalendarNotifications } from "./notifications.js?v=1.3.186";
import { authProvider, clearSupabaseSession, checkSupabaseSession } from "./auth.js?v=1.3.205";
import { renderAppHeader } from "../components/app-header.js?v=1.3.228";
import { renderLoginScreen } from "../components/login-screen.js?v=1.3.191";
import { renderBottomNav } from "../components/bottom-nav.js?v=1.3.218";
import { currentRoute, startRouter, refreshRoute } from "./router.js?v=1.3.241";
import { subscribeStore } from './state.js?v=1.3.186';
import { showToast } from "../components/toast.js?v=1.3.186";
import { registerServiceWorker, setOfflineNotice, watchConnection } from "./offline.js?v=1.3.186";
import { APP_MODE } from "./config.js?v=1.3.186";
import { installActionFeedback, showActionPopup } from "../components/action-popup.js?v=1.3.186";
// Preserve the machine-only OAuth code before the mock app/router can replace the URL.
const machineOAuthCode = new URLSearchParams(location.search).get('code');
if (APP_MODE !== 'supabase-line' && machineOAuthCode && /^#\/admin\/(machines|item-names)(?:$|\?)/.test(location.hash)) {
  sessionStorage.setItem('factory-pwa-machine-oauth-code-v1', machineOAuthCode);
}

let session;
let appMounted = false;
let stopNotifications;
let sessionRevision = 0;
const headerRoot = document.getElementById("header-root");
const navRoot = document.getElementById("nav-root");
const pageRoot = document.getElementById("page-root");
const loadingRoot = document.getElementById("page-loading");

function renderChrome(route = currentRoute()) {
  headerRoot.innerHTML = renderAppHeader(session.user);
  navRoot.innerHTML = renderBottomNav(route);
  headerRoot.querySelector("[data-auth-logout]")?.addEventListener("click", signOut);
}

function renderLogin(message = "") {
  headerRoot.replaceChildren();
  navRoot.replaceChildren();
  loadingRoot.hidden = true;
  pageRoot.innerHTML = renderLoginScreen(message);
  pageRoot.querySelector("[data-auth-login]")?.addEventListener("click", login);
}

async function login(event) {
  const button = event.currentTarget;
  if (button.disabled) return;
  button.disabled = true;
  button.textContent = APP_MODE === "mock" ? "กำลังเปิดบัญชีตัวอย่าง…" : "กำลังยืนยันตัวตน…";
  showActionPopup(APP_MODE === "mock" ? "กำลังเปิดบัญชีตัวอย่าง…" : "กำลังยืนยันตัวตนกับ LINE…");
  try {
    session = await authProvider.login();
    if (!session) return; // LIFF may redirect the browser to LINE Login.
    await mountApp();
    if (!session?.applicant) showActionPopup("ยืนยันตัวตนแล้ว กำลังเปิดหน้าของคุณ…", { tone:"success", timeout:1300 });
  } catch (error) {
    renderLogin(error?.message || "ยืนยันตัวตนไม่สำเร็จ ลองใหม่อีกครั้ง");
    showActionPopup("ยืนยันตัวตนไม่สำเร็จ", { tone:"error", timeout:2600 });
  }
}

async function signOut() {
  showActionPopup("กำลังออกจากระบบ…");
  try {
    await authProvider.logout();
    location.reload();
  } catch (error) {
    if (APP_MODE === 'supabase-line') {
      // Local credentials are already cleared even if server revocation failed.
      sessionStorage.setItem('factory-pwa-session-end-message','ออกจากระบบในเครื่องแล้ว แต่เชื่อมต่อเพื่อยืนยันการออกจากระบบไม่ได้');
      location.reload();
      return;
    }
    showActionPopup(error?.message || "ออกจากระบบไม่สำเร็จ", { tone:"error", timeout:3000 });
  }
}

function watchMockAccount() {
  if (APP_MODE !== "mock") return;
  subscribeStore(()=>{
    const revision=++sessionRevision;
    void authProvider.getSession().then(async latest=>{
      if(revision!==sessionRevision)return;
      if(!latest) { session=null; showActionPopup("บัญชีตัวอย่างถูกปิดใช้งาน", { tone:"error", timeout:1800 }); location.reload(); return; }
      if(JSON.stringify(latest.user)===JSON.stringify(session.user))return;
      session=latest;
      stopNotifications?.();
      stopNotifications=session.user.active===false ? undefined : startCalendarNotifications(session.user,showToast);
      renderChrome();
      await refreshRoute();
      showToast("อัปเดตสิทธิ์บัญชีแล้ว");
    }).catch(()=>showToast("อ่านสิทธิ์ล่าสุดไม่สำเร็จ","error"));
  });
}

let checkingSession = false;
let sessionEnded = false;
async function endRealSession(message) {
  if (sessionEnded) return;
  sessionEnded = true;
  stopNotifications?.();
  await clearSupabaseSession().catch(() => {});
  // Stop the existing router and discard any pending page requests.
  sessionStorage.setItem('factory-pwa-session-end-message',message);
  location.replace(location.pathname + '#/login');
  location.reload();
}
function watchRealSession() {
  if (APP_MODE !== 'supabase-line') return;
  const verify = async () => {
    if (checkingSession || sessionEnded) return;
    checkingSession = true;
    try {
      if (Date.parse(session.session_expiry) <= Date.now()) throw new Error('Session หมดอายุ กรุณาเข้าสู่ระบบ LINE ใหม่');
      const state = await checkSupabaseSession();
      if (state.main_group !== session.main_group || JSON.stringify([...state.groups].sort()) !== JSON.stringify([...session.groups].sort())) {
        throw new Error('สิทธิ์บัญชีเปลี่ยนแล้ว กรุณาเข้าสู่ระบบ LINE ใหม่');
      }
    } catch (error) {
      // A network outage must not silently extend the session deadline.
      if (error instanceof TypeError || (error.status && error.status >= 500)) {
        showToast('เชื่อมต่อไม่ได้ กรุณาตรวจอินเทอร์เน็ต','error');
      } else { await endRealSession(error.message); }
    } finally { checkingSession = false; }
  };
  setTimeout(() => void endRealSession('Session หมดอายุ กรุณาเข้าสู่ระบบ LINE ใหม่'),Math.max(0,Date.parse(session.session_expiry)-Date.now()));
  setInterval(() => { if (!document.hidden) void verify(); },10000);
  document.addEventListener('visibilitychange',() => { if (!document.hidden) void verify(); });
  window.addEventListener('focus',() => void verify());
  window.addEventListener('storage',event => {
    if (event.key === 'factory-pwa-session-signed-out' && event.newValue === '1') void endRealSession('ออกจากระบบแล้ว กรุณาเข้าสู่ระบบใหม่');
  });
}

async function mountApp() {
  if (session?.applicant) {
    headerRoot.replaceChildren(); navRoot.replaceChildren(); loadingRoot.hidden=true;
    const {mountRegistration}=await import('../pages/registration/index.js?v=1.3.202');
    await mountRegistration(pageRoot,{logout:signOut});
    setTimeout(()=>void endRealSession('Session หมดอายุ กรุณายืนยัน LINE ใหม่'),Math.max(0,Date.parse(session.session_expiry)-Date.now()));
    window.addEventListener('storage',event=>{if(event.key==='factory-pwa-session-signed-out'&&event.newValue==='1')location.reload();});
    return;
  }
  if (appMounted) return;
  appMounted = true;
  renderChrome();
  stopNotifications = session.user.active===false ? undefined : startCalendarNotifications(session.user,showToast);
  watchMockAccount();
  watchRealSession();
  startRouter({
    root: pageRoot,
    loading: loadingRoot,
    userProvider: () => session.user,
    routeChanged: route => { navRoot.innerHTML = renderBottomNav(route); },
    toast: showToast
  });
}

async function start() {
  installActionFeedback();
  if (APP_MODE === "mock" || APP_MODE === "supabase-line") await registerServiceWorker();
  setOfflineNotice(message => showToast(message, "error"));
  watchConnection();
  showActionPopup("กำลังตรวจสอบสถานะบัญชี…");
  try {
    session = await authProvider.getSession();
    if (!session) {
      const message = sessionStorage.getItem('factory-pwa-session-end-message') || '';
      sessionStorage.removeItem('factory-pwa-session-end-message');
      renderLogin(message);
      return;
    }
    await mountApp();
    if (!session?.applicant) showActionPopup("ยืนยันตัวตนแล้ว", { tone:"success", timeout:1000 });
  } catch (error) {
    renderLogin(error?.message || "ตรวจสอบบัญชีไม่สำเร็จ กรุณาลองใหม่");
    showActionPopup("ตรวจสอบบัญชีไม่สำเร็จ", { tone:"error", timeout:2800 });
  }
}
if(APP_MODE==='supabase-line') {
  installActionFeedback();
  setOfflineNotice(message=>showToast(message,'error'));watchConnection();
  const {startSessionApp}=await import('./session-app.js?v=1.3.241');
  startSessionApp();
  void registerServiceWorker();
} else {start();}







