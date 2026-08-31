/**
 * Store an HR Dayrate Payment Schedule workbook in DLE_Enterprise as the applied
 * upload for a period. Used to restore a period whose upload was lost with the old
 * file-based storage, or to load a signed workbook without going through the UI.
 *
 * Dry run:
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/import-dayrate-schedule-upload.mts \
 *     --period 2026-08 --workbook "backups/Dayrate Payment Schedule/AUGUST 2026DAYRATE PAYMENT SCHEDULE .xlsx"
 *
 * Apply: add --apply
 */
import fs from 'node:fs';
import path from 'node:path';

import { parseDayratePaymentScheduleWorkbook } from '../apps/dashboard/lib/dayrate-schedule-xlsx';
import {
  readActiveDayrateScheduleUploadFromSql,
  saveDayrateScheduleUploadToSql,
} from '../apps/dashboard/lib/dayrate-schedule-upload-sql';

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
  const period = arg('--period');
  const workbookPath = arg('--workbook');
  const actor = arg('--actor', 'HR (restored from backup)');
  const apply = process.argv.includes('--apply');
  if (!period || !workbookPath) throw new Error('Pass --period <YYYY-MM> and --workbook <path>.');

  const resolved = path.resolve(workbookPath);
  if (!fs.existsSync(resolved)) throw new Error(`Workbook not found: ${resolved}`);
  const workbook = fs.readFileSync(resolved);
  const parsed = parseDayratePaymentScheduleWorkbook(workbook);
  const gross = parsed.rows.reduce((sum, row) => sum + Number(row.excelGross || 0), 0);
  const net = parsed.rows.reduce((sum, row) => sum + Number(row.excelNet || 0), 0);

  const existing = await readActiveDayrateScheduleUploadFromSql(period);

  console.log(`Period    : ${period}`);
  console.log(`Workbook  : ${path.basename(resolved)}`);
  console.log(`Title     : ${parsed.title}`);
  console.log(`Rows      : ${parsed.rows.length} (${parsed.skipped.length} skipped)`);
  console.log(`Sheets    : ${parsed.sheets.map((sheet) => `${sheet.name}/${sheet.company}:${sheet.rowCount}`).join(', ')}`);
  console.log(`Gross     : ${money(gross)}`);
  console.log(`Net       : ${money(net)}`);
  console.log(`Currently stored: ${existing ? `${existing.rows.length} rows applied ${existing.appliedAt} by ${existing.appliedBy}` : 'none'}`);
  console.log(`Mode      : ${apply ? 'APPLY' : 'DRY RUN'}`);

  if (!apply) {
    console.log('');
    console.log('Dry run only. Re-run with --apply to store this upload.');
    process.exit(0);
  }

  const saved = await saveDayrateScheduleUploadToSql({
    period,
    fileName: path.basename(resolved),
    title: parsed.title,
    appliedAt: new Date().toISOString(),
    appliedBy: actor,
    rows: parsed.rows,
    skipped: parsed.skipped,
    sheets: parsed.sheets,
    workbook,
  });

  const verify = await readActiveDayrateScheduleUploadFromSql(period);
  console.log('');
  console.log(`Stored upload ${saved.uploadId} with ${saved.rowCount} rows.`);
  console.log(`Read back  : ${verify?.rows.length ?? 0} rows, gross ${money(verify?.rows.reduce((sum, row) => sum + Number(row.excelGross || 0), 0) ?? 0)}`);
  console.log('Re-run the period\'s daily-rate payroll so the run picks up the stored upload.');
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
