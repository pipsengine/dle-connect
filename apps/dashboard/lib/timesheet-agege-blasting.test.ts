import assert from 'node:assert/strict';
import {
  AGEGE_BLASTING_WORK_CENTER,
  AGEGE_TIMESHEET_LOCATION,
  applyAgegeBlastingSupervisorContext,
  dedupeTimesheetLocationLabels,
  extractSupervisorEmployeeCode,
  isAgegeBlastingSupervisor,
  isTimesheetTradeLabelLocation,
  normalizeSupervisorMatchKey,
  normalizeTimesheetLocationLabel,
  resolveAgegeLocationLabel,
  supervisorCodeLookupVariants,
  supervisorCodesMatch,
} from './timesheet-agege-blasting.ts';

assert.equal(extractSupervisorEmployeeCode('C1001 - JIMOH GBADAMOSI'), 'C1001');
assert.equal(extractSupervisorEmployeeCode('JIMOH GBADAMOSI [C1001]'), 'C1001');
assert.equal(isAgegeBlastingSupervisor('JIMOH GBADAMOSI [C1001]'), true);
assert.equal(isAgegeBlastingSupervisor('P0277 - Someone'), false);

assert.equal(normalizeSupervisorMatchKey('P0013'), '13');
assert.equal(normalizeSupervisorMatchKey('0013 - Mr KARONWI'), '13');
assert.equal(normalizeSupervisorMatchKey('P0013 - Mr SAMUEL KARONWI'), '13');
assert.equal(supervisorCodesMatch('P0013', '0013'), true);
assert.equal(supervisorCodesMatch('P0013 - Mr SAMUEL KARONWI', '0013 - Mr KARONWI'), true);
assert.equal(supervisorCodesMatch('C1001', '1001'), false);
assert.equal(supervisorCodesMatch('P0289', 'P0289 - Ebele'), true);
assert.ok(supervisorCodeLookupVariants('P0013').includes('0013'));
assert.ok(supervisorCodeLookupVariants('0013').includes('P0013'));

assert.equal(normalizeTimesheetLocationLabel('AGEGE - AGEGE'), 'AGEGE');
assert.equal(normalizeTimesheetLocationLabel('Agege-Agege'), 'AGEGE');
assert.equal(normalizeTimesheetLocationLabel('AGEGE'), 'AGEGE');
assert.equal(normalizeTimesheetLocationLabel('Lagos - Idi Oro'), 'Lagos - Idi Oro');
assert.deepEqual(
  dedupeTimesheetLocationLabels(['AGEGE', 'AGEGE - AGEGE', 'Abuja', 'AGEGE - AGEGE']),
  ['Abuja', 'AGEGE'],
);

assert.equal(isTimesheetTradeLabelLocation('Painting', ['Painting', 'Blasting']), true);
assert.equal(isTimesheetTradeLabelLocation('AGEGE - AGEGE', ['Painting', 'Blasting']), false);
assert.equal(resolveAgegeLocationLabel(['IDI_ORO', 'AGEGE - AGEGE']), AGEGE_TIMESHEET_LOCATION);

const forced = applyAgegeBlastingSupervisorContext({
  supervisorValue: 'C1001 - JIMOH GBADAMOSI',
  locationName: 'Painting',
  workCenterName: 'Painting',
  locationNames: ['AGEGE - AGEGE', 'IDI_ORO'],
  workCenterNames: ['Painting', 'Blasting'],
});
assert.equal(forced.forced, true);
assert.equal(forced.locationName, AGEGE_TIMESHEET_LOCATION);
assert.equal(forced.workCenterName, AGEGE_BLASTING_WORK_CENTER);

const untouched = applyAgegeBlastingSupervisorContext({
  supervisorValue: 'P0436 - Sunday',
  locationName: 'IDI_ORO',
  workCenterName: 'Maintenance',
  locationNames: ['IDI_ORO'],
  workCenterNames: ['Maintenance'],
});
assert.equal(untouched.forced, false);
assert.equal(untouched.locationName, 'IDI_ORO');
assert.equal(untouched.workCenterName, 'Maintenance');

console.log('timesheet-agege-blasting.test.ts: ok');
