import sql from 'mssql';
import { dleEnterpriseLastPoolError, getDleEnterpriseDbPool } from '@/lib/dle-enterprise-db';
import { readTimesheetCrewState, type TimesheetCrewAssignment, type TimesheetCrewEvent, type TimesheetCrewRemoval } from '@/lib/timesheet-crew-store';

export type TimesheetManagementEmployee = {
  code: string;
  name: string;
  supervisor: string;
  location: string;
  workCenter: string;
  department: string;
  employeeType: string;
};

export type TimesheetManagementProject = { code: string; name: string };

export type TimesheetManagementPeriod = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: string;
  captureDeadline: string | null;
  approvalDeadline: string | null;
  notes: string;
};

export type TimesheetManagementBooking = {
  id: string;
  periodId: string;
  workDate: string;
  supervisor: string;
  location: string;
  workCenter: string;
  shift: string;
  employeeCode: string;
  employeeName: string;
  projectHours: Record<string, number>;
  regularHours: number;
  ovtHours: number;
  nightHours: number;
  attendanceStatus: string;
  status: string;
  notes: string;
};

export type TimesheetManagementRecord = {
  id: string;
  area: string;
  tab: string;
  periodId: string;
  employeeCode: string;
  employeeName: string;
  supervisor: string;
  location: string;
  workCenter: string;
  projectCode: string;
  workDate: string;
  effectiveFrom: string;
  effectiveTo: string;
  status: string;
  reference: string;
  payload: Record<string, string>;
  createdBy: string;
  updatedAt: string;
};

export type TimesheetManagementSnapshot = {
  generatedAt: string;
  directory: {
    employees: TimesheetManagementEmployee[];
    projects: TimesheetManagementProject[];
    locations: string[];
    workCenters: string[];
    supervisors: string[];
  };
  periods: TimesheetManagementPeriod[];
  bookings: TimesheetManagementBooking[];
  records: TimesheetManagementRecord[];
  crewAssignments: TimesheetCrewAssignment[];
  crewEvents: TimesheetCrewEvent[];
  crewRemovals: TimesheetCrewRemoval[];
};

const text = (value: unknown) => String(value ?? '').trim();
const dateOnly = (value: unknown) => {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, '0');
    const day = String(value.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  const raw = text(value);
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : '';
};
const dateTime = (value: unknown) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(text(value));
  return Number.isNaN(date.getTime()) ? null : date;
};
const hours = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number * 100) / 100 : 0;
};
const id = () => `tsm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

let ensured = false;

const pool = async () => {
  const connection = await getDleEnterpriseDbPool();
  if (!connection) {
    const detail = dleEnterpriseLastPoolError();
    throw new Error(detail
      ? `Timesheet database connection failed (${detail}).`
      : 'DLE Enterprise database is not configured.');
  }
  if (!ensured) {
    await connection.request().query(`
IF SCHEMA_ID(N'tsmgmt') IS NULL EXEC(N'CREATE SCHEMA [tsmgmt]');
IF OBJECT_ID(N'[tsmgmt].[Periods]', N'U') IS NULL
CREATE TABLE [tsmgmt].[Periods] (
  [Id] NVARCHAR(40) NOT NULL CONSTRAINT [PK_TsmgmtPeriods] PRIMARY KEY,
  [Name] NVARCHAR(80) NOT NULL,
  [StartDate] DATE NOT NULL,
  [EndDate] DATE NOT NULL,
  [Status] NVARCHAR(40) NOT NULL,
  [CaptureDeadline] DATETIME2(0) NULL,
  [ApprovalDeadline] DATETIME2(0) NULL,
  [Notes] NVARCHAR(500) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_TsmgmtPeriods_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [CreatedBy] NVARCHAR(120) NULL,
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_TsmgmtPeriods_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedBy] NVARCHAR(120) NULL
);
IF OBJECT_ID(N'[tsmgmt].[Bookings]', N'U') IS NULL
CREATE TABLE [tsmgmt].[Bookings] (
  [Id] NVARCHAR(40) NOT NULL CONSTRAINT [PK_TsmgmtBookings] PRIMARY KEY,
  [PeriodId] NVARCHAR(40) NOT NULL,
  [WorkDate] DATE NOT NULL,
  [SupervisorName] NVARCHAR(180) NOT NULL CONSTRAINT [DF_TsmgmtBookings_Supervisor] DEFAULT N'',
  [LocationName] NVARCHAR(180) NOT NULL CONSTRAINT [DF_TsmgmtBookings_Location] DEFAULT N'',
  [WorkCenterName] NVARCHAR(180) NOT NULL CONSTRAINT [DF_TsmgmtBookings_WorkCenter] DEFAULT N'',
  [ShiftLabel] NVARCHAR(80) NOT NULL CONSTRAINT [DF_TsmgmtBookings_Shift] DEFAULT N'',
  [EmployeeCode] NVARCHAR(80) NOT NULL,
  [EmployeeName] NVARCHAR(220) NOT NULL,
  [ProjectHoursJson] NVARCHAR(MAX) NOT NULL CONSTRAINT [DF_TsmgmtBookings_ProjectHours] DEFAULT N'{}',
  [RegularHours] DECIMAL(9,2) NOT NULL CONSTRAINT [DF_TsmgmtBookings_Regular] DEFAULT 0,
  [OvtHours] DECIMAL(9,2) NOT NULL CONSTRAINT [DF_TsmgmtBookings_Ovt] DEFAULT 0,
  [NightHours] DECIMAL(9,2) NOT NULL CONSTRAINT [DF_TsmgmtBookings_Night] DEFAULT 0,
  [AttendanceStatus] NVARCHAR(40) NOT NULL CONSTRAINT [DF_TsmgmtBookings_Attendance] DEFAULT N'',
  [Status] NVARCHAR(40) NOT NULL,
  [Notes] NVARCHAR(500) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_TsmgmtBookings_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [CreatedBy] NVARCHAR(120) NULL,
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_TsmgmtBookings_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedBy] NVARCHAR(120) NULL
);
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes i
  INNER JOIN sys.tables t ON t.object_id = i.object_id
  INNER JOIN sys.schemas s ON s.schema_id = t.schema_id
  WHERE i.name = N'UX_TsmgmtBookings_Key' AND t.name = N'Bookings' AND s.name = N'tsmgmt'
)
CREATE UNIQUE INDEX [UX_TsmgmtBookings_Key] ON [tsmgmt].[Bookings]([PeriodId], [WorkDate], [EmployeeCode], [ShiftLabel]);
IF OBJECT_ID(N'[tsmgmt].[Records]', N'U') IS NULL
CREATE TABLE [tsmgmt].[Records] (
  [Id] NVARCHAR(40) NOT NULL CONSTRAINT [PK_TsmgmtRecords] PRIMARY KEY,
  [Area] NVARCHAR(40) NOT NULL,
  [TabName] NVARCHAR(80) NOT NULL,
  [PeriodId] NVARCHAR(40) NULL,
  [EmployeeCode] NVARCHAR(80) NULL,
  [EmployeeName] NVARCHAR(220) NULL,
  [SupervisorName] NVARCHAR(180) NULL,
  [LocationName] NVARCHAR(180) NULL,
  [WorkCenterName] NVARCHAR(180) NULL,
  [ProjectCode] NVARCHAR(80) NULL,
  [WorkDate] DATE NULL,
  [EffectiveFrom] DATE NULL,
  [EffectiveTo] DATE NULL,
  [Status] NVARCHAR(40) NOT NULL,
  [ReferenceCode] NVARCHAR(40) NOT NULL,
  [PayloadJson] NVARCHAR(MAX) NOT NULL CONSTRAINT [DF_TsmgmtRecords_Payload] DEFAULT N'{}',
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_TsmgmtRecords_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [CreatedBy] NVARCHAR(120) NULL,
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_TsmgmtRecords_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedBy] NVARCHAR(120) NULL
);
`);
    ensured = true;
  }
  return connection;
};

const mapPeriod = (row: Record<string, unknown>): TimesheetManagementPeriod => ({
  id: text(row.Id),
  name: text(row.Name),
  startDate: dateOnly(row.StartDate),
  endDate: dateOnly(row.EndDate),
  status: text(row.Status),
  captureDeadline: row.CaptureDeadline ? new Date(String(row.CaptureDeadline)).toISOString() : null,
  approvalDeadline: row.ApprovalDeadline ? new Date(String(row.ApprovalDeadline)).toISOString() : null,
  notes: text(row.Notes),
});

const mapBooking = (row: Record<string, unknown>): TimesheetManagementBooking => {
  let projectHours: Record<string, number> = {};
  try {
    const parsed = JSON.parse(text(row.ProjectHoursJson) || '{}') as Record<string, unknown>;
    projectHours = Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, hours(value)]));
  } catch {
    projectHours = {};
  }
  return {
    id: text(row.Id),
    periodId: text(row.PeriodId),
    workDate: dateOnly(row.WorkDate),
    supervisor: text(row.SupervisorName),
    location: text(row.LocationName),
    workCenter: text(row.WorkCenterName),
    shift: text(row.ShiftLabel),
    employeeCode: text(row.EmployeeCode),
    employeeName: text(row.EmployeeName),
    projectHours,
    regularHours: hours(row.RegularHours),
    ovtHours: hours(row.OvtHours),
    nightHours: hours(row.NightHours),
    attendanceStatus: text(row.AttendanceStatus),
    status: text(row.Status),
    notes: text(row.Notes),
  };
};

const mapRecord = (row: Record<string, unknown>): TimesheetManagementRecord => {
  let payload: Record<string, string> = {};
  try {
    const parsed = JSON.parse(text(row.PayloadJson) || '{}') as Record<string, unknown>;
    payload = Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, text(value)]));
  } catch {
    payload = {};
  }
  return {
    id: text(row.Id),
    area: text(row.Area),
    tab: text(row.TabName),
    periodId: text(row.PeriodId),
    employeeCode: text(row.EmployeeCode),
    employeeName: text(row.EmployeeName),
    supervisor: text(row.SupervisorName),
    location: text(row.LocationName),
    workCenter: text(row.WorkCenterName),
    projectCode: text(row.ProjectCode),
    workDate: dateOnly(row.WorkDate),
    effectiveFrom: dateOnly(row.EffectiveFrom),
    effectiveTo: dateOnly(row.EffectiveTo),
    status: text(row.Status),
    reference: text(row.ReferenceCode),
    payload,
    createdBy: text(row.CreatedBy),
    updatedAt: row.UpdatedAt ? new Date(String(row.UpdatedAt)).toISOString() : '',
  };
};

const readDirectory = async (connection: sql.ConnectionPool): Promise<TimesheetManagementSnapshot['directory']> => {
  const employeesResult = await connection.request().query(`
    SELECT
      v.employee_code,
      v.full_name,
      ISNULL(v.reporting_manager, N'') AS reporting_manager,
      ISNULL(v.department, N'') AS department,
      ISNULL(v.employment_type, N'') AS employment_type,
      COALESCE(NULLIF(v.work_location, N''), NULLIF(j.office_location, N''), N'') AS location
    FROM [hris].[EmployeeMasterView] v
    LEFT JOIN [hris].[EmployeeJobInfo] j ON j.employee_id = v.employee_id
    WHERE v.employee_code LIKE N'C[0-9]%'
      AND ISNULL(v.employment_status, N'') NOT LIKE N'%terminated%'
      AND ISNULL(v.employment_status, N'') NOT LIKE N'%resigned%'
      AND ISNULL(v.employment_status, N'') NOT LIKE N'%retired%'
      AND ISNULL(v.employment_status, N'') NOT LIKE N'%inactive%'
      AND ISNULL(v.employment_status, N'') NOT LIKE N'%deceased%'
    ORDER BY v.employee_code
  `);
  const employees: TimesheetManagementEmployee[] = (employeesResult.recordset || []).map((row) => ({
    code: text(row.employee_code),
    name: text(row.full_name),
    supervisor: text(row.reporting_manager),
    location: text(row.location),
    workCenter: text(row.department),
    department: text(row.department),
    employeeType: text(row.employment_type),
  }));

  let projects: TimesheetManagementProject[] = [];
  let locations: string[] = [];
  let workCenters: string[] = [];
  try {
    const projectResult = await connection.request().query(`
      SELECT [Code], [Name] FROM [hris].[TimesheetProjects] WHERE [Status] = N'Active' ORDER BY [Code]
    `);
    projects = (projectResult.recordset || []).map((row) => ({ code: text(row.Code), name: text(row.Name) }));
  } catch {
    projects = [];
  }
  try {
    const locationResult = await connection.request().query(`SELECT DISTINCT [Name] FROM [hris].[TimesheetLocations] ORDER BY [Name]`);
    locations = (locationResult.recordset || []).map((row) => text(row.Name)).filter(Boolean);
  } catch {
    locations = [];
  }
  try {
    const workCenterResult = await connection.request().query(`
      SELECT [Name] FROM [hris].[TimesheetWorkCenters] WHERE [Status] = N'Active' ORDER BY [Name]
    `);
    workCenters = (workCenterResult.recordset || []).map((row) => text(row.Name)).filter(Boolean);
  } catch {
    workCenters = [];
  }
  const supervisors = [...new Set(employees.map((employee) => employee.supervisor).filter(Boolean))].sort();
  const employeeLocations = employees.map((employee) => employee.location).filter(Boolean);
  return {
    employees,
    projects,
    locations: [...new Set([...locations, ...employeeLocations])].sort(),
    workCenters: [...new Set([...workCenters, ...employees.map((employee) => employee.workCenter).filter(Boolean)])].sort(),
    supervisors,
  };
};

export const readTimesheetManagementSnapshot = async (): Promise<TimesheetManagementSnapshot> => {
  const connection = await pool();
  const [directory, periods, bookings, records, crew] = await Promise.all([
    readDirectory(connection),
    connection.request().query(`SELECT * FROM [tsmgmt].[Periods] ORDER BY [StartDate] DESC, [Name]`),
    connection.request().query(`SELECT * FROM [tsmgmt].[Bookings] ORDER BY [WorkDate] DESC, [EmployeeCode]`),
    connection.request().query(`SELECT * FROM [tsmgmt].[Records] ORDER BY [UpdatedAt] DESC`),
    readTimesheetCrewState(),
  ]);
  return {
    generatedAt: new Date().toISOString(),
    directory,
    periods: (periods.recordset || []).map(mapPeriod),
    bookings: (bookings.recordset || []).map(mapBooking).filter((booking) => /^C\d/i.test(booking.employeeCode)),
    records: (records.recordset || []).map(mapRecord),
    crewAssignments: crew.assignments,
    crewEvents: crew.events,
    crewRemovals: crew.removals,
  };
};

export const createTimesheetManagementPeriod = async (input: {
  name: string;
  startDate: string;
  endDate: string;
  status?: string;
  captureDeadline?: string;
  approvalDeadline?: string;
  notes?: string;
  actor: string;
}) => {
  const startDate = dateOnly(input.startDate);
  const endDate = dateOnly(input.endDate);
  if (!startDate || !endDate) throw new Error('Period start date and end date are required.');
  if (endDate < startDate) throw new Error('Period end date must be on or after the start date.');
  const endMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(endDate);
  const startMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startDate);
  const endMonth = Number(endMatch?.[2]);
  const expectedStartMonth = endMonth === 1 ? 12 : endMonth - 1;
  const expectedStartYear = endMonth === 1 ? Number(endMatch?.[1]) - 1 : Number(endMatch?.[1]);
  if (!endMatch || !startMatch || endMatch[3] !== '15' || startMatch[3] !== '16' || Number(startMatch[2]) !== expectedStartMonth || Number(startMatch[1]) !== expectedStartYear) {
    throw new Error('A timesheet period runs from the 16th of the previous month to the 15th of the month under review.');
  }
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const name = `${monthNames[Number(endMatch[2]) - 1]} ${endMatch[1]} Period`;
  const connection = await pool();
  const periodId = id();
  await connection.request()
    .input('Id', sql.NVarChar(40), periodId)
    .input('Name', sql.NVarChar(80), name)
    .input('StartDate', sql.Date, startDate)
    .input('EndDate', sql.Date, endDate)
    .input('Status', sql.NVarChar(40), text(input.status) || 'Open')
    .input('CaptureDeadline', sql.DateTime2, dateTime(input.captureDeadline))
    .input('ApprovalDeadline', sql.DateTime2, dateTime(input.approvalDeadline))
    .input('Notes', sql.NVarChar(500), text(input.notes))
    .input('Actor', sql.NVarChar(120), text(input.actor) || 'Timesheet User')
    .query(`
      INSERT INTO [tsmgmt].[Periods] ([Id],[Name],[StartDate],[EndDate],[Status],[CaptureDeadline],[ApprovalDeadline],[Notes],[CreatedBy],[UpdatedBy])
      VALUES (@Id,@Name,@StartDate,@EndDate,@Status,@CaptureDeadline,@ApprovalDeadline,@Notes,@Actor,@Actor)
    `);
  return periodId;
};

export const updateTimesheetManagementPeriod = async (input: { id: string; status: string; notes?: string; actor: string }) => {
  const periodId = text(input.id);
  const status = text(input.status);
  if (!periodId || !status) throw new Error('Period and status are required.');
  const connection = await pool();
  const result = await connection.request()
    .input('Id', sql.NVarChar(40), periodId)
    .input('Status', sql.NVarChar(40), status)
    .input('Notes', sql.NVarChar(500), text(input.notes))
    .input('Actor', sql.NVarChar(120), text(input.actor) || 'Timesheet User')
    .query(`
      UPDATE [tsmgmt].[Periods]
      SET [Status] = @Status,
          [Notes] = CASE WHEN @Notes = N'' THEN [Notes] ELSE @Notes END,
          [UpdatedAt] = SYSUTCDATETIME(),
          [UpdatedBy] = @Actor
      WHERE [Id] = @Id
    `);
  if (!result.rowsAffected[0]) throw new Error('Timesheet period was not found.');
};

export const saveTimesheetManagementBookings = async (input: {
  periodId: string;
  workDate: string;
  supervisor: string;
  location: string;
  workCenter: string;
  shift: string;
  status?: string;
  actor: string;
  lines: Array<{
    employeeCode: string;
    employeeName: string;
    projectHours?: Record<string, number>;
    regularHours?: number;
    ovtHours?: number;
    nightHours?: number;
    attendanceStatus?: string;
    notes?: string;
  }>;
}) => {
  const periodId = text(input.periodId);
  const workDate = dateOnly(input.workDate);
  if (!periodId || !workDate) throw new Error('A period and work date are required before hours can be saved.');
  if (!input.lines?.length) throw new Error('Add at least one employee before saving.');
  const connection = await pool();
  const period = await connection.request().input('Id', sql.NVarChar(40), periodId).query(`SELECT [Status] FROM [tsmgmt].[Periods] WHERE [Id] = @Id`);
  const periodStatus = text(period.recordset?.[0]?.Status);
  if (!periodStatus) throw new Error('Select a timesheet period that exists in DLE Enterprise.');
  if (periodStatus === 'Closed' || periodStatus === 'Payroll Locked') throw new Error('This period is locked. Hours cannot be changed.');
  const status = text(input.status) || 'Draft';
  const transaction = new sql.Transaction(connection);
  await transaction.begin();
  try {
    for (const line of input.lines) {
      const employeeCode = text(line.employeeCode);
      const employeeName = text(line.employeeName);
      if (!employeeCode || !employeeName) throw new Error('Each booking line needs an employee from the enterprise directory.');
      const projectHours: Record<string, number> = {};
      for (const [key, value] of Object.entries(line.projectHours || {})) {
        const code = text(key);
        if (code) projectHours[code] = hours(value);
      }
      const regular = Object.values(projectHours).reduce((sum, value) => sum + value, 0) || hours(line.regularHours);
      await new sql.Request(transaction)
        .input('Id', sql.NVarChar(40), id())
        .input('PeriodId', sql.NVarChar(40), periodId)
        .input('WorkDate', sql.Date, workDate)
        .input('SupervisorName', sql.NVarChar(180), text(input.supervisor))
        .input('LocationName', sql.NVarChar(180), text(input.location))
        .input('WorkCenterName', sql.NVarChar(180), text(input.workCenter))
        .input('ShiftLabel', sql.NVarChar(80), text(input.shift))
        .input('EmployeeCode', sql.NVarChar(80), employeeCode)
        .input('EmployeeName', sql.NVarChar(220), employeeName)
        .input('ProjectHoursJson', sql.NVarChar(sql.MAX), JSON.stringify(projectHours))
        .input('RegularHours', sql.Decimal(9, 2), regular)
        .input('OvtHours', sql.Decimal(9, 2), hours(line.ovtHours))
        .input('NightHours', sql.Decimal(9, 2), hours(line.nightHours))
        .input('AttendanceStatus', sql.NVarChar(40), text(line.attendanceStatus))
        .input('Status', sql.NVarChar(40), status)
        .input('Notes', sql.NVarChar(500), text(line.notes))
        .input('Actor', sql.NVarChar(120), text(input.actor) || 'Timesheet User')
        .query(`
          MERGE [tsmgmt].[Bookings] AS target
          USING (SELECT @PeriodId AS PeriodId, @WorkDate AS WorkDate, @EmployeeCode AS EmployeeCode, @ShiftLabel AS ShiftLabel) AS source
          ON target.[PeriodId] = source.PeriodId AND target.[WorkDate] = source.WorkDate AND target.[EmployeeCode] = source.EmployeeCode AND target.[ShiftLabel] = source.ShiftLabel
          WHEN MATCHED THEN UPDATE SET
            [SupervisorName] = @SupervisorName,
            [LocationName] = @LocationName,
            [WorkCenterName] = @WorkCenterName,
            [EmployeeName] = @EmployeeName,
            [ProjectHoursJson] = @ProjectHoursJson,
            [RegularHours] = @RegularHours,
            [OvtHours] = @OvtHours,
            [NightHours] = @NightHours,
            [AttendanceStatus] = @AttendanceStatus,
            [Status] = @Status,
            [Notes] = @Notes,
            [UpdatedAt] = SYSUTCDATETIME(),
            [UpdatedBy] = @Actor
          WHEN NOT MATCHED THEN INSERT (
            [Id],[PeriodId],[WorkDate],[SupervisorName],[LocationName],[WorkCenterName],[ShiftLabel],
            [EmployeeCode],[EmployeeName],[ProjectHoursJson],[RegularHours],[OvtHours],[NightHours],
            [AttendanceStatus],[Status],[Notes],[CreatedBy],[UpdatedBy]
          ) VALUES (
            @Id,@PeriodId,@WorkDate,@SupervisorName,@LocationName,@WorkCenterName,@ShiftLabel,
            @EmployeeCode,@EmployeeName,@ProjectHoursJson,@RegularHours,@OvtHours,@NightHours,
            @AttendanceStatus,@Status,@Notes,@Actor,@Actor
          );
        `);
    }
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

export const createTimesheetManagementRecord = async (input: {
  area: string;
  tab: string;
  periodId?: string;
  employeeCode?: string;
  employeeName?: string;
  supervisor?: string;
  location?: string;
  workCenter?: string;
  projectCode?: string;
  workDate?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  status?: string;
  payload?: Record<string, string>;
  actor: string;
}) => {
  const area = text(input.area);
  const tab = text(input.tab);
  if (!area || !tab) throw new Error('A workspace and tab are required.');
  const connection = await pool();
  const recordId = id();
  const reference = `${area.slice(0, 3).toUpperCase()}-${Date.now().toString().slice(-8)}`;
  const payload = Object.fromEntries(Object.entries(input.payload || {}).map(([key, value]) => [key, text(value)]));
  await connection.request()
    .input('Id', sql.NVarChar(40), recordId)
    .input('Area', sql.NVarChar(40), area)
    .input('TabName', sql.NVarChar(80), tab)
    .input('PeriodId', sql.NVarChar(40), text(input.periodId) || null)
    .input('EmployeeCode', sql.NVarChar(80), text(input.employeeCode) || null)
    .input('EmployeeName', sql.NVarChar(220), text(input.employeeName) || null)
    .input('SupervisorName', sql.NVarChar(180), text(input.supervisor) || null)
    .input('LocationName', sql.NVarChar(180), text(input.location) || null)
    .input('WorkCenterName', sql.NVarChar(180), text(input.workCenter) || null)
    .input('ProjectCode', sql.NVarChar(80), text(input.projectCode) || null)
    .input('WorkDate', sql.Date, dateOnly(input.workDate) || null)
    .input('EffectiveFrom', sql.Date, dateOnly(input.effectiveFrom) || null)
    .input('EffectiveTo', sql.Date, dateOnly(input.effectiveTo) || null)
    .input('Status', sql.NVarChar(40), text(input.status) || 'Open')
    .input('ReferenceCode', sql.NVarChar(40), reference)
    .input('PayloadJson', sql.NVarChar(sql.MAX), JSON.stringify(payload))
    .input('Actor', sql.NVarChar(120), text(input.actor) || 'Timesheet User')
    .query(`
      INSERT INTO [tsmgmt].[Records] (
        [Id],[Area],[TabName],[PeriodId],[EmployeeCode],[EmployeeName],[SupervisorName],[LocationName],[WorkCenterName],
        [ProjectCode],[WorkDate],[EffectiveFrom],[EffectiveTo],[Status],[ReferenceCode],[PayloadJson],[CreatedBy],[UpdatedBy]
      ) VALUES (
        @Id,@Area,@TabName,@PeriodId,@EmployeeCode,@EmployeeName,@SupervisorName,@LocationName,@WorkCenterName,
        @ProjectCode,@WorkDate,@EffectiveFrom,@EffectiveTo,@Status,@ReferenceCode,@PayloadJson,@Actor,@Actor
      )
    `);
  return { id: recordId, reference };
};
