import { readFileSync } from 'node:fs';
import path from 'node:path';
import sql from 'mssql';

const envFile = path.join(process.cwd(), 'apps', 'dashboard', '.env');
for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const idx = trimmed.indexOf('=');
  if (idx < 0) continue;
  const key = trimmed.slice(0, idx).trim();
  if (process.env[key]) continue;
  let value = trimmed.slice(idx + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  process.env[key] = value;
}

const host = process.env.SAGE_X3_DB_HOST || '192.168.5.5';
const database = process.env.SAGE_X3_DB_NAME || 'x3data';
const user = process.env.SAGE_X3_DB_USER || 'sage';
const password = process.env.SAGE_X3_DB_PASSWORD || '';
if (!password) {
  console.error('Set SAGE_X3_DB_PASSWORD in apps/dashboard/.env');
  process.exit(1);
}

const attempts = [
  { encrypt: false, user, database },
  { encrypt: true, user, database },
  { encrypt: false, user, database: 'master' },
  { encrypt: true, user, database: 'master' },
];

let pool = null;
for (const attempt of attempts) {
  try {
    const candidate = await new sql.ConnectionPool({
      server: host,
      port: Number(process.env.SAGE_X3_DB_PORT || 1433),
      database: attempt.database,
      user: attempt.user,
      password,
      options: {
        encrypt: attempt.encrypt,
        trustServerCertificate: true,
        enableArithAbort: true,
      },
      connectionTimeout: 15000,
      requestTimeout: 30000,
    }).connect();
    pool = candidate;
    console.log(`CONNECTED encrypt=${attempt.encrypt} db=${attempt.database}`);
    break;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`FAILED encrypt=${attempt.encrypt} db=${attempt.database}: ${message}`);
  }
}
if (!pool) {
  console.error('Unable to connect to Sage X3');
  process.exit(1);
}

if (database && pool.config.database !== database) {
  await pool.request().query(`USE [${database.replace(/]/g, '')}]`);
  console.log(`SWITCHED ${database}`);
}

const tables = await pool.request().query(`
  SELECT TOP 80 TABLE_SCHEMA, TABLE_NAME
  FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_TYPE = 'BASE TABLE'
    AND (
      TABLE_NAME LIKE '%SUPPL%'
      OR TABLE_NAME LIKE 'BPS%'
      OR TABLE_NAME LIKE 'BPR%'
      OR TABLE_NAME LIKE '%VENDOR%'
      OR TABLE_NAME LIKE '%BPARTNER%'
    )
  ORDER BY TABLE_SCHEMA, TABLE_NAME
`);
console.log('TABLES', tables.recordset.length);
for (const row of tables.recordset) {
  console.log(`${row.TABLE_SCHEMA}.${row.TABLE_NAME}`);
}

const counts = await pool.request().query(`
  SELECT COUNT(1) AS Cnt FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE'
`);
console.log('TOTAL_TABLES', counts.recordset[0]?.Cnt);

await pool.close();
