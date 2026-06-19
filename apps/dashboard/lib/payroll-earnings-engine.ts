import type { DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import { leaveAllowanceEventsForEmployeePeriod } from '@/lib/payroll-leave-allowance-store';

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
  grossPay: number;
  basePay: number;
  basicPay: number;
  allowances: number;
  taxablePay: number;
  nonTaxablePay: number;
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

const roundMoney = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
const compact = (value: unknown) => String(value || '').trim();
const num = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
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
      { code: 'MGT_LEAVE', name: 'LEAVE', taxable: true, percentOfGross: 0.0319, runFrequency: 'leave-period', includeInMonthlyPayroll: false },
      { code: 'MGT_OTHERALL', name: 'OTHER ALLOWANCE', taxable: true, percentOfGross: 0.29 },
      { code: 'MGT_TRANS', name: 'TRANSPORT ALLOWANCE', taxable: true, percentOfGross: 0.15 },
      { code: 'MGT_FURN', name: 'FURNITURE ALLOWANCE', taxable: true, percentOfGross: 0.04 },
      { code: 'MGT_UTILITY', name: 'UTILITIES', taxable: true, percentOfGross: 0.0387 },
    ],
  },
  'management-cola-permanent': {
    name: 'Permanent Management COLA Staff',
    definitions: [
      { code: 'MGTCOLA_BASIC', name: 'BASIC SALARY', taxable: true, percentOfGross: 0.4 },
      { code: 'MGTCOLA_HOUSE', name: 'HOUSING', taxable: true, percentOfGross: 0.16 },
      { code: 'MGTCOLA_LEAVE', name: 'LEAVE', taxable: true, percentOfGross: 0.0256, runFrequency: 'leave-period', includeInMonthlyPayroll: false },
      { code: 'MGTCOLA_OTHERALL', name: 'OTHER ALLOWANCE', taxable: true, percentOfGross: 0.232 },
      { code: 'MGTCOLA_TRANS', name: 'TRANSPORT ALLOWANCE', taxable: true, percentOfGross: 0.12 },
      { code: 'MGTCOLA_FURN', name: 'FURNITURE ALLOWANCE', taxable: true, percentOfGross: 0.032 },
      { code: 'MGTCOLA_UTILITY', name: 'UTILITIES', taxable: true, percentOfGross: 0.0304 },
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
      { code: 'BASIC_LUMPSUM', name: 'LUMPSUM AMOUNT', taxable: true, percentOfGross: 0.6 },
      { code: 'BASIC_LUMPSUM_NT', name: 'LUMPSUM AMOUNT NONTAXABLE', taxable: false, percentOfGross: 0.4 },
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

const seniorFixedMonthlyEarningLines = (profileId: PayrollEarningProfileId): PayrollEarningLine[] => {
  if (profileId !== 'senior-permanent') return [];
  return [
    { ...SENIOR_FIXED_MONTHLY_EARNING_DEFINITIONS[0], amount: 22000 },
    { ...SENIOR_FIXED_MONTHLY_EARNING_DEFINITIONS[1], amount: 15000 },
  ];
};

const monthlyPayrollLines = (lines: PayrollEarningLine[]) => lines.filter((line) => line.includeInMonthlyPayroll !== false);

const withCategoryFormulaLines = (profileId: PayrollEarningProfileId, lines: PayrollEarningLine[]) => {
  if (profileId === 'junior-permanent') return [...lines, ...JUNIOR_OVERTIME_EARNING_LINES];
  return lines;
};

const isBasicLine = (line: PayrollEarningLine) => /BASIC|LUMPSUM|JCWEEKDAY$/.test(line.code) || /BASIC|LUMPSUM|WEEKDAY EARNING/.test(line.name);
const isHousingLine = (line: PayrollEarningLine) => /HOUSE/.test(line.code) || /HOUSING/.test(line.name);
const isTransportLine = (line: PayrollEarningLine) => /TRANS/.test(line.code) || /TRANSPORT/.test(line.name);

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

const isLeaveAllowanceLine = (line: Pick<PayrollEarningLine, 'code' | 'name'>) => {
  const text = `${line.code || ''} ${line.name || ''}`.toUpperCase();
  return text.includes('LEAVEALLOW') || text.includes('LEAVE ALLOWANCE') || /(^|_)LEAVE(TAX)?($|_)/.test(String(line.code || '').toUpperCase());
};

export const monthlyGrossFromEmployee = (employee: DleEmployeeDirectoryRow) =>
  roundMoney(num(employee.periodSalary) || (num(employee.annualSalary) > 0 ? num(employee.annualSalary) / 12 : 0));

export const resolvePayrollEarningProfile = (employee: DleEmployeeDirectoryRow): PayrollEarningProfileId => {
  const grade = compact(employee.salaryGrade || employee.jobGrade).toUpperCase();
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
  if (/^C\d+/.test(employeeCode) || /DAILY RATE|DAY RATE/.test(groupText)) return 'contract-day-rate';
  const isOtherContract = /CONTRACT|TEMPORARY|CASUAL/.test(groupText);
  if (isOtherContract) return 'fallback';
  if (/MGTCOLA|MGT COLA|MANAGEMENTCOLA|MANAGEMENT COLA/.test(grade) || /\b(MGTCOLA|MGT COLA|MANAGEMENTCOLA|MANAGEMENT COLA)\b/.test(groupText)) return 'management-cola-permanent';
  if (/^(SNM|SMGT|SENIOR MANAGEMENT)/.test(grade) || /\b(SNM|SMGT|SENIOR MANAGEMENT)\b/.test(groupText)) return 'senior-management-permanent';
  if (/^(MGT|MGMT|MANAGEMENT)/.test(grade) || /\b(MGT|MGMT|MANAGEMENT)\b/.test(groupText)) return 'management-permanent';
  if (/^(SS|SNR|SENIOR)/.test(grade) || /\b(SENIOR|SNR)\b/.test(groupText)) return 'senior-permanent';
  if (/^(JS|JNR|JR|JUNIOR)/.test(grade) || /\b(JUNIOR|JNR)\b/.test(groupText)) return 'junior-permanent';
  return 'fallback';
};

const periodAdjustmentLines = (options?: PayrollEarningsOptions): PayrollEarningLine[] => {
  if (!options?.includePeriodAdjustments) return [];
  const adjustments: PayrollEarningLine[] = [];

  return adjustments;
};

const leavePayrollEventLines = (employee: DleEmployeeDirectoryRow, periodGross: number, existingLines: PayrollEarningLine[], options?: PayrollEarningsOptions): PayrollEarningLine[] => {
  if (!options?.includePeriodAdjustments) return [];
  if (existingLines.some(isLeaveAllowanceLine)) return [];
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
  const sageLines = options?.useSagePayslipLines && !options.ignoreSagePayslipLines ? sagePayslipEarningLines(employee) : [];
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
    return {
      profileId,
      profileName: `${fallbackProfileName} - Sage Payslip Exact`,
      grossPay,
      basePay: basicPay,
      basicPay,
      allowances: roundMoney(grossPay - basicPay),
      taxablePay,
      nonTaxablePay: roundMoney(grossPay - taxablePay),
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
      grossPay: roundMoney(lines.reduce((sum, line) => sum + line.amount, 0)),
      basePay: 0,
      basicPay: 0,
      allowances: roundMoney(lines.reduce((sum, line) => sum + line.amount, 0)),
      taxablePay: 0,
      nonTaxablePay: roundMoney(lines.reduce((sum, line) => sum + line.amount, 0)),
      earningLines: lines,
      annualBenefitLines: [],
      paidEarningLines: lines,
    };
  }
  if (profileId === 'contract-day-rate') {
    const lines = [
      { code: 'JCWEEKDAY', name: 'WEEKDAY EARNING', taxable: true, percentOfGross: 0.45, amount: roundMoney(gross * 0.45) },
      { code: 'JCWEEKDAY_NT', name: 'WEEKDAY ALLOWANCE NON TAX', taxable: false, percentOfGross: 0.55, amount: roundMoney(gross * 0.55) },
    ].filter((line) => line.amount > 0);
    return {
      profileId,
      profileName: 'Contract Staff on Day Rate',
      grossPay: roundMoney(lines.reduce((sum, line) => sum + line.amount, 0)),
      basePay: roundMoney(lines.find((line) => line.code === 'JCWEEKDAY')?.amount || 0),
      basicPay: roundMoney(lines.find((line) => line.code === 'JCWEEKDAY')?.amount || 0),
      allowances: roundMoney(lines.filter((line) => line.code !== 'JCWEEKDAY').reduce((sum, line) => sum + line.amount, 0)),
      taxablePay: roundMoney(lines.filter((line) => line.taxable).reduce((sum, line) => sum + line.amount, 0)),
      nonTaxablePay: roundMoney(lines.filter((line) => !line.taxable).reduce((sum, line) => sum + line.amount, 0)),
      earningLines: lines,
      annualBenefitLines: [],
      paidEarningLines: lines,
    };
  }
  if (!profile) {
    const basePay = gross;
    const allowances = roundMoney(basePay * fallbackAllowanceRate(employee));
    const grossPay = roundMoney(basePay + allowances);
    return {
      profileId,
      profileName: 'Payroll Setup Fallback',
      grossPay,
      basePay: roundMoney(basePay),
      basicPay: roundMoney(basePay),
      allowances,
      taxablePay: grossPay,
      nonTaxablePay: 0,
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

  const regularLines = profile.definitions.map((definition) => ({
    ...definition,
    amount: roundMoney(gross * definition.percentOfGross),
  }));
  const fixedMonthlyLines = seniorFixedMonthlyEarningLines(profileId);
  const lines = withCategoryFormulaLines(profileId, [...regularLines, ...fixedMonthlyLines]);
  const periodAdjustments = [
    ...periodAdjustmentLines(options),
    ...leavePayrollEventLines(employee, gross, lines, options),
  ];
  const monthlyLines = [...monthlyPayrollLines(lines), ...periodAdjustments];
  const basicPay = lines.find((line) => line.code.endsWith('_BASIC'))?.amount || 0;
  const taxablePay = roundMoney(monthlyLines.filter((line) => line.taxable).reduce((sum, line) => sum + line.amount, 0));
  const nonTaxablePay = roundMoney(monthlyLines.filter((line) => !line.taxable).reduce((sum, line) => sum + line.amount, 0));
  return {
    profileId,
    profileName: profile.name,
    grossPay: roundMoney(monthlyLines.reduce((sum, line) => sum + line.amount, 0)),
    basePay: roundMoney(basicPay),
    basicPay: roundMoney(basicPay),
    allowances: roundMoney(monthlyLines.filter((line) => !line.code.endsWith('_BASIC')).reduce((sum, line) => sum + line.amount, 0)),
    taxablePay,
    nonTaxablePay,
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
  const weekdayBase = Math.max(0, num(input.weekdayDays)) * ratePerDay;
  const lines = [
    { code: 'JCWEEKDAY', name: 'WEEKDAY EARNING', taxable: true, amount: roundMoney(weekdayBase * 0.45), calculation: '(No of days worked * Day rate) * 45%' },
    { code: 'JCWEEKDAY_NT', name: 'WEEKDAY ALLOWANCE NON TAX', taxable: false, amount: roundMoney(weekdayBase * 0.55), calculation: '(No of days worked * Day rate) * 55%' },
    { code: 'WEEKDAYOVT', name: 'WEEKDAY OVT EARNING', taxable: true, amount: roundMoney(ratePerHour * Math.max(0, num(input.weekdayOvertimeHours)) * 1.5), calculation: '(Day rate / 8) * hours worked * 1.5' },
    { code: 'PUBHOL', name: 'PUBLIC HOLIDAY EARNING', taxable: true, amount: roundMoney(ratePerHour * Math.max(0, num(input.publicHolidayHours)) * 2), calculation: '(Day rate / 8) * hours worked * 2' },
    { code: 'SATEARN', name: 'SATURDAY EARNING', taxable: true, amount: roundMoney(ratePerHour * Math.max(0, num(input.saturdayHours)) * 1.5), calculation: '(Day rate / 8) * hours worked * 1.5' },
    { code: 'SUNDAYEARN', name: 'SUNDAY EARNING', taxable: true, amount: roundMoney(ratePerHour * Math.max(0, num(input.sundayHours)) * 2), calculation: '(Day rate / 8) * hours worked * 2' },
  ].filter((line) => line.amount > 0);
  return {
    profileId: 'contract-day-rate' as const,
    profileName: 'Contract Staff on Day Rate',
    ratePerDay: roundMoney(ratePerDay),
    ratePerHour: roundMoney(ratePerHour),
    taxablePay: roundMoney(lines.filter((line) => line.taxable).reduce((sum, line) => sum + line.amount, 0)),
    nonTaxablePay: roundMoney(lines.filter((line) => !line.taxable).reduce((sum, line) => sum + line.amount, 0)),
    grossPay: roundMoney(lines.reduce((sum, line) => sum + line.amount, 0)),
    earningLines: lines,
  };
};

export const taxablePayrollInputFromEmployee = (employee: DleEmployeeDirectoryRow, options?: PayrollEarningsOptions) => {
  const earnings = calculatePayrollEarnings(employee, options);
  const pensionable = pensionablePayFromLines(earnings.paidEarningLines);
  return {
    employee,
    monthlyBasePay: pensionable.total || earnings.basicPay,
    monthlyAllowances: roundMoney(Math.max(0, earnings.taxablePay - (pensionable.total || earnings.basicPay))),
    monthlyGrossPay: earnings.grossPay,
    monthlyTaxablePay: earnings.taxablePay,
  };
};

export const pensionablePayrollInputFromEmployee = (employee: DleEmployeeDirectoryRow, options?: PayrollEarningsOptions) => {
  const earnings = calculatePayrollEarnings(employee, options);
  const pensionable = pensionablePayFromLines(earnings.paidEarningLines);
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

export const calculatePermanentUnionDues = (employee: DleEmployeeDirectoryRow) => {
  const earnings = calculatePayrollEarnings(employee);
  if (earnings.profileId === 'junior-permanent') {
    return {
      code: 'JNR_UNION_DUES',
      name: 'JUNIOR UNION DUES',
      basis: '3% of Basic Earning',
      amount: roundMoney(earnings.basicPay * 0.03),
    };
  }
  if (['senior-permanent', 'management-permanent', 'management-cola-permanent', 'senior-management-permanent'].includes(earnings.profileId)) {
    const duesBasis = monthlyGrossFromEmployee(employee) || earnings.grossPay;
    return {
      code: 'SNR_UNION_DUES',
      name: 'SENIOR UNION DUES',
      basis: '(Monthly Salary * 26%) * 4%',
      amount: roundMoney(duesBasis * 0.26 * 0.04),
    };
  }
  return {
    code: 'UNION_DUES',
    name: 'UNION DUES',
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
