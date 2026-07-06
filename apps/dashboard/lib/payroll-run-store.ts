import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sql from 'mssql';
import { getDleEnterpriseDbPool } from '@/lib/dle-enterprise-db';
import { invalidateEssPortalCache } from '@/lib/ess-portal-cache';
import type { PayrollCalculationRecord } from '@/lib/payroll-calculation-service';
import { ensurePayrollSqlSchema, payrollJsonMirrorEnabled, payrollSqlRequired, toIso } from '@/lib/payroll-sql-schema';

export type UnifiedPayrollRunStatus =
  | 'Draft'
  | 'Open'
  | 'Validation'
  | 'Validated'
  | 'Calculated'
  | 'Computed'
  | 'Ready for Approval'
  | 'Submitted'
  | 'Under Review'
  | 'Finance Approved'
  | 'CFO Approved'
  | 'HR Approved'
  | 'Approved'
  | 'Released'
  | 'Rejected'
  | 'Revision Requested'
  | 'Locked'
  | 'Posted'
  | 'Published'
  | 'Closed'
  | 'Reopened'
  | 'Cancelled';

export type PayrollRunArtifact = {
  id: string;
  type: 'payslips' | 'bank-schedule' | 'statutory-schedules' | 'journal' | 'export';
  label: string;
  fileName: string | null;
  generatedAt: string;
  generatedBy: string;
  meta?: Record<string, unknown>;
};

export type PayrollRunAuditEntry = {
  id: string;
  at: string;
  user: string;
  role: string;
  action: string;
  record: string;
  oldValue?: string | null;
  newValue?: string | null;
  reason?: string | null;
  comment?: string | null;
  ip?: string | null;
};

export type PayrollRunSnapshot = {
  capturedAt: string;
  capturedBy: string;
  action: string;
  summary: Record<string, unknown>;
  records: PayrollCalculationRecord[];
};

export type UnifiedPayrollRun = {
  id: string;
  period: string;
  periodLabel: string;
  status: UnifiedPayrollRunStatus;
  employeeCount: number;
  grossPay: number;
  deductions: number;
  netPay: number;
  employerCost: number;
  exceptionCount: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  validatedAt?: string | null;
  validatedBy?: string | null;
  submittedAt?: string | null;
  submittedBy?: string | null;
  hrReviewedAt?: string | null;
  hrReviewedBy?: string | null;
  financeReviewedAt?: string | null;
  financeReviewedBy?: string | null;
  cfoReviewedAt?: string | null;
  cfoReviewedBy?: string | null;
  approvedAt?: string | null;
  approvedBy?: string | null;
  releasedAt?: string | null;
  releasedBy?: string | null;
  lockedAt?: string | null;
  payslipsGeneratedAt?: string | null;
  payslipsGeneratedBy?: string | null;
  bankScheduleGeneratedAt?: string | null;
  bankScheduleGeneratedBy?: string | null;
  statutorySchedulesGeneratedAt?: string | null;
  statutorySchedulesGeneratedBy?: string | null;
  postedAt?: string | null;
  postedBy?: string | null;
  closedAt?: string | null;
  reopenedAt?: string | null;
  reopenedBy?: string | null;
  reopenReason?: string | null;
  latestSnapshotAt?: string | null;
  artifacts: PayrollRunArtifact[];
  audit: PayrollRunAuditEntry[];
};

type PayrollRunStoreState = {
  runs: UnifiedPayrollRun[];
  audit: PayrollRunAuditEntry[];
  snapshots: Record<string, PayrollRunSnapshot>;
};

const resolveDashboardRoot = () => {
  const cwd = process.cwd();
  const dashboardSuffix = path.join('apps', 'dashboard');
  return cwd.endsWith(dashboardSuffix) ? cwd : path.join(cwd, dashboardSuffix);
};

const STORE_PATH = path.join(resolveDashboardRoot(), 'data', 'hris', 'payroll-runs.json');
const LEGACY_PROCESSING_PATH = path.join(resolveDashboardRoot(), 'data', 'hris', 'payroll-processing-runs.json');
const nowIso = () => new Date().toISOString();
const newId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

const emptyState = (): PayrollRunStoreState => ({ runs: [], audit: [], snapshots: {} });

const defaultRun = (run: Partial<UnifiedPayrollRun> & Pick<UnifiedPayrollRun, 'id' | 'period' | 'periodLabel'>): UnifiedPayrollRun => ({
  status: 'Draft',
  employeeCount: 0,
  grossPay: 0,
  deductions: 0,
  netPay: 0,
  employerCost: 0,
  exceptionCount: 0,
  createdAt: nowIso(),
  createdBy: 'System',
  updatedAt: nowIso(),
  updatedBy: 'System',
  artifacts: [],
  audit: [],
  ...run,
});

const parseRunJson = (raw: string): UnifiedPayrollRun | null => {
  try {
    const parsed = JSON.parse(raw) as UnifiedPayrollRun;
    if (!parsed?.id || !parsed?.period) return null;
    return defaultRun({
      ...parsed,
      artifacts: Array.isArray(parsed.artifacts) ? parsed.artifacts : [],
      audit: Array.isArray(parsed.audit) ? parsed.audit : [],
    });
  } catch {
    return null;
  }
};

const migrateLegacyRun = (legacy: any): UnifiedPayrollRun => {
  const stamp = legacy.updatedAt || legacy.createdAt || nowIso();
  return defaultRun({
    id: legacy.id || `payroll-${legacy.period}`,
    period: legacy.period,
    periodLabel: legacy.periodLabel || legacy.period,
    status: (legacy.status || 'Draft') as UnifiedPayrollRunStatus,
    employeeCount: Number(legacy.employeeCount || 0),
    grossPay: Number(legacy.grossPay || 0),
    deductions: Number(legacy.totalDeductions || legacy.deductions || 0),
    netPay: Number(legacy.netPay || 0),
    employerCost: Number(legacy.employerCost || 0),
    exceptionCount: Number(legacy.exceptionCount || 0),
    createdAt: legacy.createdAt || stamp,
    createdBy: legacy.createdBy || 'Legacy Import',
    updatedAt: stamp,
    updatedBy: legacy.updatedBy || legacy.createdBy || 'Legacy Import',
    audit: Array.isArray(legacy.audit)
      ? legacy.audit.map((item: any) => ({
          id: newId('aud'),
          at: item.at || stamp,
          user: item.actor || item.performedBy || 'Legacy Import',
          role: item.actor || 'Legacy Import',
          action: item.action || 'legacy-import',
          record: legacy.id,
          oldValue: item.from || null,
          newValue: item.to || null,
          reason: item.note || null,
        }))
      : [],
  });
};

const readStateFromJson = async (): Promise<PayrollRunStoreState> => {
  try {
    await access(STORE_PATH);
    const parsed = JSON.parse(await readFile(STORE_PATH, 'utf8')) as PayrollRunStoreState;
    return {
      runs: Array.isArray(parsed.runs) ? parsed.runs : [],
      audit: Array.isArray(parsed.audit) ? parsed.audit : [],
      snapshots: parsed.snapshots && typeof parsed.snapshots === 'object' ? parsed.snapshots : {},
    };
  } catch {
    try {
      await access(LEGACY_PROCESSING_PATH);
      const legacy = JSON.parse(await readFile(LEGACY_PROCESSING_PATH, 'utf8'));
      const runs = Array.isArray(legacy) ? legacy.map(migrateLegacyRun) : [];
      return { runs, audit: runs.flatMap((run) => run.audit), snapshots: {} };
    } catch {
      return emptyState();
    }
  }
};

const writeStateToJson = async (state: PayrollRunStoreState) => {
  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(state, null, 2), 'utf8');
};

const persistRunToSql = async (run: UnifiedPayrollRun) => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new Error('DLE_Enterprise database connection is unavailable.');
  await ensurePayrollSqlSchema(pool);
  await pool.request()
    .input('run_id', sql.NVarChar(80), run.id)
    .input('period_code', sql.Char(7), run.period)
    .input('run_status', sql.NVarChar(40), run.status)
    .input('employee_count', sql.Int, run.employeeCount)
    .input('gross_pay', sql.Decimal(19, 4), run.grossPay)
    .input('deductions', sql.Decimal(19, 4), run.deductions)
    .input('net_pay', sql.Decimal(19, 4), run.netPay)
    .input('employer_cost', sql.Decimal(19, 4), run.employerCost)
    .input('exception_count', sql.Int, run.exceptionCount)
    .input('run_json', sql.NVarChar(sql.MAX), JSON.stringify(run))
    .query(`
      MERGE [hris].[PayrollRuns] AS target
      USING (SELECT @run_id AS run_id) AS source
      ON target.run_id = source.run_id
      WHEN MATCHED THEN UPDATE SET
        period_code = @period_code,
        run_status = @run_status,
        employee_count = @employee_count,
        gross_pay = @gross_pay,
        deductions = @deductions,
        net_pay = @net_pay,
        employer_cost = @employer_cost,
        exception_count = @exception_count,
        run_json = @run_json,
        modified_at = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN INSERT (
        run_id, period_code, run_status, employee_count, gross_pay, deductions, net_pay, employer_cost, exception_count, run_json
      ) VALUES (
        @run_id, @period_code, @run_status, @employee_count, @gross_pay, @deductions, @net_pay, @employer_cost, @exception_count, @run_json
      );
    `);
};

const persistAuditToSql = async (entry: PayrollRunAuditEntry) => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new Error('DLE_Enterprise database connection is unavailable.');
  await ensurePayrollSqlSchema(pool);
  await pool.request()
    .input('audit_id', sql.NVarChar(80), entry.id)
    .input('run_id', sql.NVarChar(80), entry.record.startsWith('payroll-') ? entry.record : null)
    .input('record_ref', sql.NVarChar(120), entry.record)
    .input('at', sql.DateTime2, new Date(entry.at))
    .input('user_name', sql.NVarChar(128), entry.user)
    .input('role_name', sql.NVarChar(80), entry.role)
    .input('action', sql.NVarChar(120), entry.action)
    .input('old_value', sql.NVarChar(400), entry.oldValue || null)
    .input('new_value', sql.NVarChar(400), entry.newValue || null)
    .input('reason', sql.NVarChar(500), entry.reason || null)
    .input('comment', sql.NVarChar(1000), entry.comment || null)
    .input('ip_address', sql.NVarChar(64), entry.ip || null)
    .query(`
      MERGE [hris].[PayrollRunAudit] AS target
      USING (SELECT @audit_id AS audit_id) AS source
      ON target.audit_id = source.audit_id
      WHEN MATCHED THEN UPDATE SET
        run_id = @run_id, record_ref = @record_ref, [at] = @at, user_name = @user_name, role_name = @role_name,
        action = @action, old_value = @old_value, new_value = @new_value, reason = @reason, comment = @comment, ip_address = @ip_address
      WHEN NOT MATCHED THEN INSERT (
        audit_id, run_id, record_ref, [at], user_name, role_name, action, old_value, new_value, reason, comment, ip_address
      ) VALUES (
        @audit_id, @run_id, @record_ref, @at, @user_name, @role_name, @action, @old_value, @new_value, @reason, @comment, @ip_address
      );
    `);
};

const persistSnapshotToSql = async (runId: string, snapshot: PayrollRunSnapshot) => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new Error('DLE_Enterprise database connection is unavailable.');
  await ensurePayrollSqlSchema(pool);
  await pool.request()
    .input('run_id', sql.NVarChar(80), runId)
    .input('captured_at', sql.DateTime2, new Date(snapshot.capturedAt))
    .input('captured_by', sql.NVarChar(128), snapshot.capturedBy)
    .input('action', sql.NVarChar(80), snapshot.action)
    .input('snapshot_json', sql.NVarChar(sql.MAX), JSON.stringify(snapshot))
    .query(`
      MERGE [hris].[PayrollRunSnapshots] AS target
      USING (SELECT @run_id AS run_id) AS source
      ON target.run_id = source.run_id
      WHEN MATCHED THEN UPDATE SET
        captured_at = @captured_at, captured_by = @captured_by, action = @action, snapshot_json = @snapshot_json
      WHEN NOT MATCHED THEN INSERT (run_id, captured_at, captured_by, action, snapshot_json)
      VALUES (@run_id, @captured_at, @captured_by, @action, @snapshot_json);
    `);
};

const readStateFromSql = async (): Promise<PayrollRunStoreState | null> => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) return null;
  await ensurePayrollSqlSchema(pool);

  const [runsResult, auditResult, snapshotsResult] = await Promise.all([
    pool.request().query(`SELECT run_json FROM [hris].[PayrollRuns] ORDER BY modified_at DESC`),
    pool.request().query(`SELECT TOP (500) * FROM [hris].[PayrollRunAudit] ORDER BY [at] DESC`),
    pool.request().query(`SELECT run_id, snapshot_json FROM [hris].[PayrollRunSnapshots]`),
  ]);

  const runs = runsResult.recordset
    .map((row) => parseRunJson(String(row.run_json || '')))
    .filter((run): run is UnifiedPayrollRun => Boolean(run));

  const audit: PayrollRunAuditEntry[] = auditResult.recordset.map((row) => ({
    id: String(row.audit_id),
    at: toIso(row.at) || nowIso(),
    user: String(row.user_name || ''),
    role: String(row.role_name || ''),
    action: String(row.action || ''),
    record: String(row.record_ref || row.run_id || ''),
    oldValue: row.old_value ? String(row.old_value) : null,
    newValue: row.new_value ? String(row.new_value) : null,
    reason: row.reason ? String(row.reason) : null,
    comment: row.comment ? String(row.comment) : null,
    ip: row.ip_address ? String(row.ip_address) : null,
  }));

  const snapshots: Record<string, PayrollRunSnapshot> = {};
  for (const row of snapshotsResult.recordset) {
    try {
      const snapshot = JSON.parse(String(row.snapshot_json || '')) as PayrollRunSnapshot;
      if (snapshot?.capturedAt) snapshots[String(row.run_id)] = snapshot;
    } catch {
      // ignore corrupt snapshot rows
    }
  }

  return { runs, audit, snapshots };
};

const migrateJsonToSql = async (state: PayrollRunStoreState) => {
  for (const run of state.runs) await persistRunToSql(run);
  for (const entry of state.audit.slice(0, 500)) await persistAuditToSql(entry);
  for (const [runId, snapshot] of Object.entries(state.snapshots)) await persistSnapshotToSql(runId, snapshot);
};

const readState = async (): Promise<PayrollRunStoreState> => {
  const sqlState = await readStateFromSql();
  if (sqlState && sqlState.runs.length > 0) return sqlState;

  const jsonState = await readStateFromJson();
  if (sqlState && sqlState.runs.length === 0 && jsonState.runs.length > 0) {
    await migrateJsonToSql(jsonState).catch((error) => {
      console.warn('[PayrollRunStore] JSON to SQL migration skipped:', error instanceof Error ? error.message : error);
    });
    const migrated = await readStateFromSql();
    if (migrated && migrated.runs.length > 0) return migrated;
  }

  if (sqlState) return sqlState;
  if (payrollSqlRequired()) {
    throw new Error('Payroll processing requires DLE_Enterprise on 192.168.5.5. Database connection failed or payroll tables are empty.');
  }
  return jsonState;
};

const writeState = async (state: PayrollRunStoreState) => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) {
    if (payrollSqlRequired()) {
      throw new Error('Payroll processing requires DLE_Enterprise on 192.168.5.5. Unable to save payroll run.');
    }
    await writeStateToJson(state);
    return;
  }

  await ensurePayrollSqlSchema(pool);
  for (const run of state.runs) await persistRunToSql(run);
  if (payrollJsonMirrorEnabled()) await writeStateToJson(state);
};

export const listPayrollRuns = async () => {
  const state = await readState();
  return [...state.runs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
};

export const PAYROLL_ESS_RELEASED_STATUSES: UnifiedPayrollRunStatus[] = ['Released', 'Locked', 'Posted', 'Published', 'Closed'];

export const isPayrollRunReleasedForEmployeeAccess = (run: UnifiedPayrollRun | null | undefined) => {
  if (!run) return false;
  if (run.releasedAt) return true;
  return PAYROLL_ESS_RELEASED_STATUSES.includes(run.status);
};

export const listEmployeeAccessiblePayrollPeriods = async (limit = 24) => {
  const runs = await listPayrollRuns();
  const seen = new Set<string>();
  const periods: string[] = [];
  for (const run of runs) {
    if (!isPayrollRunReleasedForEmployeeAccess(run)) continue;
    if (!run.period || seen.has(run.period)) continue;
    seen.add(run.period);
    periods.push(run.period);
  }
  return periods.sort((a, b) => b.localeCompare(a)).slice(0, limit);
};

export const getPayrollRun = async (runId: string) => {
  const pool = await getDleEnterpriseDbPool();
  if (pool) {
    await ensurePayrollSqlSchema(pool);
    const result = await pool.request()
      .input('run_id', sql.NVarChar(80), runId)
      .query(`SELECT run_json FROM [hris].[PayrollRuns] WHERE run_id = @run_id`);
    const run = parseRunJson(String(result.recordset[0]?.run_json || ''));
    if (run) return run;
  }
  const state = await readState();
  return state.runs.find((run) => run.id === runId) || null;
};

export const getPayrollRunForPeriod = async (period: string) => {
  const pool = await getDleEnterpriseDbPool();
  if (pool) {
    await ensurePayrollSqlSchema(pool);
    const result = await pool.request()
      .input('period_code', sql.Char(7), period)
      .query(`SELECT TOP (1) run_json FROM [hris].[PayrollRuns] WHERE period_code = @period_code ORDER BY modified_at DESC`);
    const run = parseRunJson(String(result.recordset[0]?.run_json || ''));
    if (run) return run;
  }
  const state = await readState();
  return state.runs.find((run) => run.period === period) || null;
};

export const getLatestPayrollRun = async () => {
  const runs = await listPayrollRuns();
  return runs[0] || null;
};

export const ensurePayrollRun = async (period: string, periodLabel: string, actor: string) => {
  const existing = await getPayrollRunForPeriod(period);
  if (existing) return existing;

  const stamp = nowIso();
  const run = defaultRun({
    id: `payroll-${period}`,
    period,
    periodLabel,
    status: 'Draft',
    createdAt: stamp,
    createdBy: actor,
    updatedAt: stamp,
    updatedBy: actor,
  });
  await persistRunToSql(run);
  if (payrollJsonMirrorEnabled()) {
    const state = await readStateFromJson();
    state.runs.unshift(run);
    await writeStateToJson(state);
  }
  return run;
};

export const savePayrollRun = async (run: UnifiedPayrollRun) => {
  const next = { ...run, updatedAt: nowIso() };
  await persistRunToSql(next);
  if (payrollJsonMirrorEnabled()) {
    const state = await readStateFromJson();
    const index = state.runs.findIndex((item) => item.id === next.id || item.period === next.period);
    if (index >= 0) state.runs[index] = next;
    else state.runs.unshift(next);
    await writeStateToJson(state);
  }
  return next;
};

export const appendPayrollAudit = async (entry: Omit<PayrollRunAuditEntry, 'id' | 'at'> & { at?: string }) => {
  const row: PayrollRunAuditEntry = {
    id: newId('aud'),
    at: entry.at || nowIso(),
    ...entry,
  };
  await persistAuditToSql(row);

  const run = (await getPayrollRun(row.record)) || (await getPayrollRunForPeriod(row.record.replace(/^payroll-/, '')));
  if (run) {
    run.audit = [row, ...(run.audit || [])].slice(0, 100);
    run.updatedAt = row.at;
    await savePayrollRun(run);
  }

  if (payrollJsonMirrorEnabled()) {
    const state = await readStateFromJson();
    state.audit.unshift(row);
    if (state.audit.length > 500) state.audit.length = 500;
    await writeStateToJson(state);
  }
  return row;
};

export const capturePayrollSnapshot = async (runId: string, action: string, actor: string, summary: Record<string, unknown>, records: PayrollCalculationRecord[]) => {
  const snapshot: PayrollRunSnapshot = {
    capturedAt: nowIso(),
    capturedBy: actor,
    action,
    summary,
    records,
  };
  await persistSnapshotToSql(runId, snapshot);
  invalidateEssPortalCache();

  const run = await getPayrollRun(runId);
  if (run) {
    run.latestSnapshotAt = snapshot.capturedAt;
    await savePayrollRun(run);
  }

  if (payrollJsonMirrorEnabled()) {
    const state = await readStateFromJson();
    state.snapshots[runId] = snapshot;
    await writeStateToJson(state);
  }
  return snapshot;
};

export const readPayrollSnapshot = async (runId: string) => {
  const pool = await getDleEnterpriseDbPool();
  if (pool) {
    await ensurePayrollSqlSchema(pool);
    const result = await pool.request()
      .input('run_id', sql.NVarChar(80), runId)
      .query(`SELECT snapshot_json FROM [hris].[PayrollRunSnapshots] WHERE run_id = @run_id`);
    if (result.recordset[0]?.snapshot_json) {
      return JSON.parse(String(result.recordset[0].snapshot_json)) as PayrollRunSnapshot;
    }
  }
  const state = await readState();
  return state.snapshots[runId] || null;
};

const sanitizePayrollPeriodCode = (period: string) => (/^\d{4}-\d{2}$/.test(String(period || '').trim()) ? String(period).trim() : '');

export const readPayrollSnapshotsByPeriods = async (periods: string[]) => {
  const safePeriods = Array.from(new Set(periods.map(sanitizePayrollPeriodCode).filter(Boolean)));
  const snapshots = new Map<string, PayrollRunSnapshot>();
  if (!safePeriods.length) return snapshots;

  const pool = await getDleEnterpriseDbPool();
  if (pool) {
    await ensurePayrollSqlSchema(pool);
    const periodList = safePeriods.map((period) => `'${period.replace(/'/g, "''")}'`).join(', ');
    const result = await pool.request().query(`
      SELECT r.period_code, s.snapshot_json
      FROM [hris].[PayrollRuns] r
      INNER JOIN [hris].[PayrollRunSnapshots] s
        ON s.run_id = r.run_id
      WHERE r.period_code IN (${periodList})
    `);
    for (const row of result.recordset || []) {
      const period = String(row.period_code || '').trim();
      if (!period) continue;
      try {
        snapshots.set(period, JSON.parse(String(row.snapshot_json || '')) as PayrollRunSnapshot);
      } catch {
        continue;
      }
    }
    return snapshots;
  }

  const state = await readState();
  for (const period of safePeriods) {
    const run = state.runs.find((item) => item.period === period);
    if (run && state.snapshots[run.id]) snapshots.set(period, state.snapshots[run.id]);
  }
  return snapshots;
};

export const appendPayrollArtifact = async (
  runId: string,
  artifact: Omit<PayrollRunArtifact, 'id' | 'generatedAt'> & { generatedAt?: string },
) => {
  const run = await getPayrollRun(runId);
  if (!run) throw new Error('Payroll run not found.');
  const row: PayrollRunArtifact = {
    id: newId('artifact'),
    generatedAt: artifact.generatedAt || nowIso(),
    ...artifact,
  };
  run.artifacts = [row, ...(run.artifacts || [])];
  run.updatedAt = row.generatedAt;
  return savePayrollRun(run);
};

export const listPayrollAudit = async (limit = 200) => {
  const pool = await getDleEnterpriseDbPool();
  if (pool) {
    await ensurePayrollSqlSchema(pool);
    const result = await pool.request()
      .input('limit', sql.Int, limit)
      .query(`SELECT TOP (@limit) * FROM [hris].[PayrollRunAudit] ORDER BY [at] DESC`);
    return result.recordset.map((row) => ({
      id: String(row.audit_id),
      at: toIso(row.at) || nowIso(),
      user: String(row.user_name || ''),
      role: String(row.role_name || ''),
      action: String(row.action || ''),
      record: String(row.record_ref || row.run_id || ''),
      oldValue: row.old_value ? String(row.old_value) : null,
      newValue: row.new_value ? String(row.new_value) : null,
      reason: row.reason ? String(row.reason) : null,
      comment: row.comment ? String(row.comment) : null,
      ip: row.ip_address ? String(row.ip_address) : null,
    }));
  }
  const state = await readState();
  return state.audit.slice(0, limit);
};
