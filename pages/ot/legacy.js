import * as workApi from "../../adapters/package07-legacy.js?v=1.3.259";
import { escapeHtml as e, bangkokToday, thaiDateTime } from "../../js/utils.js?v=1.3.186";
import { requireOnlineAction } from "../../js/offline.js?v=1.3.186";

const MAX_PHOTOS=5, MAX_FILE_BYTES=512*1024, MAX_TOTAL_BYTES=2*1024*1024, MAX_SOURCE_BYTES=20*1024*1024;
const formatDuration=hours=>{
  const minutes=Math.round(Number(hours)*60);
  if(!Number.isFinite(minutes))return String(hours??"");
  return String(Math.floor(minutes/60)).padStart(2,"0")+":"+String(minutes%60).padStart(2,"0");
};
const TYPES=["image/png","image/jpeg","image/gif","image/webp"];
const readImage=file=>new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onload=()=>resolve({name:file.name,dataUrl:reader.result});
  reader.onerror=()=>reject(new Error("อ่านรูปไม่สำเร็จ"));
  reader.readAsDataURL(file);
});
const canvasBlob=(canvas,quality)=>new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",quality));
async function compressImage(file,targetBytes) {
  if(file.size<=targetBytes)return {file,compressed:false};
  if(typeof createImageBitmap!=="function")throw new Error("เบราว์เซอร์นี้ยังบีบอัดรูปอัตโนมัติไม่ได้ กรุณาใช้รูปขนาดเล็กลง");
  let bitmap;
  try{bitmap=await createImageBitmap(file);}catch{throw new Error("เปิดรูปนี้เพื่อบีบอัดไม่ได้ กรุณาเลือกรูป JPG, PNG หรือ WebP");}
  try {
    let scale=Math.min(1,2000/Math.max(bitmap.width,bitmap.height));
    const canvas=document.createElement("canvas"),ctx=canvas.getContext("2d");
    if(!ctx)throw new Error("เตรียมพื้นที่บีบอัดรูปไม่สำเร็จ");
    let quality=.88,blob=null;
    for(let attempt=0;attempt<10;attempt++){
      canvas.width=Math.max(1,Math.round(bitmap.width*scale));
      canvas.height=Math.max(1,Math.round(bitmap.height*scale));
      ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
      blob=await canvasBlob(canvas,quality);
      if(blob&&blob.size<=targetBytes){
        const base=file.name.replace(/\.[^.]+$/,"");
        return {file:new File([blob],base+".jpg",{type:"image/jpeg",lastModified:Date.now()}),compressed:true};
      }
      if(attempt%2===0)quality=Math.max(.42,quality-.12);
      else scale*=.82;
    }
    throw new Error("บีบอัดรูปให้พอดีไม่ได้ กรุณาเลือกรูปที่เล็กลง");
  } finally {bitmap.close?.();}
}

export async function render(root, context) {
  const manager=["executive","admin"].includes(context.user.role) && context.workspace !== "employee";
  let rows=[], selectedFiles=[], previewUrls=[];
  const clearPreviewUrls=()=>{previewUrls.forEach(url=>URL.revokeObjectURL(url));previewUrls=[];};
  const listPhotos=row=>Array.isArray(row.images)&&row.images.length?row.images:Array.isArray(row.photos)&&row.photos.length?row.photos:(row.photo?[row.photo]:[]);
  const draw=()=>{
    root.querySelector("[data-ot-list]").innerHTML=rows.map(row=>{
      const photos=listPhotos(row);
      const images=photos.length?'<div class="ot-evidence-grid">'+photos.map((photo,index)=>{
        const src=typeof photo==="string"?photo:photo?.dataUrl||"";
        const name=typeof photo==="string"?"รูปหลักฐาน "+(index+1):photo?.name||"รูปหลักฐาน "+(index+1);
        return src?'<a class="ot-evidence-item" href="'+e(src)+'" target="_blank" rel="noreferrer"><img src="'+e(src)+'" alt="'+e(name)+'"><span>'+e(name)+'</span></a>':"";
      }).join("")+'</div>':'<p class="small-muted">ไม่มีรูปแนบ</p>';
      return '<article class="card card-pad attendance-section ot-record"><div class="ot-record-heading"><h3>'+e(row.employee)+' · '+e(row.date)+'</h3><span class="badge badge-info">'+e(formatDuration(row.hours))+' OT</span></div><p class="small-muted">'+e(row.createdAt?thaiDateTime(row.createdAt):"")+'</p><p class="ot-record-details">'+e(row.details)+'</p>'+images+(manager?'<p class="small-muted">ผู้บันทึก: '+e(row.employee)+'</p>':"")+'</article>';
    }).join("")||'<p class="empty-state">ยังไม่มีรายการ OT</p>';
  };
  root.innerHTML='<div class="page-heading"><div><p class="eyebrow">Overtime</p><h1>'+(manager?"รายงาน OT":"กรอกข้อมูล OT")+'</h1><p>'+(manager?"ตรวจรายการ OT รายละเอียดงาน และรูปหลักฐานของพนักงาน":"บันทึกงานที่ทำล่วงเวลาเพื่อให้ผู้บริหารตรวจสอบ")+'</p></div><button class="button" data-refresh>รีเฟรช</button></div><p class="notice notice-warning">ข้อมูล OT และรูปแนบจะบันทึกใน Supabase หลังยืนยันสำเร็จ</p>'+
  (!manager?'<section class="card form-card ot-form-card"><div class="ot-form-intro"><span class="ot-form-icon" aria-hidden="true">◷</span><div><h2>บันทึก OT</h2><p>กรอกรายละเอียดงาน พร้อมแนบรูปประกอบได้สูงสุด '+MAX_PHOTOS+' รูป</p></div></div><form data-ot-form><div class="form-grid"><label class="field"><span>วันที่ทำ OT</span><div class="ot-date-control"><span>เลือกวันที่</span><input name="date" type="date" value="'+e(bangkokToday())+'" required></div></label><label class="field"><span>ระยะเวลา OT (HH:MM)</span><div class="ot-duration-control"><div class="ot-time-control"><div class="ot-time-segment"><span>ชั่วโมง</span><select name="durationHour" required aria-label="ชั่วโมง OT"></select></div><span class="ot-time-separator" aria-hidden="true">:</span><div class="ot-time-segment"><span>นาที</span><select name="durationMinute" required aria-label="นาที OT"></select></div></div></div><span class="help-text">เลือกชั่วโมง 00–12 และนาที 00–59 ได้ทุกค่า (สูงสุด 12:59)</span></label><label class="field field-full"><span>รายละเอียดงานที่ทำ</span><textarea name="details" minlength="5" maxlength="1000" required placeholder="ระบุงานที่ทำและผลที่ได้"></textarea><span class="help-text">ช่วยให้ผู้บริหารตรวจสอบงาน OT ได้ชัดเจน</span></label><div class="field field-full"><span class="field-label">รูปหลักฐาน <span class="ot-optional">ไม่บังคับ</span></span><div class="ot-upload-box" data-dropzone><div class="ot-upload-mark" aria-hidden="true">＋</div><div class="ot-upload-copy"><strong>เพิ่มรูปภาพหลักฐาน</strong><span>เลือกได้ครั้งละหลายรูป หรือเพิ่มรูปภายหลังได้</span><small>PNG, JPG, GIF หรือ WebP • ระบบบีบอัดรูปใหญ่ให้อัตโนมัติ • สูงสุด 5 รูป • รวมไม่เกิน 2 MB</small></div><label class="button button-small ot-upload-button" for="ot-photo-input">เลือกรูป<input id="ot-photo-input" name="photoInput" class="ot-file-input" type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple></label></div><div class="ot-photo-status" data-photo-status aria-live="polite">ยังไม่ได้เลือกรูป</div><div class="ot-photo-grid" data-photo-grid></div></div></div><div class="ot-recorder"><span class="ot-recorder-avatar" aria-hidden="true">'+e((context.user.name||"พ").slice(0,1))+'</span><div><span class="ot-recorder-label">ผู้บันทึก</span><strong>'+e(context.user.name)+'</strong><small>ยืนยันจากบัญชีที่เข้าสู่ระบบ</small></div></div><button class="button button-primary ot-submit" type="submit">ส่งข้อมูล OT</button></form></section>':"")+
  '<div class="section-title"><h2>'+(manager?"รายการ OT ทั้งหมด":"ประวัติ OT ของฉัน")+'</h2></div><div data-ot-list></div>';
  const form=root.querySelector("[data-ot-form]");

  const durationHour=form?.elements.durationHour, durationMinute=form?.elements.durationMinute;
  if(durationHour)for(let hour=0;hour<=12;hour++){const value=String(hour).padStart(2,"0"),option=document.createElement("option");option.value=value;option.textContent=value;durationHour.append(option);}
  if(durationMinute)for(let minute=0;minute<60;minute++){const value=String(minute).padStart(2,"0"),option=document.createElement("option");option.value=value;option.textContent=value;durationMinute.append(option);}



  const fileInput=form?.elements.photoInput, previewGrid=form?.querySelector("[data-photo-grid]");
  const photoStatus=form?.querySelector("[data-photo-status]"), dropzone=form?.querySelector("[data-dropzone]");
  const drawFiles=()=>{
    clearPreviewUrls();
    previewGrid.innerHTML=selectedFiles.map((file,index)=>{
      const url=URL.createObjectURL(file);previewUrls.push(url);
      return '<article class="ot-photo-card"><img src="'+e(url)+'" alt="ตัวอย่าง '+e(file.name)+'"><div class="ot-photo-info"><strong>'+e(file.name)+'</strong><span>'+(file.size/1024).toFixed(0)+' KB</span></div><button class="ot-photo-remove" type="button" data-remove-photo="'+index+'" aria-label="ลบรูป '+e(file.name)+'">ลบ</button></article>';
    }).join("");
    photoStatus.textContent=selectedFiles.length?"เลือกแล้ว "+selectedFiles.length+" จาก "+MAX_PHOTOS+" รูป":"ยังไม่ได้เลือกรูป";
    form.querySelector(".ot-upload-button")?.classList.toggle("is-disabled",selectedFiles.length>=MAX_PHOTOS);
  };
  const addFiles=async files=>{
    const incoming=Array.from(files||[]);if(!incoming.length)return;
    if(selectedFiles.length+incoming.length>MAX_PHOTOS){context.showToast("แนบได้สูงสุด "+MAX_PHOTOS+" รูป","error");return;}
    if(incoming.some(file=>!TYPES.includes(file.type)||file.size>MAX_SOURCE_BYTES)){context.showToast("เลือกรูป PNG, JPG, GIF หรือ WebP ที่มีขนาดไม่เกิน 20 MB ต่อรูป","error");return;}
    photoStatus.textContent="กำลังตรวจและปรับขนาดรูป…";dropzone?.classList.add("is-processing");
    try{
      let total=selectedFiles.reduce((sum,file)=>sum+file.size,0),compressedCount=0;
      const processed=[];
      for(const file of incoming){
        const target=Math.min(MAX_FILE_BYTES,MAX_TOTAL_BYTES-total);
        if(target<16*1024)throw new Error("พื้นที่รูปที่เหลือไม่พอ กรุณาลบรูปบางรูปก่อน");
        const result=await compressImage(file,target);
        processed.push(result.file);total+=result.file.size;
        if(result.compressed)compressedCount++;
      }
      selectedFiles.push(...processed);drawFiles();
      if(compressedCount)context.showToast("บีบอัดรูปขนาดใหญ่ให้อัตโนมัติแล้ว "+compressedCount+" รูป","success");
    }catch(error){photoStatus.textContent=selectedFiles.length?"เลือกรูปเพิ่มไม่สำเร็จ • รายการเดิมยังอยู่":"เพิ่มรูปไม่สำเร็จ";context.showToast(error.message||"เพิ่มรูปไม่สำเร็จ","error");}
    finally{dropzone?.classList.remove("is-processing");}
  };
  fileInput?.addEventListener("change",()=>{void addFiles(fileInput.files);fileInput.value="";});
  previewGrid?.addEventListener("click",event=>{const button=event.target.closest("[data-remove-photo]");if(button){selectedFiles.splice(Number(button.dataset.removePhoto),1);drawFiles();}});
  dropzone?.addEventListener("dragover",event=>{event.preventDefault();dropzone.classList.add("is-dragging");});
  dropzone?.addEventListener("dragleave",event=>{if(!dropzone.contains(event.relatedTarget))dropzone.classList.remove("is-dragging");});
  dropzone?.addEventListener("drop",event=>{event.preventDefault();dropzone.classList.remove("is-dragging");void addFiles(event.dataTransfer?.files);});
  form?.addEventListener("submit",async event=>{
    event.preventDefault();if(!requireOnlineAction("ส่งข้อมูล OT"))return;
    const button=form.querySelector('[type="submit"]');if(button.disabled)return;
    button.disabled=true;button.textContent="กำลังบันทึก…";
    try{
      const values=Object.fromEntries(new FormData(form));
      const durationText=String(values.durationHour||"").padStart(2,"0")+":"+String(values.durationMinute||"").padStart(2,"0");
      const durationMatch=/^(\d{2}):(\d{2})$/.exec(durationText);
      const durationMinutes=durationMatch?Number(durationMatch[1])*60+Number(durationMatch[2]):0;
      if(!durationMatch||!(/^(?:0\d|1[0-2]):[0-5]\d$/).test(durationText)||durationMinutes<1||durationMinutes>779)throw new Error("กรุณาเลือกระยะเวลา OT ตั้งแต่ 00:01 ถึง 12:59");
      values.hours=durationMinutes/60;
      delete values.durationHour;
      delete values.durationMinute;
      values.photos=await Promise.all(selectedFiles.map(readImage));
      values.photo=values.photos[0]?.dataUrl||"";
      await workApi.submitOvertimeRequest(values);
      context.showToast("บันทึกข้อมูล OT แล้ว","success");await load();
      form.reset();form.elements.date.value=bangkokToday();selectedFiles=[];drawFiles();
    }catch(error){context.showToast(error.message||"บันทึก OT ไม่สำเร็จ","error");}
    finally{button.disabled=false;button.textContent="ส่งข้อมูล OT";}
  });
  async function load(){
    const refresh=root.querySelector("[data-refresh]");refresh.disabled=true;
    try{rows=await workApi.listOvertimeRequests();draw();}
    catch(error){context.showToast(error.message||"โหลด OT ไม่สำเร็จ","error");}
    finally{refresh.disabled=false;}
  }
  root.querySelector("[data-refresh]").addEventListener("click",load);
  context.onDataChange?.(load);await load();
  window.addEventListener("pagehide",clearPreviewUrls,{once:true});
}

