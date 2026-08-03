import sql from 'mssql';
import { getDleEnterpriseDbPool, type DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import { readPayrollEmployees } from '@/lib/payroll-employee-source';

export type ChecklistTaskStatus = 'Pending' | 'In Progress' | 'Completed' | 'Blocked' | 'Overdue';

export type NewHireChecklistTemplateItem = {
  id: string;
  title: string;
  responsibleOfficer: string;
  category: string;
};

export type NewHireChecklistTask = {
  id: string;
  externalId: string;
  title: string;
  status: ChecklistTaskStatus;
  responsibleOfficer: string;
  dueDate: string | null;
  notes: string;
  category: string;
  source: 'sql' | 'inferred';
};

export type NewHireChecklistEmployeeRow = {
  employeeId: string;
  employeeDbId: number | null;
  employeeCode: string;
  employeeName: string;
  department: string;
  jobTitle: string;
  location: string;
  dateJoined: string | null;
  employmentStatus: string;
  progressPct: number;
  completedCount: number;
  pendingCount: number;
  overdueCount: number;
  blockedCount: number;
  tasks: NewHireChecklistTask[];
};

export type NewHireChecklistWorkspace = {
  generatedAt: string;
  source: string;
  template: NewHireChecklistTemplateItem[];
  summary: {
    newHires: number;
    openTasks: number;
    completedTasks: number;
    overdueTasks: number;
    avgProgressPct: number;
  };
  officers: string[];
  departments: string[];
  rows: NewHireChecklistEmployeeRow[];
};

export const NEW_HIRE_CHECKLIST_TEMPLATE: NewHireChecklistTemplateItem[] = [
  { id: 'chk-1', title: 'HR profile completed', responsibleOfficer: 'HR Officer', category: 'HR' },
  { id: 'chk-2', title: 'Employment letter issued', responsibleOfficer: 'HR Officer', category: 'HR' },
  { id: 'chk-3', title: 'Documents verified', responsibleOfficer: 'Compliance Officer', category: 'Compliance' },
  { id: 'chk-4', title: 'Payroll setup completed', responsibleOfficer: 'Payroll Officer', category: 'Payroll' },
  { id: 'chk-5', title: 'Email account requested', responsibleOfficer: 'IT Administrator', category: 'IT' },
  { id: 'chk-6', title: 'Laptop requested', responsibleOfficer: 'IT Administrator', category: 'IT' },
  { id: 'chk-7', title: 'Access card requested', responsibleOfficer: 'Admin Officer', category: 'Admin' },
  { id: 'chk-8', title: 'PPE requested', responsibleOfficer: 'HSE Officer', category: 'HSE' },
  { id: 'chk-9', title: 'Department induction scheduled', responsibleOfficer: 'Department Head', category: 'Induction' },
  { id: 'chk-10', title: 'HSE induction scheduled', responsibleOfficer: 'HSE Officer', category: 'HSE' },
  { id: 'chk-11', title: 'IT onboarding scheduled', responsibleOfficer: 'IT Administrator', category: 'IT' },
  { id: 'chk-12', title: 'Line manager assigned', responsibleOfficer: 'HR Officer', category: 'HR' },
  { id: 'chk-13', title: 'Probation tracker created', responsibleOfficer: 'HR Officer', category: 'HR' },
  { id: 'chk-14', title: 'Leave entitlement initialized', responsibleOfficer: 'HR Officer', category: 'HR' },
];

const compact = (value: unknown) => String(value ?? '').trim();
const lower = (value: unknown) => compact(value).toLowerCase();

const parseDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const normalizeStatus = (value: unknown, dueDate?: string | null): ChecklistTaskStatus => {
  const status = lower(value);
  if (status.includes('complete') || status === 'done') return 'Completed';
  if (status.includes('block') || status.includes('hold')) return 'Blocked';
  if (status.includes('progress')) return 'In Progress';
  const due = parseDate(dueDate);
  if (due && due < startOfDay(new Date()) && !status.includes('complete')) return 'Overdue';
  if (status.includes('overdue')) return 'Overdue';
  return 'Pending';
};

const isActiveEmployment = (employee: DleEmployeeDirectoryRow) => {
  const status = lower(employee.status);
  if (!status) return true;
  return !/(terminat|resign|exit|inactive|dismiss|deceased|left)/.test(status);
};

const isNewHireCohort = (employee: DleEmployeeDirectoryRow, now = new Date()) => {
  if (!isActiveEmployment(employee)) return false;
  const status = lower(employee.status);
  if (status.includes('probation')) return true;
  const joined = parseDate(employee.dateJoined);
  if (joined) {
    const days = Math.round((startOfDay(now).getTime() - startOfDay(joined).getTime()) / 86400000);
    if (days >= 0 && days <= 120) return true;
  }
  const probationEnd = parseDate(employee.probationEndDate);
  if (probationEnd && probationEnd >= startOfDay(now)) return true;
  return false;
};

const inferTaskStatus = (templateId: string, employee: DleEmployeeDirectoryRow): ChecklistTaskStatus => {
  switch (templateId) {
    case 'chk-1':
      return compact(employee.officialEmail || employee.email) && compact(employee.dateJoined) ? 'Completed' : 'Pending';
    case 'chk-3':
      return (employee.documentCount || 0) > 0 ? 'Completed' : employee.emergencyContactsComplete ? 'In Progress' : 'Pending';
    case 'chk-4':
      return compact(employee.bankName) && compact(employee.accountNo) ? 'Completed' : employee.setupAssignedToPayroll ? 'In Progress' : 'Pending';
    case 'chk-5':
      return compact(employee.officialEmail || employee.email) ? 'Completed' : 'Pending';
    case 'chk-12':
      return employee.hasManagerAssigned ? 'Completed' : 'Pending';
    case 'chk-13':
      return compact(employee.probationStartDate || employee.probationEndDate || employee.confirmationDueDate) ? 'Completed' : 'Pending';
    case 'chk-14':
      return Number(employee.yearsOfService || 0) >= 0 && compact(employee.dateJoined) ? 'In Progress' : 'Pending';
    default:
      return 'Pending';
  }
};

type SqlChecklistRow = {
  checklist_id?: number | string;
  employee_id?: number;
  employee_code?: string;
  full_name?: string;
  department?: string;
  job_title?: string;
  location?: string;
  date_joined?: string | Date | null;
  employment_status?: string;
  external_checklist_id?: string;
  title?: string;
  checklist_status?: string;
  responsible_officer?: string;
  due_date?: string | Date | null;
  notes?: string;
};

const isoDate = (value: unknown) => {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const parsed = parseDate(String(value));
  return parsed ? parsed.toISOString().slice(0, 10) : compact(value) || null;
};

const readSqlChecklistRows = async (): Promise<SqlChecklistRow[]> => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) return [];
  try {
    const result = await pool.request().query(`
IF OBJECT_ID(N'[hris].[EmployeeOnboardingChecklist]', N'U') IS NULL
BEGIN
  SELECT CAST(NULL AS bigint) AS checklist_id WHERE 1 = 0;
END
ELSE
BEGIN
  SELECT
    c.checklist_id,
    c.employee_id,
    e.employee_code,
    c.external_checklist_id,
    c.title,
    c.checklist_status,
    c.responsible_officer,
    c.due_date,
    c.notes
  FROM [hris].[EmployeeOnboardingChecklist] c
  INNER JOIN [hris].[Employees] e ON e.employee_id = c.employee_id
  ORDER BY e.employee_code, c.checklist_id;
END
`);
    return (result.recordset || []) as SqlChecklistRow[];
  } catch {
    return [];
  }
};

const buildRowFromTasks = (input: {
  employeeId: string;
  employeeDbId: number | null;
  employeeCode: string;
  employeeName: string;
  department: string;
  jobTitle: string;
  location: string;
  dateJoined: string | null;
  employmentStatus: string;
  tasks: NewHireChecklistTask[];
}): NewHireChecklistEmployeeRow => {
  const completedCount = input.tasks.filter((task) => task.status === 'Completed').length;
  const overdueCount = input.tasks.filter((task) => task.status === 'Overdue').length;
  const blockedCount = input.tasks.filter((task) => task.status === 'Blocked').length;
  const pendingCount = input.tasks.filter((task) => task.status === 'Pending' || task.status === 'In Progress').length;
  const progressPct = input.tasks.length
    ? Math.round((completedCount / input.tasks.length) * 1000) / 10
    : 0;
  return {
    ...input,
    progressPct,
    completedCount,
    pendingCount,
    overdueCount,
    blockedCount,
  };
};

const inferTasksForEmployee = (employee: DleEmployeeDirectoryRow): NewHireChecklistTask[] =>
  NEW_HIRE_CHECKLIST_TEMPLATE.map((item) => {
    const joined = parseDate(employee.dateJoined);
    const dueDate = joined
      ? new Date(joined.getTime() + 14 * 86400000).toISOString().slice(0, 10)
      : null;
    return {
      id: `${employee.employeeCode}-${item.id}`,
      externalId: item.id,
      title: item.title,
      status: normalizeStatus(inferTaskStatus(item.id, employee), dueDate),
      responsibleOfficer: item.responsibleOfficer,
      dueDate,
      notes: '',
      category: item.category,
      source: 'inferred' as const,
    };
  });

export const buildNewHireChecklistWorkspace = async (): Promise<NewHireChecklistWorkspace> => {
  const generatedAt = new Date().toISOString();
  const employeeSource = await readPayrollEmployees().catch(() => null);
  const allEmployees = employeeSource?.employees || [];
  const cohort = allEmployees.filter((employee) => isNewHireCohort(employee));
  const sqlRows = await readSqlChecklistRows();
  const byCode = new Map(allEmployees.map((employee) => [compact(employee.employeeCode).toUpperCase(), employee] as const));

  const sqlByEmployee = new Map<string, SqlChecklistRow[]>();
  for (const row of sqlRows) {
    const code = compact(row.employee_code).toUpperCase();
    if (!code) continue;
    const list = sqlByEmployee.get(code) || [];
    list.push(row);
    sqlByEmployee.set(code, list);
  }

  const rows: NewHireChecklistEmployeeRow[] = [];
  const seen = new Set<string>();

  for (const [code, checklistRows] of sqlByEmployee.entries()) {
    seen.add(code);
    const first = checklistRows[0];
    const directory = byCode.get(code);
    const tasks: NewHireChecklistTask[] = checklistRows.map((row) => {
      const externalId = compact(row.external_checklist_id) || `sql-${row.checklist_id}`;
      const template = NEW_HIRE_CHECKLIST_TEMPLATE.find((item) => item.id === externalId);
      const dueDate = isoDate(row.due_date);
      return {
        id: String(row.checklist_id || `${code}-${externalId}`),
        externalId,
        title: compact(row.title) || template?.title || 'Onboarding task',
        status: normalizeStatus(row.checklist_status, dueDate),
        responsibleOfficer: compact(row.responsible_officer) || template?.responsibleOfficer || 'HR Officer',
        dueDate,
        notes: compact(row.notes),
        category: template?.category || 'General',
        source: 'sql',
      };
    });

    for (const template of NEW_HIRE_CHECKLIST_TEMPLATE) {
      if (tasks.some((task) => task.externalId === template.id)) continue;
      const inferred = directory ? inferTaskStatus(template.id, directory) : 'Pending';
      const dueDate = directory?.dateJoined
        ? (() => {
            const joined = parseDate(directory.dateJoined);
            return joined ? new Date(joined.getTime() + 14 * 86400000).toISOString().slice(0, 10) : null;
          })()
        : null;
      tasks.push({
        id: `${code}-${template.id}`,
        externalId: template.id,
        title: template.title,
        status: normalizeStatus(inferred, dueDate),
        responsibleOfficer: template.responsibleOfficer,
        dueDate,
        notes: '',
        category: template.category,
        source: 'inferred',
      });
    }

    rows.push(
      buildRowFromTasks({
        employeeId: directory?.employeeId || code,
        employeeDbId: directory?.employeeDbId || Number(first.employee_id) || null,
        employeeCode: directory?.employeeCode || code,
        employeeName: directory?.fullName || code,
        department: directory?.department || 'Unassigned',
        jobTitle: directory?.jobTitle || '—',
        location: directory?.location || directory?.workLocation || '—',
        dateJoined: directory?.dateJoined || null,
        employmentStatus: directory?.status || 'Active',
        tasks,
      }),
    );
  }

  for (const employee of cohort) {
    const code = compact(employee.employeeCode).toUpperCase();
    if (!code || seen.has(code)) continue;
    rows.push(
      buildRowFromTasks({
        employeeId: employee.employeeId,
        employeeDbId: employee.employeeDbId || null,
        employeeCode: employee.employeeCode,
        employeeName: employee.fullName,
        department: employee.department || 'Unassigned',
        jobTitle: employee.jobTitle || '—',
        location: employee.location || employee.workLocation || '—',
        dateJoined: employee.dateJoined || null,
        employmentStatus: employee.status || 'Active',
        tasks: inferTasksForEmployee(employee),
      }),
    );
  }

  rows.sort((a, b) => {
    if (b.overdueCount !== a.overdueCount) return b.overdueCount - a.overdueCount;
    if (a.progressPct !== b.progressPct) return a.progressPct - b.progressPct;
    return a.employeeName.localeCompare(b.employeeName);
  });

  const allTasks = rows.flatMap((row) => row.tasks);
  const summary = {
    newHires: rows.length,
    openTasks: allTasks.filter((task) => task.status === 'Pending' || task.status === 'In Progress' || task.status === 'Overdue' || task.status === 'Blocked').length,
    completedTasks: allTasks.filter((task) => task.status === 'Completed').length,
    overdueTasks: allTasks.filter((task) => task.status === 'Overdue').length,
    avgProgressPct: rows.length
      ? Math.round((rows.reduce((sum, row) => sum + row.progressPct, 0) / rows.length) * 10) / 10
      : 0,
  };

  return {
    generatedAt,
    source: employeeSource?.source || (sqlRows.length ? 'HRIS onboarding checklist' : 'Employee directory'),
    template: NEW_HIRE_CHECKLIST_TEMPLATE,
    summary,
    officers: Array.from(new Set(NEW_HIRE_CHECKLIST_TEMPLATE.map((item) => item.responsibleOfficer))).sort(),
    departments: Array.from(new Set(rows.map((row) => row.department).filter(Boolean))).sort(),
    rows,
  };
};

export const updateNewHireChecklistTask = async (input: {
  employeeDbId: number;
  externalId: string;
  title?: string;
  status: ChecklistTaskStatus;
  responsibleOfficer?: string;
  dueDate?: string | null;
  notes?: string | null;
  actor: string;
}) => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new Error('DLE_Enterprise database is not available for checklist updates.');

  const externalId = compact(input.externalId);
  const status = normalizeStatus(input.status);
  const title = compact(input.title) || NEW_HIRE_CHECKLIST_TEMPLATE.find((item) => item.id === externalId)?.title || 'Onboarding task';
  const officer =
    compact(input.responsibleOfficer)
    || NEW_HIRE_CHECKLIST_TEMPLATE.find((item) => item.id === externalId)?.responsibleOfficer
    || 'HR Officer';

  await pool.request()
    .input('employee_id', sql.BigInt, input.employeeDbId)
    .input('draft_id', sql.NVarChar(40), `manual-${input.employeeDbId}`)
    .input('external_checklist_id', sql.NVarChar(80), externalId)
    .input('title', sql.NVarChar(250), title)
    .input('checklist_status', sql.VarChar(30), status)
    .input('responsible_officer', sql.NVarChar(150), officer)
    .input('due_date', sql.Date, input.dueDate ? new Date(input.dueDate) : null)
    .input('notes', sql.NVarChar(1000), compact(input.notes) || null)
    .query(`
IF OBJECT_ID(N'[hris].[EmployeeOnboardingChecklist]', N'U') IS NULL
  THROW 50001, 'EmployeeOnboardingChecklist table is not available.', 1;

IF EXISTS (
  SELECT 1 FROM [hris].[EmployeeOnboardingChecklist]
  WHERE employee_id = @employee_id AND external_checklist_id = @external_checklist_id
)
BEGIN
  UPDATE [hris].[EmployeeOnboardingChecklist]
  SET title = @title,
      checklist_status = @checklist_status,
      responsible_officer = @responsible_officer,
      due_date = @due_date,
      notes = @notes
  WHERE employee_id = @employee_id AND external_checklist_id = @external_checklist_id;
END
ELSE
BEGIN
  INSERT [hris].[EmployeeOnboardingChecklist](
    employee_id, draft_id, external_checklist_id, title, checklist_status, responsible_officer, due_date, notes
  ) VALUES (
    @employee_id, @draft_id, @external_checklist_id, @title, @checklist_status, @responsible_officer, @due_date, @notes
  );
END
`);

  return { updated: true, actor: input.actor, status };
};
