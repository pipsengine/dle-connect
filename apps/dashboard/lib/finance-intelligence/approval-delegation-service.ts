import sql from 'mssql';
import { ensureFinanceDb } from '@/lib/finance-intelligence/store';

export type DelegationStatus = 'Active' | 'Scheduled' | 'Expired' | 'Cancelled';
export type DelegationScope =
  | 'All Employee Payments'
  | 'Cash Advance Payment'
  | 'Supplier Invoice Payment';

export type ApprovalDelegation = {
  delegationId: string;
  fromEmployeeCode: string;
  fromEmployeeName: string;
  toEmployeeCode: string;
  toEmployeeName: string;
  /** Stage / role being covered. Empty or "All Stages" covers every stage for the principal. */
  approverRole: string;
  scope: DelegationScope;
  startsAt: string;
  endsAt: string | null;
  status: DelegationStatus;
  isActive: boolean;
  reason: string;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
};

export type ApprovalDelegationWorkspace = {
  generatedAt: string;
  source: string;
  summary: {
    total: number;
    active: number;
    scheduled: number;
    expired: number;
    cancelled: number;
    standing: number;
    temporary: number;
  };
  warnings: string[];
  rows: ApprovalDelegation[];
  audit: Array<{
    auditId: string;
    delegationId: string;
    actionType: string;
    actorName: string;
    createdAt: string;
    detail: string;
  }>;
};

export type UpsertDelegationInput = {
  delegationId?: string;
  fromEmployeeCode: string;
  fromEmployeeName?: string;
  toEmployeeCode: string;
  toEmployeeName?: string;
  approverRole?: string;
  scope?: DelegationScope | string;
  startsAt: string;
  endsAt?: string | null;
  status?: DelegationStatus;
  isActive?: boolean;
  reason?: string;
  actor: string;
};

const compact = (value: unknown) => String(value ?? '').trim();
const nowIso = () => new Date().toISOString();

const APPROVER_ROLE_OPTIONS = [
  'All Stages',
  'Reporting Manager',
  'Project Manager',
  'Cost Controller',
  'Finance Manager',
  'GM',
  'CFO',
  'MD/CEO',
] as const;

const SCOPE_OPTIONS: DelegationScope[] = [
  'All Employee Payments',
  'Cash Advance Payment',
  'Supplier Invoice Payment',
];

export const DELEGATION_APPROVER_ROLE_OPTIONS = [...APPROVER_ROLE_OPTIONS];
export const DELEGATION_SCOPE_OPTIONS = [...SCOPE_OPTIONS];

const normalizeScope = (value: unknown): DelegationScope => {
  const raw = compact(value);
  if (/cash\s*advance/i.test(raw)) return 'Cash Advance Payment';
  if (/supplier/i.test(raw)) return 'Supplier Invoice Payment';
  return 'All Employee Payments';
};

const normalizeStatus = (value: unknown, fallback: DelegationStatus = 'Active'): DelegationStatus => {
  const raw = compact(value).toLowerCase();
  if (raw === 'scheduled') return 'Scheduled';
  if (raw === 'expired') return 'Expired';
  if (raw === 'cancelled' || raw === 'canceled') return 'Cancelled';
  if (raw === 'active') return 'Active';
  return fallback;
};

const parseDate = (value: unknown): Date | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
};

const toIso = (value: unknown) => {
  const date = parseDate(value);
  return date ? date.toISOString() : nowIso();
};

const deriveLifecycleStatus = (row: {
  status?: string;
  isActive?: boolean;
  startsAt: string;
  endsAt: string | null;
}): DelegationStatus => {
  const explicit = normalizeStatus(row.status, row.isActive === false ? 'Cancelled' : 'Active');
  if (explicit === 'Cancelled') return 'Cancelled';

  const now = Date.now();
  const starts = parseDate(row.startsAt)?.getTime() ?? now;
  const ends = row.endsAt ? parseDate(row.endsAt)?.getTime() ?? null : null;

  if (ends != null && ends < now) return 'Expired';
  if (starts > now) return 'Scheduled';
  if (row.isActive === false) return 'Cancelled';
  return 'Active';
};

const mapRow = (row: Record<string, unknown>): ApprovalDelegation => {
  const startsAt = toIso(row.StartsAt);
  const endsAt = row.EndsAt == null ? null : toIso(row.EndsAt);
  const isActive = row.IsActive == null ? true : Boolean(row.IsActive);
  const status = deriveLifecycleStatus({
    status: compact(row.Status),
    isActive,
    startsAt,
    endsAt,
  });

  return {
    delegationId: compact(row.DelegationId),
    fromEmployeeCode: compact(row.FromEmployeeCode),
    fromEmployeeName: compact(row.FromEmployeeName),
    toEmployeeCode: compact(row.ToEmployeeCode),
    toEmployeeName: compact(row.ToEmployeeName),
    approverRole: compact(row.ApproverRole) || 'All Stages',
    scope: normalizeScope(row.Scope),
    startsAt,
    endsAt,
    status,
    isActive: status === 'Active' || status === 'Scheduled' ? isActive : false,
    reason: compact(row.Reason),
    createdBy: compact(row.CreatedBy),
    updatedBy: compact(row.UpdatedBy),
    createdAt: toIso(row.CreatedAt),
    updatedAt: row.UpdatedAt ? toIso(row.UpdatedAt) : toIso(row.CreatedAt),
  };
};

const emptyWorkspace = (): ApprovalDelegationWorkspace => ({
  generatedAt: nowIso(),
  source: 'DLE Enterprise · finance.ApprovalDelegations',
  summary: {
    total: 0,
    active: 0,
    scheduled: 0,
    expired: 0,
    cancelled: 0,
    standing: 0,
    temporary: 0,
  },
  warnings: [],
  rows: [],
  audit: [],
});

const writeAudit = async (input: {
  delegationId?: string;
  actionType: string;
  actorName: string;
  detail?: Record<string, unknown>;
}) => {
  const pool = await ensureFinanceDb().catch(() => null);
  if (!pool) return;
  try {
    await pool.request()
      .input('AuditId', sql.NVarChar(60), `ADA-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`)
      .input('DelegationId', sql.NVarChar(60), input.delegationId || null)
      .input('ActionType', sql.NVarChar(40), input.actionType)
      .input('ActorName', sql.NVarChar(200), input.actorName)
      .input('DetailJson', sql.NVarChar(sql.MAX), JSON.stringify(input.detail || {}))
      .query(`
INSERT INTO [finance].[ApprovalDelegationAudit] ([AuditId], [DelegationId], [ActionType], [ActorName], [DetailJson])
VALUES (@AuditId, @DelegationId, @ActionType, @ActorName, @DetailJson)
`);
  } catch {
    // best-effort — table may not exist until schema ensure runs
  }
};

const roleMatches = (delegationRole: string, stage: string) => {
  const role = compact(delegationRole).toLowerCase();
  const stageKey = compact(stage).toLowerCase();
  if (!role || role === 'all stages' || role === 'all') return true;
  if (!stageKey) return true;
  if (role === stageKey) return true;
  if (role.includes(stageKey) || stageKey.includes(role)) return true;
  if (/reporting manager|line manager/.test(role) && /reporting manager|line manager|supervisor/.test(stageKey)) return true;
  if (/finance manager/.test(role) && /finance manager/.test(stageKey)) return true;
  if (/^gm$|general manager/.test(role) && /^gm$|general manager/.test(stageKey)) return true;
  if (/md\/?ceo|managing director/.test(role) && /md\/?ceo|managing director|chief executive/.test(stageKey)) return true;
  return false;
};

const scopeMatches = (scope: DelegationScope, paymentType?: string | null) => {
  if (scope === 'All Employee Payments') return true;
  const type = compact(paymentType);
  if (!type) return true;
  return scope.toLowerCase() === type.toLowerCase();
};

const isEffectiveNow = (row: ApprovalDelegation, at = new Date()) => {
  if (row.status === 'Cancelled' || row.status === 'Expired') return false;
  if (!row.isActive && row.status !== 'Scheduled') return false;
  const start = parseDate(row.startsAt);
  const end = row.endsAt ? parseDate(row.endsAt) : null;
  if (!start) return false;
  if (start.getTime() > at.getTime()) return false;
  if (end && end.getTime() < at.getTime()) return false;
  return row.status === 'Active' || (row.isActive && start.getTime() <= at.getTime());
};

export const listApprovalDelegations = async (): Promise<ApprovalDelegation[]> => {
  const pool = await ensureFinanceDb().catch(() => null);
  if (!pool) return [];
  try {
    const result = await pool.request().query(`
SELECT *
FROM [finance].[ApprovalDelegations]
ORDER BY [StartsAt] DESC, [CreatedAt] DESC
`);
    return (result.recordset || []).map((row: Record<string, unknown>) => mapRow(row));
  } catch {
    return [];
  }
};

export const buildApprovalDelegationWorkspace = async (): Promise<ApprovalDelegationWorkspace> => {
  const workspace = emptyWorkspace();
  const rows = await listApprovalDelegations();
  workspace.rows = rows;
  workspace.generatedAt = nowIso();

  const active = rows.filter((row) => row.status === 'Active');
  const scheduled = rows.filter((row) => row.status === 'Scheduled');
  const expired = rows.filter((row) => row.status === 'Expired');
  const cancelled = rows.filter((row) => row.status === 'Cancelled');
  const standing = rows.filter((row) => !row.endsAt && row.status !== 'Cancelled');
  const temporary = rows.filter((row) => Boolean(row.endsAt));

  workspace.summary = {
    total: rows.length,
    active: active.length,
    scheduled: scheduled.length,
    expired: expired.length,
    cancelled: cancelled.length,
    standing: standing.length,
    temporary: temporary.length,
  };

  const warnings: string[] = [];
  for (const row of active) {
    if (row.fromEmployeeCode.toUpperCase() === row.toEmployeeCode.toUpperCase()) {
      warnings.push(`${row.delegationId}: principal and delegate are the same person.`);
    }
  }
  const openEndedActive = active.filter((row) => !row.endsAt).length;
  if (openEndedActive > 8) {
    warnings.push(`${openEndedActive} standing (open-ended) delegations are active — review regularly.`);
  }
  workspace.warnings = warnings;

  const pool = await ensureFinanceDb().catch(() => null);
  if (pool) {
    try {
      const audit = await pool.request().query(`
SELECT TOP 50 [AuditId], [DelegationId], [ActionType], [ActorName], [DetailJson], [CreatedAt]
FROM [finance].[ApprovalDelegationAudit]
ORDER BY [CreatedAt] DESC
`);
      workspace.audit = (audit.recordset || []).map((row: Record<string, unknown>) => ({
        auditId: compact(row.AuditId),
        delegationId: compact(row.DelegationId),
        actionType: compact(row.ActionType),
        actorName: compact(row.ActorName),
        createdAt: toIso(row.CreatedAt),
        detail: compact(row.DetailJson),
      }));
    } catch {
      workspace.audit = [];
    }
  }

  return workspace;
};

export const upsertApprovalDelegation = async (input: UpsertDelegationInput) => {
  const fromCode = compact(input.fromEmployeeCode);
  const toCode = compact(input.toEmployeeCode);
  if (!fromCode) throw new Error('From employee code is required.');
  if (!toCode) throw new Error('To employee (delegate) code is required.');
  if (fromCode.toUpperCase() === toCode.toUpperCase()) {
    throw new Error('Cannot delegate approvals to the same employee.');
  }

  const startsAt = parseDate(input.startsAt) || new Date();
  const endsAt = input.endsAt == null || compact(input.endsAt) === '' ? null : parseDate(input.endsAt);
  if (endsAt && endsAt.getTime() < startsAt.getTime()) {
    throw new Error('End date must be on or after the start date.');
  }

  const scope = normalizeScope(input.scope);
  const approverRole = compact(input.approverRole) || 'All Stages';
  const requestedStatus = input.status
    ? normalizeStatus(input.status)
    : deriveLifecycleStatus({
      isActive: input.isActive !== false,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt ? endsAt.toISOString() : null,
    });
  const isActive = requestedStatus === 'Active' || requestedStatus === 'Scheduled' ? 1 : 0;

  const pool = await ensureFinanceDb();
  if (!pool) throw new Error('Finance database is unavailable.');

  const delegationId = compact(input.delegationId) || `DEL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  // Prevent duplicate active coverage for the same principal/role/scope window.
  if (requestedStatus === 'Active' || requestedStatus === 'Scheduled') {
    const existing = await listApprovalDelegations();
    const conflict = existing.find((row) => {
      if (row.delegationId === delegationId) return false;
      if (!(row.status === 'Active' || row.status === 'Scheduled')) return false;
      if (row.fromEmployeeCode.toUpperCase() !== fromCode.toUpperCase()) return false;
      if (normalizeScope(row.scope) !== scope) return false;
      if (!roleMatches(row.approverRole, approverRole) && !roleMatches(approverRole, row.approverRole)) return false;
      const aStart = parseDate(row.startsAt)?.getTime() ?? 0;
      const aEnd = row.endsAt ? parseDate(row.endsAt)?.getTime() ?? Number.POSITIVE_INFINITY : Number.POSITIVE_INFINITY;
      const bStart = startsAt.getTime();
      const bEnd = endsAt ? endsAt.getTime() : Number.POSITIVE_INFINITY;
      return aStart <= bEnd && bStart <= aEnd;
    });
    if (conflict) {
      throw new Error(
        `Overlapping delegation already exists (${conflict.delegationId}) for ${fromCode} covering ${conflict.approverRole}. Cancel or adjust dates first.`,
      );
    }
  }

  await pool.request()
    .input('DelegationId', sql.NVarChar(60), delegationId)
    .input('FromEmployeeCode', sql.NVarChar(60), fromCode)
    .input('FromEmployeeName', sql.NVarChar(200), compact(input.fromEmployeeName) || fromCode)
    .input('ToEmployeeCode', sql.NVarChar(60), toCode)
    .input('ToEmployeeName', sql.NVarChar(200), compact(input.toEmployeeName) || toCode)
    .input('ApproverRole', sql.NVarChar(120), approverRole)
    .input('Scope', sql.NVarChar(80), scope)
    .input('StartsAt', sql.DateTime2, startsAt)
    .input('EndsAt', sql.DateTime2, endsAt)
    .input('Status', sql.NVarChar(40), requestedStatus)
    .input('IsActive', sql.Bit, isActive)
    .input('Reason', sql.NVarChar(500), compact(input.reason) || null)
    .input('Actor', sql.NVarChar(120), input.actor)
    .query(`
MERGE [finance].[ApprovalDelegations] AS target
USING (SELECT @DelegationId AS DelegationId) AS source
ON target.DelegationId = source.DelegationId
WHEN MATCHED THEN UPDATE SET
  FromEmployeeCode = @FromEmployeeCode,
  FromEmployeeName = @FromEmployeeName,
  ToEmployeeCode = @ToEmployeeCode,
  ToEmployeeName = @ToEmployeeName,
  ApproverRole = @ApproverRole,
  Scope = @Scope,
  StartsAt = @StartsAt,
  EndsAt = @EndsAt,
  Status = @Status,
  IsActive = @IsActive,
  Reason = @Reason,
  UpdatedBy = @Actor,
  UpdatedAt = SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT (
  DelegationId, FromEmployeeCode, FromEmployeeName, ToEmployeeCode, ToEmployeeName,
  ApproverRole, Scope, StartsAt, EndsAt, Status, IsActive, Reason, CreatedBy, UpdatedBy, UpdatedAt
) VALUES (
  @DelegationId, @FromEmployeeCode, @FromEmployeeName, @ToEmployeeCode, @ToEmployeeName,
  @ApproverRole, @Scope, @StartsAt, @EndsAt, @Status, @IsActive, @Reason, @Actor, @Actor, SYSUTCDATETIME()
);
`);

  await writeAudit({
    delegationId,
    actionType: input.delegationId ? 'Updated' : 'Created',
    actorName: input.actor,
    detail: {
      fromCode,
      toCode,
      approverRole,
      scope,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt?.toISOString() || null,
      status: requestedStatus,
    },
  });

  const workspace = await buildApprovalDelegationWorkspace();
  return {
    delegation: workspace.rows.find((row) => row.delegationId === delegationId) || null,
    workspace,
  };
};

export const cancelApprovalDelegation = async (input: {
  delegationId: string;
  actor: string;
  reason?: string;
}) => {
  const delegationId = compact(input.delegationId);
  if (!delegationId) throw new Error('delegationId is required.');

  const pool = await ensureFinanceDb();
  if (!pool) throw new Error('Finance database is unavailable.');

  await pool.request()
    .input('DelegationId', sql.NVarChar(60), delegationId)
    .input('Actor', sql.NVarChar(120), input.actor)
    .input('Reason', sql.NVarChar(500), compact(input.reason) || 'Cancelled')
    .query(`
UPDATE [finance].[ApprovalDelegations]
SET [Status] = N'Cancelled',
    [IsActive] = 0,
    [Reason] = COALESCE(NULLIF(@Reason, N''), [Reason]),
    [UpdatedBy] = @Actor,
    [UpdatedAt] = SYSUTCDATETIME()
WHERE [DelegationId] = @DelegationId
`);

  await writeAudit({
    delegationId,
    actionType: 'Cancelled',
    actorName: input.actor,
    detail: { reason: compact(input.reason) },
  });

  return { workspace: await buildApprovalDelegationWorkspace() };
};

/** Find the active delegate covering a principal for a given approval stage / payment type. */
export const resolveActiveDelegation = async (input: {
  fromEmployeeCode?: string | null;
  fromEmployeeName?: string | null;
  stage?: string | null;
  paymentType?: string | null;
  at?: Date;
}): Promise<ApprovalDelegation | null> => {
  const code = compact(input.fromEmployeeCode).toUpperCase();
  const name = compact(input.fromEmployeeName).toLowerCase();
  if (!code && !name) return null;

  const rows = await listApprovalDelegations();
  const at = input.at || new Date();
  const matches = rows.filter((row) => {
    if (!isEffectiveNow(row, at)) return false;
    const codeMatch = code && row.fromEmployeeCode.toUpperCase() === code;
    const nameMatch = name && compact(row.fromEmployeeName).toLowerCase() === name;
    if (!codeMatch && !nameMatch) return false;
    if (!roleMatches(row.approverRole, compact(input.stage))) return false;
    if (!scopeMatches(row.scope, input.paymentType)) return false;
    return true;
  });

  if (!matches.length) return null;

  // Prefer role-specific over "All Stages", then earliest start.
  matches.sort((a, b) => {
    const aSpecific = /all stages|^all$/i.test(a.approverRole) ? 1 : 0;
    const bSpecific = /all stages|^all$/i.test(b.approverRole) ? 1 : 0;
    if (aSpecific !== bSpecific) return aSpecific - bSpecific;
    return parseDate(a.startsAt)!.getTime() - parseDate(b.startsAt)!.getTime();
  });

  return matches[0];
};
