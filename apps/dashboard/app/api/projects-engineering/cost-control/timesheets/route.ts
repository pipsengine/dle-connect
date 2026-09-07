import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { withResolvedAccess } from '@/lib/auth/resolve-access-session';
import {
  canAccessProject,
  canAccessProjectsEngineeringPortal,
  canEditProjects,
} from '@/lib/access/projects-engineering-access';
import { parseLabourValidation } from '@/lib/projects-engineering/cost-control';
import { ensurePmDb, sql } from '@/lib/projects-engineering/db';
import { getProjectById } from '@/lib/projects-engineering/project-store';

const getSession = async (request: NextRequest) => {
  const session = await verifySessionToken(request.cookies.get(AUTH_COOKIE)?.value);
  return session ? withResolvedAccess(session) : null;
};

const actorGuid = (session: { sub?: string; username?: string; employeeId?: string }) => {
  const seed = String(session.employeeId || session.sub || session.username || 'system');
  const hex = createHash('sha1').update(seed).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
};

const resolvePmProjectId = async (projectKey: string) => {
  const project = await getProjectById(projectKey);
  if (!project) return null;
  if (project.pmProjectId) return { project, pmProjectId: project.pmProjectId };
  try {
    const pool = await ensurePmDb();
    const result = await pool
      .request()
      .input('Code', sql.NVarChar(30), project.code)
      .query(`SELECT TOP 1 CONVERT(nvarchar(36), ProjectId) AS ProjectId FROM pm.Projects WHERE ProjectCode=@Code AND IsDeleted=0`);
    const id = result.recordset[0]?.ProjectId as string | undefined;
    return id ? { project, pmProjectId: id } : { project, pmProjectId: null };
  } catch {
    return { project, pmProjectId: null };
  }
};

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ status: 'error', error: 'Unauthenticated' }, { status: 401 });
  if (!canAccessProjectsEngineeringPortal(session.permissions, session.isGlobalAdmin, session.roles, session.sub)) {
    return NextResponse.json({ status: 'error', error: 'Forbidden' }, { status: 403 });
  }

  const projectKey = request.nextUrl.searchParams.get('projectId');
  const status = request.nextUrl.searchParams.get('status') || 'Pending';
  if (!projectKey) return NextResponse.json({ status: 'error', error: 'projectId is required' }, { status: 400 });
  const resolved = await resolvePmProjectId(projectKey);
  if (!resolved?.project) return NextResponse.json({ status: 'error', error: 'Project not found' }, { status: 404 });
  if (!canAccessProject(session, resolved.project)) {
    return NextResponse.json({ status: 'error', error: 'Forbidden' }, { status: 403 });
  }

  // Phase 2: always expose live timesheet labour queue for the project (HRIS source of truth).
  let liveQueue: unknown[] = [];
  try {
    const { buildProjectManHourUtilization } = await import('@/lib/projects-engineering/man-hour-utilization');
    const utilization = await buildProjectManHourUtilization(resolved.project, { gate: 'all' });
    liveQueue = utilization.labourQueue;
  } catch {
    liveQueue = [];
  }

  if (!resolved.pmProjectId) {
    return NextResponse.json({
      status: 'success',
      data: liveQueue,
      source: 'hris.TimesheetProjectAllocations',
    });
  }

  try {
    const pool = await ensurePmDb();
    const result = await pool
      .request()
      .input('ProjectId', sql.UniqueIdentifier, resolved.pmProjectId)
      .input('Status', sql.NVarChar(30), status)
      .query(`
        SELECT l.LabourValidationId,l.TimesheetLineExternalId,l.EmployeeId,l.WorkDate,l.RegularHours,l.OvertimeHours,
               l.EstimatedLabourCost,l.ProjectManagerApprovalStatus,l.CostValidationStatus,l.ValidationExceptionCode,
               w.WbsCode,cc.CostCode
        FROM pm.LabourCostValidations l
        JOIN pm.WBS w ON w.WbsId=l.WbsId
        JOIN pm.CostCodes cc ON cc.CostCodeId=l.CostCodeId
        WHERE l.ProjectId=@ProjectId AND l.CostValidationStatus=@Status
        ORDER BY l.WorkDate,l.EmployeeId`);
    return NextResponse.json({
      status: 'success',
      data: result.recordset.length ? result.recordset : liveQueue,
      liveQueue,
      source: result.recordset.length ? 'pm.LabourCostValidations' : 'hris.TimesheetProjectAllocations',
    });
  } catch (error) {
    return NextResponse.json({
      status: 'success',
      data: liveQueue,
      liveQueue,
      warning: 'Labour validation tables are not available yet. Showing live timesheet queue.',
      detail: process.env.NODE_ENV === 'development' ? String(error) : undefined,
    });
  }
}

export async function PATCH(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ status: 'error', error: 'Unauthenticated' }, { status: 401 });
  if (!canAccessProjectsEngineeringPortal(session.permissions, session.isGlobalAdmin, session.roles, session.sub)) {
    return NextResponse.json({ status: 'error', error: 'Forbidden' }, { status: 403 });
  }
  if (!canEditProjects(session)) {
    return NextResponse.json({ status: 'error', error: 'Not authorized to validate timesheets.' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = parseLabourValidation(body);
  if (parsed.error || !parsed.data) {
    return NextResponse.json({ status: 'error', error: parsed.error || 'Invalid request' }, { status: 400 });
  }

  const resolved = await resolvePmProjectId(parsed.data.projectId);
  if (!resolved?.project || !resolved.pmProjectId) {
    return NextResponse.json({ status: 'error', error: 'Project / PM profile not found' }, { status: 404 });
  }
  if (!canAccessProject(session, resolved.project)) {
    return NextResponse.json({ status: 'error', error: 'Forbidden' }, { status: 403 });
  }

  try {
    const pool = await ensurePmDb();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    const actor = actorGuid(session);
    try {
      for (const lineId of parsed.data.timesheetLineIds) {
        const cur = await new sql.Request(tx)
          .input('ProjectId', sql.UniqueIdentifier, resolved.pmProjectId)
          .input('LineId', sql.NVarChar(100), lineId)
          .query(`SELECT LabourValidationId,ProjectManagerApprovalStatus,CostValidationStatus FROM pm.LabourCostValidations WITH(UPDLOCK,ROWLOCK) WHERE ProjectId=@ProjectId AND TimesheetLineExternalId=@LineId`);
        const row = cur.recordset[0];
        if (!row) throw new Error(`Timesheet line ${lineId} not found`);
        if (row.ProjectManagerApprovalStatus !== 'Approved') throw new Error(`Timesheet line ${lineId} is not PM-approved`);
        await new sql.Request(tx)
          .input('ProjectId', sql.UniqueIdentifier, resolved.pmProjectId)
          .input('LineId', sql.NVarChar(100), lineId)
          .input('Decision', sql.NVarChar(30), parsed.data.decision)
          .input('Comment', sql.NVarChar(1000), parsed.data.comment ?? null)
          .input('Actor', sql.UniqueIdentifier, actor)
          .query(`UPDATE pm.LabourCostValidations SET CostValidationStatus=@Decision,ValidationComment=@Comment,CostControllerEmployeeId=@Actor,ValidatedAt=SYSUTCDATETIME() WHERE ProjectId=@ProjectId AND TimesheetLineExternalId=@LineId`);
        await new sql.Request(tx)
          .input('ProjectId', sql.UniqueIdentifier, resolved.pmProjectId)
          .input('EntityId', sql.NVarChar(100), String(row.LabourValidationId))
          .input('Actor', sql.UniqueIdentifier, actor)
          .input('Reason', sql.NVarChar(500), parsed.data.comment ?? `Cost validation ${parsed.data.decision}`)
          .query(`INSERT pm.AuditLog(ProjectId,EntityName,EntityId,Action,ActorUserId,ActorEmployeeId,Reason) VALUES(@ProjectId,'LabourCostValidation',@EntityId,'CostValidation',@Actor,@Actor,@Reason)`);
      }
      await tx.commit();
      return NextResponse.json({ status: 'success', ok: true, count: parsed.data.timesheetLineIds.length });
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        error: error instanceof Error ? error.message : 'Timesheet validation failed',
        detail: process.env.NODE_ENV === 'development' ? String(error) : undefined,
      },
      { status: 400 },
    );
  }
}
