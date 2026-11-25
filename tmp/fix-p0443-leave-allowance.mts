import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const loadEnvFile = (filePath: string) => {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim().replace(/^\uFEFF/, '');
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
};
[
  path.join(repo, 'apps/dashboard/.env.local'),
  path.join(repo, 'apps/dashboard/.env'),
  path.join(repo, '.env.local'),
  path.join(repo, '.env'),
].forEach(loadEnvFile);

const {
  readPayrollLeaveAllowanceEvents,
  writePayrollLeaveAllowanceEvents,
} = await import('../apps/dashboard/lib/payroll-leave-allowance-store.ts');
const { isCountableLeaveAllowanceEvent, employeeMatchKeys } = await import('../apps/dashboard/lib/leave-allowance-policy.ts');
const { normalizePayrollMatchKey } = await import('../apps/dashboard/lib/sage-people-payroll-store.ts');
const { readEmployeeDirectoryFromDb } = await import('../apps/dashboard/lib/dle-enterprise-db.ts');
const { calculateAnnualLeaveAllowanceAmount, calculatePayrollEarnings } = await import('../apps/dashboard/lib/payroll-earnings-engine.ts');
const { buildEntitlementSnapshot } = await import('../apps/dashboard/lib/final-entitlement-sheet.ts');

const now = new Date().toISOString();
const targetKeys = new Set(['443', 'P0443', '0443'].map(normalizePayrollMatchKey));

const events = await readPayrollLeaveAllowanceEvents();
const before = events.filter((event) =>
  [event.employeeId, event.employeeCode].map(normalizePayrollMatchKey).some((key) => targetKeys.has(key)),
);
console.log('BEFORE', JSON.stringify(before.map((e) => ({
  id: e.id,
  employeeCode: e.employeeCode,
  period: e.period,
  leaveYear: e.leaveYear,
  amount: e.amount,
  status: e.status,
  countable: isCountableLeaveAllowanceEvent(e),
  auditActions: (e.audit || []).map((a) => a.action),
})), null, 2));

let changed = 0;
const next = events.map((event) => {
  const keys = [event.employeeId, event.employeeCode].map(normalizePayrollMatchKey).filter(Boolean);
  if (!keys.some((key) => targetKeys.has(key))) return event;
  if (event.leaveType !== 'Annual Leave' || !/LEAVEALLOW/i.test(event.code)) return event;

  const cleanedAudit = (event.audit || []).filter(
    (entry) => !/reversed ineligible/i.test(`${entry.action || ''} ${entry.note || ''}`),
  );
  const restored = {
    ...event,
    employeeId: 'P0443',
    employeeCode: 'P0443',
    fullName: event.fullName || 'Mr OSIREGBEMHE SOLOMON ALEX',
    status: 'Paid' as const,
    updatedAt: now,
    audit: [
      ...cleanedAudit,
      {
        at: now,
        actor: 'Final Payroll Prep',
        action: 'Restored Sage-paid leave allowance',
        note: 'Employee collected leave allowance in Sage before migration. Cleared false ineligible reversal so Final Payroll treats 2026 allowance as already paid.',
      },
    ],
  };
  changed += 1;
  return restored;
});

if (!changed) {
  console.error('No P0443 leave-allowance events found to restore');
  process.exit(1);
}

await writePayrollLeaveAllowanceEvents(next, { required: true });

const afterEvents = await readPayrollLeaveAllowanceEvents();
const after = afterEvents.filter((event) =>
  [event.employeeId, event.employeeCode].map(normalizePayrollMatchKey).some((key) => targetKeys.has(key)),
);
console.log('AFTER', JSON.stringify(after.map((e) => ({
  id: e.id,
  employeeCode: e.employeeCode,
  period: e.period,
  leaveYear: e.leaveYear,
  amount: e.amount,
  status: e.status,
  countable: isCountableLeaveAllowanceEvent(e),
  lastAudit: (e.audit || []).slice(-1)[0],
})), null, 2));

const employees = (await readEmployeeDirectoryFromDb()) || [];
const employee = employees.find((row) => String(row.employeeCode || '').toUpperCase() === 'P0443');
if (!employee) {
  console.error('Directory employee P0443 not found');
  process.exit(1);
}

const leaveYear = 2026;
const keys = employeeMatchKeys(employee.employeeId, employee.employeeCode || employee.sourceEmployeeId);
const paid = afterEvents.find((event) => {
  if (event.leaveYear !== leaveYear || event.leaveType !== 'Annual Leave') return false;
  if (!isCountableLeaveAllowanceEvent(event)) return false;
  const eventKeys = [event.employeeId, event.employeeCode].map(normalizePayrollMatchKey).filter(Boolean);
  return eventKeys.some((key) => keys.includes(key));
});
const fromPackage = calculatePayrollEarnings(employee).annualBenefitLines.find((line) =>
  /leave/i.test(`${line.code} ${line.name}`),
);
const annual = Number(paid?.amount || 0)
  || Number(fromPackage?.amount || 0)
  || calculateAnnualLeaveAllowanceAmount(employee);

const entitlement = buildEntitlementSnapshot({
  lastWorkingDay: '2026-11-30',
  dateOfJoining: employee.dateJoined || '2025-01-13',
  leaveYear,
  annualLeaveAllowance: annual,
  leaveAllowancePaid: Boolean(paid) && annual > 0,
});

console.log('FINAL_PAYROLL_CHECK', JSON.stringify({
  employee: {
    code: employee.employeeCode,
    name: employee.fullName,
    status: employee.status,
    dateJoined: employee.dateJoined,
    department: employee.department,
    jobTitle: employee.jobTitle,
  },
  paidEvent: paid ? { id: paid.id, period: paid.period, amount: paid.amount, status: paid.status } : null,
  annualLeaveAllowance: annual,
  entitlement,
}, null, 2));

process.exit(0);
