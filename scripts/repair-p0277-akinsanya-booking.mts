/**
 * Strip extra department names from P0277 Akinsanya draft sheets so only the
 * seven galvanizing operators remain bookable for 16 Aug–15 Sep.
 *
 * Dry run:
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/repair-p0277-akinsanya-booking.mts
 *
 * Apply:
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/repair-p0277-akinsanya-booking.mts --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import sql from 'mssql';

import { getDleEnterpriseDbPool, loadWorkspaceEnv } from '../apps/dashboard/lib/dle-enterprise-db';

const CREW = new Set(['C2394', 'C2396', 'C2408', 'C2443', 'C2506', 'C2512', 'C2522', 'P0277']);
const START = '2026-08-16';
const END = '2026-09-15';

const loadEnvFiles = () => {
  for (const file of [path.resolve('.env'), path.resolve('apps/dashboard/.env'), path.resolve('apps/dashboard/.env.local')]) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      if (!process.env[match[1]]) process.env[match[1]] = value;
    }
  }
  loadWorkspaceEnv();
};

const crewSqlList = [...CREW].map((code) => `N'${code}'`).join(', ');

const main = async () => {
  loadEnvFiles();
  const apply = process.argv.includes('--apply');
  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new Error('No DLE Enterprise database.');

  const headers = await pool.request()
    .input('start', sql.VarChar(10), START)
    .input('end', sql.VarChar(10), END)
    .query(`
SELECT h.Id, CONVERT(varchar(10), h.TimesheetDate, 23) AS TimesheetDate, h.WorkCenterName, h.Status,
       COUNT(l.Id) AS LineCount
FROM [hris].[TimesheetHeaders] h
LEFT JOIN [hris].[TimesheetLines] l ON l.HeaderId = h.Id
WHERE (h.SupervisorId LIKE N'%P0277%' OR h.SupervisorName LIKE N'%AKINSANYA%')
  AND CONVERT(varchar(10), h.TimesheetDate, 23) BETWEEN @start AND @end
  AND h.Status = N'Draft'
GROUP BY h.Id, h.TimesheetDate, h.WorkCenterName, h.Status
ORDER BY h.TimesheetDate, h.WorkCenterName
`);

  const extras = await pool.request()
    .input('start', sql.VarChar(10), START)
    .input('end', sql.VarChar(10), END)
    .query(`
SELECT COUNT(*) AS ExtraLines
FROM [hris].[TimesheetHeaders] h
INNER JOIN [hris].[TimesheetLines] l ON l.HeaderId = h.Id
WHERE (h.SupervisorId LIKE N'%P0277%' OR h.SupervisorName LIKE N'%AKINSANYA%')
  AND CONVERT(varchar(10), h.TimesheetDate, 23) BETWEEN @start AND @end
  AND h.Status = N'Draft'
  AND UPPER(LTRIM(RTRIM(l.EmployeeNo))) NOT IN (${crewSqlList})
  AND ISNULL(l.UsedHours, 0) = 0
  AND ISNULL(l.TotalHours, 0) = 0
`);

  let deleted = 0;
  if (apply) {
    const result = await pool.request()
      .input('start', sql.VarChar(10), START)
      .input('end', sql.VarChar(10), END)
      .query(`
DELETE l
FROM [hris].[TimesheetLines] l
INNER JOIN [hris].[TimesheetHeaders] h ON h.Id = l.HeaderId
WHERE (h.SupervisorId LIKE N'%P0277%' OR h.SupervisorName LIKE N'%AKINSANYA%')
  AND CONVERT(varchar(10), h.TimesheetDate, 23) BETWEEN @start AND @end
  AND h.Status = N'Draft'
  AND UPPER(LTRIM(RTRIM(l.EmployeeNo))) NOT IN (${crewSqlList})
  AND ISNULL(l.UsedHours, 0) = 0
  AND ISNULL(l.TotalHours, 0) = 0
`);
    deleted = result.rowsAffected?.[0] || 0;
  }

  console.log(JSON.stringify({
    apply,
    draftHeaders: headers.recordset.length,
    extraUnbookedLines: extras.recordset[0]?.ExtraLines || 0,
    deleted,
    sample: headers.recordset.slice(0, 12),
  }, null, 2));
  process.exit(0);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
