import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { withResolvedAccess } from '@/lib/auth/resolve-access-session';
import {
  canAccessProject,
  canAccessProjectsEngineeringPortal,
  canEditProjects,
} from '@/lib/access/projects-engineering-access';
import {
  buildProjectManHourUtilization,
  upsertManHourBudget,
  type UtilizationGate,
} from '@/lib/projects-engineering/man-hour-utilization';
import { getProjectById } from '@/lib/projects-engineering/project-store';

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

  const gateParam = String(request.nextUrl.searchParams.get('gate') || 'pmApproved');
  const gate = (['all', 'pmApproved', 'costValidated', 'payrollReady'].includes(gateParam)
    ? gateParam
    : 'pmApproved') as UtilizationGate;

  try {
    const utilization = await buildProjectManHourUtilization(project, { gate });
    return NextResponse.json({ status: 'success', data: { utilization } });
  } catch (error) {
    return NextResponse.json(
      { status: 'error', error: error instanceof Error ? error.message : 'Unable to load man-hour utilization' },
      { status: 500 },
    );
  }
}

/** Phase 3/4 — set budgeted / ETC man-hours for the project. */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ status: 'error', error: 'Unauthenticated' }, { status: 401 });
  if (!canAccessProjectsEngineeringPortal(session.permissions, session.isGlobalAdmin, session.roles, session.sub)) {
    return NextResponse.json({ status: 'error', error: 'Forbidden' }, { status: 403 });
  }
  if (!canEditProjects(session)) {
    return NextResponse.json({ status: 'error', error: 'Not authorized to update man-hour budgets.' }, { status: 403 });
  }

  const { id } = await context.params;
  const project = await getProjectById(id);
  if (!project) return NextResponse.json({ status: 'error', error: 'Project not found' }, { status: 404 });
  if (!canAccessProject(session, project)) {
    return NextResponse.json({ status: 'error', error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ status: 'error', error: 'Invalid payload' }, { status: 400 });
  }
  const budgetedHours = Number((body as Record<string, unknown>).budgetedHours);
  const etcHoursRaw = (body as Record<string, unknown>).etcHours;
  const etcHours = etcHoursRaw === undefined || etcHoursRaw === null || etcHoursRaw === ''
    ? null
    : Number(etcHoursRaw);
  if (!Number.isFinite(budgetedHours) || budgetedHours < 0) {
    return NextResponse.json({ status: 'error', error: 'budgetedHours must be a non-negative number' }, { status: 400 });
  }
  if (etcHours !== null && (!Number.isFinite(etcHours) || etcHours < 0)) {
    return NextResponse.json({ status: 'error', error: 'etcHours must be a non-negative number' }, { status: 400 });
  }

  try {
    await upsertManHourBudget(project.code, {
      budgetedHours,
      etcHours,
      notes: String((body as Record<string, unknown>).notes || '').trim() || null,
      actor: session.username || session.fullName || session.sub,
    });
    const utilization = await buildProjectManHourUtilization(project, { gate: 'pmApproved' });
    return NextResponse.json({
      status: 'success',
      data: { message: 'Man-hour budget updated.', utilization },
    });
  } catch (error) {
    return NextResponse.json(
      { status: 'error', error: error instanceof Error ? error.message : 'Unable to update man-hour budget' },
      { status: 500 },
    );
  }
}
