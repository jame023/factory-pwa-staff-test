import { notificationReadKey, readAcknowledgedIds } from './notification-read-state.js?v=1.3.402';
import { readAttendanceNotifications } from '../adapters/package10.js?v=1.3.402';
import { readReportNotifications } from '../adapters/package06.js?v=1.3.402';
import { readCalendarNotifications } from '../adapters/package08.js?v=1.3.402';
import { readLeaveNotifications } from '../adapters/package09.js?v=1.3.402';
import { subscribeStore } from './state.js?v=1.3.402';
import { APP_MODE } from './config.js?v=1.3.402';
import { readUnreadNotificationCount } from './notification-client.js?v=1.3.402';
import { setNotificationBadge } from './notification-badge.js?v=1.3.402';

export function startCalendarNotifications(user, showToast) {
  setNotificationBadge(null);
  if (APP_MODE === 'supabase-line') return startLiveNotificationInbox();
  if (APP_MODE !== 'mock') return;
  let disposed = false, generation = 0;
  async function refresh() {
    const current = ++generation;
    try {
      const groups = await Promise.all([readCalendarNotifications(),readLeaveNotifications(),readReportNotifications(),readAttendanceNotifications()]);
      if (disposed || current !== generation) return;
      const acknowledged = readAcknowledgedIds(user.id);
      const unread = new Set(groups.flat().filter(row=>row.id && !acknowledged.has(row.id)).map(row=>row.id));
      setNotificationBadge(unread.size);
    } catch {
      if (!disposed && current === generation) setNotificationBadge(null,{error:true});
    }
  }
  const onStorage = event => { if(event.key===notificationReadKey(user.id)||event.key===null)void refresh(); };
  globalThis.addEventListener?.('storage',onStorage);
  const unsubscribe=subscribeStore(refresh);
  void refresh();
  return ()=>{disposed=true;generation++;unsubscribe();globalThis.removeEventListener?.('storage',onStorage);setNotificationBadge(null);};
}

function startLiveNotificationInbox() {
  let disposed=false,loading=false,queued=false;
  async function refresh() {
    if(disposed)return;
    if(loading){queued=true;return;}
    loading=true;
    try {
      const count=await readUnreadNotificationCount();
      if(!disposed)setNotificationBadge(count);
    } catch {
      if(!disposed)setNotificationBadge(null,{error:true});
    } finally {
      loading=false;
      if(queued&&!disposed){queued=false;void refresh();}
    }
  }
  const onVisible=()=>{if(!document.hidden)void refresh();};
  const onChanged=()=>void refresh();
  globalThis.addEventListener?.('focus',onVisible);
  document.addEventListener('visibilitychange',onVisible);
  globalThis.addEventListener?.('factory-notification-inbox-changed',onChanged);
  const timer=globalThis.setInterval?.(onVisible,60000);
  void refresh();
  return ()=>{
    disposed=true;queued=false;
    globalThis.clearInterval?.(timer);
    globalThis.removeEventListener?.('focus',onVisible);
    document.removeEventListener('visibilitychange',onVisible);
    globalThis.removeEventListener?.('factory-notification-inbox-changed',onChanged);
    setNotificationBadge(null);
  };
}