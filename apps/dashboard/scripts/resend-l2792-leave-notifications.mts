/**
 * Persist L2792 mailbox and resend pending leave manager + applicant emails.
 * Usage: npx tsx scripts/resend-l2792-leave-notifications.mts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncPortalMailboxForEmployee } from '../lib/auth/auth-store';
import {
  findEmployeeByOfficialEmailInDb,
  readEmployeeMailboxFromDb,
  upsertEmployeeOfficialEmailInDb,
} from '../lib/dle-enterprise-db';
import {
  loadWorkflowLeaveRequests,
  retryLeaveManagerNotification,
} from '../lib/leave-workflow-service';
import { resolveEmployeeMailbox, resolveMailProvider } from '../lib/mail-service';
import { invalidatePayrollEmployeeCache, readPayrollEmployees } from '../lib/payroll-employee-source';
import { resolveWorkflowLinkOrigin } from '../lib/public-app-url';

const MANAGER_CODE = 'L2792';
const MANAGER_EMAIL = 'cletusbassey@dormanlongeng.com';

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

const compact = (value: unknown) => String(value || '').trim();
const upper = (value: unknown) => compact(value).toUpperCase();
const matchesManager = (value: unknown) => upper(value) === MANAGER_CODE || /AGAH\s+BASSEY/i.test(compact(value));

const persistMailbox = async () => {
  const before = await readEmployeeMailboxFromDb(MANAGER_CODE);
  const owner = await findEmployeeByOfficialEmailInDb(MANAGER_EMAIL);
  const assigned = before.toLowerCase() === MANAGER_EMAIL
    ? { ok: true as const, employeeCode: MANAGER_CODE, officialEmail: MANAGER_EMAIL }
    : await upsertEmployeeOfficialEmailInDb(MANAGER_CODE, MANAGER_EMAIL);
  const portalSynced = await syncPortalMailboxForEmployee(MANAGER_CODE, MANAGER_EMAIL);
  invalidatePayrollEmployeeCache();
  const after = await readEmployeeMailboxFromDb(MANAGER_CODE);
  return { before, owner, assigned, portalSynced, after };
};

const persist = await persistMailbox();
const { employees } = await readPayrollEmployees();
const manager = employees.find((row) => upper(row.employeeCode || row.employeeId) === MANAGER_CODE);
const resolvedManagerMailbox = manager ? await resolveEmployeeMailbox(manager) : persist.after || MANAGER_EMAIL;
const requests = await loadWorkflowLeaveRequests();
const targets = requests.filter((item) => {
  const pending = item.status === 'Line Manager Review' || item.status === 'Submitted';
  if (!pending) return false;
  if (matchesManager(item.lineManagerEmployeeId) || matchesManager(item.lineManagerName)) return true;
  return item.startDate === '2026-09-21' && item.endDate === '2026-09-29';
});

const baseUrl = resolveWorkflowLinkOrigin();
const deliveries = [];
for (const request of targets) {
  try {
    const delivery = await retryLeaveManagerNotification({
      requestId: request.id,
      actorName: 'Leave Workflow Repair',
      baseUrl,
    });
    deliveries.push({
      requestId: request.id,
      employeeId: request.employeeId,
      leaveType: request.leaveType,
      startDate: request.startDate,
      endDate: request.endDate,
      status: request.status,
      ok: true,
      managerEmail: delivery.email,
      applicant: delivery.applicant,
    });
  } catch (error) {
    deliveries.push({
      requestId: request.id,
      employeeId: request.employeeId,
      leaveType: request.leaveType,
      startDate: request.startDate,
      endDate: request.endDate,
      status: request.status,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

console.log(JSON.stringify({
  managerCode: MANAGER_CODE,
  intendedMailbox: MANAGER_EMAIL,
  persist,
  provider: resolveMailProvider(),
  manager: manager ? {
    employeeCode: manager.employeeCode,
    fullName: manager.fullName,
    officialEmail: manager.officialEmail,
    resolvedMailbox: resolvedManagerMailbox,
  } : null,
  targetCount: targets.length,
  deliveries,
}, null, 2));

const failed = !deliveries.length
  || deliveries.some((item) => !item.ok || (item.applicant && !item.applicant.email.ok));
process.exit(failed ? (deliveries.length ? 2 : 3) : 0);
