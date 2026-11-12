import { request } from '../js/api.js?v=1.3.324';

export const listLeaveRequests = (scope = 'self') => request("package09", "leave.read", {scope});
export const readLeaveHistoryPage = filters => request("package09", "leave.history", filters);
export const readAdminLeaveHistoryPage = filters => request("package09", "leave.admin.history", filters || {});
export const readLeaveManagerQueuePage = (filters, options = {}) => request("package09", "leave.manager.queue", filters || {}, options);
export const readLeaveManagerReportPage = (filters, options = {}) => request("package09", "leave.manager.report", filters || {}, options);
export const readApprovedLeaveCalendar = month => request("package09", "leave.calendar", {month});
export const submitLeaveRequest = payload => request("package09", "leave.submit", payload);
export const submitProxyLeaveRequest = payload => request("package09", "leave.proxy.submit", payload);
export const reviewLeaveRequest = (id, decision, rejectionReason = "", updatedAt) =>
  request("package09", "leave.review", { id, decision, rejectionReason, updatedAt });

export const readLeaveNotifications = () => request("package09", "leave.notifications.read");
export const cancelLeaveRequest = (id, reason, updatedAt) => request("package09", "leave.cancel", { id, reason, updatedAt });
export const readLeaveOptions = () => request('package09','leave.options');
export const readLeaveDetail = (id, options = {}) => request('package09','leave.detail',{id},options);
export const readLeaveImages = (id, options = {}) => request('package09','leave.images',{id},options);
export const recoverLeaveOperations = () => request('package09','leave.recover');
export const mutateLeaveRequest = (operation,payload) => request('package09','leave.mutate',{...payload,operation});

export const readLeaveNoticeHistory = () => request("package09","leave.notices.read");
