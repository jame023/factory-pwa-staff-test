import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';

// Real session-manager/access-context/session-app code; replace only browser,
// Auth, storage, router rendering and notification transport boundaries.
const root = path.resolve(import.meta.dirname, '..');
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise(setImmediate); };
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; };
async function harness({app=false}={}) {
  let now=Date.UTC(2026,10,28), nextId=0, stored=true, expiry=now+3600000;
  const timers=new Map(), listeners=new Map(), docListeners=new Map(), storage=new Map();
  const calls=[], events=[], modals=[], toasts=[], roots=new Map();
  let invalidations=0, starts=0, stops=0, beforeRoute, nextResult;
  const fixture=(extra={})=>({authenticated:true,employee_id:'employee-1',main_group:'สกรีน',groups:['สกรีน'],active:true,
    session_expiry:new Date(expiry).toISOString(),user:{id:'employee-1',role:'employee',groups:['สกรีน'],main_group:'สกรีน'},...extra});
  const provider={async getSession(options={}) {
    calls.push(options); options.onPhase?.('กำลังตรวจสอบบัญชี'); options.onPhase?.('กำลังตรวจสอบสิทธิ์');
    if(nextResult) return nextResult(options);
    if(options.forceRefresh) expiry=now+3600000;
    return fixture();
  }, async login() {}};
  const element=()=>({hidden:false,inert:false,innerHTML:'',isConnected:true,
    replaceChildren(){this.innerHTML='';},querySelector(selector){return /data-access-(retry|logout)/.test(selector)?element():null;},querySelectorAll(){return [];},addEventListener(){}});
  const on=(map,type,fn)=>{const set=map.get(type)||new Set();set.add(fn);map.set(type,set);};
  const win={addEventListener:(type,fn)=>on(listeners,type,fn),dispatchEvent:event=>{for(const fn of listeners.get(event.type)||[])fn(event);}};
  const document={hidden:false,getElementById(id){if(!roots.has(id))roots.set(id,element());return roots.get(id);},
    addEventListener:(type,fn)=>on(docListeners,type,fn),createElement:element};
  class ClockDate extends Date { static now(){return now;} }
  const location={hash:'#/employee/screen'};
  const context=vm.createContext({Date:ClockDate,console,URLSearchParams,crypto:{randomUUID:()=>`event-${++nextId}`},
    window:win,document,location,history:{replaceState(a,b,value){location.hash=value;}},
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},
    setTimeout(fn,delay){const id=++nextId;timers.set(id,{at:now+delay,fn,delay});return id;},clearTimeout:id=>timers.delete(id)});
  const cache=new Map();
  function stub(id, exports) {
    return new vm.SyntheticModule(Object.keys(exports),function(){for(const [key,value] of Object.entries(exports))this.setExport(key,value);},{context,identifier:id});
  }
  const stubs={
    'js/auth.js':{authProvider:provider,clearSupabaseSession:async()=>{stored=false;},getSupabaseLineAccessToken:()=> 'test-token'},
    'js/config.js':{APP_MODE:'supabase-line',SUPABASE_URL:'https://example.invalid',SUPABASE_PUBLISHABLE_KEY:'test-key',SUPABASE_LINE_PROVIDER:'test-provider'},
    'js/pkce-oauth.js':{startPkceOAuth(){},completePkceOAuth(){}},
    'js/session-vault.js':{loadSession:async()=>stored?{expires_at:expiry/1000}:null},
    'js/router.js':{startRouter:async options=>{beforeRoute=options.beforeRoute;await renderRoute();},stopRouter(){},
      refreshRoute:()=>renderRoute(),invalidateRoute(){invalidations++;document.getElementById('page-root').replaceChildren();},canNavigateBack:()=>false,navigateBack(){}},
    'components/app-header.js':{renderAppHeader:()=>'<header>header</header>'},
    'components/bottom-nav.js':{renderBottomNav:()=>'<nav>nav</nav>'},
    'components/login-screen.js':{renderLoginScreen:reason=>'login:'+reason},
    'components/status-modal.js':{showStatusModal(options){const active=modals.find(m=>m.open);if(active)return active;const modal={options,open:true,isOpen(){return this.open;},update(next){this.options=next;},close(){this.open=false;}};modals.push(modal);return modal;},
      isStatusModalOpen:()=>modals.some(m=>m.open)},
    'components/toast.js':{showToast:message=>toasts.push(message)},
    'components/action-popup.js':{hideActionPopup(){}},
    'js/notifications.js':{startCalendarNotifications(){starts++;return ()=>{stops++;};}},
    'js/notification-client.js':{disableDeviceNotifications(){},enableDeviceNotifications(){},readDeviceNotificationState(){}},
    'js/utils.js':{escapeHtml:s=>s}
  };
  async function renderRoute(){
    // Match the real router's early return while a global status modal is open.
    if(modals.some(m=>m.open))return;
    if(await beforeRoute?.({}))document.getElementById('page-root').innerHTML='route:'+location.hash;
  }
  function getModule(id) {
    if(cache.has(id))return cache.get(id);
    const m=stubs[id]?stub(id,stubs[id]):new vm.SourceTextModule(fs.readFileSync(path.join(root,id),'utf8'),{context,identifier:id});
    cache.set(id,m);return m;
  }
  const entry=getModule(app?'js/session-app.js':'js/session-manager.js');
  const link=(specifier,ref)=>getModule(path.posix.normalize(path.posix.join(path.posix.dirname(ref.identifier),specifier.split('?')[0])));
  await entry.link(link);
  await entry.evaluate();
  const manager=cache.get('js/session-manager.js').namespace;
  manager.listenAuthState(event=>events.push(event));
  return {manager,entry:entry.namespace,calls,events,modals,toasts,roots,document,location,fixture,
    setResult:fn=>{nextResult=fn;},expire:()=>{now=expiry;},get expiry(){return expiry;},get now(){return now;},
    get invalidations(){return invalidations;},get notificationStarts(){return starts;},get notificationStops(){return stops;},
    async loadModule(id){const m=getModule(id);if(m.status==='unlinked')await m.link(link);await m.evaluate();return m.namespace;},
    navigate:()=>beforeRoute({}),emit:type=>win.dispatchEvent({type}),
    openBusinessModal:options=>stubs['components/status-modal.js'].showStatusModal(options),
    visible(hidden){document.hidden=hidden;for(const fn of docListeners.get('visibilitychange')||[])fn({});},
    async advance(ms){const end=now+ms;for(let safety=0;safety<500;safety++){
      const due=[...timers.entries()].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];
      if(!due){now=end;await flush();return;}timers.delete(due[0]);now=due[1].at;due[1].fn();await flush();
    }throw new Error('Unexpected timer loop');}
  };
}

test('first verification remains foreground, even when background is requested',async()=>{
  const h=await harness(); await h.manager.verifySession({background:true});
  assert.ok(h.events.some(e=>e.state==='checking'));
  assert.equal(h.manager.getAuthContext().employee_id,'employee-1');
});
test('background verification keeps validated context and emits no checking popup phase',async()=>{
  const h=await harness();await h.manager.verifySession();h.events.length=0;
  const wait=deferred();h.setResult(()=>wait.promise);
  const pending=h.manager.verifySession({background:true});await flush();
  assert.equal(h.manager.getAuthContext()?.employee_id,'employee-1');
  assert.equal(h.events.length,0);
  wait.resolve(h.fixture());await pending;
  assert.deepEqual(h.events.map(e=>[e.state,e.background,e.changed]),[['authenticated',true,false]]);
});
test('concurrent checks coalesce and logout cannot be undone by an old response',async()=>{
  const h=await harness();await h.manager.verifySession();
  const wait=deferred();h.setResult(()=>wait.promise);
  const a=h.manager.verifySession({background:true}),b=h.manager.verifySession({background:true});
  assert.equal(a,b);await flush();await h.manager.revokeSession('logout');
  wait.resolve(h.fixture());assert.equal(await a,null);assert.equal(h.manager.getAuthContext(),null);
});
test('background verification still blocks revoked accounts and transient verification failures',async()=>{
  for(const error of [Object.assign(new Error('inactive'),{code:'inactive'}),Object.assign(new Error('network'),{code:'NETWORK_ERROR'})]){
    const h=await harness();await h.manager.verifySession();h.setResult(()=>Promise.reject(error));
    await assert.rejects(h.manager.verifySession({background:true}));
    assert.equal(h.manager.getAuthContext(),null);
    assert.ok(h.events.some(e=>e.state=== (error.code==='inactive'?'blocked':'error')));
  }
});
test('identity/role changes remain visible and expired context is not usable',async()=>{
  const h=await harness();await h.manager.verifySession();
  h.setResult(()=>h.fixture({employee_id:'employee-2'}));await h.manager.verifySession({background:true});
  assert.equal(h.events.at(-1).changed,true);
  h.expire();assert.equal(h.manager.getAuthContext(),null);
});
test('boot remains visible but idle app does not recheck every ten seconds',async()=>{
  const h=await harness({app:true});h.entry.startSessionApp();await flush();
  assert.ok(h.modals.length>0);assert.equal(h.roots.get('page-root').hidden,false);
  const before=h.calls.length;await h.advance(30000);
  assert.equal(h.calls.length,before,'no repeated idle checks during the first 30 seconds');
});
test('route, focus and app-resume checks preserve the page without popups or watcher restarts',async()=>{
  const h=await harness({app:true});h.entry.startSessionApp();await flush();await h.advance(1000);
  const count=h.modals.length,starts=h.notificationStarts;
  await h.navigate();await flush();h.emit('focus');await flush();
  assert.equal(h.modals.length,count);assert.equal(h.notificationStarts,starts);
  h.visible(true);assert.equal(h.roots.get('page-root').hidden,false);
  h.visible(false);await flush();assert.equal(h.roots.get('page-root').hidden,false);
  assert.equal(h.modals.length,count);assert.equal(h.notificationStarts,starts+1);
});
test('token renewal occurs before expiry in background and rights changes invalidate the old route',async()=>{
  const h=await harness({app:true});h.entry.startSessionApp();await flush();await h.advance(1000);
  const count=h.modals.length;
  await h.advance(3540000-1000);
  assert.ok(h.calls.some(c=>c.forceRefresh));assert.equal(h.modals.length,count);
  h.setResult(()=>h.fixture({user:{id:'employee-1',role:'admin',groups:['สกรีน']}}));
  h.emit('focus');await flush();assert.ok(h.invalidations>0);assert.ok(h.toasts.some(t=>t.includes('สิทธิ์')));
});
test('background checks do not replace an in-progress form or steal its popup',async()=>{
  const h=await harness({app:true});h.entry.startSessionApp();await flush();await h.advance(1000);
  const page=h.roots.get('page-root');page.innerHTML='unsaved form contents';
  const business=h.openBusinessModal({message:'กำลังบันทึกงาน',tone:'working'});
  const count=h.modals.length,wait=deferred();h.setResult(()=>wait.promise);
  h.emit('focus');await flush();
  assert.equal(h.manager.getAuthContext()?.employee_id,'employee-1');
  assert.equal(page.innerHTML,'unsaved form contents');assert.equal(page.hidden,false);assert.equal(page.inert,false);
  assert.equal(h.modals.length,count);wait.resolve(h.fixture());await flush();
  assert.equal(page.innerHTML,'unsaved form contents');assert.equal(h.modals.length,count);
  assert.equal(business.open,true);assert.equal(business.options.message,'กำลังบันทึกงาน');
});
test('machine-admin checks stay fresh and silent and still reject a non-admin',async()=>{
  const h=await harness();await h.manager.verifySession();h.events.length=0;
  const admin=await h.loadModule('js/machine-admin-auth.js');
  const count=h.calls.length;
  await assert.rejects(admin.getMachineAdminSession(),error=>error.status===403);
  assert.equal(h.calls.length,count+1);assert.equal(h.events.some(e=>e.state==='checking'),false);
  h.setResult(()=>h.fixture({user:{id:'employee-1',role:'admin',groups:['สกรีน']}}));
  assert.equal((await admin.getMachineAdminSession()).user.role,'admin');
});
test('inactive account discovered in the background removes the protected page',async()=>{
  const h=await harness({app:true});h.entry.startSessionApp();await flush();await h.advance(1000);
  h.roots.get('page-root').innerHTML='protected data';
  h.setResult(()=>Promise.reject(Object.assign(new Error('inactive'),{code:'inactive'})));
  h.emit('focus');await flush();
  assert.equal(h.manager.getAuthContext(),null);
  assert.ok(h.roots.get('page-root').innerHTML.includes('บัญชีถูกระงับ'));
  assert.ok(!h.roots.get('page-root').innerHTML.includes('protected data'));
});
test('rights changing during a business modal re-enter the guarded route after it closes',async()=>{
  const h=await harness({app:true});h.entry.startSessionApp();await flush();await h.advance(1000);
  const business=h.openBusinessModal({message:'กำลังบันทึกงาน',tone:'working'}),count=h.modals.length;
  h.setResult(()=>h.fixture({user:{id:'employee-1',role:'admin',groups:['สกรีน']}}));
  h.emit('focus');await flush();await h.advance(0);
  assert.equal(h.roots.get('page-root').hidden,true);assert.equal(h.roots.get('page-root').innerHTML,'');
  assert.equal(business.open,true);assert.equal(business.options.message,'กำลังบันทึกงาน');
  business.close();await h.advance(250);
  assert.equal(h.roots.get('page-root').hidden,false);assert.equal(h.roots.get('header-root').hidden,false);
  assert.ok(h.roots.get('page-root').innerHTML.startsWith('route:'));assert.equal(h.modals.length,count);
});
test('logout cancels a deferred rights-change route refresh',async()=>{
  const h=await harness({app:true});h.entry.startSessionApp();await flush();await h.advance(1000);
  const business=h.openBusinessModal({message:'กำลังบันทึกงาน',tone:'working'});
  h.setResult(()=>h.fixture({user:{id:'employee-1',role:'admin',groups:['สกรีน']}}));
  h.emit('focus');await flush();await h.advance(0);
  await h.manager.revokeSession('logout');const calls=h.calls.length;
  business.close();await h.advance(1000);
  assert.equal(h.calls.length,calls);assert.equal(h.manager.getAuthContext(),null);
  assert.ok(h.roots.get('page-root').innerHTML.includes('login:'));
});
