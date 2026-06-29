import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { payrollDataSourceInfo, readPayrollEmployees } from '@/lib/payroll-employee-source';
import { calculateContractDayRateEarnings, calculatePayrollEarnings, calculatePermanentUnionDues, type PayrollEarningsResult } from '@/lib/payroll-earnings-engine';
import { activeTaxVersion, calculatePayrollTax, payrollInputFromEmployee, readPayrollTaxConfig } from '@/lib/payroll-tax-engine';
import { activePensionVersion, calculatePension, pensionInputFromEmployee, readPayrollPensionConfig } from '@/lib/payroll-pension-engine';
import { activeStatutoryFundsVersion, calculateStatutoryFunds, readStatutoryFundsConfig, statutoryFundInputFromEmployee } from '@/lib/payroll-statutory-funds-engine';
import { activeLoansVersion, calculateLoanRecovery, loanInputsFromApplications, readPayrollLoanApplications, readPayrollLoansConfig } from '@/lib/payroll-loans-engine';
import type { DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import { enterprisePayrollSourceLabel, isEnterprisePayrollPeriod } from '@/lib/payroll-enterprise-source';
import { calculatePayrollForPeriod } from '@/lib/payroll-calculation-service';
import { invalidateHrisEmployeeCaches } from '@/lib/hris-employee-cache';
import { capturePayrollSnapshot, ensurePayrollRun, getPayrollRunForPeriod, savePayrollRun } from '@/lib/payroll-run-store';
import { syncSagePeriodEarningAdjustments } from '@/lib/payroll-period-earning-adjustments-store';
import { syncLeaveAllowanceEventsForPayroll } from '@/lib/payroll-leave-allowance-store';
import { activePayrollPeriod } from '@/lib/payroll-periods';
import { calculateTimesheetPeriod, readTimesheetPayrollUpdates, readTimesheetPeriods } from '@/lib/timesheet-entry-store';
import { normalizePayrollMatchKey } from '@/lib/sage-people-payroll-store';
import { payslipIdentityMap, syncPayslipIdentitiesFromSage, type PayslipEmployeeIdentity } from '@/lib/payroll-payslip-identity-store';
import { resolvePayCurrency } from '@/lib/payroll-currency';
import { buildExcelHtml, excelMimeType } from '@/lib/excel-export';

type Role = 'Super Admin' | 'HR Director' | 'HR Manager' | 'Payroll Officer' | 'Finance Controller' | 'Executive Management' | 'Auditor' | 'Employee';
type PayslipStatus = 'Ready' | 'Review' | 'Blocked';
type DeliveryStatus = 'Draft' | 'Generated' | 'Released' | 'Withheld';

type PayslipBatch = {
  id: string;
  period: string;
  periodLabel: string;
  generatedAt: string;
  generatedBy: Role;
  employeeCount: number;
  releasedCount: number;
  withheldCount: number;
  netPay: number;
  grossPay: number;
  status: 'Generated' | 'Released' | 'Partial';
  audit: Array<{ at: string; actor: Role; action: string; note?: string }>;
};

const ok = <T,>(data: T) => NextResponse.json({ status: 'success', data });
const err = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });
const compact = (value: unknown) => String(value || '').trim();
const roundMoney = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
const num = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};
import { isDailyRatePayrollEmployee } from '@/lib/payroll-employee-classification';

const activeEmployee = (employee: DleEmployeeDirectoryRow) => !compact(employee.status).toLowerCase().match(/terminated|resigned|retired|inactive|deceased/);
const isDailyRateEmployee = (employee: DleEmployeeDirectoryRow, earningProfileId?: string) =>
  isDailyRatePayrollEmployee(employee, earningProfileId);
const isPermanentEmployee = (employee: DleEmployeeDirectoryRow) => {
  const text = [employee.employmentType, employee.employeeCategory, employee.staffCategory, employee.payrollGroup]
    .map(compact)
    .join(' ')
    .toLowerCase();
  return text.includes('permanent') && !/contract|lumpsum|lump sum|daily|day rate|temporary|nysc|intern|industrial training/.test(text);
};
const requiredPermanentIdentityIssues = (employee: DleEmployeeDirectoryRow, identity?: PayslipEmployeeIdentity, options?: { pensionEmployee?: number }) => {
  if (!isPermanentEmployee(employee)) return [];
  const employeeAny = employee as Record<string, unknown>;
  const hasPensionSetup = compact(identity?.pensionProvider || employee.pensionProvider) || Number(options?.pensionEmployee || 0) > 0;
  return [
    ...!compact(identity?.bankName || employee.bankName) ? ['Permanent employee bank name is missing'] : [],
    ...!compact(identity?.accountNo || employee.accountNo || employeeAny.accountNumber) ? ['Permanent employee account number is missing'] : [],
    ...!hasPensionSetup ? ['Permanent employee pension fund administrator is missing'] : [],
    ...!compact(identity?.taxIdentificationNumber || employee.taxIdentificationNumber || employeeAny.taxNo) ? ['Permanent employee tax number is missing'] : [],
  ];
};

const resolveDashboardRoot = () => {
  const cwd = process.cwd();
  const dashboardSuffix = path.join('apps', 'dashboard');
  return cwd.endsWith(dashboardSuffix) ? cwd : path.join(cwd, dashboardSuffix);
};

const resolveRuntimeDataDirs = () => {
  const cwd = process.cwd();
  const dirs = [
    process.env.DLE_PAYSLIP_BATCHES_PATH ? path.dirname(path.resolve(process.env.DLE_PAYSLIP_BATCHES_PATH)) : '',
    process.env.DLE_HRIS_DATA_DIR ? path.resolve(process.env.DLE_HRIS_DATA_DIR) : '',
    path.join(cwd, 'data', 'hris'),
    cwd.endsWith(`${path.sep}site`) ? path.join(path.dirname(cwd), 'runtime-data', 'hris') : '',
    path.join(resolveDashboardRoot(), 'data', 'hris'),
  ].filter(Boolean);
  return Array.from(new Set(dirs));
};

const BATCH_PATHS = resolveRuntimeDataDirs().map((dir) => path.join(dir, 'payslip-generation-batches.json'));

const getRole = (request: Request): Role => {
  const value = request.headers.get('x-hris-role');
  const roles: Role[] = ['Super Admin', 'HR Director', 'HR Manager', 'Payroll Officer', 'Finance Controller', 'Executive Management', 'Auditor', 'Employee'];
  return roles.includes(value as Role) ? (value as Role) : 'Payroll Officer';
};

const permissions = (role: Role) => ({
  canViewMoney: ['Super Admin', 'HR Director', 'HR Manager', 'Payroll Officer', 'Finance Controller', 'Executive Management', 'Auditor'].includes(role),
  canGenerate: ['Super Admin', 'Payroll Officer', 'Finance Controller', 'HR Director'].includes(role),
  canRelease: ['Super Admin', 'Finance Controller', 'HR Director'].includes(role),
  canExport: role !== 'Employee',
});

const monthPeriod = activePayrollPeriod;

const periodLabel = (period: string) => {
  const [year, month] = period.split('-').map(Number);
  return new Date(year || new Date().getFullYear(), (month || 1) - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
};

const periodStartDate = (period: string) => {
  const [year, month] = period.split('-').map(Number);
  return `${year || new Date().getFullYear()}-${String(month || 1).padStart(2, '0')}-01`;
};

const periodEndDate = (period: string) => {
  const [year, month] = period.split('-').map(Number);
  const end = new Date(year || new Date().getFullYear(), month || 1, 0);
  return `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
};

const readBatches = async (): Promise<PayslipBatch[]> => {
  for (const batchPath of BATCH_PATHS) {
    try {
      const parsed = JSON.parse(await readFile(batchPath, 'utf8'));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      // Try the next runtime data location.
    }
  }
  return [];
};

const writeBatches = async (batches: PayslipBatch[]) => {
  let lastError: unknown = null;
  for (const batchPath of BATCH_PATHS) {
    try {
      await mkdir(path.dirname(batchPath), { recursive: true });
      await writeFile(batchPath, JSON.stringify(batches, null, 2), 'utf8');
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Unable to write payslip generation batch file.');
};

const statusFrom = (issues: string[]): PayslipStatus => {
  if (issues.some((issue) => /missing|not payroll active|zero/i.test(issue))) return 'Blocked';
  return issues.length ? 'Review' : 'Ready';
};

type DailyAttendanceSummary = {
  daysWorked: number;
  attendanceHours: number;
  bookedHours: number;
  idleHours: number;
};

const emptyDailyAttendance = (): DailyAttendanceSummary => ({ daysWorked: 0, attendanceHours: 0, bookedHours: 0, idleHours: 0 });
const inclusiveDays = (startDate: string, endDate: string) => {
  const start = new Date(`${startDate}T00:00:00Z`).getTime();
  const end = new Date(`${endDate}T00:00:00Z`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 31;
  return Math.floor((end - start) / 86400000) + 1;
};

const buildDailyAttendanceByKey = async (period: string) => {
  const updates = await readTimesheetPayrollUpdates();
  const periodId = `per-${period}`;
  const periods = await readTimesheetPeriods();
  const timesheetPeriod = periods.find((item) => item.id === periodId) || calculateTimesheetPeriod(new Date(`${period}-15T00:00:00`));
  const maxPayableDays = inclusiveDays(timesheetPeriod.startDate, timesheetPeriod.endDate);
  const byKey = new Map<string, DailyAttendanceSummary>();

  const add = (key: string, attendance: DailyAttendanceSummary) => {
    if (!key) return;
    const current = byKey.get(key) || emptyDailyAttendance();
    current.daysWorked = Math.min(maxPayableDays, current.daysWorked + attendance.daysWorked);
    current.attendanceHours += attendance.attendanceHours;
    current.bookedHours += attendance.bookedHours;
    current.idleHours += attendance.idleHours;
    byKey.set(key, current);
  };

  updates
    .filter((update) => update.periodId === periodId)
    .forEach((update) => {
      update.employeeAttendance.forEach((employee) => {
        const attendance = {
          daysWorked: num(employee.daysWorked),
          attendanceHours: num(employee.attendanceHours),
          bookedHours: num(employee.bookedHours),
          idleHours: num(employee.idleHours),
        };
        [employee.employeeId, employee.employeeName].map(normalizePayrollMatchKey).forEach((key) => add(key, attendance));
      });
    });

  return byKey;
};

const dailyAttendanceForEmployee = (employee: DleEmployeeDirectoryRow, byKey: Map<string, DailyAttendanceSummary>) =>
  [employee.employeeId, employee.employeeCode, employee.sourceEmployeeId, employee.fullName]
    .map(normalizePayrollMatchKey)
    .map((key) => byKey.get(key))
    .find(Boolean) || emptyDailyAttendance();

const maskAccount = (value: unknown) => {
  const raw = compact(value);
  if (!raw) return 'Not configured';
  const visible = raw.slice(-4);
  return `${'*'.repeat(Math.max(4, raw.length - 4))}${visible}`;
};

const contractDayRatePayrollResult = (input: {
  ratePerDay: number;
  daysWorked: number;
}): PayrollEarningsResult => {
  const result = calculateContractDayRateEarnings({
    ratePerDay: input.ratePerDay,
    weekdayDays: input.daysWorked,
  });
  const lines = result.earningLines.map((line) => ({
    ...line,
    percentOfGross: result.grossPay > 0 ? roundMoney(line.amount / result.grossPay) : 0,
    runFrequency: 'formula' as const,
    includeInMonthlyPayroll: true,
  }));
  const basePay = roundMoney(lines.find((line) => line.code === 'JCWEEKDAY')?.amount || 0);
  return {
    profileId: result.profileId,
    profileName: result.profileName,
    periodPackageGross: result.grossPay,
    grossPay: result.grossPay,
    basePay,
    basicPay: basePay,
    allowances: roundMoney(result.grossPay - basePay),
    taxablePay: result.taxablePay,
    nonTaxablePay: result.nonTaxablePay,
    bhtPay: basePay,
    earningLines: lines,
    annualBenefitLines: [],
    paidEarningLines: lines,
  };
};

const mergeDailySupplementalEarnings = (base: PayrollEarningsResult, source: PayrollEarningsResult): PayrollEarningsResult => {
  const baseCodes = new Set(['JCWEEKDAY', 'JCWEEKDAY_NT']);
  const supplemental = source.paidEarningLines
    .filter((line) => !baseCodes.has(compact(line.code).toUpperCase()))
    .filter((line) => roundMoney(line.amount) !== 0)
    .map((line) => ({
      ...line,
      calculation: line.calculation || 'Daily-rate supplemental earning',
      runFrequency: line.runFrequency || 'monthly',
      includeInMonthlyPayroll: line.includeInMonthlyPayroll !== false,
      amount: roundMoney(line.amount),
    }));
  if (!supplemental.length) return base;
  const paidEarningLines = [...base.paidEarningLines, ...supplemental];
  const grossPay = roundMoney(paidEarningLines.reduce((sum, line) => sum + line.amount, 0));
  const taxablePay = roundMoney(paidEarningLines.filter((line) => line.taxable).reduce((sum, line) => sum + line.amount, 0));
  const basicPay = roundMoney(base.basicPay);
  const normalizedLines = paidEarningLines.map((line) => ({
    ...line,
    percentOfGross: grossPay > 0 ? roundMoney(line.amount / grossPay) : 0,
  }));
  return {
    ...base,
    profileName: `${base.profileName} with Supplemental Components`,
    grossPay,
    basePay: basicPay,
    basicPay,
    allowances: roundMoney(grossPay - basicPay),
    taxablePay,
    nonTaxablePay: roundMoney(grossPay - taxablePay),
    earningLines: normalizedLines,
    paidEarningLines: normalizedLines,
  };
};

const buildPayload = async (request: Request, requestedPeriod = monthPeriod()) => {
  const role = getRole(request);
  const perms = permissions(role);
  const enterpriseSourceActive = isEnterprisePayrollPeriod(requestedPeriod);
  if (!enterpriseSourceActive) {
    await syncPayslipIdentitiesFromSage({ migratedBy: 'Payslip Generation' }).catch(() => undefined);
  }
  const [employeeSource, taxConfig, pensionConfig, fundsConfig, loansConfig, loanApplications, batches, dailyAttendanceByKey, identityByKey] = await Promise.all([
    readPayrollEmployees(),
    readPayrollTaxConfig(),
    readPayrollPensionConfig(),
    readStatutoryFundsConfig(),
    readPayrollLoansConfig(),
    readPayrollLoanApplications(),
    readBatches(),
    buildDailyAttendanceByKey(requestedPeriod),
    payslipIdentityMap(),
  ]);
  const taxVersion = activeTaxVersion(taxConfig);
  const pensionVersion = activePensionVersion(pensionConfig);
  const fundsVersion = activeStatutoryFundsVersion(fundsConfig);
  const loansVersion = activeLoansVersion(loansConfig);
  if (!taxVersion || !pensionVersion || !fundsVersion || !loansVersion) throw new Error('One or more payroll configuration versions are missing.');
  await syncLeaveAllowanceEventsForPayroll(requestedPeriod).catch((error) => {
    console.warn('[PayslipGeneration] Leave allowance sync skipped:', error instanceof Error ? error.message : error);
  });

  const currentBatch = batches.find((batch) => batch.period === requestedPeriod) || null;
  const loanInputs = loanInputsFromApplications(employeeSource.employees, loanApplications).reduce((map, input) => {
    const current = map.get(input.employee.employeeId) || [];
    current.push(input);
    map.set(input.employee.employeeId, current);
    return map;
  }, new Map<string, ReturnType<typeof loanInputsFromApplications>>());
  const payslips = employeeSource.employees.map((employee) => {
    const identity = [employee.employeeId, employee.employeeCode, employee.sourceEmployeeId]
      .map(normalizePayrollMatchKey)
      .map((key) => identityByKey.get(key))
      .find(Boolean);
    const standardOptions = { period: requestedPeriod, includePeriodAdjustments: true };
    const payrollEmployee = enterpriseSourceActive ? { ...employee, sagePayrollEarnings: undefined, sagePayrollDeductions: undefined, sagePayrollContributions: undefined } : employee;
    const standardAmounts = calculatePayrollEarnings(payrollEmployee, standardOptions);
    const dailyRateEmployee = isDailyRateEmployee(employee, standardAmounts.profileId);
    const ratePerDay = Number(employee.ratePerDay || 0) || (Number(employee.ratePerHour || 0) > 0 ? Number(employee.ratePerHour) * Number(employee.hoursPerDay || 8) : 0) || (dailyRateEmployee ? Number(employee.periodSalary || 0) : 0);
    const ratePerHour = Number(employee.ratePerHour || 0) || (ratePerDay > 0 ? ratePerDay / Number(employee.hoursPerDay || 8) : 0);
    const dailyAttendance = dailyRateEmployee ? dailyAttendanceForEmployee(employee, dailyAttendanceByKey) : emptyDailyAttendance();
    const dailyTimesheetAmounts = dailyRateEmployee ? mergeDailySupplementalEarnings(contractDayRatePayrollResult({ ratePerDay, daysWorked: dailyAttendance.daysWorked }), standardAmounts) : null;
    const amounts = dailyTimesheetAmounts && dailyTimesheetAmounts.grossPay > 0 ? dailyTimesheetAmounts : standardAmounts;
    const calculationEmployee = dailyRateEmployee ? { ...payrollEmployee, sagePayrollEarnings: [] } : payrollEmployee;
    const tax = calculatePayrollTax(
      payrollInputFromEmployee(calculationEmployee, standardOptions, amounts),
      taxVersion,
    );
    const pension = calculatePension(dailyRateEmployee ? { employee: calculationEmployee, monthlyBasePay: amounts.basicPay, monthlyAllowances: Math.max(0, amounts.taxablePay - amounts.basicPay) } : pensionInputFromEmployee(payrollEmployee, standardOptions), pensionVersion);
    const funds = calculateStatutoryFunds(dailyRateEmployee ? { employee: calculationEmployee, monthlyBasePay: amounts.basicPay, monthlyAllowances: amounts.allowances, organizationEmployeeCount: employeeSource.employees.length } : statutoryFundInputFromEmployee(payrollEmployee, employeeSource.employees.length, standardOptions), fundsVersion);
    const loans = (loanInputs.get(employee.employeeId) || []).map((loanInput) => calculateLoanRecovery(loanInput, loansVersion));
    const paye = roundMoney(tax.monthlyPaye);
    const pensionEmployee = roundMoney(pension.employeeContribution);
    const nhf = roundMoney((tax.statutoryItems.find((item) => item.id === 'nhf')?.amount || 0) / 12);
    const loanRecovery = roundMoney(loans.reduce((sum, loan) => sum + loan.payrollRecovery, 0));
    const taxComponentMonthly = (id: string) => (tax.statutoryItems.find((item) => item.id === id)?.amount || 0) / 12;
    const unionDues = roundMoney(taxComponentMonthly('union-dues'));
    const unionRule = calculatePermanentUnionDues(calculationEmployee, standardOptions);
    const otherStatutory = roundMoney(taxComponentMonthly('other-statutory'));
    const otherDeductions = roundMoney(unionDues + otherStatutory);
    const totalDeductions = roundMoney(paye + pensionEmployee + nhf + loanRecovery + otherDeductions);
    const netPay = roundMoney(Math.max(0, amounts.grossPay - totalDeductions));
    const issues = [
      ...amounts.grossPay <= 0 ? ['Gross pay is missing'] : [],
      ...netPay <= 0 && amounts.grossPay > 0 ? ['Net pay is zero after deductions'] : [],
      ...!employee.setupAssignedToPayroll ? ['Payroll setup is not assigned'] : [],
      ...requiredPermanentIdentityIssues(employee, identity, { pensionEmployee }),
      ...dailyRateEmployee && ratePerDay <= 0 ? ['Daily rate is missing'] : [],
      ...dailyRateEmployee && dailyAttendance.daysWorked <= 0 ? ['No payroll-ready daily timesheet found'] : [],
      ...!compact(employee.payrollGroup) ? ['Payroll group is missing'] : [],
      ...!activeEmployee(employee) ? ['Employee is not payroll active'] : [],
      ...pension.issues.filter((issue) => issue.includes('missing') || issue.includes('not payroll active')).map((issue) => `Pension: ${issue}`),
      ...funds.issues.map((issue) => `Statutory: ${issue}`),
      ...loans.flatMap((loan) => loan.issues.filter((issue) => issue.includes('missing') || issue.includes('disabled')).map((issue) => `Loan: ${issue}`)),
    ];
    const status = statusFrom(issues);
    const deliveryStatus: DeliveryStatus = currentBatch?.status === 'Released' && status !== 'Blocked' ? 'Released' : currentBatch ? status === 'Blocked' ? 'Withheld' : 'Generated' : 'Draft';
    const resolvedPayCurrency = resolvePayCurrency({
      payCurrency: identity?.payCurrency || employee.payCurrency,
      payrollGroup: employee.payrollGroup || identity?.payrollGroup,
      salaryGrade: employee.salaryGrade || identity?.salaryGrade || employee.jobGrade,
      jobGrade: employee.jobGrade,
      businessUnit: employee.businessUnit || identity?.businessUnit,
    });
    const localEarnings = (employee.sageLocalPayrollEarnings || []).map((line) => ({
      code: line.code,
      label: line.name,
      taxable: true,
      amount: line.amount,
    }));
    const localDeductionLines = employee.sageLocalPayrollDeductions?.lines || [];
    const localDeductions = localDeductionLines.map((line) => ({
      label: line.name || line.code,
      amount: line.amount,
    }));
    const localGross = employee.localPeriodSalary || localEarnings.reduce((sum, line) => sum + Number(line.amount || 0), 0);
    const localTotalDeductions = employee.localLatestDeductions || employee.sageLocalPayrollDeductions?.totalDeductions || localDeductions.reduce((sum, line) => sum + Number(line.amount || 0), 0);
    return {
      payslipId: `PS-${requestedPeriod}-${employee.employeeId}`,
      employeeId: employee.employeeId,
      employeeCode: employee.employeeCode,
      fullName: employee.fullName || identity?.fullName || employee.employeeId,
      jobTitle: employee.jobTitle || identity?.jobTitle || '',
      department: employee.department || identity?.department || '',
      businessUnit: employee.businessUnit || identity?.businessUnit || '',
      location: employee.location || identity?.location || '',
      payrollGroup: employee.payrollGroup || identity?.payrollGroup || 'Unassigned',
      salaryGrade: dailyRateEmployee ? (ratePerDay > 0 ? 'Daily Rate' : 'Rate Missing') : employee.salaryGrade || employee.jobGrade || identity?.salaryGrade || 'Unassigned',
      isDailyRate: dailyRateEmployee,
      payBasis: dailyRateEmployee ? 'Daily Rate' : 'Monthly Salary',
      ratePerDay: ratePerDay || null,
      ratePerHour: ratePerHour || null,
      hoursPerDay: Number(employee.hoursPerDay || 8) || 8,
      daysWorked: dailyRateEmployee ? roundMoney(dailyAttendance.daysWorked) : null,
      attendanceHours: dailyRateEmployee ? roundMoney(dailyAttendance.attendanceHours) : null,
      bookedHours: dailyRateEmployee ? roundMoney(dailyAttendance.bookedHours) : null,
      idleHours: dailyRateEmployee ? roundMoney(dailyAttendance.idleHours) : null,
      payCurrency: resolvedPayCurrency,
      localRun: employee.hasDualCurrencyPayroll ? {
        payrollGroup: employee.localPayrollGroup || 'DLE',
        payCurrency: employee.localPayCurrency || 'NGN',
        grossPay: roundMoney(localGross),
        totalDeductions: roundMoney(localTotalDeductions),
        netPay: roundMoney(Math.max(0, localGross - localTotalDeductions)),
        earnings: localEarnings,
        deductions: localDeductions.filter((item) => item.amount > 0),
      } : null,
      paymentRun: identity?.paymentRun || employee.paymentRun || 'Monthly',
      paymentType: identity?.paymentType || employee.paymentType || '',
      bankName: identity?.bankName || employee.bankName || 'Not configured',
      accountName: identity?.accountName || employee.accountName || '',
      maskedAccount: maskAccount(identity?.accountNo || employee.accountNo),
      taxIdentificationNumber: identity?.taxIdentificationNumber || employee.taxIdentificationNumber || '',
      pensionProvider: identity?.pensionProvider || employee.pensionProvider || (pensionEmployee > 0 ? 'Pension Fund' : ''),
      pensionPinMasked: compact(identity?.pensionPin || employee.pensionPin) ? maskAccount(identity?.pensionPin || employee.pensionPin) : '',
      period: requestedPeriod,
      periodLabel: periodLabel(requestedPeriod),
      payPeriodStart: periodStartDate(requestedPeriod),
      payPeriodEnd: periodEndDate(requestedPeriod),
      payDate: periodEndDate(requestedPeriod),
      earningProfile: amounts.profileName,
      earningProfileId: amounts.profileId,
      taxablePay: amounts.taxablePay,
      nonTaxablePay: amounts.nonTaxablePay,
      earnings: amounts.paidEarningLines.map((line) => ({
        code: line.code,
        label: line.name,
        taxable: line.taxable,
        runFrequency: line.runFrequency || 'monthly',
        includeInMonthlyPayroll: line.includeInMonthlyPayroll !== false,
        amount: line.amount,
      })),
      deductions: [
        { label: 'PAYE', amount: paye },
        { label: 'Pension', amount: pensionEmployee },
        { label: 'NHF', amount: nhf },
        { label: unionRule.name, amount: unionDues },
        { label: 'Other Deductions', amount: otherStatutory },
        { label: 'Loan / Salary Advance', amount: loanRecovery },
      ].filter((item) => item.amount > 0),
      employerContributions: [
        { label: 'Employer Pension', amount: roundMoney(pension.employerContribution) },
        { label: 'Employer Statutory Funds', amount: roundMoney(funds.employerCosts) },
      ].filter((item) => item.amount > 0),
      grossPay: amounts.grossPay,
      totalDeductions,
      netPay,
      ytdGross: roundMoney(amounts.grossPay * Number(requestedPeriod.slice(5, 7))),
      ytdPaye: roundMoney(paye * Number(requestedPeriod.slice(5, 7))),
      ytdNet: roundMoney(netPay * Number(requestedPeriod.slice(5, 7))),
      status,
      deliveryStatus,
      issues,
    };
  });

  const totals = payslips.reduce(
    (sum, slip) => ({
      grossPay: sum.grossPay + slip.grossPay,
      deductions: sum.deductions + slip.totalDeductions,
      netPay: sum.netPay + slip.netPay,
      ready: sum.ready + (slip.status === 'Ready' ? 1 : 0),
      review: sum.review + (slip.status === 'Review' ? 1 : 0),
      blocked: sum.blocked + (slip.status === 'Blocked' ? 1 : 0),
      released: sum.released + (slip.deliveryStatus === 'Released' ? 1 : 0),
      withheld: sum.withheld + (slip.deliveryStatus === 'Withheld' ? 1 : 0),
      exceptions: sum.exceptions + slip.issues.length,
    }),
    { grossPay: 0, deductions: 0, netPay: 0, ready: 0, review: 0, blocked: 0, released: 0, withheld: 0, exceptions: 0 }
  );

  const maskedPayslips = payslips.map((slip) => ({
    ...slip,
    earnings: slip.earnings.map((item) => ({ ...item, amount: null })),
    deductions: slip.deductions.map((item) => ({ ...item, amount: null })),
    employerContributions: slip.employerContributions.map((item) => ({ ...item, amount: null })),
    grossPay: null,
    totalDeductions: null,
    netPay: null,
    ytdGross: null,
    ytdPaye: null,
    ytdNet: null,
  }));

  return {
    generatedAt: new Date().toISOString(),
    source: enterprisePayrollSourceLabel(requestedPeriod),
    dataSource: payrollDataSourceInfo(employeeSource),
    company: {
      name: 'Dorman Long Engineering Limited',
      address: '12/14 Agege Motor Road, Idi-Oro, Mushin, Lagos, Nigeria',
      logoUrl: '/brand/dorman-long-logo.jpg',
      email: 'hrpayroll@dormanlongeng.com',
      website: 'www.dormanlongeng.com',
    },
    period: requestedPeriod,
    periodLabel: periodLabel(requestedPeriod),
    role,
    permissions: perms,
    batch: currentBatch,
    batches: batches.slice(0, 12),
    summary: {
      employees: payslips.length,
      grossPay: perms.canViewMoney ? roundMoney(totals.grossPay) : null,
      deductions: perms.canViewMoney ? roundMoney(totals.deductions) : null,
      netPay: perms.canViewMoney ? roundMoney(totals.netPay) : null,
      ready: totals.ready,
      review: totals.review,
      blocked: totals.blocked,
      released: totals.released,
      withheld: totals.withheld,
      exceptionCount: totals.exceptions,
    },
    payslips: perms.canViewMoney ? payslips : maskedPayslips,
  };
};

const csv = (records: any[]) => {
  const headers = ['Payslip ID', 'Employee ID', 'Name', 'Department', 'Payroll Group', 'Pay Basis', 'Daily Rate', 'Hourly Rate', 'Gross Pay', 'Deductions', 'Net Pay', 'Status', 'Delivery', 'Issues'];
  const lines = records.map((record) =>
    [record.payslipId, record.employeeId, record.fullName, record.department, record.payrollGroup, record.payBasis, record.ratePerDay, record.ratePerHour, record.grossPay, record.totalDeductions, record.netPay, record.status, record.deliveryStatus, record.issues.join('; ')]
      .map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`)
      .join(',')
  );
  return [headers.join(','), ...lines].join('\n');
};

const payslipExcelRows = (records: any[]) =>
  records.map((record, index) => [
    index + 1,
    record.payslipId,
    record.employeeId,
    record.fullName,
    record.department,
    record.location,
    record.payrollGroup,
    record.payBasis,
    record.grossPay ?? 0,
    record.totalDeductions ?? 0,
    record.netPay ?? 0,
    record.status,
    record.deliveryStatus,
    (record.issues || []).join('; ') || 'Ready',
  ]);

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const period = url.searchParams.get('period') || monthPeriod();
    const payload = await buildPayload(request, period);
    if (url.searchParams.get('format') === 'csv') {
      if (!payload.permissions.canExport) return err(403, 'Permission denied');
      return new Response(csv(payload.payslips), {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="payslips-${period}.csv"`,
        },
      });
    }
    if (url.searchParams.get('format') === 'xls' || url.searchParams.get('format') === 'excel') {
      if (!payload.permissions.canExport) return err(403, 'Permission denied');
      return new Response(buildExcelHtml({
        title: `Payslip Salary Schedule - ${payload.periodLabel}`,
        subtitle: `${payload.payslips.length} payslips / ${payload.summary.ready} ready / ${payload.summary.blocked} blocked or withheld`,
        sheetName: 'Payslip Schedule',
        columns: ['S/N', 'Payslip ID', 'Employee ID', 'Employee Name', 'Department', 'Location', 'Payroll Group', 'Pay Basis', 'Gross Salary', 'Deductions', 'Net Salary', 'Payslip Status', 'Delivery Status', 'Issues'],
        rows: payslipExcelRows(payload.payslips),
      }), {
        headers: {
          'content-type': excelMimeType,
          'content-disposition': `attachment; filename="payslip-schedule-${period}.xls"`,
        },
      });
    }
    return ok(payload);
  } catch (error) {
    return err(500, error instanceof Error ? error.message : 'Unable to load payslip generation.');
  }
}

export async function POST(request: Request) {
  try {
    const role = getRole(request);
    const perms = permissions(role);
    const body = await request.json().catch(() => ({}));
    const action = compact(body.action);
    const period = compact(body.period) || monthPeriod();
    if (!perms.canGenerate) return err(403, 'Permission denied');
    const payload = await buildPayload(request, period);
    if (action === 'release' && !perms.canRelease) return err(403, 'Release permission denied');

    const batches = await readBatches();
    const existing = batches.find((batch) => batch.period === period);
    const now = new Date().toISOString();
    const status = action === 'release' ? (payload.summary.blocked > 0 ? 'Partial' : 'Released') : 'Generated';
    const releasedCount = action === 'release' ? payload.summary.employees - payload.summary.blocked : existing?.releasedCount || 0;
    const withheldCount = action === 'release' ? payload.summary.blocked : existing?.withheldCount || 0;
    const batch: PayslipBatch = {
      id: existing?.id || `payslip-batch-${period}-${Date.now()}`,
      period,
      periodLabel: payload.periodLabel,
      generatedAt: existing?.generatedAt || now,
      generatedBy: existing?.generatedBy || role,
      employeeCount: payload.summary.employees,
      releasedCount,
      withheldCount,
      grossPay: Number(payload.summary.grossPay || 0),
      netPay: Number(payload.summary.netPay || 0),
      status,
      audit: [
        ...(existing?.audit || []),
        { at: now, actor: role, action: action || 'generate', note: compact(body.note) || undefined },
      ],
    };
    await writeBatches([batch, ...batches.filter((item) => item.period !== period)].sort((a, b) => b.generatedAt.localeCompare(a.generatedAt)));

    if (action === 'release') {
      if (!isEnterprisePayrollPeriod(period)) {
        await syncSagePeriodEarningAdjustments(period).catch(() => undefined);
      }
      const calculation = await calculatePayrollForPeriod(period);
      const run = (await getPayrollRunForPeriod(period)) || (await ensurePayrollRun(period, payload.periodLabel, role));
      const stamp = now;
      run.status = status === 'Partial' ? 'Released' : 'Released';
      run.releasedAt = run.releasedAt || stamp;
      run.releasedBy = role;
      run.payslipsGeneratedAt = stamp;
      run.payslipsGeneratedBy = role;
      run.employeeCount = payload.summary.employees;
      run.grossPay = Number(payload.summary.grossPay || calculation.summary.grossPay || 0);
      run.deductions = Number(payload.summary.deductions || calculation.summary.deductions || 0);
      run.netPay = Number(payload.summary.netPay || calculation.summary.netPay || 0);
      run.updatedBy = role;
      await savePayrollRun(run);
      await capturePayrollSnapshot(run.id, 'payslip-generation-release', role, calculation.summary as unknown as Record<string, unknown>, calculation.records);
      invalidateHrisEmployeeCaches();
    }

    return ok({ batch });
  } catch (error) {
    return err(500, error instanceof Error ? error.message : 'Unable to update payslip batch.');
  }
}
