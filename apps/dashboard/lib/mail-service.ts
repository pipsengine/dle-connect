import { buildEmailBrandLogoAttachment } from '@/lib/email-brand-assets';
import nodemailer from 'nodemailer';
import type { DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import type { LeaveEmailApproverKind } from '@/lib/leave-email-action-token';
import type { EssLeaveRequest } from '@/lib/leave-workflow-service';
import {
  graphMailConfigured,
  sendGraphMail,
  verifyGraphMailConnection,
} from '@/lib/microsoft-graph-mail';
import {
  buildDleTestEmail,
  buildLeaveApprovalRequestEmail,
  buildLeaveRelieverEmail,
  buildLeaveWorkflowEmail,
  buildOvertimeApprovalRequestEmail,
  buildOvertimeApprovedEmail,
  buildOvertimeRejectedEmail,
  buildPayrollApprovalRequestEmail,
  buildPayrollFullyApprovedEmail,
  buildPayrollRejectedEmail,
  buildPayrollReleasedEmail,
  buildPayrollRevisionRequestedEmail,
  buildPayrollStageApprovedEmail,
  buildPayrollSubmittedEmail,
  employeeDisplayName,
  leaveApprovalLinks,
  type LeaveEmailEvent,
} from '@/lib/workflow-email-builders';
import { leavePortalUrl } from '@/lib/leave-email-action-token';
import type { PayrollApprovalStageId } from '@/lib/payroll-approval-workflow';

type MailProvider = 'graph' | 'smtp';

const compact = (value: unknown) => String(value || '').trim();

const smtpConfigured = () => Boolean(
  process.env.DLE_SMTP_HOST
  && process.env.DLE_SMTP_FROM
  && (process.env.DLE_SMTP_USER ? process.env.DLE_SMTP_PASSWORD : true),
);

export const resolveMailProvider = (): MailProvider | null => {
  const preference = compact(process.env.DLE_MAIL_PROVIDER).toLowerCase();
  if (preference === 'graph') return graphMailConfigured() ? 'graph' : null;
  if (preference === 'smtp') return smtpConfigured() ? 'smtp' : null;
  if (graphMailConfigured()) return 'graph';
  if (smtpConfigured()) return 'smtp';
  return null;
};

const createSmtpTransport = () => {
  const host = process.env.DLE_SMTP_HOST!;
  const port = Number(process.env.DLE_SMTP_PORT || 587);
  const user = process.env.DLE_SMTP_USER || '';
  const pass = process.env.DLE_SMTP_PASSWORD || '';
  const secure = String(process.env.DLE_SMTP_SECURE || 'false') === 'true';
  const useStartTls = port === 587 && !secure;

  return nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS: useStartTls || String(process.env.DLE_SMTP_REQUIRE_TLS || 'true') === 'true',
    auth: user ? { user, pass } : undefined,
    tls: { minVersion: 'TLSv1.2' },
    connectionTimeout: Number(process.env.DLE_SMTP_CONNECTION_TIMEOUT_MS || 10000),
    greetingTimeout: Number(process.env.DLE_SMTP_GREETING_TIMEOUT_MS || 10000),
    socketTimeout: Number(process.env.DLE_SMTP_SOCKET_TIMEOUT_MS || 15000),
  });
};

export const employeeEmailAddress = (employee?: DleEmployeeDirectoryRow | null) =>
  compact(employee?.officialEmail || employee?.email || employee?.personalEmail);

export const sendTransactionalEmail = async (input: { to: string; subject: string; text: string; html?: string }) => {
  const to = compact(input.to);
  if (!to) return { sent: false, reason: 'No recipient email.' };

  const provider = resolveMailProvider();
  if (!provider) {
    console.info('[mail-service] No mail provider configured. Email skipped.', { to, subject: input.subject });
    return { sent: false, reason: 'Mail provider not configured.' };
  }

  const replyTo = compact(process.env.DLE_SMTP_REPLY_TO) || undefined;
  const logoAttachment = input.html ? await buildEmailBrandLogoAttachment() : null;
  const inlineAttachments = logoAttachment
    ? [{
        filename: logoAttachment.filename,
        content: logoAttachment.content,
        cid: logoAttachment.cid,
        contentType: logoAttachment.contentType,
        contentDisposition: 'inline' as const,
      }]
    : [];

  if (provider === 'graph') {
    const result = await sendGraphMail({
      to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      replyTo,
      inlineAttachments: logoAttachment
        ? [{
            name: logoAttachment.filename,
            contentType: logoAttachment.contentType,
            contentBytes: logoAttachment.contentBytes,
            contentId: logoAttachment.contentId,
          }]
        : [],
    });
    if (!result.sent) {
      console.error('[mail-service] Graph send failed.', { to, subject: input.subject, reason: result.reason });
    }
    return result;
  }

  const from = process.env.DLE_SMTP_FROM!;

  try {
    const transport = createSmtpTransport();
    const info = await transport.sendMail({
      from,
      to,
      replyTo,
      subject: input.subject,
      text: input.text,
      html: input.html || input.text.replace(/\n/g, '<br/>'),
      attachments: inlineAttachments,
    });
    return { sent: true, messageId: compact(info.messageId) || undefined, provider: 'smtp' as const };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'SMTP send failed.';
    console.error('[mail-service] SMTP send failed.', { to, subject: input.subject, reason });
    return { sent: false, reason };
  }
};

export const verifyMailConnection = async () => {
  const provider = resolveMailProvider();
  if (provider === 'graph') return verifyGraphMailConnection();
  if (provider === 'smtp') return verifySmtpConnection();
  return { ok: false as const, reason: 'Mail provider not configured.' };
};

export const verifySmtpConnection = async () => {
  if (!smtpConfigured()) return { ok: false, reason: 'SMTP not configured.' };
  try {
    await createSmtpTransport().verify();
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'SMTP verification failed.' };
  }
};

export const sendDleTestEmail = async (input: {
  to: string;
  recipientName: string;
  employeeCode: string;
  appUrl: string;
}) => {
  const email = buildDleTestEmail({
    recipientName: input.recipientName,
    employeeCode: input.employeeCode,
    appUrl: input.appUrl,
    provider: resolveMailProvider() || 'not configured',
  });
  return sendTransactionalEmail({ to: input.to, subject: email.subject, text: email.text, html: email.html });
};

export const sendLeaveWorkflowEmail = async (input: {
  event: LeaveEmailEvent;
  request: EssLeaveRequest;
  requester: DleEmployeeDirectoryRow;
  recipient?: DleEmployeeDirectoryRow;
  actorName?: string;
  extra?: string;
  baseUrl?: string | null;
}) => {
  const recipient = input.recipient || input.requester;
  const to = employeeEmailAddress(recipient);
  const email = buildLeaveWorkflowEmail({
    event: input.event,
    request: input.request,
    recipientName: employeeDisplayName(recipient),
    actorName: input.actorName,
    extra: input.extra,
    portalLink: leavePortalUrl(input.baseUrl),
    baseUrl: input.baseUrl,
  });
  return sendTransactionalEmail({ to, subject: email.subject, text: email.text, html: email.html });
};

export const sendLeaveRelieverAssignmentEmail = async (input: {
  request: EssLeaveRequest;
  requester: DleEmployeeDirectoryRow;
  reliever: DleEmployeeDirectoryRow;
  actorName?: string;
  baseUrl?: string | null;
}) => {
  const to = employeeEmailAddress(input.reliever);
  const email = buildLeaveRelieverEmail({
    request: input.request,
    requesterName: employeeDisplayName(input.requester),
    recipientName: employeeDisplayName(input.reliever),
    actorName: input.actorName,
    portalLink: leavePortalUrl(input.baseUrl),
    baseUrl: input.baseUrl,
  });
  return sendTransactionalEmail({ to, subject: email.subject, text: email.text, html: email.html });
};

const payrollRecipientEmail = (recipient: { fullName: string; email: string }) => {
  const to = compact(recipient.email);
  if (!to) return { sent: false as const, reason: 'No recipient email.' };
  return { sent: true as const, to };
};

export const sendPayrollApprovalRequestEmail = async (input: {
  recipient: { fullName: string; email: string; roles: string[] };
  run: { period: string; periodLabel: string; grossPay: number; netPay: number; employeeCount: number };
  stageTitle: string;
  stageId: PayrollApprovalStageId;
  approveUrl: string;
  rejectUrl: string;
  workspaceUrl: string;
  baseUrl?: string | null;
}) => {
  const resolved = payrollRecipientEmail(input.recipient);
  if (!resolved.sent) return resolved;
  const email = buildPayrollApprovalRequestEmail({
    recipientName: input.recipient.fullName,
    run: input.run,
    stageTitle: input.stageTitle,
    stageId: input.stageId,
    approveUrl: input.approveUrl,
    rejectUrl: input.rejectUrl,
    workspaceUrl: input.workspaceUrl,
    baseUrl: input.baseUrl,
  });
  return sendTransactionalEmail({ to: resolved.to, subject: email.subject, text: email.text, html: email.html });
};

export const sendPayrollSubmittedEmail = async (input: {
  recipient: { fullName: string; email: string };
  run: { periodLabel: string; grossPay: number; netPay: number; employeeCount: number };
  actorName?: string;
  workspaceUrl: string;
  baseUrl?: string | null;
}) => {
  const resolved = payrollRecipientEmail(input.recipient);
  if (!resolved.sent) return resolved;
  const email = buildPayrollSubmittedEmail({
    recipientName: input.recipient.fullName,
    run: input.run,
    actorName: input.actorName,
    workspaceUrl: input.workspaceUrl,
    baseUrl: input.baseUrl,
  });
  return sendTransactionalEmail({ to: resolved.to, subject: email.subject, text: email.text, html: email.html });
};

export const sendPayrollStageApprovedEmail = async (input: {
  recipient: { fullName: string; email: string };
  run: { periodLabel: string; grossPay: number; netPay: number; employeeCount: number };
  completedStage: string;
  nextStage: string;
  actorName: string;
  workspaceUrl: string;
  baseUrl?: string | null;
}) => {
  const resolved = payrollRecipientEmail(input.recipient);
  if (!resolved.sent) return resolved;
  const email = buildPayrollStageApprovedEmail({
    recipientName: input.recipient.fullName,
    run: input.run,
    completedStage: input.completedStage,
    nextStage: input.nextStage,
    actorName: input.actorName,
    workspaceUrl: input.workspaceUrl,
    baseUrl: input.baseUrl,
  });
  return sendTransactionalEmail({ to: resolved.to, subject: email.subject, text: email.text, html: email.html });
};

export const sendPayrollFullyApprovedEmail = async (input: {
  recipient: { fullName: string; email: string };
  run: { periodLabel: string; grossPay: number; netPay: number; employeeCount: number };
  actorName: string;
  workspaceUrl: string;
  bankFinanceUrl: string;
  bankScheduleDownloadUrl: string;
  baseUrl?: string | null;
}) => {
  const resolved = payrollRecipientEmail(input.recipient);
  if (!resolved.sent) return resolved;
  const email = buildPayrollFullyApprovedEmail({
    recipientName: input.recipient.fullName,
    run: input.run,
    actorName: input.actorName,
    workspaceUrl: input.workspaceUrl,
    bankFinanceUrl: input.bankFinanceUrl,
    bankScheduleDownloadUrl: input.bankScheduleDownloadUrl,
    baseUrl: input.baseUrl,
  });
  return sendTransactionalEmail({ to: resolved.to, subject: email.subject, text: email.text, html: email.html });
};

export const sendPayrollRejectedEmail = async (input: {
  recipient: { fullName: string; email: string };
  run: { periodLabel: string; grossPay: number; netPay: number; employeeCount: number };
  actorName?: string;
  reason?: string;
  workspaceUrl: string;
  baseUrl?: string | null;
}) => {
  const resolved = payrollRecipientEmail(input.recipient);
  if (!resolved.sent) return resolved;
  const email = buildPayrollRejectedEmail({
    recipientName: input.recipient.fullName,
    run: input.run,
    actorName: input.actorName,
    reason: input.reason,
    workspaceUrl: input.workspaceUrl,
    baseUrl: input.baseUrl,
  });
  return sendTransactionalEmail({ to: resolved.to, subject: email.subject, text: email.text, html: email.html });
};

export const sendPayrollRevisionRequestedEmail = async (input: {
  recipient: { fullName: string; email: string };
  run: { periodLabel: string; grossPay: number; netPay: number; employeeCount: number };
  actorName?: string;
  reason?: string;
  workspaceUrl: string;
  baseUrl?: string | null;
}) => {
  const resolved = payrollRecipientEmail(input.recipient);
  if (!resolved.sent) return resolved;
  const email = buildPayrollRevisionRequestedEmail({
    recipientName: input.recipient.fullName,
    run: input.run,
    actorName: input.actorName,
    reason: input.reason,
    workspaceUrl: input.workspaceUrl,
    baseUrl: input.baseUrl,
  });
  return sendTransactionalEmail({ to: resolved.to, subject: email.subject, text: email.text, html: email.html });
};

export const sendPayrollReleasedEmail = async (input: {
  recipient: { fullName: string; email: string };
  run: { periodLabel: string; grossPay: number; netPay: number; employeeCount: number };
  actorName: string;
  workspaceUrl: string;
  baseUrl?: string | null;
}) => {
  const resolved = payrollRecipientEmail(input.recipient);
  if (!resolved.sent) return resolved;
  const email = buildPayrollReleasedEmail({
    recipientName: input.recipient.fullName,
    run: input.run,
    actorName: input.actorName,
    workspaceUrl: input.workspaceUrl,
    baseUrl: input.baseUrl,
  });
  return sendTransactionalEmail({ to: resolved.to, subject: email.subject, text: email.text, html: email.html });
};

export const sendLeaveApprovalRequestEmail = async (input: {
  request: EssLeaveRequest;
  requester: DleEmployeeDirectoryRow;
  recipient: DleEmployeeDirectoryRow;
  approverKind: LeaveEmailApproverKind;
  baseUrl?: string | null;
}) => {
  const to = employeeEmailAddress(input.recipient);
  if (!to) return { sent: false, reason: 'No recipient email.' };
  const recipientUsername = compact(input.recipient.employeeCode || input.recipient.employeeId || input.recipient.sourceEmployeeId);
  const links = leaveApprovalLinks({
    request: input.request,
    recipientEmail: to,
    recipientUsername: recipientUsername || to,
    approverKind: input.approverKind,
    baseUrl: input.baseUrl,
  });
  const email = buildLeaveApprovalRequestEmail({
    request: input.request,
    requesterName: employeeDisplayName(input.requester),
    recipientName: employeeDisplayName(input.recipient),
    approverKind: input.approverKind,
    ...links,
    baseUrl: input.baseUrl,
  });
  return sendTransactionalEmail({ to, subject: email.subject, text: email.text, html: email.html });
};

export const sendOvertimeApprovalRequestEmail = async (input: {
  recipientName: string;
  recipientEmail: string | null;
  role: string;
  request: {
    projectCode: string;
    projectName: string;
    workDate: string;
    supervisorName: string;
    requestedHours: number;
    reason: string;
  };
  approveLink: string;
  rejectLink: string;
  workspaceLink: string;
  baseUrl?: string | null;
}) => {
  const to = compact(input.recipientEmail);
  if (!to) return { sent: false, reason: 'No recipient email.' };
  const email = buildOvertimeApprovalRequestEmail({ ...input, baseUrl: input.baseUrl });
  return sendTransactionalEmail({ to, subject: email.subject, text: email.text, html: email.html });
};

export const sendOvertimeApprovedEmail = async (input: {
  recipientName: string;
  recipientEmail: string | null;
  projectCode: string;
  workDate: string;
  requestedHours: number;
  timesheetLink: string;
  baseUrl?: string | null;
}) => {
  const to = compact(input.recipientEmail);
  if (!to) return { sent: false, reason: 'No recipient email.' };
  const email = buildOvertimeApprovedEmail({ ...input, baseUrl: input.baseUrl });
  return sendTransactionalEmail({ to, subject: email.subject, text: email.text, html: email.html });
};

export const sendOvertimeRejectedEmail = async (input: {
  recipientName: string;
  recipientEmail: string | null;
  projectCode: string;
  projectName: string;
  workDate: string;
  actorName?: string;
  reason?: string;
  workspaceLink: string;
  baseUrl?: string | null;
}) => {
  const to = compact(input.recipientEmail);
  if (!to) return { sent: false, reason: 'No recipient email.' };
  const email = buildOvertimeRejectedEmail({ ...input, baseUrl: input.baseUrl });
  return sendTransactionalEmail({ to, subject: email.subject, text: email.text, html: email.html });
};
