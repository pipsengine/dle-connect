import type { SessionPayload } from '@/lib/auth/session';
import { createEnterpriseNotification } from '@/lib/enterprise-notifications-store';
import { listOpportunities, listReminderKeys, markReminder } from '@/lib/commercial/tender-store';
import {
  congratulationBody,
  dueReminderSlots,
  externalDeadlineOf,
  hoursUntil,
  internalDeadlineOf,
  isEnquiryRecord,
  preparationOf,
  reminderKey,
} from '@/lib/commercial/tender-workflow';

const notify = async (session: SessionPayload, title: string, body: string, href: string, employeeCode = '', severity: 'info' | 'warning' | 'critical' | 'success' = 'info') => {
  await createEnterpriseNotification(session, {
    title,
    body,
    module: 'Commercial',
    kind: 'Workflow',
    severity,
    href,
    actor: session.fullName || session.username,
    recipientEmployeeCode: employeeCode || session.employeeCode,
    channels: ['In-App', 'Email'],
  });
};

export const runTenderDeadlineReminders = async (session: SessionPayload) => {
  const rows = await listOpportunities();
  const sent: string[] = [];
  const failed: string[] = [];
  for (const row of rows) {
    if (preparationOf(row) === 'Submitted') continue;
    const clocks = [
      ['internal', internalDeadlineOf(row)],
      ['external', externalDeadlineOf(row)],
    ] as const;
    const existing = new Set(await listReminderKeys(row.id));
    const overdue = clocks
      .filter(([, deadline]) => deadline && (hoursUntil(deadline) ?? 1) < 0)
      .map(([clock, deadline]) => ({ clock, hours: 0, deadline }));
    const due = [
      ...clocks.flatMap(([clock, deadline]) => dueReminderSlots(deadline).map((hours) => ({ clock, hours, deadline }))),
      ...overdue,
    ].filter((slot) => !existing.has(slot.hours === 0 ? `${row.id}|${slot.clock}|overdue` : reminderKey(row.id, slot.clock, slot.hours)));
    if (!due.length) continue;
    const summary = due.map((slot) => slot.hours === 0 ? `${slot.clock} deadline missed (${slot.deadline})` : `${slot.hours}h before the ${slot.clock} deadline (${slot.deadline})`).join('; ');
    const authority = isEnquiryRecord(row) ? 'GM Commercial' : 'Managing Director';
    if (!row.ownerEmployeeCode) {
      for (const slot of due) {
        const key = slot.hours === 0 ? `${row.id}|${slot.clock}|overdue` : reminderKey(row.id, slot.clock, slot.hours);
        await markReminder(key, row.id, `${slot.clock}-${slot.hours || 'overdue'}`, 'FAILED', 'No responsible officer employee code.');
        failed.push(key);
      }
      continue;
    }
    try {
      await notify(
        session,
        due.some((slot) => slot.hours === 0) ? `Deadline escalation · ${row.referenceNo}` : `Deadline reminder · ${row.referenceNo}`,
        `${row.title} for ${row.clientName}. ${summary}. Responsible officer: ${row.ownerName}. Escalate to ${authority}.`,
        `/commercial/tenders/workspace?id=${row.id}`,
        row.ownerEmployeeCode,
        due.some((slot) => slot.hours === 0) ? 'critical' : due.some((slot) => slot.hours === 24) ? 'warning' : 'info',
      );
      for (const slot of due) {
        const key = slot.hours === 0 ? `${row.id}|${slot.clock}|overdue` : reminderKey(row.id, slot.clock, slot.hours);
        await markReminder(key, row.id, `${slot.clock}-${slot.hours || 'overdue'}`, 'SENT', summary);
        sent.push(key);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Reminder failed.';
      for (const slot of due) {
        const key = slot.hours === 0 ? `${row.id}|${slot.clock}|overdue` : reminderKey(row.id, slot.clock, slot.hours);
        await markReminder(key, row.id, `${slot.clock}-${slot.hours || 'overdue'}`, 'FAILED', message);
        failed.push(key);
      }
    }
  }
  return { sent, failed };
};

export const announceVerifiedAward = async (
  session: SessionPayload,
  input: { opportunityId: string; referenceNo: string; title: string; clientName: string; recipients: string[] },
) => {
  const key = `award|${input.opportunityId}|announcement`;
  const existing = await listReminderKeys(input.opportunityId);
  if (existing.includes(key)) return { sent: false, recipients: 0 };
  const recipients = Array.from(new Set(input.recipients.map((code) => code.trim()).filter(Boolean)));
  const body = congratulationBody(input.title, input.clientName);
  let delivered = 0;
  const errors: string[] = [];
  for (const code of recipients) {
    try {
      await notify(session, `Contract secured · ${input.referenceNo}`, body, `/commercial/tenders/awards?id=${input.opportunityId}`, code, 'success');
      delivered += 1;
    } catch (error) {
      errors.push(`${code}: ${error instanceof Error ? error.message : 'failed'}`);
    }
  }
  if (!delivered) {
    await markReminder(key, input.opportunityId, 'award', 'FAILED', errors.join('; ') || 'No recipients.');
    throw new Error(errors[0] || 'The congratulatory notification was not delivered.');
  }
  await markReminder(key, input.opportunityId, 'award', 'SENT', `Delivered ${delivered}. ${errors.join('; ')}`);
  return { sent: true, recipients: delivered, errors };
};
