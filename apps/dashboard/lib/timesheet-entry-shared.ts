/** Client-safe timesheet types and constants (no Node/SQL imports). */

export const STANDARD_TIMESHEET_HOURS = 8;
export const DAILY_BREAK_HOURS = 1;
export const GROSS_TIMESHEET_HOURS = STANDARD_TIMESHEET_HOURS + DAILY_BREAK_HOURS;
export const DEFAULT_BREAK_IDLE_REASON_ID = 'idl-009';
export const DEFAULT_BREAK_IDLE_REASON_NAME = 'Break Time';

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

/** Day: typical site day. Night: 18:00–02:00 = 8h standard; OT begins after 02:00. */
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
    description: 'Night shift · 18:00–02:00 (8h) · OT after 02:00',
  },
];

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

const parseClockMinutes = (value: string) => {
  const [h, m] = value.split(':').map((part) => Number(part));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
};

/**
 * Overtime hours implied by clock-out past the shift standard end.
 * Night: 18:00–02:00 is standard; anything after 02:00 until done is OT.
 * Day: OT after 17:00.
 */
export const impliedOvertimeHoursFromClock = (
  clockIn?: string | null,
  clockOut?: string | null,
  shiftValue?: string | null,
): number => {
  const shift = resolveTimesheetShift(shiftValue);
  const outTime = String(clockOut || '').trim();
  if (!outTime || outTime === '--:--') return 0;
  const outMinutes = parseClockMinutes(outTime);
  const endMinutes = parseClockMinutes(shift.end);
  if (outMinutes === null || endMinutes === null) return 0;

  const inTime = String(clockIn || '').trim();
  const inMinutes = inTime ? parseClockMinutes(inTime) : null;
  const overnight = inMinutes !== null && outMinutes < inMinutes;

  if (shift.crossesMidnight) {
    // Night standard ends at 02:00. Only early-morning outs after end count as OT.
    if (!overnight && outMinutes > (inMinutes ?? -1)) return 0;
    if (outMinutes <= endMinutes) return 0;
    return Math.round(((outMinutes - endMinutes) / 60) * 10) / 10;
  }

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
  if (!dayContext?.date) {
    return {
      standardProductiveHours: STANDARD_TIMESHEET_HOURS,
      grossHours: GROSS_TIMESHEET_HOURS,
      isReducedDay: false,
    };
  }
  const rules = timesheetDayRulesForDate(dayContext.date, dayContext.holidayDates);
  return {
    standardProductiveHours: rules.standardProductiveHours,
    grossHours: rules.grossHours,
    isReducedDay: rules.isReducedDay,
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
  if (durationMinutes < 0) durationMinutes += 24 * 60;
  return round1(durationMinutes / 60);
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

/** Productive hours (standard + OT) must be biometric duration minus 1h break. */
export const maxProductiveHoursFromBiometric = (attendanceDuration: number) => {
  if (attendanceDuration <= 0.001) return Number.POSITIVE_INFINITY;
  return round1(Math.max(0, attendanceDuration - DAILY_BREAK_HOURS));
};

export const formatProductiveHoursDenial = (input: {
  attendanceDuration: number;
  requestedProductive: number;
  standardProductiveHours?: number;
  requestedOtHours?: number;
}) => {
  const standard = input.standardProductiveHours ?? STANDARD_TIMESHEET_HOURS;
  const maxProductive = maxProductiveHoursFromBiometric(input.attendanceDuration);
  const otHours = input.requestedOtHours ?? round1(Math.max(0, input.requestedProductive - standard));
  const requiredBiometric = round1(input.requestedProductive + DAILY_BREAK_HOURS);
  return (
    `Cannot book ${standard}h + ${otHours}h OT = ${round1(input.requestedProductive)}h productive. ` +
    `Biometric duration is ${input.attendanceDuration}h (max productive ${input.attendanceDuration}h − 1h break = ${maxProductive}h). ` +
    `${round1(input.requestedProductive)}h productive requires at least ${requiredBiometric}h on the biometric log.`
  );
};

/** Max productive (work + OT) allowed: biometric duration minus 1h break. */
export const maxBookableProductiveHours = (
  line: { clockIn?: string | null; clockOut?: string | null; attendanceDuration?: number },
  _idleHours = DAILY_BREAK_HOURS,
) => {
  if (!line.clockIn) return Number.POSITIVE_INFINITY;
  const attendance = resolveLineAttendanceDuration(line);
  return maxProductiveHoursFromBiometric(attendance);
};

export const capProductiveHoursToAttendance = (
  productiveHours: number,
  line: { clockIn?: string | null; clockOut?: string | null; attendanceDuration?: number },
  _idleHours = DAILY_BREAK_HOURS,
) => {
  const maxProductive = maxBookableProductiveHours(line);
  if (!Number.isFinite(maxProductive)) return round1(productiveHours);
  return round1(Math.min(productiveHours, maxProductive));
};

export const canonicalProjectCode = (value?: string | null) => String(value || '').trim().toUpperCase();

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
  const booked = normalized.find((item) => Number(item.hours || 0) > 0);
  return canonicalProjectCode(booked?.projectCode) || codes[0] || 'GENERAL';
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
) => {
  const biometricCap = maxBookableProductiveHours(line, idleHours);
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
