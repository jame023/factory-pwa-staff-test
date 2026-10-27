import { escapeHtml } from '../../js/utils.js?v=1.3.186';
import { showStatusModal, isStatusModalOpen } from '../../components/status-modal.js?v=1.3.186';
import { confirmAction } from '../../components/modal.js?v=1.3.186';
import { createSupabaseMachineRepository } from '../../js/machine-admin-repository.js?v=1.3.186';
import { APP_MODE, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../../js/config.js?v=1.3.186';
import { getMachineAdminSession, loginToMachineAdmin, logoutFromMachineAdmin } from '../../js/machine-admin-auth.js?v=1.3.210';

const GROUPS = Object.freeze(['สกรีน', 'ผลิต', 'ขนส่ง', 'ออฟฟิศ', 'ผู้บริหาร', 'Admin']);
const DATE = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' });
const esc = escapeHtml;
const val = x => String(x ?? '').trim();

function dateText(value) {
  if (!value) return '—';
  try { return DATE.format(new Date(value)); } catch (_) { return '—'; }
}

function messageFor(error) {
  if (error?.code === 'AUTH_REQUIRED' || error?.code === 'SESSION_EXPIRED' || error?.status === 401) return 'Session หมดอายุ';
  if (error?.code === 'PERMISSION_DENIED' || error?.status === 403) return 'ไม่มีสิทธิ์ดำเนินการ';
  if (error?.code === 'DUPLICATE_RECORD' || error?.databaseCode === '23505') return 'พบรหัสเครื่องซ้ำ';
  if (error?.code === 'AUDIT_READBACK_FAILED') return 'ไม่สามารถบันทึกประวัติได้';
  if (error?.code === 'VALIDATION_ERROR' || error?.databaseCode === '22023' || error?.databaseCode === '23514') return error.message || 'กำลังตรวจสอบข้อมูล';
  return error?.message || 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ';
}

function validate(form) {
  const data = new FormData(form);
  const machine_code = val(data.get('machine_code'));
  const machine_name = val(data.get('machine_name'));
  const work_group = val(data.get('work_group'));
  const display_order = Number(data.get('display_order'));
  const active = data.get('active') === 'true';
  const reason = val(data.get('reason'));
  if (!machine_code) throw new Error('กรุณาระบุรหัสเครื่อง');
  if (!machine_name) throw new Error('กรุณาระบุชื่อเครื่อง');
  if (!GROUPS.includes(work_group)) throw new Error('กรุณาเลือกกลุ่มงานมาตรฐาน');
  if (!Number.isSafeInteger(display_order) || display_order < 0) throw new Error('ลำดับแสดงผลต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป');
  if (reason && (reason.length < 3 || reason.length > 300)) throw new Error('เหตุผลต้องมีความยาว 3 ถึง 300 ตัวอักษร');
  return { machine: { machine_code, machine_name, work_group, display_order, active }, reason };
}

function formMarkup(machine = null) {
  const isNew = !machine || !machine.id;
  const row = isNew ? { machine_code: '', machine_name: '', work_group: '', display_order: 0, active: true } : machine;
  return '<section class="card card-pad machine-editor" data-machine-editor role="dialog" aria-modal="true" aria-labelledby="machine-editor-title" tabindex="-1"><div class="section-title"><div><p class="eyebrow">ข้อมูลเครื่องจักร</p><h2 id="machine-editor-title">' + (isNew ? 'เพิ่มเครื่องจักร' : 'แก้ไขเครื่องจักร') + '</h2></div><button class="button" type="button" data-cancel-editor>ปิดฟอร์ม</button></div>' +
    '<form data-machine-form><div class="form-grid">' +
    '<div class="field"><label for="machine-code">รหัสเครื่อง</label><input id="machine-code" name="machine_code" required maxlength="80" value="' + esc(row.machine_code) + '"></div>' +
    '<div class="field"><label for="machine-name">ชื่อเครื่อง</label><input id="machine-name" name="machine_name" required maxlength="200" value="' + esc(row.machine_name) + '"></div>' +
    '<div class="field"><label for="machine-group">กลุ่มงาน</label><select id="machine-group" name="work_group" required><option value="">เลือกกลุ่มงาน</option>' + GROUPS.map(group => '<option value="' + esc(group) + '"' + (row.work_group === group ? ' selected' : '') + '>' + esc(group) + '</option>').join('') + '</select></div>' +
    '<div class="field"><label for="machine-order">ลำดับการแสดงผล</label><input id="machine-order" name="display_order" type="number" min="0" step="1" required value="' + esc(row.display_order) + '"></div>' +
    '<div class="field"><label for="machine-active">สถานะใช้งาน</label><select id="machine-active" name="active"><option value="true"' + (row.active ? ' selected' : '') + '>ใช้งาน</option><option value="false"' + (!row.active ? ' selected' : '') + '>ปิดใช้งาน</option></select></div>' +
    '</div><div class="field"><label for="machine-reason">เหตุผลการแก้ไข (ถ้ามี)</label><textarea id="machine-reason" name="reason" maxlength="300" placeholder="ระบุเหตุผลเพื่อเก็บไว้ใน Audit Log"></textarea></div>' +
    '<div class="form-actions"><button class="button button-primary" type="submit" data-save-machine>ตรวจสอบและบันทึก</button></div></form></section>';
}

export async function render(root, context) {
  let machineSession;
  let keepConnectionModal = false;
  const connectionModal = showStatusModal({ title: 'กำลังเชื่อมต่อ', message: 'กำลังตรวจสอบสิทธิ์' });
  try { machineSession = await getMachineAdminSession(); }
  catch (error) {
    keepConnectionModal = true;
    connectionModal.update({ title: 'เชื่อมต่อไม่สำเร็จ', message: messageFor(error), detail: error.message, tone: 'error', close: () => connectionModal.close() });
    root.innerHTML = '<section class="notice notice-danger"><h1>ตรวจสอบ Session ไม่สำเร็จ</h1><p>' + esc(error.message) + '</p>' + (APP_MODE === 'supabase-line' ? '<a class="button" href="#/admin">กลับหน้า Admin</a>' : '<button class="button button-primary" data-machine-login>เข้าสู่ระบบ LINE อีกครั้ง</button>') + '</section>';
    root.querySelector('[data-machine-login]')?.addEventListener('click', async event => {
      const button = event.currentTarget; button.disabled = true;
      const retryModal = showStatusModal({ title: 'กำลังเชื่อมต่อ', message: 'กำลังยืนยันตัวตนด้วย LINE' });
      try { await loginToMachineAdmin(); } catch (err) { retryModal.update({ title: 'เชื่อมต่อไม่สำเร็จ', message: messageFor(err), detail: err.message, tone: 'error' }); context.showToast?.(messageFor(err), 'error'); button.disabled = false; setTimeout(() => retryModal.close(), 1200); }
    });
    return;
  } finally { if (!keepConnectionModal && connectionModal.isOpen()) connectionModal.close(); }
  if (!machineSession) {
    root.innerHTML = '<section class="card card-pad"><p class="eyebrow">Supabase · LINE Login</p><h1>เครื่องจักร</h1><p>' + (APP_MODE === 'supabase-line' ? 'ไม่พบ Session ที่ยืนยันจากแอปหลัก กรุณากลับไปหน้า Admin เพื่อตรวจสอบสถานะบัญชี' : 'เข้าสู่ระบบด้วยบัญชี LINE ที่ผูกกับ Factory PWA เพื่ออ่านหรือจัดการเครื่องจักรตามสิทธิ์จริง') + '</p>' + (APP_MODE === 'supabase-line' ? '<a class="button" href="#/admin">กลับหน้า Admin</a>' : '<button class="button button-primary" data-machine-login>เข้าสู่ระบบด้วย LINE</button>') + '</section>';
    root.querySelector('[data-machine-login]')?.addEventListener('click', async event => {
      const button = event.currentTarget; button.disabled = true; button.textContent = 'กำลังเชื่อมต่อ LINE…';
      const modal = showStatusModal({ title: 'กำลังเชื่อมต่อ', message: 'กำลังยืนยันตัวตนด้วย LINE' });
      try { await loginToMachineAdmin(); } catch (error) { modal.update({ title: 'เชื่อมต่อไม่สำเร็จ', message: messageFor(error), detail: error.message, tone: 'error' }); button.disabled = false; button.textContent = 'เข้าสู่ระบบด้วย LINE'; context.showToast?.(messageFor(error), 'error'); setTimeout(() => modal.close(), 1200); }
    });
    return;
  }
  const user = machineSession.user;
  const repository = createSupabaseMachineRepository({ supabaseUrl:SUPABASE_URL, publishableKey:SUPABASE_PUBLISHABLE_KEY,
    accessToken:machineSession.accessToken, user });
  const role = user.role;
  if (role !== 'admin') {
    root.innerHTML = '<section class="notice notice-danger"><h1>ไม่มีสิทธิ์ดำเนินการ</h1><p>หน้านี้สำหรับ Admin เท่านั้น</p></section>';
    const denied = showStatusModal({ title: 'ไม่มีสิทธิ์ดำเนินการ', message: 'หน้านี้สำหรับ Admin เท่านั้น', tone: 'error', close: () => denied.close() });
    return;
  }
  const canWrite = role === 'admin';
  if (!['admin', 'employee', 'executive'].includes(role)) {
    root.innerHTML = '<section class="notice notice-danger"><h1>ไม่มีสิทธิ์</h1><p>บัญชีนี้ไม่มีสิทธิ์ดูข้อมูลเครื่องจักร</p></section>';
    return;
  }
  if (!repository?.isLiveSupabase || typeof repository.listMachines !== 'function') {
    root.innerHTML = '<section class="notice notice-warning"><h1>ยังไม่เชื่อม Supabase จริง</h1><p>ระบบจะไม่แสดงหรือบันทึกข้อมูลจำลอง</p></section>';
    return;
  }

  let rows = [];
  let nameQuery = '';
  let codeQuery = '';
  let group = '';
  let status = 'all';
  let editor = null;
  let details = null;
  let busy = false;
  let opening = false;
  let returnTarget = null;
  let dialogOpen = false;
  const chromeInert = new Map();
  function releaseDialog() {
    dialogOpen = false;
    document.body.classList.remove('is-machine-dialog-open');
    for (const [element, previous] of chromeInert) element.inert = previous;
    chromeInert.clear();
  }
  context.signal?.addEventListener('abort', releaseDialog, { once:true });
  const keepFocusInDialog=event=>{
    const overlay=root.querySelector('[data-machine-overlay]');
    if(dialogOpen&&overlay&&!overlay.contains(event.target)&&!isStatusModalOpen())overlay.querySelector('[role="dialog"]')?.focus({preventScroll:true});
  };
  document.addEventListener('focusin',keepFocusInDialog);
  context.signal?.addEventListener('abort',()=>document.removeEventListener('focusin',keepFocusInDialog),{once:true});
  function closeDialog() {
    if(busy || isStatusModalOpen()) return;
    editor = null; details = null; paint();
    const target = returnTarget;
    if(target) [...root.querySelectorAll(target.attribute)].find(button=>button.dataset[target.key]===target.id)?.focus({preventScroll:true});
    else root.querySelector('[data-add-machine]')?.focus({preventScroll:true});
  }
  function bindDialog() {
    const overlay = root.querySelector('[data-machine-overlay]');
    if(!overlay) { releaseDialog(); return; }
    dialogOpen = true;
    document.body.classList.add('is-machine-dialog-open');
    for(const element of document.querySelectorAll('#header-root,#nav-root')) {
      if(!chromeInert.has(element))chromeInert.set(element,element.inert);
      element.inert=true;
    }
    for(const child of overlay.parentElement.children)if(child!==overlay)child.inert=true;
    overlay.addEventListener('click',event=>{if(event.target===overlay)closeDialog();});
    overlay.addEventListener('keydown',event=>{
      if(isStatusModalOpen())return;
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeDialog();return;}
      if(event.key!=='Tab')return;
      const controls=[...overlay.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href]')];
      const first=controls[0],last=controls.at(-1);
      if(!first){event.preventDefault();return;}
      if(event.shiftKey&&(document.activeElement===first||document.activeElement===overlay.querySelector('[role="dialog"]'))){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    });
    requestAnimationFrame(()=>{if(dialogOpen&&!context.signal?.aborted&&!isStatusModalOpen())overlay.querySelector('[role="dialog"]')?.focus({preventScroll:true});});
  }

  const load = async (message = 'กำลังโหลดข้อมูล') => {
    const modal = showStatusModal({ title: 'กำลังเชื่อมต่อ', message: 'กำลังโหลดข้อมูลเครื่องจักร' });
    let keepModalOpen = false;
    try {
      rows = await repository.listMachines({});
      paint();
    } catch (error) {
      keepModalOpen = true;
      root.innerHTML = '<section class="notice notice-danger"><h1>' + esc(messageFor(error)) + '</h1><p>' + esc(error.message) + '</p><button class="button button-primary" data-retry-machines>ลองใหม่</button></section>';
      modal.update({ title: 'โหลดข้อมูลไม่สำเร็จ', message: messageFor(error), detail: error.message, tone: 'error', retry: () => { modal.close(); return load(message); }, close: () => modal.close() });
      context.showToast?.(messageFor(error), 'error');
    } finally { opening=false; if (!keepModalOpen) { modal.close(); root.querySelector('[data-machine-overlay] [role="dialog"]')?.focus({preventScroll:true}); } }
  };

  function filteredRows() {
    const name = nameQuery.toLocaleLowerCase('th');
    const code = codeQuery.toLocaleLowerCase('th');
    return rows.filter(row => (!name || val(row.machine_name).toLocaleLowerCase('th').includes(name)) &&
      (!code || val(row.machine_code).toLocaleLowerCase('th').includes(code)) &&
      (!group || row.work_group === group) &&
      (status === 'all' || (status === 'active' && row.active === true) || (status === 'inactive' && row.active === false)));
  }

  function paint() {
    const visible = filteredRows();
    root.innerHTML = '<div class="machines-page"><div class="page-heading"><div><p class="eyebrow">ทะเบียนเครื่องจักร · ' + esc(role === 'admin' ? 'ผู้ดูแลระบบ' : role === 'employee' ? 'พนักงาน' : 'ผู้บริหาร') + '</p><h1>เครื่องจักร</h1><p>ค้นหาเครื่องจักร ตรวจสอบสถานะ และดูแลข้อมูลให้เป็นปัจจุบัน</p><p>บัญชี: ' + esc(user.name) + '</p></div><div class="form-actions">' + (canWrite ? '<a class="button" href="#/admin">ศูนย์ควบคุม Admin</a>' : '') + (APP_MODE === 'supabase-line' ? '' : '<button class="button" type="button" data-machine-logout>ออกจากระบบเครื่องจักร</button>') + '</div></div>' +
      '<section class="card card-pad machine-toolbar"><div class="section-title"><h2>ค้นหาและกรอง</h2>' + (canWrite ? '<button class="button button-primary" type="button" data-add-machine>เพิ่มเครื่องจักร</button>' : '') + '</div>' +
      '<form data-machine-filters class="form-grid">' +
      '<div class="field"><label for="machine-name-query">ค้นหาชื่อเครื่อง</label><input id="machine-name-query" name="machine_name" value="' + esc(nameQuery) + '" maxlength="100"></div>' +
      '<div class="field"><label for="machine-code-query">ค้นหารหัสเครื่อง</label><input id="machine-code-query" name="machine_code" value="' + esc(codeQuery) + '" maxlength="80"></div>' +
      '<div class="field"><label for="machine-group-filter">กลุ่มงาน</label><select id="machine-group-filter" name="work_group"><option value="">ทุกกลุ่มงาน</option>' + GROUPS.map(item => '<option value="' + esc(item) + '"' + (group === item ? ' selected' : '') + '>' + esc(item) + '</option>').join('') + '</select></div>' +
      '<div class="field"><label for="machine-status-filter">สถานะ</label><select id="machine-status-filter" name="status"><option value="all"' + (status === 'all' ? ' selected' : '') + '>ทุกสถานะ</option><option value="active"' + (status === 'active' ? ' selected' : '') + '>ใช้งาน</option><option value="inactive"' + (status === 'inactive' ? ' selected' : '') + '>ปิดใช้งาน</option></select></div>' +
      '<div class="form-actions"><button class="button" type="submit">ค้นหา</button><button class="button" type="reset" data-clear-filters>ล้างตัวกรอง</button></div></form></section>' +
      '<section class="card card-pad machine-list"><div class="section-title"><h2>เครื่องจักร (' + visible.length + ')</h2>' + (canWrite ? '<button class="button" type="button" data-save-order>บันทึกลำดับแสดงผล</button>' : '') + '</div>' +
      (visible.length ? '<div class="table-wrap" tabindex="0" role="region" aria-label="ตารางเครื่องจักร เลื่อนแนวนอนเพื่อดูข้อมูลทั้งหมด"><table><thead><tr><th>เครื่องจักร / รหัสเครื่อง</th><th>กลุ่มงาน</th><th>สถานะ</th><th>ลำดับ</th><th>แก้ไขล่าสุด</th>' + (canWrite ? '<th>การทำงาน</th>' : '') + '</tr></thead><tbody>' + visible.map(row => '<tr><td><strong class="machine-row-name">' + esc(row.machine_name) + '</strong><span class="machine-row-code">' + esc(row.machine_code) + '</span></td><td>' + esc(row.work_group || 'ยังไม่ได้กำหนด') + '</td><td>' + (row.active ? '<span class="badge badge-success">ใช้งาน</span>' : '<span class="badge badge-danger">ปิดใช้งาน</span>') + '</td><td>' + esc(row.display_order) + '</td><td>' + esc(dateText(row.updated_at)) + '</td>' + (canWrite ? '<td><div class="machine-row-actions"><button class="button button-small" type="button" data-machine-detail="' + esc(row.id) + '">ดูรายละเอียด</button><button class="button button-small" type="button" data-machine-edit="' + esc(row.id) + '">แก้ไข</button><button class="button button-small" type="button" data-machine-active="' + esc(row.id) + '" data-next-active="' + String(!row.active) + '">' + (row.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน') + '</button></div></td>' : '') + '</tr>').join('') + '</tbody></table></div>' : '<p class="empty-state">ไม่พบเครื่องจักรตามตัวกรอง</p>') +
      '</section>' +
      (details ? '<div class="machine-overlay" data-machine-overlay><section class="card card-pad machine-details" role="dialog" aria-modal="true" aria-labelledby="machine-details-title" tabindex="-1"><div class="section-title"><h2 id="machine-details-title">รายละเอียดเครื่องจักร</h2><button class="button" type="button" data-close-detail>ปิด</button></div><dl class="work-manager-fields">' + Object.entries(details).map(([key, value]) => '<div><dt>' + esc(key) + '</dt><dd>' + esc(value ?? '—') + '</dd></div>').join('') + '</dl></section></div>' : '') +
      (canWrite && editor ? '<div class="machine-overlay" data-machine-overlay>'+formMarkup(editor)+'</div>' : '') + '</div>';
    bind();
    bindDialog();
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
      await new Promise(resolve => setTimeout(resolve, 1400));
      modal.close();
      return result;
    } catch (error) {
      keepErrorOpen = true;
      modal.update({ title: 'ดำเนินการไม่สำเร็จ', message: messageFor(error), detail: error.message, tone: 'error', close: () => modal.close() });
      context.showToast?.(messageFor(error), 'error');
      return null;
    } finally {
      if (!keepErrorOpen && modal.isOpen()) modal.close();
      busy = false;
      root.querySelectorAll('button,input,select,textarea').forEach(el => { el.disabled = false; });
    }
  }

  async function verifyMutation(id, expectedActions) {
    const row = await repository.getMachineById(id);
    if (!row) throw Object.assign(new Error('บันทึกแล้วแต่ไม่พบข้อมูลเมื่ออ่านกลับจาก Supabase'), { code: 'READBACK_FAILED' });
    for (const expectedAction of expectedActions) {
      const logs = await repository.listAuditLogs({ record_id: id, action: expectedAction });
      const audit = logs.find(item => item.table_name === 'machines' && item.record_id === id && item.action === expectedAction);
      if (!audit) throw Object.assign(new Error('ไม่พบ Audit Log (' + expectedAction + ') หลังบันทึก'), { code: 'AUDIT_READBACK_FAILED' });
    }
    return row;
  }

  function bind() {
    root.querySelector('[data-machine-logout]')?.addEventListener('click', async event => {
      event.currentTarget.disabled = true;
      try { await logoutFromMachineAdmin(machineSession.accessToken); await render(root, context); }
      catch (error) { context.showToast?.(error.message, 'error'); event.currentTarget.disabled = false; }
    });
    root.querySelector('[data-retry-machines]')?.addEventListener('click', () => load());
    root.querySelector('[data-add-machine]')?.addEventListener('click', () => { if(busy||opening)return; returnTarget=null; editor = {}; details = null; paint(); });
    root.querySelector('[data-machine-filters]')?.addEventListener('submit', event => {
      event.preventDefault(); const data = new FormData(event.currentTarget);
      nameQuery = val(data.get('machine_name')); codeQuery = val(data.get('machine_code'));
      group = val(data.get('work_group')); status = val(data.get('status')) || 'all'; paint();
    });
    root.querySelector('[data-machine-filters]')?.addEventListener('reset', () => setTimeout(() => {
      nameQuery = ''; codeQuery = ''; group = ''; status = 'all'; paint();
    }, 0));
    root.querySelector('[data-close-detail]')?.addEventListener('click', closeDialog);
    root.querySelector('[data-cancel-editor]')?.addEventListener('click', closeDialog);
    root.querySelectorAll('[data-machine-detail]').forEach(button => button.addEventListener('click', async () => {
      if(busy||opening)return; opening=true;
      returnTarget={attribute:'[data-machine-detail]',key:'machineDetail',id:button.dataset.machineDetail};
      const modal = showStatusModal({ title: 'กำลังโหลดข้อมูล', message: 'กำลังโหลดรายละเอียดเครื่องจักร' });
      let keepModalOpen = false;
      try {
        const row = await repository.getMachineById(button.dataset.machineDetail);
        if(context.signal?.aborted)return;
        if(!row)throw new Error('ไม่พบเครื่องจักร หรือไม่มีสิทธิ์เข้าถึง');
        editor=null;
        details = row ? { 'รหัสเครื่อง': row.machine_code, 'ชื่อเครื่อง': row.machine_name, 'กลุ่มงาน': row.work_group || 'ยังไม่ได้กำหนด', 'สถานะ': row.active ? 'ใช้งาน' : 'ปิดใช้งาน', 'ลำดับแสดงผล': row.display_order, 'สร้างเมื่อ': dateText(row.created_at), 'แก้ไขล่าสุด': dateText(row.updated_at) } : null;
        paint();
      } catch (error) { keepModalOpen = true; modal.update({ title: 'โหลดข้อมูลไม่สำเร็จ', message: messageFor(error), detail: error.message, tone: 'error', close: () => modal.close() }); context.showToast?.(messageFor(error), 'error'); }
      finally { opening=false; if (!keepModalOpen) { modal.close(); root.querySelector('[data-machine-overlay] [role="dialog"]')?.focus({preventScroll:true}); } }
    }));
    root.querySelectorAll('[data-machine-edit]').forEach(button => button.addEventListener('click', async () => {
      if(busy||opening)return; opening=true;
      returnTarget={attribute:'[data-machine-edit]',key:'machineEdit',id:button.dataset.machineEdit};
      const modal = showStatusModal({ title: 'กำลังโหลดข้อมูล', message: 'กำลังโหลดข้อมูลเครื่องจักร' });
      let keepModalOpen = false;
      try { const row = await repository.getMachineById(button.dataset.machineEdit); if(context.signal?.aborted)return; if(!row)throw new Error('ไม่พบเครื่องจักร หรือไม่มีสิทธิ์เข้าถึง'); editor=row; details = null; paint(); }
      catch (error) { keepModalOpen = true; modal.update({ title: 'โหลดข้อมูลไม่สำเร็จ', message: messageFor(error), detail: error.message, tone: 'error', close: () => modal.close() }); context.showToast?.(messageFor(error), 'error'); }
      finally { opening=false; if (!keepModalOpen) { modal.close(); root.querySelector('[data-machine-overlay] [role="dialog"]')?.focus({preventScroll:true}); } }
    }));
    root.querySelectorAll('[data-machine-active]').forEach(button => button.addEventListener('click', async () => {
      const id = button.dataset.machineActive;
      const active = button.dataset.nextActive === 'true';
      const row = rows.find(item => item.id === id);
      const confirmed = await confirmAction({ title: active ? 'เปิดใช้งานเครื่องจักร' : 'ปิดใช้งานเครื่องจักร', message: 'ยืนยัน' + (active ? 'เปิด' : 'ปิด') + 'ใช้งาน “' + (row?.machine_name || '') + '” หรือไม่', confirmLabel: active ? 'เปิดใช้งาน' : 'ปิดใช้งาน', danger: !active });
      if (!confirmed) return;
      const result = await withBusy(active ? 'กำลังเปิดใช้งานเครื่องจักร' : 'กำลังปิดใช้งานเครื่องจักร', async () => {
        await repository.setMachineActive(id, active, 'เปลี่ยนสถานะผ่านหน้าจัดการเครื่องจักร');
        const verified = await verifyMutation(id, [active ? 'ACTIVATE' : 'DEACTIVATE']);
        rows = await repository.listMachines({});
        return verified;
      }, active ? 'เปิดใช้งานสำเร็จ' : 'ปิดใช้งานสำเร็จ');
      if (result) paint();
    }));
    root.querySelector('[data-machine-form]')?.addEventListener('submit', async event => {
      event.preventDefault();
      if (busy) return;
      const form = event.currentTarget;
      const modal = showStatusModal('กำลังตรวจสอบข้อมูล');
      let payload;
      try { payload = validate(form); }
      catch (error) { modal.update(error.message, 'error'); setTimeout(() => modal.close(), 1200); return; }
      modal.close();
      const isCreate = !editor?.id;
      const before = editor;
      const expectedActions = isCreate ? ['INSERT'] : [];
      if (!isCreate) {
        if (before.machine_code !== payload.machine.machine_code || before.machine_name !== payload.machine.machine_name ||
            before.work_group !== payload.machine.work_group || Number(before.display_order) !== payload.machine.display_order) expectedActions.push('UPDATE');
        if (before.active !== payload.machine.active) expectedActions.push(payload.machine.active ? 'ACTIVATE' : 'DEACTIVATE');
        if (!expectedActions.length) expectedActions.push('UPDATE');
      }
      const result = await withBusy(isCreate ? 'กำลังเพิ่มเครื่องจักร' : 'กำลังแก้ไขเครื่องจักร', async () => {
        const reply = isCreate
          ? await repository.createMachine(payload.machine, payload.reason)
          : await repository.updateMachine(editor.id, payload.machine, payload.reason);
        const id = isCreate ? reply?.machine?.id : editor.id;
        if (!id) throw Object.assign(new Error('Supabase ไม่ส่งรหัสเครื่องกลับมา'), { code: 'INVALID_RESPONSE' });
        const verified = await verifyMutation(id, expectedActions);
        rows = await repository.listMachines({});
        return verified;
      }, isCreate ? 'เพิ่มข้อมูลสำเร็จ' : 'แก้ไขข้อมูลสำเร็จ');
      if (result) { editor = null; paint(); }
    });
    root.querySelector('[data-save-order]')?.addEventListener('click', async () => {
      const items = [...root.querySelectorAll('[data-order-id]')].map(input => ({ id: input.dataset.orderId, display_order: Number(input.value) }));
      const modal = showStatusModal('กำลังตรวจสอบข้อมูล');
      if (items.some(item => !Number.isSafeInteger(item.display_order) || item.display_order < 0)) {
        modal.update('ลำดับแสดงผลต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป', 'error'); setTimeout(() => modal.close(), 1200); return;
      }
      modal.close();
      const result = await withBusy('กำลังบันทึกลำดับ', async () => {
        const before = new Map(rows.map(row => [row.id, Number(row.display_order)]));
        await repository.reorderMachines(items, 'จัดเรียงลำดับจากหน้าจัดการเครื่องจักร');
        for (const item of items) {
          const row = await repository.getMachineById(item.id);
          if (!row || Number(row.display_order) !== item.display_order) throw Object.assign(new Error('อ่านลำดับเครื่องจักรกลับจาก Supabase ไม่ตรง'), { code: 'READBACK_FAILED' });
          if (before.get(item.id) !== item.display_order) {
            const logs = await repository.listAuditLogs({ record_id: item.id, action: 'UPDATE' });
            if (!logs.some(log => log.table_name === 'machines' && log.record_id === item.id && log.action === 'UPDATE')) throw Object.assign(new Error('ไม่พบ Audit Log หลังเรียงลำดับ'), { code: 'AUDIT_READBACK_FAILED' });
          }
        }
        rows = await repository.listMachines({});
        return true;
      }, 'บันทึกลำดับสำเร็จ');
      if (result) paint();
    });
  }

  await load();
}







