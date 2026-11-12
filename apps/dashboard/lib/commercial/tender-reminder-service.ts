import type { SessionPayload } from '@/lib/auth/session';
import { createEnterpriseNotification } from '@/lib/enterprise-notifications-store';
import { resolveEmployeeMailbox, sendTransactionalEmail } from '@/lib/mail-service';
import { readDirectoryEmployees } from '@/lib/payroll-employee-source';
import { resolvePublicAppOrigin } from '@/lib/public-app-url';
import { listOpportunities, listReminderKeys, markReminder } from '@/lib/commercial/tender-store';
import {
  congratulationBody,
  dueReminderSlots,
  externalDeadlineOf,
  hoursUntil,
  internalDeadlineOf,
  isHistoricalRegister,
  preparationOf,
  reminderKey,
} from '@/lib/commercial/tender-workflow';

const notifyOfficer = async (session: SessionPayload, title: string, body: string, href: string, employeeCode = '', severity: 'info' | 'warning' | 'critical' | 'success' = 'info') => {
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
  if (!employeeCode) return;
  const directory = await readDirectoryEmployees().catch(() => ({ employees: [] }));
  const match = (directory.employees || []).find((employee) => (employee.employeeCode || employee.employeeId) === employeeCode);
  if (!match) return;
  const email = await resolveEmployeeMailbox(match).catch(() => '');
  if (!email) return;
  await sendTransactionalEmail({
    to: email,
    subject: title,
    text: `${body}\n\nOpen in DLE Connect: ${resolvePublicAppOrigin()}${href}`,
  }).catch(() => undefined);
};

export const runTenderDeadlineReminders = async (session: SessionPayload) => {
  const rows = await listOpportunities();
  const sent: string[] = [];
  const failed: string[] = [];
  for (const row of rows) {
    if (isHistoricalRegister(row)) continue;
    if (preparationOf(row) === 'Submitted') continue;
    if (row.status === 'Closed' || row.status === 'Lost' || row.status === 'Cancelled' || row.status === 'Withdrawn' || row.status === 'No-Bid') continue;
    if (/no\s*-?\s*bid/i.test(row.bidDecision || '')) continue;
    const clocks = [
      ['internal', internalDeadlineOf(row)],
      ['external', externalDeadlineOf(row)],
    ] as const;
    const existing = new Set(await listReminderKeys(row.id));
    const pastDeadline = (deadline: string) => {
      const text = String(deadline || '').trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return Date.now() >= new Date(`${text}T23:59:59.999+01:00`).getTime();
      const hours = hoursUntil(text);
      return hours != null && hours < 0;
    };
    const overdue = clocks
      .filter(([, deadline]) => deadline && pastDeadline(deadline))
      .map(([clock, deadline]) => ({ clock, key: `${row.id}|${clock}|overdue`, label: `${clock} deadline missed (${deadline})`, overdue: true as const }));
    const due = [
      ...clocks.flatMap(([clock, deadline]) =>
        dueReminderSlots(deadline).map((slot) => ({
          clock,
          key: reminderKey(row.id, clock, slot),
          label: `${slot.period === 'am' ? 'morning' : 'afternoon'} reminder on ${slot.day} for the ${clock} deadline (${deadline})`,
          overdue: false as const,
          slot,
        }))),
      ...overdue,
    ].filter((item) => !existing.has(item.key));
    if (!due.length) continue;
    const summary = due.map((item) => item.label).join('; ');
    if (!row.ownerEmployeeCode) {
      for (const item of due) {
        await markReminder(item.key, row.id, item.overdue ? `${item.clock}-overdue` : `${item.clock}-${item.slot?.period || 'slot'}`, 'FAILED', 'No responsible officer employee code.');
        failed.push(item.key);
      }
      continue;
    }
    try {
      await notifyOfficer(
        session,
        due.some((item) => item.overdue) ? `Deadline escalation · ${row.referenceNo}` : `Deadline reminder · ${row.referenceNo}`,
        `${row.title} for ${row.clientName}. ${summary}. Responsible officer: ${row.ownerName}.`,
        `/commercial/tenders/workspace?id=${row.id}`,
        row.ownerEmployeeCode,
        due.some((item) => item.overdue) ? 'critical' : 'warning',
      );
      for (const item of due) {
        await markReminder(item.key, row.id, item.overdue ? `${item.clock}-overdue` : `${item.clock}-${item.slot?.period || 'slot'}`, 'SENT', summary);
        sent.push(item.key);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Reminder failed.';
      for (const item of due) {
        await markReminder(item.key, row.id, item.overdue ? `${item.clock}-overdue` : `${item.clock}-${item.slot?.period || 'slot'}`, 'FAILED', message);
        failed.push(item.key);
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
      await notifyOfficer(session, `Contract secured · ${input.referenceNo}`, body, `/commercial/tenders/awards?id=${input.opportunityId}`, code, 'success');
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
