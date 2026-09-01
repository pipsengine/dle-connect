import sql from 'mssql';
import type { ConnectionPool } from 'mssql';

const ENSURE_SCHEMA_SQL = `
IF OBJECT_ID(N'[hris].[PayrollRuns]', N'U') IS NULL
CREATE TABLE [hris].[PayrollRuns] (
  [run_id] NVARCHAR(80) NOT NULL PRIMARY KEY,
  [period_code] CHAR(7) NOT NULL,
  [run_status] NVARCHAR(40) NOT NULL,
  [employee_count] INT NOT NULL DEFAULT (0),
  [gross_pay] DECIMAL(19, 4) NOT NULL DEFAULT (0),
  [deductions] DECIMAL(19, 4) NOT NULL DEFAULT (0),
  [net_pay] DECIMAL(19, 4) NOT NULL DEFAULT (0),
  [employer_cost] DECIMAL(19, 4) NOT NULL DEFAULT (0),
  [exception_count] INT NOT NULL DEFAULT (0),
  [run_json] NVARCHAR(MAX) NOT NULL,
  [created_at] DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
  [modified_at] DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME()
);
IF OBJECT_ID(N'[hris].[PayrollPeriods]', N'U') IS NULL
CREATE TABLE [hris].[PayrollPeriods] (
  [period_code] CHAR(7) NOT NULL PRIMARY KEY,
  [period_label] NVARCHAR(80) NOT NULL,
  [period_status] NVARCHAR(40) NOT NULL,
  [payment_date] DATE NULL,
  [opened_at] DATETIME2(3) NULL,
  [opened_by] NVARCHAR(128) NULL,
  [closed_at] DATETIME2(3) NULL,
  [closed_by] NVARCHAR(128) NULL,
  [reopened_at] DATETIME2(3) NULL,
  [reopened_by] NVARCHAR(128) NULL,
  [reopen_reason] NVARCHAR(500) NULL,
  [created_at] DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
  [updated_at] DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME()
);
IF OBJECT_ID(N'[hris].[PayrollSettings]', N'U') IS NULL
CREATE TABLE [hris].[PayrollSettings] (
  [setting_key] NVARCHAR(80) NOT NULL PRIMARY KEY,
  [setting_value] NVARCHAR(400) NOT NULL,
  [updated_at] DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME()
);
IF OBJECT_ID(N'[hris].[PayrollRunAudit]', N'U') IS NULL
CREATE TABLE [hris].[PayrollRunAudit] (
  [audit_id] NVARCHAR(80) NOT NULL PRIMARY KEY,
  [run_id] NVARCHAR(80) NULL,
  [record_ref] NVARCHAR(120) NULL,
  [at] DATETIME2(3) NOT NULL,
  [user_name] NVARCHAR(128) NOT NULL,
  [role_name] NVARCHAR(80) NOT NULL,
  [action] NVARCHAR(120) NOT NULL,
  [old_value] NVARCHAR(400) NULL,
  [new_value] NVARCHAR(400) NULL,
  [reason] NVARCHAR(500) NULL,
  [comment] NVARCHAR(1000) NULL,
  [ip_address] NVARCHAR(64) NULL
);
IF OBJECT_ID(N'[hris].[PayrollRunSnapshots]', N'U') IS NULL
CREATE TABLE [hris].[PayrollRunSnapshots] (
  [run_id] NVARCHAR(80) NOT NULL PRIMARY KEY,
  [captured_at] DATETIME2(3) NOT NULL,
  [captured_by] NVARCHAR(128) NOT NULL,
  [action] NVARCHAR(80) NOT NULL,
  [snapshot_json] NVARCHAR(MAX) NOT NULL
);
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
IF OBJECT_ID(N'[hris].[DayrateScheduleUploads]', N'U') IS NULL
CREATE TABLE [hris].[DayrateScheduleUploads] (
  [upload_id] NVARCHAR(80) NOT NULL PRIMARY KEY,
  [period_code] CHAR(7) NOT NULL,
  [file_name] NVARCHAR(400) NOT NULL,
  [title] NVARCHAR(400) NULL,
  [applied_at] DATETIME2(3) NOT NULL,
  [applied_by] NVARCHAR(128) NOT NULL,
  [is_active] BIT NOT NULL DEFAULT (1),
  [superseded_at] DATETIME2(3) NULL,
  [superseded_by_upload_id] NVARCHAR(80) NULL,
  [row_count] INT NOT NULL DEFAULT (0),
  [gross_pay] DECIMAL(19, 4) NOT NULL DEFAULT (0),
  [net_pay] DECIMAL(19, 4) NOT NULL DEFAULT (0),
  [sheets_json] NVARCHAR(MAX) NULL,
  [skipped_json] NVARCHAR(MAX) NULL,
  [workbook] VARBINARY(MAX) NULL,
  [created_at] DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME()
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_DayrateScheduleUploads_Period' AND object_id = OBJECT_ID(N'[hris].[DayrateScheduleUploads]'))
  CREATE INDEX [IX_DayrateScheduleUploads_Period] ON [hris].[DayrateScheduleUploads] ([period_code], [is_active], [applied_at] DESC);
IF OBJECT_ID(N'[hris].[DayrateScheduleUploadRows]', N'U') IS NULL
CREATE TABLE [hris].[DayrateScheduleUploadRows] (
  [upload_id] NVARCHAR(80) NOT NULL,
  [row_no] INT NOT NULL,
  [period_code] CHAR(7) NOT NULL,
  [employee_code] NVARCHAR(80) NOT NULL,
  [employee_name] NVARCHAR(200) NULL,
  [first_name] NVARCHAR(120) NULL,
  [last_name] NVARCHAR(120) NULL,
  [job_title] NVARCHAR(200) NULL,
  [location] NVARCHAR(200) NULL,
  [company] NVARCHAR(20) NULL,
  [excel_daily_rate] DECIMAL(19, 4) NOT NULL DEFAULT (0),
  [weekday_days] DECIMAL(9, 2) NOT NULL DEFAULT (0),
  [weekday_ovt_hours] DECIMAL(9, 2) NOT NULL DEFAULT (0),
  [saturday_hours] DECIMAL(9, 2) NOT NULL DEFAULT (0),
  [sunday_hours] DECIMAL(9, 2) NOT NULL DEFAULT (0),
  [public_holiday_hours] DECIMAL(9, 2) NOT NULL DEFAULT (0),
  [night_days] DECIMAL(9, 2) NOT NULL DEFAULT (0),
  [night_amt] DECIMAL(19, 4) NOT NULL DEFAULT (0),
  [meal_allowance] DECIMAL(19, 4) NOT NULL DEFAULT (0),
  [transport] DECIMAL(19, 4) NOT NULL DEFAULT (0),
  [site_allowance] DECIMAL(19, 4) NOT NULL DEFAULT (0),
  [tcm_meal] DECIMAL(19, 4) NOT NULL DEFAULT (0),
  [tcm_transport] DECIMAL(19, 4) NOT NULL DEFAULT (0),
  [arrears] DECIMAL(19, 4) NOT NULL DEFAULT (0),
  [excel_gross] DECIMAL(19, 4) NOT NULL DEFAULT (0),
  [excel_net] DECIMAL(19, 4) NOT NULL DEFAULT (0),
  CONSTRAINT [PK_DayrateScheduleUploadRows] PRIMARY KEY ([upload_id], [row_no])
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_DayrateScheduleUploadRows_Upload' AND object_id = OBJECT_ID(N'[hris].[DayrateScheduleUploadRows]'))
  CREATE INDEX [IX_DayrateScheduleUploadRows_Upload] ON [hris].[DayrateScheduleUploadRows] ([upload_id], [employee_code]);
IF OBJECT_ID(N'[hris].[SalaryScheduleUploads]', N'U') IS NULL
CREATE TABLE [hris].[SalaryScheduleUploads] (
  [upload_id] NVARCHAR(80) NOT NULL PRIMARY KEY,
  [period_code] CHAR(7) NOT NULL,
  [file_name] NVARCHAR(400) NOT NULL,
  [title] NVARCHAR(400) NULL,
  [applied_at] DATETIME2(3) NOT NULL,
  [applied_by] NVARCHAR(128) NOT NULL,
  [is_active] BIT NOT NULL DEFAULT (1),
  [superseded_at] DATETIME2(3) NULL,
  [superseded_by_upload_id] NVARCHAR(80) NULL,
  [perm_count] INT NOT NULL DEFAULT (0),
  [cont_count] INT NOT NULL DEFAULT (0),
  [usd_count] INT NOT NULL DEFAULT (0),
  [ngn_gross] DECIMAL(19, 4) NOT NULL DEFAULT (0),
  [ngn_net] DECIMAL(19, 4) NOT NULL DEFAULT (0),
  [usd_gross] DECIMAL(19, 4) NOT NULL DEFAULT (0),
  [usd_net] DECIMAL(19, 4) NOT NULL DEFAULT (0),
  [payload_json] NVARCHAR(MAX) NOT NULL,
  [workbook] VARBINARY(MAX) NULL,
  [created_at] DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME()
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_SalaryScheduleUploads_Period' AND object_id = OBJECT_ID(N'[hris].[SalaryScheduleUploads]'))
  CREATE INDEX [IX_SalaryScheduleUploads_Period] ON [hris].[SalaryScheduleUploads] ([period_code], [is_active], [applied_at] DESC);
`;

let schemaReady = false;

export const payrollSqlRequired = () => {
  const explicit = process.env.HRIS_PAYROLL_REQUIRE_SQL;
  if (explicit === 'false') return false;
  if (explicit === 'true') return true;
  return process.env.HRIS_REQUIRE_DB_EMPLOYEE_SOURCE !== 'false';
};

export const payrollJsonMirrorEnabled = () => process.env.HRIS_PAYROLL_JSON_MIRROR === 'true';

export const ensurePayrollSqlSchema = async (pool: ConnectionPool) => {
  if (schemaReady) return;
  await pool.request().query(ENSURE_SCHEMA_SQL);
  schemaReady = true;
};

export const toIso = (value: unknown) => {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const text = String(value);
  return Number.isNaN(Date.parse(text)) ? text : new Date(text).toISOString();
};

export const readPayrollSetting = async (pool: ConnectionPool, key: string) => {
  const result = await pool.request()
    .input('setting_key', sql.NVarChar(80), key)
    .query(`SELECT setting_value FROM [hris].[PayrollSettings] WHERE setting_key = @setting_key`);
  return result.recordset[0]?.setting_value ? String(result.recordset[0].setting_value) : null;
};

export const writePayrollSetting = async (pool: ConnectionPool, key: string, value: string) => {
  await pool.request()
    .input('setting_key', sql.NVarChar(80), key)
    .input('setting_value', sql.NVarChar(400), value)
    .query(`
      MERGE [hris].[PayrollSettings] AS target
      USING (SELECT @setting_key AS setting_key) AS source
      ON target.setting_key = source.setting_key
      WHEN MATCHED THEN UPDATE SET setting_value = @setting_value, updated_at = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN INSERT (setting_key, setting_value) VALUES (@setting_key, @setting_value);
    `);
};
