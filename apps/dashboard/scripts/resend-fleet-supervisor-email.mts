/**
 * Resend Driver Supervisor trip-submit emails for an existing request.
 * Usage: npx tsx scripts/resend-fleet-supervisor-email.mts [requestNo|tripId]
 * Default request: TRP-2026-0002
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { notifyFleetTripWorkflow, resolveFleetDriverSupervisors } from '../lib/fleet-trip-notification-service';
import { readLogisticsFleetData } from '../lib/logistics-fleet-store';
import { resolveWorkflowLinkOrigin } from '../lib/public-app-url';

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

const needle = String(process.argv[2] || 'TRP-2026-0002').trim().toLowerCase();
const data = await readLogisticsFleetData();
const trip = data.trips.find((item) =>
  item.requestNo.toLowerCase() === needle || item.id.toLowerCase() === needle,
);

if (!trip) {
  console.error(JSON.stringify({ ok: false, reason: `Trip not found: ${needle}` }));
  process.exit(1);
}

const supervisors = await resolveFleetDriverSupervisors();
console.log(JSON.stringify({
  trip: { id: trip.id, requestNo: trip.requestNo, status: trip.status },
  supervisors: supervisors.map((item) => ({
    code: item.employeeCode,
    name: item.fullName,
    email: item.email,
    roles: item.roles,
  })),
}, null, 2));

const result = await notifyFleetTripWorkflow({
  action: 'submit-trip',
  trip,
  vehicles: data.vehicles,
  actor: 'Fleet Supervisor Resend',
  baseUrl: resolveWorkflowLinkOrigin(null),
});

console.log(JSON.stringify({ ok: true, ...result }, null, 2));
process.exit(0);
