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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
};
[
  '.env.local',
  '.env',
  'apps/dashboard/.env.local',
  'apps/dashboard/.env',
  'deployment/iis/site/.env',
  'deployment/iis/site/apps/dashboard/.env',
].forEach((file) => loadEnvFile(path.join(repo, file)));

const pool = await sql.connect({
  server: process.env.DLE_ENTERPRISE_DB_HOST || process.env.DLE_ENTERPRISE_DB_SERVER,
  port: Number(process.env.DLE_ENTERPRISE_DB_PORT || 1433),
  database: process.env.DLE_ENTERPRISE_DB_NAME,
  user: process.env.DLE_ENTERPRISE_DB_USER,
  password: process.env.DLE_ENTERPRISE_DB_PASSWORD,
  options: { encrypt: false, trustServerCertificate: true },
});

const names = await pool.request().query(`
  SELECT DISTINCT SupervisorName
  FROM tsmgmt.Timesheets
  WHERE WorkDate >= '2026-11-01'
    AND (SupervisorName LIKE N'%KARON%' OR SupervisorName LIKE N'%Samuel%')
  ORDER BY SupervisorName
`);

const summary = await pool.request().query(`
  SELECT CONVERT(char(10), t.WorkDate, 23) AS WorkDate, t.SupervisorName, t.Status, COUNT(*) AS People,
    SUM(CASE WHEN l.LocationName LIKE N'%OFFSHORE%' THEN 1 ELSE 0 END) AS OffshorePeople
  FROM tsmgmt.Timesheets t
  INNER JOIN tsmgmt.TimesheetEntryLines l ON l.TimesheetId = t.Id
  WHERE t.WorkDate >= '2026-11-01'
    AND t.SupervisorName LIKE N'%KARON%'
  GROUP BY t.WorkDate, t.SupervisorName, t.Status
  ORDER BY t.WorkDate DESC
`);

console.log(JSON.stringify({ names: names.recordset, summary: summary.recordset }, null, 2));
await pool.close();
