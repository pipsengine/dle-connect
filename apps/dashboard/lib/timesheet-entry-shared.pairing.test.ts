import { pairBiometricPunchesIntoShifts, isNightShiftEligibleAttendance, timesheetLineMatchesShift } from './timesheet-entry-shared';

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

const consecutive = pairBiometricPunchesIntoShifts([
  { date: '2026-07-13', time: '18:30' },
  { date: '2026-07-14', time: '05:45' },
  { date: '2026-07-14', time: '18:40' },
  { date: '2026-07-15', time: '05:50' },
]);
const mondayNight = consecutive.find((session) => session.workDate === '2026-07-13' && session.kind === 'Night');
const tuesdayNight = consecutive.find((session) => session.workDate === '2026-07-14' && session.kind === 'Night');
const tuesdayDay = consecutive.find((session) => session.workDate === '2026-07-14' && session.kind === 'Day');
assert(mondayNight?.clockIn === '18:30' && mondayNight.clockOut === '05:45', 'Monday night should pair 18:30 → 05:45');
assert(tuesdayNight?.clockIn === '18:40' && tuesdayNight.clockOut === '05:50', 'Tuesday night should pair 18:40 → 05:50');
assert(!tuesdayDay, 'Tuesday morning 05:45 must not become a day clock-in');
assert(isNightShiftEligibleAttendance('18:40', '05:50'), 'Overnight night duration remains eligible');

const dayWorker = pairBiometricPunchesIntoShifts([
  { date: '2026-07-19', time: '06:44' },
  { date: '2026-07-19', time: '18:56' },
]);
assert(dayWorker.some((session) => session.kind === 'Day' && session.clockIn === '06:44' && session.clockOut === '18:56'), 'Day worker 06:44–18:56 stays on Day');
assert(!dayWorker.some((session) => session.kind === 'Night'), 'Day evening punch is clock-out, not night in');
assert(!isNightShiftEligibleAttendance('06:44', '18:56'), 'Day pair is not night-eligible');
assert(timesheetLineMatchesShift('06:44', '01 (Day)', '18:56'), 'Day sheet keeps day pair');
assert(!timesheetLineMatchesShift('06:44', '02 (Night)', '18:56'), 'Night sheet hides day pair');

const lateNightOut = pairBiometricPunchesIntoShifts([
  { date: '2026-07-16', time: '18:20' },
  { date: '2026-07-17', time: '07:30' },
]);
assert(lateNightOut[0]?.kind === 'Night' && lateNightOut[0].clockOut === '07:30', '07:30 can be a night clock-out');

const extraPunch = pairBiometricPunchesIntoShifts([
  { date: '2026-07-16', time: '18:20' },
  { date: '2026-07-16', time: '22:05' },
  { date: '2026-07-17', time: '02:00' },
]);
assert(extraPunch[0]?.clockIn === '18:20' && extraPunch[0].clockOut === '02:00', 'Mid-shift extra punch is not clock-out');

const earlyBird = pairBiometricPunchesIntoShifts([
  { date: '2026-07-16', time: '05:54' },
  { date: '2026-07-16', time: '16:42' },
]);
assert(earlyBird[0]?.kind === 'Day' && earlyBird[0].clockIn === '05:54' && earlyBird[0].clockOut === '16:42', 'Early day starter stays on Day');

console.log('sequential pairing checks passed');
