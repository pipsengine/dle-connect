/**
 * Compare August salary schedule Excel vs live HRIS salaried payroll calculation.
 *
 * Usage:
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/diagnose-salary-schedule-vs-hris.mts \
 *     --period 2026-08 --workbook "backups/Dayrate Payment Schedule/DLE_AUGUST 2026 SALARY SCHEDULE.xlsx"
 */
import fs from 'node:fs';
import path from 'node:path';

import { calculatePayrollForPeriod } from '../apps/dashboard/lib/payroll-calculation-service';
import { parseSalaryScheduleWorkbook, salaryScheduleEmployeeKeys } from '../apps/dashboard/lib/salary-schedule-xlsx';
import { resolvePayCurrency } from '../apps/dashboard/lib/payroll-currency';

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

const main = async () => {
  loadWorkspaceEnv();
  const period = arg('--period', '2026-08');
  const workbookPath = path.resolve(arg('--workbook', 'backups/Dayrate Payment Schedule/DLE_AUGUST 2026 SALARY SCHEDULE.xlsx'));
  if (!fs.existsSync(workbookPath)) throw new Error(`Workbook not found: ${workbookPath}`);

  const parsed = parseSalaryScheduleWorkbook(fs.readFileSync(workbookPath));
  const calculation = await calculatePayrollForPeriod(period, { pack: 'salaried', forceRefresh: true });
  const records = calculation.records || [];

  const recordByKey = new Map<string, (typeof records)[number]>();
  for (const record of records) {
    for (const key of salaryScheduleEmployeeKeys(String(record.employeeCode || record.employeeId || ''))) {
      if (!recordByKey.has(key)) recordByKey.set(key, record);
    }
  }

  const ngnExcel = [...parsed.byKind.perm, ...parsed.byKind.cont];
  const usdExcel = parsed.byKind.usd;
  const ngnRecords = records.filter((record) => resolvePayCurrency(record) !== 'USD');
  const usdRecords = records.filter((record) => resolvePayCurrency(record) === 'USD');

  console.log(`Period: ${period}`);
  console.log(`Workbook: ${path.basename(workbookPath)}`);
  console.log('');
  console.log('Excel summary');
  console.log(`  PERM  ${String(parsed.summary.permCount).padStart(4)} staff  gross ${money(parsed.summary.permGross)}  net ${money(parsed.summary.permNet)}`);
  console.log(`  CONT  ${String(parsed.summary.contCount).padStart(4)} staff  gross ${money(parsed.summary.contGross)}  net ${money(parsed.summary.contNet)}`);
  console.log(`  USD   ${String(parsed.summary.usdCount).padStart(4)} staff  gross ${money(parsed.summary.usdGross)}  net ${money(parsed.summary.usdNet)}`);
  console.log(`  NGN total (perm+cont) gross ${money(parsed.summary.permGross + parsed.summary.contGross)}  net ${money(parsed.summary.permNet + parsed.summary.contNet)}`);
  console.log('');
  console.log('HRIS salaried pack');
  console.log(`  all    ${String(records.length).padStart(4)} staff  gross ${money(Number(calculation.summary?.grossPay || 0))}  net ${money(Number(calculation.summary?.netPay || 0))}`);
  console.log(`  NGN    ${String(ngnRecords.length).padStart(4)} staff  gross ${money(ngnRecords.reduce((s, r) => s + Number(r.grossPay || 0), 0))}  net ${money(ngnRecords.reduce((s, r) => s + Number(r.netPay || 0), 0))}`);
  console.log(`  USD    ${String(usdRecords.length).padStart(4)} staff  gross ${money(usdRecords.reduce((s, r) => s + Number(r.grossPay || 0), 0))}  net ${money(usdRecords.reduce((s, r) => s + Number(r.netPay || 0), 0))}`);

  const compareSet = (label: string, excelRows: typeof ngnExcel, currency: 'NGN' | 'USD') => {
    const deltas: Array<{ code: string; name: string; excelGross: number; hrisGross: number; excelNet: number; hrisNet: number; status: string }> = [];
    const matched = new Set<string>();
    const currencyRecords = records.filter((record) => (resolvePayCurrency(record) === 'USD') === (currency === 'USD'));
    const currencyIndex = new Map<string, (typeof records)[number]>();
    for (const record of currencyRecords) {
      for (const key of salaryScheduleEmployeeKeys(String(record.employeeCode || record.employeeId || ''))) {
        if (!currencyIndex.has(key)) currencyIndex.set(key, record);
      }
    }
    for (const row of excelRows) {
      const record = salaryScheduleEmployeeKeys(row.employeeCode).map((key) => currencyIndex.get(key)).find(Boolean) || null;
      if (!record) {
        deltas.push({ code: row.employeeCode, name: row.employeeName, excelGross: row.grossPay, hrisGross: 0, excelNet: row.netPay, hrisNet: 0, status: 'Excel only' });
        continue;
      }
      matched.add(String(record.employeeCode || record.employeeId || '').toUpperCase());
      const hrisGross = Number(record.grossPay || 0);
      const hrisNet = Number(record.netPay || 0);
      if (Math.abs(hrisGross - row.grossPay) > 1 || Math.abs(hrisNet - row.netPay) > 1) {
        deltas.push({
          code: row.employeeCode,
          name: row.employeeName,
          excelGross: row.grossPay,
          hrisGross,
          excelNet: row.netPay,
          hrisNet,
          status: 'Mismatch',
        });
      }
    }
    for (const record of currencyRecords) {
      const code = String(record.employeeCode || record.employeeId || '').toUpperCase();
      if (matched.has(code)) continue;
      if (Number(record.grossPay || 0) <= 0) continue;
      deltas.push({
        code,
        name: String(record.fullName || ''),
        excelGross: 0,
        hrisGross: Number(record.grossPay || 0),
        excelNet: 0,
        hrisNet: Number(record.netPay || 0),
        status: 'HRIS only',
      });
    }
    deltas.sort((a, b) => Math.abs(b.hrisGross - b.excelGross) - Math.abs(a.hrisGross - a.excelGross));
    const excelGross = excelRows.reduce((s, r) => s + r.grossPay, 0);
    const excelNet = excelRows.reduce((s, r) => s + r.netPay, 0);
    const matchedRecords = excelRows
      .map((row) => salaryScheduleEmployeeKeys(row.employeeCode).map((key) => currencyIndex.get(key)).find(Boolean))
      .filter(Boolean) as typeof records;
    const hrisGross = matchedRecords.reduce((s, r) => s + Number(r.grossPay || 0), 0);
    const hrisNet = matchedRecords.reduce((s, r) => s + Number(r.netPay || 0), 0);
    console.log('');
    console.log(`${label}`);
    console.log(`  excel staff/gross/net: ${excelRows.length} / ${money(excelGross)} / ${money(excelNet)}`);
    console.log(`  hris  matched gross/net: ${matchedRecords.length} / ${money(hrisGross)} / ${money(hrisNet)}`);
    console.log(`  delta gross/net: ${money(hrisGross - excelGross)} / ${money(hrisNet - excelNet)}`);
    console.log(`  differences: ${deltas.length} (excel-only ${deltas.filter((d) => d.status === 'Excel only').length}, hris-only ${deltas.filter((d) => d.status === 'HRIS only').length}, mismatch ${deltas.filter((d) => d.status === 'Mismatch').length})`);
    for (const row of deltas.slice(0, 35)) {
      console.log(
        `  ${row.status.padEnd(10)} ${row.code.padEnd(8)} ${row.name.slice(0, 24).padEnd(26)} excel ${money(row.excelGross).padStart(14)}  hris ${money(row.hrisGross).padStart(14)}  dGross ${money(row.hrisGross - row.excelGross).padStart(14)}`,
      );
    }
    if (deltas.length > 35) console.log(`  ... ${deltas.length - 35} more`);
    return deltas;
  };

  compareSet('NGN (PERM + CONT)', ngnExcel, 'NGN');
  compareSet('USD REPORT', usdExcel, 'USD');
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
