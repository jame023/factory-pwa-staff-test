const ITEM_COLUMNS = 'id,item_name,active,created_at,updated_at';

const fail = (message, code = 'VALIDATION_ERROR', status = 400) => Object.assign(new Error(message), { code, status });
const text = value => typeof value === 'string' ? value.trim() : '';

function apiError(status, payload) {
  const databaseCode = payload?.code;
  let message = payload?.message || payload?.error_description || payload?.error || 'เชื่อมต่อ Supabase ไม่สำเร็จ';
  let code = databaseCode || 'API_ERROR';
  if (status === 401) return Object.assign(new Error('Session หมดอายุ กรุณาเข้าสู่ระบบ LINE อีกครั้ง'), { status, code: 'SESSION_EXPIRED', databaseCode });
  if (databaseCode === '23505' || status === 409) { message = 'มีชื่อรายการนี้แล้ว กรุณาใช้ชื่ออื่น'; code = 'DUPLICATE_RECORD'; }
  else if (databaseCode === '42501' || status === 401 || status === 403) { message = 'ไม่มีสิทธิ์ดำเนินการ'; code = 'PERMISSION_DENIED'; }
  else if (databaseCode === '23514') { message = 'ชื่อรายการหรือสถานะไม่ถูกต้อง'; code = 'VALIDATION_ERROR'; }
  else if (databaseCode === '22023' || databaseCode === '22P02') { message = payload?.message || 'ข้อมูลรายการชื่อไม่ถูกต้อง'; code = 'VALIDATION_ERROR'; }
  return Object.assign(new Error(message), { status, code, databaseCode });
}

function cleanInput(input) {
  const payload = { item_name: text(input?.item_name), active: input?.active };
  if (!payload.item_name || payload.item_name.length > 240) throw fail('กรุณาระบุชื่อรายการไม่เกิน 240 ตัวอักษร');
  if (typeof payload.active !== 'boolean') throw fail('กรุณาระบุสถานะใช้งาน');
  return payload;
}

export function createSupabaseItemNameRepository({ supabaseUrl, publishableKey, accessToken, user }) {
  if (!supabaseUrl || !publishableKey || !accessToken) throw fail('Supabase session ยังไม่พร้อมใช้งาน', 'AUTH_REQUIRED', 401);
  const base = String(supabaseUrl).replace(/\/$/, '');
  const headers = Object.freeze({ apikey: publishableKey, Authorization: `Bearer ${accessToken}`, Accept: 'application/json', 'Content-Type': 'application/json' });

  async function request(path, options = {}) {
    let response;
    try { response = await fetch(`${base}${path}`, { ...options, headers: { ...headers, ...(options.headers || {}) } }); }
    catch (error) { throw Object.assign(new Error('ติดต่อ Supabase ไม่สำเร็จ กรุณาตรวจเครือข่ายแล้วลองอีกครั้ง'), { cause: error, code: 'NETWORK_ERROR' }); }
    const raw = await response.text();
    let payload = null;
    try { payload = raw ? JSON.parse(raw) : null; } catch (_) { payload = raw; }
    if (!response.ok) throw apiError(response.status, payload);
    return payload;
  }

  function mutate(action, id = null, input = null, items = null, reason = '') {
    const cleanReason = text(reason);
    if (cleanReason && (cleanReason.length < 3 || cleanReason.length > 300)) throw fail('เหตุผลต้องมีความยาว 3 ถึง 300 ตัวอักษร');
    return request('/rest/v1/rpc/admin_item_name_mutation', { method: 'POST', body: JSON.stringify({ p_action: action, p_id: id, p_input: input, p_items: items, p_reason: cleanReason }) });
  }

  return Object.freeze({
    isLiveSupabase: true, user,
    async listItems(filters = {}) {
      const params = new URLSearchParams({ select: ITEM_COLUMNS, order: 'item_name.asc,id.asc' });
      if (filters.active === true || filters.active === false) params.set('active', `eq.${filters.active}`);
      const term = text(filters.search).replace(/[,*()]/g, '');
      if (term) params.set('item_name', `ilike.*${term}*`);
      const rows = await request(`/rest/v1/item_names?${params.toString()}`);
      if (!Array.isArray(rows)) throw fail('รูปแบบข้อมูลรายการชื่อจาก Supabase ไม่ถูกต้อง', 'INVALID_RESPONSE', 502);
      return rows;
    },
    async getItemById(id) {
      if (!id) throw fail('กรุณาระบุรายการชื่อ');
      const rows = await request(`/rest/v1/item_names?${new URLSearchParams({ select: ITEM_COLUMNS, id: `eq.${id}`, limit: '1' }).toString()}`);
      if (!Array.isArray(rows)) throw fail('รูปแบบข้อมูลรายการชื่อจาก Supabase ไม่ถูกต้อง', 'INVALID_RESPONSE', 502);
      return rows[0] || null;
    },
    createItem(input, reason = '') { return mutate('INSERT', null, cleanInput(input), null, reason); },
    updateItem(id, input, reason = '') { if (!id) throw fail('กรุณาระบุรายการชื่อ'); return mutate('UPDATE', id, cleanInput(input), null, reason); },
    async setItemActive(id, active, reason = '') {
      if (!id || typeof active !== 'boolean') throw fail('สถานะรายการไม่ถูกต้อง');
      const current = await this.getItemById(id);
      if (!current) throw fail('ไม่พบรายการชื่อ', 'NOT_FOUND', 404);
      return mutate(active ? 'ACTIVATE' : 'DEACTIVATE', id, null, null, reason);
    },
    // Audit rows are written atomically by admin_item_name_mutation. This contract
    // delegates supported changes to that RPC and never accepts a client actor id.
    createAuditLog(input) {
      const action = input?.action, reason = input?.reason || '';
      if (action === 'INSERT') return this.createItem(input?.new_value, reason);
      if (action === 'UPDATE') return this.updateItem(input?.record_id, input?.new_value, reason);
      if (action === 'ACTIVATE') return this.setItemActive(input?.record_id, true, reason);
      if (action === 'DEACTIVATE') return this.setItemActive(input?.record_id, false, reason);
      throw fail('ไม่อนุญาตให้สร้าง Audit Log แยกจากการเปลี่ยนแปลงรายการชื่อ');
    },
    async listAuditLogs({ record_id, action } = {}) {
      const params = new URLSearchParams({ select: 'id,actor_employee_id,table_name,record_id,action,old_value,new_value,reason,created_at', table_name: 'eq.item_names', order: 'created_at.desc' });
      if (record_id) params.set('record_id', `eq.${record_id}`);
      if (action) params.set('action', `eq.${action}`);
      const rows = await request(`/rest/v1/audit_logs?${params.toString()}`);
      if (!Array.isArray(rows)) throw fail('รูปแบบ Audit Log จาก Supabase ไม่ถูกต้อง', 'INVALID_RESPONSE', 502);
      return rows;
    },
  });
}
