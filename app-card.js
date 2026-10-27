import { escapeHtml } from "../js/utils.js?v=1.3.186";
export function appCard({ route, icon, title, hint }) {
  return '<a class="card module-card" href="#/' + escapeHtml(route) + '">' +
    '<span class="module-icon" aria-hidden="true">' + icon + "</span>" +
    '<span class="module-copy"><span class="module-title">' + escapeHtml(title) + "</span>" +
    '<span class="module-hint">' + escapeHtml(hint) + "</span></span>" +
    '<span class="module-arrow" aria-hidden="true">›</span></a>';
}
// Colour only a positive recorded metric; missing, zero and normal values stay neutral.
export function attendanceToneClass(tone, value) {
  if (!['leave','absent','late','late-total','early','early-total'].includes(tone)) return '';
  let positive = typeof value === 'number' && Number.isFinite(value) && value > 0;
  if (typeof value === 'string') {
    const text = value.trim();
    const clock = /^(\d+):([0-5]\d)$/.exec(text);
    const count = /^(\d+(?:\.\d+)?)(?:\s+(?:วัน|นาที|ครั้ง))?$/.exec(text);
    positive = clock ? Number(clock[1]) * 60 + Number(clock[2]) > 0 : Boolean(count && Number(count[1]) > 0);
  }
  return positive ? 'attendance-tone attendance-tone-' + tone : '';
}
export function statCard(label, value, note = "", tone = "") {
  const colorClass = attendanceToneClass(tone, value); 
  return '<article class="card stat-card ' + colorClass + '"><div class="stat-label">' + escapeHtml(label) +
    '</div><div class="stat-value">' + escapeHtml(value) + '</div>' +
    (note ? '<div class="stat-note">' + escapeHtml(note) + "</div>" : "") + "</article>";
}
