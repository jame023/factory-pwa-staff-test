// Display/navigation policy only. Data access remains enforced by Supabase RLS/RPC.
export const canonicalGroup = value => value === 'ออฟฟิต' ? 'ออฟฟิศ' : value;
const entries = [
  ['/', 'หน้าหลัก', 'public'], ['/login','เข้าสู่ระบบ','public'], ['/login/line','LINE Login','public'],
  ['/register','ลงทะเบียน','public'], ['/register/status','สถานะลงทะเบียน','public'],
  ['/not-found','ไม่พบหน้าที่ต้องการ','public'], ['/unauthorized','ไม่มีสิทธิ์เข้าหน้านี้','public'], ['/account-blocked','บัญชีถูกระงับ','public'],
  ['/employee','พื้นที่พนักงาน','member'], ['/employee/home','หน้าหลักพนักงาน','member'],
  ['/employee/profile','ข้อมูลของฉัน','member'], ['/employee/select-group','เลือกพื้นที่ทำงาน','member'],
  ['/employee/attendance','เวลาของฉัน','member'], ['/employee/leave','การลา','member'],
  ['/employee/calendar','ปฏิทิน','member'], ['/employee/ot','OT','ot'],
  ['/employee/screen','งานสกรีน','สกรีน'], ['/employee/screen/work-session','เริ่มงาน–จบงานสกรีน','สกรีน'],
  ['/employee/production','งานผลิต','ผลิต'], ['/employee/production/work-session','เริ่มงาน–จบงานผลิต','ผลิต'],
  ['/employee/delivery','บันทึกการขนส่ง','ขนส่ง'], ['/employee/office','งานออฟฟิศ','ออฟฟิศ'],
  ['/executive','พื้นที่ผู้บริหาร','executive'], ['/executive/attendance','เวลาพนักงาน','executive'],
  ['/executive/reports','รายงาน','executive'], ['/executive/ot','รายงาน OT','executive'],
  ['/admin','พื้นที่ Admin','admin'], ['/admin/manage','เมนูจัดการของ Admin','admin'], ['/admin/employees','พนักงาน','admin'], ['/admin/groups','กลุ่มงาน','admin'],
  ['/admin/machines','เครื่องจักร','admin'], ['/admin/items','รายชื่อสินค้า','admin'],
  ['/admin/registration-requests','คำขอลงทะเบียน','admin'], ['/admin/audit-logs','ประวัติระบบ','admin']
];
export const ROUTES = Object.freeze(Object.fromEntries(entries.map(([path,label,rule])=>[path,Object.freeze({path,label,rule})])));
const aliases = {'/admin-employees':'/admin/employees','/admin-groups':'/admin/groups','/admin-machines':'/admin/machines','/admin-item-names':'/admin/items','/admin-registrations':'/admin/registration-requests','/admin/item-names':'/admin/items','/admin/registrations':'/admin/registration-requests',
  '/employee/production-record':'/employee/production','/employee/work-session':'/employee/screen/work-session'};
export function normalizeRoute(value) {
  let path=String(value||'/').replace(/^#/, '').split('?')[0];
  if(!path.startsWith('/'))path='/'+path;
  path=path.replace(/\/+$/,'')||'/';
  return aliases[path]||path;
}
export const workspaceGroups = context => (context?.groups||[]).map(canonicalGroup).filter(g=>['สกรีน','ผลิต','ขนส่ง','ออฟฟิศ'].includes(g));
export function groupRoute(group) {return {'สกรีน':'/employee/screen','ผลิต':'/employee/production','ขนส่ง':'/employee/delivery','ออฟฟิศ':'/employee/office'}[canonicalGroup(group)]||'/unauthorized';}
export function routeDecision(context,value) {
  const path=normalizeRoute(value),entry=ROUTES[path];
  if(entry?.rule==='public')return {allowed:true,path};
  if(!context?.authenticated)return {allowed:false,path,redirect:'/login',reason:'ยังไม่ได้เข้าสู่ระบบ'};
  if(!Number.isFinite(Date.parse(context.session_expires_at))||Date.parse(context.session_expires_at)<=Date.now())return {allowed:false,path,redirect:'/login',reason:'Session หมดอายุ'};
  if(context.active!==true)return {allowed:false,path,redirect:'/account-blocked',reason:'บัญชีถูกระงับ'};
  if(!context.employee_id||!['employee','executive','admin'].includes(context.role))return {allowed:false,path,redirect:'/unauthorized',reason:'ข้อมูลสิทธิ์ไม่สอดคล้อง'};
  const groups=workspaceGroups(context),rule=entry?.rule;
  // Explicit conservative policy: Admin can enter all workspaces. Executive cannot mutate Admin data.
  const allowed=Boolean(entry&&(rule==='member'||rule===context.role||
    (context.role==='admin')||
    (rule==='ot'&&context.role==='employee'&&!groups.includes('ออฟฟิศ')&&groups.some(g=>['สกรีน','ผลิต','ขนส่ง'].includes(g)))||
    groups.includes(rule)));
  if(!entry)return {allowed:false,path,redirect:'/not-found',reason:'ไม่พบหน้าที่ต้องการ'};
  if(!allowed)return {allowed:false,path,redirect:'/unauthorized',reason:'ไม่มีสิทธิ์เข้าหน้านี้'};
  if(context.role==='employee'&&groups.length>1&&!groups.includes(context.selected_group)&&!groups.includes(rule)&&path!=='/employee/select-group')return {allowed:false,path,redirect:'/employee/select-group',reason:'กรุณาเลือกพื้นที่ทำงาน'};
  return {allowed:true,path};
}
export function defaultRoute(context) {
  if(!context?.authenticated)return '/login';
  if(context.role==='admin')return '/admin';
  if(context.role==='executive')return '/executive';
  const groups=workspaceGroups(context);
  if(groups.length>1)return '/employee/select-group';
  return groups.length===1?groupRoute(groups[0]):'/unauthorized';
}

// Only registered internal destinations can survive a login. Query values grant nothing.
export function safeReturnRoute(value) {
  if(typeof value!=='string'||!/^#?\/(?!\/)/.test(value)||/[\\%\x00-\x20]/.test(value))return null;
  const path=normalizeRoute(value);
  return ROUTES[path]&&!['/','/login','/login/line','/register','/register/status','/unauthorized','/account-blocked','/not-found'].includes(path)?path:null;
}

