import sql from 'mssql';
import { getDleEnterpriseDbPool } from '@/lib/dle-enterprise-db';
import { ensureProcurementSchemaSql } from '@/lib/procurement-sql-schema';
import { parsePrAttachments, savePrAttachmentFile, type PrAttachment } from '@/lib/procurement/pr-attachment-storage';

const dbReady = { value: false };

export const nowProcIso = () => new Date().toISOString();
export const newId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;

const clean = (value: unknown, max = 200) => String(value ?? '').trim().slice(0, max);
const cleanNullable = (value: unknown, max = 200) => {
  const text = clean(value, max);
  return text || null;
};
const toIso = (value: unknown) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};
const toBool = (value: unknown) => Boolean(value === true || value === 1 || value === '1' || value === 'true');
const toNum = (value: unknown, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const toDateOnly = (value: unknown) => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const text = String(value).trim();
  if (!text) return null;
  const date = new Date(text.includes('T') ? text : `${text}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};
const yearPrefix = (base: string) => `${base}-${new Date().getUTCFullYear()}`;

export type ProcBidPrice = { original: number; negotiated?: number | null };
export type ProcBidItem = {
  itemId: string;
  lineNo: number;
  description: string;
  uom: string | null;
  qty: number;
  prices: Record<string, ProcBidPrice>;
};
export type ProcBidder = {
  bidderId: string;
  cbeId: string;
  supplierId: string | null;
  name: string;
  code: string | null;
  approved: boolean;
  quoteNo: string | null;
  quoteDate: string | null;
  validUntil: string | null;
  currency: string | null;
  paymentTerms: string | null;
  deliveryPeriod: string | null;
  deliveryLocation: string | null;
  outstanding: number;
  discount: number;
  transportation: number;
  otherCharges: number;
  vatRate: number;
  sortOrder: number;
};

export const supplierSubtotal = (
  items: Array<{ qty: number; prices: Record<string, ProcBidPrice> }>,
  bidderId: string,
  negotiated = true,
) =>
  items.reduce((sum, item) => {
    const price = item.prices[bidderId];
    if (!price) return sum;
    const unit = negotiated ? (price.negotiated ?? price.original) : price.original;
    return sum + item.qty * toNum(unit);
  }, 0);

export const supplierTotal = (
  bidder: {
    id?: string;
    bidderId?: string;
    discount?: number;
    transportation?: number;
    otherCharges?: number;
    vatRate?: number;
  },
  items: Array<{ qty: number; prices: Record<string, ProcBidPrice> }>,
  negotiated = true,
) => {
  const bidderId = clean(bidder.bidderId ?? bidder.id, 40);
  const subtotal = supplierSubtotal(items, bidderId, negotiated);
  const taxable =
    subtotal - toNum(bidder.discount) + toNum(bidder.transportation) + toNum(bidder.otherCharges);
  const vat = taxable * (toNum(bidder.vatRate, 7.5) / 100);
  return taxable + vat;
};

const nextSequentialId = async (pool: sql.ConnectionPool, table: string, column: string, prefix: string) => {
  const result = await pool
    .request()
    .query(`SELECT MAX([${column}]) AS MaxId FROM [procurement].[${table}] WHERE [${column}] LIKE N'${prefix}-%'`);
  const maxId = String(result.recordset[0]?.MaxId || '');
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = maxId.match(new RegExp(`^${escaped}-(\\d+)$`, 'i'));
  const next = match ? Number(match[1]) + 1 : 1;
  return `${prefix}-${String(next).padStart(4, '0')}`;
};

const parseJson = <T>(value: unknown, fallback: T): T => {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value as T;
  try {
    return JSON.parse(String(value)) as T;
  } catch {
    return fallback;
  }
};

const touchCbe = async (pool: sql.ConnectionPool, cbeId: string, actor: string) => {
  await pool
    .request()
    .input('CbeId', sql.NVarChar(40), cbeId)
    .input('UpdatedBy', sql.NVarChar(120), clean(actor, 120))
    .query(`
      UPDATE [procurement].[CbeEvaluations]
      SET [UpdatedAt]=SYSUTCDATETIME(), [UpdatedBy]=@UpdatedBy
      WHERE [CbeId]=@CbeId
    `);
};

export const ensureProcurementDb = async () => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new Error('DLE_Enterprise database is not configured. Procurement requires SQL persistence.');
  if (!dbReady.value) {
    await pool.request().query(ensureProcurementSchemaSql);
    await seedDefaults(pool);
    dbReady.value = true;
  }
  return pool;
};

const seedDefaults = async (pool: sql.ConnectionPool) => {
  const settingsCount = await pool.request().query(`SELECT COUNT(1) AS Cnt FROM [procurement].[Settings]`);
  if (Number(settingsCount.recordset[0]?.Cnt || 0) === 0) {
    const settings: Array<[string, string, string | null, string | null, number]> = [
      ['category', 'Mechanical', 'Mechanical', null, 1],
      ['category', 'Electrical', 'Electrical', null, 2],
      ['category', 'Instrumentation', 'Instrumentation', null, 3],
      ['category', 'Civil', 'Civil', null, 4],
      ['category', 'Services', 'Services', null, 5],
      ['category', 'Consumables', 'Consumables', null, 6],
      ['evaluation-method', 'Lowest Price', 'Lowest Price', null, 1],
      ['evaluation-method', 'Best Value (Weighted)', 'Best Value (Weighted)', null, 2],
      ['evaluation-method', 'Pass / Fail Technical then Lowest Price', 'Pass / Fail Technical then Lowest Price', null, 3],
      [
        'approval-matrix',
        'Default CBE Approval',
        'Default',
        JSON.stringify([
          { stepNo: 1, roleName: 'Procurement Officer' },
          { stepNo: 2, roleName: 'Procurement Manager' },
          { stepNo: 3, roleName: 'Finance Manager' },
          { stepNo: 4, roleName: 'Managing Director' },
        ]),
        1,
      ],
    ];
    for (const [type, name, value, payload, sort] of settings) {
      await pool
        .request()
        .input('SettingId', sql.NVarChar(40), newId('SET'))
        .input('SettingType', sql.NVarChar(60), type)
        .input('Name', sql.NVarChar(200), name)
        .input('Value', sql.NVarChar(200), value)
        .input('PayloadJson', sql.NVarChar(sql.MAX), payload)
        .input('SortOrder', sql.Int, sort)
        .query(`
          INSERT INTO [procurement].[Settings]
            ([SettingId], [SettingType], [Name], [Value], [PayloadJson], [SortOrder])
          VALUES
            (@SettingId, @SettingType, @Name, @Value, @PayloadJson, @SortOrder)
        `);
    }
  }

  await seedSampleCbeIfEmpty(pool);
};

const textCol = (row: Record<string, unknown>, key: string) =>
  row[key] == null || String(row[key]).trim() === '' ? null : String(row[key]).trim();

const mapSupplier = (row: Record<string, unknown>) => ({
  supplierId: String(row.SupplierId),
  name: String(row.Name),
  code: row.Code == null ? null : String(row.Code),
  sageCode: row.SageCode == null ? null : String(row.SageCode),
  source: String(row.Source || 'LOCAL'),
  shortName: textCol(row, 'ShortName'),
  contactName: textCol(row, 'ContactName'),
  isApproved: toBool(row.IsApproved),
  currency: row.Currency == null ? null : String(row.Currency),
  paymentTerms: row.PaymentTerms == null ? null : String(row.PaymentTerms),
  deliveryPeriod: row.DeliveryPeriod == null ? null : String(row.DeliveryPeriod),
  deliveryLocation: row.DeliveryLocation == null ? null : String(row.DeliveryLocation),
  addressLine: textCol(row, 'AddressLine'),
  city: textCol(row, 'City'),
  stateName: textCol(row, 'StateName'),
  country: textCol(row, 'Country'),
  postalCode: textCol(row, 'PostalCode'),
  outstanding: toNum(row.Outstanding),
  email: row.Email == null ? null : String(row.Email),
  phone: row.Phone == null ? null : String(row.Phone),
  mobile: textCol(row, 'Mobile'),
  website: textCol(row, 'Website'),
  taxId: textCol(row, 'TaxId'),
  registrationNo: textCol(row, 'RegistrationNo'),
  notes: row.Notes == null ? null : String(row.Notes),
  category: textCol(row, 'Category'),
  prequalificationStatus: textCol(row, 'PrequalificationStatus'),
  riskRating: textCol(row, 'RiskRating'),
  performanceScore: row.PerformanceScore == null ? null : toNum(row.PerformanceScore),
  complianceExpiry: toIso(row.ComplianceExpiry),
  isActive: toBool(row.IsActive),
  isBlacklisted: row.IsBlacklisted == null ? false : toBool(row.IsBlacklisted),
  createdAt: toIso(row.CreatedAt) || nowProcIso(),
  updatedAt: toIso(row.UpdatedAt) || nowProcIso(),
  createdBy: row.CreatedBy == null ? null : String(row.CreatedBy),
  updatedBy: row.UpdatedBy == null ? null : String(row.UpdatedBy),
});

const persistPrAttachments = async (prId: string, raw: unknown): Promise<PrAttachment[]> => {
  const incoming = Array.isArray(raw) ? raw : parsePrAttachments(raw);
  const saved: PrAttachment[] = [];
  for (const item of incoming as Array<PrAttachment & { contentBase64?: string }>) {
    const id = clean(item.id, 40) || newId('ATT');
    const name = clean(item.name, 180) || 'attachment.bin';
    const contentType = clean(item.contentType, 120) || 'application/octet-stream';
    const uploadedAt = clean(item.uploadedAt, 40) || nowProcIso();
    if (item.contentBase64) {
      try {
        const bytes = Buffer.from(String(item.contentBase64), 'base64');
        const stored = await savePrAttachmentFile(prId, name, bytes);
        saved.push({
          id,
          name,
          size: bytes.length,
          contentType,
          storedName: stored.fileName,
          uploadedAt,
        });
        continue;
      } catch {
        saved.push({
          id,
          name,
          size: toNum(item.size),
          contentType,
          uploadedAt,
        });
        continue;
      }
    }
    saved.push({
      id,
      name,
      size: toNum(item.size),
      contentType,
      storedName: item.storedName,
      uploadedAt,
    });
  }
  return saved;
};

const mapPr = (row: Record<string, unknown>) => {
  const location = textCol(row, 'Location') || textCol(row, 'DeliveryLocation');
  return {
    prId: String(row.PrId),
    title: String(row.Title),
    description: row.Description == null ? null : String(row.Description),
    department: row.Department == null ? null : String(row.Department),
    project: row.Project == null ? null : String(row.Project),
    requesterName: row.RequesterName == null ? null : String(row.RequesterName),
    status: String(row.Status),
    currency: row.Currency == null ? null : String(row.Currency),
    estimatedAmount: row.EstimatedAmount == null ? null : toNum(row.EstimatedAmount),
    requiredDate: toIso(row.RequiredDate),
    currentWith: row.CurrentWith == null ? null : String(row.CurrentWith),
    requestType: textCol(row, 'RequestType'),
    costCentre: textCol(row, 'CostCentre'),
    budgetLine: textCol(row, 'BudgetLine'),
    businessJustification: row.BusinessJustification == null ? null : String(row.BusinessJustification),
    deliveryLocation: location,
    location,
    site: textCol(row, 'Site'),
    priority: textCol(row, 'Priority'),
    attachments: parsePrAttachments(row.AttachmentsJson),
    createdAt: toIso(row.CreatedAt) || nowProcIso(),
    updatedAt: toIso(row.UpdatedAt) || nowProcIso(),
    createdBy: row.CreatedBy == null ? null : String(row.CreatedBy),
    updatedBy: row.UpdatedBy == null ? null : String(row.UpdatedBy),
  };
};

const mapPrLine = (row: Record<string, unknown>) => ({
  lineId: String(row.LineId),
  prId: String(row.PrId),
  itemCode: textCol(row, 'ItemCode'),
  description: String(row.Description),
  specification: textCol(row, 'Specification'),
  uom: row.Uom == null ? null : String(row.Uom),
  qty: toNum(row.Qty, 1),
  quantity: toNum(row.Qty, 1),
  unitEstimate: row.UnitEstimate == null ? null : toNum(row.UnitEstimate),
  unitPrice: row.UnitEstimate == null ? 0 : toNum(row.UnitEstimate),
  taxRate: row.TaxRate == null ? 0 : toNum(row.TaxRate),
  requiredDate: toIso(row.RequiredDate),
  deliveryLocation: textCol(row, 'DeliveryLocation'),
  sortOrder: toNum(row.SortOrder),
});

const mapRfq = (row: Record<string, unknown>) => ({
  rfqId: String(row.RfqId),
  prId: row.PrId == null ? null : String(row.PrId),
  title: String(row.Title),
  status: String(row.Status),
  issueDate: toIso(row.IssueDate),
  submissionDeadline: toIso(row.SubmissionDeadline),
  buyerName: row.BuyerName == null ? null : String(row.BuyerName),
  rfxType: textCol(row, 'RfxType') || 'RFQ',
  procurementMethod: textCol(row, 'ProcurementMethod'),
  evaluationMethod: textCol(row, 'EvaluationMethod'),
  technicalWeight: row.TechnicalWeight == null ? null : toNum(row.TechnicalWeight),
  commercialWeight: row.CommercialWeight == null ? null : toNum(row.CommercialWeight),
  instructions: row.Instructions == null ? null : String(row.Instructions),
  createdAt: toIso(row.CreatedAt) || nowProcIso(),
  updatedAt: toIso(row.UpdatedAt) || nowProcIso(),
  createdBy: row.CreatedBy == null ? null : String(row.CreatedBy),
  updatedBy: row.UpdatedBy == null ? null : String(row.UpdatedBy),
});

const mapInvite = (row: Record<string, unknown>) => ({
  inviteId: String(row.InviteId),
  rfqId: String(row.RfqId),
  supplierId: String(row.SupplierId),
  supplierName: String(row.SupplierName),
  status: String(row.Status),
  invitedAt: toIso(row.InvitedAt) || nowProcIso(),
});

const mapPo = (row: Record<string, unknown>) => ({
  poId: String(row.PoId),
  title: String(row.Title),
  supplierId: row.SupplierId == null ? null : String(row.SupplierId),
  supplierName: row.SupplierName == null ? null : String(row.SupplierName),
  cbeId: row.CbeId == null ? null : String(row.CbeId),
  status: String(row.Status),
  currency: row.Currency == null ? null : String(row.Currency),
  amount: row.Amount == null ? null : toNum(row.Amount),
  orderDate: toIso(row.OrderDate),
  expectedDate: toIso(row.ExpectedDate),
  awardRef: textCol(row, 'AwardRef'),
  contractId: textCol(row, 'ContractId'),
  paymentTerms: textCol(row, 'PaymentTerms'),
  deliveryTerms: textCol(row, 'DeliveryTerms'),
  deliveryLocation: textCol(row, 'DeliveryLocation'),
  quoteRef: textCol(row, 'QuoteRef'),
  project: textCol(row, 'Project'),
  costCentre: textCol(row, 'CostCentre'),
  createdAt: toIso(row.CreatedAt) || nowProcIso(),
  updatedAt: toIso(row.UpdatedAt) || nowProcIso(),
  createdBy: row.CreatedBy == null ? null : String(row.CreatedBy),
  updatedBy: row.UpdatedBy == null ? null : String(row.UpdatedBy),
});

const mapPoLine = (row: Record<string, unknown>) => ({
  lineId: String(row.LineId),
  poId: String(row.PoId),
  itemCode: textCol(row, 'ItemCode'),
  description: String(row.Description),
  specification: textCol(row, 'Specification'),
  uom: row.Uom == null ? null : String(row.Uom),
  qty: toNum(row.Qty, 1),
  quantity: toNum(row.Qty, 1),
  unitPrice: toNum(row.UnitPrice),
  taxRate: toNum(row.TaxRate),
  requiredDate: toIso(row.RequiredDate),
  deliveryLocation: textCol(row, 'DeliveryLocation'),
  sortOrder: toNum(row.SortOrder),
});

const mapContract = (row: Record<string, unknown>) => ({
  contractId: String(row.ContractId),
  title: String(row.Title),
  supplierId: row.SupplierId == null ? null : String(row.SupplierId),
  supplierName: row.SupplierName == null ? null : String(row.SupplierName),
  poId: row.PoId == null ? null : String(row.PoId),
  status: String(row.Status),
  startDate: toIso(row.StartDate),
  endDate: toIso(row.EndDate),
  value: row.Value == null ? null : toNum(row.Value),
  notes: row.Notes == null ? null : String(row.Notes),
  contractType: textCol(row, 'ContractType'),
  currency: textCol(row, 'Currency') || 'NGN',
  paymentTerms: textCol(row, 'PaymentTerms'),
  performanceSecurity: textCol(row, 'PerformanceSecurity'),
  warranty: textCol(row, 'Warranty'),
  createdAt: toIso(row.CreatedAt) || nowProcIso(),
  updatedAt: toIso(row.UpdatedAt) || nowProcIso(),
  createdBy: row.CreatedBy == null ? null : String(row.CreatedBy),
  updatedBy: row.UpdatedBy == null ? null : String(row.UpdatedBy),
});

const mapSetting = (row: Record<string, unknown>) => ({
  settingId: String(row.SettingId),
  settingType: String(row.SettingType),
  name: String(row.Name),
  value: row.Value == null ? null : String(row.Value),
  payloadJson: row.PayloadJson == null ? null : String(row.PayloadJson),
  sortOrder: toNum(row.SortOrder),
  isActive: toBool(row.IsActive),
  updatedAt: toIso(row.UpdatedAt) || nowProcIso(),
  updatedBy: row.UpdatedBy == null ? null : String(row.UpdatedBy),
});

const mapCbe = (row: Record<string, unknown>) => ({
  cbeId: String(row.CbeId),
  title: String(row.Title),
  rfqId: row.RfqId == null ? null : String(row.RfqId),
  rfqNumber: row.RfqNumber == null ? null : String(row.RfqNumber),
  prId: row.PrId == null ? null : String(row.PrId),
  project: row.Project == null ? null : String(row.Project),
  department: row.Department == null ? null : String(row.Department),
  buyerName: row.BuyerName == null ? null : String(row.BuyerName),
  currency: String(row.Currency || 'NGN'),
  evaluationMethod: row.EvaluationMethod == null ? null : String(row.EvaluationMethod),
  status: String(row.Status),
  bidsLocked: toBool(row.BidsLocked),
  recommendedSupplierId: row.RecommendedSupplierId == null ? null : String(row.RecommendedSupplierId),
  createdAt: toIso(row.CreatedAt) || nowProcIso(),
  updatedAt: toIso(row.UpdatedAt) || nowProcIso(),
  createdBy: row.CreatedBy == null ? null : String(row.CreatedBy),
  updatedBy: row.UpdatedBy == null ? null : String(row.UpdatedBy),
});

const mapBidder = (row: Record<string, unknown>): ProcBidder => ({
  bidderId: String(row.BidderId),
  cbeId: String(row.CbeId),
  supplierId: row.SupplierId == null ? null : String(row.SupplierId),
  name: String(row.Name),
  code: row.Code == null ? null : String(row.Code),
  approved: toBool(row.Approved),
  quoteNo: row.QuoteNo == null ? null : String(row.QuoteNo),
  quoteDate: row.QuoteDate == null ? null : String(row.QuoteDate),
  validUntil: row.ValidUntil == null ? null : String(row.ValidUntil),
  currency: row.Currency == null ? null : String(row.Currency),
  paymentTerms: row.PaymentTerms == null ? null : String(row.PaymentTerms),
  deliveryPeriod: row.DeliveryPeriod == null ? null : String(row.DeliveryPeriod),
  deliveryLocation: row.DeliveryLocation == null ? null : String(row.DeliveryLocation),
  outstanding: toNum(row.Outstanding),
  discount: toNum(row.Discount),
  transportation: toNum(row.Transportation),
  otherCharges: toNum(row.OtherCharges),
  vatRate: toNum(row.VatRate, 7.5),
  sortOrder: toNum(row.SortOrder),
});

export const nextSupplierCode = async (pool?: sql.ConnectionPool) => {
  const db = pool || (await ensureProcurementDb());
  const result = await db.request().query(`
    SELECT [Code] FROM [procurement].[Suppliers]
    WHERE [Code] IS NOT NULL AND LTRIM(RTRIM([Code])) <> N''
  `);
  let bestPrefix = 'SUP-';
  let bestWidth = 4;
  let bestNum = 0;
  for (const row of result.recordset) {
    const code = String(row.Code || '').trim();
    const match = code.match(/^(.*?)(\d+)$/);
    if (!match) continue;
    const prefix = match[1];
    const digits = match[2] || '';
    const num = Number(digits);
    if (!Number.isFinite(num)) continue;
    if (num > bestNum || (num === bestNum && digits.length >= bestWidth)) {
      bestNum = num;
      bestPrefix = prefix;
      bestWidth = Math.max(digits.length, String(num).length);
    }
  }
  const next = bestNum + 1;
  return `${bestPrefix}${String(next).padStart(Math.max(bestWidth, String(next).length), '0')}`;
};

export const listSuppliers = async () => {
  const pool = await ensureProcurementDb();
  const result = await pool.request().query(`
    SELECT * FROM [procurement].[Suppliers]
    ORDER BY [Name]
  `);
  return result.recordset.map((row) => mapSupplier(row as Record<string, unknown>));
};

export const upsertSupplier = async (input: Record<string, unknown>, actor = 'system') => {
  const pool = await ensureProcurementDb();
  const name = clean(input.name, 220);
  if (!name) throw new Error('Supplier name is required.');
  const existingId = clean(input.supplierId, 40);
  let supplierId = existingId;
  let code = clean(input.code, 80);
  if (!existingId) {
    code = code || (await nextSupplierCode(pool));
    supplierId = code.slice(0, 40);
  } else if (!code) {
    code = (await nextSupplierCode(pool));
  }

  const duplicate = await pool
    .request()
    .input('Code', sql.NVarChar(80), code)
    .input('SupplierId', sql.NVarChar(40), supplierId)
    .query(`
      SELECT TOP 1 [SupplierId], [Name]
      FROM [procurement].[Suppliers]
      WHERE [Code]=@Code AND [SupplierId]<>@SupplierId
    `);
  if (duplicate.recordset[0]) {
    throw new Error(`Supplier code ${code} is already assigned to ${duplicate.recordset[0].Name}.`);
  }

  await pool
    .request()
    .input('SupplierId', sql.NVarChar(40), supplierId)
    .input('Name', sql.NVarChar(220), name)
    .input('Code', sql.NVarChar(80), code)
    .input('SageCode', sql.NVarChar(80), cleanNullable(input.sageCode, 80))
    .input('Source', sql.NVarChar(20), clean(input.source || (existingId ? 'LOCAL' : 'LOCAL'), 20) || 'LOCAL')
    .input('IsApproved', sql.Bit, input.isApproved == null ? 1 : toBool(input.isApproved) ? 1 : 0)
    .input('Currency', sql.NVarChar(10), cleanNullable(input.currency, 10) || 'NGN')
    .input('PaymentTerms', sql.NVarChar(200), cleanNullable(input.paymentTerms, 200))
    .input('DeliveryPeriod', sql.NVarChar(120), cleanNullable(input.deliveryPeriod, 120))
    .input('ShortName', sql.NVarChar(80), cleanNullable(input.shortName, 80))
    .input('ContactName', sql.NVarChar(220), cleanNullable(input.contactName, 220))
    .input('DeliveryLocation', sql.NVarChar(200), cleanNullable(input.deliveryLocation, 200))
    .input('AddressLine', sql.NVarChar(500), cleanNullable(input.addressLine, 500))
    .input('City', sql.NVarChar(120), cleanNullable(input.city, 120))
    .input('StateName', sql.NVarChar(120), cleanNullable(input.stateName, 120))
    .input('Country', sql.NVarChar(80), cleanNullable(input.country, 80))
    .input('PostalCode', sql.NVarChar(40), cleanNullable(input.postalCode, 40))
    .input('Outstanding', sql.Decimal(19, 2), toNum(input.outstanding))
    .input('Email', sql.NVarChar(200), cleanNullable(input.email, 200))
    .input('Phone', sql.NVarChar(80), cleanNullable(input.phone, 80))
    .input('Mobile', sql.NVarChar(80), cleanNullable(input.mobile, 80))
    .input('Website', sql.NVarChar(200), cleanNullable(input.website, 200))
    .input('TaxId', sql.NVarChar(80), cleanNullable(input.taxId, 80))
    .input('RegistrationNo', sql.NVarChar(80), cleanNullable(input.registrationNo, 80))
    .input('Notes', sql.NVarChar(sql.MAX), cleanNullable(input.notes, 8000))
    .input('Category', sql.NVarChar(120), cleanNullable(input.category, 120))
    .input('PrequalificationStatus', sql.NVarChar(80), cleanNullable(input.prequalificationStatus, 80))
    .input('RiskRating', sql.NVarChar(40), cleanNullable(input.riskRating, 40))
    .input('PerformanceScore', sql.Decimal(9, 2), input.performanceScore == null || input.performanceScore === '' ? null : toNum(input.performanceScore))
    .input('ComplianceExpiry', sql.Date, toDateOnly(input.complianceExpiry))
    .input('IsActive', sql.Bit, input.isActive == null ? 1 : toBool(input.isActive) ? 1 : 0)
    .input('IsBlacklisted', sql.Bit, input.isBlacklisted == null ? 0 : toBool(input.isBlacklisted) ? 1 : 0)
    .input('CreatedBy', sql.NVarChar(120), clean(actor, 120))
    .input('UpdatedBy', sql.NVarChar(120), clean(actor, 120))
    .query(`
      IF EXISTS (SELECT 1 FROM [procurement].[Suppliers] WHERE [SupplierId]=@SupplierId)
        UPDATE [procurement].[Suppliers] SET
          [Name]=@Name, [Code]=@Code, [SageCode]=COALESCE(@SageCode, [SageCode]),
          [Source]=CASE WHEN [Source]=N'SAGE' THEN [Source] ELSE @Source END,
          [ShortName]=@ShortName, [ContactName]=@ContactName,
          [IsApproved]=@IsApproved, [Currency]=@Currency,
          [PaymentTerms]=@PaymentTerms, [DeliveryPeriod]=@DeliveryPeriod, [DeliveryLocation]=@DeliveryLocation,
          [AddressLine]=@AddressLine, [City]=@City, [StateName]=@StateName, [Country]=@Country, [PostalCode]=@PostalCode,
          [Outstanding]=@Outstanding, [Email]=@Email, [Phone]=@Phone, [Mobile]=@Mobile, [Website]=@Website,
          [TaxId]=@TaxId, [RegistrationNo]=@RegistrationNo, [Notes]=@Notes, [IsActive]=@IsActive,
          [IsBlacklisted]=@IsBlacklisted,
          [Category]=@Category, [PrequalificationStatus]=@PrequalificationStatus, [RiskRating]=@RiskRating,
          [PerformanceScore]=@PerformanceScore, [ComplianceExpiry]=@ComplianceExpiry,
          [UpdatedAt]=SYSUTCDATETIME(), [UpdatedBy]=@UpdatedBy
        WHERE [SupplierId]=@SupplierId
      ELSE
        INSERT INTO [procurement].[Suppliers] (
          [SupplierId], [Name], [Code], [SageCode], [Source], [ShortName], [ContactName], [IsApproved], [Currency],
          [PaymentTerms], [DeliveryPeriod], [DeliveryLocation], [AddressLine], [City], [StateName], [Country],
          [PostalCode], [Outstanding], [Email], [Phone], [Mobile], [Website], [TaxId], [RegistrationNo], [Notes],
          [IsActive], [IsBlacklisted], [Category], [PrequalificationStatus], [RiskRating], [PerformanceScore],
          [ComplianceExpiry], [CreatedBy], [UpdatedBy]
        ) VALUES (
          @SupplierId, @Name, @Code, @SageCode, @Source, @ShortName, @ContactName, @IsApproved, @Currency,
          @PaymentTerms, @DeliveryPeriod, @DeliveryLocation, @AddressLine, @City, @StateName, @Country,
          @PostalCode, @Outstanding, @Email, @Phone, @Mobile, @Website, @TaxId, @RegistrationNo, @Notes,
          @IsActive, @IsBlacklisted, @Category, @PrequalificationStatus, @RiskRating, @PerformanceScore,
          @ComplianceExpiry, @CreatedBy, @UpdatedBy
        )
    `);
  return (await listSuppliers()).find((s) => s.supplierId === supplierId) || null;
};

export const syncSageSuppliersFromX3 = async (actor = 'system') => {
  const { fetchDistinctSageX3Suppliers } = await import('@/lib/sage-x3-suppliers');
  const fetched = await fetchDistinctSageX3Suppliers();
  const pool = await ensureProcurementDb();
  let inserted = 0;
  let updated = 0;
  for (const supplier of fetched.suppliers) {
    const existing = await pool
      .request()
      .input('SageCode', sql.NVarChar(80), supplier.sageCode)
      .input('Code', sql.NVarChar(80), supplier.sageCode)
      .query(`
        SELECT TOP 1 [SupplierId]
        FROM [procurement].[Suppliers]
        WHERE [SageCode]=@SageCode OR [Code]=@Code OR [SupplierId]=@SageCode
      `);
    const supplierId = String(existing.recordset[0]?.SupplierId || supplier.sageCode).slice(0, 40);
    const wasExisting = Boolean(existing.recordset[0]);
    await pool
      .request()
      .input('SupplierId', sql.NVarChar(40), supplierId)
      .input('Name', sql.NVarChar(220), clean(supplier.name, 220))
      .input('Code', sql.NVarChar(80), supplier.sageCode.slice(0, 80))
      .input('SageCode', sql.NVarChar(80), supplier.sageCode.slice(0, 80))
      .input('Source', sql.NVarChar(20), 'SAGE')
      .input('IsApproved', sql.Bit, 1)
      .input('Currency', sql.NVarChar(10), cleanNullable(supplier.currency, 10) || 'NGN')
      .input('PaymentTerms', sql.NVarChar(200), cleanNullable(supplier.paymentTerms, 200))
      .input('DeliveryLocation', sql.NVarChar(200), cleanNullable(supplier.deliveryLocation, 200))
      .input('ShortName', sql.NVarChar(80), cleanNullable(supplier.shortName, 80))
      .input('ContactName', sql.NVarChar(220), cleanNullable(supplier.contactName, 220))
      .input('AddressLine', sql.NVarChar(500), cleanNullable(supplier.addressLine, 500))
      .input('City', sql.NVarChar(120), cleanNullable(supplier.city, 120))
      .input('StateName', sql.NVarChar(120), cleanNullable(supplier.stateName, 120))
      .input('Country', sql.NVarChar(80), cleanNullable(supplier.country, 80))
      .input('PostalCode', sql.NVarChar(40), cleanNullable(supplier.postalCode, 40))
      .input('Email', sql.NVarChar(200), cleanNullable(supplier.email, 200))
      .input('Phone', sql.NVarChar(80), cleanNullable(supplier.phone, 80))
      .input('Mobile', sql.NVarChar(80), cleanNullable(supplier.mobile, 80))
      .input('Website', sql.NVarChar(200), cleanNullable(supplier.website, 200))
      .input('TaxId', sql.NVarChar(80), cleanNullable(supplier.taxId, 80))
      .input('RegistrationNo', sql.NVarChar(80), cleanNullable(supplier.registrationNo, 80))
      .input('IsActive', sql.Bit, supplier.isActive ? 1 : 0)
      .input('IsBlacklisted', sql.Bit, supplier.isBlacklisted ? 1 : 0)
      .input('CreatedBy', sql.NVarChar(120), clean(actor, 120))
      .input('UpdatedBy', sql.NVarChar(120), clean(actor, 120))
      .query(`
        IF EXISTS (SELECT 1 FROM [procurement].[Suppliers] WHERE [SupplierId]=@SupplierId)
          UPDATE [procurement].[Suppliers] SET
            [Name]=@Name, [Code]=@Code, [SageCode]=@SageCode, [Source]=@Source,
            [ShortName]=@ShortName, [ContactName]=@ContactName,
            [Currency]=@Currency, [PaymentTerms]=@PaymentTerms, [DeliveryLocation]=@DeliveryLocation,
            [AddressLine]=@AddressLine, [City]=@City, [StateName]=@StateName, [Country]=@Country,
            [PostalCode]=@PostalCode, [Email]=@Email, [Phone]=@Phone, [Mobile]=@Mobile, [Website]=@Website,
            [TaxId]=@TaxId, [RegistrationNo]=@RegistrationNo,
            [IsActive]=@IsActive, [IsApproved]=@IsApproved, [IsBlacklisted]=@IsBlacklisted,
            [UpdatedAt]=SYSUTCDATETIME(), [UpdatedBy]=@UpdatedBy
          WHERE [SupplierId]=@SupplierId
        ELSE
          INSERT INTO [procurement].[Suppliers] (
            [SupplierId], [Name], [Code], [SageCode], [Source], [ShortName], [ContactName], [IsApproved],
            [Currency], [PaymentTerms], [DeliveryLocation], [AddressLine], [City], [StateName], [Country],
            [PostalCode], [Email], [Phone], [Mobile], [Website], [TaxId], [RegistrationNo],
            [IsActive], [IsBlacklisted], [CreatedBy], [UpdatedBy]
          ) VALUES (
            @SupplierId, @Name, @Code, @SageCode, @Source, @ShortName, @ContactName, @IsApproved,
            @Currency, @PaymentTerms, @DeliveryLocation, @AddressLine, @City, @StateName, @Country,
            @PostalCode, @Email, @Phone, @Mobile, @Website, @TaxId, @RegistrationNo,
            @IsActive, @IsBlacklisted, @CreatedBy, @UpdatedBy
          )
      `);
    if (wasExisting) updated += 1;
    else inserted += 1;
  }
  return {
    table: fetched.table,
    fetched: fetched.suppliers.length,
    inserted,
    updated,
    skippedDuplicates: 0,
  };
};

export const listPurchaseRequisitions = async () => {
  const pool = await ensureProcurementDb();
  const [headers, lines] = await Promise.all([
    pool.request().query(`SELECT * FROM [procurement].[PurchaseRequisitions] ORDER BY [UpdatedAt] DESC`),
    pool.request().query(`SELECT * FROM [procurement].[PurchaseRequisitionLines] ORDER BY [SortOrder], [LineId]`),
  ]);
  const linesByPr = new Map<string, ReturnType<typeof mapPrLine>[]>();
  for (const row of lines.recordset) {
    const mapped = mapPrLine(row as Record<string, unknown>);
    const list = linesByPr.get(mapped.prId) || [];
    list.push(mapped);
    linesByPr.set(mapped.prId, list);
  }
  return headers.recordset.map((row) => {
    const pr = mapPr(row as Record<string, unknown>);
    return { ...pr, lines: linesByPr.get(pr.prId) || [] };
  });
};

export const upsertPurchaseRequisition = async (input: Record<string, unknown>, actor = 'system') => {
  const pool = await ensureProcurementDb();
  const prId =
    clean(input.prId, 40) || (await nextSequentialId(pool, 'PurchaseRequisitions', 'PrId', yearPrefix('PR')));
  const location = cleanNullable(input.location || input.deliveryLocation, 200);
  const hasAttachments = input.attachments !== undefined;
  const attachments = hasAttachments ? await persistPrAttachments(prId, input.attachments) : [];
  await pool
    .request()
    .input('PrId', sql.NVarChar(40), prId)
    .input('Title', sql.NVarChar(300), clean(input.title, 300))
    .input('Description', sql.NVarChar(sql.MAX), cleanNullable(input.description, 8000))
    .input('Department', sql.NVarChar(180), cleanNullable(input.department, 180))
    .input('Project', sql.NVarChar(180), cleanNullable(input.project, 180))
    .input('RequesterName', sql.NVarChar(220), cleanNullable(input.requesterName, 220) || actor)
    .input('Status', sql.NVarChar(40), clean(input.status || 'Draft', 40))
    .input('Currency', sql.NVarChar(10), cleanNullable(input.currency, 10) || 'NGN')
    .input('EstimatedAmount', sql.Decimal(19, 2), input.estimatedAmount == null ? null : toNum(input.estimatedAmount))
    .input('RequiredDate', sql.Date, toDateOnly(input.requiredDate))
    .input('CurrentWith', sql.NVarChar(120), cleanNullable(input.currentWith, 120))
    .input('RequestType', sql.NVarChar(40), cleanNullable(input.requestType, 40))
    .input('CostCentre', sql.NVarChar(100), cleanNullable(input.costCentre, 100))
    .input('BudgetLine', sql.NVarChar(120), cleanNullable(input.budgetLine, 120))
    .input('BusinessJustification', sql.NVarChar(sql.MAX), cleanNullable(input.businessJustification || input.description, 8000))
    .input('DeliveryLocation', sql.NVarChar(200), location)
    .input('Location', sql.NVarChar(200), location)
    .input('Site', sql.NVarChar(20), cleanNullable(input.site, 20))
    .input('AttachmentsJson', sql.NVarChar(sql.MAX), attachments.length ? JSON.stringify(attachments) : null)
    .input('HasAttachments', sql.Bit, hasAttachments ? 1 : 0)
    .input('Priority', sql.NVarChar(20), cleanNullable(input.priority, 20) || 'Medium')
    .input('CreatedBy', sql.NVarChar(120), clean(actor, 120))
    .input('UpdatedBy', sql.NVarChar(120), clean(actor, 120))
    .query(`
      IF EXISTS (SELECT 1 FROM [procurement].[PurchaseRequisitions] WHERE [PrId]=@PrId)
        UPDATE [procurement].[PurchaseRequisitions] SET
          [Title]=@Title, [Description]=@Description, [Department]=@Department, [Project]=@Project,
          [RequesterName]=@RequesterName, [Status]=@Status, [Currency]=@Currency,
          [EstimatedAmount]=@EstimatedAmount, [RequiredDate]=@RequiredDate, [CurrentWith]=@CurrentWith,
          [RequestType]=@RequestType, [CostCentre]=@CostCentre, [BudgetLine]=@BudgetLine,
          [BusinessJustification]=@BusinessJustification, [DeliveryLocation]=@DeliveryLocation, [Priority]=@Priority,
          [Site]=@Site, [Location]=@Location,
          [AttachmentsJson]=CASE WHEN @HasAttachments=1 THEN @AttachmentsJson ELSE [AttachmentsJson] END,
          [UpdatedAt]=SYSUTCDATETIME(), [UpdatedBy]=@UpdatedBy
        WHERE [PrId]=@PrId
      ELSE
        INSERT INTO [procurement].[PurchaseRequisitions] (
          [PrId], [Title], [Description], [Department], [Project], [RequesterName], [Status],
          [Currency], [EstimatedAmount], [RequiredDate], [CurrentWith], [RequestType], [CostCentre],
          [BudgetLine], [BusinessJustification], [DeliveryLocation], [Priority], [Site], [Location],
          [AttachmentsJson], [CreatedBy], [UpdatedBy]
        ) VALUES (
          @PrId, @Title, @Description, @Department, @Project, @RequesterName, @Status,
          @Currency, @EstimatedAmount, @RequiredDate, @CurrentWith, @RequestType, @CostCentre,
          @BudgetLine, @BusinessJustification, @DeliveryLocation, @Priority, @Site, @Location,
          @AttachmentsJson, @CreatedBy, @UpdatedBy
        )
    `);

  if (Array.isArray(input.lines)) {
    await pool.request().input('PrId', sql.NVarChar(40), prId).query(`
      DELETE FROM [procurement].[PurchaseRequisitionLines] WHERE [PrId]=@PrId
    `);
    let sort = 0;
    for (const raw of input.lines as Record<string, unknown>[]) {
      await pool
        .request()
        .input('LineId', sql.NVarChar(40), clean(raw.lineId, 40) || newId('PRL'))
        .input('PrId', sql.NVarChar(40), prId)
        .input('Description', sql.NVarChar(2000), clean(raw.description, 2000))
        .input('ItemCode', sql.NVarChar(80), cleanNullable(raw.itemCode, 80))
        .input('Specification', sql.NVarChar(2000), cleanNullable(raw.specification, 2000))
        .input('Uom', sql.NVarChar(40), cleanNullable(raw.uom, 40))
        .input('Qty', sql.Decimal(19, 4), toNum(raw.qty ?? raw.quantity, 1))
        .input('UnitEstimate', sql.Decimal(19, 2), raw.unitEstimate == null && raw.unitPrice == null ? null : toNum(raw.unitEstimate ?? raw.unitPrice))
        .input('TaxRate', sql.Decimal(9, 4), toNum(raw.taxRate))
        .input('RequiredDate', sql.Date, toDateOnly(raw.requiredDate))
        .input('DeliveryLocation', sql.NVarChar(200), cleanNullable(raw.deliveryLocation, 200))
        .input('SortOrder', sql.Int, raw.sortOrder == null ? sort : toNum(raw.sortOrder))
        .query(`
          INSERT INTO [procurement].[PurchaseRequisitionLines]
            ([LineId], [PrId], [Description], [ItemCode], [Specification], [Uom], [Qty], [UnitEstimate], [TaxRate], [RequiredDate], [DeliveryLocation], [SortOrder])
          VALUES
            (@LineId, @PrId, @Description, @ItemCode, @Specification, @Uom, @Qty, @UnitEstimate, @TaxRate, @RequiredDate, @DeliveryLocation, @SortOrder)
        `);
      sort += 1;
    }
  }

  return (await listPurchaseRequisitions()).find((p) => p.prId === prId) || null;
};

export const listRfqs = async () => {
  const pool = await ensureProcurementDb();
  const [headers, invites] = await Promise.all([
    pool.request().query(`SELECT * FROM [procurement].[Rfqs] ORDER BY [UpdatedAt] DESC`),
    pool.request().query(`SELECT * FROM [procurement].[RfqInvites] ORDER BY [InvitedAt] DESC`),
  ]);
  const invitesByRfq = new Map<string, ReturnType<typeof mapInvite>[]>();
  for (const row of invites.recordset) {
    const mapped = mapInvite(row as Record<string, unknown>);
    const list = invitesByRfq.get(mapped.rfqId) || [];
    list.push(mapped);
    invitesByRfq.set(mapped.rfqId, list);
  }
  return headers.recordset.map((row) => {
    const rfq = mapRfq(row as Record<string, unknown>);
    return { ...rfq, invites: invitesByRfq.get(rfq.rfqId) || [] };
  });
};

export const upsertRfq = async (input: Record<string, unknown>, actor = 'system') => {
  const pool = await ensureProcurementDb();
  const rfqId = clean(input.rfqId, 40) || (await nextSequentialId(pool, 'Rfqs', 'RfqId', yearPrefix('RFQ')));
  await pool
    .request()
    .input('RfqId', sql.NVarChar(40), rfqId)
    .input('PrId', sql.NVarChar(40), cleanNullable(input.prId, 40))
    .input('Title', sql.NVarChar(300), clean(input.title, 300))
    .input('Status', sql.NVarChar(40), clean(input.status || 'Draft', 40))
    .input('IssueDate', sql.Date, toDateOnly(input.issueDate))
    .input('SubmissionDeadline', sql.Date, toDateOnly(input.submissionDeadline))
    .input('BuyerName', sql.NVarChar(220), cleanNullable(input.buyerName, 220) || actor)
    .input('RfxType', sql.NVarChar(20), cleanNullable(input.rfxType, 20) || 'RFQ')
    .input('ProcurementMethod', sql.NVarChar(80), cleanNullable(input.procurementMethod, 80))
    .input('EvaluationMethod', sql.NVarChar(120), cleanNullable(input.evaluationMethod, 120))
    .input('TechnicalWeight', sql.Decimal(9, 4), input.technicalWeight == null || input.technicalWeight === '' ? null : toNum(input.technicalWeight))
    .input('CommercialWeight', sql.Decimal(9, 4), input.commercialWeight == null || input.commercialWeight === '' ? null : toNum(input.commercialWeight))
    .input('Instructions', sql.NVarChar(sql.MAX), cleanNullable(input.instructions, 8000))
    .input('CreatedBy', sql.NVarChar(120), clean(actor, 120))
    .input('UpdatedBy', sql.NVarChar(120), clean(actor, 120))
    .query(`
      IF EXISTS (SELECT 1 FROM [procurement].[Rfqs] WHERE [RfqId]=@RfqId)
        UPDATE [procurement].[Rfqs] SET
          [PrId]=@PrId, [Title]=@Title, [Status]=@Status, [IssueDate]=@IssueDate,
          [SubmissionDeadline]=@SubmissionDeadline, [BuyerName]=@BuyerName,
          [RfxType]=@RfxType, [ProcurementMethod]=@ProcurementMethod, [EvaluationMethod]=@EvaluationMethod,
          [TechnicalWeight]=@TechnicalWeight, [CommercialWeight]=@CommercialWeight, [Instructions]=@Instructions,
          [UpdatedAt]=SYSUTCDATETIME(), [UpdatedBy]=@UpdatedBy
        WHERE [RfqId]=@RfqId
      ELSE
        INSERT INTO [procurement].[Rfqs] (
          [RfqId], [PrId], [Title], [Status], [IssueDate], [SubmissionDeadline], [BuyerName],
          [RfxType], [ProcurementMethod], [EvaluationMethod], [TechnicalWeight], [CommercialWeight], [Instructions],
          [CreatedBy], [UpdatedBy]
        ) VALUES (
          @RfqId, @PrId, @Title, @Status, @IssueDate, @SubmissionDeadline, @BuyerName,
          @RfxType, @ProcurementMethod, @EvaluationMethod, @TechnicalWeight, @CommercialWeight, @Instructions,
          @CreatedBy, @UpdatedBy
        )
    `);

  if (Array.isArray(input.invites)) {
    await pool.request().input('RfqId', sql.NVarChar(40), rfqId).query(`
      DELETE FROM [procurement].[RfqInvites] WHERE [RfqId]=@RfqId
    `);
    for (const raw of input.invites as Array<{ supplierId?: string; supplierName?: string; status?: string }>) {
      await pool
        .request()
        .input('InviteId', sql.NVarChar(40), newId('INV'))
        .input('RfqId', sql.NVarChar(40), rfqId)
        .input('SupplierId', sql.NVarChar(40), clean(raw.supplierId, 40))
        .input('SupplierName', sql.NVarChar(220), clean(raw.supplierName, 220))
        .input('Status', sql.NVarChar(40), clean(raw.status || 'Invited', 40))
        .query(`
          INSERT INTO [procurement].[RfqInvites]
            ([InviteId], [RfqId], [SupplierId], [SupplierName], [Status])
          VALUES
            (@InviteId, @RfqId, @SupplierId, @SupplierName, @Status)
        `);
    }
  }

  return (await listRfqs()).find((r) => r.rfqId === rfqId) || null;
};

export const listPurchaseOrders = async () => {
  const pool = await ensureProcurementDb();
  const [headers, lines] = await Promise.all([
    pool.request().query(`SELECT * FROM [procurement].[PurchaseOrders] ORDER BY [UpdatedAt] DESC`),
    pool.request().query(`SELECT * FROM [procurement].[PurchaseOrderLines] ORDER BY [SortOrder], [LineId]`).catch(() => ({ recordset: [] as Record<string, unknown>[] })),
  ]);
  const linesByPo = new Map<string, ReturnType<typeof mapPoLine>[]>();
  for (const row of lines.recordset) {
    const mapped = mapPoLine(row as Record<string, unknown>);
    const list = linesByPo.get(mapped.poId) || [];
    list.push(mapped);
    linesByPo.set(mapped.poId, list);
  }
  return headers.recordset.map((row) => {
    const po = mapPo(row as Record<string, unknown>);
    return { ...po, lines: linesByPo.get(po.poId) || [] };
  });
};

export const upsertPurchaseOrder = async (input: Record<string, unknown>, actor = 'system') => {
  const pool = await ensureProcurementDb();
  const poId =
    clean(input.poId, 40) || (await nextSequentialId(pool, 'PurchaseOrders', 'PoId', yearPrefix('PO')));
  await pool
    .request()
    .input('PoId', sql.NVarChar(40), poId)
    .input('Title', sql.NVarChar(300), clean(input.title, 300))
    .input('SupplierId', sql.NVarChar(40), cleanNullable(input.supplierId, 40))
    .input('SupplierName', sql.NVarChar(220), cleanNullable(input.supplierName, 220))
    .input('CbeId', sql.NVarChar(40), cleanNullable(input.cbeId, 40))
    .input('Status', sql.NVarChar(40), clean(input.status || 'Draft', 40))
    .input('Currency', sql.NVarChar(10), cleanNullable(input.currency, 10) || 'NGN')
    .input('Amount', sql.Decimal(19, 2), input.amount == null ? null : toNum(input.amount))
    .input('OrderDate', sql.Date, toDateOnly(input.orderDate))
    .input('ExpectedDate', sql.Date, toDateOnly(input.expectedDate))
    .input('AwardRef', sql.NVarChar(80), cleanNullable(input.awardRef, 80))
    .input('ContractId', sql.NVarChar(40), cleanNullable(input.contractId, 40))
    .input('PaymentTerms', sql.NVarChar(200), cleanNullable(input.paymentTerms, 200))
    .input('DeliveryTerms', sql.NVarChar(200), cleanNullable(input.deliveryTerms, 200))
    .input('DeliveryLocation', sql.NVarChar(200), cleanNullable(input.deliveryLocation, 200))
    .input('QuoteRef', sql.NVarChar(120), cleanNullable(input.quoteRef, 120))
    .input('Project', sql.NVarChar(180), cleanNullable(input.project, 180))
    .input('CostCentre', sql.NVarChar(100), cleanNullable(input.costCentre, 100))
    .input('CreatedBy', sql.NVarChar(120), clean(actor, 120))
    .input('UpdatedBy', sql.NVarChar(120), clean(actor, 120))
    .query(`
      IF EXISTS (SELECT 1 FROM [procurement].[PurchaseOrders] WHERE [PoId]=@PoId)
        UPDATE [procurement].[PurchaseOrders] SET
          [Title]=@Title, [SupplierId]=@SupplierId, [SupplierName]=@SupplierName, [CbeId]=@CbeId,
          [Status]=@Status, [Currency]=@Currency, [Amount]=@Amount, [OrderDate]=@OrderDate,
          [ExpectedDate]=@ExpectedDate, [AwardRef]=@AwardRef, [ContractId]=@ContractId,
          [PaymentTerms]=@PaymentTerms, [DeliveryTerms]=@DeliveryTerms, [DeliveryLocation]=@DeliveryLocation,
          [QuoteRef]=@QuoteRef, [Project]=@Project, [CostCentre]=@CostCentre,
          [UpdatedAt]=SYSUTCDATETIME(), [UpdatedBy]=@UpdatedBy
        WHERE [PoId]=@PoId
      ELSE
        INSERT INTO [procurement].[PurchaseOrders] (
          [PoId], [Title], [SupplierId], [SupplierName], [CbeId], [Status], [Currency],
          [Amount], [OrderDate], [ExpectedDate], [AwardRef], [ContractId], [PaymentTerms], [DeliveryTerms],
          [DeliveryLocation], [QuoteRef], [Project], [CostCentre], [CreatedBy], [UpdatedBy]
        ) VALUES (
          @PoId, @Title, @SupplierId, @SupplierName, @CbeId, @Status, @Currency,
          @Amount, @OrderDate, @ExpectedDate, @AwardRef, @ContractId, @PaymentTerms, @DeliveryTerms,
          @DeliveryLocation, @QuoteRef, @Project, @CostCentre, @CreatedBy, @UpdatedBy
        )
    `);

  if (Array.isArray(input.lines)) {
    await pool.request().input('PoId', sql.NVarChar(40), poId).query(`
      DELETE FROM [procurement].[PurchaseOrderLines] WHERE [PoId]=@PoId
    `);
    let sort = 0;
    for (const raw of input.lines as Record<string, unknown>[]) {
      await pool
        .request()
        .input('LineId', sql.NVarChar(40), clean(raw.lineId, 40) || newId('POL'))
        .input('PoId', sql.NVarChar(40), poId)
        .input('ItemCode', sql.NVarChar(80), cleanNullable(raw.itemCode, 80))
        .input('Description', sql.NVarChar(500), clean(raw.description, 500))
        .input('Specification', sql.NVarChar(500), cleanNullable(raw.specification, 500))
        .input('Uom', sql.NVarChar(40), cleanNullable(raw.uom, 40))
        .input('Qty', sql.Decimal(19, 4), toNum(raw.qty ?? raw.quantity, 1))
        .input('UnitPrice', sql.Decimal(19, 4), toNum(raw.unitPrice ?? raw.unitEstimate))
        .input('TaxRate', sql.Decimal(9, 4), toNum(raw.taxRate))
        .input('RequiredDate', sql.Date, toDateOnly(raw.requiredDate))
        .input('DeliveryLocation', sql.NVarChar(200), cleanNullable(raw.deliveryLocation, 200))
        .input('SortOrder', sql.Int, raw.sortOrder == null ? sort : toNum(raw.sortOrder))
        .query(`
          INSERT INTO [procurement].[PurchaseOrderLines]
            ([LineId], [PoId], [ItemCode], [Description], [Specification], [Uom], [Qty], [UnitPrice], [TaxRate], [RequiredDate], [DeliveryLocation], [SortOrder])
          VALUES
            (@LineId, @PoId, @ItemCode, @Description, @Specification, @Uom, @Qty, @UnitPrice, @TaxRate, @RequiredDate, @DeliveryLocation, @SortOrder)
        `);
      sort += 1;
    }
  }

  return (await listPurchaseOrders()).find((p) => p.poId === poId) || null;
};

export const listContracts = async () => {
  const pool = await ensureProcurementDb();
  const result = await pool.request().query(`
    SELECT * FROM [procurement].[Contracts]
    ORDER BY [UpdatedAt] DESC
  `);
  return result.recordset.map((row) => mapContract(row as Record<string, unknown>));
};

export const upsertContract = async (input: Record<string, unknown>, actor = 'system') => {
  const pool = await ensureProcurementDb();
  const contractId =
    clean(input.contractId, 40) || (await nextSequentialId(pool, 'Contracts', 'ContractId', yearPrefix('CTR')));
  await pool
    .request()
    .input('ContractId', sql.NVarChar(40), contractId)
    .input('Title', sql.NVarChar(300), clean(input.title, 300))
    .input('SupplierId', sql.NVarChar(40), cleanNullable(input.supplierId, 40))
    .input('SupplierName', sql.NVarChar(220), cleanNullable(input.supplierName, 220))
    .input('PoId', sql.NVarChar(40), cleanNullable(input.poId, 40))
    .input('Status', sql.NVarChar(40), clean(input.status || 'Draft', 40))
    .input('StartDate', sql.Date, toDateOnly(input.startDate))
    .input('EndDate', sql.Date, toDateOnly(input.endDate))
    .input('Value', sql.Decimal(19, 2), input.value == null ? null : toNum(input.value))
    .input('Notes', sql.NVarChar(sql.MAX), cleanNullable(input.notes, 8000))
    .input('ContractType', sql.NVarChar(80), cleanNullable(input.contractType, 80))
    .input('Currency', sql.NVarChar(10), cleanNullable(input.currency, 10) || 'NGN')
    .input('PaymentTerms', sql.NVarChar(200), cleanNullable(input.paymentTerms, 200))
    .input('PerformanceSecurity', sql.NVarChar(200), cleanNullable(input.performanceSecurity, 200))
    .input('Warranty', sql.NVarChar(200), cleanNullable(input.warranty, 200))
    .input('CreatedBy', sql.NVarChar(120), clean(actor, 120))
    .input('UpdatedBy', sql.NVarChar(120), clean(actor, 120))
    .query(`
      IF EXISTS (SELECT 1 FROM [procurement].[Contracts] WHERE [ContractId]=@ContractId)
        UPDATE [procurement].[Contracts] SET
          [Title]=@Title, [SupplierId]=@SupplierId, [SupplierName]=@SupplierName, [PoId]=@PoId,
          [Status]=@Status, [StartDate]=@StartDate, [EndDate]=@EndDate, [Value]=@Value, [Notes]=@Notes,
          [ContractType]=@ContractType, [Currency]=@Currency, [PaymentTerms]=@PaymentTerms,
          [PerformanceSecurity]=@PerformanceSecurity, [Warranty]=@Warranty,
          [UpdatedAt]=SYSUTCDATETIME(), [UpdatedBy]=@UpdatedBy
        WHERE [ContractId]=@ContractId
      ELSE
        INSERT INTO [procurement].[Contracts] (
          [ContractId], [Title], [SupplierId], [SupplierName], [PoId], [Status], [StartDate],
          [EndDate], [Value], [Notes], [ContractType], [Currency], [PaymentTerms], [PerformanceSecurity],
          [Warranty], [CreatedBy], [UpdatedBy]
        ) VALUES (
          @ContractId, @Title, @SupplierId, @SupplierName, @PoId, @Status, @StartDate,
          @EndDate, @Value, @Notes, @ContractType, @Currency, @PaymentTerms, @PerformanceSecurity,
          @Warranty, @CreatedBy, @UpdatedBy
        )
    `);
  return (await listContracts()).find((c) => c.contractId === contractId) || null;
};

export const listSettings = async (settingType?: string) => {
  const pool = await ensureProcurementDb();
  const req = pool.request();
  let where = '1=1';
  if (settingType) {
    req.input('SettingType', sql.NVarChar(60), settingType);
    where = '[SettingType]=@SettingType';
  }
  const result = await req.query(`
    SELECT * FROM [procurement].[Settings]
    WHERE ${where}
    ORDER BY [SettingType], [SortOrder], [Name]
  `);
  return result.recordset.map((row) => mapSetting(row as Record<string, unknown>));
};

export const upsertSetting = async (input: Record<string, unknown>, actor = 'system') => {
  const pool = await ensureProcurementDb();
  const settingId = clean(input.settingId, 40) || newId('SET');
  await pool
    .request()
    .input('SettingId', sql.NVarChar(40), settingId)
    .input('SettingType', sql.NVarChar(60), clean(input.settingType, 60))
    .input('Name', sql.NVarChar(200), clean(input.name, 200))
    .input('Value', sql.NVarChar(200), cleanNullable(input.value, 200))
    .input('PayloadJson', sql.NVarChar(sql.MAX), cleanNullable(input.payloadJson, 8000))
    .input('SortOrder', sql.Int, toNum(input.sortOrder))
    .input('IsActive', sql.Bit, input.isActive == null ? 1 : toBool(input.isActive) ? 1 : 0)
    .input('UpdatedBy', sql.NVarChar(120), clean(actor, 120))
    .query(`
      IF EXISTS (SELECT 1 FROM [procurement].[Settings] WHERE [SettingId]=@SettingId)
        UPDATE [procurement].[Settings] SET
          [SettingType]=@SettingType, [Name]=@Name, [Value]=@Value, [PayloadJson]=@PayloadJson,
          [SortOrder]=@SortOrder, [IsActive]=@IsActive, [UpdatedAt]=SYSUTCDATETIME(), [UpdatedBy]=@UpdatedBy
        WHERE [SettingId]=@SettingId
      ELSE
        INSERT INTO [procurement].[Settings]
          ([SettingId], [SettingType], [Name], [Value], [PayloadJson], [SortOrder], [IsActive], [UpdatedBy])
        VALUES
          (@SettingId, @SettingType, @Name, @Value, @PayloadJson, @SortOrder, @IsActive, @UpdatedBy)
    `);
  return (await listSettings()).find((s) => s.settingId === settingId) || null;
};

export const listCbes = async () => {
  const pool = await ensureProcurementDb();
  const result = await pool.request().query(`
    SELECT e.*,
      (SELECT COUNT(1) FROM [procurement].[CbeBidders] b WHERE b.[CbeId]=e.[CbeId]) AS BidderCount,
      (SELECT COUNT(1) FROM [procurement].[CbeBidItems] i WHERE i.[CbeId]=e.[CbeId]) AS ItemCount
    FROM [procurement].[CbeEvaluations] e
    ORDER BY e.[UpdatedAt] DESC
  `);
  return result.recordset.map((row) => ({
    ...mapCbe(row as Record<string, unknown>),
    bidderCount: toNum(row.BidderCount),
    itemCount: toNum(row.ItemCount),
  }));
};

export const getCbeDetail = async (cbeId: string) => {
  const pool = await ensureProcurementDb();
  const id = clean(cbeId, 40);
  const evalResult = await pool
    .request()
    .input('CbeId', sql.NVarChar(40), id)
    .query(`SELECT * FROM [procurement].[CbeEvaluations] WHERE [CbeId]=@CbeId`);
  const evaluationRow = evalResult.recordset[0] as Record<string, unknown> | undefined;
  if (!evaluationRow) return null;

  const [biddersRes, itemsRes, pricesRes, techRes, negRes, recRes, apprRes, docsRes, auditRes] = await Promise.all([
    pool
      .request()
      .input('CbeId', sql.NVarChar(40), id)
      .query(`SELECT * FROM [procurement].[CbeBidders] WHERE [CbeId]=@CbeId ORDER BY [SortOrder], [Name]`),
    pool
      .request()
      .input('CbeId', sql.NVarChar(40), id)
      .query(`SELECT * FROM [procurement].[CbeBidItems] WHERE [CbeId]=@CbeId ORDER BY [LineNo]`),
    pool
      .request()
      .input('CbeId', sql.NVarChar(40), id)
      .query(`SELECT * FROM [procurement].[CbeBidPrices] WHERE [CbeId]=@CbeId`),
    pool
      .request()
      .input('CbeId', sql.NVarChar(40), id)
      .query(`SELECT * FROM [procurement].[CbeTechnicalCriteria] WHERE [CbeId]=@CbeId ORDER BY [LineNo]`),
    pool
      .request()
      .input('CbeId', sql.NVarChar(40), id)
      .query(`SELECT * FROM [procurement].[CbeNegotiationRounds] WHERE [CbeId]=@CbeId ORDER BY [CreatedAt]`),
    pool
      .request()
      .input('CbeId', sql.NVarChar(40), id)
      .query(`SELECT TOP 1 * FROM [procurement].[CbeRecommendations] WHERE [CbeId]=@CbeId ORDER BY [UpdatedAt] DESC`),
    pool
      .request()
      .input('CbeId', sql.NVarChar(40), id)
      .query(`SELECT * FROM [procurement].[CbeApprovals] WHERE [CbeId]=@CbeId ORDER BY [StepNo]`),
    pool
      .request()
      .input('CbeId', sql.NVarChar(40), id)
      .query(`SELECT * FROM [procurement].[CbeDocuments] WHERE [CbeId]=@CbeId ORDER BY [CreatedAt]`),
    pool
      .request()
      .input('CbeId', sql.NVarChar(40), id)
      .query(`SELECT * FROM [procurement].[CbeAuditLog] WHERE [CbeId]=@CbeId ORDER BY [CreatedAt] DESC`),
  ]);

  const pricesByItem = new Map<string, Record<string, ProcBidPrice>>();
  for (const row of pricesRes.recordset) {
    const itemId = String(row.ItemId);
    const bidderId = String(row.BidderId);
    const map = pricesByItem.get(itemId) || {};
    map[bidderId] = {
      original: toNum(row.OriginalUnit),
      negotiated: row.NegotiatedUnit == null ? null : toNum(row.NegotiatedUnit),
    };
    pricesByItem.set(itemId, map);
  }

  const items: ProcBidItem[] = itemsRes.recordset.map((row) => {
    const itemId = String(row.ItemId);
    return {
      itemId,
      lineNo: toNum(row.LineNo),
      description: String(row.Description),
      uom: row.Uom == null ? null : String(row.Uom),
      qty: toNum(row.Qty, 1),
      prices: pricesByItem.get(itemId) || {},
    };
  });

  const bidders = biddersRes.recordset.map((row) => mapBidder(row as Record<string, unknown>));
  const technicalCriteria = techRes.recordset.map((row) => ({
    criteriaId: String(row.CriteriaId),
    cbeId: String(row.CbeId),
    lineNo: toNum(row.LineNo),
    section: String(row.Section),
    requirement: String(row.Requirement),
    mandatory: toBool(row.Mandatory),
    supplierStatus: parseJson<Record<string, string>>(row.SupplierStatusJson, {}),
    comments: row.Comments == null ? null : String(row.Comments),
  }));

  const negotiationRounds = negRes.recordset.map((row) => ({
    roundId: String(row.RoundId),
    cbeId: String(row.CbeId),
    bidderId: String(row.BidderId),
    roundDate: row.RoundDate == null ? null : String(row.RoundDate),
    method: row.Method == null ? null : String(row.Method),
    negotiatedBy: row.NegotiatedBy == null ? null : String(row.NegotiatedBy),
    originalValue: toNum(row.OriginalValue),
    vendorOffer: toNum(row.VendorOffer),
    agreedValue: toNum(row.AgreedValue),
    notes: row.Notes == null ? null : String(row.Notes),
    isBafo: toBool(row.IsBafo),
    createdAt: toIso(row.CreatedAt) || nowProcIso(),
  }));

  const recommendationRow = recRes.recordset[0] as Record<string, unknown> | undefined;
  const recommendation = recommendationRow
    ? {
        recommendationId: String(recommendationRow.RecommendationId),
        cbeId: String(recommendationRow.CbeId),
        recommendedBidderId:
          recommendationRow.RecommendedBidderId == null ? null : String(recommendationRow.RecommendedBidderId),
        recommendedName:
          recommendationRow.RecommendedName == null ? null : String(recommendationRow.RecommendedName),
        basis: recommendationRow.Basis == null ? null : String(recommendationRow.Basis),
        scores: parseJson<unknown>(recommendationRow.ScoresJson, null),
        status: String(recommendationRow.Status),
        submittedAt: toIso(recommendationRow.SubmittedAt),
        updatedAt: toIso(recommendationRow.UpdatedAt) || nowProcIso(),
        updatedBy: recommendationRow.UpdatedBy == null ? null : String(recommendationRow.UpdatedBy),
      }
    : null;

  const approvals = apprRes.recordset.map((row) => ({
    approvalId: String(row.ApprovalId),
    cbeId: String(row.CbeId),
    stepNo: toNum(row.StepNo),
    roleName: String(row.RoleName),
    actorName: row.ActorName == null ? null : String(row.ActorName),
    status: String(row.Status),
    actionAt: toIso(row.ActionAt),
    notes: row.Notes == null ? null : String(row.Notes),
  }));

  const documents = docsRes.recordset.map((row) => ({
    documentId: String(row.DocumentId),
    cbeId: String(row.CbeId),
    name: String(row.Name),
    category: row.Category == null ? null : String(row.Category),
    vendor: row.Vendor == null ? null : String(row.Vendor),
    version: row.Version == null ? null : String(row.Version),
    uploadedBy: row.UploadedBy == null ? null : String(row.UploadedBy),
    uploadedOn: row.UploadedOn == null ? null : String(row.UploadedOn),
    sizeLabel: row.SizeLabel == null ? null : String(row.SizeLabel),
    createdAt: toIso(row.CreatedAt) || nowProcIso(),
  }));

  const audit = auditRes.recordset.map((row) => ({
    auditId: String(row.AuditId),
    cbeId: String(row.CbeId),
    action: String(row.Action),
    section: row.Section == null ? null : String(row.Section),
    details: row.Details == null ? null : String(row.Details),
    actorName: row.ActorName == null ? null : String(row.ActorName),
    actorRole: row.ActorRole == null ? null : String(row.ActorRole),
    createdAt: toIso(row.CreatedAt) || nowProcIso(),
  }));

  return {
    evaluation: mapCbe(evaluationRow),
    bidders,
    items,
    technicalCriteria,
    negotiationRounds,
    recommendation,
    approvals,
    documents,
    audit,
  };
};

export const createCbe = async (input: Record<string, unknown>, actor: string) => {
  const pool = await ensureProcurementDb();
  const prId = clean(input.prId, 40);
  if (!prId) throw new Error('Select a purchase requisition to create this CBE.');
  const requisitions = await listPurchaseRequisitions();
  const pr = requisitions.find((row) => row.prId === prId);
  if (!pr) throw new Error('The selected purchase requisition was not found.');

  const cbeId =
    clean(input.cbeId, 40) || (await nextSequentialId(pool, 'CbeEvaluations', 'CbeId', yearPrefix('CBE')));
  const title = clean(input.title || pr.title || 'Competitive Bid Evaluation', 300);
  await pool
    .request()
    .input('CbeId', sql.NVarChar(40), cbeId)
    .input('Title', sql.NVarChar(300), title)
    .input('RfqId', sql.NVarChar(40), cleanNullable(input.rfqId, 40))
    .input('RfqNumber', sql.NVarChar(80), cleanNullable(input.rfqNumber ?? input.rfqId, 80))
    .input('PrId', sql.NVarChar(40), prId)
    .input('Project', sql.NVarChar(180), cleanNullable(input.project ?? pr.project, 180))
    .input('Department', sql.NVarChar(180), cleanNullable(input.department ?? pr.department, 180))
    .input('BuyerName', sql.NVarChar(220), cleanNullable(input.buyerName, 220) || actor)
    .input('Currency', sql.NVarChar(10), clean(input.currency || pr.currency || 'NGN', 10))
    .input('EvaluationMethod', sql.NVarChar(120), cleanNullable(input.evaluationMethod, 120))
    .input('Status', sql.NVarChar(60), clean(input.status || 'Draft', 60))
    .input('BidsLocked', sql.Bit, toBool(input.bidsLocked) ? 1 : 0)
    .input('RecommendedSupplierId', sql.NVarChar(40), cleanNullable(input.recommendedSupplierId, 40))
    .input('CreatedBy', sql.NVarChar(120), clean(actor, 120))
    .input('UpdatedBy', sql.NVarChar(120), clean(actor, 120))
    .query(`
      INSERT INTO [procurement].[CbeEvaluations] (
        [CbeId], [Title], [RfqId], [RfqNumber], [PrId], [Project], [Department], [BuyerName],
        [Currency], [EvaluationMethod], [Status], [BidsLocked], [RecommendedSupplierId], [CreatedBy], [UpdatedBy]
      ) VALUES (
        @CbeId, @Title, @RfqId, @RfqNumber, @PrId, @Project, @Department, @BuyerName,
        @Currency, @EvaluationMethod, @Status, @BidsLocked, @RecommendedSupplierId, @CreatedBy, @UpdatedBy
      )
    `);

  let lineNo = 1;
  for (const line of pr.lines || []) {
    await pool
      .request()
      .input('ItemId', sql.NVarChar(40), newId('ITM'))
      .input('CbeId', sql.NVarChar(40), cbeId)
      .input('LineNo', sql.Int, lineNo)
      .input('Description', sql.NVarChar(500), clean(line.description, 500))
      .input('Uom', sql.NVarChar(40), cleanNullable(line.uom, 40))
      .input('Qty', sql.Decimal(19, 4), toNum(line.qty, 1))
      .query(`
        INSERT INTO [procurement].[CbeBidItems] ([ItemId], [CbeId], [LineNo], [Description], [Uom], [Qty])
        VALUES (@ItemId, @CbeId, @LineNo, @Description, @Uom, @Qty)
      `);
    lineNo += 1;
  }

  const defaultCriteria = [
    { section: 'A. GENERAL REQUIREMENTS', requirement: 'Compliance with the requisition / technical specification', mandatory: true },
    { section: 'A. GENERAL REQUIREMENTS', requirement: 'Material / quality documentation provided with the quotation', mandatory: true },
    { section: 'A. GENERAL REQUIREMENTS', requirement: 'Ability to meet the required delivery period', mandatory: false },
    { section: 'B. COMMERCIAL FITNESS', requirement: 'Quotation is complete, signed and currently valid', mandatory: true },
    { section: 'B. COMMERCIAL FITNESS', requirement: 'Payment terms are acceptable to DLE', mandatory: false },
    { section: 'C. QUALITY & COMPLIANCE', requirement: 'Traceability / batch identification available', mandatory: false },
  ];
  let criteriaNo = 1;
  for (const row of defaultCriteria) {
    await pool
      .request()
      .input('CriteriaId', sql.NVarChar(40), newId('TEC'))
      .input('CbeId', sql.NVarChar(40), cbeId)
      .input('LineNo', sql.Int, criteriaNo)
      .input('Section', sql.NVarChar(200), row.section)
      .input('Requirement', sql.NVarChar(500), row.requirement)
      .input('Mandatory', sql.Bit, row.mandatory ? 1 : 0)
      .input('SupplierStatusJson', sql.NVarChar(sql.MAX), '{}')
      .query(`
        INSERT INTO [procurement].[CbeTechnicalCriteria] (
          [CriteriaId], [CbeId], [LineNo], [Section], [Requirement], [Mandatory], [SupplierStatusJson]
        ) VALUES (
          @CriteriaId, @CbeId, @LineNo, @Section, @Requirement, @Mandatory, @SupplierStatusJson
        )
      `);
    criteriaNo += 1;
  }

  await addCbeAudit(
    cbeId,
    'CBE created',
    'Overview',
    `${cbeId} created from purchase requisition ${prId}. Supplier quotations are entered manually on Bid Comparison.`,
    actor,
    'Procurement Officer',
  );
  return getCbeDetail(cbeId);
};

export const updateCbeHeader = async (cbeId: string, input: Record<string, unknown>, actor: string) => {
  const pool = await ensureProcurementDb();
  const id = clean(cbeId, 40);
  const existing = await getCbeDetail(id);
  if (!existing) throw new Error('CBE not found');
  const e = existing.evaluation;
  await pool
    .request()
    .input('CbeId', sql.NVarChar(40), id)
    .input('Title', sql.NVarChar(300), clean(input.title ?? e.title, 300))
    .input('RfqId', sql.NVarChar(40), cleanNullable(input.rfqId ?? e.rfqId, 40))
    .input('RfqNumber', sql.NVarChar(80), cleanNullable(input.rfqNumber ?? e.rfqNumber, 80))
    .input('PrId', sql.NVarChar(40), cleanNullable(input.prId ?? e.prId, 40))
    .input('Project', sql.NVarChar(180), cleanNullable(input.project ?? e.project, 180))
    .input('Department', sql.NVarChar(180), cleanNullable(input.department ?? e.department, 180))
    .input('BuyerName', sql.NVarChar(220), cleanNullable(input.buyerName ?? e.buyerName, 220))
    .input('Currency', sql.NVarChar(10), clean(input.currency ?? e.currency, 10))
    .input(
      'EvaluationMethod',
      sql.NVarChar(120),
      cleanNullable(input.evaluationMethod ?? e.evaluationMethod, 120),
    )
    .input('Status', sql.NVarChar(60), clean(input.status ?? e.status, 60))
    .input(
      'BidsLocked',
      sql.Bit,
      input.bidsLocked == null ? (e.bidsLocked ? 1 : 0) : toBool(input.bidsLocked) ? 1 : 0,
    )
    .input(
      'RecommendedSupplierId',
      sql.NVarChar(40),
      cleanNullable(input.recommendedSupplierId ?? e.recommendedSupplierId, 40),
    )
    .input('UpdatedBy', sql.NVarChar(120), clean(actor, 120))
    .query(`
      UPDATE [procurement].[CbeEvaluations] SET
        [Title]=@Title, [RfqId]=@RfqId, [RfqNumber]=@RfqNumber, [PrId]=@PrId, [Project]=@Project,
        [Department]=@Department, [BuyerName]=@BuyerName, [Currency]=@Currency,
        [EvaluationMethod]=@EvaluationMethod, [Status]=@Status, [BidsLocked]=@BidsLocked,
        [RecommendedSupplierId]=@RecommendedSupplierId, [UpdatedAt]=SYSUTCDATETIME(), [UpdatedBy]=@UpdatedBy
      WHERE [CbeId]=@CbeId
    `);
  if (clean(input.status ?? '', 60) && clean(input.status, 60) !== e.status) {
    await addCbeAudit(id, `Status changed to ${clean(input.status, 60)}`, 'Overview', null, actor);
  } else {
    await addCbeAudit(id, 'CBE header updated', 'Overview', null, actor);
  }
  return getCbeDetail(id);
};

const upsertBidderRow = async (
  pool: sql.ConnectionPool,
  cbeId: string,
  bidder: Record<string, unknown>,
  sortOrder: number,
) => {
  const bidderId = clean(bidder.bidderId ?? bidder.id, 40) || newId('BID');
  await pool
    .request()
    .input('BidderId', sql.NVarChar(40), bidderId)
    .input('CbeId', sql.NVarChar(40), cbeId)
    .input('SupplierId', sql.NVarChar(40), cleanNullable(bidder.supplierId, 40) || bidderId)
    .input('Name', sql.NVarChar(220), clean(bidder.name, 220))
    .input('Code', sql.NVarChar(80), cleanNullable(bidder.code, 80))
    .input('Approved', sql.Bit, bidder.approved == null ? 1 : toBool(bidder.approved) ? 1 : 0)
    .input('QuoteNo', sql.NVarChar(80), cleanNullable(bidder.quoteNo, 80))
    .input('QuoteDate', sql.NVarChar(40), cleanNullable(bidder.quoteDate, 40))
    .input('ValidUntil', sql.NVarChar(40), cleanNullable(bidder.validUntil, 40))
    .input('Currency', sql.NVarChar(10), cleanNullable(bidder.currency, 10) || 'NGN')
    .input('PaymentTerms', sql.NVarChar(200), cleanNullable(bidder.paymentTerms, 200))
    .input('DeliveryPeriod', sql.NVarChar(120), cleanNullable(bidder.deliveryPeriod, 120))
    .input('DeliveryLocation', sql.NVarChar(200), cleanNullable(bidder.deliveryLocation, 200))
    .input('Outstanding', sql.Decimal(19, 2), toNum(bidder.outstanding))
    .input('Discount', sql.Decimal(19, 2), toNum(bidder.discount))
    .input('Transportation', sql.Decimal(19, 2), toNum(bidder.transportation))
    .input('OtherCharges', sql.Decimal(19, 2), toNum(bidder.otherCharges))
    .input('VatRate', sql.Decimal(9, 4), toNum(bidder.vatRate, 7.5))
    .input('SortOrder', sql.Int, toNum(bidder.sortOrder, sortOrder))
    .query(`
      IF EXISTS (SELECT 1 FROM [procurement].[CbeBidders] WHERE [BidderId]=@BidderId)
        UPDATE [procurement].[CbeBidders] SET
          [CbeId]=@CbeId, [SupplierId]=@SupplierId, [Name]=@Name, [Code]=@Code, [Approved]=@Approved,
          [QuoteNo]=@QuoteNo, [QuoteDate]=@QuoteDate, [ValidUntil]=@ValidUntil, [Currency]=@Currency,
          [PaymentTerms]=@PaymentTerms, [DeliveryPeriod]=@DeliveryPeriod, [DeliveryLocation]=@DeliveryLocation,
          [Outstanding]=@Outstanding, [Discount]=@Discount, [Transportation]=@Transportation,
          [OtherCharges]=@OtherCharges, [VatRate]=@VatRate, [SortOrder]=@SortOrder
        WHERE [BidderId]=@BidderId
      ELSE
        INSERT INTO [procurement].[CbeBidders] (
          [BidderId], [CbeId], [SupplierId], [Name], [Code], [Approved], [QuoteNo], [QuoteDate], [ValidUntil],
          [Currency], [PaymentTerms], [DeliveryPeriod], [DeliveryLocation], [Outstanding], [Discount],
          [Transportation], [OtherCharges], [VatRate], [SortOrder]
        ) VALUES (
          @BidderId, @CbeId, @SupplierId, @Name, @Code, @Approved, @QuoteNo, @QuoteDate, @ValidUntil,
          @Currency, @PaymentTerms, @DeliveryPeriod, @DeliveryLocation, @Outstanding, @Discount,
          @Transportation, @OtherCharges, @VatRate, @SortOrder
        )
    `);
  return bidderId;
};

export const saveCbeBidMatrix = async (
  cbeId: string,
  payload: { items?: Record<string, unknown>[]; bidders?: Record<string, unknown>[] },
  actor: string,
) => {
  const pool = await ensureProcurementDb();
  const id = clean(cbeId, 40);
  const existing = await getCbeDetail(id);
  if (!existing) throw new Error('CBE not found');

  if (Array.isArray(payload.bidders)) {
    const catalog = await listSuppliers();
    const byId = new Map(catalog.map((s) => [s.supplierId, s]));
    const seen = new Set<string>();
    const bidders = payload.bidders.map((bidder) => {
      const supplierId = clean(bidder.supplierId, 40);
      if (!supplierId) throw new Error('Each quotation must be linked to a supplier from the register.');
      if (seen.has(supplierId)) throw new Error('The same supplier cannot be added twice on this CBE.');
      seen.add(supplierId);
      const supplier = byId.get(supplierId);
      const alreadyOnCbe = existing.bidders.some((row) => row.supplierId === supplierId);
      if (!supplier && !alreadyOnCbe) throw new Error('A selected supplier was not found in the register.');
      if (supplier && (!supplier.isActive || supplier.isBlacklisted) && !alreadyOnCbe) {
        throw new Error(`${supplier.name} is not available for bidding.`);
      }
      return {
        ...bidder,
        supplierId,
        name: clean(bidder.name, 220) || supplier?.name || 'Supplier',
        code: cleanNullable(bidder.code, 80) || supplier?.code || null,
        approved: bidder.approved == null ? Boolean(supplier?.isApproved ?? true) : bidder.approved,
      };
    });
    const keepIds: string[] = [];
    let sort = 0;
    for (const bidder of bidders) {
      keepIds.push(await upsertBidderRow(pool, id, bidder, sort++));
    }
    if (keepIds.length) {
      const req = pool.request().input('CbeId', sql.NVarChar(40), id);
      const placeholders = keepIds.map((bid, i) => {
        req.input(`B${i}`, sql.NVarChar(40), bid);
        return `@B${i}`;
      });
      await req.query(`
        DELETE FROM [procurement].[CbeBidPrices]
        WHERE [CbeId]=@CbeId AND [BidderId] NOT IN (${placeholders.join(',')});
        DELETE FROM [procurement].[CbeBidders]
        WHERE [CbeId]=@CbeId AND [BidderId] NOT IN (${placeholders.join(',')});
      `);
    } else {
      await pool.request().input('CbeId', sql.NVarChar(40), id).query(`
        DELETE FROM [procurement].[CbeBidPrices] WHERE [CbeId]=@CbeId;
        DELETE FROM [procurement].[CbeBidders] WHERE [CbeId]=@CbeId;
      `);
    }
  }

  if (Array.isArray(payload.items)) {
    await pool.request().input('CbeId', sql.NVarChar(40), id).query(`
      DELETE FROM [procurement].[CbeBidPrices] WHERE [CbeId]=@CbeId;
      DELETE FROM [procurement].[CbeBidItems] WHERE [CbeId]=@CbeId;
    `);
    let lineNo = 1;
    for (const item of payload.items) {
      const itemId = clean(item.itemId ?? item.id, 40) || newId('ITM');
      const currentLine = toNum(item.lineNo, lineNo);
      await pool
        .request()
        .input('ItemId', sql.NVarChar(40), itemId)
        .input('CbeId', sql.NVarChar(40), id)
        .input('LineNo', sql.Int, currentLine)
        .input('Description', sql.NVarChar(500), clean(item.description, 500))
        .input('Uom', sql.NVarChar(40), cleanNullable(item.uom, 40))
        .input('Qty', sql.Decimal(19, 4), toNum(item.qty, 1))
        .query(`
          INSERT INTO [procurement].[CbeBidItems] ([ItemId], [CbeId], [LineNo], [Description], [Uom], [Qty])
          VALUES (@ItemId, @CbeId, @LineNo, @Description, @Uom, @Qty)
        `);
      const prices = (item.prices || {}) as Record<string, ProcBidPrice>;
      for (const [bidderId, price] of Object.entries(prices)) {
        await pool
          .request()
          .input('PriceId', sql.NVarChar(40), newId('PRC'))
          .input('CbeId', sql.NVarChar(40), id)
          .input('ItemId', sql.NVarChar(40), itemId)
          .input('BidderId', sql.NVarChar(40), clean(bidderId, 40))
          .input('OriginalUnit', sql.Decimal(19, 4), toNum(price?.original))
          .input(
            'NegotiatedUnit',
            sql.Decimal(19, 4),
            price?.negotiated == null ? null : toNum(price.negotiated),
          )
          .query(`
            INSERT INTO [procurement].[CbeBidPrices]
              ([PriceId], [CbeId], [ItemId], [BidderId], [OriginalUnit], [NegotiatedUnit])
            VALUES
              (@PriceId, @CbeId, @ItemId, @BidderId, @OriginalUnit, @NegotiatedUnit)
          `);
      }
      lineNo = currentLine + 1;
    }
  }

  await touchCbe(pool, id, actor);
  await addCbeAudit(id, 'Bid matrix saved', 'Bid Comparison', null, actor);
  return getCbeDetail(id);
};

export const saveCbeTechnical = async (
  cbeId: string,
  criteria: Record<string, unknown>[],
  actor: string,
) => {
  const pool = await ensureProcurementDb();
  const id = clean(cbeId, 40);
  const existing = await getCbeDetail(id);
  if (!existing) throw new Error('CBE not found');

  await pool.request().input('CbeId', sql.NVarChar(40), id).query(`
    DELETE FROM [procurement].[CbeTechnicalCriteria] WHERE [CbeId]=@CbeId
  `);

  let lineNo = 1;
  for (const row of criteria || []) {
    const currentLine = toNum(row.lineNo ?? row.id, lineNo);
    const supplierStatus =
      typeof row.supplierStatus === 'string'
        ? row.supplierStatus
        : JSON.stringify(row.supplierStatus || row.supplierStatusJson || {});
    await pool
      .request()
      .input('CriteriaId', sql.NVarChar(40), clean(row.criteriaId, 40) || newId('TEC'))
      .input('CbeId', sql.NVarChar(40), id)
      .input('LineNo', sql.Int, currentLine)
      .input('Section', sql.NVarChar(200), clean(row.section, 200))
      .input('Requirement', sql.NVarChar(500), clean(row.requirement, 500))
      .input('Mandatory', sql.Bit, row.mandatory == null ? 1 : toBool(row.mandatory) ? 1 : 0)
      .input('SupplierStatusJson', sql.NVarChar(sql.MAX), cleanNullable(supplierStatus, 8000))
      .input('Comments', sql.NVarChar(sql.MAX), cleanNullable(row.comments, 8000))
      .query(`
        INSERT INTO [procurement].[CbeTechnicalCriteria] (
          [CriteriaId], [CbeId], [LineNo], [Section], [Requirement], [Mandatory], [SupplierStatusJson], [Comments]
        ) VALUES (
          @CriteriaId, @CbeId, @LineNo, @Section, @Requirement, @Mandatory, @SupplierStatusJson, @Comments
        )
      `);
    lineNo = currentLine + 1;
  }

  await touchCbe(pool, id, actor);
  await addCbeAudit(id, 'Technical evaluation saved', 'Technical Evaluation', null, actor);
  return getCbeDetail(id);
};

export const addNegotiationRound = async (
  cbeId: string,
  round: Record<string, unknown>,
  actor: string,
) => {
  const pool = await ensureProcurementDb();
  const id = clean(cbeId, 40);
  const existing = await getCbeDetail(id);
  if (!existing) throw new Error('CBE not found');

  const roundId = clean(round.roundId, 40) || newId('NEG');
  await pool
    .request()
    .input('RoundId', sql.NVarChar(40), roundId)
    .input('CbeId', sql.NVarChar(40), id)
    .input('BidderId', sql.NVarChar(40), clean(round.bidderId ?? round.supplierId, 40))
    .input('RoundDate', sql.NVarChar(40), cleanNullable(round.roundDate ?? round.date, 40))
    .input('Method', sql.NVarChar(120), cleanNullable(round.method, 120))
    .input('NegotiatedBy', sql.NVarChar(220), cleanNullable(round.negotiatedBy, 220) || actor)
    .input('OriginalValue', sql.Decimal(19, 2), toNum(round.originalValue))
    .input('VendorOffer', sql.Decimal(19, 2), toNum(round.vendorOffer))
    .input('AgreedValue', sql.Decimal(19, 2), toNum(round.agreedValue))
    .input('Notes', sql.NVarChar(sql.MAX), cleanNullable(round.notes, 8000))
    .input('IsBafo', sql.Bit, toBool(round.isBafo ?? round.bafo) ? 1 : 0)
    .query(`
      INSERT INTO [procurement].[CbeNegotiationRounds] (
        [RoundId], [CbeId], [BidderId], [RoundDate], [Method], [NegotiatedBy],
        [OriginalValue], [VendorOffer], [AgreedValue], [Notes], [IsBafo]
      ) VALUES (
        @RoundId, @CbeId, @BidderId, @RoundDate, @Method, @NegotiatedBy,
        @OriginalValue, @VendorOffer, @AgreedValue, @Notes, @IsBafo
      )
    `);

  await touchCbe(pool, id, actor);
  await addCbeAudit(
    id,
    'Negotiation round added',
    'Negotiation',
    cleanNullable(round.notes, 500),
    actor,
  );
  return getCbeDetail(id);
};

const ensureDefaultApprovals = async (pool: sql.ConnectionPool, cbeId: string) => {
  const existing = await pool
    .request()
    .input('CbeId', sql.NVarChar(40), cbeId)
    .query(`SELECT COUNT(1) AS Cnt FROM [procurement].[CbeApprovals] WHERE [CbeId]=@CbeId`);
  if (Number(existing.recordset[0]?.Cnt || 0) > 0) return;

  const steps = [
    { stepNo: 1, roleName: 'Procurement Officer', status: 'Pending' },
    { stepNo: 2, roleName: 'Procurement Manager', status: 'Pending' },
    { stepNo: 3, roleName: 'Finance Manager', status: 'Pending' },
    { stepNo: 4, roleName: 'Managing Director', status: 'Pending' },
  ];
  for (const step of steps) {
    await pool
      .request()
      .input('ApprovalId', sql.NVarChar(40), newId('APR'))
      .input('CbeId', sql.NVarChar(40), cbeId)
      .input('StepNo', sql.Int, step.stepNo)
      .input('RoleName', sql.NVarChar(120), step.roleName)
      .input('Status', sql.NVarChar(40), step.status)
      .query(`
        INSERT INTO [procurement].[CbeApprovals]
          ([ApprovalId], [CbeId], [StepNo], [RoleName], [Status])
        VALUES
          (@ApprovalId, @CbeId, @StepNo, @RoleName, @Status)
      `);
  }
};

export const submitRecommendation = async (
  cbeId: string,
  payload: Record<string, unknown>,
  actor: string,
) => {
  const pool = await ensureProcurementDb();
  const id = clean(cbeId, 40);
  const existing = await getCbeDetail(id);
  if (!existing) throw new Error('CBE not found');

  const recommendationId =
    clean(payload.recommendationId, 40) ||
    existing.recommendation?.recommendationId ||
    newId('REC');
  const recommendedBidderId = cleanNullable(
    payload.recommendedBidderId ?? payload.recommendedSupplierId,
    40,
  );
  const recommendedName = cleanNullable(payload.recommendedName, 220);
  const status = clean(payload.status || 'Submitted', 40);
  const scoresJson =
    typeof payload.scoresJson === 'string'
      ? payload.scoresJson
      : payload.scores != null
        ? JSON.stringify(payload.scores)
        : existing.recommendation?.scores
          ? JSON.stringify(existing.recommendation.scores)
          : null;

  await pool
    .request()
    .input('RecommendationId', sql.NVarChar(40), recommendationId)
    .input('CbeId', sql.NVarChar(40), id)
    .input('RecommendedBidderId', sql.NVarChar(40), recommendedBidderId)
    .input('RecommendedName', sql.NVarChar(220), recommendedName)
    .input('Basis', sql.NVarChar(sql.MAX), cleanNullable(payload.basis, 8000))
    .input('ScoresJson', sql.NVarChar(sql.MAX), cleanNullable(scoresJson, 8000))
    .input('Status', sql.NVarChar(40), status)
    .input('UpdatedBy', sql.NVarChar(120), clean(actor, 120))
    .query(`
      IF EXISTS (SELECT 1 FROM [procurement].[CbeRecommendations] WHERE [RecommendationId]=@RecommendationId)
        UPDATE [procurement].[CbeRecommendations] SET
          [RecommendedBidderId]=@RecommendedBidderId, [RecommendedName]=@RecommendedName,
          [Basis]=@Basis, [ScoresJson]=@ScoresJson, [Status]=@Status,
          [SubmittedAt]=SYSUTCDATETIME(), [UpdatedAt]=SYSUTCDATETIME(), [UpdatedBy]=@UpdatedBy
        WHERE [RecommendationId]=@RecommendationId
      ELSE
        INSERT INTO [procurement].[CbeRecommendations] (
          [RecommendationId], [CbeId], [RecommendedBidderId], [RecommendedName], [Basis],
          [ScoresJson], [Status], [SubmittedAt], [UpdatedBy]
        ) VALUES (
          @RecommendationId, @CbeId, @RecommendedBidderId, @RecommendedName, @Basis,
          @ScoresJson, @Status, SYSUTCDATETIME(), @UpdatedBy
        )
    `);

  await pool
    .request()
    .input('CbeId', sql.NVarChar(40), id)
    .input('Status', sql.NVarChar(60), clean(payload.cbeStatus || 'Recommendation & Approval', 60))
    .input('RecommendedSupplierId', sql.NVarChar(40), recommendedBidderId)
    .input('UpdatedBy', sql.NVarChar(120), clean(actor, 120))
    .query(`
      UPDATE [procurement].[CbeEvaluations] SET
        [Status]=@Status, [RecommendedSupplierId]=@RecommendedSupplierId,
        [UpdatedAt]=SYSUTCDATETIME(), [UpdatedBy]=@UpdatedBy
      WHERE [CbeId]=@CbeId
    `);

  await ensureDefaultApprovals(pool, id);
  await addCbeAudit(
    id,
    'Recommendation submitted',
    'Recommendation & Approval',
    recommendedName ? `Recommended vendor: ${recommendedName}` : null,
    actor,
  );
  return getCbeDetail(id);
};

export const updateApprovalStep = async (
  cbeId: string,
  stepNo: number,
  status: string,
  actor: string,
  notes?: string,
) => {
  const pool = await ensureProcurementDb();
  const id = clean(cbeId, 40);
  const existing = await getCbeDetail(id);
  if (!existing) throw new Error('CBE not found');

  await ensureDefaultApprovals(pool, id);
  await pool
    .request()
    .input('CbeId', sql.NVarChar(40), id)
    .input('StepNo', sql.Int, toNum(stepNo))
    .input('Status', sql.NVarChar(40), clean(status, 40))
    .input('ActorName', sql.NVarChar(220), clean(actor, 220))
    .input('Notes', sql.NVarChar(sql.MAX), cleanNullable(notes, 8000))
    .query(`
      UPDATE [procurement].[CbeApprovals] SET
        [Status]=@Status, [ActorName]=@ActorName, [ActionAt]=SYSUTCDATETIME(), [Notes]=@Notes
      WHERE [CbeId]=@CbeId AND [StepNo]=@StepNo
    `);

  const approvals = await pool
    .request()
    .input('CbeId', sql.NVarChar(40), id)
    .query(`SELECT [Status] FROM [procurement].[CbeApprovals] WHERE [CbeId]=@CbeId`);
  const allApproved = approvals.recordset.every((row) => String(row.Status) === 'Approved' || String(row.Status) === 'Completed');
  if (allApproved) {
    await pool
      .request()
      .input('CbeId', sql.NVarChar(40), id)
      .input('UpdatedBy', sql.NVarChar(120), clean(actor, 120))
      .query(`
        UPDATE [procurement].[CbeEvaluations]
        SET [Status]=N'Approved', [UpdatedAt]=SYSUTCDATETIME(), [UpdatedBy]=@UpdatedBy
        WHERE [CbeId]=@CbeId
      `);
  }

  await addCbeAudit(
    id,
    `Approval step ${stepNo} set to ${clean(status, 40)}`,
    'Recommendation & Approval',
    cleanNullable(notes, 500),
    actor,
  );
  return getCbeDetail(id);
};

export const addCbeDocument = async (cbeId: string, doc: Record<string, unknown>, actor: string) => {
  const pool = await ensureProcurementDb();
  const id = clean(cbeId, 40);
  const existing = await getCbeDetail(id);
  if (!existing) throw new Error('CBE not found');

  const documentId = clean(doc.documentId, 40) || newId('DOC');
  await pool
    .request()
    .input('DocumentId', sql.NVarChar(40), documentId)
    .input('CbeId', sql.NVarChar(40), id)
    .input('Name', sql.NVarChar(300), clean(doc.name, 300))
    .input('Category', sql.NVarChar(120), cleanNullable(doc.category, 120))
    .input('Vendor', sql.NVarChar(220), cleanNullable(doc.vendor, 220))
    .input('Version', sql.NVarChar(40), cleanNullable(doc.version, 40))
    .input('UploadedBy', sql.NVarChar(220), cleanNullable(doc.uploadedBy, 220) || actor)
    .input('UploadedOn', sql.NVarChar(80), cleanNullable(doc.uploadedOn, 80) || nowProcIso())
    .input('SizeLabel', sql.NVarChar(40), cleanNullable(doc.sizeLabel ?? doc.size, 40))
    .query(`
      INSERT INTO [procurement].[CbeDocuments] (
        [DocumentId], [CbeId], [Name], [Category], [Vendor], [Version], [UploadedBy], [UploadedOn], [SizeLabel]
      ) VALUES (
        @DocumentId, @CbeId, @Name, @Category, @Vendor, @Version, @UploadedBy, @UploadedOn, @SizeLabel
      )
    `);

  await touchCbe(pool, id, actor);
  await addCbeAudit(id, 'Document uploaded', 'Documents', clean(doc.name, 300), actor);
  return getCbeDetail(id);
};

export const addCbeAudit = async (
  cbeId: string,
  action: string,
  section: string | null,
  details: string | null,
  actor: string,
  role?: string,
) => {
  const pool = await ensureProcurementDb();
  const auditId = newId('AUD');
  await pool
    .request()
    .input('AuditId', sql.NVarChar(40), auditId)
    .input('CbeId', sql.NVarChar(40), clean(cbeId, 40))
    .input('Action', sql.NVarChar(300), clean(action, 300))
    .input('Section', sql.NVarChar(80), cleanNullable(section, 80))
    .input('Details', sql.NVarChar(sql.MAX), cleanNullable(details, 8000))
    .input('ActorName', sql.NVarChar(220), cleanNullable(actor, 220))
    .input('ActorRole', sql.NVarChar(120), cleanNullable(role, 120))
    .query(`
      INSERT INTO [procurement].[CbeAuditLog]
        ([AuditId], [CbeId], [Action], [Section], [Details], [ActorName], [ActorRole])
      VALUES
        (@AuditId, @CbeId, @Action, @Section, @Details, @ActorName, @ActorRole)
    `);
  return { auditId, cbeId: clean(cbeId, 40), action: clean(action, 300), section, details, actorName: actor, actorRole: role || null, createdAt: nowProcIso() };
};

export const buildProcurementDashboard = async () => {
  const pool = await ensureProcurementDb();
  const result = await pool.request().query(`
    SELECT
      (SELECT COUNT(1) FROM [procurement].[PurchaseRequisitions]) AS PrCount,
      (SELECT COUNT(1) FROM [procurement].[PurchaseRequisitions] WHERE [Status] NOT IN (N'Closed', N'Cancelled', N'Rejected', N'Approved')) AS OpenPrCount,
      (SELECT COUNT(1) FROM [procurement].[Rfqs]) AS RfqCount,
      (SELECT COUNT(1) FROM [procurement].[Rfqs] WHERE [Status] NOT IN (N'Closed', N'Cancelled', N'Awarded')) AS OpenRfqCount,
      (SELECT COUNT(1) FROM [procurement].[CbeEvaluations]) AS CbeCount,
      (SELECT COUNT(1) FROM [procurement].[CbeEvaluations] WHERE [Status] NOT IN (N'Approved', N'Awarded', N'Cancelled', N'Completed')) AS OpenCbeCount,
      (SELECT COUNT(1) FROM [procurement].[PurchaseOrders]) AS PoCount,
      (SELECT COUNT(1) FROM [procurement].[PurchaseOrders] WHERE [Status] NOT IN (N'Completed', N'Cancelled', N'Closed')) AS OpenPoCount,
      (SELECT COUNT(1) FROM [procurement].[Suppliers] WHERE [IsActive]=1) AS SupplierCount,
      (SELECT COUNT(1) FROM [procurement].[Contracts] WHERE [Status] NOT IN (N'Expired', N'Cancelled', N'Closed')) AS ActiveContractCount,
      (SELECT COUNT(1) FROM [procurement].[CbeApprovals] WHERE [Status] IN (N'Pending', N'In Progress')) AS PendingApprovalCount,
      (SELECT ISNULL(SUM([Amount]), 0) FROM [procurement].[PurchaseOrders] WHERE YEAR([OrderDate]) = YEAR(SYSUTCDATETIME()) OR [OrderDate] IS NULL) AS YearSpend
  `);
  const row = result.recordset[0] || {};
  const [recentCbes, tasks, spendByDept] = await Promise.all([
    listCbes().then((rows) => rows.slice(0, 5)),
    pool.request().query(`
      SELECT TOP 8
        a.[CbeId] AS RefId,
        e.[Title] AS Title,
        a.[RoleName] AS Stage,
        ISNULL(e.[BuyerName], a.[ActorName]) AS Requester,
        a.[Status] AS Status,
        e.[UpdatedAt] AS DueAt,
        CASE WHEN a.[Status] = N'Pending' THEN N'High' ELSE N'Medium' END AS Priority
      FROM [procurement].[CbeApprovals] a
      INNER JOIN [procurement].[CbeEvaluations] e ON e.[CbeId] = a.[CbeId]
      WHERE a.[Status] IN (N'Pending', N'In Progress')
      ORDER BY e.[UpdatedAt] DESC
    `).catch(() => ({ recordset: [] as Record<string, unknown>[] })),
    pool.request().query(`
      SELECT TOP 6
        ISNULL(NULLIF(LTRIM(RTRIM(p.[Department])), N''), N'Others') AS Department,
        COUNT(1) AS Cnt,
        ISNULL(SUM(ISNULL(p.[EstimatedAmount], 0)), 0) AS Spend
      FROM [procurement].[PurchaseRequisitions] p
      GROUP BY ISNULL(NULLIF(LTRIM(RTRIM(p.[Department])), N''), N'Others')
      ORDER BY Spend DESC
    `).catch(() => ({ recordset: [] as Record<string, unknown>[] })),
  ]);

  const spendRows = spendByDept.recordset as Array<Record<string, unknown>>;
  const spendTotal = spendRows.reduce((sum, r) => sum + toNum(r.Spend), 0) || toNum(row.YearSpend);
  const colors = ['#1458d8', '#22c55e', '#f97316', '#8b5cf6', '#64748b', '#06b6d4'];

  return {
    prCount: toNum(row.PrCount),
    openPrCount: toNum(row.OpenPrCount),
    rfqCount: toNum(row.RfqCount),
    openRfqCount: toNum(row.OpenRfqCount),
    cbeCount: toNum(row.CbeCount),
    openCbeCount: toNum(row.OpenCbeCount),
    poCount: toNum(row.PoCount),
    openPoCount: toNum(row.OpenPoCount),
    supplierCount: toNum(row.SupplierCount),
    activeContractCount: toNum(row.ActiveContractCount),
    pendingApprovalCount: toNum(row.PendingApprovalCount),
    yearSpend: toNum(row.YearSpend) || spendTotal,
    recentCbes,
    tasks: (tasks.recordset as Array<Record<string, unknown>>).map((t) => ({
      refId: String(t.RefId),
      title: String(t.Title || ''),
      stage: String(t.Stage || ''),
      requester: t.Requester == null ? null : String(t.Requester),
      status: String(t.Status || ''),
      dueAt: toIso(t.DueAt),
      priority: String(t.Priority || 'Medium'),
    })),
    spendByDepartment: spendRows.map((r, i) => ({
      name: String(r.Department),
      value: toNum(r.Spend),
      count: toNum(r.Cnt),
      color: colors[i % colors.length],
    })),
  };
};

export const listProcurementLookupEmployees = async (q = '', limit = 20) => {
  const { readEmployeeDirectoryFromDb } = await import('@/lib/dle-enterprise-db');
  const rows = (await readEmployeeDirectoryFromDb()) || [];
  const needle = q.trim().toLowerCase();
  const filtered = needle
    ? rows.filter((e) =>
        [e.fullName, e.employeeCode, e.employeeId, e.department, e.email]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(needle)),
      )
    : rows;
  return filtered.slice(0, Math.max(1, Math.min(limit, 50))).map((e) => ({
    employeeCode: e.employeeCode || e.employeeId || '',
    fullName: e.fullName || e.employeeCode || 'Unknown',
    department: e.department || '',
    location: e.officeLocation || e.workLocation || '',
    email: e.email || '',
  }));
};

export const listProcurementLookupDepartments = async () => {
  const { readSystemDepartmentsFromOrganizationDb } = await import('@/lib/organization-departments-store');
  const payload = await readSystemDepartmentsFromOrganizationDb();
  return (payload.departments || []).map((d) => ({
    id: d.id,
    name: d.name,
    code: d.code || '',
    location: d.location || '',
  }));
};

export const listProcurementLookupProjects = async () => {
  try {
    const { listAllProjects } = await import('@/lib/projects-engineering/project-store');
    const projects = await listAllProjects();
    return projects.map((project) => ({
      id: project.id || project.code,
      code: project.code,
      name: project.name,
      client: project.client || '',
      location: project.location || '',
      status: project.status || '',
    }));
  } catch {
    return [];
  }
};

export const listProcurementLookupLocations = async () => {
  const mapped: Array<{ id: string; name: string; code: string; region: string; recordType: string }> = [];
  try {
    const { getDleEnterpriseDbPool } = await import('@/lib/dle-enterprise-db');
    const org = await getDleEnterpriseDbPool();
    if (org) {
      const result = await org.request().query(`
        SELECT TOP 500 [Id], [Name], [CostCenter], [Region], [RecordType], [Location]
        FROM [hris].[OrganizationLocationsSites]
        ORDER BY [Name]
      `);
      for (const row of result.recordset) {
        const name = String(row.Name || row.Location || '').trim();
        if (!name) continue;
        mapped.push({
          id: String(row.Id),
          name,
          code: String(row.CostCenter || ''),
          region: String(row.Region || ''),
          recordType: String(row.RecordType || 'Location'),
        });
      }
    }
  } catch {
    // Locations table may be empty or unavailable; fall through to supplier cities.
  }
  if (mapped.length) return mapped;

  const pool = await ensureProcurementDb();
  try {
    const result = await pool.request().query(`
      SELECT DISTINCT TOP 400
        COALESCE(NULLIF(LTRIM(RTRIM([City])), N''), NULLIF(LTRIM(RTRIM([DeliveryLocation])), N'')) AS Name
      FROM [procurement].[Suppliers]
      WHERE COALESCE(NULLIF(LTRIM(RTRIM([City])), N''), NULLIF(LTRIM(RTRIM([DeliveryLocation])), N'')) IS NOT NULL
      ORDER BY 1
    `);
    return result.recordset.map((row, index) => ({
      id: `city-${index}`,
      name: String(row.Name),
      code: '',
      region: '',
      recordType: 'City',
    }));
  } catch {
    const result = await pool.request().query(`
      SELECT DISTINCT TOP 400 NULLIF(LTRIM(RTRIM([DeliveryLocation])), N'') AS Name
      FROM [procurement].[Suppliers]
      WHERE NULLIF(LTRIM(RTRIM([DeliveryLocation])), N'') IS NOT NULL
      ORDER BY 1
    `);
    return result.recordset.map((row, index) => ({
      id: `loc-${index}`,
      name: String(row.Name),
      code: '',
      region: '',
      recordType: 'Location',
    }));
  }
};

export const buildProcurementReports = async () => {
  const pool = await ensureProcurementDb();
  const [statusRes, spendRes, supplierRes, cbePhaseRes] = await Promise.all([
    pool.request().query(`
      SELECT [Status] AS Label, COUNT(1) AS Cnt
      FROM [procurement].[PurchaseOrders]
      GROUP BY [Status]
      ORDER BY COUNT(1) DESC
    `),
    pool.request().query(`
      SELECT ISNULL(SUM([Amount]), 0) AS TotalPoAmount,
             ISNULL(AVG([Amount]), 0) AS AvgPoAmount,
             COUNT(1) AS PoCount
      FROM [procurement].[PurchaseOrders]
      WHERE [Amount] IS NOT NULL
    `),
    pool.request().query(`
      SELECT TOP 10 [SupplierName] AS Label, ISNULL(SUM([Amount]), 0) AS Amount, COUNT(1) AS Cnt
      FROM [procurement].[PurchaseOrders]
      WHERE [SupplierName] IS NOT NULL
      GROUP BY [SupplierName]
      ORDER BY SUM([Amount]) DESC
    `),
    pool.request().query(`
      SELECT [Status] AS Label, COUNT(1) AS Cnt
      FROM [procurement].[CbeEvaluations]
      GROUP BY [Status]
      ORDER BY COUNT(1) DESC
    `),
  ]);

  const spend = spendRes.recordset[0] || {};
  return {
    purchaseOrderByStatus: statusRes.recordset.map((row) => ({
      label: String(row.Label),
      count: toNum(row.Cnt),
    })),
    spendSummary: {
      totalPoAmount: toNum(spend.TotalPoAmount),
      avgPoAmount: toNum(spend.AvgPoAmount),
      poCount: toNum(spend.PoCount),
    },
    topSuppliersByPo: supplierRes.recordset.map((row) => ({
      label: String(row.Label),
      amount: toNum(row.Amount),
      count: toNum(row.Cnt),
    })),
    cbeByStatus: cbePhaseRes.recordset.map((row) => ({
      label: String(row.Label),
      count: toNum(row.Cnt),
    })),
  };
};

const mapDomainLine = (row: Record<string, unknown>) => ({
  lineId: String(row.LineId),
  recordId: String(row.RecordId),
  itemCode: textCol(row, 'ItemCode'),
  description: String(row.Description || ''),
  specification: textCol(row, 'Specification'),
  uom: row.Uom == null ? 'EA' : String(row.Uom),
  qty: toNum(row.Qty, 1),
  quantity: toNum(row.Qty, 1),
  unitPrice: toNum(row.UnitPrice),
  taxRate: toNum(row.TaxRate),
  requiredDate: toIso(row.RequiredDate),
  deliveryLocation: textCol(row, 'DeliveryLocation'),
  sortOrder: toNum(row.SortOrder),
});

const mapDomainRecord = (row: Record<string, unknown>, lines: ReturnType<typeof mapDomainLine>[] = []) => {
  const payload = parseJson<Record<string, unknown>>(row.PayloadJson, {});
  return {
    id: String(row.RecordId),
    recordId: String(row.RecordId),
    domain: String(row.Domain),
    reference: String(row.Reference || row.RecordId),
    title: String(row.Title || ''),
    status: String(row.Status || 'Draft'),
    priority: textCol(row, 'Priority') || 'Medium',
    project: textCol(row, 'Project'),
    costCentre: textCol(row, 'CostCentre'),
    ownerName: textCol(row, 'OwnerName'),
    owner: textCol(row, 'OwnerName'),
    currency: textCol(row, 'Currency') || 'NGN',
    amount: row.Amount == null ? 0 : toNum(row.Amount),
    dueDate: toIso(row.DueDate),
    createdAt: toIso(row.CreatedAt) || nowProcIso(),
    updatedAt: toIso(row.UpdatedAt) || nowProcIso(),
    createdBy: textCol(row, 'CreatedBy'),
    updatedBy: textCol(row, 'UpdatedBy'),
    lines,
    ...payload,
    transactionType: payload.transactionType == null ? null : String(payload.transactionType),
  };
};

export const listDomainRecords = async (domain: string) => {
  const pool = await ensureProcurementDb();
  const [headers, lines] = await Promise.all([
    pool
      .request()
      .input('Domain', sql.NVarChar(60), clean(domain, 60))
      .query(`SELECT * FROM [procurement].[DomainRecords] WHERE [Domain]=@Domain ORDER BY [UpdatedAt] DESC`),
    pool.request().query(`SELECT * FROM [procurement].[DomainLines] ORDER BY [SortOrder], [LineId]`).catch(() => ({
      recordset: [] as Record<string, unknown>[],
    })),
  ]);
  const linesByRecord = new Map<string, ReturnType<typeof mapDomainLine>[]>();
  for (const row of lines.recordset) {
    const mapped = mapDomainLine(row as Record<string, unknown>);
    const list = linesByRecord.get(mapped.recordId) || [];
    list.push(mapped);
    linesByRecord.set(mapped.recordId, list);
  }
  return headers.recordset.map((row) =>
    mapDomainRecord(row as Record<string, unknown>, linesByRecord.get(String((row as Record<string, unknown>).RecordId)) || []),
  );
};

export const upsertDomainRecord = async (domain: string, input: Record<string, unknown>, actor = 'system') => {
  const { domainById, linesTotal } = await import('@/lib/procurement/catalog');
  const spec = domainById(domain);
  if (!spec) throw new Error(`Unknown procurement domain: ${domain}`);
  const pool = await ensureProcurementDb();
  const recordId =
    clean(input.recordId || input.id, 40) ||
    (await nextSequentialId(pool, 'DomainRecords', 'RecordId', yearPrefix(spec.prefix)));
  const payload: Record<string, unknown> = { ...input };
  for (const key of [
    'id',
    'recordId',
    'domain',
    'reference',
    'title',
    'status',
    'priority',
    'project',
    'costCentre',
    'ownerName',
    'owner',
    'currency',
    'amount',
    'dueDate',
    'lines',
    'createdAt',
    'updatedAt',
    'createdBy',
    'updatedBy',
    'action',
    'payload',
  ]) {
    delete payload[key];
  }
  const lines = Array.isArray(input.lines) ? (input.lines as Record<string, unknown>[]) : [];
  const amount =
    input.amount == null || input.amount === ''
      ? lines.length
        ? linesTotal(
            lines.map((line) => ({
              description: String(line.description || ''),
              quantity: toNum(line.qty ?? line.quantity, 1),
              uom: String(line.uom || 'EA'),
              unitPrice: toNum(line.unitPrice ?? line.unitEstimate),
              taxRate: toNum(line.taxRate),
            })),
          )
        : 0
      : toNum(input.amount);

  await pool
    .request()
    .input('RecordId', sql.NVarChar(40), recordId)
    .input('Domain', sql.NVarChar(60), spec.id)
    .input('Reference', sql.NVarChar(80), clean(input.reference, 80) || recordId)
    .input('Title', sql.NVarChar(300), clean(input.title, 300) || `${spec.title} record`)
    .input('Status', sql.NVarChar(40), clean(input.status, 40) || spec.statuses?.[0] || 'Draft')
    .input('Priority', sql.NVarChar(20), cleanNullable(input.priority, 20) || 'Medium')
    .input('Project', sql.NVarChar(180), cleanNullable(input.project, 180))
    .input('CostCentre', sql.NVarChar(100), cleanNullable(input.costCentre, 100))
    .input('OwnerName', sql.NVarChar(220), cleanNullable(input.ownerName || input.owner, 220) || actor)
    .input('Currency', sql.NVarChar(10), cleanNullable(input.currency, 10) || 'NGN')
    .input('Amount', sql.Decimal(19, 2), amount)
    .input('DueDate', sql.DateTime2, toDateOnly(input.dueDate))
    .input('PayloadJson', sql.NVarChar(sql.MAX), JSON.stringify(payload))
    .input('CreatedBy', sql.NVarChar(120), clean(actor, 120))
    .input('UpdatedBy', sql.NVarChar(120), clean(actor, 120))
    .query(`
      IF EXISTS (SELECT 1 FROM [procurement].[DomainRecords] WHERE [RecordId]=@RecordId)
        UPDATE [procurement].[DomainRecords] SET
          [Title]=@Title, [Status]=@Status, [Priority]=@Priority, [Project]=@Project, [CostCentre]=@CostCentre,
          [OwnerName]=@OwnerName, [Currency]=@Currency, [Amount]=@Amount, [DueDate]=@DueDate, [PayloadJson]=@PayloadJson,
          [UpdatedAt]=SYSUTCDATETIME(), [UpdatedBy]=@UpdatedBy
        WHERE [RecordId]=@RecordId
      ELSE
        INSERT INTO [procurement].[DomainRecords] (
          [RecordId], [Domain], [Reference], [Title], [Status], [Priority], [Project], [CostCentre],
          [OwnerName], [Currency], [Amount], [DueDate], [PayloadJson], [CreatedBy], [UpdatedBy]
        ) VALUES (
          @RecordId, @Domain, @Reference, @Title, @Status, @Priority, @Project, @CostCentre,
          @OwnerName, @Currency, @Amount, @DueDate, @PayloadJson, @CreatedBy, @UpdatedBy
        )
    `);

  if (Array.isArray(input.lines)) {
    await pool.request().input('RecordId', sql.NVarChar(40), recordId).query(`
      DELETE FROM [procurement].[DomainLines] WHERE [RecordId]=@RecordId
    `);
    let sort = 0;
    for (const raw of lines) {
      await pool
        .request()
        .input('LineId', sql.NVarChar(40), clean(raw.lineId || raw.id, 40) || newId('DLN'))
        .input('RecordId', sql.NVarChar(40), recordId)
        .input('ItemCode', sql.NVarChar(80), cleanNullable(raw.itemCode, 80))
        .input('Description', sql.NVarChar(500), clean(raw.description, 500) || 'Line')
        .input('Specification', sql.NVarChar(500), cleanNullable(raw.specification, 500))
        .input('Uom', sql.NVarChar(40), cleanNullable(raw.uom, 40) || 'EA')
        .input('Qty', sql.Decimal(19, 4), toNum(raw.qty ?? raw.quantity, 1))
        .input('UnitPrice', sql.Decimal(19, 4), toNum(raw.unitPrice ?? raw.unitEstimate))
        .input('TaxRate', sql.Decimal(9, 4), toNum(raw.taxRate))
        .input('RequiredDate', sql.Date, toDateOnly(raw.requiredDate))
        .input('DeliveryLocation', sql.NVarChar(200), cleanNullable(raw.deliveryLocation, 200))
        .input('SortOrder', sql.Int, sort)
        .query(`
          INSERT INTO [procurement].[DomainLines]
            ([LineId], [RecordId], [ItemCode], [Description], [Specification], [Uom], [Qty], [UnitPrice], [TaxRate], [RequiredDate], [DeliveryLocation], [SortOrder])
          VALUES
            (@LineId, @RecordId, @ItemCode, @Description, @Specification, @Uom, @Qty, @UnitPrice, @TaxRate, @RequiredDate, @DeliveryLocation, @SortOrder)
        `);
      sort += 1;
    }
  }

  return (await listDomainRecords(domain)).find((r) => r.recordId === recordId) || null;
};

export const listApprovalsQueue = async () => {
  const [prs, rfqs, pos, contracts, cbes, domainApprovals] = await Promise.all([
    listPurchaseRequisitions(),
    listRfqs(),
    listPurchaseOrders(),
    listContracts(),
    listCbes(),
    listDomainRecords('approvals'),
  ]);
  const pending = (status: string) => {
    const s = status.toLowerCase();
    return s.includes('pending') || s.includes('submitted') || s.includes('under') || s.includes('review');
  };
  const fromPrs = prs
    .filter((r) => pending(r.status))
    .map((r) => ({
      id: r.prId,
      reference: r.prId,
      title: r.title,
      status: r.status,
      transactionType: 'PR',
      owner: r.currentWith || r.requesterName,
      amount: r.estimatedAmount || 0,
      currency: r.currency || 'NGN',
      project: r.project,
      updatedAt: r.updatedAt,
      href: '/procurement/purchase-requisitions',
    }));
  const fromRfqs = rfqs
    .filter((r) => pending(r.status) || r.status.toLowerCase() === 'draft')
    .map((r) => ({
      id: r.rfqId,
      reference: r.rfqId,
      title: r.title,
      status: r.status,
      transactionType: 'Sourcing',
      owner: r.buyerName,
      amount: 0,
      currency: 'NGN',
      project: r.prId,
      updatedAt: r.updatedAt,
      href: '/procurement/sourcing',
    }));
  const fromCbes = cbes
    .filter((r) => {
      const s = String(r.status || '').toLowerCase();
      return s.includes('recommendation') || s.includes('approval') || s.includes('pending');
    })
    .map((r) => ({
      id: r.cbeId,
      reference: r.cbeId,
      title: r.title,
      status: r.status,
      transactionType: 'Award',
      owner: r.buyerName,
      amount: 0,
      currency: r.currency || 'NGN',
      project: r.project,
      updatedAt: r.updatedAt,
      href: `/procurement/cbe/${r.cbeId}`,
    }));
  const fromPos = pos
    .filter((r) => pending(r.status))
    .map((r) => ({
      id: r.poId,
      reference: r.poId,
      title: r.title,
      status: r.status,
      transactionType: 'PO / Contract',
      owner: r.supplierName,
      amount: r.amount || 0,
      currency: r.currency || 'NGN',
      project: r.project,
      updatedAt: r.updatedAt,
      href: '/procurement/purchase-orders',
    }));
  const fromContracts = contracts
    .filter((r) => pending(r.status) || r.status.toLowerCase() === 'draft')
    .map((r) => ({
      id: r.contractId,
      reference: r.contractId,
      title: r.title,
      status: r.status,
      transactionType: 'PO / Contract',
      owner: r.supplierName,
      amount: r.value || 0,
      currency: r.currency || 'NGN',
      project: r.poId,
      updatedAt: r.updatedAt,
      href: '/procurement/contracts',
    }));
  const manual = domainApprovals.map((r) => ({
    id: r.recordId,
    reference: r.reference,
    title: r.title,
    status: r.status,
    transactionType: String(r.transactionType || 'Waiver'),
    owner: r.ownerName,
    amount: r.amount || 0,
    currency: r.currency || 'NGN',
    project: r.project,
    updatedAt: r.updatedAt,
    href: '/procurement/approvals',
  }));
  return [...fromPrs, ...fromRfqs, ...fromCbes, ...fromPos, ...fromContracts, ...manual].sort((a, b) =>
    String(b.updatedAt).localeCompare(String(a.updatedAt)),
  );
};

export const seedSampleCbeIfEmpty = async (existingPool?: sql.ConnectionPool) => {
  const pool = existingPool || (await ensureProcurementDb());
  const count = await pool.request().query(`SELECT COUNT(1) AS Cnt FROM [procurement].[CbeEvaluations]`);
  if (Number(count.recordset[0]?.Cnt || 0) > 0) return { seeded: false };

  const actor = 'John Adeyemi';
  const cbeId = 'CBE-2026-0048';
  const prId = 'PR-2026-0154';
  const rfqId = 'RFQ-2026-0087';

  const suppliers = [
    {
      supplierId: 'co-famous',
      name: 'Co-Famous Ltd',
      code: 'CFM-2507-015',
      quoteNo: 'CFM-2507-015',
      quoteDate: '18 Jul 2026',
      validUntil: '17 Aug 2026',
      paymentTerms: '100% Upfront',
      deliveryPeriod: 'Within 2–3 Weeks',
      outstanding: 600000,
      discount: 0,
      transportation: 0,
      otherCharges: 0,
    },
    {
      supplierId: 'joekels',
      name: 'Joekels Engineering',
      code: 'JEK-2507-021',
      quoteNo: 'JEK-2507-021',
      quoteDate: '18 Jul 2026',
      validUntil: '17 Aug 2026',
      paymentTerms: '70% Upfront, 30% After Delivery',
      deliveryPeriod: 'Within 3–4 Weeks',
      outstanding: 1200000,
      discount: 0,
      transportation: 402750,
      otherCharges: 0,
    },
    {
      supplierId: 'solimay',
      name: 'Solimay Limited',
      code: 'SOL-2507-009',
      quoteNo: 'SOL-2507-009',
      quoteDate: '19 Jul 2026',
      validUntil: '18 Aug 2026',
      paymentTerms: '100% Upfront',
      deliveryPeriod: 'Within 2–3 Weeks',
      outstanding: 650000,
      discount: 0,
      transportation: 0,
      otherCharges: 0,
    },
    {
      supplierId: 'devello',
      name: 'Devello',
      code: 'DEV-2507-030',
      quoteNo: 'DEV-2507-030',
      quoteDate: '20 Jul 2026',
      validUntil: '19 Aug 2026',
      paymentTerms: '100% Upfront',
      deliveryPeriod: 'Within 3 Weeks',
      outstanding: 1200000,
      discount: 25000,
      transportation: 0,
      otherCharges: 0,
    },
  ] as const;

  for (const s of suppliers) {
    await pool
      .request()
      .input('SupplierId', sql.NVarChar(40), s.supplierId)
      .input('Name', sql.NVarChar(220), s.name)
      .input('Code', sql.NVarChar(80), s.code)
      .input('Currency', sql.NVarChar(10), 'NGN')
      .input('PaymentTerms', sql.NVarChar(200), s.paymentTerms)
      .input('DeliveryPeriod', sql.NVarChar(120), s.deliveryPeriod)
      .input('DeliveryLocation', sql.NVarChar(200), 'DLE On-Store Yard')
      .input('Outstanding', sql.Decimal(19, 2), s.outstanding)
      .input('CreatedBy', sql.NVarChar(120), actor)
      .input('UpdatedBy', sql.NVarChar(120), actor)
      .query(`
        IF NOT EXISTS (SELECT 1 FROM [procurement].[Suppliers] WHERE [SupplierId]=@SupplierId)
          INSERT INTO [procurement].[Suppliers] (
            [SupplierId], [Name], [Code], [IsApproved], [Currency], [PaymentTerms], [DeliveryPeriod],
            [DeliveryLocation], [Outstanding], [CreatedBy], [UpdatedBy]
          ) VALUES (
            @SupplierId, @Name, @Code, 1, @Currency, @PaymentTerms, @DeliveryPeriod,
            @DeliveryLocation, @Outstanding, @CreatedBy, @UpdatedBy
          )
      `);
  }

  await pool
    .request()
    .input('PrId', sql.NVarChar(40), prId)
    .input('Title', sql.NVarChar(300), 'Supply of Additional Bolt & Gasket')
    .input('Department', sql.NVarChar(180), 'Mechanical Dept.')
    .input('Project', sql.NVarChar(180), 'Ajaokuta Project')
    .input('RequesterName', sql.NVarChar(220), 'Mary Samuel')
    .input('Status', sql.NVarChar(40), 'Approved')
    .input('Currency', sql.NVarChar(10), 'NGN')
    .input('EstimatedAmount', sql.Decimal(19, 2), 2000000)
    .input('CreatedBy', sql.NVarChar(120), actor)
    .input('UpdatedBy', sql.NVarChar(120), actor)
    .query(`
      IF NOT EXISTS (SELECT 1 FROM [procurement].[PurchaseRequisitions] WHERE [PrId]=@PrId)
        INSERT INTO [procurement].[PurchaseRequisitions] (
          [PrId], [Title], [Department], [Project], [RequesterName], [Status], [Currency],
          [EstimatedAmount], [CreatedBy], [UpdatedBy]
        ) VALUES (
          @PrId, @Title, @Department, @Project, @RequesterName, @Status, @Currency,
          @EstimatedAmount, @CreatedBy, @UpdatedBy
        )
    `);

  const prLines = [
    ['PRL-SEED-1', 'M66 × 475 Long Stud Bolt, Nuts & Washers (Each Set)', 'Set', 8, 85000],
    ['PRL-SEED-2', 'Gasket, M66 (Each)', 'Pcs', 10, 60000],
    ['PRL-SEED-3', '90 mm Socket', 'Pcs', 1, 600000],
  ] as const;
  for (let i = 0; i < prLines.length; i++) {
    const [lineId, description, uom, qty, unitEstimate] = prLines[i];
    await pool
      .request()
      .input('LineId', sql.NVarChar(40), lineId)
      .input('PrId', sql.NVarChar(40), prId)
      .input('Description', sql.NVarChar(500), description)
      .input('Uom', sql.NVarChar(40), uom)
      .input('Qty', sql.Decimal(19, 4), qty)
      .input('UnitEstimate', sql.Decimal(19, 2), unitEstimate)
      .input('SortOrder', sql.Int, i + 1)
      .query(`
        IF NOT EXISTS (SELECT 1 FROM [procurement].[PurchaseRequisitionLines] WHERE [LineId]=@LineId)
          INSERT INTO [procurement].[PurchaseRequisitionLines]
            ([LineId], [PrId], [Description], [Uom], [Qty], [UnitEstimate], [SortOrder])
          VALUES
            (@LineId, @PrId, @Description, @Uom, @Qty, @UnitEstimate, @SortOrder)
      `);
  }

  await pool
    .request()
    .input('RfqId', sql.NVarChar(40), rfqId)
    .input('PrId', sql.NVarChar(40), prId)
    .input('Title', sql.NVarChar(300), 'RFQ – Supply of Additional Bolt & Gasket')
    .input('Status', sql.NVarChar(40), 'Closed')
    .input('IssueDate', sql.Date, new Date('2026-08-05T00:00:00.000Z'))
    .input('SubmissionDeadline', sql.Date, new Date('2026-08-12T00:00:00.000Z'))
    .input('BuyerName', sql.NVarChar(220), actor)
    .input('CreatedBy', sql.NVarChar(120), actor)
    .input('UpdatedBy', sql.NVarChar(120), actor)
    .query(`
      IF NOT EXISTS (SELECT 1 FROM [procurement].[Rfqs] WHERE [RfqId]=@RfqId)
        INSERT INTO [procurement].[Rfqs] (
          [RfqId], [PrId], [Title], [Status], [IssueDate], [SubmissionDeadline], [BuyerName], [CreatedBy], [UpdatedBy]
        ) VALUES (
          @RfqId, @PrId, @Title, @Status, @IssueDate, @SubmissionDeadline, @BuyerName, @CreatedBy, @UpdatedBy
        )
    `);

  for (const s of suppliers) {
    await pool
      .request()
      .input('InviteId', sql.NVarChar(40), `INV-${s.supplierId}`)
      .input('RfqId', sql.NVarChar(40), rfqId)
      .input('SupplierId', sql.NVarChar(40), s.supplierId)
      .input('SupplierName', sql.NVarChar(220), s.name)
      .input('Status', sql.NVarChar(40), 'Responded')
      .query(`
        IF NOT EXISTS (SELECT 1 FROM [procurement].[RfqInvites] WHERE [InviteId]=@InviteId)
          INSERT INTO [procurement].[RfqInvites]
            ([InviteId], [RfqId], [SupplierId], [SupplierName], [Status])
          VALUES
            (@InviteId, @RfqId, @SupplierId, @SupplierName, @Status)
      `);
  }

  await pool
    .request()
    .input('CbeId', sql.NVarChar(40), cbeId)
    .input('Title', sql.NVarChar(300), 'Supply of Additional Bolt & Gasket')
    .input('RfqId', sql.NVarChar(40), rfqId)
    .input('RfqNumber', sql.NVarChar(80), rfqId)
    .input('PrId', sql.NVarChar(40), prId)
    .input('Project', sql.NVarChar(180), 'Ajaokuta Project')
    .input('Department', sql.NVarChar(180), 'Mechanical Dept.')
    .input('BuyerName', sql.NVarChar(220), actor)
    .input('Currency', sql.NVarChar(10), 'NGN')
    .input('EvaluationMethod', sql.NVarChar(120), 'Best Value (Weighted)')
    .input('Status', sql.NVarChar(60), 'Bid Comparison')
    .input('CreatedBy', sql.NVarChar(120), actor)
    .input('UpdatedBy', sql.NVarChar(120), actor)
    .query(`
      INSERT INTO [procurement].[CbeEvaluations] (
        [CbeId], [Title], [RfqId], [RfqNumber], [PrId], [Project], [Department], [BuyerName],
        [Currency], [EvaluationMethod], [Status], [BidsLocked], [CreatedBy], [UpdatedBy]
      ) VALUES (
        @CbeId, @Title, @RfqId, @RfqNumber, @PrId, @Project, @Department, @BuyerName,
        @Currency, @EvaluationMethod, @Status, 1, @CreatedBy, @UpdatedBy
      )
    `);

  let sort = 0;
  for (const s of suppliers) {
    await pool
      .request()
      .input('BidderId', sql.NVarChar(40), s.supplierId)
      .input('CbeId', sql.NVarChar(40), cbeId)
      .input('SupplierId', sql.NVarChar(40), s.supplierId)
      .input('Name', sql.NVarChar(220), s.name)
      .input('Code', sql.NVarChar(80), s.code)
      .input('QuoteNo', sql.NVarChar(80), s.quoteNo)
      .input('QuoteDate', sql.NVarChar(40), s.quoteDate)
      .input('ValidUntil', sql.NVarChar(40), s.validUntil)
      .input('Currency', sql.NVarChar(10), 'NGN')
      .input('PaymentTerms', sql.NVarChar(200), s.paymentTerms)
      .input('DeliveryPeriod', sql.NVarChar(120), s.deliveryPeriod)
      .input('DeliveryLocation', sql.NVarChar(200), 'DLE On-Store Yard')
      .input('Outstanding', sql.Decimal(19, 2), s.outstanding)
      .input('Discount', sql.Decimal(19, 2), s.discount)
      .input('Transportation', sql.Decimal(19, 2), s.transportation)
      .input('OtherCharges', sql.Decimal(19, 2), s.otherCharges)
      .input('VatRate', sql.Decimal(9, 4), 7.5)
      .input('SortOrder', sql.Int, sort++)
      .query(`
        INSERT INTO [procurement].[CbeBidders] (
          [BidderId], [CbeId], [SupplierId], [Name], [Code], [Approved], [QuoteNo], [QuoteDate], [ValidUntil],
          [Currency], [PaymentTerms], [DeliveryPeriod], [DeliveryLocation], [Outstanding], [Discount],
          [Transportation], [OtherCharges], [VatRate], [SortOrder]
        ) VALUES (
          @BidderId, @CbeId, @SupplierId, @Name, @Code, 1, @QuoteNo, @QuoteDate, @ValidUntil,
          @Currency, @PaymentTerms, @DeliveryPeriod, @DeliveryLocation, @Outstanding, @Discount,
          @Transportation, @OtherCharges, @VatRate, @SortOrder
        )
      `);
  }

  const bidItems: Array<{
    itemId: string;
    lineNo: number;
    description: string;
    uom: string;
    qty: number;
    prices: Record<string, { original: number; negotiated: number }>;
  }> = [
    {
      itemId: 'ITM-1',
      lineNo: 1,
      description: 'M66 × 475 Long Stud Bolt, Nuts & Washers (Each Set)',
      uom: 'Set',
      qty: 8,
      prices: {
        'co-famous': { original: 85000, negotiated: 75000 },
        joekels: { original: 90000, negotiated: 80000 },
        solimay: { original: 91250, negotiated: 91250 },
        devello: { original: 82000, negotiated: 72000 },
      },
    },
    {
      itemId: 'ITM-2',
      lineNo: 2,
      description: 'Gasket, M66 (Each)',
      uom: 'Pcs',
      qty: 10,
      prices: {
        'co-famous': { original: 60000, negotiated: 55000 },
        joekels: { original: 65000, negotiated: 60000 },
        solimay: { original: 73000, negotiated: 73000 },
        devello: { original: 59400, negotiated: 56000 },
      },
    },
    {
      itemId: 'ITM-3',
      lineNo: 3,
      description: '90 mm Socket',
      uom: 'Pcs',
      qty: 1,
      prices: {
        'co-famous': { original: 600000, negotiated: 580000 },
        joekels: { original: 1200000, negotiated: 1120000 },
        solimay: { original: 600000, negotiated: 600000 },
        devello: { original: 580000, negotiated: 577608 },
      },
    },
  ];

  for (const item of bidItems) {
    await pool
      .request()
      .input('ItemId', sql.NVarChar(40), item.itemId)
      .input('CbeId', sql.NVarChar(40), cbeId)
      .input('LineNo', sql.Int, item.lineNo)
      .input('Description', sql.NVarChar(500), item.description)
      .input('Uom', sql.NVarChar(40), item.uom)
      .input('Qty', sql.Decimal(19, 4), item.qty)
      .query(`
        INSERT INTO [procurement].[CbeBidItems] ([ItemId], [CbeId], [LineNo], [Description], [Uom], [Qty])
        VALUES (@ItemId, @CbeId, @LineNo, @Description, @Uom, @Qty)
      `);
    for (const [bidderId, price] of Object.entries(item.prices)) {
      await pool
        .request()
        .input('PriceId', sql.NVarChar(40), `PRC-${item.itemId}-${bidderId}`)
        .input('CbeId', sql.NVarChar(40), cbeId)
        .input('ItemId', sql.NVarChar(40), item.itemId)
        .input('BidderId', sql.NVarChar(40), bidderId)
        .input('OriginalUnit', sql.Decimal(19, 4), price.original)
        .input('NegotiatedUnit', sql.Decimal(19, 4), price.negotiated)
        .query(`
          INSERT INTO [procurement].[CbeBidPrices]
            ([PriceId], [CbeId], [ItemId], [BidderId], [OriginalUnit], [NegotiatedUnit])
          VALUES
            (@PriceId, @CbeId, @ItemId, @BidderId, @OriginalUnit, @NegotiatedUnit)
        `);
    }
  }

  const technicalCriteria = [
    {
      lineNo: 1,
      section: 'A. GENERAL REQUIREMENTS',
      requirement: 'Compliance with technical specification',
      status: { 'co-famous': 'Compliant', joekels: 'Compliant', solimay: 'Compliant', devello: 'Compliant' },
    },
    {
      lineNo: 2,
      section: 'A. GENERAL REQUIREMENTS',
      requirement: 'Material certificate (MTC)',
      status: { 'co-famous': 'Compliant', joekels: 'Compliant', solimay: 'Partial', devello: 'Compliant' },
      comments: 'Solimay certificate missing grade',
    },
    {
      lineNo: 3,
      section: 'A. GENERAL REQUIREMENTS',
      requirement: 'Manufacturing to industry standard (ASTM / ISO)',
      status: { 'co-famous': 'Compliant', joekels: 'Compliant', solimay: 'Compliant', devello: 'Compliant' },
    },
    {
      lineNo: 4,
      section: 'B. PRODUCT SPECIFICATION',
      requirement: 'M66 × 475 Long Stud Bolt, Nuts & Washers',
      status: { 'co-famous': 'Compliant', joekels: 'Compliant', solimay: 'Non-Compliant', devello: 'Compliant' },
      comments: 'Solimay length tolerance out of spec',
    },
    {
      lineNo: 5,
      section: 'B. PRODUCT SPECIFICATION',
      requirement: 'Gasket, M66',
      status: { 'co-famous': 'Partial', joekels: 'Compliant', solimay: 'Compliant', devello: 'Compliant' },
    },
    {
      lineNo: 6,
      section: 'B. PRODUCT SPECIFICATION',
      requirement: '90 mm Socket',
      status: { 'co-famous': 'Compliant', joekels: 'Partial', solimay: 'Compliant', devello: 'Compliant' },
    },
    {
      lineNo: 7,
      section: 'C. QUALITY & TESTING',
      requirement: 'Dimensional inspection report',
      status: { 'co-famous': 'Compliant', joekels: 'Compliant', solimay: 'Non-Compliant', devello: 'Compliant' },
      comments: 'Solimay report not provided',
    },
    {
      lineNo: 8,
      section: 'C. QUALITY & TESTING',
      requirement: 'Tensile test report',
      status: { 'co-famous': 'Compliant', joekels: 'Compliant', solimay: 'Partial', devello: 'Compliant' },
    },
    {
      lineNo: 9,
      section: 'C. QUALITY & TESTING',
      requirement: 'Traceability / Batch identification',
      status: { 'co-famous': 'Compliant', joekels: 'Compliant', solimay: 'Compliant', devello: 'Compliant' },
    },
    {
      lineNo: 10,
      section: 'C. QUALITY & TESTING',
      requirement: 'Packaging standard compliance',
      status: { 'co-famous': 'Compliant', joekels: 'Compliant', solimay: 'Compliant', devello: 'Partial' },
    },
  ];

  for (const c of technicalCriteria) {
    await pool
      .request()
      .input('CriteriaId', sql.NVarChar(40), `TEC-${c.lineNo}`)
      .input('CbeId', sql.NVarChar(40), cbeId)
      .input('LineNo', sql.Int, c.lineNo)
      .input('Section', sql.NVarChar(200), c.section)
      .input('Requirement', sql.NVarChar(500), c.requirement)
      .input('SupplierStatusJson', sql.NVarChar(sql.MAX), JSON.stringify(c.status))
      .input('Comments', sql.NVarChar(sql.MAX), c.comments || null)
      .query(`
        INSERT INTO [procurement].[CbeTechnicalCriteria] (
          [CriteriaId], [CbeId], [LineNo], [Section], [Requirement], [Mandatory], [SupplierStatusJson], [Comments]
        ) VALUES (
          @CriteriaId, @CbeId, @LineNo, @Section, @Requirement, 1, @SupplierStatusJson, @Comments
        )
      `);
  }

  const rounds = [
    {
      roundId: 'NEG-1',
      bidderId: 'devello',
      date: '18 Jul 2026',
      method: 'In-Person Meeting',
      originalValue: 1968398.6,
      vendorOffer: 1890000,
      agreedValue: 1890000,
      notes: 'Agreed reduction on unit prices for all line items.',
      bafo: false,
    },
    {
      roundId: 'NEG-2',
      bidderId: 'devello',
      date: '20 Jul 2026',
      method: 'BAFO (Email)',
      originalValue: 1890000,
      vendorOffer: 1841503.6,
      agreedValue: 1841503.6,
      notes: 'Final offer submitted. Maintained delivery within 3 weeks.',
      bafo: true,
    },
    {
      roundId: 'NEG-3',
      bidderId: 'co-famous',
      date: '20 Jul 2026',
      method: 'Email',
      originalValue: 2152000,
      vendorOffer: 2021000,
      agreedValue: 2021000,
      notes: 'Final negotiated offer.',
      bafo: true,
    },
    {
      roundId: 'NEG-4',
      bidderId: 'joekels',
      date: '20 Jul 2026',
      method: 'Email',
      originalValue: 2915500,
      vendorOffer: 2762750,
      agreedValue: 2762750,
      notes: 'Final negotiated offer.',
      bafo: true,
    },
  ];

  for (const r of rounds) {
    await pool
      .request()
      .input('RoundId', sql.NVarChar(40), r.roundId)
      .input('CbeId', sql.NVarChar(40), cbeId)
      .input('BidderId', sql.NVarChar(40), r.bidderId)
      .input('RoundDate', sql.NVarChar(40), r.date)
      .input('Method', sql.NVarChar(120), r.method)
      .input('NegotiatedBy', sql.NVarChar(220), actor)
      .input('OriginalValue', sql.Decimal(19, 2), r.originalValue)
      .input('VendorOffer', sql.Decimal(19, 2), r.vendorOffer)
      .input('AgreedValue', sql.Decimal(19, 2), r.agreedValue)
      .input('Notes', sql.NVarChar(sql.MAX), r.notes)
      .input('IsBafo', sql.Bit, r.bafo ? 1 : 0)
      .query(`
        INSERT INTO [procurement].[CbeNegotiationRounds] (
          [RoundId], [CbeId], [BidderId], [RoundDate], [Method], [NegotiatedBy],
          [OriginalValue], [VendorOffer], [AgreedValue], [Notes], [IsBafo]
        ) VALUES (
          @RoundId, @CbeId, @BidderId, @RoundDate, @Method, @NegotiatedBy,
          @OriginalValue, @VendorOffer, @AgreedValue, @Notes, @IsBafo
        )
      `);
  }

  const documents = [
    ['RFQ-2026-0087.pdf', 'RFQ Documents', '—', '1.0', actor, '10 Aug 2026 09:14 AM', '1.2 MB'],
    ['PR-2026-0154.pdf', 'Purchase Requisition', '—', '1.0', 'Mary Samuel', '05 Aug 2026 02:31 PM', '820 KB'],
    ['Co-Famous_Ltd_Quote.pdf', 'Supplier Quotations', 'Co-Famous Ltd', '2.0', 'Mary Samuel', '18 Aug 2026 10:21 AM', '2.4 MB'],
    ['Joekels_Engineering_Quote.pdf', 'Supplier Quotations', 'Joekels Engineering', '1.0', 'Mary Samuel', '18 Aug 2026 10:25 AM', '2.1 MB'],
    ['Solimay_Limited_Quote.pdf', 'Supplier Quotations', 'Solimay Limited', '1.0', 'Mary Samuel', '18 Aug 2026 10:26 AM', '1.8 MB'],
    ['Devello_Quote.pdf', 'Supplier Quotations', 'Devello', '2.0', 'Mary Samuel', '20 Aug 2026 09:15 AM', '2.3 MB'],
    ['Technical_Specification_v1.2.docx', 'Technical Documents', '—', '1.1', 'Emeka Okafor', '12 Aug 2026 04:18 PM', '1.6 MB'],
    ['Evaluation_Guidelines.pdf', 'Evaluation Reports', '—', '1.0', 'Mary Samuel', '15 Aug 2026 03:50 PM', '950 KB'],
  ] as const;

  let docIdx = 1;
  for (const [name, category, vendor, version, uploadedBy, uploadedOn, size] of documents) {
    await pool
      .request()
      .input('DocumentId', sql.NVarChar(40), `DOC-SEED-${docIdx++}`)
      .input('CbeId', sql.NVarChar(40), cbeId)
      .input('Name', sql.NVarChar(300), name)
      .input('Category', sql.NVarChar(120), category)
      .input('Vendor', sql.NVarChar(220), vendor)
      .input('Version', sql.NVarChar(40), version)
      .input('UploadedBy', sql.NVarChar(220), uploadedBy)
      .input('UploadedOn', sql.NVarChar(80), uploadedOn)
      .input('SizeLabel', sql.NVarChar(40), size)
      .query(`
        INSERT INTO [procurement].[CbeDocuments] (
          [DocumentId], [CbeId], [Name], [Category], [Vendor], [Version], [UploadedBy], [UploadedOn], [SizeLabel]
        ) VALUES (
          @DocumentId, @CbeId, @Name, @Category, @Vendor, @Version, @UploadedBy, @UploadedOn, @SizeLabel
        )
      `);
  }

  const auditEvents = [
    ['CBE created', 'Overview', 'CBE-2026-0048 created', actor, 'Procurement Officer'],
    ['Quotation uploaded', 'Documents', 'Joekels_Engineering_Quote.pdf', 'Mary Samuel', 'Procurement Officer'],
    ['Negotiation updated', 'Negotiation', 'Solimay counter-offer recorded', actor, 'Procurement Officer'],
    ['Bid comparison completed', 'Bid Comparison', 'Original bid values locked', actor, 'Procurement Officer'],
    ['Negotiation round completed', 'Negotiation', 'Devello BAFO accepted at ₦1,841,503.60', actor, 'Procurement Officer'],
    ['Recommendation reviewed', 'Recommendation & Approval', 'Recommended vendor confirmed: Devello', 'Mary Samuel', 'Procurement Manager'],
  ] as const;

  for (const [action, section, details, actorName, role] of auditEvents) {
    await pool
      .request()
      .input('AuditId', sql.NVarChar(40), newId('AUD'))
      .input('CbeId', sql.NVarChar(40), cbeId)
      .input('Action', sql.NVarChar(300), action)
      .input('Section', sql.NVarChar(80), section)
      .input('Details', sql.NVarChar(sql.MAX), details)
      .input('ActorName', sql.NVarChar(220), actorName)
      .input('ActorRole', sql.NVarChar(120), role)
      .query(`
        INSERT INTO [procurement].[CbeAuditLog]
          ([AuditId], [CbeId], [Action], [Section], [Details], [ActorName], [ActorRole])
        VALUES
          (@AuditId, @CbeId, @Action, @Section, @Details, @ActorName, @ActorRole)
      `);
  }

  return { seeded: true, cbeId };
};
