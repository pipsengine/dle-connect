import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';
import {
  buildExitClearancePayload,
  currentExitClearancePeriod,
  exitClearancesToCsv,
  updateExitClearanceCase,
} from '@/lib/exit-clearance-store';

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
    const period = searchParams.get('period') || currentExitClearancePeriod();
    const selectedId = searchParams.get('id');
    const employeeCode = searchParams.get('employeeCode') || searchParams.get('code');
    const employeeId = searchParams.get('employeeId');
    const format = searchParams.get('format');
    const actor = await resolveActor();

    const payload = await buildExitClearancePayload({
      period,
      selectedId,
      employeeCode,
      employeeId,
      actor,
    });

    if (format === 'csv') {
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
    return NextResponse.json(
      { ok: false, error: error?.message || 'Unable to load exit clearance.' },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await resolveActor();
    const body = await request.json().catch(() => ({}));
    const id = String(body.id || '').trim();
    if (!id) return NextResponse.json({ ok: false, error: 'Exit clearance id is required.' }, { status: 400 });

    const updated = await updateExitClearanceCase({
      id,
      actor,
      lineId: body.lineId,
      lineStatus: body.lineStatus,
      action: body.action || 'save',
      note: body.note,
    });
    const payload = await buildExitClearancePayload({
      period: updated.period,
      selectedId: updated.id,
      actor,
    });
    return NextResponse.json({ ok: true, case: updated, ...payload });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || 'Unable to update exit clearance.' },
      { status: 400 },
    );
  }
}
