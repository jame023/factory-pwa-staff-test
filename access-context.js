import { getAuthContext as sessionContext, verifySession, revokeSession } from './session-manager.js?v=1.3.205';
import { canonicalGroup, routeDecision, defaultRoute, workspaceGroups, groupRoute } from './route-policy.js?v=1.3.228';
const KEY='factory-pwa-last-workspace-v2';
let volatileEmployee=null, volatileWorkspace=null;
const preferenceKey=employee=>KEY+':'+encodeURIComponent(employee);
function savedWorkspace(employee) {
  try {return localStorage.getItem(preferenceKey(employee));}
  catch {return volatileEmployee===employee?volatileWorkspace:null;}
}
function saveWorkspace(employee,workspace) {
  volatileEmployee=employee;volatileWorkspace=workspace;
  try {if(workspace)localStorage.setItem(preferenceKey(employee),workspace);else localStorage.removeItem(preferenceKey(employee));}catch{}
}
export function availableWorkspaces(context) {
  if(!context?.authenticated)return [];
  return [...(context.role==='admin'?['ออฟฟิศ','สกรีน','ผลิต','ขนส่ง']:workspaceGroups(context)).map(group=>({id:group,label:group,path:groupRoute(group)})),
    ...(['admin','executive'].includes(context.role)?[{id:'ผู้บริหาร',label:'ผู้บริหาร',path:'/executive'}]:[]),
    ...(context.role==='admin'?[{id:'Admin',label:'Admin',path:'/admin/manage'}]:[])];
}
export function getAuthContext() {
  const current=sessionContext();
  if(!current)return Object.freeze({authenticated:false});
  const groups=Object.freeze([...new Set(current.groups.map(canonicalGroup))]);
  const base={authenticated:true,role:current.user.role,groups};
  const areas=availableWorkspaces(base);
  const saved=savedWorkspace(current.employee_id);
  const area=areas.find(item=>item.id===saved);
  if(saved&&!area)saveWorkspace(current.employee_id,null);
  const selected=area&&['ออฟฟิศ','สกรีน','ผลิต','ขนส่ง'].includes(area.id)?area.id:(workspaceGroups(base).length===1?workspaceGroups(base)[0]:null);
  const selected_workspace=area?.id||(areas.length===1?areas[0].id:null);
  // Deterministic current-state fingerprint, never a cache authorization or JWT version.
  const permissions_version=JSON.stringify([current.employee_id,current.user.role,current.main_group,groups]);
  return Object.freeze({authenticated:true,employee_id:current.employee_id,employee_name:current.employee_name,
    role:current.user.role,main_group:canonicalGroup(current.main_group),groups,active:current.active,
    selected_group:selected,selected_workspace,session_expires_at:current.session_expiry,permissions_version});
}
export const getCurrentEmployee=()=>sessionContext()?.user||null;
export const getCurrentRole=()=>getAuthContext().role||null;
export const getCurrentGroups=()=>[...(getAuthContext().groups||[])];
export const canAccessRoute=route=>routeDecision(getAuthContext(),route).allowed;
export const resolveDefaultRoute=()=>{
  const context=getAuthContext();
  return availableWorkspaces(context).find(area=>area.id===context.selected_workspace)?.path||defaultRoute(context);
};
export async function refreshPermissions(){await verifySession();return getAuthContext();}
export async function requireAccess(route,{signal}={}){
  let context=await refreshPermissions();const decision=routeDecision(context,route);
  if(signal?.aborted)return {...decision,allowed:false,context};
  if(decision.allowed){
    const area=availableWorkspaces(context).find(item=>decision.path===item.path||decision.path.startsWith(item.path+'/')||(item.id==='Admin'&&decision.path.startsWith('/admin')));
    if(area){saveWorkspace(context.employee_id,area.id);context=getAuthContext();}
  }
  return {...decision,context};
}
let selecting=false;
export async function selectActiveGroup(group){
  if(selecting)throw new Error('กำลังเปลี่ยนพื้นที่ กรุณารอสักครู่');
  selecting=true;
  try {
    const context=await refreshPermissions();
    const area=availableWorkspaces(context).find(item=>item.id===canonicalGroup(group));
    if(!area)throw new Error('ไม่พบพื้นที่ หรือสิทธิ์ถูกเปลี่ยน กรุณาเลือกใหม่');
    saveWorkspace(context.employee_id,area.id);
    return {...getAuthContext(),workspace_path:area.path};
  } finally {selecting=false;}
}
export function clearSelectedGroup(){const context=sessionContext();if(context)saveWorkspace(context.employee_id,null);}
export function handleUnauthorized(){location.hash='#/unauthorized';}
export async function handleSessionExpired(){await revokeSession('session_expired');location.hash='#/login';}

