import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  assertExitClearanceAccess,
  assertExitClearanceHrAction,
  assertOffboardingManagementAccess,
  isExitClearanceHrMode,
  type OffboardingSession,
} from '@/lib/access/offboarding-access';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { readPayrollEmployees } from '@/lib/payroll-employee-source';
import {
  buildExitClearancePayload,
  currentExitClearancePeriod,
  exitClearancesToCsv,
  openExitClearanceForEmployee,
  updateExitClearanceCase,
} from '@/lib/exit-clearance-store';

export const dynamic = 'force-dynamic';

const compact = (value: unknown) => String(value || '').trim();
const codesMatch = (left?: string | null, right?: string | null) => {
  const a = compact(left).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const b = compact(right).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!a || !b) return false;
  return a === b || a.replace(/^P/, '') === b.replace(/^P/, '');
};

const resolveSession = async (): Promise<OffboardingSession | null> => {
  const jar = await cookies();
  const token = jar.get(AUTH_COOKIE)?.value;
  return token ? await verifySessionToken(token) : null;
};

const resolveViewer = async (session: OffboardingSession) => {
  const source = await readPayrollEmployees().catch(() => null);
  const employee = (source?.employees || []).find((row) =>
    codesMatch(row.employeeCode, session.employeeCode)
    || codesMatch(row.employeeId, session.employeeId)
    || codesMatch(row.employeeCode, session.employeeId)
    || (session.fullName && compact(row.fullName).toLowerCase() === compact(session.fullName).toLowerCase()),
  );
  return {
    fullName: session.fullName || employee?.fullName || null,
    employeeCode: session.employeeCode || employee?.employeeCode || null,
    employeeId: session.employeeId || employee?.employeeId || null,
    email: employee?.officialEmail || employee?.email || employee?.personalEmail || null,
    emails: [
      employee?.officialEmail,
      employee?.email,
      employee?.personalEmail,
    ].filter(Boolean) as string[],
  };
};

export async function GET(request: Request) {
  try {
    const session = await resolveSession();
    assertExitClearanceAccess(session);
    const hrMode = isExitClearanceHrMode(session!);
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || currentExitClearancePeriod();
    const selectedId = searchParams.get('id');
    const employeeCode = searchParams.get('employeeCode') || searchParams.get('code');
    const employeeId = searchParams.get('employeeId');
    const format = searchParams.get('format');
    const q = searchParams.get('q');
    const actor = session!.fullName || session!.username || session!.sub || 'User';

    if (q) {
      assertOffboardingManagementAccess(session);
      const { searchEmployeesForResignation } = await import('@/lib/resignation-management-store');
      const results = await searchEmployeesForResignation(q);
      return NextResponse.json({ ok: true, results });
    }

    const viewer = await resolveViewer(session!);
    const payload = await buildExitClearancePayload({
      period,
      selectedId,
      employeeCode,
      employeeId,
      actor,
      viewer,
      accessMode: hrMode ? 'hr' : 'line-manager',
    });

    if (format === 'csv') {
      assertOffboardingManagementAccess(session);
      return new NextResponse(exitClearancesToCsv(payload.cases), {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="exit-clearance-${period}.csv"`,
        },
      });
    }

    return NextResponse.json({ ok: true, ...payload });
  } catch (error: any) {
    const message = error?.message || 'Unable to load exit clearance.';
    const status = /restricted/i.test(message) ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const session = await resolveSession();
    assertOffboardingManagementAccess(session);
    const actor = session!.fullName || session!.username || session!.sub || 'HR User';
    const body = await request.json().catch(() => ({}));
    const employeeCode = String(body.employeeCode || body.code || '').trim();
    const employeeId = String(body.employeeId || '').trim();
    if (!employeeCode && !employeeId) {
      return NextResponse.json({ ok: false, error: 'Employee code is required to open a clearance form.' }, { status: 400 });
    }
    const opened = await openExitClearanceForEmployee({
      actor,
      employeeCode,
      employeeId,
      period: body.period,
    });
    const payload = await buildExitClearancePayload({
      period: opened.period,
      selectedId: opened.id,
      actor,
      accessMode: 'hr',
    });
    return NextResponse.json({ ok: true, case: opened, ...payload });
  } catch (error: any) {
    const message = error?.message || 'Unable to open clearance form.';
    const status = /restricted/i.test(message) ? 403 : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await resolveSession();
    assertExitClearanceAccess(session);
    const hrMode = isExitClearanceHrMode(session!);
    const actor = session!.fullName || session!.username || session!.sub || 'User';
    const body = await request.json().catch(() => ({}));
    const id = String(body.id || '').trim();
    if (!id) return NextResponse.json({ ok: false, error: 'Exit clearance id is required.' }, { status: 400 });

    const action = body.action || 'save';
    assertExitClearanceHrAction(session, action);

    const viewer = await resolveViewer(session!);
    const updated = await updateExitClearanceCase({
      id,
      actor,
      action,
      sectionId: body.sectionId,
      itemId: body.itemId,
      itemState: body.itemState,
      itemDetail: body.itemDetail,
      itemAmount: body.itemAmount,
      signedBy: body.signedBy,
      signedAt: body.signedAt,
      dateOfExit: body.dateOfExit,
      sections: hrMode ? body.sections : undefined,
      hrFinal: hrMode ? body.hrFinal : undefined,
      financeFinal: hrMode ? body.financeFinal : undefined,
      rejectionReason: body.rejectionReason,
      viewer,
      accessMode: hrMode ? 'hr' : 'line-manager',
    });
    const payload = await buildExitClearancePayload({
      period: updated.period,
      selectedId: updated.id,
      actor,
      viewer,
      accessMode: hrMode ? 'hr' : 'line-manager',
    });
    return NextResponse.json({ ok: true, case: updated, ...payload });
  } catch (error: any) {
    const message = error?.message || 'Unable to update exit clearance.';
    const status = /restricted|only hr|only approve|only reject/i.test(message) ? 403 : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
