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
    if (!process.env[key]) process.env[key] = value;
  }
};
loadEnvFile(path.join(repo, '.env.local'));
loadEnvFile(path.join(repo, '.env'));
loadEnvFile(path.join(repo, 'apps', 'dashboard', '.env.local'));
loadEnvFile(path.join(repo, 'apps', 'dashboard', '.env'));
loadEnvFile(path.join(repo, 'deployment', 'iis', 'site', '.env'));
loadEnvFile(path.join(repo, 'deployment', 'iis', 'site', 'apps', 'dashboard', '.env'));

const server = process.env.DLE_ENTERPRISE_DB_HOST || process.env.DLE_ENTERPRISE_DB_SERVER;
const database = process.env.DLE_ENTERPRISE_DB_NAME;
const user = process.env.DLE_ENTERPRISE_DB_USER;
const password = process.env.DLE_ENTERPRISE_DB_PASSWORD;
const workDate = process.argv[2] || new Date().toISOString().slice(0, 10);

if (!server || !database) {
  console.error('Missing SQL connection settings');
  process.exit(1);
}

const pool = await sql.connect({
  server,
  port: Number(process.env.DLE_ENTERPRISE_DB_PORT || 1433),
  database,
  user,
  password,
  options: { encrypt: false, trustServerCertificate: true },
});

const active = await pool.request().input('WorkDate', sql.Date, workDate).query(`
  SELECT e.[EmployeeCode], e.[EmployeeName], e.[Status],
    CONVERT(char(10), e.[EffectiveFrom], 23) AS EffectiveFrom,
    CONVERT(char(10), ISNULL(e.[RevisedExpectedReturn], e.[ExpectedReturn]), 23) AS ExpectedReturn,
    h.[MobilizationNo], h.[OffshoreSite], h.[OffshoreSupervisor], h.[ProjectCode], h.[CreatedBy]
  FROM [tsmgmt].[MobilizationEmployees] e
  INNER JOIN [tsmgmt].[Mobilizations] h ON h.[Id] = e.[MobilizationId]
  WHERE e.[Status] IN (N'Planned', N'Mobilized', N'Extended')
    AND e.[EffectiveFrom] <= @WorkDate
    AND (e.[ActualReturn] IS NULL OR e.[ActualReturn] >= @WorkDate)
    AND (e.[ActualDemobilization] IS NULL OR e.[ActualDemobilization] >= @WorkDate)
  ORDER BY h.[OffshoreSupervisor], e.[EmployeeName]
`);

const karonwiLike = (value) => /karonwi|p0013/i.test(String(value || ''));
const rows = active.recordset || [];
const underKaronwi = rows.filter((row) => karonwiLike(row.OffshoreSupervisor));
const notUnderKaronwi = rows.filter((row) => !karonwiLike(row.OffshoreSupervisor));

const bySupervisor = new Map();
for (const row of rows) {
  const key = String(row.OffshoreSupervisor || '(blank)');
  if (!bySupervisor.has(key)) bySupervisor.set(key, []);
  bySupervisor.get(key).push(row);
}

const recentBookings = await pool.request().input('WorkDate', sql.Date, workDate).query(`
  SELECT TOP 200
    l.[EmployeeCode], l.[EmployeeName], l.[LocationName], l.[OperationalStatus],
    CONVERT(char(10), t.[WorkDate], 23) AS WorkDate, t.[SupervisorName], t.[Status]
  FROM [tsmgmt].[TimesheetEntryLines] l
  INNER JOIN [tsmgmt].[Timesheets] t ON t.[Id] = l.[TimesheetId]
  WHERE t.[WorkDate] BETWEEN DATEADD(day, -14, @WorkDate) AND @WorkDate
    AND (
      t.[SupervisorName] LIKE N'%Karonwi%'
      OR l.[LocationName] LIKE N'%OFFSHORE%'
    )
  ORDER BY t.[WorkDate] DESC, l.[EmployeeName]
`);

console.log(JSON.stringify({
  workDate,
  activeMobilizationCount: rows.length,
  underKaronwiCount: underKaronwi.length,
  underKaronwi: underKaronwi.map((row) => ({
    code: row.EmployeeCode,
    name: row.EmployeeName,
    status: row.Status,
    from: row.EffectiveFrom,
    return: row.ExpectedReturn,
    site: row.OffshoreSite,
    mob: row.MobilizationNo,
    project: row.ProjectCode,
    createdBy: row.CreatedBy,
  })),
  supervisorsWithActiveCrew: [...bySupervisor.entries()].map(([supervisor, list]) => ({
    supervisor,
    count: list.length,
    people: list.map((row) => `${row.EmployeeCode} ${row.EmployeeName}`),
  })),
  recentKaronwiOrOffshoreBookings: (recentBookings.recordset || []).slice(0, 100).map((row) => ({
    date: row.WorkDate,
    supervisor: row.SupervisorName,
    code: row.EmployeeCode,
    name: row.EmployeeName,
    location: row.LocationName,
    status: row.OperationalStatus,
    sheetStatus: row.Status,
  })),
}, null, 2));

await pool.close();
