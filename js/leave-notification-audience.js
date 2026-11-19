// Contract helper only. The backend must independently enforce the same rules.
const roles = new Set(['employee','executive','admin']);
export function leaveNotificationRecipients({event,employees,memberships,submittedBy}) {
  if (!['submitted','approved','rejected'].includes(event) || !Array.isArray(employees)) throw new Error('LEAVE_NOTIFICATION_INVALID');
  if (event==='submitted' && !Array.isArray(memberships)) throw new Error('LEAVE_MEMBERSHIPS_REQUIRED');
  if (event==='rejected' && (typeof submittedBy!=='string' || !submittedBy)) throw new Error('LEAVE_SUBMITTER_REQUIRED');
  const executiveIds=new Set((memberships||[]).filter(g=>g?.active===true && g.group_name==='ผู้บริหาร').map(g=>g.employee_id));
  const ids=new Set();
  for (const person of employees) {
    if (person?.active!==true || !roles.has(person.role) || typeof person.id!=='string' || !person.id) continue;
    if (event==='submitted' && !executiveIds.has(person.id)) continue;
    if (event==='rejected' && person.id!==submittedBy) continue;
    ids.add(person.id);
  }
  return [...ids];
}
