import { render as renderWorkSession } from './index.js?v=1.3.375';
import { render as renderScreenData } from './screen-data.js?v=1.3.375';
import { render as renderOvertime } from '../ot/index.js?v=1.3.376';

export async function render(root, context) {
  const canEnter = ['employee', 'admin'].includes(context.user.role);
  root.innerHTML = '<header class="page-heading"><div><h1>งานสกรีน</h1><p>เริ่ม–จบงาน บันทึกยอดสกรีน และบันทึก OT ในหน้านี้</p></div></header>' +
    (canEnter ? '<nav class="form-actions" aria-label="ไปยังส่วนบันทึกข้อมูล">' +
      '<button class="button button-secondary" type="button" data-screen-jump="session">เริ่มงาน–จบงาน</button>' +
      '<button class="button button-secondary" type="button" data-screen-jump="output">บันทึกงานสกรีน</button>' +
      '<button class="button button-secondary" type="button" data-screen-jump="overtime">บันทึก OT</button></nav>' : '') +
    '<section class="attendance-section" data-screen-section="session" tabindex="-1" aria-label="เริ่มงานและจบงาน"></section>' +
    (canEnter ? '<section class="attendance-section" data-screen-section="output" tabindex="-1" aria-label="บันทึกงานสกรีน"></section>' +
      '<section class="attendance-section" data-screen-section="overtime" tabindex="-1" aria-label="บันทึก OT"></section>' : '');

  const jumpTo = name => {
    const section = root.querySelector('[data-screen-section="' + name + '"]');
    section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    section?.focus({ preventScroll: true });
  };
  root.querySelectorAll('[data-screen-jump]').forEach(button => {
    button.addEventListener('click', () => jumpTo(button.dataset.screenJump));
  });

  const panelContext = { ...context, workType: 'สกรีน', combinedScreen: true,
    jumpToScreenOutput: () => jumpTo('output') };
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
}
