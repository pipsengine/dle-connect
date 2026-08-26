import type { PayrollSetupDraft } from '@/app/(hris)/hris/employees/add-new-employee/PayrollSetupStep';
import { resolvePayCurrency } from '@/lib/payroll-currency';
import {
  draftPayrollLineToStored,
  newDraftPayrollLineId,
  roundMoney,
  sumMonthlyPackageGross,
  type FlexiblePayrollLineDraft,
  type StoredPayrollPackageLine,
} from '@/lib/payroll-package-lines';

export type PayrollEmploymentContext = {
  employmentType?: string;
  contractStartDate?: string;
  contractEndDate?: string;
};

export const contractMonthsInclusive = (start?: string, end?: string): number => {
  if (!start || !end || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return 1;
  const s = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return 1;
  const months = (e.getUTCFullYear() - s.getUTCFullYear()) * 12 + (e.getUTCMonth() - s.getUTCMonth()) + 1;
  return Math.max(1, months);
};

export const monthlyLumpsumFromContract = (contractAmount: number, start?: string, end?: string) =>
  contractAmount > 0 ? roundMoney(contractAmount / contractMonthsInclusive(start, end)) : 0;

export const isLumpsumBaseDraftLine = (line: FlexiblePayrollLineDraft) =>
  /^(LUMPSUMTAX|BASIC1_LUMPSUM)$/i.test(String(line.code || '').trim())
  || /LUMPSUM ALLOWANCE/i.test(String(line.name || ''));

export const defaultLumpsumEarningLine = (monthlyAmount: number): FlexiblePayrollLineDraft => ({
  id: newDraftPayrollLineId(),
  code: 'LUMPSUMTAX',
  name: 'LUMPSUM ALLOWANCE',
  amount: String(monthlyAmount),
  taxable: true,
  frequency: 'monthly',
});

export const resolvePayrollDraftCurrency = (payroll: Pick<PayrollSetupDraft, 'payCurrency' | 'payrollGroup' | 'salaryGrade'>) =>
  resolvePayCurrency({
    payCurrency: payroll.payCurrency,
    payrollGroup: payroll.payrollGroup,
    salaryGrade: payroll.salaryGrade,
  });

const storedMonthlyGross = (lines: FlexiblePayrollLineDraft[]) =>
  sumMonthlyPackageGross(
    lines
      .map((line) => draftPayrollLineToStored(line, true))
      .filter(Boolean) as StoredPayrollPackageLine[],
  );

/** Strip display decorations like "DLE / NGN / MAIN" back to the payroll group code. */
export const cleanPayrollGroupValue = (value: unknown) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.split('/')[0].trim();
};

/** Align period salary, annual salary, and lumpsum earning lines before create or profile save. */
export const normalizePayrollDraftBeforeSave = (
  payroll: PayrollSetupDraft,
  employment: PayrollEmploymentContext = {},
): PayrollSetupDraft => {
  const payCurrency = resolvePayrollDraftCurrency(payroll);
  let next: PayrollSetupDraft = {
    ...payroll,
    payCurrency,
    payrollGroup: cleanPayrollGroupValue(payroll.payrollGroup) || payroll.payrollGroup,
  };
  let monthlyFromLines = storedMonthlyGross(next.earningLines || []);
  let periodSalary = Number(next.periodSalary || 0);
  const employmentType = String(employment.employmentType || '').trim();
  const isLumpsum = /lumpsum|lump\s*sum/i.test(employmentType);

  if (isLumpsum) {
    const contractTotal = Number(next.contractAmount || 0);
    if (!periodSalary && contractTotal > 0) {
      periodSalary = monthlyLumpsumFromContract(contractTotal, employment.contractStartDate, employment.contractEndDate);
    }
    if (periodSalary > 0) {
      next.periodSalary = String(periodSalary);
      if (!Number(next.basicSalary)) next.basicSalary = String(periodSalary);
      if (!Number(next.annualSalary)) next.annualSalary = String(roundMoney(periodSalary * 12));
      if (monthlyFromLines <= 0 && !next.earningLines.some(isLumpsumBaseDraftLine)) {
        next.earningLines = [...next.earningLines, defaultLumpsumEarningLine(periodSalary)];
        monthlyFromLines = periodSalary;
      } else if (next.earningLines.some(isLumpsumBaseDraftLine)) {
        next.earningLines = next.earningLines.map((line) =>
          isLumpsumBaseDraftLine(line) ? { ...line, amount: String(periodSalary) } : line,
        );
        monthlyFromLines = Math.max(monthlyFromLines, periodSalary);
      }
    }
  } else if (monthlyFromLines > 0) {
    if (!periodSalary) next.periodSalary = String(monthlyFromLines);
    if (!Number(next.annualSalary)) next.annualSalary = String(roundMoney(monthlyFromLines * 12));
    const basicLine = (next.earningLines || [])
      .map((line) => draftPayrollLineToStored(line, true))
      .find((line) => line && (/BASIC/i.test(line.code) || /BASIC/i.test(line.name)));
    if (basicLine && !Number(next.basicSalary)) next.basicSalary = String(basicLine.amount);
  } else if (periodSalary > 0) {
    if (!Number(next.basicSalary)) next.basicSalary = String(periodSalary);
    if (!Number(next.annualSalary)) next.annualSalary = String(roundMoney(periodSalary * 12));
  }

  return next;
};
