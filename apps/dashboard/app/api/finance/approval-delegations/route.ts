import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';
import {
  buildApprovalDelegationWorkspace,
  cancelApprovalDelegation,
  upsertApprovalDelegation,
  type DelegationScope,
  type DelegationStatus,
} from '@/lib/finance-intelligence/approval-delegation-service';

const jsonOk = <T,>(data: T) => NextResponse.json({ status: 'success', data });
const jsonErr = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });

const resolveActor = async () => {
  const jar = await cookies();
  const token = jar.get(AUTH_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;
  return session?.fullName || session?.username || session?.sub || 'Finance User';
};

export async function GET() {
  try {
    return jsonOk(await buildApprovalDelegationWorkspace());
  } catch (error) {
    return jsonErr(500, error instanceof Error ? error.message : 'Unable to load delegation rules.');
  }
}

export async function POST(request: Request) {
  try {
    const actor = await resolveActor();
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || 'upsert').trim();

    if (action === 'upsert') {
      const result = await upsertApprovalDelegation({
        delegationId: body.delegationId,
        fromEmployeeCode: body.fromEmployeeCode,
        fromEmployeeName: body.fromEmployeeName,
        toEmployeeCode: body.toEmployeeCode,
        toEmployeeName: body.toEmployeeName,
        approverRole: body.approverRole,
        scope: body.scope as DelegationScope,
        startsAt: String(body.startsAt || new Date().toISOString()),
        endsAt: body.endsAt === '' || body.endsAt == null ? null : String(body.endsAt),
        status: body.status as DelegationStatus | undefined,
        reason: body.reason,
        actor,
      });
      return jsonOk({
        ...result,
        message: body.delegationId ? 'Delegation rule updated.' : 'Delegation rule created.',
      });
    }

    if (action === 'cancel') {
      const delegationId = String(body.delegationId || '').trim();
      if (!delegationId) return jsonErr(400, 'delegationId is required.');
      const result = await cancelApprovalDelegation({
        delegationId,
        actor,
        reason: body.reason,
      });
      return jsonOk({ ...result, message: 'Delegation cancelled.' });
    }

    return jsonErr(400, 'Unsupported delegation action.');
  } catch (error) {
    return jsonErr(400, error instanceof Error ? error.message : 'Unable to save delegation rule.');
  }
}
