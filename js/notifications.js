import { notificationReadKey, readAcknowledgedIds, acknowledgeNotifications } from "./notification-read-state.js?v=1.3.396";
import { readAttendanceNotifications } from "../adapters/package10.js?v=1.3.396";
import { renderLeaveMedia } from "./leave-media.js?v=1.3.396";
import { readReportNotifications } from "../adapters/package06.js?v=1.3.396";
import { APP_MODE } from "./config.js?v=1.3.396";
import { readCalendarNotifications } from "../adapters/package08.js?v=1.3.396";
import { readLeaveNotifications } from "../adapters/package09.js?v=1.3.396";
import { subscribeStore } from "./state.js?v=1.3.396";
import { escapeHtml, thaiDate } from "./utils.js?v=1.3.396";
import { iconMarkup } from "./ui-icons.js?v=1.3.396";
import { readNotificationInbox } from "./notification-client.js?v=1.3.396";

export function startCalendarNotifications(user,showToast) {
  if(APP_MODE==="supabase-line")return startLiveNotificationInbox(user,showToast);
  if(APP_MODE!=="mock")return;
  const panel=document.createElement("section");
  panel.className="card card-pad calendar-notification-panel";
  panel.setAttribute("aria-label","แจ้งเตือนระบบงาน");panel.setAttribute("aria-live","polite");panel.hidden=true;
  document.getElementById("main-content").prepend(panel);
  let version=0,lastIds="",disposed=false;
  async function refresh(){
    const current=++version;
    try{
      const [calendar,leave,reports,attendance]=await Promise.all([readCalendarNotifications(),readLeaveNotifications(),readReportNotifications(),readAttendanceNotifications()]);
      if(disposed || current!==version)return;
      const dismissed=readAcknowledgedIds(user.id);
      const rows=[...calendar.map(row=>({...row,title:"ปรับปฏิทินกลุ่ม "+row.group,body:row.entries.map(entry=>thaiDate(entry.date)+" • "+entry.status).join("\n"),route:"employee/calendar"})),...leave,...reports,...attendance]
        .filter(row=>!dismissed.has(row.id)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,10);
      panel.hidden=!rows.length;if(!rows.length)return;
      panel.innerHTML='<h2 class="notification-heading"><span class="notification-icon">'+iconMarkup('bell')+'</span>แจ้งเตือนระบบงาน</h2><p class="help-text">Mock inbox ในเบราว์เซอร์นี้ • ยังไม่ส่ง Web Push ถึงอุปกรณ์จริง</p><div class="list">'+rows.map(row=>'<article class="list-row"><div class="list-main"><strong>'+escapeHtml(row.title)+'</strong><p class="list-meta">'+escapeHtml(row.body).replace(/\n/g,'<br>')+'</p>'+renderLeaveMedia(row.mediaPreview)+'<a class="button button-small" href="#/'+escapeHtml(row.route)+'">ดูข้อมูล</a></div></article>').join("")+'</div><div class="form-actions"><button class="button">รับทราบรายการที่แสดง</button></div>';
      const ids=rows.map(row=>row.id).join("|");if(ids!==lastIds)showToast("มีแจ้งเตือนระบบงานใหม่ (mock)","success");lastIds=ids;
      panel.querySelector(".form-actions button").addEventListener("click",()=>{
        try {acknowledgeNotifications(user.id,rows.map(row=>row.id));void refresh();}
        catch {showToast("บันทึกการรับทราบไม่สำเร็จ กรุณาตรวจสอบพื้นที่จัดเก็บของเบราว์เซอร์","error");}
      });
    }catch{panel.hidden=true;}
  }
  const onStorage=event=>{if(event.key===notificationReadKey(user.id) || event.key===null)void refresh();};
  globalThis.addEventListener?.("storage",onStorage);
  const unsubscribe=subscribeStore(refresh);refresh();
  return ()=>{disposed=true;version++;unsubscribe();globalThis.removeEventListener?.('storage',onStorage);panel.remove();};
}

function startLiveNotificationInbox(user,showToast) {
  const host=document.getElementById("main-content");
  if(!host)return;
  const panel=document.createElement("section");
  panel.className="card card-pad calendar-notification-panel live-notification-panel";
  panel.setAttribute("aria-label","แจ้งเตือนใหม่");
  panel.setAttribute("aria-live","polite");
  panel.hidden=true;
  host.prepend(panel);
  let disposed=false,loading=false,knownIds=new Set(),timer;
  async function refresh(initial=false) {
    if(disposed||loading)return;
    loading=true;
    try {
      const rows=await readNotificationInbox(10);
      if(disposed)return;
      const unread=rows.filter(row=>!row.read_at);
      const newest=unread.filter(row=>!knownIds.has(row.id));
      if(!initial&&newest.length)showToast("มีแจ้งเตือนใหม่ในระบบงาน","success");
      for(const row of rows)knownIds.add(row.id);
      panel.hidden=!unread.length;
      if(!unread.length)return;
      panel.innerHTML='<div class="notification-panel-heading"><h2>'+iconMarkup("bell")+' แจ้งเตือนใหม่</h2><span>'+unread.length+' รายการ</span></div>'+
        '<div class="notification-panel-items">'+unread.slice(0,4).map(row=>'<article><strong>'+escapeHtml(row.title)+'</strong><p>'+escapeHtml(row.body)+'</p></article>').join('')+'</div>'+
        '<a class="button button-small" href="#/notifications">ดูการแจ้งเตือนทั้งหมด</a>';
    }catch{
      panel.hidden=true;
    }finally{loading=false;}
  }
  const onVisible=()=>{if(!document.hidden)void refresh();};
  globalThis.addEventListener?.("focus",onVisible);
  globalThis.addEventListener?.("visibilitychange",onVisible);
  void refresh(true);
  timer=globalThis.setInterval?.(()=>void refresh(),60000);
  return ()=>{disposed=true;globalThis.clearInterval?.(timer);globalThis.removeEventListener?.("focus",onVisible);globalThis.removeEventListener?.("visibilitychange",onVisible);panel.remove();};
}
