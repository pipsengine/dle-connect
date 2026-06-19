import { NextResponse } from 'next/server';
import type { DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import { payrollDataSourceInfo, readPayrollEmployees } from '@/lib/payroll-employee-source';
import { calculatePayrollEarnings } from '@/lib/payroll-earnings-engine';
import { activeTaxVersion, calculatePayrollTax, payrollInputFromEmployee, readPayrollTaxConfig, type PayrollTaxVersion } from '@/lib/payroll-tax-engine';
import { activePayrollPeriod } from '@/lib/payroll-periods';

type Role = 'Super Admin' | 'HR Director' | 'HR Manager' | 'Payroll Officer' | 'Finance Controller' | 'Executive Management' | 'Auditor' | 'Employee';
type Tone = 'blue' | 'green' | 'amber' | 'red' | 'violet' | 'cyan' | 'slate';
type DeductionStatus = 'Ready' | 'Review' | 'Blocked';

const ok = <T,>(data: T) => NextResponse.json({ status: 'success', data });
const err = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });
const compact = (value: unknown) => String(value || '').trim();
const num = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};
const roundMoney = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
const round1 = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 10) / 10;

const getRole = (request: Request): Role => {
  const value = request.headers.get('x-hris-role');
  const roles: Role[] = ['Super Admin', 'HR Director', 'HR Manager', 'Payroll Officer', 'Finance Controller', 'Executive Management', 'Auditor', 'Employee'];
  return roles.includes(value as Role) ? (value as Role) : 'Payroll Officer';
};

const permissions = (role: Role) => ({
  canViewMoney: ['Super Admin', 'HR Director', 'HR Manager', 'Payroll Officer', 'Finance Controller', 'Executive Management', 'Auditor'].includes(role),
  canExport: role !== 'Employee',
});

const monthPeriod = activePayrollPeriod;

const periodLabel = (period: string) => {
  const [year, month] = period.split('-').map(Number);
  return new Date(Date.UTC(year || new Date().getUTCFullYear(), (month || 1) - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
};

const employeeCost = (employee: DleEmployeeDirectoryRow, taxVersion: PayrollTaxVersion) => {
  const earnings = calculatePayrollEarnings(employee, { period: activePayrollPeriod(), includePeriodAdjustments: true });
  const tax = calculatePayrollTax(payrollInputFromEmployee(employee, { period: activePayrollPeriod(), includePeriodAdjustments: true }), taxVersion);
  const annualComponent = (id: string) => tax.statutoryItems.find((item) => item.id === id)?.amount || 0;
  const pension = annualComponent('pension') / 12;
  const paye = tax.monthlyPaye;
  const nhf = annualComponent('nhf') / 12;
  const loan = annualComponent('employee-loan') / 12;
  const unionDues = annualComponent('union-dues') / 12;
  const otherDeductions = annualComponent('other-statutory') / 12;
  const totalDeductions = pension + paye + nhf + loan + unionDues + otherDeductions;
  return {
    basePay: roundMoney(earnings.basePay),
    allowances: roundMoney(earnings.allowances),
    grossPay: roundMoney(earnings.grossPay),
    taxablePay: roundMoney(earnings.taxablePay),
    nonTaxablePay: roundMoney(earnings.nonTaxablePay),
    earningProfile: earnings.profileName,
    earningProfileId: earnings.profileId,
    pension: roundMoney(pension),
    paye: roundMoney(paye),
    nhf: roundMoney(nhf),
    loan: roundMoney(loan),
    unionDues: roundMoney(unionDues),
    otherDeductions: roundMoney(otherDeductions),
    totalDeductions: roundMoney(totalDeductions),
    netPay: roundMoney(Math.max(0, earnings.grossPay - totalDeductions)),
    deductionRatio: earnings.grossPay > 0 ? round1((totalDeductions / earnings.grossPay) * 100) : 0,
  };
};

const issuesFor = (employee: DleEmployeeDirectoryRow, cost: ReturnType<typeof employeeCost>) => {
  const issues: string[] = [];
  const status = compact(employee.status).toLowerCase();
  if (!employee.setupAssignedToPayroll) issues.push('Payroll setup is not assigned');
  if (cost.basePay <= 0) issues.push('Pay amount is missing');
  if (!compact(employee.payrollGroup)) issues.push('Payroll group is missing');
  if (!compact(employee.salaryGrade || employee.jobGrade)) issues.push('Salary grade is missing');
  if (status.match(/terminated|resigned|retired|inactive/)) issues.push('Employee is not payroll active');
  if (compact(employee.payCurrency) && compact(employee.payCurrency).toUpperCase() !== 'NGN') issues.push('Foreign currency deduction review required');
  if (cost.deductionRatio > 40) issues.push('Deduction ratio is above 40% review threshold');
  if (cost.grossPay > 0 && cost.paye <= 0) issues.push('PAYE estimate is zero');
  return issues;
};

const statusFrom = (issues: string[]): DeductionStatus => {
  if (issues.some((issue) => issue.includes('Pay amount') || issue.includes('not payroll active'))) return 'Blocked';
  return issues.length ? 'Review' : 'Ready';
};

const maskMoney = (record: any) => ({
  ...record,
  basePay: null,
  grossPay: null,
  pension: null,
  paye: null,
  nhf: null,
  loan: null,
  unionDues: null,
  otherDeductions: null,
  totalDeductions: null,
  netPay: null,
  deductionRatio: null,
});

type PayrollGroupDeductionSummary = { label: string; employees: number; totalDeductions: number; exceptions: number };

const groupRecords = (records: any[]) =>
  Array.from<PayrollGroupDeductionSummary>(
    records
      .reduce((map: Map<string, PayrollGroupDeductionSummary>, record) => {
        const label = record.payrollGroup || 'Unassigned';
        const current = map.get(label) || { label, employees: 0, totalDeductions: 0, exceptions: 0 };
        current.employees += 1;
        current.totalDeductions += num(record.totalDeductions);
        current.exceptions += record.issues.length;
        map.set(label, current);
        return map;
      }, new Map<string, PayrollGroupDeductionSummary>())
      .values()
  )
    .map((item) => ({ ...item, totalDeductions: roundMoney(item.totalDeductions) }))
    .sort((a, b) => b.totalDeductions - a.totalDeductions);

const buildPayload = async (request: Request) => {
  const role = getRole(request);
  const perms = permissions(role);
  const [employeeSource, taxConfig] = await Promise.all([readPayrollEmployees(), readPayrollTaxConfig()]);
  const employeeRows = employeeSource.employees;
  const taxVersion = activeTaxVersion(taxConfig);
  if (!taxVersion) throw new Error('No active payroll tax configuration is available.');
  const records = employeeRows.map((employee) => {
    const cost = employeeCost(employee, taxVersion);
    const issues = issuesFor(employee, cost);
    return {
      employeeId: employee.employeeId,
      fullName: employee.fullName,
      department: employee.department,
      businessUnit: employee.businessUnit,
      location: employee.location,
      jobTitle: employee.jobTitle,
      employmentType: employee.employmentType,
      employmentStatus: employee.status,
      payrollGroup: employee.payrollGroup || 'Unassigned',
      salaryGrade: employee.salaryGrade || employee.jobGrade || 'Unassigned',
      payCurrency: employee.payCurrency || 'NGN',
      paymentRun: employee.paymentRun || 'Monthly',
      ...cost,
      status: statusFrom(issues),
      issues,
    };
  });

  const totals = records.reduce(
    (sum, record) => ({
      grossPay: sum.grossPay + record.grossPay,
      totalDeductions: sum.totalDeductions + record.totalDeductions,
      netPay: sum.netPay + record.netPay,
      pension: sum.pension + record.pension,
      paye: sum.paye + record.paye,
      nhf: sum.nhf + record.nhf,
      loan: sum.loan + record.loan,
      unionDues: sum.unionDues + record.unionDues,
      otherDeductions: sum.otherDeductions + record.otherDeductions,
      exceptionCount: sum.exceptionCount + record.issues.length,
    }),
    { grossPay: 0, totalDeductions: 0, netPay: 0, pension: 0, paye: 0, nhf: 0, loan: 0, unionDues: 0, otherDeductions: 0, exceptionCount: 0 }
  );

  const period = monthPeriod();
  const component = (label: string, amount: number, tone: Tone) => ({ label, amount: roundMoney(amount), tone });
  return {
    generatedAt: new Date().toISOString(),
    source: `${employeeSource.source} payroll setup and deduction policy engine`,
    dataSource: payrollDataSourceInfo(employeeSource),
    period,
    periodLabel: periodLabel(period),
    role,
    permissions: perms,
    summary: {
      employees: records.length,
      grossPay: roundMoney(totals.grossPay),
      totalDeductions: roundMoney(totals.totalDeductions),
      netPay: roundMoney(totals.netPay),
      pension: roundMoney(totals.pension),
      paye: roundMoney(totals.paye),
      nhf: roundMoney(totals.nhf),
      loan: roundMoney(totals.loan),
      unionDues: roundMoney(totals.unionDues),
      otherDeductions: roundMoney(totals.otherDeductions),
      ready: records.filter((record) => record.status === 'Ready').length,
      review: records.filter((record) => record.status === 'Review').length,
      blocked: records.filter((record) => record.status === 'Blocked').length,
      exceptionCount: totals.exceptionCount,
      averageDeductionRatio: totals.grossPay ? round1((totals.totalDeductions / totals.grossPay) * 100) : 0,
    },
    records: perms.canViewMoney ? records : records.map(maskMoney),
    breakdowns: {
      byPayrollGroup: groupRecords(records),
      byComponent: [
        component('PAYE', totals.paye, 'violet'),
        component('Pension', totals.pension, 'blue'),
        component('NHF', totals.nhf, 'cyan'),
        component('Loan', totals.loan, 'amber'),
        component('Union Dues', totals.unionDues, 'green'),
        component('Other', totals.otherDeductions, 'slate'),
      ],
    },
    controls: [
      { label: 'Statutory Calculations', status: 'Calculated', detail: 'PAYE, pension and NHF are derived from current payroll setup.', tone: 'blue' as Tone },
      { label: 'Deduction Caps', status: totals.grossPay && totals.totalDeductions / totals.grossPay > 0.35 ? 'Review' : 'Passed', detail: 'Flags employees above deduction ratio thresholds.', tone: totals.grossPay && totals.totalDeductions / totals.grossPay > 0.35 ? 'amber' as Tone : 'green' as Tone },
      { label: 'Payroll Eligibility', status: records.some((record) => record.status === 'Blocked') ? 'Blocked Items' : 'Ready', detail: 'Blocks inactive employees and missing pay amounts.', tone: records.some((record) => record.status === 'Blocked') ? 'red' as Tone : 'green' as Tone },
      { label: 'Audit Export', status: perms.canExport ? 'Enabled' : 'Restricted', detail: 'CSV export respects role-based payroll access.', tone: perms.canExport ? 'cyan' as Tone : 'slate' as Tone },
    ],
  };
};

const csv = (records: any[]) => {
  const headers = ['Employee ID', 'Name', 'Department', 'Payroll Group', 'Grade', 'Gross Pay', 'PAYE', 'Pension', 'NHF', 'Loan', 'Union Dues', 'Other', 'Total Deductions', 'Deduction Ratio', 'Net Pay', 'Status', 'Issues'];
  const lines = records.map((record) =>
    [record.employeeId, record.fullName, record.department, record.payrollGroup, record.salaryGrade, record.grossPay, record.paye, record.pension, record.nhf, record.loan, record.unionDues, record.otherDeductions, record.totalDeductions, record.deductionRatio, record.netPay, record.status, record.issues.join('; ')]
      .map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`)
      .join(',')
  );
  return [headers.join(','), ...lines].join('\n');
};

export async function GET(request: Request) {
  try {
    const payload = await buildPayload(request);
    const { searchParams } = new URL(request.url);
    if (searchParams.get('format') === 'csv') {
      if (!payload.permissions.canExport) return err(403, 'Permission denied');
      return new Response(csv(payload.records), {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="payroll-deductions-${payload.period}.csv"`,
        },
      });
    }
    return ok(payload);
  } catch (error) {
    return err(500, error instanceof Error ? error.message : 'Unable to load payroll deductions.');
  }
}
