import { iconMarkup, routeIcon } from '../../js/ui-icons.js?v=1.3.340';
import { getAuthContext, canAccessRoute, selectActiveGroup, availableWorkspaces } from '../../js/access-context.js?v=1.3.333';
import { ROUTES, normalizeRoute, workspaceGroups, groupRoute } from '../../js/route-policy.js?v=1.3.340';
import { escapeHtml } from '../../js/utils.js?v=1.3.186';
import { showStatusModal } from '../../components/status-modal.js?v=1.3.295';
import { getMachineAdminSession } from '../../js/machine-admin-auth.js?v=1.3.333';
import { createSupabaseMachineRepository } from '../../js/machine-admin-repository.js?v=1.3.186';
import { createSupabaseItemNameRepository } from '../../js/item-name-admin-repository.js?v=1.3.186';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../../js/config.js?v=1.3.298';
const adminMenuPresentation = Object.freeze({
  '/admin/employees': {tone:'blue',hint:'ข้อมูลพนักงานและสถานะการใช้งาน',icon:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M21 21v-3a6 6 0 0 0-4-5.65"/>'},
  '/admin/groups': {tone:'violet',hint:'กลุ่มงานหลักและสิทธิ์ของพนักงาน',icon:'<rect x="9" y="3" width="6" height="6" rx="1.5"/><rect x="2" y="15" width="6" height="6" rx="1.5"/><rect x="16" y="15" width="6" height="6" rx="1.5"/><path d="M12 9v3M5 15v-3h14v3"/>'},
  '/admin/machines': {tone:'teal',hint:'ทะเบียนเครื่องจักรและสถานะพร้อมใช้งาน',icon:'<path d="M3 21V9l6 3V7l6 3V4h5v17H3Z"/><path d="M7 17h1M12 17h1M17 17h1"/>'},
  '/admin/items': {tone:'green',hint:'เพิ่มและดูแลชื่อสินค้าที่ใช้ในโรงงาน',icon:'<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="M3 8v9l9 5 9-5V8M12 13v9M7.5 5.5l9 5"/>'},
  '/admin/registration-requests': {tone:'amber',hint:'ตรวจข้อมูลผู้สมัครและกำหนดกลุ่มงาน',icon:'<rect x="4" y="4" width="16" height="18" rx="2"/><rect x="8" y="2" width="8" height="4" rx="1"/><path d="m8 13 2 2 5-5M8 18h8"/>'},
  '/admin/audit-logs': {tone:'slate',hint:'ประวัติการทำรายการและการเปลี่ยนแปลง',icon:'<path d="M3 11a9 9 0 1 1 2.6 7M3 4v7h7"/><path d="M12 7v5l3 2"/>'},
  '/admin/records/employees': {tone:'blue',hint:'ชื่อพนักงาน กลุ่มงาน บทบาท และสถานะบัญชี'},
  '/admin/records/attendance': {tone:'teal',hint:'เวลาเข้า–ออกและสถานะการทำงาน'},
  '/admin/records/leave': {tone:'amber',hint:'คำขอลาและผลการพิจารณา'},
  '/admin/records/calendar': {tone:'slate',hint:'วันทำงาน วันหยุด และปฏิทินแยกกลุ่ม'},
  '/admin/records/work-sessions': {tone:'green',hint:'เครื่องจักร ออเดอร์ และเวลาเริ่ม–จบ'},
  '/admin/records/production': {tone:'green',hint:'จำนวนผลิต ของเสีย และผู้บันทึก'},
  '/admin/records/deliveries': {tone:'teal',hint:'สินค้า ผู้ส่ง และสถานะรายการ'},
  '/admin/records/screen': {tone:'blue',hint:'จำนวนแพ็คและของเสียจากงานสกรีน'},
  '/admin/records/ot': {tone:'amber',hint:'รายการ OT และรูปหลักฐาน'},
  '/admin/records/audit': {tone:'slate',hint:'ผู้แก้ไข เหตุผล และข้อมูลก่อน–หลัง'}
});
const adminManagementSections = Object.freeze([
  {title:'เมนูจัดการข้อมูล',description:'พนักงาน กลุ่มงาน เครื่องจักร รายชื่อสินค้า คำขอลงทะเบียน และประวัติระบบ',paths:['/admin/employees','/admin/groups','/admin/machines','/admin/items','/admin/registration-requests','/admin/audit-logs']},
  {title:'รายการที่บันทึกจากแบบฟอร์ม',description:'เลือกหมวดเพื่อเปิดรายการของหมวดนั้นโดยตรง',paths:['/admin/records/employees','/admin/records/attendance','/admin/records/leave','/admin/records/calendar','/admin/records/work-sessions','/admin/records/production','/admin/records/deliveries','/admin/records/screen','/admin/records/ot','/admin/records/audit']}
]);
function adminHubCardMarkup(item) {
  const tag=item.pending?'div':'a';
  const target=item.pending?'aria-disabled="true"':'href="#'+item.path+'"';
  return '<'+tag+' '+target+' class="admin-hub-card admin-hub-card--'+(item.tone||'teal')+'"><span class="admin-hub-card-top"><span class="admin-hub-icon">'+iconMarkup(routeIcon(item.path))+'</span><span class="admin-hub-arrow" aria-hidden="true">'+iconMarkup('arrow')+'</span></span><span class="admin-hub-card-title">'+escapeHtml(item.label)+'</span><span class="admin-hub-card-hint">'+escapeHtml(item.hint)+'</span>'+(item.pending?'<span class="admin-hub-pending">ยังไม่เปิดใช้งาน</span>':'')+'</'+tag+'>';
}
function renderAdminHome(root,context,links) {
  const executive=normalizeRoute(location.hash)==='/executive/manage';
  const managing=executive||normalizeRoute(location.hash)==='/admin/manage';
  const categoryItems=[
    {path:'/employee',label:'พนักงาน',tone:'blue',hint:'เข้าสู่เมนูและพื้นที่ทำงานของพนักงาน'},
    {path:'/executive',label:'ผู้บริหาร',tone:'teal',hint:'เข้าสู่เมนูและภาพรวมสำหรับผู้บริหาร'},
    {path:'/admin/manage',label:'Admin',tone:'violet',hint:'แก้ไขข้อมูลพนักงาน เครื่องจักร รายชื่อสินค้า คำขอลงทะเบียน และกลุ่มงาน'}
  ].filter(item=>canAccessRoute(item.path));
  const managementSections=(executive?adminManagementSections.slice(0,1):adminManagementSections).map(section=>({...section,items:section.paths.map(path=>{
    const route=links.find(route=>route.path===(executive?path.replace('/admin/','/executive/'):path));
    return route?{...route,...adminMenuPresentation[path]}:null;
  }).filter(Boolean)}));
  const menuMarkup=managing?managementSections.map(section=>'<section class="admin-management-section"><div class="admin-management-section-heading"><div><h2>'+escapeHtml(section.title)+'</h2><p>'+escapeHtml(section.description)+'</p></div></div><nav class="admin-hub-grid" aria-label="'+escapeHtml(section.title)+'">'+section.items.map(adminHubCardMarkup).join('')+'</nav></section>').join(''):'<div class="workspace-section-title"><h2>หมวดการใช้งาน</h2></div><nav class="admin-hub-grid" aria-label="เลือกหมวดการใช้งาน">'+categoryItems.map(adminHubCardMarkup).join('')+'</nav>';
  const title=executive?'เมนูจัดการของผู้บริหาร':managing?'เมนูจัดการของ Admin':'เลือกพื้นที่ใช้งาน';
  root.innerHTML='<section class="admin-hub" aria-labelledby="admin-hub-title"><header class="admin-hub-heading"><div><span class="admin-hub-kicker">ระบบโรงงาน SIP</span><h1 id="admin-hub-title">'+title+'</h1><p>สวัสดี, <strong>'+escapeHtml(context.employee_name||'ผู้ดูแลระบบ')+'</strong><span>'+ (managing?'เลือกข้อมูลที่ต้องการจัดการ':'เลือกหมวดเพื่อเปิดเมนูที่ต้องการใช้งาน')+'</span></p></div><span class="admin-hub-role">'+iconMarkup(routeIcon('/admin'))+(executive?'ผู้บริหาร':'ผู้ดูแลระบบ')+'</span></header>'+
    (managing?'':'<section class="admin-overview" aria-labelledby="admin-overview-title"><div class="admin-overview-heading"><h2 id="admin-overview-title">ภาพรวมข้อมูลกลาง</h2><span>อ่านล่าสุดจาก Supabase</span></div><div class="admin-stats-grid" data-admin-home-stats aria-live="polite"><article class="admin-stat-card is-loading"><span>เครื่องจักรที่เปิดใช้</span><strong>—</strong><small>กำลังโหลด…</small></article><article class="admin-stat-card is-loading"><span>รายการชื่อที่เปิดใช้</span><strong>—</strong><small>กำลังโหลด…</small></article><article class="admin-stat-card"><span>หมวดที่เข้าถึงได้</span><strong>'+categoryItems.length+'</strong><small>ตามสิทธิ์บัญชีปัจจุบัน</small></article></div></section>')+menuMarkup+'</section>';
}
async function loadAdminHomeStats(root,context,categoryCount) {
  const host=root.querySelector('[data-admin-home-stats]');
  if(!host||context.signal?.aborted)return;
  try {
    const session=await getMachineAdminSession();
    if(context.signal?.aborted||!host.isConnected)return;
    if(!session||session.user?.role!=='admin')throw Object.assign(new Error('ไม่มีสิทธิ์ดูข้อมูลกลาง'),{code:'PERMISSION_DENIED'});
    const machineRepo=createSupabaseMachineRepository({supabaseUrl:SUPABASE_URL,publishableKey:SUPABASE_PUBLISHABLE_KEY,accessToken:session.accessToken,user:session.user});
    const itemRepo=createSupabaseItemNameRepository({supabaseUrl:SUPABASE_URL,publishableKey:SUPABASE_PUBLISHABLE_KEY,accessToken:session.accessToken,user:session.user});
    const [machines,items]=await Promise.all([machineRepo.listMachines({}),itemRepo.listItems({})]);
    if(context.signal?.aborted||!host.isConnected)return;
    const activeMachines=machines.filter(row=>row.active===true).length;
    const activeItems=items.filter(row=>row.active===true).length;
    host.innerHTML='<article class="admin-stat-card"><span>เครื่องจักรที่เปิดใช้</span><strong>'+activeMachines+'</strong><small>ทั้งหมด '+machines.length+' เครื่อง</small></article><article class="admin-stat-card"><span>รายการชื่อที่เปิดใช้</span><strong>'+activeItems+'</strong><small>ทั้งหมด '+items.length+' รายการ</small></article><article class="admin-stat-card"><span>หมวดที่เข้าถึงได้</span><strong>'+categoryCount+'</strong><small>ตามสิทธิ์บัญชีปัจจุบัน</small></article>';
  } catch(error) {
    if(context.signal?.aborted||!host.isConnected)return;
    host.innerHTML='<div class="admin-stats-error" role="alert"><span>โหลดภาพรวมข้อมูลกลางไม่สำเร็จ</span><button class="button button-small" type="button" data-retry-admin-home-stats>ลองโหลดใหม่</button></div>';
    host.querySelector('[data-retry-admin-home-stats]')?.addEventListener('click',event=>{event.currentTarget.disabled=true;void loadAdminHomeStats(root,context,categoryCount);});
  }
}
const workspaceHints={
 '/executive/manage':'จัดการพนักงาน กลุ่มงาน เครื่องจักร สินค้า คำขอลงทะเบียน และประวัติระบบ',
 '/employee/profile':'ข้อมูลส่วนตัวและบัญชีของฉัน', '/employee/attendance':'ตรวจสอบเวลาเข้า–ออกงานของฉัน',
 '/employee/leave':'คำขอลาและประวัติการลา', '/employee/calendar':'วันทำงาน วันหยุด และกิจกรรม',
 '/employee/ot':'งานล่วงเวลาและรายการของฉัน', '/employee/screen':'พื้นที่ทำงานของกลุ่มสกรีน',
 '/employee/screen/work-session':'เริ่มงานและจบงานของกลุ่มสกรีน', '/employee/production':'พื้นที่ทำงานของกลุ่มผลิต',
 '/employee/production/work-session':'เริ่มงานและจบงานของกลุ่มผลิต', '/employee/delivery':'เมนูการทำงานของกลุ่มขนส่ง', '/employee/delivery/record':'บันทึกการขนส่ง',
 '/employee/office':'พื้นที่ทำงานของกลุ่มออฟฟิศ', '/employee/select-group':'เปลี่ยนพื้นที่จากกลุ่มงานที่ได้รับ',
 '/executive/attendance':'ภาพรวมเวลาทำงานของพนักงาน', '/executive/work-session':'ดูรายการเริ่มงาน–จบงาน',
 '/executive/leave':'ตรวจคำขอลาและรายงานตามช่วงวันที่', '/executive/calendar':'กำหนดวันทำงานของแต่ละกลุ่ม',
 '/executive/production':'ดูรายการงานสกรีนที่บันทึกแล้ว', '/executive/delivery':'ดูรายการขนส่งที่บันทึกแล้ว',
 '/executive/production-record':'ดูยอดผลิตที่บันทึกแล้ว', '/executive/reports':'รายงานและภาพรวมการทำงาน',
 '/executive/ot':'ภาพรวมงานล่วงเวลา', '/executive/reports-menu':'เลือกดูรายงานสรุปหรือรายงาน OT', '/employee':'เมนูการทำงานของฉัน','/employee/home':'กลับหน้าหลักพนักงาน',
 '/executive':'ภาพรวมและรายงานสำหรับผู้บริหาร', '/admin':'กลับพื้นที่ Admin'
};
const workspaceHomes=['/employee','/employee/home','/executive','/employee/office','/employee/screen','/employee/production','/employee/delivery','/employee/select-group'];
function workspaceLink(route){
 const enabled=workspaceHomes.includes(route.path)||route.path==='/executive/manage'||['/employee/leave','/employee/ot','/employee/profile','/employee/attendance','/employee/calendar',
  '/executive/attendance','/executive/work-session','/executive/leave','/executive/calendar','/executive/production','/executive/delivery','/executive/production-record','/executive/reports','/executive/ot','/executive/reports-menu',
  '/employee/screen/work-session','/employee/production/work-session','/employee/delivery/record'].includes(route.path);
 return '<'+(enabled?'a href="#'+route.path+'"':'div aria-disabled="true"')+' class="workspace-card"><span class="workspace-card-icon">'+iconMarkup(routeIcon(route.path))+'</span><span class="workspace-card-copy"><strong>'+escapeHtml(route.label)+'</strong><span>'+escapeHtml(route.hint||workspaceHints[route.path]||'เลือกเพื่อเปิดพื้นที่นี้')+'</span>'+(!enabled?'<span class="admin-hub-pending">ยังไม่เปิดใช้งาน</span>':'')+'</span>'+(enabled?'<span class="workspace-card-arrow">'+iconMarkup('arrow')+'</span>':'')+'</'+(enabled?'a':'div')+'>';
}
function renderWorkspace(root,context,path,entry,links){
 const home=workspaceHomes.includes(path);
 const label=['/employee/office','/employee/screen','/employee/production','/employee/delivery'].includes(path)?context.selected_group||entry?.label:entry?.label||'พื้นที่ทำงาน';
 const roleLabel=context.role==='executive'?'ผู้บริหาร':context.role==='admin'?'ผู้ดูแลระบบ':'พนักงาน';
 root.innerHTML='<section class="workspace-hub"><header class="workspace-heading"><span class="workspace-heading-icon">'+iconMarkup(routeIcon(path))+'</span><div><span class="workspace-kicker">'+escapeHtml(roleLabel)+(context.selected_group?' · '+escapeHtml(context.selected_group):'')+'</span><h1>'+escapeHtml(label)+'</h1><p>'+escapeHtml(home?'สวัสดี, '+(context.employee_name||'')+' เลือกเมนูที่ต้องการใช้งาน':workspaceHints[path]||'ข้อมูลและเมนูที่เกี่ยวข้อง')+'</p></div></header>'+
 '<div class="form-actions">'+((path.startsWith('/employee/')||path==='/executive'||path.startsWith('/executive/'))?'<a class="button" href="#/employee">ย้อนกลับไปเลือกพื้นที่</a>':'')+(canAccessRoute('/admin')?'<a class="button" href="#/admin">กลับหน้าเลือกหมวด</a>':'')+'</div>'+
 (!home?'<section class="workspace-pending" role="status"><span>'+iconMarkup('info')+'</span><div><strong>หน้านี้ยังไม่เปิดใช้งาน</strong><p>ยังไม่สามารถดูหรือบันทึกรายการในหน้านี้ได้ เลือกเมนูอื่นด้านล่างเพื่อใช้งานต่อ</p></div></section>':'')+
 '<div class="workspace-section-title"><h2>'+(home?'เมนูของฉัน':'เมนูที่เกี่ยวข้อง')+'</h2><span>แสดงตามสิทธิ์ปัจจุบัน</span></div><nav class="workspace-menu" aria-label="เมนูตามสิทธิ์">'+links.filter(r=>r.path!==path&&r.path!=='/employee/select-group').map(workspaceLink).join('')+'</nav></section>';
}
export async function render(root) {
  const context=getAuthContext(),path=normalizeRoute(location.hash),entry=ROUTES[path];
  root.innerHTML='<section class="card card-pad"><h1>'+escapeHtml(entry?.label||'ไม่มีสิทธิ์เข้าหน้านี้')+'</h1><div data-access-content></div></section>';
  const content=root.querySelector('[data-access-content]');
  if(['/unauthorized','/account-blocked','/not-found'].includes(path)) {
    root.innerHTML='<section class="ui-access-state card"><span class="ui-state-icon">'+iconMarkup('lock')+'</span><span class="eyebrow">การเข้าถึงบัญชี</span><h1>'+escapeHtml(entry.label)+'</h1><p>'+escapeHtml(path==='/not-found'?'ตรวจสอบลิงก์ หรือกลับไปเลือกพื้นที่ทำงาน':path==='/account-blocked'?'กรุณาติดต่อ Admin เพื่อตรวจสอบสถานะบัญชีของคุณ':'บัญชีของคุณยังไม่มีสิทธิ์สำหรับหน้านี้ กรุณากลับไปเลือกเมนูที่ใช้งานได้')+'</p><a class="button button-primary" href="#/home">กลับหน้าหลัก</a><a class="button" href="#/employee/select-group">เลือกพื้นที่ทำงาน</a></section>';return;
  }
  if(['/employee','/employee/select-group'].includes(path)) {
    root.querySelector('section').classList.add('workspace-selector','workspace-selector--landing');
    if(path==='/employee')root.querySelector('h1').textContent='เลือกพื้นที่ทำงาน';
    const areas=availableWorkspaces(context).filter(area=>path!=='/employee'||!['Admin','ผู้บริหาร'].includes(area.id));
    const roleLabel=context.role==='admin'?'ผู้ดูแลระบบ':context.role==='executive'?'ผู้บริหาร':'พนักงาน';
    const selectedArea=areas.find(area=>area.id===context.selected_workspace);
    content.innerHTML='<p class="workspace-select-hint">'+(path==='/employee'?'เลือกกลุ่มงานเพื่อดูเมนูและรายละเอียดพื้นที่ ระบบจะแสดงเฉพาะพื้นที่ที่บัญชีนี้ได้รับอนุญาต':'เลือกพื้นที่ทำงาน ระบบจะตรวจสิทธิ์ล่าสุดก่อนเปิดพื้นที่')+'</p>'+
      '<section class="workspace-facts" aria-label="สรุปพื้นที่ที่เข้าใช้งานได้"><div class="workspace-fact workspace-fact--count"><span class="workspace-fact-mark" aria-hidden="true">'+iconMarkup('home')+'</span><span><strong>'+areas.length+'</strong><small>พื้นที่ที่เข้าใช้งานได้</small></span></div><div class="workspace-fact workspace-fact--selected"><span class="workspace-fact-mark" aria-hidden="true">'+iconMarkup('check')+'</span><span><strong>'+escapeHtml(selectedArea?.label||'ยังไม่ได้เลือก')+'</strong><small>พื้นที่ที่เลือกอยู่</small></span></div><div class="workspace-fact workspace-fact--role"><span class="workspace-fact-mark" aria-hidden="true">'+iconMarkup('shield')+'</span><span><strong>'+escapeHtml(roleLabel)+'</strong><small>สิทธิ์บัญชีปัจจุบัน</small></span></div></section>'+
      (canAccessRoute('/admin')?'<div class="form-actions workspace-selector-actions"><a class="button" href="#/admin">กลับหน้าเลือกหมวด</a></div>':'')+'<div class="workspace-menu">'+areas.map(area=>'<button type="button" class="workspace-card workspace-card--choice" data-workspace="'+escapeHtml(area.path)+'" data-group="'+escapeHtml(area.id)+'" aria-pressed="'+String(context.selected_workspace===area.id)+'"><span class="workspace-card-icon">'+iconMarkup(routeIcon(area.path))+'</span><span class="workspace-card-copy"><strong>'+escapeHtml(area.label)+'</strong><span>'+escapeHtml(workspaceHints[area.path]||'เข้าสู่พื้นที่ '+area.label)+'</span><small class="workspace-card-state">'+(context.selected_workspace===area.id?'● กำลังใช้งาน':'เปิดพื้นที่นี้')+'</small></span><span class="workspace-card-arrow" aria-hidden="true">'+iconMarkup('arrow')+'</span></button>').join('')+'</div>'+(!areas.length?'<p role="status">ไม่มีพื้นที่ที่เข้าใช้งานได้ กรุณาติดต่อ Admin หรือออกจากระบบ</p>':'')+'<p class="workspace-selection-error" role="alert"></p>';
    let busy=false;
    for(const button of content.querySelectorAll('[data-group]'))button.addEventListener('click',async()=>{
      if(busy)return;busy=true;
      content.querySelectorAll('button').forEach(item=>item.disabled=true);
      const modal=showStatusModal({message:'กำลังตรวจสอบสิทธิ์และเปลี่ยนพื้นที่',tone:'working'});
      try {const selected=await selectActiveGroup(button.dataset.group);modal.close();location.hash='#'+selected.workspace_path;}
      catch(error){modal.close();if(content.isConnected)content.querySelector('[role="alert"]').textContent=error.message;}
      finally{busy=false;content.querySelectorAll('button').forEach(item=>item.disabled=false);}
    });return;
  }
  const workspace=path.startsWith('/admin')?'/admin':path.startsWith('/executive')?'/executive':'/employee';
  const links=Object.values(ROUTES).filter(r=>r.path.startsWith(workspace)&&canAccessRoute(r.path)&&
    (r.rule==='ot'||!workspaceGroups(context).includes(r.rule)||!context.selected_group||r.rule===context.selected_group));
  if(path==='/admin'||path==='/admin/manage'||path==='/executive/manage'){renderAdminHome(root,context,links);if(path==='/admin')void loadAdminHomeStats(root,context,root.querySelectorAll('.admin-hub-grid .admin-hub-card').length);return;}
  const selected=context.selected_group;
  const filtered=links.filter(route=>{
    // Executive reports stay grouped under the dedicated report hub.
    if(path==='/executive'&&['/executive/reports','/executive/ot'].includes(route.path))return false;
    if(path==='/executive'&&['/executive/employees','/executive/groups','/executive/machines','/executive/items','/executive/registration-requests','/executive/audit-logs'].includes(route.path))return false;
    if(['/employee','/employee/home'].includes(route.path))return false;
    if(route.path==='/employee/ot')return true;
    if(['สกรีน','ผลิต','ขนส่ง','ออฟฟิศ'].includes(route.rule))return route.rule===selected;
    return true;
  });
  renderWorkspace(root,context,path,entry,filtered);
}


