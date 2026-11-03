import assert from 'node:assert/strict';
import {
  emptyPaymentListView,
  listReturnPath,
  parsePaymentListView,
  paymentEditHref,
  paymentRequestHref,
  paymentReturnLabel,
  safePaymentReturnPath,
  serializePaymentListView,
} from './payment-list-return.ts';

const view = {
  ...emptyPaymentListView('approved'),
  tab: 'paid',
  q: 'hospital',
  department: 'HUMAN RESOURCES',
  page: 2,
  headers: { status: { selected: ['Ready for Treasury'] } },
};

const params = serializePaymentListView(view, 'approved');
assert.equal(params.get('tab'), 'paid');
assert.equal(params.get('q'), 'hospital');
assert.equal(params.get('department'), 'HUMAN RESOURCES');
assert.equal(params.get('page'), '2');
assert.equal(params.get('type'), null);

const roundTrip = parsePaymentListView(params);
assert.equal(roundTrip.tab, 'paid');
assert.equal(roundTrip.q, 'hospital');
assert.equal(roundTrip.department, 'HUMAN RESOURCES');
assert.equal(roundTrip.page, 2);
assert.deepEqual(roundTrip.headers?.status?.selected, ['Ready for Treasury']);

const returnTo = listReturnPath('/finance/approvals/payments', view, 'approved');
assert.equal(returnTo.startsWith('/finance/approvals/payments?'), true);
assert.equal(
  paymentRequestHref('PREQ-1', returnTo),
  `/finance/approvals/request/PREQ-1?from=${encodeURIComponent(returnTo)}`,
);
assert.equal(paymentReturnLabel(returnTo), 'Back to payment requests');
assert.equal(paymentReturnLabel('/finance/approvals/inbox'), 'Back to inbox');
assert.equal(paymentReturnLabel('/finance/approvals'), 'Back to dashboard');

assert.equal(safePaymentReturnPath('https://evil.example/finance/approvals/payments'), '/finance/approvals/payments');
assert.equal(safePaymentReturnPath('/finance/approvals/request/PREQ-1'), '/finance/approvals/payments');
assert.equal(safePaymentReturnPath('/finance/approvals/my-requests?tab=returned'), '/finance/approvals/my-requests?tab=returned');

assert.equal(
  paymentEditHref('PREQ-9', '/finance/approvals/my-requests?tab=returned&q=hospital'),
  '/finance/approvals/my-requests?tab=returned&q=hospital&edit=PREQ-9',
);
assert.equal(
  paymentEditHref('PREQ-9', '/finance/approvals'),
  '/finance/approvals/payments?edit=PREQ-9',
);

const cash = serializePaymentListView({ ...emptyPaymentListView('all'), paymentType: 'Cash Advance Payment' }, 'all');
assert.equal(cash.get('type'), 'cash-advance');
assert.equal(parsePaymentListView(cash).paymentType, 'Cash Advance Payment');

console.log('payment-list-return tests passed');
