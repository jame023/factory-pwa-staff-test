import { subscribeStore } from './state.js?v=1.3.186';
import { APP_MODE } from './config.js?v=1.3.186';
import { showActionPopup } from '../components/action-popup.js?v=1.3.186';

// Serial, coalesced refreshes. A write/confirmation in progress keeps its controls.
export function watchChanges(refresh, { signal, busy = () => false, subscribe = subscribeStore,
  events = globalThis, delay = 100, onError = () => {} } = {}) {
  let pending = false, running = false, stopped = !!signal?.aborted, timer, initialRefresh = true;
  const schedule = () => {
    if (!stopped && !timer) timer = setTimeout(run, delay);
  };
  let revision = 0;
  const request = () => { revision++; pending = true; schedule(); };
  async function run() {
    timer = undefined;
    if (stopped || running || !pending) return;
    if (busy()) { schedule(); return; }
    pending = false; running = true;
    const current = revision;
    try {
      const isInitial = initialRefresh;
      initialRefresh = false;
      if (!isInitial && typeof document !== 'undefined') showActionPopup('กำลังอัปเดตข้อมูล…');
      const refreshed = await refresh(() => current === revision && !stopped);
      if (refreshed === false) pending = true;
      else if (!isInitial && !stopped && typeof document !== 'undefined') {
        showActionPopup('อัปเดตข้อมูลเสร็จแล้ว', { tone: 'success', timeout: 1500 });
      }
    }
    catch (error) { if (!stopped) onError(error); }
    finally { running = false; if (pending) schedule(); }
  }
  const unsubscribe = stopped ? () => {} : subscribe(request);
  const visible = () => { if (globalThis.document?.visibilityState !== 'hidden') request(); };
  const stop = () => {
    stopped = true; clearTimeout(timer); unsubscribe();
    events.removeEventListener?.('focus', request);
    events.removeEventListener?.('online', request);
    globalThis.document?.removeEventListener('visibilitychange', visible);
    signal?.removeEventListener('abort', stop);
  };
  if (!stopped) {
    events.addEventListener?.('focus', request);
    events.addEventListener?.('online', request);
    globalThis.document?.addEventListener('visibilitychange', visible);
    signal?.addEventListener('abort', stop, {once:true});
  }
  return { request, stop };
}

export function pageBusy(root) {
  return !!root.querySelector('button[type="submit"]:disabled:not([data-live-disabled]), [data-decision]:disabled, [data-cancel]:disabled, [data-end]:disabled');
}

// Values stay in memory only. Readonly identity/derived values always come from the fresh read.
export function preservePageDraft(previous, next) {
  const controls = root => [...root.querySelectorAll('input,select,textarea')];
  const identity = el => [el.closest('form')?.id || '', el.closest('[data-request]')?.dataset.request || '',
    el.id || el.name || '', el.dataset.date || '', el.hasAttribute('data-rejection') ? 'reject' : '',
    el.hasAttribute('data-cancel-reason') ? 'cancel' : ''].join('|');
  const old = new Map(controls(previous).map(el => [identity(el),el]));
  const focused = globalThis.document?.activeElement;
  const focusKey = focused && controls(previous).includes(focused) ? identity(focused) : null;
  const selection = focused ? [focused.selectionStart, focused.selectionEnd] : [];
  function restore(selectsOnly = false) {
    for (const el of controls(next)) {
      if (selectsOnly && el.tagName !== 'SELECT') continue;
      const before = old.get(identity(el));
      if (!before || el.readOnly || el.disabled || el.type !== before.type) continue;
      if (el.closest('form')?.id === 'end-work-form' &&
        previous.querySelector('[data-end]')?.dataset.end !== next.querySelector('[data-end]')?.dataset.end) continue;
      if (el.type === 'file') { el.replaceWith(before); continue; }
      if (el.tagName === 'SELECT' && ![...el.options].some(option=>option.value===before.value)) continue;
      el.value = before.value;
      if (['checkbox','radio'].includes(el.type)) el.checked = before.checked;
    }
  }
  restore();
  // Rebuild dependent controls such as per-day leave periods before restoring them.
  for (const el of next.querySelectorAll('select[name="workType"], input[name="startDate"], input[name="endDate"]'))
    el.dispatchEvent(new Event('change', {bubbles:true}));
  restore(true);
  const oldEnd=previous.querySelector('[data-end]'), newEnd=next.querySelector('[data-end]');
  if(oldEnd && newEnd && oldEnd.dataset.end===newEnd.dataset.end) {
    newEnd.hidden=oldEnd.hidden;
    next.querySelector('#end-work-form').hidden=previous.querySelector('#end-work-form').hidden;
  }
  const open = new Set([...previous.querySelectorAll('details[open]')].map(el=>el.dataset.liveKey).filter(Boolean));
  next.querySelectorAll('details[data-live-key]').forEach(el=>{el.open=open.has(el.dataset.liveKey);});
  return () => {
    const target = focusKey && controls(next).find(el=>identity(el)===focusKey);
    if (!target) return;
    target.focus?.({preventScroll:true});
    if (selection.every(value=>Number.isInteger(value))) {
      try { target.setSelectionRange?.(...selection); } catch { /* number/date controls have no text cursor */ }
    }
  };
}

export const mockLiveEnabled = APP_MODE === 'mock';
