import assert from 'node:assert/strict';
import {
  PAST_LEAVE_APPLICATION_MESSAGE,
  defaultChargeableDatesInPeriod,
  essLeaveApplicationHasPastDates,
  leaveCalendarMarkDates,
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

assert.deepEqual(
  leaveCalendarMarkDates({
    from: '2026-11-02',
    to: '2026-11-23',
    dates: ['2026-11-02', '2026-11-04', '2026-11-06', '2026-11-09', '2026-11-11', '2026-11-13', '2026-11-16'],
    status: 'Approved',
  }),
  ['2026-11-02', '2026-11-04', '2026-11-06', '2026-11-09', '2026-11-11', '2026-11-13', '2026-11-16'],
);
assert.deepEqual(
  leaveCalendarMarkDates({ from: '2026-07-13', to: '2026-07-17', days: 5, status: 'Approved' }),
  ['2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16', '2026-07-17'],
);
assert.deepEqual(
  leaveCalendarMarkDates({ from: '2026-11-02', to: '2026-11-23', days: 7, status: 'Approved' }),
  [],
);
assert.deepEqual(
  leaveCalendarMarkDates({ from: '2026-11-06', to: '2026-11-09', days: 2, status: 'Approved' }),
  ['2026-11-06', '2026-11-09'],
);
assert.deepEqual(
  leaveCalendarMarkDates({ from: '2026-11-05', to: '2026-11-05', status: 'Public Holiday' }),
  [],
);

console.log('leave-day-engine past-apply tests: ok');
