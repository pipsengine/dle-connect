import { readUsers } from '@/lib/auth/auth-store';
import type { SessionPayload } from '@/lib/auth/session';
import { createEnterpriseNotification } from '@/lib/enterprise-notifications-store';
import {
  sendPayrollApprovalRequestEmail,
  sendPayrollFullyApprovedEmail,
  sendPayrollRejectedEmail,
  sendPayrollReleasedEmail,
  sendPayrollRevisionRequestedEmail,
  sendPayrollStageApprovedEmail,
  sendPayrollSubmittedEmail,
} from '@/lib/mail-service';
import {
  createPayrollEmailActionToken,
  payrollApprovalWorkspaceUrl,
  payrollAuthorizePageUrl,
  payrollBankFinanceWorkspaceUrl,
  payrollBankScheduleDownloadUrl,
} from '@/lib/payroll-email-action-token';
import {
  getCurrentPayrollApprovalStage,
  PAYROLL_APPROVAL_STAGES,
  type PayrollApprovalStageId,
} from '@/lib/payroll-approval-workflow';
import type { UnifiedPayrollRun } from '@/lib/payroll-run-store';
import type { PayrollSessionRole } from '@/lib/payroll-session';

const compact = (value: unknown) => String(value || '').trim();
const lower = (value: unknown) => compact(value).toLowerCase();

const STAGE_ROLE_PATTERNS: Record<Exclude<PayrollApprovalStageId, 'payroll-officer'>, RegExp[]> = {
  'hr-manager': [/hr manager/i, /hr director/i],
  'finance-manager': [/finance manager/i, /finance controller/i],
  cfo: [/\bcfo\b/i, /chief financial/i],
  'md-ceo': [/executive director/i, /executive management/i, /\bceo\b/i, /\bmd\b/i, /managing director/i],
};

const NEXT_STAGE_LABEL: Partial<Record<PayrollApprovalStageId, string>> = {
  'payroll-officer': 'HR Manager approval',
  'hr-manager': 'Finance Manager approval',
  'finance-manager': 'CFO approval',
  cfo: 'MD / CEO approval',
};

type ApproverRecipient = {
  id: string;
  username: string;
  fullName: string;
  email: string;
  roles: string[];
};

const runSummary = (run: UnifiedPayrollRun) => ({
  periodLabel: run.periodLabel,
  grossPay: run.grossPay,
  netPay: run.netPay,
  employeeCount: run.employeeCount,
});

const systemSessionFor = (recipient: ApproverRecipient): SessionPayload => ({
  sub: recipient.id,
  username: recipient.username,
  fullName: recipient.fullName,
  employeeCode: recipient.username,
  roles: recipient.roles,
  permissions: [],
  status: 'Active',
  firstLoginRequired: false,
  passwordResetRequired: false,
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 3600,
});

export const resolvePayrollApproverRecipients = async (stageId: PayrollApprovalStageId): Promise<ApproverRecipient[]> => {
  if (stageId === 'payroll-officer') return [];
  const users = await readUsers();
  const patterns = STAGE_ROLE_PATTERNS[stageId];
  const matches = users.filter((user) => {
    const roleText = user.roles.join(' ');
    return patterns.some((pattern) => pattern.test(roleText));
  });
  const withEmail = matches
    .map((user) => ({
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      email: compact(user.email),
      roles: user.roles,
    }))
    .filter((user) => user.email);

  if (withEmail.length) return withEmail;

  const fallbackRole: Record<Exclude<PayrollApprovalStageId, 'payroll-officer'>, PayrollSessionRole> = {
    'hr-manager': 'HR Manager',
    'finance-manager': 'Finance Manager',
    cfo: 'CFO',
    'md-ceo': 'Executive Director',
  };
  return [{
    id: `role-${stageId}`,
    username: fallbackRole[stageId],
    fullName: fallbackRole[stageId],
    email: compact(process.env[`PAYROLL_${stageId.toUpperCase().replace(/-/g, '_')}_EMAIL`] || process.env.PAYROLL_APPROVAL_FALLBACK_EMAIL || ''),
    roles: [fallbackRole[stageId]],
  }].filter((item) => item.email);
};

export const resolvePayrollOfficerRecipients = async (run: UnifiedPayrollRun): Promise<ApproverRecipient[]> => {
  const users = await readUsers();
  const officers = users
    .filter((user) => user.roles.some((role) => /payroll officer|payroll supervisor/i.test(role)) && compact(user.email))
    .map((user) => ({
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      email: compact(user.email),
      roles: user.roles,
    }));
  if (officers.length) return officers;

  const submitter = users.find((user) =>
    lower(user.fullName) === lower(run.submittedBy)
    || lower(user.username) === lower(run.submittedBy)
    || lower(user.fullName) === lower(run.createdBy),
  );
  if (submitter?.email) {
    return [{
      id: submitter.id,
      username: submitter.username,
      fullName: submitter.fullName,
      email: compact(submitter.email),
      roles: submitter.roles,
    }];
  }

  const fallback = compact(process.env.PAYROLL_APPROVAL_FALLBACK_EMAIL);
  return fallback ? [{
    id: 'payroll-officer-fallback',
    username: 'Payroll Officer',
    fullName: 'Payroll Officer',
    email: fallback,
    roles: ['Payroll Officer'],
  }] : [];
};

const FINANCE_HR_ROLE_PATTERNS = [
  /finance manager/i,
  /finance controller/i,
  /\bcfo\b/i,
  /chief financial/i,
  /treasury/i,
  /accountant/i,
  /hr manager/i,
  /hr director/i,
  /payroll officer/i,
  /payroll supervisor/i,
];

export const resolvePayrollFinanceHrRecipients = async (): Promise<ApproverRecipient[]> => {
  const users = await readUsers();
  const seen = new Set<string>();
  const recipients = users
    .filter((user) => user.roles.some((role) => FINANCE_HR_ROLE_PATTERNS.some((pattern) => pattern.test(role))))
    .map((user) => ({
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      email: compact(user.email),
      roles: user.roles,
    }))
    .filter((user) => user.email)
    .filter((user) => {
      const key = lower(user.email);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  if (recipients.length) return recipients;

  const fallback = compact(process.env.PAYROLL_FINANCE_HR_NOTIFICATION_EMAIL || process.env.PAYROLL_APPROVAL_FALLBACK_EMAIL);
  return fallback ? [{
    id: 'finance-hr-fallback',
    username: 'Finance HR',
    fullName: 'Finance / HR Team',
    email: fallback,
    roles: ['Finance Manager', 'HR Manager'],
  }] : [];
};

export const sessionMatchesPayrollToken = async (session: SessionPayload, payload: { recipientEmail: string; recipientUsername: string }) => {
  if (session.isGlobalAdmin) return true;
  const users = await readUsers();
  const user = users.find((item) => item.id === session.sub || item.username === session.username);
  const tokenEmail = lower(payload.recipientEmail);
  const tokenUsername = lower(payload.recipientUsername);
  return lower(user?.email) === tokenEmail
    || lower(session.username) === tokenUsername
    || lower(user?.username) === tokenUsername;
};

export const notifyPayrollApprovalStage = async (input: {
  run: UnifiedPayrollRun;
  stageId: PayrollApprovalStageId;
  actor?: string;
  baseUrl?: string | null;
}) => {
  const stage = PAYROLL_APPROVAL_STAGES.find((item) => item.id === input.stageId);
  if (!stage || input.stageId === 'payroll-officer') return { notified: 0, emailed: 0 };

  const recipients = await resolvePayrollApproverRecipients(input.stageId);
  let notified = 0;
  let emailed = 0;
  const workspaceUrl = payrollApprovalWorkspaceUrl(input.run.period, input.baseUrl);

  for (const recipient of recipients) {
    const approveToken = createPayrollEmailActionToken({
      runId: input.run.id,
      period: input.run.period,
      stageId: input.stageId,
      decision: 'approve',
      recipientEmail: recipient.email,
      recipientUsername: recipient.username,
    });
    const rejectToken = createPayrollEmailActionToken({
      runId: input.run.id,
      period: input.run.period,
      stageId: input.stageId,
      decision: 'reject',
      recipientEmail: recipient.email,
      recipientUsername: recipient.username,
    });

    const authorizeApproveUrl = payrollAuthorizePageUrl(approveToken, input.baseUrl);
    const authorizeRejectUrl = payrollAuthorizePageUrl(rejectToken, input.baseUrl);

    await createEnterpriseNotification(systemSessionFor(recipient), {
      kind: 'Approval',
      module: 'Payroll Management',
      title: `Payroll approval required — ${input.run.periodLabel}`,
      body: `${stage.title} review is required for ${input.run.periodLabel}. Gross ₦${input.run.grossPay.toLocaleString('en-NG')}, Net ₦${input.run.netPay.toLocaleString('en-NG')}, ${input.run.employeeCount} employees. Approvals are pack-specific (salaried vs daily-rate).`,
      severity: 'warning',
      href: authorizeApproveUrl,
      actor: input.actor || 'Payroll Workflow',
      channels: ['In-App', 'Email'],
      recipientRoles: recipient.roles,
      recipientEmployeeCode: recipient.username,
      metadata: {
        runId: input.run.id,
        period: input.run.period,
        pack: input.run.pack || '',
        stageId: input.stageId,
      },
    });
    notified += 1;

    const mail = await sendPayrollApprovalRequestEmail({
      recipient,
      run: input.run,
      stageTitle: stage.title,
      stageId: input.stageId,
      approveUrl: authorizeApproveUrl,
      rejectUrl: authorizeRejectUrl,
      workspaceUrl,
      baseUrl: input.baseUrl,
    });
    if (mail.sent) emailed += 1;
  }

  return { notified, emailed };
};

export const notifyNextPayrollApprovalStage = async (input: {
  run: UnifiedPayrollRun;
  actor?: string;
  baseUrl?: string | null;
}) => {
  const stage = getCurrentPayrollApprovalStage(input.run);
  if (!stage || stage.id === 'payroll-officer') return { notified: 0, emailed: 0 };
  return notifyPayrollApprovalStage({ ...input, stageId: stage.id });
};

export const notifyPayrollSubmitted = async (input: {
  run: UnifiedPayrollRun;
  actor?: string;
  baseUrl?: string | null;
}) => {
  const recipients = await resolvePayrollOfficerRecipients(input.run);
  const workspaceUrl = payrollApprovalWorkspaceUrl(input.run.period, input.baseUrl);
  let emailed = 0;
  for (const recipient of recipients) {
    const mail = await sendPayrollSubmittedEmail({
      recipient,
      run: input.run,
      actorName: input.actor,
      workspaceUrl,
      baseUrl: input.baseUrl,
    });
    if (mail.sent) emailed += 1;
  }
  return { emailed };
};

export const notifyPayrollStageCompleted = async (input: {
  run: UnifiedPayrollRun;
  completedStageId: PayrollApprovalStageId;
  actor: string;
  baseUrl?: string | null;
}) => {
  const stage = PAYROLL_APPROVAL_STAGES.find((item) => item.id === input.completedStageId);
  if (!stage) return { emailed: 0 };
  const recipients = await resolvePayrollOfficerRecipients(input.run);
  const workspaceUrl = payrollApprovalWorkspaceUrl(input.run.period, input.baseUrl);
  const nextStage = NEXT_STAGE_LABEL[input.completedStageId] || 'next approval stage';
  let emailed = 0;
  for (const recipient of recipients) {
    const mail = await sendPayrollStageApprovedEmail({
      recipient,
      run: input.run,
      completedStage: stage.title,
      nextStage,
      actorName: input.actor,
      workspaceUrl,
      baseUrl: input.baseUrl,
    });
    if (mail.sent) emailed += 1;
  }
  return { emailed };
};

export const notifyPayrollFullyApproved = async (input: {
  run: UnifiedPayrollRun;
  actor: string;
  baseUrl?: string | null;
}) => {
  const [officers, financeHr] = await Promise.all([
    resolvePayrollOfficerRecipients(input.run),
    resolvePayrollFinanceHrRecipients(),
  ]);
  const recipients = Array.from(
    new Map(
      [...officers, ...financeHr]
        .filter((recipient) => recipient.email)
        .map((recipient) => [lower(recipient.email), recipient]),
    ).values(),
  );
  const workspaceUrl = payrollApprovalWorkspaceUrl(input.run.period, input.baseUrl);
  const bankFinanceUrl = payrollBankFinanceWorkspaceUrl(input.run.period, input.baseUrl);
  const bankScheduleDownloadUrl = payrollBankScheduleDownloadUrl(input.run.period, input.baseUrl);
  let notified = 0;
  let emailed = 0;

  for (const recipient of recipients) {
    await createEnterpriseNotification(systemSessionFor(recipient), {
      kind: 'Approval',
      module: 'Payroll Management',
      title: `Payroll fully approved — ${input.run.periodLabel}`,
      body: `Final approval is complete for ${input.run.periodLabel}. Download the bank schedule or open Bank & Finance to process payments.`,
      severity: 'success',
      href: bankScheduleDownloadUrl,
      actor: input.actor || 'Payroll Workflow',
      channels: ['In-App', 'Email'],
      recipientRoles: recipient.roles,
      recipientEmployeeCode: recipient.username,
      metadata: {
        runId: input.run.id,
        period: input.run.period,
        bankScheduleDownloadUrl,
      },
    });
    notified += 1;

    const mail = await sendPayrollFullyApprovedEmail({
      recipient,
      run: input.run,
      actorName: input.actor,
      workspaceUrl,
      bankFinanceUrl,
      bankScheduleDownloadUrl,
      baseUrl: input.baseUrl,
    });
    if (mail.sent) emailed += 1;
  }

  return { notified, emailed };
};

export const notifyPayrollRejected = async (input: {
  run: UnifiedPayrollRun;
  actor?: string;
  reason?: string;
  baseUrl?: string | null;
}) => {
  const recipients = await resolvePayrollOfficerRecipients(input.run);
  const workspaceUrl = payrollApprovalWorkspaceUrl(input.run.period, input.baseUrl);
  let emailed = 0;
  for (const recipient of recipients) {
    const mail = await sendPayrollRejectedEmail({
      recipient,
      run: input.run,
      actorName: input.actor,
      reason: input.reason,
      workspaceUrl,
      baseUrl: input.baseUrl,
    });
    if (mail.sent) emailed += 1;
  }
  return { emailed };
};

export const notifyPayrollRevisionRequested = async (input: {
  run: UnifiedPayrollRun;
  actor?: string;
  reason?: string;
  baseUrl?: string | null;
}) => {
  const recipients = await resolvePayrollOfficerRecipients(input.run);
  const workspaceUrl = payrollApprovalWorkspaceUrl(input.run.period, input.baseUrl);
  let emailed = 0;
  for (const recipient of recipients) {
    const mail = await sendPayrollRevisionRequestedEmail({
      recipient,
      run: input.run,
      actorName: input.actor,
      reason: input.reason,
      workspaceUrl,
      baseUrl: input.baseUrl,
    });
    if (mail.sent) emailed += 1;
  }
  return { emailed };
};

export const notifyPayrollReleased = async (input: {
  run: UnifiedPayrollRun;
  actor: string;
  baseUrl?: string | null;
}) => {
  const recipients = await resolvePayrollOfficerRecipients(input.run);
  const workspaceUrl = `${payrollApprovalWorkspaceUrl(input.run.period, input.baseUrl).replace('/payroll-approval', '/payroll-management')}?period=${encodeURIComponent(input.run.period)}`;
  let emailed = 0;
  for (const recipient of recipients) {
    const mail = await sendPayrollReleasedEmail({
      recipient,
      run: input.run,
      actorName: input.actor,
      workspaceUrl,
      baseUrl: input.baseUrl,
    });
    if (mail.sent) emailed += 1;
  }
  return { emailed };
};
