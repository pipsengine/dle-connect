import { NextRequest, NextResponse } from 'next/server';
import { permissionsForRequest } from '@/lib/auth/request-permissions';
import {
  applyOvertimeAction,
  createOvertimeRequest,
  normalizeOvertimeRole,
  overtimeCsv,
  readOvertimeEmployeeAttendance,
  readOvertimeManagementPayload,
  type OvertimeAction,
} from '@/lib/overtime-management-store';
import {
  actOnOvertimeAuthorizationRequest,
  bulkActOnOvertimeAuthorizationRequests,
  createOvertimeAuthorizationRequest,
  listOvertimeAuthorizationRequests,
} from '@/lib/overtime-approval-workflow-store';
import { resolveWorkflowLinkOriginFromRequest } from '@/lib/public-app-url';

const ok = <T,>(data: T) => NextResponse.json({ status: 'success', data });
const err = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });

const permissionsFromRequest = (request: NextRequest) =>
  (request.headers.get('x-auth-permissions') || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const hasPermission = (permissions: string[], required: string) => {
  if (permissions.includes('*')) return true;
  if (permissions.includes(required)) return true;
  const [module] = required.split('.');
  return permissions.includes(`${module}.*`);
};

const hasAnyPermission = (request: NextRequest, required: string[], permissions?: string[]) => {
  if (request.headers.get('x-auth-global-admin') === '1') return true;
  const active = permissions ?? permissionsFromRequest(request);
  return required.some((permission) => hasPermission(active, permission));
};

const canUseOvertimeOverride = (request: NextRequest, permissions?: string[]) => hasAnyPermission(request, ['overtime.authorization.override.override'], permissions);

const canActOnAuthorization = (request: NextRequest, decision: 'approve' | 'reject', permissions?: string[]) =>
  canUseOvertimeOverride(request, permissions) ||
  hasAnyPermission(request, [
    `overtime.authorization.${decision}`,
    `overtime.authorization.project-manager.${decision}`,
    `overtime.authorization.md.${decision}`,
    'workforce.manage',
  ], permissions);

const isSuperAdministrator = (request: NextRequest, role: string, permissions?: string[]) => {
  if (role === 'Super Administrator' || role === 'Administrator') return true;
  if (request.headers.get('x-auth-global-admin') === '1') return true;
  return canUseOvertimeOverride(request, permissions);
};

/**
 * Testing-phase escalation: allow the super administrator to approve an overtime
 * request through the full workflow chain in a single action. The workflow store
 * recognises the "Super Administrator" actor and advances Submitted → HR Approved.
 */
const resolveAuthorizationActor = (request: NextRequest, role: string, bodyActor: unknown, permissions?: string[]) =>
  isSuperAdministrator(request, role, permissions)
    ? 'Super Administrator'
    : bodyActor
      ? String(bodyActor)
      : role;

const applyAccessToPayload = <T extends { permissions: Record<string, boolean> }>(payload: T, request: NextRequest, permissions: string[]): T => ({
  ...payload,
  permissions: {
    ...payload.permissions,
    canSubmit: payload.permissions.canSubmit && hasAnyPermission(request, ['overtime.authorization.create', 'overtime.authorization.submit', 'workforce.manage', 'operations.timesheets.submit'], permissions),
    canSupervisorApprove: payload.permissions.canSupervisorApprove && hasAnyPermission(request, ['overtime.authorization.approve', 'overtime.authorization.project-manager.approve', 'workforce.manage', 'operations.timesheets.approve'], permissions),
    canHrApprove: payload.permissions.canHrApprove && hasAnyPermission(request, ['overtime.authorization.approve', 'overtime.authorization.md.approve', 'workforce.manage', 'operations.timesheets.approve'], permissions),
    canPayroll: payload.permissions.canPayroll && hasAnyPermission(request, ['overtime.authorization.release', 'overtime.authorization.post', 'workforce.manage', 'operations.timesheets.approve'], permissions),
    canExport: payload.permissions.canExport && hasAnyPermission(request, ['overtime.authorization.export', 'workforce.manage', 'operations.timesheets.export'], permissions),
    canViewMoney: payload.permissions.canViewMoney && hasAnyPermission(request, ['overtime.authorization.view', 'payroll.view', 'workforce.manage'], permissions),
    canAudit: payload.permissions.canAudit && hasAnyPermission(request, ['overtime.authorization.audit', 'workforce.manage'], permissions),
  },
});

export async function GET(request: NextRequest) {
  try {
    const livePermissions = await permissionsForRequest(request);
    const role = normalizeOvertimeRole(request.headers.get('x-hris-role') || request.nextUrl.searchParams.get('role'));
    const attendanceDate = String(request.nextUrl.searchParams.get('attendanceDate') || '').trim();
    const employeeCodesParam = String(request.nextUrl.searchParams.get('employeeCodes') || '').trim();
    if (attendanceDate && employeeCodesParam) {
      if (!hasAnyPermission(request, ['overtime.authorization.create', 'overtime.authorization.submit', 'overtime.authorization.view', 'workforce.manage', 'operations.timesheets.submit'], livePermissions)) {
        return err(403, 'Permission denied.');
      }
      const employeeCodes = employeeCodesParam.split(',').map((item) => item.trim()).filter(Boolean);
      const attendance = await readOvertimeEmployeeAttendance(attendanceDate, employeeCodes);
      return ok({ workDate: attendanceDate, attendance });
    }
    const [payload, authorizationRequests] = await Promise.all([
      readOvertimeManagementPayload(role),
      listOvertimeAuthorizationRequests().catch(() => []),
    ]);
    const data = applyAccessToPayload({ ...payload, authorizationRequests }, request, livePermissions);
    if (request.nextUrl.searchParams.get('format') === 'csv') {
      if (!hasAnyPermission(request, ['overtime.authorization.export', 'workforce.manage', 'operations.timesheets.export'], livePermissions)) return err(403, 'Permission denied.');
      if (!data.permissions.canExport) return err(403, 'Permission denied.');
      return new Response(overtimeCsv(data.records, data.permissions.canViewMoney), {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': 'attachment; filename="overtime-management.csv"',
        },
      });
    }
    return ok(data);
  } catch (error) {
    return err(500, error instanceof Error ? error.message : 'Unable to load overtime management.');
  }
}

export async function POST(request: NextRequest) {
  try {
    const livePermissions = await permissionsForRequest(request);
    const role = normalizeOvertimeRole(request.headers.get('x-hris-role') || 'HR Manager');
    const body = await request.json().catch(() => ({}));
    const id = String(body.id || '').trim();
    const action = String(body.action || '').trim() as OvertimeAction;
    const baseUrl = resolveWorkflowLinkOriginFromRequest(request);
    if (String(body.action || '').trim() === 'create-authorization') {
      if (!hasAnyPermission(request, ['overtime.authorization.create', 'overtime.authorization.submit', 'workforce.manage', 'operations.timesheets.submit'], livePermissions)) return err(403, 'Permission denied.');
      const projectEntries = Array.isArray(body.projects) && body.projects.length
        ? body.projects.map((item: Record<string, unknown>) => ({
            projectCode: String(item.projectCode || '').trim(),
            projectName: String(item.projectName || '').trim(),
            projectManagerName: String(item.projectManagerName || '').trim(),
            projectManagerEmail: String(item.projectManagerEmail || '').trim(),
            employees: Array.isArray(item.employees) ? item.employees : body.employees,
          }))
        : [{
            projectCode: String(body.projectCode || '').trim(),
            projectName: String(body.projectName || '').trim(),
            projectManagerName: String(body.projectManagerName || '').trim(),
            projectManagerEmail: String(body.projectManagerEmail || '').trim(),
            employees: body.employees,
          }];
      if (!projectEntries.some((item: { projectCode: string }) => item.projectCode)) return err(400, 'Select at least one project.');

      const employeeCodes = Array.from(new Set(
        projectEntries.flatMap((entry: { employees?: unknown }) =>
          Array.isArray(entry.employees)
            ? entry.employees.map((line: Record<string, unknown>) => String(line.employeeCode || '').trim()).filter(Boolean)
            : [],
        ),
      )) as string[];
      const attendance = await readOvertimeEmployeeAttendance(String(body.workDate || ''), employeeCodes);
      const attendanceByCode = new Map(attendance.map((item) => [item.employeeCode.toLowerCase(), item]));
      const hoursByEmployee = new Map<string, number>();
      for (const entry of projectEntries) {
        for (const line of Array.isArray(entry.employees) ? entry.employees : []) {
          const code = String((line as Record<string, unknown>).employeeCode || '').trim().toLowerCase();
          const hours = Number((line as Record<string, unknown>).overtimeHours || 0);
          if (!code || !(hours > 0)) continue;
          hoursByEmployee.set(code, (hoursByEmployee.get(code) || 0) + hours);
        }
      }
      for (const [code, totalHours] of hoursByEmployee) {
        const row = attendanceByCode.get(code);
        if (!row || row.biometricDuration <= 0) continue;
        const available = Math.max(0, Math.round((row.biometricDuration - row.usedHours) * 100) / 100);
        if (totalHours > available + 0.001) {
          return err(400, `Overtime for ${row.employeeCode} (${totalHours}h) exceeds available biometric headroom (${available}h = ${row.biometricDuration}h biometric − ${row.usedHours}h used).`);
        }
      }

      for (const entry of projectEntries) {
        if (!entry.projectCode) continue;
        await createOvertimeAuthorizationRequest({
          ...body,
          projectCode: entry.projectCode,
          projectName: entry.projectName || entry.projectCode,
          projectManagerName: entry.projectManagerName || body.projectManagerName,
          projectManagerEmail: entry.projectManagerEmail || body.projectManagerEmail,
          employees: entry.employees,
          portalBaseUrl: baseUrl,
        }, body.actor ? String(body.actor) : 'Production Manager');
      }
      const [payload, authorizationRequests] = await Promise.all([readOvertimeManagementPayload(role), listOvertimeAuthorizationRequests()]);
      return ok(applyAccessToPayload({ ...payload, authorizationRequests }, request, livePermissions));
    }
    if (String(body.action || '').trim() === 'bulk-approve-authorization' || String(body.action || '').trim() === 'bulk-reject-authorization') {
      const ids = Array.isArray(body.ids) ? body.ids.map((value: unknown) => String(value || '').trim()).filter(Boolean) : [];
      if (!ids.length) return err(400, 'Select at least one overtime authorization request.');
      const decision = String(body.action).startsWith('bulk-approve') ? 'approve' : 'reject';
      if (!isSuperAdministrator(request, role, livePermissions) && !canActOnAuthorization(request, decision, livePermissions)) return err(403, 'Permission denied.');
      const actor = resolveAuthorizationActor(request, role, body.actor, livePermissions);
      await bulkActOnOvertimeAuthorizationRequests(ids, decision, actor, body.comment ? String(body.comment) : null, baseUrl);
      const [payload, authorizationRequests] = await Promise.all([readOvertimeManagementPayload(role), listOvertimeAuthorizationRequests()]);
      return ok(applyAccessToPayload({ ...payload, authorizationRequests }, request, livePermissions));
    }
    if (String(body.action || '').trim() === 'approve-authorization' || String(body.action || '').trim() === 'reject-authorization') {
      if (!id) return err(400, 'Overtime authorization request is required.');
      const decision = String(body.action).startsWith('approve') ? 'approve' : 'reject';
      if (!isSuperAdministrator(request, role, livePermissions) && !canActOnAuthorization(request, decision, livePermissions)) return err(403, 'Permission denied.');
      const actor = resolveAuthorizationActor(request, role, body.actor, livePermissions);
      await actOnOvertimeAuthorizationRequest(
        id,
        decision,
        actor,
        body.comment ? String(body.comment) : null,
        baseUrl,
      );
      const [payload, authorizationRequests] = await Promise.all([readOvertimeManagementPayload(role), listOvertimeAuthorizationRequests()]);
      return ok(applyAccessToPayload({ ...payload, authorizationRequests }, request, livePermissions));
    }
    if (String(body.action || '').trim() === 'create-request') {
      if (!hasAnyPermission(request, ['overtime.authorization.create', 'overtime.authorization.submit', 'workforce.manage', 'operations.timesheets.submit'], livePermissions)) return err(403, 'Permission denied.');
      const payload = await createOvertimeRequest(body, role, body.actor ? String(body.actor) : role);
      const authorizationRequests = await listOvertimeAuthorizationRequests().catch(() => []);
      return ok(applyAccessToPayload({ ...payload, authorizationRequests }, request, livePermissions));
    }
    if (!id) return err(400, 'Overtime record is required.');
    if (!action) return err(400, 'Overtime action is required.');
    if (action === 'submit' && !hasAnyPermission(request, ['overtime.authorization.submit', 'workforce.manage', 'operations.timesheets.submit'], livePermissions)) return err(403, 'Permission denied.');
    if (['approve-supervisor', 'approve-hr', 'reject', 'return', 'reopen'].includes(action) && !hasAnyPermission(request, ['overtime.authorization.approve', 'overtime.authorization.reject', 'workforce.manage', 'operations.timesheets.approve'], livePermissions)) return err(403, 'Permission denied.');
    if (['mark-payroll-ready', 'post-payroll'].includes(action) && !hasAnyPermission(request, ['overtime.authorization.release', 'overtime.authorization.post', 'workforce.manage', 'operations.timesheets.approve'], livePermissions)) return err(403, 'Permission denied.');
    const payload = await applyOvertimeAction(id, action, role, body.actor ? String(body.actor) : role, body.comment ? String(body.comment) : null);
    const authorizationRequests = await listOvertimeAuthorizationRequests().catch(() => []);
    return ok(applyAccessToPayload({ ...payload, authorizationRequests }, request, livePermissions));
  } catch (error) {
    return err(500, error instanceof Error ? error.message : 'Unable to process overtime action.');
  }
}
