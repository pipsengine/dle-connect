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

/** Mrs Nnenna Joy Nworgu, Front Desk Officer — the site receptionist. */
const RECEPTIONIST_EMPLOYEE_CODES = new Set(['P0295']);

const isAdministrator = (roles: string[]) => roles.some((role) => {
  const value = role.trim();
  return /^admin$/i.test(value) || /administrator/i.test(value);
});

export const resolveVisitorAccess = (session: Pick<SessionPayload, 'fullName' | 'username' | 'employeeCode' | 'department' | 'roles' | 'permissions' | 'isGlobalAdmin' | 'sub'> & { email?: string }): VisitorAccess => {
  const department = String(session.department || '');
  const roles = session.roles || [];
  const name = String(session.fullName || session.username || 'Employee');
  const employeeCode = String(session.employeeCode || '').toUpperCase();
  const identity = textOf(department, ...roles, name);
  const admin = Boolean(session.isGlobalAdmin) || isSuperActor(session) || isAdministrator(roles);
  const security = roles.includes('Visitor Security') || /\bsecurity\b/i.test(textOf(department, ...roles));
  const reception = roles.includes('Visitor Reception')
    || RECEPTIONIST_EMPLOYEE_CODES.has(employeeCode)
    || /nnenna\s+joy\s+nworgu/i.test(name)
    || /\breception/i.test(identity)
    || /front\s*desk/i.test(identity);
  const itDepartment = isItDepartmentEmployee({ department, roles, permissions: session.permissions, isGlobalAdmin: false });
  return {
    seesAll: admin || security || reception || itDepartment,
    canSecurity: admin || security,
    canReception: admin || reception,
    employeeCode,
    name,
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
