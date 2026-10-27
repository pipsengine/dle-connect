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
  day('C2492', '2026-09-27', 6, 5, 1),
  day('C3001', '2026-10-02', 8, 0, 1),
  {
    employeeCode: 'C3001',
    employeeName: 'C3001',
    workDate: '2026-10-02',
    shift: 'Night',
    regularHours: 6,
    ovtHours: 1,
    nightHours: 1,
    attendanceStatus: '',
    status: 'Submitted',
  },
];

const chukwudumebi = row('C1607');
assert.equal(chukwudumebi.days.size, 1, 'Saturday is not a worked day');
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
assert.equal(julius.days.size, 1, 'Saturday, Sunday, and the public holiday are not worked days');
assert.equal(julius.night, 3, 'night sessions are dates, not a sum of the flag');
assert.equal(julius.nightHours, 35, 'a night session uses the hours booked that night');
assert.equal(julius.status, 'Exception');

const fullDays = row('C2221');
assert.equal(fullDays.weekdayHours, 16);
assert.equal(fullDays.days.size, 2);
assert.equal(fullDays.status, 'Balanced');

const nightHoliday = row('C2537');
assert.equal(nightHoliday.phHours, 0, 'night-shift hours stay out of the holiday column');
assert.equal(nightHoliday.weekdayHours, 0);
assert.equal(nightHoliday.days.size, 0, 'a public holiday is not a worked day');
assert.equal(nightHoliday.night, 1);
assert.equal(nightHoliday.nightHours, 6);
assert.equal(nightHoliday.status, 'Exception');

assert.equal(row('C0293'), undefined, 'approved leave on Saturday is not a booked day');

const timothy = row('C2492');
assert.equal(timothy.sundayHours, 6);
assert.equal(timothy.sundayOvt, 5);
assert.equal(timothy.night, 1);
assert.equal(timothy.nightHours, 11, 'Sunday night hours are the 6 regular plus 5 overtime booked that night');

const both = row('C3001');
assert.equal(both.weekdayHours, 8);
assert.equal(both.night, 1);
assert.equal(both.nightHours, 7, 'Night-shift hours are kept when that shift has its own booking');

const vincent = buildBookingSummary([
  day('C2832', '2026-09-30', 8),
  day('C2832', '2026-10-01', 8),
  day('C2832', '2026-10-03', 8),
  day('C2832', '2026-10-04', 8, 2),
  day('C2832', '2026-10-11', 8),
], holidays, 8)[0];
assert.equal(vincent.days.size, 5, 'C2832 counts Saturday, Sunday, and PH as worked days');
assert.equal(vincent.weekdayHours, 40);
assert.equal(vincent.weekdayOvt, 0, 'C2832 has no overtime');
assert.equal(vincent.saturdayHours, 0);
assert.equal(vincent.sundayHours, 0);
assert.equal(vincent.phHours, 0);
assert.equal(vincent.status, 'Balanced');

console.log('booking-summary.test.js: ok');
