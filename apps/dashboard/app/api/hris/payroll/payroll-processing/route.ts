import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import type { DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import { payrollDataSourceInfo, readPayrollEmployees } from '@/lib/payroll-employee-source';
import { calculatePayrollEarnings } from '@/lib/payroll-earnings-engine';
import { activeTaxVersion, calculatePayrollTax, payrollInputFromEmployee, readPayrollTaxConfig } from '@/lib/payroll-tax-engine';
import { activePensionVersion, calculatePension, pensionInputFromEmployee, readPayrollPensionConfig } from '@/lib/payroll-pension-engine';
import { activeStatutoryFundsVersion, calculateStatutoryFunds, readStatutoryFundsConfig, statutoryFundInputFromEmployee } from '@/lib/payroll-statutory-funds-engine';
import { activeLoansVersion, calculateLoanRecovery, loanInputsFromApplications, readPayrollLoanApplications, readPayrollLoansConfig } from '@/lib/payroll-loans-engine';
import { syncSageLeaveAllowanceEvents } from '@/lib/payroll-leave-allowance-store';
import { activePayrollPeriod } from '@/lib/payroll-periods';
import { normalizePayrollMatchKey, readSagePayrollPeriodTotals } from '@/lib/sage-people-payroll-store';

type Role = 'Super Admin' | 'HR Director' | 'HR Manager' | 'Payroll Officer' | 'Finance Controller' | 'Executive Management' | 'Auditor' | 'Employee';
type RunStatus = 'Draft' | 'Calculated' | 'Submitted' | 'Finance Approved' | 'HR Approved' | 'Locked' | 'Posted' | 'Rejected';
type RecordStatus = 'Ready' | 'Review' | 'Blocked';
type Tone = 'blue' | 'green' | 'amber' | 'red' | 'violet' | 'cyan' | 'slate';

type PayrollRunHistory = {
  id: string;
  period: string;
  periodLabel: string;
  status: RunStatus;
  employeeCount: number;
  grossPay: number;
  netPay: number;
  totalDeductions: number;
  employerCost: number;
  exceptionCount: number;
  createdAt: string;
  createdBy: Role;
  updatedAt: string;
  updatedBy: Role;
  audit: Array<{ at: string; actor: Role; action: string; from?: RunStatus; to?: RunStatus; note?: string }>;
};

const ok = <T,>(data: T) => NextResponse.json({ status: 'success', data });
const err = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });
const roundMoney = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
const compact = (value: unknown) => String(value || '').trim();
const activeStatus = (value: unknown) => !compact(value).toLowerCase().match(/terminated|resigned|retired|inactive|deceased/);
const moneyVariance = (actual: number | null | undefined, expected: number | null | undefined) => roundMoney(Number(expected || 0) - Number(actual || 0));
const varianceStatus = (variance: number, threshold = 1) => (Math.abs(variance) <= threshold ? 'Matched' : 'Variance');
const inputOnlyEmployee = (employee: DleEmployeeDirectoryRow): DleEmployeeDirectoryRow => ({
  ...employee,
  sagePayrollEarnings: [],
  sagePayrollDeductions: undefined,
  sagePayrollContributions: undefined,
});

const resolveDashboardRoot = () => {
  const cwd = process.cwd();
  const dashboardSuffix = path.join('apps', 'dashboard');
  return cwd.endsWith(dashboardSuffix) ? cwd : path.join(cwd, dashboardSuffix);
};

const RUNS_PATH = path.join(resolveDashboardRoot(), 'data', 'hris', 'payroll-processing-runs.json');

const getRole = (request: Request): Role => {
  const value = request.headers.get('x-hris-role');
  const roles: Role[] = ['Super Admin', 'HR Director', 'HR Manager', 'Payroll Officer', 'Finance Controller', 'Executive Management', 'Auditor', 'Employee'];
  return roles.includes(value as Role) ? (value as Role) : 'Payroll Officer';
};

const permissions = (role: Role) => ({
  canViewMoney: ['Super Admin', 'HR Director', 'HR Manager', 'Payroll Officer', 'Finance Controller', 'Executive Management', 'Auditor'].includes(role),
  canCalculate: ['Super Admin', 'HR Director', 'HR Manager', 'Payroll Officer', 'Finance Controller'].includes(role),
  canSubmit: ['Super Admin', 'Payroll Officer', 'HR Manager'].includes(role),
  canApproveFinance: ['Super Admin', 'Finance Controller', 'Executive Management'].includes(role),
  canApproveHr: ['Super Admin', 'HR Director'].includes(role),
  canLock: ['Super Admin', 'Finance Controller', 'HR Director'].includes(role),
  canExport: role !== 'Employee',
});

const monthPeriod = activePayrollPeriod;

const knownPayrollPeriods = (runs: PayrollRunHistory[], currentPeriod: string) => {
  const seeded = ['2026-04', activePayrollPeriod(), currentPeriod];
  return Array.from(new Set([...seeded, ...runs.map((run) => run.period)]))
    .filter(Boolean)
    .sort((a, b) => b.localeCompare(a))
    .map((period) => {
      const run = runs.find((item) => item.period === period);
      return {
        period,
        periodLabel: periodLabel(period),
        status: run?.status || 'Draft',
        employeeCount: run?.employeeCount || 0,
        netPay: run?.netPay || 0,
      };
    });
};

const periodLabel = (period: string) => {
  const [year, month] = period.split('-').map(Number);
  return new Date(year || new Date().getFullYear(), (month || 1) - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
};

const readRuns = async (): Promise<PayrollRunHistory[]> => {
  try {
    const parsed = JSON.parse(await readFile(RUNS_PATH, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeRuns = async (runs: PayrollRunHistory[]) => {
  await mkdir(path.dirname(RUNS_PATH), { recursive: true });
  await writeFile(RUNS_PATH, JSON.stringify(runs, null, 2), 'utf8');
};

const statusFromIssues = (issues: string[]): RecordStatus => {
  if (issues.some((issue) => /missing|not payroll active|no active/i.test(issue))) return 'Blocked';
  return issues.length ? 'Review' : 'Ready';
};

const buildPayload = async (request: Request, requestedPeriod = monthPeriod()) => {
  const role = getRole(request);
  const perms = permissions(role);
  const [employeeSource, taxConfig, pensionConfig, fundsConfig, loansConfig, loanApplications, runs, sagePeriodTotals] = await Promise.all([
    readPayrollEmployees(),
    readPayrollTaxConfig(),
    readPayrollPensionConfig(),
    readStatutoryFundsConfig(),
    readPayrollLoansConfig(),
    readPayrollLoanApplications(),
    readRuns(),
    readSagePayrollPeriodTotals(requestedPeriod).catch(() => []),
  ]);

  const taxVersion = activeTaxVersion(taxConfig);
  const pensionVersion = activePensionVersion(pensionConfig);
  const fundsVersion = activeStatutoryFundsVersion(fundsConfig);
  const loansVersion = activeLoansVersion(loansConfig);
  if (!taxVersion || !pensionVersion || !fundsVersion || !loansVersion) throw new Error('One or more active payroll configuration versions are missing.');
  await syncSageLeaveAllowanceEvents();
  const sageByKey = new Map<string, (typeof sagePeriodTotals)[number]>();
  for (const total of sagePeriodTotals) {
    [
      total.directoryEmployeeCode,
      total.employeeCode,
      total.employeeId,
      total.employeeName,
    ].map(normalizePayrollMatchKey).filter(Boolean).forEach((key) => sageByKey.set(key, total));
  }

  const loanInputs = loanInputsFromApplications(employeeSource.employees, loanApplications).reduce((map, input) => {
    const current = map.get(input.employee.employeeId) || [];
    current.push(input);
    map.set(input.employee.employeeId, current);
    return map;
  }, new Map<string, ReturnType<typeof loanInputsFromApplications>>());
  const calculationOptions = { period: requestedPeriod, includePeriodAdjustments: true, ignoreSagePayslipLines: true };
  const records = employeeSource.employees.map((employee, index) => {
    const calculationEmployee = inputOnlyEmployee(employee);
    const amounts = calculatePayrollEarnings(calculationEmployee, calculationOptions);
    const tax = calculatePayrollTax(payrollInputFromEmployee(calculationEmployee, calculationOptions), taxVersion);
    const pension = calculatePension(pensionInputFromEmployee(calculationEmployee, calculationOptions), pensionVersion);
    const funds = calculateStatutoryFunds(statutoryFundInputFromEmployee(calculationEmployee, employeeSource.employees.length, calculationOptions), fundsVersion);
    const loans = (loanInputs.get(employee.employeeId) || []).map((loanInput) => calculateLoanRecovery(loanInput, loansVersion));
    const sageActual = [
      employee.employeeCode,
      employee.employeeId,
      employee.id,
      employee.fullName,
    ].map(normalizePayrollMatchKey).map((key) => sageByKey.get(key)).find(Boolean) || null;
    const paye = tax.monthlyPaye;
    const employeePension = pension.employeeContribution;
    const statutoryEmployee = funds.employeeDeductions;
    const loanRecovery = roundMoney(loans.reduce((sum, loan) => sum + loan.payrollRecovery, 0));
    const taxComponentMonthly = (id: string) => (tax.statutoryItems.find((item) => item.id === id)?.amount || 0) / 12;
    const otherDeductions = roundMoney(taxComponentMonthly('union-dues') + taxComponentMonthly('other-statutory'));
    const totalDeductions = roundMoney(paye + employeePension + statutoryEmployee + loanRecovery + otherDeductions);
    const netPay = roundMoney(Math.max(0, amounts.grossPay - totalDeductions));
    const grossVariance = sageActual ? moneyVariance(sageActual.grossPay, amounts.grossPay) : null;
    const netVariance = sageActual ? moneyVariance(sageActual.netPay, netPay) : null;
    const deductionVariance = sageActual ? moneyVariance(sageActual.totalDeductions, totalDeductions) : null;
    const employerPension = pension.employerContribution;
    const employerStatutory = funds.employerCosts;
    const employerCost = roundMoney(amounts.grossPay + employerPension + employerStatutory);
    const deductionRatio = amounts.grossPay > 0 ? roundMoney((totalDeductions / amounts.grossPay) * 100) : 0;
    const issues = [
      ...tax.annualGrossIncome <= 0 ? ['Gross pay is missing'] : [],
      ...!employee.setupAssignedToPayroll ? ['Payroll setup is not assigned'] : [],
      ...!compact(employee.payrollGroup) ? ['Payroll group is missing'] : [],
      ...!compact(employee.payCurrency) ? ['Pay currency is missing'] : [],
      ...!activeStatus(employee.status) ? ['Employee is not payroll active'] : [],
      ...pension.issues.filter((issue) => issue !== 'RSA PIN is not on file' && issue !== 'PFA provider is not assigned').map((issue) => `Pension: ${issue}`),
      ...funds.issues.map((issue) => `Statutory: ${issue}`),
      ...loans.flatMap((loan) => loan.issues.filter((issue) => issue !== 'Loan is not approved for payroll recovery').map((issue) => `Loan: ${issue}`)),
      ...deductionRatio > 45 ? ['Deduction ratio exceeds 45% control threshold'] : [],
      ...netPay <= 0 && amounts.grossPay > 0 ? ['Net pay is zero after deductions'] : [],
      ...!sageActual ? ['Sage period comparison unavailable'] : [],
      ...grossVariance !== null && Math.abs(grossVariance) > 1 ? [`Sage gross variance ${grossVariance}`] : [],
      ...netVariance !== null && Math.abs(netVariance) > 1 ? [`Sage net variance ${netVariance}`] : [],
    ];
    return {
      recordKey: `${requestedPeriod}-${employee.employeeDbId || 'row'}-${employee.employeeId || employee.employeeCode || 'employee'}-${index}`,
      employeeId: employee.employeeId,
      employeeCode: employee.employeeCode,
      fullName: employee.fullName,
      department: employee.department,
      businessUnit: employee.businessUnit,
      location: employee.location,
      employmentType: employee.employmentType,
      employmentStatus: employee.status,
      payrollGroup: employee.payrollGroup || 'Unassigned',
      salaryGrade: employee.salaryGrade || employee.jobGrade || 'Unassigned',
      payCurrency: employee.payCurrency || 'NGN',
      paymentRun: employee.paymentRun || 'Monthly',
      basePay: amounts.basePay,
      allowances: amounts.allowances,
      grossPay: amounts.grossPay,
      taxablePay: amounts.taxablePay,
      nonTaxablePay: amounts.nonTaxablePay,
      earningProfile: amounts.profileName,
      earningProfileId: amounts.profileId,
      paye: roundMoney(paye),
      pensionEmployee: roundMoney(employeePension),
      pensionEmployer: roundMoney(employerPension),
      statutoryEmployee: roundMoney(statutoryEmployee),
      statutoryEmployer: roundMoney(employerStatutory),
      loanRecovery: roundMoney(loanRecovery),
      otherDeductions,
      totalDeductions,
      netPay,
      employerCost,
      deductionRatio,
      sageActual: sageActual ? {
        employeeCode: sageActual.employeeCode,
        directoryEmployeeCode: sageActual.directoryEmployeeCode,
        employeePayPeriodId: sageActual.employeePayPeriodId,
        lastCalcDate: sageActual.lastCalcDate,
        grossPay: roundMoney(Number(sageActual.grossPay || 0)),
        taxablePay: roundMoney(Number(sageActual.taxablePay || 0)),
        paye: roundMoney(Number(sageActual.paye || 0)),
        pensionEmployee: roundMoney(Number(sageActual.pensionEmployee || 0)),
        totalDeductions: roundMoney(Number(sageActual.totalDeductions || 0)),
        netPay: roundMoney(Number(sageActual.netPay || 0)),
      } : null,
      discrepancies: {
        status: grossVariance === null ? 'Missing Sage' : varianceStatus(grossVariance),
        grossVariance,
        netVariance,
        deductionVariance,
      },
      status: statusFromIssues(issues),
      issues,
    };
  });

  const totals = records.reduce(
    (sum, record) => ({
      basePay: sum.basePay + record.basePay,
      allowances: sum.allowances + record.allowances,
      grossPay: sum.grossPay + record.grossPay,
      paye: sum.paye + record.paye,
      pensionEmployee: sum.pensionEmployee + record.pensionEmployee,
      pensionEmployer: sum.pensionEmployer + record.pensionEmployer,
      statutoryEmployee: sum.statutoryEmployee + record.statutoryEmployee,
      statutoryEmployer: sum.statutoryEmployer + record.statutoryEmployer,
      loanRecovery: sum.loanRecovery + record.loanRecovery,
      totalDeductions: sum.totalDeductions + record.totalDeductions,
      netPay: sum.netPay + record.netPay,
      employerCost: sum.employerCost + record.employerCost,
      exceptionCount: sum.exceptionCount + record.issues.length,
      sageGrossPay: sum.sageGrossPay + Number(record.sageActual?.grossPay || 0),
      sageNetPay: sum.sageNetPay + Number(record.sageActual?.netPay || 0),
      grossVariance: sum.grossVariance + Number(record.discrepancies.grossVariance || 0),
      netVariance: sum.netVariance + Number(record.discrepancies.netVariance || 0),
      discrepancyCount: sum.discrepancyCount + (record.discrepancies.status === 'Variance' || record.discrepancies.status === 'Missing Sage' ? 1 : 0),
    }),
    { basePay: 0, allowances: 0, grossPay: 0, paye: 0, pensionEmployee: 0, pensionEmployer: 0, statutoryEmployee: 0, statutoryEmployer: 0, loanRecovery: 0, totalDeductions: 0, netPay: 0, employerCost: 0, exceptionCount: 0, sageGrossPay: 0, sageNetPay: 0, grossVariance: 0, netVariance: 0, discrepancyCount: 0 }
  );

  const latestRun = runs.find((run) => run.period === requestedPeriod) || null;
  const byGroup = Array.from(
    records.reduce((map: Map<string, { label: string; employees: number; grossPay: number; netPay: number; exceptions: number }>, record) => {
      const label = record.payrollGroup || 'Unassigned';
      const current = map.get(label) || { label, employees: 0, grossPay: 0, netPay: 0, exceptions: 0 };
      current.employees += 1;
      current.grossPay += record.grossPay;
      current.netPay += record.netPay;
      current.exceptions += record.issues.length;
      map.set(label, current);
      return map;
    }, new Map()).values()
  ).map((item) => ({ ...item, grossPay: roundMoney(item.grossPay), netPay: roundMoney(item.netPay) })).sort((a, b) => b.grossPay - a.grossPay);

  const component = (id: string, label: string, amount: number, tone: Tone, payer: 'Employee' | 'Employer' | 'Both') => ({ id, label, amount: roundMoney(amount), tone, payer });
  const summary = {
    employees: records.length,
    basePay: roundMoney(totals.basePay),
    allowances: roundMoney(totals.allowances),
    grossPay: roundMoney(totals.grossPay),
    totalDeductions: roundMoney(totals.totalDeductions),
    netPay: roundMoney(totals.netPay),
    employerCost: roundMoney(totals.employerCost),
    sageGrossPay: roundMoney(totals.sageGrossPay),
    sageNetPay: roundMoney(totals.sageNetPay),
    grossVariance: roundMoney(totals.grossVariance),
    netVariance: roundMoney(totals.netVariance),
    discrepancyCount: totals.discrepancyCount,
    ready: records.filter((record) => record.status === 'Ready').length,
    review: records.filter((record) => record.status === 'Review').length,
    blocked: records.filter((record) => record.status === 'Blocked').length,
    exceptionCount: totals.exceptionCount,
    averageDeductionRatio: totals.grossPay ? roundMoney((totals.totalDeductions / totals.grossPay) * 100) : 0,
  };

  const maskedRecords = records.map((record) => ({
    ...record,
    basePay: null,
    allowances: null,
    grossPay: null,
    paye: null,
    pensionEmployee: null,
    pensionEmployer: null,
    statutoryEmployee: null,
    statutoryEmployer: null,
    loanRecovery: null,
    totalDeductions: null,
    netPay: null,
    employerCost: null,
    deductionRatio: null,
    sageActual: null,
    discrepancies: { status: record.discrepancies.status, grossVariance: null, netVariance: null, deductionVariance: null },
  }));

  return {
    generatedAt: new Date().toISOString(),
    source: 'DLE payroll processing engine',
    dataSource: payrollDataSourceInfo(employeeSource),
    period: requestedPeriod,
    periodLabel: periodLabel(requestedPeriod),
    role,
    permissions: perms,
    run: latestRun,
    runs: runs.slice(0, 12),
    availablePeriods: knownPayrollPeriods(runs, requestedPeriod),
    configurations: {
      tax: { id: taxVersion.id, name: taxVersion.name, effectiveFrom: taxVersion.effectiveFrom },
      pension: { id: pensionVersion.id, name: pensionVersion.name, effectiveFrom: pensionVersion.effectiveFrom },
      statutoryFunds: { id: fundsVersion.id, name: fundsVersion.name, effectiveFrom: fundsVersion.effectiveFrom },
      loans: { id: loansVersion.id, name: loansVersion.name, effectiveFrom: loansVersion.effectiveFrom },
    },
    summary: perms.canViewMoney ? summary : { ...summary, basePay: null, allowances: null, grossPay: null, totalDeductions: null, netPay: null, employerCost: null, averageDeductionRatio: null },
    records: perms.canViewMoney ? records : maskedRecords,
    breakdowns: {
      byPayrollGroup: perms.canViewMoney ? byGroup : byGroup.map((item) => ({ ...item, grossPay: null, netPay: null })),
      byComponent: perms.canViewMoney
        ? [
            component('paye', 'PAYE', totals.paye, 'violet', 'Employee'),
            component('pension-employee', 'Employee Pension', totals.pensionEmployee, 'blue', 'Employee'),
            component('statutory-employee', 'NHF/Statutory Employee', totals.statutoryEmployee, 'cyan', 'Employee'),
            component('loan', 'Loan Recovery', totals.loanRecovery, 'amber', 'Employee'),
            component('pension-employer', 'Employer Pension', totals.pensionEmployer, 'green', 'Employer'),
            component('statutory-employer', 'NSITF/ITF Employer', totals.statutoryEmployer, 'slate', 'Employer'),
          ]
        : [],
    },
    controls: [
      { id: 'employees', label: 'Employee Source', status: employeeSource.databaseAvailable ? 'Passed' : 'Review', detail: `${employeeSource.employees.length} employees loaded from ${employeeSource.source}`, tone: employeeSource.databaseAvailable ? 'green' : 'amber' },
      { id: 'config', label: 'Configuration Versions', status: 'Passed', detail: 'PAYE, pension, statutory funds, and loan policies resolved by active effective versions.', tone: 'blue' },
      { id: 'exceptions', label: 'Exception Gate', status: summary.blocked > 0 ? 'Blocked' : summary.review > 0 ? 'Review' : 'Passed', detail: `${summary.blocked} blocked, ${summary.review} review, ${summary.exceptionCount} total flags.`, tone: summary.blocked > 0 ? 'red' : summary.review > 0 ? 'amber' : 'green' },
      { id: 'sage-discrepancy', label: 'Sage May Discrepancy Check', status: summary.discrepancyCount > 0 ? 'Review' : 'Matched', detail: `${summary.discrepancyCount} generated-vs-Sage discrepancy records. Gross variance ${roundMoney(summary.grossVariance)}.`, tone: summary.discrepancyCount > 0 ? 'amber' : 'green' },
      { id: 'approval', label: 'Approval Workflow', status: latestRun?.status || 'Draft', detail: 'Submit, finance approve, HR approve, lock, and post payroll with full audit trace.', tone: latestRun?.status === 'Posted' || latestRun?.status === 'Locked' ? 'green' : 'violet' },
    ],
  };
};

const csv = (records: any[]) => {
  const headers = ['Employee ID', 'Name', 'Department', 'Payroll Group', 'Generated Gross', 'Sage Gross', 'Gross Variance', 'Generated PAYE', 'Generated Pension Employee', 'Generated Statutory Employee', 'Generated Loan', 'Generated Deductions', 'Sage Deductions', 'Deduction Variance', 'Generated Net Pay', 'Sage Net Pay', 'Net Variance', 'Employer Cost', 'Discrepancy Status', 'Payroll Status', 'Issues'];
  const lines = records.map((record) =>
    [record.employeeId, record.fullName, record.department, record.payrollGroup, record.grossPay, record.sageActual?.grossPay ?? '', record.discrepancies?.grossVariance ?? '', record.paye, record.pensionEmployee, record.statutoryEmployee, record.loanRecovery, record.totalDeductions, record.sageActual?.totalDeductions ?? '', record.discrepancies?.deductionVariance ?? '', record.netPay, record.sageActual?.netPay ?? '', record.discrepancies?.netVariance ?? '', record.employerCost, record.discrepancies?.status || '', record.status, record.issues.join('; ')]
      .map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`)
      .join(',')
  );
  return [headers.join(','), ...lines].join('\n');
};

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const period = url.searchParams.get('period') || monthPeriod();
    const payload = await buildPayload(request, period);
    if (url.searchParams.get('format') === 'csv') {
      if (!payload.permissions.canExport) return err(403, 'Permission denied');
      return new Response(csv(payload.records), {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="payroll-processing-${period}.csv"`,
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
    const role = getRole(request);
    const perms = permissions(role);
    const body = await request.json().catch(() => ({}));
    const action = compact(body.action);
    const period = compact(body.period) || monthPeriod();
    const note = compact(body.note);
    if (!perms.canCalculate) return err(403, 'Permission denied');

    const payload = await buildPayload(request, period);
    const runs = await readRuns();
    const existing = runs.find((run) => run.period === period);
    const now = new Date().toISOString();
    const transition = (current: RunStatus | undefined): RunStatus => {
      if (action === 'calculate') return 'Calculated';
      if (action === 'submit') return 'Submitted';
      if (action === 'finance-approve') return 'Finance Approved';
      if (action === 'hr-approve') return 'HR Approved';
      if (action === 'lock') return 'Locked';
      if (action === 'post') return 'Posted';
      if (action === 'reject') return 'Rejected';
      if (action === 'reopen') return 'Draft';
      return current || 'Calculated';
    };
    if (action === 'submit' && !perms.canSubmit) return err(403, 'Submit permission denied');
    if (action === 'finance-approve' && !perms.canApproveFinance) return err(403, 'Finance approval permission denied');
    if (action === 'hr-approve' && !perms.canApproveHr) return err(403, 'HR approval permission denied');
    if (['lock', 'post', 'reopen'].includes(action) && !perms.canLock) return err(403, 'Lock/post permission denied');
    if (['submit', 'finance-approve', 'hr-approve', 'lock', 'post'].includes(action) && payload.summary.blocked > 0) return err(409, 'Blocked payroll exceptions must be resolved before this workflow action.');

    const nextStatus = transition(existing?.status);
    const run: PayrollRunHistory = {
      id: existing?.id || `payrun-${period}-${Date.now()}`,
      period,
      periodLabel: periodLabel(period),
      status: nextStatus,
      employeeCount: payload.summary.employees,
      grossPay: Number(payload.summary.grossPay || 0),
      netPay: Number(payload.summary.netPay || 0),
      totalDeductions: Number(payload.summary.totalDeductions || 0),
      employerCost: Number(payload.summary.employerCost || 0),
      exceptionCount: payload.summary.exceptionCount,
      createdAt: existing?.createdAt || now,
      createdBy: existing?.createdBy || role,
      updatedAt: now,
      updatedBy: role,
      audit: [
        ...(existing?.audit || []),
        { at: now, actor: role, action: action || 'calculate', from: existing?.status, to: nextStatus, note: note || undefined },
      ],
    };
    await writeRuns([run, ...runs.filter((item) => item.period !== period)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    return ok({ run });
  } catch (error) {
    return err(500, error instanceof Error ? error.message : 'Unable to update payroll run.');
  }
}
