import sql from 'mssql';
import { readFile } from 'fs/promises';
import path from 'path';
import {
  appendItAssetAudit,
  buildItAssetDashboardPayload,
  ensureItAssetDb,
  newItId,
} from '@/lib/it-asset-management-store';
import { parseSoftwareRegisterCsv, type SoftwareRegisterRow } from '@/lib/it-software-register-import';

export type SoftwareRegisterImportResult = {
  licensesImported: number;
  licensesUpdated: number;
  catalogImported: number;
  catalogUpdated: number;
  skipped: number;
  errors: string[];
};

const clean = (value: unknown, max = 200) => String(value ?? '').trim().slice(0, max);

const toDate = (value: string | null) => {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const upsertLicense = async (pool: sql.ConnectionPool, row: SoftwareRegisterRow, actor: string) => {
  const productName = clean(row.productName, 200);
  const existing = await pool.request()
    .input('product_name', sql.NVarChar(200), productName)
    .query(`SELECT TOP 1 LicenseId FROM [it].[SoftwareLicenses] WHERE LOWER(LTRIM(RTRIM(ProductName))) = LOWER(LTRIM(RTRIM(@product_name)))`);

  const existingId = clean((existing.recordset || [])[0]?.LicenseId, 40);
  const licenseId = existingId || newItId('lic');
  const request = pool.request()
    .input('license_id', sql.NVarChar(40), licenseId)
    .input('product_name', sql.NVarChar(200), productName)
    .input('vendor_name', sql.NVarChar(180), clean(row.vendorName, 180) || null)
    .input('license_type', sql.NVarChar(60), clean(row.licenseType, 60) || 'Subscription')
    .input('seats_total', sql.Int, row.seatsTotal || 0)
    .input('seats_used', sql.Int, 0)
    .input('compliance_status', sql.NVarChar(40), clean(row.complianceStatus, 40) || 'In Compliance')
    .input('expiry_date', sql.Date, toDate(row.expiryDate))
    .input('annual_cost', sql.Decimal(19, 2), row.annualCostNgn)
    .input('updated_by', sql.NVarChar(120), actor);

  if (existingId) {
    await request.query(`
      UPDATE [it].[SoftwareLicenses]
      SET ProductName = @product_name,
          VendorName = @vendor_name,
          LicenseType = @license_type,
          SeatsTotal = @seats_total,
          ComplianceStatus = @compliance_status,
          ExpiryDate = @expiry_date,
          AnnualCost = @annual_cost,
          UpdatedAt = SYSUTCDATETIME(),
          UpdatedBy = @updated_by
      WHERE LicenseId = @license_id
    `);
    return 'updated' as const;
  }

  await request.query(`
    INSERT INTO [it].[SoftwareLicenses]
      (LicenseId, ProductName, VendorName, LicenseType, SeatsTotal, SeatsUsed, ComplianceStatus, ExpiryDate, AnnualCost, UpdatedBy)
    VALUES
      (@license_id, @product_name, @vendor_name, @license_type, @seats_total, @seats_used, @compliance_status, @expiry_date, @annual_cost, @updated_by)
  `);
  return 'imported' as const;
};

const upsertCatalog = async (pool: sql.ConnectionPool, row: SoftwareRegisterRow, actor: string) => {
  const productName = clean(row.productName, 200);
  const existing = await pool.request()
    .input('product_name', sql.NVarChar(200), productName)
    .query(`SELECT TOP 1 CatalogId FROM [it].[SoftwareCatalog] WHERE LOWER(LTRIM(RTRIM(ProductName))) = LOWER(LTRIM(RTRIM(@product_name)))`);

  const existingId = clean((existing.recordset || [])[0]?.CatalogId, 40);
  const catalogId = existingId || newItId('cat');
  const status = row.complianceStatus === 'Expired' || row.complianceStatus === 'Non-Compliant' ? 'Review' : 'Approved';
  const request = pool.request()
    .input('catalog_id', sql.NVarChar(40), catalogId)
    .input('product_name', sql.NVarChar(200), productName)
    .input('vendor_name', sql.NVarChar(180), clean(row.vendorName, 180) || null)
    .input('category', sql.NVarChar(80), clean(row.category, 80) || null)
    .input('edition', sql.NVarChar(120), clean(row.edition, 120) || null)
    .input('status', sql.NVarChar(40), status)
    .input('annual_cost', sql.Decimal(19, 2), row.annualCostNgn)
    .input('updated_by', sql.NVarChar(120), actor);

  if (existingId) {
    await request.query(`
      UPDATE [it].[SoftwareCatalog]
      SET ProductName = @product_name,
          VendorName = @vendor_name,
          Category = @category,
          Edition = COALESCE(@edition, Edition),
          Status = @status,
          AnnualCost = @annual_cost,
          UpdatedAt = SYSUTCDATETIME(),
          UpdatedBy = @updated_by
      WHERE CatalogId = @catalog_id
    `);
    return 'updated' as const;
  }

  await request.query(`
    INSERT INTO [it].[SoftwareCatalog]
      (CatalogId, ProductName, VendorName, Category, Edition, Status, AnnualCost, UpdatedBy)
    VALUES
      (@catalog_id, @product_name, @vendor_name, @category, @edition, @status, @annual_cost, @updated_by)
  `);
  return 'imported' as const;
};

export const importItSoftwareRegisterCsv = async (csvText: string, actor: string) => {
  const pool = await ensureItAssetDb();
  const rows = parseSoftwareRegisterCsv(csvText);
  const result: SoftwareRegisterImportResult = {
    licensesImported: 0,
    licensesUpdated: 0,
    catalogImported: 0,
    catalogUpdated: 0,
    skipped: 0,
    errors: [],
  };

  for (const row of rows) {
    try {
      if (!row.productName) {
        result.skipped += 1;
        continue;
      }
      const licenseResult = await upsertLicense(pool, row, actor);
      if (licenseResult === 'imported') result.licensesImported += 1;
      else result.licensesUpdated += 1;

      const catalogResult = await upsertCatalog(pool, row, actor);
      if (catalogResult === 'imported') result.catalogImported += 1;
      else result.catalogUpdated += 1;
    } catch (error) {
      result.errors.push(`${row.productName}: ${error instanceof Error ? error.message : 'Import failed'}`);
      result.skipped += 1;
    }
  }

  await appendItAssetAudit(
    pool,
    'module',
    'software-management',
    'import-software-register',
    actor,
    `Licenses +${result.licensesImported}/${result.licensesUpdated}, catalog +${result.catalogImported}/${result.catalogUpdated}`,
  );

  return {
    result,
    payload: await buildItAssetDashboardPayload(),
  };
};

export const importBundledItSoftwareRegister = async (actor: string) => {
  const candidates = [
    path.join(process.cwd(), 'data', 'it-software-license-register.csv'),
    path.join(process.cwd(), 'apps', 'dashboard', 'data', 'it-software-license-register.csv'),
  ];
  let csvText = '';
  for (const filePath of candidates) {
    try {
      csvText = await readFile(filePath, 'utf8');
      break;
    } catch {
      // try next candidate
    }
  }
  if (!csvText) throw new Error('Bundled software license register CSV was not found.');
  return importItSoftwareRegisterCsv(csvText, actor);
};
