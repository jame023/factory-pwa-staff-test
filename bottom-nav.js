import { iconMarkup } from '../js/ui-icons.js?v=1.3.218';
export function renderBottomNav(currentRoute) {
  return '<nav class="bottom-nav" aria-label="เมนูหลัก">' +
    '<a class="nav-item" href="#/home"' +
    (currentRoute === "home" ? ' aria-current="page"' : "") + '>' +
    '<span class="nav-icon" aria-hidden="true">'+iconMarkup('home')+'</span>' +
    '<span>หน้าหลัก</span></a></nav>';
}
