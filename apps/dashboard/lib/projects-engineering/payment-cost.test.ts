/**
 * Project payment classification and cost snapshot.
 * Run: npx tsx lib/projects-engineering/payment-cost.test.ts
 */
import assert from 'node:assert/strict';
import { deriveProjectCostSnapshot } from './cost-control';
import {
  classifyProjectPayment,
  groupPaymentLines,
  paymentAmountNgn,
  type ProjectPaymentLine,
} from './payment-cost';

assert.equal(classifyProjectPayment({ projectCode: '', status: 'Paid', paidAt: '2026-11-01' }), null);
assert.equal(classifyProjectPayment({ projectCode: '[Corporate]', status: 'Paid', paidAt: '2026-11-01' }), null);
assert.equal(classifyProjectPayment({ projectCode: 'DL2606', status: 'Draft' }), null);
assert.equal(classifyProjectPayment({ projectCode: 'DL2606', status: 'Returned' }), null);
assert.equal(classifyProjectPayment({ projectCode: 'DL2606', status: 'Cancelled', paidAt: '2026-11-01' }), null);
assert.equal(classifyProjectPayment({ projectCode: 'DL2606', status: 'Approved' }), 'commitment');
assert.equal(classifyProjectPayment({ projectCode: 'DL2606', status: 'Ready for Treasury' }), 'commitment');
assert.equal(classifyProjectPayment({ projectCode: 'DL2606', status: 'Pending Approval' }), 'commitment');
assert.equal(classifyProjectPayment({ projectCode: 'dl2606', status: 'Paid' }), 'actual');
assert.equal(classifyProjectPayment({ projectCode: 'DL2606', status: 'Awaiting Retirement', paidAt: '2026-11-01' }), 'actual');
assert.equal(classifyProjectPayment({ projectCode: 'DL2606', status: 'Payment Processing', paidAt: '2026-11-02' }), 'actual');

assert.equal(paymentAmountNgn(5000, 'NGN', null), 5000);
assert.equal(paymentAmountNgn(10, 'USD', JSON.stringify({ amountNgn: 15000 })), 15000);
assert.equal(paymentAmountNgn(0, 'NGN', JSON.stringify({ amountNgn: 0 })), 0);

const line = (partial: Partial<ProjectPaymentLine>): ProjectPaymentLine => ({
  requestId: partial.requestId || '1',
  requestNumber: partial.requestNumber || 'PREQ-1',
  projectCode: partial.projectCode || 'DL2606',
  paymentType: partial.paymentType || 'Supplier Invoice',
  beneficiaryName: 'Vendor',
  description: '',
  expenseCode: '',
  amountNgn: partial.amountNgn || 0,
  currencyCode: 'NGN',
  status: partial.status || 'Paid',
  kind: partial.kind || 'actual',
  paidAt: partial.paidAt || null,
  postedAt: null,
});

const grouped = groupPaymentLines([
  line({ requestId: 'a', amountNgn: 40, kind: 'actual', projectCode: 'dl2606' }),
  line({ requestId: 'b', amountNgn: 10, kind: 'commitment', status: 'Approved', projectCode: 'DL2606' }),
  line({ requestId: 'c', amountNgn: 5, kind: 'actual', projectCode: 'DL9999' }),
]);
assert.equal(grouped.get('DL2606')?.actual, 40);
assert.equal(grouped.get('DL2606')?.commitments, 10);
assert.equal(grouped.get('DL2606')?.actualCount, 1);
assert.equal(grouped.get('DL9999')?.actual, 5);

const project = {
  contractValue: 100,
  actual: 50,
  planned: 50,
  costPerformance: 1,
  schedulePerformance: 1,
  health: 'Healthy',
};

const fromPayments = deriveProjectCostSnapshot(project, { actual: 40, commitments: 10 });
assert.equal(fromPayments.actual, 40);
assert.equal(fromPayments.commitments, 10);
assert.equal(fromPayments.ev, 50);
assert.equal(fromPayments.cpi, 1.25);
assert.equal(fromPayments.etc, 40);
assert.equal(fromPayments.eac, 80);
assert.equal(fromPayments.fromPayments, true);

const overrun = deriveProjectCostSnapshot(
  { ...project, actual: 0, costPerformance: 1 },
  { actual: 90, commitments: 30 },
);
assert.equal(overrun.etc, 30);
assert.equal(overrun.eac, 120);
assert.equal(overrun.vac, -20);

const proxy = deriveProjectCostSnapshot(project);
assert.notEqual(proxy.actual, 40);
assert.equal(proxy.fromPayments, false);

console.log('payment-cost.test.ts: ok');
