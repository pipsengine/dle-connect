/**
 * Procurement catalog must keep the download-pack module map and accurate line totals.
 * Run: npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/lib/procurement/catalog.test.ts
 */
import assert from 'node:assert/strict';
import { domainById, linesTotal, PROCUREMENT_DOMAINS } from './catalog.ts';

assert.equal(PROCUREMENT_DOMAINS.length, 11);
assert.ok(domainById('plans'));
assert.ok(domainById('commercial')?.hasLines);
assert.equal(
  linesTotal([
    { description: 'Valve', quantity: 2, uom: 'EA', unitPrice: 100, taxRate: 7.5 },
    { description: 'Gasket', quantity: 1, uom: 'EA', unitPrice: 50, taxRate: 0 },
  ]),
  265,
);

for (const domain of PROCUREMENT_DOMAINS) {
  assert.ok(domain.fields.some((field) => field.key === 'title'), `${domain.id} needs a title field`);
  assert.ok(domain.tabs.length > 0, `${domain.id} needs tabs`);
}

console.log('procurement catalog ok');
