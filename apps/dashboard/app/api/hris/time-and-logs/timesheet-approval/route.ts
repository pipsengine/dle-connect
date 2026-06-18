import { NextResponse } from 'next/server';
import { getUiPermissions, resolveAccessContext } from '@/lib/hris-access';
import {
  advanceTimesheetWorkflow,
  advanceProjectTimesheetApproval,
  buildProjectTimesheetApprovals,
  normalizePaidWorkHours,
  normalizeTimesheetStatus,
  readProjects,
  readTimesheetData,
  readTimesheetPayrollUpdates,
  readTimesheetPeriod,
  type TimesheetHeader,
  type TimesheetStatus,
  type TimesheetWorkflowStage,
} from '@/lib/timesheet-entry-store';

const ok = <T,>(data: T, status = 200) => NextResponse.json({ status: 'success', data }, { status });
const err = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });
const round1 = (value: number) => Math.round(value * 10) / 10;
const isSuperAdministrator = (role: string) => role === 'Super Administrator';

type ApprovalAction = 'APPROVE' | 'REJECT' | 'RETURN';
type ProjectApprovalStage = 'Project Manager' | 'Cost Control' | 'HR';

const stageByStatus: Partial<Record<TimesheetStatus, TimesheetWorkflowStage>> = {
  Submitted: 'Supervisor',
  Supervisor_Reviewed: 'Project Manager',
  Project_Manager_Reviewed: 'Cost Control',
  Cost_Control_Reviewed: 'HR',
};

const nextActionLabel = (status: TimesheetStatus) => {
  if (status === 'Submitted') return 'Supervisor Review';
  if (status === 'Supervisor_Reviewed') return 'Project Manager Approve';
  if (status === 'Project_Manager_Reviewed') return 'Cost Control Approve';
  if (status === 'Cost_Control_Reviewed') return 'HR Acknowledge';
  return null;
};

const workflowSteps = (header: TimesheetHeader) => {
  const history = header.workflowHistory || [];
  return (['Supervisor', 'Project Manager', 'Cost Control', 'HR'] as const).map((stage) => {
    const event = [...history].reverse().find((item) => item.stage === stage);
    return {
      stage,
      status: event?.decision || 'Pending',
      by: event?.by || null,
      actedAt: event?.actedAt || null,
      comment: event?.comment || null,
    };
  });
};

const buildPayload = async (request: Request) => {
  const access = resolveAccessContext(request);
  const permissions = getUiPermissions(access);
  const { headers, lines } = await readTimesheetData();
  const projects = await readProjects();
  const payrollUpdates = await readTimesheetPayrollUpdates();
  const nonDraftHeaders = headers.filter((header) => normalizeTimesheetStatus(header.status) !== 'Draft');

  const pendingTimesheets = await Promise.all(nonDraftHeaders.map(async (header) => {
    const status = normalizeTimesheetStatus(header.status);
    const headerLines = lines.filter((line) => line.headerId === header.id);
    const period = await readTimesheetPeriod(new Date(header.timesheetDate));
    const payrollUpdate = payrollUpdates.find((update) => update.headerIds.includes(header.id));
    const projectApprovals = buildProjectTimesheetApprovals(header, headerLines, projects, access.actor);
    const allProjectApprovals = buildProjectTimesheetApprovals(header, headerLines, projects);

    return {
      id: header.id,
      timesheetDate: header.timesheetDate,
      supervisorName: header.supervisorName,
      workCenterName: header.workCenterName,
      status,
      currentStage: stageByStatus[status] || null,
      nextActionLabel: nextActionLabel(status),
      payrollReady: status === 'HR_Acknowledged',
      payrollAcknowledgedAt: header.payrollAcknowledgedAt || payrollUpdate?.acknowledgedAt || null,
      payrollAcknowledgedBy: header.payrollAcknowledgedBy || payrollUpdate?.acknowledgedBy || null,
      totalEmployees: headerLines.length,
      totalHours: round1(headerLines.reduce((sum, line) => sum + normalizePaidWorkHours(line.totalHours), 0)),
      attendanceHours: round1(headerLines.reduce((sum, line) => sum + normalizePaidWorkHours(line.attendanceDuration), 0)),
      idleHours: round1(headerLines.reduce((sum, line) => sum + line.idleHours, 0)),
      submittedAt: header.submittedAt,
      lastSyncAt: header.lastSyncAt,
      periodName: period.name,
      periodStatus: period.status,
      workflowSteps: workflowSteps(header),
      projectApprovals,
      projectApprovalSummary: {
        totalProjects: allProjectApprovals.length,
        projectManagerApproved: allProjectApprovals.filter((item) => item.projectManagerStatus === 'Approved').length,
        costControlApproved: allProjectApprovals.filter((item) => item.costControlStatus === 'Approved').length,
        projectManagerPending: allProjectApprovals.filter((item) => item.projectManagerStatus === 'Pending').length,
        costControlPending: allProjectApprovals.filter((item) => item.costControlStatus === 'Pending').length,
        consolidatedForHr: status === 'Cost_Control_Reviewed' || status === 'HR_Acknowledged',
      },
    };
  }));
  pendingTimesheets.sort((a, b) => new Date(b.timesheetDate).getTime() - new Date(a.timesheetDate).getTime());

  const stats = {
    totalPending: pendingTimesheets.filter((item) => ['Submitted', 'Supervisor_Reviewed', 'Project_Manager_Reviewed', 'Cost_Control_Reviewed'].includes(item.status)).length,
    supervisorCount: pendingTimesheets.filter((item) => item.status === 'Submitted').length,
    projectManagerCount: pendingTimesheets.filter((item) => item.status === 'Supervisor_Reviewed').length,
    costControlCount: pendingTimesheets.filter((item) => item.status === 'Project_Manager_Reviewed').length,
    hrAcknowledgementCount: pendingTimesheets.filter((item) => item.status === 'Cost_Control_Reviewed').length,
    payrollReadyCount: pendingTimesheets.filter((item) => item.status === 'HR_Acknowledged').length,
    projectSplitCount: pendingTimesheets.reduce((sum, item) => sum + item.projectApprovalSummary.totalProjects, 0),
    projectManagerPendingLines: pendingTimesheets.reduce((sum, item) => sum + item.projectApprovalSummary.projectManagerPending, 0),
    costControlPendingLines: pendingTimesheets.reduce((sum, item) => sum + item.projectApprovalSummary.costControlPending, 0),
  };

  return {
    generatedAt: new Date().toISOString(),
    permissions: {
      actor: access.actor,
      role: access.role,
      canApprove: permissions.canApproveTimesheet,
      canAcknowledgePayroll: permissions.canApproveTimesheet || permissions.canEditAttendance,
      canApproveAllLevels: isSuperAdministrator(access.role),
    },
    pendingTimesheets,
    stats,
    filterOptions: {
      workCenters: Array.from(new Set(headers.map((header) => header.workCenterName))).sort(),
      periods: Array.from(new Set(pendingTimesheets.map((item) => item.periodName))).sort(),
      supervisors: Array.from(new Set(headers.map((header) => header.supervisorName))).sort(),
    },
  };
};

export async function GET(request: Request) {
  try {
    return ok(await buildPayload(request));
  } catch (error) {
    console.error('Approval API Error:', error);
    return err(500, error instanceof Error ? error.message : 'Internal Server Error');
  }
}

export async function PATCH(request: Request) {
  const access = resolveAccessContext(request);
  const permissions = getUiPermissions(access);

  if (!permissions.canApproveTimesheet) {
    return err(403, 'You do not have permission to approve timesheets.');
  }

  try {
    const payload = await request.json() as { action?: ApprovalAction; headerId?: string; comment?: string; projectCode?: string; stage?: ProjectApprovalStage };
    if (!payload.headerId) return err(400, 'Timesheet header ID is required.');
    if (!payload.action || !['APPROVE', 'REJECT', 'RETURN'].includes(payload.action)) {
      return err(400, 'Action must be APPROVE, REJECT, or RETURN.');
    }

    if (payload.projectCode && payload.stage && payload.stage !== 'HR') {
      await advanceProjectTimesheetApproval(payload.headerId, payload.action, access.actor, {
        projectCode: payload.projectCode,
        stage: payload.stage,
        comment: payload.comment,
        bypassAssigneeCheck: isSuperAdministrator(access.role),
      });
    } else {
      await advanceTimesheetWorkflow(payload.headerId, payload.action, access.actor, payload.comment);
    }
    return ok(await buildPayload(request));
  } catch (error) {
    console.error('Approval API Error:', error);
    return err(400, error instanceof Error ? error.message : 'Unable to update approval workflow.');
  }
}
