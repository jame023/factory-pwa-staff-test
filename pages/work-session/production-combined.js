import { render as renderWorkSession } from './index.js?v=1.3.402';
import { renderIndependentOutput } from './independent-output.js?v=1.3.402';
import { render as renderOvertime } from '../ot/index.js?v=1.3.402';
import { bangkokToday } from '../../js/utils.js?v=1.3.402';

export async function render(root, context) {
  const canEnter = ['employee', 'admin'].includes(context.user.role);
  const selectedDate = bangkokToday();
  root.innerHTML = '<header class="page-heading"><div><p class="eyebrow">งานผลิต</p><h1>งานผลิต</h1><p>เริ่ม–จบงาน กรอกข้อมูลผลิต และบันทึก OT ในหน้านี้</p></div></header>' +
    (canEnter ? '<nav class="form-actions" aria-label="ไปยังส่วนบันทึกข้อมูล">' +
      '<button class="button button-secondary" type="button" data-production-jump="session">เริ่มงาน–จบงาน</button>' +
      '<button class="button button-secondary" type="button" data-production-jump="output">กรอกข้อมูลผลิต</button>' +
      '<button class="button button-secondary" type="button" data-production-jump="overtime">บันทึก OT</button></nav>' : '') +
    (canEnter ? '<section class="card card-pad screen-history-date-filter" aria-label="ตัวกรองประวัติตามวันที่"><label class="field"><span>แสดงข้อมูลของวันที่</span><input type="date" data-production-history-date value="' + selectedDate + '" disabled></label><p class="help-text" data-production-history-date-status role="status">ประวัติงาน รายการผลิต และประวัติ OT จะแสดงตามวันที่เลือก</p></section>' : '') +
    '<section class="attendance-section" data-production-section="session" tabindex="-1" aria-label="เริ่มงานและจบงานผลิต"></section>' +
    (canEnter ? '<section class="attendance-section" data-production-section="output" tabindex="-1" aria-label="กรอกข้อมูลผลิต"></section>' +
      '<section class="attendance-section" data-production-section="overtime" tabindex="-1" aria-label="บันทึก OT"></section>' : '');

  const jumpTo = name => {
    const section = root.querySelector('[data-production-section="' + name + '"]');
    section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    section?.focus({ preventScroll: true });
  };
  root.querySelectorAll('[data-production-jump]').forEach(button => {
    button.addEventListener('click', () => jumpTo(button.dataset.productionJump));
  });

  const panelContext = { ...context, workType: 'ผลิต', combinedProduction: true, productionHistoryDate: selectedDate,
    jumpToProductionOutput: () => jumpTo('output') };
  const historyDateInput = root.querySelector('[data-production-history-date]');
  historyDateInput?.addEventListener('change', () => {
    const date = historyDateInput.value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    panelContext.productionHistoryDate = date;
    root.querySelectorAll('[data-production-section]').forEach(section => {
      section.dispatchEvent(new CustomEvent('production-history-date-change', { detail: { date } }));
    });
  });

  const panels = [
    { name: 'session', render: renderWorkSession },
    ...(canEnter ? [
      { name: 'output', render: (host, panelContext) => renderIndependentOutput(host, panelContext, 'ผลิต') },
      { name: 'overtime', render: renderOvertime }
    ] : [])
  ];
  const renderPanel = async panel => {
    const host = root.querySelector('[data-production-section="' + panel.name + '"]');
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
