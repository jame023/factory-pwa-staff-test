import { escapeHtml } from '../../js/utils.js?v=1.3.186';
import { showStatusModal, isStatusModalOpen } from '../../components/status-modal.js?v=1.3.186';
import { confirmAction } from '../../components/modal.js?v=1.3.186';
import { createSupabaseItemNameRepository } from '../../js/item-name-admin-repository.js?v=1.3.186';
import { APP_MODE, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../../js/config.js?v=1.3.186';
import { getMachineAdminSession, loginToMachineAdmin, logoutFromMachineAdmin } from '../../js/machine-admin-auth.js?v=1.3.210';

const DATE = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' });
const esc = escapeHtml;
const val = value => String(value ?? '').trim();
const display = value => val(value) || '—';
const inputText = value => value == null ? '' : String(value);
const ITEM_NAME_COLLATOR = new Intl.Collator('th', { numeric: true, sensitivity: 'base' });

function dateText(value) {
  if (!value) return '—';
  try { return DATE.format(new Date(value)); } catch (_) { return '—'; }
}
function messageFor(error) {
  if (error?.code === 'AUTH_REQUIRED' || error?.code === 'SESSION_EXPIRED' || error?.status === 401) return 'Session หมดอายุ';
  if (error?.code === 'PERMISSION_DENIED' || error?.status === 403) return 'ไม่มีสิทธิ์ดำเนินการ';
  if (error?.code === 'DUPLICATE_RECORD' || error?.databaseCode === '23505') return 'พบรายการซ้ำ';
  if (error?.code === 'AUDIT_READBACK_FAILED') return 'ไม่สามารถบันทึกประวัติได้';
  if (error?.code === 'VALIDATION_ERROR' || ['22023', '23514'].includes(error?.databaseCode)) return error.message || 'ข้อมูลไม่ครบหรือไม่ถูกต้อง';
  return error?.message || 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ';
}
function formMarkup(item = null) {
  const row = item || { item_name: '', active: true };
  return '<div class="item-overlay" data-item-overlay><section class="card card-pad item-editor" data-item-editor role="dialog" aria-modal="true" aria-labelledby="item-editor-heading" tabindex="-1"><div class="section-title"><div><p class="eyebrow">Admin · Item Names</p><h2 id="item-editor-heading">' + (item ? 'แก้ไขรายชื่อสินค้า' : 'เพิ่มรายชื่อสินค้า') + '</h2></div><button class="button" type="button" data-cancel-editor autofocus>ปิดฟอร์ม</button></div>' +
    '<div class="item-discard-prompt" data-discard-prompt hidden role="alert"><strong>มีข้อมูลที่ยังไม่ได้บันทึก</strong><p>ต้องการทิ้งข้อมูลที่แก้ไขหรือกลับไปแก้ไขต่อ?</p><div class="form-actions"><button class="button" type="button" data-keep-editing>กลับไปแก้ไข</button><button class="button button-danger" type="button" data-discard-item>ทิ้งข้อมูล</button></div></div>' +
    '<form data-item-form><div class="form-grid">' +
    '<div class="field"><label for="item-name">ชื่อสินค้า</label><input id="item-name" name="item_name" required maxlength="240" value="' + esc(inputText(row.item_name)) + '"></div>' +
    '<div class="field"><label for="item-active">สถานะใช้งาน</label><select id="item-active" name="active"><option value="true"' + (row.active ? ' selected' : '') + '>ใช้งาน</option><option value="false"' + (!row.active ? ' selected' : '') + '>ปิดใช้งาน</option></select></div>' +
    '</div><div class="field"><label for="item-reason">เหตุผลการแก้ไข</label><textarea id="item-reason" name="reason" maxlength="300" placeholder="ระบุเหตุผลเพื่อบันทึกใน Audit Log"></textarea></div>' +
    '<div class="form-actions"><button class="button button-primary" type="submit" data-save-item>ตรวจสอบและบันทึก</button></div></form></section></div>';
}

export async function render(root, context) {
  if (context.signal?.aborted) return;
  let session;
  let keepConnectionModal = false;
  const connectionModal = showStatusModal({ title: 'กำลังเชื่อมต่อ', message: 'กำลังตรวจสอบสิทธิ์' });
  const closeConnectionOnAbort = () => connectionModal.close();
  context.signal?.addEventListener('abort', closeConnectionOnAbort, { once: true });
  try { session = await getMachineAdminSession(); }
  catch (error) {
    if (context.signal?.aborted) return;
    keepConnectionModal = true;
    connectionModal.update({ title: 'เชื่อมต่อไม่สำเร็จ', message: messageFor(error), detail: error.message, tone: 'error', close: () => connectionModal.close() });
    root.innerHTML = '<section class="notice notice-danger"><h1>ตรวจสอบ Session ไม่สำเร็จ</h1><p>' + esc(error.message) + '</p>' + (APP_MODE === 'supabase-line' ? '<a class="button" href="#/admin">กลับหน้า Admin</a>' : '<button class="button button-primary" data-login-item>เข้าสู่ระบบด้วย LINE</button>') + '</section>';
    root.querySelector('[data-login-item]')?.addEventListener('click', async event => {
      const button = event.currentTarget; button.disabled = true;
      const retryModal = showStatusModal({ title: 'กำลังเชื่อมต่อ', message: 'กำลังยืนยันตัวตนด้วย LINE' });
      try { await loginToMachineAdmin(); } catch (err) { retryModal.update({ title: 'เชื่อมต่อไม่สำเร็จ', message: messageFor(err), detail: err.message, tone: 'error' }); context.showToast?.(messageFor(err), 'error'); button.disabled = false; setTimeout(() => retryModal.close(), 1200); }
    });
    return;
  } finally {
    context.signal?.removeEventListener('abort', closeConnectionOnAbort);
    if (!keepConnectionModal && connectionModal.isOpen()) connectionModal.close();
  }
  if (context.signal?.aborted) return;
  if (!session) {
    root.innerHTML = '<section class="card card-pad"><div class="page-heading"><div><p class="eyebrow">Supabase · Item Names</p><h1>จัดการรายชื่อสินค้า</h1><p>' + (APP_MODE === 'supabase-line' ? 'ไม่พบ Session ที่ยืนยันจากแอปหลัก กรุณากลับไปหน้า Admin เพื่อตรวจสอบสถานะบัญชี' : 'เข้าสู่ระบบ LINE เพื่ออ่านข้อมูลตามสิทธิ์ Supabase RLS') + '</p></div></div>' + (APP_MODE === 'supabase-line' ? '<a class="button" href="#/admin">กลับหน้า Admin</a>' : '<button class="button button-primary" data-login-item>เข้าสู่ระบบด้วย LINE</button>') + '</section>';
    root.querySelector('[data-login-item]')?.addEventListener('click', async event => {
      const button = event.currentTarget; button.disabled = true;
      const modal = showStatusModal({ title: 'กำลังเชื่อมต่อ', message: 'กำลังยืนยันตัวตนด้วย LINE' });
      try { await loginToMachineAdmin(); } catch (error) { modal.update({ title: 'เชื่อมต่อไม่สำเร็จ', message: messageFor(error), detail: error.message, tone: 'error' }); button.disabled = false; context.showToast?.(messageFor(error), 'error'); setTimeout(() => modal.close(), 1200); }
    });
    return;
  }

  const role = session.user.role;
  if (role !== 'admin') {
    root.innerHTML = '<section class="notice notice-danger"><h1>ไม่มีสิทธิ์ดำเนินการ</h1><p>หน้านี้สำหรับ Admin เท่านั้น</p></section>';
    const denied = showStatusModal({ title: 'ไม่มีสิทธิ์ดำเนินการ', message: 'หน้านี้สำหรับ Admin เท่านั้น', tone: 'error', close: () => denied.close() });
    return;
  }
  const canWrite = role === 'admin';
  const repository = createSupabaseItemNameRepository({ supabaseUrl: SUPABASE_URL, publishableKey: SUPABASE_PUBLISHABLE_KEY, accessToken: session.accessToken, user: session.user });
  let rows = [];
  let search = '', status = 'all';
  let editor = null, details = null, busy = false, loadError = null;
  let opening = false, editorDirty = false, dialogOpen = false, returnTarget = null, chromeObserver = null;
  const inertBefore = new Map();

  function releaseItemDialog() {
    dialogOpen = false;
    chromeObserver?.disconnect();
    chromeObserver = null;
    document.body.classList.remove('is-item-dialog-open');
    for (const [element, previous] of inertBefore) {
      if ((element.id === 'header-root' || element.id === 'nav-root') && element.hidden) continue;
      element.inert = previous;
    }
    inertBefore.clear();
  }
  function lockItemDialog(overlay) {
    dialogOpen = true;
    document.body.classList.add('is-item-dialog-open');
    const lock = element => {
      if (!inertBefore.has(element)) inertBefore.set(element, element.inert);
      element.inert = true;
    };
    for (const element of document.querySelectorAll('#header-root,#nav-root,#pwa-install-root,.skip-link,#connection-banner,#update-banner')) lock(element);
    for (let current = overlay; current && current !== root; current = current.parentElement) {
      const parent = current.parentElement;
      if (!parent) break;
      for (const sibling of parent.children) if (sibling !== current) lock(sibling);
    }
    const chrome = ['header-root', 'nav-root'].map(id => document.getElementById(id)).filter(Boolean);
    chromeObserver = new MutationObserver(() => {
      if (!dialogOpen || context.signal?.aborted) return;
      for (const element of chrome) if (!element.inert) element.inert = true;
    });
    for (const element of chrome) chromeObserver.observe(element, { attributes: true, attributeFilter: ['inert'] });
  }
  const keepFocusInDialog = event => {
    const overlay = root.querySelector('[data-item-overlay]');
    if (dialogOpen && overlay && !overlay.contains(event.target) && !isStatusModalOpen()) {
      overlay.querySelector('[role="dialog"]')?.focus({ preventScroll: true });
    }
  };
  document.addEventListener('focusin', keepFocusInDialog);
  context.signal?.addEventListener('abort', () => {
    releaseItemDialog();
    document.removeEventListener('focusin', keepFocusInDialog);
  }, { once: true });
  function closeItemDialog() {
    if (busy || opening || isStatusModalOpen()) return;
    if (editor && editorDirty) {
      const prompt = root.querySelector('[data-discard-prompt]');
      if (prompt) {
        const form = root.querySelector('[data-item-form]');
        if (form) form.inert = true;
        prompt.hidden = false;
        prompt.querySelector('[data-keep-editing]')?.focus({ preventScroll: true });
      }
      return;
    }
    editor = null; details = null; editorDirty = false;
    const target = returnTarget;
    returnTarget = null;
    paint();
    if (target) [...root.querySelectorAll(target.selector)].find(button => button.dataset[target.key] === target.id)?.focus({ preventScroll: true });
    else root.querySelector('[data-add-item]')?.focus({ preventScroll: true });
  }

  async function load() {
    if (context.signal?.aborted) return;
    const modal = showStatusModal({ title: 'กำลังเชื่อมต่อ', message: 'กำลังโหลดข้อมูลรายชื่อสินค้า' });
    const closeOnAbort = () => modal.close();
    context.signal?.addEventListener('abort', closeOnAbort, { once: true });
    let keepModalOpen = false;
    try { const loaded = await repository.listItems(filters()); if (context.signal?.aborted) return; rows = loaded; rows.sort((left, right) => ITEM_NAME_COLLATOR.compare(val(left.item_name), val(right.item_name)) || String(left.id).localeCompare(String(right.id))); loadError = null; paint(); }
    catch (error) {
      if (context.signal?.aborted) return;
      keepModalOpen = true;
      loadError = error; paint();
      modal.update({ title: 'โหลดข้อมูลไม่สำเร็จ', message: messageFor(error), detail: error.message, tone: 'error', retry: () => { modal.close(); return load(); }, close: () => modal.close() });
      context.showToast?.(messageFor(error), 'error');
    }
    finally { context.signal?.removeEventListener('abort', closeOnAbort); if (!keepModalOpen) modal.close(); }
  }
  function filters() { return { search, active: status === 'active' ? true : status === 'inactive' ? false : undefined }; }
  function paint() {
    releaseItemDialog();
    if (context.signal?.aborted) return;
    const activeCount = rows.filter(row => row.active).length;
    const inactiveCount = rows.length - activeCount;

    root.innerHTML = '<section class="item-name-admin">' +
      '<div class="page-heading"><div><p class="eyebrow">Supabase · ' + esc(role === 'admin' ? 'Admin' : role === 'employee' ? 'Employee' : 'Executive') + '</p><h1>จัดการรายชื่อสินค้า</h1><p>จัดการชื่อสินค้าที่ใช้ร่วมกันในโรงงาน</p><div class="item-account"><span>กำลังจัดการในฐานะ</span><strong>' + esc(session.user.name) + '</strong><span>สิทธิ์กำหนดจากบัญชี Supabase</span></div></div><div class="form-actions">' + (canWrite ? '<a class="button" href="#/admin">ศูนย์ควบคุม Admin</a>' : '') + (APP_MODE === 'supabase-line' ? '' : '<button class="button" type="button" data-item-logout>ออกจากระบบรายชื่อสินค้า</button>') + '</div></div>' +
      '<section class="item-summary" aria-label="สรุปรายการที่แสดง"><article class="item-summary-card"><span>รายการที่แสดง</span><strong>' + rows.length + '</strong><small>ตามตัวกรองปัจจุบัน</small></article><article class="item-summary-card item-summary-active"><span>ใช้งาน</span><strong>' + activeCount + '</strong><small>พร้อมเลือกใช้</small></article><article class="item-summary-card item-summary-inactive"><span>ปิดใช้งาน</span><strong>' + inactiveCount + '</strong><small>เก็บไว้ดูประวัติ</small></article></section><section class="card card-pad item-toolbar"><div class="section-title"><div><h2>ค้นหาสินค้า</h2><p>พิมพ์ชื่อบางส่วน แล้วเลือกจากรายการที่แสดงได้เลย</p></div>' + (canWrite ? '<button class="button button-primary" type="button" data-add-item>เพิ่มรายชื่อสินค้า</button>' : '') + '</div>' +
      '<form data-item-filters class="item-filter-grid"><div class="field item-search-field"><label for="item-search">ชื่อสินค้า</label><input id="item-search" name="search" maxlength="120" placeholder="พิมพ์ชื่อสินค้าที่ต้องการค้นหา" value="' + esc(search) + '" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="item-name-suggestions"><div class="item-suggestion-panel" data-item-suggestions hidden><p class="item-suggestion-note" data-item-suggestion-note role="status" aria-live="polite"></p><div id="item-name-suggestions" role="listbox" aria-label="ชื่อสินค้าที่ตรงกับคำค้น"></div></div></div>' +
      '<div class="field"><label for="item-status-filter">สถานะ</label><select id="item-status-filter" name="status"><option value="all"' + (status === 'all' ? ' selected' : '') + '>ทุกสถานะ</option><option value="active"' + (status === 'active' ? ' selected' : '') + '>ใช้งาน</option><option value="inactive"' + (status === 'inactive' ? ' selected' : '') + '>ปิดใช้งาน</option></select></div>' +
      '<div class="form-actions"><button class="button" type="submit">ค้นหา</button><button class="button" type="reset">ล้างตัวกรอง</button></div></form></section>' +
      (loadError ? '<section class="notice notice-danger"><h2>' + esc(messageFor(loadError)) + '</h2><p>' + esc(loadError.message) + '</p><button class="button" type="button" data-retry-items>ลองใหม่</button></section>' : '') +
      '<section class="card card-pad item-list"><div class="section-title"><div><h2>รายชื่อสินค้า (' + rows.length + ')</h2><p>เรียงตามชื่อสินค้า ก-ฮ</p></div></div>' +
      (rows.length ? '<div class="table-wrap" tabindex="0" role="region" aria-label="ตารางรายชื่อสินค้า เลื่อนแนวนอนเพื่อดูข้อมูลทั้งหมด"><table><thead><tr><th>ชื่อสินค้า</th><th>สถานะ</th><th>แก้ไขล่าสุด</th><th>การทำงาน</th></tr></thead><tbody>' + rows.map(row => '<tr><td><strong class="item-name">' + esc(display(row.item_name)) + '</strong></td><td>' + (row.active ? '<span class="badge badge-success">ใช้งาน</span>' : '<span class="badge badge-danger">ปิดใช้งาน</span>') + '</td><td>' + esc(dateText(row.updated_at)) + '</td><td><div class="machine-row-actions"><button class="button button-small" type="button" data-item-detail="' + esc(row.id) + '">ดูรายละเอียด</button>' + (canWrite ? '<button class="button button-small" type="button" data-item-edit="' + esc(row.id) + '">แก้ไข</button><button class="button button-small" type="button" data-item-active="' + esc(row.id) + '" data-next-active="' + String(!row.active) + '">' + (row.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน') + '</button>' : '') + '</div></td></tr>').join('') + '</tbody></table></div>' : '<p class="empty-state">ไม่พบรายชื่อสินค้าตามตัวกรอง</p>') +
      (details ? '<div class="item-overlay" data-item-overlay><section class="card card-pad machine-details" role="dialog" aria-modal="true" aria-labelledby="item-detail-heading" tabindex="-1"><div class="section-title"><h2 id="item-detail-heading">รายละเอียดรายชื่อสินค้า</h2><button class="button" type="button" data-close-detail autofocus>ปิด</button></div><dl class="work-manager-fields">' + Object.entries(details).map(([key,value]) => '<div><dt>' + esc(key) + '</dt><dd>' + esc(value ?? '—') + '</dd></div>').join('') + '</dl></section></div>' : '') +
      (canWrite && editor ? formMarkup(editor.id ? editor : null) : '') + '</section></section>';
    bind();
    if (busy) root.querySelectorAll('button,input,select,textarea').forEach(el => { el.disabled = true; });
  }
  async function withBusy(message, operation, success) {
    if (busy) return null;
    busy = true;
    const modal = showStatusModal({ title: 'กำลังดำเนินการ', message });
    root.querySelectorAll('button,input,select,textarea').forEach(el => { el.disabled = true; });
    let keepErrorOpen = false;
    try {
      const result = await operation();
      modal.update({ title: 'ดำเนินการสำเร็จ', message: success, tone: 'success' });
      await new Promise(resolve => setTimeout(resolve, 450));
      modal.close();
      return result;
    } catch (error) {
      keepErrorOpen = true;
      modal.update({ title: 'ดำเนินการไม่สำเร็จ', message: messageFor(error), detail: error.message, tone: 'error', close: () => modal.close() });
      context.showToast?.(messageFor(error), 'error');
      return null;
    } finally {
      if (!keepErrorOpen && modal.isOpen()) modal.close();
      root.querySelectorAll('button,input,select,textarea').forEach(el => { el.disabled = false; });
      busy = false;
    }
  }
  async function verifyMutation(id, expectedActions) {
    const row = await repository.getItemById(id);
    if (!row) throw Object.assign(new Error('บันทึกแล้วแต่ไม่พบข้อมูลเมื่ออ่านกลับจาก Supabase'), { code: 'READBACK_FAILED' });
    for (const action of expectedActions) {
      const logs = await repository.listAuditLogs({ record_id: id, action });
      if (!logs.some(log => log.table_name === 'item_names' && log.record_id === id && log.action === action)) throw Object.assign(new Error('ไม่พบ Audit Log (' + action + ') หลังบันทึก'), { code: 'AUDIT_READBACK_FAILED' });
    }
    return row;
  }
  function bindItemSearch() {
    const input = root.querySelector('#item-search');
    const dropdown = root.querySelector('[data-item-suggestions]');
    const list = root.querySelector('#item-name-suggestions');
    const note = root.querySelector('[data-item-suggestion-note]');
    const statusSelect = root.querySelector('#item-status-filter');
    if (!input || !dropdown || !list || !note) return;
    let timer, generation = 0, matches = [], selected = -1;
    function close() {
      clearTimeout(timer); generation += 1; selected = -1; matches = [];
      dropdown.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
    }
    function highlight(index) {
      selected = index;
      list.querySelectorAll('[role="option"]').forEach((option, i) => option.setAttribute('aria-selected', String(i === index)));
      if (index >= 0) {
        input.setAttribute('aria-activedescendant', 'item-suggestion-' + index);
        list.children[index]?.scrollIntoView({ block: 'nearest' });
      } else input.removeAttribute('aria-activedescendant');
    }
    function choose(index) {
      const item = matches[index];
      if (!item) return;
      input.value = item.item_name;
      search = item.item_name;
      status = statusSelect.value;
      close();
      void load();
    }
    function suggest(event) {
      if (event?.isComposing) { close(); return; }
      close();
      const term = val(input.value);
      if (!term) return;
      const request = generation;
      const selectedStatus = statusSelect.value;
      note.textContent = 'กำลังค้นหาชื่อสินค้า…';
      list.innerHTML = '';
      dropdown.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      timer = setTimeout(async () => {
        try {
           const suggestionModal = showStatusModal({ title: 'กำลังโหลดข้อมูล', message: 'กำลังค้นหารายชื่อสินค้า' });
           let result;
           try { result = await repository.listItems({ search: term, active: selectedStatus === 'active' ? true : selectedStatus === 'inactive' ? false : undefined }); }
           finally { suggestionModal.close(); }
          if (request !== generation || !input.isConnected || val(input.value) !== term || statusSelect.value !== selectedStatus) return;
          matches = result.sort((a,b) => ITEM_NAME_COLLATOR.compare(val(a.item_name),val(b.item_name)) || String(a.id).localeCompare(String(b.id)));
          note.textContent = matches.length ? 'เลือกชื่อสินค้า (' + matches.length + ')' : 'ไม่พบชื่อสินค้าที่ตรงกัน';
          list.innerHTML = matches.map((item,index) => '<div class="item-suggestion" id="item-suggestion-' + index + '" role="option" aria-selected="false" data-item-suggestion="' + index + '"><span>' + esc(item.item_name) + '</span><small>' + (item.active ? 'ใช้งาน' : 'ปิดใช้งาน') + '</small></div>').join('');
        } catch (error) {
          if (request !== generation || !input.isConnected) return;
          note.textContent = messageFor(error) + ' — กดค้นหาเพื่อลองใหม่';
          list.innerHTML = '';
        }
      }, 180);
    }
    input.addEventListener('input', suggest);
    input.addEventListener('compositionend', suggest);
    input.addEventListener('focus', suggest);
    input.addEventListener('blur', close);
    statusSelect.addEventListener('change', close);
    input.addEventListener('keydown', event => {
      if (event.isComposing) return;
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      else if (!dropdown.hidden && matches.length && ['ArrowDown','ArrowUp'].includes(event.key)) {
        event.preventDefault();
        highlight(event.key === 'ArrowDown' ? (selected + 1) % matches.length : (selected <= 0 ? matches.length - 1 : selected - 1));
      } else if (event.key === 'Enter' && !dropdown.hidden && selected >= 0) {
        event.preventDefault(); choose(selected);
      }
    });
    dropdown.addEventListener('pointerdown', event => event.preventDefault());
    dropdown.addEventListener('click', event => {
      const option = event.target.closest('[data-item-suggestion]');
      if (option) choose(Number(option.dataset.itemSuggestion));
    });
  }


  function bind() {
    bindItemSearch();
    root.querySelector('[data-item-logout]')?.addEventListener('click', async event => {
      event.currentTarget.disabled = true;
      try { await logoutFromMachineAdmin(session.accessToken); await render(root, context); }
      catch (error) { context.showToast?.(error.message, 'error'); event.currentTarget.disabled = false; }
    });
    root.querySelector('[data-retry-items]')?.addEventListener('click', () => load());
    root.querySelector('[data-add-item]')?.addEventListener('click', () => { if (busy || opening || isStatusModalOpen()) return; returnTarget = null; editorDirty = false; editor = {}; details = null; paint(); });
    root.querySelector('[data-item-filters]')?.addEventListener('submit', event => {
      event.preventDefault(); const data = new FormData(event.currentTarget);
      search = val(data.get('search')); status = val(data.get('status')) || 'all'; void load();
    });
    root.querySelector('[data-item-filters]')?.addEventListener('reset', () => setTimeout(() => { search = ''; status = 'all'; void load(); }, 0));
    root.querySelector('[data-close-detail]')?.addEventListener('click', closeItemDialog);
    root.querySelector('[data-cancel-editor]')?.addEventListener('click', closeItemDialog);
    root.querySelector('[data-keep-editing]')?.addEventListener('click', () => {
      const prompt = root.querySelector('[data-discard-prompt]');
      const form = root.querySelector('[data-item-form]');
      if (prompt) prompt.hidden = true;
      if (form) form.inert = false;
      root.querySelector('#item-name')?.focus({ preventScroll: true });
    });
    root.querySelector('[data-discard-item]')?.addEventListener('click', () => { editorDirty = false; closeItemDialog(); });
    root.querySelectorAll('[data-item-overlay]').forEach(overlay => {
      lockItemDialog(overlay);
      overlay.addEventListener('click', event => { if (event.target === overlay) closeItemDialog(); });
      overlay.addEventListener('keydown', event => {
        if (isStatusModalOpen()) return;
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeItemDialog(); return; }
        if (event.key !== 'Tab') return;
        const focusable = [...overlay.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href]')].filter(element => !element.closest('[hidden],[inert]') && element.getClientRects().length > 0);
        if (!focusable.length) { event.preventDefault(); return; }
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === overlay.querySelector('[role="dialog"]'))) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      });
      overlay.querySelector('[data-close-detail], [data-cancel-editor]')?.focus();
    });
    root.querySelectorAll('[data-item-detail]').forEach(button => button.addEventListener('click', async () => {
      if (busy || opening || isStatusModalOpen()) return;
      opening = true;
      returnTarget = { selector: '[data-item-detail]', key: 'itemDetail', id: button.dataset.itemDetail };
      const modal = showStatusModal({ title: 'กำลังโหลดข้อมูล', message: 'กำลังโหลดรายละเอียดรายชื่อสินค้า' });
      const closeOnAbort = () => modal.close();
      context.signal?.addEventListener('abort', closeOnAbort, { once: true });
      let keepModalOpen = false, row = null;
      try { row = await repository.getItemById(button.dataset.itemDetail); if (context.signal?.aborted) return; if (!row) throw new Error('ไม่พบรายชื่อสินค้า หรือไม่มีสิทธิ์เข้าถึง'); }
      catch (error) { if (context.signal?.aborted) return; keepModalOpen = true; modal.update({ title: 'โหลดข้อมูลไม่สำเร็จ', message: messageFor(error), detail: error.message, tone: 'error', close: () => modal.close() }); context.showToast?.(messageFor(error), 'error'); }
      finally { context.signal?.removeEventListener('abort', closeOnAbort); opening = false; if (!keepModalOpen) modal.close(); }
      if (!keepModalOpen && row && !context.signal?.aborted) { editor = null; details = { 'ชื่อสินค้า': row.item_name, 'สถานะ': row.active ? 'ใช้งาน' : 'ปิดใช้งาน', 'แก้ไขล่าสุด': dateText(row.updated_at) }; paint(); }
    }));
    root.querySelectorAll('[data-item-edit]').forEach(button => button.addEventListener('click', async () => {
      if (busy || opening || isStatusModalOpen()) return;
      opening = true;
      returnTarget = { selector: '[data-item-edit]', key: 'itemEdit', id: button.dataset.itemEdit };
      const modal = showStatusModal({ title: 'กำลังโหลดข้อมูล', message: 'กำลังโหลดข้อมูลรายชื่อสินค้า' });
      const closeOnAbort = () => modal.close();
      context.signal?.addEventListener('abort', closeOnAbort, { once: true });
      let keepModalOpen = false, row = null;
      try { row = await repository.getItemById(button.dataset.itemEdit); if (context.signal?.aborted) return; if (!row) throw new Error('ไม่พบรายชื่อสินค้า หรือไม่มีสิทธิ์เข้าถึง'); }
      catch (error) { if (context.signal?.aborted) return; keepModalOpen = true; modal.update({ title: 'โหลดข้อมูลไม่สำเร็จ', message: messageFor(error), detail: error.message, tone: 'error', close: () => modal.close() }); context.showToast?.(messageFor(error), 'error'); }
      finally { context.signal?.removeEventListener('abort', closeOnAbort); opening = false; if (!keepModalOpen) modal.close(); }
      if (!keepModalOpen && row && !context.signal?.aborted) { editor = row; editorDirty = false; details = null; paint(); }
    }));
    root.querySelectorAll('[data-item-active]').forEach(button => button.addEventListener('click', async () => {
      const id = button.dataset.itemActive, active = button.dataset.nextActive === 'true';
      const row = rows.find(item => item.id === id);
      const confirmed = await confirmAction({ title: active ? 'เปิดใช้งานรายชื่อสินค้า' : 'ปิดใช้งานรายชื่อสินค้า', message: 'ยืนยัน' + (active ? 'เปิด' : 'ปิด') + 'ใช้งาน “' + (row?.item_name || '') + '” หรือไม่', confirmLabel: active ? 'เปิดใช้งาน' : 'ปิดใช้งาน', danger: !active });
      if (!confirmed) return;
      const result = await withBusy(active ? 'กำลังเปิดใช้งาน' : 'กำลังปิดใช้งาน', async () => {
        await repository.setItemActive(id, active, 'เปลี่ยนสถานะผ่านหน้าจัดการรายการชื่อ');
        const verified = await verifyMutation(id, [active ? 'ACTIVATE' : 'DEACTIVATE']);
        rows = await repository.listItems(filters());
        rows.sort((left, right) => ITEM_NAME_COLLATOR.compare(val(left.item_name), val(right.item_name)) || String(left.id).localeCompare(String(right.id)));
        return verified;
      }, active ? 'เปิดใช้งานสำเร็จ' : 'ปิดใช้งานสำเร็จ');
      if (result) paint();
    }));
    const itemForm = root.querySelector('[data-item-form]');
    itemForm?.addEventListener('input', () => { editorDirty = true; });
    itemForm?.addEventListener('change', () => { editorDirty = true; });
    itemForm?.addEventListener('submit', async event => {
      event.preventDefault(); if (busy) return;
      const form = event.currentTarget;
      const checking = showStatusModal('กำลังตรวจสอบข้อมูล');
      const data = new FormData(form);
      const input = { item_name: val(data.get('item_name')), active: data.get('active') === 'true' };
      const reason = val(data.get('reason'));
      try {
        if (!input.item_name) throw new Error('กรุณาระบุชื่อสินค้า');
        if (reason && (reason.length < 3 || reason.length > 300)) throw new Error('เหตุผลต้องมีความยาว 3 ถึง 300 ตัวอักษร');
      } catch (error) { checking.update(error.message, 'error'); setTimeout(() => checking.close(), 1200); return; }
      checking.close();
      const isCreate = !editor?.id, before = editor;
      const expected = isCreate ? ['INSERT'] : [];
      if (!isCreate) {
        if (before.item_name !== input.item_name) expected.push('UPDATE');
        if (before.active !== input.active) expected.push(input.active ? 'ACTIVATE' : 'DEACTIVATE');
        if (!expected.length) { context.showToast?.('ไม่มีข้อมูลที่เปลี่ยนแปลง', 'error'); return; }
      }
      const result = await withBusy(isCreate ? 'กำลังเพิ่มรายการ' : 'กำลังแก้ไขรายการ', async () => {
        const reply = isCreate ? await repository.createItem(input, reason) : await repository.updateItem(editor.id, input, reason);
        const id = isCreate ? reply?.item?.id : editor.id;
        if (!id) throw Object.assign(new Error('Supabase ไม่ส่งรหัสรายการกลับมา'), { code: 'INVALID_RESPONSE' });
        const verified = await verifyMutation(id, expected);
        rows = await repository.listItems(filters());
        rows.sort((left, right) => ITEM_NAME_COLLATOR.compare(val(left.item_name), val(right.item_name)) || String(left.id).localeCompare(String(right.id)));
        return verified;
      }, isCreate ? 'เพิ่มข้อมูลสำเร็จ' : 'แก้ไขข้อมูลสำเร็จ');
      if (result) { editorDirty = false; closeItemDialog(); }
    });

  }
  await load();
}
