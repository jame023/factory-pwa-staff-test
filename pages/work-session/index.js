import { renderWorkManager } from "./manager.js?v=1.3.186";
import * as workApi from "../../adapters/package07.js?v=1.3.267";
import * as screenApi from "../../adapters/package01.js?v=1.3.186";
import { render as renderProductionRecord } from "../production-record/index.js?v=1.3.333";
import { escapeHtml, thaiDate, thaiDateTime } from "../../js/utils.js?v=1.3.186";
import { showStatusModal, isStatusModalOpen } from "../../components/status-modal.js?v=1.3.295";
import { requireOnlineAction } from "../../js/offline.js?v=1.3.186";
import { isProductionEmployee, isScreenEmployee } from "../../js/permissions.js?v=1.3.186";
import { renderProductionWorkPanel } from "./production-work.js?v=1.3.295";
import { APP_MODE } from "../../js/config.js?v=1.3.267";

const duration = (start, end) => {
  const minutes = Math.max(0, Math.floor((new Date(end || Date.now()) - new Date(start)) / 60000));
  return Math.floor(minutes / 60) + " ชม. " + (minutes % 60) + " นาที";
};
export async function render(root, context, { recoverScreenDraft = null } = {}) {
  if (APP_MODE === 'mock') {
    const legacy = await import('./legacy.js?v=1.3.264');
    if (!context.signal?.aborted) return legacy.render(root, context);
    return;
  }
  if (context.user.role === "executive" || (context.user.role === "admin" && context.workspace === "executive")) return renderWorkManager(root,context);
  root.innerHTML = '<div class="page-loading"><span class="loading-spinner"></span><span>กำลังโหลดงาน…</span></div>';
  const [rows, activeRows] = await Promise.all([workApi.listWorkSessions(), workApi.listActiveWorkSessions()]);
  const userWorkGroups = context.user.role === 'admin' ? ['สกรีน','ผลิต'] : context.user.role === 'employee' ? [...new Set((context.user.groups || []).filter(group => ['สกรีน','ผลิต'].includes(group)))] : [];
  const routeWorkType = ['สกรีน','ผลิต'].includes(context.workType) && userWorkGroups.includes(context.workType) ? context.workType : '';
  const workType = routeWorkType || (userWorkGroups.length === 1 ? userWorkGroups[0] : '');
  const canCreate = ['employee','admin'].includes(context.user.role) && (userWorkGroups.length > 0);
  const screenOnly = workType === 'สกรีน' || (!workType && userWorkGroups.length === 1 && isScreenEmployee(context.user));
  const productionOnly = workType === 'ผลิต' || (!workType && userWorkGroups.length === 1 && isProductionEmployee(context.user));
  const active = activeRows.find(item => item.employeeId === context.user.id && !item.endedAt);
  let machines = [], itemNames = [], workOptionsError = '';
  if (canCreate && workType && (!active || screenOnly)) {
    try {
      const options = await workApi.readWorkOptions(workType);
      machines = active ? [] : (options.machines || []);
      itemNames = options.orders || [];
    } catch (error) { workOptionsError = error.message; }
  }
  if (context.signal?.aborted) return;
  const screenRecords = screenOnly ? await workApi.readScreenWork() : [];
  const legacyScreenEntries = screenOnly ? await screenApi.readScreenManualEntries() : [];
  if (context.signal?.aborted) return;
  const itemNameCounts = new Map();
  for (const item of itemNames) itemNameCounts.set(item.item_name, (itemNameCounts.get(item.item_name) || 0) + 1);
  const itemNameOptions = itemNames.map(item => {
    const shortId = String(item.id || '').slice(0, 8);
    const label = itemNameCounts.get(item.item_name) > 1 && shortId ? `${item.item_name} · ${shortId}` : item.item_name;
    return `<option value="${escapeHtml(item.item_name)}" data-item-id="${escapeHtml(item.id)}" data-item-name="${escapeHtml(item.item_name)}" data-item-search="${escapeHtml(`${item.item_name} ${shortId}`.toLocaleLowerCase('th'))}">${escapeHtml(label)}</option>`;
  }).join('');
  root.innerHTML =
    '<div class="page-heading"><div><p class="eyebrow">' + (screenOnly ? 'SCREEN WORKFLOW' : productionOnly ? 'PRODUCTION WORKFLOW' : 'Work Session') + '</p><h1>' + (canCreate ? (screenOnly ? 'เริ่มงาน–จบงาน และบันทึกงานสกรีน' : productionOnly ? 'งานผลิต' : 'เริ่มงาน / จบงาน') : 'ข้อมูลการทำงาน') + '</h1><p>' + (canCreate ? 'ผู้ปฏิบัติงาน: ' + escapeHtml(context.user.name) : 'ดูงานที่พนักงานบันทึกและงานที่กำลังทำ') + '</p></div></div>' +
    (screenOnly ? '<p class="notice notice-info">เริ่มงานและจบงานใช้ session เดิม · แพ็คดีและของเสียบันทึกแยก · ในเวลา/OT เป็นช่วงงาน ไม่ใช่ผลอนุมัติ OT</p>' : '') +
    (productionOnly ? '<p class="notice notice-info">เริ่มงาน บันทึกยอดผลิตและของเสีย แล้วจบงานด้วยยอดผลิตเดียวกัน ระบบไม่สร้างรายการ session ซ้ำ</p>' : '') +
    (canCreate ? (active
      ? '<section class="card card-pad"><p class="eyebrow">กำลังทำงาน</p><h2>' + escapeHtml(active.machine) + " • " + escapeHtml(active.workType) +
        '</h2><p>' + (active.orderName ? 'รายการ ' + escapeHtml(active.orderName) + ' · ' : '') + 'เริ่ม ' + escapeHtml(thaiDateTime(active.startedAt)) + ' · ทำงาน ' + escapeHtml(duration(active.startedAt)) + (active.note ? ' · หมายเหตุ ' + escapeHtml(active.note) : '') +
        '</p><div class="status-row"><span class="badge badge-info">กำลังทำงาน</span></div>' +
        '<button class="button button-danger" type="button" data-end="' + escapeHtml(active.id) + '" style="margin-top:.8rem">จบงาน</button>' +
        '<form id="end-work-form" hidden style="margin-top:.8rem">' + (active.workType === 'ผลิต' ? '<div class="notice notice-info" data-production-end-count>จำนวนตอนจบจะอ่านจากข้อมูลผลิตที่บันทึกไว้</div>' : '<div class="field"><label for="endQuantity">จำนวนสกรีน</label><input id="endQuantity" name="quantity" type="number" min="0" step="1" inputmode="numeric" required><p class="help-text">จำนวนต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป</p></div>') + '<div class="form-actions"><button class="button" type="button" data-cancel-end>ยกเลิก</button><button class="button button-danger" type="submit">ยืนยันจบงาน</button></div></form></section>'
      : '<section class="card form-card"><p class="eyebrow">ยังไม่ได้เริ่มงาน</p><h2>เริ่มงาน</h2><form id="work-form"><div class="form-grid" style="margin-top:.8rem">' +
        (productionOnly ? '<div class="field"><label for="production-work-date">วันที่ของงาน</label><input id="production-work-date" type="date" readonly value="' + escapeHtml(new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Bangkok",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())) + '"><p class="help-text">วันธุรกิจยืนยันจากเวลาเริ่มงานฝั่ง Server</p></div>' : '') +
        '<div class="field"><label for="workType">ประเภทงาน</label>' + (workType ? '<input id="workType" name="workType" value="' + escapeHtml(workType) + '" readonly>' : '<select id="workType" name="workType" required><option value="">เลือกพื้นที่งาน</option>' + userWorkGroups.map(group => '<option value="' + escapeHtml(group) + '">' + escapeHtml(group) + '</option>').join('') + '</select>') + '</div>' +
        '<div class="field"><label for="machine">เครื่องจักร</label><select id="machine" name="machine" required ' + (!machines.length ? 'disabled' : '') + '><option value="">' + (workOptionsError ? 'โหลดเครื่องจักรไม่สำเร็จ' : 'เลือกเครื่องจักร') + '</option>' +
          machines.map(machine => '<option value="' + escapeHtml(machine.id) + '" data-machine-name="' + escapeHtml(machine.machine_name) + '" data-machine-code="' + escapeHtml(machine.machine_code) + '">' + escapeHtml(machine.machine_name) + '</option>').join('') + '</select><button class="button button-secondary" type="button" data-refresh-work-options ' + (workType ? '' : 'disabled') + '>โหลดรายการใหม่</button><p class="help-text" data-work-options-status role="status">' + (workOptionsError ? 'โหลดรายการไม่สำเร็จ สามารถลองใหม่ได้' : 'โหลดเฉพาะเครื่องและรายการที่เปิดใช้งานตามสิทธิ์บัญชี') + '</p></div>' +
        '<div class="field" id="order-field" hidden><label for="orderNameSearch">ค้นหารายการชื่อ</label><input id="orderNameSearch" type="search" autocomplete="off" placeholder="พิมพ์ชื่อรายการเพื่อค้นหา" aria-describedby="orderNameHelp"><select id="orderName" name="orderName" aria-label="เลือกรายการชื่อ" disabled required><option value="">เลือกชื่อรายการ</option>' + itemNameOptions + '</select><p id="orderNameHelp" class="help-text">รายการจาก Supabase เรียงตามชื่อและรหัส · เมื่อชื่อซ้ำจะแสดงรหัสช่วยแยก</p><p data-order-search-empty class="small-muted" role="status" hidden></p></div>' +
        '<div class="field field-full"><label for="workNote">หมายเหตุ</label><textarea id="workNote" name="note" maxlength="300" placeholder="รายละเอียดเพิ่มเติม (ถ้ามี)"></textarea></div>' +
        '</div><div class="form-actions"><button class="button button-primary" type="submit">▶️ เริ่มงาน</button></div></form></section>') : '') +
    (screenOnly ? '<div data-screen-work-panel></div>' : '') +
    (productionOnly ? '<div data-production-work></div><details class="card card-pad" data-production-record><summary><strong>แบบฟอร์มผลิตครั้งเดียวเดิม</strong></summary><p class="notice notice-warning">ใช้เฉพาะรายการผลิตที่ไม่มี Work Session ข้อมูลส่วนนี้แยกจากยอดงานผลิตและไม่ควรบันทึกงานเดียวกันซ้ำ</p><div data-production-legacy-form></div></details>' : '') +
    '<div class="section-title"><div><h2>ประวัติงาน</h2><p>ประวัติงานตามสิทธิ์บัญชี</p></div></div>' +
    '<section class="card card-pad"><div class="list">' + (rows.length ? rows.map(item =>
      '<article class="list-row"><div class="list-main"><div class="list-title">' + escapeHtml(item.machine) + " · " + escapeHtml(item.workType) +
      '</div><div class="list-meta">' + escapeHtml(item.employee || "พนักงาน") + " · " + escapeHtml(item.orderName || "ไม่มีชื่อรายการ") + " · " + escapeHtml(thaiDateTime(item.startedAt)) +
      " – " + escapeHtml(item.endedAt ? thaiDateTime(item.endedAt) : "กำลังทำงาน") + " · " + escapeHtml(duration(item.startedAt, item.endedAt)) +
      (item.endedAt ? ' · จำนวน ' + escapeHtml(item.quantity) : '') +
      '</div></div><span class="badge ' + (item.endedAt ? "badge-success" : "badge-info") + '">' +
      (item.endedAt ? "จบแล้ว" : "กำลังทำงาน") + "</span></article>"
    ).join("") : '<div class="empty-state">ยังไม่มีประวัติงาน เริ่มงานเพื่อดูรายการที่นี่</div>') + "</div></section>" +
    '<p class="small-muted" style="margin-top:.8rem">ออฟไลน์จะไม่บันทึกหรือเข้าคิวรายการ</p>';

  if (productionOnly) {
    try {
      await renderProductionWorkPanel(root.querySelector("[data-production-work]"), context, {active,onRefresh:()=>render(root,context)});
      await renderProductionRecord(root.querySelector("[data-production-legacy-form]"), context, {embedded:true});
    }
    catch (error) {
      if (context.signal?.aborted) return;
      root.querySelector("[data-production-legacy-form]").innerHTML = '<p class="notice notice-danger" role="alert">โหลดแบบฟอร์มงานผลิตไม่สำเร็จ: ' + escapeHtml(error.message || 'ไม่สามารถเชื่อมต่อได้') + '</p>';
    }
  }
  if (screenOnly) {
    const screenModule = await import('./screen-work.js?v=1.3.295');
        await screenModule.renderScreenWorkPanel(root, context, {active:active?.workType === 'สกรีน' ? active : null,sessions:rows,catalog:itemNames,records:screenRecords,legacyEntries:legacyScreenEntries,onRefresh:options=>render(root,context,options),recoverDraft:recoverScreenDraft});
  }

  const form = root.querySelector("#work-form");
  if (form) {
    const orderSearch = form.querySelector('#orderNameSearch');
    const orderSelect = form.elements.orderName;
    const orderEmpty = form.querySelector('[data-order-search-empty]');
    const machineSelect = form.elements.machine;
    const machineRefresh = form.querySelector('[data-refresh-work-options]');
    const workOptionsStatus = form.querySelector('[data-work-options-status]');
    const machinePlaceholder = machineSelect?.options[0]?.cloneNode(true);
    let orderPlaceholder = null;
    let allOrderOptions = [];
    let filterOrderOptions = () => {};
    if (orderSearch && orderSelect) {
      orderPlaceholder = orderSelect.options[0].cloneNode(true);
      allOrderOptions = [...orderSelect.options].slice(1).map(option => option.cloneNode(true));
      filterOrderOptions = () => {
        const selectedId = orderSelect.selectedOptions[0]?.dataset.itemId || '';
        const query = orderSearch.value.trim().toLocaleLowerCase('th');
        const matches = allOrderOptions.filter(option => !query || option.dataset.itemSearch.includes(query));
        orderSelect.replaceChildren(orderPlaceholder.cloneNode(true), ...matches);
        const selected = matches.find(option => option.dataset.itemId === selectedId);
        if (selected) selected.selected = true;
        else orderSelect.value = '';
        if (orderEmpty) {
          orderEmpty.hidden = matches.length > 0;
          orderEmpty.textContent = itemNames.length ? 'ไม่พบรายการชื่อที่ตรงกัน' : workOptionsError ? 'โหลดรายการชื่อไม่สำเร็จ กรุณาโหลดแบบฟอร์มใหม่' : 'ไม่มีรายการชื่อที่เปิดใช้งานให้เลือก';
        }
      };
      orderSearch.addEventListener('input', filterOrderOptions);
      orderSelect.addEventListener('change', () => {
        orderSearch.value = orderSelect.selectedOptions[0]?.dataset.itemName || '';
        filterOrderOptions();
      });
      filterOrderOptions();
    }
    let optionsRefreshRequest = 0;
    machineRefresh?.addEventListener('click', async () => {
      const requestedType = form.elements.workType.value;
      if (!requestedType || !userWorkGroups.includes(requestedType) || machineRefresh.disabled) return;
      const requestId = ++optionsRefreshRequest;
      machineRefresh.disabled = true;
      machineRefresh.textContent = 'กำลังโหลด…';
      if (workOptionsStatus) workOptionsStatus.textContent = 'กำลังโหลดรายการล่าสุด…';
      try {
        const options = await workApi.readWorkOptions(requestedType);
        if (context.signal?.aborted || !form.isConnected || requestId !== optionsRefreshRequest) return;
        if (form.elements.workType.value !== requestedType) return;
        if (!Array.isArray(options?.machines) || !Array.isArray(options?.orders)) throw new Error('INVALID_WORK_OPTIONS');

        const selectedMachineId = machineSelect.value;
        const selectedOrderId = orderSelect?.selectedOptions[0]?.dataset.itemId || '';
        machines = options.machines;
        itemNames = options.orders;
        workOptionsError = '';

        machineSelect.replaceChildren(machinePlaceholder.cloneNode(true), ...machines.map(machine => {
          const option = document.createElement('option');
          option.value = String(machine.id || '');
          option.dataset.machineName = String(machine.machine_name || '');
          option.dataset.machineCode = String(machine.machine_code || '');
          option.textContent = String(machine.machine_name || '');
          return option;
        }));
        const machineStillAvailable = machines.some(machine => String(machine.id) === selectedMachineId);
        machineSelect.disabled = machines.length === 0;
        machineSelect.value = machineStillAvailable ? selectedMachineId : '';

        const itemNameCounts = new Map();
        for (const item of itemNames) itemNameCounts.set(item.item_name, (itemNameCounts.get(item.item_name) || 0) + 1);
        allOrderOptions = itemNames.map(item => {
          const option = document.createElement('option');
          const shortId = String(item.id || '').slice(0, 8);
          option.value = String(item.item_name || '');
          option.dataset.itemId = String(item.id || '');
          option.dataset.itemName = String(item.item_name || '');
          option.dataset.itemSearch = `${item.item_name || ''} ${shortId}`.toLocaleLowerCase('th');
          option.textContent = itemNameCounts.get(item.item_name) > 1 && shortId ? `${item.item_name} · ${shortId}` : String(item.item_name || '');
          return option;
        });
        if (orderSelect && orderPlaceholder) {
          orderSelect.replaceChildren(orderPlaceholder.cloneNode(true), ...allOrderOptions.map(option => option.cloneNode(true)));
          const orderStillAvailable = allOrderOptions.find(option => option.dataset.itemId === selectedOrderId);
          if (orderStillAvailable) {
            const selected = [...orderSelect.options].find(option => option.dataset.itemId === selectedOrderId);
            if (selected) {
              selected.selected = true;
              orderSearch.value = selected.dataset.itemName || '';
            }
          }
          filterOrderOptions();
        }
        const orderStillAvailable = !selectedOrderId || itemNames.some(item => String(item.id) === selectedOrderId);
        const selectionChanged = Boolean(selectedMachineId && !machineStillAvailable) || Boolean(selectedOrderId && !orderStillAvailable);
        if (workOptionsStatus) workOptionsStatus.textContent = selectionChanged
          ? 'รายการที่เลือกถูกปิดหรือไม่มีสิทธิ์ กรุณาเลือกใหม่ · ค่าอื่นในแบบฟอร์มยังอยู่'
          : 'โหลดรายการล่าสุดแล้ว · ค่าอื่นในแบบฟอร์มยังอยู่';
      } catch {
        if (context.signal?.aborted || !form.isConnected || requestId !== optionsRefreshRequest) return;
        if (workOptionsStatus) workOptionsStatus.textContent = 'โหลดรายการไม่สำเร็จ รายการและค่าที่กรอกยังอยู่ กรุณาลองใหม่';
      } finally {
        if (!context.signal?.aborted && form.isConnected && requestId === optionsRefreshRequest) {
          machineRefresh.disabled = false;
          machineRefresh.textContent = 'โหลดรายการใหม่';
        }
      }
    });
    const syncWorkType = () => {
      const screen = form.elements.workType.value === "สกรีน";
      root.querySelector("#order-field").hidden = !screen;
      form.elements.orderName.disabled = !screen || itemNames.length === 0;
      form.elements.orderName.required = screen;
      form.querySelector('#orderNameSearch').disabled = !screen || itemNames.length === 0;
      if (!screen) { form.elements.orderName.value = ""; form.querySelector('#orderNameSearch').value = ''; }
    };
    form.elements.workType.addEventListener("change", event => {
      if (form.elements.workType.tagName === 'SELECT') {
        render(root,{...context,workType:event.target.value});
        return;
      }
      syncWorkType();
    });
    syncWorkType();
    form.addEventListener('input', event => { if (event.target.name !== 'requestId') delete form.dataset.requestId; });
    form.addEventListener('change', event => { if (event.target.name !== 'requestId') delete form.dataset.requestId; });
  }
  if (form) form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!requireOnlineAction("เริ่มงาน")) return;
    if (isStatusModalOpen()) return;
    const button = form.querySelector("button[type=submit]");
    if (button.disabled) return;
    const modal=showStatusModal({title:'สถานะงาน',message:'กำลังเริ่มงาน',tone:'working'});
    button.disabled = true;
    let payload;
    try {
      if(form.dataset.pendingStart){
        payload=JSON.parse(form.dataset.pendingStart);
      }else{
        const values = Object.fromEntries(new FormData(form));
        if (!values.workType || !userWorkGroups.includes(values.workType)) throw Object.assign(new Error('ไม่มีสิทธิ์เริ่มงานในพื้นที่นี้'),{code:'PERMISSION_DENIED'});
        const selectedMachine=form.elements.machine.selectedOptions[0];
        if (!selectedMachine?.value) throw Object.assign(new Error('เลือกเครื่องจักรจากรายการก่อนเริ่มงาน'),{code:'VALIDATION_ERROR'});
        let itemNameId=null;
        if (values.workType === 'สกรีน') {
          itemNameId=form.elements.orderName.selectedOptions[0]?.dataset.itemId || null;
          if(!itemNameId) throw Object.assign(new Error('เลือกชื่อรายการที่ยัง active'),{code:'VALIDATION_ERROR'});
        }
        payload={requestId:form.dataset.requestId || crypto.randomUUID(),workType:values.workType,machineId:selectedMachine.value,itemNameId,note:values.note||''};
        form.dataset.requestId=payload.requestId;
        form.dataset.pendingStart=JSON.stringify(payload);
      }
      form.querySelectorAll('input,select,textarea').forEach(field=>{field.disabled=true;});
      await workApi.startWorkSession(payload);
      if(context.signal?.aborted){modal.close();return;}
      delete form.dataset.pendingStart;delete form.dataset.requestId;
      modal.update({title:'เริ่มงานสำเร็จ',message:'ข้อมูลงานบันทึกและอ่านกลับจาก Supabase แล้ว',tone:'success'});
      setTimeout(()=>{modal.close();render(root,context);},650);
      return;
    } catch (error) {
      if(context.signal?.aborted){modal.close();return;}
      const rejected=['VALIDATION_ERROR','PERMISSION_DENIED','REQUEST_REJECTED','WORK_SESSION_BUSY','CONFLICT','OPTIONS_CHANGED'].includes(error.code);
      if(rejected){
        delete form.dataset.pendingStart;delete form.dataset.requestId;
        form.querySelectorAll('input,select,textarea').forEach(field=>{field.disabled=false;});
      }
      modal.update({title:'เริ่มงานไม่สำเร็จ',message:error.message || 'ไม่สามารถเริ่มงานได้',detail:rejected?'ระบบยืนยันว่าเริ่มงานไม่สำเร็จ ข้อมูลเดิมยังอยู่ในฟอร์ม':'ยังไม่ทราบผลการบันทึก ให้ลองคำขอเดิมอีกครั้งก่อนแก้ไขข้อมูล',tone:'error',retry:rejected?null:()=>{modal.close();button.disabled=false;form.requestSubmit();},close:()=>{modal.close();button.disabled=false;}});
    }
  });
  const endButton = root.querySelector("[data-end]");
  const endForm = root.querySelector("#end-work-form");
  endButton?.addEventListener("click", async () => {
    if (active.workType === 'ผลิต') {
      const productionForm=root.querySelector('#production-work-form');
      if(!productionForm || productionForm.dataset.dirty==='true') { context.showToast('กรุณาบันทึกหรือโหลดข้อมูลผลิตล่าสุดก่อนจบงาน','error'); return; }
      endButton.disabled=true;
      try {
        const result=await workApi.readProductionWork({sessionIds:[active.id],limit:1});
        const detail=result.items?.find(row=>row.work_session_id===active.id);
        if(!detail){context.showToast('กรุณาบันทึกข้อมูลผลิตก่อนจบงาน','error');return;}
        endForm.dataset.productionVersion=String(detail.version);
        endForm.dataset.productionQuantity=String(detail.quantity);
        root.querySelector('[data-production-end-count]').textContent='ยอดจบงานจะบันทึก '+detail.quantity+' ใบ จากข้อมูลผลิตที่บันทึกแล้ว';
      } catch(error) { if(!context.signal?.aborted)context.showToast(error.message||'ตรวจสอบข้อมูลผลิตไม่สำเร็จ','error');return; }
      finally { if(!context.signal?.aborted)endButton.disabled=false; }
    }
    if (active.workType === 'สกรีน') {
      if (!screenOnly) {
        context.showToast("เปิดหน้างานสกรีนเพื่อบันทึกหรือตรวจรายละเอียดก่อนจบงาน", "error");
        return;
      }
      const screenForm = root.querySelector("#screen-work-form");
      if (!screenForm && active.itemNameId) {
        context.showToast("โหลดรายละเอียดงานสกรีนไม่สำเร็จ กรุณาโหลดหน้าใหม่ก่อนจบงาน", "error");
        return;
      }
      if (screenForm?.dataset.dirty === "true") {
        context.showToast("มีรายละเอียดสกรีนที่ยังไม่บันทึก กรุณาบันทึกหรือโหลดข้อมูลใหม่ก่อนจบงาน", "error");
        return;
      }
      if (screenForm) {
        endButton.disabled = true;
        try {
          const savedRows = await workApi.readScreenWork([active.id]);
          if (context.signal?.aborted) return;
          const saved = savedRows.find(row => row.work_session_id === active.id);
          if (!saved && active.itemNameId) {
            context.showToast("กรุณาบันทึกรายละเอียดงานสกรีนก่อนจบ session", "error");
            return;
          }
          if (saved && saved.version !== Number(screenForm.dataset.version)) {
            context.showToast("งานถูกเปลี่ยนแปลง กรุณาโหลดใหม่ก่อนจบงาน", "error");
            return;
          }
          if (saved) { screenForm.inert = true; endForm.dataset.screenVersion = String(saved.version); }
        } catch (error) {
          if (context.signal?.aborted) return;
          context.showToast(error.message || "ตรวจสอบรายละเอียดสกรีนไม่สำเร็จ", "error");
          return;
        } finally {
          if (!context.signal?.aborted) endButton.disabled = false;
        }
      }
    }
    endButton.hidden = true;
    endForm.hidden = false;
    if(active.workType!=='ผลิต')endForm.elements.quantity.focus();
  });
  root.querySelector("[data-cancel-end]")?.addEventListener("click", () => {
    const screenForm = root.querySelector("#screen-work-form");
    if (screenForm) screenForm.inert = false;
    endForm.hidden = true;
    endButton.hidden = false;
    endButton.focus();
  });
  endForm?.addEventListener('input',()=>{delete endForm.dataset.requestId;});
  endForm?.addEventListener("submit", async event => {
    event.preventDefault();
    const button = endForm.querySelector('[type="submit"]');
    if (!requireOnlineAction("จบงาน") || button.disabled || isStatusModalOpen()) return;
    const quantity = active.workType==='ผลิต' ? Number(endForm.dataset.productionQuantity) : Number(endForm.elements.quantity.value);
    if ((active.workType!=='ผลิต' && (endForm.elements.quantity.value === "" || !Number.isInteger(quantity) || quantity < 0)) || (active.workType==='ผลิต' && (!Number.isInteger(quantity) || quantity<1))) {
      context.showToast("กรุณาใส่จำนวนเต็มตั้งแต่ 0 ขึ้นไป", "error"); return;
    }
    const cancelButton=endForm.querySelector("[data-cancel-end]");
    let submitStarted=false, modal;
    modal=showStatusModal({title:'ยืนยันจบงาน',message:'งาน: '+active.machine+' • '+active.workType+(active.orderName?' • '+active.orderName:''),detail:'เริ่ม '+thaiDateTime(active.startedAt)+' · จำนวนที่บันทึก: '+quantity, tone:'info',dismissOnEscape:false,dismissOnBackdrop:false,confirmLabel:'ยืนยันจบงาน',confirm:()=>{submitStarted=true;return submitEnd();},close:()=>{modal.close();if(!submitStarted){button.disabled=false;cancelButton.disabled=false;const screenForm=root.querySelector('#screen-work-form');if(screenForm)screenForm.inert=false;}}});
    button.disabled = true;
    endForm.querySelector("[data-cancel-end]").disabled = true;
    const submitEnd = async () => {
      modal.update({title:'สถานะงาน',message:'กำลังจบงาน',tone:'working'});
      try {
      const requestId=endForm.dataset.requestId || crypto.randomUUID();
      endForm.dataset.requestId=requestId;
      if(active.workType==='ผลิต') {
        const savedRows=await workApi.readProductionWork({sessionIds:[active.id],limit:1});
        const saved=savedRows.items?.find(row=>row.work_session_id===active.id);
        if(!saved||saved.version!==Number(endForm.dataset.productionVersion)||saved.quantity!==quantity)throw new Error('ข้อมูลผลิตเปลี่ยนแปลง กรุณาโหลดข้อมูลล่าสุดก่อนจบงาน');
        await workApi.endProductionWorkSession(endButton.dataset.end,Number(endForm.dataset.productionVersion),requestId);
      } else {
      const screenForm=root.querySelector('#screen-work-form');
      if(active.workType==='สกรีน'&&active.itemNameId&&screenForm?.dataset.version){
        if(screenForm.dataset.dirty==='true')throw new Error('มีรายละเอียดสกรีนที่ยังไม่บันทึก กรุณาบันทึกหรือโหลดข้อมูลใหม่ก่อนจบงาน');
        const savedRows=await workApi.readScreenWork([active.id]);
        if(context.signal?.aborted){modal.close();return;}
        const saved=savedRows.find(row=>row.work_session_id===active.id);
        if(!saved||saved.version!==Number(endForm.dataset.screenVersion)||saved.version!==Number(screenForm.dataset.version))throw new Error('งานถูกเปลี่ยนแปลง กรุณาโหลดใหม่ก่อนจบงาน');
      }
      if (active.workType === 'สกรีน' && active.itemNameId && endForm.dataset.screenVersion) {
        await workApi.endScreenWorkSession(endButton.dataset.end, quantity, Number(endForm.dataset.screenVersion), requestId);
      } else {
        await workApi.endWorkSession(endButton.dataset.end, quantity, requestId);
      }
      }
      if(context.signal?.aborted){modal.close();return;}
      modal.update({title:'จบงานสำเร็จ',message:'จำนวนและเวลาจบถูกบันทึกและอ่านกลับจาก Supabase แล้ว',tone:'success'});
      setTimeout(()=>{modal.close();render(root,context);},650);
      return;
    } catch (error) {
      if(context.signal?.aborted){modal.close();return;}
      modal.update({title:'จบงานไม่สำเร็จ',message:error.message || 'ไม่สามารถจบงานได้',detail:error.code==='NETWORK_ERROR'?'ยังไม่ทราบผลการบันทึก ให้ลองคำขอเดิมอีกครั้งเพื่ออ่านผลก่อนส่งคำขอใหม่':'จำนวนและหมายเหตุยังคงอยู่ในแบบฟอร์ม',tone:'error',close:()=>modal.close()});
      button.disabled = false;
      endForm.querySelector("[data-cancel-end]").disabled = false;
      const screenForm=root.querySelector('#screen-work-form');if(screenForm)screenForm.inert=false;
      }
    };
  });
}

