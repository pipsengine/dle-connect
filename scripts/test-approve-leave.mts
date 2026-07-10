import fs from 'node:fs';
import path from 'node:path';

for (const file of ['apps/dashboard/.env.local', 'apps/dashboard/.env', '.env']) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

import { readPayrollEmployees } from '../apps/dashboard/lib/payroll-employee-source';
import { transitionEssLeaveRequest, loadWorkflowLeaveRequests } from '../apps/dashboard/lib/leave-workflow-service';

const requestId = process.argv[2] || 'ess-1783700769478-tmhaac';
const t0 = Date.now();
const log = (message: string) => console.log(`+${Date.now() - t0}ms ${message}`);

const run = async () => {
  log('start');
  const { employees } = await readPayrollEmployees();
  log(`employees loaded (${employees.length})`);
  const actor = employees.find((item) => item.employeeCode === 'P0146' || item.employeeId === 'P0146');
  if (!actor) throw new Error('P0146 not found');

  const requests = await loadWorkflowLeaveRequests({ repair: false });
  log(`workflow requests loaded (${requests.length})`);
  const target = requests.find((item) => item.id === requestId);
  log(`target ${requestId} status=${target?.status || 'missing'}`);

  const result = await transitionEssLeaveRequest({
    requestId,
    action: 'approve',
    actorName: actor.fullName || 'P0146',
    actor,
    roles: ['Super Administrator'],
    isGlobalAdmin: false,
    comment: 'Direct approval timing test',
    baseUrl: 'http://localhost:3020',
  });
  log(`approved -> ${result.request.status}`);
};

run().catch((error) => {
  console.error('FAILED:', error instanceof Error ? error.message : error);
  process.exit(1);
});
