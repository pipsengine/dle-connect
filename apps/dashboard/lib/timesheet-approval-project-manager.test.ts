import assert from 'node:assert/strict';
import {
  assignedProjectApproverName,
  formatProjectManagerLabel,
  isEligibleTimesheetProjectManager,
  looksLikeCrewSupervisorRole,
  looksLikeProjectManagerRole,
  pickLocationProjectManager,
  resolveAssignedProjectManager,
} from './timesheet-approval-project-manager.ts';

assert.equal(looksLikeProjectManagerRole('SPM - SENIOR PROJECT MANAGER'), true);
assert.equal(looksLikeProjectManagerRole('GMO - GENERAL MANAGER, OPERATIONS'), true);
assert.equal(looksLikeProjectManagerRole('FITTER SUPERVISOR'), false);
assert.equal(looksLikeCrewSupervisorRole('FITTER SUPERVISOR'), true);
assert.equal(looksLikeCrewSupervisorRole('SPM - SENIOR PROJECT MANAGER'), false);

assert.equal(isEligibleTimesheetProjectManager({
  label: 'MOMOH MOHAMMED',
  employeeCode: 'C1882',
  jobTitle: 'FITTER SUPERVISOR',
}), false);
assert.equal(isEligibleTimesheetProjectManager({
  label: 'P0455 - IDRIS ASIPITA ABUBAKAR',
  employeeCode: 'P0455',
  jobTitle: 'SPM - SENIOR PROJECT MANAGER',
}), true);
assert.equal(isEligibleTimesheetProjectManager({
  label: 'P0442 - Mrs TEMITOPE ABIODUN ODULATE',
  employeeCode: 'P0442',
  jobTitle: 'GMO - GENERAL MANAGER, OPERATIONS',
}), true);
assert.equal(isEligibleTimesheetProjectManager({
  label: 'P0436 - Mr. OKEWU SUNDAY',
  employeeCode: 'P0436',
  jobTitle: 'PJ200 - MAINTENANCE MANAGER',
}), true);

assert.equal(
  pickLocationProjectManager('AGEGE', [
    { site: 'AGEGE', manager: 'P0442 - Mrs TEMITOPE ABIODUN ODULATE', employeeCode: 'P0442', jobTitle: 'GMO - GENERAL MANAGER, OPERATIONS' },
    { site: 'AGEGE', manager: 'P0442 - Mrs TEMITOPE ABIODUN ODULATE', employeeCode: 'P0442', jobTitle: 'GMO - GENERAL MANAGER, OPERATIONS' },
    { site: 'AGEGE', manager: 'L1615 - OGUNJIDE ADEKUNLE', employeeCode: 'L1615', jobTitle: 'SUPERVISOR' },
    { site: 'IDI_ORO', manager: 'P0455 - IDRIS ASIPITA ABUBAKAR', employeeCode: 'P0455', jobTitle: 'SPM - SENIOR PROJECT MANAGER' },
  ]),
  'P0442 - Mrs TEMITOPE ABIODUN ODULATE',
);

assert.equal(
  resolveAssignedProjectManager({
    projectCode: 'DL2601',
    catalogManager: 'P0455 - IDRIS ASIPITA ABUBAKAR',
    catalogEligible: true,
    locationManager: 'P0442 - Mrs TEMITOPE ABIODUN ODULATE',
    storedManager: 'MOMOH MOHAMMED',
    storedEligible: false,
  }),
  'P0455 - IDRIS ASIPITA ABUBAKAR',
);

assert.equal(
  resolveAssignedProjectManager({
    projectCode: 'DL1949',
    catalogManager: 'MOMOH MOHAMMED',
    catalogEligible: false,
    locationManager: 'P0442 - Mrs TEMITOPE ABIODUN ODULATE',
    storedManager: 'MOMOH MOHAMMED',
    storedEligible: false,
  }),
  'P0442 - Mrs TEMITOPE ABIODUN ODULATE',
);

assert.equal(
  resolveAssignedProjectManager({
    projectCode: 'DL0062',
    catalogManager: 'Someone Else',
    catalogEligible: true,
    locationManager: 'P0455 - IDRIS ASIPITA ABUBAKAR',
  }),
  'P0442 - Mrs TEMITOPE ABIODUN ODULATE',
);

assert.equal(assignedProjectApproverName('P0442 - Mrs TEMITOPE ABIODUN ODULATE'), 'P0442 - Mrs TEMITOPE ABIODUN ODULATE');
assert.equal(assignedProjectApproverName('Project manager not set'), '');
assert.equal(formatProjectManagerLabel('P0455', 'IDRIS ASIPITA ABUBAKAR'), 'P0455 - IDRIS ASIPITA ABUBAKAR');

console.log('timesheet-approval-project-manager.test.ts: ok');
