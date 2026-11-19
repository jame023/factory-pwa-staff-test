// Prototype contract. Only trusted backend ingestion may create real events.
export function attendanceNotificationPlan({event,employees}) {
  if (!event || !['check_in','check_out'].includes(event.type) ||
      typeof event.sourceEventId!=='string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(event.sourceEventId) ||
      typeof event.employeeId!=='string' || !event.employeeId ||
      typeof event.occurredAt!=='string' || !/(?:Z|[+-]\d{2}:\d{2})$/.test(event.occurredAt) || !Number.isFinite(Date.parse(event.occurredAt)) ||
      !Array.isArray(employees)) throw new Error('ATTENDANCE_EVENT_INVALID');
  const recipients=[...new Set(employees.filter(p=>p?.active===true && ['employee','executive','admin'].includes(p.role) && typeof p.id==='string' && p.id).map(p=>p.id))];
  return {eventKey:'attendance:'+event.sourceEventId,eventType:event.type,subjectEmployeeId:event.employeeId,occurredAt:event.occurredAt,recipientIds:recipients};
}
