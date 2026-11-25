import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { resolveVisitorAccess } from '@/lib/security/visitor-access';
import {
  deleteArtifact,
  deleteVisit,
  loadVisitorWorkspace,
  patchVisit,
  saveArtifact,
  saveVisit,
  searchVisitorEmployees,
} from '@/lib/security/visitor-store';
import type { VisitorTimelineEvent, VisitorVisitInput } from '@/lib/security/visitor-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ok = (data: unknown) => NextResponse.json({ status: 'success', data });
const err = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });

const guard = async (request: NextRequest) => {
  const session = await verifySessionToken(request.cookies.get(AUTH_COOKIE)?.value);
  if (!session) return { error: err(401, 'Sign in to use visitor management.') } as const;
  const access = resolveVisitorAccess(session);
  const actor = access.name.slice(0, 180);
  return { session, actor, access } as const;
};

export async function GET(request: NextRequest) {
  const access = await guard(request);
  if ('error' in access) return access.error;
  try {
    const resource = request.nextUrl.searchParams.get('resource') || 'workspace';
    if (resource === 'employees') {
      const employees = await searchVisitorEmployees(
        request.nextUrl.searchParams.get('q') || '',
        request.nextUrl.searchParams.get('department') || '',
      );
      return ok({ employees });
    }
    return ok(await loadVisitorWorkspace(access.access));
  } catch (error) {
    console.error('[visitors GET]', error);
    return err(500, error instanceof Error ? error.message : 'Unable to load visitor records.');
  }
}

export async function POST(request: NextRequest) {
  const access = await guard(request);
  if ('error' in access) return access.error;
  try {
    const body = await request.json().catch(() => null) as {
      action?: string;
      id?: string;
      visit?: VisitorVisitInput;
      patch?: VisitorVisitInput;
      event?: VisitorTimelineEvent;
      artifact?: { id?: string; kind?: string; name?: string; payload?: Record<string, unknown> };
    } | null;
    const action = body?.action || 'save';
    if (action === 'save') return ok(await saveVisit({ ...(body?.visit || {}), id: body?.visit?.id || body?.id }, access.actor, body?.event, access.access));
    if (action === 'patch') {
      if (!body?.id) return err(400, 'Visit id is required.');
      return ok(await patchVisit(body.id, body.patch || body.visit || {}, access.actor, body.event, access.access));
    }
    if (action === 'delete') {
      if (!body?.id) return err(400, 'Visit id is required.');
      return ok({ deleted: await deleteVisit(body.id) });
    }
    if (action === 'save-artifact') {
      const artifact = body?.artifact;
      if (!artifact?.kind || !artifact.name) return err(400, 'Artifact kind and name are required.');
      return ok(await saveArtifact({ id: artifact.id, kind: artifact.kind, name: artifact.name, payload: artifact.payload }));
    }
    if (action === 'delete-artifact') {
      if (!body?.id) return err(400, 'Artifact id is required.');
      return ok({ deleted: await deleteArtifact(body.id) });
    }
    return err(400, 'Unknown visitor action.');
  } catch (error) {
    console.error('[visitors POST]', error);
    return err(500, error instanceof Error ? error.message : 'Unable to save the visitor record.');
  }
}
