import { personNamesLooselyMatch } from '@/lib/person-name-match';

export type TelephoneNoticeAccount = {
  employeeCode?: string | null;
  username?: string | null;
  employeeId?: string | null;
  fullName?: string | null;
  email?: string | null;
  roles?: string[] | null;
  permissions?: string[] | null;
  status?: string | null;
  employmentStatus?: string | null;
  isGlobalAdmin?: boolean | null;
};

const ROLE_ALIASES: Record<string, string[]> = {
  'hr approver': ['hr manager', 'hr director', 'hr administrator'],
  md: ['executive director', 'executive management'],
  ceo: ['executive director', 'executive management'],
  executive: ['executive director', 'executive user', 'executive management'],
  treasury: ['treasury officer'],
  'treasury officer': ['treasury officer'],
  finance: ['finance manager', 'treasury officer'],
};

/** Stage permissions. Wildcard `*` is never treated as a match, so Super Administrator does not receive every handoff. */
const STAGE_PERMISSIONS: Record<string, string[]> = {
  'hr approver': ['telephone-allowance.hr-approve'],
  md: ['telephone-allowance.md-approve'],
  ceo: ['telephone-allowance.md-approve'],
  executive: ['telephone-allowance.md-approve'],
  cfo: ['telephone-allowance.cfo-authorize'],
  treasury: ['telephone-allowance.treasury', 'finance.treasury.operate'],
  'treasury officer': ['telephone-allowance.treasury', 'finance.treasury.operate'],
  finance: ['telephone-allowance.treasury', 'finance.treasury.operate'],
};

const compact = (value: unknown) => String(value ?? '').trim();

export const accountCanReceiveTelephoneNotice = (user: TelephoneNoticeAccount) => {
  const status = `${user.status || ''} ${user.employmentStatus || ''}`;
  return !/inactive|terminated|resigned|disabled|locked/i.test(status);
};

const acceptedRoles = (needed: string) => {
  const key = needed.toLowerCase().trim();
  return [key, ...(ROLE_ALIASES[key] || [])];
};

export const accountMatchesTelephoneRoles = (user: TelephoneNoticeAccount, needed: string[]) => {
  if (!needed.length) return false;
  const roles = (user.roles || []).map((role) => role.toLowerCase().trim()).filter(Boolean);
  const permissions = new Set((user.permissions || []).map((permission) => permission.toLowerCase()));
  const unrestricted = permissions.has('*') || Boolean(user.isGlobalAdmin);
  return needed.some((need) => {
    const accepted = acceptedRoles(need);
    if (roles.some((role) => accepted.includes(role))) return true;
    if (unrestricted) return false;
    const stagePermissions = STAGE_PERMISSIONS[need.toLowerCase().trim()] || [];
    return stagePermissions.some((permission) => permissions.has(permission));
  });
};

export const accountMatchesTelephoneIdentity = (user: TelephoneNoticeAccount, identity: string) => {
  const needle = compact(identity).toLowerCase();
  if (!needle) return false;
  const codes = [user.employeeCode, user.username, user.employeeId]
    .map((value) => compact(value).toLowerCase())
    .filter(Boolean);
  if (codes.includes(needle)) return true;
  return personNamesLooselyMatch(user.fullName || '', identity);
};
