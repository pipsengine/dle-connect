/**
 * Client-safe Final Payroll types + formatters.
 * Do NOT import server stores / mssql from here — client components may use this file.
 */

export type FinalPayrollStatus =
  | 'Draft'
  | 'Awaiting Clearance'
  | 'Ready for Calculation'
  | 'In Review'
  | 'Awaiting Approval'
  | 'Approved'
  | 'Paid'
  | 'Exception';

export type ClearanceItemStatus = 'Pending' | 'Completed';
export type ApprovalStageStatus = 'Pending' | 'In Review' | 'Completed';

export type FinalPayrollLine = {
  id: string;
  label: string;
  description: string;
  policyBasis: string;
  periodDays: string;
  amount: number;
  remarks: string;
  included: boolean;
};

export type FinalPayrollClearanceItem = {
  id: string;
  label: string;
  status: ClearanceItemStatus;
  note?: string | null;
};

export type FinalPayrollApprovalStage = {
  id: string;
  label: string;
  status: ApprovalStageStatus;
};

export type FinalPayrollComment = {
  id: string;
  body: string;
  actor: string;
  createdAt: string;
};

export type FinalPayrollSettlement = {
  id: string;
  period: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  department: string;
  employmentType: string;
  jobTitle: string;
  grade: string;
  currency: 'NGN' | 'USD';
  basicSalary: number;
  /** Monthly package gross (basic + structural allowances) used for settlement earnings. */
  grossSalary?: number;
  /** Monthly structural allowances (gross − basic). */
  allowanceMonthly?: number;
  dateOfJoining: string | null;
  serviceLength: string;
  exitType: string;
  resignationDate: string | null;
  lastWorkingDay: string | null;
  noticePeriod: string;
  reasonForLeaving: string;
  remarks: string;
  lastRegularPayroll: string;
  nextPayrollExcluded: boolean;
  status: FinalPayrollStatus;
  clearance: FinalPayrollClearanceItem[];
  approvalStages: FinalPayrollApprovalStage[];
  earnings: FinalPayrollLine[];
  deductions: FinalPayrollLine[];
  statutory: FinalPayrollLine[];
  comments: FinalPayrollComment[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

export type FinalPayrollKpi = {
  id: string;
  label: string;
  value: number;
  display: string;
  deltaLabel: string;
  tone: 'blue' | 'amber' | 'mint' | 'purple' | 'green' | 'rose';
};

export type FinalPayrollPayload = {
  generatedAt: string;
  period: string;
  periodLabel: string;
  settlements: FinalPayrollSettlement[];
  kpis: FinalPayrollKpi[];
  tabCounts: Record<string, number>;
  selectedId: string | null;
  selected: FinalPayrollSettlement | null;
  filterOptions: {
    departments: string[];
    exitTypes: string[];
    statuses: FinalPayrollStatus[];
  };
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const roundFinalPayrollMoney = (value: number) =>
  Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;

export const formatFinalPayrollDate = (value?: string | null) => {
  if (!value) return '—';
  const d = new Date(value.includes('T') ? value : `${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return value;
  return `${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

export const periodLabelFromCode = (period: string) => {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) return period;
  const month = Number(match[2]);
  return `${MONTHS[month - 1] || match[2]} ${match[1]}`;
};

export const currentFinalPayrollPeriod = (date = new Date()) =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;

export const previousFinalPayrollPeriod = (period: string) => {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) return null;
  let year = Number(match[1]);
  let month = Number(match[2]) - 1;
  if (month < 1) {
    month = 12;
    year -= 1;
  }
  return `${year}-${String(month).padStart(2, '0')}`;
};

export const moneySymbol = (currency: 'NGN' | 'USD') => (currency === 'USD' ? '$' : '₦');

export const formatFinalPayrollMoney = (amount: number, currency: 'NGN' | 'USD') => {
  const abs = Math.abs(roundFinalPayrollMoney(amount));
  const formatted = abs.toLocaleString('en-NG', {
    maximumFractionDigits: currency === 'USD' ? 2 : 0,
    minimumFractionDigits: currency === 'USD' ? 2 : 0,
  });
  return `${amount < 0 ? '-' : ''}${moneySymbol(currency)}${formatted}`;
};

export const FINAL_PAYROLL_GROSS_SALARY_ID = 'gross-salary';
export const FINAL_PAYROLL_LEGACY_GROSS_LINE_IDS = ['salary-lwd', 'earned-allowances'] as const;
export const FINAL_PAYROLL_EDITABLE_EARNING_IDS = ['leave-encashment', 'gratuity'] as const;
export const FINAL_PAYROLL_EDITABLE_DEDUCTION_IDS = ['staff-loan', 'cash-advance', 'other-deductions'] as const;

const asIdSet = (ids: readonly string[]) => new Set(ids);

export const isFinalPayrollEditableEarning = (lineId: string) =>
  asIdSet(FINAL_PAYROLL_EDITABLE_EARNING_IDS).has(lineId);

export const isFinalPayrollEditableDeduction = (lineId: string) =>
  asIdSet(FINAL_PAYROLL_EDITABLE_DEDUCTION_IDS).has(lineId);

/** Combine legacy basic + allowances rows into a single Gross Salary line. */
export const mergeGrossSalaryEarnings = (lines: FinalPayrollLine[]): FinalPayrollLine[] => {
  const salary = lines.find((line) => line.id === 'salary-lwd');
  const allowances = lines.find((line) => line.id === 'earned-allowances');
  const existingGross = lines.find((line) => line.id === FINAL_PAYROLL_GROSS_SALARY_ID);
  if (!salary && !allowances) return lines;

  const remarks = [salary?.remarks, allowances?.remarks]
    .map((value) => String(value || '').trim())
    .filter((value) => value && value !== '-')
    .filter((value, index, all) => all.indexOf(value) === index)
    .join(' · ') || existingGross?.remarks || '-';

  const merged: FinalPayrollLine = {
    id: FINAL_PAYROLL_GROSS_SALARY_ID,
    label: 'Gross Salary',
    description: 'Pro-rated basic salary plus package allowances',
    policyBasis: 'Actual days worked / pro-rated package',
    periodDays: salary?.periodDays && salary.periodDays !== '-'
      ? salary.periodDays
      : allowances?.periodDays || existingGross?.periodDays || '-',
    amount: roundFinalPayrollMoney(Number(salary?.amount || 0) + Number(allowances?.amount || 0) + (salary || allowances ? 0 : Number(existingGross?.amount || 0))),
    remarks,
    included: Boolean((salary?.included ?? true) && (allowances?.included ?? true) && (existingGross?.included ?? true)),
  };

  const withoutLegacy = lines.filter((line) =>
    line.id !== 'salary-lwd'
    && line.id !== 'earned-allowances'
    && line.id !== FINAL_PAYROLL_GROSS_SALARY_ID
  );
  const outstandingIndex = withoutLegacy.findIndex((line) => line.id === 'outstanding-salary');
  if (outstandingIndex <= 0) return [merged, ...withoutLegacy];
  return [...withoutLegacy.slice(0, outstandingIndex), merged, ...withoutLegacy.slice(outstandingIndex)];
};

export const parseFinalPayrollAmountInput = (raw: string) => {
  const cleaned = String(raw || '').replace(/,/g, '').trim();
  if (!cleaned) return 0;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return 0;
  return roundFinalPayrollMoney(Math.max(0, value));
};

export const sumIncludedLines = (lines: FinalPayrollLine[]) =>
  roundFinalPayrollMoney(lines.filter((line) => line.included).reduce((sum, line) => sum + Number(line.amount || 0), 0));

export const settlementTotals = (settlement: Pick<FinalPayrollSettlement, 'earnings' | 'deductions' | 'statutory'>) => {
  const gross = sumIncludedLines(settlement.earnings);
  const deductions = sumIncludedLines(settlement.deductions);
  const statutory = sumIncludedLines(settlement.statutory);
  const net = roundFinalPayrollMoney(gross - deductions - statutory);
  return { gross, deductions, statutory, net };
};
