import type { PayrollCalculationRecord } from '@/lib/payroll-calculation-service';
import { resolvePayCurrency } from '@/lib/payroll-currency';
import { salaryScheduleEmployeeKeys, type SalaryScheduleRow } from '@/lib/salary-schedule-xlsx';
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
    jobTitle: excel.jobTitle,
    employmentType: excel.employmentType || (excel.kind === 'cont' ? 'Contract Lumpsum' : 'Permanent'),
    employmentStatus: 'Active',
    payrollGroup: currency === 'USD' ? 'DLE_USD' : 'DLE',
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
  return overlayRecord(stub, excel);
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

  const used = new Set<PayrollCalculationRecord>();
  const overlaid: PayrollCalculationRecord[] = [];
  for (const row of applied.parsed.rows) {
    const currency = excelRowCurrency(row);
    const match = salaryScheduleEmployeeKeys(row.employeeCode).map((key) => byCurrency[currency].get(key)).find(Boolean) || null;
    if (match) {
      used.add(match);
      overlaid.push(overlayRecord(match, row));
    } else {
      overlaid.push(emptyRecordFromExcel(row, period));
    }
  }

  return [...dailyRate, ...overlaid];
};
