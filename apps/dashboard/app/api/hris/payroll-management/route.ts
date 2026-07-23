import { NextResponse } from 'next/server';
import { invalidateHrisEmployeeCaches } from '@/lib/hris-employee-cache';
import { invalidatePayrollEmployeeCache } from '@/lib/payroll-employee-source';
import { calculatePayrollForPeriod } from '@/lib/payroll-calculation-service';
import { writePayrollEmployeeOption } from '@/lib/payroll-employee-options-store';
import { getActivePayrollPeriod, closePayrollPeriodRecord } from '@/lib/payroll-period-store';
import { runPayrollCutoverBackup } from '@/lib/payroll-cutover-backup-service';
import { buildManagementPayload } from '@/lib/payroll-payload-service';
import { appendPayrollAudit, capturePayrollSnapshot, getPayrollRunForPeriod, listPayrollAudit, savePayrollRun, type UnifiedPayrollRun } from '@/lib/payroll-run-store';
import { normalizePayrollApprovalAction } from '@/lib/payroll-approval-workflow';
import { managementPermissions, payrollSessionContext, processingPermissions } from '@/lib/payroll-session';
import { executePayrollWorkflowAction } from '@/lib/payroll-workflow-service';
import { resolveWorkflowLinkOriginFromRequest } from '@/lib/public-app-url';
import { FINANCE_ONLY_PAYROLL_ACTIONS, hasPayrollSalaryReviewAccess, isFinancePayrollOnlyUser } from '@/lib/access/payroll-access';
import { buildExcelHtml, excelMimeType } from '@/lib/excel-export';
import { buildSalarySetupExportReport } from '@/lib/payroll-salary-setup-export';
import { buildPayrollReviewExportReport, previousPayrollPeriod } from '@/lib/payroll-review-export';
import { readPayrollSnapshotsByPeriods } from '@/lib/payroll-run-store';

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
    access: { financeOnlyAccess: false, salaryReviewAccess: false },
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
  'salary-setup': 'Employee Salary Setup',
  'payroll-review': 'Payroll Review (Month-on-Month)',
}[report] || 'Payroll Register');

const loadReviewRecordsForPeriod = async (period: string) => {
  if (!period) return [];
  const snapshots = await readPayrollSnapshotsByPeriods([period]);
  const snapshot = snapshots.get(period);
  if (snapshot?.records?.length) return snapshot.records;
  const calculation = await calculatePayrollForPeriod(period);
  return calculation.records;
};

const filterExportRecords = (records: any[], status: string | null) =>
  status && status !== 'All' ? records.filter((record) => record.payrollStatus === status) : records;

const csvFromReport = (reportData: { columns: string[]; rows: unknown[][] }) => {
  const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const lines = reportData.rows.map((row) => row.map(escape).join(','));
  return [reportData.columns.join(','), ...lines].join('\n');
};

const buildPdfBytes = (title: string, lines: string[]) => {
  const escapePdf = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const clean = (s: string) => escapePdf(s.replace(/\r?\n/g, ' ').slice(0, 170));
  const fontSize = 10;
  const lineHeight = 12;
  const startY = 760;
  const x = 40;
  const all = [title, ...lines].slice(0, 55);
  const streamParts: string[] = [];
  streamParts.push(`BT /F1 ${fontSize} Tf ${x} ${startY} Td`);
  for (let i = 0; i < all.length; i++) {
    streamParts.push(`(${clean(all[i] || '')}) Tj`);
    if (i !== all.length - 1) streamParts.push(`0 -${lineHeight} Td`);
  }
  streamParts.push('ET');
  const stream = streamParts.join('\n');
  const encoder = new TextEncoder();
  const xref: number[] = [0];
  let out = '%PDF-1.4\n';
  const pushObj = (obj: string) => {
    xref.push(out.length);
    out += obj;
  };
  pushObj('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  pushObj('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
  pushObj('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n');
  pushObj('4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n');
  const streamBytes = encoder.encode(stream);
  pushObj(`5 0 obj\n<< /Length ${streamBytes.length} >>\nstream\n${stream}\nendstream\nendobj\n`);
  const startXref = out.length;
  out += `xref\n0 ${xref.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < xref.length; i++) out += `${String(xref[i]).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${xref.length} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF\n`;
  return encoder.encode(out);
};

const buildSpoolHtml = (title: string, subtitle: string, reportData: { columns: string[]; rows: unknown[][] }) => {
  const body = buildExcelHtml({ title, subtitle, sheetName: title.slice(0, 31), columns: reportData.columns, rows: reportData.rows as (string | number)[][] });
  return body.replace('</body>', `<script>window.addEventListener('load', () => { window.setTimeout(() => window.print(), 250); });</script>\n<style>@media print { body { margin: 0; } }</style>\n</body>`);
};

const reportActions = new Set([
  'generate-report', 'export-pdf', 'export-csv', 'export-excel', 'save-report-view', 'schedule-report', 'email-report', 'filter-report',
]);

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
  if (report === 'salary-setup') {
    return buildSalarySetupExportReport(records);
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
  run.hrReviewedAt = run.hrReviewedAt || stamp;
  run.hrReviewedBy = actor;
  await setStatus('hr-manager-approve', 'HR Approved', 'HR Manager stage approved by Global Super Administrator.');
  run.financeReviewedAt = run.financeReviewedAt || stamp;
  run.financeReviewedBy = actor;
  await setStatus('finance-manager-approve', 'Finance Approved', 'Finance Manager stage approved by Global Super Administrator.');
  run.cfoReviewedAt = run.cfoReviewedAt || stamp;
  run.cfoReviewedBy = actor;
  await setStatus('cfo-approve', 'CFO Approved', 'CFO stage approved by Global Super Administrator.');
  run.approvedAt = run.approvedAt || stamp;
  run.approvedBy = actor;
  await setStatus('md-ceo-approve', 'Approved', 'MD / CEO stage approved by Global Super Administrator.');
  run.releasedAt = run.releasedAt || stamp;
  run.releasedBy = actor;
  run.lockedAt = run.lockedAt || stamp;
  await setStatus('release-run', 'Released');
  run.bankScheduleGeneratedAt = run.bankScheduleGeneratedAt || stamp;
  run.bankScheduleGeneratedBy = actor;
  await auditStep('generate-bank-schedule', run.status, 'Bank schedule generated');
  run.payslipsGeneratedAt = run.payslipsGeneratedAt || stamp;
  run.payslipsGeneratedBy = actor;
  await setStatus('generate-payslips', 'Published', 'Payslips published as part of end-to-end workflow approval.');
  run.statutorySchedulesGeneratedAt = run.statutorySchedulesGeneratedAt || stamp;
  run.statutorySchedulesGeneratedBy = actor;
  await auditStep('generate-statutory-schedules', run.status, 'Statutory schedules generated');
  run.postedAt = run.postedAt || stamp;
  run.postedBy = actor;
  await setStatus('post-run', 'Posted');
  run.closedAt = run.closedAt || stamp;
  run.lockedAt = run.lockedAt || stamp;
  await setStatus('close-period', 'Closed', 'Payroll period closed through Global Super Administrator end-to-end approval.');
  await closePayrollPeriodRecord(run.period, actor, reason || 'Super Administrator end-to-end payroll close');
  const payrollCutoverBackup = await runPayrollCutoverBackup(run.period, actor);
  await auditStep('payroll-cutover-backup', 'Closed', payrollCutoverBackup.skipped ? 'Skipped' : 'Completed', payrollCutoverBackup.skipped ? payrollCutoverBackup.reason : payrollCutoverBackup.record?.backupFilePath);
  const calculation = await calculatePayrollForPeriod(run.period);
  await capturePayrollSnapshot(run.id, 'approve-entire-workflow', actor, calculation.summary as unknown as Record<string, unknown>, calculation.records);
  invalidateHrisEmployeeCaches();
  return savePayrollRun(run);
};

const workflowActions = new Set([
  'create-period', 'open-period', 'validate-payroll', 'create-run', 'submit-run',
  'hr-manager-approve', 'finance-manager-approve', 'cfo-approve', 'md-ceo-approve', 'approve-run',
  'release-run', 'generate-payslips', 'generate-bank-schedule', 'generate-statutory-schedules', 'post-run', 'lock-run',
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
    let reportData = reportExport(exportRecords, report);
    const previousPeriod = previousPayrollPeriod(payload.period);
    if (report === 'payroll-review') {
      const previousRecords = previousPeriod ? await loadReviewRecordsForPeriod(previousPeriod) : [];
      reportData = buildPayrollReviewExportReport(
        exportRecords,
        previousRecords,
        payload.periodLabel,
        previousPeriod || 'Previous Month',
      );
    }
    const exportTitle = `${reportTitle(report)} - ${payload.periodLabel}`;
    const exportSubtitle = report === 'payroll-review'
      ? `${exportRecords.length} current / ${previousPeriod ? `compared to ${previousPeriod}` : 'no previous period'}`
      : `${exportRecords.length} records / ${payload.summary.exceptionCount} total payroll exceptions`;
    if (url.searchParams.get('format') === 'csv') {
      if (!payload.permissions.canExport) return jsonErr(403, 'Permission denied');
      return new Response(csvFromReport(reportData), {
        headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${report}-${payload.period}.csv"` },
      });
    }
    if (url.searchParams.get('format') === 'xls' || url.searchParams.get('format') === 'excel') {
      if (!payload.permissions.canExport) return jsonErr(403, 'Permission denied');
      return new Response(buildExcelHtml({
        title: exportTitle,
        subtitle: exportSubtitle,
        sheetName: reportTitle(report).slice(0, 31),
        columns: reportData.columns,
        rows: reportData.rows,
      }), {
        headers: { 'content-type': excelMimeType, 'content-disposition': `attachment; filename="${report}-${payload.period}.xls"` },
      });
    }
    if (url.searchParams.get('format') === 'pdf') {
      if (!payload.permissions.canExport) return jsonErr(403, 'Permission denied');
      const lines = [
        `Period: ${payload.periodLabel}`,
        `Generated: ${new Date().toISOString()}`,
        '',
        ...reportData.rows.slice(0, 48).map((row) => row.map((cell) => String(cell ?? '')).join(' | ')),
      ];
      return new Response(buildPdfBytes(`DLE HRIS — ${exportTitle}`, lines), {
        headers: { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="${report}-${payload.period}.pdf"` },
      });
    }
    if (url.searchParams.get('format') === 'html' || url.searchParams.get('spool') === '1') {
      if (!payload.permissions.canExport) return jsonErr(403, 'Permission denied');
      return new Response(buildSpoolHtml(exportTitle, exportSubtitle, reportData), {
        headers: { 'content-type': 'text/html; charset=utf-8' },
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
  const { role, actor, ip, isGlobalAdmin, processingPerms, permissions } = await payrollSessionContext(request);
  const perms = managementPermissions(role);
  const body = await request.json().catch(() => ({}));
  const action = normalizePayrollApprovalAction(compact(body.action));
  const period = compact(body.period) || (await getActivePayrollPeriod());
  const reason = compact(body.reason);
  const comment = compact(body.comment);

  if (isFinancePayrollOnlyUser(permissions || [], { isGlobalAdmin }) && !FINANCE_ONLY_PAYROLL_ACTIONS.has(action)) {
    return jsonErr(403, 'Finance users are restricted to Bank & Finance payroll actions only.');
  }

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

  if (action === 'exclude-from-payroll-run') {
    if (!perms.canManageRun && !perms.canConfigure) return jsonErr(403, 'Permission denied');
    const employeeId = compact(body.employeeId || body.employeeCode);
    if (!employeeId) return jsonErr(400, 'Employee ID is required.');
    const { setPayrollRunExclusion } = await import('@/lib/payroll-run-exclusion-service');
    const option = await setPayrollRunExclusion({ employeeId, excluded: true, updatedBy: actor, reason });
    await appendPayrollAudit({
      user: actor,
      role,
      action: 'Excluded from payroll run',
      record: employeeId,
      oldValue: 'Included',
      newValue: 'Excluded',
      reason: reason || 'Removed from payroll run — unconfigured daily-rate contract.',
      comment: comment || null,
      ip,
    });
    return jsonOk({ option, message: `${employeeId} removed from this payroll run.` });
  }

  if (action === 'include-in-payroll-run') {
    if (!perms.canManageRun && !perms.canConfigure) return jsonErr(403, 'Permission denied');
    const employeeId = compact(body.employeeId || body.employeeCode);
    if (!employeeId) return jsonErr(400, 'Employee ID is required.');
    const { setPayrollRunExclusion } = await import('@/lib/payroll-run-exclusion-service');
    const option = await setPayrollRunExclusion({ employeeId, excluded: false, updatedBy: actor, reason });
    await appendPayrollAudit({
      user: actor,
      role,
      action: 'Included in payroll run',
      record: employeeId,
      oldValue: 'Excluded',
      newValue: 'Included',
      reason: reason || 'Restored to payroll run.',
      comment: comment || null,
      ip,
    });
    return jsonOk({ option, message: `${employeeId} restored to payroll run.` });
  }

  if (action === 'exclude-unconfigured-daily-rate-contracts') {
    if (!perms.canManageRun && !perms.canConfigure) return jsonErr(403, 'Permission denied');
    const { excludeUnconfiguredDailyRateContracts } = await import('@/lib/payroll-run-exclusion-service');
    const employeeIds = Array.isArray(body.employeeIds) ? body.employeeIds.map((value: unknown) => compact(value)).filter(Boolean) : undefined;
    const result = await excludeUnconfiguredDailyRateContracts({ period, employeeIds, updatedBy: actor });
    await appendPayrollAudit({
      user: actor,
      role,
      action: 'Bulk excluded unconfigured daily-rate contracts',
      record: period,
      oldValue: null,
      newValue: `${result.succeeded}/${result.processed} excluded`,
      reason: reason || 'Removed invalid daily-rate contract employees from payroll run.',
      comment: comment || null,
      ip,
    });
    return jsonOk({
      ...result,
      message: result.succeeded
        ? `${result.succeeded} employee(s) removed from payroll run.`
        : 'No unconfigured daily-rate contract employees matched for removal.',
    });
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

  if (reportActions.has(action)) {
    if (!perms.canExport && action !== 'filter-report') return jsonErr(403, 'Permission denied');
    const reportType = compact(body.report) || 'payroll-register';
    const auditLabel = {
      'generate-report': `Generated ${reportTitle(reportType)}`,
      'export-pdf': `Exported ${reportTitle(reportType)} (PDF)`,
      'export-csv': `Exported ${reportTitle(reportType)} (CSV)`,
      'export-excel': `Exported ${reportTitle(reportType)} (Excel)`,
      'save-report-view': `Saved report view: ${reportTitle(reportType)}`,
      'schedule-report': `Scheduled report: ${reportTitle(reportType)}`,
      'email-report': `Emailed report: ${reportTitle(reportType)}`,
      'filter-report': `Applied report filter: ${reportTitle(reportType)}`,
    }[action] || action;
    await appendPayrollAudit({
      user: actor,
      role,
      action: auditLabel,
      record: `${reportType}:${period}`,
      oldValue: null,
      newValue: action,
      reason: reason || null,
      comment: comment || body.reportName || null,
      ip,
    });
    if (action === 'generate-report') return jsonOk({ report: reportType, period, message: `${reportTitle(reportType)} generated.` });
    if (action === 'schedule-report') return jsonOk({ report: reportType, period, scheduled: true, message: 'Report schedule saved.' });
    if (action === 'save-report-view') return jsonOk({ report: reportType, period, saved: true, message: 'Report view saved.' });
    if (action === 'email-report') return jsonOk({ report: reportType, period, queued: true, message: 'Report email queued for delivery.' });
    if (action === 'filter-report') return jsonOk({ report: reportType, period, message: 'Report filter applied.' });
    return jsonOk({ report: reportType, period, message: `${reportTitle(reportType)} export recorded.` });
  }

  if (workflowActions.has(action)) {
    if (action === 'hr-manager-approve' && !processingPerms.canApproveHrManager) return jsonErr(403, 'HR Manager approval permission denied');
    if (action === 'finance-manager-approve' && !processingPerms.canApproveFinanceManager) return jsonErr(403, 'Finance Manager approval permission denied');
    if (action === 'cfo-approve' && !processingPerms.canApproveCfo) return jsonErr(403, 'CFO approval permission denied');
    if (action === 'md-ceo-approve' && !processingPerms.canApproveMdCeo) return jsonErr(403, 'MD / CEO approval permission denied');
    if (action === 'approve-run' && !perms.canApprove) return jsonErr(403, 'Permission denied');
    if (['reject-run', 'request-revision'].includes(action) && !processingPerms.canReject) {
      return jsonErr(403, 'Reject/revision permission denied');
    }
    if (['validate-payroll', 'create-run', 'submit-run', 'release-run', 'generate-payslips', 'create-period', 'open-period'].includes(action) && !perms.canManageRun) return jsonErr(403, 'Permission denied');
    if (['generate-bank-schedule', 'post-run'].includes(action) && !perms.canPost) return jsonErr(403, 'Permission denied');
    if (['close-period'].includes(action) && !perms.canManageRun && !perms.canApprove) return jsonErr(403, 'Permission denied');
    if (action === 'reopen-period' && !perms.canReopen) return jsonErr(403, 'Only CFO, Executive Director, or Super Admin can reopen closed payroll periods.');

    try {
      const origin = resolveWorkflowLinkOriginFromRequest(request);
      const result = await executePayrollWorkflowAction({
        action,
        period,
        pack: compact(body.pack) || null,
        runId: compact(body.runId) || null,
        actor,
        role,
        reason: reason || undefined,
        comment: comment || undefined,
        ip,
        paymentDate: body.paymentDate || null,
        isGlobalAdmin,
        baseUrl: origin,
      });
      return jsonOk({ run: result.run, runs: (result as { runs?: typeof result.run[] }).runs });
    } catch (error) {
      return jsonErr(/permission|cannot|blocked|requires|not found|unsupported/i.test(error instanceof Error ? error.message : '') ? 409 : 500, error instanceof Error ? error.message : 'Unable to complete payroll action.');
    }
  }

  return jsonErr(400, 'Unsupported payroll action');
}
