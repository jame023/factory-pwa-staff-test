import { createProductionReportService } from '../../js/production-report-service.js?v=1.3.404';
import * as workApi from '../../adapters/package07.js?v=1.3.404';
import { getAuthContext } from '../../js/access-context.js?v=1.3.404';
import { requireOnlineAction } from '../../js/offline.js?v=1.3.404';
import { escapeHtml as e, thaiDateTime } from '../../js/utils.js?v=1.3.404';

const MAX_UPLOAD=512*1024, MAX_SOURCE=20*1024*1024;
const TYPES=new Set(['image/jpeg','image/png','image/webp']);
const friendlyError=error=>error?.message||'ทำรายการไม่สำเร็จ กรุณาลองใหม่';

async function preparePhoto(source) {
  if(!(source instanceof File)||!TYPES.has(source.type))throw new Error('เลือกรูป JPG, PNG หรือ WebP');
  if(source.size<1||source.size>MAX_SOURCE)throw new Error('รูปต้นฉบับต้องมีขนาดไม่เกิน 20 MB');
  if(source.size<=MAX_UPLOAD)return source;
  if(typeof createImageBitmap!=='function')throw new Error('เบราว์เซอร์นี้ยังเตรียมรูปไม่ได้ กรุณาเลือกรูปขนาดไม่เกิน 512 KB');
  let bitmap;
  try{bitmap=await createImageBitmap(source);}catch{throw new Error('เปิดรูปนี้ไม่ได้ กรุณาเลือกรูปอื่น');}
  try{
    const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
    if(!ctx)throw new Error('เตรียมรูปไม่สำเร็จ');
    let scale=Math.min(1,1800/Math.max(bitmap.width,bitmap.height)),quality=.86,blob=null;
    for(let attempt=0;attempt<12;attempt++){
      canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
      ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
      blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
      if(blob&&blob.size<=MAX_UPLOAD)return new File([blob],source.name.replace(/\.[^.]+$/,'')+'.jpg',{type:'image/jpeg',lastModified:Date.now()});
      if(attempt%2===0)quality=Math.max(.4,quality-.1);else scale*=.8;
    }
    throw new Error('ลดขนาดรูปไม่สำเร็จ กรุณาเลือกรูปอื่น');
  }finally{bitmap.close?.();}
}

function reportCard(row){
  const sender=row.sender_name;
  return '<article class="card card-pad production-photo-report" data-report-card="'+e(row.id)+'"><div class="list-row"><div class="list-main"><h3 class="list-title">'+e(sender||'—')+'</h3><p class="list-meta">'+e(row.machine_name||'—')+' · '+e(thaiDateTime(row.submitted_at))+'</p></div><span class="badge badge-info">ส่งแล้ว</span></div><div class="production-report-photo" data-photo-host><button class="button button-small" type="button" data-open-photo="'+e(row.id)+'">เปิดรูป</button></div><span hidden data-photo-path="'+e(row.photo_path)+'"></span></article>';
}

export async function render(root,context){
  const auth=getAuthContext();
  const manager=['executive','admin'].includes(auth?.role);
  const productionWorkspace=auth?.selected_workspace==='ผลิต';
  const canSubmit=auth?.active===true&&(
    (auth.role==='employee'&&Array.isArray(auth.groups)&&auth.groups.includes('ผลิต')&&productionWorkspace)||
    (auth.role==='admin'&&productionWorkspace)
  );
  if(!manager&&!canSubmit){root.innerHTML='<section class="notice notice-warning"><h1>ไม่มีสิทธิ์เข้าหน้านี้</h1><p>เมนูนี้สำหรับพนักงานกลุ่มผลิต ผู้บริหาร และ Admin</p></section>';return;}
  const service=createProductionReportService();
  let machines=[],machineError='';
  if(canSubmit){
    try{machines=(await workApi.readWorkOptions('ผลิต')).machines||[];}
    catch(error){machineError=friendlyError(error);}
  }
  root.innerHTML='<div class="page-heading"><div><p class="eyebrow">ผลิต</p><h1>รายงานการผลิต</h1><p>'+(canSubmit?'ถ่ายรูปและส่งรายงานจากพื้นที่ผลิต':manager?'ดูรูปภาพ รายชื่อผู้ส่ง เครื่องจักร และเวลาที่ส่งจากพื้นที่ผลิต':'ถ่ายรูปและส่งรายงานให้ผู้บริหารดู')+'</p></div><button class="button" type="button" data-refresh-report>รีเฟรช</button></div>'+
    (canSubmit?'<section class="card form-card"><h2>ส่งรายงานการผลิต</h2><p>ชื่อผู้ส่งและเวลาจะยืนยันจากบัญชีและเวลาของระบบ</p><form data-production-report-form><div class="form-grid"><label class="field"><span>ชื่อผู้ส่ง</span><input value="'+e(auth.employee_name||context.user.name||'')+'" readonly></label><label class="field"><span>เครื่องจักร</span><select name="machineId" required '+(!machines.length?'disabled':'')+'><option value="">'+(machineError?'โหลดเครื่องจักรไม่สำเร็จ':'เลือกเครื่องจักร')+'</option>'+machines.map(machine=>'<option value="'+e(machine.id)+'">'+e(machine.machine_code||'')+' · '+e(machine.machine_name)+'</option>').join('')+'</select>'+(machineError?'<small class="field-error">'+e(machineError)+'</small>':'')+'</label><div class="field field-full"><span>รูปภาพรายงาน</span><div class="production-photo-upload" data-photo-picker data-has-photo="false"><input name="photo" type="file" accept="image/jpeg,image/png,image/webp" hidden><div class="production-photo-empty" data-photo-empty><span class="production-photo-icon" aria-hidden="true">📷</span><div class="production-photo-copy"><strong>เพิ่มรูปภาพรายงาน</strong><small>ถ่ายรูปหน้างานหรือเลือกภาพจากอุปกรณ์</small></div><div class="production-photo-actions"><button class="button button-primary" type="button" data-photo-camera>ถ่ายรูป</button><button class="button button-secondary" type="button" data-photo-library>เลือกรูป</button></div></div><div class="production-photo-selected" data-photo-selected hidden><img alt="ตัวอย่างรูปภาพรายงาน" data-photo-preview><span class="production-photo-selected-copy"><strong data-photo-name></strong><small data-photo-size></small></span><button class="button button-secondary" type="button" data-photo-change>เปลี่ยนรูป</button></div><small class="help-text">JPG, PNG หรือ WebP · ระบบย่อรูปให้อัตโนมัติ · ไม่เกิน 512 KB หลังเตรียมรูป</small><span role="status" data-photo-status>ยังไม่ได้เลือกรูป</span></div></div><div class="form-actions"><button class="button button-primary" type="submit" '+(!machines.length?'disabled':'')+'>ส่งรายงานการผลิต</button></div></form></section>':'')+
    '<div class="section-title"><div><h2>'+(manager?'รายงานที่ส่งจากพื้นที่ผลิต':'ประวัติรายงานของฉัน')+'</h2><p>แสดงรายการล่าสุดไม่เกิน 40 รายการ</p></div></div><div class="production-report-list" data-report-list><p class="page-loading">กำลังโหลดรายงาน…</p></div>';
  const list=root.querySelector('[data-report-list]');
  const load=async()=>{
    list.innerHTML='<p class="page-loading">กำลังโหลดรายงาน…</p>';
    try{
      const rows=await service.listReports({limit:40});
      if(context.signal?.aborted||!list.isConnected)return;
      list.innerHTML=rows.length?rows.map(reportCard).join(''):'<div class="empty-state">ยังไม่มีรายงานการผลิต</div>';
      list.querySelectorAll('[data-open-photo]').forEach(button=>button.addEventListener('click',async()=>{
        if(button.disabled)return;button.disabled=true;
        const card=button.closest('[data-report-card]'),host=card.querySelector('[data-photo-host]'),path=card.querySelector('[data-photo-path]').dataset.photoPath;
        try{
          const url=await service.signedPhoto(path);
          if(context.signal?.aborted||!host.isConnected)return;
          host.innerHTML='<a href="'+e(url)+'" target="_blank" rel="noopener" aria-label="เปิดรูปต้นฉบับ"><img loading="lazy" alt="รูปแนบรายงานจาก '+e(manager?'พนักงาน '+card.querySelector('.list-title')?.textContent||'พนักงาน':'รายงานของฉัน')+'" src="'+e(url)+'"></a>';
        }catch(error){button.disabled=false;context.showToast(friendlyError(error),'error');}
      }));
    }catch(error){if(context.signal?.aborted||!list.isConnected)return;list.innerHTML='<div class="notice notice-error" role="alert">'+e(friendlyError(error))+' <button class="button button-small" type="button" data-retry-reports>ลองใหม่</button></div>';list.querySelector('[data-retry-reports]')?.addEventListener('click',()=>void load());}
  };
  root.querySelector('[data-refresh-report]')?.addEventListener('click',()=>void load());
  const form=root.querySelector('[data-production-report-form]'),photoInput=form?.elements.photo,photoPicker=form?.querySelector('[data-photo-picker]');
  let photoPreviewUrl=null;
  context.signal?.addEventListener('abort',()=>{if(photoPreviewUrl)URL.revokeObjectURL(photoPreviewUrl);},{once:true});
  const openPhotoPicker=camera=>{
    if(camera)photoInput?.setAttribute('capture','environment');else photoInput?.removeAttribute('capture');
    photoInput?.click();
  };
  form?.querySelector('[data-photo-camera]')?.addEventListener('click',()=>openPhotoPicker(true));
  form?.querySelector('[data-photo-library]')?.addEventListener('click',()=>openPhotoPicker(false));
  form?.querySelector('[data-photo-change]')?.addEventListener('click',()=>openPhotoPicker(false));
  photoInput?.addEventListener('change',()=>{
    const status=form.querySelector('[data-photo-status]'),file=photoInput.files?.[0];
    const empty=form.querySelector('[data-photo-empty]'),selected=form.querySelector('[data-photo-selected]');
    if(photoPreviewUrl){URL.revokeObjectURL(photoPreviewUrl);photoPreviewUrl=null;}
    if(!file){photoPicker.dataset.hasPhoto='false';empty.hidden=false;selected.hidden=true;status.textContent='ยังไม่ได้เลือกรูป';return;}
    if(!TYPES.has(file.type)||file.size<1||file.size>MAX_SOURCE){
      photoInput.value='';photoPicker.dataset.hasPhoto='false';empty.hidden=false;selected.hidden=true;
      status.textContent=!TYPES.has(file.type)?'ไฟล์นี้ไม่รองรับ เลือก JPG, PNG หรือ WebP':'รูปต้นฉบับต้องมีขนาดไม่เกิน 20 MB';
      return;
    }
    photoPicker.dataset.hasPhoto='true';empty.hidden=true;selected.hidden=false;
    photoPreviewUrl=URL.createObjectURL(file);selected.querySelector('[data-photo-preview]').src=photoPreviewUrl;
    selected.querySelector('[data-photo-name]').textContent=file.name;
    selected.querySelector('[data-photo-size]').textContent=file.size>MAX_UPLOAD?'ระบบจะย่อรูปก่อนส่ง · '+Math.ceil(file.size/1024)+' KB':Math.ceil(file.size/1024)+' KB';
    status.textContent='เลือกรูปแล้ว';
  });
  form?.addEventListener('submit',async event=>{
    event.preventDefault();if(!requireOnlineAction('รายงานการผลิต'))return;
    const button=form.querySelector('[type="submit"]');if(button.disabled)return;
    const file=photoInput.files?.[0],machineId=form.elements.machineId.value;
    if(!file||!machineId){context.showToast('เลือกเครื่องจักรและรูปภาพก่อนส่ง','error');return;}
    button.disabled=true;button.textContent='กำลังเตรียมและส่งรูป…';
    try{
      const prepared=await preparePhoto(file);
      await service.submit({machineId,file:prepared,ownerId:auth.employee_id});
      if(photoPreviewUrl)URL.revokeObjectURL(photoPreviewUrl);
      context.showToast('ส่งรายงานการผลิตแล้ว','success');
      await render(root,context);
    }catch(error){context.showToast(friendlyError(error),'error');button.disabled=false;button.textContent='ส่งรายงานการผลิต';}
  });
  await load();
}
