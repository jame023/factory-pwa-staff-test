import { watchChanges, mockLiveEnabled } from '../../js/live-updates.js?v=1.3.401';
import * as calendarApi from "../../adapters/package08.js?v=1.3.401";
import { bangkokToday, escapeHtml, thaiDate } from "../../js/utils.js?v=1.3.401";
import { canManage } from "../../js/permissions.js?v=1.3.401";
import { requireOnlineAction } from "../../js/offline.js?v=1.3.401";
import { confirmAction } from "../../components/modal.js?v=1.3.401";
import { APP_MODE } from "../../js/config.js?v=1.3.401";
import { summarizeCalendarChanges } from "../../js/notification-client.js?v=1.3.401";
import { getAuthContext } from '../../js/access-context.js?v=1.3.401';
import { canonicalGroup, normalizeRoute } from '../../js/route-policy.js?v=1.3.401';

const statuses = ["เต็มวัน","ครึ่งวัน","หยุด"];
const dayTone = status => ({"เต็มวัน":"full","ครึ่งวัน":"half","หยุด":"holiday"})[status] || "";
export async function render(root,context) {
  const route = normalizeRoute(location.hash);
  const workspace = context.workspace || (route.startsWith('/employee/') ? 'employee' : route.startsWith('/executive/') ? 'executive' : route.startsWith('/admin/') ? 'admin' : null);
  const manage = canManage(context.user.role) && ['executive','admin'].includes(workspace);
  const workGroups = ['สกรีน','ผลิต','ขนส่ง','ออฟฟิศ'];
  const access = APP_MODE === 'supabase-line' ? getAuthContext() : null;
  const ownGroups = access?.authenticated ? access.groups : context.user.calendarGroups || context.user.groups || [];
  const allowedGroups = [...new Set((Array.isArray(ownGroups) ? ownGroups : []).map(canonicalGroup))].filter(value=>workGroups.includes(value));
  const pickedGroup = canonicalGroup(access?.selected_group || context.user.selectedGroup || '');
  const employeeGroup = workGroups.includes(pickedGroup) && (context.user.role === 'admin' || allowedGroups.includes(pickedGroup)) ? pickedGroup : !pickedGroup && allowedGroups.length === 1 ? allowedGroups[0] : null;
  if (!manage && !employeeGroup) {
    root.innerHTML = '<section class="card card-pad"><h1>ปฏิทินการทำงาน</h1><p>กรุณาเลือกพื้นที่ทำงานของคุณก่อนเปิดปฏิทิน</p><a class="button button-primary" href="#/employee/select-group">เลือกพื้นที่ทำงาน</a></section>';
    return;
  }
  let month = bangkokToday().slice(0,7), group = manage ? '' : employeeGroup, type = "เต็มวัน";
  let data, busy = false, loaded = false;
  const selected = new Set();
  const drafts = new Map();
  const key = entry => entry.group + "|" + entry.date;
  const dateFor = day => month + "-" + String(day).padStart(2,"0");
  async function read() {
    const result = await calendarApi.readCalendar(month, manage ? undefined : employeeGroup);
    if (!Array.isArray(result?.groups) || !Array.isArray(result?.entries)) throw new Error('ข้อมูลปฏิทินไม่ครบ กรุณาลองอีกครั้ง');
    if (manage) {
      data = result;
      if (!data.groups.includes(group)) group = data.groups[0] || '';
    } else {
      if (!result.groups.map(canonicalGroup).includes(employeeGroup)) throw new Error('สิทธิ์พื้นที่ทำงานเปลี่ยนแล้ว กรุณาเลือกพื้นที่ใหม่');
      group = employeeGroup;
      data = {...result,groups:[employeeGroup],entries:result.entries.filter(row=>canonicalGroup(row.group)===employeeGroup).map(row=>({...row,group:employeeGroup}))};
    }
  }
  function draw() {
    if (context.signal?.aborted) return;
    if (!group) { root.innerHTML = '<section class="card card-pad"><h1>ปฏิทินงาน</h1><p>ยังไม่มีสิทธิ์กลุ่มงานสำหรับบัญชีนี้</p></section>'; return; }
    const groupDrafts = [...drafts.values()].filter(row => row.group === group);
    const first = new Date(month + "-01T00:00:00Z");
    const end = new Date(first); end.setUTCMonth(end.getUTCMonth()+1,0);
    const count = end.getUTCDate();
    const approvedByDate = new Map();
    for (const leave of data.approvedLeaves || []) {
      if (!leave?.date || !leave?.employee) continue;
      const rows = approvedByDate.get(leave.date) || [];
      rows.push(leave);
      approvedByDate.set(leave.date, rows);
    }
    const cells = Array.from({length:first.getUTCDay()},()=>'<div aria-hidden="true"></div>').join("") + Array.from({length:count},(_,i)=>{
      const date = dateFor(i+1);
      const draft = drafts.get(key({group,date}));
      const status = draft?.status || data.entries.find(row=>row.date===date && row.group===group)?.status || "เต็มวัน";
      const leaves = approvedByDate.get(date) || [];
      const chosen = manage && selected.has(date);
      const tag = manage ? 'button' : 'div';
      const attributes = manage ? ' type="button" data-date="'+date+'" aria-pressed="'+chosen+'"' : ' data-calendar-day="'+date+'" role="group"';
      return '<'+tag+attributes+' class="calendar-cell work-calendar-day'+(!manage?' calendar-day-readonly':'')+' calendar-status-' + dayTone(status) + (chosen ? ' is-selected' : '') + (date === bangkokToday() ? ' is-today' : '') + '" aria-label="' + escapeHtml(thaiDate(date)+" "+status+(leaves.length ? ` มีผู้ลาอนุมัติ ${leaves.length} คน` : "")+(chosen ? " เลือกแล้ว" : "")+(draft ? " รอบันทึก" : "")) + '"><strong>' + (i+1) + '</strong><span class="calendar-status-label">' + status + '</span>' + (leaves.length ? '<span class="calendar-leave-count">ลาอนุมัติ '+leaves.length+'</span>' : '') + (chosen ? '<span class="calendar-selection-label">✓ เลือกแล้ว</span>' : '') + (draft ? '<span class="small-muted">รอบันทึก</span>' : '') + '</'+tag+'>';
    }).join("");
    const leaveList = (data.approvedLeaves || []).filter(row=>row?.date?.startsWith(month) && row?.employee)
      .slice().sort((a,b)=>a.date.localeCompare(b.date)||String(a.employee).localeCompare(String(b.employee),"th"));
    root.innerHTML = '<div class="page-heading"><div><p class="eyebrow">ปฏิทินงาน</p><h1>' + (manage ? 'ตั้งปฏิทินการทำงาน' : 'ปฏิทินการทำงาน') + '</h1><p>' + escapeHtml(group) + (manage ? ' • เลือกหลายวันและบันทึกแยกตามกลุ่มงาน' : ' • ดูวันทำงานเฉพาะพื้นที่นี้') + '</p></div></div><section class="card card-pad"><div class="field"><label for="calendarMonth">เลือกเดือน</label><input id="calendarMonth" type="month" value="' + month + '"></div>'+(manage?'<div class="chip-row attendance-section">' + data.groups.map(value=>'<button type="button" class="chip" data-group="'+escapeHtml(value)+'" aria-pressed="'+(group===value)+'">'+escapeHtml(value)+'</button>').join("") + '</div>':'<p class="help-text">ดูปฏิทินพื้นที่ '+escapeHtml(group)+' • สำหรับดูข้อมูลเท่านั้น</p>')+'<div class="calendar-legend attendance-section" aria-label="คำอธิบายสีปฏิทิน"><span class="calendar-legend-item calendar-status-full">เต็มวัน</span><span class="calendar-legend-item calendar-status-half">ครึ่งวัน</span><span class="calendar-legend-item calendar-status-holiday">หยุด</span></div><div class="calendar-grid attendance-section work-calendar-grid">' + ["อา","จ","อ","พ","พฤ","ศ","ส"].map(day=>'<span class="small-muted">'+day+'</span>').join("") + cells + '</div>' +
      (manage ? '<div class="form-actions"><button class="button" data-select-all>เลือกทั้งเดือน</button><button class="button" data-clear-selection>ล้างวันที่เลือก</button></div><p role="status">เลือก ' + selected.size + ' วัน • ' + escapeHtml(group) + '</p><form data-stage><div class="field"><label for="dayStatus">ประเภทวัน (เริ่มต้นเต็มวัน)</label><select id="dayStatus">' + statuses.map(value=>'<option'+(type===value ? ' selected' : '')+'>'+value+'</option>').join("") + '</select></div><div class="form-actions"><button type="submit" data-live-disabled class="button button-primary"'+(!selected.size ? ' disabled' : '')+'>เพิ่มวันที่เลือกในรายการรอบันทึก</button></div><p class="help-text">การเพิ่มรายการยังไม่บันทึกข้อมูล เลือกชุดวันอื่นเพิ่มได้ก่อนบันทึกกลุ่มนี้ รายการของแต่ละกลุ่มเก็บแยกกัน</p></form>' : '<p class="help-text">วันที่ยังไม่ได้กำหนดใช้ค่าเริ่มต้นเต็มวัน</p>') + '</section>' +
      '<section class="card card-pad attendance-section approved-leave-calendar"><h2>วันลาที่อนุมัติแล้ว • ทุกกลุ่ม ('+leaveList.length+' รายการ)</h2>' + (leaveList.length ? '<div class="list">'+leaveList.map(row=>'<div class="list-row"><div class="list-main"><strong>'+escapeHtml(thaiDate(row.date))+' • '+escapeHtml(row.employee)+'</strong><div class="list-meta">'+escapeHtml(row.group||'')+' • '+escapeHtml(row.period||'เต็มวัน')+'</div></div></div>').join('')+'</div>' : '<p class="empty-state">ไม่มีรายการลาที่ได้รับอนุมัติในเดือนนี้</p>') + '<p class="help-text">แสดงเฉพาะชื่อพนักงาน กลุ่มงาน วันที่ และช่วงเวลาที่อนุมัติ</p></section>' +
      (manage ? '<section class="card card-pad attendance-section"><h2>รายการรอบันทึก • '+escapeHtml(group)+' ('+groupDrafts.length+' วัน)</h2>' + (groupDrafts.length ? '<div class="list">' + groupDrafts.sort((a,b)=>a.date.localeCompare(b.date)||a.group.localeCompare(b.group,"th")).map(row=>'<div class="list-row"><div class="list-main"><strong>'+escapeHtml(thaiDate(row.date))+'</strong><div class="list-meta">'+escapeHtml(row.group)+' • <span class="calendar-legend-item calendar-status-'+dayTone(row.status)+'">'+row.status+'</span>'+'</div></div><button class="button button-small" data-remove="'+escapeHtml(key(row))+'" aria-label="นำ '+escapeHtml(thaiDate(row.date)+" "+row.group)+' ออกจากรายการ">นำออก</button></div>').join("")+'</div>' : '<p class="empty-state">เลือกวันและเพิ่มรายการด้านบนก่อนบันทึก</p>') + '<div class="form-actions"><button class="button button-primary" data-save'+(!groupDrafts.length ? ' disabled' : '')+'>บันทึกกลุ่มนี้ครั้งเดียว</button><button class="button" data-clear-drafts'+(!groupDrafts.length ? ' disabled' : '')+'>ล้างรายการกลุ่มนี้</button></div><p class="help-text">รายการรอบันทึกเก็บไว้ในหน้านี้จนกว่าจะกดบันทึก • บันทึกเฉพาะกลุ่มที่เลือก กลุ่มอื่นยังไม่ถูกบันทึก • รายการรอบันทึกยังไม่ถูกส่ง และจะหายเมื่อออกจากหน้านี้หรือรีเฟรช • ออฟไลน์ไม่บันทึกและไม่ส่งอัตโนมัติ</p></section>' : '');
    root.querySelectorAll("button,input,select").forEach(el=>{if(busy) el.disabled=true;});
    root.querySelectorAll("[data-date]").forEach(button=>button.addEventListener("click",()=>{
      if (!manage || busy) return;
      const date=button.dataset.date; selected.has(date) ? selected.delete(date) : selected.add(date); draw();
    }));
    root.querySelector("#dayStatus")?.addEventListener("change",event=>{type=event.target.value;});
    root.querySelector("[data-select-all]")?.addEventListener("click",()=>{for(let i=1;i<=count;i++)selected.add(dateFor(i));draw();});
    root.querySelector("[data-clear-selection]")?.addEventListener("click",()=>{selected.clear();draw();});
    root.querySelector("[data-stage]")?.addEventListener("submit",event=>{
      event.preventDefault(); if (!manage || busy || !selected.size) return;
      const next=new Map(drafts); selected.forEach(date=>next.set(key({group,date}),{group,date,status:type}));
      if (next.size>366) { context.showToast("เพิ่มได้ไม่เกิน 366 รายการต่อครั้ง","error");return; }
      drafts.clear();next.forEach((value,k)=>drafts.set(k,value));selected.clear();type="เต็มวัน";draw();
    });
    root.querySelectorAll("[data-remove]").forEach(button=>button.addEventListener("click",()=>{drafts.delete(button.dataset.remove);draw();}));
    root.querySelector("[data-clear-drafts]")?.addEventListener("click",()=>{groupDrafts.forEach(row=>drafts.delete(key(row)));draw();});
    root.querySelectorAll("[data-group]").forEach(button=>button.addEventListener("click",()=>{group=button.dataset.group;selected.clear();type="เต็มวัน";draw();}));
    root.querySelector("#calendarMonth").addEventListener("change",async event=>{
      if(busy || !/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value))return;
      const previous=month;month=event.target.value;busy=true;draw();
      try { await read();selected.clear();type="เต็มวัน"; }
      catch(error){month=previous;context.showToast(error.message||"โหลดไม่สำเร็จ","error");}
      finally{busy=false;draw();}
    });
    root.querySelector("[data-save]")?.addEventListener("click",async()=>{
      if(!manage || busy || !groupDrafts.length || !requireOnlineAction("บันทึกปฏิทิน"))return;
      const entries=[...groupDrafts];busy=true;draw();
      try {
        const confirmed=await confirmAction({title:"ยืนยันบันทึกปฏิทินกลุ่มนี้",message:group+" • "+entries.length+" วัน",confirmLabel:"บันทึกกลุ่มนี้"});
        if(!confirmed || context.signal?.aborted)return;
        const result=await calendarApi.saveCalendarDays(entries);
        const saved=Array.isArray(result)?result.map((record,index)=>({entry:entries[index],record})):result?.saved||[];
        const failed=Array.isArray(result)?[]:(result?.failed||[]);
        saved.forEach(item=>drafts.delete(key(item.entry)));
        selected.clear();type="เต็มวัน";
        let summaryFailed=false;
        if(APP_MODE==="supabase-line"&&saved.length){
          try {
            const ids=saved.map(item=>item.record?.id).filter(Boolean);
            if(ids.length!==saved.length)throw new Error("ตรวจรหัสรายการปฏิทินไม่ครบ");
            await summarizeCalendarChanges(ids);
          } catch {summaryFailed=true;context.showToast("บันทึกปฏิทินแล้ว แต่ส่งสรุปให้ผู้บริหาร/Admin ไม่สำเร็จ","error");}
        }
        if(failed.length)context.showToast("บันทึกสำเร็จ "+saved.length+" วัน • ยังไม่สำเร็จ "+failed.length+" วัน รายการที่เหลือยังอยู่ในรอบันทึก","error");
        else if(!summaryFailed)context.showToast("บันทึกปฏิทินของกลุ่ม "+group+" แล้ว และส่งสรุปให้ผู้บริหาร/Admin","success");
        try { await read(); } catch { context.showToast("บันทึกแล้ว แต่โหลดปฏิทินล่าสุดไม่สำเร็จ กรุณาเปิดหน้าใหม่","error"); }
      } catch(error){context.showToast(error.message||"บันทึกไม่สำเร็จ รายการยังอยู่ในรอบันทึก","error");}
      finally{busy=false;draw();}
    });
  }
  if (mockLiveEnabled) watchChanges(async()=>{await read();if(busy)return false;draw();}, {
    signal:context.signal, busy:()=>busy || !loaded, onError:()=>context.showToast('อ่านปฏิทินล่าสุดไม่สำเร็จ','error')
  });
  context.onDataChange?.(()=>{});
  root.innerHTML='<div class="page-loading">กำลังอ่านปฏิทิน…</div>';
  try{await read();loaded=true;draw();}catch(error){root.innerHTML='<p class="notice notice-danger">อ่านปฏิทินไม่สำเร็จ กรุณาเปิดหน้าใหม่</p>';context.showToast(error.message||"อ่านไม่สำเร็จ","error");loaded=true;}
}

