import assert from 'node:assert/strict';
import {
  bidNoBidAssessmentComplete,
  emptyBidNoBidValues,
  parseBidNoBidAssessment,
  prefillBidNoBidValues,
  validateBidNoBidAssessment,
} from './bid-no-bid-assessment';

const filled = () => {
  const values = emptyBidNoBidValues();
  values.proposalTitle = 'Mast poles';
  values.workScope = 'Fabrication and delivery';
  values.tenderStage = 'Commercial';
  values.client = 'Alnelly';
  values.externalDeadline = '2024-12-01';
  values.internalDeadline = '2024-11-30';
  values.opportunityType = 'RFQ';
  values.experience = 'Similar mast contracts';
  values.reputationRisk = 'Low exposure';
  values.competitors = 'Local fabricators';
  values.winProbability = '55';
  values.strategic = 'Yes — directly strategic';
  values.strategicReason = 'Infrastructure footprint';
  values.capitalAvailability = 'Within facility';
  values.workload = 'Capacity available';
  values.equipment = 'None required';
  values.labour = 'Stable';
  values.proposalWorkload = 'Manageable';
  values.ownVsSubcontract = 'Mostly own work';
  values.subcontractorAssessment = 'N/A';
  values.contractTerms = 'Standard';
  values.market = 'Stable steel prices';
  return values;
};

assert.equal(Object.keys(validateBidNoBidAssessment(emptyBidNoBidValues(), 'submit')).length > 0, true);
assert.equal(Object.keys(validateBidNoBidAssessment(filled(), 'submit')).length, 0);
assert.equal(bidNoBidAssessmentComplete({ values: filled() }), true);

const prefilled = prefillBidNoBidValues({
  title: 'Title A',
  description: 'Scope A',
  clientName: 'Client A',
  submissionDeadline: '2026-10-21',
  commercialKind: 'ITT',
  enquiryRef: 'CR-1',
  category: 'Oil & Gas',
  estimatedValue: 1000,
}, null, '2026-10-20');
assert.equal(prefilled.proposalTitle, 'Title A');
assert.equal(prefilled.opportunityType, 'ITT');
assert.equal(prefilled.internalDeadline, '2026-10-20');
assert.equal(prefilled.contractValue, '1000');

const parsed = parseBidNoBidAssessment(JSON.stringify({ values: filled(), completedBy: 'Ada' }));
assert.equal(parsed?.completedBy, 'Ada');
assert.equal(parsed?.values.client, 'Alnelly');

console.log('bid-no-bid-assessment.test.ts passed');
