import { listActiveItemNames, requireActiveItemName } from '../../js/active-item-names.js?v=1.3.186';
import { loginToMachineAdmin } from '../../js/machine-admin-auth.js?v=1.3.186';
import { renderWorkManager } from "./manager.js?v=1.3.186";
import * as workApi from "../../adapters/package07.js?v=1.3.186";
import * as screenApi from "../../adapters/package01.js?v=1.3.186";
import { render as renderProductionRecord } from "../production-record/index.js?v=1.3.187";
import { bangkokToday, escapeHtml, shortTime, thaiDate, thaiDateTime } from "../../js/utils.js?v=1.3.186";
import { statCard } from "../../components/app-card.js?v=1.3.186";
import { requireOnlineAction } from "../../js/offline.js?v=1.3.186";
import { canEnterData, isProductionEmployee, isScreenEmployee, PRODUCTION_WORK_MACHINES, SCREEN_WORK_MACHINES } from "../../js/permissions.js?v=1.3.186";
import { WORK_MACHINES, WORK_TYPES } from "../../js/record-schema.js?v=1.3.186";

const duration = (start, end) => {
  const minutes = Math.max(0, Math.floor((new Date(end || Date.now()) - new Date(start)) / 60000));
  return Math.floor(minutes / 60) + " ชม. " + (minutes % 60) + " นาที";
};
const selectOptions = values => values.map(value => '<option value="' + escapeHtml(value) + '">' + escapeHtml(value) + "</option>").join("");
const screenMachines = ["สกรีน B1 (แพ็คคอยาว)", "สกรีน B2 (คอสั้น)", "สกรีน B3 (คอยาว)"];
const screenRows = rows => [...rows].sort((a,b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))).slice(0, 8).map(item =>
  '<article class="list-row"><div class="list-main"><div class="list-title">' + escapeHtml(item.sheetName) + ' · ' + escapeHtml(item.operatorName || "—") +
  '</div><div class="list-meta">' + escapeHtml(item.date ? thaiDate(item.date) : "—") + ' · แพ็ค ' + escapeHtml(item.enteredPack ?? "—") +
  ' · เสียจากสกรีน ' + escapeHtml(item.missingBottles ?? "—") + ' · เสียจากผลิต ' + escapeHtml(item.productionDamagedBottles ?? "—") +
  (item.note ? ' · ' + escapeHtml(item.note) : '') + '</div></div><span class="badge badge-info">บันทึกงาน</span></article>'
).join("");

export async function render(root, context) {
  if (context.user.role === "executive" || (context.user.role === "admin" && context.workspace === "executive")) return renderWorkManager(root,context);
  root.innerHTML = '<div class="page-loading"><span class="loading-spinner"></span><span>กำลังโหลดงาน…</span></div>';
  const rows = await workApi.listWorkSessions();
  const canCreate = canEnterData(context.user.role);
  const screenOnly = context.workType === 'สกรีน' || (!context.workType && isScreenEmployee(context.user));
  const productionOnly = !screenOnly && (context.workType === 'ผลิต' || isProductionEmployee(context.user) || (context.user.role === 'admin' && context.workspace === 'employee'));
  const machines = productionOnly ? PRODUCTION_WORK_MACHINES : screenOnly ? SCREEN_WORK_MACHINES : WORK_MACHINES;
  const active = rows.find(item => item.employeeId === context.user.id && !item.endedAt);
  let itemNames = [], itemNameError = '';
  if (canCreate && !active) {
    try { itemNames = await listActiveItemNames(); }
    catch (error) { itemNameError = error.message; }
  }
  if (context.signal?.aborted) return;
  const screenEntries = screenOnly ? await screenApi.readScreenManualEntries() : [];
  const screenTotals = screenEntries.reduce((totals, entry) => ({
    packs: totals.packs + Number(entry.enteredPack || 0),
    screenDefects: totals.screenDefects + Number(entry.missingBottles || 0),
    productionDefects: totals.productionDefects + Number(entry.productionDamagedBottles || 0)
  }), { packs:0, screenDefects:0, productionDefects:0 });
  root.innerHTML =
    '<div class="page-heading"><div><p class="eyebrow">' + (screenOnly ? 'SCREEN WORKFLOW' : productionOnly ? 'PRODUCTION WORKFLOW' : 'Work Session') + '</p><h1>' + (canCreate ? (screenOnly ? 'เริ่มงาน–จบงาน และบันทึกงานสกรีน' : productionOnly ? 'เริ่มงาน–จบงาน และบันทึกข้อมูลผลิต' : 'เริ่มงาน / จบงาน') : 'ข้อมูลการทำงาน') + '</h1><p>' + (canCreate ? 'ผู้ปฏิบัติงาน: ' + escapeHtml(context.user.name) : 'ดูงานที่พนักงานบันทึกและงานที่กำลังทำ') + '</p></div></div>' +
    (screenOnly ? '<p class="notice notice-info">ขั้นตอน: เริ่มงานเมื่อเริ่มใช้เครื่อง → จบงานเมื่อทำเสร็จและใส่จำนวน → บันทึกยอดสกรีนประจำวัน (แยกจากจำนวนใน Work Session)</p>' : '') +
    (productionOnly ? '<p class="notice notice-info">ขั้นตอน: เริ่มงานเมื่อเริ่มใช้เครื่อง → จบงานเมื่อทำเสร็จและใส่จำนวน → บันทึกยอดผลิตประจำวัน (แยกจากจำนวนตอนจบงาน)</p>' : '') +
    (canCreate ? (active
      ? '<section class="card card-pad"><p class="eyebrow">งานที่กำลังทำ</p><h2>' + escapeHtml(active.machine) + " • " + escapeHtml(active.workType) +
        '</h2><p>เริ่ม ' + escapeHtml(thaiDateTime(active.startedAt)) + ' · ทำงาน ' + escapeHtml(duration(active.startedAt)) +
        '</p><div class="status-row"><span class="badge badge-info">กำลังทำงาน</span></div>' +
        '<button class="button button-danger" type="button" data-end="' + escapeHtml(active.id) + '" style="margin-top:.8rem">จบงาน</button>' +
        '<form id="end-work-form" hidden style="margin-top:.8rem"><div class="field"><label for="endQuantity">จำนวน' + (active.workType === 'สกรีน' ? 'สกรีน' : 'ผลิต') + '</label><input id="endQuantity" name="quantity" type="number" min="0" step="1" inputmode="numeric" required></div><div class="form-actions"><button class="button" type="button" data-cancel-end>ยกเลิก</button><button class="button button-danger" type="submit">ยืนยันจบงาน</button></div></form></section>'
      : '<section class="card form-card"><h2>เริ่มงาน</h2><form id="work-form"><div class="form-grid" style="margin-top:.8rem">' +
        '<div class="field"><label for="workType">ประเภทงาน</label>' + (productionOnly ? '<input id="workType" name="workType" value="ผลิต" readonly>' : screenOnly ? '<input id="workType" name="workType" value="สกรีน" readonly>' : '<select id="workType" name="workType" required>' + selectOptions(WORK_TYPES) + '</select>') + '</div>' +
        '<div class="field"><label for="machine">เครื่องจักร</label><select id="machine" name="machine" required>' +
          selectOptions(machines) + '</select></div>' +
        '<div class="field" id="order-field" hidden><label for="orderName">ชื่อรายการ</label><select id="orderName" name="orderName" disabled><option value="">เลือกชื่อรายการ</option>' + itemNames.map(item => '<option value="' + escapeHtml(item.item_name) + '" data-item-id="' + escapeHtml(item.id) + '">' + escapeHtml(item.item_name) + '</option>').join('') + '</select><p class="help-text">' + (itemNameError ? escapeHtml(itemNameError) : 'แสดงเฉพาะชื่อที่เปิดใช้งาน') + '</p>' + (itemNameError ? '<button class="button button-small" type="button" data-item-catalog-login>เข้าสู่ระบบ LINE / โหลดรายการใหม่</button>' : '') + '</div>' +
        '<div class="field field-full"><label for="workNote">หมายเหตุ</label><textarea id="workNote" name="note" maxlength="300" placeholder="รายละเอียดเพิ่มเติม (ถ้ามี)"></textarea></div>' +
        '</div><div class="form-actions"><button class="button button-primary" type="submit">▶️ เริ่มงาน</button></div></form></section>') : '') +
    (screenOnly ? '<div class="section-title"><div><h2>บันทึกยอดสกรีน</h2><p>ใส่ยอดรายวันแยกจากปุ่มเริ่ม–จบงาน</p></div></div>' +
      '<div class="grid grid-3 attendance-section">' + statCard("จำนวนแพ็ค", String(screenTotals.packs), "ยอดสะสมตามสิทธิ์") +
      statCard("เสียจากสกรีน", String(screenTotals.screenDefects), "ยอดสะสมตามสิทธิ์") +
      statCard("เสียจากผลิต", String(screenTotals.productionDefects), "ยอดสะสมตามสิทธิ์") + '</div>' +
      '<section class="card form-card" style="margin-top:.8rem"><h2>บันทึกข้อมูลสกรีน</h2><form id="screen-entry-form" style="margin-top:.8rem"><div class="form-grid">' +
      '<div class="field"><label for="screen-date">วันที่</label><input id="screen-date" name="date" type="date" value="' + escapeHtml(bangkokToday()) + '" readonly required></div>' +
      '<div class="field"><label for="screen-machine">เครื่องจักร</label><select id="screen-machine" name="sheetName" required><option value="">เลือกเครื่อง</option>' + screenMachines.map(machine => '<option value="' + escapeHtml(machine) + '">' + escapeHtml(machine) + '</option>').join("") + '</select></div>' +
      '<div class="field"><label for="screen-packs">จำนวนแพ็คที่ได้ของวันนี้</label><input id="screen-packs" name="enteredPack" type="number" min="0" step="any" inputmode="decimal" placeholder="เว้นว่างถ้าไม่บันทึก"></div>' +
      '<div class="field"><label for="screen-defects">จำนวนเสียจากสกรีน</label><input id="screen-defects" name="missingBottles" type="number" min="0" step="any" inputmode="decimal" placeholder="เว้นว่างถ้าไม่บันทึก"></div>' +
      '<div class="field"><label for="production-defects">จำนวนเสียจากผลิต</label><input id="production-defects" name="productionDamagedBottles" type="number" min="0" step="any" inputmode="decimal" placeholder="เว้นว่างถ้าไม่บันทึก"></div>' +
      '<div class="field"><label for="screen-operator">ผู้บันทึก</label><input id="screen-operator" name="operatorName" value="' + escapeHtml(context.user.name) + '" readonly required><p class="small-muted">ยืนยันจากบัญชีที่เข้าสู่ระบบ</p></div>' +
      '<div class="field field-full"><label for="screen-note">หมายเหตุ</label><textarea id="screen-note" name="note" maxlength="500" placeholder="กรอกหมายเหตุ (ถ้ามี)"></textarea></div>' +
      '</div><div class="form-actions"><button class="button button-primary" type="submit">บันทึกข้อมูลสกรีน</button></div></form></section>' +
      '<section class="card card-pad" style="margin-top:.8rem"><div class="section-title"><div><h2>รายการสกรีนล่าสุด</h2><p>แสดงสูงสุด 8 รายการ</p></div></div><div class="list">' + (screenEntries.length ? screenRows(screenEntries) : '<div class="empty-state">ยังไม่มีข้อมูลสกรีน</div>') + '</div></section>' : '') +
    (productionOnly ? '<div data-production-record></div>' : '') +
    '<div class="section-title"><div><h2>ประวัติงาน</h2><p>ประวัติงานตามสิทธิ์บัญชี</p></div></div>' +
    '<section class="card card-pad"><div class="list">' + (rows.length ? rows.map(item =>
      '<article class="list-row"><div class="list-main"><div class="list-title">' + escapeHtml(item.machine) + " · " + escapeHtml(item.workType) +
      '</div><div class="list-meta">' + escapeHtml(item.employee || "พนักงานตัวอย่าง") + " · " + escapeHtml(item.orderName || "ไม่มีชื่อออเดอร์") + " · " + escapeHtml(shortTime(item.startedAt)) +
      " – " + escapeHtml(item.endedAt ? shortTime(item.endedAt) : "กำลังทำงาน") + " · " + escapeHtml(duration(item.startedAt, item.endedAt)) +
      (item.endedAt ? ' · จำนวน ' + escapeHtml(item.quantity) : '') +
      '</div></div><span class="badge ' + (item.endedAt ? "badge-success" : "badge-info") + '">' +
      (item.endedAt ? "จบแล้ว" : "กำลังทำงาน") + "</span></article>"
    ).join("") : '<div class="empty-state">ยังไม่มีประวัติงาน เริ่มงานเพื่อดูรายการที่นี่</div>') + "</div></section>" +
    '<p class="small-muted" style="margin-top:.8rem">ออฟไลน์จะไม่บันทึกหรือเข้าคิวรายการ</p>';

  if (productionOnly) await renderProductionRecord(root.querySelector("[data-production-record]"), context, {embedded:true});

  root.querySelector('[data-item-catalog-login]')?.addEventListener('click', () => loginToMachineAdmin().catch(error => context.showToast(error.message, 'error')));
  const form = root.querySelector("#work-form");
  if (form) {
    const syncWorkType = () => {
      const screen = form.elements.workType.value === "สกรีน";
      root.querySelector("#order-field").hidden = !screen;
      form.elements.orderName.disabled = !screen || !!itemNameError || itemNames.length === 0;
      form.elements.orderName.required = screen;
      if (!screen) form.elements.orderName.value = "";
    };
    form.elements.workType.addEventListener("change", syncWorkType);
    syncWorkType();
  }
  if (form) form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!requireOnlineAction("เริ่มงาน")) return;
    const button = form.querySelector("button[type=submit]");
    if (button.disabled) return;
    button.disabled = true; button.textContent = "กำลังเริ่มงาน…";
    const values = Object.fromEntries(new FormData(form));
    try {
      if (values.workType === 'สกรีน') {
        const id = form.elements.orderName.selectedOptions[0]?.dataset.itemId;
        await requireActiveItemName(id, values.orderName);
        values.itemNameId = id;
      }
      await workApi.startWorkSession({ ...values, employee: context.user.name });
      context.showToast("เริ่มงานแล้ว", "success");
      await render(root, context);
    } catch (error) {
      context.showToast(error.message || "เริ่มงานไม่สำเร็จ", "error");
      button.disabled = false; button.textContent = "▶️ เริ่มงาน";
    }
  });
  const screenForm = root.querySelector("#screen-entry-form");
  screenForm?.addEventListener("submit", async event => {
    event.preventDefault();
    if (!requireOnlineAction("บันทึกงานสกรีน")) return;
    const button = screenForm.querySelector('[type="submit"]');
    if (button.disabled) return;
    const values = Object.fromEntries(new FormData(screenForm));
    const counts = ["enteredPack", "missingBottles", "productionDamagedBottles"];
    if (!counts.some(key => values[key] !== "") || counts.some(key => values[key] !== "" && (!Number.isFinite(Number(values[key])) || Number(values[key]) < 0))) {
      context.showToast("กรอกจำนวนตั้งแต่ 0 ขึ้นไปอย่างน้อยหนึ่งช่อง", "error"); return;
    }
    button.disabled = true; button.textContent = "กำลังบันทึก…";
    try {
      await screenApi.saveScreenManualEntry(values);
      context.showToast("บันทึกงานสกรีนลง Supabase แล้ว", "success");
      await render(root, context);
    } catch (error) {
      context.showToast(error.message || "บันทึกไม่สำเร็จ", "error");
      button.disabled = false; button.textContent = "บันทึกข้อมูลสกรีน";
    }
  });
  const endButton = root.querySelector("[data-end]");
  const endForm = root.querySelector("#end-work-form");
  endButton?.addEventListener("click", () => {
    endButton.hidden = true;
    endForm.hidden = false;
    endForm.elements.quantity.focus();
  });
  root.querySelector("[data-cancel-end]")?.addEventListener("click", () => {
    endForm.hidden = true;
    endButton.hidden = false;
    endButton.focus();
  });
  endForm?.addEventListener("submit", async event => {
    event.preventDefault();
    const button = endForm.querySelector('[type="submit"]');
    if (!requireOnlineAction("จบงาน") || button.disabled) return;
    const quantity = Number(endForm.elements.quantity.value);
    if (endForm.elements.quantity.value === "" || !Number.isInteger(quantity) || quantity < 0) {
      context.showToast("กรุณาใส่จำนวนเต็มตั้งแต่ 0 ขึ้นไป", "error"); return;
    }
    button.disabled = true; button.textContent = "กำลังบันทึก…";
    endForm.querySelector("[data-cancel-end]").disabled = true;
    try {
      await workApi.endWorkSession(endButton.dataset.end, quantity);
      context.showToast("จบงานแล้ว", "success");
      await render(root, context);
    } catch (error) {
      context.showToast(error.message || "จบงานไม่สำเร็จ", "error");
      button.disabled = false; button.textContent = "ยืนยันจบงาน";
      endForm.querySelector("[data-cancel-end]").disabled = false;
    }
  });
}

