/**
 * Store a DLE Salary Schedule workbook in DLE_Enterprise as the applied salaried
 * upload for a period (August 2026 only — later months use HRIS payroll setup).
 *
 * Dry run:
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/import-salary-schedule-upload.mts \
 *     --period 2026-08 --workbook "backups/Dayrate Payment Schedule/DLE_AUGUST 2026 SALARY SCHEDULE.xlsx"
 *
 * Apply: add --apply
 */
import fs from 'node:fs';
import path from 'node:path';

import { parseSalaryScheduleWorkbook } from '../apps/dashboard/lib/salary-schedule-xlsx';
import {
  readActiveSalaryScheduleUploadFromSql,
  saveSalaryScheduleUploadToSql,
} from '../apps/dashboard/lib/salary-schedule-upload-sql';

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

const money = (value: number) => Number(value || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const main = async () => {
  loadWorkspaceEnv();
  const period = arg('--period', '2026-08');
  const workbookPath = arg('--workbook', 'backups/Dayrate Payment Schedule/DLE_AUGUST 2026 SALARY SCHEDULE.xlsx');
  const actor = arg('--actor', 'HR (restored from backup)');
  const apply = process.argv.includes('--apply');
  const resolved = path.resolve(workbookPath);
  if (!fs.existsSync(resolved)) throw new Error(`Workbook not found: ${resolved}`);

  const workbook = fs.readFileSync(resolved);
  const parsed = parseSalaryScheduleWorkbook(workbook);
  const existing = await readActiveSalaryScheduleUploadFromSql(period);

  console.log(`Period    : ${period}`);
  console.log(`Workbook  : ${path.basename(resolved)}`);
  console.log(`PERM      : ${parsed.summary.permCount}  gross ${money(parsed.summary.permGross)}  net ${money(parsed.summary.permNet)}`);
  console.log(`CONT      : ${parsed.summary.contCount}  gross ${money(parsed.summary.contGross)}  net ${money(parsed.summary.contNet)}`);
  console.log(`USD       : ${parsed.summary.usdCount}  gross ${money(parsed.summary.usdGross)}  net ${money(parsed.summary.usdNet)}`);
  console.log(`NGN total : ${money(parsed.summary.permGross + parsed.summary.contGross)} / ${money(parsed.summary.permNet + parsed.summary.contNet)}`);
  console.log(`Currently stored: ${existing ? `${existing.parsed.rows.length} rows applied ${existing.appliedAt} by ${existing.appliedBy}` : 'none'}`);
  console.log(`Mode      : ${apply ? 'APPLY' : 'DRY RUN'}`);

  if (!apply) {
    console.log('\nDry run only. Re-run with --apply to store this upload.');
    process.exit(0);
  }

  const saved = await saveSalaryScheduleUploadToSql({
    period,
    fileName: path.basename(resolved),
    title: 'DLE August 2026 Salary Schedule',
    appliedAt: new Date().toISOString(),
    appliedBy: actor,
    parsed,
    workbook,
  });
  const verify = await readActiveSalaryScheduleUploadFromSql(period);
  console.log(`\nStored upload ${saved.uploadId} with ${verify?.parsed.rows.length ?? 0} rows.`);
  try {
    const { persistAppliedPayrollSchedulesToHris } = await import('../apps/dashboard/lib/payroll-schedule-hris-persist');
    const persist = await persistAppliedPayrollSchedulesToHris(period);
    console.log(`HRIS packages saved: ${persist.saved} employees (${persist.skipped} skipped).`);
  } catch (error) {
    console.warn('Stored the upload but could not copy packages onto HRIS employees:', error);
  }
  console.log('Re-run the August salaried payroll so the cards pick up the stored schedule.');
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
