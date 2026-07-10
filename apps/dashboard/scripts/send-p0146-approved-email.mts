import fs from 'node:fs';
import path from 'node:path';
import { sendLeaveWorkflowEmail } from '../lib/mail-service';

const loadEnv = () => {
  for (const file of [
    path.join(process.cwd(), 'apps', 'dashboard', '.env.local'),
    path.join(process.cwd(), 'apps', 'dashboard', '.env'),
    path.join(process.cwd(), '.env'),
  ]) {
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
};

loadEnv();

const requester = {
  employeeId: 'P0146',
  employeeCode: 'P0146',
  fullName: 'Mr CHRISTIAN ONUWABHAGBE OGBAISI',
  officialEmail: 'chrisogbaisi@dormanlongeng.com',
  email: 'chrisogbaisi@dormanlongeng.com',
  department: 'INFORMATION TECHNOLOGY',
} as any;

const request = {
  id: 'ess-smoke-p0146-1783668308560',
  category: 'Leave Application',
  title: 'Mr CHRISTIAN ONUWABHAGBE OGBAISI — Compassionate Leave',
  leaveType: 'Compassionate Leave',
  startDate: '2027-01-15',
  endDate: '2027-01-19',
  days: 3,
  status: 'Approved',
  relieverName: 'Mr NNAMDI FRANKLYN AGHANYA',
  handover: 'Routine handover notes for smoke test coverage.',
  employeeId: 'P0146',
} as any;

const baseUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://192.168.5.5:3020';

const result = await sendLeaveWorkflowEmail({
  event: 'approved',
  request,
  requester,
  recipient: requester,
  actorName: 'HR Manager',
  baseUrl,
});

console.log(JSON.stringify({ ...result, baseUrl, to: requester.officialEmail }, null, 2));
