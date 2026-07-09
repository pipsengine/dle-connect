import crypto from 'node:crypto';
import type { PayrollApprovalStageId } from '@/lib/payroll-approval-workflow';
import { resolvePublicAppOrigin } from '@/lib/public-app-url';

export type PayrollEmailDecision = 'approve' | 'reject';

export type PayrollEmailActionPayload = {
  runId: string;
  period: string;
  stageId: PayrollApprovalStageId;
  decision: PayrollEmailDecision;
  recipientEmail: string;
  recipientUsername: string;
  exp: number;
};

const secret = () => process.env.AUTH_SESSION_SECRET || process.env.NEXTAUTH_SECRET || 'dle-development-session-secret-change-before-production';
const compact = (value: unknown) => String(value || '').trim().toLowerCase();

const base64UrlEncode = (value: string) => Buffer.from(value, 'utf8').toString('base64url');
const base64UrlDecode = (value: string) => Buffer.from(value, 'base64url').toString('utf8');
const sign = (payload: string) => crypto.createHmac('sha256', secret()).update(payload).digest('base64url');

export const createPayrollEmailActionToken = (input: {
  runId: string;
  period: string;
  stageId: PayrollApprovalStageId;
  decision: PayrollEmailDecision;
  recipientEmail: string;
  recipientUsername: string;
  ttlDays?: number;
}) => {
  const payload: PayrollEmailActionPayload = {
    runId: compact(input.runId) ? String(input.runId).trim() : '',
    period: String(input.period || '').trim(),
    stageId: input.stageId,
    decision: input.decision,
    recipientEmail: compact(input.recipientEmail),
    recipientUsername: compact(input.recipientUsername),
    exp: Date.now() + ((input.ttlDays ?? 7) * 24 * 60 * 60 * 1000),
  };
  if (!payload.runId || !payload.period || !payload.recipientEmail || !payload.recipientUsername) {
    throw new Error('Payroll email action token requires runId, period, recipientEmail, and recipientUsername.');
  }
  const encoded = base64UrlEncode(JSON.stringify(payload));
  return `${encoded}.${sign(encoded)}`;
};

export const verifyPayrollEmailActionToken = (token: string) => {
  const [encoded, signature] = String(token || '').split('.');
  if (!encoded || !signature || sign(encoded) !== signature) throw new Error('Approval link is invalid or has been tampered with.');
  const payload = JSON.parse(base64UrlDecode(encoded)) as PayrollEmailActionPayload;
  if (!payload?.runId || !payload.period || !payload.recipientEmail || !payload.recipientUsername || !payload.decision || !payload.stageId) {
    throw new Error('Approval link is invalid.');
  }
  if (payload.exp < Date.now()) throw new Error('Approval link has expired. Sign in to the payroll approval workspace to action this request.');
  if (!['approve', 'reject'].includes(payload.decision)) throw new Error('Approval link is invalid.');
  return payload;
};

export const portalBaseUrl = (input?: string | null) => resolvePublicAppOrigin(input);

export const payrollAuthorizePageUrl = (token: string, baseUrl?: string | null) =>
  `${portalBaseUrl(baseUrl)}/hris/payroll/payroll-approval/authorize?token=${encodeURIComponent(token)}`;

export const payrollApprovalWorkspaceUrl = (period: string, baseUrl?: string | null) =>
  `${portalBaseUrl(baseUrl)}/hris/payroll/payroll-approval?period=${encodeURIComponent(period)}`;

export const payrollBankFinanceWorkspaceUrl = (period: string, baseUrl?: string | null) =>
  `${portalBaseUrl(baseUrl)}/hris/payroll-management/bank-finance?tab=bank-schedule&period=${encodeURIComponent(period)}`;

export const payrollBankScheduleDownloadUrl = (period: string, baseUrl?: string | null) =>
  `${portalBaseUrl(baseUrl)}/api/hris/payroll-management?format=xls&report=bank-schedule&period=${encodeURIComponent(period)}`;
