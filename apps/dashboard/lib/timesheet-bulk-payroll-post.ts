import sql from 'mssql';
import { getDleEnterpriseDbPool } from '@/lib/dle-enterprise-db';
import { postPermanentTimesheetEarningsFromTimesheets } from '@/lib/payroll-timesheet-ot-posting';
import {
  invalidateTimesheetApprovalWorkspaceCache,
  invalidateTimesheetDataCache,
  normalizeTimesheetStatus,
  rebuildPayrollSnapshotForPeriod,
  type TimesheetStatus,
  type TimesheetWorkflowDecision,
  type TimesheetWorkflowStage,
} from '@/lib/timesheet-entry-store';

const APPROVAL_RANK: Record<string, number> = {
  Draft: 0,
  Submitted: 1,
  Supervisor_Reviewed: 2,
  Project_Manager_Reviewed: 3,
  Cost_Control_Reviewed: 4,
  GM_Operations_Reviewed: 5,
  HR_Acknowledged: 6,
  Locked: 7,
};

const SKIP_STATUSES = new Set<TimesheetStatus>(['Rejected', 'Returned', 'Locked']);

export type BulkPayrollWorkflowEvent = {
  headerId: string;
  stage: TimesheetWorkflowStage;
  decision: TimesheetWorkflowDecision;
  by: string;
  comment: string;
};

export type BulkPayrollHeaderInput = {
  id: string;
  status: string;
  hasHours: boolean;
  projectCodes: string[];
};

const clip = (value: string, max: number) => value.length <= max ? value : value.slice(0, max);

const projectComment = (kind: 'PROJECT' | 'COST', code: string) =>
  clip(`[${kind}:${code}] Bulk approval completed for payroll posting.`, 500);

/**
 * Remaining workflow events that take one timesheet from its current status
 * through every later approval stage and a payroll lock.
 * Empty drafts are left alone.
 */
export const planBulkPayrollPostEvents = (
  header: BulkPayrollHeaderInput,
  actor: string,
): BulkPayrollWorkflowEvent[] | null => {
  const status = normalizeTimesheetStatus(header.status);
  if (SKIP_STATUSES.has(status)) return null;
  if (status === 'Draft' && !header.hasHours) return null;

  const rank = APPROVAL_RANK[status] ?? 0;
  const by = clip(actor || 'Payroll', 120);
  const projects = Array.from(new Set(header.projectCodes.map((code) => code.trim()).filter(Boolean)));
  const events: BulkPayrollWorkflowEvent[] = [];
  const push = (stage: TimesheetWorkflowStage, decision: TimesheetWorkflowDecision, comment: string, eventActor = by) => {
    events.push({ headerId: header.id, stage, decision, by: clip(eventActor, 120), comment: clip(comment, 500) });
  };

  if (status === 'Draft') {
    push('Supervisor', 'Submitted', 'Booked draft submitted during bulk payroll posting.');
  }
  if (rank < APPROVAL_RANK.Supervisor_Reviewed) {
    push('Supervisor', 'Approved', 'Bulk supervisor approval for payroll posting.');
  }
  if (rank < APPROVAL_RANK.Project_Manager_Reviewed) {
    if (projects.length) {
      for (const code of projects) push('Project Manager', 'Approved', projectComment('PROJECT', code));
    } else {
      push('Project Manager', 'Approved', 'Bulk project approval for payroll posting. No project segments on this timesheet.');
    }
  }
  if (rank < APPROVAL_RANK.Cost_Control_Reviewed) {
    if (projects.length) {
      for (const code of projects) push('Cost Control', 'Approved', projectComment('COST', code));
    } else {
      push('Cost Control', 'Approved', 'Bulk cost-control approval for payroll posting. No project segments on this timesheet.');
    }
    push('GM Operations', 'Submitted', 'All project approvals complete. Consolidated timesheet is ready for GM Operations review.', 'System');
  }
  if (rank < APPROVAL_RANK.GM_Operations_Reviewed) {
    push('GM Operations', 'Approved', 'Bulk GM Operations approval for payroll posting.');
  }
  if (rank < APPROVAL_RANK.HR_Acknowledged) {
    push('HR', 'Acknowledged', 'Bulk HR approval for payroll posting.');
  }
  push('HR', 'Approved', 'Payroll posted and timesheet locked.');
  return events;
};

type HeaderRow = {
  Id: string;
  Status: string;
  HasHours: number | boolean;
  WorkCenterName: string | null;
};

export type BulkPayrollPostPlan = {
  periodId: string;
  actor: string;
  toPost: number;
  skippedDrafts: number;
  skippedOther: number;
  byStatus: Record<string, number>;
  bookedDrafts: number;
  events: number;
  sample: Array<{ id: string; status: string; workCenter: string; eventCount: number }>;
};

const loadPeriodHeaders = async (pool: sql.ConnectionPool, periodId: string) => {
  const headersResult = await pool.request()
    .input('PeriodId', sql.NVarChar(40), periodId)
    .query(`
      SELECT
        h.[Id],
        h.[Status],
        h.[WorkCenterName],
        CASE WHEN EXISTS (
          SELECT 1
          FROM [hris].[TimesheetLines] l
          WHERE l.[HeaderId] = h.[Id]
            AND (ISNULL(l.[TotalHours], 0) > 0 OR ISNULL(l.[UsedHours], 0) > 0)
        ) THEN 1 ELSE 0 END AS [HasHours]
      FROM [hris].[TimesheetHeaders] h
      WHERE h.[PeriodId] = @PeriodId
    `);

  const projectsResult = await pool.request()
    .input('PeriodId', sql.NVarChar(40), periodId)
    .query(`
      SELECT DISTINCT l.[HeaderId] AS [HeaderId], p.[ProjectCode] AS [ProjectCode]
      FROM [hris].[TimesheetLines] l
      INNER JOIN [hris].[TimesheetHeaders] h ON h.[Id] = l.[HeaderId]
      INNER JOIN [hris].[TimesheetProjectAllocations] p ON p.[LineId] = l.[Id]
      WHERE h.[PeriodId] = @PeriodId
        AND ISNULL(p.[Hours], 0) > 0
        AND ISNULL(p.[ProjectCode], N'') <> N''
    `);

  const projectsByHeader = new Map<string, string[]>();
  for (const row of projectsResult.recordset as Array<{ HeaderId: string; ProjectCode: string }>) {
    const headerId = String(row.HeaderId);
    const codes = projectsByHeader.get(headerId) || [];
    codes.push(String(row.ProjectCode));
    projectsByHeader.set(headerId, codes);
  }

  return {
    headers: headersResult.recordset as HeaderRow[],
    projectsByHeader,
  };
};

export const planBulkPayrollPost = async (periodId: string, actor: string): Promise<BulkPayrollPostPlan & { headerIds: string[]; workflowEvents: BulkPayrollWorkflowEvent[] }> => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new Error('DLE Enterprise database is not available.');
  const { headers, projectsByHeader } = await loadPeriodHeaders(pool, periodId);

  const headerIds: string[] = [];
  const workflowEvents: BulkPayrollWorkflowEvent[] = [];
  const byStatus: Record<string, number> = {};
  let skippedDrafts = 0;
  let skippedOther = 0;
  let bookedDrafts = 0;
  const sample: BulkPayrollPostPlan['sample'] = [];

  for (const row of headers) {
    const status = normalizeTimesheetStatus(row.Status);
    const planned = planBulkPayrollPostEvents({
      id: String(row.Id),
      status: row.Status,
      hasHours: Boolean(Number(row.HasHours)),
      projectCodes: projectsByHeader.get(String(row.Id)) || [],
    }, actor);
    if (!planned) {
      if (status === 'Draft') skippedDrafts += 1;
      else skippedOther += 1;
      continue;
    }
    if (status === 'Draft') bookedDrafts += 1;
    byStatus[status] = (byStatus[status] || 0) + 1;
    headerIds.push(String(row.Id));
    workflowEvents.push(...planned);
    if (sample.length < 8) {
      sample.push({
        id: String(row.Id),
        status,
        workCenter: String(row.WorkCenterName || ''),
        eventCount: planned.length,
      });
    }
  }

  return {
    periodId,
    actor,
    toPost: headerIds.length,
    skippedDrafts,
    skippedOther,
    byStatus,
    bookedDrafts,
    events: workflowEvents.length,
    sample,
    headerIds,
    workflowEvents,
  };
};

const insertEvents = async (tx: sql.Transaction, events: BulkPayrollWorkflowEvent[], actedAt: Date) => {
  const chunkSize = 40;
  for (let offset = 0; offset < events.length; offset += chunkSize) {
    const chunk = events.slice(offset, offset + chunkSize);
    const request = new sql.Request(tx);
    const values = chunk.map((event, index) => {
      request.input(`H${index}`, sql.NVarChar(160), event.headerId);
      request.input(`S${index}`, sql.NVarChar(60), event.stage);
      request.input(`D${index}`, sql.NVarChar(60), event.decision);
      request.input(`A${index}`, sql.NVarChar(120), event.by);
      request.input(`C${index}`, sql.NVarChar(500), event.comment);
      return `(@H${index},@S${index},@D${index},@A${index},@ActedAt,@C${index})`;
    });
    request.input('ActedAt', sql.DateTime2, actedAt);
    await request.query(`
      INSERT INTO [hris].[TimesheetWorkflowEvents] ([HeaderId],[Stage],[Decision],[Actor],[ActedAt],[Comment])
      VALUES ${values.join(',')}
    `);
  }
};

const lockHeaders = async (tx: sql.Transaction, headerIds: string[], actor: string, actedAt: Date) => {
  const chunkSize = 80;
  for (let offset = 0; offset < headerIds.length; offset += chunkSize) {
    const chunk = headerIds.slice(offset, offset + chunkSize);
    const request = new sql.Request(tx);
    request.input('Actor', sql.NVarChar(120), clip(actor || 'Payroll', 120));
    request.input('ActedAt', sql.DateTime2, actedAt);
    const idParams = chunk.map((id, index) => {
      request.input(`Id${index}`, sql.NVarChar(160), id);
      return `@Id${index}`;
    });
    await request.query(`
      UPDATE [hris].[TimesheetHeaders]
      SET
        [SubmittedAt] = CASE WHEN [Status] = N'Draft' THEN COALESCE([SubmittedAt], @ActedAt) ELSE [SubmittedAt] END,
        [SubmittedBy] = CASE WHEN [Status] = N'Draft' THEN COALESCE([SubmittedBy], @Actor) ELSE [SubmittedBy] END,
        [Status] = N'Locked',
        [ApprovedAt] = COALESCE([ApprovedAt], @ActedAt),
        [ApprovedBy] = COALESCE([ApprovedBy], @Actor),
        [PayrollAcknowledgedAt] = COALESCE([PayrollAcknowledgedAt], @ActedAt),
        [PayrollAcknowledgedBy] = COALESCE([PayrollAcknowledgedBy], @Actor),
        [CurrentApprovalStage] = NULL,
        [CurrentApprover] = NULL
      WHERE [Id] IN (${idParams.join(',')})
        AND [Status] NOT IN (N'Locked', N'Rejected', N'Returned')
    `);
  }
};

export type BulkPayrollPostResult = BulkPayrollPostPlan & {
  applied: boolean;
  payrollSnapshotEmployees: number;
  overtimePosted: number;
  overtimeAmount: number;
  nightAllowancePosted: number;
};

export const approveAndPostTimesheetsForPeriod = async (input: {
  periodId: string;
  actor: string;
  apply: boolean;
}): Promise<BulkPayrollPostResult> => {
  const plan = await planBulkPayrollPost(input.periodId, input.actor);
  const base = {
    periodId: plan.periodId,
    actor: plan.actor,
    toPost: plan.toPost,
    skippedDrafts: plan.skippedDrafts,
    skippedOther: plan.skippedOther,
    byStatus: plan.byStatus,
    bookedDrafts: plan.bookedDrafts,
    events: plan.events,
    sample: plan.sample,
    applied: false,
    payrollSnapshotEmployees: 0,
    overtimePosted: 0,
    overtimeAmount: 0,
    nightAllowancePosted: 0,
  };
  if (!input.apply || !plan.headerIds.length) return base;

  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new Error('DLE Enterprise database is not available.');
  const actedAt = new Date();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    await insertEvents(tx, plan.workflowEvents, actedAt);
    await lockHeaders(tx, plan.headerIds, input.actor, actedAt);
    await tx.commit();
  } catch (error) {
    await tx.rollback().catch(() => undefined);
    throw error;
  }

  invalidateTimesheetDataCache();
  invalidateTimesheetApprovalWorkspaceCache();
  const snapshot = await rebuildPayrollSnapshotForPeriod(input.periodId, input.actor);
  const periodToken = input.periodId.replace(/^per-/, '');
  const earnings = await postPermanentTimesheetEarningsFromTimesheets(periodToken);

  return {
    ...base,
    applied: true,
    payrollSnapshotEmployees: snapshot.employeeAttendance.length,
    overtimePosted: earnings.overtime.posted,
    overtimeAmount: earnings.overtime.totalAmount,
    nightAllowancePosted: earnings.nightAllowance.posted,
  };
};
