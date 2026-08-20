import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sql from 'mssql';
import { getDleEnterpriseDbPool } from '@/lib/dle-enterprise-db';
import { notifyPayrollClarificationComment } from '@/lib/payroll-approval-notification-service';
import { getPayrollRunForPeriod } from '@/lib/payroll-run-store';
import {
  normalizePayrollCommentPeriod,
  type PayrollRunComment,
} from '@/lib/payroll-run-comments';
import type { PayrollSessionRole } from '@/lib/payroll-session';
import { managementPermissions } from '@/lib/payroll-session';
import { payrollJsonMirrorEnabled, payrollSqlRequired, toIso } from '@/lib/payroll-sql-schema';

export type { PayrollRunComment };

const compact = (value: unknown) => String(value || '').trim();
const nowIso = () => new Date().toISOString();

const COMMENTS_TABLE_SQL = `
IF OBJECT_ID(N'[hris].[PayrollRunComments]', N'U') IS NULL
CREATE TABLE [hris].[PayrollRunComments] (
  [comment_id] NVARCHAR(80) NOT NULL PRIMARY KEY,
  [period_code] CHAR(7) NOT NULL,
  [pack] NVARCHAR(20) NULL,
  [actor_code] NVARCHAR(80) NULL,
  [actor_name] NVARCHAR(200) NOT NULL,
  [body] NVARCHAR(MAX) NOT NULL,
  [created_at] DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME()
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_PayrollRunComments_Period' AND object_id = OBJECT_ID(N'[hris].[PayrollRunComments]'))
  CREATE INDEX [IX_PayrollRunComments_Period] ON [hris].[PayrollRunComments] ([period_code], [created_at] ASC);
`;

let commentsTableReady = false;

const resolveDashboardRoot = () => {
  const cwd = process.cwd();
  const dashboardSuffix = path.join('apps', 'dashboard');
  return cwd.endsWith(dashboardSuffix) ? cwd : path.join(cwd, dashboardSuffix);
};

const COMMENTS_PATH = process.env.DLE_PAYROLL_RUN_COMMENTS_PATH
  || path.join(process.env.DLE_HRIS_DATA_DIR || path.join(resolveDashboardRoot(), 'data', 'hris'), 'payroll-run-comments.json');

const ensureCommentsTable = async (pool: sql.ConnectionPool) => {
  if (commentsTableReady) return;
  await pool.request().query(COMMENTS_TABLE_SQL);
  commentsTableReady = true;
};

const mapSqlComment = (row: Record<string, unknown>): PayrollRunComment => ({
  commentId: compact(row.comment_id),
  period: compact(row.period_code),
  actorCode: compact(row.actor_code),
  actorName: compact(row.actor_name) || 'Payroll User',
  body: compact(row.body),
  createdAt: toIso(row.created_at) || nowIso(),
});

const readJsonComments = async (): Promise<PayrollRunComment[]> => {
  try {
    const parsed = JSON.parse(await readFile(COMMENTS_PATH, 'utf8'));
    const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.comments) ? parsed.comments : [];
    return rows
      .map((row: Record<string, unknown>) => ({
        commentId: compact(row.commentId || row.comment_id),
        period: normalizePayrollCommentPeriod(row.period || row.period_code),
        actorCode: compact(row.actorCode || row.actor_code),
        actorName: compact(row.actorName || row.actor_name) || 'Payroll User',
        body: compact(row.body),
        createdAt: compact(row.createdAt || row.created_at) || nowIso(),
      }))
      .filter((row: PayrollRunComment) => row.commentId && row.period && row.body);
  } catch {
    return [];
  }
};

const writeJsonComments = async (comments: PayrollRunComment[]) => {
  await mkdir(path.dirname(COMMENTS_PATH), { recursive: true });
  await writeFile(COMMENTS_PATH, JSON.stringify(comments, null, 2), 'utf8');
};

const periodIsClosed = async (period: string) => {
  const [salaried, dailyRate] = await Promise.all([
    getPayrollRunForPeriod(period, 'salaried').catch(() => null),
    getPayrollRunForPeriod(period, 'daily-rate').catch(() => null),
  ]);
  const statuses = [salaried?.status, dailyRate?.status].filter(Boolean);
  if (!statuses.length) return false;
  return statuses.every((status) => status === 'Closed');
};

export const canCommentOnPayrollPeriod = (input: {
  role: PayrollSessionRole;
  isGlobalAdmin?: boolean;
  closed?: boolean;
}) => {
  const perms = managementPermissions(input.role);
  const canView = input.role !== 'Employee' || Boolean(input.isGlobalAdmin);
  const canWrite = Boolean(input.isGlobalAdmin)
    || perms.canManageRun
    || perms.canApprove
    || ['System Administrator', 'HR Officer', 'Payroll Officer', 'Payroll Supervisor'].includes(input.role);
  return {
    canView,
    canComment: canView && canWrite && input.role !== 'Auditor' && !input.closed,
  };
};

export const listPayrollRunComments = async (period: string): Promise<PayrollRunComment[]> => {
  const periodCode = normalizePayrollCommentPeriod(period);
  if (!periodCode) return [];

  const pool = await getDleEnterpriseDbPool().catch(() => null);
  if (pool) {
    try {
      await ensureCommentsTable(pool);
      const result = await pool.request()
        .input('period_code', sql.Char(7), periodCode)
        .query(`
SELECT TOP (200) [comment_id], [period_code], [actor_code], [actor_name], [body], [created_at]
FROM [hris].[PayrollRunComments]
WHERE [period_code] = @period_code
ORDER BY [created_at] ASC
`);
      const rows = (result.recordset || []).map((row) => mapSqlComment(row as Record<string, unknown>));
      if (rows.length || payrollSqlRequired()) return rows;
    } catch (error) {
      if (payrollSqlRequired()) throw error;
    }
  } else if (payrollSqlRequired()) {
    throw new Error('DLE_Enterprise database connection is unavailable.');
  }

  return (await readJsonComments())
    .filter((row) => row.period === periodCode)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
};

export const addPayrollRunComment = async (input: {
  period: string;
  actor: string;
  actorCode: string;
  body: string;
  baseUrl?: string | null;
}) => {
  const periodCode = normalizePayrollCommentPeriod(input.period);
  if (!periodCode) throw new Error('Payroll period is required.');
  const body = compact(input.body);
  if (body.length < 2) throw new Error('Enter a comment before sending.');
  if (body.length > 4000) throw new Error('Comment must be 4,000 characters or fewer.');

  const comment: PayrollRunComment = {
    commentId: `PRC-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    period: periodCode,
    actorCode: compact(input.actorCode),
    actorName: compact(input.actor) || 'Payroll User',
    body,
    createdAt: nowIso(),
  };

  const pool = await getDleEnterpriseDbPool().catch(() => null);
  if (pool) {
    try {
      await ensureCommentsTable(pool);
      await pool.request()
        .input('comment_id', sql.NVarChar(80), comment.commentId)
        .input('period_code', sql.Char(7), comment.period)
        .input('actor_code', sql.NVarChar(80), comment.actorCode || null)
        .input('actor_name', sql.NVarChar(200), comment.actorName)
        .input('body', sql.NVarChar(sql.MAX), comment.body)
        .query(`
INSERT INTO [hris].[PayrollRunComments]
  ([comment_id], [period_code], [actor_code], [actor_name], [body])
VALUES
  (@comment_id, @period_code, @actor_code, @actor_name, @body)
`);
    } catch (error) {
      if (payrollSqlRequired()) throw error;
      const existing = await readJsonComments();
      await writeJsonComments([...existing, comment]);
    }
  } else if (payrollSqlRequired()) {
    throw new Error('DLE_Enterprise database connection is unavailable.');
  } else {
    const existing = await readJsonComments();
    await writeJsonComments([...existing, comment]);
  }

  if (payrollJsonMirrorEnabled()) {
    const existing = await readJsonComments();
    if (!existing.some((row) => row.commentId === comment.commentId)) {
      await writeJsonComments([...existing, comment]);
    }
  }

  const run = await getPayrollRunForPeriod(periodCode, 'salaried').catch(() => null)
    || await getPayrollRunForPeriod(periodCode, 'daily-rate').catch(() => null);
  await notifyPayrollClarificationComment({
    period: periodCode,
    periodLabel: run?.periodLabel || periodCode,
    actorName: comment.actorName,
    actorCode: comment.actorCode,
    comment: comment.body,
    run,
    baseUrl: input.baseUrl,
  }).catch((error) => console.error('[payroll-comments] notification failed', error));

  return {
    comment,
    comments: await listPayrollRunComments(periodCode),
  };
};

export const payrollCommentAccessForPeriod = async (input: {
  period: string;
  role: PayrollSessionRole;
  isGlobalAdmin?: boolean;
}) => {
  const periodCode = normalizePayrollCommentPeriod(input.period);
  const closed = periodCode ? await periodIsClosed(periodCode) : false;
  return canCommentOnPayrollPeriod({
    role: input.role,
    isGlobalAdmin: input.isGlobalAdmin,
    closed,
  });
};
