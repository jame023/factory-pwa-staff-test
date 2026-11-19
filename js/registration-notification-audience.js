// Contract helper only. The backend independently checks current account status.
export function registrationNotificationRecipients(employees) {
  if (!Array.isArray(employees)) throw new Error('REGISTRATION_NOTIFICATION_INVALID');
  return [...new Set(employees.filter(person=>person?.active===true && ['executive','admin'].includes(person.role) && typeof person.id==='string' && person.id).map(person=>person.id))];
}
