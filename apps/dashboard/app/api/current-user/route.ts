import { NextResponse } from 'next/server';
import type { DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import { payrollDataSourceInfo, readPayrollEmployees } from '@/lib/payroll-employee-source';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { listEnterpriseNotifications } from '@/lib/enterprise-notifications-store';

type CurrentUserContext = 'enterprise' | 'hris' | 'ess';

const contexts = new Set<CurrentUserContext>(['enterprise', 'hris', 'ess']);
const compact = (value: unknown) => String(value || '').trim();

const envFirst = (...keys: string[]) => {
  for (const key of keys.filter(Boolean)) {
    const value = compact(process.env[key]);
    if (value) return value;
  }
  return '';
};

const headerFirst = (request: Request, ...keys: string[]) => {
  for (const key of keys) {
    const value = compact(request.headers.get(key));
    if (value) return value;
  }
  return '';
};

const cookieMap = (request: Request) => {
  const raw = request.headers.get('cookie') || '';
  return raw.split(';').reduce((map, pair) => {
    const [key, ...rest] = pair.split('=');
    const name = compact(key);
    if (name) map.set(name, decodeURIComponent(rest.join('=')));
    return map;
  }, new Map<string, string>());
};

const cookieFirst = (request: Request, ...keys: string[]) => {
  const cookies = cookieMap(request);
  for (const key of keys) {
    const value = compact(cookies.get(key));
    if (value) return value;
  }
  return '';
};

const normalize = (value: unknown) => compact(value).toLowerCase();

const employeeKeys = (employee: DleEmployeeDirectoryRow) => [
  employee.employeeId,
  employee.employeeCode,
  employee.sourceEmployeeId,
  String(employee.employeeDbId || ''),
  employee.officialEmail,
  employee.email,
  employee.personalEmail,
].map(normalize).filter(Boolean);

const findEmployee = (employees: DleEmployeeDirectoryRow[], identities: string[]) => {
  const targets = identities.map(normalize).filter(Boolean);
  if (!targets.length) return null;
  return employees.find((employee) => {
    const keys = employeeKeys(employee);
    return targets.some((target) => keys.includes(target));
  }) || null;
};

const configuredEmployeeIdentities = (request: Request, context: CurrentUserContext) => {
  const prefix = context.toUpperCase();
  return [
    headerFirst(request, 'x-hris-employee-id', 'x-employee-code', 'x-employee-id'),
    headerFirst(request, 'x-forwarded-email', 'x-auth-request-email', 'x-user-email', 'x-ms-client-principal-name'),
    cookieFirst(request, 'hrisEmployeeId', 'currentEmployeeId', 'employeeId', 'essEmployeeId', 'currentUserEmail'),
    envFirst(
      `${prefix}_USER_EMPLOYEE_CODE`,
      `${prefix}_EMPLOYEE_ID`,
      `${prefix}_USER_EMAIL`,
      'CURRENT_USER_EMPLOYEE_CODE',
      'CURRENT_EMPLOYEE_ID',
      'CURRENT_USER_EMAIL'
    ),
  ].filter(Boolean);
};

const profileHref = (context: CurrentUserContext, employee: DleEmployeeDirectoryRow | null) => {
  if (context === 'ess') return '/workforce-portal?tab=profile';
  if (employee?.employeeCode || employee?.employeeId) {
    return `/hris/employees/employee-profile/${encodeURIComponent(employee.employeeCode || employee.employeeId)}`;
  }
  return context === 'hris' ? '/hris/employees/employee-profile' : '/dashboard';
};

const sameIdentity = (a: unknown, b: unknown) => normalize(a) && normalize(a) === normalize(b);

const isActiveEmployee = (employee: DleEmployeeDirectoryRow) => !normalize(employee.status).match(/terminated|resigned|retired|inactive|deceased|suspended/);

const teamMembersFor = (employees: DleEmployeeDirectoryRow[], employee: DleEmployeeDirectoryRow | null) => {
  if (!employee) return [];
  return employees.filter((row) => {
    if (sameIdentity(row.employeeCode, employee.employeeCode) || sameIdentity(row.employeeId, employee.employeeId)) return false;
    return (
      sameIdentity(row.managerName, employee.fullName) ||
      sameIdentity(row.managerName, employee.employeeCode) ||
      sameIdentity(row.functionalManager, employee.fullName) ||
      sameIdentity(row.departmentHead, employee.fullName)
    );
  });
};

const availabilityStatus = (employee: DleEmployeeDirectoryRow | null) => {
  const status = normalize(employee?.status);
  if (status.includes('leave')) return 'On Leave';
  if (status.includes('suspend')) return 'Suspended';
  if (status.includes('inactive') || status.includes('terminated') || status.includes('resigned') || status.includes('retired')) return 'Offline';
  return 'Online';
};

const rbacRole = (employee: DleEmployeeDirectoryRow | null, teamSize: number) => {
  const title = normalize(`${employee?.jobTitle || ''} ${employee?.designation || ''}`);
  if (title.match(/director|chief|executive|md|ceo|cfo|coo/)) return 'Executive';
  if (teamSize > 0 || title.match(/manager|lead|head|supervisor/)) return 'Manager';
  return 'Employee';
};

const displayJobTitle = (employee: DleEmployeeDirectoryRow | null) => {
  const title = compact(employee?.jobTitle || employee?.designation);
  return title.replace(/^[A-Z]{2,}\d{1,4}\s*-\s*/i, '').trim() || 'Identity setup required';
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const contextParam = compact(url.searchParams.get('context')).toLowerCase();
  const context = contexts.has(contextParam as CurrentUserContext) ? contextParam as CurrentUserContext : 'enterprise';
  const token = cookieFirst(request, AUTH_COOKIE);
  const session = await verifySessionToken(token);
  const notificationCount = session ? (await listEnterpriseNotifications(session, 'all')).counts.unread : 0;

  const employeeSource = await readPayrollEmployees();
  if (session?.isGlobalAdmin) {
    return NextResponse.json({
      status: 'success',
      data: {
        name: session.fullName,
        role: 'Emergency System Administration',
        employeeCode: 'Admin',
        department: 'System Administration',
        photoUrl: '/brand/dorman-long-logo.jpg',
        profileHref: '/hris/administration/user-management/user-accounts',
        email: '',
        grade: 'System',
        location: 'Application Level',
        employmentStatus: 'Active',
        dateJoined: '',
        yearsOfService: 0,
        reportingManager: 'Protected global account',
        availabilityStatus: 'Online',
        onlineStatus: 'Online',
        notificationCount,
        pendingApprovals: 0,
        teamSize: 0,
        rbacRole: 'Super Administrator',
        linked: false,
        source: 'application-level-global-admin',
        employeeSource: payrollDataSourceInfo(employeeSource),
      },
    });
  }

  const sessionIdentities = [session?.employeeCode, session?.employeeId, session?.username].filter(Boolean) as string[];
  const configuredIdentities = session ? sessionIdentities : configuredEmployeeIdentities(request, context);
  const configuredEmployee = findEmployee(employeeSource.employees, configuredIdentities);
  const employee = configuredEmployee;
  const linked = Boolean(employee);
  const teamMembers = teamMembersFor(employeeSource.employees, employee);
  const activeTeamMembers = teamMembers.filter(isActiveEmployee);
  const role = rbacRole(employee, teamMembers.length);
  const pendingApprovals = role === 'Employee' || activeTeamMembers.length === 0 ? 0 : Math.min(24, Math.ceil(activeTeamMembers.length / 4));

  return NextResponse.json({
    status: 'success',
    data: {
      name: employee?.fullName || 'Employee Identity Not Linked',
      role: displayJobTitle(employee),
      employeeCode: employee?.employeeCode || employee?.employeeId || 'UNLINKED',
      department: employee?.department || employee?.businessUnit || 'No employee record resolved',
      photoUrl: envFirst(`${context.toUpperCase()}_USER_PHOTO_URL`, 'CURRENT_USER_PHOTO_URL') || '/brand/dorman-long-logo.jpg',
      profileHref: profileHref(context, employee),
      email: employee?.officialEmail || employee?.email || employee?.personalEmail || '',
      grade: employee?.salaryGrade || employee?.jobGrade || 'Unassigned',
      location: employee?.workLocation || employee?.location || employee?.officeLocation || 'Unassigned',
      employmentStatus: employee?.status || 'Unknown',
      dateJoined: employee?.dateJoined || '',
      yearsOfService: employee?.yearsOfService ?? 0,
      reportingManager: employee?.managerName || employee?.functionalManager || employee?.departmentHead || 'Not assigned',
      availabilityStatus: availabilityStatus(employee),
      onlineStatus: availabilityStatus(employee) === 'Online' ? 'Online' : 'Offline',
      notificationCount,
      pendingApprovals,
      teamSize: activeTeamMembers.length,
      rbacRole: role,
      linked,
      source: linked ? employeeSource.source : 'unlinked',
      employeeSource: payrollDataSourceInfo(employeeSource),
    },
  });
}
