import { NextRequest, NextResponse } from 'next/server';
import { effectivePermissionsForUser } from '@/lib/auth/access-control-store';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { canAccessItSupportKeys } from '@/lib/access/it-support-access';
import {
  deleteImsRecord,
  upsertBbs,
  upsertDrill,
  upsertEWaste,
  upsertHazid,
  upsertImsAction,
  upsertImsInspection,
  upsertImsSchedule,
} from '@/lib/it-support/inspection-ims-store';
import {
  deleteInspectionRecord,
  listInspectionWorkspace,
  upsertInspection,
  upsertInspectionFinding,
  upsertInspectionSchedule,
} from '@/lib/it-support/inspection-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VIEW_KEYS = [
  'page.it-support.inspection-management.view',
  'view_it_support',
  'it.view',
  'it.*',
];

const ok = (data: unknown) => NextResponse.json({ status: 'success', data });
const err = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });

const guard = async (request: NextRequest) => {
  const session = await verifySessionToken(request.cookies.get(AUTH_COOKIE)?.value);
  if (!session) return { error: err(401, 'Unauthorized') } as const;
  const permissions = session.isGlobalAdmin || session.sub === 'global-admin'
    ? ['*']
    : await effectivePermissionsForUser(session.sub, session.roles);
  if (!canAccessItSupportKeys(VIEW_KEYS, permissions, session.isGlobalAdmin)) {
    return { error: err(403, 'Forbidden') } as const;
  }
  return { session, actor: session.fullName || session.username || 'IT User' } as const;
};

export async function GET(request: NextRequest) {
  const base = await guard(request);
  if ('error' in base) return base.error;
  try {
    return ok(await listInspectionWorkspace());
  } catch (error) {
    console.error('[inspection-management GET]', error);
    return err(500, error instanceof Error ? error.message : 'Failed to load inspections');
  }
}

export async function POST(request: NextRequest) {
  const base = await guard(request);
  if ('error' in base) return base.error;
  const body = await request.json().catch(() => ({}));
  const action = String(body.action || '');
  const payload = (body.payload || body) as Record<string, unknown>;
  try {
    if (action === 'upsert-schedule') {
      const id = await upsertInspectionSchedule(payload, base.actor);
      return ok({ id, ...(await listInspectionWorkspace()) });
    }
    if (action === 'upsert-inspection') {
      const id = await upsertInspection(payload, base.actor);
      return ok({ id, ...(await listInspectionWorkspace()) });
    }
    if (action === 'upsert-finding') {
      const id = await upsertInspectionFinding(payload, base.actor);
      return ok({ id, ...(await listInspectionWorkspace()) });
    }
    if (action === 'upsert-location-schedule') {
      const id = await upsertImsSchedule(payload as Parameters<typeof upsertImsSchedule>[0], base.actor);
      return ok({ id, ...(await listInspectionWorkspace()) });
    }
    if (action === 'upsert-ims-inspection') {
      const id = await upsertImsInspection(payload as Parameters<typeof upsertImsInspection>[0], base.actor);
      return ok({ id, ...(await listInspectionWorkspace()) });
    }
    if (action === 'upsert-action') {
      const id = await upsertImsAction(payload as Parameters<typeof upsertImsAction>[0], base.actor);
      return ok({ id, ...(await listInspectionWorkspace()) });
    }
    if (action === 'upsert-hazid') {
      const id = await upsertHazid(payload as Parameters<typeof upsertHazid>[0], base.actor);
      return ok({ id, ...(await listInspectionWorkspace()) });
    }
    if (action === 'upsert-bbs') {
      const id = await upsertBbs(payload as Parameters<typeof upsertBbs>[0], base.actor);
      return ok({ id, ...(await listInspectionWorkspace()) });
    }
    if (action === 'upsert-drill') {
      const id = await upsertDrill(payload as Parameters<typeof upsertDrill>[0], base.actor);
      return ok({ id, ...(await listInspectionWorkspace()) });
    }
    if (action === 'upsert-ewaste') {
      const id = await upsertEWaste(payload as Parameters<typeof upsertEWaste>[0], base.actor);
      return ok({ id, ...(await listInspectionWorkspace()) });
    }
    if (action === 'delete-ims') {
      const kind = String(payload.kind || '');
      if (kind !== 'action' && kind !== 'hazid' && kind !== 'bbs' && kind !== 'drill' && kind !== 'ewaste') {
        return err(400, 'kind required');
      }
      await deleteImsRecord(kind, String(payload.id || ''));
      return ok(await listInspectionWorkspace());
    }
    if (action === 'delete') {
      const kind = String(payload.kind || '');
      if (kind !== 'schedule' && kind !== 'inspection' && kind !== 'finding') return err(400, 'kind required');
      await deleteInspectionRecord(kind, String(payload.id || ''));
      return ok(await listInspectionWorkspace());
    }
    return err(400, `Unknown action: ${action}`);
  } catch (error) {
    console.error('[inspection-management POST]', error);
    return err(500, error instanceof Error ? error.message : 'Failed to save inspection data');
  }
}
