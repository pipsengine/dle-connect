import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sql from 'mssql';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const loadEnvFile = (filePath) => {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
};
loadEnvFile(path.join(repo, '.env'));
loadEnvFile(path.join(repo, 'apps/dashboard/.env'));

const pool = await sql.connect({
  server: process.env.DLE_ENTERPRISE_DB_HOST || process.env.DLE_ENTERPRISE_DB_SERVER,
  port: Number(process.env.DLE_ENTERPRISE_DB_PORT || 1433),
  database: process.env.DLE_ENTERPRISE_DB_NAME,
  user: process.env.DLE_ENTERPRISE_DB_USER,
  password: process.env.DLE_ENTERPRISE_DB_PASSWORD,
  options: { encrypt: false, trustServerCertificate: true },
});

const dateFix = await pool.request().query(`
  UPDATE commercial.TenderOpportunities
  SET ClosingDate = '2026-10-20'
  WHERE ReferenceNo = N'DLE-T-2026-001'
    AND CONVERT(varchar(10), ClosingDate, 23) = '2001-10-19'
    AND CONVERT(varchar(10), SubmissionDeadline, 23) = '2026-10-21'
    AND NULLIF(DeadlineOverrideReason, N'') IS NULL
`);
const statusFix = await pool.request().query(`
  UPDATE commercial.TenderOpportunities
  SET PreparationStatus = N'In Progress'
  WHERE ReferenceNo = N'DLE-T-2026-002'
    AND Status = N'Open'
    AND PreparationStatus = N'Not Started'
`);
console.log('DATE_ROWS', dateFix.rowsAffected[0], 'STATUS_ROWS', statusFix.rowsAffected[0]);
const check = await pool.request().query(`
  SELECT ReferenceNo, Status, PreparationStatus,
    CONVERT(varchar(10), SubmissionDeadline, 23) AS ExternalDeadline,
    CONVERT(varchar(10), ClosingDate, 23) AS InternalDeadline
  FROM commercial.TenderOpportunities
  ORDER BY ReferenceNo
`);
for (const row of check.recordset) console.log(JSON.stringify(row));
await pool.close();
