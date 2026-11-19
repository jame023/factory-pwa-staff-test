import { escapeHtml } from '../../js/utils.js?v=1.3.397';
import { getLiveAdminContext, loginToMachineAdmin } from '../../js/live-admin-context.js?v=1.3.397';
import { showStatusModal } from '../../components/status-modal.js?v=1.3.397';

const GROUPS = Object.freeze(['ออฟฟิศ', 'สกรีน', 'ผลิต', 'ขนส่ง', 'ผู้บริหาร', 'Admin']);
const text = value => typeof value === 'string' ? value.trim() : '';
const dateText = value => value ? new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';

function friendlyError(error) {
  if (error?.code === 'SESSION_EXPIRED' || error?.status === 401) return 'Session หมดอายุ กรุณาเข้าสู่ระบบ LINE อีกครั้ง';
  if (error?.code === 'PERMISSION_DENIED' || error?.status === 401 || error?.status === 403) return 'ไม่มีสิทธิ์ดำเนินการ';
  if (error?.code === 'DUPLICATE_RECORD' || error?.code === '23505') return 'พบสิทธิ์กลุ่มงานซ้ำ';
  if (error?.code === 'LAST_ADMIN_GROUP') return 'ไม่สามารถถอดสิทธิ์ Admin ของผู้ดูแลคนสุดท้ายได้';
  if (error?.code === 'MAIN_GROUP_REVOKE') return 'ถอดกลุ่มงานหลักไม่ได้ กรุณาเปลี่ยนกลุ่มงานหลักก่อน';
  if (error?.code === 'MAIN_GROUP_REQUIRED') return 'กลุ่มงานหลักต้องเป็นหนึ่งในสิทธิ์ที่เลือก';
  if (error?.code === 'NETWORK_ERROR') return 'ไม่สามารถเชื่อมต่อ Supabase ได้';
  return error?.message || 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ';
}

function loginView(root) {
  root.innerHTML = '<section class="card card-pad"><p class="eyebrow">จัดการข้อมูล</p><h1>จัดการสิทธิ์กลุ่มงาน</h1><p>หน้านี้ไม่ใช้ข้อมูลจำลอง ต้องยืนยันตัวตน Admin ผ่าน Supabase ก่อน</p><button class="button button-primary" type="button" data-live-login>เข้าสู่ระบบ Admin จริง</button></section>';
  root.querySelector('[data-live-login]').addEventListener('click', () => void loginToMachineAdmin());
}

export async function render(root, context) {
  root.innerHTML = '<section class="page-loading"><span class="loading-spinner"></span><span>กำลังเชื่อมต่อและโหลดสิทธิ์จาก Supabase…</span></section>';
  let live;
  try { live = await getLiveAdminContext(); }
  catch (error) {
    const modal = showStatusModal({ title: 'ไม่สามารถเชื่อมต่อได้', message: friendlyError(error), tone: 'error', close: () => modal.close(), retry: () => location.reload() });
    return;
  }
  if (!live.session) { loginView(root); return; }
  const repository = live.repository;
  const routeWorkspace = context?.workspace === 'executive' ? 'executive' : 'admin';
  const canReadRfid = live.session.user.role === 'admin';
  const employeeIdentifier = employee => canReadRfid
    ? 'UID บัตร: ' + ((employee.rfid_uids || []).join(' · ') || 'ยังไม่ผูกบัตร')
    : 'UID แสดงได้เฉพาะ Admin';
  let employees = [];
  let groupsByEmployee = new Map();
  let selected = null;
  let permissionTrigger = null;
  let managingAccount = null;
  let accountActionTrigger = null;
  let query = '';
  let status = 'active';
  let busy = false;
  let adminGroupsLoaded = false;

  async function refresh() {
    adminGroupsLoaded = false;
    const nextEmployees = await repository.listEmployees({ includeInactive: true });
    const pairs = await Promise.all(nextEmployees.map(async employee => [employee.id, await repository.listEmployeeGroups(employee.id)]));
    employees = nextEmployees;
    groupsByEmployee = new Map(pairs);
    adminGroupsLoaded = true;
    draw();
  }

  async function load() {
    const modal = showStatusModal({ title: 'กำลังโหลดข้อมูล', message: 'กำลังโหลดพนักงานและสิทธิ์กลุ่มงาน' });
    try {
      await refresh();
      modal.update({ title: 'โหลดข้อมูลสำเร็จ', message: 'อ่านพนักงานและสิทธิ์จาก Supabase แล้ว', tone: 'success', close: () => modal.close() });
      setTimeout(() => modal.close(), 700);
    } catch (error) {
      adminGroupsLoaded = false;
      draw();
      modal.update({ title: 'โหลดข้อมูลไม่สำเร็จ', message: friendlyError(error), detail: error?.message, tone: 'error', retry: () => load(), close: () => modal.close() });
    }
  }

  function activeGroups(employeeId) { return (groupsByEmployee.get(employeeId) || []).filter(row => row.active).map(row => row.group_name); }
  function isActiveAdmin(employee) { return employee?.active === true && (employee.main_group === 'Admin' || activeGroups(employee.id).includes('Admin')); }
  function activeAdminCount() { return employees.filter(isActiveAdmin).length; }
  function canArchive(employee) {
    if (live.session.user.role !== 'admin') return false;
    if (employee.active === false) return true;
    return adminGroupsLoaded && employee.id !== live.session.user.id && !(isActiveAdmin(employee) && activeAdminCount() <= 1);
  }

  function accountActionMarkup(employee) {
    const restoring = employee.active === false;
    const title = restoring ? 'กู้คืนพนักงาน' : 'ลบพนักงาน';
    const actionLabel = restoring ? 'ยืนยันกู้คืน' : 'ยืนยันลบและเก็บถาวร';
    const message = restoring
      ? 'บัญชีจะกลับมาใช้งานได้ ประวัติงานและการแก้ไขเดิมยังคงอยู่'
      : 'ระบบจะระงับการเข้าใช้และนำพนักงานออกจากรายการปกติ โดยเก็บประวัติงานและการแก้ไขไว้';
    return '<div class="permission-editor-overlay" data-account-action-overlay><section class="card card-pad permission-editor" data-account-action-dialog role="dialog" aria-modal="true" aria-labelledby="account-action-title" tabindex="-1"><div class="permission-editor-heading"><div><p class="eyebrow">จัดการข้อมูล</p><h2 id="account-action-title">' + title + '</h2><p class="permission-editor-help">' + escapeHtml(message) + '</p></div><button class="button permission-editor-close" type="button" data-cancel-account-action aria-label="ปิดหน้าต่าง">×</button></div><p><strong>' + escapeHtml(employee.employee_name || 'พนักงาน') + '</strong></p><form data-account-action-form novalidate><div class="field"><label for="account-action-reason">เหตุผลที่ทำรายการ</label><textarea id="account-action-reason" name="reason" required minlength="3" maxlength="300" placeholder="ระบุเหตุผลเพื่อบันทึกประวัติการแก้ไข"></textarea><p class="help-text" data-account-action-error hidden></p></div><div class="form-actions"><button class="button ' + (restoring ? 'button-primary' : 'button-danger') + '" type="submit">' + actionLabel + '</button><button class="button" type="button" data-cancel-account-action>ยกเลิก</button></div></form></section></div>';
  }

  function closePermissionEditor() {
    if (busy) return;
    const triggerId = permissionTrigger?.dataset.manage || null;
    permissionTrigger = null;
    selected = null;
    draw();
    if (triggerId) [...root.querySelectorAll('[data-manage]')].find(button => button.dataset.manage === triggerId)?.focus();
  }

  function draw() {
    const visible = employees.filter(employee => (status === 'all' || (status === 'active' ? employee.active === true : employee.active === false)) && (!query || [employee.employee_name, employee.employee_code, ...(canReadRfid ? employee.rfid_uids || [] : []), employee.main_group, ...activeGroups(employee.id)].join(' ').toLocaleLowerCase('th').includes(query.toLocaleLowerCase('th'))));
    const editor = selected ? employees.find(employee => employee.id === selected) : null;
    const accountAction = managingAccount ? employees.find(employee => employee.id === managingAccount.id) : null;
    const current = editor ? activeGroups(editor.id) : [];
    document.body.classList.toggle('is-permission-editor-open', Boolean(editor || accountAction));
    root.innerHTML = '<div class="groups-page"><div class="page-heading"><div><p class="eyebrow">จัดการข้อมูล</p><h1>จัดการสิทธิ์กลุ่มงาน</h1><p>ข้อมูลพนักงานและสิทธิ์เข้าใช้งานแต่ละกลุ่มงาน</p></div><div class="form-actions"><a class="button" href="#/' + routeWorkspace + '/employees">จัดการพนักงาน</a></div></div>' +
      '<section class="card card-pad"><div class="field"><label for="permission-search">' + (canReadRfid ? 'ค้นหาชื่อ UID หรือกลุ่มงาน' : 'ค้นหาชื่อหรือกลุ่มงาน') + '</label><input id="permission-search" type="search" value="' + escapeHtml(query) + '" placeholder="ค้นหา"></div><div class="field"><label for="permission-status">สถานะพนักงาน</label><select id="permission-status"><option value="active"' + (status === 'active' ? ' selected' : '') + '>ใช้งาน</option><option value="inactive"' + (status === 'inactive' ? ' selected' : '') + '>เก็บถาวร / ไม่ใช้งาน</option><option value="all"' + (status === 'all' ? ' selected' : '') + '>ทั้งหมด</option></select></div><p class="help-text">พบ ' + visible.length + ' จาก ' + employees.length + ' รายการ · บันทึกประวัติการแก้ไขทุกครั้ง · Admin ลบแบบเก็บถาวรและกู้คืนได้ โดยเก็บประวัติงานไว้</p></section>' +
      '<section class="card card-pad groups-list-card"><div class="table-wrap"><table><thead><tr><th>พนักงาน</th><th>กลุ่มงานหลัก</th><th>สิทธิ์ที่ได้รับ</th><th>สถานะ</th><th>แก้ไขล่าสุด</th><th>การทำงาน</th></tr></thead><tbody>' +
      (visible.length ? visible.map(employee => {
        const isActiveAdminEmployee = isActiveAdmin(employee);
        const isLastActiveAdmin = isActiveAdminEmployee && activeAdminCount() <= 1;
        const isCurrentUser = employee.id === live.session.user.id;
        const allowed = canArchive(employee);
        const actionTitle = live.session.user.role !== 'admin' ? 'เฉพาะ Admin เท่านั้นที่เก็บถาวรพนักงานได้' : employee.active === false ? 'กู้คืนบัญชีพนักงาน' : isCurrentUser ? 'ไม่สามารถเก็บถาวรบัญชีที่กำลังใช้งานอยู่ได้' : isLastActiveAdmin ? 'ไม่สามารถเก็บถาวร Admin คนสุดท้ายได้' : !adminGroupsLoaded ? 'ยังตรวจสอบกลุ่ม Admin ไม่สำเร็จ จึงปิดปุ่มลบไว้' : 'เก็บถาวรพนักงานโดยรักษาประวัติเดิม';
        return '<tr><td class="group-employee" data-label="พนักงาน"><strong>' + escapeHtml(employee.employee_name) + '</strong><div class="small-muted">' + escapeHtml(employeeIdentifier(employee)) + '</div></td><td class="group-main" data-label="กลุ่มงานหลัก">' + escapeHtml(employee.main_group || '—') + '</td><td class="group-permissions" data-label="สิทธิ์ที่ได้รับ">' + escapeHtml(activeGroups(employee.id).join('、') || 'ไม่มี') + '</td><td class="group-status" data-label="สถานะ">' + (employee.active ? '<span class="badge badge-success">ใช้งาน</span>' : '<span class="badge badge-danger">ไม่ใช้งาน</span>') + '</td><td class="group-updated" data-label="แก้ไขล่าสุด">' + escapeHtml(dateText(employee.updated_at)) + '</td><td class="group-actions" data-label="การทำงาน"><div class="group-row-actions"><button class="button button-small button-primary" type="button" data-manage="' + escapeHtml(employee.id) + '" data-action-feedback="false">จัดการสิทธิ์</button><button class="button button-small ' + (employee.active ? 'button-danger' : 'button-primary') + '" type="button" data-account-action="' + escapeHtml(employee.id) + '"' + (allowed ? '' : ' disabled') + ' title="' + escapeHtml(actionTitle) + '" data-action-feedback="false">' + (employee.active ? 'ลบ' : 'กู้คืน') + '</button></div></td></tr>';
      }).join('') : '<tr class="group-empty-row"><td colspan="6"><p class="empty-state">ไม่พบข้อมูลจาก Supabase</p></td></tr>') + '</tbody></table></div></section>' +
      (editor ? '<div class="permission-editor-overlay" data-permission-overlay><section class="card card-pad permission-editor" role="dialog" aria-modal="true" aria-labelledby="permission-editor-title"><div class="permission-editor-heading"><div><p class="eyebrow">สิทธิ์การเข้าถึง</p><h2 id="permission-editor-title">บันทึกสิทธิ์กลุ่มงาน · ' + escapeHtml(editor.employee_name) + '</h2><p class="permission-editor-help">เลือกเฉพาะกลุ่มงานที่พนักงานคนนี้ใช้งานได้ และกำหนดกลุ่มงานหลักหนึ่งกลุ่ม</p></div><button class="button permission-editor-close" type="button" data-cancel-permission data-action-feedback="false" aria-label="ปิดหน้าต่าง">×</button></div><form data-permission-form novalidate><fieldset class="permission-fieldset"><legend>กลุ่มงานที่อนุญาต</legend><p class="permission-section-help">แตะการ์ดเพื่อเลือกหรือยกเลิกสิทธิ์</p><div class="group-permission-options">' + GROUPS.map(group => '<label class="group-permission-option' + (current.includes(group) ? ' is-selected' : '') + '"><input type="checkbox" name="group_name" data-action-feedback="false" value="' + escapeHtml(group) + '"' + (current.includes(group) ? ' checked' : '') + '><span class="group-permission-option-mark" aria-hidden="true">✓</span><span class="group-permission-option-label">' + escapeHtml(group) + '</span></label>').join('') + '</div></fieldset><div class="field"><label for="permission-main-group">กลุ่มงานหลัก</label><select id="permission-main-group" name="main_group"><option value="" disabled' + (current.length ? '' : ' selected') + '>เลือกกลุ่มงานหลัก</option>' + GROUPS.filter(group => current.includes(group)).map(group => '<option value="' + escapeHtml(group) + '"' + (editor.main_group === group ? ' selected' : '') + '>' + escapeHtml(group) + '</option>').join('') + '</select><span class="help-text">ต้องเป็นหนึ่งในกลุ่มงานที่เลือกด้านบน</span></div><div class="field"><label for="permission-reason">เหตุผลการแก้ไข <span class="permission-required">จำเป็น</span></label><textarea id="permission-reason" name="reason" minlength="3" maxlength="300" placeholder="เช่น ปรับหน้าที่รับผิดชอบประจำเดือนนี้"></textarea><span class="help-text">อย่างน้อย 3 ตัวอักษร เพื่อบันทึก Audit Log</span></div><div class="form-actions"><button class="button button-primary" type="submit">บันทึกสิทธิ์</button><button class="button" type="button" data-cancel-permission data-action-feedback="false">ยกเลิก</button></div></form></section></div>' : '') +
      (accountAction ? accountActionMarkup(accountAction) : '') + '</div>';
    wire();
  }

  function redrawSearchResults() {
    const input = root.querySelector('#permission-search');
    if (!input) return;
    const focused = document.activeElement === input;
    input.replaceWith(document.createElement('span'));
    draw();
    root.querySelector('#permission-search')?.replaceWith(input);
    if (focused) input.focus({ preventScroll: true });
  }

  function wire() {
    root.querySelector('#permission-search')?.addEventListener('input', event => { query = event.target.value; if (!event.isComposing) redrawSearchResults(); });
    root.querySelector('#permission-search')?.addEventListener('compositionend', event => { query = event.target.value; redrawSearchResults(); });
    root.querySelector('#permission-status')?.addEventListener('change', event => { status = event.target.value; draw(); });
    root.querySelectorAll('[data-manage]').forEach(button => button.addEventListener('click', () => { permissionTrigger = button; selected = button.dataset.manage; draw(); root.querySelector('.permission-editor input[name="group_name"]')?.focus(); }));
    root.querySelectorAll('[data-cancel-permission]').forEach(button => button.addEventListener('click', closePermissionEditor));
    root.querySelector('[data-permission-overlay]')?.addEventListener('click', event => { if (event.target === event.currentTarget) closePermissionEditor(); });
    root.querySelector('[data-permission-overlay] .permission-editor')?.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); closePermissionEditor(); return; }
      if (event.key !== 'Tab') return;
      const focusable = [...event.currentTarget.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])')];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    const closeAccountAction = () => {
      if (busy) return;
      const employeeId = accountActionTrigger?.dataset.accountAction || null;
      managingAccount = null;
      accountActionTrigger = null;
      draw();
      if (employeeId) [...root.querySelectorAll('[data-account-action]')].find(button => button.dataset.accountAction === employeeId)?.focus();
    };
    root.querySelectorAll('[data-account-action]').forEach(button => button.addEventListener('click', () => {
      if (button.disabled || busy) return;
      accountActionTrigger = button;
      managingAccount = employees.find(employee => employee.id === button.dataset.accountAction) || null;
      draw();
      root.querySelector('#account-action-reason')?.focus({ preventScroll: true });
    }));
    root.querySelectorAll('[data-cancel-account-action]').forEach(button => button.addEventListener('click', closeAccountAction));
    root.querySelector('[data-account-action-overlay]')?.addEventListener('click', event => { if (event.target === event.currentTarget) closeAccountAction(); });
    root.querySelector('[data-account-action-overlay]')?.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeAccountAction(); return; }
      if (event.key !== 'Tab') return;
      const focusable = [...(root.querySelector('[data-account-action-dialog]')?.querySelectorAll('button:not([disabled]),textarea:not([disabled])') || [])];
      if (!focusable.length) { event.preventDefault(); return; }
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    root.querySelector('[data-account-action-form]')?.addEventListener('submit', event => void saveAccountAction(event));
    root.querySelector('[data-permission-form]')?.addEventListener('change', event => {
      if (event.target.name !== 'group_name') return;
      event.target.closest('.group-permission-option')?.classList.toggle('is-selected', event.target.checked);
      const main = root.querySelector('#permission-main-group');
      const checked = [...root.querySelectorAll('input[name="group_name"]:checked')].map(input => input.value);
      const previous = main.value;
      main.replaceChildren(...checked.map(group => new Option(group, group, false, group === previous)));
      if (!checked.includes(main.value)) main.value = checked[0] || '';
    });
    root.querySelector('[data-permission-form]')?.addEventListener('submit', event => void save(event));
  }

  async function saveAccountAction(event) {
    event.preventDefault();
    if (busy || !managingAccount) return;
    const form = event.currentTarget;
    const reason = text(new FormData(form).get('reason'));
    const errorNode = root.querySelector('[data-account-action-error]');
    if (reason.length < 3 || reason.length > 300) {
      if (errorNode) { errorNode.textContent = 'กรุณาระบุเหตุผล 3–300 ตัวอักษร'; errorNode.hidden = false; }
      root.querySelector('#account-action-reason')?.focus();
      return;
    }
    const target = employees.find(employee => employee.id === managingAccount.id);
    if (!target) return;
    const nextActive = target.active === false;
    if (live.session.user.role !== 'admin' || (!nextActive && (!adminGroupsLoaded || target.id === live.session.user.id || (isActiveAdmin(target) && activeAdminCount() <= 1)))) {
      const modal = showStatusModal({ title: 'ทำรายการไม่ได้', message: 'สิทธิ์หรือสถานะผู้ดูแลระบบไม่อนุญาตให้ทำรายการนี้', tone: 'error', close: () => modal.close() });
      return;
    }
    busy = true;
    managingAccount = null;
    accountActionTrigger = null;
    draw();
    const modal = showStatusModal({ title: nextActive ? 'กำลังกู้คืนพนักงาน' : 'กำลังเก็บถาวรพนักงาน', message: 'กำลังตรวจสอบสิทธิ์และบันทึกข้อมูลพร้อม Audit Log' });
    try {
      await repository.setEmployeeActive(target.id, nextActive, (nextActive ? 'กู้คืนพนักงาน: ' : 'เก็บถาวรพนักงาน: ') + reason);
      const updated = await repository.getEmployeeById(target.id);
      if (!updated || updated.active !== nextActive) throw Object.assign(new Error('อ่านข้อมูลกลับจาก Supabase แล้วไม่ตรงกับค่าที่บันทึก'), { code: 'READBACK_MISMATCH' });
      let refreshed = true;
      try { await refresh(); } catch (_) { refreshed = false; adminGroupsLoaded = false; draw(); }
      const result = { title: nextActive ? 'กู้คืนพนักงานสำเร็จ' : 'เก็บถาวรพนักงานสำเร็จ', message: nextActive ? 'พนักงานกลับมาใช้งานได้ ประวัติงานและการแก้ไขเดิมยังคงอยู่' : 'ระงับการเข้าใช้แล้ว ประวัติงานและการแก้ไขยังคงอยู่', detail: refreshed ? 'ตรวจสอบสถานะบัญชีหลังบันทึกแล้ว' : 'บันทึกสถานะบัญชีแล้ว แต่โหลดรายการล่าสุดไม่สำเร็จ กรุณากดโหลดใหม่', tone: 'success', close: () => modal.close() };
      if (!refreshed) result.retry = () => load();
      modal.update(result);
      if (refreshed) setTimeout(() => modal.close(), 700);
    } catch (error) {
      modal.update({ title: 'บันทึกข้อมูลไม่สำเร็จ', message: friendlyError(error), detail: error?.message, tone: 'error', close: () => modal.close() });
    } finally { busy = false; }
  }

  async function save(event) {
    event.preventDefault();
    if (busy || !selected) return;
    const employee = employees.find(row => row.id === selected);
    const form = event.currentTarget;
    const groups = [...form.querySelectorAll('input[name="group_name"]:checked')].map(input => input.value);
    const mainGroup = text(form.elements.main_group.value);
    const reason = text(form.elements.reason.value);
    if (!groups.length || !groups.includes(mainGroup) || reason.length < 3) {
      const modal = showStatusModal({ title: 'ข้อมูลไม่ครบ', message: 'เลือกสิทธิ์อย่างน้อยหนึ่งกลุ่ม กลุ่มหลักต้องอยู่ในสิทธิ์ และเหตุผลต้องมีอย่างน้อย 3 ตัวอักษร', tone: 'error', close: () => modal.close() });
      return;
    }
    busy = true;
    const modal = showStatusModal({ title: 'กำลังตรวจสอบสิทธิ์', message: 'กำลังเตรียมบันทึกสิทธิ์' });
    try {
      modal.update('กำลังบันทึกสิทธิ์');
      const previousGroups = activeGroups(employee.id).slice().sort();
      const nextGroups = groups.slice().sort();
      if (JSON.stringify(previousGroups) === JSON.stringify(nextGroups) && employee.main_group !== mainGroup) {
        await repository.updateEmployeeMainGroup(employee.id, mainGroup, reason);
      } else {
        await repository.replaceEmployeeGroups(employee.id, groups, mainGroup, reason);
      }
      modal.update('กำลังโหลดสิทธิ์ที่บันทึกกลับจาก Supabase');
      const [updatedEmployee, updatedGroups] = await Promise.all([repository.getEmployeeById(employee.id), repository.listEmployeeGroups(employee.id)]);
      const actual = updatedGroups.filter(row => row.active).map(row => row.group_name).sort();
      if (!updatedEmployee || updatedEmployee.main_group !== mainGroup || JSON.stringify(actual) !== JSON.stringify([...groups].sort())) throw Object.assign(new Error('Read-back Verification ไม่ตรงกับสิทธิ์ที่บันทึก'), { code: 'READBACK_MISMATCH' });
      selected = null;
      await load();
      modal.update({ title: 'บันทึกสิทธิ์สำเร็จ', message: 'อ่านข้อมูลกลับและบันทึก Audit Log แล้ว', tone: 'success', close: () => modal.close() });
      setTimeout(() => modal.close(), 700);
    } catch (error) {
      modal.update({ title: 'บันทึกสิทธิ์ไม่สำเร็จ', message: friendlyError(error), detail: error?.message, tone: 'error', close: () => modal.close() });
    } finally { busy = false; }
  }

  document.body.classList.remove('is-status-modal-open', 'is-permission-editor-open');
  await load();
}
