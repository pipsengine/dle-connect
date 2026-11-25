import sql from 'mssql';
import { getDleEnterpriseDbPool } from '@/lib/dle-enterprise-db';
import { canGalvanizingIntake, canGalvanizingProduction, canGalvanizingQc, canGalvanizingRelease, galvanizingCapabilities, type GalvanizingActor } from '@/lib/galvanizing/access';
import { GALVANIZING_MATERIALS, GALVANIZING_STAGES, NCR_DISPOSITIONS } from '@/lib/galvanizing/constants';
import { ensureGalvanizingSchemaSql } from '@/lib/galvanizing/sql-schema';
import {
  assertCloseNcr,
  assertDispatchWeight,
  assertIncomingOutcome,
  assertJobRelease,
  assertReceiptReady,
  assertStageAdvance,
  articleQuantities,
  fail,
  GalvanizingRuleError,
  nextDispatchStatus,
  receiptArrival,
  receiptReadyStatus,
  roundKg,
  tareAfterOffload,
  WAYBILL_EXCEPTION_REASONS,
} from '@/lib/galvanizing/rules';
import { ADDITIONAL_WORK, JOB_TYPES, PACKAGING, SIGN_OFFS, type GalvanizingRelease, type ReleaseSignRole } from '@/lib/galvanizing/release-meta';
import type {
  GalvanizingArticle,
  GalvanizingAudit,
  GalvanizingBatch,
  GalvanizingDispatch,
  GalvanizingInspection,
  GalvanizingJob,
  GalvanizingMaterial,
  GalvanizingMovement,
  GalvanizingNcr,
  GalvanizingReceipt,
  GalvanizingSnapshot,
  GalvanizingStock,
} from '@/lib/galvanizing/types';

const ready = { value: false };
const text = (value: unknown, max = 400) => String(value ?? '').trim().slice(0, max);
const num = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const iso = (value: unknown) => {
  if (!value) return '';
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
};
const year = () => new Date().getFullYear();

const sqlErrorNumber = (error: unknown) => {
  if (!error || typeof error !== 'object') return 0;
  const value = (error as { number?: unknown }).number;
  return typeof value === 'number' ? value : 0;
};

export const ensureGalvanizingDb = async () => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new GalvanizingRuleError(503, 'DLE Enterprise database is not configured. Galvanizing Operations cannot start.');
  if (!ready.value) {
    try {
      await pool.request().query(ensureGalvanizingSchemaSql);
    } catch (error) {
      if (sqlErrorNumber(error) !== 2714) throw error;
      await pool.request().query(ensureGalvanizingSchemaSql);
    }
    ready.value = true;
  }
  return pool;
};

type SqlInput = [string, sql.ISqlTypeFactoryWithNoParams | sql.ISqlTypeWithLength | sql.ISqlTypeWithPrecisionScale | sql.ISqlType, unknown];

const run = async (tx: sql.Transaction | sql.ConnectionPool, query: string, inputs: SqlInput[] = []) => {
  const request = new sql.Request(tx as sql.ConnectionPool);
  for (const [name, type, value] of inputs) request.input(name, type as never, value as never);
  return request.query(query);
};

const withTx = async (actor: GalvanizingActor, fn: (tx: sql.Transaction) => Promise<string>) => {
  const pool = await ensureGalvanizingDb();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const notice = await fn(tx);
    await tx.commit();
    return { notice, data: await galvanizingSnapshot(actor) };
  } catch (error) {
    await tx.rollback().catch(() => undefined);
    if (error instanceof GalvanizingRuleError) throw error;
    if (sqlErrorNumber(error) === 2627 || sqlErrorNumber(error) === 2601) {
      throw new GalvanizingRuleError(409, 'A record with that reference already exists.');
    }
    throw error;
  }
};

const audit = async (tx: sql.Transaction, entity: string, entityId: number, action: string, actor: string, detail = '') => {
  await run(tx, `
    INSERT INTO [galvanizing].[Audit] ([Entity], [EntityId], [ActionName], [Actor], [Detail])
    VALUES (@entity, @entityId, @action, @actor, @detail)
  `, [
    ['entity', sql.NVarChar(40), entity],
    ['entityId', sql.Int, entityId],
    ['action', sql.NVarChar(40), action],
    ['actor', sql.NVarChar(120), actor],
    ['detail', sql.NVarChar(500), detail],
  ]);
};

function one<T>(tx: sql.Transaction, query: string, inputs: SqlInput[], missing: string): Promise<T>;
function one<T>(tx: sql.Transaction, query: string, inputs: SqlInput[]): Promise<T | null>;
async function one<T>(tx: sql.Transaction, query: string, inputs: SqlInput[], missing?: string): Promise<T | null> {
  const result = await run(tx, query, inputs);
  const row = (result.recordset[0] as T | undefined) ?? null;
  if (row == null) {
    if (missing) throw new GalvanizingRuleError(404, missing);
    return null;
  }
  return row;
}

const mapJob = (row: Record<string, unknown>): GalvanizingJob => ({
  id: Number(row.Id),
  number: text(row.Number, 40),
  ownership: text(row.Ownership, 12),
  customerProject: text(row.CustomerProject, 160),
  customerCode: text(row.CustomerCode, 80),
  projectCode: text(row.ProjectCode, 80),
  reference: text(row.ReferenceNo, 100),
  status: text(row.Status, 32),
  dueDate: text(row.DueDate, 20),
  title: text(row.Title, 220),
  priority: text(row.Priority, 16),
  estimatedTonnes: num(row.EstimatedTonnes),
  coatingStandard: text(row.CoatingStandard, 80),
  createdAt: iso(row.CreatedAt),
});

const optionalNum = (value: unknown) => {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const signValue = (name: unknown, designation: unknown, date: unknown) => {
  const signedName = text(name, 120);
  if (!signedName) return null;
  return { name: signedName, designation: text(designation, 120), date: text(date, 20) };
};

const mapRelease = (row: Record<string, unknown>): GalvanizingRelease => ({
  id: Number(row.Id),
  releaseOrderNo: text(row.ReleaseOrderNo, 40),
  formNo: text(row.FormNo, 40),
  dated: text(row.Dated, 20),
  batch: text(row.Batch, 40),
  jobType: text(row.JobType, 40),
  jobTypeOther: text(row.JobTypeOther, 120),
  clientName: text(row.ClientName, 200),
  clientPoNo: text(row.ClientPoNo, 80),
  scheduledDelivery: text(row.ScheduledDelivery, 20),
  pfiNo: text(row.PfiNo, 80),
  pfiDate: text(row.PfiDate, 20),
  materialReceiptDate: text(row.MaterialReceiptDate, 20),
  blackWeight: optionalNum(row.BlackWeight),
  weighbridgeTicketNo: text(row.WeighbridgeTicketNo, 80),
  additionalWork: text(row.AdditionalWork, 400).split(',').filter(Boolean),
  additionalWorkOther: text(row.AdditionalWorkOther, 200),
  itemsList: text(row.ItemsList, 4000),
  packaging: text(row.Packaging, 400).split(',').filter(Boolean),
  packagingOther: text(row.PackagingOther, 200),
  remarks: text(row.Remarks, 2000),
  variationReason: text(row.VariationReason, 2000),
  jobNo: text(row.JobNo, 80),
  jobDate: text(row.JobDate, 20),
  qcReportNo: text(row.QcReportNo, 80),
  qcReportDate: text(row.QcReportDate, 20),
  hdgRate: text(row.HdgRate, 80),
  otherCharges: text(row.OtherCharges, 200),
  dispatchDate: text(row.DispatchDate, 20),
  ticketNo: text(row.TicketNo, 80),
  galvanizedWeight: optionalNum(row.GalvanizedWeight),
  waybillNo: text(row.WaybillNo, 80),
  waybillDate: text(row.WaybillDate, 20),
  paymentReceiptNo: text(row.PaymentReceiptNo, 80),
  paymentReceiptDate: text(row.PaymentReceiptDate, 20),
  jobId: Number(row.JobId || 0),
  receiptId: Number(row.ReceiptId || 0),
  materialRegisterId: Number(row.MaterialRegisterId || 0),
  signOffs: {
    issued: signValue(row.IssuedName, row.IssuedDesignation, row.IssuedDate),
    received: signValue(row.ReceivedName, row.ReceivedDesignation, row.ReceivedDate),
    reviewed: signValue(row.ReviewedName, row.ReviewedDesignation, row.ReviewedDate),
    approved: signValue(row.ApprovedName, row.ApprovedDesignation, row.ApprovedDate),
  },
  createdAt: iso(row.CreatedAt),
  updatedAt: iso(row.UpdatedAt),
});

const memoFrom = (row: Record<string, unknown>) => ({
  deliveryNote: text(row.DeliveryNote, 120),
  date: text(row.MemoDate, 20),
  ticketNumber: text(row.TicketNumber, 80),
  vehicle: text(row.MemoVehicle, 80),
  deliveryNumber: text(row.DeliveryNumber, 80),
  clientName: text(row.MemoClientName, 200),
  orderNumber: text(row.OrderNumber, 80),
  tripNo: text(row.TripNo, 80),
  destination: text(row.Destination, 200),
  product: text(row.Product, 2000),
  driverName: text(row.DriverName, 120),
  clientSignatoryName: text(row.ClientSignatoryName, 120),
});

const mapMaterial = (row: Record<string, unknown>): GalvanizingMaterial => {
  const noWaybill = text(row.NoWaybill, 3) === 'YES';
  return {
    id: Number(row.Id),
    dateReceived: text(row.DateReceived, 20),
    clientName: text(row.ClientName, 200),
    items: text(row.Items, 500),
    jobNo: text(row.JobNo, 80),
    weighMethod: text(row.WeighMethod, 20) === 'direct' ? 'direct' : 'weighbridge',
    vehicleNo: text(row.VehicleNo, 50),
    grossWeight: optionalNum(row.GrossWeight),
    emptyWeight: optionalNum(row.EmptyWeight),
    directNetWeight: optionalNum(row.DirectNetWeight),
    noWaybill,
    noWaybillMemo: noWaybill ? memoFrom(row) : null,
    createdAt: iso(row.CreatedAt),
    updatedAt: iso(row.UpdatedAt),
  };
};

export const galvanizingSnapshot = async (actor: GalvanizingActor): Promise<GalvanizingSnapshot> => {
  const pool = await ensureGalvanizingDb();
  const [jobsRs, receiptsRs, articlesRs, batchesRs, inspectionsRs, ncrsRs, movesRs, dispatchRs, auditRs, releaseRs, materialRs] = await Promise.all([
    pool.request().query(`SELECT TOP 500 * FROM [galvanizing].[Jobs] ORDER BY [Id] DESC`),
    pool.request().query(`
      SELECT TOP 500 r.*, j.[Number] AS JobNumber, j.[CustomerProject], j.[Ownership]
      FROM [galvanizing].[Receipts] r
      LEFT JOIN [galvanizing].[Jobs] j ON j.[Id] = r.[JobId]
      ORDER BY r.[Id] DESC`),
    pool.request().query(`
      SELECT TOP 500 a.*, r.[JobId]
      FROM [galvanizing].[Articles] a
      INNER JOIN [galvanizing].[Receipts] r ON r.[Id] = a.[ReceiptId]
      ORDER BY a.[Id] DESC`),
    pool.request().query(`
      SELECT TOP 500 b.*, j.[Number] AS JobNumber, j.[CustomerProject], j.[Ownership]
      FROM [galvanizing].[Batches] b
      INNER JOIN [galvanizing].[Jobs] j ON j.[Id] = b.[JobId]
      ORDER BY b.[Id] DESC`),
    pool.request().query(`
      SELECT TOP 500 i.*, b.[Number] AS BatchNumber, j.[Number] AS JobNumber
      FROM [galvanizing].[Inspections] i
      INNER JOIN [galvanizing].[Batches] b ON b.[Id] = i.[BatchId]
      INNER JOIN [galvanizing].[Jobs] j ON j.[Id] = b.[JobId]
      ORDER BY i.[Id] DESC`),
    pool.request().query(`
      SELECT TOP 500 n.*, b.[Number] AS BatchNumber, j.[Number] AS JobNumber, j.[Ownership]
      FROM [galvanizing].[Ncr] n
      INNER JOIN [galvanizing].[Batches] b ON b.[Id] = n.[BatchId]
      INNER JOIN [galvanizing].[Jobs] j ON j.[Id] = b.[JobId]
      ORDER BY n.[Id] DESC`),
    pool.request().query(`SELECT TOP 500 * FROM [galvanizing].[InventoryMovements] ORDER BY [Id] DESC`),
    pool.request().query(`
      SELECT TOP 500 d.*, j.[Number] AS JobNumber, j.[CustomerProject], b.[Number] AS BatchNumber
      FROM [galvanizing].[Dispatches] d
      INNER JOIN [galvanizing].[Jobs] j ON j.[Id] = d.[JobId]
      INNER JOIN [galvanizing].[Batches] b ON b.[Id] = d.[BatchId]
      ORDER BY d.[Id] DESC`),
    pool.request().query(`SELECT TOP 200 * FROM [galvanizing].[Audit] ORDER BY [Id] DESC`),
    pool.request().query(`SELECT TOP 500 * FROM [galvanizing].[JobReleases] ORDER BY [Id] DESC`),
    pool.request().query(`SELECT TOP 500 * FROM [galvanizing].[MaterialRegister] ORDER BY [Id] DESC`),
  ]);

  const jobs = (jobsRs.recordset as Record<string, unknown>[]).map(mapJob);
  const receipts: GalvanizingReceipt[] = (receiptsRs.recordset as Record<string, unknown>[]).map((row) => ({
    id: Number(row.Id),
    number: text(row.Number, 40),
    jobId: Number(row.JobId || 0),
    jobNumber: text(row.JobNumber, 40),
    customerProject: text(row.CustomerProject, 160),
    ownership: text(row.Ownership, 12),
    document: text(row.DocumentNo, 100),
    vehicle: text(row.Vehicle, 50),
    driverName: text(row.DriverName, 120),
    sourceType: text(row.SourceType, 24),
    missingWaybill: text(row.MissingWaybill, 8),
    exceptionMemo: text(row.ExceptionMemo, 500),
    exceptionReason: text(row.ExceptionReason, 40),
    exceptionApprovedBy: text(row.ExceptionApprovedBy, 120),
    exceptionApprovedAt: text(row.ExceptionApprovedAt, 40),
    gateInAt: text(row.GateInAt, 40),
    grossKg: num(row.GrossKg),
    tareKg: text(row.TareRecorded, 3) === 'YES' ? num(row.TareKg) : 0,
    tareRecorded: text(row.TareRecorded, 3) === 'YES' ? 'YES' : 'NO',
    netKg: text(row.TareRecorded, 3) === 'YES' ? num(row.NetKg) : 0,
    articleCount: Number(row.ArticleCount || 0),
    status: text(row.Status, 32),
    location: text(row.LocationName, 80),
    qcInspector: text(row.QcInspector, 120),
    qcSupervisor: text(row.QcSupervisor, 120),
    qcDisposition: text(row.QcDisposition, 20),
    qcSeverity: text(row.QcSeverity, 16),
  }));
  const articles: GalvanizingArticle[] = (articlesRs.recordset as Record<string, unknown>[]).map((row) => ({
    id: Number(row.Id),
    receiptId: Number(row.ReceiptId),
    jobId: Number(row.JobId),
    tag: text(row.Tag, 80),
    description: text(row.Description, 180),
    quantity: Number(row.Quantity || 0),
    acceptedQty: row.AcceptedQty == null ? null : Number(row.AcceptedQty),
    rejectedQty: row.RejectedQty == null ? null : Number(row.RejectedQty),
    holeCount: row.HoleCount == null ? null : Number(row.HoleCount),
    doubleDip: text(row.DoubleDip, 3),
    doubleDipCount: row.DoubleDipCount == null ? null : Number(row.DoubleDipCount),
    steelThicknessMm: row.SteelThicknessMm == null ? null : num(row.SteelThicknessMm),
    coatingThicknessUm: row.CoatingThicknessUm == null ? null : num(row.CoatingThicknessUm),
    weightKg: num(row.WeightKg),
    ownership: text(row.Ownership, 12),
    status: text(row.Status, 24),
    location: text(row.LocationName, 80),
  }));
  const batches: GalvanizingBatch[] = (batchesRs.recordset as Record<string, unknown>[]).map((row) => {
    const stage = text(row.Stage, 30);
    const index = GALVANIZING_STAGES.indexOf(stage as (typeof GALVANIZING_STAGES)[number]);
    return {
      id: Number(row.Id),
      number: text(row.Number, 40),
      jobId: Number(row.JobId),
      jobNumber: text(row.JobNumber, 40),
      customerProject: text(row.CustomerProject, 160),
      ownership: text(row.Ownership, 12),
      weightKg: num(row.WeightKg),
      stage,
      status: text(row.Status, 24),
      kettle: text(row.Kettle, 40),
      shift: text(row.ShiftName, 16),
      supervisor: text(row.Supervisor, 100),
      articleCount: Number(row.ArticleCount || 0),
      progress: index < 0 ? 0 : Math.round((index / (GALVANIZING_STAGES.length - 1)) * 100),
    };
  });
  const inspections: GalvanizingInspection[] = (inspectionsRs.recordset as Record<string, unknown>[]).map((row) => ({
    id: Number(row.Id),
    number: `QC-${String(row.Id).padStart(4, '0')}`,
    batchId: Number(row.BatchId),
    batchNumber: text(row.BatchNumber, 40),
    jobNumber: text(row.JobNumber, 40),
    kind: text(row.Kind, 20),
    outcome: text(row.Outcome, 20),
    thicknessUm: row.ThicknessUm == null ? null : num(row.ThicknessUm),
    steelThicknessMm: row.SteelThicknessMm == null ? null : num(row.SteelThicknessMm),
    standard: text(row.StandardName, 40),
    inspector: text(row.Inspector, 100),
    remarks: text(row.Remarks, 500),
    at: iso(row.At),
  }));
  const ncrs: GalvanizingNcr[] = (ncrsRs.recordset as Record<string, unknown>[]).map((row) => ({
    id: Number(row.Id),
    number: `NCR-${String(row.Id).padStart(4, '0')}`,
    batchId: Number(row.BatchId),
    batchNumber: text(row.BatchNumber, 40),
    jobNumber: text(row.JobNumber, 40),
    ownership: text(row.Ownership, 12),
    defect: text(row.Defect, 500),
    severity: text(row.Severity, 16),
    disposition: text(row.Disposition, 20),
    status: text(row.Status, 20),
    approver: text(row.Approver, 100),
    createdAt: iso(row.CreatedAt),
  }));
  const movements: GalvanizingMovement[] = (movesRs.recordset as Record<string, unknown>[]).map((row) => ({
    id: Number(row.Id),
    material: text(row.Material, 50),
    kind: text(row.Kind, 20),
    quantity: num(row.Quantity),
    reference: text(row.ReferenceNo, 100),
    unitCost: num(row.UnitCost),
    actor: text(row.Actor, 100),
    at: iso(row.At),
  }));
  const totals = new Map<string, number>();
  for (const movement of [...movements].reverse()) {
    const sign = movement.kind === 'RECEIPT' || movement.kind === 'ADJUSTMENT_IN' ? 1 : movement.kind === 'CONSUMPTION' || movement.kind === 'ADJUSTMENT_OUT' ? -1 : 0;
    totals.set(movement.material, roundKg((totals.get(movement.material) || 0) + sign * movement.quantity));
  }
  const inventory: GalvanizingStock[] = GALVANIZING_MATERIALS.map((item) => {
    const stock = totals.get(item.material) || 0;
    return { ...item, stock, status: stock <= item.reorder ? 'LOW' : 'AVAILABLE' };
  });
  const dispatches: GalvanizingDispatch[] = (dispatchRs.recordset as Record<string, unknown>[]).map((row) => ({
    id: Number(row.Id),
    number: text(row.Number, 40),
    jobId: Number(row.JobId),
    batchId: Number(row.BatchId),
    jobNumber: text(row.JobNumber, 40),
    batchNumber: text(row.BatchNumber, 40),
    customerProject: text(row.CustomerProject, 160),
    weightKg: num(row.WeightKg),
    waybill: text(row.Waybill, 100),
    vehicle: text(row.Vehicle, 50),
    destination: text(row.Destination, 160),
    status: text(row.Status, 24),
    commercialCleared: text(row.CommercialCleared, 8),
    gateVerified: text(row.GateVerified, 8),
    weightOk: text(row.WeightOk, 8),
    podRef: text(row.PodRef, 120),
    weighbridgeRef: text(row.WeighbridgeRef, 120),
  }));
  const auditRows: GalvanizingAudit[] = (auditRs.recordset as Record<string, unknown>[]).map((row) => ({
    id: Number(row.Id),
    entity: text(row.Entity, 40),
    entityId: Number(row.EntityId),
    action: text(row.ActionName, 40),
    actor: text(row.Actor, 120),
    detail: text(row.Detail, 500),
    at: iso(row.At),
  }));
  const materialCost = movements.reduce((sum, movement) => (
    movement.kind === 'CONSUMPTION' ? sum + movement.quantity * movement.unitCost : sum
  ), 0);
  const wipKg = batches.filter((batch) => batch.status === 'IN_PROGRESS' || batch.status === 'HOLD').reduce((sum, batch) => sum + batch.weightKg, 0);
  const completedKg = batches.filter((batch) => batch.status === 'COMPLETED').reduce((sum, batch) => sum + batch.weightKg, 0);
  return {
    jobs,
    receipts,
    articles,
    batches,
    inspections,
    ncrs,
    inventory,
    movements,
    dispatches,
    releases: (releaseRs.recordset as Record<string, unknown>[]).map(mapRelease),
    materials: (materialRs.recordset as Record<string, unknown>[]).map(mapMaterial),
    audit: auditRows,
    dashboard: {
      jobs: jobs.length,
      activeBatches: batches.filter((batch) => !['COMPLETED', 'REJECTED'].includes(batch.status)).length,
      wipTonnes: roundKg(wipKg / 1000),
      completedTonnes: roundKg(completedKg / 1000),
      pendingRelease: jobs.filter((job) => job.status === 'REGISTERED').length,
      openNcr: ncrs.filter((item) => item.status === 'OPEN').length,
      gateHolds: receipts.filter((receipt) => receipt.status === 'GATE_HOLD').length,
      materialCost: Math.round(materialCost * 100) / 100,
    },
    capabilities: galvanizingCapabilities(actor),
  };
};

const linkReceiptToJob = async (tx: sql.Transaction, receiptId: number, jobId: number, ownership: string) => {
  const receipt = await one<Record<string, unknown>>(tx, `SELECT * FROM [galvanizing].[Receipts] WHERE [Id] = @id`, [['id', sql.Int, receiptId]], 'Receipt not found.');
  if (Number(receipt.JobId || 0) > 0) fail(409, 'This receipt is already linked to a job.');
  const ready = receiptReadyStatus({
    missingWaybill: text(receipt.MissingWaybill, 8) === 'YES',
    exceptionApproved: text(receipt.ExceptionApprovedBy, 120).length > 0,
    tareRecorded: text(receipt.TareRecorded, 3) === 'YES',
  });
  if (ready !== 'RECEIVED') fail(409, 'Accept the vehicle before opening a job. Complete the tare weigh and any missing-waybill approval first.');
  await run(tx, `UPDATE [galvanizing].[Receipts] SET [JobId] = @jobId, [SourceType] = @source, [Status] = N'RECEIVED' WHERE [Id] = @id`, [
    ['jobId', sql.Int, jobId],
    ['source', sql.NVarChar(24), ownership === 'INTERNAL' ? 'INTERNAL_TRANSFER' : 'CUSTOMER_WAYBILL'],
    ['id', sql.Int, receiptId],
  ]);
  await run(tx, `UPDATE [galvanizing].[Articles] SET [Ownership] = @ownership WHERE [ReceiptId] = @id`, [
    ['ownership', sql.NVarChar(12), ownership],
    ['id', sql.Int, receiptId],
  ]);
};

export const createGalvanizingJob = async (actor: GalvanizingActor, input: Record<string, unknown>) => withTx(actor, async (tx) => {
  const ownership = text(input.ownership, 12).toUpperCase();
  const customerProject = text(input.customerProject, 160);
  const title = text(input.title, 220);
  const reference = text(input.reference, 100);
  const projectCode = text(input.projectCode, 80);
  if (!['EXTERNAL', 'INTERNAL'].includes(ownership)) fail(422, 'Ownership must be external customer or internal DLE.');
  if (ownership === 'EXTERNAL' && customerProject.length < 2) fail(422, 'Customer is required.');
  if (ownership === 'INTERNAL' && customerProject.length < 2) fail(422, 'Department is required.');
  if (ownership === 'INTERNAL' && projectCode.length < 2) fail(422, 'Project is required for an internal transfer.');
  if (ownership === 'INTERNAL' && reference.length < 2) fail(422, 'Transfer reference is required for an internal transfer.');
  if (!title) fail(422, 'Job title is required.');
  const pending = `PEND-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const inserted = await run(tx, `
    INSERT INTO [galvanizing].[Jobs]
      ([Number], [Ownership], [CustomerProject], [CustomerCode], [ProjectCode], [ReferenceNo], [Status], [DueDate], [Title], [Priority], [EstimatedTonnes], [CoatingStandard])
    OUTPUT INSERTED.[Id]
    VALUES (@pending, @ownership, @customerProject, @customerCode, @projectCode, @reference, N'REGISTERED', @dueDate, @title, @priority, @tonnes, @standard)
  `, [
    ['pending', sql.NVarChar(40), pending],
    ['ownership', sql.NVarChar(12), ownership],
    ['customerProject', sql.NVarChar(160), customerProject],
    ['customerCode', sql.NVarChar(80), ownership === 'INTERNAL' ? '' : text(input.customerCode, 80)],
    ['projectCode', sql.NVarChar(80), projectCode],
    ['reference', sql.NVarChar(100), reference],
    ['dueDate', sql.NVarChar(20), text(input.dueDate, 20)],
    ['title', sql.NVarChar(220), title],
    ['priority', sql.NVarChar(16), text(input.priority, 16).toUpperCase() || 'NORMAL'],
    ['tonnes', sql.Float, num(input.estimatedTonnes)],
    ['standard', sql.NVarChar(80), text(input.coatingStandard, 80) || 'ISO 1461'],
  ]);
  const id = Number(inserted.recordset[0].Id);
  const number = `GAL-${ownership.slice(0, 3)}-${year()}-${String(id).padStart(5, '0')}`;
  await run(tx, `UPDATE [galvanizing].[Jobs] SET [Number] = @number WHERE [Id] = @id`, [
    ['number', sql.NVarChar(40), number],
    ['id', sql.Int, id],
  ]);
  const receiptId = num(input.receiptId);
  if (receiptId > 0) await linkReceiptToJob(tx, receiptId, id, ownership);
  await audit(tx, 'job', id, 'CREATE', actor.name, number);
  return receiptId > 0 ? `${number} opened from the gate receipt.` : `${number} registered.`;
});

export const createGalvanizingReceipt = async (actor: GalvanizingActor, input: Record<string, unknown>) => withTx(actor, async (tx) => {
  const document = text(input.document, 100);
  const missing = text(input.missingWaybill, 8).toUpperCase() === 'YES' || !document;
  const arrival = receiptArrival({
    grossKg: num(input.grossKg),
    missingWaybill: missing,
    vehicle: text(input.vehicle, 50),
    gateInAt: text(input.gateInAt, 40),
  });
  const lines = Array.isArray(input.articles) ? input.articles.map((line) => line as Record<string, unknown>).filter((item) => text(item.description, 180)) : [];
  if (!lines.length) fail(422, 'Record at least one article on the vehicle.');
  const pending = `PEND-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const inserted = await run(tx, `
    INSERT INTO [galvanizing].[Receipts]
      ([Number], [JobId], [DocumentNo], [Vehicle], [DriverName], [SourceType], [MissingWaybill], [ExceptionMemo], [GateInAt], [GrossKg], [TareKg], [TareRecorded], [NetKg], [ArticleCount], [Status], [LocationName])
    OUTPUT INSERTED.[Id]
    VALUES (@pending, NULL, @document, @vehicle, @driver, N'UNASSIGNED', @missing, N'', @gateIn, @gross, 0, N'NO', 0, 0, @status, N'Receiving Yard')
  `, [
    ['pending', sql.NVarChar(40), pending],
    ['document', sql.NVarChar(100), missing ? '' : document],
    ['vehicle', sql.NVarChar(50), text(input.vehicle, 50)],
    ['driver', sql.NVarChar(120), text(input.driverName, 120)],
    ['missing', sql.NVarChar(8), missing ? 'YES' : 'NO'],
    ['gateIn', sql.NVarChar(40), text(input.gateInAt, 40)],
    ['gross', sql.Float, num(input.grossKg)],
    ['status', sql.NVarChar(32), arrival.status],
  ]);
  const id = Number(inserted.recordset[0].Id);
  const number = `MR-${year()}-${String(id).padStart(4, '0')}`;
  let count = 0;
  for (const item of lines) {
    const description = text(item.description, 180);
    const quantity = Math.round(num(item.quantity));
    const weight = num(item.weightKg);
    if (quantity < 1) fail(422, 'Each article needs a declared quantity.');
    if (!(weight > 0)) fail(422, 'Each article needs a declared weight.');
    count += 1;
    const tag = text(item.tag, 80) || `${number}-A${String(count).padStart(2, '0')}`;
    await run(tx, `
      INSERT INTO [galvanizing].[Articles] ([ReceiptId], [Tag], [Description], [Quantity], [WeightKg], [Ownership], [Status], [LocationName])
      VALUES (@receiptId, @tag, @description, @quantity, @weight, N'', N'RECEIVED', N'Receiving Yard')
    `, [
      ['receiptId', sql.Int, id],
      ['tag', sql.NVarChar(80), tag],
      ['description', sql.NVarChar(180), description],
      ['quantity', sql.Int, quantity],
      ['weight', sql.Float, weight],
    ]);
  }
  await run(tx, `UPDATE [galvanizing].[Receipts] SET [Number] = @number, [ArticleCount] = @count WHERE [Id] = @id`, [
    ['number', sql.NVarChar(40), number],
    ['count', sql.Int, count],
    ['id', sql.Int, id],
  ]);
  await audit(tx, 'receipt', id, arrival.status === 'GATE_HOLD' ? 'RECEIVE_HOLD' : 'RECEIVE', actor.name, number);
  return arrival.status === 'GATE_HOLD'
    ? `${number} is on gate hold. An approver must complete the missing-waybill form, and tare is taken after offloading.`
    : `${number} is at the gate. Tare is taken after offloading, then the job can be opened.`;
});

export const recordGalvanizingTare = async (actor: GalvanizingActor, input: Record<string, unknown>) => withTx(actor, async (tx) => {
  const row = await one<Record<string, unknown>>(tx, `SELECT * FROM [galvanizing].[Receipts] WHERE [Id] = @id`, [['id', sql.Int, num(input.receiptId)]], 'Receipt not found.');
  if (text(row.TareRecorded, 3) === 'YES') fail(409, 'Tare has already been recorded for this vehicle.');
  if (['QC_PASSED', 'QC_PENDING_APPROVAL'].includes(text(row.Status))) fail(409, 'This receipt is already in inspection.');
  const weighed = tareAfterOffload(num(row.GrossKg), num(input.tareKg));
  const status = receiptReadyStatus({
    missingWaybill: text(row.MissingWaybill, 8) === 'YES',
    exceptionApproved: text(row.ExceptionApprovedBy, 120).length > 0,
    tareRecorded: true,
  });
  await run(tx, `
    UPDATE [galvanizing].[Receipts]
    SET [TareKg] = @tare, [NetKg] = @net, [TareRecorded] = N'YES', [Status] = @status
    WHERE [Id] = @id
  `, [
    ['tare', sql.Float, num(input.tareKg)],
    ['net', sql.Float, weighed.netKg],
    ['status', sql.NVarChar(32), status],
    ['id', sql.Int, Number(row.Id)],
  ]);
  await audit(tx, 'receipt', Number(row.Id), 'TARE', actor.name, `${weighed.netKg} kg net`);
  return `Tare recorded. Net weight is ${weighed.netKg} kg.`;
});

export const approveGalvanizingWaybill = async (actor: GalvanizingActor, input: Record<string, unknown>) => withTx(actor, async (tx) => {
  const row = await one<Record<string, unknown>>(tx, `SELECT * FROM [galvanizing].[Receipts] WHERE [Id] = @id`, [['id', sql.Int, num(input.receiptId)]], 'Receipt not found.');
  if (text(row.MissingWaybill, 8) !== 'YES') fail(409, 'This receipt has a waybill.');
  if (text(row.ExceptionApprovedBy, 120)) fail(409, 'This missing-waybill exception is already approved.');
  const reason = text(input.reason, 40).toUpperCase();
  const narrative = text(input.narrative, 1000);
  if (!WAYBILL_EXCEPTION_REASONS.includes(reason as (typeof WAYBILL_EXCEPTION_REASONS)[number])) {
    fail(422, 'Choose why the waybill is missing.');
  }
  if (narrative.length < 5) fail(422, 'Describe the missing-waybill exception.');
  const status = receiptReadyStatus({
    missingWaybill: true,
    exceptionApproved: true,
    tareRecorded: text(row.TareRecorded, 3) === 'YES',
  });
  await run(tx, `
    UPDATE [galvanizing].[Receipts]
    SET [ExceptionReason] = @reason, [ExceptionMemo] = @narrative, [ExceptionApprovedBy] = @actor, [ExceptionApprovedAt] = @at, [Status] = @status
    WHERE [Id] = @id
  `, [
    ['reason', sql.NVarChar(40), reason],
    ['narrative', sql.NVarChar(sql.MAX), narrative],
    ['actor', sql.NVarChar(120), actor.name],
    ['at', sql.NVarChar(40), new Date().toISOString()],
    ['status', sql.NVarChar(32), status],
    ['id', sql.Int, Number(row.Id)],
  ]);
  await audit(tx, 'receipt', Number(row.Id), 'WAYBILL_APPROVED', actor.name, reason);
  return `Missing waybill approved by ${actor.name}.`;
});

export const linkGalvanizingReceipt = async (actor: GalvanizingActor, input: Record<string, unknown>) => withTx(actor, async (tx) => {
  const job = await one<Record<string, unknown>>(tx, `SELECT * FROM [galvanizing].[Jobs] WHERE [Id] = @id`, [['id', sql.Int, num(input.jobId)]], 'Job not found.');
  if (text(job.Status) === 'REJECTED') fail(409, 'A returned job cannot take another receipt.');
  await linkReceiptToJob(tx, num(input.receiptId), Number(job.Id), text(job.Ownership, 12));
  await audit(tx, 'receipt', num(input.receiptId), 'LINK_JOB', actor.name, text(job.Number, 40));
  return `${text(job.Number, 40)} linked to this receipt.`;
});

const articleLine = (value: Record<string, unknown>) => {
  const doubleDip = text(value.doubleDip, 3).toUpperCase();
  const holeCount = Math.round(num(value.holeCount));
  const dipCount = Math.round(num(value.doubleDipCount));
  const steel = num(value.steelThicknessMm);
  const coating = text(value.coatingThicknessUm, 20) ? num(value.coatingThicknessUm) : null;
  if (!['YES', 'NO'].includes(doubleDip)) fail(422, 'Record whether the article is double dipped.');
  if (doubleDip === 'YES' && dipCount < 2) fail(422, 'A double dip needs a count of at least 2.');
  if (doubleDip === 'NO' && dipCount > 1) fail(422, 'A single dip cannot have a double-dip count above 1.');
  if (holeCount < 0) fail(422, 'Hole count cannot be negative.');
  if (!(steel > 0)) fail(422, 'Steel thickness in millimetres is required.');
  return {
    id: num(value.id),
    accepted: Math.round(num(value.acceptedQty)),
    rejected: Math.round(num(value.rejectedQty)),
    holeCount,
    doubleDip,
    dipCount: doubleDip === 'YES' ? dipCount : 1,
    steel,
    coating,
  };
};

export const inspectGalvanizingReceipt = async (actor: GalvanizingActor, input: Record<string, unknown>) => withTx(actor, async (tx) => {
  const row = await one<Record<string, unknown>>(tx, `SELECT * FROM [galvanizing].[Receipts] WHERE [Id] = @id`, [['id', sql.Int, num(input.receiptId)]], 'Receipt not found.');
  assertReceiptReady({
    status: text(row.Status, 32),
    jobId: Number(row.JobId || 0),
    tareRecorded: text(row.TareRecorded, 3) === 'YES',
    missingWaybill: text(row.MissingWaybill, 8) === 'YES',
    exceptionApproved: text(row.ExceptionApprovedBy, 120).length > 0,
  });
  if (['QC_PASSED', 'QC_PENDING_APPROVAL'].includes(text(row.Status))) fail(409, 'This receipt is not open for incoming QC.');
  const outcome = text(input.outcome, 20).toUpperCase();
  const disposition = text(input.disposition, 20).toUpperCase();
  const severity = text(input.severity, 16).toUpperCase();
  const supervisor = text(input.supervisor, 120);
  if (!supervisor) fail(422, 'Name the QC supervisor who will approve this inspection.');
  if (supervisor.toLowerCase() === actor.name.toLowerCase()) fail(409, 'The QC supervisor must be a different person from the inspector.');
  if (['FAIL', 'HOLD'].includes(outcome) && !text(input.remarks, 500)) fail(422, 'Record the hold or rejection reason.');
  if (outcome === 'FAIL' && !NCR_DISPOSITIONS.includes(disposition as (typeof NCR_DISPOSITIONS)[number])) {
    fail(422, 'Choose a disposition for the failed inspection.');
  }
  const stored = await run(tx, `SELECT [Id], [Quantity], [Tag] FROM [galvanizing].[Articles] WHERE [ReceiptId] = @id`, [['id', sql.Int, Number(row.Id)]]);
  const posted = Array.isArray(input.articles) ? input.articles.map((item) => articleLine(item as Record<string, unknown>)) : [];
  if (posted.length !== stored.recordset.length) fail(422, 'Inspect every article on the receipt.');
  let rejectedTotal = 0;
  for (const article of stored.recordset as Array<{ Id: number; Quantity: number; Tag: string }>) {
    const line = posted.find((item) => item.id === Number(article.Id));
    if (!line) throw new GalvanizingRuleError(422, `Inspect ${article.Tag}.`);
    articleQuantities(Number(article.Quantity), line.accepted, line.rejected);
    rejectedTotal += line.rejected;
    await run(tx, `
      UPDATE [galvanizing].[Articles]
      SET [AcceptedQty] = @accepted, [RejectedQty] = @rejected, [HoleCount] = @holes, [DoubleDip] = @dip, [DoubleDipCount] = @dipCount,
          [SteelThicknessMm] = @steel, [CoatingThicknessUm] = @coating
      WHERE [Id] = @id
    `, [
      ['accepted', sql.Int, line.accepted],
      ['rejected', sql.Int, line.rejected],
      ['holes', sql.Int, line.holeCount],
      ['dip', sql.NVarChar(3), line.doubleDip],
      ['dipCount', sql.Int, line.dipCount],
      ['steel', sql.Float, line.steel],
      ['coating', sql.Float, line.coating],
      ['id', sql.Int, Number(article.Id)],
    ]);
  }
  assertIncomingOutcome({ outcome, rejectedTotal, disposition: outcome === 'FAIL' ? disposition : '', severity: outcome === 'FAIL' ? severity : '' });
  await run(tx, `
    UPDATE [galvanizing].[Receipts]
    SET [Status] = N'QC_PENDING_APPROVAL', [QcInspector] = @inspector, [QcSupervisor] = @supervisor,
        [QcDisposition] = @disposition, [QcSeverity] = @severity
    WHERE [Id] = @id
  `, [
    ['inspector', sql.NVarChar(120), actor.name],
    ['supervisor', sql.NVarChar(120), supervisor],
    ['disposition', sql.NVarChar(20), outcome === 'FAIL' ? disposition : ''],
    ['severity', sql.NVarChar(16), outcome === 'FAIL' ? severity : ''],
    ['id', sql.Int, Number(row.Id)],
  ]);
  await audit(tx, 'receipt', Number(row.Id), `INCOMING_QC_${outcome}`, actor.name, text(input.remarks, 500));
  return 'Incoming QC is waiting for an independent supervisor.';
});

export const approveGalvanizingReceiptQc = async (actor: GalvanizingActor, input: Record<string, unknown>) => withTx(actor, async (tx) => {
  const row = await one<Record<string, unknown>>(tx, `SELECT * FROM [galvanizing].[Receipts] WHERE [Id] = @id`, [['id', sql.Int, num(input.receiptId)]], 'Receipt not found.');
  if (text(row.Status) !== 'QC_PENDING_APPROVAL') fail(409, 'This receipt is not waiting for QC approval.');
  if (text(row.QcInspector).toLowerCase() === actor.name.toLowerCase()) fail(409, 'The inspector cannot approve their own inspection.');
  const decision = text(input.outcome, 20).toUpperCase();
  if (!['PASS', 'FAIL', 'HOLD'].includes(decision)) fail(422, 'Choose a supervisor decision.');
  const articles = await run(tx, `SELECT [Id], [AcceptedQty], [RejectedQty] FROM [galvanizing].[Articles] WHERE [ReceiptId] = @id`, [['id', sql.Int, Number(row.Id)]]);
  const lines = articles.recordset as Array<{ Id: number; AcceptedQty: number | null; RejectedQty: number | null }>;
  const rejectedTotal = lines.reduce((sum, line) => sum + Number(line.RejectedQty || 0), 0);
  assertIncomingOutcome({
    outcome: decision,
    rejectedTotal,
    disposition: decision === 'FAIL' ? text(row.QcDisposition, 20) : '',
    severity: decision === 'FAIL' ? text(row.QcSeverity, 16) : '',
  });
  const status = `QC_${decision === 'PASS' ? 'PASSED' : decision}`;
  await run(tx, `UPDATE [galvanizing].[Receipts] SET [Status] = @status, [QcSupervisor] = @actor WHERE [Id] = @id`, [
    ['status', sql.NVarChar(32), status],
    ['actor', sql.NVarChar(120), actor.name],
    ['id', sql.Int, Number(row.Id)],
  ]);
  for (const line of lines) {
    const accepted = Number(line.AcceptedQty || 0);
    const articleStatus = decision === 'HOLD' ? 'QC_HOLD' : accepted > 0 ? 'QC_ACCEPTED' : 'QC_REJECTED';
    await run(tx, `UPDATE [galvanizing].[Articles] SET [Status] = @status WHERE [Id] = @id`, [
      ['status', sql.NVarChar(24), articleStatus],
      ['id', sql.Int, Number(line.Id)],
    ]);
  }
  await audit(tx, 'receipt', Number(row.Id), `INCOMING_QC_APPROVE_${decision}`, actor.name, text(input.remarks, 500));
  return `Incoming QC ${decision.toLowerCase()} recorded by the supervisor.`;
});

export const approveGalvanizingJob = async (actor: GalvanizingActor, input: Record<string, unknown>) => withTx(actor, async (tx) => (
  releaseRegisteredJob(tx, actor, num(input.jobId), text(input.decision, 20).toUpperCase(), text(input.comment, 500), false)
));

const releaseRegisteredJob = async (
  tx: sql.Transaction,
  actor: GalvanizingActor,
  jobId: number,
  decision: string,
  comment: string,
  allowReleased: boolean,
) => {
  const job = await one<Record<string, unknown>>(tx, `SELECT * FROM [galvanizing].[Jobs] WHERE [Id] = @id`, [['id', sql.Int, jobId]], 'Job not found.');
  if (['RELEASED', 'IN_PRODUCTION'].includes(text(job.Status)) && decision === 'APPROVED' && allowReleased) return '';
  if (!['REGISTERED', 'REJECTED'].includes(text(job.Status))) fail(409, 'Only a registered job can be released or returned.');
  const receipts = await run(tx, `SELECT [Status], [TareRecorded], [MissingWaybill], [ExceptionApprovedBy] FROM [galvanizing].[Receipts] WHERE [JobId] = @id`, [['id', sql.Int, Number(job.Id)]]);
  const rows = receipts.recordset as Array<{ Status: string; TareRecorded: string; MissingWaybill: string; ExceptionApprovedBy: string }>;
  if (rows.some((item) => ['GATE_HOLD', 'WEIGH_PENDING', 'QC_HOLD', 'QC_PENDING_APPROVAL'].includes(item.Status) || item.TareRecorded !== 'YES' || (item.MissingWaybill === 'YES' && !item.ExceptionApprovedBy))) {
    fail(409, 'Every receipt on this job needs a completed tare weigh, waybill approval, and a finished inspection before release.');
  }
  const acceptedArticles = await run(tx, `
    SELECT COUNT(*) AS Total
    FROM [galvanizing].[Articles] a
    INNER JOIN [galvanizing].[Receipts] r ON r.[Id] = a.[ReceiptId]
    WHERE r.[JobId] = @id AND a.[Status] = N'QC_ACCEPTED' AND ISNULL(a.[AcceptedQty], 0) > 0
  `, [['id', sql.Int, Number(job.Id)]]);
  const status = assertJobRelease({
    decision,
    hasReceipt: rows.length > 0,
    hasQcPass: Number(acceptedArticles.recordset[0]?.Total || 0) > 0,
  });
  await run(tx, `UPDATE [galvanizing].[Jobs] SET [Status] = @status WHERE [Id] = @id`, [
    ['status', sql.NVarChar(32), status],
    ['id', sql.Int, Number(job.Id)],
  ]);
  await run(tx, `
    INSERT INTO [galvanizing].[Approvals] ([JobId], [Decision], [Actor], [Comment])
    VALUES (@jobId, @decision, @actor, @comment)
  `, [
    ['jobId', sql.Int, Number(job.Id)],
    ['decision', sql.NVarChar(20), decision],
    ['actor', sql.NVarChar(100), actor.name],
    ['comment', sql.NVarChar(sql.MAX), comment],
  ]);
  await audit(tx, 'job', Number(job.Id), decision, actor.name, comment);
  return status === 'RELEASED' ? `${text(job.Number)} released to production.` : `${text(job.Number)} returned to the client.`;
};

export const createGalvanizingBatch = async (actor: GalvanizingActor, input: Record<string, unknown>) => withTx(actor, async (tx) => {
  const job = await one<Record<string, unknown>>(tx, `SELECT * FROM [galvanizing].[Jobs] WHERE [Id] = @id`, [['id', sql.Int, num(input.jobId)]], 'Job not found.');
  if (text(job.Status) !== 'RELEASED') fail(409, 'GM Operations must release the job before a batch can start.');
  const articleIds = Array.isArray(input.articleIds) ? input.articleIds.map((value) => Number(value)).filter((value) => value > 0) : [];
  if (!articleIds.length) fail(422, 'Select at least one accepted article.');
  let weight = 0;
  const accepted: Array<{ id: number; weight: number; quantity: number; tag: string }> = [];
  for (const articleId of articleIds) {
    const article = await one<Record<string, unknown>>(tx, `
      SELECT a.*, r.[JobId]
      FROM [galvanizing].[Articles] a
      INNER JOIN [galvanizing].[Receipts] r ON r.[Id] = a.[ReceiptId]
      WHERE a.[Id] = @id
    `, [['id', sql.Int, articleId]], 'Article not found.');
    if (Number(article.JobId) !== Number(job.Id)) fail(409, `${text(article.Tag)} does not belong to this job.`);
    if (text(article.Status) !== 'QC_ACCEPTED') fail(409, `${text(article.Tag)} is not accepted by incoming QC.`);
    const declared = Number(article.Quantity || 0);
    const acceptedQty = Number(article.AcceptedQty || 0);
    if (!(acceptedQty > 0)) fail(409, `${text(article.Tag)} has no accepted quantity.`);
    const acceptedWeight = declared > 0 ? roundKg(num(article.WeightKg) * (acceptedQty / declared)) : 0;
    const active = await one<{ Id: number }>(tx, `
      SELECT TOP 1 ba.[Id]
      FROM [galvanizing].[BatchArticles] ba
      INNER JOIN [galvanizing].[Batches] b ON b.[Id] = ba.[BatchId]
      WHERE ba.[ArticleId] = @id AND b.[Status] IN (N'SCHEDULED', N'IN_PROGRESS', N'HOLD')
    `, [['id', sql.Int, articleId]]);
    if (active) fail(409, `${text(article.Tag)} is already on an active batch.`);
    accepted.push({ id: articleId, weight: acceptedWeight, quantity: acceptedQty, tag: text(article.Tag) });
    weight += acceptedWeight;
  }
  if (!(weight > 0)) fail(422, 'Accepted articles need a recorded weight.');
  const pending = `PEND-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const inserted = await run(tx, `
    INSERT INTO [galvanizing].[Batches]
      ([Number], [JobId], [WeightKg], [Stage], [Status], [Kettle], [ShiftName], [Supervisor], [ArticleCount])
    OUTPUT INSERTED.[Id]
    VALUES (@pending, @jobId, @weight, N'SCHEDULED', N'SCHEDULED', @kettle, @shift, @supervisor, @count)
  `, [
    ['pending', sql.NVarChar(40), pending],
    ['jobId', sql.Int, Number(job.Id)],
    ['weight', sql.Float, roundKg(weight)],
    ['kettle', sql.NVarChar(40), text(input.kettle, 40) || 'Kettle 1'],
    ['shift', sql.NVarChar(16), text(input.shift, 16) || 'Day'],
    ['supervisor', sql.NVarChar(100), text(input.supervisor, 100) || actor.name],
    ['count', sql.Int, accepted.length],
  ]);
  const id = Number(inserted.recordset[0].Id);
  const number = `B-${year()}-${String(id).padStart(4, '0')}`;
  await run(tx, `UPDATE [galvanizing].[Batches] SET [Number] = @number WHERE [Id] = @id`, [
    ['number', sql.NVarChar(40), number],
    ['id', sql.Int, id],
  ]);
  for (const article of accepted) {
    await run(tx, `
      INSERT INTO [galvanizing].[BatchArticles] ([BatchId], [ArticleId], [Quantity], [WeightKg])
      VALUES (@batchId, @articleId, @quantity, @weight)
    `, [
      ['batchId', sql.Int, id],
      ['articleId', sql.Int, article.id],
      ['quantity', sql.Int, article.quantity],
      ['weight', sql.Float, article.weight],
    ]);
    await run(tx, `UPDATE [galvanizing].[Articles] SET [Status] = N'BATCHED' WHERE [Id] = @id`, [['id', sql.Int, article.id]]);
  }
  await run(tx, `UPDATE [galvanizing].[Jobs] SET [Status] = N'IN_PRODUCTION' WHERE [Id] = @id AND [Status] = N'RELEASED'`, [['id', sql.Int, Number(job.Id)]]);
  await audit(tx, 'batch', id, 'CREATE', actor.name, number);
  return `${number} scheduled at ${roundKg(weight)} kg.`;
});

export const advanceGalvanizingStage = async (actor: GalvanizingActor, input: Record<string, unknown>) => withTx(actor, async (tx) => {
  const batch = await one<Record<string, unknown>>(tx, `SELECT * FROM [galvanizing].[Batches] WHERE [Id] = @id`, [['id', sql.Int, num(input.batchId)]], 'Batch not found.');
  const open = await one<{ Id: number }>(tx, `SELECT TOP 1 [Id] FROM [galvanizing].[Ncr] WHERE [BatchId] = @id AND [Status] = N'OPEN'`, [['id', sql.Int, Number(batch.Id)]]);
  const pass = await one<{ Id: number }>(tx, `SELECT TOP 1 [Id] FROM [galvanizing].[Inspections] WHERE [BatchId] = @id AND [Kind] = N'FINAL' AND [Outcome] = N'PASS'`, [['id', sql.Int, Number(batch.Id)]]);
  const next = assertStageAdvance({
    stage: text(batch.Stage),
    status: text(batch.Status),
    openNcr: Boolean(open),
    hasFinalPass: Boolean(pass),
  });
  await run(tx, `
    UPDATE [galvanizing].[Batches]
    SET [Stage] = @stage, [Status] = @status, [CompletedAt] = CASE WHEN @status = N'COMPLETED' THEN SYSUTCDATETIME() ELSE [CompletedAt] END
    WHERE [Id] = @id
  `, [
    ['stage', sql.NVarChar(30), next.stage],
    ['status', sql.NVarChar(24), next.status],
    ['id', sql.Int, Number(batch.Id)],
  ]);
  await run(tx, `
    INSERT INTO [galvanizing].[StageEvents] ([BatchId], [Stage], [ActionName], [OperatorName], [Detail])
    VALUES (@batchId, @stage, N'COMPLETE', @actor, @detail)
  `, [
    ['batchId', sql.Int, Number(batch.Id)],
    ['stage', sql.NVarChar(30), text(batch.Stage, 30)],
    ['actor', sql.NVarChar(100), actor.name],
    ['detail', sql.NVarChar(500), text(input.note, 500)],
  ]);
  if (next.status === 'COMPLETED') {
    await run(tx, `
      UPDATE a SET a.[Status] = N'STORED', a.[LocationName] = N'Finished Goods'
      FROM [galvanizing].[Articles] a
      INNER JOIN [galvanizing].[BatchArticles] ba ON ba.[ArticleId] = a.[Id]
      WHERE ba.[BatchId] = @id
    `, [['id', sql.Int, Number(batch.Id)]]);
  }
  await audit(tx, 'batch', Number(batch.Id), 'ADVANCE', actor.name, `${text(batch.Stage)} -> ${next.stage}`);
  return `${text(batch.Number)} moved to ${next.stage.replaceAll('_', ' ').toLowerCase()}.`;
});

export const inspectGalvanizingBatch = async (actor: GalvanizingActor, input: Record<string, unknown>) => withTx(actor, async (tx) => {
  const batch = await one<Record<string, unknown>>(tx, `SELECT * FROM [galvanizing].[Batches] WHERE [Id] = @id`, [['id', sql.Int, num(input.batchId)]], 'Batch not found.');
  const kind = text(input.kind, 20).toUpperCase() || 'IN_PROCESS';
  const outcome = text(input.outcome, 20).toUpperCase();
  if (!['IN_PROCESS', 'FINAL'].includes(kind)) fail(422, 'Inspection must be in-process or final.');
  if (kind === 'FINAL' && !['FINAL_QC', 'COMPLETED'].includes(text(batch.Stage))) fail(409, 'Final QC is recorded at the final QC stage.');
  if (!['PASS', 'FAIL', 'HOLD'].includes(outcome)) fail(422, 'Choose an inspection outcome.');
  if (outcome !== 'PASS' && !text(input.remarks, 500)) fail(422, 'Record the defect before rejecting or holding the batch.');
  const disposition = text(input.disposition, 20).toUpperCase();
  const severity = text(input.severity, 16).toUpperCase();
  if (outcome === 'FAIL' && !NCR_DISPOSITIONS.includes(disposition as (typeof NCR_DISPOSITIONS)[number])) {
    fail(422, 'Choose a disposition for the failed inspection.');
  }
  if (outcome === 'FAIL' && !['MINOR', 'MAJOR', 'CRITICAL'].includes(severity)) fail(422, 'Choose a severity for the failed inspection.');
  const thickness = num(input.thicknessUm);
  const steel = num(input.steelThicknessMm);
  if (outcome === 'PASS' && kind === 'FINAL' && !(thickness > 0)) fail(422, 'Coating thickness in microns is required for a final pass.');
  if (outcome === 'PASS' && kind === 'FINAL' && !(steel > 0)) fail(422, 'Steel thickness in millimetres is required for a final pass.');
  await run(tx, `
    INSERT INTO [galvanizing].[Inspections] ([BatchId], [Kind], [Outcome], [ThicknessUm], [SteelThicknessMm], [StandardName], [Inspector], [Remarks])
    VALUES (@batchId, @kind, @outcome, @thickness, @steel, @standard, @inspector, @remarks)
  `, [
    ['batchId', sql.Int, Number(batch.Id)],
    ['kind', sql.NVarChar(20), kind],
    ['outcome', sql.NVarChar(20), outcome],
    ['thickness', sql.Float, thickness > 0 ? thickness : null],
    ['steel', sql.Float, steel > 0 ? steel : null],
    ['standard', sql.NVarChar(40), text(input.standard, 40) || 'ISO 1461'],
    ['inspector', sql.NVarChar(100), actor.name],
    ['remarks', sql.NVarChar(sql.MAX), text(input.remarks, 1000)],
  ]);
  if (outcome !== 'PASS') {
    await run(tx, `UPDATE [galvanizing].[Batches] SET [Status] = N'HOLD' WHERE [Id] = @id`, [['id', sql.Int, Number(batch.Id)]]);
    await run(tx, `
      INSERT INTO [galvanizing].[Ncr] ([BatchId], [Defect], [Severity], [Disposition], [Status])
      VALUES (@batchId, @defect, @severity, @disposition, N'OPEN')
    `, [
      ['batchId', sql.Int, Number(batch.Id)],
      ['defect', sql.NVarChar(sql.MAX), text(input.remarks, 1000)],
      ['severity', sql.NVarChar(16), severity || 'MAJOR'],
      ['disposition', sql.NVarChar(20), NCR_DISPOSITIONS.includes(disposition as (typeof NCR_DISPOSITIONS)[number]) ? disposition : 'HOLD'],
    ]);
    await run(tx, `
      UPDATE a SET a.[LocationName] = N'Identified Hold'
      FROM [galvanizing].[Articles] a
      INNER JOIN [galvanizing].[BatchArticles] ba ON ba.[ArticleId] = a.[Id]
      WHERE ba.[BatchId] = @id
    `, [['id', sql.Int, Number(batch.Id)]]);
  }
  await audit(tx, 'batch', Number(batch.Id), `QC_${kind}_${outcome}`, actor.name, text(input.remarks, 500));
  return outcome === 'PASS' ? 'Inspection accepted.' : 'Inspection failed. The batch is on hold and a nonconformance is open.';
});

export const closeGalvanizingNcr = async (actor: GalvanizingActor, input: Record<string, unknown>, allowScrap: boolean) => withTx(actor, async (tx) => {
  const ncr = await one<Record<string, unknown>>(tx, `SELECT * FROM [galvanizing].[Ncr] WHERE [Id] = @id`, [['id', sql.Int, num(input.ncrId)]], 'Nonconformance not found.');
  if (text(ncr.Status) !== 'OPEN') fail(409, 'This nonconformance is already closed.');
  const pass = await one<{ Id: number }>(tx, `
    SELECT TOP 1 [Id] FROM [galvanizing].[Inspections]
    WHERE [BatchId] = @batchId AND [Outcome] = N'PASS' AND [At] >= @created
  `, [
    ['batchId', sql.Int, Number(ncr.BatchId)],
    ['created', sql.DateTime2, ncr.CreatedAt],
  ]);
  const disposition = text(ncr.Disposition, 20).toUpperCase();
  assertCloseNcr({ disposition, hasReinspection: Boolean(pass), allowScrap });
  await run(tx, `UPDATE [galvanizing].[Ncr] SET [Status] = N'CLOSED', [Approver] = @actor WHERE [Id] = @id`, [
    ['actor', sql.NVarChar(100), actor.name],
    ['id', sql.Int, Number(ncr.Id)],
  ]);
  const scrap = disposition === 'SCRAP';
  const returned = disposition === 'RETURN';
  const regalvanize = disposition === 'REGALVANIZE';
  await run(tx, `
    UPDATE [galvanizing].[Batches]
    SET [Status] = @status, [Stage] = CASE WHEN @regalvanize = 1 THEN N'DIPPING' ELSE [Stage] END
    WHERE [Id] = @id
  `, [
    ['status', sql.NVarChar(24), scrap || returned ? 'REJECTED' : 'IN_PROGRESS'],
    ['regalvanize', sql.Int, regalvanize ? 1 : 0],
    ['id', sql.Int, Number(ncr.BatchId)],
  ]);
  const articleStatus = scrap ? 'SCRAP' : returned ? 'RETURNED' : 'BATCHED';
  const location = scrap ? 'Scrap Yard' : returned ? 'Return Bay' : 'Identified Hold';
  await run(tx, `
    UPDATE a SET a.[Status] = @status, a.[LocationName] = @location
    FROM [galvanizing].[Articles] a
    INNER JOIN [galvanizing].[BatchArticles] ba ON ba.[ArticleId] = a.[Id]
    WHERE ba.[BatchId] = @id
  `, [
    ['status', sql.NVarChar(24), articleStatus],
    ['location', sql.NVarChar(80), location],
    ['id', sql.Int, Number(ncr.BatchId)],
  ]);
  await audit(tx, 'ncr', Number(ncr.Id), 'CLOSE', actor.name, disposition);
  return `Nonconformance closed as ${disposition.toLowerCase()}.`;
});

const STOCK_IN = new Set(['RECEIPT', 'ADJUSTMENT_IN']);
const STOCK_OUT = new Set(['CONSUMPTION', 'ADJUSTMENT_OUT']);

export const moveGalvanizingStock = async (actor: GalvanizingActor, input: Record<string, unknown>) => withTx(actor, async (tx) => {
  const material = text(input.material, 50);
  const kind = text(input.kind, 20).toUpperCase();
  const quantity = num(input.quantity);
  if (!GALVANIZING_MATERIALS.some((item) => item.material === material)) fail(422, 'Choose a zinc or chemical material.');
  if (![...STOCK_IN, ...STOCK_OUT].includes(kind)) fail(422, 'Movement must be a receipt, consumption, or adjustment.');
  if (!(quantity > 0)) fail(422, 'Quantity must be greater than zero.');
  if (!text(input.reference, 100) || !text(input.reason, 200) || !text(input.evidenceRef, 200)) {
    fail(422, 'Reference, reason, and evidence are required.');
  }
  const balances = await run(tx, `SELECT [Kind], [Quantity] FROM [galvanizing].[InventoryMovements] WHERE [Material] = @material`, [
    ['material', sql.NVarChar(50), material],
  ]);
  const current = (balances.recordset as Array<{ Kind: string; Quantity: number }>).reduce((sum, row) => {
    if (STOCK_IN.has(row.Kind)) return sum + Number(row.Quantity);
    if (STOCK_OUT.has(row.Kind)) return sum - Number(row.Quantity);
    return sum;
  }, 0);
  if (STOCK_OUT.has(kind) && current < quantity) fail(409, 'That movement exceeds the quantity on hand.');
  const inserted = await run(tx, `
    INSERT INTO [galvanizing].[InventoryMovements]
      ([Material], [Quantity], [Kind], [ReferenceNo], [LotNo], [LocationName], [Reason], [EvidenceRef], [UnitCost], [Actor])
    OUTPUT INSERTED.[Id]
    VALUES (@material, @quantity, @kind, @reference, @lot, @location, @reason, @evidence, @cost, @actor)
  `, [
    ['material', sql.NVarChar(50), material],
    ['quantity', sql.Float, quantity],
    ['kind', sql.NVarChar(20), kind],
    ['reference', sql.NVarChar(100), text(input.reference, 100)],
    ['lot', sql.NVarChar(80), text(input.lot, 80)],
    ['location', sql.NVarChar(120), text(input.location, 120)],
    ['reason', sql.NVarChar(200), text(input.reason, 200)],
    ['evidence', sql.NVarChar(200), text(input.evidenceRef, 200)],
    ['cost', sql.Float, num(input.unitCost)],
    ['actor', sql.NVarChar(100), actor.name],
  ]);
  await audit(tx, 'inventory', Number(inserted.recordset[0].Id), kind, actor.name, material);
  return `${material} ${kind.toLowerCase()} posted.`;
});

export const createGalvanizingDispatch = async (actor: GalvanizingActor, input: Record<string, unknown>) => withTx(actor, async (tx) => {
  const batch = await one<Record<string, unknown>>(tx, `SELECT * FROM [galvanizing].[Batches] WHERE [Id] = @id`, [['id', sql.Int, num(input.batchId)]], 'Batch not found.');
  if (Number(batch.JobId) !== num(input.jobId)) fail(409, 'The batch does not belong to that job.');
  if (text(batch.Status) !== 'COMPLETED') fail(409, 'Only a completed, accepted batch can be dispatched.');
  const open = await one<{ Id: number }>(tx, `SELECT TOP 1 [Id] FROM [galvanizing].[Ncr] WHERE [BatchId] = @id AND [Status] = N'OPEN'`, [['id', sql.Int, Number(batch.Id)]]);
  if (open) fail(409, 'An open nonconformance blocks dispatch.');
  const waybill = text(input.waybill, 100);
  const vehicle = text(input.vehicle, 50);
  const destination = text(input.destination, 160);
  const weighbridgeRef = text(input.weighbridgeRef, 120);
  if (!waybill || !vehicle || !destination || !weighbridgeRef) fail(422, 'Waybill, vehicle, destination, and outbound weighbridge reference are required.');
  const prior = await run(tx, `SELECT ISNULL(SUM([WeightKg]), 0) AS TotalKg FROM [galvanizing].[Dispatches] WHERE [BatchId] = @id`, [['id', sql.Int, Number(batch.Id)]]);
  const already = num(prior.recordset[0]?.TotalKg);
  assertDispatchWeight(num(input.weightKg), already, num(batch.WeightKg));
  const weightOk = text(input.weightOk, 8).toUpperCase() === 'NO' ? 'NO' : 'YES';
  const status = weightOk === 'NO' ? 'HOLD_VEHICLE' : 'AUTHORIZED';
  const pending = `PEND-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const inserted = await run(tx, `
    INSERT INTO [galvanizing].[Dispatches]
      ([Number], [JobId], [BatchId], [WeightKg], [Waybill], [Vehicle], [Destination], [Status], [WeightOk], [WeighbridgeRef], [AuthorizedBy])
    OUTPUT INSERTED.[Id]
    VALUES (@pending, @jobId, @batchId, @weight, @waybill, @vehicle, @destination, @status, @weightOk, @weighbridge, @actor)
  `, [
    ['pending', sql.NVarChar(40), pending],
    ['jobId', sql.Int, Number(batch.JobId)],
    ['batchId', sql.Int, Number(batch.Id)],
    ['weight', sql.Float, num(input.weightKg)],
    ['waybill', sql.NVarChar(100), waybill],
    ['vehicle', sql.NVarChar(50), vehicle],
    ['destination', sql.NVarChar(160), destination],
    ['status', sql.NVarChar(24), status],
    ['weightOk', sql.NVarChar(8), weightOk],
    ['weighbridge', sql.NVarChar(120), weighbridgeRef],
    ['actor', sql.NVarChar(100), actor.name],
  ]);
  const id = Number(inserted.recordset[0].Id);
  const number = `DSP-${year()}-${String(id).padStart(4, '0')}`;
  await run(tx, `UPDATE [galvanizing].[Dispatches] SET [Number] = @number WHERE [Id] = @id`, [
    ['number', sql.NVarChar(40), number],
    ['id', sql.Int, id],
  ]);
  await audit(tx, 'dispatch', id, status, actor.name, waybill);
  return status === 'HOLD_VEHICLE' ? `${number} held at the gate. Outbound weight does not match.` : `${number} authorized. Commercial clearance and gate verification are still required.`;
});

export const updateGalvanizingDispatch = async (actor: GalvanizingActor, input: Record<string, unknown>) => withTx(actor, async (tx) => {
  const row = await one<Record<string, unknown>>(tx, `SELECT * FROM [galvanizing].[Dispatches] WHERE [Id] = @id`, [['id', sql.Int, num(input.dispatchId)]], 'Dispatch not found.');
  const commercial = text(input.commercialCleared, 8).toUpperCase();
  const gate = text(input.gateVerified, 8).toUpperCase();
  const weightOk = text(input.weightOk, 8).toUpperCase();
  const pod = text(input.podRef, 120);
  const status = nextDispatchStatus(text(row.Status), {
    commercialCleared: commercial,
    gateVerified: gate,
    weightOk,
    podRef: pod,
    status: text(input.status, 24).toUpperCase(),
  }, text(row.CommercialCleared, 8));
  await run(tx, `
    UPDATE [galvanizing].[Dispatches]
    SET [Status] = @status,
        [CommercialCleared] = CASE WHEN @commercial <> N'' THEN @commercial ELSE [CommercialCleared] END,
        [GateVerified] = CASE WHEN @gate <> N'' THEN @gate ELSE [GateVerified] END,
        [WeightOk] = CASE WHEN @weightOk <> N'' THEN @weightOk ELSE [WeightOk] END,
        [PodRef] = CASE WHEN @pod <> N'' THEN @pod ELSE [PodRef] END
    WHERE [Id] = @id
  `, [
    ['status', sql.NVarChar(24), status],
    ['commercial', sql.NVarChar(8), commercial],
    ['gate', sql.NVarChar(8), gate],
    ['weightOk', sql.NVarChar(8), weightOk],
    ['pod', sql.NVarChar(120), pod],
    ['id', sql.Int, Number(row.Id)],
  ]);
  if (status === 'DELIVERED') {
    await run(tx, `
      UPDATE a SET a.[Status] = N'DISPATCHED'
      FROM [galvanizing].[Articles] a
      INNER JOIN [galvanizing].[BatchArticles] ba ON ba.[ArticleId] = a.[Id]
      WHERE ba.[BatchId] = @id AND a.[Status] = N'STORED'
    `, [['id', sql.Int, Number(row.BatchId)]]);
  }
  await audit(tx, 'dispatch', Number(row.Id), status, actor.name, pod || weightOk || gate || commercial);
  return status === 'HOLD_VEHICLE' ? 'Vehicle held at the gate.' : `Dispatch is ${status.replaceAll('_', ' ').toLowerCase()}.`;
});

const chosenKeys = (value: unknown, allowed: Record<string, string>) => {
  const keys = Array.isArray(value) ? value.map((item) => text(item, 40)) : text(value, 400).split(',');
  return [...new Set(keys.map((item) => item.trim()).filter((item) => item in allowed))];
};

const canSignRelease = (actor: GalvanizingActor, role: ReleaseSignRole) => {
  if (canGalvanizingRelease(actor)) return true;
  if (role === 'issued') return canGalvanizingIntake(actor);
  if (role === 'received') return canGalvanizingProduction(actor);
  if (role === 'reviewed') return canGalvanizingQc(actor);
  return false;
};

const releaseColumns = (input: Record<string, unknown>) => {
  const jobType = text(input.jobType, 40);
  if (!(jobType in JOB_TYPES)) fail(422, 'Choose the type of job.');
  const releaseOrderNo = text(input.releaseOrderNo, 40);
  const formNo = text(input.formNo, 40);
  const dated = text(input.dated, 20);
  const clientName = text(input.clientName, 200);
  const itemsList = text(input.itemsList, 4000);
  const jobTypeOther = text(input.jobTypeOther, 120);
  if (!releaseOrderNo) fail(422, 'Enter the release order number.');
  if (!formNo) fail(422, 'Enter the form number.');
  if (!dated) fail(422, 'Enter the date.');
  if (clientName.length < 2) fail(422, 'Enter the client name.');
  if (jobType === 'others' && jobTypeOther.length < 2) fail(422, 'Specify the type of job.');
  if (itemsList.length < 2) fail(422, 'List the items and quantity as per waybill.');
  const scheduled = text(input.scheduledDelivery, 20);
  if (scheduled && dated && scheduled < dated) fail(422, 'Delivery date is before the release date.');
  return {
    releaseOrderNo,
    formNo,
    dated,
    batch: text(input.batch, 40),
    jobType,
    jobTypeOther,
    clientName,
    clientPoNo: text(input.clientPoNo, 80),
    scheduledDelivery: scheduled,
    pfiNo: text(input.pfiNo, 80),
    pfiDate: text(input.pfiDate, 20),
    materialReceiptDate: text(input.materialReceiptDate, 20),
    blackWeight: optionalNum(input.blackWeight),
    weighbridgeTicketNo: text(input.weighbridgeTicketNo, 80),
    additionalWork: chosenKeys(input.additionalWork, ADDITIONAL_WORK).join(','),
    additionalWorkOther: text(input.additionalWorkOther, 200),
    itemsList,
    packaging: chosenKeys(input.packaging, PACKAGING).join(','),
    packagingOther: text(input.packagingOther, 200),
    remarks: text(input.remarks, 2000),
    variationReason: text(input.variationReason, 2000),
    jobNo: text(input.jobNo, 80),
    jobDate: text(input.jobDate, 20),
    qcReportNo: text(input.qcReportNo, 80),
    qcReportDate: text(input.qcReportDate, 20),
    hdgRate: text(input.hdgRate, 80),
    otherCharges: text(input.otherCharges, 200),
    dispatchDate: text(input.dispatchDate, 20),
    ticketNo: text(input.ticketNo, 80),
    galvanizedWeight: optionalNum(input.galvanizedWeight),
    waybillNo: text(input.waybillNo, 80),
    waybillDate: text(input.waybillDate, 20),
    paymentReceiptNo: text(input.paymentReceiptNo, 80),
    paymentReceiptDate: text(input.paymentReceiptDate, 20),
    jobId: num(input.jobId),
    receiptId: num(input.receiptId),
    materialRegisterId: num(input.materialRegisterId),
  };
};

export const saveGalvanizingRelease = async (actor: GalvanizingActor, input: Record<string, unknown>) => withTx(actor, async (tx) => {
  if (!canGalvanizingIntake(actor) && !canGalvanizingRelease(actor)) fail(403, 'You cannot save a job release order.');
  const fields = releaseColumns(input);
  const id = num(input.id);
  const duplicate = await one<{ Id: number }>(tx, `
    SELECT [Id] FROM [galvanizing].[JobReleases] WHERE [ReleaseOrderNo] = @no AND [Id] <> @id
  `, [['no', sql.NVarChar(40), fields.releaseOrderNo], ['id', sql.Int, id]]);
  if (duplicate) fail(409, 'This release order number is already used.');
  if (fields.jobId > 0) {
    await one(tx, `SELECT [Id] FROM [galvanizing].[Jobs] WHERE [Id] = @id`, [['id', sql.Int, fields.jobId]], 'The linked job was not found.');
  }
  if (fields.receiptId > 0) {
    const receipt = await one<Record<string, unknown>>(tx, `SELECT [Id], [JobId] FROM [galvanizing].[Receipts] WHERE [Id] = @id`, [['id', sql.Int, fields.receiptId]], 'The linked material receipt was not found.');
    if (fields.jobId > 0 && Number(receipt.JobId || 0) !== fields.jobId) fail(409, 'That receipt does not belong to the linked job.');
    if (!fields.jobId && Number(receipt.JobId || 0) > 0) fields.jobId = Number(receipt.JobId);
  }
  if (fields.materialRegisterId > 0) {
    await one(tx, `SELECT [Id] FROM [galvanizing].[MaterialRegister] WHERE [Id] = @id`, [['id', sql.Int, fields.materialRegisterId]], 'The linked material registration was not found.');
    const taken = await one<{ Id: number }>(tx, `SELECT [Id] FROM [galvanizing].[JobReleases] WHERE [MaterialRegisterId] = @materialId AND [Id] <> @id`, [['materialId', sql.Int, fields.materialRegisterId], ['id', sql.Int, id]]);
    if (taken) fail(409, 'This material registration is already linked to a job release.');
  }
  const values: SqlInput[] = [
    ['no', sql.NVarChar(40), fields.releaseOrderNo],
    ['form', sql.NVarChar(40), fields.formNo],
    ['dated', sql.NVarChar(20), fields.dated],
    ['batch', sql.NVarChar(40), fields.batch],
    ['jobType', sql.NVarChar(40), fields.jobType],
    ['jobTypeOther', sql.NVarChar(120), fields.jobTypeOther],
    ['client', sql.NVarChar(200), fields.clientName],
    ['po', sql.NVarChar(80), fields.clientPoNo],
    ['delivery', sql.NVarChar(20), fields.scheduledDelivery],
    ['pfi', sql.NVarChar(80), fields.pfiNo],
    ['pfiDate', sql.NVarChar(20), fields.pfiDate],
    ['receiptDate', sql.NVarChar(20), fields.materialReceiptDate],
    ['black', sql.Float, fields.blackWeight],
    ['bridge', sql.NVarChar(80), fields.weighbridgeTicketNo],
    ['work', sql.NVarChar(400), fields.additionalWork],
    ['workOther', sql.NVarChar(200), fields.additionalWorkOther],
    ['items', sql.NVarChar(sql.MAX), fields.itemsList],
    ['pack', sql.NVarChar(400), fields.packaging],
    ['packOther', sql.NVarChar(200), fields.packagingOther],
    ['remarks', sql.NVarChar(sql.MAX), fields.remarks],
    ['variation', sql.NVarChar(sql.MAX), fields.variationReason],
    ['jobNo', sql.NVarChar(80), fields.jobNo],
    ['jobDate', sql.NVarChar(20), fields.jobDate],
    ['qc', sql.NVarChar(80), fields.qcReportNo],
    ['qcDate', sql.NVarChar(20), fields.qcReportDate],
    ['rate', sql.NVarChar(80), fields.hdgRate],
    ['charges', sql.NVarChar(200), fields.otherCharges],
    ['dispatch', sql.NVarChar(20), fields.dispatchDate],
    ['ticket', sql.NVarChar(80), fields.ticketNo],
    ['galv', sql.Float, fields.galvanizedWeight],
    ['waybill', sql.NVarChar(80), fields.waybillNo],
    ['waybillDate', sql.NVarChar(20), fields.waybillDate],
    ['payment', sql.NVarChar(80), fields.paymentReceiptNo],
    ['paymentDate', sql.NVarChar(20), fields.paymentReceiptDate],
    ['jobId', sql.Int, fields.jobId > 0 ? fields.jobId : null],
    ['receiptId', sql.Int, fields.receiptId > 0 ? fields.receiptId : null],
    ['materialId', sql.Int, fields.materialRegisterId > 0 ? fields.materialRegisterId : null],
  ];
  if (id > 0) {
    await one(tx, `SELECT [Id] FROM [galvanizing].[JobReleases] WHERE [Id] = @id`, [['id', sql.Int, id]], 'Job release not found.');
    await run(tx, `
      UPDATE [galvanizing].[JobReleases]
      SET [ReleaseOrderNo] = @no, [FormNo] = @form, [Dated] = @dated, [Batch] = @batch, [JobType] = @jobType, [JobTypeOther] = @jobTypeOther,
          [ClientName] = @client, [ClientPoNo] = @po, [ScheduledDelivery] = @delivery, [PfiNo] = @pfi, [PfiDate] = @pfiDate,
          [MaterialReceiptDate] = @receiptDate, [BlackWeight] = @black, [WeighbridgeTicketNo] = @bridge, [AdditionalWork] = @work,
          [AdditionalWorkOther] = @workOther, [ItemsList] = @items, [Packaging] = @pack, [PackagingOther] = @packOther, [Remarks] = @remarks,
          [VariationReason] = @variation, [JobNo] = @jobNo, [JobDate] = @jobDate, [QcReportNo] = @qc, [QcReportDate] = @qcDate,
          [HdgRate] = @rate, [OtherCharges] = @charges, [DispatchDate] = @dispatch, [TicketNo] = @ticket, [GalvanizedWeight] = @galv,
          [WaybillNo] = @waybill, [WaybillDate] = @waybillDate, [PaymentReceiptNo] = @payment, [PaymentReceiptDate] = @paymentDate,
          [JobId] = @jobId, [ReceiptId] = @receiptId, [MaterialRegisterId] = @materialId, [UpdatedAt] = SYSUTCDATETIME()
      WHERE [Id] = @id
    `, [...values, ['id', sql.Int, id]]);
    await audit(tx, 'release', id, 'UPDATE', actor.name, fields.releaseOrderNo);
    return `Job Release ${fields.releaseOrderNo} updated.`;
  }
  const inserted = await run(tx, `
    INSERT INTO [galvanizing].[JobReleases] (
      [ReleaseOrderNo], [FormNo], [Dated], [Batch], [JobType], [JobTypeOther], [ClientName], [ClientPoNo], [ScheduledDelivery],
      [PfiNo], [PfiDate], [MaterialReceiptDate], [BlackWeight], [WeighbridgeTicketNo], [AdditionalWork], [AdditionalWorkOther],
      [ItemsList], [Packaging], [PackagingOther], [Remarks], [VariationReason], [JobNo], [JobDate], [QcReportNo], [QcReportDate],
      [HdgRate], [OtherCharges], [DispatchDate], [TicketNo], [GalvanizedWeight], [WaybillNo], [WaybillDate], [PaymentReceiptNo],
      [PaymentReceiptDate], [JobId], [ReceiptId], [MaterialRegisterId]
    )
    OUTPUT INSERTED.[Id]
    VALUES (
      @no, @form, @dated, @batch, @jobType, @jobTypeOther, @client, @po, @delivery, @pfi, @pfiDate, @receiptDate, @black, @bridge,
      @work, @workOther, @items, @pack, @packOther, @remarks, @variation, @jobNo, @jobDate, @qc, @qcDate, @rate, @charges, @dispatch,
      @ticket, @galv, @waybill, @waybillDate, @payment, @paymentDate, @jobId, @receiptId, @materialId
    )
  `, values);
  const createdId = Number(inserted.recordset[0].Id);
  await audit(tx, 'release', createdId, 'CREATE', actor.name, fields.releaseOrderNo);
  return `Job Release ${fields.releaseOrderNo} created as a draft.`;
});

const SIGN_COLUMNS: Record<ReleaseSignRole, [string, string, string]> = {
  issued: ['IssuedName', 'IssuedDesignation', 'IssuedDate'],
  received: ['ReceivedName', 'ReceivedDesignation', 'ReceivedDate'],
  reviewed: ['ReviewedName', 'ReviewedDesignation', 'ReviewedDate'],
  approved: ['ApprovedName', 'ApprovedDesignation', 'ApprovedDate'],
};

export const signGalvanizingRelease = async (actor: GalvanizingActor, input: Record<string, unknown>) => withTx(actor, async (tx) => {
  const role = text(input.role, 20) as ReleaseSignRole;
  const meta = SIGN_OFFS.find((item) => item.role === role);
  if (!meta) throw new GalvanizingRuleError(422, 'Choose a sign-off.');
  if (!canSignRelease(actor, role)) fail(403, `You cannot record the ${meta.label.toLowerCase()} sign-off.`);
  const row = await one<Record<string, unknown>>(tx, `SELECT * FROM [galvanizing].[JobReleases] WHERE [Id] = @id`, [['id', sql.Int, num(input.id)]], 'Job release not found.');
  const release = mapRelease(row);
  const next = SIGN_OFFS.find((item) => !release.signOffs[item.role]);
  if (!next || next.role !== role) fail(409, 'Sign-offs are recorded in the order printed on the form.');
  const name = text(input.name, 120);
  const designation = text(input.designation, 120);
  const date = text(input.date, 20);
  if (name.length < 2) fail(422, 'Enter the name of the person signing.');
  if (!designation || !meta.designations.includes(designation as never)) fail(422, 'Choose a designation.');
  if (!date) fail(422, 'Enter the sign-off date.');
  const [nameCol, roleCol, dateCol] = SIGN_COLUMNS[role];
  await run(tx, `
    UPDATE [galvanizing].[JobReleases]
    SET [${nameCol}] = @name, [${roleCol}] = @designation, [${dateCol}] = @date, [UpdatedAt] = SYSUTCDATETIME()
    WHERE [Id] = @id
  `, [
    ['name', sql.NVarChar(120), name],
    ['designation', sql.NVarChar(120), designation],
    ['date', sql.NVarChar(20), date],
    ['id', sql.Int, release.id],
  ]);
  await audit(tx, 'release', release.id, `SIGN_${role.toUpperCase()}`, actor.name, `${name}, ${designation}`);
  let plant = '';
  if (role === 'approved' && release.jobId > 0) {
    try {
      plant = await releaseRegisteredJob(tx, actor, release.jobId, 'APPROVED', `Job release ${release.releaseOrderNo} approved by ${name}.`, true);
    } catch (error) {
      if (!(error instanceof GalvanizingRuleError)) throw error;
      plant = error.message;
    }
  }
  return plant ? `${meta.label} ${name} recorded. ${plant}` : `${meta.label} ${name} recorded.`;
});

export const revokeGalvanizingReleaseSign = async (actor: GalvanizingActor, input: Record<string, unknown>) => withTx(actor, async (tx) => {
  const role = text(input.role, 20) as ReleaseSignRole;
  const index = SIGN_OFFS.findIndex((item) => item.role === role);
  if (index < 0) fail(422, 'Choose a sign-off.');
  if (!canSignRelease(actor, role)) fail(403, 'You cannot withdraw this sign-off.');
  const row = await one<Record<string, unknown>>(tx, `SELECT * FROM [galvanizing].[JobReleases] WHERE [Id] = @id`, [['id', sql.Int, num(input.id)]], 'Job release not found.');
  const release = mapRelease(row);
  if (!release.signOffs[role]) fail(409, 'That sign-off is not recorded.');
  const clearing = SIGN_OFFS.slice(index);
  const sets = clearing.flatMap((item) => SIGN_COLUMNS[item.role].map((column) => `[${column}] = N''`)).join(', ');
  await run(tx, `UPDATE [galvanizing].[JobReleases] SET ${sets}, [UpdatedAt] = SYSUTCDATETIME() WHERE [Id] = @id`, [['id', sql.Int, release.id]]);
  await audit(tx, 'release', release.id, `REVOKE_${role.toUpperCase()}`, actor.name, release.releaseOrderNo);
  return 'Sign-off withdrawn.';
});

export const deleteGalvanizingRelease = async (actor: GalvanizingActor, input: Record<string, unknown>) => withTx(actor, async (tx) => {
  if (!canGalvanizingRelease(actor)) fail(403, 'You cannot delete a job release order.');
  const row = await one<Record<string, unknown>>(tx, `SELECT * FROM [galvanizing].[JobReleases] WHERE [Id] = @id`, [['id', sql.Int, num(input.id)]], 'Job release not found.');
  await run(tx, `DELETE FROM [galvanizing].[JobReleases] WHERE [Id] = @id`, [['id', sql.Int, Number(row.Id)]]);
  await audit(tx, 'release', Number(row.Id), 'DELETE', actor.name, text(row.ReleaseOrderNo, 40));
  return `Job Release ${text(row.ReleaseOrderNo, 40)} deleted.`;
});

const todayDate = () => new Date().toISOString().slice(0, 10);

const memoInput = (value: unknown) => {
  const memo = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    deliveryNote: text(memo.deliveryNote, 120),
    date: text(memo.date, 20),
    ticketNumber: text(memo.ticketNumber, 80),
    vehicle: text(memo.vehicle, 80),
    deliveryNumber: text(memo.deliveryNumber, 80),
    clientName: text(memo.clientName, 200),
    orderNumber: text(memo.orderNumber, 80),
    tripNo: text(memo.tripNo, 80),
    destination: text(memo.destination, 200),
    product: text(memo.product, 2000),
    driverName: text(memo.driverName, 120),
    clientSignatoryName: text(memo.clientSignatoryName, 120),
  };
};

export const saveGalvanizingMaterial = async (actor: GalvanizingActor, input: Record<string, unknown>) => withTx(actor, async (tx) => {
  if (!canGalvanizingIntake(actor) && !canGalvanizingRelease(actor)) fail(403, 'You cannot register material.');
  const dateReceived = text(input.dateReceived, 20);
  const clientName = text(input.clientName, 200);
  const items = text(input.items, 500);
  const jobNo = text(input.jobNo, 80).toUpperCase();
  const weighMethod = text(input.weighMethod, 20) === 'direct' ? 'direct' : 'weighbridge';
  if (!dateReceived) fail(422, 'Enter the date received.');
  if (dateReceived > todayDate()) fail(422, 'The date received cannot be in the future.');
  if (clientName.length < 2) fail(422, 'Enter the client name.');
  if (items.length < 2) fail(422, 'Describe the items received.');
  if (jobNo.length < 1) fail(422, 'Enter the job no./project code.');
  const id = num(input.id);
  const duplicate = await one<{ Id: number }>(tx, `SELECT [Id] FROM [galvanizing].[MaterialRegister] WHERE [JobNo] = @jobNo AND [Id] <> @id`, [['jobNo', sql.NVarChar(80), jobNo], ['id', sql.Int, id]]);
  if (duplicate) fail(409, 'This job no. is already registered.');
  let vehicleNo = '';
  let gross: number | null = null;
  let empty: number | null = null;
  let direct: number | null = null;
  if (weighMethod === 'weighbridge') {
    vehicleNo = text(input.vehicleNo, 50).toUpperCase();
    gross = optionalNum(input.grossWeight);
    empty = optionalNum(input.emptyWeight);
    if (!vehicleNo) throw new GalvanizingRuleError(422, 'Enter the vehicle registration.');
    if (gross == null) throw new GalvanizingRuleError(422, 'Enter the gross weight.');
    if (empty == null) throw new GalvanizingRuleError(422, 'Enter the empty weight.');
    if (empty >= gross) throw new GalvanizingRuleError(422, 'Empty weight must be less than the gross weight.');
  } else {
    direct = optionalNum(input.directNetWeight);
    if (!(direct && direct > 0)) fail(422, 'Enter the measured net weight.');
  }
  const noWaybill = input.noWaybill === true || text(input.noWaybill, 8).toUpperCase() === 'YES';
  const memo = noWaybill ? memoInput(input.noWaybillMemo) : memoInput(null);
  const values: SqlInput[] = [
    ['dated', sql.NVarChar(20), dateReceived],
    ['client', sql.NVarChar(200), clientName],
    ['items', sql.NVarChar(500), items],
    ['jobNo', sql.NVarChar(80), jobNo],
    ['method', sql.NVarChar(20), weighMethod],
    ['vehicle', sql.NVarChar(50), vehicleNo],
    ['gross', sql.Float, gross],
    ['empty', sql.Float, empty],
    ['direct', sql.Float, direct],
    ['noWaybill', sql.NVarChar(3), noWaybill ? 'YES' : 'NO'],
    ['note', sql.NVarChar(120), memo.deliveryNote],
    ['memoDate', sql.NVarChar(20), memo.date],
    ['ticket', sql.NVarChar(80), memo.ticketNumber],
    ['memoVehicle', sql.NVarChar(80), memo.vehicle],
    ['deliveryNo', sql.NVarChar(80), memo.deliveryNumber],
    ['memoClient', sql.NVarChar(200), memo.clientName],
    ['orderNo', sql.NVarChar(80), memo.orderNumber],
    ['trip', sql.NVarChar(80), memo.tripNo],
    ['destination', sql.NVarChar(200), memo.destination],
    ['product', sql.NVarChar(sql.MAX), memo.product],
    ['driver', sql.NVarChar(120), memo.driverName],
    ['signatory', sql.NVarChar(120), memo.clientSignatoryName],
  ];
  if (id > 0) {
    await one(tx, `SELECT [Id] FROM [galvanizing].[MaterialRegister] WHERE [Id] = @id`, [['id', sql.Int, id]], 'Material registration not found.');
    await run(tx, `
      UPDATE [galvanizing].[MaterialRegister]
      SET [DateReceived] = @dated, [ClientName] = @client, [Items] = @items, [JobNo] = @jobNo, [WeighMethod] = @method,
          [VehicleNo] = @vehicle, [GrossWeight] = @gross, [EmptyWeight] = @empty, [DirectNetWeight] = @direct, [NoWaybill] = @noWaybill,
          [DeliveryNote] = @note, [MemoDate] = @memoDate, [TicketNumber] = @ticket, [MemoVehicle] = @memoVehicle, [DeliveryNumber] = @deliveryNo,
          [MemoClientName] = @memoClient, [OrderNumber] = @orderNo, [TripNo] = @trip, [Destination] = @destination, [Product] = @product,
          [DriverName] = @driver, [ClientSignatoryName] = @signatory, [UpdatedAt] = SYSUTCDATETIME()
      WHERE [Id] = @id
    `, [...values, ['id', sql.Int, id]]);
    await audit(tx, 'material', id, 'UPDATE', actor.name, jobNo);
    return `${jobNo} updated.`;
  }
  const inserted = await run(tx, `
    INSERT INTO [galvanizing].[MaterialRegister] (
      [DateReceived], [ClientName], [Items], [JobNo], [WeighMethod], [VehicleNo], [GrossWeight], [EmptyWeight], [DirectNetWeight], [NoWaybill],
      [DeliveryNote], [MemoDate], [TicketNumber], [MemoVehicle], [DeliveryNumber], [MemoClientName], [OrderNumber], [TripNo], [Destination], [Product], [DriverName], [ClientSignatoryName]
    )
    OUTPUT INSERTED.[Id]
    VALUES (@dated, @client, @items, @jobNo, @method, @vehicle, @gross, @empty, @direct, @noWaybill, @note, @memoDate, @ticket, @memoVehicle, @deliveryNo, @memoClient, @orderNo, @trip, @destination, @product, @driver, @signatory)
  `, values);
  const createdId = Number(inserted.recordset[0].Id);
  await audit(tx, 'material', createdId, 'CREATE', actor.name, jobNo);
  return `${jobNo} registered.`;
});

export const deleteGalvanizingMaterial = async (actor: GalvanizingActor, input: Record<string, unknown>) => withTx(actor, async (tx) => {
  if (!canGalvanizingIntake(actor) && !canGalvanizingRelease(actor)) fail(403, 'You cannot delete a material registration.');
  const row = await one<Record<string, unknown>>(tx, `SELECT * FROM [galvanizing].[MaterialRegister] WHERE [Id] = @id`, [['id', sql.Int, num(input.id)]], 'Material registration not found.');
  await run(tx, `UPDATE [galvanizing].[JobReleases] SET [MaterialRegisterId] = NULL WHERE [MaterialRegisterId] = @id`, [['id', sql.Int, Number(row.Id)]]);
  await run(tx, `DELETE FROM [galvanizing].[MaterialRegister] WHERE [Id] = @id`, [['id', sql.Int, Number(row.Id)]]);
  await audit(tx, 'material', Number(row.Id), 'DELETE', actor.name, text(row.JobNo, 80));
  return `${text(row.JobNo, 80)} deleted.`;
});
