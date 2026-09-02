import type { DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import { isDailyRatePayrollEmployee } from '@/lib/payroll-employee-classification';
import { readPayrollEmployees } from '@/lib/payroll-employee-source';
import { normalizePayrollPeriod } from '@/lib/payroll-leave-allowance-store';
import {
  removePayrollPeriodEarningAdjustments,
  replacePayrollPeriodEarningAdjustmentsForSource,
} from '@/lib/payroll-period-earning-adjustments-store';
import { writeHrisDataFile } from '@/lib/hris-data-paths';
import { normalizePayrollMatchKey } from '@/lib/sage-people-payroll-store';
import {
  canonicalContractEmployeeCode,
  dayrateBookedHours,
  parseDayratePaymentScheduleWorkbook,
  type DayrateScheduleRow,
} from '@/lib/dayrate-schedule-xlsx';
import {
  clearDayrateScheduleOverrideReadCache,
  clearPrimedDayrateScheduleOverrideCache,
  HR_DAYRATE_SCHEDULE_OVERRIDE_SOURCE,
  primeDayrateScheduleOverrideCache,
  readDayrateScheduleOverrideFileSync,
  type DayrateScheduleOverrideRecord,
} from '@/lib/dayrate-schedule-override-read';
import {
  deactivateDayrateScheduleUploadsInSql,
  saveDayrateScheduleUploadToSql,
} from '@/lib/dayrate-schedule-upload-sql';

export {
  applyDayrateScheduleOverrideToHoursMap,
  employeeHasAppliedDayrateScheduleOverride,
  findDayrateScheduleOverrideRow,
  HR_DAYRATE_SCHEDULE_OVERRIDE_SOURCE,
  isHrDayrateScheduleOverrideSource,
  readAppliedDayrateScheduleOverride,
  type DayrateScheduleOverrideRecord,
} from '@/lib/dayrate-schedule-override-read';

export type DayrateReconcileStatus =
  | 'Match'
  | 'Excel higher'
  | 'Excel lower'
  | 'Excel only'
  | 'Not in Excel'
  | 'Cannot pay';

export type DayrateReconcileRow = {
  employeeCode: string;
  employeeName: string;
  company: string;
  directoryName: string | null;
  dailyRate: number;
  excelDailyRate: number;
  excelWeekdayDays: number;
  systemDays: number;
  excelBookedHours: number;
  systemHours: number;
  weekdayOvtHours: number;
  saturdayHours: number;
  sundayHours: number;
  publicHolidayHours: number;
  nightDays: number;
  nightAmt: number;
  siteAllowance: number;
  tcmMeal: number;
  tcmTransport: number;
  transport: number;
  arrears: number;
  status: DayrateReconcileStatus;
  payable: boolean;
  note: string | null;
};

const round1 = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 10) / 10;
const roundMoney = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
const compact = (value: unknown) => String(value || '').trim();

const writeOverrideFile = async (file: { overrides: DayrateScheduleOverrideRecord[] }) => {
  await writeHrisDataFile(
    'dayrate-schedule-overrides.json',
    `${JSON.stringify(file, null, 2)}\n`,
    process.env.DLE_DAYRATE_SCHEDULE_OVERRIDE_PATH,
  );
  clearDayrateScheduleOverrideReadCache();
};

const employeeMatchKeys = (employee: Pick<DleEmployeeDirectoryRow, 'employeeId' | 'employeeCode'> & { sourceEmployeeId?: string | null; fullName?: string | null }) =>
  [employee.employeeCode, employee.employeeId, employee.sourceEmployeeId, employee.fullName]
    .flatMap((value) => [compact(value), normalizePayrollMatchKey(value), canonicalContractEmployeeCode(value)])
    .map((value) => value.toUpperCase())
    .filter(Boolean);

const lookupDirectoryEmployee = (employees: DleEmployeeDirectoryRow[], code: string) => {
  const needle = new Set([code.toUpperCase(), normalizePayrollMatchKey(code)]);
  return employees.find((employee) => employeeMatchKeys(employee).some((key) => needle.has(key))) || null;
};

const timesheetLookup = (
  hours: Map<string, { daysWorked: number; bookedHours: number }>,
  employee: DleEmployeeDirectoryRow | null,
  excel: DayrateScheduleRow,
) => {
  const keys = employee
    ? employeeMatchKeys(employee)
    : [excel.employeeCode, excel.employeeName, normalizePayrollMatchKey(excel.employeeCode), normalizePayrollMatchKey(excel.employeeName)];
  return keys.map((key) => hours.get(key) || hours.get(key.toUpperCase())).find(Boolean) || null;
};

export const buildDayrateScheduleReconcile = (
  excelRows: DayrateScheduleRow[],
  employees: DleEmployeeDirectoryRow[],
  timesheetHours: Map<string, { daysWorked: number; bookedHours: number }>,
) => {
  const rows: DayrateReconcileRow[] = [];
  const excelCodes = new Set(excelRows.map((row) => row.employeeCode.toUpperCase()));
  const seenSystem = new Set<string>();

  for (const excel of excelRows) {
    const directory = lookupDirectoryEmployee(employees, excel.employeeCode);
    const dailyRateEmployee = directory ? isDailyRatePayrollEmployee(directory) : false;
    const timesheet = timesheetLookup(timesheetHours, directory, excel);
    const systemDays = round1(Number(timesheet?.daysWorked || 0));
    const systemHours = round1(Number(timesheet?.bookedHours || 0));
    const excelHours = dayrateBookedHours(excel);
    const payable = Boolean(directory && dailyRateEmployee && (excel.weekdayDays > 0 || excelHours > 0));
    let status: DayrateReconcileStatus = 'Match';
    let note: string | null = null;
    if (!directory) {
      status = 'Cannot pay';
      note = 'C-code is not on the employee directory.';
    } else if (!dailyRateEmployee) {
      status = 'Cannot pay';
      note = 'Employee is not on daily-rate payroll setup.';
    } else if (systemDays <= 0 && systemHours <= 0) {
      status = 'Excel only';
      note = 'Not booked in DLE Connect timesheets — Excel will create payroll days.';
    } else if (excel.weekdayDays > systemDays + 0.001) {
      status = 'Excel higher';
    } else if (excel.weekdayDays < systemDays - 0.001) {
      status = 'Excel lower';
    }
    rows.push({
      employeeCode: excel.employeeCode,
      employeeName: excel.employeeName,
      company: excel.company,
      directoryName: directory?.fullName || null,
      dailyRate: roundMoney(Number(directory?.ratePerDay || 0)),
      excelDailyRate: roundMoney(excel.excelDailyRate),
      excelWeekdayDays: excel.weekdayDays,
      systemDays,
      excelBookedHours: excelHours,
      systemHours,
      weekdayOvtHours: excel.weekdayOvtHours,
      saturdayHours: excel.saturdayHours,
      sundayHours: excel.sundayHours,
      publicHolidayHours: excel.publicHolidayHours,
      nightDays: excel.nightDays,
      nightAmt: roundMoney(excel.nightAmt),
      siteAllowance: roundMoney(excel.siteAllowance),
      tcmMeal: roundMoney(excel.tcmMeal),
      tcmTransport: roundMoney(excel.tcmTransport),
      transport: roundMoney(excel.transport),
      arrears: roundMoney(excel.arrears),
      status,
      payable,
      note,
    });
  }

  for (const [key, hours] of timesheetHours.entries()) {
    const code = canonicalContractEmployeeCode(key);
    if (!code || excelCodes.has(code) || seenSystem.has(code)) continue;
    if ((hours.daysWorked || 0) <= 0 && (hours.bookedHours || 0) <= 0) continue;
    seenSystem.add(code);
    const directory = lookupDirectoryEmployee(employees, code);
    rows.push({
      employeeCode: code,
      employeeName: directory?.fullName || key,
      company: '',
      directoryName: directory?.fullName || null,
      dailyRate: roundMoney(Number(directory?.ratePerDay || 0)),
      excelDailyRate: 0,
      excelWeekdayDays: 0,
      systemDays: round1(hours.daysWorked),
      excelBookedHours: 0,
      systemHours: round1(hours.bookedHours),
      weekdayOvtHours: 0,
      saturdayHours: 0,
      sundayHours: 0,
      publicHolidayHours: 0,
      nightDays: 0,
      nightAmt: 0,
      siteAllowance: 0,
      tcmMeal: 0,
      tcmTransport: 0,
      transport: 0,
      arrears: 0,
      status: 'Not in Excel',
      payable: false,
      note: 'Booked in DLE Connect but missing from Excel. Excel is complete — this C-code will drop from daily-rate pay.',
    });
  }

  const order: Record<DayrateReconcileStatus, number> = {
    'Cannot pay': 0,
    'Not in Excel': 1,
    'Excel only': 2,
    'Excel higher': 3,
    'Excel lower': 4,
    Match: 5,
  };
  rows.sort((a, b) => (order[a.status] - order[b.status]) || a.employeeCode.localeCompare(b.employeeCode));

  return {
    rows,
    summary: {
      excelEmployees: excelRows.length,
      payable: rows.filter((row) => row.payable).length,
      blocked: rows.filter((row) => row.status === 'Cannot pay').length,
      excelOnly: rows.filter((row) => row.status === 'Excel only').length,
      notInExcel: rows.filter((row) => row.status === 'Not in Excel').length,
      mismatched: rows.filter((row) => row.status === 'Excel higher' || row.status === 'Excel lower').length,
      matched: rows.filter((row) => row.status === 'Match').length,
    },
  };
};

export const previewDayrateScheduleWorkbook = async (input: {
  period: string;
  workbook: Buffer;
}) => {
  const period = normalizePayrollPeriod(input.period);
  if (!period) throw new Error('Payroll period is required.');
  const parsed = parseDayratePaymentScheduleWorkbook(input.workbook);
  const employees = (await readPayrollEmployees()).employees;
  const { buildTimesheetHoursMapForPayrollPeriod } = await import('@/lib/timesheet-entry-store');
  const timesheetHours = await buildTimesheetHoursMapForPayrollPeriod(period, { ignoreDayrateScheduleOverride: true });
  const reconcile = buildDayrateScheduleReconcile(parsed.rows, employees, timesheetHours);
  return { period, parsed, reconcile };
};

export const applyDayrateScheduleOverride = async (input: {
  period: string;
  fileName: string;
  workbook: Buffer;
  actor: string;
}) => {
  const period = normalizePayrollPeriod(input.period);
  if (!period) throw new Error('Payroll period is required.');
  const parsed = parseDayratePaymentScheduleWorkbook(input.workbook);
  const employees = (await readPayrollEmployees()).employees;
  const payableRows = parsed.rows.filter((row) => {
    const directory = lookupDirectoryEmployee(employees, row.employeeCode);
    return Boolean(directory && isDailyRatePayrollEmployee(directory) && (row.weekdayDays > 0 || dayrateBookedHours(row) > 0));
  });
  if (!payableRows.length) throw new Error('No payable daily-rate C-codes in this workbook.');

  // The schedule's own allowance columns are read straight off the stored upload by
  // the earnings engine, so no separate adjustment rows are posted for them. Clear
  // anything a previous apply left behind so those amounts cannot be counted twice.
  await replacePayrollPeriodEarningAdjustmentsForSource({
    period,
    source: HR_DAYRATE_SCHEDULE_OVERRIDE_SOURCE,
    rows: [],
  });

  const next: DayrateScheduleOverrideRecord = {
    period,
    fileName: compact(input.fileName) || 'dayrate-payment-schedule.xlsx',
    title: parsed.title,
    appliedAt: new Date().toISOString(),
    appliedBy: compact(input.actor) || 'HR',
    rows: parsed.rows,
    skipped: parsed.skipped,
    sheets: parsed.sheets,
  };

  // DLE_Enterprise is the system of record — this is what makes the upload survive
  // a reload, restart or deploy. It must succeed before anything else is updated.
  await saveDayrateScheduleUploadToSql({
    period,
    fileName: next.fileName,
    title: next.title,
    appliedAt: next.appliedAt,
    appliedBy: next.appliedBy,
    rows: parsed.rows,
    skipped: parsed.skipped,
    sheets: parsed.sheets,
    workbook: input.workbook,
  });
  primeDayrateScheduleOverrideCache(period, next);

  try {
    const file = readDayrateScheduleOverrideFileSync();
    await writeOverrideFile({
      overrides: [...file.overrides.filter((item) => item.period !== period), next],
    });
  } catch (error) {
    // The JSON copy is only a convenience mirror now; SQL already holds the upload.
    console.warn('[dayrate-schedule] stored in SQL but the JSON mirror could not be written', error);
  }

  const { invalidateTimesheetHoursCacheForPeriod } = await import('@/lib/timesheet-entry-store');
  invalidateTimesheetHoursCacheForPeriod(period);

  try {
    const { persistAppliedPayrollSchedulesToHris } = await import('@/lib/payroll-schedule-hris-persist');
    await persistAppliedPayrollSchedulesToHris(period);
  } catch (error) {
    console.warn('[dayrate-schedule] applied in SQL but HRIS rate persist failed', error);
  }

  return next;
};

export const clearDayrateScheduleOverride = async (period: string) => {
  const normalized = normalizePayrollPeriod(period);
  if (!normalized) throw new Error('Payroll period is required.');
  await removePayrollPeriodEarningAdjustments({ period: normalized, source: HR_DAYRATE_SCHEDULE_OVERRIDE_SOURCE });
  await deactivateDayrateScheduleUploadsInSql(normalized);
  clearPrimedDayrateScheduleOverrideCache(normalized);
  const file = readDayrateScheduleOverrideFileSync();
  await writeOverrideFile({
    overrides: file.overrides.filter((item) => item.period !== normalized),
  });
  const { invalidateTimesheetHoursCacheForPeriod } = await import('@/lib/timesheet-entry-store');
  invalidateTimesheetHoursCacheForPeriod(normalized);
  return { period: normalized, cleared: true };
};
