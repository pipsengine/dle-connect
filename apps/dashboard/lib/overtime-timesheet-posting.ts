import { normalizePayrollMatchKey } from '@/lib/sage-people-payroll-store';
import {
  isTimesheetPayrollReadyStatus,
  readTimesheetData,
  refreshTimesheetPayrollUpdatesForHeaders,
  syncAttendanceForTimesheet,
  writeTimesheetHeaderLines,
  type TimesheetHeader,
  type TimesheetLine,
} from '@/lib/timesheet-entry-store';
import { applyOvertimeBooking } from '@/lib/timesheet-overtime-booking';
import { resolveOvertimeBookingOptions } from '@/lib/timesheet-overtime-config';
import type { OvertimeAuthorization } from '@/lib/timesheet-entry-shared';

export type ApprovedOvertimePostingInput = {
  requestId: string;
  workDate: string;
  supervisorCode: string;
  supervisorName: string;
  workCenter: string;
  projectCode: string;
  projectName: string;
  overtimeType?: string | null;
  employees: Array<{ employeeCode: string; employeeName: string; overtimeHours: number }>;
};

export type ApprovedOvertimePostingResult = {
  posted: number;
  skipped: Array<{ employeeCode: string; reason: string }>;
  headerId: string | null;
  payrollRefreshed: boolean;
};

const clean = (value: unknown) => String(value || '').trim();

const lineMatchKeys = (line: TimesheetLine) =>
  [line.employeeId, line.employeeNo, line.employeeName].map(normalizePayrollMatchKey).filter(Boolean);

/**
 * Post approved overtime hours onto the respective employees' timesheet for the
 * authorization work date. Reuses the same booking primitives as the manual
 * timesheet flow so validation, caps, and payroll refresh remain consistent.
 *
 * This never throws — approval must still succeed even if timesheet posting is
 * partially unavailable. The returned summary reports what was posted/skipped.
 */
export const postApprovedOvertimeToTimesheets = async (
  input: ApprovedOvertimePostingInput,
): Promise<ApprovedOvertimePostingResult> => {
  const result: ApprovedOvertimePostingResult = { posted: 0, skipped: [], headerId: null, payrollRefreshed: false };
  const employees = (input.employees || []).filter((employee) => clean(employee.employeeCode) && Number(employee.overtimeHours) > 0);
  if (!employees.length) return result;

  const booking = resolveOvertimeBookingOptions();
  if (!booking.enabled) {
    result.skipped = employees.map((employee) => ({ employeeCode: employee.employeeCode, reason: 'Overtime booking disabled in this environment.' }));
    return result;
  }

  const supervisorId = `${clean(input.supervisorCode)} - ${clean(input.supervisorName)}`.replace(/^ - | - $/g, '').trim() || clean(input.supervisorName) || clean(input.supervisorCode);
  const workCenter = clean(input.workCenter) || 'Unassigned';

  // Ensure a timesheet header/lines exist for this supervisor + date + work center.
  try {
    await syncAttendanceForTimesheet(input.workDate, supervisorId, workCenter, undefined);
  } catch (error) {
    console.warn('Overtime posting: attendance sync failed, will attempt with existing timesheet data.', error);
  }

  const { headers, lines } = await readTimesheetData();
  const header =
    headers.find((item) => item.timesheetDate === input.workDate && item.supervisorId === supervisorId && item.workCenterName === workCenter) ||
    headers.find((item) => item.timesheetDate === input.workDate && item.supervisorId === supervisorId) ||
    null;

  if (!header) {
    result.skipped = employees.map((employee) => ({ employeeCode: employee.employeeCode, reason: 'No timesheet found for the supervisor and work date.' }));
    return result;
  }
  result.headerId = header.id;

  const auth: OvertimeAuthorization = {
    id: `ota-${input.requestId}`,
    projectCode: clean(input.projectCode) || 'GENERAL',
    projectName: clean(input.projectName) || clean(input.projectCode) || 'General Project Work',
    requestedHours: employees.reduce((sum, employee) => sum + Number(employee.overtimeHours || 0), 0),
    requestedHeadcount: employees.length,
    workCenter,
  };
  const dayContext = { date: input.workDate, holidayDates: [] as string[] };

  const nextLines = lines.filter((line) => line.headerId === header.id);

  for (const employee of employees) {
    const employeeKeys = [employee.employeeCode, employee.employeeName].map(normalizePayrollMatchKey).filter(Boolean);
    const index = nextLines.findIndex((line) => lineMatchKeys(line).some((key) => employeeKeys.includes(key)));
    if (index < 0) {
      result.skipped.push({ employeeCode: employee.employeeCode, reason: 'Employee not present on the timesheet for this date.' });
      continue;
    }
    const booked = applyOvertimeBooking(
      nextLines[index],
      auth,
      Number(employee.overtimeHours || 0),
      nextLines,
      workCenter,
      booking,
      dayContext,
      auth.projectCode,
    );
    if (booked.validationStatus === 'Error') {
      result.skipped.push({ employeeCode: employee.employeeCode, reason: booked.validationMessage || 'Overtime could not be applied.' });
      continue;
    }
    nextLines[index] = booked;
    result.posted += 1;
  }

  if (!result.posted) return result;

  const persistHeader: TimesheetHeader = {
    ...header,
    workflowHistory: [
      ...(header.workflowHistory || []),
      {
        stage: 'Supervisor',
        decision: 'Overtime Booked',
        by: 'Overtime Workflow',
        actedAt: new Date().toISOString(),
        comment: `Auto-posted approved overtime (${result.posted} employee(s)) from authorization ${input.requestId}.`,
      },
    ],
  };

  await writeTimesheetHeaderLines(persistHeader, nextLines);

  if (isTimesheetPayrollReadyStatus(header.status)) {
    try {
      await refreshTimesheetPayrollUpdatesForHeaders([header.id], 'Overtime Workflow');
      result.payrollRefreshed = true;
    } catch (error) {
      console.warn('Overtime posting: payroll refresh failed.', error);
    }
  }

  return result;
};
