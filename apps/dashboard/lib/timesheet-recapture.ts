import {
  listPayrollRunsForPeriod,
  type UnifiedPayrollRun,
  type UnifiedPayrollRunStatus,
} from '@/lib/payroll-run-store';
import {
  canonicalTimesheetEmployeeKey,
  isPayrollPayableWorkDay,
  isTimesheetEditableStatus,
  isTimesheetPayrollReadyStatus,
  normalizeTimesheetStatus,
  readTimesheetData,
  readTimesheetPeriod,
  writeTimesheetHeaderLines,
  type TimesheetLine,
  type TimesheetStatus,
} from '@/lib/timesheet-entry-store';
import { isTimesheetPaidLeaveLine } from '@/lib/timesheet-entry-shared';
import {
  TIMESHEET_RECAPTURE_GUIDE,
  type MissingTimesheetDay,
} from '@/lib/timesheet-recapture-shared';

export { TIMESHEET_RECAPTURE_GUIDE, type MissingTimesheetDay } from '@/lib/timesheet-recapture-shared';

/** Payroll run statuses that freeze timesheet capture/recapture for that period. */
export const PAYROLL_STATUSES_BLOCKING_TIMESHEET_RECAPTURE: UnifiedPayrollRunStatus[] = [
  'Submitted',
  'Under Review',
  'HR Approved',
  'Finance Approved',
  'CFO Approved',
  'Approved',
  'Released',
  'Locked',
  'Posted',
  'Published',
  'Closed',
];

export type TimesheetRecaptureGate = {
  allowed: boolean;
  periodCode: string;
  blockingRun: UnifiedPayrollRun | null;
  message: string;
};

const compact = (value: unknown) => String(value || '').trim();
const periodCodeFromId = (periodId: string) => compact(periodId).replace(/^per-/i, '');

const weekdayLabel = (date: string) => {
  const day = new Date(`${date}T12:00:00`).getDay();
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day] || 'Unknown';
};

const eachDateInclusive = (from: string, to: string) => {
  const dates: string[] = [];
  const cursor = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(end.getTime()) || cursor > end) return dates;
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
};

export const isPayrollStatusBlockingTimesheetRecapture = (status: UnifiedPayrollRunStatus | string) =>
  PAYROLL_STATUSES_BLOCKING_TIMESHEET_RECAPTURE.includes(status as UnifiedPayrollRunStatus);

export async function getTimesheetRecaptureGate(periodIdOrCode: string): Promise<TimesheetRecaptureGate> {
  const periodCode = periodCodeFromId(periodIdOrCode);
  if (!periodCode) {
    return { allowed: false, periodCode: '', blockingRun: null, message: 'Timesheet period is required for recapture.' };
  }
  const runs = await listPayrollRunsForPeriod(periodCode);
  const blockingRun = runs.find((run) => isPayrollStatusBlockingTimesheetRecapture(run.status)) || null;
  if (blockingRun) {
    return {
      allowed: false,
      periodCode,
      blockingRun,
      message: `Payroll run ${blockingRun.id} is ${blockingRun.status}. Timesheet recapture is blocked after payroll is submitted for approval. Request payroll revision first if this period must change.`,
    };
  }
  return {
    allowed: true,
    periodCode,
    blockingRun: null,
    message: 'Recapture is allowed — no payroll run for this period has been submitted for approval.',
  };
}

export async function assertTimesheetRecaptureAllowed(periodIdOrCode: string) {
  const gate = await getTimesheetRecaptureGate(periodIdOrCode);
  if (!gate.allowed) throw new Error(gate.message);
  return gate;
}

const lineLooksIncomplete = (line: TimesheetLine, timesheetDate: string) => {
  if (isTimesheetPaidLeaveLine(line)) return false;
  if (isPayrollPayableWorkDay(line, timesheetDate)) return false;
  return true;
};

export async function findMissingTimesheetDays(input: {
  from: string;
  to: string;
  employeeKeys?: string[];
  maxGaps?: number;
}): Promise<{ gaps: MissingTimesheetDay[]; gateByPeriod: Record<string, TimesheetRecaptureGate> }> {
  const { headers, lines } = await readTimesheetData();
  const dates = eachDateInclusive(input.from, input.to).filter((date) => {
    const day = new Date(`${date}T12:00:00`).getDay();
    return day !== 0; // Sunday never expected as payable day
  });
  const headerById = new Map(headers.map((header) => [header.id, header]));
  const linesInRange = lines.filter((line) => {
    const header = headerById.get(line.headerId);
    if (!header) return false;
    return header.timesheetDate >= input.from && header.timesheetDate <= input.to;
  });

  const employeeFilter = new Set((input.employeeKeys || []).map((key) => key.toLowerCase()).filter(Boolean));
  const employees = new Map<string, { employeeId: string; employeeNo: string; employeeName: string; department: string }>();
  for (const line of linesInRange) {
    const key = canonicalTimesheetEmployeeKey(line);
    if (employeeFilter.size && !employeeFilter.has(key.toLowerCase()) && !employeeFilter.has(compact(line.employeeNo).toLowerCase())) continue;
    if (!employees.has(key)) {
      employees.set(key, {
        employeeId: compact(line.employeeId),
        employeeNo: compact(line.employeeNo),
        employeeName: compact(line.employeeName),
        department: 'Unassigned',
      });
    }
  }

  const payableByEmployeeDate = new Map<string, boolean>();
  const lineByEmployeeDate = new Map<string, TimesheetLine>();
  for (const line of linesInRange) {
    const header = headerById.get(line.headerId);
    if (!header) continue;
    const key = canonicalTimesheetEmployeeKey(line);
    const stamp = `${key}::${header.timesheetDate}`;
    const payable = isPayrollPayableWorkDay(line, header.timesheetDate);
    payableByEmployeeDate.set(stamp, Boolean(payableByEmployeeDate.get(stamp) || payable));
    if (!lineByEmployeeDate.has(stamp)) lineByEmployeeDate.set(stamp, line);
  }

  const periodIds = new Set<string>();
  for (const header of headers) {
    if (header.timesheetDate >= input.from && header.timesheetDate <= input.to) periodIds.add(header.periodId);
  }
  const gateByPeriod: Record<string, TimesheetRecaptureGate> = {};
  for (const periodId of periodIds) {
    gateByPeriod[periodId] = await getTimesheetRecaptureGate(periodId);
  }
  // Also gate by calendar month if no headers yet for a date
  for (const date of dates) {
    const period = await readTimesheetPeriod(new Date(`${date}T12:00:00`));
    if (!gateByPeriod[period.id]) gateByPeriod[period.id] = await getTimesheetRecaptureGate(period.id);
  }

  const gaps: MissingTimesheetDay[] = [];
  for (const [employeeKey, employee] of employees) {
    for (const date of dates) {
      const stamp = `${employeeKey}::${date}`;
      if (payableByEmployeeDate.get(stamp)) continue;

      const line = lineByEmployeeDate.get(stamp);
      const header = line ? headerById.get(line.headerId) || null : null;
      const period = header
        ? { id: header.periodId }
        : await readTimesheetPeriod(new Date(`${date}T12:00:00`));
      const gate = gateByPeriod[period.id] || (await getTimesheetRecaptureGate(period.id));
      gateByPeriod[period.id] = gate;

      let reason: MissingTimesheetDay['reason'] = 'no-entry';
      let suggestedAction: MissingTimesheetDay['suggestedAction'] = 'open-draft';
      if (header && line) {
        const status = normalizeTimesheetStatus(header.status);
        if (isTimesheetEditableStatus(status) && lineLooksIncomplete(line, header.timesheetDate)) {
          reason = 'editable-incomplete';
          suggestedAction = 'continue-edit';
        } else if (!isTimesheetEditableStatus(status)) {
          reason = 'needs-reopen';
          suggestedAction = 'reopen';
        } else {
          reason = 'editable-incomplete';
          suggestedAction = 'continue-edit';
        }
      }

      let recaptureAllowed = gate.allowed;
      let blockReason = gate.allowed ? null : gate.message;
      if (header && normalizeTimesheetStatus(header.status) === 'Locked') {
        recaptureAllowed = false;
        blockReason = 'This timesheet is Locked for payroll and cannot be recaptured.';
        suggestedAction = 'blocked';
      } else if (!gate.allowed) {
        suggestedAction = 'blocked';
      }

      gaps.push({
        id: `${employeeKey}-${date}`,
        employeeKey,
        employeeId: employee.employeeId,
        employeeNo: employee.employeeNo,
        employeeName: employee.employeeName,
        department: employee.department,
        date,
        weekday: weekdayLabel(date),
        reason,
        headerId: header?.id || null,
        headerStatus: header ? normalizeTimesheetStatus(header.status) : null,
        supervisorId: header?.supervisorId || null,
        supervisorName: header?.supervisorName || null,
        workCenterName: header?.workCenterName || null,
        recaptureAllowed,
        blockReason,
        suggestedAction,
      });
    }
  }

  gaps.sort((a, b) => a.date.localeCompare(b.date) || a.employeeName.localeCompare(b.employeeName));
  return { gaps: gaps.slice(0, input.maxGaps || 500), gateByPeriod };
}

export async function reopenTimesheetForRecapture(input: {
  headerId: string;
  actor: string;
  reason: string;
  allowPayrollReadyUnlock?: boolean;
}) {
  const reason = compact(input.reason);
  if (reason.length < 8) throw new Error('Provide a short reason for recapture (at least 8 characters).');

  const { headers, lines } = await readTimesheetData();
  const header = headers.find((item) => item.id === input.headerId);
  if (!header) throw new Error('Timesheet header not found.');

  const period = await readTimesheetPeriod(new Date(`${header.timesheetDate}T12:00:00`));
  if (period.status !== 'Open') {
    throw new Error(`Timesheet period ${period.name} is ${period.status}. Reopen the period before recapture.`);
  }

  await assertTimesheetRecaptureAllowed(header.periodId);

  const status = normalizeTimesheetStatus(header.status);
  if (isTimesheetEditableStatus(status)) {
    return {
      header,
      alreadyEditable: true as const,
      message: `Timesheet is already ${status} and can be edited in Timesheet Entry.`,
    };
  }
  if (status === 'Locked') {
    throw new Error('Locked timesheets cannot be recaptured. Unlock payroll/period through the payroll revision process first.');
  }

  if (isTimesheetPayrollReadyStatus(status)) {
    if (!input.allowPayrollReadyUnlock) {
      throw new Error('This timesheet is payroll-ready (HR acknowledged). Only HR/Payroll can unlock it for recapture before payroll submit.');
    }
  } else {
    const reopenable = [
      'Submitted',
      'Supervisor_Reviewed',
      'Project_Manager_Reviewed',
      'Cost_Control_Reviewed',
      'GM_Operations_Reviewed',
      'HR_Acknowledged',
    ];
    if (!reopenable.includes(status)) {
      throw new Error(`Timesheet status ${status.replace(/_/g, ' ')} cannot be reopened for recapture.`);
    }
  }

  const now = new Date().toISOString();
  const previousStatus = status;
  header.status = 'Returned';
  header.currentApprovalStage = 'Supervisor';
  header.currentApprover = header.supervisorName || 'Supervisor';
  header.approvedAt = null;
  header.approvedBy = null;
  header.payrollAcknowledgedAt = null;
  header.payrollAcknowledgedBy = null;
  header.workflowHistory = [
    ...(header.workflowHistory || []),
    {
      stage: 'HR',
      decision: 'Returned',
      by: input.actor,
      actedAt: now,
      comment: `Recapture reopen from ${previousStatus.replace(/_/g, ' ')}: ${reason}`,
    },
  ];

  await writeTimesheetHeaderLines(header, lines.filter((line) => line.headerId === header.id));

  return {
    header,
    alreadyEditable: false as const,
    message: `Timesheet returned for recapture. Open Timesheet Entry to complete missing days, then submit again.`,
  };
}
