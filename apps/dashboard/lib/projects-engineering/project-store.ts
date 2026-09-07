import { createHash, randomUUID } from 'crypto';
import type { Health, Project } from '@/lib/projects-engineering/types';
import { ensurePmDb, sql } from '@/lib/projects-engineering/db';
import type { ProjectCreateInput, ProjectUpdateInput } from '@/lib/projects-engineering/validators';
import {
  readProjects as readTimesheetProjects,
  upsertProject as upsertTimesheetProject,
  type Project as TimesheetProject,
} from '@/lib/timesheet-entry-store';

type PmRow = {
  ProjectId: string;
  ProjectCode: string;
  ProjectName: string;
  ProjectType: string;
  ClientName: string | null;
  BusinessUnit: string;
  ProjectManagerName: string | null;
  ProjectManagerEmployeeCode: string | null;
  ProjectManagerUsername: string | null;
  RegistryId: string | null;
  ContractValue: number;
  Currency: string;
  Location: string | null;
  PlannedStart: Date | string;
  PlannedFinish: Date | string;
  Phase: string | null;
  Status: string;
  Health: string;
  PlannedProgress: number;
  ActualProgress: number;
  SchedulePerformanceIndex: number | null;
  CostPerformanceIndex: number | null;
  Description: string | null;
  CreatedAt: Date | string;
};

const compact = (value: unknown) => String(value ?? '').trim();
const upper = (value: unknown) => compact(value).toUpperCase();

const actorGuid = (actor?: { username?: string; fullName?: string; sub?: string }) => {
  const seed = compact(actor?.sub || actor?.username || actor?.fullName || 'system');
  const hex = createHash('sha1').update(seed).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
};

const toDateOnly = (value: unknown, fallbackDays = 0) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const raw = compact(value);
  if (raw && !Number.isNaN(Date.parse(raw))) return new Date(raw).toISOString().slice(0, 10);
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + fallbackDays);
  return d.toISOString().slice(0, 10);
};

const asHealth = (value: unknown): Health => {
  const v = compact(value);
  if (v === 'Watch' || v === 'Critical') return v;
  return 'Healthy';
};

const phaseByType: Record<string, string> = {
  EPC: 'Initiation',
  ENGINEERING: 'Detailed Engineering',
  FABRICATION: 'Fabrication',
  CONSTRUCTION: 'Construction',
  MAINTENANCE: 'Maintenance',
};

const mapTimesheetStatusToBookable = (status: string) => {
  const s = compact(status);
  if (!s) return 'Active';
  return s;
};

const fromTimesheet = (row: TimesheetProject): Project => {
  const created = new Date();
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    client: row.clientName || 'Client TBD',
    manager: row.projectManager || 'Unassigned',
    managerEmployeeCode: '',
    contractValue: 0,
    currency: 'NGN',
    start: toDateOnly(created, 0),
    finish: toDateOnly(created, 365),
    planned: 0,
    actual: 0,
    costPerformance: 1,
    schedulePerformance: 1,
    phase: 'Execution',
    status: row.status || 'Active',
    health: 'Healthy',
    location: row.site || 'TBD',
    businessUnit: 'Projects & Engineering',
    description: `${row.name} — managed in Projects & Engineering.`,
    projectType: 'ENGINEERING',
    registryId: row.id,
    createdAt: new Date().toISOString(),
  };
};

const fromPmRow = (row: PmRow): Project => ({
  id: compact(row.RegistryId) || compact(row.ProjectCode).toLowerCase() || compact(row.ProjectId),
  code: row.ProjectCode,
  name: row.ProjectName,
  client: row.ClientName || 'Client TBD',
  manager: row.ProjectManagerName || 'Unassigned',
  managerEmployeeCode: row.ProjectManagerEmployeeCode || undefined,
  managerUsername: row.ProjectManagerUsername || undefined,
  contractValue: Number(row.ContractValue || 0),
  currency: row.Currency || 'NGN',
  start: toDateOnly(row.PlannedStart),
  finish: toDateOnly(row.PlannedFinish, 365),
  planned: Number(row.PlannedProgress || 0),
  actual: Number(row.ActualProgress || 0),
  costPerformance: Number(row.CostPerformanceIndex ?? 1),
  schedulePerformance: Number(row.SchedulePerformanceIndex ?? 1),
  phase: row.Phase || 'Execution',
  status: row.Status || 'Draft',
  health: asHealth(row.Health),
  location: row.Location || 'TBD',
  businessUnit: row.BusinessUnit || 'Projects & Engineering',
  description: row.Description || '',
  projectType: row.ProjectType || 'ENGINEERING',
  registryId: row.RegistryId || undefined,
  pmProjectId: compact(row.ProjectId) || undefined,
  createdAt: toDateOnly(row.CreatedAt),
});

const mergeProjects = (base: Project, overlay: Project): Project => ({
  ...base,
  ...overlay,
  id: base.id || overlay.id,
  registryId: base.registryId || overlay.registryId,
  pmProjectId: overlay.pmProjectId || base.pmProjectId,
  managerEmployeeCode: overlay.managerEmployeeCode || base.managerEmployeeCode,
  managerUsername: overlay.managerUsername || base.managerUsername,
  description: overlay.description || base.description,
});

const readPmRows = async (): Promise<PmRow[]> => {
  const pool = await ensurePmDb();
  const result = await pool.request().query(`
    SELECT
      CONVERT(nvarchar(36), [ProjectId]) AS [ProjectId],
      [ProjectCode], [ProjectName], [ProjectType], [ClientName], [BusinessUnit],
      [ProjectManagerName], [ProjectManagerEmployeeCode], [ProjectManagerUsername], [RegistryId],
      [ContractValue], [Currency], [Location], [PlannedStart], [PlannedFinish],
      [Phase], [Status], [Health], [PlannedProgress], [ActualProgress],
      [SchedulePerformanceIndex], [CostPerformanceIndex], [Description], [CreatedAt]
    FROM [pm].[Projects]
    WHERE [IsDeleted] = 0
    ORDER BY [ProjectCode]
  `);
  return result.recordset as PmRow[];
};

const upsertPmProfile = async (
  project: Project,
  actor: { username?: string; fullName?: string; sub?: string },
) => {
  const pool = await ensurePmDb();
  const createdBy = actorGuid(actor);
  await pool
    .request()
    .input('ProjectCode', sql.NVarChar(30), upper(project.code))
    .input('ProjectName', sql.NVarChar(200), project.name)
    .input('ProjectType', sql.NVarChar(30), upper(project.projectType || 'ENGINEERING'))
    .input('ClientName', sql.NVarChar(200), project.client || null)
    .input('BusinessUnit', sql.NVarChar(100), project.businessUnit || 'Projects & Engineering')
    .input('ProjectManagerName', sql.NVarChar(220), project.manager || null)
    .input('ProjectManagerEmployeeCode', sql.NVarChar(80), project.managerEmployeeCode || null)
    .input('ProjectManagerUsername', sql.NVarChar(120), project.managerUsername || null)
    .input('RegistryId', sql.NVarChar(80), project.registryId || project.id || null)
    .input('ContractValue', sql.Decimal(19, 4), Number(project.contractValue || 0))
    .input('Currency', sql.Char(3), (project.currency || 'NGN').slice(0, 3).toUpperCase())
    .input('Location', sql.NVarChar(200), project.location || null)
    .input('PlannedStart', sql.Date, project.start)
    .input('PlannedFinish', sql.Date, project.finish)
    .input('Phase', sql.NVarChar(50), project.phase || null)
    .input('Status', sql.NVarChar(30), project.status || 'Draft')
    .input('Health', sql.NVarChar(20), project.health || 'Healthy')
    .input('PlannedProgress', sql.Decimal(7, 3), Number(project.planned || 0))
    .input('ActualProgress', sql.Decimal(7, 3), Number(project.actual || 0))
    .input('SchedulePerformanceIndex', sql.Decimal(8, 4), Number(project.schedulePerformance || 1))
    .input('CostPerformanceIndex', sql.Decimal(8, 4), Number(project.costPerformance || 1))
    .input('Description', sql.NVarChar(sql.MAX), project.description || null)
    .input('CreatedBy', sql.UniqueIdentifier, createdBy)
    .input('ModifiedBy', sql.UniqueIdentifier, createdBy)
    .query(`
MERGE [pm].[Projects] AS target
USING (SELECT @ProjectCode AS [ProjectCode]) AS source
ON target.[ProjectCode] = source.[ProjectCode] AND target.[IsDeleted] = 0
WHEN MATCHED THEN UPDATE SET
  [ProjectName]=@ProjectName,
  [ProjectType]=@ProjectType,
  [ClientName]=@ClientName,
  [BusinessUnit]=@BusinessUnit,
  [ProjectManagerName]=@ProjectManagerName,
  [ProjectManagerEmployeeCode]=@ProjectManagerEmployeeCode,
  [ProjectManagerUsername]=@ProjectManagerUsername,
  [RegistryId]=@RegistryId,
  [ContractValue]=@ContractValue,
  [Currency]=@Currency,
  [Location]=@Location,
  [PlannedStart]=@PlannedStart,
  [PlannedFinish]=@PlannedFinish,
  [Phase]=@Phase,
  [Status]=@Status,
  [Health]=@Health,
  [PlannedProgress]=@PlannedProgress,
  [ActualProgress]=@ActualProgress,
  [SchedulePerformanceIndex]=@SchedulePerformanceIndex,
  [CostPerformanceIndex]=@CostPerformanceIndex,
  [Description]=@Description,
  [ModifiedBy]=@ModifiedBy,
  [ModifiedAt]=SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT (
  [ProjectCode],[ProjectName],[ProjectType],[ClientName],[BusinessUnit],
  [ProjectManagerName],[ProjectManagerEmployeeCode],[ProjectManagerUsername],[RegistryId],
  [ContractValue],[Currency],[Location],[PlannedStart],[PlannedFinish],
  [Phase],[Status],[Health],[PlannedProgress],[ActualProgress],
  [SchedulePerformanceIndex],[CostPerformanceIndex],[Description],[CreatedBy]
) VALUES (
  @ProjectCode,@ProjectName,@ProjectType,@ClientName,@BusinessUnit,
  @ProjectManagerName,@ProjectManagerEmployeeCode,@ProjectManagerUsername,@RegistryId,
  @ContractValue,@Currency,@Location,@PlannedStart,@PlannedFinish,
  @Phase,@Status,@Health,@PlannedProgress,@ActualProgress,
  @SchedulePerformanceIndex,@CostPerformanceIndex,@Description,@CreatedBy
);
`);
};

const syncTimesheet = async (project: Project) => {
  const registryId = project.registryId || project.id || `prj-${Date.now()}`;
  await upsertTimesheetProject({
    id: registryId,
    code: upper(project.code),
    name: project.name,
    clientName: project.client || 'Client TBD',
    site: project.location || 'TBD',
    projectManager: project.manager || '',
    status: mapTimesheetStatusToBookable(project.status) as TimesheetProject['status'],
    tasks: [{ id: `task-${registryId}`, name: 'General Project Work' }],
  });
  return registryId;
};

export const listAllProjects = async (): Promise<Project[]> => {
  const [timesheet, pmRows] = await Promise.all([
    readTimesheetProjects().catch(() => [] as TimesheetProject[]),
    readPmRows().catch(() => [] as PmRow[]),
  ]);

  const byCode = new Map<string, Project>();

  for (const row of timesheet) {
    const mapped = fromTimesheet(row);
    byCode.set(upper(mapped.code), mapped);
  }

  for (const row of pmRows) {
    const mapped = fromPmRow(row);
    const key = upper(mapped.code);
    const existing = byCode.get(key);
    byCode.set(key, existing ? mergeProjects(existing, mapped) : mapped);
  }

  return [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code));
};

export const getProjectById = async (id: string): Promise<Project | null> => {
  const needle = compact(id);
  if (!needle) return null;
  const all = await listAllProjects();
  return (
    all.find(
      (project) =>
        project.id === needle
        || project.registryId === needle
        || project.pmProjectId === needle
        || project.code.toLowerCase() === needle.toLowerCase(),
    ) || null
  );
};

export const createProjectRecord = async (
  input: ProjectCreateInput,
  actor: { username?: string; fullName?: string; sub?: string },
): Promise<Project> => {
  const all = await listAllProjects();
  if (all.some((project) => upper(project.code) === upper(input.code))) {
    throw new Error(`Project code ${input.code} already exists`);
  }

  const registryId = `prj-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const record: Project = {
    id: registryId,
    code: upper(input.code),
    name: input.name,
    client: input.clientName || 'Client TBD',
    manager: input.projectManagerName || 'Unassigned',
    managerEmployeeCode: input.projectManagerEmployeeCode || input.projectManagerId,
    managerEmployeeId: input.projectManagerId,
    managerUsername: input.projectManagerUsername,
    contractValue: input.contractValue,
    currency: input.currency,
    start: input.plannedStart.slice(0, 10),
    finish: input.plannedFinish.slice(0, 10),
    planned: 0,
    actual: 0,
    costPerformance: 1,
    schedulePerformance: 1,
    phase: phaseByType[input.projectType] || 'Draft',
    status: input.status || 'Draft',
    health: input.health || 'Healthy',
    location: input.location || 'TBD',
    businessUnit: input.businessUnit || 'Projects & Engineering',
    description: input.description,
    projectType: input.projectType,
    registryId,
    createdBy: actor.username || actor.fullName || 'system',
    createdAt: new Date().toISOString(),
  };

  const syncedId = await syncTimesheet(record);
  record.id = syncedId;
  record.registryId = syncedId;
  await upsertPmProfile(record, actor);
  return (await getProjectById(syncedId)) || record;
};

export const updateProjectRecord = async (
  id: string,
  input: ProjectUpdateInput,
  actor: { username?: string; fullName?: string; sub?: string },
): Promise<Project> => {
  const existing = await getProjectById(id);
  if (!existing) throw new Error('Project not found');

  if (input.code && upper(input.code) !== upper(existing.code)) {
    const all = await listAllProjects();
    if (all.some((project) => upper(project.code) === upper(input.code) && project.id !== existing.id)) {
      throw new Error(`Project code ${input.code} already exists`);
    }
  }

  const next: Project = {
    ...existing,
    code: input.code ? upper(input.code) : existing.code,
    name: input.name ?? existing.name,
    client: input.clientName ?? existing.client,
    projectType: input.projectType ?? existing.projectType,
    currency: input.currency ?? existing.currency,
    contractValue: input.contractValue ?? existing.contractValue,
    start: input.plannedStart?.slice(0, 10) ?? existing.start,
    finish: input.plannedFinish?.slice(0, 10) ?? existing.finish,
    manager: input.projectManagerName ?? existing.manager,
    managerEmployeeCode: input.projectManagerEmployeeCode ?? existing.managerEmployeeCode,
    managerEmployeeId: input.projectManagerId ?? existing.managerEmployeeId,
    managerUsername: input.projectManagerUsername ?? existing.managerUsername,
    businessUnit: input.businessUnit ?? existing.businessUnit,
    location: input.location ?? existing.location,
    description: input.description ?? existing.description,
    status: input.status ?? existing.status,
    health: (input.health as Health | undefined) ?? existing.health,
    phase: input.phase ?? existing.phase,
    planned: input.plannedProgress ?? existing.planned,
    actual: input.actualProgress ?? existing.actual,
    schedulePerformance: input.schedulePerformance ?? existing.schedulePerformance,
    costPerformance: input.costPerformance ?? existing.costPerformance,
  };

  if (new Date(next.finish) < new Date(next.start)) {
    throw new Error('Finish date must be on or after start date');
  }

  const syncedId = await syncTimesheet(next);
  next.id = syncedId;
  next.registryId = syncedId;
  await upsertPmProfile(next, actor);
  return (await getProjectById(syncedId)) || next;
};

export const deleteProjectRecord = async (
  id: string,
  actor: { username?: string; fullName?: string; sub?: string },
): Promise<{ id: string; code: string }> => {
  const existing = await getProjectById(id);
  if (!existing) throw new Error('Project not found');

  const pool = await ensurePmDb();
  const modifiedBy = actorGuid(actor);
  await pool
    .request()
    .input('ProjectCode', sql.NVarChar(30), upper(existing.code))
    .input('RegistryId', sql.NVarChar(80), existing.registryId || existing.id)
    .input('ModifiedBy', sql.UniqueIdentifier, modifiedBy)
    .query(`
UPDATE [pm].[Projects]
SET [IsDeleted] = 1, [Status] = N'Archived', [ModifiedBy] = @ModifiedBy, [ModifiedAt] = SYSUTCDATETIME()
WHERE ([ProjectCode] = @ProjectCode OR [RegistryId] = @RegistryId) AND [IsDeleted] = 0;
`);

  // Soft-archive in enterprise registry so timesheets/history remain intact.
  await upsertTimesheetProject({
    id: existing.registryId || existing.id,
    code: upper(existing.code),
    name: existing.name,
    clientName: existing.client || 'Client TBD',
    site: existing.location || 'TBD',
    projectManager: existing.manager || '',
    status: 'Archived',
    tasks: [{ id: `task-${existing.registryId || existing.id}`, name: 'General Project Work' }],
  });

  return { id: existing.id, code: existing.code };
};
