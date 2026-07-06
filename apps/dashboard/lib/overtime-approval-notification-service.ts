import { readUsers } from '@/lib/auth/auth-store';
import type { SessionPayload } from '@/lib/auth/session';

const lower = (value: unknown) => String(value || '').trim().toLowerCase();

export const sessionMatchesOvertimeToken = async (
  session: SessionPayload,
  payload: { recipientEmail: string | null; recipientName: string },
) => {
  if (session.isGlobalAdmin) return true;
  const users = await readUsers();
  const user = users.find((item) => item.id === session.sub || item.username === session.username);
  const tokenEmail = lower(payload.recipientEmail);
  const tokenName = lower(payload.recipientName);
  if (tokenEmail && lower(user?.email) === tokenEmail) return true;
  if (tokenEmail && lower(session.username) === tokenEmail) return true;
  return tokenName && (
    lower(session.fullName) === tokenName
    || lower(user?.fullName) === tokenName
    || lower(session.username) === tokenName
  );
};

export type OvertimeApprovalStage = 'project-manager' | 'gm-operations' | 'hr';

export const expectedOvertimeStatusForStage = (stage: OvertimeApprovalStage) => {
  if (stage === 'project-manager') return 'Submitted';
  if (stage === 'gm-operations') return 'Project Manager Approved';
  return 'GM Operations Approved';
};

export const overtimeStageLabel = (stage: OvertimeApprovalStage) => {
  if (stage === 'project-manager') return 'Project Manager';
  if (stage === 'gm-operations') return 'GM Operations';
  return 'HR Manager';
};
