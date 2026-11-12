export const ADMIN_AUDIT_PAGE_SIZE = 50;

const TABLES = [
  ['employees', 'พนักงานและสิทธิ์'],
  ['employee_groups', 'สิทธิ์กลุ่มงาน'],
  ['auth.sessions', 'เซสชัน (ข้อมูลอ้างอิง)'],
  ['factory_records:attendance', 'เวลาเข้าออก'],
  ['factory_records:leaveRequests', 'คำขอลา'],
  ['factory_records:calendar', 'ปฏิทินการทำงาน'],
  ['factory_records:workSessions', 'เริ่มงาน–จบงาน'],
  ['factory_records:production', 'งานผลิต'],
  ['factory_records:screenEntries', 'งานสกรีน'],
  ['factory_records:deliveries', 'การขนส่ง'],
  ['factory_records:otRequests', 'รายงาน OT'],
  ['factory_record_attachments:leaveRequests', 'เอกสารคำขอลา'],
  ['factory_record_attachments:otRequests', 'รูป OT'],
  ['factory_record_attachments:deliveries', 'รูปขนส่ง'],
  ['factory_screen_work', 'รายการงานสกรีน'],
  ['factory_screen_work_items', 'รายละเอียดงานสกรีน'],
  ['factory_production_work', 'รายการงานผลิต'],
  ['registration_requests', 'คำขอสมัครสมาชิก'],
  ['machines', 'เครื่องจักร'],
  ['item_names', 'รายการชื่อ'],
];

export const AUDIT_TABLE_OPTIONS = Object.freeze(TABLES.map(([value, label]) => Object.freeze({ value, label })));
const TABLE_LABELS = new Map(TABLES);

const field = (key, label, inPayload = true) => Object.freeze({
  key,
  label,
  paths: Object.freeze(inPayload ? [`->>${key}`, `->payload->>${key}`] : [`->>${key}`])
});

const SAFE_FIELDS = new Map([
  ['employees', [
    field('employee_name', 'ชื่อพนักงาน', false), field('employee_code', 'รหัสพนักงาน', false),
    field('main_group', 'กลุ่มงาน', false), field('role', 'บทบาท', false), field('active', 'สถานะใช้งาน', false)
  ]],
  ['employee_groups', [
    field('employee_id', 'รหัสพนักงาน', false), field('group_name', 'กลุ่มงาน', false), field('active', 'สถานะสิทธิ์กลุ่ม', false)
  ]],
  ['factory_records:attendance', [
    field('date', 'วันที่'), field('employee', 'พนักงาน'), field('checkIn', 'เวลาเข้า'),
    field('checkOut', 'เวลาออก'), field('workdayStatus', 'สถานะวันทำงาน')
  ]],
  ['factory_records:leaveRequests', [
    field('status', 'สถานะคำขอ'), field('startDate', 'วันเริ่มลา'), field('endDate', 'วันสิ้นสุด'), field('totalDays', 'จำนวนวัน')
  ]],
  ['factory_records:calendar', [
    field('date', 'วันที่'), field('group', 'กลุ่มงาน'), field('period', 'ช่วงเวลา'), field('status', 'สถานะ')
  ]],
  ['factory_records:workSessions', [
    field('startedAt', 'เวลาเริ่ม'), field('endedAt', 'เวลาจบ'), field('group', 'กลุ่มงาน'), field('machineId', 'รหัสเครื่องจักร')
  ]],
  ['factory_records:production', [
    field('date', 'วันที่'), field('group', 'กลุ่มงาน'), field('machineId', 'รหัสเครื่องจักร'),
    field('quantity', 'จำนวนผลิต'), field('waste', 'ของเสีย'), field('goodQuantity', 'จำนวนดี')
  ]],
  ['factory_records:screenEntries', [
    field('date', 'วันที่'), field('group', 'กลุ่มงาน'), field('sheetName', 'รายการงาน'),
    field('quantity', 'จำนวน'), field('waste', 'ของเสีย'), field('goodQuantity', 'จำนวนดี')
  ]],
  ['factory_records:deliveries', [
    field('event_at', 'วันและเวลาขนส่ง', false), field('dateTime', 'วันและเวลาขนส่ง'),
    field('bill_number', 'เลขบิล', false), field('billNumber', 'เลขบิล'), field('product', 'สินค้า'),
    field('quantity', 'จำนวน', false), field('status', 'สถานะ')
  ]],
  ['factory_records:otRequests', [
    field('date', 'วันที่ทำ OT'), field('workDate', 'วันที่ทำ OT'), field('duration_minutes', 'นาทีที่รายงาน', false),
    field('durationMinutes', 'นาทีที่รายงาน'), field('status', 'สถานะรายงาน')
  ]],
  ['factory_screen_work', [
    field('work_date', 'วันที่ทำงาน', false), field('screen_defect_bottles', 'ของเสียสกรีน', false),
    field('production_defect_bottles', 'ของเสียผลิต', false)
  ]],
  ['factory_screen_work_items', [
    field('item_name_snapshot', 'รายการงาน', false), field('pack_count', 'จำนวนแพ็ค', false), field('work_period', 'ช่วงทำงาน', false)
  ]],
  ['factory_production_work', [
    field('work_date', 'วันที่ทำงาน', false), field('quantity', 'จำนวนผลิต', false),
    field('defective', 'ของเสีย', false), field('good_quantity', 'จำนวนดี', false), field('quantity_unit', 'หน่วยนับ', false)
  ]],
  ['registration_requests', [field('status', 'สถานะคำขอ', false)]],
  ['machines', [field('machine_code', 'รหัสเครื่องจักร', false), field('machine_name', 'ชื่อเครื่องจักร', false), field('work_group', 'กลุ่มงาน', false), field('active', 'สถานะใช้งาน', false)]],
  ['item_names', [field('item_name', 'ชื่อรายการ', false), field('active', 'สถานะใช้งาน', false)]]
]);

const SAFE_REASON_TABLES = new Set(['machines', 'item_names']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const validDate = value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const [year,month,day]=value.split('-').map(Number);
  const date=new Date(Date.UTC(year,month-1,day));
  return date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day;
};

export function auditTableLabel(tableName) {
  return TABLE_LABELS.get(tableName) || 'ข้อมูลระบบ';
}

export function auditSafeFields(tableName) {
  return SAFE_FIELDS.get(tableName) || [];
}

export function auditAllowsReason(tableName) {
  return SAFE_REASON_TABLES.has(tableName);
}

export function validateAuditFilters(filters = {}) {
  if (filters.tableName && !TABLE_LABELS.has(filters.tableName)) return { valid:false, code:'TABLE_INVALID' };
  if (filters.action && !['INSERT','UPDATE','DELETE','APPROVE','REJECT','REVIEW','ACTIVATE','DEACTIVATE','GRANT_GROUP','REVOKE_GROUP','APPROVE_REGISTRATION','REJECT_REGISTRATION'].includes(filters.action)) return { valid:false, code:'ACTION_INVALID' };
  if (filters.actorId && !UUID.test(filters.actorId)) return { valid:false, code:'ACTOR_INVALID' };
  if (filters.recordId && !UUID.test(filters.recordId)) return { valid:false, code:'RECORD_INVALID' };
  if ((filters.from && !validDate(filters.from)) || (filters.to && !validDate(filters.to))) return { valid:false, code:'DATE_INVALID' };
  if (filters.from && filters.to && filters.from > filters.to) return { valid:false, code:'DATE_ORDER' };
  return { valid:true };
}

export function buildAuditListParams(filters = {}, { offset = 0, limit = ADMIN_AUDIT_PAGE_SIZE + 1 } = {}) {
  const params = new URLSearchParams({
    select: 'id,actor_employee_id,table_name,record_id,action,created_at',
    order: 'created_at.desc.nullslast,id.desc',
    limit: String(Math.max(1, Math.min(Number(limit) || ADMIN_AUDIT_PAGE_SIZE + 1, ADMIN_AUDIT_PAGE_SIZE + 1))),
    offset: String(Math.max(0, Number(offset) || 0))
  });
  if (filters.tableName && TABLE_LABELS.has(filters.tableName)) params.set('table_name', `eq.${filters.tableName}`);
  if (filters.action && ['INSERT','UPDATE','DELETE','APPROVE','REJECT','REVIEW','ACTIVATE','DEACTIVATE','GRANT_GROUP','REVOKE_GROUP','APPROVE_REGISTRATION','REJECT_REGISTRATION'].includes(filters.action)) params.set('action', `eq.${filters.action}`);
  if (filters.actorId && UUID.test(filters.actorId)) params.set('actor_employee_id', `eq.${filters.actorId}`);
  if (filters.recordId && UUID.test(filters.recordId)) params.set('or', `(id.eq.${filters.recordId},record_id.eq.${filters.recordId})`);
  const fromValid = /^\d{4}-\d{2}-\d{2}$/.test(filters.from || '');
  const toValid = /^\d{4}-\d{2}-\d{2}$/.test(filters.to || '');
  if (fromValid && toValid) {
    const next = new Date(`${filters.to}T00:00:00+07:00`);
    if (!Number.isNaN(next.valueOf())) {
      next.setUTCDate(next.getUTCDate() + 1);
      const exclusiveEnd = next.toISOString();
      params.set('and', `(created_at.gte.${filters.from}T00:00:00+07:00,created_at.lt.${exclusiveEnd})`);
    }
  } else if (fromValid) {
    params.set('created_at', `gte.${filters.from}T00:00:00+07:00`);
  } else if (toValid) {
    const next = new Date(`${filters.to}T00:00:00+07:00`);
    if (!Number.isNaN(next.valueOf())) {
      next.setUTCDate(next.getUTCDate() + 1);
      params.set('created_at', `lt.${next.toISOString()}`);
    }
  }
  return params;
}

export function buildAuditDetailSelect(tableName) {
  const columns = ['id', 'actor_employee_id', 'table_name', 'record_id', 'action', 'created_at'];
  if (auditAllowsReason(tableName)) columns.push('reason');
  for (const item of auditSafeFields(tableName)) {
    for (const [index, path] of item.paths.entries()) {
      const suffix = index ? `_payload` : '';
      columns.push(`old_${item.key}${suffix}:old_value${path}`);
      columns.push(`new_${item.key}${suffix}:new_value${path}`);
    }
  }
  return columns.join(',');
}

export function safeAuditChanges(row, tableName) {
  return auditSafeFields(tableName).flatMap(item => {
    const oldValue = item.paths.map((_, index) => row?.[`old_${item.key}${index ? '_payload' : ''}`]).find(value => value != null);
    const newValue = item.paths.map((_, index) => row?.[`new_${item.key}${index ? '_payload' : ''}`]).find(value => value != null);
    if (oldValue == null && newValue == null) return [];
    if (oldValue != null && newValue != null && String(oldValue) === String(newValue)) return [];
    return [{ label: item.label, oldValue: oldValue ?? '—', newValue: newValue ?? '—' }];
  });
}

export function resolveAuditActor(actorId, employees = []) {
  if (!actorId) return 'ผู้ดำเนินการไม่มีรหัสอ้างอิง';
  const employee = employees.find(row => row?.id === actorId);
  return String(employee?.employee_name || (employee?.employee_code ? `รหัส ${employee.employee_code}` : actorId));
}
