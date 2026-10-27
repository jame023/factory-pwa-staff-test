import { escapeHtml } from '../../js/utils.js?v=1.3.186';
import { getLiveAdminContext, loginToMachineAdmin } from '../../js/live-admin-context.js?v=1.3.210';
import { showStatusModal } from '../../components/status-modal.js?v=1.3.186';

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
  root.innerHTML = '<section class="card card-pad"><p class="eyebrow">Admin · Supabase</p><h1>จัดการสิทธิ์กลุ่มงาน</h1><p>หน้านี้ไม่ใช้ข้อมูลจำลอง ต้องยืนยันตัวตน Admin ผ่าน Supabase ก่อน</p><button class="button button-primary" type="button" data-live-login>เข้าสู่ระบบ Admin จริง</button></section>';
  root.querySelector('[data-live-login]').addEventListener('click', () => void loginToMachineAdmin());
}

export async function render(root) {
  root.innerHTML = '<section class="page-loading"><span class="loading-spinner"></span><span>กำลังเชื่อมต่อและโหลดสิทธิ์จาก Supabase…</span></section>';
  let live;
  try { live = await getLiveAdminContext(); }
  catch (error) {
    const modal = showStatusModal({ title: 'ไม่สามารถเชื่อมต่อได้', message: friendlyError(error), tone: 'error', close: () => modal.close(), retry: () => location.reload() });
    return;
  }
  if (!live.session) { loginView(root); return; }
  const repository = live.repository;
  let employees = [];
  let groupsByEmployee = new Map();
  let selected = null;
  let permissionTrigger = null;
  let query = '';
  let busy = false;

  async function load() {
    const modal = showStatusModal({ title: 'กำลังโหลดข้อมูล', message: 'กำลังโหลดพนักงานและสิทธิ์กลุ่มงาน' });
    try {
      employees = await repository.listEmployees({ includeInactive: true });
      const pairs = await Promise.all(employees.map(async employee => [employee.id, await repository.listEmployeeGroups(employee.id)]));
      groupsByEmployee = new Map(pairs);
      draw();
      modal.update({ title: 'โหลดข้อมูลสำเร็จ', message: 'อ่านพนักงานและสิทธิ์จาก Supabase แล้ว', tone: 'success', close: () => modal.close() });
      setTimeout(() => modal.close(), 700);
    } catch (error) {
      modal.update({ title: 'โหลดข้อมูลไม่สำเร็จ', message: friendlyError(error), detail: error?.message, tone: 'error', retry: () => load(), close: () => modal.close() });
    }
  }

  function activeGroups(employeeId) { return (groupsByEmployee.get(employeeId) || []).filter(row => row.active).map(row => row.group_name); }
  function closePermissionEditor() {
    if (busy) return;
    const triggerId = permissionTrigger?.dataset.manage || null;
    permissionTrigger = null;
    selected = null;
    draw();
    if (triggerId) [...root.querySelectorAll('[data-manage]')].find(button => button.dataset.manage === triggerId)?.focus();
  }

  function draw() {
    const visible = employees.filter(employee => !query || [employee.employee_name, employee.employee_code, employee.main_group, ...activeGroups(employee.id)].join(' ').toLocaleLowerCase('th').includes(query.toLocaleLowerCase('th')));
    const editor = selected ? employees.find(employee => employee.id === selected) : null;
    const current = editor ? activeGroups(editor.id) : [];
    document.body.classList.toggle('is-permission-editor-open', Boolean(editor));
    root.innerHTML = '<div class="groups-page"><div class="page-heading"><div><p class="eyebrow">Admin · Supabase</p><h1>จัดการสิทธิ์กลุ่มงาน</h1><p>ข้อมูลจาก employees และ employee_groups ใน Supabase</p></div><div class="form-actions"><a class="button" href="#/admin">ศูนย์ควบคุม Admin</a><a class="button" href="#/admin/employees">จัดการพนักงาน</a></div></div>' +
      '<section class="card card-pad"><div class="field"><label for="permission-search">ค้นหาชื่อ รหัส หรือกลุ่มงาน</label><input id="permission-search" type="search" value="' + escapeHtml(query) + '" placeholder="ค้นหา"></div><p class="help-text">พบ ' + visible.length + ' จาก ' + employees.length + ' รายการ · ทุกการบันทึกใช้ RPC และ Audit Log ของ Supabase</p></section>' +
      '<section class="card card-pad groups-list-card"><div class="table-wrap"><table><thead><tr><th>พนักงาน</th><th>กลุ่มงานหลัก</th><th>สิทธิ์ที่ได้รับ</th><th>สถานะ</th><th>แก้ไขล่าสุด</th><th>การทำงาน</th></tr></thead><tbody>' +
      (visible.length ? visible.map(employee => '<tr><td class="group-employee" data-label="พนักงาน"><strong>' + escapeHtml(employee.employee_name) + '</strong><div class="small-muted">รหัส: ' + escapeHtml(employee.employee_code || '—') + '</div></td><td class="group-main" data-label="กลุ่มงานหลัก">' + escapeHtml(employee.main_group || '—') + '</td><td class="group-permissions" data-label="สิทธิ์ที่ได้รับ">' + escapeHtml(activeGroups(employee.id).join('、') || 'ไม่มี') + '</td><td class="group-status" data-label="สถานะ">' + (employee.active ? '<span class="badge badge-success">ใช้งาน</span>' : '<span class="badge badge-danger">ไม่ใช้งาน</span>') + '</td><td class="group-updated" data-label="แก้ไขล่าสุด">' + escapeHtml(dateText(employee.updated_at)) + '</td><td class="group-actions" data-label="การทำงาน"><button class="button button-small button-primary" type="button" data-manage="' + escapeHtml(employee.id) + '" data-action-feedback="false">จัดการสิทธิ์</button></td></tr>').join('') : '<tr class="group-empty-row"><td colspan="6"><p class="empty-state">ไม่พบข้อมูลจาก Supabase</p></td></tr>') + '</tbody></table></div></section>' +
      (editor ? '<div class="permission-editor-overlay" data-permission-overlay><section class="card card-pad permission-editor" role="dialog" aria-modal="true" aria-labelledby="permission-editor-title"><div class="permission-editor-heading"><div><p class="eyebrow">สิทธิ์การเข้าถึง</p><h2 id="permission-editor-title">บันทึกสิทธิ์กลุ่มงาน · ' + escapeHtml(editor.employee_name) + '</h2><p class="permission-editor-help">เลือกเฉพาะกลุ่มงานที่พนักงานคนนี้ใช้งานได้ และกำหนดกลุ่มงานหลักหนึ่งกลุ่ม</p></div><button class="button permission-editor-close" type="button" data-cancel-permission data-action-feedback="false" aria-label="ปิดหน้าต่าง">×</button></div><form data-permission-form novalidate><fieldset class="permission-fieldset"><legend>กลุ่มงานที่อนุญาต</legend><p class="permission-section-help">แตะการ์ดเพื่อเลือกหรือยกเลิกสิทธิ์</p><div class="group-permission-options">' + GROUPS.map(group => '<label class="group-permission-option' + (current.includes(group) ? ' is-selected' : '') + '"><input type="checkbox" name="group_name" data-action-feedback="false" value="' + escapeHtml(group) + '"' + (current.includes(group) ? ' checked' : '') + '><span class="group-permission-option-mark" aria-hidden="true">✓</span><span class="group-permission-option-label">' + escapeHtml(group) + '</span></label>').join('') + '</div></fieldset><div class="field"><label for="permission-main-group">กลุ่มงานหลัก</label><select id="permission-main-group" name="main_group"><option value="" disabled' + (current.length ? '' : ' selected') + '>เลือกกลุ่มงานหลัก</option>' + GROUPS.filter(group => current.includes(group)).map(group => '<option value="' + escapeHtml(group) + '"' + (editor.main_group === group ? ' selected' : '') + '>' + escapeHtml(group) + '</option>').join('') + '</select><span class="help-text">ต้องเป็นหนึ่งในกลุ่มงานที่เลือกด้านบน</span></div><div class="field"><label for="permission-reason">เหตุผลการแก้ไข <span class="permission-required">จำเป็น</span></label><textarea id="permission-reason" name="reason" minlength="3" maxlength="300" placeholder="เช่น ปรับหน้าที่รับผิดชอบประจำเดือนนี้"></textarea><span class="help-text">อย่างน้อย 3 ตัวอักษร เพื่อบันทึก Audit Log</span></div><div class="form-actions"><button class="button button-primary" type="submit">บันทึกสิทธิ์</button><button class="button" type="button" data-cancel-permission data-action-feedback="false">ยกเลิก</button></div></form></section></div>' : '') + '</div>';
    wire();
  }

  function wire() {
    root.querySelector('#permission-search')?.addEventListener('input', event => { query = event.target.value; draw(); });
    root.querySelectorAll('[data-manage]').forEach(button => button.addEventListener('click', () => { permissionTrigger = button; selected = button.dataset.manage; draw(); root.querySelector('.permission-editor input[name="group_name"]')?.focus(); }));
    root.querySelectorAll('[data-cancel-permission]').forEach(button => button.addEventListener('click', closePermissionEditor));
    root.querySelector('[data-permission-overlay]')?.addEventListener('click', event => { if (event.target === event.currentTarget) closePermissionEditor(); });
    root.querySelector('.permission-editor')?.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); closePermissionEditor(); return; }
      if (event.key !== 'Tab') return;
      const focusable = [...event.currentTarget.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])')];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
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
