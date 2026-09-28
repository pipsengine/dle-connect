import { NextResponse } from 'next/server';
import { hasPermission } from '@/lib/auth/permission-match';
import { resolveAccessContext } from '@/lib/hris-access';
import { actOnApprovals, listApprovalQueue, readApprovalDetail } from '@/lib/timesheet-approval-store';

const ok = <T,>(data: T) => NextResponse.json({ status: 'success', data });
const err = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });

const allowed = (request: Request) => {
  const permissions = (request.headers.get('x-auth-permissions') || '').split(',').map((item) => item.trim()).filter(Boolean);
  return hasPermission(permissions, 'view_timesheet_management') || request.headers.get('x-auth-global-admin') === '1';
};

const viewerFrom = (request: Request) => {
  const access = resolveAccessContext(request);
  const roles = `${request.headers.get('x-auth-roles') || ''} ${access.role}`.toLowerCase();
  return {
    actor: access.actor,
    role: access.role,
    isAdmin: request.headers.get('x-auth-global-admin') === '1' || /timesheet administrator|organization admin|super administrator|hr manager|hr administrator/.test(roles),
  };
};

export async function GET(request: Request) {
  if (!allowed(request)) return err(403, 'You do not have permission to view timesheet approvals.');
  const url = new URL(request.url);
  try {
    if (url.searchParams.get('id')) return ok(await readApprovalDetail(url.searchParams.get('id') || ''));
    return ok(await listApprovalQueue({
      stage: url.searchParams.get('stage') || 'Supervisor',
      periodId: url.searchParams.get('periodId') || '',
      supervisor: url.searchParams.get('supervisor') || '',
      location: url.searchParams.get('location') || '',
      status: url.searchParams.get('status') || '',
      q: url.searchParams.get('q') || '',
      workDate: url.searchParams.get('workDate') || '',
      project: url.searchParams.get('project') || '',
      page: Number(url.searchParams.get('page') || 1),
      pageSize: Number(url.searchParams.get('pageSize') || 10),
    }, viewerFrom(request)));
  } catch (error) {
    return err(400, error instanceof Error ? error.message : 'Unable to load approvals.');
  }
}

export async function POST(request: Request) {
  if (!allowed(request)) return err(403, 'You do not have permission to act on timesheet approvals.');
  const viewer = viewerFrom(request);
  try {
    const body = await request.json() as Record<string, unknown>;
    return ok(await actOnApprovals({
      ids: Array.isArray(body.ids) ? body.ids.map(String) : [],
      action: body.action === 'return' ? 'return' : 'approve',
      reason: String(body.reason || ''),
      comment: String(body.comment || ''),
      actor: viewer.actor,
      role: viewer.role,
      isAdmin: viewer.isAdmin,
    }));
  } catch (error) {
    return err(400, error instanceof Error ? error.message : 'Unable to update the approval.');
  }
}
