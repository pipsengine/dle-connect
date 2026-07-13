import sql from 'mssql';
import { getDleEnterpriseDbPool } from '@/lib/dle-enterprise-db';
import { ensureItAssetSchemaSql } from '@/lib/it-asset-sql-schema';

const dbReady = { value: false };
export const nowItIso = () => new Date().toISOString();
export const newItId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const nowIso = nowItIso;
const newId = newItId;
const clean = (value: unknown, max = 200) => String(value ?? '').trim().slice(0, max);
const cleanNullable = (value: unknown, max = 200) => {
  const text = clean(value, max);
  return text || null;
};
const toDate = (value: unknown) => {
  const text = cleanNullable(value, 40);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
};
const toNumber = (value: unknown, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const toIsoDate = (value: unknown) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
};

export type ItAssetRecord = {
  assetId: string;
  assetTag: string;
  name: string;
  assetType: string;
  category: string;
  subCategory: string | null;
  serialNumber: string | null;
  status: string;
  warrantyStatus: string | null;
  location: string | null;
  department: string | null;
  ownerUnit: string | null;
  assignedEmployeeId: string | null;
  assignedEmployeeName: string | null;
  assignedOn: string | null;
  purchaseDate: string | null;
  warrantyExpiry: string | null;
  purchaseCost: number | null;
  notes: string | null;
  model: string | null;
  manufacturer: string | null;
  assignedEmail: string | null;
  assetCondition: string | null;
  operatingSystem: string | null;
  pmStatus: string | null;
  nextPmDue: string | null;
  lastMaintenanceDate: string | null;
  nextMaintenanceDate: string | null;
  registerStatus: string | null;
  sourceAssetId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ItInventoryRecord = {
  stockId: string;
  sku: string;
  name: string;
  category: string;
  quantity: number;
  status: string;
  location: string | null;
  updatedAt: string;
};

export type ItMaintenanceRecord = {
  maintenanceId: string;
  title: string;
  assetId: string | null;
  assetName: string;
  category: string;
  scheduledDate: string | null;
  priority: string;
  status: string;
  assignedTo: string | null;
  department: string | null;
  location: string | null;
  notes: string | null;
  updatedAt: string;
};

export type ItAssignmentRecord = {
  assignmentId: string;
  assetId: string;
  assetTag: string;
  assetName: string;
  assetType: string;
  employeeId: string | null;
  employeeName: string;
  department: string | null;
  location: string | null;
  status: string;
  assignedOn: string | null;
  returnedOn: string | null;
  notes: string | null;
  updatedAt: string;
};

export type ItSoftwareLicenseRecord = {
  licenseId: string;
  productName: string;
  vendorName: string | null;
  licenseType: string;
  seatsTotal: number;
  seatsUsed: number;
  complianceStatus: string;
  expiryDate: string | null;
  annualCost: number | null;
  updatedAt: string;
};

export type ItVendorRecord = {
  vendorId: string;
  name: string;
  category: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  location: string | null;
  status: string;
  rating: number | null;
  spendYtd: number | null;
  updatedAt: string;
};

export type ItWarrantyRecord = {
  warrantyId: string;
  assetId: string | null;
  assetTag: string | null;
  assetName: string;
  provider: string | null;
  coverageType: string | null;
  startDate: string | null;
  endDate: string | null;
  status: string;
  coverageValue: number | null;
  updatedAt: string;
};

export type ItProcurementRecord = {
  orderId: string;
  orderNumber: string;
  title: string;
  vendorName: string | null;
  category: string | null;
  status: string;
  orderDate: string | null;
  expectedDate: string | null;
  amount: number | null;
  updatedAt: string;
};

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

export type ItAssetDashboardPayload = {
  generatedAt: string;
  source: string;
  databaseAvailable: boolean;
  summary: {
    totalAssets: number;
    activeAssets: number;
    warrantyAlerts: number;
    maintenanceDue: number;
    inventoryItems: number;
    assignedAssets: number;
    unassignedAssets: number;
    totalAssetValue: number;
  };
  assets: ItAssetRecord[];
  inventory: ItInventoryRecord[];
  maintenance: ItMaintenanceRecord[];
  assignments: ItAssignmentRecord[];
  licenses: ItSoftwareLicenseRecord[];
  vendors: ItVendorRecord[];
  warranties: ItWarrantyRecord[];
  procurement: ItProcurementRecord[];
  softwareCatalog?: ItSoftwareCatalogRecord[];
  installedSoftware?: ItInstalledSoftwareRecord[];
  softwareRequests?: ItSoftwareRequestRecord[];
  auditLog?: ItAuditLogRecord[];
  breakdowns: {
    byCategory: Array<{ label: string; count: number }>;
    byStatus: Array<{ label: string; count: number }>;
    byLocation: Array<{ label: string; count: number }>;
  };
};

const mapAsset = (row: Record<string, unknown>): ItAssetRecord => ({
  assetId: clean(row.AssetId, 40),
  assetTag: clean(row.AssetTag, 40),
  name: clean(row.Name, 200),
  assetType: clean(row.AssetType, 40),
  category: clean(row.Category, 60),
  subCategory: cleanNullable(row.SubCategory, 60),
  serialNumber: cleanNullable(row.SerialNumber, 120),
  status: clean(row.Status, 40),
  warrantyStatus: cleanNullable(row.WarrantyStatus, 40),
  location: cleanNullable(row.Location, 180),
  department: cleanNullable(row.Department, 180),
  ownerUnit: cleanNullable(row.OwnerUnit, 120),
  assignedEmployeeId: cleanNullable(row.AssignedEmployeeId, 40),
  assignedEmployeeName: cleanNullable(row.AssignedEmployeeName, 220),
  assignedOn: toIsoDate(row.AssignedOn),
  purchaseDate: toIsoDate(row.PurchaseDate),
  warrantyExpiry: toIsoDate(row.WarrantyExpiry),
  purchaseCost: row.PurchaseCost == null ? null : toNumber(row.PurchaseCost),
  notes: cleanNullable(row.Notes, 4000),
  model: cleanNullable(row.Model, 200),
  manufacturer: cleanNullable(row.Manufacturer, 120),
  assignedEmail: cleanNullable(row.AssignedEmail, 180),
  assetCondition: cleanNullable(row.AssetCondition, 40),
  operatingSystem: cleanNullable(row.OperatingSystem, 80),
  pmStatus: cleanNullable(row.PmStatus, 40),
  nextPmDue: toIsoDate(row.NextPmDue),
  lastMaintenanceDate: toIsoDate(row.LastMaintenanceDate),
  nextMaintenanceDate: toIsoDate(row.NextMaintenanceDate),
  registerStatus: cleanNullable(row.RegisterStatus, 40),
  sourceAssetId: cleanNullable(row.SourceAssetId, 40),
  createdAt: toIsoDate(row.CreatedAt) || nowIso(),
  updatedAt: toIsoDate(row.UpdatedAt) || nowIso(),
});

export const mapItAssetRow = mapAsset;

export const ensureItAssetDb = async () => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new Error('DLE_Enterprise database is not configured.');
  if (!dbReady.value) {
    await pool.request().query(ensureItAssetSchemaSql);
    dbReady.value = true;
  }
  return pool;
};

const ensureDb = ensureItAssetDb;

export const appendItAssetAudit = async (pool: sql.ConnectionPool, entityType: string, entityId: string, action: string, actor: string, details?: string) => {
  await pool.request()
    .input('audit_id', sql.NVarChar(40), newId('aud'))
    .input('entity_type', sql.NVarChar(40), entityType)
    .input('entity_id', sql.NVarChar(40), entityId)
    .input('action', sql.NVarChar(80), action)
    .input('actor', sql.NVarChar(120), actor)
    .input('details', sql.NVarChar(sql.MAX), details || null)
    .query(`INSERT INTO [it].[AssetAuditLog] (AuditId, EntityType, EntityId, Action, Actor, Details) VALUES (@audit_id, @entity_type, @entity_id, @action, @actor, @details)`);
};

const appendAudit = appendItAssetAudit;

export const listItAssets = async (filters?: { category?: string; subCategory?: string; status?: string; assetType?: string }) => {
  const pool = await ensureDb();
  const request = pool.request();
  const where: string[] = ['IsActive = 1'];
  if (filters?.category) {
    request.input('category', sql.NVarChar(60), filters.category);
    where.push('Category = @category');
  }
  if (filters?.subCategory) {
    request.input('sub_category', sql.NVarChar(60), filters.subCategory);
    where.push('SubCategory = @sub_category');
  }
  if (filters?.status) {
    request.input('status', sql.NVarChar(40), filters.status);
    where.push('Status = @status');
  }
  if (filters?.assetType) {
    request.input('asset_type', sql.NVarChar(40), filters.assetType);
    where.push('AssetType = @asset_type');
  }
  const result = await request.query(`SELECT * FROM [it].[Assets] WHERE ${where.join(' AND ')} ORDER BY UpdatedAt DESC`);
  return (result.recordset || []).map((row) => mapAsset(row as Record<string, unknown>));
};

export const createItAsset = async (input: Partial<ItAssetRecord>, actor: string) => {
  const pool = await ensureDb();
  const assetId = clean(input.assetId, 40) || clean(input.sourceAssetId, 40) || newId('ast');
  const assetTag = clean(input.assetTag, 40) || `AST-${Date.now().toString().slice(-6)}`;
  const existing = await pool.request()
    .input('asset_id', sql.NVarChar(40), assetId)
    .input('asset_tag', sql.NVarChar(40), assetTag)
    .query(`SELECT AssetId FROM [it].[Assets] WHERE AssetId = @asset_id OR AssetTag = @asset_tag OR SourceAssetId = @asset_id`);
  if ((existing.recordset || []).length > 0) {
    throw new Error(`Asset tag or ID already exists: ${assetTag}`);
  }

  await pool.request()
    .input('asset_id', sql.NVarChar(40), assetId)
    .input('source_asset_id', sql.NVarChar(40), cleanNullable(input.sourceAssetId, 40) || assetId)
    .input('asset_tag', sql.NVarChar(40), assetTag)
    .input('name', sql.NVarChar(200), clean(input.name, 200) || clean(input.model, 200) || 'Unnamed Asset')
    .input('model', sql.NVarChar(200), cleanNullable(input.model, 200) || cleanNullable(input.name, 200))
    .input('manufacturer', sql.NVarChar(120), cleanNullable(input.manufacturer, 120))
    .input('asset_type', sql.NVarChar(40), clean(input.assetType, 40) || 'Hardware')
    .input('category', sql.NVarChar(60), clean(input.category, 60) || 'Other')
    .input('sub_category', sql.NVarChar(60), cleanNullable(input.subCategory, 60))
    .input('serial_number', sql.NVarChar(120), cleanNullable(input.serialNumber, 120))
    .input('status', sql.NVarChar(40), clean(input.status, 40) || 'Active')
    .input('register_status', sql.NVarChar(40), cleanNullable(input.registerStatus, 40))
    .input('warranty_status', sql.NVarChar(40), cleanNullable(input.warrantyStatus, 40))
    .input('location', sql.NVarChar(180), cleanNullable(input.location, 180))
    .input('department', sql.NVarChar(180), cleanNullable(input.department, 180))
    .input('owner_unit', sql.NVarChar(120), cleanNullable(input.ownerUnit, 120))
    .input('assigned_employee_id', sql.NVarChar(40), cleanNullable(input.assignedEmployeeId, 40))
    .input('assigned_employee_name', sql.NVarChar(220), cleanNullable(input.assignedEmployeeName, 220))
    .input('assigned_email', sql.NVarChar(180), cleanNullable(input.assignedEmail, 180))
    .input('asset_condition', sql.NVarChar(40), cleanNullable(input.assetCondition, 40))
    .input('operating_system', sql.NVarChar(80), cleanNullable(input.operatingSystem, 80))
    .input('pm_status', sql.NVarChar(40), cleanNullable(input.pmStatus, 40))
    .input('next_pm_due', sql.Date, toDate(input.nextPmDue))
    .input('assigned_on', sql.Date, toDate(input.assignedOn))
    .input('purchase_date', sql.Date, toDate(input.purchaseDate))
    .input('warranty_expiry', sql.Date, toDate(input.warrantyExpiry))
    .input('purchase_cost', sql.Decimal(19, 2), input.purchaseCost ?? null)
    .input('notes', sql.NVarChar(sql.MAX), cleanNullable(input.notes, 4000))
    .input('created_by', sql.NVarChar(120), actor)
    .input('updated_by', sql.NVarChar(120), actor)
    .query(`
      INSERT INTO [it].[Assets]
      (AssetId, SourceAssetId, AssetTag, Name, Model, Manufacturer, AssetType, Category, SubCategory, SerialNumber, Status, RegisterStatus,
       WarrantyStatus, Location, Department, OwnerUnit, AssignedEmployeeId, AssignedEmployeeName, AssignedEmail, AssetCondition, OperatingSystem,
       PmStatus, NextPmDue, AssignedOn, PurchaseDate, WarrantyExpiry, PurchaseCost, Notes, CreatedBy, UpdatedBy)
      VALUES
      (@asset_id, @source_asset_id, @asset_tag, @name, @model, @manufacturer, @asset_type, @category, @sub_category, @serial_number, @status, @register_status,
       @warranty_status, @location, @department, @owner_unit, @assigned_employee_id, @assigned_employee_name, @assigned_email, @asset_condition, @operating_system,
       @pm_status, @next_pm_due, @assigned_on, @purchase_date, @warranty_expiry, @purchase_cost, @notes, @created_by, @updated_by)`);
  await appendAudit(pool, 'asset', assetId, 'create', actor, assetTag);
  return listItAssets().then((rows) => rows.find((row) => row.assetId === assetId) || null);
};

export const updateItAsset = async (assetId: string, input: Partial<ItAssetRecord>, actor: string) => {
  const pool = await ensureDb();
  const assetTag = cleanNullable(input.assetTag, 40);
  if (assetTag) {
    const existing = await pool.request()
      .input('asset_id', sql.NVarChar(40), assetId)
      .input('asset_tag', sql.NVarChar(40), assetTag)
      .query(`SELECT AssetId FROM [it].[Assets] WHERE AssetTag = @asset_tag AND AssetId <> @asset_id`);
    if ((existing.recordset || []).length > 0) {
      throw new Error(`Asset tag already exists: ${assetTag}`);
    }
  }

  await pool.request()
    .input('asset_id', sql.NVarChar(40), assetId)
    .input('source_asset_id', sql.NVarChar(40), cleanNullable(input.sourceAssetId, 40))
    .input('asset_tag', sql.NVarChar(40), assetTag)
    .input('name', sql.NVarChar(200), cleanNullable(input.name, 200))
    .input('model', sql.NVarChar(200), cleanNullable(input.model, 200))
    .input('manufacturer', sql.NVarChar(120), cleanNullable(input.manufacturer, 120))
    .input('category', sql.NVarChar(60), cleanNullable(input.category, 60))
    .input('sub_category', sql.NVarChar(60), cleanNullable(input.subCategory, 60))
    .input('serial_number', sql.NVarChar(120), cleanNullable(input.serialNumber, 120))
    .input('status', sql.NVarChar(40), cleanNullable(input.status, 40))
    .input('register_status', sql.NVarChar(40), cleanNullable(input.registerStatus, 40))
    .input('warranty_status', sql.NVarChar(40), cleanNullable(input.warrantyStatus, 40))
    .input('location', sql.NVarChar(180), cleanNullable(input.location, 180))
    .input('department', sql.NVarChar(180), cleanNullable(input.department, 180))
    .input('assigned_employee_id', sql.NVarChar(40), cleanNullable(input.assignedEmployeeId, 40))
    .input('assigned_employee_name', sql.NVarChar(220), cleanNullable(input.assignedEmployeeName, 220))
    .input('assigned_email', sql.NVarChar(180), cleanNullable(input.assignedEmail, 180))
    .input('asset_condition', sql.NVarChar(40), cleanNullable(input.assetCondition, 40))
    .input('operating_system', sql.NVarChar(80), cleanNullable(input.operatingSystem, 80))
    .input('pm_status', sql.NVarChar(40), cleanNullable(input.pmStatus, 40))
    .input('next_pm_due', sql.Date, toDate(input.nextPmDue))
    .input('assigned_on', sql.Date, toDate(input.assignedOn))
    .input('purchase_date', sql.Date, toDate(input.purchaseDate))
    .input('warranty_expiry', sql.Date, toDate(input.warrantyExpiry))
    .input('purchase_cost', sql.Decimal(19, 2), input.purchaseCost ?? null)
    .input('notes', sql.NVarChar(sql.MAX), cleanNullable(input.notes, 4000))
    .input('updated_by', sql.NVarChar(120), actor)
    .query(`
      UPDATE [it].[Assets]
      SET SourceAssetId = COALESCE(@source_asset_id, SourceAssetId),
          AssetTag = COALESCE(@asset_tag, AssetTag),
          Name = COALESCE(@name, Name),
          Model = COALESCE(@model, Model),
          Manufacturer = @manufacturer,
          Category = COALESCE(@category, Category),
          SubCategory = COALESCE(@sub_category, SubCategory),
          SerialNumber = @serial_number,
          Status = COALESCE(@status, Status),
          RegisterStatus = COALESCE(@register_status, RegisterStatus),
          WarrantyStatus = COALESCE(@warranty_status, WarrantyStatus),
          Location = @location,
          Department = @department,
          AssignedEmployeeId = @assigned_employee_id,
          AssignedEmployeeName = @assigned_employee_name,
          AssignedEmail = @assigned_email,
          AssetCondition = @asset_condition,
          OperatingSystem = @operating_system,
          PmStatus = @pm_status,
          NextPmDue = @next_pm_due,
          AssignedOn = @assigned_on,
          PurchaseDate = @purchase_date,
          WarrantyExpiry = @warranty_expiry,
          PurchaseCost = @purchase_cost,
          Notes = @notes,
          UpdatedAt = SYSUTCDATETIME(),
          UpdatedBy = @updated_by
      WHERE AssetId = @asset_id`);
  await appendAudit(pool, 'asset', assetId, 'update', actor, assetTag || assetId);
  return listItAssets().then((rows) => rows.find((row) => row.assetId === assetId) || null);
};

const listTable = async <T>(table: string, mapper: (row: Record<string, unknown>) => T, orderBy = 'UpdatedAt DESC'): Promise<T[]> => {
  const pool = await ensureDb();
  const result = await pool.request().query(`SELECT * FROM [it].[${table}] ORDER BY ${orderBy}`);
  return (result.recordset || []).map((row) => mapper(row as Record<string, unknown>));
};

export const listItInventory = () =>
  listTable('InventoryStock', (row) => ({
    stockId: clean(row.StockId, 40),
    sku: clean(row.Sku, 60),
    name: clean(row.Name, 200),
    category: clean(row.Category, 60),
    quantity: toNumber(row.Quantity),
    status: clean(row.Status, 40),
    location: cleanNullable(row.Location, 180),
    updatedAt: toIsoDate(row.UpdatedAt) || nowIso(),
  }));

export const createItInventory = async (input: Partial<ItInventoryRecord>, actor: string) => {
  const pool = await ensureDb();
  const stockId = newId('stk');
  const sku = clean(input.sku, 60).toUpperCase() || `SKU-${Date.now().toString().slice(-6)}`;
  await pool.request()
    .input('stock_id', sql.NVarChar(40), stockId)
    .input('sku', sql.NVarChar(60), sku)
    .input('name', sql.NVarChar(200), clean(input.name, 200) || sku)
    .input('category', sql.NVarChar(60), clean(input.category, 60) || 'Other')
    .input('quantity', sql.Int, toNumber(input.quantity))
    .input('status', sql.NVarChar(40), clean(input.status, 40) || 'Available')
    .input('location', sql.NVarChar(180), cleanNullable(input.location, 180))
    .input('updated_by', sql.NVarChar(120), actor)
    .query(`INSERT INTO [it].[InventoryStock] (StockId, Sku, Name, Category, Quantity, Status, Location, UpdatedBy) VALUES (@stock_id, @sku, @name, @category, @quantity, @status, @location, @updated_by)`);
  await appendAudit(pool, 'inventory', stockId, 'create', actor, sku);
  return listItInventory().then((rows) => rows.find((row) => row.stockId === stockId) || null);
};

export const listItMaintenance = () =>
  listTable('MaintenanceRecords', (row) => ({
    maintenanceId: clean(row.MaintenanceId, 40),
    title: clean(row.Title, 200),
    assetId: cleanNullable(row.AssetId, 40),
    assetName: clean(row.AssetName, 200),
    category: clean(row.Category, 60),
    scheduledDate: toIsoDate(row.ScheduledDate),
    priority: clean(row.Priority, 20),
    status: clean(row.Status, 40),
    assignedTo: cleanNullable(row.AssignedTo, 180),
    department: cleanNullable(row.Department, 180),
    location: cleanNullable(row.Location, 180),
    notes: cleanNullable(row.Notes, 4000),
    updatedAt: toIsoDate(row.UpdatedAt) || nowIso(),
  }));

export const createItMaintenance = async (input: Partial<ItMaintenanceRecord>, actor: string) => {
  const pool = await ensureDb();
  const maintenanceId = newId('mnt');
  await pool.request()
    .input('maintenance_id', sql.NVarChar(40), maintenanceId)
    .input('title', sql.NVarChar(200), clean(input.title, 200) || 'Maintenance Task')
    .input('asset_id', sql.NVarChar(40), cleanNullable(input.assetId, 40))
    .input('asset_name', sql.NVarChar(200), clean(input.assetName, 200) || 'General')
    .input('category', sql.NVarChar(60), clean(input.category, 60) || 'Hardware')
    .input('scheduled_date', sql.Date, toDate(input.scheduledDate))
    .input('priority', sql.NVarChar(20), clean(input.priority, 20) || 'Medium')
    .input('status', sql.NVarChar(40), clean(input.status, 40) || 'Upcoming')
    .input('assigned_to', sql.NVarChar(180), cleanNullable(input.assignedTo, 180))
    .input('department', sql.NVarChar(180), cleanNullable(input.department, 180))
    .input('location', sql.NVarChar(180), cleanNullable(input.location, 180))
    .input('notes', sql.NVarChar(sql.MAX), cleanNullable(input.notes, 4000))
    .input('created_by', sql.NVarChar(120), actor)
    .input('updated_by', sql.NVarChar(120), actor)
    .query(`INSERT INTO [it].[MaintenanceRecords] (MaintenanceId, Title, AssetId, AssetName, Category, ScheduledDate, Priority, Status, AssignedTo, Department, Location, Notes, CreatedBy, UpdatedBy)
            VALUES (@maintenance_id, @title, @asset_id, @asset_name, @category, @scheduled_date, @priority, @status, @assigned_to, @department, @location, @notes, @created_by, @updated_by)`);
  await appendAudit(pool, 'maintenance', maintenanceId, 'create', actor);
  return listItMaintenance().then((rows) => rows.find((row) => row.maintenanceId === maintenanceId) || null);
};

export const listItAssignments = () =>
  listTable('AssetAssignments', (row) => ({
    assignmentId: clean(row.AssignmentId, 40),
    assetId: clean(row.AssetId, 40),
    assetTag: clean(row.AssetTag, 40),
    assetName: clean(row.AssetName, 200),
    assetType: clean(row.AssetType, 40),
    employeeId: cleanNullable(row.EmployeeId, 40),
    employeeName: clean(row.EmployeeName, 220),
    department: cleanNullable(row.Department, 180),
    location: cleanNullable(row.Location, 180),
    status: clean(row.Status, 40),
    assignedOn: toIsoDate(row.AssignedOn),
    returnedOn: toIsoDate(row.ReturnedOn),
    notes: cleanNullable(row.Notes, 4000),
    updatedAt: toIsoDate(row.UpdatedAt) || nowIso(),
  }));

export const assignItAsset = async (input: { assetId: string; employeeId?: string; employeeName: string; assignedEmail?: string; department?: string; location?: string; notes?: string }, actor: string) => {
  const pool = await ensureDb();
  const assets = await listItAssets();
  const asset = assets.find((row) => row.assetId === input.assetId);
  if (!asset) throw new Error('Asset not found.');
  if (asset.assignedEmployeeName) throw new Error('Asset is already assigned. Return it before reassigning.');
  const assignmentId = newId('asn');
  const assignedOn = new Date();
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
  await appendAudit(pool, 'assignment', assignmentId, 'assign', actor, asset.assetTag);
  return listItAssignments().then((rows) => rows.find((row) => row.assignmentId === assignmentId) || null);
};

export const listItSoftwareLicenses = () =>
  listTable('SoftwareLicenses', (row) => ({
    licenseId: clean(row.LicenseId, 40),
    productName: clean(row.ProductName, 200),
    vendorName: cleanNullable(row.VendorName, 180),
    licenseType: clean(row.LicenseType, 60),
    seatsTotal: toNumber(row.SeatsTotal),
    seatsUsed: toNumber(row.SeatsUsed),
    complianceStatus: clean(row.ComplianceStatus, 40),
    expiryDate: toIsoDate(row.ExpiryDate),
    annualCost: row.AnnualCost == null ? null : toNumber(row.AnnualCost),
    updatedAt: toIsoDate(row.UpdatedAt) || nowIso(),
  }));

export const listItVendors = () =>
  listTable('Vendors', (row) => ({
    vendorId: clean(row.VendorId, 40),
    name: clean(row.Name, 200),
    category: cleanNullable(row.Category, 80),
    contactName: cleanNullable(row.ContactName, 180),
    email: cleanNullable(row.Email, 180),
    phone: cleanNullable(row.Phone, 60),
    website: cleanNullable(row.Website, 220),
    location: cleanNullable(row.Location, 180),
    status: clean(row.Status, 40),
    rating: row.Rating == null ? null : toNumber(row.Rating),
    spendYtd: row.SpendYtd == null ? null : toNumber(row.SpendYtd),
    updatedAt: toIsoDate(row.UpdatedAt) || nowIso(),
  }));

export const listItWarranties = () =>
  listTable('Warranties', (row) => ({
    warrantyId: clean(row.WarrantyId, 40),
    assetId: cleanNullable(row.AssetId, 40),
    assetTag: cleanNullable(row.AssetTag, 40),
    assetName: clean(row.AssetName, 200),
    provider: cleanNullable(row.Provider, 180),
    coverageType: cleanNullable(row.CoverageType, 80),
    startDate: toIsoDate(row.StartDate),
    endDate: toIsoDate(row.EndDate),
    status: clean(row.Status, 40),
    coverageValue: row.CoverageValue == null ? null : toNumber(row.CoverageValue),
    updatedAt: toIsoDate(row.UpdatedAt) || nowIso(),
  }));

export const listItProcurement = () =>
  listTable('ProcurementOrders', (row) => ({
    orderId: clean(row.OrderId, 40),
    orderNumber: clean(row.OrderNumber, 40),
    title: clean(row.Title, 200),
    vendorName: cleanNullable(row.VendorName, 180),
    category: cleanNullable(row.Category, 80),
    status: clean(row.Status, 40),
    orderDate: toIsoDate(row.OrderDate),
    expectedDate: toIsoDate(row.ExpectedDate),
    amount: row.Amount == null ? null : toNumber(row.Amount),
    updatedAt: toIsoDate(row.UpdatedAt) || nowIso(),
  }));

const countBy = (rows: ItAssetRecord[], key: keyof ItAssetRecord) => {
  const map = new Map<string, number>();
  rows.forEach((row) => {
    const label = clean(row[key], 120) || 'Unassigned';
    map.set(label, (map.get(label) || 0) + 1);
  });
  return Array.from(map.entries()).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
};

export const buildItAssetDashboardPayload = async (): Promise<ItAssetDashboardPayload> => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) {
    return {
      generatedAt: nowIso(),
      source: 'DLE_Enterprise (unavailable)',
      databaseAvailable: false,
      summary: { totalAssets: 0, activeAssets: 0, warrantyAlerts: 0, maintenanceDue: 0, inventoryItems: 0, assignedAssets: 0, unassignedAssets: 0, totalAssetValue: 0 },
      assets: [], inventory: [], maintenance: [], assignments: [], licenses: [], vendors: [], warranties: [], procurement: [],
      breakdowns: { byCategory: [], byStatus: [], byLocation: [] },
    };
  }

  await ensureDb();
  const [assets, inventory, maintenance, assignments, licenses, vendors, warranties, procurement] = await Promise.all([
    listItAssets(),
    listItInventory(),
    listItMaintenance(),
    listItAssignments(),
    listItSoftwareLicenses(),
    listItVendors(),
    listItWarranties(),
    listItProcurement(),
  ]);

  const activeAssets = assets.filter((asset) => ['Active', 'In Service'].includes(asset.status)).length;
  const warrantyAlerts = assets.filter((asset) => asset.warrantyStatus && asset.warrantyStatus !== 'Good' && asset.warrantyStatus !== 'Active').length;
  const maintenanceDue = maintenance.filter((item) => ['Upcoming', 'In Progress', 'Overdue'].includes(item.status)).length;
  const assignedAssets = assets.filter((asset) => Boolean(asset.assignedEmployeeName)).length;

  return {
    generatedAt: nowIso(),
    source: 'DLE_Enterprise',
    databaseAvailable: true,
    summary: {
      totalAssets: assets.length,
      activeAssets,
      warrantyAlerts,
      maintenanceDue,
      inventoryItems: inventory.length,
      assignedAssets,
      unassignedAssets: Math.max(assets.length - assignedAssets, 0),
      totalAssetValue: assets.reduce((sum, asset) => sum + (asset.purchaseCost || 0), 0),
    },
    assets,
    inventory,
    maintenance,
    assignments,
    licenses,
    vendors,
    warranties,
    procurement,
    breakdowns: {
      byCategory: countBy(assets, 'category'),
      byStatus: countBy(assets, 'status'),
      byLocation: countBy(assets, 'location'),
    },
  };
};

export const initializeItAssetManagement = async (actor: string) => {
  const pool = await ensureDb();
  const countResult = await pool.request().query(`SELECT COUNT(1) AS total FROM [it].[Assets]`);
  const total = Number(countResult.recordset?.[0]?.total || 0);
  if (total > 0) return buildItAssetDashboardPayload();

  const seedAssets: Array<Partial<ItAssetRecord>> = [
    { assetTag: 'AST-10045', name: 'MacBook Pro 16"', assetType: 'Hardware', category: 'Laptop', status: 'Active', warrantyStatus: 'Good', location: 'Lagos Office', department: 'IT', assignedEmployeeName: 'Emily Johnson', purchaseCost: 1850000 },
    { assetTag: 'AST-10046', name: 'Dell OptiPlex 7090', assetType: 'Hardware', category: 'Desktop', status: 'Active', warrantyStatus: 'Good', location: 'Abuja Office', department: 'Finance', assignedEmployeeName: 'Michael Brown', purchaseCost: 620000 },
    { assetTag: 'AST-10047', name: 'HP LaserJet Pro M404', assetType: 'Hardware', category: 'Printer', status: 'Under Maintenance', warrantyStatus: 'Expiring soon', location: 'Lagos Office', department: 'Admin', purchaseCost: 280000 },
    { assetTag: 'AST-10048', name: 'Cisco Catalyst 9300', assetType: 'Hardware', category: 'Network', status: 'Active', warrantyStatus: 'Good', location: 'Head Office', department: 'IT', assignedEmployeeName: 'IT Network Team', purchaseCost: 2400000 },
    { assetTag: 'AST-10049', name: 'iPhone 15 Pro', assetType: 'Hardware', category: 'Phone', status: 'Active', warrantyStatus: 'Good', location: 'Remote', department: 'Sales', assignedEmployeeName: 'Sarah Davis', purchaseCost: 980000 },
    { assetTag: 'AST-10050', name: 'Dell PowerEdge R760', assetType: 'Hardware', category: 'Server', status: 'Active', warrantyStatus: 'Good', location: 'Data Center', department: 'IT', assignedEmployeeName: 'Infrastructure Team', purchaseCost: 5200000 },
  ];

  for (const asset of seedAssets) {
    await createItAsset(asset, actor);
  }

  await createItInventory({ sku: 'LT-014', name: 'ThinkPad T14', category: 'Laptop', quantity: 24, status: 'Available', location: 'Lagos Office' }, actor);
  await createItInventory({ sku: 'NW-440', name: 'Cisco Catalyst 9300', category: 'Network', quantity: 3, status: 'Low Stock', location: 'Head Office' }, actor);
  await createItMaintenance({ title: 'Quarterly UPS Inspection', assetName: 'APC Smart-UPS 1500VA', category: 'Hardware', scheduledDate: new Date().toISOString().slice(0, 10), priority: 'High', status: 'In Progress', assignedTo: 'Michael Brown' }, actor);
  await createItMaintenance({ title: 'Server OS Update', assetName: 'Dell PowerEdge R760', category: 'Software', scheduledDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10), priority: 'Medium', status: 'Upcoming', assignedTo: 'Emily Davis' }, actor);

  const assets = await listItAssets();
  const laptop = assets.find((asset) => asset.assetTag === 'AST-10045');
  if (laptop) {
    await assignItAsset({ assetId: laptop.assetId, employeeName: 'Emily Johnson', department: 'IT', location: 'Lagos Office' }, actor);
  }

  await pool.request()
    .input('license_id', sql.NVarChar(40), newId('lic'))
    .input('product_name', sql.NVarChar(200), 'Microsoft 365 E3')
    .input('vendor_name', sql.NVarChar(180), 'Microsoft')
    .input('license_type', sql.NVarChar(60), 'Subscription')
    .input('seats_total', sql.Int, 250)
    .input('seats_used', sql.Int, 214)
    .input('compliance_status', sql.NVarChar(40), 'In Compliance')
    .input('expiry_date', sql.Date, new Date(new Date().getFullYear(), 11, 31))
    .input('annual_cost', sql.Decimal(19, 2), 12500000)
    .input('updated_by', sql.NVarChar(120), actor)
    .query(`INSERT INTO [it].[SoftwareLicenses] (LicenseId, ProductName, VendorName, LicenseType, SeatsTotal, SeatsUsed, ComplianceStatus, ExpiryDate, AnnualCost, UpdatedBy)
            VALUES (@license_id, @product_name, @vendor_name, @license_type, @seats_total, @seats_used, @compliance_status, @expiry_date, @annual_cost, @updated_by)`);

  await pool.request()
    .input('vendor_id', sql.NVarChar(40), newId('vnd'))
    .input('name', sql.NVarChar(200), 'Dell Technologies')
    .input('category', sql.NVarChar(80), 'Hardware')
    .input('contact_name', sql.NVarChar(180), 'Account Manager')
    .input('email', sql.NVarChar(180), 'sales@dell.com')
    .input('phone', sql.NVarChar(60), '+234 1 000 0000')
    .input('website', sql.NVarChar(220), 'https://www.dell.com')
    .input('location', sql.NVarChar(180), 'Lagos')
    .input('status', sql.NVarChar(40), 'Active')
    .input('rating', sql.Decimal(4, 2), 4.6)
    .input('spend_ytd', sql.Decimal(19, 2), 18500000)
    .input('updated_by', sql.NVarChar(120), actor)
    .query(`INSERT INTO [it].[Vendors] (VendorId, Name, Category, ContactName, Email, Phone, Website, Location, Status, Rating, SpendYtd, UpdatedBy)
            VALUES (@vendor_id, @name, @category, @contact_name, @email, @phone, @website, @location, @status, @rating, @spend_ytd, @updated_by)`);

  const server = assets.find((asset) => asset.category === 'Server');
  await pool.request()
    .input('warranty_id', sql.NVarChar(40), newId('wty'))
    .input('asset_id', sql.NVarChar(40), server?.assetId || null)
    .input('asset_tag', sql.NVarChar(40), server?.assetTag || null)
    .input('asset_name', sql.NVarChar(200), server?.name || 'Dell PowerEdge R760')
    .input('provider', sql.NVarChar(180), 'Dell ProSupport')
    .input('coverage_type', sql.NVarChar(80), 'Premium')
    .input('start_date', sql.Date, new Date(new Date().getFullYear(), 0, 1))
    .input('end_date', sql.Date, new Date(new Date().getFullYear() + 2, 11, 31))
    .input('status', sql.NVarChar(40), 'Active')
    .input('coverage_value', sql.Decimal(19, 2), 5200000)
    .input('updated_by', sql.NVarChar(120), actor)
    .query(`INSERT INTO [it].[Warranties] (WarrantyId, AssetId, AssetTag, AssetName, Provider, CoverageType, StartDate, EndDate, Status, CoverageValue, UpdatedBy)
            VALUES (@warranty_id, @asset_id, @asset_tag, @asset_name, @provider, @coverage_type, @start_date, @end_date, @status, @coverage_value, @updated_by)`);

  await pool.request()
    .input('order_id', sql.NVarChar(40), newId('po'))
    .input('order_number', sql.NVarChar(40), 'PO-2026-0142')
    .input('title', sql.NVarChar(200), 'Laptop refresh batch')
    .input('vendor_name', sql.NVarChar(180), 'Dell Technologies')
    .input('category', sql.NVarChar(80), 'Hardware')
    .input('status', sql.NVarChar(40), 'Pending Receipt')
    .input('order_date', sql.Date, new Date())
    .input('expected_date', sql.Date, new Date(Date.now() + 7 * 86400000))
    .input('amount', sql.Decimal(19, 2), 9200000)
    .input('created_by', sql.NVarChar(120), actor)
    .query(`INSERT INTO [it].[ProcurementOrders] (OrderId, OrderNumber, Title, VendorName, Category, Status, OrderDate, ExpectedDate, Amount, CreatedBy)
            VALUES (@order_id, @order_number, @title, @vendor_name, @category, @status, @order_date, @expected_date, @amount, @created_by)`);

  await appendAudit(pool, 'module', 'asset-management', 'initialize', actor, 'Seeded starter IT asset records');
  return buildItAssetDashboardPayload();
};
