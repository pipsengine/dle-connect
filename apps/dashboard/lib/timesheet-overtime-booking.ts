import {
  DAILY_BREAK_HOURS,
  STANDARD_TIMESHEET_HOURS,
  type OvertimeAuthorization,
  type OvertimeBookingOptions,
  type TimesheetDayContext,
  type TimesheetLine,
  DEFAULT_BREAK_IDLE_REASON_ID,
  DEFAULT_BREAK_IDLE_REASON_NAME,
  normalizeIdleAllocations,
  normalizeProjectAllocations,
  resolveTimesheetHours,
  sumProjectAllocationHours,
  canonicalProjectCode,
  resolvePrimaryProjectCode,
  attendanceDurationFromClock,
  resolveLineAttendanceDuration,
  maxBookableProductiveHours,
  maxProductiveHoursFromBiometric,
  formatProductiveHoursDenial,
  capProductiveHoursToAttendance,
} from '@/lib/timesheet-entry-shared';
import { resolveOvertimeBookingOptions } from '@/lib/timesheet-overtime-config';

export type { OvertimeAuthorization } from '@/lib/timesheet-entry-shared';

const round1 = (value: number) => Math.round(value * 10) / 10;

const OPEN_BOOKING_OT_CAP = 12;
const RECONCILIATION_OT_CAP = 24;

const openOvertimeCap = (booking: OvertimeBookingOptions) => {
  if (!booking.openBooking) return 0;
  return booking.retroCorrection ? RECONCILIATION_OT_CAP : OPEN_BOOKING_OT_CAP;
};

const reconciliationMaxProductiveHours = (
  line: TimesheetLine,
  standardProductiveHours: number,
  booking: OvertimeBookingOptions,
) => {
  const otCap = openOvertimeCap(booking);
  const openMax = round1(standardProductiveHours + otCap);
  if (!line.clockIn) return openMax;
  const fromAttendance = maxBookableProductiveHours(line, DAILY_BREAK_HOURS, null);
  if (!Number.isFinite(fromAttendance)) return openMax;
  return round1(Math.min(openMax, fromAttendance));
};

export const overtimeProductiveHours = (usedHours: number, standardProductiveHours = STANDARD_TIMESHEET_HOURS) =>
  round1(Math.max(0, usedHours - standardProductiveHours));

/** Overtime hours attributed to a project on a line (hours on project above standard day). */
export const overtimeHoursOnProject = (
  line: TimesheetLine,
  projectCode: string,
  standardProductiveHours = STANDARD_TIMESHEET_HOURS,
) => {
  const allocation = line.projectAllocations.find((item) => item.projectCode === projectCode);
  if (!allocation || !line.clockIn) return 0;
  const lineOt = overtimeProductiveHours(line.usedHours, standardProductiveHours);
  if (lineOt <= 0) return 0;
  const direct = round1(Math.max(0, allocation.hours - standardProductiveHours));
  if (direct > 0) return round1(Math.min(direct, lineOt));
  if (line.projectAllocations.length === 1) return lineOt;
  return round1(Math.min(lineOt, allocation.hours));
};

export const authorizationMatchesContext = (auth: OvertimeAuthorization, workCenter?: string | null) => {
  const authCenter = String(auth.workCenter || '').trim().toLowerCase();
  const selected = String(workCenter || '').trim().toLowerCase();
  if (!authCenter || !selected) return true;
  return authCenter === selected || authCenter.includes(selected) || selected.includes(authCenter);
};

export const findAuthorizationForProject = (
  authorizations: OvertimeAuthorization[],
  projectCode: string,
  workCenter?: string | null,
) =>
  authorizations.find(
    (item) => item.projectCode === projectCode && authorizationMatchesContext(item, workCenter),
  );

export const perEmployeeOvertimeCap = (auth: OvertimeAuthorization) => {
  const headcount = Math.max(1, Number(auth.requestedHeadcount) || 1);
  return round1(Number(auth.requestedHours) / headcount);
};

export const totalOvertimeBookedOnProject = (
  lines: TimesheetLine[],
  projectCode: string,
  standardProductiveHours = STANDARD_TIMESHEET_HOURS,
) => round1(lines.reduce((sum, line) => sum + overtimeHoursOnProject(line, projectCode, standardProductiveHours), 0));

export const employeesWithOvertimeOnProject = (
  lines: TimesheetLine[],
  projectCode: string,
  standardProductiveHours = STANDARD_TIMESHEET_HOURS,
) => lines.filter((line) => line.clockIn && overtimeHoursOnProject(line, projectCode, standardProductiveHours) > 0).length;

export const maxOvertimeForEmployee = (
  line: TimesheetLine,
  authorizations: OvertimeAuthorization[],
  allLines: TimesheetLine[],
  workCenter?: string | null,
  options?: Partial<OvertimeBookingOptions>,
  dayContext?: TimesheetDayContext,
) => {
  if (!line.clockIn) return 0;
  const booking = resolveOvertimeBookingOptions(options);
  const { standardProductiveHours } = resolveTimesheetHours(dayContext);
  const usedFromAllocations = sumProjectAllocationHours(line.projectAllocations);
  const maxProductive = maxBookableProductiveHours(line, DAILY_BREAK_HOURS, dayContext?.shiftLabel);
  const remainingProductive = Number.isFinite(maxProductive)
    ? round1(Math.max(0, maxProductive - usedFromAllocations))
    : Number.POSITIVE_INFINITY;
  if (booking.openBooking) {
    const otCap = openOvertimeCap(booking);
    const alreadyOt = overtimeProductiveHours(usedFromAllocations, standardProductiveHours);
    const policyRemaining = round1(Math.max(0, otCap - alreadyOt));
    return round1(Math.min(policyRemaining, remainingProductive));
  }
  let cap = 0;
  for (const auth of authorizations) {
    if (!authorizationMatchesContext(auth, workCenter)) continue;
    const hasProject = line.projectAllocations.some((item) => item.projectCode === auth.projectCode);
    if (!hasProject && line.usedHours <= standardProductiveHours + 0.001) {
      // Employee can still receive OT on this project when booking.
    } else if (!hasProject) continue;
    const perEmployee = perEmployeeOvertimeCap(auth);
    const poolUsed = totalOvertimeBookedOnProject(allLines, auth.projectCode, standardProductiveHours);
    const poolRemaining = booking.openBooking || booking.retroCorrection
      ? perEmployee
      : round1(Math.max(0, auth.requestedHours - poolUsed + overtimeHoursOnProject(line, auth.projectCode, standardProductiveHours)));
    const slotsUsed = employeesWithOvertimeOnProject(allLines, auth.projectCode, standardProductiveHours);
    const alreadyBooked = overtimeHoursOnProject(line, auth.projectCode, standardProductiveHours) > 0;
    const slotsRemaining = booking.openBooking || booking.retroCorrection
      ? Math.max(1, auth.requestedHeadcount)
      : Math.max(0, auth.requestedHeadcount - slotsUsed + (alreadyBooked ? 1 : 0));
    const slotShare = slotsRemaining > 0 ? round1(poolRemaining / slotsRemaining) : 0;
    const attendanceCap = Number.isFinite(maxProductive)
      ? round1(Math.max(0, maxProductive - standardProductiveHours))
      : booking.openBooking || booking.retroCorrection
        ? 12
        : round1(Math.max(0, resolveLineAttendanceDuration(line) - DAILY_BREAK_HOURS - standardProductiveHours));
    cap = Math.max(cap, Math.min(perEmployee, slotShare, attendanceCap, remainingProductive));
  }
  return round1(cap);
};

export const maxAllowedProductiveHours = (
  line: TimesheetLine,
  authorizations: OvertimeAuthorization[],
  allLines: TimesheetLine[],
  workCenter?: string | null,
  options?: Partial<OvertimeBookingOptions>,
  dayContext?: TimesheetDayContext,
) => {
  const { standardProductiveHours } = resolveTimesheetHours(dayContext);
  return round1(standardProductiveHours + maxOvertimeForEmployee(line, authorizations, allLines, workCenter, options, dayContext));
};

export const maxAllowedTotalHours = (
  line: TimesheetLine,
  authorizations: OvertimeAuthorization[],
  allLines: TimesheetLine[],
  workCenter?: string | null,
  options?: Partial<OvertimeBookingOptions>,
  dayContext?: TimesheetDayContext,
) => {
  const breakHours = resolveTimesheetHours(dayContext).shiftKind === 'Night' ? 0 : DAILY_BREAK_HOURS;
  return round1(maxAllowedProductiveHours(line, authorizations, allLines, workCenter, options, dayContext) + breakHours);
};

export type OvertimeValidation = {
  validationStatus: TimesheetLine['validationStatus'];
  validationMessage: string | null;
  usedHours: number;
  idleHours: number;
  totalHours: number;
  variance: number;
};

export const validateStrictStandardDay = (line: TimesheetLine, dayContext?: TimesheetDayContext): OvertimeValidation => {
  const { standardProductiveHours, grossHours } = resolveTimesheetHours(dayContext);
  const isAbsentLine = !line.clockIn;
  const projectAllocations = normalizeProjectAllocations(line.projectAllocations || []);
  const usedHours = sumProjectAllocationHours(projectAllocations);
  const idleHours = round1((line.idleAllocations || []).reduce((sum, item) => sum + Number(item.hours || 0), 0));
  const totalHours = round1(usedHours + idleHours);
  const variance = round1(totalHours - grossHours);
  const attendanceDuration = resolveLineAttendanceDuration(line);

  if (isAbsentLine && usedHours > 0.001) {
    return {
      usedHours,
      idleHours,
      totalHours,
      variance,
      validationStatus: 'Error',
      validationMessage: 'Absent employees cannot receive project/productive hours.',
    };
  }
  if (usedHours > standardProductiveHours + 0.001) {
    return {
      usedHours,
      idleHours,
      totalHours,
      variance,
      validationStatus: 'Error',
      validationMessage: `Productive/payroll hours cannot exceed ${standardProductiveHours} hours per day.`,
    };
  }
  if (totalHours > grossHours + 0.001) {
    return {
      usedHours,
      idleHours,
      totalHours,
      variance,
      validationStatus: 'Error',
      validationMessage: `Total timesheet hours cannot exceed ${grossHours} hours including break time.`,
    };
  }
  if (line.clockIn && attendanceDuration > 0.001 && totalHours > attendanceDuration + 0.001) {
    const maxProductive = maxProductiveHoursFromBiometric(attendanceDuration, dayContext?.shiftLabel);
    return {
      usedHours,
      idleHours,
      totalHours,
      variance,
      validationStatus: 'Error',
      validationMessage:
        `Work + break (${totalHours}h) exceeds biometric duration (${attendanceDuration}h). ` +
        `Productive hours are limited to ${maxProductive}h.`,
    };
  }
  const maxProductiveFromAttendance = maxBookableProductiveHours(line, DAILY_BREAK_HOURS, dayContext?.shiftLabel);
  if (
    line.clockIn &&
    Number.isFinite(maxProductiveFromAttendance) &&
    usedHours > maxProductiveFromAttendance + 0.001
  ) {
    return {
      usedHours,
      idleHours,
      totalHours,
      variance,
      validationStatus: 'Error',
      validationMessage: formatProductiveHoursDenial({
        attendanceDuration,
        requestedProductive: usedHours,
        standardProductiveHours,
        requestedOtHours: overtimeProductiveHours(usedHours, standardProductiveHours),
        shiftLabel: dayContext?.shiftLabel,
      }),
    };
  }
  if (totalHours === grossHours && usedHours === standardProductiveHours) {
    return { usedHours, idleHours, totalHours, variance, validationStatus: 'Valid', validationMessage: null };
  }
  if (idleHours > 0 && line.idleAllocations.some((item) => item.hours > 0 && !item.reasonId)) {
    return {
      usedHours,
      idleHours,
      totalHours,
      variance,
      validationStatus: 'Warning',
      validationMessage: 'Idle time requires a valid reason.',
    };
  }
  return {
    usedHours,
    idleHours,
    totalHours,
    variance,
    validationStatus: 'Incomplete',
    validationMessage: `Awaiting full ${grossHours}-hour allocation including ${DAILY_BREAK_HOURS}h break. Current: ${totalHours} hrs.`,
  };
};

export const validateTimesheetLine = (
  line: TimesheetLine,
  authorizations: OvertimeAuthorization[],
  allLines: TimesheetLine[],
  workCenter?: string | null,
  options?: Partial<OvertimeBookingOptions>,
  dayContext?: TimesheetDayContext,
): OvertimeValidation => {
  const booking = resolveOvertimeBookingOptions(options);
  const { standardProductiveHours, grossHours } = resolveTimesheetHours(dayContext);
  if (!booking.enabled) {
    return validateStrictStandardDay(line, dayContext);
  }

  const isAbsentLine = !line.clockIn;
  const projectAllocations = normalizeProjectAllocations(line.projectAllocations || []);
  const usedHours = sumProjectAllocationHours(projectAllocations);
  const idleHours = round1((line.idleAllocations || []).reduce((sum, item) => sum + Number(item.hours || 0), 0));
  const totalHours = round1(usedHours + idleHours);
  const variance = round1(totalHours - grossHours);
  const maxProductive = booking.openBooking
    ? reconciliationMaxProductiveHours(line, standardProductiveHours, booking)
    : maxAllowedProductiveHours(line, authorizations, allLines, workCenter, booking, dayContext);
  const maxTotal = booking.openBooking
    ? round1(maxProductive + (resolveTimesheetHours(dayContext).shiftKind === 'Night' ? 0 : DAILY_BREAK_HOURS))
    : maxAllowedTotalHours(line, authorizations, allLines, workCenter, booking, dayContext);
  const lineOt = overtimeProductiveHours(usedHours, standardProductiveHours);
  const attendanceDuration = resolveLineAttendanceDuration(line);

  if (isAbsentLine && usedHours > 0.001) {
    return {
      usedHours,
      idleHours,
      totalHours,
      variance,
      validationStatus: 'Error',
      validationMessage: 'Absent employees cannot receive project/productive hours.',
    };
  }

  if (lineOt > 0.001 && !booking.openBooking) {
    const authorizedProjects = authorizations.filter((auth) => authorizationMatchesContext(auth, workCenter));
    const otProjects = authorizedProjects.filter((auth) => overtimeHoursOnProject({ ...line, usedHours }, auth.projectCode, standardProductiveHours) > 0);
    if (!otProjects.length) {
      const devMax = booking.devRelaxed
        ? round1(Math.max(0, line.attendanceDuration - DAILY_BREAK_HOURS - standardProductiveHours))
        : 0;
      if (!(booking.devRelaxed && lineOt <= devMax + 0.001)) {
        return {
          usedHours,
          idleHours,
          totalHours,
          variance,
          validationStatus: 'Error',
          validationMessage: booking.devRelaxed
            ? 'Overtime requires an approved authorization or must stay within attendance duration in dev mode.'
            : 'Overtime requires an approved authorization for the booked project.',
        };
      }
    }
    if (!booking.retroCorrection) {
      for (const auth of otProjects) {
        const poolUsed = totalOvertimeBookedOnProject(allLines.map((item) => (item.id === line.id ? { ...line, usedHours } : item)), auth.projectCode, standardProductiveHours);
        if (poolUsed > auth.requestedHours + 0.001) {
          return {
            usedHours,
            idleHours,
            totalHours,
            variance,
            validationStatus: 'Error',
            validationMessage: `Approved overtime pool for ${auth.projectCode} exceeded (${auth.requestedHours}h max).`,
          };
        }
        const headcount = employeesWithOvertimeOnProject(
          allLines.map((item) => (item.id === line.id ? { ...line, usedHours } : item)),
          auth.projectCode,
          standardProductiveHours,
        );
        if (headcount > auth.requestedHeadcount) {
          return {
            usedHours,
            idleHours,
            totalHours,
            variance,
            validationStatus: 'Error',
            validationMessage: `Approved overtime headcount for ${auth.projectCode} exceeded (${auth.requestedHeadcount} max).`,
          };
        }
      }
    }
  }

  if (usedHours > maxProductive + 0.001) {
    return {
      usedHours,
      idleHours,
      totalHours,
      variance,
      validationStatus: 'Error',
      validationMessage:
        lineOt > 0
          ? `Overtime exceeds approved limit (${usedHours}h booked / ${maxProductive}h max productive for this employee).`
          : `Productive/payroll hours cannot exceed ${standardProductiveHours} hours per day without approved overtime.`,
    };
  }

  if (totalHours > maxTotal + 0.001) {
    return {
      usedHours,
      idleHours,
      totalHours,
      variance,
      validationStatus: 'Error',
      validationMessage: `Total timesheet hours cannot exceed ${maxTotal}h including break time.`,
    };
  }

  if (line.clockIn && attendanceDuration > 0.001 && totalHours > attendanceDuration + 0.001) {
    const maxProductive = maxProductiveHoursFromBiometric(attendanceDuration, dayContext?.shiftLabel);
    return {
      usedHours,
      idleHours,
      totalHours,
      variance,
      validationStatus: 'Error',
      validationMessage:
        `Work + break (${totalHours}h) exceeds biometric duration (${attendanceDuration}h). ` +
        `Productive hours are limited to ${maxProductive}h.`,
    };
  }
  const maxProductiveFromAttendance = maxBookableProductiveHours(line, DAILY_BREAK_HOURS, dayContext?.shiftLabel);
  if (
    line.clockIn &&
    Number.isFinite(maxProductiveFromAttendance) &&
    usedHours > maxProductiveFromAttendance + 0.001
  ) {
    return {
      usedHours,
      idleHours,
      totalHours,
      variance,
      validationStatus: 'Error',
      validationMessage: formatProductiveHoursDenial({
        attendanceDuration,
        requestedProductive: usedHours,
        standardProductiveHours,
        requestedOtHours: overtimeProductiveHours(usedHours, standardProductiveHours),
        shiftLabel: dayContext?.shiftLabel,
      }),
    };
  }

  const isNight = resolveTimesheetHours(dayContext).shiftKind === 'Night';
  const isStandardComplete = totalHours === grossHours && usedHours === standardProductiveHours;
  const isOvertimeComplete =
    lineOt > 0 &&
    (isNight || idleHours >= DAILY_BREAK_HOURS - 0.001) &&
    usedHours <= maxProductive + 0.001 &&
    totalHours <= maxTotal + 0.001;

  if (isStandardComplete || isOvertimeComplete) {
    return { usedHours, idleHours, totalHours, variance, validationStatus: 'Valid', validationMessage: null };
  }

  if (idleHours > 0 && line.idleAllocations.some((item) => item.hours > 0 && !item.reasonId)) {
    return {
      usedHours,
      idleHours,
      totalHours,
      variance,
      validationStatus: 'Warning',
      validationMessage: 'Idle time requires a valid reason.',
    };
  }

  return {
    usedHours,
    idleHours,
    totalHours,
    variance,
    validationStatus: 'Incomplete',
    validationMessage: lineOt > 0
      ? `Awaiting full overtime booking. Current: ${totalHours}h total / ${usedHours}h productive.`
      : isNight
        ? `Awaiting full ${grossHours}-hour night allocation. Current: ${totalHours} hrs.`
        : `Awaiting full ${grossHours}-hour allocation including ${DAILY_BREAK_HOURS}h break. Current: ${totalHours} hrs.`,
  };
};

export type OvertimeBookingPreview = {
  canApply: boolean;
  appliedOtHours: number;
  targetProductiveHours: number;
  denialReason: string | null;
};

export const previewOvertimeBooking = (
  line: TimesheetLine,
  otHours: number,
  dayContext?: TimesheetDayContext,
): OvertimeBookingPreview => {
  const { standardProductiveHours } = resolveTimesheetHours(dayContext);
  const attendance = resolveLineAttendanceDuration(line);
  const maxProductive = maxProductiveHoursFromBiometric(attendance, dayContext?.shiftLabel);
  const requestedProductive = round1(standardProductiveHours + otHours);

  if (!line.clockIn || !Number.isFinite(maxProductive)) {
    return {
      canApply: true,
      appliedOtHours: otHours,
      targetProductiveHours: requestedProductive,
      denialReason: null,
    };
  }

  if (requestedProductive <= maxProductive + 0.001) {
    return {
      canApply: true,
      appliedOtHours: otHours,
      targetProductiveHours: requestedProductive,
      denialReason: null,
    };
  }

  const appliedOtHours = round1(Math.max(0, maxProductive - standardProductiveHours));
  const targetProductiveHours = round1(standardProductiveHours + appliedOtHours);
  if (appliedOtHours <= 0) {
    return {
      canApply: false,
      appliedOtHours: 0,
      targetProductiveHours: standardProductiveHours,
      denialReason: formatProductiveHoursDenial({
        attendanceDuration: attendance,
        requestedProductive,
        standardProductiveHours,
        requestedOtHours: otHours,
        shiftLabel: dayContext?.shiftLabel,
      }),
    };
  }

  return {
    canApply: true,
    appliedOtHours,
    targetProductiveHours,
    denialReason:
      `Only ${appliedOtHours}h OT fits the biometric log (${standardProductiveHours}h + ${appliedOtHours}h OT = ${targetProductiveHours}h; ` +
      `${attendance}h biometric − 1h break = ${maxProductive}h max). Requested ${otHours}h OT.`,
  };
};

export const applyOvertimeBooking = (
  line: TimesheetLine,
  auth: OvertimeAuthorization,
  otHours: number,
  allLines: TimesheetLine[],
  workCenter?: string | null,
  options?: Partial<OvertimeBookingOptions>,
  dayContext?: TimesheetDayContext,
  primaryProjectCode?: string | null,
): TimesheetLine => {
  const booking = resolveOvertimeBookingOptions(options);
  const { standardProductiveHours } = resolveTimesheetHours(dayContext);

  let allocations = normalizeProjectAllocations(line.projectAllocations);
  const authCode = canonicalProjectCode(auth.projectCode);
  const primaryCode = resolvePrimaryProjectCode(
    [primaryProjectCode || '', authCode].filter(Boolean),
    allocations,
  );
  const currentUsed = sumProjectAllocationHours(allocations);
  const retroEmptyLine = (booking.openBooking || booking.retroCorrection) && currentUsed <= 0.001;
  const targetCode =
    booking.openBooking || booking.retroCorrection
      ? (retroEmptyLine ? primaryCode : authCode)
      : authCode;

  const idleAllocations = resolveTimesheetHours(dayContext).shiftKind === 'Night'
    ? normalizeIdleAllocations(line.idleAllocations || [])
    : normalizeIdleAllocations(
        line.idleAllocations.length > 0
          ? line.idleAllocations.map((item, itemIndex) =>
              itemIndex === 0 ? { ...item, hours: DAILY_BREAK_HOURS } : { ...item, hours: 0 },
            )
          : [{ reasonId: 'idl-009', reasonName: 'Break Time', hours: DAILY_BREAK_HOURS, remarks: null }],
      );
  const draftIdle = round1(idleAllocations.reduce((sum, item) => sum + Number(item.hours || 0), 0));

  let workingLine = line;
  const clockDuration = attendanceDurationFromClock(line.clockIn, line.clockOut);
  if (clockDuration !== null && clockDuration > 0) {
    workingLine = { ...workingLine, attendanceDuration: clockDuration };
  }

  const maxProductive = maxBookableProductiveHours(workingLine, draftIdle, dayContext?.shiftLabel);
  const policyCap = round1(
    Math.min(
      otHours,
      maxOvertimeForEmployee(
        { ...workingLine, usedHours: currentUsed },
        [auth],
        allLines,
        workCenter,
        booking,
        dayContext,
      ),
      booking.openBooking || booking.retroCorrection ? otHours : perEmployeeOvertimeCap(auth),
    ),
  );
  const requestedProductive = retroEmptyLine
    ? round1(standardProductiveHours + policyCap)
    : round1(currentUsed + policyCap);
  const targetProductive = Number.isFinite(maxProductive)
    ? capProductiveHoursToAttendance(requestedProductive, workingLine, draftIdle, dayContext?.shiftLabel)
    : requestedProductive;
  const effectiveOt = round1(Math.max(0, targetProductive - currentUsed));
  const preview = previewOvertimeBooking(workingLine, otHours, dayContext);
  if (!preview.canApply && effectiveOt <= 0) {
    return {
      ...line,
      validationStatus: 'Error',
      validationMessage: preview.denialReason,
    };
  }

  const appliedOt = preview.canApply
    ? effectiveOt
    : round1(Math.max(0, Math.min(effectiveOt, preview.appliedOtHours)));

  const index = allocations.findIndex((item) => canonicalProjectCode(item.projectCode) === targetCode);

  if (index >= 0) {
    allocations[index] = {
      ...allocations[index],
      hours: retroEmptyLine ? targetProductive : round1(allocations[index].hours + appliedOt),
      remarks: `OT:${auth.id}`,
    };
  } else {
    allocations.push({
      projectId: targetCode,
      projectCode: targetCode,
      projectName: auth.projectName,
      hours: retroEmptyLine ? targetProductive : appliedOt,
      remarks: `OT:${auth.id}`,
    });
  }

  const normalizedAllocations = normalizeProjectAllocations(allocations);

  const draftUsed = sumProjectAllocationHours(normalizedAllocations);
  const draftTotal = round1(draftUsed + draftIdle);

  if ((booking.retroCorrection || booking.openBooking) && line.clockIn && clockDuration === null) {
    const minAttendance = round1(Math.max(workingLine.attendanceDuration, draftTotal));
    if (workingLine.attendanceDuration < minAttendance - 0.001) {
      workingLine = { ...workingLine, attendanceDuration: minAttendance };
    }
  }

  const draft = { ...workingLine, projectAllocations: normalizedAllocations, idleAllocations };
  const validated = validateTimesheetLine(draft, [auth], allLines, workCenter, booking, dayContext);
  const bookingNotice =
    preview.denialReason ||
    (policyCap < otHours - 0.001
      ? formatProductiveHoursDenial({
          attendanceDuration: resolveLineAttendanceDuration(workingLine),
          requestedProductive: round1(standardProductiveHours + otHours),
          standardProductiveHours,
          requestedOtHours: otHours,
          shiftLabel: dayContext?.shiftLabel,
        })
      : null);
  return {
    ...draft,
    usedHours: validated.usedHours,
    idleHours: validated.idleHours,
    totalHours: validated.totalHours,
    variance: validated.variance,
    validationStatus: bookingNotice && validated.validationStatus !== 'Error' ? 'Warning' : validated.validationStatus,
    validationMessage: validated.validationMessage || bookingNotice,
  };
};

export const remainingOvertimePool = (auth: OvertimeAuthorization, lines: TimesheetLine[]) =>
  round1(Math.max(0, auth.requestedHours - totalOvertimeBookedOnProject(lines, auth.projectCode)));

export const remainingOvertimeSlots = (auth: OvertimeAuthorization, lines: TimesheetLine[]) =>
  Math.max(0, auth.requestedHeadcount - employeesWithOvertimeOnProject(lines, auth.projectCode));

export const lineHasOvertimeBooking = (line: TimesheetLine, standardProductiveHours = STANDARD_TIMESHEET_HOURS) =>
  overtimeProductiveHours(line.usedHours, standardProductiveHours) > 0.001 ||
  (line.projectAllocations || []).some((item) => String(item.remarks || '').startsWith('OT:'));

/** Strip booked overtime from a line so supervisors can rebook against the correct project. */
export const reverseOvertimeBookingOnLine = (
  line: TimesheetLine,
  allLines: TimesheetLine[],
  dayContext?: TimesheetDayContext,
): TimesheetLine => {
  const { standardProductiveHours } = resolveTimesheetHours(dayContext);
  if (!lineHasOvertimeBooking(line, standardProductiveHours)) return line;

  const snapshot = { ...line, projectAllocations: normalizeProjectAllocations(line.projectAllocations) };
  const allocations = snapshot.projectAllocations.flatMap((alloc) => {
    const hasOtRemark = String(alloc.remarks || '').startsWith('OT:');
    if (!hasOtRemark) return [alloc];

    const otOnProject = overtimeHoursOnProject(snapshot, alloc.projectCode, standardProductiveHours);
    if (otOnProject <= 0.001) {
      const { remarks, ...rest } = alloc;
      return [{ ...rest, remarks: null }];
    }

    const nonOtHours = round1(Math.max(0, alloc.hours - otOnProject));
    if (nonOtHours <= 0.001) return [];
    return [{ ...alloc, hours: nonOtHours, remarks: null }];
  });

  const idleAllocations = normalizeIdleAllocations(
    line.idleAllocations?.length
      ? line.idleAllocations.map((item, index) =>
          index === 0 ? { ...item, hours: DAILY_BREAK_HOURS } : { ...item, hours: 0 },
        )
      : [{ reasonId: DEFAULT_BREAK_IDLE_REASON_ID, reasonName: DEFAULT_BREAK_IDLE_REASON_NAME, hours: DAILY_BREAK_HOURS, remarks: null }],
  );

  const draft: TimesheetLine = {
    ...line,
    projectAllocations: normalizeProjectAllocations(allocations),
    idleAllocations,
    validationMessage: null,
  };

  const validated = validateTimesheetLine(draft, [], allLines, null, { enabled: false }, dayContext);
  return {
    ...draft,
    usedHours: validated.usedHours,
    idleHours: validated.idleHours,
    totalHours: validated.totalHours,
    variance: validated.variance,
    validationStatus: validated.validationStatus,
    validationMessage: validated.validationMessage,
  };
};

export const reverseOvertimeBookingOnLines = (
  lines: TimesheetLine[],
  dayContext?: TimesheetDayContext,
) => {
  let next = [...lines];
  for (let index = 0; index < next.length; index += 1) {
    const reversed = reverseOvertimeBookingOnLine(next[index], next, dayContext);
    if (reversed !== next[index]) next[index] = reversed;
  }
  return next;
};
