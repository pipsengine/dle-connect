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
  writePayrollLeaveAllowanceEvents,
  leaveAllowanceEventsForEmployeePeriod,
} = await import('../apps/dashboard/lib/payroll-leave-allowance-store.ts');
const { isCountableLeaveAllowanceEvent } = await import('../apps/dashboard/lib/leave-allowance-policy.ts');
const { normalizePayrollMatchKey } = await import('../apps/dashboard/lib/sage-people-payroll-store.ts');
const { readEmployeeDirectoryFromDb } = await import('../apps/dashboard/lib/dle-enterprise-db.ts');
const { calculatePayrollEarnings } = await import('../apps/dashboard/lib/payroll-earnings-engine.ts');

const EVENT_ID = 'ess-2026-80-SAGELEAVETX1042';
const TARGET_PERIOD = '2026-11';
const now = new Date().toISOString();

const events = await readPayrollLeaveAllowanceEvents();
const before = events.find((e) => e.id === EVENT_ID);
if (!before) {
  console.error('Event not found', EVENT_ID);
  process.exit(1);
}

console.log('BEFORE', JSON.stringify({
  id: before.id,
  employeeCode: before.employeeCode,
  period: before.period,
  leaveYear: before.leaveYear,
  amount: before.amount,
  status: before.status,
  countable: isCountableLeaveAllowanceEvent(before),
}, null, 2));

const next = events.map((event) => {
  if (event.id !== EVENT_ID) return event;
  return {
    ...event,
    employeeId: 'P0080',
    employeeCode: 'P0080',
    fullName: event.fullName || 'Mr. OKORIE UDO MBA',
    period: TARGET_PERIOD,
    status: 'Approved' as const,
    updatedAt: now,
    audit: [
      ...(event.audit || []),
      {
        at: now,
        actor: 'HR Payroll Request',
        action: 'Moved unpaid leave allowance to current payroll month',
        note: `Sage leave ${event.requestId || 'sage-leave-tx-1042'} (18 days from 2026-08-24) was approved but leave allowance was not paid in ${event.period}. Retargeted payable period to ${TARGET_PERIOD} per HR.`,
      },
    ],
  };
});

await writePayrollLeaveAllowanceEvents(next, { required: true });

const afterEvents = await readPayrollLeaveAllowanceEvents();
const after = afterEvents.find((e) => e.id === EVENT_ID);
console.log('AFTER', JSON.stringify({
  id: after?.id,
  employeeCode: after?.employeeCode,
  period: after?.period,
  amount: after?.amount,
  status: after?.status,
  countable: after ? isCountableLeaveAllowanceEvent(after) : false,
  lastAudit: (after?.audit || []).slice(-1)[0],
}, null, 2));

const employees = (await readEmployeeDirectoryFromDb()) || [];
const employee = employees.find((row) => String(row.employeeCode || '').toUpperCase() === 'P0080');
if (!employee) {
  console.error('Employee P0080 not found in directory');
  process.exit(1);
}

const novEvents = leaveAllowanceEventsForEmployeePeriod(employee, TARGET_PERIOD);
const augEvents = leaveAllowanceEventsForEmployeePeriod(employee, '2026-08');
const earnings = calculatePayrollEarnings(employee, { period: TARGET_PERIOD, useHrisPackageLines: true });
const leaveLines = earnings.lines.filter((line) => /LEAVEALLOW|leave allowance/i.test(`${line.code} ${line.name}`));

console.log('PAYROLL_CHECK', JSON.stringify({
  employee: { code: employee.employeeCode, name: employee.fullName, status: employee.status },
  novEvents: novEvents.map((e) => ({ id: e.id, period: e.period, amount: e.amount, status: e.status })),
  augEvents: augEvents.map((e) => ({ id: e.id, period: e.period, amount: e.amount, status: e.status })),
  novemberLeaveLines: leaveLines,
  novemberGross: earnings.gross,
}, null, 2));

process.exit(0);
