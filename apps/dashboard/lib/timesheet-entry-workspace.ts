import sql from 'mssql';
import { getDleEnterpriseDbPool } from '@/lib/dle-enterprise-db';
import { extractSupervisorEmployeeCode, supervisorCodeLookupVariants } from '@/lib/timesheet-agege-blasting';
import { confirmedRemovalEmployeeCodes, namesMatchSupervisor } from '@/lib/timesheet-crew-store';
import { listActiveMobilizations } from '@/lib/timesheet-portal-mobilization-store';
import { approvalBlocksRevision, openTimesheetApproval } from '@/lib/timesheet-approval-store';

const text = (value: unknown) => String(value ?? '').trim();
const isContractEmployee = (code: unknown) => /^C\d/i.test(text(code));
const isAssignedSupervisor = (code: unknown, jobTitle?: unknown) => /^P\d/i.test(text(code)) && /supervisor/i.test(text(jobTitle));
const isBookableCrewCode = (code: unknown) => isContractEmployee(code) || /^P\d/i.test(text(code));
const dateOnly = (value: unknown) => {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`;
  }
  const raw = text(value);
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : '';
};
const hours = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number * 100) / 100 : 0;
};
const approvedLeaveCodesForDate = async (connection: sql.ConnectionPool, workDate: string) => {
  const day = dateOnly(workDate);
  if (!day) return new Set<string>();
  try {
    const leave = await connection.request().input('WorkDate', sql.Date, day).query(`
      SELECT [EmployeeId] FROM [hris].[LeaveApplications]
      WHERE [StatusName] LIKE N'%Approved%' AND [StartDate] <= @WorkDate AND [EndDate] >= @WorkDate
    `);
    return new Set((leave.recordset || []).map((row) => text(row.EmployeeId).toUpperCase()));
  } catch {
    return new Set<string>();
  }
};
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

type CrewHourLine = {
  employeeCode: string;
  operationalStatus?: string;
  attendanceStatus?: string;
  allocations?: Array<{ regularHours?: number; ovtHours?: number }>;
  nightSession?: boolean;
  nightStart?: string;
  nightEnd?: string;
  nightNote?: string;
};

const bookedHourTotal = (line: CrewHourLine) => (line.allocations || []).reduce((sum, item) => sum + Number(item.regularHours || 0) + Number(item.ovtHours || 0), 0);

const lineOnLeave = (line: CrewHourLine) => text(line.operationalStatus) === 'Approved Leave' || text(line.attendanceStatus) === 'Approved Leave';

/** Day hours stay on the day line. Night-sheet hours open as a second band on that same person. */
export const attachNightBand = <T extends CrewHourLine>(dayLines: T[], nightLines: T[]) => {
  const nightByCode = new Map(nightLines.map((line) => [text(line.employeeCode).toUpperCase(), line]));
  const merged = dayLines.map((line) => {
    const night = nightByCode.get(text(line.employeeCode).toUpperCase());
    if (!night) return { ...line, nightWork: false, nightAllocations: [] as T['allocations'] };
    nightByCode.delete(text(line.employeeCode).toUpperCase());
    const hasNight = !lineOnLeave(line) && !lineOnLeave(night) && (bookedHourTotal(night) > 0 || Boolean(night.nightSession));
    return {
      ...line,
      nightWork: hasNight,
      nightAllocations: hasNight ? (night.allocations || []) : [],
      nightSession: hasNight ? Boolean(night.nightSession || line.nightSession) : Boolean(line.nightSession),
      nightStart: hasNight ? (night.nightStart || line.nightStart || '') : (line.nightStart || ''),
      nightEnd: hasNight ? (night.nightEnd || line.nightEnd || '') : (line.nightEnd || ''),
      nightNote: hasNight ? (night.nightNote || line.nightNote || '') : (line.nightNote || ''),
    };
  });
  for (const night of nightByCode.values()) {
    const hasNight = !lineOnLeave(night) && (bookedHourTotal(night) > 0 || Boolean(night.nightSession));
    if (!hasNight) continue;
    merged.push({
      ...night,
      allocations: [],
      nightWork: true,
      nightAllocations: night.allocations || [],
    });
  }
  return merged;
};

const nonWorkingTimesheetDate = `(
  (DATEDIFF(DAY, CONVERT(date, '20000101'), t.[WorkDate]) % 7) IN (0, 1)
  OR t.[DayKind] = N'Public Holiday'
  OR EXISTS (
    SELECT 1 FROM [tsmgmt].[PublicHolidays] h
    WHERE h.[HolidayDate] = t.[WorkDate]
      AND h.[Status] = N'Active'
      AND ISNULL(h.[TimesheetApplicable], 1) = 1
  )
)`;

const nonWorkingBookingDate = `(
  (DATEDIFF(DAY, CONVERT(date, '20000101'), b.[WorkDate]) % 7) IN (0, 1)
  OR EXISTS (
    SELECT 1 FROM [tsmgmt].[PublicHolidays] h
    WHERE h.[HolidayDate] = b.[WorkDate]
      AND h.[Status] = N'Active'
      AND ISNULL(h.[TimesheetApplicable], 1) = 1
  )
  OR EXISTS (
    SELECT 1 FROM [tsmgmt].[Timesheets] t
    WHERE t.[PeriodId] = b.[PeriodId] AND t.[WorkDate] = b.[WorkDate] AND t.[DayKind] = N'Public Holiday'
  )
)`;

const approvedLeaveForTimesheet = `(
  l.[OperationalStatus] = N'Approved Leave' OR l.[AttendanceStatus] = N'Approved Leave'
  OR EXISTS (
    SELECT 1 FROM [hris].[LeaveApplications] leave
    WHERE leave.[EmployeeId] = l.[EmployeeCode]
      AND leave.[StatusName] LIKE N'%Approved%'
      AND leave.[StartDate] <= t.[WorkDate] AND leave.[EndDate] >= t.[WorkDate]
  )
)`;

const approvedLeaveForBooking = `(
  b.[AttendanceStatus] = N'Approved Leave'
  OR EXISTS (
    SELECT 1 FROM [hris].[LeaveApplications] leave
    WHERE leave.[EmployeeId] = b.[EmployeeCode]
      AND leave.[StatusName] LIKE N'%Approved%'
      AND leave.[StartDate] <= b.[WorkDate] AND leave.[EndDate] >= b.[WorkDate]
  )
)`;

/** Saturday, Sunday, and public-holiday leave must not stay on the books as worked hours. */
export const clearWeekendLeaveHours = async (connection: sql.ConnectionPool, periodId = '') => {
  const period = text(periodId);
  const timesheetPeriod = period ? 'AND t.[PeriodId] = @PeriodId' : '';
  const bookingPeriod = period ? 'AND b.[PeriodId] = @PeriodId' : '';
  const lineRequest = connection.request();
  const bookingRequest = connection.request();
  if (period) {
    lineRequest.input('PeriodId', sql.NVarChar(40), period);
    bookingRequest.input('PeriodId', sql.NVarChar(40), period);
  }
  await lineRequest.query(`
    DELETE a
    FROM [tsmgmt].[TimesheetAllocations] a
    INNER JOIN [tsmgmt].[TimesheetEntryLines] l ON l.[Id] = a.[LineId]
    INNER JOIN [tsmgmt].[Timesheets] t ON t.[Id] = l.[TimesheetId]
    WHERE ${nonWorkingTimesheetDate} AND ${approvedLeaveForTimesheet} ${timesheetPeriod};
    DELETE l
    FROM [tsmgmt].[TimesheetEntryLines] l
    INNER JOIN [tsmgmt].[Timesheets] t ON t.[Id] = l.[TimesheetId]
    WHERE ${nonWorkingTimesheetDate} AND ${approvedLeaveForTimesheet} ${timesheetPeriod};
  `);
  await bookingRequest.query(`
    DELETE b
    FROM [tsmgmt].[Bookings] b
    WHERE ${nonWorkingBookingDate}
      AND ${approvedLeaveForBooking}
      ${bookingPeriod};
  `);
};

export type ShiftSettings = {
  dayStart: string;
  dayEnd: string;
  breakHours: number;
  expectedHours: number;
  nightStart: string;
  nightAllowance: number;
};

export type HolidayHit = { id: string; name: string; date: string; holidayType: string; scope: string } | null;

let ensured = false;

const pool = async () => {
  const connection = await getDleEnterpriseDbPool();
  if (!connection) throw new Error('DLE Enterprise database is not configured.');
  if (!ensured) {
    await connection.request().query(`
IF SCHEMA_ID(N'tsmgmt') IS NULL EXEC(N'CREATE SCHEMA [tsmgmt]');
IF OBJECT_ID(N'[tsmgmt].[ShiftSettings]', N'U') IS NULL
CREATE TABLE [tsmgmt].[ShiftSettings] (
  [Id] NVARCHAR(20) NOT NULL CONSTRAINT [PK_TsmgmtShiftSettings] PRIMARY KEY,
  [DayStart] NVARCHAR(8) NOT NULL,
  [DayEnd] NVARCHAR(8) NOT NULL,
  [BreakHours] DECIMAL(9,2) NOT NULL,
  [ExpectedHours] DECIMAL(9,2) NOT NULL,
  [NightStart] NVARCHAR(8) NOT NULL,
  [NightAllowance] DECIMAL(12,2) NOT NULL,
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_TsmgmtShiftSettings_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedBy] NVARCHAR(120) NULL
);
IF NOT EXISTS (SELECT 1 FROM [tsmgmt].[ShiftSettings])
INSERT INTO [tsmgmt].[ShiftSettings] ([Id],[DayStart],[DayEnd],[BreakHours],[ExpectedHours],[NightStart],[NightAllowance],[UpdatedBy])
VALUES (N'default', N'07:30', N'16:30', 1, 8, N'18:00', 1500, N'System');
IF OBJECT_ID(N'[tsmgmt].[PublicHolidays]', N'U') IS NULL
CREATE TABLE [tsmgmt].[PublicHolidays] (
  [Id] NVARCHAR(40) NOT NULL CONSTRAINT [PK_TsmgmtPublicHolidays] PRIMARY KEY,
  [Name] NVARCHAR(180) NOT NULL,
  [HolidayDate] DATE NOT NULL,
  [Country] NVARCHAR(80) NOT NULL CONSTRAINT [DF_TsmgmtPublicHolidays_Country] DEFAULT N'Nigeria',
  [Region] NVARCHAR(80) NULL,
  [HolidayType] NVARCHAR(40) NOT NULL,
  [Scope] NVARCHAR(40) NOT NULL,
  [SourceReference] NVARCHAR(220) NULL,
  [Status] NVARCHAR(20) NOT NULL,
  [EffectiveYear] INT NOT NULL,
  [TimesheetApplicable] BIT NOT NULL CONSTRAINT [DF_TsmgmtPublicHolidays_Ts] DEFAULT 1,
  [PayrollApplicable] BIT NOT NULL CONSTRAINT [DF_TsmgmtPublicHolidays_Pay] DEFAULT 1,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_TsmgmtPublicHolidays_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [CreatedBy] NVARCHAR(120) NULL,
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_TsmgmtPublicHolidays_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedBy] NVARCHAR(120) NULL
);
IF OBJECT_ID(N'[tsmgmt].[InternalActivities]', N'U') IS NULL
CREATE TABLE [tsmgmt].[InternalActivities] (
  [Code] NVARCHAR(40) NOT NULL CONSTRAINT [PK_TsmgmtInternalActivities] PRIMARY KEY,
  [Name] NVARCHAR(180) NOT NULL,
  [Status] NVARCHAR(20) NOT NULL
);
IF OBJECT_ID(N'[tsmgmt].[Timesheets]', N'U') IS NULL
CREATE TABLE [tsmgmt].[Timesheets] (
  [Id] NVARCHAR(40) NOT NULL CONSTRAINT [PK_TsmgmtTimesheets] PRIMARY KEY,
  [ReferenceCode] NVARCHAR(40) NOT NULL,
  [PeriodId] NVARCHAR(40) NOT NULL,
  [WorkDate] DATE NOT NULL,
  [SupervisorName] NVARCHAR(180) NOT NULL,
  [LocationName] NVARCHAR(180) NOT NULL CONSTRAINT [DF_TsmgmtTimesheets_Location] DEFAULT N'',
  [WorkCenterName] NVARCHAR(180) NOT NULL CONSTRAINT [DF_TsmgmtTimesheets_WorkCenter] DEFAULT N'',
  [ShiftLabel] NVARCHAR(80) NOT NULL CONSTRAINT [DF_TsmgmtTimesheets_Shift] DEFAULT N'Day',
  [Status] NVARCHAR(30) NOT NULL,
  [VersionNo] INT NOT NULL CONSTRAINT [DF_TsmgmtTimesheets_Version] DEFAULT 1,
  [DayKind] NVARCHAR(20) NULL,
  [HolidayName] NVARCHAR(180) NULL,
  [ClassificationFrozen] BIT NOT NULL CONSTRAINT [DF_TsmgmtTimesheets_Frozen] DEFAULT 0,
  [ReturnReason] NVARCHAR(500) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_TsmgmtTimesheets_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [CreatedBy] NVARCHAR(120) NULL,
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_TsmgmtTimesheets_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedBy] NVARCHAR(120) NULL
);
IF OBJECT_ID(N'[tsmgmt].[TimesheetEntryLines]', N'U') IS NULL
CREATE TABLE [tsmgmt].[TimesheetEntryLines] (
  [Id] NVARCHAR(40) NOT NULL CONSTRAINT [PK_TsmgmtTimesheetEntryLines] PRIMARY KEY,
  [TimesheetId] NVARCHAR(40) NOT NULL,
  [EmployeeCode] NVARCHAR(80) NOT NULL,
  [EmployeeName] NVARCHAR(220) NOT NULL,
  [LocationName] NVARCHAR(180) NULL,
  [WorkCenterName] NVARCHAR(180) NULL,
  [OperationalStatus] NVARCHAR(80) NULL,
  [AttendanceStatus] NVARCHAR(40) NULL,
  [AttendanceNote] NVARCHAR(500) NULL,
  [Exceptional] BIT NOT NULL CONSTRAINT [DF_TsmgmtTimesheetEntryLines_Exceptional] DEFAULT 0,
  [ExceptionReason] NVARCHAR(500) NULL,
  [NightSession] BIT NOT NULL CONSTRAINT [DF_TsmgmtTimesheetEntryLines_Night] DEFAULT 0,
  [NightStart] NVARCHAR(8) NULL,
  [NightEnd] NVARCHAR(8) NULL,
  [NightNote] NVARCHAR(500) NULL
);
IF OBJECT_ID(N'[tsmgmt].[TimesheetAllocations]', N'U') IS NULL
CREATE TABLE [tsmgmt].[TimesheetAllocations] (
  [Id] NVARCHAR(40) NOT NULL CONSTRAINT [PK_TsmgmtTimesheetAllocations] PRIMARY KEY,
  [LineId] NVARCHAR(40) NOT NULL,
  [ProjectCode] NVARCHAR(80) NOT NULL,
  [ProjectName] NVARCHAR(220) NULL,
  [Kind] NVARCHAR(20) NOT NULL,
  [RegularHours] DECIMAL(9,2) NOT NULL CONSTRAINT [DF_TsmgmtTimesheetAllocations_Reg] DEFAULT 0,
  [OvtHours] DECIMAL(9,2) NOT NULL CONSTRAINT [DF_TsmgmtTimesheetAllocations_Ovt] DEFAULT 0,
  [Activity] NVARCHAR(180) NULL,
  [ChargeCode] NVARCHAR(80) NULL,
  [OvtReason] NVARCHAR(300) NULL,
  [Comment] NVARCHAR(500) NULL
);
IF OBJECT_ID(N'[tsmgmt].[TimesheetEntryAudit]', N'U') IS NULL
CREATE TABLE [tsmgmt].[TimesheetEntryAudit] (
  [Id] BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT [PK_TsmgmtTimesheetEntryAudit] PRIMARY KEY,
  [TimesheetId] NVARCHAR(40) NULL,
  [Action] NVARCHAR(80) NOT NULL,
  [Detail] NVARCHAR(1000) NULL,
  [Actor] NVARCHAR(120) NOT NULL,
  [ActedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_TsmgmtTimesheetEntryAudit_ActedAt] DEFAULT SYSUTCDATETIME()
);
`);
    await connection.request().query(`
IF NOT EXISTS (SELECT 1 FROM [tsmgmt].[PublicHolidays])
INSERT INTO [tsmgmt].[PublicHolidays] ([Id],[Name],[HolidayDate],[HolidayType],[Scope],[SourceReference],[Status],[EffectiveYear],[CreatedBy],[UpdatedBy])
VALUES
(N'ng-new-year', N'New Year''s Day', '2026-01-01', N'Fixed', N'National', N'Nigeria Public Holidays Act', N'Active', 2026, N'System', N'System'),
(N'ng-workers', N'Workers'' Day', '2026-05-01', N'Fixed', N'National', N'Nigeria Public Holidays Act', N'Active', 2026, N'System', N'System'),
(N'ng-democracy', N'Democracy Day', '2026-06-12', N'Fixed', N'National', N'Nigeria Public Holidays Act', N'Active', 2026, N'System', N'System'),
(N'ng-independence', N'Independence Day', '2026-10-01', N'Fixed', N'National', N'Nigeria Public Holidays Act', N'Active', 2026, N'System', N'System'),
(N'ng-christmas', N'Christmas Day', '2026-12-25', N'Fixed', N'National', N'Nigeria Public Holidays Act', N'Active', 2026, N'System', N'System'),
(N'ng-boxing', N'Boxing Day', '2026-12-26', N'Fixed', N'National', N'Nigeria Public Holidays Act', N'Active', 2026, N'System', N'System');
IF NOT EXISTS (SELECT 1 FROM [tsmgmt].[InternalActivities])
INSERT INTO [tsmgmt].[InternalActivities] ([Code],[Name],[Status]) VALUES
(N'INT-ADMIN', N'General/Admin', N'Active'),
(N'INT-TRAIN', N'Training', N'Active'),
(N'INT-SAFETY', N'Toolbox/Safety Meeting', N'Active'),
(N'INT-MAINT', N'Maintenance', N'Active'),
(N'INT-HOUSE', N'Workshop/Housekeeping', N'Active'),
(N'INT-STANDBY', N'Standby', N'Active'),
(N'INT-OTHER', N'Other Approved Internal Work', N'Active');
`);
    await connection.request().query(`
IF OBJECT_ID(N'[tsmgmt].[Timesheets]', N'U') IS NOT NULL
AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_TsmgmtTimesheets_SupervisorDate' AND object_id = OBJECT_ID(N'[tsmgmt].[Timesheets]'))
CREATE INDEX [IX_TsmgmtTimesheets_SupervisorDate] ON [tsmgmt].[Timesheets]([PeriodId], [WorkDate], [SupervisorName], [ShiftLabel]);
IF OBJECT_ID(N'[tsmgmt].[Bookings]', N'U') IS NOT NULL
AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_TsmgmtBookings_SupervisorDate' AND object_id = OBJECT_ID(N'[tsmgmt].[Bookings]'))
CREATE INDEX [IX_TsmgmtBookings_SupervisorDate] ON [tsmgmt].[Bookings]([PeriodId], [WorkDate], [SupervisorName], [ShiftLabel]);
`);
    ensured = true;
  }
  return connection;
};

const isDeadlock = (error: unknown) => {
  const number = Number((error as { number?: number })?.number);
  const message = error instanceof Error ? error.message : String(error || '');
  return number === 1205 || /deadlock/i.test(message);
};

const withDeadlockRetry = async <T,>(work: () => Promise<T>) => {
  let last: unknown;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await work();
    } catch (error) {
      last = error;
      if (!isDeadlock(error) || attempt === 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }
  throw last;
};

const displayName = (row: Record<string, unknown>) => {
  const parts = [text(row.first_name), text(row.middle_name), text(row.last_name)].filter(Boolean);
  return text(row.full_name) || parts.join(' ');
};

export const readShiftSettings = async (): Promise<ShiftSettings> => {
  const connection = await pool();
  const result = await connection.request().query(`SELECT TOP 1 * FROM [tsmgmt].[ShiftSettings]`);
  const row = result.recordset?.[0] || {};
  return {
    dayStart: text(row.DayStart) || '07:30',
    dayEnd: text(row.DayEnd) || '16:30',
    breakHours: Number(row.BreakHours ?? 1),
    expectedHours: Number(row.ExpectedHours ?? 8),
    nightStart: text(row.NightStart) || '18:00',
    nightAllowance: Number(row.NightAllowance ?? 1500),
  };
};

export const readHolidayForDate = async (workDate: string): Promise<HolidayHit> => {
  const connection = await pool();
  const result = await connection.request().input('WorkDate', sql.Date, workDate).query(`
    SELECT TOP 1 [Id],[Name],[HolidayDate],[HolidayType],[Scope]
    FROM [tsmgmt].[PublicHolidays]
    WHERE [HolidayDate] = @WorkDate AND [Status] = N'Active' AND [TimesheetApplicable] = 1
  `);
  const row = result.recordset?.[0];
  if (!row) return null;
  return { id: text(row.Id), name: text(row.Name), date: dateOnly(row.HolidayDate), holidayType: text(row.HolidayType), scope: text(row.Scope) };
};

export const classifyWorkDate = async (workDate: string, frozen?: { dayKind: string; holidayName: string } | null) => {
  if (frozen?.dayKind) return { dayKind: frozen.dayKind, holidayName: frozen.holidayName || '' };
  const holiday = await readHolidayForDate(workDate);
  if (holiday) return { dayKind: 'Public Holiday', holidayName: holiday.name };
  const date = new Date(`${workDate}T00:00:00`);
  const day = date.getDay();
  if (day === 0) return { dayKind: 'Sunday', holidayName: '' };
  if (day === 6) return { dayKind: 'Saturday', holidayName: '' };
  return { dayKind: 'Weekday', holidayName: '' };
};

export const searchTimesheetEntry = async (kind: string, query: string, workDate = '') => {
  const connection = await pool();
  const q = text(query);
  if (kind === 'project') {
    const result = await connection.request().input('q', sql.NVarChar(80), `%${q}%`).query(`
      SELECT TOP 20 [Code],[Name], ISNULL([ClientName], N'') AS ClientName, ISNULL([ProjectManager], N'') AS ProjectManager
      FROM [hris].[TimesheetProjects]
      WHERE [Status] = N'Active' AND (@q = N'%%' OR [Code] LIKE @q OR [Name] LIKE @q OR ISNULL([ClientName], N'') LIKE @q)
      ORDER BY [Code]
    `);
    return (result.recordset || []).map((row) => ({ code: text(row.Code), name: text(row.Name), client: text(row.ClientName), manager: text(row.ProjectManager), kind: 'Project' }));
  }
  if (kind === 'activity') {
    const result = await connection.request().query(`SELECT [Code],[Name] FROM [tsmgmt].[InternalActivities] WHERE [Status] = N'Active' ORDER BY [Name]`);
    return (result.recordset || []).map((row) => ({ code: text(row.Code), name: text(row.Name), client: '', manager: '', kind: 'Internal' }));
  }
  if (kind === 'supervisor') {
    const tokens = q.split(/\s+/).map((token) => token.trim()).filter(Boolean).slice(0, 4);
    const request = connection.request();
    const tokenSql = tokens.length
      ? tokens.map((token, index) => {
        request.input(`t${index}`, sql.NVarChar(80), `%${token}%`);
        return `(
          UPPER(v.employee_code) LIKE UPPER(@t${index})
          OR UPPER(alias.[code]) LIKE UPPER(@t${index})
          OR UPPER(v.full_name) LIKE UPPER(@t${index})
          OR UPPER(ISNULL(v.first_name, N'')) LIKE UPPER(@t${index})
          OR UPPER(ISNULL(v.middle_name, N'')) LIKE UPPER(@t${index})
          OR UPPER(ISNULL(v.last_name, N'')) LIKE UPPER(@t${index})
        )`;
      }).join(' AND ')
      : '1 = 1';
    const result = await request.query(`
      WITH [Managers] AS (
        SELECT DISTINCT LTRIM(RTRIM(LEFT(src.[label], NULLIF(CHARINDEX(N' - ', src.[label] + N' - '), 0) - 1))) AS [code]
        FROM (
          SELECT [reporting_manager] AS [label] FROM [hris].[EmployeeMasterView] WHERE ISNULL([reporting_manager], N'') <> N''
          UNION ALL
          SELECT [functional_manager] FROM [hris].[EmployeeJobInfo] WHERE ISNULL([functional_manager], N'') <> N''
          UNION ALL
          SELECT [department_head] FROM [hris].[EmployeeJobInfo] WHERE ISNULL([department_head], N'') <> N''
        ) src
        WHERE ISNULL(src.[label], N'') <> N''
      )
      SELECT v.employee_code, v.full_name, ISNULL(v.first_name, N'') AS first_name, ISNULL(v.middle_name, N'') AS middle_name, ISNULL(v.last_name, N'') AS last_name,
        ISNULL(v.job_title, N'') AS job_title, ISNULL(v.department, N'') AS department,
        COALESCE(NULLIF(v.work_location, N''), NULLIF(j.office_location, N''), N'') AS location,
        (
          SELECT CASE
            WHEN EXISTS (
              SELECT 1
              FROM [hris].[SupervisorEmployeeAssignments] s
              WHERE ISNULL(s.matched_status, N'') <> N'Unresolved'
                AND (
                  s.supervisor_employee_code = v.employee_code
                  OR (alias.[code] <> N'' AND s.supervisor_employee_code IN (alias.[code], N'P' + alias.[code]))
                )
            )
            THEN (
              SELECT COUNT(DISTINCT s.employee_code)
              FROM [hris].[SupervisorEmployeeAssignments] s
              INNER JOIN [hris].[EmployeeMasterView] ev ON ev.employee_code = s.employee_code
              WHERE ISNULL(s.matched_status, N'') <> N'Unresolved'
                AND (
                  s.employee_code LIKE N'C[0-9]%'
                  OR (
                    s.employee_code LIKE N'P[0-9]%'
                    AND EXISTS (
                      SELECT 1 FROM [hris].[EmployeeMasterView] sv
                      WHERE sv.employee_code = s.employee_code
                        AND UPPER(ISNULL(sv.job_title, N'')) LIKE N'%SUPERVISOR%'
                        AND ISNULL(sv.employment_status, N'') NOT LIKE N'%terminated%'
                        AND ISNULL(sv.employment_status, N'') NOT LIKE N'%inactive%'
                    )
                  )
                )
                AND ISNULL(ev.employment_status, N'') NOT LIKE N'%terminated%'
                AND ISNULL(ev.employment_status, N'') NOT LIKE N'%inactive%'
                AND ISNULL(ev.employment_status, N'') NOT LIKE N'%resigned%'
                AND ISNULL(ev.employment_status, N'') NOT LIKE N'%retired%'
                AND (
                  s.supervisor_employee_code = v.employee_code
                  OR (alias.[code] <> N'' AND s.supervisor_employee_code IN (alias.[code], N'P' + alias.[code]))
                )
            )
            ELSE (
              SELECT COUNT(DISTINCT r.employee_code)
              FROM [hris].[EmployeeMasterView] r
              WHERE r.employee_id <> v.employee_id
                AND (
                  r.employee_code LIKE N'C[0-9]%'
                  OR (r.employee_code LIKE N'P[0-9]%' AND UPPER(ISNULL(r.job_title, N'')) LIKE N'%SUPERVISOR%')
                )
                AND ISNULL(r.employment_status, N'') NOT LIKE N'%terminated%'
                AND ISNULL(r.employment_status, N'') NOT LIKE N'%inactive%'
                AND ISNULL(r.employment_status, N'') NOT LIKE N'%resigned%'
                AND ISNULL(r.employment_status, N'') NOT LIKE N'%retired%'
                AND (
                  r.reporting_manager = v.employee_code OR r.reporting_manager LIKE v.employee_code + N' - %'
                  OR (alias.[code] <> N'' AND (r.reporting_manager = N'P' + alias.[code] OR r.reporting_manager LIKE N'P' + alias.[code] + N' - %'))
                )
            )
          END
        ) AS crew
      FROM [hris].[EmployeeMasterView] v
      LEFT JOIN [hris].[EmployeeJobInfo] j ON j.employee_id = v.employee_id
      CROSS APPLY (
        SELECT CASE
          WHEN v.employee_code LIKE N'P[0-9]%' THEN SUBSTRING(v.employee_code, 2, 40)
          WHEN v.employee_code NOT LIKE N'%[^0-9]%' THEN N'P' + v.employee_code
          ELSE N''
        END AS [code]
      ) alias
      WHERE ISNULL(v.employee_code, N'') <> N''
        AND ISNULL(v.employment_status, N'') NOT LIKE N'%terminated%'
        AND ISNULL(v.employment_status, N'') NOT LIKE N'%inactive%'
        AND (
          EXISTS (
            SELECT 1 FROM [hris].[SupervisorEmployeeAssignments] s
            WHERE ISNULL(s.matched_status, N'') <> N'Unresolved' AND s.supervisor_employee_code = v.employee_code
          )
          OR UPPER(ISNULL(v.job_title, N'')) LIKE N'%SUPERVISOR%'
          OR EXISTS (SELECT 1 FROM [Managers] m WHERE m.[code] = v.employee_code OR (alias.[code] <> N'' AND m.[code] = alias.[code]))
        )
        AND ${tokenSql}
      ORDER BY CASE WHEN UPPER(ISNULL(v.job_title, N'')) LIKE N'%SUPERVISOR%' THEN 0 ELSE 1 END, v.full_name
    `);
    return (result.recordset || []).map((row) => ({
      code: text(row.employee_code),
      name: displayName(row),
      title: text(row.job_title),
      department: text(row.department),
      location: text(row.location),
      crew: Number(row.crew || 0),
    }));
  }
  if (kind === 'employee') {
    const leaveCodes = await approvedLeaveCodesForDate(connection, workDate);
    const result = await connection.request().input('q', sql.NVarChar(80), `%${q}%`).query(`
      SELECT v.employee_code, v.full_name, ISNULL(v.first_name, N'') AS first_name, ISNULL(v.middle_name, N'') AS middle_name, ISNULL(v.last_name, N'') AS last_name,
        ISNULL(v.department, N'') AS department,
        COALESCE(NULLIF(v.work_location, N''), NULLIF(j.office_location, N''), N'') AS location
      FROM [hris].[EmployeeMasterView] v
      LEFT JOIN [hris].[EmployeeJobInfo] j ON j.employee_id = v.employee_id
      WHERE v.employee_code LIKE N'C[0-9]%'
        AND ISNULL(v.employment_status, N'') NOT LIKE N'%terminated%'
        AND ISNULL(v.employment_status, N'') NOT LIKE N'%inactive%'
        AND ISNULL(v.employment_status, N'') NOT LIKE N'%resigned%'
        AND ISNULL(v.employment_status, N'') NOT LIKE N'%retired%'
        AND (@q = N'%%' OR v.employee_code LIKE @q OR v.full_name LIKE @q OR v.first_name LIKE @q OR v.last_name LIKE @q OR ISNULL(v.middle_name, N'') LIKE @q)
      ORDER BY v.full_name
    `);
    return (result.recordset || []).map((row) => ({
      code: text(row.employee_code),
      name: displayName(row),
      department: text(row.department),
      location: text(row.location),
      onLeave: leaveCodes.has(text(row.employee_code).toUpperCase()),
    }));
  }
  const like = `%${q}%`;
  const names = new Set<string>();
  const take = async (sqlText: string) => {
    try {
      const result = await connection.request().input('q', sql.NVarChar(120), like).query(sqlText);
      for (const row of result.recordset || []) {
        const name = text(row.name);
        if (name) names.add(name);
      }
    } catch {
      // A missing lookup table must not hide the other sources.
    }
  };
  if (kind === 'department') {
    const result = await connection.request().input('q', sql.NVarChar(120), `%${q}%`).query(`
      SELECT DISTINCT [department] AS name
      FROM [hris].[EmployeeMasterView]
      WHERE ISNULL([department], N'') <> N''
        AND (@q = N'%%' OR [department] LIKE @q)
      ORDER BY [department]
    `);
    return (result.recordset || []).map((row) => ({ name: text(row.name) })).filter((row) => row.name);
  }
  if (kind === 'location') {
    await take(`SELECT DISTINCT [Name] AS name FROM [hris].[TimesheetLocations] WHERE [Name] LIKE @q`);
    await take(`SELECT DISTINCT COALESCE(NULLIF(v.work_location, N''), NULLIF(j.office_location, N'')) AS name FROM [hris].[EmployeeMasterView] v LEFT JOIN [hris].[EmployeeJobInfo] j ON j.employee_id = v.employee_id WHERE COALESCE(NULLIF(v.work_location, N''), NULLIF(j.office_location, N''), N'') LIKE @q`);
    await take(`SELECT DISTINCT [LocationName] AS name FROM [tsmgmt].[CrewAssignments] WHERE ISNULL([LocationName], N'') LIKE @q`);
    return [...names].sort((a, b) => a.localeCompare(b)).map((name) => ({ name }));
  }
  await take(`SELECT DISTINCT [Name] AS name FROM [hris].[TimesheetWorkCenters] WHERE [Status] = N'Active' AND [Name] LIKE @q`);
  await take(`SELECT DISTINCT [WorkCenterName] AS name FROM [tsmgmt].[CrewAssignments] WHERE ISNULL([WorkCenterName], N'') LIKE @q`);
  return [...names].sort((a, b) => a.localeCompare(b)).map((name) => ({ name }));
};

type LoadedTimesheet = {
  id: string;
  reference: string;
  periodId: string;
  workDate: string;
  supervisor: string;
  location: string;
  workCenter: string;
  shift: string;
  status: string;
  version: number;
  dayKind: string;
  holidayName: string;
  frozen: boolean;
  returnReason: string;
  updatedAt: string;
  updatedBy: string;
  lines: Array<{
    id: string;
    employeeCode: string;
    employeeName: string;
    location: string;
    workCenter: string;
    operationalStatus: string;
    attendanceStatus: string;
    attendanceNote: string;
    exceptional: boolean;
    exceptionReason: string;
    nightSession: boolean;
    nightStart: string;
    nightEnd: string;
    nightNote: string;
    allocations: Array<{
      id: string;
      projectCode: string;
      projectName: string;
      kind: string;
      regularHours: number;
      ovtHours: number;
      activity: string;
      chargeCode: string;
      ovtReason: string;
      comment: string;
    }>;
  }>;
};

const loadTimesheet = async (connection: sql.ConnectionPool, timesheetId: string): Promise<LoadedTimesheet | null> => {
  const headerResult = await connection.request().input('Id', sql.NVarChar(40), timesheetId).query(`SELECT * FROM [tsmgmt].[Timesheets] WHERE [Id] = @Id`);
  const header = headerResult.recordset?.[0];
  if (!header) return null;
  const lines = await connection.request().input('Id', sql.NVarChar(40), timesheetId).query(`SELECT * FROM [tsmgmt].[TimesheetEntryLines] WHERE [TimesheetId] = @Id ORDER BY [EmployeeName]`);
  const allocations = await connection.request().input('Id', sql.NVarChar(40), timesheetId).query(`
    SELECT a.* FROM [tsmgmt].[TimesheetAllocations] a
    INNER JOIN [tsmgmt].[TimesheetEntryLines] l ON l.[Id] = a.[LineId]
    WHERE l.[TimesheetId] = @Id
  `);
  const byLine = new Map<string, Record<string, unknown>[]>();
  for (const row of allocations.recordset || []) {
    const list = byLine.get(text(row.LineId)) || [];
    list.push(row);
    byLine.set(text(row.LineId), list);
  }
  const sheet = {
    id: text(header.Id),
    reference: text(header.ReferenceCode),
    periodId: text(header.PeriodId),
    workDate: dateOnly(header.WorkDate),
    supervisor: text(header.SupervisorName),
    location: text(header.LocationName),
    workCenter: text(header.WorkCenterName),
    shift: text(header.ShiftLabel),
    status: text(header.Status),
    version: Number(header.VersionNo || 1),
    dayKind: text(header.DayKind),
    holidayName: text(header.HolidayName),
    frozen: Boolean(header.ClassificationFrozen),
    returnReason: text(header.ReturnReason),
    updatedAt: header.UpdatedAt ? new Date(String(header.UpdatedAt)).toISOString() : '',
    updatedBy: text(header.UpdatedBy),
    lines: (lines.recordset || []).filter((row) => isBookableCrewCode(row.EmployeeCode)).map((row) => ({
      id: text(row.Id),
      employeeCode: text(row.EmployeeCode),
      employeeName: text(row.EmployeeName),
      location: text(row.LocationName),
      workCenter: text(row.WorkCenterName),
      operationalStatus: text(row.OperationalStatus),
      attendanceStatus: text(row.AttendanceStatus),
      attendanceNote: text(row.AttendanceNote),
      exceptional: Boolean(row.Exceptional),
      exceptionReason: text(row.ExceptionReason),
      nightSession: Boolean(row.NightSession),
      nightStart: text(row.NightStart),
      nightEnd: text(row.NightEnd),
      nightNote: text(row.NightNote),
      allocations: (byLine.get(text(row.Id)) || []).map((allocation) => ({
        id: text(allocation.Id),
        projectCode: text(allocation.ProjectCode),
        projectName: text(allocation.ProjectName),
        kind: text(allocation.Kind) || 'Project',
        regularHours: hours(allocation.RegularHours),
        ovtHours: hours(allocation.OvtHours),
        activity: text(allocation.Activity),
        chargeCode: text(allocation.ChargeCode),
        ovtReason: text(allocation.OvtReason),
        comment: text(allocation.Comment),
      })),
    })),
  };
  return withoutLeaveNight(connection, sheet);
};

const clearApprovedLeaveNight = async (
  connection: sql.ConnectionPool,
  sheet: { id: string; periodId: string; workDate: string; shift: string },
  employeeCode: string,
) => {
  await connection.request()
    .input('TimesheetId', sql.NVarChar(40), sheet.id)
    .input('Code', sql.NVarChar(80), employeeCode)
    .query(`
      UPDATE [tsmgmt].[TimesheetEntryLines]
      SET [NightSession] = 0, [NightStart] = N'', [NightEnd] = N'', [NightNote] = N''
      WHERE [TimesheetId] = @TimesheetId AND [EmployeeCode] = @Code AND [NightSession] = 1
    `);
  await connection.request()
    .input('PeriodId', sql.NVarChar(40), sheet.periodId)
    .input('WorkDate', sql.Date, sheet.workDate)
    .input('Shift', sql.NVarChar(80), sheet.shift)
    .input('Code', sql.NVarChar(80), employeeCode)
    .query(`
      UPDATE [tsmgmt].[Bookings]
      SET [NightHours] = 0, [UpdatedAt] = SYSUTCDATETIME()
      WHERE [PeriodId] = @PeriodId AND [WorkDate] = @WorkDate AND [ShiftLabel] = @Shift AND [EmployeeCode] = @Code AND [NightHours] <> 0
    `);
};

const withoutLeaveNight = async (connection: sql.ConnectionPool, sheet: LoadedTimesheet): Promise<LoadedTimesheet> => {
  const leaveCodes = await approvedLeaveCodesForDate(connection, sheet.workDate);
  for (const line of sheet.lines) {
    const onLeave = leaveCodes.has(line.employeeCode.toUpperCase()) || line.operationalStatus === 'Approved Leave';
    if (!onLeave) continue;
    line.operationalStatus = 'Approved Leave';
    line.attendanceStatus = line.attendanceStatus || 'Approved Leave';
    if (!line.nightSession && !line.nightStart && !line.nightEnd && !line.nightNote) continue;
    line.nightSession = false;
    line.nightStart = '';
    line.nightEnd = '';
    line.nightNote = '';
    await clearApprovedLeaveNight(connection, sheet, line.employeeCode);
  }
  return sheet;
};

const REVISABLE_TIMESHEET_STATUSES = new Set(['Draft', 'Returned', 'Submitted']);
const WAITING_APPROVAL_STATUSES = new Set(['', 'Open', 'Pending', 'Draft', 'Submitted']);

const canReviseTimesheet = async (connection: sql.ConnectionPool, sheet: { id?: string; version?: number; reference: string; periodId: string; workDate: string; supervisor: string; status: string }) => {
  if (!REVISABLE_TIMESHEET_STATUSES.has(sheet.status)) return false;
  if (sheet.id && await approvalBlocksRevision(connection, sheet.id, sheet.version || 1)) return false;
  try {
    const rows = await connection.request()
      .input('Reference', sql.NVarChar(40), sheet.reference)
      .input('PeriodId', sql.NVarChar(40), sheet.periodId)
      .input('WorkDate', sql.Date, sheet.workDate)
      .input('Supervisor', sql.NVarChar(180), sheet.supervisor)
      .query(`
        SELECT [Status], [TabName]
        FROM [tsmgmt].[Records]
        WHERE [Area] = N'approval'
          AND (
            [ReferenceCode] = @Reference
            OR ([PeriodId] = @PeriodId AND [WorkDate] = @WorkDate AND [SupervisorName] = @Supervisor)
          )
      `);
    return (rows.recordset || []).every((row) => WAITING_APPROVAL_STATUSES.has(text(row.Status)) && (!text(row.TabName) || text(row.TabName) === 'Supervisor'));
  } catch {
    return true;
  }
};

const withRevision = async (connection: sql.ConnectionPool, sheet: Awaited<ReturnType<typeof loadTimesheet>>) => {
  if (!sheet) return null;
  const settings = await readShiftSettings();
  return { ...sheet, settings, editable: await canReviseTimesheet(connection, sheet) };
};

export const listReviewTimesheets = async (input: { periodId: string; workDate: string }) => {
  const connection = await pool();
  const periodId = text(input.periodId);
  const workDate = text(input.workDate);
  if (!periodId || !workDate) throw new Error('Choose a period and a work date.');
  const settings = await readShiftSettings();
  const result = await connection.request()
    .input('PeriodId', sql.NVarChar(40), periodId)
    .input('WorkDate', sql.Date, workDate)
    .query(`
      SELECT t.[Id], t.[ReferenceCode], t.[PeriodId], t.[WorkDate], t.[SupervisorName], t.[ShiftLabel], t.[LocationName], t.[Status], t.[VersionNo], t.[UpdatedAt],
        (SELECT COUNT(1) FROM [tsmgmt].[TimesheetEntryLines] l WHERE l.[TimesheetId] = t.[Id]) AS CrewCount,
        (SELECT ISNULL(SUM(a.[RegularHours]), 0) FROM [tsmgmt].[TimesheetAllocations] a INNER JOIN [tsmgmt].[TimesheetEntryLines] l ON l.[Id] = a.[LineId] WHERE l.[TimesheetId] = t.[Id]) AS RegularHours,
        (SELECT ISNULL(SUM(a.[OvtHours]), 0) FROM [tsmgmt].[TimesheetAllocations] a INNER JOIN [tsmgmt].[TimesheetEntryLines] l ON l.[Id] = a.[LineId] WHERE l.[TimesheetId] = t.[Id]) AS OvtHours
      FROM [tsmgmt].[Timesheets] t
      WHERE t.[PeriodId] = @PeriodId AND t.[WorkDate] = @WorkDate
      ORDER BY t.[SupervisorName], t.[ShiftLabel]
    `);
  const timesheets = await Promise.all((result.recordset || []).map(async (row) => {
    const sheet = {
      id: text(row.Id),
      reference: text(row.ReferenceCode),
      periodId: text(row.PeriodId),
      workDate: dateOnly(row.WorkDate),
      supervisor: text(row.SupervisorName),
      shift: text(row.ShiftLabel) || 'Day',
      location: text(row.LocationName),
      status: text(row.Status),
      version: Number(row.VersionNo || 1),
      updatedAt: row.UpdatedAt ? new Date(String(row.UpdatedAt)).toISOString() : '',
      crew: Number(row.CrewCount || 0),
      regularHours: hours(row.RegularHours),
      ovtHours: hours(row.OvtHours),
    };
    return { ...sheet, editable: await canReviseTimesheet(connection, sheet) };
  }));
  return { settings, timesheets };
};

export const listReviewSupervisors = async (input: { periodId: string; workDate?: string }) => {
  const connection = await pool();
  const periodId = text(input.periodId);
  if (!periodId) return [];
  const workDate = text(input.workDate);
  const request = connection.request().input('PeriodId', sql.NVarChar(40), periodId);
  if (workDate) request.input('WorkDate', sql.Date, workDate);
  const result = await request.query(`
    SELECT DISTINCT [SupervisorName]
    FROM [tsmgmt].[Timesheets]
    WHERE [PeriodId] = @PeriodId
      AND ISNULL([SupervisorName], N'') <> N''
      ${workDate ? 'AND [WorkDate] = @WorkDate' : ''}
    ORDER BY [SupervisorName]
  `);
  return (result.recordset || []).map((row) => text(row.SupervisorName)).filter(Boolean);
};

export const resolveTimesheetEntry = async (input: { periodId: string; workDate: string; supervisor: string; supervisorCode?: string; shift?: string; location?: string }) => {
  const connection = await pool();
  const periodId = text(input.periodId);
  const workDate = dateOnly(input.workDate);
  const supervisor = text(input.supervisor);
  const supervisorCode = extractSupervisorEmployeeCode(input.supervisorCode || supervisor);
  const shift = text(input.shift) || 'Day';
  const location = text(input.location);
  if (!periodId || !workDate || !supervisor) throw new Error('Period, work date, and supervisor are required.');
  const period = await connection.request().input('Id', sql.NVarChar(40), periodId).query(`SELECT [Name],[StartDate],[EndDate],[Status] FROM [tsmgmt].[Periods] WHERE [Id] = @Id`);
  const periodRow = period.recordset?.[0];
  if (!periodRow) throw new Error('Select a timesheet period that exists.');
  const start = dateOnly(periodRow.StartDate);
  const end = dateOnly(periodRow.EndDate);
  const periodStatus = text(periodRow.Status);
  const dateAllowed = workDate >= start && workDate <= end;
  const bookingAllowed = dateAllowed && (periodStatus === 'Open' || periodStatus === 'Planned');
  const existing = await connection.request()
    .input('PeriodId', sql.NVarChar(40), periodId)
    .input('WorkDate', sql.Date, workDate)
    .input('Supervisor', sql.NVarChar(180), supervisor)
    .input('Shift', sql.NVarChar(80), shift)
    .query(`SELECT TOP 1 [Id] FROM [tsmgmt].[Timesheets] WHERE [PeriodId]=@PeriodId AND [WorkDate]=@WorkDate AND [SupervisorName]=@Supervisor AND [ShiftLabel]=@Shift ORDER BY [VersionNo] DESC`);
  const timesheet = existing.recordset?.[0] ? await loadTimesheet(connection, text(existing.recordset[0].Id)) : null;
  const otherShiftName = shift === 'Night' ? 'Day' : 'Night';
  const otherExisting = await connection.request()
    .input('PeriodId', sql.NVarChar(40), periodId)
    .input('WorkDate', sql.Date, workDate)
    .input('Supervisor', sql.NVarChar(180), supervisor)
    .input('Shift', sql.NVarChar(80), otherShiftName)
    .query(`SELECT TOP 1 [Id] FROM [tsmgmt].[Timesheets] WHERE [PeriodId]=@PeriodId AND [WorkDate]=@WorkDate AND [SupervisorName]=@Supervisor AND [ShiftLabel]=@Shift ORDER BY [VersionNo] DESC`);
  const otherSheet = otherExisting.recordset?.[0] ? await loadTimesheet(connection, text(otherExisting.recordset[0].Id)) : null;
  const classification = await classifyWorkDate(workDate, timesheet?.frozen ? { dayKind: timesheet.dayKind, holidayName: timesheet.holidayName } : null);
  const settings = await readShiftSettings();
  const dayHours = Number(settings.expectedHours || 8);
  const leaveCodes = await approvedLeaveCodesForDate(connection, workDate);
  const leaveBookable = classification.dayKind === 'Weekday';
  const contractLeaveIdle = (code: string) => leaveBookable && /^C\d/i.test(code) && leaveCodes.has(code.toUpperCase())
    ? [{ id: '', projectCode: 'DL1949', projectName: 'IDLE TIME', kind: 'Project', regularHours: dayHours, ovtHours: 0, activity: '', chargeCode: '', ovtReason: '', comment: 'Approved paid leave' }]
    : [];
  const withoutNonWorkingLeave = <T extends { employeeCode?: string; allocations?: Array<{ projectCode?: string; comment?: string; ovtReason?: string }> }>(line: T): T => {
    if (leaveBookable || !/^C\d/i.test(text(line.employeeCode))) return line;
    const allocations = (line.allocations || []).filter((item) => {
      const paidLeave = text(item.projectCode).toUpperCase() === 'DL1949' && /approved paid leave/i.test(`${text(item.comment)} ${text(item.ovtReason)}`);
      return !paidLeave;
    });
    return { ...line, allocations };
  };
  let crew: Array<Record<string, unknown>> = [];
  let legacyOffshoreCodes = new Set<string>();
  if (!timesheet) {
    const crewResult = await connection.request().input('WorkDate', sql.Date, workDate).input('Supervisor', sql.NVarChar(180), supervisor).query(`
      SELECT a.[EmployeeCode], a.[EmployeeName], a.[AssignmentType], a.[LocationName], a.[WorkCenterName], a.[OperationalStatus], a.[EffectiveFrom], a.[EffectiveTo]
      FROM [tsmgmt].[CrewAssignments] a
      WHERE a.[Status] = N'Active' AND a.[SupervisorName] = @Supervisor
        AND a.[EffectiveFrom] <= @WorkDate AND (a.[EffectiveTo] IS NULL OR a.[EffectiveTo] >= @WorkDate)
        AND a.[OperationalStatus] <> N'Assignment Ended'
    `);
    const offshore = await connection.request().input('WorkDate', sql.Date, workDate).query(`
      SELECT [EmployeeCode] FROM [tsmgmt].[Records]
      WHERE [Area] = N'offshore' AND [Status] = N'Active' AND [WorkDate] <= @WorkDate AND ([EffectiveTo] IS NULL OR [EffectiveTo] >= @WorkDate)
    `).catch(() => ({ recordset: [] as Record<string, unknown>[] }));
    const offshoreCodes = new Set((offshore.recordset || []).map((row) => text(row.EmployeeCode).toUpperCase()));
    legacyOffshoreCodes = offshoreCodes;
    const seen = new Set<string>();
    crew = [];
    for (const row of crewResult.recordset || []) {
      const code = text(row.EmployeeCode);
      if (!isContractEmployee(code) || seen.has(code)) continue;
      seen.add(code);
      const away = await connection.request().input('Code', sql.NVarChar(80), code).input('WorkDate', sql.Date, workDate).input('Supervisor', sql.NVarChar(180), supervisor).query(`
        SELECT TOP 1 [SupervisorName] FROM [tsmgmt].[CrewAssignments]
        WHERE [EmployeeCode]=@Code AND [AssignmentType]=N'Temporary' AND [Status]=N'Active' AND [SupervisorName]<>@Supervisor
          AND [EffectiveFrom] <= @WorkDate AND ([EffectiveTo] IS NULL OR [EffectiveTo] >= @WorkDate)
      `);
      if (text(row.AssignmentType) === 'Primary' && away.recordset?.[0]) continue;
      let operationalStatus = text(row.OperationalStatus) || 'Active on Crew';
      if (leaveCodes.has(code.toUpperCase())) operationalStatus = 'Approved Leave';
      else if (offshoreCodes.has(code.toUpperCase())) operationalStatus = 'Mobilized Offshore';
      crew.push({
        employeeCode: code,
        employeeName: text(row.EmployeeName),
        location: text(row.LocationName),
        workCenter: text(row.WorkCenterName),
        operationalStatus,
        attendanceStatus: operationalStatus === 'Approved Leave' ? 'Approved Leave' : '',
        allocations: contractLeaveIdle(code),
      });
    }
    if (!crew.length && supervisorCode) {
      const request = connection.request();
      const variants = supervisorCodeLookupVariants(supervisorCode).filter(Boolean);
      if (variants.length) {
      variants.forEach((variant, index) => request.input(`SupervisorCode${index}`, sql.NVarChar(50), variant));
      const assigned = await request.query(`
        SELECT DISTINCT s.employee_code, ISNULL(s.employee_name, N'') AS employee_name,
          COALESCE(NULLIF(v.full_name, N''), NULLIF(s.employee_name, N''), s.employee_code) AS full_name,
          ISNULL(v.job_title, N'') AS job_title,
          COALESCE(NULLIF(v.work_location, N''), NULLIF(j.office_location, N''), N'') AS location,
          COALESCE(NULLIF(j.work_center, N''), N'') AS work_center
        FROM [hris].[SupervisorEmployeeAssignments] s
        LEFT JOIN [hris].[EmployeeMasterView] v ON v.employee_code = s.employee_code
        LEFT JOIN [hris].[EmployeeJobInfo] j ON j.employee_id = v.employee_id
        WHERE ISNULL(s.matched_status, N'') <> N'Unresolved'
          AND ISNULL(s.employee_code, N'') <> N''
          AND s.supervisor_employee_code IN (${variants.map((_, index) => `@SupervisorCode${index}`).join(', ')})
          AND (v.employee_id IS NULL OR (
            ISNULL(v.employment_status, N'') NOT LIKE N'%terminated%'
            AND ISNULL(v.employment_status, N'') NOT LIKE N'%inactive%'
          ))
        ORDER BY full_name
      `);
      const managed = connection.request().input('WorkDate', sql.Date, workDate);
      variants.forEach((variant, index) => managed.input(`ManagerCode${index}`, sql.NVarChar(80), variant));
      const managerMatch = variants.map((_, index) => `
        r.reporting_manager = @ManagerCode${index} OR r.reporting_manager LIKE @ManagerCode${index} + N' - %'
        OR rj.functional_manager = @ManagerCode${index} OR rj.functional_manager LIKE @ManagerCode${index} + N' - %'
        OR rj.department_head = @ManagerCode${index} OR rj.department_head LIKE @ManagerCode${index} + N' - %'
      `).join(' OR ');
      const reports = await managed.query(`
        SELECT DISTINCT r.employee_code,
          COALESCE(NULLIF(r.full_name, N''), r.employee_code) AS full_name,
          ISNULL(r.job_title, N'') AS job_title,
          COALESCE(NULLIF(r.work_location, N''), NULLIF(rj.office_location, N''), N'') AS location,
          COALESCE(NULLIF(rj.work_center, N''), N'') AS work_center
        FROM [hris].[EmployeeMasterView] r
        LEFT JOIN [hris].[EmployeeJobInfo] rj ON rj.employee_id = r.employee_id
        WHERE ISNULL(r.employee_code, N'') <> N''
          AND ISNULL(r.employment_status, N'') NOT LIKE N'%terminated%'
          AND ISNULL(r.employment_status, N'') NOT LIKE N'%inactive%'
          AND (${managerMatch})
        ORDER BY full_name
      `);
      const assignedRows = (assigned.recordset || []).length
        ? (assigned.recordset || [])
        : [...(reports.recordset || [])];
      for (const row of assignedRows) {
        const code = text(row.employee_code);
        const jobTitle = text(row.job_title);
        if ((!isContractEmployee(code) && !isAssignedSupervisor(code, jobTitle)) || seen.has(code) || code.toUpperCase() === supervisorCode.toUpperCase()) continue;
        seen.add(code);
        let operationalStatus = 'Active on Crew';
        if (leaveCodes.has(code.toUpperCase())) operationalStatus = 'Approved Leave';
        else if (offshoreCodes.has(code.toUpperCase())) operationalStatus = 'Mobilized Offshore';
        crew.push({
          employeeCode: code,
          employeeName: text(row.full_name) || text(row.employee_name),
          location: text(row.location),
          workCenter: text(row.work_center),
          operationalStatus,
          attendanceStatus: operationalStatus === 'Approved Leave' ? 'Approved Leave' : '',
          allocations: contractLeaveIdle(code),
          jobTitle,
        });
      }
      }
    }
  } else {
    timesheet.lines = timesheet.lines.filter((line) => isBookableCrewCode(line.employeeCode)).map((line) => {
      const idle = contractLeaveIdle(line.employeeCode);
      if (!idle.length) return withoutNonWorkingLeave({ ...line, nightSession: line.operationalStatus === 'Approved Leave' ? false : line.nightSession, nightStart: line.operationalStatus === 'Approved Leave' ? '' : line.nightStart, nightEnd: line.operationalStatus === 'Approved Leave' ? '' : line.nightEnd, nightNote: line.operationalStatus === 'Approved Leave' ? '' : line.nightNote });
      const already = (line.allocations || []).some((item) => text(item.projectCode).toUpperCase() === 'DL1949' && Number(item.regularHours) > 0);
      return {
        ...line,
        operationalStatus: 'Approved Leave',
        attendanceStatus: line.attendanceStatus || 'Approved Leave',
        nightSession: false,
        nightStart: '',
        nightEnd: '',
        nightNote: '',
        allocations: already ? line.allocations : [...idle, ...(line.allocations || [])],
      };
    });
    timesheet.lines = timesheet.lines.map((line) => {
      const onLeave = leaveCodes.has(text(line.employeeCode).toUpperCase()) || line.operationalStatus === 'Approved Leave' || line.attendanceStatus === 'Approved Leave';
      if (leaveBookable || !onLeave) return line;
      return { ...line, operationalStatus: 'Approved Leave', attendanceStatus: line.attendanceStatus || 'Approved Leave', allocations: [], nightWork: false, nightAllocations: [], nightSession: false, nightStart: '', nightEnd: '', nightNote: '' };
    });
  }
  if (timesheet && otherSheet && shift === 'Day') timesheet.lines = attachNightBand(timesheet.lines, otherSheet.lines);
  if (!timesheet && crew.length) {
    const removed = await confirmedRemovalEmployeeCodes(supervisor);
    crew = crew.filter((row) => (isContractEmployee(row.employeeCode) || isAssignedSupervisor(row.employeeCode, row.jobTitle)) && !removed.has(text(row.employeeCode).toUpperCase()));
  }
  if (!timesheet && otherSheet && shift === 'Day') {
    crew = attachNightBand(crew as CrewHourLine[], otherSheet.lines) as typeof crew;
  }
  {
    const removedFromPeriod = await confirmedRemovalEmployeeCodes(supervisor);
    const presentOnCrew = new Set((timesheet ? timesheet.lines : crew).map((row) => text(row.employeeCode).toUpperCase()));
    const periodCrew = await connection.request()
      .input('PeriodId', sql.NVarChar(40), periodId)
      .input('Supervisor', sql.NVarChar(180), supervisor)
      .input('WorkDate', sql.Date, workDate)
      .query(`
        SELECT [EmployeeCode], [EmployeeName], [LocationName], [WorkCenterName]
        FROM (
          SELECT l.[EmployeeCode], l.[EmployeeName], l.[LocationName], l.[WorkCenterName],
            ROW_NUMBER() OVER (PARTITION BY l.[EmployeeCode] ORDER BY t.[WorkDate] DESC) AS [rn]
          FROM [tsmgmt].[TimesheetEntryLines] l
          INNER JOIN [tsmgmt].[Timesheets] t ON t.[Id] = l.[TimesheetId]
          WHERE t.[PeriodId] = @PeriodId
            AND t.[SupervisorName] = @Supervisor
            AND t.[WorkDate] <> @WorkDate
        ) ranked
        WHERE ranked.[rn] = 1
      `);
    for (const row of periodCrew.recordset || []) {
      const code = text(row.EmployeeCode);
      if (!isBookableCrewCode(code) || presentOnCrew.has(code.toUpperCase()) || removedFromPeriod.has(code.toUpperCase()) || code.toUpperCase() === supervisorCode.toUpperCase()) continue;
      presentOnCrew.add(code.toUpperCase());
      const onLeave = leaveCodes.has(code.toUpperCase());
      const person = {
        id: '',
        employeeCode: code,
        employeeName: text(row.EmployeeName),
        location: text(row.LocationName),
        workCenter: text(row.WorkCenterName),
        operationalStatus: onLeave ? 'Approved Leave' : 'Active on Crew',
        attendanceStatus: onLeave ? 'Approved Leave' : '',
        attendanceNote: '',
        exceptional: false,
        exceptionReason: '',
        allocations: !leaveBookable && onLeave ? [] : contractLeaveIdle(code),
        nightSession: false,
        nightStart: '',
        nightEnd: '',
        nightNote: '',
      };
      if (timesheet) timesheet.lines.push(person);
      else crew.push(person);
    }
  }
  const offshoreCrew = await listActiveMobilizations(workDate).catch(() => []);
  const mobilizedCodes = new Set(offshoreCrew.map((row) => row.employeeCode.toUpperCase()));
  const siteMatches = (site: string) => Boolean(location) && text(site).toLowerCase() === location.toLowerCase();
  const locationIsOffshore = offshoreCrew.some((row) => siteMatches(row.site));
  const offshoreForSupervisor = offshoreCrew.filter((row) => siteMatches(row.site) && namesMatchSupervisor(row.supervisor, supervisor));
  if (supervisorCode && !locationIsOffshore) {
    const supervisorRequest = connection.request();
    const supervisorVariants = supervisorCodeLookupVariants(supervisorCode).filter(Boolean);
    if (supervisorVariants.length) {
      supervisorVariants.forEach((variant, index) => supervisorRequest.input(`LeadCode${index}`, sql.NVarChar(50), variant));
      const leadSupervisors = await supervisorRequest.query(`
        SELECT DISTINCT s.employee_code,
          COALESCE(NULLIF(v.full_name, N''), NULLIF(s.employee_name, N''), s.employee_code) AS full_name,
          ISNULL(v.job_title, N'') AS job_title,
          COALESCE(NULLIF(v.work_location, N''), NULLIF(j.office_location, N''), N'') AS location,
          COALESCE(NULLIF(j.work_center, N''), N'') AS work_center
        FROM [hris].[SupervisorEmployeeAssignments] s
        LEFT JOIN [hris].[EmployeeMasterView] v ON v.employee_code = s.employee_code
        LEFT JOIN [hris].[EmployeeJobInfo] j ON j.employee_id = v.employee_id
        WHERE ISNULL(s.matched_status, N'') <> N'Unresolved'
          AND s.employee_code LIKE N'P[0-9]%'
          AND UPPER(ISNULL(v.job_title, N'')) LIKE N'%SUPERVISOR%'
          AND ISNULL(v.employment_status, N'') NOT LIKE N'%terminated%'
          AND ISNULL(v.employment_status, N'') NOT LIKE N'%inactive%'
          AND s.supervisor_employee_code IN (${supervisorVariants.map((_, index) => `@LeadCode${index}`).join(', ')})
      `);
      const removedSupervisors = await confirmedRemovalEmployeeCodes(supervisor);
      const present = new Set((timesheet ? timesheet.lines : crew).map((row) => text(row.employeeCode).toUpperCase()));
      for (const row of leadSupervisors.recordset || []) {
        const code = text(row.employee_code);
        if (!isAssignedSupervisor(code, row.job_title) || present.has(code.toUpperCase()) || removedSupervisors.has(code.toUpperCase())) continue;
        const onLeave = leaveCodes.has(code.toUpperCase());
        const person = {
          id: '',
          employeeCode: code,
          employeeName: text(row.full_name),
          location: text(row.location),
          workCenter: text(row.work_center),
          operationalStatus: onLeave ? 'Approved Leave' : 'Active on Crew',
          attendanceStatus: onLeave ? 'Approved Leave' : '',
          attendanceNote: '',
          exceptional: false,
          exceptionReason: '',
          allocations: !leaveBookable && onLeave ? [] : contractLeaveIdle(code),
          jobTitle: text(row.job_title),
          nightSession: false,
          nightStart: '',
          nightEnd: '',
          nightNote: '',
        };
        if (timesheet) timesheet.lines.push(person);
        else crew.push(person);
        present.add(code.toUpperCase());
      }
    }
  }
  let message = !dateAllowed ? `Work date ${workDate} is outside ${text(periodRow.Name)} (${start} to ${end}).` : !bookingAllowed ? `${text(periodRow.Name)} is ${periodStatus}. New booking is not open.` : '';
  if (!timesheet && locationIsOffshore) {
    crew = offshoreForSupervisor.map((row) => ({
      employeeCode: row.employeeCode,
      employeeName: row.employeeName,
      location: row.site,
      workCenter: '',
      operationalStatus: 'Mobilized Offshore',
      attendanceStatus: '',
      allocations: [],
    }));
    if (!message) message = offshoreForSupervisor.length
      ? 'These employees are mobilized to this offshore site. Hours stay empty until they are booked on this timesheet.'
      : 'No employees are mobilized to this offshore site for this supervisor on this date.';
  } else if (!timesheet) {
    crew = crew.filter((row) => !mobilizedCodes.has(text(row.employeeCode).toUpperCase()) && !legacyOffshoreCodes.has(text(row.employeeCode).toUpperCase()));
  }
  if (!leaveBookable) {
    const onNonWorkingLeave = (row: { employeeCode?: unknown; operationalStatus?: unknown; attendanceStatus?: unknown }) => {
      const code = text(row.employeeCode).toUpperCase();
      return leaveCodes.has(code) || text(row.operationalStatus) === 'Approved Leave' || text(row.attendanceStatus) === 'Approved Leave';
    };
    if (timesheet) timesheet.lines = timesheet.lines.filter((line) => !onNonWorkingLeave(line));
    crew = crew.filter((row) => !onNonWorkingLeave(row));
  }
  return {
    period: { id: periodId, name: text(periodRow.Name), startDate: start, endDate: end, status: periodStatus },
    dateAllowed,
    bookingAllowed,
    message,
    classification,
    settings,
    timesheet,
    crew,
    offshoreCrew,
    approvedLeaveCodes: [...leaveCodes],
  };
};

type SaveLine = {
  employeeCode: string;
  employeeName: string;
  location?: string;
  workCenter?: string;
  operationalStatus?: string;
  attendanceStatus?: string;
  attendanceNote?: string;
  exceptional?: boolean;
  exceptionReason?: string;
  nightSession?: boolean;
  nightStart?: string;
  nightEnd?: string;
  nightNote?: string;
  nightWork?: boolean;
  allocations?: Array<{ projectCode: string; projectName?: string; kind?: string; regularHours?: number; ovtHours?: number; activity?: string; chargeCode?: string; ovtReason?: string; comment?: string }>;
  nightAllocations?: Array<{ projectCode: string; projectName?: string; kind?: string; regularHours?: number; ovtHours?: number; activity?: string; chargeCode?: string; ovtReason?: string; comment?: string }>;
};

const nightAllocationHours = (allocations: SaveLine['nightAllocations']) =>
  (allocations || []).reduce((sum, item) => sum + hours(item.regularHours) + hours(item.ovtHours), 0);

const nightSignature = (lines: Array<{ employeeCode?: string; nightStart?: string; nightEnd?: string; allocations?: Array<{ projectCode?: string; regularHours?: number; ovtHours?: number }> }>) =>
  lines
    .map((line) => {
      const booked = (line.allocations || [])
        .map((item) => `${text(item.projectCode).toUpperCase()}:${hours(item.regularHours)}:${hours(item.ovtHours)}`)
        .filter((item) => !item.endsWith(':0:0'))
        .sort()
        .join(',');
      return booked ? `${text(line.employeeCode).toUpperCase()}=${booked}@${text(line.nightStart)}-${text(line.nightEnd)}` : '';
    })
    .filter(Boolean)
    .sort()
    .join('|');

const payloadSplitsNight = (shift: string | undefined, lines: SaveLine[]) =>
  (text(shift) || 'Day') === 'Day' && lines.some((line) => Object.prototype.hasOwnProperty.call(line, 'nightWork'));

const syncNightBand = async (
  transaction: sql.Transaction,
  input: { periodId: string; workDate: string; supervisor: string; location?: string; workCenter?: string; lines: SaveLine[] },
  resolved: { settings?: { expectedHours?: number; nightStart?: string }; approvedLeaveCodes?: string[] },
  classification: { dayKind: string; holidayName: string },
  actor: string,
) => {
  const existing = await new sql.Request(transaction)
    .input('PeriodId', sql.NVarChar(40), input.periodId)
    .input('WorkDate', sql.Date, input.workDate)
    .input('Supervisor', sql.NVarChar(180), input.supervisor)
    .query(`SELECT TOP 1 [Id] FROM [tsmgmt].[Timesheets] WHERE [PeriodId]=@PeriodId AND [WorkDate]=@WorkDate AND [SupervisorName]=@Supervisor AND [ShiftLabel]=N'Night' ORDER BY [VersionNo] DESC`);
  let nightId = text(existing.recordset?.[0]?.Id);
  const dayHours = Number(resolved.settings?.expectedHours || 8);
  const defaultStart = text(resolved.settings?.nightStart) || '18:00';
  const blocked = (line: SaveLine) => {
    const code = text(line.employeeCode).toUpperCase();
    return (resolved.approvedLeaveCodes || []).includes(code) || text(line.operationalStatus) === 'Approved Leave' || text(line.attendanceStatus) === 'Approved Leave';
  };
  const writing = (input.lines || []).filter((line) => line.nightWork && !blocked(line) && isBookableCrewCode(line.employeeCode) && text(line.employeeName) && nightAllocationHours(line.nightAllocations) > 0);
  if (!writing.length) {
    if (!nightId) return;
    const clearing = (input.lines || []).filter((line) => !line.nightWork && isBookableCrewCode(line.employeeCode)).map((line) => text(line.employeeCode));
    if (!clearing.length) return;
    const probe = new sql.Request(transaction).input('TimesheetId', sql.NVarChar(40), nightId);
    clearing.forEach((code, index) => probe.input(`Code${index}`, sql.NVarChar(80), code));
    const present = await probe.query(`SELECT TOP 1 1 AS [Hit] FROM [tsmgmt].[TimesheetEntryLines] WHERE [TimesheetId]=@TimesheetId AND [EmployeeCode] IN (${clearing.map((_, index) => `@Code${index}`).join(', ')})`);
    if (!present.recordset?.length) return;
  }
  if (!nightId) {
    nightId = newId('ts');
    const reference = `TS-${input.workDate.slice(0, 7)}-${nightId.slice(-8).toUpperCase()}`;
    await new sql.Request(transaction)
      .input('Id', sql.NVarChar(40), nightId)
      .input('Reference', sql.NVarChar(40), reference)
      .input('PeriodId', sql.NVarChar(40), input.periodId)
      .input('WorkDate', sql.Date, input.workDate)
      .input('Supervisor', sql.NVarChar(180), input.supervisor)
      .input('Location', sql.NVarChar(180), text(input.location))
      .input('WorkCenter', sql.NVarChar(180), text(input.workCenter))
      .input('DayKind', sql.NVarChar(20), classification.dayKind)
      .input('HolidayName', sql.NVarChar(180), classification.holidayName)
      .input('Actor', sql.NVarChar(120), actor)
      .query(`
        INSERT INTO [tsmgmt].[Timesheets] ([Id],[ReferenceCode],[PeriodId],[WorkDate],[SupervisorName],[LocationName],[WorkCenterName],[ShiftLabel],[Status],[VersionNo],[DayKind],[HolidayName],[CreatedBy],[UpdatedBy])
        VALUES (@Id,@Reference,@PeriodId,@WorkDate,@Supervisor,@Location,@WorkCenter,N'Night',N'Draft',1,@DayKind,@HolidayName,@Actor,@Actor)
      `);
  } else {
    await new sql.Request(transaction)
      .input('Id', sql.NVarChar(40), nightId)
      .input('DayKind', sql.NVarChar(20), classification.dayKind)
      .input('HolidayName', sql.NVarChar(180), classification.holidayName)
      .input('Actor', sql.NVarChar(120), actor)
      .query(`UPDATE [tsmgmt].[Timesheets] SET [VersionNo]=[VersionNo]+1,[DayKind]=@DayKind,[HolidayName]=@HolidayName,[Status]=N'Draft',[UpdatedAt]=SYSUTCDATETIME(),[UpdatedBy]=@Actor WHERE [Id]=@Id`);
  }
  for (const line of input.lines || []) {
    const code = text(line.employeeCode);
    const name = text(line.employeeName);
    if (!isBookableCrewCode(code) || !name) continue;
    await new sql.Request(transaction)
      .input('TimesheetId', sql.NVarChar(40), nightId)
      .input('Code', sql.NVarChar(80), code)
      .query(`
        DELETE a FROM [tsmgmt].[TimesheetAllocations] a INNER JOIN [tsmgmt].[TimesheetEntryLines] l ON l.[Id]=a.[LineId] WHERE l.[TimesheetId]=@TimesheetId AND l.[EmployeeCode]=@Code;
        DELETE FROM [tsmgmt].[TimesheetEntryLines] WHERE [TimesheetId]=@TimesheetId AND [EmployeeCode]=@Code;
      `);
    await new sql.Request(transaction)
      .input('PeriodId', sql.NVarChar(40), input.periodId)
      .input('WorkDate', sql.Date, input.workDate)
      .input('Supervisor', sql.NVarChar(180), input.supervisor)
      .input('Code', sql.NVarChar(80), code)
      .query(`DELETE FROM [tsmgmt].[Bookings] WHERE [PeriodId]=@PeriodId AND [WorkDate]=@WorkDate AND [SupervisorName]=@Supervisor AND [ShiftLabel]=N'Night' AND [EmployeeCode]=@Code`);
    if (!line.nightWork || blocked(line) || nightAllocationHours(line.nightAllocations) <= 0) continue;
    const lineId = newId('ln');
    const start = text(line.nightStart) || defaultStart;
    await new sql.Request(transaction)
      .input('Id', sql.NVarChar(40), lineId)
      .input('TimesheetId', sql.NVarChar(40), nightId)
      .input('EmployeeCode', sql.NVarChar(80), code)
      .input('EmployeeName', sql.NVarChar(220), name)
      .input('Location', sql.NVarChar(180), text(line.location))
      .input('WorkCenter', sql.NVarChar(180), text(line.workCenter))
      .input('OperationalStatus', sql.NVarChar(80), text(line.operationalStatus))
      .input('AttendanceStatus', sql.NVarChar(40), text(line.attendanceStatus))
      .input('AttendanceNote', sql.NVarChar(500), text(line.attendanceNote))
      .input('Exceptional', sql.Bit, line.exceptional ? 1 : 0)
      .input('ExceptionReason', sql.NVarChar(500), text(line.exceptionReason))
      .input('NightStart', sql.NVarChar(8), start)
      .input('NightEnd', sql.NVarChar(8), text(line.nightEnd))
      .input('NightNote', sql.NVarChar(500), text(line.nightNote))
      .query(`
        INSERT INTO [tsmgmt].[TimesheetEntryLines] ([Id],[TimesheetId],[EmployeeCode],[EmployeeName],[LocationName],[WorkCenterName],[OperationalStatus],[AttendanceStatus],[AttendanceNote],[Exceptional],[ExceptionReason],[NightSession],[NightStart],[NightEnd],[NightNote])
        VALUES (@Id,@TimesheetId,@EmployeeCode,@EmployeeName,@Location,@WorkCenter,@OperationalStatus,@AttendanceStatus,@AttendanceNote,@Exceptional,@ExceptionReason,1,@NightStart,@NightEnd,@NightNote)
      `);
    const projectHours: Record<string, number> = {};
    let regular = 0;
    let ovt = 0;
    let regularRemaining = dayHours;
    const nightAllocations = (line.nightAllocations || []).filter((item) => classification.dayKind === 'Weekday' || !(text(item.projectCode).toUpperCase() === 'DL1949' && /approved paid leave/i.test(`${text(item.comment)} ${text(item.ovtReason)}`)));
    for (const allocation of nightAllocations) {
      const projectCode = text(allocation.projectCode);
      if (!projectCode) continue;
      const regularHours = Math.min(hours(allocation.regularHours), regularRemaining);
      regularRemaining -= regularHours;
      const ovtHours = hours(allocation.ovtHours);
      regular += regularHours;
      ovt += ovtHours;
      projectHours[projectCode] = (projectHours[projectCode] || 0) + regularHours;
      await new sql.Request(transaction)
        .input('Id', sql.NVarChar(40), newId('al'))
        .input('LineId', sql.NVarChar(40), lineId)
        .input('ProjectCode', sql.NVarChar(80), projectCode)
        .input('ProjectName', sql.NVarChar(220), text(allocation.projectName))
        .input('Kind', sql.NVarChar(20), text(allocation.kind) || 'Project')
        .input('RegularHours', sql.Decimal(9, 2), regularHours)
        .input('OvtHours', sql.Decimal(9, 2), ovtHours)
        .input('Activity', sql.NVarChar(180), text(allocation.activity))
        .input('ChargeCode', sql.NVarChar(80), text(allocation.chargeCode))
        .input('OvtReason', sql.NVarChar(300), text(allocation.ovtReason))
        .input('Comment', sql.NVarChar(500), text(allocation.comment))
        .query(`
          INSERT INTO [tsmgmt].[TimesheetAllocations] ([Id],[LineId],[ProjectCode],[ProjectName],[Kind],[RegularHours],[OvtHours],[Activity],[ChargeCode],[OvtReason],[Comment])
          VALUES (@Id,@LineId,@ProjectCode,@ProjectName,@Kind,@RegularHours,@OvtHours,@Activity,@ChargeCode,@OvtReason,@Comment)
        `);
    }
    await new sql.Request(transaction)
      .input('Id', sql.NVarChar(40), newId('bk'))
      .input('PeriodId', sql.NVarChar(40), input.periodId)
      .input('WorkDate', sql.Date, input.workDate)
      .input('Supervisor', sql.NVarChar(180), input.supervisor)
      .input('Location', sql.NVarChar(180), text(line.location))
      .input('WorkCenter', sql.NVarChar(180), text(line.workCenter))
      .input('EmployeeCode', sql.NVarChar(80), code)
      .input('EmployeeName', sql.NVarChar(220), name)
      .input('ProjectHours', sql.NVarChar(sql.MAX), JSON.stringify(projectHours))
      .input('RegularHours', sql.Decimal(9, 2), regular)
      .input('OvtHours', sql.Decimal(9, 2), ovt)
      .input('AttendanceStatus', sql.NVarChar(40), text(line.attendanceStatus))
      .input('Actor', sql.NVarChar(120), actor)
      .query(`
        MERGE [tsmgmt].[Bookings] AS target
        USING (SELECT @PeriodId AS PeriodId, @WorkDate AS WorkDate, @EmployeeCode AS EmployeeCode, N'Night' AS ShiftLabel) AS source
        ON target.[PeriodId]=source.PeriodId AND target.[WorkDate]=source.WorkDate AND target.[EmployeeCode]=source.EmployeeCode AND target.[ShiftLabel]=source.ShiftLabel
        WHEN MATCHED THEN UPDATE SET [SupervisorName]=@Supervisor,[LocationName]=@Location,[WorkCenterName]=@WorkCenter,[EmployeeName]=@EmployeeName,[ProjectHoursJson]=@ProjectHours,[RegularHours]=@RegularHours,[OvtHours]=@OvtHours,[NightHours]=1,[AttendanceStatus]=@AttendanceStatus,[Status]=N'Draft',[UpdatedAt]=SYSUTCDATETIME(),[UpdatedBy]=@Actor
        WHEN NOT MATCHED THEN INSERT ([Id],[PeriodId],[WorkDate],[SupervisorName],[LocationName],[WorkCenterName],[ShiftLabel],[EmployeeCode],[EmployeeName],[ProjectHoursJson],[RegularHours],[OvtHours],[NightHours],[AttendanceStatus],[Status],[CreatedBy],[UpdatedBy])
        VALUES (@Id,@PeriodId,@WorkDate,@Supervisor,@Location,@WorkCenter,N'Night',@EmployeeCode,@EmployeeName,@ProjectHours,@RegularHours,@OvtHours,1,@AttendanceStatus,N'Draft',@Actor,@Actor);
      `);
  }
};

const loadDaySheetWithNightBand = async (connection: sql.ConnectionPool, timesheetId: string, shift: string) => {
  const saved = await loadTimesheet(connection, timesheetId);
  if (!saved || shift !== 'Day') return saved;
  const night = await connection.request()
    .input('PeriodId', sql.NVarChar(40), saved.periodId)
    .input('WorkDate', sql.Date, saved.workDate)
    .input('Supervisor', sql.NVarChar(180), saved.supervisor)
    .query(`SELECT TOP 1 [Id] FROM [tsmgmt].[Timesheets] WHERE [PeriodId]=@PeriodId AND [WorkDate]=@WorkDate AND [SupervisorName]=@Supervisor AND [ShiftLabel]=N'Night' ORDER BY [VersionNo] DESC`);
  const nightId = text(night.recordset?.[0]?.Id);
  if (!nightId) return saved;
  const nightSheet = await loadTimesheet(connection, nightId);
  if (!nightSheet) return saved;
  saved.lines = attachNightBand(saved.lines, nightSheet.lines);
  return saved;
};

export const saveTimesheetEntry = async (input: {
  id?: string;
  periodId: string;
  workDate: string;
  supervisor: string;
  location?: string;
  workCenter?: string;
  shift?: string;
  lines: SaveLine[];
  actor: string;
  action: 'save' | 'review';
}) => {
  const resolved = await resolveTimesheetEntry(input);
  if (!resolved.dateAllowed) throw new Error(resolved.message);
  if (!resolved.timesheet && !resolved.bookingAllowed) throw new Error(resolved.message);
  const connection = await pool();
  await clearWeekendLeaveHours(connection).catch(() => undefined);
  if (resolved.timesheet && !(await canReviseTimesheet(connection, resolved.timesheet))) throw new Error('Approval has started for this timesheet. It can no longer be edited.');
  const splitsNight = payloadSplitsNight(input.shift, input.lines || []);
  let nightDirty = false;
  if (splitsNight) {
    const payloadCodes = new Set((input.lines || []).map((line) => text(line.employeeCode).toUpperCase()));
    const payloadSig = nightSignature((input.lines || []).filter((line) => line.nightWork).map((line) => ({ employeeCode: line.employeeCode, nightStart: line.nightStart, nightEnd: line.nightEnd, allocations: line.nightAllocations })));
    const nightRow = await connection.request()
      .input('PeriodId', sql.NVarChar(40), input.periodId)
      .input('WorkDate', sql.Date, input.workDate)
      .input('Supervisor', sql.NVarChar(180), input.supervisor)
      .query(`SELECT TOP 1 [Id] FROM [tsmgmt].[Timesheets] WHERE [PeriodId]=@PeriodId AND [WorkDate]=@WorkDate AND [SupervisorName]=@Supervisor AND [ShiftLabel]=N'Night' ORDER BY [VersionNo] DESC`);
    const nightId = text(nightRow.recordset?.[0]?.Id);
    const nightSheet = nightId ? await loadTimesheet(connection, nightId) : null;
    nightDirty = payloadSig !== nightSignature((nightSheet?.lines || []).filter((line) => payloadCodes.has(text(line.employeeCode).toUpperCase())));
    if (nightDirty && nightSheet && !(await canReviseTimesheet(connection, nightSheet))) throw new Error('Approval has started for the night timesheet. Night hours on this date can no longer be edited.');
  }
  const actor = text(input.actor) || 'Timesheet User';
  const classification = resolved.timesheet?.frozen
    ? { dayKind: resolved.timesheet.dayKind, holidayName: resolved.timesheet.holidayName }
    : resolved.classification;
  return withDeadlockRetry(async () => {
  const transaction = new sql.Transaction(connection);
  await transaction.begin();
  try {
    let timesheetId = resolved.timesheet?.id || '';
    let version = resolved.timesheet?.version || 1;
    if (!timesheetId) {
      timesheetId = newId('ts');
      const reference = `TS-${input.workDate.slice(0, 7)}-${timesheetId.slice(-8).toUpperCase()}`;
      await new sql.Request(transaction)
        .input('Id', sql.NVarChar(40), timesheetId)
        .input('Reference', sql.NVarChar(40), reference)
        .input('PeriodId', sql.NVarChar(40), input.periodId)
        .input('WorkDate', sql.Date, input.workDate)
        .input('Supervisor', sql.NVarChar(180), input.supervisor)
        .input('Location', sql.NVarChar(180), text(input.location))
        .input('WorkCenter', sql.NVarChar(180), text(input.workCenter))
        .input('Shift', sql.NVarChar(80), text(input.shift) || 'Day')
        .input('DayKind', sql.NVarChar(20), classification.dayKind)
        .input('HolidayName', sql.NVarChar(180), classification.holidayName)
        .input('Actor', sql.NVarChar(120), actor)
        .query(`
          INSERT INTO [tsmgmt].[Timesheets] ([Id],[ReferenceCode],[PeriodId],[WorkDate],[SupervisorName],[LocationName],[WorkCenterName],[ShiftLabel],[Status],[VersionNo],[DayKind],[HolidayName],[CreatedBy],[UpdatedBy])
          VALUES (@Id,@Reference,@PeriodId,@WorkDate,@Supervisor,@Location,@WorkCenter,@Shift,N'Draft',1,@DayKind,@HolidayName,@Actor,@Actor)
        `);
    } else {
      version += 1;
      await new sql.Request(transaction)
        .input('Id', sql.NVarChar(40), timesheetId)
        .input('Version', sql.Int, version)
        .input('DayKind', sql.NVarChar(20), classification.dayKind)
        .input('HolidayName', sql.NVarChar(180), classification.holidayName)
        .input('Actor', sql.NVarChar(120), actor)
        .query(`UPDATE [tsmgmt].[Timesheets] SET [VersionNo]=@Version,[DayKind]=@DayKind,[HolidayName]=@HolidayName,[Status]=N'Draft',[UpdatedAt]=SYSUTCDATETIME(),[UpdatedBy]=@Actor WHERE [Id]=@Id`);
      await new sql.Request(transaction).input('Id', sql.NVarChar(40), timesheetId).query(`
        DELETE a FROM [tsmgmt].[TimesheetAllocations] a INNER JOIN [tsmgmt].[TimesheetEntryLines] l ON l.[Id]=a.[LineId] WHERE l.[TimesheetId]=@Id;
        DELETE FROM [tsmgmt].[TimesheetEntryLines] WHERE [TimesheetId]=@Id;
        DELETE FROM [tsmgmt].[Bookings] WHERE [PeriodId]=(SELECT [PeriodId] FROM [tsmgmt].[Timesheets] WHERE [Id]=@Id) AND [WorkDate]=(SELECT [WorkDate] FROM [tsmgmt].[Timesheets] WHERE [Id]=@Id) AND [SupervisorName]=(SELECT [SupervisorName] FROM [tsmgmt].[Timesheets] WHERE [Id]=@Id) AND [ShiftLabel]=(SELECT [ShiftLabel] FROM [tsmgmt].[Timesheets] WHERE [Id]=@Id);
      `);
    }
    for (const line of input.lines || []) {
      const code = text(line.employeeCode);
      const name = text(line.employeeName);
      if (!isBookableCrewCode(code) || !name) continue;
      const onLeave = classification.dayKind === 'Weekday' && ((resolved.approvedLeaveCodes || []).includes(code.toUpperCase()) || text(line.operationalStatus) === 'Approved Leave');
      const weekendLeave = classification.dayKind !== 'Weekday' && ((resolved.approvedLeaveCodes || []).includes(code.toUpperCase()) || text(line.operationalStatus) === 'Approved Leave' || text(line.attendanceStatus) === 'Approved Leave');
      if (weekendLeave) continue;
      const nightOn = onLeave || weekendLeave || line.nightWork ? false : Boolean(line.nightSession);
      const operationalStatus = onLeave || weekendLeave ? 'Approved Leave' : text(line.operationalStatus);
      const lineId = newId('ln');
      await new sql.Request(transaction)
        .input('Id', sql.NVarChar(40), lineId)
        .input('TimesheetId', sql.NVarChar(40), timesheetId)
        .input('EmployeeCode', sql.NVarChar(80), code)
        .input('EmployeeName', sql.NVarChar(220), name)
        .input('Location', sql.NVarChar(180), text(line.location))
        .input('WorkCenter', sql.NVarChar(180), text(line.workCenter))
        .input('OperationalStatus', sql.NVarChar(80), operationalStatus)
        .input('AttendanceStatus', sql.NVarChar(40), operationalStatus === 'Approved Leave' ? (text(line.attendanceStatus) || 'Approved Leave') : text(line.attendanceStatus))
        .input('AttendanceNote', sql.NVarChar(500), text(line.attendanceNote))
        .input('Exceptional', sql.Bit, line.exceptional ? 1 : 0)
        .input('ExceptionReason', sql.NVarChar(500), text(line.exceptionReason))
        .input('NightSession', sql.Bit, nightOn ? 1 : 0)
        .input('NightStart', sql.NVarChar(8), nightOn ? text(line.nightStart) : '')
        .input('NightEnd', sql.NVarChar(8), nightOn ? text(line.nightEnd) : '')
        .input('NightNote', sql.NVarChar(500), nightOn ? text(line.nightNote) : '')
        .query(`
          INSERT INTO [tsmgmt].[TimesheetEntryLines] ([Id],[TimesheetId],[EmployeeCode],[EmployeeName],[LocationName],[WorkCenterName],[OperationalStatus],[AttendanceStatus],[AttendanceNote],[Exceptional],[ExceptionReason],[NightSession],[NightStart],[NightEnd],[NightNote])
          VALUES (@Id,@TimesheetId,@EmployeeCode,@EmployeeName,@Location,@WorkCenter,@OperationalStatus,@AttendanceStatus,@AttendanceNote,@Exceptional,@ExceptionReason,@NightSession,@NightStart,@NightEnd,@NightNote)
        `);
      const projectHours: Record<string, number> = {};
      let regular = 0;
      let ovt = 0;
      const dayHours = Number(resolved.settings?.expectedHours || 8);
      const lockedIdle = onLeave && /^C\d/i.test(code);
      const allocations = (weekendLeave
        ? []
        : lockedIdle
        ? [{ projectCode: 'DL1949', projectName: 'IDLE TIME', kind: 'Project', regularHours: dayHours, ovtHours: 0, comment: 'Approved paid leave' }, ...(line.allocations || []).filter((item) => text(item.projectCode).toUpperCase() !== 'DL1949')]
        : (line.allocations || [])
      ).filter((item) => classification.dayKind === 'Weekday' || !(text(item.projectCode).toUpperCase() === 'DL1949' && /approved paid leave/i.test(text(item.comment))));
      const regularCeiling = onLeave && !/^C\d/i.test(code) ? 0 : dayHours;
      let regularRemaining = regularCeiling;
      for (const allocation of allocations) {
        const projectCode = text(allocation.projectCode);
        if (!projectCode) continue;
        const regularHours = Math.min(hours(allocation.regularHours), regularRemaining);
        regularRemaining -= regularHours;
        const ovtHours = hours(allocation.ovtHours);
        regular += regularHours;
        ovt += ovtHours;
        projectHours[projectCode] = (projectHours[projectCode] || 0) + regularHours;
        await new sql.Request(transaction)
          .input('Id', sql.NVarChar(40), newId('al'))
          .input('LineId', sql.NVarChar(40), lineId)
          .input('ProjectCode', sql.NVarChar(80), projectCode)
          .input('ProjectName', sql.NVarChar(220), text(allocation.projectName))
          .input('Kind', sql.NVarChar(20), text(allocation.kind) || 'Project')
          .input('RegularHours', sql.Decimal(9, 2), regularHours)
          .input('OvtHours', sql.Decimal(9, 2), ovtHours)
          .input('Activity', sql.NVarChar(180), text(allocation.activity))
          .input('ChargeCode', sql.NVarChar(80), text(allocation.chargeCode))
          .input('OvtReason', sql.NVarChar(300), text(allocation.ovtReason))
          .input('Comment', sql.NVarChar(500), text(allocation.comment))
          .query(`
            INSERT INTO [tsmgmt].[TimesheetAllocations] ([Id],[LineId],[ProjectCode],[ProjectName],[Kind],[RegularHours],[OvtHours],[Activity],[ChargeCode],[OvtReason],[Comment])
            VALUES (@Id,@LineId,@ProjectCode,@ProjectName,@Kind,@RegularHours,@OvtHours,@Activity,@ChargeCode,@OvtReason,@Comment)
          `);
      }
      await new sql.Request(transaction)
        .input('Id', sql.NVarChar(40), newId('bk'))
        .input('PeriodId', sql.NVarChar(40), input.periodId)
        .input('WorkDate', sql.Date, input.workDate)
        .input('Supervisor', sql.NVarChar(180), input.supervisor)
        .input('Location', sql.NVarChar(180), text(line.location))
        .input('WorkCenter', sql.NVarChar(180), text(line.workCenter))
        .input('Shift', sql.NVarChar(80), text(input.shift) || 'Day')
        .input('EmployeeCode', sql.NVarChar(80), code)
        .input('EmployeeName', sql.NVarChar(220), name)
        .input('ProjectHours', sql.NVarChar(sql.MAX), JSON.stringify(projectHours))
        .input('RegularHours', sql.Decimal(9, 2), regular)
        .input('OvtHours', sql.Decimal(9, 2), ovt)
        .input('NightHours', sql.Decimal(9, 2), nightOn ? 1 : 0)
        .input('AttendanceStatus', sql.NVarChar(40), text(line.attendanceStatus))
        .input('Actor', sql.NVarChar(120), actor)
        .query(`
          MERGE [tsmgmt].[Bookings] AS target
          USING (SELECT @PeriodId AS PeriodId, @WorkDate AS WorkDate, @EmployeeCode AS EmployeeCode, @Shift AS ShiftLabel) AS source
          ON target.[PeriodId]=source.PeriodId AND target.[WorkDate]=source.WorkDate AND target.[EmployeeCode]=source.EmployeeCode AND target.[ShiftLabel]=source.ShiftLabel
          WHEN MATCHED THEN UPDATE SET [SupervisorName]=@Supervisor,[LocationName]=@Location,[WorkCenterName]=@WorkCenter,[EmployeeName]=@EmployeeName,[ProjectHoursJson]=@ProjectHours,[RegularHours]=@RegularHours,[OvtHours]=@OvtHours,[NightHours]=@NightHours,[AttendanceStatus]=@AttendanceStatus,[Status]=N'Draft',[UpdatedAt]=SYSUTCDATETIME(),[UpdatedBy]=@Actor
          WHEN NOT MATCHED THEN INSERT ([Id],[PeriodId],[WorkDate],[SupervisorName],[LocationName],[WorkCenterName],[ShiftLabel],[EmployeeCode],[EmployeeName],[ProjectHoursJson],[RegularHours],[OvtHours],[NightHours],[AttendanceStatus],[Status],[CreatedBy],[UpdatedBy])
          VALUES (@Id,@PeriodId,@WorkDate,@Supervisor,@Location,@WorkCenter,@Shift,@EmployeeCode,@EmployeeName,@ProjectHours,@RegularHours,@OvtHours,@NightHours,@AttendanceStatus,N'Draft',@Actor,@Actor);
        `);
    }
    if (nightDirty) await syncNightBand(transaction, input, resolved, classification, actor);
    const nightBooked = nightDirty ? (input.lines || []).filter((line) => line.nightWork && nightAllocationHours(line.nightAllocations) > 0).length : 0;
    await new sql.Request(transaction)
      .input('TimesheetId', sql.NVarChar(40), timesheetId)
      .input('Action', sql.NVarChar(80), input.action === 'review' ? 'Review requested' : 'Draft saved')
      .input('Detail', sql.NVarChar(1000), `${(input.lines || []).length} employees, version ${version}${nightBooked ? `; night band ${nightBooked}` : ''}${(input.lines || []).some((line) => line.exceptional) ? `; exceptional: ${(input.lines || []).filter((line) => line.exceptional).map((line) => line.employeeCode).join(', ')}` : ''}`)
      .input('Actor', sql.NVarChar(120), actor)
      .query(`INSERT INTO [tsmgmt].[TimesheetEntryAudit] ([TimesheetId],[Action],[Detail],[Actor]) VALUES (@TimesheetId,@Action,@Detail,@Actor)`);
    await transaction.commit();
    return withRevision(connection, await loadDaySheetWithNightBand(connection, timesheetId, text(input.shift) || 'Day'));
  } catch (error) {
    await transaction.rollback().catch(() => undefined);
    throw error;
  }
  });
};

export const listTimesheetEntrySheets = async (status: string) => {
  const connection = await pool();
  const result = await connection.request().input('Status', sql.NVarChar(30), status).query(`
    SELECT t.[Id], t.[ReferenceCode], t.[WorkDate], t.[SupervisorName], t.[LocationName], t.[Status], t.[VersionNo], t.[UpdatedAt], t.[ReturnReason],
      (SELECT COUNT(1) FROM [tsmgmt].[TimesheetEntryLines] l WHERE l.[TimesheetId]=t.[Id]) AS crew
    FROM [tsmgmt].[Timesheets] t
    WHERE (@Status = N'' OR t.[Status] = @Status)
    ORDER BY t.[UpdatedAt] DESC
  `);
  return (result.recordset || []).map((row) => ({
    id: text(row.Id),
    reference: text(row.ReferenceCode),
    workDate: dateOnly(row.WorkDate),
    supervisor: text(row.SupervisorName),
    location: text(row.LocationName),
    status: text(row.Status),
    version: Number(row.VersionNo || 1),
    crew: Number(row.crew || 0),
    updatedAt: row.UpdatedAt ? new Date(String(row.UpdatedAt)).toISOString() : '',
    returnReason: text(row.ReturnReason),
  }));
};

export const readTimesheetEntryById = async (id: string) => {
  const connection = await pool();
  const sheet = await loadTimesheet(connection, text(id));
  if (!sheet) return null;
  const codeResult = await connection.request().input('Name', sql.NVarChar(180), sheet.supervisor).query(`
    SELECT TOP 1 [employee_code]
    FROM [hris].[EmployeeMasterView]
    WHERE [full_name] = @Name OR N'Mr ' + [full_name] = @Name OR N'Mrs ' + [full_name] = @Name
  `);
  const resolved = await resolveTimesheetEntry({
    periodId: sheet.periodId,
    workDate: sheet.workDate,
    supervisor: sheet.supervisor,
    supervisorCode: text(codeResult.recordset?.[0]?.employee_code),
    shift: sheet.shift,
  });
  return withRevision(connection, resolved.timesheet?.id === sheet.id ? resolved.timesheet : sheet);
};

export const submitTimesheetEntry = async (id: string, actor: string) => {
  const connection = await pool();
  const sheet = await loadTimesheet(connection, text(id));
  if (!sheet) throw new Error('Timesheet was not found.');
  if (!(await canReviseTimesheet(connection, sheet))) throw new Error('Approval has started for this timesheet. It can no longer be resubmitted.');
  if (sheet.status === 'Submitted') throw new Error('This timesheet is already submitted. Save your changes, then resubmit.');
  const blocking = sheet.lines.filter((line) => {
    if (line.operationalStatus !== 'Approved Leave') return false;
    const ovt = line.allocations.reduce((sum, item) => sum + item.ovtHours, 0);
    if (/^C\d/i.test(line.employeeCode)) {
      const otherRegular = line.allocations
        .filter((item) => text(item.projectCode).toUpperCase() !== 'DL1949')
        .reduce((sum, item) => sum + item.regularHours, 0);
      return otherRegular > 0 || ovt > 0;
    }
    const regular = line.allocations.reduce((sum, item) => sum + item.regularHours, 0);
    return regular > 0 || ovt > 0;
  });
  if (blocking.length) throw new Error(`${blocking[0].employeeName} is on approved leave and still has booked hours.`);
  await withDeadlockRetry(() => connection.request()
    .input('Id', sql.NVarChar(40), sheet.id)
    .input('Actor', sql.NVarChar(120), text(actor) || 'Timesheet User')
    .query(`
      UPDATE [tsmgmt].[Timesheets] WITH (ROWLOCK) SET [Status]=N'Submitted', [ClassificationFrozen]=1, [UpdatedAt]=SYSUTCDATETIME(), [UpdatedBy]=@Actor WHERE [Id]=@Id;
      UPDATE b SET b.[Status]=N'Submitted', b.[UpdatedAt]=SYSUTCDATETIME(), b.[UpdatedBy]=@Actor
      FROM [tsmgmt].[Bookings] b WITH (ROWLOCK)
      INNER JOIN [tsmgmt].[Timesheets] t ON t.[Id]=@Id
        AND b.[PeriodId]=t.[PeriodId] AND b.[WorkDate]=t.[WorkDate] AND b.[SupervisorName]=t.[SupervisorName];
      INSERT INTO [tsmgmt].[TimesheetEntryAudit] ([TimesheetId],[Action],[Detail],[Actor]) VALUES (@Id, N'Submitted to supervisor', N'Classification frozen', @Actor);
    `));
  await openTimesheetApproval(sheet.id, text(actor) || 'Timesheet User');
  if ((sheet.shift || 'Day') === 'Day') {
    const paired = await connection.request()
      .input('PeriodId', sql.NVarChar(40), sheet.periodId)
      .input('WorkDate', sql.Date, sheet.workDate)
      .input('Supervisor', sql.NVarChar(180), sheet.supervisor)
      .query(`SELECT TOP 1 [Id] FROM [tsmgmt].[Timesheets] WHERE [PeriodId]=@PeriodId AND [WorkDate]=@WorkDate AND [SupervisorName]=@Supervisor AND [ShiftLabel]=N'Night' ORDER BY [VersionNo] DESC`);
    const nightId = text(paired.recordset?.[0]?.Id);
    if (nightId) {
      const night = await loadTimesheet(connection, nightId);
      const hasNightHours = Boolean(night?.lines.some((line) => line.allocations.some((item) => item.regularHours + item.ovtHours > 0) || line.nightSession));
      if (night && hasNightHours && night.status !== 'Submitted' && await canReviseTimesheet(connection, night)) {
        await connection.request()
          .input('Id', sql.NVarChar(40), night.id)
          .input('Actor', sql.NVarChar(120), text(actor) || 'Timesheet User')
          .query(`
            UPDATE [tsmgmt].[Timesheets] SET [Status]=N'Submitted', [ClassificationFrozen]=1, [UpdatedAt]=SYSUTCDATETIME(), [UpdatedBy]=@Actor WHERE [Id]=@Id;
            INSERT INTO [tsmgmt].[TimesheetEntryAudit] ([TimesheetId],[Action],[Detail],[Actor]) VALUES (@Id, N'Submitted to supervisor', N'Night hours booked with the day timesheet', @Actor);
          `);
        await openTimesheetApproval(night.id, text(actor) || 'Timesheet User');
      }
    }
  }
  return withRevision(connection, await loadDaySheetWithNightBand(connection, sheet.id, sheet.shift || 'Day'));
};

export const listPublicHolidays = async () => {
  const connection = await pool();
  const result = await connection.request().query(`SELECT * FROM [tsmgmt].[PublicHolidays] ORDER BY [HolidayDate]`);
  return (result.recordset || []).map((row) => ({
    id: text(row.Id),
    name: text(row.Name),
    date: dateOnly(row.HolidayDate),
    country: text(row.Country),
    region: text(row.Region),
    holidayType: text(row.HolidayType),
    scope: text(row.Scope),
    source: text(row.SourceReference),
    status: text(row.Status),
    year: Number(row.EffectiveYear || 0),
  }));
};

export const savePublicHoliday = async (input: { name: string; date: string; holidayType: string; scope: string; region?: string; source?: string; actor: string }) => {
  const name = text(input.name);
  const date = dateOnly(input.date);
  if (!name || !date) throw new Error('Holiday name and date are required.');
  const connection = await pool();
  const id = newId('ph');
  await connection.request()
    .input('Id', sql.NVarChar(40), id)
    .input('Name', sql.NVarChar(180), name)
    .input('HolidayDate', sql.Date, date)
    .input('HolidayType', sql.NVarChar(40), text(input.holidayType) || 'Declared')
    .input('Scope', sql.NVarChar(40), text(input.scope) || 'National')
    .input('Region', sql.NVarChar(80), text(input.region))
    .input('Source', sql.NVarChar(220), text(input.source))
    .input('Year', sql.Int, Number(date.slice(0, 4)))
    .input('Actor', sql.NVarChar(120), text(input.actor) || 'Timesheet User')
    .query(`
      INSERT INTO [tsmgmt].[PublicHolidays] ([Id],[Name],[HolidayDate],[HolidayType],[Scope],[Region],[SourceReference],[Status],[EffectiveYear],[CreatedBy],[UpdatedBy])
      VALUES (@Id,@Name,@HolidayDate,@HolidayType,@Scope,@Region,@Source,N'Active',@Year,@Actor,@Actor)
    `);
  return id;
};
