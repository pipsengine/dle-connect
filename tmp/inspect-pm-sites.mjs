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
loadEnvFile(path.join(repo, 'apps/dashboard/.env'));
loadEnvFile(path.join(repo, '.env'));

const pool = await sql.connect({
  server: process.env.DLE_ENTERPRISE_DB_HOST || process.env.DLE_ENTERPRISE_DB_SERVER,
  database: process.env.DLE_ENTERPRISE_DB_NAME,
  user: process.env.DLE_ENTERPRISE_DB_USER,
  password: process.env.DLE_ENTERPRISE_DB_PASSWORD,
  options: { encrypt: false, trustServerCertificate: true },
});

const sites = await pool.request().query(`
  SELECT ISNULL(Site, N'(blank)') AS Site, COUNT(1) AS N, 
    SUM(CASE WHEN ProjectManager LIKE N'P0%' THEN 1 ELSE 0 END) AS WithPCode
  FROM hris.TimesheetProjects
  GROUP BY ISNULL(Site, N'(blank)')
  ORDER BY N DESC
`);
console.log('SITES', sites.recordset);

const byLoc = await pool.request().query(`
  SELECT Site, ProjectManager, COUNT(1) AS N
  FROM hris.TimesheetProjects
  WHERE ISNULL(ProjectManager, N'') <> N'' AND Status = N'Active'
  GROUP BY Site, ProjectManager
  ORDER BY Site, N DESC
`);
console.log('BY_SITE_PM', byLoc.recordset);

const titles = await pool.request().query(`
  SELECT t.Code, t.ProjectManager, e.employee_code, e.full_name, e.job_title
  FROM hris.TimesheetProjects t
  OUTER APPLY (
    SELECT TOP 1 employee_code, full_name, job_title
    FROM hris.EmployeeMasterView e
    WHERE t.ProjectManager LIKE e.employee_code + N' - %'
       OR t.ProjectManager = e.full_name
       OR t.ProjectManager LIKE N'%' + e.full_name + N'%'
  ) e
  WHERE t.Code IN (N'DL1949', N'DL1985', N'DLPC0070', N'DLPC0067', N'DL0062', N'DL2601', N'DL0041')
`);
console.log('TITLED', titles.recordset);

await pool.close();
