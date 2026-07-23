import type { DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import { applyPayrollEmployeeOptions } from '@/lib/payroll-employee-options-store';
import { payrollDataSourceInfo, readDirectoryEmployees, readPayrollEmployees } from '@/lib/payroll-employee-source';
import { mergeTimesheetDayRateEarnings, calculatePayrollEarnings, resolvePayrollEarningProfile } from '@/lib/payroll-earnings-engine';
import { isNonPermanentPayrollEmployee, payrollActiveEmployees, permanentStyleSageEarnings } from '@/lib/payroll-employee-classification';
import { registerPayrollAdjustmentsChangeHandler, adjustmentsFileMtime } from '@/lib/payroll-period-earning-adjustments-store';
import { contractEmployeeCode, isDailyRatePayrollEmployee, isEmployeeExcludedFromPayrollRun, type PayrollRunExclusionEmployee } from '@/lib/payroll-employee-classification';
import { enterprisePayrollSourceLabel, isEnterprisePayrollPeriod, isSagePayrollRuntimeEnabled, shouldComparePayrollWithSage } from '@/lib/payroll-enterprise-source';
import { activeTaxVersion, calculatePayrollTax, payrollInputFromEmployee, readPayrollTaxConfig } from '@/lib/payroll-tax-engine';
import { activePensionVersion, calculatePension, pensionInputFromEmployee, readPayrollPensionConfig } from '@/lib/payroll-pension-engine';
import { activeStatutoryFundsVersion, calculateStatutoryFunds, readStatutoryFundsConfig, statutoryFundInputFromEmployee } from '@/lib/payroll-statutory-funds-engine';
import { activeLoansVersion, calculateLoanRecovery, loanInputsFromApplications, readPayrollLoanApplications, readPayrollLoansConfig } from '@/lib/payroll-loans-engine';
import { syncLeaveAllowanceEventsForPayroll } from '@/lib/payroll-leave-allowance-store';
import { normalizePayrollMatchKey, readSagePayrollPeriodTotals } from '@/lib/sage-people-payroll-store';
import { buildTimesheetHoursMapForPayrollPeriod } from '@/lib/timesheet-entry-store';
import { normalizeBankSortCode, withNormalizedBankCodes } from '@/lib/payroll-bank-constants';
import { resolvePayCurrency } from '@/lib/payroll-currency';
import { payrollPeriodLabel } from '@/lib/payroll-period-store';
import { computePayrollReadinessStatus, enrichCalculationRecordsWithReadiness, summarizePayrollReadiness, type PayrollReadinessStatus } from '@/lib/payroll-readiness';
import { partitionPayrollIssues, payrollToleranceActive, reapplyPayrollValidationPolicy } from '@/lib/payroll-tolerance';
import type { PayrollRunSnapshot } from '@/lib/payroll-run-store';

export type PayrollRecordStatus = 'Ready' | 'Review' | 'Blocked';
export type PayrollTone = 'blue' | 'green' | 'amber' | 'red' | 'violet' | 'cyan' | 'slate';

export type PayrollCalculationRecord = {
  recordKey: string;
  employeeId: string;
  employeeCode: string;
  fullName: string;
  department: string;
  businessUnit: string;
  location: string;
  jobTitle: string;
  employmentType: string;
  employmentStatus: string;
  payrollGroup: string;
  salaryGrade: string;
  payCurrency: string;
  paymentRun: string;
  basePay: number;
  allowances: number;
  grossPay: number;
  periodPackageGross?: number;
  taxablePay: number;
  nonTaxablePay: number;
  earningProfile: string;
  earningProfileId: string;
  paye: number;
  pensionEmployee: number;
  pensionEmployer: number;
  statutoryEmployee: number;
  statutoryEmployer: number;
  loanRecovery: number;
  otherDeductions: number;
  totalDeductions: number;
  netPay: number;
  employerCost: number;
  deductionRatio: number;
  timesheetDaysWorked: number | null;
  timesheetBookedHours: number | null;
  sageActual: null | {
    employeeCode: string;
    directoryEmployeeCode: string;
    employeePayPeriodId: number;
    lastCalcDate: string | null;
    grossPay: number | null;
    taxablePay: number | null;
    paye: number | null;
    pensionEmployee: number | null;
    totalDeductions: number | null;
    netPay: number | null;
  };
  discrepancies: {
    status: 'Matched' | 'Variance' | 'Missing Sage';
    grossVariance: number | null;
    netVariance: number | null;
    deductionVariance: number | null;
  };
  status: PayrollRecordStatus;
  readinessStatus: PayrollReadinessStatus;
  issues: string[];
  payrollStatus: PayrollRecordStatus;
  riskSeverity: 'High' | 'Medium' | 'Low';
  exceptionCount: number;
  exceptions: string[];
  deferredWarnings: string[];
  deductions: number;
  pension: number;
  isDailyRate: boolean;
  ratePerDay: number | null;
  ratePerHour: number | null;
  hoursPerDay: number | null;
  bankName?: string;
  accountNo?: string;
  accountName?: string;
  bankCode?: string;
  branchName?: string;
  branchCode?: string;
  sortCode?: string;
  setupAssignedToPayroll: boolean;
  nhfApplicable: boolean;
  salaryStructure: string;
  earningLines: Array<Record<string, unknown>>;
  annualBenefitLines: Array<Record<string, unknown>>;
  deductionLines: Array<{ code: string; label: string; amount: number }>;
};

export type PayrollCalculationSummary = {
  employees: number;
  payrollEligible: number;
  ready: number;
  review: number;
  blocked: number;
  blockedEmployees: number;
  readyEmployees: number;
  reviewEmployees: number;
  readinessReadyEmployees: number;
  readinessAwaitingTimesheetEmployees: number;
  readinessReviewEmployees: number;
  readinessBlockedEmployees: number;
  basePay: number;
  allowances: number;
  grossPay: number;
  totalDeductions: number;
  deductions: number;
  netPay: number;
  employerCost: number;
  sageGrossPay: number;
  sageNetPay: number;
  grossVariance: number;
  netVariance: number;
  discrepancyCount: number;
  exceptionCount: number;
  deferredExceptionCount: number;
  averageDeductionRatio: number;
  payrollCoveragePct: number;
};

export type PayrollCalculationResult = {
  generatedAt: string;
  source: string;
  dataSource: ReturnType<typeof payrollDataSourceInfo>;
  period: string;
  periodLabel: string;
  configurations: Record<string, { id: string; name: string; effectiveFrom: string }>;
  summary: PayrollCalculationSummary;
  records: PayrollCalculationRecord[];
  breakdowns: {
    byPayrollGroup: Array<{ label: string; employees: number; grossPay: number; netPay: number; exceptions: number }>;
    byDepartment: Array<{ label: string; employees: number; grossPay: number; netPay: number; exceptions: number }>;
    byEmploymentType: Array<{ label: string; employees: number; grossPay: number; netPay: number; exceptions: number }>;
    byComponent: Array<{ id: string; label: string; amount: number; tone: PayrollTone; payer: 'Employee' | 'Employer' | 'Both' }>;
  };
  controls: Array<{ id: string; label: string; status: string; detail: string; tone: PayrollTone }>;
  toleranceMode: boolean;
  enterpriseSourceActive: boolean;
};

const roundMoney = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
const compact = (value: unknown) => String(value || '').trim();
const activeStatus = (value: unknown) => !compact(value).toLowerCase().match(/terminated|resigned|retired|inactive|deceased/);

const inputOnlyEmployee = (employee: DleEmployeeDirectoryRow): DleEmployeeDirectoryRow => ({
  ...employee,
  sagePayrollEarnings: undefined,
  sagePayrollDeductions: undefined,
  sagePayrollContributions: undefined,
});

const moneyVariance = (actual: number | null | undefined, expected: number | null | undefined) =>
  roundMoney(Number(expected || 0) - Number(actual || 0));

const varianceStatus = (variance: number, threshold = 1) => (Math.abs(variance) <= threshold ? 'Matched' : 'Variance');

const statusFromIssues = (issues: string[]): PayrollRecordStatus => {
  if (issues.some((issue) => /missing|not payroll active|no active|pay amount is missing/i.test(issue))) return 'Blocked';
  return issues.length ? 'Review' : 'Ready';
};

const contractPayrollCode = (employee: DleEmployeeDirectoryRow) => {
  const code = compact(employee.employeeCode || employee.employeeId).toUpperCase();
  return contractEmployeeCode(employee) || /^L\d+/.test(code);
};

const skipSageVarianceCheck = (employee: DleEmployeeDirectoryRow, dailyRateEmployee: boolean, toleranceMode: boolean, enterpriseSourceActive: boolean) =>
  enterpriseSourceActive || toleranceMode || dailyRateEmployee || contractPayrollCode(employee);

const dailyRateValues = (employee: DleEmployeeDirectoryRow, dailyRateEmployee: boolean) => {
  const hoursPerDay = Number(employee.hoursPerDay || 8) || 8;
  const hoursPerPeriod = Number(employee.hoursPerPeriod || 0);
  const workingDays = hoursPerPeriod > 0 && hoursPerDay > 0 ? hoursPerPeriod / hoursPerDay : 22;
  const explicitDayRate = Number(employee.ratePerDay || 0);
  const explicitHourRate = Number(employee.ratePerHour || 0);
  const periodSalary = Number(employee.periodSalary || 0);
  const ratePerDay = explicitDayRate > 0
    ? explicitDayRate
    : explicitHourRate > 0
      ? explicitHourRate * hoursPerDay
      : dailyRateEmployee && periodSalary > 0
        ? periodSalary > 50000
          ? periodSalary / workingDays
          : periodSalary
        : 0;
  const ratePerHour = explicitHourRate > 0 ? explicitHourRate : ratePerDay > 0 ? ratePerDay / hoursPerDay : 0;
  return { ratePerDay, ratePerHour, hoursPerDay, workingDays };
};

const timesheetPeriodId = (period: string) => `per-${period.replace(/^per-/, '')}`;

export const readApprovedTimesheetHoursForPayrollPeriod = async (period: string) => buildTimesheetHoursMapForPayrollPeriod(period);

const resolveTimesheetHoursForEmployee = (
  employee: Pick<DleEmployeeDirectoryRow, 'employeeId' | 'employeeCode' | 'id' | 'fullName'>,
  timesheetHours: Map<string, { daysWorked: number; bookedHours: number }>,
) => {
  const keys = [employee.employeeId, employee.employeeCode, employee.id, employee.fullName, normalizePayrollMatchKey(employee.employeeId), normalizePayrollMatchKey(employee.employeeCode), normalizePayrollMatchKey(employee.fullName)]
    .map((key) => compact(key))
    .filter(Boolean);
  return keys.map((key) => timesheetHours.get(key) || timesheetHours.get(normalizePayrollMatchKey(key))).find(Boolean) || null;
};

const applyDailyRateFromTimesheets = (
  employee: DleEmployeeDirectoryRow,
  amounts: ReturnType<typeof calculatePayrollEarnings>,
  timesheetHours: Map<string, { daysWorked: number; bookedHours: number }>,
  period: string,
) => {
  const profileId = resolvePayrollEarningProfile(employee);
  const rates = dailyRateValues(employee, true);
  const contractDayRateEmployee = contractEmployeeCode(employee) && (rates.ratePerDay > 0 || rates.ratePerHour > 0);
  if (!isDailyRatePayrollEmployee(employee, profileId) && !contractDayRateEmployee) return amounts;

  const timesheet = resolveTimesheetHoursForEmployee(employee, timesheetHours);
  let daysWorked = 0;
  if (timesheet) {
    daysWorked = timesheet.daysWorked > 0
      ? timesheet.daysWorked
      : (timesheet.bookedHours > 0 ? timesheet.bookedHours / rates.hoursPerDay : 0);
  }
  if (daysWorked <= 0) {
    const hoursPerPeriod = Number(employee.hoursPerPeriod || 0);
    if (hoursPerPeriod > 0 && rates.hoursPerDay > 0) daysWorked = hoursPerPeriod / rates.hoursPerDay;
  }
  if (daysWorked <= 0) return amounts;

  const ratePerDay = rates.ratePerDay || (rates.ratePerHour > 0 ? rates.ratePerHour * rates.hoursPerDay : 0);
  const merged = mergeTimesheetDayRateEarnings(employee, { ratePerDay, daysWorked, period });
  return {
    ...merged,
    profileName: merged.profileName.includes('Sage Aligned')
      ? 'Daily Rate (Timesheet Driven, Sage Aligned)'
      : 'Daily Rate (Timesheet Driven)',
  };
};

export const groupPayrollCalculationRecords = (records: PayrollCalculationRecord[], key: keyof PayrollCalculationRecord) =>
  Array.from(
    records.reduce((map, record) => {
      const label = String(record[key] || 'Unassigned');
      const current = map.get(label) || { label, employees: 0, grossPay: 0, netPay: 0, exceptions: 0 };
      current.employees += 1;
      current.grossPay += record.grossPay;
      current.netPay += record.netPay;
      current.exceptions += record.exceptionCount;
      map.set(label, current);
      return map;
    }, new Map<string, { label: string; employees: number; grossPay: number; netPay: number; exceptions: number }>()).values(),
  )
    .map((item) => ({ ...item, grossPay: roundMoney(item.grossPay), netPay: roundMoney(item.netPay) }))
    .sort((a, b) => b.grossPay - a.grossPay);

/** Split a full-period calculation into a salaried or daily-rate pack (cost totals follow the filtered set). */
export const filterPayrollCalculationByPack = (
  calculation: PayrollCalculationResult,
  pack: import('@/lib/payroll-employee-classification').PayrollRunPack,
): PayrollCalculationResult => {
  const records = calculation.records.filter((record) => (pack === 'daily-rate' ? record.isDailyRate : !record.isDailyRate));
  const ready = records.filter((record) => record.status === 'Ready');
  const review = records.filter((record) => record.status === 'Review');
  const blocked = records.filter((record) => record.status === 'Blocked');
  const readiness = summarizePayrollReadiness(records);
  const exceptionCount = records.reduce((sum, record) => sum + Number(record.exceptionCount || 0), 0);
  const deferredExceptionCount = records.reduce((sum, record) => sum + Number(record.deferredWarnings?.length || 0), 0);
  const totals = records.reduce(
    (sum, record) => ({
      basePay: sum.basePay + Number(record.basePay || 0),
      allowances: sum.allowances + Number(record.allowances || 0),
      grossPay: sum.grossPay + Number(record.grossPay || 0),
      deductions: sum.deductions + Number(record.totalDeductions || 0),
      netPay: sum.netPay + Number(record.netPay || 0),
      employerCost: sum.employerCost + Number(record.employerCost || 0),
      sageGrossPay: sum.sageGrossPay + Number(record.sageActual?.grossPay || 0),
      sageNetPay: sum.sageNetPay + Number(record.sageActual?.netPay || 0),
      paye: sum.paye + Number(record.paye || 0),
      pensionEmployee: sum.pensionEmployee + Number(record.pensionEmployee || 0),
      pensionEmployer: sum.pensionEmployer + Number(record.pensionEmployer || 0),
      statutoryEmployee: sum.statutoryEmployee + Number(record.statutoryEmployee || 0),
      statutoryEmployer: sum.statutoryEmployer + Number(record.statutoryEmployer || 0),
      loanRecovery: sum.loanRecovery + Number(record.loanRecovery || 0),
    }),
    {
      basePay: 0,
      allowances: 0,
      grossPay: 0,
      deductions: 0,
      netPay: 0,
      employerCost: 0,
      sageGrossPay: 0,
      sageNetPay: 0,
      paye: 0,
      pensionEmployee: 0,
      pensionEmployer: 0,
      statutoryEmployee: 0,
      statutoryEmployer: 0,
      loanRecovery: 0,
    },
  );
  const component = (componentId: string, label: string, amount: number, tone: PayrollTone, payer: 'Employee' | 'Employer' | 'Both') =>
    ({ id: componentId, label, amount: roundMoney(amount), tone, payer });
  const packLabel = pack === 'daily-rate' ? 'Contract Daily Rate' : 'Salaried / Stipend';
  return {
    ...calculation,
    periodLabel: `${calculation.periodLabel} · ${packLabel}`,
    summary: {
      ...calculation.summary,
      employees: records.length,
      payrollEligible: records.length,
      ready: ready.length,
      review: review.length,
      blocked: blocked.length,
      readyEmployees: ready.length,
      reviewEmployees: review.length,
      blockedEmployees: blocked.length,
      readinessReadyEmployees: readiness.readinessReadyEmployees,
      readinessAwaitingTimesheetEmployees: readiness.readinessAwaitingTimesheetEmployees,
      readinessReviewEmployees: readiness.readinessReviewEmployees,
      readinessBlockedEmployees: readiness.readinessBlockedEmployees,
      basePay: roundMoney(totals.basePay),
      allowances: roundMoney(totals.allowances),
      grossPay: roundMoney(totals.grossPay),
      totalDeductions: roundMoney(totals.deductions),
      deductions: roundMoney(totals.deductions),
      netPay: roundMoney(totals.netPay),
      employerCost: roundMoney(totals.employerCost),
      sageGrossPay: roundMoney(totals.sageGrossPay),
      sageNetPay: roundMoney(totals.sageNetPay),
      grossVariance: roundMoney(totals.sageGrossPay - totals.grossPay),
      netVariance: roundMoney(totals.sageNetPay - totals.netPay),
      exceptionCount,
      deferredExceptionCount,
      averageDeductionRatio: totals.grossPay > 0 ? roundMoney(totals.deductions / totals.grossPay) : 0,
      payrollCoveragePct: records.length
        ? Math.round((records.filter((record) => record.setupAssignedToPayroll).length / records.length) * 1000) / 10
        : 0,
    },
    records,
    breakdowns: {
      byPayrollGroup: groupPayrollCalculationRecords(records, 'payrollGroup'),
      byDepartment: groupPayrollCalculationRecords(records, 'department').slice(0, 12),
      byEmploymentType: groupPayrollCalculationRecords(records, 'employmentType'),
      byComponent: [
        component('paye', 'PAYE', totals.paye, 'violet', 'Employee'),
        component('pension-employee', 'Employee Pension', totals.pensionEmployee, 'blue', 'Employee'),
        component('statutory-employee', 'NHF/Statutory Employee', totals.statutoryEmployee, 'cyan', 'Employee'),
        component('loan', 'Loan Recovery', totals.loanRecovery, 'amber', 'Employee'),
        component('pension-employer', 'Employer Pension', totals.pensionEmployer, 'green', 'Employer'),
        component('statutory-employer', 'NSITF/ITF Employer', totals.statutoryEmployer, 'slate', 'Employer'),
      ],
    },
    controls: [
      ...calculation.controls.filter((item) => item.id !== 'pack-split'),
      {
        id: 'pack-split',
        label: 'Payroll Pack',
        status: packLabel,
        detail: pack === 'daily-rate'
          ? 'Contract daily-rate staff only. Cost driven by approved timesheet days × rate. Same approval chain as salaried pack.'
          : 'Permanent, lumpsum, NYSC/IT and other non–daily-rate staff. Timesheet PROCESS/POST feeds OT separately; this pack uses salary/stipend profiles.',
        tone: pack === 'daily-rate' ? 'amber' : 'blue',
      },
    ],
  };
};

const PAYROLL_CALC_CACHE_TTL_MS = Number(process.env.HRIS_PAYROLL_CALC_CACHE_MS || 300000);
const PAYROLL_CONFIG_CACHE_MS = Number(process.env.HRIS_PAYROLL_CONFIG_CACHE_MS || 300000);
const payrollCalculationCache = new Map<string, {
  key: string;
  expiresAt: number;
  result?: PayrollCalculationResult;
  inFlight?: Promise<PayrollCalculationResult>;
}>();

type PayrollConfigBundle = {
  expiresAt: number;
  taxConfig: Awaited<ReturnType<typeof readPayrollTaxConfig>>;
  pensionConfig: Awaited<ReturnType<typeof readPayrollPensionConfig>>;
  fundsConfig: Awaited<ReturnType<typeof readStatutoryFundsConfig>>;
  loansConfig: Awaited<ReturnType<typeof readPayrollLoansConfig>>;
  loanApplications: Awaited<ReturnType<typeof readPayrollLoanApplications>>;
};

let payrollConfigCache: PayrollConfigBundle | null = null;

const readPayrollConfigBundle = async () => {
  const now = Date.now();
  if (payrollConfigCache && payrollConfigCache.expiresAt > now) return payrollConfigCache;
  const [taxConfig, pensionConfig, fundsConfig, loansConfig, loanApplications] = await Promise.all([
    readPayrollTaxConfig(),
    readPayrollPensionConfig(),
    readStatutoryFundsConfig(),
    readPayrollLoansConfig(),
    readPayrollLoanApplications(),
  ]);
  payrollConfigCache = {
    expiresAt: now + PAYROLL_CONFIG_CACHE_MS,
    taxConfig,
    pensionConfig,
    fundsConfig,
    loansConfig,
    loanApplications,
  };
  return payrollConfigCache;
};

export const invalidatePayrollConfigCache = () => {
  payrollConfigCache = null;
};

const readEmployeesForPayrollCalculation = async (period: string) => {
  if (isEnterprisePayrollPeriod(period) && !isSagePayrollRuntimeEnabled()) {
    const directory = await readDirectoryEmployees();
    return {
      ...directory,
      employees: await applyPayrollEmployeeOptions(payrollActiveEmployees(directory.employees)),
    };
  }
  return readPayrollEmployees();
};

const emptyPayrollSummary = (): PayrollCalculationSummary => ({
  employees: 0,
  payrollEligible: 0,
  ready: 0,
  review: 0,
  blocked: 0,
  blockedEmployees: 0,
  readyEmployees: 0,
  reviewEmployees: 0,
  readinessReadyEmployees: 0,
  readinessAwaitingTimesheetEmployees: 0,
  readinessReviewEmployees: 0,
  readinessBlockedEmployees: 0,
  basePay: 0,
  allowances: 0,
  grossPay: 0,
  totalDeductions: 0,
  deductions: 0,
  netPay: 0,
  employerCost: 0,
  sageGrossPay: 0,
  sageNetPay: 0,
  grossVariance: 0,
  netVariance: 0,
  discrepancyCount: 0,
  exceptionCount: 0,
  deferredExceptionCount: 0,
  averageDeductionRatio: 0,
  payrollCoveragePct: 0,
});

const snapshotSummaryFromRecords = (snapshot: PayrollRunSnapshot, records: PayrollCalculationRecord[]) => {
  const raw = snapshot.summary as Record<string, number>;
  const ready = Number(raw.readyEmployees ?? raw.ready ?? records.filter((record) => record.payrollStatus === 'Ready').length);
  const review = Number(raw.reviewEmployees ?? raw.review ?? records.filter((record) => record.payrollStatus === 'Review').length);
  const blocked = Number(raw.blockedEmployees ?? raw.blocked ?? records.filter((record) => record.payrollStatus === 'Blocked').length);
  const employees = Number(raw.employees ?? records.length);
  const payrollEligible = Number(raw.payrollEligible ?? records.filter((record) => !['Terminated', 'Resigned', 'Retired', 'Inactive'].includes(record.employmentStatus)).length);
  return {
    employees,
    payrollEligible,
    readyEmployees: ready,
    reviewEmployees: review,
    blockedEmployees: blocked,
    basePay: roundMoney(Number(raw.basePay ?? records.reduce((sum, record) => sum + Number(record.basePay || 0), 0))),
    allowances: roundMoney(Number(raw.allowances ?? records.reduce((sum, record) => sum + Number(record.allowances || 0), 0))),
    grossPay: roundMoney(Number(raw.grossPay ?? records.reduce((sum, record) => sum + Number(record.grossPay || 0), 0))),
    deductions: roundMoney(Number(raw.deductions ?? raw.totalDeductions ?? records.reduce((sum, record) => sum + Number(record.deductions || 0), 0))),
    netPay: roundMoney(Number(raw.netPay ?? records.reduce((sum, record) => sum + Number(record.netPay || 0), 0))),
    exceptionCount: Number(raw.exceptionCount ?? records.reduce((sum, record) => sum + Number(record.exceptionCount || 0), 0)),
    deferredExceptionCount: Number(raw.deferredExceptionCount ?? records.reduce((sum, record) => sum + Number(record.deferredWarnings?.length || 0), 0)),
  };
};

const buildPayrollCalculationShell = async (period: string): Promise<PayrollCalculationResult> => {
  const toleranceMode = payrollToleranceActive(period);
  const enterpriseSourceActive = isEnterprisePayrollPeriod(period);
  const [employeeSource, { taxConfig, pensionConfig, fundsConfig, loansConfig }] = await Promise.all([
    readEmployeesForPayrollCalculation(period),
    readPayrollConfigBundle(),
  ]);
  const taxVersion = activeTaxVersion(taxConfig);
  const pensionVersion = activePensionVersion(pensionConfig);
  const fundsVersion = activeStatutoryFundsVersion(fundsConfig);
  const loansVersion = activeLoansVersion(loansConfig);
  if (!taxVersion || !pensionVersion || !fundsVersion || !loansVersion) {
    throw new Error('One or more active payroll configuration versions are missing.');
  }
  return {
    generatedAt: new Date().toISOString(),
    source: enterprisePayrollSourceLabel(period),
    dataSource: payrollDataSourceInfo(employeeSource),
    period,
    periodLabel: payrollPeriodLabel(period),
    configurations: {
      tax: { id: taxVersion.id, name: taxVersion.name, effectiveFrom: taxVersion.effectiveFrom },
      pension: { id: pensionVersion.id, name: pensionVersion.name, effectiveFrom: pensionVersion.effectiveFrom },
      statutoryFunds: { id: fundsVersion.id, name: fundsVersion.name, effectiveFrom: fundsVersion.effectiveFrom },
      loans: { id: loansVersion.id, name: loansVersion.name, effectiveFrom: loansVersion.effectiveFrom },
    },
    summary: emptyPayrollSummary(),
    records: [],
    breakdowns: {
      byPayrollGroup: [],
      byDepartment: [],
      byEmploymentType: [],
      byComponent: [],
    },
    controls: [
      { id: 'employees', label: 'Employee Source', status: employeeSource.databaseAvailable ? 'Passed' : 'Review', detail: `${employeeSource.employees.length} employees loaded from ${employeeSource.source}`, tone: employeeSource.databaseAvailable ? 'green' : 'amber' },
      { id: 'config', label: 'Configuration Versions', status: 'Passed', detail: 'PAYE, pension, statutory funds, and loan policies resolved by active effective versions.', tone: 'blue' },
      { id: 'timesheets', label: 'Timesheet Payroll Feed', status: 'Snapshot', detail: 'Loaded from frozen payroll run snapshot.', tone: 'green' },
      { id: 'exceptions', label: 'Exception Gate', status: 'Snapshot', detail: 'Exception counts restored from frozen payroll run snapshot.', tone: 'blue' },
      ...(enterpriseSourceActive
        ? [{ id: 'enterprise-source', label: 'Authoritative Payroll Source', status: 'DLE_Enterprise', detail: 'Frozen payroll snapshot from DLE_Enterprise HRIS.', tone: 'green' as PayrollTone }]
        : [{ id: 'sage-discrepancy', label: 'Sage Comparison', status: 'Snapshot', detail: 'Loaded from frozen payroll run snapshot.', tone: 'blue' as PayrollTone }]),
    ],
    toleranceMode,
    enterpriseSourceActive,
  };
};

export const buildPayrollCalculationFromSnapshot = async (period: string, snapshot: PayrollRunSnapshot): Promise<PayrollCalculationResult> => {
  const shell = await buildPayrollCalculationShell(period);
  const toleranceMode = shell.toleranceMode;
  const records = reapplyPayrollValidationPolicy(
    enrichCalculationRecordsWithReadiness(snapshot.records),
    toleranceMode,
  );
  const summary = snapshotSummaryFromRecords(snapshot, records);
  const readiness = summarizePayrollReadiness(records);
  const exceptionCount = records.reduce((sum, record) => sum + Number(record.exceptionCount || 0), 0);
  const deferredExceptionCount = records.reduce((sum, record) => sum + Number(record.deferredWarnings?.length || 0), 0);
  const totals = records.reduce(
    (sum, record) => ({
      paye: sum.paye + record.paye,
      pensionEmployee: sum.pensionEmployee + record.pensionEmployee,
      pensionEmployer: sum.pensionEmployer + record.pensionEmployer,
      statutoryEmployee: sum.statutoryEmployee + record.statutoryEmployee,
      statutoryEmployer: sum.statutoryEmployer + record.statutoryEmployer,
      loanRecovery: sum.loanRecovery + record.loanRecovery,
    }),
    { paye: 0, pensionEmployee: 0, pensionEmployer: 0, statutoryEmployee: 0, statutoryEmployer: 0, loanRecovery: 0 },
  );
  const component = (componentId: string, label: string, amount: number, tone: PayrollTone, payer: 'Employee' | 'Employer' | 'Both') =>
    ({ id: componentId, label, amount: roundMoney(amount), tone, payer });
  return {
    ...shell,
    generatedAt: snapshot.capturedAt || shell.generatedAt,
    source: 'Frozen payroll run snapshot',
    summary: {
      ...shell.summary,
      employees: summary.employees,
      payrollEligible: summary.payrollEligible,
      ready: summary.readyEmployees,
      review: summary.reviewEmployees,
      blocked: summary.blockedEmployees,
      readyEmployees: summary.readyEmployees,
      reviewEmployees: summary.reviewEmployees,
      blockedEmployees: summary.blockedEmployees,
      readinessReadyEmployees: readiness.readinessReadyEmployees,
      readinessAwaitingTimesheetEmployees: readiness.readinessAwaitingTimesheetEmployees,
      readinessReviewEmployees: readiness.readinessReviewEmployees,
      readinessBlockedEmployees: readiness.readinessBlockedEmployees,
      basePay: summary.basePay,
      allowances: summary.allowances,
      grossPay: summary.grossPay,
      totalDeductions: summary.deductions,
      deductions: summary.deductions,
      netPay: summary.netPay,
      exceptionCount,
      deferredExceptionCount,
      payrollCoveragePct: summary.employees
        ? Math.round((records.filter((record) => record.setupAssignedToPayroll).length / summary.employees) * 1000) / 10
        : 0,
    },
    records,
    breakdowns: {
      byPayrollGroup: groupPayrollCalculationRecords(records, 'payrollGroup'),
      byDepartment: groupPayrollCalculationRecords(records, 'department').slice(0, 12),
      byEmploymentType: groupPayrollCalculationRecords(records, 'employmentType'),
      byComponent: [
        component('paye', 'PAYE', totals.paye, 'violet', 'Employee'),
        component('pension-employee', 'Employee Pension', totals.pensionEmployee, 'blue', 'Employee'),
        component('statutory-employee', 'NHF/Statutory Employee', totals.statutoryEmployee, 'cyan', 'Employee'),
        component('loan', 'Loan Recovery', totals.loanRecovery, 'amber', 'Employee'),
        component('pension-employer', 'Employer Pension', totals.pensionEmployer, 'green', 'Employer'),
        component('statutory-employer', 'NSITF/ITF Employer', totals.statutoryEmployer, 'slate', 'Employer'),
      ],
    },
  };
};

export const calculatePayrollForPeriod = async (
  requestedPeriod: string,
  options?: { forceRefresh?: boolean; pack?: import('@/lib/payroll-employee-classification').PayrollRunPack },
): Promise<PayrollCalculationResult> => {
  const cacheKey = `${requestedPeriod}:${adjustmentsFileMtime()}`;
  const cached = payrollCalculationCache.get(requestedPeriod);
  let full: PayrollCalculationResult;
  if (!options?.forceRefresh && cached?.result && cached.key === cacheKey && cached.expiresAt > Date.now()) {
    full = cached.result;
  } else if (!options?.forceRefresh && cached?.inFlight && cached.key === cacheKey) {
    full = await cached.inFlight;
  } else {
    const inFlight = computePayrollForPeriod(requestedPeriod).then((result) => {
      payrollCalculationCache.set(requestedPeriod, {
        key: cacheKey,
        expiresAt: Date.now() + PAYROLL_CALC_CACHE_TTL_MS,
        result,
      });
      return result;
    });
    payrollCalculationCache.set(requestedPeriod, { key: cacheKey, expiresAt: 0, inFlight });
    full = await inFlight;
  }
  if (options?.pack) return filterPayrollCalculationByPack(full, options.pack);
  return full;
};

export const invalidatePayrollCalculationCache = (period?: string) => {
  if (period) {
    payrollCalculationCache.delete(period);
    return;
  }
  payrollCalculationCache.clear();
};

registerPayrollAdjustmentsChangeHandler((period) => invalidatePayrollCalculationCache(period));

const computePayrollForPeriod = async (requestedPeriod: string): Promise<PayrollCalculationResult> => {
  const toleranceMode = payrollToleranceActive(requestedPeriod);
  const enterpriseSourceActive = isEnterprisePayrollPeriod(requestedPeriod);
  const compareWithSage = shouldComparePayrollWithSage(requestedPeriod);
  const [
    employeeSource,
    { taxConfig, pensionConfig, fundsConfig, loansConfig, loanApplications },
    sagePeriodTotals,
    timesheetHours,
  ] = await Promise.all([
    readEmployeesForPayrollCalculation(requestedPeriod),
    readPayrollConfigBundle(),
    compareWithSage ? readSagePayrollPeriodTotals(requestedPeriod).catch(() => []) : Promise.resolve([]),
    readApprovedTimesheetHoursForPayrollPeriod(requestedPeriod),
  ]);

  const taxVersion = activeTaxVersion(taxConfig);
  const pensionVersion = activePensionVersion(pensionConfig);
  const fundsVersion = activeStatutoryFundsVersion(fundsConfig);
  const loansVersion = activeLoansVersion(loansConfig);
  if (!taxVersion || !pensionVersion || !fundsVersion || !loansVersion) {
    throw new Error('One or more active payroll configuration versions are missing.');
  }

  if (!enterpriseSourceActive) {
    try {
      await syncLeaveAllowanceEventsForPayroll(requestedPeriod);
    } catch (error) {
      console.warn('[PayrollCalculation] Leave allowance sync skipped:', error instanceof Error ? error.message : error);
    }
  }

  const sageByKey = new Map<string, (typeof sagePeriodTotals)[number]>();
  for (const total of sagePeriodTotals) {
    [total.directoryEmployeeCode, total.employeeCode, total.employeeId, total.employeeName]
      .map(normalizePayrollMatchKey)
      .filter(Boolean)
      .forEach((key) => sageByKey.set(key, total));
  }

  const loanInputs = loanInputsFromApplications(employeeSource.employees, loanApplications).reduce((map, input) => {
    const current = map.get(input.employee.employeeId) || [];
    current.push(input);
    map.set(input.employee.employeeId, current);
    return map;
  }, new Map<string, ReturnType<typeof loanInputsFromApplications>>());

  const calculationOptionsForEmployee = (employee: DleEmployeeDirectoryRow) => {
    const base = { period: requestedPeriod, includePeriodAdjustments: true as const };
    if (!compareWithSage) return { ...base, ignoreSagePayslipLines: true as const };
    if (!isNonPermanentPayrollEmployee(employee)) {
      return { ...base, ignoreSagePayslipLines: true as const };
    }
    const sageLines = employee.sagePayrollEarnings || [];
    const useSagePayslipLines = permanentStyleSageEarnings(sageLines) || sageLines.length === 0;
    return useSagePayslipLines
      ? { ...base, useSagePayslipLines: true as const, ignoreSagePayslipLines: false as const }
      : { ...base, ignoreSagePayslipLines: true as const };
  };

  const payrollEmployees = employeeSource.employees.filter((employee) => !isEmployeeExcludedFromPayrollRun(employee as PayrollRunExclusionEmployee));

  const records: PayrollCalculationRecord[] = payrollEmployees.map((employee, index) => {
    const calculationOptions = calculationOptionsForEmployee(employee);
    const calculationEmployee = shouldComparePayrollWithSage(requestedPeriod) ? employee : inputOnlyEmployee(employee);
    const baseAmounts = calculatePayrollEarnings(calculationEmployee, calculationOptions);
    const amounts = applyDailyRateFromTimesheets(employee, baseAmounts, timesheetHours, requestedPeriod);
    const tax = calculatePayrollTax(payrollInputFromEmployee(calculationEmployee, calculationOptions, amounts), taxVersion);
    const pension = calculatePension(pensionInputFromEmployee(calculationEmployee, calculationOptions), pensionVersion);
    const funds = calculateStatutoryFunds(statutoryFundInputFromEmployee(calculationEmployee, employeeSource.employees.length, calculationOptions), fundsVersion);
    const loans = (loanInputs.get(employee.employeeId) || []).map((loanInput) => calculateLoanRecovery(loanInput, loansVersion));
    const sageActual = compareWithSage
      ? [employee.employeeCode, employee.employeeId, employee.id, employee.fullName]
        .map(normalizePayrollMatchKey)
        .map((key) => sageByKey.get(key))
        .find(Boolean) || null
      : null;
    const paye = tax.monthlyPaye;
    const employeePension = pension.employeeContribution;
    const statutoryEmployee = funds.employeeDeductions;
    const loanRecovery = roundMoney(loans.reduce((sum, loan) => sum + loan.payrollRecovery, 0));
    const taxComponentMonthly = (componentId: string) => (tax.statutoryItems.find((item) => item.id === componentId)?.amount || 0) / 12;
    const nhf = taxComponentMonthly('nhf');
    const nhfFundDeduction = roundMoney(funds.fundResults.find((item) => item.id === 'nhf')?.monthlyAmount || 0);
    const statutoryEmployeeDeductions = roundMoney(Math.max(0, statutoryEmployee - (nhf > 0 && nhfFundDeduction > 0 ? nhfFundDeduction : 0)));
    const unionDues = taxComponentMonthly('union-dues');
    const otherStatutory = taxComponentMonthly('other-statutory');
    const otherDeductions = roundMoney(unionDues + otherStatutory);
    const totalDeductions = roundMoney(paye + employeePension + statutoryEmployeeDeductions + loanRecovery + nhf + otherDeductions);
    const netPay = roundMoney(Math.max(0, amounts.grossPay - totalDeductions));
    const grossVariance = sageActual ? moneyVariance(sageActual.grossPay, amounts.grossPay) : null;
    const netVariance = sageActual ? moneyVariance(sageActual.netPay, netPay) : null;
    const deductionVariance = sageActual ? moneyVariance(sageActual.totalDeductions, totalDeductions) : null;
    const employerPension = pension.employerContribution;
    const employerStatutory = funds.employerCosts;
    const employerCost = roundMoney(amounts.grossPay + employerPension + employerStatutory);
    const deductionRatio = amounts.grossPay > 0 ? roundMoney((totalDeductions / amounts.grossPay) * 100) : 0;
    const dailyRateEmployee = isDailyRatePayrollEmployee(employee, amounts.profileId);
    const stipendEmployee = amounts.profileId === 'stipend-non-taxable';
    const rates = dailyRateValues(employee, dailyRateEmployee);
    const timesheet = resolveTimesheetHoursForEmployee(employee, timesheetHours);
    const pensionIssues = (!dailyRateEmployee && !stipendEmployee
      ? pension.issues
      : pension.issues.filter((issue) => !/employment type is not eligible/i.test(issue))
    ).filter((issue) => issue !== 'RSA PIN is not on file' && issue !== 'PFA provider is not assigned');
    const statutoryIssues = stipendEmployee
      ? funds.issues.filter((issue) => !/monthly payroll amount is missing|no statutory fund eligibility/i.test(issue))
      : funds.issues;

    const issues = [
      ...amounts.grossPay <= 0 ? ['Gross pay is missing'] : [],
      ...!employee.setupAssignedToPayroll ? ['Payroll setup is not assigned'] : [],
      ...!compact(employee.payrollGroup) ? ['Payroll group is missing'] : [],
      ...!compact(employee.payCurrency) ? ['Pay currency is missing'] : [],
      ...!activeStatus(employee.status) ? ['Employee is not payroll active'] : [],
      ...dailyRateEmployee && !timesheet && amounts.grossPay <= 0 ? ['Approved timesheet hours are not available for daily-rate payroll'] : [],
      ...pensionIssues.map((issue) => `Pension: ${issue}`),
      ...statutoryIssues.map((issue) => `Statutory: ${issue}`),
      ...loans.flatMap((loan) => loan.issues.filter((issue) => issue !== 'Loan is not approved for payroll recovery').map((issue) => `Loan: ${issue}`)),
      ...deductionRatio > 45 ? ['Deduction ratio exceeds 45% control threshold'] : [],
      ...netPay <= 0 && amounts.grossPay > 0 ? ['Net pay is zero after deductions'] : [],
      ...!skipSageVarianceCheck(employee, dailyRateEmployee, toleranceMode, enterpriseSourceActive) && !sageActual ? ['Sage period comparison unavailable'] : [],
      ...!skipSageVarianceCheck(employee, dailyRateEmployee, toleranceMode, enterpriseSourceActive) && grossVariance !== null && Math.abs(grossVariance) > 1 ? [`Sage gross variance ${grossVariance}`] : [],
      ...!skipSageVarianceCheck(employee, dailyRateEmployee, toleranceMode, enterpriseSourceActive) && netVariance !== null && Math.abs(netVariance) > 1 ? [`Sage net variance ${netVariance}`] : [],
    ];

    const { blocking, deferred } = partitionPayrollIssues(issues, toleranceMode);
    const status = statusFromIssues(blocking);
    const readinessStatus = computePayrollReadinessStatus(employee, {
      dailyRateEmployee,
      timesheet,
      grossPay: amounts.grossPay,
      ratePerDay: rates.ratePerDay,
      ratePerHour: rates.ratePerHour,
    });
    const riskSeverity: 'High' | 'Medium' | 'Low' = blocking.some((issue) => /not payroll active|Gross pay is missing|Payroll setup/.test(issue))
      ? 'High'
      : blocking.length
        ? 'Medium'
        : 'Low';

    return {
      recordKey: `${requestedPeriod}-${employee.employeeDbId || 'row'}-${employee.employeeId || employee.employeeCode || 'employee'}-${index}`,
      employeeId: employee.employeeId,
      employeeCode: employee.employeeCode,
      fullName: employee.fullName,
      department: employee.department,
      businessUnit: employee.businessUnit,
      location: employee.location,
      jobTitle: employee.jobTitle,
      employmentType: employee.employmentType,
      employmentStatus: employee.status,
      payrollGroup: employee.payrollGroup || 'Unassigned',
      salaryGrade: dailyRateEmployee ? (rates.ratePerDay > 0 ? 'Daily Rate' : 'Zero Daily Rate') : employee.salaryGrade || employee.jobGrade || 'Unassigned',
      payCurrency: resolvePayCurrency({
        payCurrency: employee.payCurrency,
        payrollGroup: employee.payrollGroup,
        salaryGrade: employee.salaryGrade,
        jobGrade: employee.jobGrade,
        businessUnit: employee.businessUnit,
      }),
      paymentRun: employee.paymentRun || 'Monthly',
      basePay: amounts.basePay,
      allowances: amounts.allowances,
      grossPay: amounts.grossPay,
      periodPackageGross: amounts.periodPackageGross ?? amounts.grossPay,
      taxablePay: amounts.taxablePay,
      nonTaxablePay: amounts.nonTaxablePay,
      earningProfile: amounts.profileName,
      earningProfileId: amounts.profileId,
      paye: roundMoney(paye),
      pensionEmployee: roundMoney(employeePension),
      pensionEmployer: roundMoney(employerPension),
      statutoryEmployee: roundMoney(statutoryEmployeeDeductions),
      statutoryEmployer: roundMoney(employerStatutory),
      loanRecovery: roundMoney(loanRecovery),
      otherDeductions,
      totalDeductions,
      netPay,
      employerCost,
      deductionRatio,
      timesheetDaysWorked: timesheet?.daysWorked ?? null,
      timesheetBookedHours: timesheet?.bookedHours ?? null,
      sageActual: sageActual
        ? {
            employeeCode: sageActual.employeeCode,
            directoryEmployeeCode: sageActual.directoryEmployeeCode,
            employeePayPeriodId: sageActual.employeePayPeriodId,
            lastCalcDate: sageActual.lastCalcDate ? String(sageActual.lastCalcDate) : null,
            grossPay: roundMoney(Number(sageActual.grossPay || 0)),
            taxablePay: roundMoney(Number(sageActual.taxablePay || 0)),
            paye: roundMoney(Number(sageActual.paye || 0)),
            pensionEmployee: roundMoney(Number(sageActual.pensionEmployee || 0)),
            totalDeductions: roundMoney(Number(sageActual.totalDeductions || 0)),
            netPay: roundMoney(Number(sageActual.netPay || 0)),
          }
        : null,
      discrepancies: {
        status: grossVariance === null ? 'Missing Sage' : varianceStatus(grossVariance),
        grossVariance,
        netVariance,
        deductionVariance,
      },
      status,
      readinessStatus,
      issues: blocking,
      payrollStatus: status,
      riskSeverity,
      exceptionCount: blocking.length,
      exceptions: blocking,
      deferredWarnings: deferred,
      deductions: totalDeductions,
      pension: roundMoney(employeePension),
      isDailyRate: dailyRateEmployee,
      ratePerDay: rates.ratePerDay || null,
      ratePerHour: rates.ratePerHour || null,
      hoursPerDay: rates.hoursPerDay,
      bankName: employee.bankName,
      accountNo: employee.accountNo,
      accountName: employee.accountName,
      bankCode: withNormalizedBankCodes({
        bankName: employee.bankName,
        bankCode: employee.bankCode,
        branchCode: employee.branchCode,
      }).bankCode,
      branchName: employee.branchName,
      branchCode: withNormalizedBankCodes({
        bankName: employee.bankName,
        bankCode: employee.bankCode,
        branchCode: employee.branchCode,
      }).branchCode,
      sortCode: normalizeBankSortCode({
        bankName: employee.bankName,
        branchCode: employee.branchCode,
        bankCode: employee.bankCode,
      }),
      setupAssignedToPayroll: Boolean(employee.setupAssignedToPayroll),
      nhfApplicable: nhf > 0,
      salaryStructure: dailyRateEmployee ? 'Daily Rate' : employee.salaryGrade || employee.jobGrade || 'Unassigned',
      earningLines: (amounts.paidEarningLines || amounts.earningLines).map((line) => ({ ...line, amount: roundMoney(line.amount) })),
      annualBenefitLines: amounts.annualBenefitLines.map((line) => ({ ...line, amount: roundMoney(line.amount) })),
      deductionLines: [
        { code: 'PAYE', label: 'PAYE', amount: roundMoney(paye) },
        { code: 'PENSION_EE', label: 'Pension', amount: roundMoney(employeePension) },
        { code: 'NHF', label: 'NHF', amount: roundMoney(nhf) },
        { code: 'LOAN', label: 'Loan Recovery', amount: roundMoney(loanRecovery) },
        { code: 'SNR_UNION', label: 'Union Dues', amount: roundMoney(unionDues) },
        { code: 'OTHER', label: 'Other Deductions', amount: roundMoney(otherStatutory) },
      ].filter((line) => line.amount > 0),
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
      exceptionCount: sum.exceptionCount + record.exceptionCount,
      deferredExceptionCount: sum.deferredExceptionCount + record.deferredWarnings.length,
      sageGrossPay: sum.sageGrossPay + Number(record.sageActual?.grossPay || 0),
      sageNetPay: sum.sageNetPay + Number(record.sageActual?.netPay || 0),
      grossVariance: sum.grossVariance + Number(record.discrepancies.grossVariance || 0),
      netVariance: sum.netVariance + Number(record.discrepancies.netVariance || 0),
      discrepancyCount: sum.discrepancyCount + (record.discrepancies.status === 'Variance' || record.discrepancies.status === 'Missing Sage' ? 1 : 0),
    }),
    {
      basePay: 0,
      allowances: 0,
      grossPay: 0,
      paye: 0,
      pensionEmployee: 0,
      pensionEmployer: 0,
      statutoryEmployee: 0,
      statutoryEmployer: 0,
      loanRecovery: 0,
      totalDeductions: 0,
      netPay: 0,
      employerCost: 0,
      exceptionCount: 0,
      deferredExceptionCount: 0,
      sageGrossPay: 0,
      sageNetPay: 0,
      grossVariance: 0,
      netVariance: 0,
      discrepancyCount: 0,
    },
  );

  const ready = records.filter((record) => record.status === 'Ready');
  const review = records.filter((record) => record.status === 'Review');
  const blocked = records.filter((record) => record.status === 'Blocked');
  const eligible = records.filter((record) => !['Terminated', 'Resigned', 'Retired', 'Inactive'].includes(record.employmentStatus));
  const readiness = summarizePayrollReadiness(records);

  const summary: PayrollCalculationSummary = {
    employees: records.length,
    payrollEligible: eligible.length,
    ready: ready.length,
    review: review.length,
    blocked: blocked.length,
    blockedEmployees: blocked.length,
    readyEmployees: ready.length,
    reviewEmployees: review.length,
    readinessReadyEmployees: readiness.readinessReadyEmployees,
    readinessAwaitingTimesheetEmployees: readiness.readinessAwaitingTimesheetEmployees,
    readinessReviewEmployees: readiness.readinessReviewEmployees,
    readinessBlockedEmployees: readiness.readinessBlockedEmployees,
    basePay: roundMoney(totals.basePay),
    allowances: roundMoney(totals.allowances),
    grossPay: roundMoney(totals.grossPay),
    totalDeductions: roundMoney(totals.totalDeductions),
    deductions: roundMoney(totals.totalDeductions),
    netPay: roundMoney(totals.netPay),
    employerCost: roundMoney(totals.employerCost),
    sageGrossPay: roundMoney(totals.sageGrossPay),
    sageNetPay: roundMoney(totals.sageNetPay),
    grossVariance: roundMoney(totals.grossVariance),
    netVariance: roundMoney(totals.netVariance),
    discrepancyCount: totals.discrepancyCount,
    exceptionCount: totals.exceptionCount,
    deferredExceptionCount: totals.deferredExceptionCount,
    averageDeductionRatio: totals.grossPay ? roundMoney((totals.totalDeductions / totals.grossPay) * 100) : 0,
    payrollCoveragePct: records.length
      ? Math.round((records.filter((record) => record.setupAssignedToPayroll).length / records.length) * 1000) / 10
      : 0,
  };

  const component = (componentId: string, label: string, amount: number, tone: PayrollTone, payer: 'Employee' | 'Employer' | 'Both') =>
    ({ id: componentId, label, amount: roundMoney(amount), tone, payer });

  return {
    generatedAt: new Date().toISOString(),
    source: enterprisePayrollSourceLabel(requestedPeriod),
    dataSource: payrollDataSourceInfo(employeeSource),
    period: requestedPeriod,
    periodLabel: payrollPeriodLabel(requestedPeriod),
    configurations: {
      tax: { id: taxVersion.id, name: taxVersion.name, effectiveFrom: taxVersion.effectiveFrom },
      pension: { id: pensionVersion.id, name: pensionVersion.name, effectiveFrom: pensionVersion.effectiveFrom },
      statutoryFunds: { id: fundsVersion.id, name: fundsVersion.name, effectiveFrom: fundsVersion.effectiveFrom },
      loans: { id: loansVersion.id, name: loansVersion.name, effectiveFrom: loansVersion.effectiveFrom },
    },
    summary,
    records,
    breakdowns: {
      byPayrollGroup: groupPayrollCalculationRecords(records, 'payrollGroup'),
      byDepartment: groupPayrollCalculationRecords(records, 'department').slice(0, 12),
      byEmploymentType: groupPayrollCalculationRecords(records, 'employmentType'),
      byComponent: [
        component('paye', 'PAYE', totals.paye, 'violet', 'Employee'),
        component('pension-employee', 'Employee Pension', totals.pensionEmployee, 'blue', 'Employee'),
        component('statutory-employee', 'NHF/Statutory Employee', totals.statutoryEmployee, 'cyan', 'Employee'),
        component('loan', 'Loan Recovery', totals.loanRecovery, 'amber', 'Employee'),
        component('pension-employer', 'Employer Pension', totals.pensionEmployer, 'green', 'Employer'),
        component('statutory-employer', 'NSITF/ITF Employer', totals.statutoryEmployer, 'slate', 'Employer'),
      ],
    },
    controls: [
      { id: 'employees', label: 'Employee Source', status: employeeSource.databaseAvailable ? 'Passed' : 'Review', detail: `${employeeSource.employees.length} employees loaded from ${employeeSource.source}`, tone: employeeSource.databaseAvailable ? 'green' : 'amber' },
      { id: 'config', label: 'Configuration Versions', status: 'Passed', detail: 'PAYE, pension, statutory funds, and loan policies resolved by active effective versions.', tone: 'blue' },
      { id: 'timesheets', label: 'Timesheet Payroll Feed', status: timesheetHours.size > 0 ? 'Passed' : toleranceMode ? 'Deferred' : 'Review', detail: timesheetHours.size > 0 ? `${timesheetHours.size} daily-rate timesheet records loaded.` : toleranceMode ? 'Timesheet gaps deferred to June remediation. Salary fallback used where available.' : 'No approved timesheet payroll update found for this period.', tone: timesheetHours.size > 0 ? 'green' : toleranceMode ? 'blue' : 'amber' },
      { id: 'exceptions', label: 'Exception Gate', status: summary.blocked > 0 ? 'Blocked' : summary.review > 0 ? 'Review' : 'Passed', detail: toleranceMode ? `${summary.blocked} blocked, ${summary.review} review. ${summary.deferredExceptionCount} items deferred to June.` : `${summary.blocked} blocked, ${summary.review} review, ${summary.exceptionCount} total flags.`, tone: summary.blocked > 0 ? 'red' : summary.review > 0 ? 'amber' : 'green' },
      ...(enterpriseSourceActive
        ? [{ id: 'enterprise-source', label: 'Authoritative Payroll Source', status: 'DLE_Enterprise', detail: `${employeeSource.employees.length} employees calculated from DLE_Enterprise HRIS setup, timesheets, and payroll rules. Sage is not used for this period.`, tone: 'green' as PayrollTone }]
        : [{ id: 'sage-discrepancy', label: 'Sage Comparison', status: toleranceMode ? 'Deferred' : summary.discrepancyCount > 0 ? 'Review' : 'Matched', detail: toleranceMode ? `${summary.discrepancyCount} Sage variances deferred to cutover reconciliation.` : `${summary.discrepancyCount} generated-vs-Sage discrepancy records. Gross variance ${roundMoney(summary.grossVariance)}.`, tone: (toleranceMode ? 'blue' : summary.discrepancyCount > 0 ? 'amber' : 'green') as PayrollTone }]),
      ...(toleranceMode && !enterpriseSourceActive ? [{ id: 'tolerance', label: 'Cutover Tolerance', status: 'Active', detail: 'Timesheet, pension setup, and Sage variance checks are deferred. Only blocking master-data issues stop payroll.', tone: 'blue' as PayrollTone }] : []),
    ],
    toleranceMode,
    enterpriseSourceActive,
  };
};

export const maskPayrollCalculationRecords = (records: PayrollCalculationRecord[]) =>
  records.map((record) => ({
    ...record,
    basePay: null as unknown as number,
    allowances: null as unknown as number,
    grossPay: null as unknown as number,
    paye: null as unknown as number,
    pensionEmployee: null as unknown as number,
    pensionEmployer: null as unknown as number,
    statutoryEmployee: null as unknown as number,
    statutoryEmployer: null as unknown as number,
    loanRecovery: null as unknown as number,
    otherDeductions: null as unknown as number,
    totalDeductions: null as unknown as number,
    netPay: null as unknown as number,
    employerCost: null as unknown as number,
    deductionRatio: null as unknown as number,
    deductions: null as unknown as number,
    pension: null as unknown as number,
    taxablePay: null as unknown as number,
    nonTaxablePay: null as unknown as number,
    sageActual: null,
    discrepancies: { status: record.discrepancies.status, grossVariance: null, netVariance: null, deductionVariance: null },
    earningLines: record.earningLines.map((line) => ({ ...line, amount: null })),
    annualBenefitLines: record.annualBenefitLines.map((line) => ({ ...line, amount: null })),
    deductionLines: record.deductionLines.map((line) => ({ ...line, amount: null })),
  }));
