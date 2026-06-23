import { NextResponse } from 'next/server';
import type { DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import { invalidatePayrollEmployeeCache, payrollDataSourceInfo, readPayrollEmployees } from '@/lib/payroll-employee-source';
import { calculatePayrollEarnings, calculatePermanentUnionDues } from '@/lib/payroll-earnings-engine';
import { activeTaxVersion, calculatePayrollTax, payrollInputFromEmployee, readPayrollTaxConfig, type PayrollTaxVersion } from '@/lib/payroll-tax-engine';
import { activePensionVersion, calculatePension, pensionInputFromEmployee, readPayrollPensionConfig, type PensionVersion } from '@/lib/payroll-pension-engine';
import { syncSageLeaveAllowanceEvents } from '@/lib/payroll-leave-allowance-store';
import { activePayrollPeriod } from '@/lib/payroll-periods';
import { writePayrollEmployeeOption } from '@/lib/payroll-employee-options-store';
import { buildExcelHtml, excelMimeType } from '@/lib/excel-export';

type Role =
  | 'Super Admin'
  | 'System Administrator'
  | 'HR Director'
  | 'HR Manager'
  | 'HR Officer'
  | 'Payroll Officer'
  | 'Payroll Supervisor'
  | 'Finance Controller'
  | 'Finance Manager'
  | 'CFO'
  | 'Executive Director'
  | 'Executive Management'
  | 'Auditor'
  | 'Employee';

type PayrollRunStatus = 'Draft' | 'Open' | 'Validation' | 'Validated' | 'Computed' | 'Ready for Approval' | 'Submitted' | 'Under Review' | 'Approved' | 'Released' | 'Rejected' | 'Revision Requested' | 'Locked' | 'Posted' | 'Closed' | 'Reopened' | 'Cancelled' | 'Published';

type PayrollRun = {
  id: string;
  period: string;
  status: PayrollRunStatus;
  employeeCount: number;
  grossPay: number;
  deductions: number;
  netPay: number;
  createdAt: string;
  createdBy: string;
  validatedAt?: string | null;
  validatedBy?: string | null;
  submittedAt?: string | null;
  submittedBy?: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  releasedAt?: string | null;
  releasedBy?: string | null;
  lockedAt: string | null;
  payslipsGeneratedAt?: string | null;
  payslipsGeneratedBy?: string | null;
  bankScheduleGeneratedAt?: string | null;
  bankScheduleGeneratedBy?: string | null;
  statutorySchedulesGeneratedAt?: string | null;
  statutorySchedulesGeneratedBy?: string | null;
  postedAt: string | null;
  postedBy?: string | null;
  closedAt?: string | null;
  reopenedAt?: string | null;
  reopenedBy?: string | null;
  reopenReason?: string | null;
};

type PayrollAuditEntry = {
  id: string;
  at: string;
  user: string;
  role: Role;
  action: string;
  record: string;
  oldValue?: string | null;
  newValue?: string | null;
  reason?: string | null;
  comment?: string | null;
  ip?: string | null;
};

const jsonOk = <T,>(data: T) => NextResponse.json({ status: 'success', data });
const jsonErr = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });

const nowIso = () => new Date().toISOString();
const roundMoney = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
const compact = (value: unknown) => String(value || '').trim();
const PAYROLL_SETUP_PREVIEW_PERIOD = activePayrollPeriod();
const inputOnlyEmployee = (employee: DleEmployeeDirectoryRow): DleEmployeeDirectoryRow => ({
  ...employee,
  sagePayrollEarnings: [],
  sagePayrollDeductions: undefined,
  sagePayrollContributions: undefined,
});

const getRole = (request: Request): Role => {
  const value = request.headers.get('x-hris-role');
  const roles: Role[] = ['Super Admin', 'System Administrator', 'HR Director', 'HR Manager', 'HR Officer', 'Payroll Officer', 'Payroll Supervisor', 'Finance Controller', 'Finance Manager', 'CFO', 'Executive Director', 'Executive Management', 'Auditor', 'Employee'];
  return roles.includes(value as Role) ? (value as Role) : 'Payroll Officer';
};

const permissions = (role: Role) => {
  const canViewMoney = ['Super Admin', 'System Administrator', 'HR Director', 'HR Manager', 'Payroll Officer', 'Payroll Supervisor', 'Finance Controller', 'Finance Manager', 'CFO', 'Executive Director', 'Executive Management', 'Auditor'].includes(role);
  const canManageRun = ['Super Admin', 'Payroll Officer', 'Payroll Supervisor', 'Finance Controller', 'Finance Manager'].includes(role);
  const canApprove = ['Super Admin', 'HR Director', 'HR Manager', 'Finance Controller', 'Finance Manager', 'CFO', 'Executive Director', 'Executive Management'].includes(role);
  const canPost = ['Super Admin', 'Payroll Officer', 'Payroll Supervisor', 'Finance Controller', 'Finance Manager'].includes(role);
  const canConfigure = ['Super Admin', 'System Administrator'].includes(role);
  const canReopen = ['Super Admin', 'CFO', 'Executive Director'].includes(role);
  const canExport = role !== 'Employee';
  return { canViewMoney, canManageRun, canApprove, canPost, canConfigure, canReopen, canExport };
};

const runStore = (() => {
  const g = globalThis as unknown as { __dlePayrollRuns?: Map<string, PayrollRun> };
  if (!g.__dlePayrollRuns) g.__dlePayrollRuns = new Map();
  return g.__dlePayrollRuns;
})();

const auditStore = (() => {
  const g = globalThis as unknown as { __dlePayrollAudit?: PayrollAuditEntry[] };
  if (!g.__dlePayrollAudit) g.__dlePayrollAudit = [];
  return g.__dlePayrollAudit;
})();

const logAudit = (request: Request, entry: Omit<PayrollAuditEntry, 'id' | 'at' | 'ip'>) => {
  const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || null;
  auditStore.unshift({ id: `aud-${Date.now()}-${Math.random().toString(16).slice(2)}`, at: nowIso(), ip, ...entry });
  if (auditStore.length > 300) auditStore.length = 300;
};

const getCurrentRun = () => Array.from(runStore.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] || null;

const monthPeriod = activePayrollPeriod;

const periodLabel = (period: string) => {
  const [year, month] = period.split('-').map(Number);
  const date = new Date(Date.UTC(year || new Date().getUTCFullYear(), (month || 1) - 1, 1));
  return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
};

const isDailyRateEmployee = (employee: DleEmployeeDirectoryRow, earningProfileId?: string) => {
  const code = compact(employee.employeeCode || employee.employeeId).toUpperCase();
  const text = [employee.employmentType, employee.payrollGroup, employee.paymentRun, employee.paymentType, employee.staffCategory, employee.employeeCategory]
    .map(compact)
    .join(' ')
    .toLowerCase();
  return code.startsWith('C') || earningProfileId === 'contract-day-rate' || text.includes('daily') || text.includes('day rate');
};

const employeeCost = (employee: DleEmployeeDirectoryRow, taxVersion: PayrollTaxVersion, pensionVersion: PensionVersion) => {
  const calculationEmployee = inputOnlyEmployee(employee);
  const calculationOptions = { period: PAYROLL_SETUP_PREVIEW_PERIOD, includePeriodAdjustments: true, ignoreSagePayslipLines: true };
  const earnings = calculatePayrollEarnings(calculationEmployee, calculationOptions);
  const tax = calculatePayrollTax(payrollInputFromEmployee(calculationEmployee, calculationOptions), taxVersion);
  const pension = calculatePension(pensionInputFromEmployee(calculationEmployee, calculationOptions), pensionVersion).employeeContribution;
  const paye = tax.monthlyPaye;
  const nhf = (tax.statutoryItems.find((item) => item.id === 'nhf')?.amount || 0) / 12;
  const unionDues = (tax.statutoryItems.find((item) => item.id === 'union-dues')?.amount || 0) / 12;
  const unionRule = calculatePermanentUnionDues(calculationEmployee);
  const otherStatutory = (tax.statutoryItems.find((item) => item.id === 'other-statutory')?.amount || 0) / 12;
  const otherDeductions = otherStatutory + nhf + unionDues;
  const grossPay = earnings.grossPay;
  const deductions = pension + paye + otherDeductions;
  return {
    basePay: roundMoney(earnings.basePay),
    allowances: roundMoney(earnings.allowances),
    taxablePay: roundMoney(earnings.taxablePay),
    nonTaxablePay: roundMoney(earnings.nonTaxablePay),
    earningProfile: earnings.profileName,
    earningProfileId: earnings.profileId,
    earningLines: earnings.earningLines.map((line) => ({
      code: line.code,
      name: line.name,
      taxable: line.taxable,
      percentOfGross: line.percentOfGross,
      calculation: line.calculation || (line.percentOfGross ? `${Math.round(line.percentOfGross * 10000) / 100}% of gross` : 'Formula-based earning'),
      runFrequency: line.runFrequency || 'monthly',
      includeInMonthlyPayroll: line.includeInMonthlyPayroll !== false,
      amount: roundMoney(line.amount),
    })),
    annualBenefitLines: earnings.annualBenefitLines.map((line) => ({
      code: line.code,
      name: line.name,
      taxable: line.taxable,
      percentOfGross: line.percentOfGross,
      calculation: line.calculation || 'Paid once yearly',
      runFrequency: line.runFrequency || 'leave-period',
      includeInMonthlyPayroll: false,
      amount: roundMoney(line.amount),
    })),
    pension: roundMoney(pension),
    paye: roundMoney(paye),
    otherDeductions: roundMoney(otherDeductions),
    deductionLines: [
      { code: 'PAYE', label: 'PAYE', amount: roundMoney(paye) },
      { code: 'PENSION_EE', label: 'Pension', amount: roundMoney(pension) },
      { code: 'NHF', label: 'NHF', amount: roundMoney(nhf) },
      { code: unionRule.code, label: unionRule.name, amount: roundMoney(unionDues) },
      { code: 'OTHERDEDUCTION', label: 'Other Deductions', amount: roundMoney(otherStatutory) },
    ].filter((line) => line.amount > 0),
    grossPay: roundMoney(grossPay),
    deductions: roundMoney(deductions),
    netPay: roundMoney(Math.max(0, grossPay - deductions)),
  };
};

const riskFor = (employee: DleEmployeeDirectoryRow, cost: ReturnType<typeof employeeCost>) => {
  const issues: string[] = [];
  const dailyRateEmployee = isDailyRateEmployee(employee, cost.earningProfileId);
  const hasDailyRate = Number(employee.ratePerDay || 0) > 0 || Number(employee.ratePerHour || 0) > 0;
  if (!employee.setupAssignedToPayroll) issues.push('Payroll setup is not assigned');
  if (cost.basePay <= 0) issues.push('Pay amount is missing');
  if (dailyRateEmployee && !hasDailyRate) issues.push('Daily rate is missing');
  if (!dailyRateEmployee && !compact(employee.salaryGrade || employee.jobGrade)) issues.push('Salary grade is missing');
  if (!compact(employee.payrollGroup)) issues.push('Payroll group is missing');
  if (compact(employee.status).toLowerCase().match(/terminated|resigned|retired|inactive/)) issues.push('Employee status is not payroll active');
  if (compact(employee.payCurrency) && compact(employee.payCurrency).toUpperCase() !== 'NGN') issues.push('Foreign currency review required');
  const severity = issues.some((issue) => issue.includes('not payroll active') || issue.includes('Pay amount')) ? 'High' : issues.length > 0 ? 'Medium' : 'Low';
  return { issues, severity };
};

const buildRecords = (employees: DleEmployeeDirectoryRow[], taxVersion: PayrollTaxVersion, pensionVersion: PensionVersion) =>
  employees.map((employee) => {
    const cost = employeeCost(employee, taxVersion, pensionVersion);
    const risk = riskFor(employee, cost);
    const dailyRateEmployee = isDailyRateEmployee(employee, cost.earningProfileId);
    const ratePerDay = Number(employee.ratePerDay || 0) || (Number(employee.ratePerHour || 0) > 0 ? Number(employee.ratePerHour) * Number(employee.hoursPerDay || 8) : 0) || (dailyRateEmployee ? Number(employee.periodSalary || 0) : 0);
    const ratePerHour = Number(employee.ratePerHour || 0) || (ratePerDay > 0 ? ratePerDay / Number(employee.hoursPerDay || 8) : 0);
    const payrollStatus = risk.issues.length === 0 ? 'Ready' : risk.severity === 'High' ? 'Blocked' : 'Review';
    return {
      employeeId: employee.employeeId,
      employeeDbId: employee.employeeDbId,
      fullName: employee.fullName,
      department: employee.department,
      businessUnit: employee.businessUnit,
      location: employee.location,
      jobTitle: employee.jobTitle,
      employmentType: employee.employmentType,
      employmentStatus: employee.status,
      payrollGroup: employee.payrollGroup || 'Unassigned',
      salaryGrade: dailyRateEmployee ? (ratePerDay > 0 ? 'Daily Rate' : 'Rate Missing') : employee.salaryGrade || employee.jobGrade || 'Unassigned',
      salaryStructure: dailyRateEmployee ? (ratePerDay > 0 ? 'Daily Rate' : 'Daily Rate Missing') : employee.salaryGrade || employee.jobGrade || 'Unassigned',
      isDailyRate: dailyRateEmployee,
      ratePerDay: ratePerDay || null,
      ratePerHour: ratePerHour || null,
      hoursPerDay: Number(employee.hoursPerDay || 8) || 8,
      payCurrency: employee.payCurrency || 'NGN',
      paymentRun: employee.paymentRun || 'Monthly',
      paymentType: employee.paymentType || 'Bank Transfer',
      nhfApplicable: (cost.deductionLines || []).some((line) => line.code === 'NHF' && line.amount > 0),
      setupAssignedToPayroll: employee.setupAssignedToPayroll,
      payrollStatus,
      riskSeverity: risk.severity,
      exceptionCount: risk.issues.length,
      exceptions: risk.issues,
      ...cost,
    };
  });

const emptyPayload = (request: Request, error: unknown) => {
  const role = getRole(request);
  const message = error instanceof Error ? error.message : 'Payroll data is temporarily unavailable.';
  const period = PAYROLL_SETUP_PREVIEW_PERIOD;
  return {
    generatedAt: nowIso(),
    source: 'Payroll service fallback',
    dataSource: {
      source: 'Payroll service fallback',
      databaseAvailable: false,
      warning: message,
      employeeCount: 0,
    },
    role,
    permissions: permissions(role),
    period,
    periodLabel: periodLabel(period),
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
    runs: Array.from(runStore.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    records: [],
    exceptions: [{
      id: 'payroll-service-error',
      employeeId: 'SYSTEM',
      employeeName: 'Payroll Management',
      issue: message,
      severity: 'High' as const,
      owner: 'System Administrator',
    }],
    breakdowns: {
      byPayrollGroup: [],
      byDepartment: [],
      byEmploymentType: [],
    },
    controls: [
      { id: 'master-data', label: 'Master Data Validation', status: 'Unavailable', tone: 'red' },
      { id: 'statutory', label: 'PAYE and Pension Estimate', status: 'Unavailable', tone: 'red' },
      { id: 'approval', label: 'Segregated Approval', status: 'Paused', tone: 'amber' },
      { id: 'audit', label: 'Payroll Audit Trail', status: 'Enabled', tone: 'cyan' },
    ],
    workflow: {
      currentStatus: 'Validation',
      nextOwner: 'System Administrator',
      blockedActions: [`Payroll data could not be loaded: ${message}`],
      approvalStage: 'Data unavailable',
    },
    auditTrail: auditStore.slice(0, 50),
  };
};

const maskMoney = (record: any) => ({
  ...record,
  basePay: null,
  allowances: null,
  pension: null,
  paye: null,
  otherDeductions: null,
  deductionLines: (record.deductionLines || []).map((line: any) => ({ ...line, amount: null })),
  taxablePay: null,
  nonTaxablePay: null,
  earningLines: record.earningLines.map((line: any) => ({ ...line, amount: null })),
  annualBenefitLines: record.annualBenefitLines.map((line: any) => ({ ...line, amount: null })),
  grossPay: null,
  deductions: null,
  netPay: null,
});

type PayrollGroupSummary = { label: string; employees: number; grossPay: number; netPay: number; exceptions: number };

const grouped = (records: any[], key: string) =>
  Array.from<PayrollGroupSummary>(
    records.reduce((map, record) => {
      const label = record[key] || 'Unassigned';
      const current = map.get(label) || { label, employees: 0, grossPay: 0, netPay: 0, exceptions: 0 };
      current.employees += 1;
      current.grossPay += record.grossPay || 0;
      current.netPay += record.netPay || 0;
      current.exceptions += record.exceptionCount || 0;
      map.set(label, current);
      return map;
    }, new Map<string, PayrollGroupSummary>()).values()
  )
    .map((item) => ({
      label: item.label,
      employees: item.employees,
      grossPay: roundMoney(item.grossPay),
      netPay: roundMoney(item.netPay),
      exceptions: item.exceptions,
    }))
    .sort((a, b) => b.netPay - a.netPay);

const buildPayload = async (request: Request) => {
  const role = getRole(request);
  const perms = permissions(role);
  const [employeeSource, taxConfig, pensionConfig] = await Promise.all([readPayrollEmployees(), readPayrollTaxConfig(), readPayrollPensionConfig()]);
  const employeeRows = employeeSource.employees;
  const taxVersion = activeTaxVersion(taxConfig);
  const pensionVersion = activePensionVersion(pensionConfig);
  if (!taxVersion || !pensionVersion) throw new Error('No active payroll tax or pension configuration is available.');
  try {
    await syncSageLeaveAllowanceEvents();
  } catch (error) {
    console.warn('Payroll leave allowance sync skipped:', error);
  }
  const records = buildRecords(employeeRows, taxVersion, pensionVersion);
  const eligible = records.filter((record) => !['Terminated', 'Resigned', 'Retired', 'Inactive'].includes(record.employmentStatus));
  const ready = records.filter((record) => record.payrollStatus === 'Ready');
  const blocked = records.filter((record) => record.payrollStatus === 'Blocked');
  const review = records.filter((record) => record.payrollStatus === 'Review');
  const totals = records.reduce(
    (sum, record) => ({
      grossPay: sum.grossPay + record.grossPay,
      deductions: sum.deductions + record.deductions,
      netPay: sum.netPay + record.netPay,
      basePay: sum.basePay + record.basePay,
      allowances: sum.allowances + record.allowances,
    }),
    { grossPay: 0, deductions: 0, netPay: 0, basePay: 0, allowances: 0 }
  );
  const period = PAYROLL_SETUP_PREVIEW_PERIOD;
  if (runStore.size === 0) {
    const run: PayrollRun = {
      id: `payroll-${period}`,
      period,
      status: blocked.length ? 'Validation' : 'Ready for Approval',
      employeeCount: eligible.length,
      grossPay: roundMoney(totals.grossPay),
      deductions: roundMoney(totals.deductions),
      netPay: roundMoney(totals.netPay),
      createdAt: nowIso(),
      createdBy: 'System',
      validatedAt: null,
      validatedBy: null,
      submittedAt: null,
      submittedBy: null,
      approvedAt: null,
      approvedBy: null,
      releasedAt: null,
      releasedBy: null,
      lockedAt: null,
      payslipsGeneratedAt: null,
      payslipsGeneratedBy: null,
      bankScheduleGeneratedAt: null,
      bankScheduleGeneratedBy: null,
      statutorySchedulesGeneratedAt: null,
      statutorySchedulesGeneratedBy: null,
      postedAt: null,
      postedBy: null,
    };
    runStore.set(run.id, run);
  }
  const currentRun = getCurrentRun();
  const exceptions = records
    .filter((record) => record.exceptionCount > 0)
    .flatMap((record) =>
      record.exceptions.map((issue: string, index: number) => ({
        id: `${record.employeeId}-${index}`,
        employeeId: record.employeeId,
        employeeName: record.fullName,
        issue,
        severity: record.riskSeverity,
        owner: issue.includes('Pay amount') || issue.includes('Payroll group') ? 'Payroll Officer' : issue.includes('status') ? 'HR Manager' : 'HR Officer',
      }))
    );

  const visibleRecords = perms.canViewMoney ? records : records.map(maskMoney);

  return {
    generatedAt: nowIso(),
    source: `${employeeSource.source} and payroll setup`,
    dataSource: payrollDataSourceInfo(employeeSource),
    role,
    permissions: perms,
    period,
    periodLabel: periodLabel(period),
    summary: {
      totalEmployees: employeeRows.length,
      payrollEligible: eligible.length,
      readyEmployees: ready.length,
      reviewEmployees: review.length,
      blockedEmployees: blocked.length,
      payrollCoveragePct: employeeRows.length ? Math.round((records.filter((r) => r.setupAssignedToPayroll).length / employeeRows.length) * 1000) / 10 : 0,
      grossPay: roundMoney(totals.grossPay),
      deductions: roundMoney(totals.deductions),
      netPay: roundMoney(totals.netPay),
      basePay: roundMoney(totals.basePay),
      allowances: roundMoney(totals.allowances),
      exceptionCount: exceptions.length,
    },
    runs: Array.from(runStore.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    records: visibleRecords,
    exceptions,
    breakdowns: {
      byPayrollGroup: grouped(records, 'payrollGroup'),
      byDepartment: grouped(records, 'department').slice(0, 12),
      byEmploymentType: grouped(records, 'employmentType'),
    },
    controls: [
      { id: 'master-data', label: 'Master Data Validation', status: blocked.length ? 'Attention Required' : 'Passed', tone: blocked.length ? 'red' : 'green' },
      { id: 'statutory', label: 'PAYE and Pension Estimate', status: 'Calculated', tone: 'blue' },
      { id: 'approval', label: 'Segregated Approval', status: currentRun?.status || 'Draft', tone: 'violet' },
      { id: 'audit', label: 'Payroll Audit Trail', status: 'Enabled', tone: 'cyan' },
    ],
    workflow: {
      currentStatus: currentRun?.status || 'Draft',
      nextOwner: blocked.length
        ? 'Payroll Officer'
        : !currentRun?.validatedAt
          ? 'Payroll Supervisor'
          : !currentRun?.submittedAt
            ? 'Payroll Officer'
            : !currentRun?.approvedAt
              ? 'HR / Finance / CFO'
              : !currentRun?.releasedAt
                ? 'Payroll Supervisor'
                : !currentRun?.postedAt
                  ? 'Finance Manager'
                  : 'Payroll Officer',
      blockedActions: [
        ...(blocked.length ? ['Approval is blocked until validation exceptions are resolved.'] : []),
        ...(!currentRun?.approvedAt ? ['Payslip publishing, bank schedule generation, and journal posting require payroll approval.'] : []),
        ...(currentRun?.approvedAt && !currentRun.bankScheduleGeneratedAt ? ['Bank schedule must be generated before posting and closing.'] : []),
        ...(currentRun?.approvedAt && !currentRun.statutorySchedulesGeneratedAt ? ['Statutory schedules must be generated before posting and closing.'] : []),
        ...(currentRun?.postedAt && !currentRun.payslipsGeneratedAt ? ['Payslips must be published before period close.'] : []),
      ],
      approvalStage: blocked.length ? 'Validation' : currentRun?.approvedAt ? 'Approved' : currentRun?.submittedAt ? 'Awaiting Approval' : 'Preparation',
    },
    auditTrail: auditStore.slice(0, 50),
  };
};

const csv = (records: any[]) => {
  const headers = ['Employee ID', 'Name', 'Department', 'Type', 'Status', 'Payroll Group', 'Salary Structure', 'Daily Rate', 'Hourly Rate', 'Currency', 'Gross Pay', 'Deductions', 'Net Pay', 'Payroll Status', 'Exceptions'];
  const lines = records.map((r) =>
    [
      r.employeeId,
      r.fullName,
      r.department,
      r.employmentType,
      r.employmentStatus,
      r.payrollGroup,
      r.salaryStructure || r.salaryGrade,
      r.ratePerDay ?? '',
      r.ratePerHour ?? '',
      r.payCurrency,
      r.grossPay,
      r.deductions,
      r.netPay,
      r.payrollStatus,
      r.exceptions.join('; '),
    ]
      .map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`)
      .join(',')
  );
  return [headers.join(','), ...lines].join('\n');
};

const payrollExportColumns = ['Employee ID', 'Name', 'Department', 'Type', 'Status', 'Payroll Group', 'Salary Structure', 'Daily Rate', 'Hourly Rate', 'Currency', 'Gross Pay', 'Deductions', 'Net Pay', 'Payroll Status', 'Exceptions'];

const payrollExportRows = (records: any[]) => records.map((r) => [
  r.employeeId,
  r.fullName,
  r.department,
  r.employmentType,
  r.employmentStatus,
  r.payrollGroup,
  r.salaryStructure || r.salaryGrade,
  r.ratePerDay ?? '',
  r.ratePerHour ?? '',
  r.payCurrency,
  r.grossPay,
  r.deductions,
  r.netPay,
  r.payrollStatus,
  (r.exceptions || []).join('; '),
]);

const reportTitle = (report: string) => ({
  'payroll-summary': 'Payroll Summary Report',
  'payroll-register': 'Payroll Register',
  'salary-analysis': 'Salary Analysis Report',
  'tax-report': 'PAYE Tax Report',
  'pension-report': 'Pension Report',
  'deduction-report': 'Deduction Report',
  'bank-payment-report': 'Bank Payment Report',
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
    return {
      columns: ['Employee ID', 'Name', 'Department', 'Taxable Pay', 'PAYE', 'Payroll Status', 'Exceptions'],
      rows: records.map((r) => [r.employeeId, r.fullName, r.department, r.taxablePay ?? '', r.paye ?? 0, r.payrollStatus, (r.exceptions || []).join('; ')]),
    };
  }
  if (report === 'pension-report') {
    return {
      columns: ['Employee ID', 'Name', 'Department', 'Gross Pay', 'Pension EE', 'Pension ER Estimate', 'Payroll Status'],
      rows: records.map((r) => [r.employeeId, r.fullName, r.department, r.grossPay ?? 0, r.pension ?? 0, roundMoney(Number(r.pension || 0) * 1.25), r.payrollStatus]),
    };
  }
  if (report === 'deduction-report' || report === 'compliance-report') {
    return {
      columns: ['Employee ID', 'Name', 'Department', 'PAYE', 'Pension', 'Other / NHF / Union', 'Total Deductions', 'Payroll Status'],
      rows: records.map((r) => [r.employeeId, r.fullName, r.department, r.paye ?? 0, r.pension ?? 0, r.otherDeductions ?? 0, r.deductions ?? 0, r.payrollStatus]),
    };
  }
  if (report === 'bank-payment-report') {
    return {
      columns: ['Employee ID', 'Name', 'Department', 'Location', 'Payment Type', 'Currency', 'Net Payment', 'Payroll Status', 'Exceptions'],
      rows: records.map((r) => [r.employeeId, r.fullName, r.department, r.location, r.paymentType, r.payCurrency, r.netPay ?? 0, r.payrollStatus, (r.exceptions || []).join('; ')]),
    };
  }
  if (report === 'salary-analysis') {
    return {
      columns: ['Employee ID', 'Name', 'Department', 'Employment Type', 'Salary Structure', 'Base Pay', 'Allowances', 'Gross Pay', 'Net Pay', 'Payroll Status'],
      rows: records.map((r) => [r.employeeId, r.fullName, r.department, r.employmentType, r.salaryStructure || r.salaryGrade, r.basePay ?? 0, r.allowances ?? 0, r.grossPay ?? 0, r.netPay ?? 0, r.payrollStatus]),
    };
  }
  return { columns: payrollExportColumns, rows: payrollExportRows(records) };
};

export async function GET(request: Request) {
  try {
    const payload = await buildPayload(request);
    const url = new URL(request.url);
    const report = compact(url.searchParams.get('report')) || 'payroll-register';
    const exportRecords = filterExportRecords(payload.records, url.searchParams.get('status'));
    if (url.searchParams.get('audit') === '1') return jsonOk({ auditTrail: auditStore.slice(0, 200) });
    if (url.searchParams.get('format') === 'csv') {
      if (!payload.permissions.canExport) return jsonErr(403, 'Permission denied');
      return new Response(csv(exportRecords), {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="${report}-${payload.period}.csv"`,
        },
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
        headers: {
          'content-type': excelMimeType,
          'content-disposition': `attachment; filename="${report}-${payload.period}.xls"`,
        },
      });
    }
    return jsonOk(payload);
  } catch (error) {
    console.error('Payroll Management API Error:', error);
    const url = new URL(request.url);
    const payload = emptyPayload(request, error);
    if (url.searchParams.get('audit') === '1') return jsonOk({ auditTrail: auditStore.slice(0, 200), warning: payload.dataSource.warning });
    return jsonErr(503, payload.dataSource.warning || 'Payroll employee source is unavailable. HRIS database data is required for production payroll.');
  }
}

export async function POST(request: Request) {
  const role = getRole(request);
  const perms = permissions(role);
  const body = await request.json().catch(() => ({}));
  const action = compact(body.action);
  const runId = compact(body.runId) || `payroll-${monthPeriod()}`;
  const existing = runStore.get(runId);
  const actor = compact(body.actor) || role;
  const reason = compact(body.reason);
  const comment = compact(body.comment);

  if (action === 'set-nhf-applicability') {
    if (!perms.canManageRun && !perms.canConfigure) return jsonErr(403, 'Permission denied');
    const employeeId = compact(body.employeeId || body.employeeCode);
    if (!employeeId) return jsonErr(400, 'Employee ID is required.');
    if (typeof body.nhfApplicable !== 'boolean') return jsonErr(400, 'NHF applicability must be true or false.');
    const option = await writePayrollEmployeeOption({
      employeeId,
      employeeCode: employeeId,
      nhfApplicable: body.nhfApplicable,
      updatedBy: actor,
    });
    invalidatePayrollEmployeeCache();
    logAudit(request, {
      user: actor,
      role,
      action,
      record: employeeId,
      oldValue: null,
      newValue: body.nhfApplicable ? 'NHF enabled' : 'NHF disabled',
      reason,
      comment,
    });
    return jsonOk({ option });
  }

  if (action === 'create-run') {
    if (!perms.canManageRun) return jsonErr(403, 'Permission denied');
    const payload = await buildPayload(request);
    if (payload.summary.blockedEmployees > 0) return jsonErr(409, 'Cannot process payroll while employees without valid payroll setup are blocked.');
    const run: PayrollRun = {
      id: runId,
      period: payload.period,
      status: 'Computed',
      employeeCount: payload.summary.payrollEligible,
      grossPay: payload.summary.grossPay,
      deductions: payload.summary.deductions,
      netPay: payload.summary.netPay,
      createdAt: nowIso(),
      createdBy: role,
      validatedAt: nowIso(),
      validatedBy: role,
      submittedAt: null,
      submittedBy: null,
      approvedAt: null,
      approvedBy: null,
      releasedAt: null,
      releasedBy: null,
      lockedAt: null,
      payslipsGeneratedAt: null,
      payslipsGeneratedBy: null,
      bankScheduleGeneratedAt: null,
      bankScheduleGeneratedBy: null,
      statutorySchedulesGeneratedAt: null,
      statutorySchedulesGeneratedBy: null,
      postedAt: null,
      postedBy: null,
      closedAt: null,
      reopenedAt: null,
      reopenedBy: null,
      reopenReason: null,
    };
    runStore.set(run.id, run);
    logAudit(request, { user: actor, role, action: 'create-run', record: run.id, oldValue: null, newValue: run.status, reason, comment });
    return jsonOk({ run });
  }

  if (!existing) return jsonErr(404, 'Payroll run not found');
  const before = existing.status;

  if (['approve-run', 'post-run', 'lock-run', 'close-period'].includes(action) && existing.status === 'Closed') {
    return jsonErr(409, 'Closed payroll periods cannot be edited without approved reopening.');
  }

  if (action === 'approve-run') {
    if (!perms.canApprove) return jsonErr(403, 'Permission denied');
    if (existing.createdBy === role) return jsonErr(409, 'Self-approval is not allowed.');
    const payload = await buildPayload(request);
    if (payload.summary.exceptionCount > 0) return jsonErr(409, 'Cannot approve payroll while validation exceptions are unresolved.');
    if (!['Ready for Approval', 'Submitted', 'Under Review', 'Validation'].includes(existing.status)) return jsonErr(409, `Cannot approve payroll from ${existing.status}.`);
    existing.status = 'Approved';
    existing.approvedAt = nowIso();
    existing.approvedBy = role;
    logAudit(request, { user: actor, role, action: 'approve-run', record: existing.id, oldValue: before, newValue: existing.status, reason, comment });
    return jsonOk({ run: existing });
  }
  if (action === 'lock-run') {
    if (!perms.canManageRun) return jsonErr(403, 'Permission denied');
    if (!['Approved', 'Released', 'Published'].includes(existing.status)) return jsonErr(409, 'Payroll results can only be locked after approval.');
    existing.status = 'Locked';
    existing.lockedAt = nowIso();
    logAudit(request, { user: actor, role, action: 'lock-run', record: existing.id, oldValue: before, newValue: existing.status, reason, comment });
    return jsonOk({ run: existing });
  }
  if (action === 'validate-payroll') {
    if (!perms.canManageRun) return jsonErr(403, 'Permission denied');
    const payload = await buildPayload(request);
    existing.status = payload.summary.blockedEmployees > 0 ? 'Validation' : 'Validated';
    existing.validatedAt = nowIso();
    existing.validatedBy = role;
    logAudit(request, { user: actor, role, action: 'validate-payroll', record: existing.id, oldValue: before, newValue: existing.status, reason, comment: `${payload.summary.exceptionCount} validation exceptions detected.` });
    return jsonOk({ run: existing, exceptionCount: payload.summary.exceptionCount });
  }
  if (action === 'release-run') {
    if (!perms.canManageRun && !perms.canPost) return jsonErr(403, 'Permission denied');
    if (existing.status !== 'Approved') return jsonErr(409, 'Payroll can only be released after approval.');
    existing.status = 'Released';
    existing.releasedAt = nowIso();
    existing.releasedBy = role;
    existing.lockedAt = existing.lockedAt || nowIso();
    logAudit(request, { user: actor, role, action: 'release-run', record: existing.id, oldValue: before, newValue: existing.status, reason, comment });
    return jsonOk({ run: existing });
  }
  if (action === 'generate-payslips') {
    if (!perms.canManageRun) return jsonErr(403, 'Permission denied');
    if (!['Approved', 'Released', 'Locked', 'Posted', 'Published'].includes(existing.status)) return jsonErr(409, 'Payslips can only be published after payroll approval.');
    existing.payslipsGeneratedAt = nowIso();
    existing.payslipsGeneratedBy = role;
    existing.status = existing.postedAt ? existing.status : 'Published';
    logAudit(request, { user: actor, role, action: 'generate-payslips', record: existing.id, oldValue: before, newValue: existing.status, reason, comment: 'Payslips published to employee self-service queue.' });
    return jsonOk({ run: existing });
  }
  if (action === 'generate-bank-schedule') {
    if (!perms.canPost) return jsonErr(403, 'Permission denied');
    if (!['Approved', 'Released', 'Locked', 'Published'].includes(existing.status)) return jsonErr(409, 'Bank schedule generation requires approved payroll.');
    existing.bankScheduleGeneratedAt = nowIso();
    existing.bankScheduleGeneratedBy = role;
    logAudit(request, { user: actor, role, action: 'generate-bank-schedule', record: existing.id, oldValue: before, newValue: 'Bank schedule generated', reason, comment });
    return jsonOk({ run: existing });
  }
  if (action === 'generate-statutory-schedules') {
    if (!perms.canManageRun && !perms.canPost) return jsonErr(403, 'Permission denied');
    if (!['Approved', 'Released', 'Locked', 'Published'].includes(existing.status)) return jsonErr(409, 'Statutory schedules require approved payroll.');
    existing.statutorySchedulesGeneratedAt = nowIso();
    existing.statutorySchedulesGeneratedBy = role;
    logAudit(request, { user: actor, role, action: 'generate-statutory-schedules', record: existing.id, oldValue: before, newValue: 'Statutory schedules generated', reason, comment: 'PAYE, Pension, NHF, NSITF, and ITF schedule pack generated.' });
    return jsonOk({ run: existing });
  }
  if (action === 'post-run') {
    if (!perms.canPost) return jsonErr(403, 'Permission denied');
    if (!['Approved', 'Released', 'Locked', 'Published'].includes(existing.status)) return jsonErr(409, 'Payroll journal cannot be posted before payroll approval.');
    if (!existing.bankScheduleGeneratedAt) return jsonErr(409, 'Generate the bank schedule before posting payroll.');
    if (!existing.statutorySchedulesGeneratedAt) return jsonErr(409, 'Generate statutory schedules before posting payroll.');
    existing.status = 'Posted';
    existing.postedAt = nowIso();
    existing.postedBy = role;
    logAudit(request, { user: actor, role, action: 'post-run', record: existing.id, oldValue: before, newValue: existing.status, reason, comment });
    return jsonOk({ run: existing });
  }
  if (action === 'submit-run') {
    if (!perms.canManageRun) return jsonErr(403, 'Permission denied');
    const payload = await buildPayload(request);
    if (payload.summary.exceptionCount > 0) return jsonErr(409, 'Resolve validation exceptions before submitting payroll for approval.');
    if (!['Ready for Approval', 'Validated', 'Computed', 'Validation', 'Draft', 'Open'].includes(existing.status)) return jsonErr(409, `Cannot submit payroll from ${existing.status}.`);
    existing.status = 'Submitted';
    existing.submittedAt = nowIso();
    existing.submittedBy = role;
    logAudit(request, { user: actor, role, action: 'submit-run', record: existing.id, oldValue: before, newValue: existing.status, reason, comment });
    return jsonOk({ run: existing });
  }
  if (action === 'create-period' || action === 'open-period') {
    if (!perms.canManageRun) return jsonErr(403, 'Permission denied');
    existing.status = action === 'create-period' ? 'Draft' : 'Open';
    logAudit(request, { user: actor, role, action, record: existing.id, oldValue: before, newValue: existing.status, reason, comment });
    return jsonOk({ run: existing });
  }
  if (action === 'reject-run' || action === 'request-revision') {
    if (!perms.canApprove) return jsonErr(403, 'Permission denied');
    existing.status = action === 'reject-run' ? 'Rejected' : 'Revision Requested';
    logAudit(request, { user: actor, role, action, record: existing.id, oldValue: before, newValue: existing.status, reason: reason || 'Approval decision', comment });
    return jsonOk({ run: existing });
  }
  if (action === 'close-period') {
    if (!perms.canManageRun && !perms.canApprove) return jsonErr(403, 'Permission denied');
    if (existing.status !== 'Posted') return jsonErr(409, 'Period closing requires payroll approval, release, payslips, bank schedule, journal posting, and statutory schedules.');
    if (!existing.payslipsGeneratedAt) return jsonErr(409, 'Publish payslips before closing the payroll period.');
    if (!existing.bankScheduleGeneratedAt || !existing.statutorySchedulesGeneratedAt) return jsonErr(409, 'Generate bank and statutory schedules before closing the payroll period.');
    existing.status = 'Closed';
    existing.closedAt = nowIso();
    existing.lockedAt = existing.lockedAt || nowIso();
    logAudit(request, { user: actor, role, action: 'close-period', record: existing.id, oldValue: before, newValue: existing.status, reason, comment });
    return jsonOk({ run: existing });
  }
  if (action === 'reopen-period') {
    if (!perms.canReopen) return jsonErr(403, 'Only CFO, Executive Director, or Super Admin can reopen closed payroll periods.');
    if (existing.status !== 'Closed') return jsonErr(409, 'Only closed periods can be reopened.');
    if (!reason) return jsonErr(400, 'Reopening requires a reason.');
    existing.status = 'Reopened';
    existing.reopenedAt = nowIso();
    existing.reopenedBy = role;
    existing.reopenReason = reason;
    logAudit(request, { user: actor, role, action: 'reopen-period', record: existing.id, oldValue: before, newValue: existing.status, reason, comment });
    return jsonOk({ run: existing });
  }
  if (action) {
    logAudit(request, { user: actor, role, action, record: runId, oldValue: null, newValue: 'Logged', reason, comment });
    return jsonOk({ run: existing, logged: true });
  }
  return jsonErr(400, 'Unsupported payroll action');
}
