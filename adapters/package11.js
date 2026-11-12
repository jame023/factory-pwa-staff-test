import { request } from "../js/api.js?v=1.3.327";
export const readAdminSummary = () => request("package11", "admin.read");
export const readAdminAuditPage = (filters = {}, options = {}) => request("package11", "admin.audit.list", { filters }, options);
export const readAdminAuditDetail = (id, options = {}) => request("package11", "admin.audit.detail", { id }, options);
export const listRecords = category => request("package11", "records.list", { category });
export const saveRecord = (category, id, values, expectedBefore, reason) => request("package11", "records.save", { category, id, values, expectedBefore, reason });
