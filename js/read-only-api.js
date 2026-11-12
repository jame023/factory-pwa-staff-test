import { APP_MODE, API_BASE_URL } from "./config.js?v=1.3.186";
import { normalizeAttendanceQuery } from "./attendance-contract.js?v=1.3.186";

const messages = {
  UNAUTHENTICATED: "เซสชันหมดอายุ กรุณาเปิดแอปใหม่", FORBIDDEN: "บัญชีนี้ไม่มีสิทธิ์อ่านข้อมูลนี้",
  INVALID_REQUEST: "ตัวเลือกการอ่านข้อมูลไม่ถูกต้อง", NOT_ENABLED: "โมดูลนี้ยังไม่เปิด API อ่านข้อมูล",
  INVALID_RESPONSE: "รูปแบบข้อมูลจาก API ไม่ถูกต้อง", NETWORK_ERROR: "เชื่อมต่อ API ไม่สำเร็จ ลองอีกครั้งเมื่อออนไลน์",
  TIMEOUT: "API ตอบกลับช้าเกินไป กรุณาลองใหม่", UNAVAILABLE: "API ยังไม่พร้อมใช้งาน"
};
export class ApiError extends Error {
  constructor(code) { super(messages[code] || messages.UNAVAILABLE); this.name = "ApiError"; this.code = code; }
}
export function createReadOnlyClient({ mode, apiBaseUrl, origin, fetchImpl = globalThis.fetch, timeoutMs = 10000 }) {
  if (mode !== "development") throw new ApiError("NOT_ENABLED");
  let base;
  try {
    const location = new URL(origin);
    base = new URL(apiBaseUrl, location);
    if (!["localhost","127.0.0.1","[::1]"].includes(location.hostname) ||
        !["http:","https:"].includes(location.protocol) || base.origin !== location.origin ||
        base.pathname !== "/api/v1/" || base.username || base.password || base.search || base.hash) throw new Error();
  } catch { throw new ApiError("NOT_ENABLED"); }

  return async function read(module, action, payload = {}, { signal } = {}) {
    let route;
    const params = new URLSearchParams();
    const key = module + "." + action;
    if (key === "package10.attendance.read") {
      const query = normalizeAttendanceQuery(payload);
      route = "attendance/me";
      params.set("month",query.month); params.set("period",query.period);
    } else if (key === "package10.attendance.manager" || key === "session.read") {
      if (!payload || Object.keys(payload).length) throw new ApiError("INVALID_REQUEST");
      route = key === "session.read" ? "session" : "attendance/manager/pending";
    } else throw new ApiError("NOT_ENABLED");
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const controller = new AbortController();
    const cancel = () => controller.abort();
    signal?.addEventListener("abort",cancel,{once:true});
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); },timeoutMs);
    try {
      const url = new URL(route,base);
      url.search = params.toString();
      const response = await fetchImpl(url.href, { method:"GET", credentials:"same-origin", cache:"no-store",
        redirect:"error", headers:{Accept:"application/json"}, signal:controller.signal });
      if (!response.ok) throw new ApiError(response.status === 401 ? "UNAUTHENTICATED" :
        response.status === 403 ? "FORBIDDEN" : response.status === 400 ? "INVALID_REQUEST" : "UNAVAILABLE");
      if (!response.headers.get("content-type")?.includes("application/json")) throw new ApiError("INVALID_RESPONSE");
      let envelope;
      try { envelope = await response.json(); } catch { throw new ApiError("INVALID_RESPONSE"); }
      if (envelope?.ok !== true || envelope.meta?.contractVersion !== "1.0" || !envelope.data) throw new ApiError("INVALID_RESPONSE");
      // Development may never label a fixture response as real production data.
      if (key !== "session.read" && envelope.data.source?.kind !== "development-fixture") throw new ApiError("INVALID_RESPONSE");
      return envelope.data;
    } catch (error) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      if (timedOut) throw new ApiError("TIMEOUT");
      if (error instanceof ApiError) throw error;
      throw new ApiError("NETWORK_ERROR");
    } finally {
      clearTimeout(timeout); signal?.removeEventListener("abort",cancel);
    }
  };
}
let configured;
export function requestReadOnly(module,action,payload = {},options = {}) {
  configured ||= createReadOnlyClient({ mode:APP_MODE,apiBaseUrl:API_BASE_URL,origin:globalThis.location?.origin });
  return configured(module,action,payload,options);
}
