// Browser-side enrollment. The caller supplies an authenticated backend adapter;
// no service credentials or VAPID private key belong in this module.
export function decodeVapidKey(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{87}$/.test(value)) throw new Error('VAPID_PUBLIC_KEY_INVALID');
  const raw = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '=');
  const bytes = Uint8Array.from(raw, ch => ch.charCodeAt(0));
  if (bytes.length !== 65 || bytes[0] !== 4) throw new Error('VAPID_PUBLIC_KEY_INVALID');
  return bytes;
}

export async function enrollReportPush({registration, notificationApi, publicKey, saveSubscription}) {
  if (!registration?.pushManager || typeof saveSubscription !== 'function' || !notificationApi) throw new Error('PUSH_NOT_SUPPORTED');
  const key = decodeVapidKey(publicKey);
  // Call only from the user's click/tap handler.
  const permission = await notificationApi.requestPermission();
  if (permission !== 'granted') return {status:'permission_not_granted'};
  let subscription = await registration.pushManager.getSubscription();
  let created = false;
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
    created = true;
  }
  try {
    await saveSubscription(subscription.toJSON());
  } catch (error) {
    if (created) await subscription.unsubscribe().catch(()=>{});
    throw error;
  }
  return {status:'enabled'};
}

export async function disableReportPush({registration, removeSubscription}) {
  if (!registration?.pushManager || typeof removeSubscription !== 'function') throw new Error('PUSH_NOT_SUPPORTED');
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return {status:'already_disabled'};
  await removeSubscription(subscription.endpoint);
  if (!await subscription.unsubscribe()) throw new Error('PUSH_UNSUBSCRIBE_FAILED');
  return {status:'disabled'};
}
