import assert from 'node:assert/strict';
import {
  awardedToDleOf,
  clientStatusOf,
  congratulationBody,
  dueReminderSlots,
  bidChoiceOf,
  dateOnly,
  departmentalReviewAllowed,
  internalDeadlineFromExternal,
  internalDeadlineOf,
  stageMatchesActor,
  commercialKindOf,
  commercialReviewOf,
  documentChecklistFor,
  isActiveResponse,
  isPreparationRecord,
  matchesCommercialTab,
  mdDecisionOf,
  mdDecisionPermitted,
  registerStatusOf,
  tenderApprovalBucket,
  preparationOf,
  reminderKey,
  requiresUrgentAuthorization,
  tenderDraftFromEnquiry,
} from './tender-workflow.ts';

const external = '2026-10-20';
assert.equal(dateOnly(new Date('2026-10-21T00:00:00.000Z')), '2026-10-21');
assert.equal(dateOnly('2026-12-10T00:00:00.000Z'), '2026-12-10');
assert.equal(internalDeadlineFromExternal(external), '2026-10-19', 'internal deadline is 24 elapsed hours earlier in West Africa Time');
assert.equal(internalDeadlineFromExternal('2026-10-16'), '2026-10-15', 'a Friday external deadline moves exactly one elapsed day, including onto a weekday calculation');

const soon = new Date('2026-10-20T00:00:00+01:00');
assert.equal(requiresUrgentAuthorization(external, new Date(soon.getTime() - 10 * 60 * 60 * 1000)), true);
assert.equal(requiresUrgentAuthorization(external, new Date(soon.getTime() - 30 * 60 * 60 * 1000)), false);

const deadline = new Date('2026-10-20T00:00:00+01:00');
const at72 = new Date(deadline.getTime() - 72 * 60 * 60 * 1000);
const at24 = new Date(deadline.getTime() - 24 * 60 * 60 * 1000);
const after = new Date(deadline.getTime() + 60 * 60 * 1000);
assert.deepEqual(dueReminderSlots(external, at72), [72]);
assert.deepEqual(dueReminderSlots(external, at24), [72, 48, 24]);
assert.deepEqual(dueReminderSlots(external, after), []);
assert.equal(reminderKey('opp-1', 'internal', 72), reminderKey('opp-1', 'internal', 72));
assert.notEqual(reminderKey('opp-1', 'internal', 72), reminderKey('opp-1', 'external', 72));

const draft = tenderDraftFromEnquiry({
  title: 'Jetty rehabilitation',
  clientName: 'NPA',
  source: 'Client Direct',
  referenceNo: 'ENQ-100',
  ownerName: 'Enquiry Officer',
  opportunityType: 'Enquiry',
  submissionDeadline: external,
}, new Date('2026-10-01T00:00:00+01:00'));
assert.equal(draft.ownerName, '');
assert.equal(draft.enquiryRef, 'ENQ-100');
assert.equal(draft.closingDate, '2026-10-19');
assert.equal(draft.preparationStatus, 'Not Started');
assert.equal(draft.clientStatus, 'Pending');
assert.equal(draft.awardedToDle, 'Pending Decision');

const decided = { status: 'Open', stage: 'Submitted', clientStatus: 'Awarded', awardedToDle: 'No', preparationStatus: 'Submitted' };
assert.equal(preparationOf(decided), 'Submitted');
assert.equal(preparationOf({ status: 'Open', stage: 'Open', ownerName: '', preparationStatus: 'Not Started', opportunityType: 'Client Tender' }), 'In Progress');
assert.equal(preparationOf({ status: 'Draft', stage: 'Tender/Bid', preparationStatus: 'Not Started' }), 'Not Started');
assert.equal(preparationOf({ status: 'Open', stage: 'Enquiry', ownerName: '', opportunityType: 'Enquiry', preparationStatus: 'In Progress' }), 'Not Started');
assert.equal(clientStatusOf(decided), 'Awarded');
assert.equal(awardedToDleOf(decided), 'No');
assert.equal(awardedToDleOf({ status: 'Awarded', stage: 'Awarded' }), 'Pending Decision');

assert.equal(internalDeadlineOf({ submissionDeadline: '2026-10-21', closingDate: '2001-10-19' }), '2026-10-20');
assert.equal(internalDeadlineOf({ submissionDeadline: '2026-10-15', closingDate: '2026-10-14' }), '2026-10-14');
assert.equal(internalDeadlineOf({ submissionDeadline: '2026-10-21', closingDate: '2026-09-01', deadlineOverrideReason: 'Client moved the internal review' }), '2026-09-01');

const body = congratulationBody('Jetty rehabilitation', 'NPA');
assert.match(body, /CONGRATULATIONS, TEAM DORMAN LONG ENGINEERING/);
assert.match(body, /Jetty rehabilitation/);
assert.match(body, /NPA/);
assert.doesNotMatch(body, /NGN|value|amount/i);

assert.equal(bidChoiceOf({ bidDecision: 'Bid' }), 'Bid');
assert.equal(bidChoiceOf({ bidDecision: 'No Bid' }), 'No Bid');
assert.equal(tenderApprovalBucket({ opportunityType: 'Client Tender', status: 'Draft', stage: 'Tender/Bid' }), 'enquiry');
assert.equal(tenderApprovalBucket({ opportunityType: 'Client Tender', status: 'Open', stage: 'Tender/Bid' }), 'pending');
assert.equal(tenderApprovalBucket({ opportunityType: 'ITT', commercialReview: 'Awaiting Review', status: 'Under Review', stage: 'GM Commercial Review' }), 'enquiry');
assert.equal(tenderApprovalBucket({ opportunityType: 'ITT', commercialReview: 'Reviewed', status: 'Under Review', stage: 'MD Decision' }), 'pending');
assert.equal(tenderApprovalBucket({ opportunityType: 'Client Tender', bidDecision: 'Bid', status: 'Open', stage: 'Bid Preparation', ownerName: 'Ada' }), 'review');
assert.equal(tenderApprovalBucket({ opportunityType: 'Client Tender', bidDecision: 'No Bid', status: 'Closed', stage: 'No Bid' }), 'completed');
assert.equal(tenderApprovalBucket({ opportunityType: 'Enquiry', stage: 'Enquiry' }), 'enquiry');

assert.equal(commercialKindOf({ opportunityType: 'Enquiry', stage: 'Enquiry' }), 'EOI');
assert.equal(commercialKindOf({ commercialKind: 'RFQ', opportunityType: 'Enquiry' }), 'RFQ');
assert.equal(commercialKindOf({ tenderType: 'Request for Quotation' }), 'RFQ');
assert.equal(commercialKindOf({ opportunityType: 'Client Tender' }), 'ITT');
assert.equal(commercialReviewOf({ commercialReview: 'Awaiting Review', status: 'Under Review', opportunityType: 'ITT' }), 'Awaiting Review');
assert.equal(commercialReviewOf({ status: 'Open', opportunityType: 'Client Tender' }), 'Reviewed');
assert.equal(mdDecisionOf({ bidDecision: 'Bid' }), 'BID');
assert.equal(mdDecisionOf({ bidDecision: '' }), 'Pending');
assert.equal(registerStatusOf({ commercialReview: 'Awaiting Review', status: 'Under Review', stage: 'GM Commercial Review', opportunityType: 'ITT', preparationStatus: 'Not Started' }), 'Awaiting GM Review');
assert.equal(registerStatusOf({ commercialReview: 'Reviewed', status: 'Under Review', stage: 'MD Decision', opportunityType: 'RFQ', preparationStatus: 'Not Started' }), 'Awaiting MD Decision');
assert.equal(registerStatusOf({ commercialReview: 'Reviewed', bidDecision: 'Bid', status: 'Open', stage: 'Bid Preparation', opportunityType: 'ITT', preparationStatus: 'Not Started' }), 'Not Started');
assert.equal(registerStatusOf({ commercialReview: 'Reviewed', bidDecision: 'Bid', status: 'Open', stage: 'Bid Preparation', opportunityType: 'ITT', preparationStatus: 'In Progress', acknowledgedAt: '2026-10-16' }), 'In Progress');
assert.equal(registerStatusOf({ bidDecision: 'No Bid', status: 'Closed', stage: 'No Bid', opportunityType: 'EOI' }), 'Closed');
assert.equal(registerStatusOf({ status: 'Draft', stage: 'Registration', opportunityType: 'ITT', commercialKind: 'ITT' }), 'Not Started');
assert.equal(matchesCommercialTab({ commercialKind: 'EOI', commercialReview: 'Awaiting Review', status: 'Under Review', opportunityType: 'EOI' }, 'EOI'), true);
assert.equal(matchesCommercialTab({ commercialKind: 'EOI', commercialReview: 'Awaiting Review', status: 'Under Review', opportunityType: 'EOI' }, 'ITT'), false);
assert.equal(documentChecklistFor('EOI').length < documentChecklistFor('ITT').length, true);
assert.equal(mdDecisionPermitted({ commercialReview: 'Awaiting Review', status: 'Under Review', opportunityType: 'ITT' }).ok, false);
assert.equal(mdDecisionPermitted({ commercialReview: 'Reviewed', status: 'Under Review', opportunityType: 'ITT' }).ok, true);
assert.equal(mdDecisionPermitted({ commercialReview: 'Awaiting Review', status: 'Under Review', opportunityType: 'ITT' }, 'Client deadline leaves no time for the normal review.').exception, true);

const dashboardRows = [
  { status: 'Draft', stage: 'Registration', opportunityType: 'ITT', commercialKind: 'ITT' },
  { commercialReview: 'Awaiting Review', status: 'Under Review', stage: 'GM Commercial Review', opportunityType: 'ITT' },
  { commercialReview: 'Reviewed', status: 'Under Review', stage: 'MD Decision', opportunityType: 'RFQ' },
  { commercialReview: 'Reviewed', bidDecision: 'Bid', status: 'Open', stage: 'Bid Preparation', opportunityType: 'ITT', preparationStatus: 'Not Started' },
  { commercialReview: 'Reviewed', bidDecision: 'Bid', status: 'Open', stage: 'Bid Preparation', opportunityType: 'EOI', preparationStatus: 'In Progress', acknowledgedAt: '2026-10-16' },
  { bidDecision: 'Bid', status: 'Submitted', stage: 'Submitted', opportunityType: 'RFQ', preparationStatus: 'Submitted' },
  { bidDecision: 'No Bid', status: 'Closed', stage: 'No Bid', opportunityType: 'EOI' },
];
const statusCounts = dashboardRows.map((row) => registerStatusOf(row));
const statusTally = statusCounts.reduce<Record<string, number>>((map, status) => ({ ...map, [status]: (map[status] || 0) + 1 }), {});
assert.equal(Object.values(statusTally).reduce((sum, count) => sum + count, 0), dashboardRows.length, 'each opportunity is counted in exactly one dashboard status');
assert.equal(statusTally['Not Started'], 2);
assert.equal(statusTally.Closed, 1);
assert.equal(statusTally['Awaiting GM Review'], 1);
assert.equal(statusTally['Awaiting MD Decision'], 1);
assert.equal(isActiveResponse(dashboardRows[3]), true);
assert.equal(isActiveResponse(dashboardRows[1]), false);
assert.equal(isActiveResponse(dashboardRows[6]), false);
assert.equal(isPreparationRecord(dashboardRows[5]), true);
assert.equal(isPreparationRecord(dashboardRows[6]), false);
assert.equal(isPreparationRecord(dashboardRows[2]), false);
assert.equal(departmentalReviewAllowed({ bidDecision: 'Bid', ownerName: 'Ada' }), true);
assert.equal(departmentalReviewAllowed({ bidDecision: 'Bid', ownerName: '' }), false);
assert.equal(departmentalReviewAllowed({ bidDecision: 'No Bid', ownerName: 'Ada' }), false);
assert.equal(stageMatchesActor('Engineering Review', 'Engineering', []), true);
assert.equal(stageMatchesActor('Finance Review', 'Sales', []), false);
assert.equal(stageMatchesActor('Management Approval', 'Operations', ['Managing Director']), true);

console.log('tender workflow rules passed');
