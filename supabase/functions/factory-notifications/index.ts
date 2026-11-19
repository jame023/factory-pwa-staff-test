const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") || "").replace(/\/+$/, "");
const LEGACY_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const SECRET_KEYS = parseSecretKeys(Deno.env.get("SUPABASE_SECRET_KEYS") || "");
const SERVICE_KEY = LEGACY_SERVICE_KEY || SECRET_KEYS.default || "";
const APP_ORIGIN = "https://jame023.github.io";
const encoder = new TextEncoder();

function parseSecretKeys(raw: string): Record<string, string> {
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

function response(body: unknown, status = 200, origin = ""): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": origin === APP_ORIGIN ? APP_ORIGIN : "null",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "authorization,apikey,content-type",
      "Vary": "Origin",
    },
  });
}

function b64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromB64url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("INVALID_ENCODING");
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(arrays.reduce((sum, array) => sum + array.length, 0));
  let offset = 0;
  for (const array of arrays) {
    output.set(array, offset);
    offset += array.length;
  }
  return output;
}

async function hkdf(ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info },
    key,
    length * 8,
  ));
}

function requireService() {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("BACKEND_NOT_CONFIGURED");
}

async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  requireService();
  const headers: Record<string, string> = {
    apikey: SERVICE_KEY,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (LEGACY_SERVICE_KEY) headers.Authorization = `Bearer ${LEGACY_SERVICE_KEY}`;
  const result = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers,
    body: JSON.stringify(args),
    redirect: "error",
    signal: AbortSignal.timeout(10000),
  });
  if (!result.ok) throw new Error("BACKEND_RPC_FAILED");
  return await result.json() as T;
}

async function loadOrCreateVapidKeys(): Promise<{ public_key: string; private_jwk: JsonWebKey }> {
  const current = await rpc<{ public_key: string; private_jwk: JsonWebKey } | null>("factory_notification_get_vapid_private");
  if (current?.public_key && current.private_jwk?.d) return current;
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const publicBytes = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const publicKey = b64url(publicBytes);
  const saved = await rpc<string>("factory_notification_store_vapid_keys", {
    p_public_key: publicKey,
    p_private_jwk: privateJwk,
  });
  const stored = await rpc<{ public_key: string; private_jwk: JsonWebKey } | null>("factory_notification_get_vapid_private");
  if (!saved || !stored?.public_key || !stored.private_jwk?.d) throw new Error("VAPID_SETUP_FAILED");
  return stored;
}

async function signVapid(privateJwk: JsonWebKey, audience: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(encoder.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64url(encoder.encode(JSON.stringify({
    aud: audience,
    exp: now + 12 * 60 * 60,
    sub: "https://jame023.github.io/factory-pwa-staff-test/",
  })));
  const signingInput = `${header}.${claims}`;
  const key = await crypto.subtle.importKey(
    "jwk",
    privateJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    encoder.encode(signingInput),
  ));
  if (signature.length !== 64) throw new Error("VAPID_SIGNATURE_INVALID");
  return `${signingInput}.${b64url(signature)}`;
}

function validateEndpoint(endpoint: string): URL {
  const parsed = new URL(endpoint);
  const permitted = new Set([
    "fcm.googleapis.com",
    "updates.push.services.mozilla.com",
    "web.push.apple.com",
  ]);
  if (parsed.protocol !== "https:" || !permitted.has(parsed.hostname) || parsed.username || parsed.password) {
    throw new Error("PUSH_ENDPOINT_REJECTED");
  }
  return parsed;
}

async function encryptedPushBody(
  publicKey: string,
  privateJwk: JsonWebKey,
  subscription: { p256dh: string; auth_key: string },
  payload: Uint8Array,
): Promise<Uint8Array> {
  const uaPublicBytes = fromB64url(subscription.p256dh);
  const authSecret = fromB64url(subscription.auth_key);
  if (uaPublicBytes.length !== 65 || uaPublicBytes[0] !== 4 || authSecret.length !== 16) {
    throw new Error("PUSH_KEYS_INVALID");
  }
  const receiverPublic = await crypto.subtle.importKey(
    "raw",
    uaPublicBytes,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const senderPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "ECDH", public: receiverPublic },
    senderPair.privateKey,
    256,
  ));
  const senderPublic = new Uint8Array(await crypto.subtle.exportKey("raw", senderPair.publicKey));
  const keyInfo = concat(encoder.encode("WebPush: info\0"), uaPublicBytes, senderPublic);
  const ikm = await hkdf(sharedSecret, authSecret, keyInfo, 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const contentKey = await hkdf(ikm, salt, encoder.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(ikm, salt, encoder.encode("Content-Encoding: nonce\0"), 12);
  const aesKey = await crypto.subtle.importKey("raw", contentKey, "AES-GCM", false, ["encrypt"]);
  const padded = concat(payload, new Uint8Array([2]));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, tagLength: 128 },
    aesKey,
    padded,
  ));
  const header = new Uint8Array(21 + senderPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = senderPublic.length;
  header.set(senderPublic, 21);
  void publicKey;
  void privateJwk;
  return concat(header, ciphertext);
}

function safeWorkerPayload(kind: string, id: string): Uint8Array {
  const permittedKinds = new Set([
    "daily_report",
    "weekly_report",
    "leave_submitted",
    "leave_approved",
    "leave_rejected",
    "calendar",
    "registration",
    "attendance_scan",
  ]);
  return encoder.encode(JSON.stringify({
    kind: permittedKinds.has(kind) ? kind : "event",
    eventId: id,
    route: "#/notifications",
  }));
}

async function sendPush(
  endpoint: string,
  p256dh: string,
  authKey: string,
  kind: string,
  eventId: string,
  keys: { public_key: string; private_jwk: JsonWebKey },
): Promise<number> {
  const parsed = validateEndpoint(endpoint);
  const body = await encryptedPushBody(keys.public_key, keys.private_jwk, { p256dh, auth_key: authKey }, safeWorkerPayload(kind, eventId));
  const vapid = await signVapid(keys.private_jwk, parsed.origin);
  const result = await fetch(parsed.href, {
    signal: AbortSignal.timeout(8000),
    method: "POST",
    redirect: "error",
    headers: {
      Authorization: `vapid t=${vapid}, k=${keys.public_key}`,
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      TTL: "86400",
      Urgency: "normal",
    },
    body,
  });
  return result.status;
}

async function dispatch(): Promise<{ processed: number }> {
  const privateKey = await loadOrCreateVapidKeys();
  const jobs = await rpc<Array<{
    queue_id: string;
    inbox_id: string;
    kind: string;
    subscriptions: Array<{ id: string; endpoint: string; p256dh: string; auth_key: string }>;
  }>>("factory_notification_claim_push_batch", { p_limit: 5 });
  let processed = 0;
  await Promise.all((Array.isArray(jobs) ? jobs : []).map(async job => {
    const dead: string[] = [];
    const succeeded: string[] = [];
    let retry = false;
    let permanentFailure = false;
    for (const sub of job.subscriptions || []) {
      try {
        const status = await sendPush(sub.endpoint, sub.p256dh, sub.auth_key, job.kind, job.inbox_id, privateKey);
        if (status >= 200 && status < 300) succeeded.push(sub.endpoint);
        else if (status === 404 || status === 410) dead.push(sub.endpoint);
        else if (status === 408 || status === 429 || status >= 500) retry = true;
        else permanentFailure = true;
      } catch {
        retry = true;
      }
    }
    const outcome = retry ? "retry" : permanentFailure && succeeded.length === 0 ? "failed" : "sent";
    await rpc("factory_notification_finish_push", {
      p_queue_id: job.queue_id,
      p_result: outcome,
      p_error_code: retry ? "PUSH_RETRYABLE" : permanentFailure ? "PUSH_REJECTED" : null,
      p_dead_endpoints: dead,
      p_success_endpoints: succeeded,
    });
    processed += 1;
  }));
  return { processed };
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin") || "";
  if (request.method === "OPTIONS") return response({}, 200, origin);
  if (origin && origin !== APP_ORIGIN) return response({ error: "ORIGIN_REJECTED" }, 403, origin);
  try {
    if (request.method === "GET" && new URL(request.url).searchParams.get("action") === "vapid-public-key") {
      const keys = await loadOrCreateVapidKeys();
      return response({ publicKey: keys.public_key }, 200, origin);
    }
    if (request.method !== "POST") return response({ error: "METHOD_NOT_ALLOWED" }, 405, origin);
    const authorization = request.headers.get("authorization") || "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!token || !await rpc<boolean>("factory_notification_validate_dispatch_token", { p_token: token })) {
      return response({ error: "UNAUTHORIZED" }, 401, origin);
    }
    const result = await dispatch();
    return response({ ok: true, ...result }, 200, origin);
  } catch {
    return response({ error: "NOTIFICATION_SERVICE_UNAVAILABLE" }, 503, origin);
  }
});

