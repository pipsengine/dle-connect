import { canCreateProjects, type ProjectsSessionIdentity } from '@/lib/access/projects-engineering-access';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { withResolvedAccess } from '@/lib/auth/resolve-access-session';
import { isSuperActor } from '@/lib/auth/role-delegation';

const compact = (value: unknown) => String(value ?? '').trim();

const identityFromHeaders = (request: Request): ProjectsSessionIdentity => ({
  sub: compact(request.headers.get('x-auth-sub')) || undefined,
  username: compact(request.headers.get('x-auth-user')) || undefined,
  fullName: compact(request.headers.get('x-hris-actor')) || undefined,
  employeeCode: compact(request.headers.get('x-auth-employee-code')) || undefined,
  employeeId: compact(request.headers.get('x-auth-employee-id')) || undefined,
  department: compact(request.headers.get('x-auth-department')) || undefined,
  roles: (request.headers.get('x-auth-roles') || '').split(',').map((item) => item.trim()).filter(Boolean),
  permissions: (request.headers.get('x-auth-permissions') || '').split(',').map((item) => item.trim()).filter(Boolean),
  isGlobalAdmin: request.headers.get('x-auth-global-admin') === '1',
});

const cookieFrom = (request: Request) => {
  const raw = request.headers.get('cookie') || '';
  const match = raw.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${AUTH_COOKIE}=`));
  if (!match) return '';
  return decodeURIComponent(match.slice(AUTH_COOKIE.length + 1));
};

/** Prefer cookie session (authoritative), fall back to middleware headers. */
export const resolveTimesheetProjectRegistryIdentity = async (
  request: Request,
): Promise<ProjectsSessionIdentity | null> => {
  const session = await verifySessionToken(cookieFrom(request));
  if (session) {
    const resolved = withResolvedAccess(session);
    return {
      sub: resolved.sub,
      username: resolved.username,
      fullName: resolved.fullName,
      employeeCode: resolved.employeeCode,
      employeeId: resolved.employeeId,
      department: resolved.department,
      roles: resolved.roles || [],
      permissions: resolved.permissions || [],
      isGlobalAdmin: Boolean(resolved.isGlobalAdmin || isSuperActor(resolved)),
    };
  }
  const fromHeaders = identityFromHeaders(request);
  if (!fromHeaders.username && !fromHeaders.employeeCode && !fromHeaders.sub && !fromHeaders.isGlobalAdmin) {
    return null;
  }
  return {
    ...fromHeaders,
    isGlobalAdmin: Boolean(fromHeaders.isGlobalAdmin || isSuperActor(fromHeaders)),
  };
};

export const canManageTimesheetProjectRegistry = async (request: Request) => {
  const identity = await resolveTimesheetProjectRegistryIdentity(request);
  return canCreateProjects(identity);
};
