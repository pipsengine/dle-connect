import crypto from 'node:crypto';
import { approvedOvertimeStatuses } from '@/lib/timesheet-overtime-config';
import sql from 'mssql';
import { getDleEnterpriseDbPool } from '@/lib/dle-enterprise-db';
import { resolvePublicAppOrigin } from '@/lib/public-app-url';
import {
  sendOvertimeApprovalRequestEmail,
  sendOvertimeApprovedEmail,
  sendOvertimeRejectedEmail,
} from '@/lib/mail-service';
import { overtimeAuthorizePageUrl } from '@/lib/leave-email-action-token';
import type { SessionPayload } from '@/lib/auth/session';
import { readPayrollEmployees } from '@/lib/payroll-employee-source';
import { postApprovedOvertimeToTimesheets } from '@/lib/overtime-timesheet-posting';

export type OvertimeAuthorizationStatus =
  | 'Submitted'
  | 'Project Manager Approved'
  | 'GM Operations Approved'
  | 'HR Approved'
  | 'Rejected'
  | 'Cancelled';

export type OvertimeAuthorizationEmployeeLine = {
  id: string;
  employeeCode: string;
  employeeName: string;
  jobTitle: string;
  department: string;
  overtimeHours: number;
  dayType: string;
};

export type OvertimeAuthorizationRequest = {
  id: string;
  projectCode: string;
  projectName: string;
  workDate: string;
  workCenter: string;
  supervisorCode: string;
  supervisorName: string;
  requestedHours: number;
  requestedHeadcount: number;
  reason: string;
  status: OvertimeAuthorizationStatus;
  currentOwnerRole: string;
  currentOwnerName: string;
  projectManagerName: string;
  projectManagerEmail: string | null;
  gmOperationsName: string;
  gmOperationsEmail: string | null;
  hrApproverName: string;
  hrApproverEmail: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  employees: OvertimeAuthorizationEmployeeLine[];
};

export type OvertimeAuthorizationEmployeeInput = {
  employeeCode: string;
  employeeName?: string | null;
  jobTitle?: string | null;
  department?: string | null;
  overtimeHours: number;
  dayType?: string | null;
};

export type OvertimeAuthorizationInput = {
  projectCode: string;
  projectName?: string | null;
  workDate: string;
  workCenter?: string | null;
  supervisorCode?: string | null;
  supervisorName?: string | null;
  requestedHours: number;
  requestedHeadcount?: number | null;
  reason?: string | null;
  overtimeType?: string | null;
  projectManagerName?: string | null;
  projectManagerEmail?: string | null;
  gmOperationsName?: string | null;
  gmOperationsEmail?: string | null;
  hrApproverName?: string | null;
  hrApproverEmail?: string | null;
  employees?: OvertimeAuthorizationEmployeeInput[] | null;
  portalBaseUrl?: string | null;
};

type DbAuthorizationRow = {
  Id: string;
  ProjectCode: string;
  ProjectName: string;
  WorkDate: Date | string;
  WorkCenter: string;
  SupervisorCode: string;
  SupervisorName: string;
  RequestedHours: number;
  RequestedHeadcount: number;
  Reason: string;
  WorkflowStatus: OvertimeAuthorizationStatus;
  CurrentOwnerRole: string;
  CurrentOwnerName: string;
  ProjectManagerName: string;
  ProjectManagerEmail: string | null;
  GmOperationsName: string | null;
  GmOperationsEmail: string | null;
  HrApproverName: string | null;
  HrApproverEmail: string | null;
  CreatedBy: string;
  CreatedAt: Date | string;
  UpdatedAt: Date | string;
};

type DbAuthorizationEmployeeRow = {
  Id: string;
  RequestId: string;
  EmployeeCode: string;
  EmployeeName: string;
  JobTitle: string | null;
  Department: string | null;
  OvertimeHours: number;
  DayType: string | null;
};

const dbReady = { value: false };
const clean = (value: unknown) => String(value || '').trim();
const num = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const round2 = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
const dateOnly = (value: Date | string) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
const iso = (value: Date | string) => new Date(value).toISOString();
const token = () => crypto.randomBytes(32).toString('hex');

const systemSession = (actor: string): SessionPayload => ({
  sub: 'system-overtime-workflow',
  username: 'system-overtime-workflow',
  fullName: actor || 'Overtime Workflow',
  roles: ['System'],
  permissions: ['*'],
  status: 'Active',
  firstLoginRequired: false,
  passwordResetRequired: false,
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 3600,
});

const ensureDb = async () => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new Error('DLE Enterprise database is not configured. Overtime approval workflow requires HRIS database persistence.');
  if (!dbReady.value) {
    await pool.request().query(`
IF SCHEMA_ID(N'hris') IS NULL EXEC(N'CREATE SCHEMA [hris]');
IF OBJECT_ID(N'[hris].[OvertimeAuthorizationRequests]', N'U') IS NULL
CREATE TABLE [hris].[OvertimeAuthorizationRequests] (
  [Id] NVARCHAR(120) NOT NULL CONSTRAINT [PK_OvertimeAuthorizationRequests] PRIMARY KEY,
  [ProjectCode] NVARCHAR(80) NOT NULL,
  [ProjectName] NVARCHAR(220) NOT NULL,
  [WorkDate] DATE NOT NULL,
  [WorkCenter] NVARCHAR(180) NOT NULL,
  [SupervisorCode] NVARCHAR(80) NOT NULL,
  [SupervisorName] NVARCHAR(220) NOT NULL,
  [RequestedHours] DECIMAL(9,2) NOT NULL,
  [RequestedHeadcount] INT NOT NULL,
  [Reason] NVARCHAR(700) NOT NULL,
  [WorkflowStatus] NVARCHAR(60) NOT NULL,
  [CurrentOwnerRole] NVARCHAR(80) NOT NULL,
  [CurrentOwnerName] NVARCHAR(220) NOT NULL,
  [ProjectManagerName] NVARCHAR(220) NOT NULL,
  [ProjectManagerEmail] NVARCHAR(320) NULL,
  [MdApproverName] NVARCHAR(220) NOT NULL,
  [MdApproverEmail] NVARCHAR(320) NULL,
  [CreatedBy] NVARCHAR(220) NOT NULL,
  [CreatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_OvertimeAuthorizationRequests_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_OvertimeAuthorizationRequests_UpdatedAt] DEFAULT SYSUTCDATETIME()
);
IF COL_LENGTH(N'[hris].[OvertimeAuthorizationRequests]', 'GmOperationsName') IS NULL
  ALTER TABLE [hris].[OvertimeAuthorizationRequests] ADD [GmOperationsName] NVARCHAR(220) NULL;
IF COL_LENGTH(N'[hris].[OvertimeAuthorizationRequests]', 'GmOperationsEmail') IS NULL
  ALTER TABLE [hris].[OvertimeAuthorizationRequests] ADD [GmOperationsEmail] NVARCHAR(320) NULL;
IF COL_LENGTH(N'[hris].[OvertimeAuthorizationRequests]', 'HrApproverName') IS NULL
  ALTER TABLE [hris].[OvertimeAuthorizationRequests] ADD [HrApproverName] NVARCHAR(220) NULL;
IF COL_LENGTH(N'[hris].[OvertimeAuthorizationRequests]', 'HrApproverEmail') IS NULL
  ALTER TABLE [hris].[OvertimeAuthorizationRequests] ADD [HrApproverEmail] NVARCHAR(320) NULL;
IF OBJECT_ID(N'[hris].[OvertimeAuthorizationEmployees]', N'U') IS NULL
CREATE TABLE [hris].[OvertimeAuthorizationEmployees] (
  [Id] NVARCHAR(120) NOT NULL CONSTRAINT [PK_OvertimeAuthorizationEmployees] PRIMARY KEY,
  [RequestId] NVARCHAR(120) NOT NULL,
  [EmployeeCode] NVARCHAR(80) NOT NULL,
  [EmployeeName] NVARCHAR(220) NOT NULL,
  [JobTitle] NVARCHAR(180) NULL,
  [Department] NVARCHAR(180) NULL,
  [OvertimeHours] DECIMAL(9,2) NOT NULL,
  [DayType] NVARCHAR(40) NULL,
  [CreatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_OvertimeAuthorizationEmployees_CreatedAt] DEFAULT SYSUTCDATETIME()
);
IF OBJECT_ID(N'[hris].[OvertimeAuthorizationAudit]', N'U') IS NULL
CREATE TABLE [hris].[OvertimeAuthorizationAudit] (
  [Id] NVARCHAR(120) NOT NULL CONSTRAINT [PK_OvertimeAuthorizationAudit] PRIMARY KEY,
  [RequestId] NVARCHAR(120) NOT NULL,
  [Actor] NVARCHAR(220) NOT NULL,
  [ActionName] NVARCHAR(80) NOT NULL,
  [OldStatus] NVARCHAR(60) NULL,
  [NewStatus] NVARCHAR(60) NOT NULL,
  [Comment] NVARCHAR(700) NULL,
  [CreatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_OvertimeAuthorizationAudit_CreatedAt] DEFAULT SYSUTCDATETIME()
);
IF OBJECT_ID(N'[hris].[OvertimeAuthorizationTokens]', N'U') IS NULL
CREATE TABLE [hris].[OvertimeAuthorizationTokens] (
  [Token] NVARCHAR(120) NOT NULL CONSTRAINT [PK_OvertimeAuthorizationTokens] PRIMARY KEY,
  [RequestId] NVARCHAR(120) NOT NULL,
  [Stage] NVARCHAR(60) NOT NULL,
  [Decision] NVARCHAR(20) NOT NULL,
  [RecipientName] NVARCHAR(220) NOT NULL,
  [RecipientEmail] NVARCHAR(320) NULL,
  [ExpiresAt] DATETIME2 NOT NULL,
  [UsedAt] DATETIME2 NULL,
  [CreatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_OvertimeAuthorizationTokens_CreatedAt] DEFAULT SYSUTCDATETIME()
);
IF OBJECT_ID(N'[hris].[EmailNotificationOutbox]', N'U') IS NULL
CREATE TABLE [hris].[EmailNotificationOutbox] (
  [Id] NVARCHAR(120) NOT NULL CONSTRAINT [PK_EmailNotificationOutbox] PRIMARY KEY,
  [RecipientEmail] NVARCHAR(320) NULL,
  [RecipientName] NVARCHAR(220) NOT NULL,
  [Subject] NVARCHAR(300) NOT NULL,
  [HtmlBody] NVARCHAR(MAX) NOT NULL,
  [TextBody] NVARCHAR(MAX) NOT NULL,
  [ProviderStatus] NVARCHAR(60) NOT NULL,
  [ProviderResponse] NVARCHAR(MAX) NULL,
  [CreatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_EmailNotificationOutbox_CreatedAt] DEFAULT SYSUTCDATETIME()
);`);
    dbReady.value = true;
  }
  return pool;
};

const mapRow = (row: DbAuthorizationRow, employees: OvertimeAuthorizationEmployeeLine[] = []): OvertimeAuthorizationRequest => ({
  id: row.Id,
  projectCode: row.ProjectCode,
  projectName: row.ProjectName,
  workDate: dateOnly(row.WorkDate),
  workCenter: row.WorkCenter,
  supervisorCode: row.SupervisorCode,
  supervisorName: row.SupervisorName,
  requestedHours: Number(row.RequestedHours || 0),
  requestedHeadcount: Number(row.RequestedHeadcount || 0),
  reason: row.Reason,
  status: row.WorkflowStatus,
  currentOwnerRole: row.CurrentOwnerRole,
  currentOwnerName: row.CurrentOwnerName,
  projectManagerName: row.ProjectManagerName,
  projectManagerEmail: row.ProjectManagerEmail,
  gmOperationsName: clean(row.GmOperationsName) || 'GM Operations',
  gmOperationsEmail: row.GmOperationsEmail,
  hrApproverName: clean(row.HrApproverName) || 'HR Manager',
  hrApproverEmail: row.HrApproverEmail,
  createdBy: row.CreatedBy,
  createdAt: iso(row.CreatedAt),
  updatedAt: iso(row.UpdatedAt),
  employees,
});

const mapEmployeeRow = (row: DbAuthorizationEmployeeRow): OvertimeAuthorizationEmployeeLine => ({
  id: row.Id,
  employeeCode: row.EmployeeCode,
  employeeName: row.EmployeeName,
  jobTitle: clean(row.JobTitle),
  department: clean(row.Department),
  overtimeHours: Number(row.OvertimeHours || 0),
  dayType: clean(row.DayType) || 'Weekday',
});

const portalBase = (input?: string | null) => resolvePublicAppOrigin(input);

const emailForName = async (nameOrEmail: string) => {
  const value = clean(nameOrEmail);
  if (!value) return null;
  if (value.includes('@')) return value;
  const source = await readPayrollEmployees();
  const lower = value.toLowerCase();
  const employee = source.employees.find((item) =>
    [item.employeeCode, item.employeeId, item.fullName].some((field) => clean(field).toLowerCase() === lower || clean(field).toLowerCase().includes(lower)),
  );
  return clean(employee?.officialEmail || employee?.email || employee?.personalEmail) || null;
};

const writeAudit = async (requestId: string, actor: string, action: string, oldStatus: string | null, newStatus: string, comment?: string | null) => {
  const pool = await ensureDb();
  await pool.request()
    .input('Id', sql.NVarChar(120), `ota-aud-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    .input('RequestId', sql.NVarChar(120), requestId)
    .input('Actor', sql.NVarChar(220), clean(actor) || 'Overtime Workflow')
    .input('ActionName', sql.NVarChar(80), action)
    .input('OldStatus', sql.NVarChar(60), oldStatus)
    .input('NewStatus', sql.NVarChar(60), newStatus)
    .input('Comment', sql.NVarChar(700), clean(comment) || null)
    .query('INSERT INTO [hris].[OvertimeAuthorizationAudit] ([Id],[RequestId],[Actor],[ActionName],[OldStatus],[NewStatus],[Comment]) VALUES (@Id,@RequestId,@Actor,@ActionName,@OldStatus,@NewStatus,@Comment);');
};

const saveToken = async (requestId: string, stage: string, decision: 'approve' | 'reject', recipientName: string, recipientEmail: string | null) => {
  const pool = await ensureDb();
  const value = token();
  await pool.request()
    .input('Token', sql.NVarChar(120), value)
    .input('RequestId', sql.NVarChar(120), requestId)
    .input('Stage', sql.NVarChar(60), stage)
    .input('Decision', sql.NVarChar(20), decision)
    .input('RecipientName', sql.NVarChar(220), recipientName)
    .input('RecipientEmail', sql.NVarChar(320), recipientEmail)
    .query(`INSERT INTO [hris].[OvertimeAuthorizationTokens] ([Token],[RequestId],[Stage],[Decision],[RecipientName],[RecipientEmail],[ExpiresAt])
VALUES (@Token,@RequestId,@Stage,@Decision,@RecipientName,@RecipientEmail,DATEADD(day,7,SYSUTCDATETIME()));`);
  return value;
};

const deliverEmail = async (recipientEmail: string | null, recipientName: string, subject: string, html: string, text: string) => {
  const pool = await ensureDb();
  let providerStatus = recipientEmail ? 'Queued' : 'Missing Recipient Email';
  let providerResponse: string | null = null;
  const webhook = clean(process.env.EMAIL_WEBHOOK_URL);
  if (recipientEmail && webhook) {
    try {
      const response = await fetch(webhook, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ to: recipientEmail, recipientName, subject, html, text }),
      });
      providerStatus = response.ok ? 'Sent' : 'Provider Error';
      providerResponse = await response.text().catch(() => `${response.status}`);
    } catch (error) {
      providerStatus = 'Provider Error';
      providerResponse = error instanceof Error ? error.message : 'Email provider failed';
    }
  }
  await pool.request()
    .input('Id', sql.NVarChar(120), `email-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    .input('RecipientEmail', sql.NVarChar(320), recipientEmail)
    .input('RecipientName', sql.NVarChar(220), recipientName)
    .input('Subject', sql.NVarChar(300), subject)
    .input('HtmlBody', sql.NVarChar(sql.MAX), html)
    .input('TextBody', sql.NVarChar(sql.MAX), text)
    .input('ProviderStatus', sql.NVarChar(60), providerStatus)
    .input('ProviderResponse', sql.NVarChar(sql.MAX), providerResponse)
    .query('INSERT INTO [hris].[EmailNotificationOutbox] ([Id],[RecipientEmail],[RecipientName],[Subject],[HtmlBody],[TextBody],[ProviderStatus],[ProviderResponse]) VALUES (@Id,@RecipientEmail,@RecipientName,@Subject,@HtmlBody,@TextBody,@ProviderStatus,@ProviderResponse);');
};

type ApprovalStage = 'project-manager' | 'gm-operations' | 'hr';

const stageRecipient = (request: OvertimeAuthorizationRequest, stage: ApprovalStage) => {
  if (stage === 'gm-operations') return { recipientName: request.gmOperationsName, recipientEmail: request.gmOperationsEmail, role: 'GM Operations' };
  if (stage === 'hr') return { recipientName: request.hrApproverName, recipientEmail: request.hrApproverEmail, role: 'HR Manager' };
  return { recipientName: request.projectManagerName, recipientEmail: request.projectManagerEmail, role: 'Project Manager' };
};

const notifyApprovalOwner = async (request: OvertimeAuthorizationRequest, stage: ApprovalStage, baseUrl?: string | null) => {
  const { recipientName, recipientEmail, role } = stageRecipient(request, stage);
  const approveToken = await saveToken(request.id, stage, 'approve', recipientName, recipientEmail);
  const rejectToken = await saveToken(request.id, stage, 'reject', recipientName, recipientEmail);
  const openLink = `${portalBase(baseUrl)}/hris/workforce-management/overtime-management?requestId=${encodeURIComponent(request.id)}`;
  const approveLink = overtimeAuthorizePageUrl(approveToken, baseUrl);
  const rejectLink = overtimeAuthorizePageUrl(rejectToken, baseUrl);
  const subject = `Overtime approval required: ${request.projectCode} on ${request.workDate}`;
  await createEnterpriseNotification(systemSession(request.createdBy), {
    kind: 'Approval',
    module: 'Overtime Management',
    title: subject,
    body: `${request.requestedHours}h overtime for ${request.projectCode} requires ${role} approval.`,
    severity: 'warning',
    href: openLink.replace(portalBase(baseUrl), ''),
    recipientRoles: [role],
    channels: ['In-App', 'Email'],
    metadata: { requestId: request.id, stage },
  });
  await sendOvertimeApprovalRequestEmail({
    recipientName,
    recipientEmail,
    role,
    request: {
      projectCode: request.projectCode,
      projectName: request.projectName,
      workDate: request.workDate,
      supervisorName: request.supervisorName,
      requestedHours: request.requestedHours,
      reason: request.reason,
    },
    approveLink,
    rejectLink,
    workspaceLink: openLink,
  });
};

const notifySupervisorRejected = async (request: OvertimeAuthorizationRequest, actor?: string | null, reason?: string | null, baseUrl?: string | null) => {
  const workspaceLink = `${portalBase(baseUrl)}/hris/workforce-management/overtime-management?requestId=${encodeURIComponent(request.id)}`;
  const supervisorEmail = await emailForName(request.supervisorCode || request.supervisorName);
  await createEnterpriseNotification(systemSession(request.createdBy), {
    kind: 'Workflow',
    module: 'Overtime Management',
    title: `Overtime rejected for ${request.projectCode}`,
    body: `${request.requestedHours}h overtime authorization was rejected.${reason ? ` Reason: ${reason}` : ''}`,
    severity: 'warning',
    href: `/hris/workforce-management/overtime-management?requestId=${encodeURIComponent(request.id)}`,
    recipientEmployeeCode: request.supervisorCode || undefined,
    recipientRoles: ['Supervisor'],
    channels: ['In-App', 'Email'],
    metadata: { requestId: request.id, projectCode: request.projectCode },
  });
  await sendOvertimeRejectedEmail({
    recipientName: request.supervisorName,
    recipientEmail: supervisorEmail,
    projectCode: request.projectCode,
    projectName: request.projectName,
    workDate: request.workDate,
    actorName: clean(actor) || request.currentOwnerName,
    reason: clean(reason) || undefined,
    workspaceLink,
    baseUrl,
  });
};

export type OvertimeAuthorizationTokenRow = {
  token: string;
  requestId: string;
  stage: ApprovalStage;
  decision: 'approve' | 'reject';
  recipientName: string;
  recipientEmail: string | null;
  usedAt: string | null;
  expiresAt: string;
};

export const readOvertimeAuthorizationToken = async (tokenValue: string): Promise<OvertimeAuthorizationTokenRow | null> => {
  const pool = await ensureDb();
  const result = await pool.request()
    .input('Token', sql.NVarChar(120), clean(tokenValue))
    .query<{ Token: string; RequestId: string; Stage: ApprovalStage; Decision: 'approve' | 'reject'; RecipientName: string; RecipientEmail: string | null; UsedAt: Date | null; ExpiresAt: Date }>(
      'SELECT [Token],[RequestId],[Stage],[Decision],[RecipientName],[RecipientEmail],[UsedAt],[ExpiresAt] FROM [hris].[OvertimeAuthorizationTokens] WHERE [Token]=@Token;',
    );
  const row = result.recordset[0];
  if (!row) return null;
  return {
    token: row.Token,
    requestId: row.RequestId,
    stage: row.Stage,
    decision: row.Decision,
    recipientName: row.RecipientName,
    recipientEmail: row.RecipientEmail,
    usedAt: row.UsedAt ? iso(row.UsedAt) : null,
    expiresAt: iso(row.ExpiresAt),
  };
};

export const markOvertimeAuthorizationTokenUsed = async (tokenValue: string) => {
  const pool = await ensureDb();
  await pool.request()
    .input('Token', sql.NVarChar(120), clean(tokenValue))
    .query('UPDATE [hris].[OvertimeAuthorizationTokens] SET [UsedAt]=SYSUTCDATETIME() WHERE [Token]=@Token;');
};

const notifySupervisorApproved = async (request: OvertimeAuthorizationRequest, baseUrl?: string | null) => {
  const href = `/hris/time-and-logs/timesheet-entry?date=${encodeURIComponent(request.workDate)}&supervisorId=${encodeURIComponent(`${request.supervisorCode} - ${request.supervisorName}`)}`;
  await createEnterpriseNotification(systemSession(request.createdBy), {
    kind: 'Workflow',
    module: 'Overtime Management',
    title: `Overtime approved for ${request.projectCode}`,
    body: `${request.requestedHours}h overtime is approved. The supervisor can book it on the timesheet.`,
    severity: 'success',
    href,
    recipientEmployeeCode: request.supervisorCode || undefined,
    recipientRoles: ['Supervisor'],
    channels: ['In-App', 'Email'],
    metadata: { requestId: request.id, projectCode: request.projectCode },
  });
  await sendOvertimeApprovedEmail({
    recipientName: request.supervisorName,
    recipientEmail: await emailForName(request.supervisorCode || request.supervisorName),
    projectCode: request.projectCode,
    workDate: request.workDate,
    requestedHours: request.requestedHours,
    timesheetLink: `${portalBase(baseUrl)}${href}`,
  });
};

export const listOvertimeAuthorizationRequests = async () => {
  const pool = await ensureDb();
  const [result, employeesResult] = await Promise.all([
    pool.request().query<DbAuthorizationRow>('SELECT * FROM [hris].[OvertimeAuthorizationRequests] ORDER BY [WorkDate] DESC, [CreatedAt] DESC'),
    pool.request().query<DbAuthorizationEmployeeRow>('SELECT * FROM [hris].[OvertimeAuthorizationEmployees] ORDER BY [EmployeeName]'),
  ]);
  const employeesByRequest = new Map<string, OvertimeAuthorizationEmployeeLine[]>();
  for (const row of employeesResult.recordset) {
    const list = employeesByRequest.get(row.RequestId) || [];
    list.push(mapEmployeeRow(row));
    employeesByRequest.set(row.RequestId, list);
  }
  return result.recordset.map((row) => mapRow(row, employeesByRequest.get(row.Id) || []));
};

export const createOvertimeAuthorizationRequest = async (input: OvertimeAuthorizationInput, actor?: string | null) => {
  const projectCode = clean(input.projectCode);
  if (!projectCode) throw new Error('Project code is required for overtime authorization.');
  if (!clean(input.workDate)) throw new Error('Overtime work date is required.');
  const employeeLines = (input.employees || [])
    .map((line) => ({
      employeeCode: clean(line.employeeCode),
      employeeName: clean(line.employeeName) || clean(line.employeeCode),
      jobTitle: clean(line.jobTitle),
      department: clean(line.department),
      overtimeHours: num(line.overtimeHours),
      dayType: clean(line.dayType) || clean(input.overtimeType) || 'Weekday',
    }))
    .filter((line) => line.employeeCode && line.overtimeHours > 0);
  const lineHoursTotal = round2(employeeLines.reduce((sum, line) => sum + line.overtimeHours, 0));
  const requestedHours = employeeLines.length ? lineHoursTotal : num(input.requestedHours);
  if (requestedHours <= 0) throw new Error('Requested overtime hours must be greater than zero. Book at least one employee.');
  const requestedHeadcount = employeeLines.length || Math.max(1, Math.round(num(input.requestedHeadcount) || 1));
  const projectManagerName = clean(input.projectManagerName) || 'Project Manager';
  const gmOperationsName = clean(input.gmOperationsName) || 'GM Operations';
  const hrApproverName = clean(input.hrApproverName) || 'HR Manager';
  const projectManagerEmail = clean(input.projectManagerEmail) || await emailForName(projectManagerName);
  const gmOperationsEmail = clean(input.gmOperationsEmail) || await emailForName(gmOperationsName);
  const hrApproverEmail = clean(input.hrApproverEmail) || await emailForName(hrApproverName);
  const id = `ota-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const pool = await ensureDb();
  await pool.request()
    .input('Id', sql.NVarChar(120), id)
    .input('ProjectCode', sql.NVarChar(80), projectCode)
    .input('ProjectName', sql.NVarChar(220), clean(input.projectName) || projectCode)
    .input('WorkDate', sql.Date, clean(input.workDate))
    .input('WorkCenter', sql.NVarChar(180), clean(input.workCenter) || 'Unassigned')
    .input('SupervisorCode', sql.NVarChar(80), clean(input.supervisorCode) || clean(input.supervisorName) || 'Unassigned')
    .input('SupervisorName', sql.NVarChar(220), clean(input.supervisorName) || clean(input.supervisorCode) || 'Unassigned')
    .input('RequestedHours', sql.Decimal(9, 2), requestedHours)
    .input('RequestedHeadcount', sql.Int, requestedHeadcount)
    .input('Reason', sql.NVarChar(700), clean(input.reason) || 'Production overtime requested.')
    .input('CurrentOwnerName', sql.NVarChar(220), projectManagerName)
    .input('ProjectManagerName', sql.NVarChar(220), projectManagerName)
    .input('ProjectManagerEmail', sql.NVarChar(320), projectManagerEmail || null)
    .input('MdApproverName', sql.NVarChar(220), hrApproverName)
    .input('MdApproverEmail', sql.NVarChar(320), hrApproverEmail || null)
    .input('GmOperationsName', sql.NVarChar(220), gmOperationsName)
    .input('GmOperationsEmail', sql.NVarChar(320), gmOperationsEmail || null)
    .input('HrApproverName', sql.NVarChar(220), hrApproverName)
    .input('HrApproverEmail', sql.NVarChar(320), hrApproverEmail || null)
    .input('CreatedBy', sql.NVarChar(220), clean(actor) || 'Supervisor')
    .query(`INSERT INTO [hris].[OvertimeAuthorizationRequests]
([Id],[ProjectCode],[ProjectName],[WorkDate],[WorkCenter],[SupervisorCode],[SupervisorName],[RequestedHours],[RequestedHeadcount],[Reason],[WorkflowStatus],[CurrentOwnerRole],[CurrentOwnerName],[ProjectManagerName],[ProjectManagerEmail],[MdApproverName],[MdApproverEmail],[GmOperationsName],[GmOperationsEmail],[HrApproverName],[HrApproverEmail],[CreatedBy])
VALUES (@Id,@ProjectCode,@ProjectName,@WorkDate,@WorkCenter,@SupervisorCode,@SupervisorName,@RequestedHours,@RequestedHeadcount,@Reason,'Submitted','Project Manager',@CurrentOwnerName,@ProjectManagerName,@ProjectManagerEmail,@MdApproverName,@MdApproverEmail,@GmOperationsName,@GmOperationsEmail,@HrApproverName,@HrApproverEmail,@CreatedBy);`);
  for (const line of employeeLines) {
    await pool.request()
      .input('Id', sql.NVarChar(120), `ota-emp-${Date.now()}-${Math.random().toString(16).slice(2)}`)
      .input('RequestId', sql.NVarChar(120), id)
      .input('EmployeeCode', sql.NVarChar(80), line.employeeCode)
      .input('EmployeeName', sql.NVarChar(220), line.employeeName)
      .input('JobTitle', sql.NVarChar(180), line.jobTitle || null)
      .input('Department', sql.NVarChar(180), line.department || null)
      .input('OvertimeHours', sql.Decimal(9, 2), line.overtimeHours)
      .input('DayType', sql.NVarChar(40), line.dayType)
      .query('INSERT INTO [hris].[OvertimeAuthorizationEmployees] ([Id],[RequestId],[EmployeeCode],[EmployeeName],[JobTitle],[Department],[OvertimeHours],[DayType]) VALUES (@Id,@RequestId,@EmployeeCode,@EmployeeName,@JobTitle,@Department,@OvertimeHours,@DayType);');
  }
  await writeAudit(id, clean(actor) || 'Supervisor', 'submit-authorization', null, 'Submitted', input.reason);
  const request = (await listOvertimeAuthorizationRequests()).find((item) => item.id === id)!;
  await notifyApprovalOwner(request, 'project-manager', input.portalBaseUrl);
  return request;
};

const OWNER_FOR_STATUS: Record<OvertimeAuthorizationStatus, { role: string; nameKey: keyof OvertimeAuthorizationRequest | null }> = {
  Submitted: { role: 'Project Manager', nameKey: 'projectManagerName' },
  'Project Manager Approved': { role: 'GM Operations', nameKey: 'gmOperationsName' },
  'GM Operations Approved': { role: 'HR Manager', nameKey: 'hrApproverName' },
  'HR Approved': { role: 'Supervisor', nameKey: 'supervisorName' },
  Rejected: { role: 'Closed', nameKey: null },
  Cancelled: { role: 'Closed', nameKey: null },
};

/** Push fully-approved (HR Approved) overtime hours onto the respective employees' timesheet. */
const postApprovedOvertimeToTimesheet = async (request: OvertimeAuthorizationRequest) => {
  try {
    const result = await postApprovedOvertimeToTimesheets({
      requestId: request.id,
      workDate: request.workDate,
      supervisorCode: request.supervisorCode,
      supervisorName: request.supervisorName,
      workCenter: request.workCenter,
      projectCode: request.projectCode,
      projectName: request.projectName,
      employees: request.employees.map((employee) => ({
        employeeCode: employee.employeeCode,
        employeeName: employee.employeeName,
        overtimeHours: employee.overtimeHours,
      })),
    });
    if (result.skipped.length) {
      console.warn(`Overtime authorization ${request.id}: ${result.posted} line(s) posted to timesheet, ${result.skipped.length} skipped.`, result.skipped);
    }
    if (result.posted > 0) {
      const period = String(request.workDate || '').slice(0, 7);
      void import('@/lib/payroll-timesheet-ot-posting')
        .then((module) => module.postPermanentTimesheetOvertimeToPayroll(period))
        .catch((error) => console.warn(`Overtime authorization ${request.id}: payroll OT posting skipped.`, error instanceof Error ? error.message : error));
    }
  } catch (error) {
    // Approval must not fail if timesheet posting is unavailable.
    console.error(`Overtime authorization ${request.id}: failed to post approved overtime to timesheet.`, error);
  }
};

export const actOnOvertimeAuthorizationRequest = async (id: string, decision: 'approve' | 'reject', actor?: string | null, comment?: string | null, baseUrl?: string | null) => {
  const request = (await listOvertimeAuthorizationRequests()).find((item) => item.id === id);
  if (!request) throw new Error('Overtime authorization request was not found.');
  if (['Rejected', 'Cancelled', 'HR Approved'].includes(request.status)) throw new Error(`Request is already ${request.status}.`);
  const oldStatus = request.status;
  const actorText = clean(actor).toLowerCase();
  const isSuperAdministrator = actorText.includes('super administrator') || actorText.includes('global super');
  const advance = (status: OvertimeAuthorizationStatus): OvertimeAuthorizationStatus => {
    if (status === 'Submitted') return 'Project Manager Approved';
    if (status === 'Project Manager Approved') return 'GM Operations Approved';
    return 'HR Approved';
  };
  const nextStatus: OvertimeAuthorizationStatus = decision === 'reject'
    ? 'Rejected'
    : isSuperAdministrator
      ? 'HR Approved'
      : advance(oldStatus);
  const owner = OWNER_FOR_STATUS[nextStatus];
  const ownerName = owner.nameKey ? String(request[owner.nameKey] || owner.role) : 'Closed';
  const pool = await ensureDb();
  await pool.request()
    .input('Id', sql.NVarChar(120), id)
    .input('WorkflowStatus', sql.NVarChar(60), nextStatus)
    .input('CurrentOwnerRole', sql.NVarChar(80), owner.role)
    .input('CurrentOwnerName', sql.NVarChar(220), ownerName)
    .query('UPDATE [hris].[OvertimeAuthorizationRequests] SET [WorkflowStatus]=@WorkflowStatus,[CurrentOwnerRole]=@CurrentOwnerRole,[CurrentOwnerName]=@CurrentOwnerName,[UpdatedAt]=SYSUTCDATETIME() WHERE [Id]=@Id;');
  await writeAudit(id, clean(actor) || request.currentOwnerName, isSuperAdministrator && decision === 'approve' ? 'super-admin-approve-all' : decision, oldStatus, nextStatus, comment);
  const updated = (await listOvertimeAuthorizationRequests()).find((item) => item.id === id)!;
  if (nextStatus === 'Project Manager Approved') await notifyApprovalOwner(updated, 'gm-operations', baseUrl);
  if (nextStatus === 'GM Operations Approved') await notifyApprovalOwner(updated, 'hr', baseUrl);
  if (nextStatus === 'HR Approved') {
    await notifySupervisorApproved(updated, baseUrl);
    await postApprovedOvertimeToTimesheet(updated);
  }
  if (nextStatus === 'Rejected') {
    await notifySupervisorRejected(updated, actor, comment, baseUrl);
  }
  return updated;
};

export const bulkActOnOvertimeAuthorizationRequests = async (
  ids: string[],
  decision: 'approve' | 'reject',
  actor?: string | null,
  comment?: string | null,
  baseUrl?: string | null,
) => {
  const results: Array<{ id: string; ok: boolean; error?: string }> = [];
  for (const id of ids) {
    try {
      await actOnOvertimeAuthorizationRequest(id, decision, actor, comment, baseUrl);
      results.push({ id, ok: true });
    } catch (error) {
      results.push({ id, ok: false, error: error instanceof Error ? error.message : 'Failed' });
    }
  }
  return results;
};

export const actOnOvertimeAuthorizationToken = async (tokenValue: string, baseUrl?: string | null) => {
  const tokenRow = await readOvertimeAuthorizationToken(tokenValue);
  if (!tokenRow) throw new Error('Approval link is invalid.');
  if (tokenRow.usedAt) throw new Error('Approval link has already been used.');
  if (new Date(tokenRow.expiresAt).getTime() < Date.now()) throw new Error('Approval link has expired.');
  const updated = await actOnOvertimeAuthorizationRequest(tokenRow.requestId, tokenRow.decision, tokenRow.recipientName, 'Email action link', baseUrl);
  await markOvertimeAuthorizationTokenUsed(tokenValue);
  return updated;
};

export const listApprovedOvertimeForSupervisor = async (
  date: string,
  supervisorValue?: string | null,
  workCenter?: string | null,
) => {
  const code = clean(supervisorValue).split(' - ')[0].toLowerCase();
  const center = clean(workCenter).toLowerCase();
  const statuses = approvedOvertimeStatuses();
  const rows = await listOvertimeAuthorizationRequests();
  return rows.filter((item) =>
    statuses.includes(item.status) &&
    item.workDate === dateOnly(date) &&
    (!code || item.supervisorCode.toLowerCase() === code || item.supervisorName.toLowerCase().includes(code)) &&
    (!center || !clean(item.workCenter) || clean(item.workCenter).toLowerCase() === center || clean(item.workCenter).toLowerCase().includes(center)),
  );
};
