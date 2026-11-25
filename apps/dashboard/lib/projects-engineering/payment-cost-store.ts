import sql from 'mssql';
import { ensureFinanceDb } from '@/lib/finance-intelligence/store';
import { ensurePmDb } from '@/lib/projects-engineering/db';
import {
  canonicalPaymentProjectCode,
  classifyProjectPayment,
  emptyPaymentPosition,
  groupPaymentLines,
  paymentAmountNgn,
  type ProjectPaymentLine,
  type ProjectPaymentPosition,
} from '@/lib/projects-engineering/payment-cost';

const CACHE_MS = 15_000;

let cached: { at: number; map: Map<string, ProjectPaymentPosition> } | null = null;
let inflight: Promise<Map<string, ProjectPaymentPosition>> | null = null;

const compact = (value: unknown) => String(value ?? '').trim();
const clip = (value: unknown, max: number) => compact(value).slice(0, max);

const isoOrNull = (value: unknown) => {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const ENSURE_TABLE = `
IF OBJECT_ID(N'[pm].[ProjectPaymentActuals]', N'U') IS NULL
BEGIN
  CREATE TABLE [pm].[ProjectPaymentActuals](
    [RequestId] nvarchar(60) NOT NULL CONSTRAINT [PK_pm_ProjectPaymentActuals] PRIMARY KEY,
    [ProjectCode] nvarchar(80) NOT NULL,
    [RequestNumber] nvarchar(80) NOT NULL,
    [PaymentType] nvarchar(80) NULL,
    [BeneficiaryName] nvarchar(250) NULL,
    [Description] nvarchar(300) NULL,
    [ExpenseCode] nvarchar(40) NULL,
    [AmountNgn] decimal(19,4) NOT NULL,
    [CurrencyCode] nvarchar(10) NOT NULL,
    [Status] nvarchar(40) NOT NULL,
    [Kind] nvarchar(20) NOT NULL,
    [PaidAt] datetime2(0) NULL,
    [PostedAt] datetime2(0) NULL,
    [UpdatedAt] datetime2(0) NOT NULL CONSTRAINT [DF_pm_ProjectPaymentActuals_UpdatedAt] DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX [IX_pm_ProjectPaymentActuals_ProjectKind]
    ON [pm].[ProjectPaymentActuals]([ProjectCode], [Kind]) INCLUDE ([AmountNgn]);
END
`;

const toLine = (row: Record<string, unknown>): ProjectPaymentLine | null => {
  const kind = classifyProjectPayment({
    projectCode: compact(row.ProjectCode),
    status: compact(row.Status),
    paidAt: row.PaidAt ? String(row.PaidAt) : null,
  });
  if (!kind) return null;
  const amountNgn = paymentAmountNgn(Number(row.NetAmount || 0), compact(row.CurrencyCode), compact(row.PayloadJson) || null);
  if (amountNgn <= 0) return null;
  return {
    requestId: compact(row.RequestId),
    requestNumber: compact(row.RequestNumber),
    projectCode: canonicalPaymentProjectCode(row.ProjectCode),
    paymentType: clip(row.PaymentType, 80),
    beneficiaryName: clip(row.BeneficiaryName, 250),
    description: clip(row.Description, 300),
    expenseCode: clip(row.ExpenseCode, 40),
    amountNgn,
    currencyCode: (compact(row.CurrencyCode) || 'NGN').slice(0, 10).toUpperCase(),
    status: clip(row.Status, 40),
    kind,
    paidAt: isoOrNull(row.PaidAt),
    postedAt: isoOrNull(row.PostedAt),
  };
};

const replaceLedger = async (pool: sql.ConnectionPool, lines: ProjectPaymentLine[]) => {
  await pool.request()
    .input('Payload', sql.NVarChar(sql.MAX), JSON.stringify(lines))
    .query(`
DELETE FROM [pm].[ProjectPaymentActuals];
INSERT INTO [pm].[ProjectPaymentActuals] (
  [RequestId], [ProjectCode], [RequestNumber], [PaymentType], [BeneficiaryName], [Description], [ExpenseCode],
  [AmountNgn], [CurrencyCode], [Status], [Kind], [PaidAt], [PostedAt]
)
SELECT [requestId], [projectCode], [requestNumber], [paymentType], [beneficiaryName], [description], [expenseCode],
       [amountNgn], [currencyCode], [status], [kind], [paidAt], [postedAt]
FROM OPENJSON(@Payload) WITH (
  [requestId] nvarchar(60) '$.requestId',
  [projectCode] nvarchar(80) '$.projectCode',
  [requestNumber] nvarchar(80) '$.requestNumber',
  [paymentType] nvarchar(80) '$.paymentType',
  [beneficiaryName] nvarchar(250) '$.beneficiaryName',
  [description] nvarchar(300) '$.description',
  [expenseCode] nvarchar(40) '$.expenseCode',
  [amountNgn] decimal(19,4) '$.amountNgn',
  [currencyCode] nvarchar(10) '$.currencyCode',
  [status] nvarchar(40) '$.status',
  [kind] nvarchar(20) '$.kind',
  [paidAt] datetime2(0) '$.paidAt',
  [postedAt] datetime2(0) '$.postedAt'
);
`);
};

const readAndSync = async () => {
  await ensurePmDb();
  const pool = await ensureFinanceDb();
  if (!pool) return new Map<string, ProjectPaymentPosition>();
  await pool.request().query(ENSURE_TABLE);
  const result = await pool.request().query(`
SELECT [RequestId], [RequestNumber], [PaymentType], [BeneficiaryName], [Description], [ExpenseCode],
       [NetAmount], [CurrencyCode], [ProjectCode], [Status], [PaidAt], [PostedAt], [PayloadJson]
FROM [finance].[PaymentRequests]
WHERE NULLIF(LTRIM(RTRIM([ProjectCode])), N'') IS NOT NULL
`);
  const lines = (result.recordset as Record<string, unknown>[]).map(toLine).filter((line): line is ProjectPaymentLine => Boolean(line));
  try {
    await replaceLedger(pool, lines);
  } catch (error) {
    console.error('[project-payments] ledger persist failed', error);
  }
  const map = groupPaymentLines(lines);
  cached = { at: Date.now(), map };
  return map;
};

/** Drop the in-memory snapshot so the next read reloads finance payments. */
export const invalidateProjectPaymentCosts = () => {
  cached = null;
};

/** Reload project payment actuals and open commitments from finance, then persist them. */
export const refreshProjectPaymentCosts = async () => {
  invalidateProjectPaymentCosts();
  if (!inflight) {
    inflight = readAndSync().finally(() => {
      inflight = null;
    });
  }
  return inflight;
};

export const loadProjectPaymentPositions = async () => {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.map;
  if (!inflight) {
    inflight = readAndSync().finally(() => {
      inflight = null;
    });
  }
  return inflight;
};

export const paymentPositionForProject = async (projectCode: string) => {
  const code = canonicalPaymentProjectCode(projectCode);
  const map = await loadProjectPaymentPositions();
  return map.get(code) || emptyPaymentPosition(code);
};
