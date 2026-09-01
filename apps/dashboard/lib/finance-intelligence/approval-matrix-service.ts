import sql from 'mssql';
import { ensureFinanceDb } from '@/lib/finance-intelligence/store';

export type ApprovalRuleStatus = 'Active' | 'Draft' | 'Pending' | 'Inactive';
export type ApprovalPathType = 'Non-project' | 'Project';

export type ApprovalMatrixRule = {
  matrixId: string;
  ruleName: string;
  /** Always Employee Payment for limit routing — payment type no longer splits limits. */
  paymentType: string;
  pathType: ApprovalPathType;
  companyCode: string;
  entityName: string;
  minAmount: number;
  maxAmount: number | null;
  approvalLevel: number;
  approverRoles: string;
  currencyCode: string;
  dualControl: boolean;
  status: ApprovalRuleStatus;
  isActive: boolean;
  stages: string[];
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
};

export type ApprovalMatrixWorkspace = {
  generatedAt: string;
  source: string;
  summary: {
    pathTypes: number;
    activeRules: number;
    approvalLevels: number;
    pendingChanges: number;
    coveragePct: number;
    dualControlRules: number;
    companyCoveragePct: number;
    compliancePct: number;
    nonProjectRules: number;
    projectRules: number;
    bandGaps: number;
    bandOverlaps: number;
  };
  /** Policy / coverage warnings for operators (empty when healthy). */
  warnings: string[];
  rules: ApprovalMatrixRule[];
  audit: Array<{ auditId: string; matrixId: string; actionType: string; actorName: string; createdAt: string; detail: string }>;
  fxRates: Array<{ fromCurrency: string; toCurrency: string; rateDate: string; rate: number; source: string }>;
};

export type UpsertApprovalRuleInput = {
  matrixId?: string;
  ruleName: string;
  pathType: ApprovalPathType;
  paymentType?: string;
  companyCode?: string;
  entityName?: string;
  minAmount: number;
  maxAmount?: number | null;
  approvalLevel: number;
  approverRoles: string;
  currencyCode?: string;
  dualControl?: boolean;
  status?: ApprovalRuleStatus;
  stages?: string[];
  actor: string;
};

export type ApprovalChainResolution = {
  pathType: ApprovalPathType;
  amountOriginal: number;
  currencyCode: string;
  amountNgn: number;
  fxRate: number;
  fxRateDate: string;
  fxSource: string;
  stages: string[];
  currentStage: string;
  approvalLevel: number;
  ruleName: string;
  matrixId: string;
};

const compact = (value: unknown) => String(value ?? '').trim();
const nowIso = () => new Date().toISOString();
const moneyRound = (value: number) => Math.round(value * 10000) / 10000;
/** NGN matching uses kobo (2dp) so 200000.01 bands stay stable across JS/SQL. */
const moneyRound2 = (value: number) => Math.round(Number(value || 0) * 100) / 100;

const FALLBACK_FX: Record<string, number> = {
  NGN: 1,
  USD: 1360,
  EUR: 1580,
  GBP: 1830,
};

/** In-flight seed de-dupe so concurrent page loads do not race MERGE. */
let seedInFlight: Promise<ApprovalMatrixWorkspace> | null = null;

const amountInBand = (amountNgn: number, minAmount: number, maxAmount: number | null) => {
  const amount = moneyRound2(amountNgn);
  const min = moneyRound2(minAmount);
  const max = maxAmount == null ? null : moneyRound2(maxAmount);
  return amount >= min && (max == null || amount <= max);
};

const bandsOverlap = (
  aMin: number,
  aMax: number | null,
  bMin: number,
  bMax: number | null,
) => {
  const aLo = moneyRound2(aMin);
  const bLo = moneyRound2(bMin);
  const aHi = aMax == null ? Number.POSITIVE_INFINITY : moneyRound2(aMax);
  const bHi = bMax == null ? Number.POSITIVE_INFINITY : moneyRound2(bMax);
  return aLo <= bHi && bLo <= aHi;
};

const analyzeBandCoverage = (rules: ApprovalMatrixRule[]) => {
  const warnings: string[] = [];
  let bandGaps = 0;
  let bandOverlaps = 0;
  const paths: ApprovalPathType[] = ['Non-project', 'Project'];

  for (const pathType of paths) {
    const sorted = rules
      .filter((rule) => rule.pathType === pathType && rule.isActive && rule.status === 'Active')
      .sort((a, b) => moneyRound2(a.minAmount) - moneyRound2(b.minAmount) || a.approvalLevel - b.approvalLevel);

    if (!sorted.length) {
      warnings.push(`${pathType} path has no active limit bands.`);
      continue;
    }

    if (moneyRound2(sorted[0].minAmount) > 0) {
      bandGaps += 1;
      warnings.push(`${pathType}: coverage gap below ${moneyRound2(sorted[0].minAmount).toLocaleString('en-NG')} NGN.`);
    }

    for (let i = 0; i < sorted.length; i += 1) {
      const current = sorted[i];
      for (let j = i + 1; j < sorted.length; j += 1) {
        const other = sorted[j];
        if (bandsOverlap(current.minAmount, current.maxAmount, other.minAmount, other.maxAmount)) {
          bandOverlaps += 1;
          warnings.push(`${pathType}: overlapping bands ${current.ruleName} and ${other.ruleName}.`);
        }
      }
      if (i === sorted.length - 1) {
        if (current.maxAmount != null) {
          bandGaps += 1;
          warnings.push(`${pathType}: no open-ended band above ${moneyRound2(current.maxAmount).toLocaleString('en-NG')} NGN.`);
        }
        continue;
      }
      const next = sorted[i + 1];
      if (current.maxAmount == null) {
        bandOverlaps += 1;
        warnings.push(`${pathType}: open-ended band ${current.ruleName} leaves later band ${next.ruleName} unreachable.`);
        continue;
      }
      const expectedNext = moneyRound2(moneyRound2(current.maxAmount) + 0.01);
      if (moneyRound2(next.minAmount) > expectedNext) {
        bandGaps += 1;
        warnings.push(
          `${pathType}: gap between ${moneyRound2(current.maxAmount).toLocaleString('en-NG')} and ${moneyRound2(next.minAmount).toLocaleString('en-NG')} NGN.`,
        );
      }
    }
  }

  return { warnings, bandGaps, bandOverlaps };
};

const normalizePathType = (value: unknown): ApprovalPathType => {
  const text = compact(value);
  // Must check Non-project before /project/ — otherwise "Non-project" matches as Project.
  if (/non[-\s]?project/i.test(text)) return 'Non-project';
  if (/^project$/i.test(text)) return 'Project';
  return 'Non-project';
};

const parseStages = (row: Record<string, unknown>) => {
  let stages: string[] = [];
  try {
    const parsed = JSON.parse(String(row.StagesJson || '[]'));
    stages = Array.isArray(parsed) ? parsed.map((item) => compact(item)).filter(Boolean) : [];
  } catch {
    stages = [];
  }
  if (!stages.length && compact(row.ApproverRoles)) {
    stages = compact(row.ApproverRoles).split(/→|,/).map((item) => item.trim()).filter(Boolean);
  }
  return stages;
};

const mapRule = (row: Record<string, unknown>): ApprovalMatrixRule => {
  const stages = parseStages(row);
  return {
    matrixId: compact(row.MatrixId),
    ruleName: compact(row.RuleName) || compact(row.MatrixId),
    paymentType: compact(row.PaymentType) || 'Employee Payment',
    pathType: normalizePathType(compact(row.PathType) || 'Non-project'),
    companyCode: compact(row.CompanyCode) || 'DLE',
    entityName: compact(row.EntityName) || 'Dorman Long Nigeria Ltd',
    minAmount: Number(row.MinAmount || 0),
    maxAmount: row.MaxAmount == null ? null : Number(row.MaxAmount),
    approvalLevel: Number(row.ApprovalLevel || stages.length || 1),
    approverRoles: compact(row.ApproverRoles) || stages.join(' → '),
    currencyCode: compact(row.CurrencyCode) || 'NGN',
    dualControl: Boolean(row.DualControl),
    status: (compact(row.Status) as ApprovalRuleStatus) || (row.IsActive ? 'Active' : 'Inactive'),
    isActive: row.IsActive == null ? true : Boolean(row.IsActive),
    stages,
    createdBy: compact(row.CreatedBy),
    updatedBy: compact(row.UpdatedBy),
    createdAt: row.CreatedAt ? new Date(String(row.CreatedAt)).toISOString() : nowIso(),
    updatedAt: row.UpdatedAt ? new Date(String(row.UpdatedAt)).toISOString() : nowIso(),
  };
};

const emptyWorkspace = (): ApprovalMatrixWorkspace => ({
  generatedAt: nowIso(),
  source: 'DLE Enterprise · finance.ApprovalMatrix',
  summary: {
    pathTypes: 0,
    activeRules: 0,
    approvalLevels: 0,
    pendingChanges: 0,
    coveragePct: 0,
    dualControlRules: 0,
    companyCoveragePct: 0,
    compliancePct: 0,
    nonProjectRules: 0,
    projectRules: 0,
    bandGaps: 0,
    bandOverlaps: 0,
  },
  warnings: [],
  rules: [],
  audit: [],
  fxRates: [],
});

/** Standard DLE employee-payment approval bands (Cash Advance + Supplier Invoice). */
export const DEFAULT_APPROVAL_LIMIT_RULES: Array<Omit<UpsertApprovalRuleInput, 'actor'> & { matrixId: string }> = [
  {
    matrixId: 'LIM-NONPROJ-200K',
    ruleName: 'NONPROJ_LE_200K',
    pathType: 'Non-project',
    minAmount: 0,
    maxAmount: 200000,
    approvalLevel: 2,
    stages: ['Reporting Manager', 'Finance Manager'],
    approverRoles: 'Reporting Manager → Finance Manager',
    status: 'Active',
  },
  {
    matrixId: 'LIM-NONPROJ-1M',
    ruleName: 'NONPROJ_LE_1M',
    pathType: 'Non-project',
    minAmount: 200000.01,
    maxAmount: 1000000,
    approvalLevel: 3,
    stages: ['Reporting Manager', 'Finance Manager', 'CFO'],
    approverRoles: 'Reporting Manager → Finance Manager → CFO',
    status: 'Active',
  },
  {
    matrixId: 'LIM-NONPROJ-OPEN',
    ruleName: 'NONPROJ_GT_1M',
    pathType: 'Non-project',
    minAmount: 1000000.01,
    maxAmount: null,
    approvalLevel: 4,
    stages: ['Reporting Manager', 'Finance Manager', 'CFO', 'MD/CEO'],
    approverRoles: 'Reporting Manager → Finance Manager → CFO → MD/CEO',
    status: 'Active',
  },
  {
    matrixId: 'LIM-PROJ-200K',
    ruleName: 'PROJ_LE_200K',
    pathType: 'Project',
    minAmount: 0,
    maxAmount: 200000,
    approvalLevel: 4,
    stages: ['Reporting Manager', 'Project Manager', 'Cost Controller', 'Finance Manager'],
    approverRoles: 'Reporting Manager → Project Manager → Cost Controller → Finance Manager',
    status: 'Active',
  },
  {
    matrixId: 'LIM-PROJ-5M',
    ruleName: 'PROJ_LE_5M',
    pathType: 'Project',
    minAmount: 200000.01,
    maxAmount: 5000000,
    approvalLevel: 6,
    stages: ['Reporting Manager', 'Project Manager', 'Cost Controller', 'Finance Manager', 'GM', 'CFO'],
    approverRoles: 'Reporting Manager → Project Manager → Cost Controller → Finance Manager → GM → CFO',
    status: 'Active',
  },
  {
    matrixId: 'LIM-PROJ-OPEN',
    ruleName: 'PROJ_GT_5M',
    pathType: 'Project',
    minAmount: 5000000.01,
    maxAmount: null,
    approvalLevel: 7,
    stages: ['Reporting Manager', 'Project Manager', 'Cost Controller', 'Finance Manager', 'GM', 'CFO', 'MD/CEO'],
    approverRoles: 'Reporting Manager → Project Manager → Cost Controller → Finance Manager → GM → CFO → MD/CEO',
    status: 'Active',
  },
];

const writeAudit = async (input: {
  matrixId?: string;
  actionType: string;
  actorName: string;
  detail?: Record<string, unknown>;
}) => {
  const pool = await ensureFinanceDb().catch(() => null);
  if (!pool) return;
  try {
    await pool.request()
      .input('AuditId', sql.NVarChar(60), `AMA-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`)
      .input('MatrixId', sql.NVarChar(60), input.matrixId || null)
      .input('ActionType', sql.NVarChar(40), input.actionType)
      .input('ActorName', sql.NVarChar(200), input.actorName)
      .input('DetailJson', sql.NVarChar(sql.MAX), JSON.stringify(input.detail || {}))
      .query(`
INSERT INTO [finance].[ApprovalMatrixAudit] ([AuditId], [MatrixId], [ActionType], [ActorName], [DetailJson])
VALUES (@AuditId, @MatrixId, @ActionType, @ActorName, @DetailJson)
`);
  } catch {
    // best-effort
  }
};

const isPlaceholderProjectCode = (value: string) =>
  /^(n\/?a|none|nil|null|—|-|no project|unassigned)$/i.test(value);

/**
 * Project path only when a real project is selected on the request
 * (or an explicit test flag). Department name is not enough — staff in the
 * PROJECT department can still raise overhead cash advances with no project.
 */
export const isProjectPaymentPath = (input: {
  department?: string | null;
  projectCode?: string | null;
  projectDepartment?: boolean;
}) => {
  if (input.projectDepartment) return true;
  const projectCode = compact(input.projectCode);
  if (!projectCode || isPlaceholderProjectCode(projectCode)) return false;
  return true;
};

export const getPrevailingFxRate = async (fromCurrency: string, rateDate = new Date()) => {
  const from = compact(fromCurrency).toUpperCase() || 'NGN';
  if (from === 'NGN') {
    return { fromCurrency: 'NGN', toCurrency: 'NGN', rate: 1, rateDate: rateDate.toISOString().slice(0, 10), source: 'Identity' };
  }

  // Keep finance.FxRates current from live market providers (USD/EUR/GBP → NGN).
  try {
    const { ensureLiveFxRates } = await import('@/lib/finance-intelligence/fx-rates-service');
    await ensureLiveFxRates();
  } catch (error) {
    console.warn('[approval-limits] live FX sync skipped', error);
  }

  const pool = await ensureFinanceDb().catch(() => null);
  if (pool) {
    try {
      const result = await pool.request()
        .input('from', sql.NVarChar(10), from)
        .input('onDate', sql.Date, rateDate)
        .query(`
SELECT TOP 1 [FromCurrency], [ToCurrency], [RateDate], [Rate], [Source]
FROM [finance].[FxRates]
WHERE [FromCurrency] = @from
  AND [ToCurrency] = N'NGN'
  AND [RateDate] <= @onDate
  AND ([Source] IS NULL OR [Source] NOT LIKE N'%seed%')
ORDER BY [RateDate] DESC
`);
      const row = result.recordset?.[0] as Record<string, unknown> | undefined;
      if (row && Number(row.Rate || 0) > 0) {
        return {
          fromCurrency: compact(row.FromCurrency),
          toCurrency: compact(row.ToCurrency) || 'NGN',
          rate: Number(row.Rate || 0),
          rateDate: row.RateDate ? new Date(String(row.RateDate)).toISOString().slice(0, 10) : rateDate.toISOString().slice(0, 10),
          source: compact(row.Source) || 'finance.FxRates',
        };
      }

      // Last resort: any stored rate including legacy seed if live sync failed.
      const anyRate = await pool.request()
        .input('from', sql.NVarChar(10), from)
        .input('onDate', sql.Date, rateDate)
        .query(`
SELECT TOP 1 [FromCurrency], [ToCurrency], [RateDate], [Rate], [Source]
FROM [finance].[FxRates]
WHERE [FromCurrency] = @from
  AND [ToCurrency] = N'NGN'
  AND [RateDate] <= @onDate
ORDER BY [RateDate] DESC
`);
      const fallbackRow = anyRate.recordset?.[0] as Record<string, unknown> | undefined;
      if (fallbackRow && Number(fallbackRow.Rate || 0) > 0) {
        return {
          fromCurrency: compact(fallbackRow.FromCurrency),
          toCurrency: compact(fallbackRow.ToCurrency) || 'NGN',
          rate: Number(fallbackRow.Rate || 0),
          rateDate: fallbackRow.RateDate ? new Date(String(fallbackRow.RateDate)).toISOString().slice(0, 10) : rateDate.toISOString().slice(0, 10),
          source: compact(fallbackRow.Source) || 'finance.FxRates',
        };
      }
    } catch {
      // fall through
    }
  }

  return {
    fromCurrency: from,
    toCurrency: 'NGN',
    rate: FALLBACK_FX[from] || 1,
    rateDate: rateDate.toISOString().slice(0, 10),
    source: 'Fallback seed rate',
  };
};

export const convertAmountToNgn = async (amount: number, currencyCode?: string) => {
  const currency = compact(currencyCode || 'NGN').toUpperCase();
  const fx = await getPrevailingFxRate(currency);
  if (!(fx.rate > 0)) throw new Error(`No prevailing FX rate available for ${currency}.`);
  return {
    amountOriginal: moneyRound(Number(amount || 0)),
    currencyCode: currency,
    amountNgn: moneyRound(Number(amount || 0) * fx.rate),
    fxRate: fx.rate,
    fxRateDate: fx.rateDate,
    fxSource: fx.source,
  };
};

export const listApprovalMatrixRules = async (): Promise<ApprovalMatrixRule[]> => {
  const pool = await ensureFinanceDb().catch(() => null);
  if (!pool) return [];
  try {
    // Ensure PathType exists in its own batch before any ORDER BY / MERGE that references it.
    await pool.request().query(`
IF OBJECT_ID(N'[finance].[ApprovalMatrix]', N'U') IS NOT NULL
 AND COL_LENGTH(N'finance.ApprovalMatrix', N'PathType') IS NULL
  ALTER TABLE [finance].[ApprovalMatrix] ADD [PathType] NVARCHAR(40) NULL;
`);
    const result = await pool.request().query(`
SELECT *
FROM [finance].[ApprovalMatrix]
ORDER BY COALESCE([PathType], N'Non-project'), [ApprovalLevel], [MinAmount]
`);
    return (result.recordset || []).map((row: Record<string, unknown>) => mapRule(row));
  } catch (error) {
    console.error('[approval-limits] listApprovalMatrixRules failed', error);
    return [];
  }
};

export const seedDefaultApprovalLimits = async (actor = 'System Seed') => {
  if (seedInFlight) return seedInFlight;

  seedInFlight = (async () => {
    const pool = await ensureFinanceDb();
    if (!pool) throw new Error('Finance database is unavailable.');

    // Separate batch from MERGE so SQL Server can see the new column.
    await pool.request().query(`
IF OBJECT_ID(N'[finance].[ApprovalMatrix]', N'U') IS NULL
BEGIN
  CREATE TABLE [finance].[ApprovalMatrix] (
    [MatrixId] NVARCHAR(60) NOT NULL CONSTRAINT [PK_FinanceApprovalMatrix_Seed] PRIMARY KEY,
    [RuleName] NVARCHAR(80) NOT NULL,
    [PaymentType] NVARCHAR(80) NOT NULL,
    [PathType] NVARCHAR(40) NULL,
    [CompanyCode] NVARCHAR(40) NULL,
    [EntityName] NVARCHAR(200) NULL,
    [MinAmount] DECIMAL(19,4) NOT NULL CONSTRAINT [DF_FinanceMatrix_Min_Seed] DEFAULT 0,
    [MaxAmount] DECIMAL(19,4) NULL,
    [ApprovalLevel] INT NOT NULL CONSTRAINT [DF_FinanceMatrix_Level_Seed] DEFAULT 1,
    [ApproverRoles] NVARCHAR(250) NOT NULL,
    [StagesJson] NVARCHAR(MAX) NULL,
    [CurrencyCode] NVARCHAR(10) NOT NULL CONSTRAINT [DF_FinanceMatrix_Currency_Seed] DEFAULT N'NGN',
    [DualControl] BIT NOT NULL CONSTRAINT [DF_FinanceMatrix_Dual_Seed] DEFAULT 0,
    [Status] NVARCHAR(40) NOT NULL CONSTRAINT [DF_FinanceMatrix_Status_Seed] DEFAULT N'Active',
    [IsActive] BIT NOT NULL CONSTRAINT [DF_FinanceMatrix_Active_Seed] DEFAULT 1,
    [CreatedBy] NVARCHAR(120) NULL,
    [UpdatedBy] NVARCHAR(120) NULL,
    [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_FinanceMatrix_CreatedAt_Seed] DEFAULT SYSUTCDATETIME(),
    [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_FinanceMatrix_UpdatedAt_Seed] DEFAULT SYSUTCDATETIME()
  );
END
ELSE
BEGIN
  IF COL_LENGTH(N'finance.ApprovalMatrix', N'PathType') IS NULL
    ALTER TABLE [finance].[ApprovalMatrix] ADD [PathType] NVARCHAR(40) NULL;
  IF COL_LENGTH(N'finance.ApprovalMatrix', N'StagesJson') IS NULL
    ALTER TABLE [finance].[ApprovalMatrix] ADD [StagesJson] NVARCHAR(MAX) NULL;
  IF COL_LENGTH(N'finance.ApprovalMatrix', N'RuleName') IS NULL
    ALTER TABLE [finance].[ApprovalMatrix] ADD [RuleName] NVARCHAR(80) NULL;
END
`);

    // Single MERGE keeps seeding idempotent and concurrency-safe under PK MatrixId.
    await pool.request()
      .input('Actor', sql.NVarChar(120), actor)
      .query(`
MERGE [finance].[ApprovalMatrix] AS target
USING (VALUES
  (N'LIM-NONPROJ-200K', N'NONPROJ_LE_200K', N'Employee Payment', N'Non-project', CAST(0 AS DECIMAL(19,4)), CAST(200000 AS DECIMAL(19,4)), 2,
   N'Reporting Manager → Finance Manager',
   N'["Reporting Manager","Finance Manager"]'),
  (N'LIM-NONPROJ-1M', N'NONPROJ_LE_1M', N'Employee Payment', N'Non-project', CAST(200000.01 AS DECIMAL(19,4)), CAST(1000000 AS DECIMAL(19,4)), 3,
   N'Reporting Manager → Finance Manager → CFO',
   N'["Reporting Manager","Finance Manager","CFO"]'),
  (N'LIM-NONPROJ-OPEN', N'NONPROJ_GT_1M', N'Employee Payment', N'Non-project', CAST(1000000.01 AS DECIMAL(19,4)), CAST(NULL AS DECIMAL(19,4)), 4,
   N'Reporting Manager → Finance Manager → CFO → MD/CEO',
   N'["Reporting Manager","Finance Manager","CFO","MD/CEO"]'),
  (N'LIM-PROJ-200K', N'PROJ_LE_200K', N'Employee Payment', N'Project', CAST(0 AS DECIMAL(19,4)), CAST(200000 AS DECIMAL(19,4)), 4,
   N'Reporting Manager → Project Manager → Cost Controller → Finance Manager',
   N'["Reporting Manager","Project Manager","Cost Controller","Finance Manager"]'),
  (N'LIM-PROJ-5M', N'PROJ_LE_5M', N'Employee Payment', N'Project', CAST(200000.01 AS DECIMAL(19,4)), CAST(5000000 AS DECIMAL(19,4)), 6,
   N'Reporting Manager → Project Manager → Cost Controller → Finance Manager → GM → CFO',
   N'["Reporting Manager","Project Manager","Cost Controller","Finance Manager","GM","CFO"]'),
  (N'LIM-PROJ-OPEN', N'PROJ_GT_5M', N'Employee Payment', N'Project', CAST(5000000.01 AS DECIMAL(19,4)), CAST(NULL AS DECIMAL(19,4)), 7,
   N'Reporting Manager → Project Manager → Cost Controller → Finance Manager → GM → CFO → MD/CEO',
   N'["Reporting Manager","Project Manager","Cost Controller","Finance Manager","GM","CFO","MD/CEO"]')
) AS source (
  [MatrixId], [RuleName], [PaymentType], [PathType], [MinAmount], [MaxAmount], [ApprovalLevel], [ApproverRoles], [StagesJson]
)
ON target.[MatrixId] = source.[MatrixId]
WHEN MATCHED THEN UPDATE SET
  [RuleName] = source.[RuleName],
  [PaymentType] = source.[PaymentType],
  [PathType] = source.[PathType],
  [CompanyCode] = N'DLE',
  [EntityName] = N'Dorman Long Nigeria Ltd',
  [MinAmount] = source.[MinAmount],
  [MaxAmount] = source.[MaxAmount],
  [ApprovalLevel] = source.[ApprovalLevel],
  [ApproverRoles] = source.[ApproverRoles],
  [StagesJson] = source.[StagesJson],
  [CurrencyCode] = N'NGN',
  [DualControl] = 0,
  [Status] = N'Active',
  [IsActive] = 1,
  [UpdatedBy] = @Actor,
  [UpdatedAt] = SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT (
  [MatrixId], [RuleName], [PaymentType], [PathType], [CompanyCode], [EntityName], [MinAmount], [MaxAmount],
  [ApprovalLevel], [ApproverRoles], [StagesJson], [CurrencyCode], [DualControl], [Status], [IsActive], [CreatedBy], [UpdatedBy]
) VALUES (
  source.[MatrixId], source.[RuleName], source.[PaymentType], source.[PathType], N'DLE', N'Dorman Long Nigeria Ltd',
  source.[MinAmount], source.[MaxAmount], source.[ApprovalLevel], source.[ApproverRoles], source.[StagesJson],
  N'NGN', 0, N'Active', 1, @Actor, @Actor
);
`);

    await writeAudit({
      actionType: 'Seeded',
      actorName: actor,
      detail: {
        count: DEFAULT_APPROVAL_LIMIT_RULES.length,
        rules: DEFAULT_APPROVAL_LIMIT_RULES.map((rule) => rule.ruleName),
      },
    });

    return buildApprovalMatrixWorkspace({ autoSeed: false });
  })().finally(() => {
    seedInFlight = null;
  });

  return seedInFlight;
};

export const buildApprovalMatrixWorkspace = async (options?: {
  autoSeed?: boolean;
}): Promise<ApprovalMatrixWorkspace> => {
  let rules = await listApprovalMatrixRules();
  if (!rules.length && options?.autoSeed !== false) {
    const pool = await ensureFinanceDb().catch(() => null);
    if (pool) {
      try {
        await seedDefaultApprovalLimits('System Auto-Seed');
        rules = await listApprovalMatrixRules();
      } catch (error) {
        console.error('[approval-limits] auto-seed failed', error);
      }
    }
  }
  const workspace = emptyWorkspace();
  workspace.rules = rules;
  workspace.generatedAt = nowIso();

  const active = rules.filter((rule) => rule.isActive && rule.status === 'Active');
  const pending = rules.filter((rule) => rule.status === 'Pending' || rule.status === 'Draft');
  const paths = new Set(rules.map((rule) => rule.pathType).filter(Boolean));
  const levels = new Set(rules.map((rule) => rule.approvalLevel).filter((level) => level > 0));
  const dual = rules.filter((rule) => rule.dualControl);
  const nonProject = rules.filter((rule) => rule.pathType === 'Non-project');
  const project = rules.filter((rule) => rule.pathType === 'Project');
  const requiredPaths: ApprovalPathType[] = ['Non-project', 'Project'];
  const covered = requiredPaths.filter((path) => paths.has(path)).length;

  workspace.summary = {
    pathTypes: paths.size,
    activeRules: active.length,
    approvalLevels: levels.size,
    pendingChanges: pending.length,
    coveragePct: requiredPaths.length ? Math.round((covered / requiredPaths.length) * 100) : 0,
    dualControlRules: dual.length,
    companyCoveragePct: rules.length ? 100 : 0,
    compliancePct: rules.length && pending.length === 0 ? 100 : rules.length ? Math.max(0, 100 - pending.length * 5) : 0,
    nonProjectRules: nonProject.length,
    projectRules: project.length,
    bandGaps: 0,
    bandOverlaps: 0,
  };

  const coverage = analyzeBandCoverage(active);
  workspace.summary.bandGaps = coverage.bandGaps;
  workspace.summary.bandOverlaps = coverage.bandOverlaps;
  workspace.warnings = coverage.warnings;
  if (workspace.summary.bandGaps || workspace.summary.bandOverlaps) {
    workspace.summary.compliancePct = Math.max(
      0,
      workspace.summary.compliancePct - (workspace.summary.bandGaps + workspace.summary.bandOverlaps) * 10,
    );
  }

  const pool = await ensureFinanceDb().catch(() => null);
  if (pool) {
    try {
      const audit = await pool.request().query(`
SELECT TOP 50 [AuditId], [MatrixId], [ActionType], [ActorName], [DetailJson], [CreatedAt]
FROM [finance].[ApprovalMatrixAudit]
ORDER BY [CreatedAt] DESC
`);
      workspace.audit = (audit.recordset || []).map((row: Record<string, unknown>) => ({
        auditId: compact(row.AuditId),
        matrixId: compact(row.MatrixId),
        actionType: compact(row.ActionType),
        actorName: compact(row.ActorName),
        createdAt: row.CreatedAt ? new Date(String(row.CreatedAt)).toISOString() : nowIso(),
        detail: compact(row.DetailJson),
      }));
    } catch {
      workspace.audit = [];
    }

    try {
      const { ensureLiveFxRates } = await import('@/lib/finance-intelligence/fx-rates-service');
      await ensureLiveFxRates().catch((error) => console.warn('[approval-limits] FX sync for workspace failed', error));
      const fx = await pool.request().query(`
SELECT TOP 20 [FromCurrency], [ToCurrency], [RateDate], [Rate], [Source]
FROM [finance].[FxRates]
WHERE [RateDate] = (SELECT MAX([RateDate]) FROM [finance].[FxRates])
ORDER BY [FromCurrency]
`);
      workspace.fxRates = (fx.recordset || []).map((row: Record<string, unknown>) => ({
        fromCurrency: compact(row.FromCurrency),
        toCurrency: compact(row.ToCurrency) || 'NGN',
        rateDate: row.RateDate ? new Date(String(row.RateDate)).toISOString().slice(0, 10) : '',
        rate: Number(row.Rate || 0),
        source: compact(row.Source),
      }));
    } catch {
      workspace.fxRates = [];
    }
  }

  return workspace;
};

export const upsertApprovalMatrixRule = async (input: UpsertApprovalRuleInput) => {
  const ruleName = compact(input.ruleName);
  const pathType = normalizePathType(input.pathType);
  const stages = (input.stages?.length ? input.stages : compact(input.approverRoles).split(/→|,/).map((item) => item.trim()).filter(Boolean))
    .map((item) => compact(item))
    .filter(Boolean);
  const approverRoles = compact(input.approverRoles) || stages.join(' → ');
  const minAmount = moneyRound2(Number(input.minAmount || 0));
  const maxAmount = input.maxAmount == null || String(input.maxAmount).trim() === ''
    ? null
    : moneyRound2(Number(input.maxAmount));
  if (maxAmount != null && Number.isNaN(maxAmount)) {
    throw new Error('To amount is invalid.');
  }

  if (!ruleName) throw new Error('Rule name is required.');
  if (!pathType) throw new Error('Path type is required (Non-project or Project).');
  if (!stages.length) throw new Error('At least one approval stage / approver role is required.');
  if (!(minAmount >= 0)) throw new Error('From amount must be zero or greater.');
  if (maxAmount != null && maxAmount < minAmount) {
    throw new Error('To amount must be greater than or equal to from amount.');
  }

  const pool = await ensureFinanceDb();
  if (!pool) throw new Error('Finance database is unavailable.');

  const matrixId = compact(input.matrixId) || `AMX-${Date.now()}`;
  const status = input.status || 'Active';
  const isActive = status === 'Active' ? 1 : 0;
  const paymentType = 'Employee Payment';

  if (status === 'Active') {
    const existing = await listApprovalMatrixRules();
    const conflict = existing.find((rule) => (
      rule.matrixId !== matrixId
      && rule.pathType === pathType
      && rule.isActive
      && rule.status === 'Active'
      && bandsOverlap(minAmount, maxAmount, rule.minAmount, rule.maxAmount)
    ));
    if (conflict) {
      throw new Error(
        `Amount band overlaps active rule ${conflict.ruleName} (${conflict.pathType}). Adjust From/To amounts or deactivate the other rule.`,
      );
    }
  }

  await pool.request()
    .input('MatrixId', sql.NVarChar(60), matrixId)
    .input('RuleName', sql.NVarChar(80), ruleName)
    .input('PaymentType', sql.NVarChar(80), paymentType)
    .input('PathType', sql.NVarChar(40), pathType)
    .input('CompanyCode', sql.NVarChar(40), compact(input.companyCode) || 'DLE')
    .input('EntityName', sql.NVarChar(200), compact(input.entityName) || 'Dorman Long Nigeria Ltd')
    .input('MinAmount', sql.Decimal(19, 4), minAmount)
    .input('MaxAmount', sql.Decimal(19, 4), maxAmount)
    .input('ApprovalLevel', sql.Int, Number(input.approvalLevel || stages.length || 1))
    .input('ApproverRoles', sql.NVarChar(250), approverRoles)
    .input('StagesJson', sql.NVarChar(sql.MAX), JSON.stringify(stages))
    .input('CurrencyCode', sql.NVarChar(10), compact(input.currencyCode) || 'NGN')
    .input('DualControl', sql.Bit, input.dualControl ? 1 : 0)
    .input('Status', sql.NVarChar(40), status)
    .input('IsActive', sql.Bit, isActive)
    .input('Actor', sql.NVarChar(120), input.actor)
    .query(`
MERGE [finance].[ApprovalMatrix] AS target
USING (SELECT @MatrixId AS MatrixId) AS source
ON target.MatrixId = source.MatrixId
WHEN MATCHED THEN UPDATE SET
  RuleName = @RuleName,
  PaymentType = @PaymentType,
  PathType = @PathType,
  CompanyCode = @CompanyCode,
  EntityName = @EntityName,
  MinAmount = @MinAmount,
  MaxAmount = @MaxAmount,
  ApprovalLevel = @ApprovalLevel,
  ApproverRoles = @ApproverRoles,
  StagesJson = @StagesJson,
  CurrencyCode = @CurrencyCode,
  DualControl = @DualControl,
  Status = @Status,
  IsActive = @IsActive,
  UpdatedBy = @Actor,
  UpdatedAt = SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT (
  MatrixId, RuleName, PaymentType, PathType, CompanyCode, EntityName, MinAmount, MaxAmount,
  ApprovalLevel, ApproverRoles, StagesJson, CurrencyCode, DualControl, Status, IsActive, CreatedBy, UpdatedBy
) VALUES (
  @MatrixId, @RuleName, @PaymentType, @PathType, @CompanyCode, @EntityName, @MinAmount, @MaxAmount,
  @ApprovalLevel, @ApproverRoles, @StagesJson, @CurrencyCode, @DualControl, @Status, @IsActive, @Actor, @Actor
);
`);

  await writeAudit({
    matrixId,
    actionType: input.matrixId ? 'Updated' : 'Created',
    actorName: input.actor,
    detail: { ruleName, pathType, minAmount, maxAmount, stages },
  });

  const workspace = await buildApprovalMatrixWorkspace({ autoSeed: false });
  return {
    rule: workspace.rules.find((item) => item.matrixId === matrixId) || null,
    workspace,
  };
};

export const deleteApprovalMatrixRule = async (input: { matrixId: string; actor: string }) => {
  const pool = await ensureFinanceDb();
  if (!pool) throw new Error('Finance database is unavailable.');
  await pool.request()
    .input('MatrixId', sql.NVarChar(60), input.matrixId)
    .query(`DELETE FROM [finance].[ApprovalMatrix] WHERE [MatrixId] = @MatrixId`);
  await writeAudit({
    matrixId: input.matrixId,
    actionType: 'Deleted',
    actorName: input.actor,
  });
  return { workspace: await buildApprovalMatrixWorkspace({ autoSeed: false }) };
};

/** True when the employee is the Managing Director / MD-CEO. */
export const isMdCeoEmployee = (employee?: {
  employeeCode?: string | null;
  employeeId?: string | null;
  fullName?: string | null;
  jobTitle?: string | null;
  designation?: string | null;
} | null) => {
  if (!employee) return false;
  const code = compact(employee.employeeCode || employee.employeeId).toUpperCase();
  if (code === 'P0413' || code === '0413') return true;
  const title = compact(employee.jobTitle || employee.designation);
  if (!title) return false;
  // EAs / PAs / secretaries "to MD/CEO" must never be treated as the MD seat.
  if (/\b(to|for)\s+(the\s+)?(md|managing\s*director|ceo)\b/i.test(title)) return false;
  if (
    /\b(pa|ea|p\.?a\.?|e\.?a\.?|personal\s+assistant|executive\s+assistant|secretary)\b/i.test(title)
    && /\b(md|managing\s*director|ceo)\b/i.test(title)
  ) {
    return false;
  }
  return /managing\s*director/i.test(title)
    || /\bmd\s*\/?\s*ceo\b/i.test(title)
    || /^md$/i.test(title);
};

const stripAutomaticMdStages = (stages: string[]) =>
  stages.filter((stage) => !/md\s*\/?\s*ceo|managing\s*director/i.test(compact(stage)));

const isLineManagerStage = (stage: string) =>
  /reporting manager|line manager|^supervisor$|supervisor\b/i.test(compact(stage));

const isProjectManagerStage = (stage: string) => /project manager/i.test(compact(stage));

/** Project path always starts with the requester's line manager unless that stage is already present. */
export const applyProjectReportingManagerFirst = (stages: string[], pathType?: ApprovalPathType | string | null) => {
  const next = [...(stages || [])].map((stage) => compact(stage)).filter(Boolean);
  if (normalizePathType(pathType) !== 'Project') return next;
  if (next.some(isLineManagerStage)) return next;
  return ['Reporting Manager', ...next];
};

/**
 * If the requester's line manager is also the project manager, do not make them approve twice.
 * Compare directory principals by employee code only — never delegates or display names.
 */
export const skipProjectReportingManagerWhenSameAsPm = async (input: {
  stages: string[];
  requesterCode?: string | null;
  supervisorName?: string | null;
  projectCode?: string | null;
  paymentType?: string | null;
}): Promise<string[]> => {
  const stages = [...(input.stages || [])].map((stage) => compact(stage)).filter(Boolean);
  if (!stages.some(isLineManagerStage) || !stages.some(isProjectManagerStage)) return stages;
  try {
    const { resolvePaymentStageApprover } = await import('@/lib/finance-intelligence/payment-approval-notify');
    const lineManager = await resolvePaymentStageApprover({
      stage: 'Reporting Manager',
      requesterCode: input.requesterCode,
      supervisorName: input.supervisorName,
      projectCode: input.projectCode,
      paymentType: input.paymentType,
      principalOnly: true,
    });
    const projectManager = await resolvePaymentStageApprover({
      stage: 'Project Manager',
      requesterCode: input.requesterCode,
      supervisorName: input.supervisorName,
      projectCode: input.projectCode,
      paymentType: input.paymentType,
      principalOnly: true,
    });
    const lineManagerCode = compact(lineManager.code).toUpperCase();
    const projectManagerCode = compact(projectManager.code).toUpperCase();
    if (lineManagerCode && projectManagerCode && lineManagerCode === projectManagerCode) {
      return stages.filter((stage) => !isLineManagerStage(stage));
    }
  } catch (error) {
    console.error('[approval-limits] project line-manager/PM dedupe failed', error);
  }
  return stages;
};

/** True when `next` is `existing` with Reporting Manager prepended — used to leave in-flight project requests alone. */
export const onlyPrependsReportingManager = (existing: string[], next: string[]) => {
  const current = (existing || []).map((stage) => compact(stage)).filter(Boolean);
  const matched = (next || []).map((stage) => compact(stage)).filter(Boolean);
  if (!current.length || matched.length !== current.length + 1) return false;
  if (!isLineManagerStage(matched[0]) || current.some(isLineManagerStage)) return false;
  return current.every((stage, index) => stage.toLowerCase() === matched[index + 1].toLowerCase());
};

export const stripLeadingReportingManager = (stages: string[]) => {
  const next = (stages || []).map((stage) => compact(stage)).filter(Boolean);
  if (next.length && isLineManagerStage(next[0])) return next.slice(1);
  return next;
};

export const isProjectChainWithoutReportingManager = (stages: string[]) => {
  const next = (stages || []).map((stage) => compact(stage)).filter(Boolean);
  return next.some(isProjectManagerStage) && !next.some(isLineManagerStage);
};

/** Project over ₦5m and non-project over ₦1m always require MD/CEO after CFO. */
export const bandRequiresMdCeo = (pathType: ApprovalPathType | string | null | undefined, amountNgn: number) => {
  const amount = moneyRound2(amountNgn);
  return normalizePathType(pathType) === 'Project' ? amount > 5000000 : amount > 1000000;
};

/**
 * High bands always keep MD/CEO last (never stripped).
 * Lower bands: MD/CEO is added only when MD is the requester's line/reporting manager,
 * including ≤ ₦200k — skip Reporting Manager and put MD/CEO last (never first).
 */
export const applyMdLineManagerLastApproverRule = async (input: {
  stages: string[];
  amountNgn: number;
  pathType?: ApprovalPathType | string | null;
  requesterCode?: string | null;
  supervisorName?: string | null;
}): Promise<string[]> => {
  let stages = [...(input.stages || [])].map((stage) => compact(stage)).filter(Boolean);
  const pathType = normalizePathType(input.pathType);
  const mdRequiredByBand = bandRequiresMdCeo(pathType, input.amountNgn);

  let mdIsLineManager = false;
  try {
    const { readDirectoryEmployees } = await import('@/lib/payroll-employee-source');
    const { resolveLineManagerForEmployee } = await import('@/lib/leave-workflow-service');
    const directory = await readDirectoryEmployees().catch(() => ({ employees: [] as Array<Record<string, unknown>> }));
    const employees = (directory.employees || []) as any[];
    const target = compact(input.requesterCode).toUpperCase();
    const requester = target
      ? employees.find((employee) => {
        const code = compact(employee.employeeCode || employee.employeeId || employee.sourceEmployeeId).toUpperCase();
        return code === target;
      }) || null
      : null;

    const lineManagerEmployee = requester
      ? resolveLineManagerForEmployee(requester, employees)?.employee || null
      : null;
    mdIsLineManager = isMdCeoEmployee(lineManagerEmployee);
  } catch (error) {
    console.error('[approval-limits] MD line-manager rule failed', error);
  }

  if (mdIsLineManager) {
    stages = stages.filter((stage) => !isLineManagerStage(stage));
  }
  if (mdRequiredByBand || mdIsLineManager) {
    stages = stripAutomaticMdStages(stages);
    if (!stages.length) stages.push('Finance Manager');
    stages.push('MD/CEO');
    return stages;
  }
  return stripAutomaticMdStages(stages);
};

/** Resolve full sequential approval chain for an employee payment (advance or supplier). */
export const resolveApprovalChain = async (input: {
  amount: number;
  currencyCode?: string;
  department?: string | null;
  projectCode?: string | null;
  projectDepartment?: boolean;
  requesterCode?: string | null;
  supervisorName?: string | null;
  /** When true (default), seed standard bands if the matrix table is empty. */
  autoSeed?: boolean;
}): Promise<ApprovalChainResolution | null> => {
  const pathType: ApprovalPathType = isProjectPaymentPath(input) ? 'Project' : 'Non-project';
  const converted = await convertAmountToNgn(input.amount, input.currencyCode);

  let rules = (await listApprovalMatrixRules())
    .filter((rule) => rule.isActive && rule.status === 'Active' && rule.pathType === pathType)
    .sort((a, b) => moneyRound2(a.minAmount) - moneyRound2(b.minAmount) || a.approvalLevel - b.approvalLevel);

  if (!rules.length && input.autoSeed !== false) {
    try {
      await seedDefaultApprovalLimits('System Auto-Seed');
      rules = (await listApprovalMatrixRules())
        .filter((rule) => rule.isActive && rule.status === 'Active' && rule.pathType === pathType)
        .sort((a, b) => moneyRound2(a.minAmount) - moneyRound2(b.minAmount) || a.approvalLevel - b.approvalLevel);
    } catch (error) {
      console.error('[approval-limits] resolve auto-seed failed', error);
    }
  }

  const match = rules.find((rule) => amountInBand(converted.amountNgn, rule.minAmount, rule.maxAmount));
  if (!match || !match.stages.length) return null;

  let stages = applyProjectReportingManagerFirst(match.stages, pathType);
  stages = await applyMdLineManagerLastApproverRule({
    stages,
    amountNgn: converted.amountNgn,
    pathType,
    requesterCode: input.requesterCode,
    supervisorName: input.supervisorName,
  });
  stages = await skipProjectReportingManagerWhenSameAsPm({
    stages,
    requesterCode: input.requesterCode,
    supervisorName: input.supervisorName,
    projectCode: input.projectCode,
  });

  return {
    pathType,
    amountOriginal: converted.amountOriginal,
    currencyCode: converted.currencyCode,
    amountNgn: converted.amountNgn,
    fxRate: converted.fxRate,
    fxRateDate: converted.fxRateDate,
    fxSource: converted.fxSource,
    stages,
    currentStage: stages[0] || match.stages[0],
    approvalLevel: stages.length,
    ruleName: match.ruleName,
    matrixId: match.matrixId,
  };
};

/** @deprecated Prefer resolveApprovalChain — kept for callers that only need the first stage. */
export const resolveApprovalStageFromMatrix = async (_paymentType: string, amount: number) => {
  const chain = await resolveApprovalChain({ amount, currencyCode: 'NGN' });
  if (!chain) return null;
  return {
    stage: chain.currentStage,
    approvalLevel: chain.approvalLevel,
    ruleName: chain.ruleName,
    stages: chain.stages,
    pathType: chain.pathType,
    amountNgn: chain.amountNgn,
  };
};
