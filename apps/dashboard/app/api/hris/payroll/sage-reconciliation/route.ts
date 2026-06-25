import { NextResponse } from 'next/server';
import { buildPayrollSageReconciliation } from '@/lib/payroll-sage-reconciliation-service';
import { managementPermissions, payrollSessionContext } from '@/lib/payroll-session';

const ok = <T,>(data: T) => NextResponse.json({ status: 'success', data });
const err = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });
const compact = (value: unknown) => String(value || '').trim();

export async function GET(request: Request) {
  try {
    const { role } = await payrollSessionContext(request);
    const perms = managementPermissions(role);
    if (!perms.canViewMoney && !perms.canManageRun && !perms.canConfigure) return err(403, 'Permission denied');

    const url = new URL(request.url);
    const referencePeriod = compact(url.searchParams.get('referencePeriod')) || '2026-05';
    const targetPeriod = compact(url.searchParams.get('targetPeriod')) || '2026-06';
    const employeeId = compact(url.searchParams.get('employeeId')) || undefined;
    const detailLimit = Number(url.searchParams.get('detailLimit') || 60);

    const payload = await buildPayrollSageReconciliation({
      referencePeriod,
      targetPeriod,
      employeeId,
      detailLimit: Number.isFinite(detailLimit) ? detailLimit : 60,
    });

    return ok(payload);
  } catch (error) {
    return err(500, error instanceof Error ? error.message : 'Unable to build payroll reconciliation.');
  }
}
