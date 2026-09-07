import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { withResolvedAccess } from '@/lib/auth/resolve-access-session';
import {
  canAccessProject,
  canAccessProjectsEngineeringPortal,
  canDeleteProjects,
  canEditProjects,
} from '@/lib/access/projects-engineering-access';
import {
  deleteProjectRecord,
  getProjectById,
  updateProjectRecord,
} from '@/lib/projects-engineering/project-store';
import { parseProjectUpdate } from '@/lib/projects-engineering/validators';

const getSession = async (request: NextRequest) => {
  const session = await verifySessionToken(request.cookies.get(AUTH_COOKIE)?.value);
  return session ? withResolvedAccess(session) : null;
};

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ status: 'error', error: 'Unauthenticated' }, { status: 401 });
  if (!canAccessProjectsEngineeringPortal(session.permissions, session.isGlobalAdmin, session.roles, session.sub)) {
    return NextResponse.json({ status: 'error', error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await context.params;
  const project = await getProjectById(id);
  if (!project) return NextResponse.json({ status: 'error', error: 'Project not found' }, { status: 404 });
  if (!canAccessProject(session, project)) {
    return NextResponse.json({ status: 'error', error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json({ status: 'success', data: { project } });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ status: 'error', error: 'Unauthenticated' }, { status: 401 });
  if (!canAccessProjectsEngineeringPortal(session.permissions, session.isGlobalAdmin, session.roles, session.sub)) {
    return NextResponse.json({ status: 'error', error: 'Forbidden' }, { status: 403 });
  }
  if (!canEditProjects(session)) {
    return NextResponse.json({ status: 'error', error: 'You are not authorized to edit projects.' }, { status: 403 });
  }

  const { id } = await context.params;
  const existing = await getProjectById(id);
  if (!existing) return NextResponse.json({ status: 'error', error: 'Project not found' }, { status: 404 });
  if (!canAccessProject(session, existing)) {
    return NextResponse.json({ status: 'error', error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = parseProjectUpdate(body);
  if (parsed.error || !parsed.data) {
    return NextResponse.json({ status: 'error', error: parsed.error || 'Invalid project request' }, { status: 400 });
  }

  try {
    const project = await updateProjectRecord(id, parsed.data, {
      username: session.username,
      fullName: session.fullName,
      sub: session.sub,
    });
    return NextResponse.json({
      status: 'success',
      data: { message: 'Project updated in DLE_Enterprise.', project },
    });
  } catch (error) {
    return NextResponse.json(
      { status: 'error', error: error instanceof Error ? error.message : 'Unable to update project' },
      { status: 409 },
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ status: 'error', error: 'Unauthenticated' }, { status: 401 });
  if (!canAccessProjectsEngineeringPortal(session.permissions, session.isGlobalAdmin, session.roles, session.sub)) {
    return NextResponse.json({ status: 'error', error: 'Forbidden' }, { status: 403 });
  }
  if (!canDeleteProjects(session)) {
    return NextResponse.json(
      { status: 'error', error: 'Only the Global Super Administrator can delete projects.' },
      { status: 403 },
    );
  }

  const { id } = await context.params;
  try {
    const deleted = await deleteProjectRecord(id, {
      username: session.username,
      fullName: session.fullName,
      sub: session.sub,
    });
    return NextResponse.json({
      status: 'success',
      data: { message: `Project ${deleted.code} archived and removed from active portfolio.`, ...deleted },
    });
  } catch (error) {
    return NextResponse.json(
      { status: 'error', error: error instanceof Error ? error.message : 'Unable to delete project' },
      { status: 409 },
    );
  }
}
