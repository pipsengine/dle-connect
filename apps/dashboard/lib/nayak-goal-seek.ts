import type { DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import { GM_OPERATIONS_FALLBACK_FX } from '@/lib/gm-operations-goal-seek';
import { roundMoney } from '@/lib/payroll-package-lines';

/**
 * Expatriate Nayak (PEX001) from October 2026.
 * His dollar package is one basic line. Gross is re-sought at the payroll
 * USD/NGN rate so cash net (gross − PAYE) stays $3,000. The local naira
 * package is left as saved.
 */
export const NAYAK_GOAL_SEEK_FROM_PERIOD = '2026-10';
export const NAYAK_MONTHLY_NET_USD = 3_000;
export const NAYAK_ANNUAL_RENT_RELIEF = 500_000;

export type NayakGoalSeekPackage = {
  employeeCode: string;
  fxRate: number;
  grossUsd: number;
  grossNgn: number;
  payeUsd: number;
  payeNgn: number;
  netUsd: number;
  netNgn: number;
  linesUsd: Array<{ code: string; name: string; amount: number }>;
};

const periodKey = (period?: string | null) => {
  const match = String(period || '').match(/\d{4}-\d{2}/);
  return match ? match[0] : '';
};

const packageMatchesEmployee = (employee: {
  employeeCode?: string | null;
  employeeId?: string | null;
  sourceEmployeeId?: string | null;
  fullName?: string | null;
}) => {
  const codes = [employee.employeeCode, employee.employeeId, employee.sourceEmployeeId]
    .map((value) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, ''))
    .filter(Boolean);
  if (codes.some((code) => code === 'PEX001' || code === 'EX001' || code === '00EX001')) return true;
  return String(employee.fullName || '').toUpperCase().includes('NAYAK');
};

export const nayakGoalSeekApplies = (
  employee: {
    employeeCode?: string | null;
    employeeId?: string | null;
    sourceEmployeeId?: string | null;
    fullName?: string | null;
  },
  period?: string | null,
) => {
  const key = periodKey(period);
  if (key && key < NAYAK_GOAL_SEEK_FROM_PERIOD) return false;
  return packageMatchesEmployee(employee);
};

const NTA_BANDS: Array<[number, number]> = [
  [800_000, 0],
  [2_200_000, 0.15],
  [9_000_000, 0.18],
  [13_000_000, 0.21],
  [25_000_000, 0.23],
  [Number.POSITIVE_INFINITY, 0.25],
];

const payeAnnualFromChargeable = (chargeable: number) => {
  let rem = Math.max(0, chargeable);
  let tax = 0;
  for (const [width, rate] of NTA_BANDS) {
    const slice = Math.min(rem, width);
    tax += slice * rate;
    rem -= slice;
    if (rem <= 0) break;
  }
  return tax;
};

/**
 * Dollar basic converted at the payroll rate. Chargeable income is the annual
 * naira equivalent less the ₦500,000 rent relief already on his setup.
 * Cash net is dollar gross minus PAYE converted back at the same rate.
 */
export const evaluateNayakGoalSeek = (grossUsd: number, fxRate: number) => {
  const fx = Number(fxRate);
  const gross = roundMoney(grossUsd);
  const ngnGross = roundMoney(gross * fx);
  const chargeable = ngnGross * 12 - NAYAK_ANNUAL_RENT_RELIEF;
  const payeNgn = roundMoney(payeAnnualFromChargeable(chargeable) / 12);
  const payeUsd = roundMoney(payeNgn / fx);
  const netNgn = roundMoney(ngnGross - payeNgn);
  const netUsd = roundMoney(gross - payeUsd);
  return {
    gross,
    ngnGross,
    payeNgn,
    payeUsd,
    netNgn,
    netUsd,
  };
};

export const seekNayakGoalSeekPackage = (
  fxRate: number,
  targetNetUsd = NAYAK_MONTHLY_NET_USD,
): NayakGoalSeekPackage => {
  const fx = Number(fxRate) > 0 ? Number(fxRate) : GM_OPERATIONS_FALLBACK_FX;
  let lo = 300_000; // cents
  let hi = 2_000_000;
  for (let i = 0; i < 48; i += 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (roundMoney(evaluateNayakGoalSeek(mid / 100, fx).netUsd) < targetNetUsd) lo = mid + 1;
    else hi = mid;
  }
  let grossCents = lo;
  while (grossCents > 300_000) {
    const prior = evaluateNayakGoalSeek((grossCents - 1) / 100, fx);
    if (roundMoney(prior.netUsd) < targetNetUsd) break;
    grossCents -= 1;
  }
  const solved = evaluateNayakGoalSeek(grossCents / 100, fx);
  return {
    employeeCode: 'PEX001',
    fxRate: roundMoney(fx),
    grossUsd: solved.gross,
    grossNgn: solved.ngnGross,
    payeUsd: solved.payeUsd,
    payeNgn: solved.payeNgn,
    netUsd: solved.netUsd,
    netNgn: solved.netNgn,
    linesUsd: [
      { code: 'BASIC', name: 'Basic', amount: solved.gross },
    ],
  };
};

export const nayakGoalSeekPackageFor = (
  employee: {
    employeeCode?: string | null;
    employeeId?: string | null;
    sourceEmployeeId?: string | null;
    fullName?: string | null;
  },
  period?: string | null,
  fxRate?: number | null,
) => {
  if (!nayakGoalSeekApplies(employee, period)) return null;
  return seekNayakGoalSeekPackage(Number(fxRate) > 0 ? Number(fxRate) : GM_OPERATIONS_FALLBACK_FX);
};

const toEarningLines = (lines: Array<{ code: string; name: string; amount: number }>) =>
  lines.map((item) => ({
    code: item.code,
    name: item.name,
    amount: item.amount,
    taxableAmount: item.amount,
    sourceAmount: item.amount,
    runFrequency: 'monthly' as const,
    includeInMonthlyPayroll: true,
  }));

export const applyNayakGoalSeek = <T extends DleEmployeeDirectoryRow>(
  employee: T,
  period?: string | null,
  fxRate?: number | null,
): T => {
  const pack = nayakGoalSeekPackageFor(employee, period, fxRate);
  if (!pack) return employee;
  return {
    ...employee,
    payCurrency: employee.payCurrency || 'USD',
    periodSalary: pack.grossUsd,
    basicSalary: pack.grossUsd,
    sagePayrollEarnings: toEarningLines(pack.linesUsd) as T['sagePayrollEarnings'],
    annualRentRelief: NAYAK_ANNUAL_RENT_RELIEF,
    payeCalculation: {
      ...(employee.payeCalculation || {}),
      includeRefundInTaxable: false,
      annualRentRelief: NAYAK_ANNUAL_RENT_RELIEF,
      monthlyPayeOverride: pack.payeUsd,
      ngnMonthlyPayeOverride: employee.payeCalculation?.ngnMonthlyPayeOverride,
    },
  };
};

type GoalSeekRecord = {
  employeeCode?: string | null;
  employeeId?: string | null;
  sourceEmployeeId?: string | null;
  fullName?: string | null;
  payCurrency?: string | null;
  isDailyRate?: boolean;
  grossPay: number;
  basePay: number;
  allowances: number;
  paye?: number;
  totalDeductions: number;
  deductions?: number;
  netPay: number;
  employerCost: number;
  periodPackageGross?: number;
  taxablePay?: number;
  nonTaxablePay?: number;
  usdPackageGross?: number | null;
  deductionRatio?: number;
  deductionLines?: Array<{ code?: string; label?: string; amount: number }>;
  earningLines: Array<Record<string, unknown>>;
};

/** Keep the sought USD package on the register. The naira row is not rewritten. */
export const applyNayakGoalSeekToRecords = <T extends GoalSeekRecord>(
  records: T[],
  period?: string | null,
  fxRate?: number | null,
): T[] => records.map((record) => {
  const pack = nayakGoalSeekPackageFor(record, period, fxRate);
  if (!pack || record.isDailyRate) return record;
  if (String(record.payCurrency || '').toUpperCase() !== 'USD') return record;
  const gross = pack.grossUsd;
  const paye = pack.payeUsd;
  const priorPaye = roundMoney(Number(record.paye || 0));
  const otherDeductions = roundMoney(Math.max(0, Number(record.totalDeductions || 0) - priorPaye));
  const totalDeductions = roundMoney(paye + otherDeductions);
  const employerOnTop = roundMoney(Math.max(0, Number(record.employerCost || 0) - Number(record.grossPay || 0)));
  const deductionLines = Array.isArray(record.deductionLines)
    ? record.deductionLines.map((line) => (
      /PAYE/i.test(`${line.code || ''} ${line.label || ''}`)
        ? { ...line, amount: paye }
        : line
    ))
    : record.deductionLines;
  return {
    ...record,
    basePay: gross,
    allowances: 0,
    grossPay: gross,
    periodPackageGross: gross,
    taxablePay: gross,
    nonTaxablePay: 0,
    usdPackageGross: gross,
    paye,
    totalDeductions,
    deductions: totalDeductions,
    netPay: roundMoney(Math.max(0, gross - totalDeductions)),
    employerCost: roundMoney(gross + employerOnTop),
    deductionRatio: gross > 0 ? roundMoney((totalDeductions / gross) * 100) : 0,
    deductionLines,
    earningLines: pack.linesUsd.map((line) => ({
      code: line.code,
      name: line.name,
      amount: line.amount,
      taxable: true,
      percentOfGross: gross ? line.amount / gross : 0,
    })),
  } as T;
});
