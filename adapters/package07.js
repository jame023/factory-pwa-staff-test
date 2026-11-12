import { request } from "../js/api.js?v=1.3.298";
import { withRequestId } from "../js/business-request.js?v=1.3.186";
export const listWorkSessions = (options = {}) => request("package07", "work.read", {}, options);
export const listAdminWorkSessions = filters => request("package07", "work.admin.history", filters || {});
export const readAdminWorkSessionDetail = (id, sourceCategory = "workSessions") =>
  request("package07", "work.admin.detail", { id, sourceCategory });
export const listActiveWorkSessions = () => request("package07", "work.active.read");
export const startWorkSession = payload => request("package07", "work.start", payload);
export const endWorkSession = (id, quantity, requestId) => request("package07", "work.end", { id, quantity, requestId });
export const endScreenWorkSession = (id, quantity, expectedScreenVersion, requestId) => request("package07", "work.end.screen", { id, quantity, expectedScreenVersion, requestId });
export const readProductionWork = options => request("package07", "production.work.read", options || {});
export const saveProductionWork = payload => request("package07", "production.work.save", withRequestId(payload));
export const endProductionWorkSession = (id, expectedProductionVersion, requestId) => request("package07", "production.work.end", { id, expectedProductionVersion, requestId });

export const readWorkOptions = workType => request("package07","work.options",{workType});
export const readScreenWork = (sessionIds = []) => request("package07","screen.work.read",{sessionIds});
export const saveScreenWork = payload => request("package07","screen.work.save",withRequestId(payload));
export const listOvertimeRequests = options => request("package07", "ot.read", options || {});
export const listAdminOvertimeRequests = filters => request("package07", "ot.admin.history", filters || {});
export const readOvertimeReport = (id, scope = "self", options = {}) => request("package07", "ot.detail", { id, scope }, options);
export const readExecutiveOvertimeDashboard = (filters, options = {}) => request("package07", "ot.manager.dashboard", filters || {}, options);
export const recoverOvertimeAttempt = ownerId => request("package07", "ot.recover", { owner_id: ownerId });
export const abandonOvertimeAttempt = ownerId => request("package07", "ot.abandon", { owner_id: ownerId });
export const recoverOvertimeEdit = ownerId => request("package07", "ot.edit.recover", { owner_id: ownerId });
export const abandonOvertimeEdit = ownerId => request("package07", "ot.edit.abandon", { owner_id: ownerId });
export const editOvertimeReport = payload => request("package07", "ot.edit", payload);
export const submitOvertimeRequest = payload => request("package07", "ot.submit", payload);
