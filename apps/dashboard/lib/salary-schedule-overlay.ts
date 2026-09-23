import type { PayrollCalculationRecord } from '@/lib/payroll-calculation-service';
import { isDleUsdExpatriateEmployee, isDleUsdMdEmployee, isDleUsdPayrollEmployee } from '@/lib/payroll-bank-schedule-packs';
import { canonicalContractEmployeeCode } from '@/lib/dayrate-schedule-xlsx';
import { readAppliedDayrateScheduleOverride } from '@/lib/dayrate-schedule-override-read';
import { resolvePayCurrency } from '@/lib/payroll-currency';
import { normalizePayrollCompany, withPayrollCompany, type PayrollCompany } from '@/lib/payroll-schedule-scope';
import {
  salaryScheduleCostSummaryForPeriod,
  salaryScheduleEmployeeKeys,
  salaryScheduleNgnKpiFromCostSummary,
  type SalaryScheduleRow,
} from '@/lib/salary-schedule-xlsx';
import {
  excelRowCurrency,
  readAppliedSalaryScheduleOverride,
  type SalaryScheduleUploadRecord,
} from '@/lib/salary-schedule-upload-sql';
import { previousPayrollPeriod } from '@/lib/payroll-periods';
import { payrollExcelAmountOverlayApplies } from '@/lib/payroll-source-of-truth';

const roundMoney = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
const compact = (value: unknown) => String(value || '').trim();

const recordKeys = (record: Pick<PayrollCalculationRecord, 'employeeCode' | 'employeeId' | 'fullName'>) =>
  salaryScheduleEmployeeKeys(record.employeeCode || record.employeeId || '').concat(
    compact(record.fullName).toUpperCase(),
  ).filter(Boolean);

/** USD REPORT stays on DLE Salaries. NGN rows follow the Excel COMPANY column (DLENG / DLPCG). */
export const payrollCompanyFromSalaryScheduleRow = (row: Pick<SalaryScheduleRow, 'company' | 'kind'>): PayrollCompany => {
  if (row.kind === 'usd') return 'DLE';
  return normalizePayrollCompany(row.company) || 'DLE';
};

const dayrateScheduleCodes = (period: string) => {
  const codes = new Set<string>();
  for (const row of readAppliedDayrateScheduleOverride(period)?.rows || []) {
    [row.employeeCode, canonicalContractEmployeeCode(row.employeeCode)]
      .map((value) => compact(value).toUpperCase())
      .filter(Boolean)
      .forEach((code) => codes.add(code));
  }
  return codes;
};

const salaryRowOnDayrateSchedule = (row: SalaryScheduleRow, dayrateCodes: Set<string>) =>
  salaryScheduleEmployeeKeys(row.employeeCode).some((key) => dayrateCodes.has(key.toUpperCase()));

const overlayRecord = (base: PayrollCalculationRecord, excel: SalaryScheduleRow): PayrollCalculationRecord => {
  const paye = roundMoney(excel.paye);
  const pension = roundMoney(excel.pension);
  const nhf = roundMoney(excel.nhf);
  const totalDeductions = roundMoney(excel.deductionTotal || excel.deductions.reduce((sum, line) => sum + line.amount, 0));
  const grossPay = roundMoney(excel.grossPay);
  const netPay = roundMoney(excel.netPay || (grossPay - totalDeductions));
  const basic = roundMoney(excel.earnings.find((line) => /BASIC|LUMPSUM/i.test(line.code))?.amount || excel.periodSalary || 0);
  const earningLines = excel.earnings.map((line) => ({
    code: line.code,
    name: line.name,
    amount: roundMoney(line.amount),
    taxable: true,
  }));
  const deductionLines = excel.deductions
    .map((line) => ({ code: line.code, label: line.name, amount: roundMoney(line.amount) }))
    .filter((line) => line.amount > 0);
  return {
    ...base,
    fullName: excel.employeeName || base.fullName,
    jobTitle: excel.jobTitle || base.jobTitle,
    department: excel.department || base.department,
    location: excel.location || base.location,
    payCurrency: excelRowCurrency(excel),
    payrollGroup: excelRowCurrency(excel) === 'USD' ? (base.payrollGroup || 'DLE_USD') : base.payrollGroup,
    basePay: basic,
    allowances: roundMoney(Math.max(0, grossPay - basic)),
    grossPay,
    periodPackageGross: roundMoney(excel.periodSalary || grossPay),
    taxablePay: grossPay,
    nonTaxablePay: 0,
    earningProfile: `${base.earningProfile || 'Salary'} (HR Salary Schedule)`,
    paye,
    pensionEmployee: pension,
    statutoryEmployee: nhf,
    loanRecovery: 0,
    otherDeductions: roundMoney(Math.max(0, totalDeductions - paye - pension - nhf)),
    totalDeductions,
    deductions: totalDeductions,
    pension,
    netPay,
    employerCost: roundMoney(grossPay + Number(base.pensionEmployer || 0) + Number(base.statutoryEmployer || 0)),
    deductionRatio: grossPay > 0 ? roundMoney((totalDeductions / grossPay) * 100) : 0,
    status: 'Ready',
    payrollStatus: 'Ready',
    issues: [],
    exceptions: [],
    exceptionCount: 0,
    riskSeverity: 'Low',
    earningLines,
    deductionLines,
  };
};

const overlaySalaryRow = (base: PayrollCalculationRecord, excel: SalaryScheduleRow): PayrollCalculationRecord =>
  withPayrollCompany(overlayRecord(base, excel), payrollCompanyFromSalaryScheduleRow(excel));

const emptyRecordFromExcel = (excel: SalaryScheduleRow, period: string): PayrollCalculationRecord => {
  const currency = excelRowCurrency(excel);
  const stub: PayrollCalculationRecord = {
    recordKey: `${period}-salary-schedule-${excel.employeeCode}-${currency}`,
    employeeId: excel.employeeCode,
    employeeCode: excel.employeeCode,
    fullName: excel.employeeName,
    department: excel.department,
    businessUnit: excel.company,
    location: excel.location,
    companyCode: payrollCompanyFromSalaryScheduleRow(excel),
    companyName: payrollCompanyFromSalaryScheduleRow(excel),
    jobTitle: excel.jobTitle,
    employmentType: excel.employmentType || (excel.kind === 'cont' ? 'Contract Lumpsum' : 'Permanent'),
    employmentStatus: 'Active',
    payrollGroup: currency === 'USD' ? 'DLE_USD' : payrollCompanyFromSalaryScheduleRow(excel),
    salaryGrade: excel.kind === 'cont' ? 'Lumpsum' : 'Unassigned',
    payCurrency: currency,
    paymentRun: 'Monthly',
    basePay: 0,
    allowances: 0,
    grossPay: 0,
    taxablePay: 0,
    nonTaxablePay: 0,
    earningProfile: 'HR Salary Schedule',
    earningProfileId: excel.kind === 'cont' ? 'contract-lumpsum' : 'fallback',
    paye: 0,
    pensionEmployee: 0,
    pensionEmployer: 0,
    statutoryEmployee: 0,
    statutoryEmployer: 0,
    loanRecovery: 0,
    otherDeductions: 0,
    totalDeductions: 0,
    netPay: 0,
    employerCost: 0,
    deductionRatio: 0,
    timesheetDaysWorked: null,
    timesheetBookedHours: null,
    sageActual: null,
    discrepancies: { status: 'Matched', grossVariance: 0, netVariance: 0, deductionVariance: 0 },
    status: 'Ready',
    readinessStatus: 'Ready',
    issues: [],
    payrollStatus: 'Ready',
    riskSeverity: 'Low',
    exceptionCount: 0,
    exceptions: [],
    deferredWarnings: [],
    deductions: 0,
    pension: 0,
    isDailyRate: false,
    ratePerDay: null,
    ratePerHour: null,
    hoursPerDay: null,
    setupAssignedToPayroll: true,
    nhfApplicable: excel.nhf > 0,
    salaryStructure: excel.kind === 'cont' ? 'Lumpsum' : 'Permanent',
    earningLines: [],
    annualBenefitLines: [],
    deductionLines: [],
  };
  return overlaySalaryRow(stub, excel);
};

export const applySalaryScheduleOverrideToRecords = (
  records: PayrollCalculationRecord[],
  period: string,
  schedule?: SalaryScheduleUploadRecord | null,
): PayrollCalculationRecord[] => {
  if (!payrollExcelAmountOverlayApplies(period)) return records;
  const applied = schedule || readAppliedSalaryScheduleOverride(period);
  if (!applied?.parsed?.rows?.length) return records;

  const dailyRate = records.filter((record) => record.isDailyRate);
  const salaried = records.filter((record) => !record.isDailyRate);

  const byCurrency = {
    NGN: new Map<string, PayrollCalculationRecord>(),
    USD: new Map<string, PayrollCalculationRecord>(),
  } as const;
  for (const record of salaried) {
    const currency = resolvePayCurrency(record) === 'USD' ? 'USD' : 'NGN';
    for (const key of recordKeys(record)) {
      if (!byCurrency[currency].has(key)) byCurrency[currency].set(key, record);
    }
  }

  const dayrateCodes = dayrateScheduleCodes(period);
  const overlaid: PayrollCalculationRecord[] = [];
  const companionExcel: SalaryScheduleRow[] = [];
  for (const row of applied.parsed.rows) {
    if (salaryRowOnDayrateSchedule(row, dayrateCodes)) continue;
    // MD / Expatriate naira stays on the USD row as companion pay. Overlay onto an
    // existing NGN person if they already sit in DLE Salaries — never insert them as
    // a new Permanent / Contract lumpsum employee.
    if (isSplitSheetNgnCompanion(row)) {
      companionExcel.push(row);
      const match = salaryScheduleEmployeeKeys(row.employeeCode).map((key) => byCurrency.NGN.get(key)).find(Boolean) || null;
      if (match) overlaid.push(overlaySalaryRow(match, row));
      continue;
    }
    // HR Summary counts DLE Staff / DLE Contract from Company (HA). A blank COMPANY
    // cell is not DLENG — do not default those rows onto DLE Salaries (P0440 net 0).
    if (row.kind !== 'usd' && !normalizePayrollCompany(row.company)) continue;
    const currency = excelRowCurrency(row);
    const match = salaryScheduleEmployeeKeys(row.employeeCode).map((key) => byCurrency[currency].get(key)).find(Boolean) || null;
    overlaid.push(match ? overlaySalaryRow(match, row) : emptyRecordFromExcel(row, period));
  }

  // USD REPORT only lists permanent senior staff. MD / Expatriate live on separate workbook
  // tabs (MD (2) = 40% NGN + 60% USD). Prefer those Excel rows; only fall back to HRIS USD
  // for people still missing after the upload overlay.
  const overlaidUsdKeys = new Set<string>();
  for (const record of overlaid) {
    if (!isDleUsdPayrollEmployee(record)) continue;
    for (const key of recordKeys(record)) overlaidUsdKeys.add(key);
  }
  const missingUsdFromHris = salaried.filter((record) => {
    if (!isDleUsdPayrollEmployee(record)) return false;
    return recordKeys(record).every((key) => !overlaidUsdKeys.has(key));
  });

  return [...dailyRate, ...attachCompanionNgnPay([...overlaid, ...missingUsdFromHris], companionExcel)];
};

const salaryRowHasPackageAmounts = (row: SalaryScheduleRow) =>
  Number(row.grossPay || 0) > 0
  || Number(row.periodSalary || 0) > 0
  || (row.earnings || []).some((line) => Number(line.amount || 0) > 0);

/**
 * From September 2026 the Excel workbook is not the live payroll authority, but Employee
 * Salary Setup still needs a package when HRIS period_salary / earning lines are empty
 * (typical for DLPC staff who only existed on the schedule). Fill those zeros from the
 * applied workbook for this month, then the previous month.
 */
export const applySalaryScheduleFallbackForMissingGross = (
  records: PayrollCalculationRecord[],
  period: string,
  schedule?: SalaryScheduleUploadRecord | null,
  priorSchedule?: SalaryScheduleUploadRecord | null,
): PayrollCalculationRecord[] => {
  if (payrollExcelAmountOverlayApplies(period)) return records;
  const current = schedule === undefined ? readAppliedSalaryScheduleOverride(period) : schedule;
  const prior = priorSchedule === undefined
    ? (previousPayrollPeriod(period) ? readAppliedSalaryScheduleOverride(previousPayrollPeriod(period)) : null)
    : priorSchedule;
  const rows = [...(current?.parsed?.rows || []), ...(prior?.parsed?.rows || [])];
  if (!rows.length) return records;

  const byCurrency = {
    NGN: new Map<string, SalaryScheduleRow>(),
    USD: new Map<string, SalaryScheduleRow>(),
  } as const;
  for (const row of rows) {
    if (!salaryRowHasPackageAmounts(row)) continue;
    if (row.kind !== 'usd' && !normalizePayrollCompany(row.company)) continue;
    const currency = excelRowCurrency(row);
    for (const key of salaryScheduleEmployeeKeys(row.employeeCode)) {
      if (!byCurrency[currency].has(key)) byCurrency[currency].set(key, row);
    }
  }

  return records.map((record) => {
    if (record.isDailyRate) return record;
    if (Number(record.grossPay || 0) > 0) return record;
    if ((record.earningLines || []).some((line) => Number(line.amount || 0) > 0)) return record;
    const currency = resolvePayCurrency(record) === 'USD' ? 'USD' : 'NGN';
    const excel = recordKeys(record).map((key) => byCurrency[currency].get(key)).find(Boolean);
    if (!excel) return record;
    return overlaySalaryRow(record, excel);
  });
};

const excelAsEmployee = (row: SalaryScheduleRow) => ({
  employeeCode: row.employeeCode,
  employeeId: row.employeeCode,
  fullName: row.employeeName,
  jobTitle: row.jobTitle,
  employmentType: row.employmentType,
  payrollGroup: row.contType,
});

const isSplitSheetNgnCompanion = (row: SalaryScheduleRow) => {
  if (excelRowCurrency(row) !== 'NGN') return false;
  const sheet = compact(row.sheet);
  const type = compact(row.contType);
  const employment = compact(row.employmentType);
  if (/MD NGN|EXPATRIATE NGN/i.test(type)) return true;
  if (/md\s*\(/i.test(sheet) || /^md\b/i.test(sheet)) return true;
  if (/expatriate/i.test(sheet)) return true;
  if (/Managing Director|Expatriate/i.test(employment) && /^(MD|EXPATRIATE)\b/i.test(sheet)) return true;
  return isDleUsdMdEmployee(excelAsEmployee(row)) || isDleUsdExpatriateEmployee(excelAsEmployee(row));
};

const companionFromExcel = (row: SalaryScheduleRow, usdRecord: PayrollCalculationRecord) => {
  const shareLabel = isDleUsdMdEmployee(usdRecord) || /MD NGN|40%/i.test(compact(row.contType))
    ? '40% NGN'
    : 'NGN package';
  const grossPay = roundMoney(Number(row.grossPay || 0));
  const totalDeductions = roundMoney(Number(row.deductionTotal || 0));
  const netPay = roundMoney(Number(row.netPay || (grossPay - totalDeductions)));
  return {
    grossPay,
    totalDeductions,
    netPay,
    employerCost: grossPay,
    shareLabel,
  };
};

export const attachCompanionNgnPay = (
  records: PayrollCalculationRecord[],
  excelCompanions: SalaryScheduleRow[] = [],
): PayrollCalculationRecord[] => {
  const excelByKey = new Map<string, SalaryScheduleRow>();
  for (const row of excelCompanions) {
    for (const key of salaryScheduleEmployeeKeys(row.employeeCode)) {
      if (!excelByKey.has(key)) excelByKey.set(key, row);
    }
    const name = compact(row.employeeName).toUpperCase();
    if (name && !excelByKey.has(name)) excelByKey.set(name, row);
  }
  const ngnByKey = new Map<string, PayrollCalculationRecord>();
  for (const record of records) {
    if (record.isDailyRate || isDleUsdPayrollEmployee(record)) continue;
    for (const key of recordKeys(record)) {
      if (!ngnByKey.has(key)) ngnByKey.set(key, record);
    }
  }
  return records.map((record) => {
    if (!isDleUsdPayrollEmployee(record)) return record;
    if (!isDleUsdMdEmployee(record) && !isDleUsdExpatriateEmployee(record)) {
      if (!record.companionNgnPay && !record.hasDualCurrencyPayroll) return record;
      return { ...record, companionNgnPay: undefined, hasDualCurrencyPayroll: false };
    }
    const keys = recordKeys(record);
    const excel = keys.map((key) => excelByKey.get(key)).find(Boolean)
      || excelCompanions.find((row) => (
        (isDleUsdMdEmployee(record) && isDleUsdMdEmployee(excelAsEmployee(row)))
        || (isDleUsdExpatriateEmployee(record) && isDleUsdExpatriateEmployee(excelAsEmployee(row)))
      ));
    if (excel) {
      return {
        ...record,
        hasDualCurrencyPayroll: true,
        companionNgnPay: companionFromExcel(excel, record),
      };
    }
    const companion = keys.map((key) => ngnByKey.get(key)).find(Boolean);
    if (!companion) return record;
    const shareLabel = isDleUsdMdEmployee(record) ? '40% NGN' : 'NGN package';
    return {
      ...record,
      hasDualCurrencyPayroll: true,
      companionNgnPay: {
        grossPay: roundMoney(Number(companion.grossPay || 0)),
        totalDeductions: roundMoney(Number(companion.totalDeductions || companion.deductions || 0)),
        netPay: roundMoney(Number(companion.netPay || 0)),
        employerCost: roundMoney(Number(companion.employerCost || 0)),
        shareLabel,
      },
    };
  });
};

/** Re-attach Excel NGN legs onto USD rows without changing locked USD amounts. */
export const applySalaryScheduleCompanionPay = (
  records: PayrollCalculationRecord[],
  period: string,
): PayrollCalculationRecord[] => {
  const applied = payrollExcelAmountOverlayApplies(period) ? readAppliedSalaryScheduleOverride(period) : null;
  const companions = (applied?.parsed?.rows || []).filter(isSplitSheetNgnCompanion);
  if (!companions.length && !records.some((record) => isDleUsdPayrollEmployee(record))) return records;
  return attachCompanionNgnPay(records, companions);
};

export const ngnSalaryScheduleKpi = (period: string, company: PayrollCompany) => {
  const parsed = readAppliedSalaryScheduleOverride(period)?.parsed;
  return salaryScheduleNgnKpiFromCostSummary(parsed?.costSummary, period, company, parsed?.pivotTotals);
};

export const ngnSalaryScheduleCostSummary = (period: string) => {
  const parsed = readAppliedSalaryScheduleOverride(period)?.parsed;
  return salaryScheduleCostSummaryForPeriod(parsed?.costSummary, period);
};
