/**
 * Read-only: quantify why the wages (daily-rate) KPI cards differ from the HR
 * Dayrate Payment Schedule workbook for a payroll period.
 *
 * Usage:
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/diagnose-wages-card-vs-excel.mts \
 *     --period 2026-08 --workbook "backups/Dayrate Payment Schedule/AUGUST 2026DAYRATE PAYMENT SCHEDULE .xlsx"
 */
import fs from 'node:fs';
import path from 'node:path';

import { parseDayratePaymentScheduleWorkbook } from '../apps/dashboard/lib/dayrate-schedule-xlsx';
import { isDailyRatePayrollEmployee } from '../apps/dashboard/lib/payroll-employee-classification';
import { readPayrollEmployees } from '../apps/dashboard/lib/payroll-employee-source';
import { normalizePayrollMatchKey } from '../apps/dashboard/lib/sage-people-payroll-store';
import type { DleEmployeeDirectoryRow } from '../apps/dashboard/lib/dle-enterprise-db';

const loadWorkspaceEnv = () => {
  for (const file of [path.resolve('.env'), path.resolve('apps/dashboard/.env')]) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[match[1]]) process.env[match[1]] = value;
    }
  }
};

const arg = (flag: string, fallback = '') => {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? String(process.argv[index + 1] || '') : fallback;
};

const round = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
const money = (value: number) => round(value).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const HOURS_PER_DAY = 8;
const ENGINE_MEAL_RATE = 500;

const directoryKeys = (employee: DleEmployeeDirectoryRow) =>
  [employee.employeeCode, employee.employeeId, (employee as { sourceEmployeeId?: string | null }).sourceEmployeeId, employee.fullName]
    .flatMap((value) => [String(value || '').trim(), normalizePayrollMatchKey(value)])
    .map((value) => value.toUpperCase())
    .filter(Boolean);

const directoryDailyRate = (employee: DleEmployeeDirectoryRow) => {
  const hoursPerDay = Number(employee.hoursPerDay || 8) || 8;
  const hoursPerPeriod = Number(employee.hoursPerPeriod || 0);
  const workingDays = hoursPerPeriod > 0 && hoursPerDay > 0 ? hoursPerPeriod / hoursPerDay : 22;
  const explicitDayRate = Number(employee.ratePerDay || 0);
  const explicitHourRate = Number(employee.ratePerHour || 0);
  const periodSalary = Number(employee.periodSalary || 0);
  if (explicitDayRate > 0) return explicitDayRate;
  if (explicitHourRate > 0) return explicitHourRate * hoursPerDay;
  if (periodSalary > 0) return periodSalary > 50000 ? periodSalary / workingDays : periodSalary;
  return 0;
};

const main = async () => {
  loadWorkspaceEnv();
  const period = arg('--period', '2026-08');
  const workbookPath = path.resolve(arg('--workbook', 'backups/Dayrate Payment Schedule/AUGUST 2026DAYRATE PAYMENT SCHEDULE .xlsx'));
  if (!fs.existsSync(workbookPath)) throw new Error(`Workbook not found: ${workbookPath}`);

  const parsed = parseDayratePaymentScheduleWorkbook(fs.readFileSync(workbookPath));
  const { employees } = await readPayrollEmployees();
  const byKey = new Map<string, DleEmployeeDirectoryRow>();
  for (const employee of employees) {
    for (const key of directoryKeys(employee)) if (!byKey.has(key)) byKey.set(key, employee);
  }

  let hrGross = 0;
  let engineGross = 0;
  let rateGap = 0;
  let mealGap = 0;
  let unmatched = 0;
  const rateMismatches: Array<{ code: string; name: string; hrRate: number; engineRate: number; impact: number }> = [];

  for (const row of parsed.rows) {
    const directory = byKey.get(row.employeeCode.toUpperCase())
      || byKey.get(normalizePayrollMatchKey(row.employeeCode).toUpperCase())
      || null;
    if (!directory || !isDailyRatePayrollEmployee(directory)) {
      unmatched += 1;
      continue;
    }

    const hrRate = Number(row.excelDailyRate || 0);
    const engineRate = directoryDailyRate(directory);
    const hoursPay = (rate: number) => {
      const hourly = rate / HOURS_PER_DAY;
      return hourly * (row.weekdayOvtHours * 1.5 + row.saturdayHours * 1.5 + row.sundayHours * 2 + row.publicHolidayHours * 2);
    };
    const hrEarn = row.weekdayDays * hrRate + hoursPay(hrRate);
    const engineEarn = row.weekdayDays * engineRate + hoursPay(engineRate);
    const hrMeal = Number(row.mealAllowance || 0);
    const engineMeal = row.weekdayDays * ENGINE_MEAL_RATE;
    const shared = row.nightAmt + row.siteAllowance + row.tcmMeal + row.tcmTransport + row.transport + row.arrears;

    hrGross += hrEarn + hrMeal + shared;
    engineGross += engineEarn + engineMeal + shared;
    rateGap += engineEarn - hrEarn;
    mealGap += engineMeal - hrMeal;

    if (Math.abs(engineRate - hrRate) > 0.5) {
      rateMismatches.push({
        code: row.employeeCode,
        name: row.employeeName,
        hrRate,
        engineRate,
        impact: round(engineEarn - hrEarn),
      });
    }
  }

  rateMismatches.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));

  // Daily-rate staff the engine can pay from timesheets but HR's workbook omits.
  // These inflate the card relative to the workbook no matter how the formulas align.
  const { buildTimesheetHoursMapForPayrollPeriod } = await import('../apps/dashboard/lib/timesheet-entry-store');
  const timesheetHours = await buildTimesheetHoursMapForPayrollPeriod(period, { ignoreDayrateScheduleOverride: true });
  const workbookKeys = new Set(parsed.rows.flatMap((row) => [row.employeeCode.toUpperCase(), normalizePayrollMatchKey(row.employeeCode).toUpperCase()]));
  const notInWorkbook: Array<{ code: string; name: string; days: number; estimate: number }> = [];
  for (const employee of employees) {
    if (!isDailyRatePayrollEmployee(employee)) continue;
    if (directoryKeys(employee).some((key) => workbookKeys.has(key))) continue;
    const hours = directoryKeys(employee).map((key) => timesheetHours.get(key)).find(Boolean) || null;
    const rate = directoryDailyRate(employee);
    const days = hours ? (hours.daysWorked > 0 ? hours.daysWorked : hours.bookedHours / HOURS_PER_DAY) : 0;
    if (days <= 0) continue;
    notInWorkbook.push({
      code: String(employee.employeeCode || employee.employeeId || ''),
      name: String(employee.fullName || ''),
      days: Math.round(days * 10) / 10,
      estimate: round(days * rate + days * ENGINE_MEAL_RATE),
    });
  }
  notInWorkbook.sort((a, b) => b.estimate - a.estimate);

  console.log(`Period: ${period}`);
  console.log(`Workbook: ${path.basename(workbookPath)} (${parsed.rows.length} rows, ${unmatched} not daily-rate/unmatched)`);
  console.log('');
  console.log(`HR schedule gross (workbook authority) : ${money(hrGross)}`);
  console.log(`Engine gross (card authority)          : ${money(engineGross)}`);
  console.log(`Difference                             : ${money(engineGross - hrGross)}`);
  console.log('');
  console.log('Decomposition of the difference');
  console.log(`  Daily-rate source (HRIS rate vs sheet rate) : ${money(rateGap)}`);
  console.log(`  Meal allowance (engine 500/day vs sheet)    : ${money(mealGap)}`);
  console.log('');
  console.log(`Employees with a daily-rate mismatch: ${rateMismatches.length}`);
  for (const row of rateMismatches.slice(0, 20)) {
    console.log(`  ${row.code.padEnd(8)} ${row.name.slice(0, 28).padEnd(30)} sheet ${money(row.hrRate).padStart(12)}  hris ${money(row.engineRate).padStart(12)}  impact ${money(row.impact).padStart(14)}`);
  }
  // Period earning adjustments live in the HRIS data dir, so this section is
  // only meaningful when the script runs where HR applied the overlay.
  const { periodEarningAdjustmentsForPeriod } = await import('../apps/dashboard/lib/payroll-period-earning-adjustments-store');
  const adjustments = await periodEarningAdjustmentsForPeriod(period);
  const dailyRateKeys = new Set(employees.filter((employee) => isDailyRatePayrollEmployee(employee)).flatMap(directoryKeys));
  const bySource = new Map<string, { amount: number; rows: number; codes: Set<string> }>();
  for (const row of adjustments) {
    const key = String(row.employeeCode || row.employeeId || '').trim().toUpperCase();
    if (!dailyRateKeys.has(key) && !dailyRateKeys.has(normalizePayrollMatchKey(key).toUpperCase())) continue;
    const source = String(row.source || 'Unspecified');
    const current = bySource.get(source) || { amount: 0, rows: 0, codes: new Set<string>() };
    current.amount += Number(row.amount || 0);
    current.rows += 1;
    current.codes.add(String(row.code || ''));
    bySource.set(source, current);
  }

  console.log('');
  console.log(`Period earning adjustments landing on daily-rate staff (${adjustments.length} total rows in period)`);
  if (!bySource.size) {
    console.log('  none visible here — run this on the server that holds the HRIS data dir');
  }
  for (const [source, value] of [...bySource.entries()].sort((a, b) => b[1].amount - a[1].amount)) {
    console.log(`  ${source.slice(0, 38).padEnd(40)} ${money(value.amount).padStart(16)}  rows ${String(value.rows).padStart(5)}  codes ${[...value.codes].join(',').slice(0, 60)}`);
  }

  console.log('');
  console.log(`Daily-rate staff with timesheet days but no workbook row: ${notInWorkbook.length}`);
  console.log(`  Estimated weekday + meal value not in the workbook: ${money(notInWorkbook.reduce((sum, row) => sum + row.estimate, 0))}`);
  for (const row of notInWorkbook.slice(0, 25)) {
    console.log(`  ${row.code.padEnd(8)} ${row.name.slice(0, 28).padEnd(30)} days ${String(row.days).padStart(6)}  est ${money(row.estimate).padStart(14)}`);
  }
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
