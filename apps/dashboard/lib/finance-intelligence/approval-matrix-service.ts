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
  };
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

const FALLBACK_FX: Record<string, number> = {
  NGN: 1,
  USD: 1600,
  EUR: 1750,
  GBP: 2050,
};

const normalizePathType = (value: unknown): ApprovalPathType =>
  /project/i.test(compact(value)) ? 'Project' : 'Non-project';

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
    pathType: normalizePathType(row.PathType || row.PaymentType),
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
  },
  rules: [],
  audit: [],
  fxRates: [],
});

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

/** Project path when project is selected, department looks like a project dept, or explicit flag. */
export const isProjectPaymentPath = (input: {
  department?: string | null;
  projectCode?: string | null;
  projectDepartment?: boolean;
}) => {
  if (input.projectDepartment) return true;
  if (compact(input.projectCode)) return true;
  if (/project/i.test(compact(input.department))) return true;
  return false;
};

export const getPrevailingFxRate = async (fromCurrency: string, rateDate = new Date()) => {
  const from = compact(fromCurrency).toUpperCase() || 'NGN';
  if (from === 'NGN') {
    return { fromCurrency: 'NGN', toCurrency: 'NGN', rate: 1, rateDate: rateDate.toISOString().slice(0, 10), source: 'Identity' };
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
ORDER BY [RateDate] DESC
`);
      const row = result.recordset?.[0] as Record<string, unknown> | undefined;
      if (row) {
        return {
          fromCurrency: compact(row.FromCurrency),
          toCurrency: compact(row.ToCurrency) || 'NGN',
          rate: Number(row.Rate || 0),
          rateDate: row.RateDate ? new Date(String(row.RateDate)).toISOString().slice(0, 10) : rateDate.toISOString().slice(0, 10),
          source: compact(row.Source) || 'finance.FxRates',
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
    const result = await pool.request().query(`
SELECT *
FROM [finance].[ApprovalMatrix]
ORDER BY [PathType], [ApprovalLevel], [MinAmount]
`);
    return (result.recordset || []).map((row: Record<string, unknown>) => mapRule(row));
  } catch {
    return [];
  }
};

export const buildApprovalMatrixWorkspace = async (): Promise<ApprovalMatrixWorkspace> => {
  const rules = await listApprovalMatrixRules();
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
  };

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

  if (!ruleName) throw new Error('Rule name is required.');
  if (!pathType) throw new Error('Path type is required (Non-project or Project).');
  if (!stages.length) throw new Error('At least one approval stage / approver role is required.');
  if (!(Number(input.minAmount) >= 0)) throw new Error('From amount must be zero or greater.');
  if (input.maxAmount != null && Number(input.maxAmount) < Number(input.minAmount)) {
    throw new Error('To amount must be greater than or equal to from amount.');
  }

  const pool = await ensureFinanceDb();
  if (!pool) throw new Error('Finance database is unavailable.');

  const matrixId = compact(input.matrixId) || `AMX-${Date.now()}`;
  const status = input.status || 'Active';
  const isActive = status === 'Active' ? 1 : 0;
  const paymentType = 'Employee Payment';

  await pool.request()
    .input('MatrixId', sql.NVarChar(60), matrixId)
    .input('RuleName', sql.NVarChar(80), ruleName)
    .input('PaymentType', sql.NVarChar(80), paymentType)
    .input('PathType', sql.NVarChar(40), pathType)
    .input('CompanyCode', sql.NVarChar(40), compact(input.companyCode) || 'DLE')
    .input('EntityName', sql.NVarChar(200), compact(input.entityName) || 'Dorman Long Nigeria Ltd')
    .input('MinAmount', sql.Decimal(19, 4), Number(input.minAmount || 0))
    .input('MaxAmount', sql.Decimal(19, 4), input.maxAmount == null ? null : Number(input.maxAmount))
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
    detail: { ruleName, pathType, minAmount: input.minAmount, maxAmount: input.maxAmount, stages },
  });

  const workspace = await buildApprovalMatrixWorkspace();
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
  return { workspace: await buildApprovalMatrixWorkspace() };
};

/** Resolve full sequential approval chain for an employee payment (advance or supplier). */
export const resolveApprovalChain = async (input: {
  amount: number;
  currencyCode?: string;
  department?: string | null;
  projectCode?: string | null;
  projectDepartment?: boolean;
}): Promise<ApprovalChainResolution | null> => {
  const pathType: ApprovalPathType = isProjectPaymentPath(input) ? 'Project' : 'Non-project';
  const converted = await convertAmountToNgn(input.amount, input.currencyCode);
  const rules = (await listApprovalMatrixRules())
    .filter((rule) => rule.isActive && rule.status === 'Active' && rule.pathType === pathType)
    .sort((a, b) => a.minAmount - b.minAmount || a.approvalLevel - b.approvalLevel);

  const match = rules.find((rule) => {
    const max = rule.maxAmount == null ? Number.POSITIVE_INFINITY : rule.maxAmount;
    return converted.amountNgn >= rule.minAmount && converted.amountNgn <= max;
  });

  if (!match || !match.stages.length) return null;

  return {
    pathType,
    amountOriginal: converted.amountOriginal,
    currencyCode: converted.currencyCode,
    amountNgn: converted.amountNgn,
    fxRate: converted.fxRate,
    fxRateDate: converted.fxRateDate,
    fxSource: converted.fxSource,
    stages: match.stages,
    currentStage: match.stages[0],
    approvalLevel: match.approvalLevel,
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
