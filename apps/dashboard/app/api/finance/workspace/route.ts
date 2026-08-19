import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { isMdCeoActor } from '@/lib/finance-intelligence/payment-access';
import {
  buildFinanceApprovalCentre,
  buildFinanceBadges,
  buildFinanceCommandCentre,
  listFinanceApprovalRequests,
} from '@/lib/finance-intelligence/store';

const jsonOk = <T,>(data: T) => NextResponse.json({ status: 'success', data });
const jsonErr = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });

const resolveBadgeActor = async () => {
  const jar = await cookies();
  const token = jar.get(AUTH_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;
  const actorCode = String(session?.employeeCode || session?.employeeId || session?.username || session?.sub || '').trim();
  const actor = {
    actorCode,
    roles: session?.roles || [],
    isGlobalAdmin: Boolean(session?.isGlobalAdmin),
  };
  return {
    actorCode,
    includeMdCeoStage: isMdCeoActor(actor),
  };
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const view = String(searchParams.get('view') || 'command-centre');

    if (view === 'badges') {
      const actor = await resolveBadgeActor();
      return jsonOk(await buildFinanceBadges(actor));
    }
    if (view === 'approval-centre') {
      return jsonOk(await buildFinanceApprovalCentre());
    }
    if (view === 'approvals') {
      const status = searchParams.get('status') || undefined;
      const mineFor = searchParams.get('mineFor') || undefined;
      return jsonOk({ rows: await listFinanceApprovalRequests({ status, mineFor }) });
    }

    return jsonOk(await buildFinanceCommandCentre());
  } catch (error) {
    return jsonErr(500, error instanceof Error ? error.message : 'Unable to load finance workspace.');
  }
}
