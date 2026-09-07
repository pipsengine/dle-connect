import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { withResolvedAccess } from '@/lib/auth/resolve-access-session';
import {
  canAccessProject,
  canAccessProjectsEngineeringPortal,
  canEditProjects,
} from '@/lib/access/projects-engineering-access';
import { ensurePmDb, sql } from '@/lib/projects-engineering/db';
import { parseBudgetCheck } from '@/lib/projects-engineering/cost-control';
import { getProjectById } from '@/lib/projects-engineering/project-store';
import { createHash } from 'crypto';

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
  if (!projectKey) return NextResponse.json({ status: 'error', error: 'projectId is required' }, { status: 400 });
  const resolved = await resolvePmProjectId(projectKey);
  if (!resolved?.project) return NextResponse.json({ status: 'error', error: 'Project not found' }, { status: 404 });
  if (!canAccessProject(session, resolved.project)) {
    return NextResponse.json({ status: 'error', error: 'Forbidden' }, { status: 403 });
  }
  if (!resolved.pmProjectId) {
    return NextResponse.json({ status: 'success', data: [] });
  }

  try {
    const pool = await ensurePmDb();
    const result = await pool.request().input('ProjectId', sql.UniqueIdentifier, resolved.pmProjectId).query(`
      SELECT c.CommitmentId,c.ReferenceNo,c.CommitmentType,c.Description,c.VendorName,c.CommittedValue,c.InvoicedValue,
             c.Currency,c.RequiredDate,c.BudgetCheckStatus,c.Status,cc.CostCode,cb.CbsCode
      FROM pm.Commitments c
      JOIN pm.CostCodes cc ON cc.CostCodeId=c.CostCodeId
      JOIN pm.CBS cb ON cb.CbsId=cc.CbsId
      WHERE c.ProjectId=@ProjectId
      ORDER BY c.ModifiedAt DESC`);
    return NextResponse.json({ status: 'success', data: result.recordset });
  } catch (error) {
    return NextResponse.json({
      status: 'success',
      data: [],
      warning: 'Cost control commitment tables are not available yet. Apply database/pm/003_cost_control_schema.sql.',
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
    return NextResponse.json({ status: 'error', error: 'Not authorized to validate commitments.' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = parseBudgetCheck(body);
  if (parsed.error || !parsed.data) {
    return NextResponse.json({ status: 'error', error: parsed.error || 'Invalid request' }, { status: 400 });
  }

  const resolved = await resolvePmProjectId(parsed.data.projectId);
  if (!resolved?.project || !resolved.pmProjectId) {
    return NextResponse.json({ status: 'error', error: 'Project / PM profile not found for budget check' }, { status: 404 });
  }
  if (!canAccessProject(session, resolved.project)) {
    return NextResponse.json({ status: 'error', error: 'Forbidden' }, { status: 403 });
  }

  try {
    const pool = await ensurePmDb();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      const cur = await new sql.Request(tx)
        .input('Id', sql.UniqueIdentifier, parsed.data.commitmentId)
        .input('ProjectId', sql.UniqueIdentifier, resolved.pmProjectId)
        .query(`SELECT * FROM pm.Commitments WITH (UPDLOCK, ROWLOCK) WHERE CommitmentId=@Id AND ProjectId=@ProjectId`);
      if (!cur.recordset[0]) {
        await tx.rollback();
        return NextResponse.json({ status: 'error', error: 'Commitment not found' }, { status: 404 });
      }
      const before = JSON.stringify(cur.recordset[0]);
      const actor = actorGuid(session);
      await new sql.Request(tx)
        .input('Id', sql.UniqueIdentifier, parsed.data.commitmentId)
        .input('Decision', sql.NVarChar(30), parsed.data.decision)
        .input('Actor', sql.UniqueIdentifier, actor)
        .input('Comment', sql.NVarChar(1000), parsed.data.comment ?? null)
        .query(`UPDATE pm.Commitments SET BudgetCheckStatus=@Decision,BudgetCheckBy=@Actor,BudgetCheckAt=SYSUTCDATETIME(),BudgetCheckComment=@Comment,ModifiedAt=SYSUTCDATETIME() WHERE CommitmentId=@Id`);
      await new sql.Request(tx)
        .input('ProjectId', sql.UniqueIdentifier, resolved.pmProjectId)
        .input('EntityId', sql.NVarChar(100), parsed.data.commitmentId)
        .input('Actor', sql.UniqueIdentifier, actor)
        .input('Before', sql.NVarChar(sql.MAX), before)
        .input('After', sql.NVarChar(sql.MAX), JSON.stringify({ BudgetCheckStatus: parsed.data.decision, comment: parsed.data.comment }))
        .query(`INSERT pm.AuditLog(ProjectId,EntityName,EntityId,Action,ActorUserId,ActorEmployeeId,BeforeJson,AfterJson,Reason) VALUES(@ProjectId,'Commitment',@EntityId,'BudgetCheck',@Actor,@Actor,@Before,@After,'Cost Control budget validation')`);
      await tx.commit();
      return NextResponse.json({ status: 'success', ok: true });
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        error: 'Budget check failed. Ensure cost-control schema is applied.',
        detail: process.env.NODE_ENV === 'development' ? String(error) : undefined,
      },
      { status: 400 },
    );
  }
}
