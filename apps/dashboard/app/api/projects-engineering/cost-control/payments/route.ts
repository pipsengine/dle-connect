import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { withResolvedAccess } from '@/lib/auth/resolve-access-session';
import {
  canAccessProjectsEngineeringPortal,
  filterProjectsForSession,
} from '@/lib/access/projects-engineering-access';
import { canonicalPaymentProjectCode } from '@/lib/projects-engineering/payment-cost';
import { loadProjectPaymentPositions } from '@/lib/projects-engineering/payment-cost-store';
import { listAllProjects } from '@/lib/projects-engineering/project-store';

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

  try {
    const all = await listAllProjects();
    const visible = filterProjectsForSession(session, all);
    const allowed = new Set(visible.map((project) => canonicalPaymentProjectCode(project.code)));
    const requested = canonicalPaymentProjectCode(request.nextUrl.searchParams.get('projectCode'));
    const map = await loadProjectPaymentPositions();
    const projects = [...map.values()].filter((position) => {
      if (!allowed.has(position.projectCode)) return false;
      if (requested && position.projectCode !== requested) return false;
      return true;
    });
    const actual = projects.reduce((sum, row) => sum + row.actual, 0);
    const commitments = projects.reduce((sum, row) => sum + row.commitments, 0);
    return NextResponse.json({
      status: 'success',
      data: {
        generatedAt: new Date().toISOString(),
        source: 'DLE Enterprise · finance.PaymentRequests',
        totals: {
          actual,
          commitments,
          projects: projects.length,
        },
        projects,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { status: 'error', error: error instanceof Error ? error.message : 'Unable to load project payments' },
      { status: 500 },
    );
  }
}
