/**
 * When a Dayrate Payment Schedule is applied for a period, the DLE / DLPC sheets
 * are the company of record. Subsequent months follow the same rule from that
 * month's uploaded workbook — not HRIS location or department heuristics.
 */
import type { PayrollCalculationRecord } from '@/lib/payroll-calculation-service';
import { readAppliedDayrateScheduleOverride } from '@/lib/dayrate-schedule-override-read';
import {
  canonicalContractEmployeeCode,
  dayrateBookedHours,
  type DayrateScheduleRow,
} from '@/lib/dayrate-schedule-xlsx';
import { withPayrollCompany, type PayrollCompany } from '@/lib/payroll-schedule-scope';
import { normalizePayrollMatchKey } from '@/lib/sage-people-payroll-store';

const roundMoney = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
const compact = (value: unknown) => String(value || '').trim();
const upper = (value: unknown) => compact(value).toUpperCase();

const matchKeys = (...values: unknown[]) =>
  values
    .flatMap((value) => [compact(value), normalizePayrollMatchKey(value), canonicalContractEmployeeCode(value)])
    .map((value) => upper(value))
    .filter(Boolean);

const stampDayrateCompany = (record: PayrollCalculationRecord, row: DayrateScheduleRow): PayrollCalculationRecord =>
  withPayrollCompany(
    {
      ...record,
      isDailyRate: true,
      fullName: row.employeeName || record.fullName,
      jobTitle: row.jobTitle || record.jobTitle,
      location: row.location || record.location,
      employmentType: record.employmentType || 'Daily Rate',
      salaryStructure: 'Daily Rate',
      timesheetDaysWorked: row.weekdayDays || record.timesheetDaysWorked,
      timesheetBookedHours: dayrateBookedHours(row) || record.timesheetBookedHours,
    },
    row.company,
  );

const emptyRecordFromExcel = (row: DayrateScheduleRow, period: string): PayrollCalculationRecord => {
  const grossPay = roundMoney(row.excelGross);
  const netPay = roundMoney(row.excelNet || grossPay);
  const totalDeductions = roundMoney(Math.max(0, grossPay - netPay));
  const company: PayrollCompany = row.company === 'DLPC' ? 'DLPC' : 'DLE';
  return withPayrollCompany(
    {
      recordKey: `${period}-dayrate-schedule-${row.employeeCode}-${company}`,
      employeeId: row.employeeCode,
      employeeCode: row.employeeCode,
      fullName: row.employeeName || row.employeeCode,
      department: '',
      businessUnit: company,
      location: row.location,
      jobTitle: row.jobTitle,
      employmentType: 'Daily Rate',
      employmentStatus: 'Active',
      payrollGroup: company,
      salaryGrade: 'Daily Rate',
      payCurrency: 'NGN',
      paymentRun: 'Monthly',
      basePay: roundMoney(row.excelDailyRate),
      allowances: roundMoney(Math.max(0, grossPay - row.excelDailyRate)),
      grossPay,
      taxablePay: grossPay,
      nonTaxablePay: 0,
      earningProfile: 'HR Dayrate Schedule',
      earningProfileId: 'contract-day-rate',
      paye: 0,
      pensionEmployee: 0,
      pensionEmployer: 0,
      statutoryEmployee: 0,
      statutoryEmployer: 0,
      loanRecovery: 0,
      otherDeductions: totalDeductions,
      totalDeductions,
      netPay,
      employerCost: grossPay,
      deductionRatio: grossPay > 0 ? roundMoney((totalDeductions / grossPay) * 100) : 0,
      timesheetDaysWorked: row.weekdayDays || null,
      timesheetBookedHours: dayrateBookedHours(row) || null,
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
      deductions: totalDeductions,
      pension: 0,
      isDailyRate: true,
      ratePerDay: row.excelDailyRate || null,
      ratePerHour: null,
      hoursPerDay: 8,
      setupAssignedToPayroll: true,
      nhfApplicable: false,
      salaryStructure: 'Daily Rate',
      earningLines: [],
      annualBenefitLines: [],
      deductionLines: totalDeductions > 0 ? [{ code: 'WHT', label: 'WHT', amount: totalDeductions }] : [],
    },
    company,
  );
};

export const applyDayrateScheduleOverrideToRecords = (
  records: PayrollCalculationRecord[],
  period: string,
  schedule?: { rows: DayrateScheduleRow[] } | null,
): PayrollCalculationRecord[] => {
  const applied = schedule || readAppliedDayrateScheduleOverride(period);
  if (!applied?.rows?.length) return records;

  const byKey = new Map<string, PayrollCalculationRecord>();
  for (const record of records) {
    for (const key of matchKeys(record.employeeCode, record.employeeId, record.fullName)) {
      const existing = byKey.get(key);
      if (!existing || (record.isDailyRate && !existing.isDailyRate)) byKey.set(key, record);
    }
  }

  const used = new Set<PayrollCalculationRecord>();
  const overlaid: PayrollCalculationRecord[] = [];
  for (const row of applied.rows) {
    const match = matchKeys(row.employeeCode, row.employeeName).map((key) => byKey.get(key)).find(Boolean) || null;
    if (match) {
      used.add(match);
      overlaid.push(stampDayrateCompany(match, row));
    } else {
      overlaid.push(emptyRecordFromExcel(row, period));
    }
  }

  const remainingSalaried = records.filter((record) => !used.has(record) && !record.isDailyRate);
  return [...remainingSalaried, ...overlaid];
};
