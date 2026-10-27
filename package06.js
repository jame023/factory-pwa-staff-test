import { request } from "../js/api.js?v=1.3.186";
export const readReport = period => request("package06", "reports.read", { period });

export const readReportInbox = (kind="all") => request("package06","reports.inbox.read",{kind});
export const previewReport = kind => request("package06","reports.preview.create",{kind});
export const readReportNotifications = () => request("package06","reports.notifications.read");
