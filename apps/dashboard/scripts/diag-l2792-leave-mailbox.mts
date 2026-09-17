/**
 * Read-only check of L2792 mailbox and pending leave requests.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  findEmployeeByOfficialEmailInDb,
  readEmployeeMailboxFromDb,
} from '../lib/dle-enterprise-db';
import { loadWorkflowLeaveRequests } from '../lib/leave-workflow-service';
import { invalidatePayrollEmployeeCache, readPayrollEmployees } from '../lib/payroll-employee-source';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
for (const envPath of [path.join(__dirname, '..', '.env.local'), path.join(__dirname, '..', '.env')]) {
  if (!fs.existsSync(envPath)) continue;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    const value = match[2].trim().replace(/^"|"$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

invalidatePayrollEmployeeCache();
const mailbox = await readEmployeeMailboxFromDb('L2792');
const owner = await findEmployeeByOfficialEmailInDb('cletusbassey@dormanlongeng.com');
const { employees } = await readPayrollEmployees();
const manager = employees.find((row) => String(row.employeeCode || '').toUpperCase() === 'L2792');
const requests = await loadWorkflowLeaveRequests();
const targets = requests.filter((item) => {
  const pending = item.status === 'Line Manager Review' || item.status === 'Submitted';
  if (!pending) return false;
  const managerHit = String(item.lineManagerEmployeeId || '').toUpperCase() === 'L2792'
    || /AGAH\s+BASSEY/i.test(String(item.lineManagerName || ''));
  return managerHit || (item.startDate === '2026-09-21' && item.endDate === '2026-09-29');
}).map((item) => ({
  id: item.id,
  employeeId: item.employeeId,
  leaveType: item.leaveType,
  startDate: item.startDate,
  endDate: item.endDate,
  status: item.status,
  lineManagerEmployeeId: item.lineManagerEmployeeId,
  lineManagerName: item.lineManagerName,
}));

console.log(JSON.stringify({
  mailbox,
  owner,
  manager: manager ? {
    employeeCode: manager.employeeCode,
    fullName: manager.fullName,
    officialEmail: manager.officialEmail,
    email: manager.email,
    personalEmail: manager.personalEmail,
  } : null,
  targetCount: targets.length,
  targets,
}, null, 2));
process.exit(0);
