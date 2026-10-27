// UI and mock permissions only. Real authorization must be enforced by the backend.
export const normalizeRole = role => role === "manager" ? "executive" : role;
// Accept old mock group values at the boundary; display/store the canonical name.
export const normalizeGroup = group => group === "ส่งของ" ? "ขนส่ง" : group === "ออฟฟิศ" ? "ออฟฟิต" : group;
export const canEnterData = role => ["employee", "admin"].includes(normalizeRole(role));
export const canManage = role => ["executive", "admin"].includes(normalizeRole(role));
export const canEditAll = role => normalizeRole(role) === "admin";
export const isProductionEmployee = user => user?.role === "employee" && Array.isArray(user.groups) && user.groups.includes("ผลิต");
export const isScreenEmployee = user => user?.role === "employee" && Array.isArray(user.groups) && user.groups.includes("สกรีน");
export const PRODUCTION_WORK_MACHINES = Object.freeze(["A1", "A2", "C1"]);
export const SCREEN_WORK_MACHINES = Object.freeze(["B1", "B2", "B3"]);

export function canAccessModule(user, module) {
  if (module === 'devices') return false;
  if (!user || !["employee", "executive", "admin"].includes(user.role)) return false;
  // These routes perform their own live Supabase Admin session check. Keep the
  // route reachable so a mock/local session cannot silently render mock data.
  if (["admin-employees", "admin-groups"].includes(module)) return true;
  if (user.role !== "employee") return true;
  const groups = Array.isArray(user.groups) ? user.groups.map(normalizeGroup) : [];
  if (groups.includes("ออฟฟิต")) return ["home", "attendance", "leave", "calendar"].includes(module);
  if (module === "work-session") return !groups.includes("ขนส่ง") && groups.some(group => ["ผลิต", "สกรีน"].includes(group));
  if (module === "delivery") return groups.includes("ขนส่ง");
  if (module === "production") return Array.isArray(user.groups) && user.groups.includes("สกรีน");
  if (module === "production-record") return isProductionEmployee(user);
  return true;
}

export function calendarGroupsForUser(user, availableGroups) {
  if (!user || !["employee", "executive", "admin"].includes(user.role)) return [];
  const available = [...new Set(availableGroups.filter(group => typeof group === "string").map(normalizeGroup))];
  if (canManage(user.role)) return available;
  const permitted = Array.isArray(user.calendarGroups) ? user.calendarGroups.map(normalizeGroup) : [];
  return available.filter(group => permitted.includes(group));
}

const workspaceModules = {
  employee: ["attendance", "work-session", "leave", "calendar", "delivery", "production", "production-record", "ot"],
  executive: ["attendance", "work-session", "leave", "calendar", "delivery", "production", "production-record", "reports", "ot"]
};
export function resolveWorkspaceRoute(path, role) {
  if (!["employee", "executive", "admin"].includes(role)) return { allowed:false };
  const ownWorkspace = role === "admin" ? "employee" : role;
  const parts = path.split("/");
  if (path === "home" || path === "") return { allowed:true, module:"home", workspace:role, canonical:"home" };
  if (path === "admin") return { allowed:role === "admin", module:"admin", workspace:"admin", canonical:path };
  if (path === "admin/registrations") return { allowed:role === "admin", module:"admin-registrations", workspace:"admin", canonical:path };
  if (path === "admin/employees") return { allowed:["employee", "executive", "admin"].includes(role), module:"admin-employees", workspace:"admin", canonical:path };
  if (path === "admin/groups") return { allowed:["employee", "executive", "admin"].includes(role), module:"admin-groups", workspace:"admin", canonical:path };
  if (path === "admin/machines") return { allowed:["employee", "executive", "admin"].includes(role), module:"admin-machines", workspace:"admin", canonical:path };
  if (path === "admin/item-names") return { allowed:["employee", "executive", "admin"].includes(role), module:"admin-item-names", workspace:"admin", canonical:path };
  const scoped = Object.hasOwn(workspaceModules, parts[0]);
  const workspace = scoped ? parts[0] : ownWorkspace;
  const module = scoped ? parts[1] || "home" : parts[0];
  if (parts.length > (scoped ? 2 : 1) || (role !== "admin" && workspace !== role) ||
      (module !== "home" && !workspaceModules[workspace].includes(module))) return { allowed:false };
  return { allowed:true, workspace, module, canonical:workspace + (module === "home" ? "" : "/" + module) };
}

export function assertMockPermission(role, key) {
  if (key === 'package01.devices.read') throw new Error('ปิดหมวดอุปกรณ์แล้ว');
  const normalized = normalizeRole(role);
  if (!["employee", "executive", "admin"].includes(normalized)) throw new Error("ไม่พบบทบาทที่ใช้งานได้");
  const entryActions = ["package04.delivery.create", "package05.production.create", "package07.work.start",
    "package07.work.end", "package09.leave.submit", "package07.ot.submit"];
  if (entryActions.includes(key) && !canEnterData(normalized)) throw new Error("หน้านี้สำหรับดูข้อมูลเท่านั้น");
  if (["package08.calendar.save", "package08.calendar.batch.save", "package09.leave.review", "package06.reports.read",
    "package03.attendance.read", "package03.attendance.dashboard", "package01.devices.read"].includes(key) && !canManage(normalized)) {
    throw new Error("เฉพาะผู้บริหารหรือ Admin เท่านั้น");
  }
  if(key.startsWith("package06.reports.") && key!=="package06.reports.notifications.read" && !canManage(normalized))throw new Error("เฉพาะผู้บริหารหรือ Admin เท่านั้น");
  if (key.startsWith("package11.") && !canEditAll(normalized)) throw new Error("เฉพาะ Admin เท่านั้น");
}
