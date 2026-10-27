import { notificationReadKey, readAcknowledgedIds, acknowledgeNotifications } from "./notification-read-state.js?v=1.3.186";
import { readAttendanceNotifications } from "../adapters/package10.js?v=1.3.186";
import { renderLeaveMedia } from "./leave-media.js?v=1.3.186";
import { readReportNotifications } from "../adapters/package06.js?v=1.3.186";
import { APP_MODE } from "./config.js?v=1.3.186";
import { readCalendarNotifications } from "../adapters/package08.js?v=1.3.186";
import { readLeaveNotifications } from "../adapters/package09.js?v=1.3.186";
import { subscribeStore } from "./state.js?v=1.3.186";
import { escapeHtml, thaiDate } from "./utils.js?v=1.3.186";

export function startCalendarNotifications(user,showToast) {
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
      panel.innerHTML='<h2>🔔 แจ้งเตือนระบบงาน</h2><p class="help-text">Mock inbox ในเบราว์เซอร์นี้ • ยังไม่ส่ง Web Push ถึงอุปกรณ์จริง</p><div class="list">'+rows.map(row=>'<article class="list-row"><div class="list-main"><strong>'+escapeHtml(row.title)+'</strong><p class="list-meta">'+escapeHtml(row.body).replace(/\n/g,'<br>')+'</p>'+renderLeaveMedia(row.mediaPreview)+'<a class="button button-small" href="#/'+escapeHtml(row.route)+'">ดูข้อมูล</a></div></article>').join("")+'</div><div class="form-actions"><button class="button">รับทราบรายการที่แสดง</button></div>';
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
