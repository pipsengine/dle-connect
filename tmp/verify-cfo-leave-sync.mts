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
  path.join(repo, 'deployment/iis/site/apps/dashboard/.env'),
].forEach(loadEnvFile);

const { readEmployeeDirectoryFromDb } = await import('../apps/dashboard/lib/dle-enterprise-db.ts');
const {
  isConfirmedPermanent,
  annualLeaveEntitlementForEmployee,
  readEmployeeLeaveSnapshot,
} = await import('../apps/dashboard/lib/leave-management-store.ts');

const employees = (await readEmployeeDirectoryFromDb()) || [];
const emp = employees.find((row) => String(row.employeeCode || '').toUpperCase() === 'P0458');
if (!emp) {
  console.error('P0458 not found in employee directory');
  process.exit(1);
}

const before = {
  employeeId: emp.employeeId,
  employeeCode: emp.employeeCode,
  fullName: emp.fullName,
  status: emp.status,
  employmentType: emp.employmentType,
  dateJoined: emp.dateJoined,
  confirmationDueDate: emp.confirmationDueDate,
  probationEndDate: emp.probationEndDate,
  jobGrade: emp.jobGrade,
  department: emp.department,
  isConfirmedPermanent: isConfirmedPermanent(emp),
  calculatedAnnualEntitlement: annualLeaveEntitlementForEmployee(emp),
};

console.log('BEFORE_SYNC', JSON.stringify(before, null, 2));

const snapshot = await readEmployeeLeaveSnapshot(emp, [emp]);
const annual = snapshot.balances.filter((b) => String(b.leaveType || '').toLowerCase().includes('annual'));
const other = snapshot.balances
  .filter((b) => !String(b.leaveType || '').toLowerCase().includes('annual'))
  .map((b) => ({
    leaveType: b.leaveType,
    currentBalance: b.currentBalance,
    accruedBalance: b.accruedBalance,
    status: b.status,
  }));

console.log('AFTER_SYNC_ANNUAL', JSON.stringify(annual, null, 2));
console.log('AFTER_SYNC_OTHER', JSON.stringify(other, null, 2));
console.log('APPLICATIONS', JSON.stringify(snapshot.applications, null, 2));
process.exit(0);
