import sql from 'mssql';
import { getDleEnterpriseDbPool } from '@/lib/dle-enterprise-db';
import { createEnterpriseNotification } from '@/lib/enterprise-notifications-store';
import type { SessionPayload } from '@/lib/auth/session';
import { extractSupervisorEmployeeCode, supervisorCodeLookupVariants, supervisorCodesMatch } from '@/lib/timesheet-agege-blasting';

export const APPROVAL_STAGES = ['Supervisor', 'Cost Control', 'Project Manager', 'Consolidation', 'HR', 'Payroll Readiness'] as const;
export const APPROVAL_SLA_DAYS = 3;
const NEXT_STAGE: Record<string, string> = {
  Supervisor: 'Cost Control',
  'Cost Control': 'Project Manager',
  'Project Manager': 'Consolidation',
  Consolidation: 'HR',
  HR: 'Payroll Readiness',
};
const RETURN_REASONS = ['Incorrect Hours', 'Wrong Project', 'Missing Attendance Evidence', 'OVT Not Authorized', 'Night Work Issue', 'Offshore Conflict', 'Employee Assignment Issue', 'Duplicate Booking', 'Incorrect Classification', 'Other'];

const text = (value: unknown) => String(value ?? '').trim();
const dateOnly = (value: unknown) => {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const raw = text(value);
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : '';
};
const newId = () => `apv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
/** Letters-only name, without a leading employee code or courtesy title. */
export const approvalPersonNameKey = (value: string) => {
  let raw = text(value);
  const code = extractSupervisorEmployeeCode(raw);
  if (code) {
    const rest = raw.replace(new RegExp(`^${code}\\s*-\\s*`, 'i'), '').trim();
    if (rest && rest.toUpperCase() !== raw.toUpperCase()) raw = rest;
  }
  return raw.toUpperCase().replace(/\./g, '').replace(/^(MR|MRS|MISS|MS|DR|ENGR)\s+/, '').replace(/[^A-Z]/g, '');
};

export const approvalViewerCodes = (viewer: { actor?: string; employeeCode?: string }) => {
  const variants = new Set<string>();
  for (const seed of [text(viewer.employeeCode), extractSupervisorEmployeeCode(viewer.actor)]) {
    if (!seed) continue;
    for (const variant of supervisorCodeLookupVariants(seed)) variants.add(variant.toUpperCase());
  }
  return [...variants];
};

const storedMatchesCode = (stored: string, code: string) => {
  const upper = text(stored).toUpperCase();
  const token = code.toUpperCase();
  return upper === token || upper.startsWith(`${token} - `);
};

/** Signed-in person against the supervisor or project manager stored on the item. */
export const approvalViewerOwns = (viewer: { actor?: string; employeeCode?: string }, stored: string) => {
  const storedCode = extractSupervisorEmployeeCode(stored);
  if (approvalViewerCodes(viewer).some((code) => storedMatchesCode(stored, code) || (storedCode && supervisorCodesMatch(code, storedCode)))) return true;
  const left = approvalPersonNameKey(text(viewer.actor));
  const right = approvalPersonNameKey(stored);
  return Boolean(left && right && left === right);
};

const approvalNameSql = (column: string) => `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(UPPER(
  CASE
    WHEN CHARINDEX(N' - ', ${column}) > 1
     AND LEFT(LTRIM(${column}), CHARINDEX(N' - ', ${column}) - 1) LIKE N'%[0-9]%'
    THEN LTRIM(SUBSTRING(${column}, CHARINDEX(N' - ', ${column}) + 3, 200))
    ELSE ${column}
  END
), N'.', N''), N'MR ', N''), N'MRS ', N''), N'MISS ', N''), N'MS ', N''), N'DR ', N''), N'ENGR ', N''), N' ', N'')`;

let ensured = false;
const pool = async () => {
  const connection = await getDleEnterpriseDbPool();
  if (!connection) throw new Error('DLE Enterprise database is not configured.');
  if (!ensured) {
    await connection.request().query(`
IF SCHEMA_ID(N'tsmgmt') IS NULL EXEC(N'CREATE SCHEMA [tsmgmt]');
IF OBJECT_ID(N'[tsmgmt].[ApprovalItems]', N'U') IS NULL
CREATE TABLE [tsmgmt].[ApprovalItems] (
  [Id] NVARCHAR(40) NOT NULL PRIMARY KEY,
  [Kind] NVARCHAR(30) NOT NULL,
  [TimesheetId] NVARCHAR(40) NOT NULL,
  [ReferenceCode] NVARCHAR(40) NOT NULL,
  [VersionNo] INT NOT NULL,
  [Stage] NVARCHAR(40) NOT NULL,
  [Status] NVARCHAR(30) NOT NULL,
  [PeriodId] NVARCHAR(40) NULL,
  [WorkDate] DATE NULL,
  [SupervisorName] NVARCHAR(180) NULL,
  [LocationName] NVARCHAR(180) NULL,
  [WorkCenterName] NVARCHAR(180) NULL,
  [ProjectCode] NVARCHAR(80) NULL,
  [ProjectName] NVARCHAR(220) NULL,
  [ProjectManager] NVARCHAR(180) NULL,
  [Summary] NVARCHAR(300) NULL,
  [RegularHours] DECIMAL(9,2) NOT NULL CONSTRAINT [DF_tsmgmt_ApprovalItems_Reg] DEFAULT 0,
  [OvtHours] DECIMAL(9,2) NOT NULL CONSTRAINT [DF_tsmgmt_ApprovalItems_Ovt] DEFAULT 0,
  [NightSessions] INT NOT NULL CONSTRAINT [DF_tsmgmt_ApprovalItems_Night] DEFAULT 0,
  [EmployeeCount] INT NOT NULL CONSTRAINT [DF_tsmgmt_ApprovalItems_Employees] DEFAULT 0,
  [ExceptionCount] INT NOT NULL CONSTRAINT [DF_tsmgmt_ApprovalItems_Exceptions] DEFAULT 0,
  [EnteredAt] DATETIME2 NOT NULL CONSTRAINT [DF_tsmgmt_ApprovalItems_Entered] DEFAULT SYSUTCDATETIME(),
  [ActedAt] DATETIME2 NULL,
  [ActedBy] NVARCHAR(120) NULL,
  [ActorRole] NVARCHAR(120) NULL,
  [ReturnReason] NVARCHAR(80) NULL,
  [Comment] NVARCHAR(1000) NULL
);
IF OBJECT_ID(N'[tsmgmt].[ApprovalEvents]', N'U') IS NULL
CREATE TABLE [tsmgmt].[ApprovalEvents] (
  [Id] NVARCHAR(40) NOT NULL PRIMARY KEY,
  [ItemId] NVARCHAR(40) NULL,
  [TimesheetId] NVARCHAR(40) NOT NULL,
  [VersionNo] INT NULL,
  [Stage] NVARCHAR(40) NULL,
  [Action] NVARCHAR(80) NOT NULL,
  [Actor] NVARCHAR(120) NOT NULL,
  [ActorRole] NVARCHAR(120) NULL,
  [PreviousStatus] NVARCHAR(40) NULL,
  [NewStatus] NVARCHAR(40) NULL,
  [Reason] NVARCHAR(300) NULL,
  [Comment] NVARCHAR(1000) NULL,
  [CreatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_tsmgmt_ApprovalEvents_Created] DEFAULT SYSUTCDATETIME()
);
`);
    ensured = true;
  }
  return connection;
};

const notify = async (title: string, body: string, recipient?: string) => {
  try {
    const session = {
      sub: 'timesheet-workflow',
      username: 'timesheet-workflow',
      fullName: 'Timesheet Workflow',
      roles: ['System'],
      permissions: [],
      status: 'Active',
      firstLoginRequired: false,
      passwordResetRequired: false,
      isGlobalAdmin: true,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    } as SessionPayload;
    await createEnterpriseNotification(session, {
      title,
      body,
      module: 'Timesheet Management',
      kind: 'Notification',
      severity: 'info',
      href: '/timesheet-management',
      recipientEmployeeCode: recipient,
      channels: ['In-App'],
    });
  } catch {
    /* notification delivery must not block the approval */
  }
};

const event = async (connection: sql.ConnectionPool, input: { itemId?: string; timesheetId: string; version?: number; stage?: string; action: string; actor: string; role?: string; previousStatus?: string; newStatus?: string; reason?: string; comment?: string }) => {
  await connection.request()
    .input('Id', sql.NVarChar(40), newId())
    .input('ItemId', sql.NVarChar(40), text(input.itemId))
    .input('TimesheetId', sql.NVarChar(40), input.timesheetId)
    .input('Version', sql.Int, input.version || 0)
    .input('Stage', sql.NVarChar(40), text(input.stage))
    .input('Action', sql.NVarChar(80), input.action)
    .input('Actor', sql.NVarChar(120), input.actor)
    .input('Role', sql.NVarChar(120), text(input.role))
    .input('Previous', sql.NVarChar(40), text(input.previousStatus))
    .input('Next', sql.NVarChar(40), text(input.newStatus))
    .input('Reason', sql.NVarChar(300), text(input.reason))
    .input('Comment', sql.NVarChar(1000), text(input.comment))
    .query(`INSERT INTO [tsmgmt].[ApprovalEvents] ([Id],[ItemId],[TimesheetId],[VersionNo],[Stage],[Action],[Actor],[ActorRole],[PreviousStatus],[NewStatus],[Reason],[Comment]) VALUES (@Id,@ItemId,@TimesheetId,@Version,@Stage,@Action,@Actor,@Role,@Previous,@Next,@Reason,@Comment)`);
};

const totalsFor = async (connection: sql.ConnectionPool, timesheetId: string) => {
  const result = await connection.request().input('Id', sql.NVarChar(40), timesheetId).query(`
    SELECT
      (SELECT COUNT(1) FROM [tsmgmt].[TimesheetEntryLines] WHERE [TimesheetId]=@Id) AS Employees,
      (SELECT COUNT(1) FROM [tsmgmt].[TimesheetEntryLines] WHERE [TimesheetId]=@Id AND ([Exceptional]=1 OR ISNULL([ExceptionReason], N'') <> N'')) AS Exceptions,
      (SELECT COUNT(1) FROM [tsmgmt].[TimesheetEntryLines] WHERE [TimesheetId]=@Id AND [NightSession]=1) AS Nights,
      (SELECT ISNULL(SUM(a.[RegularHours]), 0) FROM [tsmgmt].[TimesheetAllocations] a INNER JOIN [tsmgmt].[TimesheetEntryLines] l ON l.[Id]=a.[LineId] WHERE l.[TimesheetId]=@Id) AS RegularHours,
      (SELECT ISNULL(SUM(a.[OvtHours]), 0) FROM [tsmgmt].[TimesheetAllocations] a INNER JOIN [tsmgmt].[TimesheetEntryLines] l ON l.[Id]=a.[LineId] WHERE l.[TimesheetId]=@Id) AS OvtHours
  `);
  const row = result.recordset?.[0] || {};
  return {
    employees: Number(row.Employees || 0),
    exceptions: Number(row.Exceptions || 0),
    nights: Number(row.Nights || 0),
    regular: Number(row.RegularHours || 0),
    ovt: Number(row.OvtHours || 0),
  };
};

const insertItem = async (connection: sql.ConnectionPool, input: Record<string, unknown>) => {
  const id = newId();
  await connection.request()
    .input('Id', sql.NVarChar(40), id)
    .input('Kind', sql.NVarChar(30), text(input.kind) || 'Timesheet')
    .input('TimesheetId', sql.NVarChar(40), text(input.timesheetId))
    .input('Reference', sql.NVarChar(40), text(input.reference))
    .input('Version', sql.Int, Number(input.version || 1))
    .input('Stage', sql.NVarChar(40), text(input.stage))
    .input('Status', sql.NVarChar(30), 'Pending')
    .input('PeriodId', sql.NVarChar(40), text(input.periodId))
    .input('WorkDate', sql.Date, dateOnly(input.workDate) || null)
    .input('Supervisor', sql.NVarChar(180), text(input.supervisor))
    .input('Location', sql.NVarChar(180), text(input.location))
    .input('WorkCenter', sql.NVarChar(180), text(input.workCenter))
    .input('ProjectCode', sql.NVarChar(80), text(input.projectCode))
    .input('ProjectName', sql.NVarChar(220), text(input.projectName))
    .input('Manager', sql.NVarChar(180), text(input.projectManager))
    .input('Summary', sql.NVarChar(300), text(input.summary))
    .input('Regular', sql.Decimal(9, 2), Number(input.regular || 0))
    .input('Ovt', sql.Decimal(9, 2), Number(input.ovt || 0))
    .input('Nights', sql.Int, Number(input.nights || 0))
    .input('Employees', sql.Int, Number(input.employees || 0))
    .input('Exceptions', sql.Int, Number(input.exceptions || 0))
    .query(`INSERT INTO [tsmgmt].[ApprovalItems] ([Id],[Kind],[TimesheetId],[ReferenceCode],[VersionNo],[Stage],[Status],[PeriodId],[WorkDate],[SupervisorName],[LocationName],[WorkCenterName],[ProjectCode],[ProjectName],[ProjectManager],[Summary],[RegularHours],[OvtHours],[NightSessions],[EmployeeCount],[ExceptionCount])
      VALUES (@Id,@Kind,@TimesheetId,@Reference,@Version,@Stage,@Status,@PeriodId,@WorkDate,@Supervisor,@Location,@WorkCenter,@ProjectCode,@ProjectName,@Manager,@Summary,@Regular,@Ovt,@Nights,@Employees,@Exceptions)`);
  return id;
};

export const openTimesheetApproval = async (timesheetId: string, actor: string) => {
  const connection = await pool();
  const header = await connection.request().input('Id', sql.NVarChar(40), timesheetId).query(`SELECT * FROM [tsmgmt].[Timesheets] WHERE [Id]=@Id`);
  const sheet = header.recordset?.[0];
  if (!sheet) return;
  const version = Number(sheet.VersionNo || 1);
  await connection.request().input('Id', sql.NVarChar(40), timesheetId).input('Version', sql.Int, version).input('Actor', sql.NVarChar(120), text(actor) || 'Timesheet Workflow').query(`
    UPDATE [tsmgmt].[ApprovalItems]
    SET [Status]=N'Superseded', [ActedAt]=SYSUTCDATETIME(), [ActedBy]=@Actor,
        [Comment]=N'Replaced by a newer submission of the same timesheet.'
    WHERE [TimesheetId]=@Id AND [Kind]=N'Timesheet' AND [Status]=N'Pending' AND [VersionNo] <> @Version
  `);
  const existing = await connection.request().input('Id', sql.NVarChar(40), timesheetId).input('Version', sql.Int, version).query(`SELECT TOP 1 [Id] FROM [tsmgmt].[ApprovalItems] WHERE [TimesheetId]=@Id AND [VersionNo]=@Version AND [Stage]=N'Supervisor' AND [Status] IN (N'Pending', N'Approved')`);
  if (existing.recordset?.[0]) return;
  const totals = await totalsFor(connection, timesheetId);
  const itemId = await insertItem(connection, {
    timesheetId,
    reference: text(sheet.ReferenceCode),
    version,
    stage: 'Supervisor',
    periodId: text(sheet.PeriodId),
    workDate: dateOnly(sheet.WorkDate),
    supervisor: text(sheet.SupervisorName),
    location: text(sheet.LocationName),
    workCenter: text(sheet.WorkCenterName),
    summary: totals.ovt > 0 ? 'Includes OVT' : 'Normal booking',
    regular: totals.regular,
    ovt: totals.ovt,
    nights: totals.nights,
    employees: totals.employees,
    exceptions: totals.exceptions,
  });
  await event(connection, { itemId, timesheetId, version, stage: 'Supervisor', action: 'Submitted to supervisor', actor, newStatus: 'Pending' });
  await notify('Timesheet awaiting supervisor approval', `${text(sheet.ReferenceCode)} was submitted for ${text(sheet.SupervisorName)}.`, text(sheet.SupervisorName).split(' - ')[0]);
};

export const openMobilizationApproval = async (input: { id: string; mobilizationNo: string; periodId?: string; projectCode: string; projectName: string; site: string; supervisor: string; effectiveFrom: string; employees: number; exceptions: number; actor: string }) => {
  const connection = await pool();
  const existing = await connection.request().input('Id', sql.NVarChar(40), input.id).query(`SELECT TOP 1 [Id] FROM [tsmgmt].[ApprovalItems] WHERE [TimesheetId]=@Id AND [Kind]=N'Mobilization'`);
  if (existing.recordset?.[0]) return;
  const itemId = await insertItem(connection, {
    kind: 'Mobilization',
    timesheetId: input.id,
    reference: input.mobilizationNo,
    version: 1,
    stage: 'Supervisor',
    periodId: input.periodId,
    workDate: input.effectiveFrom,
    supervisor: input.supervisor,
    location: input.site,
    projectCode: input.projectCode,
    projectName: input.projectName,
    summary: 'Crew mobilization',
    employees: input.employees,
    exceptions: input.exceptions,
  });
  await event(connection, { itemId, timesheetId: input.id, version: 1, stage: 'Supervisor', action: 'Mobilization submitted', actor: input.actor, newStatus: 'Pending', comment: 'Acknowledging mobilization does not create attendance or hours.' });
};

export const approvalBlocksRevision = async (connection: sql.ConnectionPool, timesheetId: string, version: number) => {
  try {
    const rows = await connection.request().input('Id', sql.NVarChar(40), timesheetId).input('Version', sql.Int, version).query(`
      SELECT [Stage], [Status] FROM [tsmgmt].[ApprovalItems] WHERE [TimesheetId]=@Id AND [VersionNo]=@Version AND [Kind]=N'Timesheet'
    `);
    return (rows.recordset || []).some((row) => text(row.Status) === 'Approved' || (text(row.Status) === 'Pending' && text(row.Stage) !== 'Supervisor'));
  } catch {
    return false;
  }
};

const mapItem = (row: Record<string, unknown>) => {
  const entered = row.EnteredAt ? new Date(String(row.EnteredAt)) : new Date();
  const age = Math.max(0, Math.floor((Date.now() - entered.getTime()) / 86400000));
  const pending = text(row.Status) === 'Pending';
  const status = pending && age >= APPROVAL_SLA_DAYS ? 'Overdue' : text(row.Status);
  return {
    id: text(row.Id),
    kind: text(row.Kind),
    timesheetId: text(row.TimesheetId),
    reference: text(row.ReferenceCode),
    version: Number(row.VersionNo || 1),
    stage: text(row.Stage),
    status,
    storedStatus: text(row.Status),
    periodId: text(row.PeriodId),
    workDate: dateOnly(row.WorkDate),
    supervisor: text(row.SupervisorName),
    location: text(row.LocationName),
    workCenter: text(row.WorkCenterName),
    projectCode: text(row.ProjectCode),
    projectName: text(row.ProjectName),
    projectManager: text(row.ProjectManager),
    summary: text(row.Summary),
    regular: Number(row.RegularHours || 0),
    ovt: Number(row.OvtHours || 0),
    nights: Number(row.NightSessions || 0),
    employees: Number(row.EmployeeCount || 0),
    exceptions: Number(row.ExceptionCount || 0),
    age,
    enteredAt: entered.toISOString(),
    actedAt: row.ActedAt ? new Date(String(row.ActedAt)).toISOString() : '',
    actedBy: text(row.ActedBy),
    returnReason: text(row.ReturnReason),
    comment: text(row.Comment),
  };
};

export type ApprovalViewer = { actor: string; employeeCode: string; role: string; canSeeAll: boolean };

const bindApprovalViewer = (request: sql.Request, viewer: ApprovalViewer) => {
  request.input('ApprovalNameKey', sql.NVarChar(180), approvalPersonNameKey(viewer.actor));
  approvalViewerCodes(viewer).forEach((code, index) => request.input(`ApprovalCode${index}`, sql.NVarChar(50), code));
};

const stageClause = (viewer: ApprovalViewer, stage: string) => {
  if (viewer.canSeeAll || (stage !== 'Supervisor' && stage !== 'Project Manager')) return { sql: '', scoped: false };
  const column = stage === 'Project Manager' ? '[ProjectManager]' : '[SupervisorName]';
  const codes = approvalViewerCodes(viewer);
  const codeSql = codes.map((_, index) => `UPPER(LTRIM(RTRIM(${column}))) = UPPER(@ApprovalCode${index}) OR UPPER(${column}) LIKE UPPER(@ApprovalCode${index}) + N' - %'`).join(' OR ');
  const nameSql = `@ApprovalNameKey <> N'' AND ${approvalNameSql(column)} = @ApprovalNameKey`;
  const identity = [codeSql, nameSql].filter(Boolean).join(' OR ');
  return { sql: identity ? ` AND (${identity})` : ' AND 1 = 0', scoped: true };
};

export const listApprovalQueue = async (filters: { stage: string; periodId?: string; supervisor?: string; location?: string; status?: string; q?: string; workDate?: string; project?: string; page?: number; pageSize?: number }, viewer: ApprovalViewer) => {
  const connection = await pool();
  const missing = await connection.request().query(`
    SELECT TOP 20 [Id] FROM [tsmgmt].[Timesheets] t
    WHERE [Status] = N'Submitted'
      AND NOT EXISTS (SELECT 1 FROM [tsmgmt].[ApprovalItems] a WHERE a.[TimesheetId] = t.[Id] AND a.[VersionNo] = t.[VersionNo] AND a.[Stage] = N'Supervisor')
  `).catch(() => ({ recordset: [] as Record<string, unknown>[] }));
  for (const row of missing.recordset || []) await openTimesheetApproval(text(row.Id), 'Timesheet Workflow');
  const stage = APPROVAL_STAGES.includes(filters.stage as typeof APPROVAL_STAGES[number]) ? filters.stage : 'Supervisor';
  const pageSize = [10, 25, 50, 100].includes(Number(filters.pageSize)) ? Number(filters.pageSize) : 10;
  const page = Math.max(1, Number(filters.page || 1));
  const scope = stageClause(viewer, stage);
  const request = connection.request()
    .input('Stage', sql.NVarChar(40), stage)
    .input('PeriodId', sql.NVarChar(40), text(filters.periodId))
    .input('Supervisor', sql.NVarChar(180), text(filters.supervisor))
    .input('Location', sql.NVarChar(180), text(filters.location))
    .input('WorkDate', sql.Date, dateOnly(filters.workDate) || null)
    .input('Project', sql.NVarChar(80), text(filters.project))
    .input('Q', sql.NVarChar(80), `%${text(filters.q)}%`)
    .input('Sla', sql.Int, APPROVAL_SLA_DAYS);
  if (scope.scoped) bindApprovalViewer(request, viewer);
  const where = `
    WHERE [Stage]=@Stage
      AND [Status] <> N'Superseded'
      AND (@PeriodId = N'' OR [PeriodId]=@PeriodId)
      AND (@Supervisor = N'' OR [SupervisorName] LIKE N'%' + @Supervisor + N'%')
      AND (@Location = N'' OR [LocationName] LIKE N'%' + @Location + N'%')
      AND (@WorkDate IS NULL OR [WorkDate]=@WorkDate)
      AND (@Project = N'' OR [ProjectCode]=@Project OR [ProjectName] LIKE N'%' + @Project + N'%')
      AND (@Q = N'%%' OR [ReferenceCode] LIKE @Q OR [SupervisorName] LIKE @Q OR [ProjectCode] LIKE @Q OR [ProjectName] LIKE @Q OR [Summary] LIKE @Q OR [LocationName] LIKE @Q)
      ${scope.sql}
  `;
  const status = text(filters.status);
  const statusSql = status === 'Overdue'
    ? ` AND [Status]=N'Pending' AND DATEDIFF(day, [EnteredAt], SYSUTCDATETIME()) >= @Sla`
    : status && status !== 'All Statuses'
      ? ` AND [Status]=@Status`
      : '';
  if (status && status !== 'All Statuses' && status !== 'Overdue') request.input('Status', sql.NVarChar(30), status);
  const filtered = `${where}${statusSql}`;
  const counts = await request.query(`
    SELECT
      SUM(CASE WHEN [Status]=N'Pending' AND DATEDIFF(day, [EnteredAt], SYSUTCDATETIME()) < @Sla THEN 1 ELSE 0 END) AS Pending,
      SUM(CASE WHEN [Status]=N'Approved' OR [Status]=N'Payroll Ready' THEN 1 ELSE 0 END) AS Approved,
      SUM(CASE WHEN [Status]=N'Returned' THEN 1 ELSE 0 END) AS Returned,
      SUM(CASE WHEN [Status]=N'Pending' AND DATEDIFF(day, [EnteredAt], SYSUTCDATETIME()) >= @Sla THEN 1 ELSE 0 END) AS Overdue,
      COUNT(1) AS Total
    FROM [tsmgmt].[ApprovalItems] ${where}
  `);
  const pageRequest = connection.request()
    .input('Stage', sql.NVarChar(40), stage)
    .input('PeriodId', sql.NVarChar(40), text(filters.periodId))
    .input('Supervisor', sql.NVarChar(180), text(filters.supervisor))
    .input('Location', sql.NVarChar(180), text(filters.location))
    .input('WorkDate', sql.Date, dateOnly(filters.workDate) || null)
    .input('Project', sql.NVarChar(80), text(filters.project))
    .input('Q', sql.NVarChar(80), `%${text(filters.q)}%`)
    .input('Sla', sql.Int, APPROVAL_SLA_DAYS)
    .input('Offset', sql.Int, (page - 1) * pageSize)
    .input('PageSize', sql.Int, pageSize);
  if (scope.scoped) bindApprovalViewer(pageRequest, viewer);
  if (status && status !== 'All Statuses' && status !== 'Overdue') pageRequest.input('Status', sql.NVarChar(30), status);
  const rows = await pageRequest.query(`SELECT * FROM [tsmgmt].[ApprovalItems] ${filtered} ORDER BY [EnteredAt] DESC OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY`);
  const totalRequest = connection.request()
    .input('Stage', sql.NVarChar(40), stage)
    .input('PeriodId', sql.NVarChar(40), text(filters.periodId))
    .input('Supervisor', sql.NVarChar(180), text(filters.supervisor))
    .input('Location', sql.NVarChar(180), text(filters.location))
    .input('WorkDate', sql.Date, dateOnly(filters.workDate) || null)
    .input('Project', sql.NVarChar(80), text(filters.project))
    .input('Q', sql.NVarChar(80), `%${text(filters.q)}%`)
    .input('Sla', sql.Int, APPROVAL_SLA_DAYS);
  if (scope.scoped) bindApprovalViewer(totalRequest, viewer);
  if (status && status !== 'All Statuses' && status !== 'Overdue') totalRequest.input('Status', sql.NVarChar(30), status);
  const total = await totalRequest.query(`SELECT COUNT(1) AS Total FROM [tsmgmt].[ApprovalItems] ${filtered}`);
  const kpi = counts.recordset?.[0] || {};
  return {
    stage,
    page,
    pageSize,
    total: Number(total.recordset?.[0]?.Total || 0),
    kpis: { pending: Number(kpi.Pending || 0), approved: Number(kpi.Approved || 0), returned: Number(kpi.Returned || 0), overdue: Number(kpi.Overdue || 0), total: Number(kpi.Total || 0) },
    rows: (rows.recordset || []).map(mapItem),
    returnReasons: RETURN_REASONS,
    slaDays: APPROVAL_SLA_DAYS,
  };
};

const loadItems = async (connection: sql.ConnectionPool, ids: string[]) => {
  if (!ids.length) return [];
  const request = connection.request();
  ids.forEach((id, index) => request.input(`Id${index}`, sql.NVarChar(40), id));
  const result = await request.query(`SELECT * FROM [tsmgmt].[ApprovalItems] WHERE [Id] IN (${ids.map((_, index) => `@Id${index}`).join(', ')})`);
  return (result.recordset || []).map(mapItem);
};

const setTimesheetStatus = async (connection: sql.ConnectionPool, timesheetId: string, status: string, actor: string, returnReason = '') => {
  await connection.request()
    .input('Id', sql.NVarChar(40), timesheetId)
    .input('Status', sql.NVarChar(30), status)
    .input('Reason', sql.NVarChar(500), returnReason)
    .input('Actor', sql.NVarChar(120), actor)
    .query(`UPDATE [tsmgmt].[Timesheets] SET [Status]=@Status, [ReturnReason]=CASE WHEN @Reason = N'' THEN [ReturnReason] ELSE @Reason END, [UpdatedAt]=SYSUTCDATETIME(), [UpdatedBy]=@Actor WHERE [Id]=@Id AND [Status] <> N'Payroll Ready'`);
};

const projectSplits = async (connection: sql.ConnectionPool, timesheetId: string) => {
  const result = await connection.request().input('Id', sql.NVarChar(40), timesheetId).query(`
    SELECT a.[ProjectCode], MAX(ISNULL(a.[ProjectName], a.[ProjectCode])) AS ProjectName,
      ISNULL(SUM(a.[RegularHours]), 0) AS RegularHours, ISNULL(SUM(a.[OvtHours]), 0) AS OvtHours,
      COUNT(DISTINCT l.[EmployeeCode]) AS Employees
    FROM [tsmgmt].[TimesheetAllocations] a
    INNER JOIN [tsmgmt].[TimesheetEntryLines] l ON l.[Id]=a.[LineId]
    WHERE l.[TimesheetId]=@Id AND (a.[RegularHours] > 0 OR a.[OvtHours] > 0)
    GROUP BY a.[ProjectCode]
  `);
  const projects = result.recordset || [];
  const managers = new Map<string, string>();
  if (projects.length) {
    const request = connection.request();
    projects.forEach((row, index) => request.input(`Code${index}`, sql.NVarChar(80), text(row.ProjectCode)));
    const found = await request.query(`SELECT [Code], ISNULL([ProjectManager], N'') AS ProjectManager, [Name] FROM [hris].[TimesheetProjects] WHERE [Code] IN (${projects.map((_, index) => `@Code${index}`).join(', ')})`).catch(() => ({ recordset: [] as Record<string, unknown>[] }));
    for (const row of found.recordset || []) managers.set(text(row.Code).toUpperCase(), text(row.ProjectManager));
  }
  return projects.map((row) => ({
    code: text(row.ProjectCode),
    name: text(row.ProjectName),
    regular: Number(row.RegularHours || 0),
    ovt: Number(row.OvtHours || 0),
    employees: Number(row.Employees || 0),
    manager: managers.get(text(row.ProjectCode).toUpperCase()) || '',
  }));
};

const advanceAfter = async (connection: sql.ConnectionPool, item: ReturnType<typeof mapItem>, actor: string, role: string) => {
  if (item.kind === 'Mobilization') {
    await notify('Mobilization acknowledged', `${item.reference} was acknowledged. No attendance or hours were created.`);
    return;
  }
  const header = await connection.request().input('Id', sql.NVarChar(40), item.timesheetId).query(`SELECT * FROM [tsmgmt].[Timesheets] WHERE [Id]=@Id`);
  const sheet = header.recordset?.[0];
  if (!sheet) return;
  const base = {
    timesheetId: item.timesheetId,
    reference: item.reference,
    version: item.version,
    periodId: text(sheet.PeriodId),
    workDate: dateOnly(sheet.WorkDate),
    supervisor: text(sheet.SupervisorName),
    location: text(sheet.LocationName),
    workCenter: text(sheet.WorkCenterName),
    regular: item.regular,
    ovt: item.ovt,
    nights: item.nights,
    employees: item.employees,
    exceptions: item.exceptions,
  };
  if (item.stage === 'Cost Control') {
    const splits = await projectSplits(connection, item.timesheetId);
    if (!splits.length) {
      await insertItem(connection, { ...base, stage: 'Consolidation', summary: 'No project hours to split' });
      await setTimesheetStatus(connection, item.timesheetId, 'Consolidation', actor);
      return;
    }
    for (const project of splits) {
      await insertItem(connection, { ...base, stage: 'Project Manager', projectCode: project.code, projectName: project.name, projectManager: project.manager, regular: project.regular, ovt: project.ovt, employees: project.employees, summary: project.manager || 'Project manager not set' });
    }
    await setTimesheetStatus(connection, item.timesheetId, 'Project Manager', actor);
    await notify('Project approval required', `${item.reference} was split across ${splits.length} project${splits.length === 1 ? '' : 's'}.`);
    return;
  }
  if (item.stage === 'Project Manager') {
    const open = await connection.request().input('Id', sql.NVarChar(40), item.timesheetId).input('Version', sql.Int, item.version).query(`SELECT [Status] FROM [tsmgmt].[ApprovalItems] WHERE [TimesheetId]=@Id AND [VersionNo]=@Version AND [Stage]=N'Project Manager'`);
    const rows = open.recordset || [];
    if (rows.some((row) => text(row.Status) === 'Pending' || text(row.Status) === 'Returned')) return;
    await insertItem(connection, { ...base, stage: 'Consolidation', summary: `${rows.length} of ${rows.length} projects approved` });
    await setTimesheetStatus(connection, item.timesheetId, 'Consolidation', actor);
    await notify('Timesheet ready to consolidate', `${item.reference} has all project approvals.`);
    return;
  }
  const next = NEXT_STAGE[item.stage];
  if (!next) {
    await setTimesheetStatus(connection, item.timesheetId, 'Payroll Ready', actor);
    await notify('Timesheet is payroll ready', `${item.reference} can enter the payroll snapshot. Hours were not changed.`);
    return;
  }
  await insertItem(connection, { ...base, stage: next, summary: item.summary });
  await setTimesheetStatus(connection, item.timesheetId, next === 'Payroll Readiness' ? 'Payroll Readiness' : next, actor);
  await event(connection, { timesheetId: item.timesheetId, version: item.version, stage: next, action: `Moved to ${next}`, actor, role, newStatus: 'Pending' });
  await notify(`Timesheet awaiting ${next}`, `${item.reference} moved to ${next}.`);
};

const assertApprovalAccess = (viewer: ApprovalViewer, item: ReturnType<typeof mapItem>) => {
  if (viewer.canSeeAll || (item.stage !== 'Supervisor' && item.stage !== 'Project Manager')) return;
  const stored = item.stage === 'Project Manager' ? item.projectManager : item.supervisor;
  if (approvalViewerOwns(viewer, stored)) return;
  throw new Error(item.stage === 'Supervisor' ? 'You can only open timesheets awaiting you for your own team.' : 'You can only open project items assigned to you.');
};

export const actOnApprovals = async (input: { ids: string[]; action: 'approve' | 'return'; reason?: string; comment?: string; actor: string; employeeCode?: string; role?: string; canSeeAll?: boolean }) => {
  const connection = await pool();
  const items = await loadItems(connection, input.ids || []);
  if (!items.length) throw new Error('Select an approval item.');
  if (items.some((item) => item.storedStatus !== 'Pending')) throw new Error('This item has changed since you opened it. Refresh to view the latest status.');
  const stage = items[0].stage;
  if (items.some((item) => item.stage !== stage)) throw new Error('Selected items must be at the same approval stage.');
  if (input.action === 'return' && !text(input.reason)) throw new Error('A return reason is required.');
  if (input.action === 'approve' && items.some((item) => item.exceptions > 0 && item.kind === 'Timesheet')) throw new Error('A selected timesheet has exceptions. Open it and return the exception instead of approving the whole item.');
  const actor = text(input.actor) || 'Timesheet User';
  const viewer: ApprovalViewer = { actor, employeeCode: text(input.employeeCode), role: text(input.role), canSeeAll: Boolean(input.canSeeAll) };
  for (const item of items) assertApprovalAccess(viewer, item);
  for (const item of items) {
    const nextStatus = input.action === 'approve' ? (item.stage === 'Payroll Readiness' ? 'Payroll Ready' : 'Approved') : 'Returned';
    const updated = await connection.request()
      .input('Id', sql.NVarChar(40), item.id)
      .input('Version', sql.Int, item.version)
      .input('Status', sql.NVarChar(30), nextStatus)
      .input('Actor', sql.NVarChar(120), actor)
      .input('Role', sql.NVarChar(120), text(input.role))
      .input('Reason', sql.NVarChar(80), text(input.reason))
      .input('Comment', sql.NVarChar(1000), text(input.comment))
      .query(`UPDATE [tsmgmt].[ApprovalItems] SET [Status]=@Status, [ActedAt]=SYSUTCDATETIME(), [ActedBy]=@Actor, [ActorRole]=@Role, [ReturnReason]=@Reason, [Comment]=@Comment WHERE [Id]=@Id AND [VersionNo]=@Version AND [Status]=N'Pending'`);
    if (!updated.rowsAffected?.[0]) throw new Error('This item has changed since you opened it. Refresh to view the latest status.');
    await event(connection, { itemId: item.id, timesheetId: item.timesheetId, version: item.version, stage: item.stage, action: input.action === 'approve' ? `${item.stage} approved` : `${item.stage} returned`, actor, role: input.role, previousStatus: 'Pending', newStatus: nextStatus, reason: input.reason, comment: input.comment });
    if (input.action === 'return' && item.kind === 'Timesheet') {
      await connection.request().input('Id', sql.NVarChar(40), item.timesheetId).input('Version', sql.Int, item.version).input('Reason', sql.NVarChar(300), text(input.reason)).query(`UPDATE [tsmgmt].[ApprovalItems] SET [Status]=N'Returned', [ReturnReason]=@Reason, [ActedAt]=SYSUTCDATETIME() WHERE [TimesheetId]=@Id AND [VersionNo]=@Version AND [Status]=N'Pending'`);
      await setTimesheetStatus(connection, item.timesheetId, 'Returned', actor, text(input.reason));
      await notify('Timesheet returned', `${item.reference} was returned: ${text(input.reason)}. Correct it in Timesheet Review and resubmit version ${item.version + 1}.`);
    } else if (input.action === 'approve') {
      await advanceAfter(connection, item, actor, text(input.role));
    }
  }
  return { updated: items.length, stage, action: input.action };
};

export const readApprovalDetail = async (id: string, viewer?: ApprovalViewer) => {
  const connection = await pool();
  const items = await loadItems(connection, [id]);
  const item = items[0];
  if (!item) throw new Error('Approval item was not found.');
  if (viewer) assertApprovalAccess(viewer, item);
  const events = await connection.request().input('Id', sql.NVarChar(40), item.timesheetId).query(`SELECT * FROM [tsmgmt].[ApprovalEvents] WHERE [TimesheetId]=@Id ORDER BY [CreatedAt]`);
  const history = (events.recordset || []).map((row) => ({ id: text(row.Id), action: text(row.Action), stage: text(row.Stage), actor: text(row.Actor), role: text(row.ActorRole), at: row.CreatedAt ? new Date(String(row.CreatedAt)).toISOString() : '', reason: text(row.Reason), comment: text(row.Comment), previousStatus: text(row.PreviousStatus), newStatus: text(row.NewStatus) }));
  if (item.kind === 'Mobilization') {
    const people = await connection.request().input('Id', sql.NVarChar(40), item.timesheetId).query(`SELECT [EmployeeCode],[EmployeeName],[Status],[ExceptionStatus],[EffectiveFrom],[ExpectedReturn],[ActualReturn] FROM [tsmgmt].[MobilizationEmployees] WHERE [MobilizationId]=@Id ORDER BY [EmployeeName]`);
    return { item, history, employees: (people.recordset || []).map((row) => ({ code: text(row.EmployeeCode), name: text(row.EmployeeName), status: text(row.Status), exception: text(row.ExceptionStatus), from: dateOnly(row.EffectiveFrom), expected: dateOnly(row.ExpectedReturn), actual: dateOnly(row.ActualReturn) })), projects: [], settings: { nightAllowance: 1500 } };
  }
  const header = await connection.request().input('Id', sql.NVarChar(40), item.timesheetId).query(`SELECT * FROM [tsmgmt].[Timesheets] WHERE [Id]=@Id`);
  const sheet = header.recordset?.[0] || {};
  const lines = await connection.request().input('Id', sql.NVarChar(40), item.timesheetId).query(`
    SELECT l.*, a.[ProjectCode], a.[ProjectName], a.[RegularHours], a.[OvtHours], a.[Activity], a.[ChargeCode], a.[OvtReason]
    FROM [tsmgmt].[TimesheetEntryLines] l
    LEFT JOIN [tsmgmt].[TimesheetAllocations] a ON a.[LineId]=l.[Id]
    WHERE l.[TimesheetId]=@Id
  `);
  const projectFilter = item.stage === 'Project Manager' && item.projectCode ? item.projectCode.toUpperCase() : '';
  const employees = new Map<string, { code: string; name: string; attendance: string; regular: number; ovt: number; night: boolean; nightStart: string; nightEnd: string; projects: string[]; exception: string; operational: string }>();
  const projects = new Map<string, { code: string; name: string; employees: Set<string>; regular: number; ovt: number }>();
  for (const row of lines.recordset || []) {
    const code = text(row.ProjectCode).toUpperCase();
    if (projectFilter && code && code !== projectFilter) continue;
    const employeeCode = text(row.EmployeeCode);
    const current = employees.get(employeeCode) || { code: employeeCode, name: text(row.EmployeeName), attendance: text(row.AttendanceStatus), regular: 0, ovt: 0, night: Boolean(row.NightSession), nightStart: text(row.NightStart), nightEnd: text(row.NightEnd), projects: [], exception: text(row.ExceptionReason), operational: text(row.OperationalStatus) };
    current.regular += Number(row.RegularHours || 0);
    current.ovt += Number(row.OvtHours || 0);
    if (text(row.ProjectCode) && !current.projects.includes(text(row.ProjectCode))) current.projects.push(text(row.ProjectCode));
    employees.set(employeeCode, current);
    if (text(row.ProjectCode)) {
      const project = projects.get(text(row.ProjectCode)) || { code: text(row.ProjectCode), name: text(row.ProjectName), employees: new Set<string>(), regular: 0, ovt: 0 };
      project.employees.add(employeeCode);
      project.regular += Number(row.RegularHours || 0);
      project.ovt += Number(row.OvtHours || 0);
      projects.set(project.code, project);
    }
  }
  const siblings = await connection.request().input('Id', sql.NVarChar(40), item.timesheetId).input('Version', sql.Int, item.version).query(`SELECT [ProjectCode], [Status] FROM [tsmgmt].[ApprovalItems] WHERE [TimesheetId]=@Id AND [VersionNo]=@Version AND [Stage]=N'Project Manager'`);
  return {
    item,
    sheet: { reference: text(sheet.ReferenceCode), periodId: text(sheet.PeriodId), workDate: dateOnly(sheet.WorkDate), supervisor: text(sheet.SupervisorName), location: text(sheet.LocationName), workCenter: text(sheet.WorkCenterName), shift: text(sheet.ShiftLabel), status: text(sheet.Status), version: Number(sheet.VersionNo || 1), dayKind: text(sheet.DayKind), holidayName: text(sheet.HolidayName), capturedBy: text(sheet.CreatedBy), submittedAt: sheet.UpdatedAt ? new Date(String(sheet.UpdatedAt)).toISOString() : '' },
    employees: [...employees.values()],
    projects: [...projects.values()].map((project) => ({ ...project, employees: project.employees.size, approval: text((siblings.recordset || []).find((row) => text(row.ProjectCode) === project.code)?.Status) })),
    projectProgress: { approved: (siblings.recordset || []).filter((row) => text(row.Status) === 'Approved').length, total: (siblings.recordset || []).length },
    history,
    settings: { nightAllowance: 1500 },
  };
};

export const approvalReturnReasons = () => RETURN_REASONS;
