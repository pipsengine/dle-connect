import { NextResponse } from 'next/server';
import { payrollDataSourceInfo, readPayrollEmployees } from '@/lib/payroll-employee-source';
import { activeLoansVersion, calculateLoanRecovery, loanInputsFromApplications, readPayrollLoanApplications, readPayrollLoansConfig, writePayrollLoansConfig, type LoansConfig } from '@/lib/payroll-loans-engine';
import { activePayrollPeriod } from '@/lib/payroll-periods';

type Role = 'Super Admin' | 'HR Director' | 'HR Manager' | 'Payroll Officer' | 'Finance Controller' | 'Executive Management' | 'Auditor' | 'Employee';

const ok = <T,>(data: T) => NextResponse.json({ status: 'success', data });
const err = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });
const roundMoney = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;

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
  principal: null,
  outstandingBalance: null,
  monthlyGross: null,
  estimatedNetPay: null,
  deductionCap: null,
  interestBalance: null,
  scheduledRecovery: null,
  payrollRecovery: null,
  projectedBalanceAfterPayroll: null,
});

const buildPayload = async (request: Request) => {
  const role = getRole(request);
  const perms = permissions(role);
  const [employeeSource, config, applications] = await Promise.all([readPayrollEmployees(), readPayrollLoansConfig(), readPayrollLoanApplications()]);
  const version = activeLoansVersion(config);
  if (!version) throw new Error('No active loans and salary advances configuration is available.');
  const loanInputs = loanInputsFromApplications(employeeSource.employees, applications);
  const records = loanInputs.map((input) => {
    const computed = calculateLoanRecovery(input, version);
    return {
      id: input.applicationId,
      employeeId: input.employee.employeeId,
      fullName: input.employee.fullName,
      department: input.employee.department,
      businessUnit: input.employee.businessUnit,
      location: input.employee.location,
      jobTitle: input.employee.jobTitle,
      employmentType: input.employee.employmentType,
      employmentStatus: input.employee.status,
      payrollGroup: input.employee.payrollGroup || 'Unassigned',
      salaryGrade: input.employee.salaryGrade || input.employee.jobGrade || 'Unassigned',
      productId: input.productId,
      productName: computed.product?.label || input.productId,
      productType: computed.product?.type || 'Loan',
      approvalStatus: input.approvalStatus,
      purpose: input.purpose || '',
      requestedAt: input.requestedAt || null,
      principal: input.principal,
      outstandingBalance: input.outstandingBalance,
      tenorMonths: input.tenorMonths,
      installmentsPaid: input.installmentsPaid,
      ...computed,
      product: undefined,
    };
  });
  const totals = records.reduce(
    (sum, record) => ({
      principal: sum.principal + record.principal,
      outstandingBalance: sum.outstandingBalance + record.outstandingBalance,
      payrollRecovery: sum.payrollRecovery + record.payrollRecovery,
      scheduledRecovery: sum.scheduledRecovery + record.scheduledRecovery,
      interestBalance: sum.interestBalance + record.interestBalance,
      exceptions: sum.exceptions + record.issues.length,
    }),
    { principal: 0, outstandingBalance: 0, payrollRecovery: 0, scheduledRecovery: 0, interestBalance: 0, exceptions: 0 }
  );
  const byProduct = Array.from(
    records
      .reduce((map, record) => {
        const current = map.get(record.productName) || { label: record.productName, productType: record.productType, records: 0, outstandingBalance: 0, payrollRecovery: 0, exceptions: 0 };
        current.records += 1;
        current.outstandingBalance += record.outstandingBalance;
        current.payrollRecovery += record.payrollRecovery;
        current.exceptions += record.issues.length;
        map.set(record.productName, current);
        return map;
      }, new Map<string, { label: string; productType: string; records: number; outstandingBalance: number; payrollRecovery: number; exceptions: number }>())
      .values()
  ).map((item) => ({ ...item, outstandingBalance: roundMoney(item.outstandingBalance), payrollRecovery: roundMoney(item.payrollRecovery) }));
  const period = monthPeriod();
  return {
    generatedAt: new Date().toISOString(),
    source: 'Employee-submitted loans and salary advances',
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
      records: records.length,
      activeRecoveries: records.filter((record) => record.approvalStatus === 'Active').length,
      principal: roundMoney(totals.principal),
      outstandingBalance: roundMoney(totals.outstandingBalance),
      scheduledRecovery: roundMoney(totals.scheduledRecovery),
      payrollRecovery: roundMoney(totals.payrollRecovery),
      interestBalance: roundMoney(totals.interestBalance),
      ready: records.filter((record) => record.status === 'Ready').length,
      review: records.filter((record) => record.status === 'Review').length,
      blocked: records.filter((record) => record.status === 'Blocked').length,
      exceptionCount: totals.exceptions,
    },
    breakdowns: { byProduct },
    records: perms.canViewMoney ? records : records.map(maskMoney),
  };
};

const csv = (records: any[]) => {
  const headers = ['Employee ID', 'Name', 'Department', 'Payroll Group', 'Product', 'Approval Status', 'Principal', 'Outstanding Balance', 'Tenor', 'Paid Installments', 'Deduction Cap', 'Scheduled Recovery', 'Payroll Recovery', 'Projected Balance', 'Status', 'Issues'];
  const lines = records.map((record) =>
    [record.employeeId, record.fullName, record.department, record.payrollGroup, record.productName, record.approvalStatus, record.principal, record.outstandingBalance, record.tenorMonths, record.installmentsPaid, record.deductionCap, record.scheduledRecovery, record.payrollRecovery, record.projectedBalanceAfterPayroll, record.status, record.issues.join('; ')]
      .map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`)
      .join(',')
  );
  return [headers.join(','), ...lines].join('\n');
};

const validateConfig = (config: LoansConfig) => {
  if (!config?.activeVersionId) return 'activeVersionId is required';
  if (!Array.isArray(config.versions) || !config.versions.length) return 'At least one loans version is required';
  const active = config.versions.find((version) => version.id === config.activeVersionId);
  if (!active) return 'activeVersionId must match an existing version';
  if (!Array.isArray(active.products) || !active.products.length) return 'Active version requires loan products';
  if (!Number.isFinite(Number(active.deductionCapRate)) || Number(active.deductionCapRate) <= 0) return 'deductionCapRate must be a positive number';
  if (active.products.some((product) => !product.id || !Number.isFinite(Number(product.maxTenorMonths)) || !Number.isFinite(Number(product.maxPrincipalMultiple)))) return 'Every product requires id, maxTenorMonths, and maxPrincipalMultiple';
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
          'content-disposition': `attachment; filename="loans-and-salary-advances-${payload.period}.csv"`,
        },
      });
    }
    return ok(payload);
  } catch (error) {
    return err(500, error instanceof Error ? error.message : 'Unable to load loans and salary advances.');
  }
}

export async function POST(request: Request) {
  try {
    const role = getRole(request);
    const perms = permissions(role);
    if (!perms.canConfigure) return err(403, 'Permission denied');
    const body = await request.json().catch(() => ({}));
    const config = body.config as LoansConfig;
    const validationError = validateConfig(config);
    if (validationError) return err(400, validationError);
    const saved = await writePayrollLoansConfig(config, role);
    return ok({ updated: true, activeVersionId: saved.activeVersionId, audit: saved.audit });
  } catch (error) {
    return err(500, error instanceof Error ? error.message : 'Unable to update loans and salary advances configuration.');
  }
}
