const identities=new WeakMap();
export function withRequestId(payload){
  if(!payload || typeof payload!=='object')throw new Error('ข้อมูลคำขอไม่ถูกต้อง');
  if(payload.requestId)return payload;
  if(!identities.has(payload))identities.set(payload,globalThis.crypto?.randomUUID?.() || 'mock-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));
  return {...payload,requestId:identities.get(payload)};
}
