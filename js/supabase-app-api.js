import { createLeaveService } from './leave-service.js?v=1.3.324';
import { createOtService } from './ot-service.js?v=1.3.320';
import { createDeliveryService } from './delivery-service.js?v=1.3.269';
import { validateLeaveSubmission, storedLeaveItems } from './leave-rules.js?v=1.3.186';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js?v=1.3.327';

import { RECORD_SCHEMAS, validateRecord } from './record-schema.js?v=1.3.186';
import { bangkokToday } from './utils.js?v=1.3.186';
import { getSupabaseLineAccessToken } from './auth.js?v=1.3.205';
import { normalizeExecutiveAttendanceRows, summarizeExecutiveAttendance, validateAttendanceRange } from './executive-attendance-rules.js?v=1.3.316';
import { ADMIN_AUDIT_PAGE_SIZE, buildAuditDetailSelect, buildAuditListParams, auditAllowsReason, resolveAuditActor, safeAuditChanges, validateAuditFilters } from './admin-audit-contract.js?v=1.3.327';

const CATEGORIES = new Set(['attendance','workSessions','leaveRequests','calendar','deliveries','production','screenEntries','otRequests']);
const GENERIC_ADMIN_WRITE_BLOCKED = new Set(['workSessions','leaveRequests','deliveries','production','screenEntries','otRequests']);
const GROUP_BY_CATEGORY = { screenEntries:'สกรีน', production:'ผลิต', deliveries:'ขนส่ง' };
const fail = (message, code='API_ERROR') => Object.assign(new Error(message), { code });
const canonical = value => value === 'ออฟฟิต' ? 'ออฟฟิศ' : value;
const safeJson = async response => {
  const raw = await response.text();
  let data = null; try { data = raw ? JSON.parse(raw) : null; } catch (_) {}
  if (!response.ok) {
    if (response.status === 401) throw fail('Session หมดอายุ กรุณาเข้าสู่ระบบ LINE อีกครั้ง','SESSION_EXPIRED');
    if (response.status === 403) throw fail('ไม่มีสิทธิ์ดำเนินการ','PERMISSION_DENIED');
    if (data?.code === '42501') throw fail('ไม่มีสิทธิ์ดูรายงานผู้บริหาร','PERMISSION_DENIED');
    if (data?.code === '22023' && String(data?.message || '').includes('ATTENDANCE_RANGE_TOO_LARGE'))
      throw fail('ช่วงวันที่กว้างเกิน 366 วัน กรุณาเลือกช่วงที่แคบลง','RANGE_TOO_LARGE');
    if (data?.code === '22023' && String(data?.message || '').includes('ATTENDANCE_RANGE_INVALID'))
      throw fail('ช่วงวันที่ไม่ถูกต้อง','RANGE_INVALID');
    if (data?.code === '22023' && String(data?.message || '').includes('OT_INVALID_HISTORY_FILTER'))
      throw fail('ตัวกรองรายงาน OT ไม่ถูกต้อง หรือช่วงวันที่กว้างเกิน 366 วัน','OT_FILTER_INVALID');
    if (data?.code === '22023' && String(data?.message || '').includes('OT_DATA_ANOMALY'))
      throw fail('พบข้อมูล OT เก่าหรือข้อมูลระยะเวลาที่ไม่ตรงกัน ระบบหยุดสรุปเพื่อไม่แสดงยอดคลาดเคลื่อน','OT_DATA_ANOMALY');
    if (data?.code === '22023' && String(data?.message || '').includes('LEAVE_REPORT_RANGE_TOO_LARGE'))
      throw fail('ช่วงวันที่กว้างเกิน 366 วัน กรุณาเลือกช่วงให้แคบลง','RANGE_TOO_LARGE');
    if (data?.code === '22023' && String(data?.message || '').includes('LEAVE_REPORT_RANGE_INVALID'))
      throw fail('ช่วงวันที่ไม่ถูกต้อง กรุณาตรวจวันเริ่มและวันสิ้นสุด','RANGE_INVALID');
    if (data?.code === '22023' && String(data?.message || '').includes('LEAVE_STATUS_ANOMALY'))
      throw fail('พบสถานะคำขอลาที่ไม่ตรงกับ Contract ระบบหยุดแสดงผลเพื่อให้ตรวจสอบข้อมูล','DATA_ANOMALY');
    if (data?.code === '22023' && String(data?.message || '').includes('LEAVE_REPORT_FILTER_INVALID'))
      throw fail('ตัวกรองรายงานการลาไม่ถูกต้อง','VALIDATION_ERROR');
    if (data?.code === '22023' && String(data?.message || '').includes('LEAVE_MANAGER_FILTER_INVALID'))
      throw fail('ตัวกรองรายการคำขอลาไม่ถูกต้อง','VALIDATION_ERROR');
    if (data?.code === '22023' && String(data?.message || '').includes('LEAVE_REPORT_OVERLAP'))
      throw fail('พบวันลาที่มีคำขอซ้อนกัน ยอดวันลาอนุมัติจึงยังไม่แสดง','DATA_ANOMALY');
    if (data?.code === 'P0002' && String(data?.message || '').includes('OT_NOT_FOUND'))
      throw fail('ไม่พบรายงาน OT หรือไม่มีสิทธิ์เปิดรายการนี้','NOT_FOUND');
    if (data?.code === '54000' && String(data?.message || '').includes('ATTENDANCE_RESULT_TOO_LARGE'))
      throw fail('ช่วงนี้มีรายการลงเวลาเกิน 1,000 รายการ กรุณาเลือกช่วงวันที่แคบลง','TOO_MANY_ATTENDANCE_ROWS');
    if (data?.code === 'PGRST202' && String(data?.message || '').includes('factory_attendance_manager_dashboard'))
      throw fail('ยังไม่ได้ติดตั้ง RPC รายงานเวลาสำหรับผู้บริหารบน Supabase','BACKEND_NOT_READY');
    if (data?.code === 'PGRST202' && String(data?.message || '').includes('ot_report_manager_dashboard'))
      throw fail('รายงาน OT สำหรับผู้บริหารยังไม่ได้ติดตั้งบน Supabase','BACKEND_NOT_READY');
    if (data?.code === 'PGRST202' && String(data?.message || '').includes('ot_report_detail_manager'))
      throw fail('รายละเอียดรายงาน OT สำหรับผู้บริหารยังไม่ได้ติดตั้งบน Supabase','BACKEND_NOT_READY');
    if (data?.code === 'PGRST202') throw fail('ระบบเริ่ม–จบงานยังไม่ได้ติดตั้งบน Supabase','BACKEND_NOT_READY');
    if (data?.code === '40001' || String(data?.message || '').includes('SCREEN_WORK_STALE_VERSION'))
      throw fail('งานถูกเปลี่ยนแปลง กรุณาโหลดข้อมูลล่าสุดก่อนแก้ไข','CONFLICT');
    if (data?.code === 'P0001' || String(data?.message || '').includes('WORK_SESSION_END_CONFLICT') || String(data?.message || '').includes('WORK_SESSION_IDEMPOTENCY_CONFLICT'))
      throw fail('ข้อมูลการทำงานเปลี่ยนไปแล้ว กรุณาโหลดสถานะล่าสุด','CONFLICT');
    if (String(data?.message || '').includes('WORK_SESSION_ALREADY_ACTIVE_OR_MACHINE_BUSY'))
      throw fail('มีงานที่กำลังทำอยู่หรือเครื่องนี้ถูกใช้งานแล้ว กรุณาโหลดสถานะใหม่','WORK_SESSION_BUSY');
    if (String(data?.message || '').includes('WORK_SESSION_MACHINE_UNAVAILABLE') || String(data?.message || '').includes('WORK_SESSION_ITEM_UNAVAILABLE'))
      throw fail('ข้อมูลเครื่องจักรหรือรายการเปลี่ยนแปลง กรุณาโหลดใหม่','OPTIONS_CHANGED');
    if (String(data?.message || '').includes('PRODUCTION_MACHINE_UNAVAILABLE'))
      throw fail('เครื่องจักรถูกปิดหรือเปลี่ยนสิทธิ์ กรุณาโหลดตัวเลือกใหม่และเลือกเครื่องอีกครั้ง','OPTIONS_CHANGED');
    if (String(data?.message || '').includes('WORK_SESSION_NOT_FOUND')) throw fail('ไม่พบงานที่กำลังทำอยู่','NOT_FOUND');
    if (data?.code === '23505') throw fail('พบข้อมูลซ้ำ ไม่สามารถบันทึกซ้ำได้','DUPLICATE_RECORD');
    if (response.status >= 400 && response.status < 500) throw fail('ข้อมูลไม่ผ่านการตรวจสอบจากระบบ กรุณาตรวจข้อมูลก่อนส่งใหม่','REQUEST_REJECTED');
    throw fail(data?.code === '42501' ? 'ไม่มีสิทธิ์ดำเนินการ' : 'บันทึกหรืออ่านข้อมูลไม่สำเร็จ กรุณาลองใหม่','API_ERROR');
  }
  return data;
};

export function createSupabaseAppApi() {
  const token = getSupabaseLineAccessToken();
  if (!token) throw fail('กรุณาเข้าสู่ระบบ LINE ใหม่','SESSION_EXPIRED');
  const base = SUPABASE_URL.replace(/\/$/,'');
  let leaveApi, otApi, deliveryApi;
  const leave = () => leaveApi ||= createLeaveService({url:base,key:SUPABASE_PUBLISHABLE_KEY,token,getToken:getSupabaseLineAccessToken});
  const overtime = () => otApi ||= createOtService({url:base,key:SUPABASE_PUBLISHABLE_KEY,token,getToken:getSupabaseLineAccessToken});
  const delivery = () => deliveryApi ||= createDeliveryService({url:base,key:SUPABASE_PUBLISHABLE_KEY,token,getToken:getSupabaseLineAccessToken});
  async function call(path, init={}) {
    let response;
    try { response = await fetch(base + path, { ...init, cache:'no-store', redirect:'error', headers:{
      apikey:SUPABASE_PUBLISHABLE_KEY, Authorization:`Bearer ${token}`, Accept:'application/json',
      ...(init.body ? {'Content-Type':'application/json'} : {}), ...(init.headers || {})
    }}); } catch (error) {
      if (init.signal?.aborted || error?.name === 'AbortError') throw error;
      throw Object.assign(fail('เชื่อมต่อ Supabase ไม่ได้ กรุณาตรวจอินเทอร์เน็ต','NETWORK_ERROR'),{cause:error});
    }
    return safeJson(response);
  }
    const claims = JSON.parse(decodeURIComponent(Array.from(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(token.split('.')[1].length/4)*4,'='))).map(c=>'%'+c.charCodeAt(0).toString(16).padStart(2,'0')).join('')));
  const userId = async () => {
    if (!claims?.app_metadata?.employee_id || !['admin','employee','executive'].includes(claims.app_metadata.role)) throw fail('สิทธิ์บัญชีไม่ถูกต้อง','PERMISSION_DENIED');
    return claims.app_metadata.employee_id;
  };const rowMap = row => ({ ...row.payload, startedAt:row.payload?.startedAt || (row.category==='workSessions' ? row.created_at : undefined), id:row.id, employeeId:row.owner_id, group:row.group_name, createdAt:row.created_at, updatedAt:row.updated_at, employee:row.payload.employee || row.payload.operator || row.payload.sender || row.payload.operatorName });
  async function rows(category, filters={}) {
    if (!CATEGORIES.has(category)) throw fail('ไม่พบหมวดข้อมูล','VALIDATION_ERROR');
    const params = new URLSearchParams({select:'id,category,owner_id,group_name,payload,created_at,updated_at',category:`eq.${category}`,order:'created_at.desc',limit:'1000',...filters});
    return (await call('/rest/v1/factory_records?'+params)).map(rowMap);
  }
  async function allRows(category, filters={}) {
    const result=[];
    for (let offset=0;;offset+=1000) {
      const page=await rows(category,{...filters,order:'created_at.desc,id.desc',limit:'1000',offset:String(offset)});
      result.push(...page);
      if(page.length<1000)return result;
    }
  }
function normalizeImages(images) {
    if (!Array.isArray(images) || images.length > 10) throw fail('แนบรูปได้ไม่เกิน 10 รูป','VALIDATION_ERROR');
    let total = 0;
    return images.map(image => {
      if (!image || typeof image !== 'object' || typeof image.dataUrl !== 'string' ||
          !/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$/.test(image.dataUrl) ||
          image.dataUrl.length > 1450000) throw fail('รูปแนบไม่ถูกต้องหรือมีขนาดใหญ่เกินกำหนด','VALIDATION_ERROR');
      const mimeType = image.dataUrl.slice(5,image.dataUrl.indexOf(';'));
      const bytes = Math.floor((image.dataUrl.length - image.dataUrl.indexOf(',') - 1) * 3 / 4);
      total += bytes;
      if (total > 2 * 1024 * 1024) throw fail('รูปแนบรวมต้องไม่เกิน 2 MB','VALIDATION_ERROR');
      return {name:String(image.name||'รูปแนบ').slice(0,120),mimeType,size:Number(image.size)||bytes,dataUrl:image.dataUrl};
    });
  }
  async function verifySaved(row) {
    if (!row?.id) throw fail('ยังยืนยันผลการบันทึกไม่ได้','INCOMPLETE_WRITE');
    const params = new URLSearchParams({select:'*', id:`eq.${row.id}`, category:`eq.${row.category}`});
    const [saved] = await call('/rest/v1/factory_records?'+params);
    if (!saved || saved.updated_at !== row.updated_at || JSON.stringify(saved.payload) !== JSON.stringify(row.payload))
      throw fail('บันทึกแล้วแต่ตรวจข้อมูลกลับไม่สำเร็จ กรุณาตรวจรายการก่อนบันทึกซ้ำ','INCOMPLETE_WRITE');
    // The database audit trigger commits atomically with every record mutation.
    if (claims.app_metadata.role === 'admin') {
      const audit = new URLSearchParams({select:'id',record_id:`eq.${row.id}`,table_name:`eq.factory_records:${row.category}`,limit:'1'});
      const logs = await call('/rest/v1/audit_logs?'+audit);
      if (!logs?.length) throw fail('ยังตรวจสอบประวัติการบันทึกไม่สำเร็จ','INCOMPLETE_AUDIT');
    }
    return rowMap(saved);
  }
  async function insert(category, values, groupName=null, ownerId=null) {
    const id = await userId();
    const requestId = category==='production' ? String(values.requestId || '') : '';
    if(category==='production' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId))
      throw fail('รหัสคำขอบันทึกผลิตไม่ถูกต้อง','VALIDATION_ERROR');
    const productionMachineId=category==='production'?String(values.machineId||values.machine||''):'';
    if(category==='production' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(productionMachineId))
      throw fail('กรุณาเลือกเครื่องจักรจากรายการล่าสุด','VALIDATION_ERROR');
let normalized;
    try{
      normalized = category === 'leaveRequests' && Array.isArray(values.leaveItems)
        ? {...validateRecord(category,{...values,period:'เต็มวัน'}),period:values.period,leaveItems:values.leaveItems,totalDays:values.totalDays,attachments:values.attachments,hasMedicalCertificate:values.hasMedicalCertificate}
        : validateRecord(category, category === 'otRequests' ? {...values,photo:''} : values);
    }catch(error){throw fail(error.message||'ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบก่อนบันทึก','VALIDATION_ERROR');}
    if (category === 'deliveries') {
      const bill = String(values.billNumber || '').trim().toUpperCase();
      if (!/^SD[0-9]{9}$/.test(bill)) throw fail('เลขที่บิลต้องเป็น SD ตามด้วยตัวเลข 9 หลัก','VALIDATION_ERROR');
      normalized.billNumber = bill;
    }
    if (category === 'otRequests' || category === 'leaveRequests' || category === 'deliveries') normalized.images = normalizeImages(values.images || values.photos || []);
    const owner=ownerId || id;
    if(category==='production') normalized.machineId=productionMachineId;
    const productionMatch = async () => {
      const params=new URLSearchParams({select:'*',category:'eq.production',owner_id:`eq.${owner}`,request_id:`eq.${requestId}`,limit:'1'});
      const [saved]=await call('/rest/v1/factory_records?'+params);
      if(!saved)return null;
      const fields=['date','quantity','defective','operator','note'];
      if(fields.some(key=>String(saved.payload?.[key] ?? '')!==String(normalized[key] ?? '')))
        throw fail('รหัสคำขอนี้เคยใช้กับข้อมูลผลิตชุดอื่น กรุณาโหลดใหม่','CONFLICT');
      if(saved.payload?.machineId && saved.payload.machineId!==productionMachineId)
        throw fail('รหัสคำขอนี้เคยใช้กับเครื่องจักรอื่น กรุณาโหลดใหม่','CONFLICT');
      if(!saved.payload?.machineId && String(saved.payload?.machine||'')!==String(values.machine||''))
        throw fail('รหัสคำขอนี้เคยใช้กับเครื่องจักรอื่น กรุณาโหลดใหม่','CONFLICT');
      return verifySaved(saved);
    };
    if(category==='production'){
      const saved=await productionMatch();
      if(saved)return saved;
    }
    const row = { category, owner_id:owner, group_name:canonical(groupName || GROUP_BY_CATEGORY[category] || null), payload:normalized, created_by:id, updated_by:id, ...(category==='production'?{request_id:requestId}:{}) };
    let data;
    try { data=await call('/rest/v1/factory_records?select=*',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(row)}); }
    catch(error){
      if(category!=='production' || error.code!=='DUPLICATE_RECORD')throw error;
      const saved=await productionMatch();
      if(saved)return saved;
      throw error;
    }
    if(category==='production'){
      try{return await verifySaved(data[0]);}
      catch(error){throw fail(error.message||'บันทึกแล้วแต่ตรวจผลกลับไม่สำเร็จ กรุณาลองตรวจรายการเดิมอีกครั้ง','INCOMPLETE_WRITE');}
    }
    return verifySaved(data[0]);
  }
  async function update(id, category, values, reason='') {
    const actor = await userId();
    if (!reason.trim() || reason.trim().length>500) throw fail('กรุณาระบุเหตุผลการแก้ไขไม่เกิน 500 ตัวอักษร','VALIDATION_ERROR');
    let normalized;
    try { normalized=validateRecord(category,values); }
    catch(error){throw fail(error.message||'ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบก่อนบันทึก','VALIDATION_ERROR');}
    if(category==='production'){
      const params=new URLSearchParams({id:`eq.${id}`,category:'eq.production',select:'*',limit:'1'});
      const [existing]=await call('/rest/v1/factory_records?'+params);
      if(!existing)throw fail('ไม่พบรายการผลิตที่แก้ไข','NOT_FOUND');
      const requested=String(values.machineId||values.machine||'').trim();
      if(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requested))
        normalized.machineId=requested;
      else if(!requested || requested===String(existing.payload?.machine||'')){
        normalized.machine=String(existing.payload?.machine||'');
        normalized.machineId=existing.payload?.machineId||null;
      }else throw fail('เปลี่ยนเครื่องจักรได้เมื่อเลือก id จากข้อมูลกลางเท่านั้น กรุณาโหลดข้อมูลเครื่องใหม่','OPTIONS_CHANGED');
    }
    const params = new URLSearchParams({id:`eq.${id}`,category:`eq.${category}`,select:'*'});
    const data = await call('/rest/v1/factory_records?'+params,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({payload:normalized,reason:reason.trim(),updated_by:actor,updated_at:new Date().toISOString()})});
    if (!data?.length) throw fail('ไม่พบรายการที่แก้ไข','NOT_FOUND');
    return verifySaved(data[0]);
  }
  async function requireAdminAuditAccess() {
    await userId();
    if (!['admin','executive'].includes(claims?.app_metadata?.role)) throw fail('ไม่มีสิทธิ์ดูประวัติการแก้ไข','PERMISSION_DENIED');
  }
  async function readAdminAuditPage(filters={}, {signal}={}) {
    await requireAdminAuditAccess();
    const validation=validateAuditFilters(filters);
    if(!validation.valid)throw fail('ตัวกรองประวัติการแก้ไขไม่ถูกต้อง','VALIDATION_ERROR');
    const offset=Number(filters.offset||0), limit=Number(filters.limit||ADMIN_AUDIT_PAGE_SIZE);
    if (!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>ADMIN_AUDIT_PAGE_SIZE)
      throw fail('ตัวกรองประวัติการแก้ไขไม่ถูกต้อง','VALIDATION_ERROR');
    const params=buildAuditListParams(filters,{offset,limit:limit+1});
    const logs=await call('/rest/v1/audit_logs?'+params,{signal});
    const items=logs.slice(0,limit);
    const actorIds=[...new Set(items.map(row=>row.actor_employee_id).filter(Boolean))];
    let employees=[];
    if(actorIds.length) {
      const employeeParams=new URLSearchParams({select:'id,employee_name,employee_code',id:`in.(${actorIds.join(',')})`});
      try { employees=await call('/rest/v1/employees?'+employeeParams,{signal}); }
      catch(error) { if(signal?.aborted||error?.name==='AbortError'||error?.code==='SESSION_EXPIRED')throw error; }
    }
    return {items:items.map(row=>({...row,actorName:resolveAuditActor(row.actor_employee_id,employees)})),
      offset,hasMore:logs.length>limit};
  }
  async function readAdminAuditDetail(id, {signal}={}) {
    await requireAdminAuditAccess();
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id||'')))
      throw fail('รหัสเหตุการณ์ประวัติไม่ถูกต้อง','VALIDATION_ERROR');
    const metadataParams=new URLSearchParams({select:'id,actor_employee_id,table_name,record_id,action,created_at',id:`eq.${id}`,limit:'1'});
    const [metadata]=await call('/rest/v1/audit_logs?'+metadataParams,{signal});
    if(!metadata)return null;
    const detailParams=new URLSearchParams({select:buildAuditDetailSelect(metadata.table_name),id:`eq.${id}`,limit:'1'});
    const [detail]=await call('/rest/v1/audit_logs?'+detailParams,{signal});
    if(!detail)return null;
    return {...detail,reasonProtected:!auditAllowsReason(metadata.table_name),changes:safeAuditChanges(detail,metadata.table_name)};
  }
  async function dispatch(module, action, p={}, {signal,onPhase}={}) {
    if (module==='package01' && action==='devices.read') return call('/rest/v1/machines?select=id,machine_code,machine_name,work_group,active,display_order&order=display_order.asc');
    if (module==='package01' && action==='screenManual.read') return rows('screenEntries');
    if (module==='package01' && action==='screenManual.create') return insert('screenEntries',{...p,operatorName:await currentName()});
    if (module==='package04' && action==='delivery.list') {
      const result=await delivery().history(p);
      return {...result,rows:(result.rows||[]).map(row=>({...row,billNumber:row.bill_number,product:row.product,dateTime:row.event_at,
        createdAt:row.created_at,sender:row.sender,images:Array(Number(row.attachment_count)||0).fill(null)}))};
    }
    if (module==='package04' && action==='delivery.admin.list') {
      await userId();
      if(claims?.app_metadata?.role!=='admin')throw fail('ไม่มีสิทธิ์ดูรายการขนส่งทุกคน','PERMISSION_DENIED');
      const from=p.from||null,to=p.to||null,employeeId=p.employeeId||null,group=p.group||null,status=p.status||null;
      const query=String(p.query||'').trim(),limit=Number(p.limit??25),offset=Number(p.offset??0);
      const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if((from&&!/^\d{4}-\d{2}-\d{2}$/.test(from))||(to&&!/^\d{4}-\d{2}-\d{2}$/.test(to))||(from&&to&&from>to)
        ||(employeeId&&!uuid.test(employeeId))||(group&&group!=='ขนส่ง')||(status&&!['ส่งสำเร็จ','ยกเลิก'].includes(status))
        ||!Number.isInteger(limit)||limit<1||limit>100||!Number.isInteger(offset)||offset<0||query.length>100)
        throw fail('ตัวกรองรายการขนส่งไม่ถูกต้อง','VALIDATION_ERROR');
      const result=await call('/rest/v1/rpc/delivery_history_admin_filtered',{method:'POST',body:JSON.stringify({
        p_query:query,p_from:from,p_to:to,p_status:status,p_employee_id:employeeId,p_work_group:group,p_limit:limit,p_offset:offset
      })});
      return {...result,rows:(result.rows||[]).map(row=>({...row,billNumber:row.bill_number,product:row.product,dateTime:row.event_at,
        createdAt:row.created_at,sender:row.sender,images:Array(Number(row.attachment_count)||0).fill(null)}))};
    }
    if (module==='package04' && action==='delivery.detail') return delivery().detail(p.id);
    if (module==='package04' && action==='delivery.options') {
      const result=await delivery().options();
      return {allowed:true,products:result.products||[],sender:result.sender||'',source:'supabase'};
    }
    if (module==='package04' && action==='delivery.create') return delivery().create(p,p.files||[],p.requestId,p.onPhase);
    if (module==='package04' && action==='delivery.cancel') return delivery().cancel(p.id,p.expectedVersion);
    if (module==='package04' && action==='delivery.undo') {
      const actor=await userId(); const raw=await call('/rest/v1/factory_records?select=id,owner_id,group_name,payload,created_at,updated_at&id=eq.'+encodeURIComponent(p.id)+'&category=eq.deliveries');
      const row=raw?.[0]; if(!row || row.payload?.status==='ยกเลิก') throw fail('ไม่พบรายการขนส่งที่ยังยกเลิกได้','NOT_FOUND');
      const next={...row.payload,status:'ยกเลิก',legacyStatus:'UNDONE',undoneAt:new Date().toISOString()};
      const data=await call('/rest/v1/factory_records?id=eq.'+encodeURIComponent(row.id)+'&category=eq.deliveries&select=*',{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({payload:next,reason:'ยกเลิกรายการขนส่ง',updated_by:actor,updated_at:new Date().toISOString()})}); return verifySaved(data[0]);
    }
    if (module==='package05' && action==='production.list') return rows('production');
    if (module==='package05' && action==='production.create') return insert('production',{...p,operator:await currentName()},'ผลิต');
    if (module==='package05' && action==='production.resolve') {
      const actor=await userId();
      const requestId=String(p.requestId||'');
      if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId))
        throw fail('รหัสคำขอบันทึกผลิตไม่ถูกต้อง','VALIDATION_ERROR');
      const params=new URLSearchParams({select:'*',category:'eq.production',owner_id:`eq.${actor}`,request_id:`eq.${requestId}`,limit:'1'});
      const [saved]=await call('/rest/v1/factory_records?'+params);
      if(!saved)return null;
      try{return await verifySaved(saved);}
      catch(error){throw fail(error.message||'พบรายการเดิมแต่ตรวจสอบกลับไม่สำเร็จ','INCOMPLETE_WRITE');}
    }
    if (module==='package07' && action==='work.admin.history') {
      await userId();
      if(claims?.app_metadata?.role!=='admin')throw fail('ไม่มีสิทธิ์เปิดประวัติงานทุกกลุ่ม','PERMISSION_DENIED');
      const from=p.from||null,to=p.to||null,employeeId=p.employeeId||null,workGroup=p.group||null;
      const status=p.status||'all',query=String(p.query||'').trim(),dateBasis=p.dateBasis||'start',sourceCategory=p.sourceCategory||'workSessions',limit=Number(p.limit??25),offset=Number(p.offset??0);
      const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if((from&&!/^\d{4}-\d{2}-\d{2}$/.test(from))||(to&&!/^\d{4}-\d{2}-\d{2}$/.test(to))||(from&&to&&from>to)
        ||(employeeId&&!uuid.test(employeeId))||(workGroup&&!['สกรีน','ผลิต'].includes(workGroup))||!['all','open','closed'].includes(status)||!['start','business'].includes(dateBasis)
        ||!['workSessions','screenEntries','production'].includes(sourceCategory)
        ||(sourceCategory==='screenEntries'&&workGroup!=='สกรีน')||(sourceCategory==='production'&&workGroup!=='ผลิต')
        ||!Number.isInteger(limit)||limit<1||limit>100||!Number.isInteger(offset)||offset<0||query.length>100)
        throw fail('ตัวกรองประวัติงานไม่ถูกต้อง','VALIDATION_ERROR');
      return call('/rest/v1/rpc/work_session_history_admin',{method:'POST',body:JSON.stringify({
        p_from:from,p_to:to,p_employee_id:employeeId,p_work_group:workGroup,p_status:status,p_query:query,
        p_date_basis:dateBasis,p_record_category:sourceCategory,p_limit:limit,p_offset:offset
      })});
    }
    if (module==='package07' && action==='work.admin.detail') {
      await userId();
      if(claims?.app_metadata?.role!=='admin')throw fail('ไม่มีสิทธิ์เปิดรายละเอียดงานทุกกลุ่ม','PERMISSION_DENIED');
      const sourceCategory=p.sourceCategory||'workSessions';
      if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(p.id||'')
        ||!['workSessions','screenEntries','production'].includes(sourceCategory))throw fail('รหัสรายการหรือหมวดไม่ถูกต้อง','VALIDATION_ERROR');
      return call('/rest/v1/rpc/work_session_detail_admin',{method:'POST',body:JSON.stringify({p_id:p.id,p_record_category:sourceCategory})});
    }
    if (module==='package07' && action==='ot.admin.history') {
      await userId();
      if(claims?.app_metadata?.role!=='admin')throw fail('ไม่มีสิทธิ์ดูรายงาน OT ทุกคน','PERMISSION_DENIED');
      const from=p.from||null,to=p.to||null,employeeId=p.employeeId||null,group=p.group||null;
      const status=p.status||'all',query=String(p.query||'').trim(),limit=Number(p.limit??25),offset=Number(p.offset??0);
      const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if(!/^\d{4}-\d{2}-\d{2}$/.test(from||'')||!/^\d{4}-\d{2}-\d{2}$/.test(to||'')||from>to
        ||(employeeId&&!uuid.test(employeeId))||(group&&!['สกรีน','ผลิต','ขนส่ง'].includes(group))
        ||!['all','submitted'].includes(status)||!Number.isInteger(limit)||limit<1||limit>100
        ||!Number.isInteger(offset)||offset<0||query.length>100)
        throw fail('ตัวกรองรายงาน OT ไม่ถูกต้อง','VALIDATION_ERROR');
      return call('/rest/v1/rpc/ot_report_history_admin_filtered',{method:'POST',body:JSON.stringify({
        p_from:from,p_to:to,p_employee_id:employeeId,p_work_group:group,p_status:status,p_query:query,p_limit:limit,p_offset:offset
      })});
    }
    if (module==='package07' && action==='ot.manager.dashboard') {
      await userId();
      if(!['admin','executive'].includes(claims?.app_metadata?.role))throw fail('ไม่มีสิทธิ์ดูรายงาน OT ผู้บริหาร','PERMISSION_DENIED');
      const from=p.from||null,to=p.to||null,group=p.group||null,query=String(p.query||'').trim();
      const limit=Number(p.limit??25),offset=Number(p.offset??0);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(from||'')||!/^\d{4}-\d{2}-\d{2}$/.test(to||'')||from>to
        ||(group&&!['สกรีน','ผลิต','ขนส่ง'].includes(group))||!Number.isInteger(limit)||limit<1||limit>100
        ||!Number.isInteger(offset)||offset<0||query.length>100)throw fail('ตัวกรองรายงาน OT ไม่ถูกต้อง','OT_FILTER_INVALID');
      return call('/rest/v1/rpc/ot_report_manager_dashboard',{method:'POST',signal,body:JSON.stringify({
        p_from:from,p_to:to,p_work_group:group,p_query:query,p_limit:limit,p_offset:offset
      })});
    }
    if (module==='package07' && action==='work.read') {
      // RLS applies self-service ownership and the server-authorized manager scope.
      return allRows('workSessions');
    }
    if (module==='package07' && action==='work.active.read') {
      const actor=await userId();
      return rows('workSessions',{owner_id:`eq.${actor}`,or:'(payload->>endedAt.is.null,payload->>endedAt.eq.)'});
    }
    if (module==='package07' && action==='work.options') {
      const group=canonical(p.workType);
      if(!['สกรีน','ผลิต'].includes(group))throw fail('เลือกพื้นที่ทำงานที่ได้รับสิทธิ์','VALIDATION_ERROR');
      const machineParams=new URLSearchParams({select:'id,machine_code,machine_name,work_group,active,display_order',active:'eq.true',work_group:`eq.${group}`,order:'display_order.asc,machine_code.asc'});
      const machines=await call('/rest/v1/machines?'+machineParams);
      const orders=group==='สกรีน'?await call('/rest/v1/item_names?'+new URLSearchParams({select:'id,item_name,active',active:'eq.true',order:'item_name.asc,id.asc'})):[];
      return {machines,orders,source:'supabase',directorySnapshotDate:null};
    }
    if (module==='package07' && action==='screen.work.read') {
      const sessionIds=Array.isArray(p.sessionIds)?p.sessionIds:[];
      if(sessionIds.some(id=>typeof id!=='string'||!/^[-0-9a-f]{36}$/i.test(id)))throw fail('รหัส session ไม่ถูกต้อง','VALIDATION_ERROR');
      return call('/rest/v1/rpc/screen_work_read',{method:'POST',body:JSON.stringify({p_work_session_ids:sessionIds})});
    }
    if (module==='package07' && action==='screen.work.save') {
      if(!p.workSessionId||!p.requestId||!Number.isInteger(p.expectedVersion)||p.expectedVersion<0||!Array.isArray(p.items))throw fail('ข้อมูลรายละเอียดงานสกรีนไม่ครบ','VALIDATION_ERROR');
      const integer=(value,min)=>Number.isInteger(value)&&value>=min;
      if(!integer(p.screenDefectBottles,0)||!integer(p.productionDefectBottles,0)||typeof p.note!=='string'||p.note.length>500
        ||p.items.length>100||p.items.some((item,index)=>!item||!/^[-0-9a-f]{36}$/i.test(item.item_name_id||'')||!integer(item.pack_count,1)||!['REGULAR','OT'].includes(item.work_period)||item.sort_order!==index))
        throw fail('จำนวนแพ็คต้องเป็นจำนวนเต็มมากกว่า 0 และของเสียต้องเป็นจำนวนขวดเต็มตั้งแต่ 0','VALIDATION_ERROR');
      return call('/rest/v1/rpc/screen_work_save',{method:'POST',body:JSON.stringify({p_work_session_id:p.workSessionId,p_request_id:p.requestId,p_expected_version:p.expectedVersion,p_items:p.items,p_screen_defect_bottles:p.screenDefectBottles,p_production_defect_bottles:p.productionDefectBottles,p_note:p.note})});
    }
    if (module==='package07' && action==='work.start') {
      if(!p.requestId || !p.machineId)throw fail('เลือกเครื่องจักรแล้วลองใหม่','VALIDATION_ERROR');
      const result=await call('/rest/v1/rpc/work_session_start',{method:'POST',body:JSON.stringify({p_request_id:p.requestId,p_work_group:canonical(p.workType),p_machine_id:p.machineId,p_item_name_id:p.itemNameId||null,p_note:p.note||''})});
      return verifySaved(result);
    }
    if (module==='package07' && action==='work.end') {
      if(!p.id || !p.requestId || !Number.isInteger(p.quantity) || p.quantity<0)throw fail('กรุณาระบุจำนวนเต็มตั้งแต่ 0 ขึ้นไป','VALIDATION_ERROR');
      const result=await call('/rest/v1/rpc/work_session_end',{method:'POST',body:JSON.stringify({p_id:p.id,p_request_id:p.requestId,p_quantity:p.quantity})});
      return verifySaved(result);
    }
    if (module==='package07' && action==='work.end.screen') {
      if(!p.id || !p.requestId || !Number.isInteger(p.quantity) || p.quantity<0 || !Number.isSafeInteger(p.expectedScreenVersion) || p.expectedScreenVersion<1)throw fail('กรุณาตรวจรายละเอียดงานสกรีนก่อนจบงาน','VALIDATION_ERROR');
      const result=await call('/rest/v1/rpc/work_session_end_screen',{method:'POST',body:JSON.stringify({p_id:p.id,p_request_id:p.requestId,p_quantity:p.quantity,p_expected_screen_version:p.expectedScreenVersion})});
      return verifySaved(result);
    }
    if (module==='package07' && action==='production.work.read') {
      const from=p.from || null, to=p.to || null, limit=Number(p.limit ?? 20), offset=Number(p.offset ?? 0);
      const ids=Array.isArray(p.sessionIds)?p.sessionIds:[];
      if ((from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) || (to && !/^\d{4}-\d{2}-\d{2}$/.test(to)) ||
        !Number.isInteger(limit) || limit<1 || limit>100 || !Number.isInteger(offset) || offset<0 ||
        ids.some(id=>typeof id!=='string'||!/^[-0-9a-f]{36}$/i.test(id))) throw fail('ตัวกรองประวัติงานผลิตไม่ถูกต้อง','VALIDATION_ERROR');
      return call('/rest/v1/rpc/production_work_read',{method:'POST',body:JSON.stringify({p_from:from,p_to:to,p_limit:limit,p_offset:offset,p_work_session_ids:ids})});
    }
    if (module==='package07' && action==='production.work.save') {
      const integer=(value,min,max)=>Number.isInteger(value)&&value>=min&&value<=max;
      if (!p.workSessionId || !p.requestId || !Number.isSafeInteger(p.expectedVersion) || p.expectedVersion<0 ||
        !integer(p.quantity,1,1000000000) || !integer(p.defective,0,p.quantity) || typeof p.note!=='string' || p.note.length>500)
        throw fail('จำนวนผลิตต้องเป็นจำนวนเต็ม 1 ถึง 1,000,000,000 ใบ และของเสียต้องไม่เกินยอดผลิต','VALIDATION_ERROR');
      const saved=await call('/rest/v1/rpc/production_work_save',{method:'POST',body:JSON.stringify({p_work_session_id:p.workSessionId,p_request_id:p.requestId,p_expected_version:p.expectedVersion,p_quantity:p.quantity,p_defective:p.defective,p_note:p.note})});
      const check=await call('/rest/v1/rpc/production_work_read',{method:'POST',body:JSON.stringify({p_from:null,p_to:null,p_limit:1,p_offset:0,p_work_session_ids:[p.workSessionId]})});
      if (!check?.items?.[0] || check.items[0].version!==saved.version || check.items[0].quantity!==p.quantity || check.items[0].defective!==p.defective || check.items[0].note!==p.note)
        throw fail('บันทึกแล้วแต่ตรวจข้อมูลผลิตกลับไม่สำเร็จ กรุณาโหลดข้อมูลก่อนส่งซ้ำ','INCOMPLETE_WRITE');
      return check.items[0];
    }
    if (module==='package07' && action==='production.work.end') {
      if (!p.id || !p.requestId || !Number.isSafeInteger(p.expectedProductionVersion) || p.expectedProductionVersion<1)
        throw fail('กรุณาโหลดรายละเอียดผลิตล่าสุดก่อนจบงาน','VALIDATION_ERROR');
      const result=await call('/rest/v1/rpc/production_work_end',{method:'POST',body:JSON.stringify({p_id:p.id,p_request_id:p.requestId,p_expected_production_version:p.expectedProductionVersion})});
      return verifySaved(result);
    }
    if (module==='package07' && action==='ot.read') return overtime().history(p);
    if (module==='package07' && action==='ot.detail') return overtime().detail(p.id,p.scope||"self",{signal,onPhase});
    if (module==='package07' && action==='ot.recover') return overtime().recover(p.owner_id);
    if (module==='package07' && action==='ot.abandon') return overtime().abandon(p.owner_id);
    if (module==='package07' && action==='ot.edit.recover') return overtime().recoverEdit(p.owner_id);
    if (module==='package07' && action==='ot.edit.abandon') return overtime().abandonEdit(p.owner_id);
    if (module==='package07' && action==='ot.edit') return overtime().edit(p);
    if (module==='package07' && action==='ot.submit') return overtime().submit(p);
    if (module==='package09') {
      if(action==='leave.read')return leave().list(p.scope||'self');
      if(action==='leave.history')return leave().historyPage({limit:p.limit,offset:p.offset,status:p.status,from:p.from,to:p.to,dateBasis:p.dateBasis});
      if(action==='leave.manager.queue')return leave().managerQueuePage(p,{signal});
      if(action==='leave.manager.report')return leave().managerReportPage(p,{signal});
      if(action==='leave.admin.history') {
        await userId();
        if(claims?.app_metadata?.role!=='admin')throw fail('ไม่มีสิทธิ์ดูคำขอลาทุกคน','PERMISSION_DENIED');
        const from=p.from||null,to=p.to||null,employeeId=p.employeeId||null,group=p.group||null;
        const status=p.status||'all',dateBasis=p.dateBasis||'leave',query=String(p.query||'').trim();
        const limit=Number(p.limit??25),offset=Number(p.offset??0);
        const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if((from&&!/^\d{4}-\d{2}-\d{2}$/.test(from))||(to&&!/^\d{4}-\d{2}-\d{2}$/.test(to))
          ||Boolean(from)!==Boolean(to)||(from&&to&&from>to)||(employeeId&&!uuid.test(employeeId))
          ||(group&&!['ออฟฟิศ','สกรีน','ผลิต','ขนส่ง'].includes(group))
          ||!['all','pending','approved','rejected','cancelled'].includes(status)||!['leave','submitted'].includes(dateBasis)
          ||!Number.isInteger(limit)||limit<1||limit>100||!Number.isInteger(offset)||offset<0||query.length>100)
          throw fail('ตัวกรองคำขอลาไม่ถูกต้อง','VALIDATION_ERROR');
        return call('/rest/v1/rpc/factory_leave_admin_history_page',{method:'POST',body:JSON.stringify({
          p_from:from,p_to:to,p_status:status,p_date_basis:dateBasis,p_employee_id:employeeId,p_group:group,
          p_query:query,p_limit:limit,p_offset:offset
        })});
      }
      if(action==='leave.calendar')return leave().calendar(p.month);
      if(action==='leave.options')return leave().options();
      if(action==='leave.detail')return leave().detail(p.id,{signal});
      if(action==='leave.images')return leave().images(p.id,{signal});
      if(action==='leave.recover')return leave().recover();
      if(action==='leave.mutate')return leave().mutate(p.operation,p);
      if(action==='leave.submit')return leave().mutate('create',p);
      if(action==='leave.proxy.submit') {
        await userId();
        if(claims?.app_metadata?.role!=='admin')throw fail('การยื่นลาแทนใช้ได้เฉพาะ Admin','PERMISSION_DENIED');
        return leave().adminProxySubmit(p);
      }
      if(action==='leave.cancel')return leave().mutate('cancel',p);
      if(action==='leave.review')return leave().mutate('review',{...p,reason:p.rejectionReason||(p.decision==='approved'?'อนุมัติคำขอลา':'')});
    }
    if (module==='package08' && action==='calendar.read') {
      const filters={}; if(p.group) filters.group_name=`eq.${canonical(p.group)}`;
      const result=await rows('calendar',filters); const memberships=await call('/rest/v1/employee_groups?select=group_name,employee_id,active&active=eq.true'); const id=await userId(); const groups=[...new Set((claims.app_metadata.role==='admin' ? memberships : memberships.filter(r=>r.employee_id===id)).map(r=>canonical(r.group_name)))].filter(g=>['ผลิต','สกรีน','ขนส่ง','ออฟฟิศ'].includes(g)); const approvedLeaves=await leave().calendar(p.month); return {groups,month:p.month,entries:result.filter(r=>r.date?.startsWith(p.month)),approvedLeaves};
    }
    if (module==='package08' && action==='calendar.save') {
      const [existing]=await rows('calendar',{group_name:`eq.${canonical(p.group)}`, 'payload->>date':`eq.${p.date}`});
      return existing ? update(existing.id,'calendar',p,'แก้ไขปฏิทิน') : insert('calendar',p,canonical(p.group));
    }
    if (module==='package08' && action==='calendar.batch.save') return Promise.all((p.entries||[]).map(entry=>dispatch(module,'calendar.save',entry)));
    if (module==='package08' && action==='calendar.notifications.read') return [];
    if (module==='package09' && ['leave.notifications.read','leave.notices.read'].includes(action)) return [];
    if (module==='package10' && action==='attendance.notifications.read') return [];
    if (module==='package10' && action==='attendance.manager') return {pendingLeaves:(await rows('leaveRequests',{ 'payload->>status':'eq.pending'})).length,date:bangkokToday(),source:{kind:'real'}};
    if (module==='package10' && action==='profile.read') {
      const id=await userId();
      const [employees,groups]=await Promise.all([
        call('/rest/v1/employees?select=id,employee_name,employee_code,main_group,active&id=eq.'+encodeURIComponent(id)),
        call('/rest/v1/employee_groups?select=group_name,active&employee_id=eq.'+encodeURIComponent(id)+'&active=eq.true&order=group_name.asc')
      ]);
      const employee=employees?.[0];
      if(!employee || employee.id!==id || employee.active!==true) throw fail('ไม่มีสิทธิ์ดูข้อมูลบัญชีนี้','PERMISSION_DENIED');
      return {id:employee.id,name:employee.employee_name,code:employee.employee_code||null,mainGroup:canonical(employee.main_group),groups:[...new Set((groups||[]).filter(row=>row.active===true).map(row=>canonical(row.group_name)).filter(Boolean))],source:{kind:'real'}};
    }
    if (module==='package10' && action==='profile.attendance.read') {
      const id=await userId();
      const first= p.period==='second' ? 16 : 1;
      const lastDay=new Date(Date.UTC(Number(p.month.slice(0,4)),Number(p.month.slice(5,7)),0)).getUTCDate();
      const last=p.period==='first' ? 15 : lastDay;
      const from=p.month+'-'+String(first).padStart(2,'0');
      const to=p.month+'-'+String(last).padStart(2,'0');
      const params=new URLSearchParams({select:'id,owner_id,payload,created_at',category:'eq.attendance',owner_id:`eq.${id}`,order:'created_at.asc',limit:'1000'});
      params.append('payload->>date',`gte.${from}`);params.append('payload->>date',`lte.${to}`);
      const data=await call('/rest/v1/factory_records?'+params);
      const history=(data||[]).map(row=>{
        const payload=row?.payload;
        if(row?.owner_id!==id || !payload || typeof payload!=='object' || !/^\d{4}-\d{2}-\d{2}$/.test(payload.date||'') || payload.date<from || payload.date>to) throw fail('รูปแบบประวัติเวลาไม่ถูกต้อง','INVALID_ATTENDANCE_DATA');
        for(const field of ['checkIn','checkOut']) if(payload[field]!=null && (typeof payload[field]!=='string' || !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(payload[field]))) throw fail('รูปแบบเวลาในประวัติไม่ถูกต้อง','INVALID_ATTENDANCE_DATA');
        return {id:row.id,date:payload.date,checkIn:payload.checkIn||null,checkOut:payload.checkOut||null,status:typeof payload.status==='string'?payload.status:null,detail:typeof payload.detail==='string'?payload.detail:null};
      }).sort((a,b)=>a.date.localeCompare(b.date)||String(a.id).localeCompare(String(b.id)));
      const daysWithRecords=new Set(history.map(row=>row.date)).size;
      return {month:p.month,period:p.period,from,to,history,summary:{daysWithRecords,completeEntries:history.filter(row=>row.checkIn&&row.checkOut).length,missingCheckOut:history.filter(row=>row.checkIn&&!row.checkOut).length},source:{kind:'real',asOf:new Date().toISOString()}};
    }
    if (module==='package10' && action==='attendance.read') {
      const id=await userId();
      const [attendance,calendarRows,leaves] = await Promise.all([
        rows('attendance',{owner_id:`eq.${id}`, 'payload->>date':`gte.${p.month}-01`}),
        rows('calendar',{ 'payload->>date':`gte.${p.month}-01`}),
        rows('leaveRequests',{owner_id:`eq.${id}`})
      ]);
      const history=attendance.filter(r=>r.date?.startsWith(p.month)).map(r=>({date:r.date,checkIn:r.checkIn||null,checkOut:r.checkOut||null,status:r.status||({'present':'present-full','leave':'leave','absent':'absent','holiday':'holiday'}[r.workdayStatus]||'unrecorded'),lateMinutes:Number(r.lateMinutes)||0,earlyLeaveMinutes:Number(r.earlyLeaveMinutes)||0,overtimeMinutes:Number(r.overtimeMinutes)||0}));
      const today=history.find(r=>r.date===bangkokToday())||{date:bangkokToday(),checkIn:null,checkOut:null,status:'unrecorded',lateMinutes:0,earlyLeaveMinutes:0,overtimeMinutes:0};
      const calendarDays=calendarRows.filter(r=>r.date?.startsWith(p.month)).map(r=>({date:r.date,status:({'เต็มวัน':'scheduled','ครึ่งวัน':'present-half','หยุด':'holiday'}[r.status]||'scheduled')}));
      const myLeaves=leaves.filter(r=>r.employeeId===id && ['approved','pending'].includes(r.status) && r.startDate<=bangkokToday() && r.endDate>=bangkokToday());
      const status=today.status==='unrecorded' && myLeaves.some(r=>r.status==='approved') ? 'leave' : today.status;
      const summary={attendanceDays:history.filter(r=>['present-full','present-half','in-progress'].includes(r.status)).length,leaveDays:history.filter(r=>r.status==='leave').length,absentDays:history.filter(r=>r.status==='absent').length,lateMinutes:history.reduce((s,r)=>s+r.lateMinutes,0),earlyLeaveMinutes:history.reduce((s,r)=>s+r.earlyLeaveMinutes,0),overtimeMinutes:history.reduce((s,r)=>s+r.overtimeMinutes,0)};
      return {...today,workdayStatus:status,absent:status==='absent',leaveStatus:myLeaves.find(r=>r.status==='approved')?.type||null,month:p.month,period:p.period,history,calendarDays,summary,source:{kind:'real',asOf:new Date().toISOString()}};
    }
    if (module==='package03' && action==='attendance.read') {
      return {attendance:await rows('attendance')};
    }
    if (module==='package03' && action==='attendance.dashboard') {
      const role=claims?.app_metadata?.role;
      if(!['executive','admin'].includes(role)) throw fail('ไม่มีสิทธิ์ดูรายงานผู้บริหาร','PERMISSION_DENIED');
      const employeeId=await userId();
      const today=bangkokToday();
      const todayOnly=p.todayOnly===true;
      let range;
      try { range=todayOnly ? {startDate:today,endDate:today,days:1} : validateAttendanceRange(String(p.startDate||today),String(p.endDate||today)); }
      catch(error) { throw fail(error.message,error.code||'RANGE_INVALID'); }
      const selfQuery=new URLSearchParams({select:'id,active',id:`eq.${employeeId}`,limit:'1'});
      const selfRows=await call('/rest/v1/employees?'+selfQuery,{signal});
      if(!Array.isArray(selfRows)||selfRows.length!==1||selfRows[0].active!==true) throw fail('ไม่มีสิทธิ์ดูรายงานผู้บริหาร','PERMISSION_DENIED');

      const employeeQuery=new URLSearchParams({select:'id,employee_name,employee_code,main_group,active',order:'employee_name.asc,id.asc',limit:'1001'});
      const groupQuery=new URLSearchParams({select:'employee_id,group_name',active:'eq.true',order:'employee_id.asc,group_name.asc',limit:'5001'});
      const [employeeRows,membershipRows]=await Promise.all([
        call('/rest/v1/employees?'+employeeQuery,{signal}),
        call('/rest/v1/employee_groups?'+groupQuery,{signal})
      ]);
      if(employeeRows.length>=1000) throw fail('รายชื่อพนักงานในขอบเขตสิทธิ์เกินเพดานที่รองรับ กรุณาติดต่อผู้ดูแลให้จำกัดขอบเขตกลุ่มงาน','TOO_MANY_EMPLOYEES');
      if(membershipRows.length>=1000) throw fail('ข้อมูลกลุ่มงานในขอบเขตสิทธิ์เกินเพดานที่รองรับ กรุณาติดต่อผู้ดูแลระบบ','TOO_MANY_GROUPS');
      const membershipsByEmployee=new Map();
      for(const membership of membershipRows){
        const list=membershipsByEmployee.get(membership.employee_id)||[];
        if(membership.group_name) list.push(canonical(membership.group_name));
        membershipsByEmployee.set(membership.employee_id,list);
      }
      const people=employeeRows.map(person=>({
        id:person.id,
        name:String(person.employee_name||'—'),
        employeeCode:person.employee_code||null,
        active:person.active===true,
        groups:[...new Set([person.main_group,...(membershipsByEmployee.get(person.id)||[])].filter(Boolean).map(canonical))].sort((a,b)=>a.localeCompare(b,'th'))
      }));

      const dashboard=await call('/rest/v1/rpc/factory_attendance_manager_dashboard',{
        method:'POST',
        body:JSON.stringify({p_start_date:range.startDate,p_end_date:range.endDate,p_today_only:todayOnly}),
        signal
      });
      if(!dashboard||typeof dashboard.current_date!=='string'||!Array.isArray(dashboard.rows))
        throw fail('รูปแบบผลรายงานเวลาจาก Supabase ไม่ถูกต้อง','INVALID_ATTENDANCE_DATA');
      const effectiveRange=validateAttendanceRange(String(dashboard.start_date||''),String(dashboard.end_date||''));
      const serverToday=String(dashboard.current_date);
      validateAttendanceRange(serverToday,serverToday);
      if((!todayOnly&&(effectiveRange.startDate!==range.startDate||effectiveRange.endDate!==range.endDate))||
         (todayOnly&&(effectiveRange.startDate!==serverToday||effectiveRange.endDate!==serverToday)))
        throw fail('วันที่หรือช่วงจาก Supabase ไม่ตรงกับคำขอ','INVALID_ATTENDANCE_DATA');
      const rawAttendance=dashboard.rows.map(row=>({
        id:row.record_id,
        employeeId:row.employee_id,
        group:row.group_name,
        date:row.attendance_date,
        checkIn:row.check_in,
        checkOut:row.check_out
      }));
      const allNormalized=normalizeExecutiveAttendanceRows(rawAttendance,people,effectiveRange);
      const daily=todayOnly?allNormalized:[];
      const term=String(p.search??p.name??'').trim().toLocaleLowerCase('th');
      const selectedGroup=String(p.group||'').trim();
      const matched=people.filter(person=>{
        const searchMatch=!term||person.name.toLocaleLowerCase('th').includes(term)||String(person.employeeCode||'').toLocaleLowerCase('th').includes(term);
        const groupMatch=!selectedGroup||person.groups.includes(canonical(selectedGroup));
        return searchMatch&&groupMatch;
      });
      const matchedIds=new Set(matched.map(person=>person.id));
      const mappedRows=allNormalized.filter(row=>matchedIds.has(row.employeeId));
      const summaries=summarizeExecutiveAttendance(matched,mappedRows,allNormalized.length>0);
      return {
        employees:people,
        availableGroups:[...new Set(people.flatMap(person=>person.groups))].sort((a,b)=>a.localeCompare(b,'th')),
        summaries,
        daily,
        startDate:effectiveRange.startDate,
        endDate:effectiveRange.endDate,
        currentDate:serverToday,
        attendanceRowCount:allNormalized.length,
        source:{kind:'real',asOf:new Date().toISOString(),timeZone:'Asia/Bangkok',recordSource:'public.factory_records:attendance'}
      };
    }
    if (module==='package06' && action==='reports.read') {
      if(!['today','week','month'].includes(p.period)) throw fail('เลือกรอบรายงานไม่ถูกต้อง','VALIDATION_ERROR');
      const today=bangkokToday(); let start=today;
      if(p.period==='month') start=today.slice(0,7)+'-01';
      if(p.period==='week'){const day=new Date(today+'T00:00:00Z');day.setUTCDate(day.getUTCDate()-(day.getUTCDay()+6)%7);start=day.toISOString().slice(0,10);}
      const [attendance,production,deliveries,leaves]=await Promise.all([rows('attendance'),rows('production'),rows('deliveries'),rows('leaveRequests')]);
      const within=date=>typeof date==='string' && date.slice(0,10)>=start && date.slice(0,10)<=today;
      const a=attendance.filter(r=>within(r.date)); const prod=production.filter(r=>within(r.date||r.createdAt)); const delivery=deliveries.filter(r=>r.status!=='ยกเลิก' && within(r.dateTime||r.createdAt));
      const approvedLeaves=leaves.filter(r=>r.status==='approved' && r.startDate<=today && r.endDate>=start);
      const totals=new Map(); prod.forEach(r=>totals.set(r.operator||r.employee||'ไม่ระบุ',(totals.get(r.operator||r.employee||'ไม่ระบุ')||0)+Number(r.quantity||0)));
      return {period:p.period,present:a.filter(r=>r.checkIn).length,late:a.filter(r=>Number(r.lateMinutes)>0).length,leave:approvedLeaves.length,absent:a.filter(r=>r.absent===true||r.workdayStatus==='absent').length,production:prod.reduce((sum,r)=>sum+Number(r.quantity||0),0),delivery:delivery.length,outstanding:[...totals].sort((x,y)=>y[1]-x[1])[0]?.[0]||'—',source:{kind:'real',asOf:new Date().toISOString()}};
    }
    if (module==='package06' && action==='reports.inbox.read') return [];
    if (module==='package06' && action==='reports.notifications.read') return [];
    if (module==='package06' && action==='reports.preview.create') throw fail('การสร้างรายงานยังไม่ได้เชื่อมแหล่งข้อมูลจริง','NOT_CONFIGURED');
    if (module==='package11' && action==='admin.read') {
      const audit=(await readAdminAuditPage({}, {signal})).items;
      const employees=await call('/rest/v1/employees?select=id'); return {moduleCount:10,auditCount:audit.length,employeeCount:employees.length,status:'real',auditLog:audit};
    }
    if (module==='package11' && action==='admin.audit.list') return readAdminAuditPage(p.filters||{}, {signal});
    if (module==='package11' && action==='admin.audit.detail') return readAdminAuditDetail(p.id, {signal});
    if (module==='package11' && action==='records.list') {
      if (p.category==='employees') return call('/rest/v1/employees?select=id,employee_name,main_group,active,employee_code&order=employee_name.asc');
      return rows(p.category);
    }
    if (module==='package11' && action==='records.save') {
      if (p.category==='employees') throw fail('จัดการพนักงานผ่านหน้าจัดการพนักงานโดยตรง','NOT_CONFIGURED');
      if (GENERIC_ADMIN_WRITE_BLOCKED.has(p.category)) throw fail('หมวดงานนี้ต้องใช้ workflow เฉพาะ และไม่รองรับการแก้ประวัติผ่านรายการ Admin ทั่วไป','PERMISSION_DENIED');
      return p.id ? update(p.id,p.category,p.values,p.reason) : insert(p.category,p.values,p.values?.group || GROUP_BY_CATEGORY[p.category]);
    }
    throw fail('ฟังก์ชันนี้ยังไม่ได้เชื่อมฐานข้อมูลจริง','NOT_CONFIGURED');
  }
  async function currentGroup() {
    const id=await userId(); const data=await call('/rest/v1/employees?select=main_group&id=eq.'+encodeURIComponent(id));
    if(!data?.[0]?.main_group) throw fail('ไม่พบกลุ่มงานหลักของบัญชี','PERMISSION_DENIED'); return canonical(data[0].main_group);
  }
  async function currentName() {
    const id=await userId(); const data=await call('/rest/v1/employees?select=employee_name&id=eq.'+encodeURIComponent(id));
    if(!data?.[0]?.employee_name) throw fail('ไม่พบบัญชีพนักงานที่ใช้งาน','PERMISSION_DENIED'); return data[0].employee_name;
  }
  return Object.freeze({ request:dispatch });
}















