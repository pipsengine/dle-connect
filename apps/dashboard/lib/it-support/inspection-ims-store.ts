import sql from 'mssql';
import { getDleEnterpriseDbPool } from '@/lib/dle-enterprise-db';
import { ensureInspectionSchemaSql } from '@/lib/it-support/inspection-sql-schema';
import { INSPECTION_LOCATION_TEMPLATES } from '@/lib/it-support/inspection-location-templates';
import type {
  BbsObservation,
  ChecklistCategory,
  EmergencyDrill,
  EWasteRecord,
  HazidReport,
  ImsAction,
  ImsLocation,
  InspectionChecklistItem,
} from '@/lib/it-support/inspection-types';

const ready = { value: false };

const compact = (value: unknown, max = 300) => String(value ?? '').trim().slice(0, max);
const nullable = (value: unknown, max = 300) => compact(value, max) || null;
const toIso = (value: unknown) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};
const dateLabel = (value: unknown) => {
  const iso = toIso(value);
  return iso ? iso.slice(0, 10) : null;
};
const toDateOnly = (value: unknown) => {
  const text = compact(value, 40);
  if (!text) return null;
  const date = new Date(text.includes('T') ? text : `${text}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};
const sqlErrorNumber = (error: unknown) => {
  if (!error || typeof error !== 'object') return 0;
  const value = (error as { number?: unknown }).number;
  return typeof value === 'number' ? value : 0;
};
const parseJson = <T>(value: unknown, fallback: T): T => {
  if (!value) return fallback;
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return parsed as T;
  } catch {
    return fallback;
  }
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
    await seedLocations(pool);
    ready.value = true;
  }
  return pool;
};

const monthsFor = (frequency: string) => {
  if (frequency === 'Quarterly') return 3;
  if (frequency === 'Bi-Annual') return 6;
  if (frequency === 'Annual') return 12;
  return 1;
};

const addMonths = (from: Date, months: number) => {
  const next = new Date(from.getTime());
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
};

const nextNumber = async (pool: sql.ConnectionPool, table: string, column: string, prefix: string) => {
  const result = await pool.request().input('Prefix', sql.NVarChar(30), `${prefix}-%`).query(`
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

const seedLocations = async (pool: sql.ConnectionPool) => {
  const existing = await pool.request().query(`SELECT COUNT(*) AS Total FROM [it].[InspectionLocations]`);
  if (Number(existing.recordset[0]?.Total || 0) > 0) return;
  for (const location of INSPECTION_LOCATION_TEMPLATES) {
    const next = addMonths(new Date(), monthsFor(location.frequency));
    await pool
      .request()
      .input('LocationId', sql.NVarChar(40), location.locationId)
      .input('Name', sql.NVarChar(180), location.name)
      .input('Frequency', sql.NVarChar(40), location.frequency)
      .input('NextInspectionDate', sql.Date, next)
      .input('ChecklistJson', sql.NVarChar(sql.MAX), JSON.stringify(location.categories))
      .query(`
        IF NOT EXISTS (SELECT 1 FROM [it].[InspectionLocations] WHERE [LocationId]=@LocationId)
          INSERT INTO [it].[InspectionLocations] ([LocationId], [Name], [Frequency], [NextInspectionDate], [ChecklistJson])
          VALUES (@LocationId, @Name, @Frequency, @NextInspectionDate, @ChecklistJson)
      `);
  }
};

const mapLocation = (row: Record<string, unknown>): ImsLocation => ({
  locationId: compact(row.LocationId, 40),
  name: compact(row.Name, 180),
  frequency: compact(row.Frequency, 40) || 'Monthly',
  lastInspectionDate: dateLabel(row.LastInspectionDate),
  nextInspectionDate: dateLabel(row.NextInspectionDate),
  categories: parseJson<ChecklistCategory[]>(row.ChecklistJson, []),
});

const mapAction = (row: Record<string, unknown>): ImsAction => ({
  actionId: compact(row.ActionId, 40),
  inspectionId: compact(row.InspectionId, 40),
  locationName: compact(row.LocationName, 180),
  description: compact(row.Description, 4000),
  assignedTo: nullable(row.AssignedTo, 220),
  priority: compact(row.Priority, 40) || 'Medium',
  status: compact(row.Status, 40) || 'Open',
  dueDate: dateLabel(row.DueDate),
  closureDate: dateLabel(row.ClosureDate),
  verificationComments: nullable(row.VerificationComments, 4000),
});

const mapHazid = (row: Record<string, unknown>): HazidReport => ({
  reportId: compact(row.ReportId, 40),
  date: dateLabel(row.ReportDate),
  reporter: nullable(row.Reporter, 220),
  category: compact(row.Category, 80),
  description: compact(row.Description, 4000),
  riskLevel: compact(row.RiskLevel, 40) || 'Medium',
  correctiveAction: nullable(row.CorrectiveAction, 4000),
  status: compact(row.Status, 40) || 'Open',
  location: nullable(row.Location, 180),
});

const mapBbs = (row: Record<string, unknown>): BbsObservation => ({
  observationId: compact(row.ObservationId, 40),
  observer: nullable(row.Observer, 220),
  date: dateLabel(row.ObservationDate),
  safeBehaviour: nullable(row.SafeBehaviour, 4000),
  unsafeBehaviour: nullable(row.UnsafeBehaviour, 4000),
  comments: nullable(row.Comments, 4000),
  recommendedAction: nullable(row.RecommendedAction, 4000),
  status: compact(row.Status, 40) || 'Open',
  department: nullable(row.Department, 180),
});

const mapDrill = (row: Record<string, unknown>): EmergencyDrill => ({
  drillId: compact(row.DrillId, 40),
  date: dateLabel(row.DrillDate),
  drillType: compact(row.DrillType, 80),
  participants: Number(row.Participants || 0),
  assignedPersonnel: Number(row.AssignedPersonnel || 0),
  outcome: nullable(row.Outcome, 4000),
  findings: nullable(row.Findings, 4000),
  correctiveActions: nullable(row.CorrectiveActions, 4000),
  duration: Number(row.DurationMinutes || 0),
  location: nullable(row.Location, 180),
});

const mapWaste = (row: Record<string, unknown>): EWasteRecord => ({
  recordId: compact(row.RecordId, 40),
  assetTag: compact(row.AssetTag, 80),
  serialNumber: nullable(row.SerialNumber, 80),
  assetDescription: compact(row.AssetDescription, 300),
  assetType: compact(row.AssetType, 80),
  location: nullable(row.Location, 180),
  disposalReason: nullable(row.DisposalReason, 300),
  disposalDate: dateLabel(row.DisposalDate),
  approvalStatus: compact(row.ApprovalStatus, 40) || 'Pending',
  vendor: nullable(row.Vendor, 220),
  certificateNumber: nullable(row.CertificateNumber, 120),
  workflowStep: Number(row.WorkflowStep || 1),
});

const dedupeLocations = async (pool: sql.ConnectionPool) => {
  const rows = await pool.request().query(`
    SELECT [LocationId], [Name], [LastInspectionDate],
      CASE WHEN [ChecklistJson] IS NULL OR [ChecklistJson] IN (N'', N'[]') THEN 0 ELSE 1 END AS HasChecklist
    FROM [it].[InspectionLocations]
  `);
  const groups = new Map<string, Array<{ LocationId: string; LastInspectionDate: unknown; HasChecklist: number }>>();
  for (const row of rows.recordset as Array<{ LocationId?: string; Name?: string; LastInspectionDate?: unknown; HasChecklist?: number }>) {
    const key = compact(row.Name, 180).toLowerCase();
    if (!key) continue;
    const list = groups.get(key) || [];
    list.push({
      LocationId: compact(row.LocationId, 40),
      LastInspectionDate: row.LastInspectionDate,
      HasChecklist: Number(row.HasChecklist || 0),
    });
    groups.set(key, list);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => {
      const aDated = a.LastInspectionDate ? 1 : 0;
      const bDated = b.LastInspectionDate ? 1 : 0;
      if (aDated !== bDated) return bDated - aDated;
      if (a.HasChecklist !== b.HasChecklist) return b.HasChecklist - a.HasChecklist;
      return a.LocationId.localeCompare(b.LocationId);
    });
    const keep = group[0].LocationId;
    for (const extra of group.slice(1)) {
      await pool.request().input('Keep', sql.NVarChar(40), keep).input('Drop', sql.NVarChar(40), extra.LocationId).query(`
        UPDATE [it].[Inspections] SET [LocationId]=@Keep WHERE [LocationId]=@Drop;
        DELETE FROM [it].[InspectionLocations] WHERE [LocationId]=@Drop;
      `);
    }
  }
};

export const upsertImsSchedule = async (
  input: { locationId?: string | null; name?: string | null; frequency?: string | null; nextInspectionDate?: string | null; templateId?: string | null },
  _actor: string,
) => {
  const name = compact(input.name, 180);
  const frequency = compact(input.frequency, 40) || 'Monthly';
  if (!name) throw new Error('Select a location.');
  if (!['Monthly', 'Quarterly', 'Bi-Annual', 'Annual'].includes(frequency)) throw new Error('Select a frequency.');
  const next = toDateOnly(input.nextInspectionDate);
  if (!next) throw new Error('Next inspection date is required.');
  const pool = await poolOrThrow();
  await dedupeLocations(pool);
  const named = await pool.request().input('Name', sql.NVarChar(180), name).query(`
    SELECT TOP 1 [LocationId] FROM [it].[InspectionLocations] WHERE [Name]=@Name ORDER BY [LocationId]
  `);
  const namedId = compact((named.recordset[0] as { LocationId?: string } | undefined)?.LocationId, 40);
  const requestedId = compact(input.locationId, 40);
  if (namedId && requestedId && namedId !== requestedId) throw new Error('A schedule already exists for this location.');
  const locationId = requestedId || namedId;
  if (locationId) {
    await pool
      .request()
      .input('LocationId', sql.NVarChar(40), locationId)
      .input('Name', sql.NVarChar(180), name)
      .input('Frequency', sql.NVarChar(40), frequency)
      .input('NextInspectionDate', sql.Date, next)
      .query(`
        UPDATE [it].[InspectionLocations]
        SET [Name]=@Name, [Frequency]=@Frequency, [NextInspectionDate]=@NextInspectionDate, [UpdatedAt]=SYSUTCDATETIME()
        WHERE [LocationId]=@LocationId
      `);
    return locationId;
  }
  const templateId = compact(input.templateId, 40);
  const template = INSPECTION_LOCATION_TEMPLATES.find((row) => row.locationId === templateId);
  let categories = template?.categories || [];
  if (!categories.length && templateId) {
    const source = await pool.request().input('LocationId', sql.NVarChar(40), templateId).query(`
      SELECT [ChecklistJson] FROM [it].[InspectionLocations] WHERE [LocationId]=@LocationId
    `);
    categories = parseJson<ChecklistCategory[]>((source.recordset[0] as { ChecklistJson?: string } | undefined)?.ChecklistJson, []);
  }
  if (!categories.length) throw new Error('Select the checklist this schedule should use.');
  const createdId = await nextNumber(pool, 'InspectionLocations', 'LocationId', 'loc');
  await pool
    .request()
    .input('LocationId', sql.NVarChar(40), createdId)
    .input('Name', sql.NVarChar(180), name)
    .input('Frequency', sql.NVarChar(40), frequency)
    .input('NextInspectionDate', sql.Date, next)
    .input('ChecklistJson', sql.NVarChar(sql.MAX), JSON.stringify(categories))
    .query(`
      INSERT INTO [it].[InspectionLocations] ([LocationId], [Name], [Frequency], [NextInspectionDate], [ChecklistJson])
      VALUES (@LocationId, @Name, @Frequency, @NextInspectionDate, @ChecklistJson)
    `);
  return createdId;
};

export const listImsBundle = async () => {
  const pool = await poolOrThrow();
  await dedupeLocations(pool);
  const [locations, actions, hazid, bbs, drills, ewaste] = await Promise.all([
    pool.request().query(`SELECT * FROM [it].[InspectionLocations] ORDER BY [Name]`),
    pool.request().query(`
      SELECT a.*, ISNULL(i.[Location], N'') AS LocationName
      FROM [it].[InspectionActions] a
      LEFT JOIN [it].[Inspections] i ON i.[InspectionId] = a.[InspectionId]
      ORDER BY a.[UpdatedAt] DESC
    `),
    pool.request().query(`SELECT * FROM [it].[HazidReports] ORDER BY [UpdatedAt] DESC`),
    pool.request().query(`SELECT * FROM [it].[BbsObservations] ORDER BY [UpdatedAt] DESC`),
    pool.request().query(`SELECT * FROM [it].[EmergencyDrills] ORDER BY [UpdatedAt] DESC`),
    pool.request().query(`SELECT * FROM [it].[EWasteRecords] ORDER BY [UpdatedAt] DESC`),
  ]);
  return {
    locations: (locations.recordset as Record<string, unknown>[]).map(mapLocation),
    actions: (actions.recordset as Record<string, unknown>[]).map(mapAction),
    hazid: (hazid.recordset as Record<string, unknown>[]).map(mapHazid),
    bbs: (bbs.recordset as Record<string, unknown>[]).map(mapBbs),
    drills: (drills.recordset as Record<string, unknown>[]).map(mapDrill),
    ewaste: (ewaste.recordset as Record<string, unknown>[]).map(mapWaste),
  };
};

export const upsertImsInspection = async (
  input: {
    inspectionId?: string | null;
    locationId?: string | null;
    department?: string | null;
    inspectorName?: string | null;
    scheduledDate?: string | null;
    visitType?: string | null;
    notes?: string | null;
    checklist?: InspectionChecklistItem[];
  },
  actor: string,
) => {
  const pool = await poolOrThrow();
  const locationId = compact(input.locationId, 40);
  const location = await pool.request().input('LocationId', sql.NVarChar(40), locationId).query(`
    SELECT [Name], [Frequency] FROM [it].[InspectionLocations] WHERE [LocationId]=@LocationId
  `);
  const locationRow = location.recordset[0] as { Name?: string; Frequency?: string } | undefined;
  if (!locationRow) throw new Error('Select a checklist location.');
  const checklist = Array.isArray(input.checklist) ? input.checklist : [];
  if (!checklist.length) throw new Error('Score the location checklist before saving.');
  const inspector = compact(input.inspectorName, 220);
  if (!inspector) throw new Error('Select the inspector.');
  const visitType = compact(input.visitType, 40) || 'Scheduled';
  const hasFail = checklist.some((item) => item.status === 'Non-Compliant');
  const hasMinor = checklist.some((item) => item.status === 'Minor');
  const result = hasFail ? 'Fail' : hasMinor ? 'Pass with findings' : 'Pass';
  const completed = toDateOnly(input.scheduledDate) || new Date();
  const existingId = compact(input.inspectionId, 40);
  const inspectionId = existingId || await nextNumber(pool, 'Inspections', 'InspectionId', yearPrefix('INS'));
  const title = `${compact(locationRow.Name, 180)} inspection`;
  await pool
    .request()
    .input('InspectionId', sql.NVarChar(40), inspectionId)
    .input('Title', sql.NVarChar(300), title)
    .input('InspectionType', sql.NVarChar(80), visitType)
    .input('Location', sql.NVarChar(180), compact(locationRow.Name, 180))
    .input('LocationId', sql.NVarChar(40), locationId)
    .input('VisitType', sql.NVarChar(40), visitType)
    .input('Department', sql.NVarChar(180), nullable(input.department, 180))
    .input('InspectorName', sql.NVarChar(220), inspector)
    .input('ScheduledDate', sql.Date, completed)
    .input('CompletedDate', sql.Date, completed)
    .input('Status', sql.NVarChar(40), 'Completed')
    .input('Result', sql.NVarChar(40), result)
    .input('Notes', sql.NVarChar(sql.MAX), nullable(input.notes, 4000))
    .input('ChecklistJson', sql.NVarChar(sql.MAX), JSON.stringify(checklist))
    .input('Actor', sql.NVarChar(120), compact(actor, 120))
    .query(`
      IF EXISTS (SELECT 1 FROM [it].[Inspections] WHERE [InspectionId]=@InspectionId)
        UPDATE [it].[Inspections] SET
          [Title]=@Title, [InspectionType]=@InspectionType, [Location]=@Location, [LocationId]=@LocationId,
          [VisitType]=@VisitType, [Department]=@Department, [InspectorName]=@InspectorName,
          [ScheduledDate]=@ScheduledDate, [CompletedDate]=@CompletedDate, [Status]=@Status, [Result]=@Result,
          [Notes]=@Notes, [ChecklistJson]=@ChecklistJson, [UpdatedAt]=SYSUTCDATETIME(), [UpdatedBy]=@Actor
        WHERE [InspectionId]=@InspectionId
      ELSE
        INSERT INTO [it].[Inspections] (
          [InspectionId], [Title], [InspectionType], [Location], [LocationId], [VisitType], [Department],
          [InspectorName], [ScheduledDate], [CompletedDate], [Status], [Result], [Notes], [ChecklistJson],
          [CreatedBy], [UpdatedBy]
        ) VALUES (
          @InspectionId, @Title, @InspectionType, @Location, @LocationId, @VisitType, @Department,
          @InspectorName, @ScheduledDate, @CompletedDate, @Status, @Result, @Notes, @ChecklistJson,
          @Actor, @Actor
        )
    `);

  const existingActions = await pool.request().input('InspectionId', sql.NVarChar(40), inspectionId).query(`
    SELECT [Description] FROM [it].[InspectionActions] WHERE [InspectionId]=@InspectionId
  `);
  const known = new Set((existingActions.recordset as Array<{ Description?: string }>).map((row) => compact(row.Description, 4000)));
  const due = addMonths(completed, 0);
  due.setUTCDate(due.getUTCDate() + 7);
  for (const item of checklist) {
    if (item.status !== 'Non-Compliant') continue;
    const description = `${item.itemName}${item.comment ? `: ${item.comment}` : ''}`;
    if (known.has(description)) continue;
    const actionId = await nextNumber(pool, 'InspectionActions', 'ActionId', yearPrefix('CAR'));
    await pool
      .request()
      .input('ActionId', sql.NVarChar(40), actionId)
      .input('InspectionId', sql.NVarChar(40), inspectionId)
      .input('Description', sql.NVarChar(sql.MAX), description)
      .input('AssignedTo', sql.NVarChar(220), inspector)
      .input('Priority', sql.NVarChar(40), compact(item.risk, 40) || 'Medium')
      .input('DueDate', sql.Date, due)
      .input('Actor', sql.NVarChar(120), compact(actor, 120))
      .query(`
        INSERT INTO [it].[InspectionActions] (
          [ActionId], [InspectionId], [Description], [AssignedTo], [Priority], [Status], [DueDate], [CreatedBy], [UpdatedBy]
        ) VALUES (
          @ActionId, @InspectionId, @Description, @AssignedTo, @Priority, N'Open', @DueDate, @Actor, @Actor
        )
      `);
    known.add(description);
  }

  const next = addMonths(completed, monthsFor(compact(locationRow.Frequency, 40)));
  await pool
    .request()
    .input('LocationId', sql.NVarChar(40), locationId)
    .input('LastInspectionDate', sql.Date, completed)
    .input('NextInspectionDate', sql.Date, next)
    .query(`
      UPDATE [it].[InspectionLocations]
      SET [LastInspectionDate]=@LastInspectionDate, [NextInspectionDate]=@NextInspectionDate, [UpdatedAt]=SYSUTCDATETIME()
      WHERE [LocationId]=@LocationId
    `);
  return inspectionId;
};

export const upsertImsAction = async (input: Partial<ImsAction>, actor: string) => {
  if (!compact(input.inspectionId, 40)) throw new Error('Link the action to an inspection.');
  if (!compact(input.description, 4000)) throw new Error('Describe the corrective action.');
  const pool = await poolOrThrow();
  const exists = await pool.request().input('InspectionId', sql.NVarChar(40), compact(input.inspectionId, 40)).query(`
    SELECT 1 AS Found FROM [it].[Inspections] WHERE [InspectionId]=@InspectionId
  `);
  if (!exists.recordset.length) throw new Error('The selected inspection was not found.');
  const status = compact(input.status, 40) || 'Open';
  const actionId = compact(input.actionId, 40) || await nextNumber(pool, 'InspectionActions', 'ActionId', yearPrefix('CAR'));
  const closure = status === 'Closed' ? toDateOnly(input.closureDate) || new Date() : null;
  await pool
    .request()
    .input('ActionId', sql.NVarChar(40), actionId)
    .input('InspectionId', sql.NVarChar(40), compact(input.inspectionId, 40))
    .input('Description', sql.NVarChar(sql.MAX), compact(input.description, 4000))
    .input('AssignedTo', sql.NVarChar(220), nullable(input.assignedTo, 220))
    .input('Priority', sql.NVarChar(40), compact(input.priority, 40) || 'Medium')
    .input('Status', sql.NVarChar(40), status)
    .input('DueDate', sql.Date, toDateOnly(input.dueDate))
    .input('ClosureDate', sql.Date, closure)
    .input('VerificationComments', sql.NVarChar(sql.MAX), nullable(input.verificationComments, 4000))
    .input('Actor', sql.NVarChar(120), compact(actor, 120))
    .query(`
      IF EXISTS (SELECT 1 FROM [it].[InspectionActions] WHERE [ActionId]=@ActionId)
        UPDATE [it].[InspectionActions] SET
          [InspectionId]=@InspectionId, [Description]=@Description, [AssignedTo]=@AssignedTo, [Priority]=@Priority,
          [Status]=@Status, [DueDate]=@DueDate, [ClosureDate]=@ClosureDate, [VerificationComments]=@VerificationComments,
          [UpdatedAt]=SYSUTCDATETIME(), [UpdatedBy]=@Actor
        WHERE [ActionId]=@ActionId
      ELSE
        INSERT INTO [it].[InspectionActions] (
          [ActionId], [InspectionId], [Description], [AssignedTo], [Priority], [Status], [DueDate], [ClosureDate],
          [VerificationComments], [CreatedBy], [UpdatedBy]
        ) VALUES (
          @ActionId, @InspectionId, @Description, @AssignedTo, @Priority, @Status, @DueDate, @ClosureDate,
          @VerificationComments, @Actor, @Actor
        )
    `);
  return actionId;
};

export const upsertHazid = async (input: Partial<HazidReport>, actor: string) => {
  if (!compact(input.description, 4000)) throw new Error('Describe the hazard.');
  if (!compact(input.location, 180)) throw new Error('Select the location.');
  const pool = await poolOrThrow();
  const reportId = compact(input.reportId, 40) || await nextNumber(pool, 'HazidReports', 'ReportId', yearPrefix('HAZ'));
  await pool
    .request()
    .input('ReportId', sql.NVarChar(40), reportId)
    .input('ReportDate', sql.Date, toDateOnly(input.date) || new Date())
    .input('Reporter', sql.NVarChar(220), nullable(input.reporter, 220))
    .input('Category', sql.NVarChar(80), compact(input.category, 80) || 'Unsafe Conditions')
    .input('Description', sql.NVarChar(sql.MAX), compact(input.description, 4000))
    .input('RiskLevel', sql.NVarChar(40), compact(input.riskLevel, 40) || 'Medium')
    .input('CorrectiveAction', sql.NVarChar(sql.MAX), nullable(input.correctiveAction, 4000))
    .input('Status', sql.NVarChar(40), compact(input.status, 40) || 'Open')
    .input('Location', sql.NVarChar(180), compact(input.location, 180))
    .input('Actor', sql.NVarChar(120), compact(actor, 120))
    .query(`
      IF EXISTS (SELECT 1 FROM [it].[HazidReports] WHERE [ReportId]=@ReportId)
        UPDATE [it].[HazidReports] SET
          [ReportDate]=@ReportDate, [Reporter]=@Reporter, [Category]=@Category, [Description]=@Description,
          [RiskLevel]=@RiskLevel, [CorrectiveAction]=@CorrectiveAction, [Status]=@Status, [Location]=@Location,
          [UpdatedAt]=SYSUTCDATETIME(), [UpdatedBy]=@Actor
        WHERE [ReportId]=@ReportId
      ELSE
        INSERT INTO [it].[HazidReports] (
          [ReportId], [ReportDate], [Reporter], [Category], [Description], [RiskLevel], [CorrectiveAction],
          [Status], [Location], [CreatedBy], [UpdatedBy]
        ) VALUES (
          @ReportId, @ReportDate, @Reporter, @Category, @Description, @RiskLevel, @CorrectiveAction,
          @Status, @Location, @Actor, @Actor
        )
    `);
  return reportId;
};

export const upsertBbs = async (input: Partial<BbsObservation>, actor: string) => {
  if (!compact(input.safeBehaviour, 4000) && !compact(input.unsafeBehaviour, 4000)) {
    throw new Error('Record a safe or unsafe behaviour.');
  }
  const pool = await poolOrThrow();
  const observationId = compact(input.observationId, 40) || await nextNumber(pool, 'BbsObservations', 'ObservationId', yearPrefix('BBS'));
  await pool
    .request()
    .input('ObservationId', sql.NVarChar(40), observationId)
    .input('Observer', sql.NVarChar(220), nullable(input.observer, 220))
    .input('ObservationDate', sql.Date, toDateOnly(input.date) || new Date())
    .input('SafeBehaviour', sql.NVarChar(sql.MAX), nullable(input.safeBehaviour, 4000))
    .input('UnsafeBehaviour', sql.NVarChar(sql.MAX), nullable(input.unsafeBehaviour, 4000))
    .input('Comments', sql.NVarChar(sql.MAX), nullable(input.comments, 4000))
    .input('RecommendedAction', sql.NVarChar(sql.MAX), nullable(input.recommendedAction, 4000))
    .input('Status', sql.NVarChar(40), compact(input.status, 40) || 'Open')
    .input('Department', sql.NVarChar(180), nullable(input.department, 180))
    .input('Actor', sql.NVarChar(120), compact(actor, 120))
    .query(`
      IF EXISTS (SELECT 1 FROM [it].[BbsObservations] WHERE [ObservationId]=@ObservationId)
        UPDATE [it].[BbsObservations] SET
          [Observer]=@Observer, [ObservationDate]=@ObservationDate, [SafeBehaviour]=@SafeBehaviour,
          [UnsafeBehaviour]=@UnsafeBehaviour, [Comments]=@Comments, [RecommendedAction]=@RecommendedAction,
          [Status]=@Status, [Department]=@Department, [UpdatedAt]=SYSUTCDATETIME(), [UpdatedBy]=@Actor
        WHERE [ObservationId]=@ObservationId
      ELSE
        INSERT INTO [it].[BbsObservations] (
          [ObservationId], [Observer], [ObservationDate], [SafeBehaviour], [UnsafeBehaviour], [Comments],
          [RecommendedAction], [Status], [Department], [CreatedBy], [UpdatedBy]
        ) VALUES (
          @ObservationId, @Observer, @ObservationDate, @SafeBehaviour, @UnsafeBehaviour, @Comments,
          @RecommendedAction, @Status, @Department, @Actor, @Actor
        )
    `);
  return observationId;
};

export const upsertDrill = async (input: Partial<EmergencyDrill>, actor: string) => {
  const participants = Number(input.participants || 0);
  const assigned = Number(input.assignedPersonnel || 0);
  if (participants < 0 || assigned < 0 || Number(input.duration || 0) < 0) throw new Error('Counts cannot be negative.');
  if (participants > assigned) throw new Error('Participants cannot exceed assigned personnel.');
  if (!compact(input.location, 180)) throw new Error('Select the drill location.');
  if (!compact(input.outcome, 4000) || !compact(input.findings, 4000)) throw new Error('Record the outcome and findings.');
  const pool = await poolOrThrow();
  const drillId = compact(input.drillId, 40) || await nextNumber(pool, 'EmergencyDrills', 'DrillId', yearPrefix('DRL'));
  await pool
    .request()
    .input('DrillId', sql.NVarChar(40), drillId)
    .input('DrillDate', sql.Date, toDateOnly(input.date) || new Date())
    .input('DrillType', sql.NVarChar(80), compact(input.drillType, 80) || 'Fire Drill')
    .input('Participants', sql.Int, participants)
    .input('AssignedPersonnel', sql.Int, assigned)
    .input('Outcome', sql.NVarChar(sql.MAX), compact(input.outcome, 4000))
    .input('Findings', sql.NVarChar(sql.MAX), compact(input.findings, 4000))
    .input('CorrectiveActions', sql.NVarChar(sql.MAX), nullable(input.correctiveActions, 4000))
    .input('DurationMinutes', sql.Int, Number(input.duration || 0))
    .input('Location', sql.NVarChar(180), compact(input.location, 180))
    .input('Actor', sql.NVarChar(120), compact(actor, 120))
    .query(`
      IF EXISTS (SELECT 1 FROM [it].[EmergencyDrills] WHERE [DrillId]=@DrillId)
        UPDATE [it].[EmergencyDrills] SET
          [DrillDate]=@DrillDate, [DrillType]=@DrillType, [Participants]=@Participants,
          [AssignedPersonnel]=@AssignedPersonnel, [Outcome]=@Outcome, [Findings]=@Findings,
          [CorrectiveActions]=@CorrectiveActions, [DurationMinutes]=@DurationMinutes, [Location]=@Location,
          [UpdatedAt]=SYSUTCDATETIME(), [UpdatedBy]=@Actor
        WHERE [DrillId]=@DrillId
      ELSE
        INSERT INTO [it].[EmergencyDrills] (
          [DrillId], [DrillDate], [DrillType], [Participants], [AssignedPersonnel], [Outcome], [Findings],
          [CorrectiveActions], [DurationMinutes], [Location], [CreatedBy], [UpdatedBy]
        ) VALUES (
          @DrillId, @DrillDate, @DrillType, @Participants, @AssignedPersonnel, @Outcome, @Findings,
          @CorrectiveActions, @DurationMinutes, @Location, @Actor, @Actor
        )
    `);
  return drillId;
};

export const upsertEWaste = async (input: Partial<EWasteRecord>, actor: string) => {
  if (!compact(input.assetTag, 80) || !compact(input.assetDescription, 300)) throw new Error('Asset tag and description are required.');
  if (!compact(input.location, 180)) throw new Error('Select the asset location.');
  const pool = await poolOrThrow();
  const recordId = compact(input.recordId, 40) || await nextNumber(pool, 'EWasteRecords', 'RecordId', yearPrefix('EWS'));
  await pool
    .request()
    .input('RecordId', sql.NVarChar(40), recordId)
    .input('AssetTag', sql.NVarChar(80), compact(input.assetTag, 80))
    .input('SerialNumber', sql.NVarChar(80), nullable(input.serialNumber, 80))
    .input('AssetDescription', sql.NVarChar(300), compact(input.assetDescription, 300))
    .input('AssetType', sql.NVarChar(80), compact(input.assetType, 80) || 'Computers')
    .input('Location', sql.NVarChar(180), compact(input.location, 180))
    .input('DisposalReason', sql.NVarChar(300), nullable(input.disposalReason, 300))
    .input('DisposalDate', sql.Date, toDateOnly(input.disposalDate) || new Date())
    .input('ApprovalStatus', sql.NVarChar(40), compact(input.approvalStatus, 40) || 'Pending')
    .input('Vendor', sql.NVarChar(220), nullable(input.vendor, 220))
    .input('CertificateNumber', sql.NVarChar(120), nullable(input.certificateNumber, 120))
    .input('WorkflowStep', sql.Int, Math.max(1, Number(input.workflowStep || 1)))
    .input('Actor', sql.NVarChar(120), compact(actor, 120))
    .query(`
      IF EXISTS (SELECT 1 FROM [it].[EWasteRecords] WHERE [RecordId]=@RecordId)
        UPDATE [it].[EWasteRecords] SET
          [AssetTag]=@AssetTag, [SerialNumber]=@SerialNumber, [AssetDescription]=@AssetDescription,
          [AssetType]=@AssetType, [Location]=@Location, [DisposalReason]=@DisposalReason,
          [DisposalDate]=@DisposalDate, [ApprovalStatus]=@ApprovalStatus, [Vendor]=@Vendor,
          [CertificateNumber]=@CertificateNumber, [WorkflowStep]=@WorkflowStep,
          [UpdatedAt]=SYSUTCDATETIME(), [UpdatedBy]=@Actor
        WHERE [RecordId]=@RecordId
      ELSE
        INSERT INTO [it].[EWasteRecords] (
          [RecordId], [AssetTag], [SerialNumber], [AssetDescription], [AssetType], [Location],
          [DisposalReason], [DisposalDate], [ApprovalStatus], [Vendor], [CertificateNumber],
          [WorkflowStep], [CreatedBy], [UpdatedBy]
        ) VALUES (
          @RecordId, @AssetTag, @SerialNumber, @AssetDescription, @AssetType, @Location,
          @DisposalReason, @DisposalDate, @ApprovalStatus, @Vendor, @CertificateNumber,
          @WorkflowStep, @Actor, @Actor
        )
    `);
  return recordId;
};

const TABLES: Record<string, [string, string]> = {
  action: ['InspectionActions', 'ActionId'],
  hazid: ['HazidReports', 'ReportId'],
  bbs: ['BbsObservations', 'ObservationId'],
  drill: ['EmergencyDrills', 'DrillId'],
  ewaste: ['EWasteRecords', 'RecordId'],
};

export const deleteImsRecord = async (kind: keyof typeof TABLES, id: string) => {
  const table = TABLES[kind];
  if (!table || !compact(id, 40)) throw new Error('Choose a record to delete.');
  const pool = await poolOrThrow();
  await pool.request().input('Id', sql.NVarChar(40), compact(id, 40)).query(`
    DELETE FROM [it].[${table[0]}] WHERE [${table[1]}]=@Id
  `);
};
