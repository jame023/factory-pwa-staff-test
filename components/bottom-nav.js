import { iconMarkup } from '../js/ui-icons.js?v=1.3.340';
export function renderBottomNav(currentRoute, homeRoute = 'home') {
  return '<nav class="bottom-nav" aria-label="เมนูหลัก">' +
    '<a class="nav-item" href="#/' + homeRoute + '"' +
    (currentRoute === homeRoute ? ' aria-current="page"' : "") + '>' +
    '<span class="nav-icon" aria-hidden="true">'+iconMarkup('home')+'</span>' +
    '<span>หน้าหลัก</span></a></nav>';
}