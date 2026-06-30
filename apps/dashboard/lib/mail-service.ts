import nodemailer from 'nodemailer';
import type { DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import {
  createLeaveEmailActionToken,
  leaveEmailActionUrl,
  leavePortalUrl,
  type LeaveEmailApproverKind,
} from '@/lib/leave-email-action-token';
import type { EssLeaveRequest } from '@/lib/leave-workflow-service';

type LeaveEmailEvent = 'submitted' | 'manager-approved' | 'approved' | 'rejected' | 'approval-request';

const compact = (value: unknown) => String(value || '').trim();

const smtpConfigured = () => Boolean(
  process.env.DLE_SMTP_HOST
  && process.env.DLE_SMTP_FROM
  && (process.env.DLE_SMTP_USER ? process.env.DLE_SMTP_PASSWORD : true),
);

const recipientFor = (employee?: DleEmployeeDirectoryRow | null) =>
  compact(employee?.officialEmail || employee?.email || employee?.personalEmail);

const button = (href: string, label: string, background: string) =>
  `<a href="${href}" style="display:inline-block;margin:8px 8px 8px 0;padding:12px 18px;border-radius:8px;background:${background};color:#ffffff;text-decoration:none;font-weight:700">${label}</a>`;

export const sendTransactionalEmail = async (input: { to: string; subject: string; text: string; html?: string }) => {
  const to = compact(input.to);
  if (!to) return { sent: false, reason: 'No recipient email.' };
  if (!smtpConfigured()) {
    console.info('[mail-service] SMTP not configured. Email skipped.', { to, subject: input.subject });
    return { sent: false, reason: 'SMTP not configured.' };
  }

  const host = process.env.DLE_SMTP_HOST!;
  const port = Number(process.env.DLE_SMTP_PORT || 587);
  const user = process.env.DLE_SMTP_USER || '';
  const pass = process.env.DLE_SMTP_PASSWORD || '';
  const from = process.env.DLE_SMTP_FROM!;
  const secure = String(process.env.DLE_SMTP_SECURE || 'false') === 'true';

  const transport = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user ? { user, pass } : undefined,
  });
  await transport.sendMail({
    from,
    to,
    subject: input.subject,
    text: input.text,
    html: input.html || input.text.replace(/\n/g, '<br/>'),
  });
  return { sent: true };
};

export const sendLeaveWorkflowEmail = async (input: {
  event: LeaveEmailEvent;
  request: EssLeaveRequest;
  requester: DleEmployeeDirectoryRow;
  actorName?: string;
  extra?: string;
  baseUrl?: string | null;
}) => {
  const to = recipientFor(input.requester);
  const subjectMap: Record<LeaveEmailEvent, string> = {
    submitted: `Leave request submitted: ${input.request.leaveType}`,
    'manager-approved': `Leave request awaiting HR approval: ${input.request.leaveType}`,
    approved: `Leave request approved: ${input.request.leaveType}`,
    rejected: `Leave request rejected: ${input.request.leaveType}`,
    'approval-request': `Leave approval required: ${input.request.leaveType}`,
  };
  const portalLink = leavePortalUrl(input.baseUrl);
  const text = [
    `Dear ${input.requester.fullName},`,
    '',
    subjectMap[input.event],
    `Period: ${input.request.startDate} to ${input.request.endDate}`,
    `Days: ${input.request.days}`,
    `Status: ${input.request.status}`,
    input.actorName ? `Actioned by: ${input.actorName}` : '',
    input.extra || '',
    `Open leave workspace: ${portalLink}`,
    '',
    'Dorman Long Engineering — Employee Self-Service',
  ].filter(Boolean).join('\n');
  const html = `<p>Dear <strong>${input.requester.fullName}</strong>,</p>
<p>${subjectMap[input.event]}</p>
<ul>
  <li><strong>Period:</strong> ${input.request.startDate} to ${input.request.endDate}</li>
  <li><strong>Days:</strong> ${input.request.days}</li>
  <li><strong>Status:</strong> ${input.request.status}</li>
</ul>
${input.actorName ? `<p><strong>Actioned by:</strong> ${input.actorName}</p>` : ''}
${input.extra ? `<p>${input.extra}</p>` : ''}
<p>${button(portalLink, 'Open Leave Workspace', '#2563eb')}</p>
<p style="color:#64748b;font-size:12px">Dorman Long Engineering — Employee Self-Service</p>`;
  return sendTransactionalEmail({ to, subject: subjectMap[input.event], text, html });
};

export const sendLeaveApprovalRequestEmail = async (input: {
  request: EssLeaveRequest;
  requester: DleEmployeeDirectoryRow;
  recipient: DleEmployeeDirectoryRow;
  approverKind: LeaveEmailApproverKind;
  baseUrl?: string | null;
}) => {
  const to = recipientFor(input.recipient);
  if (!to) return { sent: false, reason: 'No recipient email.' };

  const approveToken = createLeaveEmailActionToken({
    requestId: input.request.id,
    decision: 'approve',
    recipientEmail: to,
    approverKind: input.approverKind,
  });
  const rejectToken = createLeaveEmailActionToken({
    requestId: input.request.id,
    decision: 'reject',
    recipientEmail: to,
    approverKind: input.approverKind,
  });
  const approveLink = leaveEmailActionUrl(approveToken, input.baseUrl);
  const rejectLink = leaveEmailActionUrl(rejectToken, input.baseUrl);
  const portalLink = leavePortalUrl(input.baseUrl);
  const stageLabel = input.approverKind === 'hr' ? 'HR Manager / Head' : 'Line Manager / Supervisor';
  const subject = `Leave approval required: ${input.requester.fullName} — ${input.request.leaveType}`;

  const text = [
    `Dear ${input.recipient.fullName},`,
    '',
    `A leave request is waiting for your approval as ${stageLabel}.`,
    `Employee: ${input.requester.fullName}`,
    `Leave type: ${input.request.leaveType}`,
    `Period: ${input.request.startDate} to ${input.request.endDate}`,
    `Days: ${input.request.days}`,
    `Reliever: ${input.request.relieverName || 'Not configured'}`,
    '',
    `Approve: ${approveLink}`,
    `Reject: ${rejectLink}`,
    `Open in portal: ${portalLink}`,
    '',
    'You can approve or reject directly from this email without logging in.',
    'Dorman Long Engineering — Employee Self-Service',
  ].join('\n');

  const html = `<p>Dear <strong>${input.recipient.fullName}</strong>,</p>
<p>A leave request is waiting for your approval as <strong>${stageLabel}</strong>.</p>
<table cellpadding="0" cellspacing="0" style="margin:16px 0">
  <tr><td style="padding:4px 12px 4px 0"><strong>Employee</strong></td><td>${input.requester.fullName}</td></tr>
  <tr><td style="padding:4px 12px 4px 0"><strong>Leave type</strong></td><td>${input.request.leaveType}</td></tr>
  <tr><td style="padding:4px 12px 4px 0"><strong>Period</strong></td><td>${input.request.startDate} to ${input.request.endDate}</td></tr>
  <tr><td style="padding:4px 12px 4px 0"><strong>Days</strong></td><td>${input.request.days}</td></tr>
  <tr><td style="padding:4px 12px 4px 0"><strong>Reliever</strong></td><td>${input.request.relieverName || 'Not configured'}</td></tr>
</table>
<p>${button(approveLink, 'Approve Leave', '#059669')}${button(rejectLink, 'Reject Leave', '#dc2626')}${button(portalLink, 'Open in Portal', '#2563eb')}</p>
<p style="color:#64748b;font-size:12px">You can approve or reject directly from this email. Links expire after 7 days.</p>`;

  return sendTransactionalEmail({ to, subject, text, html });
};
