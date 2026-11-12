import * as api from '../../adapters/package05.js?v=1.3.264';
import {isProductionEmployee} from '../../js/permissions.js?v=1.3.186';
import * as workApi from '../../adapters/package07.js?v=1.3.267';
import {bangkokToday, escapeHtml as e, thaiDate} from '../../js/utils.js?v=1.3.186';
import {requireOnlineAction} from '../../js/offline.js?v=1.3.186';
import {statCard} from '../../components/app-card.js?v=1.3.340';

export async function render(root, context, {embedded=false} = {}) {
  if(!embedded && context.workspace==='employee' && ['employee','admin'].includes(context.user.role)){
    const work=await import('../work-session/index.js?v=1.3.333');
    return work.render(root,{...context,workType:'ผลิต'});
  }
  root.innerHTML='<p class="page-loading">กำลังโหลดข้อมูลผลิต…</p>';
  const rows=await api.listProduction();
  if(context.signal?.aborted)return;
  const create=isProductionEmployee(context.user) || (context.user.role === "admin" && context.workspace === "employee");
  let productionMachines=[], machineOptionsError='';
  if(create && embedded){
    try{productionMachines=(await workApi.readWorkOptions('ผลิต')).machines||[];}
    catch{machineOptionsError='โหลดรายการเครื่องจักรไม่สำเร็จ กรุณาลองใหม่';}
  }
  if(context.signal?.aborted)return;
  const total=rows.reduce((sum,row)=>sum+Number(row.quantity||0),0);
  const defective=rows.reduce((sum,row)=>sum+Number(row.defective||0),0);
  root.innerHTML=(embedded?'<div class="section-title"><div><h2>บันทึกข้อมูลผลิต</h2><p>ใส่ยอดรายวันแยกจากจำนวนตอนจบงาน</p></div></div>':'<div class="page-heading"><h1>'+ (create?'บันทึกข้อมูลผลิต':'ข้อมูลผลิต') +'</h1></div>')+
    '<p class="notice notice-info">บันทึกและอ่านรายการจาก Supabase</p>'+
    '<div class="grid grid-3 attendance-section">'+statCard('จำนวนผลิต',total,'ใบ')+statCard('ของเสีย',defective,'ใบ')+statCard('จำนวนดี',total-defective,'ใบ')+'</div>'+
    (create?'<section class="card form-card attendance-section"><h2>บันทึกยอดผลิต</h2><form id="production-record-form"><div class="form-grid">'+
      '<label class="field">วันที่<input id="production-date" name="date" type="date" required value="'+bangkokToday()+'"></label>'+
      '<div class="field"><label for="production-machine">เครื่องจักร</label><select id="production-machine" name="machine" required '+(!productionMachines.length?'disabled':'')+'><option value="">'+(machineOptionsError?'โหลดเครื่องจักรไม่สำเร็จ':'เลือกเครื่องจักร')+'</option>'+productionMachines.map(machine=>'<option value="'+e(machine.id)+'" data-machine-name="'+e(machine.machine_name)+'" data-machine-code="'+e(machine.machine_code)+'">'+e(machine.machine_code)+' · '+e(machine.machine_name)+'</option>').join('')+'</select><button class="button button-small" type="button" data-refresh-machines>โหลดเครื่องจักรใหม่</button><p class="help-text" data-machine-options-status role="status">'+e(machineOptionsError||(!productionMachines.length?'ไม่มีเครื่องผลิตที่เปิดใช้งาน':'โหลดเฉพาะเครื่องผลิตที่ active'))+'</p></div>'+
      '<label class="field">จำนวนผลิต (ใบ)<input id="production-quantity" name="quantity" type="number" min="1" step="1" inputmode="numeric" required></label>'+
      '<label class="field">ของเสีย (ใบ)<input id="production-defective" name="defective" type="number" min="0" step="1" inputmode="numeric" value="0" required></label>'+
      '<label class="field field-full">ผู้บันทึก<input name="operator" value="'+e(context.user.name)+'" readonly></label>'+
      '<label class="field field-full">หมายเหตุ<textarea id="production-note" name="note" maxlength="500"></textarea></label></div>'+
      '<div class="form-actions"><button class="button button-primary" type="submit">บันทึกข้อมูลผลิต</button></div></form></section>':'')+
    '<section class="card card-pad attendance-section"><h2>รายการผลิตล่าสุด</h2><div class="list">'+(rows.slice(0,20).map(row=>'<article class="list-row"><div><strong>'+e(row.machine)+' • '+e(thaiDate(row.date))+'</strong><p>ผลิต '+e(row.quantity)+' ใบ • เสีย '+e(row.defective)+' ใบ • ดี '+e(Number(row.quantity)-Number(row.defective))+' ใบ</p><p class="list-meta">ผู้บันทึก: '+e(row.operator || row.employee)+'<br>'+e(row.note||'')+'</p></div></article>').join('')||'<p class="empty-state">ยังไม่มีรายการผลิต</p>')+'</div></section>';
  const form=root.querySelector('#production-record-form');
  const pendingKey=`factory:production-record-pending:${context.user.id}`;
  if(form){
    try{
      const pending=JSON.parse(sessionStorage.getItem(pendingKey)||'null');
      if(pending?.requestId&&pending?.values){
        form.dataset.requestId=pending.requestId;
        form.dataset.pendingPayload=JSON.stringify(pending.values);
        form.dataset.pendingAttempts=String(Number(pending.attempts)||0);
        for(const [name,value] of Object.entries(pending.values)){const field=form.elements.namedItem(name);if(field)field.value=value;}
        form.querySelectorAll('input,select,textarea').forEach(field=>{field.disabled=true;});
        const submit=form.querySelector('[type=submit]');
        if(submit)submit.textContent='ตรวจสอบ/ลองบันทึกรายการเดิมอีกครั้ง';
      }
    }catch{sessionStorage.removeItem(pendingKey);}
  }
  if(form){
    const machineSelect=form.elements.machine;
    const refreshMachines=form.querySelector('[data-refresh-machines]');
    const machineOptionsStatus=form.querySelector('[data-machine-options-status]');
    if(form.dataset.pendingPayload)refreshMachines.disabled=true;
    refreshMachines.addEventListener('click',async()=>{
      if(refreshMachines.disabled)return;
      refreshMachines.disabled=true;
      if(machineOptionsStatus)machineOptionsStatus.textContent='กำลังโหลดรายการเครื่องจักร...';
      try{
        const result=await workApi.readWorkOptions('ผลิต');
        if(context.signal?.aborted||!form.isConnected)return;
        const selectedId=machineSelect.value;
        const machines=result.machines||[];
        const placeholder=document.createElement('option');
        placeholder.value='';placeholder.textContent='เลือกเครื่องจักร';
        const options=machines.map(machine=>{
          const option=document.createElement('option');
          option.value=String(machine.id||'');
          option.dataset.machineName=String(machine.machine_name||'');
          option.dataset.machineCode=String(machine.machine_code||'');
          option.textContent=[machine.machine_code,machine.machine_name].filter(Boolean).join(' · ');
          return option;
        });
        machineSelect.replaceChildren(placeholder,...options);
        machineSelect.disabled=machines.length===0;
        const retained=machines.some(machine=>String(machine.id)===selectedId);
        if(retained){
          machineSelect.value=selectedId;
          if(machineOptionsStatus)machineOptionsStatus.textContent='โหลดรายการใหม่แล้ว; ค่าอื่นในแบบฟอร์มยังอยู่';
        }else if(selectedId){
          machineSelect.value='';
          if(machineOptionsStatus)machineOptionsStatus.textContent='เครื่องที่เลือกถูกปิดหรือไม่มีสิทธิ์ กรุณาเลือกใหม่';
        }else if(!machines.length){
          if(machineOptionsStatus)machineOptionsStatus.textContent='ไม่มีเครื่องผลิตที่เปิดใช้งาน';
        }else if(machineOptionsStatus){
          machineOptionsStatus.textContent='โหลดรายการเครื่องจักรใหม่แล้ว';
        }
      }catch{
        if(!context.signal?.aborted&&machineOptionsStatus)machineOptionsStatus.textContent='โหลดรายการเครื่องจักรไม่สำเร็จ กรุณาลองใหม่';
      }finally{
        if(!context.signal?.aborted)refreshMachines.disabled=Boolean(form.dataset.pendingPayload);
      }
    });
  }
  form?.addEventListener('input',()=>{if(!form.dataset.pendingPayload)delete form.dataset.requestId;});
  form?.addEventListener('change',()=>{if(!form.dataset.pendingPayload)delete form.dataset.requestId;});
  form?.addEventListener('submit',async event=>{
    event.preventDefault();
    const button=form.querySelector('[type=submit]');
    if(button.disabled || !requireOnlineAction('บันทึกข้อมูลผลิต'))return;
    const values=form.dataset.pendingPayload?JSON.parse(form.dataset.pendingPayload):Object.fromEntries(new FormData(form));
    if(Number(values.defective)>Number(values.quantity)){context.showToast('ของเสียต้องไม่เกินจำนวนผลิต','error');return;}
    values.requestId=form.dataset.requestId || crypto.randomUUID();
    const attempts=(Number(form.dataset.pendingAttempts)||0)+1;
    try{sessionStorage.setItem(pendingKey,JSON.stringify({requestId:values.requestId,values,attempts}));}
    catch{context.showToast('ไม่สามารถรักษาคำขอบันทึกไว้เพื่อลองใหม่ได้','error');return;}
    form.dataset.requestId=values.requestId;
    form.dataset.pendingPayload=JSON.stringify(values);
    form.dataset.pendingAttempts=String(attempts);
    form.querySelectorAll('input,select,textarea').forEach(field=>{field.disabled=true;});
    button.disabled=true;button.textContent='กำลังบันทึกข้อมูลผลิต…';
    try {
      await api.createProductionEntry(values);
      sessionStorage.removeItem(pendingKey);
      context.showToast('บันทึกข้อมูลผลิตแล้ว','success');
      await render(root,context,{embedded});
    } catch(error){
      if(['VALIDATION_ERROR','REQUEST_REJECTED','SESSION_EXPIRED','PERMISSION_DENIED'].includes(error.code)){
        let saved;
        try{
          saved=await api.resolveProductionEntry(values.requestId);
        }catch{
          context.showToast('ยังตรวจสอบรายการเดิมไม่ได้ กรุณาเชื่อมต่อแล้วลองรายการเดิมอีกครั้ง', 'error');
          return;
        }
        if(saved){
          sessionStorage.removeItem(pendingKey);
          context.showToast('ตรวจพบว่ารายการเดิมบันทึกแล้ว','success');
          await render(root,context,{embedded});
          return;
        }
        sessionStorage.removeItem(pendingKey);
        delete form.dataset.requestId;delete form.dataset.pendingPayload;delete form.dataset.pendingAttempts;
        form.querySelectorAll('input,select,textarea').forEach(field=>{field.disabled=false;});
      }
      context.showToast(error.message||'บันทึกไม่สำเร็จ','error');
    }
    finally{button.disabled=false;button.textContent=form.dataset.pendingPayload?'ลองบันทึกรายการเดิมอีกครั้ง':'บันทึกข้อมูลผลิต';}
  });
}

