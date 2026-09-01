/**
 * DLE_Enterprise is the system of record for an applied August salaried schedule.
 * Later periods without an upload fall back to HRIS payroll setup (the ongoing authority).
 */
import sql from 'mssql';
import { getDleEnterpriseDbPool } from '@/lib/dle-enterprise-db';
import { ensurePayrollSqlSchema } from '@/lib/payroll-sql-schema';
import type { SalaryScheduleParseResult, SalaryScheduleRow } from '@/lib/salary-schedule-xlsx';

const compact = (value: unknown) => String(value || '').trim();
const num = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export type SalaryScheduleUploadRecord = {
  period: string;
  fileName: string;
  title: string;
  appliedAt: string;
  appliedBy: string;
  parsed: SalaryScheduleParseResult;
};

const cache = new Map<string, SalaryScheduleUploadRecord | null>();

export const primeSalaryScheduleUploadCache = (period: string | undefined, record: SalaryScheduleUploadRecord | null) => {
  const normalized = compact(period).replace(/\//g, '-').slice(0, 7);
  if (!normalized) return;
  if (!record) {
    cache.delete(normalized);
    return;
  }
  cache.set(normalized, record);
};

export const readAppliedSalaryScheduleOverride = (period?: string) => {
  const normalized = compact(period).replace(/\//g, '-').slice(0, 7);
  if (!normalized) return null;
  return cache.get(normalized) || null;
};

export const saveSalaryScheduleUploadToSql = async (input: {
  period: string;
  fileName: string;
  title: string;
  appliedAt: string;
  appliedBy: string;
  parsed: SalaryScheduleParseResult;
  workbook?: Buffer | null;
}) => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new Error('DLE_Enterprise is unavailable — the salary schedule cannot be stored.');
  await ensurePayrollSqlSchema(pool);

  const uploadId = `salary-${input.period}-${Date.now().toString(36)}`;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    await new sql.Request(transaction)
      .input('period_code', sql.Char(7), input.period)
      .input('upload_id', sql.NVarChar(80), uploadId)
      .query(`
        UPDATE [hris].[SalaryScheduleUploads]
        SET is_active = 0, superseded_at = SYSUTCDATETIME(), superseded_by_upload_id = @upload_id
        WHERE period_code = @period_code AND is_active = 1
      `);

    await new sql.Request(transaction)
      .input('upload_id', sql.NVarChar(80), uploadId)
      .input('period_code', sql.Char(7), input.period)
      .input('file_name', sql.NVarChar(400), compact(input.fileName) || 'salary-schedule.xlsx')
      .input('title', sql.NVarChar(400), compact(input.title) || null)
      .input('applied_at', sql.DateTime2, new Date(input.appliedAt || new Date().toISOString()))
      .input('applied_by', sql.NVarChar(128), compact(input.appliedBy) || 'HR')
      .input('perm_count', sql.Int, input.parsed.summary.permCount)
      .input('cont_count', sql.Int, input.parsed.summary.contCount)
      .input('usd_count', sql.Int, input.parsed.summary.usdCount)
      .input('ngn_gross', sql.Decimal(19, 4), input.parsed.summary.permGross + input.parsed.summary.contGross)
      .input('ngn_net', sql.Decimal(19, 4), input.parsed.summary.permNet + input.parsed.summary.contNet)
      .input('usd_gross', sql.Decimal(19, 4), input.parsed.summary.usdGross)
      .input('usd_net', sql.Decimal(19, 4), input.parsed.summary.usdNet)
      .input('payload_json', sql.NVarChar(sql.MAX), JSON.stringify(input.parsed))
      .input('workbook', sql.VarBinary(sql.MAX), input.workbook || null)
      .query(`
        INSERT INTO [hris].[SalaryScheduleUploads]
          (upload_id, period_code, file_name, title, applied_at, applied_by, is_active,
           perm_count, cont_count, usd_count, ngn_gross, ngn_net, usd_gross, usd_net, payload_json, workbook)
        VALUES
          (@upload_id, @period_code, @file_name, @title, @applied_at, @applied_by, 1,
           @perm_count, @cont_count, @usd_count, @ngn_gross, @ngn_net, @usd_gross, @usd_net, @payload_json, @workbook)
      `);
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  const record: SalaryScheduleUploadRecord = {
    period: input.period,
    fileName: compact(input.fileName),
    title: compact(input.title),
    appliedAt: input.appliedAt,
    appliedBy: input.appliedBy,
    parsed: input.parsed,
  };
  primeSalaryScheduleUploadCache(input.period, record);
  return { uploadId, record };
};

export const readActiveSalaryScheduleUploadFromSql = async (period: string): Promise<SalaryScheduleUploadRecord | null> => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) return null;
  await ensurePayrollSqlSchema(pool);
  const result = await pool.request()
    .input('period_code', sql.Char(7), period)
    .query(`
      SELECT TOP 1 period_code, file_name, title, applied_at, applied_by, payload_json
      FROM [hris].[SalaryScheduleUploads]
      WHERE period_code = @period_code AND is_active = 1
      ORDER BY applied_at DESC
    `);
  const row = result.recordset[0];
  if (!row) return null;
  let parsed: SalaryScheduleParseResult;
  try {
    parsed = JSON.parse(String(row.payload_json || '')) as SalaryScheduleParseResult;
  } catch {
    return null;
  }
  if (!parsed?.rows?.length) return null;
  return {
    period: compact(row.period_code),
    fileName: compact(row.file_name),
    title: compact(row.title),
    appliedAt: row.applied_at instanceof Date ? row.applied_at.toISOString() : String(row.applied_at || ''),
    appliedBy: compact(row.applied_by),
    parsed,
  };
};

export const ensureSalaryScheduleOverrideLoaded = async (period: string) => {
  try {
    const record = await readActiveSalaryScheduleUploadFromSql(period);
    primeSalaryScheduleUploadCache(period, record);
    return record;
  } catch (error) {
    console.error('[salary-schedule] unable to load the stored upload for', period, error);
    return null;
  }
};

export const assertStoredSalaryScheduleVisible = async (period: string) => {
  const normalized = String(period || '').replace(/\//g, '-').replace(/^per-/i, '').slice(0, 7);
  if (!normalized) return;
  if (!(await salaryScheduleUploadExistsInSql(normalized))) return;
  if (readAppliedSalaryScheduleOverride(normalized)) return;
  throw new Error(
    `The uploaded salary schedule for ${normalized} is stored but could not be loaded, so salaried payroll would be computed from HRIS setup instead of the uploaded sheet. Resolve the database connection and retry before submitting or approving.`,
  );
};

export const salaryScheduleUploadExistsInSql = async (period: string) => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) return false;
  await ensurePayrollSqlSchema(pool);
  const result = await pool.request()
    .input('period_code', sql.Char(7), period)
    .query(`
      SELECT COUNT(1) AS upload_count
      FROM [hris].[SalaryScheduleUploads]
      WHERE period_code = @period_code AND is_active = 1
    `);
  return num(result.recordset[0]?.upload_count) > 0;
};

export const excelRowCurrency = (row: SalaryScheduleRow): 'USD' | 'NGN' => (row.kind === 'usd' ? 'USD' : 'NGN');
