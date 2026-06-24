import type { DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import { payrollDataSourceInfo, readPayrollEmployees } from '@/lib/payroll-employee-source';
import { calculatePayrollEarnings, resolvePayrollEarningProfile } from '@/lib/payroll-earnings-engine';
import { isDailyRatePayrollEmployee } from '@/lib/payroll-employee-classification';
import { activeTaxVersion, calculatePayrollTax, payrollInputFromEmployee, readPayrollTaxConfig } from '@/lib/payroll-tax-engine';
import { activePensionVersion, calculatePension, pensionInputFromEmployee, readPayrollPensionConfig } from '@/lib/payroll-pension-engine';
import { activeStatutoryFundsVersion, calculateStatutoryFunds, readStatutoryFundsConfig, statutoryFundInputFromEmployee } from '@/lib/payroll-statutory-funds-engine';
import { activeLoansVersion, calculateLoanRecovery, loanInputsFromApplications, readPayrollLoanApplications, readPayrollLoansConfig } from '@/lib/payroll-loans-engine';
import { syncSageLeaveAllowanceEvents } from '@/lib/payroll-leave-allowance-store';
import { normalizePayrollMatchKey, readSagePayrollPeriodTotals } from '@/lib/sage-people-payroll-store';
import { buildTimesheetHoursMapForPayrollPeriod } from '@/lib/timesheet-entry-store';
import { payrollPeriodLabel } from '@/lib/payroll-period-store';
import { computePayrollReadinessStatus, summarizePayrollReadiness, type PayrollReadinessStatus } from '@/lib/payroll-readiness';
import { partitionPayrollIssues, payrollToleranceActive } from '@/lib/payroll-tolerance';

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
};

const roundMoney = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
const compact = (value: unknown) => String(value || '').trim();
const activeStatus = (value: unknown) => !compact(value).toLowerCase().match(/terminated|resigned|retired|inactive|deceased/);

const inputOnlyEmployee = (employee: DleEmployeeDirectoryRow): DleEmployeeDirectoryRow => ({
  ...employee,
  sagePayrollEarnings: [],
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

const isDailyRateEmployee = (employee: DleEmployeeDirectoryRow, profileId?: string) =>
  isDailyRatePayrollEmployee(employee, profileId);

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

const applyDailyRateFromTimesheets = (
  employee: DleEmployeeDirectoryRow,
  amounts: ReturnType<typeof calculatePayrollEarnings>,
  timesheetHours: Map<string, { daysWorked: number; bookedHours: number }>,
) => {
  const profileId = resolvePayrollEarningProfile(employee);
  if (!isDailyRateEmployee(employee, profileId)) return amounts;
  const keys = [employee.employeeId, employee.employeeCode, employee.id, normalizePayrollMatchKey(employee.employeeId), normalizePayrollMatchKey(employee.employeeCode)]
    .map((key) => compact(key))
    .filter(Boolean);
  const timesheet = keys.map((key) => timesheetHours.get(key) || timesheetHours.get(normalizePayrollMatchKey(key))).find(Boolean);
  const rates = dailyRateValues(employee, true);
  if (!timesheet || (timesheet.daysWorked <= 0 && timesheet.bookedHours <= 0)) return amounts;
  const grossPay = rates.ratePerDay > 0 && timesheet.daysWorked > 0
    ? roundMoney(rates.ratePerDay * timesheet.daysWorked)
    : rates.ratePerHour > 0 && timesheet.bookedHours > 0
      ? roundMoney(rates.ratePerHour * timesheet.bookedHours)
      : amounts.grossPay;
  return {
    ...amounts,
    grossPay,
    basePay: grossPay,
    allowances: 0,
    taxablePay: grossPay,
    nonTaxablePay: 0,
    profileId: 'contract-day-rate' as const,
    profileName: 'Daily Rate (Timesheet Driven)',
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

export const calculatePayrollForPeriod = async (requestedPeriod: string): Promise<PayrollCalculationResult> => {
  const toleranceMode = payrollToleranceActive(requestedPeriod);
  const [
    employeeSource,
    taxConfig,
    pensionConfig,
    fundsConfig,
    loansConfig,
    loanApplications,
    sagePeriodTotals,
    timesheetHours,
  ] = await Promise.all([
    readPayrollEmployees(),
    readPayrollTaxConfig(),
    readPayrollPensionConfig(),
    readStatutoryFundsConfig(),
    readPayrollLoansConfig(),
    readPayrollLoanApplications(),
    readSagePayrollPeriodTotals(requestedPeriod).catch(() => []),
    readApprovedTimesheetHoursForPayrollPeriod(requestedPeriod),
  ]);

  const taxVersion = activeTaxVersion(taxConfig);
  const pensionVersion = activePensionVersion(pensionConfig);
  const fundsVersion = activeStatutoryFundsVersion(fundsConfig);
  const loansVersion = activeLoansVersion(loansConfig);
  if (!taxVersion || !pensionVersion || !fundsVersion || !loansVersion) {
    throw new Error('One or more active payroll configuration versions are missing.');
  }

  try {
    await syncSageLeaveAllowanceEvents();
  } catch (error) {
    console.warn('[PayrollCalculation] Leave allowance sync skipped:', error instanceof Error ? error.message : error);
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

  const calculationOptions = { period: requestedPeriod, includePeriodAdjustments: true, ignoreSagePayslipLines: true };

  const records: PayrollCalculationRecord[] = employeeSource.employees.map((employee, index) => {
    const calculationEmployee = inputOnlyEmployee(employee);
    const baseAmounts = calculatePayrollEarnings(calculationEmployee, calculationOptions);
    const amounts = applyDailyRateFromTimesheets(employee, baseAmounts, timesheetHours);
    const tax = calculatePayrollTax(payrollInputFromEmployee(calculationEmployee, calculationOptions), taxVersion);
    const pension = calculatePension(pensionInputFromEmployee(calculationEmployee, calculationOptions), pensionVersion);
    const funds = calculateStatutoryFunds(statutoryFundInputFromEmployee(calculationEmployee, employeeSource.employees.length, calculationOptions), fundsVersion);
    const loans = (loanInputs.get(employee.employeeId) || []).map((loanInput) => calculateLoanRecovery(loanInput, loansVersion));
    const sageActual = [employee.employeeCode, employee.employeeId, employee.id, employee.fullName]
      .map(normalizePayrollMatchKey)
      .map((key) => sageByKey.get(key))
      .find(Boolean) || null;
    const paye = tax.monthlyPaye;
    const employeePension = pension.employeeContribution;
    const statutoryEmployee = funds.employeeDeductions;
    const loanRecovery = roundMoney(loans.reduce((sum, loan) => sum + loan.payrollRecovery, 0));
    const taxComponentMonthly = (componentId: string) => (tax.statutoryItems.find((item) => item.id === componentId)?.amount || 0) / 12;
    const nhf = taxComponentMonthly('nhf');
    const unionDues = taxComponentMonthly('union-dues');
    const otherStatutory = taxComponentMonthly('other-statutory');
    const otherDeductions = roundMoney(unionDues + otherStatutory);
    const totalDeductions = roundMoney(paye + employeePension + statutoryEmployee + loanRecovery + nhf + otherDeductions);
    const netPay = roundMoney(Math.max(0, amounts.grossPay - totalDeductions));
    const grossVariance = sageActual ? moneyVariance(sageActual.grossPay, amounts.grossPay) : null;
    const netVariance = sageActual ? moneyVariance(sageActual.netPay, netPay) : null;
    const deductionVariance = sageActual ? moneyVariance(sageActual.totalDeductions, totalDeductions) : null;
    const employerPension = pension.employerContribution;
    const employerStatutory = funds.employerCosts;
    const employerCost = roundMoney(amounts.grossPay + employerPension + employerStatutory);
    const deductionRatio = amounts.grossPay > 0 ? roundMoney((totalDeductions / amounts.grossPay) * 100) : 0;
    const dailyRateEmployee = isDailyRateEmployee(employee, amounts.profileId);
    const rates = dailyRateValues(employee, dailyRateEmployee);
    const timesheet = [employee.employeeId, employee.employeeCode].map((key) => timesheetHours.get(compact(key)) || timesheetHours.get(normalizePayrollMatchKey(key))).find(Boolean) || null;

    const issues = [
      ...amounts.grossPay <= 0 ? ['Gross pay is missing'] : [],
      ...!employee.setupAssignedToPayroll ? ['Payroll setup is not assigned'] : [],
      ...!compact(employee.payrollGroup) ? ['Payroll group is missing'] : [],
      ...!compact(employee.payCurrency) ? ['Pay currency is missing'] : [],
      ...!activeStatus(employee.status) ? ['Employee is not payroll active'] : [],
      ...dailyRateEmployee && !timesheet && amounts.grossPay <= 0 ? ['Approved timesheet hours are not available for daily-rate payroll'] : [],
      ...(!dailyRateEmployee
        ? pension.issues
        : pension.issues.filter((issue) => !/employment type is not eligible/i.test(issue))
      )
        .filter((issue) => issue !== 'RSA PIN is not on file' && issue !== 'PFA provider is not assigned')
        .map((issue) => `Pension: ${issue}`),
      ...funds.issues.map((issue) => `Statutory: ${issue}`),
      ...loans.flatMap((loan) => loan.issues.filter((issue) => issue !== 'Loan is not approved for payroll recovery').map((issue) => `Loan: ${issue}`)),
      ...deductionRatio > 45 ? ['Deduction ratio exceeds 45% control threshold'] : [],
      ...netPay <= 0 && amounts.grossPay > 0 ? ['Net pay is zero after deductions'] : [],
      ...!toleranceMode && !sageActual ? ['Sage period comparison unavailable'] : [],
      ...!toleranceMode && grossVariance !== null && Math.abs(grossVariance) > 1 ? [`Sage gross variance ${grossVariance}`] : [],
      ...!toleranceMode && netVariance !== null && Math.abs(netVariance) > 1 ? [`Sage net variance ${netVariance}`] : [],
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
      bankCode: employee.bankCode,
      branchName: employee.branchName,
      branchCode: employee.branchCode,
      sortCode: employee.branchCode || employee.bankCode || '',
      setupAssignedToPayroll: Boolean(employee.setupAssignedToPayroll),
      nhfApplicable: nhf > 0,
      salaryStructure: dailyRateEmployee ? 'Daily Rate' : employee.salaryGrade || employee.jobGrade || 'Unassigned',
      earningLines: amounts.earningLines.map((line) => ({ ...line, amount: roundMoney(line.amount) })),
      annualBenefitLines: amounts.annualBenefitLines.map((line) => ({ ...line, amount: roundMoney(line.amount) })),
      deductionLines: [
        { code: 'PAYE', label: 'PAYE', amount: roundMoney(paye) },
        { code: 'PENSION_EE', label: 'Pension', amount: roundMoney(employeePension) },
        { code: 'NHF', label: 'NHF', amount: roundMoney(nhf) },
        { code: 'LOAN', label: 'Loan Recovery', amount: roundMoney(loanRecovery) },
        { code: 'OTHER', label: 'Other Deductions', amount: roundMoney(otherDeductions) },
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
    source: 'DLE unified payroll calculation engine',
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
      { id: 'sage-discrepancy', label: 'Sage Comparison', status: toleranceMode ? 'Deferred' : summary.discrepancyCount > 0 ? 'Review' : 'Matched', detail: toleranceMode ? `${summary.discrepancyCount} Sage variances deferred to June reconciliation.` : `${summary.discrepancyCount} generated-vs-Sage discrepancy records. Gross variance ${roundMoney(summary.grossVariance)}.`, tone: toleranceMode ? 'blue' : summary.discrepancyCount > 0 ? 'amber' : 'green' },
      ...(toleranceMode ? [{ id: 'tolerance', label: 'May Cutover Tolerance', status: 'Active', detail: 'Timesheet, pension setup, and Sage variance checks are deferred. Only blocking master-data issues stop payroll.', tone: 'blue' as PayrollTone }] : []),
    ],
    toleranceMode,
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
