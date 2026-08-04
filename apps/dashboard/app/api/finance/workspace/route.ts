import { NextResponse } from 'next/server';
import { buildFinanceBadges, buildFinanceCommandCentre, listFinanceApprovalRequests } from '@/lib/finance-intelligence/store';

const jsonOk = <T,>(data: T) => NextResponse.json({ status: 'success', data });
const jsonErr = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const view = String(searchParams.get('view') || 'command-centre');

    if (view === 'badges') {
      return jsonOk(await buildFinanceBadges());
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
