import { routeDecision, normalizeRoute, routeBackTarget, groupRoute } from './route-policy.js?v=1.3.398';
import { getAuthContext as accessContext } from './access-context.js?v=1.3.398';
import { APP_MODE, READ_ONLY_ROUTES } from "./config.js?v=1.3.398";
import { resolveWorkspaceRoute, canAccessModule } from "./permissions.js?v=1.3.398";
import { watchChanges, pageBusy, preservePageDraft, mockLiveEnabled } from './live-updates.js?v=1.3.398';
import { showActionPopup } from '../components/action-popup.js?v=1.3.398';
import { isStatusModalOpen } from '../components/status-modal.js?v=1.3.398';
import { installDetailDisclosureDialogs } from '../components/detail-dialog.js?v=1.3.398';
const routes = {
  home: () => import("../pages/home/index.js?v=1.3.398"),
  attendance: () => APP_MODE === 'mock' || APP_MODE === 'development' ? import("../pages/attendance/legacy.js?v=1.3.398") : import("../pages/attendance/index.js?v=1.3.398"),
  "work-session": () => import("../pages/work-session/index.js?v=1.3.398"),
  "production-work": () => import("../pages/work-session/production-combined.js?v=1.3.398"),
  leave: () => APP_MODE === 'mock' || APP_MODE === 'development' ? import("../pages/leave/legacy.js?v=1.3.398") : import("../pages/leave/index.js?v=1.3.398"),
  calendar: () => import("../pages/calendar/index.js?v=1.3.398"),
  delivery: () => import("../pages/delivery/index.js?v=1.3.398"),
  "delivery-combined": () => import("../pages/delivery/combined.js?v=1.3.398"),
  "delivery-home": () => import("../pages/access/index.js?v=1.3.398"),
  production: () => import("../pages/production/index.js?v=1.3.398"),
  "production-record": () => import("../pages/production-record/index.js?v=1.3.398"),
  "production-data": () => import("../pages/work-session/production-data.js?v=1.3.398"),
  "screen-data": () => import("../pages/work-session/screen-data.js?v=1.3.398"),
  "screen-combined": () => import("../pages/work-session/screen-combined.js?v=1.3.398"),
  ot: () => APP_MODE === 'mock' || APP_MODE === 'development' ? import("../pages/ot/legacy.js?v=1.3.398") : import("../pages/ot/index.js?v=1.3.398"),
  reports: () => import("../pages/reports/index.js?v=1.3.398"),
  notifications: () => import("../pages/notifications/index.js?v=1.3.398"),
  "ot-report": () => import("../pages/ot/report.js?v=1.3.398"),
  "reports-menu": () => import("../pages/reports/menu.js?v=1.3.398"),
  'admin-system-status': () => import('../pages/admin/system-status.js?v=1.3.398'),
  admin: () => import("../pages/admin/index.js?v=1.3.398"),
  "admin-registrations": () => import("../pages/admin/registrations.js?v=1.3.398"),
  "admin-employees": () => import("../pages/admin/employees.js?v=1.3.398"),
  "admin-groups": () => import("../pages/admin/groups.js?v=1.3.398"),
  "admin-machines": () => import("../pages/admin/machines.js?v=1.3.398"),
  "admin-item-names": () => import("../pages/admin/item-names.js?v=1.3.398")
};
routes.employee = routes.home;
routes.executive = routes.home;
routes['access-shell']=()=>import('../pages/access/index.js?v=1.3.398');
const access = {
  'access-shell':['employee','executive','admin'],
  home: ["employee", "executive", "admin"],
  employee: ["employee", "admin"],
  executive: ["executive", "admin"],
  attendance: ["employee", "executive", "admin"],
  "work-session": ["employee", "executive", "admin"],
  leave: ["employee", "executive", "admin"],
  calendar: ["employee", "executive", "admin"],
  delivery: ["employee", "executive", "admin"],
  "delivery-combined": ["employee", "executive", "admin"],
  "delivery-home": ["employee", "executive", "admin"],
  production: ["employee", "executive", "admin"],
  "production-record": ["employee", "executive", "admin"],
  "production-data": ["employee", "admin"],
  "production-work": ["employee", "admin"],
  "screen-data": ["employee", "admin"],
  "screen-combined": ["employee", "executive", "admin"],
  ot: ["employee", "executive", "admin"],
  reports: ["employee", "executive", "admin"],
  notifications: ["employee", "executive", "admin"],
  "ot-report": ["employee", "executive", "admin"],
  "reports-menu": ["executive", "admin"],
  'admin-system-status': ['admin'],
  admin: ["executive", "admin"],
  "admin-registrations": ["executive", "admin"],
  "admin-employees": ["employee", "executive", "admin"],
  "admin-groups": ["employee", "executive", "admin"],
  "admin-machines": ["employee", "executive", "admin"],
  "admin-item-names": ["employee", "executive", "admin"]
};
let pageRoot;
let loader;
let getUser = () => ({ role: "employee" });
let onRoute = () => {};
let showToast = () => {};
let activeRoute = "home";
let routeVersion = 0;
let routeController;
let lastRoutePath=null;
let routeTrail=[];
let backTarget=null;
let beforeRoute=async()=>true;
let listening=false;
let removeDetailDisclosureDialogs=null;
const dirtyForms=new Set();
function markDirty(event){const form=event.target.closest?.('form');if(form&&!form.matches('[data-machine-filters],[data-item-filters],[data-manager-filters]'))dirtyForms.add(form);}
function leaveCurrentPage(){
  if(pageBusy(pageRoot)) {showToast('กำลังบันทึก กรุณารอผลก่อนเปลี่ยนพื้นที่');return false;}
  const dirty=[...dirtyForms].some(form=>form.isConnected&&pageRoot.contains(form));
  return !dirty||window.confirm('มีข้อมูลที่ยังไม่ได้บันทึก ต้องการออกจากหน้านี้และทิ้งข้อมูลหรือไม่?');
}
export const currentRoute = () => activeRoute;
export function canNavigateBack() { return Boolean(routeBackTarget(lastRoutePath,routeTrail,getUser()?.role)); }
export function navigateBack() {
  const target=routeBackTarget(lastRoutePath,routeTrail,getUser()?.role);
  if(!target || target===lastRoutePath || isStatusModalOpen())return false;
  backTarget=target;
  location.hash='#'+target;
  return true;
}
function rememberRoute(path) {
  const next=normalizeRoute(path);
  if(lastRoutePath===next)return;
  if(lastRoutePath) {
    if(backTarget===next||routeTrail.at(-1)===next) {
      const index=routeTrail.lastIndexOf(next);
      if(index>=0)routeTrail=routeTrail.slice(0,index);
    } else {
      routeTrail.push(lastRoutePath);
      if(routeTrail.length>30)routeTrail.shift();
    }
  }
  lastRoutePath=next;
  backTarget=null;
}
export function navigate(route) {
  if (isStatusModalOpen()) return false;
  location.hash = "#/" + route;
  return true;
}
function ensureRouteContextActions(container, path, user) {
  container.querySelector('[data-route-context-actions]')?.remove();
  if(!user?.role)return;
  const current=normalizeRoute(path);
  const target=routeBackTarget(current,routeTrail,user.role);
  if(!target)return;
  const row=document.createElement('nav');
  row.className='form-actions route-context-actions';
  row.dataset.routeContextActions='';
  row.setAttribute('aria-label','ย้อนกลับ');
  const link=document.createElement('a');
  link.className='button button-primary route-return-primary';
  link.href='#'+target;
  const arrow=document.createElement('span');
  arrow.setAttribute('aria-hidden','true');
  arrow.textContent='←';
  link.append(arrow,document.createTextNode(' ย้อนกลับ'));
  row.append(link);
  container.insertBefore(row,container.firstChild);
}function readRoute() {
  const raw = location.hash.replace(/^#\/?/, "").split("?")[0];
  return raw;
}
async function renderRoute() {
  if(APP_MODE==='supabase-line'&&activeRoute!==readRoute()&&!leaveCurrentPage()){backTarget=null;history.replaceState(null,"","#/"+activeRoute);return;}
  if (isStatusModalOpen()) {
    backTarget=null;
    history.replaceState(null, "", "#/" + activeRoute);
    return;
  }
  showActionPopup("กำลังโหลดข้อมูล…");
  const version = ++routeVersion;
  routeController?.abort();
  routeController = new AbortController();
  const signal = routeController.signal;
  dirtyForms.clear();
  pageRoot.replaceChildren();
  try {
    if(!await beforeRoute({signal}) || version!==routeVersion || signal.aborted)return;
  }catch {if(version===routeVersion)loader.hidden=true;return;}
  const user = getUser();
  const live=APP_MODE==='supabase-line';
  const livePath=normalizeRoute(readRoute());
  const adminModules={
    '/admin/system-status':'admin-system-status',
    '/executive/employees':'admin-employees','/executive/groups':'admin-groups',
    '/executive/machines':'admin-machines','/executive/items':'admin-item-names',
    '/executive/registration-requests':'admin-registrations','/executive/audit-logs':'admin',
    '/admin/employees':'admin-employees','/admin/groups':'admin-groups','/admin/machines':'admin-machines','/admin/items':'admin-item-names','/admin/registration-requests':'admin-registrations',
    '/admin/records':'admin','/admin/records/employees':'admin','/admin/records/attendance':'admin','/admin/records/leave':'admin','/admin/records/calendar':'admin',
    '/admin/records/work-sessions':'admin','/admin/records/production':'admin','/admin/records/deliveries':'admin','/admin/records/screen':'admin','/admin/records/ot':'admin','/admin/records/audit':'admin'};
  const selfModules={'/notifications':'notifications','/employee/profile':'attendance','/employee/attendance':'attendance','/employee/calendar':'calendar','/employee/reports':'reports','/employee/ot-report':'ot-report',
    '/executive/attendance':'attendance','/executive/work-session':'work-session','/executive/leave':'leave','/executive/calendar':'calendar',
    '/executive/production':'production','/executive/delivery':'delivery','/executive/production-record':'production-record','/executive/reports':'reports','/executive/ot':'ot','/executive/reports-menu':'reports-menu',
    '/employee/leave':'leave','/employee/ot':'ot','/employee/delivery':'delivery-home','/employee/delivery/record':'delivery-combined',
    '/employee/screen':'access-shell','/employee/screen/work-menu':'screen-combined','/employee/screen/work-session':'work-session','/employee/screen/data':'screen-data',
    '/employee/production':'access-shell','/employee/production/work-session':'production-work','/employee/production-data':'production-data'};
  const checked=live?routeDecision(accessContext(),livePath):null;
  const destination = live ? {allowed:checked.allowed,module:adminModules[livePath]||selfModules[livePath]||'access-shell',workspace:livePath.split('/')[1],canonical:livePath.slice(1)} : resolveWorkspaceRoute(readRoute(), user?.role);
  const route = destination.module;
  if ((APP_MODE==='supabase-line' && route?.startsWith('admin') && !['admin','executive'].includes(user?.role)) || user?.active===false || !destination.allowed || !routes[route] || !access[route].includes(user?.role) || (!live && !canAccessModule(user, route))) {
    showActionPopup("ไม่สามารถเปิดหน้านี้ได้: ไม่มีสิทธิ์เข้าถึง", { tone: "error", timeout: 2600 });
    activeRoute = "home"; onRoute("home");
    pageRoot.innerHTML = '<section class="card card-pad"><div class="page-heading"><div><p class="eyebrow">ไม่มีสิทธิ์เข้าถึง</p><h1>หน้านี้ไม่อยู่ในสิทธิ์ของคุณ</h1></div></div><p>กรุณาใช้แถบนำทางด้านบนเพื่อเลือกพื้นที่ที่มีสิทธิ์</p></section>';
    ensureRouteContextActions(pageRoot,destination.canonical,user);
    loader.hidden = true;
    return;
  }
  if (readRoute() !== destination.canonical) history.replaceState(null, "", "#/" + destination.canonical);
  rememberRoute('/'+destination.canonical);
  activeRoute = live ? destination.canonical : route;
  onRoute(route);
  if ((APP_MODE === "development" && !READ_ONLY_ROUTES.includes(route)) ||
      (APP_MODE !== "mock" && APP_MODE !== "development" &&
        !(APP_MODE === "supabase-line" && ["access-shell","attendance","calendar","delivery","delivery-combined","delivery-home","leave","notifications","ot","ot-report","production","production-record","production-work","production-data","screen-data","screen-combined","reports","reports-menu","work-session","admin","admin-system-status","admin-employees","admin-groups","admin-machines","admin-item-names","admin-registrations"].includes(route)))) {
    showActionPopup("หมวดนี้ยังไม่เปิดเชื่อมต่อข้อมูล", { tone: "info", timeout: 2600 });
    pageRoot.innerHTML = '<section class="notice notice-warning"><h1>โมดูลนี้ยังไม่เปิด API</h1><p>โหมดอ่านข้อมูลทดสอบเปิดเฉพาะเวลาของฉัน</p><a class="button" href="#/attendance">เปิดเวลาของฉัน</a></section>';
    ensureRouteContextActions(pageRoot,destination.canonical,user);
    loader.hidden = true;
    return;
  }
  loader.hidden = false;
  const view = document.createElement("div");
  pageRoot.replaceChildren(view);
  try {
    const page = await routes[route]();
    if (version !== routeVersion || signal.aborted) return;
    let customRefresh, ready = false;
    let content = document.createElement('div');
    view.replaceChildren(content);
    let routeHadError = false;
    const routeWorkType = /^\/employee\/screen(?:\/|$)/.test('/' + destination.canonical) ? 'สกรีน'
      : /^\/employee\/production(?:\/|$)/.test('/' + destination.canonical) ? 'ผลิต' : undefined;
    const context = { user, signal, navigate, workspace: destination.workspace, workType: routeWorkType,
      onDataChange: callback => { customRefresh = callback; },
      showToast: (...args) => { if (version === routeVersion) { if (args[1] === "error") routeHadError = true; showToast(...args); } } };
    const watcher = mockLiveEnabled ? watchChanges(async isCurrent => {
      if (signal.aborted) return;
      if (customRefresh) return customRefresh();
      const next = document.createElement('div');
      await page.render(next, context);
      ensureRouteContextActions(view,destination.canonical,user);
      if (signal.aborted) return;
      if (!isCurrent()) return false;
      if (pageBusy(content)) return false;
      if (next.querySelector('[role="alert"]')) throw new Error('อ่านข้อมูลล่าสุดไม่สำเร็จ');
      const focused = document.activeElement;
      const focusId = content.contains(focused) ? focused.id : '';
      const restoreFocus = preservePageDraft(content, next);
      content.replaceWith(next); content = next;
      restoreFocus();
      if (focusId) [...content.querySelectorAll('[id]')].find(el=>el.id===focusId)?.focus({preventScroll:true});
    }, { signal, busy: () => !ready || pageBusy(content),
      onError: () => context.showToast('อัปเดตข้อมูลไม่สำเร็จ กลับเข้าหน้าแอปเพื่อลองอีกครั้ง', 'error') }) : null;
    await page.render(content, context);
    ensureRouteContextActions(view,destination.canonical,user);
    ready = true;
    if (version === routeVersion && !signal.aborted && !routeHadError) {
      showActionPopup("โหลดหน้าเสร็จแล้ว", { tone: "success", timeout: 1300 });
    }
    // Catch a change that arrived while the initial read was still loading.
    watcher?.request();
  } catch (error) {
    if (version !== routeVersion || signal.aborted) return;
    routeController.abort();
    console.error("Route render failed", route, error);
    const safeError = String(error?.message || "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[char]));
    pageRoot.innerHTML = '<section class="notice notice-danger"><strong>เปิดหน้านี้ไม่สำเร็จ</strong><div>' + safeError + '</div><div>ลองรีเฟรช หรือใช้แถบนำทางด้านบนเพื่อไปยังหน้าอื่น</div></section>';
    ensureRouteContextActions(pageRoot,destination.canonical,user);
    showToast("เปิดหน้าไม่สำเร็จ", "error");
  } finally {
    if (version === routeVersion) {
      loader.hidden = true;
      document.getElementById("main-content")?.focus({ preventScroll: true });
    }
  }
}
export function refreshRoute() { return renderRoute(); }
export function invalidateRoute() {
  routeVersion++;routeController?.abort();pageRoot?.replaceChildren();dirtyForms.clear();
  if(loader)loader.hidden=true;
}
export function stopRouter() {
  invalidateRoute();
  removeDetailDisclosureDialogs?.();removeDetailDisclosureDialogs=null;
  window.removeEventListener('hashchange',renderRoute);pageRoot?.removeEventListener('input',markDirty,true);pageRoot?.removeEventListener('change',markDirty,true);dirtyForms.clear();listening=false;lastRoutePath=null;routeTrail=[];backTarget=null;
}
export function startRouter({ root, loading, userProvider, routeChanged, toast, beforeRoute:guard }) {
  beforeRoute=guard|| (async()=>true);
  pageRoot = root; loader = loading; getUser = userProvider; onRoute = routeChanged; showToast = toast;
  removeDetailDisclosureDialogs?.();removeDetailDisclosureDialogs=installDetailDisclosureDialogs(pageRoot);
  pageRoot.addEventListener('input',markDirty,true);pageRoot.addEventListener('change',markDirty,true);
  if(!listening)window.addEventListener("hashchange", renderRoute);listening=true;
  return renderRoute();
}










