import crypto from 'node:crypto';

export type LeaveEmailDecision = 'approve' | 'reject';
export type LeaveEmailApproverKind = 'line-manager' | 'hr';

export type LeaveEmailActionPayload = {
  requestId: string;
  decision: LeaveEmailDecision;
  recipientEmail: string;
  recipientUsername: string;
  approverKind: LeaveEmailApproverKind;
  exp: number;
};

const secret = () => process.env.AUTH_SESSION_SECRET || process.env.NEXTAUTH_SECRET || 'dle-development-session-secret-change-before-production';
const compact = (value: unknown) => String(value || '').trim().toLowerCase();

const base64UrlEncode = (value: string) => Buffer.from(value, 'utf8').toString('base64url');
const base64UrlDecode = (value: string) => Buffer.from(value, 'base64url').toString('utf8');

const sign = (payload: string) => crypto.createHmac('sha256', secret()).update(payload).digest('base64url');

export const createLeaveEmailActionToken = (input: {
  requestId: string;
  decision: LeaveEmailDecision;
  recipientEmail: string;
  recipientUsername: string;
  approverKind: LeaveEmailApproverKind;
  ttlDays?: number;
}) => {
  const payload: LeaveEmailActionPayload = {
    requestId: compact(input.requestId) ? String(input.requestId).trim() : '',
    decision: input.decision,
    recipientEmail: compact(input.recipientEmail),
    recipientUsername: compact(input.recipientUsername),
    approverKind: input.approverKind,
    exp: Date.now() + ((input.ttlDays ?? 7) * 24 * 60 * 60 * 1000),
  };
  if (!payload.requestId || !payload.recipientEmail || !payload.recipientUsername) {
    throw new Error('Leave email action token requires requestId, recipientEmail, and recipientUsername.');
  }
  const encoded = base64UrlEncode(JSON.stringify(payload));
  return `${encoded}.${sign(encoded)}`;
};

export const verifyLeaveEmailActionToken = (token: string) => {
  const [encoded, signature] = String(token || '').split('.');
  if (!encoded || !signature || sign(encoded) !== signature) throw new Error('Approval link is invalid or has been tampered with.');
  const payload = JSON.parse(base64UrlDecode(encoded)) as LeaveEmailActionPayload;
  if (!payload?.requestId || !payload.recipientEmail || !payload.recipientUsername || !payload.decision || !payload.approverKind) {
    throw new Error('Approval link is invalid.');
  }
  if (payload.exp < Date.now()) throw new Error('Approval link has expired. Sign in to the leave workspace to action this request.');
  if (!['approve', 'reject'].includes(payload.decision)) throw new Error('Approval link is invalid.');
  if (!['line-manager', 'hr'].includes(payload.approverKind)) throw new Error('Approval link is invalid.');
  return payload;
};

export const portalBaseUrl = (input?: string | null) => {
  const value = String(input || process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3020').trim();
  return value.replace(/\/$/, '') || 'http://localhost:3020';
};

/** @deprecated Use leaveAuthorizePageUrl for authenticated approval flow */
export const leaveEmailActionUrl = (token: string, baseUrl?: string | null) =>
  `${portalBaseUrl(baseUrl)}/api/workforce-portal/leave-email-action?token=${encodeURIComponent(token)}`;

export const leaveAuthorizePageUrl = (token: string, baseUrl?: string | null) =>
  `${portalBaseUrl(baseUrl)}/workforce-portal/leave-approval/authorize?token=${encodeURIComponent(token)}`;

export const leavePortalUrl = (baseUrl?: string | null) =>
  `${portalBaseUrl(baseUrl)}/workforce-portal?tab=leave`;

export const overtimeAuthorizePageUrl = (token: string, baseUrl?: string | null) =>
  `${portalBaseUrl(baseUrl)}/hris/workforce-management/overtime-management/authorize?token=${encodeURIComponent(token)}`;
