import { request } from "../js/api.js?v=1.3.186";
// Read-only preview adapter. RFID ingestion and the ESP32/Gateway path stay outside the PWA.
export const readAttendanceOverview = () => request("package03", "attendance.read");

export const readAttendanceDashboard = (query = {}, options = {}) => request("package03", "attendance.dashboard", query, options);
