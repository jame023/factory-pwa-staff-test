import { escapeHtml } from '../../js/utils.js?v=1.3.409';
import { getLiveAdminContext, loginToMachineAdmin } from '../../js/live-admin-context.js?v=1.3.409';
import { showStatusModal } from '../../components/status-modal.js?v=1.3.409';

const GROUPS = Object.freeze(['ออฟฟิศ', 'สกรีน', 'ผลิต', 'ขนส่ง', 'ผู้บริหาร', 'Admin']);
const text = value => typeof value === 'string' ? value.trim() : '';
const dateText = value => value ? new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';

function friendlyError(error) {
  if (error?.code === 'SESSION_EXPIRED' || error?.status === 401) return 'Session หมดอายุ กรุณาเข้าสู่ระบบ LINE อีกครั้ง';
  if (error?.code === 'PERMISSION_DENIED' || error?.status === 401 || error?.status === 403) return 'ไม่มีสิทธิ์ดำเนินการ';
  if (error?.code === 'DUPLICATE_RECORD' || error?.code === '23505') return error.message || 'พบข้อมูลซ้ำ ไม่สามารถบันทึกซ้ำได้';
  if (error?.code === 'NETWORK_ERROR') return 'ไม่สามารถเชื่อมต่อ Supabase ได้';
  if (error?.code === 'AUDIT_GATEWAY_REQUIRED') return 'ไม่สามารถบันทึกประวัติการแก้ไขได้';
  if (error?.code === 'VALIDATION_ERROR') return error.message || 'ข้อมูลไม่ครบหรือไม่ถูกต้อง';
  return error?.message || 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ';
}

function liveLogin(root) {
  root.innerHTML = '<section class="card card-pad"><p class="eyebrow">จัดการข้อมูล</p><h1>จัดการพนักงาน</h1><p>หน้านี้ไม่ใช้ข้อมูลจำลอง ต้องยืนยันตัวตน Admin ผ่าน Supabase ก่อน</p><button class="button button-primary" type="button" data-live-login>เข้าสู่ระบบ Admin จริง</button></section>';
  root.querySelector('[data-live-login]').addEventListener('click', () => void loginToMachineAdmin());
}

function formMarkup(row = null, canReadRfid = false) {
  const value = key => escapeHtml(row?.[key] ?? '');
  const rfidValue = canReadRfid ? ((row?.rfid_uids || []).join(' · ') || 'ยังไม่ผูกบัตร') : 'แสดง UID ได้เฉพาะ Admin';
  return '<div class="employee-editor-overlay" data-employee-editor-overlay><section class="card card-pad employee-editor" data-employee-editor role="dialog" aria-modal="true" aria-labelledby="employee-editor-title" tabindex="-1"><div class="employee-editor-heading"><div><p class="eyebrow">จัดการข้อมูล</p><h2 id="employee-editor-title">' + (row?.id ? 'แก้ไขพนักงาน' : 'เพิ่มพนักงาน') + '</h2><p class="employee-editor-help">กรอกข้อมูลแล้วกดบันทึก ระบบจะตรวจสอบกับ Supabase และ Audit Log ก่อนแสดงผลสำเร็จ</p></div><button class="button employee-editor-close" type="button" data-cancel-editor aria-label="ปิดหน้าต่าง">×</button></div>' +
    '<form data-employee-form novalidate><div class="form-grid">' +
    '<div class="field"><label for="employee-name">ชื่อพนักงาน</label><input id="employee-name" name="employee_name" required maxlength="160" value="' + value('employee_name') + '"></div>' +
    '<div class="field"><label for="employee-rfid-uid">UID บัตร</label><input id="employee-rfid-uid" type="text" value="' + escapeHtml(rfidValue) + '" readonly aria-readonly="true"><input type="hidden" name="employee_code" value="' + value('employee_code') + '"></div>' +
    '<div class="field"><label for="line-user-id">LINE User ID</label><input id="line-user-id" name="line_user_id" maxlength="160" value="' + value('line_user_id') + '"></div>' +
    '<div class="field"><label for="line-display-name">ชื่อแสดงใน LINE</label><input id="line-display-name" name="line_display_name" maxlength="160" value="' + value('line_display_name') + '"></div>' +
    '<div class="field"><label for="employee-main-group">กลุ่มงานหลัก</label><select id="employee-main-group" name="main_group" required><option value="">เลือกกลุ่มงาน</option>' + GROUPS.map(group => '<option value="' + escapeHtml(group) + '"' + (row?.main_group === group ? ' selected' : '') + '>' + escapeHtml(group) + '</option>').join('') + '</select></div>' +
    '<div class="field"><label for="employee-active">สถานะบัญชี</label><input id="employee-active" type="text" value="' + (row?.active === false ? 'เก็บถาวร / ไม่ใช้งาน' : 'ใช้งาน') + '" readonly aria-readonly="true"><input type="hidden" name="active" value="' + (row?.active === false ? 'false' : 'true') + '"><p class="help-text">เปลี่ยนสถานะได้จากปุ่มลบหรือกู้คืนในรายการพนักงาน</p></div>' +
    '</div><div class="field"><label for="employee-reason">เหตุผลการแก้ไข</label><textarea id="employee-reason" name="reason" required minlength="3" maxlength="300" placeholder="ระบุเหตุผลเพื่อบันทึก Audit Log"></textarea></div><div class="form-actions"><button class="button button-primary" type="submit">บันทึกข้อมูล</button><button class="button" type="button" data-cancel-editor>ยกเลิก</button></div></form></section></div>';
}

function accountActionMarkup(row) {
  const restoring = row?.active === false;
  const title = restoring ? 'กู้คืนพนักงาน' : 'ลบพนักงาน';
  const actionLabel = restoring ? 'ยืนยันกู้คืน' : 'ยืนยันลบและเก็บถาวร';
  const message = restoring
    ? 'บัญชีจะกลับมาใช้งานได้ และพนักงานจะปรากฏในรายการปกติ ประวัติงานและ Audit เดิมยังคงอยู่'
    : 'ระบบจะระงับการเข้าใช้และนำพนักงานออกจากรายการปกติ โดยเก็บประวัติงานและ Audit ไว้ Admin สามารถกู้คืนได้จากตัวกรองสถานะ';
  return '<div class="employee-editor-overlay" data-account-action-overlay><section class="card card-pad employee-editor employee-action-dialog" data-account-action-dialog role="dialog" aria-modal="true" aria-labelledby="employee-action-title" tabindex="-1"><div class="employee-editor-heading"><div><p class="eyebrow">จัดการข้อมูล</p><h2 id="employee-action-title">' + title + '</h2><p class="employee-editor-help">' + escapeHtml(message) + '</p></div><button class="button employee-editor-close" type="button" data-cancel-account-action aria-label="ปิดหน้าต่าง">×</button></div><p><strong>' + escapeHtml(row?.employee_name || 'พนักงาน') + '</strong></p><form data-account-action-form novalidate><div class="field"><label for="employee-action-reason">เหตุผลที่ทำรายการ</label><textarea id="employee-action-reason" name="reason" required minlength="3" maxlength="300" placeholder="ระบุเหตุผลเพื่อบันทึก Audit Log"></textarea><p class="help-text" data-account-action-error hidden></p></div><div class="form-actions"><button class="button ' + (restoring ? 'button-primary' : 'button-danger') + '" type="submit">' + actionLabel + '</button><button class="button" type="button" data-cancel-account-action>ยกเลิก</button></div></form></section></div>';
}

export async function render(root, context) {
  document.body.classList.remove('is-employee-editor-open');
  root.innerHTML = '<section class="page-loading"><span class="loading-spinner"></span><span>กำลังเชื่อมต่อและโหลดข้อมูลพนักงาน…</span></section>';
  let live;
  try { live = await getLiveAdminContext(); }
  catch (error) {
    const modal = showStatusModal({ title: 'ไม่สามารถเชื่อมต่อได้', message: friendlyError(error), tone: 'error', close: () => modal.close(), retry: () => location.reload() });
    root.innerHTML = '<section class="notice notice-danger"><h1>โหลดข้อมูลพนักงานไม่สำเร็จ</h1><p>' + escapeHtml(friendlyError(error)) + '</p></section>';
    return;
  }
  if (!live.session) { liveLogin(root); return; }
  const repository = live.repository;
  const routeWorkspace = context?.workspace === 'executive' ? 'executive' : 'admin';
  const canReadRfid = live.session.user.role === 'admin';
  let rows = [];
  let query = '';
  let status = 'active';
  let adminGroupEmployeeIds = new Set();
  let adminGroupsLoaded = false;
  let editing = null;
  let editorTrigger = null;
  let managingAccount = null;
  let accountActionTrigger = null;
  let busy = false;

  async function load({ initial = false } = {}) {
    const modal = showStatusModal({ title: 'กำลังโหลดข้อมูล', message: initial ? 'กำลังเชื่อมต่อ Supabase' : 'กำลังโหลดข้อมูลพนักงาน' });
    try {
      rows = await repository.listEmployees({ includeInactive: true });
      try {
        const memberships = await repository.listAllEmployeeGroups();
        adminGroupEmployeeIds = new Set(memberships.filter(group => group.active === true && group.group_name === 'Admin').map(group => group.employee_id));
        adminGroupsLoaded = true;
      } catch (_) { adminGroupsLoaded = false; }
      draw();
    }
    catch (error) {
      modal.update({ title: 'โหลดข้อมูลไม่สำเร็จ', message: friendlyError(error), tone: 'error', detail: error?.message, retry: () => load({ initial: false }), close: () => modal.close() });
      return;
    }
    modal.update({ title: 'โหลดข้อมูลสำเร็จ', message: 'อ่านข้อมูลพนักงานจาก Supabase แล้ว', tone: 'success', close: () => modal.close() });
    setTimeout(() => modal.close(), 700);
  }

  function visibleRows() {
    const needle = query.toLocaleLowerCase('th');
  return rows.filter(row => (status === 'all' || (status === 'active' ? row.active : !row.active)) && (!needle || [row.employee_name, ...(row.rfid_uids || []), row.line_user_id, row.main_group].map(text).join(' ').toLocaleLowerCase('th').includes(needle)));
  }

    function draw() {
    const visible = visibleRows();
    const currentEmployeeId = live.session.user.id;
    const activeAdminCount = rows.filter(row => row.active === true && (row.main_group === 'Admin' || adminGroupEmployeeIds.has(row.id))).length;
    document.body.classList.toggle('is-employee-editor-open', Boolean(editing || managingAccount));
    root.innerHTML = `<div class="employees-page"><div class="page-heading"><div><p class="eyebrow">จัดการข้อมูล</p><h1>จัดการพนักงาน</h1><p>ข้อมูลพนักงาน UID บัตร และ ประวัติการแก้ไข</p></div><div class="form-actions"><a class="button" href="#/${routeWorkspace}/groups">จัดการสิทธิ์กลุ่มงาน</a></div></div>
      <section class="card card-pad"><div class="toolbar"><div class="field"><label for="employee-search">ค้นหาพนักงาน</label><input id="employee-search" type="search" value="${escapeHtml(query)}" placeholder="ชื่อ UID บัตร หรือ LINE User ID"></div><div class="field"><label for="employee-status">สถานะ</label><select id="employee-status"><option value="active"${status === 'active' ? ' selected' : ''}>ใช้งาน</option><option value="inactive"${status === 'inactive' ? ' selected' : ''}>เก็บถาวร / ไม่ใช้งาน</option><option value="all"${status === 'all' ? ' selected' : ''}>ทั้งหมด</option></select></div></div><p class="help-text">พบ ${visible.length} จาก ${rows.length} รายการ</p></section>
      <section class="card card-pad employee-list-card"><div class="section-title"><div><h2>รายการพนักงาน</h2><p>แสดง UID บัตรแทนรหัสพนักงาน; UID ดูได้เฉพาะ Admin การลบเป็นการเก็บถาวร กู้คืนได้ และไม่ลบประวัติงาน</p></div><button class="button button-primary" type="button" data-new-employee>＋ เพิ่มพนักงาน</button></div><div class="table-wrap"><table><thead><tr><th>พนักงาน</th><th>กลุ่มงานหลัก</th><th>สถานะ</th><th>แก้ไขล่าสุด</th><th>การทำงาน</th></tr></thead><tbody>
      ${visible.length ? visible.map(row => {
        const isAdmin = row.main_group === 'Admin' || adminGroupEmployeeIds.has(row.id);
        const isLastActiveAdmin = isAdmin && row.active === true && activeAdminCount <= 1;
        const isAdminRole = live.session.user.role === 'admin';
        const cannotArchive = !isAdminRole || (row.active === true && (row.id === currentEmployeeId || isLastActiveAdmin || !adminGroupsLoaded));
        const archiveTitle = !isAdminRole ? 'เฉพาะ Admin เท่านั้นที่เก็บถาวรพนักงานได้' : row.id === currentEmployeeId ? 'ไม่สามารถเก็บถาวรบัญชีที่กำลังใช้งานอยู่ได้' : isLastActiveAdmin ? 'ไม่สามารถเก็บถาวร Admin คนสุดท้ายได้' : !adminGroupsLoaded && row.active ? 'ยังตรวจสอบกลุ่ม Admin ไม่สำเร็จ จึงปิดปุ่มลบไว้' : row.active ? 'เก็บถาวรพนักงานโดยรักษาประวัติเดิม' : 'กู้คืนบัญชีพนักงาน';
        const uidLine = escapeHtml(canReadRfid ? ((row.rfid_uids || []).join(' · ') || 'ยังไม่ผูกบัตร') : 'แสดง UID ได้เฉพาะ Admin');
        return `<tr><td class="employee-person" data-label="พนักงาน"><strong>${escapeHtml(row.employee_name)}</strong><div class="small-muted">${escapeHtml(row.line_display_name || row.line_user_id || 'ไม่มี LINE mapping')}</div><div class="employee-code-inline">UID บัตร: <span>${uidLine}</span></div></td><td class="employee-group" data-label="กลุ่มงานหลัก"><span class="employee-mobile-label">กลุ่มงานหลัก</span>${escapeHtml(row.main_group || '—')}</td><td class="employee-status" data-label="สถานะ"><span class="employee-mobile-label">สถานะ</span>${row.active ? '<span class="badge badge-success">ใช้งาน</span>' : '<span class="badge badge-danger">เก็บถาวร / ไม่ใช้งาน</span>'}</td><td class="employee-updated" data-label="แก้ไขล่าสุด"><span class="employee-mobile-label">แก้ไขล่าสุด</span><time datetime="${escapeHtml(row.updated_at || '')}">${escapeHtml(dateText(row.updated_at))}</time></td><td class="employee-actions-cell" data-label="การทำงาน"><span class="employee-mobile-label">การทำงาน</span><div class="employee-actions"><button class="button button-small" type="button" data-edit="${escapeHtml(row.id)}">แก้ไข</button><button class="button button-small ${row.active ? 'button-danger' : 'button-primary'}" type="button" data-account-action="${escapeHtml(row.id)}"${cannotArchive ? ' disabled' : ''} title="${escapeHtml(archiveTitle)}">${row.active ? 'ลบ' : 'กู้คืน'}</button></div></td></tr>`;
      }).join('') : '<tr><td colspan="5"><p class="empty-state">ไม่พบข้อมูลจาก Supabase</p></td></tr>'}
      </tbody></table></div></section>${editing ? formMarkup(editing, canReadRfid) : ''}${managingAccount ? accountActionMarkup(managingAccount) : ''}</div>`;
    wire();
  }
  function redrawEmployeeResults() {
    const input=root.querySelector('#employee-search');
    if(!input)return;
    const focused=document.activeElement===input;
    const placeholder=document.createElement('span');
    input.replaceWith(placeholder);
    draw();
    root.querySelector('#employee-search')?.replaceWith(input);
    if(focused)input.focus({preventScroll:true});
  }
function wire() {
    root.querySelector('#employee-search')?.addEventListener('input', event => { query = event.target.value; if(!event.isComposing)redrawEmployeeResults(); });
    root.querySelector('#employee-search')?.addEventListener('compositionend',event=>{query=event.target.value;redrawEmployeeResults();});
    root.querySelector('#employee-status')?.addEventListener('change', event => { status = event.target.value; draw(); });
    const focusEditor = () => setTimeout(() => root.querySelector('[data-employee-editor] input, [data-employee-editor] select, [data-employee-editor] textarea')?.focus({ preventScroll: true }), 0);
    const closeEditor = () => { const trigger = editorTrigger; editing = null; editorTrigger = null; draw(); trigger?.focus?.({ preventScroll: true }); };
    const closeAccountAction = () => { const trigger = accountActionTrigger; managingAccount = null; accountActionTrigger = null; draw(); trigger?.focus?.({ preventScroll: true }); };
    const trapEditorFocus = event => {
      if (event.key === 'Escape') { event.preventDefault(); closeEditor(); return; }
      if (event.key !== 'Tab') return;
      const overlay = root.querySelector('[data-employee-editor-overlay]');
      const items = [...(overlay?.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled])') || [])];
      if (!items.length) { event.preventDefault(); return; }
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    root.querySelector('[data-new-employee]')?.addEventListener('click', event => { editorTrigger = event.currentTarget; editing = {}; draw(); focusEditor(); });
    root.querySelectorAll('[data-edit]').forEach(button => button.addEventListener('click', () => { editorTrigger = button; editing = rows.find(row => row.id === button.dataset.edit) || null; draw(); focusEditor(); }));
    root.querySelectorAll('[data-cancel-editor]').forEach(button => button.addEventListener('click', closeEditor));
    root.querySelectorAll('[data-cancel-account-action]').forEach(button => button.addEventListener('click', closeAccountAction));
    root.querySelector('[data-employee-editor-overlay]')?.addEventListener('click', event => { if (event.target === event.currentTarget && !busy) closeEditor(); });
    root.querySelector('[data-employee-editor-overlay]')?.addEventListener('keydown', trapEditorFocus);
    root.querySelector('[data-account-action-overlay]')?.addEventListener('click', event => { if (event.target === event.currentTarget && !busy) closeAccountAction(); });
    root.querySelector('[data-account-action-overlay]')?.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); closeAccountAction(); return; }
      if (event.key !== 'Tab') return;
      const items = [...(root.querySelector('[data-account-action-overlay]')?.querySelectorAll('button:not([disabled]),textarea:not([disabled])') || [])];
      if (!items.length) { event.preventDefault(); return; }
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    root.querySelectorAll('[data-account-action]').forEach(button => button.addEventListener('click', () => { accountActionTrigger = button; managingAccount = rows.find(row => row.id === button.dataset.accountAction) || null; draw(); root.querySelector('#employee-action-reason')?.focus({ preventScroll: true }); }));
    root.querySelector('[data-account-action-form]')?.addEventListener('submit', event => void saveAccountAction(event));
    root.querySelector('[data-employee-form]')?.addEventListener('submit', event => void save(event));
  }

  async function saveAccountAction(event) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const reason = text(new FormData(form).get('reason'));
    const errorText = root.querySelector('[data-account-action-error]');
    if (reason.length < 3) {
      if (errorText) { errorText.textContent = 'กรุณาระบุเหตุผลอย่างน้อย 3 ตัวอักษร'; errorText.hidden = false; }
      root.querySelector('#employee-action-reason')?.focus();
      return;
    }
    const target = managingAccount;
    if (!target?.id) return;
    const nextActive = target.active === false;
    accountActionTrigger = null;
    managingAccount = null;
    draw();
    busy = true;
    const modal = showStatusModal({ title: nextActive ? 'กำลังกู้คืนพนักงาน' : 'กำลังเก็บถาวรพนักงาน', message: 'กำลังตรวจสอบสิทธิ์และบันทึกข้อมูลพร้อม Audit Log' });
    try {
      await repository.setEmployeeActive(target.id, nextActive, (nextActive ? 'กู้คืนพนักงาน: ' : 'เก็บถาวรพนักงาน: ') + reason);
      const updated = await repository.getEmployeeById(target.id);
      if (!updated || updated.active !== nextActive) throw Object.assign(new Error('อ่านข้อมูลกลับจาก Supabase แล้วไม่ตรงกับค่าที่บันทึก'), { code: 'READBACK_MISMATCH' });
      rows = await repository.listEmployees({ includeInactive: true });
      status = 'active';
      modal.update({ title: nextActive ? 'กู้คืนพนักงานสำเร็จ' : 'เก็บถาวรพนักงานสำเร็จ', message: nextActive ? 'พนักงานกลับมาใช้งานได้ ประวัติเดิมยังอยู่ครบ' : 'ระงับการเข้าใช้แล้ว ประวัติงานและ Audit ยังคงอยู่', detail: 'Supabase และ Audit Log ยืนยันรายการแล้ว', tone: 'success', close: () => modal.close() });
      setTimeout(() => { modal.close(); draw(); }, 700);
    } catch (error) {
      modal.update({ title: 'บันทึกข้อมูลไม่สำเร็จ', message: friendlyError(error), detail: error?.message, tone: 'error', close: () => modal.close() });
    } finally { busy = false; }
  }

  async function save(event) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const input = Object.fromEntries(new FormData(form));
    input.active = input.active === 'true';
    const reason = text(input.reason);
    delete input.reason;
    if (!text(input.employee_name) || !text(input.main_group) || reason.length < 3) {
      let invalidModal;
      invalidModal = showStatusModal({ title: 'ข้อมูลไม่ครบ', message: 'กรุณากรอกชื่อ กลุ่มงานหลัก และเหตุผลอย่างน้อย 3 ตัวอักษร', tone: 'error', close: () => invalidModal.close() });
      return;
    }
    busy = true;
    const isCreate = !editing?.id;
    const modal = showStatusModal({ title: 'กำลังตรวจสอบข้อมูล', message: isCreate ? 'กำลังเตรียมเพิ่มข้อมูล' : 'กำลังเตรียมแก้ไขข้อมูล' });
    try {
      modal.update(isCreate ? 'กำลังเพิ่มข้อมูล' : 'กำลังแก้ไขข้อมูล');
      const saved = isCreate ? await repository.createEmployee(input, reason) : await repository.updateEmployee(editing.id, input, reason);
      modal.update('กำลังตรวจสอบข้อมูลที่บันทึกกลับจาก Supabase');
      const id = saved?.id || editing.id;
      const readback = await repository.getEmployeeById(id);
      if (!readback || readback.employee_name !== input.employee_name || readback.main_group !== input.main_group || readback.active !== input.active) throw Object.assign(new Error('Read-back Verification ไม่ตรงกับข้อมูลที่บันทึก'), { code: 'READBACK_MISMATCH' });
      rows = await repository.listEmployees({ includeInactive: true });
      editing = null;
      modal.update({ title: isCreate ? 'เพิ่มข้อมูลสำเร็จ' : 'แก้ไขข้อมูลสำเร็จ', message: 'อ่านข้อมูลกลับและบันทึก Audit Log แล้ว', tone: 'success', close: () => modal.close() });
      setTimeout(() => { modal.close(); draw(); }, 700);
    } catch (error) {
      modal.update({ title: 'บันทึกข้อมูลไม่สำเร็จ', message: friendlyError(error), detail: error?.message, tone: 'error', close: () => modal.close() });
    } finally { busy = false; }
  }

  document.body.classList.remove('is-status-modal-open');
  await load({ initial: true });
}
