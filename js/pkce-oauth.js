const VERIFIER_KEY = 'factory-pwa-p18-pkce-verifier';

function base64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export async function startPkceOAuth({ supabaseUrl, provider, redirectTo }) {
  const random = crypto.getRandomValues(new Uint8Array(32));
  const verifier = base64Url(random);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = base64Url(new Uint8Array(digest));
  sessionStorage.setItem(VERIFIER_KEY, verifier);

  const authorize = new URL('/auth/v1/authorize', supabaseUrl);
  authorize.searchParams.set('provider', provider);
  authorize.searchParams.set('redirect_to', redirectTo);
  authorize.searchParams.set('code_challenge', challenge);
  authorize.searchParams.set('code_challenge_method', 's256');
  location.assign(authorize.href);
}

export async function completePkceOAuth({ supabaseUrl, publishableKey }) {
  const params = new URLSearchParams(location.search);
  const error = params.get('error_description') || params.get('error');
  const callbackCodeKey = 'factory-pwa-machine-oauth-code-v1';
  const code = params.get('code') || sessionStorage.getItem(callbackCodeKey);
  if (!code && !error) return null;

  if (params.has('code') || error) history.replaceState(null, '', location.pathname);
  sessionStorage.removeItem(callbackCodeKey);
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  sessionStorage.removeItem(VERIFIER_KEY);
  if (error) return { error };
  if (!verifier) return { error: 'ไม่พบ PKCE verifier ใน session นี้ กรุณาเริ่มเข้าสู่ระบบใหม่' };

  const response = await fetch(new URL('/auth/v1/token?grant_type=pkce', supabaseUrl), {
    method: 'POST',
    headers: { apikey: publishableKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ auth_code: code, code_verifier: verifier }),
    cache: 'no-store',
  });
  const session = await response.json().catch(() => null);
  if (!response.ok || !session?.access_token) {
    return { error: session?.msg || session?.message || 'Supabase แลก authorization code ไม่สำเร็จ' };
  }
  return { accessToken: session.access_token, refreshToken: session.refresh_token,
    expiresAt: Date.now() + Number(session.expires_in || 3600) * 1000 };
}

