import assert from 'node:assert/strict';
import { canAccessPaymentRequest, canActOnPaymentApproval } from './payment-access.ts';
import { employeeHasLineManager, paymentOwnedByDirectReport } from './payment-team-scope.ts';

const manager = { fullName: 'MOMOH MOHAMMED', employeeCode: 'C1882', employeeId: 'C1882' };

assert.equal(
  employeeHasLineManager({ managerName: 'C1882 - MOMOH MOHAMMED', employeeCode: 'C2422', employeeId: 'C2422' }, manager),
  true,
);
assert.equal(
  employeeHasLineManager(
    { managerName: 'P0277 - AKINSANYA', employeeCode: 'C2422', employeeId: 'C2422' },
    manager,
  ),
  false,
);
assert.equal(
  employeeHasLineManager(
    { managerName: 'C1882 - MOMOH MOHAMMED', employeeCode: 'C1882', employeeId: 'C1882' },
    manager,
  ),
  false,
);

const request = { requesterCode: 'C2422', currentApproverCode: 'P0413', beneficiaryCode: 'C2422', currentStage: 'MD / CEO', status: 'Pending Approval' };
const lineManager = { actorCode: 'C1882', roles: ['Manager'], department: 'Production' };

assert.equal(canAccessPaymentRequest(lineManager, request), false);
assert.equal(canAccessPaymentRequest(lineManager, request, { directReportCodes: ['C2422'] }), true);
assert.equal(canAccessPaymentRequest(lineManager, request, { directReportCodes: ['P0044'] }), false);
assert.equal(canActOnPaymentApproval(lineManager, request), false);
assert.equal(paymentOwnedByDirectReport(request, ['C2422', 'C0585']), true);
assert.equal(paymentOwnedByDirectReport(request, ['P0044']), false);

const stranger = { actorCode: 'P0001', roles: ['Employee'], department: 'IT' };
assert.equal(canAccessPaymentRequest(stranger, request), false);
assert.equal(canAccessPaymentRequest(stranger, request, { directReportCodes: ['P0002'] }), false);

const phillips = { actorCode: 'P0464', roles: ['Project Manager'], department: 'PROJECT' };
assert.equal(
  canAccessPaymentRequest(phillips, { requesterCode: 'NYSC0025', currentApproverCode: 'P0464', beneficiaryCode: 'NYSC0025' }),
  true,
);
assert.equal(
  canAccessPaymentRequest(phillips, { requesterCode: 'NYSC0025', currentApproverCode: '0464', beneficiaryCode: 'NYSC0025' }),
  true,
);
assert.equal(
  canActOnPaymentApproval(phillips, {
    requesterCode: 'NYSC0025',
    currentApproverCode: 'P0464',
    currentStage: 'Project Manager',
    status: 'Pending Approval',
  }),
  true,
);

console.log('payment-team-access.test.ts: ok');
