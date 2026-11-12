import * as screenApi from "../../adapters/package07.js?v=1.3.264";
import { bangkokToday, escapeHtml, thaiDate, thaiDateTime } from "../../js/utils.js?v=1.3.264";
import { showStatusModal, isStatusModalOpen } from "../../components/status-modal.js?v=1.3.295";
import { requireOnlineAction } from "../../js/offline.js?v=1.3.186";

const intValue = value => Number.isInteger(Number(value)) && Number(value) >= 0 ? Number(value) : 0;
const businessDateOf = value => {
  if (!value) return bangkokToday();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return bangkokToday();
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const part = type => parts.find(item => item.type === type)?.value || '';
  return [part('year'), part('month'), part('day')].join('-');
};

function readDraftRows(form) {
  return [...form.querySelectorAll('.screen-work-item')].map(row => ({
    itemNameId: row.querySelector('[name="itemNameId"]').value,
    packCount: row.querySelector('[name="packCount"]').value,
    workPeriod: row.querySelector('[name="workPeriod"]').value
  }));
}

function itemsHTML(items, catalog) {
  const nameCounts = new Map();
  for (const option of catalog) nameCounts.set(option.item_name, (nameCounts.get(option.item_name) || 0) + 1);
  return items.map((item, index) => `
    <div class="card card-pad screen-work-item" data-screen-item="${index}">
      <div class="section-title"><h3>รายการ ${index + 1}</h3>${items.length > 1 && index > 0 ? `<button class="button button-danger" type="button" data-remove-screen-item="${index}">ลบ</button>` : ''}</div>
      <div class="form-grid">
        <div class="field"><label for="screenItemSearch${index}">${index === 0 ? 'ออเดอร์เริ่มงานจาก session' : 'ออเดอร์ / รายการชื่อ'}</label>
          <input id="screenItemSearch${index}" type="search" data-screen-item-search autocomplete="off" placeholder="ค้นหารายการชื่อ" aria-label="ค้นหารายการชื่อแถวที่ ${index + 1}" ${index === 0 ? 'disabled' : ''}>
          <select name="itemNameId" aria-label="เลือกรายการแถวที่ ${index + 1}" required ${index === 0 ? 'disabled' : ''}><option value="">เลือกรายการ</option>${catalog.map(option => { const shortId = String(option.id || '').slice(0, 8); const label = nameCounts.get(option.item_name) > 1 && shortId ? `${option.item_name} · ${shortId}` : option.item_name; return `<option value="${escapeHtml(option.id)}" data-item-name="${escapeHtml(option.item_name)}" data-item-search="${escapeHtml(`${option.item_name} ${shortId}`.toLocaleLowerCase('th'))}" ${option.id === item.itemNameId ? 'selected' : ''}>${escapeHtml(label)}</option>`; }).join('')}</select>
          <p class="small-muted" data-screen-item-empty role="status" hidden>ไม่พบรายการชื่อที่ตรงกัน</p>
        </div>
        <div class="field"><label>จำนวนแพ็คดี</label><input name="packCount" type="number" min="1" step="1" inputmode="numeric" value="${escapeHtml(item.packCount ?? '')}" required></div>
        <div class="field"><label>ช่วงงาน</label><select name="workPeriod"><option value="REGULAR" ${item.workPeriod !== 'OT' ? 'selected' : ''}>ในเวลา</option><option value="OT" ${item.workPeriod === 'OT' ? 'selected' : ''}>OT</option></select></div>
      </div>
    </div>`).join('');
}

export async function renderScreenWorkPanel(root, context, { active, sessions, catalog, records, legacyEntries = [], onRefresh, recoverDraft = null }) {
  const savedById = new Map(records.map(row => [row.work_session_id, row]));
  const panel = root.querySelector('[data-screen-work-panel]');
  if (!panel) return;
  const today = bangkokToday();
  const reportDate = panel.dataset.reportDate || today;
  const historyPage = Math.max(0, Number(panel.dataset.historyPage || 0));
  const dayRows = records.filter(row => row.work_date === reportDate);
  const totals = dayRows.reduce((sum, row) => {
    sum.packs += row.items.reduce((n, item) => n + intValue(item.pack_count), 0);
    sum.regular += row.items.filter(item => item.work_period === 'REGULAR').reduce((n, item) => n + intValue(item.pack_count), 0);
    sum.ot += row.items.filter(item => item.work_period === 'OT').reduce((n, item) => n + intValue(item.pack_count), 0);
    sum.screenDefects += intValue(row.screen_defect_bottles);
    sum.productionDefects += intValue(row.production_defect_bottles);
    return sum;
  }, { packs: 0, regular: 0, ot: 0, screenDefects: 0, productionDefects: 0 });
  const activeData = active ? savedById.get(active.id) : null;
  const items = activeData
    ? activeData.items.map(row => ({ itemNameId: row.item_name_id, packCount: row.pack_count, workPeriod: row.work_period, itemNameSnapshot: row.item_name_snapshot }))
    : active?.itemNameId ? [{ itemNameId: active.itemNameId, packCount: '', workPeriod: 'REGULAR', itemNameSnapshot: active.orderName }]
      : [{ itemNameId: '', packCount: '', workPeriod: 'REGULAR' }];
  const options = [...catalog];
  if (active?.itemNameId && !options.some(option => option.id === active.itemNameId)) {
    options.push({ id: active.itemNameId, item_name: active.orderName || 'รายการเริ่มงาน (ปิดใช้งาน)' });
  }
  for (const item of items) if (item.itemNameId && !options.some(option => option.id === item.itemNameId)) {
    options.push({ id: item.itemNameId, item_name: item.itemNameSnapshot || active?.orderName || 'รายการเดิม (ปิดใช้งาน)' });
  }
  const history = [...sessions].filter(row => row.workType === 'สกรีน' && row.employeeId === context.user.id).sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
  const historyRows = history.slice(historyPage * 20, (historyPage + 1) * 20);
  const details = row => `<div class="list-meta">${(row?.items || []).map(item => `${escapeHtml(item.item_name_snapshot)} · ${escapeHtml(item.pack_count)} แพ็ค · ${item.work_period === 'OT' ? 'OT' : 'ในเวลา'}`).join('<br>')}${row?.items?.length ? `<br>ของเสีย: สกรีน ${escapeHtml(row.screen_defect_bottles)} ขวด · ผลิต ${escapeHtml(row.production_defect_bottles)} ขวด` : row ? `บันทึกแล้ว: ไม่มีแพ็คดี · เสียจากสกรีน ${escapeHtml(row.screen_defect_bottles)} ขวด · เสียจากผลิต ${escapeHtml(row.production_defect_bottles)} ขวด` : 'ยังไม่มีรายละเอียดที่บันทึก'}</div>`;

  panel.innerHTML = `
    <section class="card card-pad"><h2>ข้อมูลงานสกรีน</h2><div class="form-grid">
      <div class="field"><label>วันที่ธุรกิจ</label><input value="${escapeHtml(active ? thaiDate(businessDateOf(active.startedAt)) : thaiDate(today))}" readonly></div>
      <div class="field"><label>ผู้บันทึก</label><input value="${escapeHtml(context.user.name)}" readonly></div>
      <div class="field"><label>เครื่องจักร</label><input value="${escapeHtml(active?.machine || 'เลือกเมื่อเริ่มงาน')}" readonly></div>
      <div class="field"><label>สถานะและเวลาเริ่ม</label><input value="${escapeHtml(active ? `กำลังทำงาน · ${thaiDateTime(active.startedAt)}` : 'ยังไม่ได้เริ่มงาน')}" readonly></div>
    </div></section>
    <section class="card card-pad" style="margin-top:.8rem"><div class="section-title"><div><h2>รายละเอียดรายการ</h2><p>จำนวนแพ็คหมายถึงแพ็คดีที่ได้ · ของเสียเป็นจำนวนขวดต่อทั้งงาน</p></div></div>
      ${active?.itemNameId ? `<form id="screen-work-form" data-version="${escapeHtml(activeData?.version || 0)}" data-dirty="false" data-zero-output="${activeData && !activeData.items.length ? 'true' : 'false'}"><div id="screen-work-items">${itemsHTML(items, options)}</div>
        <p data-zero-output-note class="notice notice-info" ${items.length ? 'hidden' : ''}>ไม่มีแพ็คดีในงานนี้ คุณยังระบุของเสียและหมายเหตุแล้วบันทึกเพื่อจบงานได้</p>
        <div class="form-actions"><button class="button" type="button" id="add-screen-item">เพิ่มรายการ</button><button class="button" type="button" id="screen-no-good-packs">${activeData?.items?.length ? 'แทนที่รายการเป็นงานไม่มีแพ็คดี' : 'งานนี้ไม่มีแพ็คดี'}</button></div>
        <div class="form-grid" style="margin-top:.8rem">
          <div class="field"><label>เสียจากสกรีน (ขวด)</label><input name="screenDefectBottles" type="number" min="0" step="1" value="${escapeHtml(activeData?.screen_defect_bottles ?? 0)}" required></div>
          <div class="field"><label>เสียจากผลิต (ขวด)</label><input name="productionDefectBottles" type="number" min="0" step="1" value="${escapeHtml(activeData?.production_defect_bottles ?? 0)}" required></div>
          <div class="field field-full"><label>หมายเหตุ</label><textarea name="screenNote" maxlength="500">${escapeHtml(activeData?.note || '')}</textarea></div>
        </div>
        <div class="form-grid"><div class="field"><label>ยอดร่างที่ยังไม่บันทึก</label><input data-draft-total readonly value="${items.reduce((n, item) => n + intValue(item.packCount), 0)} แพ็คดี"></div>
          <div class="field"><label>ของเสียในร่าง</label><input data-draft-defects readonly value="${activeData?.screen_defect_bottles || 0} + ${activeData?.production_defect_bottles || 0} ขวด (แยกประเภท)"></div></div>
        <div class="form-actions"><button class="button button-primary" type="submit">บันทึกรายละเอียด</button></div>
      </form>` : active ? '<p class="empty-state">session สกรีนเดิมนี้ไม่มีรหัสรายการที่จำเป็นสำหรับรายละเอียดหลายรายการ จึงเพิ่มรายละเอียดไม่ได้ แต่ยังจบงานด้วยแบบฟอร์มเดิมได้</p>' : '<p class="empty-state">เริ่มงานสกรีนก่อน แล้วจึงเพิ่มและบันทึกรายละเอียดใน session เดิม</p>'}
    </section>
    <section class="card card-pad" style="margin-top:.8rem"><h2>สรุปรายวันจากข้อมูลที่บันทึกแล้ว</h2>
      <div class="field"><label for="screen-report-date">วันที่ไทยเริ่มงาน</label><input id="screen-report-date" type="date" value="${escapeHtml(reportDate)}"></div>
      <p>รวม session ที่กำลังทำและจบแล้วซึ่งบันทึกรายละเอียดแล้ว</p>
      <div class="grid grid-3"><div><strong>${totals.packs}</strong><br>แพ็คดีรวม</div><div><strong>${totals.regular}</strong><br>ในเวลา</div><div><strong>${totals.ot}</strong><br>OT</div></div>
      <p>ของเสียแยกหน่วย: เสียจากสกรีน ${totals.screenDefects} ขวด · เสียจากผลิต ${totals.productionDefects} ขวด</p>
    </section>
    <section class="card card-pad" style="margin-top:.8rem"><h2>ประวัติงานสกรีนของฉัน</h2><div class="list">${history.length ? historyRows.map(row => `<details class="screen-record-details"><summary>${escapeHtml(thaiDateTime(row.startedAt))} · ${escapeHtml(row.machine)} · ${row.endedAt ? 'จบแล้ว' : 'กำลังทำงาน'}</summary>${details(savedById.get(row.id))}</details>`).join('') : '<div class="empty-state">ยังไม่มีประวัติงานสกรีน</div>'}</div>
      <div class="form-actions"><button class="button" type="button" data-history-prev ${historyPage === 0 ? 'disabled' : ''}>ก่อนหน้า</button><span>หน้า ${historyPage + 1} / ${Math.max(1, Math.ceil(history.length / 20))}</span><button class="button" type="button" data-history-next ${(historyPage + 1) * 20 >= history.length ? 'disabled' : ''}>ถัดไป</button></div>
    </section>
    <section class="card card-pad" style="margin-top:.8rem"><h2>ประวัติบันทึกเดิม</h2><p>ข้อมูลก่อน Pass 5.2 คงไว้ และไม่นำมารวมในสรุป session เพื่อป้องกันยอดซ้ำ</p><div class="list">${legacyEntries.length ? legacyEntries.slice(0, 20).map(row => `<article class="list-row"><div class="list-main"><div class="list-title">${escapeHtml(row.sheetName || 'งานสกรีน')} · ${escapeHtml(row.operatorName || '—')}</div><div class="list-meta">${escapeHtml(row.date || '—')} · ${escapeHtml(row.enteredPack ?? '—')} แพ็คดี · เสียจากสกรีน ${escapeHtml(row.missingBottles ?? '—')} ขวด · เสียจากผลิต ${escapeHtml(row.productionDamagedBottles ?? '—')} ขวด</div></div></article>`).join('') : '<div class="empty-state">ไม่มีรายการเดิม</div>'}</div></section>`;

  const refreshPanel = () => {
    const currentForm = panel.querySelector('#screen-work-form');
    const draft = currentForm?.dataset.dirty === 'true' ? {
      rows: readDraftRows(currentForm), version: currentForm.dataset.version, requestId: currentForm.dataset.requestId || '',
      zeroOutput: currentForm.dataset.zeroOutput === 'true',
      screenDefectBottles: currentForm.elements.screenDefectBottles.value,
      productionDefectBottles: currentForm.elements.productionDefectBottles.value,
      note: currentForm.elements.screenNote.value
    } : null;
    renderScreenWorkPanel(root, context, { active, sessions, catalog, records, legacyEntries, onRefresh });
    if (!draft) return;
    const nextForm = panel.querySelector('#screen-work-form');
    if (!nextForm) return;
    nextForm.dataset.version = draft.version;
    nextForm.dataset.dirty = 'true';
    if(draft.zeroOutput)nextForm.dataset.zeroOutput = 'true';
    if (draft.requestId) nextForm.dataset.requestId = draft.requestId;
    panel.querySelector('#screen-work-items').innerHTML = itemsHTML(draft.rows, options);
    nextForm.querySelector('[data-zero-output-note]').hidden = !draft.zeroOutput;
    nextForm.elements.screenDefectBottles.value = draft.screenDefectBottles;
    nextForm.elements.productionDefectBottles.value = draft.productionDefectBottles;
    nextForm.elements.screenNote.value = draft.note;
    nextForm.querySelector('[data-draft-total]').value = draft.rows.reduce((n, item) => n + intValue(item.packCount), 0) + ' แพ็คดี';
    nextForm.querySelector('[data-draft-defects]').value = `${intValue(draft.screenDefectBottles)} + ${intValue(draft.productionDefectBottles)} ขวด (แยกประเภท)`;
  };
  panel.querySelector('#screen-report-date').addEventListener('change', event => { panel.dataset.reportDate = event.target.value; refreshPanel(); });
  panel.querySelector('[data-history-prev]').addEventListener('click', () => { panel.dataset.historyPage = String(Math.max(0, historyPage - 1)); refreshPanel(); });
  panel.querySelector('[data-history-next]').addEventListener('click', () => { panel.dataset.historyPage = String(Math.min(Math.ceil(history.length / 20) - 1, historyPage + 1)); refreshPanel(); });

  const form = panel.querySelector('#screen-work-form');
  if (!form) {
    if(recoverDraft)panel.insertAdjacentHTML('afterbegin', `<p class="notice notice-danger">session เปลี่ยนสถานะแล้ว รายการที่กรอกไว้ยังไม่ถูกบันทึก: ${escapeHtml(recoverDraft.rows.map(item => `${options.find(option => option.id === item.itemNameId)?.item_name || 'รายการ'} ${item.packCount || 0} แพ็ค`).join(' · ') || 'ไม่มีแพ็คดี')} · เสียจากสกรีน ${escapeHtml(recoverDraft.screenDefectBottles)} ขวด · เสียจากผลิต ${escapeHtml(recoverDraft.productionDefectBottles)} ขวด · หมายเหตุ ${escapeHtml(recoverDraft.note || '—')}</p>`);
    return;
  }
  const refreshDraft = () => {
    form.querySelector('[data-draft-total]').value = readDraftRows(form).reduce((n, item) => n + intValue(item.packCount), 0) + ' แพ็คดี';
    form.querySelector('[data-draft-defects]').value = `${intValue(form.elements.screenDefectBottles.value)} + ${intValue(form.elements.productionDefectBottles.value)} ขวด (แยกประเภท)`;
  };
  if(recoverDraft){
    form.insertAdjacentHTML('beforebegin','<p class="notice notice-danger">ข้อมูลที่บันทึกใน Supabase เปลี่ยนจากอีกหน้าต่างแล้ว ระบบโหลด version ล่าสุดและเก็บข้อมูลเดิมที่กำลังกรอกเป็นร่างแยก กรุณาเทียบกับรายการที่บันทึกก่อนส่งใหม่</p>');
    form.dataset.version=String(activeData?.version||0);
    form.dataset.dirty='true';
    form.dataset.zeroOutput=recoverDraft.zeroOutput?'true':'false';
    delete form.dataset.requestId;
    panel.querySelector('#screen-work-items').innerHTML=itemsHTML(recoverDraft.rows,options);
    form.querySelector('[data-zero-output-note]').hidden=!recoverDraft.zeroOutput;
    form.elements.screenDefectBottles.value=recoverDraft.screenDefectBottles;
    form.elements.productionDefectBottles.value=recoverDraft.productionDefectBottles;
    form.elements.screenNote.value=recoverDraft.note;
    refreshDraft();
  }
  form.addEventListener('input', event => {
    if (event.target.matches('[data-screen-item-search]')) {
      const row = event.target.closest('.screen-work-item');
      const select = row?.querySelector('[name="itemNameId"]');
      const query = event.target.value.trim().toLocaleLowerCase('th');
      let matches = 0;
      for (const option of [...(select?.options || [])].slice(1)) {
        option.hidden = Boolean(query && option.value !== select.value && !option.dataset.itemSearch.includes(query));
        if (!option.hidden) matches++;
      }
      const empty = row?.querySelector('[data-screen-item-empty]');
      if (empty) empty.hidden = matches > 0;
      return;
    }
    form.dataset.dirty = 'true'; delete form.dataset.requestId; refreshDraft();
  });
  form.addEventListener('change', event => {
    if (event.target.matches('[name="itemNameId"]')) {
      const row = event.target.closest('.screen-work-item');
      const search = row?.querySelector('[data-screen-item-search]');
      if (search) search.value = event.target.selectedOptions[0]?.dataset.itemName || '';
    }
    form.dataset.dirty = 'true'; delete form.dataset.requestId;
  });
  panel.querySelector('#add-screen-item').addEventListener('click', () => {
    form.dataset.dirty = 'true';
    delete form.dataset.zeroOutput;
    delete form.dataset.requestId;
    form.querySelector('[data-zero-output-note]').hidden = true;
    const rows = readDraftRows(form);
    rows.push({ itemNameId: rows.length ? '' : active.itemNameId, packCount: '', workPeriod: 'REGULAR' });
    panel.querySelector('#screen-work-items').innerHTML = itemsHTML(rows, options);
  });
  const setZeroOutput = () => {
    form.dataset.dirty = 'true';
    form.dataset.zeroOutput = 'true';
    delete form.dataset.requestId;
    panel.querySelector('#screen-work-items').innerHTML = '';
    form.querySelector('[data-zero-output-note]').hidden = false;
    refreshDraft();
  };
  panel.querySelector('#screen-no-good-packs')?.addEventListener('click', () => {
    if (activeData?.items?.length) {
      if (isStatusModalOpen()) return;
      let modal;
      modal = showStatusModal({
        title: 'ยืนยันแทนที่รายละเอียดงานสกรีน',
        message: 'รายการที่บันทึกไว้จะถูกแทนที่ด้วยงานที่ไม่มีแพ็คดี และสามารถบันทึกใหม่ได้เฉพาะขณะ session ยังเปิด',
        tone: 'confirm', confirmLabel: 'แทนที่รายการ', confirm: () => { modal.close(); setZeroOutput(); },
        close: () => modal.close()
      });
      return;
    }
    setZeroOutput();
  });
  form.addEventListener('click', event => {
    const button = event.target.closest('[data-remove-screen-item]');
    if (!button) return;
    form.dataset.dirty = 'true';
    delete form.dataset.requestId;
    const rows = readDraftRows(form).filter((_, index) => index !== Number(button.dataset.removeScreenItem));
    panel.querySelector('#screen-work-items').innerHTML = itemsHTML(rows, options);
    refreshDraft();
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!requireOnlineAction('บันทึกรายละเอียดงานสกรีน') || isStatusModalOpen()) return;
    const entries = readDraftRows(form).map((item, index) => ({ item_name_id: item.itemNameId, pack_count: Number(item.packCount), work_period: item.workPeriod, sort_order: index }));
    if ((!entries.length && form.dataset.zeroOutput !== 'true') || entries.some(item => !item.item_name_id || !Number.isInteger(item.pack_count) || item.pack_count < 1)) {
      context.showToast('เลือกรายการและระบุแพ็คดีเป็นจำนวนเต็มมากกว่า 0 ทุกแถว', 'error');
      return;
    }
    const button = form.querySelector('[type="submit"]');
    if (button.disabled) return;
    button.disabled = true;
    const requestId = form.dataset.requestId || crypto.randomUUID();
    form.dataset.requestId = requestId;
    const payload = {
      workSessionId: active.id, requestId, expectedVersion: Number(form.dataset.version), items: entries,
      screenDefectBottles: Number(form.elements.screenDefectBottles.value),
      productionDefectBottles: Number(form.elements.productionDefectBottles.value), note: form.elements.screenNote.value.trim()
    };
    form.querySelectorAll('input,select,textarea,button:not([type="submit"])').forEach(field => { field.disabled = true; });
    const modal = showStatusModal({ title: 'งานสกรีน', message: 'กำลังบันทึกรายละเอียด', tone: 'working' });
    const save = async () => {
      try {
        const saved = await screenApi.saveScreenWork(payload);
        if (context.signal?.aborted) { modal.close(); return; }
        const readback = await screenApi.readScreenWork([active.id]);
        if (context.signal?.aborted) { modal.close(); return; }
        const row = readback.find(item => item.work_session_id === active.id);
        const mismatch = !row || row.version !== saved.version || row.items.length !== entries.length
          || row.items.reduce((n, item) => n + item.pack_count, 0) !== entries.reduce((n, item) => n + item.pack_count, 0)
          || row.screen_defect_bottles !== payload.screenDefectBottles || row.production_defect_bottles !== payload.productionDefectBottles || row.note !== payload.note
          || entries.some((entry, index) => row.items[index]?.item_name_id !== entry.item_name_id || row.items[index]?.pack_count !== entry.pack_count || row.items[index]?.work_period !== entry.work_period);
        if (mismatch) throw Object.assign(new Error('งานถูกเปลี่ยนแปลง กรุณาโหลดข้อมูลล่าสุด'),{code:'CONFLICT'});
        modal.update({ title: 'งานสกรีน', message: 'บันทึกและตรวจสอบข้อมูลกลับแล้ว', tone: 'success', close: () => { modal.close(); onRefresh?.(); } });
      } catch (error) {
        const rejected = ['VALIDATION_ERROR','REQUEST_REJECTED'].includes(error.code);
        modal.update({ title: 'งานสกรีน', message: error.message || 'บันทึกไม่สำเร็จ', detail: rejected ? 'ระบบยืนยันว่าไม่ได้บันทึกคำขอนี้ แก้ไขข้อมูลแล้วส่งใหม่ได้' : 'ข้อมูลยังคงอยู่ หากไม่ทราบผล ให้ลองใหม่ด้วยคำขอเดิมก่อนแก้ไข', tone: 'error', retry: save, close: () => {
          modal.close();
          if(error.code==='CONFLICT'){
            onRefresh?.({recoverScreenDraft:{rows:readDraftRows(form),zeroOutput:form.dataset.zeroOutput==='true',screenDefectBottles:form.elements.screenDefectBottles.value,productionDefectBottles:form.elements.productionDefectBottles.value,note:form.elements.screenNote.value}});
            return;
          }
          if(rejected){
            delete form.dataset.requestId;
            form.querySelectorAll('input,select,textarea,button:not([type="submit"])').forEach(field => {
              field.disabled = field.matches('[name="itemNameId"]') && field.closest('.screen-work-item')?.dataset.screenItem === '0';
            });
          }
          button.disabled = false;
        } });
      }
    };
    await save();
  });
}
