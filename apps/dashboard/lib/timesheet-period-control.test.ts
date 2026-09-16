/**
 * Manual timesheet period control: September stays open; System-opened October is removed.
 * Run: npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/lib/timesheet-period-control.test.ts
 */
import assert from 'node:assert/strict';
import {
  TIMESHEET_OCTOBER_2026_PERIOD_ID,
  TIMESHEET_SEPTEMBER_2026_PERIOD_ID,
  findOpenTimesheetPeriod,
  repairManualTimesheetPeriods,
} from './timesheet-period-control.ts';

const september = {
  id: TIMESHEET_SEPTEMBER_2026_PERIOD_ID,
  name: 'September 2026 Period',
  startDate: '2026-08-16',
  endDate: '2026-09-15',
  status: 'Open' as const,
};
const nowIso = '2026-09-16T08:00:00.000Z';

const repaired = repairManualTimesheetPeriods(
  [
    {
      id: TIMESHEET_OCTOBER_2026_PERIOD_ID,
      name: 'October 2026 Period',
      startDate: '2026-09-16',
      endDate: '2026-10-15',
      status: 'Open',
      openedBy: 'System',
    },
    {
      id: TIMESHEET_SEPTEMBER_2026_PERIOD_ID,
      name: 'September 2026 Period',
      startDate: '2026-08-16',
      endDate: '2026-09-15',
      status: 'Closed',
      closedBy: 'System',
    },
  ],
  september,
  nowIso,
);

assert.equal(repaired.removedOctober, true);
assert.equal(repaired.reopenedSeptember, true);
assert.equal(findOpenTimesheetPeriod(repaired.periods)?.id, TIMESHEET_SEPTEMBER_2026_PERIOD_ID);
assert.equal(repaired.periods.some((period) => period.id === TIMESHEET_OCTOBER_2026_PERIOD_ID), false);

const humanClosed = repairManualTimesheetPeriods(
  [{
    id: TIMESHEET_SEPTEMBER_2026_PERIOD_ID,
    name: 'September 2026 Period',
    startDate: '2026-08-16',
    endDate: '2026-09-15',
    status: 'Closed',
    closedBy: 'Payroll Officer',
  }],
  september,
  nowIso,
);
assert.equal(humanClosed.reopenedSeptember, false);
assert.equal(humanClosed.periods[0].status, 'Closed');

const humanOctober = repairManualTimesheetPeriods(
  [{
    id: TIMESHEET_OCTOBER_2026_PERIOD_ID,
    name: 'October 2026 Period',
    startDate: '2026-09-16',
    endDate: '2026-10-15',
    status: 'Open',
    openedBy: 'Payroll Officer',
  }],
  september,
  nowIso,
);
assert.equal(humanOctober.removedOctober, false);

const bothOpen = findOpenTimesheetPeriod([
  {
    id: TIMESHEET_OCTOBER_2026_PERIOD_ID,
    name: 'October 2026 Period',
    startDate: '2026-09-16',
    endDate: '2026-10-15',
    status: 'Open',
    openedBy: 'Payroll Officer',
  },
  {
    id: TIMESHEET_SEPTEMBER_2026_PERIOD_ID,
    name: 'September 2026 Period',
    startDate: '2026-08-16',
    endDate: '2026-09-15',
    status: 'Open',
    openedBy: 'Payroll Officer',
  },
]);
assert.equal(bothOpen?.id, TIMESHEET_SEPTEMBER_2026_PERIOD_ID);

console.log('timesheet-period-control tests passed');
