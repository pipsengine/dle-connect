/**
 * Move booked October-period timesheets (16 Sep–15 Oct) onto September 2026
 * dates (16 Aug–15 Sep), then resubmit through Review & Submit.
 *
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/rebook-october-timesheets-into-september.mts
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/rebook-october-timesheets-into-september.mts --apply
 */
import { getDleEnterpriseDbPool, loadWorkspaceEnv } from '../apps/dashboard/lib/dle-enterprise-db';
import { timesheetLocationsMatch } from '../apps/dashboard/lib/timesheet-agege-blasting';
import { employeeAlreadyCommittedOnOtherTimesheet } from '../apps/dashboard/lib/timesheet-booking-clash';
import {
  buildTimesheetHeaderId,
  timesheetHeaderMatchesShift,
  timesheetLineHasBookedHours,
  timesheetWorkCentersMatch,
} from '../apps/dashboard/lib/timesheet-entry-shared';
import {
  calculateTimesheetPeriod,
  deleteTimesheetHeader,
  isTimesheetPayrollReadyStatus,
  mapTimesheetDateIntoPeriod,
  readTimesheetHeadersForWorkDates,
  writeTimesheetHeaderLines,
  type TimesheetHeader,
  type TimesheetLine,
} from '../apps/dashboard/lib/timesheet-entry-store';
import { submitTimesheetForApproval } from '../apps/dashboard/lib/timesheet-submit';

loadWorkspaceEnv();

const apply = process.argv.includes('--apply');
const actor = 'HR (rebook October sheets into September)';

const pad = (value: number) => String(value).padStart(2, '0');
const iso = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const dateRange = (from: string, to: string) => {
  const dates: string[] = [];
  for (let cursor = new Date(`${from}T00:00:00`); cursor <= new Date(`${to}T00:00:00`); cursor.setDate(cursor.getDate() + 1)) {
    dates.push(iso(new Date(cursor)));
  }
  return dates;
};

const bookedHours = (lines: TimesheetLine[]) =>
  Math.round(lines.reduce((sum, line) => sum + Number(line.usedHours || 0), 0) * 10) / 10;

const cloneLine = (line: TimesheetLine, headerId: string): TimesheetLine => {
  const employeeCode = String(line.employeeNo || line.employeeId || 'emp').trim() || 'emp';
  const lineId = `line-${headerId}-${employeeCode}`.slice(0, 220);
  return {
    ...line,
    id: lineId,
    headerId,
    projectAllocations: (line.projectAllocations || []).map((allocation, index) => ({
      ...allocation,
      projectId: `${lineId}-p${index}`,
    })),
    idleAllocations: (line.idleAllocations || []).map((allocation) => ({ ...allocation })),
  };
};

const sameIdentity = (left: TimesheetHeader, right: TimesheetHeader) =>
  timesheetWorkCentersMatch(left.workCenterName, right.workCenterName)
  && timesheetHeaderMatchesShift(left.shiftLabel, right.shiftLabel)
  && timesheetLocationsMatch(left.locationName, right.locationName)
  && String(left.supervisorId || '').trim().toLowerCase() === String(right.supervisorId || '').trim().toLowerCase();

const candidateDates = (preferred: string, period: { startDate: string; endDate: string }) => {
  const all = dateRange(period.startDate, period.endDate);
  return [preferred, ...all.filter((date) => date !== preferred).reverse()];
};

try {
  const september = calculateTimesheetPeriod('2026-09-15');
  const october = calculateTimesheetPeriod('2026-09-16');
  const octoberDates = dateRange(october.startDate, october.endDate);
  const septemberDates = dateRange(september.startDate, september.endDate);
  let { headers, lines } = await readTimesheetHeadersForWorkDates([...octoberDates, ...septemberDates]);

  const sources = headers
    .filter((header) => calculateTimesheetPeriod(header.timesheetDate).id === october.id)
    .filter((header) => !isTimesheetPayrollReadyStatus(header.status))
    .map((header) => ({
      header,
      lines: lines.filter((line) => line.headerId === header.id && timesheetLineHasBookedHours(line)),
    }))
    .filter((item) => item.lines.length > 0)
    .sort((left, right) => left.header.timesheetDate.localeCompare(right.header.timesheetDate)
      || left.header.supervisorName.localeCompare(right.header.supervisorName)
      || left.header.workCenterName.localeCompare(right.header.workCenterName));

  const moved: Array<Record<string, unknown>> = [];
  const skipped: Array<Record<string, unknown>> = [];
  const submitIds = new Set<string>();
  const reservedDates = new Set<string>();

  const identityKey = (header: TimesheetHeader, date = header.timesheetDate) =>
    [
      date,
      String(header.supervisorId || '').trim().toLowerCase(),
      String(header.workCenterName || '').trim().toLowerCase(),
      String(header.shiftLabel || '').trim().toLowerCase(),
      String(header.locationName || '').trim().toLowerCase(),
    ].join('|');

  for (const header of headers) {
    if (calculateTimesheetPeriod(header.timesheetDate).id === september.id) {
      reservedDates.add(identityKey(header));
    }
  }

  const refresh = async () => {
    const next = await readTimesheetHeadersForWorkDates([...octoberDates, ...septemberDates]);
    headers = next.headers;
    lines = next.lines;
  };

  for (const source of sources) {
    const preferred = mapTimesheetDateIntoPeriod(source.header.timesheetDate, september);
    let targetDate: string | null = null;
    let remaining = source.lines;

    for (const date of candidateDates(preferred, september)) {
      if (reservedDates.has(identityKey(source.header, date))) continue;
      const probe: TimesheetHeader = { ...source.header, timesheetDate: date, id: `probe-${source.header.id}-${date}` };
      const dayHeaders = headers.filter((header) => header.timesheetDate === date && header.id !== source.header.id);
      const identity = dayHeaders.find((header) => sameIdentity(header, source.header));
      if (identity) continue;
      const free = remaining.filter((line) => !employeeAlreadyCommittedOnOtherTimesheet(line, probe, dayHeaders, lines));
      if (free.length !== remaining.length) continue;
      targetDate = date;
      remaining = free;
      break;
    }

    if (!targetDate || !remaining.length) {
      skipped.push({
        id: source.header.id,
        from: source.header.timesheetDate,
        supervisor: source.header.supervisorName,
        workCenter: source.header.workCenterName,
        hours: bookedHours(source.lines),
        reason: 'No free September date is left for this supervisor and work center without collapsing two work days onto one date.',
      });
      continue;
    }

    const destId = buildTimesheetHeaderId({
      date: targetDate,
      supervisorId: source.header.supervisorId,
      workCenterName: source.header.workCenterName,
      shiftLabel: source.header.shiftLabel,
      locationName: source.header.locationName,
    });
    const destHeader: TimesheetHeader = {
      ...source.header,
      id: destId,
      periodId: september.id,
      timesheetDate: targetDate,
      status: 'Draft',
      submittedAt: null,
      submittedBy: null,
      approvedAt: null,
      approvedBy: null,
      currentApprovalStage: null,
      currentApprover: null,
      payrollAcknowledgedAt: null,
      payrollAcknowledgedBy: null,
      workflowHistory: [
        {
          stage: 'Supervisor',
          decision: 'Returned',
          by: actor,
          actedAt: new Date().toISOString(),
          comment: `Rebooked from ${source.header.timesheetDate} (${source.header.id}) into ${september.name}.`,
        },
      ],
    };
    const destLines = remaining.map((line) => cloneLine(line, destHeader.id));
    reservedDates.add(identityKey(source.header, targetDate));

    moved.push({
      fromId: source.header.id,
      fromDate: source.header.timesheetDate,
      toId: destHeader.id,
      toDate: targetDate,
      supervisor: source.header.supervisorName,
      workCenter: source.header.workCenterName,
      hours: bookedHours(remaining),
      crew: remaining.length,
    });
    submitIds.add(destHeader.id);
    headers = [...headers.filter((header) => header.id !== source.header.id), destHeader];
    lines = [...lines.filter((line) => line.headerId !== source.header.id), ...destLines];

    if (!apply) continue;

    await writeTimesheetHeaderLines(destHeader, destLines);
    await deleteTimesheetHeader(source.header.id);
    await refresh();
  }

  const submitted: Array<Record<string, unknown>> = [];
  const submitFailed: Array<Record<string, unknown>> = [];
  if (apply) {
    await refresh();
    for (const headerId of submitIds) {
      const header = headers.find((item) => item.id === headerId);
      if (!header) continue;
      const headerLines = lines.filter((line) => line.headerId === header.id);
      if (bookedHours(headerLines) <= 0.001) continue;
      try {
        const result = await submitTimesheetForApproval({
          header: { ...header, workflowHistory: [...(header.workflowHistory || [])] },
          lines: headerLines.map((line) => ({
            ...line,
            projectAllocations: (line.projectAllocations || []).map((allocation) => ({ ...allocation })),
            idleAllocations: (line.idleAllocations || []).map((allocation) => ({ ...allocation })),
          })),
          otherHeaders: headers,
          otherLines: lines,
          actor,
          persist: true,
          notify: false,
          repairBiometricHours: true,
          reviewerNote: 'Rebooked into the current September 2026 Period for supervisor review.',
        });
        submitted.push({
          id: result.header.id,
          date: result.header.timesheetDate,
          status: result.header.status,
          workCenter: result.header.workCenterName,
          supervisor: result.header.supervisorName,
        });
        await refresh();
      } catch (error) {
        submitFailed.push({
          id: header.id,
          date: header.timesheetDate,
          workCenter: header.workCenterName,
          supervisor: header.supervisorName,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  const remainingOctober = (await readTimesheetHeadersForWorkDates(octoberDates)).headers
    .filter((header) => calculateTimesheetPeriod(header.timesheetDate).id === october.id)
    .filter((header) => !isTimesheetPayrollReadyStatus(header.status));

  console.log(JSON.stringify({
    apply,
    currentPeriod: calculateTimesheetPeriod(new Date()),
    september,
    sourceCount: sources.length,
    moved,
    skipped,
    submitted,
    submitFailed,
    remainingOctoberBooked: remainingOctober.length,
  }, null, 2));
} finally {
  const pool = await getDleEnterpriseDbPool();
  if (pool) await pool.close();
}
