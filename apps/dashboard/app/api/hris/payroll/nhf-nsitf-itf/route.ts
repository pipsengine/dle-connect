import { NextResponse } from 'next/server';
import { payrollDataSourceInfo, readPayrollEmployees } from '@/lib/payroll-employee-source';
import { activeStatutoryFundsVersion, calculateStatutoryFunds, readStatutoryFundsConfig, statutoryFundInputFromEmployee, writeStatutoryFundsConfig, type StatutoryFundsConfig } from '@/lib/payroll-statutory-funds-engine';
import { activePayrollPeriod } from '@/lib/payroll-periods';

type Role = 'Super Admin' | 'HR Director' | 'HR Manager' | 'Payroll Officer' | 'Finance Controller' | 'Executive Management' | 'Auditor' | 'Employee';

const ok = <T,>(data: T) => NextResponse.json({ status: 'success', data });
const err = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });
const roundMoney = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
const compact = (value: unknown) => String(value || '').trim();

const getRole = (request: Request): Role => {
  const value = request.headers.get('x-hris-role');
  const roles: Role[] = ['Super Admin', 'HR Director', 'HR Manager', 'Payroll Officer', 'Finance Controller', 'Executive Management', 'Auditor', 'Employee'];
  return roles.includes(value as Role) ? (value as Role) : 'Payroll Officer';
};

const permissions = (role: Role) => ({
  canViewMoney: ['Super Admin', 'HR Director', 'HR Manager', 'Payroll Officer', 'Finance Controller', 'Executive Management', 'Auditor'].includes(role),
  canConfigure: ['Super Admin', 'HR Director', 'Finance Controller', 'Payroll Officer'].includes(role),
  canExport: role !== 'Employee',
});

const monthPeriod = activePayrollPeriod;

const periodLabel = (period: string) => {
  const [year, month] = period.split('-').map(Number);
  return new Date(Date.UTC(year || new Date().getUTCFullYear(), (month || 1) - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
};

const buildRecord = (employee: any, version: any, organizationEmployeeCount: number) => {
  const computed = calculateStatutoryFunds(statutoryFundInputFromEmployee(employee, organizationEmployeeCount), version);
  const byFund = Object.fromEntries(computed.fundResults.map((fund) => [fund.id, fund]));
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
    ...computed,
    nhf: byFund.nhf || null,
    nsitf: byFund.nsitf || null,
    itf: byFund.itf || null,
  };
};

const maskMoney = (record: any) => ({
  ...record,
  monthlyBase: null,
  monthlyGross: null,
  employeeDeductions: null,
  employerCosts: null,
  totalMonthlyStatutoryFunds: null,
  totalAnnualStatutoryFunds: null,
  fundResults: record.fundResults.map((fund: any) => ({ ...fund, monthlyAmount: null, annualAmount: null })),
  nhf: record.nhf ? { ...record.nhf, monthlyAmount: null, annualAmount: null } : null,
  nsitf: record.nsitf ? { ...record.nsitf, monthlyAmount: null, annualAmount: null } : null,
  itf: record.itf ? { ...record.itf, monthlyAmount: null, annualAmount: null } : null,
});

const buildPayload = async (request: Request) => {
  const role = getRole(request);
  const perms = permissions(role);
  const [employeeSource, config] = await Promise.all([readPayrollEmployees(), readStatutoryFundsConfig()]);
  const employeeRows = employeeSource.employees;
  const version = activeStatutoryFundsVersion(config);
  if (!version) throw new Error('No active NHF/NSITF/ITF configuration is available.');
  const records = employeeRows.map((employee) => buildRecord(employee, version, employeeRows.length));
  const totals = records.reduce(
    (sum, record) => ({
      monthlyGross: sum.monthlyGross + record.monthlyGross,
      employeeDeductions: sum.employeeDeductions + record.employeeDeductions,
      employerCosts: sum.employerCosts + record.employerCosts,
      totalMonthlyStatutoryFunds: sum.totalMonthlyStatutoryFunds + record.totalMonthlyStatutoryFunds,
      totalAnnualStatutoryFunds: sum.totalAnnualStatutoryFunds + record.totalAnnualStatutoryFunds,
      nhf: sum.nhf + (record.nhf?.monthlyAmount || 0),
      nsitf: sum.nsitf + (record.nsitf?.monthlyAmount || 0),
      itf: sum.itf + (record.itf?.monthlyAmount || 0),
      exceptions: sum.exceptions + record.issues.length,
    }),
    { monthlyGross: 0, employeeDeductions: 0, employerCosts: 0, totalMonthlyStatutoryFunds: 0, totalAnnualStatutoryFunds: 0, nhf: 0, nsitf: 0, itf: 0, exceptions: 0 }
  );
  const fundBreakdown = version.funds.map((fund) => ({
    id: fund.id,
    label: fund.label,
    shortName: fund.shortName,
    payer: fund.payer,
    monthlyAmount: roundMoney(records.reduce((sum, record) => sum + (record.fundResults.find((item: any) => item.id === fund.id)?.monthlyAmount || 0), 0)),
    annualAmount: roundMoney(records.reduce((sum, record) => sum + (record.fundResults.find((item: any) => item.id === fund.id)?.annualAmount || 0), 0)),
    eligibleEmployees: records.filter((record) => record.fundResults.find((item: any) => item.id === fund.id)?.eligible).length,
  }));
  const period = monthPeriod();
  return {
    generatedAt: new Date().toISOString(),
    source: 'Configurable Nigeria NHF, NSITF and ITF compliance engine',
    dataSource: payrollDataSourceInfo(employeeSource),
    period,
    periodLabel: periodLabel(period),
    role,
    permissions: perms,
    config: {
      schemaVersion: config.schemaVersion,
      jurisdiction: config.jurisdiction,
      activeVersionId: config.activeVersionId,
      activeVersion: version,
      versions: config.versions,
      audit: config.audit,
    },
    summary: {
      employees: records.length,
      monthlyGross: roundMoney(totals.monthlyGross),
      employeeDeductions: roundMoney(totals.employeeDeductions),
      employerCosts: roundMoney(totals.employerCosts),
      totalMonthlyStatutoryFunds: roundMoney(totals.totalMonthlyStatutoryFunds),
      totalAnnualStatutoryFunds: roundMoney(totals.totalAnnualStatutoryFunds),
      nhf: roundMoney(totals.nhf),
      nsitf: roundMoney(totals.nsitf),
      itf: roundMoney(totals.itf),
      ready: records.filter((record) => record.status === 'Ready').length,
      review: records.filter((record) => record.status === 'Review').length,
      blocked: records.filter((record) => record.status === 'Blocked').length,
      exceptionCount: totals.exceptions,
    },
    breakdowns: { byFund: fundBreakdown },
    records: perms.canViewMoney ? records : records.map(maskMoney),
  };
};

const csv = (records: any[]) => {
  const headers = ['Employee ID', 'Name', 'Department', 'Payroll Group', 'Monthly Gross', 'NHF', 'NSITF', 'ITF Monthly Accrual', 'Employee Deductions', 'Employer Costs', 'Total Monthly Funds', 'Status', 'Issues'];
  const lines = records.map((record) =>
    [record.employeeId, record.fullName, record.department, record.payrollGroup, record.monthlyGross, record.nhf?.monthlyAmount, record.nsitf?.monthlyAmount, record.itf?.monthlyAmount, record.employeeDeductions, record.employerCosts, record.totalMonthlyStatutoryFunds, record.status, record.issues.join('; ')]
      .map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`)
      .join(',')
  );
  return [headers.join(','), ...lines].join('\n');
};

const validateConfig = (config: StatutoryFundsConfig) => {
  if (!config?.activeVersionId) return 'activeVersionId is required';
  if (!Array.isArray(config.versions) || !config.versions.length) return 'At least one statutory funds version is required';
  const active = config.versions.find((version) => version.id === config.activeVersionId);
  if (!active) return 'activeVersionId must match an existing version';
  if (!Array.isArray(active.funds) || !active.funds.length) return 'Active version requires fund rules';
  if (active.funds.some((fund) => !fund.id || !Number.isFinite(Number(fund.rate)))) return 'Every fund requires id and numeric rate';
  if (active.funds.some((fund) => fund.deductFromEmployee && fund.payer === 'Employer')) return 'Employer-paid funds cannot be deducted from employee pay';
  return '';
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
          'content-disposition': `attachment; filename="nhf-nsitf-itf-${payload.period}.csv"`,
        },
      });
    }
    return ok(payload);
  } catch (error) {
    return err(500, error instanceof Error ? error.message : 'Unable to load NHF/NSITF/ITF payroll.');
  }
}

export async function POST(request: Request) {
  try {
    const role = getRole(request);
    const perms = permissions(role);
    if (!perms.canConfigure) return err(403, 'Permission denied');
    const body = await request.json().catch(() => ({}));
    const config = body.config as StatutoryFundsConfig;
    const validationError = validateConfig(config);
    if (validationError) return err(400, validationError);
    const saved = await writeStatutoryFundsConfig(config, role);
    return ok({ updated: true, activeVersionId: saved.activeVersionId, audit: saved.audit });
  } catch (error) {
    return err(500, error instanceof Error ? error.message : 'Unable to update NHF/NSITF/ITF configuration.');
  }
}
