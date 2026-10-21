import type { SessionPayload } from '@/lib/auth/session';
import { createEnterpriseNotification } from '@/lib/enterprise-notifications-store';
import { readDirectoryEmployees } from '@/lib/payroll-employee-source';
import { resolveEmployeeMailbox, sendTransactionalEmail } from '@/lib/mail-service';
import { resolvePublicAppOrigin } from '@/lib/public-app-url';
import { recordOpportunityAudit } from '@/lib/commercial/tender-store';
import { commercialKindOf, isCommercialOutcomeRecipient } from '@/lib/commercial/tender-workflow';
import type { TenderOpportunity } from '@/lib/commercial/tender-types';

const NAMED_COPY_EMAIL = 'tap@dormanlongeng.com';

const mailboxOf = (email: string, officialEmail: string) => officialEmail || email;

export const notifyCommercialOutcome = async (session: SessionPayload, opportunity: TenderOpportunity, actor: string) => {
  const kind = commercialKindOf(opportunity);
  const decision = /no\s*-?\s*bid/i.test(opportunity.bidDecision) ? 'NO BID' : 'BID';
  const href = decision === 'BID'
    ? `/commercial/tenders/bid-preparation?id=${opportunity.id}`
    : `/commercial/tenders/opportunities?id=${opportunity.id}`;
  const origin = resolvePublicAppOrigin();
  const link = `${origin}${href}`;
  const title = decision === 'NO BID'
    ? `No Bid · ${opportunity.referenceNo}`
    : `Approved · ${opportunity.referenceNo}`;
  const body = [
    `${opportunity.title} (${kind}) for ${opportunity.clientName || 'the client'} is ${decision === 'NO BID' ? 'NO BID and stays closed with GM Commercial' : 'approved for response preparation'}.`,
    `Assigned employee: ${opportunity.ownerName || '—'}.`,
    kind === 'EOI' ? 'EOI approval stays with GM Commercial.' : decision === 'BID' ? 'The Managing Director has given final approval.' : 'NO BID did not go to the Managing Director.',
  ].join(' ');
  const directory = await readDirectoryEmployees().catch(() => ({ employees: [] }));
  const people = new Map<string, { code: string; name: string; email: string }>();
  const add = (code: string, name: string, email: string) => {
    const key = (email || code).trim().toLowerCase();
    if (!key) return;
    if (!people.has(key)) people.set(key, { code: code.trim(), name: name.trim(), email: email.trim() });
  };
  add(opportunity.ownerEmployeeCode, opportunity.ownerName, '');
  for (const employee of directory.employees || []) {
    if (!isCommercialOutcomeRecipient(employee)) continue;
    add(employee.employeeCode || employee.employeeId, employee.fullName, mailboxOf(employee.email, employee.officialEmail));
  }
  add('', 'Timi Austen-Peters', NAMED_COPY_EMAIL);
  if (!(directory.employees || []).length) {
    await createEnterpriseNotification(session, {
      title,
      body,
      module: 'Commercial',
      kind: 'Workflow',
      severity: decision === 'NO BID' ? 'warning' : 'success',
      href,
      actor,
      recipientRoles: ['Proposal', 'Sales', 'Managing Director', 'MD', 'GM Operations', 'CFO'],
      channels: ['In-App', 'Email'],
    });
  }
  const errors: string[] = [];
  let notified = 0;
  for (const person of people.values()) {
    try {
      if (person.code) {
        await createEnterpriseNotification(session, {
          title,
          body,
          module: 'Commercial',
          kind: 'Workflow',
          severity: decision === 'NO BID' ? 'warning' : 'success',
          href,
          actor,
          recipientEmployeeCode: person.code,
          channels: ['In-App', 'Email'],
        });
      }
      let email = person.email;
      if (!email && person.code) {
        const match = (directory.employees || []).find((employee) => (employee.employeeCode || employee.employeeId) === person.code);
        email = match ? await resolveEmployeeMailbox(match).catch(() => '') : '';
      }
      if (email) {
        const sent = await sendTransactionalEmail({
          to: email,
          subject: title,
          text: `${body}\n\nOpen in DLE Connect: ${link}`,
        });
        if (!sent.sent) errors.push(`${email}: ${sent.reason || 'not sent'}`);
      }
      notified += 1;
    } catch (error) {
      errors.push(`${person.name || person.email}: ${error instanceof Error ? error.message : 'failed'}`);
    }
  }
  await recordOpportunityAudit(opportunity.id, actor, 'OUTCOME_NOTIFIED', `Notified ${notified}. ${errors.join('; ')}`.slice(0, 500));
  return { notified, errors };
};

export const notifyManagingDirectorFinal = async (session: SessionPayload, opportunity: TenderOpportunity, actor: string) => {
  const href = `/commercial/tenders/approvals?id=${opportunity.id}`;
  const body = `${opportunity.title} (${commercialKindOf(opportunity)}) was approved as BID by GM Commercial and assigned to ${opportunity.ownerName}. It is waiting for MD final approval.`;
  await createEnterpriseNotification(session, {
    title: `MD final approval · ${opportunity.referenceNo}`,
    body,
    module: 'Commercial',
    kind: 'Workflow',
    severity: 'info',
    href,
    actor,
    recipientRoles: ['Managing Director', 'MD'],
    channels: ['In-App', 'Email'],
  });
  const directory = await readDirectoryEmployees().catch(() => ({ employees: [] }));
  const directors = (directory.employees || []).filter((employee) => /managing director|\bmd\b/i.test(`${employee.jobTitle} ${employee.designation}`));
  const origin = resolvePublicAppOrigin();
  for (const director of directors) {
    const email = await resolveEmployeeMailbox(director).catch(() => '');
    if (!email) continue;
    await sendTransactionalEmail({
      to: email,
      subject: `MD final approval · ${opportunity.referenceNo}`,
      text: `${body}\n\nOpen in DLE Connect: ${origin}${href}`,
    }).catch(() => undefined);
  }
};
