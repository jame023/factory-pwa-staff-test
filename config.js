export const APP_NAME = "ระบบโรงงาน SIP";
export const APP_VERSION = "1.3.241";
export const APP_MODE = "supabase-line"; // mock | development | supabase-line | production

export const MOCK_SESSION_ROLE = "employee"; // fixed by the local preview process; never selected from browser storage or URL
export const MOCK_SESSION_GROUP = "สกรีน"; // local preview selection only; never real Sheet permissions
export const API_BASE_URL = ""; // same-origin API only; production remains unavailable until a separately approved backend exists
export const LINE_LIFF_ID = ""; // configure outside source only after the PWA LIFF app is approved and registered
export const SUPABASE_URL = "https://hpagibjbxdtmkuouitae.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_za00Jq-yghO3M_E1X9HKfg_Q8GrKp5_";
export const SUPABASE_LINE_PROVIDER = "custom:factory-pwa-line";
export const READ_ONLY_ROUTES = Object.freeze(["home", "attendance"]);
export const MOCK_STORAGE_KEY = "factory-pwa-mock-v1";
export const ROLE_LABELS = Object.freeze({
  employee: "พนักงาน",
  executive: "ผู้บริหาร",
  admin: "Admin"
});
export const MOCK_USERS = Object.freeze([
  { id: "mock-employee", name: "พนักงานตัวอย่าง", role: "employee" },
  { id: "mock-executive", name: "ผู้บริหารตัวอย่าง", role: "executive" },
  { id: "mock-admin", name: "ผู้ดูแลตัวอย่าง", role: "admin" }
]);












