import type { DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import { resolvePayrollEarningProfile } from '@/lib/payroll-earnings-engine';

const compact = (value: unknown) => String(value || '').trim();

export type ContractPayrollClassification = {
  isContractCode: boolean;
  isDailyRate: boolean;
  shouldDeactivate: boolean;
  payrollEligible: boolean;
  label: string;
  recommendation: string | null;
};

export const contractEmployeeCode = (employee: Pick<DleEmployeeDirectoryRow, 'employeeId' | 'employeeCode' | 'sourceEmployeeId'>) => {
  const code = compact(employee.employeeCode || employee.employeeId || employee.sourceEmployeeId).toUpperCase();
  return /^C\d+/.test(code);
};

const payrollCategoryText = (employee: DleEmployeeDirectoryRow) =>
  [employee.employmentType, employee.payrollGroup, employee.paymentRun, employee.paymentType, employee.staffCategory, employee.employeeCategory]
    .map(compact)
    .join(' ')
    .toLowerCase();

const payrollCategoryTextUpper = (employee: DleEmployeeDirectoryRow) => payrollCategoryText(employee).toUpperCase();

const employeeCodeText = (employee: Pick<DleEmployeeDirectoryRow, 'employeeId' | 'employeeCode' | 'sourceEmployeeId'>) =>
  compact(employee.employeeCode || employee.employeeId || employee.sourceEmployeeId).toUpperCase();

export const DEFAULT_IT_NYSC_STIPEND_GRADE = 'IT_NYSC_REM - IT_NYSC';

/** IT / NYSC stipend employees identified by code or employment category text. */
export const isStipendPayrollEmployeeCode = (
  employee: Pick<DleEmployeeDirectoryRow, 'employeeCode' | 'employeeId' | 'employmentType' | 'staffCategory' | 'employeeCategory' | 'jobTitle'>,
) => {
  const code = employeeCodeText(employee);
  const text = payrollCategoryTextUpper(employee);
  return /^(P?IT|IT|I|P?NYSC|NYSC|N)\d+/.test(code)
    || /\b(INDUSTRIAL TRAINING|INDUSTRIAL TRAINEE|INTERN|NYSC|NATIONAL YOUTH SERVICE)\b/.test(text);
};

const positiveMoney = (value: unknown) => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
};

/** Median monthly stipend from configured IT/NYSC peers, with env/default fallback. */
export const stipendReferenceMonthlyGross = (employees: DleEmployeeDirectoryRow[]) => {
  const fromEnv = Number(process.env.HRIS_DEFAULT_IT_NYSC_STIPEND_NGN || 0);
  if (fromEnv > 0) return Math.round(fromEnv * 100) / 100;
  const salaries = employees
    .filter(isStipendPayrollEmployeeCode)
    .map((employee) => positiveMoney(employee.periodSalary) || positiveMoney(employee.annualSalary) / 12)
    .filter((value) => value > 0)
    .sort((a, b) => a - b);
  if (salaries.length) return salaries[Math.floor(salaries.length / 2)];
  return 100000;
};

/** Contract, lump sum, NYSC, and industrial training employees use the non-permanent payslip template. */
export const isNonPermanentPayrollEmployee = (employee: DleEmployeeDirectoryRow) => {
  const code = employeeCodeText(employee);
  const text = payrollCategoryTextUpper(employee);
  return /^(C|L|NYSC|IT)\d+/.test(code)
    || /\b(DAILY RATE|DAY RATE|LUMPSUM|LUMP SUM|NYSC|NATIONAL YOUTH SERVICE|INDUSTRIAL TRAINING|INDUSTRIAL TRAINEE|INTERN)\b/.test(text);
};

export const isPermanentPayrollEmployee = (employee: DleEmployeeDirectoryRow) => !isNonPermanentPayrollEmployee(employee);

export const isContractStyleEarningLine = (line: { code?: string; name?: string }) => {
  const code = String(line.code || '').trim().toUpperCase();
  const name = String(line.name || '').trim().toUpperCase();
  return /^(JCWEEKDAY|JCWEEKDAY_NT|WEEKDAYOVT|PUBHOL|PUBLIC_OVT|SATEARN|SUNDAYEARN|SATURDAY_OVT|SUNDAY_OVT|OVT|PER_MEAL|MEAL)/.test(code)
    || /\b(WEEKDAY EARNING|MEAL ALLOWANCE|PUBLIC HOLIDAY|SATURDAY OVERTIME|SUNDAY OVERTIME|OVERTIME EARNING)\b/.test(name);
};

/** Permanent-staff payslip lines use structural MGT/SNR/JNR codes — not contract day-rate JCWEEKDAY rows. */
export const permanentStyleSageEarnings = (lines: Array<{ code?: string; name?: string }>) =>
  lines.some((line) => /^(MGT|SNR|JNR|SNM|MGT1COLA|MONTHLY|BASIC|PER_)/i.test(String(line.code || line.name || '')));

/** Contract / day-rate payslip lines that must never be shown for permanent staff. */
export const contractStyleSageEarnings = (lines: Array<{ code?: string; name?: string }>) => {
  if (!lines?.length) return false;
  return lines.some((line) => isContractStyleEarningLine(line)) && !permanentStyleSageEarnings(lines);
};

/** Drop contract day-rate lines from permanent payslips (e.g. when MGT1COLA lines are also present). */
export const sanitizePermanentPayslipEarnings = <T extends { code?: string; name?: string; amount?: number }>(lines: T[]) => {
  if (!lines.length) return lines;
  if (!permanentStyleSageEarnings(lines)) return lines;
  return lines.filter((line) => !isContractStyleEarningLine(line));
};

export const sagePayslipAcceptableForEmployee = (
  lines: Array<{ code?: string; name?: string }>,
  nonPermanentPayroll: boolean,
) => {
  const positive = (lines || []).filter((line) => String(line.code || line.name || '').trim());
  if (!positive.length) return false;
  if (nonPermanentPayroll) return true;
  if (!permanentStyleSageEarnings(positive)) return false;
  if (positive.some((line) => isContractStyleEarningLine(line))) return false;
  return true;
};

export const isSagePayslipEarningSyncSource = (value?: string | null) =>
  /sage payslip (?:supplemental |period )?earning sync/i.test(String(value || '').trim());

const explicitDailyRatePayroll = (text: string) =>
  /\b(daily rate|day rate|daily-rate|day-rate)\b/.test(text)
  || (/\bdaily\b/.test(text) && !/\bpermanent\b/.test(text));

/** True when the employee is on attendance-driven daily / day-rate payroll. */
export const isDailyRatePayrollEmployee = (employee: DleEmployeeDirectoryRow, profileId?: string) => {
  if (profileId === 'contract-day-rate') return true;
  if (contractEmployeeCode(employee) && (Number(employee.ratePerDay || 0) > 0 || Number(employee.ratePerHour || 0) > 0)) return true;
  const text = payrollCategoryText(employee);
  if (explicitDailyRatePayroll(text)) return true;
  if (contractEmployeeCode(employee) && Number(employee.ratePerDay || 0) > 0 && explicitDailyRatePayroll(text)) return true;
  return false;
};

/** C-coded staff who are not on daily-rate payroll should be inactive and excluded from payroll runs. */
export const isInactiveNonDailyContractEmployee = (employee: DleEmployeeDirectoryRow, profileId?: string) =>
  contractEmployeeCode(employee) && !isDailyRatePayrollEmployee(employee, profileId);

export const contractPayrollClassification = (employee: DleEmployeeDirectoryRow): ContractPayrollClassification => {
  const profileId = resolvePayrollEarningProfile(employee);
  const isContractCode = contractEmployeeCode(employee);
  const isDailyRate = isDailyRatePayrollEmployee(employee, profileId);
  const shouldDeactivate = isInactiveNonDailyContractEmployee(employee, profileId);
  const payrollEligible = !shouldDeactivate && !compact(employee.status).toLowerCase().match(/terminated|resigned|retired|inactive|deceased/);
  let label = 'Not a contract code';
  let recommendation: string | null = null;
  if (isContractCode && isDailyRate) {
    label = 'Daily rate contract';
    recommendation = null;
  } else if (shouldDeactivate) {
    label = 'Contract — not daily rate';
    recommendation = 'Deactivate this employee or set up daily-rate payroll (employment type Daily Rate / DLE).';
  } else if (isContractCode) {
    label = 'Contract code';
  }
  return { isContractCode, isDailyRate, shouldDeactivate, payrollEligible, label, recommendation };
};

export const markInactiveNonDailyContractEmployees = (employees: DleEmployeeDirectoryRow[]) =>
  employees.map((employee) => {
    if (!isInactiveNonDailyContractEmployee(employee)) return employee;
    return {
      ...employee,
      status: 'Inactive',
      employmentType: employee.employmentType || 'Contract',
    };
  });

export const payrollActiveEmployees = (employees: DleEmployeeDirectoryRow[]) =>
  markInactiveNonDailyContractEmployees(employees).filter((employee) => !isInactiveNonDailyContractEmployee(employee));

export type PayrollRunExclusionEmployee = DleEmployeeDirectoryRow & { excludedFromPayrollRun?: boolean };

export const isEmployeeExcludedFromPayrollRun = (employee: PayrollRunExclusionEmployee) => Boolean(employee.excludedFromPayrollRun);

/** Daily-rate contract with no configured rate (blocked until rate or timesheet is set). */
export const isUnconfiguredDailyRateContractEmployee = (employee: DleEmployeeDirectoryRow, profileId?: string) => {
  if (!contractEmployeeCode(employee)) return false;
  if (!isDailyRatePayrollEmployee(employee, profileId)) return false;
  return Number(employee.ratePerDay || 0) <= 0 && Number(employee.ratePerHour || 0) <= 0;
};

export const isRemovableDailyRatePayrollRecord = (record: {
  employeeCode: string;
  employeeId: string;
  payrollStatus: string;
  isDailyRate: boolean;
  ratePerDay: number | null;
  ratePerHour: number | null;
  grossPay: number;
  exceptions: string[];
}) => {
  const code = compact(record.employeeCode || record.employeeId).toUpperCase();
  if (!/^C\d+/.test(code)) return false;
  if (!record.isDailyRate) return false;
  if (record.payrollStatus !== 'Blocked') return false;
  const noRate = Number(record.ratePerDay || 0) <= 0 && Number(record.ratePerHour || 0) <= 0;
  const missingGross = record.grossPay <= 0;
  const missingTimesheet = record.exceptions.some((issue) => /timesheet hours are not available/i.test(issue));
  return noRate && missingGross && missingTimesheet;
};

export const withContractPayrollClassification = <T extends DleEmployeeDirectoryRow>(employee: T) => ({
  ...employee,
  payrollClassification: contractPayrollClassification(employee),
});
