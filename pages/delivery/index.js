import { APP_MODE } from "../../js/config.js?v=1.3.269";
import * as deliveryApi from "../../adapters/package04.js?v=1.3.275";
import { escapeHtml, thaiDateTime } from "../../js/utils.js?v=1.3.186";
import { requireOnlineAction } from "../../js/offline.js?v=1.3.186";
import { canEnterData } from "../../js/permissions.js?v=1.3.186";
import { showStatusModal } from "../../components/status-modal.js?v=1.3.295";
import { deriveDeliveryRequestId, normalizeDeliveryBillNumber, normalizeDeliveryEventAt } from "../../js/delivery-service.js?v=1.3.275";

const PAGE_SIZE = 25;
const MAX_DELIVERY_PHOTOS = 10;
const MAX_DELIVERY_FILE_BYTES = 1024 * 1024;
const MAX_DELIVERY_SOURCE_BYTES = 20 * 1024 * 1024;
const DELIVERY_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const ITEM_NAME_COLLATOR = new Intl.Collator("th", {numeric:true,sensitivity:"base"});
const orderedProducts = values => {
  if(APP_MODE === "mock")return values||[];
  const items=[...(values||[])].sort((a,b)=>ITEM_NAME_COLLATOR.compare(String(a.item_name||""),String(b.item_name||""))||String(a.id).localeCompare(String(b.id)));
  const counts=new Map();for(const item of items){const key=String(item.item_name||"").trim().toLocaleLowerCase("th");counts.set(key,(counts.get(key)||0)+1);}
  return items.map(item=>({...item,displayLabel:counts.get(String(item.item_name||"").trim().toLocaleLowerCase("th"))>1?`${item.item_name} · ${String(item.id).slice(0,8)}`:item.item_name}));
};

function bangkokNowInput() {
  const parts = new Intl.DateTimeFormat("en-CA", {timeZone:"Asia/Bangkok",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date());
  const value = Object.fromEntries(parts.map(part => [part.type,part.value]));
  return `${value.year}-${value.month}-${value.day}T${value.hour}:${value.minute}`;
}

async function prepareDeliveryPhoto(file) {
  if (file.size <= MAX_DELIVERY_FILE_BYTES) return { file, compressed:false };
  if (typeof createImageBitmap !== "function") throw new Error("เบราว์เซอร์นี้บีบอัดรูปไม่ได้ กรุณาใช้รูปที่เล็กลง");
  let bitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new Error("เปิดรูปเพื่อบีบอัดไม่ได้ กรุณาเลือกรูป JPG, PNG หรือ WebP"); }
  try {
    const canvas=document.createElement("canvas"),ctx=canvas.getContext("2d");
    if(!ctx)throw new Error("เตรียมพื้นที่บีบอัดรูปไม่สำเร็จ");
    let scale=Math.min(1,2000/Math.max(bitmap.width,bitmap.height)),quality=.88;
    for(let attempt=0;attempt<10;attempt++){
      canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
      ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",quality));
      if(blob&&blob.size<=MAX_DELIVERY_FILE_BYTES)return {file:new File([blob],file.name.replace(/\.[^.]+$/,".jpg"),{type:"image/jpeg",lastModified:Date.now()}),compressed:true};
      if(attempt%2===0)quality=Math.max(.42,quality-.12);else scale*=.82;
    }
    throw new Error("บีบอัดรูปให้ไม่เกิน 1 MB ไม่ได้ กรุณาใช้รูปที่เล็กลง");
  } finally { bitmap.close?.(); }
}

const statusClass = status => status === "ส่งสำเร็จ" ? "badge-success" : "badge-danger";
const localFilters = filters => ({query:filters.query.trim(),from:filters.from,to:filters.to,status:filters.status,limit:PAGE_SIZE,offset:filters.offset});

function renderRecords(rows, ownerId, canCancel) {
  return rows.map(item => {
    const id=escapeHtml(item.id), version=Number(item.delivery_version ?? item.deliveryVersion ?? 1), owner=item.owner_id||item.employeeId;
    const time=item.event_at||item.dateTime||item.createdAt;
    return `<article class="delivery-record" data-delivery-record="${id}">
      <div class="list-row"><div class="list-main"><div class="list-title">${escapeHtml(item.product||"—")}</div>
        <div class="list-meta">บิล ${escapeHtml(item.bill_number||item.billNumber||"—")} · ${escapeHtml(item.quantity??"—")} · ${escapeHtml(thaiDateTime(time))}</div></div>
        <span class="badge ${statusClass(item.status)}">${escapeHtml(item.status||"—")}</span></div>
      <div class="delivery-record-actions"><button class="button button-small" type="button" data-delivery-detail="${id}">ดูรายละเอียด</button>
        ${canCancel&&owner===ownerId&&item.status==="ส่งสำเร็จ"?`<button class="button button-small" type="button" data-delivery-cancel="${id}" data-version="${version}">ยกเลิกรายการ</button>`:""}</div>
      <div class="delivery-detail-slot" data-detail-slot="${id}" hidden></div>
    </article>`;
  }).join("");
}

function readImageData(file) {
  return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve({name:file.name,mimeType:file.type,size:file.size,dataUrl:reader.result});reader.onerror=()=>reject(new Error("อ่านรูปแนบไม่สำเร็จ"));reader.readAsDataURL(file);});
}

export async function render(root, context) {
  let rows=[], selectedPhotos=[], previewUrls=[], processingPhotos=false, requestId=null, offset=0, total=0, historySequence=0, disposed=false;
  const pageModals=new Set();
  const pageModal=options=>{const modal=showStatusModal(options);pageModals.add(modal);return modal;};
  const canCreate=canEnterData(context.user.role)&&(context.user.role==="admin"||(context.user.groups||[]).includes("ขนส่ง"));
  const canCancel=["employee","admin"].includes(context.user.role);
  const clearPreviewUrls=()=>{previewUrls.forEach(url=>URL.revokeObjectURL(url));previewUrls=[];};
  context.signal?.addEventListener("abort",()=>{disposed=true;clearPreviewUrls();pageModals.forEach(modal=>modal.close());pageModals.clear();},{once:true});
  root.innerHTML='<div class="page-loading"><span class="loading-spinner"></span><span>กำลังโหลดรายการขนส่ง…</span></div>';
  let options=null, optionsError='';
  if(canCreate){
    try { options=await deliveryApi.getDeliveryOptions(); }
    catch(error){ if(context.signal?.aborted)return; optionsError=error.message||"โหลดตัวเลือกรายการสินค้าไม่สำเร็จ"; }
  }
  if(disposed)return;
  let products=orderedProducts(options?.products||[]);
  const productsMarkup=products.map(item=>typeof item==="string"?`<option value="${escapeHtml(item)}">`: `<option value="${escapeHtml(item.id)}">${escapeHtml(item.displayLabel)}</option>`).join("");
  root.innerHTML=`<div class="page-heading"><div><h1>บันทึกการขนส่ง</h1><p>บันทึกข้อมูลและเปิดดูประวัติการขนส่ง</p></div></div>
    ${APP_MODE==="mock"?'<p class="notice notice-warning">DEV MOCK • ข้อมูลตัวอย่างเท่านั้น ไม่ได้บันทึกลง Supabase</p>':""}
    ${canCreate?`<section class="card form-card"><h2>บันทึกการขนส่ง</h2>
      <form id="delivery-form" style="margin-top:.8rem"><div class="form-grid">
        ${APP_MODE==="mock"?`<div class="field"><label for="product">รายการสินค้า</label><input id="product" name="product" list="delivery-products" autocomplete="off" required ${products.length?"":"disabled"} placeholder="ค้นหาและเลือกรายการ"><datalist id="delivery-products">${productsMarkup}</datalist><input id="itemNameId" name="itemNameId" type="hidden"></div>`:`<div class="field"><label for="product-search">ค้นหารายการสินค้า</label><input id="product-search" type="search" autocomplete="off" placeholder="พิมพ์ชื่อสินค้า"><label class="field-label" for="itemNameId">รายการสินค้า</label><select id="itemNameId" name="itemNameId" required ${products.length?"":"disabled"}><option value="">${optionsError?"โหลดรายการไม่สำเร็จ":"เลือกรายการสินค้า"}</option>${productsMarkup}</select><input id="product" name="product" type="hidden" value="">${optionsError?`<p class="help-text" data-product-options-message role="alert">${escapeHtml(optionsError)}</p>`:products.length?'<p class="help-text" data-product-options-message>เลือกด้วยรหัส id จาก Supabase</p>':'<p class="help-text" data-product-options-message>ไม่มีรายการสินค้าที่ active และเลือกได้</p>'}<button class="button button-small" type="button" data-refresh-products>โหลดรายการใหม่</button></div>`}
        <div class="field"><label for="billNumber">เลขบิล</label><div class="delivery-bill-control"><span aria-hidden="true">SD</span><input id="billNumber" name="billNumber" type="text" inputmode="numeric" autocomplete="off" pattern="[0-9]{9}" minlength="9" maxlength="9" aria-describedby="billNumberHelp" placeholder="123456789" required></div><p class="small-muted" id="billNumberHelp">กรอกตัวเลข 9 หลักต่อท้าย SD</p></div>
        <div class="field"><label for="quantity">จำนวน</label><input id="quantity" name="quantity" type="number" inputmode="decimal" min="0" step="any" required><p class="small-muted">จำนวนต้องมากกว่า 0</p></div>
        <div class="field"><label for="sender">ผู้บันทึก/ผู้ส่ง</label><input id="sender" name="sender" readonly value="${escapeHtml(options?.sender||"")}" placeholder="อ่านจากบัญชีที่เข้าสู่ระบบ"></div>
        <div class="field"><label for="dateTime">วันที่และเวลาขนส่ง (เวลาไทย)</label><input id="dateTime" name="dateTime" type="datetime-local" required value="${bangkokNowInput()}"></div>
        <div class="field"><label for="deliveryStatus">สถานะ</label><input id="deliveryStatus" name="status" value="ส่งสำเร็จ" readonly></div>
        <div class="field field-full"><span class="field-label">รูปหลักฐาน <span class="ot-optional">จำเป็น</span></span>
          <div class="ot-upload-box" data-delivery-dropzone><div class="ot-upload-mark" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></div><div class="ot-upload-copy"><strong>เพิ่มรูปหลักฐานการขนส่ง</strong><span>เลือกหลายรูปหรือเพิ่มรูปภายหลังได้</span><small>JPG, PNG หรือ WebP • บีบอัดรูปใหญ่อัตโนมัติ • สูงสุด 10 รูป รูปละไม่เกิน 1 MB</small></div>
            <label class="button button-small ot-upload-button" for="deliveryImages">เลือกรูป<input id="deliveryImages" class="ot-file-input" type="file" accept="image/jpeg,image/png,image/webp" multiple></label></div>
          <div class="ot-photo-status" data-delivery-photo-status role="status" aria-live="polite">ยังไม่ได้เลือกรูป</div><div class="ot-photo-grid" data-delivery-photo-grid></div></div>
      </div>${products.length?"":APP_MODE==="mock"?'<p class="small-muted" role="status">ไม่มีรายการสินค้าที่ใช้งานได้</p>':""}
      <div class="form-actions"><button class="button button-primary" type="submit" ${products.length?"":"disabled"}>บันทึก</button></div></form></section>`:""}
    <div class="section-title"><div><h2>ประวัติการบันทึกการขนส่ง</h2><p>กรองช่วงวันที่ตามวันที่และเวลาขนส่ง (event_at)</p></div></div>
    <section class="card card-pad"><form class="delivery-history-filters" id="delivery-filters">
      <div class="field"><label for="deliveryQuery">ค้นหาเลขบิลหรือรายการสินค้า</label><input id="deliveryQuery" name="query" type="search" placeholder="SD123456789 หรือชื่อสินค้า"></div>
      <div class="field"><label for="deliveryFrom">ตั้งแต่วันที่</label><input id="deliveryFrom" name="from" type="date"></div>
      <div class="field"><label for="deliveryTo">ถึงวันที่</label><input id="deliveryTo" name="to" type="date"></div>
      <div class="field"><label for="deliveryStatusFilter">สถานะ</label><select id="deliveryStatusFilter" name="status"><option value="">ทุกสถานะ</option><option value="ส่งสำเร็จ">ส่งสำเร็จ</option><option value="ยกเลิก">ยกเลิก</option></select></div>
      <button class="button" type="submit">ค้นหา</button></form>
      <div class="list" data-delivery-history role="status" aria-live="polite"><div class="page-loading"><span class="loading-spinner"></span><span>กำลังโหลดประวัติ…</span></div></div>
      <div class="form-actions"><button class="button" type="button" data-delivery-more hidden>โหลดเพิ่ม</button></div>
    </section>
    <p class="small-muted" style="margin-top:.8rem">ข้อมูลประวัติอ่านจาก Supabase ตามสิทธิ์บัญชีและกลุ่มงาน</p>`;

  const form=root.querySelector("#delivery-form"), fileInput=form?.querySelector("#deliveryImages"), dropzone=form?.querySelector("[data-delivery-dropzone]"),
    photoGrid=form?.querySelector("[data-delivery-photo-grid]"), photoStatus=form?.querySelector("[data-delivery-photo-status]"), submitButton=form?.querySelector("[type=submit]"),
    history=root.querySelector("[data-delivery-history]"), moreButton=root.querySelector("[data-delivery-more]"), filtersForm=root.querySelector("#delivery-filters");
  const currentFilters=()=>Object.fromEntries(new FormData(filtersForm));
  function drawPhotos(){
    clearPreviewUrls();
    photoGrid.innerHTML=selectedPhotos.map((file,index)=>{const url=URL.createObjectURL(file);previewUrls.push(url);return `<article class="ot-photo-card"><img src="${escapeHtml(url)}" alt="ตัวอย่างรูปหลักฐาน ${index+1}"><div class="ot-photo-info"><strong>${escapeHtml(file.name)}</strong><span>${(file.size/1024).toFixed(0)} KB</span></div><button class="ot-photo-remove" type="button" data-remove-delivery-photo="${index}" aria-label="ลบรูป ${escapeHtml(file.name)}">ลบ</button></article>`;}).join("");
    photoStatus.textContent=selectedPhotos.length?`เลือกแล้ว ${selectedPhotos.length} จาก ${MAX_DELIVERY_PHOTOS} รูป`:"ยังไม่ได้เลือกรูป";
    fileInput.required=selectedPhotos.length===0;
  }
  async function addPhotos(files){
    const incoming=Array.from(files||[]);if(!incoming.length||processingPhotos)return;
    if(selectedPhotos.length+incoming.length>MAX_DELIVERY_PHOTOS){context.showToast(`แนบได้สูงสุด ${MAX_DELIVERY_PHOTOS} รูป`,"error");return;}
    if(incoming.some(file=>!DELIVERY_IMAGE_TYPES.includes(file.type)||file.size<=0||file.size>MAX_DELIVERY_SOURCE_BYTES)){context.showToast("เลือกรูป JPG, PNG หรือ WebP ขนาดต้นฉบับไม่เกิน 20 MB ต่อรูป","error");return;}
    requestId=null;processingPhotos=true;fileInput.disabled=true;submitButton.disabled=true;photoStatus.textContent="กำลังตรวจสอบและเตรียมรูป…";dropzone.classList.add("is-processing");
    try{let compressed=0;for(const file of incoming){const result=await prepareDeliveryPhoto(file);selectedPhotos.push(result.file);if(result.compressed)compressed++;}if(disposed)return;drawPhotos();if(compressed)context.showToast(`บีบอัดรูปใหญ่อัตโนมัติแล้ว ${compressed} รูป`,"success");}
    catch(error){photoStatus.textContent=selectedPhotos.length?"เพิ่มรูปไม่สำเร็จ • รูปเดิมยังอยู่":"เพิ่มรูปไม่สำเร็จ";context.showToast(error.message||"เพิ่มรูปไม่สำเร็จ","error");}
    finally{processingPhotos=false;if(!disposed){fileInput.disabled=false;submitButton.disabled=false;dropzone.classList.remove("is-processing");}}
  }
  fileInput?.addEventListener("change",()=>{void addPhotos(fileInput.files);fileInput.value="";});
  photoGrid?.addEventListener("click",event=>{const button=event.target.closest("[data-remove-delivery-photo]");if(!button||processingPhotos)return;selectedPhotos.splice(Number(button.dataset.removeDeliveryPhoto),1);requestId=null;drawPhotos();});
  dropzone?.addEventListener("dragover",event=>{event.preventDefault();dropzone.classList.add("is-dragging");});
  dropzone?.addEventListener("dragleave",event=>{if(!dropzone.contains(event.relatedTarget))dropzone.classList.remove("is-dragging");});
  dropzone?.addEventListener("drop",event=>{event.preventDefault();dropzone.classList.remove("is-dragging");void addPhotos(event.dataTransfer?.files);});
  form?.addEventListener("input",event=>{if(event.target.name!=="sender"&&event.target.name!=="status")requestId=null;});
  form?.querySelector("#product")?.addEventListener("input",event=>{if(APP_MODE!=="mock")return;const item=products.find(value=>typeof value!=="string"&&value.item_name===event.target.value);form.querySelector("#itemNameId").value=item?.id||"";});
  form?.querySelector("#itemNameId")?.addEventListener("change",event=>{if(APP_MODE==="mock")return;const item=products.find(value=>value.id===event.target.value);form.querySelector("#product").value=item?.item_name||"";requestId=null;});
  form?.querySelector("#product-search")?.addEventListener("input",event=>{const query=event.target.value.trim().toLocaleLowerCase("th");for(const option of form.querySelector("#itemNameId").options){if(option.value)option.hidden=!option.textContent.toLocaleLowerCase("th").includes(query);}});
  form?.querySelector("[data-refresh-products]")?.addEventListener("click",async event=>{
    const button=event.currentTarget, select=form.querySelector("#itemNameId"), previous=select.value;
    button.disabled=true;
    try{
      options=await deliveryApi.getDeliveryOptions();products=orderedProducts(options?.products||[]);optionsError="";
      const found=products.find(item=>item.id===previous);
      select.innerHTML='<option value="">เลือกรายการสินค้า</option>'+products.map(item=>`<option value="${escapeHtml(item.id)}">${escapeHtml(item.displayLabel)}</option>`).join("")+(previous&&!found?`<option value="${escapeHtml(previous)}" selected disabled>รายการที่เลือกถูกปิดหรือไม่มีสิทธิ์ กรุณาเลือกใหม่</option>`:"");
      select.disabled=!products.length;if(found){select.value=previous;form.querySelector("#product").value=found.item_name;}
      const message=form.querySelector("[data-product-options-message]");if(message){message.className="help-text";message.textContent=previous&&!found?"ข้อมูลมีการเปลี่ยนแปลง กรุณาเลือกรายการสินค้าใหม่":products.length?"เลือกด้วยรหัส id จาก Supabase":"ไม่มีรายการสินค้าที่ active และเลือกได้";message.setAttribute("role",previous&&!found?"alert":"status");}
      const submit=form.querySelector('[type="submit"]');submit.disabled=!products.length;requestId=null;
    }catch(error){const message=form.querySelector("[data-product-options-message]");if(message){message.className="help-text";message.textContent=(error.message||"โหลดรายการสินค้าไม่สำเร็จ")+" · กดโหลดรายการใหม่เพื่อลองอีกครั้ง";message.setAttribute("role","alert");}}
    finally{button.disabled=false;}
  });
  form?.addEventListener("submit",async event=>{
    event.preventDefault();if(!canCreate||processingPhotos||!requireOnlineAction("บันทึกการขนส่ง"))return;
    if(submitButton.disabled)return;
    const values=Object.fromEntries(new FormData(form));
    try{values.billNumber=normalizeDeliveryBillNumber(`SD${String(values.billNumber??"").trim()}`);normalizeDeliveryEventAt(values.dateTime);if(APP_MODE!=="mock"&&!values.itemNameId)throw new Error("กรุณาเลือกสินค้าจากรายการ Supabase");if(!Number.isFinite(Number(values.quantity))||Number(values.quantity)<=0)throw new Error("จำนวนต้องเป็นตัวเลขมากกว่า 0");if(selectedPhotos.length<1||selectedPhotos.length>MAX_DELIVERY_PHOTOS)throw new Error("แนบรูปหลักฐานอย่างน้อย 1 รูป และไม่เกิน 10 รูป");}
    catch(error){context.showToast(error.message||"ข้อมูลไม่ครบ","error");return;}
    requestId=await deriveDeliveryRequestId(context.user.id,values,selectedPhotos);submitButton.disabled=true;submitButton.textContent="กำลังบันทึก";
    const modal=pageModal({title:"บันทึกการขนส่ง",message:"กำลังตรวจสอบข้อมูล",tone:"working",dismissOnEscape:false});
    try{
      const phase=message=>modal.update({title:"บันทึกการขนส่ง",message,tone:"working"});
      let payload;
      if(APP_MODE==="mock")payload={...values,requestId,images:await Promise.all(selectedPhotos.map(readImageData))};
      else payload={...values,files:selectedPhotos,requestId,onPhase:phase};
      await deliveryApi.createDelivery(payload);
      if(disposed){modal.close();return;}
      requestId=null;selectedPhotos=[];clearPreviewUrls();modal.update({title:"บันทึกการขนส่ง",message:"บันทึกการขนส่งสำเร็จ",tone:"success",close:()=>{modal.close();if(!disposed)void loadHistory(false);}});
    }catch(error){if(disposed){modal.close();return;}modal.update({title:"บันทึกการขนส่ง",message:error.message||"บันทึกการขนส่งไม่สำเร็จ",tone:"error",close:()=>modal.close()});submitButton.disabled=false;submitButton.textContent="บันทึก";}
  });

  async function loadHistory(append=false){
    const sequence=++historySequence;if(!append)offset=0;const filters={...localFilters(currentFilters()),offset};
    if(!append)history.innerHTML='<div class="page-loading"><span class="loading-spinner"></span><span>กำลังโหลดประวัติ…</span></div>';
    else moreButton.disabled=true;
    const loadingModal=!append&&sequence===1?pageModal({title:"ประวัติการบันทึกการขนส่ง",message:"กำลังโหลดประวัติ",tone:"working"}):null;
    try{
      const result=await deliveryApi.listDeliveries(filters);if(disposed||sequence!==historySequence){loadingModal?.close();return;}
      let page=Array.isArray(result)?result:(result.rows||[]);
      if(Array.isArray(result)){
        const q=filters.query.toLocaleLowerCase("th-TH");
        page=page.filter(row=>(!q||`${row.billNumber||row.bill_number||""} ${row.product||""}`.toLocaleLowerCase("th-TH").includes(q))
          &&(!filters.status||row.status===filters.status)
          &&(!filters.from||new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Bangkok"}).format(new Date(row.dateTime||row.event_at||row.createdAt))>=filters.from)
          &&(!filters.to||new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Bangkok"}).format(new Date(row.dateTime||row.event_at||row.createdAt))<=filters.to));
        page.sort((a,b)=>String(b.dateTime||b.event_at||b.createdAt||"").localeCompare(String(a.dateTime||a.event_at||a.createdAt||"")));
        total=page.length;page=page.slice(filters.offset,filters.offset+PAGE_SIZE);
      } else total=Number(result.total||0);
      rows=append?[...rows,...page]:page;offset=rows.length;
      history.innerHTML=rows.length?renderRecords(rows,context.user.id,canCancel):'<div class="empty-state">ไม่มีรายการขนส่งตามเงื่อนไข</div>';
      moreButton.hidden=offset>=total;moreButton.disabled=false;
      loadingModal?.close();
    }catch(error){if(disposed||sequence!==historySequence)return;loadingModal?.close();history.innerHTML=`<div class="notice notice-error">${escapeHtml(error.message||"โหลดประวัติไม่สำเร็จ")}</div><button class="button" type="button" data-history-retry>ลองโหลดอีกครั้ง</button>`;moreButton.hidden=true;}
  }
  filtersForm.addEventListener("submit",event=>{event.preventDefault();void loadHistory(false);});
  filtersForm.querySelector("#deliveryQuery").addEventListener("input",()=>{clearTimeout(filtersForm._timer);filtersForm._timer=setTimeout(()=>void loadHistory(false),250);});
  moreButton.addEventListener("click",()=>void loadHistory(true));
  history.addEventListener("click",async event=>{
    if(event.target.closest("[data-history-retry]")){void loadHistory(false);return;}
    const detailsButton=event.target.closest("[data-delivery-detail]");
      if(detailsButton){const id=detailsButton.dataset.deliveryDetail,slot=history.querySelector(`[data-detail-slot="${CSS.escape(id)}"]`);if(!slot)return;
      if(!slot.hidden){slot.hidden=true;return;}slot.hidden=false;slot.innerHTML='<p class="small-muted">กำลังโหลดรายละเอียด…</p>';detailsButton.disabled=true;
      const modal=pageModal({title:"รายละเอียดการขนส่ง",message:"กำลังโหลดรายละเอียด",tone:"working"});
      try{const detail=await deliveryApi.getDeliveryDetail(id);if(disposed){modal.close();return;}slot.innerHTML=`<dl class="work-manager-fields"><div><dt>ผู้บันทึก/ผู้ส่ง</dt><dd>${escapeHtml(detail.sender||"—")}</dd></div><div><dt>รายการสินค้า</dt><dd>${escapeHtml(detail.product||"—")}</dd></div><div><dt>เลขบิล</dt><dd>${escapeHtml(detail.bill_number||detail.billNumber||"—")}</dd></div><div><dt>จำนวน</dt><dd>${escapeHtml(detail.quantity??"—")}</dd></div><div><dt>วันที่และเวลาขนส่ง</dt><dd>${escapeHtml(thaiDateTime(detail.event_at||detail.dateTime))}</dd></div><div><dt>สถานะ</dt><dd>${escapeHtml(detail.status||"—")}</dd></div><div><dt>บันทึกเมื่อ</dt><dd>${escapeHtml(thaiDateTime(detail.created_at||detail.createdAt))}</dd></div></dl><div class="delivery-evidence"><strong>รูปหลักฐาน (${(detail.attachments||[]).length})</strong><div class="ot-photo-grid">${(detail.attachments||[]).map((file,index)=>`<a class="ot-photo-card" href="${escapeHtml(file.signed_url)}" target="_blank" rel="noreferrer"><img src="${escapeHtml(file.signed_url)}" alt="รูปหลักฐาน ${index+1}"><span>${escapeHtml(file.name||`รูปที่ ${index+1}`)}</span></a>`).join("")}</div></div>`;modal.update({title:"รายละเอียดการขนส่ง",message:"โหลดรายละเอียดสำเร็จ",tone:"success",close:()=>modal.close()});}
      catch(error){if(disposed){modal.close();return;}slot.innerHTML=`<div class="notice notice-error">${escapeHtml(error.message||"โหลดรายละเอียดไม่สำเร็จ")}</div>`;modal.update({title:"รายละเอียดการขนส่ง",message:error.message||"โหลดรายละเอียดไม่สำเร็จ",tone:"error",close:()=>modal.close()});}
      finally{detailsButton.disabled=false;}return;
    }
    const cancelButton=event.target.closest("[data-delivery-cancel]");if(cancelButton){const id=cancelButton.dataset.deliveryCancel,version=Number(cancelButton.dataset.version);
      const modal=pageModal({title:"ยืนยันยกเลิกรายการ",message:"ยกเลิกรายการขนส่งนี้หรือไม่? การยกเลิกจะถูกบันทึกในประวัติ Audit.",tone:"info",confirmLabel:"ยืนยันยกเลิก",close:()=>modal.close(),confirm:async()=>{modal.update({title:"ยกเลิกรายการ",message:"กำลังยกเลิกรายการ",tone:"working"});try{await deliveryApi.cancelDelivery(id,version);if(disposed){modal.close();return;}modal.update({title:"ยกเลิกรายการ",message:"ยกเลิกรายการขนส่งสำเร็จ",tone:"success",close:()=>{modal.close();void loadHistory(false);}});}catch(error){if(disposed){modal.close();return;}modal.update({title:"ยกเลิกรายการ",message:error.message||"ยกเลิกรายการไม่สำเร็จ",tone:"error",close:()=>modal.close()});}}});return;
    }
  });
  void loadHistory(false);
}
