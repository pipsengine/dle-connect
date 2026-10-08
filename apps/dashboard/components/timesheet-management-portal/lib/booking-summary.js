/** Booking Summary figures. NightHours on a booking is a session flag (1), not a duration. */

const roundHours = (value) => Math.round((Number(value) || 0) * 100) / 100;

export const bookingDayKind = (workDate, holidayDates) => {
  const date = String(workDate || '').slice(0, 10);
  if (holidayDates.has(date)) return 'ph';
  const parsed = new Date(`${date}T12:00:00Z`);
  const day = parsed.getUTCDay();
  if (Number.isNaN(parsed.getTime())) return 'weekday';
  if (day === 0) return 'sunday';
  if (day === 6) return 'saturday';
  return 'weekday';
};

const nightShift = (booking) => String(booking?.shift || '').trim().toLowerCase() === 'night';

const blankRow = (booking) => ({
  id: booking.employeeCode,
  name: booking.employeeName,
  supervisors: new Set(),
  weekdayHours: 0,
  weekdayOvt: 0,
  saturdayHours: 0,
  saturdayOvt: 0,
  sundayHours: 0,
  sundayOvt: 0,
  phHours: 0,
  phOvt: 0,
  night: 0,
  nightHours: 0,
  days: new Set(),
  dates: new Map(),
  markedException: false,
});

/**
 * One row per employee.
 * Calendar columns take day-shift regular and overtime.
 * Night is the number of dates with a night session. Night Hrs is the hours booked on the Night shift.
 * Balanced means every booked day and night shift has a full standard day of regular hours.
 */
export const buildBookingSummary = (bookings, holidayDates, standardHours = 8) => {
  const holidays = holidayDates instanceof Set ? holidayDates : new Set(holidayDates || []);
  const expected = Number(standardHours) > 0 ? Number(standardHours) : 8;
  const byEmployee = new Map();
  for (const booking of bookings || []) {
    const kind = bookingDayKind(booking.workDate, holidays);
    const leaveOnNonWorkingDay = /approved leave/i.test(String(booking.attendanceStatus || '')) && kind !== 'weekday';
    if (leaveOnNonWorkingDay) continue;
    const date = String(booking.workDate || '').slice(0, 10);
    const current = byEmployee.get(booking.employeeCode) || blankRow(booking);
    const slot = current.dates.get(date) || { dayRegular: 0, dayOvt: 0, nightRegular: 0, nightOvt: 0, night: false };
    const regular = Number(booking.regularHours || 0);
    const ovt = Number(booking.ovtHours || 0);
    if (nightShift(booking)) {
      slot.nightRegular += regular;
      slot.nightOvt += ovt;
      if (regular + ovt > 0 || Number(booking.nightHours) > 0) slot.night = true;
    } else {
      if (kind === 'saturday') { current.saturdayHours += regular; current.saturdayOvt += ovt; }
      else if (kind === 'sunday') { current.sundayHours += regular; current.sundayOvt += ovt; }
      else if (kind === 'ph') { current.phHours += regular; current.phOvt += ovt; }
      else { current.weekdayHours += regular; current.weekdayOvt += ovt; }
      slot.dayRegular += regular;
      slot.dayOvt += ovt;
      if (Number(booking.nightHours) > 0) slot.night = true;
    }
    if (booking.supervisor) current.supervisors.add(booking.supervisor);
    if (booking.status === 'Exception') current.markedException = true;
    current.days.add(date);
    current.dates.set(date, slot);
    byEmployee.set(booking.employeeCode, current);
  }
  return [...byEmployee.values()].map((row) => {
    let night = 0;
    let nightHours = 0;
    let short = row.markedException;
    for (const slot of row.dates.values()) {
      if (slot.night) night += 1;
      nightHours += slot.nightRegular + slot.nightOvt;
      if (slot.dayRegular + slot.dayOvt > 0 && Math.abs(slot.dayRegular - expected) > 0.001) short = true;
      if (slot.nightRegular + slot.nightOvt > 0 && Math.abs(slot.nightRegular - expected) > 0.001) short = true;
    }
    return {
      id: row.id,
      name: row.name,
      supervisors: row.supervisors,
      weekdayHours: roundHours(row.weekdayHours),
      weekdayOvt: roundHours(row.weekdayOvt),
      saturdayHours: roundHours(row.saturdayHours),
      saturdayOvt: roundHours(row.saturdayOvt),
      sundayHours: roundHours(row.sundayHours),
      sundayOvt: roundHours(row.sundayOvt),
      phHours: roundHours(row.phHours),
      phOvt: roundHours(row.phOvt),
      night,
      nightHours: roundHours(nightHours),
      days: row.days,
      status: short ? 'Exception' : 'Balanced',
    };
  });
};
