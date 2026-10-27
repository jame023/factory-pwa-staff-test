import { request } from "../js/api.js?v=1.3.186";
export const readAdminSummary = () => request("package11", "admin.read");
export const listRecords = category => request("package11", "records.list", { category });
export const saveRecord = (category, id, values, expectedBefore, reason) => request("package11", "records.save", { category, id, values, expectedBefore, reason });
