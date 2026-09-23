import assert from 'node:assert/strict';
import {
  paymentApproverCodeVariants,
  paymentEmployeeCodesMatch,
  isAssignedPaymentApprover,
} from './payment-access.ts';
import { directoryPersonNamesMatch } from './payment-person-match.ts';

assert.equal(directoryPersonNamesMatch('Mr. PHILLIPS AYODEJI', 'Mr AYODEJI PHILLIPS'), true);
assert.equal(directoryPersonNamesMatch('Mr AYODEJI PHILLIPS', 'AYODEJI PHILLIPS'), true);
assert.equal(directoryPersonNamesMatch('0464 - Mr AYODEJI PHILIPS', 'Mr AYODEJI PHILLIPS'), true);
assert.equal(directoryPersonNamesMatch('Mr AYODEJI ADENUGA', 'Mr AYODEJI PHILLIPS'), false);
assert.equal(directoryPersonNamesMatch('AYODEJI', 'Mr AYODEJI PHILLIPS'), false);

assert.equal(paymentEmployeeCodesMatch('P0464', '0464'), true);
assert.equal(paymentEmployeeCodesMatch('P0464', 'p-0464'), true);
assert.equal(paymentEmployeeCodesMatch('P0464', 'P0388'), false);
assert.ok(paymentApproverCodeVariants('P0464').includes('P0464'));
assert.ok(paymentApproverCodeVariants('P0464').includes('0464'));

assert.equal(
  isAssignedPaymentApprover(
    { actorCode: 'P0464', roles: ['Project Manager'] },
    { currentApproverCode: 'P0464', currentStage: 'Project Manager', status: 'Pending Approval' },
  ),
  true,
);
assert.equal(
  isAssignedPaymentApprover(
    { actorCode: 'P0464', roles: ['Project Manager'] },
    { currentApproverCode: '', currentStage: 'Project Manager', status: 'Pending Approval' },
  ),
  false,
);

console.log('payment-approver-match.test.ts: ok');
