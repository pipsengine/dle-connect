import type { DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import { roundMoney } from '@/lib/payroll-package-lines';

/**
 * GM Operations (P0442 Odulate) dual-currency Goal Seek from October 2026.
 * Annual net target $87,000, split 50% USD / 50% NGN → $3,625 net per leg.
 * When the CBN rate moves, gross is re-sought so the dollar net stays put.
 */
export const GM_OPERATIONS_GOAL_SEEK_EMPLOYEE_CODE = 'P0442';
export const GM_OPERATIONS_GOAL_SEEK_FROM_PERIOD = '2026-10';
export const GM_OPERATIONS_ANNUAL_NET_USD = 87_000;
export const GM_OPERATIONS_MONTHLY_NET_PER_LEG_USD = GM_OPERATIONS_ANNUAL_NET_USD / 2 / 12;
/** Used when the CBN feed is unavailable (October sample rate). */
export const GM_OPERATIONS_FALLBACK_FX = 1332.99;
export const GM_OPERATIONS_ANNUAL_RENT_RELIEF = 500_000;

export type GmOperationsGoalSeekPackage = {
  employeeCode: string;
  fxRate: number;
  grossUsd: number;
  grossNgn: number;
  payeUsd: number;
  payeNgn: number;
  netUsd: number;
  netNgn: number;
  pensionRefundNgn: number;
  linesUsd: Array<{ code: string; name: string; amount: number }>;
  linesNgn: Array<{ code: string; name: string; amount: number }>;
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
  const target = GM_OPERATIONS_GOAL_SEEK_EMPLOYEE_CODE;
  const shortCode = target.replace(/^P/, '');
  if (codes.some((code) => code === target || code === shortCode)) return true;
  const name = String(employee.fullName || '').toUpperCase();
  return name.includes('ODULATE');
};

export const gmOperationsGoalSeekApplies = (
  employee: {
    employeeCode?: string | null;
    employeeId?: string | null;
    sourceEmployeeId?: string | null;
    fullName?: string | null;
  },
  period?: string | null,
) => {
  const key = periodKey(period);
  if (key && key < GM_OPERATIONS_GOAL_SEEK_FROM_PERIOD) return false;
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

const splitUsdLines = (grossUsd: number) => {
  const basic = roundMoney(grossUsd * 0.2);
  const housing = roundMoney(grossUsd * 0.15);
  const transport = roundMoney(grossUsd * 0.1);
  const other = roundMoney(grossUsd - basic - housing - transport);
  return {
    basic,
    housing,
    transport,
    other,
    gross: roundMoney(basic + housing + transport + other),
  };
};

/**
 * Same Goal Seek used for the October sample:
 * taxable adds the pension refund then pension relief cancels it, leaving
 * chargeable = annual structural gross − rent relief; cash net = gross − PAYE.
 */
export const evaluateGmOperationsGoalSeek = (grossUsd: number, fxRate: number) => {
  const fx = Number(fxRate);
  const usd = splitUsdLines(grossUsd);
  const nBasic = roundMoney(usd.basic * fx);
  const nHousing = roundMoney(usd.housing * fx);
  const nTransport = roundMoney(usd.transport * fx);
  const nOther = roundMoney(usd.other * fx);
  const ngnGross = roundMoney(nBasic + nHousing + nTransport + nOther);
  const bht = nBasic + nHousing + nTransport;
  const pensionRefund = roundMoney(bht * 0.08);
  const chargeable = ngnGross * 12 - GM_OPERATIONS_ANNUAL_RENT_RELIEF;
  const payeNgn = roundMoney(payeAnnualFromChargeable(chargeable) / 12);
  const payeUsd = roundMoney(payeNgn / fx);
  const netNgn = roundMoney(ngnGross - payeNgn);
  const netUsd = netNgn / fx;
  return {
    usd,
    ngn: { basic: nBasic, housing: nHousing, transport: nTransport, other: nOther, gross: ngnGross },
    pensionRefund,
    payeNgn,
    payeUsd,
    netNgn,
    netUsd,
    dollarNet: roundMoney(usd.gross - payeUsd),
  };
};

export const seekGmOperationsGoalSeekPackage = (
  fxRate: number,
  targetNetUsd = GM_OPERATIONS_MONTHLY_NET_PER_LEG_USD,
): GmOperationsGoalSeekPackage => {
  const fx = Number(fxRate) > 0 ? Number(fxRate) : GM_OPERATIONS_FALLBACK_FX;
  let lo = 300_000; // cents
  let hi = 800_000;
  for (let i = 0; i < 48; i += 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (roundMoney(evaluateGmOperationsGoalSeek(mid / 100, fx).netUsd) < targetNetUsd) lo = mid + 1;
    else hi = mid;
  }
  // Prefer the lowest gross whose rounded dollar net lands on the target.
  let grossCents = lo;
  while (grossCents > 300_000) {
    const prior = evaluateGmOperationsGoalSeek((grossCents - 1) / 100, fx);
    if (roundMoney(prior.netUsd) < targetNetUsd) break;
    grossCents -= 1;
  }
  const solved = evaluateGmOperationsGoalSeek(grossCents / 100, fx);
  return {
    employeeCode: GM_OPERATIONS_GOAL_SEEK_EMPLOYEE_CODE,
    fxRate: roundMoney(fx),
    grossUsd: solved.usd.gross,
    grossNgn: solved.ngn.gross,
    payeUsd: solved.payeUsd,
    payeNgn: solved.payeNgn,
    netUsd: roundMoney(solved.netUsd),
    netNgn: solved.netNgn,
    pensionRefundNgn: solved.pensionRefund,
    linesUsd: [
      { code: 'EXP_SMGT_BASIC', name: 'Basic', amount: solved.usd.basic },
      { code: 'EXP_SMGT_HOUSING', name: 'Housing', amount: solved.usd.housing },
      { code: 'EXP_SMNG_TRANSPORT', name: 'Transport', amount: solved.usd.transport },
      { code: 'EXP_SMGT_OTHER', name: 'Other allowance', amount: solved.usd.other },
    ],
    linesNgn: [
      { code: 'BASIC', name: 'BASIC SALARY', amount: solved.ngn.basic },
      { code: 'SNMHOUSINGTAX', name: 'SENIOR MANAGEMENT HOUSING_TAX', amount: solved.ngn.housing },
      { code: 'SNMTRANSPTAX', name: 'SENIOR MANAGER TRANSPORT', amount: solved.ngn.transport },
      { code: 'SNMOTHALLTAX', name: 'SENIOR MANAGEMENT OTHER ALLOWANCE_T', amount: solved.ngn.other },
    ],
  };
};

export const gmOperationsGoalSeekPackageFor = (
  employee: {
    employeeCode?: string | null;
    employeeId?: string | null;
    sourceEmployeeId?: string | null;
    fullName?: string | null;
  },
  period?: string | null,
  fxRate?: number | null,
) => {
  if (!gmOperationsGoalSeekApplies(employee, period)) return null;
  return seekGmOperationsGoalSeekPackage(Number(fxRate) > 0 ? Number(fxRate) : GM_OPERATIONS_FALLBACK_FX);
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

export const applyGmOperationsGoalSeek = <T extends DleEmployeeDirectoryRow>(
  employee: T,
  period?: string | null,
  fxRate?: number | null,
): T => {
  const pack = gmOperationsGoalSeekPackageFor(employee, period, fxRate);
  if (!pack) return employee;
  return {
    ...employee,
    payCurrency: employee.payCurrency || 'USD',
    periodSalary: pack.grossUsd,
    basicSalary: pack.linesUsd[0]?.amount ?? pack.grossUsd * 0.2,
    hasDualCurrencyPayroll: true,
    localPayCurrency: 'NGN',
    localPayrollGroup: employee.localPayrollGroup || 'DLE',
    localPeriodSalary: pack.grossNgn,
    sagePayrollEarnings: toEarningLines(pack.linesUsd) as T['sagePayrollEarnings'],
    sageLocalPayrollEarnings: toEarningLines(pack.linesNgn) as T['sageLocalPayrollEarnings'],
    annualRentRelief: GM_OPERATIONS_ANNUAL_RENT_RELIEF,
    payeCalculation: {
      ...(employee.payeCalculation || {}),
      includeRefundInTaxable: false,
      annualRentRelief: GM_OPERATIONS_ANNUAL_RENT_RELIEF,
      monthlyPayeOverride: pack.payeUsd,
      ngnMonthlyPayeOverride: pack.payeNgn,
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
  totalDeductions: number;
  netPay: number;
  employerCost: number;
  periodPackageGross?: number;
  taxablePay?: number;
  nonTaxablePay?: number;
  usdPackageGross?: number | null;
  deductionRatio?: number;
  lockedNgnGross?: number | null;
  earningLines: Array<Record<string, unknown>>;
};

/** Keep the sought USD package on the register after other overlays. */
export const applyGmOperationsGoalSeekToRecords = <T extends GoalSeekRecord>(
  records: T[],
  period?: string | null,
  fxRate?: number | null,
): T[] => records.map((record) => {
  const pack = gmOperationsGoalSeekPackageFor(record, period, fxRate);
  if (!pack || record.isDailyRate) return record;
  if (String(record.payCurrency || '').toUpperCase() !== 'USD') return record;
  const basic = pack.linesUsd[0]?.amount || 0;
  const gross = pack.grossUsd;
  const deductions = roundMoney(Number(record.totalDeductions || 0));
  const employerOnTop = roundMoney(Math.max(0, Number(record.employerCost || 0) - Number(record.grossPay || 0)));
  return {
    ...record,
    basePay: basic,
    allowances: roundMoney(gross - basic),
    grossPay: gross,
    periodPackageGross: gross,
    taxablePay: gross,
    nonTaxablePay: 0,
    usdPackageGross: gross,
    netPay: roundMoney(Math.max(0, gross - deductions)),
    employerCost: roundMoney(gross + employerOnTop),
    deductionRatio: gross > 0 ? roundMoney((deductions / gross) * 100) : 0,
    lockedNgnGross: pack.grossNgn,
    earningLines: pack.linesUsd.map((line) => ({
      code: line.code,
      name: line.name,
      amount: line.amount,
      taxable: true,
      percentOfGross: gross ? line.amount / gross : 0,
    })),
  } as T;
});
