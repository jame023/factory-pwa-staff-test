import { withRequestId } from "../js/business-request.js?v=1.3.406";
import { request } from "../js/api.js?v=1.3.406";
export const listProduction = () => request("package05", "production.list");
export const createProductionEntry = payload => request("package05", "production.create", withRequestId(payload));
export const resolveProductionEntry = requestId => request("package05", "production.resolve", {requestId});
