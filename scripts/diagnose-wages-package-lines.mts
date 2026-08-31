/**
 * Read-only: sum the HRIS configured salary-package earning lines that the payroll
 * engine adds to wages (daily-rate) employees on top of the HR Dayrate Payment
 * Schedule. These come from the employee record, not from period adjustments.
 *
 * Usage:
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/diagnose-wages-package-lines.mts \
 *     --period 2026-08 --workbook "backups/Dayrate Payment Schedule/AUGUST 2026DAYRATE PAYMENT SCHEDULE .xlsx"
 */
import fs from 'node:fs';
import path from 'node:path';

import { parseDayratePaymentScheduleWorkbook } from '../apps/dashboard/lib/dayrate-schedule-xlsx';
import { payrollLineMonthlyAmount, type StoredPayrollPackageLine } from '../apps/dashboard/lib/payroll-package-lines';
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

// Codes the schedule itself supplies — the engine derives or posts these, so a
// package line carrying the same code is deduped and does not add value.
const SCHEDULE_CODES = new Set([
  'JCWEEKDAY', 'JCWEEKDAY_NT', 'WEEKDAYOVT', 'SATEARN', 'SUNDAYEARN', 'PUBHOL',
  'MEAL', 'NIGHT_ALLOW', 'SITE_ALLOW', 'TCMMEAL', 'TCMTRANS', 'TRANSPORT', 'ARREARS',
]);

const directoryKeys = (employee: DleEmployeeDirectoryRow) =>
  [employee.employeeCode, employee.employeeId, (employee as { sourceEmployeeId?: string | null }).sourceEmployeeId, employee.fullName]
    .flatMap((value) => [String(value || '').trim(), normalizePayrollMatchKey(value)])
    .map((value) => value.toUpperCase())
    .filter(Boolean);

const main = async () => {
  loadWorkspaceEnv();
  const workbookPath = path.resolve(arg('--workbook', 'backups/Dayrate Payment Schedule/AUGUST 2026DAYRATE PAYMENT SCHEDULE .xlsx'));
  const parsed = parseDayratePaymentScheduleWorkbook(fs.readFileSync(workbookPath));
  const { employees } = await readPayrollEmployees();

  const byKey = new Map<string, DleEmployeeDirectoryRow>();
  for (const employee of employees) {
    for (const key of directoryKeys(employee)) if (!byKey.has(key)) byKey.set(key, employee);
  }

  const byCode = new Map<string, { amount: number; rows: number; name: string }>();
  const perEmployee: Array<{ code: string; name: string; amount: number; codes: string[] }> = [];
  let total = 0;

  for (const row of parsed.rows) {
    const employee = byKey.get(row.employeeCode.toUpperCase())
      || byKey.get(normalizePayrollMatchKey(row.employeeCode).toUpperCase())
      || null;
    if (!employee) continue;
    const lines = (employee.sagePayrollEarnings || []) as StoredPayrollPackageLine[];
    let employeeTotal = 0;
    const codes: string[] = [];
    for (const line of lines) {
      const code = String(line.code || '').trim().toUpperCase();
      const amount = payrollLineMonthlyAmount(line);
      if (amount === 0) continue;
      if (SCHEDULE_CODES.has(code)) continue;
      employeeTotal += amount;
      codes.push(`${code}:${Math.round(amount)}`);
      const current = byCode.get(code) || { amount: 0, rows: 0, name: String(line.name || '') };
      current.amount += amount;
      current.rows += 1;
      byCode.set(code, current);
    }
    if (employeeTotal !== 0) {
      total += employeeTotal;
      perEmployee.push({ code: row.employeeCode, name: row.employeeName, amount: employeeTotal, codes });
    }
  }

  perEmployee.sort((a, b) => b.amount - a.amount);

  console.log(`Workbook rows: ${parsed.rows.length}`);
  console.log(`Wages employees carrying HRIS package earning lines beyond the schedule: ${perEmployee.length}`);
  console.log(`Total added to engine gross by those lines: ${money(total)}`);
  console.log('');
  console.log('By earning code');
  for (const [code, value] of [...byCode.entries()].sort((a, b) => b[1].amount - a[1].amount)) {
    console.log(`  ${code.padEnd(18)} ${money(value.amount).padStart(16)}  employees ${String(value.rows).padStart(4)}  ${value.name.slice(0, 28)}`);
  }
  console.log('');
  console.log('Largest employees');
  for (const row of perEmployee.slice(0, 25)) {
    console.log(`  ${row.code.padEnd(8)} ${row.name.slice(0, 24).padEnd(26)} ${money(row.amount).padStart(14)}  ${row.codes.join(' ').slice(0, 60)}`);
  }
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
