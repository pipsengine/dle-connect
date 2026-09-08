import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';
import {
  buildHandoverPayload,
  currentHandoverPeriod,
  handoversToCsv,
  updateHandoverCase,
} from '@/lib/handover-checklist-store';

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
    const period = searchParams.get('period') || currentHandoverPeriod();
    const selectedId = searchParams.get('id');
    const employeeCode = searchParams.get('employeeCode') || searchParams.get('code');
    const employeeId = searchParams.get('employeeId');
    const format = searchParams.get('format');
    const actor = await resolveActor();

    const payload = await buildHandoverPayload({
      period,
      selectedId,
      employeeCode,
      employeeId,
      actor,
    });

    if (format === 'csv') {
      return new NextResponse(handoversToCsv(payload.cases), {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="handover-checklist-${period}.csv"`,
        },
      });
    }

    return NextResponse.json({ ok: true, ...payload });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || 'Unable to load handover checklist.' },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await resolveActor();
    const body = await request.json().catch(() => ({}));
    const id = String(body.id || '').trim();
    if (!id) return NextResponse.json({ ok: false, error: 'Handover case id is required.' }, { status: 400 });

    const updated = await updateHandoverCase({
      id,
      actor,
      itemId: body.itemId,
      itemStatus: body.itemStatus,
      action: body.action || 'save',
      note: body.note,
    });
    const payload = await buildHandoverPayload({
      period: updated.period,
      selectedId: updated.id,
      actor,
    });
    return NextResponse.json({ ok: true, case: updated, ...payload });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || 'Unable to update handover checklist.' },
      { status: 400 },
    );
  }
}
