/**
 * DLE_Enterprise is the system of record for an applied HR Dayrate Payment Schedule.
 * The uploaded workbook decides that month's wages, so it has to survive page reloads,
 * app restarts and deploys — which a JSON file under the deployed site package does not.
 */
import sql from 'mssql';
import { getDleEnterpriseDbPool } from '@/lib/dle-enterprise-db';
import { ensurePayrollSqlSchema } from '@/lib/payroll-sql-schema';
import {
  primeDayrateScheduleOverrideCache,
  readAppliedDayrateScheduleOverride,
  type DayrateScheduleOverrideRecord,
} from '@/lib/dayrate-schedule-override-read';
import type { DayrateScheduleParseResult, DayrateScheduleRow } from '@/lib/dayrate-schedule-xlsx';

const compact = (value: unknown) => String(value || '').trim();
const num = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const ROW_COLUMNS: Array<[keyof DayrateScheduleRow, string]> = [
  ['excelDailyRate', 'excel_daily_rate'],
  ['weekdayDays', 'weekday_days'],
  ['weekdayOvtHours', 'weekday_ovt_hours'],
  ['saturdayHours', 'saturday_hours'],
  ['sundayHours', 'sunday_hours'],
  ['publicHolidayHours', 'public_holiday_hours'],
  ['nightDays', 'night_days'],
  ['nightAmt', 'night_amt'],
  ['mealAllowance', 'meal_allowance'],
  ['transport', 'transport'],
  ['siteAllowance', 'site_allowance'],
  ['tcmMeal', 'tcm_meal'],
  ['tcmTransport', 'tcm_transport'],
  ['arrears', 'arrears'],
  ['excelGross', 'excel_gross'],
  ['excelNet', 'excel_net'],
];

const parseJson = <T>(value: unknown, fallback: T): T => {
  const text = compact(value);
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
};

export const dayrateScheduleUploadId = (period: string) =>
  `dayrate-${period}-${Date.now().toString(36)}`;

/**
 * Replace the active upload for a period. The previous one is kept and marked
 * superseded so an approved run can always be traced back to the sheet it used.
 */
export const saveDayrateScheduleUploadToSql = async (input: {
  period: string;
  fileName: string;
  title: string;
  appliedAt: string;
  appliedBy: string;
  rows: DayrateScheduleRow[];
  skipped: DayrateScheduleParseResult['skipped'];
  sheets: DayrateScheduleParseResult['sheets'];
  workbook?: Buffer | null;
}) => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new Error('DLE_Enterprise is unavailable — the dayrate schedule cannot be stored.');
  await ensurePayrollSqlSchema(pool);

  const uploadId = dayrateScheduleUploadId(input.period);
  const grossPay = input.rows.reduce((sum, row) => sum + num(row.excelGross), 0);
  const netPay = input.rows.reduce((sum, row) => sum + num(row.excelNet), 0);

  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    await new sql.Request(transaction)
      .input('period_code', sql.Char(7), input.period)
      .input('upload_id', sql.NVarChar(80), uploadId)
      .query(`
        UPDATE [hris].[DayrateScheduleUploads]
        SET is_active = 0, superseded_at = SYSUTCDATETIME(), superseded_by_upload_id = @upload_id
        WHERE period_code = @period_code AND is_active = 1
      `);

    await new sql.Request(transaction)
      .input('upload_id', sql.NVarChar(80), uploadId)
      .input('period_code', sql.Char(7), input.period)
      .input('file_name', sql.NVarChar(400), compact(input.fileName) || 'dayrate-payment-schedule.xlsx')
      .input('title', sql.NVarChar(400), compact(input.title) || null)
      .input('applied_at', sql.DateTime2, new Date(input.appliedAt || new Date().toISOString()))
      .input('applied_by', sql.NVarChar(128), compact(input.appliedBy) || 'HR')
      .input('row_count', sql.Int, input.rows.length)
      .input('gross_pay', sql.Decimal(19, 4), grossPay)
      .input('net_pay', sql.Decimal(19, 4), netPay)
      .input('sheets_json', sql.NVarChar(sql.MAX), JSON.stringify(input.sheets || []))
      .input('skipped_json', sql.NVarChar(sql.MAX), JSON.stringify(input.skipped || []))
      .input('workbook', sql.VarBinary(sql.MAX), input.workbook || null)
      .query(`
        INSERT INTO [hris].[DayrateScheduleUploads]
          (upload_id, period_code, file_name, title, applied_at, applied_by, is_active, row_count, gross_pay, net_pay, sheets_json, skipped_json, workbook)
        VALUES
          (@upload_id, @period_code, @file_name, @title, @applied_at, @applied_by, 1, @row_count, @gross_pay, @net_pay, @sheets_json, @skipped_json, @workbook)
      `);

    for (const [index, row] of input.rows.entries()) {
      const request = new sql.Request(transaction)
        .input('upload_id', sql.NVarChar(80), uploadId)
        .input('row_no', sql.Int, index + 1)
        .input('period_code', sql.Char(7), input.period)
        .input('employee_code', sql.NVarChar(80), compact(row.employeeCode))
        .input('employee_name', sql.NVarChar(200), compact(row.employeeName) || null)
        .input('first_name', sql.NVarChar(120), compact(row.firstName) || null)
        .input('last_name', sql.NVarChar(120), compact(row.lastName) || null)
        .input('job_title', sql.NVarChar(200), compact(row.jobTitle) || null)
        .input('location', sql.NVarChar(200), compact(row.location) || null)
        .input('company', sql.NVarChar(20), compact(row.company) || null);
      for (const [key, column] of ROW_COLUMNS) {
        request.input(column, sql.Decimal(19, 4), num(row[key]));
      }
      await request.query(`
        INSERT INTO [hris].[DayrateScheduleUploadRows]
          (upload_id, row_no, period_code, employee_code, employee_name, first_name, last_name, job_title, location, company,
           ${ROW_COLUMNS.map(([, column]) => column).join(', ')})
        VALUES
          (@upload_id, @row_no, @period_code, @employee_code, @employee_name, @first_name, @last_name, @job_title, @location, @company,
           ${ROW_COLUMNS.map(([, column]) => `@${column}`).join(', ')})
      `);
    }

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  return { uploadId, rowCount: input.rows.length, grossPay, netPay };
};

/** Withdraw the period's upload so wages fall back to timesheets deliberately. */
export const deactivateDayrateScheduleUploadsInSql = async (period: string) => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) return;
  await ensurePayrollSqlSchema(pool);
  await pool.request()
    .input('period_code', sql.Char(7), period)
    .query(`
      UPDATE [hris].[DayrateScheduleUploads]
      SET is_active = 0, superseded_at = SYSUTCDATETIME()
      WHERE period_code = @period_code AND is_active = 1
    `);
};

export const readActiveDayrateScheduleUploadFromSql = async (
  period: string,
): Promise<DayrateScheduleOverrideRecord | null> => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) return null;
  await ensurePayrollSqlSchema(pool);

  const header = await pool.request()
    .input('period_code', sql.Char(7), period)
    .query(`
      SELECT TOP 1 upload_id, period_code, file_name, title, applied_at, applied_by, sheets_json, skipped_json
      FROM [hris].[DayrateScheduleUploads]
      WHERE period_code = @period_code AND is_active = 1
      ORDER BY applied_at DESC
    `);
  const record = header.recordset[0];
  if (!record) return null;

  const rowsResult = await pool.request()
    .input('upload_id', sql.NVarChar(80), String(record.upload_id))
    .query(`
      SELECT employee_code, employee_name, first_name, last_name, job_title, location, company,
        ${ROW_COLUMNS.map(([, column]) => column).join(', ')}
      FROM [hris].[DayrateScheduleUploadRows]
      WHERE upload_id = @upload_id
      ORDER BY row_no ASC
    `);

  const rows: DayrateScheduleRow[] = rowsResult.recordset.map((row) => {
    const mapped = {
      employeeCode: compact(row.employee_code),
      employeeName: compact(row.employee_name),
      firstName: compact(row.first_name),
      lastName: compact(row.last_name),
      jobTitle: compact(row.job_title),
      location: compact(row.location),
      company: (compact(row.company) === 'DLPC' ? 'DLPC' : 'DLE') as DayrateScheduleRow['company'],
    } as DayrateScheduleRow;
    for (const [key, column] of ROW_COLUMNS) {
      (mapped as unknown as Record<string, number>)[key as string] = num(row[column]);
    }
    return mapped;
  });

  return {
    period: compact(record.period_code),
    fileName: compact(record.file_name),
    title: compact(record.title),
    appliedAt: record.applied_at instanceof Date ? record.applied_at.toISOString() : String(record.applied_at || ''),
    appliedBy: compact(record.applied_by),
    rows,
    skipped: parseJson<DayrateScheduleParseResult['skipped']>(record.skipped_json, []),
    sheets: parseJson<DayrateScheduleParseResult['sheets']>(record.sheets_json, []),
  };
};

/**
 * Load the period's stored upload into the engine's synchronous cache. Called at the
 * start of a payroll calculation so every employee costed in that pass sees the same
 * uploaded sheet.
 */
export const ensureDayrateScheduleOverrideLoaded = async (period: string) => {
  try {
    const record = await readActiveDayrateScheduleUploadFromSql(period);
    primeDayrateScheduleOverrideCache(period, record);
    return record;
  } catch (error) {
    console.error('[dayrate-schedule] unable to load the stored upload for', period, error);
    return null;
  }
};

/**
 * Refuse to move a period through the workflow when its stored upload cannot be
 * seen by the engine. Every workflow step re-snapshots a live calculation, so
 * proceeding here would freeze timesheet-only figures into the approved run.
 */
export const assertStoredDayrateScheduleVisible = async (period: string) => {
  const normalized = String(period || '').replace(/\//g, '-').replace(/^per-/i, '').slice(0, 7);
  if (!normalized) return;
  if (!(await dayrateScheduleUploadExistsInSql(normalized))) return;
  if (readAppliedDayrateScheduleOverride(normalized)) return;
  throw new Error(
    `The uploaded dayrate payment schedule for ${normalized} is stored but could not be loaded, so wages would be computed from timesheets instead of the uploaded sheet. Resolve the database connection and retry before submitting or approving.`,
  );
};

/** True when the period has a stored upload, regardless of whether it loaded. */
export const dayrateScheduleUploadExistsInSql = async (period: string) => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) return false;
  await ensurePayrollSqlSchema(pool);
  const result = await pool.request()
    .input('period_code', sql.Char(7), period)
    .query(`
      SELECT COUNT(1) AS upload_count
      FROM [hris].[DayrateScheduleUploads]
      WHERE period_code = @period_code AND is_active = 1
    `);
  return num(result.recordset[0]?.upload_count) > 0;
};
