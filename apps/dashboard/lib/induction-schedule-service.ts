import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sql from 'mssql';
import { getDleEnterpriseDbPool, type DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import { readPayrollEmployees } from '@/lib/payroll-employee-source';

export type InductionKind = 'Department' | 'HSE' | 'IT' | 'Corporate';
export type InductionStatus = 'Scheduled' | 'Completed' | 'Cancelled' | 'Overdue' | 'Needs Scheduling';

export type InductionSession = {
  id: string;
  employeeDbId: number | null;
  employeeCode: string;
  employeeName: string;
  department: string;
  jobTitle: string;
  location: string;
  kind: InductionKind;
  status: InductionStatus;
  scheduledFor: string;
  facilitator: string;
  venue: string;
  notes: string;
  source: 'sql' | 'json' | 'inferred';
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
};

export type InductionEmployeeOption = {
  employeeDbId: number | null;
  employeeCode: string;
  employeeName: string;
  department: string;
  jobTitle: string;
  location: string;
};

export type InductionScheduleWorkspace = {
  generatedAt: string;
  source: string;
  summary: {
    upcoming: number;
    completed: number;
    overdue: number;
    needsScheduling: number;
    thisWeek: number;
  };
  kinds: InductionKind[];
  departments: string[];
  allDepartments: string[];
  facilitators: string[];
  employeeOptions: InductionEmployeeOption[];
  sessions: InductionSession[];
};

export type InductionUpsertInput = {
  id?: string;
  employeeDbId?: number | null;
  employeeCode: string;
  employeeName: string;
  department?: string;
  jobTitle?: string;
  location?: string;
  kind: InductionKind;
  status: InductionStatus;
  scheduledFor: string;
  facilitator: string;
  venue?: string;
  notes?: string;
  actor: string;
};

type StoreState = { sessions: InductionSession[] };

const resolveDashboardRoot = () => {
  const cwd = process.cwd();
  const dashboardSuffix = path.join('apps', 'dashboard');
  return cwd.endsWith(dashboardSuffix) ? cwd : path.join(cwd, dashboardSuffix);
};

const DATA_DIR = path.join(resolveDashboardRoot(), 'data', 'hris');
const JSON_PATH = path.join(DATA_DIR, 'onboarding-induction-schedule.json');
const nowIso = () => new Date().toISOString();
const compact = (value: unknown) => String(value ?? '').trim();
const lower = (value: unknown) => compact(value).toLowerCase();

const INDUCTION_KINDS: InductionKind[] = ['Department', 'HSE', 'IT', 'Corporate'];
const FACILITATOR_BY_KIND: Record<InductionKind, string> = {
  Department: 'Department Head',
  HSE: 'HSE Officer',
  IT: 'IT Administrator',
  Corporate: 'HR Officer',
};

const sessionKey = (session: Pick<InductionSession, 'employeeCode' | 'kind'>) =>
  `${compact(session.employeeCode).toUpperCase()}::${session.kind}`;

let schemaReady = false;

const parseDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const endOfWeek = (date: Date) => {
  const start = startOfDay(date);
  const day = start.getDay();
  const diff = day === 0 ? 0 : 7 - day;
  return new Date(start.getTime() + diff * 86400000);
};

const isActiveEmployment = (employee: DleEmployeeDirectoryRow) => {
  const status = lower(employee.status);
  if (!status) return true;
  return !/(terminat|resign|exit|inactive|dismiss|deceased|left)/.test(status);
};

const isNewHireCohort = (employee: DleEmployeeDirectoryRow, now = new Date()) => {
  if (!isActiveEmployment(employee)) return false;
  if (lower(employee.status).includes('probation')) return true;
  const joined = parseDate(employee.dateJoined);
  if (joined) {
    const days = Math.round((startOfDay(now).getTime() - startOfDay(joined).getTime()) / 86400000);
    if (days >= 0 && days <= 120) return true;
  }
  const probationEnd = parseDate(employee.probationEndDate);
  return Boolean(probationEnd && probationEnd >= startOfDay(now));
};

const normalizeStatus = (value: unknown, scheduledFor?: string | null): InductionStatus => {
  const status = lower(value);
  if (status.includes('complete')) return 'Completed';
  if (status.includes('cancel')) return 'Cancelled';
  if (status.includes('need') || status.includes('unscheduled')) return 'Needs Scheduling';
  const when = parseDate(scheduledFor);
  if (when && when < startOfDay(new Date()) && !status.includes('complete') && !status.includes('cancel')) return 'Overdue';
  if (status.includes('overdue')) return 'Overdue';
  return 'Scheduled';
};

const normalizeKind = (value: unknown): InductionKind => {
  const text = lower(value);
  if (text.includes('hse')) return 'HSE';
  if (text.includes('it') || text.includes('tech')) return 'IT';
  if (text.includes('corporate') || text.includes('hr')) return 'Corporate';
  return 'Department';
};

const ensureSchema = async (pool: sql.ConnectionPool) => {
  if (schemaReady) return;
  await pool.request().query(`
IF OBJECT_ID(N'[hris].[OnboardingInductionSchedule]', N'U') IS NULL
CREATE TABLE [hris].[OnboardingInductionSchedule] (
  [session_id] NVARCHAR(80) NOT NULL PRIMARY KEY,
  [employee_id] BIGINT NULL,
  [employee_code] NVARCHAR(50) NOT NULL,
  [employee_name] NVARCHAR(250) NOT NULL,
  [department] NVARCHAR(150) NULL,
  [job_title] NVARCHAR(150) NULL,
  [location_name] NVARCHAR(150) NULL,
  [induction_kind] NVARCHAR(40) NOT NULL,
  [session_status] NVARCHAR(40) NOT NULL,
  [scheduled_for] DATETIME2(3) NOT NULL,
  [facilitator] NVARCHAR(150) NULL,
  [venue] NVARCHAR(200) NULL,
  [notes] NVARCHAR(1000) NULL,
  [created_at] DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
  [updated_at] DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
  [updated_by] NVARCHAR(120) NULL
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_OnboardingInductionSchedule_Code' AND object_id = OBJECT_ID(N'[hris].[OnboardingInductionSchedule]'))
  CREATE INDEX [IX_OnboardingInductionSchedule_Code] ON [hris].[OnboardingInductionSchedule] ([employee_code], [scheduled_for]);
`);
  schemaReady = true;
};

const emptyStore = (): StoreState => ({ sessions: [] });

const readJsonStore = async (): Promise<StoreState> => {
  try {
    await access(JSON_PATH);
    const raw = await readFile(JSON_PATH, 'utf8');
    const parsed = JSON.parse(raw) as StoreState;
    return { sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [] };
  } catch {
    return emptyStore();
  }
};

const writeJsonStore = async (state: StoreState) => {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(JSON_PATH, JSON.stringify(state, null, 2), 'utf8');
};

const mapSqlSession = (row: Record<string, unknown>): InductionSession => {
  const scheduledFor = row.scheduled_for instanceof Date
    ? row.scheduled_for.toISOString()
    : compact(row.scheduled_for) || nowIso();
  return {
    id: compact(row.session_id),
    employeeDbId: Number(row.employee_id) || null,
    employeeCode: compact(row.employee_code),
    employeeName: compact(row.employee_name),
    department: compact(row.department) || 'Unassigned',
    jobTitle: compact(row.job_title) || '—',
    location: compact(row.location_name) || '—',
    kind: normalizeKind(row.induction_kind),
    status: normalizeStatus(row.session_status, scheduledFor),
    scheduledFor,
    facilitator: compact(row.facilitator) || FACILITATOR_BY_KIND[normalizeKind(row.induction_kind)],
    venue: compact(row.venue),
    notes: compact(row.notes),
    source: 'sql',
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : compact(row.created_at) || nowIso(),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : compact(row.updated_at) || nowIso(),
    updatedBy: compact(row.updated_by) || null,
  };
};

const readSqlSessions = async (): Promise<InductionSession[]> => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) return [];
  try {
    await ensureSchema(pool);
    const result = await pool.request().query(`
SELECT *
FROM [hris].[OnboardingInductionSchedule]
ORDER BY [scheduled_for] ASC, [employee_code] ASC;
`);
    return (result.recordset || []).map((row: Record<string, unknown>) => mapSqlSession(row));
  } catch {
    return [];
  }
};

const persistSqlSession = async (session: InductionSession) => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) return false;
  await ensureSchema(pool);
  await pool.request()
    .input('session_id', sql.NVarChar(80), session.id)
    .input('employee_id', sql.BigInt, session.employeeDbId)
    .input('employee_code', sql.NVarChar(50), session.employeeCode)
    .input('employee_name', sql.NVarChar(250), session.employeeName)
    .input('department', sql.NVarChar(150), session.department || null)
    .input('job_title', sql.NVarChar(150), session.jobTitle || null)
    .input('location_name', sql.NVarChar(150), session.location || null)
    .input('induction_kind', sql.NVarChar(40), session.kind)
    .input('session_status', sql.NVarChar(40), session.status)
    .input('scheduled_for', sql.DateTime2(3), new Date(session.scheduledFor))
    .input('facilitator', sql.NVarChar(150), session.facilitator || null)
    .input('venue', sql.NVarChar(200), session.venue || null)
    .input('notes', sql.NVarChar(1000), session.notes || null)
    .input('updated_by', sql.NVarChar(120), session.updatedBy)
    .query(`
MERGE [hris].[OnboardingInductionSchedule] AS target
USING (SELECT @session_id AS session_id) AS source
ON target.session_id = source.session_id
WHEN MATCHED THEN UPDATE SET
  employee_id = @employee_id,
  employee_code = @employee_code,
  employee_name = @employee_name,
  department = @department,
  job_title = @job_title,
  location_name = @location_name,
  induction_kind = @induction_kind,
  session_status = @session_status,
  scheduled_for = @scheduled_for,
  facilitator = @facilitator,
  venue = @venue,
  notes = @notes,
  updated_at = SYSUTCDATETIME(),
  updated_by = @updated_by
WHEN NOT MATCHED THEN INSERT (
  session_id, employee_id, employee_code, employee_name, department, job_title, location_name,
  induction_kind, session_status, scheduled_for, facilitator, venue, notes, updated_by
) VALUES (
  @session_id, @employee_id, @employee_code, @employee_name, @department, @job_title, @location_name,
  @induction_kind, @session_status, @scheduled_for, @facilitator, @venue, @notes, @updated_by
);
`);
  return true;
};

const inferredSessionsForEmployee = (employee: DleEmployeeDirectoryRow): InductionSession[] => {
  const joined = parseDate(employee.dateJoined) || new Date();
  const stamp = nowIso();
  return (['Department', 'HSE', 'IT'] as InductionKind[]).map((kind, index) => {
    const scheduled = new Date(joined.getTime() + (index + 1) * 3 * 86400000);
    const status = normalizeStatus('Scheduled', scheduled.toISOString());
    return {
      id: `INF-${employee.employeeCode}-${kind}`,
      employeeDbId: employee.employeeDbId || null,
      employeeCode: employee.employeeCode,
      employeeName: employee.fullName,
      department: employee.department || 'Unassigned',
      jobTitle: employee.jobTitle || '—',
      location: employee.location || employee.workLocation || '—',
      kind,
      status: employee.hasManagerAssigned && kind === 'Department' && scheduled < new Date()
        ? 'Completed'
        : status,
      scheduledFor: scheduled.toISOString(),
      facilitator: FACILITATOR_BY_KIND[kind],
      venue: kind === 'HSE' ? 'HSE Training Room' : kind === 'IT' ? 'IT Helpdesk' : `${employee.department || 'Department'} floor`,
      notes: 'Suggested from new-hire onboarding cohort',
      source: 'inferred',
      createdAt: stamp,
      updatedAt: stamp,
      updatedBy: null,
    };
  });
};

export const buildInductionScheduleWorkspace = async (): Promise<InductionScheduleWorkspace> => {
  const generatedAt = nowIso();
  const employeeSource = await readPayrollEmployees().catch(() => null);
  const allEmployees = employeeSource?.employees || [];
  const cohort = allEmployees.filter((employee) => isNewHireCohort(employee));
  const sqlSessions = await readSqlSessions();
  const jsonSessions = (await readJsonStore()).sessions.map((session) => ({
    ...session,
    status: normalizeStatus(session.status, session.scheduledFor),
    source: 'json' as const,
  }));

  const byKey = new Map<string, InductionSession>();

  for (const session of jsonSessions) byKey.set(sessionKey(session), session);
  for (const session of sqlSessions) byKey.set(sessionKey(session), session);

  const coveredEmployees = new Set(
    [...byKey.values()].map((session) => compact(session.employeeCode).toUpperCase()).filter(Boolean),
  );

  for (const employee of cohort) {
    const code = compact(employee.employeeCode).toUpperCase();
    if (!code || coveredEmployees.has(code)) continue;
    for (const session of inferredSessionsForEmployee(employee)) {
      byKey.set(sessionKey(session), session);
    }
  }

  const sessions = [...byKey.values()].sort((a, b) => {
    const statusRank: Record<InductionStatus, number> = {
      Overdue: 0,
      'Needs Scheduling': 1,
      Scheduled: 2,
      Completed: 3,
      Cancelled: 4,
    };
    const byStatus = statusRank[a.status] - statusRank[b.status];
    if (byStatus !== 0) return byStatus;
    return a.scheduledFor.localeCompare(b.scheduledFor);
  });

  const now = new Date();
  const weekEnd = endOfWeek(now);
  const summary = {
    upcoming: sessions.filter((session) => session.status === 'Scheduled').length,
    completed: sessions.filter((session) => session.status === 'Completed').length,
    overdue: sessions.filter((session) => session.status === 'Overdue').length,
    needsScheduling: sessions.filter((session) => session.status === 'Needs Scheduling').length,
    thisWeek: sessions.filter((session) => {
      const when = parseDate(session.scheduledFor);
      return Boolean(when && when >= startOfDay(now) && when <= weekEnd && session.status !== 'Cancelled');
    }).length,
  };

  const employeeOptions: InductionEmployeeOption[] = allEmployees
    .filter((employee) => compact(employee.employeeCode))
    .map((employee) => ({
      employeeDbId: employee.employeeDbId || null,
      employeeCode: employee.employeeCode,
      employeeName: employee.fullName,
      department: employee.department || 'Unassigned',
      jobTitle: employee.jobTitle || '—',
      location: employee.location || employee.workLocation || '—',
    }))
    .sort((a, b) => a.employeeCode.localeCompare(b.employeeCode));

  const allDepartments = Array.from(
    new Set([
      ...allEmployees.map((employee) => compact(employee.department)).filter(Boolean),
      ...sessions.map((session) => compact(session.department)).filter(Boolean),
    ]),
  ).sort((a, b) => a.localeCompare(b));

  return {
    generatedAt,
    source: employeeSource?.source || (sqlSessions.length ? 'HRIS induction schedule' : 'Employee directory'),
    summary,
    kinds: INDUCTION_KINDS,
    departments: Array.from(new Set(sessions.map((session) => session.department).filter(Boolean))).sort(),
    allDepartments,
    facilitators: Array.from(new Set(sessions.map((session) => session.facilitator).filter(Boolean))).sort(),
    employeeOptions,
    sessions,
  };
};

export const upsertInductionSession = async (input: InductionUpsertInput) => {
  const kind = normalizeKind(input.kind);
  const scheduledFor = parseDate(input.scheduledFor)?.toISOString() || nowIso();
  const status = normalizeStatus(input.status, scheduledFor);
  const stamp = nowIso();
  const id = compact(input.id) || `IND-${compact(input.employeeCode).toUpperCase()}-${kind}-${Date.now()}`;

  const session: InductionSession = {
    id,
    employeeDbId: input.employeeDbId ?? null,
    employeeCode: compact(input.employeeCode),
    employeeName: compact(input.employeeName) || compact(input.employeeCode),
    department: compact(input.department) || 'Unassigned',
    jobTitle: compact(input.jobTitle) || '—',
    location: compact(input.location) || '—',
    kind,
    status,
    scheduledFor,
    facilitator: compact(input.facilitator) || FACILITATOR_BY_KIND[kind],
    venue: compact(input.venue),
    notes: compact(input.notes),
    source: 'sql',
    createdAt: stamp,
    updatedAt: stamp,
    updatedBy: compact(input.actor) || 'HR User',
  };

  if (!(await persistSqlSession(session))) {
    const state = await readJsonStore();
    const next = {
      sessions: [
        { ...session, source: 'json' as const },
        ...state.sessions.filter((item) => item.id !== session.id && sessionKey(item) !== sessionKey(session)),
      ],
    };
    await writeJsonStore(next);
    session.source = 'json';
  } else {
    // Keep JSON mirror warm.
    try {
      const state = await readJsonStore();
      await writeJsonStore({
        sessions: [{ ...session, source: 'json' }, ...state.sessions.filter((item) => item.id !== session.id)],
      });
    } catch {
      // ignore mirror failures
    }
  }

  return session;
};
