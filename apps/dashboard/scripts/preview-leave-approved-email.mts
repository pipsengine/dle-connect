import fs from 'node:fs';
import path from 'node:path';
import { buildLeaveWorkflowEmail } from '../lib/workflow-email-builders';
import { leavePortalUrl } from '../lib/leave-email-action-token';

const request = {
  id: 'ess-smoke-p0146-preview',
  category: 'Leave Application',
  title: 'Mr CHRISTIAN ONUWABHAGBE OGBAISI — Compassionate Leave',
  leaveType: 'Compassionate Leave',
  startDate: '2027-05-04',
  endDate: '2027-05-06',
  days: 3,
  status: 'Approved',
  relieverName: 'Mr NNAMDI FRANKLYN AGHANYA',
  handover: 'Routine handover notes for smoke test coverage.',
  employeeId: 'P0146',
};

const email = buildLeaveWorkflowEmail({
  event: 'approved',
  request: request as any,
  recipientName: 'Mr CHRISTIAN ONUWABHAGBE OGBAISI',
  actorName: 'HR Manager',
  portalLink: leavePortalUrl('http://192.168.5.5:3020'),
  baseUrl: 'http://192.168.5.5:3020',
});

const out = path.join(process.cwd(), 'apps', 'dashboard', 'data', 'hris', 'preview-leave-approved-email.html');
await fs.promises.mkdir(path.dirname(out), { recursive: true });
await fs.promises.writeFile(out, email.html, 'utf8');

console.log(JSON.stringify({
  subject: email.subject,
  previewFile: out,
  hasCidLogo: email.html.includes('cid:dle-brand-logo'),
  hasReference: email.html.includes('ess-smoke-p0146-preview'),
  hasFormattedDate: email.html.includes('04 May 2027'),
  buttonLabel: email.html.includes('View Approved Leave'),
}, null, 2));
