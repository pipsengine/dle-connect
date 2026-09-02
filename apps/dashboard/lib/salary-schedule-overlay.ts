import type { PayrollCalculationRecord } from '@/lib/payroll-calculation-service';
import { canonicalContractEmployeeCode } from '@/lib/dayrate-schedule-xlsx';
import { readAppliedDayrateScheduleOverride } from '@/lib/dayrate-schedule-override-read';
import { resolvePayCurrency } from '@/lib/payroll-currency';
import { normalizePayrollCompany, withPayrollCompany, type PayrollCompany } from '@/lib/payroll-schedule-scope';
import { salaryScheduleEmployeeKeys, salaryScheduleNgnKpiFromCostSummary, type SalaryScheduleRow } from '@/lib/salary-schedule-xlsx';
import {
  excelRowCurrency,
  readAppliedSalaryScheduleOverride,
  type SalaryScheduleUploadRecord,
} from '@/lib/salary-schedule-upload-sql';

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
    taxable: !/^MEAL$/i.test(line.code),
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
  for (const row of applied.parsed.rows) {
    if (salaryRowOnDayrateSchedule(row, dayrateCodes)) continue;
    // HR Summary counts DLE Staff / DLE Contract from Company (HA). A blank COMPANY
    // cell is not DLENG — do not default those rows onto DLE Salaries (P0440 net 0).
    if (row.kind !== 'usd' && !normalizePayrollCompany(row.company)) continue;
    const currency = excelRowCurrency(row);
    const match = salaryScheduleEmployeeKeys(row.employeeCode).map((key) => byCurrency[currency].get(key)).find(Boolean) || null;
    overlaid.push(match ? overlaySalaryRow(match, row) : emptyRecordFromExcel(row, period));
  }

  return [...dailyRate, ...overlaid];
};

export const ngnSalaryScheduleKpi = (period: string, company: PayrollCompany) => {
  const parsed = readAppliedSalaryScheduleOverride(period)?.parsed;
  return salaryScheduleNgnKpiFromCostSummary(parsed?.costSummary, period, company, parsed?.pivotTotals);
};
