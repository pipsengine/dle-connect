import type { PayrollLineFrequency } from '@/lib/payroll-package-lines';

export type SagePayrollLineItem = {
  code: string;
  name: string;
  amount: number;
  taxableAmount?: number | null;
  ytdTotal?: number | null;
  runFrequency?: PayrollLineFrequency;
  sourceAmount?: number;
  includeInMonthlyPayroll?: boolean;
};

export const parseSagePayrollLineItems = (raw: unknown): SagePayrollLineItem[] => {
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((line) => ({
        code: String(line?.code || '').trim(),
        name: String(line?.name || line?.code || '').trim(),
        amount: Math.round((Number(line?.amount || 0)) * 100) / 100,
        taxableAmount: line?.taxableAmount === null || line?.taxableAmount === undefined
          ? null
          : Math.round(Number(line.taxableAmount) * 100) / 100,
        ytdTotal: line?.ytdTotal === null || line?.ytdTotal === undefined
          ? null
          : Math.round(Number(line.ytdTotal) * 100) / 100,
        runFrequency: ['weekly', 'monthly', 'one-off'].includes(String(line?.runFrequency || ''))
          ? (String(line.runFrequency) as PayrollLineFrequency)
          : undefined,
        sourceAmount: line?.sourceAmount === null || line?.sourceAmount === undefined
          ? undefined
          : Math.round(Number(line.sourceAmount) * 100) / 100,
        includeInMonthlyPayroll: typeof line?.includeInMonthlyPayroll === 'boolean'
          ? line.includeInMonthlyPayroll
          : undefined,
      }))
      .filter((line) => line.code && Number.isFinite(line.amount) && line.amount !== 0);
  } catch {
    return [];
  }
};

const lineAmount = (lines: SagePayrollLineItem[], pattern: RegExp) =>
  lines.find((line) => pattern.test(String(line.code || '')))?.amount || 0;

export const buildSagePayrollDeductionsFromLines = (lines: SagePayrollLineItem[]) => {
  const paye = lineAmount(lines, /^PAYE$/i);
  const pensionEmployee = lines
    .filter((line) => /PENSION/i.test(line.code) && !/ER$/i.test(line.code))
    .reduce((sum, line) => sum + line.amount, 0);
  const nhf = lineAmount(lines, /^NHF$/i);
  const other = lines
    .filter((line) => !/^(PAYE|PENSION|NHF)$/i.test(line.code) && !/PENSION/i.test(line.code))
    .reduce((sum, line) => sum + line.amount, 0);
  const totalDeductions = Math.round(lines.reduce((sum, line) => sum + line.amount, 0) * 100) / 100;
  return {
    paye: paye || null,
    pensionEmployee: pensionEmployee || null,
    nhf: nhf || null,
    other: other || null,
    totalDeductions: totalDeductions || null,
    lines,
  };
};

export const buildSagePayrollContributionsFromLines = (lines: SagePayrollLineItem[]) => ({
  pensionEmployer: lineAmount(lines, /^PENSION_ER$/i) || null,
  nsitf: lineAmount(lines, /^NSITF$/i) || null,
  itf: lineAmount(lines, /^ITF/i) || null,
  lines,
});

export const mergeSagePayrollLineItems = (...groups: SagePayrollLineItem[][]) => {
  const byCode = new Map<string, SagePayrollLineItem>();
  for (const group of groups) {
    for (const line of group) {
      if (!line.code) continue;
      byCode.set(line.code.toUpperCase(), line);
    }
  }
  return [...byCode.values()];
};

const canonicalPayrollLineCode = (code: string) =>
  String(code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Lines saved from Edit Profile / Add Employee payroll editors carry frequency metadata. */
export const isHrisConfiguredPayrollLine = (line: SagePayrollLineItem): boolean =>
  line.runFrequency !== undefined
  || line.sourceAmount !== undefined
  || line.includeInMonthlyPayroll !== undefined;

/**
 * Keep Sage payslip structural lines as the base package, but append HRIS profile supplements
 * (overtime, weekly transport, one-offs, etc.) that Sage live payslips do not carry.
 */
export const mergeSageLiveAndHrisProfileEarningLines = (
  sageLiveLines: SagePayrollLineItem[],
  hrisProfileLines: SagePayrollLineItem[],
): SagePayrollLineItem[] => {
  if (!hrisProfileLines.length) return sageLiveLines;
  if (!sageLiveLines.length) return hrisProfileLines;

  const liveCodes = new Set(sageLiveLines.map((line) => canonicalPayrollLineCode(line.code)));
  const supplements = hrisProfileLines.filter((line) => {
    if (!line.code || !Number.isFinite(line.amount) || line.amount === 0) return false;
    const code = canonicalPayrollLineCode(line.code);
    if (isHrisConfiguredPayrollLine(line)) {
      if (line.runFrequency === 'one-off') return true;
      return !liveCodes.has(code);
    }
    return !liveCodes.has(code);
  });

  return supplements.length ? [...sageLiveLines, ...supplements] : sageLiveLines;
};
