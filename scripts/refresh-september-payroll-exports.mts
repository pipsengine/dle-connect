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

  const dle = filterPayrollCalculationByPack(full, 'daily-rate', 'DLE');
  const dlpc = filterPayrollCalculationByPack(full, 'daily-rate', 'DLPC');
  console.log(JSON.stringify({
    runsUpdated: targets.map((run) => ({ id: run.id, company: run.company, status: run.status, gross: money(run.grossPay), net: money(run.netPay), employees: run.employeeCount })),
    daily: { employees: daily.summary.payrollEligible || daily.summary.employees, gross: money(daily.summary.grossPay), net: money(daily.summary.netPay) },
    dle: { employees: dle.summary.payrollEligible || dle.summary.employees, gross: money(dle.summary.grossPay), net: money(dle.summary.netPay) },
    dlpc: { employees: dlpc.summary.payrollEligible || dlpc.summary.employees, gross: money(dlpc.summary.grossPay), net: money(dlpc.summary.netPay) },
    files: [schedulePath, registerPath],
  }, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
