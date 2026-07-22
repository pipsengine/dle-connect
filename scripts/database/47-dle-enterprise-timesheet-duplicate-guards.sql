-- One-time cleanup + duplicate guards for live timesheet/payroll processing.
-- Safe to run multiple times.
-- Note: SQL Server CTEs apply to only the next statement, so each DELETE needs its own CTE.

;WITH rankedPayrollUpdates AS (
  SELECT [Id], [PeriodId], ROW_NUMBER() OVER (PARTITION BY [PeriodId] ORDER BY [AcknowledgedAt] DESC, [Id] DESC) AS rn
  FROM [hris].[TimesheetPayrollUpdates]
)
DELETE e
FROM [hris].[TimesheetPayrollUpdateEmployees] e
INNER JOIN rankedPayrollUpdates u ON u.[Id] = e.[PayrollUpdateId]
WHERE u.rn > 1;

;WITH rankedPayrollUpdates AS (
  SELECT [Id], [PeriodId], ROW_NUMBER() OVER (PARTITION BY [PeriodId] ORDER BY [AcknowledgedAt] DESC, [Id] DESC) AS rn
  FROM [hris].[TimesheetPayrollUpdates]
)
DELETE h
FROM [hris].[TimesheetPayrollUpdateHeaders] h
INNER JOIN rankedPayrollUpdates u ON u.[Id] = h.[PayrollUpdateId]
WHERE u.rn > 1;

;WITH rankedPayrollUpdates AS (
  SELECT [Id], [PeriodId], ROW_NUMBER() OVER (PARTITION BY [PeriodId] ORDER BY [AcknowledgedAt] DESC, [Id] DESC) AS rn
  FROM [hris].[TimesheetPayrollUpdates]
)
DELETE u
FROM [hris].[TimesheetPayrollUpdates] u
INNER JOIN rankedPayrollUpdates r ON r.[Id] = u.[Id]
WHERE r.rn > 1;

;WITH rankedLines AS (
  SELECT
    l.[Id],
    ROW_NUMBER() OVER (
      PARTITION BY l.[HeaderId], UPPER(LTRIM(RTRIM(l.[EmployeeId])))
      ORDER BY CASE WHEN NULLIF(LTRIM(RTRIM(l.[ClockIn])), '') IS NULL THEN 0 ELSE 1 END DESC,
               ISNULL(l.[TotalHours], 0) DESC,
               ISNULL(l.[AttendanceDuration], 0) DESC,
               l.[Id] DESC
    ) AS rn
  FROM [hris].[TimesheetLines] l
  WHERE NULLIF(LTRIM(RTRIM(l.[EmployeeId])), '') IS NOT NULL
)
DELETE l
FROM [hris].[TimesheetLines] l
INNER JOIN rankedLines r ON r.[Id] = l.[Id]
WHERE r.rn > 1;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_TimesheetPayrollUpdates_PeriodId' AND object_id = OBJECT_ID(N'[hris].[TimesheetPayrollUpdates]'))
  CREATE UNIQUE INDEX [UX_TimesheetPayrollUpdates_PeriodId] ON [hris].[TimesheetPayrollUpdates]([PeriodId]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_TimesheetLines_HeaderEmployee' AND object_id = OBJECT_ID(N'[hris].[TimesheetLines]'))
  CREATE UNIQUE INDEX [UX_TimesheetLines_HeaderEmployee] ON [hris].[TimesheetLines]([HeaderId], [EmployeeId]);
