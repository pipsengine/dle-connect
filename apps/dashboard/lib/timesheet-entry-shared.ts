/** Client-safe timesheet types and constants (no Node/SQL imports). */

export const STANDARD_TIMESHEET_HOURS = 8;
export const DAILY_BREAK_HOURS = 1;
export const GROSS_TIMESHEET_HOURS = STANDARD_TIMESHEET_HOURS + DAILY_BREAK_HOURS;
export const DEFAULT_BREAK_IDLE_REASON_ID = 'idl-009';
export const DEFAULT_BREAK_IDLE_REASON_NAME = 'Break Time';

/** Capture stays open until payroll acknowledgement. HR_Acknowledged / Locked stay locked unless returned. */
export const EDITABLE_TIMESHEET_STATUSES = [
  'Draft',
  'Submitted',
  'Returned',
  'Rejected',
  'Supervisor_Reviewed',
  'Project_Manager_Reviewed',
  'Cost_Control_Reviewed',
  'GM_Operations_Reviewed',
] as const;
export type EditableTimesheetStatus = (typeof EDITABLE_TIMESHEET_STATUSES)[number];
export const TIMESHEET_CAPTURE_LOCKED_STATUSES = ['HR_Acknowledged', 'Locked', 'Approved'] as const;

export const normalizeTimesheetStatusKey = (status?: string | null) =>
  String(status || 'Draft').trim().replace(/[\s-]+/g, '_').toLowerCase();

export const isTimesheetInApprovalCapture = (status?: string | null) => {
  const key = normalizeTimesheetStatusKey(status);
  return [
    'submitted',
    'supervisor_reviewed',
    'project_manager_reviewed',
    'cost_control_reviewed',
    'gm_operations_reviewed',
  ].includes(key);
};

/** Capture stays editable until HR acknowledges the sheet for payroll. */
export const isEditableTimesheetStatus = (status?: string | null) => {
  const key = normalizeTimesheetStatusKey(status);
  return !TIMESHEET_CAPTURE_LOCKED_STATUSES.some(
    (locked) => normalizeTimesheetStatusKey(locked) === key,
  );
};

export type TimesheetShiftKind = 'Day' | 'Night';

export type TimesheetShiftDefinition = {
  id: string;
  label: string;
  kind: TimesheetShiftKind;
  /** Standard productive window start (HH:MM). */
  start: string;
  /** Standard productive window end (HH:MM). Hours after this are overtime. */
  end: string;
  standardProductiveHours: number;
  crossesMidnight: boolean;
  description: string;
};

/** Day: typical site day. Night: 18:00–02:00 = 8h normal work + ₦1,500 inconvenience allowance (no OT). */
export const TIMESHEET_SHIFTS: TimesheetShiftDefinition[] = [
  {
    id: '01',
    label: '01 (Day)',
    kind: 'Day',
    start: '08:00',
    end: '17:00',
    standardProductiveHours: STANDARD_TIMESHEET_HOURS,
    crossesMidnight: false,
    description: 'Day shift · 08:00–17:00 · OT after 17:00',
  },
  {
    id: '02',
    label: '02 (Night)',
    kind: 'Night',
    start: '18:00',
    end: '02:00',
    standardProductiveHours: STANDARD_TIMESHEET_HOURS,
    crossesMidnight: true,
    description: 'Night shift · 18:00–02:00 (8h normal) · ₦1,500 inconvenience allowance · no overtime',
  },
];

/** Flat night inconvenience allowance (NGN) auto-posted per night worked. */
export const NIGHT_INCONVENIENCE_ALLOWANCE_AMOUNT = 1500;

export const DEFAULT_TIMESHEET_SHIFT_LABEL = TIMESHEET_SHIFTS[0].label;
export const TIMESHEET_SHIFT_LABELS = TIMESHEET_SHIFTS.map((shift) => shift.label);

export const resolveTimesheetShift = (value?: string | null): TimesheetShiftDefinition => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return TIMESHEET_SHIFTS[0];
  const byLabel = TIMESHEET_SHIFTS.find((shift) => shift.label.toLowerCase() === raw);
  if (byLabel) return byLabel;
  const byId = TIMESHEET_SHIFTS.find((shift) => shift.id === raw || raw.startsWith(`${shift.id} `) || raw.startsWith(shift.id.toLowerCase()));
  if (byId) return byId;
  if (raw.includes('night') || raw.includes('02')) return TIMESHEET_SHIFTS[1];
  return TIMESHEET_SHIFTS[0];
};

/** Night window start (18:00). Matches biometric night classification. */
export const NIGHT_SHIFT_START_MINUTES = 18 * 60;
/** Productive night end (02:00) — crosses midnight. */
export const NIGHT_SHIFT_END_MINUTES = 2 * 60;
/** Morning punches before this still belong to the overnight night shift. */
export const NIGHT_MORNING_CUTOFF_MINUTES = 6 * 60;

const parseClockMinutes = (value: string) => {
  const [h, m] = value.split(':').map((part) => Number(part));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
};

export const clockTimeToMinutes = (value?: string | null): number | null => {
  const raw = String(value || '').trim();
  if (!raw || raw === '--:--') return null;
  const compact = raw.replace(':', '');
  if (/^\d{3,4}$/.test(compact)) {
    const padded = compact.padStart(4, '0');
    return Number(padded.slice(0, 2)) * 60 + Number(padded.slice(2, 4));
  }
  return parseClockMinutes(raw);
};

/** Classify a clock-in as Day or Night from punch time (18:00–06:00 = Night). */
export const classifyAttendanceShiftFromClockIn = (clockIn?: string | null): TimesheetShiftKind => {
  const minutes = clockTimeToMinutes(clockIn);
  if (minutes === null) return 'Day';
  return minutes >= NIGHT_SHIFT_START_MINUTES || minutes < NIGHT_MORNING_CUTOFF_MINUTES ? 'Night' : 'Day';
};

export const isNightWindowClockIn = (clockIn?: string | null) => classifyAttendanceShiftFromClockIn(clockIn) === 'Night';

/** True when the employee already started a day pair (clock-in 06:00–18:00) and has duration that day. */
export const hasDayShiftDuration = (clockIn?: string | null, clockOut?: string | null) => {
  const inMinutes = clockTimeToMinutes(clockIn);
  const outMinutes = clockTimeToMinutes(clockOut);
  if (inMinutes === null || outMinutes === null) return false;
  const startedInDayWindow =
    inMinutes >= NIGHT_MORNING_CUTOFF_MINUTES && inMinutes < NIGHT_SHIFT_START_MINUTES;
  if (!startedInDayWindow) return false;
  let durationMinutes = outMinutes - inMinutes;
  if (durationMinutes < 0) durationMinutes += 24 * 60;
  return durationMinutes > 0.06;
};

export type BiometricPunchPoint = {
  date: string;
  time: string;
};

export type PairedAttendanceShift = {
  kind: TimesheetShiftKind;
  workDate: string;
  clockIn: string | null;
  clockOut: string | null;
  clockInDate: string | null;
  clockOutDate: string | null;
  punchCount: number;
};

const PUNCH_DEBOUNCE_SECONDS = 120;

export const normalizeAttendanceDate = (value: string) => {
  const digits = String(value || '').replace(/-/g, '').trim();
  if (/^\d{8}$/.test(digits)) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  }
  return String(value || '').slice(0, 10);
};

export const formatClockMinutes = (minutes: number) => {
  const normalized = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
};

export const addIsoDateDays = (isoDate: string, days: number) => {
  const date = new Date(`${normalizeAttendanceDate(isoDate)}T12:00:00`);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

type NormalizedPunch = {
  date: string;
  minutes: number;
  clock: string;
  epoch: number;
};

const punchEpochSeconds = (date: string, minutes: number) =>
  Date.parse(`${date}T${formatClockMinutes(minutes)}:00Z`) / 1000;

const toNormalizedPunches = (punches: BiometricPunchPoint[]): NormalizedPunch[] => {
  const mapped: NormalizedPunch[] = [];
  for (const punch of punches) {
    const date = normalizeAttendanceDate(punch.date);
    const minutes = clockTimeToMinutes(punch.time);
    if (!date || minutes === null) continue;
    mapped.push({
      date,
      minutes,
      clock: formatClockMinutes(minutes),
      epoch: punchEpochSeconds(date, minutes),
    });
  }
  mapped.sort((a, b) => a.epoch - b.epoch);
  const unique: NormalizedPunch[] = [];
  for (const punch of mapped) {
    const prev = unique[unique.length - 1];
    if (prev && punch.epoch - prev.epoch <= PUNCH_DEBOUNCE_SECONDS) continue;
    unique.push(punch);
  }
  return unique;
};

/**
 * Pair raw biometric punches into Day/Night sessions.
 * Night is not calendar min/max: work date D runs from 18:00 on D until 18:00 on D+1.
 * First punch in that window is clock-in; last punch before the next evening start is clock-out.
 * A day-window punch (06:00–18:00) on D means the evening punch is that day's clock-out, not a night in.
 */
export const pairBiometricPunchesIntoShifts = (punches: BiometricPunchPoint[]): PairedAttendanceShift[] => {
  const unique = toNormalizedPunches(punches);
  if (!unique.length) return [];
  const used = new Set<number>();
  const sessions: PairedAttendanceShift[] = [];

  const hasDayWindowPunch = (date: string) => unique.some((punch) => (
    punch.date === date
    && punch.minutes >= NIGHT_MORNING_CUTOFF_MINUTES
    && punch.minutes < NIGHT_SHIFT_START_MINUTES
  ));

  for (let i = 0; i < unique.length; i += 1) {
    if (used.has(i)) continue;
    const punch = unique[i];
    if (punch.minutes < NIGHT_SHIFT_START_MINUTES) continue;
    if (hasDayWindowPunch(punch.date)) continue;

    const windowEnd = punchEpochSeconds(addIsoDateDays(punch.date, 1), NIGHT_SHIFT_START_MINUTES);
    const windowIndexes: number[] = [];
    for (let j = i; j < unique.length; j += 1) {
      if (unique[j].epoch >= windowEnd) break;
      windowIndexes.push(j);
    }
    windowIndexes.forEach((index) => used.add(index));
    const clockIn = unique[windowIndexes[0]];
    const clockOut = windowIndexes.length > 1 ? unique[windowIndexes[windowIndexes.length - 1]] : null;
    sessions.push({
      kind: 'Night',
      workDate: punch.date,
      clockIn: clockIn.clock,
      clockOut: clockOut?.clock ?? null,
      clockInDate: clockIn.date,
      clockOutDate: clockOut?.date ?? null,
      punchCount: windowIndexes.length,
    });
  }

  const dates = [...new Set(unique.map((punch) => punch.date))];
  for (const date of dates) {
    const remaining = unique
      .map((punch, index) => ({ punch, index }))
      .filter(({ punch, index }) => punch.date === date && !used.has(index));
    if (!remaining.length) continue;
    const inEntry = remaining.find(({ punch }) => punch.minutes < NIGHT_SHIFT_START_MINUTES);
    if (!inEntry) continue;
    const last = remaining[remaining.length - 1];
    const clockOut = last.index !== inEntry.index ? last.punch : null;
    remaining.forEach(({ index }) => used.add(index));
    sessions.push({
      kind: 'Day',
      workDate: date,
      clockIn: inEntry.punch.clock,
      clockOut: clockOut?.clock ?? null,
      clockInDate: date,
      clockOutDate: clockOut ? date : null,
      punchCount: remaining.length,
    });
  }

  return sessions.sort((a, b) => a.workDate.localeCompare(b.workDate) || a.kind.localeCompare(b.kind));
};

export const pairedShiftForWorkDate = (
  punches: BiometricPunchPoint[],
  workDate: string,
  kind: TimesheetShiftKind,
): PairedAttendanceShift | null => {
  const date = normalizeAttendanceDate(workDate);
  return pairBiometricPunchesIntoShifts(punches).find((session) => session.workDate === date && session.kind === kind) ?? null;
};

/**
 * Night crew: clock-in from 18:00. Overnight clock-out (02:00 / 05:45 / 07:30) is valid duration.
 * An evening clock-out from a morning/day clock-in is not a night start.
 */
export const isNightShiftEligibleAttendance = (clockIn?: string | null, clockOut?: string | null) => {
  const inMinutes = clockTimeToMinutes(clockIn);
  if (inMinutes === null) return false;
  if (hasDayShiftDuration(clockIn, clockOut)) return false;
  if (inMinutes >= NIGHT_MORNING_CUTOFF_MINUTES && inMinutes < NIGHT_SHIFT_START_MINUTES) return false;
  return inMinutes >= NIGHT_SHIFT_START_MINUTES;
};

/** Night view: only true night starters. Day view: hide night pairs; keep absentees and day/early-bird clock-ins. */
export const timesheetLineMatchesShift = (
  clockIn?: string | null,
  shiftLabel?: string | null,
  clockOut?: string | null,
) => {
  const kind = resolveTimesheetShift(shiftLabel).kind;
  if (kind === 'Night') return isNightShiftEligibleAttendance(clockIn, clockOut);
  if (!String(clockIn || '').trim()) return true;
  return !isNightShiftEligibleAttendance(clockIn, clockOut);
};

/** Legacy headers with blank shiftLabel are treated as Day. */
export const timesheetHeaderShiftKind = (shiftLabel?: string | null): TimesheetShiftKind => {
  if (!String(shiftLabel || '').trim()) return 'Day';
  return resolveTimesheetShift(shiftLabel).kind;
};

export const timesheetHeaderMatchesShift = (headerShiftLabel: string | null | undefined, targetShiftLabel?: string | null) => {
  const target = resolveTimesheetShift(targetShiftLabel);
  return timesheetHeaderShiftKind(headerShiftLabel) === target.kind;
};

export const timesheetShiftHeaderSlug = (shiftLabel?: string | null) => (
  resolveTimesheetShift(shiftLabel).kind === 'Night' ? 'night' : 'day'
);

export const addCalendarDays = (isoDate: string, days: number) => {
  const date = new Date(`${isoDate}T12:00:00`);
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Overtime hours implied by clock-out past the shift standard end.
 * Night: no overtime — night is normal 8h work plus flat inconvenience allowance only.
 * Day: OT after 17:00.
 */
export const impliedOvertimeHoursFromClock = (
  clockIn?: string | null,
  clockOut?: string | null,
  shiftValue?: string | null,
): number => {
  const shift = resolveTimesheetShift(shiftValue);
  if (shift.kind === 'Night') return 0;
  const outTime = String(clockOut || '').trim();
  if (!outTime || outTime === '--:--') return 0;
  const outMinutes = parseClockMinutes(outTime);
  const endMinutes = parseClockMinutes(shift.end);
  if (outMinutes === null || endMinutes === null) return 0;

  const overtimeMinutes = outMinutes - endMinutes;
  return Math.round((Math.max(0, overtimeMinutes) / 60) * 10) / 10;
};

export type TimesheetDayKind = 'Weekday' | 'Saturday' | 'Sunday' | 'PublicHoliday';

export type TimesheetDayRules = {
  kind: TimesheetDayKind;
  standardProductiveHours: number;
  grossHours: number;
  isReducedDay: boolean;
};

export type TimesheetDayContext = {
  date: string;
  holidayDates?: string[];
  /** Selected timesheet shift label, e.g. "02 (Night)". */
  shiftLabel?: string;
};

export const timesheetDayRulesForDate = (date: string, holidayDates: string[] = []): TimesheetDayRules => {
  const holidays = new Set(holidayDates);
  const standardDay = {
    standardProductiveHours: STANDARD_TIMESHEET_HOURS,
    grossHours: GROSS_TIMESHEET_HOURS,
    isReducedDay: false,
  };
  if (holidays.has(date)) {
    return { kind: 'PublicHoliday', ...standardDay };
  }
  const weekday = new Date(`${date}T12:00:00`).getDay();
  if (weekday === 6) {
    return { kind: 'Saturday', ...standardDay };
  }
  if (weekday === 0) {
    return { kind: 'Sunday', ...standardDay };
  }
  return { kind: 'Weekday', ...standardDay };
};

export const resolveTimesheetHours = (dayContext?: TimesheetDayContext) => {
  const shift = resolveTimesheetShift(dayContext?.shiftLabel);
  // Night 18:00–02:00 is already net 8h productive — do not require an extra 1h break against biometric.
  if (shift.kind === 'Night') {
    return {
      standardProductiveHours: STANDARD_TIMESHEET_HOURS,
      grossHours: STANDARD_TIMESHEET_HOURS,
      isReducedDay: false,
      shiftKind: shift.kind,
    };
  }
  if (!dayContext?.date) {
    return {
      standardProductiveHours: STANDARD_TIMESHEET_HOURS,
      grossHours: GROSS_TIMESHEET_HOURS,
      isReducedDay: false,
      shiftKind: shift.kind,
    };
  }
  const rules = timesheetDayRulesForDate(dayContext.date, dayContext.holidayDates);
  return {
    standardProductiveHours: rules.standardProductiveHours,
    grossHours: rules.grossHours,
    isReducedDay: rules.isReducedDay,
    shiftKind: shift.kind,
  };
};

export const isBreakTimeIdleReason = (
  reasonId?: string | null,
  reasonName?: string | null,
  reasonCode?: string | null,
) => {
  const id = String(reasonId || '').trim().toLowerCase();
  const name = String(reasonName || '').trim().toLowerCase().replace(/[\[\]]/g, '');
  const code = String(reasonCode || '').trim().toLowerCase();
  return (
    id === DEFAULT_BREAK_IDLE_REASON_ID ||
    code === 'break' ||
    code === 'breaktime' ||
    name.includes('break time') ||
    name.includes('breaktime')
  );
};

export const normalizeIdleAllocations = <
  T extends { reasonId: string; reasonName: string; hours: number; remarks: string | null },
>(
  allocations: T[] | null | undefined = [],
): T[] =>
  (allocations || []).map((allocation) => {
    if (!isBreakTimeIdleReason(allocation.reasonId, allocation.reasonName)) return allocation;
    return {
      ...allocation,
      reasonId: allocation.reasonId || DEFAULT_BREAK_IDLE_REASON_ID,
      reasonName: allocation.reasonName || DEFAULT_BREAK_IDLE_REASON_NAME,
      hours: DAILY_BREAK_HOURS,
    };
  });

const round1 = (value: number) => Math.round(value * 10) / 10;

export const attendanceDurationFromClock = (
  clockIn?: string | null,
  clockOut?: string | null,
): number | null => {
  const inTime = String(clockIn || '').trim();
  const outTime = String(clockOut || '').trim();
  if (!inTime || !outTime || outTime === '--:--') return null;
  const parse = (value: string) => {
    const [h, m] = value.split(':').map((part) => Number(part));
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return h * 60 + m;
  };
  const inMinutes = parse(inTime);
  const outMinutes = parse(outTime);
  if (inMinutes === null || outMinutes === null) return null;
  let durationMinutes = outMinutes - inMinutes;
  // Overnight-safe (night shift 18:00→02:00+). Never return a negative duration.
  if (durationMinutes < 0) durationMinutes += 24 * 60;
  return round1(Math.max(0, durationMinutes) / 60);
};

/** Legacy ADD-mode OT mis-click (8h booked + 10h OT button = 18 instead of 8 + 2 = 10). */
export const repairStackedOvertimeProductiveHours = (
  hours: number,
  standardProductiveHours: number,
  remarks?: string | null,
): number => {
  if (!remarks?.includes('OT:')) return hours;
  const excess = round1(hours - standardProductiveHours);
  if (excess >= 9.9 && excess <= 10.1) {
    return round1(standardProductiveHours + 2);
  }
  return hours;
};

export const resolveLineAttendanceDuration = (line: {
  clockIn?: string | null;
  clockOut?: string | null;
  attendanceDuration?: number;
}) => {
  const fromClock = attendanceDurationFromClock(line.clockIn, line.clockOut);
  if (fromClock !== null && fromClock > 0) return fromClock;
  return round1(Number(line.attendanceDuration || 0));
};

/**
 * Max productive hours from biometric span.
 * Day: duration includes 1h break → subtract break.
 * Night: 18:00–02:00 is already net 8h productive → do not subtract break; cap at 8h (no night OT).
 */
export const maxProductiveHoursFromBiometric = (attendanceDuration: number, shiftValue?: string | null) => {
  if (attendanceDuration <= 0.001) return Number.POSITIVE_INFINITY;
  const shift = resolveTimesheetShift(shiftValue);
  if (shift.kind === 'Night') return round1(Math.min(STANDARD_TIMESHEET_HOURS, Math.max(0, attendanceDuration)));
  return round1(Math.max(0, attendanceDuration - DAILY_BREAK_HOURS));
};

export const formatProductiveHoursDenial = (input: {
  attendanceDuration: number;
  requestedProductive: number;
  standardProductiveHours?: number;
  requestedOtHours?: number;
  shiftLabel?: string | null;
}) => {
  const standard = input.standardProductiveHours ?? STANDARD_TIMESHEET_HOURS;
  const shift = resolveTimesheetShift(input.shiftLabel);
  const maxProductive = maxProductiveHoursFromBiometric(input.attendanceDuration, input.shiftLabel);
  const otHours = input.requestedOtHours ?? round1(Math.max(0, input.requestedProductive - standard));
  const requiredBiometric = shift.kind === 'Night'
    ? round1(input.requestedProductive)
    : round1(input.requestedProductive + DAILY_BREAK_HOURS);
  const maxExplain = shift.kind === 'Night'
    ? `${maxProductive}h (night window is net productive)`
    : `${input.attendanceDuration}h − 1h break = ${maxProductive}h`;
  return (
    `Cannot book ${standard}h + ${otHours}h OT = ${round1(input.requestedProductive)}h productive. ` +
    `Biometric duration is ${input.attendanceDuration}h (max productive ${maxExplain}). ` +
    `${round1(input.requestedProductive)}h productive requires at least ${requiredBiometric}h on the biometric log.`
  );
};

/** Max productive (work + OT) allowed from biometric — night does not subtract break. */
export const maxBookableProductiveHours = (
  line: { clockIn?: string | null; clockOut?: string | null; attendanceDuration?: number },
  _idleHours = DAILY_BREAK_HOURS,
  shiftValue?: string | null,
) => {
  if (!line.clockIn) return Number.POSITIVE_INFINITY;
  const attendance = resolveLineAttendanceDuration(line);
  return maxProductiveHoursFromBiometric(attendance, shiftValue);
};

export const capProductiveHoursToAttendance = (
  productiveHours: number,
  line: { clockIn?: string | null; clockOut?: string | null; attendanceDuration?: number },
  _idleHours = DAILY_BREAK_HOURS,
  shiftValue?: string | null,
) => {
  const maxProductive = maxBookableProductiveHours(line, _idleHours, shiftValue);
  if (!Number.isFinite(maxProductive)) return round1(productiveHours);
  return round1(Math.min(productiveHours, maxProductive));
};

export const canonicalProjectCode = (value?: string | null) => String(value || '').trim().toUpperCase();

/** Downtime / non-project idle booked as a project allocation (power failure, no tools, etc.). */
export const IDLE_TIME_PROJECT_CODE = 'DL1949';
export const IDLE_TIME_PROJECT_NAME = 'IDLE TIME';

export const isIdleTimeProjectCode = (value?: string | null) =>
  canonicalProjectCode(value) === IDLE_TIME_PROJECT_CODE;

export const idleTimeProjectHours = (
  allocations: Array<{ projectCode: string; hours: number }> | null | undefined,
) => projectHoursForColumn(allocations, IDLE_TIME_PROJECT_CODE);

export const productiveProjectHours = (
  allocations: Array<{ projectCode: string; hours: number }> | null | undefined,
) =>
  round1(
    normalizeProjectAllocations(allocations || [])
      .filter((item) => !isIdleTimeProjectCode(item.projectCode))
      .reduce((sum, item) => sum + Number(item.hours || 0), 0),
  );

/** One row per project code. Collapses duplicate DB/UI rows that were double-counting hours. */
export const normalizeProjectAllocations = <
  T extends {
    projectId?: string;
    projectCode: string;
    projectName?: string;
    taskId?: string;
    taskName?: string;
    activityId?: string;
    hours: number;
    remarks?: string | null;
  },
>(
  allocations: T[] | null | undefined = [],
): T[] => {
  const byCode = new Map<string, T>();
  for (const item of allocations || []) {
    const code = canonicalProjectCode(item.projectCode);
    if (!code) continue;
    const hours = round1(Number(item.hours || 0));
    const existing = byCode.get(code);
    if (!existing) {
      byCode.set(code, {
        ...item,
        projectId: item.projectId || code,
        projectCode: code,
        projectName: item.projectName || code,
        hours,
      });
      continue;
    }
    const existingHours = round1(Number(existing.hours || 0));
    // Duplicate rows for the same project code should not be summed (8 + 10 = 18). Keep the latest row.
    byCode.set(code, {
      ...existing,
      ...item,
      projectId: item.projectId || existing.projectId || code,
      projectCode: code,
      projectName: item.projectName || existing.projectName || code,
      hours,
      remarks: item.remarks ?? existing.remarks ?? null,
    });
  }
  return Array.from(byCode.values());
};

export const sumProjectAllocationHours = (
  allocations?: Array<{ projectCode: string; hours: number }> | null,
) => round1(normalizeProjectAllocations(allocations).reduce((sum, item) => sum + Number(item.hours || 0), 0));

/** Prefer DL1985 when present, otherwise the first matrix column / first booked project. */
export const resolvePrimaryProjectCode = (
  projectCodes: string[] = [],
  allocations?: Array<{ projectCode: string; hours: number }> | null,
) => {
  const codes = projectCodes.map(canonicalProjectCode).filter(Boolean);
  const preferred = codes.find((code) => code === 'DL1985');
  if (preferred) return preferred;
  if (codes[0]) return codes[0];
  const normalized = normalizeProjectAllocations(allocations);
  const booked = normalized.find((item) => Number(item.hours || 0) > 0 && !isIdleTimeProjectCode(item.projectCode));
  return canonicalProjectCode(booked?.projectCode) || codes.find((code) => !isIdleTimeProjectCode(code)) || codes[0] || 'GENERAL';
};

/** Read hours booked on a matrix project column. */
export const projectHoursForColumn = (
  allocations: Array<{ projectCode: string; hours: number }> | null | undefined,
  columnCode: string,
) => {
  const code = canonicalProjectCode(columnCode);
  const match = normalizeProjectAllocations(allocations).find((item) => canonicalProjectCode(item.projectCode) === code);
  return round1(Number(match?.hours || 0));
};

/** Update one matrix column while keeping other project rows and capping total productive hours. */
export const upsertMatrixProjectHours = <
  T extends {
    projectId?: string;
    projectCode: string;
    projectName?: string;
    hours: number;
    remarks?: string | null;
  },
>(
  allocations: T[] | null | undefined,
  columnCode: string,
  columnName: string,
  requestedHours: number,
  maxTotalProductive: number,
): T[] => {
  const code = canonicalProjectCode(columnCode);
  const normalized = normalizeProjectAllocations(allocations);
  const otherSum = round1(
    normalized
      .filter((item) => canonicalProjectCode(item.projectCode) !== code)
      .reduce((sum, item) => sum + Number(item.hours || 0), 0),
  );
  const hours = round1(Math.min(Math.max(0, requestedHours), Math.max(0, maxTotalProductive - otherSum)));
  const existing = normalized.find((item) => canonicalProjectCode(item.projectCode) === code);
  const rest = normalized.filter((item) => canonicalProjectCode(item.projectCode) !== code);
  if (hours > 0.001 || existing) {
    rest.push({
      ...(existing || { projectId: code, projectCode: code, projectName: columnName, remarks: null }),
      projectId: existing?.projectId || code,
      projectCode: code,
      projectName: columnName || existing?.projectName || code,
      hours,
      remarks: existing?.remarks ?? null,
    } as T);
  }
  return normalizeProjectAllocations(rest);
};

/** Max total productive hours allowed across all matrix columns (8h standard, or up to biometric cap when OT is booked). */
export const matrixProductiveHoursCap = (
  line: { clockIn?: string | null; clockOut?: string | null; attendanceDuration?: number },
  usedHours: number,
  standardProductiveHours = STANDARD_TIMESHEET_HOURS,
  idleHours = DAILY_BREAK_HOURS,
  shiftValue?: string | null,
) => {
  const biometricCap = maxBookableProductiveHours(line, idleHours, shiftValue);
  if (!Number.isFinite(biometricCap)) return standardProductiveHours;
  const overtimeHours = round1(Math.max(0, usedHours - standardProductiveHours));
  if (overtimeHours > 0.001) return biometricCap;
  return round1(Math.min(standardProductiveHours, biometricCap));
};

/** Legacy OT repair: collapse mis-posted split rows onto the authorized primary project. */
export const consolidateProjectAllocationsToPrimary = <
  T extends {
    projectId?: string;
    projectCode: string;
    projectName?: string;
    taskId?: string;
    taskName?: string;
    activityId?: string;
    hours: number;
    remarks?: string | null;
  },
>(
  allocations: T[] | null | undefined,
  primaryProjectCode: string,
  primaryProjectName?: string,
): T[] => {
  const primary = canonicalProjectCode(primaryProjectCode);
  if (!primary) return normalizeProjectAllocations(allocations);

  const normalized = normalizeProjectAllocations(allocations);
  const primarySum = sumProjectAllocationHours(
    normalized.filter((item) => canonicalProjectCode(item.projectCode) === primary),
  );
  const otherSum = sumProjectAllocationHours(
    normalized.filter((item) => canonicalProjectCode(item.projectCode) !== primary),
  );
  // Legacy mis-postings split 8h on primary and OT on another column — keep primary only; re-book OT on primary.
  const totalHours =
    primarySum > 0.001 && otherSum > 0.001 ? round1(primarySum) : round1(primarySum + otherSum);
  if (totalHours <= 0.001) {
    return normalized.filter((item) => canonicalProjectCode(item.projectCode) === primary);
  }

  const seed =
    normalized.find((item) => canonicalProjectCode(item.projectCode) === primary) ||
    normalized.find((item) => Number(item.hours || 0) > 0) ||
    normalized[0];

  return [
    {
      ...seed,
      projectId: seed?.projectId || primary,
      projectCode: primary,
      projectName: primaryProjectName || seed?.projectName || primary,
      hours: totalHours,
      remarks: seed?.remarks ?? null,
    },
  ];
};

export const hasDuplicateProjectCodes = (allocations: Array<{ projectCode: string }>) => {
  const seen = new Set<string>();
  for (const item of allocations) {
    const code = canonicalProjectCode(item.projectCode);
    if (!code) continue;
    if (seen.has(code)) return true;
    seen.add(code);
  }
  return false;
};

export const isTimesheetPaidLeaveLine = (line: {
  projectAllocations?: Array<{ projectCode?: string; hours?: number }> | null;
  idleAllocations?: Array<{ reasonName?: string; hours?: number }> | null;
  remarks?: string | null;
}) => {
  const projectLeave = (line.projectAllocations || []).some((item) => item.projectCode?.toUpperCase() === 'LEAVE' && Number(item.hours || 0) > 0);
  const idleLeave = (line.idleAllocations || []).some((item) => item.reasonName?.toLowerCase().includes('leave') && Number(item.hours || 0) > 0);
  return projectLeave || idleLeave || String(line.remarks || '').toLowerCase().includes('approved paid leave');
};

export const normalizeEmployeeLineKey = (line: { employeeId?: string | null; employeeNo?: string | null }) => {
  const value = String(line.employeeId || line.employeeNo || '').trim().toUpperCase();
  return value.replace(/[^A-Z0-9]/g, '');
};

export type TimesheetLineValidationStatus = 'Valid' | 'Error' | 'Warning' | 'Incomplete';

export type TimesheetLine = {
  id: string;
  headerId: string;
  employeeId: string;
  employeeNo: string;
  employeeName: string;
  biometricId: string;
  attendanceId: string | null;
  clockIn: string | null;
  clockOut: string | null;
  attendanceDuration: number;
  projectAllocations: Array<{
    projectId: string;
    projectCode: string;
    projectName: string;
    taskId?: string;
    taskName?: string;
    activityId?: string;
    hours: number;
    remarks: string | null;
  }>;
  idleAllocations: Array<{
    reasonId: string;
    reasonName: string;
    hours: number;
    remarks: string | null;
  }>;
  usedHours: number;
  idleHours: number;
  totalHours: number;
  variance: number;
  remarks: string | null;
  validationStatus: TimesheetLineValidationStatus;
  validationMessage: string | null;
  /** Biometric (default) or Manual for offshore/no-device booking. */
  attendanceMode?: 'Biometric' | 'Manual' | null;
  /** Hours recorded as offshore allowance. Not payroll OT. */
  offshoreAllowanceHours?: number;
};

export const OFFSHORE_LOCATION_NAME = 'OFFSHORE';
export const OFFSHORE_WORK_CENTER_PREFIX = 'OFFSHORE · ';
export const OFFSHORE_PAYROLL_HOURS = STANDARD_TIMESHEET_HOURS;
export const OFFSHORE_ALLOWANCE_HOURS = 4;
export const OFFSHORE_BREAK_HOURS = DAILY_BREAK_HOURS;
export const OFFSHORE_REMARKS_MARKER = 'OFFSHORE_MANUAL';

export const offshoreWorkCenterName = (projectCode: string) =>
  `${OFFSHORE_WORK_CENTER_PREFIX}${String(projectCode || '').trim().toUpperCase()}`;

export const isOffshoreWorkCenterName = (name?: string | null) =>
  /^OFFSHORE(\s|$|[·\-–])/i.test(String(name || '').trim());

export const projectCodeFromOffshoreWorkCenter = (name?: string | null) => {
  const match = String(name || '').trim().match(/^OFFSHORE\s*[·\-–]\s*(.+)$/i);
  return match ? match[1].trim().toUpperCase() : '';
};

export const isManualOffshoreLine = (line: {
  attendanceMode?: 'Biometric' | 'Manual' | null;
  remarks?: string | null;
}) =>
  line.attendanceMode === 'Manual' || String(line.remarks || '').includes(OFFSHORE_REMARKS_MARKER);

export const isTimesheetAbsentLine = (line: {
  clockIn?: string | null;
  attendanceMode?: 'Biometric' | 'Manual' | null;
  remarks?: string | null;
}) =>
  !String(line.clockIn || '').trim() && !isManualOffshoreLine(line);

export const buildManualOffshoreLine = (input: {
  headerId: string;
  employeeId: string;
  employeeNo: string;
  employeeName: string;
  projectCode: string;
  projectName: string;
}): TimesheetLine => {
  const projectCode = String(input.projectCode || '').trim().toUpperCase();
  const projectName = String(input.projectName || projectCode).trim();
  return {
    id: `ts-off-${input.headerId}-${String(input.employeeNo || input.employeeId).replace(/[^A-Za-z0-9]/g, '')}`,
    headerId: input.headerId,
    employeeId: input.employeeId,
    employeeNo: input.employeeNo,
    employeeName: input.employeeName,
    biometricId: '',
    attendanceId: null,
    clockIn: null,
    clockOut: null,
    attendanceDuration: 0,
    projectAllocations: [{
      projectId: projectCode,
      projectCode,
      projectName,
      hours: OFFSHORE_PAYROLL_HOURS,
      remarks: 'Offshore payroll hours (8h). 4h allowance is outside payroll.',
    }],
    idleAllocations: [{
      reasonId: DEFAULT_BREAK_IDLE_REASON_ID,
      reasonName: DEFAULT_BREAK_IDLE_REASON_NAME,
      hours: OFFSHORE_BREAK_HOURS,
      remarks: 'Offshore break',
    }],
    usedHours: OFFSHORE_PAYROLL_HOURS,
    idleHours: OFFSHORE_BREAK_HOURS,
    totalHours: OFFSHORE_PAYROLL_HOURS + OFFSHORE_BREAK_HOURS,
    variance: 0,
    remarks: OFFSHORE_REMARKS_MARKER,
    validationStatus: 'Valid',
    validationMessage: 'Offshore: 8h payroll + 1h break. 4h allowance is outside payroll.',
    attendanceMode: 'Manual',
    offshoreAllowanceHours: OFFSHORE_ALLOWANCE_HOURS,
  };
};

const linePersistenceScore = (line: TimesheetLine) =>
  (line.clockIn ? 1_000 : 0)
  + Number(line.totalHours || 0) * 10
  + Number(line.attendanceDuration || 0)
  + (line.validationStatus === 'Valid' ? 1 : 0);

/** One employee row per timesheet header — keeps the richest row when duplicates are posted. */
export const dedupeTimesheetLinesByEmployee = <T extends TimesheetLine>(lines: T[]) => {
  const byEmployee = new Map<string, T>();
  let duplicateCount = 0;
  for (const line of lines) {
    const key = normalizeEmployeeLineKey(line);
    if (!key) continue;
    const existing = byEmployee.get(key);
    if (!existing) {
      byEmployee.set(key, line);
      continue;
    }
    duplicateCount += 1;
    byEmployee.set(key, linePersistenceScore(line) >= linePersistenceScore(existing) ? line : existing);
  }
  return { lines: Array.from(byEmployee.values()), duplicateCount };
};

export const validateTimesheetLinesForPersist = (lines: TimesheetLine[]) => {
  const issues: string[] = [];
  const deduped = dedupeTimesheetLinesByEmployee(lines);
  if (deduped.duplicateCount > 0) {
    issues.push(`${deduped.duplicateCount} duplicate employee row(s) were collapsed before save.`);
  }
  for (const line of deduped.lines) {
    if (hasDuplicateProjectCodes(line.projectAllocations || [])) {
      issues.push(`${line.employeeName || line.employeeId}: duplicate project code on the same line.`);
    }
  }
  return { ok: issues.length === 0, issues, lines: deduped.lines };
};

/** Sync line totals from allocation rows and refresh biometric duration from clock times. */
export const reconcileTimesheetLineHours = (line: TimesheetLine): TimesheetLine => {
  const projectAllocations = normalizeProjectAllocations(line.projectAllocations || []);
  const idleAllocations = normalizeIdleAllocations(line.idleAllocations || []);
  const usedHours = sumProjectAllocationHours(projectAllocations);
  const idleHours = round1(idleAllocations.reduce((sum, item) => sum + Number(item.hours || 0), 0));
  const totalHours = round1(usedHours + idleHours);
  const attendanceDuration = resolveLineAttendanceDuration(line);
  return {
    ...line,
    projectAllocations,
    idleAllocations,
    usedHours,
    idleHours,
    totalHours,
    attendanceDuration,
  };
};

export type OvertimeAuthorization = {
  id: string;
  projectCode: string;
  projectName: string;
  requestedHours: number;
  requestedHeadcount: number;
  workCenter?: string;
  /** Justification from Overtime Management authorization. */
  reason?: string;
};

export type OvertimeBookingOptions = {
  enabled: boolean;
  devRelaxed: boolean;
  /** Book OT on approved/payroll-posted timesheets and refresh payroll feeds. */
  retroCorrection: boolean;
  /** Skip MD authorization workflow until go-live (test/reconciliation only). */
  openBooking: boolean;
};

/** Common overtime increments from site logbooks (1h, m² = 2h, m³ = 3h, …). */
export const OVERTIME_HOUR_OPTIONS = [1, 2, 3, 4, 5, 6, 8, 10] as const;
