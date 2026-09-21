import assert from 'node:assert/strict';
import {
  PAST_LEAVE_APPLICATION_MESSAGE,
  defaultChargeableDatesInPeriod,
  essLeaveApplicationHasPastDates,
  leaveCalendarTodayIso,
  pastLeaveDatesInApplication,
} from './leave-day-engine.ts';

assert.equal(leaveCalendarTodayIso('2026-09-21T00:30:00+01:00'), '2026-09-21');
assert.equal(leaveCalendarTodayIso('2026-09-20T23:30:00Z'), '2026-09-21');

assert.deepEqual(
  pastLeaveDatesInApplication({ startDate: '2026-09-01', selectedDates: ['2026-09-01', '2026-09-22'] }, '2026-09-21'),
  ['2026-09-01'],
);
assert.equal(
  essLeaveApplicationHasPastDates({ startDate: '2026-09-21', selectedDates: ['2026-09-21', '2026-09-22'] }, '2026-09-21'),
  false,
);
assert.equal(
  essLeaveApplicationHasPastDates({ startDate: '2026-09-01', selectedDates: ['2026-09-01', '2026-09-02'] }, '2026-09-21'),
  true,
);
assert.equal(PAST_LEAVE_APPLICATION_MESSAGE.includes('already passed'), true);

const working = defaultChargeableDatesInPeriod('2026-09-18', '2026-09-22', ['2026-09-25'], { notBefore: '2026-09-21' });
assert.equal(working.includes('2026-09-18'), false);
assert.equal(working.includes('2026-09-21'), true);

console.log('leave-day-engine past-apply tests: ok');
