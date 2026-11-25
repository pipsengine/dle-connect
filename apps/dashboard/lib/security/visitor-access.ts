import { isItDepartmentEmployee } from '@/lib/access/projects-engineering-access';
import { isSuperActor } from '@/lib/auth/role-delegation';
import type { SessionPayload } from '@/lib/auth/session';

export type VisitorAccess = {
  seesAll: boolean;
  canSecurity: boolean;
  canReception: boolean;
  employeeCode: string;
  name: string;
  department: string;
  email: string;
};

const textOf = (...values: Array<string | undefined>) => values.filter(Boolean).join(' ');

export const resolveVisitorAccess = (session: Pick<SessionPayload, 'fullName' | 'username' | 'employeeCode' | 'department' | 'roles' | 'permissions' | 'isGlobalAdmin' | 'sub'> & { email?: string }): VisitorAccess => {
  const department = String(session.department || '');
  const roles = session.roles || [];
  const identity = textOf(department, ...roles);
  const unrestricted = Boolean(session.isGlobalAdmin) || isSuperActor(session);
  const securityManager = /security\s*manager/i.test(identity);
  const security = /security/i.test(identity) || securityManager;
  const reception = /reception/i.test(identity);
  const itDepartment = isItDepartmentEmployee({ department, roles, permissions: session.permissions, isGlobalAdmin: false });
  return {
    seesAll: unrestricted || security || reception || itDepartment,
    canSecurity: unrestricted || security,
    canReception: unrestricted || reception,
    employeeCode: String(session.employeeCode || ''),
    name: String(session.fullName || session.username || 'Employee'),
    department,
    email: String(session.email || ''),
  };
};

export const emptyVisitorAccess = (): VisitorAccess => ({
  seesAll: false,
  canSecurity: false,
  canReception: false,
  employeeCode: '',
  name: '',
  department: '',
  email: '',
});
