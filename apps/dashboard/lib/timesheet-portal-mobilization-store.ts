import sql from 'mssql';
import { getDleEnterpriseDbPool } from '@/lib/dle-enterprise-db';
import { namesMatchSupervisor } from '@/lib/timesheet-crew-store';
import { openMobilizationApproval } from '@/lib/timesheet-approval-store';

const text = (value: unknown) => String(value ?? '').trim();
const dateOnly = (value: unknown) => {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`;
  }
  const raw = text(value);
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : '';
};
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const OPEN_STATUSES = ['Planned', 'Mobilized', 'Extended'];

export type MobilizationIssue = { severity: 'block' | 'warn'; code: string; message: string };
export type MobilizationCandidate = {
  code: string;
  name: string;
  personId: string;
  department: string;
  workCenter: string;
  supervisor: string;
  location: string;
  employmentStatus: string;
  operationalStatus: string;
  issues: MobilizationIssue[];
};
export type ActiveMobilization = {
  employeeCode: string;
  employeeName: string;
  site: string;
  supervisor: string;
  projectCode: string;
  projectName: string;
  effectiveFrom: string;
  expectedReturn: string;
  status: string;
};

let ensured = false;
const pool = async () => {
  const connection = await getDleEnterpriseDbPool();
  if (!connection) throw new Error('DLE Enterprise database is not configured.');
  if (!ensured) {
    await connection.request().query(`
IF SCHEMA_ID(N'tsmgmt') IS NULL EXEC(N'CREATE SCHEMA [tsmgmt]');
IF OBJECT_ID(N'[tsmgmt].[Mobilizations]', N'U') IS NULL
CREATE TABLE [tsmgmt].[Mobilizations] (
  [Id] NVARCHAR(40) NOT NULL PRIMARY KEY,
  [MobilizationNo] NVARCHAR(40) NOT NULL,
  [PeriodId] NVARCHAR(40) NULL,
  [ProjectCode] NVARCHAR(80) NOT NULL,
  [ProjectName] NVARCHAR(220) NOT NULL,
  [OffshoreSite] NVARCHAR(180) NOT NULL,
  [EffectiveFrom] DATE NOT NULL,
  [ExpectedReturn] DATE NOT NULL,
  [OffshoreSupervisor] NVARCHAR(180) NOT NULL,
  [AuthorizationRef] NVARCHAR(120) NULL,
  [Reason] NVARCHAR(300) NOT NULL,
  [Transport] NVARCHAR(80) NULL,
  [Notes] NVARCHAR(1000) NULL,
  [Status] NVARCHAR(40) NOT NULL,
  [CreatedBy] NVARCHAR(120) NOT NULL,
  [CreatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_tsmgmt_Mobilizations_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedBy] NVARCHAR(120) NULL,
  [UpdatedAt] DATETIME2 NULL
);
IF OBJECT_ID(N'[tsmgmt].[MobilizationEmployees]', N'U') IS NULL
CREATE TABLE [tsmgmt].[MobilizationEmployees] (
  [Id] NVARCHAR(40) NOT NULL PRIMARY KEY,
  [MobilizationId] NVARCHAR(40) NOT NULL,
  [EmployeeCode] NVARCHAR(80) NOT NULL,
  [EmployeeName] NVARCHAR(220) NOT NULL,
  [PersonId] NVARCHAR(80) NULL,
  [HomeSupervisor] NVARCHAR(180) NULL,
  [HomeLocation] NVARCHAR(180) NULL,
  [HomeWorkCenter] NVARCHAR(180) NULL,
  [Department] NVARCHAR(180) NULL,
  [EffectiveFrom] DATE NOT NULL,
  [ExpectedReturn] DATE NOT NULL,
  [RevisedExpectedReturn] DATE NULL,
  [ActualDemobilization] DATE NULL,
  [ActualReturn] DATE NULL,
  [Destination] NVARCHAR(180) NULL,
  [Status] NVARCHAR(40) NOT NULL,
  [ExceptionStatus] NVARCHAR(120) NULL,
  [CreatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_tsmgmt_MobilizationEmployees_CreatedAt] DEFAULT SYSUTCDATETIME()
);
IF OBJECT_ID(N'[tsmgmt].[MobilizationAudit]', N'U') IS NULL
CREATE TABLE [tsmgmt].[MobilizationAudit] (
  [Id] NVARCHAR(40) NOT NULL PRIMARY KEY,
  [MobilizationId] NVARCHAR(40) NOT NULL,
  [EmployeeCode] NVARCHAR(80) NULL,
  [Action] NVARCHAR(80) NOT NULL,
  [PreviousValue] NVARCHAR(500) NULL,
  [NewValue] NVARCHAR(500) NULL,
  [Reason] NVARCHAR(500) NULL,
  [Actor] NVARCHAR(120) NOT NULL,
  [ActorRole] NVARCHAR(120) NULL,
  [CreatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_tsmgmt_MobilizationAudit_CreatedAt] DEFAULT SYSUTCDATETIME()
);
`);
    await connection.request().query(`
IF COL_LENGTH(N'tsmgmt.MobilizationEmployees', N'Destination') IS NULL
  ALTER TABLE [tsmgmt].[MobilizationEmployees] ADD [Destination] NVARCHAR(180) NULL;
`);
    ensured = true;
  }
  return connection;
};

const audit = async (connection: sql.ConnectionPool, input: { mobilizationId: string; employeeCode?: string; action: string; previousValue?: string; newValue?: string; reason?: string; actor: string; role?: string }) => {
  await connection.request()
    .input('Id', sql.NVarChar(40), newId('mba'))
    .input('MobilizationId', sql.NVarChar(40), input.mobilizationId)
    .input('EmployeeCode', sql.NVarChar(80), text(input.employeeCode))
    .input('Action', sql.NVarChar(80), input.action)
    .input('PreviousValue', sql.NVarChar(500), text(input.previousValue))
    .input('NewValue', sql.NVarChar(500), text(input.newValue))
    .input('Reason', sql.NVarChar(500), text(input.reason))
    .input('Actor', sql.NVarChar(120), input.actor)
    .input('Role', sql.NVarChar(120), text(input.role))
    .query(`INSERT INTO [tsmgmt].[MobilizationAudit] ([Id],[MobilizationId],[EmployeeCode],[Action],[PreviousValue],[NewValue],[Reason],[Actor],[ActorRole]) VALUES (@Id,@MobilizationId,@EmployeeCode,@Action,@PreviousValue,@NewValue,@Reason,@Actor,@Role)`);
};

const mapRow = (row: Record<string, unknown>) => ({
  id: text(row.EmployeeRowId || row.Id),
  mobilizationId: text(row.MobilizationId),
  mobilizationNo: text(row.MobilizationNo),
  periodId: text(row.PeriodId),
  employeeCode: text(row.EmployeeCode),
  employeeName: text(row.EmployeeName),
  personId: text(row.PersonId),
  projectCode: text(row.ProjectCode),
  projectName: text(row.ProjectName),
  site: text(row.OffshoreSite),
  effectiveFrom: dateOnly(row.EffectiveFrom),
  expectedReturn: dateOnly(row.RevisedExpectedReturn) || dateOnly(row.ExpectedReturn),
  originalExpectedReturn: dateOnly(row.ExpectedReturn),
  revisedExpectedReturn: dateOnly(row.RevisedExpectedReturn),
  actualDemobilization: dateOnly(row.ActualDemobilization),
  actualReturn: dateOnly(row.ActualReturn),
  destination: text(row.Destination),
  homeSupervisor: text(row.HomeSupervisor),
  offshoreSupervisor: text(row.OffshoreSupervisor),
  homeLocation: text(row.HomeLocation),
  homeWorkCenter: text(row.HomeWorkCenter),
  department: text(row.Department),
  status: text(row.Status),
  exceptionStatus: text(row.ExceptionStatus),
  authorizationRef: text(row.AuthorizationRef),
  reason: text(row.Reason),
  transport: text(row.Transport),
  notes: text(row.Notes),
  createdBy: text(row.CreatedBy),
  createdAt: row.CreatedAt ? new Date(String(row.CreatedAt)).toISOString() : '',
});

const rosterSql = `
  SELECT e.[Id] AS EmployeeRowId, e.[MobilizationId], e.[EmployeeCode], e.[EmployeeName], e.[PersonId], e.[HomeSupervisor], e.[HomeLocation], e.[HomeWorkCenter], e.[Department],
    e.[EffectiveFrom], e.[ExpectedReturn], e.[RevisedExpectedReturn], e.[ActualDemobilization], e.[ActualReturn], e.[Destination], e.[Status], e.[ExceptionStatus],
    h.[MobilizationNo], h.[PeriodId], h.[ProjectCode], h.[ProjectName], h.[OffshoreSite], h.[OffshoreSupervisor], h.[AuthorizationRef], h.[Reason], h.[Transport], h.[Notes], h.[CreatedBy], h.[CreatedAt]
  FROM [tsmgmt].[MobilizationEmployees] e
  INNER JOIN [tsmgmt].[Mobilizations] h ON h.[Id] = e.[MobilizationId]
`;

export const searchMobilizationEmployees = async (query: string) => {
  const connection = await pool();
  const q = text(query);
  const result = await connection.request().input('q', sql.NVarChar(80), `%${q}%`).query(`
    SELECT TOP 30 v.employee_id, v.employee_code, v.full_name,
      ISNULL(v.first_name, N'') AS first_name, ISNULL(v.middle_name, N'') AS middle_name, ISNULL(v.last_name, N'') AS last_name,
      ISNULL(v.department, N'') AS department, ISNULL(v.reporting_manager, N'') AS supervisor, ISNULL(v.employment_status, N'') AS employment_status,
      COALESCE(NULLIF(v.work_location, N''), NULLIF(j.office_location, N''), N'') AS location,
      COALESCE(NULLIF(j.work_center, N''), N'') AS work_center
    FROM [hris].[EmployeeMasterView] v
    LEFT JOIN [hris].[EmployeeJobInfo] j ON j.employee_id = v.employee_id
    WHERE v.employee_code LIKE N'C[0-9]%'
      AND (@q = N'%%' OR v.employee_code LIKE @q OR v.full_name LIKE @q OR v.first_name LIKE @q OR ISNULL(v.middle_name, N'') LIKE @q OR v.last_name LIKE @q OR ISNULL(v.department, N'') LIKE @q OR ISNULL(j.work_center, N'') LIKE @q OR ISNULL(v.reporting_manager, N'') LIKE @q)
    ORDER BY v.full_name
  `);
  return (result.recordset || []).map((row) => ({
    code: text(row.employee_code),
    name: text(row.full_name),
    personId: text(row.employee_id),
    department: text(row.department),
    workCenter: text(row.work_center),
    supervisor: text(row.supervisor),
    location: text(row.location),
    employmentStatus: text(row.employment_status),
  }));
};

export const searchOffshoreSites = async (query: string) => {
  const connection = await pool();
  const result = await connection.request().input('q', sql.NVarChar(80), `%${text(query)}%`).query(`
    SELECT DISTINCT TOP 30 [Name] AS name FROM [hris].[TimesheetLocations]
    WHERE ISNULL([Name], N'') <> N'' AND [Name] LIKE @q
    ORDER BY [Name]
  `);
  const saved = await connection.request().input('q', sql.NVarChar(80), `%${text(query)}%`).query(`
    SELECT DISTINCT TOP 30 [OffshoreSite] AS name FROM [tsmgmt].[Mobilizations]
    WHERE ISNULL([OffshoreSite], N'') <> N'' AND [OffshoreSite] LIKE @q
  `).catch(() => ({ recordset: [] as Record<string, unknown>[] }));
  const names = new Set<string>();
  for (const row of [...(result.recordset || []), ...(saved.recordset || [])]) {
    const name = text(row.name);
    if (name) names.add(name);
  }
  return [...names].sort((a, b) => a.localeCompare(b)).slice(0, 30).map((name) => ({ name }));
};

const loadPeople = async (connection: sql.ConnectionPool, codes: string[]) => {
  if (!codes.length) return [];
  const request = connection.request();
  codes.forEach((code, index) => request.input(`Code${index}`, sql.NVarChar(80), code));
  const list = codes.map((_, index) => `@Code${index}`).join(', ');
  const result = await request.query(`
    SELECT v.employee_id, v.employee_code, v.full_name, ISNULL(v.department, N'') AS department, ISNULL(v.reporting_manager, N'') AS supervisor,
      ISNULL(v.employment_status, N'') AS employment_status, v.date_joined,
      COALESCE(NULLIF(v.work_location, N''), NULLIF(j.office_location, N''), N'') AS location,
      COALESCE(NULLIF(j.work_center, N''), N'') AS work_center
    FROM [hris].[EmployeeMasterView] v
    LEFT JOIN [hris].[EmployeeJobInfo] j ON j.employee_id = v.employee_id
    WHERE v.employee_code IN (${list})
  `);
  return result.recordset || [];
};

export const validateMobilizationEmployees = async (input: { employeeCodes: string[]; effectiveFrom: string; expectedReturn: string }) => {
  const connection = await pool();
  const from = dateOnly(input.effectiveFrom);
  const expected = dateOnly(input.expectedReturn);
  if (!from || !expected) throw new Error('Mobilization date and expected return are required before eligibility can be checked.');
  if (expected < from) throw new Error('Expected return cannot be earlier than the mobilization date.');
  const codes = [...new Set((input.employeeCodes || []).map((code) => text(code).toUpperCase()).filter((code) => /^C\d/.test(code)))];
  const people = await loadPeople(connection, codes);
  const byCode = new Map(people.map((row) => [text(row.employee_code).toUpperCase(), row]));
  const request = connection.request().input('From', sql.Date, from).input('To', sql.Date, expected);
  codes.forEach((code, index) => request.input(`Code${index}`, sql.NVarChar(80), code));
  const list = codes.map((_, index) => `@Code${index}`).join(', ');
  const open = codes.length ? await request.query(`
    SELECT [EmployeeCode], [Status] FROM [tsmgmt].[MobilizationEmployees]
    WHERE [EmployeeCode] IN (${list}) AND [Status] IN (N'Planned', N'Mobilized', N'Extended')
      AND [EffectiveFrom] <= @To AND ISNULL([RevisedExpectedReturn], [ExpectedReturn]) >= @From
      AND ([ActualReturn] IS NULL OR [ActualReturn] >= @From)
  `) : { recordset: [] as Record<string, unknown>[] };
  const openCodes = new Set((open.recordset || []).map((row) => text(row.EmployeeCode).toUpperCase()));
  let leaveCodes = new Set<string>();
  try {
    const leave = await connection.request().input('From', sql.Date, from).input('To', sql.Date, expected).query(`
      SELECT [EmployeeId] FROM [hris].[LeaveApplications]
      WHERE [StatusName] LIKE N'%Approved%' AND [StartDate] <= @To AND [EndDate] >= @From
    `);
    leaveCodes = new Set((leave.recordset || []).map((row) => text(row.EmployeeId).toUpperCase()));
  } catch {
    leaveCodes = new Set();
  }
  const temporaryRequest = connection.request().input('From', sql.Date, from).input('To', sql.Date, expected);
  codes.forEach((code, index) => temporaryRequest.input(`Code${index}`, sql.NVarChar(80), code));
  const temporary = codes.length ? await temporaryRequest.query(`
    SELECT [EmployeeCode], [SupervisorName] FROM [tsmgmt].[CrewAssignments]
    WHERE [EmployeeCode] IN (${list}) AND [AssignmentType] = N'Temporary' AND [Status] = N'Active'
      AND [EffectiveFrom] <= @To AND ([EffectiveTo] IS NULL OR [EffectiveTo] >= @From)
  `).catch(() => ({ recordset: [] as Record<string, unknown>[] })) : { recordset: [] as Record<string, unknown>[] };
  const temporaryCodes = new Set((temporary.recordset || []).map((row) => text(row.EmployeeCode).toUpperCase()));
  const primaryRequest = connection.request().input('From', sql.Date, from);
  codes.forEach((code, index) => primaryRequest.input(`Code${index}`, sql.NVarChar(80), code));
  const primary = codes.length ? await primaryRequest.query(`
    SELECT [EmployeeCode] FROM [tsmgmt].[CrewAssignments]
    WHERE [EmployeeCode] IN (${list}) AND [AssignmentType] <> N'Temporary' AND [Status] = N'Active'
      AND [EffectiveFrom] <= @From AND ([EffectiveTo] IS NULL OR [EffectiveTo] >= @From)
  `).catch(() => ({ recordset: [] as Record<string, unknown>[] })) : { recordset: [] as Record<string, unknown>[] };
  const primaryCodes = new Set((primary.recordset || []).map((row) => text(row.EmployeeCode).toUpperCase()));
  const employees: MobilizationCandidate[] = codes.map((code) => {
    const row = byCode.get(code);
    const issues: MobilizationIssue[] = [];
    const employment = text(row?.employment_status);
    const joined = dateOnly(row?.date_joined);
    if (!row) issues.push({ severity: 'block', code: 'missing', message: 'Employee was not found in the directory.' });
    else if (/terminated|inactive|resigned|retired|deceased/i.test(employment)) issues.push({ severity: 'block', code: 'inactive', message: `Employment status is ${employment}.` });
    else if (joined && joined > from) issues.push({ severity: 'block', code: 'not-started', message: `Employment starts ${joined}, after this mobilization date.` });
    if (row && !primaryCodes.has(code)) issues.push({ severity: 'warn', code: 'crew', message: 'No active primary crew assignment covers this date. Mobilization does not create one.' });
    if (openCodes.has(code)) issues.push({ severity: 'block', code: 'mobilized', message: 'Already mobilized in an overlapping period.' });
    if (leaveCodes.has(code)) issues.push({ severity: 'block', code: 'leave', message: 'Approved leave overlaps this mobilization.' });
    if (temporaryCodes.has(code)) issues.push({ severity: 'warn', code: 'deployment', message: 'A temporary deployment overlaps this mobilization.' });
    return {
      code,
      name: text(row?.full_name),
      personId: text(row?.employee_id),
      department: text(row?.department),
      workCenter: text(row?.work_center),
      supervisor: text(row?.supervisor),
      location: text(row?.location),
      employmentStatus: employment || 'Unknown',
      operationalStatus: openCodes.has(code) ? 'Mobilized Offshore' : 'Active on Crew',
      issues,
    };
  });
  const blocks = employees.filter((item) => item.issues.some((issue) => issue.severity === 'block'));
  return {
    employees,
    eligible: employees.length - blocks.length,
    blocked: blocks.length,
    alreadyMobilized: employees.filter((item) => item.issues.some((issue) => issue.code === 'mobilized')).length,
    onLeave: employees.filter((item) => item.issues.some((issue) => issue.code === 'leave')).length,
    conflicts: employees.filter((item) => item.issues.some((issue) => issue.code === 'deployment')).length,
  };
};

export const createMobilization = async (input: {
  periodId?: string;
  projectCode: string;
  projectName: string;
  site: string;
  effectiveFrom: string;
  expectedReturn: string;
  supervisor: string;
  authorizationRef?: string;
  reason: string;
  transport?: string;
  notes?: string;
  employeeCodes: string[];
  actor: string;
  role?: string;
}) => {
  const from = dateOnly(input.effectiveFrom);
  const expected = dateOnly(input.expectedReturn);
  const projectCode = text(input.projectCode);
  const site = text(input.site);
  const supervisor = text(input.supervisor);
  const reason = text(input.reason);
  if (!projectCode || !site || !supervisor || !from || !expected || !reason) throw new Error('Project, offshore site, supervisor, dates, and reason are required.');
  const validation = await validateMobilizationEmployees({ employeeCodes: input.employeeCodes, effectiveFrom: from, expectedReturn: expected });
  const blocked = validation.employees.filter((item) => item.issues.some((issue) => issue.severity === 'block'));
  if (!validation.employees.length) throw new Error('Select at least one employee.');
  if (blocked.length) throw new Error(`${blocked.length} selected employee${blocked.length === 1 ? '' : 's'} still have a blocking conflict. Remove them before creating the mobilization.`);
  const connection = await pool();
  const today = new Date().toISOString().slice(0, 10);
  const status = from > today ? 'Planned' : 'Mobilized';
  const id = newId('mob');
  const count = await connection.request().query(`SELECT COUNT(1) AS total FROM [tsmgmt].[Mobilizations]`);
  const mobilizationNo = `MOB-${from.slice(0, 4)}-${String(Number(count.recordset?.[0]?.total || 0) + 1).padStart(4, '0')}`;
  const transaction = new sql.Transaction(connection);
  await transaction.begin();
  try {
    await new sql.Request(transaction)
      .input('Id', sql.NVarChar(40), id)
      .input('No', sql.NVarChar(40), mobilizationNo)
      .input('PeriodId', sql.NVarChar(40), text(input.periodId))
      .input('ProjectCode', sql.NVarChar(80), projectCode)
      .input('ProjectName', sql.NVarChar(220), text(input.projectName) || projectCode)
      .input('Site', sql.NVarChar(180), site)
      .input('From', sql.Date, from)
      .input('Expected', sql.Date, expected)
      .input('Supervisor', sql.NVarChar(180), supervisor)
      .input('Auth', sql.NVarChar(120), text(input.authorizationRef))
      .input('Reason', sql.NVarChar(300), reason)
      .input('Transport', sql.NVarChar(80), text(input.transport))
      .input('Notes', sql.NVarChar(1000), text(input.notes))
      .input('Status', sql.NVarChar(40), status)
      .input('Actor', sql.NVarChar(120), input.actor)
      .query(`INSERT INTO [tsmgmt].[Mobilizations] ([Id],[MobilizationNo],[PeriodId],[ProjectCode],[ProjectName],[OffshoreSite],[EffectiveFrom],[ExpectedReturn],[OffshoreSupervisor],[AuthorizationRef],[Reason],[Transport],[Notes],[Status],[CreatedBy])
        VALUES (@Id,@No,@PeriodId,@ProjectCode,@ProjectName,@Site,@From,@Expected,@Supervisor,@Auth,@Reason,@Transport,@Notes,@Status,@Actor)`);
    for (const employee of validation.employees) {
      await new sql.Request(transaction)
        .input('Id', sql.NVarChar(40), newId('mbe'))
        .input('MobilizationId', sql.NVarChar(40), id)
        .input('Code', sql.NVarChar(80), employee.code)
        .input('Name', sql.NVarChar(220), employee.name)
        .input('PersonId', sql.NVarChar(80), employee.personId)
        .input('HomeSupervisor', sql.NVarChar(180), employee.supervisor)
        .input('HomeLocation', sql.NVarChar(180), employee.location)
        .input('HomeWorkCenter', sql.NVarChar(180), employee.workCenter)
        .input('Department', sql.NVarChar(180), employee.department)
        .input('From', sql.Date, from)
        .input('Expected', sql.Date, expected)
        .input('Status', sql.NVarChar(40), status)
        .input('Exception', sql.NVarChar(120), employee.issues.some((issue) => issue.severity === 'warn') ? 'Temporary deployment overlap' : '')
        .query(`INSERT INTO [tsmgmt].[MobilizationEmployees] ([Id],[MobilizationId],[EmployeeCode],[EmployeeName],[PersonId],[HomeSupervisor],[HomeLocation],[HomeWorkCenter],[Department],[EffectiveFrom],[ExpectedReturn],[Status],[ExceptionStatus])
          VALUES (@Id,@MobilizationId,@Code,@Name,@PersonId,@HomeSupervisor,@HomeLocation,@HomeWorkCenter,@Department,@From,@Expected,@Status,@Exception)`);
    }
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
  await audit(connection, { mobilizationId: id, action: 'Mobilization created', newValue: `${mobilizationNo} · ${validation.employees.length} employees · ${projectCode} · ${site}`, reason, actor: input.actor, role: input.role });
  await openMobilizationApproval({ id, mobilizationNo, periodId: text(input.periodId), projectCode, projectName: text(input.projectName) || projectCode, site, supervisor, effectiveFrom: from, employees: validation.employees.length, exceptions: validation.employees.filter((item) => item.issues.some((issue) => issue.severity === 'warn')).length, actor: input.actor }).catch(() => undefined);
  return { id, mobilizationNo, employees: validation.employees.length, status };
};

const employeeRows = async (connection: sql.ConnectionPool, ids: string[]) => {
  if (!ids.length) return [];
  const request = connection.request();
  ids.forEach((id, index) => request.input(`Id${index}`, sql.NVarChar(40), id));
  const result = await request.query(`${rosterSql} WHERE e.[Id] IN (${ids.map((_, index) => `@Id${index}`).join(', ')})`);
  return result.recordset || [];
};

export const extendMobilization = async (input: { employeeRowIds: string[]; expectedReturn: string; reason: string; authorizationRef?: string; notes?: string; actor: string; role?: string }) => {
  const expected = dateOnly(input.expectedReturn);
  const reason = text(input.reason);
  if (!expected || !reason) throw new Error('A new expected return and a reason are required.');
  const connection = await pool();
  const rows = await employeeRows(connection, input.employeeRowIds || []);
  const open = rows.filter((row) => OPEN_STATUSES.includes(text(row.Status)));
  if (!open.length) throw new Error('Select mobilized employees to extend.');
  for (const row of open) {
    const current = dateOnly(row.RevisedExpectedReturn) || dateOnly(row.ExpectedReturn);
    if (expected <= current) throw new Error(`${text(row.EmployeeName)} already returns on ${current}. The new date must be later.`);
    await connection.request()
      .input('Id', sql.NVarChar(40), text(row.EmployeeRowId))
      .input('Expected', sql.Date, expected)
      .query(`UPDATE [tsmgmt].[MobilizationEmployees] SET [RevisedExpectedReturn]=@Expected, [Status]=N'Extended' WHERE [Id]=@Id`);
    await audit(connection, { mobilizationId: text(row.MobilizationId), employeeCode: text(row.EmployeeCode), action: 'Mobilization extended', previousValue: current, newValue: expected, reason: `${reason}${text(input.authorizationRef) ? ` · ${text(input.authorizationRef)}` : ''}${text(input.notes) ? ` · ${text(input.notes)}` : ''}`, actor: input.actor, role: input.role });
  }
  return { updated: open.length };
};

export const demobilizeEmployees = async (input: { employeeRowIds: string[]; demobilizationDate: string; returnDate?: string; destination?: string; reason: string; notes?: string; actor: string; role?: string }) => {
  const demobilized = dateOnly(input.demobilizationDate);
  const returned = dateOnly(input.returnDate) || demobilized;
  const reason = text(input.reason);
  if (!demobilized || !reason) throw new Error('Actual demobilization date and a reason are required.');
  const connection = await pool();
  const rows = await employeeRows(connection, input.employeeRowIds || []);
  const open = rows.filter((row) => OPEN_STATUSES.includes(text(row.Status)));
  if (!open.length) throw new Error('Select mobilized employees to demobilize.');
  for (const row of open) {
    await connection.request()
      .input('Id', sql.NVarChar(40), text(row.EmployeeRowId))
      .input('Demob', sql.Date, demobilized)
      .input('Returned', sql.Date, returned)
      .input('Destination', sql.NVarChar(180), text(input.destination))
      .query(`UPDATE [tsmgmt].[MobilizationEmployees] SET [ActualDemobilization]=@Demob, [ActualReturn]=@Returned, [Destination]=@Destination, [Status]=N'Demobilized' WHERE [Id]=@Id`);
    await audit(connection, { mobilizationId: text(row.MobilizationId), employeeCode: text(row.EmployeeCode), action: 'Demobilized', previousValue: text(row.Status), newValue: `Demobilized ${demobilized}; return ${returned}${text(input.destination) ? `; destination ${text(input.destination)}` : ''}`, reason: `${reason}${text(input.notes) ? ` · ${text(input.notes)}` : ''}`, actor: input.actor, role: input.role });
  }
  return { updated: open.length };
};

export const confirmMobilizationReturn = async (input: { employeeRowIds: string[]; returnDate: string; reason?: string; actor: string; role?: string }) => {
  const returned = dateOnly(input.returnDate);
  if (!returned) throw new Error('A return date is required.');
  const connection = await pool();
  const rows = await employeeRows(connection, input.employeeRowIds || []);
  const ready = rows.filter((row) => ['Mobilized', 'Extended', 'Demobilized'].includes(text(row.Status)));
  if (!ready.length) throw new Error('Select employees who are still offshore or already demobilized.');
  for (const row of ready) {
    await connection.request()
      .input('Id', sql.NVarChar(40), text(row.EmployeeRowId))
      .input('Returned', sql.Date, returned)
      .query(`UPDATE [tsmgmt].[MobilizationEmployees] SET [ActualReturn]=@Returned, [ActualDemobilization]=ISNULL([ActualDemobilization], @Returned), [Status]=N'Returned to Base' WHERE [Id]=@Id`);
    await audit(connection, { mobilizationId: text(row.MobilizationId), employeeCode: text(row.EmployeeCode), action: 'Returned to base', previousValue: text(row.Status), newValue: returned, reason: text(input.reason) || 'Confirmed return to the home crew', actor: input.actor, role: input.role });
  }
  return { updated: ready.length };
};

const EXCEPTIONAL_STATUSES = ['Cancelled', 'Medical Return', 'Transferred'];

export const changeMobilizationStatus = async (input: { employeeRowIds: string[]; status: string; effectiveDate: string; reason: string; actor: string; role?: string }) => {
  const status = text(input.status);
  const effective = dateOnly(input.effectiveDate);
  const reason = text(input.reason);
  if (!EXCEPTIONAL_STATUSES.includes(status)) throw new Error('Choose Cancelled, Medical Return, or Transferred.');
  if (!effective || !reason) throw new Error('An effective date and a reason are required.');
  const connection = await pool();
  const rows = await employeeRows(connection, input.employeeRowIds || []);
  const open = rows.filter((row) => OPEN_STATUSES.includes(text(row.Status)));
  if (!open.length) throw new Error('Select an open mobilization to change.');
  for (const row of open) {
    await connection.request()
      .input('Id', sql.NVarChar(40), text(row.EmployeeRowId))
      .input('Status', sql.NVarChar(40), status)
      .input('Effective', sql.Date, effective)
      .query(`UPDATE [tsmgmt].[MobilizationEmployees] SET [Status]=@Status, [ActualDemobilization]=ISNULL([ActualDemobilization], @Effective), [ActualReturn]=CASE WHEN @Status = N'Cancelled' THEN [ActualReturn] ELSE ISNULL([ActualReturn], @Effective) END WHERE [Id]=@Id`);
    await audit(connection, { mobilizationId: text(row.MobilizationId), employeeCode: text(row.EmployeeCode), action: status, previousValue: text(row.Status), newValue: `${status} from ${effective}`, reason, actor: input.actor, role: input.role });
  }
  return { updated: open.length, status };
};

export const acknowledgeMobilizationException = async (input: { employeeRowId: string; issue: string; actor: string; role?: string }) => {
  const issue = text(input.issue);
  if (!issue) throw new Error('Choose an exception to acknowledge.');
  const connection = await pool();
  const rows = await employeeRows(connection, [text(input.employeeRowId)]);
  const row = rows[0];
  if (!row) throw new Error('Mobilization employee was not found.');
  const previous = text(row.ExceptionStatus);
  const marker = `ack:${issue}`;
  if (previous.includes(marker)) return { updated: 0 };
  const next = previous ? `${previous}|${marker}` : marker;
  await connection.request()
    .input('Id', sql.NVarChar(40), text(row.EmployeeRowId))
    .input('Exception', sql.NVarChar(120), next.slice(0, 120))
    .query(`UPDATE [tsmgmt].[MobilizationEmployees] SET [ExceptionStatus]=@Exception WHERE [Id]=@Id`);
  await audit(connection, { mobilizationId: text(row.MobilizationId), employeeCode: text(row.EmployeeCode), action: 'Exception acknowledged', previousValue: previous, newValue: issue, reason: 'Acknowledged without changing timesheet or payroll records', actor: input.actor, role: input.role });
  return { updated: 1 };
};

export const listMobilizationWorkspace = async (filters: { asOf?: string; periodId?: string; project?: string; site?: string; supervisor?: string; status?: string; q?: string }) => {
  const connection = await pool();
  const asOf = dateOnly(filters.asOf) || new Date().toISOString().slice(0, 10);
  const result = await connection.request().input('AsOf', sql.Date, asOf).query(`${rosterSql} ORDER BY e.[EmployeeName]`);
  const rows = (result.recordset || []).map(mapRow);
  const activeOn = (row: ReturnType<typeof mapRow>) => OPEN_STATUSES.includes(row.status) && row.effectiveFrom <= asOf && (!row.actualReturn || row.actualReturn >= asOf);
  const active = rows.filter(activeOn);
  const weekAhead = new Date(`${asOf}T00:00:00Z`);
  weekAhead.setUTCDate(weekAhead.getUTCDate() + 7);
  const week = weekAhead.toISOString().slice(0, 10);
  const tomorrowDate = new Date(`${asOf}T00:00:00Z`);
  tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1);
  const tomorrow = tomorrowDate.toISOString().slice(0, 10);
  const kpis = {
    mobilized: active.filter((row) => row.effectiveFrom <= asOf).length,
    mobilizingToday: rows.filter((row) => OPEN_STATUSES.includes(row.status) && row.effectiveFrom === asOf).length,
    returningToday: active.filter((row) => row.expectedReturn === asOf).length,
    overdue: active.filter((row) => row.expectedReturn < asOf).length,
    projects: new Set(active.map((row) => row.projectCode).filter(Boolean)).size,
    exceptions: active.filter((row) => row.exceptionStatus || row.expectedReturn < asOf).length,
  };
  const needle = text(filters.q).toLowerCase();
  const filtered = rows.filter((row) => {
    if (filters.periodId && row.periodId !== filters.periodId) return false;
    if (filters.project && row.projectCode !== filters.project) return false;
    if (filters.site && row.site !== filters.site) return false;
    if (filters.supervisor && !namesMatchSupervisor(row.offshoreSupervisor, filters.supervisor)) return false;
    if (filters.status && row.status !== filters.status) return false;
    if (needle && !`${row.employeeCode} ${row.employeeName} ${row.projectCode} ${row.projectName} ${row.site} ${row.offshoreSupervisor} ${row.mobilizationNo}`.toLowerCase().includes(needle)) return false;
    return true;
  });
  const attendance = new Map<string, { hours: number; location: string }>();
  if (filtered.length) {
    const bookingRequest = connection.request().input('AsOf', sql.Date, asOf);
    filtered.forEach((row, index) => bookingRequest.input(`Code${index}`, sql.NVarChar(80), row.employeeCode));
    const booked = await bookingRequest.query(`
      SELECT [EmployeeCode], SUM(ISNULL([RegularHours], 0) + ISNULL([OvtHours], 0) + ISNULL([NightHours], 0)) AS Hours, MAX(ISNULL([LocationName], N'')) AS LocationName
      FROM [tsmgmt].[Bookings]
      WHERE [WorkDate] = @AsOf AND [EmployeeCode] IN (${filtered.map((_, index) => `@Code${index}`).join(', ')})
      GROUP BY [EmployeeCode]
    `).catch(() => ({ recordset: [] as Record<string, unknown>[] }));
    for (const booking of booked.recordset || []) attendance.set(text(booking.EmployeeCode).toUpperCase(), { hours: Number(booking.Hours || 0), location: text(booking.LocationName) });
  }
  return {
    asOf,
    tomorrow,
    week,
    kpis,
    rows: filtered.map((row) => {
      const hit = attendance.get(row.employeeCode.toUpperCase());
      const attendanceStatus = !hit || hit.hours <= 0
        ? 'No timesheet hours'
        : namesMatchSupervisor(hit.location, row.site)
          ? 'Hours booked at offshore site'
          : `Hours booked at ${hit.location || 'another location'}`;
      return { ...row, attendanceStatus };
    }),
  };
};

export const listMobilizationHistory = async (query: string) => {
  const connection = await pool();
  const result = await connection.request().input('q', sql.NVarChar(80), `%${text(query)}%`).query(`
    SELECT TOP 300 a.[Id], a.[MobilizationId], a.[EmployeeCode], a.[Action], a.[PreviousValue], a.[NewValue], a.[Reason], a.[Actor], a.[ActorRole], a.[CreatedAt],
      h.[MobilizationNo], h.[ProjectCode], h.[ProjectName], h.[OffshoreSite], h.[OffshoreSupervisor], e.[EmployeeName], e.[HomeSupervisor], e.[EffectiveFrom], e.[ExpectedReturn], e.[RevisedExpectedReturn], e.[ActualReturn], e.[Status]
    FROM [tsmgmt].[MobilizationAudit] a
    INNER JOIN [tsmgmt].[Mobilizations] h ON h.[Id] = a.[MobilizationId]
    LEFT JOIN [tsmgmt].[MobilizationEmployees] e ON e.[MobilizationId] = a.[MobilizationId] AND e.[EmployeeCode] = a.[EmployeeCode]
    WHERE @q = N'%%' OR a.[EmployeeCode] LIKE @q OR ISNULL(e.[EmployeeName], N'') LIKE @q OR h.[MobilizationNo] LIKE @q OR h.[ProjectCode] LIKE @q OR h.[OffshoreSite] LIKE @q OR a.[Action] LIKE @q
    ORDER BY a.[CreatedAt] DESC
  `);
  return (result.recordset || []).map((row) => ({
    id: text(row.Id),
    mobilizationId: text(row.MobilizationId),
    mobilizationNo: text(row.MobilizationNo),
    employeeCode: text(row.EmployeeCode),
    employeeName: text(row.EmployeeName),
    projectCode: text(row.ProjectCode),
    projectName: text(row.ProjectName),
    site: text(row.OffshoreSite),
    offshoreSupervisor: text(row.OffshoreSupervisor),
    homeSupervisor: text(row.HomeSupervisor),
    effectiveFrom: dateOnly(row.EffectiveFrom),
    originalExpectedReturn: dateOnly(row.ExpectedReturn),
    revisedExpectedReturn: dateOnly(row.RevisedExpectedReturn),
    actualReturn: dateOnly(row.ActualReturn),
    status: text(row.Status),
    action: text(row.Action),
    previousValue: text(row.PreviousValue),
    newValue: text(row.NewValue),
    reason: text(row.Reason),
    actor: text(row.Actor),
    role: text(row.ActorRole),
    at: row.CreatedAt ? new Date(String(row.CreatedAt)).toISOString() : '',
  }));
};

export const listMobilizationExceptions = async () => {
  const connection = await pool();
  const result = await connection.request().query(`${rosterSql} WHERE e.[Status] IN (N'Planned', N'Mobilized', N'Extended')`);
  const rows = (result.recordset || []).map(mapRow);
  const exceptions: Array<{ id: string; employeeRowId: string; key: string; severity: string; employeeCode: string; employeeName: string; date: string; issue: string; source: string; status: string }> = [];
  const seen = new Map<string, number>();
  const push = (row: ReturnType<typeof mapRow>, key: string, severity: string, date: string, issue: string, source: string) => {
    if (row.exceptionStatus.includes(`ack:${key}`)) return;
    exceptions.push({ id: `${row.id}-${key}`, employeeRowId: row.id, key, severity, employeeCode: row.employeeCode, employeeName: row.employeeName, date, issue, source, status: 'Open' });
  };
  for (const row of rows) {
    const key = row.employeeCode.toUpperCase();
    seen.set(key, (seen.get(key) || 0) + 1);
    if (!row.projectCode) push(row, 'project', 'Block', row.effectiveFrom, 'Mobilization without a valid project', row.mobilizationNo);
    if (!row.site) push(row, 'site', 'Block', row.effectiveFrom, 'Missing offshore site', row.mobilizationNo);
    if (!row.expectedReturn) push(row, 'return', 'Block', row.effectiveFrom, 'Missing expected return', row.mobilizationNo);
    if (row.expectedReturn && row.expectedReturn < new Date().toISOString().slice(0, 10) && !row.actualReturn) push(row, 'overdue', 'Warning', row.expectedReturn, 'Overdue return', row.mobilizationNo);
  }
  for (const [code, count] of seen) {
    if (count < 2) continue;
    const matches = rows.filter((item) => item.employeeCode.toUpperCase() === code);
    const overlap = matches.some((left, index) => matches.slice(index + 1).some((right) => left.effectiveFrom <= (right.expectedReturn || '9999-12-31') && right.effectiveFrom <= (left.expectedReturn || '9999-12-31')));
    if (overlap && matches[0]) push(matches[0], 'overlap', 'Block', matches[0].effectiveFrom, 'Overlapping mobilization', 'Mobilization employees');
  }
  if (rows.length) {
    const peopleRequest = connection.request();
    const bookingRequest = connection.request();
    rows.forEach((row, index) => {
      peopleRequest.input(`Code${index}`, sql.NVarChar(80), row.employeeCode);
      bookingRequest.input(`Code${index}`, sql.NVarChar(80), row.employeeCode);
    });
    const list = rows.map((_, index) => `@Code${index}`).join(', ');
    const people = await peopleRequest.query(`
      SELECT employee_code, ISNULL(employment_status, N'') AS employment_status FROM [hris].[EmployeeMasterView]
      WHERE employee_code IN (${list})
    `).catch(() => ({ recordset: [] as Record<string, unknown>[] }));
    for (const person of people.recordset || []) {
      if (!/terminated|inactive|resigned|retired|deceased/i.test(text(person.employment_status))) continue;
      const row = rows.find((item) => item.employeeCode.toUpperCase() === text(person.employee_code).toUpperCase());
      if (row) push(row, 'employment', 'Block', row.effectiveFrom, `Employment status is ${text(person.employment_status)}`, 'Employee directory');
    }
    const bookings = await bookingRequest.query(`
      SELECT [EmployeeCode], CONVERT(varchar(10), [WorkDate], 23) AS WorkDate, [LocationName], [RegularHours], [OvtHours], [NightHours]
      FROM [tsmgmt].[Bookings]
      WHERE [EmployeeCode] IN (${list}) AND ([RegularHours] > 0 OR [OvtHours] > 0 OR [NightHours] > 0)
    `).catch(() => ({ recordset: [] as Record<string, unknown>[] }));
    for (const booking of bookings.recordset || []) {
      const matches = rows.filter((row) => row.employeeCode.toUpperCase() === text(booking.EmployeeCode).toUpperCase());
      const day = text(booking.WorkDate);
      const covering = matches.find((row) => day >= row.effectiveFrom && day <= (row.expectedReturn || '9999-12-31'));
      const locationName = text(booking.LocationName);
      if (covering && locationName && !namesMatchSupervisor(locationName, covering.site)) {
        push(covering, `yard-${day}`, 'Warning', day, `Timesheet location ${locationName} conflicts with offshore site ${covering.site}`, 'Timesheet booking');
      }
      const offshoreHit = matches.find((row) => locationName && namesMatchSupervisor(locationName, row.site));
      if (offshoreHit && !covering) {
        push(offshoreHit, `window-${day}`, 'Warning', day, 'Timesheet booking outside the mobilization window', 'Timesheet booking');
      }
    }
  }
  if (rows.length) {
    try {
      const leave = await connection.request().query(`
        SELECT [EmployeeId], CONVERT(varchar(10), [StartDate], 23) AS StartDate, CONVERT(varchar(10), [EndDate], 23) AS EndDate
        FROM [hris].[LeaveApplications]
        WHERE [StatusName] LIKE N'%Approved%' AND [EndDate] >= CAST(SYSUTCDATETIME() AS date) AND [StartDate] <= DATEADD(day, 60, CAST(SYSUTCDATETIME() AS date))
      `);
      const leaves = (leave.recordset || []).map((row) => ({ code: text(row.EmployeeId).toUpperCase(), start: text(row.StartDate), end: text(row.EndDate) }));
      for (const row of rows) {
        const hit = leaves.find((item) => item.code === row.employeeCode.toUpperCase() && item.start <= (row.expectedReturn || '9999-12-31') && item.end >= row.effectiveFrom);
        if (hit) push(row, 'leave', 'Block', hit.start, 'Employee is on approved leave during an open mobilization', 'Leave applications');
      }
    } catch {
      /* leave source stays optional */
    }
  }
  return exceptions;
};

export const readMobilizationBatch = async (mobilizationId: string) => {
  const connection = await pool();
  const result = await connection.request().input('Id', sql.NVarChar(40), text(mobilizationId)).query(`${rosterSql} WHERE h.[Id] = @Id ORDER BY e.[EmployeeName]`);
  const rows = (result.recordset || []).map(mapRow);
  const auditRows = await connection.request().input('Id', sql.NVarChar(40), text(mobilizationId)).query(`SELECT * FROM [tsmgmt].[MobilizationAudit] WHERE [MobilizationId]=@Id ORDER BY [CreatedAt]`);
  return {
    rows,
    audit: (auditRows.recordset || []).map((row) => ({
      id: text(row.Id),
      action: text(row.Action),
      employeeCode: text(row.EmployeeCode),
      previousValue: text(row.PreviousValue),
      newValue: text(row.NewValue),
      reason: text(row.Reason),
      actor: text(row.Actor),
      role: text(row.ActorRole),
      at: row.CreatedAt ? new Date(String(row.CreatedAt)).toISOString() : '',
    })),
  };
};

export const listActiveMobilizations = async (workDate: string): Promise<ActiveMobilization[]> => {
  const day = dateOnly(workDate);
  if (!day) return [];
  const connection = await pool();
  const result = await connection.request().input('WorkDate', sql.Date, day).query(`
    SELECT e.[EmployeeCode], e.[EmployeeName], e.[Status], e.[EffectiveFrom], ISNULL(e.[RevisedExpectedReturn], e.[ExpectedReturn]) AS ExpectedReturn,
      h.[OffshoreSite], h.[OffshoreSupervisor], h.[ProjectCode], h.[ProjectName]
    FROM [tsmgmt].[MobilizationEmployees] e
    INNER JOIN [tsmgmt].[Mobilizations] h ON h.[Id] = e.[MobilizationId]
    WHERE e.[Status] IN (N'Planned', N'Mobilized', N'Extended')
      AND e.[EffectiveFrom] <= @WorkDate
      AND (e.[ActualReturn] IS NULL OR e.[ActualReturn] >= @WorkDate)
      AND (e.[ActualDemobilization] IS NULL OR e.[ActualDemobilization] >= @WorkDate)
  `);
  return (result.recordset || []).map((row) => ({
    employeeCode: text(row.EmployeeCode),
    employeeName: text(row.EmployeeName),
    site: text(row.OffshoreSite),
    supervisor: text(row.OffshoreSupervisor),
    projectCode: text(row.ProjectCode),
    projectName: text(row.ProjectName),
    effectiveFrom: dateOnly(row.EffectiveFrom),
    expectedReturn: dateOnly(row.ExpectedReturn),
    status: text(row.Status),
  }));
};
