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

export const sumIncludedLines = (lines: FinalPayrollLine[]) =>
  roundFinalPayrollMoney(lines.filter((line) => line.included).reduce((sum, line) => sum + Number(line.amount || 0), 0));

export const settlementTotals = (settlement: Pick<FinalPayrollSettlement, 'earnings' | 'deductions' | 'statutory'>) => {
  const gross = sumIncludedLines(settlement.earnings);
  const deductions = sumIncludedLines(settlement.deductions);
  const statutory = sumIncludedLines(settlement.statutory);
  const net = roundFinalPayrollMoney(gross - deductions - statutory);
  return { gross, deductions, statutory, net };
};
