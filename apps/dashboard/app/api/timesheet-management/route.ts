import { NextResponse } from 'next/server';
import { hasPermission } from '@/lib/auth/permission-match';
import { resolveAccessContext } from '@/lib/hris-access';
import { decideCrewRemoval, readCrewSignals, requestCrewRemoval, saveTimesheetCrewAssignment, updateTimesheetCrewStatus } from '@/lib/timesheet-crew-store';
import {
  createTimesheetManagementPeriod,
  createTimesheetManagementRecord,
  readTimesheetManagementSnapshot,
  saveTimesheetManagementBookings,
  updateTimesheetManagementPeriod,
} from '@/lib/timesheet-management-store';

const ok = <T,>(data: T, status = 200) => NextResponse.json({ status: 'success', data }, { status });
const err = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });

const canUse = (request: Request) => {
  const permissions = (request.headers.get('x-auth-permissions') || '').split(',').map((item) => item.trim()).filter(Boolean);
  return hasPermission(permissions, 'view_timesheet_management') || request.headers.get('x-auth-global-admin') === '1';
};

const canManageTimesheetPeriods = (request: Request) => {
  if (request.headers.get('x-auth-global-admin') === '1') return true;
  const roles = request.headers.get('x-auth-roles') || '';
  return /super administrator|hr administrator|hr manager|hr director|hr officer|human resource|recruitment officer|onboarding officer|offboarding officer|employee records officer|it administrator|it support|service desk|infrastructure officer|application support|\bict\b/i.test(roles);
};

const snapshotFor = async (request: Request) => ({
  ...(await readTimesheetManagementSnapshot()),
  viewer: { canManagePeriods: canManageTimesheetPeriods(request) },
});

export async function GET(request: Request) {
  if (!canUse(request)) return err(403, 'You do not have permission to open Timesheet Management.');
  try {
    const signals = new URL(request.url).searchParams.get('signals');
    if (signals) return ok(await readCrewSignals(signals));
    return ok(await snapshotFor(request));
  } catch (error) {
    console.error('[timesheet-management] read', error);
    return err(500, error instanceof Error ? error.message : 'Unable to read timesheet management data.');
  }
}

export async function POST(request: Request) {
  if (!canUse(request)) return err(403, 'You do not have permission to update Timesheet Management.');
  const access = resolveAccessContext(request);
  try {
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action || '');
    if (action === 'create-period' || action === 'update-period') {
      if (!canManageTimesheetPeriods(request)) return err(403, 'Timesheet Periods is available to IT and HR only.');
    }
    if (action === 'create-period') {
      const id = await createTimesheetManagementPeriod({
        name: String(body.name || ''),
        startDate: String(body.startDate || ''),
        endDate: String(body.endDate || ''),
        status: String(body.status || 'Open'),
        captureDeadline: String(body.captureDeadline || ''),
        approvalDeadline: String(body.approvalDeadline || ''),
        notes: String(body.notes || ''),
        actor: access.actor,
      });
      return ok({ id, snapshot: await snapshotFor(request) });
    }
    if (action === 'update-period') {
      await updateTimesheetManagementPeriod({
        id: String(body.id || ''),
        status: String(body.status || ''),
        notes: String(body.notes || ''),
        actor: access.actor,
      });
      return ok({ snapshot: await snapshotFor(request) });
    }
    if (action === 'save-bookings') {
      await saveTimesheetManagementBookings({
        periodId: String(body.periodId || ''),
        workDate: String(body.workDate || ''),
        supervisor: String(body.supervisor || ''),
        location: String(body.location || ''),
        workCenter: String(body.workCenter || ''),
        shift: String(body.shift || ''),
        status: String(body.status || 'Draft'),
        actor: access.actor,
        lines: Array.isArray(body.lines) ? body.lines as never : [],
      });
      return ok({ snapshot: await snapshotFor(request) });
    }
    if (action === 'save-crew') {
      const result = await saveTimesheetCrewAssignment({
        employeeCodes: Array.isArray(body.employeeCodes) ? body.employeeCodes.map(String) : [],
        supervisor: String(body.supervisor || ''),
        location: String(body.location || ''),
        workCenter: String(body.workCenter || ''),
        effectiveFrom: String(body.effectiveFrom || ''),
        effectiveTo: String(body.effectiveTo || ''),
        assignmentType: body.assignmentType === 'Temporary' ? 'Temporary' : 'Primary',
        reason: String(body.reason || ''),
        notes: [String(body.notes || ''), access.role ? `Role: ${access.role}` : ''].filter(Boolean).join(' · '),
        actor: access.actor,
      });
      return ok({ ...result, snapshot: await snapshotFor(request) });
    }
    if (action === 'update-crew-status') {
      const result = await updateTimesheetCrewStatus({
        employeeCodes: Array.isArray(body.employeeCodes) ? body.employeeCodes.map(String) : [],
        operationalStatus: String(body.operationalStatus || ''),
        effectiveFrom: String(body.effectiveFrom || ''),
        effectiveTo: String(body.effectiveTo || ''),
        reason: String(body.reason || ''),
        notes: [String(body.notes || ''), access.role ? `Role: ${access.role}` : ''].filter(Boolean).join(' · '),
        actor: access.actor,
      });
      return ok({ ...result, snapshot: await snapshotFor(request) });
    }
    if (action === 'request-crew-removal') {
      const employees = Array.isArray(body.employees) ? body.employees as Array<Record<string, unknown>> : [];
      const result = await requestCrewRemoval({
        employees: employees.map((item) => ({ code: String(item.code || ''), supervisor: String(item.supervisor || '') })),
        reason: String(body.reason || ''),
        actor: access.actor,
      });
      return ok({ ...result, snapshot: await snapshotFor(request) });
    }
    if (action === 'decide-crew-removal') {
      const roles = `${request.headers.get('x-auth-roles') || ''} ${access.role}`.toLowerCase();
      const hrManager = request.headers.get('x-auth-global-admin') === '1' || /hr manager|hr administrator|organization admin|super administrator|hr business partner/.test(roles);
      if (!hrManager) return err(403, 'An HR manager must confirm or reject this removal.');
      const result = await decideCrewRemoval({
        id: String(body.id || ''),
        decision: body.decision === 'confirm' ? 'confirm' : 'reject',
        hrReason: String(body.hrReason || ''),
        actor: access.actor,
      });
      return ok({ ...result, snapshot: await snapshotFor(request) });
    }
    if (action === 'create-record') {
      const record = body.record && typeof body.record === 'object' ? body.record as Record<string, unknown> : {};
      const created = await createTimesheetManagementRecord({
        area: String(record.area || ''),
        tab: String(record.tab || ''),
        periodId: String(record.periodId || ''),
        employeeCode: String(record.employeeCode || ''),
        employeeName: String(record.employeeName || ''),
        supervisor: String(record.supervisor || ''),
        location: String(record.location || ''),
        workCenter: String(record.workCenter || ''),
        projectCode: String(record.projectCode || ''),
        workDate: String(record.workDate || ''),
        effectiveFrom: String(record.effectiveFrom || ''),
        effectiveTo: String(record.effectiveTo || ''),
        status: String(record.status || 'Open'),
        payload: record.payload && typeof record.payload === 'object' ? record.payload as Record<string, string> : {},
        actor: access.actor,
      });
      return ok({ ...created, snapshot: await snapshotFor(request) });
    }
    return err(400, 'Unknown timesheet management action.');
  } catch (error) {
    console.error('[timesheet-management] write', error);
    return err(400, error instanceof Error ? error.message : 'Unable to save timesheet management data.');
  }
}
