import { withRequestId } from "../js/business-request.js?v=1.3.186";
import { request } from "../js/api.js?v=1.3.186";
export const readDeviceOverview = () => request("package01", "devices.read");

// Future bridge contract follows Package 01 saveManualEntry arguments.
// Production transport/auth stays disabled until its separate backend is approved.
export const readScreenManualEntries = () => request("package01", "screenManual.read");
export const saveScreenManualEntry = payload => request("package01", "screenManual.create", withRequestId(payload));
