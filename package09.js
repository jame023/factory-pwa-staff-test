import { request } from "../js/api.js?v=1.3.186";
export const listLeaveRequests = () => request("package09", "leave.read");
export const submitLeaveRequest = payload => request("package09", "leave.submit", payload);
export const reviewLeaveRequest = (id, decision, rejectionReason = "") =>
  request("package09", "leave.review", { id, decision, rejectionReason });

export const readLeaveNotifications = () => request("package09", "leave.notifications.read");
export const cancelLeaveRequest = (id, reason) => request("package09", "leave.cancel", { id, reason });

export const readLeaveNoticeHistory = () => request("package09","leave.notices.read");
