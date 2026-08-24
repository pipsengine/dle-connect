import {
  buildStoredPayrollLinesFromDrafts,
  draftPayrollLineToStored,
  payrollLineMonthlyAmount,
  storedLinesToDraft,
  sumMonthlyPackageGross,
  type FlexiblePayrollLineDraft,
  type StoredPayrollPackageLine,
} from '@/lib/payroll-package-lines';
import type { DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import type { PayrollSetupDraft } from '@/app/(hris)/hris/employees/add-new-employee/PayrollSetupStep';

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
  deductionLines?: FlexiblePayrollLineDraft[];
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
};

export { buildStoredPayrollLinesFromDrafts };

export const earningLinesFromEmployeeRow = (row: DleEmployeeDirectoryRow): FlexiblePayrollLineDraft[] =>
  storedLinesToDraft((row.sagePayrollEarnings || []) as StoredPayrollPackageLine[]);

export const deductionLinesFromEmployeeRow = (row: DleEmployeeDirectoryRow): FlexiblePayrollLineDraft[] =>
  storedLinesToDraft((row.sagePayrollDeductions?.lines || []) as StoredPayrollPackageLine[]);

export const enrichPayrollSummaryFromRow = (summary: ProfilePayrollSummary, row: DleEmployeeDirectoryRow): ProfilePayrollSummary => {
  const earningLines = earningLinesFromEmployeeRow(row);
  const deductionLines = deductionLinesFromEmployeeRow(row);
  const storedEarnings = earningLines
    .map((line) => draftPayrollLineToStored(line, true))
    .filter((line): line is StoredPayrollPackageLine => line !== null);
  const monthlyPackageGross = sumMonthlyPackageGross(storedEarnings);
  return {
    ...summary,
    earningLines,
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
    monthlyPackageGross: monthlyPackageGross || summary.monthlyPackageGross || null,
  };
};

export const profileSummaryToSetupDraft = (summary: ProfilePayrollSummary, employmentType = ''): PayrollSetupDraft => ({
  payrollGroup: summary.payrollGroup || '',
  salaryGrade: summary.salaryGrade || '',
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

export const setupDraftToProfileSummary = (draft: PayrollSetupDraft, previous: ProfilePayrollSummary): ProfilePayrollSummary => {
  const storedEarnings = buildStoredPayrollLinesFromDrafts(draft.earningLines, true);
  const storedDeductions = buildStoredPayrollLinesFromDrafts(draft.deductionLines, false);
  const monthlyPackageGross = sumMonthlyPackageGross(storedEarnings);
  const basicLine = storedEarnings.find((line) => /BASIC/i.test(line.code) || /BASIC/i.test(line.name));
  const basicSalary = basicLine ? payrollLineMonthlyAmount(basicLine) : (monthlyPackageGross > 0 ? monthlyPackageGross : previous.basicSalary);
  const allowances = monthlyPackageGross > 0 && basicSalary != null ? Math.max(0, monthlyPackageGross - basicSalary) : previous.allowances;
  const deductionsTotal = storedDeductions.reduce((sum, line) => sum + payrollLineMonthlyAmount(line), 0);
  const accountNumber = draft.accountNumber.trim() || previous.accountNumber || '';
  return {
    ...previous,
    payrollGroup: draft.payrollGroup.trim() || previous.payrollGroup,
    salaryGrade: draft.salaryGrade.trim() || previous.salaryGrade,
    basicSalary: basicSalary ?? null,
    allowances: allowances ?? null,
    deductions: deductionsTotal > 0 ? deductionsTotal : previous.deductions,
    bankName: draft.bankName.trim() || previous.bankName,
    accountNumber: accountNumber || null,
    accountNumberMasked: accountNumber ? `••••••${accountNumber.replace(/\D/g, '').slice(-4)}` : previous.accountNumberMasked,
    accountName: draft.accountName.trim() || previous.accountName || null,
    pensionProvider: draft.pensionProvider.trim() || previous.pensionProvider,
    pensionPin: draft.pensionPin.trim() || previous.pensionPin || null,
    taxId: draft.taxId.trim() || previous.taxId,
    earningLines: draft.earningLines,
    deductionLines: draft.deductionLines,
    nhfApplicable: draft.nhfApplicable,
    nhfNumber: draft.nhfNumber.trim() || previous.nhfNumber || null,
    benefitGroup: draft.benefitGroup.trim() || previous.benefitGroup || null,
    ratePerDay: Number(draft.ratePerDay || draft.dailyRate) || previous.ratePerDay || null,
    ratePerHour: Number(draft.ratePerHour) || previous.ratePerHour || null,
    hoursPerDay: Number(draft.hoursPerDay) || previous.hoursPerDay || null,
    setupAssignedToPayroll: draft.setupAssignedToPayroll,
    monthlyPackageGross: monthlyPackageGross || null,
    additionalEmployeePensionMonthly: Number(draft.additionalEmployeePensionMonthly) || previous.additionalEmployeePensionMonthly || null,
    annualRentRelief: Number(draft.annualRentRelief) || previous.annualRentRelief || null,
  };
};
