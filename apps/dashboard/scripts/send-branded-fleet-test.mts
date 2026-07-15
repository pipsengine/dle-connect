import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEnterpriseNotification } from '../lib/enterprise-notifications-store';
import { fleetTripSupervisorUrl, fleetTripWorkspaceUrl } from '../lib/fleet-trip-urls';
import { resolveMailProvider, sendDleTestEmail, sendFleetTripSupervisorRequestEmail } from '../lib/mail-service';
import { resolveWorkflowLinkOrigin } from '../lib/public-app-url';
import { readUsers } from '../lib/auth/auth-store';
import type { SessionPayload } from '../lib/auth/session';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envFiles = [path.join(__dirname, '..', '.env.local'), path.join(__dirname, '..', '.env')];

for (const envPath of envFiles) {
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
const employeeCode = compact(process.argv[2] || 'P0146').toUpperCase();

const users = await readUsers();
const user = users.find((item) =>
  compact(item.employeeCode).toUpperCase() === employeeCode
  || compact(item.username).toUpperCase() === employeeCode
  || compact(item.employeeId).toUpperCase() === employeeCode,
);

if (!user?.email) {
  console.error(JSON.stringify({ sent: false, reason: `No portal user email found for ${employeeCode}` }));
  process.exit(1);
}

const baseUrl = resolveWorkflowLinkOrigin(null);
const fleetLink = `${baseUrl}/logistics-fleet`;
const tripsLink = fleetTripWorkspaceUrl('supervisor', 'trip-demo-p0146', baseUrl);
const notificationsLink = `${baseUrl}/enterprise?scope=notifications`;
const sampleTrip = {
  requestNo: 'TRP-TEST-P0146',
  requester: user.fullName,
  origin: 'Head Office',
  destination: 'Project Site',
  purpose: 'Branded Logistics & Fleet notification design test',
  startDate: new Date().toISOString().slice(0, 10),
  endDate: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
  projectCode: 'FLEET-TEST',
  costCenter: 'LOGISTICS',
};

const brandedTest = await sendDleTestEmail({
  to: user.email,
  recipientName: user.fullName,
  employeeCode,
  appUrl: baseUrl,
  fleetLink,
  tripsLink,
  notificationsLink,
});

const workflowSample = await sendFleetTripSupervisorRequestEmail({
  recipientName: user.fullName,
  recipientEmail: user.email,
  trip: sampleTrip,
  actorName: 'DLE Connect Fleet Workflow',
  workspaceLink: fleetTripSupervisorUrl('trip-demo-p0146', baseUrl),
  tripsLink: fleetTripWorkspaceUrl('requests', undefined, baseUrl),
  fleetHomeLink: fleetLink,
  baseUrl,
});

const session: SessionPayload = {
  sub: user.id,
  username: user.username,
  fullName: user.fullName,
  employeeCode: user.employeeCode || employeeCode,
  roles: user.roles,
  permissions: user.permissions || [],
  status: 'Active',
  firstLoginRequired: false,
  passwordResetRequired: false,
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 3600,
};

await createEnterpriseNotification(session, {
  kind: 'Approval',
  module: 'Logistics & Fleet',
  title: `Trip approval required — ${sampleTrip.requestNo}`,
  body: 'Sample branded workflow notification with portal deep link.',
  severity: 'warning',
  href: `/logistics-fleet/trips-dispatch?tab=supervisor&tripId=trip-demo-p0146`,
  actor: 'DLE Connect Fleet Workflow',
  channels: ['In-App', 'Email'],
  recipientEmployeeCode: user.employeeCode || employeeCode,
  recipientRoles: user.roles,
  metadata: { employeeCode, sample: true },
});

console.log(JSON.stringify({
  sent: Boolean(brandedTest.sent || workflowSample.sent),
  provider: resolveMailProvider(),
  employeeCode,
  recipient: user.fullName,
  brandedTest: brandedTest.sent,
  workflowSample: workflowSample.sent,
  links: {
    portal: baseUrl,
    fleet: fleetLink,
    supervisorQueue: tripsLink,
  },
}, null, 2));

if (!brandedTest.sent && !workflowSample.sent) process.exit(1);
