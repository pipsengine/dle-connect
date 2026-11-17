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

const requestId = 'ess-1793702723383-j23tqa';
const employeeCode = 'C2138';

const { cancelEssLeaveRequest } = await import('../apps/dashboard/lib/leave-workflow-service.ts');
const { readEmployeeDirectoryFromDb } = await import('../apps/dashboard/lib/dle-enterprise-db.ts');
const { readEmployeeLeaveSnapshot } = await import('../apps/dashboard/lib/leave-management-store.ts');

const employees = (await readEmployeeDirectoryFromDb()) || [];
const employee = employees.find((row) => String(row.employeeCode || '').toUpperCase() === employeeCode);
if (!employee) {
  console.error('Employee not found', employeeCode);
  process.exit(1);
}

const cancelled = await cancelEssLeaveRequest({
  requestId,
  actorName: 'Leave Admin Cleanup',
  reason: 'Stale open leave blocked re-application. Auto-terminate comments existed but status stayed Line Manager Review / Under Review. Cancelled so Stanley can apply again.',
  employee,
});
console.log('CANCEL_RESULT', JSON.stringify(cancelled, null, 2));

const snapshot = await readEmployeeLeaveSnapshot(employee, [employee]);
const annual = snapshot.balances.filter((b) => /annual/i.test(String(b.leaveType || '')));
const apps = snapshot.applications.map((a) => ({
  id: a.id,
  leaveType: a.leaveType,
  startDate: a.startDate,
  endDate: a.endDate,
  days: a.days,
  status: a.status,
}));
console.log('AFTER_ANNUAL', JSON.stringify(annual, null, 2));
console.log('AFTER_APPS', JSON.stringify(apps, null, 2));
process.exit(0);
