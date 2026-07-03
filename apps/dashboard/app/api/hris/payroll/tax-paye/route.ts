import { NextResponse } from 'next/server';
import { payrollDataSourceInfo, readPayrollEmployees } from '@/lib/payroll-employee-source';
import { activeTaxVersion, calculatePayrollTax, CONTRACT_FLAT_PAYE_RATE, payrollInputFromEmployee, readPayrollTaxConfig, usesContractFlatPaye, writePayrollTaxConfig, type PayrollTaxConfig, type PayrollTaxVersion } from '@/lib/payroll-tax-engine';
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

const maskMoney = (record: any) => ({
  ...record,
  annualGrossIncome: null,
  annualPreTaxDeductions: null,
  annualReliefs: null,
  annualChargeableIncome: null,
  annualPaye: null,
  monthlyPaye: null,
  monthlyBasePay: null,
  monthlyAllowances: null,
  monthlyGrossPay: null,
  monthlyTaxablePay: null,
});

const buildRecord = (employee: any, version: PayrollTaxVersion) => {
  const input = payrollInputFromEmployee(employee);
  const tax = calculatePayrollTax(input, version);
  const contractFlatPaye = usesContractFlatPaye(employee);
  const monthlyGrossPay = roundMoney(Number(input.monthlyGrossPay ?? input.monthlyBasePay + input.monthlyAllowances));
  const issues: string[] = [];
  if (!employee.setupAssignedToPayroll) issues.push('Payroll setup is not assigned');
  if (tax.annualGrossIncome <= 0) issues.push('Annual gross income is missing');
  if (!compact(employee.payrollGroup)) issues.push('Payroll group is missing');
  if (compact(employee.payCurrency) && compact(employee.payCurrency).toUpperCase() !== version.currency) issues.push('Currency differs from active tax configuration');
  if (compact(employee.status).toLowerCase().match(/terminated|resigned|retired|inactive/)) issues.push('Employee is not payroll active');
  return {
    employeeId: employee.employeeId,
    employeeCode: employee.employeeCode || employee.employeeId,
    fullName: employee.fullName,
    department: employee.department,
    businessUnit: employee.businessUnit,
    location: employee.location,
    jobTitle: employee.jobTitle,
    employmentType: employee.employmentType,
    employmentStatus: employee.status,
    payrollGroup: employee.payrollGroup || 'Unassigned',
    salaryGrade: employee.salaryGrade || employee.jobGrade || 'Unassigned',
    taxState: employee.state || employee.workLocation || employee.location || 'Default',
    payeMethod: contractFlatPaye ? 'contract-flat' : 'progressive',
    payeMethodLabel: contractFlatPaye ? 'Contract flat 5% (monthly gross)' : 'Progressive PAYE bands',
    contractFlatPayeRate: contractFlatPaye ? CONTRACT_FLAT_PAYE_RATE : null,
    monthlyBasePay: roundMoney(input.monthlyBasePay),
    monthlyAllowances: roundMoney(input.monthlyAllowances),
    monthlyGrossPay,
    monthlyTaxablePay: roundMoney(Number(input.monthlyTaxablePay ?? input.monthlyBasePay + input.monthlyAllowances)),
    ...tax,
    status: issues.some((issue) => issue.includes('missing') || issue.includes('not payroll active')) ? 'Blocked' : issues.length ? 'Review' : 'Ready',
    issues,
  };
};

const buildPayload = async (request: Request) => {
  const role = getRole(request);
  const perms = permissions(role);
  const [employeeSource, config] = await Promise.all([readPayrollEmployees(), readPayrollTaxConfig()]);
  const version = activeTaxVersion(config);
  if (!version) throw new Error('No active payroll tax configuration is available.');
  const records = employeeSource.employees.map((employee) => buildRecord(employee, version));
  const totals = records.reduce(
    (sum, record) => ({
      annualGrossIncome: sum.annualGrossIncome + record.annualGrossIncome,
      annualPreTaxDeductions: sum.annualPreTaxDeductions + record.annualPreTaxDeductions,
      annualReliefs: sum.annualReliefs + record.annualReliefs,
      annualChargeableIncome: sum.annualChargeableIncome + record.annualChargeableIncome,
      annualPaye: sum.annualPaye + record.annualPaye,
      monthlyPaye: sum.monthlyPaye + record.monthlyPaye,
      exceptions: sum.exceptions + record.issues.length,
    }),
    { annualGrossIncome: 0, annualPreTaxDeductions: 0, annualReliefs: 0, annualChargeableIncome: 0, annualPaye: 0, monthlyPaye: 0, exceptions: 0 }
  );
  const period = monthPeriod();
  return {
    generatedAt: new Date().toISOString(),
    source: 'Configurable Nigeria PAYE tax engine',
    dataSource: payrollDataSourceInfo(employeeSource),
    period,
    periodLabel: periodLabel(period),
    role,
    permissions: perms,
    config: {
      schemaVersion: config.schemaVersion,
      country: config.country,
      jurisdiction: config.jurisdiction,
      activeVersionId: config.activeVersionId,
      activeVersion: version,
      versions: config.versions,
      audit: config.audit,
    },
    summary: {
      employees: records.length,
      contractFlatEmployees: records.filter((record) => record.payeMethod === 'contract-flat').length,
      annualGrossIncome: roundMoney(totals.annualGrossIncome),
      annualPreTaxDeductions: roundMoney(totals.annualPreTaxDeductions),
      annualReliefs: roundMoney(totals.annualReliefs),
      annualChargeableIncome: roundMoney(totals.annualChargeableIncome),
      annualPaye: roundMoney(totals.annualPaye),
      monthlyPaye: roundMoney(totals.monthlyPaye),
      ready: records.filter((record) => record.status === 'Ready').length,
      review: records.filter((record) => record.status === 'Review').length,
      blocked: records.filter((record) => record.status === 'Blocked').length,
      exceptionCount: totals.exceptions,
    },
    records: perms.canViewMoney ? records : records.map(maskMoney),
  };
};

const csv = (records: any[]) => {
  const headers = ['Employee ID', 'Employee Code', 'Name', 'Department', 'Payroll Group', 'Tax State', 'Tax Method', 'Monthly Gross', 'Annual Gross', 'Pre-tax Deductions', 'Reliefs', 'Chargeable Income', 'Annual PAYE', 'Monthly PAYE', 'Status', 'Issues'];
  const lines = records.map((record) =>
    [
      record.employeeId,
      record.employeeCode,
      record.fullName,
      record.department,
      record.payrollGroup,
      record.taxState,
      record.payeMethodLabel,
      record.monthlyGrossPay,
      record.annualGrossIncome,
      record.payeMethod === 'contract-flat' ? '' : record.annualPreTaxDeductions,
      record.payeMethod === 'contract-flat' ? '' : record.annualReliefs,
      record.payeMethod === 'contract-flat' ? '' : record.annualChargeableIncome,
      record.annualPaye,
      record.monthlyPaye,
      record.status,
      record.issues.join('; '),
    ]
      .map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`)
      .join(',')
  );
  return [headers.join(','), ...lines].join('\n');
};

const validateConfig = (config: PayrollTaxConfig) => {
  if (!config || typeof config !== 'object') return 'Configuration body is required';
  if (!config.activeVersionId) return 'activeVersionId is required';
  if (!Array.isArray(config.versions) || config.versions.length === 0) return 'At least one tax version is required';
  const active = config.versions.find((version) => version.id === config.activeVersionId);
  if (!active) return 'activeVersionId must match an existing version';
  if (!Array.isArray(active.taxBands) || active.taxBands.length === 0) return 'Active version requires tax bands';
  if (active.taxBands.some((band) => !band.id || !Number.isFinite(Number(band.sequence)) || !Number.isFinite(Number(band.rate)))) return 'Every tax band requires id, sequence, and rate';
  if (!Array.isArray(active.statutoryDeductions)) return 'Active version requires statutoryDeductions';
  if (!Array.isArray(active.reliefs)) return 'Active version requires reliefs';
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
          'content-disposition': `attachment; filename="tax-paye-${payload.period}.csv"`,
        },
      });
    }
    return ok(payload);
  } catch (error) {
    return err(500, error instanceof Error ? error.message : 'Unable to load PAYE tax engine.');
  }
}

export async function POST(request: Request) {
  try {
    const role = getRole(request);
    const perms = permissions(role);
    if (!perms.canConfigure) return err(403, 'Permission denied');
    const body = await request.json().catch(() => ({}));
    const config = body.config as PayrollTaxConfig;
    const validationError = validateConfig(config);
    if (validationError) return err(400, validationError);
    const saved = await writePayrollTaxConfig(config, role);
    return ok({ updated: true, activeVersionId: saved.activeVersionId, audit: saved.audit });
  } catch (error) {
    return err(500, error instanceof Error ? error.message : 'Unable to update PAYE tax configuration.');
  }
}
