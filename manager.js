import { listWorkSessions } from "../../adapters/package07.js?v=1.3.186";
import { statCard } from "../../components/app-card.js?v=1.3.186";
import { escapeHtml, thaiDateTime } from "../../js/utils.js?v=1.3.186";

const text = value => escapeHtml(value == null || value === "" ? "—" : String(value));
const validTime = value => value && Number.isFinite(Date.parse(value));
const elapsed = (row, now) => validTime(row.startedAt) && (!row.endedAt || validTime(row.endedAt)) &&
  Date.parse(row.endedAt || now) >= Date.parse(row.startedAt)
  ? Math.floor((Date.parse(row.endedAt || now) - Date.parse(row.startedAt)) / 60000) : null;
const hours = value => value == null ? "—" : Math.floor(value / 60) + " ชม. " + value % 60 + " นาที";
const timestamp = value => validTime(value) ? thaiDateTime(value) : "—";
const dateKey = value => {
  if (!validTime(value)) return "";
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Bangkok",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(value)).map(p=>[p.type,p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};
export function filterWorkRows(rows, filters) {
  return rows.filter(row => {
    const date = dateKey(row.startedAt);
    return (!filters.name || String(row.employee || "").includes(filters.name.trim())) &&
      (!filters.start || date && date >= filters.start) && (!filters.end || date && date <= filters.end) &&
      (!filters.machine || row.machine === filters.machine) && (!filters.type || row.workType === filters.type) &&
      (!filters.status || (filters.status === "done" ? !!row.endedAt : !row.endedAt));
  }).sort((a,b) => (Date.parse(b.startedAt) || 0) - (Date.parse(a.startedAt) || 0));
}
export function summarizeWork(rows, now = new Date().toISOString()) {
  const total = { active:0,done:0,workers:new Set(),minutes:0,production:0,screen:0 };
  rows.forEach(row => {
    total[row.endedAt ? "done" : "active"]++;
    if (row.employeeId || row.employee) total.workers.add(row.employeeId || row.employee);
    total.minutes += elapsed(row,now) || 0;
    if (row.endedAt && row.quantity !== "" && row.quantity != null && Number.isFinite(Number(row.quantity)) && Number(row.quantity) >= 0) {
      if (row.workType === "ผลิต") total.production += Number(row.quantity);
      if (row.workType === "สกรีน") total.screen += Number(row.quantity);
    }
  });
  return {...total,workers:total.workers.size};
}
function details(row, now) {
  const fields = [["ผู้ปฏิบัติงาน",row.employee],["กลุ่มงาน",Array.isArray(row.groups) ? row.groups.join(", ") : row.group],
    ["ประเภทงาน",row.workType],["เครื่องจักร",row.machine],["ชื่อออเดอร์",row.workType === "ผลิต" ? "ไม่ใช้กับงานผลิต" : row.orderName],
    ["เวลาเริ่ม",timestamp(row.startedAt)],["เวลาจบ",row.endedAt ? timestamp(row.endedAt) : "ยังไม่จบงาน"],
    ["ระยะเวลาทำงาน",hours(elapsed(row,now))],["จำนวนที่บันทึกตอนจบงาน",row.endedAt ? row.quantity : "รอบันทึกตอนจบงาน"],
    ["หมายเหตุ",row.note],["รหัสรายการ",row.id],["รหัสพนักงาน",row.employeeId],["สร้างรายการเมื่อ",timestamp(row.createdAt)]];
  return '<details class="card card-pad work-manager-detail"><summary>' + text(row.employee) + ' · ' + text(row.machine) + ' · ' + text(row.endedAt ? "จบงานแล้ว" : "กำลังทำงาน") + '</summary><dl class="work-manager-fields">' + fields.map(([label,value])=>'<div><dt>' + text(label) + '</dt><dd>' + text(value) + '</dd></div>').join("") + '</dl></details>';
}
export async function renderWorkManager(root,context) {
  root.innerHTML = '<div class="page-heading"><div><p class="eyebrow">Work Session</p><h1>ข้อมูลการทำงาน</h1><p>ดูงานทั้งหมดที่พนักงานบันทึก พร้อมเวลา จำนวน และหมายเหตุ</p></div><button class="button" data-refresh>รีเฟรช</button></div><p class="notice notice-warning">ข้อมูลรายการงานอ่านจาก Supabase ตามสิทธิ์บัญชีที่เข้าสู่ระบบ</p><form class="card card-pad work-filters" data-work-filter><div class="work-filter-grid"><div class="field"><label for="work-date">วันที่ค้นหา (วัน/เดือน/ปี)</label><input id="work-date" name="date" type="date"></div><div class="field"><label for="work-machine">เครื่องจักร</label><select id="work-machine" name="machine"><option value="">ทุกเครื่อง</option></select></div><div class="field"><label for="work-type">ประเภทงาน</label><select id="work-type" name="type"><option value="">ทุกประเภท</option><option>ผลิต</option><option>สกรีน</option></select></div><div class="work-filter-actions"><button class="button button-primary" type="submit">ค้นหา</button><button class="button" type="reset">ล้างตัวกรอง</button></div></div><p class="help-text">ค้นหาตามวันเริ่มงาน เขตเวลา Asia/Bangkok • เว้นวันที่ว่างเพื่อดูทุกวัน</p></form><div data-work-status role="status" aria-live="polite"></div><div data-work-content></div>';
  const form = root.querySelector("form");
  const status = root.querySelector("[data-work-status]");
  const content = root.querySelector("[data-work-content]");
  const refresh = root.querySelector("[data-refresh]");
  let rows = [];
  let version = 0;
  const filters = () => {
    const values = Object.fromEntries(new FormData(form));
    return { machine:values.machine, type:values.type, start:values.date, end:values.date };
  };
  function draw() {
    const query = filters();
    if (query.start && query.end && query.start > query.end) { status.textContent = "วันที่เริ่มต้องไม่เกินวันที่สิ้นสุด"; return; }
    const selected = filterWorkRows(rows,query);
    const now = new Date().toISOString();
    const totals = summarizeWork(selected,now);
    status.textContent = "พบ " + selected.length + " รายการ • อัปเดต " + thaiDateTime(now);
    const cards = [["งานที่กำลังทำ",totals.active,"รายการ"],["งานที่จบแล้ว",totals.done,"รายการ"],["พนักงาน",totals.workers,"คน"],
      ["เวลาทำงานรวม",hours(totals.minutes),"ผลรวมระยะเวลาทุกงาน อาจมีเวลาทับซ้อน"],["จำนวนผลิต",totals.production,"ยอดที่บันทึกเมื่อจบงาน"],["จำนวนสกรีน",totals.screen,"ยอดที่บันทึกเมื่อจบงาน"]];
    const headers = ["ผู้ทำงาน","ประเภทงาน","เครื่องจักร","ออเดอร์","เริ่มงาน","จบงาน","ระยะเวลา","จำนวน","สถานะ","หมายเหตุ"];
    content.innerHTML = '<div class="grid grid-3 attendance-section">' + cards.map(card=>statCard(...card)).join("") + '</div><div class="section-title"><h2>รายการการทำงานทั้งหมด</h2></div>' +
      (selected.length ? '<div class="table-wrap" tabindex="0" role="region" aria-label="รายการงาน เลื่อนแนวนอนเพื่อดูทุกคอลัมน์"><table><thead><tr>' + headers.map(h=>'<th scope="col">'+h+'</th>').join("") + '</tr></thead><tbody>' + selected.map(row=>'<tr>' + [row.employee,row.workType,row.machine,row.workType === "ผลิต" ? "ไม่ใช้" : row.orderName,timestamp(row.startedAt),row.endedAt ? timestamp(row.endedAt) : "—",hours(elapsed(row,now)),row.endedAt ? row.quantity : "รอจบงาน",row.endedAt ? "จบแล้ว" : "กำลังทำงาน",row.note].map(v=>'<td>'+text(v)+'</td>').join("")+'</tr>').join("") + '</tbody></table></div><div class="section-title"><h2>รายละเอียดแต่ละงาน</h2></div><div class="work-manager-details">' + selected.map(row=>details(row,now)).join("") + '</div>' : '<div class="empty-state">' + (rows.length ? 'ไม่พบงานตามตัวกรองที่เลือก' : 'ยังไม่มีรายการงานใน Supabase') + '</div>') +
      '<p class="help-text">ระยะเวลางานที่ยังไม่จบคำนวณ ณ เวลาอัปเดต กดรีเฟรชเพื่อดูเวลาล่าสุด • จำนวนผลิตและสกรีนแสดงแยกกันตามข้อมูลที่บันทึก • กลุ่มงานที่ไม่มีข้อมูลจะแสดง — โดยไม่เดาจากประเภทงาน</p>';
  }
  async function load(notify=false) {
    const current = ++version;
    if (context.signal?.aborted) return;
    refresh.disabled = true;
    form.querySelector('[type="submit"]').disabled = true;
    status.textContent = "กำลังอ่านข้อมูลการทำงาน…";
    content.replaceChildren();
    try {
      const result = await listWorkSessions({signal:context.signal});
      if (current !== version || context.signal?.aborted) return;
      rows = result;
      const selected = form.elements.machine.value;
      form.elements.machine.innerHTML = '<option value="">ทุกเครื่อง</option>' + [...new Set(rows.map(row=>row.machine).filter(Boolean))].sort().map(machine=>'<option value="'+escapeHtml(machine)+'">'+escapeHtml(machine)+'</option>').join("");
      form.elements.machine.value = selected;
      draw();
      if (notify) context.showToast("โหลดข้อมูลการทำงานแล้ว", "success");
    } catch (error) {
      if (context.signal?.aborted || current !== version || error.name === "AbortError") return;
      status.textContent = "อ่านข้อมูลไม่สำเร็จ กดรีเฟรชเพื่อลองใหม่";
      context.showToast(error.message || "อ่านข้อมูลไม่สำเร็จ","error");
    } finally {
      if (current === version) { refresh.disabled = false; form.querySelector('[type="submit"]').disabled = false; }
    }
  }
  form.addEventListener("submit",event=>{event.preventDefault(); draw(); context.showToast("ค้นหาข้อมูลการทำงานเสร็จแล้ว", "success");});
  form.addEventListener("reset",()=>queueMicrotask(()=>{draw();context.showToast("ล้างตัวกรองแล้ว", "success");}));
  refresh.addEventListener("click",()=>void load(true));
  context.onDataChange?.(load);
  await load();
}

