import { request } from "../js/api.js?v=1.3.186";
export const listWorkSessions = (options = {}) => request("package07", "work.read", {}, options);
export const startWorkSession = payload => request("package07", "work.start", payload);
export const endWorkSession = (id, quantity) => request("package07", "work.end", { id, quantity });

export const readWorkOptions = () => request("package07","work.options");
export const listOvertimeRequests = () => request("package07", "ot.read");
export const submitOvertimeRequest = payload => request("package07", "ot.submit", payload);
