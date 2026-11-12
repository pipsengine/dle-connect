import type { SessionPayload } from '@/lib/auth/session';
import { createEnterpriseNotification } from '@/lib/enterprise-notifications-store';
import { readDirectoryEmployees } from '@/lib/payroll-employee-source';
import { resolveEmployeeMailbox, sendTransactionalEmail } from '@/lib/mail-service';
import { buildDleEmail, formatEmailDate, resolveEmailLogoUrl } from '@/lib/email-templates';
import { resolvePublicAppOrigin } from '@/lib/public-app-url';
import { recordOpportunityAudit } from '@/lib/commercial/tender-store';
import {
  commercialKindOf,
  externalDeadlineOf,
  isCommercialOutcomeRecipient,
  isCommercialTeamRecipient,
  type CommercialCopyPerson,
} from '@/lib/commercial/tender-workflow';
import type { TenderOpportunity } from '@/lib/commercial/tender-types';

const NAMED_COPY_EMAIL = 'tap@dormanlongeng.com';
const COMMERCIAL_TEAM_ROLES = [
  'Proposal',
  'Sales',
  'GM Commercial',
  'General Manager Commercial',
  'Managing Director',
  'MD',
  'Executive Director',
  'Executive Management',
];

const mailboxOf = (email: string, officialEmail: string) => officialEmail || email;

type NotifyPerson = { code: string; name: string; email: string };

const firstName = (fullName: string) => {
  const cleaned = String(fullName || '').replace(/^(mr|mrs|miss|ms|dr)\.?\s+/i, '').trim();
  return cleaned.split(/\s+/)[0] || 'Colleague';
};

const opportunityDetails = (opportunity: TenderOpportunity) => [
  { label: 'Reference', value: opportunity.referenceNo || '—' },
  { label: 'Opportunity', value: opportunity.title || '—' },
  { label: 'Client', value: opportunity.clientName || '—' },
  { label: 'Type', value: commercialKindOf(opportunity) },
  { label: 'Priority', value: opportunity.priority || 'Medium' },
  { label: 'External deadline', value: formatEmailDate(externalDeadlineOf(opportunity)) },
  ...(opportunity.ownerName ? [{ label: 'Assigned employee', value: opportunity.ownerName }] : []),
];

const deliverCommercialNotice = async (input: {
  session: SessionPayload;
  opportunity: TenderOpportunity;
  actor: string;
  title: string;
  headline: string;
  intro: string;
  body: string;
  href: string;
  severity: 'info' | 'warning' | 'critical' | 'success';
  statusBadge?: string;
  auditAction: string;
  match: (person: CommercialCopyPerson) => boolean;
  extraPeople?: NotifyPerson[];
  fallbackRoles: string[];
  includeChairman?: boolean;
  actionLabel?: string;
}) => {
  const origin = resolvePublicAppOrigin();
  const link = `${origin}${input.href}`;
  const directory = await readDirectoryEmployees().catch(() => ({ employees: [] }));
  const people = new Map<string, NotifyPerson>();
  const add = (code: string, name: string, email: string) => {
    const key = (email || code).trim().toLowerCase();
    if (!key) return;
    if (!people.has(key)) people.set(key, { code: code.trim(), name: name.trim(), email: email.trim() });
  };
  for (const person of input.extraPeople || []) add(person.code, person.name, person.email);
  for (const employee of directory.employees || []) {
    if (!input.match(employee)) continue;
    add(employee.employeeCode || employee.employeeId, employee.fullName, mailboxOf(employee.email, employee.officialEmail));
  }
  if (input.includeChairman) add('', 'Timi Austen-Peters', NAMED_COPY_EMAIL);
  if (!(directory.employees || []).length) {
    await createEnterpriseNotification(input.session, {
      title: input.title,
      body: input.body,
      module: 'Commercial',
      kind: 'Workflow',
      severity: input.severity,
      href: input.href,
      actor: input.actor,
      recipientRoles: input.fallbackRoles,
      channels: ['In-App', 'Email'],
    });
  }
  const tone = input.severity === 'success' ? 'success' : input.severity === 'warning' || input.severity === 'critical' ? 'warning' : 'info';
  const errors: string[] = [];
  let notified = 0;
  for (const person of people.values()) {
    try {
      if (person.code) {
        await createEnterpriseNotification(input.session, {
          title: input.title,
          body: input.body,
          module: 'Commercial',
          kind: 'Workflow',
          severity: input.severity,
          href: input.href,
          actor: input.actor,
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
        const branded = buildDleEmail({
          recipientName: firstName(person.name) || 'Colleague',
          subject: input.title,
          module: 'Commercial',
          headline: input.headline,
          intro: input.intro,
          tone,
          logoUrl: resolveEmailLogoUrl(origin),
          statusBadge: input.statusBadge,
          details: opportunityDetails(input.opportunity),
          note: input.body,
          actions: [{ href: link, label: input.actionLabel || 'Open in DLE Connect', tone: 'primary' }],
          footerNote: 'This is an automated message from DLE Connect Commercial.',
          preheader: input.body,
        });
        const sent = await sendTransactionalEmail({
          to: email,
          subject: branded.subject,
          text: branded.text,
          html: branded.html,
        });
        if (!sent.sent) errors.push(`${email}: ${sent.reason || 'not sent'}`);
      }
      notified += 1;
    } catch (error) {
      errors.push(`${person.name || person.email}: ${error instanceof Error ? error.message : 'failed'}`);
    }
  }
  await recordOpportunityAudit(input.opportunity.id, input.actor, input.auditAction, `Notified ${notified}. ${errors.join('; ')}`.slice(0, 500));
  return { notified, errors };
};

const isProposalReviewerPerson = (person: CommercialCopyPerson) =>
  String(person.employeeCode || person.employeeId || '').trim().toUpperCase() === 'P0051'
  || (/nkechi/i.test(String(person.fullName || '')) && /kalu/i.test(String(person.fullName || '')));

/** Stage 1: a submitted opportunity goes to Proposal review (Nkechi). */
export const notifyCommercialCreated = async (session: SessionPayload, opportunity: TenderOpportunity, actor: string) =>
  deliverCommercialNotice({
    session,
    opportunity,
    actor,
    title: `Proposal review · ${opportunity.referenceNo}`,
    headline: 'Proposal review required',
    intro: 'A new commercial opportunity was submitted and is waiting for Proposal to set the priority, review and approve.',
    body: `${opportunity.title} (${commercialKindOf(opportunity)}) for ${opportunity.clientName || 'the client'} was submitted and is waiting for Proposal to set the priority, review and approve.`,
    href: `/commercial/tenders/approvals?id=${opportunity.id}`,
    severity: 'info',
    statusBadge: 'Awaiting Proposal Review',
    auditAction: 'CREATED_NOTIFIED',
    match: isProposalReviewerPerson,
    fallbackRoles: ['Proposal'],
    actionLabel: 'Review Opportunity',
  });

/** After Proposal approval: notify the commercial team (GM Commercial, Proposal, Sales, MD). */
export const notifyGmCommercialAfterProposal = async (session: SessionPayload, opportunity: TenderOpportunity, actor: string) =>
  deliverCommercialNotice({
    session,
    opportunity,
    actor,
    title: `GM Commercial review · ${opportunity.referenceNo}`,
    headline: 'Ready for GM Commercial review',
    intro: 'Proposal has set the priority and sent this opportunity to GM Commercial.',
    body: `${opportunity.title} (${commercialKindOf(opportunity)}) was reviewed by Proposal (priority ${opportunity.priority || 'Medium'}) and sent to GM Commercial.`,
    href: `/commercial/tenders/approvals?id=${opportunity.id}`,
    severity: 'info',
    statusBadge: 'Awaiting GM Commercial',
    auditAction: 'PROPOSAL_FORWARDED_NOTIFIED',
    match: isCommercialTeamRecipient,
    fallbackRoles: ['GM Commercial', 'General Manager Commercial', ...COMMERCIAL_TEAM_ROLES],
    actionLabel: 'Open Approvals',
  });

/** Stage 2: GM assignment notifies the assignee and the commercial team. */
export const notifyCommercialAssigned = async (session: SessionPayload, opportunity: TenderOpportunity, actor: string) =>
  deliverCommercialNotice({
    session,
    opportunity,
    actor,
    title: `Assigned · ${opportunity.referenceNo}`,
    headline: 'Opportunity assigned',
    intro: `${opportunity.title} was assigned by GM Commercial and is ready for the responsible officer.`,
    body: `${opportunity.title} (${commercialKindOf(opportunity)}) was assigned to ${opportunity.ownerName || 'the responsible officer'} by GM Commercial.`,
    href: `/commercial/tenders/workspace?id=${opportunity.id}`,
    severity: 'info',
    statusBadge: 'Assigned',
    auditAction: 'ASSIGNED_NOTIFIED',
    match: isCommercialTeamRecipient,
    extraPeople: (opportunity.assignedOfficers?.length
      ? opportunity.assignedOfficers
      : opportunity.ownerEmployeeCode || opportunity.ownerName
        ? [{ employeeCode: opportunity.ownerEmployeeCode || '', fullName: opportunity.ownerName || '' }]
        : []
    ).map((person) => ({ code: person.employeeCode || '', name: person.fullName || '', email: '' })),
    fallbackRoles: COMMERCIAL_TEAM_ROLES,
    actionLabel: 'Open Workspace',
  });

/** Stage 3 / terminal outcomes: full commercial copy list including the Chairman. */
export const notifyCommercialOutcome = async (session: SessionPayload, opportunity: TenderOpportunity, actor: string) => {
  const kind = commercialKindOf(opportunity);
  const decision = /no\s*-?\s*bid/i.test(opportunity.bidDecision) ? 'NO BID' : 'BID';
  const href = decision === 'BID'
    ? `/commercial/tenders/bid-preparation?id=${opportunity.id}`
    : `/commercial/tenders/opportunities?id=${opportunity.id}`;
  return deliverCommercialNotice({
    session,
    opportunity,
    actor,
    title: decision === 'NO BID' ? `No Bid · ${opportunity.referenceNo}` : `Approved · ${opportunity.referenceNo}`,
    headline: decision === 'NO BID' ? 'NO BID recorded' : 'Opportunity approved',
    intro: decision === 'NO BID'
      ? 'GM Commercial recorded NO BID. This opportunity is closed to bid preparation.'
      : 'Final approval is complete. Response preparation can continue.',
    body: [
      `${opportunity.title} (${kind}) for ${opportunity.clientName || 'the client'} is ${decision === 'NO BID' ? 'NO BID and stays closed with GM Commercial' : 'approved for response preparation'}.`,
      `Assigned employee${(opportunity.assignedOfficers?.length || 0) > 1 ? 's' : ''}: ${opportunity.ownerName || '—'}.`,
      kind === 'EOI' ? 'EOI approval stays with GM Commercial.' : decision === 'BID' ? 'The Managing Director has given final approval.' : 'NO BID did not go to the Managing Director.',
    ].join(' '),
    href,
    severity: decision === 'NO BID' ? 'warning' : 'success',
    statusBadge: decision,
    auditAction: 'OUTCOME_NOTIFIED',
    match: isCommercialOutcomeRecipient,
    extraPeople: (opportunity.assignedOfficers?.length
      ? opportunity.assignedOfficers
      : opportunity.ownerEmployeeCode || opportunity.ownerName
        ? [{ employeeCode: opportunity.ownerEmployeeCode || '', fullName: opportunity.ownerName || '' }]
        : []
    ).map((person) => ({ code: person.employeeCode || '', name: person.fullName || '', email: '' })),
    fallbackRoles: ['Proposal', 'Sales', 'Managing Director', 'MD', 'Executive Director', 'Executive Management', 'GM Operations', 'CFO', 'GM Commercial'],
    includeChairman: true,
    actionLabel: decision === 'BID' ? 'Open Bid Preparation' : 'Open Opportunity',
  });
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
    recipientRoles: ['Managing Director', 'MD', 'Executive Director', 'Executive Management'],
    channels: ['In-App', 'Email'],
  });
  const directory = await readDirectoryEmployees().catch(() => ({ employees: [] }));
  const directors = (directory.employees || []).filter((employee) => {
    const title = `${employee.jobTitle || ''} ${employee.designation || ''}`.toLowerCase();
    const code = String(employee.employeeCode || employee.employeeId || '').trim().toUpperCase();
    if (code === 'P0413') return true;
    if (/pa\.?\s*to\s*md|personal\s*assistant/i.test(title)) return false;
    return /managing director|chief executive|^md(\/ceo)?$|\bmd\/ceo\b/i.test(title);
  });
  const origin = resolvePublicAppOrigin();
  const link = `${origin}${href}`;
  for (const director of directors) {
    const email = await resolveEmployeeMailbox(director).catch(() => '');
    if (!email) continue;
    const branded = buildDleEmail({
      recipientName: firstName(director.fullName) || 'Managing Director',
      subject: `MD final approval · ${opportunity.referenceNo}`,
      module: 'Commercial',
      headline: 'MD final approval required',
      intro: 'GM Commercial approved a BID. This opportunity is waiting for Managing Director final approval.',
      tone: 'warning',
      logoUrl: resolveEmailLogoUrl(origin),
      statusBadge: 'Awaiting MD Decision',
      details: opportunityDetails(opportunity),
      note: body,
      actions: [{ href: link, label: 'Give Final Approval', tone: 'primary' }],
      footerNote: 'This is an automated message from DLE Connect Commercial.',
    });
    await sendTransactionalEmail({
      to: email,
      subject: branded.subject,
      text: branded.text,
      html: branded.html,
    }).catch(() => undefined);
  }
};
