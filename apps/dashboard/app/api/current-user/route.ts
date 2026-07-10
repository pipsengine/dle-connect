import { NextResponse } from 'next/server';
import type { DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import { countDirectReportsFromEmployees, payrollDataSourceInfo, readDirectoryEmployees } from '@/lib/payroll-employee-source';
import { pendingLeaveApprovalsForActor, loadWorkflowLeaveRequests } from '@/lib/leave-workflow-service';
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

const linkedEmployeePhotoUrl = (employee: DleEmployeeDirectoryRow | null) => {
  const code = compact(employee?.employeeCode || employee?.employeeId);
  if (!employee || !code) return '';
  return `/api/hris/employees/${encodeURIComponent(code)}/photo`;
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
  const notificationCount = session ? await listEnterpriseNotifications(session, 'all').then((result) => result.counts.unread).catch(() => 0) : 0;

  const sessionIdentities = [session?.employeeCode, session?.employeeId, session?.username, session?.fullName].filter(Boolean) as string[];
  const configuredIdentities = session ? sessionIdentities : configuredEmployeeIdentities(request, context);

  const employeeSource = await readDirectoryEmployees();
  const employee = findEmployee(employeeSource.employees, configuredIdentities.length ? configuredIdentities : sessionIdentities);

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
        employeeSource: payrollDataSourceInfo(employeeSource || { employees: [], source: 'DLE_Enterprise HRIS', databaseAvailable: true, warning: null }),
      },
    });
  }

  const linked = Boolean(employee);
  const activeTeamSize = employee ? countDirectReportsFromEmployees(employeeSource.employees, employee) : 0;
  const role = employee ? rbacRole(employee, activeTeamSize) : session?.roles?.[0] || 'Employee';
  const sessionRoles = (session?.roles || []).map((role) => normalize(role));
  const sessionIsApprover = sessionRoles.some((role) =>
    /super\s*admin|system\s*admin|manager|supervisor|head|hr|leave administrator/.test(role),
  );
  let pendingApprovals = 0;
  if (employee && session && (activeTeamSize > 0 || role !== 'Employee' || sessionIsApprover)) {
    try {
      const allRequests = await loadWorkflowLeaveRequests({ repair: true });
      const leaveApprovals = pendingLeaveApprovalsForActor(
        employee,
        allRequests,
        employeeSource.employees,
        session.roles || [],
        session.isGlobalAdmin,
      );
      pendingApprovals = leaveApprovals.length;
    } catch {
      pendingApprovals = activeTeamSize > 0 ? Math.min(24, Math.ceil(activeTeamSize / 4)) : 0;
    }
  }
  const sessionCode = compact(session?.employeeCode || session?.employeeId || session?.username);
  const sessionRole = compact(session?.roles?.[0]) || 'Signed-in User';
  const sessionDepartment = compact(session?.department || session?.unit) || 'Application Access';

  return NextResponse.json({
    status: 'success',
    data: {
      name: employee?.fullName || session?.fullName || session?.username || 'Signed-in User',
      role: employee ? displayJobTitle(employee) : sessionRole,
      employeeCode: employee?.employeeCode || employee?.employeeId || sessionCode || 'SIGNED-IN',
      department: employee?.department || employee?.businessUnit || sessionDepartment,
      photoUrl: linkedEmployeePhotoUrl(employee) || envFirst(`${context.toUpperCase()}_USER_PHOTO_URL`, 'CURRENT_USER_PHOTO_URL') || '',
      hasPhoto: employee?.hasPhoto === true,
      profileHref: employee ? profileHref(context, employee) : '/hris/administration/user-management/user-accounts',
      email: employee?.officialEmail || employee?.email || employee?.personalEmail || '',
      grade: employee?.salaryGrade || employee?.jobGrade || 'Unassigned',
      location: employee?.workLocation || employee?.location || employee?.officeLocation || 'Unassigned',
      employmentStatus: employee?.status || session?.status || 'Active',
      dateJoined: employee?.dateJoined || '',
      yearsOfService: employee?.yearsOfService ?? 0,
      reportingManager: employee?.managerName || employee?.functionalManager || employee?.departmentHead || 'Not assigned',
      availabilityStatus: availabilityStatus(employee),
      onlineStatus: employee ? (availabilityStatus(employee) === 'Online' ? 'Online' : 'Offline') : 'Online',
      notificationCount,
      pendingApprovals,
      teamSize: activeTeamSize,
      rbacRole: role,
      linked,
      source: linked ? (employeeSource?.source || 'DLE_Enterprise HRIS') : 'unlinked',
      employeeSource: payrollDataSourceInfo(employeeSource || { employees: employee ? [employee] : [], source: 'DLE_Enterprise HRIS', databaseAvailable: true, warning: null }),
    },
  });
}
