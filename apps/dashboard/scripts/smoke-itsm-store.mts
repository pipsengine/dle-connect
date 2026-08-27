import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dashboardRoot = path.resolve(__dirname, '..');

for (const file of ['.env', '.env.local']) {
  try {
    const text = readFileSync(path.join(dashboardRoot, file), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!process.env[m[1]]) process.env[m[1]] = v;
    }
  } catch {
    /* optional */
  }
}

const s = await import('../lib/it-service-desk-store.ts');
await s.ensureItServiceDeskDb();
const t = await s.createTicket(
  { subject: 'Store smoke', priority: 'Medium', category: 'Email', status: 'Open' },
  'Store Smoke',
);
const u = await s.updateTicket(t!.ticketId, { status: 'Resolved', assigneeName: 'Agent One' }, 'Store Smoke');
const i = await s.createIncident({ title: 'Store smoke INC', priority: 'High', isMajor: true }, 'Store Smoke');
await s.addIncidentEvent(i!.incidentId, 'Investigating smoke', 'Store Smoke');
const cat = await s.listServiceCatalog();
const r = await s.createServiceRequest(
  { serviceName: cat[0].name, serviceId: cat[0].serviceId, title: cat[0].name, stage: 'New' },
  'Store Smoke',
);
await s.updateServiceRequest(r!.requestId, { stage: 'Approved' }, 'Store Smoke');
await s.upsertProblem({ title: 'Smoke problem', kind: 'Problem', status: 'Active', priority: 'Medium' }, 'Store Smoke');
await s.upsertChange({ title: 'Smoke change', changeType: 'Normal', status: 'Draft' }, 'Store Smoke');
await s.upsertFeedback({ feedbackType: 'rating', title: 'Smoke rating', rating: 5 }, 'Store Smoke');
const dash = await s.buildServiceDeskDashboard();
console.log({
  ticket: u?.ticketId,
  ticketStatus: u?.status,
  incident: i?.incidentId,
  request: r?.requestId,
  kpis: dash.kpis,
});
console.log('STORE_SMOKE_OK');
process.exit(0);
