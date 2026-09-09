import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { assertOffboardingManagementAccess } from '@/lib/access/offboarding-access';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';
import {
  assetReturnsToCsv,
  buildAssetReturnPayload,
  currentAssetReturnPeriod,
  updateAssetReturnCase,
} from '@/lib/asset-return-store';

export const dynamic = 'force-dynamic';

const resolveSession = async () => {
  const jar = await cookies();
  const token = jar.get(AUTH_COOKIE)?.value;
  return token ? await verifySessionToken(token) : null;
};

export async function GET(request: Request) {
  try {
    const session = await resolveSession();
    assertOffboardingManagementAccess(session);
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || currentAssetReturnPeriod();
    const selectedId = searchParams.get('id');
    const employeeCode = searchParams.get('employeeCode') || searchParams.get('code');
    const employeeId = searchParams.get('employeeId');
    const format = searchParams.get('format');
    const actor = session!.fullName || session!.username || session!.sub || 'HR User';

    const payload = await buildAssetReturnPayload({
      period,
      selectedId,
      employeeCode,
      employeeId,
      actor,
    });

    if (format === 'csv') {
      return new NextResponse(assetReturnsToCsv(payload.cases), {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="asset-return-${period}.csv"`,
        },
      });
    }

    return NextResponse.json({ ok: true, ...payload });
  } catch (error: any) {
    const message = error?.message || 'Unable to load asset return.';
    return NextResponse.json({ ok: false, error: message }, { status: /restricted/i.test(message) ? 403 : 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await resolveSession();
    assertOffboardingManagementAccess(session);
    const actor = session!.fullName || session!.username || session!.sub || 'HR User';
    const body = await request.json().catch(() => ({}));
    const id = String(body.id || '').trim();
    if (!id) return NextResponse.json({ ok: false, error: 'Asset return id is required.' }, { status: 400 });

    const updated = await updateAssetReturnCase({
      id,
      actor,
      assetId: body.assetId,
      assetStatus: body.assetStatus,
      action: body.action || 'save',
      note: body.note,
      tagOrSerial: body.tagOrSerial,
      condition: body.condition,
    });
    const payload = await buildAssetReturnPayload({
      period: updated.period,
      selectedId: updated.id,
      actor,
    });
    return NextResponse.json({ ok: true, case: updated, ...payload });
  } catch (error: any) {
    const message = error?.message || 'Unable to update asset return.';
    return NextResponse.json({ ok: false, error: message }, { status: /restricted/i.test(message) ? 403 : 400 });
  }
}
