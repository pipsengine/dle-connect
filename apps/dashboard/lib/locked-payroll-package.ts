import type { DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import { convertAmountText } from '@/lib/payroll-fx-display';
import { roundMoney, type FlexiblePayrollLineDraft } from '@/lib/payroll-package-lines';
import { resolvePayCurrency } from '@/lib/payroll-currency';

/**
 * Mrs Odulate (P0442) keeps the December 2025 package until the October 2026 salary update.
 * The naira column is that package, not a fresh Central Bank conversion.
 */
export type LockedPayrollLine = {
  code: string;
  name: string;
  usd: number;
  ngn: number;
};

export type LockedPayrollPackage = {
  employeeCode: string;
  /** First payroll period that no longer uses this package. */
  untilPeriod: string;
  grossUsd: number;
  grossNgn: number;
  lines: LockedPayrollLine[];
};

export const LOCKED_PAYROLL_NAIRA_CAPTION =
  'Naira amounts are the December 2025 figures for this package. They stay in use until the October 2026 salary update. Dollar amounts stay saved on the package.';

const ODULATE_UNTIL_OCTOBER_2026: LockedPayrollPackage = {
  employeeCode: 'P0442',
  untilPeriod: '2026-10',
  grossUsd: 4631.3,
  grossNgn: 6171216.9,
  lines: [
    { code: 'EXP_SMGT_BASIC', name: 'Basic', usd: 926.3, ngn: 1234243.4 },
    { code: 'EXP_SMNG_TRANSPORT', name: 'Transport', usd: 463.1, ngn: 617121.7 },
    { code: 'EXP_SMGT_HOUSING', name: 'Housing', usd: 694.7, ngn: 925682.5 },
    { code: 'EXP_SMGT_OTHER', name: 'Other allowance', usd: 2547.2, ngn: 3394169.3 },
  ],
};

const LOCKED_PACKAGES = [ODULATE_UNTIL_OCTOBER_2026];

const periodKey = (period?: string | null) => {
  const match = String(period || '').match(/\d{4}-\d{2}/);
  return match ? match[0] : '';
};

export const lockedPayrollPackageApplies = (pack: LockedPayrollPackage, period?: string | null) => {
  const key = periodKey(period);
  if (!key) return true;
  return key < pack.untilPeriod;
};

const identityKeys = (employee: {
  employeeCode?: string | null;
  employeeId?: string | null;
  sourceEmployeeId?: string | null;
  fullName?: string | null;
}) => {
  const codes = [employee.employeeCode, employee.employeeId, employee.sourceEmployeeId]
    .map((value) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, ''))
    .filter(Boolean);
  const name = String(employee.fullName || '').toUpperCase();
  return { codes, name };
};

const packageMatchesEmployee = (
  pack: LockedPayrollPackage,
  employee: {
    employeeCode?: string | null;
    employeeId?: string | null;
    sourceEmployeeId?: string | null;
    fullName?: string | null;
  },
) => {
  const { codes, name } = identityKeys(employee);
  const target = pack.employeeCode.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const shortCode = target.replace(/^P/, '');
  if (codes.some((code) => code === target || code === shortCode)) return true;
  return name.includes('ODULATE') && codes.every((code) => code.length > 12 || code === target || code === shortCode);
};

export const lockedPayrollPackageFor = (
  employee: {
    employeeCode?: string | null;
    employeeId?: string | null;
    sourceEmployeeId?: string | null;
    fullName?: string | null;
  },
  period?: string | null,
) => LOCKED_PACKAGES.find((pack) => packageMatchesEmployee(pack, employee) && lockedPayrollPackageApplies(pack, period)) || null;

const nearly = (left: number, right: number) => Math.abs(left - right) < 0.02;

const lineKind = (code: string, name: string) => {
  const blob = `${code} ${name}`.toUpperCase();
  if (/OTHER/.test(blob) && /ALLOW/.test(blob)) return 'other';
  if (/TRANSPORT|\bTRANS\b|_TRANS/.test(blob)) return 'transport';
  if (/HOUS/.test(blob)) return 'housing';
  if (/BASIC/.test(blob)) return 'basic';
  return '';
};

export const matchLockedPayrollLine = (
  line: { code?: string | null; name?: string | null },
  pack: LockedPayrollPackage,
) => {
  const kind = lineKind(String(line.code || ''), String(line.name || ''));
  if (!kind) return null;
  return pack.lines.find((item) => lineKind(item.code, item.name) === kind) || null;
};

export const lockedBasicLine = (pack: LockedPayrollPackage) =>
  pack.lines.find((line) => lineKind(line.code, line.name) === 'basic') || pack.lines[0];

export const lockedAllowancesUsd = (pack: LockedPayrollPackage) =>
  roundMoney(pack.grossUsd - lockedBasicLine(pack).usd);

export const lockedAllowancesNgn = (pack: LockedPayrollPackage) => {
  const basic = lockedBasicLine(pack);
  return Math.round((pack.grossNgn - basic.ngn) * 10) / 10;
};

/** Naira figure for a saved dollar amount on this package. Null when the amount is not part of it. */
export const lockedNgnForUsdAmount = (pack: LockedPayrollPackage, usd: number) => {
  const amount = Number(usd);
  if (!Number.isFinite(amount)) return null;
  if (nearly(amount, pack.grossUsd)) return pack.grossNgn;
  if (nearly(amount, roundMoney(pack.grossUsd * 12))) return Math.round(pack.grossNgn * 12 * 10) / 10;
  const line = pack.lines.find((item) => nearly(item.usd, amount));
  if (line) return line.ngn;
  if (nearly(amount, lockedAllowancesUsd(pack))) return lockedAllowancesNgn(pack);
  return null;
};

const lockedNgnEarningLines = (pack: LockedPayrollPackage) => {
  const byKind = {
    basic: { code: 'BASIC', name: 'BASIC SALARY' },
    transport: { code: 'SNMTRANSPTAX', name: 'TRANSPORT' },
    housing: { code: 'SNMHOUSINGTAX', name: 'HOUSING' },
    other: { code: 'SNMOTHALLTAX', name: 'OTHER ALLOWANCE' },
  } as const;
  return (Object.keys(byKind) as Array<keyof typeof byKind>).flatMap((kind) => {
    const line = pack.lines.find((item) => lineKind(item.code, item.name) === kind);
    if (!line) return [];
    const shape = byKind[kind];
    return [{
      code: shape.code,
      name: shape.name,
      amount: line.ngn,
      taxableAmount: line.ngn,
      sourceAmount: line.ngn,
      runFrequency: 'monthly' as const,
      includeInMonthlyPayroll: true,
    }];
  });
};

export const applyLockedPayrollPackage = <T extends DleEmployeeDirectoryRow>(employee: T, period?: string | null): T => {
  const pack = lockedPayrollPackageFor(employee, period);
  if (!pack) return employee;
  const basic = lockedBasicLine(pack);
  const hasNairaLeg = Boolean(employee.hasDualCurrencyPayroll) || (employee.sageLocalPayrollEarnings || []).length > 0;
  const nairaLines = lockedNgnEarningLines(pack);
  return {
    ...employee,
    payCurrency: employee.payCurrency || 'USD',
    periodSalary: pack.grossUsd,
    basicSalary: basic.usd,
    sagePayrollEarnings: pack.lines.map((line) => ({
      code: line.code,
      name: line.name,
      amount: line.usd,
      taxableAmount: line.usd,
      sourceAmount: line.usd,
      runFrequency: 'monthly' as const,
      includeInMonthlyPayroll: true,
    })) as T['sagePayrollEarnings'],
    ...(hasNairaLeg
      ? {
          hasDualCurrencyPayroll: true,
          localPayCurrency: 'NGN',
          localPayrollGroup: employee.localPayrollGroup || 'DLE',
          localPeriodSalary: pack.grossNgn,
          sageLocalPayrollEarnings: nairaLines as T['sageLocalPayrollEarnings'],
        }
      : {}),
  };
};

export const payrollLinesForLockedNgn = (
  lines: FlexiblePayrollLineDraft[],
  pack: LockedPayrollPackage,
  fxRate?: number | null,
): FlexiblePayrollLineDraft[] => lines.map((line) => {
  const match = matchLockedPayrollLine(line, pack);
  if (match) return { ...line, amount: String(match.ngn) };
  if (Number(fxRate) > 0) {
    return { ...line, amount: convertAmountText(line.amount, 'USD', 'NGN', Number(fxRate)) };
  }
  return line;
});

export const payrollLinesFromLockedNgn = (
  lines: FlexiblePayrollLineDraft[],
  pack: LockedPayrollPackage,
  fxRate?: number | null,
): FlexiblePayrollLineDraft[] => lines.map((line) => {
  const match = matchLockedPayrollLine(line, pack);
  const shown = Number(String(line.amount ?? '').replace(/,/g, ''));
  if (match && Number.isFinite(shown)) {
    if (Math.abs(shown - match.ngn) < 0.05) return { ...line, amount: String(match.usd) };
    return { ...line, amount: String(roundMoney(shown * match.usd / match.ngn)) };
  }
  if (Number(fxRate) > 0) {
    return { ...line, amount: convertAmountText(line.amount, 'NGN', 'USD', Number(fxRate)) };
  }
  return line;
});

type LockedPayrollRecord = {
  employeeCode?: string | null;
  employeeId?: string | null;
  sourceEmployeeId?: string | null;
  fullName?: string | null;
  payCurrency?: string | null;
  payrollGroup?: string | null;
  salaryGrade?: string | null;
  businessUnit?: string | null;
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

/** Keep the December package on the payroll register after salary-schedule overlays. */
export const applyLockedPayrollPackageToRecords = <T extends LockedPayrollRecord>(
  records: T[],
  period?: string | null,
): T[] => records.map((record) => {
  const pack = lockedPayrollPackageFor(record, period);
  if (!pack || record.isDailyRate) return record;
  if (resolvePayCurrency(record) !== 'USD') return record;
  const basic = lockedBasicLine(pack);
  const gross = pack.grossUsd;
  const deductions = roundMoney(Number(record.totalDeductions || 0));
  const employerOnTop = roundMoney(Math.max(0, Number(record.employerCost || 0) - Number(record.grossPay || 0)));
  return {
    ...record,
    basePay: basic.usd,
    allowances: lockedAllowancesUsd(pack),
    grossPay: gross,
    periodPackageGross: gross,
    taxablePay: gross,
    nonTaxablePay: 0,
    usdPackageGross: gross,
    netPay: roundMoney(Math.max(0, gross - deductions)),
    employerCost: roundMoney(gross + employerOnTop),
    deductionRatio: gross > 0 ? roundMoney((deductions / gross) * 100) : 0,
    lockedNgnGross: pack.grossNgn,
    earningLines: pack.lines.map((line) => ({
      code: line.code,
      name: line.name,
      amount: line.usd,
      taxable: true,
      percentOfGross: gross ? line.usd / gross : 0,
    })),
  } as T;
});
