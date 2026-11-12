import * as api from '../../adapters/package06.js?v=1.3.186';
import { statCard } from '../../components/app-card.js?v=1.3.340';
import { escapeHtml as e } from '../../js/utils.js?v=1.3.186';

const periods=[['today','วันนี้'],['week','สัปดาห์นี้'],['month','เดือนนี้']];
export async function render(root,context){
  let selected='today',generation=0;
  const draw=async()=>{
    const version=++generation;
    root.innerHTML='<p class="page-loading">กำลังโหลดสรุปจาก Supabase…</p>';
    try{
      const data=await api.readReport(selected);
      if(version!==generation||context.signal?.aborted)return;
      const label=periods.find(([key])=>key===selected)?.[1]||selected;
      root.innerHTML='<div class="page-heading"><div><p class="eyebrow">รายงาน Supabase</p><h1>สรุปผลการทำงาน</h1><p>ตัวเลขคำนวณจากรายการที่บัญชีนี้มีสิทธิ์อ่าน</p></div><button class="button" data-refresh>รีเฟรช</button></div>'+
        '<div class="chip-row">'+periods.map(([key,title])=>'<button type="button" class="chip" data-period="'+key+'" aria-pressed="'+(key===selected)+'">'+title+'</button>').join('')+'</div>'+
        '<section class="card card-pad attendance-section"><p class="eyebrow">ช่วงสรุป</p><h2>'+e(label)+'</h2><p class="small-muted">อัปเดต '+e(new Intl.DateTimeFormat('th-TH',{dateStyle:'medium',timeStyle:'short'}).format(new Date(data.source.asOf)))+'</p></section>'+
        '<div class="grid grid-3 attendance-section">'+statCard('มาทำงาน',data.present,'รายการ')+statCard('มาสาย',data.late,'รายการ')+statCard('ลาอนุมัติ',data.leave,'รายการ')+statCard('ขาดงาน',data.absent,'รายการ')+statCard('ผลิต',Number(data.production).toLocaleString('th-TH'),'ใบ')+statCard('ขนส่ง',data.delivery,'รายการ')+'</div>'+
        '<section class="card card-pad attendance-section"><p class="eyebrow">งานผลิต</p><h2>'+e(data.outstanding||'—')+'</h2><p class="small-muted">ผู้บันทึกยอดผลิตสูงสุดในช่วงนี้ ตามรายการที่บัญชีนี้มีสิทธิ์อ่าน</p></section>';
      root.querySelectorAll('[data-period]').forEach(button=>button.addEventListener('click',()=>{selected=button.dataset.period;void draw();}));
      root.querySelector('[data-refresh]')?.addEventListener('click',()=>void draw());
    }catch(error){
      if(version!==generation||context.signal?.aborted)return;
      root.innerHTML='<div class="notice notice-danger">โหลดข้อมูลจาก Supabase ไม่สำเร็จ</div>';
      context.showToast(error.message||'เชื่อมต่อ Supabase ไม่สำเร็จ','error');
    }
  };
  context.onDataChange?.(()=>void draw());
  await draw();
}
