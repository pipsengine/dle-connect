import type { SessionPayload } from '@/lib/auth/session';
import { hasAnyPermission } from '@/lib/auth/permission-match';

type SessionLike = Pick<SessionPayload, 'roles' | 'permissions' | 'isGlobalAdmin' | 'department' | 'unit'> & {
  fullName?: string;
  username?: string;
  sub?: string;
};

const isHrPortalUser = (session: SessionLike) => {
  if (session.isGlobalAdmin || (session.roles || []).includes('Super Administrator')) return true;
  const roles = session.roles || [];
  if (roles.some((role) =>
    /^(HR |Human Resource|HRIS)/i.test(role)
    || /HR Administrator|HR Manager|HR Director|HR Officer|Recruitment Officer|Onboarding Officer|Offboarding Officer|Employee Records Officer/i.test(role),
  )) {
    return true;
  }
  const text = `${session.department || ''} ${session.unit || ''}`.toLowerCase();
  return /\bhr\b/.test(text) || text.includes('human resources') || text.includes('human resource') || text.includes('human capital');
};

/** Recruitment Management — HR / Recruitment Officer / admins only (not general employees). */
export const canAccessRecruitment = (session: SessionLike | null | undefined) => {
  if (!session) return false;
  if (session.isGlobalAdmin || (session.roles || []).includes('Super Administrator')) return true;
  if (isHrPortalUser(session)) return true;
  const roles = session.roles || [];
  if (roles.some((role) => /Recruitment|Talent Acquisition|Hiring/i.test(role))) return true;
  return hasAnyPermission(session.permissions || [], [
    'recruitment.*',
    'recruitment.view',
    'recruitment.manage',
    'page.hris.recruitment.view',
  ]);
};

export const assertRecruitmentAccess = (session: SessionLike | null | undefined) => {
  if (!canAccessRecruitment(session)) {
    throw new Error('You do not have access to Recruitment Management.');
  }
};
