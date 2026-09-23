/**
 * Write the applied salary / day-rate schedule onto HRIS employee packages
 * so the next payroll period can run from EmployeePayrollSetup without Excel.
 * Does not change the current period's overlay amounts.
 */
import type { DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import { upsertEmployeePayrollPackageFromScheduleInDb, updateEmployeeDailyRatePayInDb } from '@/lib/dle-enterprise-db';
import { readAppliedDayrateScheduleOverride } from '@/lib/dayrate-schedule-override-read';
import { isDailyRatePayrollEmployee } from '@/lib/payroll-employee-classification';
import { readPayrollEmployees, invalidatePayrollEmployeeCache } from '@/lib/payroll-employee-source';
import { normalizePayrollCompany } from '@/lib/payroll-schedule-scope';
import type { StoredPayrollPackageLine } from '@/lib/payroll-package-lines';
import { isPeriodOnlyPackageEarningLine, keepUnscheduledStandingPackageLines, roundMoney } from '@/lib/payroll-package-lines';
import { excelRowCurrency, readAppliedSalaryScheduleOverride } from '@/lib/salary-schedule-upload-sql';
import { salaryScheduleEmployeeKeys, type SalaryScheduleRow } from '@/lib/salary-schedule-xlsx';
import { payrollCompanyFromSalaryScheduleRow } from '@/lib/salary-schedule-overlay';
import { payrollExcelAmountOverlayApplies } from '@/lib/payroll-source-of-truth';

const compact = (value: unknown) => String(value || '').trim();

const STATUTORY_DEDUCTION = /^(PAYE|NHF|PENSION|PENSION_EE|PENSION_EE2)$/i;

export const salaryRowToHrisPackageLines = (row: SalaryScheduleRow) => {
  const earnings: StoredPayrollPackageLine[] = [];
  for (const line of row.earnings || []) {
    const amount = roundMoney(line.amount);
    if (!(amount > 0)) continue;
    const code = compact(line.code).toUpperCase() || 'EARNING';
    const name = compact(line.name) || line.code;
    if (isPeriodOnlyPackageEarningLine({ code, name })) {
      continue;
    }
    earnings.push({
      code,
      name,
      amount,
      sourceAmount: amount,
      runFrequency: 'monthly',
      includeInMonthlyPayroll: true,
      taxableAmount: amount,
      ytdTotal: 0,
    });
  }
  const deductions: StoredPayrollPackageLine[] = [];
  for (const line of row.deductions || []) {
    const amount = roundMoney(line.amount);
    if (!(amount > 0)) continue;
    if (STATUTORY_DEDUCTION.test(line.code)) continue;
    deductions.push({
      code: compact(line.code).toUpperCase() || 'DEDUCTION',
      name: compact(line.name) || line.code,
      amount,
      sourceAmount: amount,
      runFrequency: 'monthly',
      includeInMonthlyPayroll: true,
      taxableAmount: 0,
      ytdTotal: 0,
    });
  }
  const monthlyGross = roundMoney(earnings.filter((line) => line.includeInMonthlyPayroll !== false).reduce((sum, line) => sum + Number(line.amount || 0), 0));
  const periodSalary = roundMoney(row.periodSalary || monthlyGross || row.grossPay);
  const basic = roundMoney(earnings.find((line) => /^(BASIC|LUMPSUMTAX|BASIC1_LUMPSUM)$/i.test(line.code))?.amount || 0);
  return { earnings, deductions, periodSalary, basicSalary: basic || null, annualSalary: roundMoney(row.annualSalary || (periodSalary ? periodSalary * 12 : 0)) || null };
};

const employeeKeys = (employee: Pick<DleEmployeeDirectoryRow, 'employeeCode' | 'employeeId' | 'fullName'>) =>
  salaryScheduleEmployeeKeys(employee.employeeCode || employee.employeeId || '')
    .concat(compact(employee.fullName).toUpperCase())
    .filter(Boolean);

const indexEmployees = (employees: DleEmployeeDirectoryRow[]) => {
  const byKey = new Map<string, DleEmployeeDirectoryRow>();
  for (const employee of employees) {
    for (const key of employeeKeys(employee)) {
      if (!byKey.has(key)) byKey.set(key, employee);
    }
  }
  return byKey;
};

const persistMemos = new Map<string, Promise<{ saved: number; skipped: number }>>();

const schedulePeriodCode = (period?: string | null) =>
  compact(period).replace(/\//g, '-').replace(/^per-/i, '').slice(0, 7);

/**
 * Excel may refresh HRIS packages only for a pre-September period, and only
 * from that same period's workbook. A September re-run must not copy August.
 */
export const excelScheduleMayOverwriteHris = (requestedPeriod?: string | null, schedulePeriod?: string | null) => {
  const requested = schedulePeriodCode(requestedPeriod);
  if (!requested || !payrollExcelAmountOverlayApplies(requested)) return false;
  const schedule = schedulePeriodCode(schedulePeriod);
  if (!schedule || schedule !== requested || !payrollExcelAmountOverlayApplies(schedule)) return false;
  return true;
};

const persistNow = async (period: string) => {
  if (!payrollExcelAmountOverlayApplies(period)) return { saved: 0, skipped: 0 };
  const salary = readAppliedSalaryScheduleOverride(period);
  const dayrate = readAppliedDayrateScheduleOverride(period);
  const salaryRows = excelScheduleMayOverwriteHris(period, salary?.period) ? (salary?.parsed?.rows || []) : [];
  const dayrateRows = excelScheduleMayOverwriteHris(period, dayrate?.period) ? (dayrate?.rows || []) : [];
  if (!salaryRows.length && !dayrateRows.length) return { saved: 0, skipped: 0 };

  const source = await readPayrollEmployees();
  const employees = indexEmployees(source.employees);
  let saved = 0;
  let skipped = 0;

  for (const row of salaryRows) {
    if (row.kind !== 'usd' && !normalizePayrollCompany(row.company)) {
      skipped += 1;
      continue;
    }
    const match = salaryScheduleEmployeeKeys(row.employeeCode).map((key) => employees.get(key)).find(Boolean);
    if (!match?.employeeDbId) {
      skipped += 1;
      continue;
    }
    const pkg = salaryRowToHrisPackageLines(row);
    const currency = excelRowCurrency(row);
    const company = payrollCompanyFromSalaryScheduleRow(row);
    const writeLocal = currency === 'NGN' && Boolean(match.hasDualCurrencyPayroll);
    try {
      await upsertEmployeePayrollPackageFromScheduleInDb({
        employeeDbId: match.employeeDbId,
        payrollGroup: currency === 'USD' ? 'DLE_USD' : company,
        payCurrency: currency,
        periodSalary: writeLocal ? null : pkg.periodSalary,
        annualSalary: pkg.annualSalary,
        basicSalary: writeLocal ? null : pkg.basicSalary,
        sageEarningLinesJson: writeLocal ? null : (pkg.earnings.length ? JSON.stringify(keepUnscheduledStandingPackageLines(pkg.earnings, match.sagePayrollEarnings)) : null),
        sageDeductionLinesJson: writeLocal ? null : (pkg.deductions.length ? JSON.stringify(pkg.deductions) : null),
        writeLocalNgnPackage: writeLocal,
        localPayrollGroup: writeLocal ? company : null,
        localPayCurrency: writeLocal ? 'NGN' : null,
        localPeriodSalary: writeLocal ? pkg.periodSalary : null,
        sageLocalEarningLinesJson: writeLocal && pkg.earnings.length ? JSON.stringify(keepUnscheduledStandingPackageLines(pkg.earnings, match.sageLocalPayrollEarnings || match.sagePayrollEarnings)) : null,
        sageLocalDeductionLinesJson: writeLocal && pkg.deductions.length ? JSON.stringify(pkg.deductions) : null,
      });
      saved += 1;
    } catch (error) {
      skipped += 1;
      console.warn('[payroll-schedule-hris] salary persist failed for', row.employeeCode, error);
    }
  }

  for (const row of dayrateRows) {
    const match = salaryScheduleEmployeeKeys(row.employeeCode).map((key) => employees.get(key)).find(Boolean)
      || employees.get(compact(row.employeeCode).toUpperCase());
    if (!match?.employeeDbId) {
      skipped += 1;
      continue;
    }
    if (!isDailyRatePayrollEmployee(match) && !(Number(row.excelDailyRate || 0) > 0)) {
      skipped += 1;
      continue;
    }
    const ratePerDay = roundMoney(row.excelDailyRate);
    if (!(ratePerDay > 0)) {
      skipped += 1;
      continue;
    }
    try {
      await updateEmployeeDailyRatePayInDb({
        employeeDbId: match.employeeDbId,
        payrollGroup: row.company,
        payCurrency: 'NGN',
        paymentRun: 'Daily Timesheet',
        paymentType: 'Timesheet Rate',
        ratePerDay,
        ratePerHour: roundMoney(ratePerDay / 8),
        hoursPerDay: 8,
      });
      saved += 1;
    } catch (error) {
      skipped += 1;
      console.warn('[payroll-schedule-hris] day-rate persist failed for', row.employeeCode, error);
    }
  }

  invalidatePayrollEmployeeCache();
  return { saved, skipped };
};

/** Persist applied Excel packages onto HRIS employees (deduped per period for ~60s).
 * From September 2026 Excel is not live payroll authority — do not overwrite HRIS earning lines. */
export const persistAppliedPayrollSchedulesToHris = async (period: string) => {
  const normalized = compact(period).replace(/\//g, '-').slice(0, 7);
  if (!normalized) return { saved: 0, skipped: 0 };
  if (!payrollExcelAmountOverlayApplies(normalized)) return { saved: 0, skipped: 0 };
  const existing = persistMemos.get(normalized);
  if (existing) return existing;
  const work = persistNow(normalized).catch((error) => {
    console.warn('[payroll-schedule-hris] persist failed for', normalized, error);
    return { saved: 0, skipped: 0 };
  }).finally(() => {
    setTimeout(() => persistMemos.delete(normalized), 60_000);
  });
  persistMemos.set(normalized, work);
  return work;
};
