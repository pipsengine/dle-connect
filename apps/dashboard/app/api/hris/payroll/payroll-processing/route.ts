import { NextResponse } from 'next/server';
import { buildProcessingPayload } from '@/lib/payroll-payload-service';
import { normalizePayrollApprovalAction } from '@/lib/payroll-approval-workflow';
import { getActivePayrollPeriod } from '@/lib/payroll-period-store';
import { payrollSessionContext, processingPermissions } from '@/lib/payroll-session';
import { executePayrollWorkflowAction } from '@/lib/payroll-workflow-service';
import { resolveWorkflowLinkOriginFromRequest } from '@/lib/public-app-url';
import { buildExcelWorkbookXml, excelMimeType } from '@/lib/excel-export';
import {
  basicEarningAmount,
  summarizePayrollComponentKey,
  unionDeductionAmount,
} from '@/lib/payroll-earning-summary';

const ok = <T,>(data: T) => NextResponse.json({ status: 'success', data });
const err = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });
const compact = (value: unknown) => String(value || '').trim();

const baseExportHeaders = [
  'Employee ID',
  'Name',
  'Department',
  'Payroll Group',
  'Basic earning',
  'Union Deductions',
  'Generated Gross',
  'Sage Gross',
  'Gross Variance',
  'Generated PAYE',
  'Generated Pension Employee',
  'Generated Statutory Employee',
  'Generated Loan',
  'Generated Deductions',
  'Sage Deductions',
  'Deduction Variance',
  'Generated Net Pay',
  'Sage Net Pay',
  'Net Variance',
  'Employer Cost',
  'Discrepancy Status',
  'Payroll Status',
  'Issues',
];

const otherEarningColumns = (records: any[]) => {
  const map = new Map<string, string>();
  for (const record of records) {
    for (const line of record.earningLines || []) {
      const code = compact(line.code);
      const name = compact(line.name || code);
      const summarized = summarizePayrollComponentKey('earning', code, name);
      if (summarized.key === 'earning:BASIC_EARNING') continue;
      if (!map.has(summarized.key)) map.set(summarized.key, summarized.label);
    }
  }
  return Array.from(map.entries())
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
};

const otherEarningAmount = (record: any, key: string) => {
  let total = 0;
  for (const line of record.earningLines || []) {
    const summarized = summarizePayrollComponentKey('earning', line.code, line.name || line.code);
    if (summarized.key !== key) continue;
    total += Number(line.amount || 0);
  }
  return Math.round(total * 100) / 100;
};

const exportHeadersFor = (records: any[]) => {
  const extras = otherEarningColumns(records);
  const headers = [...baseExportHeaders];
  const insertAt = headers.indexOf('Union Deductions') + 1;
  headers.splice(insertAt, 0, ...extras.map((item) => item.label));
  return { headers, extras };
};

const exportRows = (records: any[], extras: Array<{ key: string; label: string }>) => records.map((record) => [
  record.employeeId,
  record.fullName,
  record.department,
  record.payrollGroup,
  basicEarningAmount(record.earningLines),
  unionDeductionAmount(record.deductionLines),
  ...extras.map((item) => otherEarningAmount(record, item.key)),
  record.grossPay,
  record.sageActual?.grossPay ?? '',
  record.discrepancies?.grossVariance ?? '',
  record.paye,
  record.pensionEmployee,
  record.statutoryEmployee,
  record.loanRecovery,
  record.totalDeductions,
  record.sageActual?.totalDeductions ?? '',
  record.discrepancies?.deductionVariance ?? '',
  record.netPay,
  record.sageActual?.netPay ?? '',
  record.discrepancies?.netVariance ?? '',
  record.employerCost,
  record.discrepancies?.status || '',
  record.status,
  Array.isArray(record.issues) ? record.issues.join('; ') : '',
]);

const csv = (records: any[]) => {
  const { headers, extras } = exportHeadersFor(records);
  const lines = exportRows(records, extras).map((row) =>
    row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(','));
  return [headers.join(','), ...lines].join('\n');
};

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const period = url.searchParams.get('period') || (await getActivePayrollPeriod());
    const pack = url.searchParams.get('pack');
    const format = compact(url.searchParams.get('format')).toLowerCase();
    const payload = await buildProcessingPayload(request, period, pack);
    if (format === 'csv') {
      if (!payload.permissions.canExport) return err(403, 'Permission denied');
      return new Response(csv(payload.records), {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="payroll-approval-${period}-${payload.pack || 'salaried'}.csv"`,
        },
      });
    }
    if (format === 'xls' || format === 'excel') {
      const { headers, extras } = exportHeadersFor(payload.records);
      const xml = buildExcelWorkbookXml({
        worksheets: [{
          title: `Payroll Approval — ${payload.periodLabel || period}`,
          subtitle: `${payload.packLabel || payload.pack || 'Payroll'} · ${payload.records.length} employees`,
          sheetName: payload.pack === 'daily-rate' ? 'Daily Rate' : 'Salaried Stipend',
          columns: headers,
          rows: exportRows(payload.records, extras),
        }],
      });
      return new Response(xml, {
        headers: {
          'content-type': excelMimeType,
          'content-disposition': `attachment; filename="payroll-approval-${period}-${payload.pack || 'salaried'}.xls"`,
          'cache-control': 'no-store',
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
