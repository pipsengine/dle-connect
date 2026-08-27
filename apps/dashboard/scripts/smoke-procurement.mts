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

const s = await import('../lib/procurement-store.ts');
await s.ensureProcurementDb();
const dash = await s.buildProcurementDashboard();
const cbes = await s.listCbes();
const detail = cbes[0] ? await s.getCbeDetail(cbes[0].cbeId) : null;
const supplier = await s.upsertSupplier({ name: 'Smoke Supplier Ltd', code: 'SMK-001', isApproved: true }, 'Smoke');
const pr = await s.upsertPurchaseRequisition({ title: 'Smoke PR', status: 'Draft', department: 'Mechanical', estimatedAmount: 100000 }, 'Smoke');
const rfq = await s.upsertRfq({ title: 'Smoke RFQ', prId: pr.prId, status: 'Draft', buyerName: 'Smoke' }, 'Smoke');
let cbe = detail;
if (!cbe) {
  cbe = await s.createCbe({ title: 'Smoke CBE', rfqNumber: rfq.rfqId, status: 'Draft', project: 'Test' }, 'Smoke');
}
const cbeId = cbe!.evaluation?.cbeId || cbe!.cbeId || cbes[0]?.cbeId;
await s.updateCbeHeader(cbeId, { status: 'Bid Comparison' }, 'Smoke');
await s.addNegotiationRound(
  cbeId,
  {
    bidderId: detail?.bidders?.[0]?.bidderId || 'co-famous',
    roundDate: '27 Aug 2026',
    method: 'Email',
    negotiatedBy: 'Smoke',
    originalValue: 1000,
    vendorOffer: 900,
    agreedValue: 900,
    notes: 'smoke round',
    isBafo: false,
  },
  'Smoke',
);
await s.addCbeDocument(cbeId, { name: 'smoke.pdf', category: 'Other', version: '1.0', sizeLabel: '10 KB' }, 'Smoke');
const after = await s.getCbeDetail(cbeId);
console.log({
  dash,
  supplierId: supplier.supplierId,
  prId: pr.prId,
  rfqId: rfq.rfqId,
  cbeId,
  bidders: after?.bidders?.length,
  items: after?.items?.length,
  rounds: after?.negotiationRounds?.length,
  docs: after?.documents?.length,
});
console.log('PROCUREMENT_SMOKE_OK');
process.exit(0);
