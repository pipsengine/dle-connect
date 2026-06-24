import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sql from 'mssql';
import { getDleEnterpriseDbPool } from '@/lib/dle-enterprise-db';
import { ACTIVE_PAYROLL_PERIOD, NEXT_PAYROLL_PERIOD } from '@/lib/payroll-periods';
import {
  ensurePayrollSqlSchema,
  payrollJsonMirrorEnabled,
  payrollSqlRequired,
  readPayrollSetting,
  toIso,
  writePayrollSetting,
} from '@/lib/payroll-sql-schema';

export type PayrollPeriodStatus = 'Draft' | 'Open' | 'In Progress' | 'Closed' | 'Reopened';

export type PayrollPeriodRecord = {
  period: string;
  periodLabel: string;
  status: PayrollPeriodStatus;
  paymentDate: string | null;
  openedAt: string | null;
  openedBy: string | null;
  closedAt: string | null;
  closedBy: string | null;
  reopenedAt: string | null;
  reopenedBy: string | null;
  reopenReason: string | null;
  createdAt: string;
  updatedAt: string;
};

type PayrollPeriodState = {
  activePeriod: string;
  periods: PayrollPeriodRecord[];
};

const ACTIVE_PERIOD_KEY = 'active_payroll_period';
const resolveDashboardRoot = () => {
  const cwd = process.cwd();
  const dashboardSuffix = path.join('apps', 'dashboard');
  return cwd.endsWith(dashboardSuffix) ? cwd : path.join(cwd, dashboardSuffix);
};

const STORE_PATH = path.join(resolveDashboardRoot(), 'data', 'hris', 'payroll-periods.json');
const nowIso = () => new Date().toISOString();

export const payrollPeriodLabel = (period: string) => {
  const [year, month] = period.split('-').map(Number);
  return new Date(Date.UTC(year || new Date().getUTCFullYear(), (month || 1) - 1, 1)).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
};

const defaultPeriod = (period: string, status: PayrollPeriodStatus = 'Open'): PayrollPeriodRecord => {
  const stamp = nowIso();
  return {
    period,
    periodLabel: payrollPeriodLabel(period),
    status,
    paymentDate: null,
    openedAt: status === 'Open' ? stamp : null,
    openedBy: status === 'Open' ? 'System' : null,
    closedAt: null,
    closedBy: null,
    reopenedAt: null,
    reopenedBy: null,
    reopenReason: null,
    createdAt: stamp,
    updatedAt: stamp,
  };
};

const seedState = (): PayrollPeriodState => {
  const active = process.env.HRIS_ACTIVE_PAYROLL_PERIOD || ACTIVE_PAYROLL_PERIOD;
  const next = process.env.HRIS_NEXT_PAYROLL_PERIOD || NEXT_PAYROLL_PERIOD;
  const seeded = [active, next].filter(Boolean);
  return {
    activePeriod: active,
    periods: seeded.map((period, index) => defaultPeriod(period, index === 0 ? 'Open' : 'Draft')),
  };
};

const rowToPeriod = (row: Record<string, unknown>): PayrollPeriodRecord => ({
  period: String(row.period_code || '').trim(),
  periodLabel: String(row.period_label || payrollPeriodLabel(String(row.period_code || ''))),
  status: String(row.period_status || 'Draft') as PayrollPeriodStatus,
  paymentDate: row.payment_date ? String(row.payment_date).slice(0, 10) : null,
  openedAt: toIso(row.opened_at),
  openedBy: row.opened_by ? String(row.opened_by) : null,
  closedAt: toIso(row.closed_at),
  closedBy: row.closed_by ? String(row.closed_by) : null,
  reopenedAt: toIso(row.reopened_at),
  reopenedBy: row.reopened_by ? String(row.reopened_by) : null,
  reopenReason: row.reopen_reason ? String(row.reopen_reason) : null,
  createdAt: toIso(row.created_at) || nowIso(),
  updatedAt: toIso(row.updated_at) || nowIso(),
});

const persistPeriodToSql = async (record: PayrollPeriodRecord) => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new Error('DLE_Enterprise database connection is unavailable.');
  await ensurePayrollSqlSchema(pool);
  await pool.request()
    .input('period_code', sql.Char(7), record.period)
    .input('period_label', sql.NVarChar(80), record.periodLabel)
    .input('period_status', sql.NVarChar(40), record.status)
    .input('payment_date', sql.Date, record.paymentDate || null)
    .input('opened_at', sql.DateTime2, record.openedAt ? new Date(record.openedAt) : null)
    .input('opened_by', sql.NVarChar(128), record.openedBy || null)
    .input('closed_at', sql.DateTime2, record.closedAt ? new Date(record.closedAt) : null)
    .input('closed_by', sql.NVarChar(128), record.closedBy || null)
    .input('reopened_at', sql.DateTime2, record.reopenedAt ? new Date(record.reopenedAt) : null)
    .input('reopened_by', sql.NVarChar(128), record.reopenedBy || null)
    .input('reopen_reason', sql.NVarChar(500), record.reopenReason || null)
    .query(`
      MERGE [hris].[PayrollPeriods] AS target
      USING (SELECT @period_code AS period_code) AS source
      ON target.period_code = source.period_code
      WHEN MATCHED THEN UPDATE SET
        period_label = @period_label, period_status = @period_status, payment_date = @payment_date,
        opened_at = @opened_at, opened_by = @opened_by, closed_at = @closed_at, closed_by = @closed_by,
        reopened_at = @reopened_at, reopened_by = @reopened_by, reopen_reason = @reopen_reason,
        updated_at = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN INSERT (
        period_code, period_label, period_status, payment_date, opened_at, opened_by, closed_at, closed_by,
        reopened_at, reopened_by, reopen_reason
      ) VALUES (
        @period_code, @period_label, @period_status, @payment_date, @opened_at, @opened_by, @closed_at, @closed_by,
        @reopened_at, @reopened_by, @reopen_reason
      );
    `);
};

const readStateFromJson = async (): Promise<PayrollPeriodState> => {
  try {
    await access(STORE_PATH);
    const parsed = JSON.parse(await readFile(STORE_PATH, 'utf8')) as PayrollPeriodState;
    if (!parsed?.activePeriod || !Array.isArray(parsed.periods)) return seedState();
    return parsed;
  } catch {
    return seedState();
  }
};

const writeStateToJson = async (state: PayrollPeriodState) => {
  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(state, null, 2), 'utf8');
};

const readStateFromSql = async (): Promise<PayrollPeriodState | null> => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) return null;
  await ensurePayrollSqlSchema(pool);

  const [periodsResult, activePeriod] = await Promise.all([
    pool.request().query(`SELECT * FROM [hris].[PayrollPeriods] ORDER BY period_code DESC`),
    readPayrollSetting(pool, ACTIVE_PERIOD_KEY),
  ]);

  const periods = periodsResult.recordset.map((row) => rowToPeriod(row as Record<string, unknown>));
  if (!periods.length && !activePeriod) return null;

  const active = activePeriod || periods.find((item) => item.status === 'Open')?.period || process.env.HRIS_ACTIVE_PAYROLL_PERIOD || ACTIVE_PAYROLL_PERIOD;
  return { activePeriod: active, periods: periods.length ? periods : seedState().periods };
};

const writeState = async (state: PayrollPeriodState) => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) {
    if (payrollSqlRequired()) {
      throw new Error('Payroll period control requires DLE_Enterprise on 192.168.5.5. Unable to save payroll period.');
    }
    await writeStateToJson(state);
    process.env.HRIS_ACTIVE_PAYROLL_PERIOD = state.activePeriod;
    return;
  }

  await ensurePayrollSqlSchema(pool);
  for (const record of state.periods) await persistPeriodToSql(record);
  await writePayrollSetting(pool, ACTIVE_PERIOD_KEY, state.activePeriod);
  process.env.HRIS_ACTIVE_PAYROLL_PERIOD = state.activePeriod;
  if (payrollJsonMirrorEnabled()) await writeStateToJson(state);
};

const readState = async (): Promise<PayrollPeriodState> => {
  let sqlState = await readStateFromSql();
  const jsonState = await readStateFromJson();

  if (!sqlState || sqlState.periods.length === 0) {
    const seed = jsonState.periods.length ? jsonState : seedState();
    if (await getDleEnterpriseDbPool()) {
      await writeState(seed).catch((error) => {
        console.warn('[PayrollPeriodStore] Seed to SQL skipped:', error instanceof Error ? error.message : error);
      });
      sqlState = await readStateFromSql();
    }
  }

  if (sqlState && sqlState.periods.length > 0) return sqlState;
  if (payrollSqlRequired()) {
    throw new Error('Payroll period control requires DLE_Enterprise on 192.168.5.5. Database connection failed.');
  }
  return jsonState.periods.length ? jsonState : seedState();
};

export const readPayrollPeriodState = async () => readState();

export const getActivePayrollPeriod = async () => {
  const pool = await getDleEnterpriseDbPool();
  if (pool) {
    await ensurePayrollSqlSchema(pool);
    const active = await readPayrollSetting(pool, ACTIVE_PERIOD_KEY);
    if (active) {
      process.env.HRIS_ACTIVE_PAYROLL_PERIOD = active;
      return active;
    }
  }
  const state = await readState();
  return state.activePeriod;
};

export const listPayrollPeriods = async () => {
  const state = await readState();
  return {
    activePeriod: state.activePeriod,
    periods: [...state.periods].sort((a, b) => b.period.localeCompare(a.period)),
  };
};

export const ensurePayrollPeriod = async (period: string, actor = 'System') => {
  const state = await readState();
  const existing = state.periods.find((item) => item.period === period);
  if (existing) return existing;
  const created = defaultPeriod(period, 'Draft');
  created.openedBy = actor;
  state.periods.unshift(created);
  await writeState(state);
  return created;
};

export const openPayrollPeriod = async (period: string, actor: string) => {
  const state = await readState();
  const stamp = nowIso();
  for (const item of state.periods) {
    if (item.period === period) continue;
    if (item.status === 'Open' || item.status === 'In Progress' || item.status === 'Reopened') {
      item.status = 'Closed';
      item.closedAt = item.closedAt || stamp;
      item.closedBy = item.closedBy || actor;
      item.updatedAt = stamp;
    }
  }
  let record = state.periods.find((item) => item.period === period);
  if (!record) {
    record = defaultPeriod(period, 'Open');
    state.periods.unshift(record);
  }
  record.status = 'Open';
  record.openedAt = stamp;
  record.openedBy = actor;
  record.closedAt = null;
  record.closedBy = null;
  record.updatedAt = stamp;
  state.activePeriod = period;
  await writeState(state);
  return record;
};

export const activatePayrollPeriod = async (period: string, actor: string) => {
  await ensurePayrollPeriod(period, actor);
  return openPayrollPeriod(period, actor);
};

export const closePayrollPeriodRecord = async (period: string, actor: string, reason?: string) => {
  const state = await readState();
  const stamp = nowIso();
  const record = state.periods.find((item) => item.period === period) || defaultPeriod(period, 'Closed');
  if (!state.periods.find((item) => item.period === period)) state.periods.unshift(record);
  record.status = 'Closed';
  record.closedAt = stamp;
  record.closedBy = actor;
  record.reopenReason = reason || null;
  record.updatedAt = stamp;
  await writeState(state);
  return record;
};

export const reopenPayrollPeriodRecord = async (period: string, actor: string, reason: string) => {
  const state = await readState();
  const record = state.periods.find((item) => item.period === period);
  if (!record) throw new Error('Payroll period not found.');
  if (record.status !== 'Closed') throw new Error('Only closed payroll periods can be reopened.');
  const stamp = nowIso();
  record.status = 'Reopened';
  record.reopenedAt = stamp;
  record.reopenedBy = actor;
  record.reopenReason = reason;
  record.updatedAt = stamp;
  state.activePeriod = period;
  await writeState(state);
  return record;
};

export const createPayrollPeriod = async (period: string, actor: string, paymentDate?: string | null) => {
  const state = await readState();
  if (state.periods.some((item) => item.period === period)) {
    throw new Error(`Payroll period ${period} already exists.`);
  }
  const stamp = nowIso();
  const record: PayrollPeriodRecord = {
    ...defaultPeriod(period, 'Draft'),
    paymentDate: paymentDate || null,
    openedBy: actor,
    updatedAt: stamp,
  };
  state.periods.unshift(record);
  await writeState(state);
  return record;
};
