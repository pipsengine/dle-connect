import sql from 'mssql';
import { getDleEnterpriseDbPool, type DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import { payrollDataSourceInfo, readPayrollEmployees } from '@/lib/payroll-employee-source';
import { calculatePayrollOvertime, type OvertimeDayType } from '@/lib/payroll-earnings-engine';
import {
  isTimesheetPayrollReadyStatus,
  normalizePaidWorkHours,
  readTimesheetData,
  readProjects,
  readTimesheetWorkCenters,
  STANDARD_TIMESHEET_HOURS,
  type TimesheetHeader,
  type TimesheetLine,
} from '@/lib/timesheet-entry-store';
import { normalizePayrollMatchKey } from '@/lib/sage-people-payroll-store';
import { readSupervisorAssignments } from '@/lib/supervisor-assignment-store';

export type OvertimeRole =
  | 'Employee'
  | 'Supervisor'
  | 'HR Officer'
  | 'HR Manager'
  | 'Payroll Officer'
  | 'Payroll Manager'
  | 'Finance Controller'
  | 'Executive Management'
  | 'Administrator'
  | 'Super Administrator';

export type OvertimeStatus =
  | 'Draft'
  | 'Submitted'
  | 'Supervisor Approved'
  | 'HR Approved'
  | 'Payroll Ready'
  | 'Payroll Posted'
  | 'Returned'
  | 'Rejected'
  | 'Blocked';

export type OvertimeAction = 'submit' | 'approve-supervisor' | 'approve-hr' | 'mark-payroll-ready' | 'post-payroll' | 'return' | 'reject' | 'reopen';

export type OvertimeCreateRequest = {
  employeeId: string;
  date: string;
  dayType?: OvertimeDayType;
  workedHours: number;
  payableHours?: number;
  reason?: string | null;
  projectCode?: string | null;
};

export type OvertimeAuthorizationOption = {
  id: string;
  code: string;
  name: string;
  email?: string | null;
  jobTitle?: string;
  department?: string;
};

export type OvertimeSupervisorEmployee = {
  code: string;
  name: string;
  jobTitle: string;
  department: string;
};

export type OvertimeSupervisorOption = OvertimeAuthorizationOption & {
  employees: OvertimeSupervisorEmployee[];
};

export type OvertimeAuthorizationSetup = {
  projects: Array<OvertimeAuthorizationOption & { projectManager: string; projectManagerEmail?: string | null }>;
  workCenters: Array<OvertimeAuthorizationOption & { location?: string | null; site?: string | null }>;
  supervisors: OvertimeSupervisorOption[];
  mdApprover: OvertimeAuthorizationOption | null;
  gmOperations: OvertimeAuthorizationOption | null;
  hrApprover: OvertimeAuthorizationOption | null;
};

export type OvertimeAuditEntry = {
  id: string;
  at: string;
  actor: string;
  role: OvertimeRole;
  action: string;
  oldStatus: OvertimeStatus | null;
  newStatus: OvertimeStatus;
  comment: string | null;
};

export type OvertimeWorkflowStep = {
  stage: 'Employee' | 'Supervisor' | 'HR' | 'Payroll';
  status: 'Pending' | 'Completed' | 'Returned' | 'Rejected' | 'Blocked';
  owner: string;
  actedAt: string | null;
};

export type OvertimeRecord = {
  id: string;
  sourceLineId: string;
  headerId: string;
  periodId: string;
  date: string;
  employeeId: string;
  employeeName: string;
  department: string;
  jobTitle: string;
  location: string;
  supervisor: string;
  workCenter: string;
  employmentType: string;
  salaryGrade: string;
  dayType: OvertimeDayType;
  workedHours: number;
  standardHours: number;
  overtimeHours: number;
  payableHours: number;
  multiplier: number;
  hourlyRate: number;
  grossPay: number;
  earningCode: string;
  earningName: string;
  timesheetStatus: string;
  payrollReady: boolean;
  status: OvertimeStatus;
  currentOwner: string;
  severity: 'Low' | 'Medium' | 'High';
  issues: string[];
  projectCodes: string[];
  lastActionAt: string | null;
  createdAt: string;
  updatedAt: string;
  workflow: OvertimeWorkflowStep[];
  auditTrail: OvertimeAuditEntry[];
};

type DbOvertimeRow = {
  Id: string;
  SourceLineId: string;
  HeaderId: string;
  PeriodId: string;
  WorkDate: Date | string;
  EmployeeId: string;
  EmployeeName: string;
  Department: string;
  JobTitle: string;
  Location: string;
  Supervisor: string;
  WorkCenter: string;
  EmploymentType: string;
  SalaryGrade: string;
  DayType: OvertimeDayType;
  WorkedHours: number;
  StandardHours: number;
  OvertimeHours: number;
  PayableHours: number;
  Multiplier: number;
  HourlyRate: number;
  GrossPay: number;
  EarningCode: string;
  EarningName: string;
  TimesheetStatus: string;
  PayrollReady: boolean;
  WorkflowStatus: OvertimeStatus;
  CurrentOwner: string;
  Severity: 'Low' | 'Medium' | 'High';
  IssuesJson: string;
  ProjectCodesJson: string;
  LastActionAt: Date | string | null;
  CreatedAt: Date | string;
  UpdatedAt: Date | string;
};

type DbAuditRow = {
  Id: string;
  OvertimeId: string;
  Actor: string;
  ActorRole: OvertimeRole;
  ActionName: string;
  OldStatus: OvertimeStatus | null;
  NewStatus: OvertimeStatus;
  Comment: string | null;
  CreatedAt: Date | string;
};

const dbReady = { value: false };
const allRoles: OvertimeRole[] = ['Employee', 'Supervisor', 'HR Officer', 'HR Manager', 'Payroll Officer', 'Payroll Manager', 'Finance Controller', 'Executive Management', 'Administrator', 'Super Administrator'];
const round2 = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
const clean = (value: unknown) => String(value || '').trim();
const toDateOnly = (value: Date | string) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
const toIso = (value: Date | string | null | undefined) => value ? new Date(value).toISOString() : null;
const jsonArray = (value: string | null | undefined) => {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
};

export const normalizeOvertimeRole = (role?: string | null): OvertimeRole =>
  allRoles.find((item) => item.toLowerCase() === String(role || '').toLowerCase()) || 'HR Manager';

const dayTypeFor = (date: string): OvertimeDayType => {
  const day = new Date(`${date}T00:00:00`).getDay();
  if (day === 6) return 'Saturday';
  if (day === 0) return 'Sunday';
  return 'Weekday';
};

const employeeKeys = (employee: DleEmployeeDirectoryRow) => [employee.employeeId, employee.employeeCode, employee.fullName, employee.sourceEmployeeId].map(normalizePayrollMatchKey).filter(Boolean);
const lineKeys = (line: TimesheetLine) => [line.employeeId, line.employeeNo, line.employeeName].map(normalizePayrollMatchKey).filter(Boolean);
const employeeEmail = (employee?: DleEmployeeDirectoryRow | null) => clean(employee?.officialEmail) || clean(employee?.email) || clean(employee?.personalEmail) || null;
const employeeOption = (employee: DleEmployeeDirectoryRow): OvertimeAuthorizationOption => ({
  id: clean(employee.employeeCode) || clean(employee.employeeId),
  code: clean(employee.employeeCode) || clean(employee.employeeId),
  name: clean(employee.fullName) || clean(employee.employeeCode) || clean(employee.employeeId),
  email: employeeEmail(employee),
  jobTitle: clean(employee.jobTitle),
  department: clean(employee.department),
});

const findEmployeeByText = (employees: DleEmployeeDirectoryRow[], value: string) => {
  const target = clean(value).toLowerCase();
  if (!target) return null;
  return employees.find((employee) => [employee.employeeCode, employee.employeeId, employee.fullName, employee.officialEmail, employee.email].some((field) => {
    const current = clean(field).toLowerCase();
    return current && (current === target || current.includes(target) || target.includes(current));
  })) || null;
};

const resolveMdApprover = (employees: DleEmployeeDirectoryRow[]) => {
  const active = employees.filter((employee) => !['Resigned', 'Terminated', 'Retired', 'Inactive'].includes(clean(employee.status)));
  const configuredCode = clean(process.env.HRIS_MD_EMPLOYEE_CODE).toLowerCase();
  if (configuredCode) {
    const configured = active.find((employee) => [employee.employeeCode, employee.employeeId].map((value) => clean(value).toLowerCase()).includes(configuredCode));
    if (configured) return configured;
  }
  const supportRole = (employee: DleEmployeeDirectoryRow) => /\b(driver|assistant|asst|pa\.?|p\.a|secretary|aide)\b/i.test(`${employee.jobTitle} ${employee.designation}`);
  const score = (employee: DleEmployeeDirectoryRow) => {
    if (supportRole(employee)) return -100;
    const title = `${employee.jobTitle} ${employee.designation}`.toLowerCase();
    if (/\bmanaging director\b/.test(title)) return 100;
    if (/\bmd\/ceo\b|\bchief executive\b|\bceo\b/.test(title)) return 90;
    if (/\bgroup managing director\b/.test(title)) return 85;
    return 0;
  };
  return active
    .map((employee) => ({ employee, score: score(employee) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || clean(a.employee.employeeCode).localeCompare(clean(b.employee.employeeCode)))[0]?.employee || null;
};

const resolveByTitle = (
  employees: DleEmployeeDirectoryRow[],
  envCode: string | undefined,
  scorer: (title: string) => number,
) => {
  const active = employees.filter((employee) => !['Resigned', 'Terminated', 'Retired', 'Inactive'].includes(clean(employee.status)));
  const configuredCode = clean(envCode).toLowerCase();
  if (configuredCode) {
    const configured = active.find((employee) => [employee.employeeCode, employee.employeeId].map((value) => clean(value).toLowerCase()).includes(configuredCode));
    if (configured) return configured;
  }
  return active
    .map((employee) => ({ employee, score: scorer(`${employee.jobTitle} ${employee.designation}`.toLowerCase()) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || clean(a.employee.employeeCode).localeCompare(clean(b.employee.employeeCode)))[0]?.employee || null;
};

const resolveGmOperations = (employees: DleEmployeeDirectoryRow[]) =>
  resolveByTitle(employees, process.env.HRIS_GM_OPERATIONS_EMPLOYEE_CODE, (title) => {
    if (/\bgm\b.*operation|general manager.*operation|\bgmo\b/.test(title)) return 100;
    if (/head.*operation|operations? manager|director.*operation/.test(title)) return 80;
    if (/\boperations?\b/.test(title) && /manager|head|lead|director/.test(title)) return 60;
    return 0;
  });

const resolveHrApprover = (employees: DleEmployeeDirectoryRow[]) =>
  resolveByTitle(employees, process.env.HRIS_HR_MANAGER_EMPLOYEE_CODE, (title) => {
    if (/head.*human resource|group.*hr|chief.*people/.test(title)) return 100;
    if (/hr manager|human resources? manager/.test(title)) return 90;
    if (/\bhr\b.*(manager|head|lead|officer|business partner)/.test(title)) return 70;
    if (/human resource/.test(title)) return 50;
    return 0;
  });

const ensureDb = async () => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new Error('DLE Enterprise database is not configured. Overtime management requires HRIS database persistence.');
  if (!dbReady.value) {
    await pool.request().query(`
IF SCHEMA_ID(N'hris') IS NULL EXEC(N'CREATE SCHEMA [hris]');
IF OBJECT_ID(N'[hris].[OvertimeManagementRecords]', N'U') IS NULL
CREATE TABLE [hris].[OvertimeManagementRecords] (
  [Id] NVARCHAR(220) NOT NULL CONSTRAINT [PK_OvertimeManagementRecords] PRIMARY KEY,
  [SourceLineId] NVARCHAR(220) NOT NULL,
  [HeaderId] NVARCHAR(160) NOT NULL,
  [PeriodId] NVARCHAR(60) NOT NULL,
  [WorkDate] DATE NOT NULL,
  [EmployeeId] NVARCHAR(80) NOT NULL,
  [EmployeeName] NVARCHAR(220) NOT NULL,
  [Department] NVARCHAR(180) NOT NULL,
  [JobTitle] NVARCHAR(180) NOT NULL,
  [Location] NVARCHAR(180) NOT NULL,
  [Supervisor] NVARCHAR(180) NOT NULL,
  [WorkCenter] NVARCHAR(180) NOT NULL,
  [EmploymentType] NVARCHAR(120) NOT NULL,
  [SalaryGrade] NVARCHAR(120) NOT NULL,
  [DayType] NVARCHAR(40) NOT NULL,
  [WorkedHours] DECIMAL(9,2) NOT NULL,
  [StandardHours] DECIMAL(9,2) NOT NULL,
  [OvertimeHours] DECIMAL(9,2) NOT NULL,
  [PayableHours] DECIMAL(9,2) NOT NULL,
  [Multiplier] DECIMAL(9,2) NOT NULL,
  [HourlyRate] DECIMAL(19,2) NOT NULL,
  [GrossPay] DECIMAL(19,2) NOT NULL,
  [EarningCode] NVARCHAR(80) NOT NULL,
  [EarningName] NVARCHAR(180) NOT NULL,
  [TimesheetStatus] NVARCHAR(60) NOT NULL,
  [PayrollReady] BIT NOT NULL,
  [WorkflowStatus] NVARCHAR(60) NOT NULL,
  [CurrentOwner] NVARCHAR(120) NOT NULL,
  [Severity] NVARCHAR(20) NOT NULL,
  [IssuesJson] NVARCHAR(MAX) NOT NULL,
  [ProjectCodesJson] NVARCHAR(MAX) NOT NULL,
  [LastActionAt] DATETIME2 NULL,
  [CreatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_OvertimeManagementRecords_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_OvertimeManagementRecords_UpdatedAt] DEFAULT SYSUTCDATETIME()
);
IF OBJECT_ID(N'[hris].[OvertimeManagementAudit]', N'U') IS NULL
CREATE TABLE [hris].[OvertimeManagementAudit] (
  [Id] NVARCHAR(120) NOT NULL CONSTRAINT [PK_OvertimeManagementAudit] PRIMARY KEY,
  [OvertimeId] NVARCHAR(220) NOT NULL,
  [Actor] NVARCHAR(180) NOT NULL,
  [ActorRole] NVARCHAR(80) NOT NULL,
  [ActionName] NVARCHAR(80) NOT NULL,
  [OldStatus] NVARCHAR(60) NULL,
  [NewStatus] NVARCHAR(60) NOT NULL,
  [Comment] NVARCHAR(500) NULL,
  [CreatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_OvertimeManagementAudit_CreatedAt] DEFAULT SYSUTCDATETIME()
);`);
    dbReady.value = true;
  }
  return pool;
};

const rowToAudit = (row: DbAuditRow): OvertimeAuditEntry => ({
  id: row.Id,
  at: new Date(row.CreatedAt).toISOString(),
  actor: row.Actor,
  role: row.ActorRole,
  action: row.ActionName,
  oldStatus: row.OldStatus,
  newStatus: row.NewStatus,
  comment: row.Comment,
});

const workflowFor = (record: Pick<OvertimeRecord, 'status' | 'currentOwner' | 'lastActionAt' | 'auditTrail'>): OvertimeWorkflowStep[] => {
  const status = record.status;
  const audit = record.auditTrail || [];
  const actedAt = (action: string) => audit.find((item) => item.action === action)?.at || null;
  const completed = (stage: OvertimeWorkflowStep['stage']) => {
    if (stage === 'Employee') return !['Draft'].includes(status);
    if (stage === 'Supervisor') return ['Supervisor Approved', 'HR Approved', 'Payroll Ready', 'Payroll Posted'].includes(status);
    if (stage === 'HR') return ['HR Approved', 'Payroll Ready', 'Payroll Posted'].includes(status);
    return ['Payroll Ready', 'Payroll Posted'].includes(status);
  };
  const statusFor = (stage: OvertimeWorkflowStep['stage']): OvertimeWorkflowStep['status'] => {
    if (status === 'Rejected') return 'Rejected';
    if (status === 'Returned') return stage === 'Employee' ? 'Pending' : 'Returned';
    if (status === 'Blocked') return 'Blocked';
    return completed(stage) ? 'Completed' : 'Pending';
  };
  return [
    { stage: 'Employee', status: statusFor('Employee'), owner: 'Employee / Supervisor', actedAt: actedAt('submit') },
    { stage: 'Supervisor', status: statusFor('Supervisor'), owner: 'Supervisor', actedAt: actedAt('approve-supervisor') },
    { stage: 'HR', status: statusFor('HR'), owner: 'HR', actedAt: actedAt('approve-hr') },
    { stage: 'Payroll', status: statusFor('Payroll'), owner: 'Payroll', actedAt: actedAt('mark-payroll-ready') || actedAt('post-payroll') },
  ];
};

const currentOwnerFor = (status: OvertimeStatus) => {
  if (status === 'Draft' || status === 'Returned') return 'Employee / Supervisor';
  if (status === 'Submitted') return 'Supervisor';
  if (status === 'Supervisor Approved') return 'HR';
  if (status === 'HR Approved') return 'Payroll';
  if (status === 'Payroll Ready') return 'Payroll';
  if (status === 'Payroll Posted') return 'Closed';
  return 'HR';
};

const initialStatusFor = (payrollReady: boolean, issues: string[]): OvertimeStatus => {
  if (issues.some((issue) => issue.toLowerCase().includes('rate'))) return 'Blocked';
  if (payrollReady) return 'HR Approved';
  return 'Submitted';
};

const buildCandidateRecords = async () => {
  const [employeeSource, timesheetData] = await Promise.all([readPayrollEmployees(), readTimesheetData()]);
  const employeeByKey = new Map<string, DleEmployeeDirectoryRow>();
  for (const employee of employeeSource.employees) {
    for (const key of employeeKeys(employee)) employeeByKey.set(key, employee);
  }
  const headerById = new Map<string, TimesheetHeader>(timesheetData.headers.map((header) => [header.id, header]));

  const records = timesheetData.lines.map((line) => {
    const header = headerById.get(line.headerId);
    const employee = lineKeys(line).map((key) => employeeByKey.get(key)).find(Boolean);
    if (!header || !employee) return null;
    const date = header.timesheetDate;
    const dayType = dayTypeFor(date);
    const workedHours = Math.max(normalizePaidWorkHours(line.attendanceDuration), normalizePaidWorkHours(line.totalHours), normalizePaidWorkHours(line.usedHours + line.idleHours));
    const overtimeHours = Math.max(0, round2(workedHours - STANDARD_TIMESHEET_HOURS));
    const payableHours = dayType === 'Weekday' ? overtimeHours : workedHours;
    if (payableHours <= 0) return null;
    const overtime = calculatePayrollOvertime(employee, dayType, payableHours);
    const payrollReady = isTimesheetPayrollReadyStatus(header.status);
    const issues = [
      ...(!overtime.hourlyRate ? ['Hourly rate cannot be derived from payroll setup'] : []),
      ...(!payrollReady ? ['Timesheet has not reached HR/payroll-ready status'] : []),
      ...(payableHours > 4 && dayType === 'Weekday' ? ['Weekday overtime exceeds 4 hours'] : []),
      ...(line.validationStatus === 'Error' ? ['Timesheet line has validation error'] : []),
    ];
    const status = initialStatusFor(payrollReady, issues);
    const projectCodes = Array.from(new Set((line.projectAllocations || []).map((item) => item.projectCode).filter(Boolean)));
    return {
      id: `ot-${line.id}`,
      sourceLineId: line.id,
      headerId: header.id,
      periodId: header.periodId,
      date,
      employeeId: employee.employeeCode || employee.employeeId || line.employeeId,
      employeeName: employee.fullName || line.employeeName,
      department: employee.department || 'Unassigned',
      jobTitle: employee.jobTitle || 'Unassigned',
      location: employee.workLocation || employee.location || 'Unassigned',
      supervisor: header.supervisorName || employee.managerName || 'Unassigned',
      workCenter: header.workCenterName || 'Unassigned',
      employmentType: employee.employmentType || employee.employeeCategory || 'Unassigned',
      salaryGrade: employee.salaryGrade || employee.jobGrade || 'Unassigned',
      dayType,
      workedHours: round2(workedHours),
      standardHours: STANDARD_TIMESHEET_HOURS,
      overtimeHours: round2(overtimeHours),
      payableHours: round2(payableHours),
      multiplier: overtime.multiplier,
      hourlyRate: overtime.hourlyRate,
      grossPay: overtime.amount,
      earningCode: overtime.code,
      earningName: overtime.name,
      timesheetStatus: header.status,
      payrollReady,
      status,
      currentOwner: currentOwnerFor(status),
      severity: issues.some((issue) => issue.toLowerCase().includes('rate')) ? 'High' : issues.length ? 'Medium' : 'Low',
      issues,
      projectCodes,
      lastActionAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      workflow: [],
      auditTrail: [],
    } satisfies OvertimeRecord;
  }).filter(Boolean) as OvertimeRecord[];

  return { employeeSource, records };
};

const upsertCandidates = async (records: OvertimeRecord[]) => {
  const pool = await ensureDb();
  for (const record of records) {
    await pool.request()
      .input('Id', sql.NVarChar(220), record.id)
      .input('SourceLineId', sql.NVarChar(220), record.sourceLineId)
      .input('HeaderId', sql.NVarChar(160), record.headerId)
      .input('PeriodId', sql.NVarChar(60), record.periodId)
      .input('WorkDate', sql.Date, record.date)
      .input('EmployeeId', sql.NVarChar(80), record.employeeId)
      .input('EmployeeName', sql.NVarChar(220), record.employeeName)
      .input('Department', sql.NVarChar(180), record.department)
      .input('JobTitle', sql.NVarChar(180), record.jobTitle)
      .input('Location', sql.NVarChar(180), record.location)
      .input('Supervisor', sql.NVarChar(180), record.supervisor)
      .input('WorkCenter', sql.NVarChar(180), record.workCenter)
      .input('EmploymentType', sql.NVarChar(120), record.employmentType)
      .input('SalaryGrade', sql.NVarChar(120), record.salaryGrade)
      .input('DayType', sql.NVarChar(40), record.dayType)
      .input('WorkedHours', sql.Decimal(9, 2), record.workedHours)
      .input('StandardHours', sql.Decimal(9, 2), record.standardHours)
      .input('OvertimeHours', sql.Decimal(9, 2), record.overtimeHours)
      .input('PayableHours', sql.Decimal(9, 2), record.payableHours)
      .input('Multiplier', sql.Decimal(9, 2), record.multiplier)
      .input('HourlyRate', sql.Decimal(19, 2), record.hourlyRate)
      .input('GrossPay', sql.Decimal(19, 2), record.grossPay)
      .input('EarningCode', sql.NVarChar(80), record.earningCode)
      .input('EarningName', sql.NVarChar(180), record.earningName)
      .input('TimesheetStatus', sql.NVarChar(60), record.timesheetStatus)
      .input('PayrollReady', sql.Bit, record.payrollReady)
      .input('WorkflowStatus', sql.NVarChar(60), record.status)
      .input('CurrentOwner', sql.NVarChar(120), record.currentOwner)
      .input('Severity', sql.NVarChar(20), record.severity)
      .input('IssuesJson', sql.NVarChar(sql.MAX), JSON.stringify(record.issues))
      .input('ProjectCodesJson', sql.NVarChar(sql.MAX), JSON.stringify(record.projectCodes))
      .query(`
MERGE [hris].[OvertimeManagementRecords] AS target
USING (SELECT @Id AS [Id]) AS source ON target.[Id]=source.[Id]
WHEN MATCHED THEN UPDATE SET
  [SourceLineId]=@SourceLineId,[HeaderId]=@HeaderId,[PeriodId]=@PeriodId,[WorkDate]=@WorkDate,[EmployeeId]=@EmployeeId,[EmployeeName]=@EmployeeName,
  [Department]=@Department,[JobTitle]=@JobTitle,[Location]=@Location,[Supervisor]=@Supervisor,[WorkCenter]=@WorkCenter,[EmploymentType]=@EmploymentType,
  [SalaryGrade]=@SalaryGrade,[DayType]=@DayType,[WorkedHours]=@WorkedHours,[StandardHours]=@StandardHours,[OvertimeHours]=@OvertimeHours,
  [PayableHours]=@PayableHours,[Multiplier]=@Multiplier,[HourlyRate]=@HourlyRate,[GrossPay]=@GrossPay,[EarningCode]=@EarningCode,[EarningName]=@EarningName,
  [TimesheetStatus]=@TimesheetStatus,[PayrollReady]=@PayrollReady,[Severity]=@Severity,[IssuesJson]=@IssuesJson,[ProjectCodesJson]=@ProjectCodesJson,[UpdatedAt]=SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT
  ([Id],[SourceLineId],[HeaderId],[PeriodId],[WorkDate],[EmployeeId],[EmployeeName],[Department],[JobTitle],[Location],[Supervisor],[WorkCenter],[EmploymentType],[SalaryGrade],[DayType],[WorkedHours],[StandardHours],[OvertimeHours],[PayableHours],[Multiplier],[HourlyRate],[GrossPay],[EarningCode],[EarningName],[TimesheetStatus],[PayrollReady],[WorkflowStatus],[CurrentOwner],[Severity],[IssuesJson],[ProjectCodesJson])
VALUES
  (@Id,@SourceLineId,@HeaderId,@PeriodId,@WorkDate,@EmployeeId,@EmployeeName,@Department,@JobTitle,@Location,@Supervisor,@WorkCenter,@EmploymentType,@SalaryGrade,@DayType,@WorkedHours,@StandardHours,@OvertimeHours,@PayableHours,@Multiplier,@HourlyRate,@GrossPay,@EarningCode,@EarningName,@TimesheetStatus,@PayrollReady,@WorkflowStatus,@CurrentOwner,@Severity,@IssuesJson,@ProjectCodesJson);`);
  }
};

const readRecords = async (): Promise<OvertimeRecord[]> => {
  const pool = await ensureDb();
  const [recordsResult, auditResult] = await Promise.all([
    pool.request().query<DbOvertimeRow>('SELECT * FROM [hris].[OvertimeManagementRecords] ORDER BY [WorkDate] DESC, [EmployeeName]'),
    pool.request().query<DbAuditRow>('SELECT * FROM [hris].[OvertimeManagementAudit] ORDER BY [CreatedAt] DESC'),
  ]);
  const auditByRecord = new Map<string, OvertimeAuditEntry[]>();
  for (const row of auditResult.recordset) {
    const current = auditByRecord.get(row.OvertimeId) || [];
    current.push(rowToAudit(row));
    auditByRecord.set(row.OvertimeId, current);
  }
  return recordsResult.recordset.map((row) => {
    const auditTrail = auditByRecord.get(row.Id) || [];
    const record: OvertimeRecord = {
      id: row.Id,
      sourceLineId: row.SourceLineId,
      headerId: row.HeaderId,
      periodId: row.PeriodId,
      date: toDateOnly(row.WorkDate),
      employeeId: row.EmployeeId,
      employeeName: row.EmployeeName,
      department: row.Department,
      jobTitle: row.JobTitle,
      location: row.Location,
      supervisor: row.Supervisor,
      workCenter: row.WorkCenter,
      employmentType: row.EmploymentType,
      salaryGrade: row.SalaryGrade,
      dayType: row.DayType,
      workedHours: Number(row.WorkedHours || 0),
      standardHours: Number(row.StandardHours || 0),
      overtimeHours: Number(row.OvertimeHours || 0),
      payableHours: Number(row.PayableHours || 0),
      multiplier: Number(row.Multiplier || 0),
      hourlyRate: Number(row.HourlyRate || 0),
      grossPay: Number(row.GrossPay || 0),
      earningCode: row.EarningCode,
      earningName: row.EarningName,
      timesheetStatus: row.TimesheetStatus,
      payrollReady: Boolean(row.PayrollReady),
      status: row.WorkflowStatus,
      currentOwner: row.CurrentOwner,
      severity: row.Severity,
      issues: jsonArray(row.IssuesJson),
      projectCodes: jsonArray(row.ProjectCodesJson),
      lastActionAt: toIso(row.LastActionAt),
      createdAt: new Date(row.CreatedAt).toISOString(),
      updatedAt: new Date(row.UpdatedAt).toISOString(),
      workflow: [],
      auditTrail,
    };
    return { ...record, workflow: workflowFor(record) };
  });
};

const permissionsFor = (role: OvertimeRole) => ({
  canSubmit: ['Employee', 'Supervisor', 'HR Officer', 'HR Manager', 'Administrator', 'Super Administrator'].includes(role),
  canSupervisorApprove: ['Supervisor', 'HR Manager', 'Administrator', 'Super Administrator'].includes(role),
  canHrApprove: ['HR Officer', 'HR Manager', 'Administrator', 'Super Administrator'].includes(role),
  canPayroll: ['Payroll Officer', 'Payroll Manager', 'Finance Controller', 'Administrator', 'Super Administrator'].includes(role),
  canExport: role !== 'Employee',
  canViewMoney: role !== 'Employee',
  canAudit: role !== 'Employee',
});

const nextStatus = (action: OvertimeAction, record: OvertimeRecord): OvertimeStatus => {
  if (action === 'submit' && ['Draft', 'Returned'].includes(record.status)) return 'Submitted';
  if (action === 'approve-supervisor' && record.status === 'Submitted') return 'Supervisor Approved';
  if (action === 'approve-hr' && record.status === 'Supervisor Approved') return 'HR Approved';
  if (action === 'mark-payroll-ready' && record.status === 'HR Approved') return 'Payroll Ready';
  if (action === 'post-payroll' && record.status === 'Payroll Ready') return 'Payroll Posted';
  if (action === 'return' && !['Payroll Posted', 'Rejected'].includes(record.status)) return 'Returned';
  if (action === 'reject' && record.status !== 'Payroll Posted') return 'Rejected';
  if (action === 'reopen' && ['Returned', 'Rejected', 'Blocked'].includes(record.status)) return 'Submitted';
  throw new Error(`Action ${action} is not valid for ${record.status} overtime.`);
};

export const validateOvertimeAction = (action: OvertimeAction, role: OvertimeRole, record: OvertimeRecord, comment?: string | null) => {
  const perms = permissionsFor(role);
  if (['return', 'reject'].includes(action) && !clean(comment)) return 'Comment is required for return or rejection.';
  if (action === 'submit' && !perms.canSubmit) return `${role} cannot submit overtime.`;
  if (action === 'approve-supervisor' && !perms.canSupervisorApprove) return `${role} cannot perform supervisor overtime approval.`;
  if (action === 'approve-hr' && !perms.canHrApprove) return `${role} cannot perform HR overtime approval.`;
  if (['mark-payroll-ready', 'post-payroll'].includes(action) && !perms.canPayroll) return `${role} cannot perform payroll overtime actions.`;
  if (['approve-supervisor', 'approve-hr', 'mark-payroll-ready', 'post-payroll'].includes(action) && record.issues.some((issue) => issue.toLowerCase().includes('rate'))) return 'Resolve blocked overtime issues before approval or payroll posting.';
  try {
    nextStatus(action, record);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : 'Invalid overtime action.';
  }
};

export const readOvertimeManagementPayload = async (roleInput?: string | null) => {
  const role = normalizeOvertimeRole(roleInput);
  const [
    { employeeSource, records: candidates },
    projects,
    workCenters,
    supervisorAssignments,
  ] = await Promise.all([
    buildCandidateRecords(),
    readProjects().catch(() => []),
    readTimesheetWorkCenters().catch(() => []),
    readSupervisorAssignments().catch(() => []),
  ]);
  await upsertCandidates(candidates);
  const records = await readRecords();
  const activeEmployees = employeeSource.employees.filter((employee) => !['Resigned', 'Terminated', 'Retired', 'Inactive'].includes(clean(employee.status)));
  const employeeByCode = new Map(activeEmployees.map((employee) => [clean(employee.employeeCode).toLowerCase(), employee]));
  const uniqueSupervisors = new Map<string, OvertimeAuthorizationOption>();
  const employeesBySupervisor = new Map<string, Map<string, OvertimeSupervisorEmployee>>();
  const addAssignedEmployee = (supervisorCode: string, employeeCode: string, fallbackName: string) => {
    const key = supervisorCode.toLowerCase();
    const code = clean(employeeCode);
    if (!key || !code) return;
    const directory = employeeByCode.get(code.toLowerCase());
    const list = employeesBySupervisor.get(key) || new Map<string, OvertimeSupervisorEmployee>();
    list.set(code.toLowerCase(), {
      code,
      name: clean(directory?.fullName) || clean(fallbackName) || code,
      jobTitle: clean(directory?.jobTitle) || clean(directory?.designation),
      department: clean(directory?.department),
    });
    employeesBySupervisor.set(key, list);
  };
  for (const assignment of supervisorAssignments) {
    const code = clean(assignment.supervisorEmployeeCode);
    if (!code || assignment.matchedStatus === 'Unresolved') continue;
    const employee = employeeByCode.get(code.toLowerCase());
    uniqueSupervisors.set(code.toLowerCase(), employee ? employeeOption(employee) : {
      id: code,
      code,
      name: clean(assignment.supervisorName) || code,
      department: clean(assignment.assignmentGroup),
    });
    if (clean(assignment.employeeCode)) addAssignedEmployee(code, assignment.employeeCode!, clean(assignment.employeeName) || '');
  }
  for (const employee of activeEmployees) {
    const text = `${employee.jobTitle} ${employee.designation} ${employee.fullName}`.toLowerCase();
    if (text.includes('supervisor') || text.includes('lead') || text.includes('foreman')) {
      const code = clean(employee.employeeCode) || clean(employee.employeeId);
      if (code && !uniqueSupervisors.has(code.toLowerCase())) uniqueSupervisors.set(code.toLowerCase(), employeeOption(employee));
    }
  }
  // Direct-report fallback: employees whose reporting manager matches a supervisor (by code or name).
  const supervisorByName = new Map<string, string>();
  for (const [key, option] of uniqueSupervisors) supervisorByName.set(option.name.toLowerCase(), key);
  for (const employee of activeEmployees) {
    const manager = `${clean(employee.managerName)} ${clean(employee.functionalManager)} ${clean(employee.departmentHead)}`.toLowerCase();
    if (!manager.trim()) continue;
    for (const [key, option] of uniqueSupervisors) {
      const codeLower = option.code.toLowerCase();
      const nameLower = option.name.toLowerCase();
      if ((codeLower && manager.includes(codeLower)) || (nameLower && manager.includes(nameLower))) {
        addAssignedEmployee(key, clean(employee.employeeCode) || clean(employee.employeeId), clean(employee.fullName));
        break;
      }
    }
  }
  const mdEmployee = resolveMdApprover(activeEmployees);
  const gmEmployee = resolveGmOperations(activeEmployees);
  const hrEmployee = resolveHrApprover(activeEmployees);
  const activeProjects = projects
    .filter((project) => ['Active', 'Approved', 'Open'].includes(project.status))
    .map((project) => {
      const projectManager = clean(project.projectManager);
      const managerEmployee = findEmployeeByText(activeEmployees, projectManager);
      return {
        id: project.id,
        code: project.code,
        name: project.name,
        projectManager,
        projectManagerEmail: employeeEmail(managerEmployee),
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code));
  const authorizationSetup: OvertimeAuthorizationSetup = {
    projects: activeProjects,
    workCenters: workCenters
      .filter((workCenter) => workCenter.status === 'Active')
      .map((workCenter) => ({
        id: workCenter.id,
        code: workCenter.code,
        name: workCenter.name,
        location: workCenter.location,
        site: workCenter.site,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    supervisors: Array.from(uniqueSupervisors.entries())
      .map(([key, option]) => ({
        ...option,
        employees: Array.from((employeesBySupervisor.get(key) || new Map()).values()).sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    mdApprover: mdEmployee ? employeeOption(mdEmployee) : null,
    gmOperations: gmEmployee ? employeeOption(gmEmployee) : null,
    hrApprover: hrEmployee ? employeeOption(hrEmployee) : null,
  };
  const employeeDepartments = employeeSource.employees.map((employee) => clean(employee.department)).filter(Boolean);
  const employeeLocations = employeeSource.employees.map((employee) => clean(employee.workLocation) || clean(employee.location) || clean(employee.officeLocation)).filter(Boolean);
  const uniqueSorted = (values: string[]) => Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const summary = {
    records: records.length,
    submitted: records.filter((item) => item.status === 'Submitted').length,
    supervisorApproved: records.filter((item) => item.status === 'Supervisor Approved').length,
    hrApproved: records.filter((item) => item.status === 'HR Approved').length,
    payrollReady: records.filter((item) => item.status === 'Payroll Ready').length,
    payrollPosted: records.filter((item) => item.status === 'Payroll Posted').length,
    returned: records.filter((item) => item.status === 'Returned').length,
    rejected: records.filter((item) => item.status === 'Rejected').length,
    blocked: records.filter((item) => item.status === 'Blocked').length,
    payableHours: round2(records.reduce((sum, item) => sum + item.payableHours, 0)),
    grossPay: round2(records.reduce((sum, item) => sum + item.grossPay, 0)),
    pendingApprovals: records.filter((item) => ['Submitted', 'Supervisor Approved', 'HR Approved'].includes(item.status)).length,
  };
  return {
    generatedAt: new Date().toISOString(),
    source: `${employeeSource.source}; HRIS Timesheet Overtime`,
    dataSource: payrollDataSourceInfo(employeeSource),
    role,
    permissions: permissionsFor(role),
    summary,
    filterOptions: {
      statuses: ['Draft', 'Submitted', 'Supervisor Approved', 'HR Approved', 'Payroll Ready', 'Payroll Posted', 'Returned', 'Rejected', 'Blocked'] as OvertimeStatus[],
      departments: uniqueSorted([...records.map((item) => item.department), ...employeeDepartments]),
      locations: uniqueSorted([...records.map((item) => item.location), ...employeeLocations]),
      dayTypes: ['Weekday', 'Saturday', 'Sunday', 'Public Holiday'] as OvertimeDayType[],
    },
    authorizationSetup,
    records,
  };
};

export const createOvertimeRequest = async (input: OvertimeCreateRequest, roleInput?: string | null, actorInput?: string | null) => {
  const role = normalizeOvertimeRole(roleInput);
  const perms = permissionsFor(role);
  if (!perms.canSubmit) throw new Error(`${role} cannot create overtime requests.`);
  const employeeKey = clean(input.employeeId);
  if (!employeeKey) throw new Error('Employee is required for overtime request.');
  if (!input.date) throw new Error('Overtime date is required.');
  const workedHours = round2(Number(input.workedHours || 0));
  if (workedHours <= STANDARD_TIMESHEET_HOURS) throw new Error(`Worked hours must exceed ${STANDARD_TIMESHEET_HOURS} hours for overtime.`);

  const employeeSource = await readPayrollEmployees();
  const employee = employeeSource.employees.find((item) => employeeKeys(item).includes(normalizePayrollMatchKey(employeeKey)));
  if (!employee) throw new Error('Employee was not found in HRIS employee master.');
  const dayType = input.dayType || dayTypeFor(input.date);
  const payableHours = round2(Number(input.payableHours || (dayType === 'Weekday' ? workedHours - STANDARD_TIMESHEET_HOURS : workedHours)));
  if (payableHours <= 0) throw new Error('Payable overtime hours must be greater than zero.');
  const overtime = calculatePayrollOvertime(employee, dayType, payableHours);
  const issues = [
    ...(!overtime.hourlyRate ? ['Hourly rate cannot be derived from payroll setup'] : []),
    ...(payableHours > 4 && dayType === 'Weekday' ? ['Weekday overtime exceeds 4 hours'] : []),
  ];
  const status: OvertimeStatus = issues.some((issue) => issue.toLowerCase().includes('rate')) ? 'Blocked' : 'Draft';
  const id = `ot-req-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const record: OvertimeRecord = {
    id,
    sourceLineId: id,
    headerId: 'manual-overtime-request',
    periodId: input.date.slice(0, 7),
    date: input.date,
    employeeId: employee.employeeCode || employee.employeeId,
    employeeName: employee.fullName,
    department: employee.department || 'Unassigned',
    jobTitle: employee.jobTitle || 'Unassigned',
    location: employee.workLocation || employee.location || 'Unassigned',
    supervisor: employee.managerName || employee.departmentHead || 'Unassigned',
    workCenter: employee.costCenter || 'Unassigned',
    employmentType: employee.employmentType || employee.employeeCategory || 'Unassigned',
    salaryGrade: employee.salaryGrade || employee.jobGrade || 'Unassigned',
    dayType,
    workedHours,
    standardHours: STANDARD_TIMESHEET_HOURS,
    overtimeHours: round2(Math.max(0, workedHours - STANDARD_TIMESHEET_HOURS)),
    payableHours,
    multiplier: overtime.multiplier,
    hourlyRate: overtime.hourlyRate,
    grossPay: overtime.amount,
    earningCode: overtime.code,
    earningName: overtime.name,
    timesheetStatus: 'Manual Request',
    payrollReady: false,
    status,
    currentOwner: currentOwnerFor(status),
    severity: issues.length ? 'High' : 'Low',
    issues,
    projectCodes: clean(input.projectCode) ? [clean(input.projectCode)] : [],
    lastActionAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    workflow: [],
    auditTrail: [],
  };
  await upsertCandidates([record]);
  const pool = await ensureDb();
  await pool.request()
    .input('Id', sql.NVarChar(120), `ot-aud-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    .input('OvertimeId', sql.NVarChar(220), id)
    .input('Actor', sql.NVarChar(180), clean(actorInput) || role)
    .input('ActorRole', sql.NVarChar(80), role)
    .input('ActionName', sql.NVarChar(80), 'create-request')
    .input('OldStatus', sql.NVarChar(60), null)
    .input('NewStatus', sql.NVarChar(60), status)
    .input('Comment', sql.NVarChar(500), clean(input.reason) || null)
    .query('INSERT INTO [hris].[OvertimeManagementAudit] ([Id],[OvertimeId],[Actor],[ActorRole],[ActionName],[OldStatus],[NewStatus],[Comment]) VALUES (@Id,@OvertimeId,@Actor,@ActorRole,@ActionName,@OldStatus,@NewStatus,@Comment);');
  return readOvertimeManagementPayload(role);
};

export const applyOvertimeAction = async (id: string, action: OvertimeAction, roleInput?: string | null, actorInput?: string | null, comment?: string | null) => {
  const role = normalizeOvertimeRole(roleInput);
  const records = await readOvertimeManagementPayload(roleInput).then((payload) => payload.records);
  const record = records.find((item) => item.id === id);
  if (!record) throw new Error('Overtime record not found.');
  const validation = validateOvertimeAction(action, role, record, comment);
  if (validation) throw new Error(validation);
  const oldStatus = record.status;
  const newStatus = nextStatus(action, record);
  const currentOwner = currentOwnerFor(newStatus);
  const actor = clean(actorInput) || role;
  const pool = await ensureDb();
  await pool.request()
    .input('Id', sql.NVarChar(220), id)
    .input('WorkflowStatus', sql.NVarChar(60), newStatus)
    .input('CurrentOwner', sql.NVarChar(120), currentOwner)
    .query('UPDATE [hris].[OvertimeManagementRecords] SET [WorkflowStatus]=@WorkflowStatus,[CurrentOwner]=@CurrentOwner,[LastActionAt]=SYSUTCDATETIME(),[UpdatedAt]=SYSUTCDATETIME() WHERE [Id]=@Id;');
  await pool.request()
    .input('Id', sql.NVarChar(120), `ot-aud-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    .input('OvertimeId', sql.NVarChar(220), id)
    .input('Actor', sql.NVarChar(180), actor)
    .input('ActorRole', sql.NVarChar(80), role)
    .input('ActionName', sql.NVarChar(80), action)
    .input('OldStatus', sql.NVarChar(60), oldStatus)
    .input('NewStatus', sql.NVarChar(60), newStatus)
    .input('Comment', sql.NVarChar(500), clean(comment) || null)
    .query('INSERT INTO [hris].[OvertimeManagementAudit] ([Id],[OvertimeId],[Actor],[ActorRole],[ActionName],[OldStatus],[NewStatus],[Comment]) VALUES (@Id,@OvertimeId,@Actor,@ActorRole,@ActionName,@OldStatus,@NewStatus,@Comment);');
  return readOvertimeManagementPayload(role);
};

export const overtimeCsv = (records: OvertimeRecord[], canViewMoney: boolean) => {
  const headers = ['Date', 'Employee ID', 'Employee', 'Department', 'Location', 'Supervisor', 'Day Type', 'Worked Hours', 'Overtime Hours', 'Payable Hours', 'Multiplier', 'Hourly Rate', 'Gross Pay', 'Timesheet Status', 'Workflow Status', 'Current Owner', 'Issues'];
  const rows = records.map((record) => [
    record.date,
    record.employeeId,
    record.employeeName,
    record.department,
    record.location,
    record.supervisor,
    record.dayType,
    record.workedHours,
    record.overtimeHours,
    record.payableHours,
    record.multiplier,
    canViewMoney ? record.hourlyRate : 'Restricted',
    canViewMoney ? record.grossPay : 'Restricted',
    record.timesheetStatus,
    record.status,
    record.currentOwner,
    record.issues.join('; '),
  ]);
  return [headers, ...rows].map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
};
