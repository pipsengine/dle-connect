import {
  buildStoredPayrollLinesFromDrafts,
  draftPayrollLineToStored,
  effectiveHrisPayrollLines,
  isLegacySupplementLine,
  leftoverStoredPeriodOnlyLines,
  payrollLineMonthlyAmount,
  storedLinesToDraft,
  sumMonthlyPackageGross,
  clientSafePayrollPeriod,
  type FlexiblePayrollLineDraft,
  type StoredPayrollPackageLine,
} from '@/lib/payroll-package-lines';
import { isHrisConfiguredPayrollLine } from '@/lib/sage-payroll-line-parser';
import { resolvePayCurrency } from '@/lib/payroll-currency';
import type { PayrollRunFx } from '@/lib/payroll-fx-display';
import type { DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import { isDailyRatePayrollEmployee, isPeriodVariableDayRateEarningLine } from '@/lib/payroll-employee-classification';
import type { PayrollSetupDraft } from '@/app/(hris)/hris/employees/add-new-employee/PayrollSetupStep';
import { normalizePayrollDraftBeforeSave, lumpsumBaseAmountFromDraftLines } from '@/lib/payroll-draft-normalize';
import {
  applyLockedPayrollPackage,
  lockedAllowancesUsd,
  lockedBasicLine,
  lockedPayrollPackageFor,
  type LockedPayrollPackage,
} from '@/lib/locked-payroll-package';

export type ProfilePayrollSummary = {
  payrollStatus: 'Verified' | 'Pending Validation' | 'Masked';
  salaryGrade: string;
  basicSalary: number | null;
  allowances: number | null;
  deductions: number | null;
  bankName: string | null;
  accountNumberMasked: string | null;
  accountNumber?: string | null;
  accountName?: string | null;
  pensionProvider: string | null;
  pensionPin?: string | null;
  taxId: string | null;
  payrollGroup: string | null;
  lastPayrollProcessed: string | null;
  earningLines?: FlexiblePayrollLineDraft[];
  leftoverPeriodEarningLines?: FlexiblePayrollLineDraft[];
  activePayrollPeriod?: string | null;
  legacyEarningLines?: FlexiblePayrollLineDraft[];
  deductionLines?: FlexiblePayrollLineDraft[];
  payrollRunPeriod?: string | null;
  payrollRunPeriodLabel?: string | null;
  payrollRunEarningLines?: FlexiblePayrollLineDraft[];
  payrollRunDeductionLines?: FlexiblePayrollLineDraft[];
  payrollRunGrossPay?: number | null;
  payrollRunNetPay?: number | null;
  payCurrency?: string | null;
  nhfApplicable?: boolean;
  nhfNumber?: string | null;
  benefitGroup?: string | null;
  ratePerDay?: number | null;
  ratePerHour?: number | null;
  hoursPerDay?: number | null;
  setupAssignedToPayroll?: boolean;
  monthlyPackageGross?: number | null;
  additionalEmployeePensionMonthly?: number | null;
  annualRentRelief?: number | null;
  /** USD→NGN rate for the active payroll run. Present on dollar packages so Naira view can convert earnings. */
  payrollFx?: PayrollRunFx | null;
  /** Fixed dollar and naira package, used instead of a fresh Central Bank conversion. */
  lockedPayrollPackage?: LockedPayrollPackage | null;
};

export { buildStoredPayrollLinesFromDrafts };

export const payrollDisplayCurrencyFromRow = (row: DleEmployeeDirectoryRow) =>
  resolvePayCurrency({
    payCurrency: row.payCurrency,
    payrollGroup: row.payrollGroup,
    salaryGrade: row.salaryGrade,
    jobGrade: row.jobGrade,
    businessUnit: row.businessUnit,
  });

export const hrisEarningLinesFromEmployeeRow = (
  row: DleEmployeeDirectoryRow,
  payrollPeriod?: string | null,
): FlexiblePayrollLineDraft[] => {
  const period = clientSafePayrollPeriod(payrollPeriod);
  const sourceLines = isDailyRatePayrollEmployee(row)
    ? (row.sagePayrollEarnings || []).filter((line) => isHrisConfiguredPayrollLine(line) || !isPeriodVariableDayRateEarningLine(line))
    : row.sagePayrollEarnings;
  const standing = effectiveHrisPayrollLines(sourceLines);
  const leftover = leftoverStoredPeriodOnlyLines(row.sagePayrollEarnings as StoredPayrollPackageLine[], period);
  return storedLinesToDraft([...standing, ...leftover]);
};

export const legacyEarningLinesFromEmployeeRow = (row: DleEmployeeDirectoryRow): FlexiblePayrollLineDraft[] => {
  if (isDailyRatePayrollEmployee(row)) return [];
  const all = (row.sagePayrollEarnings || []) as StoredPayrollPackageLine[];
  const legacy = all.filter((line) => !isHrisConfiguredPayrollLine(line) && !isLegacySupplementLine(line));
  return storedLinesToDraft(legacy);
};

const draftLineFromRunItem = (
  line: { code?: unknown; name?: unknown; label?: unknown; amount?: unknown; taxable?: unknown },
  index: number,
  prefix: string,
): FlexiblePayrollLineDraft | null => {
  const amount = Number(line.amount || 0);
  if (!Number.isFinite(amount) || amount === 0) return null;
  const code = String(line.code || '').trim() || `${prefix}${index + 1}`;
  const name = String(line.name || line.label || line.code || '').trim() || code;
  return {
    id: `run-${prefix}-${index}-${code}`,
    code,
    name,
    amount: String(amount),
    taxable: line.taxable !== false && Number(line.taxable ?? amount) !== 0,
    frequency: 'one-off',
  };
};

export type LatestPayrollRunProfileSlice = {
  period: string;
  periodLabel: string;
  processedAt?: string | null;
  grossPay?: number | null;
  netPay?: number | null;
  earningLines?: Array<{ code?: unknown; name?: unknown; amount?: unknown; taxable?: unknown }>;
  deductionLines?: Array<{ code?: unknown; label?: unknown; name?: unknown; amount?: unknown }>;
};

export const applyLatestPayrollRunToSummary = (
  summary: ProfilePayrollSummary,
  run: LatestPayrollRunProfileSlice,
): ProfilePayrollSummary => {
  const payrollRunEarningLines = (run.earningLines || [])
    .map((line, index) => draftLineFromRunItem(line, index, 'earn'))
    .filter((line): line is FlexiblePayrollLineDraft => Boolean(line));
  const payrollRunDeductionLines = (run.deductionLines || [])
    .map((line, index) => draftLineFromRunItem(line, index, 'ded'))
    .filter((line): line is FlexiblePayrollLineDraft => Boolean(line));
  return {
    ...summary,
    lastPayrollProcessed: run.processedAt || summary.lastPayrollProcessed,
    payrollRunPeriod: run.period,
    payrollRunPeriodLabel: run.periodLabel,
    payrollRunEarningLines: payrollRunEarningLines.length ? payrollRunEarningLines : undefined,
    payrollRunDeductionLines: payrollRunDeductionLines.length ? payrollRunDeductionLines : undefined,
    payrollRunGrossPay: Number(run.grossPay || 0) > 0 ? Number(run.grossPay) : null,
    payrollRunNetPay: Number(run.netPay || 0) > 0 ? Number(run.netPay) : null,
  };
};

export const earningLinesFromEmployeeRow = hrisEarningLinesFromEmployeeRow;

export const deductionLinesFromEmployeeRow = (row: DleEmployeeDirectoryRow): FlexiblePayrollLineDraft[] =>
  storedLinesToDraft((row.sagePayrollDeductions?.lines || []) as StoredPayrollPackageLine[]);

export const enrichPayrollSummaryFromRow = (
  summary: ProfilePayrollSummary,
  row: DleEmployeeDirectoryRow,
  payrollPeriod?: string | null,
): ProfilePayrollSummary => {
  const period = clientSafePayrollPeriod(payrollPeriod);
  const lockedPayrollPackage = lockedPayrollPackageFor(row, period);
  const sourceRow = lockedPayrollPackage ? applyLockedPayrollPackage(row, period) : row;
  const earningLines = hrisEarningLinesFromEmployeeRow(sourceRow, period);
  const leftoverPeriodEarningLines = leftoverStoredPeriodOnlyLines(
    sourceRow.sagePayrollEarnings as StoredPayrollPackageLine[],
    period,
  );
  const legacyEarningLines = legacyEarningLinesFromEmployeeRow(sourceRow);
  const deductionLines = deductionLinesFromEmployeeRow(row);
  const storedEarnings = buildStoredPayrollLinesFromDrafts(earningLines, true);
  const monthlyFromLines = sumMonthlyPackageGross(storedEarnings);
  const isLumpsum = /lumpsum|lump\s*sum/i.test(String(row.employmentType || ''))
    || /^L\d+/i.test(String(row.employeeCode || ''));
  const lumpsumBase = lumpsumBaseAmountFromDraftLines(earningLines);
  const dailyRate = isDailyRatePayrollEmployee(row);
  const monthlyPackageGross = dailyRate
    ? null
    : isLumpsum
      ? (lumpsumBase > 0
        ? lumpsumBase
        : (row.periodSalary ?? row.basicSalary ?? summary.monthlyPackageGross ?? summary.basicSalary ?? null))
      : (monthlyFromLines > 0
        ? monthlyFromLines
        : (row.periodSalary ?? row.basicSalary ?? summary.monthlyPackageGross ?? summary.basicSalary ?? null));
  const basicSalary = dailyRate
    ? null
    : lockedPayrollPackage
      ? lockedBasicLine(lockedPayrollPackage).usd
      : (isLumpsum && monthlyPackageGross != null ? monthlyPackageGross : summary.basicSalary);
  const allowances = dailyRate
    ? null
    : lockedPayrollPackage
      ? lockedAllowancesUsd(lockedPayrollPackage)
      : summary.allowances;
  return {
    ...summary,
    earningLines,
    leftoverPeriodEarningLines: leftoverPeriodEarningLines.length
      ? storedLinesToDraft(leftoverPeriodEarningLines as StoredPayrollPackageLine[])
      : undefined,
    activePayrollPeriod: period,
    legacyEarningLines: legacyEarningLines.length ? legacyEarningLines : undefined,
    basicSalary,
    allowances,
    payCurrency: payrollDisplayCurrencyFromRow(row),
    deductionLines,
    accountNumber: row.accountNo || summary.accountNumber || null,
    accountName: row.accountName || summary.accountName || null,
    pensionPin: row.pensionPin || summary.pensionPin || null,
    nhfNumber: summary.nhfNumber || null,
    benefitGroup: row.benefitGroup || summary.benefitGroup || null,
    ratePerDay: row.ratePerDay ?? summary.ratePerDay ?? null,
    ratePerHour: row.ratePerHour ?? summary.ratePerHour ?? null,
    hoursPerDay: row.hoursPerDay ?? summary.hoursPerDay ?? null,
    setupAssignedToPayroll: row.setupAssignedToPayroll ?? summary.setupAssignedToPayroll ?? true,
    monthlyPackageGross: lockedPayrollPackage ? lockedPayrollPackage.grossUsd : (monthlyPackageGross ?? null),
    lockedPayrollPackage,
  };
};

export const profileSummaryToSetupDraft = (summary: ProfilePayrollSummary, employmentType = ''): PayrollSetupDraft => ({
  payrollGroup: summary.payrollGroup || '',
  salaryGrade: summary.salaryGrade || '',
  payCurrency: summary.payCurrency || 'NGN',
  basicSalary: summary.basicSalary != null ? String(summary.basicSalary) : '',
  periodSalary: summary.monthlyPackageGross != null ? String(summary.monthlyPackageGross) : summary.basicSalary != null ? String(summary.basicSalary) : '',
  annualSalary: summary.monthlyPackageGross != null ? String(Number(summary.monthlyPackageGross) * 12) : '',
  dailyRate: summary.ratePerDay != null ? String(summary.ratePerDay) : '',
  ratePerDay: summary.ratePerDay != null ? String(summary.ratePerDay) : '',
  ratePerHour: summary.ratePerHour != null ? String(summary.ratePerHour) : '',
  hoursPerDay: summary.hoursPerDay != null ? String(summary.hoursPerDay) : '8',
  additionalEmployeePensionMonthly: summary.additionalEmployeePensionMonthly != null ? String(summary.additionalEmployeePensionMonthly) : '',
  annualRentRelief: summary.annualRentRelief != null ? String(summary.annualRentRelief) : '',
  paymentRun: 'MAIN',
  paymentType: 'Bank Transfer',
  allowancesTemplate: '',
  deductionTemplate: '',
  bankName: summary.bankName || '',
  accountNumber: summary.accountNumber || '',
  accountName: summary.accountName || '',
  pensionProvider: summary.pensionProvider || '',
  pensionPin: summary.pensionPin || '',
  taxId: summary.taxId || '',
  nhfApplicable: summary.nhfApplicable !== false,
  nhfNumber: summary.nhfNumber || '',
  healthInsurancePlan: '',
  benefitGroup: summary.benefitGroup || '',
  setupAssignedToPayroll: summary.setupAssignedToPayroll !== false,
  earningLines: summary.earningLines || [],
  deductionLines: summary.deductionLines || [],
  contractAmount: '',
});

export const setupDraftToProfileSummary = (
  draft: PayrollSetupDraft,
  previous: ProfilePayrollSummary,
  employmentType = '',
): ProfilePayrollSummary => {
  const normalized = normalizePayrollDraftBeforeSave(draft, { employmentType });
  const storedEarnings = buildStoredPayrollLinesFromDrafts(normalized.earningLines, true);
  const storedDeductions = buildStoredPayrollLinesFromDrafts(normalized.deductionLines, false);
  const monthlyFromLines = sumMonthlyPackageGross(storedEarnings);
  const isLumpsum = /lumpsum|lump\s*sum/i.test(employmentType);
  const lumpsumBase = lumpsumBaseAmountFromDraftLines(normalized.earningLines);
  // Lumpsum: package gross is the base LUMPSUM line only — OT/supplements stay on earning lines.
  const monthlyPackageGross = isLumpsum
    ? (lumpsumBase > 0
      ? lumpsumBase
      : (Number(normalized.periodSalary) || previous.monthlyPackageGross || null))
    : (monthlyFromLines > 0
      ? monthlyFromLines
      : (Number(normalized.periodSalary) || previous.monthlyPackageGross || null));
  const basicLine = storedEarnings.find((line) => /BASIC/i.test(line.code) || /BASIC/i.test(line.name));
  const basicSalary = isLumpsum
    ? (monthlyPackageGross != null && monthlyPackageGross > 0 ? monthlyPackageGross : previous.basicSalary)
    : (basicLine
      ? payrollLineMonthlyAmount(basicLine)
      : (monthlyPackageGross != null && monthlyPackageGross > 0 ? monthlyPackageGross : previous.basicSalary));
  const allowances = (monthlyPackageGross ?? 0) > 0 && basicSalary != null ? Math.max(0, (monthlyPackageGross ?? 0) - basicSalary) : previous.allowances;
  const deductionsTotal = storedDeductions.reduce((sum, line) => sum + payrollLineMonthlyAmount(line), 0);
  const accountNumber = normalized.accountNumber.trim() || previous.accountNumber || '';
  return {
    ...previous,
    payrollGroup: normalized.payrollGroup.trim() || previous.payrollGroup,
    salaryGrade: normalized.salaryGrade.trim() || previous.salaryGrade,
    payCurrency: normalized.payCurrency || previous.payCurrency || 'NGN',
    basicSalary: basicSalary ?? null,
    allowances: allowances ?? null,
    deductions: deductionsTotal > 0 ? deductionsTotal : previous.deductions,
    bankName: normalized.bankName.trim() || previous.bankName,
    accountNumber: accountNumber || null,
    accountNumberMasked: accountNumber ? `••••••${accountNumber.replace(/\D/g, '').slice(-4)}` : previous.accountNumberMasked,
    accountName: normalized.accountName.trim() || previous.accountName || null,
    pensionProvider: normalized.pensionProvider.trim() || previous.pensionProvider,
    pensionPin: normalized.pensionPin.trim() || previous.pensionPin || null,
    taxId: normalized.taxId.trim() || previous.taxId,
    earningLines: normalized.earningLines,
    deductionLines: normalized.deductionLines,
    nhfApplicable: normalized.nhfApplicable,
    nhfNumber: normalized.nhfNumber.trim() || previous.nhfNumber || null,
    benefitGroup: normalized.benefitGroup.trim() || previous.benefitGroup || null,
    ratePerDay: Number(normalized.ratePerDay || normalized.dailyRate) || previous.ratePerDay || null,
    ratePerHour: Number(normalized.ratePerHour) || previous.ratePerHour || null,
    hoursPerDay: Number(normalized.hoursPerDay) || previous.hoursPerDay || null,
    setupAssignedToPayroll: normalized.setupAssignedToPayroll,
    monthlyPackageGross: monthlyPackageGross ?? null,
    additionalEmployeePensionMonthly: Number(normalized.additionalEmployeePensionMonthly) || previous.additionalEmployeePensionMonthly || null,
    annualRentRelief: Number(normalized.annualRentRelief) || previous.annualRentRelief || null,
  };
};
