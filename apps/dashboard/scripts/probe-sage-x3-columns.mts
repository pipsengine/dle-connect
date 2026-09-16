import sql from 'mssql';
import { loadWorkspaceEnv } from '@/lib/dle-enterprise-db';

loadWorkspaceEnv();

const pool = await new sql.ConnectionPool({
  server: 'DLESGENT',
  database: process.env.SAGE_X3_DB_NAME || 'x3data',
  user: process.env.SAGE_X3_DB_USER || 'sage',
  password: process.env.SAGE_X3_DB_PASSWORD || '',
  options: {
    instanceName: process.env.SAGE_X3_DB_INSTANCE || 'SAGEX3',
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true,
  },
  connectionTimeout: 20000,
  requestTimeout: 30000,
}).connect();

const tables = await pool.request().query(`
  SELECT TABLE_SCHEMA, TABLE_NAME
  FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_TYPE='BASE TABLE'
    AND (
      TABLE_NAME LIKE '%BPSUPPLIER%'
      OR TABLE_NAME LIKE '%BPARTNER%'
      OR TABLE_NAME LIKE '%BPADDRESS%'
      OR TABLE_NAME LIKE '%SUPPL%'
    )
  ORDER BY TABLE_SCHEMA, TABLE_NAME
`);
console.log('TABLES');
for (const row of tables.recordset) console.log(`${row.TABLE_SCHEMA}.${row.TABLE_NAME}`);

const columns = await pool.request().query(`
  SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, DATA_TYPE
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = N'DLEX3DATA'
    AND TABLE_NAME IN (N'BPSUPPLIER', N'BPSUPPLIERT', N'BPARTNER', N'BPARTNERT', N'BPADDRESS')
  ORDER BY TABLE_NAME, ORDINAL_POSITION
`);
console.log('COLUMNS');
for (const row of columns.recordset) {
  console.log(`${row.TABLE_SCHEMA}.${row.TABLE_NAME}.${row.COLUMN_NAME} ${row.DATA_TYPE}`);
}

await pool.close();
