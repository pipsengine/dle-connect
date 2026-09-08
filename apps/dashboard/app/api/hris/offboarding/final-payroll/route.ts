import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';
import {
  buildFinalPayrollPayload,
  createFinalPayrollSettlement,
  currentFinalPayrollPeriod,
  getFinalPayrollSettlement,
  resolveFinalPayrollForEmployee,
  searchEmployeesForFinalPayroll,
  settlementsToCsv,
  updateFinalPayrollSettlement,
} from '@/lib/final-payroll-settlement-store';

export const dynamic = 'force-dynamic';

const resolveActor = async () => {
  const jar = await cookies();
  const token = jar.get(AUTH_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;
  return {
    actor: session?.fullName || session?.username || session?.sub || 'HR User',
    session,
  };
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || currentFinalPayrollPeriod();
    const selectedId = searchParams.get('id');
    const employeeCode = searchParams.get('employeeCode') || searchParams.get('code');
    const employeeId = searchParams.get('employeeId');
    const q = searchParams.get('q');
    const format = searchParams.get('format');
    const lookup = searchParams.get('lookup');

    if (q) {
      const results = await searchEmployeesForFinalPayroll(q);
      return NextResponse.json({ ok: true, results });
    }

    if (lookup === 'employee' || ((employeeCode || employeeId) && searchParams.get('profile') === '1')) {
      const resolved = await resolveFinalPayrollForEmployee({ employeeCode, employeeId, period });
      return NextResponse.json({ ok: true, period, ...(resolved || { settlement: null }) });
    }

    const payload = await buildFinalPayrollPayload({
      period,
      selectedId,
      employeeCode,
      employeeId,
    });
    if (format === 'csv') {
      const csv = settlementsToCsv(payload.settlements);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="final-payroll-${period}.csv"`,
        },
      });
    }

    return NextResponse.json({ ok: true, ...payload });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || 'Unable to load final payroll settlements.' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const { actor } = await resolveActor();
    const body = await request.json().catch(() => ({}));
    const settlement = await createFinalPayrollSettlement({
      actor,
      period: body.period,
      employeeCode: body.employeeCode,
      exitType: body.exitType,
      resignationDate: body.resignationDate,
      lastWorkingDay: body.lastWorkingDay,
      noticePeriod: body.noticePeriod,
      reasonForLeaving: body.reasonForLeaving,
      remarks: body.remarks,
    });
    const payload = await buildFinalPayrollPayload({
      period: settlement.period,
      selectedId: settlement.id,
      actor,
    });
    return NextResponse.json({ ok: true, settlement, ...payload });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || 'Unable to create final payroll settlement.' },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const { actor } = await resolveActor();
    const body = await request.json().catch(() => ({}));
    const id = String(body.id || '').trim();
    if (!id) {
      return NextResponse.json({ ok: false, error: 'Settlement id is required.' }, { status: 400 });
    }

    const existing = await getFinalPayrollSettlement(id);
    if (!existing) {
      return NextResponse.json({ ok: false, error: 'Settlement not found.' }, { status: 404 });
    }

    const settlement = await updateFinalPayrollSettlement({
      id,
      actor,
      action: body.action || 'save',
      comment: body.comment,
      patch: body.patch,
    });
    const payload = await buildFinalPayrollPayload({
      period: settlement.period,
      selectedId: settlement.id,
      actor,
    });
    return NextResponse.json({ ok: true, settlement, ...payload });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || 'Unable to update final payroll settlement.' },
      { status: 400 },
    );
  }
}
