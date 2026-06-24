const fs = require('node:fs');
const path = require('node:path');
const sql = require('mssql');

const loadEnv = () => {
  for (const file of [path.join(process.cwd(), '.env'), path.join(process.cwd(), 'apps', 'dashboard', '.env')]) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match || process.env[match[1]]) continue;
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      process.env[match[1]] = value;
    }
  }
};

const sageConfig = () => ({
  server: process.env.SAGE_PAYROLL_DB_HOST || '192.168.5.8',
  port: Number(process.env.SAGE_PAYROLL_DB_PORT || 1433),
  database: process.env.SAGE_PAYROLL_DB_NAME || 'DLE_JUNE',
  user: process.env.SAGE_PAYROLL_DB_USER || 'sa',
  password: process.env.SAGE_PAYROLL_DB_PASSWORD || '',
  options: {
    encrypt: false,
    trustServerCertificate: true,
    instanceName: process.env.SAGE_PAYROLL_DB_INSTANCE || 'MSSQLSERVERPEOPL',
  },
  connectionTimeout: 15000,
  requestTimeout: 120000,
});

(async () => {
  loadEnv();
  const pool = await new sql.ConnectionPool(sageConfig()).connect();
  try {
    const photoCols = await pool.request().query(`
      SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE (
        COLUMN_NAME LIKE '%photo%' OR COLUMN_NAME LIKE '%picture%' OR COLUMN_NAME LIKE '%image%'
        OR COLUMN_NAME LIKE '%Photo%' OR COLUMN_NAME LIKE '%Picture%' OR COLUMN_NAME LIKE '%Image%'
        OR COLUMN_NAME LIKE '%portrait%' OR COLUMN_NAME LIKE '%avatar%'
      )
      ORDER BY TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME
    `);
    console.log('=== PHOTO-LIKE COLUMNS ===');
    console.log(JSON.stringify(photoCols.recordset, null, 2));

    const binaryCols = await pool.request().query(`
      SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, DATA_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE DATA_TYPE IN ('image', 'varbinary', 'binary')
      ORDER BY TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME
    `);
    console.log('=== BINARY COLUMNS (first 100) ===');
    console.log(JSON.stringify(binaryCols.recordset.slice(0, 100), null, 2));

    const employeeDetailCols = await pool.request().query(`
      SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = 'Employee' AND TABLE_NAME = 'EmployeeDetail'
      ORDER BY ORDINAL_POSITION
    `);
    console.log('=== Employee.EmployeeDetail columns ===');
    console.log(JSON.stringify(employeeDetailCols.recordset, null, 2));

    const tables = await pool.request().query(`
      SELECT TABLE_SCHEMA, TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_TYPE = 'BASE TABLE'
        AND (TABLE_NAME LIKE '%Photo%' OR TABLE_NAME LIKE '%Picture%' OR TABLE_NAME LIKE '%Image%' OR TABLE_NAME LIKE '%Document%')
      ORDER BY TABLE_SCHEMA, TABLE_NAME
    `);
    console.log('=== PHOTO/DOCUMENT TABLES ===');
    console.log(JSON.stringify(tables.recordset, null, 2));
  } finally {
    await pool.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
