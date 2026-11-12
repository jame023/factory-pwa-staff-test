import { request } from "../js/api.js?v=1.3.260";
import { APP_MODE } from "../js/config.js?v=1.3.260";
import { authProvider } from "../js/auth.js?v=1.3.205";
import { normalizeAttendanceQuery } from "../js/attendance-contract.js?v=1.3.186";
export const readMyAttendance = (query = {}, options = {}) =>
  request("package10", APP_MODE === "mock" || APP_MODE === "development" ? "attendance.read" : "profile.attendance.read", normalizeAttendanceQuery(query), options);
export const readMyProfile = async (options = {}) => {
  if (APP_MODE !== "mock" && APP_MODE !== "development") return request("package10", "profile.read", {}, options);
  if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const session = await authProvider.getSession();
  if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");
  if (!session?.user) throw new Error("ไม่พบเซสชันทดสอบ");
  const user=session.user,groups=Array.isArray(user.groups)?user.groups:[];
  return {id:user.id,name:user.name,code:null,mainGroup:user.mainGroup||groups[0]||null,groups,source:{kind:APP_MODE==='mock'?'mock':'development-fixture'}};
};
export const readManagerAttendanceOverview = (options = {}) =>
  request("package10", "attendance.manager", {}, options);

export const readAttendanceNotifications = () => request("package10", "attendance.notifications.read");

