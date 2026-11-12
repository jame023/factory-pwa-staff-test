const root = document.getElementById('pwa-install-root');
const standalone = matchMedia('(display-mode: standalone)');
let deferredPrompt;
let installing = false;
const appUrl = new URL('./',document.baseURI).href;
// Device-local presentation preference only; never used for authentication or permissions.
const installedKey = 'factory-pwa:installed:' + appUrl;
const launchedAsApp = () => standalone.matches || navigator.standalone === true;
function readInstalled() {
  try { return localStorage.getItem(installedKey) === 'true'; } catch (_) { return false; }
}
let installed = readInstalled();
function rememberInstalled(value) {
  installed = value;
  try {
    if (value) localStorage.setItem(installedKey,'true');
    else localStorage.removeItem(installedKey);
  } catch (_) { /* In-memory state still hides the card if storage is unavailable. */ }
}

const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const inLine = /\bLine\//i.test(navigator.userAgent);

root.innerHTML = `<div class="pwa-install-card">
  <div class="pwa-install-heading"><span class="pwa-install-icon" aria-hidden="true">↓</span><div>
    <h2>ติดตั้งแอปลงหน้าจอ</h2><p>เปิดระบบโรงงาน SIP จากไอคอนบนมือถือได้สะดวกขึ้น</p>
  </div></div>
  <div class="pwa-install-actions"><button type="button" class="button button-primary" data-pwa-install>ติดตั้งแอปลงหน้าจอ</button>
  <button type="button" class="button" data-pwa-help>ดูวิธีติดตั้ง</button></div>
  <p class="pwa-install-status" role="status" aria-live="polite"></p>
</div>`;

const dialog = document.createElement('dialog');
dialog.className = 'pwa-install-dialog';
dialog.setAttribute('aria-labelledby','pwa-install-title');
dialog.innerHTML = `<div class="pwa-install-dialog-body"><div class="pwa-install-dialog-header">
  <h2 id="pwa-install-title">เพิ่มระบบโรงงาน SIP ลงหน้าจอ</h2><button type="button" class="button button-small" data-pwa-close aria-label="ปิดคำแนะนำติดตั้ง">ปิด</button></div>
  <p data-pwa-line class="pwa-install-note" hidden>กำลังเปิดใน LINE ให้คัดลอกลิงก์ด้านล่างไปเปิดใน Chrome หรือ Safari ก่อนติดตั้ง</p>
  <label for="pwa-device">เลือกอุปกรณ์ของคุณ</label><select id="pwa-device" class="pwa-install-device">
    <option value="android">Android</option><option value="ios">iPhone / iPad</option><option value="desktop">คอมพิวเตอร์</option></select>
  <ol class="pwa-install-steps"></ol>
  <p class="pwa-install-note">หลังเพิ่มแล้ว ให้เปิดจากไอคอน SIP บนหน้าจอ และเข้าสู่ระบบด้วย LINE ครั้งแรก</p>
  <label for="pwa-app-url">ลิงก์แอปสำหรับเปิดบนมือถือ</label><input id="pwa-app-url" class="pwa-install-url" type="url" readonly>
  <button type="button" class="button button-primary pwa-install-copy" data-pwa-copy>คัดลอกลิงก์แอป</button>
  <p class="pwa-install-status" data-pwa-copy-status role="status" aria-live="polite"></p>
</div>`;
document.body.append(dialog);
const installButton = root.querySelector('[data-pwa-install]');
const status = root.querySelector('.pwa-install-status');
const device = dialog.querySelector('#pwa-device');
const urlField = dialog.querySelector('#pwa-app-url');
urlField.value = appUrl;
device.value = ios ? 'ios' : /android/i.test(navigator.userAgent) ? 'android' : 'desktop';
dialog.querySelector('[data-pwa-line]').hidden = !inLine;
const instructions = {
  android:['เปิดลิงก์แอปด้วย Chrome','แตะเมนู ⋮ มุมขวาบน','เลือก “ติดตั้งแอป” หรือ “เพิ่มลงในหน้าจอหลัก” แล้วเลือกติดตั้งตามที่เครื่องแสดง','ยืนยันติดตั้ง แล้วเปิดจากไอคอน SIP บนหน้าจอ'],
  ios:['เปิดลิงก์แอปด้วย Safari','แตะปุ่มแชร์ รูปสี่เหลี่ยมมีลูกศรชี้ขึ้น','เลือก “เพิ่มไปยังหน้าจอโฮม” หากมี “เปิดเป็นแอปเว็บ” ให้เปิดไว้','แตะ “เพิ่ม” แล้วเปิดจากไอคอน SIP บนหน้าจอโฮม'],
  desktop:['เปิดลิงก์แอปด้วย Chrome หรือ Edge','กดไอคอนติดตั้งที่แถบที่อยู่ หรือเปิดเมนู Browser แล้วเลือกติดตั้งแอป หากมีให้เลือก','ยืนยันติดตั้ง แล้วเปิด SIP จากรายการแอปของเครื่อง']
};
function updateSteps() {
  const list = dialog.querySelector('.pwa-install-steps');
  list.replaceChildren(...instructions[device.value].map(text => { const li=document.createElement('li');li.textContent=text;return li; }));
}
function refresh() {
  if (launchedAsApp() && !installed) rememberInstalled(true);
  root.hidden = launchedAsApp() || installed;
  installButton.disabled = installing;
}
function showHelp() {
  updateSteps();
  dialog.querySelector('[data-pwa-copy-status]').textContent = '';
  if (!dialog.open) { dialog.showModal(); document.body.classList.add('pwa-install-guide-open'); }
}
root.querySelector('[data-pwa-help]').addEventListener('click',showHelp);
device.addEventListener('change',updateSteps);
dialog.querySelector('[data-pwa-close]').addEventListener('click',() => dialog.close());
dialog.addEventListener('close',() => { document.body.classList.remove('pwa-install-guide-open'); });
dialog.addEventListener('click',event => { if (event.target===dialog && (event.clientX<dialog.getBoundingClientRect().left || event.clientX>dialog.getBoundingClientRect().right || event.clientY<dialog.getBoundingClientRect().top || event.clientY>dialog.getBoundingClientRect().bottom)) dialog.close(); });
dialog.querySelector('[data-pwa-copy]').addEventListener('click',async () => {
  const feedback=dialog.querySelector('[data-pwa-copy-status]');
  try { await navigator.clipboard.writeText(appUrl); feedback.textContent='คัดลอกลิงก์แล้ว นำไปเปิดบนมือถือได้เลย'; }
  catch (_) { urlField.focus();urlField.select();feedback.textContent='กดค้างหรือเลือกลิงก์ด้านบนเพื่อคัดลอก'; }
});
window.addEventListener('beforeinstallprompt',event => { event.preventDefault();rememberInstalled(false);deferredPrompt=event;refresh(); });
window.addEventListener('appinstalled',() => { rememberInstalled(true);deferredPrompt=null;dialog.close();refresh(); });
standalone.addEventListener('change',refresh);
window.addEventListener('storage',event => { if (event.key===installedKey || event.key===null) { installed=readInstalled();refresh(); } });
installButton.addEventListener('click',async () => {
  if (installing) return;
  if (!deferredPrompt || inLine || ios) { showHelp();return; }
  const prompt = deferredPrompt;
  deferredPrompt = null;
  installing = true;
  refresh();
  try {
    await prompt.prompt();
    const choice=await prompt.userChoice;
    status.textContent=choice.outcome==='accepted' ? 'ให้ยืนยันตามหน้าจอของเครื่อง แล้วเปิด SIP จากไอคอนแอป' : 'ยังไม่ได้ติดตั้ง สามารถกดดูวิธีติดตั้งได้';
  } catch (_) { status.textContent='ยังเปิดหน้าติดตั้งไม่ได้ กรุณาทำตามวิธีติดตั้ง';showHelp(); }
  finally { installing=false;refresh(); }
});
refresh();
