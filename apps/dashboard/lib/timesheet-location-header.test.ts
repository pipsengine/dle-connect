import assert from 'node:assert/strict';
import {
  buildTimesheetHeaderId,
  requiresMiscellaneousTimesheetConfirm,
  resolveAutoDistributeProjectCode,
  selectTimesheetHeaderForLocation,
  timesheetWorkCentersMatch,
} from './timesheet-entry-shared.ts';

assert.equal(
  buildTimesheetHeaderId({
    date: '2026-08-17',
    supervisorId: 'P0436 - Mr SUNDAY OKEWU',
    workCenterName: 'Maintenance',
    shiftLabel: '01 (Day)',
    locationName: 'AGEGE',
  }).endsWith('-agege'),
  true,
);
assert.notEqual(
  buildTimesheetHeaderId({
    date: '2026-08-17',
    supervisorId: 'P0436 - Mr SUNDAY OKEWU',
    workCenterName: 'Maintenance',
    shiftLabel: '01 (Day)',
    locationName: 'AGEGE',
  }),
  buildTimesheetHeaderId({
    date: '2026-08-17',
    supervisorId: 'P0436 - Mr SUNDAY OKEWU',
    workCenterName: 'Maintenance',
    shiftLabel: '01 (Day)',
    locationName: 'IDI-ORO',
  }),
);

const legacy = { id: 'hdr-legacy', locationName: null as string | null };
const agege = { id: 'hdr-agege', locationName: 'AGEGE' };
const idiOro = { id: 'hdr-idioro', locationName: 'IDI-ORO' };

const homeAdopt = selectTimesheetHeaderForLocation([legacy], 'AGEGE', 'AGEGE', 'hdr-agege-loc');
assert.equal(homeAdopt.header?.id, 'hdr-legacy');
assert.equal(homeAdopt.adoptLegacy, true);
assert.equal(homeAdopt.createLocationSpecific, false);

const otherYard = selectTimesheetHeaderForLocation([legacy], 'IDI-ORO', 'AGEGE', 'hdr-idioro-loc');
assert.equal(otherYard.header, null);
assert.equal(otherYard.createLocationSpecific, true);

const located = selectTimesheetHeaderForLocation([agege, idiOro], 'IDI-ORO', 'AGEGE', 'hdr-idioro');
assert.equal(located.header?.id, 'hdr-idioro');
assert.equal(located.adoptLegacy, false);

assert.equal(resolveAutoDistributeProjectCode([{ code: 'DL0062' }, { code: 'DL1985' }], []), '');
assert.equal(
  resolveAutoDistributeProjectCode(
    [{ code: 'DL0062' }, { code: 'DL1985' }],
    [{ projectAllocations: [{ projectCode: 'DL1985', hours: 8 }] }],
  ),
  'DL1985',
);
assert.equal(
  resolveAutoDistributeProjectCode([{ code: 'DL0062' }, { code: 'DL1985' }], [], 'DL1985'),
  'DL1985',
);
assert.equal(resolveAutoDistributeProjectCode([{ code: 'DL0062' }], []), 'DL0062');

assert.equal(requiresMiscellaneousTimesheetConfirm(['DL0062']), true);
assert.equal(requiresMiscellaneousTimesheetConfirm(['DL0062', 'DL1985']), false);
assert.equal(requiresMiscellaneousTimesheetConfirm([]), false);

assert.equal(timesheetWorkCentersMatch('Maintenance', 'Maintenance'), true);
assert.equal(timesheetWorkCentersMatch('Agege Maintenance', 'Maintenance'), true);
assert.equal(timesheetWorkCentersMatch('Electrical Maintenance', 'Maintenance'), false);
assert.equal(timesheetWorkCentersMatch('Blasting', 'Galvanizing'), false);
assert.equal(timesheetWorkCentersMatch('Blasting', 'Blasting'), true);

console.log('timesheet-location-header.test.ts: ok');
