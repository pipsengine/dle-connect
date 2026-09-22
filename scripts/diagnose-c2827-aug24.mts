/**
 * Diagnose C2827 Charles Akaka on 24 Aug 2026.
 *
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/diagnose-c2827-aug24.mts
 */
import fs from 'node:fs';
import path from 'node:path';

import { getDleEnterpriseDbPool, loadWorkspaceEnv } from '../apps/dashboard/lib/dle-enterprise-db';

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

const main = async () => {
  loadEnvFiles();
  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new Error('No DLE Enterprise database.');

  const rows = await pool.request().query(`
SELECT CONVERT(varchar(10), h.TimesheetDate, 23) AS TimesheetDate, h.Id AS HeaderId, h.SupervisorId, h.WorkCenterName, h.LocationName, h.Status, h.ShiftLabel,
       l.Id AS LineId, l.EmployeeNo, l.EmployeeName, l.ClockIn, l.ClockOut, l.UsedHours, l.IdleHours, l.TotalHours, l.AttendanceMode, l.Remarks, l.ValidationStatus
FROM [hris].[TimesheetHeaders] h
INNER JOIN [hris].[TimesheetLines] l ON l.HeaderId = h.Id
WHERE CONVERT(varchar(10), h.TimesheetDate, 23) BETWEEN N'2026-08-22' AND N'2026-08-26'
  AND (l.EmployeeNo LIKE N'%C2827%' OR l.EmployeeId LIKE N'%C2827%' OR l.EmployeeName LIKE N'%AKAKA%')
ORDER BY h.TimesheetDate, h.WorkCenterName
`);

  const [headerProjects, akakaProjects] = await Promise.all([
    pool.request().query(`
SELECT a.ProjectCode, MAX(a.ProjectName) AS ProjectName, SUM(a.Hours) AS Hours
FROM [hris].[TimesheetProjectAllocations] a
INNER JOIN [hris].[TimesheetLines] l ON l.Id = a.LineId
WHERE l.HeaderId = N'hdr-2026-08-24-p0289---mrs-ebele-victoria-onugha-painting-day'
  AND a.Hours > 0
GROUP BY a.ProjectCode
ORDER BY SUM(a.Hours) DESC
`),
    pool.request().query(`
SELECT CONVERT(varchar(10), h.TimesheetDate, 23) AS TimesheetDate, l.Remarks, l.AttendanceMode, l.UsedHours, l.IdleHours, l.TotalHours, l.OffshoreAllowanceHours,
       a.ProjectCode, a.ProjectName, a.Hours, i.ReasonId, i.ReasonName, i.Hours AS IdleAllocHours
FROM [hris].[TimesheetHeaders] h
INNER JOIN [hris].[TimesheetLines] l ON l.HeaderId = h.Id
LEFT JOIN [hris].[TimesheetProjectAllocations] a ON a.LineId = l.Id
LEFT JOIN [hris].[TimesheetIdleAllocations] i ON i.LineId = l.Id
WHERE CONVERT(varchar(10), h.TimesheetDate, 23) = N'2026-08-26'
  AND (l.EmployeeNo LIKE N'%C2827%' OR l.EmployeeId LIKE N'%C2827%')
`),
  ]);

  console.log(JSON.stringify({
    lines: rows.recordset,
    headerProjects: headerProjects.recordset,
    akakaNearby: akakaProjects.recordset,
  }, null, 2));
  process.exit(0);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
