import sql from 'mssql';
import { ensureFinanceDb } from '@/lib/finance-intelligence/store';

export type ApprovalRuleStatus = 'Active' | 'Draft' | 'Pending' | 'Inactive';

export type ApprovalMatrixRule = {
  matrixId: string;
  ruleName: string;
  paymentType: string;
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
    paymentTypes: number;
    activeRules: number;
    approvalLevels: number;
    pendingChanges: number;
    coveragePct: number;
    dualControlRules: number;
    companyCoveragePct: number;
    compliancePct: number;
  };
  rules: ApprovalMatrixRule[];
  audit: Array<{ auditId: string; matrixId: string; actionType: string; actorName: string; createdAt: string; detail: string }>;
};

export type UpsertApprovalRuleInput = {
  matrixId?: string;
  ruleName: string;
  paymentType: string;
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

const compact = (value: unknown) => String(value ?? '').trim();
const nowIso = () => new Date().toISOString();

const mapRule = (row: Record<string, unknown>): ApprovalMatrixRule => {
  let stages: string[] = [];
  try {
    const parsed = JSON.parse(String(row.StagesJson || '[]'));
    stages = Array.isArray(parsed) ? parsed.map((item) => compact(item)).filter(Boolean) : [];
  } catch {
    stages = [];
  }
  if (!stages.length && compact(row.ApproverRoles)) stages = [compact(row.ApproverRoles)];
  return {
    matrixId: compact(row.MatrixId),
    ruleName: compact(row.RuleName) || compact(row.MatrixId),
    paymentType: compact(row.PaymentType),
    companyCode: compact(row.CompanyCode) || 'DLE',
    entityName: compact(row.EntityName) || 'Dorman Long Nigeria Ltd',
    minAmount: Number(row.MinAmount || 0),
    maxAmount: row.MaxAmount == null ? null : Number(row.MaxAmount),
    approvalLevel: Number(row.ApprovalLevel || 1),
    approverRoles: compact(row.ApproverRoles) || stages.join(', '),
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
    paymentTypes: 0,
    activeRules: 0,
    approvalLevels: 0,
    pendingChanges: 0,
    coveragePct: 0,
    dualControlRules: 0,
    companyCoveragePct: 0,
    compliancePct: 0,
  },
  rules: [],
  audit: [],
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

export const listApprovalMatrixRules = async (): Promise<ApprovalMatrixRule[]> => {
  const pool = await ensureFinanceDb().catch(() => null);
  if (!pool) return [];
  try {
    const result = await pool.request().query(`
SELECT *
FROM [finance].[ApprovalMatrix]
ORDER BY [PaymentType], [ApprovalLevel], [MinAmount]
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
  const paymentTypes = new Set(rules.map((rule) => rule.paymentType).filter(Boolean));
  const levels = new Set(rules.map((rule) => rule.approvalLevel).filter((level) => level > 0));
  const dual = rules.filter((rule) => rule.dualControl);
  const enabledTypes = ['Cash Advance Payment', 'Supplier Invoice Payment'];
  const coveredEnabled = enabledTypes.filter((type) => paymentTypes.has(type)).length;

  workspace.summary = {
    paymentTypes: paymentTypes.size,
    activeRules: active.length,
    approvalLevels: levels.size,
    pendingChanges: pending.length,
    coveragePct: enabledTypes.length ? Math.round((coveredEnabled / enabledTypes.length) * 100) : 0,
    dualControlRules: dual.length,
    companyCoveragePct: rules.length ? 100 : 0,
    compliancePct: rules.length && pending.length === 0 ? 100 : rules.length ? Math.max(0, 100 - pending.length * 5) : 0,
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
  }

  return workspace;
};

export const upsertApprovalMatrixRule = async (input: UpsertApprovalRuleInput) => {
  const ruleName = compact(input.ruleName);
  const paymentType = compact(input.paymentType);
  const approverRoles = compact(input.approverRoles);
  if (!ruleName) throw new Error('Rule name is required.');
  if (!paymentType) throw new Error('Payment type is required.');
  if (!approverRoles) throw new Error('Approver role(s) are required.');
  if (!(Number(input.minAmount) >= 0)) throw new Error('From amount must be zero or greater.');
  if (input.maxAmount != null && Number(input.maxAmount) < Number(input.minAmount)) {
    throw new Error('To amount must be greater than or equal to from amount.');
  }

  const pool = await ensureFinanceDb();
  if (!pool) throw new Error('Finance database is unavailable.');

  const matrixId = compact(input.matrixId) || `AMX-${Date.now()}`;
  const status = input.status || 'Active';
  const stages = input.stages?.length ? input.stages : [approverRoles];
  const isActive = status === 'Active' ? 1 : 0;

  await pool.request()
    .input('MatrixId', sql.NVarChar(60), matrixId)
    .input('RuleName', sql.NVarChar(80), ruleName)
    .input('PaymentType', sql.NVarChar(80), paymentType)
    .input('CompanyCode', sql.NVarChar(40), compact(input.companyCode) || 'DLE')
    .input('EntityName', sql.NVarChar(200), compact(input.entityName) || 'Dorman Long Nigeria Ltd')
    .input('MinAmount', sql.Decimal(19, 4), Number(input.minAmount || 0))
    .input('MaxAmount', sql.Decimal(19, 4), input.maxAmount == null ? null : Number(input.maxAmount))
    .input('ApprovalLevel', sql.Int, Number(input.approvalLevel || 1))
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
  MatrixId, RuleName, PaymentType, CompanyCode, EntityName, MinAmount, MaxAmount,
  ApprovalLevel, ApproverRoles, StagesJson, CurrencyCode, DualControl, Status, IsActive, CreatedBy, UpdatedBy
) VALUES (
  @MatrixId, @RuleName, @PaymentType, @CompanyCode, @EntityName, @MinAmount, @MaxAmount,
  @ApprovalLevel, @ApproverRoles, @StagesJson, @CurrencyCode, @DualControl, @Status, @IsActive, @Actor, @Actor
);
`);

  await writeAudit({
    matrixId,
    actionType: input.matrixId ? 'Updated' : 'Created',
    actorName: input.actor,
    detail: { ruleName, paymentType, minAmount: input.minAmount, maxAmount: input.maxAmount, approvalLevel: input.approvalLevel },
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

export const resolveApprovalStageFromMatrix = async (paymentType: string, amount: number) => {
  const rules = (await listApprovalMatrixRules())
    .filter((rule) => rule.isActive && rule.status === 'Active' && rule.paymentType === paymentType)
    .sort((a, b) => a.minAmount - b.minAmount || a.approvalLevel - b.approvalLevel);

  const match = rules.find((rule) => {
    const max = rule.maxAmount == null ? Number.POSITIVE_INFINITY : rule.maxAmount;
    return amount >= rule.minAmount && amount <= max;
  });

  if (!match) return null;
  return {
    stage: match.approverRoles.split(',')[0]?.trim() || `Level ${match.approvalLevel}`,
    approvalLevel: match.approvalLevel,
    ruleName: match.ruleName,
  };
};
