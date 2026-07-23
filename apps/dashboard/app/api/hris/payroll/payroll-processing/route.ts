import { NextResponse } from 'next/server';
import { buildProcessingPayload } from '@/lib/payroll-payload-service';
import { normalizePayrollApprovalAction } from '@/lib/payroll-approval-workflow';
import { getActivePayrollPeriod } from '@/lib/payroll-period-store';
import { payrollSessionContext, processingPermissions } from '@/lib/payroll-session';
import { executePayrollWorkflowAction } from '@/lib/payroll-workflow-service';
import { resolveWorkflowLinkOriginFromRequest } from '@/lib/public-app-url';

const ok = <T,>(data: T) => NextResponse.json({ status: 'success', data });
const err = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });
const compact = (value: unknown) => String(value || '').trim();

const csv = (records: any[]) => {
  const headers = ['Employee ID', 'Name', 'Department', 'Payroll Group', 'Generated Gross', 'Sage Gross', 'Gross Variance', 'Generated PAYE', 'Generated Pension Employee', 'Generated Statutory Employee', 'Generated Loan', 'Generated Deductions', 'Sage Deductions', 'Deduction Variance', 'Generated Net Pay', 'Sage Net Pay', 'Net Variance', 'Employer Cost', 'Discrepancy Status', 'Payroll Status', 'Issues'];
  const lines = records.map((record) =>
    [record.employeeId, record.fullName, record.department, record.payrollGroup, record.grossPay, record.sageActual?.grossPay ?? '', record.discrepancies?.grossVariance ?? '', record.paye, record.pensionEmployee, record.statutoryEmployee, record.loanRecovery, record.totalDeductions, record.sageActual?.totalDeductions ?? '', record.discrepancies?.deductionVariance ?? '', record.netPay, record.sageActual?.netPay ?? '', record.discrepancies?.netVariance ?? '', record.employerCost, record.discrepancies?.status || '', record.status, record.issues.join('; ')]
      .map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`)
      .join(','),
  );
  return [headers.join(','), ...lines].join('\n');
};

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const period = url.searchParams.get('period') || (await getActivePayrollPeriod());
    const pack = url.searchParams.get('pack');
    const payload = await buildProcessingPayload(request, period, pack);
    if (url.searchParams.get('format') === 'csv') {
      if (!payload.permissions.canExport) return err(403, 'Permission denied');
      return new Response(csv(payload.records), {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="payroll-processing-${period}-${payload.pack || 'salaried'}.csv"`,
        },
      });
    }
    return ok(payload);
  } catch (error) {
    return err(500, error instanceof Error ? error.message : 'Unable to load payroll processing.');
  }
}

export async function POST(request: Request) {
  try {
    const { role, actor, ip, isGlobalAdmin, processingPerms } = await payrollSessionContext(request);
    const perms = processingPerms;
    const body = await request.json().catch(() => ({}));
    const action = normalizePayrollApprovalAction(compact(body.action));
    const period = compact(body.period) || (await getActivePayrollPeriod());
    const pack = compact(body.pack) || null;
    const runId = compact(body.runId) || null;
    const note = compact(body.note);
    const reason = compact(body.reason);
    const origin = resolveWorkflowLinkOriginFromRequest(request);

    if (!action) return err(400, 'Action is required.');
    if (['calculate', 'create-run', 'validate-payroll', 'create-period', 'open-period'].includes(action) && !perms.canCalculate) {
      return err(403, 'Permission denied');
    }
    if ((action === 'submit' || action === 'submit-run') && !perms.canSubmit) return err(403, 'Submit permission denied');
    if (action === 'hr-manager-approve' && !perms.canApproveHrManager) return err(403, 'HR Manager approval permission denied');
    if (action === 'finance-manager-approve' && !perms.canApproveFinanceManager) return err(403, 'Finance Manager approval permission denied');
    if (action === 'cfo-approve' && !perms.canApproveCfo) return err(403, 'CFO approval permission denied');
    if (action === 'md-ceo-approve' && !perms.canApproveMdCeo) return err(403, 'MD / CEO approval permission denied');
    if (['lock', 'post', 'reopen', 'close-period'].includes(action) && !perms.canLock) return err(403, 'Lock/post permission denied');
    if (action === 'reopen-period' && !perms.canReopen) return err(403, 'Reopen permission denied');
    if (['reject-run', 'request-revision'].includes(action) && !perms.canReject) {
      return err(403, 'Reject/revision permission denied');
    }

    const result = await executePayrollWorkflowAction({
      action: action === 'submit' ? 'submit-run' : action,
      period,
      pack,
      runId,
      actor,
      role,
      reason: reason || undefined,
      comment: note || undefined,
      ip,
      paymentDate: body.paymentDate || null,
      isGlobalAdmin,
      baseUrl: origin,
    });

    return ok({
      run: {
        id: result.run.id,
        period: result.run.period,
        periodLabel: result.run.periodLabel,
        pack: result.run.pack,
        status: result.run.status,
        employeeCount: result.run.employeeCount,
        grossPay: result.run.grossPay,
        netPay: result.run.netPay,
        totalDeductions: result.run.deductions,
        employerCost: result.run.employerCost,
        exceptionCount: result.run.exceptionCount,
        createdAt: result.run.createdAt,
        createdBy: result.run.createdBy,
        updatedAt: result.run.updatedAt,
        updatedBy: result.run.updatedBy,
      },
      runs: (result as { runs?: typeof result.run[] }).runs || undefined,
    });
  } catch (error) {
    return err(error instanceof Error && /permission|cannot|blocked|requires/i.test(error.message) ? 409 : 500, error instanceof Error ? error.message : 'Unable to update payroll run.');
  }
}
