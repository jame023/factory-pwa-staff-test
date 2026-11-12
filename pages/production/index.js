import * as screenApi from "../../adapters/package01.js?v=1.3.186";
import { statCard } from "../../components/app-card.js?v=1.3.340";
import { bangkokToday, escapeHtml, thaiDate, thaiDateTime } from "../../js/utils.js?v=1.3.186";
import { requireOnlineAction } from "../../js/offline.js?v=1.3.186";
import { isScreenEmployee } from "../../js/permissions.js?v=1.3.186";

const machines = ["สกรีน B1 (แพ็คคอยาว)", "สกรีน B2 (คอสั้น)", "สกรีน B3 (คอยาว)"];
const renderRows = rows => [...rows].sort((a,b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))).slice(0, 8).map(item => {
  const fields = [
    ["วันที่ของข้อมูล",item.date ? thaiDate(item.date) : "—"],
    ["เครื่องจักร / หมวด Manual",item.sheetName], ["ผู้บันทึก",item.operatorName],
    ["จำนวนแพ็คที่ได้",item.enteredPack ?? "—"], ["จำนวนเสียจากสกรีน",item.missingBottles ?? "—"],
    ["จำนวนเสียจากผลิต",item.productionDamagedBottles ?? "—"],
    ["หมายเหตุ",item.note || "—"], ["บันทึกเมื่อ",item.createdAt ? thaiDateTime(item.createdAt) : "—"],
    ["รหัสรายการ",item.id || "—"]
  ];
  return '<article class="screen-record"><div class="list-row"><div class="list-main"><div class="list-title">' + escapeHtml(item.sheetName) + ' · ' + escapeHtml(item.operatorName || "—") + '</div><div class="list-meta">' + escapeHtml(item.date ? thaiDate(item.date) : "—") + ' · แพ็ค ' + escapeHtml(item.enteredPack ?? "—") + ' · เสียจากสกรีน ' + escapeHtml(item.missingBottles ?? "—") + ' · เสียจากผลิต ' + escapeHtml(item.productionDamagedBottles ?? "—") + '</div></div><span class="badge badge-info">Supabase</span></div><details class="screen-record-details" data-live-key="' + escapeHtml(item.id) + '"><summary>ดูรายละเอียดข้อมูลสกรีน</summary><dl class="work-manager-fields">' + fields.map(([label,value]) => '<div><dt>' + escapeHtml(label) + '</dt><dd>' + escapeHtml(String(value ?? "—")) + '</dd></div>').join("") + '</dl></details></article>';
}).join("");

export async function render(root, context) {
  if (context.workspace === "employee" && ["employee","admin"].includes(context.user.role)) {
    const work = await import('../work-session/index.js?v=1.3.333');
    return work.render(root,{...context,workType:'ผลิต'});
  }
  root.innerHTML = '<div class="page-loading"><span class="loading-spinner"></span><span>กำลังโหลดข้อมูลสกรีน…</span></div>';
  const rows = await screenApi.readScreenManualEntries();
  const canCreate = isScreenEmployee(context.user) || (context.user.role === "admin" && context.workspace === "employee");
  const totalPack = rows.reduce((sum, row) => sum + Number(row.enteredPack || 0), 0);
  const screenDefects = rows.reduce((sum, row) => sum + Number(row.missingBottles || 0), 0);
  const productionDefects = rows.reduce((sum, row) => sum + Number(row.productionDamagedBottles || 0), 0);
  root.innerHTML =
    '<div class="page-heading"><div><p class="eyebrow">Screen Manual • Package 01</p><h1>' + (canCreate ? 'งานสกรีน' : 'ข้อมูลสกรีน') + '</h1><p>' +
    (canCreate ? 'บันทึกยอดประจำวันตามแบบหน้า Manual' : 'ดูรายการที่พนักงานบันทึก') + '</p></div></div>' +
    '<p class="notice notice-warning">รายการบันทึกงานสกรีนอ่านและเขียนผ่าน Supabase</p>' +
    '<div class="grid grid-3 attendance-section">' + statCard("จำนวนแพ็ค", String(totalPack), "ข้อมูลจาก Supabase") +
      statCard("เสียจากสกรีน", String(screenDefects), "ข้อมูลจาก Supabase") +
      statCard("เสียจากผลิต", String(productionDefects), "ข้อมูลจาก Supabase") + '</div>' +
    (canCreate ? '<section class="card form-card" style="margin-top:.8rem"><h2>บันทึกข้อมูลประจำวัน</h2><form id="screen-manual-form" style="margin-top:.8rem"><div class="form-grid">' +
      '<div class="field"><label for="entryDate">วันที่</label><input id="entryDate" name="date" type="date" value="' + escapeHtml(bangkokToday()) + '" readonly required></div>' +
      '<div class="field"><label for="entrySheet">เครื่องจักร</label><select id="entrySheet" name="sheetName" required><option value="">เลือกเครื่อง</option>' + machines.map(machine => '<option value="' + escapeHtml(machine) + '">' + escapeHtml(machine) + '</option>').join("") + '</select></div>' +
      '<div class="field"><label for="enteredPack">จำนวนแพ็คที่ได้ของวันนี้</label><input id="enteredPack" name="enteredPack" type="number" min="0" step="any" inputmode="decimal" placeholder="เว้นว่างถ้าไม่บันทึก"></div>' +
      '<div class="field"><label for="missingBottles">จำนวนเสียจากสกรีน</label><input id="missingBottles" name="missingBottles" type="number" min="0" step="any" inputmode="decimal" placeholder="เว้นว่างถ้าไม่บันทึก"></div>' +
      '<div class="field"><label for="productionDamagedBottles">จำนวนเสียจากผลิต</label><input id="productionDamagedBottles" name="productionDamagedBottles" type="number" min="0" step="any" inputmode="decimal" placeholder="เว้นว่างถ้าไม่บันทึก"></div>' +
      '<div class="field"><label for="operatorName">ผู้บันทึก</label><input id="operatorName" name="operatorName" value="' + escapeHtml(context.user.name) + '" readonly required><p class="small-muted">ยืนยันจากบัญชีที่เข้าสู่ระบบ</p></div>' +
      '<div class="field field-full"><label for="entryNote">หมายเหตุ</label><textarea id="entryNote" name="note" maxlength="500" placeholder="กรอกหมายเหตุ (ถ้ามี)"></textarea></div>' +
    '</div><div class="form-actions"><button class="button button-primary" type="submit">ตรวจสอบและบันทึก</button><button class="button" type="reset">ล้างค่า</button></div></form></section>' : '') +
    '<div class="section-title"><div><h2>รายการบันทึกล่าสุด</h2><p>แสดงสูงสุด 8 รายการ</p></div></div>' +
    '<section class="card card-pad"><div class="list">' + (rows.length ? renderRows(rows) : '<div class="empty-state">ยังไม่มีข้อมูลสกรีน</div>') + '</div></section>' +
    '<p class="small-muted" style="margin-top:.8rem">ข้อมูลสกรีนเชื่อมกับ Supabase</p>';
  const form = root.querySelector("#screen-manual-form");
  form?.addEventListener("submit", async event => {
    event.preventDefault();
    if (!requireOnlineAction("งานสกรีน")) return;
    const button = form.querySelector('[type="submit"]');
    if (button.disabled) return;
    const values = Object.fromEntries(new FormData(form));
    const countFields = ["enteredPack", "missingBottles", "productionDamagedBottles"];
    if (!countFields.some(key => values[key] !== "") || countFields.some(key => values[key] !== "" && (!Number.isFinite(Number(values[key])) || Number(values[key]) < 0))) {
      context.showToast("กรอกจำนวนตั้งแต่ 0 ขึ้นไปอย่างน้อยหนึ่งช่อง", "error"); return;
    }
    button.disabled = true; button.textContent = "กำลังบันทึก…";
    try {
      await screenApi.saveScreenManualEntry(values);
      context.showToast("บันทึกงานสกรีนลง Supabase แล้ว", "success");
      await render(root, context);
    } catch (error) {
      context.showToast(error.message || "บันทึกไม่สำเร็จ", "error");
      button.disabled = false; button.textContent = "ตรวจสอบและบันทึก";
    }
  });
}


