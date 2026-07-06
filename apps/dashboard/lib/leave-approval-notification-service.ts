import { readUsers } from '@/lib/auth/auth-store';
import type { SessionPayload } from '@/lib/auth/session';

const lower = (value: unknown) => String(value || '').trim().toLowerCase();

export const sessionMatchesLeaveToken = async (
  session: SessionPayload,
  payload: { recipientEmail: string; recipientUsername: string },
) => {
  if (session.isGlobalAdmin) return true;
  const users = await readUsers();
  const user = users.find((item) => item.id === session.sub || item.username === session.username);
  const tokenEmail = lower(payload.recipientEmail);
  const tokenUsername = lower(payload.recipientUsername);
  return lower(user?.email) === tokenEmail
    || lower(session.username) === tokenUsername
    || lower(user?.username) === tokenUsername;
};
