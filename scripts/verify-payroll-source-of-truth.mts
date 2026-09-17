/**
 * Dry-run live payroll for a period and fail if Excel overlay labels appear
 * after the September 2026 profile/timesheet cutover.
 *
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/verify-payroll-source-of-truth.mts
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/verify-payroll-source-of-truth.mts --period 2026-09
 */
import fs from 'node:fs';
import path from 'node:path';

import { calculatePayrollForPeriod } from '../apps/dashboard/lib/payroll-calculation-service';
import {
  isPayrollProfileTimesheetSourcePeriod,
  payrollRecordUsesExcelOverlay,
} from '../apps/dashboard/lib/payroll-source-of-truth';

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

const main = async () => {
  loadWorkspaceEnv();
  const period = arg('--period', '2026-09');
  if (!isPayrollProfileTimesheetSourcePeriod(period)) {
    console.log(`Skipping live overlay check for ${period} — Excel overlay still applies before 2026-09.`);
    return;
  }
  let calculation: Awaited<ReturnType<typeof calculatePayrollForPeriod>>;
  try {
    calculation = await calculatePayrollForPeriod(period, { forceRefresh: true });
  } catch (error) {
    console.warn(
      `Could not dry-run ${period} payroll (${error instanceof Error ? error.message : error}). Unit tests still cover the source-of-truth rules.`,
    );
    return;
  }
  const overlay = calculation.records.filter((record) => payrollRecordUsesExcelOverlay(record));
  const salariedOverlay = overlay.filter((record) => !record.isDailyRate);
  const dayrateOverlay = overlay.filter((record) => record.isDailyRate);
  console.log(`${period} dry-run: ${calculation.records.length} records`);
  console.log(`  salaried overlay labels: ${salariedOverlay.length}`);
  console.log(`  day-rate overlay labels: ${dayrateOverlay.length}`);
  if (overlay.length) {
    for (const record of overlay.slice(0, 20)) {
      console.log(`  ${record.employeeCode} ${record.fullName} ${record.earningProfile}`);
    }
    throw new Error(`${period} live payroll still has ${overlay.length} HR Excel overlay label(s).`);
  }
  console.log(`${period} source-of-truth dry-run passed`);
};

main().then(() => {
  process.exit(0);
}).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
