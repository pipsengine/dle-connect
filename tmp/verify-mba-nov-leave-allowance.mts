import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const rel of ['apps/dashboard/.env.local', 'apps/dashboard/.env', '.env.local', '.env']) {
  const filePath = path.join(repo, rel);
  if (!fs.existsSync(filePath)) continue;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let value = t.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}

const {
  readPayrollLeaveAllowanceEvents,
  leaveAllowanceEventsForEmployeePeriod,
} = await import('../apps/dashboard/lib/payroll-leave-allowance-store.ts');
const { readEmployeeDirectoryFromDb } = await import('../apps/dashboard/lib/dle-enterprise-db.ts');
const { calculatePayrollEarnings } = await import('../apps/dashboard/lib/payroll-earnings-engine.ts');

const events = await readPayrollLeaveAllowanceEvents();
const mba = events.find((e) => e.id === 'ess-2026-80-SAGELEAVETX1042');
const employees = (await readEmployeeDirectoryFromDb()) || [];
const emp = employees.find((e) => String(e.employeeCode || '').toUpperCase() === 'P0080');
if (!emp) {
  console.error('P0080 missing');
  process.exit(1);
}

const nov = leaveAllowanceEventsForEmployeePeriod(emp, '2026-11');
const aug = leaveAllowanceEventsForEmployeePeriod(emp, '2026-08');
const earnings = calculatePayrollEarnings(emp, {
  period: '2026-11',
  useHrisPackageLines: true,
  includePeriodAdjustments: true,
});
const paid = earnings.paidEarningLines || earnings.earningLines || [];
const leaveLines = paid.filter((line) => /LEAVEALLOW|leave allowance/i.test(`${line.code} ${line.name}`));

console.log(JSON.stringify({
  event: { id: mba?.id, period: mba?.period, amount: mba?.amount, status: mba?.status },
  novEvents: nov.map((e) => ({ id: e.id, period: e.period, amount: e.amount, status: e.status })),
  augEvents: aug.map((e) => ({ id: e.id, period: e.period, amount: e.amount, status: e.status })),
  novemberLeaveLines: leaveLines,
  paidCount: paid.length,
  grossPay: earnings.grossPay,
  taxablePay: earnings.taxablePay,
}, null, 2));
