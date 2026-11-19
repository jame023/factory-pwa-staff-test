import { render as renderWorkSession } from './index.js?v=1.3.400';
import { render as renderScreenData } from './screen-data.js?v=1.3.400';
import { render as renderOvertime } from '../ot/index.js?v=1.3.400';
import { bangkokToday } from '../../js/utils.js?v=1.3.400';

export async function render(root, context) {
  const canEnter = ['employee', 'admin'].includes(context.user.role);
  const selectedDate = bangkokToday();
  root.innerHTML = '<header class="page-heading"><div><h1>งานสกรีน</h1><p>เริ่ม–จบงาน บันทึกยอดสกรีน และบันทึก OT ในหน้านี้</p></div></header>' +
    (canEnter ? '<nav class="form-actions" aria-label="ไปยังส่วนบันทึกข้อมูล">' +
      '<button class="button button-secondary" type="button" data-screen-jump="session">เริ่มงาน–จบงาน</button>' +
      '<button class="button button-secondary" type="button" data-screen-jump="output">กรอกข้อมูลสกรีน</button>' +
      '<button class="button button-secondary" type="button" data-screen-jump="overtime">บันทึก OT</button></nav>' : '') +
    (canEnter ? '<section class="card card-pad screen-history-date-filter" aria-label="ตัวกรองประวัติตามวันที่"><label class="field"><span>แสดงข้อมูลของวันที่</span><input type="date" data-screen-history-date value="' + selectedDate + '" disabled></label><p class="help-text" data-screen-history-date-status role="status">ประวัติงาน รายการที่บันทึก และประวัติ OT จะแสดงตามวันที่เลือก</p></section>' : '') +
    '<section class="attendance-section" data-screen-section="session" tabindex="-1" aria-label="เริ่มงานและจบงาน"></section>' +
    (canEnter ? '<section class="attendance-section" data-screen-section="output" tabindex="-1" aria-label="กรอกข้อมูลสกรีน"></section>' +
      '<section class="attendance-section" data-screen-section="overtime" tabindex="-1" aria-label="บันทึก OT"></section>' : '');

  const jumpTo = name => {
    const section = root.querySelector('[data-screen-section="' + name + '"]');
    section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    section?.focus({ preventScroll: true });
  };
  root.querySelectorAll('[data-screen-jump]').forEach(button => {
    button.addEventListener('click', () => jumpTo(button.dataset.screenJump));
  });

  const panelContext = { ...context, workType: 'สกรีน', combinedScreen: true, screenHistoryDate: selectedDate,
    jumpToScreenOutput: () => jumpTo('output') };
  const historyDateInput = root.querySelector('[data-screen-history-date]');
  historyDateInput?.addEventListener('change', () => {
    const date = historyDateInput.value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    panelContext.screenHistoryDate = date;
    root.querySelectorAll('[data-screen-section]').forEach(section => {
      section.dispatchEvent(new CustomEvent('screen-history-date-change', { detail: { date } }));
    });
  });
  const panels = [{ name: 'session', render: renderWorkSession }];
  if (canEnter) panels.push({ name: 'output', render: renderScreenData }, { name: 'overtime', render: renderOvertime });

  const renderPanel = async panel => {
    const host = root.querySelector('[data-screen-section="' + panel.name + '"]');
    if (!host || context.signal?.aborted) return;
    host.innerHTML = '<p class="page-loading">กำลังโหลดข้อมูล…</p>';
    try {
      await panel.render(host, panelContext);
    } catch {
      if (context.signal?.aborted) return;
      host.innerHTML = '<div class="notice notice-error" role="alert"><p>โหลดส่วนนี้ไม่สำเร็จ กรุณาลองใหม่</p><button class="button" type="button">ลองอีกครั้ง</button></div>';
      host.querySelector('button').addEventListener('click', () => void renderPanel(panel));
    }
  };
  await Promise.all(panels.map(renderPanel));
  if (!context.signal?.aborted && historyDateInput) historyDateInput.disabled = false;
}
