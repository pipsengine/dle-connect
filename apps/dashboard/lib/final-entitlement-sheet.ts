/**
 * DLE Final Entitlement Sheet — official exit settlement layout and arithmetic.
 * Client-safe. Do not import server stores from here.
 */
import { defaultChargeableDatesInPeriod, type LeaveHoliday } from '@/lib/leave-day-engine';
import {
  formatFinalPayrollDate,
  periodLabelFromCode,
  roundFinalPayrollMoney,
  type FinalEntitlementSnapshot,
  type FinalPayrollLine,
  type FinalPayrollSettlement,
} from '@/lib/final-payroll-settlement-shared';

export type { FinalEntitlementSnapshot };

export const DLE_ANNUAL_WORKING_DAYS = 248;

export type EntitlementHoliday = string | LeaveHoliday;

export type FinalEntitlementRow = {
  id: string;
  label: string;
  amount: number;
};

export type FinalEntitlementSheet = {
  title: string;
  employeeName: string;
  employeeCode: string;
  designation: string;
  department: string;
  dateOfEmployment: string | null;
  dateOfExit: string | null;
  leaveYear: number;
  daysWorkedInYear: number;
  totalWorkingDays: number;
  annualLeaveAllowance: number;
  leaveAllowancePaid: boolean;
  currency: 'NGN' | 'USD';
  allowances: FinalEntitlementRow[];
  deductions: FinalEntitlementRow[];
  amountDueToEmployee: number;
  amountDueToDle: number;
  netDueToEmployee: number;
  preparedBy: string;
  preparedDate: string | null;
  approvedBy: string;
  approvedDate: string | null;
};

export const roundEntitlementMoney = roundFinalPayrollMoney;

/** Official sheet posts whole naira (228,222.41 → 228,222.00). */
export const roundOfficialSheetAmount = (value: number) =>
  Math.round(Number.isFinite(value) ? value : 0);

const OFFICIAL_ALLOWANCE_IDS = ['leave-allowance', 'gross-salary', 'gratuity'] as const;
const OFFICIAL_DEDUCTION_IDS = ['loans', 'prorated-leave', 'pension', 'union-dues', 'paye'] as const;
const SHEET_EARNING_IDS = new Set(['leave-allowance', 'gross-salary', 'salary-lwd', 'earned-allowances', 'gratuity', 'leave-encashment']);
const SHEET_DEDUCTION_IDS = new Set(['staff-loan', 'cash-advance', 'prorated-leave', 'pension', 'union-dues', 'paye']);

const compact = (value: unknown) => String(value || '').trim();

const LONG_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const isoDate = (value?: string | null) => {
  const raw = compact(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  return '';
};

const utcParts = (value?: string | null) => {
  const iso = isoDate(value);
  if (!iso) return null;
  const date = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth(),
    day: date.getUTCDate(),
  };
};

export const daysInCalendarMonth = (iso?: string | null) => {
  const parts = utcParts(iso);
  if (!parts) return 30;
  return new Date(Date.UTC(parts.year, parts.month + 1, 0)).getUTCDate();
};

/** Calendar days from the 1st of the exit month through the last working day. */
export const exitMonthDaysWorked = (lastWorkingDay?: string | null) => {
  const parts = utcParts(lastWorkingDay);
  if (!parts) return 0;
  return Math.max(1, Math.min(parts.day, daysInCalendarMonth(lastWorkingDay)));
};

export const prorateMonthlyAmount = (monthlyAmount: number, lastWorkingDay?: string | null) => {
  const days = exitMonthDaysWorked(lastWorkingDay);
  const monthDays = daysInCalendarMonth(lastWorkingDay);
  if (!days || !monthDays) return 0;
  return roundEntitlementMoney((Number(monthlyAmount || 0) / monthDays) * days);
};

const ordinal = (value: number) => {
  const remainder = value % 100;
  if (remainder >= 11 && remainder <= 13) return `${value}th`;
  switch (value % 10) {
    case 1: return `${value}st`;
    case 2: return `${value}nd`;
    case 3: return `${value}rd`;
    default: return `${value}th`;
  }
};

export const formatEntitlementDate = (value?: string | null) => {
  const parts = utcParts(value);
  if (!parts) return compact(value) || '—';
  return `${parts.day} ${LONG_MONTHS[parts.month]} ${parts.year}`;
};

export const salaryEarnedLabel = (lastWorkingDay?: string | null) => {
  const parts = utcParts(lastWorkingDay);
  if (!parts) return 'Salary Earned';
  return `Salary Earned (1st - ${ordinal(parts.day)} ${LONG_MONTHS[parts.month]} ${parts.year})`;
};

export const formatEntitlementMoney = (amount: number, emptyZero = true) => {
  const value = roundOfficialSheetAmount(amount);
  if (emptyZero && value === 0) return '-';
  const formatted = Math.abs(value).toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return value < 0 ? `-${formatted}` : formatted;
};

/** Header leave-allowance figure keeps kobo (465,962.92). */
export const formatEntitlementHeaderMoney = (amount: number) => {
  const value = roundEntitlementMoney(amount);
  if (value === 0) return '-';
  const formatted = Math.abs(value).toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return value < 0 ? `-${formatted}` : formatted;
};

/** Statutory Nigerian work holidays — excludes observances such as Valentine's or Children's Day. */
export const isStatutoryNigeriaWorkHoliday = (label?: string | null) => {
  const text = compact(label);
  if (!text) return true;
  if (/valentine|women'?s day|mothering|father'?s day|children'?s day|ash wednesday|holy saturday|easter sunday|christmas eve|new year'?s eve|ramadan start|al-hijra|islamic new year/i.test(text)) {
    return false;
  }
  return /new year'?s day|good friday|easter monday|workers'? day|labour day|democracy day|independence|national day|christmas day|boxing day|\beid\b|id[\s-]?el|fitr|kabir|adha|maulud|mawlid|sallah|public holiday/i.test(text);
};

export const statutoryHolidayDates = (holidays?: EntitlementHoliday[] | null) => {
  const dates: string[] = [];
  for (const item of holidays || []) {
    if (typeof item === 'string') {
      const date = isoDate(item);
      if (date) dates.push(date);
      continue;
    }
    const date = isoDate(item?.date);
    if (!date) continue;
    if (item.label && !isStatutoryNigeriaWorkHoliday(item.label)) continue;
    dates.push(date);
  }
  return Array.from(new Set(dates));
};

export const countWorkingDaysInRange = (
  startDate: string,
  endDate: string,
  holidays?: EntitlementHoliday[] | null,
) => {
  const start = isoDate(startDate);
  const end = isoDate(endDate);
  if (!start || !end || end < start) return 0;
  return defaultChargeableDatesInPeriod(
    start,
    end,
    statutoryHolidayDates(holidays).map((date) => ({ date })),
  ).length;
};

export const daysWorkedInLeaveYear = (input: {
  lastWorkingDay?: string | null;
  dateOfJoining?: string | null;
  leaveYear?: number;
  holidays?: EntitlementHoliday[] | null;
}) => {
  const exit = isoDate(input.lastWorkingDay);
  if (!exit) return 0;
  const year = input.leaveYear || Number(exit.slice(0, 4));
  const yearStart = `${year}-01-01`;
  const join = isoDate(input.dateOfJoining);
  const start = join && join > yearStart ? join : yearStart;
  return countWorkingDaysInRange(start, exit, input.holidays);
};

export const buildEntitlementSnapshot = (input: {
  lastWorkingDay?: string | null;
  dateOfJoining?: string | null;
  leaveYear?: number;
  annualLeaveAllowance: number;
  leaveAllowancePaid: boolean;
  totalWorkingDays?: number;
  daysWorkedInYear?: number;
  holidays?: EntitlementHoliday[] | null;
}): FinalEntitlementSnapshot => {
  const exit = isoDate(input.lastWorkingDay);
  const leaveYear = input.leaveYear || (exit ? Number(exit.slice(0, 4)) : new Date().getUTCFullYear());
  const totalWorkingDays = Math.max(1, Number(input.totalWorkingDays || DLE_ANNUAL_WORKING_DAYS));
  const daysWorkedInYear = Math.max(
    0,
    Number.isFinite(input.daysWorkedInYear)
      ? Number(input.daysWorkedInYear)
      : daysWorkedInLeaveYear({
          lastWorkingDay: input.lastWorkingDay,
          dateOfJoining: input.dateOfJoining,
          leaveYear,
          holidays: input.holidays,
        }),
  );
  const remainingWorkingDays = Math.max(0, totalWorkingDays - daysWorkedInYear);
  const annual = Math.max(0, roundEntitlementMoney(input.annualLeaveAllowance));
  const paid = Boolean(input.leaveAllowancePaid) && annual > 0;
  // Official sheet posts whole naira for leave proration (465,962.92 × 59 / 248 → 110,854.00).
  const leaveAllowanceCredit = !paid && annual > 0
    ? Math.round((annual * daysWorkedInYear) / totalWorkingDays)
    : 0;
  const proratedLeaveRecovery = paid
    ? Math.round((annual * remainingWorkingDays) / totalWorkingDays)
    : 0;
  return {
    leaveYear,
    daysWorkedInYear,
    totalWorkingDays,
    remainingWorkingDays,
    annualLeaveAllowance: annual,
    leaveAllowancePaid: paid,
    leaveAllowanceCredit,
    proratedLeaveRecovery,
  };
};

const rawLineAmount = (lines: FinalPayrollLine[] | undefined, id: string) => {
  const line = (lines || []).find((item) => item.id === id && item.included);
  return Number(line?.amount || 0);
};

const lineAmount = (lines: FinalPayrollLine[] | undefined, id: string) =>
  roundOfficialSheetAmount(rawLineAmount(lines, id));

export const entitlementSheetFromSettlement = (
  settlement: FinalPayrollSettlement,
  snapshot?: FinalEntitlementSnapshot | null,
): FinalEntitlementSheet => {
  const resolved = snapshot || settlement.entitlement || buildEntitlementSnapshot({
    lastWorkingDay: settlement.lastWorkingDay,
    dateOfJoining: settlement.dateOfJoining,
    annualLeaveAllowance: 0,
    leaveAllowancePaid: false,
  });
  const leaveYear = resolved.leaveYear;
  const rawSalary = rawLineAmount(settlement.earnings, 'gross-salary')
    || rawLineAmount(settlement.earnings, 'salary-lwd') + rawLineAmount(settlement.earnings, 'earned-allowances');
  const rawLeaveCredit = rawLineAmount(settlement.earnings, 'leave-allowance');
  const rawGratuity = rawLineAmount(settlement.earnings, 'gratuity');
  const rawLoans = rawLineAmount(settlement.deductions, 'staff-loan') + rawLineAmount(settlement.deductions, 'cash-advance');
  const rawLeaveRecovery = rawLineAmount(settlement.deductions, 'prorated-leave') || Number(resolved.proratedLeaveRecovery || 0);
  const rawPension = rawLineAmount(settlement.statutory, 'pension')
    || rawLineAmount(settlement.deductions, 'pension');
  const rawUnionDues = rawLineAmount(settlement.statutory, 'union-dues')
    || rawLineAmount(settlement.deductions, 'union-dues');
  const rawTax = rawLineAmount(settlement.statutory, 'paye')
    || rawLineAmount(settlement.deductions, 'paye');
  const salary = roundOfficialSheetAmount(rawSalary);
  const leaveCredit = roundOfficialSheetAmount(rawLeaveCredit);
  const gratuity = roundOfficialSheetAmount(rawGratuity);
  const loans = roundOfficialSheetAmount(rawLoans);
  const leaveRecovery = roundOfficialSheetAmount(rawLeaveRecovery);
  const pension = roundOfficialSheetAmount(rawPension);
  const unionDues = roundOfficialSheetAmount(rawUnionDues);
  const tax = roundOfficialSheetAmount(rawTax);

  const allowances: FinalEntitlementRow[] = [
    { id: OFFICIAL_ALLOWANCE_IDS[0], label: `${leaveYear} Leave Allowance`, amount: leaveCredit },
    { id: OFFICIAL_ALLOWANCE_IDS[1], label: salaryEarnedLabel(settlement.lastWorkingDay), amount: salary },
    { id: OFFICIAL_ALLOWANCE_IDS[2], label: 'Gratuity', amount: gratuity },
  ];
  const deductions: FinalEntitlementRow[] = [
    { id: OFFICIAL_DEDUCTION_IDS[0], label: 'Loans & Advances', amount: loans },
    {
      id: OFFICIAL_DEDUCTION_IDS[1],
      label: `Prorated Leave (less remaining days in ${leaveYear})`,
      amount: leaveRecovery,
    },
    { id: OFFICIAL_DEDUCTION_IDS[2], label: 'Pension', amount: pension },
    { id: OFFICIAL_DEDUCTION_IDS[3], label: 'Union Dues', amount: unionDues },
    { id: OFFICIAL_DEDUCTION_IDS[4], label: 'Tax Deduction', amount: tax },
  ];

  let rawDueToEmployee = rawLeaveCredit + rawSalary + rawGratuity;
  let rawDueToDle = rawLoans + rawLeaveRecovery + rawPension + rawUnionDues + rawTax;
  for (const line of settlement.earnings || []) {
    if (!line.included || SHEET_EARNING_IDS.has(line.id)) continue;
    const raw = Number(line.amount || 0);
    const amount = roundOfficialSheetAmount(raw);
    if (!amount) continue;
    allowances.push({ id: line.id, label: compact(line.label) || line.id, amount });
    rawDueToEmployee += raw;
  }
  for (const line of [...(settlement.deductions || []), ...(settlement.statutory || [])]) {
    if (!line.included || SHEET_DEDUCTION_IDS.has(line.id)) continue;
    const raw = Number(line.amount || 0);
    const amount = roundOfficialSheetAmount(raw);
    if (!amount) continue;
    deductions.push({ id: line.id, label: compact(line.label) || line.id, amount });
    rawDueToDle += raw;
  }

  const alignToHeader = (rows: FinalEntitlementRow[], rawTotal: number, anchorId: string) => {
    const target = roundOfficialSheetAmount(rawTotal);
    const drift = target - rows.reduce((sum, row) => sum + row.amount, 0);
    if (drift) {
      const anchor = rows.find((row) => row.id === anchorId) || rows.find((row) => row.amount);
      if (anchor) anchor.amount += drift;
    }
    return target;
  };
  const amountDueToEmployee = alignToHeader(allowances, rawDueToEmployee, 'gross-salary');
  const amountDueToDle = alignToHeader(deductions, rawDueToDle, 'prorated-leave');

  return {
    title: 'DLE FINAL ENTITLEMENT SHEET',
    employeeName: settlement.employeeName,
    employeeCode: settlement.employeeCode,
    designation: settlement.jobTitle,
    department: settlement.department,
    dateOfEmployment: settlement.dateOfJoining,
    dateOfExit: settlement.lastWorkingDay,
    leaveYear,
    daysWorkedInYear: resolved.daysWorkedInYear,
    totalWorkingDays: resolved.totalWorkingDays,
    annualLeaveAllowance: resolved.annualLeaveAllowance,
    leaveAllowancePaid: resolved.leaveAllowancePaid,
    currency: settlement.currency,
    allowances,
    deductions,
    amountDueToEmployee,
    amountDueToDle,
    netDueToEmployee: roundOfficialSheetAmount(rawDueToEmployee - rawDueToDle),
    preparedBy: settlement.createdBy || '',
    preparedDate: settlement.createdAt || null,
    approvedBy: settlement.approvedBy || '',
    approvedDate: settlement.approvedAt || null,
  };
};

export const buildFinalEntitlementSheet = (input: {
  employeeName: string;
  employeeCode: string;
  designation: string;
  department: string;
  dateOfEmployment?: string | null;
  dateOfExit?: string | null;
  currency?: 'NGN' | 'USD';
  annualLeaveAllowance: number;
  leaveAllowancePaid: boolean;
  salaryEarned: number;
  gratuity?: number;
  loansAndAdvances?: number;
  pension?: number;
  unionDues?: number;
  taxDeduction?: number;
  daysWorkedInYear?: number;
  totalWorkingDays?: number;
  leaveYear?: number;
  holidays?: EntitlementHoliday[] | null;
  preparedBy?: string;
  preparedDate?: string | null;
  approvedBy?: string;
  approvedDate?: string | null;
}): FinalEntitlementSheet => {
  const snapshot = buildEntitlementSnapshot({
    lastWorkingDay: input.dateOfExit,
    dateOfJoining: input.dateOfEmployment,
    leaveYear: input.leaveYear,
    annualLeaveAllowance: input.annualLeaveAllowance,
    leaveAllowancePaid: input.leaveAllowancePaid,
    totalWorkingDays: input.totalWorkingDays,
    daysWorkedInYear: input.daysWorkedInYear,
    holidays: input.holidays,
  });
  const allowances: FinalEntitlementRow[] = [
    { id: 'leave-allowance', label: `${snapshot.leaveYear} Leave Allowance`, amount: snapshot.leaveAllowanceCredit },
    { id: 'gross-salary', label: salaryEarnedLabel(input.dateOfExit), amount: roundOfficialSheetAmount(input.salaryEarned) },
    { id: 'gratuity', label: 'Gratuity', amount: roundOfficialSheetAmount(input.gratuity || 0) },
  ];
  const deductions: FinalEntitlementRow[] = [
    { id: 'loans', label: 'Loans & Advances', amount: roundOfficialSheetAmount(input.loansAndAdvances || 0) },
    {
      id: 'prorated-leave',
      label: `Prorated Leave (less remaining days in ${snapshot.leaveYear})`,
      amount: snapshot.proratedLeaveRecovery,
    },
    { id: 'pension', label: 'Pension', amount: roundOfficialSheetAmount(input.pension || 0) },
    { id: 'union-dues', label: 'Union Dues', amount: roundOfficialSheetAmount(input.unionDues || 0) },
    { id: 'paye', label: 'Tax Deduction', amount: roundOfficialSheetAmount(input.taxDeduction || 0) },
  ];
  const amountDueToEmployee = roundOfficialSheetAmount(allowances.reduce((sum, row) => sum + row.amount, 0));
  const amountDueToDle = roundOfficialSheetAmount(deductions.reduce((sum, row) => sum + row.amount, 0));
  return {
    title: 'DLE FINAL ENTITLEMENT SHEET',
    employeeName: input.employeeName,
    employeeCode: input.employeeCode,
    designation: input.designation,
    department: input.department,
    dateOfEmployment: input.dateOfEmployment || null,
    dateOfExit: input.dateOfExit || null,
    leaveYear: snapshot.leaveYear,
    daysWorkedInYear: snapshot.daysWorkedInYear,
    totalWorkingDays: snapshot.totalWorkingDays,
    annualLeaveAllowance: snapshot.annualLeaveAllowance,
    leaveAllowancePaid: snapshot.leaveAllowancePaid,
    currency: input.currency || 'NGN',
    allowances,
    deductions,
    amountDueToEmployee,
    amountDueToDle,
    netDueToEmployee: roundOfficialSheetAmount(amountDueToEmployee - amountDueToDle),
    preparedBy: input.preparedBy || '',
    preparedDate: input.preparedDate || null,
    approvedBy: input.approvedBy || '',
    approvedDate: input.approvedDate || null,
  };
};

export const entitlementSheetFileName = (sheet: Pick<FinalEntitlementSheet, 'employeeCode' | 'employeeName' | 'leaveYear'>) => {
  const code = compact(sheet.employeeCode).replace(/[^\w-]/g, '') || 'employee';
  return `DLE-Final-Entitlement-${code}-${sheet.leaveYear}.xls`;
};

export const entitlementPeriodHint = (settlement: Pick<FinalPayrollSettlement, 'period' | 'lastWorkingDay'>) =>
  settlement.lastWorkingDay
    ? formatEntitlementDate(settlement.lastWorkingDay)
    : periodLabelFromCode(settlement.period);

export const formatEntitlementStaffName = (name: string, code: string) => {
  const staff = compact(name).toUpperCase();
  const id = compact(code);
  return id ? `${staff} (${id})` : staff;
};

export { formatFinalPayrollDate };
