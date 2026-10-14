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
assert.equal(tenderApprovalBucket({ opportunityType: 'Client Tender', status: 'Draft', stage: 'Tender/Bid' }), 'pending');
assert.equal(tenderApprovalBucket({ opportunityType: 'Client Tender', bidDecision: 'Bid', status: 'Open', stage: 'Bid Preparation', ownerName: 'Ada' }), 'review');
assert.equal(tenderApprovalBucket({ opportunityType: 'Client Tender', bidDecision: 'No Bid', status: 'Closed', stage: 'No Bid' }), 'completed');
assert.equal(tenderApprovalBucket({ opportunityType: 'Enquiry', stage: 'Enquiry' }), 'enquiry');
assert.equal(departmentalReviewAllowed({ bidDecision: 'Bid', ownerName: 'Ada' }), true);
assert.equal(departmentalReviewAllowed({ bidDecision: 'Bid', ownerName: '' }), false);
assert.equal(departmentalReviewAllowed({ bidDecision: 'No Bid', ownerName: 'Ada' }), false);
assert.equal(stageMatchesActor('Engineering Review', 'Engineering', []), true);
assert.equal(stageMatchesActor('Finance Review', 'Sales', []), false);
assert.equal(stageMatchesActor('Management Approval', 'Operations', ['Managing Director']), true);

console.log('tender workflow rules passed');
