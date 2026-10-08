/**
 * Booking summary classification.
 * Run: npx tsx apps/dashboard/components/timesheet-management-portal/lib/booking-summary.test.js
 */
import assert from 'node:assert/strict';
import { buildBookingSummary } from './booking-summary.js';

const holidays = ['2026-10-01'];
const row = (code) => buildBookingSummary(bookings.filter((item) => item.employeeCode === code), holidays, 8)[0];
const day = (code, date, regular, ovt = 0, night = 0) => ({
  employeeCode: code,
  employeeName: code,
  workDate: date,
  shift: 'Day',
  regularHours: regular,
  ovtHours: ovt,
  nightHours: night,
  attendanceStatus: '',
  status: 'Submitted',
});

const bookings = [
  day('C1607', '2026-10-08', 8),
  day('C1607', '2026-09-19', 6),
  day('C0695', '2026-09-16', 8, 3, 1),
  day('C0695', '2026-09-19', 6, 5, 1),
  day('C0695', '2026-10-01', 6, 2, 0),
  day('C0695', '2026-10-04', 6, 7, 1),
  day('C2221', '2026-10-08', 8),
  day('C2221', '2026-10-07', 8),
  {
    employeeCode: 'C2537',
    employeeName: 'C2537',
    workDate: '2026-10-01',
    shift: 'Night',
    regularHours: 6,
    ovtHours: 0,
    nightHours: 1,
    attendanceStatus: '',
    status: 'Submitted',
  },
  { ...day('C0293', '2026-09-19', 8), attendanceStatus: 'Approved Leave' },
];

const chukwudumebi = row('C1607');
assert.equal(chukwudumebi.days.size, 2);
assert.equal(chukwudumebi.weekdayHours, 8);
assert.equal(chukwudumebi.saturdayHours, 6);
assert.equal(chukwudumebi.status, 'Exception', 'a 6-hour Saturday is not a full day');

const julius = row('C0695');
assert.equal(julius.weekdayHours, 8, 'Independence Day leaves the weekday column');
assert.equal(julius.weekdayOvt, 3);
assert.equal(julius.saturdayHours, 6);
assert.equal(julius.sundayHours, 6);
assert.equal(julius.phHours, 6);
assert.equal(julius.phOvt, 2);
assert.equal(julius.night, 3, 'night sessions are dates, not a sum of the flag');
assert.equal(julius.nightHours, 0, 'the night flag is not hours');
assert.equal(julius.status, 'Exception');

const fullDays = row('C2221');
assert.equal(fullDays.weekdayHours, 16);
assert.equal(fullDays.days.size, 2);
assert.equal(fullDays.status, 'Balanced');

const nightHoliday = row('C2537');
assert.equal(nightHoliday.phHours, 0, 'night-shift hours stay out of the holiday column');
assert.equal(nightHoliday.weekdayHours, 0);
assert.equal(nightHoliday.night, 1);
assert.equal(nightHoliday.nightHours, 6);
assert.equal(nightHoliday.status, 'Exception');

assert.equal(row('C0293'), undefined, 'approved leave on Saturday is not a booked day');

console.log('booking-summary.test.js: ok');
