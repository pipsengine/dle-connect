import type { SessionPayload } from '@/lib/auth/session';
import { createEnterpriseNotification } from '@/lib/enterprise-notifications-store';
import { formatDate, frontDeskDeadlineAlert, type FrontDeskDeadlineAlert } from '@/lib/corporate-office/front-desk-format';
import { lookupDepartmentHead } from '@/lib/corporate-office/front-desk-overview';
import {
  claimFrontDeskNotice,
  listDepartmentDeadlineTargets,
  releaseFrontDeskNotice,
  type DepartmentDeadlineTarget,
} from '@/lib/corporate-office/front-desk-store';
import type { Correspondence, DepartmentRoute } from '@/lib/corporate-office/front-desk-types';
import { readEmployeeFromDbByCode } from '@/lib/dle-enterprise-db';
import { buildDleEmail, formatEmailDate, resolveEmailLogoUrl } from '@/lib/email-templates';
import { resolveEmployeeMailbox, sendTransactionalEmail } from '@/lib/mail-service';
import { resolveWorkflowLinkOrigin } from '@/lib/public-app-url';

const systemSession = (): SessionPayload => ({
  sub: 'front-desk-service',
  username: 'front-desk-service',
  fullName: 'Corporate Office',
  roles: ['System'],
  permissions: [],
  status: 'Active',
  firstLoginRequired: false,
  passwordResetRequired: false,
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 3600,
});

const notifyOnce = async (
  session: SessionPayload,
  noticeKey: string,
  correspondenceId: string,
  employeeCode: string,
  title: string,
  body: string,
  severity: 'info' | 'warning' | 'critical' | 'success',
) => {
  if (!employeeCode) return;
  const claimed = await claimFrontDeskNotice(noticeKey, correspondenceId);
  if (!claimed) return;
  await createEnterpriseNotification(session, {
    recipientEmployeeCode: employeeCode,
    kind: 'Workflow',
    module: 'Corporate Office',
    title,
    body,
    severity,
    href: `/corporate-office?item=${encodeURIComponent(correspondenceId)}`,
    metadata: { dedupeKey: noticeKey, correspondenceId },
  });
};

export const notifyCorrespondenceAssigned = async (
  session: SessionPayload,
  item: { id: string; referenceNo: string; subject: string; assignedEmployeeCode?: string },
) => {
  if (!item.assignedEmployeeCode) return;
  await notifyOnce(
    session,
    `front-desk:${item.id}:assigned:${item.assignedEmployeeCode}`,
    item.id,
    item.assignedEmployeeCode,
    'Correspondence assigned to you',
    `${item.referenceNo} — ${item.subject}`,
    'info',
  );
};

type SubmissionRecipient = { code: string; name: string; role: string };

const addSubmissionRecipient = (recipients: SubmissionRecipient[], code: string | undefined, name: string | undefined, role: string) => {
  const employeeCode = String(code || '').trim();
  if (!employeeCode || !role) return;
  const existing = recipients.find((recipient) => recipient.code.toUpperCase() === employeeCode.toUpperCase());
  if (existing) {
    if (!existing.role.toLowerCase().includes(role.toLowerCase())) existing.role = `${existing.role}; ${role}`;
    if (!existing.name && name) existing.name = name;
    return;
  }
  recipients.push({ code: employeeCode, name: String(name || '').trim(), role });
};

const submissionRecipients = async (item: Correspondence) => {
  const recipients: SubmissionRecipient[] = [];
  addSubmissionRecipient(recipients, item.addressedEmployeeCode, item.addressedTo, 'Addressed to you');
  addSubmissionRecipient(recipients, item.assignedEmployeeCode, item.assignedEmployeeName, 'Assigned to you');
  for (const recipient of item.recipients || []) {
    addSubmissionRecipient(recipients, recipient.employeeCode, recipient.name, 'Copied recipient');
  }
  const heads = new Map<string, { code: string; name: string } | null>();
  for (const route of item.routes || []) {
    if (route.status === 'Completed' || route.status === 'Waived') continue;
    addSubmissionRecipient(recipients, route.assigneeCode, route.assigneeName, `${route.department} officer`);
    let hodCode = route.hodCode;
    let hodName = route.hodName;
    if (!hodCode && route.department) {
      const key = route.department.toLowerCase();
      if (!heads.has(key)) {
        const head = await lookupDepartmentHead(route.department);
        heads.set(key, head ? { code: head.code, name: head.name } : null);
      }
      const head = heads.get(key);
      hodCode = head?.code;
      hodName = head?.name;
    }
    addSubmissionRecipient(recipients, hodCode, hodName, `${route.department} HOD`);
  }
  return recipients;
};

const submissionEmail = (item: Correspondence, recipient: SubmissionRecipient, href: string) => buildDleEmail({
  logoUrl: resolveEmailLogoUrl(),
  recipientName: recipient.name || 'Colleague',
  subject: [item.type, 'New correspondence submitted', item.referenceNo, item.dueDate ? `Due ${formatEmailDate(item.dueDate)}` : ''].filter(Boolean).join(' — '),
  module: 'Corporate Office',
  headline: 'New correspondence submitted',
  intro: 'A correspondence has been logged and you are one of the recipients. Please review it and take the action required.',
  tone: 'info',
  statusBadge: 'Submitted',
  preheader: `${item.referenceNo} has been submitted for your action.`,
  details: [
    { label: 'Reference', value: item.referenceNo },
    { label: 'Type', value: item.type || '—' },
    { label: 'Subject', value: item.subject || item.description || '—' },
    { label: 'From', value: item.senderCompany || '—' },
    { label: 'Lead department', value: item.department || '—' },
    { label: 'Priority', value: item.priority || 'Medium' },
    { label: 'Response due date', value: item.dueDate ? formatEmailDate(item.dueDate) : '—' },
    { label: 'Your role', value: recipient.role },
  ],
  actions: [{ href, label: 'Open correspondence', tone: 'primary' }],
  footerNote: 'This notice is sent to everyone selected on the correspondence: the addressee, the assignee, and each department officer and head of department.',
});

export const notifyCorrespondenceSubmitted = async (session: SessionPayload, item: Correspondence, options?: { cc?: string }) => {
  const recipients = await submissionRecipients(item);
  const href = `${resolveWorkflowLinkOrigin()}/corporate-office?item=${encodeURIComponent(item.id)}`;
  const deliveries: Array<{ code: string; name: string; role: string; email: string; sent: boolean; reason?: string }> = [];
  for (const recipient of recipients) {
    const noticeKey = `fd:${item.id}:submitted:${item.dueDate || 'none'}:${recipient.code}`.slice(0, 200);
    const claimed = await claimFrontDeskNotice(noticeKey, item.id);
    if (!claimed) {
      deliveries.push({ code: recipient.code, name: recipient.name, role: recipient.role, email: '', sent: false, reason: 'Already sent.' });
      continue;
    }
    try {
      const employee = await readEmployeeFromDbByCode(recipient.code).catch(() => null);
      const mailbox = await resolveEmployeeMailbox(employee);
      const email = submissionEmail(item, { ...recipient, name: recipient.name || employee?.fullName || '' }, href);
      const sent = mailbox
        ? await sendTransactionalEmail({ to: mailbox, cc: options?.cc, subject: email.subject, text: email.text, html: email.html })
        : { sent: false, reason: `No mailbox for ${recipient.code}.` };
      if (!sent.sent) {
        await releaseFrontDeskNotice(noticeKey);
        deliveries.push({ code: recipient.code, name: recipient.name, role: recipient.role, email: mailbox, sent: false, reason: sent.reason });
        continue;
      }
      await createEnterpriseNotification(session, {
        recipientEmployeeCode: recipient.code,
        kind: 'Workflow',
        module: 'Corporate Office',
        title: [item.type, 'New correspondence submitted'].filter(Boolean).join(' — '),
        body: `${item.referenceNo} — ${recipient.role}.`,
        severity: 'info',
        href: `/corporate-office?item=${encodeURIComponent(item.id)}`,
        metadata: { dedupeKey: noticeKey, correspondenceId: item.id },
      }).catch((error) => {
        console.warn('[front-desk] In-app submission notice was not saved.', error instanceof Error ? error.message : error);
      });
      deliveries.push({ code: recipient.code, name: recipient.name || employee?.fullName || '', role: recipient.role, email: mailbox, sent: true });
    } catch (error) {
      await releaseFrontDeskNotice(noticeKey);
      deliveries.push({
        code: recipient.code,
        name: recipient.name,
        role: recipient.role,
        email: '',
        sent: false,
        reason: error instanceof Error ? error.message : 'Could not send the submission email.',
      });
    }
  }
  return deliveries;
};

export const notifyCorrespondenceRoutes = async (session: SessionPayload, item: Correspondence) => {
  for (const route of item.routes || []) {
    if (route.status === 'Completed' || route.status === 'Waived') continue;
    if (route.assigneeCode && !(route.lead && route.assigneeCode === item.assignedEmployeeCode)) {
      await notifyOnce(
        session,
        `front-desk:${item.id}:route:${route.id}:assigned:${route.assigneeCode}`,
        item.id,
        route.assigneeCode,
        `${route.department} correspondence assigned`,
        `${item.referenceNo} — ${route.actionRequired || item.subject}`,
        'info',
      );
    }
    if (route.hodCode && route.hodCode !== route.assigneeCode) {
      await notifyOnce(
        session,
        `front-desk:${item.id}:route:${route.id}:hod:${route.hodCode}`,
        item.id,
        route.hodCode,
        `${route.department} correspondence needs the HOD`,
        `${item.referenceNo} — ${route.actionRequired || item.subject}`,
        'info',
      );
    }
  }
};

export const notifyRouteCompleted = async (session: SessionPayload, item: Correspondence, route: DepartmentRoute) => {
  const lead = (item.routes || []).find((itemRoute) => itemRoute.lead);
  const employeeCode = lead?.assigneeCode || item.assignedEmployeeCode || '';
  if (!employeeCode || employeeCode === route.assigneeCode) return;
  await notifyOnce(
    session,
    `front-desk:${item.id}:route:${route.id}:completed:${employeeCode}`,
    item.id,
    employeeCode,
    `${route.department} completed its assignment`,
    `${item.referenceNo} — the lead department can consolidate the response.`,
    'success',
  );
};

export const notifyCorrespondenceClosed = async (
  session: SessionPayload,
  item: { id: string; referenceNo: string; subject: string; assignedEmployeeCode?: string },
) => {
  if (!item.assignedEmployeeCode) return;
  await notifyOnce(
    session,
    `front-desk:${item.id}:closed`,
    item.id,
    item.assignedEmployeeCode,
    'Correspondence closed',
    `${item.referenceNo} — ${item.subject} has been closed.`,
    'success',
  );
};

const deadlineEmail = (
  alert: FrontDeskDeadlineAlert,
  target: Pick<DepartmentDeadlineTarget, 'referenceNo' | 'subject' | 'correspondenceType' | 'department' | 'dueDate' | 'priority'>,
  recipientName: string,
  href: string,
) => buildDleEmail({
  logoUrl: resolveEmailLogoUrl(),
  recipientName,
  subject: [target.correspondenceType, alert.headline, target.referenceNo].filter(Boolean).join(' — '),
  module: 'Corporate Office',
  headline: alert.headline,
  intro: alert.intro,
  tone: alert.tone,
  statusBadge: alert.daysRemaining === 0 ? 'Due today' : `${alert.daysRemaining} days remaining`,
  preheader: `${target.referenceNo} is due ${formatEmailDate(target.dueDate)}.`,
  details: [
    { label: 'Reference', value: target.referenceNo },
    { label: 'Type', value: target.correspondenceType || '—' },
    { label: 'Subject', value: target.subject || '—' },
    { label: 'Department', value: target.department },
    { label: 'Priority', value: target.priority || 'Medium' },
    { label: 'Response due date', value: formatEmailDate(target.dueDate) },
  ],
  actions: [{ href, label: 'Open correspondence', tone: 'primary' }],
  footerNote: 'This alert is sent to the head of department for each department selected on the correspondence.',
});

const resolveRouteHead = async (target: DepartmentDeadlineTarget, cache: Map<string, { code: string; name: string } | null>) => {
  if (target.hodCode) return { code: target.hodCode, name: target.hodName || target.hodCode };
  const key = target.department.toLowerCase();
  if (!cache.has(key)) {
    const head = await lookupDepartmentHead(target.department);
    cache.set(key, head ? { code: head.code, name: head.name } : null);
  }
  return cache.get(key) || null;
};

const deliverDeadlineAlert = async (
  session: SessionPayload,
  target: DepartmentDeadlineTarget,
  alert: FrontDeskDeadlineAlert,
  head: { code: string; name: string },
) => {
  const noticeKey = `fd:${target.id}:${target.routeId || 'parent'}:${target.dueDate}:${alert.key}:${head.code}`.slice(0, 200);
  const claimed = await claimFrontDeskNotice(noticeKey, target.id);
  if (!claimed) return;
  try {
  const employee = await readEmployeeFromDbByCode(head.code).catch(() => null);
  const mailbox = await resolveEmployeeMailbox(employee);
  const href = `${resolveWorkflowLinkOrigin()}/corporate-office?item=${encodeURIComponent(target.id)}`;
  const email = deadlineEmail(alert, target, head.name || 'Colleague', href);
  const sent = mailbox
    ? await sendTransactionalEmail({ to: mailbox, subject: email.subject, text: email.text, html: email.html })
    : { sent: false, reason: `No mailbox for ${head.code}.` };
  if (!sent.sent) {
    await releaseFrontDeskNotice(noticeKey);
    console.warn('[front-desk] Deadline email was not sent.', { reference: target.referenceNo, department: target.department, reason: sent.reason });
    return;
  }
  await createEnterpriseNotification(session, {
    recipientEmployeeCode: head.code,
    kind: 'Workflow',
    module: 'Corporate Office',
    title: [target.correspondenceType, alert.headline].filter(Boolean).join(' — '),
    body: `${target.referenceNo} — ${target.department} — due ${formatDate(target.dueDate)}.`,
    severity: alert.tone === 'danger' ? 'critical' : 'warning',
    href: `/corporate-office?item=${encodeURIComponent(target.id)}`,
    metadata: { dedupeKey: noticeKey, correspondenceId: target.id },
  }).catch((error) => {
    console.warn('[front-desk] In-app deadline notice was not saved.', error instanceof Error ? error.message : error);
  });
  } catch (error) {
    await releaseFrontDeskNotice(noticeKey);
    console.warn('[front-desk] Deadline alert failed.', error instanceof Error ? error.message : error);
  }
};

export const runFrontDeskDeadlineNotices = async (now = new Date()) => {
  const targets = await listDepartmentDeadlineTargets();
  const session = systemSession();
  const heads = new Map<string, { code: string; name: string } | null>();
  for (const target of targets) {
    const alert = frontDeskDeadlineAlert(target.dueDate, now);
    if (!alert) continue;
    const head = await resolveRouteHead(target, heads);
    if (!head?.code) {
      console.warn('[front-desk] No HOD for deadline alert.', { reference: target.referenceNo, department: target.department });
      continue;
    }
    await deliverDeadlineAlert(session, target, alert, head);
  }
};

export const sendFrontDeskDeadlineSample = async (employeeCode: string) => {
  const employee = await readEmployeeFromDbByCode(employeeCode);
  if (!employee) throw new Error(`Employee ${employeeCode} was not found.`);
  const mailbox = await resolveEmployeeMailbox(employee);
  if (!mailbox) throw new Error(`Employee ${employeeCode} has no mailbox.`);
  const due = new Date();
  due.setDate(due.getDate() + 10);
  const dueDate = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}`;
  const alert = frontDeskDeadlineAlert(dueDate, new Date());
  if (!alert) throw new Error('Sample alert could not be built.');
  const href = `${resolveWorkflowLinkOrigin()}/corporate-office`;
  const email = deadlineEmail(alert, {
    referenceNo: 'DLE/IN/2026/SAMPLE',
    subject: 'Sample correspondence for HOD deadline review',
    correspondenceType: 'Notice / Demand',
    department: 'LEGAL',
    dueDate,
    priority: 'High',
  }, employee.fullName || employeeCode, href);
  email.subject = `Sample for review: ${email.subject}`;
  const sent = await sendTransactionalEmail({
    to: mailbox,
    subject: email.subject,
    text: `${email.text}\n\nSample only. Live alerts go to the HOD of each selected department: 10 days before the due date, a reminder 5 days before, and three alerts on the due date at 08:00, 12:00 and 16:00.`,
    html: email.html.replace(
      'This alert is sent to the head of department for each department selected on the correspondence.',
      'Sample for review only. This is not a live correspondence. Live alerts go to the HOD of each selected department: one email 10 days before the due date, a reminder 5 days before, and three alerts on the due date at 08:00, 12:00 and 16:00.',
    ),
  });
  return { ...sent, to: mailbox, name: employee.fullName || employeeCode, subject: email.subject };
};
