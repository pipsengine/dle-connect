import sql from 'mssql';
import { getDleEnterpriseDbPool } from '@/lib/dle-enterprise-db';
import { ensureInspectionSchemaSql } from '@/lib/it-support/inspection-sql-schema';
import { listItAssets } from '@/lib/it-asset-management-store';
import { listImsBundle } from '@/lib/it-support/inspection-ims-store';
import type { InspectionAssetOption, InspectionChecklistItem, InspectionDirectory, InspectionFinding, InspectionRecord, InspectionSchedule, InspectionWorkspace } from '@/lib/it-support/inspection-types';

const ready = { value: false };

const compact = (value: unknown, max = 300) => String(value ?? '').trim().slice(0, max);
const nullable = (value: unknown, max = 300) => compact(value, max) || null;
const toIso = (value: unknown) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};
const toDateOnly = (value: unknown) => {
  const text = compact(value, 40);
  if (!text) return null;
  const date = new Date(text.includes('T') ? text : `${text}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};
const dateLabel = (value: unknown) => {
  const iso = toIso(value);
  return iso ? iso.slice(0, 10) : null;
};

const sqlErrorNumber = (error: unknown) => {
  if (!error || typeof error !== 'object') return 0;
  const value = (error as { number?: unknown }).number;
  return typeof value === 'number' ? value : 0;
};

const poolOrThrow = async () => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new Error('DLE_Enterprise database is not configured. Inspection Management requires SQL persistence.');
  if (!ready.value) {
    try {
      await pool.request().query(ensureInspectionSchemaSql);
    } catch (error) {
      if (sqlErrorNumber(error) !== 2714) throw error;
      await pool.request().query(ensureInspectionSchemaSql);
    }
    ready.value = true;
  }
  return pool;
};

const nextNumber = async (pool: sql.ConnectionPool, table: string, column: string, prefix: string) => {
  const like = `${prefix}-%`;
  const result = await pool.request().input('Prefix', sql.NVarChar(30), like).query(`
    SELECT [${column}] AS Id FROM [it].[${table}] WHERE [${column}] LIKE @Prefix
  `);
  let max = 0;
  for (const row of result.recordset as Array<{ Id?: string }>) {
    const match = String(row.Id || '').match(/-(\d+)$/);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `${prefix}-${String(max + 1).padStart(4, '0')}`;
};

const yearPrefix = (base: string) => `${base}-${new Date().getUTCFullYear()}`;

const mapSchedule = (row: Record<string, unknown>): InspectionSchedule => ({
  scheduleId: compact(row.ScheduleId, 40),
  title: compact(row.Title),
  inspectionType: compact(row.InspectionType, 80),
  location: nullable(row.Location, 180),
  department: nullable(row.Department, 180),
  frequency: compact(row.Frequency, 40),
  nextDueDate: dateLabel(row.NextDueDate),
  ownerName: nullable(row.OwnerName, 220),
  status: compact(row.Status, 40) || 'Active',
  notes: nullable(row.Notes, 4000),
  createdAt: toIso(row.CreatedAt),
  updatedAt: toIso(row.UpdatedAt),
});

const mapInspection = (row: Record<string, unknown>): InspectionRecord => ({
  inspectionId: compact(row.InspectionId, 40),
  scheduleId: nullable(row.ScheduleId, 40),
  title: compact(row.Title),
  inspectionType: compact(row.InspectionType, 80),
  location: nullable(row.Location, 180),
  department: nullable(row.Department, 180),
  inspectorName: nullable(row.InspectorName, 220),
  scheduledDate: dateLabel(row.ScheduledDate),
  completedDate: dateLabel(row.CompletedDate),
  status: compact(row.Status, 40) || 'Scheduled',
  result: nullable(row.Result, 40),
  notes: nullable(row.Notes, 4000),
  locationId: nullable(row.LocationId, 40),
  visitType: nullable(row.VisitType, 40),
  checklist: parseChecklist(row.ChecklistJson),
  createdAt: toIso(row.CreatedAt),
  updatedAt: toIso(row.UpdatedAt),
});

const parseChecklist = (value: unknown): InspectionChecklistItem[] => {
  if (!value) return [];
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed as InspectionChecklistItem[] : [];
  } catch {
    return [];
  }
};

const mapFinding = (row: Record<string, unknown>): InspectionFinding => ({
  findingId: compact(row.FindingId, 40),
  inspectionId: compact(row.InspectionId, 40),
  title: compact(row.Title),
  severity: compact(row.Severity, 40) || 'Medium',
  status: compact(row.Status, 40) || 'Open',
  ownerName: nullable(row.OwnerName, 220),
  dueDate: dateLabel(row.DueDate),
  description: nullable(row.Description, 4000),
  resolution: nullable(row.Resolution, 4000),
  createdAt: toIso(row.CreatedAt),
  updatedAt: toIso(row.UpdatedAt),
});

const emptyDirectory = (): InspectionDirectory => ({ departments: [], locations: [], employees: [] });

const inactiveEmployee = (status?: string | null) =>
  /inactive|terminated|resigned|retired|deceased|suspend/i.test(compact(status));

let directoryCache: { at: number; value: InspectionDirectory } | null = null;

export const listInspectionDirectory = async (): Promise<InspectionDirectory> => {
  if (directoryCache && Date.now() - directoryCache.at < 60_000) return directoryCache.value;
  const directory = emptyDirectory();
  try {
    const { readSystemDepartmentsFromOrganizationDb } = await import('@/lib/organization-departments-store');
    const payload = await readSystemDepartmentsFromOrganizationDb();
    directory.departments = (payload.departments || [])
      .map((department) => ({
        value: compact(department.name),
        label: compact(department.name),
        hint: [department.code, department.location].filter(Boolean).join(' · ') || undefined,
      }))
      .filter((department) => department.value)
      .sort((a, b) => a.label.localeCompare(b.label));
  } catch (error) {
    console.error('[inspection-management] departments unavailable', error);
  }
  try {
    const pool = await getDleEnterpriseDbPool();
    if (pool) {
      const result = await pool.request().query(`
        SELECT TOP 500 [Name], [CostCenter], [Region], [Location]
        FROM [hris].[OrganizationLocationsSites]
        ORDER BY [Name]
      `);
      const seen = new Set<string>();
      for (const row of result.recordset as Array<Record<string, unknown>>) {
        const name = compact(row.Name || row.Location, 180);
        if (!name || seen.has(name.toLowerCase())) continue;
        seen.add(name.toLowerCase());
        directory.locations.push({
          value: name,
          label: name,
          hint: [compact(row.CostCenter, 80), compact(row.Region, 80)].filter(Boolean).join(' · ') || undefined,
        });
      }
    }
  } catch (error) {
    console.error('[inspection-management] locations unavailable', error);
  }
  try {
    const { readEmployeeDirectoryFromDb } = await import('@/lib/dle-enterprise-db');
    const rows = (await readEmployeeDirectoryFromDb()) || [];
    const active = rows.filter((employee) => compact(employee.fullName) && !inactiveEmployee(employee.status));
    const nameCounts = new Map<string, number>();
    for (const employee of active) {
      const name = compact(employee.fullName);
      nameCounts.set(name, (nameCounts.get(name) || 0) + 1);
    }
    directory.employees = active
      .map((employee) => {
        const name = compact(employee.fullName);
        const code = compact(employee.employeeCode || employee.employeeId, 80);
        const value = (nameCounts.get(name) || 0) > 1 && code ? `${name} (${code})` : name;
        return {
          value,
          label: value,
          hint: [code, compact(employee.department, 180)].filter(Boolean).join(' · ') || undefined,
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  } catch (error) {
    console.error('[inspection-management] employees unavailable', error);
  }
  directoryCache = { at: Date.now(), value: directory };
  return directory;
};

const listInspectionAssets = async (): Promise<InspectionAssetOption[]> => {
  try {
    const assets = await listItAssets();
    return assets
      .filter((asset) => asset.assetTag && asset.assetType.toLowerCase() !== 'software')
      .map((asset) => ({
        assetId: asset.assetId,
        assetTag: asset.assetTag,
        name: asset.name,
        serialNumber: asset.serialNumber,
        category: asset.category,
        subCategory: asset.subCategory,
        location: asset.location,
        model: asset.model,
      }))
      .sort((a, b) => a.assetTag.localeCompare(b.assetTag));
  } catch (error) {
    console.error('[inspection-management] IT assets unavailable', error);
    return [];
  }
};

export const listInspectionWorkspace = async (): Promise<InspectionWorkspace> => {
  const pool = await poolOrThrow();
  const [schedules, inspections, findings, directory, ims, assets] = await Promise.all([
    pool.request().query(`SELECT * FROM [it].[InspectionSchedules] ORDER BY [UpdatedAt] DESC`),
    pool.request().query(`SELECT * FROM [it].[Inspections] ORDER BY [UpdatedAt] DESC`),
    pool.request().query(`SELECT * FROM [it].[InspectionFindings] ORDER BY [UpdatedAt] DESC`),
    listInspectionDirectory(),
    listImsBundle(),
    listInspectionAssets(),
  ]);
  return {
    schedules: (schedules.recordset as Record<string, unknown>[]).map(mapSchedule),
    inspections: (inspections.recordset as Record<string, unknown>[]).map(mapInspection),
    findings: (findings.recordset as Record<string, unknown>[]).map(mapFinding),
    directory,
    ...ims,
    assets,
  };
};

export const upsertInspectionSchedule = async (input: Partial<InspectionSchedule>, actor: string) => {
  if (!compact(input.title)) throw new Error('Schedule title is required.');
  if (!compact(input.inspectionType, 80)) throw new Error('Inspection type is required.');
  if (!compact(input.frequency, 40)) throw new Error('Frequency is required.');
  const pool = await poolOrThrow();
  const scheduleId = compact(input.scheduleId, 40) || await nextNumber(pool, 'InspectionSchedules', 'ScheduleId', yearPrefix('SCH'));
  await pool
    .request()
    .input('ScheduleId', sql.NVarChar(40), scheduleId)
    .input('Title', sql.NVarChar(300), compact(input.title))
    .input('InspectionType', sql.NVarChar(80), compact(input.inspectionType, 80))
    .input('Location', sql.NVarChar(180), nullable(input.location, 180))
    .input('Department', sql.NVarChar(180), nullable(input.department, 180))
    .input('Frequency', sql.NVarChar(40), compact(input.frequency, 40))
    .input('NextDueDate', sql.Date, toDateOnly(input.nextDueDate))
    .input('OwnerName', sql.NVarChar(220), nullable(input.ownerName, 220))
    .input('Status', sql.NVarChar(40), compact(input.status, 40) || 'Active')
    .input('Notes', sql.NVarChar(sql.MAX), nullable(input.notes, 4000))
    .input('Actor', sql.NVarChar(120), compact(actor, 120))
    .query(`
      IF EXISTS (SELECT 1 FROM [it].[InspectionSchedules] WHERE [ScheduleId]=@ScheduleId)
        UPDATE [it].[InspectionSchedules] SET
          [Title]=@Title, [InspectionType]=@InspectionType, [Location]=@Location, [Department]=@Department,
          [Frequency]=@Frequency, [NextDueDate]=@NextDueDate, [OwnerName]=@OwnerName, [Status]=@Status, [Notes]=@Notes,
          [UpdatedAt]=SYSUTCDATETIME(), [UpdatedBy]=@Actor
        WHERE [ScheduleId]=@ScheduleId
      ELSE
        INSERT INTO [it].[InspectionSchedules] (
          [ScheduleId], [Title], [InspectionType], [Location], [Department], [Frequency], [NextDueDate],
          [OwnerName], [Status], [Notes], [CreatedBy], [UpdatedBy]
        ) VALUES (
          @ScheduleId, @Title, @InspectionType, @Location, @Department, @Frequency, @NextDueDate,
          @OwnerName, @Status, @Notes, @Actor, @Actor
        )
    `);
  return scheduleId;
};

export const upsertInspection = async (input: Partial<InspectionRecord>, actor: string) => {
  if (!compact(input.title)) throw new Error('Inspection title is required.');
  if (!compact(input.inspectionType, 80)) throw new Error('Inspection type is required.');
  const status = compact(input.status, 40) || 'Scheduled';
  if (status === 'Completed' && !compact(input.result, 40)) throw new Error('A result is required when the inspection is completed.');
  const pool = await poolOrThrow();
  const inspectionId = compact(input.inspectionId, 40) || await nextNumber(pool, 'Inspections', 'InspectionId', yearPrefix('INS'));
  await pool
    .request()
    .input('InspectionId', sql.NVarChar(40), inspectionId)
    .input('ScheduleId', sql.NVarChar(40), nullable(input.scheduleId, 40))
    .input('Title', sql.NVarChar(300), compact(input.title))
    .input('InspectionType', sql.NVarChar(80), compact(input.inspectionType, 80))
    .input('Location', sql.NVarChar(180), nullable(input.location, 180))
    .input('Department', sql.NVarChar(180), nullable(input.department, 180))
    .input('InspectorName', sql.NVarChar(220), nullable(input.inspectorName, 220))
    .input('ScheduledDate', sql.Date, toDateOnly(input.scheduledDate))
    .input('CompletedDate', sql.Date, toDateOnly(input.completedDate))
    .input('Status', sql.NVarChar(40), status)
    .input('Result', sql.NVarChar(40), nullable(input.result, 40))
    .input('Notes', sql.NVarChar(sql.MAX), nullable(input.notes, 4000))
    .input('Actor', sql.NVarChar(120), compact(actor, 120))
    .query(`
      IF EXISTS (SELECT 1 FROM [it].[Inspections] WHERE [InspectionId]=@InspectionId)
        UPDATE [it].[Inspections] SET
          [ScheduleId]=@ScheduleId, [Title]=@Title, [InspectionType]=@InspectionType, [Location]=@Location,
          [Department]=@Department, [InspectorName]=@InspectorName, [ScheduledDate]=@ScheduledDate,
          [CompletedDate]=@CompletedDate, [Status]=@Status, [Result]=@Result, [Notes]=@Notes,
          [UpdatedAt]=SYSUTCDATETIME(), [UpdatedBy]=@Actor
        WHERE [InspectionId]=@InspectionId
      ELSE
        INSERT INTO [it].[Inspections] (
          [InspectionId], [ScheduleId], [Title], [InspectionType], [Location], [Department], [InspectorName],
          [ScheduledDate], [CompletedDate], [Status], [Result], [Notes], [CreatedBy], [UpdatedBy]
        ) VALUES (
          @InspectionId, @ScheduleId, @Title, @InspectionType, @Location, @Department, @InspectorName,
          @ScheduledDate, @CompletedDate, @Status, @Result, @Notes, @Actor, @Actor
        )
    `);
  return inspectionId;
};

export const upsertInspectionFinding = async (input: Partial<InspectionFinding>, actor: string) => {
  if (!compact(input.title)) throw new Error('Finding title is required.');
  if (!compact(input.inspectionId, 40)) throw new Error('Link the finding to an inspection.');
  const pool = await poolOrThrow();
  const exists = await pool.request().input('InspectionId', sql.NVarChar(40), compact(input.inspectionId, 40)).query(`
    SELECT 1 AS Found FROM [it].[Inspections] WHERE [InspectionId]=@InspectionId
  `);
  if (!exists.recordset.length) throw new Error('The selected inspection was not found.');
  const findingId = compact(input.findingId, 40) || await nextNumber(pool, 'InspectionFindings', 'FindingId', yearPrefix('FND'));
  await pool
    .request()
    .input('FindingId', sql.NVarChar(40), findingId)
    .input('InspectionId', sql.NVarChar(40), compact(input.inspectionId, 40))
    .input('Title', sql.NVarChar(300), compact(input.title))
    .input('Severity', sql.NVarChar(40), compact(input.severity, 40) || 'Medium')
    .input('Status', sql.NVarChar(40), compact(input.status, 40) || 'Open')
    .input('OwnerName', sql.NVarChar(220), nullable(input.ownerName, 220))
    .input('DueDate', sql.Date, toDateOnly(input.dueDate))
    .input('Description', sql.NVarChar(sql.MAX), nullable(input.description, 4000))
    .input('Resolution', sql.NVarChar(sql.MAX), nullable(input.resolution, 4000))
    .input('Actor', sql.NVarChar(120), compact(actor, 120))
    .query(`
      IF EXISTS (SELECT 1 FROM [it].[InspectionFindings] WHERE [FindingId]=@FindingId)
        UPDATE [it].[InspectionFindings] SET
          [InspectionId]=@InspectionId, [Title]=@Title, [Severity]=@Severity, [Status]=@Status,
          [OwnerName]=@OwnerName, [DueDate]=@DueDate, [Description]=@Description, [Resolution]=@Resolution,
          [UpdatedAt]=SYSUTCDATETIME(), [UpdatedBy]=@Actor
        WHERE [FindingId]=@FindingId
      ELSE
        INSERT INTO [it].[InspectionFindings] (
          [FindingId], [InspectionId], [Title], [Severity], [Status], [OwnerName], [DueDate],
          [Description], [Resolution], [CreatedBy], [UpdatedBy]
        ) VALUES (
          @FindingId, @InspectionId, @Title, @Severity, @Status, @OwnerName, @DueDate,
          @Description, @Resolution, @Actor, @Actor
        )
    `);
  return findingId;
};

export const deleteInspectionRecord = async (kind: 'schedule' | 'inspection' | 'finding', id: string) => {
  const pool = await poolOrThrow();
  const key = compact(id, 40);
  if (!key) throw new Error('Record id is required.');
  if (kind === 'schedule') {
    await pool.request().input('Id', sql.NVarChar(40), key).query(`
      UPDATE [it].[Inspections] SET [ScheduleId]=NULL WHERE [ScheduleId]=@Id;
      DELETE FROM [it].[InspectionSchedules] WHERE [ScheduleId]=@Id;
    `);
    return;
  }
  if (kind === 'inspection') {
    await pool.request().input('Id', sql.NVarChar(40), key).query(`
      DELETE FROM [it].[InspectionFindings] WHERE [InspectionId]=@Id;
      DELETE FROM [it].[InspectionActions] WHERE [InspectionId]=@Id;
      DELETE FROM [it].[Inspections] WHERE [InspectionId]=@Id;
    `);
    return;
  }
  await pool.request().input('Id', sql.NVarChar(40), key).query(`
    DELETE FROM [it].[InspectionFindings] WHERE [FindingId]=@Id
  `);
};
