/**
 * Read-only: run the real payroll calculation for the wages (daily-rate) pack and
 * break the gross down by earning code, then compare it against the HR Dayrate
 * Payment Schedule workbook so the card total and the Excel total can be lined up.
 *
 * Usage:
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/diagnose-wages-engine-total.mts \
 *     --period 2026-08 --workbook "backups/Dayrate Payment Schedule/AUGUST 2026DAYRATE PAYMENT SCHEDULE .xlsx"
 */
import fs from 'node:fs';
import path from 'node:path';

import { parseDayratePaymentScheduleWorkbook } from '../apps/dashboard/lib/dayrate-schedule-xlsx';
import { calculatePayrollForPeriod } from '../apps/dashboard/lib/payroll-calculation-service';
import { normalizePayrollMatchKey } from '../apps/dashboard/lib/sage-people-payroll-store';

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
  const workbookPath = path.resolve(arg('--workbook', 'backups/Dayrate Payment Schedule/AUGUST 2026DAYRATE PAYMENT SCHEDULE .xlsx'));

  const calculation = await calculatePayrollForPeriod(period, { pack: 'daily-rate', forceRefresh: true });
  const records = calculation.records || [];

  const byCode = new Map<string, { amount: number; rows: number; name: string }>();
  let gross = 0;
  let net = 0;
  let deductions = 0;
  for (const record of records) {
    gross += Number(record.grossPay || 0);
    net += Number(record.netPay || 0);
    deductions += Number(record.totalDeductions ?? record.deductions ?? 0);
    for (const line of (record.earningLines || []) as Array<{ code?: string; name?: string; amount?: number }>) {
      const code = String(line.code || 'UNCODED').toUpperCase();
      const current = byCode.get(code) || { amount: 0, rows: 0, name: String(line.name || '') };
      current.amount += Number(line.amount || 0);
      current.rows += 1;
      byCode.set(code, current);
    }
  }

  console.log(`Period ${period} — wages (daily-rate) pack from the live calculation`);
  console.log(`  employees   : ${records.length}`);
  console.log(`  gross       : ${money(gross)}`);
  console.log(`  deductions  : ${money(deductions)}`);
  console.log(`  net         : ${money(net)}`);
  console.log(`  summary gross/net: ${money(Number(calculation.summary?.grossPay || 0))} / ${money(Number(calculation.summary?.netPay || 0))}`);
  console.log('');
  console.log('Engine gross by earning code');
  for (const [code, value] of [...byCode.entries()].sort((a, b) => b[1].amount - a[1].amount)) {
    console.log(`  ${code.padEnd(18)} ${money(value.amount).padStart(16)}  rows ${String(value.rows).padStart(5)}  ${value.name.slice(0, 30)}`);
  }

  if (fs.existsSync(workbookPath)) {
    const parsed = parseDayratePaymentScheduleWorkbook(fs.readFileSync(workbookPath));
    const sheetGross = parsed.rows.reduce((sum, row) => sum + Number(row.excelGross || 0), 0);
    const sheetNet = parsed.rows.reduce((sum, row) => sum + Number(row.excelNet || 0), 0);
    console.log('');
    console.log(`HR workbook (${parsed.rows.length} rows): gross ${money(sheetGross)}  net ${money(sheetNet)}`);
    console.log(`Engine minus workbook: gross ${money(gross - sheetGross)}  net ${money(net - sheetNet)}`);

    const sheetByCode = new Map<string, number>(Object.entries({
      WEEKDAY: parsed.rows.reduce((sum, row) => sum + row.weekdayDays * row.excelDailyRate, 0),
      MEAL: parsed.rows.reduce((sum, row) => sum + row.mealAllowance, 0),
      NIGHT: parsed.rows.reduce((sum, row) => sum + row.nightAmt, 0),
      TRANSPORT: parsed.rows.reduce((sum, row) => sum + row.transport, 0),
      SITE: parsed.rows.reduce((sum, row) => sum + row.siteAllowance, 0),
      TCMMEAL: parsed.rows.reduce((sum, row) => sum + row.tcmMeal, 0),
      TCMTRANS: parsed.rows.reduce((sum, row) => sum + row.tcmTransport, 0),
      ARREARS: parsed.rows.reduce((sum, row) => sum + row.arrears, 0),
    }));
    console.log('');
    console.log('HR workbook by component');
    for (const [code, amount] of sheetByCode.entries()) {
      console.log(`  ${code.padEnd(18)} ${money(amount).padStart(16)}`);
    }

    // Per-employee gross comparison, biggest offenders first.
    const sheetKeys = new Map<string, number>();
    for (const row of parsed.rows) {
      const gross = Number(row.excelGross || 0);
      sheetKeys.set(row.employeeCode.toUpperCase(), gross);
      sheetKeys.set(normalizePayrollMatchKey(row.employeeCode).toUpperCase(), gross);
    }
    const deltas: Array<{ code: string; name: string; engine: number; sheet: number | null }> = [];
    for (const record of records) {
      const key = String(record.employeeCode || record.employeeId || '').toUpperCase();
      const sheet = sheetKeys.has(key)
        ? sheetKeys.get(key)!
        : sheetKeys.get(normalizePayrollMatchKey(key).toUpperCase()) ?? null;
      const engine = Number(record.grossPay || 0);
      if (sheet === null || Math.abs(engine - sheet) > 1) {
        deltas.push({ code: key, name: String(record.fullName || ''), engine, sheet });
      }
    }
    deltas.sort((a, b) => Math.abs(b.engine - (b.sheet ?? 0)) - Math.abs(a.engine - (a.sheet ?? 0)));
    console.log('');
    console.log(`Employees whose engine gross differs from the workbook: ${deltas.length}`);
    for (const row of deltas.slice(0, 30)) {
      const sheet = row.sheet === null ? 'not in workbook' : money(row.sheet);
      console.log(`  ${row.code.padEnd(8)} ${row.name.slice(0, 26).padEnd(28)} engine ${money(row.engine).padStart(14)}  sheet ${String(sheet).padStart(16)}`);
    }
  }
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
