// Audience contract only; authorization and event creation must run on the server.
const workGroups=new Set(['สกรีน','ผลิต','ขนส่ง','ออฟฟิศ']);
const groupName=value=>value==='ออฟฟิต'?'ออฟฟิศ':value;
const roles=new Set(['employee','executive','admin']);
export function calendarNotificationRecipients({group,employees,memberships}) {
  const workGroup=groupName(group);
  if (!workGroups.has(workGroup) || !Array.isArray(employees) || !Array.isArray(memberships)) throw new Error('CALENDAR_NOTIFICATION_INVALID');
  const active=new Map(employees.filter(p=>p?.active===true && roles.has(p.role) && typeof p.id==='string' && p.id).map(p=>[p.id,p]));
  const area=new Set(),summary=new Set();
  for(const member of memberships) {
    if(member?.active===true && groupName(member.group_name)===workGroup && active.has(member.employee_id)) area.add(member.employee_id);
  }
  for(const person of active.values()) if(person.role==='executive'||person.role==='admin') summary.add(person.id);
  return {areaRecipientIds:[...area],summaryRecipientIds:[...summary]};
}
