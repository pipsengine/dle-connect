/**
 * Run: npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/lib/finance-intelligence/payment-retirement-quota.test.ts
 */
import assert from 'node:assert/strict';

const PAYMENT_ATTACHMENT_MAX_FILES = 8;

const retirementCount = (attachments: Array<{ kind?: string | null }>) =>
  attachments.filter((item) => (String(item.kind || 'supporting').trim() || 'supporting') === 'retirement-evidence')
    .length;

const canAcceptRetirementUploads = (
  attachments: Array<{ kind?: string | null }>,
  uploadCount: number,
) => retirementCount(attachments) + uploadCount <= PAYMENT_ATTACHMENT_MAX_FILES;

const dle261065 = [
  { kind: 'supporting' },
  { kind: 'payment-evidence' },
  { kind: 'retirement-evidence' },
];

assert.equal(retirementCount(dle261065), 1);
assert.equal(canAcceptRetirementUploads(dle261065, 7), true, '7 new retirement receipts should be allowed');
assert.equal(
  (dle261065.length + 7) <= PAYMENT_ATTACHMENT_MAX_FILES,
  false,
  'old total-attachment check wrongly blocked Ijeoma',
);
assert.equal(canAcceptRetirementUploads(dle261065, 8), false, '1 existing + 8 new exceeds 8');
assert.equal(canAcceptRetirementUploads([], 8), true);
assert.equal(canAcceptRetirementUploads([{ kind: 'supporting' }, { kind: 'payment-evidence' }], 8), true);

console.log('payment-retirement-quota.test.ts ok');
