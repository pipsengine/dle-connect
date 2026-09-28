import { NextResponse } from 'next/server';
import { hasPermission } from '@/lib/auth/permission-match';
import { resolveAccessContext } from '@/lib/hris-access';
import {
  acknowledgeMobilizationException,
  changeMobilizationStatus,
  confirmMobilizationReturn,
  createMobilization,
  demobilizeEmployees,
  extendMobilization,
  listMobilizationExceptions,
  listMobilizationHistory,
  listMobilizationWorkspace,
  readMobilizationBatch,
  searchMobilizationEmployees,
  searchOffshoreSites,
  validateMobilizationEmployees,
} from '@/lib/timesheet-portal-mobilization-store';

const ok = <T,>(data: T) => NextResponse.json({ status: 'success', data });
const err = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });

const allowed = (request: Request) => {
  const permissions = (request.headers.get('x-auth-permissions') || '').split(',').map((item) => item.trim()).filter(Boolean);
  return hasPermission(permissions, 'view_timesheet_management') || request.headers.get('x-auth-global-admin') === '1';
};

export async function GET(request: Request) {
  if (!allowed(request)) return err(403, 'You do not have permission to view offshore mobilization.');
  const url = new URL(request.url);
  const mode = url.searchParams.get('mode') || 'workspace';
  try {
    if (mode === 'search' && url.searchParams.get('kind') === 'employee') return ok(await searchMobilizationEmployees(url.searchParams.get('q') || ''));
    if (mode === 'search') return ok(await searchOffshoreSites(url.searchParams.get('q') || ''));
    if (mode === 'history') return ok(await listMobilizationHistory(url.searchParams.get('q') || ''));
    if (mode === 'exceptions') return ok(await listMobilizationExceptions());
    if (mode === 'batch') return ok(await readMobilizationBatch(url.searchParams.get('id') || ''));
    return ok(await listMobilizationWorkspace({
      asOf: url.searchParams.get('date') || '',
      periodId: url.searchParams.get('periodId') || '',
      project: url.searchParams.get('project') || '',
      site: url.searchParams.get('site') || '',
      supervisor: url.searchParams.get('supervisor') || '',
      status: url.searchParams.get('status') || '',
      q: url.searchParams.get('q') || '',
    }));
  } catch (error) {
    return err(400, error instanceof Error ? error.message : 'Unable to load offshore mobilization.');
  }
}

export async function POST(request: Request) {
  if (!allowed(request)) return err(403, 'You do not have permission to update offshore mobilization.');
  const access = resolveAccessContext(request);
  try {
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action || '');
    const actor = access.actor;
    const role = access.role;
    const ids = Array.isArray(body.employeeRowIds) ? body.employeeRowIds.map(String) : [];
    if (action === 'validate') {
      return ok(await validateMobilizationEmployees({
        employeeCodes: Array.isArray(body.employeeCodes) ? body.employeeCodes.map(String) : [],
        effectiveFrom: String(body.effectiveFrom || ''),
        expectedReturn: String(body.expectedReturn || ''),
      }));
    }
    if (action === 'create') {
      return ok(await createMobilization({
        periodId: String(body.periodId || ''),
        projectCode: String(body.projectCode || ''),
        projectName: String(body.projectName || ''),
        site: String(body.site || ''),
        effectiveFrom: String(body.effectiveFrom || ''),
        expectedReturn: String(body.expectedReturn || ''),
        supervisor: String(body.supervisor || ''),
        authorizationRef: String(body.authorizationRef || ''),
        reason: String(body.reason || ''),
        transport: String(body.transport || ''),
        notes: String(body.notes || ''),
        employeeCodes: Array.isArray(body.employeeCodes) ? body.employeeCodes.map(String) : [],
        actor,
        role,
      }));
    }
    if (action === 'extend') {
      return ok(await extendMobilization({ employeeRowIds: ids, expectedReturn: String(body.expectedReturn || ''), reason: String(body.reason || ''), authorizationRef: String(body.authorizationRef || ''), notes: String(body.notes || ''), actor, role }));
    }
    if (action === 'demobilize') {
      return ok(await demobilizeEmployees({ employeeRowIds: ids, demobilizationDate: String(body.demobilizationDate || ''), returnDate: String(body.returnDate || ''), destination: String(body.destination || ''), reason: String(body.reason || ''), notes: String(body.notes || ''), actor, role }));
    }
    if (action === 'return') {
      return ok(await confirmMobilizationReturn({ employeeRowIds: ids, returnDate: String(body.returnDate || ''), reason: String(body.reason || ''), actor, role }));
    }
    if (action === 'status') {
      return ok(await changeMobilizationStatus({ employeeRowIds: ids, status: String(body.status || ''), effectiveDate: String(body.effectiveDate || ''), reason: String(body.reason || ''), actor, role }));
    }
    if (action === 'acknowledge') {
      return ok(await acknowledgeMobilizationException({ employeeRowId: String(body.employeeRowId || ''), issue: String(body.issue || ''), actor, role }));
    }
    return err(400, 'Unknown mobilization action.');
  } catch (error) {
    return err(400, error instanceof Error ? error.message : 'Unable to update offshore mobilization.');
  }
}
