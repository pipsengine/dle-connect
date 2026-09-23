/**
 * CBN NFEM highest rate for the latest published day on or before the payroll day.
 * Run: npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/lib/cbn-nfem-rate.test.ts
 */
import assert from 'node:assert/strict';
import { parseCbnRateDate, pickCbnHighestUsdRate } from './cbn-nfem-rate';

const rows = [
  { ratedate: 'September-22-2026', highestrate: '1332.5000', weightedAvgRate: '1327.7784' },
  { ratedate: 'September-21-2026', highestrate: '1336.0000' },
  { ratedate: 'September-18-2026', highestrate: '1334.5000' },
];

assert.equal(parseCbnRateDate('September-22-2026'), '2026-09-22');
assert.equal(parseCbnRateDate('September-09-2026'), '2026-09-09');
assert.equal(parseCbnRateDate('not-a-date'), null);

const latest = pickCbnHighestUsdRate(rows, '2026-09-23');
assert.equal(latest?.rateDate, '2026-09-22');
assert.equal(latest?.rate, 1332.5);

const sameDay = pickCbnHighestUsdRate(rows, '2026-09-22');
assert.equal(sameDay?.rate, 1332.5);

const weekend = pickCbnHighestUsdRate(rows, '2026-09-20');
assert.equal(weekend?.rateDate, '2026-09-18');
assert.equal(weekend?.rate, 1334.5);

const duplicate = pickCbnHighestUsdRate([
  { ratedate: 'September-22-2026', highestrate: '1330.0000' },
  { ratedate: 'September-22-2026', highestrate: '1332.5000' },
], '2026-09-22');
assert.equal(duplicate?.rate, 1332.5);

console.log('cbn-nfem-rate.test.ts ok');
