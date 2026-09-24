/**
 * Recalculate September 2026 payroll from the corrected timesheet and write the Excel exports.
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/refresh-september-payroll-exports.mts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadWorkspaceEnv } from '../apps/dashboard/lib/dle-enterprise-db';
import { readPayrollEmployees } from '../apps/dashboard/lib/payroll-employee-source';
import { calculatePayrollForPeriod, filterPayrollCalculationByPack } from '../apps/dashboard/lib/payroll-calculation-service';
import {
  capturePayrollSnapshot,
  listPayrollRunsForPeriod,
  savePayrollRun,
} from '../apps/dashboard/lib/payroll-run-store';
import { buildDayratePaymentScheduleXlsx } from '../apps/dashboard/lib/dayrate-schedule-template-export';
import { buildOfficialPayrollExcelWorksheets } from '../apps/dashboard/lib/payroll-official-excel-export';
import { buildExcelWorkbookXml } from '../apps/dashboard/lib/excel-export';
import { buildTimesheetHoursMapForPayrollPeriod, isTimesheetCountableForPayroll, readTimesheetData } from '../apps/dashboard/lib/timesheet-entry-store';
import { getPayrollPublicHolidayDates } from '../apps/dashboard/lib/nigeria-public-holidays';
import { buildPayrollAttendanceSheet } from '../apps/dashboard/lib/timesheet-payroll-attendance-sheet';
import { PAYROLL_ATTENDANCE_SHEET_COLUMNS, payrollAttendanceSheetToExcelRows } from '../apps/dashboard/lib/timesheet-payroll-attendance-sheet-shared';

loadWorkspaceEnv();

const PERIOD = '2026-09';
const OUT_DIR = path.resolve('apps/dashboard/data/hris/payroll-exports/2026-09');

const money = (value: unknown) => Math.round(Number(value || 0));

const main = async () => {
  const [runs, directory, full] = await Promise.all([
    listPayrollRunsForPeriod(PERIOD),
    readPayrollEmployees(),
    calculatePayrollForPeriod(PERIOD, { forceRefresh: true }),
  ]);
  const daily = filterPayrollCalculationByPack(full, 'daily-rate', null);
  const dailyRuns = runs.filter((run) => run.pack === 'daily-rate');
  const targets = dailyRuns.length ? dailyRuns : [];

  for (const run of targets) {
    const scoped = filterPayrollCalculationByPack(full, 'daily-rate', run.company || null);
    run.employeeCount = scoped.summary.payrollEligible || scoped.summary.employees || 0;
    run.grossPay = scoped.summary.grossPay;
    run.deductions = scoped.summary.deductions;
    run.netPay = scoped.summary.netPay;
    run.employerCost = scoped.summary.employerCost;
    run.exceptionCount = scoped.summary.exceptionCount;
    run.updatedBy = 'timesheet-correction';
    await savePayrollRun(run);
    await capturePayrollSnapshot(
      run.id,
      'timesheet-correction',
      'timesheet-correction',
      scoped.summary as unknown as Record<string, unknown>,
      scoped.records,
    );
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const schedule = await buildDayratePaymentScheduleXlsx({
    period: PERIOD,
    periodLabel: 'September 2026',
    records: daily.records,
    directoryEmployees: directory.employees,
    company: null,
  });
  const schedulePath = path.join(OUT_DIR, schedule.fileName);
  writeFileSync(schedulePath, Buffer.from(schedule.buffer));

  const worksheets = await buildOfficialPayrollExcelWorksheets({
    report: 'payroll-register',
    pack: 'daily-rate',
    period: PERIOD,
    periodLabel: 'September 2026',
    salariedRecords: [],
    dayrateRecords: daily.records,
    directoryEmployees: directory.employees,
    currencyScope: 'all',
    company: null,
  });
  const registerName = `September 2026 DAYRATE PAYROLL REGISTER.xls`;
  const registerPath = path.join(OUT_DIR, registerName);
  writeFileSync(registerPath, buildExcelWorkbookXml({ worksheets }));

  const { headers, lines } = await readTimesheetData({ forceRefresh: true });
  const periodHeaders = headers.filter((header) => header.periodId === 'per-2026-09' && isTimesheetCountableForPayroll(header.status));
  const headerById = new Map(periodHeaders.map((header) => [header.id, header]));
  const attendanceRows = lines.filter((line) => headerById.has(line.headerId)).map((line) => {
    const header = headerById.get(line.headerId)!;
    return {
      lineId: line.id,
      timesheetDate: String(header.timesheetDate || '').slice(0, 10),
      employeeId: line.employeeId,
      employeeNo: line.employeeNo,
      employeeName: line.employeeName,
      jobTitle: '',
      location: header.locationName || '',
      shiftLabel: header.shiftLabel || '',
      headerId: header.id,
      projectCode: line.projectAllocations?.[0]?.projectCode || '',
      projectSite: '',
      lineRemarks: line.remarks || '',
      idleReasons: '',
      attendanceHours: Number(line.attendanceDuration || 0),
      usedHours: Number(line.usedHours || 0),
      productiveHours: Number(line.usedHours || line.totalHours || 0),
      totalHours: Number(line.totalHours || 0),
      offshoreAllowanceHours: Number(line.offshoreAllowanceHours || 0),
      clockIn: line.clockIn,
    };
  });
  const holidayDates = await getPayrollPublicHolidayDates().catch(() => [] as string[]);
  const payrollHours = await buildTimesheetHoursMapForPayrollPeriod(PERIOD);
  const attendanceSheet = buildPayrollAttendanceSheet({
    rows: attendanceRows,
    holidayDates,
    canViewCosts: true,
    payrollHoursByKey: payrollHours,
  });
  const bookedLines = lines.filter((line) => {
    const header = headerById.get(line.headerId);
    if (!header) return false;
    return Number(line.usedHours || 0) > 0 || Number(line.totalHours || 0) > 0 || Number(line.offshoreAllowanceHours || 0) > 0 || Boolean(String(line.clockIn || '').trim());
  }).map((line) => {
    const header = headerById.get(line.headerId)!;
    return [
      String(header.timesheetDate || '').slice(0, 10),
      header.status,
      line.employeeNo,
      line.employeeName,
      header.locationName || '',
      header.supervisorName || '',
      Number(line.usedHours || 0),
      Number(line.totalHours || 0),
      Number(line.offshoreAllowanceHours || 0),
      line.clockIn || '',
      line.remarks || '',
    ];
  });
  const reportName = 'September 2026 TIMESHEET REPORT.xls';
  const reportPath = path.join(OUT_DIR, reportName);
  writeFileSync(reportPath, buildExcelWorkbookXml({
    worksheets: [
      {
        title: 'Days Worked (one row per employee)',
        subtitle: '16 Aug 2026 to 15 Sep 2026 · Draft bookings included · one day per employee date',
        sheetName: 'Days Worked',
        columns: [...PAYROLL_ATTENDANCE_SHEET_COLUMNS],
        rows: payrollAttendanceSheetToExcelRows(attendanceSheet),
      },
      {
        title: 'Booked timesheet lines',
        subtitle: '16 Aug 2026 to 15 Sep 2026 · Draft, Locked and approved sheets · hours already saved',
        sheetName: 'Booked Lines',
        columns: ['Date', 'Status', 'Employee No', 'Employee Name', 'Location', 'Supervisor', 'Used Hours', 'Total Hours', 'Offshore Allowance', 'Clock In', 'Remarks'],
        rows: bookedLines,
      },
    ],
  }));

  const dle = filterPayrollCalculationByPack(full, 'daily-rate', 'DLE');
  const dlpc = filterPayrollCalculationByPack(full, 'daily-rate', 'DLPC');
  console.log(JSON.stringify({
    runsUpdated: targets.map((run) => ({ id: run.id, company: run.company, status: run.status, gross: money(run.grossPay), net: money(run.netPay), employees: run.employeeCount })),
    daily: { employees: daily.summary.payrollEligible || daily.summary.employees, gross: money(daily.summary.grossPay), net: money(daily.summary.netPay) },
    dle: { employees: dle.summary.payrollEligible || dle.summary.employees, gross: money(dle.summary.grossPay), net: money(dle.summary.netPay) },
    dlpc: { employees: dlpc.summary.payrollEligible || dlpc.summary.employees, gross: money(dlpc.summary.grossPay), net: money(dlpc.summary.netPay) },
    files: [schedulePath, registerPath, reportPath],
  }, null, 2));
};

main().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
