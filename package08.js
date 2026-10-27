import { request } from "../js/api.js?v=1.3.186";
export const readCalendar = (month, group) => request("package08", "calendar.read", { month, ...(group === undefined ? {} : { group }) });
export const saveCalendarDay = values => request("package08", "calendar.save", values);

export const saveCalendarDays = entries => request("package08", "calendar.batch.save", { entries });

export const readCalendarNotifications = () => request("package08", "calendar.notifications.read");
