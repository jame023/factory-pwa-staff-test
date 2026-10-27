let offlineNotice = () => {};
let updateReady = false;
export function setOfflineNotice(handler) { offlineNotice = handler; }
export function isOnline() { return typeof navigator === "undefined" || navigator.onLine !== false; }
export function requireOnlineAction(label = "รายการ") {
  if (isOnline()) return true;
  offlineNotice("ออฟไลน์: " + label + " ยังไม่ถูกส่งและไม่มีการบันทึกคิว");
  return false;
}
export function watchConnection() {
  const banner = document.getElementById("connection-banner");
  const render = () => {
    const online = isOnline();
    banner.hidden = online;
    banner.textContent = online
      ? ""
      : "กำลังออฟไลน์ • เปิดหน้าแอปที่แคชไว้ได้ แต่รายการใหม่ยังไม่ถูกส่ง";
  };
  window.addEventListener("online", render);
  window.addEventListener("offline", render);
  render();
}
export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return null;
  try {
    const registration = await navigator.serviceWorker.register("./sw.js?v=1.3.186", { scope: "./" });
    const showUpdate = () => {
      if (!registration.waiting) return;
      updateReady = true;
      const banner = document.getElementById("update-banner");
      banner.innerHTML = '<span>มีเวอร์ชันใหม่พร้อมใช้งาน</span><button class="button button-small" data-update-app>อัปเดต</button>';
      banner.hidden = false;
      banner.querySelector("[data-update-app]").addEventListener("click", () => {
        registration.waiting?.postMessage({ type: "SKIP_WAITING" });
      });
    };
    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      worker?.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) showUpdate();
      });
    });
    showUpdate();
    void registration.update().catch(error => console.warn("Service worker update check failed", error));
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (updateReady) location.reload();
    }, { once: true });
    return registration;
  } catch (error) {
    console.warn("Service worker registration failed", error);
    return null;
  }
}
