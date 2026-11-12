export const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
}[char]));
export const bangkokToday = () => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit"
}).format(new Date());
export const thaiDate = (iso) => {
  if (!iso) return "—";
  const date = new Date(String(iso) + "T00:00:00+07:00");
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "long", timeZone: "Asia/Bangkok" }).format(date);
};
export const thaiDateTime = (value) => {
  if (!value) return "—";
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok"
  }).format(new Date(value));
};
export const shortTime = (value) => {
  if (!value) return "—";
  return new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" }).format(new Date(value));
};
export const localDateTimeValue = () => {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};
export const sleep = (ms = 240) => new Promise(resolve => setTimeout(resolve, ms));
export const statusClass = (status) => ({
  approved: "badge-success", completed: "badge-success", present: "badge-success",
  pending: "badge-warning", absent: "badge-danger", rejected: "badge-danger",
  active: "badge-info"
}[status] || "");
export const statusText = (status) => ({
  approved: "อนุมัติแล้ว", pending: "รออนุมัติ", rejected: "ปฏิเสธ",
  completed: "จบงานแล้ว", active: "กำลังทำงาน", present: "มาทำงาน", absent: "ขาด"
}[status] || status || "—");
