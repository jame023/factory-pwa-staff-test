let timer;
let root;

function ensureRoot() {
  if (root) return root;
  root = document.createElement("div");
  root.className = "action-popup-region";
  root.style.pointerEvents = "none";
  root.setAttribute("aria-live", "polite");
  root.setAttribute("aria-atomic", "true");
  document.body.append(root);
  return root;
}

export function showActionPopup(message, { tone = "working", timeout = 2200 } = {}) {
  const host = ensureRoot();
  clearTimeout(timer);
  host.replaceChildren();
  const popup = document.createElement("div");
  popup.className = "action-popup action-popup-" + tone;
  popup.style.pointerEvents = "none";
  popup.setAttribute("role", tone === "error" ? "alert" : "status");
  if (tone === "working") {
    const spinner = document.createElement("span");
    spinner.className = "action-popup-spinner";
    spinner.setAttribute("aria-hidden", "true");
    popup.append(spinner);
  } else {
    const icon = document.createElement("span");
    icon.className = "action-popup-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = tone === "success" ? "✓" : tone === "error" ? "!" : tone === "confirm" ? "?" : "i";
    popup.append(icon);
  }
  const text = document.createElement("span");
  text.textContent = String(message);
  popup.append(text);
  host.append(popup);
  if (timeout > 0) timer = setTimeout(() => host.replaceChildren(), timeout);
}

export function hideActionPopup() {
  clearTimeout(timer);
  root?.replaceChildren();
}

function actionMessage(control) {
  const text = String(control.textContent?.trim() || control.value || "").replace(/\s+/g, " ").slice(0, 80);
  const form = control.closest("form");
  const id = form?.id || "";
  const action = control.dataset.action || "";

  if (control.matches("[data-update-app]")) return "กำลังอัปเดตแอป…";
  if (control.matches('[data-choice="confirm"]')) {
    const title = control.closest(".modal-backdrop")?.querySelector("h2")?.textContent || "";
    if (/อนุมัติ/.test(title)) return "กำลังอนุมัติคำขอ…";
    if (/ปฏิเสธ/.test(title)) return "กำลังปฏิเสธคำขอ…";
    if (/คำขอลาแทน/.test(title)) return "กำลังส่งคำขอลาแทน…";
    if (/ปฏิทิน/.test(title)) return "กำลังบันทึกปฏิทิน…";
    if (/บันทึก/.test(title)) return "กำลังบันทึกข้อมูล…";
    return "กำลังยืนยันคำขอ…";
  }
  if (control.matches('[data-decision="approved"]')) return { message: "ยืนยันอนุมัติคำขอ…", tone: "confirm" };
  if (control.matches('[data-decision="rejected"]')) return { message: "ยืนยันปฏิเสธคำขอ…", tone: "confirm" };
  if (control.matches("[data-cancel]")) return "ยืนยันยกเลิกคำขอ…";
  if (control.matches("[data-end]")) return "กำลังเปิดแบบฟอร์มจบงาน…";
  if (control.matches("[data-toggle-screen]")) return control.getAttribute("aria-expanded") === "true" ? "กำลังปิดรายละเอียดแก้ไข…" : "กำลังเปิดรายละเอียดแก้ไข…";
  if (control.matches("[data-new-record]")) return "กำลังเปิดแบบฟอร์มรายการใหม่…";
  if (id.includes("search") || /ค้นหา|กรอง/.test(text)) return "กำลังค้นหาข้อมูล…";
  if (/รีเฟรช|โหลดใหม่|ลองอีกครั้ง/.test(text)) return "กำลังโหลดข้อมูล…";
  if (/อนุมัติ/.test(text)) return { message: "ยืนยันอนุมัติคำขอ…", tone: "confirm" };
  if (/ปฏิเสธ/.test(text)) return { message: "ยืนยันปฏิเสธคำขอ…", tone: "confirm" };
  if (/เริ่มงาน/.test(text)) return "กำลังเริ่มงาน…";
  if (/จบงาน/.test(text)) return "กำลังจบงาน…";
  if (/บันทึก|ส่งคำขอ|ยืนยันบันทึก/.test(text) || control.type === "submit") {
    if (/ลา/.test(text) || id.includes("leave")) return "กำลังส่งคำขอลา…";
    return "กำลังบันทึกข้อมูล…";
  }
  if (/นำออก|ลบ/.test(text) || action === "delete") return "กำลังนำรายการออก…";
  if (/รับทราบ/.test(text)) return "กำลังบันทึกการรับทราบ…";
  if (/อัปเดต/.test(text)) return "กำลังอัปเดตข้อมูล…";
  if (/ล้าง/.test(text)) return "กำลังล้างตัวเลือก…";
  if (/เพิ่ม/.test(text)) return "กำลังเพิ่มรายการ…";
  if (/ยกเลิก/.test(text)) return "กำลังยกเลิก…";
  return "กำลังดำเนินการ: " + (text || "รายการ") + "…";
}

export function installActionFeedback() {
  let lastAt = 0;
  const announce = (message, options = {}) => {
    const now = Date.now();
    if (now - lastAt < 120) return;
    lastAt = now;
    if (typeof message === "object") showActionPopup(message.message, { tone: message.tone, ...options });
    else showActionPopup(message, options);
  };
  document.addEventListener("click", event => {
    const control = event.target.closest?.("button");
    if (!control || control.disabled || control.dataset.choice === "cancel" || control.dataset.actionFeedback === "false") return;
    announce(actionMessage(control));
  }, true);
  document.addEventListener("click", event => {
    const link = event.target.closest?.("a[href^='#/']");
    if (link) announce("กำลังเปิดหน้า…");
  }, true);
  document.addEventListener("submit", event => {
    if (event.defaultPrevented) return;
    const form = event.target;
    announce(form.id?.includes("search") || form.matches("[data-work-filter]") ? "กำลังค้นหาข้อมูล…" : "กำลังส่งข้อมูล…");
  }, true);
  document.addEventListener("change", event => {
    const control = event.target;
    if (control.dataset.actionFeedback === "false") return;
    if (control.matches("select, input[type=month], input[type=date], input[type=search], input[type=checkbox], input[type=radio]")) {
      const isPeriod = control.matches("input[type=month], input[type=date]") || /search|month|date/.test(control.id + " " + control.name);
      announce(isPeriod ? "กำลังโหลดข้อมูลตามตัวเลือก…" : "กำลังปรับข้อมูลที่แสดง…");
    }
  }, true);
}
