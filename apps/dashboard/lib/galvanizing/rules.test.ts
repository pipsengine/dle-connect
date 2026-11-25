import assert from 'node:assert/strict';
import {
  articleQuantities,
  assertCloseNcr,
  assertDispatchWeight,
  assertIncomingOutcome,
  assertJobRelease,
  assertReceiptReady,
  assertStageAdvance,
  GalvanizingRuleError,
  nextDispatchStatus,
  receiptArrival,
  receiptReadyStatus,
  tareAfterOffload,
} from './rules';

const blocked = (fn: () => unknown) => {
  try {
    fn();
    return 0;
  } catch (error) {
    return error instanceof GalvanizingRuleError ? error.status : -1;
  }
};

assert.equal(receiptArrival({ grossKg: 12000, missingWaybill: true, vehicle: 'ABC-123', gateInAt: '2026-11-23T08:00' }).status, 'GATE_HOLD');
assert.equal(receiptArrival({ grossKg: 12000, missingWaybill: false, vehicle: 'ABC-123', gateInAt: '2026-11-23T08:00' }).status, 'WEIGH_PENDING');
assert.equal(tareAfterOffload(12000, 4000).netKg, 8000);
assert.equal(blocked(() => tareAfterOffload(1000, 1200)), 422);
assert.equal(receiptReadyStatus({ missingWaybill: true, exceptionApproved: false, tareRecorded: true }), 'GATE_HOLD');
assert.equal(receiptReadyStatus({ missingWaybill: true, exceptionApproved: true, tareRecorded: false }), 'WEIGH_PENDING');
assert.equal(receiptReadyStatus({ missingWaybill: false, exceptionApproved: false, tareRecorded: true }), 'RECEIVED');
assert.equal(blocked(() => assertReceiptReady({ status: 'GATE_HOLD', jobId: 1, tareRecorded: false, missingWaybill: true, exceptionApproved: false })), 409);
articleQuantities(4, 3, 1);
assert.equal(blocked(() => articleQuantities(4, 4, 1)), 422);
assert.equal(blocked(() => assertIncomingOutcome({ outcome: 'PASS', rejectedTotal: 1, disposition: '', severity: '' })), 422);
assert.equal(blocked(() => assertIncomingOutcome({ outcome: 'FAIL', rejectedTotal: 1, disposition: '', severity: 'MAJOR' })), 422);
assert.doesNotThrow(() => assertIncomingOutcome({ outcome: 'FAIL', rejectedTotal: 1, disposition: 'REPAIR', severity: 'MAJOR' }));

assert.equal(assertJobRelease({ decision: 'REJECTED', hasReceipt: false, hasQcPass: false }), 'REJECTED');
assert.equal(blocked(() => assertJobRelease({ decision: 'APPROVED', hasReceipt: true, hasQcPass: false })), 409);
assert.equal(assertJobRelease({ decision: 'APPROVED', hasReceipt: true, hasQcPass: true }), 'RELEASED');

assert.deepEqual(assertStageAdvance({ stage: 'FLUXING', status: 'IN_PROGRESS', openNcr: false, hasFinalPass: false }), {
  stage: 'DRYING',
  status: 'IN_PROGRESS',
});
assert.equal(blocked(() => assertStageAdvance({ stage: 'DIPPING', status: 'IN_PROGRESS', openNcr: true, hasFinalPass: false })), 409);
assert.equal(blocked(() => assertStageAdvance({ stage: 'FINAL_QC', status: 'IN_PROGRESS', openNcr: false, hasFinalPass: false })), 409);
assert.equal(assertStageAdvance({ stage: 'FINAL_QC', status: 'IN_PROGRESS', openNcr: false, hasFinalPass: true }).stage, 'COMPLETED');

assert.equal(blocked(() => assertDispatchWeight(600, 500, 1000)), 409);
assert.doesNotThrow(() => assertDispatchWeight(400, 500, 1000));

assert.equal(blocked(() => assertCloseNcr({ disposition: 'REPAIR', hasReinspection: false, allowScrap: true })), 409);
assert.equal(blocked(() => assertCloseNcr({ disposition: 'SCRAP', hasReinspection: false, allowScrap: false })), 403);
assert.doesNotThrow(() => assertCloseNcr({ disposition: 'SCRAP', hasReinspection: false, allowScrap: true }));
assert.doesNotThrow(() => assertCloseNcr({ disposition: 'RETURN', hasReinspection: false, allowScrap: false }));

assert.equal(nextDispatchStatus('AUTHORIZED', { weightOk: 'NO' }), 'HOLD_VEHICLE');
assert.equal(blocked(() => nextDispatchStatus('HOLD_VEHICLE', { podRef: 'POD-1' })), 409);
assert.equal(blocked(() => nextDispatchStatus('AUTHORIZED', { gateVerified: 'YES', weightOk: 'YES' })), 409);
assert.equal(nextDispatchStatus('HOLD_VEHICLE', { weightOk: 'YES' }), 'AUTHORIZED');
assert.equal(nextDispatchStatus('CLEARED', { gateVerified: 'YES', weightOk: 'YES' }), 'GATE_VERIFIED');
assert.equal(nextDispatchStatus('HOLD_VEHICLE', { weightOk: 'YES', gateVerified: 'YES' }, 'YES'), 'GATE_VERIFIED');
assert.equal(nextDispatchStatus('GATE_VERIFIED', { podRef: 'POD-9' }), 'DELIVERED');

console.log('galvanizing rules ok');
