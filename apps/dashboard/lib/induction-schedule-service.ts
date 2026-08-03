import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sql from 'mssql';
import { getDleEnterpriseDbPool, type DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import { resolveEmployeeMailbox, sendTransactionalEmail } from '@/lib/mail-service';
import { buildDleEmail, formatEmailDateTime, resolveEmailLogoUrl } from '@/lib/email-templates';
import { readPayrollEmployees } from '@/lib/payroll-employee-source';
import { resolveWorkflowLinkOrigin } from '@/lib/public-app-url';

export type InductionStopStatus = 'Scheduled' | 'Completed' | 'Cancelled' | 'Overdue' | 'Needs Scheduling';
export type InductionTourStatus = 'Scheduled' | 'In Progress' | 'Completed' | 'Cancelled';

export type InductionStop = {
  stopId: string;
  tourId: string;
  department: string;
  sequence: number;
  scheduledFor: string;
  status: InductionStopStatus;
  facilitatorName: string;
  facilitatorEmail: string;
  facilitatorEmployeeCode: string;
  venue: string;
  notes: string;
  notifiedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
};

export type InductionTour = {
  tourId: string;
  hireName: string;
  hireEmail: string;
  employeeCode: string;
  employeeDbId: number | null;
  destinationDepartment: string;
  startDate: string;
  status: InductionTourStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  stops: InductionStop[];
  progressPct: number;
  completedStops: number;
  totalStops: number;
  overdueStops: number;
};

export type InductionFacilitatorOption = {
  employeeCode: string;
  fullName: string;
  email: string;
  department: string;
  jobTitle: string;
};

export type InductionEmployeeOption = {
  employeeDbId: number | null;
  employeeCode: string;
  employeeName: string;
  department: string;
  jobTitle: string;
  location: string;
  email: string;
};

export type InductionScheduleWorkspace = {
  generatedAt: string;
  source: string;
  summary: {
    activeTours: number;
    upcomingStops: number;
    thisWeekStops: number;
    completedStops: number;
    overdueStops: number;
  };
  allDepartments: string[];
  employeeOptions: InductionEmployeeOption[];
  facilitatorOptions: InductionFacilitatorOption[];
  tours: InductionTour[];
};

export type ScheduleInductionTourInput = {
  tourId?: string;
  hireName: string;
  hireEmail?: string;
  employeeCode?: string;
  employeeDbId?: number | null;
  destinationDepartment: string;
  startDate: string;
  notes?: string;
  departments: string[];
  stopOverrides?: Array<{
    department: string;
    scheduledFor?: string;
    facilitatorName?: string;
    facilitatorEmail?: string;
    facilitatorEmployeeCode?: string;
    venue?: string;
    notes?: string;
    status?: InductionStopStatus;
  }>;
  notifyManagers?: boolean;
  actor: string;
  baseUrl?: string | null;
};

type StoreState = { tours: InductionTour[] };

const resolveDashboardRoot = () => {
  const cwd = process.cwd();
  const dashboardSuffix = path.join('apps', 'dashboard');
  return cwd.endsWith(dashboardSuffix) ? cwd : path.join(cwd, dashboardSuffix);
};

const DATA_DIR = path.join(resolveDashboardRoot(), 'data', 'hris');
const JSON_PATH = path.join(DATA_DIR, 'onboarding-induction-tours.json');
const nowIso = () => new Date().toISOString();
const compact = (value: unknown) => String(value ?? '').trim();
const lower = (value: unknown) => compact(value).toLowerCase();

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

const normalizeStopStatus = (value: unknown, scheduledFor?: string | null): InductionStopStatus => {
  const status = lower(value);
  if (status.includes('complete')) return 'Completed';
  if (status.includes('cancel')) return 'Cancelled';
  if (status.includes('need')) return 'Needs Scheduling';
  const when = parseDate(scheduledFor);
  if (when && when < startOfDay(new Date()) && !status.includes('complete') && !status.includes('cancel')) return 'Overdue';
  if (status.includes('overdue')) return 'Overdue';
  return 'Scheduled';
};

const deriveTourStatus = (stops: InductionStop[]): InductionTourStatus => {
  if (!stops.length) return 'Scheduled';
  if (stops.every((stop) => stop.status === 'Cancelled')) return 'Cancelled';
  const actionable = stops.filter((stop) => stop.status !== 'Cancelled');
  if (actionable.length && actionable.every((stop) => stop.status === 'Completed')) return 'Completed';
  if (actionable.some((stop) => stop.status === 'Completed' || stop.status === 'Overdue' || stop.status === 'Scheduled')) {
    if (actionable.some((stop) => stop.status === 'Completed')) return 'In Progress';
  }
  return 'Scheduled';
};

const withTourMetrics = (tour: Omit<InductionTour, 'progressPct' | 'completedStops' | 'totalStops' | 'overdueStops' | 'status'> & { status?: InductionTourStatus; stops: InductionStop[] }): InductionTour => {
  const actionable = tour.stops.filter((stop) => stop.status !== 'Cancelled');
  const completedStops = actionable.filter((stop) => stop.status === 'Completed').length;
  const overdueStops = actionable.filter((stop) => stop.status === 'Overdue').length;
  const totalStops = actionable.length;
  return {
    ...tour,
    status: tour.status || deriveTourStatus(tour.stops),
    completedStops,
    totalStops,
    overdueStops,
    progressPct: totalStops ? Math.round((completedStops / totalStops) * 1000) / 10 : 0,
    stops: tour.stops
      .map((stop) => ({ ...stop, status: normalizeStopStatus(stop.status, stop.scheduledFor) }))
      .sort((a, b) => a.sequence - b.sequence || a.scheduledFor.localeCompare(b.scheduledFor)),
  };
};

const ensureSchema = async (pool: sql.ConnectionPool) => {
  if (schemaReady) return;
  await pool.request().query(`
IF OBJECT_ID(N'[hris].[OnboardingInductionTours]', N'U') IS NULL
CREATE TABLE [hris].[OnboardingInductionTours] (
  [tour_id] NVARCHAR(80) NOT NULL PRIMARY KEY,
  [tour_json] NVARCHAR(MAX) NOT NULL,
  [hire_name] NVARCHAR(250) NOT NULL,
  [employee_code] NVARCHAR(50) NULL,
  [destination_department] NVARCHAR(150) NULL,
  [start_date] DATE NULL,
  [tour_status] NVARCHAR(40) NOT NULL,
  [created_at] DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
  [updated_at] DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
  [created_by] NVARCHAR(120) NULL
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_OnboardingInductionTours_Status' AND object_id = OBJECT_ID(N'[hris].[OnboardingInductionTours]'))
  CREATE INDEX [IX_OnboardingInductionTours_Status] ON [hris].[OnboardingInductionTours] ([tour_status], [start_date]);
`);
  schemaReady = true;
};

const emptyStore = (): StoreState => ({ tours: [] });

const readJsonStore = async (): Promise<StoreState> => {
  try {
    await access(JSON_PATH);
    const raw = await readFile(JSON_PATH, 'utf8');
    const parsed = JSON.parse(raw) as StoreState;
    return { tours: Array.isArray(parsed.tours) ? parsed.tours.map((tour) => withTourMetrics(tour)) : [] };
  } catch {
    return emptyStore();
  }
};

const writeJsonStore = async (state: StoreState) => {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(JSON_PATH, JSON.stringify(state, null, 2), 'utf8');
};

const readSqlTours = async (): Promise<InductionTour[]> => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) return [];
  try {
    await ensureSchema(pool);
    const result = await pool.request().query(`SELECT [tour_json] FROM [hris].[OnboardingInductionTours]`);
    return (result.recordset || [])
      .map((row: { tour_json?: string }) => {
        try {
          return withTourMetrics(JSON.parse(String(row.tour_json || '{}')) as InductionTour);
        } catch {
          return null;
        }
      })
      .filter((tour): tour is InductionTour => Boolean(tour?.tourId));
  } catch {
    return [];
  }
};

const persistSqlTour = async (tour: InductionTour) => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) return false;
  await ensureSchema(pool);
  await pool.request()
    .input('tour_id', sql.NVarChar(80), tour.tourId)
    .input('tour_json', sql.NVarChar(sql.MAX), JSON.stringify(tour))
    .input('hire_name', sql.NVarChar(250), tour.hireName)
    .input('employee_code', sql.NVarChar(50), tour.employeeCode || null)
    .input('destination_department', sql.NVarChar(150), tour.destinationDepartment || null)
    .input('start_date', sql.Date, tour.startDate ? new Date(tour.startDate) : null)
    .input('tour_status', sql.NVarChar(40), tour.status)
    .input('created_by', sql.NVarChar(120), tour.createdBy || null)
    .query(`
MERGE [hris].[OnboardingInductionTours] AS target
USING (SELECT @tour_id AS tour_id) AS source
ON target.tour_id = source.tour_id
WHEN MATCHED THEN UPDATE SET
  tour_json = @tour_json,
  hire_name = @hire_name,
  employee_code = @employee_code,
  destination_department = @destination_department,
  start_date = @start_date,
  tour_status = @tour_status,
  updated_at = SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT (
  tour_id, tour_json, hire_name, employee_code, destination_department, start_date, tour_status, created_by
) VALUES (
  @tour_id, @tour_json, @hire_name, @employee_code, @destination_department, @start_date, @tour_status, @created_by
);
`);
  return true;
};

const saveTour = async (tour: InductionTour) => {
  const next = withTourMetrics(tour);
  const savedToSql = await persistSqlTour(next).catch(() => false);
  const state = await readJsonStore();
  await writeJsonStore({
    tours: [next, ...state.tours.filter((item) => item.tourId !== next.tourId)],
  });
  return { tour: next, savedToSql };
};

const isActiveEmployment = (employee: DleEmployeeDirectoryRow) => {
  const status = lower(employee.status);
  if (!status) return true;
  return !/(terminat|resign|exit|inactive|dismiss|deceased|left)/.test(status);
};

const looksLikeManager = (employee: DleEmployeeDirectoryRow) =>
  /head|manager|supervisor|lead|chief/i.test(`${employee.jobTitle || ''} ${employee.designation || ''}`);

export const resolveDepartmentFacilitator = (
  department: string,
  employees: DleEmployeeDirectoryRow[],
): InductionFacilitatorOption => {
  const dept = compact(department);
  const inDept = employees.filter((employee) => isActiveEmployment(employee) && compact(employee.department) === dept);
  const headNames = new Set(
    inDept.map((employee) => compact(employee.departmentHead)).filter(Boolean).map((name) => lower(name)),
  );
  const namedHead = inDept.find((employee) => headNames.has(lower(employee.fullName)));
  const titledManager = inDept.find((employee) => looksLikeManager(employee));
  const anyInDept = inDept[0];
  const chosen = namedHead || titledManager || anyInDept;
  if (!chosen) {
    return {
      employeeCode: '',
      fullName: `${dept || 'Department'} Line Manager`,
      email: '',
      department: dept || 'Unassigned',
      jobTitle: 'Line Manager',
    };
  }
  return {
    employeeCode: chosen.employeeCode,
    fullName: chosen.fullName,
    email: compact(chosen.officialEmail || chosen.email),
    department: chosen.department || dept,
    jobTitle: chosen.jobTitle || 'Line Manager',
  };
};

const buildInductionManagerEmail = (input: {
  recipientName: string;
  hireName: string;
  department: string;
  scheduledFor: string;
  venue: string;
  destinationDepartment: string;
  actorName: string;
  portalLink: string;
  baseUrl?: string | null;
}) => buildDleEmail({
  logoUrl: resolveEmailLogoUrl(input.baseUrl),
  module: 'HRIS',
  subject: `Induction scheduled — ${input.hireName} · ${input.department}`,
  preheader: `Please host the ${input.department} induction for ${input.hireName}.`,
  headline: 'Department induction assigned to you',
  recipientName: input.recipientName,
  intro: `${input.actorName} scheduled a department induction stop for a new hire. Please host the session and mark it complete in DLE Connect when done.`,
  statusBadge: 'Induction Schedule',
  tone: 'info',
  details: [
    { label: 'New hire', value: input.hireName },
    { label: 'Joining department', value: input.destinationDepartment || '—' },
    { label: 'Your department stop', value: input.department },
    { label: 'When', value: formatEmailDateTime(input.scheduledFor) },
    { label: 'Venue', value: input.venue || 'To be confirmed' },
  ],
  note: 'The new hire may still be in pre-boarding and not yet fully registered. Your assignment is valid based on this HR schedule.',
  actions: [{ href: input.portalLink, label: 'Open Induction Schedule', tone: 'primary' }],
  footerNote: 'This message was sent by DLE Connect HRIS Onboarding.',
});

const notifyStopFacilitator = async (input: {
  stop: InductionStop;
  tour: InductionTour;
  actor: string;
  baseUrl?: string | null;
  employees: DleEmployeeDirectoryRow[];
}) => {
  let email = compact(input.stop.facilitatorEmail);
  if (!email && input.stop.facilitatorEmployeeCode) {
    const employee = input.employees.find(
      (row) => lower(row.employeeCode) === lower(input.stop.facilitatorEmployeeCode),
    );
    email = compact(await resolveEmployeeMailbox(employee).catch(() => employee?.officialEmail || employee?.email || ''));
  }
  if (!email) {
    return { sent: false, reason: 'No facilitator email on file.', email: '' };
  }
  const portalLink = `${resolveWorkflowLinkOrigin(input.baseUrl)}/hris/onboarding/induction-schedule`;
  const built = buildInductionManagerEmail({
    recipientName: input.stop.facilitatorName || 'Line Manager',
    hireName: input.tour.hireName,
    department: input.stop.department,
    scheduledFor: input.stop.scheduledFor,
    venue: input.stop.venue,
    destinationDepartment: input.tour.destinationDepartment,
    actorName: input.actor,
    portalLink,
    baseUrl: input.baseUrl,
  });
  const result = await sendTransactionalEmail({
    to: email,
    subject: built.subject,
    text: built.text,
    html: built.html,
  });
  return { ...result, email };
};

const listUniqueDepartments = (employees: DleEmployeeDirectoryRow[]) =>
  Array.from(
    new Set(
      employees
        .filter((employee) => isActiveEmployment(employee))
        .map((employee) => compact(employee.department))
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b));

const defaultStopSchedule = (startDate: string, index: number) => {
  const base = parseDate(startDate) || new Date();
  const scheduled = new Date(base.getTime() + index * 86400000);
  scheduled.setHours(10, 0, 0, 0);
  return scheduled.toISOString();
};

export const buildInductionScheduleWorkspace = async (): Promise<InductionScheduleWorkspace> => {
  const generatedAt = nowIso();
  const employeeSource = await readPayrollEmployees().catch(() => null);
  const employees = employeeSource?.employees || [];
  const sqlTours = await readSqlTours();
  const jsonTours = (await readJsonStore()).tours;
  const byId = new Map<string, InductionTour>();
  for (const tour of jsonTours) byId.set(tour.tourId, withTourMetrics(tour));
  for (const tour of sqlTours) byId.set(tour.tourId, withTourMetrics(tour));
  const tours = [...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const now = new Date();
  const weekEnd = endOfWeek(now);
  const allStops = tours.flatMap((tour) => tour.stops);
  const summary = {
    activeTours: tours.filter((tour) => tour.status === 'Scheduled' || tour.status === 'In Progress').length,
    upcomingStops: allStops.filter((stop) => stop.status === 'Scheduled').length,
    thisWeekStops: allStops.filter((stop) => {
      const when = parseDate(stop.scheduledFor);
      return Boolean(when && when >= startOfDay(now) && when <= weekEnd && stop.status !== 'Cancelled' && stop.status !== 'Completed');
    }).length,
    completedStops: allStops.filter((stop) => stop.status === 'Completed').length,
    overdueStops: allStops.filter((stop) => stop.status === 'Overdue').length,
  };

  const allDepartments = listUniqueDepartments(employees);
  const employeeOptions: InductionEmployeeOption[] = employees
    .filter((employee) => isActiveEmployment(employee) && compact(employee.employeeCode))
    .map((employee) => ({
      employeeDbId: employee.employeeDbId || null,
      employeeCode: employee.employeeCode,
      employeeName: employee.fullName,
      department: employee.department || 'Unassigned',
      jobTitle: employee.jobTitle || '—',
      location: employee.location || employee.workLocation || '—',
      email: compact(employee.officialEmail || employee.email),
    }))
    .sort((a, b) => a.employeeCode.localeCompare(b.employeeCode));

  const facilitatorOptions: InductionFacilitatorOption[] = employees
    .filter((employee) => isActiveEmployment(employee) && (looksLikeManager(employee) || compact(employee.departmentHead)))
    .map((employee) => ({
      employeeCode: employee.employeeCode,
      fullName: employee.fullName,
      email: compact(employee.officialEmail || employee.email),
      department: employee.department || 'Unassigned',
      jobTitle: employee.jobTitle || '—',
    }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));

  // Ensure department heads appear even if title doesn't match manager pattern.
  for (const department of allDepartments) {
    const resolved = resolveDepartmentFacilitator(department, employees);
    if (resolved.employeeCode && !facilitatorOptions.some((item) => item.employeeCode === resolved.employeeCode)) {
      facilitatorOptions.push(resolved);
    }
  }

  return {
    generatedAt,
    source: employeeSource?.source || (sqlTours.length ? 'HRIS induction tours' : 'Employee directory'),
    summary,
    allDepartments,
    employeeOptions,
    facilitatorOptions: facilitatorOptions.sort((a, b) => a.fullName.localeCompare(b.fullName)),
    tours,
  };
};

export const scheduleInductionTour = async (input: ScheduleInductionTourInput) => {
  const hireName = compact(input.hireName);
  const destinationDepartment = compact(input.destinationDepartment);
  const startDate = compact(input.startDate);
  const departments = Array.from(new Set((input.departments || []).map(compact).filter(Boolean)));
  if (!hireName) throw new Error('New hire name is required.');
  if (!destinationDepartment) throw new Error('Destination department is required.');
  if (!startDate) throw new Error('Induction start date is required.');
  if (!departments.length) throw new Error('Select at least one department for the induction tour.');

  const employeeSource = await readPayrollEmployees().catch(() => null);
  const employees = employeeSource?.employees || [];
  const stamp = nowIso();
  const tourId = compact(input.tourId) || `TOUR-${Date.now()}`;
  const overrides = new Map(
    (input.stopOverrides || []).map((item) => [compact(item.department), item] as const),
  );

  const existing = (await buildInductionScheduleWorkspace()).tours.find((tour) => tour.tourId === tourId);
  const stops: InductionStop[] = departments.map((department, index) => {
    const override = overrides.get(department);
    const inferred = resolveDepartmentFacilitator(department, employees);
    const scheduledFor = override?.scheduledFor
      || existing?.stops.find((stop) => stop.department === department)?.scheduledFor
      || defaultStopSchedule(startDate, index);
    const facilitatorName = compact(override?.facilitatorName) || inferred.fullName;
    const facilitatorEmail = compact(override?.facilitatorEmail) || inferred.email;
    const facilitatorEmployeeCode = compact(override?.facilitatorEmployeeCode) || inferred.employeeCode;
    const existingStop = existing?.stops.find((stop) => stop.department === department);
    return {
      stopId: existingStop?.stopId || `STOP-${tourId}-${index + 1}`,
      tourId,
      department,
      sequence: index + 1,
      scheduledFor,
      status: normalizeStopStatus(override?.status || existingStop?.status || 'Scheduled', scheduledFor),
      facilitatorName,
      facilitatorEmail,
      facilitatorEmployeeCode,
      venue: compact(override?.venue) || existingStop?.venue || `${department} Office`,
      notes: compact(override?.notes) || existingStop?.notes || '',
      notifiedAt: existingStop?.notifiedAt || null,
      completedAt: existingStop?.completedAt || null,
      updatedAt: stamp,
    };
  });

  const tour = withTourMetrics({
    tourId,
    hireName,
    hireEmail: compact(input.hireEmail),
    employeeCode: compact(input.employeeCode),
    employeeDbId: input.employeeDbId ?? null,
    destinationDepartment,
    startDate,
    notes: compact(input.notes),
    createdAt: existing?.createdAt || stamp,
    updatedAt: stamp,
    createdBy: existing?.createdBy || compact(input.actor) || 'HR User',
    stops,
  });

  const saved = await saveTour(tour);
  const notifyManagers = input.notifyManagers !== false;
  const notifications: Array<{ department: string; email: string; sent: boolean; reason?: string }> = [];
  if (notifyManagers) {
    for (const stop of saved.tour.stops) {
      if (stop.status === 'Cancelled' || stop.status === 'Completed') continue;
      const result = await notifyStopFacilitator({
        stop,
        tour: saved.tour,
        actor: input.actor,
        baseUrl: input.baseUrl,
        employees,
      });
      notifications.push({
        department: stop.department,
        email: result.email || stop.facilitatorEmail,
        sent: Boolean(result.sent),
        reason: result.reason,
      });
      if (result.sent) {
        stop.notifiedAt = nowIso();
        stop.updatedAt = nowIso();
      }
    }
    await saveTour({ ...saved.tour, stops: saved.tour.stops, updatedAt: nowIso() });
  }

  const workspace = await buildInductionScheduleWorkspace();
  return {
    tour: workspace.tours.find((item) => item.tourId === tourId) || saved.tour,
    workspace,
    notifications,
    notifiedCount: notifications.filter((item) => item.sent).length,
  };
};

export const updateInductionStop = async (input: {
  tourId: string;
  stopId: string;
  status?: InductionStopStatus;
  scheduledFor?: string;
  facilitatorName?: string;
  facilitatorEmail?: string;
  facilitatorEmployeeCode?: string;
  venue?: string;
  notes?: string;
  notifyManager?: boolean;
  actor: string;
  baseUrl?: string | null;
}) => {
  const workspace = await buildInductionScheduleWorkspace();
  const tour = workspace.tours.find((item) => item.tourId === input.tourId);
  if (!tour) throw new Error('Induction tour not found.');
  const stop = tour.stops.find((item) => item.stopId === input.stopId);
  if (!stop) throw new Error('Induction stop not found.');

  const scheduledFor = input.scheduledFor || stop.scheduledFor;
  const nextStop: InductionStop = {
    ...stop,
    scheduledFor,
    status: normalizeStopStatus(input.status || stop.status, scheduledFor),
    facilitatorName: compact(input.facilitatorName) || stop.facilitatorName,
    facilitatorEmail: compact(input.facilitatorEmail) || stop.facilitatorEmail,
    facilitatorEmployeeCode: compact(input.facilitatorEmployeeCode) || stop.facilitatorEmployeeCode,
    venue: compact(input.venue) || stop.venue,
    notes: input.notes == null ? stop.notes : compact(input.notes),
    completedAt: normalizeStopStatus(input.status || stop.status, scheduledFor) === 'Completed' ? nowIso() : stop.completedAt,
    updatedAt: nowIso(),
  };

  const nextTour = withTourMetrics({
    ...tour,
    stops: tour.stops.map((item) => (item.stopId === stop.stopId ? nextStop : item)),
    updatedAt: nowIso(),
  });

  await saveTour(nextTour);

  let notification: { sent: boolean; email: string; reason?: string } | null = null;
  if (input.notifyManager) {
    const employees = (await readPayrollEmployees().catch(() => null))?.employees || [];
    const result = await notifyStopFacilitator({
      stop: nextStop,
      tour: nextTour,
      actor: input.actor,
      baseUrl: input.baseUrl,
      employees,
    });
    notification = { sent: Boolean(result.sent), email: result.email || nextStop.facilitatorEmail, reason: result.reason };
    if (result.sent) {
      nextStop.notifiedAt = nowIso();
      await saveTour({
        ...nextTour,
        stops: nextTour.stops.map((item) => (item.stopId === nextStop.stopId ? nextStop : item)),
        updatedAt: nowIso(),
      });
    }
  }

  const refreshed = await buildInductionScheduleWorkspace();
  return {
    tour: refreshed.tours.find((item) => item.tourId === input.tourId) || nextTour,
    workspace: refreshed,
    notification,
  };
};

export const previewDepartmentStops = async (input: {
  departments?: string[];
  startDate: string;
}) => {
  const employeeSource = await readPayrollEmployees().catch(() => null);
  const employees = employeeSource?.employees || [];
  const departments = (input.departments?.length ? input.departments : listUniqueDepartments(employees)).map(compact).filter(Boolean);
  return departments.map((department, index) => {
    const facilitator = resolveDepartmentFacilitator(department, employees);
    return {
      department,
      sequence: index + 1,
      scheduledFor: defaultStopSchedule(input.startDate || nowIso(), index),
      facilitatorName: facilitator.fullName,
      facilitatorEmail: facilitator.email,
      facilitatorEmployeeCode: facilitator.employeeCode,
      venue: `${department} Office`,
    };
  });
};
