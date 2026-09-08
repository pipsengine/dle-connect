import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';
import {
  buildResignationPayload,
  createResignation,
  currentResignationPeriod,
  findResignationByEmployee,
  getResignation,
  resignationsToCsv,
  searchEmployeesForResignation,
  updateResignation,
} from '@/lib/resignation-management-store';

export const dynamic = 'force-dynamic';

const resolveActor = async () => {
  const jar = await cookies();
  const token = jar.get(AUTH_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;
  return session?.fullName || session?.username || session?.sub || 'HR User';
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || currentResignationPeriod();
    const selectedId = searchParams.get('id');
    const employeeCode = searchParams.get('employeeCode') || searchParams.get('code');
    const employeeId = searchParams.get('employeeId');
    const q = searchParams.get('q');
    const format = searchParams.get('format');

    if (q) {
      const results = await searchEmployeesForResignation(q);
      return NextResponse.json({ ok: true, results });
    }

    if (searchParams.get('lookup') === 'employee') {
      const code = employeeCode || employeeId || '';
      const resignation = await findResignationByEmployee({ employeeCode, employeeId });
      return NextResponse.json({
        ok: true,
        resignation,
        registerHref: resignation
          ? `/hris/offboarding/resignation-management?id=${encodeURIComponent(resignation.id)}&period=${encodeURIComponent(resignation.period)}`
          : `/hris/offboarding/resignation-management${period ? `?period=${encodeURIComponent(period)}` : ''}`,
        newResignationHref: `/hris/offboarding/resignation-management/new?employeeCode=${encodeURIComponent(code)}`,
      });
    }

    const payload = await buildResignationPayload({
      period,
      selectedId,
      employeeCode,
      employeeId,
    });

    if (format === 'csv') {
      return new NextResponse(resignationsToCsv(payload.resignations), {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="resignations-${period}.csv"`,
        },
      });
    }

    return NextResponse.json({ ok: true, ...payload });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || 'Unable to load resignations.' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const actor = await resolveActor();
    const body = await request.json().catch(() => ({}));
    const resignation = await createResignation({
      actor,
      period: body.period,
      employeeCode: body.employeeCode,
      resignationDate: body.resignationDate,
      lastWorkingDay: body.lastWorkingDay,
      noticePeriodDays: body.noticePeriodDays,
      reasonForLeaving: body.reasonForLeaving,
      remarks: body.remarks,
      email: body.email,
      phone: body.phone,
      alternativeEmail: body.alternativeEmail,
      address: body.address,
      nextOfKinName: body.nextOfKinName,
      nextOfKinRelationship: body.nextOfKinRelationship,
      nextOfKinPhone: body.nextOfKinPhone,
      nextOfKinEmail: body.nextOfKinEmail,
      propertyAcknowledged: body.propertyAcknowledged,
      submissionChannel: body.submissionChannel,
    });
    const payload = await buildResignationPayload({
      period: resignation.period,
      selectedId: resignation.id,
    });
    return NextResponse.json({ ok: true, resignation, ...payload });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || 'Unable to create resignation.' },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await resolveActor();
    const body = await request.json().catch(() => ({}));
    const id = String(body.id || '').trim();
    if (!id) return NextResponse.json({ ok: false, error: 'Resignation id is required.' }, { status: 400 });
    if (!(await getResignation(id))) {
      return NextResponse.json({ ok: false, error: 'Resignation not found.' }, { status: 404 });
    }
    const resignation = await updateResignation({
      id,
      actor,
      action: body.action || 'save',
      comment: body.comment,
      patch: body.patch,
    });
    const payload = await buildResignationPayload({
      period: resignation.period,
      selectedId: resignation.id,
    });
    return NextResponse.json({ ok: true, resignation, ...payload });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || 'Unable to update resignation.' },
      { status: 400 },
    );
  }
}
