import { NextResponse } from 'next/server';
import { applyContractPayrollClassificationBulk, type ContractPayrollClassificationAction } from '@/lib/contract-payroll-classification-service';

const jsonOk = <T,>(data: T) => NextResponse.json({ status: 'success', data });
const jsonErr = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });

const allowedActions: ContractPayrollClassificationAction[] = ['deactivate-non-daily', 'activate-daily-rate'];

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    action?: ContractPayrollClassificationAction;
    employeeIds?: string[];
    applyAll?: boolean;
    reason?: string;
  } | null;
  if (!body?.action || !allowedActions.includes(body.action)) return jsonErr(400, 'action must be deactivate-non-daily or activate-daily-rate');
  if (!body.applyAll && (!Array.isArray(body.employeeIds) || !body.employeeIds.length)) {
    return jsonErr(400, 'employeeIds is required unless applyAll is true');
  }
  try {
    const result = await applyContractPayrollClassificationBulk({
      action: body.action,
      employeeIds: body.employeeIds,
      applyAll: Boolean(body.applyAll),
      reason: body.reason,
    });
    return jsonOk(result);
  } catch (error) {
    return jsonErr(502, error instanceof Error ? error.message : 'Bulk classification failed');
  }
}
