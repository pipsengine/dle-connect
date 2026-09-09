/**
 * Sync approved leave onto C-code (daily rate) supervisor timesheets.
 * Leave hours are booked to the IDLE TIME project (DL1949).
 */
import type { DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import { readPayrollEmployees } from '@/lib/payroll-employee-source';
import { readSupervisorAssignments } from '@/lib/supervisor-assignment-store';
import { extractSupervisorEmployeeCode, normalizeTimesheetLocationLabel } from '@/lib/timesheet-agege-blasting';
import {
  APPROVED_PAID_LEAVE_REMARK,
  STANDARD_TIMESHEET_HOURS,
  buildLeaveIdleTimeAllocation,
  isDayRateTimesheetEmployeeCode,
  isEditableTimesheetStatus,
  isTimesheetPaidLeaveLine,
  normalizeEmployeeLineKey,
  normalizeProjectAllocations,
  resolveTimesheetShift,
  timesheetShiftHeaderSlug,
} from '@/lib/timesheet-entry-shared';
import {
  calculateTimesheetPeriod,
  readTimesheetData,
  writeTimesheetHeaderLines,
  type TimesheetHeader,
  type TimesheetLine,
} from '@/lib/timesheet-entry-store';

export type LeaveTimesheetSyncInput = {
  employeeId: string;
  employeeCode?: string | null;
  employeeName?: string | null;
  leaveType?: string | null;
  startDate: string;
  endDate: string;
  requestId: string;
  mode: 'apply' | 'remove';
};

const compact = (value: unknown) => String(value || '').trim();
const leaveRemarkFor = (requestId: string) => `${APPROVED_PAID_LEAVE_REMARK} ${compact(requestId)}`;

const isWorkingDate = (date: string) => {
  const day = new Date(`${date.slice(0, 10)}T00:00:00.000Z`).getUTCDay();
  return day !== 0 && day !== 6;
};

export const workingDatesInLeaveRange = (startDate: string, endDate: string) => {
  const start = compact(startDate).slice(0, 10);
  const end = compact(endDate).slice(0, 10);
  if (!start || !end || end < start) return [] as string[];
  const dates: string[] = [];
  for (let cursor = new Date(`${start}T00:00:00.000Z`); cursor <= new Date(`${end}T00:00:00.000Z`); cursor = new Date(cursor.getTime() + 86400000)) {
    const iso = cursor.toISOString().slice(0, 10);
    if (isWorkingDate(iso)) dates.push(iso);
  }
  return dates;
};

const employeeKeys = (employeeCode: string, employeeId?: string | null, employeeName?: string | null) => {
  const keys = new Set<string>();
  for (const value of [employeeCode, employeeId, employeeName]) {
    const key = normalizeEmployeeLineKey({ employeeId: value, employeeNo: value });
    if (key) keys.add(key);
  }
  return keys;
};

const lineMatchesEmployee = (line: TimesheetLine, keys: Set<string>) => {
  const lineKeys = employeeKeys(line.employeeId, line.employeeNo, line.employeeName);
  return [...lineKeys].some((key) => keys.has(key));
};

const supervisorScopeKeys = (value: string | null | undefined) => {
  const raw = compact(value).toUpperCase();
  const keys = new Set<string>();
  const add = (input: string) => {
    const normalized = input.replace(/[^A-Z0-9]/g, '');
    if (!normalized) return;
    keys.add(normalized);
    const withoutPrefix = normalized.replace(/^[PCLNI]+(?=\d)/, '').replace(/^0+/, '');
    if (withoutPrefix) keys.add(withoutPrefix);
  };
  add(raw);
  if (raw.includes(' - ')) add(raw.split(' - ')[0] || '');
  return keys;
};

const supervisorMatches = (left: string | null | undefined, right: string | null | undefined) => {
  const a = supervisorScopeKeys(left);
  const b = supervisorScopeKeys(right);
  if (!a.size || !b.size) return false;
  return [...a].some((key) => b.has(key));
};

const resolveEmployeeRecord = async (employeeId: string, employeeCode?: string | null) => {
  const source = await readPayrollEmployees();
  const id = compact(employeeId).toUpperCase();
  const code = compact(employeeCode || employeeId).toUpperCase();
  return source.employees.find((row) =>
    compact(row.employeeId).toUpperCase() === id
    || compact(row.employeeCode).toUpperCase() === code
    || compact(row.employeeCode).toUpperCase() === id
    || compact(row.employeeId).toUpperCase() === code,
  ) || null;
};

const resolveSupervisorId = async (employee: DleEmployeeDirectoryRow) => {
  const code = compact(employee.employeeCode).toUpperCase();
  const assignments = await readSupervisorAssignments().catch(() => []);
  const hit = assignments.find((row) =>
    compact(row.employeeCode).toUpperCase() === code
    && row.matchedStatus !== 'Unresolved'
    && compact(row.supervisorEmployeeCode),
  );
  if (hit?.supervisorEmployeeCode) {
    const supCode = compact(hit.supervisorEmployeeCode);
    const supName = compact(hit.supervisorName) || supCode;
    return `${supCode} - ${supName}`;
  }
  const managerCode = extractSupervisorEmployeeCode(employee.managerName);
  if (managerCode) {
    const source = await readPayrollEmployees();
    const manager = source.employees.find((row) => compact(row.employeeCode).toUpperCase() === managerCode);
    if (manager) return `${manager.employeeCode} - ${manager.fullName}`;
  }
  if (compact(employee.managerName)) return compact(employee.managerName);
  return null;
};

const resolveWorkCenterName = (
  employee: DleEmployeeDirectoryRow,
  headers: TimesheetHeader[],
  lines: TimesheetLine[],
  employeeCode: string,
  supervisorId: string,
) => {
  const code = compact(employeeCode).toUpperCase();
  const recent = headers
    .filter((header) => supervisorMatches(header.supervisorId, supervisorId) || supervisorMatches(header.supervisorName, supervisorId))
    .sort((a, b) => String(b.timesheetDate || '').localeCompare(String(a.timesheetDate || '')));
  for (const header of recent) {
    const hasEmployee = lines.some((line) =>
      line.headerId === header.id
      && compact(line.employeeId).toUpperCase() === code,
    );
    if (hasEmployee && compact(header.workCenterName)) return header.workCenterName;
  }
  return normalizeTimesheetLocationLabel(employee.location || employee.workLocation) || 'General';
};

const allocationIsLeaveForRequest = (
  allocation: { projectCode?: string; remarks?: string | null },
  requestId: string,
) => {
  const remarks = compact(allocation.remarks).toLowerCase();
  const requestKey = compact(requestId).toLowerCase();
  return (
    isTimesheetPaidLeaveLine({ projectAllocations: [allocation], remarks: allocation.remarks })
    && (!requestKey || remarks.includes(requestKey))
  );
};

const stripLeaveForRequest = (line: TimesheetLine, requestId: string): TimesheetLine => {
  const projectAllocations = normalizeProjectAllocations(line.projectAllocations || [])
    .filter((item) => !allocationIsLeaveForRequest(item, requestId));
  const hadLeave = (line.projectAllocations || []).length !== projectAllocations.length;
  if (!hadLeave) return line;
  const productiveHours = projectAllocations.reduce((sum, item) => sum + Number(item.hours || 0), 0);
  const hasClock = Boolean(compact(line.clockIn));
  const totalHours = hasClock ? line.totalHours : productiveHours;
  return {
    ...line,
    projectAllocations,
    usedHours: productiveHours,
    totalHours,
    remarks: compact(line.remarks).includes(APPROVED_PAID_LEAVE_REMARK) ? null : line.remarks,
    validationStatus: totalHours > 0 ? 'Valid' : 'Incomplete',
    validationMessage: totalHours > 0 ? line.validationMessage : 'Awaiting time allocation.',
  };
};

const applyLeaveToLine = (line: TimesheetLine, input: LeaveTimesheetSyncInput): TimesheetLine | null => {
  if (compact(line.clockIn)) return null;
  const existingHours = Number(line.totalHours || 0);
  if (existingHours > 0 && !isTimesheetPaidLeaveLine(line)) return null;

  const leaveAllocations = buildLeaveIdleTimeAllocation(input.requestId);
  return {
    ...line,
    projectAllocations: leaveAllocations,
    idleAllocations: line.idleAllocations || [],
    usedHours: STANDARD_TIMESHEET_HOURS,
    totalHours: STANDARD_TIMESHEET_HOURS,
    attendanceDuration: 0,
    remarks: `${APPROVED_PAID_LEAVE_REMARK}: ${input.startDate} to ${input.endDate} (${input.leaveType || 'Leave'})`,
    validationStatus: 'Valid',
    validationMessage: 'Approved paid leave. Biometric attendance is not required for this payable leave day.',
  };
};

const ensureHeader = (
  headers: TimesheetHeader[],
  date: string,
  supervisorId: string,
  workCenterName: string,
): TimesheetHeader => {
  const shift = resolveTimesheetShift(null);
  const shiftSlug = timesheetShiftHeaderSlug(shift.label);
  const workCenterId = workCenterName.toLowerCase().replace(/\s+/g, '-');
  const supervisorSlug = supervisorId.toLowerCase().replace(/\s+/g, '-');
  const headerId = `hdr-${date}-${supervisorSlug}-${workCenterId}-${shiftSlug}`;
  const existing = headers.find((header) =>
    header.timesheetDate === date
    && (supervisorMatches(header.supervisorId, supervisorId) || supervisorMatches(header.supervisorName, supervisorId))
    && header.workCenterName === workCenterName
    && String(header.shiftLabel || '').toLowerCase().includes('day'),
  ) || headers.find((header) => header.id === headerId);
  if (existing) return existing;

  const period = calculateTimesheetPeriod(date);
  const created: TimesheetHeader = {
    id: headerId,
    periodId: period.id,
    timesheetDate: date,
    supervisorId,
    supervisorName: supervisorId,
    workCenterId,
    workCenterName,
    status: 'Draft',
    submittedAt: null,
    submittedBy: null,
    approvedAt: null,
    approvedBy: null,
    lastSyncAt: new Date().toISOString(),
    shiftLabel: shift.label,
  };
  headers.push(created);
  return created;
};

export async function syncCCodeLeaveToTimesheet(input: LeaveTimesheetSyncInput) {
  const employee = await resolveEmployeeRecord(input.employeeId, input.employeeCode);
  const employeeCode = compact(employee?.employeeCode || input.employeeCode || input.employeeId).toUpperCase();
  if (!isDayRateTimesheetEmployeeCode(employeeCode)) {
    return { daysUpdated: 0, skipped: true, reason: 'Not a C-code employee.' };
  }
  if (!employee) {
    return { daysUpdated: 0, skipped: true, reason: 'Employee record not found.' };
  }

  const dates = workingDatesInLeaveRange(input.startDate, input.endDate);
  if (!dates.length) return { daysUpdated: 0, skipped: true, reason: 'No working days in leave range.' };

  const supervisorId = await resolveSupervisorId(employee);
  if (!supervisorId) {
    return { daysUpdated: 0, skipped: true, reason: 'Supervisor could not be resolved for timesheet booking.' };
  }

  const { headers, lines } = await readTimesheetData({ softFail: true });
  const keys = employeeKeys(employeeCode, employee.employeeId, employee.fullName);
  const workCenterName = resolveWorkCenterName(employee, headers, lines, employeeCode, supervisorId);
  let daysUpdated = 0;
  const headersToWrite = new Map<string, { header: TimesheetHeader; lines: TimesheetLine[] }>();

  for (const date of dates) {
    const existingMatches = lines.filter((line) => {
      const header = headers.find((item) => item.id === line.headerId);
      return header?.timesheetDate === date && lineMatchesEmployee(line, keys);
    });

    if (input.mode === 'remove') {
      for (const line of existingMatches) {
        const header = headers.find((item) => item.id === line.headerId);
        if (!header || !isEditableTimesheetStatus(header.status)) continue;
        const nextLine = stripLeaveForRequest(line, input.requestId);
        if (nextLine === line) continue;
        const index = lines.findIndex((item) => item.id === line.id);
        if (index >= 0) lines[index] = nextLine;
        const bucket = headersToWrite.get(header.id) || { header, lines: lines.filter((item) => item.headerId === header.id) };
        headersToWrite.set(header.id, bucket);
        daysUpdated += 1;
      }
      continue;
    }

    const editableMatch = existingMatches.find((line) => {
      const header = headers.find((item) => item.id === line.headerId);
      return header && isEditableTimesheetStatus(header.status);
    });
    if (editableMatch) {
      const header = headers.find((item) => item.id === editableMatch.headerId)!;
      const nextLine = applyLeaveToLine(editableMatch, input);
      if (!nextLine) continue;
      const index = lines.findIndex((item) => item.id === editableMatch.id);
      if (index >= 0) lines[index] = nextLine;
      const bucket = headersToWrite.get(header.id) || { header, lines: lines.filter((item) => item.headerId === header.id) };
      headersToWrite.set(header.id, bucket);
      daysUpdated += 1;
      continue;
    }

    const header = ensureHeader(headers, date, supervisorId, workCenterName);
    if (!isEditableTimesheetStatus(header.status)) continue;

    const lineId = `line-${header.id}-${employeeCode}`;
    const placeholder: TimesheetLine = {
      id: lineId,
      headerId: header.id,
      employeeId: employeeCode,
      employeeNo: employeeCode,
      employeeName: compact(input.employeeName) || employee.fullName || employeeCode,
      biometricId: `leave-${input.requestId}-${date}`,
      attendanceId: null,
      clockIn: null,
      clockOut: null,
      attendanceDuration: 0,
      projectAllocations: [],
      idleAllocations: [],
      usedHours: 0,
      idleHours: 0,
      totalHours: 0,
      variance: 0,
      remarks: null,
      validationStatus: 'Incomplete',
      validationMessage: 'Awaiting time allocation.',
      attendanceMode: 'Manual',
      offshoreAllowanceHours: 0,
    };
    const nextLine = applyLeaveToLine(placeholder, input);
    if (!nextLine) continue;
    lines.push(nextLine);
    const bucket = headersToWrite.get(header.id) || { header, lines: lines.filter((item) => item.headerId === header.id) };
    headersToWrite.set(header.id, bucket);
    daysUpdated += 1;
  }

  for (const { header, lines: headerLines } of headersToWrite.values()) {
    await writeTimesheetHeaderLines(header, headerLines);
  }

  return { daysUpdated, skipped: false as const };
}
