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
