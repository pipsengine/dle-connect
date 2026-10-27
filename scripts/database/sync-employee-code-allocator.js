const fs = require('node:fs');
const path = require('node:path');
const sql = require('mssql');

for (const file of [
  path.join(process.cwd(), 'deployment', 'iis', 'site', 'apps', 'dashboard', '.env'),
  path.join(process.cwd(), 'apps', 'dashboard', '.env.local'),
  path.join(process.cwd(), 'apps', 'dashboard', '.env'),
]) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m || process.env[m[1]]) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}

(async () => {
  const pool = await sql.connect({
    server: process.env.DLE_ENTERPRISE_DB_HOST,
    database: process.env.DLE_ENTERPRISE_DB_NAME,
    user: process.env.DLE_ENTERPRISE_DB_USER,
    password: process.env.DLE_ENTERPRISE_DB_PASSWORD,
    options: {
      encrypt: String(process.env.DLE_ENTERPRISE_DB_ENCRYPT || 'true').toLowerCase() === 'true',
      trustServerCertificate: true,
    },
  });

  await pool.request().batch(`
CREATE OR ALTER PROCEDURE [hris].[usp_AllocateEmployeeCode]
  @EmployeeTypeName nvarchar(40),
  @EmployeeCode nvarchar(50) OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @typeCode char(1);
  SET @typeCode =
    CASE UPPER(LTRIM(RTRIM(@EmployeeTypeName)))
      WHEN 'PERMANENT' THEN 'P'
      WHEN 'LUMPSUM' THEN 'L'
      WHEN 'DAILY RATE' THEN 'C'
      ELSE NULL
    END;

  IF @typeCode IS NULL
    THROW 51010, 'Employee Type must be Permanent, Lumpsum, or Daily Rate.', 1;

  BEGIN TRANSACTION;

  DECLARE @latestExisting int = 0;
  SELECT @latestExisting = ISNULL(MAX(seq_no), 0)
  FROM (
    SELECT TRY_CONVERT(int, SUBSTRING(UPPER(LTRIM(RTRIM(employee_code))), 2, 20)) AS seq_no
    FROM [hris].[Employees] WITH (UPDLOCK, HOLDLOCK)
    WHERE UPPER(LTRIM(RTRIM(employee_code))) LIKE @typeCode + '[0-9]%'
      AND TRY_CONVERT(int, SUBSTRING(UPPER(LTRIM(RTRIM(employee_code))), 2, 20)) IS NOT NULL
    UNION ALL
    SELECT TRY_CONVERT(int, SUBSTRING(UPPER(LTRIM(RTRIM(employee_code))), 2, 20))
    FROM [hris].[EmployeeDrafts] WITH (UPDLOCK, HOLDLOCK)
    WHERE employee_code IS NOT NULL
      AND draft_status NOT IN ('cancelled', 'created')
      AND UPPER(LTRIM(RTRIM(employee_code))) LIKE @typeCode + '[0-9]%'
      AND TRY_CONVERT(int, SUBSTRING(UPPER(LTRIM(RTRIM(employee_code))), 2, 20)) IS NOT NULL
  ) codes;

  UPDATE [hris].[EmployeeCodeCounters] WITH (UPDLOCK, HOLDLOCK)
  SET last_sequence = @latestExisting,
      modified_at = SYSUTCDATETIME(),
      modified_by = SUSER_SNAME()
  WHERE employee_type_code = @typeCode;

  IF @@ROWCOUNT = 0
  BEGIN
    INSERT [hris].[EmployeeCodeCounters](employee_type_code, employee_type_name, last_sequence)
    VALUES (@typeCode, @EmployeeTypeName, @latestExisting);
  END;

  DECLARE @seq int = @latestExisting + 1;

  SELECT @EmployeeCode = @typeCode + RIGHT(REPLICATE('0', 8) + CONVERT(varchar(20), @seq),
    CASE WHEN LEN(CONVERT(varchar(20), @seq)) > 4 THEN LEN(CONVERT(varchar(20), @seq)) ELSE 4 END);

  COMMIT TRANSACTION;
END;
`);

  // Align counters to live occupancy. A drifted last_sequence must snap back down.
  await pool.request().query(`
MERGE [hris].[EmployeeCodeCounters] AS target
USING (
  SELECT type_code AS employee_type_code, type_name AS employee_type_name,
    ISNULL(MAX(seq_no), 0) AS last_sequence
  FROM (
    SELECT 'C' AS type_code, 'Daily Rate' AS type_name,
      TRY_CONVERT(int, SUBSTRING(UPPER(LTRIM(RTRIM(employee_code))), 2, 20)) AS seq_no
    FROM [hris].[Employees]
    WHERE UPPER(LTRIM(RTRIM(employee_code))) LIKE 'C[0-9]%'
    UNION ALL
    SELECT 'C', 'Daily Rate',
      TRY_CONVERT(int, SUBSTRING(UPPER(LTRIM(RTRIM(employee_code))), 2, 20))
    FROM [hris].[EmployeeDrafts]
    WHERE employee_code IS NOT NULL AND draft_status NOT IN ('cancelled', 'created')
      AND UPPER(LTRIM(RTRIM(employee_code))) LIKE 'C[0-9]%'
    UNION ALL
    SELECT 'L', 'Lumpsum',
      TRY_CONVERT(int, SUBSTRING(UPPER(LTRIM(RTRIM(employee_code))), 2, 20))
    FROM [hris].[Employees]
    WHERE UPPER(LTRIM(RTRIM(employee_code))) LIKE 'L[0-9]%'
    UNION ALL
    SELECT 'L', 'Lumpsum',
      TRY_CONVERT(int, SUBSTRING(UPPER(LTRIM(RTRIM(employee_code))), 2, 20))
    FROM [hris].[EmployeeDrafts]
    WHERE employee_code IS NOT NULL AND draft_status NOT IN ('cancelled', 'created')
      AND UPPER(LTRIM(RTRIM(employee_code))) LIKE 'L[0-9]%'
    UNION ALL
    SELECT 'P', 'Permanent',
      TRY_CONVERT(int, SUBSTRING(UPPER(LTRIM(RTRIM(employee_code))), 2, 20))
    FROM [hris].[Employees]
    WHERE UPPER(LTRIM(RTRIM(employee_code))) LIKE 'P[0-9]%'
      AND UPPER(LTRIM(RTRIM(employee_code))) NOT LIKE 'PN%'
      AND UPPER(LTRIM(RTRIM(employee_code))) NOT LIKE 'PI%'
    UNION ALL
    SELECT 'P', 'Permanent',
      TRY_CONVERT(int, SUBSTRING(UPPER(LTRIM(RTRIM(employee_code))), 2, 20))
    FROM [hris].[EmployeeDrafts]
    WHERE employee_code IS NOT NULL AND draft_status NOT IN ('cancelled', 'created')
      AND UPPER(LTRIM(RTRIM(employee_code))) LIKE 'P[0-9]%'
      AND UPPER(LTRIM(RTRIM(employee_code))) NOT LIKE 'PN%'
      AND UPPER(LTRIM(RTRIM(employee_code))) NOT LIKE 'PI%'
  ) codes
  GROUP BY type_code, type_name
) AS source
ON target.employee_type_code = source.employee_type_code
WHEN MATCHED THEN UPDATE SET
  last_sequence = source.last_sequence,
  modified_at = SYSUTCDATETIME(),
  modified_by = SUSER_SNAME()
WHEN NOT MATCHED THEN INSERT (employee_type_code, employee_type_name, last_sequence)
VALUES (source.employee_type_code, source.employee_type_name, source.last_sequence);
`);

  const counters = await pool.request().query('SELECT employee_type_code, last_sequence FROM [hris].[EmployeeCodeCounters] ORDER BY employee_type_code');
  console.log('Updated USP and synced counters:', counters.recordset);

  // Smoke-test preview logic for Daily Rate
  const preview = await pool.request().query(`
SELECT
  ISNULL((
    SELECT MAX(seq_no) FROM (
      SELECT TRY_CONVERT(int, SUBSTRING(UPPER(LTRIM(RTRIM(employee_code))), 2, 20)) AS seq_no
      FROM [hris].[Employees]
      WHERE UPPER(LTRIM(RTRIM(employee_code))) LIKE 'C[0-9]%'
    ) codes
  ), 0) AS latest_employee`);
  const latest = Number(preview.recordset[0].latest_employee || 0);
  console.log('Daily Rate next preview would be: C' + String(latest + 1).padStart(Math.max(4, String(latest + 1).length), '0'));

  await pool.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
