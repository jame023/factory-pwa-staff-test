const BODY_LOCK_CLASS = 'is-status-modal-open';
const FOCUSABLE_SELECTOR = 'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled])';

let active = null;
let previousFocus = null;
let previousBodyOverflow = '';
let previousBodyPaddingRight = '';

function focusables(root) {
  return [...root.querySelectorAll(FOCUSABLE_SELECTOR)].filter(element => !element.hidden && element.getClientRects().length > 0);
}

function lockPage() {
  previousBodyOverflow = document.body.style.overflow;
  previousBodyPaddingRight = document.body.style.paddingRight;
  const scrollbarWidth = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
  document.body.style.overflow = 'hidden';
  if (scrollbarWidth) document.body.style.paddingRight = `${scrollbarWidth}px`;
  document.body.classList.add(BODY_LOCK_CLASS);
}

function unlockPage() {
  document.body.style.overflow = previousBodyOverflow;
  document.body.style.paddingRight = previousBodyPaddingRight;
  document.body.classList.remove(BODY_LOCK_CLASS);
}

function asOptions(options) {
  return typeof options === 'string' ? { message: options } : (options || {});
}

function renderState(root, options) {
  const { title = 'สถานะการทำงาน', message = '', detail = '', tone = 'working', retry = null, close = null } = options;
  const working = tone === 'working';
  root.setAttribute('role', tone === 'error' ? 'alertdialog' : 'dialog');
  root.setAttribute('aria-busy', String(working));
  const displayTitle = tone === 'error' && /ไม่มีสิทธิ์/.test(message) ? 'ไม่มีสิทธิ์ดำเนินการ' : tone === 'error' && /session หมดอายุ|เซสชันหมดอายุ/i.test(message) ? 'Session หมดอายุ' : title;
  root.querySelector('[data-status-title]').textContent = String(displayTitle);
  root.querySelector('[data-status-message]').textContent = String(message);
  root.querySelector('[data-status-detail]').textContent = String(detail || '');
  root.querySelector('[data-status-detail]').hidden = !detail;
  const icon = root.querySelector('[data-status-icon]');
  icon.className = `status-modal-icon status-modal-icon-${tone}`;
  icon.textContent = working ? '' : tone === 'success' ? '✓' : tone === 'error' ? '!' : 'i';
  const retryButton = root.querySelector('[data-status-retry]');
  retryButton.hidden = working || typeof retry !== 'function';
  retryButton.onclick = typeof retry === 'function' ? () => retryButton.disabled || retry() : null;
  const closeButton = root.querySelector('[data-status-close]');
  closeButton.hidden = working || typeof close !== 'function';
  closeButton.onclick = typeof close === 'function' ? close : null;
  root.querySelector('.status-modal-card').classList.toggle('status-modal-card-error', tone === 'error');
  root.querySelector('.status-modal-card').classList.toggle('status-modal-card-success', tone === 'success');
}

function closeActive({ restoreFocus = true } = {}) {
  if (!active) return;
  const current = active;
  active = null;
  current.root.remove();
  unlockPage();
  const target = previousFocus;
  previousFocus = null;
  if (restoreFocus && target?.isConnected && typeof target.focus === 'function') target.focus({ preventScroll: true });
}

export function isStatusModalOpen() {
  return Boolean(active);
}

export function showStatusModal(options, legacyOptions = {}) {
  const initial = { ...asOptions(options), ...legacyOptions };
  if (active) return active.controller;
  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const root = document.createElement('div');
  root.className = 'status-modal-backdrop';
  root.dataset.globalStatusModal = 'true';
  root.tabIndex = -1;
  root.setAttribute('aria-modal', 'true');
  root.innerHTML = '<section class="status-modal-card" aria-labelledby="global-status-title" aria-describedby="global-status-message">' +
    '<span class="status-modal-icon" data-status-icon aria-hidden="true"></span>' +
    '<div class="status-modal-copy"><h2 id="global-status-title" data-status-title></h2><p class="status-modal-message" data-status-message></p><p class="status-modal-detail" data-status-detail hidden></p>' +
    '<div class="status-modal-actions"><button class="button button-primary" type="button" data-status-retry hidden>ลองใหม่</button><button class="button" type="button" data-status-close hidden>ปิด</button></div></div></section>';
  lockPage();
  document.body.append(root);
  const controller = {
    update(next, nextTone = initial.tone || 'working', extra = {}) {
      if (active?.root !== root) return controller;
      const state = typeof next === 'string' ? { message: next, tone: nextTone, ...extra } : { ...next, tone: next.tone || nextTone };
      renderState(root, state);
      if (state.tone !== 'working') focusables(root)[0]?.focus({ preventScroll: true });
      return controller;
    },
    close() { if (active?.root === root) closeActive(); },
    isOpen() { return active?.root === root; },
  };
  active = { root, controller };
  root.addEventListener('click', event => { if (event.target === root && active?.root === root && initial.dismissOnBackdrop && initial.tone !== 'working') closeActive(); });
  root.addEventListener('keydown', event => {
    if (event.key === 'Escape' && active?.root === root && initial.tone !== 'working' && initial.dismissOnEscape !== false) { event.preventDefault(); closeActive(); return; }
    if (event.key !== 'Tab') return;
    const items = focusables(root);
    if (!items.length) { event.preventDefault(); return; }
    const first = items[0], last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  renderState(root, initial);
  root.focus({ preventScroll: true });
  return controller;
}

export async function runStatusOperation(options, operation) {
  if (isStatusModalOpen()) return { accepted: false, value: null };
  const modal = showStatusModal(options);
  try {
    const value = await operation(modal);
    return { accepted: true, value };
  } catch (error) {
    modal.update({ ...asOptions(options), message: error?.message || 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ', tone: 'error' });
    throw error;
  }
}
