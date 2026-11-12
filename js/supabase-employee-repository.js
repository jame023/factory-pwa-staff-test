const EMPLOYEE_COLUMNS = 'id,line_user_id,line_display_name,employee_name,employee_code,main_group,active,registered_at,updated_at,created_by,updated_by';
const GROUP_COLUMNS = 'id,employee_id,group_name,active,created_at,updated_at';
const AUDIT_COLUMNS = 'id,actor_employee_id,table_name,record_id,action,old_value,new_value,reason,created_at';
export const STANDARD_GROUPS = Object.freeze(['ออฟฟิศ', 'สกรีน', 'ผลิต', 'ขนส่ง', 'ผู้บริหาร', 'Admin']);

const text = value => typeof value === 'string' ? value.trim() : '';
const fail = (message, code = 'API_ERROR', status = 400) => Object.assign(new Error(message), { code, status });

function apiError(status, payload) {
  const databaseCode = payload?.code;
  let message = payload?.message || payload?.error_description || payload?.error || 'เชื่อมต่อ Supabase ไม่สำเร็จ';
  let code = databaseCode || 'API_ERROR';
  if (status === 401) return Object.assign(new Error('Session หมดอายุ กรุณาเข้าสู่ระบบ LINE อีกครั้ง'), { status, code: 'SESSION_EXPIRED', databaseCode });
  if (databaseCode === '23505' || status === 409) { message = 'พบข้อมูลซ้ำ ไม่สามารถบันทึกซ้ำได้'; code = 'DUPLICATE_RECORD'; }
  else if (databaseCode === '42501' || status === 401 || status === 403) { message = 'ไม่มีสิทธิ์ดำเนินการ'; code = 'PERMISSION_DENIED'; }
  else if (databaseCode === '23514') { message = 'ข้อมูลไม่ถูกต้องหรือไม่อยู่ในรายการมาตรฐาน'; code = 'VALIDATION_ERROR'; }
  else if (databaseCode === 'P0001' || databaseCode === 'P0002') code = databaseCode;
  return Object.assign(new Error(message), { status, code, databaseCode });
}

function cleanEmployee(input) {
  const payload = {
    line_user_id: text(input?.line_user_id) || null,
    line_display_name: text(input?.line_display_name),
    employee_name: text(input?.employee_name),
    employee_code: text(input?.employee_code) || null,
    main_group: text(input?.main_group),
    active: input?.active,
  };
  if (!payload.employee_name) throw fail('กรุณาระบุชื่อพนักงาน', 'VALIDATION_ERROR');
  if (!STANDARD_GROUPS.includes(payload.main_group)) throw fail('กรุณาเลือกกลุ่มงานหลักจากรายการมาตรฐาน', 'VALIDATION_ERROR');
  if (typeof payload.active !== 'boolean') throw fail('กรุณาระบุสถานะบัญชี', 'VALIDATION_ERROR');
  return payload;
}

export function createSupabaseEmployeeRepository({ supabaseUrl, publishableKey, accessToken, user }) {
  if (!supabaseUrl || !publishableKey || !accessToken) throw fail('Supabase session ยังไม่พร้อมใช้งาน', 'AUTH_REQUIRED', 401);
  if (!['admin','executive'].includes(user?.role) || user?.active === false) throw fail('ไม่มีสิทธิ์ดำเนินการ', 'PERMISSION_DENIED', 403);
  const base = String(supabaseUrl).replace(/\/$/, '');
  const headers = Object.freeze({ apikey: publishableKey, Authorization: `Bearer ${accessToken}`, Accept: 'application/json', 'Content-Type': 'application/json' });

  async function request(path, options = {}) {
    let response;
    try {
      response = await fetch(`${base}${path}`, { ...options, headers: { ...headers, ...(options.headers || {}) } });
    } catch (error) {
      throw Object.assign(new Error('ติดต่อ Supabase ไม่สำเร็จ กรุณาตรวจเครือข่ายแล้วลองอีกครั้ง'), { cause: error, code: 'NETWORK_ERROR' });
    }
    const raw = await response.text();
    let payload = null;
    try { payload = raw ? JSON.parse(raw) : null; } catch (_) { payload = raw; }
    if (!response.ok) throw apiError(response.status, payload);
    return payload;
  }

  const list = async path => {
    const value = await request(path);
    if (!Array.isArray(value)) throw fail('รูปแบบข้อมูลจาก Supabase ไม่ถูกต้อง', 'INVALID_RESPONSE', 502);
    return value;
  };

  async function employeeMutation(action, input, reason) {
    if (!text(reason)) throw fail('กรุณาระบุเหตุผลการแก้ไข', 'VALIDATION_ERROR');
    const value = await request('/rest/v1/rpc/admin_employee_mutation', {
      method: 'POST',
      body: JSON.stringify({ p_action: action, p_input: input, p_reason: text(reason) }),
    });
    return value?.employee || value;
  }

  return Object.freeze({
    isLiveSupabase: true,
    user,
    async listEmployees({ includeInactive = false } = {}) {
      const params = new URLSearchParams({ select: EMPLOYEE_COLUMNS, order: 'employee_name.asc' });
      if (!includeInactive) params.set('active', 'eq.true');
      return list(`/rest/v1/employees?${params.toString()}`);
    },
    async getEmployeeById(id) {
      if (!id) throw fail('กรุณาระบุพนักงาน', 'VALIDATION_ERROR');
      const params = new URLSearchParams({ select: EMPLOYEE_COLUMNS, id: `eq.${id}`, limit: '1' });
      return (await list(`/rest/v1/employees?${params.toString()}`))[0] || null;
    },
    async listEmployeeGroups(employeeId) {
      if (!employeeId) throw fail('กรุณาระบุพนักงาน', 'VALIDATION_ERROR');
      const params = new URLSearchParams({ select: GROUP_COLUMNS, employee_id: `eq.${employeeId}`, order: 'group_name.asc' });
      return list(`/rest/v1/employee_groups?${params.toString()}`);
    },
    async listAllEmployeeGroups(employeeId = null) {
      const params = new URLSearchParams({ select: GROUP_COLUMNS, order: 'group_name.asc' });
      if (employeeId) params.set('employee_id', `eq.${employeeId}`);
      return list(`/rest/v1/employee_groups?${params.toString()}`);
    },
    async createEmployee(input, reason = '') { return employeeMutation('INSERT', cleanEmployee(input), reason); },
    async updateEmployee(id, input, reason = '') {
      if (!id) throw fail('ไม่พบพนักงานที่ต้องการแก้ไข', 'NOT_FOUND', 404);
      return employeeMutation('UPDATE', { id, ...cleanEmployee(input) }, reason);
    },
    async setEmployeeActive(id, active, reason = '') {
      if (!id || typeof active !== 'boolean') throw fail('สถานะบัญชีไม่ถูกต้อง', 'VALIDATION_ERROR');
      return employeeMutation(active ? 'ACTIVATE' : 'DEACTIVATE', { id, active }, reason);
    },
    async updateEmployeeMainGroup(employeeId, mainGroup, reason = '') {
      const current = await this.getEmployeeById(employeeId);
      if (!current) throw fail('ไม่พบพนักงาน', 'NOT_FOUND', 404);
      const currentGroups = (await this.listEmployeeGroups(employeeId)).filter(row => row.active).map(row => row.group_name);
      return this.replaceEmployeeGroups(employeeId, currentGroups, mainGroup, reason);
    },
    async replaceEmployeeGroups(employeeId, groups, mainGroup, reason = '') {
      const selected = Array.isArray(groups) ? groups.map(text) : [];
      if (!employeeId || !selected.length || selected.some(group => !STANDARD_GROUPS.includes(group)) || new Set(selected).size !== selected.length) {
        throw fail('รายการกลุ่มงานไม่ถูกต้องหรือมีรายการซ้ำ', selected.length !== new Set(selected).size ? 'DUPLICATE_RECORD' : 'VALIDATION_ERROR');
      }
      if (!selected.includes(text(mainGroup))) throw fail('กลุ่มงานหลักต้องอยู่ในสิทธิ์ที่เลือก', 'MAIN_GROUP_REQUIRED');
      if (text(reason).length < 3 || text(reason).length > 300) throw fail('เหตุผลต้องมีความยาว 3 ถึง 300 ตัวอักษร', 'VALIDATION_ERROR');
      return request('/rest/v1/rpc/admin_replace_employee_groups', {
        method: 'POST',
        body: JSON.stringify({ p_employee_id: employeeId, p_groups: selected, p_main_group: text(mainGroup), p_reason: text(reason) }),
      });
    },
    async listAuditLogs(filters = {}) {
      const params = new URLSearchParams({ select: AUDIT_COLUMNS, order: 'created_at.desc' });
      if (filters.table_name) params.set('table_name', `eq.${filters.table_name}`);
      if (filters.record_id) params.set('record_id', `eq.${filters.record_id}`);
      if (filters.action) params.set('action', `eq.${filters.action}`);
      return list(`/rest/v1/audit_logs?${params.toString()}`);
    },
    async createAuditLog() {
      throw fail('Audit Log ต้องถูกสร้างโดย RPC ของการแก้ไขข้อมูล ไม่อนุญาตให้เขียนแยกจากรายการ', 'AUDIT_GATEWAY_REQUIRED', 400);
    },
  });
}
