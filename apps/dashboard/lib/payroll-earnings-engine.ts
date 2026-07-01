import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { payeTaxableFromPayrollEarnings } from '@/lib/payroll-sage-pay-rules';
import type { DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import { contractEmployeeCode, isDailyRatePayrollEmployee, isContractStyleEarningLine, isPermanentPayrollEmployee } from '@/lib/payroll-employee-classification';
import { isLeaveAllowancePaymentCode } from '@/lib/leave-allowance-policy';
import { leaveAllowanceEventsForEmployeePeriod } from '@/lib/payroll-leave-allowance-store';
import { isSagePayslipEarningSyncSource } from '@/lib/payroll-employee-classification';

export type PayrollEarningProfileId =
  | 'junior-permanent'
  | 'senior-permanent'
  | 'management-permanent'
  | 'management-cola-permanent'
  | 'senior-management-permanent'
  | 'contract-lumpsum'
  | 'contract-day-rate'
  | 'stipend-non-taxable'
  | 'fallback';

export type PayrollEarningDefinition = {
  code: string;
  name: string;
  taxable: boolean;
  percentOfGross: number;
  calculation?: string;
  runFrequency?: 'monthly' | 'leave-period' | 'formula';
  includeInMonthlyPayroll?: boolean;
};

export type PayrollEarningLine = PayrollEarningDefinition & {
  amount: number;
};

export type PayrollEarningsResult = {
  profileId: PayrollEarningProfileId;
  profileName: string;
  /** Full monthly package salary before leave accrual is excluded from monthly pay. */
  periodPackageGross: number;
  grossPay: number;
  basePay: number;
  basicPay: number;
  allowances: number;
  taxablePay: number;
  nonTaxablePay: number;
  bhtPay: number;
  earningLines: PayrollEarningLine[];
  annualBenefitLines: PayrollEarningLine[];
  paidEarningLines: PayrollEarningLine[];
};

export type PayrollEarningsOptions = {
  period?: string;
  includePeriodAdjustments?: boolean;
  useSagePayslipLines?: boolean;
  ignoreSagePayslipLines?: boolean;
};

export type PayrollSupplementalEarningDefinition = {
  code: string;
  name: string;
  taxable: boolean;
  calculation: string;
};

export type PayrollFormulaDefinition = {
  code: string;
  name: string;
  taxable: boolean;
  calculation: string;
};

export type OvertimeDayType = 'Weekday' | 'Saturday' | 'Sunday' | 'Public Holiday';

export type PayrollOvertimeRule = {
  code: string;
  name: string;
  taxable: boolean;
  multiplier: number;
  divisor: number;
};

type PayrollPeriodEarningAdjustment = {
  period: string;
  employeeId?: string;
  employeeCode?: string;
  salaryGrades?: string[];
  profileIds?: PayrollEarningProfileId[];
  code: string;
  name: string;
  amount: number;
  taxable: boolean;
  source?: string;
};

const roundMoney = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
const compact = (value: unknown) => String(value || '').trim();
const normalizedTextKey = (value: unknown) => compact(value).toUpperCase().replace(/\s+/g, '');
const employeeGradeKey = (employee: Pick<DleEmployeeDirectoryRow, 'salaryGrade' | 'jobGrade'>) =>
  normalizedTextKey(effectivePayrollGrade(employee));
const num = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const GENERIC_PAYROLL_GRADES = new Set([
  'UNASSIGNED',
  'PERMANENT',
  'CONTRACT',
  'CASUAL',
  'TEMPORARY',
  'CACHE',
  'DAILY RATE',
  'NOT ASSIGNED',
  'EMPLOYEE',
  'STAFF',
  'ACTIVE',
]);

export const isGenericPayrollGrade = (value: unknown) => {
  const grade = compact(value).toUpperCase();
  if (!grade) return true;
  if (GENERIC_PAYROLL_GRADES.has(grade)) return true;
  return /^(PERMANENT|CONTRACT|CASUAL|TEMPORARY|FULL[\s-]?TIME|PART[\s-]?TIME)$/i.test(grade);
};

const effectivePayrollGrade = (employee: Pick<DleEmployeeDirectoryRow, 'salaryGrade' | 'jobGrade'>) => {
  const salaryGrade = compact(employee.salaryGrade);
  const jobGrade = compact(employee.jobGrade);
  if (!isGenericPayrollGrade(salaryGrade)) return salaryGrade.toUpperCase();
  if (!isGenericPayrollGrade(jobGrade)) return jobGrade.toUpperCase();
  return salaryGrade.toUpperCase();
};

const titleCase = (value: string) => value.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
const resolveDashboardRoot = () => {
  const cwd = process.cwd();
  const dashboardSuffix = path.join('apps', 'dashboard');
  return cwd.endsWith(dashboardSuffix) ? cwd : path.join(cwd, dashboardSuffix);
};
const PERIOD_ADJUSTMENTS_PATH = process.env.DLE_PAYROLL_EARNING_ADJUSTMENTS_PATH
  || (process.env.DLE_HRIS_DATA_DIR ? path.join(process.env.DLE_HRIS_DATA_DIR, 'payroll-period-earning-adjustments.json') : '')
  || path.join(resolveDashboardRoot(), 'data', 'hris', 'payroll-period-earning-adjustments.json');
let periodAdjustmentCache: { mtime: number; rows: PayrollPeriodEarningAdjustment[] } | null = null;
const normalizedPeriod = (period?: string) => compact(period).replace(/\//g, '-').slice(0, 7);
const normalizedEmployeeKey = (value: unknown) => compact(value).toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^P(?=\d+$)/, '');

/** Match payroll period adjustments to employees even when adjustment keys include names (e.g. "L2644 - NZEKWUE"). */
export const payrollEmployeeMatchKeys = (value: unknown) => {
  const keys = new Set<string>();
  const text = compact(value).toUpperCase();
  if (!text) return keys;
  keys.add(text.replace(/[^A-Z0-9]/g, ''));
  keys.add(normalizedEmployeeKey(text));
  if (/^(NYSC|IT|N)\d/i.test(text)) return keys;
  const prefixed = text.match(/\b([PLC]\d{3,})\b/i);
  if (prefixed) {
    keys.add(prefixed[1].replace(/[^A-Z0-9]/g, '').toUpperCase());
  } else {
    const digits = text.match(/(\d{3,})/);
    if (digits) keys.add(digits[1]);
  }
  return keys;
};

const employeeAdjustmentMatched = (employee: DleEmployeeDirectoryRow, row: PayrollPeriodEarningAdjustment) => {
  const employeeKeys = new Set<string>();
  [employee.employeeId, employee.employeeCode, employee.sourceEmployeeId].forEach((value) => {
    payrollEmployeeMatchKeys(value).forEach((key) => employeeKeys.add(key));
  });
  const rowKeys = new Set<string>();
  [row.employeeId, row.employeeCode].forEach((value) => {
    payrollEmployeeMatchKeys(value).forEach((key) => rowKeys.add(key));
  });
  const employeePref = [...employeeKeys].find((key) => /^[PLC]\d+$/.test(key))?.[0];
  const rowText = compact(row.employeeCode || row.employeeId).toUpperCase();
  const rowPref = rowText.match(/^([PLC])\d/)?.[1];
  return [...rowKeys].some((rowKey) => {
    if (!employeeKeys.has(rowKey)) return false;
    if (/^\d+$/.test(rowKey) && employeePref && rowPref && employeePref !== rowPref) return false;
    return true;
  });
};

const STANDARD_PROFILE_EARNING_CODES = new Set([
  'JNR_BASIC', 'JNR_HOUSE', 'JNR_HOUSING', 'JNR_LEAVE', 'JNR_MEDICAL', 'JNR_MEDICALTAX',
  'JNR_OTHERALL', 'JNR_OTHERALLTAX', 'JNR_TRANS', 'JNR_TRANSPORT', 'JNR_UTILITY',
  'SNR_BASIC', 'SNR_HOUSE', 'SNR_HOUSING', 'SNR_LEAVE', 'SNR_MEDICAL', 'SNR_MEDICALTAX',
  'SNR_OTHERALL', 'SNR_OTHERALLTAX', 'SNR_TRANS', 'SNR_TRANSPORT', 'SNR_UTILITY', 'SNR_UTILITIES', 'SNR_LEAVETAX',
  'SNR_NJIC', 'SNR_NTC', 'PER_MEAL',
  'MGT_BASIC', 'MGT_HOUSE', 'MGT_HOUSING', 'MGT_LEAVE', 'MGT_MEDICAL', 'MGT_MEDICALTAX',
  'MGT_OTHERALL', 'MGT_OTHERALLTAX', 'MGT_TRANS', 'MGT_TRANSPORT', 'MGT_UTILITY', 'MGT_FURN',
  'MGT1COLA_BASIC', 'MGT1COLA_HOUSIN', 'MGT1COLA_LEAVE', 'MGT1COLA_MEDICAL', 'MGT1COLA_MEDTAX',
  'MGT1COLA_OTHALL', 'MGT1COLA_OTHALLTAX', 'MGT1COLA_TRANSP', 'MGT1COLA_FURN', 'MGT1COLA_UTILIT',
  'SNM_BASIC', 'SNM_HOUSE', 'SNM_HOUSING', 'SNM_LEAVE', 'SNM_MEDICAL', 'SNM_MEDICALTAX',
  'SNM_OTHERALL', 'SNM_OTHERALLTAX', 'SNM_TRANS', 'SNM_TRANSPORT', 'SNM_UTILITY', 'SNM_FURN',
  'JCWEEKDAY', 'JCWEEKDAY_NT', 'WEEKDAYOVT', 'PUBHOL', 'SATEARN', 'SUNDAYEARN',
  'STIPEND_NT', 'BASIC', 'ALLOWANCE', 'ARREARS', 'LTI',
]);
const readPeriodEarningAdjustmentsSync = () => {
  try {
    if (!existsSync(PERIOD_ADJUSTMENTS_PATH)) return [];
    const stat = statSync(PERIOD_ADJUSTMENTS_PATH) as { mtimeMs: number };
    if (periodAdjustmentCache && periodAdjustmentCache.mtime === stat.mtimeMs) return periodAdjustmentCache.rows;
    const parsed = JSON.parse(readFileSync(PERIOD_ADJUSTMENTS_PATH, 'utf8'));
    const rows = Array.isArray(parsed) ? parsed as PayrollPeriodEarningAdjustment[] : [];
    periodAdjustmentCache = { mtime: stat.mtimeMs, rows };
    return rows;
  } catch {
    return [];
  }
};

export const PAYROLL_EARNING_PROFILES: Record<Exclude<PayrollEarningProfileId, 'contract-day-rate' | 'stipend-non-taxable' | 'fallback'>, { name: string; definitions: PayrollEarningDefinition[] }> = {
  'junior-permanent': {
    name: 'Permanent Junior Staff',
    definitions: [
      { code: 'JNR_BASIC', name: 'BASIC SALARY', taxable: true, percentOfGross: 0.4 },
      { code: 'JNR_HOUSE', name: 'HOUSING', taxable: true, percentOfGross: 0.0696 },
      { code: 'JNR_LEAVE', name: 'LEAVE', taxable: true, percentOfGross: 0.0328, runFrequency: 'leave-period', includeInMonthlyPayroll: false },
      { code: 'JNR_MEDICAL', name: 'MEDICAL', taxable: true, percentOfGross: 0.06 },
      { code: 'JNR_OTHERALL', name: 'OTHER ALLOWANCE', taxable: true, percentOfGross: 0.3576 },
      { code: 'JNR_TRANS', name: 'TRANSPORT ALLOWANCE', taxable: true, percentOfGross: 0.06 },
      { code: 'JNR_UTILITY', name: 'UTILITIES', taxable: true, percentOfGross: 0.02 },
    ],
  },
  'senior-permanent': {
    name: 'Permanent Senior Staff',
    definitions: [
      { code: 'SNR_BASIC', name: 'BASIC SALARY', taxable: true, percentOfGross: 0.416 },
      { code: 'SNR_HOUSE', name: 'HOUSING', taxable: true, percentOfGross: 0.1128 },
      { code: 'SNR_LEAVE', name: 'LEAVE', taxable: true, percentOfGross: 0.0313, runFrequency: 'leave-period', includeInMonthlyPayroll: false },
      { code: 'SNR_MEDICAL', name: 'MEDICAL', taxable: true, percentOfGross: 0.0513 },
      { code: 'SNR_OTHERALL', name: 'OTHER ALLOWANCE', taxable: true, percentOfGross: 0.327 },
      { code: 'SNR_TRANS', name: 'TRANSPORT ALLOWANCE', taxable: true, percentOfGross: 0.0411 },
      { code: 'SNR_UTILITY', name: 'UTILITIES', taxable: true, percentOfGross: 0.0205 },
    ],
  },
  'management-permanent': {
    name: 'Permanent Management Staff',
    definitions: [
      { code: 'MGT_BASIC', name: 'BASIC SALARY', taxable: true, percentOfGross: 0.25 },
      { code: 'MGT_HOUSE', name: 'HOUSING', taxable: true, percentOfGross: 0.2 },
      { code: 'MGT_LEAVE', name: 'LEAVE', taxable: true, percentOfGross: 0.0313, runFrequency: 'leave-period', includeInMonthlyPayroll: false },
      { code: 'MGT_OTHERALL', name: 'OTHER ALLOWANCE', taxable: true, percentOfGross: 0.29 },
      { code: 'MGT_TRANS', name: 'TRANSPORT ALLOWANCE', taxable: true, percentOfGross: 0.15 },
      { code: 'MGT_FURN', name: 'FURNITURE ALLOWANCE', taxable: true, percentOfGross: 0.04 },
      { code: 'MGT_UTILITY', name: 'UTILITIES', taxable: true, percentOfGross: 0.0387 },
    ],
  },
  'management-cola-permanent': {
    name: 'Permanent Management COLA Staff',
    definitions: [
      { code: 'MGT1COLA_BASIC', name: 'BASIC SALARY', taxable: true, percentOfGross: 0.4 },
      { code: 'MGT1COLA_HOUSIN', name: 'HOUSING', taxable: true, percentOfGross: 0.16 },
      { code: 'MGT1COLA_LEAVE', name: 'LEAVE', taxable: true, percentOfGross: 0.0256, runFrequency: 'leave-period', includeInMonthlyPayroll: false },
      { code: 'MGT1COLA_OTHALL', name: 'OTHER ALLOWANCE', taxable: true, percentOfGross: 0.232 },
      { code: 'MGT1COLA_TRANSP', name: 'TRANSPORT ALLOWANCE', taxable: true, percentOfGross: 0.12 },
      { code: 'MGT1COLA_FURN', name: 'FURNITURE ALLOWANCE', taxable: true, percentOfGross: 0.032 },
      { code: 'MGT1COLA_UTILIT', name: 'UTILITIES', taxable: true, percentOfGross: 0.0304 },
    ],
  },
  'senior-management-permanent': {
    name: 'Permanent Senior Management Staff',
    definitions: [
      { code: 'SNM_BASIC', name: 'BASIC SALARY', taxable: true, percentOfGross: 0.2 },
      { code: 'SNM_HOUSE', name: 'HOUSING', taxable: true, percentOfGross: 0.1 },
      { code: 'SNM_LEAVE', name: 'LEAVE', taxable: true, percentOfGross: 0.025, runFrequency: 'leave-period', includeInMonthlyPayroll: false },
      { code: 'SNM_FURN', name: 'FURNITURE ALLOWANCE', taxable: true, percentOfGross: 0.075 },
      { code: 'SNM_OTHERALL', name: 'OTHER ALLOWANCE', taxable: true, percentOfGross: 0.43 },
      { code: 'SNM_TRANS', name: 'TRANSPORT ALLOWANCE', taxable: true, percentOfGross: 0.07 },
      { code: 'SNM_UTILITY', name: 'UTILITIES', taxable: true, percentOfGross: 0.1 },
    ],
  },
  'contract-lumpsum': {
    name: 'Contract Staff on Lumpsum',
    definitions: [
      { code: 'LUMPSUMTAX', name: 'LUMPSUM ALLOWANCE', taxable: true, percentOfGross: 1 },
    ],
  },
};

export const PERMANENT_SUPPLEMENTAL_EARNINGS: PayrollSupplementalEarningDefinition[] = [
  { code: 'ARREARS', name: 'ARREARS', taxable: false, calculation: 'Configured amount' },
  { code: 'WKDAY_OVT', name: 'WEEKDAY OVERTIME', taxable: false, calculation: 'Overtime rule' },
  { code: 'SITE_ALLOW', name: 'SITE ALLOWANCE', taxable: false, calculation: 'Configured amount' },
  { code: 'OVERTIME', name: 'OVERTIME', taxable: false, calculation: 'Overtime rule' },
  { code: 'MISC', name: 'MISCELLANEOUS', taxable: false, calculation: 'Configured amount' },
  { code: 'OTHER_PAY', name: 'OTHER PAY', taxable: false, calculation: 'Configured amount' },
  { code: 'PERM_MEAL', name: 'PERMANENT MEAL ALLOWANCE', taxable: false, calculation: 'NGN 500 * number of days' },
  { code: 'NIGHT_ALLOW', name: 'NIGHT ALLOWANCE', taxable: false, calculation: 'Configured amount' },
  { code: 'SPECIAL_ALLOW', name: 'SPECIAL ALLOWANCE', taxable: false, calculation: 'Configured amount' },
];

export const CONTRACT_LUMPSUM_SUPPLEMENTAL_EARNINGS: PayrollSupplementalEarningDefinition[] = [
  { code: 'ARREARS', name: 'ARREARS', taxable: false, calculation: 'Configured amount' },
  { code: 'SITE_ALLOW', name: 'SITE ALLOWANCE', taxable: false, calculation: 'Configured amount' },
  { code: 'OVERTIME', name: 'OVERTIME', taxable: false, calculation: 'Overtime rule' },
  { code: 'MISC', name: 'MISCELLANEOUS', taxable: false, calculation: 'Configured amount' },
  { code: 'OTHER_PAY', name: 'OTHER PAY', taxable: false, calculation: 'Configured amount' },
  { code: 'NIGHT_ALLOW', name: 'NIGHT ALLOWANCE', taxable: false, calculation: 'Configured amount' },
  { code: 'WEEKEND_ALLOW', name: 'WEEKEND ALLOWANCE', taxable: false, calculation: 'Configured amount' },
];

export const CONTRACT_DAY_RATE_EARNING_DEFINITIONS: PayrollFormulaDefinition[] = [
  { code: 'JCWEEKDAY', name: 'WEEKDAY EARNING', taxable: true, calculation: '(No of days worked * Day rate) * 45%' },
  { code: 'JCWEEKDAY_NT', name: 'WEEKDAY ALLOWANCE NON TAX', taxable: false, calculation: '(No of days worked * Day rate) * 55%' },
  { code: 'WEEKDAYOVT', name: 'WEEKDAY OVT EARNING', taxable: true, calculation: '(Day rate / 8) * hours worked * 1.5' },
  { code: 'PUBHOL', name: 'PUBLIC HOLIDAY EARNING', taxable: true, calculation: '(Day rate / 8) * hours worked * 2' },
  { code: 'PUBLIC_OVT', name: 'PUBLIC HOLIDAY OVERTIME', taxable: true, calculation: '(Day rate / 8) * hours worked * 2' },
  { code: 'SATEARN', name: 'SATURDAY EARNING', taxable: true, calculation: '(Day rate / 8) * hours worked * 1.5' },
  { code: 'SATURDAY_OVT', name: 'SATURDAY OVERTIME EARNING', taxable: true, calculation: '(Day rate / 8) * hours worked * 1.5' },
  { code: 'SUNDAY_OVT', name: 'SUNDAY OVERTIME', taxable: true, calculation: '(Day rate / 8) * hours worked * 2' },
  { code: 'SUNDAYEARN', name: 'SUNDAY EARNING', taxable: true, calculation: '(Day rate / 8) * hours worked * 2' },
];

export const CONTRACT_DAY_RATE_SUPPLEMENTAL_EARNINGS: PayrollSupplementalEarningDefinition[] = [
  { code: 'ARREARS', name: 'ARREARS', taxable: false, calculation: 'Configured amount' },
  { code: 'MISC', name: 'MISCELLANEOUS', taxable: false, calculation: 'Configured amount' },
  { code: 'OTHER_PAY', name: 'OTHER PAY', taxable: false, calculation: 'Configured amount' },
  { code: 'NIGHT_ALLOW', name: 'NIGHT ALLOWANCE', taxable: false, calculation: 'Configured amount' },
  { code: 'SPECIAL_ALLOW', name: 'SPECIAL ALLOWANCE', taxable: false, calculation: 'Configured amount' },
  { code: 'MEAL_ALLOW', name: 'MEAL ALLOWANCE', taxable: false, calculation: 'NGN 500 / day' },
];

export const JUNIOR_OVERTIME_RULES: Record<OvertimeDayType, PayrollOvertimeRule> = {
  Weekday: { code: 'JR_WKDAY_OVT', name: 'JNR WEEKDAY OVERTIME', taxable: true, multiplier: 1.5, divisor: 176 },
  Saturday: { code: 'PAR_SATOVT', name: 'SATURDAY OVERTIME', taxable: true, multiplier: 2, divisor: 176 },
  Sunday: { code: 'PER_SUNOVT', name: 'SUNDAY OVERTIME', taxable: true, multiplier: 2.5, divisor: 176 },
  'Public Holiday': { code: 'PAR_SATOVT', name: 'PUBLIC HOLIDAY OVERTIME', taxable: true, multiplier: 2, divisor: 176 },
};

const JUNIOR_OVERTIME_EARNING_LINES: PayrollEarningLine[] = [
  { code: 'JR_WKDAY_OVT', name: 'JNR WEEKDAY OVERTIME', taxable: true, percentOfGross: 0, calculation: '(Basic / 176) * 1.5 * number of hours', runFrequency: 'formula', includeInMonthlyPayroll: false, amount: 0 },
  { code: 'PAR_SATOVT', name: 'SATURDAY OVERTIME', taxable: true, percentOfGross: 0, calculation: '(Basic / 176) * 2 * number of hours', runFrequency: 'formula', includeInMonthlyPayroll: false, amount: 0 },
  { code: 'PER_SUNOVT', name: 'SUNDAY OVERTIME', taxable: true, percentOfGross: 0, calculation: '(Basic / 176) * 2.5 * number of hours', runFrequency: 'formula', includeInMonthlyPayroll: false, amount: 0 },
];

export const SENIOR_FIXED_MONTHLY_EARNING_DEFINITIONS: PayrollEarningDefinition[] = [
  { code: 'PER_MEAL', name: 'Meal Allowance', taxable: true, percentOfGross: 0, calculation: 'Fixed monthly senior earning' },
  { code: 'SNR_NJIC', name: 'SNR NJIC', taxable: true, percentOfGross: 0, calculation: 'Fixed monthly senior earning' },
];

export const JUNIOR_FIXED_MONTHLY_EARNING_DEFINITIONS: PayrollEarningDefinition[] = [
  { code: 'PER_MEAL_JNR', name: 'Meal Allowance', taxable: true, percentOfGross: 0, calculation: 'Fixed monthly junior earning' },
  { code: 'JNR_NJIC', name: 'JNR NJIC', taxable: true, percentOfGross: 0, calculation: 'Fixed monthly junior earning' },
];

const seniorFixedMonthlyEarningLines = (profileId: PayrollEarningProfileId, periodAdjustments: PayrollEarningLine[] = []): PayrollEarningLine[] => {
  if (profileId !== 'senior-permanent') return [];
  const hasMealAdjustment = periodAdjustments.some((line) => /TCMMEAL|PER_MEAL|^MEAL$/i.test(String(line.code || '')));
  const hasNjicAdjustment = periodAdjustments.some((line) => /SNR_NJIC/i.test(String(line.code || '')));
  const lines: PayrollEarningLine[] = [];
  if (!hasMealAdjustment) {
    lines.push({ ...SENIOR_FIXED_MONTHLY_EARNING_DEFINITIONS[0], amount: 22000, taxable: true });
  }
  if (!hasNjicAdjustment) {
    lines.push({ ...SENIOR_FIXED_MONTHLY_EARNING_DEFINITIONS[1], amount: 15000, taxable: true });
  }
  return lines;
};

const juniorFixedMonthlyEarningLines = (profileId: PayrollEarningProfileId): PayrollEarningLine[] => {
  if (profileId !== 'junior-permanent') return [];
  return [
    { ...JUNIOR_FIXED_MONTHLY_EARNING_DEFINITIONS[0], amount: 8800, taxable: true },
    { ...JUNIOR_FIXED_MONTHLY_EARNING_DEFINITIONS[1], amount: 10000, taxable: true },
  ];
};

const monthlyPayrollLines = (lines: PayrollEarningLine[]) => lines.filter((line) => line.includeInMonthlyPayroll !== false);

const withCategoryFormulaLines = (profileId: PayrollEarningProfileId, lines: PayrollEarningLine[]) => {
  if (profileId === 'junior-permanent') return [...lines, ...JUNIOR_OVERTIME_EARNING_LINES];
  return lines;
};

const CONTRACT_MEAL_RATE = 500;

const contractMealAllowanceLine = (daysWorked: number): PayrollEarningLine | null => {
  const amount = roundMoney(Math.max(0, daysWorked) * CONTRACT_MEAL_RATE);
  if (amount <= 0) return null;
  return {
    code: 'MEAL',
    name: 'MEAL ALLOWANCE',
    taxable: false,
    percentOfGross: 0,
    calculation: 'NGN 500 * number of days worked',
    runFrequency: 'formula',
    includeInMonthlyPayroll: true,
    amount,
  };
};

const finalizeContractDayRateEarnings = (lines: PayrollEarningLine[], weekdayDays: number, ratePerDay: number) => {
  const mealLine = contractMealAllowanceLine(weekdayDays);
  const paidLines = mealLine ? [...lines, mealLine] : lines;
  const grossPay = roundMoney(paidLines.reduce((sum, line) => sum + line.amount, 0));
  const basicPay = roundMoney(lines.filter(isBasicLine).reduce((sum, line) => sum + line.amount, 0));
  const taxablePay = roundMoney(lines.filter((line) => line.taxable).reduce((sum, line) => sum + line.amount, 0));
  const nonTaxablePay = roundMoney(paidLines.filter((line) => !line.taxable).reduce((sum, line) => sum + line.amount, 0));
  const weekdayBase = roundMoney(Math.max(0, weekdayDays) * ratePerDay);
  return {
    periodPackageGross: weekdayBase,
    grossPay,
    basePay: basicPay,
    basicPay,
    allowances: roundMoney(grossPay - basicPay),
    taxablePay,
    nonTaxablePay,
    bhtPay: basicPay,
    earningLines: paidLines,
    paidEarningLines: paidLines,
    annualBenefitLines: [] as PayrollEarningLine[],
  };
};

const TIMESHEET_DRIVEN_EARNING_CODES = new Set(['JCWEEKDAY', 'JCWEEKDAY_NT']);

export const contractDayRatePayrollResult = (input: {
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
    periodPackageGross: result.periodPackageGross,
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

export const buildDailyRateSupplementalEarnings = (
  employee: DleEmployeeDirectoryRow,
  options?: PayrollEarningsOptions,
): PayrollEarningsResult => {
  const paidEarningLines = periodAdjustmentLines(employee, options).map((line) => ({
    ...line,
    runFrequency: line.runFrequency || ('formula' as const),
    includeInMonthlyPayroll: line.includeInMonthlyPayroll !== false,
    amount: roundMoney(line.amount),
  }));
  const grossPay = roundMoney(paidEarningLines.reduce((sum, line) => sum + line.amount, 0));
  const taxablePay = roundMoney(paidEarningLines.filter((line) => line.taxable).reduce((sum, line) => sum + line.amount, 0));
  return {
    profileId: 'contract-day-rate',
    profileName: 'Daily Rate Supplemental Components',
    periodPackageGross: 0,
    grossPay,
    basePay: 0,
    basicPay: 0,
    allowances: grossPay,
    taxablePay,
    nonTaxablePay: roundMoney(grossPay - taxablePay),
    bhtPay: 0,
    earningLines: paidEarningLines,
    annualBenefitLines: [],
    paidEarningLines,
  };
};

export const mergeDailySupplementalEarnings = (base: PayrollEarningsResult, source: PayrollEarningsResult): PayrollEarningsResult => {
  const supplemental = source.paidEarningLines
    .filter((line) => !TIMESHEET_DRIVEN_EARNING_CODES.has(compact(line.code).toUpperCase()))
    .filter((line) => roundMoney(line.amount) !== 0)
    .map((line) => ({
      ...line,
      calculation: line.calculation || 'Daily-rate supplemental earning',
      runFrequency: line.runFrequency || 'monthly',
      includeInMonthlyPayroll: line.includeInMonthlyPayroll !== false,
      amount: roundMoney(line.amount),
    }));
  if (!supplemental.length) return base;

  const supplementalCodes = new Set(supplemental.map((line) => canonicalEarningCode(line.code)));
  const baseLines = base.paidEarningLines.filter((line) => {
    const code = canonicalEarningCode(line.code);
    if (TIMESHEET_DRIVEN_EARNING_CODES.has(compact(line.code).toUpperCase())) return true;
    return !supplementalCodes.has(code);
  });

  const paidEarningLines = [...baseLines, ...supplemental];
  const grossPay = roundMoney(paidEarningLines.reduce((sum, line) => sum + line.amount, 0));
  const taxablePay = roundMoney(paidEarningLines.filter((line) => line.taxable).reduce((sum, line) => sum + line.amount, 0));
  const basicPay = roundMoney(baseLines.filter(isBasicLine).reduce((sum, line) => sum + line.amount, 0));
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

export const mergeTimesheetDayRateEarnings = (
  employee: DleEmployeeDirectoryRow,
  input: { ratePerDay: number; daysWorked: number; period?: string },
): PayrollEarningsResult => {
  const timesheetBase = contractDayRatePayrollResult({ ratePerDay: input.ratePerDay, daysWorked: input.daysWorked });
  const supplemental = buildDailyRateSupplementalEarnings(employee, {
    period: input.period,
    includePeriodAdjustments: true,
  });
  const merged = supplemental.paidEarningLines.length
    ? mergeDailySupplementalEarnings(timesheetBase, supplemental)
    : timesheetBase;
  return alignDayRateLinesWithSageBreakdown(merged);
};

const alignDayRateLinesWithSageBreakdown = (earnings: PayrollEarningsResult): PayrollEarningsResult => {
  const weekday = earnings.paidEarningLines.find((line) => compact(line.code).toUpperCase() === 'JCWEEKDAY');
  const weekdayNt = earnings.paidEarningLines.find((line) => compact(line.code).toUpperCase() === 'JCWEEKDAY_NT');
  if (!weekday || !weekdayNt) return earnings;

  const collapsedWeekday: PayrollEarningLine = {
    ...weekday,
    code: 'JCWEEKDAY',
    name: 'WEEKDAY EARNING',
    taxable: true,
    amount: roundMoney(weekday.amount + weekdayNt.amount),
    calculation: weekday.calculation || 'No of days worked * Day rate',
  };
  const paidEarningLines = [
    collapsedWeekday,
    ...earnings.paidEarningLines.filter((line) => !TIMESHEET_DRIVEN_EARNING_CODES.has(compact(line.code).toUpperCase())),
  ];
  const grossPay = roundMoney(paidEarningLines.reduce((sum, line) => sum + line.amount, 0));
  const taxablePay = roundMoney(paidEarningLines.filter((line) => line.taxable).reduce((sum, line) => sum + line.amount, 0));
  const basicPay = roundMoney(collapsedWeekday.amount);
  const normalizedLines = paidEarningLines.map((line) => ({
    ...line,
    percentOfGross: grossPay > 0 ? roundMoney(line.amount / grossPay) : 0,
  }));
  return {
    ...earnings,
    profileName: earnings.profileName.includes('Timesheet') ? earnings.profileName : `${earnings.profileName} (Sage Aligned)`,
    grossPay,
    basePay: basicPay,
    basicPay,
    allowances: roundMoney(grossPay - basicPay),
    taxablePay,
    nonTaxablePay: roundMoney(grossPay - taxablePay),
    bhtPay: basicPay,
    earningLines: normalizedLines,
    paidEarningLines: normalizedLines,
  };
};

export const contractPayeTaxablePay = (earnings: Pick<PayrollEarningsResult, 'profileId' | 'grossPay' | 'taxablePay' | 'paidEarningLines' | 'earningLines'>) => {
  if (earnings.profileId === 'contract-day-rate') return earnings.grossPay;
  const paidLines = (earnings.paidEarningLines || earnings.earningLines || []) as PayrollEarningLine[];
  if (paidLines.length) {
    if (earnings.profileId === 'contract-lumpsum') {
      return roundMoney(
        paidLines.reduce((sum, line) => {
          const code = line.code.toUpperCase();
          if (code === 'LEAVEALLOW') return sum;
          if (line.taxable !== false && line.amount > 0) return sum + line.amount;
          if (code === 'REFUND') return sum + line.amount;
          return sum;
        }, 0),
      );
    }
    return roundMoney(
      paidLines
        .filter((line) => line.taxable !== false && !/^REFUND$/i.test(line.code))
        .reduce((sum, line) => sum + line.amount, 0),
    );
  }
  return earnings.taxablePay;
};

const isBasicLine = (line: PayrollEarningLine) => {
  const code = line.code.toUpperCase();
  if (code === 'BASIC_LUMPSUM') return false;
  return /BASIC1_LUMPSUM|BASICSALARY|LUMPSUMTAX|EXP_BASIC|_(BASIC)$|^BASIC$|_BASIC$|COLA_BASIC|MGT_BASIC|SNR_BASIC|JNR_BASIC|JCWEEKDAY$/.test(code)
    || /BASIC|LUMPSUM|WEEKDAY EARNING/.test(line.name);
};
const isExcludedFromPensionBht = (line: PayrollEarningLine) => /^TCM/i.test(String(line.code || '').toUpperCase());
const isHousingLine = (line: PayrollEarningLine) => !isExcludedFromPensionBht(line) && (/HOUSE|HOUSIN|_HOUS$/i.test(line.code.toUpperCase()) || /HOUSING/.test(line.name));
const isTransportLine = (line: PayrollEarningLine) => !isExcludedFromPensionBht(line) && (/TRANS/.test(line.code.toUpperCase()) || /TRANSPORT/.test(line.name));

const pensionablePayFromLines = (lines: PayrollEarningLine[]) => {
  const basePay = roundMoney(lines.filter(isBasicLine).reduce((sum, line) => sum + line.amount, 0));
  const housingAndTransport = roundMoney(lines.filter((line) => isHousingLine(line) || isTransportLine(line)).reduce((sum, line) => sum + line.amount, 0));
  return {
    basePay,
    allowances: housingAndTransport,
    total: roundMoney(basePay + housingAndTransport),
  };
};

const sagePayslipEarningLines = (employee: DleEmployeeDirectoryRow): PayrollEarningLine[] => {
  return (employee.sagePayrollEarnings || [])
    .map((line) => {
      const amount = roundMoney(num(line.amount));
      const taxableAmount = line.taxableAmount === null || line.taxableAmount === undefined ? amount : roundMoney(num(line.taxableAmount));
      return {
        code: compact(line.code),
        name: compact(line.name || line.code),
        taxable: taxableAmount > 0,
        percentOfGross: 0,
        calculation: 'Latest Sage payslip line',
        runFrequency: 'monthly' as const,
        includeInMonthlyPayroll: true,
        amount,
      };
    })
    .filter((line) => line.code && line.amount !== 0);
};

const isLeaveAllowanceLine = (line: Pick<PayrollEarningLine, 'code' | 'name'>) =>
  isLeaveAllowancePaymentCode(line.code) || /\bLEAVE ALLOWANCE\b/i.test(String(line.name || ''));

const basicPercentForProfile = (profileId: PayrollEarningProfileId) => {
  if (profileId === 'fallback' || profileId === 'contract-day-rate' || profileId === 'stipend-non-taxable') return 0;
  const profile = PAYROLL_EARNING_PROFILES[profileId];
  const basic = profile.definitions.find((line) => /_(BASIC)$/i.test(line.code));
  return basic?.percentOfGross || 0;
};

/** Monthly package gross — the percentage base for permanent staff profile breakdown (not total payslip with one-offs). */
export const monthlyGrossFromEmployee = (employee: DleEmployeeDirectoryRow) => {
  const profileId = resolvePayrollEarningProfile(employee);
  const periodSalary = num(employee.periodSalary);
  const basicSalary = num(employee.basicSalary);
  const basicPercent = basicPercentForProfile(profileId);
  if (basicSalary > 0 && basicPercent > 0) {
    const derived = roundMoney(basicSalary / basicPercent);
    if (periodSalary > 0 && profileId !== 'contract-day-rate' && profileId !== 'contract-lumpsum' && derived > periodSalary * 2) {
      return roundMoney(periodSalary);
    }
    return derived;
  }
  if (periodSalary > 0) return roundMoney(periodSalary);
  const annualSalary = num(employee.annualSalary);
  if (annualSalary > 0) return roundMoney(annualSalary / 12);
  const isDailyRate = isDailyRatePayrollEmployee(employee);
  if (isDailyRate) {
    const ratePerDay = num(employee.ratePerDay) || (num(employee.ratePerHour) > 0 ? num(employee.ratePerHour) * (num(employee.hoursPerDay) || 8) : 0);
    const workingDays = num(employee.hoursPerPeriod) > 0 && (num(employee.hoursPerDay) || 8) > 0
      ? num(employee.hoursPerPeriod) / (num(employee.hoursPerDay) || 8)
      : 22;
    if (ratePerDay > 0) return roundMoney(ratePerDay * workingDays);
  }
  return 0;
};

const resolveMgt7Profile = (employee: DleEmployeeDirectoryRow, period?: string): PayrollEarningProfileId => {
  const rows = readPeriodEarningAdjustmentsSync()
    .filter((row) => normalizedPeriod(row.period) === normalizedPeriod(period || process.env.HRIS_PAYROLL_ENTERPRISE_FROM || '2026-06'))
    .filter((row) => employeeAdjustmentMatched(employee, row));
  if (rows.some((row) => /^MGT_/i.test(String(row.code || '')))) return 'management-permanent';
  if (rows.some((row) => /^SNM/i.test(String(row.code || '')))) return 'senior-management-permanent';
  return 'management-permanent';
};

export const resolvePayrollEarningProfile = (employee: DleEmployeeDirectoryRow, period?: string): PayrollEarningProfileId => {
  const grade = effectivePayrollGrade(employee);
  const groupText = [
    employee.payrollGroup,
    employee.staffCategory,
    employee.employeeCategory,
    employee.employmentType,
    employee.jobTitle,
    employee.designation,
  ].map(compact).join(' ').toUpperCase();
  const stipendGroupText = [
    employee.payrollGroup,
    employee.staffCategory,
    employee.employeeCategory,
    employee.employmentType,
  ].map(compact).join(' ').toUpperCase();
  const employeeCode = compact(employee.employeeCode || employee.employeeId).toUpperCase();
  if (/^(P?IT|IT|I|P?NYSC|NYSC|N)\d+/.test(employeeCode) || /\b(INDUSTRIAL TRAINING|INDUSTRIAL TRAINEE|INTERN|NYSC|NATIONAL YOUTH SERVICE)\b/.test(stipendGroupText)) return 'stipend-non-taxable';
  if (/^L\d+/.test(employeeCode) || /LUMPSUM|LUMP SUM/.test(groupText)) return 'contract-lumpsum';
  const permanentStaffCode = /^P\d+/.test(employeeCode) || (/\bPERMANENT\b/.test(groupText) && !/\b(CONTRACT|DAILY RATE|DAY RATE|LUMPSUM|LUMP SUM)\b/.test(groupText));
  if (contractEmployeeCode(employee) && (Number(employee.ratePerDay || 0) > 0 || Number(employee.ratePerHour || 0) > 0)) return 'contract-day-rate';
  if (!permanentStaffCode && (isDailyRatePayrollEmployee(employee) || /DAILY RATE|DAY RATE/.test(groupText))) return 'contract-day-rate';
  if (contractEmployeeCode(employee)) return 'fallback';
  const isOtherContract = /CONTRACT|TEMPORARY|CASUAL/.test(groupText);
  if (isOtherContract) return 'fallback';
  if (employeeGradeKey(employee) === 'MGT7') return resolveMgt7Profile(employee, period);
  if (/MGTCOLA|MGT COLA|MANAGEMENTCOLA|MANAGEMENT COLA/.test(grade) || /\b(MGTCOLA|MGT COLA|MANAGEMENTCOLA|MANAGEMENT COLA)\b/.test(groupText)) return 'management-cola-permanent';
  if (/^(SNM|SMGT|SENIOR MANAGEMENT)/.test(grade) || /\b(SNM|SMGT|SENIOR MANAGEMENT)\b/.test(groupText)) return 'senior-management-permanent';
  if (/^(MGT|MGMT|MANAGEMENT)/.test(grade) || /\b(MGT|MGMT|MANAGEMENT)\b/.test(groupText)) return 'management-permanent';
  if (/^(SS|SNR|SENIOR)/.test(grade) || /\b(SENIOR|SNR)\b/.test(groupText)) return 'senior-permanent';
  if (/^(JS|JNR|JR|JUNIOR)/.test(grade) || /\b(JUNIOR|JNR)\b/.test(groupText)) return 'junior-permanent';
  return 'fallback';
};

const adjustmentIsPayeTaxable = (row: PayrollPeriodEarningAdjustment) => {
  if (isSagePayslipEarningSyncSource(row.source)) return Boolean(row.taxable);
  const code = compact(row.code).toUpperCase();
  if (/^(ARREARS|OVT|LEAVEALLOW|OVERTIME|SITEALL|SPECIAL_ALL|WKEND_ALL|NIGHT_ALLOW|MISC|OTHER_PAY)$/i.test(code)) return true;
  if (/^REFUND$/i.test(code)) return Boolean(row.taxable);
  return Boolean(row.taxable);
};

const canonicalEarningCode = (code: string) => {
  const upper = compact(code).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const aliases: Record<string, string> = {
    SNRHOUSING: 'SNRHOUSE',
    SNRHOU: 'SNRHOUSE',
    SNROTHALL: 'SNROTHERALL',
    SNRTRANSPORT: 'SNRTRANS',
    SNRUTILITIES: 'SNRUTILITY',
    JNRHOUSING: 'JNRHOUSE',
    JNRHOU: 'JNRHOUSE',
    JNROTHALL: 'JNROTHERALL',
    JNROTHERALL: 'JNROTHERALL',
    JNRTRANSPORT: 'JNRTRANS',
    JNRUTILITIES: 'JNRUTILITY',
    JNRUTILITY: 'JNRUTILITY',
    MGTHOUSING: 'MGTHOUSE',
    MGTOTHALL: 'MGTOTHERALL',
    MGTTRANSPORT: 'MGTTRANS',
    SNMHOUSING: 'SNMHOUSE',
    SNMHOUS: 'SNMHOUSE',
    SNMOTHALL: 'SNMOTHERALL',
    SNMBASICSALARY: 'SNMBASIC',
    SNMUTILITIES: 'SNMUTILITY',
    SNMTRANSPORT: 'SNMTRANS',
    MGT1COLAHOUSIN: 'MGT1COLAHOUSIN',
    MGTFURNTAX: 'MGTFURN',
    MGTOTHALLTAX: 'MGTOTHERALL',
    MGTUTILITYTAX: 'MGTUTILITY',
    JNRMEDICALTAX: 'JNRMEDICAL',
    JNRUTILITYTAX: 'JNRUTILITY',
    JNROTHALLTAX: 'JNROTHERALL',
    SNMHOUSINGTAX: 'SNMHOUSE',
    SNMOTHERALLTAX: 'SNMOTHERALL',
    SNMTRANSPTAX: 'SNMTRANS',
    PERMEALJNR: 'PERMEALJNR',
    EXPBASICTAX: 'EXPBASICTAX',
    EXPHOUSINGTAX: 'EXPHOUSINGTAX',
    EXPOTHALL: 'EXPOTHALL',
    EXPTRANSP: 'EXPTRANSP',
  };
  return aliases[upper] || upper;
};

const isSageStructuralEarningCode = (code: string) =>
  /^(MGT1COLA|MGT_|SNM_|SNR_|JNR_|EXP_|BASIC|SALARY|LUMPSUM|BASIC1)/i.test(String(code || ''));

const sageStructuralGradeFamily = (employee: DleEmployeeDirectoryRow, period?: string) => {
  const grade = effectivePayrollGrade(employee);
  if (/^EXP_/i.test(grade) || /\bUSD\b/i.test(grade)) return 'EXP';
  if (grade === 'MGT7') {
    const rows = readPeriodEarningAdjustmentsSync()
      .filter((row) => normalizedPeriod(row.period) === normalizedPeriod(period || process.env.HRIS_PAYROLL_ENTERPRISE_FROM || '2026-06'))
      .filter((row) => employeeAdjustmentMatched(employee, row));
    if (rows.some((row) => /^MGT_/i.test(String(row.code || '')))) return 'MGT';
    if (rows.some((row) => /^SNM/i.test(String(row.code || '')))) return 'SNM';
    return null;
  }
  if (/^MGT/i.test(grade)) return 'MGT';
  if (/^SNM|^SMGT|^SENIOR MANAGEMENT/i.test(grade)) return 'SNM';
  if (/^SNR|^SS/i.test(grade)) return 'SNR';
  if (/^JNR|^JS/i.test(grade)) return 'JNR';
  return null;
};

const sageStructuralLineMatchesGrade = (code: string, family: string | null) => {
  const upper = compact(code).toUpperCase();
  if (family === 'EXP' && (/^(SNM|PENSION_REFUND)/i.test(upper))) return false;
  if (!family) return true;
  if (!isSageStructuralEarningCode(upper)) return true;
  if (family === 'EXP') return /^EXP/i.test(upper);
  if (family === 'MGT') return /^MGT/i.test(upper);
  if (family === 'SNM') return /^(SNM|PENSION_REFUND)/i.test(upper);
  if (family === 'SNR') return /^SNR_/i.test(upper);
  if (family === 'JNR') return /^JNR_/i.test(upper);
  return true;
};

const sageSyncedStructuralAdjustments = (adjustments: PayrollEarningLine[]) =>
  adjustments.filter(
    (line) =>
      isSagePayslipEarningSyncSource(line.calculation)
      && isSageStructuralEarningCode(line.code),
  );

const mergeProfileLinesWithAdjustments = (profileLines: PayrollEarningLine[], adjustments: PayrollEarningLine[]) => {
  const merged = profileLines.map((line) => ({ ...line }));
  const indexByCanonical = new Map<string, number>();
  merged.forEach((line, index) => indexByCanonical.set(canonicalEarningCode(line.code), index));
  const extras: PayrollEarningLine[] = [];
  for (const adjustment of adjustments) {
    const canonical = canonicalEarningCode(adjustment.code);
    const profileIndex = indexByCanonical.get(canonical);
    if (profileIndex !== undefined) {
      merged[profileIndex] = {
        ...merged[profileIndex],
        amount: adjustment.amount,
        taxable: adjustment.taxable,
        name: adjustment.name || merged[profileIndex].name,
        calculation: adjustment.calculation || merged[profileIndex].calculation,
      };
      continue;
    }
    const directIndex = merged.findIndex((line) => line.code.toUpperCase() === adjustment.code.toUpperCase());
    if (directIndex >= 0) {
      merged[directIndex] = {
        ...merged[directIndex],
        amount: adjustment.amount,
        taxable: adjustment.taxable,
        name: adjustment.name || merged[directIndex].name,
        calculation: adjustment.calculation || merged[directIndex].calculation,
      };
      continue;
    }
    extras.push(adjustment);
  }
  return [...merged, ...extras];
};

const periodAdjustmentLines = (employee: DleEmployeeDirectoryRow, options?: PayrollEarningsOptions): PayrollEarningLine[] => {
  if (!options?.includePeriodAdjustments) return [];
  const period = normalizedPeriod(options.period);
  const salaryGrade = normalizedTextKey(employee.salaryGrade || employee.jobGrade);
  const profileId = resolvePayrollEarningProfile(employee);
  const structuralFamily = sageStructuralGradeFamily(employee, period);
  const matchedRows = readPeriodEarningAdjustmentsSync()
    .filter((row) => normalizedPeriod(row.period) === period)
    .filter((row) => {
      const employeeMatched = employeeAdjustmentMatched(employee, row);
      const gradeMatched = Array.isArray(row.salaryGrades) && row.salaryGrades.map(normalizedTextKey).includes(salaryGrade);
      const profileMatched = Array.isArray(row.profileIds) && row.profileIds.includes(profileId);
      return employeeMatched || gradeMatched || profileMatched;
    })
    .filter((row) => sageStructuralLineMatchesGrade(compact(row.code), structuralFamily))
    .filter((row) => !isPermanentPayrollEmployee(employee) || !isContractStyleEarningLine({ code: row.code, name: row.name }));
  const byCode = new Map<string, PayrollEarningLine & { priority: number }>();
  for (const row of matchedRows) {
    const line = {
      code: compact(row.code),
      name: compact(row.name || row.code),
      taxable: adjustmentIsPayeTaxable(row),
      percentOfGross: 0,
      calculation: row.source || 'Payroll period earning adjustment',
      runFrequency: 'formula' as const,
      includeInMonthlyPayroll: true,
      amount: roundMoney(num(row.amount)),
    };
    if (!line.code || line.amount === 0) continue;
    const codeKey = canonicalEarningCode(line.code);
    const priority = isSagePayslipEarningSyncSource(row.source) ? 2 : 1;
    const existing = byCode.get(codeKey);
    if (!existing || priority >= existing.priority) {
      byCode.set(codeKey, { ...line, priority });
    }
  }
  return [...byCode.values()].map(({ priority, ...line }) => line);
};

const leavePayrollEventLines = (employee: DleEmployeeDirectoryRow, periodGross: number, existingLines: PayrollEarningLine[], options?: PayrollEarningsOptions): PayrollEarningLine[] => {
  if (!options?.includePeriodAdjustments) return [];
  if (existingLines.some(isLeaveAllowanceLine)) return [];
  const period = normalizedPeriod(options.period);
  const adjustmentHasLeave = readPeriodEarningAdjustmentsSync()
    .filter((row) => normalizedPeriod(row.period) === period)
    .filter((row) => employeeAdjustmentMatched(employee, row))
    .some((row) => /LEAVEALLOW/i.test(String(row.code || '')));
  if (adjustmentHasLeave) return [];
  return leaveAllowanceEventsForEmployeePeriod(employee, options.period).map((event) => ({
    code: event.code || 'LEAVEALLOW',
    name: event.description || 'Leave Allowance',
    taxable: event.taxableAmount > 0,
    percentOfGross: periodGross > 0 ? roundMoney(event.amount / periodGross) : 0,
    calculation: `${event.source} - approved annual leave allowance for ${event.leaveYear}`,
    runFrequency: 'leave-period' as const,
    includeInMonthlyPayroll: true,
    amount: roundMoney(event.amount),
  })).filter((line) => line.amount !== 0);
};

const annualLeaveAllowanceLines = (lines: PayrollEarningLine[]) =>
  lines
    .filter((line) => line.runFrequency === 'leave-period' && line.code.includes('LEAVE') && !line.code.includes('LEAVE_ALLOW'))
    .map((line) => ({
      ...line,
      code: `${line.code}_ALLOW`,
      name: 'Leave Allowance',
      calculation: 'Paid once yearly as annual leave allowance',
      amount: roundMoney(line.amount * 12),
    }));

export const calculateAnnualLeaveAllowanceAmount = (employee: DleEmployeeDirectoryRow) => {
  const profileId = resolvePayrollEarningProfile(employee);
  if (profileId === 'fallback' || profileId === 'contract-day-rate' || profileId === 'stipend-non-taxable') return 0;
  const profile = PAYROLL_EARNING_PROFILES[profileId];
  const gross = monthlyGrossFromEmployee(employee);
  const leaveDefinition = profile.definitions.find((line) => line.runFrequency === 'leave-period' && line.code.includes('LEAVE'));
  return leaveDefinition ? roundMoney(gross * leaveDefinition.percentOfGross * 12) : 0;
};

const visibleEarningLines = (lines: PayrollEarningLine[], periodAdjustments: PayrollEarningLine[]) => [
  ...lines.filter((line) => line.runFrequency !== 'leave-period'),
  ...periodAdjustments.filter((line) => !line.code.includes('LEAVE_ALLOW')),
];

const fallbackAllowanceRate = (employee: DleEmployeeDirectoryRow) => {
  const type = compact(employee.employmentType || employee.staffCategory || employee.employeeCategory).toLowerCase();
  if (type.includes('daily')) return 0.08;
  if (type.includes('lumpsum') || type.includes('lump sum')) return 0.12;
  if (type.includes('it') || type.includes('nysc')) return 0.04;
  return 0.22;
};

export const calculatePayrollEarnings = (employee: DleEmployeeDirectoryRow, options?: PayrollEarningsOptions): PayrollEarningsResult => {
  const profileId = resolvePayrollEarningProfile(employee);
  const gross = monthlyGrossFromEmployee(employee);
  const profile = profileId === 'fallback' || profileId === 'contract-day-rate' || profileId === 'stipend-non-taxable' ? null : PAYROLL_EARNING_PROFILES[profileId];
  const sageLines = options?.useSagePayslipLines && !options?.ignoreSagePayslipLines ? sagePayslipEarningLines(employee) : [];
  if (sageLines.length > 0) {
    const fallbackProfileName = profileId === 'contract-day-rate'
      ? 'Contract Staff on Day Rate'
      : profileId === 'stipend-non-taxable'
        ? 'NYSC / IT Non-Taxable Stipend'
        : profileId === 'fallback'
          ? 'Payroll Setup Fallback'
          : profile?.name || 'Payroll Profile';
    const leaveEventLines = leavePayrollEventLines(employee, 0, sageLines, options);
    const paidLines = [...sageLines, ...leaveEventLines];
    const grossPay = roundMoney(paidLines.reduce((sum, line) => sum + line.amount, 0));
    const sageTaxablePay = roundMoney((employee.sagePayrollEarnings || []).reduce((sum, line) => {
      const amount = num(line.amount);
      const taxableAmount = line.taxableAmount === null || line.taxableAmount === undefined ? amount : num(line.taxableAmount);
      return sum + taxableAmount;
    }, 0));
    const taxablePay = roundMoney(sageTaxablePay + leaveEventLines.filter((line) => line.taxable).reduce((sum, line) => sum + line.amount, 0));
    const basicPay = roundMoney(paidLines.filter(isBasicLine).reduce((sum, line) => sum + line.amount, 0));
    const bhtPay = pensionablePayFromLines(paidLines).total;
    return {
      profileId,
      profileName: `${fallbackProfileName} - Sage Payslip Exact`,
      periodPackageGross: grossPay,
      grossPay,
      basePay: basicPay,
      basicPay,
      allowances: roundMoney(grossPay - basicPay),
      taxablePay,
      nonTaxablePay: roundMoney(grossPay - taxablePay),
      bhtPay,
      earningLines: paidLines.map((line) => ({ ...line, percentOfGross: grossPay ? line.amount / grossPay : 0 })),
      annualBenefitLines: [],
      paidEarningLines: paidLines.map((line) => ({ ...line, percentOfGross: grossPay ? line.amount / grossPay : 0 })),
    };
  }
  if (profileId === 'stipend-non-taxable') {
    const lines = [
      { code: 'STIPEND_NT', name: 'NYSC / IT STIPEND', taxable: false, percentOfGross: gross > 0 ? 1 : 0, amount: gross },
    ].filter((line) => line.amount > 0);
    return {
      profileId,
      profileName: 'NYSC / IT Non-Taxable Stipend',
      periodPackageGross: gross,
      grossPay: roundMoney(lines.reduce((sum, line) => sum + line.amount, 0)),
      basePay: 0,
      basicPay: 0,
      allowances: roundMoney(lines.reduce((sum, line) => sum + line.amount, 0)),
      taxablePay: 0,
      nonTaxablePay: roundMoney(lines.reduce((sum, line) => sum + line.amount, 0)),
      bhtPay: 0,
      earningLines: lines,
      annualBenefitLines: [],
      paidEarningLines: lines,
    };
  }
  if (profileId === 'contract-day-rate') {
    const ratePerDay = num(employee.ratePerDay) || (num(employee.ratePerHour) > 0 ? num(employee.ratePerHour) * (num(employee.hoursPerDay) || 8) : 0);
    const weekdayDays = ratePerDay > 0 ? gross / ratePerDay : (num(employee.hoursPerPeriod) > 0 && (num(employee.hoursPerDay) || 8) > 0 ? num(employee.hoursPerPeriod) / (num(employee.hoursPerDay) || 8) : 0);
    const resolvedRatePerDay = ratePerDay || (weekdayDays > 0 ? gross / weekdayDays : 0);
    const baseAmounts = contractDayRatePayrollResult({ ratePerDay: resolvedRatePerDay, daysWorked: weekdayDays });
    const supplemental = buildDailyRateSupplementalEarnings(employee, options);
    return supplemental.paidEarningLines.length
      ? mergeDailySupplementalEarnings(baseAmounts, supplemental)
      : baseAmounts;
  }
  if (profileId === 'contract-lumpsum') {
    const isBaseLumpsumCode = (code: string) => /^(LUMPSUMTAX|BASIC1_LUMPSUM)$/i.test(code);
    const periodAdjustments = [
      ...periodAdjustmentLines(employee, options),
      ...leavePayrollEventLines(employee, gross, [], options),
    ];
    const baseAdjustments = periodAdjustments.filter((line) => isBaseLumpsumCode(line.code));
    const supplementalAdjustments = periodAdjustments.filter((line) => !isBaseLumpsumCode(line.code));
    const coreLines = baseAdjustments.length > 0
      ? baseAdjustments
      : [{
          code: 'LUMPSUMTAX',
          name: 'LUMPSUM ALLOWANCE',
          taxable: true,
          percentOfGross: 1,
          calculation: 'Monthly lumpsum package',
          runFrequency: 'monthly' as const,
          includeInMonthlyPayroll: true,
          amount: roundMoney(gross),
        }];
    const monthlyLines = [...coreLines, ...supplementalAdjustments];
    const taxablePay = roundMoney(monthlyLines.filter((line) => line.taxable !== false).reduce((sum, line) => sum + line.amount, 0));
    const grossPay = roundMoney(monthlyLines.reduce((sum, line) => sum + line.amount, 0));
    const basicPay = roundMoney(coreLines.reduce((sum, line) => sum + line.amount, 0));
    return {
      profileId,
      profileName: 'Contract Staff on Lumpsum',
      periodPackageGross: gross,
      grossPay,
      basePay: basicPay,
      basicPay,
      allowances: roundMoney(grossPay - basicPay),
      taxablePay,
      nonTaxablePay: roundMoney(grossPay - taxablePay),
      bhtPay: basicPay,
      earningLines: monthlyLines,
      annualBenefitLines: [],
      paidEarningLines: monthlyLines,
    };
  }
  if (!profile) {
    const periodAdjustments = [
      ...periodAdjustmentLines(employee, options),
      ...leavePayrollEventLines(employee, gross, [], options),
    ];
    const sageStructural = sageSyncedStructuralAdjustments(periodAdjustments);
    if (sageStructural.length > 0) {
      const monthlyLines = periodAdjustments;
      const taxablePay = roundMoney(monthlyLines.filter((line) => line.taxable !== false).reduce((sum, line) => sum + line.amount, 0));
      const grossPay = roundMoney(monthlyLines.reduce((sum, line) => sum + line.amount, 0));
      const basicPay = roundMoney(monthlyLines.filter(isBasicLine).reduce((sum, line) => sum + line.amount, 0));
      return {
        profileId,
        profileName: 'Sage Synced Fallback Package',
        periodPackageGross: gross,
        grossPay,
        basePay: basicPay,
        basicPay,
        allowances: roundMoney(grossPay - basicPay),
        taxablePay,
        nonTaxablePay: roundMoney(grossPay - taxablePay),
        bhtPay: pensionablePayFromLines(monthlyLines).total,
        earningLines: monthlyLines,
        annualBenefitLines: [],
        paidEarningLines: monthlyLines,
      };
    }
    const basePay = gross;
    const allowances = roundMoney(basePay * fallbackAllowanceRate(employee));
    const grossPay = roundMoney(basePay + allowances);
    return {
      profileId,
      profileName: 'Payroll Setup Fallback',
      periodPackageGross: grossPay,
      grossPay,
      basePay: roundMoney(basePay),
      basicPay: roundMoney(basePay),
      allowances,
      taxablePay: grossPay,
      nonTaxablePay: 0,
      bhtPay: roundMoney(basePay),
      earningLines: [
        { code: 'BASIC', name: 'BASIC SALARY', taxable: true, percentOfGross: grossPay ? basePay / grossPay : 0, amount: roundMoney(basePay) },
        { code: 'ALLOWANCE', name: 'ALLOWANCES', taxable: true, percentOfGross: grossPay ? allowances / grossPay : 0, amount: allowances },
      ].filter((line) => line.amount > 0),
      annualBenefitLines: [],
      paidEarningLines: [
        { code: 'BASIC', name: 'BASIC SALARY', taxable: true, percentOfGross: grossPay ? basePay / grossPay : 0, amount: roundMoney(basePay) },
        { code: 'ALLOWANCE', name: 'ALLOWANCES', taxable: true, percentOfGross: grossPay ? allowances / grossPay : 0, amount: allowances },
      ].filter((line) => line.amount > 0),
    };
  }

  const periodAdjustments = [
    ...periodAdjustmentLines(employee, options),
    ...leavePayrollEventLines(employee, gross, [], options),
  ];
  const sageSyncedAdjustments = periodAdjustments.filter((line) => isSagePayslipEarningSyncSource(line.calculation));
  const sageStructuralAdjustments = sageSyncedStructuralAdjustments(periodAdjustments);
  const useSageAdjustmentsPrimary = sageStructuralAdjustments.length > 0
    || sageSyncedAdjustments.some((line) => /BASIC|SALARY|LUMPSUM/i.test(String(line.code || '')));
  if (useSageAdjustmentsPrimary) {
    const fixedMonthlyLines = [...seniorFixedMonthlyEarningLines(profileId, periodAdjustments), ...juniorFixedMonthlyEarningLines(profileId)];
    const profilePackageLines = profile.definitions.map((definition) => ({
      ...definition,
      amount: roundMoney(gross * definition.percentOfGross),
    }));
    const mergedBase = mergeProfileLinesWithAdjustments(fixedMonthlyLines, periodAdjustments);
    const presentCodes = new Set(mergedBase.map((line) => canonicalEarningCode(line.code)));
    const missingProfileLines = sageStructuralAdjustments.length > 0
      ? []
      : profilePackageLines.filter(
          (line) => line.runFrequency !== 'leave-period'
            && line.includeInMonthlyPayroll !== false
            && !presentCodes.has(canonicalEarningCode(line.code)),
        );
    const monthlyLines = [...mergedBase, ...missingProfileLines.filter((line) => line.amount > 0)];
    const mergedCodes = new Set(monthlyLines.map((line) => canonicalEarningCode(line.code)));
    for (const line of periodAdjustments) {
      const codeKey = canonicalEarningCode(line.code);
      if (!line.amount || mergedCodes.has(codeKey)) continue;
      monthlyLines.push(line);
      mergedCodes.add(codeKey);
    }
    const taxablePay = roundMoney(monthlyLines.filter((line) => line.taxable !== false).reduce((sum, line) => sum + line.amount, 0));
    const grossPay = roundMoney(monthlyLines.reduce((sum, line) => sum + line.amount, 0));
    const basicPay = roundMoney(monthlyLines.filter(isBasicLine).reduce((sum, line) => sum + line.amount, 0));
    return {
      profileId,
      profileName: `${profile.name} - Sage Synced Adjustments`,
      periodPackageGross: gross,
      grossPay,
      basePay: basicPay,
      basicPay,
      allowances: roundMoney(grossPay - basicPay),
      taxablePay,
      nonTaxablePay: roundMoney(grossPay - taxablePay),
      bhtPay: pensionablePayFromLines(monthlyLines).total,
      earningLines: monthlyLines,
      annualBenefitLines: [],
      paidEarningLines: monthlyLines,
    };
  }
  const regularLines = profile.definitions.map((definition) => ({
    ...definition,
    amount: roundMoney(gross * definition.percentOfGross),
  }));
  const fixedMonthlyLines = [...seniorFixedMonthlyEarningLines(profileId, periodAdjustments), ...juniorFixedMonthlyEarningLines(profileId)];
  const lines = withCategoryFormulaLines(profileId, [...regularLines, ...fixedMonthlyLines]);
  const monthlyLines = mergeProfileLinesWithAdjustments(monthlyPayrollLines(lines), periodAdjustments);
  const basicPay = lines.find((line) => line.code.endsWith('_BASIC'))?.amount || 0;
  const bhtPay = pensionablePayFromLines(monthlyLines).total;
  const taxablePay = roundMoney(monthlyLines.filter((line) => line.taxable !== false).reduce((sum, line) => sum + line.amount, 0));
  const nonTaxablePay = roundMoney(monthlyLines.filter((line) => line.taxable === false).reduce((sum, line) => sum + line.amount, 0));
  return {
    profileId,
    profileName: profile.name,
    periodPackageGross: gross,
    grossPay: roundMoney(monthlyLines.reduce((sum, line) => sum + line.amount, 0)),
    basePay: roundMoney(basicPay),
    basicPay: roundMoney(basicPay),
    allowances: roundMoney(monthlyLines.filter((line) => !line.code.endsWith('_BASIC')).reduce((sum, line) => sum + line.amount, 0)),
    taxablePay,
    nonTaxablePay,
    bhtPay,
    earningLines: visibleEarningLines(lines, periodAdjustments),
    annualBenefitLines: annualLeaveAllowanceLines(lines),
    paidEarningLines: monthlyLines,
  };
};

export const calculateContractDayRateEarnings = (input: {
  ratePerDay: number;
  weekdayDays?: number;
  weekdayOvertimeHours?: number;
  publicHolidayHours?: number;
  saturdayHours?: number;
  sundayHours?: number;
}) => {
  const ratePerDay = Math.max(0, num(input.ratePerDay));
  const ratePerHour = ratePerDay / 8;
  const weekdayDays = Math.max(0, num(input.weekdayDays));
  const weekdayBase = weekdayDays * ratePerDay;
  const lines: PayrollEarningLine[] = [
    { code: 'JCWEEKDAY', name: 'WEEKDAY EARNING', taxable: true, percentOfGross: 0.45, amount: roundMoney(weekdayBase * 0.45), calculation: '(No of days worked * Day rate) * 45%' },
    { code: 'JCWEEKDAY_NT', name: 'WEEKDAY ALLOWANCE NON TAX', taxable: false, percentOfGross: 0.55, amount: roundMoney(weekdayBase * 0.55), calculation: '(No of days worked * Day rate) * 55%' },
    { code: 'WEEKDAYOVT', name: 'WEEKDAY OVT EARNING', taxable: true, percentOfGross: 0, amount: roundMoney(ratePerHour * Math.max(0, num(input.weekdayOvertimeHours)) * 1.5), calculation: '(Day rate / 8) * hours worked * 1.5' },
    { code: 'PUBHOL', name: 'PUBLIC HOLIDAY EARNING', taxable: true, percentOfGross: 0, amount: roundMoney(ratePerHour * Math.max(0, num(input.publicHolidayHours)) * 2), calculation: '(Day rate / 8) * hours worked * 2' },
    { code: 'SATEARN', name: 'SATURDAY EARNING', taxable: true, percentOfGross: 0, amount: roundMoney(ratePerHour * Math.max(0, num(input.saturdayHours)) * 1.5), calculation: '(Day rate / 8) * hours worked * 1.5' },
    { code: 'SUNDAYEARN', name: 'SUNDAY EARNING', taxable: true, percentOfGross: 0, amount: roundMoney(ratePerHour * Math.max(0, num(input.sundayHours)) * 2), calculation: '(Day rate / 8) * hours worked * 2' },
  ].filter((line) => line.amount > 0);
  return {
    profileId: 'contract-day-rate' as const,
    profileName: 'Contract Staff on Day Rate',
    ratePerDay: roundMoney(ratePerDay),
    ratePerHour: roundMoney(ratePerHour),
    ...finalizeContractDayRateEarnings(lines, weekdayDays, ratePerDay),
  };
};

export const taxablePayrollInputFromEmployee = (employee: DleEmployeeDirectoryRow, options?: PayrollEarningsOptions, earningsOverride?: PayrollEarningsResult) => {
  const earnings = earningsOverride || calculatePayrollEarnings(employee, options);
  const paidLines = (earnings.paidEarningLines || earnings.earningLines) as PayrollEarningLine[];
  const pensionable = pensionablePayFromLines(paidLines);
  const bhtPay = earnings.bhtPay || pensionable.total || earnings.basicPay;
  return {
    employee,
    monthlyBasePay: bhtPay,
    monthlyAllowances: roundMoney(Math.max(0, earnings.taxablePay - (pensionable.basePay || earnings.basicPay))),
    monthlyGrossPay: earnings.grossPay,
    monthlyTaxablePay: payeTaxableFromPayrollEarnings(employee, earnings),
  };
};

export const pensionablePayrollInputFromEmployee = (employee: DleEmployeeDirectoryRow, options?: PayrollEarningsOptions) => {
  const earnings = calculatePayrollEarnings(employee, options);
  const paidLines = (earnings.paidEarningLines || earnings.earningLines) as PayrollEarningLine[];
  const pensionable = pensionablePayFromLines(paidLines);
  const basePay = pensionable.basePay || earnings.basicPay;
  const pensionableAllowances = pensionable.allowances || roundMoney(Math.max(0, earnings.taxablePay - earnings.basicPay));
  return {
    employee,
    monthlyBasePay: basePay,
    monthlyAllowances: pensionableAllowances,
    monthlyGrossPay: earnings.grossPay,
    monthlyPensionablePay: roundMoney(basePay + pensionableAllowances),
  };
};

export const calculatePermanentUnionDues = (employee: DleEmployeeDirectoryRow, options?: PayrollEarningsOptions) => {
  const earnings = calculatePayrollEarnings(employee, { ...options, includePeriodAdjustments: false });
  if (earnings.profileId === 'junior-permanent') {
    return {
      code: 'JNR_UNION_DUES',
      name: 'Jnr Union Dues',
      basis: '3% of Basic Earning',
      amount: roundMoney(earnings.basicPay * 0.03),
    };
  }
  if (earnings.profileId === 'senior-permanent') {
    return {
      code: 'SNR_UNION',
      name: 'Snr Union Dues',
      basis: '2.5% of Basic Earning',
      amount: roundMoney(earnings.basicPay * 0.025),
    };
  }
  return {
    code: 'UNION_DUES',
    name: titleCase('UNION DUES'),
    basis: 'Fallback payroll configuration',
    amount: 0,
  };
};

export const calculatePayrollOvertime = (employee: DleEmployeeDirectoryRow, dayType: OvertimeDayType, hours: number) => {
  const earnings = calculatePayrollEarnings(employee);
  const isJunior = earnings.profileId === 'junior-permanent';
  const rule = isJunior ? JUNIOR_OVERTIME_RULES[dayType] : JUNIOR_OVERTIME_RULES[dayType];
  const baseHourlyRate = earnings.basicPay > 0 ? earnings.basicPay / rule.divisor : 0;
  const payableHours = Math.max(0, num(hours));
  return {
    code: isJunior ? rule.code : `${dayType.toUpperCase().replace(/\s+/g, '_')}_OVT`,
    name: isJunior ? rule.name : `${dayType.toUpperCase()} OVERTIME`,
    taxable: rule.taxable,
    multiplier: rule.multiplier,
    divisor: rule.divisor,
    basis: isJunior ? 'Basic / 176' : 'Basic / 176',
    basicPay: roundMoney(earnings.basicPay),
    hourlyRate: roundMoney(baseHourlyRate),
    amount: roundMoney(baseHourlyRate * rule.multiplier * payableHours),
    earningProfileId: earnings.profileId,
    earningProfileName: earnings.profileName,
  };
};
