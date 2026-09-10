import { getPayrollPublicHolidayDates } from '@/lib/nigeria-public-holidays';
import { listApprovedOvertimeForSupervisor, type OvertimeAuthorizationRequest } from '@/lib/overtime-approval-workflow-store';
import { assertTimesheetRecaptureAllowed } from '@/lib/timesheet-recapture';
import { ensureClockedLinesHaveProjectAllocation } from '@/lib/timesheet-line-defaults';
import {
  applyNightPaperClock,
  isDayRateTimesheetEmployeeCode,
  isManualOffshoreLine,
  isTimesheetInApprovalCapture,
  maxProductiveHoursFromBiometric,
  reconcileTimesheetLineHours,
  resolveLineAttendanceDuration,
  resolveTimesheetShift,
  sumProjectAllocationHours,
  timesheetHeaderShiftKind,
  timesheetLineHasBookedHours,
  validateTimesheetLinesForPersist,
  type TimesheetDayContext,
  type TimesheetLine,
} from '@/lib/timesheet-entry-shared';
import {
  isTimesheetEditableStatus,
  isTimesheetPayrollReadyStatus,
  normalizeTimesheetStatus,
  readProjects,
  readTimesheetDraftBookedHeaders,
  readTimesheetHeadersForWorkDates,
  readTimesheetPeriod,
  withDefaultIdleReason,
  writeTimesheetHeaderLines,
  type Project,
  type TimesheetHeader,
} from '@/lib/timesheet-entry-store';
import { validateTimesheetLine, type OvertimeAuthorization } from '@/lib/timesheet-overtime-booking';
import {
  resolveOvertimeAuthorizationsForBooking,
  resolveOvertimeBookingOptions,
} from '@/lib/timesheet-overtime-config';
import { canonicalProjectManagerForCode, withCanonicalProjectManager } from '@/lib/timesheet-canonical-project-managers';

const dayContextFor = (date: string, holidayDates: string[], shiftLabel?: string | null): TimesheetDayContext => ({
  date,
  holidayDates,
  shiftLabel: shiftLabel || undefined,
});

const matchKey = (value: unknown) => {
  const raw = String(value ?? '').trim().toUpperCase();
  if (!raw) return '';
  const compact = raw.replace(/[^A-Z0-9]/g, '');
  return compact.replace(/^0+/, '') || compact;
};

const matchKeys = (...values: unknown[]) => {
  const keys = new Set<string>();
  for (const value of values) {
    const base = matchKey(value);
    if (!base) continue;
    keys.add(base);
    const withoutTypePrefix = base.replace(/^[PCLNI]+(?=\d)/, '').replace(/^0+/, '');
    if (withoutTypePrefix) keys.add(withoutTypePrefix);
    const numeric = base.replace(/^[A-Z]+/, '').replace(/^0+/, '');
    if (numeric) keys.add(numeric);
  }
  return [...keys];
};

const round1 = (value: number) => Math.round(value * 10) / 10;

const lineBookedHours = (line: TimesheetLine) =>
  round1(Number(line.usedHours || 0) + (line.projectAllocations || []).reduce((sum, allocation) => sum + Number(allocation.hours || 0), 0));

const clearLineBooking = (line: TimesheetLine): TimesheetLine =>
  reconcileTimesheetLineHours({
    ...line,
    projectAllocations: [],
  });

const alignLineToBiometricCap = (line: TimesheetLine, shiftLabel?: string | null): TimesheetLine => {
  if (isDayRateTimesheetEmployeeCode(line.employeeNo || line.employeeId)) return line;
  if (!line.clockIn) return line;
  const attendance = resolveLineAttendanceDuration(line);
  if (attendance <= 0.001) return line;
  const maxProductive = maxProductiveHoursFromBiometric(attendance, shiftLabel);
  const used = sumProjectAllocationHours(line.projectAllocations || []);
  let next = line;
  if (used > maxProductive + 0.001 && used > 0.001) {
    const factor = maxProductive / used;
    next = {
      ...next,
      projectAllocations: (next.projectAllocations || []).map((allocation) => ({
        ...allocation,
        hours: round1(allocation.hours * factor),
      })),
    };
  }
  next = reconcileTimesheetLineHours(next);
  if (next.totalHours > attendance + 0.001) {
    const idleTarget = round1(Math.max(0, attendance - next.usedHours));
    const idleUsed = (next.idleAllocations || []).reduce((sum, allocation) => sum + Number(allocation.hours || 0), 0);
    if (idleUsed > 0.001 && idleTarget < idleUsed - 0.001) {
      const idleFactor = idleTarget / idleUsed;
      next = {
        ...next,
        idleAllocations: (next.idleAllocations || []).map((allocation) => ({
          ...allocation,
          hours: round1(allocation.hours * idleFactor),
        })),
      };
    }
    next = reconcileTimesheetLineHours(next);
  }
  return next;
};

const headerHours = (headerId: string, lines: TimesheetLine[]) =>
  lines.filter((line) => line.headerId === headerId).reduce((sum, line) => sum + lineBookedHours(line), 0);

const preferClashWinner = (
  left: { header: TimesheetHeader; line: TimesheetLine },
  right: { header: TimesheetHeader; line: TimesheetLine },
  lines: TimesheetLine[],
) => {
  const leftSubmitted = normalizeTimesheetStatus(left.header.status) !== 'Draft';
  const rightSubmitted = normalizeTimesheetStatus(right.header.status) !== 'Draft';
  if (leftSubmitted !== rightSubmitted) return leftSubmitted ? left : right;
  const leftHours = lineBookedHours(left.line);
  const rightHours = lineBookedHours(right.line);
  if (leftHours !== rightHours) return leftHours > rightHours ? left : right;
  const leftHeaderHours = headerHours(left.header.id, lines);
  const rightHeaderHours = headerHours(right.header.id, lines);
  if (leftHeaderHours !== rightHeaderHours) return leftHeaderHours > rightHeaderHours ? left : right;
  return left.header.workCenterName.localeCompare(right.header.workCenterName) <= 0 ? left : right;
};

const overlappingEmployee = (left: TimesheetLine, right: TimesheetLine) => {
  const keys = matchKeys(left.employeeNo, left.employeeId, left.employeeName);
  return matchKeys(right.employeeNo, right.employeeId, right.employeeName).some((key) => keys.includes(key));
};

const resolveSameDayDraftClashes = (headers: TimesheetHeader[], lines: TimesheetLine[]) => {
  const stripped: Array<{ headerId: string; employeeName: string; keptOn: string }> = [];
  const linesByHeader = new Map<string, TimesheetLine[]>();
  for (const line of lines) {
    const bucket = linesByHeader.get(line.headerId) || [];
    bucket.push(line);
    linesByHeader.set(line.headerId, bucket);
  }

  const byDateShift = new Map<string, TimesheetHeader[]>();
  for (const header of headers) {
    const key = `${header.timesheetDate}|${timesheetHeaderShiftKind(header.shiftLabel)}`;
    const bucket = byDateShift.get(key) || [];
    bucket.push(header);
    byDateShift.set(key, bucket);
  }

  for (const group of byDateShift.values()) {
    const booked = group.flatMap((header) =>
      (linesByHeader.get(header.id) || [])
        .filter((line) => lineBookedHours(line) > 0.001)
        .map((line) => ({ header, line })),
    );
    for (let i = 0; i < booked.length; i += 1) {
      for (let j = i + 1; j < booked.length; j += 1) {
        const left = booked[i];
        const right = booked[j];
        if (left.header.id === right.header.id) continue;
        if (lineBookedHours(left.line) <= 0.001 || lineBookedHours(right.line) <= 0.001) continue;
        if (!overlappingEmployee(left.line, right.line)) continue;
        const winner = preferClashWinner(left, right, lines);
        const loser = winner.header.id === left.header.id ? right : left;
        if (normalizeTimesheetStatus(loser.header.status) !== 'Draft') continue;
        const next = clearLineBooking(loser.line);
        Object.assign(loser.line, next);
        stripped.push({
          headerId: loser.header.id,
          employeeName: loser.line.employeeName,
          keptOn: `${winner.header.workCenterName} (${winner.header.supervisorName})`,
        });
      }
    }
  }

  return { lines, stripped };
};

const projectsFromTimesheetLines = (lines: TimesheetLine[]) =>
  Array.from(
    new Map(
      lines
        .flatMap((line) =>
          line.projectAllocations.map((alloc) => {
            const code = String(alloc.projectCode || '').trim().toUpperCase();
            if (!code) return null;
            return [code, { code, name: alloc.projectName || code }] as const;
          }),
        )
        .filter((entry): entry is readonly [string, { code: string; name: string }] => Boolean(entry)),
    ).values(),
  );

const loadOvertimeAuthorizationsForBooking = async (
  header: TimesheetHeader,
  headerLines: TimesheetLine[],
  activeProjects: Project[],
  overtimeBooking: ReturnType<typeof resolveOvertimeBookingOptions>,
) => {
  const crewSize = Math.max(headerLines.filter((line) => line.clockIn).length, 1);
  const catalog = activeProjects.map((project) => ({ code: project.code, name: project.name }));
  const lineProjects = projectsFromTimesheetLines(headerLines);
  let workflowAuthorizations: OvertimeAuthorization[] = [];
  if (overtimeBooking.enabled) {
    const approved = await listApprovedOvertimeForSupervisor(
      header.timesheetDate,
      header.supervisorId,
      header.workCenterName,
    ).catch(() => [] as OvertimeAuthorizationRequest[]);
    workflowAuthorizations = approved.map((item) => ({
      id: item.id,
      projectCode: item.projectCode,
      projectName: item.projectName,
      requestedHours: Number(item.requestedHours) || 0,
      requestedHeadcount: Math.max(1, Number(item.requestedHeadcount) || item.employees?.length || 1),
      workCenter: item.workCenter || undefined,
      reason: item.reason || 'Approved overtime authorization.',
    }));
  }
  return resolveOvertimeAuthorizationsForBooking(
    workflowAuthorizations,
    catalog,
    crewSize,
    overtimeBooking,
    lineProjects,
  );
};

export const resolveProjectManagerForSubmission = (lines: TimesheetLine[], projects: Project[]) => {
  const hoursByProject = new Map<string, number>();
  for (const line of lines) {
    for (const allocation of line.projectAllocations || []) {
      if (!allocation.projectCode || allocation.hours <= 0) continue;
      hoursByProject.set(allocation.projectCode, (hoursByProject.get(allocation.projectCode) || 0) + allocation.hours);
    }
  }
  const missingProjectManagers = [...hoursByProject.keys()].filter((projectCode) => {
    const project = projects.find((item) => item.code.toLowerCase() === projectCode.toLowerCase());
    const manager = canonicalProjectManagerForCode(projectCode) || project?.projectManager?.trim();
    return !manager;
  });
  if (missingProjectManagers.length) {
    throw new Error(`Project Manager is required before submission for: ${missingProjectManagers.join(', ')}.`);
  }
  const primaryProjectCode = [...hoursByProject.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!primaryProjectCode) return null;
  const project = withCanonicalProjectManager(
    projects.find((item) => item.code.toLowerCase() === primaryProjectCode.toLowerCase())
    || { code: primaryProjectCode, name: primaryProjectCode, projectManager: canonicalProjectManagerForCode(primaryProjectCode) },
  );
  if (!project) {
    throw new Error(`Project ${primaryProjectCode} is not available in the project catalog.`);
  }
  const projectManager = canonicalProjectManagerForCode(project.code) || String(project.projectManager || '').trim();
  if (!projectManager) {
    throw new Error(`Project Manager is required before submission for: ${primaryProjectCode}.`);
  }
  return {
    projectCode: project.code,
    projectName: project.name || primaryProjectCode,
    projectManager,
  };
};

const requireOpenPeriod = async (date: string) => {
  const period = await readTimesheetPeriod(date);
  if (period.status !== 'Open') {
    throw new Error(`Timesheet period ${period.name} is ${period.status}. Reopen the period before changing timesheets.`);
  }
  await assertTimesheetRecaptureAllowed(period.id);
  return period;
};

const requireEditableTimesheet = (header: TimesheetHeader) => {
  const status = normalizeTimesheetStatus(header.status);
  if (isTimesheetPayrollReadyStatus(header.status)) {
    throw new Error('This timesheet has been acknowledged by HR and is payroll-ready. Use Recapture Reopen (HR/Payroll) before payroll submit if days must be corrected.');
  }
  if (!isTimesheetEditableStatus(header.status)) {
    throw new Error(`This timesheet is currently ${status.replace(/_/g, ' ')} and cannot be edited. Use Recapture Reopen to return it for correction, then edit in Timesheet Entry.`);
  }
};

export type SubmitTimesheetResult = {
  header: TimesheetHeader;
  lines: TimesheetLine[];
  projectManager: string;
  projectCode: string;
  projectName: string;
};

export async function submitTimesheetForApproval(input: {
  header: TimesheetHeader;
  lines: TimesheetLine[];
  otherHeaders: TimesheetHeader[];
  otherLines: TimesheetLine[];
  actor: string;
  reviewerNote?: string | null;
  shiftLabel?: string | null;
  persist?: boolean;
  notify?: boolean;
  repairBiometricHours?: boolean;
  projects?: Project[];
  holidayDates?: string[];
}): Promise<SubmitTimesheetResult> {
  const header = input.header;
  const persist = input.persist !== false;
  await requireOpenPeriod(header.timesheetDate);
  requireEditableTimesheet(header);
  if (isTimesheetInApprovalCapture(header.status)) {
    header.workflowHistory = [
      ...(header.workflowHistory || []),
      {
        stage: 'Supervisor',
        decision: 'Returned',
        by: input.actor,
        actedAt: new Date().toISOString(),
        comment: 'Recalled to Draft so Review & Submit can restart supervisor approval.',
      },
    ];
    header.status = 'Draft';
    header.currentApprovalStage = null;
    header.currentApprover = null;
  }
  if (normalizeTimesheetStatus(header.status) !== 'Draft') {
    throw new Error(`This timesheet is currently ${normalizeTimesheetStatus(header.status).replace(/_/g, ' ')} and is not a draft.`);
  }

  const overtimeBooking = resolveOvertimeBookingOptions();
  const projects = (input.projects || await readProjects()).map(withCanonicalProjectManager);
  const holidayDates = input.holidayDates || await getPayrollPublicHolidayDates();
  if (input.shiftLabel) header.shiftLabel = String(input.shiftLabel);
  const dayContext = dayContextFor(header.timesheetDate, holidayDates, header.shiftLabel);
  const isNightHeader = resolveTimesheetShift(header.shiftLabel).kind === 'Night';

  const allocationSeed = ensureClockedLinesHaveProjectAllocation(input.lines, projects, dayContext);
  const linesForSave = input.repairBiometricHours
    ? allocationSeed.lines.map((line) => alignLineToBiometricCap(line, header.shiftLabel))
    : allocationSeed.lines;
  const approvedOvertimeAuthorizations = overtimeBooking.enabled
    ? await loadOvertimeAuthorizationsForBooking(
      header,
      linesForSave,
      projects.filter((project) => ['Active', 'Approved', 'Open'].includes(project.status)),
      overtimeBooking,
    )
    : [];
  const reconciledLines = linesForSave.map((line) => applyNightPaperClock(reconcileTimesheetLineHours(line), header.shiftLabel));
  for (const line of reconciledLines) {
    const projectHours = (line.projectAllocations || []).reduce((sum, allocation) => sum + Number(allocation.hours || 0), 0);
    if (!isNightHeader && !line.clockIn && !isManualOffshoreLine(line) && projectHours > 0.001) {
      throw new Error(`Absent employee ${line.employeeName} cannot receive project/productive hours.`);
    }
    const validated = validateTimesheetLine(
      line,
      approvedOvertimeAuthorizations as OvertimeAuthorization[],
      reconciledLines,
      header.workCenterName,
      overtimeBooking,
      dayContext,
    );
    if (validated.validationStatus === 'Error') {
      throw new Error(validated.validationMessage || `Invalid timesheet line for ${line.employeeName}.`);
    }
    if (Math.abs(line.usedHours + line.idleHours - line.totalHours) > 0.01) {
      throw new Error(`Hours mismatch for ${line.employeeName}: Used + Idle must equal Total.`);
    }
  }

  const otherDateLines = input.otherLines.filter((line) => {
    const otherHeader = input.otherHeaders.find((item) => item.id === line.headerId);
    return Boolean(otherHeader && otherHeader.timesheetDate === header.timesheetDate && otherHeader.id !== header.id);
  });
  const headerKind = timesheetHeaderShiftKind(header.shiftLabel);
  for (const line of reconciledLines) {
    const bookedHours = Number(line.usedHours || 0) + (line.projectAllocations || []).reduce((sum, allocation) => sum + Number(allocation.hours || 0), 0);
    if (bookedHours <= 0.001) continue;
    const keys = matchKeys(line.employeeNo, line.employeeId, line.employeeName);
    const clash = otherDateLines.find((other) => {
      if (Number(other.usedHours || 0) <= 0.001) return false;
      const otherHeader = input.otherHeaders.find((item) => item.id === other.headerId);
      if (timesheetHeaderShiftKind(otherHeader?.shiftLabel) !== headerKind) return false;
      return matchKeys(other.employeeNo, other.employeeId, other.employeeName).some((key) => keys.includes(key));
    });
    if (clash) {
      const otherHeader = input.otherHeaders.find((item) => item.id === clash.headerId);
      throw new Error(`${line.employeeName} is already booked on ${otherHeader?.workCenterName || 'another timesheet'} for this date.`);
    }
  }

  const normalizedLines = reconciledLines.map((line) => ({
    ...line,
    idleAllocations: line.idleAllocations.map(withDefaultIdleReason),
  }));

  const projectManagerAssignment = resolveProjectManagerForSubmission(normalizedLines, projects);
  if (!projectManagerAssignment) {
    throw new Error(
      'At least one project allocation is required before submitting this timesheet. Sync attendance again or use Auto Distribute after confirming a project has a Project Manager assigned.',
    );
  }

  header.status = 'Submitted';
  header.submittedAt = new Date().toISOString();
  header.submittedBy = input.actor;
  header.projectManager = projectManagerAssignment.projectManager;
  header.projectManagerProjectCode = projectManagerAssignment.projectCode;
  header.currentApprovalStage = 'Supervisor';
  header.currentApprover = header.supervisorName;
  header.workflowHistory = [
    ...(header.workflowHistory || []),
    {
      stage: 'Supervisor',
      decision: 'Submitted',
      by: input.actor,
      actedAt: header.submittedAt,
      comment: input.reviewerNote?.trim()
        || `Submitted for supervisor review before release to ${projectManagerAssignment.projectManager} on ${projectManagerAssignment.projectCode} - ${projectManagerAssignment.projectName}.`,
    },
  ];

  const persistLines = isNightHeader
    ? normalizedLines.filter((line) =>
      Boolean(String(line.clockIn || '').trim())
      || timesheetLineHasBookedHours(line),
    )
    : normalizedLines;
  const persistCheck = validateTimesheetLinesForPersist(persistLines);
  if (persistCheck.issues.some((issue) => /duplicate project code/i.test(issue))) {
    throw new Error(persistCheck.issues.join(' '));
  }

  if (persist) {
    await writeTimesheetHeaderLines(header, persistCheck.lines);
    if (input.notify !== false) {
      try {
        const { notifyTimesheetStageChange } = await import('@/lib/timesheet-workflow-notifications');
        await notifyTimesheetStageChange({
          header,
          action: 'SUBMIT',
          actor: input.actor,
          comment: input.reviewerNote,
        });
      } catch (error) {
        console.warn('[Timesheet] Submit notification skipped:', error instanceof Error ? error.message : error);
      }
    }
  }

  return {
    header,
    lines: persistCheck.lines,
    projectManager: projectManagerAssignment.projectManager,
    projectCode: projectManagerAssignment.projectCode,
    projectName: projectManagerAssignment.projectName,
  };
}

export type BookedDraftSubmitRow = {
  id: string;
  date: string;
  workCenter: string;
  supervisor: string;
  hours: number;
  projectCode?: string;
  projectManager?: string;
  reason?: string;
};

const bookedHoursForHeader = (headerId: string, lines: TimesheetLine[]) =>
  lines
    .filter((line) => line.headerId === headerId)
    .reduce((sum, line) => sum + Number(line.usedHours || 0), 0);

export async function submitAllBookedDraftTimesheets(options?: {
  apply?: boolean;
  actor?: string;
  notify?: boolean;
}) {
  const apply = Boolean(options?.apply);
  const actor = options?.actor || 'HR (bulk submit booked drafts)';
  const { headers: drafts } = await readTimesheetDraftBookedHeaders({ limit: null });
  const dates = [...new Set(drafts.map((header) => header.timesheetDate))];
  const { headers: dateHeaders, lines: dateLines } = await readTimesheetHeadersForWorkDates(dates);
  const clash = resolveSameDayDraftClashes(dateHeaders, dateLines);
  const projects = await readProjects();
  const holidayDates = await getPayrollPublicHolidayDates();

  const submitted: BookedDraftSubmitRow[] = [];
  const skipped: BookedDraftSubmitRow[] = [];
  const strippedHeaderIds = new Set(clash.stripped.map((item) => item.headerId));

  if (apply) {
    for (const draft of drafts) {
      if (!strippedHeaderIds.has(draft.id)) continue;
      const live = dateHeaders.find((header) => header.id === draft.id);
      if (!live) continue;
      try {
        await requireOpenPeriod(live.timesheetDate);
        await writeTimesheetHeaderLines(
          live,
          dateLines.filter((line) => line.headerId === live.id),
        );
      } catch {
        // Closed or locked periods stay as draft; submit will report the same reason.
      }
    }
  }

  for (const draft of drafts) {
    const live = dateHeaders.find((header) => header.id === draft.id) || draft;
    const remainingHours = Math.round(bookedHoursForHeader(live.id, dateLines) * 10) / 10;
    const summary = {
      id: live.id,
      date: live.timesheetDate,
      workCenter: live.workCenterName,
      supervisor: live.supervisorName,
      hours: remainingHours,
    };
    if (remainingHours <= 0.001) {
      skipped.push({
        ...summary,
        reason: 'All booked employees were already on another same-day timesheet, so this draft has nothing left to submit.',
      });
      continue;
    }
    const header = { ...live, workflowHistory: [...(live.workflowHistory || [])] };
    let lines = dateLines.filter((line) => line.headerId === header.id).map((line) => ({
      ...line,
      projectAllocations: (line.projectAllocations || []).map((allocation) => ({ ...allocation })),
      idleAllocations: (line.idleAllocations || []).map((allocation) => ({ ...allocation })),
    }));
    try {
      let result: SubmitTimesheetResult | null = null;
      let lastError: unknown;
      for (let attempt = 0; attempt < 8; attempt += 1) {
        try {
          result = await submitTimesheetForApproval({
            header: { ...header, workflowHistory: [...(header.workflowHistory || [])] },
            lines,
            otherHeaders: dateHeaders,
            otherLines: dateLines,
            actor,
            persist: apply,
            notify: apply && options?.notify !== false,
            repairBiometricHours: true,
            reviewerNote: 'Bulk submitted booked draft for supervisor review.',
            projects,
            holidayDates,
          });
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          const message = error instanceof Error ? error.message : String(error);
          const clashName = /^(.+?) is already booked on /i.exec(message)?.[1]?.trim();
          if (!clashName) break;
          const clashKeys = matchKeys(clashName);
          const clashNameKey = clashName.toLowerCase().replace(/\s+/g, ' ').trim();
          const isClashLine = (line: TimesheetLine) => {
            if (lineBookedHours(line) <= 0.001) return false;
            const lineName = String(line.employeeName || '').toLowerCase().replace(/\s+/g, ' ').trim();
            if (clashNameKey && lineName && (lineName === clashNameKey || lineName.includes(clashNameKey) || clashNameKey.includes(lineName))) return true;
            return matchKeys(line.employeeNo, line.employeeId, line.employeeName).some((key) => clashKeys.includes(key));
          };
          let stripped = 0;
          lines = lines.map((line) => {
            if (!isClashLine(line)) return line;
            stripped += 1;
            return clearLineBooking(line);
          });
          for (const line of dateLines) {
            if (line.headerId !== header.id || !isClashLine(line)) continue;
            Object.assign(line, clearLineBooking(line));
          }
          if (!stripped || bookedHoursForHeader(header.id, lines) <= 0.001) break;
        }
      }
      if (!result) throw lastError instanceof Error ? lastError : new Error(String(lastError || 'Submit failed.'));
      submitted.push({
        ...summary,
        hours: Math.round(bookedHoursForHeader(header.id, result.lines) * 10) / 10,
        projectCode: result.projectCode,
        projectManager: result.projectManager,
      });
      live.status = 'Submitted';
      live.submittedAt = result.header.submittedAt;
      live.submittedBy = result.header.submittedBy;
      live.projectManager = result.header.projectManager;
      live.projectManagerProjectCode = result.header.projectManagerProjectCode;
      live.currentApprovalStage = result.header.currentApprovalStage;
      live.currentApprover = result.header.currentApprover;
      const resultById = new Map(result.lines.map((line) => [line.id, line]));
      for (const line of dateLines) {
        if (line.headerId !== header.id) continue;
        const updated = resultById.get(line.id);
        if (updated) Object.assign(line, updated);
      }
    } catch (error) {
      skipped.push({
        ...summary,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    apply,
    total: drafts.length,
    submitted,
    skipped,
    clashRepairs: clash.stripped,
  };
}
