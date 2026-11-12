import { createClient } from '../vendor/supabase-js-2.118.0.js';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js?v=1.3.186';
import { saveSession, loadSession, deleteSession } from './session-vault.js?v=1.3.191';
let client;
// The SDK owns refresh rotation, expiry and the persisted Auth session format.
// Browser encryption cannot protect against compromised same-origin scripts.
const storage={
  async getItem() {
    const saved=await loadSession();
    if(!saved) return null;
    // One-way migration of the previous Supabase vault. No LINE token is read.
    if(saved.accessToken) return JSON.stringify({access_token:saved.accessToken,refresh_token:saved.refreshToken,
      expires_at:Math.floor(saved.expiresAt/1000),token_type:'bearer'});
    return JSON.stringify(saved);
  },
  async setItem(key,value) {
    const session=JSON.parse(value);
    // Explicit allowlist excludes provider_token/provider_refresh_token/user metadata.
    await saveSession({access_token:session.access_token,refresh_token:session.refresh_token,
      expires_at:session.expires_at,expires_in:session.expires_in,token_type:session.token_type,user:{id:session.user?.id}});
  },
  async removeItem() {await deleteSession();}
};
export function getAuthClient() {
  if(!navigator.locks) throw new Error('Browser ไม่รองรับการจัดการ Session หลายแท็บ กรุณาอัปเดต Browser');
  client ||= createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{
    storage,storageKey:'factory-pwa-auth-sdk',persistSession:true,autoRefreshToken:false,detectSessionInUrl:false,
    lock:(name,timeout,action)=>navigator.locks.request(name,action)
  }});
  return client;
}
