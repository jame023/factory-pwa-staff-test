const CACHE_NAME = "factory-pwa-shell-v1.3.340";
const APP_SHELL = [
  "./js/live-admin-context.js?v=1.3.333", "./js/machine-admin-auth.js?v=1.3.333", "./js/registration-admin-api.js?v=1.3.333", "./js/route-policy.js?v=1.3.333", "./js/router.js?v=1.3.333", "./js/supabase-app-api.js?v=1.3.333", "./js/supabase-employee-repository.js?v=1.3.333", "./pages/access/index.js?v=1.3.333", "./pages/admin/employees.js?v=1.3.333", "./pages/admin/groups.js?v=1.3.333", "./pages/admin/index.js?v=1.3.333", "./pages/admin/item-names.js?v=1.3.333", "./pages/admin/machines.js?v=1.3.333",
  "./css/staff-ui.css?v=1.3.340", "./css/ui-system.css?v=1.3.333",
  "./css/pwa-install.css?v=1.3.333", "./css/registration-admin.css?v=1.3.333",
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
APP_SHELL.push(...["./js/active-item-names.js?v=1.3.186", "./js/api.js?v=1.3.186", "./js/app.js?v=1.3.186", "./js/attendance-contract.js?v=1.3.186", "./js/attendance-data.js?v=1.3.186", "./js/attendance-fixture.js?v=1.3.186", "./js/auth.js?v=1.3.205", "./js/business-request.js?v=1.3.186", "./js/business-rules.js?v=1.3.269", "./js/config.js?v=1.3.269", "./js/delivery-service.js?v=1.3.269", "./js/directory-snapshot.js?v=1.3.186", "./js/item-name-admin-repository.js?v=1.3.186", "./js/leave-media.js?v=1.3.186", "./js/leave-rules.js?v=1.3.186", "./js/live-admin-context.js?v=1.3.333", "./js/live-updates.js?v=1.3.186", "./js/machine-admin-auth.js?v=1.3.333", "./js/machine-admin-repository.js?v=1.3.186", "./js/manager-attendance-fixture.js?v=1.3.186", "./js/mock-api.js?v=1.3.269", "./js/notification-read-state.js?v=1.3.186", "./js/notifications.js?v=1.3.340", "./js/offline.js?v=1.3.186", "./js/permissions.js?v=1.3.269", "./js/pkce-oauth.js?v=1.3.186", "./js/read-only-api.js?v=1.3.186", "./js/record-schema.js?v=1.3.186", "./js/report-inbox.js?v=1.3.186", "./js/router.js?v=1.3.333", "./js/session-manager.js?v=1.3.191", "./js/state.js?v=1.3.186", "./js/supabase-app-api.js?v=1.3.333", "./js/supabase-employee-repository.js?v=1.3.333", "./js/utils.js?v=1.3.186", "./components/action-popup.js?v=1.3.186", "./components/app-card.js?v=1.3.340", "./components/app-header.js?v=1.3.186", "./components/bottom-nav.js?v=1.3.340", "./components/loading.js?v=1.3.186", "./components/login-screen.js?v=1.3.186", "./components/modal.js?v=1.3.186", "./components/status-modal.js?v=1.3.186", "./components/toast.js?v=1.3.186", "./adapters/package01.js?v=1.3.186", "./adapters/package03.js?v=1.3.186", "./adapters/package04.js?v=1.3.269", "./adapters/package05.js?v=1.3.186", "./adapters/package06.js?v=1.3.186", "./adapters/package07.js?v=1.3.186", "./adapters/package08.js?v=1.3.186", "./adapters/package09.js?v=1.3.186", "./adapters/package10.js?v=1.3.186", "./adapters/package11.js?v=1.3.186", "./pages/admin/employees.js?v=1.3.333", "./pages/admin/groups.js?v=1.3.333", "./pages/admin/index.js?v=1.3.333", "./pages/admin/item-names.js?v=1.3.333", "./pages/admin/machines.js?v=1.3.333", "./pages/attendance/index.js?v=1.3.333", "./pages/attendance/manager.js?v=1.3.186", "./pages/calendar/index.js?v=1.3.333", "./pages/delivery/index.js?v=1.3.333", "./pages/home/index.js?v=1.3.333", "./pages/leave/approved-calendar.js?v=1.3.186", "./pages/leave/index.js?v=1.3.333", "./pages/ot/index.js?v=1.3.333", "./pages/production/index.js?v=1.3.333", "./pages/production-record/index.js?v=1.3.333", "./pages/reports/index.js?v=1.3.333", "./pages/reports/local-summary.js?v=1.3.186", "./pages/work-session/index.js?v=1.3.333", "./pages/work-session/manager.js?v=1.3.186"]);
// Some unchanged pages still import these shared files with the original cache key.
APP_SHELL.push(...["./js/business-rules.js?v=1.3.186","./js/config.js?v=1.3.186","./js/mock-api.js?v=1.3.186","./js/permissions.js?v=1.3.186"]);
APP_SHELL.push(...["./pages/production/index.js?v=1.3.333", "./pages/production-record/index.js?v=1.3.333", "./pages/work-session/index.js?v=1.3.333", "./pages/home/index.js?v=1.3.333", "./js/router.js?v=1.3.333", "./js/app.js?v=1.3.187"]);
APP_SHELL.push("./pages/home/index.js?v=1.3.333","./js/router.js?v=1.3.333","./js/app.js?v=1.3.188");
APP_SHELL.push("./pages/home/index.js?v=1.3.333","./js/router.js?v=1.3.333","./js/app.js?v=1.3.189");
APP_SHELL.push("./js/router.js?v=1.3.333","./js/app.js?v=1.3.190");
APP_SHELL.push('./js/app.js?v=1.3.191','./js/auth.js?v=1.3.191','./js/session-vault.js?v=1.3.191','./components/login-screen.js?v=1.3.191');
APP_SHELL.push('./js/pwa-install.js?v=1.3.192','./css/pwa-install.css?v=1.3.192');
APP_SHELL.push('./js/app.js?v=1.3.195','./js/auth.js?v=1.3.198','./js/registration-api.js?v=1.3.195','./pages/registration/index.js?v=1.3.333','./css/registration.css?v=1.3.195');
APP_SHELL.push('./js/app.js?v=1.3.196','./pages/registration/index.js?v=1.3.333','./js/registration-api.js?v=1.3.196');
APP_SHELL.push('./js/router.js?v=1.3.333');
APP_SHELL.push('./js/app.js?v=1.3.198','./js/config.js?v=1.3.198','./js/registration-api.js?v=1.3.198','./pages/registration/index.js?v=1.3.333','./css/registration.css?v=1.3.198');
APP_SHELL.push('./js/app.js?v=1.3.218','./js/auth.js?v=1.3.218','./js/router.js?v=1.3.333','./js/session-manager.js?v=1.3.218','./js/session-app.js?v=1.3.218','./js/supabase-auth-client.js?v=1.3.218','./js/registration-api.js?v=1.3.218','./js/registration-admin-api.js?v=1.3.333','./js/mock-api.js?v=1.3.218','./pages/admin/registrations.js?v=1.3.218','./vendor/supabase-js-2.118.0.js');

APP_SHELL.push('./js/access-context.js?v=1.3.218','./js/route-policy.js?v=1.3.333','./pages/access/index.js?v=1.3.333');
APP_SHELL.push('./js/machine-admin-auth.js?v=1.3.333','./js/live-admin-context.js?v=1.3.333',...['employees','groups','machines','item-names'].map(name=>'./pages/admin/'+name+'.js?v=1.3.218'));
APP_SHELL.push('./css/app.css?v=1.3.218','./pages/admin/machines.js?v=1.3.333');
APP_SHELL.push('./css/registration-admin.css?v=1.3.218','./pages/admin/registrations.js?v=1.3.218');
APP_SHELL.push('./js/route-policy.js?v=1.3.333','./pages/access/index.js?v=1.3.333');
APP_SHELL.push('./pages/admin/item-names.js?v=1.3.333');
APP_SHELL.push('./pages/access/index.js?v=1.3.333','./css/app.css?v=1.3.218');
APP_SHELL.push('./js/ui-icons.js?v=1.3.340','./js/ui-polish.js?v=1.3.340','./css/ui-system.css?v=1.3.218','./components/bottom-nav.js?v=1.3.340');
APP_SHELL.push('./js/app.js?v=1.3.222','./js/router.js?v=1.3.333','./js/session-app.js?v=1.3.222','./pages/access/index.js?v=1.3.333');
APP_SHELL.push('./js/route-policy.js?v=1.3.333');
APP_SHELL.push('./js/access-context.js?v=1.3.222');
APP_SHELL.push('./js/app.js?v=1.3.223','./js/router.js?v=1.3.333','./js/session-app.js?v=1.3.223','./pages/access/index.js?v=1.3.333');
APP_SHELL.push('./js/pwa-install.js?v=1.3.224');
APP_SHELL.push("./js/access-context.js?v=1.3.228","./js/route-policy.js?v=1.3.333","./components/app-header.js?v=1.3.228","./js/session-app.js?v=1.3.228","./pages/access/index.js?v=1.3.333","./js/router.js?v=1.3.333","./css/ui-system.css?v=1.3.230","./js/config.js?v=1.3.228","./js/app.js?v=1.3.228");
APP_SHELL.push('./js/session-manager.js?v=1.3.205');
APP_SHELL.push('./pages/admin/machines.js?v=1.3.333','./pages/admin/item-names.js?v=1.3.333','./pages/admin/registrations.js?v=1.3.229');
APP_SHELL.push('./css/app.css?v=1.3.239','./js/app.js?v=1.3.239','./js/session-app.js?v=1.3.239','./js/router.js?v=1.3.333','./pages/admin/item-names.js?v=1.3.333');
APP_SHELL.push('./css/app.css?v=1.3.240','./js/app.js?v=1.3.240','./js/session-app.js?v=1.3.240','./js/router.js?v=1.3.333','./pages/admin/item-names.js?v=1.3.333');
APP_SHELL.push('./css/app.css?v=1.3.241','./js/app.js?v=1.3.241','./js/session-app.js?v=1.3.241','./js/router.js?v=1.3.333','./pages/admin/item-names.js?v=1.3.333');
APP_SHELL.push('./js/app.js?v=1.3.260','./js/session-app.js?v=1.3.260','./js/router.js?v=1.3.333','./js/access-context.js?v=1.3.260','./js/route-policy.js?v=1.3.333','./pages/access/index.js?v=1.3.333','./pages/ot/index.js?v=1.3.333','./adapters/package07.js?v=1.3.260','./js/api.js?v=1.3.260','./js/supabase-app-api.js?v=1.3.333','./js/ot-service.js?v=1.3.260','./js/ot-date-rules.js?v=1.3.260','./js/config.js?v=1.3.260','./js/utils.js?v=1.3.260','./js/offline.js?v=1.3.260');
APP_SHELL.push('./pages/attendance/index.js?v=1.3.333','./pages/attendance/legacy.js?v=1.3.260','./adapters/package10.js?v=1.3.260');
APP_SHELL.push('./pages/leave/legacy.js?v=1.3.260','./pages/leave/approved-calendar-legacy.js?v=1.3.260','./js/leave-rules-legacy.js?v=1.3.260','./adapters/package09-legacy.js?v=1.3.260','./pages/ot/legacy.js?v=1.3.260','./adapters/package07-legacy.js?v=1.3.260','./css/app.css?v=1.3.242');
APP_SHELL.push('./components/app-header.js?v=1.3.250','./components/bottom-nav.js?v=1.3.340','./js/config.js?v=1.3.250','./js/leave-service.js?v=1.3.260');
APP_SHELL.push('./js/app.js?v=1.3.264','./js/session-app.js?v=1.3.264','./js/api.js?v=1.3.264','./js/config.js?v=1.3.264','./js/router.js?v=1.3.333','./js/supabase-app-api.js?v=1.3.333','./adapters/package07.js?v=1.3.264','./pages/work-session/index.js?v=1.3.333','./pages/work-session/screen-work.js?v=1.3.264','./pages/production/index.js?v=1.3.333','./pages/production-record/index.js?v=1.3.333');
self.addEventListener("install", event => {
  event.waitUntil((async () => { const cache = await caches.open(CACHE_NAME); const requests = [...new Set(APP_SHELL.map(asset => new URL(asset, self.location.href).href))].map(url => new Request(url, { cache: "reload" })); await cache.addAll(requests); })());
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

APP_SHELL.push('./css/ui-system.css?v=1.3.242','./js/config.js?v=1.3.242');

APP_SHELL.push('./pages/attendance/index.js?v=1.3.333','./adapters/package10.js?v=1.3.251','./js/api.js?v=1.3.186','./js/supabase-app-api.js?v=1.3.333','./js/app.js?v=1.3.251','./js/session-app.js?v=1.3.251','./js/router.js?v=1.3.333','./pages/access/index.js?v=1.3.333','./js/config.js?v=1.3.251','./components/app-header.js?v=1.3.251','./css/ui-system.css?v=1.3.251','./components/bottom-nav.js?v=1.3.340');



APP_SHELL.push('./pages/leave/index.js?v=1.3.333','./pages/leave/employee.js?v=1.3.253','./pages/leave/approved-calendar.js?v=1.3.253','./js/leave-service.js?v=1.3.253','./js/leave-images.js?v=1.3.253','./js/leave-rules.js?v=1.3.253','./adapters/package09.js?v=1.3.253','./js/supabase-app-api.js?v=1.3.333');
APP_SHELL.push('./js/app.js?v=1.3.253','./js/router.js?v=1.3.333','./js/config.js?v=1.3.253','./js/api.js?v=1.3.253');
APP_SHELL.push('./pages/access/index.js?v=1.3.333','./js/route-policy.js?v=1.3.333');
APP_SHELL.push('./js/access-context.js?v=1.3.264','./js/route-policy.js?v=1.3.333','./js/app.js?v=1.3.264','./js/session-app.js?v=1.3.264','./js/api.js?v=1.3.264','./js/config.js?v=1.3.264','./js/router.js?v=1.3.333','./js/supabase-app-api.js?v=1.3.333','./adapters/package07.js?v=1.3.264','./pages/work-session/index.js?v=1.3.333','./pages/work-session/screen-work.js?v=1.3.264','./pages/production/index.js?v=1.3.333','./pages/production-record/index.js?v=1.3.333');
APP_SHELL.push('./components/status-modal.js?v=1.3.264','./adapters/package05.js?v=1.3.264','./js/utils.js?v=1.3.264');
APP_SHELL.push('./pages/ot/index.js?v=1.3.333','./pages/leave/index.js?v=1.3.333','./js/ot-service.js?v=1.3.264');
APP_SHELL.push('./pages/work-session/legacy.js?v=1.3.264');
// Cache the exact versioned module URLs in the current import graph. Imports
// with query versions do not match their unversioned shell entries offline.
APP_SHELL.push(
  './adapters/package07-legacy.js?v=1.3.259','./adapters/package09-legacy.js?v=1.3.259',
  './adapters/package10.js?v=1.3.250','./js/auth.js?v=1.3.205',
  './js/config.js?v=1.3.199','./js/leave-rules-legacy.js?v=1.3.259',
  './js/live-admin-context.js?v=1.3.333','./js/machine-admin-auth.js?v=1.3.333',
  './js/machine-admin-auth.js?v=1.3.333','./js/permissions.js?v=1.3.201',
  './js/registration-admin-api.js?v=1.3.333','./js/supabase-auth-client.js?v=1.3.205',
  './pages/admin/employees.js?v=1.3.333','./pages/admin/groups.js?v=1.3.333',
  './pages/home/index.js?v=1.3.333','./pages/leave/approved-calendar-legacy.js?v=1.3.259',
  './pages/registration/index.js?v=1.3.333'
);
APP_SHELL.push('./js/app.js?v=1.3.298','./js/config.js?v=1.3.298','./js/offline.js?v=1.3.298','./js/router.js?v=1.3.333','./js/route-policy.js?v=1.3.333','./js/permissions.js?v=1.3.298','./js/api.js?v=1.3.298','./js/supabase-app-api.js?v=1.3.333','./adapters/package04.js?v=1.3.298','./adapters/package07.js?v=1.3.298','./adapters/package09.js?v=1.3.298','./adapters/package11.js?v=1.3.298','./pages/access/index.js?v=1.3.333','./pages/admin/index.js?v=1.3.333','./sw.js?v=1.3.298');
APP_SHELL.push('./css/app.css?v=1.3.299','./js/app.js?v=1.3.299','./js/router.js?v=1.3.333','./pages/admin/index.js?v=1.3.333','./sw.js?v=1.3.299');
const shellUrls = new Set(APP_SHELL.map(asset => new URL(asset, self.location.href).href));

APP_SHELL.push('./js/app.js?v=1.3.265','./js/auth.js?v=1.3.265');

APP_SHELL.push('./js/app.js?v=1.3.267','./js/api.js?v=1.3.267','./js/config.js?v=1.3.267','./js/session-app.js?v=1.3.267','./js/router.js?v=1.3.333','./js/supabase-app-api.js?v=1.3.333','./adapters/package07.js?v=1.3.267','./pages/work-session/index.js?v=1.3.333','./pages/work-session/screen-work.js?v=1.3.266','./pages/work-session/production-work.js?v=1.3.267','./pages/production/index.js?v=1.3.333');
APP_SHELL.push('./js/app.js?v=1.3.274','./js/router.js?v=1.3.333','./js/config.js?v=1.3.274','./pages/delivery/index.js?v=1.3.333','./css/app.css?v=1.3.272','./js/route-policy.js?v=1.3.333','./js/permissions.js?v=1.3.274','./pages/access/index.js?v=1.3.333','./js/offline.js?v=1.3.274','./sw.js?v=1.3.274');
APP_SHELL.push('./css/app.css?v=1.3.278','./js/app.js?v=1.3.279','./js/router.js?v=1.3.333','./js/route-policy.js?v=1.3.333','./js/session-app.js?v=1.3.279','./components/app-header.js?v=1.3.278','./sw.js?v=1.3.279');
APP_SHELL.push('./css/ui-system.css?v=1.3.280','./js/app.js?v=1.3.280','./js/router.js?v=1.3.333','./pages/access/index.js?v=1.3.333','./sw.js?v=1.3.280');
APP_SHELL.push('./css/ui-system.css?v=1.3.281','./sw.js?v=1.3.281');
APP_SHELL.push('./css/ui-system.css?v=1.3.282','./sw.js?v=1.3.282');

APP_SHELL.push('./css/ui-system.css?v=1.3.283','./sw.js?v=1.3.283');


APP_SHELL.push('./css/ui-system.css?v=1.3.284','./sw.js?v=1.3.284');


APP_SHELL.push('./css/ui-system.css?v=1.3.285','./sw.js?v=1.3.285');


APP_SHELL.push('./css/ui-system.css?v=1.3.286','./sw.js?v=1.3.286');


APP_SHELL.push('./js/app.js?v=1.3.287','./components/app-header.js?v=1.3.287','./sw.js?v=1.3.287');

APP_SHELL.push('./css/ui-system.css?v=1.3.291','./js/app.js?v=1.3.289','./js/router.js?v=1.3.333','./js/session-app.js?v=1.3.289','./pages/access/index.js?v=1.3.333','./pages/work-session/index.js?v=1.3.333','./pages/work-session/screen-work.js?v=1.3.289','./sw.js?v=1.3.291');


APP_SHELL.push('./js/delivery-service.js?v=1.3.275','./adapters/package04.js?v=1.3.275');
// Bust the cached import URLs for the updated Delivery product selector.
APP_SHELL.push('./js/app.js?v=1.3.293','./js/offline.js?v=1.3.293','./js/config.js?v=1.3.293','./js/session-app.js?v=1.3.293','./js/router.js?v=1.3.333','./pages/delivery/index.js?v=1.3.333','./sw.js?v=1.3.293');
APP_SHELL.push('./js/app.js?v=1.3.294','./js/config.js?v=1.3.294','./js/session-app.js?v=1.3.294','./js/router.js?v=1.3.333','./pages/delivery/index.js?v=1.3.333','./components/status-modal.js?v=1.3.294','./sw.js?v=1.3.294');


APP_SHELL.push('./js/app.js?v=1.3.295','./js/config.js?v=1.3.295','./js/session-app.js?v=1.3.295','./js/router.js?v=1.3.333','./components/status-modal.js?v=1.3.295','./pages/delivery/index.js?v=1.3.333','./pages/access/index.js?v=1.3.333','./pages/ot/index.js?v=1.3.333','./pages/leave/index.js?v=1.3.333','./pages/leave/employee.js?v=1.3.295','./pages/work-session/index.js?v=1.3.333','./pages/work-session/screen-work.js?v=1.3.295','./pages/work-session/production-work.js?v=1.3.295','./pages/registration/index.js?v=1.3.333','./pages/admin/registrations.js?v=1.3.295','./pages/admin/employees.js?v=1.3.333','./pages/admin/groups.js?v=1.3.333','./pages/admin/machines.js?v=1.3.333','./pages/admin/item-names.js?v=1.3.333','./sw.js?v=1.3.295');
APP_SHELL.push('./css/app.css?v=1.3.313','./js/app.js?v=1.3.313','./js/router.js?v=1.3.333','./js/config.js?v=1.3.313','./js/route-policy.js?v=1.3.333','./js/permissions.js?v=1.3.304','./js/leave-service.js?v=1.3.313','./js/supabase-app-api.js?v=1.3.333','./adapters/package09.js?v=1.3.313','./pages/admin/index.js?v=1.3.333','./pages/admin/leave-proxy.js?v=1.3.313','./pages/admin/employees.js?v=1.3.333','./pages/admin/groups.js?v=1.3.333','./pages/admin/machines.js?v=1.3.333','./pages/admin/registrations.js?v=1.3.313','./pages/admin/item-names.js?v=1.3.333','./pages/access/index.js?v=1.3.333','./sw.js?v=1.3.313');
APP_SHELL.push('./css/app.css?v=1.3.316','./js/app.js?v=1.3.316','./js/router.js?v=1.3.333','./js/config.js?v=1.3.316','./js/api.js?v=1.3.316','./js/supabase-app-api.js?v=1.3.333','./js/executive-attendance-rules.js?v=1.3.316','./adapters/package03.js?v=1.3.316','./pages/attendance/index.js?v=1.3.333','./pages/attendance/legacy.js?v=1.3.316','./pages/attendance/manager.js?v=1.3.316','./pages/access/index.js?v=1.3.333','./sw.js?v=1.3.316');
APP_SHELL.push('./css/app.css?v=1.3.320','./js/app.js?v=1.3.320','./js/config.js?v=1.3.320','./js/api.js?v=1.3.320','./js/supabase-app-api.js?v=1.3.333','./js/router.js?v=1.3.333','./js/ot-service.js?v=1.3.320','./js/executive-ot-report-rules.js?v=1.3.320','./adapters/package07.js?v=1.3.320','./pages/ot/index.js?v=1.3.333','./sw.js?v=1.3.320');
APP_SHELL.push('./pages/access/index.js?v=1.3.333');
APP_SHELL.push('./css/app.css?v=1.3.322','./js/app.js?v=1.3.322','./js/config.js?v=1.3.322','./js/router.js?v=1.3.333','./adapters/package07.js?v=1.3.322','./js/ot-service.js?v=1.3.322','./js/executive-ot-report-rules.js?v=1.3.322','./pages/ot/index.js?v=1.3.333','./sw.js?v=1.3.322');
APP_SHELL.push('./css/app.css?v=1.3.324','./js/app.js?v=1.3.324','./js/config.js?v=1.3.324','./js/api.js?v=1.3.324','./js/supabase-app-api.js?v=1.3.333','./js/leave-service.js?v=1.3.324','./js/router.js?v=1.3.333','./js/route-policy.js?v=1.3.333','./js/access-context.js?v=1.3.324','./js/leave-manager-rules.js?v=1.3.324','./adapters/package09.js?v=1.3.324','./pages/leave/index.js?v=1.3.333','./pages/leave/manager.js?v=1.3.324','./pages/access/index.js?v=1.3.333','./sw.js?v=1.3.324');
APP_SHELL.push('./css/app.css?v=1.3.325','./js/app.js?v=1.3.325','./js/config.js?v=1.3.325','./js/router.js?v=1.3.333','./js/session-app.js?v=1.3.325','./js/route-policy.js?v=1.3.333','./js/access-context.js?v=1.3.325','./sw.js?v=1.3.325');

APP_SHELL.push('./index.html','./js/app.js?v=1.3.327','./js/config.js?v=1.3.327','./js/offline.js?v=1.3.327','./js/api.js?v=1.3.327','./js/mock-api.js?v=1.3.327','./js/supabase-app-api.js?v=1.3.333','./js/admin-audit-contract.js?v=1.3.327','./js/router.js?v=1.3.333','./js/session-app.js?v=1.3.327','./js/route-policy.js?v=1.3.333','./js/access-context.js?v=1.3.327','./adapters/package11.js?v=1.3.327','./pages/admin/index.js?v=1.3.333','./sw.js?v=1.3.327');


APP_SHELL.push('./index.html','./js/app.js?v=1.3.330','./js/config.js?v=1.3.330','./js/offline.js?v=1.3.330','./js/router.js?v=1.3.333','./js/session-app.js?v=1.3.330','./js/route-policy.js?v=1.3.333','./js/access-context.js?v=1.3.330','./pages/work-session/index.js?v=1.3.333','./pages/production-record/index.js?v=1.3.333','./pages/production/index.js?v=1.3.333','./js/admin-audit-contract.js?v=1.3.330','./pages/admin/index.js?v=1.3.333','./sw.js?v=1.3.330');

APP_SHELL.push('./css/app.css?v=1.3.330','./components/login-screen.js?v=1.3.330','./js/session-app.js?v=1.3.330');

APP_SHELL.push('./index.html','./js/app.js?v=1.3.340','./js/config.js?v=1.3.340','./js/router.js?v=1.3.340','./js/session-app.js?v=1.3.333','./js/route-policy.js?v=1.3.340','./js/permissions.js?v=1.3.340','./js/access-context.js?v=1.3.333','./pages/access/index.js?v=1.3.340','./pages/calendar/index.js?v=1.3.333','./pages/home/index.js?v=1.3.340','./pages/reports/index.js?v=1.3.333','./pages/reports/menu.js?v=1.3.340','./sw.js?v=1.3.340');

APP_SHELL.push('./css/app.css?v=1.3.333','./components/login-screen.js?v=1.3.333');
