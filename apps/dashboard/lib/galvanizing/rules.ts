import { GALVANIZING_STAGES, type GalvanizingStage, type NcrDisposition } from './constants';

export class GalvanizingRuleError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'GalvanizingRuleError';
    this.status = status;
  }
}

export const fail = (status: number, message: string): never => {
  throw new GalvanizingRuleError(status, message);
};

export const roundKg = (value: number) => Math.round(value * 1000) / 1000;

export const WAYBILL_EXCEPTION_REASONS = ['NOT_PRESENTED', 'ILLEGIBLE', 'WRONG_PARTY', 'OTHER'] as const;

export const receiptArrival = (input: {
  grossKg: number;
  missingWaybill: boolean;
  vehicle: string;
  gateInAt: string;
}) => {
  if (!(input.grossKg > 0)) fail(422, 'Gross weight is required when the vehicle enters.');
  if (!input.vehicle.trim()) fail(422, 'Vehicle registration is required.');
  if (!input.gateInAt.trim()) fail(422, 'Gate-in date and time are required.');
  return { status: input.missingWaybill ? 'GATE_HOLD' : 'WEIGH_PENDING' };
};

export const tareAfterOffload = (grossKg: number, tareKg: number) => {
  if (tareKg < 0 || grossKg < 0) fail(422, 'Weights cannot be negative.');
  if (!(tareKg > 0)) fail(422, 'Enter the empty-vehicle tare after offloading.');
  if (tareKg > grossKg) fail(422, 'Tare cannot exceed gross.');
  return { netKg: roundKg(grossKg - tareKg) };
};

export const receiptReadyStatus = (input: { missingWaybill: boolean; exceptionApproved: boolean; tareRecorded: boolean }) => {
  if (input.missingWaybill && !input.exceptionApproved) return 'GATE_HOLD';
  if (!input.tareRecorded) return 'WEIGH_PENDING';
  return 'RECEIVED';
};

export const assertReceiptReady = (input: {
  status: string;
  jobId: number;
  tareRecorded: boolean;
  missingWaybill: boolean;
  exceptionApproved: boolean;
}) => {
  if (input.missingWaybill && !input.exceptionApproved) {
    fail(409, 'The missing-waybill approval must be completed before the next stage.');
  }
  if (!input.tareRecorded || input.status === 'WEIGH_PENDING') {
    fail(409, 'Tare is taken after offloading. Net weight is required before the next stage.');
  }
  if (input.status === 'GATE_HOLD') fail(409, 'Release the missing-waybill hold before the next stage.');
  if (!(input.jobId > 0)) fail(409, 'Open or link a job for this receipt before inspection.');
};

export const articleQuantities = (declared: number, accepted: number, rejected: number) => {
  if (declared < 1) fail(422, 'Declared quantity is required.');
  if (!Number.isInteger(accepted) || !Number.isInteger(rejected) || accepted < 0 || rejected < 0) {
    fail(422, 'Accepted and rejected quantities must be whole numbers.');
  }
  if (accepted + rejected !== declared) {
    fail(422, 'Accepted and rejected quantities must equal the declared quantity.');
  }
};

export const assertIncomingOutcome = (input: {
  outcome: string;
  rejectedTotal: number;
  disposition: string;
  severity: string;
}) => {
  if (!['PASS', 'FAIL', 'HOLD'].includes(input.outcome)) fail(422, 'Choose an inspection outcome.');
  if (input.outcome === 'PASS' && input.rejectedTotal > 0) {
    fail(422, 'A pass cannot include rejected pieces.');
  }
  if (input.outcome === 'FAIL' && input.rejectedTotal < 1) {
    fail(422, 'Record the rejected quantity for a failed inspection.');
  }
  if (input.outcome === 'FAIL' && !input.disposition) fail(422, 'Disposition is required when the inspection fails.');
  if (input.outcome === 'FAIL' && !input.severity) fail(422, 'Severity is required when the inspection fails.');
};

export const nextStage = (stage: string): GalvanizingStage => {
  const index = GALVANIZING_STAGES.indexOf(stage as GalvanizingStage);
  if (index < 0 || index >= GALVANIZING_STAGES.length - 1) fail(409, 'This batch cannot advance.');
  return GALVANIZING_STAGES[index + 1];
};

export const assertStageAdvance = (input: {
  stage: string;
  status: string;
  openNcr: boolean;
  hasFinalPass: boolean;
}) => {
  if (['HOLD', 'REJECTED', 'COMPLETED'].includes(input.status)) fail(409, 'This batch cannot advance.');
  if (input.openNcr) fail(409, 'An open nonconformance blocks the next stage.');
  if (input.stage === 'FINAL_QC' && !input.hasFinalPass) fail(409, 'Final QC must be accepted before the batch can complete.');
  const stage = nextStage(input.stage);
  return { stage, status: stage === 'COMPLETED' ? 'COMPLETED' : 'IN_PROGRESS' };
};

export const assertDispatchWeight = (requestedKg: number, alreadyKg: number, acceptedKg: number) => {
  if (!(requestedKg > 0)) fail(422, 'Dispatch weight must be greater than zero.');
  if (requestedKg + alreadyKg > acceptedKg + 0.001) {
    fail(409, 'Dispatch weight exceeds the accepted batch balance.');
  }
};

const REWORK = new Set(['HOLD', 'REPAIR', 'REGALVANIZE']);

export const assertCloseNcr = (input: { disposition: string; hasReinspection: boolean; allowScrap: boolean }) => {
  const disposition = input.disposition.toUpperCase() as NcrDisposition;
  if (disposition === 'SCRAP' && !input.allowScrap) {
    fail(403, 'Customer or project scrap needs scrap authority.');
  }
  if (REWORK.has(disposition) && !input.hasReinspection) {
    fail(409, 'Rework cannot close until a passing reinspection is recorded.');
  }
};

export const assertJobRelease = (input: { decision: string; hasReceipt: boolean; hasQcPass: boolean }) => {
  if (!['APPROVED', 'REJECTED'].includes(input.decision)) fail(422, 'Decision must be approved or rejected.');
  if (input.decision === 'APPROVED' && !input.hasReceipt) fail(409, 'Material receipt is required before job release.');
  if (input.decision === 'APPROVED' && !input.hasQcPass) fail(409, 'Incoming QC clearance is required before job release.');
  return input.decision === 'APPROVED' ? 'RELEASED' : 'REJECTED';
};

export const nextDispatchStatus = (current: string, patch: {
  commercialCleared?: string;
  gateVerified?: string;
  weightOk?: string;
  podRef?: string;
  status?: string;
}, storedCommercial = 'NO') => {
  const weightOk = (patch.weightOk || '').toUpperCase();
  const pod = (patch.podRef || '').trim();
  const gate = (patch.gateVerified || '').toUpperCase() === 'YES';
  const commercial = (patch.commercialCleared || '').toUpperCase() === 'YES' || storedCommercial.toUpperCase() === 'YES';
  if (pod && (weightOk === 'NO' || current === 'HOLD_VEHICLE')) {
    fail(409, 'The vehicle is on hold. Outbound weight must be accepted before delivery.');
  }
  if (weightOk === 'NO' || patch.status === 'HOLD_VEHICLE') {
    if (['DELIVERED', 'CLOSED'].includes(current)) fail(409, 'A delivered load cannot be held.');
    return 'HOLD_VEHICLE';
  }
  if (current === 'HOLD_VEHICLE' && weightOk !== 'YES') return 'HOLD_VEHICLE';
  let status = current === 'HOLD_VEHICLE' ? 'AUTHORIZED' : current;
  if (commercial && status === 'AUTHORIZED') status = 'CLEARED';
  if (gate) {
    if (!['CLEARED', 'GATE_VERIFIED', 'IN_TRANSIT', 'DELIVERED', 'CLOSED'].includes(status)) {
      fail(409, 'Commercial clearance is required before the gate can release the vehicle.');
    }
    status = 'GATE_VERIFIED';
  }
  if (pod) {
    if (!['GATE_VERIFIED', 'IN_TRANSIT', 'DELIVERED', 'CLOSED'].includes(status)) {
      fail(409, 'Security must verify the outbound waybill before proof of delivery.');
    }
    status = 'DELIVERED';
  }
  if (patch.status && ['IN_TRANSIT', 'CLOSED'].includes(patch.status) && status !== 'HOLD_VEHICLE') status = patch.status;
  return status;
};
