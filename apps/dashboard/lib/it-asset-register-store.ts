import sql from 'mssql';
import { readFile } from 'fs/promises';
import path from 'path';
import {
  appendItAssetAudit,
  buildItAssetDashboardPayload,
  ensureItAssetDb,
  newItId,
} from '@/lib/it-asset-management-store';
import { parseAssetRegisterCsv, type AssetRegisterRow } from '@/lib/it-asset-register-import';

export type AssetRegisterImportResult = {
  imported: number;
  updated: number;
  skipped: number;
  maintenanceCreated: number;
  errors: string[];
};

const clean = (value: unknown, max = 200) => String(value ?? '').trim().slice(0, max);
const toDate = (value: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const upsertRegisterAsset = async (pool: sql.ConnectionPool, row: AssetRegisterRow, actor: string) => {
  const assetId = clean(row.sourceAssetId, 40);
  const assetTag = clean(row.assetTag, 40);
  const existing = await pool.request()
    .input('asset_id', sql.NVarChar(40), assetId)
    .input('asset_tag', sql.NVarChar(40), assetTag)
    .query(`SELECT AssetId FROM [it].[Assets] WHERE AssetId = @asset_id OR SourceAssetId = @asset_id OR AssetTag = @asset_tag`);
  const request = pool.request()
    .input('asset_id', sql.NVarChar(40), assetId)
    .input('source_asset_id', sql.NVarChar(40), assetId)
    .input('asset_tag', sql.NVarChar(40), assetTag)
    .input('name', sql.NVarChar(200), clean(row.model, 200))
    .input('model', sql.NVarChar(200), clean(row.model, 200))
    .input('manufacturer', sql.NVarChar(120), row.manufacturer)
    .input('asset_type', sql.NVarChar(40), 'Hardware')
    .input('category', sql.NVarChar(60), row.category)
    .input('sub_category', sql.NVarChar(60), row.subCategory)
    .input('serial_number', sql.NVarChar(120), row.serialNumber)
    .input('status', sql.NVarChar(40), row.status)
    .input('register_status', sql.NVarChar(40), row.registerStatus)
    .input('warranty_status', sql.NVarChar(40), row.pmStatus === 'OVERDUE' ? 'Expiring soon' : 'Good')
    .input('location', sql.NVarChar(180), row.location)
    .input('department', sql.NVarChar(180), row.department)
    .input('assigned_employee_name', sql.NVarChar(220), row.assignedEmployeeName)
    .input('assigned_email', sql.NVarChar(180), row.assignedEmail)
    .input('asset_condition', sql.NVarChar(40), row.assetCondition)
    .input('operating_system', sql.NVarChar(80), row.operatingSystem)
    .input('pm_status', sql.NVarChar(40), row.pmStatus)
    .input('next_pm_due', sql.Date, toDate(row.nextPmDue))
    .input('purchase_date', sql.Date, toDate(row.purchaseDate))
    .input('warranty_expiry', sql.Date, toDate(row.warrantyExpiry))
    .input('last_maintenance_date', sql.Date, toDate(row.lastMaintenanceDate))
    .input('next_maintenance_date', sql.Date, toDate(row.nextMaintenanceDate))
    .input('purchase_cost', sql.Decimal(19, 2), row.purchaseCost)
    .input('notes', sql.NVarChar(sql.MAX), row.notes)
    .input('created_by', sql.NVarChar(120), row.createdBy || actor)
    .input('updated_by', sql.NVarChar(120), row.updatedBy || actor)
    .input('is_active', sql.Bit, row.status === 'Retired' ? 0 : 1);

  const exists = (existing.recordset || []).length > 0;
  if (exists) {
    await request.query(`
      UPDATE [it].[Assets]
      SET AssetTag = @asset_tag,
          SourceAssetId = @source_asset_id,
          Name = @name,
          Model = @model,
          Manufacturer = @manufacturer,
          AssetType = @asset_type,
          Category = @category,
          SubCategory = @sub_category,
          SerialNumber = @serial_number,
          Status = @status,
          RegisterStatus = @register_status,
          WarrantyStatus = @warranty_status,
          Location = @location,
          Department = @department,
          AssignedEmployeeName = @assigned_employee_name,
          AssignedEmail = @assigned_email,
          AssetCondition = @asset_condition,
          OperatingSystem = @operating_system,
          PmStatus = @pm_status,
          NextPmDue = @next_pm_due,
          PurchaseDate = @purchase_date,
          WarrantyExpiry = @warranty_expiry,
          LastMaintenanceDate = @last_maintenance_date,
          NextMaintenanceDate = @next_maintenance_date,
          PurchaseCost = @purchase_cost,
          Notes = @notes,
          UpdatedAt = SYSUTCDATETIME(),
          UpdatedBy = @updated_by,
          IsActive = @is_active
      WHERE AssetId = @asset_id OR SourceAssetId = @asset_id OR AssetTag = @asset_tag`);
    return 'updated' as const;
  }

  await request.query(`
    INSERT INTO [it].[Assets]
    (AssetId, SourceAssetId, AssetTag, Name, Model, Manufacturer, AssetType, Category, SubCategory, SerialNumber, Status, RegisterStatus,
     WarrantyStatus, Location, Department, AssignedEmployeeName, AssignedEmail, AssetCondition, OperatingSystem, PmStatus, NextPmDue,
     PurchaseDate, WarrantyExpiry, LastMaintenanceDate, NextMaintenanceDate, PurchaseCost, Notes, CreatedBy, UpdatedBy, IsActive)
    VALUES
    (@asset_id, @source_asset_id, @asset_tag, @name, @model, @manufacturer, @asset_type, @category, @sub_category, @serial_number, @status, @register_status,
     @warranty_status, @location, @department, @assigned_employee_name, @assigned_email, @asset_condition, @operating_system, @pm_status, @next_pm_due,
     @purchase_date, @warranty_expiry, @last_maintenance_date, @next_maintenance_date, @purchase_cost, @notes, @created_by, @updated_by, @is_active)`);
  return 'imported' as const;
};

export const importItAssetRegisterCsv = async (csvText: string, actor: string): Promise<AssetRegisterImportResult> => {
  const pool = await ensureItAssetDb();
  const rows = parseAssetRegisterCsv(csvText);
  const result: AssetRegisterImportResult = {
    imported: 0,
    updated: 0,
    skipped: 0,
    maintenanceCreated: 0,
    errors: [],
  };

  for (const row of rows) {
    try {
      const action = await upsertRegisterAsset(pool, row, actor);
      if (action === 'imported') result.imported += 1;
      else result.updated += 1;

      if (row.nextMaintenanceDate && (row.pmStatus === 'OVERDUE' || row.pmStatus === 'DUE')) {
        const maintenanceId = newItId('mnt');
        await pool.request()
          .input('maintenance_id', sql.NVarChar(40), maintenanceId)
          .input('title', sql.NVarChar(200), `Preventive maintenance - ${row.model}`)
          .input('asset_id', sql.NVarChar(40), row.sourceAssetId)
          .input('asset_name', sql.NVarChar(200), row.model)
          .input('category', sql.NVarChar(60), row.category)
          .input('scheduled_date', sql.Date, toDate(row.nextMaintenanceDate))
          .input('priority', sql.NVarChar(20), row.pmStatus === 'OVERDUE' ? 'High' : 'Medium')
          .input('status', sql.NVarChar(40), row.pmStatus === 'OVERDUE' ? 'Overdue' : 'Upcoming')
          .input('assigned_to', sql.NVarChar(180), row.assignedEmployeeName)
          .input('notes', sql.NVarChar(sql.MAX), `Imported from asset register. PM status: ${row.pmStatus || 'N/A'}`)
          .input('created_by', sql.NVarChar(120), actor)
          .input('updated_by', sql.NVarChar(120), actor)
          .query(`
            IF NOT EXISTS (SELECT 1 FROM [it].[MaintenanceRecords] WHERE AssetId = @asset_id AND ScheduledDate = @scheduled_date AND Title = @title)
            INSERT INTO [it].[MaintenanceRecords]
            (MaintenanceId, Title, AssetId, AssetName, Category, ScheduledDate, Priority, Status, AssignedTo, Notes, CreatedBy, UpdatedBy)
            VALUES (@maintenance_id, @title, @asset_id, @asset_name, @category, @scheduled_date, @priority, @status, @assigned_to, @notes, @created_by, @updated_by)`);
        result.maintenanceCreated += 1;
      }
    } catch (error) {
      result.skipped += 1;
      result.errors.push(`${row.sourceAssetId}: ${error instanceof Error ? error.message : 'Import failed'}`);
    }
  }

  await appendItAssetAudit(pool, 'module', 'asset-management', 'import-register', actor, `Imported ${result.imported}, updated ${result.updated}, skipped ${result.skipped}`);
  return result;
};

export const importBundledItAssetRegister = async (actor: string) => {
  const candidates = [
    path.join(process.cwd(), 'data', 'it-asset-register.csv'),
    path.join(process.cwd(), 'apps', 'dashboard', 'data', 'it-asset-register.csv'),
  ];
  let csvText = '';
  for (const filePath of candidates) {
    try {
      csvText = await readFile(filePath, 'utf8');
      break;
    } catch {
      // try next path
    }
  }
  if (!csvText) throw new Error('Bundled asset register file not found.');
  const result = await importItAssetRegisterCsv(csvText, actor);
  const payload = await buildItAssetDashboardPayload();
  return { result, payload };
};
