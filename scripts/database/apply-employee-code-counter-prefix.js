/*
  Applies the [hris].[EmployeeCodeCounters] employee_code_prefix migration on its own,
  for environments where running the full DLE_Enterprise baseline is not practical.

  Mirrors the corresponding section of 30-dle-enterprise-employee-onboarding.sql and is
  safe to rerun. Pass --apply to write; the default is a read-only report.
*/

const fs = require('fs');
const path = require('path');
const sql = require('mssql');

function loadWorkspaceEnv() {
  for (const file of [
    path.resolve('.env'),
    path.join(process.cwd(), 'apps', 'dashboard', '.env'),
    path.join(process.cwd(), 'apps', 'dashboard', '.env.local'),
  ]) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[match[1]]) process.env[match[1]] = value;
    }
  }
}

function dbConfig() {
  return {
    server: process.env.DLE_ENTERPRISE_DB_HOST,
    port: Number(process.env.DLE_ENTERPRISE_DB_PORT || 1433),
    database: process.env.DLE_ENTERPRISE_DB_NAME || 'DLE_Enterprise',
    user: process.env.DLE_ENTERPRISE_DB_USER,
    password: process.env.DLE_ENTERPRISE_DB_PASSWORD,
    options: {
      encrypt: String(process.env.DLE_ENTERPRISE_DB_ENCRYPT).toLowerCase() !== 'false',
      trustServerCertificate: String(process.env.DLE_ENTERPRISE_DB_TRUST_SERVER_CERTIFICATE).toLowerCase() === 'true',
    },
    connectionTimeout: Number(process.env.DLE_ENTERPRISE_DB_CONNECTION_TIMEOUT_MS || 20000),
    requestTimeout: Number(process.env.DLE_ENTERPRISE_DB_REQUEST_TIMEOUT_MS || 60000),
  };
}

const apply = process.argv.includes('--apply');

const inspect = async (pool) => {
  const state = await pool.request().query(`
    SELECT
      COL_LENGTH(N'[hris].[EmployeeCodeCounters]', N'employee_code_prefix') AS prefix_column_length,
      (
        SELECT definition
        FROM sys.check_constraints
        WHERE parent_object_id = OBJECT_ID(N'[hris].[EmployeeCodeCounters]')
          AND name = N'CK_EmployeeCodeCounters_type_code'
      ) AS type_code_check;
  `);
  const rows = await pool.request().query(`
    SELECT employee_type_code, employee_type_name, last_sequence
    FROM [hris].[EmployeeCodeCounters]
    ORDER BY employee_type_code;
  `);
  return { ...state.recordset[0], rows: rows.recordset };
};

loadWorkspaceEnv();

(async () => {
  const config = dbConfig();
  console.log(`Target: ${config.server}:${config.port}/${config.database} as ${config.user}`);
  console.log(apply ? 'Mode: APPLY\n' : 'Mode: report only (pass --apply to write)\n');

  const pool = await sql.connect(config);
  try {
    const before = await inspect(pool);
    console.log('Before:');
    console.log(`  employee_code_prefix column: ${before.prefix_column_length === null ? 'MISSING' : 'present'}`);
    console.log(`  type-code check: ${before.type_code_check || 'none'}`);
    console.log(`  counter rows: ${before.rows.map((r) => `${r.employee_type_code}=${r.last_sequence}`).join(', ') || 'none'}`);

    if (!apply) return;

    if (before.prefix_column_length === null) {
      await pool.request().query(`ALTER TABLE [hris].[EmployeeCodeCounters] ADD employee_code_prefix nvarchar(10) NULL;`);
      console.log('\nAdded employee_code_prefix.');
    }

    if (before.type_code_check && !before.type_code_check.includes("'N'")) {
      await pool.request().query(`ALTER TABLE [hris].[EmployeeCodeCounters] DROP CONSTRAINT CK_EmployeeCodeCounters_type_code;`);
      await pool.request().query(`ALTER TABLE [hris].[EmployeeCodeCounters] WITH CHECK ADD CONSTRAINT CK_EmployeeCodeCounters_type_code CHECK (employee_type_code IN ('P', 'L', 'C', 'N', 'I'));`);
      console.log('Widened CK_EmployeeCodeCounters_type_code to allow N and I.');
    }

    await pool.request().query(`
      MERGE [hris].[EmployeeCodeCounters] AS target
      USING (VALUES
        ('P', N'Permanent', N'P'),
        ('L', N'Lumpsum', N'L'),
        ('C', N'Daily Rate', N'C'),
        ('N', N'NYSC', N'NYSC'),
        ('I', N'Industrial Trainee', N'IT')
      ) AS source(employee_type_code, employee_type_name, employee_code_prefix)
      ON target.employee_type_code = source.employee_type_code
      WHEN MATCHED THEN UPDATE SET employee_type_name = source.employee_type_name, employee_code_prefix = source.employee_code_prefix
      WHEN NOT MATCHED THEN INSERT (employee_type_code, employee_type_name, employee_code_prefix) VALUES (source.employee_type_code, source.employee_type_name, source.employee_code_prefix);
    `);
    console.log('Seeded counters for all five employee types.');

    const after = await pool.request().query(`
      SELECT employee_type_code, employee_type_name, employee_code_prefix, last_sequence
      FROM [hris].[EmployeeCodeCounters]
      ORDER BY employee_type_code;
    `);
    console.log('\nAfter:');
    for (const row of after.recordset) {
      console.log(`  ${row.employee_type_code}  ${row.employee_type_name.padEnd(20)} prefix=${row.employee_code_prefix || '—'}  last_sequence=${row.last_sequence}`);
    }
  } finally {
    await pool.close().catch(() => undefined);
  }
})()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
