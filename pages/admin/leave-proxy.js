import { enumerateLeaveDates } from '../../js/leave-rules.js?v=1.3.186';
import { escapeHtml } from '../../js/utils.js?v=1.3.186';
import { requireOnlineAction } from '../../js/offline.js?v=1.3.186';
import { confirmAction } from '../../components/modal.js?v=1.3.186';
import { submitProxyLeaveRequest } from '../../adapters/package09.js?v=1.3.313';

const LEAVE_GROUPS = new Set(['ออฟฟิศ', 'สกรีน', 'ผลิต', 'ขนส่ง']);
const employeesForProxy = rows => (rows || [])
  .filter(person => person?.active === true && person.id && LEAVE_GROUPS.has(person.main_group) && person.employee_name)
  .sort((a, b) => a.employee_name.localeCompare(b.employee_name, 'th'));

export function adminLeaveProxyMarkup(open, directory) {
  const employees = employeesForProxy(directory);
  const options = employees.map(person => `<option value="${escapeHtml(person.id)}" data-group="${escapeHtml(person.main_group)}">${escapeHtml(person.employee_name)} · ${escapeHtml(person.main_group)}</option>`).join('');
  return `<section class="card card-pad attendance-section admin-leave-proxy">
    <div class="admin-leave-proxy-heading"><div><h2>ขอลาแทนพนักงาน</h2><p class="help-text">ใช้ได้เฉพาะ Admin • คำขอจะเป็นของพนักงานที่เลือก และเก็บผู้ยื่นแทนกับเหตุผลไว้ในประวัติ</p></div>
      <button class="button button-primary" type="button" data-toggle-admin-proxy-leave aria-expanded="${String(open)}">${open ? 'ปิดแบบฟอร์ม' : '＋ ขอลาแทน'}</button>
    </div>
    ${open ? employees.length ? `<form id="admin-proxy-leave-form" class="attendance-section" style="margin-top:1rem">
      <input type="hidden" name="requestId">
      <input type="hidden" name="group">
      <div class="form-grid leave-form-grid">
        <label class="field field-full">พนักงานที่ยื่นลาแทน
          <select name="employeeId" required><option value="">เลือกพนักงาน</option>${options}</select>
        </label>
        <label class="field field-full">ประเภทลา
          <select name="type" required><option value="ลากิจ">ลากิจ</option><option value="ลาป่วย">ลาป่วย</option></select>
        </label>
        <label class="field">วันเริ่มลา<input name="startDate" type="date" required></label>
        <label class="field">วันสิ้นสุดลา<input name="endDate" type="date" required></label>
        <div class="field field-full leave-day-options" data-admin-proxy-days></div>
        <label class="field field-full">เหตุผลการลา
          <textarea name="reason" required minlength="1" maxlength="500" placeholder="ระบุเหตุผลการลาของพนักงาน"></textarea>
        </label>
        <label class="field field-full">เหตุผลที่ Admin ยื่นแทน
          <textarea name="adminReason" required minlength="3" maxlength="300" placeholder="เช่น พนักงานไม่สามารถเข้าใช้ระบบได้"></textarea>
        </label>
      </div>
      <p class="help-text">ใช้กติกาการลาเดิม ระบบตรวจวันหยุด โควตา และรายการที่ทับซ้อนก่อนส่ง • ยังไม่รองรับแนบรูปหรือใบรับรองแพทย์ • ส่งได้เวลา 05:00–21:00 น. เวลาไทย</p>
      <div class="form-actions"><button class="button button-primary leave-submit" type="submit">ตรวจสอบและส่งคำขอลา</button></div>
    </form>` : '<p class="notice notice-warning">ไม่พบพนักงานที่มีสถานะใช้งานและกลุ่มงานที่ยื่นลาได้</p>' : ''}
  </section>`;
}

function drawDays(form) {
  const target = form.querySelector('[data-admin-proxy-days]');
  const previous = new Map([...form.querySelectorAll('[data-proxy-date]')].map(select => [select.dataset.proxyDate, select.value]));
  try {
    const dates = enumerateLeaveDates(form.elements.startDate.value, form.elements.endDate.value);
    target.innerHTML = '<span class="field-label">ช่วงเวลาของแต่ละวัน</span>' + dates.map(date => `<label>${escapeHtml(date)}<select data-proxy-date="${date}"><option value="full">เต็มวัน</option><option value="morning">ครึ่งวันเช้า</option><option value="afternoon">ครึ่งวันบ่าย</option><option value="none">ไม่ลา</option></select></label>`).join('') + '<p class="help-text">วันหยุดตามปฏิทินของกลุ่มงานจะไม่นับเป็นวันลา</p>';
    for (const select of target.querySelectorAll('[data-proxy-date]')) if (previous.has(select.dataset.proxyDate)) select.value = previous.get(select.dataset.proxyDate);
  } catch {
    target.innerHTML = '';
  }
}

export function bindAdminLeaveProxy(root, context, { onToggle, onSaved }) {
  root.querySelector('[data-toggle-admin-proxy-leave]')?.addEventListener('click', onToggle);
  const form = root.querySelector('#admin-proxy-leave-form');
  if (!form) return;
  const submit = form.querySelector('[type="submit"]');
  const employee = form.elements.employeeId;
  employee.addEventListener('change', () => {
    form.elements.group.value = employee.selectedOptions[0]?.dataset.group || '';
  });
  form.elements.startDate.addEventListener('change', () => drawDays(form));
  form.elements.endDate.addEventListener('change', () => drawDays(form));
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submit.disabled || !requireOnlineAction('ยื่นคำขอลาแทนพนักงาน')) return;
    const employeeId = employee.value;
    const group = form.elements.group.value;
    const person = employee.selectedOptions[0]?.textContent || '';
    const adminReason = form.elements.adminReason.value.trim();
    const reason = form.elements.reason.value.trim();
    const startDate = form.elements.startDate.value;
    const endDate = form.elements.endDate.value;
    let dates;
    try {
      dates = [...form.querySelectorAll('[data-proxy-date]')].map(select => ({ date: select.dataset.proxyDate, period: select.value }));
      if (!dates.length || dates.length !== enumerateLeaveDates(startDate, endDate).length) throw new Error('กรุณาเลือกวันลาให้ครบทุกวัน');
    } catch (error) {
      context.showToast(error.message || 'กรุณาตรวจสอบวันที่ลา', 'error');
      return;
    }
    if (!employeeId || !group || reason.length < 1 || adminReason.length < 3) {
      context.showToast('กรุณาเลือกพนักงานและกรอกเหตุผลการลา รวมถึงเหตุผลที่ Admin ยื่นแทน', 'error');
      return;
    }
    const confirmed = await confirmAction({
      title: 'ยืนยันการยื่นลาแทน',
      message: `พนักงาน: ${person}\nประเภท: ${form.elements.type.value}\nช่วงวันที่: ${startDate} ถึง ${endDate}\nเหตุผลที่ Admin ยื่นแทน: ${adminReason}`,
      confirmLabel: 'ส่งคำขอ'
    });
    if (!confirmed || context.signal?.aborted) return;
    const controls = [...form.querySelectorAll('button,input,select,textarea')];
    controls.forEach(control => { control.disabled = true; });
    submit.textContent = 'กำลังส่ง…';
    try {
      const requestId = form.elements.requestId.value || crypto.randomUUID();
      form.elements.requestId.value = requestId;
      await submitProxyLeaveRequest({
        requestId, employeeId, group, adminReason,
        input: { type: form.elements.type.value, startDate, endDate, reason, dates }
      });
      if (context.signal?.aborted) return;
      context.showToast('ส่งคำขอลาแทนแล้ว และบันทึกผู้ดำเนินการไว้ใน Audit', 'success');
      try { await onSaved?.(); }
      catch { context.showToast('ส่งคำขอแล้ว แต่โหลดรายการล่าสุดไม่สำเร็จ กรุณากดค้นหาเพื่อยืนยันรายการ', 'error'); }
    } catch (error) {
      context.showToast(error.message || 'ส่งคำขอลาแทนไม่สำเร็จ', 'error');
      controls.forEach(control => { control.disabled = false; });
      submit.textContent = 'ตรวจสอบและส่งคำขอลา';
    }
  });
}
