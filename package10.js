import { request } from "../js/api.js?v=1.3.186";
import { normalizeAttendanceQuery } from "../js/attendance-contract.js?v=1.3.186";
export const readMyAttendance = (query = {}, options = {}) =>
  request("package10", "attendance.read", normalizeAttendanceQuery(query), options);
export const readManagerAttendanceOverview = (options = {}) =>
  request("package10", "attendance.manager", {}, options);

export const readAttendanceNotifications = () => request("package10", "attendance.notifications.read");
