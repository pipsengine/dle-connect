import { NextResponse } from 'next/server';
import { applyContractPayrollClassification, findDirectoryEmployee, type ContractPayrollClassificationAction } from '@/lib/contract-payroll-classification-service';
import { contractPayrollClassification } from '@/lib/payroll-employee-classification';

const jsonOk = <T,>(data: T) => NextResponse.json({ status: 'success', data });
const jsonErr = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });

const allowedActions: ContractPayrollClassificationAction[] = ['deactivate-non-daily', 'activate-daily-rate'];

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const employee = await findDirectoryEmployee(id);
    if (!employee) return jsonErr(404, 'Employee not found');
    return jsonOk({
      employeeId: employee.employeeCode || employee.employeeId,
      employmentStatus: employee.status,
      employmentType: employee.employmentType,
      payrollGroup: employee.payrollGroup,
      classification: employee.payrollClassification || contractPayrollClassification(employee),
    });
  } catch (error) {
    return jsonErr(502, error instanceof Error ? error.message : 'Unable to load classification');
  }
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => null)) as { action?: ContractPayrollClassificationAction; reason?: string } | null;
  if (!body?.action || !allowedActions.includes(body.action)) {
    return jsonErr(400, 'action must be deactivate-non-daily or activate-daily-rate');
  }
  try {
    const result = await applyContractPayrollClassification({ employeeId: id, action: body.action, reason: body.reason });
    return jsonOk(result);
  } catch (error) {
    return jsonErr(400, error instanceof Error ? error.message : 'Classification update failed');
  }
}
