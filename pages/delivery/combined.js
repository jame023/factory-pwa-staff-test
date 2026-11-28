import { render as renderDelivery } from './index.js?v=1.3.411';
import { render as renderOvertime } from '../ot/index.js?v=1.3.411';

export async function render(root, context) {
  root.innerHTML = '<header class="page-heading"><div><p class="eyebrow">ขนส่ง</p><h1>งานขนส่ง</h1><p>บันทึกการขนส่งและ OT แยกส่วนกันในหน้านี้</p></div></header>' +
    '<nav class="form-actions" aria-label="ไปยังส่วนงานขนส่ง">' +
      '<button class="button button-secondary" type="button" data-delivery-jump="delivery">บันทึกการขนส่ง</button>' +
      '<button class="button button-secondary" type="button" data-delivery-jump="overtime">บันทึก OT</button></nav>' +
    '<section class="attendance-section" data-delivery-section="delivery" tabindex="-1" aria-label="บันทึกการขนส่ง"></section>' +
    '<section class="attendance-section" data-delivery-section="overtime" tabindex="-1" aria-label="บันทึก OT"></section>';

  const jumpTo = name => {
    const section = root.querySelector('[data-delivery-section="' + name + '"]');
    section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    section?.focus({ preventScroll: true });
  };
  root.querySelectorAll('[data-delivery-jump]').forEach(button => {
    button.addEventListener('click', () => jumpTo(button.dataset.deliveryJump));
  });

  const panels = [
    { name: 'delivery', render: renderDelivery },
    { name: 'overtime', render: renderOvertime }
  ];
  const renderPanel = async panel => {
    const host = root.querySelector('[data-delivery-section="' + panel.name + '"]');
    if (!host || context.signal?.aborted) return;
    host.innerHTML = '<p class="page-loading">กำลังโหลดข้อมูล…</p>';
    try {
      await panel.render(host, context);
    } catch {
      if (context.signal?.aborted) return;
      host.innerHTML = '<div class="notice notice-error" role="alert"><p>โหลดส่วนนี้ไม่สำเร็จ กรุณาลองใหม่</p><button class="button" type="button">ลองอีกครั้ง</button></div>';
      host.querySelector('button').addEventListener('click', () => void renderPanel(panel));
    }
  };
  await Promise.all(panels.map(renderPanel));
}
