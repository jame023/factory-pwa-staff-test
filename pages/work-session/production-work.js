import * as workApi from "../../adapters/package07.js?v=1.3.267";
import { bangkokToday, escapeHtml, thaiDate, thaiDateTime } from "../../js/utils.js?v=1.3.186";
import { showStatusModal, isStatusModalOpen } from "../../components/status-modal.js?v=1.3.295";

const moneyless = value => new Intl.NumberFormat("th-TH").format(Number(value || 0));
const versionOf = row => Number(row?.version || 0);

export async function renderProductionWorkPanel(root, context, { active = null, onRefresh = () => {} } = {}) {
  if (!root || context.signal?.aborted) return;
  const today = bangkokToday();
  root.dataset.productionFrom ||= today;
  root.dataset.productionTo ||= today;
  root.dataset.productionOffset ||= "0";
  const from=root.dataset.productionFrom,to=root.dataset.productionTo,offset=Number(root.dataset.productionOffset||0),pageSize=20;
  let activeRows = { items: [] }, daily = null, history = null, loadError = "";
  try {
    const [activeResult, dailyResult, historyResult] = await Promise.all([
      active ? workApi.readProductionWork({ sessionIds: [active.id], limit: 1 }) : Promise.resolve({ items: [] }),
      workApi.readProductionWork({ from: today, to: today, limit: 20, offset: 0 }),
      workApi.readProductionWork({ from, to, limit: pageSize, offset }),
    ]);
    activeRows = activeResult;
    daily = dailyResult;
    history = historyResult;
  } catch (error) { loadError = error.message || "โหลดงานผลิตไม่สำเร็จ"; }
  if (context.signal?.aborted) return;
  const saved = activeRows.items?.find(row => row.work_session_id === active?.id) || null;
  const readError = loadError ? '<div class="notice notice-error" role="alert">' + escapeHtml(loadError) + ' <button type="button" class="button" data-production-retry>ลองใหม่</button></div>' : '';
  root.innerHTML =
    '<section class="card card-pad production-work-panel"><div class="section-title"><div><p class="eyebrow">PASS 5.3</p><h2>ข้อมูลการผลิต</h2><p>บันทึกจำนวนครั้งเดียว ระบบใช้ยอดเดียวกันตอนจบงาน</p></div></div>' +
    readError +
    (active ? '<div class="form-grid"><label class="field">วันที่ของงาน<input type="date" readonly value="' + escapeHtml(saved?.work_date || today) + '"></label>' +
      '<label class="field">ผู้บันทึก<input readonly value="' + escapeHtml(context.user.name) + '"></label>' +
      '<label class="field">เครื่องจักร<input readonly value="' + escapeHtml(active.machine || "") + '"></label>' +
      '<label class="field">สถานะ<input readonly value="กำลังทำงาน"></label></div>' +
      (saved ? '<div class="grid grid-3 attendance-section"><div><strong>ผลิต ' + moneyless(saved.quantity) + ' ใบ</strong></div><div><strong>เสีย ' + moneyless(saved.defective) + ' ใบ</strong></div><div><strong>ดี ' + moneyless(saved.good_quantity) + ' ใบ</strong></div></div>' +
        '<p class="list-meta">อัปเดต ' + escapeHtml(thaiDateTime(saved.updated_at)) + ' · รุ่นข้อมูล ' + versionOf(saved) + '</p>' : '') +
      '<form id="production-work-form" class="form-card"><h3>' + (saved ? 'แก้ไขข้อมูลระหว่างงาน' : 'บันทึกข้อมูลผลิต') + '</h3>' +
        '<div class="form-grid"><label class="field">จำนวนผลิต (ใบ)<input name="quantity" type="number" min="1" max="1000000000" step="1" inputmode="numeric" required value="' + escapeHtml(saved?.quantity ?? "") + '"></label>' +
        '<label class="field">ของเสีย (ใบ)<input name="defective" type="number" min="0" max="1000000000" step="1" inputmode="numeric" required value="' + escapeHtml(saved?.defective ?? 0) + '"></label>' +
        '<label class="field field-full">หมายเหตุ<textarea name="note" maxlength="500">' + escapeHtml(saved?.note || "") + '</textarea></label></div>' +
        '<p class="help-text">จำนวนดีคำนวณอัตโนมัติ = จำนวนผลิต − ของเสีย · หน่วย “ใบ” · ของเสียต้องไม่เกินจำนวนผลิต</p>' +
        '<div class="form-actions"><button class="button button-primary" type="submit" ' + (loadError ? 'disabled' : '') + '>' + (saved ? 'บันทึกการแก้ไข' : 'บันทึกข้อมูลผลิต') + '</button></div></form>' +
      (!saved ? '<p class="notice notice-warning">บันทึกข้อมูลผลิตก่อนจบงาน จำนวนตอนจบจะใช้ยอดผลิตชุดนี้โดยอัตโนมัติ</p>' : '')
      : '<p class="notice notice-info">เริ่มงานผลิตเพื่อบันทึกรายละเอียดใน session เดิม</p>') +
    '<div class="section-title"><div><h3>สรุปวันนี้ · ' + escapeHtml(thaiDate(today)) + '</h3><p>เฉพาะรายละเอียดที่บันทึกแล้ว ทั้งงานกำลังทำและงานจบแล้ว; ไม่นับร่างหรือฟอร์มผลิตครั้งเดียวเก่า</p></div></div>' +
    '<div class="grid grid-3 attendance-section"><div class="card card-pad"><span>ยอดผลิต</span><strong>' + moneyless(daily?.total_quantity) + ' ใบ</strong></div><div class="card card-pad"><span>ของเสีย</span><strong>' + moneyless(daily?.total_defective) + ' ใบ</strong></div><div class="card card-pad"><span>จำนวนดี</span><strong>' + moneyless(daily?.total_good) + ' ใบ</strong></div></div>' +
    '<div class="section-title"><div><h3>ประวัติงานผลิต</h3><p>เรียงวันที่และเวลาเริ่มงานล่าสุดก่อน · หน้า ' + (Math.floor(offset/pageSize)+1) + ' / ' + Math.max(1, Math.ceil(Number(history?.total_count || 0) / pageSize)) + '</p></div></div>' +
    '<form data-production-history-filter class="form-grid"><label class="field">ตั้งแต่วันที่<input type="date" name="from" value="' + escapeHtml(from) + '"></label><label class="field">ถึงวันที่<input type="date" name="to" value="' + escapeHtml(to) + '"></label><div class="form-actions"><button class="button button-primary" type="submit">ค้นหาประวัติ</button></div></form>' +
    '<section class="card card-pad"><div class="list">' + (history?.items?.length ? history.items.map(row =>
      '<article class="list-row"><div class="list-main"><div class="list-title">' + escapeHtml(row.machine || "เครื่องจักร") + ' · ' + escapeHtml(thaiDate(row.work_date)) + '</div>' +
      '<div class="list-meta">' + escapeHtml(row.ended_at ? 'จบแล้ว' : 'กำลังทำงาน') + ' · ' + escapeHtml(row.started_at ? thaiDateTime(row.started_at) : "—") + ' – ' + escapeHtml(row.ended_at ? thaiDateTime(row.ended_at) : "กำลังทำงาน") + '</div>' +
      '<p>ผลิต ' + moneyless(row.quantity) + ' ใบ · เสีย ' + moneyless(row.defective) + ' ใบ · ดี ' + moneyless(row.good_quantity) + ' ใบ</p>' +
      (row.note ? '<p class="list-meta">หมายเหตุ: ' + escapeHtml(row.note) + '</p>' : '') +
      '<details><summary>ดูรายละเอียดงาน</summary><dl class="work-manager-fields"><div><dt>ผู้บันทึก</dt><dd>' + escapeHtml(row.employee || "—") + '</dd></div><div><dt>วันที่ธุรกิจ</dt><dd>' + escapeHtml(thaiDate(row.work_date)) + '</dd></div><div><dt>รหัสงาน</dt><dd>' + escapeHtml(row.work_session_id) + '</dd></div><div><dt>รหัสรายละเอียด</dt><dd>' + escapeHtml(row.id) + '</dd></div></dl></details></div><span class="badge ' + (row.ended_at ? 'badge-success' : 'badge-info') + '">' + (row.ended_at ? 'จบแล้ว' : 'กำลังทำงาน') + '</span></article>'
    ).join("") : '<div class="empty-state">ยังไม่มีรายละเอียดผลิตที่บันทึกในวันนี้</div>') + '</div></section>' +
    '<div class="form-actions"><button class="button" type="button" data-production-history-refresh>โหลดใหม่</button>' + (offset>0?'<button class="button" type="button" data-production-history-prev>หน้าก่อน</button>':'') + (offset+pageSize<Number(history?.total_count||0)?'<button class="button" type="button" data-production-history-next>หน้าถัดไป</button>':'') + '</div>' +
    '<p class="notice notice-warning">แบบฟอร์มผลิตครั้งเดียวเดิมยังเก็บแยกในส่วน “แบบฟอร์มเดิม” ด้านล่าง และไม่รวมในยอดของงานผลิตแบบ session</p></section>';

  root.querySelector('[data-production-retry]')?.addEventListener('click', () => renderProductionWorkPanel(root, context, { active, onRefresh }));
  root.querySelector('[data-production-history-refresh]')?.addEventListener('click', () => renderProductionWorkPanel(root, context, { active, onRefresh }));
  root.querySelector('[data-production-history-filter]')?.addEventListener('submit', event=>{
    event.preventDefault(); const values=Object.fromEntries(new FormData(event.currentTarget));
    if(!values.from||!values.to||values.to<values.from){context.showToast('เลือกช่วงวันที่ให้ถูกต้อง','error');return;}
    root.dataset.productionFrom=values.from;root.dataset.productionTo=values.to;root.dataset.productionOffset='0';
    renderProductionWorkPanel(root,context,{active,onRefresh});
  });
  const movePage = delta=>{root.dataset.productionOffset=String(Math.max(0,offset+delta*pageSize));renderProductionWorkPanel(root,context,{active,onRefresh});};
  root.querySelector('[data-production-history-prev]')?.addEventListener('click',()=>movePage(-1));
  root.querySelector('[data-production-history-next]')?.addEventListener('click',()=>movePage(1));

  const form = root.querySelector('#production-work-form');
  form?.addEventListener('input', () => { form.dataset.dirty = 'true'; delete form.dataset.requestId; });
  form?.addEventListener('change', () => { form.dataset.dirty = 'true'; delete form.dataset.requestId; });
  form?.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('[type="submit"]');
    if (button.disabled || isStatusModalOpen()) return;
    const values = Object.fromEntries(new FormData(form));
    const quantity = Number(values.quantity), defective = Number(values.defective);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000000000 || !Number.isInteger(defective) || defective < 0 || defective > quantity || values.note.length > 500) {
      context.showToast('ตรวจจำนวนผลิตและของเสียให้เป็นจำนวนเต็ม หน่วยใบ และของเสียไม่เกินยอดผลิต', 'error'); return;
    }
    const requestId = form.dataset.requestId || crypto.randomUUID(); form.dataset.requestId = requestId;
    const modal = showStatusModal({ title: 'กำลังบันทึกข้อมูลผลิต', message: 'กำลังตรวจสอบสิทธิ์และข้อมูล', tone: 'working' });
    button.disabled = true;
    try {
      await workApi.saveProductionWork({ workSessionId: active.id, requestId, expectedVersion: versionOf(saved), quantity, defective, note: values.note });
      if (context.signal?.aborted) { modal.close(); return; }
      modal.update({ title: 'บันทึกสำเร็จ', message: 'ข้อมูลผลิตถูกบันทึกและอ่านกลับจาก Supabase แล้ว', tone: 'success' });
      form.dataset.dirty = 'false';
      setTimeout(() => { modal.close(); onRefresh(); }, 650);
    } catch (error) {
      if (context.signal?.aborted) { modal.close(); return; }
      modal.update({ title: 'บันทึกไม่สำเร็จ', message: error.message || 'บันทึกข้อมูลผลิตไม่สำเร็จ', detail: 'ค่าที่กรอกยังอยู่ในแบบฟอร์ม กรุณาโหลดข้อมูลล่าสุดก่อนลองอีกครั้งหากเกิด Conflict', tone: 'error', close: () => modal.close() });
      button.disabled = false;
    }
  });
}
