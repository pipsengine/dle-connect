import { readUsers } from '@/lib/auth/auth-store';
import type { SessionPayload } from '@/lib/auth/session';
import { createEnterpriseNotification } from '@/lib/enterprise-notifications-store';
import { sendPayrollApprovalRequestEmail } from '@/lib/mail-service';
import {
  createPayrollEmailActionToken,
  payrollApprovalWorkspaceUrl,
  payrollAuthorizePageUrl,
} from '@/lib/payroll-email-action-token';
import {
  getCurrentPayrollApprovalStage,
  type PayrollApprovalStageId,
  PAYROLL_APPROVAL_STAGES,
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

type ApproverRecipient = {
  id: string;
  username: string;
  fullName: string;
  email: string;
  roles: string[];
};

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
    const workspaceUrl = payrollApprovalWorkspaceUrl(input.run.period, input.baseUrl);

    await createEnterpriseNotification(systemSessionFor(recipient), {
      kind: 'Approval',
      module: 'Payroll Management',
      title: `Payroll approval required — ${input.run.periodLabel}`,
      body: `${stage.title} review is required for ${input.run.periodLabel}. Gross ₦${input.run.grossPay.toLocaleString('en-NG')}, Net ₦${input.run.netPay.toLocaleString('en-NG')}, ${input.run.employeeCount} employees.`,
      severity: 'warning',
      href: authorizeApproveUrl,
      actor: input.actor || 'Payroll Workflow',
      channels: ['In-App', 'Email'],
      recipientRoles: recipient.roles,
      recipientEmployeeCode: recipient.username,
      metadata: {
        runId: input.run.id,
        period: input.run.period,
        stageId: input.stageId,
      },
    });
    notified += 1;

    const mail = await sendPayrollApprovalRequestEmail({
      recipient,
      run: input.run,
      stageTitle: stage.title,
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
