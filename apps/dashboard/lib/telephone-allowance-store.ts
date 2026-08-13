/**
 * Telephone Allowance / Call Credit persistence + workflow store.
 * Prefers SQL Server (hris.TelephoneAllowance*); falls back to local JSON.
 */
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import sql from 'mssql';
import type { SessionPayload } from '@/lib/auth/session';
import { getDleEnterpriseDbPool } from '@/lib/dle-enterprise-db';
import { createEnterpriseNotification } from '@/lib/enterprise-notifications-store';
import { readPayrollEmployees } from '@/lib/payroll-employee-source';
import type { TelephoneAllowanceCapabilities } from '@/lib/telephone-allowance-access';
import {
  assertTransition,
  buildCycleCode,
  buildLineFromEntitlements,
  canEditSchedule,
  canHrReviewEdit,
  currentOpenPair,
  maskAccount,
  nextPairAfter,
  pairForCode,
  recalcCycleTotals,
  roundMoney,
  type ChangeBadge,
  type CycleApproval,
  type CycleChange,
  type CycleEmployeeLine,
  type CycleVersion,
  type TelephoneAllowanceStatus,
  type TelephoneAudit,
  type TelephoneCycle,
  type TelephoneEntitlement,
  type TelephoneException,
  type TelephonePayment,
  type PaymentItem,
  type EntitlementStatus,
} from '@/lib/telephone-allowance-cycle';
import { ensureTelephoneAllowanceSchemaSql } from '@/lib/telephone-allowance-sql-schema';

export type {
  ChangeBadge,
  CycleApproval,
  CycleChange,
  CycleEmployeeLine,
  CycleVersion,
  TelephoneAllowanceStatus,
  TelephoneAudit,
  TelephoneCycle,
  TelephoneEntitlement,
  TelephoneException,
  TelephonePayment,
  PaymentItem,
  EntitlementStatus,
};

export type TelephoneActor = string;

export type EntitlementUpsertInput = {
  id?: string;
  employeeCode: string;
  employeeName?: string;
  department?: string;
  jobTitle?: string;
  monthlyAmount: number;
  effectiveFrom: string;
  effectiveTo?: string | null;
  status?: EntitlementStatus;
  bankName?: string | null;
  accountNo?: string | null;
  sortCode?: string | null;
};

export type CycleDraftPatch = {
  employees?: CycleEmployeeLine[];
  preparedBy?: string;
  currentOwnerRole?: string;
};

export type HrAddEmployeeInput = {
  employeeCode: string;
  employeeName?: string;
  department?: string;
  jobTitle?: string;
  monthlyRate: number;
  month1Eligible?: boolean;
  month2Eligible?: boolean;
  month1Amount?: number;
  month2Amount?: number;
  bankName?: string | null;
  accountNo?: string | null;
  sortCode?: string | null;
  reason: string;
  comment?: string | null;
};

export type HrAdjustAmountInput = {
  employeeCode: string;
  monthlyRate?: number;
  month1Eligible?: boolean;
  month2Eligible?: boolean;
  month1Amount?: number;
  month2Amount?: number;
  reason: string;
  comment?: string | null;
  effectiveMonth?: 1 | 2 | 'BOTH';
};

export type RecordPaymentInput = {
  paymentDate?: string | null;
  paymentReference?: string | null;
  bankReference?: string | null;
  batchReference?: string | null;
  remarks?: string | null;
  paidEmployeeCodes?: string[];
  failedItems?: Array<{ employeeCode: string; failureReason: string }>;
  markCompleted?: boolean;
};

export type HistoricalImportRow = {
  employeeCode: string;
  employeeName?: string;
  department?: string;
  jobTitle?: string;
  amount?: number;
  monthlyAmount?: number;
  bimonthlyAmount?: number;
  month1Amount?: number;
  month2Amount?: number;
  month1Eligible?: boolean;
  month2Eligible?: boolean;
  bankName?: string | null;
  accountNo?: string | null;
  sortCode?: string | null;
};

export type HistoricalImportMeta = {
  year: number;
  pairCode: string;
  cycleCode?: string;
  preparedBy?: string;
  status?: TelephoneAllowanceStatus;
};

export type ValidationIssue = { code: string; message: string; employeeCode?: string };

export type CycleValidationResult = {
  ok: boolean;
  critical: ValidationIssue[];
  warnings: ValidationIssue[];
};

type CyclePayload = {
  employees: CycleEmployeeLine[];
  versions: CycleVersion[];
  changes: CycleChange[];
  approvals: CycleApproval[];
};

type JsonStoreFile = {
  entitlements: TelephoneEntitlement[];
  cycles: TelephoneCycle[];
  payments: TelephonePayment[];
  exceptions: TelephoneException[];
  audits: TelephoneAudit[];
};

type SqlMode = { kind: 'sql'; pool: sql.ConnectionPool } | { kind: 'json' };

const ROW_CHANGED_MSG = 'This schedule has changed. Refresh and try again.';
const MODULE_HREF = '/it-support/telephone-allowance';
const schemaReady = { value: false };

const nowIso = () => new Date().toISOString();
const compact = (value: unknown) => String(value ?? '').trim();
const upperCode = (value: unknown) => compact(value).toUpperCase();
const newId = () => randomUUID();

const resolveDashboardRoot = () => {
  const cwd = process.cwd();
  const dashboardSuffix = path.join('apps', 'dashboard');
  return cwd.endsWith(dashboardSuffix) ? cwd : path.join(cwd, dashboardSuffix);
};

const jsonStorePath = () => {
  const override = compact(process.env.DLE_TELEPHONE_ALLOWANCE_STORE_PATH);
  if (override) return path.resolve(override);
  return path.join(resolveDashboardRoot(), 'data', 'hris', 'telephone-allowance-store.json');
};

const emptyJsonStore = (): JsonStoreFile => ({
  entitlements: [],
  cycles: [],
  payments: [],
  exceptions: [],
  audits: [],
});

const systemSession = (actor: string): SessionPayload => ({
  sub: 'telephone-allowance',
  username: 'telephone-allowance',
  fullName: actor || 'Telephone Allowance',
  roles: ['System'],
  permissions: ['*'],
  status: 'Active',
  firstLoginRequired: false,
  passwordResetRequired: false,
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 3600,
});

const ownerRoleForStatus = (status: TelephoneAllowanceStatus): string => {
  switch (status) {
    case 'DRAFT':
    case 'RETURNED_TO_IT':
    case 'RETURNED_FOR_CORRECTION':
    case 'IT_VALIDATION':
      return 'IT';
    case 'PENDING_HR_REVIEW':
      return 'HR Review';
    case 'PENDING_HR_APPROVAL':
      return 'HR Approver';
    case 'PENDING_MD_APPROVAL':
      return 'MD';
    case 'PENDING_CFO_AUTHORIZATION':
      return 'CFO';
    case 'AUTHORIZED_FOR_PAYMENT':
    case 'PAYMENT_PROCESSING':
    case 'PARTIALLY_PAID':
    case 'PAID':
    case 'COMPLETED':
      return 'Treasury';
    default:
      return 'IT';
  }
};

const parsePayload = (raw: unknown): CyclePayload => {
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw || '{}');
    } catch {
      parsed = {};
    }
  }
  const obj = (parsed && typeof parsed === 'object' ? parsed : {}) as Partial<CyclePayload>;
  return {
    employees: Array.isArray(obj.employees) ? obj.employees : [],
    versions: Array.isArray(obj.versions) ? obj.versions : [],
    changes: Array.isArray(obj.changes) ? obj.changes : [],
    approvals: Array.isArray(obj.approvals) ? obj.approvals : [],
  };
};

const serializePayload = (cycle: Pick<TelephoneCycle, 'employees' | 'versions' | 'changes' | 'approvals'>) =>
  JSON.stringify({
    employees: cycle.employees || [],
    versions: cycle.versions || [],
    changes: cycle.changes || [],
    approvals: cycle.approvals || [],
  } satisfies CyclePayload);

const lineTotalsConsistent = (line: CycleEmployeeLine) => {
  const expected = roundMoney((line.month1Eligible ? line.month1Amount : 0) + (line.month2Eligible ? line.month2Amount : 0));
  return roundMoney(line.bimonthlyTotal) === expected;
};

const refreshLineBadge = (line: CycleEmployeeLine, prefer?: ChangeBadge): CycleEmployeeLine => {
  const month1Amount = line.month1Eligible ? roundMoney(line.month1Amount) : 0;
  const month2Amount = line.month2Eligible ? roundMoney(line.month2Amount) : 0;
  let changeBadge: ChangeBadge = prefer || line.changeBadge || 'UNCHANGED';
  if (prefer === 'ADDED' || prefer === 'REMOVED' || prefer === 'AMOUNT_CHANGED') {
    changeBadge = prefer;
  } else if (changeBadge !== 'ADDED' && changeBadge !== 'REMOVED') {
    if (line.month1Eligible && !line.month2Eligible) changeBadge = 'MONTH1_ONLY';
    else if (!line.month1Eligible && line.month2Eligible) changeBadge = 'MONTH2_ONLY';
    else if (line.month1Eligible && line.month2Eligible && month1Amount !== month2Amount) changeBadge = 'AMOUNT_CHANGED';
    else if (!prefer) changeBadge = line.changeBadge || 'UNCHANGED';
  }
  const exceptionFlags = [...(line.exceptionFlags || [])];
  if (!compact(line.accountNo) && !exceptionFlags.includes('Missing bank information')) {
    exceptionFlags.push('Missing bank information');
  }
  if (!compact(line.department) && !exceptionFlags.includes('Missing department')) {
    exceptionFlags.push('Missing department');
  }
  return {
    ...line,
    month1Amount,
    month2Amount,
    bimonthlyTotal: roundMoney(month1Amount + month2Amount),
    changeBadge,
    status: changeBadge === 'REMOVED'
      ? 'Removed'
      : exceptionFlags.length
        ? 'Exception'
        : changeBadge === 'ADDED' || changeBadge === 'AMOUNT_CHANGED'
          ? 'Changed'
          : 'Eligible',
    exceptionFlags,
  };
};

const applyTotals = (cycle: TelephoneCycle): TelephoneCycle => {
  const employees = (cycle.employees || []).map((line) => refreshLineBadge(line, line.changeBadge));
  const totals = recalcCycleTotals(employees.filter((e) => e.changeBadge !== 'REMOVED'));
  return {
    ...cycle,
    employees,
    month1Total: totals.month1Total,
    month2Total: totals.month2Total,
    bimonthlyTotal: totals.bimonthlyTotal,
    beneficiaryCount: totals.beneficiaryCount,
    updatedAt: nowIso(),
  };
};

const snapshotVersion = (
  cycle: TelephoneCycle,
  label: string,
  actor: string,
  versionNo?: number,
): CycleVersion => {
  const nextNo = versionNo || (cycle.versions?.reduce((max, v) => Math.max(max, v.versionNo), 0) || 0) + 1;
  const totals = recalcCycleTotals(cycle.employees.filter((e) => e.changeBadge !== 'REMOVED'));
  return {
    id: newId(),
    versionNo: nextNo,
    label,
    createdAt: nowIso(),
    createdBy: actor,
    snapshotJson: JSON.stringify(cycle.employees),
    month1Total: totals.month1Total,
    month2Total: totals.month2Total,
    bimonthlyTotal: totals.bimonthlyTotal,
    beneficiaryCount: totals.beneficiaryCount,
  };
};

const assertRowVersion = (cycle: TelephoneCycle, rowVersion: number) => {
  if (Number(cycle.rowVersion) !== Number(rowVersion)) {
    throw new Error(ROW_CHANGED_MSG);
  }
};

const bumpRowVersion = (cycle: TelephoneCycle): TelephoneCycle => ({
  ...cycle,
  rowVersion: Number(cycle.rowVersion || 1) + 1,
  updatedAt: nowIso(),
});

const notifyHandoff = async (opts: {
  actor: string;
  title: string;
  body: string;
  href?: string;
  roles?: string[];
  severity?: 'info' | 'success' | 'warning' | 'critical';
}) => {
  try {
    await createEnterpriseNotification(systemSession(opts.actor), {
      title: opts.title,
      body: opts.body,
      module: 'Telephone Allowance',
      kind: 'Approval',
      severity: opts.severity || 'info',
      href: opts.href || MODULE_HREF,
      recipientRoles: opts.roles || [],
      actor: opts.actor,
      channels: ['In-App'],
    });
  } catch (error) {
    console.warn('[telephone-allowance] notification skipped', error instanceof Error ? error.message : error);
  }
};

const appendAudit = async (
  mode: SqlMode,
  entry: Omit<TelephoneAudit, 'id' | 'createdAt'> & { id?: string; createdAt?: string },
) => {
  const audit: TelephoneAudit = {
    id: entry.id || newId(),
    cycleId: entry.cycleId ?? null,
    employeeCode: entry.employeeCode ?? null,
    user: entry.user,
    role: entry.role,
    action: entry.action,
    previousValue: entry.previousValue ?? null,
    newValue: entry.newValue ?? null,
    reason: entry.reason ?? null,
    workflowStage: entry.workflowStage ?? null,
    ip: entry.ip ?? null,
    createdAt: entry.createdAt || nowIso(),
  };
  if (mode.kind === 'json') {
    const store = await readJsonStore();
    store.audits.unshift(audit);
    store.audits = store.audits.slice(0, 5000);
    await writeJsonStore(store);
    return audit;
  }
  await mode.pool.request()
    .input('Id', sql.NVarChar(120), audit.id)
    .input('CycleId', sql.NVarChar(120), audit.cycleId)
    .input('EmployeeCode', sql.NVarChar(80), audit.employeeCode)
    .input('UserName', sql.NVarChar(220), audit.user)
    .input('UserRole', sql.NVarChar(120), audit.role)
    .input('ActionName', sql.NVarChar(160), audit.action)
    .input('PreviousValue', sql.NVarChar(sql.MAX), audit.previousValue)
    .input('NewValue', sql.NVarChar(sql.MAX), audit.newValue)
    .input('Reason', sql.NVarChar(700), audit.reason)
    .input('WorkflowStage', sql.NVarChar(60), audit.workflowStage)
    .input('IpAddress', sql.NVarChar(80), audit.ip)
    .input('CreatedAt', sql.DateTime2, new Date(audit.createdAt))
    .query(`
INSERT INTO [hris].[TelephoneAllowanceAudit]
  ([Id],[CycleId],[EmployeeCode],[UserName],[UserRole],[ActionName],[PreviousValue],[NewValue],[Reason],[WorkflowStage],[IpAddress],[CreatedAt])
VALUES
  (@Id,@CycleId,@EmployeeCode,@UserName,@UserRole,@ActionName,@PreviousValue,@NewValue,@Reason,@WorkflowStage,@IpAddress,@CreatedAt)
`);
  return audit;
};

/* ───────────────────────── JSON fallback ───────────────────────── */

const readJsonStore = async (): Promise<JsonStoreFile> => {
  const file = jsonStorePath();
  try {
    const raw = await fs.readFile(file, 'utf8');
    const parsed = JSON.parse(raw) as Partial<JsonStoreFile>;
    return {
      entitlements: Array.isArray(parsed.entitlements) ? parsed.entitlements : [],
      cycles: Array.isArray(parsed.cycles) ? parsed.cycles : [],
      payments: Array.isArray(parsed.payments) ? parsed.payments : [],
      exceptions: Array.isArray(parsed.exceptions) ? parsed.exceptions : [],
      audits: Array.isArray(parsed.audits) ? parsed.audits : [],
    };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return emptyJsonStore();
    throw error;
  }
};

const writeJsonStore = async (store: JsonStoreFile) => {
  const file = jsonStorePath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(store, null, 2), 'utf8');
};

/* ───────────────────────── SQL helpers ───────────────────────── */

const resolveMode = async (): Promise<SqlMode> => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) return { kind: 'json' };
  if (!schemaReady.value) {
    await pool.request().query(ensureTelephoneAllowanceSchemaSql);
    schemaReady.value = true;
  }
  return { kind: 'sql', pool };
};

const mapEntitlementRow = (row: Record<string, unknown>): TelephoneEntitlement => ({
  id: compact(row.Id),
  employeeCode: compact(row.EmployeeCode),
  employeeName: compact(row.EmployeeName),
  department: compact(row.Department),
  jobTitle: compact(row.JobTitle),
  monthlyAmount: roundMoney(Number(row.MonthlyAmount || 0)),
  effectiveFrom: compact(row.EffectiveFrom).slice(0, 10),
  effectiveTo: row.EffectiveTo ? compact(row.EffectiveTo).slice(0, 10) : null,
  status: (compact(row.Status) || 'Active') as EntitlementStatus,
  bankName: row.BankName == null ? null : compact(row.BankName),
  accountNo: row.AccountNo == null ? null : compact(row.AccountNo),
  sortCode: row.SortCode == null ? null : compact(row.SortCode),
  createdAt: row.CreatedAt instanceof Date ? row.CreatedAt.toISOString() : compact(row.CreatedAt) || nowIso(),
  updatedAt: row.UpdatedAt instanceof Date ? row.UpdatedAt.toISOString() : compact(row.UpdatedAt) || nowIso(),
  createdBy: compact(row.CreatedBy) || 'System',
});

const mapCycleRow = (row: Record<string, unknown>): TelephoneCycle => {
  const payload = parsePayload(row.PayloadJson);
  return {
    id: compact(row.Id),
    cycleCode: compact(row.CycleCode),
    year: Number(row.Year || 0),
    month1: Number(row.Month1 || 0),
    month2: Number(row.Month2 || 0),
    pairLabel: compact(row.PairLabel),
    pairCode: compact(row.PairCode),
    status: compact(row.Status) as TelephoneAllowanceStatus,
    currentOwnerRole: compact(row.CurrentOwnerRole),
    preparedBy: compact(row.PreparedBy),
    hrReviewedBy: row.HrReviewedBy == null ? null : compact(row.HrReviewedBy),
    locked: Boolean(row.Locked),
    rowVersion: Number(row.RowVersion || 1),
    month1Total: roundMoney(Number(row.Month1Total || 0)),
    month2Total: roundMoney(Number(row.Month2Total || 0)),
    bimonthlyTotal: roundMoney(Number(row.BimonthlyTotal || 0)),
    beneficiaryCount: Number(row.BeneficiaryCount || 0),
    originalBeneficiaryCount: row.OriginalBeneficiaryCount == null ? null : Number(row.OriginalBeneficiaryCount),
    originalBimonthlyTotal: row.OriginalBimonthlyTotal == null ? null : roundMoney(Number(row.OriginalBimonthlyTotal)),
    employees: payload.employees,
    versions: payload.versions,
    changes: payload.changes,
    approvals: payload.approvals,
    createdAt: row.CreatedAt instanceof Date ? row.CreatedAt.toISOString() : compact(row.CreatedAt) || nowIso(),
    updatedAt: row.UpdatedAt instanceof Date ? row.UpdatedAt.toISOString() : compact(row.UpdatedAt) || nowIso(),
    createdBy: compact(row.CreatedBy) || 'System',
  };
};

const mapPaymentRow = (row: Record<string, unknown>): TelephonePayment => {
  let items: PaymentItem[] = [];
  try {
    const parsed = typeof row.PayloadJson === 'string' ? JSON.parse(row.PayloadJson || '{}') : row.PayloadJson;
    items = Array.isArray((parsed as { items?: PaymentItem[] })?.items)
      ? (parsed as { items: PaymentItem[] }).items
      : Array.isArray(parsed)
        ? parsed as PaymentItem[]
        : [];
  } catch {
    items = [];
  }
  return {
    id: compact(row.Id),
    cycleId: compact(row.CycleId),
    cycleCode: compact(row.CycleCode),
    status: compact(row.Status) as TelephonePayment['status'],
    authorizedAmount: roundMoney(Number(row.AuthorizedAmount || 0)),
    paidAmount: roundMoney(Number(row.PaidAmount || 0)),
    beneficiaryCount: Number(row.BeneficiaryCount || 0),
    paymentDate: row.PaymentDate ? compact(row.PaymentDate).slice(0, 10) : null,
    paymentReference: row.PaymentReference == null ? null : compact(row.PaymentReference),
    bankReference: row.BankReference == null ? null : compact(row.BankReference),
    batchReference: row.BatchReference == null ? null : compact(row.BatchReference),
    remarks: row.Remarks == null ? null : compact(row.Remarks),
    items,
    createdAt: row.CreatedAt instanceof Date ? row.CreatedAt.toISOString() : compact(row.CreatedAt) || nowIso(),
    updatedAt: row.UpdatedAt instanceof Date ? row.UpdatedAt.toISOString() : compact(row.UpdatedAt) || nowIso(),
  };
};

const mapExceptionRow = (row: Record<string, unknown>): TelephoneException => ({
  id: compact(row.Id),
  cycleId: compact(row.CycleId),
  cycleCode: compact(row.CycleCode),
  employeeCode: row.EmployeeCode == null ? null : compact(row.EmployeeCode),
  employeeName: row.EmployeeName == null ? null : compact(row.EmployeeName),
  type: compact(row.Type),
  severity: (compact(row.Severity) || 'Medium') as TelephoneException['severity'],
  owner: compact(row.Owner),
  status: (compact(row.Status) || 'Open') as TelephoneException['status'],
  resolution: row.Resolution == null ? null : compact(row.Resolution),
  createdAt: row.CreatedAt instanceof Date ? row.CreatedAt.toISOString() : compact(row.CreatedAt) || nowIso(),
  resolvedAt: row.ResolvedAt ? (row.ResolvedAt instanceof Date ? row.ResolvedAt.toISOString() : compact(row.ResolvedAt)) : null,
});

const mapAuditRow = (row: Record<string, unknown>): TelephoneAudit => ({
  id: compact(row.Id),
  cycleId: row.CycleId == null ? null : compact(row.CycleId),
  employeeCode: row.EmployeeCode == null ? null : compact(row.EmployeeCode),
  user: compact(row.UserName),
  role: compact(row.UserRole),
  action: compact(row.ActionName),
  previousValue: row.PreviousValue == null ? null : String(row.PreviousValue),
  newValue: row.NewValue == null ? null : String(row.NewValue),
  reason: row.Reason == null ? null : compact(row.Reason),
  workflowStage: row.WorkflowStage == null ? null : compact(row.WorkflowStage),
  ip: row.IpAddress == null ? null : compact(row.IpAddress),
  createdAt: row.CreatedAt instanceof Date ? row.CreatedAt.toISOString() : compact(row.CreatedAt) || nowIso(),
});

const persistCycleSql = async (pool: sql.ConnectionPool, cycle: TelephoneCycle) => {
  await pool.request()
    .input('Id', sql.NVarChar(120), cycle.id)
    .input('CycleCode', sql.NVarChar(80), cycle.cycleCode)
    .input('Year', sql.Int, cycle.year)
    .input('Month1', sql.Int, cycle.month1)
    .input('Month2', sql.Int, cycle.month2)
    .input('PairLabel', sql.NVarChar(40), cycle.pairLabel)
    .input('PairCode', sql.NVarChar(20), cycle.pairCode)
    .input('Status', sql.NVarChar(60), cycle.status)
    .input('CurrentOwnerRole', sql.NVarChar(80), cycle.currentOwnerRole)
    .input('PreparedBy', sql.NVarChar(220), cycle.preparedBy)
    .input('HrReviewedBy', sql.NVarChar(220), cycle.hrReviewedBy ?? null)
    .input('Locked', sql.Bit, cycle.locked ? 1 : 0)
    .input('RowVersion', sql.Int, cycle.rowVersion)
    .input('Month1Total', sql.Decimal(18, 2), cycle.month1Total)
    .input('Month2Total', sql.Decimal(18, 2), cycle.month2Total)
    .input('BimonthlyTotal', sql.Decimal(18, 2), cycle.bimonthlyTotal)
    .input('BeneficiaryCount', sql.Int, cycle.beneficiaryCount)
    .input('OriginalBeneficiaryCount', sql.Int, cycle.originalBeneficiaryCount ?? null)
    .input('OriginalBimonthlyTotal', sql.Decimal(18, 2), cycle.originalBimonthlyTotal ?? null)
    .input('PayloadJson', sql.NVarChar(sql.MAX), serializePayload(cycle))
    .input('CreatedBy', sql.NVarChar(220), cycle.createdBy)
    .input('CreatedAt', sql.DateTime2, new Date(cycle.createdAt))
    .input('UpdatedAt', sql.DateTime2, new Date(cycle.updatedAt || nowIso()))
    .query(`
MERGE [hris].[TelephoneAllowanceCycle] AS t
USING (SELECT @Id AS [Id]) AS s ON t.[Id] = s.[Id]
WHEN MATCHED THEN UPDATE SET
  [CycleCode]=@CycleCode,[Year]=@Year,[Month1]=@Month1,[Month2]=@Month2,[PairLabel]=@PairLabel,[PairCode]=@PairCode,
  [Status]=@Status,[CurrentOwnerRole]=@CurrentOwnerRole,[PreparedBy]=@PreparedBy,[HrReviewedBy]=@HrReviewedBy,
  [Locked]=@Locked,[RowVersion]=@RowVersion,[Month1Total]=@Month1Total,[Month2Total]=@Month2Total,
  [BimonthlyTotal]=@BimonthlyTotal,[BeneficiaryCount]=@BeneficiaryCount,
  [OriginalBeneficiaryCount]=@OriginalBeneficiaryCount,[OriginalBimonthlyTotal]=@OriginalBimonthlyTotal,
  [PayloadJson]=@PayloadJson,[UpdatedAt]=@UpdatedAt
WHEN NOT MATCHED THEN INSERT
  ([Id],[CycleCode],[Year],[Month1],[Month2],[PairLabel],[PairCode],[Status],[CurrentOwnerRole],[PreparedBy],[HrReviewedBy],
   [Locked],[RowVersion],[Month1Total],[Month2Total],[BimonthlyTotal],[BeneficiaryCount],[OriginalBeneficiaryCount],
   [OriginalBimonthlyTotal],[PayloadJson],[CreatedBy],[CreatedAt],[UpdatedAt])
VALUES
  (@Id,@CycleCode,@Year,@Month1,@Month2,@PairLabel,@PairCode,@Status,@CurrentOwnerRole,@PreparedBy,@HrReviewedBy,
   @Locked,@RowVersion,@Month1Total,@Month2Total,@BimonthlyTotal,@BeneficiaryCount,@OriginalBeneficiaryCount,
   @OriginalBimonthlyTotal,@PayloadJson,@CreatedBy,@CreatedAt,@UpdatedAt);
`);
};

const persistPaymentSql = async (pool: sql.ConnectionPool, payment: TelephonePayment) => {
  await pool.request()
    .input('Id', sql.NVarChar(120), payment.id)
    .input('CycleId', sql.NVarChar(120), payment.cycleId)
    .input('CycleCode', sql.NVarChar(80), payment.cycleCode)
    .input('Status', sql.NVarChar(60), payment.status)
    .input('AuthorizedAmount', sql.Decimal(18, 2), payment.authorizedAmount)
    .input('PaidAmount', sql.Decimal(18, 2), payment.paidAmount)
    .input('BeneficiaryCount', sql.Int, payment.beneficiaryCount)
    .input('PaymentDate', sql.Date, payment.paymentDate || null)
    .input('PaymentReference', sql.NVarChar(120), payment.paymentReference ?? null)
    .input('BankReference', sql.NVarChar(120), payment.bankReference ?? null)
    .input('BatchReference', sql.NVarChar(120), payment.batchReference ?? null)
    .input('Remarks', sql.NVarChar(700), payment.remarks ?? null)
    .input('PayloadJson', sql.NVarChar(sql.MAX), JSON.stringify({ items: payment.items }))
    .input('CreatedAt', sql.DateTime2, new Date(payment.createdAt))
    .input('UpdatedAt', sql.DateTime2, new Date(payment.updatedAt || nowIso()))
    .query(`
MERGE [hris].[TelephoneAllowancePayment] AS t
USING (SELECT @Id AS [Id]) AS s ON t.[Id] = s.[Id]
WHEN MATCHED THEN UPDATE SET
  [CycleId]=@CycleId,[CycleCode]=@CycleCode,[Status]=@Status,[AuthorizedAmount]=@AuthorizedAmount,[PaidAmount]=@PaidAmount,
  [BeneficiaryCount]=@BeneficiaryCount,[PaymentDate]=@PaymentDate,[PaymentReference]=@PaymentReference,
  [BankReference]=@BankReference,[BatchReference]=@BatchReference,[Remarks]=@Remarks,[PayloadJson]=@PayloadJson,[UpdatedAt]=@UpdatedAt
WHEN NOT MATCHED THEN INSERT
  ([Id],[CycleId],[CycleCode],[Status],[AuthorizedAmount],[PaidAmount],[BeneficiaryCount],[PaymentDate],[PaymentReference],
   [BankReference],[BatchReference],[Remarks],[PayloadJson],[CreatedAt],[UpdatedAt])
VALUES
  (@Id,@CycleId,@CycleCode,@Status,@AuthorizedAmount,@PaidAmount,@BeneficiaryCount,@PaymentDate,@PaymentReference,
   @BankReference,@BatchReference,@Remarks,@PayloadJson,@CreatedAt,@UpdatedAt);
`);
};

const persistExceptionSql = async (pool: sql.ConnectionPool, ex: TelephoneException) => {
  await pool.request()
    .input('Id', sql.NVarChar(120), ex.id)
    .input('CycleId', sql.NVarChar(120), ex.cycleId)
    .input('CycleCode', sql.NVarChar(80), ex.cycleCode)
    .input('EmployeeCode', sql.NVarChar(80), ex.employeeCode ?? null)
    .input('EmployeeName', sql.NVarChar(220), ex.employeeName ?? null)
    .input('Type', sql.NVarChar(120), ex.type)
    .input('Severity', sql.NVarChar(20), ex.severity)
    .input('Owner', sql.NVarChar(220), ex.owner)
    .input('Status', sql.NVarChar(40), ex.status)
    .input('Resolution', sql.NVarChar(700), ex.resolution ?? null)
    .input('CreatedAt', sql.DateTime2, new Date(ex.createdAt))
    .input('ResolvedAt', sql.DateTime2, ex.resolvedAt ? new Date(ex.resolvedAt) : null)
    .query(`
MERGE [hris].[TelephoneAllowanceException] AS t
USING (SELECT @Id AS [Id]) AS s ON t.[Id] = s.[Id]
WHEN MATCHED THEN UPDATE SET
  [CycleId]=@CycleId,[CycleCode]=@CycleCode,[EmployeeCode]=@EmployeeCode,[EmployeeName]=@EmployeeName,
  [Type]=@Type,[Severity]=@Severity,[Owner]=@Owner,[Status]=@Status,[Resolution]=@Resolution,[ResolvedAt]=@ResolvedAt
WHEN NOT MATCHED THEN INSERT
  ([Id],[CycleId],[CycleCode],[EmployeeCode],[EmployeeName],[Type],[Severity],[Owner],[Status],[Resolution],[CreatedAt],[ResolvedAt])
VALUES
  (@Id,@CycleId,@CycleCode,@EmployeeCode,@EmployeeName,@Type,@Severity,@Owner,@Status,@Resolution,@CreatedAt,@ResolvedAt);
`);
};

const persistEntitlementSql = async (pool: sql.ConnectionPool, row: TelephoneEntitlement) => {
  await pool.request()
    .input('Id', sql.NVarChar(120), row.id)
    .input('EmployeeCode', sql.NVarChar(80), row.employeeCode)
    .input('EmployeeName', sql.NVarChar(220), row.employeeName)
    .input('Department', sql.NVarChar(180), row.department || null)
    .input('JobTitle', sql.NVarChar(180), row.jobTitle || null)
    .input('MonthlyAmount', sql.Decimal(18, 2), row.monthlyAmount)
    .input('EffectiveFrom', sql.Date, row.effectiveFrom)
    .input('EffectiveTo', sql.Date, row.effectiveTo)
    .input('Status', sql.NVarChar(40), row.status)
    .input('BankName', sql.NVarChar(180), row.bankName ?? null)
    .input('AccountNo', sql.NVarChar(80), row.accountNo ?? null)
    .input('SortCode', sql.NVarChar(40), row.sortCode ?? null)
    .input('CreatedBy', sql.NVarChar(220), row.createdBy)
    .input('CreatedAt', sql.DateTime2, new Date(row.createdAt))
    .input('UpdatedAt', sql.DateTime2, new Date(row.updatedAt))
    .query(`
MERGE [hris].[TelephoneAllowanceEntitlement] AS t
USING (SELECT @Id AS [Id]) AS s ON t.[Id] = s.[Id]
WHEN MATCHED THEN UPDATE SET
  [EmployeeCode]=@EmployeeCode,[EmployeeName]=@EmployeeName,[Department]=@Department,[JobTitle]=@JobTitle,
  [MonthlyAmount]=@MonthlyAmount,[EffectiveFrom]=@EffectiveFrom,[EffectiveTo]=@EffectiveTo,[Status]=@Status,
  [BankName]=@BankName,[AccountNo]=@AccountNo,[SortCode]=@SortCode,[UpdatedAt]=@UpdatedAt
WHEN NOT MATCHED THEN INSERT
  ([Id],[EmployeeCode],[EmployeeName],[Department],[JobTitle],[MonthlyAmount],[EffectiveFrom],[EffectiveTo],[Status],
   [BankName],[AccountNo],[SortCode],[CreatedBy],[CreatedAt],[UpdatedAt])
VALUES
  (@Id,@EmployeeCode,@EmployeeName,@Department,@JobTitle,@MonthlyAmount,@EffectiveFrom,@EffectiveTo,@Status,
   @BankName,@AccountNo,@SortCode,@CreatedBy,@CreatedAt,@UpdatedAt);
`);
};

const loadCycle = async (mode: SqlMode, idOrCode: string): Promise<TelephoneCycle | null> => {
  const key = compact(idOrCode);
  if (!key) return null;
  if (mode.kind === 'json') {
    const store = await readJsonStore();
    return store.cycles.find((c) => c.id === key || upperCode(c.cycleCode) === upperCode(key)) || null;
  }
  const rs = await mode.pool.request()
    .input('Key', sql.NVarChar(120), key)
    .query(`
SELECT TOP 1 * FROM [hris].[TelephoneAllowanceCycle]
WHERE [Id] = @Key OR [CycleCode] = @Key
`);
  const row = rs.recordset?.[0];
  return row ? mapCycleRow(row) : null;
};

const saveCycle = async (mode: SqlMode, cycle: TelephoneCycle) => {
  const next = applyTotals(cycle);
  if (mode.kind === 'json') {
    const store = await readJsonStore();
    const idx = store.cycles.findIndex((c) => c.id === next.id);
    if (idx >= 0) store.cycles[idx] = next;
    else store.cycles.unshift(next);
    await writeJsonStore(store);
    return next;
  }
  await persistCycleSql(mode.pool, next);
  return next;
};

const loadPaymentsForCycle = async (mode: SqlMode, cycleId: string): Promise<TelephonePayment[]> => {
  if (mode.kind === 'json') {
    const store = await readJsonStore();
    return store.payments.filter((p) => p.cycleId === cycleId);
  }
  const rs = await mode.pool.request()
    .input('CycleId', sql.NVarChar(120), cycleId)
    .query(`SELECT * FROM [hris].[TelephoneAllowancePayment] WHERE [CycleId] = @CycleId ORDER BY [CreatedAt] DESC`);
  return (rs.recordset || []).map(mapPaymentRow);
};

const directoryIndex = async () => {
  const source = await readPayrollEmployees();
  const byCode = new Map<string, {
    employeeCode: string;
    employeeName: string;
    department: string;
    jobTitle: string;
    bankName: string | null;
    accountNo: string | null;
    sortCode: string | null;
    status: string;
  }>();
  for (const emp of source.employees) {
    const code = upperCode(emp.employeeCode || emp.employeeId);
    if (!code) continue;
    byCode.set(code, {
      employeeCode: compact(emp.employeeCode) || code,
      employeeName: compact(emp.fullName),
      department: compact(emp.department),
      jobTitle: compact(emp.jobTitle),
      bankName: compact(emp.bankName) || null,
      accountNo: compact(emp.accountNo) || null,
      sortCode: compact(emp.branchCode) || null,
      status: compact(emp.status),
    });
  }
  return byCode;
};

const syncExceptionsForCycle = async (mode: SqlMode, cycle: TelephoneCycle, actor: string) => {
  const openTypes = new Set<string>();
  const created: TelephoneException[] = [];
  for (const line of cycle.employees) {
    if (line.changeBadge === 'REMOVED') continue;
    for (const flag of line.exceptionFlags || []) {
      const key = `${line.employeeCode}|${flag}`;
      openTypes.add(key);
      created.push({
        id: newId(),
        cycleId: cycle.id,
        cycleCode: cycle.cycleCode,
        employeeCode: line.employeeCode,
        employeeName: line.employeeName,
        type: flag,
        severity: /bank/i.test(flag) ? 'Critical' : 'Medium',
        owner: actor,
        status: 'Open',
        resolution: null,
        createdAt: nowIso(),
        resolvedAt: null,
      });
    }
  }

  if (mode.kind === 'json') {
    const store = await readJsonStore();
    const others = store.exceptions.filter((e) => e.cycleId !== cycle.id || e.status === 'Resolved');
    const existingOpen = store.exceptions.filter((e) => e.cycleId === cycle.id && e.status !== 'Resolved');
    const keep = existingOpen.filter((e) => openTypes.has(`${e.employeeCode || ''}|${e.type}`));
    const keepKeys = new Set(keep.map((e) => `${e.employeeCode || ''}|${e.type}`));
    const add = created.filter((e) => !keepKeys.has(`${e.employeeCode || ''}|${e.type}`));
    store.exceptions = [...add, ...keep, ...others];
    await writeJsonStore(store);
    return;
  }

  const existing = await mode.pool.request()
    .input('CycleId', sql.NVarChar(120), cycle.id)
    .query(`SELECT * FROM [hris].[TelephoneAllowanceException] WHERE [CycleId] = @CycleId AND [Status] <> N'Resolved'`);
  const existingRows = (existing.recordset || []).map(mapExceptionRow);
  const keepKeys = new Set(existingRows.map((e) => `${e.employeeCode || ''}|${e.type}`));
  for (const ex of created) {
    const key = `${ex.employeeCode || ''}|${ex.type}`;
    if (keepKeys.has(key)) continue;
    await persistExceptionSql(mode.pool, ex);
  }
};

/* ───────────────────────── Validation ───────────────────────── */

export const validateCycleForApproval = (cycle: TelephoneCycle): CycleValidationResult => {
  const critical: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const active = (cycle.employees || []).filter((e) => e.changeBadge !== 'REMOVED');

  if (!active.length) {
    critical.push({ code: 'NO_EMPLOYEES', message: 'Schedule has no employees.' });
  }
  if (roundMoney(cycle.bimonthlyTotal) <= 0) {
    critical.push({ code: 'ZERO_TOTAL', message: 'Bimonthly total must be greater than zero.' });
  }

  const totals = recalcCycleTotals(active);
  if (roundMoney(totals.bimonthlyTotal) !== roundMoney(cycle.bimonthlyTotal)) {
    critical.push({ code: 'TOTAL_MISMATCH', message: 'Header totals do not match employee lines.' });
  }
  if (roundMoney(totals.month1Total + totals.month2Total) !== roundMoney(totals.bimonthlyTotal)) {
    critical.push({ code: 'MONTH_SUM', message: 'Bimonthly total must equal month1 + month2.' });
  }

  for (const line of active) {
    if (!lineTotalsConsistent(line)) {
      critical.push({
        code: 'LINE_TOTAL',
        message: `Line total mismatch for ${line.employeeCode}.`,
        employeeCode: line.employeeCode,
      });
    }
    if (line.bimonthlyTotal > 0 && !compact(line.accountNo)) {
      critical.push({
        code: 'MISSING_BANK',
        message: `Missing bank account for ${line.employeeCode}.`,
        employeeCode: line.employeeCode,
      });
    }
    if (!line.month1Eligible && !line.month2Eligible && line.bimonthlyTotal > 0) {
      critical.push({
        code: 'INELIGIBLE_PAID',
        message: `${line.employeeCode} has amount but no eligible month.`,
        employeeCode: line.employeeCode,
      });
    }
    if ((line.exceptionFlags || []).length) {
      warnings.push({
        code: 'LINE_EXCEPTION',
        message: `${line.employeeCode}: ${line.exceptionFlags.join('; ')}`,
        employeeCode: line.employeeCode,
      });
    }
    if (line.changeBadge === 'AMOUNT_CHANGED' || line.changeBadge === 'ADDED' || line.changeBadge === 'REMOVED') {
      warnings.push({
        code: 'CHANGE_BADGE',
        message: `${line.employeeCode} marked ${line.changeBadge}.`,
        employeeCode: line.employeeCode,
      });
    }
  }

  return { ok: critical.length === 0, critical, warnings };
};

/* ───────────────────────── Entitlements ───────────────────────── */

export const listEntitlements = async (): Promise<TelephoneEntitlement[]> => {
  const mode = await resolveMode();
  if (mode.kind === 'json') {
    const store = await readJsonStore();
    return [...store.entitlements].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  const rs = await mode.pool.request().query(`
SELECT * FROM [hris].[TelephoneAllowanceEntitlement]
ORDER BY [UpdatedAt] DESC
`);
  return (rs.recordset || []).map(mapEntitlementRow);
};

export const upsertEntitlement = async (input: EntitlementUpsertInput, actor: TelephoneActor): Promise<TelephoneEntitlement> => {
  const mode = await resolveMode();
  const code = upperCode(input.employeeCode);
  if (!code) throw new Error('Employee code is required.');
  const amount = roundMoney(Number(input.monthlyAmount));
  if (!(amount > 0)) throw new Error('Monthly amount must be greater than zero.');
  const effectiveFrom = compact(input.effectiveFrom).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) throw new Error('effectiveFrom must be YYYY-MM-DD.');

  const directory = await directoryIndex();
  const dir = directory.get(code);
  const existingId = compact(input.id);
  let previous: TelephoneEntitlement | null = null;

  if (mode.kind === 'json') {
    const store = await readJsonStore();
    previous = existingId
      ? store.entitlements.find((e) => e.id === existingId) || null
      : store.entitlements.find((e) => upperCode(e.employeeCode) === code && e.status === 'Active') || null;
  } else if (existingId) {
    const rs = await mode.pool.request()
      .input('Id', sql.NVarChar(120), existingId)
      .query(`SELECT TOP 1 * FROM [hris].[TelephoneAllowanceEntitlement] WHERE [Id] = @Id`);
    previous = rs.recordset?.[0] ? mapEntitlementRow(rs.recordset[0]) : null;
  }

  const row: TelephoneEntitlement = {
    id: previous?.id || existingId || newId(),
    employeeCode: dir?.employeeCode || code,
    employeeName: compact(input.employeeName) || dir?.employeeName || previous?.employeeName || code,
    department: compact(input.department) || dir?.department || previous?.department || '',
    jobTitle: compact(input.jobTitle) || dir?.jobTitle || previous?.jobTitle || '',
    monthlyAmount: amount,
    effectiveFrom,
    effectiveTo: input.effectiveTo ? compact(input.effectiveTo).slice(0, 10) : null,
    status: (input.status || previous?.status || 'Active') as EntitlementStatus,
    bankName: input.bankName !== undefined ? input.bankName : (dir?.bankName ?? previous?.bankName ?? null),
    accountNo: input.accountNo !== undefined ? input.accountNo : (dir?.accountNo ?? previous?.accountNo ?? null),
    sortCode: input.sortCode !== undefined ? input.sortCode : (dir?.sortCode ?? previous?.sortCode ?? null),
    createdAt: previous?.createdAt || nowIso(),
    updatedAt: nowIso(),
    createdBy: previous?.createdBy || actor,
  };

  if (mode.kind === 'json') {
    const store = await readJsonStore();
    const idx = store.entitlements.findIndex((e) => e.id === row.id);
    if (idx >= 0) store.entitlements[idx] = row;
    else store.entitlements.unshift(row);
    await writeJsonStore(store);
  } else {
    await persistEntitlementSql(mode.pool, row);
  }

  await appendAudit(mode, {
    employeeCode: row.employeeCode,
    user: actor,
    role: 'IT',
    action: previous ? 'ENTITLEMENT_UPDATE' : 'ENTITLEMENT_CREATE',
    previousValue: previous ? JSON.stringify(previous) : null,
    newValue: JSON.stringify(row),
  });
  return row;
};

/* ───────────────────────── Cycles ───────────────────────── */

export const listCycles = async (): Promise<TelephoneCycle[]> => {
  const mode = await resolveMode();
  if (mode.kind === 'json') {
    const store = await readJsonStore();
    return [...store.cycles].sort((a, b) => `${b.year}-${b.month1}`.localeCompare(`${a.year}-${a.month1}`) || b.updatedAt.localeCompare(a.updatedAt));
  }
  const rs = await mode.pool.request().query(`
SELECT * FROM [hris].[TelephoneAllowanceCycle]
ORDER BY [Year] DESC, [Month1] DESC, [UpdatedAt] DESC
`);
  return (rs.recordset || []).map(mapCycleRow);
};

export const getCycle = async (idOrCode: string): Promise<TelephoneCycle | null> => {
  const mode = await resolveMode();
  return loadCycle(mode, idOrCode);
};

export const getCurrentCycle = async (): Promise<TelephoneCycle | null> => {
  const cycles = await listCycles();
  if (!cycles.length) return null;
  const open = cycles.find((c) => !['PAID', 'COMPLETED'].includes(c.status));
  if (open) return open;
  const { year, pair } = currentOpenPair();
  return cycles.find((c) => c.year === year && c.pairCode === pair.code) || cycles[0] || null;
};

export const createNextCycle = async (
  actor: TelephoneActor,
  opts?: { year?: number; pairCode?: string },
): Promise<TelephoneCycle> => {
  const mode = await resolveMode();
  const cycles = await listCycles();
  let year: number;
  let pair = opts?.pairCode ? pairForCode(opts.pairCode) : null;

  if (opts?.year && pair) {
    year = opts.year;
  } else if (cycles.length) {
    const latest = [...cycles].sort((a, b) => a.year - b.year || a.month1 - b.month1).at(-1)!;
    const next = nextPairAfter(latest.year, latest.month1);
    year = opts?.year || next.year;
    pair = pair || next.pair;
  } else {
    const open = currentOpenPair();
    year = opts?.year || open.year;
    pair = pair || open.pair;
  }

  const duplicate = cycles.find((c) => c.year === year && c.pairCode === pair!.code);
  if (duplicate) {
    throw new Error(`A cycle already exists for ${year} ${pair!.label} (${duplicate.cycleCode}).`);
  }

  const samePairCount = cycles.filter((c) => c.year === year && c.pairCode === pair!.code).length;
  const entitlements = await listEntitlements();
  const directory = await directoryIndex();
  const codes = new Set<string>();
  for (const ent of entitlements) {
    if (ent.status === 'Suspended') continue;
    codes.add(upperCode(ent.employeeCode));
  }

  const employees: CycleEmployeeLine[] = [];
  for (const code of codes) {
    const dir = directory.get(code);
    const line = buildLineFromEntitlements(entitlements, dir?.employeeCode || code, year, pair!, {
      employeeName: dir?.employeeName,
      department: dir?.department,
      jobTitle: dir?.jobTitle,
      bankName: dir?.bankName,
      accountNo: dir?.accountNo,
      sortCode: dir?.sortCode,
    });
    if (line) employees.push(refreshLineBadge({ ...line, id: newId() }, line.changeBadge));
  }

  const now = nowIso();
  let cycle: TelephoneCycle = {
    id: newId(),
    cycleCode: buildCycleCode(year, pair!.code, samePairCount + 1),
    year,
    month1: pair!.month1,
    month2: pair!.month2,
    pairLabel: pair!.label,
    pairCode: pair!.code,
    status: 'DRAFT',
    currentOwnerRole: 'IT',
    preparedBy: actor,
    hrReviewedBy: null,
    locked: false,
    rowVersion: 1,
    month1Total: 0,
    month2Total: 0,
    bimonthlyTotal: 0,
    beneficiaryCount: 0,
    originalBeneficiaryCount: null,
    originalBimonthlyTotal: null,
    employees,
    versions: [],
    changes: [],
    approvals: [],
    createdAt: now,
    updatedAt: now,
    createdBy: actor,
  };
  cycle = applyTotals(cycle);
  cycle.originalBeneficiaryCount = cycle.beneficiaryCount;
  cycle.originalBimonthlyTotal = cycle.bimonthlyTotal;
  cycle.versions = [snapshotVersion(cycle, 'IT Original', actor, 1)];

  cycle = await saveCycle(mode, cycle);
  await syncExceptionsForCycle(mode, cycle, actor);
  await appendAudit(mode, {
    cycleId: cycle.id,
    user: actor,
    role: 'IT',
    action: 'CREATE_CYCLE',
    newValue: cycle.cycleCode,
    workflowStage: cycle.status,
  });
  return cycle;
};

export const saveCycleDraft = async (
  cycleId: string,
  rowVersion: number,
  patch: CycleDraftPatch,
  actor: TelephoneActor,
): Promise<TelephoneCycle> => {
  const mode = await resolveMode();
  const existing = await loadCycle(mode, cycleId);
  if (!existing) throw new Error('Cycle not found.');
  assertRowVersion(existing, rowVersion);
  if (!canEditSchedule(existing.status, existing.locked)) {
    throw new Error(`Schedule cannot be edited in status ${existing.status}.`);
  }

  let next: TelephoneCycle = {
    ...existing,
    preparedBy: patch.preparedBy || existing.preparedBy,
    currentOwnerRole: patch.currentOwnerRole || existing.currentOwnerRole,
    employees: patch.employees
      ? patch.employees.map((line) => refreshLineBadge(line, line.changeBadge))
      : existing.employees,
  };
  next = bumpRowVersion(applyTotals(next));
  next = await saveCycle(mode, next);
  await syncExceptionsForCycle(mode, next, actor);
  await appendAudit(mode, {
    cycleId: next.id,
    user: actor,
    role: 'IT',
    action: 'SAVE_DRAFT',
    previousValue: String(existing.rowVersion),
    newValue: String(next.rowVersion),
    workflowStage: next.status,
  });
  return next;
};

export const sendToHrReview = async (
  cycleId: string,
  rowVersion: number,
  actor: TelephoneActor,
): Promise<TelephoneCycle> => {
  const mode = await resolveMode();
  let cycle = await loadCycle(mode, cycleId);
  if (!cycle) throw new Error('Cycle not found.');
  if (cycle.status === 'PENDING_HR_REVIEW') return cycle;
  assertRowVersion(cycle, rowVersion);
  assertTransition(cycle.status, 'PENDING_HR_REVIEW');

  const hasItOriginal = cycle.versions.some((v) => v.label === 'IT Original');
  if (!hasItOriginal) {
    cycle = {
      ...cycle,
      versions: [...cycle.versions, snapshotVersion(cycle, 'IT Original', actor)],
    };
  }

  cycle = bumpRowVersion({
    ...applyTotals(cycle),
    status: 'PENDING_HR_REVIEW',
    currentOwnerRole: ownerRoleForStatus('PENDING_HR_REVIEW'),
    locked: false,
  });
  cycle = await saveCycle(mode, cycle);
  await appendAudit(mode, {
    cycleId: cycle.id,
    user: actor,
    role: 'IT',
    action: 'SEND_TO_HR_REVIEW',
    newValue: cycle.status,
    workflowStage: cycle.status,
  });
  await notifyHandoff({
    actor,
    title: `Telephone allowance ready for HR review`,
    body: `${cycle.cycleCode} (${cycle.pairLabel} ${cycle.year}) was sent for HR review by ${actor}.`,
    href: `${MODULE_HREF}/manage`,
    roles: ['HR Manager', 'HR Officer', 'HR'],
  });
  return cycle;
};

const requireHrReviewCycle = async (mode: SqlMode, cycleId: string, rowVersion: number) => {
  const cycle = await loadCycle(mode, cycleId);
  if (!cycle) throw new Error('Cycle not found.');
  assertRowVersion(cycle, rowVersion);
  if (!canHrReviewEdit(cycle.status)) {
    throw new Error('HR edits are only allowed while the cycle is in PENDING_HR_REVIEW.');
  }
  return cycle;
};

export const hrAddEmployee = async (
  cycleId: string,
  rowVersion: number,
  input: HrAddEmployeeInput,
  actor: TelephoneActor,
): Promise<TelephoneCycle> => {
  const mode = await resolveMode();
  let cycle = await requireHrReviewCycle(mode, cycleId, rowVersion);
  const code = upperCode(input.employeeCode);
  if (!code) throw new Error('Employee code is required.');
  if (cycle.employees.some((e) => upperCode(e.employeeCode) === code && e.changeBadge !== 'REMOVED')) {
    throw new Error(`Employee ${code} is already on this schedule.`);
  }

  const directory = await directoryIndex();
  const dir = directory.get(code);
  const month1Eligible = input.month1Eligible !== false;
  const month2Eligible = input.month2Eligible !== false;
  const rate = roundMoney(Number(input.monthlyRate));
  const month1Amount = roundMoney(input.month1Amount ?? (month1Eligible ? rate : 0));
  const month2Amount = roundMoney(input.month2Amount ?? (month2Eligible ? rate : 0));

  const line = refreshLineBadge({
    id: newId(),
    employeeCode: dir?.employeeCode || code,
    employeeName: compact(input.employeeName) || dir?.employeeName || code,
    department: compact(input.department) || dir?.department || '',
    jobTitle: compact(input.jobTitle) || dir?.jobTitle || '',
    monthlyRate: rate,
    month1Eligible,
    month1Amount: month1Eligible ? month1Amount : 0,
    month2Eligible,
    month2Amount: month2Eligible ? month2Amount : 0,
    bimonthlyTotal: 0,
    changeBadge: 'ADDED',
    changeReason: input.reason,
    status: 'Changed',
    bankName: input.bankName ?? dir?.bankName ?? null,
    accountNo: input.accountNo ?? dir?.accountNo ?? null,
    sortCode: input.sortCode ?? dir?.sortCode ?? null,
    exceptionFlags: [],
  }, 'ADDED');

  const change: CycleChange = {
    id: newId(),
    employeeCode: line.employeeCode,
    employeeName: line.employeeName,
    changeType: 'ADD',
    effectiveMonth: month1Eligible && month2Eligible ? 'BOTH' : month1Eligible ? 1 : 2,
    previousMonthlyRate: null,
    newMonthlyRate: rate,
    month1Eligible,
    month2Eligible,
    reason: input.reason,
    comment: input.comment ?? null,
    actor,
    createdAt: nowIso(),
  };

  cycle = bumpRowVersion(applyTotals({
    ...cycle,
    employees: [...cycle.employees.filter((e) => !(upperCode(e.employeeCode) === code && e.changeBadge === 'REMOVED')), line],
    changes: [change, ...cycle.changes],
  }));
  cycle = await saveCycle(mode, cycle);
  await syncExceptionsForCycle(mode, cycle, actor);
  await appendAudit(mode, {
    cycleId: cycle.id,
    employeeCode: line.employeeCode,
    user: actor,
    role: 'HR Review',
    action: 'HR_ADD_EMPLOYEE',
    newValue: JSON.stringify(line),
    reason: input.reason,
    workflowStage: cycle.status,
  });
  return cycle;
};

export const hrRemoveEmployee = async (
  cycleId: string,
  rowVersion: number,
  employeeCode: string,
  reason: string,
  actor: TelephoneActor,
  comment?: string | null,
  effectiveMonth: 1 | 2 | 'BOTH' = 'BOTH',
): Promise<TelephoneCycle> => {
  const mode = await resolveMode();
  let cycle = await requireHrReviewCycle(mode, cycleId, rowVersion);
  const code = upperCode(employeeCode);
  const idx = cycle.employees.findIndex((e) => upperCode(e.employeeCode) === code);
  if (idx < 0) throw new Error(`Employee ${code} not found on schedule.`);
  const previous = cycle.employees[idx];
  const clearMonth1 = effectiveMonth === 1 || effectiveMonth === 'BOTH';
  const clearMonth2 = effectiveMonth === 2 || effectiveMonth === 'BOTH';
  const next = {
    ...previous,
    month1Eligible: clearMonth1 ? false : previous.month1Eligible,
    month2Eligible: clearMonth2 ? false : previous.month2Eligible,
    month1Amount: clearMonth1 ? 0 : previous.month1Amount,
    month2Amount: clearMonth2 ? 0 : previous.month2Amount,
    bimonthlyTotal: 0,
    changeBadge: 'REMOVED' as const,
    changeReason: reason,
    status: 'Removed' as const,
  };
  const removed = refreshLineBadge({
    ...next,
    changeBadge: (!next.month1Eligible && !next.month2Eligible)
      ? 'REMOVED'
      : (!next.month1Eligible ? 'MONTH2_ONLY' : !next.month2Eligible ? 'MONTH1_ONLY' : 'REMOVED'),
    status: (!next.month1Eligible && !next.month2Eligible) ? 'Removed' : 'Changed',
  }, (!next.month1Eligible && !next.month2Eligible) ? 'REMOVED' : (!next.month1Eligible ? 'MONTH2_ONLY' : 'MONTH1_ONLY'));

  const change: CycleChange = {
    id: newId(),
    employeeCode: previous.employeeCode,
    employeeName: previous.employeeName,
    changeType: 'REMOVE',
    effectiveMonth,
    previousMonthlyRate: previous.monthlyRate,
    newMonthlyRate: 0,
    month1Eligible: removed.month1Eligible,
    month2Eligible: removed.month2Eligible,
    reason,
    comment: comment ?? null,
    actor,
    createdAt: nowIso(),
  };

  const employees = [...cycle.employees];
  employees[idx] = removed;
  cycle = bumpRowVersion(applyTotals({
    ...cycle,
    employees,
    changes: [change, ...cycle.changes],
  }));
  cycle = await saveCycle(mode, cycle);
  await appendAudit(mode, {
    cycleId: cycle.id,
    employeeCode: previous.employeeCode,
    user: actor,
    role: 'HR Review',
    action: 'HR_REMOVE_EMPLOYEE',
    previousValue: JSON.stringify(previous),
    reason,
    workflowStage: cycle.status,
  });
  return cycle;
};

export const hrAdjustAmount = async (
  cycleId: string,
  rowVersion: number,
  input: HrAdjustAmountInput,
  actor: TelephoneActor,
): Promise<TelephoneCycle> => {
  const mode = await resolveMode();
  let cycle = await requireHrReviewCycle(mode, cycleId, rowVersion);
  const code = upperCode(input.employeeCode);
  const idx = cycle.employees.findIndex((e) => upperCode(e.employeeCode) === code && e.changeBadge !== 'REMOVED');
  if (idx < 0) throw new Error(`Employee ${code} not found on schedule.`);
  const previous = cycle.employees[idx];

  const month1Eligible = input.month1Eligible ?? previous.month1Eligible;
  const month2Eligible = input.month2Eligible ?? previous.month2Eligible;
  const rate = roundMoney(input.monthlyRate ?? previous.monthlyRate);
  let month1Amount = roundMoney(input.month1Amount ?? (month1Eligible ? rate : 0));
  let month2Amount = roundMoney(input.month2Amount ?? (month2Eligible ? rate : 0));
  if (input.effectiveMonth === 1) {
    month2Amount = previous.month2Amount;
  } else if (input.effectiveMonth === 2) {
    month1Amount = previous.month1Amount;
  }

  const nextLine = refreshLineBadge({
    ...previous,
    monthlyRate: rate,
    month1Eligible,
    month2Eligible,
    month1Amount: month1Eligible ? month1Amount : 0,
    month2Amount: month2Eligible ? month2Amount : 0,
    changeBadge: 'AMOUNT_CHANGED',
    changeReason: input.reason,
    status: 'Changed',
  }, 'AMOUNT_CHANGED');

  const change: CycleChange = {
    id: newId(),
    employeeCode: previous.employeeCode,
    employeeName: previous.employeeName,
    changeType: input.month1Eligible !== undefined || input.month2Eligible !== undefined ? 'ELIGIBILITY' : 'AMOUNT',
    effectiveMonth: input.effectiveMonth || (month1Eligible && month2Eligible ? 'BOTH' : month1Eligible ? 1 : 2),
    previousMonthlyRate: previous.monthlyRate,
    newMonthlyRate: rate,
    month1Eligible,
    month2Eligible,
    reason: input.reason,
    comment: input.comment ?? null,
    actor,
    createdAt: nowIso(),
  };

  const employees = [...cycle.employees];
  employees[idx] = nextLine;
  cycle = bumpRowVersion(applyTotals({
    ...cycle,
    employees,
    changes: [change, ...cycle.changes],
  }));
  cycle = await saveCycle(mode, cycle);
  await syncExceptionsForCycle(mode, cycle, actor);
  await appendAudit(mode, {
    cycleId: cycle.id,
    employeeCode: previous.employeeCode,
    user: actor,
    role: 'HR Review',
    action: 'HR_ADJUST_AMOUNT',
    previousValue: JSON.stringify(previous),
    newValue: JSON.stringify(nextLine),
    reason: input.reason,
    workflowStage: cycle.status,
  });
  return cycle;
};

export const completeHrReview = async (
  cycleId: string,
  rowVersion: number,
  actor: TelephoneActor,
  comment?: string | null,
): Promise<TelephoneCycle> => {
  const mode = await resolveMode();
  let cycle = await loadCycle(mode, cycleId);
  if (!cycle) throw new Error('Cycle not found.');
  assertRowVersion(cycle, rowVersion);
  assertTransition(cycle.status, 'RETURNED_TO_IT');

  cycle = applyTotals({
    ...cycle,
    status: 'RETURNED_TO_IT',
    currentOwnerRole: ownerRoleForStatus('RETURNED_TO_IT'),
    hrReviewedBy: actor,
    versions: [...cycle.versions, snapshotVersion(cycle, 'HR Reviewed', actor, 2)],
  });
  cycle = bumpRowVersion(cycle);
  cycle = await saveCycle(mode, cycle);
  await appendAudit(mode, {
    cycleId: cycle.id,
    user: actor,
    role: 'HR Review',
    action: 'COMPLETE_HR_REVIEW',
    newValue: cycle.status,
    reason: comment || null,
    workflowStage: cycle.status,
  });
  await notifyHandoff({
    actor,
    title: `HR review completed — ${cycle.cycleCode}`,
    body: `${actor} completed HR review${comment ? `: ${comment}` : ''}. IT validation can proceed.`,
    href: `${MODULE_HREF}/manage`,
    roles: ['IT', 'IT Admin', 'IT Support'],
    severity: 'success',
  });
  return cycle;
};

export const initiateApproval = async (
  cycleId: string,
  rowVersion: number,
  actor: TelephoneActor,
): Promise<TelephoneCycle> => {
  const mode = await resolveMode();
  let cycle = await loadCycle(mode, cycleId);
  if (!cycle) throw new Error('Cycle not found.');
  if (cycle.status === 'PENDING_HR_APPROVAL' && cycle.locked) return cycle;
  assertRowVersion(cycle, rowVersion);
  assertTransition(cycle.status, 'PENDING_HR_APPROVAL');

  const validation = validateCycleForApproval(cycle);
  if (!validation.ok) {
    throw new Error(`Cannot initiate approval: ${validation.critical.map((c) => c.message).join(' ')}`);
  }

  cycle = applyTotals({
    ...cycle,
    status: 'PENDING_HR_APPROVAL',
    currentOwnerRole: ownerRoleForStatus('PENDING_HR_APPROVAL'),
    locked: true,
    versions: [...cycle.versions, snapshotVersion(cycle, 'Final Approval Snapshot', actor)],
  });
  cycle = bumpRowVersion(cycle);
  cycle = await saveCycle(mode, cycle);
  await appendAudit(mode, {
    cycleId: cycle.id,
    user: actor,
    role: 'IT',
    action: 'INITIATE_APPROVAL',
    newValue: cycle.status,
    workflowStage: cycle.status,
  });
  await notifyHandoff({
    actor,
    title: `Approval initiated — ${cycle.cycleCode}`,
    body: `${cycle.cycleCode} is locked and pending HR formal approval.`,
    href: `${MODULE_HREF}/approvals`,
    roles: ['HR Manager', 'HR Approver'],
  });
  return cycle;
};

const assertCanApproveOwn = (cycle: TelephoneCycle, actor: string, canApproveOwn: boolean) => {
  if (canApproveOwn) return;
  const prep = compact(cycle.preparedBy).toLowerCase();
  const act = compact(actor).toLowerCase();
  if (prep && act && prep === act) {
    throw new Error('Segregation of duties: the preparer cannot formally approve their own schedule.');
  }
};

const pushApproval = (
  cycle: TelephoneCycle,
  stage: CycleApproval['stage'],
  action: CycleApproval['action'],
  actor: string,
  actorRole: string,
  comment?: string | null,
  reason?: string | null,
): TelephoneCycle => ({
  ...cycle,
  approvals: [
    {
      id: newId(),
      stage,
      action,
      actor,
      actorRole,
      comment: comment ?? null,
      reason: reason ?? null,
      createdAt: nowIso(),
    },
    ...cycle.approvals,
  ],
});

export const approveHr = async (
  cycleId: string,
  rowVersion: number,
  actor: TelephoneActor,
  comment: string | null | undefined,
  canApproveOwn: boolean,
): Promise<TelephoneCycle> => {
  const mode = await resolveMode();
  let cycle = await loadCycle(mode, cycleId);
  if (!cycle) throw new Error('Cycle not found.');
  assertRowVersion(cycle, rowVersion);
  assertCanApproveOwn(cycle, actor, canApproveOwn);
  assertTransition(cycle.status, 'PENDING_MD_APPROVAL');

  cycle = bumpRowVersion(pushApproval({
    ...cycle,
    status: 'PENDING_MD_APPROVAL',
    currentOwnerRole: ownerRoleForStatus('PENDING_MD_APPROVAL'),
  }, 'HR', 'APPROVE', actor, 'HR Approver', comment));
  cycle = await saveCycle(mode, cycle);
  await appendAudit(mode, {
    cycleId: cycle.id,
    user: actor,
    role: 'HR Approver',
    action: 'APPROVE_HR',
    newValue: cycle.status,
    reason: comment || null,
    workflowStage: cycle.status,
  });
  await notifyHandoff({
    actor,
    title: `HR approved — ${cycle.cycleCode}`,
    body: `Awaiting MD approval.`,
    href: `${MODULE_HREF}/approvals`,
    roles: ['MD', 'CEO', 'Executive'],
    severity: 'success',
  });
  return cycle;
};

export const approveMd = async (
  cycleId: string,
  rowVersion: number,
  actor: TelephoneActor,
  comment: string | null | undefined,
  canApproveOwn: boolean,
): Promise<TelephoneCycle> => {
  const mode = await resolveMode();
  let cycle = await loadCycle(mode, cycleId);
  if (!cycle) throw new Error('Cycle not found.');
  assertRowVersion(cycle, rowVersion);
  assertCanApproveOwn(cycle, actor, canApproveOwn);
  assertTransition(cycle.status, 'PENDING_CFO_AUTHORIZATION');

  cycle = bumpRowVersion(pushApproval({
    ...cycle,
    status: 'PENDING_CFO_AUTHORIZATION',
    currentOwnerRole: ownerRoleForStatus('PENDING_CFO_AUTHORIZATION'),
  }, 'MD', 'APPROVE', actor, 'MD', comment));
  cycle = await saveCycle(mode, cycle);
  await appendAudit(mode, {
    cycleId: cycle.id,
    user: actor,
    role: 'MD',
    action: 'APPROVE_MD',
    newValue: cycle.status,
    reason: comment || null,
    workflowStage: cycle.status,
  });
  await notifyHandoff({
    actor,
    title: `MD approved — ${cycle.cycleCode}`,
    body: `Awaiting CFO authorization for payment.`,
    href: `${MODULE_HREF}/approvals`,
    roles: ['CFO'],
    severity: 'success',
  });
  return cycle;
};

export const authorizeCfo = async (
  cycleId: string,
  rowVersion: number,
  actor: TelephoneActor,
  comment: string | null | undefined,
  canApproveOwn: boolean,
): Promise<TelephoneCycle> => {
  const mode = await resolveMode();
  let cycle = await loadCycle(mode, cycleId);
  if (!cycle) throw new Error('Cycle not found.');
  assertRowVersion(cycle, rowVersion);
  assertCanApproveOwn(cycle, actor, canApproveOwn);
  assertTransition(cycle.status, 'AUTHORIZED_FOR_PAYMENT');

  cycle = bumpRowVersion(pushApproval({
    ...cycle,
    status: 'AUTHORIZED_FOR_PAYMENT',
    currentOwnerRole: ownerRoleForStatus('AUTHORIZED_FOR_PAYMENT'),
  }, 'CFO', 'AUTHORIZE', actor, 'CFO', comment));
  cycle = await saveCycle(mode, cycle);
  await appendAudit(mode, {
    cycleId: cycle.id,
    user: actor,
    role: 'CFO',
    action: 'AUTHORIZE_CFO',
    newValue: cycle.status,
    reason: comment || null,
    workflowStage: cycle.status,
  });
  await notifyHandoff({
    actor,
    title: `Authorized for payment — ${cycle.cycleCode}`,
    body: `CFO authorized ${cycle.cycleCode}. Treasury can generate the payment schedule.`,
    href: `${MODULE_HREF}/payment-reporting`,
    roles: ['Treasury', 'Treasury Officer', 'Finance'],
    severity: 'success',
  });
  return cycle;
};

export const returnForCorrection = async (
  cycleId: string,
  rowVersion: number,
  actor: TelephoneActor,
  reason: string,
  canApproveOwn = true,
): Promise<TelephoneCycle> => {
  const mode = await resolveMode();
  let cycle = await loadCycle(mode, cycleId);
  if (!cycle) throw new Error('Cycle not found.');
  assertRowVersion(cycle, rowVersion);
  assertCanApproveOwn(cycle, actor, canApproveOwn);
  if (!compact(reason)) throw new Error('A return reason is required.');
  assertTransition(cycle.status, 'RETURNED_FOR_CORRECTION');

  const stage: CycleApproval['stage'] =
    cycle.status === 'PENDING_HR_APPROVAL' ? 'HR' : cycle.status === 'PENDING_MD_APPROVAL' ? 'MD' : 'CFO';

  cycle = bumpRowVersion(pushApproval({
    ...cycle,
    status: 'RETURNED_FOR_CORRECTION',
    currentOwnerRole: ownerRoleForStatus('RETURNED_FOR_CORRECTION'),
    locked: false,
  }, stage, 'RETURN', actor, stage, null, reason));
  cycle = await saveCycle(mode, cycle);
  await appendAudit(mode, {
    cycleId: cycle.id,
    user: actor,
    role: stage,
    action: 'RETURN_FOR_CORRECTION',
    newValue: cycle.status,
    reason,
    workflowStage: cycle.status,
  });
  await notifyHandoff({
    actor,
    title: `Returned for correction — ${cycle.cycleCode}`,
    body: reason,
    href: `${MODULE_HREF}/manage`,
    roles: ['IT', 'IT Admin', 'IT Support'],
    severity: 'warning',
  });
  return cycle;
};

/* ───────────────────────── Payments / exceptions / audits ───────────────────────── */

export const generatePaymentSchedule = async (
  cycleId: string,
  actor: TelephoneActor,
): Promise<TelephonePayment> => {
  const mode = await resolveMode();
  let cycle = await loadCycle(mode, cycleId);
  if (!cycle) throw new Error('Cycle not found.');
  if (!['AUTHORIZED_FOR_PAYMENT', 'PAYMENT_PROCESSING', 'PARTIALLY_PAID'].includes(cycle.status)) {
    throw new Error(`Payment schedule can only be generated after CFO authorization (current: ${cycle.status}).`);
  }

  const existing = await loadPaymentsForCycle(mode, cycle.id);
  if (existing[0] && existing[0].status !== 'Failed') return existing[0];

  const items: PaymentItem[] = cycle.employees
    .filter((e) => e.changeBadge !== 'REMOVED' && e.bimonthlyTotal > 0)
    .map((e) => ({
      id: newId(),
      employeeCode: e.employeeCode,
      employeeName: e.employeeName,
      amount: roundMoney(e.bimonthlyTotal),
      accountNoMasked: maskAccount(e.accountNo),
      accountNoFull: e.accountNo || null,
      bankName: compact(e.bankName) || '',
      sortCode: compact(e.sortCode) || '',
      status: 'Authorized' as const,
      failureReason: null,
    }));

  const payment: TelephonePayment = {
    id: newId(),
    cycleId: cycle.id,
    cycleCode: cycle.cycleCode,
    status: 'Authorized',
    authorizedAmount: roundMoney(items.reduce((s, i) => s + i.amount, 0)),
    paidAmount: 0,
    beneficiaryCount: items.length,
    paymentDate: null,
    paymentReference: null,
    bankReference: null,
    batchReference: null,
    remarks: null,
    items,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  if (cycle.status === 'AUTHORIZED_FOR_PAYMENT') {
    assertTransition(cycle.status, 'PAYMENT_PROCESSING');
    cycle = bumpRowVersion({
      ...cycle,
      status: 'PAYMENT_PROCESSING',
      currentOwnerRole: ownerRoleForStatus('PAYMENT_PROCESSING'),
    });
    cycle = await saveCycle(mode, cycle);
  }

  if (mode.kind === 'json') {
    const store = await readJsonStore();
    store.payments.unshift(payment);
    await writeJsonStore(store);
  } else {
    await persistPaymentSql(mode.pool, payment);
  }

  await appendAudit(mode, {
    cycleId: cycle.id,
    user: actor,
    role: 'Treasury',
    action: 'GENERATE_PAYMENT_SCHEDULE',
    newValue: payment.id,
    workflowStage: cycle.status,
  });
  return payment;
};

export const recordPayment = async (
  cycleId: string,
  input: RecordPaymentInput,
  actor: TelephoneActor,
): Promise<{ cycle: TelephoneCycle; payment: TelephonePayment }> => {
  const mode = await resolveMode();
  let cycle = await loadCycle(mode, cycleId);
  if (!cycle) throw new Error('Cycle not found.');

  let payment = (await loadPaymentsForCycle(mode, cycle.id))[0];
  if (!payment) {
    payment = await generatePaymentSchedule(cycleId, actor);
    cycle = (await loadCycle(mode, cycleId))!;
  }

  const failedMap = new Map((input.failedItems || []).map((f) => [upperCode(f.employeeCode), compact(f.failureReason)]));
  const paidSet = input.paidEmployeeCodes?.length
    ? new Set(input.paidEmployeeCodes.map(upperCode))
    : new Set(payment.items.filter((i) => !failedMap.has(upperCode(i.employeeCode))).map((i) => upperCode(i.employeeCode)));

  const items = payment.items.map((item) => {
    const code = upperCode(item.employeeCode);
    if (failedMap.has(code)) {
      return { ...item, status: 'Failed' as const, failureReason: failedMap.get(code) || 'Payment failed' };
    }
    if (paidSet.has(code)) {
      return { ...item, status: 'Paid' as const, failureReason: null };
    }
    return item.status === 'Paid' ? item : { ...item, status: 'Processing' as const };
  });

  const paidAmount = roundMoney(items.filter((i) => i.status === 'Paid').reduce((s, i) => s + i.amount, 0));
  const anyFailed = items.some((i) => i.status === 'Failed');
  const allPaid = items.length > 0 && items.every((i) => i.status === 'Paid');
  const somePaid = items.some((i) => i.status === 'Paid');

  let paymentStatus: TelephonePayment['status'] = 'Processing';
  if (allPaid) paymentStatus = input.markCompleted ? 'Completed' : 'Paid';
  else if (somePaid) paymentStatus = 'Partially Paid';
  else if (anyFailed) paymentStatus = 'Failed';

  payment = {
    ...payment,
    status: paymentStatus,
    paidAmount,
    paymentDate: input.paymentDate ? compact(input.paymentDate).slice(0, 10) : payment.paymentDate || nowIso().slice(0, 10),
    paymentReference: input.paymentReference !== undefined ? input.paymentReference : payment.paymentReference,
    bankReference: input.bankReference !== undefined ? input.bankReference : payment.bankReference,
    batchReference: input.batchReference !== undefined ? input.batchReference : payment.batchReference,
    remarks: input.remarks !== undefined ? input.remarks : payment.remarks,
    items,
    updatedAt: nowIso(),
  };

  if (mode.kind === 'json') {
    const store = await readJsonStore();
    const idx = store.payments.findIndex((p) => p.id === payment.id);
    if (idx >= 0) store.payments[idx] = payment;
    else store.payments.unshift(payment);
    await writeJsonStore(store);
  } else {
    await persistPaymentSql(mode.pool, payment);
  }

  let nextStatus = cycle.status;
  if (allPaid) {
    if (cycle.status === 'AUTHORIZED_FOR_PAYMENT') {
      assertTransition(cycle.status, 'PAYMENT_PROCESSING');
      nextStatus = 'PAYMENT_PROCESSING';
    }
    if (nextStatus === 'PAYMENT_PROCESSING' || nextStatus === 'PARTIALLY_PAID') {
      assertTransition(nextStatus, 'PAID');
      nextStatus = 'PAID';
    }
    if (input.markCompleted && nextStatus === 'PAID') {
      assertTransition('PAID', 'COMPLETED');
      nextStatus = 'COMPLETED';
    }
  } else if (somePaid) {
    if (cycle.status === 'AUTHORIZED_FOR_PAYMENT') {
      assertTransition(cycle.status, 'PAYMENT_PROCESSING');
      nextStatus = 'PAYMENT_PROCESSING';
    }
    if (nextStatus === 'PAYMENT_PROCESSING') {
      assertTransition(nextStatus, 'PARTIALLY_PAID');
      nextStatus = 'PARTIALLY_PAID';
    }
  } else if (cycle.status === 'AUTHORIZED_FOR_PAYMENT') {
    assertTransition(cycle.status, 'PAYMENT_PROCESSING');
    nextStatus = 'PAYMENT_PROCESSING';
  }

  if (nextStatus !== cycle.status) {
    cycle = bumpRowVersion({
      ...cycle,
      status: nextStatus,
      currentOwnerRole: ownerRoleForStatus(nextStatus),
    });
    cycle = await saveCycle(mode, cycle);
  }

  await appendAudit(mode, {
    cycleId: cycle.id,
    user: actor,
    role: 'Treasury',
    action: 'RECORD_PAYMENT',
    newValue: JSON.stringify({ paymentStatus, paidAmount }),
    workflowStage: cycle.status,
  });
  return { cycle, payment };
};

export const listExceptions = async (cycleId?: string): Promise<TelephoneException[]> => {
  const mode = await resolveMode();
  if (mode.kind === 'json') {
    const store = await readJsonStore();
    const rows = cycleId ? store.exceptions.filter((e) => e.cycleId === cycleId) : store.exceptions;
    return [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  if (cycleId) {
    const rs = await mode.pool.request()
      .input('CycleId', sql.NVarChar(120), cycleId)
      .query(`SELECT * FROM [hris].[TelephoneAllowanceException] WHERE [CycleId] = @CycleId ORDER BY [CreatedAt] DESC`);
    return (rs.recordset || []).map(mapExceptionRow);
  }
  const rs = await mode.pool.request().query(`SELECT TOP 500 * FROM [hris].[TelephoneAllowanceException] ORDER BY [CreatedAt] DESC`);
  return (rs.recordset || []).map(mapExceptionRow);
};

export const resolveException = async (
  exceptionId: string,
  resolution: string,
  actor: TelephoneActor,
): Promise<TelephoneException> => {
  const mode = await resolveMode();
  if (!compact(resolution)) throw new Error('Resolution is required.');

  let existing: TelephoneException | null = null;
  if (mode.kind === 'json') {
    const store = await readJsonStore();
    existing = store.exceptions.find((e) => e.id === exceptionId) || null;
    if (!existing) throw new Error('Exception not found.');
    existing = {
      ...existing,
      status: 'Resolved',
      resolution,
      resolvedAt: nowIso(),
    };
    const idx = store.exceptions.findIndex((e) => e.id === exceptionId);
    store.exceptions[idx] = existing;
    await writeJsonStore(store);
  } else {
    const rs = await mode.pool.request()
      .input('Id', sql.NVarChar(120), exceptionId)
      .query(`SELECT TOP 1 * FROM [hris].[TelephoneAllowanceException] WHERE [Id] = @Id`);
    if (!rs.recordset?.[0]) throw new Error('Exception not found.');
    existing = {
      ...mapExceptionRow(rs.recordset[0]),
      status: 'Resolved',
      resolution,
      resolvedAt: nowIso(),
    };
    await persistExceptionSql(mode.pool, existing);
  }

  await appendAudit(mode, {
    cycleId: existing.cycleId,
    employeeCode: existing.employeeCode,
    user: actor,
    role: 'Operations',
    action: 'RESOLVE_EXCEPTION',
    newValue: resolution,
    workflowStage: existing.type,
  });
  return existing;
};

export const listAudits = async (cycleId?: string): Promise<TelephoneAudit[]> => {
  const mode = await resolveMode();
  if (mode.kind === 'json') {
    const store = await readJsonStore();
    const rows = cycleId ? store.audits.filter((a) => a.cycleId === cycleId) : store.audits;
    return [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  if (cycleId) {
    const rs = await mode.pool.request()
      .input('CycleId', sql.NVarChar(120), cycleId)
      .query(`SELECT * FROM [hris].[TelephoneAllowanceAudit] WHERE [CycleId] = @CycleId ORDER BY [CreatedAt] DESC`);
    return (rs.recordset || []).map(mapAuditRow);
  }
  const rs = await mode.pool.request().query(`SELECT TOP 1000 * FROM [hris].[TelephoneAllowanceAudit] ORDER BY [CreatedAt] DESC`);
  return (rs.recordset || []).map(mapAuditRow);
};

export const buildDashboardPayload = async (
  actor: TelephoneActor,
  capabilities: TelephoneAllowanceCapabilities,
) => {
  const cycles = await listCycles();
  const current = await getCurrentCycle();
  const exceptions = await listExceptions(current?.id);
  const openExceptions = exceptions.filter((e) => e.status !== 'Resolved');
  const pendingMine: Array<{ cycleId: string; cycleCode: string; status: TelephoneAllowanceStatus; href: string }> = [];

  for (const cycle of cycles) {
    if (capabilities.canPrepare && ['DRAFT', 'RETURNED_TO_IT', 'RETURNED_FOR_CORRECTION', 'IT_VALIDATION'].includes(cycle.status)) {
      pendingMine.push({ cycleId: cycle.id, cycleCode: cycle.cycleCode, status: cycle.status, href: `${MODULE_HREF}/manage` });
    }
    if (capabilities.canHrReview && cycle.status === 'PENDING_HR_REVIEW') {
      pendingMine.push({ cycleId: cycle.id, cycleCode: cycle.cycleCode, status: cycle.status, href: `${MODULE_HREF}/manage` });
    }
    if (capabilities.canHrApprove && cycle.status === 'PENDING_HR_APPROVAL') {
      pendingMine.push({ cycleId: cycle.id, cycleCode: cycle.cycleCode, status: cycle.status, href: `${MODULE_HREF}/approvals` });
    }
    if (capabilities.canMdApprove && cycle.status === 'PENDING_MD_APPROVAL') {
      pendingMine.push({ cycleId: cycle.id, cycleCode: cycle.cycleCode, status: cycle.status, href: `${MODULE_HREF}/approvals` });
    }
    if (capabilities.canCfoAuthorize && cycle.status === 'PENDING_CFO_AUTHORIZATION') {
      pendingMine.push({ cycleId: cycle.id, cycleCode: cycle.cycleCode, status: cycle.status, href: `${MODULE_HREF}/approvals` });
    }
    if (capabilities.canTreasury && ['AUTHORIZED_FOR_PAYMENT', 'PAYMENT_PROCESSING', 'PARTIALLY_PAID'].includes(cycle.status)) {
      pendingMine.push({ cycleId: cycle.id, cycleCode: cycle.cycleCode, status: cycle.status, href: `${MODULE_HREF}/payment-reporting` });
    }
  }

  return {
    generatedAt: nowIso(),
    actor,
    capabilities,
    currentCycle: current,
    kpis: {
      activeCycles: cycles.filter((c) => !['PAID', 'COMPLETED'].includes(c.status)).length,
      currentBeneficiaries: current?.beneficiaryCount || 0,
      currentBimonthlyTotal: current?.bimonthlyTotal || 0,
      openExceptions: openExceptions.length,
      awaitingApproval: cycles.filter((c) =>
        ['PENDING_HR_APPROVAL', 'PENDING_MD_APPROVAL', 'PENDING_CFO_AUTHORIZATION'].includes(c.status)).length,
      authorizedForPayment: cycles.filter((c) => c.status === 'AUTHORIZED_FOR_PAYMENT').length,
    },
    pendingActions: pendingMine,
    recentCycles: cycles.slice(0, 8),
    openExceptions: openExceptions.slice(0, 20),
  };
};

export const buildApprovalsPayload = async (
  actor: TelephoneActor,
  capabilities: TelephoneAllowanceCapabilities,
) => {
  const cycles = await listCycles();
  const isPendingMine = (status: TelephoneAllowanceStatus) =>
    (capabilities.canHrApprove && status === 'PENDING_HR_APPROVAL')
    || (capabilities.canMdApprove && status === 'PENDING_MD_APPROVAL')
    || (capabilities.canCfoAuthorize && status === 'PENDING_CFO_AUTHORIZATION');

  const pendingMyAction = cycles.filter((c) => isPendingMine(c.status));
  const inProgress = cycles.filter((c) =>
    ['PENDING_HR_REVIEW', 'RETURNED_TO_IT', 'IT_VALIDATION', 'PENDING_HR_APPROVAL', 'PENDING_MD_APPROVAL', 'PENDING_CFO_AUTHORIZATION', 'RETURNED_FOR_CORRECTION'].includes(c.status)
    && !isPendingMine(c.status));
  const completed = cycles.filter((c) =>
    ['AUTHORIZED_FOR_PAYMENT', 'PAYMENT_PROCESSING', 'PARTIALLY_PAID', 'PAID', 'COMPLETED'].includes(c.status));

  return {
    generatedAt: nowIso(),
    actor,
    capabilities,
    pendingMyAction,
    inProgress,
    completed,
  };
};

const maskPayment = (payment: TelephonePayment, canSeeFullBank: boolean): TelephonePayment => ({
  ...payment,
  items: payment.items.map((item) => ({
    ...item,
    accountNoFull: canSeeFullBank ? item.accountNoFull : null,
    accountNoMasked: item.accountNoMasked || maskAccount(item.accountNoFull),
  })),
});

export const buildPaymentReportingPayload = async (capabilities: TelephoneAllowanceCapabilities) => {
  const cycles = await listCycles();
  const mode = await resolveMode();
  const paymentsRaw = mode.kind === 'json'
    ? (await readJsonStore()).payments
    : (await mode.pool.request().query(`SELECT TOP 200 * FROM [hris].[TelephoneAllowancePayment] ORDER BY [UpdatedAt] DESC`)).recordset.map(mapPaymentRow);

  const payments = paymentsRaw.map((p) => maskPayment(p, capabilities.canSeeFullBank));
  const exceptions = await listExceptions();
  const audits = await listAudits();
  const treasuryReady = cycles.filter((c) =>
    ['AUTHORIZED_FOR_PAYMENT', 'PAYMENT_PROCESSING', 'PARTIALLY_PAID'].includes(c.status));

  return {
    generatedAt: nowIso(),
    capabilities,
    treasuryReady,
    payments,
    exceptions,
    audits: audits.slice(0, 200),
    reports: {
      paidYtd: payments.filter((p) => p.status === 'Paid' || p.status === 'Completed')
        .reduce((s, p) => s + p.paidAmount, 0),
      authorizedOutstanding: treasuryReady.reduce((s, c) => s + c.bimonthlyTotal, 0),
      failedItems: payments.flatMap((p) => p.items.filter((i) => i.status === 'Failed')).length,
    },
  };
};

const amountsFromImportRow = (
  row: HistoricalImportRow,
  mode: 'monthly' | 'bimonthly' | 'explicit',
) => {
  const month1Eligible = row.month1Eligible !== false;
  const month2Eligible = row.month2Eligible !== false;
  if (mode === 'explicit') {
    const month1Amount = month1Eligible ? roundMoney(Number(row.month1Amount || 0)) : 0;
    const month2Amount = month2Eligible ? roundMoney(Number(row.month2Amount || 0)) : 0;
    return {
      month1Eligible,
      month2Eligible,
      month1Amount,
      month2Amount,
      monthlyRate: month2Amount || month1Amount,
    };
  }
  if (mode === 'monthly') {
    const monthly = roundMoney(Number(row.monthlyAmount ?? row.amount ?? 0));
    return {
      month1Eligible,
      month2Eligible,
      month1Amount: month1Eligible ? monthly : 0,
      month2Amount: month2Eligible ? monthly : 0,
      monthlyRate: monthly,
    };
  }
  // bimonthly amount is the combined total; allocate across eligible months (never monthly×2).
  const bimonthly = roundMoney(Number(row.bimonthlyAmount ?? row.amount ?? 0));
  const eligibleCount = (month1Eligible ? 1 : 0) + (month2Eligible ? 1 : 0) || 1;
  const share = roundMoney(bimonthly / eligibleCount);
  let month1Amount = month1Eligible ? share : 0;
  let month2Amount = month2Eligible ? share : 0;
  const drift = roundMoney(bimonthly - (month1Amount + month2Amount));
  if (drift !== 0 && month2Eligible) month2Amount = roundMoney(month2Amount + drift);
  else if (drift !== 0 && month1Eligible) month1Amount = roundMoney(month1Amount + drift);
  return {
    month1Eligible,
    month2Eligible,
    month1Amount,
    month2Amount,
    monthlyRate: share,
  };
};

export const importHistoricalSchedule = async (
  rows: HistoricalImportRow[],
  mode: 'monthly' | 'bimonthly' | 'explicit',
  cycleMeta: HistoricalImportMeta,
  actor: TelephoneActor,
): Promise<TelephoneCycle> => {
  if (!rows?.length) throw new Error('No import rows provided.');
  const pair = pairForCode(cycleMeta.pairCode);
  const year = Number(cycleMeta.year);
  if (!year) throw new Error('cycleMeta.year is required.');

  const existingCycles = await listCycles();
  const duplicate = existingCycles.find((c) => c.year === year && c.pairCode === pair.code);
  if (duplicate) throw new Error(`A cycle already exists for ${year} ${pair.label} (${duplicate.cycleCode}).`);

  const directory = await directoryIndex();
  const employees: CycleEmployeeLine[] = [];
  for (const row of rows) {
    const code = upperCode(row.employeeCode);
    if (!code) continue;
    const dir = directory.get(code);
    const amounts = amountsFromImportRow(row, mode);
    if (!amounts.month1Eligible && !amounts.month2Eligible) continue;
    if (amounts.month1Amount + amounts.month2Amount <= 0) continue;
    employees.push(refreshLineBadge({
      id: newId(),
      employeeCode: dir?.employeeCode || compact(row.employeeCode) || code,
      employeeName: compact(row.employeeName) || dir?.employeeName || code,
      department: compact(row.department) || dir?.department || '',
      jobTitle: compact(row.jobTitle) || dir?.jobTitle || '',
      monthlyRate: amounts.monthlyRate,
      month1Eligible: amounts.month1Eligible,
      month1Amount: amounts.month1Amount,
      month2Eligible: amounts.month2Eligible,
      month2Amount: amounts.month2Amount,
      bimonthlyTotal: 0,
      changeBadge: 'UNCHANGED',
      status: 'Eligible',
      bankName: row.bankName ?? dir?.bankName ?? null,
      accountNo: row.accountNo ?? dir?.accountNo ?? null,
      sortCode: row.sortCode ?? dir?.sortCode ?? null,
      exceptionFlags: [],
    }));
  }

  const samePairCount = existingCycles.filter((c) => c.year === year && c.pairCode === pair.code).length;
  const status = (cycleMeta.status || 'COMPLETED') as TelephoneAllowanceStatus;
  const now = nowIso();
  let cycle: TelephoneCycle = {
    id: newId(),
    cycleCode: compact(cycleMeta.cycleCode) || buildCycleCode(year, pair.code, samePairCount + 1),
    year,
    month1: pair.month1,
    month2: pair.month2,
    pairLabel: pair.label,
    pairCode: pair.code,
    status,
    currentOwnerRole: ownerRoleForStatus(status),
    preparedBy: cycleMeta.preparedBy || actor,
    hrReviewedBy: null,
    locked: true,
    rowVersion: 1,
    month1Total: 0,
    month2Total: 0,
    bimonthlyTotal: 0,
    beneficiaryCount: 0,
    originalBeneficiaryCount: null,
    originalBimonthlyTotal: null,
    employees,
    versions: [],
    changes: [],
    approvals: [],
    createdAt: now,
    updatedAt: now,
    createdBy: actor,
  };
  cycle = applyTotals(cycle);
  cycle.originalBeneficiaryCount = cycle.beneficiaryCount;
  cycle.originalBimonthlyTotal = cycle.bimonthlyTotal;
  cycle.versions = [snapshotVersion(cycle, 'Historical Import', actor, 1)];

  const storeMode = await resolveMode();
  cycle = await saveCycle(storeMode, cycle);
  await syncExceptionsForCycle(storeMode, cycle, actor);
  await appendAudit(storeMode, {
    cycleId: cycle.id,
    user: actor,
    role: 'IT',
    action: 'IMPORT_HISTORICAL_SCHEDULE',
    newValue: JSON.stringify({ mode, rows: rows.length, cycleCode: cycle.cycleCode }),
    workflowStage: cycle.status,
  });
  return cycle;
};

export const compareCycles = async (currentId: string, previousId: string) => {
  const storeMode = await resolveMode();
  const current = await loadCycle(storeMode, currentId);
  const previous = await loadCycle(storeMode, previousId);
  if (!current) throw new Error('Current cycle not found.');
  if (!previous) throw new Error('Previous cycle not found.');

  const prevMap = new Map(previous.employees.map((e) => [upperCode(e.employeeCode), e]));
  const currMap = new Map(current.employees.map((e) => [upperCode(e.employeeCode), e]));
  const codes = new Set([...prevMap.keys(), ...currMap.keys()]);

  const added: CycleEmployeeLine[] = [];
  const removed: CycleEmployeeLine[] = [];
  const amountChanged: Array<{ employeeCode: string; employeeName: string; previous: number; current: number }> = [];
  let unchangedCount = 0;

  for (const code of codes) {
    const curr = currMap.get(code);
    const prev = prevMap.get(code);
    const currActive = Boolean(curr && curr.changeBadge !== 'REMOVED' && curr.bimonthlyTotal > 0);
    const prevActive = Boolean(prev && prev.changeBadge !== 'REMOVED' && prev.bimonthlyTotal > 0);
    if (currActive && !prevActive) added.push(curr!);
    else if (!currActive && prevActive) removed.push(prev!);
    else if (currActive && prevActive) {
      if (
        roundMoney(curr!.bimonthlyTotal) !== roundMoney(prev!.bimonthlyTotal)
        || roundMoney(curr!.month1Amount) !== roundMoney(prev!.month1Amount)
        || roundMoney(curr!.month2Amount) !== roundMoney(prev!.month2Amount)
      ) {
        amountChanged.push({
          employeeCode: curr!.employeeCode,
          employeeName: curr!.employeeName,
          previous: prev!.bimonthlyTotal,
          current: curr!.bimonthlyTotal,
        });
      } else {
        unchangedCount += 1;
      }
    }
  }

  return {
    current: {
      id: current.id,
      cycleCode: current.cycleCode,
      bimonthlyTotal: current.bimonthlyTotal,
      beneficiaryCount: current.beneficiaryCount,
    },
    previous: {
      id: previous.id,
      cycleCode: previous.cycleCode,
      bimonthlyTotal: previous.bimonthlyTotal,
      beneficiaryCount: previous.beneficiaryCount,
    },
    deltaBeneficiaries: current.beneficiaryCount - previous.beneficiaryCount,
    deltaAmount: roundMoney(current.bimonthlyTotal - previous.bimonthlyTotal),
    added,
    removed,
    amountChanged,
    unchangedCount,
  };
};

export const searchDirectoryEmployees = async (query: string) => {
  const q = compact(query).toLowerCase();
  const source = await readPayrollEmployees();
  const employees = source.employees
    .filter((emp) => {
      if (!q) return true;
      const hay = [emp.employeeCode, emp.employeeId, emp.fullName, emp.department, emp.jobTitle]
        .map((v) => compact(v).toLowerCase())
        .join(' ');
      return hay.includes(q);
    })
    .slice(0, 50)
    .map((emp) => ({
      employeeCode: compact(emp.employeeCode) || compact(emp.employeeId),
      employeeName: compact(emp.fullName),
      department: compact(emp.department),
      jobTitle: compact(emp.jobTitle),
      status: compact(emp.status),
      bankName: compact(emp.bankName) || null,
      accountNoMasked: maskAccount(emp.accountNo),
      hasBank: Boolean(compact(emp.accountNo)),
    }));

  return {
    query: compact(query),
    source: source.source,
    count: employees.length,
    employees,
  };
};
