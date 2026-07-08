import { NextResponse } from 'next/server';
import {
  actOnPayrollArrearsRequest,
  arrearsRequestsForPeriod,
  createPayrollArrearsRequest,
  readPayrollArrearsRequests,
} from '@/lib/payroll-arrears-store';
import { normalizePayrollPeriod } from '@/lib/payroll-leave-allowance-store';
import {
  periodEarningAdjustmentsForPeriod,
  TIMESHEET_OT_POSTING_SOURCE,
  HR_ARREARS_POSTING_SOURCE,
} from '@/lib/payroll-period-earning-adjustments-store';
import { postPermanentTimesheetOvertimeToPayroll } from '@/lib/payroll-timesheet-ot-posting';
import { activePayrollPeriod } from '@/lib/payroll-periods';

type Role = 'Super Admin' | 'HR Director' | 'HR Manager' | 'Payroll Officer' | 'Finance Controller' | 'Executive Management' | 'Auditor' | 'Employee';

const ok = <T,>(data: T) => NextResponse.json({ status: 'success', data });
const err = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });

const getRole = (request: Request): Role => {
  const value = request.headers.get('x-hris-role');
  const roles: Role[] = ['Super Admin', 'HR Director', 'HR Manager', 'Payroll Officer', 'Finance Controller', 'Executive Management', 'Auditor', 'Employee'];
  return roles.includes(value as Role) ? (value as Role) : 'Payroll Officer';
};

const permissions = (role: Role) => ({
  canView: ['Super Admin', 'HR Director', 'HR Manager', 'Payroll Officer', 'Finance Controller', 'Executive Management', 'Auditor'].includes(role),
  canCreateArrears: ['Super Admin', 'HR Director', 'HR Manager', 'Payroll Officer'].includes(role),
  canApproveHr: ['Super Admin', 'HR Director', 'HR Manager'].includes(role),
  canApproveFinance: ['Super Admin', 'HR Director', 'Finance Controller'].includes(role),
  canPostOvertime: ['Super Admin', 'HR Director', 'HR Manager', 'Payroll Officer'].includes(role),
});

const actorFrom = (request: Request, body: Record<string, unknown>) =>
  String(body.actor || request.headers.get('x-hris-user') || getRole(request));

export async function GET(request: Request) {
  try {
    const role = getRole(request);
    const perms = permissions(role);
    if (!perms.canView) return err(403, 'Permission denied');

    const { searchParams } = new URL(request.url);
    const period = normalizePayrollPeriod(searchParams.get('period') || activePayrollPeriod());
    const [arrears, timesheetOtAdjustments, arrearsAdjustments] = await Promise.all([
      arrearsRequestsForPeriod(period),
      periodEarningAdjustmentsForPeriod(period, TIMESHEET_OT_POSTING_SOURCE),
      periodEarningAdjustmentsForPeriod(period, HR_ARREARS_POSTING_SOURCE),
    ]);

    return ok({
      period,
      role,
      permissions: perms,
      arrears,
      timesheetOt: {
        postedLines: timesheetOtAdjustments.length,
        totalAmount: timesheetOtAdjustments.reduce((sum, row) => sum + Number(row.amount || 0), 0),
        adjustments: timesheetOtAdjustments,
      },
      postedArrears: {
        postedLines: arrearsAdjustments.length,
        totalAmount: arrearsAdjustments.reduce((sum, row) => sum + Number(row.amount || 0), 0),
        adjustments: arrearsAdjustments,
      },
    });
  } catch (error) {
    return err(500, error instanceof Error ? error.message : 'Unable to load earning intake.');
  }
}

export async function POST(request: Request) {
  try {
    const role = getRole(request);
    const perms = permissions(role);
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || '').trim();
    const actor = actorFrom(request, body);

    if (action === 'create-arrears') {
      if (!perms.canCreateArrears) return err(403, 'Permission denied');
      const requestRow = await createPayrollArrearsRequest({
        employeeCode: String(body.employeeCode || ''),
        period: String(body.period || activePayrollPeriod()),
        amount: Number(body.amount || 0),
        reason: String(body.reason || ''),
        memo: body.memo ? String(body.memo) : undefined,
        actor,
        submitForApproval: Boolean(body.submitForApproval),
      });
      return ok({ request: requestRow });
    }

    if (['submit', 'hr-approve', 'finance-approve', 'reject', 'post'].includes(action)) {
      if (action === 'hr-approve' && !perms.canApproveHr) return err(403, 'Permission denied');
      if (action === 'finance-approve' && !perms.canApproveFinance) return err(403, 'Permission denied');
      if (['submit', 'post', 'reject'].includes(action) && !perms.canCreateArrears) return err(403, 'Permission denied');
      const requestRow = await actOnPayrollArrearsRequest({
        requestId: String(body.requestId || ''),
        action: action as 'submit' | 'hr-approve' | 'finance-approve' | 'reject' | 'post',
        actor,
        note: body.note ? String(body.note) : undefined,
      });
      return ok({ request: requestRow });
    }

    if (action === 'post-timesheet-ot') {
      if (!perms.canPostOvertime) return err(403, 'Permission denied');
      const summary = await postPermanentTimesheetOvertimeToPayroll(String(body.period || activePayrollPeriod()));
      return ok({ summary });
    }

    if (action === 'list-arrears') {
      if (!perms.canView) return err(403, 'Permission denied');
      const period = normalizePayrollPeriod(String(body.period || activePayrollPeriod()));
      const arrears = period ? await arrearsRequestsForPeriod(period) : await readPayrollArrearsRequests();
      return ok({ arrears });
    }

    return err(400, 'Unsupported action.');
  } catch (error) {
    return err(400, error instanceof Error ? error.message : 'Unable to process earning intake action.');
  }
}
