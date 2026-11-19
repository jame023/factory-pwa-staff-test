export function openDetailDialog({ title = 'รายละเอียด', subtitle = '', content = '', returnFocus = document.activeElement } = {}) {
  document.querySelector('[data-app-detail-dialog]')?.close?.();
  document.querySelector('[data-app-detail-dialog]')?.remove();
  const dialog = document.createElement('dialog');
  dialog.className = 'app-detail-dialog';
  dialog.dataset.appDetailDialog = '';
  dialog.setAttribute('aria-labelledby', 'app-detail-dialog-title');
  const body = document.createElement('div');
  body.className = 'app-detail-dialog__body';
  const header = document.createElement('header');
  header.className = 'app-detail-dialog__header';
  const heading = document.createElement('h2');
  heading.id = 'app-detail-dialog-title';
  heading.textContent = String(title);
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'button app-detail-dialog__close admin-detail-close-button';
  close.setAttribute('aria-label', 'ปิดรายละเอียด');
  close.textContent = '×';
  header.append(heading, close);
  body.append(header);
  if (subtitle) {
    const summary = document.createElement('p');
    summary.className = 'app-detail-dialog__subtitle';
    summary.textContent = String(subtitle);
    body.append(summary);
  }
  const contentHost = document.createElement('div');
  contentHost.className = 'app-detail-dialog__content screen-detail-content';
  if (content instanceof Node) contentHost.append(content);
  else contentHost.innerHTML = String(content || '');
  body.append(contentHost);
  dialog.append(body);
  const closeDialog = () => { if (dialog.open) dialog.close(); else dialog.remove(); };
  close.addEventListener('click', closeDialog);
  dialog.addEventListener('click', event => { if (event.target === dialog) closeDialog(); });
  dialog.addEventListener('close', () => {
    dialog.remove();
    if (returnFocus?.isConnected && !document.querySelector('[data-app-detail-dialog]')) returnFocus.focus({ preventScroll: true });
  }, { once: true });
  document.body.append(dialog);
  dialog.showModal();
  close.focus({ preventScroll: true });
  return { dialog, content: contentHost, close: closeDialog };
}

export function installDetailDisclosureDialogs(root) {
  const onClick = event => {
    const summary = event.target.closest?.('summary');
    const details = summary?.parentElement;
    if (!details || !(details.matches('.screen-record-details, .work-manager-detail, details[data-detail-dialog]') || /^ดูรายละเอียด/.test(summary.textContent.trim()))) return;
    event.preventDefault();
    details.open = false;
    const content = document.createDocumentFragment();
    for (const child of details.children) if (child !== summary) content.append(child.cloneNode(true));
    openDetailDialog({ title: summary.textContent.trim() || 'รายละเอียด', content, returnFocus: summary });
  };
  root.addEventListener('click', onClick, true);
  return () => root.removeEventListener('click', onClick, true);
}
