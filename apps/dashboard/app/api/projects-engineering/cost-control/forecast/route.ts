import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { withResolvedAccess } from '@/lib/auth/resolve-access-session';
import {
  canAccessProject,
  canAccessProjectsEngineeringPortal,
  canEditProjects,
} from '@/lib/access/projects-engineering-access';
import { parseForecastSubmission } from '@/lib/projects-engineering/cost-control';
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

export async function POST(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ status: 'error', error: 'Unauthenticated' }, { status: 401 });
  if (!canAccessProjectsEngineeringPortal(session.permissions, session.isGlobalAdmin, session.roles, session.sub)) {
    return NextResponse.json({ status: 'error', error: 'Forbidden' }, { status: 403 });
  }
  if (!canEditProjects(session)) {
    return NextResponse.json({ status: 'error', error: 'Not authorized to submit forecasts.' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = parseForecastSubmission(body);
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
      const baseline = await new sql.Request(tx)
        .input('ProjectId', sql.UniqueIdentifier, resolved.pmProjectId)
        .query(`SELECT TOP 1 CostBaselineId FROM pm.CostBaselines WHERE ProjectId=@ProjectId AND Status='Approved' ORDER BY VersionNo DESC`);
      if (!baseline.recordset[0]) throw new Error('No approved cost baseline exists');

      const ins = await new sql.Request(tx)
        .input('ProjectId', sql.UniqueIdentifier, resolved.pmProjectId)
        .input('Period', sql.Char(7), parsed.data.periodCode)
        .input('Baseline', sql.UniqueIdentifier, baseline.recordset[0].CostBaselineId)
        .input('Actor', sql.UniqueIdentifier, actor)
        .query(`INSERT pm.CostForecastPeriods(ProjectId,PeriodCode,DataDate,BaselineId,Status,CreatedBy) OUTPUT inserted.ForecastPeriodId VALUES(@ProjectId,@Period,EOMONTH(CONVERT(date,@Period+'-01')),@Baseline,'Draft',@Actor)`);
      const id = ins.recordset[0].ForecastPeriodId;

      for (const line of parsed.data.lines) {
        await new sql.Request(tx)
          .input('PeriodId', sql.UniqueIdentifier, id)
          .input('CA', sql.UniqueIdentifier, line.controlAccountId)
          .input('Actual', sql.Decimal(19, 4), line.actualToDate)
          .input('Commit', sql.Decimal(19, 4), line.openCommitment)
          .input('ETC', sql.Decimal(19, 4), line.uncommittedETC)
          .input('Risk', sql.Decimal(19, 4), line.riskAllowance ?? 0)
          .input('Basis', sql.NVarChar(1000), line.forecastBasis)
          .query(`INSERT pm.CostForecastLines(ForecastPeriodId,ControlAccountId,ActualToDate,OpenCommitment,UncommittedETC,RiskAllowance,ForecastBasis) VALUES(@PeriodId,@CA,@Actual,@Commit,@ETC,@Risk,@Basis)`);
      }

      await new sql.Request(tx)
        .input('ProjectId', sql.UniqueIdentifier, resolved.pmProjectId)
        .input('EntityId', sql.NVarChar(100), String(id))
        .input('Actor', sql.UniqueIdentifier, actor)
        .query(`INSERT pm.AuditLog(ProjectId,EntityName,EntityId,Action,ActorUserId,ActorEmployeeId,Reason) VALUES(@ProjectId,'CostForecastPeriod',@EntityId,'Create',@Actor,@Actor,'Monthly bottom-up forecast created')`);

      await tx.commit();
      return NextResponse.json({ status: 'success', ok: true, forecastPeriodId: id }, { status: 201 });
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        error: error instanceof Error ? error.message : 'Forecast creation failed',
        detail: process.env.NODE_ENV === 'development' ? String(error) : undefined,
      },
      { status: 400 },
    );
  }
}
