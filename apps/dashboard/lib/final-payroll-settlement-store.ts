/**
 * Final Payroll Processing — offboarding settlement register + calculation store.
 * Persistence: JSON under data/hris (durable enough for draft/approval workflow).
 * Server-only — do not value-import from client components (use final-payroll-settlement-shared).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readEmployeeExitStatusFromDb, type EmployeeExitStatusRecord } from '@/lib/employee-exit-status-store';
import { getDleEnterpriseDbPool } from '@/lib/dle-enterprise-db';
import type { DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import { calculatePayrollEarnings } from '@/lib/payroll-earnings-engine';
import { readPayrollEmployees } from '@/lib/payroll-employee-source';
import { activePensionVersion, calculatePension, pensionInputFromEmployee, readPayrollPensionConfig } from '@/lib/payroll-pension-engine';
import {
  activeStatutoryFundsVersion,
  calculateStatutoryFunds,
  readStatutoryFundsConfig,
  statutoryFundInputFromEmployee,
} from '@/lib/payroll-statutory-funds-engine';
import { activeTaxVersion, calculatePayrollTax, payrollInputFromEmployee, readPayrollTaxConfig } from '@/lib/payroll-tax-engine';
import {
  findResignationByEmployee,
} from '@/lib/resignation-management-store';
import {
  resignationFinalPayrollHref,
  resignationReadyForFinalPayroll,
} from '@/lib/resignation-management-shared';
import {
  type ApprovalStageStatus,
  type FinalPayrollApprovalStage,
  type FinalPayrollClearanceItem,
  type FinalPayrollKpi,
  type FinalPayrollLine,
  type FinalPayrollPayload,
  type FinalPayrollSettlement,
  type FinalPayrollStatus,
  currentFinalPayrollPeriod,
  formatFinalPayrollDate,
  formatFinalPayrollMoney,
  mergeGrossSalaryEarnings,
  periodLabelFromCode,
  previousFinalPayrollPeriod,
  roundFinalPayrollMoney,
  settlementTotals,
  sumIncludedLines,
} from '@/lib/final-payroll-settlement-shared';

export type {
  ClearanceItemStatus,
  ApprovalStageStatus,
  FinalPayrollLine,
  FinalPayrollClearanceItem,
  FinalPayrollApprovalStage,
  FinalPayrollComment,
  FinalPayrollSettlement,
  FinalPayrollKpi,
  FinalPayrollPayload,
  FinalPayrollStatus,
} from '@/lib/final-payroll-settlement-shared';

export {
  formatFinalPayrollDate,
  formatFinalPayrollMoney,
  periodLabelFromCode,
  currentFinalPayrollPeriod,
  previousFinalPayrollPeriod,
  moneySymbol,
  sumIncludedLines,
  settlementTotals,
} from '@/lib/final-payroll-settlement-shared';

const resolveDashboardRoot = () => {
  const cwd = process.cwd();
  const dashboardSuffix = path.join('apps', 'dashboard');
  return cwd.endsWith(dashboardSuffix) ? cwd : path.join(cwd, dashboardSuffix);
};

const DATA_DIR = path.join(process.env.DLE_HRIS_DATA_DIR || path.join(resolveDashboardRoot(), 'data', 'hris'));
const FILE_PATH = path.join(DATA_DIR, 'final-payroll-settlements.json');

const compact = (value: unknown) => String(value || '').trim();
const roundMoney = roundFinalPayrollMoney;
const nowIso = () => new Date().toISOString();

const defaultClearance = (): FinalPayrollClearanceItem[] => [
  { id: 'hr', label: 'HR Clearance', status: 'Completed' },
  { id: 'it', label: 'IT Clearance', status: 'Completed' },
  { id: 'finance', label: 'Finance Clearance', status: 'Completed' },
  { id: 'admin', label: 'Administration', status: 'Pending' },
  { id: 'asset', label: 'Asset Return', status: 'Pending', note: 'Laptop outstanding.' },
  { id: 'access', label: 'Access Deactivation', status: 'Completed' },
  { id: 'handover', label: 'Handover Checklist', status: 'Completed' },
];

const defaultApprovalStages = (status: FinalPayrollStatus): FinalPayrollApprovalStage[] => {
  const stages: FinalPayrollApprovalStage[] = [
    { id: 'prep', label: 'Payroll Preparation', status: 'Pending' },
    { id: 'hr', label: 'HR Manager Review', status: 'Pending' },
    { id: 'finance', label: 'Finance Review', status: 'Pending' },
    { id: 'cfo', label: 'CFO Authorization', status: 'Pending' },
    { id: 'payment', label: 'Final Payment', status: 'Pending' },
  ];
  const mark = (index: number, value: ApprovalStageStatus) => {
    for (let i = 0; i < stages.length; i += 1) {
      if (i < index) stages[i].status = 'Completed';
      else if (i === index) stages[i].status = value;
      else stages[i].status = 'Pending';
    }
  };
  switch (status) {
    case 'Draft':
    case 'Awaiting Clearance':
    case 'Ready for Calculation':
      mark(0, 'In Review');
      break;
    case 'In Review':
      mark(1, 'In Review');
      break;
    case 'Awaiting Approval':
      mark(2, 'In Review');
      break;
    case 'Approved':
      mark(3, 'Completed');
      stages[4].status = 'Pending';
      break;
    case 'Paid':
      stages.forEach((stage) => {
        stage.status = 'Completed';
      });
      break;
    default:
      mark(0, 'In Review');
  }
  return stages;
};

const daysInMonth = (period: string) => {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) return 30;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]), 0)).getUTCDate();
};

const workingDaysUntil = (period: string, lastWorkingDay?: string | null) => {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) return 21;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const endDay = lastWorkingDay
    ? Number(String(lastWorkingDay).slice(8, 10)) || daysInMonth(period)
    : daysInMonth(period);
  return Math.max(1, Math.min(endDay, daysInMonth(period)));
};

const serviceLengthLabel = (years: number, joining?: string | null, lastDay?: string | null) => {
  if (joining && lastDay) {
    const start = new Date(`${joining}T00:00:00.000Z`);
    const end = new Date(`${lastDay}T00:00:00.000Z`);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end >= start) {
      let y = end.getUTCFullYear() - start.getUTCFullYear();
      let m = end.getUTCMonth() - start.getUTCMonth();
      if (m < 0) {
        y -= 1;
        m += 12;
      }
      return `${y} Year${y === 1 ? '' : 's'} ${m} Month${m === 1 ? '' : 's'}`;
    }
  }
  const whole = Math.max(0, Math.floor(years));
  const months = Math.round((years - whole) * 12);
  return `${whole} Year${whole === 1 ? '' : 's'} ${months} Month${months === 1 ? '' : 's'}`;
};

const serviceYearsExact = (joining?: string | null, lastDay?: string | null, fallbackYears = 0) => {
  if (joining && lastDay) {
    const start = new Date(`${joining.slice(0, 10)}T00:00:00.000Z`);
    const end = new Date(`${lastDay.slice(0, 10)}T00:00:00.000Z`);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end >= start) {
      return Math.max(0, (end.getTime() - start.getTime()) / (365.25 * 86400000));
    }
  }
  return Math.max(0, Number(fallbackYears || 0));
};

const parseNoticePeriodDays = (noticePeriod?: string | null, fallbackDays = 30) => {
  const text = compact(noticePeriod).toLowerCase();
  if (!text) return fallbackDays;
  if (/^(none|n\/a|waived|0)$/i.test(text)) return 0;
  const monthMatch = text.match(/(\d+(?:\.\d+)?)\s*month/);
  if (monthMatch) return Math.round(Number(monthMatch[1]) * 30);
  const dayMatch = text.match(/(\d+)\s*day/);
  if (dayMatch) return Number(dayMatch[1]);
  return fallbackDays;
};

/** Company default: 1× monthly basic per completed year, after 5 years continuous service. */
const GRATUITY_MIN_YEARS = 5;

const lookupAnnualLeaveBalanceDays = async (employeeCode: string, employeeId?: string | null) => {
  try {
    const pool = await getDleEnterpriseDbPool();
    if (!pool) return 0;
    const code = compact(employeeCode);
    const id = compact(employeeId || employeeCode);
    if (!code && !id) return 0;
    const targeted = await pool.request()
      .input('code', code)
      .input('id', id)
      .query(`
SELECT TOP (1) [CurrentBalance]
FROM [hris].[LeaveBalances]
WHERE [LeaveType] IN (N'Annual Leave', N'Annual')
  AND (
    UPPER(REPLACE(REPLACE([EmployeeId], N' ', N''), N'-', N'')) = UPPER(REPLACE(REPLACE(@code, N' ', N''), N'-', N''))
    OR UPPER(REPLACE(REPLACE([EmployeeId], N' ', N''), N'-', N'')) = UPPER(REPLACE(REPLACE(@id, N' ', N''), N'-', N''))
    OR UPPER(REPLACE(REPLACE([EmployeeId], N'P', N''), N' ', N'')) = UPPER(REPLACE(REPLACE(@code, N'P', N''), N' ', N''))
  );`);
    return Math.max(0, Number(targeted.recordset?.[0]?.CurrentBalance || 0));
  } catch {
    return 0;
  }
};

type TerminalBenefitContext = {
  dateOfJoining?: string | null;
  serviceYears?: number;
  exitType?: string;
  leaveBalanceDays?: number;
  noticePayDays?: number;
  noticeRecoveryDays?: number;
};

const resolveTerminalBenefitContext = async (input: {
  employeeCode: string;
  employeeId?: string | null;
  dateOfJoining?: string | null;
  serviceYears?: number;
  exitType?: string;
  lastWorkingDay?: string | null;
  resignationDate?: string | null;
  noticePeriod?: string | null;
}): Promise<TerminalBenefitContext> => {
  const resignation = await findResignationByEmployee({
    employeeCode: input.employeeCode,
    employeeId: input.employeeId,
  }).catch(() => null);
  const leaveBalanceDays = await lookupAnnualLeaveBalanceDays(input.employeeCode, input.employeeId);
  const noticeRequired = resignation
    ? Number(resignation.noticePeriodDays || 0)
    : parseNoticePeriodDays(input.noticePeriod, 30);
  const noticeServed = resignation
    ? Number(resignation.noticeServedDays || 0)
    : (() => {
      if (!input.resignationDate || !input.lastWorkingDay) return noticeRequired;
      const start = new Date(`${input.resignationDate.slice(0, 10)}T00:00:00.000Z`);
      const end = new Date(`${input.lastWorkingDay.slice(0, 10)}T00:00:00.000Z`);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return noticeRequired;
      return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000));
    })();
  const unserved = Math.max(0, noticeRequired - noticeServed);
  const exitType = input.exitType || resignation?.reasonForLeaving || 'Resignation';
  const employerDriven = /retrench|redundan|terminat|layoff|disengag|end of contract/i.test(exitType);
  return {
    dateOfJoining: input.dateOfJoining || resignation?.dateOfJoining || null,
    serviceYears: input.serviceYears,
    exitType,
    leaveBalanceDays,
    noticePayDays: employerDriven ? unserved : 0,
    noticeRecoveryDays: employerDriven ? 0 : unserved,
  };
};

export const buildDefaultEarnings = (input: {
  period: string;
  currency: 'NGN' | 'USD';
  basicSalary: number;
  lastWorkingDay?: string | null;
  /** Monthly structural allowances (gross − basic). Prefer real package; do not invent 15%. */
  allowanceMonthly?: number;
  grossSalary?: number;
  packageBreakdown?: string;
  dateOfJoining?: string | null;
  serviceYears?: number;
  exitType?: string;
  leaveBalanceDays?: number;
  noticePayDays?: number;
}): FinalPayrollLine[] => {
  const days = workingDaysUntil(input.period, input.lastWorkingDay);
  const monthDays = daysInMonth(input.period);
  const basic = Math.max(0, Number(input.basicSalary || 0));
  const allowances = Math.max(0, Number(input.allowanceMonthly ?? 0));
  const salary = roundMoney((basic / monthDays) * days);
  const earnedAllowances = roundMoney((allowances / monthDays) * days);
  const period = periodLabelFromCode(input.period);
  const lwd = formatFinalPayrollDate(input.lastWorkingDay);
  const packageNote = input.packageBreakdown
    || (input.grossSalary
      ? `Monthly package ${formatFinalPayrollMoney(input.grossSalary, input.currency)}`
      : allowances > 0
        ? 'From employee salary package'
        : 'No package allowances on file');
  const years = serviceYearsExact(input.dateOfJoining, input.lastWorkingDay, input.serviceYears || 0);
  const completedYears = Math.floor(years);
  const dailyBasic = roundMoney(basic / 30);
  const leaveDays = Math.max(0, Number(input.leaveBalanceDays || 0));
  const leaveEncashment = leaveDays > 0 ? roundMoney(dailyBasic * leaveDays) : 0;
  const gratuityEligible = completedYears >= GRATUITY_MIN_YEARS && basic > 0;
  const gratuity = gratuityEligible ? roundMoney(basic * completedYears) : 0;
  const exitType = compact(input.exitType).toLowerCase();
  const employerDriven = /retrench|redundan|terminat|layoff|disengag|end of contract/i.test(exitType);
  const noticePayDays = Math.max(0, Number(input.noticePayDays || 0));
  const noticePay = employerDriven && noticePayDays > 0 ? roundMoney(dailyBasic * noticePayDays) : 0;
  const severanceEligible = /retrench|redundan|layoff/i.test(exitType) && completedYears >= 1 && basic > 0;
  const severance = severanceEligible ? roundMoney(basic * completedYears) : 0;

  const periodRange = `${period.split(' ')[0]} 1 – ${lwd}`;
  const grossRemarks = [periodRange, packageNote]
    .map((value) => String(value || '').trim())
    .filter((value) => value && value !== '-')
    .join(' · ');

  return [
    {
      id: 'gross-salary',
      label: 'Gross Salary',
      description: 'Pro-rated basic salary plus package allowances',
      policyBasis: 'Actual days worked / pro-rated package',
      periodDays: `${days} days`,
      amount: roundMoney(salary + earnedAllowances),
      remarks: grossRemarks || '-',
      included: true,
    },
    {
      id: 'outstanding-salary',
      label: 'Outstanding Salary',
      description: 'Unpaid salary (if any)',
      policyBasis: 'Payroll records',
      periodDays: '-',
      amount: 0,
      remarks: '-',
      included: true,
    },
    {
      id: 'unpaid-arrears',
      label: 'Unpaid Salary / Arrears',
      description: 'Salary arrears due',
      policyBasis: 'Payroll records',
      periodDays: '-',
      amount: 0,
      remarks: '-',
      included: true,
    },
    {
      id: 'leave-encashment',
      label: 'Leave Encashment',
      description: 'Unused annual leave (terminal benefit)',
      policyBasis: 'HR / Payroll exit policy',
      periodDays: leaveDays > 0 ? `${leaveDays} days` : '0 days',
      amount: leaveEncashment,
      remarks: leaveDays > 0
        ? `Daily basic × ${leaveDays} unused days`
        : 'No eligible leave balance on file — adjust if approved',
      included: true,
    },
    {
      id: 'overtime',
      label: 'Overtime',
      description: 'Approved overtime',
      policyBasis: 'Timesheet records',
      periodDays: '-',
      amount: 0,
      remarks: '-',
      included: true,
    },
    {
      id: 'bonus',
      label: 'Bonus / Commission',
      description: 'Outstanding bonus/commission',
      policyBasis: 'Approval records',
      periodDays: '-',
      amount: 0,
      remarks: '-',
      included: true,
    },
    {
      id: 'gratuity',
      label: 'Gratuity',
      description: 'Terminal gratuity benefit',
      policyBasis: `1× monthly basic × completed years (min ${GRATUITY_MIN_YEARS} yrs)`,
      periodDays: `${completedYears} yr${completedYears === 1 ? '' : 's'}`,
      amount: gratuity,
      remarks: gratuityEligible
        ? `${formatFinalPayrollMoney(basic, input.currency)} × ${completedYears} years`
        : completedYears > 0
          ? `Below ${GRATUITY_MIN_YEARS}-year qualifying service (${completedYears} completed)`
          : 'Service length not available — enter manually if due',
      included: true,
    },
    {
      id: 'severance',
      label: 'Severance / Retrenchment Pay',
      description: 'Terminal severance where exit type qualifies',
      policyBasis: 'Company exit policy',
      periodDays: severanceEligible ? `${completedYears} yr${completedYears === 1 ? '' : 's'}` : '-',
      amount: severance,
      remarks: severanceEligible
        ? `Applied for ${input.exitType || 'redundancy'}`
        : 'Not applicable for this exit type',
      included: severanceEligible,
    },
    {
      id: 'notice-pay',
      label: 'Notice Pay (In Lieu)',
      description: 'Employer pay in lieu of notice',
      policyBasis: 'Exit case',
      periodDays: noticePay > 0 ? `${noticePayDays} days` : '-',
      amount: noticePay,
      remarks: noticePay > 0
        ? `Daily basic × ${noticePayDays} days (employer-driven exit)`
        : 'Use Notice Period Recovery under deductions if employee short-serves',
      included: true,
    },
  ];
};

type ResolvedSettlementPay = {
  basicSalary: number;
  allowanceMonthly: number;
  grossSalary: number;
  packageBreakdown: string;
  payCurrency: string | null;
  contractStartDate: string | null;
  jobGrade: string | null;
  salaryGrade: string | null;
  employee: DleEmployeeDirectoryRow | null;
};

const resolveSettlementPay = async (
  employeeCode: string,
  period: string,
): Promise<ResolvedSettlementPay> => {
  const employee = await findEmployeePay(employeeCode);
  if (!employee) {
    return {
      basicSalary: 0,
      allowanceMonthly: 0,
      grossSalary: 0,
      packageBreakdown: 'Employee package not found',
      payCurrency: null,
      contractStartDate: null,
      jobGrade: null,
      salaryGrade: null,
      employee: null,
    };
  }

  const earnings = calculatePayrollEarnings(employee, {
    period,
    useHrisPackageLines: true,
  });
  const monthlyLines = (earnings.paidEarningLines || []).filter((line) => {
    if (line.includeInMonthlyPayroll === false) return false;
    const code = compact(line.code).toUpperCase();
    const name = compact(line.name).toUpperCase();
    // Keep structural monthly package only (exclude leave/one-off event lines).
    if (code.includes('LEAVE') || name.includes('LEAVE ALLOW')) return false;
    if (code === 'PER_MEAL' || code === 'REFUND') return false;
    return Number(line.amount || 0) > 0;
  });
  const basicFromLines = roundMoney(
    monthlyLines
      .filter((line) => /BASIC|LUMPSUM|JCWEEKDAY/i.test(`${line.code} ${line.name}`))
      .reduce((sum, line) => sum + Number(line.amount || 0), 0),
  );
  const basic = Math.max(
    0,
    basicFromLines || Number(earnings.basePay || employee.basicSalary || 0),
  );
  const allowancesFromLines = roundMoney(
    monthlyLines
      .filter((line) => !/BASIC|LUMPSUM|JCWEEKDAY/i.test(`${line.code} ${line.name}`))
      .reduce((sum, line) => sum + Number(line.amount || 0), 0),
  );
  const periodSalary = Number(employee.periodSalary || 0);
  const latestAllowances = Number((employee as { latestAllowances?: number | null }).latestAllowances || 0);
  let allowances = Math.max(0, allowancesFromLines || Number(earnings.allowances || 0));
  if (allowances <= 0 && periodSalary > basic) allowances = roundMoney(periodSalary - basic);
  if (allowances <= 0 && latestAllowances > 0) allowances = roundMoney(latestAllowances);
  let gross = Math.max(
    basic + allowances,
    Number(earnings.grossPay || 0),
    periodSalary,
    basic,
  );
  gross = roundMoney(gross);
  allowances = roundMoney(Math.max(allowances, Math.max(0, gross - basic)));

  const currency: 'NGN' | 'USD' = /USD|US\$/i.test(String(employee.payCurrency || '')) ? 'USD' : 'NGN';
  const allowanceLines = monthlyLines.filter(
    (line) => !/BASIC|LUMPSUM|JCWEEKDAY/i.test(`${line.code} ${line.name}`),
  );
  const lineNames = allowanceLines
    .map((line) => `${line.name || line.code} ${formatFinalPayrollMoney(line.amount, currency)}`)
    .slice(0, 5);
  const moreCount = Math.max(0, allowanceLines.length - lineNames.length);

  return {
    basicSalary: roundMoney(basic),
    allowanceMonthly: allowances,
    grossSalary: gross,
    packageBreakdown: lineNames.length
      ? `Allowances: ${lineNames.join(' · ')}${moreCount ? ` · +${moreCount} more` : ''}`
      : `Monthly allowances ${formatFinalPayrollMoney(allowances, currency)}`,
    payCurrency: employee.payCurrency || null,
    contractStartDate: employee.contractStartDate || null,
    jobGrade: employee.jobGrade || null,
    salaryGrade: employee.salaryGrade || null,
    employee,
  };
};

export const buildDefaultDeductions = (input?: {
  basicSalary?: number;
  noticeRecoveryDays?: number;
}): FinalPayrollLine[] => {
  const basic = Math.max(0, Number(input?.basicSalary || 0));
  const recoveryDays = Math.max(0, Number(input?.noticeRecoveryDays || 0));
  const noticeRecovery = recoveryDays > 0 && basic > 0
    ? roundMoney((basic / 30) * recoveryDays)
    : 0;
  return [
    {
      id: 'staff-loan',
      label: 'Staff Loan Balance',
      description: 'Outstanding staff loan',
      policyBasis: 'Loan register',
      periodDays: '-',
      amount: 0,
      remarks: '-',
      included: true,
    },
    {
      id: 'cash-advance',
      label: 'Unretired Cash Advance',
      description: 'Open cash advances',
      policyBasis: 'Treasury records',
      periodDays: '-',
      amount: 0,
      remarks: '-',
      included: true,
    },
    {
      id: 'notice-recovery',
      label: 'Notice Period Recovery',
      description: 'Unserved notice days recovered from final pay',
      policyBasis: 'Exit / resignation case',
      periodDays: recoveryDays > 0 ? `${recoveryDays} days` : '-',
      amount: noticeRecovery,
      remarks: noticeRecovery > 0
        ? `Daily basic × ${recoveryDays} unserved notice days`
        : 'No unserved notice days',
      included: true,
    },
    {
      id: 'other-deductions',
      label: 'Other Deductions',
      description: 'Other recoveries',
      policyBasis: 'HR / Finance',
      periodDays: '-',
      amount: 0,
      remarks: '-',
      included: true,
    },
  ];
};

export const buildDefaultStatutory = (): FinalPayrollLine[] => [
  {
    id: 'paye',
    label: 'PAYE',
    description: 'Pay-as-you-earn tax',
    policyBasis: 'Statutory',
    periodDays: '-',
    amount: 0,
    remarks: 'Applied on final earnings where due',
    included: true,
  },
  {
    id: 'pension',
    label: 'Pension (Employee)',
    description: 'Employee pension contribution',
    policyBasis: 'Statutory',
    periodDays: '-',
    amount: 0,
    remarks: '-',
    included: true,
  },
  {
    id: 'nhf',
    label: 'NHF',
    description: 'National Housing Fund',
    policyBasis: 'Statutory',
    periodDays: '-',
    amount: 0,
    remarks: 'Where applicable',
    included: true,
  },
];

/** Compute PAYE / pension / NHF from live payroll engines, prorated to days in settlement period. */
export const buildComputedStatutory = async (input: {
  employee: DleEmployeeDirectoryRow | null;
  period: string;
  currency: 'NGN' | 'USD';
  lastWorkingDay?: string | null;
}): Promise<FinalPayrollLine[]> => {
  const defaults = buildDefaultStatutory();
  if (!input.employee) {
    return defaults.map((line) => ({ ...line, remarks: 'Employee package not found' }));
  }
  if (input.currency === 'USD') {
    return defaults.map((line) => ({
      ...line,
      amount: 0,
      remarks: 'USD settlements exclude NGN statutory deductions',
      included: false,
    }));
  }

  try {
    const days = workingDaysUntil(input.period, input.lastWorkingDay);
    const monthDays = daysInMonth(input.period);
    const factor = monthDays > 0 ? Math.min(1, Math.max(0, days / monthDays)) : 1;
    const options = { period: input.period, useHrisPackageLines: true as const };
    const earnings = calculatePayrollEarnings(input.employee, options);

    const [taxConfig, pensionConfig, fundsConfig] = await Promise.all([
      readPayrollTaxConfig(),
      readPayrollPensionConfig(),
      readStatutoryFundsConfig(),
    ]);
    const taxVersion = activeTaxVersion(taxConfig);
    const pensionVersion = activePensionVersion(pensionConfig);
    const fundsVersion = activeStatutoryFundsVersion(fundsConfig);
    if (!taxVersion || !pensionVersion) {
      return defaults.map((line) => ({ ...line, remarks: 'Tax/pension configuration not available' }));
    }

    const pension = calculatePension(pensionInputFromEmployee(input.employee, options), pensionVersion);
    const tax = calculatePayrollTax(
      {
        ...payrollInputFromEmployee(input.employee, options, earnings),
        additionalEmployeePensionMonthly: pension.voluntaryContribution,
      },
      taxVersion,
    );
    const funds = fundsVersion
      ? calculateStatutoryFunds(statutoryFundInputFromEmployee(input.employee, 1, options), fundsVersion)
      : null;

    const payeOverride = Number(
      input.employee.payeCalculation?.ngnMonthlyPayeOverride
        ?? input.employee.payeCalculation?.monthlyPayeOverride,
    );
    const monthlyPaye = Number.isFinite(payeOverride) ? roundMoney(payeOverride) : roundMoney(tax.monthlyPaye);
    const monthlyPension = roundMoney(pension.employeeContribution + pension.voluntaryContribution);
    const monthlyNhf = roundMoney(funds?.fundResults?.find((item) => item.id === 'nhf')?.monthlyAmount || 0);
    const prorationNote = factor < 0.999
      ? `Prorated ${days}/${monthDays} days on monthly statutory`
      : 'From payroll tax / pension engines';

    return [
      {
        id: 'paye',
        label: 'PAYE',
        description: 'Pay-as-you-earn tax',
        policyBasis: 'Statutory',
        periodDays: `${days} days`,
        amount: roundMoney(monthlyPaye * factor),
        remarks: prorationNote,
        included: true,
      },
      {
        id: 'pension',
        label: 'Pension (Employee)',
        description: 'Employee pension contribution',
        policyBasis: 'Statutory',
        periodDays: `${days} days`,
        amount: roundMoney(monthlyPension * factor),
        remarks: prorationNote,
        included: true,
      },
      {
        id: 'nhf',
        label: 'NHF',
        description: 'National Housing Fund',
        policyBasis: 'Statutory',
        periodDays: `${days} days`,
        amount: roundMoney(monthlyNhf * factor),
        remarks: monthlyNhf > 0 ? prorationNote : 'Not applicable for this employee',
        included: monthlyNhf > 0,
      },
    ];
  } catch {
    return defaults.map((line) => ({ ...line, remarks: 'Unable to compute statutory — check payroll config' }));
  }
};

const mapStatusFromExit = (row: EmployeeExitStatusRecord): FinalPayrollStatus => {
  if (row.clearanceStatus === 'Overdue') return 'Exception';
  if (row.clearanceStatus === 'Complete' && row.payrollStatus === 'Closed') return 'Paid';
  if (row.clearanceStatus !== 'Complete') return 'Awaiting Clearance';
  if (row.payrollStatus === 'Final Settlement Due') return 'Ready for Calculation';
  return 'Draft';
};

const readJsonSettlements = async (): Promise<FinalPayrollSettlement[]> => {
  try {
    const parsed = JSON.parse(await readFile(FILE_PATH, 'utf8'));
    const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.settlements) ? parsed.settlements : [];
    return rows
      .filter((row: FinalPayrollSettlement) => row?.id && row?.employeeCode)
      .map((row: FinalPayrollSettlement) => ({
        ...row,
        earnings: mergeGrossSalaryEarnings(row.earnings || []),
      }));
  } catch {
    return [];
  }
};

const writeJsonSettlements = async (settlements: FinalPayrollSettlement[]) => {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(FILE_PATH, JSON.stringify({ settlements, updatedAt: nowIso() }, null, 2), 'utf8');
};

const statusToneClass = (status: FinalPayrollStatus) =>
  status.replace(/\s+/g, '').toLowerCase();

export { statusToneClass };

const buildKpis = (current: FinalPayrollSettlement[], prior: FinalPayrollSettlement[]): FinalPayrollKpi[] => {
  const count = (rows: FinalPayrollSettlement[], statuses: FinalPayrollStatus[]) =>
    rows.filter((row) => statuses.includes(row.status)).length;
  const pending = count(current, ['Draft', 'Awaiting Clearance', 'Ready for Calculation', 'In Review', 'Awaiting Approval', 'Exception']);
  const awaitingClearance = count(current, ['Awaiting Clearance']);
  const ready = count(current, ['Ready for Calculation']);
  const awaitingApproval = count(current, ['Awaiting Approval']);
  const approved = count(current, ['Approved', 'Paid']);
  const totalValue = roundMoney(current.reduce((sum, row) => sum + settlementTotals(row).net, 0));

  const priorPending = count(prior, ['Draft', 'Awaiting Clearance', 'Ready for Calculation', 'In Review', 'Awaiting Approval', 'Exception']);
  const priorClearance = count(prior, ['Awaiting Clearance']);
  const priorReady = count(prior, ['Ready for Calculation']);
  const priorApproval = count(prior, ['Awaiting Approval']);
  const priorApproved = count(prior, ['Approved', 'Paid']);
  const priorValue = roundMoney(prior.reduce((sum, row) => sum + settlementTotals(row).net, 0));

  const delta = (now: number, was: number, asPct = false) => {
    const diff = now - was;
    if (asPct) {
      if (was <= 0) return now > 0 ? '+100% vs last month' : '0% vs last month';
      const pct = Math.round((diff / was) * 1000) / 10;
      return `${pct >= 0 ? '+' : ''}${pct}% vs last month`;
    }
    return `${diff >= 0 ? '+' : ''}${diff} vs last month`;
  };

  return [
    { id: 'pending', label: 'Pending Final Payroll', value: pending, display: String(pending), deltaLabel: delta(pending, priorPending), tone: 'blue' },
    { id: 'clearance', label: 'Awaiting Clearance', value: awaitingClearance, display: String(awaitingClearance), deltaLabel: delta(awaitingClearance, priorClearance), tone: 'amber' },
    { id: 'ready', label: 'Ready for Calculation', value: ready, display: String(ready), deltaLabel: delta(ready, priorReady), tone: 'mint' },
    { id: 'approval', label: 'Awaiting Approval', value: awaitingApproval, display: String(awaitingApproval), deltaLabel: delta(awaitingApproval, priorApproval), tone: 'purple' },
    { id: 'approved', label: 'Approved for Payment', value: approved, display: String(approved), deltaLabel: delta(approved, priorApproved), tone: 'green' },
    {
      id: 'value',
      label: 'Total Settlement Value',
      value: totalValue,
      display: formatFinalPayrollMoney(totalValue, 'NGN'),
      deltaLabel: delta(totalValue, priorValue, true),
      tone: 'rose',
    },
  ];
};

const tabCountsFor = (rows: FinalPayrollSettlement[]) => {
  const counts: Record<string, number> = {
    All: rows.length,
    'Awaiting Clearance': 0,
    'Ready for Calculation': 0,
    'In Review': 0,
    'Awaiting Approval': 0,
    Approved: 0,
    Paid: 0,
    Exceptions: 0,
  };
  for (const row of rows) {
    if (row.status === 'Awaiting Clearance') counts['Awaiting Clearance'] += 1;
    else if (row.status === 'Ready for Calculation') counts['Ready for Calculation'] += 1;
    else if (row.status === 'In Review') counts['In Review'] += 1;
    else if (row.status === 'Awaiting Approval') counts['Awaiting Approval'] += 1;
    else if (row.status === 'Approved') counts.Approved += 1;
    else if (row.status === 'Paid') counts.Paid += 1;
    else if (row.status === 'Exception') counts.Exceptions += 1;
  }
  return counts;
};

const findEmployeePay = async (employeeCode: string) => {
  const source = await readPayrollEmployees().catch(() => null);
  const code = compact(employeeCode).toUpperCase();
  const hit = (source?.employees || []).find((row) => {
    const rowCode = compact(row.employeeCode || row.employeeId).toUpperCase();
    return rowCode === code || rowCode.replace(/^P/, '') === code.replace(/^P/, '');
  });
  return hit || null;
};

export const recalculateSettlement = async (settlement: FinalPayrollSettlement): Promise<FinalPayrollSettlement> => {
  const pay = await resolveSettlementPay(settlement.employeeCode, settlement.period);
  const basicSalary = pay.basicSalary || settlement.basicSalary;
  const allowanceMonthly = pay.allowanceMonthly;
  const grossSalary = pay.grossSalary || roundMoney(basicSalary + allowanceMonthly);
  const terminal = await resolveTerminalBenefitContext({
    employeeCode: settlement.employeeCode,
    employeeId: settlement.employeeId,
    dateOfJoining: pay.contractStartDate || settlement.dateOfJoining,
    serviceYears: Number(pay.employee?.yearsOfService || 0),
    exitType: settlement.exitType,
    lastWorkingDay: settlement.lastWorkingDay,
    resignationDate: settlement.resignationDate,
    noticePeriod: settlement.noticePeriod,
  });
  const autoLineIds = new Set([
    'gross-salary',
    'salary-lwd',
    'earned-allowances',
    'leave-encashment',
    'gratuity',
    'severance',
    'notice-pay',
  ]);
  const earnings = mergeGrossSalaryEarnings(buildDefaultEarnings({
    period: settlement.period,
    currency: settlement.currency,
    basicSalary,
    allowanceMonthly,
    grossSalary,
    packageBreakdown: pay.packageBreakdown,
    lastWorkingDay: settlement.lastWorkingDay,
    dateOfJoining: terminal.dateOfJoining,
    serviceYears: terminal.serviceYears,
    exitType: terminal.exitType || settlement.exitType,
    leaveBalanceDays: terminal.leaveBalanceDays,
    noticePayDays: terminal.noticePayDays,
  }).map((line) => {
    const existing = settlement.earnings.find((item) => item.id === line.id);
    if (!existing) return line;
    if (autoLineIds.has(line.id)) {
      return { ...line, included: existing.included };
    }
    return {
      ...existing,
      label: line.label,
      description: line.description,
      policyBasis: line.policyBasis,
    };
  }));
  const nextDeductions = buildDefaultDeductions({
    basicSalary,
    noticeRecoveryDays: terminal.noticeRecoveryDays,
  }).map((line) => {
    const existing = settlement.deductions.find((item) => item.id === line.id);
    if (!existing) return line;
    if (line.id === 'notice-recovery') {
      return { ...line, included: existing.included };
    }
    return existing;
  });
  return {
    ...settlement,
    basicSalary,
    allowanceMonthly,
    grossSalary,
    grade: compact(pay.jobGrade || pay.salaryGrade) || settlement.grade,
    dateOfJoining: pay.contractStartDate || settlement.dateOfJoining,
    serviceLength: serviceLengthLabel(
      Number(terminal.serviceYears || pay.employee?.yearsOfService || 0),
      pay.contractStartDate || settlement.dateOfJoining,
      settlement.lastWorkingDay,
    ),
    earnings,
    deductions: nextDeductions,
    statutory: await buildComputedStatutory({
      employee: pay.employee,
      period: settlement.period,
      currency: settlement.currency,
      lastWorkingDay: settlement.lastWorkingDay,
    }),
    updatedAt: nowIso(),
  };
};

const settlementFromExit = (
  row: EmployeeExitStatusRecord,
  period: string,
  actor: string,
  pay?: ResolvedSettlementPay | null,
): FinalPayrollSettlement => {
  const currency: 'NGN' | 'USD' = /USD|US\$/i.test(String(pay?.payCurrency || '')) ? 'USD' : 'NGN';
  const basic = Number(pay?.basicSalary || 0);
  const allowanceMonthly = Number(pay?.allowanceMonthly || 0);
  const grossSalary = Number(pay?.grossSalary || basic + allowanceMonthly);
  const lastWorkingDay = row.exitDate || row.contractEndDate;
  const status = mapStatusFromExit(row);
  const id = `FPS-${period.replace('-', '')}-${compact(row.employeeCode).toUpperCase()}`;
  return {
    id,
    period,
    employeeId: row.employeeId,
    employeeCode: row.employeeCode,
    employeeName: row.employeeName,
    department: row.department || '—',
    employmentType: row.employmentType || '—',
    jobTitle: row.jobTitle || '—',
    grade: compact(pay?.jobGrade || pay?.salaryGrade) || '—',
    currency,
    basicSalary: basic,
    allowanceMonthly,
    grossSalary,
    dateOfJoining: pay?.contractStartDate || row.contractStartDate,
    serviceLength: serviceLengthLabel(row.serviceYears, pay?.contractStartDate || row.contractStartDate, lastWorkingDay),
    exitType: row.exitCategory === 'Active Monitoring' ? 'Resignation' : row.exitCategory,
    resignationDate: row.noticeDate,
    lastWorkingDay,
    noticePeriod: '1 Month',
    reasonForLeaving: '',
    remarks: '',
    lastRegularPayroll: periodLabelFromCode(period),
    nextPayrollExcluded: true,
    status,
    clearance: defaultClearance().map((item) => ({
      ...item,
      status: row.clearanceStatus === 'Complete' ? 'Completed' : item.status,
    })),
    approvalStages: defaultApprovalStages(status),
    earnings: buildDefaultEarnings({
      period,
      currency,
      basicSalary: basic,
      allowanceMonthly,
      grossSalary,
      packageBreakdown: pay?.packageBreakdown,
      lastWorkingDay,
      dateOfJoining: pay?.contractStartDate || row.contractStartDate,
      serviceYears: row.serviceYears,
      exitType: row.exitCategory === 'Active Monitoring' ? 'Resignation' : row.exitCategory,
    }),
    deductions: buildDefaultDeductions({ basicSalary: basic }),
    statutory: buildDefaultStatutory(),
    comments: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
    createdBy: actor,
    updatedBy: actor,
  };
};

/** Previously auto-created drafts from exit register; disabled so settlements are only saved explicitly. */
const loadSettlementsForPeriod = async (period: string) => {
  const existing = await readJsonSettlements();
  return existing.filter((row) => row.period === period);
};

export const listFinalPayrollSettlements = async (period?: string) => {
  const periodCode = period || currentFinalPayrollPeriod();
  return loadSettlementsForPeriod(periodCode);
};

export const getFinalPayrollSettlement = async (id: string) => {
  const rows = await readJsonSettlements();
  return rows.find((row) => row.id === id) || null;
};

const codesMatch = (left?: string | null, right?: string | null) => {
  const a = compact(left).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const b = compact(right).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!a || !b) return false;
  return a === b || a.replace(/^P/, '') === b.replace(/^P/, '');
};

/** Latest settlement for an employee (optional period filter), plus profile deep-link helpers. */
export const resolveFinalPayrollForEmployee = async (input: {
  employeeCode?: string | null;
  employeeId?: string | null;
  period?: string | null;
}) => {
  const code = compact(input.employeeCode);
  const employeeId = compact(input.employeeId);
  if (!code && !employeeId) return null;

  const period = compact(input.period) || null;
  const all = await readJsonSettlements();
  const matches = all
    .filter((row) => {
      if (period && row.period !== period) return false;
      return codesMatch(row.employeeCode, code)
        || codesMatch(row.employeeId, employeeId)
        || codesMatch(row.employeeCode, employeeId)
        || codesMatch(row.employeeId, code);
    })
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));

  const settlement = matches[0] || null;
  const totals = settlement ? settlementTotals(settlement) : null;

  const resignation = await findResignationByEmployee({
    employeeCode: code || null,
    employeeId: employeeId || null,
  });
  const startResignationHref = `/hris/offboarding/resignation-management/new?employeeCode=${encodeURIComponent(code || employeeId)}`;
  const openResignationHref = resignation
    ? `/hris/offboarding/resignation-management?id=${encodeURIComponent(resignation.id)}&period=${encodeURIComponent(resignation.period)}`
    : startResignationHref;
  const newSettlementHref = resignation
    ? resignationFinalPayrollHref(resignation)
    : `/hris/offboarding/final-payroll-processing/new-settlement?employeeCode=${encodeURIComponent(code || employeeId)}`;

  return {
    settlement,
    totals,
    resignation,
    resignationReady: resignation ? resignationReadyForFinalPayroll(resignation) : false,
    profileHref: `/hris/employees/employee-profile/${encodeURIComponent(settlement?.employeeId || employeeId || code)}`,
    registerHref: settlement
      ? `/hris/offboarding/final-payroll-processing?id=${encodeURIComponent(settlement.id)}&period=${encodeURIComponent(settlement.period)}`
      : `/hris/offboarding/final-payroll-processing${period ? `?period=${encodeURIComponent(period)}` : ''}`,
    newSettlementHref,
    openResignationHref,
    startResignationHref,
  };
};

export const buildFinalPayrollPayload = async (input?: {
  period?: string;
  selectedId?: string | null;
  employeeCode?: string | null;
  employeeId?: string | null;
  actor?: string;
}): Promise<FinalPayrollPayload> => {
  const period = input?.period || currentFinalPayrollPeriod();
  const all = await readJsonSettlements();
  const settlements = all
    .filter((row) => row.period === period)
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  const priorPeriod = previousFinalPayrollPeriod(period);
  const prior = priorPeriod ? all.filter((row) => row.period === priorPeriod) : [];

  let selectedId = input?.selectedId || null;
  if (!selectedId && (input?.employeeCode || input?.employeeId)) {
    const hit = settlements.find((row) =>
      codesMatch(row.employeeCode, input.employeeCode)
      || codesMatch(row.employeeId, input.employeeId)
      || codesMatch(row.employeeCode, input.employeeId)
      || codesMatch(row.employeeId, input.employeeCode),
    );
    selectedId = hit?.id || null;
  }
  if (!selectedId) selectedId = settlements[0]?.id || null;
  const selected = settlements.find((row) => row.id === selectedId) || null;

  return {
    generatedAt: nowIso(),
    period,
    periodLabel: periodLabelFromCode(period),
    settlements,
    kpis: buildKpis(settlements, prior),
    tabCounts: tabCountsFor(settlements),
    selectedId,
    selected,
    filterOptions: {
      departments: [...new Set(settlements.map((row) => row.department).filter(Boolean))].sort(),
      exitTypes: [...new Set(settlements.map((row) => row.exitType).filter(Boolean))].sort(),
      statuses: ['Draft', 'Awaiting Clearance', 'Ready for Calculation', 'In Review', 'Awaiting Approval', 'Approved', 'Paid', 'Exception'],
    },
  };
};

export const createFinalPayrollSettlement = async (input: {
  actor: string;
  period?: string;
  employeeCode: string;
  exitType?: string;
  resignationDate?: string | null;
  lastWorkingDay?: string | null;
  noticePeriod?: string;
  reasonForLeaving?: string;
  remarks?: string;
  /** When false, build settlement in memory only (do not write JSON). */
  persist?: boolean;
}) => {
  const period = input.period || currentFinalPayrollPeriod();
  const code = compact(input.employeeCode).toUpperCase();
  if (!code) throw new Error('Employee code is required.');
  const persist = input.persist !== false;

  const all = await readJsonSettlements();
  const existing = all.find((row) => row.period === period && compact(row.employeeCode).toUpperCase() === code);
  // Never reuse a premature Draft when caller asked for a non-persisted preview.
  if (existing && persist && existing.status !== 'Draft') return existing;

  const exit = await readEmployeeExitStatusFromDb().catch(() => null);
  const exitRow = (exit?.records || []).find((row) => compact(row.employeeCode).toUpperCase() === code);
  const pay = await resolveSettlementPay(code, period);
  const directory = pay.employee;

  let settlement: FinalPayrollSettlement;
  if (exitRow) {
    settlement = settlementFromExit(exitRow, period, input.actor, pay);
  } else if (directory) {
    settlement = settlementFromExit(
      {
        id: directory.employeeId || code,
        employeeId: directory.employeeId || code,
        employeeCode: directory.employeeCode || code,
        employeeName: directory.fullName || code,
        jobTitle: directory.jobTitle || '—',
        department: directory.department || '—',
        division: directory.division || '',
        businessUnit: directory.businessUnit || '',
        costCenter: directory.costCenter || '',
        location: directory.location || '',
        managerName: directory.managerName || '',
        hrBusinessPartner: '',
        employmentType: directory.employmentType || 'Permanent',
        currentStatus: directory.status || 'Active',
        exitCategory: input.exitType || 'Resignation',
        exitStage: 'Payroll Closure',
        exitDate: input.lastWorkingDay || null,
        noticeDate: input.resignationDate || null,
        contractStartDate: directory.contractStartDate || null,
        contractEndDate: directory.contractEndDate || null,
        daysToExit: null,
        daysSinceExit: null,
        clearanceStatus: 'In Progress',
        payrollStatus: 'Final Settlement Due',
        accessStatus: 'Review Required',
        documentStatus: 'Partial',
        risk: 'Medium',
        riskReason: 'Final settlement created manually.',
        serviceYears: Number(directory.yearsOfService || 0),
        documentCount: Number(directory.documentCount || 0),
        emergencyContactCount: 0,
        lastUpdated: nowIso(),
      },
      period,
      input.actor,
      pay,
    );
  } else {
    throw new Error(`Employee ${code} was not found in the directory or exit register.`);
  }

  const lastWorkingDay = input.lastWorkingDay ?? settlement.lastWorkingDay;
  const resignationDate = input.resignationDate ?? settlement.resignationDate;
  const exitType = input.exitType || settlement.exitType;
  const terminal = await resolveTerminalBenefitContext({
    employeeCode: code,
    employeeId: settlement.employeeId || directory?.employeeId,
    dateOfJoining: pay.contractStartDate || settlement.dateOfJoining,
    serviceYears: Number(directory?.yearsOfService || exitRow?.serviceYears || 0),
    exitType,
    lastWorkingDay,
    resignationDate,
    noticePeriod: input.noticePeriod || settlement.noticePeriod,
  });

  settlement = {
    ...settlement,
    id: persist && existing?.status === 'Draft' ? existing.id : `FPS-${period.replace('-', '')}-${code}-DRAFT`,
    status: 'Draft',
    exitType,
    resignationDate,
    lastWorkingDay,
    noticePeriod: input.noticePeriod || settlement.noticePeriod,
    reasonForLeaving: input.reasonForLeaving || '',
    remarks: input.remarks || '',
    approvalStages: defaultApprovalStages('Draft'),
    basicSalary: pay.basicSalary || settlement.basicSalary,
    allowanceMonthly: pay.allowanceMonthly,
    grossSalary: pay.grossSalary,
    dateOfJoining: pay.contractStartDate || settlement.dateOfJoining,
    serviceLength: serviceLengthLabel(
      Number(directory?.yearsOfService || exitRow?.serviceYears || 0),
      pay.contractStartDate || settlement.dateOfJoining,
      lastWorkingDay,
    ),
    earnings: buildDefaultEarnings({
      period,
      currency: settlement.currency,
      basicSalary: pay.basicSalary || settlement.basicSalary,
      allowanceMonthly: pay.allowanceMonthly,
      grossSalary: pay.grossSalary,
      packageBreakdown: pay.packageBreakdown,
      lastWorkingDay,
      dateOfJoining: terminal.dateOfJoining,
      serviceYears: terminal.serviceYears,
      exitType: terminal.exitType || exitType,
      leaveBalanceDays: terminal.leaveBalanceDays,
      noticePayDays: terminal.noticePayDays,
    }),
    deductions: buildDefaultDeductions({
      basicSalary: pay.basicSalary || settlement.basicSalary,
      noticeRecoveryDays: terminal.noticeRecoveryDays,
    }),
    statutory: await buildComputedStatutory({
      employee: directory,
      period,
      currency: settlement.currency,
      lastWorkingDay,
    }),
  };

  if (!persist) {
    // Ephemeral preview id — not written until Save / Submit.
    settlement = { ...settlement, id: `PREVIEW-${code}` };
    return settlement;
  }

  // Replace any existing Draft for this employee/period.
  const next = all.filter((row) => !(row.period === period && compact(row.employeeCode).toUpperCase() === code && row.status === 'Draft'));
  settlement = {
    ...settlement,
    id: `FPS-${period.replace('-', '')}-${code}`,
  };
  next.push(settlement);
  await writeJsonSettlements(next);
  return settlement;
};

export const previewFinalPayrollSettlement = async (input: {
  actor: string;
  period?: string;
  employeeCode: string;
  exitType?: string;
  resignationDate?: string | null;
  lastWorkingDay?: string | null;
  noticePeriod?: string;
  reasonForLeaving?: string;
  remarks?: string;
}) => createFinalPayrollSettlement({ ...input, persist: false });

export const discardDraftFinalPayrollSettlement = async (input: {
  id?: string;
  employeeCode?: string;
  period?: string;
}) => {
  const period = input.period || currentFinalPayrollPeriod();
  const all = await readJsonSettlements();
  const code = compact(input.employeeCode).toUpperCase();
  const next = all.filter((row) => {
    if (input.id && row.id === input.id && row.status === 'Draft') return false;
    if (code && row.period === period && compact(row.employeeCode).toUpperCase() === code && row.status === 'Draft') return false;
    return true;
  });
  if (next.length !== all.length) await writeJsonSettlements(next);
  return { removed: all.length - next.length };
};

export const updateFinalPayrollSettlement = async (input: {
  id: string;
  actor: string;
  patch?: Partial<FinalPayrollSettlement>;
  action?: 'save' | 'recalculate' | 'submit' | 'approve' | 'return' | 'clarify' | 'mark-paid';
  comment?: string;
}) => {
  const all = await readJsonSettlements();
  const index = all.findIndex((row) => row.id === input.id);
  if (index < 0) throw new Error('Settlement not found.');
  let row = { ...all[index], ...(input.patch || {}) };
  row.earnings = mergeGrossSalaryEarnings(row.earnings || []);

  if (input.action === 'recalculate') row = await recalculateSettlement(row);
  if (input.action === 'submit') {
    row.status = row.clearance.some((item) => item.status === 'Pending') ? 'Awaiting Clearance' : 'In Review';
    row.approvalStages = defaultApprovalStages(row.status);
  }
  if (input.action === 'approve') {
    if (row.status === 'In Review') row.status = 'Awaiting Approval';
    else if (row.status === 'Awaiting Approval') row.status = 'Approved';
    else row.status = 'Approved';
    row.approvalStages = defaultApprovalStages(row.status);
  }
  if (input.action === 'return') {
    row.status = 'Ready for Calculation';
    row.approvalStages = defaultApprovalStages(row.status);
  }
  if (input.action === 'clarify') {
    row.status = 'Exception';
    row.approvalStages = defaultApprovalStages('In Review');
  }
  if (input.action === 'mark-paid') {
    row.status = 'Paid';
    row.approvalStages = defaultApprovalStages('Paid');
  }

  if (compact(input.comment)) {
    row.comments = [
      ...row.comments,
      {
        id: `cmt-${Date.now()}`,
        body: compact(input.comment),
        actor: input.actor,
        createdAt: nowIso(),
      },
    ];
  }

  row.updatedAt = nowIso();
  row.updatedBy = input.actor;
  all[index] = row;
  await writeJsonSettlements(all);
  return row;
};

export const searchEmployeesForFinalPayroll = async (query: string, limit = 12) => {
  const q = compact(query).toLowerCase();
  if (q.length < 2) return [];
  const source = await readPayrollEmployees();
  return source.employees
    .filter((row) => {
      const blob = `${row.fullName} ${row.employeeCode} ${row.employeeId} ${row.department}`.toLowerCase();
      return blob.includes(q);
    })
    .slice(0, limit)
    .map((row) => ({
      employeeId: row.employeeId,
      employeeCode: row.employeeCode,
      employeeName: row.fullName,
      department: row.department,
      employmentType: row.employmentType,
      jobTitle: row.jobTitle,
      currency: /USD|US\$/i.test(String(row.payCurrency || '')) ? 'USD' as const : 'NGN' as const,
      basicSalary: Number(row.basicSalary || 0),
      dateOfJoining: row.contractStartDate || null,
      status: row.status,
    }));
};

export const settlementsToCsv = (settlements: FinalPayrollSettlement[]) => {
  const header = [
    'Employee',
    'Employee ID',
    'Department',
    'Exit Type',
    'Last Working Day',
    'Currency',
    'Gross Entitlement',
    'Deductions',
    'Statutory',
    'Final Net Pay',
    'Clearance',
    'Approval',
    'Status',
  ];
  const lines = settlements.map((row) => {
    const totals = settlementTotals(row);
    const clearance = row.clearance.every((item) => item.status === 'Completed') ? 'Cleared' : 'Pending';
    const approval = row.approvalStages.find((stage) => stage.status === 'In Review')?.label
      || (row.status === 'Approved' || row.status === 'Paid' ? 'Approved' : 'Pending');
    return [
      row.employeeName,
      row.employeeCode,
      row.department,
      row.exitType,
      formatFinalPayrollDate(row.lastWorkingDay),
      row.currency,
      totals.gross,
      totals.deductions,
      totals.statutory,
      totals.net,
      clearance,
      approval,
      row.status,
    ].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',');
  });
  return [header.join(','), ...lines].join('\n');
};
