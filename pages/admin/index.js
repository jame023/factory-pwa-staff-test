import { pageBusy } from '../../js/live-updates.js?v=1.3.186';
import { attendanceCalculation } from '../../js/business-rules.js?v=1.3.186';
import { render as renderWorkCalendar } from "../calendar/index.js?v=1.3.333";
import * as adminApi from "../../adapters/package11.js?v=1.3.327";
import * as workApi from "../../adapters/package07.js?v=1.3.298";
import * as deliveryApi from "../../adapters/package04.js?v=1.3.298";
import * as leaveApi from "../../adapters/package09.js?v=1.3.298";
import { escapeHtml, thaiDateTime } from "../../js/utils.js?v=1.3.186";
import { RECORD_SCHEMAS, blankRecord, validateRecord } from "../../js/record-schema.js?v=1.3.186";
import { requireOnlineAction } from "../../js/offline.js?v=1.3.186";
import { confirmAction } from "../../components/modal.js?v=1.3.186";
import { normalizeRoute } from "../../js/route-policy.js?v=1.3.333";
import { adminLeaveProxyMarkup, bindAdminLeaveProxy } from "./leave-proxy.js?v=1.3.313";
import { ADMIN_AUDIT_PAGE_SIZE, AUDIT_TABLE_OPTIONS, auditTableLabel, validateAuditFilters } from "../../js/admin-audit-contract.js?v=1.3.330";

const modules = [
  ["employees","พนักงานและสิทธิ์","ชื่อ กลุ่มงาน บทบาท และสถานะบัญชี"],
  ["attendance","เวลาเข้าออก","เวลาเข้า–ออกและสถานะการทำงาน"],
  ["leaveRequests","การลา","คำขอและสถานะการพิจารณา"],
  ["calendar","ปฏิทินการทำงาน","เต็มวัน ครึ่งวัน และหยุดแยกกลุ่ม"],
  ["workSessions","เริ่มงาน–จบงาน","เครื่องจักร ออเดอร์ และเวลาเริ่ม–จบ"],
  ["production","งานผลิต","จำนวนผลิต ของเสีย และผู้บันทึก"],
  ["deliveries","การขนส่ง","สินค้า ผู้ส่ง และสถานะรายการ"],
  ["screenEntries","งานสกรีน","จำนวนแพ็ค และของเสียจากสกรีนหรือผลิต"],
  ["otRequests","ทำงานล่วงเวลา (OT)","รายการทำงานล่วงเวลาและรูปหลักฐาน"],
  ["audit","ประวัติการแก้ไข","ผู้แก้ไข เหตุผล และข้อมูลก่อน–หลัง"]
];
const moduleRoutes = Object.freeze({
  employees:"/admin/records/employees", attendance:"/admin/records/attendance", leaveRequests:"/admin/records/leave",
  calendar:"/admin/records/calendar", workSessions:"/admin/records/work-sessions", production:"/admin/records/production",
  deliveries:"/admin/records/deliveries", screenEntries:"/admin/records/screen", otRequests:"/admin/records/ot", audit:"/admin/records/audit"
});
function adminRecordItemMarkup(index,primary,details,selected) {
  return '<button type="button" class="admin-link" data-record="'+index+'" aria-pressed="'+String(selected)+'"><span class="admin-record-summary"><strong>'+escapeHtml(primary||'รายการ')+'</strong><span>'+escapeHtml(details||'ไม่มีรายละเอียดเพิ่มเติม')+'</span></span><span class="admin-record-action">ดูรายละเอียด ›</span></button>';
}
const operationalCategories = new Set(["leaveRequests","otRequests","screenEntries","production","workSessions","deliveries"]);
const ADMIN_DELIVERY_PAGE_SIZE = 25;
const ADMIN_OT_PAGE_SIZE = 25;
const ADMIN_WORK_SESSION_PAGE_SIZE = 25;
const printable = value => value == null || value === "" ? "—" : typeof value === "object" ? JSON.stringify(value,null,2) : String(value);
const attendanceDayLabel = row => attendanceCalculation(row.checkIn || '',row.checkOut || '',{source:'admin11'}).workdayStatus === 'ครึ่งวัน' ? 'ครึ่งวัน' : 'เต็มวัน';
const fieldText = (spec, value) => spec.labels?.[spec.options.indexOf(String(value))] ?? value ?? "—";
function currentBangkokDate() {
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Bangkok",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
  const values=Object.fromEntries(parts.filter(part=>part.type!=="literal").map(part=>[part.type,part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
function defaultOtFilters() {
  const today=currentBangkokDate();
  return {from:`${today.slice(0,4)}-01-01`,to:today};
}
const actionLabels = Object.freeze({
  INSERT:"เพิ่ม", UPDATE:"แก้ไข", DELETE:"ลบหรือถอดรายการ", ACTIVATE:"เปิดใช้งาน", DEACTIVATE:"ปิดใช้งาน",
  GRANT_GROUP:"เพิ่มสิทธิ์กลุ่ม", REVOKE_GROUP:"ถอดสิทธิ์กลุ่ม", APPROVE:"อนุมัติ", REJECT:"ไม่อนุมัติ", REVIEW:"ตรวจสอบ",
  APPROVE_REGISTRATION:"อนุมัติสมัครสมาชิก", REJECT_REGISTRATION:"ปฏิเสธสมัครสมาชิก",
  "package04.delivery.create":"บันทึกการขนส่ง", "package05.production.create":"บันทึกการผลิต",
  "package07.work.start":"เริ่มงาน", "package07.work.end":"จบงาน",
  "package08.calendar.save":"ตั้งปฏิทินงาน", "package09.leave.submit":"ส่งคำขอลา",
  "package09.leave.review":"พิจารณาคำขอลา"
});
const actionText = action => actionLabels[action] || (typeof action==='string'
  ? (RECORD_SCHEMAS[action.split(".")[0]]?.label || "ข้อมูล") + (action.endsWith(".edit") ? " • แก้ไข" : " • เพิ่มรายการ")
  : 'ไม่ระบุประเภท');

function leaveDetailMarkup(detail, images) {
  const fields=[['รหัสคำขอ',detail.id],['ผู้ขอลา',detail.employee],['เจ้าของรายการ',detail.employeeId],['กลุ่มงาน',detail.group],
    ['ประเภทลา',detail.type],['วันเริ่มลา',detail.startDate],['วันสิ้นสุด',detail.endDate],['จำนวนวันตามคำขอ',detail.totalDays],
    ['ช่วงวันและเวลา',detail.period],['เหตุผลการลา',detail.reason],['สถานะ',detail.status],
    ['ยื่นแทนโดย Admin',detail.adminProxy?`${detail.submittedByAdminName||'Admin'} · ${detail.submittedByAdmin||'—'}`:'—'],['เหตุผลที่ Admin ยื่นแทน',detail.adminProxyReason||'—'],
    ['เหตุผลที่บันทึกใน Audit',detail.recordReason],['ผู้พิจารณา',detail.reviewedBy],
    ['เวลาพิจารณา',thaiDateTime(detail.reviewedAt)],['สร้างเมื่อ',thaiDateTime(detail.createdAt)],['แก้ไขล่าสุด',thaiDateTime(detail.updatedAt)],
    ['Audit ล่าสุด',detail.audit?`${detail.audit.action} · ${detail.audit.actor_employee_id} · ${thaiDateTime(detail.audit.created_at)}`:'ยังไม่มี Audit ที่ยืนยันได้']];
  const media=images||[];
  return '<dl class="work-manager-fields">'+fields.map(([label,value])=>'<div><dt>'+escapeHtml(label)+'</dt><dd><pre class="admin-data-value">'+escapeHtml(printable(value))+'</pre></dd></div>').join('')+
    '</dl><div class="delivery-evidence"><strong>เอกสารแนบ ('+media.length+')</strong><div class="ot-photo-grid">'+media.map((file,index)=>'<a class="ot-photo-card" href="'+escapeHtml(file.url)+'" target="_blank" rel="noreferrer"><img src="'+escapeHtml(file.url)+'" alt="เอกสารแนบ '+(index+1)+'"><span>'+escapeHtml(file.name||('ไฟล์ที่ '+(index+1)))+'</span></a>').join('')+'</div></div>';
}

function deliveryDetailMarkup(detail) {
  const fields=[['รหัสรายการ',detail.id],['ผู้บันทึก/ผู้ส่ง',detail.sender],['เจ้าของรายการ',detail.owner_id],['กลุ่มงาน',detail.group_name],
    ['สินค้า',detail.product],['เลขบิล',detail.bill_number],['จำนวน',detail.quantity],['วันเวลาขนส่ง (เวลาไทย)',thaiDateTime(detail.event_at)],
    ['สถานะ',detail.status],['สร้างเมื่อ',thaiDateTime(detail.created_at)],['แก้ไขล่าสุด',thaiDateTime(detail.updated_at)],
    ['ตรวจ Audit',detail.audit_verified===true?'ยืนยันแล้ว':'ยังยืนยันไม่ได้']];
  const files=detail.attachments||[];
  return '<dl class="work-manager-fields">'+fields.map(([label,value])=>'<div><dt>'+escapeHtml(label)+'</dt><dd><pre class="admin-data-value">'+escapeHtml(printable(value))+'</pre></dd></div>').join('')+
    '</dl><div class="delivery-evidence"><strong>รูปหลักฐาน ('+files.length+')</strong><div class="ot-photo-grid">'+files.map((file,index)=>'<a class="ot-photo-card" href="'+escapeHtml(file.signed_url)+'" target="_blank" rel="noreferrer"><img src="'+escapeHtml(file.signed_url)+'" alt="รูปหลักฐาน '+(index+1)+'"><span>'+escapeHtml(file.name||('รูปที่ '+(index+1)))+'</span></a>').join('')+'</div></div>';
}

function otListLabel(row) {
  const minutes=Number(row.duration_minutes);
  const duration=Number.isFinite(minutes)?`${Math.floor(minutes/60)} ชม. ${minutes%60} นาที`:'—';
  return [thaiDateTime(row.date),row.group_name||'—',duration,row.status||'—',`รูป ${Number(row.attachment_count)||0}`].join(' · ');
}

function otDetailMarkup(detail) {
  const minutes=Number(detail.duration_minutes);
  const duration=Number.isFinite(minutes)?`${Math.floor(minutes/60)} ชม. ${minutes%60} นาที`:'—';
  const fields=[['รหัสรายการ',detail.id],['พนักงาน',detail.employee_name],['รหัสเจ้าของ',detail.employee_id],['กลุ่มงาน',detail.group_name],
    ['วันที่รายงาน OT',thaiDateTime(detail.date)],['ระยะเวลา',duration],['รายละเอียด',detail.details],['สถานะ',detail.status],
    ['ตรวจ Audit',detail.audit_verified===true?'มี Audit รายการหลักและไฟล์ครบ':'ยังยืนยัน Audit ไม่ครบ'],
    ['รุ่นข้อมูล',detail.version],['สร้างเมื่อ',thaiDateTime(detail.created_at)],['แก้ไขล่าสุด',thaiDateTime(detail.updated_at)]];
  const files=detail.attachments||[];
  return '<dl class="work-manager-fields">'+fields.map(([label,value])=>'<div><dt>'+escapeHtml(label)+'</dt><dd><pre class="admin-data-value">'+escapeHtml(printable(value))+'</pre></dd></div>').join('')+
    '</dl>'+auditEventsMarkup(detail.audit_events)+'<div class="delivery-evidence"><strong>รูปหลักฐาน ('+files.length+')</strong><div class="ot-photo-grid">'+files.map((file,index)=>'<a class="ot-photo-card" href="'+escapeHtml(file.signed_url)+'" target="_blank" rel="noreferrer"><img src="'+escapeHtml(file.signed_url)+'" alt="รูปหลักฐาน OT '+(index+1)+'"><span>'+escapeHtml(file.name||('รูปที่ '+(index+1)))+'</span></a>').join('')+'</div></div>';
}

function auditEventsMarkup(events) {
  const entries=Array.isArray(events)?events:[];
  return '<section class="attendance-section"><h4>ประวัติ Audit ('+entries.length+')</h4>'+
    (entries.length?'<div class="admin-record-list">'+entries.map(event=>'<div class="admin-link"><span>'+escapeHtml(event.action)+' · '+escapeHtml(event.actor_employee_id||'ไม่ระบุ actor')+' · '+escapeHtml(thaiDateTime(event.created_at))+'</span><span>'+escapeHtml(event.reason||'')+'</span></div>').join('')+'</div>':'<p class="small-muted">ไม่พบ Audit event ที่สัมพันธ์กับรายการนี้</p>')+'</section>';
}

function workSessionListLabel(row) {
  const payload=row.payload||{};
  if(row.legacy_category) {
    const date=payload.date?thaiDateTime(payload.date+'T00:00:00+07:00'):'—';
    const machine=payload.machine||payload.sheetName||'—';
    const quantities=row.legacy_category==='screenEntries'
      ? [['แพ็ค',payload.enteredPack],['เสียสกรีน (ขวด)',payload.missingBottles],['เสียผลิต (ขวด)',payload.productionDamagedBottles]]
      : [['ผลิต (ใบ)',payload.quantity],['ของเสีย (ใบ)',payload.defective]];
    return [date,row.group_name|| (row.legacy_category==='screenEntries'?'สกรีน':'ผลิต'),machine,
      ...quantities.filter(([,value])=>value!=null).map(([label,value])=>label+' '+value),'รายการเดิม'].join(' · ');
  }
  return [thaiDateTime(row.started_at||payload.startedAt||row.created_at),row.group_name||'—',payload.machine||'—',payload.endedAt?'จบงาน':'กำลังทำงาน'].join(' · ');
}

function workSessionDetailMarkup(detail) {
  const payload=detail.payload||{};
  if(detail.legacy_category) {
    const schema=RECORD_SCHEMAS[detail.legacy_category];
    const fields=[['รหัสรายการ',detail.id],['ผู้บันทึก',detail.employee_name||payload.operatorName||payload.operator||payload.employee],
      ['รหัสเจ้าของ',detail.owner_id],['กลุ่มงาน',detail.group_name|| (detail.legacy_category==='screenEntries'?'สกรีน':'ผลิต')],
      ...schema.fields.map(spec=>[spec.label,payload[spec.key]]),['สร้างเมื่อ',thaiDateTime(detail.created_at)],['แก้ไขล่าสุด',thaiDateTime(detail.updated_at)]];
    return '<dl class="work-manager-fields">'+fields.map(([label,value])=>'<div><dt>'+escapeHtml(label)+'</dt><dd><pre class="admin-data-value">'+escapeHtml(printable(value))+'</pre></dd></div>').join('')+'</dl>'+auditEventsMarkup(detail.work_session_audit);
  }
  const fields=[['รหัส session',detail.id],['พนักงาน',payload.employee||detail.employee_name],['รหัสเจ้าของ',detail.owner_id],['กลุ่มงาน',detail.group_name],
    ['เครื่องจักร',payload.machine],['รายการ',payload.itemName],['เริ่มเมื่อ',thaiDateTime(payload.startedAt||detail.created_at)],
    ['จบเมื่อ',payload.endedAt?thaiDateTime(payload.endedAt):'กำลังทำงาน'],['จำนวนเมื่อจบ',payload.quantity],['หมายเหตุ session',payload.note],
    ['สร้างเมื่อ',thaiDateTime(detail.created_at)],['แก้ไขล่าสุด',thaiDateTime(detail.updated_at)]];
  const screen=detail.screen_work,production=detail.production_work;
  const screenMarkup=screen?'<section class="card card-pad"><h3>รายละเอียดงานสกรีน</h3><dl class="work-manager-fields">'+[
    ['วันที่งาน',screen.work_date],['ของเสียจากสกรีน (ขวด)',screen.screen_defect_bottles],['ของเสียจากผลิต (ขวด)',screen.production_defect_bottles],
    ['หมายเหตุ',screen.note],['รุ่นข้อมูล',screen.version]
  ].map(([label,value])=>'<div><dt>'+escapeHtml(label)+'</dt><dd><pre class="admin-data-value">'+escapeHtml(printable(value))+'</pre></dd></div>').join('')+'</dl><h4>รายการและจำนวนแพ็ค</h4><div class="admin-record-list">'+
    ((screen.items||[]).map(item=>'<div class="admin-link"><span>'+escapeHtml(item.item_name_snapshot||item.item_name_id)+' · '+escapeHtml(item.work_period)+'</span><strong>'+escapeHtml(item.pack_count)+'</strong></div>').join('')||'<p class="empty-state">ไม่มีรายการสกรีน</p>')+'</div></section>':'';
  const productionMarkup=production?'<section class="card card-pad"><h3>รายละเอียดงานผลิต</h3><dl class="work-manager-fields">'+[
    ['วันที่งาน',production.work_date],['จำนวนผลิต',production.quantity],['ของเสีย',production.defective],['จำนวนดี',production.good_quantity],
    ['หน่วย',production.quantity_unit],['หมายเหตุ',production.note],['รุ่นข้อมูล',production.version],['แก้ไขล่าสุด',thaiDateTime(production.updated_at)]
  ].map(([label,value])=>'<div><dt>'+escapeHtml(label)+'</dt><dd><pre class="admin-data-value">'+escapeHtml(printable(value))+'</pre></dd></div>').join('')+'</dl></section>':'';
  return '<dl class="work-manager-fields">'+fields.map(([label,value])=>'<div><dt>'+escapeHtml(label)+'</dt><dd><pre class="admin-data-value">'+escapeHtml(printable(value))+'</pre></dd></div>').join('')+'</dl>'+auditEventsMarkup(detail.work_session_audit)+screenMarkup+productionMarkup+
    (screen?auditEventsMarkup(screen.audit_events):'')+(production?auditEventsMarkup(production.audit_events):'');
}

function screenWorkDateLabel(value) {
  if(!value)return '—';
  if(/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    const [year,month,day]=String(value).split('-').map(Number);
    return new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',day:'numeric',month:'short',year:'numeric'})
      .format(new Date(Date.UTC(year,month-1,day,12)));
  }
  return thaiDateTime(value);
}

function screenRecordDetailMarkup(detail) {
  const payload=detail.payload||{};
  const legacy=Boolean(detail.legacy_category);
  const screen=detail.screen_work||null;
  const items=Array.isArray(screen?.items)?screen.items:[];
  const countedItems=items.filter(item=>item.pack_count!==null&&item.pack_count!==undefined&&item.pack_count!==''&&Number.isFinite(Number(item.pack_count)));
  const packTotal=countedItems.reduce((sum,item)=>sum+Number(item.pack_count),0);
  const packValue=legacy?payload.enteredPack:(countedItems.length?packTotal:null);
  const screenDefects=legacy?payload.missingBottles:screen?.screen_defect_bottles;
  const productionDefects=legacy?payload.productionDamagedBottles:screen?.production_defect_bottles;
  const employee=detail.employee_name||payload.employee||payload.operatorName||payload.operator;
  const machine=payload.machine||payload.sheetName;
  const startedAt=payload.startedAt||detail.started_at||detail.created_at;
  const endedAt=payload.endedAt||detail.ended_at;
  const note=legacy?payload.note:screen?.note;
  const sessionNote=!legacy&&payload.note&&payload.note!==note?payload.note:'';
  const hasValue=value=>value!==null&&value!==undefined&&value!=='';
  const stat=(label,value,unit)=>'<div class="screen-detail-stat"><span>'+escapeHtml(label)+'</span><strong>'+escapeHtml(hasValue(value)?printable(value):'—')+'</strong><small>'+escapeHtml(unit)+'</small></div>';
  const field=(label,value)=>'<div class="screen-detail-meta-item"><dt>'+escapeHtml(label)+'</dt><dd>'+escapeHtml(hasValue(value)?printable(value):'—')+'</dd></div>';
  const meta=[
    ['วันทำงาน',screenWorkDateLabel(screen?.work_date||payload.date)],
    ['พนักงาน',employee],
    ['กลุ่มงาน',detail.group_name||'สกรีน'],
    ['เครื่องจักร',machine]
  ];
  if(!legacy) {
    meta.push(['ออเดอร์/รายการ',payload.itemName]);
    meta.push(['เริ่มงาน',hasValue(startedAt)?thaiDateTime(startedAt):'—']);
    meta.push(['จบงาน',hasValue(endedAt)?thaiDateTime(endedAt):'กำลังทำงาน']);
    if(hasValue(payload.quantity))meta.push(['จำนวนเมื่อจบงาน',printable(payload.quantity)+' แพ็ค']);
  }
  const itemMarkup=items.length
    ? '<div class="screen-detail-items" aria-label="รายการและจำนวนแพ็ค">'+items.map(item=>'<div class="screen-detail-item"><span><strong>'+escapeHtml(item.item_name_snapshot||'รายการสกรีน')+'</strong><small>'+escapeHtml(item.work_period||'')+'</small></span><strong>'+escapeHtml(printable(item.pack_count))+' แพ็ค</strong></div>').join('')+'</div>'
    : legacy?'':'<p class="empty-state">ไม่มีรายการแพ็คที่เชื่อมกับงานนี้</p>';
  const notes=(hasValue(note)?'<section class="screen-detail-note"><h3>หมายเหตุงานสกรีน</h3><p>'+escapeHtml(note)+'</p></section>':'')+
    (hasValue(sessionNote)?'<section class="screen-detail-note screen-detail-note-secondary"><h3>หมายเหตุช่วงทำงาน</h3><p>'+escapeHtml(sessionNote)+'</p></section>':'');
  return '<div class="screen-detail-content">'+
    '<p class="screen-detail-source">'+(legacy?'รายการจากแบบฟอร์มเดิม':'รายการงานสกรีนที่เชื่อมกับช่วงเริ่มงาน–จบงาน')+'</p>'+
    '<dl class="screen-detail-meta">'+meta.map(([label,value])=>field(label,value)).join('')+'</dl>'+
    '<section class="screen-detail-section"><h3>สรุปจำนวน</h3><div class="screen-detail-stats">'+
    stat(legacy?'จำนวนแพ็คที่บันทึก':'รวมจำนวนแพ็ค',packValue,'แพ็ค')+
    stat('เสียจากสกรีน',screenDefects,'ขวด')+
    stat('เสียจากผลิต',productionDefects,'ขวด')+
    '</div></section>'+
    (!legacy?'<section class="screen-detail-section"><h3>รายการและจำนวนแพ็ค</h3>'+itemMarkup+'</section>':'')+
    notes+'</div>';
}

function adminRecordDetailDialogMarkup(title,body) {
  return '<dialog class="admin-record-detail-dialog" data-admin-record-detail-dialog aria-labelledby="admin-record-detail-title">'+
    '<div class="admin-record-detail-dialog__body"><header class="admin-record-detail-dialog__header"><h2 id="admin-record-detail-title">'+escapeHtml(title)+'</h2><button class="button admin-record-detail-dialog__close admin-detail-close-button" type="button" data-admin-record-detail-close aria-label="ปิดรายละเอียด">×</button></header>'+body+
    '<footer class="admin-record-detail-dialog__footer"><button class="button button-primary" type="button" data-admin-record-detail-close>ปิดรายละเอียด</button></footer></div></dialog>';
}

function editorField(spec, record) {
  let value = record[spec.key] ?? "";
  if (spec.type === "datetime-local" && value) {
    value = new Intl.DateTimeFormat("sv-SE", { timeZone:"Asia/Bangkok", year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit" }).format(new Date(value)).replace(" ", "T");
  }
  const id = "edit-" + spec.key;
  const attributes = ' id="' + id + '" name="' + spec.key + '"' + (spec.required ? ' required' : '') + (spec.readOnly ? ' readonly' : '');
  let input;
  if (spec.options) input = '<select' + attributes + '>' + (!spec.options.includes(String(value)) ? '<option value="" selected disabled>เลือกค่าใหม่</option>' : '') + spec.options.map((option, index) =>
    '<option value="' + escapeHtml(option) + '"' + (String(value) === option ? ' selected' : '') + '>' + escapeHtml(spec.labels?.[index] || option) + '</option>').join('') + '</select>';
  else if (spec.type === "image-data") input = '<input type="hidden"' + attributes + ' value="' + escapeHtml(value) + '">' +
    '<input id="edit-photo-file" name="photoFile" type="file" accept="image/*"><span class="help-text">เลือกภาพใหม่ได้ ไม่เกิน 512 KB</span>' +
    (value ? '<a href="' + escapeHtml(value) + '" target="_blank" rel="noreferrer">ดูรูปหลักฐานปัจจุบัน</a>' : '<span class="small-muted">ยังไม่มีรูปแนบ</span>');
  else if (spec.type === "textarea") input = '<textarea' + attributes + ' maxlength="' + (spec.maxLength ?? 500) + '">' + escapeHtml(value) + '</textarea>';
  else input = '<input' + attributes + ' type="' + spec.type + '" value="' + escapeHtml(value) + '"' +
    (spec.type === "number" ? ' min="' + (spec.min ?? 0) + '" step="' + (spec.step ?? 1) + '"' : ' maxlength="500"') + '>';
  return '<div class="field' + (spec.type === 'textarea' ? ' field-full' : '') + '"><label for="' + id + '">' + escapeHtml(spec.label) + '</label>' + input + '</div>';
}

function productionMachineField(record, selected, machines, error) {
  const currentId=String(record.machineId||''), currentName=String(record.machine||'');
  const activeCurrent=machines.some(machine=>machine.id===currentId);
  const prompt=selected?(activeCurrent?'คงเครื่องเดิม หรือเลือกเครื่อง active ใหม่':`เก็บค่าเดิม: ${currentName||'ไม่มี snapshot เครื่อง'}`):'เลือกเครื่องผลิต';
  return '<div class="field"><label for="edit-machine">เครื่องจักร</label>'+
    (selected?'<p class="help-text">Snapshot เดิม: '+escapeHtml(currentName||'—')+(currentId?' · id '+escapeHtml(currentId):' · ไม่มี machine id')+'</p>':'')+
    '<select id="edit-machine" name="machine"'+(!selected?' required':'')+(!machines.length?' disabled':'')+'><option value="">'+escapeHtml(error?'โหลดเครื่องจักรไม่สำเร็จ':!machines.length?'ไม่มีเครื่องผลิตที่ active':prompt)+'</option>'+
    machines.map(machine=>'<option value="'+escapeHtml(machine.id)+'"'+(selected&&machine.id===currentId?' selected':'')+'>'+escapeHtml(machine.machine_code)+' · '+escapeHtml(machine.machine_name)+'</option>').join('')+'</select>'+
    (error?'<p class="help-text" role="alert">'+escapeHtml(error)+'</p>':selected&&!activeCurrent&&currentId?'<p class="help-text">เครื่องเดิม inactive แล้ว เก็บ snapshot เดิมได้; เลือกเครื่อง active เฉพาะเมื่อต้องการเปลี่ยน</p>':!machines.length?'<p class="help-text">ไม่มีเครื่องผลิตที่เปิดใช้งาน</p>':'')+
    '<button class="button button-small" type="button" data-refresh-production-machines>โหลดเครื่องจักรใหม่</button></div>';
}

export async function render(root, context) {
  const currentPath=normalizeRoute(location.hash);
  const initialCategory=currentPath==='/executive/audit-logs'?'audit':Object.entries(moduleRoutes).find(([,path])=>path===currentPath)?.[0]||null;
  if(currentPath==='/admin/records') {
    location.replace('#/admin/manage');
    return;
  }
  if(!initialCategory) {
    root.innerHTML='<section class="card card-pad"><h1>ไม่พบหมวดข้อมูล</h1></section>';
    return;
  }
  root.innerHTML = '<div class="page-loading"><span class="loading-spinner"></span><span>กำลังโหลด Admin…</span></div>';
  let category = initialCategory;
  let rows = [];
  let employeeDirectory = [];
  let selectedId = null;
  let recordDetailDialogRequested = false;
  let productionMachines = [], productionMachineError = '';
  let creatingRecord = false;
  let editingScreen = false;
  let generation = 0;
  let initialCategoryLoadStarted = false;
  let query = "";
  let leaveFilters = {query:"",from:"",to:"",status:"all",dateBasis:"leave",employeeId:"",group:""};
  let leaveOffset = 0;
  let leaveTotal = 0;
  let leaveDetail = null;
  let leaveImages = [];
  let leaveDetailLoading = false;
  let leaveDetailError = "";
  let leaveListLoading = false;
  let leaveListError = "";
  let leaveProxyOpen = false;
  let leaveRequestGeneration = 0;
  let leaveDetailGeneration = 0;
  let auditFilters={from:"",to:"",actorId:"",tableName:"",action:"",recordId:""};
  let auditHasMore=false,auditListLoading=false,auditListError="",auditMoreError="",auditDirectoryError="";
  let auditDetail=null,auditDetailLoading=false,auditDetailError="",auditRequestGeneration=0,auditDetailGeneration=0;
  let auditController,auditDetailController;
  let deliveryFilters = { query:"", from:"", to:"", status:"", employeeId:"", group:"" };
  let deliveryOffset = 0;
  let deliveryTotal = 0;
  let deliveryDetail = null;
  let deliveryDetailLoading = false;
  let deliveryDetailError = "";
  let deliveryListLoading = false;
  let deliveryListError = "";
  let deliveryRequestGeneration = 0;
  let deliveryDetailGeneration = 0;
  let otFilters = {...defaultOtFilters(),employeeId:"",group:"",status:"all",query:""};
  let otOffset = 0;
  let otTotal = 0;
  let otTotalMinutes = 0;
  let otDetail = null;
  let otDetailLoading = false;
  let otDetailError = "";
  let otListLoading = false;
  let otListError = "";
  let otRequestGeneration = 0;
  let otDetailGeneration = 0;
  let workSessionFilters = { ...defaultOtFilters(), employeeId:"", group:"", status:"all", query:"", dateBasis:"start" };
  let workSessionOffset = 0;
  let workSessionTotal = 0;
  let workSessionDetail = null;
  let workSessionDetailLoading = false;
  let workSessionDetailError = "";
  let workSessionListLoading = false;
  let workSessionListError = "";
  let workSessionRequestGeneration = 0;
  let workSessionDetailGeneration = 0;
  let calendarController;
  context.signal?.addEventListener("abort",()=>{calendarController?.abort();auditController?.abort();auditDetailController?.abort();},{once:true});
  const draw = () => {
    if(context.signal?.aborted)return;
    calendarController?.abort();
    const categoryMeta=modules.find(([key])=>key===category)||modules[0];
    const isAudit = category === "audit";
    const editOnly = category === "screenEntries";
    const isWorkHistoryCategory = ["workSessions","screenEntries","production"].includes(category);
    const isOperational = operationalCategories.has(category);
    const schema = isAudit ? {label:"ประวัติการแก้ไข",fields:[]} : RECORD_SCHEMAS[category];
    const canCreate = !isAudit && !schema.singleton && category !== 'calendar' && !isOperational;
    const creationId = category === 'attendance' ? 'manual-attendance-details' : 'admin-create-details';
    const filteredRows = category === "deliveries" || category === "otRequests" || category === "leaveRequests" || isWorkHistoryCategory ? rows : rows.filter(row => Object.entries(row).filter(([key])=>key!=='photo').map(([,value])=>printable(value)).join(" ").toLocaleLowerCase("th").includes(query.toLocaleLowerCase("th")));
    const selected = rows.find(row => row.id === selectedId);
    const record = selected || (isAudit ? {} : blankRecord(category));
    const listMarkup = category === "audit"
      ? auditListLoading&&!rows.length ? '<p class="small-muted" role="status" aria-live="polite">กำลังโหลดประวัติการแก้ไข…</p>'
        : auditListError ? '<div class="notice notice-danger" role="alert">'+escapeHtml(auditListError)+'</div><button class="button" type="button" data-audit-retry>ลองโหลดประวัติอีกครั้ง</button>'
        : filteredRows.length ? filteredRows.map(row=>adminRecordItemMarkup(rows.indexOf(row),row.actorName||row.actor_employee_id||'ผู้ดำเนินการไม่มีรหัสอ้างอิง',
          [auditTableLabel(row.table_name),actionText(row.action),row.record_id?'รหัสรายการ '+row.record_id:'ไม่มีรหัสรายการ',thaiDateTime(row.created_at)].join(' · '),row.id===selectedId)).join('')
        : '<p class="empty-state">ไม่พบประวัติการแก้ไขตามเงื่อนไข</p>'
      : category === "leaveRequests"
      ? leaveListLoading ? '<p class="small-muted">กำลังโหลดคำขอลาจาก Supabase…</p>'
        : leaveListError ? '<div class="notice notice-danger" role="alert">'+escapeHtml(leaveListError)+'</div><button class="button" type="button" data-leave-retry>ลองโหลดอีกครั้ง</button>'
        : filteredRows.length ? filteredRows.map(row=>adminRecordItemMarkup(rows.indexOf(row),row.employee_name||'ไม่ระบุผู้ขอลา',
          [row.group_name||'ไม่ระบุกลุ่ม',row.type||'ไม่ระบุประเภท',`${row.start_date||'—'}${row.end_date&&row.end_date!==row.start_date?' – '+row.end_date:''}`,row.total_days==null?'—':`${row.total_days} วัน`,row.status||'—',thaiDateTime(row.created_at)].join(' · '),row.id===selectedId)).join('')
        : '<p class="empty-state">ไม่มีคำขอลาตามเงื่อนไข</p>'
      : isWorkHistoryCategory
      ? workSessionListLoading ? '<p class="small-muted">กำลังโหลดรายการงานจาก Supabase…</p>'
        : workSessionListError ? '<div class="notice notice-danger" role="alert">'+escapeHtml(workSessionListError)+'</div><button class="button" type="button" data-work-session-retry>ลองโหลดอีกครั้ง</button>'
        : filteredRows.length ? filteredRows.map(row=>adminRecordItemMarkup(rows.indexOf(row),row.employee_name||row.payload?.employee||row.payload?.operator||row.payload?.operatorName||'รายการงาน',workSessionListLabel(row),row.id===selectedId)).join('')
        : '<p class="empty-state">ไม่มีรายการตามเงื่อนไข</p>'
      : category === "otRequests"
      ? otListLoading ? '<p class="small-muted">กำลังโหลดรายงาน OT จาก Supabase…</p>'
        : otListError ? '<div class="notice notice-danger" role="alert">'+escapeHtml(otListError)+'</div><button class="button" type="button" data-ot-retry>ลองโหลดอีกครั้ง</button>'
        : filteredRows.length ? filteredRows.map(row=>adminRecordItemMarkup(rows.indexOf(row),row.employee_name||'ไม่ระบุพนักงาน',otListLabel(row),row.id===selectedId)).join('')
        : '<p class="empty-state">ไม่มีรายงาน OT ในช่วงวันที่นี้</p>'
      : category === "deliveries"
      ? deliveryListLoading ? '<p class="small-muted">กำลังโหลดรายการขนส่ง…</p>'
        : deliveryListError ? '<div class="notice notice-danger" role="alert">'+escapeHtml(deliveryListError)+'</div><button class="button" type="button" data-delivery-retry>ลองโหลดอีกครั้ง</button>'
        : filteredRows.length ? filteredRows.map(row=>adminRecordItemMarkup(rows.indexOf(row),row.product||'ไม่ระบุสินค้า',
          [`ผู้ส่ง ${row.sender||row.employee||'—'}`,`บิล ${row.billNumber||row.bill_number||'—'}`,`จำนวน ${row.quantity??'—'}`,row.status||'—',thaiDateTime(row.event_at||row.dateTime||row.createdAt)].join(' · '),row.id===selectedId)).join('')
        : '<p class="empty-state">ไม่มีรายการขนส่งตามเงื่อนไข</p>'
      : filteredRows.length ? filteredRows.map(row=>{
        if(isAudit)return adminRecordItemMarkup(rows.indexOf(row),row.actor||'ไม่ระบุผู้แก้ไข',[actionText(row.action),thaiDateTime(row.createdAt)].join(' · '),row.id===selectedId);
        const fields=schema.fields.filter(spec=>spec.type!=='image-data').slice(0,4);
        const primary=fields.length?fieldText(fields[0],row[fields[0].key]):row.id;
        const details=fields.slice(1).map(spec=>spec.label+': '+printable(row[spec.key])).join(' · ');
        return adminRecordItemMarkup(rows.indexOf(row),primary,details||`รหัสรายการ ${row.id||'—'}`,row.id===selectedId);
      }).join('')
        : '<p class="empty-state">ยังไม่มีรายการ</p>';
    const employeeOptions = selectedId => [...new Map(employeeDirectory.map(person=>[person.id,person.employee_name||person.name]).filter(([id,name])=>id&&name)).entries()]
      .map(([id,name])=>'<option value="'+escapeHtml(id)+'"'+(selectedId===id?' selected':'')+'>'+escapeHtml(name)+'</option>').join('');
    const workSessionEmployeeOptions=employeeOptions(workSessionFilters.employeeId),otEmployeeOptions=employeeOptions(otFilters.employeeId),
      deliveryEmployeeOptions=employeeOptions(deliveryFilters.employeeId),leaveEmployeeOptions=employeeOptions(leaveFilters.employeeId),auditEmployeeOptions=employeeOptions(auditFilters.actorId);
    const searchFieldMarkup = isAudit
      ? '<div class="field"><label for="admin-audit-from">เวลาแก้ไข ตั้งแต่ (เวลาไทย)</label><input id="admin-audit-from" type="date" value="'+escapeHtml(auditFilters.from)+'"></div><div class="field"><label for="admin-audit-to">ถึง</label><input id="admin-audit-to" type="date" value="'+escapeHtml(auditFilters.to)+'"></div><div class="field"><label for="admin-audit-actor">ผู้ดำเนินการ</label><select id="admin-audit-actor"><option value="">ทุกคน</option>'+auditEmployeeOptions+'</select></div>'+(auditDirectoryError?'<div class="field"><label for="admin-audit-actor-id">รหัสผู้ดำเนินการ (ทางเลือก)</label><input id="admin-audit-actor-id" value="'+escapeHtml(auditFilters.actorId)+'" maxlength="36"></div>':'')
      : isWorkHistoryCategory
      ? '<div class="field"><label for="admin-work-from">วันที่เริ่มงาน ตั้งแต่ (เวลาไทย)</label><input id="admin-work-from" type="date" value="'+escapeHtml(workSessionFilters.from)+'" required></div><div class="field"><label for="admin-work-to">ถึง (เวลาไทย)</label><input id="admin-work-to" type="date" value="'+escapeHtml(workSessionFilters.to)+'" required></div><div class="field"><label for="admin-work-employee">พนักงาน</label><select id="admin-work-employee"><option value="">ทุกคน</option>'+workSessionEmployeeOptions+'</select></div><div class="field"><label for="admin-work-group">กลุ่มงาน</label><select id="admin-work-group"><option value=""'+(!workSessionFilters.group?' selected':'')+'>ทุกกลุ่ม</option><option value="สกรีน"'+(workSessionFilters.group==='สกรีน'?' selected':'')+'>สกรีน</option><option value="ผลิต"'+(workSessionFilters.group==='ผลิต'?' selected':'')+'>ผลิต</option></select></div><div class="field"><label for="admin-work-status">สถานะ session</label><select id="admin-work-status"><option value="all"'+(workSessionFilters.status==='all'?' selected':'')+'>ทั้งหมด</option><option value="open"'+(workSessionFilters.status==='open'?' selected':'')+'>กำลังทำงาน</option><option value="closed"'+(workSessionFilters.status==='closed'?' selected':'')+'>จบงานแล้ว</option></select></div><div class="field"><label for="admin-work-search">ค้นหาชื่อ เครื่องจักร หรือรหัส</label><input id="admin-work-search" value="'+escapeHtml(workSessionFilters.query)+'" maxlength="100"></div>'
      : category === "otRequests"
      ? '<div class="field"><label for="admin-ot-from">วันที่รายงาน OT ตั้งแต่</label><input id="admin-ot-from" type="date" value="'+escapeHtml(otFilters.from)+'" required></div><div class="field"><label for="admin-ot-to">ถึง</label><input id="admin-ot-to" type="date" value="'+escapeHtml(otFilters.to)+'" required></div>'
      : '<div class="field"><label for="admin-search">'+(category === "deliveries" ? 'ค้นหาเลขบิล สินค้า หรือผู้ส่ง' : category === "leaveRequests" ? 'ค้นหาชื่อพนักงานหรือรหัสคำขอ' : 'ค้นหาชื่อ รหัส วันที่ หรือข้อมูลในหมวดนี้')+'</label><input id="admin-search" value="'+escapeHtml(category==='deliveries'?deliveryFilters.query:category==='leaveRequests'?leaveFilters.query:query)+'" maxlength="100"></div>';
    const categoryFilterMarkup = isAudit
      ? '<div class="field"><label for="admin-audit-table">หมวดข้อมูล</label><select id="admin-audit-table"><option value="">ทุกหมวด</option>'+AUDIT_TABLE_OPTIONS.map(item=>'<option value="'+escapeHtml(item.value)+'"'+(auditFilters.tableName===item.value?' selected':'')+'>'+escapeHtml(item.label)+'</option>').join('')+'</select></div><div class="field"><label for="admin-audit-action">ประเภทการทำรายการ</label><select id="admin-audit-action"><option value="">ทุกประเภท</option><option value="INSERT"'+(auditFilters.action==='INSERT'?' selected':'')+'>เพิ่ม</option><option value="UPDATE"'+(auditFilters.action==='UPDATE'?' selected':'')+'>แก้ไข</option><option value="DELETE"'+(auditFilters.action==='DELETE'?' selected':'')+'>ลบ/ถอดข้อมูล</option><option value="ACTIVATE"'+(auditFilters.action==='ACTIVATE'?' selected':'')+'>เปิดใช้งาน</option><option value="DEACTIVATE"'+(auditFilters.action==='DEACTIVATE'?' selected':'')+'>ปิดใช้งาน</option><option value="GRANT_GROUP"'+(auditFilters.action==='GRANT_GROUP'?' selected':'')+'>เพิ่มสิทธิ์กลุ่ม</option><option value="REVOKE_GROUP"'+(auditFilters.action==='REVOKE_GROUP'?' selected':'')+'>ถอดสิทธิ์กลุ่ม</option><option value="APPROVE_REGISTRATION"'+(auditFilters.action==='APPROVE_REGISTRATION'?' selected':'')+'>อนุมัติสมัครสมาชิก</option><option value="REJECT_REGISTRATION"'+(auditFilters.action==='REJECT_REGISTRATION'?' selected':'')+'>ปฏิเสธสมัครสมาชิก</option><option value="APPROVE"'+(auditFilters.action==='APPROVE'?' selected':'')+'>อนุมัติ</option><option value="REJECT"'+(auditFilters.action==='REJECT'?' selected':'')+'>ไม่อนุมัติ</option><option value="REVIEW"'+(auditFilters.action==='REVIEW'?' selected':'')+'>ตรวจสอบ</option></select></div><div class="field"><label for="admin-audit-record">รหัสรายการหรือเหตุการณ์</label><input id="admin-audit-record" value="'+escapeHtml(auditFilters.recordId)+'" maxlength="36" autocomplete="off"></div>'
      : category === "leaveRequests"
      ? '<div class="field"><label for="admin-leave-from">'+(leaveFilters.dateBasis==='submitted'?'วันที่ส่งคำขอ':'วันลาที่อยู่ในช่วง')+' ตั้งแต่</label><input id="admin-leave-from" type="date" value="'+escapeHtml(leaveFilters.from)+'"></div><div class="field"><label for="admin-leave-to">ถึง</label><input id="admin-leave-to" type="date" value="'+escapeHtml(leaveFilters.to)+'"></div><div class="field"><label for="admin-leave-date-basis">กรองวันที่ตาม</label><select id="admin-leave-date-basis"><option value="leave"'+(leaveFilters.dateBasis==='leave'?' selected':'')+'>วันลา</option><option value="submitted"'+(leaveFilters.dateBasis==='submitted'?' selected':'')+'>วันที่ส่ง</option></select></div><div class="field"><label for="admin-leave-employee">พนักงาน</label><select id="admin-leave-employee"><option value="">ทุกคน</option>'+leaveEmployeeOptions+'</select></div><div class="field"><label for="admin-leave-group">กลุ่มงาน</label><select id="admin-leave-group"><option value=""'+(!leaveFilters.group?' selected':'')+'>ทุกกลุ่ม</option><option value="ออฟฟิศ"'+(leaveFilters.group==='ออฟฟิศ'?' selected':'')+'>ออฟฟิศ</option><option value="สกรีน"'+(leaveFilters.group==='สกรีน'?' selected':'')+'>สกรีน</option><option value="ผลิต"'+(leaveFilters.group==='ผลิต'?' selected':'')+'>ผลิต</option><option value="ขนส่ง"'+(leaveFilters.group==='ขนส่ง'?' selected':'')+'>ขนส่ง</option></select></div><div class="field"><label for="admin-leave-status">สถานะคำขอ</label><select id="admin-leave-status"><option value="all"'+(leaveFilters.status==='all'?' selected':'')+'>ทุกสถานะ</option><option value="pending"'+(leaveFilters.status==='pending'?' selected':'')+'>รอพิจารณา</option><option value="approved"'+(leaveFilters.status==='approved'?' selected':'')+'>อนุมัติ</option><option value="rejected"'+(leaveFilters.status==='rejected'?' selected':'')+'>ปฏิเสธ</option><option value="cancelled"'+(leaveFilters.status==='cancelled'?' selected':'')+'>ยกเลิก</option></select></div>'
      : category === "deliveries"
      ? '<div class="field"><label for="admin-delivery-from">วันที่ขนส่ง ตั้งแต่ (เวลาไทย)</label><input id="admin-delivery-from" type="date" value="'+escapeHtml(deliveryFilters.from)+'"></div><div class="field"><label for="admin-delivery-to">ถึง</label><input id="admin-delivery-to" type="date" value="'+escapeHtml(deliveryFilters.to)+'"></div><div class="field"><label for="admin-delivery-employee">ผู้บันทึก</label><select id="admin-delivery-employee"><option value="">ทุกคน</option>'+deliveryEmployeeOptions+'</select></div><div class="field"><label for="admin-delivery-group">กลุ่มงาน</label><select id="admin-delivery-group"><option value=""'+(!deliveryFilters.group?' selected':'')+'>ทุกกลุ่ม</option><option value="ขนส่ง"'+(deliveryFilters.group==='ขนส่ง'?' selected':'')+'>ขนส่ง</option></select></div><div class="field"><label for="admin-delivery-status">สถานะ</label><select id="admin-delivery-status"><option value=""'+(!deliveryFilters.status?' selected':'')+'>ทุกสถานะ</option><option value="ส่งสำเร็จ"'+(deliveryFilters.status==='ส่งสำเร็จ'?' selected':'')+'>ส่งสำเร็จ</option><option value="ยกเลิก"'+(deliveryFilters.status==='ยกเลิก'?' selected':'')+'>ยกเลิก</option></select></div>'
      : category === "otRequests"
      ? '<div class="field"><label for="admin-search">ค้นหาชื่อ รายละเอียด หรือรหัส OT</label><input id="admin-search" value="'+escapeHtml(otFilters.query)+'" maxlength="100"></div><div class="field"><label for="admin-ot-employee">พนักงาน</label><select id="admin-ot-employee"><option value="">ทุกคน</option>'+otEmployeeOptions+'</select></div><div class="field"><label for="admin-ot-group">กลุ่มงาน</label><select id="admin-ot-group"><option value=""'+(!otFilters.group?' selected':'')+'>ทุกกลุ่ม</option><option value="สกรีน"'+(otFilters.group==='สกรีน'?' selected':'')+'>สกรีน</option><option value="ผลิต"'+(otFilters.group==='ผลิต'?' selected':'')+'>ผลิต</option><option value="ขนส่ง"'+(otFilters.group==='ขนส่ง'?' selected':'')+'>ขนส่ง</option></select></div><div class="field"><label for="admin-ot-status">สถานะรายงาน</label><select id="admin-ot-status"><option value="all"'+(otFilters.status==='all'?' selected':'')+'>ทุกสถานะ</option><option value="submitted"'+(otFilters.status==='submitted'?' selected':'')+'>ส่งแล้ว</option></select></div>' : '';
    const filterHelpMarkup = isAudit
      ? '<p class="help-text">รายการ Audit แสดงเฉพาะข้อมูลอ้างอิง ไม่มีเหตุผลหรือค่าเดิม/ใหม่ในรายการ. เปิดรายละเอียดเพื่อดูเฉพาะฟิลด์ที่อนุญาต; เหตุผลลา สุขภาพ และข้อมูลรูปแนบถูกซ่อน.'+(auditDirectoryError?' รายชื่อผู้ดำเนินการโหลดไม่สำเร็จ จึงแสดงรหัสอ้างอิงแทนชื่อ.':'')+'</p>'
      : category === "deliveries"
      ? '<p class="help-text">วันที่กรองคือวันและเวลาขนส่ง (event_at) ตามเวลาไทย; ค้นหาและแบ่งหน้าผ่าน Supabase.</p>'
      : isWorkHistoryCategory ? '<p class="help-text">'+(workSessionFilters.dateBasis==='business'?'กรองตามวันงานในรายละเอียดสกรีน/ผลิต; ถ้าไม่มีรายละเอียดใช้วันเริ่มงาน':'กรองตามวันเริ่มงาน session')+' ตามเวลาไทย; ค้นหา พนักงาน กลุ่ม และสถานะผ่าน Admin RPC.</p>'
      : category === "leaveRequests" ? '<p class="help-text">กรองฝั่ง Supabase ได้ทั้งวันลาหรือวันที่ส่งคำขอ; แสดงจำนวนวันจากข้อมูลที่บันทึกไว้.</p>'
      : category === "otRequests" ? '<p class="help-text">กรองตามวันที่รายงาน OT; ไม่มี workflow อนุมัติ. ผลรวมเวลามาจากรายการที่ตรงตัวกรอง.</p>' : '';
    const resultCount = isAudit ? `${rows.length}${auditHasMore?'+':''}` : category === "deliveries" ? deliveryTotal : category === "otRequests" ? otTotal : category === "leaveRequests" ? leaveTotal : isWorkHistoryCategory ? workSessionTotal : filteredRows.length;
    const paginationMarkup = isAudit
      ? auditHasMore ? '<div class="form-actions"><button class="button" type="button" data-audit-more'+(auditListLoading?' disabled':'')+'>'+(auditListLoading?'กำลังโหลด…':auditMoreError?'ลองโหลดประวัติเพิ่มอีกครั้ง':'โหลดประวัติเพิ่ม')+'</button><span class="small-muted">โหลดแล้ว '+rows.length+' รายการ</span></div>'+(auditMoreError?'<div class="notice notice-danger" role="alert">'+escapeHtml(auditMoreError)+'</div>':'') : rows.length ? '<p class="small-muted">แสดงประวัติครบ '+rows.length+' รายการตามตัวกรอง</p>' : ''
      : category === "deliveries"
      ? '<div class="form-actions"><button class="button" type="button" data-delivery-prev'+(deliveryOffset<=0?' disabled':'')+'>รายการก่อนหน้า</button><span class="small-muted">แสดง '+(deliveryTotal?deliveryOffset+1:0)+'–'+Math.min(deliveryOffset+rows.length,deliveryTotal)+' จาก '+deliveryTotal+'</span><button class="button" type="button" data-delivery-next'+(deliveryOffset+rows.length>=deliveryTotal?' disabled':'')+'>รายการถัดไป</button></div>'
      : category === "otRequests" ? '<div class="form-actions"><button class="button" type="button" data-ot-prev'+(otOffset<=0?' disabled':'')+'>รายการก่อนหน้า</button><span class="small-muted">แสดง '+(otTotal?otOffset+1:0)+'–'+Math.min(otOffset+rows.length,otTotal)+' จาก '+otTotal+' · รวม '+Math.floor(otTotalMinutes/60)+' ชม. '+(otTotalMinutes%60)+' นาที</span><button class="button" type="button" data-ot-next'+(otOffset+rows.length>=otTotal?' disabled':'')+'>รายการถัดไป</button></div>'
        : category === "leaveRequests" ? '<div class="form-actions"><button class="button" type="button" data-leave-prev'+(leaveOffset<=0?' disabled':'')+'>รายการก่อนหน้า</button><span class="small-muted">แสดง '+(leaveTotal?leaveOffset+1:0)+'–'+Math.min(leaveOffset+rows.length,leaveTotal)+' จาก '+leaveTotal+'</span><button class="button" type="button" data-leave-next'+(leaveOffset+rows.length>=leaveTotal?' disabled':'')+'>รายการถัดไป</button></div>'
        : isWorkHistoryCategory ? '<div class="form-actions"><button class="button" type="button" data-work-session-prev'+(workSessionOffset<=0?' disabled':'')+'>รายการก่อนหน้า</button><span class="small-muted">แสดง '+(workSessionTotal?workSessionOffset+1:0)+'–'+Math.min(workSessionOffset+rows.length,workSessionTotal)+' จาก '+workSessionTotal+'</span><button class="button" type="button" data-work-session-next'+(workSessionOffset+rows.length>=workSessionTotal?' disabled':'')+'>รายการถัดไป</button></div>' : '';
    const detailDialogMarkup = (() => {
      if(!selected || !recordDetailDialogRequested)return '';
      let title='รายละเอียด '+categoryMeta[1], body='';
      if(category==='audit') {
        title='รายละเอียดประวัติการแก้ไข';
        const actor=rows.find(row=>row.id===selectedId)?.actorName||selected.actorName||selected.actor_employee_id||'ผู้ดำเนินการไม่มีรหัสอ้างอิง';
        body=auditDetailLoading
          ? '<p class="small-muted" role="status" aria-live="polite">กำลังโหลดรายละเอียดประวัติ…</p>'
          : auditDetailError
            ? '<div class="notice notice-danger" role="alert">'+escapeHtml(auditDetailError)+'</div><button class="button" type="button" data-audit-detail-retry>ลองโหลดรายละเอียดอีกครั้ง</button>'
            : auditDetail
              ? '<dl class="work-manager-fields"><div><dt>วันที่และเวลา</dt><dd>'+escapeHtml(thaiDateTime(auditDetail.created_at))+'</dd></div><div><dt>ผู้ดำเนินการ</dt><dd>'+escapeHtml(actor)+'</dd></div><div><dt>หมวดข้อมูล</dt><dd>'+escapeHtml(auditTableLabel(auditDetail.table_name))+' · '+escapeHtml(auditDetail.table_name||'—')+'</dd></div><div><dt>รายการที่ได้รับผล</dt><dd>'+escapeHtml(auditDetail.record_id||'ไม่มีรหัสรายการ')+'</dd></div><div><dt>ประเภทการทำรายการ</dt><dd>'+escapeHtml(actionText(auditDetail.action))+' · '+escapeHtml(auditDetail.action||'—')+'</dd></div><div><dt>รหัสเหตุการณ์</dt><dd>'+escapeHtml(auditDetail.id||'—')+'</dd></div></dl>'+
                (auditDetail.changes?.length?'<section class="attendance-section"><h3>ค่าที่เปลี่ยน (เฉพาะฟิลด์ที่อนุญาต)</h3><div class="work-manager-fields">'+auditDetail.changes.map(change=>'<div><dt>'+escapeHtml(change.label)+'</dt><dd><strong>ค่าเดิม</strong><pre class="admin-data-value">'+escapeHtml(printable(change.oldValue))+'</pre><strong>ค่าใหม่</strong><pre class="admin-data-value">'+escapeHtml(printable(change.newValue))+'</pre></dd></div>').join('')+'</div></section>':'<p class="help-text">ไม่มีค่าเดิม/ค่าใหม่ที่เปิดให้ดูสำหรับหมวดนี้ หรือเหตุการณ์นี้ไม่มีฟิลด์ที่อนุญาต.</p>')+
                (auditDetail.reasonProtected?'<p class="help-text">เหตุผลถูกซ่อนสำหรับหมวดข้อมูลนี้เพื่อคุ้มครองข้อมูลส่วนบุคคล.</p>':auditDetail.reason?'<section class="attendance-section"><h3>เหตุผล</h3><pre class="admin-data-value">'+escapeHtml(auditDetail.reason)+'</pre></section>':'<p class="help-text">ไม่มีเหตุผลที่บันทึกไว้ในเหตุการณ์นี้.</p>')+
                '<p class="help-text">รายละเอียดประวัตินี้เปิดจาก Audit โดยตรง จึงยังอ่านได้แม้รายการต้นทางถูกยกเลิกหรือไม่พร้อมใช้งาน.</p>'
              : '<p class="empty-state">ไม่พบรายละเอียดเหตุการณ์นี้ หรือบัญชีไม่มีสิทธิ์อ่าน.</p>';
      } else if(category==='leaveRequests') {
        body=leaveDetailLoading
          ? '<p class="small-muted" role="status" aria-live="polite">กำลังโหลดรายละเอียดและตรวจสอบเอกสารแนบ…</p>'
          : leaveDetailError
            ? '<div class="notice notice-danger" role="alert">'+escapeHtml(leaveDetailError)+'</div><button class="button" type="button" data-leave-detail-retry>ลองโหลดรายละเอียดอีกครั้ง</button>'
            : leaveDetail
              ? leaveDetailMarkup(leaveDetail,leaveImages)+(context.user?.role==='admin'&&leaveDetail.status==='pending'?'<section class="attendance-section"><h3>พิจารณาคำขอตาม workflow เดิม</h3><label for="admin-leave-review-reason">เหตุผลที่บันทึกใน Audit (จำเป็น)</label><textarea id="admin-leave-review-reason" minlength="1" maxlength="500" required></textarea><div class="form-actions"><button class="button button-primary" type="button" data-leave-review="approved">อนุมัติคำขอ</button><button class="button" type="button" data-leave-review="rejected">ปฏิเสธคำขอ</button></div></section>':'')
              : '<p class="small-muted">ไม่พบรายละเอียดรายการนี้</p>';
      } else if(category==='screenEntries') {
        title='รายละเอียดงานสกรีน';
        body=workSessionDetailLoading
          ? '<p class="small-muted" role="status" aria-live="polite">กำลังโหลดรายละเอียดงานสกรีน…</p>'
          : workSessionDetailError
            ? '<div class="notice notice-danger" role="alert">'+escapeHtml(workSessionDetailError)+'</div><button class="button" type="button" data-work-session-detail-retry>ลองโหลดรายละเอียดอีกครั้ง</button>'
            : workSessionDetail?screenRecordDetailMarkup(workSessionDetail):'<p class="small-muted">ไม่พบรายละเอียดรายการนี้</p>';
      } else if(isWorkHistoryCategory) {
        title=category==='production'?'รายละเอียดงานผลิต':'รายละเอียดเริ่มงาน–จบงาน';
        body=workSessionDetailLoading
          ? '<p class="small-muted" role="status" aria-live="polite">กำลังโหลดรายละเอียดงาน…</p>'
          : workSessionDetailError
            ? '<div class="notice notice-danger" role="alert">'+escapeHtml(workSessionDetailError)+'</div><button class="button" type="button" data-work-session-detail-retry>ลองโหลดรายละเอียดอีกครั้ง</button>'
            : workSessionDetail?workSessionDetailMarkup(workSessionDetail):'<p class="small-muted">ไม่พบรายละเอียดรายการนี้</p>';
      } else if(category==='otRequests') {
        title='รายละเอียดทำงานล่วงเวลา (OT)';
        body=otDetailLoading
          ? '<p class="small-muted" role="status" aria-live="polite">กำลังโหลดรายละเอียดและตรวจสอบรูปแนบ…</p>'
          : otDetailError
            ? '<div class="notice notice-danger" role="alert">'+escapeHtml(otDetailError)+'</div><button class="button" type="button" data-ot-detail-retry>ลองโหลดรายละเอียดอีกครั้ง</button>'
            : otDetail?otDetailMarkup(otDetail):'<p class="small-muted">ไม่พบรายละเอียดรายการนี้</p>';
      } else if(category==='deliveries') {
        title='รายละเอียดการขนส่ง';
        body=deliveryDetailLoading
          ? '<p class="small-muted" role="status" aria-live="polite">กำลังโหลดรายละเอียดและตรวจสอบรูปแนบ…</p>'
          : deliveryDetailError
            ? '<div class="notice notice-danger" role="alert">'+escapeHtml(deliveryDetailError)+'</div>'
            : deliveryDetail?deliveryDetailMarkup(deliveryDetail):'<p class="small-muted">ไม่พบรายละเอียดรายการนี้</p>';
      } else {
        body='<dl class="work-manager-fields">'+Object.entries(selected).map(([key,value])=>'<div><dt>'+escapeHtml(schema.fields.find(spec=>spec.key===key)?.label || key)+'</dt><dd>'+(key==='photo' && value ? '<a href="'+escapeHtml(value)+'" target="_blank" rel="noreferrer">เปิดรูปหลักฐาน</a>' : '<pre class="admin-data-value">'+escapeHtml(printable(value))+'</pre>')+'</dd></div>').join('')+'</dl>';
      }
      return adminRecordDetailDialogMarkup(title,body);
    })();
    root.innerHTML =
      '<div class="page-heading admin-record-page-heading"><div><h1>'+escapeHtml(categoryMeta[1])+'</h1><p>'+escapeHtml(categoryMeta[2])+'</p></div></div>' +
      (category === 'leaveRequests' ? '<section class="card card-pad attendance-section"><h2>คำขอลาและปฏิทินกลาง</h2><p class="help-text">ดูผู้ได้รับอนุมัติลาทุกกลุ่มในหน้าคำขอลาร่วมกับผู้บริหาร</p><a class="button" href="#/executive/leave">เปิดหน้าคำขอลา</a></section>' : '') +
      (category === 'leaveRequests' && context.user?.role === 'admin' ? adminLeaveProxyMarkup(leaveProxyOpen, employeeDirectory) : '') +
      '<section data-record-browser class="card card-pad" style="margin-top:.8rem"><form data-admin-search class="toolbar attendance-section">' + searchFieldMarkup + categoryFilterMarkup +
      '<button class="button" type="submit">ค้นหา</button></form>' + filterHelpMarkup +
      '<div class="section-title"><h2>รายการที่พบ (' + resultCount + ')</h2></div><div class="admin-record-list">' + listMarkup + '</div>' + paginationMarkup + '</section>' +
      (canCreate ? '<section class="card card-pad attendance-section" data-create-record'+(category === 'attendance' ? ' data-manual-attendance' : '')+'><h2>เพิ่มรายการ • '+escapeHtml(schema.label)+'</h2><button class="button button-primary" type="button" data-new-record aria-expanded="'+creatingRecord+'" aria-controls="'+creationId+'">'+(category === 'attendance' ? '＋ ลงเวลาแทนเครื่องสแกน' : '＋ เพิ่มรายการ')+'</button><div id="'+creationId+'" data-create-details'+(!creatingRecord ? ' hidden' : '')+'></div></section>' : '') +
      (editOnly && selected && !isOperational ? '<section class="card card-pad attendance-section"><h2>แก้ไขรายการ • งานสกรีน</h2><button class="button button-primary" type="button" data-toggle-screen aria-expanded="'+editingScreen+'" aria-controls="screen-edit-details">แก้ไขรายการ</button><p class="help-text">เลือกรายการแล้ว • กดเพื่อเปิดหรือปิดรายละเอียด</p><div id="screen-edit-details"'+(!editingScreen ? ' hidden' : '')+'></div></section>' : '') +
       detailDialogMarkup +
      (!isAudit && !isOperational && category !== "calendar" && (!editOnly || editingScreen || creatingRecord) && (selected || (canCreate && creatingRecord)) ? '<section data-admin-editor class="card form-card" style="margin-top:.8rem"><h2>' + (selected ? 'แก้ไขรายการ' : 'เพิ่มรายการ') + ' • ' + escapeHtml(schema.label) + '</h2>' +
      (category === 'attendance' ? '<p class="help-text">ลงเวลาแทนเมื่อเครื่องสแกนใช้งานไม่ได้ หรือแก้ไขเวลาเดิม • เลือกพนักงาน วันที่ และเวลาเข้า–ออก พร้อมระบุเหตุผล • เวลาออกใส่ภายหลังได้ • มาสาย ออกก่อน และ OT คำนวณใหม่ • บันทึกสำเร็จแจ้งทุกบัญชี หากมีรายการของวันที่เลือกแล้ว ให้แก้ไขรายการเดิม</p>' : '') +
      (category === 'screenEntries' ? '<p class="help-text">ข้อมูลชุดเดียวกับหน้างานสกรีน • เว้นว่างเมื่อไม่บันทึกช่องนั้น และใส่ 0 เมื่อยืนยันว่าไม่มี • เพิ่มหรือแก้ไขต้องระบุเหตุผลและเก็บประวัติ</p>' : '') +
      (category === 'otRequests' ? '<p class="help-text">Admin เพิ่มรายการ OT แทนพนักงานหรือแก้ไขรายการเดิมได้ • เลือกชื่อพนักงานจากรายชื่อจำลอง และระบบเก็บผู้แก้ไขไว้ในประวัติ</p>' : '') +
      '<form id="admin-edit-form"><div class="form-grid" style="margin-top:.8rem">' + schema.fields.map(spec => {
        if(category==='production' && spec.key==='machine')return productionMachineField(record,!!selected,productionMachines,productionMachineError);
        if(category==='screenEntries' && !selected && spec.key==='operatorName')return editorField({...spec,readOnly:true},{operatorName:context.user.name});
        if (category === 'attendance' && ['leaveStatus','absent'].includes(spec.key)) return '';
        if (category === 'attendance' && spec.key === 'workdayStatus') {
          const label = attendanceDayLabel(record);
          return editorField({key:'workdayStatusDisplay',label:'สถานะวันทำงาน',type:'text',readOnly:true},{workdayStatusDisplay:label});
        }
        if (category === 'attendance' && spec.key === 'employee') {
          const names = [...new Set([...employeeDirectory.filter(person=>person.active!==false && person.role==='employee').map(person=>person.name), ...rows.map(row=>row.employee)])].filter(Boolean).sort((a,b)=>a.localeCompare(b,'th'));
          return editorField({...spec,options:['',...names],labels:['เลือกพนักงาน',...names]},record);
        }
        if (category === 'otRequests' && spec.key === 'employee') {
          const names = [...new Set([...employeeDirectory.filter(person=>person.active!==false && person.role==='employee').map(person=>person.name), ...rows.map(row=>row.employee)])].filter(Boolean).sort((a,b)=>a.localeCompare(b,'th'));
          return editorField({...spec,options:['',...names],labels:['เลือกพนักงาน',...names]},record);
        }
        return editorField(spec, record);
      }).join('') +
      '</div><div class="field"><label for="admin-reason">เหตุผลการแก้ไข</label><textarea id="admin-reason" name="changeReason" required minlength="3" maxlength="300"></textarea></div><div class="form-actions"><button class="button button-primary" type="submit">ตรวจสอบและบันทึก</button></div></form></section>' : '') +
      '';
    if(category==='leaveRequests' && context.user?.role==='admin') bindAdminLeaveProxy(root,context,{
      onToggle:()=>{leaveProxyOpen=!leaveProxyOpen;draw();},
      onSaved:async()=>{leaveProxyOpen=false;draw();await loadLeavePage(0,leaveFilters);}
    });
    if(canCreate && creatingRecord && !selected) {
      const editor=root.querySelector('[data-admin-editor]');
      editor.className='attendance-section';
      editor.style.marginTop='';
      editor.querySelector('h2')?.remove();
      root.querySelector('[data-create-details]').append(editor);
    }
    if(isWorkHistoryCategory) {
      const fromLabel=root.querySelector('label[for="admin-work-from"]');
      if(fromLabel)fromLabel.textContent=category==='workSessions'?'วันที่เริ่มงาน ตั้งแต่ (เวลาไทย)':'วันที่งาน ตั้งแต่ (เวลาไทย)';
      const groupField=root.querySelector('#admin-work-group');
      if(groupField && category!=='workSessions')groupField.disabled=true;
      if(category==='screenEntries'||category==='production') {
        const note=document.createElement('p');
        note.className='help-text';
        note.textContent='รวมรายการเดิมจากแบบฟอร์มกับงานที่ผูก Work Session; รายการเดิมไม่มีสถานะ session จึงแสดงเมื่อเลือกทุกสถานะเท่านั้น.';
        root.querySelector('[data-admin-search]')?.after(note);
      }
    }
    if(editOnly && selected && !isOperational) {
      const details=root.querySelector('.work-manager-fields')?.closest('section');
      if(editingScreen) {
        const host=root.querySelector('#screen-edit-details');
        if(details) { details.className='attendance-section'; host.append(details); }
        const editor=root.querySelector('[data-admin-editor]');
        editor.className='attendance-section';
        editor.style.marginTop='';
        editor.querySelector('h2')?.remove();
        host.append(editor);
      } else details?.remove();
    }
    if (category === "calendar") {
      const host = document.createElement("section");
      host.className = "attendance-section";
      host.setAttribute("aria-label","จัดการปฏิทินงานแบบผู้บริหาร");
      root.querySelector("[data-record-browser]").replaceWith(host);
      calendarController = new AbortController();
      const signal = calendarController.signal;
      if (context.signal?.aborted) calendarController.abort();
      void renderWorkCalendar(host,{...context,signal,onDataChange:undefined}).catch(error=>{
        if(!signal.aborted){host.textContent="โหลดปฏิทินไม่สำเร็จ กรุณาเลือกหมวดใหม่";context.showToast(error.message,"error");}
      });
    }
    async function loadLeavePage(offset=0,filters=leaveFilters) {
      const version=++leaveRequestGeneration;
      leaveFilters={...filters};leaveOffset=offset;query=leaveFilters.query;
      rows=[];leaveTotal=0;selectedId=null;leaveDetail=null;leaveImages=[];leaveDetailError='';leaveDetailLoading=false;
      if(Boolean(leaveFilters.from)!==Boolean(leaveFilters.to) || (leaveFilters.from&&leaveFilters.to&&leaveFilters.from>leaveFilters.to)) {
        leaveListLoading=false;leaveListError='กรอกวันเริ่มและวันสิ้นสุดให้ครบ และตรวจช่วงวันที่';draw();return;
      }
      leaveListLoading=true;leaveListError='';draw();
      try {
        const result=await leaveApi.readAdminLeaveHistoryPage({...leaveFilters,limit:25,offset});
        if(context.signal?.aborted || version!==leaveRequestGeneration || category!=='leaveRequests')return;
        if(!Array.isArray(result?.items)||!Number.isFinite(Number(result.total_count)))throw new Error('ผลคำขอลาจาก Supabase ไม่ครบถ้วน');
        rows=result.items;leaveTotal=Number(result.total_count);leaveOffset=Number(result.offset)||0;
      } catch(error) {
        if(context.signal?.aborted || version!==leaveRequestGeneration || category!=='leaveRequests')return;
        leaveListError=error.message||'โหลดคำขอลาไม่สำเร็จ';
      } finally {
        if(!context.signal?.aborted && version===leaveRequestGeneration && category==='leaveRequests'){leaveListLoading=false;draw();}
      }
    }
    async function loadLeaveDetail(id) {
      const version=++leaveDetailGeneration;
      selectedId=id;leaveDetail=null;leaveImages=[];leaveDetailError='';leaveDetailLoading=true;draw();
      try {
        const [detail,images]=await Promise.all([leaveApi.readLeaveDetail(id),leaveApi.readLeaveImages(id)]);
        if(context.signal?.aborted || version!==leaveDetailGeneration || selectedId!==id || category!=='leaveRequests')return;
        if(detail?.id!==id || !Array.isArray(images) || images.some(file=>typeof file.url!=='string'))throw new Error('รายละเอียดหรือเอกสารแนบคำขอลาจาก Supabase ไม่ครบถ้วน');
        leaveDetail=detail;leaveImages=images;
      } catch(error) {
        if(context.signal?.aborted || version!==leaveDetailGeneration || selectedId!==id || category!=='leaveRequests')return;
        leaveDetailError=error.message||'โหลดรายละเอียดคำขอลาไม่สำเร็จ';
      } finally {
        if(!context.signal?.aborted && version===leaveDetailGeneration && selectedId===id && category==='leaveRequests'){leaveDetailLoading=false;draw();}
      }
    }
    async function loadDeliveryPage(offset=0, filters=deliveryFilters) {
      const version=++deliveryRequestGeneration;
      deliveryFilters={...filters};query=deliveryFilters.query;deliveryOffset=offset;
      deliveryListLoading=true;deliveryListError="";selectedId=null;deliveryDetail=null;deliveryDetailError="";
      draw();
      try {
        const result=await deliveryApi.listAdminDeliveries({query:deliveryFilters.query,from:deliveryFilters.from||null,to:deliveryFilters.to||null,
          status:deliveryFilters.status||null,employeeId:deliveryFilters.employeeId||null,group:deliveryFilters.group||null,limit:ADMIN_DELIVERY_PAGE_SIZE,offset});
        if(context.signal?.aborted || version!==deliveryRequestGeneration || category!=="deliveries")return;
        if(!Array.isArray(result?.rows) || !Number.isFinite(Number(result.total)))throw new Error("ผลรายการขนส่งจาก Supabase ไม่ครบถ้วน");
        rows=result.rows;deliveryTotal=Number(result.total);deliveryOffset=Number(result.offset)||0;
      } catch(error) {
        if(context.signal?.aborted || version!==deliveryRequestGeneration || category!=="deliveries")return;
        deliveryListError=error.message||"โหลดรายการขนส่งไม่สำเร็จ";
      } finally {
        if(!context.signal?.aborted && version===deliveryRequestGeneration && category==="deliveries"){
          deliveryListLoading=false;draw();
        }
      }
    }
    async function loadDeliveryDetail(id) {
      const version=++deliveryDetailGeneration;
      selectedId=id;deliveryDetail=null;deliveryDetailError="";deliveryDetailLoading=true;draw();
      try {
        const result=await deliveryApi.getDeliveryDetail(id);
        if(context.signal?.aborted || version!==deliveryDetailGeneration || selectedId!==id || category!=="deliveries")return;
        if(result?.id!==id || result.audit_verified!==true)throw new Error("อ่านรายละเอียดได้แต่ยังยืนยัน Audit ไม่ครบ");
        deliveryDetail=result;
      } catch(error) {
        if(context.signal?.aborted || version!==deliveryDetailGeneration || selectedId!==id || category!=="deliveries")return;
        deliveryDetailError=error.message||"โหลดรายละเอียดการขนส่งไม่สำเร็จ";
      } finally {
        if(!context.signal?.aborted && version===deliveryDetailGeneration && selectedId===id && category==="deliveries"){
          deliveryDetailLoading=false;draw();
        }
      }
    }
    async function loadOtPage(offset=0, filters=otFilters) {
      const version=++otRequestGeneration;
      otFilters={...filters};otOffset=offset;query='';
      rows=[];otTotal=0;otTotalMinutes=0;selectedId=null;otDetail=null;otDetailError='';otDetailLoading=false;
      if(!/^\d{4}-\d{2}-\d{2}$/.test(otFilters.from||'') || !/^\d{4}-\d{2}-\d{2}$/.test(otFilters.to||'') || otFilters.from>otFilters.to) {
        otListLoading=false;otListError='เลือกช่วงวันที่ OT ให้ถูกต้องก่อนค้นหา';draw();return;
      }
      otListLoading=true;otListError='';draw();
      try {
        const result=await workApi.listAdminOvertimeRequests({...otFilters,limit:ADMIN_OT_PAGE_SIZE,offset});
        if(context.signal?.aborted || version!==otRequestGeneration || category!=='otRequests')return;
        if(!Array.isArray(result?.items) || !Number.isFinite(Number(result.total_count)) || !Number.isFinite(Number(result.total_duration_minutes)))
          throw new Error('ผลรายงาน OT จาก Supabase ไม่ครบถ้วน');
        rows=result.items;otTotal=Number(result.total_count);otTotalMinutes=Number(result.total_duration_minutes);otOffset=Number(result.offset)||0;
      } catch(error) {
        if(context.signal?.aborted || version!==otRequestGeneration || category!=='otRequests')return;
        otListError=error.message||'โหลดรายงาน OT ไม่สำเร็จ';
      } finally {
        if(!context.signal?.aborted && version===otRequestGeneration && category==='otRequests') {otListLoading=false;draw();}
      }
    }
    async function loadOtDetail(id) {
      const version=++otDetailGeneration;
      selectedId=id;otDetail=null;otDetailError='';otDetailLoading=true;draw();
      try {
        const result=await workApi.readOvertimeReport(id,'admin');
        if(context.signal?.aborted || version!==otDetailGeneration || selectedId!==id || category!=='otRequests')return;
        if(result?.id!==id || !Array.isArray(result.attachments) || result.attachments.some(file=>typeof file.signed_url!=='string'))
          throw new Error('รายละเอียด OT หรือรูปแนบจาก Supabase ไม่ครบถ้วน');
        otDetail=result;
      } catch(error) {
        if(context.signal?.aborted || version!==otDetailGeneration || selectedId!==id || category!=='otRequests')return;
        otDetailError=error.message||'โหลดรายละเอียด OT ไม่สำเร็จ';
      } finally {
        if(!context.signal?.aborted && version===otDetailGeneration && selectedId===id && category==='otRequests') {otDetailLoading=false;draw();}
      }
    }
    async function loadWorkSessionPage(offset=0, filters=workSessionFilters) {
      const version=++workSessionRequestGeneration;
      const fixedGroup=category==='screenEntries'?'สกรีน':category==='production'?'ผลิต':filters.group||'';
      workSessionFilters={...filters,group:fixedGroup,dateBasis:category==='workSessions'?'start':'business'};workSessionOffset=offset;query='';
      rows=[];workSessionTotal=0;selectedId=null;workSessionDetail=null;workSessionDetailError='';workSessionDetailLoading=false;
      if(!/^\d{4}-\d{2}-\d{2}$/.test(workSessionFilters.from||'') || !/^\d{4}-\d{2}-\d{2}$/.test(workSessionFilters.to||'') || workSessionFilters.from>workSessionFilters.to) {
        workSessionListLoading=false;workSessionListError='เลือกช่วงวันที่เริ่มงานให้ถูกต้องก่อนค้นหา';draw();return;
      }
      workSessionListLoading=true;workSessionListError='';draw();
      try {
        const enforcedGroup=category==='screenEntries'?'สกรีน':category==='production'?'ผลิต':workSessionFilters.group||null;
        const result=await workApi.listAdminWorkSessions({from:workSessionFilters.from,to:workSessionFilters.to,dateBasis:workSessionFilters.dateBasis||'start',sourceCategory:category,
          employeeId:workSessionFilters.employeeId||null,group:enforcedGroup,status:workSessionFilters.status,
          query:workSessionFilters.query,limit:ADMIN_WORK_SESSION_PAGE_SIZE,offset});
        if(context.signal?.aborted || version!==workSessionRequestGeneration || !["workSessions","screenEntries","production"].includes(category))return;
        if(!Array.isArray(result?.items) || !Number.isFinite(Number(result.total_count)))throw new Error('ผลประวัติ session จาก Supabase ไม่ครบถ้วน');
        rows=result.items;workSessionTotal=Number(result.total_count);workSessionOffset=Number(result.offset)||0;
      } catch(error) {
        if(context.signal?.aborted || version!==workSessionRequestGeneration || !["workSessions","screenEntries","production"].includes(category))return;
        workSessionListError=error.message||'โหลดประวัติ session ไม่สำเร็จ';
      } finally {
        if(!context.signal?.aborted && version===workSessionRequestGeneration && ["workSessions","screenEntries","production"].includes(category)) {workSessionListLoading=false;draw();}
      }
    }
    async function loadWorkSessionDetail(id) {
      const version=++workSessionDetailGeneration;
      selectedId=id;workSessionDetail=null;workSessionDetailError='';workSessionDetailLoading=true;draw();
      try {
        const result=await workApi.readAdminWorkSessionDetail(id,category);
        if(context.signal?.aborted || version!==workSessionDetailGeneration || selectedId!==id || !["workSessions","screenEntries","production"].includes(category))return;
        const expectedLegacyCategory=rows.find(row=>row.id===id)?.legacy_category||null;
        if(result?.id!==id || !result.payload || (result.legacy_category||null)!==expectedLegacyCategory)
          throw new Error('รายละเอียดงานจาก Supabase ไม่ครบถ้วนหรือไม่ตรงหมวด');
        workSessionDetail=result;
      } catch(error) {
        if(context.signal?.aborted || version!==workSessionDetailGeneration || selectedId!==id || !["workSessions","screenEntries","production"].includes(category))return;
        workSessionDetailError=error.message||'โหลดรายละเอียด session ไม่สำเร็จ';
      } finally {
        if(!context.signal?.aborted && version===workSessionDetailGeneration && selectedId===id && ["workSessions","screenEntries","production"].includes(category)) {workSessionDetailLoading=false;draw();}
      }
    }
    async function loadAuditPage(offset=0, filters=auditFilters, append=false) {
      auditController?.abort();
      const version=++auditRequestGeneration,controller=new AbortController();auditController=controller;
      const requestedFilters={...filters};
      auditFilters=requestedFilters;auditListLoading=true;
      if(!append){rows=[];selectedId=null;recordDetailDialogRequested=false;auditDetailController?.abort();auditDetailGeneration++;auditDetail=null;auditDetailError='';auditDetailLoading=false;auditHasMore=false;auditListError='';auditMoreError='';}
      else auditMoreError='';
      draw();
      try {
        const result=await adminApi.readAdminAuditPage({...requestedFilters,offset,limit:ADMIN_AUDIT_PAGE_SIZE},{signal:controller.signal});
        if(context.signal?.aborted||controller.signal.aborted||version!==auditRequestGeneration||category!=='audit')return;
        const items=Array.isArray(result?.items)?result.items:[];
        rows=append?[...rows,...items]:items;auditHasMore=Boolean(result?.hasMore);
        auditListError='';auditMoreError='';
      } catch(error) {
        if(context.signal?.aborted||controller.signal.aborted||error?.name==='AbortError'||version!==auditRequestGeneration||category!=='audit')return;
        if(append)auditMoreError=error.message||'โหลดประวัติเพิ่มไม่สำเร็จ';
        else auditListError=error.message||'โหลดประวัติการแก้ไขไม่สำเร็จ';
      } finally {
        if(!context.signal?.aborted&&!controller.signal.aborted&&version===auditRequestGeneration&&category==='audit') {auditListLoading=false;draw();}
      }
    }
    async function loadAuditDetail(id) {
      auditDetailController?.abort();
      const version=++auditDetailGeneration,controller=new AbortController();auditDetailController=controller;
      selectedId=id;auditDetail=null;auditDetailError='';auditDetailLoading=true;draw();
      try {
        const result=await adminApi.readAdminAuditDetail(id,{signal:controller.signal});
        if(context.signal?.aborted||controller.signal.aborted||version!==auditDetailGeneration||selectedId!==id||category!=='audit')return;
        auditDetail=result;
      } catch(error) {
        if(context.signal?.aborted||controller.signal.aborted||error?.name==='AbortError'||version!==auditDetailGeneration||selectedId!==id||category!=='audit')return;
        auditDetailError=error.message||'โหลดรายละเอียดประวัติไม่สำเร็จ';
      } finally {
        if(!context.signal?.aborted&&!controller.signal.aborted&&version===auditDetailGeneration&&selectedId===id&&category==='audit') {auditDetailLoading=false;draw();}
      }
    }
    async function selectCategory(nextCategory) {
      calendarController?.abort();
      auditController?.abort();auditDetailController?.abort();auditRequestGeneration++;auditDetailGeneration++;
      if(nextCategory!=='leaveRequests')leaveProxyOpen=false;
      const version = ++generation;
      recordDetailDialogRequested=false;
      deliveryRequestGeneration++;deliveryDetailGeneration++;otRequestGeneration++;otDetailGeneration++;workSessionRequestGeneration++;workSessionDetailGeneration++;leaveRequestGeneration++;leaveDetailGeneration++;
      if(nextCategory==='leaveRequests'){
        root.querySelectorAll('button, input, select, textarea').forEach(control=>{control.disabled=true;});
        try{employeeDirectory=await adminApi.listRecords('employees');}
        catch(error){if(!context.signal?.aborted)context.showToast(error.message||'โหลดรายชื่อพนักงานไม่สำเร็จ','error');}
        if(version!==generation || context.signal?.aborted)return;
        category=nextCategory;rows=[];query='';leaveFilters={query:'',from:'',to:'',status:'all',dateBasis:'leave',employeeId:'',group:''};
        leaveOffset=0;leaveTotal=0;selectedId=null;leaveDetail=null;leaveImages=[];leaveDetailLoading=false;leaveDetailError='';leaveListLoading=false;leaveListError='';
        creatingRecord=false;editingScreen=false;draw();void loadLeavePage(0,leaveFilters);return;
      }
      if(nextCategory==='deliveries'){
        category=nextCategory;rows=[];query='';deliveryFilters={query:'',from:'',to:'',status:'',employeeId:'',group:''};deliveryOffset=0;deliveryTotal=0;
        selectedId=null;deliveryDetail=null;deliveryDetailLoading=false;deliveryDetailError='';deliveryListLoading=false;deliveryListError='';
        creatingRecord=false;editingScreen=false;draw();void loadDeliveryPage(0,deliveryFilters);return;
      }
      if(nextCategory==='otRequests'){
        category=nextCategory;rows=[];query='';otFilters={...defaultOtFilters(),employeeId:'',group:'',status:'all',query:''};otOffset=0;otTotal=0;otTotalMinutes=0;
        selectedId=null;otDetail=null;otDetailLoading=false;otDetailError='';otListLoading=false;otListError='';
        creatingRecord=false;editingScreen=false;draw();void loadOtPage(0,otFilters);return;
      }
      if(['workSessions','screenEntries','production'].includes(nextCategory)){
        root.querySelectorAll('button, input, select, textarea').forEach(control=>{control.disabled=true;});
        try{employeeDirectory=await adminApi.listRecords('employees');}
        catch(error){if(!context.signal?.aborted)context.showToast(error.message||'โหลดรายชื่อพนักงานไม่สำเร็จ','error');}
        if(version!==generation || context.signal?.aborted)return;
        category=nextCategory;rows=[];query='';workSessionFilters={...defaultOtFilters(),employeeId:'',group:nextCategory==='screenEntries'?'สกรีน':nextCategory==='production'?'ผลิต':'',status:'all',query:'',dateBasis:nextCategory==='workSessions'?'start':'business'};
        workSessionOffset=0;workSessionTotal=0;selectedId=null;workSessionDetail=null;workSessionDetailLoading=false;
        workSessionDetailError='';workSessionListLoading=false;workSessionListError='';creatingRecord=false;editingScreen=false;
        draw();void loadWorkSessionPage(0,workSessionFilters);return;
      }
      if(nextCategory==='audit'){
        root.querySelectorAll('button, input, select, textarea').forEach(control=>{control.disabled=true;});
        auditDirectoryError='';
        try{employeeDirectory=await adminApi.listRecords('employees');}
        catch(error){auditDirectoryError=error.message||'โหลดรายชื่อผู้ดำเนินการไม่สำเร็จ';}
        if(version!==generation||context.signal?.aborted)return;
        category='audit';rows=[];query='';auditFilters={from:'',to:'',actorId:'',tableName:'',action:'',recordId:''};
        auditHasMore=false;auditListLoading=false;auditListError='';auditMoreError='';auditDetail=null;auditDetailLoading=false;auditDetailError='';
        selectedId=null;creatingRecord=false;editingScreen=false;draw();void loadAuditPage(0,auditFilters,false);return;
      }
      root.querySelectorAll('button, input, select, textarea').forEach(control=>{control.disabled=true;});
      try {
        let nextProductionMachines=[], nextMachineError='';
        if(nextCategory==='production')try{nextProductionMachines=(await workApi.readWorkOptions('ผลิต')).machines||[];}catch(error){nextMachineError=error.message||'โหลดเครื่องจักรไม่สำเร็จ';}
        const data = await adminApi.listRecords(nextCategory);
        const directory = nextCategory === 'attendance' ? await adminApi.listRecords('employees') : employeeDirectory;
        if(version!==generation || context.signal?.aborted)return;
        employeeDirectory=directory;
        productionMachines=nextProductionMachines;productionMachineError=nextMachineError;
        category=nextCategory;rows=data;query='';creatingRecord=false;editingScreen=false;selectedId=RECORD_SCHEMAS[category]?.singleton ? rows[0]?.id : null;draw();
      }catch(error){if(!context.signal?.aborted){context.showToast(error.message,'error');draw();}}
    }
    root.querySelector('[data-admin-search]')?.addEventListener('submit',event=>{
      event.preventDefault();
      if(category==='audit'){
        const nextFilters={from:root.querySelector('#admin-audit-from')?.value||'',to:root.querySelector('#admin-audit-to')?.value||'',
          actorId:root.querySelector('#admin-audit-actor-id')?.value.trim()||root.querySelector('#admin-audit-actor')?.value||'',
          tableName:root.querySelector('#admin-audit-table')?.value||'',action:root.querySelector('#admin-audit-action')?.value||'',
          recordId:root.querySelector('#admin-audit-record')?.value.trim()||''};
        const validation=validateAuditFilters(nextFilters);
        if(!validation.valid){
          const messages={DATE_INVALID:'วันเริ่มหรือสิ้นสุดไม่ถูกต้อง',DATE_ORDER:'วันเริ่มต้องไม่อยู่หลังวันสิ้นสุด',ACTOR_INVALID:'รหัสผู้ดำเนินการไม่ถูกต้อง',RECORD_INVALID:'รหัสรายการต้องเป็น UUID 36 ตัวอักษร'};
          auditController?.abort();auditRequestGeneration++;auditDetailController?.abort();auditDetailGeneration++;
          recordDetailDialogRequested=false;selectedId=null;auditDetail=null;auditDetailLoading=false;auditDetailError='';
          auditFilters=nextFilters;rows=[];auditHasMore=false;auditListLoading=false;auditMoreError='';auditListError=messages[validation.code]||'ตัวกรองประวัติไม่ถูกต้อง';draw();return;
        }
        void loadAuditPage(0,nextFilters,false);return;
      }
      if(category==='deliveries'){
        const nextFilters={query:root.querySelector('#admin-search')?.value.trim()||'',from:root.querySelector('#admin-delivery-from')?.value||'',
          to:root.querySelector('#admin-delivery-to')?.value||'',status:root.querySelector('#admin-delivery-status')?.value||'',
          employeeId:root.querySelector('#admin-delivery-employee')?.value||'',group:root.querySelector('#admin-delivery-group')?.value||''};
        void loadDeliveryPage(0,nextFilters);return;
      }
      if(category==='otRequests'){
        const nextFilters={from:root.querySelector('#admin-ot-from')?.value||'',to:root.querySelector('#admin-ot-to')?.value||'',
          employeeId:root.querySelector('#admin-ot-employee')?.value||'',group:root.querySelector('#admin-ot-group')?.value||'',
          status:root.querySelector('#admin-ot-status')?.value||'all',query:root.querySelector('#admin-search')?.value.trim()||''};
        void loadOtPage(0,nextFilters);return;
      }
      if(category==='leaveRequests'){
        const nextFilters={query:root.querySelector('#admin-search')?.value.trim()||'',from:root.querySelector('#admin-leave-from')?.value||'',
          to:root.querySelector('#admin-leave-to')?.value||'',dateBasis:root.querySelector('#admin-leave-date-basis')?.value||'leave',
          employeeId:root.querySelector('#admin-leave-employee')?.value||'',group:root.querySelector('#admin-leave-group')?.value||'',
          status:root.querySelector('#admin-leave-status')?.value||'all'};
        void loadLeavePage(0,nextFilters);return;
      }
      if(isWorkHistoryCategory){
        const nextFilters={from:root.querySelector('#admin-work-from')?.value||'',to:root.querySelector('#admin-work-to')?.value||'',
          employeeId:root.querySelector('#admin-work-employee')?.value||'',group:root.querySelector('#admin-work-group')?.value||'',
          status:root.querySelector('#admin-work-status')?.value||'all',query:root.querySelector('#admin-work-search')?.value.trim()||'',dateBasis:workSessionFilters.dateBasis};
        void loadWorkSessionPage(0,nextFilters);return;
      }
      query=root.querySelector('#admin-search').value.trim();draw();context.showToast('ค้นหาเสร็จแล้ว','success');
    });
    root.querySelector('[data-audit-retry]')?.addEventListener('click',()=>void loadAuditPage(0,auditFilters,false));
    root.querySelector('[data-audit-more]')?.addEventListener('click',()=>void loadAuditPage(rows.length,auditFilters,true));
    root.querySelector('[data-audit-detail-retry]')?.addEventListener('click',()=>{if(selectedId)void loadAuditDetail(selectedId);});
    root.querySelector('[data-delivery-prev]')?.addEventListener('click',()=>void loadDeliveryPage(Math.max(0,deliveryOffset-ADMIN_DELIVERY_PAGE_SIZE)));
    root.querySelector('[data-delivery-next]')?.addEventListener('click',()=>void loadDeliveryPage(deliveryOffset+ADMIN_DELIVERY_PAGE_SIZE));
    root.querySelector('[data-delivery-retry]')?.addEventListener('click',()=>void loadDeliveryPage(deliveryOffset,deliveryFilters));
    root.querySelector('[data-leave-prev]')?.addEventListener('click',()=>void loadLeavePage(Math.max(0,leaveOffset-25)));
    root.querySelector('[data-leave-next]')?.addEventListener('click',()=>void loadLeavePage(leaveOffset+25));
    root.querySelector('[data-leave-retry]')?.addEventListener('click',()=>void loadLeavePage(leaveOffset,leaveFilters));
    root.querySelector('[data-leave-detail-retry]')?.addEventListener('click',()=>{if(selectedId)void loadLeaveDetail(selectedId);});
    root.querySelectorAll('[data-leave-review]').forEach(button=>button.addEventListener('click',async()=>{
      const id=selectedId,decision=button.dataset.leaveReview,reason=root.querySelector('#admin-leave-review-reason')?.value.trim()||'';
      if(!id||!['approved','rejected'].includes(decision)||reason.length<1){context.showToast('กรอกเหตุผลก่อนพิจารณาคำขอ','error');return;}
      if(button.disabled)return;
      const confirmed=await confirmAction({title:decision==='approved'?'ยืนยันอนุมัติคำขอลา':'ยืนยันปฏิเสธคำขอลา',
        message:'เหตุผล: '+reason+'\nระบบจะบันทึกผลผ่าน workflow เดิมและตรวจสอบ Audit'});
      if(!confirmed||context.signal?.aborted)return;
      const targetGeneration=leaveDetailGeneration;button.disabled=true;
      try{
        const result=await leaveApi.reviewLeaveRequest(id,decision,reason,leaveDetail?.updatedAt);
        if(result?.saved?.status!==decision||!result.saved.audit?.id)throw new Error('ผลพิจารณาหรือ Audit อ่านกลับไม่ครบถ้วน');
        context.showToast('บันทึกผลพิจารณาและตรวจสอบ Audit แล้ว','success');
        await loadLeavePage(leaveOffset,leaveFilters);
        if(!context.signal?.aborted&&leaveRequestGeneration>=1&&rows.some(row=>row.id===id))await loadLeaveDetail(id);
      }catch(error){if(!context.signal?.aborted)context.showToast(error.message||'บันทึกผลพิจารณาไม่สำเร็จ', 'error');}
      finally{if(!context.signal?.aborted&&targetGeneration===leaveDetailGeneration)draw();}
    }));
    root.querySelector('[data-ot-prev]')?.addEventListener('click',()=>void loadOtPage(Math.max(0,otOffset-ADMIN_OT_PAGE_SIZE),otFilters));
    root.querySelector('[data-ot-next]')?.addEventListener('click',()=>void loadOtPage(otOffset+ADMIN_OT_PAGE_SIZE,otFilters));
    root.querySelector('[data-ot-retry]')?.addEventListener('click',()=>void loadOtPage(otOffset,otFilters));
    root.querySelector('[data-ot-detail-retry]')?.addEventListener('click',()=>{if(selectedId)void loadOtDetail(selectedId);});
    root.querySelector('[data-work-session-prev]')?.addEventListener('click',()=>void loadWorkSessionPage(Math.max(0,workSessionOffset-ADMIN_WORK_SESSION_PAGE_SIZE),workSessionFilters));
    root.querySelector('[data-work-session-next]')?.addEventListener('click',()=>void loadWorkSessionPage(workSessionOffset+ADMIN_WORK_SESSION_PAGE_SIZE,workSessionFilters));
    root.querySelector('[data-work-session-retry]')?.addEventListener('click',()=>void loadWorkSessionPage(workSessionOffset,workSessionFilters));
    root.querySelector('[data-work-session-detail-retry]')?.addEventListener('click',()=>{if(selectedId)void loadWorkSessionDetail(selectedId);});
    const recordDetailDialog=root.querySelector('[data-admin-record-detail-dialog]');
    const closeRecordDetail=()=>{
      if(!recordDetailDialogRequested||!selectedId)return;
      const returnIndex=rows.findIndex(row=>row.id===selectedId);
      recordDetailDialogRequested=false;
      leaveDetailGeneration++;deliveryDetailGeneration++;otDetailGeneration++;workSessionDetailGeneration++;
      auditDetailController?.abort();auditDetailGeneration++;auditDetail=null;auditDetailError='';auditDetailLoading=false;
      if(operationalCategories.has(category)||category==='audit'||category==='calendar')selectedId=null;
      leaveDetail=null;leaveImages=[];leaveDetailError='';leaveDetailLoading=false;
      deliveryDetail=null;deliveryDetailError='';deliveryDetailLoading=false;
      otDetail=null;otDetailError='';otDetailLoading=false;
      workSessionDetail=null;workSessionDetailError='';workSessionDetailLoading=false;
      draw();
      if(returnIndex>=0)root.querySelector('[data-record="'+returnIndex+'"]')?.focus({preventScroll:true});
    };
    recordDetailDialog?.querySelectorAll('[data-admin-record-detail-close]').forEach(button=>button.addEventListener('click',closeRecordDetail));
    recordDetailDialog?.addEventListener('cancel',event=>{event.preventDefault();closeRecordDetail();});
    if(recordDetailDialog&&!recordDetailDialog.open) {
      if(typeof recordDetailDialog.showModal==='function')recordDetailDialog.showModal();
      else recordDetailDialog.setAttribute('open','');
    }
    root.querySelectorAll('[data-record]').forEach(button => button.addEventListener('click', () => {
      const id=rows[Number(button.dataset.record)]?.id;if(!id)return;
      recordDetailDialogRequested=true;
      creatingRecord=false;editingScreen=false;
      if(category==='leaveRequests'){void loadLeaveDetail(id);return;}
      if(isWorkHistoryCategory){void loadWorkSessionDetail(id);return;}
      if(category==='deliveries'){void loadDeliveryDetail(id);return;}
      if(category==='otRequests'){void loadOtDetail(id);return;}
      if(category==='audit'){void loadAuditDetail(id);return;}
      selectedId=id;draw();
    }));
    root.querySelector('[data-new-record]')?.addEventListener('click', () => { recordDetailDialogRequested=false;selectedId = null; editingScreen=false; creatingRecord=!creatingRecord; draw(); });
    root.querySelector('[data-toggle-screen]')?.addEventListener('click', () => { if(!selected)return; editingScreen=!editingScreen; draw(); });
    root.querySelector('[data-refresh-production-machines]')?.addEventListener('click',async event=>{
      const button=event.currentTarget,form=root.querySelector('#admin-edit-form');
      const saved=form?Object.fromEntries(new FormData(form)):{};
      button.disabled=true;
      try{const result=await workApi.readWorkOptions('ผลิต');productionMachines=result.machines||[];productionMachineError='';}
      catch(error){productionMachineError=error.message||'โหลดเครื่องจักรไม่สำเร็จ';}
      if(context.signal?.aborted)return;
      draw();
      const nextForm=root.querySelector('#admin-edit-form');
      for(const [name,value] of Object.entries(saved)){const field=nextForm?.elements.namedItem(name);if(field&&name!=='machine'&&field.type!=='file')field.value=value;}
      const machine=nextForm?.elements.namedItem('machine');
      if(machine&&saved.machine&&[...machine.options].some(option=>option.value===saved.machine))machine.value=saved.machine;
    });
    if(category==='attendance') {
      const form=root.querySelector('#admin-edit-form');
      const syncStatus=()=>{form.elements.workdayStatusDisplay.value=attendanceDayLabel({...record,checkIn:form.elements.checkIn.value,checkOut:form.elements.checkOut.value});};
      form?.elements.checkIn.addEventListener('change',syncStatus);
      form?.elements.checkOut.addEventListener('change',syncStatus);
    }
    root.querySelector('#admin-edit-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      if (!requireOnlineAction('แก้ไขข้อมูล')) return;
      const form = event.currentTarget;
      const button = form.querySelector('button[type=submit]');
      if (button.disabled) return;
      let values;
      try {
        const input=Object.fromEntries(new FormData(form));
        const photoFile=form.elements.photoFile?.files?.[0];
        if(photoFile) {
          if(!['image/png','image/jpeg','image/gif','image/webp'].includes(photoFile.type) || photoFile.size>512*1024)throw new Error('รูปต้องเป็น PNG, JPG, GIF หรือ WebP และไม่เกิน 512 KB');
          input.photo=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('อ่านรูปไม่สำเร็จ'));reader.readAsDataURL(photoFile);});
        }
        // Removed leave/absence controls retain the stored values on edits.
        // Workday status is calculated from the times rather than overridden by UI.
        values = validateRecord(category, category==='attendance' ? {...blankRecord(category),...selected,...input} : input);
      }
      catch (error) { context.showToast(error.message, 'error'); return; }
      const targetCategory = category, targetId = selectedId;
      button.disabled = true;
      const changes = schema.fields.filter(spec=>JSON.stringify(selected?.[spec.key] ?? null)!==JSON.stringify(values[spec.key] ?? null)).map(spec=>spec.label+': '+printable(selected?.[spec.key])+' → '+printable(values[spec.key]));
      const confirmed = await confirmAction({ title:'ตรวจสอบก่อนบันทึก • '+schema.label, message:changes.join('\n')+'\nเหตุผล: '+form.elements.changeReason.value, confirmLabel:'ยืนยันบันทึก' });
      if (!confirmed || context.signal?.aborted) { button.disabled = false; return; }
      button.textContent = 'กำลังบันทึก…';
      root.querySelectorAll('button, input, select, textarea').forEach(control => { control.disabled = true; });
      try {
        const result = await adminApi.saveRecord(targetCategory, targetId, values, selected || null, form.elements.changeReason.value);
        const nextRows = await adminApi.listRecords(targetCategory);
        if (context.signal?.aborted) return;
        rows = nextRows; category = targetCategory; selectedId = result.id; creatingRecord=false; editingScreen=false; draw();
        context.showToast('บันทึกข้อมูลแล้ว', 'success');
      } catch (error) { if (!context.signal?.aborted) { context.showToast(error.message || 'บันทึกไม่สำเร็จ', 'error'); draw(); } }
    });
    if(!initialCategoryLoadStarted){initialCategoryLoadStarted=true;void selectCategory(initialCategory);}
  };
  context.onDataChange?.(async()=>{
    const version=generation, target=category, otVersion=otRequestGeneration, workVersion=workSessionRequestGeneration,leaveVersion=leaveRequestGeneration;
    if(target==='audit'){void loadAuditPage(0,auditFilters,false);return;}
    const [latestData,latestDirectory]=await Promise.all([
      target==='deliveries' ? deliveryApi.listAdminDeliveries({
        query:deliveryFilters.query,from:deliveryFilters.from||null,to:deliveryFilters.to||null,status:deliveryFilters.status||null,
        employeeId:deliveryFilters.employeeId||null,group:deliveryFilters.group||null,limit:ADMIN_DELIVERY_PAGE_SIZE,offset:deliveryOffset
      }) : target==='otRequests' ? workApi.listAdminOvertimeRequests({...otFilters,limit:ADMIN_OT_PAGE_SIZE,offset:otOffset})
        : target==='leaveRequests' ? leaveApi.readAdminLeaveHistoryPage({...leaveFilters,limit:25,offset:leaveOffset})
        : ["workSessions","screenEntries","production"].includes(target) ? workApi.listAdminWorkSessions({from:workSessionFilters.from,to:workSessionFilters.to,dateBasis:workSessionFilters.dateBasis||'start',employeeId:workSessionFilters.employeeId||null,
          group:target==='screenEntries'?'สกรีน':target==='production'?'ผลิต':workSessionFilters.group||null,sourceCategory:target,status:workSessionFilters.status,query:workSessionFilters.query,limit:ADMIN_WORK_SESSION_PAGE_SIZE,offset:workSessionOffset})
        : adminApi.listRecords(target),
      adminApi.listRecords('employees')
    ]);
    if(context.signal?.aborted || version!==generation || target!==category || (target==='otRequests'&&otVersion!==otRequestGeneration)
      || (target==='leaveRequests'&&leaveVersion!==leaveRequestGeneration)
      || (["workSessions","screenEntries","production"].includes(target)&&workVersion!==workSessionRequestGeneration))return;
    if(pageBusy(root))return false;
    rows=target==='deliveries'?(latestData.rows||[]):target==='otRequests'||["workSessions","screenEntries","production"].includes(target)?(latestData.items||[]):target==='leaveRequests'?(latestData.items||[]):latestData;
    if(target==='deliveries')deliveryTotal=Number(latestData.total)||0;
    if(target==='leaveRequests'){leaveTotal=Number(latestData.total_count)||0;leaveOffset=Number(latestData.offset)||0;leaveListError='';leaveListLoading=false;}
    if(target==='otRequests'){
      otTotal=Number(latestData.total_count)||0;otTotalMinutes=Number(latestData.total_duration_minutes)||0;
      otOffset=Number(latestData.offset)||0;otListError='';otListLoading=false;
    }
    if(["workSessions","screenEntries","production"].includes(target)){
      workSessionTotal=Number(latestData.total_count)||0;workSessionOffset=Number(latestData.offset)||0;
      workSessionListError='';workSessionListLoading=false;
    }
    employeeDirectory=latestDirectory;recordDetailDialogRequested=false;selectedId=null;deliveryDetail=null;deliveryDetailError='';leaveDetail=null;leaveImages=[];leaveDetailError='';leaveDetailLoading=false;
    otDetail=null;otDetailError='';otDetailLoading=false;workSessionDetail=null;workSessionDetailError='';workSessionDetailLoading=false;
    // The embedded calendar owns its refresh and retains all staged days.
    if(category==='calendar')return;
    const editor=root.querySelector('#admin-edit-form');
    const dirty=editor && [...editor.querySelectorAll('input,select,textarea')].some(el=>el.tagName==='SELECT'
      ? el.value!==([...el.options].find(option=>option.defaultSelected)?.value || el.options[0]?.value)
      : el.value!==undefined && el.value!==el.defaultValue);
    const active=document.activeElement, focusId=root.contains(active)?active.id:'';
    const search=root.querySelector('#admin-search')?.value;
    draw();
    // Retain the old handler with its original expectedBefore snapshot. A concurrent
    // change therefore rejects a stale save rather than overwriting another edit.
    if(dirty)root.querySelector('#admin-edit-form')?.replaceWith(editor);
    if(search!==undefined)root.querySelector('#admin-search').value=search;
    if(focusId)root.querySelector('#'+focusId)?.focus({preventScroll:true});
  });
  draw();
}

