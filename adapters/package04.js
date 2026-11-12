import { withRequestId } from "../js/business-request.js?v=1.3.186";
import { request } from "../js/api.js?v=1.3.298";
export const listDeliveries = filters => request("package04", "delivery.list", filters);
export const listAdminDeliveries = filters => request("package04", "delivery.admin.list", filters || {});
export const getDeliveryOptions = () => request("package04", "delivery.options");
export const createDelivery = payload => request("package04", "delivery.create", withRequestId(payload));
export const getDeliveryDetail = id => request("package04", "delivery.detail", {id});
export const cancelDelivery = (id, expectedVersion) => request("package04", "delivery.cancel", {id, expectedVersion});
