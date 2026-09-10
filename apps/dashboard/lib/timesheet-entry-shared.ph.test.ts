import assert from 'node:assert/strict';
import {
  isPremiumTimesheetDay,
  overtimeDayTypeForDate,
  overtimePaysHoursAboveStandard,
  resolveTimesheetHours,
  timesheetDayKindLabel,
  timesheetDayRulesForDate,
} from './timesheet-entry-shared';

const independence = '2026-10-01';
const christmas = '2026-12-25';
const boxingOnSat = '2027-12-25';
const holidays = [independence, christmas, boxingOnSat, '2026-05-01'];

assert.equal(timesheetDayRulesForDate(independence, holidays).kind, 'PublicHoliday');
assert.equal(timesheetDayRulesForDate(independence, []).kind, 'Weekday');
assert.equal(timesheetDayRulesForDate(christmas, holidays).kind, 'PublicHoliday');
assert.equal(timesheetDayRulesForDate('2026-10-03', holidays).kind, 'Saturday');
assert.equal(timesheetDayRulesForDate('2026-10-04', holidays).kind, 'Sunday');
assert.equal(overtimeDayTypeForDate(boxingOnSat, holidays), 'Public Holiday');
assert.equal(overtimeDayTypeForDate(boxingOnSat, []), 'Saturday');
assert.equal(isPremiumTimesheetDay(independence, holidays), true);
assert.equal(isPremiumTimesheetDay(independence, []), false);
assert.equal(overtimePaysHoursAboveStandard('Weekday'), true);
assert.equal(overtimePaysHoursAboveStandard('Night'), true);
assert.equal(overtimePaysHoursAboveStandard('Public Holiday'), false);
assert.equal(timesheetDayKindLabel('PublicHoliday'), 'Public Holiday');

const phHours = resolveTimesheetHours({ date: independence, holidayDates: holidays, shiftLabel: '01 (Day)' });
assert.equal(phHours.kind, 'PublicHoliday');
assert.equal(phHours.standardProductiveHours, 8);
assert.equal(phHours.grossHours, 9);

const nightPh = resolveTimesheetHours({ date: independence, holidayDates: holidays, shiftLabel: '02 (Night)' });
assert.equal(nightPh.kind, 'PublicHoliday');
assert.equal(nightPh.shiftKind, 'Night');
assert.equal(nightPh.standardProductiveHours, 8);
assert.equal(nightPh.grossHours, 8);

const workingDatesInLeaveRange = (startDate: string, endDate: string, holidayDates: string[] = []) => {
  const dates: string[] = [];
  for (let cursor = new Date(`${startDate}T00:00:00.000Z`); cursor <= new Date(`${endDate}T00:00:00.000Z`); cursor = new Date(cursor.getTime() + 86400000)) {
    const iso = cursor.toISOString().slice(0, 10);
    if (timesheetDayRulesForDate(iso, holidayDates).kind === 'Weekday') dates.push(iso);
  }
  return dates;
};

const leaveWeek = workingDatesInLeaveRange('2026-09-28', '2026-10-02', holidays);
assert.deepEqual(leaveWeek, ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-02']);
assert.equal(leaveWeek.includes(independence), false);

console.log('timesheet public-holiday recognition tests passed');
