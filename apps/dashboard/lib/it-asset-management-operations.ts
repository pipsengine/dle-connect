import sql from 'mssql';
import { readEmployeeDirectoryFromDb } from '@/lib/dle-enterprise-db';
import { getDleEnterpriseDbPool } from '@/lib/dle-enterprise-db';
import { ensureItAssetSchemaSql } from '@/lib/it-asset-sql-schema';
import { buildSoftwareLicenseMetrics } from '@/lib/it-software-alert-config';
import {
  appendItAssetAudit,
  buildItAssetDashboardPayload,
  createItAsset,
  createItInventory,
  createItMaintenance,
  ensureItAssetDb,
  listItAssets,
  listItAssignments,
  listItMaintenance,
  mapItAssetRow,
  newItId,
  updateItAsset,
  type ItAssetDashboardPayload,
  type ItAssetRecord,
  type ItAssignmentRecord,
  type ItInventoryRecord,
  type ItMaintenanceRecord,
  type ItProcurementRecord,
  type ItSoftwareLicenseRecord,
  type ItVendorRecord,
  type ItWarrantyRecord,
} from '@/lib/it-asset-management-store';

export type PaginatedResult<T> = { items: T[]; total: number; page: number; pageSize: number };

export type ItSoftwareCatalogRecord = {
  catalogId: string;
  productName: string;
  vendorName: string | null;
  category: string | null;
  edition: string | null;
  status: string;
  annualCost: number | null;
  updatedAt: string;
};

export type ItInstalledSoftwareRecord = {
  installId: string;
  productName: string;
  version: string | null;
  assetId: string | null;
  assetTag: string | null;
  installedOn: string | null;
  status: string;
  lastSeenAt: string | null;
  updatedAt: string;
};

export type ItSoftwareRequestRecord = {
  requestId: string;
  title: string;
  requesterName: string;
  department: string | null;
  priority: string;
  status: string;
  requestedOn: string | null;
  notes: string | null;
  updatedAt: string;
};

export type ItAuditLogRecord = {
  auditId: string;
  entityType: string;
  entityId: string;
  action: string;
  actor: string | null;
  details: string | null;
  createdAt: string;
};

export type ItEmployeeOption = {
  employeeCode: string;
  fullName: string;
  department: string;
  location: string;
  email: string;
};

const clean = (value: unknown, max = 200) => String(value ?? '').trim().slice(0, max);
const cleanNullable = (value: unknown, max = 200) => { const text = clean(value, max); return text || null; };
const toDate = (value: unknown) => { const text = cleanNullable(value, 40); if (!text) return null; const date = new Date(text); return Number.isNaN(date.getTime()) ? null : date; };
const toNumber = (value: unknown, fallback = 0) => { const n = Number(value); return Number.isFinite(n) ? n : fallback; };
const toIsoDate = (value: unknown) => { if (!value) return null; const date = value instanceof Date ? value : new Date(String(value)); return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10); };
const clampPage = (value: unknown) => Math.max(1, Math.min(500, toNumber(value, 1)));
const clampPageSize = (value: unknown) => Math.max(5, Math.min(100, toNumber(value, 25)));

const paginate = <T>(items: T[], page: number, pageSize: number): PaginatedResult<T> => {
  const start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), total: items.length, page, pageSize };
};

export const searchItEmployees = async (query = '', limit = 20): Promise<ItEmployeeOption[]> => {
  const rows = await readEmployeeDirectoryFromDb();
  if (!rows?.length) return [];
  const q = query.trim().toLowerCase();
  const filtered = rows.filter((row) => {
    if (!q) return true;
    return row.fullName.toLowerCase().includes(q)
      || row.employeeCode.toLowerCase().includes(q)
      || (row.department || '').toLowerCase().includes(q);
  });
  return filtered.slice(0, limit).map((row) => ({
    employeeCode: row.employeeCode,
    fullName: row.fullName,
    department: row.department || '',
    location: row.workLocation || row.officeLocation || '',
    email: row.officialEmail || row.email || row.personalEmail || '',
  }));
};

const parseRegisterSequence = (value: string) => {
  const match = value.trim().match(/^(DL-IT-AR-)(\d+)$/i);
  if (!match) return null;
  return { prefix: match[1].toUpperCase(), number: Number(match[2]) };
};

export const suggestNextAssetTag = async () => {
  const pool = await ensureItAssetDb();
  const result = await pool.request().query(`
    SELECT AssetTag, SourceAssetId, AssetId
    FROM [it].[Assets]
    WHERE AssetTag LIKE 'DL-IT-AR-%' OR SourceAssetId LIKE 'DL-IT-AR-%' OR AssetId LIKE 'DL-IT-AR-%'`);
  let maxTag = 0;
  let maxSource = 0;
  for (const row of result.recordset || []) {
    const tagParsed = parseRegisterSequence(String(row.AssetTag || ''));
    if (tagParsed) maxTag = Math.max(maxTag, tagParsed.number);
    for (const field of [row.SourceAssetId, row.AssetId]) {
      const parsed = parseRegisterSequence(String(field || ''));
      if (parsed) maxSource = Math.max(maxSource, parsed.number);
    }
  }
  const nextSource = maxSource + 1;
  const nextTag = maxTag + 1;
  return {
    sourceAssetId: `DL-IT-AR-${String(nextSource).padStart(4, '0')}`,
    assetTag: `DL-IT-AR-${String(nextTag).padStart(5, '0')}`,
  };
};

export const listItAuditLog = async (page = 1, pageSize = 25): Promise<PaginatedResult<ItAuditLogRecord>> => {
  const pool = await ensureItAssetDb();
  const p = clampPage(page);
  const size = clampPageSize(pageSize);
  const offset = (p - 1) * size;
  const countResult = await pool.request().query(`SELECT COUNT(1) AS total FROM [it].[AssetAuditLog]`);
  const total = Number(countResult.recordset?.[0]?.total || 0);
  const result = await pool.request()
    .input('offset', sql.Int, offset)
    .input('page_size', sql.Int, size)
    .query(`SELECT * FROM [it].[AssetAuditLog] ORDER BY CreatedAt DESC OFFSET @offset ROWS FETCH NEXT @page_size ROWS ONLY`);
  const items = (result.recordset || []).map((row: Record<string, unknown>) => ({
    auditId: clean(row.AuditId, 40),
    entityType: clean(row.EntityType, 40),
    entityId: clean(row.EntityId, 40),
    action: clean(row.Action, 80),
    actor: cleanNullable(row.Actor, 120),
    details: cleanNullable(row.Details, 4000),
    createdAt: toIsoDate(row.CreatedAt) || '',
  }));
  return { items, total, page: p, pageSize: size };
};

export const deleteItAsset = async (assetId: string, actor: string) => {
  const pool = await ensureItAssetDb();
  await pool.request()
    .input('asset_id', sql.NVarChar(40), assetId)
    .input('updated_by', sql.NVarChar(120), actor)
    .query(`UPDATE [it].[Assets] SET IsActive = 0, Status = 'Retired', UpdatedAt = SYSUTCDATETIME(), UpdatedBy = @updated_by WHERE AssetId = @asset_id`);
  await appendItAssetAudit(pool, 'asset', assetId, 'delete', actor);
};

export const updateItInventory = async (stockId: string, input: Partial<ItInventoryRecord>, actor: string) => {
  const pool = await ensureItAssetDb();
  await pool.request()
    .input('stock_id', sql.NVarChar(40), stockId)
    .input('name', sql.NVarChar(200), cleanNullable(input.name, 200))
    .input('category', sql.NVarChar(60), cleanNullable(input.category, 60))
    .input('quantity', sql.Int, input.quantity == null ? null : toNumber(input.quantity))
    .input('status', sql.NVarChar(40), cleanNullable(input.status, 40))
    .input('location', sql.NVarChar(180), cleanNullable(input.location, 180))
    .input('updated_by', sql.NVarChar(120), actor)
    .query(`UPDATE [it].[InventoryStock] SET
      Name = COALESCE(@name, Name), Category = COALESCE(@category, Category),
      Quantity = COALESCE(@quantity, Quantity), Status = COALESCE(@status, Status),
      Location = COALESCE(@location, Location), UpdatedAt = SYSUTCDATETIME(), UpdatedBy = @updated_by
      WHERE StockId = @stock_id`);
  await appendItAssetAudit(pool, 'inventory', stockId, 'update', actor);
};

export const deleteItInventory = async (stockId: string, actor: string) => {
  const pool = await ensureItAssetDb();
  await pool.request().input('stock_id', sql.NVarChar(40), stockId).query(`DELETE FROM [it].[InventoryStock] WHERE StockId = @stock_id`);
  await appendItAssetAudit(pool, 'inventory', stockId, 'delete', actor);
};

export const updateItMaintenance = async (maintenanceId: string, input: Partial<ItMaintenanceRecord>, actor: string) => {
  const pool = await ensureItAssetDb();
  await pool.request()
    .input('maintenance_id', sql.NVarChar(40), maintenanceId)
    .input('title', sql.NVarChar(200), cleanNullable(input.title, 200))
    .input('status', sql.NVarChar(40), cleanNullable(input.status, 40))
    .input('priority', sql.NVarChar(20), cleanNullable(input.priority, 20))
    .input('assigned_to', sql.NVarChar(180), cleanNullable(input.assignedTo, 180))
    .input('scheduled_date', sql.Date, toDate(input.scheduledDate))
    .input('notes', sql.NVarChar(sql.MAX), cleanNullable(input.notes, 4000))
    .input('updated_by', sql.NVarChar(120), actor)
    .query(`UPDATE [it].[MaintenanceRecords] SET
      Title = COALESCE(@title, Title), Status = COALESCE(@status, Status), Priority = COALESCE(@priority, Priority),
      AssignedTo = COALESCE(@assigned_to, AssignedTo), ScheduledDate = COALESCE(@scheduled_date, ScheduledDate),
      Notes = COALESCE(@notes, Notes), UpdatedAt = SYSUTCDATETIME(), UpdatedBy = @updated_by
      WHERE MaintenanceId = @maintenance_id`);
  if (input.status === 'Completed') {
    const record = (await listItMaintenance()).find((row) => row.maintenanceId === maintenanceId);
    if (record?.assetId) {
      const completedOn = new Date();
      const nextDue = new Date(completedOn);
      nextDue.setMonth(nextDue.getMonth() + 3);
      await pool.request()
        .input('asset_id', sql.NVarChar(40), record.assetId)
        .input('last_maintenance_date', sql.Date, completedOn)
        .input('next_pm_due', sql.Date, nextDue)
        .input('next_maintenance_date', sql.Date, nextDue)
        .input('updated_by', sql.NVarChar(120), actor)
        .query(`UPDATE [it].[Assets]
          SET PmStatus = 'OK',
              LastMaintenanceDate = @last_maintenance_date,
              NextPmDue = @next_pm_due,
              NextMaintenanceDate = @next_maintenance_date,
              UpdatedAt = SYSUTCDATETIME(),
              UpdatedBy = @updated_by
          WHERE AssetId = @asset_id`);
    }
  }
  await appendItAssetAudit(pool, 'maintenance', maintenanceId, 'update', actor);
};

export type MaintenanceScope = 'individual' | 'department' | 'location';
export type MaintenanceIntent = 'plan' | 'schedule' | 'perform';

const maintenanceIntentStatus = (intent: MaintenanceIntent, scheduledDate: string | null) => {
  if (intent === 'plan') return 'Planned';
  if (intent === 'perform') return 'In Progress';
  if (!scheduledDate) return 'Upcoming';
  const today = new Date().toISOString().slice(0, 10);
  if (scheduledDate < today) return 'Overdue';
  return 'Upcoming';
};

const resolveHardwareAssetsForScope = async (input: {
  scope: MaintenanceScope;
  assetId?: string;
  department?: string;
  location?: string;
  onlyPmDue?: boolean;
}) => {
  let assets = (await listItAssets()).filter((asset) => asset.assetType === 'Hardware');
  if (input.scope === 'individual') {
    if (!input.assetId) return [];
    assets = assets.filter((asset) => asset.assetId === input.assetId);
  } else if (input.scope === 'department') {
    if (!input.department?.trim()) return [];
    const department = input.department.trim().toLowerCase();
    assets = assets.filter((asset) => (asset.department || '').trim().toLowerCase() === department);
  } else if (input.scope === 'location') {
    if (!input.location?.trim()) return [];
    const location = input.location.trim().toLowerCase();
    assets = assets.filter((asset) => (asset.location || '').trim().toLowerCase() === location);
  }
  if (input.onlyPmDue) {
    assets = assets.filter((asset) => asset.pmStatus === 'OVERDUE' || asset.pmStatus === 'DUE');
  }
  return assets;
};

export const enrichMaintenanceRecords = (records: ItMaintenanceRecord[], assets: ItAssetRecord[]) => {
  const assetMap = new Map(assets.map((asset) => [asset.assetId, asset]));
  return records.map((record) => {
    const asset = record.assetId ? assetMap.get(record.assetId) : undefined;
    return {
      ...record,
      department: record.department || asset?.department || null,
      location: record.location || asset?.location || null,
    };
  });
};

export const scheduleItMaintenanceBatch = async (
  input: {
    scope: MaintenanceScope;
    intent: MaintenanceIntent;
    assetId?: string;
    department?: string;
    location?: string;
    maintenanceType: string;
    category: string;
    scheduledDate?: string;
    priority: string;
    assignedTo?: string;
    notes?: string;
    onlyPmDue?: boolean;
  },
  actor: string,
) => {
  const targets = await resolveHardwareAssetsForScope(input);
  if (!targets.length) {
    throw new Error('No assets matched the selected scope.');
  }

  const scheduledDate = input.scheduledDate || (input.intent === 'perform' ? new Date().toISOString().slice(0, 10) : null);
  if (input.intent === 'schedule' && !scheduledDate) {
    throw new Error('Scheduled date is required when scheduling maintenance.');
  }

  const status = maintenanceIntentStatus(input.intent, scheduledDate);
  const scopeNote = input.scope === 'department'
    ? `Department scope: ${input.department}`
    : input.scope === 'location'
      ? `Location scope: ${input.location}`
      : null;
  const notes = [input.notes?.trim(), scopeNote].filter(Boolean).join(' · ') || null;

  const created: ItMaintenanceRecord[] = [];
  for (const asset of targets) {
    const assetName = asset.model || asset.name;
    const title = `${input.maintenanceType} - ${assetName}`;
    const record = await createItMaintenance({
      title,
      assetId: asset.assetId,
      assetName,
      category: input.category || asset.category || 'Hardware',
      scheduledDate,
      priority: input.priority,
      status,
      assignedTo: input.assignedTo || asset.assignedEmployeeName || null,
      department: asset.department,
      location: asset.location,
      notes,
    }, actor);
    if (record) created.push(record);
  }

  await appendItAssetAudit(
    await ensureItAssetDb(),
    'maintenance',
    'batch',
    input.intent,
    actor,
    `${created.length} records (${input.scope})`,
  );

  return { created: created.length, records: created };
};

export const performItMaintenanceBatch = async (
  input: {
    operation: 'start' | 'complete';
    scope?: MaintenanceScope;
    maintenanceIds?: string[];
    department?: string;
    location?: string;
    statusFilter?: string;
  },
  actor: string,
) => {
  const assets = await listItAssets();
  let records = enrichMaintenanceRecords(await listItMaintenance(), assets)
    .filter((record) => record.status !== 'Completed' && record.status !== 'Cancelled');

  if (input.maintenanceIds?.length) {
    const selected = new Set(input.maintenanceIds);
    records = records.filter((record) => selected.has(record.maintenanceId));
  } else if (input.scope === 'department' && input.department) {
    const department = input.department.trim().toLowerCase();
    records = records.filter((record) => (record.department || '').trim().toLowerCase() === department);
  } else if (input.scope === 'location' && input.location) {
    const location = input.location.trim().toLowerCase();
    records = records.filter((record) => (record.location || '').trim().toLowerCase() === location);
  }

  if (input.statusFilter) {
    const status = input.statusFilter.trim().toLowerCase();
    records = records.filter((record) => record.status.toLowerCase() === status);
  }

  if (!records.length) throw new Error('No open maintenance records matched the selected scope.');

  const nextStatus = input.operation === 'start' ? 'In Progress' : 'Completed';
  for (const record of records) {
    await updateItMaintenance(record.maintenanceId, { status: nextStatus }, actor);
  }

  return { updated: records.length };
};

export const returnItAsset = async (assignmentId: string, actor: string) => {
  const pool = await ensureItAssetDb();
  if (assignmentId.startsWith('syn-')) {
    const assetId = assignmentId.slice(4);
    await pool.request()
      .input('asset_id', sql.NVarChar(40), assetId)
      .input('updated_by', sql.NVarChar(120), actor)
      .query(`UPDATE [it].[Assets]
        SET AssignedEmployeeId = NULL, AssignedEmployeeName = NULL, AssignedEmail = NULL, AssignedOn = NULL,
            RegisterStatus = 'IDLE', Status = 'In Stock', UpdatedAt = SYSUTCDATETIME(), UpdatedBy = @updated_by
        WHERE AssetId = @asset_id`);
    await appendItAssetAudit(pool, 'asset', assetId, 'return', actor);
    return;
  }

  const assignments = await listItAssignments();
  const assignment = assignments.find((row) => row.assignmentId === assignmentId);
  if (!assignment) throw new Error('Assignment not found.');
  const returnedOn = new Date();
  await pool.request()
    .input('assignment_id', sql.NVarChar(40), assignmentId)
    .input('returned_on', sql.Date, returnedOn)
    .query(`UPDATE [it].[AssetAssignments] SET Status = 'Returned', ReturnedOn = @returned_on, UpdatedAt = SYSUTCDATETIME() WHERE AssignmentId = @assignment_id`);
  await pool.request()
    .input('asset_id', sql.NVarChar(40), assignment.assetId)
    .input('updated_by', sql.NVarChar(120), actor)
    .query(`UPDATE [it].[Assets]
      SET AssignedEmployeeId = NULL, AssignedEmployeeName = NULL, AssignedEmail = NULL, AssignedOn = NULL,
          RegisterStatus = 'IDLE', Status = 'In Stock', UpdatedAt = SYSUTCDATETIME(), UpdatedBy = @updated_by
      WHERE AssetId = @asset_id`);
  await appendItAssetAudit(pool, 'assignment', assignmentId, 'return', actor, assignment.assetTag);
};

export const reassignItAsset = async (
  input: {
    assetId: string;
    employeeId?: string;
    employeeName: string;
    assignedEmail?: string;
    department?: string;
    location?: string;
    notes?: string;
  },
  actor: string,
) => {
  const pool = await ensureItAssetDb();
  const assets = await listItAssets();
  const asset = assets.find((row) => row.assetId === input.assetId);
  if (!asset) throw new Error('Asset not found.');
  if (!asset.assignedEmployeeName) throw new Error('Asset is not currently assigned.');

  const assignedOn = new Date();
  const assignments = await listItAssignments();
  const activeFormal = assignments.find((row) => row.assetId === input.assetId && row.status === 'Assigned');

  if (activeFormal) {
    await pool.request()
      .input('assignment_id', sql.NVarChar(40), activeFormal.assignmentId)
      .input('employee_id', sql.NVarChar(40), cleanNullable(input.employeeId, 40))
      .input('employee_name', sql.NVarChar(220), clean(input.employeeName, 220))
      .input('department', sql.NVarChar(180), cleanNullable(input.department, 180))
      .input('location', sql.NVarChar(180), cleanNullable(input.location, 180))
      .input('assigned_on', sql.Date, assignedOn)
      .input('notes', sql.NVarChar(sql.MAX), cleanNullable(input.notes, 4000))
      .query(`UPDATE [it].[AssetAssignments] SET
        EmployeeId = @employee_id, EmployeeName = @employee_name, Department = @department,
        Location = @location, AssignedOn = @assigned_on, Notes = COALESCE(@notes, Notes),
        UpdatedAt = SYSUTCDATETIME()
        WHERE AssignmentId = @assignment_id`);
    await appendItAssetAudit(pool, 'assignment', activeFormal.assignmentId, 'reassign', actor, asset.assetTag);
  } else {
    const assignmentId = newItId('asn');
    await pool.request()
      .input('assignment_id', sql.NVarChar(40), assignmentId)
      .input('asset_id', sql.NVarChar(40), asset.assetId)
      .input('asset_tag', sql.NVarChar(40), asset.assetTag)
      .input('asset_name', sql.NVarChar(200), asset.name)
      .input('asset_type', sql.NVarChar(40), asset.assetType)
      .input('employee_id', sql.NVarChar(40), cleanNullable(input.employeeId, 40))
      .input('employee_name', sql.NVarChar(220), clean(input.employeeName, 220))
      .input('department', sql.NVarChar(180), cleanNullable(input.department, 180))
      .input('location', sql.NVarChar(180), cleanNullable(input.location, 180))
      .input('status', sql.NVarChar(40), 'Assigned')
      .input('assigned_on', sql.Date, assignedOn)
      .input('notes', sql.NVarChar(sql.MAX), cleanNullable(input.notes, 4000))
      .input('created_by', sql.NVarChar(120), actor)
      .query(`INSERT INTO [it].[AssetAssignments] (AssignmentId, AssetId, AssetTag, AssetName, AssetType, EmployeeId, EmployeeName, Department, Location, Status, AssignedOn, Notes, CreatedBy)
              VALUES (@assignment_id, @asset_id, @asset_tag, @asset_name, @asset_type, @employee_id, @employee_name, @department, @location, @status, @assigned_on, @notes, @created_by)`);
    await appendItAssetAudit(pool, 'assignment', assignmentId, 'assign', actor, asset.assetTag);
  }

  await updateItAsset(asset.assetId, {
    assignedEmployeeId: input.employeeId || null,
    assignedEmployeeName: input.employeeName,
    assignedEmail: input.assignedEmail || null,
    assignedOn: assignedOn.toISOString().slice(0, 10),
    registerStatus: 'IN USE',
    status: 'Active',
    department: input.department || asset.department,
    location: input.location || asset.location,
  }, actor);

  return listItAssignments().then((rows) => rows.find((row) => row.assetId === input.assetId && row.status === 'Assigned') || null);
};

export const buildMergedAssignments = (assets: ItAssetRecord[], formal: ItAssignmentRecord[]) => {
  const activeFormal = formal.filter((row) => row.status === 'Assigned');
  const formalAssetIds = new Set(activeFormal.map((row) => row.assetId));
  const synthetic = assets
    .filter((asset) => asset.assignedEmployeeName && !formalAssetIds.has(asset.assetId))
    .map((asset) => ({
      assignmentId: `syn-${asset.assetId}`,
      assetId: asset.assetId,
      assetTag: asset.assetTag,
      assetName: asset.model || asset.name,
      assetType: asset.assetType,
      employeeId: asset.assignedEmployeeId,
      employeeName: asset.assignedEmployeeName || '',
      department: asset.department,
      location: asset.location,
      status: 'Assigned',
      assignedOn: asset.assignedOn,
      returnedOn: null,
      notes: null,
      updatedAt: asset.updatedAt,
    }));
  return [...activeFormal, ...synthetic].sort((a, b) => String(b.assignedOn || '').localeCompare(String(a.assignedOn || '')));
};

const genericInsert = async (
  table: string,
  columns: string[],
  values: string[],
  inputs: Record<string, { type: unknown; value: unknown }>,
  actor: string,
  entityType: string,
  entityId: string,
  action: string,
) => {
  const pool = await ensureItAssetDb();
  const request = pool.request();
  for (const [key, config] of Object.entries(inputs)) {
    request.input(key, config.type as unknown as sql.ISqlType, config.value);
  }
  await request.query(`INSERT INTO [it].[${table}] (${columns.join(', ')}) VALUES (${values.join(', ')})`);
  await appendItAssetAudit(pool, entityType, entityId, action, actor);
  return entityId;
};

export const createItVendor = async (input: Partial<ItVendorRecord>, actor: string) => {
  const vendorId = newItId('vnd');
  await genericInsert('Vendors',
    ['VendorId', 'Name', 'Category', 'ContactName', 'Email', 'Phone', 'Website', 'Location', 'Status', 'Rating', 'SpendYtd', 'UpdatedBy'],
    ['@vendor_id', '@name', '@category', '@contact_name', '@email', '@phone', '@website', '@location', '@status', '@rating', '@spend_ytd', '@updated_by'],
    {
      vendor_id: { type: sql.NVarChar(40), value: vendorId },
      name: { type: sql.NVarChar(200), value: clean(input.name, 200) || 'Vendor' },
      category: { type: sql.NVarChar(80), value: cleanNullable(input.category, 80) },
      contact_name: { type: sql.NVarChar(180), value: cleanNullable(input.contactName, 180) },
      email: { type: sql.NVarChar(180), value: cleanNullable(input.email, 180) },
      phone: { type: sql.NVarChar(60), value: cleanNullable(input.phone, 60) },
      website: { type: sql.NVarChar(220), value: cleanNullable(input.website, 220) },
      location: { type: sql.NVarChar(180), value: cleanNullable(input.location, 180) },
      status: { type: sql.NVarChar(40), value: clean(input.status, 40) || 'Active' },
      rating: { type: sql.Decimal(4, 2), value: input.rating ?? null },
      spend_ytd: { type: sql.Decimal(19, 2), value: input.spendYtd ?? null },
      updated_by: { type: sql.NVarChar(120), value: actor },
    }, actor, 'vendor', vendorId, 'create');
  return vendorId;
};

export const createItWarranty = async (input: Partial<ItWarrantyRecord>, actor: string) => {
  const warrantyId = newItId('wty');
  await genericInsert('Warranties',
    ['WarrantyId', 'AssetId', 'AssetTag', 'AssetName', 'Provider', 'CoverageType', 'StartDate', 'EndDate', 'Status', 'CoverageValue', 'UpdatedBy'],
    ['@warranty_id', '@asset_id', '@asset_tag', '@asset_name', '@provider', '@coverage_type', '@start_date', '@end_date', '@status', '@coverage_value', '@updated_by'],
    {
      warranty_id: { type: sql.NVarChar(40), value: warrantyId },
      asset_id: { type: sql.NVarChar(40), value: cleanNullable(input.assetId, 40) },
      asset_tag: { type: sql.NVarChar(40), value: cleanNullable(input.assetTag, 40) },
      asset_name: { type: sql.NVarChar(200), value: clean(input.assetName, 200) || 'Asset' },
      provider: { type: sql.NVarChar(180), value: cleanNullable(input.provider, 180) },
      coverage_type: { type: sql.NVarChar(80), value: cleanNullable(input.coverageType, 80) },
      start_date: { type: sql.Date, value: toDate(input.startDate) },
      end_date: { type: sql.Date, value: toDate(input.endDate) },
      status: { type: sql.NVarChar(40), value: clean(input.status, 40) || 'Active' },
      coverage_value: { type: sql.Decimal(19, 2), value: input.coverageValue ?? null },
      updated_by: { type: sql.NVarChar(120), value: actor },
    }, actor, 'warranty', warrantyId, 'create');
  return warrantyId;
};

export const createItProcurement = async (input: Partial<ItProcurementRecord>, actor: string) => {
  const orderId = newItId('po');
  const orderNumber = clean(input.orderNumber, 40) || `PO-${Date.now().toString().slice(-6)}`;
  await genericInsert('ProcurementOrders',
    ['OrderId', 'OrderNumber', 'Title', 'VendorName', 'Category', 'Status', 'OrderDate', 'ExpectedDate', 'Amount', 'CreatedBy'],
    ['@order_id', '@order_number', '@title', '@vendor_name', '@category', '@status', '@order_date', '@expected_date', '@amount', '@created_by'],
    {
      order_id: { type: sql.NVarChar(40), value: orderId },
      order_number: { type: sql.NVarChar(40), value: orderNumber },
      title: { type: sql.NVarChar(200), value: clean(input.title, 200) || orderNumber },
      vendor_name: { type: sql.NVarChar(180), value: cleanNullable(input.vendorName, 180) },
      category: { type: sql.NVarChar(80), value: cleanNullable(input.category, 80) },
      status: { type: sql.NVarChar(40), value: clean(input.status, 40) || 'Draft' },
      order_date: { type: sql.Date, value: toDate(input.orderDate) },
      expected_date: { type: sql.Date, value: toDate(input.expectedDate) },
      amount: { type: sql.Decimal(19, 2), value: input.amount ?? null },
      created_by: { type: sql.NVarChar(120), value: actor },
    }, actor, 'procurement', orderId, 'create');
  return orderId;
};

export const createItSoftwareLicense = async (input: Partial<ItSoftwareLicenseRecord>, actor: string) => {
  const licenseId = newItId('lic');
  await genericInsert('SoftwareLicenses',
    ['LicenseId', 'ProductName', 'VendorName', 'LicenseType', 'SeatsTotal', 'SeatsUsed', 'ComplianceStatus', 'ExpiryDate', 'AnnualCost', 'UpdatedBy'],
    ['@license_id', '@product_name', '@vendor_name', '@license_type', '@seats_total', '@seats_used', '@compliance_status', '@expiry_date', '@annual_cost', '@updated_by'],
    {
      license_id: { type: sql.NVarChar(40), value: licenseId },
      product_name: { type: sql.NVarChar(200), value: clean(input.productName, 200) || 'Software' },
      vendor_name: { type: sql.NVarChar(180), value: cleanNullable(input.vendorName, 180) },
      license_type: { type: sql.NVarChar(60), value: clean(input.licenseType, 60) || 'Subscription' },
      seats_total: { type: sql.Int, value: toNumber(input.seatsTotal) },
      seats_used: { type: sql.Int, value: toNumber(input.seatsUsed) },
      compliance_status: { type: sql.NVarChar(40), value: clean(input.complianceStatus, 40) || 'In Compliance' },
      expiry_date: { type: sql.Date, value: toDate(input.expiryDate) },
      annual_cost: { type: sql.Decimal(19, 2), value: input.annualCost ?? null },
      updated_by: { type: sql.NVarChar(120), value: actor },
    }, actor, 'license', licenseId, 'create');
  return licenseId;
};

export const listItSoftwareCatalog = async () => {
  const pool = await ensureItAssetDb();
  const result = await pool.request().query(`SELECT * FROM [it].[SoftwareCatalog] ORDER BY UpdatedAt DESC`);
  return (result.recordset || []).map((row: Record<string, unknown>) => ({
    catalogId: clean(row.CatalogId, 40),
    productName: clean(row.ProductName, 200),
    vendorName: cleanNullable(row.VendorName, 180),
    category: cleanNullable(row.Category, 80),
    edition: cleanNullable(row.Edition, 120),
    status: clean(row.Status, 40),
    annualCost: row.AnnualCost == null ? null : toNumber(row.AnnualCost),
    updatedAt: toIsoDate(row.UpdatedAt) || '',
  })) as ItSoftwareCatalogRecord[];
};

export const createItSoftwareCatalog = async (input: Partial<ItSoftwareCatalogRecord>, actor: string) => {
  const catalogId = newItId('cat');
  await genericInsert('SoftwareCatalog',
    ['CatalogId', 'ProductName', 'VendorName', 'Category', 'Edition', 'Status', 'AnnualCost', 'UpdatedBy'],
    ['@catalog_id', '@product_name', '@vendor_name', '@category', '@edition', '@status', '@annual_cost', '@updated_by'],
    {
      catalog_id: { type: sql.NVarChar(40), value: catalogId },
      product_name: { type: sql.NVarChar(200), value: clean(input.productName, 200) || 'Product' },
      vendor_name: { type: sql.NVarChar(180), value: cleanNullable(input.vendorName, 180) },
      category: { type: sql.NVarChar(80), value: cleanNullable(input.category, 80) },
      edition: { type: sql.NVarChar(120), value: cleanNullable(input.edition, 120) },
      status: { type: sql.NVarChar(40), value: clean(input.status, 40) || 'Approved' },
      annual_cost: { type: sql.Decimal(19, 2), value: input.annualCost ?? null },
      updated_by: { type: sql.NVarChar(120), value: actor },
    }, actor, 'software-catalog', catalogId, 'create');
  return catalogId;
};

export const listItInstalledSoftware = async () => {
  const pool = await ensureItAssetDb();
  const result = await pool.request().query(`SELECT * FROM [it].[InstalledSoftware] ORDER BY UpdatedAt DESC`);
  return (result.recordset || []).map((row: Record<string, unknown>) => ({
    installId: clean(row.InstallId, 40),
    productName: clean(row.ProductName, 200),
    version: cleanNullable(row.Version, 80),
    assetId: cleanNullable(row.AssetId, 40),
    assetTag: cleanNullable(row.AssetTag, 40),
    installedOn: cleanNullable(row.InstalledOn, 220),
    status: clean(row.Status, 40),
    lastSeenAt: toIsoDate(row.LastSeenAt),
    updatedAt: toIsoDate(row.UpdatedAt) || '',
  })) as ItInstalledSoftwareRecord[];
};

export const createItInstalledSoftware = async (input: Partial<ItInstalledSoftwareRecord>, actor: string) => {
  const installId = newItId('ins');
  await genericInsert('InstalledSoftware',
    ['InstallId', 'ProductName', 'Version', 'AssetId', 'AssetTag', 'InstalledOn', 'Status', 'LastSeenAt', 'UpdatedBy'],
    ['@install_id', '@product_name', '@version', '@asset_id', '@asset_tag', '@installed_on', '@status', '@last_seen_at', '@updated_by'],
    {
      install_id: { type: sql.NVarChar(40), value: installId },
      product_name: { type: sql.NVarChar(200), value: clean(input.productName, 200) || 'Software' },
      version: { type: sql.NVarChar(80), value: cleanNullable(input.version, 80) },
      asset_id: { type: sql.NVarChar(40), value: cleanNullable(input.assetId, 40) },
      asset_tag: { type: sql.NVarChar(40), value: cleanNullable(input.assetTag, 40) },
      installed_on: { type: sql.NVarChar(220), value: cleanNullable(input.installedOn, 220) },
      status: { type: sql.NVarChar(40), value: clean(input.status, 40) || 'Active' },
      last_seen_at: { type: sql.Date, value: toDate(input.lastSeenAt) },
      updated_by: { type: sql.NVarChar(120), value: actor },
    }, actor, 'installed-software', installId, 'create');
  return installId;
};

export const listItSoftwareRequests = async () => {
  const pool = await ensureItAssetDb();
  const result = await pool.request().query(`SELECT * FROM [it].[SoftwareRequests] ORDER BY UpdatedAt DESC`);
  return (result.recordset || []).map((row: Record<string, unknown>) => ({
    requestId: clean(row.RequestId, 40),
    title: clean(row.Title, 200),
    requesterName: clean(row.RequesterName, 220),
    department: cleanNullable(row.Department, 180),
    priority: clean(row.Priority, 20),
    status: clean(row.Status, 40),
    requestedOn: toIsoDate(row.RequestedOn),
    notes: cleanNullable(row.Notes, 4000),
    updatedAt: toIsoDate(row.UpdatedAt) || '',
  })) as ItSoftwareRequestRecord[];
};

export const createItSoftwareRequest = async (input: Partial<ItSoftwareRequestRecord>, actor: string) => {
  const requestId = newItId('req');
  await genericInsert('SoftwareRequests',
    ['RequestId', 'Title', 'RequesterName', 'Department', 'Priority', 'Status', 'RequestedOn', 'Notes', 'CreatedBy'],
    ['@request_id', '@title', '@requester_name', '@department', '@priority', '@status', '@requested_on', '@notes', '@created_by'],
    {
      request_id: { type: sql.NVarChar(40), value: requestId },
      title: { type: sql.NVarChar(200), value: clean(input.title, 200) || 'Software request' },
      requester_name: { type: sql.NVarChar(220), value: clean(input.requesterName, 220) || actor },
      department: { type: sql.NVarChar(180), value: cleanNullable(input.department, 180) },
      priority: { type: sql.NVarChar(20), value: clean(input.priority, 20) || 'Medium' },
      status: { type: sql.NVarChar(40), value: clean(input.status, 40) || 'Open' },
      requested_on: { type: sql.Date, value: toDate(input.requestedOn) || new Date() },
      notes: { type: sql.NVarChar(sql.MAX), value: cleanNullable(input.notes, 4000) },
      created_by: { type: sql.NVarChar(120), value: actor },
    }, actor, 'software-request', requestId, 'create');
  return requestId;
};

export const buildItAssetSectionPayload = async (section: string, options?: {
  page?: number;
  pageSize?: number;
  category?: string;
  subCategory?: string;
  search?: string;
  department?: string;
  location?: string;
  status?: string;
  manufacturer?: string;
  model?: string;
  registerStatus?: string;
  pmStatus?: string;
  condition?: string;
  assignedTo?: string;
  vendor?: string;
}) => {
  const payload = await buildItAssetDashboardPayload();
  const page = clampPage(options?.page);
  const pageSize = clampPageSize(options?.pageSize);
  const search = (options?.search || '').trim().toLowerCase();
  const eq = (left: string | null | undefined, right: string | undefined) => {
    if (!right) return true;
    return String(left || '').trim().toLowerCase() === right.trim().toLowerCase();
  };

  const filterRows = <T extends Record<string, unknown>>(rows: T[], fields: (keyof T)[]) => {
    if (!search) return rows;
    return rows.filter((row) => fields.some((field) => String(row[field] ?? '').toLowerCase().includes(search)));
  };

  const uniqueSorted = (values: Array<string | null | undefined>) =>
    Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));

  if (section === 'assets' || section === 'hardware') {
    let assets = payload.assets.filter((asset) => asset.assetType === 'Hardware');
    if (options?.category) assets = assets.filter((asset) => asset.category === options.category);
    if (options?.subCategory) assets = assets.filter((asset) => asset.subCategory === options.subCategory);

    const filterOptions = {
      manufacturers: uniqueSorted(assets.map((asset) => asset.manufacturer)),
      models: uniqueSorted(assets.map((asset) => asset.model || asset.name)),
      types: uniqueSorted(assets.map((asset) => asset.subCategory || asset.category)),
      departments: uniqueSorted(assets.map((asset) => asset.department)),
      locations: uniqueSorted(assets.map((asset) => asset.location)),
      assignedTo: uniqueSorted([
        ...assets.map((asset) => asset.assignedEmployeeName),
        assets.some((asset) => !asset.assignedEmployeeName) ? 'Unassigned' : null,
      ]),
      registerStatuses: uniqueSorted(assets.map((asset) => asset.registerStatus || asset.status)),
      pmStatuses: uniqueSorted(assets.map((asset) => asset.pmStatus || 'NONE')),
      conditions: uniqueSorted(assets.map((asset) => asset.assetCondition)),
    };

    if (options?.manufacturer) assets = assets.filter((asset) => eq(asset.manufacturer, options.manufacturer));
    if (options?.model) {
      const model = options.model.trim().toLowerCase();
      assets = assets.filter((asset) => String(asset.model || asset.name || '').trim().toLowerCase() === model);
    }
    if (options?.department) assets = assets.filter((asset) => eq(asset.department, options.department));
    if (options?.location) assets = assets.filter((asset) => eq(asset.location, options.location));
    if (options?.registerStatus) {
      assets = assets.filter((asset) => eq(asset.registerStatus || asset.status, options.registerStatus));
    }
    if (options?.pmStatus) {
      const pm = options.pmStatus.trim().toLowerCase();
      assets = assets.filter((asset) => String(asset.pmStatus || 'NONE').trim().toLowerCase() === pm);
    }
    if (options?.condition) assets = assets.filter((asset) => eq(asset.assetCondition, options.condition));
    if (options?.assignedTo) {
      const assigned = options.assignedTo.trim().toLowerCase();
      if (assigned === 'unassigned') {
        assets = assets.filter((asset) => !String(asset.assignedEmployeeName || '').trim());
      } else {
        assets = assets.filter((asset) => String(asset.assignedEmployeeName || '').trim().toLowerCase() === assigned);
      }
    }
    if (options?.status) assets = assets.filter((asset) => eq(asset.status, options.status));

    assets = filterRows(
      assets as unknown as Record<string, unknown>[],
      ['name', 'assetTag', 'model', 'manufacturer', 'category', 'subCategory', 'department', 'location', 'assignedEmployeeName', 'assignedEmail', 'registerStatus', 'status', 'pmStatus', 'assetCondition'],
    ) as ItAssetRecord[];

    const paged = paginate(assets, page, pageSize);
    return {
      ...payload,
      assets: paged.items,
      pagination: paged,
      filterOptions,
    };
  }
  if (section === 'inventory') {
    const inventory = filterRows(payload.inventory as unknown as Record<string, unknown>[], ['name', 'sku']) as ItInventoryRecord[];
    return { ...payload, inventory: paginate(inventory, page, pageSize).items, pagination: paginate(inventory, page, pageSize) };
  }
  if (section === 'assignments') {
    const merged = buildMergedAssignments(payload.assets, payload.assignments);
    const assignments = filterRows(merged as unknown as Record<string, unknown>[], ['assetName', 'employeeName', 'assetTag']) as ItAssignmentRecord[];
    return { ...payload, assignments: paginate(assignments, page, pageSize).items, pagination: paginate(assignments, page, pageSize) };
  }
  if (section === 'maintenance') {
    let maintenance = enrichMaintenanceRecords(payload.maintenance, payload.assets);
    if (options?.department) {
      const department = options.department.trim().toLowerCase();
      maintenance = maintenance.filter((row) => (row.department || '').trim().toLowerCase() === department);
    }
    if (options?.location) {
      const location = options.location.trim().toLowerCase();
      maintenance = maintenance.filter((row) => (row.location || '').trim().toLowerCase() === location);
    }
    if (options?.status) {
      const status = options.status.trim().toLowerCase();
      maintenance = maintenance.filter((row) => row.status.toLowerCase() === status);
    }
    maintenance = filterRows(maintenance as unknown as Record<string, unknown>[], ['title', 'assetName', 'department', 'location']) as ItMaintenanceRecord[];
    return { ...payload, maintenance: paginate(maintenance, page, pageSize).items, pagination: paginate(maintenance, page, pageSize) };
  }
  if (section === 'software-catalog') {
    let catalog = await listItSoftwareCatalog();
    const filterOptions = {
      vendors: Array.from(new Set(catalog.map((row) => row.vendorName).filter(Boolean) as string[])).sort(),
      statuses: Array.from(new Set(catalog.map((row) => row.status).filter(Boolean))).sort(),
      categories: Array.from(new Set(catalog.map((row) => row.category).filter(Boolean) as string[])).sort(),
    };
    if (options?.vendor) {
      const value = options.vendor.trim().toLowerCase();
      catalog = catalog.filter((row) => String(row.vendorName || '').trim().toLowerCase() === value);
    }
    if (options?.status) {
      const value = options.status.trim().toLowerCase();
      catalog = catalog.filter((row) => row.status.toLowerCase() === value);
    }
    catalog = filterRows(catalog as unknown as Record<string, unknown>[], ['productName', 'vendorName', 'category', 'edition', 'status']) as typeof catalog;
    const paged = paginate(catalog, page, pageSize);
    return {
      ...payload,
      softwareCatalog: paged.items,
      pagination: paged,
      filterOptions,
    };
  }
  if (section === 'licenses' || section === 'license-compliance') {
    let licenses = [...(payload.licenses || [])];
    const metrics = buildSoftwareLicenseMetrics(licenses);
    const filterOptions = {
      vendors: Array.from(new Set(licenses.map((row) => row.vendorName).filter(Boolean) as string[])).sort(),
      statuses: Array.from(new Set(licenses.map((row) => row.complianceStatus).filter(Boolean))).sort(),
    };
    if (section === 'license-compliance') {
      licenses = licenses.filter((row) => !['In Compliance'].includes(row.complianceStatus));
    }
    if (options?.vendor) {
      const value = options.vendor.trim().toLowerCase();
      licenses = licenses.filter((row) => String(row.vendorName || '').trim().toLowerCase() === value);
    }
    if (options?.status) {
      const value = options.status.trim().toLowerCase();
      licenses = licenses.filter((row) => row.complianceStatus.toLowerCase() === value);
    }
    licenses = filterRows(licenses as unknown as Record<string, unknown>[], ['productName', 'vendorName', 'licenseType', 'complianceStatus']) as typeof licenses;
    const paged = paginate(licenses, page, pageSize);
    return {
      ...payload,
      licenses: paged.items,
      pagination: paged,
      filterOptions,
      softwareMetrics: metrics,
    };
  }
  if (section === 'installed-software') {
    let installed = await listItInstalledSoftware();
    installed = filterRows(installed as unknown as Record<string, unknown>[], ['productName', 'version', 'installedOn', 'status', 'assetTag']) as typeof installed;
    const paged = paginate(installed, page, pageSize);
    return { ...payload, installedSoftware: paged.items, pagination: paged };
  }
  if (section === 'software-requests') {
    let requests = await listItSoftwareRequests();
    requests = filterRows(requests as unknown as Record<string, unknown>[], ['title', 'requesterName', 'department', 'priority', 'status']) as typeof requests;
    const paged = paginate(requests, page, pageSize);
    return { ...payload, softwareRequests: paged.items, pagination: paged };
  }
  if (section === 'audit') {
    const audit = await listItAuditLog(page, pageSize);
    return { ...payload, auditLog: audit.items, pagination: audit };
  }
  return payload;
};

export const initializeItAssetManagementRobust = async (actor: string) => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new Error('DLE_Enterprise database is not configured.');
  await pool.request().query(ensureItAssetSchemaSql);
  const payload = await buildItAssetDashboardPayload();
  if (payload.summary.totalAssets === 0) {
    const seedAssets: Array<Partial<ItAssetRecord>> = [
      { assetTag: 'AST-10045', name: 'MacBook Pro 16"', assetType: 'Hardware', category: 'Laptop', subCategory: 'Laptop', status: 'Active', warrantyStatus: 'Good', location: 'Lagos Office', department: 'IT', purchaseCost: 1850000 },
      { assetTag: 'AST-10046', name: 'Dell OptiPlex 7090', assetType: 'Hardware', category: 'Desktop', subCategory: 'Desktop', status: 'Active', warrantyStatus: 'Good', location: 'Abuja Office', department: 'Finance', purchaseCost: 620000 },
      { assetTag: 'AST-10048', name: 'Cisco Catalyst 9300', assetType: 'Hardware', category: 'Network', subCategory: 'Switch', status: 'Active', warrantyStatus: 'Good', location: 'Head Office', department: 'IT', purchaseCost: 2400000 },
      { assetTag: 'AST-10051', name: 'Cisco ISR 4331', assetType: 'Hardware', category: 'Network', subCategory: 'Router', status: 'Active', warrantyStatus: 'Good', location: 'Head Office', department: 'IT', purchaseCost: 1800000 },
      { assetTag: 'AST-10052', name: 'FortiGate 60F', assetType: 'Hardware', category: 'Network', subCategory: 'Firewall', status: 'Active', warrantyStatus: 'Good', location: 'Head Office', department: 'IT', purchaseCost: 950000 },
      { assetTag: 'AST-10050', name: 'Dell PowerEdge R760', assetType: 'Hardware', category: 'Server', subCategory: 'Server', status: 'Active', warrantyStatus: 'Good', location: 'Data Center', department: 'IT', purchaseCost: 5200000 },
    ];
    for (const asset of seedAssets) await createItAsset(asset, actor);
  }
  if (payload.inventory.length === 0) {
    await createItInventory({ sku: 'LT-014', name: 'ThinkPad T14', category: 'Laptop', quantity: 24, status: 'Available', location: 'Lagos Office' }, actor);
    await createItInventory({ sku: 'NW-440', name: 'Cisco Catalyst 9300', category: 'Network', quantity: 3, status: 'Low Stock', location: 'Head Office' }, actor);
  }
  if (payload.maintenance.length === 0) {
    await createItMaintenance({ title: 'Quarterly UPS Inspection', assetName: 'APC Smart-UPS 1500VA', category: 'Hardware', scheduledDate: new Date().toISOString().slice(0, 10), priority: 'High', status: 'In Progress', assignedTo: 'Michael Brown' }, actor);
  }
  if (payload.licenses.length === 0) {
    await createItSoftwareLicense({ productName: 'Microsoft 365 E3', vendorName: 'Microsoft', licenseType: 'Subscription', seatsTotal: 250, seatsUsed: 214, complianceStatus: 'In Compliance', expiryDate: `${new Date().getFullYear()}-12-31`, annualCost: 12500000 }, actor);
  }
  if (payload.vendors.length === 0) {
    await createItVendor({ name: 'Dell Technologies', category: 'Hardware', email: 'sales@dell.com', location: 'Lagos', status: 'Active', rating: 4.6, spendYtd: 18500000 }, actor);
  }
  if (payload.warranties.length === 0) {
    const server = (await listItAssets()).find((asset) => asset.category === 'Server');
    await createItWarranty({ assetId: server?.assetId || null, assetTag: server?.assetTag || null, assetName: server?.name || 'Dell PowerEdge R760', provider: 'Dell ProSupport', coverageType: 'Premium', startDate: `${new Date().getFullYear()}-01-01`, endDate: `${new Date().getFullYear() + 2}-12-31`, status: 'Active', coverageValue: 5200000 }, actor);
  }
  if (payload.procurement.length === 0) {
    await createItProcurement({ orderNumber: 'PO-2026-0142', title: 'Laptop refresh batch', vendorName: 'Dell Technologies', category: 'Hardware', status: 'Pending Receipt', orderDate: new Date().toISOString().slice(0, 10), expectedDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10), amount: 9200000 }, actor);
  }
  const catalog = await listItSoftwareCatalog();
  if (!catalog.length) {
    await createItSoftwareCatalog({ productName: 'Microsoft 365 E3', vendorName: 'Microsoft', category: 'Productivity', edition: 'Enterprise', status: 'Approved', annualCost: 12500000 }, actor);
    await createItSoftwareCatalog({ productName: 'Adobe Acrobat Pro', vendorName: 'Adobe', category: 'Document', edition: 'Standard', status: 'Approved', annualCost: 2400000 }, actor);
  }
  const installed = await listItInstalledSoftware();
  if (!installed.length) {
    const laptop = (await listItAssets()).find((asset) => asset.category === 'Laptop');
    await createItInstalledSoftware({ productName: 'Microsoft Teams', version: '24145', assetId: laptop?.assetId || null, assetTag: laptop?.assetTag || null, installedOn: laptop?.assignedEmployeeName || 'IT Pool', status: 'Active', lastSeenAt: new Date().toISOString().slice(0, 10) }, actor);
  }
  const requests = await listItSoftwareRequests();
  if (!requests.length) {
    await createItSoftwareRequest({ title: 'Figma Enterprise license', requesterName: 'Design Lead', department: 'Product', priority: 'High', status: 'Open', requestedOn: new Date().toISOString().slice(0, 10) }, actor);
  }
  const pool2 = await ensureItAssetDb();
  await appendItAssetAudit(pool2, 'module', 'asset-management', 'initialize', actor, 'Ensured starter IT asset records');
  return buildItAssetDashboardPayload();
};

export const exportItAssetCsv = async (section: string) => {
  const payload = await buildItAssetDashboardPayload();
  const esc = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const toCsv = (headers: string[], rows: unknown[][]) => [headers.map(esc).join(','), ...rows.map((row) => row.map(esc).join(','))].join('\n');
  if (section === 'assets' || section === 'hardware') {
    return toCsv(['Tag', 'Name', 'Category', 'SubCategory', 'Status', 'Assigned To', 'Location'], payload.assets.map((row) => [row.assetTag, row.name, row.category, row.subCategory, row.status, row.assignedEmployeeName, row.location]));
  }
  if (section === 'inventory') {
    return toCsv(['SKU', 'Name', 'Category', 'Quantity', 'Status', 'Location'], payload.inventory.map((row) => [row.sku, row.name, row.category, row.quantity, row.status, row.location]));
  }
  if (section === 'assignments') {
    return toCsv(['Asset', 'Employee', 'Department', 'Status', 'Assigned On'], payload.assignments.map((row) => [row.assetName, row.employeeName, row.department, row.status, row.assignedOn]));
  }
  if (section === 'licenses' || section === 'license-compliance' || section === 'software') {
    return toCsv(
      ['Product', 'Vendor', 'License Type', 'Seats Used', 'Seats Total', 'Compliance', 'Expiry', 'Annual Cost'],
      payload.licenses.map((row) => [row.productName, row.vendorName, row.licenseType, row.seatsUsed, row.seatsTotal, row.complianceStatus, row.expiryDate, row.annualCost]),
    );
  }
  if (section === 'software-catalog') {
    const catalog = await listItSoftwareCatalog();
    return toCsv(
      ['Product', 'Vendor', 'Category', 'Edition', 'Status', 'Annual Cost'],
      catalog.map((row) => [row.productName, row.vendorName, row.category, row.edition, row.status, row.annualCost]),
    );
  }
  if (section === 'installed-software') {
    const installed = await listItInstalledSoftware();
    return toCsv(
      ['Product', 'Version', 'Asset Tag', 'Installed On', 'Status'],
      installed.map((row) => [row.productName, row.version, row.assetTag, row.installedOn, row.status]),
    );
  }
  if (section === 'software-requests') {
    const requests = await listItSoftwareRequests();
    return toCsv(
      ['Title', 'Requester', 'Department', 'Priority', 'Status', 'Requested On'],
      requests.map((row) => [row.title, row.requesterName, row.department, row.priority, row.status, row.requestedOn]),
    );
  }
  return toCsv(['Section', 'Records'], [[section, payload.summary.totalAssets]]);
};
