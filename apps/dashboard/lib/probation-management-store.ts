import sql from 'mssql';
import { dleEnterpriseLastPoolError, getDleEnterpriseDbPool } from '@/lib/dle-enterprise-db';

const text = (value: unknown) => String(value ?? '').trim();
const dateOnly = (value: unknown) => {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`;
  }
  const raw = text(value);
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : '';
};
const addMonths = (iso: string, months: number) => {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + months, day));
  return date.toISOString().slice(0, 10);
};
const daysBetween = (iso: string) => {
  if (!iso) return 0;
  const end = new Date(`${iso}T00:00:00Z`).getTime();
  return Math.ceil((end - Date.now()) / 86400000);
};
const newId = () => `prob-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export type ProbationSettings = {
  probationMonths: number;
  triggerMonth: number;
  extensionMonths: number;
  supervisorSlaDays: number;
  reminderDay: number;
  escalationDay: number;
  autoInitiate: boolean;
  skipDuplicateHod: boolean;
};

let ensured = false;

const pool = async () => {
  const connection = await getDleEnterpriseDbPool();
  if (!connection) {
    throw new Error(dleEnterpriseLastPoolError() || 'DLE Enterprise database is not configured.');
  }
  if (!ensured) {
    await connection.request().query(`
IF SCHEMA_ID(N'hris') IS NULL EXEC(N'CREATE SCHEMA [hris]');
IF OBJECT_ID(N'[hris].[ProbationSettings]', N'U') IS NULL
CREATE TABLE [hris].[ProbationSettings] (
  [Id] INT NOT NULL CONSTRAINT [PK_ProbationSettings] PRIMARY KEY,
  [ProbationMonths] INT NOT NULL,
  [TriggerMonth] INT NOT NULL,
  [ExtensionMonths] INT NOT NULL,
  [SupervisorSlaDays] INT NOT NULL,
  [ReminderDay] INT NOT NULL,
  [EscalationDay] INT NOT NULL,
  [AutoInitiate] BIT NOT NULL,
  [SkipDuplicateHod] BIT NOT NULL,
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ProbationSettings_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedBy] NVARCHAR(120) NULL
);
IF NOT EXISTS (SELECT 1 FROM [hris].[ProbationSettings] WHERE [Id] = 1)
INSERT INTO [hris].[ProbationSettings] ([Id],[ProbationMonths],[TriggerMonth],[ExtensionMonths],[SupervisorSlaDays],[ReminderDay],[EscalationDay],[AutoInitiate],[SkipDuplicateHod],[UpdatedBy])
VALUES (1, 6, 5, 3, 5, 3, 5, 1, 1, N'System');
IF OBJECT_ID(N'[hris].[ProbationCases]', N'U') IS NULL
CREATE TABLE [hris].[ProbationCases] (
  [Id] NVARCHAR(40) NOT NULL CONSTRAINT [PK_ProbationCases] PRIMARY KEY,
  [EmployeeCode] NVARCHAR(80) NOT NULL,
  [EmployeeName] NVARCHAR(220) NOT NULL,
  [JobTitle] NVARCHAR(180) NULL,
  [Department] NVARCHAR(180) NULL,
  [SupervisorName] NVARCHAR(180) NULL,
  [HodName] NVARCHAR(180) NULL,
  [AppointmentDate] DATE NULL,
  [ProbationStart] DATE NOT NULL,
  [ProbationEnd] DATE NOT NULL,
  [EvaluationTrigger] DATE NOT NULL,
  [CycleNo] INT NOT NULL,
  [Stage] NVARCHAR(40) NOT NULL,
  [Recommendation] NVARCHAR(80) NULL,
  [EvaluationJson] NVARCHAR(MAX) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ProbationCases_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ProbationCases_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedBy] NVARCHAR(120) NULL
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_ProbationCases_EmployeeCycle')
CREATE UNIQUE INDEX [UX_ProbationCases_EmployeeCycle] ON [hris].[ProbationCases]([EmployeeCode], [CycleNo]);
IF OBJECT_ID(N'[hris].[ProbationEvents]', N'U') IS NULL
CREATE TABLE [hris].[ProbationEvents] (
  [Id] BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT [PK_ProbationEvents] PRIMARY KEY,
  [CaseId] NVARCHAR(40) NOT NULL,
  [Action] NVARCHAR(80) NOT NULL,
  [FromStage] NVARCHAR(40) NULL,
  [ToStage] NVARCHAR(40) NULL,
  [Actor] NVARCHAR(120) NOT NULL,
  [Comment] NVARCHAR(1000) NULL,
  [ActedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ProbationEvents_ActedAt] DEFAULT SYSUTCDATETIME()
);
`);
    ensured = true;
  }
  return connection;
};

const readSettings = async (connection: sql.ConnectionPool): Promise<ProbationSettings> => {
  const result = await connection.request().query(`SELECT TOP 1 * FROM [hris].[ProbationSettings] WHERE [Id] = 1`);
  const row = result.recordset?.[0] || {};
  return {
    probationMonths: Number(row.ProbationMonths || 6),
    triggerMonth: Number(row.TriggerMonth || 5),
    extensionMonths: Number(row.ExtensionMonths || 3),
    supervisorSlaDays: Number(row.SupervisorSlaDays || 5),
    reminderDay: Number(row.ReminderDay || 3),
    escalationDay: Number(row.EscalationDay || 5),
    autoInitiate: Boolean(row.AutoInitiate ?? true),
    skipDuplicateHod: Boolean(row.SkipDuplicateHod ?? true),
  };
};

const syncCases = async (connection: sql.ConnectionPool, settings: ProbationSettings) => {
  const employees = await connection.request().query(`
    SELECT v.employee_code, v.full_name, ISNULL(v.job_title, N'') AS job_title, ISNULL(v.department, N'') AS department,
      ISNULL(v.reporting_manager, N'') AS reporting_manager, ISNULL(j.department_head, N'') AS department_head,
      v.date_joined, emp.probation_start_date, emp.probation_end_date, ISNULL(v.employment_status, N'') AS employment_status
    FROM [hris].[EmployeeMasterView] v
    LEFT JOIN [hris].[EmployeeJobInfo] j ON j.employee_id = v.employee_id
    LEFT JOIN [hris].[EmployeeEmploymentInfo] emp ON emp.employee_id = v.employee_id
    WHERE ISNULL(v.employment_status, N'') NOT LIKE N'%terminated%'
      AND ISNULL(v.employment_status, N'') NOT LIKE N'%inactive%'
      AND (
        ISNULL(v.employment_status, N'') LIKE N'%probation%'
        OR emp.probation_end_date >= CAST(SYSUTCDATETIME() AS DATE)
        OR (emp.probation_start_date IS NOT NULL AND emp.probation_end_date IS NULL)
      )
  `);
  for (const row of employees.recordset || []) {
    const start = dateOnly(row.probation_start_date) || dateOnly(row.date_joined);
    if (!start) continue;
    const end = dateOnly(row.probation_end_date) || addMonths(start, settings.probationMonths);
    const trigger = addMonths(start, settings.triggerMonth);
    const existing = await connection.request().input('Code', sql.NVarChar(80), text(row.employee_code)).query(`SELECT TOP 1 [Id] FROM [hris].[ProbationCases] WHERE [EmployeeCode] = @Code`);
    if (existing.recordset?.[0]) {
      await connection.request()
        .input('Code', sql.NVarChar(80), text(row.employee_code))
        .input('Supervisor', sql.NVarChar(180), text(row.reporting_manager))
        .input('Hod', sql.NVarChar(180), text(row.department_head))
        .query(`UPDATE [hris].[ProbationCases] SET [SupervisorName] = @Supervisor, [HodName] = @Hod, [UpdatedAt] = SYSUTCDATETIME() WHERE [EmployeeCode] = @Code AND [Stage] NOT IN (N'Confirmed', N'Termination Review')`);
      continue;
    }
    const today = new Date().toISOString().slice(0, 10);
    const stage = today >= trigger ? 'Supervisor Evaluation' : 'Active';
    await connection.request()
      .input('Id', sql.NVarChar(40), newId())
      .input('Code', sql.NVarChar(80), text(row.employee_code))
      .input('Name', sql.NVarChar(220), text(row.full_name))
      .input('Title', sql.NVarChar(180), text(row.job_title))
      .input('Department', sql.NVarChar(180), text(row.department))
      .input('Supervisor', sql.NVarChar(180), text(row.reporting_manager))
      .input('Hod', sql.NVarChar(180), text(row.department_head))
      .input('Appointed', sql.Date, dateOnly(row.date_joined) || start)
      .input('Start', sql.Date, start)
      .input('End', sql.Date, end)
      .input('Trigger', sql.Date, trigger)
      .input('Stage', sql.NVarChar(40), stage)
      .query(`
        INSERT INTO [hris].[ProbationCases] ([Id],[EmployeeCode],[EmployeeName],[JobTitle],[Department],[SupervisorName],[HodName],[AppointmentDate],[ProbationStart],[ProbationEnd],[EvaluationTrigger],[CycleNo],[Stage])
        VALUES (@Id,@Code,@Name,@Title,@Department,@Supervisor,@Hod,@Appointed,@Start,@End,@Trigger,1,@Stage)
      `);
  }
};

const mapCase = (row: Record<string, unknown>) => {
  const end = dateOnly(row.ProbationEnd);
  const start = dateOnly(row.ProbationStart);
  const name = text(row.EmployeeName);
  const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase();
  return {
    id: text(row.Id),
    employeeCode: text(row.EmployeeCode),
    name,
    initials,
    jobTitle: text(row.JobTitle),
    department: text(row.Department),
    supervisor: text(row.SupervisorName),
    hod: text(row.HodName),
    appointmentDate: dateOnly(row.AppointmentDate),
    probationStart: start,
    evaluationTrigger: dateOnly(row.EvaluationTrigger),
    probationEnd: end,
    daysRemaining: daysBetween(end),
    stage: text(row.Stage),
    recommendation: text(row.Recommendation),
    progress: start && end ? Math.max(0, Math.min(100, Math.round(((Date.now() - new Date(`${start}T00:00:00Z`).getTime()) / (new Date(`${end}T00:00:00Z`).getTime() - new Date(`${start}T00:00:00Z`).getTime())) * 100))) : 0,
    cycleNo: Number(row.CycleNo || 1),
    evaluation: text(row.EvaluationJson) ? JSON.parse(text(row.EvaluationJson)) : null,
  };
};

export const readProbationWorkspace = async () => {
  const connection = await pool();
  const settings = await readSettings(connection);
  if (settings.autoInitiate) await syncCases(connection, settings);
  const cases = await connection.request().query(`SELECT * FROM [hris].[ProbationCases] ORDER BY [ProbationEnd], [EmployeeName]`);
  const events = await connection.request().query(`SELECT TOP 200 * FROM [hris].[ProbationEvents] ORDER BY [ActedAt] DESC`);
  return {
    settings,
    employees: (cases.recordset || []).map(mapCase),
    events: (events.recordset || []).map((row) => ({
      id: text(row.Id),
      caseId: text(row.CaseId),
      action: text(row.Action),
      fromStage: text(row.FromStage),
      toStage: text(row.ToStage),
      actor: text(row.Actor),
      comment: text(row.Comment),
      at: row.ActedAt ? new Date(String(row.ActedAt)).toISOString() : '',
    })),
  };
};

export const saveProbationSettings = async (settings: ProbationSettings, actor: string) => {
  const connection = await pool();
  await connection.request()
    .input('ProbationMonths', sql.Int, settings.probationMonths)
    .input('TriggerMonth', sql.Int, settings.triggerMonth)
    .input('ExtensionMonths', sql.Int, settings.extensionMonths)
    .input('SupervisorSlaDays', sql.Int, settings.supervisorSlaDays)
    .input('ReminderDay', sql.Int, settings.reminderDay)
    .input('EscalationDay', sql.Int, settings.escalationDay)
    .input('AutoInitiate', sql.Bit, settings.autoInitiate ? 1 : 0)
    .input('SkipDuplicateHod', sql.Bit, settings.skipDuplicateHod ? 1 : 0)
    .input('Actor', sql.NVarChar(120), actor)
    .query(`
      UPDATE [hris].[ProbationSettings]
      SET [ProbationMonths]=@ProbationMonths,[TriggerMonth]=@TriggerMonth,[ExtensionMonths]=@ExtensionMonths,
          [SupervisorSlaDays]=@SupervisorSlaDays,[ReminderDay]=@ReminderDay,[EscalationDay]=@EscalationDay,
          [AutoInitiate]=@AutoInitiate,[SkipDuplicateHod]=@SkipDuplicateHod,[UpdatedAt]=SYSUTCDATETIME(),[UpdatedBy]=@Actor
      WHERE [Id]=1
    `);
};

export const submitProbationEvaluation = async (input: { caseId: string; evaluation: unknown; recommendation: string; actor: string }) => {
  const connection = await pool();
  const current = await connection.request().input('Id', sql.NVarChar(40), input.caseId).query(`SELECT [Stage],[SupervisorName],[HodName] FROM [hris].[ProbationCases] WHERE [Id]=@Id`);
  const row = current.recordset?.[0];
  if (!row) throw new Error('Probation record was not found.');
  const settings = await readSettings(connection);
  const samePerson = text(row.SupervisorName) && text(row.SupervisorName) === text(row.HodName);
  const next = settings.skipDuplicateHod && samePerson ? 'HR Review' : 'HOD Approval';
  await connection.request()
    .input('Id', sql.NVarChar(40), input.caseId)
    .input('Stage', sql.NVarChar(40), next)
    .input('Recommendation', sql.NVarChar(80), text(input.recommendation))
    .input('Evaluation', sql.NVarChar(sql.MAX), JSON.stringify(input.evaluation || {}))
    .input('Actor', sql.NVarChar(120), input.actor)
    .query(`UPDATE [hris].[ProbationCases] SET [Stage]=@Stage,[Recommendation]=@Recommendation,[EvaluationJson]=@Evaluation,[UpdatedAt]=SYSUTCDATETIME(),[UpdatedBy]=@Actor WHERE [Id]=@Id`);
  await connection.request()
    .input('CaseId', sql.NVarChar(40), input.caseId)
    .input('FromStage', sql.NVarChar(40), text(row.Stage))
    .input('ToStage', sql.NVarChar(40), next)
    .input('Actor', sql.NVarChar(120), input.actor)
    .input('Comment', sql.NVarChar(1000), text(input.recommendation))
    .query(`INSERT INTO [hris].[ProbationEvents] ([CaseId],[Action],[FromStage],[ToStage],[Actor],[Comment]) VALUES (@CaseId,N'Evaluation submitted',@FromStage,@ToStage,@Actor,@Comment)`);
};

export const advanceProbationCase = async (input: { caseId: string; action: 'approve' | 'return' | 'remind' | 'confirm' | 'extend' | 'terminate'; comment: string; actor: string }) => {
  const connection = await pool();
  const current = await connection.request().input('Id', sql.NVarChar(40), input.caseId).query(`SELECT * FROM [hris].[ProbationCases] WHERE [Id]=@Id`);
  const row = current.recordset?.[0];
  if (!row) throw new Error('Probation record was not found.');
  const stage = text(row.Stage);
  let next = stage;
  if (input.action === 'approve') next = stage === 'HOD Approval' ? 'HR Review' : stage === 'HR Review' ? 'Confirmed' : stage;
  if (input.action === 'return') next = 'Supervisor Evaluation';
  if (input.action === 'confirm') next = 'Confirmed';
  if (input.action === 'terminate') next = 'Termination Review';
  if (input.action === 'extend') {
    const settings = await readSettings(connection);
    const start = dateOnly(row.ProbationEnd);
    const end = addMonths(start, settings.extensionMonths);
    await connection.request()
      .input('Id', sql.NVarChar(40), newId())
      .input('Code', sql.NVarChar(80), text(row.EmployeeCode))
      .input('Name', sql.NVarChar(220), text(row.EmployeeName))
      .input('Title', sql.NVarChar(180), text(row.JobTitle))
      .input('Department', sql.NVarChar(180), text(row.Department))
      .input('Supervisor', sql.NVarChar(180), text(row.SupervisorName))
      .input('Hod', sql.NVarChar(180), text(row.HodName))
      .input('Start', sql.Date, start)
      .input('End', sql.Date, end)
      .input('Trigger', sql.Date, addMonths(start, Math.max(1, settings.triggerMonth - settings.probationMonths + settings.extensionMonths)))
      .input('Cycle', sql.Int, Number(row.CycleNo || 1) + 1)
      .query(`
        INSERT INTO [hris].[ProbationCases] ([Id],[EmployeeCode],[EmployeeName],[JobTitle],[Department],[SupervisorName],[HodName],[AppointmentDate],[ProbationStart],[ProbationEnd],[EvaluationTrigger],[CycleNo],[Stage])
        VALUES (@Id,@Code,@Name,@Title,@Department,@Supervisor,@Hod,@Start,@Start,@End,@Trigger,@Cycle,N'Extended')
      `);
    next = 'Extended';
  }
  if (input.action !== 'remind') {
    await connection.request().input('Id', sql.NVarChar(40), input.caseId).input('Stage', sql.NVarChar(40), next).input('Actor', sql.NVarChar(120), input.actor)
      .query(`UPDATE [hris].[ProbationCases] SET [Stage]=@Stage,[UpdatedAt]=SYSUTCDATETIME(),[UpdatedBy]=@Actor WHERE [Id]=@Id`);
  }
  await connection.request()
    .input('CaseId', sql.NVarChar(40), input.caseId)
    .input('Action', sql.NVarChar(80), input.action)
    .input('FromStage', sql.NVarChar(40), stage)
    .input('ToStage', sql.NVarChar(40), next)
    .input('Actor', sql.NVarChar(120), input.actor)
    .input('Comment', sql.NVarChar(1000), text(input.comment))
    .query(`INSERT INTO [hris].[ProbationEvents] ([CaseId],[Action],[FromStage],[ToStage],[Actor],[Comment]) VALUES (@CaseId,@Action,@FromStage,@ToStage,@Actor,@Comment)`);
};
