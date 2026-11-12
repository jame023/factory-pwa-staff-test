const MACHINE_COLUMNS = 'id,machine_code,machine_name,work_group,active,display_order,created_at,updated_at';
const GROUPS = Object.freeze(['สกรีน', 'ผลิต', 'ขนส่ง', 'ออฟฟิศ', 'ผู้บริหาร', 'Admin']);

const fail = (message, code = 'VALIDATION_ERROR', status = 400) => Object.assign(new Error(message), { code, status });
const text = value => typeof value === 'string' ? value.trim() : '';

function apiError(status, payload) {
  const databaseCode = payload?.code;
  let message = payload?.message || payload?.error_description || payload?.error || 'เชื่อมต่อ Supabase ไม่สำเร็จ';
  let code = databaseCode || 'API_ERROR';
  if (status === 401) return Object.assign(new Error('Session หมดอายุ กรุณาเข้าสู่ระบบ LINE อีกครั้ง'), { status, code: 'SESSION_EXPIRED', databaseCode });
  if (databaseCode === '23505' || status === 409) {
    message = 'พบรหัสเครื่องซ้ำ กรุณาใช้รหัสเครื่องอื่น';
    code = 'DUPLICATE_RECORD';
  } else if (databaseCode === '42501' || status === 401 || status === 403) {
    message = 'ไม่มีสิทธิ์ดำเนินการ';
    code = 'PERMISSION_DENIED';
  } else if (databaseCode === '23514') {
    message = 'กลุ่มงานไม่ถูกต้อง กรุณาเลือกกลุ่มงานมาตรฐาน';
    code = 'VALIDATION_ERROR';
  } else if (databaseCode === '22023' || databaseCode === '22P02') {
    message = payload?.message || 'ข้อมูลเครื่องจักรไม่ถูกต้อง';
    code = 'VALIDATION_ERROR';
  }
  return Object.assign(new Error(message), { status, code, databaseCode });
}

function cleanInput(input) {
  const displayOrder = Number(input?.display_order);
  const active = input?.active;
  const payload = {
    machine_code: text(input?.machine_code),
    machine_name: text(input?.machine_name),
    work_group: text(input?.work_group),
    display_order: displayOrder,
    active,
  };
  if (!payload.machine_code) throw fail('กรุณาระบุรหัสเครื่อง');
  if (!payload.machine_name) throw fail('กรุณาระบุชื่อเครื่อง');
  if (!GROUPS.includes(payload.work_group)) throw fail('กรุณาเลือกกลุ่มงานมาตรฐาน');
  if (!Number.isSafeInteger(displayOrder) || displayOrder < 0) throw fail('ลำดับแสดงผลต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป');
  if (typeof active !== 'boolean') throw fail('กรุณาระบุสถานะใช้งาน');
  return payload;
}

export function createSupabaseMachineRepository({ supabaseUrl, publishableKey, accessToken, user }) {
  if (!supabaseUrl || !publishableKey || !accessToken) throw fail('Supabase session ยังไม่พร้อมใช้งาน', 'AUTH_REQUIRED', 401);
  const base = String(supabaseUrl).replace(/\/$/, '');
  const headers = Object.freeze({
    apikey: publishableKey,
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  });

  async function request(path, options = {}) {
    let response;
    try {
      response = await fetch(`${base}${path}`, {
        ...options,
        headers: { ...headers, ...(options.headers || {}) },
      });
    } catch (error) {
      throw Object.assign(new Error('ติดต่อ Supabase ไม่สำเร็จ กรุณาตรวจเครือข่ายแล้วลองอีกครั้ง'), { cause: error, code: 'NETWORK_ERROR' });
    }
    const raw = await response.text();
    let payload = null;
    try { payload = raw ? JSON.parse(raw) : null; } catch (_) { payload = raw; }
    if (!response.ok) throw apiError(response.status, payload);
    return payload;
  }

  async function mutate(action, id = null, input = null, items = null, reason = '') {
    if (reason && (text(reason).length < 3 || text(reason).length > 300)) throw fail('เหตุผลต้องมีความยาว 3 ถึง 300 ตัวอักษร');
    return request('/rest/v1/rpc/admin_machine_mutation', {
      method: 'POST',
      body: JSON.stringify({ p_action: action, p_id: id, p_input: input, p_items: items, p_reason: text(reason) }),
    });
  }

  return Object.freeze({
    isLiveSupabase: true,
    user,

    async listMachines(filters = {}) {
      const params = new URLSearchParams({ select: MACHINE_COLUMNS, order: 'display_order.asc,machine_code.asc' });
      if (filters.work_group) params.set('work_group', `eq.${filters.work_group}`);
      if (filters.active === true || filters.active === false) params.set('active', `eq.${filters.active}`);
      const term = text(filters.machine_name || filters.search);
      if (term) params.set('machine_name', `ilike.*${term.replace(/[,*()]/g, '')}*`);
      const code = text(filters.machine_code);
      if (code) params.set('machine_code', `ilike.*${code.replace(/[,*()]/g, '')}*`);
      const rows = await request(`/rest/v1/machines?${params.toString()}`);
      if (!Array.isArray(rows)) throw fail('รูปแบบข้อมูลเครื่องจักรจาก Supabase ไม่ถูกต้อง', 'INVALID_RESPONSE', 502);
      return rows;
    },

    async getMachineById(id) {
      if (!id) throw fail('กรุณาระบุเครื่องจักร');
      const params = new URLSearchParams({ select: MACHINE_COLUMNS, id: `eq.${id}`, limit: '1' });
      const rows = await request(`/rest/v1/machines?${params.toString()}`);
      if (!Array.isArray(rows)) throw fail('รูปแบบข้อมูลเครื่องจักรจาก Supabase ไม่ถูกต้อง', 'INVALID_RESPONSE', 502);
      return rows[0] || null;
    },

    async createMachine(input, reason = '') {
      return mutate('INSERT', null, cleanInput(input), null, reason);
    },

    async updateMachine(id, input, reason = '') {
      if (!id) throw fail('กรุณาระบุเครื่องจักร');
      return mutate('UPDATE', id, cleanInput(input), null, reason);
    },

    async setMachineActive(id, active, reason = '') {
      if (!id || typeof active !== 'boolean') throw fail('สถานะเครื่องจักรไม่ถูกต้อง');
      const current = await this.getMachineById(id);
      if (!current) throw fail('ไม่พบเครื่องจักร', 'NOT_FOUND', 404);
      return mutate(active ? 'ACTIVATE' : 'DEACTIVATE', id, current, null, reason);
    },

    async reorderMachines(items, reason = '') {
      if (!Array.isArray(items) || items.some(item => !item?.id || !Number.isSafeInteger(Number(item.display_order)) || Number(item.display_order) < 0)) {
        throw fail('รายการลำดับเครื่องจักรไม่ถูกต้อง');
      }
      return mutate('REORDER', null, null, items.map(item => ({ id: item.id, display_order: Number(item.display_order) })), reason);
    },

    // Auditing is coupled to each mutation RPC in PostgreSQL. This contract
    // accepts only auditable machine commands and delegates to that same RPC;
    // clients cannot submit free-form audit rows or actor IDs.
    async createAuditLog(input) {
      const action = input?.action;
      const reason = input?.reason || '';
      if (action === 'INSERT') return this.createMachine(input?.new_value, reason);
      if (action === 'UPDATE') return this.updateMachine(input?.record_id, input?.new_value, reason);
      if (action === 'ACTIVATE') return this.setMachineActive(input?.record_id, true, reason);
      if (action === 'DEACTIVATE') return this.setMachineActive(input?.record_id, false, reason);
      throw fail('ไม่อนุญาตให้สร้าง Audit Log แยกจากการเปลี่ยนแปลงเครื่องจักร');
    },

    async listAuditLogs({ record_id, action } = {}) {
      const params = new URLSearchParams({
        select: 'id,actor_employee_id,table_name,record_id,action,old_value,new_value,reason,created_at',
        table_name: 'eq.machines',
        order: 'created_at.desc',
      });
      if (record_id) params.set('record_id', `eq.${record_id}`);
      if (action) params.set('action', `eq.${action}`);
      const rows = await request(`/rest/v1/audit_logs?${params.toString()}`);
      if (!Array.isArray(rows)) throw fail('รูปแบบ Audit Log จาก Supabase ไม่ถูกต้อง', 'INVALID_RESPONSE', 502);
      return rows;
    },
  });
}

