import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { withResolvedAccess } from '@/lib/auth/resolve-access-session';
import {
  canAccessProjectsEngineeringPortal,
  filterProjectsForSession,
} from '@/lib/access/projects-engineering-access';
import { listAllProjects } from '@/lib/projects-engineering/project-store';
import { buildPortfolioManHourSummaries } from '@/lib/projects-engineering/man-hour-utilization';
import type { UtilizationGate } from '@/lib/projects-engineering/man-hour-types';

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

  const gateParam = String(request.nextUrl.searchParams.get('gate') || 'pmApproved') as UtilizationGate;
  const gate: UtilizationGate = ['all', 'pmApproved', 'costValidated', 'payrollReady'].includes(gateParam)
    ? gateParam
    : 'pmApproved';

  try {
    const all = await listAllProjects();
    const visible = filterProjectsForSession(session, all);
    const rows = await buildPortfolioManHourSummaries(visible, { gate });
    const totals = rows.reduce(
      (acc, row) => {
        acc.productiveHours += row.productiveHours;
        acc.pmApprovedHours += row.pmApprovedHours;
        acc.employeeCount += row.employeeCount;
        acc.budgetedHours += row.budgetedHours;
        return acc;
      },
      { productiveHours: 0, pmApprovedHours: 0, employeeCount: 0, budgetedHours: 0 },
    );
    return NextResponse.json({
      status: 'success',
      data: {
        gate,
        generatedAt: new Date().toISOString(),
        rows,
        totals: {
          ...totals,
          productiveHours: Math.round(totals.productiveHours * 10) / 10,
          pmApprovedHours: Math.round(totals.pmApprovedHours * 10) / 10,
          budgetedHours: Math.round(totals.budgetedHours * 10) / 10,
          projectsWithHours: rows.filter((row) => row.productiveHours > 0).length,
        },
      },
    });
  } catch (error) {
    return NextResponse.json(
      { status: 'error', error: error instanceof Error ? error.message : 'Unable to load man-hour summary' },
      { status: 500 },
    );
  }
}
