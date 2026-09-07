import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { withResolvedAccess } from '@/lib/auth/resolve-access-session';
import {
  canAccessProjectsEngineeringPortal,
  canCreateProjects,
  filterProjectsForSession,
} from '@/lib/access/projects-engineering-access';
import { createProjectRecord, listAllProjects } from '@/lib/projects-engineering/project-store';
import { parseProjectCreate } from '@/lib/projects-engineering/validators';

const getSession = async (request: NextRequest) => {
  const session = await verifySessionToken(request.cookies.get(AUTH_COOKIE)?.value);
  return session ? withResolvedAccess(session) : null;
};

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ status: 'error', error: 'Unauthenticated' }, { status: 401 });
  if (!canAccessProjectsEngineeringPortal(session.permissions, session.isGlobalAdmin, session.roles, session.sub)) {
    return NextResponse.json({ status: 'error', error: 'Forbidden' }, { status: 403 });
  }

  const all = await listAllProjects();
  const visible = filterProjectsForSession(session, all);
  const scope = visible.length === all.length ? 'enterprise' : 'managed';

  return NextResponse.json({
    status: 'success',
    data: {
      projects: visible,
      scope,
      counts: {
        total: visible.length,
        active: visible.filter((project) => /active/i.test(project.status)).length,
        atRisk: visible.filter((project) => project.health === 'Watch' || project.health === 'Critical').length,
        critical: visible.filter((project) => project.health === 'Critical').length,
      },
    },
  });
}

export async function POST(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ status: 'error', error: 'Unauthenticated' }, { status: 401 });
  if (!canAccessProjectsEngineeringPortal(session.permissions, session.isGlobalAdmin, session.roles, session.sub)) {
    return NextResponse.json({ status: 'error', error: 'Forbidden' }, { status: 403 });
  }
  if (!canCreateProjects(session)) {
    return NextResponse.json(
      { status: 'error', error: 'Only IT Department employees can create projects at this time.' },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = parseProjectCreate(body);
  if (parsed.error || !parsed.data) {
    return NextResponse.json({ status: 'error', error: parsed.error || 'Invalid project request' }, { status: 400 });
  }

  try {
    const project = await createProjectRecord(parsed.data, {
      username: session.username,
      fullName: session.fullName,
    });
    return NextResponse.json(
      {
        status: 'success',
        data: {
          message: 'Project created as Draft. Assign the Project Manager employee code to unlock their dashboard.',
          project,
          actor: session.username,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      { status: 'error', error: error instanceof Error ? error.message : 'Unable to create project' },
      { status: 409 },
    );
  }
}
