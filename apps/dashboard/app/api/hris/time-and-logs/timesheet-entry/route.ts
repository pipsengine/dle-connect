import { NextResponse } from 'next/server';
import { appendOrganizationAuditEvent } from '@/lib/organization-audit-store';
import { getUiPermissions, hasPermission, resolveAccessContext } from '@/lib/hris-access';
import {
  calculateTimesheetPeriod,
  advanceTimesheetWorkflow,
  generateProjectCode,
  idleReasons,
  STANDARD_TIMESHEET_HOURS,
  withDefaultIdleReason,
  readProjects,
  readTimesheetPeriod,
  readTimesheetData,
  isTimesheetEditableStatus,
  isTimesheetPayrollReadyStatus,
  syncAttendanceForTimesheet,
  normalizeTimesheetStatus,
  writeProjects,
  writeTimesheetData,
  workflowStages,
  type TimesheetHeader,
  type TimesheetLine,
  type TimesheetPeriod,
  type IdleReason,
  type DisplayColumn,
  type TimesheetAllocation,
  type TimesheetApprovalDecision,
  type TimesheetApprovalStep,
  type TimesheetEntryMode,
  type TimesheetRecord,
  type TimesheetStatus,
  type Project,
  type WorkflowStage,
} from '@/lib/timesheet-entry-store';
import { readBiometricDevices, type BiometricDeviceRecord } from '@/lib/biometric-attendance-store';
import { readLiveClockingActivity } from '@/lib/biometric-live-attendance-store';
import type { StructureInsight } from '@/lib/organization-data';

type TimesheetPayload = {
  generatedAt: string;
  timesheetDate: string;
  period: TimesheetPeriod;
  header: TimesheetHeader | null;
  lines: TimesheetLine[];
  idleReasons: IdleReason[];
  projects: Project[];
  nextProjectCode: string;
  workflowStages: WorkflowStage[];
  biometricDevices: BiometricDeviceRecord[];
  attendanceWorkCenters: Array<{
    location: string;
    site: string;
    deviceName: string;
  }>;
  permissions: {
    actor: string;
    role: string;
    canEdit: boolean;
    canExport: boolean;
    canApprove: boolean;
    canManagePeriod: boolean;
    canViewCosts: boolean;
    canViewAudit: boolean;
  };
  summary: {
    totalEmployees: number;
    presentEmployees: number;
    absentEmployees: number;
    onLeaveEmployees: number;
    sickEmployees: number;
    notSyncedEmployees: number;
    bookedHours: number;
    usedHours: number;
    idleHours: number;
    productivityPct: number;
    pendingApprovals: number;
  };
  filterOptions: {
    departments: string[];
    projects: string[];
    locations: string[];
    supervisors: string[];
    shifts: string[];
    businessUnits: string[];
    modes: TimesheetEntryMode[];
    statuses: TimesheetStatus[];
  };
  matrixColumns: DisplayColumn[];
  projectCatalog: any[];
  aiInsights: StructureInsight[];
};

type UpdatePayload = {
  action?:
    | 'SYNC_ATTENDANCE'
    | 'SAVE_DRAFT'
    | 'SUBMIT'
    | 'APPROVE'
    | 'REJECT'
    | 'MATRIX_SAVE'
    | 'CREATE_PROJECT'
    | 'COPY_PREVIOUS_DAY'
    | 'BULK_APPLY';
  date?: string;
  supervisorId?: string;
  workCenterName?: string;
  headerId?: string;
  lines?: TimesheetLine[];
  reviewerNote?: string;
  project?: Omit<Project, 'id'>;
  bulkAllocation?: {
    employeeIds: string[];
    projectCode: string;
    hours: number;
  };
};

async function handleBulkApply(request: Request, payload: UpdatePayload) {
  if (!payload.bulkAllocation || !payload.headerId) {
    throw new Error('Bulk allocation details and header ID are required.');
  }
  const { employeeIds, projectCode, hours } = payload.bulkAllocation;
  const { headers, lines: allLines } = await readTimesheetData();
  
  const header = headers.find(h => h.id === payload.headerId);
  if (!header) throw new Error('Header not found');

  const otherLines = allLines.filter(l => l.headerId !== header.id);
  const currentLines = allLines.filter(l => l.headerId === header.id);

  const updatedLines = currentLines.map(line => {
    if (!employeeIds.includes(line.employeeId)) return line;

    const allocations = [...line.projectAllocations];
    const pIdx = allocations.findIndex(p => p.projectCode === projectCode);
    if (pIdx >= 0) {
      allocations[pIdx].hours = hours;
    } else {
      allocations.push({
        projectId: projectCode,
        projectCode,
        projectName: projectCode,
        hours,
        remarks: null
      });
    }

    const usedHours = round1(allocations.reduce((sum, p) => sum + p.hours, 0));
    const totalHours = round1(usedHours + line.idleHours);

    return {
      ...line,
      projectAllocations: allocations,
      idleAllocations: line.idleAllocations.map(withDefaultIdleReason),
      usedHours,
      totalHours,
      variance: round1(totalHours - (line.attendanceDuration || 0)),
      validationStatus: totalHours === STANDARD_TIMESHEET_HOURS ? 'Valid' : (totalHours > STANDARD_TIMESHEET_HOURS ? 'Error' : 'Incomplete'),
    } as TimesheetLine;
  });

  await writeTimesheetData({ headers, lines: [...otherLines, ...updatedLines] });
  return header;
}

const slug = (value: string) => value.toLowerCase().replace(/\s+/g, '-');

async function handleCopyPreviousDay(request: Request, date: string, supervisorId: string, workCenterName: string) {
  const { headers, lines: allLines } = await readTimesheetData();
  
  // 1. Find previous day's header
  const targetDate = new Date(date);
  const prevDate = new Date(targetDate);
  prevDate.setDate(targetDate.getDate() - 1);
  const prevDateStr = prevDate.toISOString().split('T')[0];

  const prevHeader = headers.find(h => h.timesheetDate === prevDateStr && h.supervisorId === supervisorId && h.workCenterName === workCenterName);
  if (!prevHeader) {
    throw new Error(`No timesheet found for previous day (${prevDateStr}) to copy from.`);
  }

  const prevLines = allLines.filter(l => l.headerId === prevHeader.id);
  if (prevLines.length === 0) {
    throw new Error('Previous day timesheet has no data lines.');
  }

  // 2. Find or create current day's header
  let currentHeader = headers.find(h => h.timesheetDate === date && h.supervisorId === supervisorId && h.workCenterName === workCenterName);
  if (!currentHeader) {
    const period = calculateTimesheetPeriod(targetDate);
    currentHeader = {
      id: `hdr-${date}-${slug(supervisorId)}-${slug(workCenterName)}`,
      periodId: period.id,
      timesheetDate: date,
      supervisorId,
      supervisorName: supervisorId,
      workCenterId: slug(workCenterName),
      workCenterName,
      status: 'Draft',
      submittedAt: null,
      submittedBy: null,
      approvedAt: null,
      approvedBy: null,
      lastSyncAt: new Date().toISOString(),
    };
    headers.push(currentHeader);
  }

  // 3. Map allocations from previous lines to current employees
  // We keep current attendance (clockIn/Out) but copy project/idle allocations
  const currentLines = allLines.filter(l => l.headerId === currentHeader!.id);
  const otherLines = allLines.filter(l => l.headerId !== currentHeader!.id);

  const updatedLines = currentLines.map(line => {
    const prevLine = prevLines.find(pl => pl.employeeId === line.employeeId);
    if (!prevLine) return line;

    return {
      ...line,
      projectAllocations: [...prevLine.projectAllocations],
      idleAllocations: prevLine.idleAllocations.map(withDefaultIdleReason),
      usedHours: prevLine.usedHours,
      idleHours: prevLine.idleHours,
      totalHours: prevLine.totalHours,
      variance: round1(prevLine.totalHours - (line.attendanceDuration || 0)),
      validationStatus: prevLine.totalHours === STANDARD_TIMESHEET_HOURS ? 'Valid' : (prevLine.totalHours > STANDARD_TIMESHEET_HOURS ? 'Error' : 'Incomplete'),
      validationMessage: null,
    } as TimesheetLine;
  });

  await writeTimesheetData({ headers, lines: [...otherLines, ...updatedLines] });
  return currentHeader;
}

const ok = <T,>(data: T, status = 200) => NextResponse.json({ status: 'success', data }, { status });
const err = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });
const round1 = (value: number) => Math.round(value * 10) / 10;
const todayDateInputValue = () => {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60 * 1000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
};

const buildPayload = async (request: Request, date?: string, supervisorId?: string, workCenterName?: string): Promise<TimesheetPayload> => {
  const access = resolveAccessContext(request);
  const uiPermissions = getUiPermissions(access);
  const { headers, lines: allLines } = await readTimesheetData();
  const projects = await readProjects();
  const nextProjectCode = await generateProjectCode();
  const biometricDevices = await readBiometricDevices();

  const targetDate = date || todayDateInputValue();
  const targetSupervisor = supervisorId || access.actor;
  const targetWorkCenter = workCenterName?.trim();
  let attendanceWorkCenters: TimesheetPayload['attendanceWorkCenters'] = [];
  let liveRecords: Awaited<ReturnType<typeof readLiveClockingActivity>>['records'] = [];
  try {
    const liveAttendance = await readLiveClockingActivity(targetDate);
    liveRecords = liveAttendance.records;
    const workCenterByLocation = new Map<string, TimesheetPayload['attendanceWorkCenters'][number]>();
    for (const record of liveAttendance.records) {
      if (!record.location) continue;
      if (!workCenterByLocation.has(record.location)) {
        workCenterByLocation.set(record.location, {
          location: record.location,
          site: record.site,
          deviceName: record.site || record.location,
        });
      }
    }
    attendanceWorkCenters = Array.from(workCenterByLocation.values()).sort((a, b) => a.location.localeCompare(b.location));
  } catch {
    attendanceWorkCenters = [];
  }

  const header =
    headers.find((h) => h.timesheetDate === targetDate && h.supervisorId === targetSupervisor && (!targetWorkCenter || h.workCenterName === targetWorkCenter)) ||
    headers.find((h) => h.timesheetDate === targetDate && h.supervisorId === targetSupervisor) ||
    null;
  const lines = header ? allLines.filter((l) => l.headerId === header.id) : [];
  const selectedWorkCenter = targetWorkCenter || header?.workCenterName || attendanceWorkCenters[0]?.location || '';
  const exactLiveRecordsForWorkCenter = selectedWorkCenter
    ? liveRecords.filter((record) => record.location === selectedWorkCenter || record.site === selectedWorkCenter)
    : liveRecords;
  const liveRecordsForWorkCenter = exactLiveRecordsForWorkCenter.length > 0 ? exactLiveRecordsForWorkCenter : liveRecords;

  const activeProjects = projects.filter(p => ['Active', 'Approved', 'Open'].includes(p.status));

  const summary = {
    totalEmployees: lines.length,
    presentEmployees: lines.filter((l) => l.clockIn).length,
    absentEmployees: lines.filter((l) => !l.clockIn).length,
    onLeaveEmployees: lines.filter((l) => l.idleAllocations.some((item) => item.reasonName.toLowerCase().includes('leave'))).length,
    sickEmployees: 0,
    notSyncedEmployees: Math.max(0, liveRecordsForWorkCenter.length - lines.length),
    bookedHours: round1(lines.reduce((sum, l) => sum + l.totalHours, 0)),
    usedHours: round1(lines.reduce((sum, l) => sum + l.usedHours, 0)),
    idleHours: round1(lines.reduce((sum, l) => sum + l.idleHours, 0)),
    productivityPct: lines.reduce((sum, l) => sum + l.totalHours, 0) > 0 
      ? round1((lines.reduce((sum, l) => sum + l.usedHours, 0) / lines.reduce((sum, l) => sum + l.totalHours, 0)) * 100)
      : 0,
    pendingApprovals: headers.filter((h) => ['Submitted', 'Project_Manager_Reviewed', 'Cost_Control_Reviewed'].includes(h.status)).length,
  };

  return {
    generatedAt: new Date().toISOString(),
    timesheetDate: targetDate,
    period: await readTimesheetPeriod(new Date(targetDate)),
    header,
    lines,
    idleReasons,
    projects: activeProjects,
    nextProjectCode,
    workflowStages,
    biometricDevices,
    attendanceWorkCenters,
    permissions: {
      actor: uiPermissions.actor,
      role: uiPermissions.role,
      canEdit: uiPermissions.canEditAttendance,
      canExport: true,
      canApprove: uiPermissions.canApproveTimesheet || uiPermissions.role === 'OrganizationAdmin',
      canManagePeriod: uiPermissions.canManageTimesheetPeriods || uiPermissions.role === 'OrganizationAdmin',
      canViewCosts: true,
      canViewAudit: uiPermissions.canViewAudit,
    },
    summary,
    filterOptions: {
      departments: Array.from(new Set(liveRecords.map((record) => record.department).filter(Boolean))).sort(),
      projects: activeProjects.map(p => p.code),
      locations: attendanceWorkCenters.map((workCenter) => workCenter.location),
      supervisors: Array.from(new Set([uiPermissions.actor, 'HRIS Administrator'].filter(Boolean))).sort(),
      shifts: Array.from(new Set(liveRecords.map((record) => record.shift))).sort(),
      businessUnits: Array.from(new Set(liveRecords.map((record) => record.businessUnit).filter(Boolean))).sort(),
      modes: ['Supervisor Entry'],
      statuses: ['Draft', 'Submitted', 'Project_Manager_Reviewed', 'Cost_Control_Reviewed', 'HR_Acknowledged', 'Rejected', 'Returned', 'Locked'],
    },
    matrixColumns: activeProjects.slice(0, 4).map(p => ({ code: p.code, label: p.code, kind: 'project' })),
    projectCatalog: activeProjects,
    aiInsights: [
      {
        id: 'ts-ins-1',
        severity: summary.idleHours > summary.usedHours * 0.2 ? 'high' : 'low',
        title: 'High Idle Time Detected',
        recommendation: 'Review work center assignments and check for material or equipment delays.',
      },
      {
        id: 'ts-ins-2',
        severity: summary.notSyncedEmployees > 0 ? 'medium' : 'low',
        title: 'Attendance Sync Coverage',
        recommendation: summary.notSyncedEmployees > 0
          ? 'Some biometric clock-ins for this work center are not yet on the timesheet. Sync attendance to refresh.'
          : 'Timesheet rows are aligned with the selected biometric work center.',
      },
    ],
  };
};

const requireOpenPeriod = async (date: string) => {
  const period = await readTimesheetPeriod(new Date(date));
  if (period.status !== 'Open') {
    throw new Error(`Timesheet period ${period.name} is ${period.status}. Reopen the period before changing timesheets.`);
  }
  return period;
};

const requireEditableTimesheet = (header: TimesheetHeader) => {
  const status = normalizeTimesheetStatus(header.status);
  if (isTimesheetPayrollReadyStatus(header.status)) {
    throw new Error('This timesheet has been acknowledged by HR and is payroll-ready. It cannot be edited.');
  }
  if (!isTimesheetEditableStatus(header.status)) {
    throw new Error(`This timesheet is currently ${status.replace(/_/g, ' ')} and cannot be edited unless it is returned or rejected.`);
  }
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date') || undefined;
  const supervisorId = searchParams.get('supervisorId') || undefined;
  const workCenterName = searchParams.get('workCenterName') || undefined;
  return ok(await buildPayload(request, date, supervisorId, workCenterName));
}

export async function PATCH(request: Request) {
  const access = resolveAccessContext(request);
  const payload = (await request.json()) as UpdatePayload;
  const { action, date, supervisorId, workCenterName, headerId, lines: updatedLines } = payload;

  try {
    if (action === 'CREATE_PROJECT') {
      if (!payload.project) return err(400, 'Project details are required.');
      const projectCode = payload.project.code?.trim();
      if (!projectCode) return err(400, 'Project code is required.');
      const projects = await readProjects();
      if (projects.some((project) => project.code.toLowerCase() === projectCode.toLowerCase())) {
        return err(409, `Project code ${projectCode} already exists.`);
      }
      const newProject: Project = {
        ...payload.project,
        code: projectCode,
        id: `prj-${Date.now()}`,
      };
      projects.push(newProject);
      await writeProjects(projects);
      return ok(await buildPayload(request, date, supervisorId, workCenterName));
    }

    if (action === 'COPY_PREVIOUS_DAY') {
      if (!date || !supervisorId || !workCenterName) return err(400, 'Date, supervisor, and work center are required for copy.');
      await requireOpenPeriod(date);
      const { headers } = await readTimesheetData();
      const currentHeader = headers.find(h => h.timesheetDate === date && h.supervisorId === supervisorId && h.workCenterName === workCenterName);
      if (currentHeader) requireEditableTimesheet(currentHeader);
      await handleCopyPreviousDay(request, date, supervisorId, workCenterName);
      return ok(await buildPayload(request, date, supervisorId, workCenterName));
    }

    if (action === 'BULK_APPLY') {
      if (!payload.headerId) return err(400, 'Header ID is required for bulk allocation.');
      const { headers } = await readTimesheetData();
      const header = headers.find(h => h.id === payload.headerId);
      if (!header) return err(404, 'Timesheet header not found.');
      await requireOpenPeriod(header.timesheetDate);
      requireEditableTimesheet(header);
      await handleBulkApply(request, payload);
      return ok(await buildPayload(request, header.timesheetDate, header.supervisorId, header.workCenterName));
    }

    const { headers, lines: allLines } = await readTimesheetData();

    if (action === 'SYNC_ATTENDANCE') {
      if (!date || !supervisorId || !workCenterName) return err(400, 'Date, Supervisor ID, and Work Center Name are required.');
      await requireOpenPeriod(date);
      const existingHeader = headers.find(h => h.timesheetDate === date && h.supervisorId === supervisorId && h.workCenterName === workCenterName);
      if (existingHeader) requireEditableTimesheet(existingHeader);
      await syncAttendanceForTimesheet(date, supervisorId, workCenterName);
      return ok(await buildPayload(request, date, supervisorId, workCenterName));
    }

    if (action === 'MATRIX_SAVE' || action === 'SAVE_DRAFT' || action === 'SUBMIT') {
      if (!headerId || !updatedLines) return err(400, 'Header ID and Lines are required.');
      
      const header = headers.find(h => h.id === headerId);
      if (!header) return err(404, 'Timesheet header not found.');
      await requireOpenPeriod(header.timesheetDate);
      requireEditableTimesheet(header);

      // Validate standard day rule, including break time.
      for (const line of updatedLines) {
        if (line.totalHours > STANDARD_TIMESHEET_HOURS + 0.001) {
          return err(400, `Total hours for ${line.employeeName} cannot exceed ${STANDARD_TIMESHEET_HOURS} hours.`);
        }
        if (Math.abs(line.usedHours + line.idleHours - line.totalHours) > 0.01) {
          return err(400, `Hours mismatch for ${line.employeeName}: Used + Idle must equal Total.`);
        }
      }

      const normalizedLines = updatedLines.map((line) => ({
        ...line,
        idleAllocations: line.idleAllocations.map(withDefaultIdleReason),
      }));
      const otherLines = allLines.filter(l => l.headerId !== headerId);
      
      if (action === 'SUBMIT') {
        header.status = 'Submitted';
        header.submittedAt = new Date().toISOString();
        header.submittedBy = access.actor;
        header.workflowHistory = [
          ...(header.workflowHistory || []),
          {
            stage: 'Supervisor',
            decision: 'Submitted',
            by: access.actor,
            actedAt: header.submittedAt,
            comment: payload.reviewerNote?.trim() || 'Submitted for Project Manager review.',
          },
        ];
      } else {
        header.status = 'Draft';
      }

      await writeTimesheetData({ headers, lines: [...otherLines, ...normalizedLines] });
      return ok(await buildPayload(request, header.timesheetDate, header.supervisorId, header.workCenterName));
    }

    if (action === 'APPROVE' || action === 'REJECT') {
      if (!headerId) return err(400, 'Header ID is required.');
      const header = headers.find(h => h.id === headerId);
      if (!header) return err(404, 'Timesheet header not found.');

      if (action === 'APPROVE') {
        await advanceTimesheetWorkflow(header.id, 'APPROVE', access.actor, payload.reviewerNote);
      } else {
        await advanceTimesheetWorkflow(header.id, 'REJECT', access.actor, payload.reviewerNote);
      }

      return ok(await buildPayload(request, header.timesheetDate, header.supervisorId, header.workCenterName));
    }

    return err(400, 'Invalid action.');
  } catch (error) {
    console.error('Timesheet Action Error:', error);
    return err(500, error instanceof Error ? error.message : 'Internal Server Error');
  }
}
