import * as workApi from '../../adapters/package07.js?v=1.3.406';
import { bangkokToday, escapeHtml as e, thaiDate } from '../../js/utils.js?v=1.3.406';
import { requireOnlineAction } from '../../js/offline.js?v=1.3.406';

export async function renderIndependentOutput(root, context, group) {
  root.innerHTML='<p class="page-loading">กำลังโหลดข้อมูล…</p>';
  const screen=group==='สกรีน';
  const combinedDateFilter=(context.combinedScreen&&screen)||(context.combinedProduction&&group==='ผลิต');
  const historyDate=combinedDateFilter?(context.combinedProduction?context.productionHistoryDate:context.screenHistoryDate):'';
  let options, history;
  try { [options,history]=await Promise.all([workApi.readWorkOptions(group,{includeOrders:!screen}),workApi.readIndependentOutput(group,historyDate)]); }
  catch(error) { if(!context.signal?.aborted) root.innerHTML='<p class="notice notice-error" role="alert">โหลดข้อมูลไม่สำเร็จ: '+e(error.message||'กรุณาลองใหม่')+'</p>'; return; }
  if(context.signal?.aborted)return;
  const machines=options.machines||[];
  const machineOptions=machines.map(x=>'<option value="'+e(x.id)+'">'+e([x.machine_code,x.machine_name].filter(Boolean).join(' · '))+'</option>').join('');
  const label=screen?'กรอกข้อมูลสกรีน':'กรอกข้อมูลผลิต';
  const renderHistoryRows=(items,selectedDate=context.combinedProduction?context.productionHistoryDate:context.screenHistoryDate)=>{
    const visible=combinedDateFilter&&selectedDate?items.filter(x=>x.date===selectedDate):items;
    const displayed=combinedDateFilter?visible:visible.slice(0,20);
    return displayed.map(x=>'<article class="list-row"><div><strong>'+e(x.date?thaiDate(x.date):'—')+' · '+e(x.machine||x.sheetName||'—')+'</strong><p>'+ (screen?'แพ็คดี '+e(x.enteredPack??'—')+' · เสียสกรีน '+e(x.missingBottles??'—')+' · เสียผลิต '+e(x.productionDamagedBottles??'—'):'ผลิต '+e(x.quantity??'—')+' ใบ · เสีย '+e(x.defective??'—')+' ใบ')+'</p>'+(screen&&Array.isArray(x.items)&&x.items.length?'<details><summary>ดูรายการและจำนวนแพ็ค</summary>'+x.items.map(item=>'<p>'+e(item.item_name_snapshot)+' · '+e(item.pack_count)+' แพ็ค · '+e(item.work_period==='OT'?'OT':'ในเวลา')+'</p>').join('')+'</details>':'')+'</div></article>').join('')||'<p class="empty-state">'+(combinedDateFilter?'ไม่พบรายการที่บันทึกในวันที่เลือก':'ยังไม่มีรายการ')+'</p>';
  };
  root.innerHTML='<section class="card form-card"><div class="section-title"><div><h2>'+label+'</h2>'+(screen?'':'<p>กรอกยอดงานแยกจากการเริ่มและจบงาน</p>')+'</div></div><form id="independent-output-form"><div class="form-grid">'+
    '<label class="field">วันที่<input name="date" type="date" required value="'+e(bangkokToday())+'"></label><label class="field">เครื่องจักร<select name="machineId" required '+(!machines.length?'disabled':'')+'><option value="">เลือกเครื่องจักร</option>'+machineOptions+'</select></label>'+
    (screen?'<label class="field">จำนวนแพ็คดี<input name="packCount" type="number" min="0" max="1000000000" step="1" inputmode="numeric" required></label><label class="field">เสียจากสกรีน (ขวด)<input name="screenDefects" type="number" min="0" max="1000000000" step="1" inputmode="numeric" value="0" required></label><label class="field">เสียจากผลิต (ขวด)<input name="productionDefects" type="number" min="0" max="1000000000" step="1" inputmode="numeric" value="0" required></label>':'<label class="field">จำนวนผลิต (ใบ)<input name="quantity" type="number" min="1" max="1000000000" step="1" required></label><label class="field">ของเสีย (ใบ)<input name="defective" type="number" min="0" max="1000000000" step="1" value="0" required></label>')+'</div>'+
    '<label class="field">หมายเหตุ<textarea name="note" maxlength="500"></textarea></label><p data-save-status class="help-text" role="status"></p><div class="form-actions"><button class="button button-primary" type="submit" '+(!machines.length?'disabled':'')+'>'+(screen?'บันทึก':'บันทึกข้อมูล')+'</button></div></form></section>'+
    '<section class="card card-pad attendance-section"><h2>รายการที่บันทึกของฉัน</h2><div class="list" data-output-history-list>'+renderHistoryRows(Array.isArray(history)?history:[],historyDate)+'</div></section>';
  let historySequence=0;
  const historyEventName=context.combinedScreen&&screen?'screen-history-date-change':context.combinedProduction&&group==='ผลิต'?'production-history-date-change':null;
  if(historyEventName)root.addEventListener(historyEventName,async event=>{
    const date=String(event.detail?.date||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return;
    if(context.combinedProduction)context.productionHistoryDate=date;else context.screenHistoryDate=date;const sequence=++historySequence,list=root.querySelector('[data-output-history-list]');if(!list)return;
    list.innerHTML='<p class="page-loading">กำลังโหลดรายการที่บันทึก…</p>';
    try{const result=await workApi.readIndependentOutput(group,date);if(sequence!==historySequence||context.signal?.aborted)return;history=Array.isArray(result)?result:[];list.innerHTML=renderHistoryRows(history,date);}
    catch(error){if(sequence!==historySequence||context.signal?.aborted)return;list.innerHTML='<p class="notice notice-error" role="alert">โหลดรายการของวันที่เลือกไม่สำเร็จ: '+e(error.message||'กรุณาลองใหม่')+'</p>';}
  });
  const form=root.querySelector('#independent-output-form'), status=root.querySelector('[data-save-status]');
  const key='factory-independent-output:'+context.user.id+':'+group;
  let pending;
  try { pending=JSON.parse(sessionStorage.getItem(key)||'null'); } catch { status.textContent='ไม่สามารถอ่านคำขอบันทึกเดิม กรุณาติดต่อ Admin'; form.querySelector('[type=submit]').disabled=true; return; }
  const freeze=()=>{form.querySelectorAll('input,select,textarea,button:not([type=submit])').forEach(x=>x.disabled=true);};
  if(pending){
    for(const name of ['date','machineId','quantity','defective','packCount','screenDefects','productionDefects','note']){
      const field=form.elements.namedItem(name); if(field&&pending[name]!=null)field.value=String(pending[name]);
    }
    if(screen&&pending.packCount==null){
      if(!Array.isArray(pending.items)||pending.items.some(item=>!Number.isSafeInteger(item?.pack_count)||item.pack_count<1)){
        status.textContent='ไม่สามารถอ่านคำขอบันทึกเดิม กรุณาติดต่อ Admin';form.querySelector('[type=submit]').disabled=true;return;
      }
      form.elements.packCount.value=String(pending.items.reduce((sum,item)=>sum+item.pack_count,0));
    }
    freeze();status.textContent='พบรายการที่ยังไม่ทราบผล กดตรวจสอบรายการเดิมอีกครั้ง';form.querySelector('[type=submit]').textContent='ตรวจสอบรายการเดิม';
  }
  form.addEventListener('submit',async event=>{
    event.preventDefault();const button=form.querySelector('[type=submit]');
    if(button.disabled||!requireOnlineAction(label))return;
    if(!pending){
      const data=new FormData(form);
      const countValue=name=>{const raw=String(data.get(name)??'').trim();return raw===''?null:Number(raw);};
      const packCount=screen?countValue('packCount'):null;
      const screenDefects=screen?countValue('screenDefects'):null,productionDefects=screen?countValue('productionDefects'):null;
      const validCount=value=>Number.isSafeInteger(value)&&value>=0&&value<=1000000000;
      if(screen&&(!validCount(packCount)||!validCount(screenDefects)||!validCount(productionDefects))){status.textContent='กรอกจำนวนเต็มตั้งแต่ 0 ถึง 1,000,000,000';return;}
      const quantity=screen?null:Number(data.get('quantity')),defective=screen?null:Number(data.get('defective'));
      if(!screen&&(!Number.isSafeInteger(quantity)||quantity<1||!Number.isSafeInteger(defective)||defective<0||defective>quantity)){status.textContent='ตรวจจำนวนผลิตและของเสีย';return;}
      pending={requestId:crypto.randomUUID(),group,date:data.get('date'),machineId:data.get('machineId'),quantity,defective,...(screen?{packCount}:{items:null}),screenDefects,productionDefects,note:String(data.get('note')||'').trim()};
      try {sessionStorage.setItem(key,JSON.stringify(pending));} catch {pending=null;status.textContent='ไม่สามารถเก็บคำขอเพื่อตรวจสอบการบันทึกซ้ำ';return;}
      freeze();
    }
    button.disabled=true;status.textContent='กำลังบันทึกและตรวจสอบข้อมูล…';
    try {await workApi.saveIndependentOutput(pending);sessionStorage.removeItem(key);pending=null;if(!context.signal?.aborted){context.showToast('บันทึกข้อมูลสำเร็จ','success');await renderIndependentOutput(root,context,group);}}
    catch(error){if(!context.signal?.aborted){if(error.serverRejected){sessionStorage.removeItem(key);pending=null;form.querySelectorAll('input,select,textarea,button').forEach(x=>x.disabled=false);status.textContent=error.message||'ข้อมูลไม่ผ่านการตรวจสอบ กรุณาแก้ไข';button.textContent=screen?'บันทึก':'บันทึกข้อมูล';}else{status.textContent=(error.message||'ยังตรวจสอบผลไม่ได้')+' กดตรวจสอบรายการเดิมอีกครั้ง';button.textContent='ตรวจสอบรายการเดิม';}}}
    finally {if(button.isConnected)button.disabled=false;}
  });
}
