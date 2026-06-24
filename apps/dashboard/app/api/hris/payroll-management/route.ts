import { NextResponse } from 'next/server';
import { invalidatePayrollEmployeeCache } from '@/lib/payroll-employee-source';
import { writePayrollEmployeeOption } from '@/lib/payroll-employee-options-store';
import { getActivePayrollPeriod } from '@/lib/payroll-period-store';
import { buildManagementPayload } from '@/lib/payroll-payload-service';
import { appendPayrollAudit, getPayrollRunForPeriod, listPayrollAudit, savePayrollRun, type UnifiedPayrollRun } from '@/lib/payroll-run-store';
import { managementPermissions, payrollSessionContext } from '@/lib/payroll-session';
import { executePayrollWorkflowAction } from '@/lib/payroll-workflow-service';
import { buildExcelHtml, excelMimeType } from '@/lib/excel-export';

const jsonOk = <T,>(data: T) => NextResponse.json({ status: 'success', data });
const jsonErr = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });
const nowIso = () => new Date().toISOString();
const roundMoney = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
const compact = (value: unknown) => String(value || '').trim();

const emptyPayload = async (request: Request, error: unknown) => {
  const { role } = await payrollSessionContext(request);
  const message = error instanceof Error ? error.message : 'Payroll data is temporarily unavailable.';
  const period = await getActivePayrollPeriod().catch(() => '2026-05');
  const auditTrail = await listPayrollAudit(50).catch(() => []);
  return {
    generatedAt: nowIso(),
    source: 'Payroll service fallback',
    dataSource: { source: 'Payroll service fallback', databaseAvailable: false, warning: message, employeeCount: 0 },
    role,
    permissions: managementPermissions(role),
    period,
    periodLabel: period,
    summary: {
      totalEmployees: 0,
      payrollEligible: 0,
      readyEmployees: 0,
      reviewEmployees: 0,
      blockedEmployees: 0,
      payrollCoveragePct: 0,
      grossPay: 0,
      deductions: 0,
      netPay: 0,
      basePay: 0,
      allowances: 0,
      exceptionCount: 1,
    },
    runs: [],
    records: [],
    exceptions: [{ id: 'payroll-service-error', employeeId: 'SYSTEM', employeeName: 'Payroll Management', issue: message, severity: 'High' as const, owner: 'System Administrator' }],
    breakdowns: { byPayrollGroup: [], byDepartment: [], byEmploymentType: [] },
    controls: [
      { id: 'master-data', label: 'Master Data Validation', status: 'Unavailable', tone: 'red' },
      { id: 'statutory', label: 'PAYE and Pension Estimate', status: 'Unavailable', tone: 'red' },
      { id: 'approval', label: 'Segregated Approval', status: 'Paused', tone: 'amber' },
      { id: 'audit', label: 'Payroll Audit Trail', status: 'Enabled', tone: 'cyan' },
    ],
    workflow: { currentStatus: 'Validation', nextOwner: 'System Administrator', blockedActions: [`Payroll data could not be loaded: ${message}`], approvalStage: 'Data unavailable' },
    auditTrail,
    artifacts: [],
  };
};

const csv = (records: any[]) => {
  const headers = ['Employee ID', 'Name', 'Department', 'Type', 'Status', 'Payroll Group', 'Salary Structure', 'Daily Rate', 'Hourly Rate', 'Currency', 'Gross Pay', 'Deductions', 'Net Pay', 'Payroll Status', 'Exceptions'];
  const lines = records.map((r) =>
    [r.employeeId, r.fullName, r.department, r.employmentType, r.employmentStatus, r.payrollGroup, r.salaryStructure || r.salaryGrade, r.ratePerDay ?? '', r.ratePerHour ?? '', r.payCurrency, r.grossPay, r.deductions, r.netPay, r.payrollStatus, r.exceptions.join('; ')]
      .map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`)
      .join(','),
  );
  return [headers.join(','), ...lines].join('\n');
};

const payrollExportColumns = ['Employee ID', 'Name', 'Department', 'Type', 'Status', 'Payroll Group', 'Salary Structure', 'Daily Rate', 'Hourly Rate', 'Currency', 'Gross Pay', 'Deductions', 'Net Pay', 'Payroll Status', 'Exceptions'];
const payrollExportRows = (records: any[]) => records.map((r) => [
  r.employeeId, r.fullName, r.department, r.employmentType, r.employmentStatus, r.payrollGroup, r.salaryStructure || r.salaryGrade, r.ratePerDay ?? '', r.ratePerHour ?? '', r.payCurrency, r.grossPay, r.deductions, r.netPay, r.payrollStatus, (r.exceptions || []).join('; '),
]);

const reportTitle = (report: string) => ({
  'payroll-summary': 'Payroll Summary Report',
  'payroll-register': 'Payroll Register',
  'salary-analysis': 'Salary Analysis Report',
  'tax-report': 'PAYE Tax Report',
  'pension-report': 'Pension Report',
  'deduction-report': 'Deduction Report',
  'bank-payment-report': 'Bank Payment Report',
  'bank-schedule': 'Bank Salary Schedule',
  'compliance-report': 'Compliance Report',
  'audit-report': 'Payroll Audit Report',
  'executive-analytics': 'Executive Payroll Analytics',
}[report] || 'Payroll Register');

const filterExportRecords = (records: any[], status: string | null) =>
  status && status !== 'All' ? records.filter((record) => record.payrollStatus === status) : records;

const reportExport = (records: any[], report: string) => {
  if (report === 'payroll-summary' || report === 'executive-analytics') {
    return {
      columns: ['Metric', 'Value'],
      rows: [
        ['Employees', records.length],
        ['Ready Employees', records.filter((r) => r.payrollStatus === 'Ready').length],
        ['Review Employees', records.filter((r) => r.payrollStatus === 'Review').length],
        ['Blocked Employees', records.filter((r) => r.payrollStatus === 'Blocked').length],
        ['Gross Pay', roundMoney(records.reduce((sum, r) => sum + Number(r.grossPay || 0), 0))],
        ['Deductions', roundMoney(records.reduce((sum, r) => sum + Number(r.deductions || 0), 0))],
        ['Net Pay', roundMoney(records.reduce((sum, r) => sum + Number(r.netPay || 0), 0))],
      ],
    };
  }
  if (report === 'tax-report') {
    return { columns: ['Employee ID', 'Name', 'Department', 'Taxable Pay', 'PAYE', 'Payroll Status', 'Exceptions'], rows: records.map((r) => [r.employeeId, r.fullName, r.department, r.taxablePay ?? '', r.paye ?? 0, r.payrollStatus, (r.exceptions || []).join('; ')]) };
  }
  if (report === 'pension-report') {
    return { columns: ['Employee ID', 'Name', 'Department', 'Gross Pay', 'Pension EE', 'Pension ER Estimate', 'Payroll Status'], rows: records.map((r) => [r.employeeId, r.fullName, r.department, r.grossPay ?? 0, r.pension ?? 0, roundMoney(Number(r.pension || 0) * 1.25), r.payrollStatus]) };
  }
  if (report === 'deduction-report' || report === 'compliance-report') {
    return { columns: ['Employee ID', 'Name', 'Department', 'PAYE', 'Pension', 'Other / NHF / Union', 'Total Deductions', 'Payroll Status'], rows: records.map((r) => [r.employeeId, r.fullName, r.department, r.paye ?? 0, r.pension ?? 0, r.otherDeductions ?? 0, r.deductions ?? 0, r.payrollStatus]) };
  }
  if (report === 'bank-payment-report' || report === 'bank-schedule') {
    return { columns: ['Employee Code', 'Employee Name', 'Bank', 'Account No', 'Sort Code', 'NET Salary', 'Location'], rows: records.map((r) => [r.employeeId, r.fullName, r.bankName || '', r.accountNo || '', r.sortCode || r.branchCode || r.bankCode || '', r.netPay ?? 0, r.location || '']) };
  }
  if (report === 'salary-analysis') {
    return { columns: ['Employee ID', 'Name', 'Department', 'Employment Type', 'Salary Structure', 'Base Pay', 'Allowances', 'Gross Pay', 'Net Pay', 'Payroll Status'], rows: records.map((r) => [r.employeeId, r.fullName, r.department, r.employmentType, r.salaryStructure || r.salaryGrade, r.basePay ?? 0, r.allowances ?? 0, r.grossPay ?? 0, r.netPay ?? 0, r.payrollStatus]) };
  }
  return { columns: payrollExportColumns, rows: payrollExportRows(records) };
};

const applySuperAdminEndToEndApproval = async (
  run: UnifiedPayrollRun,
  actor: string,
  role: string,
  payload: Awaited<ReturnType<typeof buildManagementPayload>>,
  reason: string,
  comment: string,
  ip: string | null,
) => {
  const stamp = nowIso();
  const auditStep = async (auditAction: string, oldValue: string | null, newValue: string, detail?: string) => {
    await appendPayrollAudit({
      user: actor,
      role,
      action: auditAction,
      record: run.id,
      oldValue,
      newValue,
      reason: reason || 'Global Super Administrator end-to-end payroll workflow approval',
      comment: detail || comment || 'Approved through Global Super Administrator end-to-end workflow override.',
      ip,
    });
  };

  const setStatus = async (auditAction: string, status: UnifiedPayrollRun['status'], detail?: string) => {
    const oldValue = run.status;
    run.status = status;
    await auditStep(auditAction, oldValue, status, detail);
  };

  run.employeeCount = payload.summary.payrollEligible;
  run.grossPay = payload.summary.grossPay ?? 0;
  run.deductions = payload.summary.deductions ?? 0;
  run.netPay = payload.summary.netPay ?? 0;
  run.updatedBy = actor;

  run.validatedAt = run.validatedAt || stamp;
  run.validatedBy = run.validatedBy || actor;
  await setStatus('validate-payroll', payload.summary.exceptionCount > 0 ? 'Validation' : 'Validated', `${payload.summary.exceptionCount} validation exceptions recorded before Super Administrator override.`);
  await setStatus('create-run', 'Computed');
  run.submittedAt = run.submittedAt || stamp;
  run.submittedBy = run.submittedBy || actor;
  await setStatus('submit-run', 'Submitted');
  run.approvedAt = run.approvedAt || stamp;
  run.approvedBy = actor;
  await setStatus('approve-run', 'Approved', 'All approval stages approved by Global Super Administrator.');
  run.releasedAt = run.releasedAt || stamp;
  run.releasedBy = actor;
  run.lockedAt = run.lockedAt || stamp;
  await setStatus('release-run', 'Released');
  run.payslipsGeneratedAt = run.payslipsGeneratedAt || stamp;
  run.payslipsGeneratedBy = actor;
  await setStatus('generate-payslips', 'Published', 'Payslips published as part of end-to-end workflow approval.');
  run.bankScheduleGeneratedAt = run.bankScheduleGeneratedAt || stamp;
  run.bankScheduleGeneratedBy = actor;
  await auditStep('generate-bank-schedule', run.status, 'Bank schedule generated');
  run.statutorySchedulesGeneratedAt = run.statutorySchedulesGeneratedAt || stamp;
  run.statutorySchedulesGeneratedBy = actor;
  await auditStep('generate-statutory-schedules', run.status, 'Statutory schedules generated');
  run.postedAt = run.postedAt || stamp;
  run.postedBy = actor;
  await setStatus('post-run', 'Posted');
  run.closedAt = run.closedAt || stamp;
  run.lockedAt = run.lockedAt || stamp;
  await setStatus('close-period', 'Closed', 'Payroll period closed through Global Super Administrator end-to-end approval.');
  return savePayrollRun(run);
};

const workflowActions = new Set([
  'create-period', 'open-period', 'validate-payroll', 'create-run', 'submit-run', 'approve-run', 'release-run',
  'generate-payslips', 'generate-bank-schedule', 'generate-statutory-schedules', 'post-run', 'lock-run',
  'close-period', 'reopen-period', 'reject-run', 'request-revision',
]);

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const period = url.searchParams.get('period') || undefined;
    const payload = await buildManagementPayload(request, period);
    const report = compact(url.searchParams.get('report')) || 'payroll-register';
    const exportRecords = filterExportRecords(payload.records, url.searchParams.get('status'));
    if (url.searchParams.get('audit') === '1') return jsonOk({ auditTrail: payload.auditTrail });
    if (url.searchParams.get('format') === 'csv') {
      if (!payload.permissions.canExport) return jsonErr(403, 'Permission denied');
      return new Response(csv(exportRecords), {
        headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${report}-${payload.period}.csv"` },
      });
    }
    if (url.searchParams.get('format') === 'xls' || url.searchParams.get('format') === 'excel') {
      if (!payload.permissions.canExport) return jsonErr(403, 'Permission denied');
      const reportData = reportExport(exportRecords, report);
      return new Response(buildExcelHtml({
        title: `${reportTitle(report)} - ${payload.periodLabel}`,
        subtitle: `${exportRecords.length} records / ${payload.summary.exceptionCount} total payroll exceptions`,
        sheetName: reportTitle(report).slice(0, 31),
        columns: reportData.columns,
        rows: reportData.rows,
      }), {
        headers: { 'content-type': excelMimeType, 'content-disposition': `attachment; filename="${report}-${payload.period}.csv"` },
      });
    }
    return jsonOk(payload);
  } catch (error) {
    console.error('Payroll Management API Error:', error);
    const url = new URL(request.url);
    const payload = await emptyPayload(request, error);
    if (url.searchParams.get('audit') === '1') return jsonOk({ auditTrail: payload.auditTrail, warning: payload.dataSource.warning });
    return jsonErr(503, payload.dataSource.warning || 'Payroll employee source is unavailable.');
  }
}

export async function POST(request: Request) {
  const { role, actor, ip } = await payrollSessionContext(request);
  const perms = managementPermissions(role);
  const body = await request.json().catch(() => ({}));
  const action = compact(body.action);
  const period = compact(body.period) || (await getActivePayrollPeriod());
  const reason = compact(body.reason);
  const comment = compact(body.comment);

  if (action === 'set-nhf-applicability') {
    if (!perms.canManageRun && !perms.canConfigure) return jsonErr(403, 'Permission denied');
    const employeeId = compact(body.employeeId || body.employeeCode);
    if (!employeeId) return jsonErr(400, 'Employee ID is required.');
    if (typeof body.nhfApplicable !== 'boolean') return jsonErr(400, 'NHF applicability must be true or false.');
    const option = await writePayrollEmployeeOption({ employeeId, employeeCode: employeeId, nhfApplicable: body.nhfApplicable, updatedBy: actor });
    invalidatePayrollEmployeeCache();
    await appendPayrollAudit({ user: actor, role, action, record: employeeId, oldValue: null, newValue: body.nhfApplicable ? 'NHF enabled' : 'NHF disabled', reason: reason || null, comment: comment || null, ip });
    return jsonOk({ option });
  }

  if (action === 'fix-payroll-setup') {
    if (!perms.canManageRun && !perms.canConfigure) return jsonErr(403, 'Permission denied');
    const employeeId = compact(body.employeeId || body.employeeCode);
    if (!employeeId) return jsonErr(400, 'Employee ID is required.');
    const numberOption = (value: unknown) => {
      if (value === null || value === undefined || compact(value) === '') return undefined;
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : undefined;
    };
    const updates = {
      ...(typeof body.setupAssignedToPayroll === 'boolean' ? { setupAssignedToPayroll: body.setupAssignedToPayroll } : {}),
      ...(compact(body.payrollGroup) ? { payrollGroup: compact(body.payrollGroup) } : {}),
      ...(compact(body.salaryGrade) ? { salaryGrade: compact(body.salaryGrade), jobGrade: compact(body.salaryGrade) } : {}),
      ...(numberOption(body.ratePerDay) !== undefined ? { ratePerDay: numberOption(body.ratePerDay) } : {}),
      ...(numberOption(body.ratePerHour) !== undefined ? { ratePerHour: numberOption(body.ratePerHour) } : {}),
      ...(numberOption(body.hoursPerDay) !== undefined ? { hoursPerDay: numberOption(body.hoursPerDay) } : {}),
    };
    if (!Object.keys(updates).length) return jsonErr(400, 'Provide at least one payroll setup value to update.');
    const option = await writePayrollEmployeeOption({ employeeId, employeeCode: employeeId, ...updates, updatedBy: actor });
    invalidatePayrollEmployeeCache();
    await appendPayrollAudit({ user: actor, role, action, record: employeeId, oldValue: null, newValue: JSON.stringify(updates), reason: reason || 'Payroll issue fixed from dashboard', comment: comment || 'Payroll setup correction applied from the issue resolution panel.', ip });
    return jsonOk({ option });
  }

  if (action === 'approve-entire-workflow') {
    if (role !== 'Super Admin') return jsonErr(403, 'Only the Global Super Administrator can approve the entire payroll workflow end-to-end.');
    const payload = await buildManagementPayload(request, period);
    let run = await getPayrollRunForPeriod(period);
    if (!run) return jsonErr(404, 'Payroll run not found');
    if (run.status === 'Closed') return jsonOk({ run, message: 'Payroll workflow is already closed.' });
    if (!['Submitted', 'Under Review'].includes(run.status)) return jsonErr(409, 'Submit payroll first. Entire workflow approval activates after submission.');
    const approvedRun = await applySuperAdminEndToEndApproval(run, actor, role, payload, reason, comment, ip);
    return jsonOk({ run: approvedRun, message: 'Global Super Administrator approved the entire payroll workflow end-to-end.' });
  }

  if (workflowActions.has(action)) {
    if (action === 'approve-run' && !perms.canApprove) return jsonErr(403, 'Permission denied');
    if (['validate-payroll', 'create-run', 'submit-run', 'release-run', 'generate-payslips', 'create-period', 'open-period'].includes(action) && !perms.canManageRun) return jsonErr(403, 'Permission denied');
    if (['generate-bank-schedule', 'post-run'].includes(action) && !perms.canPost) return jsonErr(403, 'Permission denied');
    if (['close-period'].includes(action) && !perms.canManageRun && !perms.canApprove) return jsonErr(403, 'Permission denied');
    if (action === 'reopen-period' && !perms.canReopen) return jsonErr(403, 'Only CFO, Executive Director, or Super Admin can reopen closed payroll periods.');

    try {
      const result = await executePayrollWorkflowAction({ action, period, actor, role, reason: reason || undefined, comment: comment || undefined, ip, paymentDate: body.paymentDate || null });
      return jsonOk({ run: result.run });
    } catch (error) {
      return jsonErr(/permission|cannot|blocked|requires|not found|unsupported/i.test(error instanceof Error ? error.message : '') ? 409 : 500, error instanceof Error ? error.message : 'Unable to complete payroll action.');
    }
  }

  return jsonErr(400, 'Unsupported payroll action');
}
