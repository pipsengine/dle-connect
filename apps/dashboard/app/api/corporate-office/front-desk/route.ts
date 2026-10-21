import { NextRequest, NextResponse } from 'next/server';
import { canAccessCorporateOfficePortal, hasFullCorporateOfficeAccess } from '@/lib/access/corporate-office-access';
import { employeeHasCorrespondenceAccess, withCorrespondenceParticipantPermission } from '@/lib/corporate-office/front-desk-access';
import { effectivePermissionsForUser } from '@/lib/auth/access-control-store';
import { isSuperActor } from '@/lib/auth/role-delegation';
import { AUTH_COOKIE, verifySessionToken, type SessionPayload } from '@/lib/auth/session';
import {
  acknowledgeCorrespondence,
  acknowledgeRoute,
  archiveCorrespondence,
  assignCorrespondence,
  closeCorrespondence,
  completeRoute,
  createCorrespondence,
  deleteCorrespondence,
  getCorrespondence,
  listCorrespondence,
  progressCorrespondence,
  progressRoute,
  readAttachmentFile,
  reassignRoute,
  reopenCorrespondence,
  respondCorrespondence,
  updateCorrespondence,
  waiveRoute,
  type IncomingAttachment,
} from '@/lib/corporate-office/front-desk-store';
import { listFrontDeskDirectories, loadCorporateOfficeOverview, lookupDepartmentHead, parseOverviewFilters, resolveCorporateEmployee, searchCorporateEmployees } from '@/lib/corporate-office/front-desk-overview';
import { notifyCorrespondenceAssigned, notifyCorrespondenceClosed, notifyCorrespondenceRoutes, notifyCorrespondenceSubmitted, notifyRouteCompleted } from '@/lib/corporate-office/front-desk-notify';
import type { CorrespondenceInput } from '@/lib/corporate-office/front-desk-types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ok = (data: unknown) => NextResponse.json({ status: 'success', data });
const err = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });

const sessionFrom = async (request: NextRequest) => verifySessionToken(request.cookies.get(AUTH_COOKIE)?.value);

const permissionsFrom = async (session: SessionPayload) => {
  if (isSuperActor(session)) return ['*'];
  const live = await effectivePermissionsForUser(session.sub, session.roles);
  return withCorrespondenceParticipantPermission(live, session.employeeCode);
};

const actorFrom = (session: SessionPayload) => {
  const name = session.fullName || session.username || 'Corporate Office';
  const code = session.employeeCode?.trim();
  return (code ? `${name} (${code})` : name).slice(0, 180);
};

const authorize = async (request: NextRequest) => {
  const session = await sessionFrom(request);
  if (!session) return { error: err(401, 'Unauthorized') };
  const permissions = await permissionsFrom(session);
  const globalAdmin = Boolean(session.isGlobalAdmin) || isSuperActor(session);
  const fullAccess = hasFullCorporateOfficeAccess(permissions, globalAdmin);
  const allowed = fullAccess || canAccessCorporateOfficePortal(permissions, globalAdmin);
  if (!allowed) return { error: err(403, 'Forbidden') };
  return { session, permissions, fullAccess };
};

const requireOwnCorrespondence = async (fullAccess: boolean, employeeCode: string | undefined, correspondenceId: string) => {
  if (fullAccess) return null;
  if (employeeCode && await employeeHasCorrespondenceAccess(employeeCode, correspondenceId)) return null;
  return err(403, 'This correspondence is not assigned to you.');
};

const readFiles = async (form: FormData): Promise<IncomingAttachment[]> => {
  const files: IncomingAttachment[] = [];
  for (const entry of form.getAll('files')) {
    if (!(entry instanceof File)) continue;
    const marker = entry.name.indexOf('::');
    const id = marker > 0 ? entry.name.slice(0, marker) : '';
    const name = marker > 0 ? entry.name.slice(marker + 2) : entry.name;
    files.push({
      id,
      name,
      type: entry.type || 'application/octet-stream',
      bytes: Buffer.from(await entry.arrayBuffer()),
    });
  }
  return files;
};

export async function GET(request: NextRequest) {
  const auth = await authorize(request);
  if ('error' in auth && auth.error) return auth.error;
  const { searchParams } = new URL(request.url);
  const resource = searchParams.get('resource') || 'items';
  try {
    if (resource === 'overview') {
      const employeeCode = String(auth.session?.employeeCode || '');
      const filters = parseOverviewFilters(searchParams, employeeCode);
      filters.participantOnly = !auth.fullAccess;
      return ok(await loadCorporateOfficeOverview(filters));
    }
    if (resource === 'employees') {
      return ok(await searchCorporateEmployees(searchParams.get('q') || '', searchParams.get('department') || ''));
    }
    if (resource === 'hod') {
      return ok(await lookupDepartmentHead(searchParams.get('department') || ''));
    }
    if (resource === 'directories') {
      return ok(await listFrontDeskDirectories());
    }
    if (resource === 'attachment') {
      const file = await readAttachmentFile(searchParams.get('id') || '', '');
      if (!file) return err(404, 'Document was not found.');
      const owned = await requireOwnCorrespondence(Boolean(auth.fullAccess), auth.session?.employeeCode, file.correspondenceId);
      if (owned) return owned;
      if (auth.session) await readAttachmentFile(searchParams.get('id') || '', actorFrom(auth.session));
      return new NextResponse(new Uint8Array(file.bytes), {
        headers: {
          'Content-Type': file.contentType,
          'Content-Disposition': `inline; filename="${file.fileName.replace(/"/g, '')}"`,
          'Cache-Control': 'private, no-store',
        },
      });
    }
    if (resource === 'item') {
      const itemId = searchParams.get('id') || '';
      const owned = await requireOwnCorrespondence(Boolean(auth.fullAccess), auth.session?.employeeCode, itemId);
      if (owned) return owned;
      const row = await getCorrespondence(itemId);
      if (!row) return err(404, 'Correspondence was not found.');
      return ok(row);
    }
    const rows = await listCorrespondence();
    if (auth.fullAccess) return ok(rows);
    const visible = [];
    for (const row of rows) {
      if (await employeeHasCorrespondenceAccess(auth.session?.employeeCode || '', row.id)) visible.push(row);
    }
    return ok(visible);
  } catch (error) {
    return err(500, error instanceof Error ? error.message : 'Front Desk request failed.');
  }
}

const resolveCorrespondencePeople = async (data: CorrespondenceInput) => {
  if (!data) return err(400, 'Correspondence details are required.');
  if (data.addressedEmployeeCode) {
    const employee = await resolveCorporateEmployee(data.addressedEmployeeCode);
    if (!employee) return err(400, 'Choose the addressee from the employee directory.');
    data.addressedEmployeeCode = employee.code;
    data.addressedTo = employee.name;
  }
  if (data.assignedEmployeeCode) {
    const employee = await resolveCorporateEmployee(data.assignedEmployeeCode);
    if (!employee) return err(400, 'Choose an employee from the directory.');
    data.assignedEmployeeCode = employee.code;
    data.assignedEmployeeName = employee.name;
  }
  for (const route of data.routes || []) {
    if (route.assigneeCode) {
      const employee = await resolveCorporateEmployee(route.assigneeCode);
      if (!employee) return err(400, `Choose an officer for ${route.department || 'the department'} from the employee directory.`);
      route.assigneeCode = employee.code;
      route.assigneeName = employee.name;
    }
    if (route.hodCode) {
      const employee = await resolveCorporateEmployee(route.hodCode);
      if (!employee) return err(400, `Choose the HOD for ${route.department || 'the department'} from the employee directory.`);
      route.hodCode = employee.code;
      route.hodName = employee.name;
    }
  }
  return null;
};

export async function POST(request: NextRequest) {
  const auth = await authorize(request);
  if ('error' in auth && auth.error) return auth.error;
  const session = auth.session;
  if (!session) return err(401, 'Unauthorized');
  const permissions = auth.permissions || [];
  const actor = actorFrom(session);
  try {
    const contentType = request.headers.get('content-type') || '';
    let action = '';
    let payload: Record<string, unknown> = {};
    let files: IncomingAttachment[] = [];
    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      action = String(form.get('action') || '');
      payload = JSON.parse(String(form.get('payload') || '{}')) as Record<string, unknown>;
      files = await readFiles(form);
    } else {
      payload = await request.json() as Record<string, unknown>;
      action = String(payload.action || '');
    }
    const id = String(payload.id || '');
    const officeOnly = new Set(['create', 'update', 'close', 'assign', 'delete', 'reopen', 'archive', 'route-reassign', 'route-waive']);
    if (!auth.fullAccess && officeOnly.has(action)) return err(403, 'Only Corporate Office staff can change the register.');
    const ownedAction = new Set(['acknowledge', 'progress', 'respond', 'route-acknowledge', 'route-progress', 'route-complete', 'close', 'update']);
    if (ownedAction.has(action)) {
      const owned = await requireOwnCorrespondence(Boolean(auth.fullAccess), session.employeeCode, id);
      if (owned) return owned;
    }
    const canReopen = permissions.includes('*')
      || permissions.includes('corporate.front-desk.edit')
      || permissions.includes('corporate.front-desk.*')
      || permissions.includes('corporate.*')
      || isSuperActor(session);
    if (action === 'create') {
      const data = payload.data as CorrespondenceInput;
      const resolved = await resolveCorrespondencePeople(data);
      if (resolved) return resolved;
      const created = await createCorrespondence(data, files, actor);
      await notifyCorrespondenceSubmitted(session, created);
      return ok(created);
    }
    if (action === 'update') {
      const data = payload.data as CorrespondenceInput;
      const resolved = await resolveCorrespondencePeople(data);
      if (resolved) return resolved;
      const removed = Array.isArray(payload.removedAttachmentIds) ? payload.removedAttachmentIds.map((value) => String(value)) : [];
      const updated = await updateCorrespondence(id, data, files, removed, actor);
      await notifyCorrespondenceAssigned(session, updated);
      await notifyCorrespondenceRoutes(session, updated);
      return ok(updated);
    }
    if (action === 'close') {
      const closed = await closeCorrespondence(id, actor);
      await notifyCorrespondenceClosed(session, closed);
      return ok(closed);
    }
    if (action === 'assign') {
      const employee = await resolveCorporateEmployee(String(payload.employeeCode || ''));
      if (!employee) return err(400, 'Choose an employee from the directory.');
      const assigned = await assignCorrespondence(id, employee.code, employee.name, actor);
      await notifyCorrespondenceAssigned(session, assigned);
      return ok(assigned);
    }
    if (action === 'acknowledge') return ok(await acknowledgeCorrespondence(id, actor));
    if (action === 'progress') return ok(await progressCorrespondence(id, actor));
    if (action === 'respond') return ok(await respondCorrespondence(id, String(payload.note || ''), actor));
    if (action === 'reopen') {
      if (!canReopen) return err(403, 'You cannot reopen closed correspondence.');
      return ok(await reopenCorrespondence(id, String(payload.reason || ''), actor));
    }
    if (action === 'archive') {
      if (!canReopen) return err(403, 'You cannot archive correspondence.');
      return ok(await archiveCorrespondence(id, actor));
    }
    if (action === 'delete') {
      await deleteCorrespondence(id);
      return ok({ id });
    }
    const routeId = String(payload.routeId || '');
    if (action === 'route-acknowledge') return ok(await acknowledgeRoute(id, routeId, actor));
    if (action === 'route-progress') return ok(await progressRoute(id, routeId, String(payload.note || ''), actor));
    if (action === 'route-complete') {
      const completed = await completeRoute(id, routeId, actor);
      const route = (completed.routes || []).find((item) => item.id === routeId);
      if (route) await notifyRouteCompleted(session, completed, route);
      return ok(completed);
    }
    if (action === 'route-reassign') {
      const employee = await resolveCorporateEmployee(String(payload.employeeCode || ''));
      if (!employee) return err(400, 'Choose an employee from the directory.');
      const reassigned = await reassignRoute(id, routeId, employee.code, employee.name, actor);
      await notifyCorrespondenceRoutes(session, reassigned);
      return ok(reassigned);
    }
    if (action === 'route-waive') {
      if (!canReopen) return err(403, 'You cannot waive a departmental assignment.');
      return ok(await waiveRoute(id, routeId, String(payload.reason || ''), actor));
    }
    return err(400, 'Unknown Front Desk action.');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Front Desk request failed.';
    const status = /not found/i.test(message) ? 404 : /read-only|cannot|required|larger|empty|must be/i.test(message) ? 400 : 500;
    return err(status, message);
  }
}
