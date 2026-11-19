import * as api from '../../adapters/package06.js?v=1.3.397';
import { escapeHtml as e } from '../../js/utils.js?v=1.3.397';

const periods=[['today','วันนี้'],['week','สัปดาห์นี้'],['month','เดือนนี้']];
const number=value=>Number(value||0).toLocaleString('th-TH');
const duration=minutes=>`${String(Math.floor(Number(minutes||0)/60)).padStart(2,'0')}:${String(Number(minutes||0)%60).padStart(2,'0')}`;
const metric=(label,value,unit='')=>'<div class="report-category-metric"><span>'+e(label)+'</span><strong>'+e(number(value))+(unit?' '+e(unit):'')+'</strong></div>';
const textMetric=(label,value)=>'<div class="report-category-metric"><span>'+e(label)+'</span><strong>'+e(value)+'</strong></div>';
function categoryCard(title,value,unit,metrics,note='') {
  return '<section class="card card-pad report-category-card"><header><h2>'+e(title)+'</h2></header><div class="report-category-primary"><strong>'+e(number(value))+'</strong><span>'+e(unit)+'</span></div><div class="report-category-metrics">'+metrics.join('')+'</div>'+(note?'<p class="small-muted">'+e(note)+'</p>':'')+'</section>';
}
function reportCategories(data) {
  const c=data.categories;
  return [
    categoryCard('เวลาเข้า–ออก',c.attendance.records,'รายการ',[metric('มาทำงาน',c.attendance.present),metric('มาสาย',c.attendance.late),metric('ขาดงาน',c.attendance.absent)]),
    categoryCard('การลา',c.leave.requests,'คำขอ',[metric('อนุมัติ',c.leave.approved),metric('รอตรวจ',c.leave.pending),metric('ปฏิเสธ',c.leave.rejected)]),
    categoryCard('ปฏิทินงาน',c.calendar.entries,'วัน',[metric('กำหนดทำงาน',c.calendar.workdays),metric('วันหยุด',c.calendar.holidays)]),
    categoryCard('เริ่มงาน–จบงาน',c.workSessions.total,'งาน',[metric('จบงานแล้ว',c.workSessions.completed),metric('กำลังทำ',c.workSessions.inProgress),metric('สกรีน',c.workSessions.screen),metric('ผลิต',c.workSessions.production)]),
    categoryCard('งานสกรีน',c.screen.entries,'รายการ',[metric('แพ็คดี',c.screen.goodPacks,'แพ็ค'),metric('เสียจากสกรีน',c.screen.screenDefects,'ขวด'),metric('เสียจากผลิต',c.screen.productionDefects,'ขวด')],'นับรายการจากแบบฟอร์มสกรีนเดิม; งานที่ผูกกับเริ่มงาน–จบงานแสดงในหมวดนั้น'),
    categoryCard('งานผลิต',c.production.entries,'รายการ',[metric('ผลิต',c.production.quantity,'ใบ'),metric('ของเสีย',c.production.defective,'ใบ')]),
    categoryCard('การขนส่ง',c.delivery.entries,'รายการ',[metric('จำนวนสินค้าที่ส่ง',c.delivery.quantity)]),
    categoryCard('ทำงานล่วงเวลา (OT)',c.overtime.reports,'รายงาน',[metric('พนักงาน',c.overtime.employees),textMetric('เวลารวม',duration(c.overtime.minutes))])
  ].join('');
}
export async function render(root,context){
  let selected='today',generation=0;
  const draw=async()=>{
    const version=++generation;
    root.innerHTML='<p class="page-loading">กำลังโหลดสรุปการทำงาน…</p>';
    try{
      const data=await api.readReport(selected);
      if(version!==generation||context.signal?.aborted)return;
      if(!data.categories)throw new Error('ข้อมูลสรุปหมวดงานยังไม่ครบ กรุณารีเฟรชหรือติดต่อผู้ดูแล');
      const label=periods.find(([key])=>key===selected)?.[1]||selected;
      root.innerHTML='<div class="page-heading"><div><p class="eyebrow">รายงานการทำงาน</p><h1>สรุปผลการทำงาน</h1><p>สรุปข้อมูลจากทุกหมวดงานในช่วงที่เลือก</p></div><button class="button" data-refresh>รีเฟรช</button></div>'+
        '<div class="chip-row">'+periods.map(([key,title])=>'<button type="button" class="chip" data-period="'+key+'" aria-pressed="'+(key===selected)+'">'+title+'</button>').join('')+'</div>'+
        '<section class="card card-pad attendance-section"><p class="eyebrow">ช่วงสรุป</p><h2>'+e(label)+'</h2><p class="small-muted">อัปเดต '+e(new Intl.DateTimeFormat('th-TH',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Bangkok'}).format(new Date(data.source.asOf)))+' · เวลาไทย</p></section>'+
        '<section class="report-categories attendance-section" aria-label="สรุปทุกหมวดการทำงาน">'+reportCategories(data)+'</section>'+
        '<section class="card card-pad attendance-section"><p class="eyebrow">ผู้บันทึกยอดผลิตสูงสุดในช่วงนี้</p><h2>'+e(data.outstanding||'—')+'</h2><p class="small-muted">จัดอันดับจากยอดผลิตที่บันทึก ไม่ใช่การประเมินผลงาน</p></section>';
      root.querySelectorAll('[data-period]').forEach(button=>button.addEventListener('click',()=>{selected=button.dataset.period;void draw();}));
      root.querySelector('[data-refresh]')?.addEventListener('click',()=>void draw());
    }catch(error){
      if(version!==generation||context.signal?.aborted)return;
      root.innerHTML='<div class="notice notice-danger" role="alert">โหลดข้อมูลสรุปไม่สำเร็จ</div><button type="button" class="button" data-retry-summary>ลองใหม่</button>';
      root.querySelector('[data-retry-summary]').addEventListener('click',()=>void draw());
      context.showToast(error.message||'เชื่อมต่อ ระบบ ไม่สำเร็จ','error');
    }
  };
  context.onDataChange?.(()=>void draw());
  await draw();
}
