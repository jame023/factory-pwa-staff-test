const CACHE_NAME = "factory-pwa-shell-v1.3.241";
const APP_SHELL = [
  "./js/registration-admin-api.js", "./pages/admin/registrations.js", "./css/registration-admin.css",
  "./pages/production-record/index.js",
  "./pages/ot/index.js",
  "./components/action-popup.js",
  "./js/live-updates.js",
  "./js/notification-read-state.js",
  "./js/attendance-data.js",
  "./assets/icons/sip-logo.png", "./assets/icons/apple-touch-icon.png", "./assets/icons/factory-maskable-512.png",
  "./js/directory-snapshot.js",
  "./js/leave-media.js",
  "./pages/leave/approved-calendar.js",
  "./assets/previews/leave-notice-pending.svg", "./assets/previews/leave-notice-approved.svg",
  "./assets/previews/leave-notice-rejected.svg", "./assets/previews/leave-notice-cancelled.svg",
  "./js/report-inbox.js", "./pages/reports/local-summary.js",
  "./js/business-rules.js", "./js/business-request.js",
  "./js/leave-rules.js",
  "./js/notifications.js",
  "./pages/work-session/manager.js",
  "./js/manager-attendance-fixture.js", "./pages/attendance/manager.js",
  "./js/machine-admin-repository.js", "./js/item-name-admin-repository.js", "./js/active-item-names.js", "./js/machine-admin-auth.js", "./js/pkce-oauth.js", "./pages/admin/machines.js", "./pages/admin/item-names.js", "./components/status-modal.js",
  "./", "./index.html", "./offline.html", "./manifest.webmanifest",
  "./css/app.css", "./assets/icons/factory-192.png", "./assets/icons/factory-512.png",
  "./js/app.js", "./js/auth.js", "./js/session-manager.js", "./js/api.js", "./js/config.js", "./js/supabase-app-api.js", "./js/supabase-employee-repository.js", "./js/offline.js",
  "./js/router.js", "./js/state.js", "./js/utils.js",
  "./js/permissions.js", "./js/record-schema.js", "./js/mock-api.js",
  "./js/attendance-contract.js", "./js/attendance-fixture.js", "./js/read-only-api.js",
  "./components/app-card.js", "./components/app-header.js", "./components/login-screen.js", "./components/bottom-nav.js",
  "./components/loading.js", "./components/modal.js", "./components/toast.js", "./components/status-modal.js",
  "./adapters/package01.js", "./adapters/package03.js", "./adapters/package04.js",
  "./adapters/package05.js", "./adapters/package06.js", "./adapters/package07.js",
  "./adapters/package08.js", "./adapters/package09.js", "./adapters/package10.js",
  "./adapters/package11.js",
  "./pages/home/index.js", "./pages/attendance/index.js", "./pages/work-session/index.js",
  "./pages/leave/index.js", "./pages/calendar/index.js", "./pages/delivery/index.js",
  "./pages/production/index.js", "./pages/reports/index.js",
  "./pages/admin/index.js"
];
APP_SHELL.push(...["./js/active-item-names.js?v=1.3.186", "./js/api.js?v=1.3.186", "./js/app.js?v=1.3.186", "./js/attendance-contract.js?v=1.3.186", "./js/attendance-data.js?v=1.3.186", "./js/attendance-fixture.js?v=1.3.186", "./js/auth.js?v=1.3.186", "./js/business-request.js?v=1.3.186", "./js/business-rules.js?v=1.3.186", "./js/config.js?v=1.3.186", "./js/directory-snapshot.js?v=1.3.186", "./js/item-name-admin-repository.js?v=1.3.186", "./js/leave-media.js?v=1.3.186", "./js/leave-rules.js?v=1.3.186", "./js/live-admin-context.js?v=1.3.218", "./js/live-updates.js?v=1.3.186", "./js/machine-admin-auth.js?v=1.3.218", "./js/machine-admin-repository.js?v=1.3.186", "./js/manager-attendance-fixture.js?v=1.3.186", "./js/mock-api.js?v=1.3.186", "./js/notification-read-state.js?v=1.3.186", "./js/notifications.js?v=1.3.186", "./js/offline.js?v=1.3.186", "./js/permissions.js?v=1.3.186", "./js/pkce-oauth.js?v=1.3.186", "./js/read-only-api.js?v=1.3.186", "./js/record-schema.js?v=1.3.186", "./js/report-inbox.js?v=1.3.186", "./js/router.js?v=1.3.186", "./js/session-manager.js?v=1.3.191", "./js/state.js?v=1.3.186", "./js/supabase-app-api.js?v=1.3.186", "./js/supabase-employee-repository.js?v=1.3.186", "./js/utils.js?v=1.3.186", "./components/action-popup.js?v=1.3.186", "./components/app-card.js?v=1.3.186", "./components/app-header.js?v=1.3.186", "./components/bottom-nav.js?v=1.3.186", "./components/loading.js?v=1.3.186", "./components/login-screen.js?v=1.3.186", "./components/modal.js?v=1.3.186", "./components/status-modal.js?v=1.3.186", "./components/toast.js?v=1.3.186", "./adapters/package01.js?v=1.3.186", "./adapters/package03.js?v=1.3.186", "./adapters/package04.js?v=1.3.186", "./adapters/package05.js?v=1.3.186", "./adapters/package06.js?v=1.3.186", "./adapters/package07.js?v=1.3.186", "./adapters/package08.js?v=1.3.186", "./adapters/package09.js?v=1.3.186", "./adapters/package10.js?v=1.3.186", "./adapters/package11.js?v=1.3.186", "./pages/admin/employees.js?v=1.3.218", "./pages/admin/groups.js?v=1.3.218", "./pages/admin/index.js?v=1.3.186", "./pages/admin/item-names.js?v=1.3.218", "./pages/admin/machines.js?v=1.3.218", "./pages/attendance/index.js?v=1.3.186", "./pages/attendance/manager.js?v=1.3.186", "./pages/calendar/index.js?v=1.3.186", "./pages/delivery/index.js?v=1.3.186", "./pages/home/index.js?v=1.3.186", "./pages/leave/approved-calendar.js?v=1.3.186", "./pages/leave/index.js?v=1.3.186", "./pages/ot/index.js?v=1.3.186", "./pages/production/index.js?v=1.3.186", "./pages/production-record/index.js?v=1.3.186", "./pages/reports/index.js?v=1.3.186", "./pages/reports/local-summary.js?v=1.3.186", "./pages/work-session/index.js?v=1.3.186", "./pages/work-session/manager.js?v=1.3.186"]);
APP_SHELL.push(...["./pages/production/index.js?v=1.3.187", "./pages/production-record/index.js?v=1.3.187", "./pages/work-session/index.js?v=1.3.187", "./pages/home/index.js?v=1.3.187", "./js/router.js?v=1.3.187", "./js/app.js?v=1.3.187"]);
APP_SHELL.push("./pages/home/index.js?v=1.3.188","./js/router.js?v=1.3.188","./js/app.js?v=1.3.188");
APP_SHELL.push("./pages/home/index.js?v=1.3.189","./js/router.js?v=1.3.189","./js/app.js?v=1.3.189");
APP_SHELL.push("./js/router.js?v=1.3.190","./js/app.js?v=1.3.190");
APP_SHELL.push('./js/app.js?v=1.3.191','./js/auth.js?v=1.3.191','./js/session-vault.js?v=1.3.191','./components/login-screen.js?v=1.3.191');
APP_SHELL.push('./js/pwa-install.js?v=1.3.192','./css/pwa-install.css?v=1.3.192');
APP_SHELL.push('./js/app.js?v=1.3.195','./js/auth.js?v=1.3.198','./js/registration-api.js?v=1.3.195','./pages/registration/index.js?v=1.3.195','./css/registration.css?v=1.3.195');
APP_SHELL.push('./js/app.js?v=1.3.196','./pages/registration/index.js?v=1.3.196','./js/registration-api.js?v=1.3.196');
APP_SHELL.push('./js/router.js?v=1.3.193');
APP_SHELL.push('./js/app.js?v=1.3.198','./js/config.js?v=1.3.198','./js/registration-api.js?v=1.3.198','./pages/registration/index.js?v=1.3.198','./css/registration.css?v=1.3.198');
APP_SHELL.push('./js/app.js?v=1.3.218','./js/auth.js?v=1.3.218','./js/router.js?v=1.3.218','./js/session-manager.js?v=1.3.218','./js/session-app.js?v=1.3.218','./js/supabase-auth-client.js?v=1.3.218','./js/registration-api.js?v=1.3.218','./js/registration-admin-api.js?v=1.3.218','./js/mock-api.js?v=1.3.218','./pages/admin/registrations.js?v=1.3.218','./vendor/supabase-js-2.118.0.js');

APP_SHELL.push('./js/access-context.js?v=1.3.218','./js/route-policy.js?v=1.3.218','./pages/access/index.js?v=1.3.218');
APP_SHELL.push('./js/machine-admin-auth.js?v=1.3.218','./js/live-admin-context.js?v=1.3.218',...['employees','groups','machines','item-names'].map(name=>'./pages/admin/'+name+'.js?v=1.3.218'));
APP_SHELL.push('./css/app.css?v=1.3.218','./pages/admin/machines.js?v=1.3.218');
APP_SHELL.push('./css/registration-admin.css?v=1.3.218','./pages/admin/registrations.js?v=1.3.218');
APP_SHELL.push('./js/route-policy.js?v=1.3.218','./pages/access/index.js?v=1.3.218');
APP_SHELL.push('./pages/admin/item-names.js?v=1.3.218');
APP_SHELL.push('./pages/access/index.js?v=1.3.218','./css/app.css?v=1.3.218');
APP_SHELL.push('./js/ui-icons.js?v=1.3.218','./js/ui-polish.js?v=1.3.218','./css/ui-system.css?v=1.3.218','./components/bottom-nav.js?v=1.3.218');
APP_SHELL.push('./js/app.js?v=1.3.222','./js/router.js?v=1.3.222','./js/session-app.js?v=1.3.222','./pages/access/index.js?v=1.3.222');
APP_SHELL.push('./js/route-policy.js?v=1.3.222');
APP_SHELL.push('./js/access-context.js?v=1.3.222');
APP_SHELL.push('./js/app.js?v=1.3.223','./js/router.js?v=1.3.223','./js/session-app.js?v=1.3.223','./pages/access/index.js?v=1.3.223');
APP_SHELL.push('./js/pwa-install.js?v=1.3.224');
APP_SHELL.push("./js/access-context.js?v=1.3.228","./js/route-policy.js?v=1.3.228","./components/app-header.js?v=1.3.228","./js/session-app.js?v=1.3.228","./pages/access/index.js?v=1.3.228","./js/router.js?v=1.3.228","./css/ui-system.css?v=1.3.230","./js/config.js?v=1.3.228","./js/app.js?v=1.3.228");
APP_SHELL.push('./js/session-manager.js?v=1.3.205');
APP_SHELL.push('./pages/admin/machines.js?v=1.3.229','./pages/admin/item-names.js?v=1.3.229','./pages/admin/registrations.js?v=1.3.229');
APP_SHELL.push('./css/app.css?v=1.3.239','./js/app.js?v=1.3.239','./js/session-app.js?v=1.3.239','./js/router.js?v=1.3.239','./pages/admin/item-names.js?v=1.3.239');
APP_SHELL.push('./css/app.css?v=1.3.240','./js/app.js?v=1.3.240','./js/session-app.js?v=1.3.240','./js/router.js?v=1.3.240','./pages/admin/item-names.js?v=1.3.240');
APP_SHELL.push('./css/app.css?v=1.3.241','./js/app.js?v=1.3.241','./js/session-app.js?v=1.3.241','./js/router.js?v=1.3.241','./pages/admin/item-names.js?v=1.3.241');
const shellUrls = new Set(APP_SHELL.map(asset => new URL(asset, self.location.href).href));
self.addEventListener("install", event => {
  event.waitUntil((async () => { const cache = await caches.open(CACHE_NAME); const requests = APP_SHELL.map(asset => new Request(new URL(asset, self.location.href), { cache: "reload" })); await cache.addAll(requests); })());
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith("factory-pwa-shell-") && name !== CACHE_NAME)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener("message", event => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
self.addEventListener("fetch", event => {
  const request = event.request;
  // Request.url can retain #/route. Fragments are client navigation, not server inputs.
  const url = new URL(request.url);
  url.hash = "";
  const shellKey = url.href;
  // Explicit static allowlist: API responses and unknown/query URLs never touch cache.
  if (request.method !== "GET" || !shellUrls.has(shellKey)) return;
  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok && response.headers.get("content-type")?.includes("text/html")) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put("./index.html", response.clone());
        }
        return response;
      } catch {
        return (await caches.match(shellKey)) || (await caches.match("./index.html")) ||
          (await caches.match("./offline.html"));
      }
    })());
    return;
  }
  event.respondWith((async () => {
    const cached = await caches.match(shellKey);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok && response.type === "basic") {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(shellKey, response.clone());
      }
      return response;
    } catch {
      return new Response("Offline", { status: 503, statusText: "Offline" });
    }
  })());
});

















APP_SHELL.push('./css/ui-system.css?v=1.3.230','./js/config.js?v=1.3.230');

APP_SHELL.push('./css/ui-system.css?v=1.3.231','./js/config.js?v=1.3.231');

APP_SHELL.push('./css/ui-system.css?v=1.3.232','./js/config.js?v=1.3.232');

APP_SHELL.push('./css/ui-system.css?v=1.3.233','./js/config.js?v=1.3.233');

APP_SHELL.push('./css/ui-system.css?v=1.3.234','./js/config.js?v=1.3.234');

APP_SHELL.push('./css/ui-system.css?v=1.3.235','./js/config.js?v=1.3.235');

APP_SHELL.push('./css/ui-system.css?v=1.3.236','./js/config.js?v=1.3.236');

APP_SHELL.push('./css/ui-system.css?v=1.3.237','./js/config.js?v=1.3.237');
