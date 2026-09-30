import { NextResponse } from 'next/server';
import { payrollDataSourceInfo, readPayrollEmployees } from '@/lib/payroll-employee-source';
import { activePensionVersion, calculatePension, pensionInputFromEmployee, readPayrollPensionConfig, writePayrollPensionConfig, type PensionConfig } from '@/lib/payroll-pension-engine';
import { isPensionEligibleStaff } from '@/lib/payroll-employee-classification';
import { payslipIdentityMap } from '@/lib/payroll-payslip-identity-store';
import { normalizePayrollMatchKey } from '@/lib/sage-people-payroll-store';
import { activePayrollPeriod } from '@/lib/payroll-periods';
import { pensionableEmolumentFromLines } from '@/lib/payroll-earnings-engine';
import { readAllPayrollSnapshotsByPeriods } from '@/lib/payroll-run-store';
import { isDleUsdMdEmployee } from '@/lib/payroll-bank-schedule-packs';
import { tableExportResponse } from '@/lib/excel-export';

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

const requestedPeriod = (request: Request) => {
  const value = compact(new URL(request.url).searchParams.get('period'));
  return /^\d{4}-\d{2}$/.test(value) ? value : monthPeriod();
};

const pensionDeductionAmount = (lines: Array<{ code?: string; label?: string; amount?: number }>, voluntary: boolean) =>
  roundMoney((lines || []).reduce((sum, line) => {
    const blob = `${line.code || ''} ${line.label || ''}`;
    const isPension = /pension/i.test(blob);
    const isVoluntary = /ee2|volpens|additional/i.test(blob);
    if (!isPension || isVoluntary !== voluntary) return sum;
    return sum + Number(line.amount || 0);
  }, 0));

const amountsFromPayrollRecord = (record: { employeeCode?: string; employeeId?: string; fullName?: string; jobTitle?: string; earningLines?: Array<{ code?: string; name?: string; amount?: number }>; deductionLines?: Array<{ code?: string; label?: string; amount?: number }>; pensionEmployer?: number }) => {
  const managingDirector = isDleUsdMdEmployee({
    employeeCode: record.employeeCode,
    employeeId: record.employeeId,
    fullName: record.fullName,
    jobTitle: record.jobTitle,
  });
  const voluntary = pensionDeductionAmount(record.deductionLines || [], true);
  if (managingDirector) return { basis: 0, employee: 0, employer: 0, voluntary: 0, managingDirector: true };
  const basis = pensionableEmolumentFromLines(record.earningLines || []);
  if (basis > 0) {
    return {
      basis,
      employee: roundMoney(basis * 0.08),
      employer: roundMoney(basis * 0.1),
      voluntary,
      managingDirector: false,
    };
  }
  const employee = pensionDeductionAmount(record.deductionLines || [], false);
  const employer = roundMoney(Number(record.pensionEmployer || 0) || (employee > 0 ? employee * 1.25 : 0));
  return {
    basis: employee > 0 ? roundMoney(employee / 0.08) : 0,
    employee,
    employer,
    voluntary,
    managingDirector: false,
  };
};

const withPensionAmounts = (row: any, amounts: ReturnType<typeof amountsFromPayrollRecord>) => ({
  ...row,
  eligible: amounts.managingDirector ? false : row.eligible || amounts.employee > 0,
  pensionableEmolument: amounts.basis,
  employeeContribution: amounts.employee,
  employerContribution: amounts.employer,
  voluntaryContribution: amounts.voluntary,
  totalContribution: roundMoney(amounts.employee + amounts.employer + amounts.voluntary),
  combinedRate: amounts.basis > 0 ? 0.18 : 0,
  monthlyRemittance: roundMoney(amounts.employee + amounts.employer + amounts.voluntary),
  annualEmployeeContribution: roundMoney(amounts.employee * 12),
  annualEmployerContribution: roundMoney(amounts.employer * 12),
  annualTotalContribution: roundMoney((amounts.employee + amounts.employer + amounts.voluntary) * 12),
  issues: amounts.managingDirector
    ? ['Managing Director pension is not deducted']
    : (row.issues || []).filter((issue: string) => !/pensionable emolument is missing/i.test(issue)),
  status: amounts.managingDirector
    ? 'Review'
    : ((row.issues || []).filter((issue: string) => !/pensionable emolument is missing/i.test(issue)).length ? row.status : 'Ready'),
});

const periodLabel = (period: string) => {
  const [year, month] = period.split('-').map(Number);
  return new Date(Date.UTC(year || new Date().getUTCFullYear(), (month || 1) - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
};

const matchProviderId = (employee: any, identity: { pensionProvider?: string } | undefined, providers: Array<{ id: string; name: string }>) => {
  const blob = `${compact(employee.pensionProvider)} ${compact(identity?.pensionProvider)}`.toLowerCase();
  if (!blob.trim()) return '';
  const active = (providers || []).filter((provider) => provider.id !== 'unassigned');
  const hit = active.find((provider) => {
    const name = compact(provider.name).toLowerCase();
    const id = compact(provider.id).toLowerCase();
    return (name && blob.includes(name)) || (id && blob.includes(id)) || blob.split(/\s+/).some((token) => token && name.includes(token));
  });
  return hit?.id || '';
};

const resolvePensionPin = (employee: any, identity: { pensionPin?: string } | undefined) =>
  compact(identity?.pensionPin || employee.pensionPin);

const buildRecord = (employee: any, version: any, identity: { pensionProvider?: string; pensionPin?: string } | undefined, period: string) => {
  const providerId = employee.setupAssignedToPayroll ? matchProviderId(employee, identity, version.providers || []) : '';
  const rsaPin = resolvePensionPin(employee, identity);
  const input = { ...pensionInputFromEmployee(employee, { period, useHrisPackageLines: true, includePeriodAdjustments: true }), providerId, rsaPin };
  const pension = calculatePension(input, version);
  const provider = (version.providers || []).find((item: any) => item.id === providerId) || { name: '', custodian: '', id: '' };
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
    providerId,
    providerName: provider.name || compact(employee.pensionProvider) || compact(identity?.pensionProvider),
    custodian: provider.custodian || '',
    rsaPin,
    remittanceDueDays: version.rules.remittanceDueDays,
    ...pension,
  };
};

const maskMoney = (record: any) => ({
  ...record,
  pensionableEmolument: null,
  employeeContribution: null,
  employerContribution: null,
  voluntaryContribution: null,
  totalContribution: null,
  monthlyRemittance: null,
  annualEmployeeContribution: null,
  annualEmployerContribution: null,
  annualTotalContribution: null,
  rsaPin: record.rsaPin ? 'Restricted' : '',
});

const buildPayload = async (request: Request) => {
  const role = getRole(request);
  const perms = permissions(role);
  const period = requestedPeriod(request);
  const [employeeSource, config, identities, snapshots] = await Promise.all([
    readPayrollEmployees(),
    readPayrollPensionConfig(),
    payslipIdentityMap(),
    readAllPayrollSnapshotsByPeriods([period]),
  ]);
  const version = activePensionVersion(config);
  if (!version) throw new Error('No active pension configuration is available.');
  const payrollPension = new Map<string, ReturnType<typeof amountsFromPayrollRecord> & { record: any; rank: number }>();
  for (const run of snapshots.get(period) || []) {
    if (run.pack !== 'salaried') continue;
    const rank = run.company ? 2 : 1;
    for (const record of run.snapshot.records || []) {
      const code = compact(record.employeeCode || record.employeeId).toUpperCase();
      if (!/^P\d+$/.test(code)) continue;
      const existing = payrollPension.get(code);
      if (existing && existing.rank > rank) continue;
      payrollPension.set(code, {
        ...amountsFromPayrollRecord({
          employeeCode: record.employeeCode,
          employeeId: record.employeeId,
          fullName: record.fullName,
          jobTitle: record.jobTitle,
          pensionEmployer: record.pensionEmployer,
          earningLines: (record.earningLines || []).map((line) => ({
            code: String(line.code || ''),
            name: String(line.name || ''),
            amount: Number(line.amount || 0),
          })),
          deductionLines: record.deductionLines,
        }),
        record,
        rank,
      });
    }
  }
  const eligibleEmployees = employeeSource.employees.filter((employee) => isPensionEligibleStaff(employee));
  const seen = new Set<string>();
  const records = eligibleEmployees.map((employee) => {
    const identity = identities.get(normalizePayrollMatchKey(employee.employeeCode))
      || identities.get(normalizePayrollMatchKey(employee.employeeId));
    const row = buildRecord(employee, version, identity, period);
    const code = compact(row.employeeCode || row.employeeId).toUpperCase();
    seen.add(code);
    const paid = payrollPension.get(code);
    return paid ? withPensionAmounts(row, paid) : row;
  });
  for (const [code, paid] of payrollPension) {
    if (seen.has(code)) continue;
    const source = paid.record;
    records.push(withPensionAmounts({
      employeeId: source.employeeId || code,
      employeeCode: source.employeeCode || code,
      fullName: source.fullName || code,
      department: source.department || '',
      businessUnit: source.businessUnit || '',
      location: source.location || '',
      jobTitle: source.jobTitle || '',
      employmentType: source.employmentType || 'Permanent',
      employmentStatus: source.employmentStatus || '',
      payrollGroup: source.payrollGroup || 'Unassigned',
      salaryGrade: source.salaryGrade || '',
      providerId: '',
      providerName: '',
      custodian: '',
      rsaPin: '',
      remittanceDueDays: version.rules.remittanceDueDays,
      eligible: true,
      issues: source.fullName ? [] : [],
      status: 'Review',
    }, paid));
  }
  const totals = records.reduce(
    (sum, record) => ({
      pensionableEmolument: sum.pensionableEmolument + record.pensionableEmolument,
      employeeContribution: sum.employeeContribution + record.employeeContribution,
      employerContribution: sum.employerContribution + record.employerContribution,
      voluntaryContribution: sum.voluntaryContribution + record.voluntaryContribution,
      totalContribution: sum.totalContribution + record.totalContribution,
      exceptions: sum.exceptions + record.issues.length,
    }),
    { pensionableEmolument: 0, employeeContribution: 0, employerContribution: 0, voluntaryContribution: 0, totalContribution: 0, exceptions: 0 }
  );
  const providerBreakdown = Array.from(
    records
      .reduce((map, record) => {
        const key = record.providerName || 'Unassigned PFA';
        const current = map.get(key) || { label: key, employees: 0, remittance: 0, exceptions: 0 };
        current.employees += 1;
        current.remittance += record.totalContribution;
        current.exceptions += record.issues.length;
        map.set(key, current);
        return map;
      }, new Map<string, { label: string; employees: number; remittance: number; exceptions: number }>())
      .values()
  ).map((item) => ({ ...item, remittance: roundMoney(item.remittance) }));
  return {
    generatedAt: new Date().toISOString(),
    source: 'Configurable Nigeria pension payroll engine',
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
      eligible: records.filter((record) => record.eligible).length,
      pensionableEmolument: roundMoney(totals.pensionableEmolument),
      employeeContribution: roundMoney(totals.employeeContribution),
      employerContribution: roundMoney(totals.employerContribution),
      voluntaryContribution: roundMoney(totals.voluntaryContribution),
      totalContribution: roundMoney(totals.totalContribution),
      ready: records.filter((record) => record.status === 'Ready').length,
      review: records.filter((record) => record.status === 'Review').length,
      blocked: records.filter((record) => record.status === 'Blocked').length,
      exceptionCount: totals.exceptions,
    },
    breakdowns: { byProvider: providerBreakdown },
    records: perms.canViewMoney ? records : records.map(maskMoney),
  };
};

const pensionTable = (records: any[]) => ({
  columns: ['Employee ID', 'Name', 'Department', 'Payroll Group', 'PFA', 'Custodian', 'RSA PIN', 'Pensionable Emolument', 'Employee 8%', 'Employer 10%', 'Voluntary', 'Total Remittance', 'Combined Rate', 'Status', 'Issues'],
  rows: records.map((record) => [
    record.employeeId,
    record.fullName,
    record.department,
    record.payrollGroup,
    record.providerName,
    record.custodian,
    record.rsaPin,
    record.pensionableEmolument,
    record.employeeContribution,
    record.employerContribution,
    record.voluntaryContribution,
    record.totalContribution,
    record.combinedRate,
    record.status,
    (record.issues || []).join('; '),
  ]),
});

const validateConfig = (config: PensionConfig) => {
  if (!config?.activeVersionId) return 'activeVersionId is required';
  if (!Array.isArray(config.versions) || !config.versions.length) return 'At least one pension version is required';
  const active = config.versions.find((version) => version.id === config.activeVersionId);
  if (!active) return 'activeVersionId must match an existing pension version';
  if (!active.rules) return 'Active pension version requires rules';
  if (!Number.isFinite(Number(active.rules.employeeRate)) || !Number.isFinite(Number(active.rules.employerRate))) return 'Employee and employer rates must be numeric';
  if (Number(active.rules.employeeRate) + Number(active.rules.employerRate) < Number(active.rules.minimumCombinedRate)) return 'Configured rates are below minimum combined rate';
  return '';
};

export async function GET(request: Request) {
  try {
    const payload = await buildPayload(request);
    const { searchParams } = new URL(request.url);
    const format = compact(searchParams.get('format')).toLowerCase();
    if (format === 'csv' || format === 'xls' || format === 'excel') {
      if (!payload.permissions.canExport) return err(403, 'Permission denied');
      const table = pensionTable(payload.records);
      return tableExportResponse(format, {
        title: `Pension Remittance - ${payload.periodLabel}`,
        subtitle: `${payload.records.length} permanent (P-code) employees`,
        sheetName: 'Pension',
        columns: table.columns,
        rows: table.rows,
        fileName: `pension-${payload.period}`,
      });
    }
    return ok(payload);
  } catch (error) {
    return err(500, error instanceof Error ? error.message : 'Unable to load pension payroll.');
  }
}

export async function POST(request: Request) {
  try {
    const role = getRole(request);
    const perms = permissions(role);
    if (!perms.canConfigure) return err(403, 'Permission denied');
    const body = await request.json().catch(() => ({}));
    const config = body.config as PensionConfig;
    const validationError = validateConfig(config);
    if (validationError) return err(400, validationError);
    const saved = await writePayrollPensionConfig(config, role);
    return ok({ updated: true, activeVersionId: saved.activeVersionId, audit: saved.audit });
  } catch (error) {
    return err(500, error instanceof Error ? error.message : 'Unable to update pension configuration.');
  }
}
