import assert from 'node:assert/strict';
import { supervisorTimesheetMessage, supervisorWorkCenterLabel } from './timesheet-entry-shared.ts';

assert.equal(supervisorWorkCenterLabel('Galvanizing / P0277 - Mr ADEBOBOLA MORUF AKINSANYA'), 'Galvanizing');
assert.equal(supervisorWorkCenterLabel('Blasting'), 'Blasting');

assert.equal(
  supervisorTimesheetMessage('ABEL DANIEL (C2225) is already booked on Galvanizing / P0277 - Mr ADEBOBOLA MORUF AKINSANYA for this date.'),
  'ABEL DANIEL already has hours on Galvanizing today. One person cannot be submitted on two timesheets for the same day.',
);

assert.equal(
  supervisorTimesheetMessage('Every booked employee is already on another timesheet for this date (Galvanizing). Nothing left to submit here.'),
  'Every worker with hours here is already on another timesheet today. There is nothing new to submit on this sheet.',
);

assert.equal(
  supervisorTimesheetMessage('EPERM: operation not permitted, open \'F:\\\\Dorman-Long\\\\dle-connect\\\\apps\\\\dashboard\\\\data\\\\hris\\\\holidays.json\''),
  'Timesheets could not load completely. Refresh the page. If this continues, contact IT.',
);

assert.equal(
  supervisorTimesheetMessage('Timesheet data requires DLE_Enterprise (login failed). Verify DLE_ENTERPRISE_DB_HOST, DLE_ENTERPRISE_DB_NAME, and credentials on this server.'),
  'Timesheets are temporarily unavailable. Contact IT.',
);

assert.equal(
  supervisorTimesheetMessage('Hours mismatch for FESTUS: Used + Idle must equal Total.'),
  'Hours do not add up for FESTUS. Used hours plus break must equal total hours. Go back and check that line.',
);

assert.equal(
  supervisorTimesheetMessage('At least one project allocation is required before submitting this timesheet.'),
  'Choose the job number this crew worked on, then submit. The system will not put hours on a miscellaneous job for you.',
);

console.log('timesheet-entry-shared.supervisor.test.ts: ok');
