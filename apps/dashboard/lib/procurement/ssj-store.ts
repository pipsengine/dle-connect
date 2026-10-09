import sql from 'mssql';
import type { SessionPayload } from '@/lib/auth/session';
import { createEnterpriseNotification } from '@/lib/enterprise-notifications-store';
import { readEmployeeDirectoryFromDb, type DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import { MD_CEO_EMPLOYEE_CODE } from '@/lib/finance-intelligence/payment-access';
import { resolveLineManagerOrThrow } from '@/lib/leave-workflow-service';
import { resolveEmployeeMailbox, sendTransactionalEmail } from '@/lib/mail-service';
import { ensureProcurementDb } from '@/lib/procurement-store';
import {
  SSJ_APPROVED,
  SSJ_DRAFT,
  SSJ_LINE_MANAGER,
  SSJ_MD,
  SSJ_REJECTED,
  SSJ_RETURNED,
  SSJ_STAGE_COMPLETE,
  SSJ_STAGE_LINE_MANAGER,
  SSJ_STAGE_MD,
  SSJ_STAGE_REQUESTER,
  type SsjActions,
  type SsjInput,
  type SsjRecord,
  type SsjWorkflowEvent,
} from '@/lib/procurement/ssj-types';
import { resolveWorkflowLinkOrigin } from '@/lib/public-app-url';

export type { SsjActions, SsjInput, SsjRecord, SsjWorkflowEvent };
export {
  SSJ_APPROVED,
  SSJ_DRAFT,
  SSJ_LINE_MANAGER,
  SSJ_MD,
  SSJ_REASON_CATEGORIES,
  SSJ_REJECTED,
  SSJ_RETURNED,
  SSJ_STAGE_COMPLETE,
  SSJ_STAGE_LINE_MANAGER,
  SSJ_STAGE_MD,
  SSJ_STAGE_REQUESTER,
} from '@/lib/procurement/ssj-types';

const compact = (value: unknown) => String(value ?? '').trim();
const upper = (value: unknown) => compact(value).toUpperCase();
const nowIso = () => new Date().toISOString();
const hrefFor = (ssjId: string) =>
  `/procurement/purchase-requisitions/single-sourced-justification?id=${encodeURIComponent(ssjId)}`;

const employeeCodeOf = (employee: DleEmployeeDirectoryRow) =>
  compact(employee.employeeCode || employee.employeeId || employee.sourceEmployeeId);

const codesMatch = (left?: string | null, right?: string | null) => {
  const a = upper(left).replace(/[^A-Z0-9]/g, '');
  const b = upper(right).replace(/[^A-Z0-9]/g, '');
  return Boolean(a && b && a === b);
};

const inactive = (status?: string | null) =>
  /inactive|terminated|resigned|retired|deceased|suspend/i.test(compact(status));

const parseWorkflow = (value: unknown): SsjWorkflowEvent[] => {
  if (Array.isArray(value)) return value as SsjWorkflowEvent[];
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const toIso = (value: unknown) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const sessionIsSuper = (session: SessionPayload) =>
  Boolean(session.isGlobalAdmin)
  || (session.roles || []).some((role) => /super administrator|system administrator/i.test(role));

const sessionIsMd = (session: SessionPayload) =>
  codesMatch(session.employeeCode, MD_CEO_EMPLOYEE_CODE)
  || (session.roles || []).some((role) => /managing\s*director|md\s*\/?\s*ceo|chief\s*executive|^executive director$/i.test(compact(role)));

const findEmployee = (employees: DleEmployeeDirectoryRow[], reference?: string | null) => {
  const target = compact(reference);
  if (!target) return null;
  const needle = target.toLowerCase();
  const code = upper(target).replace(/[^A-Z0-9]/g, '');
  return employees.find((employee) => {
    if (inactive(employee.status)) return false;
    const empCode = upper(employeeCodeOf(employee)).replace(/[^A-Z0-9]/g, '');
    const name = compact(employee.fullName).toLowerCase();
    return (code && empCode === code) || (name && (name === needle || name.includes(needle) || needle.includes(name)));
  }) || null;
};

const findManagingDirector = (employees: DleEmployeeDirectoryRow[]) => {
  const byCode = employees.find((employee) => !inactive(employee.status) && codesMatch(employeeCodeOf(employee), MD_CEO_EMPLOYEE_CODE));
  if (byCode) return byCode;
  return employees.find((employee) => {
    if (inactive(employee.status)) return false;
    return /managing director|md\s*\/\s*ceo|chief executive/i.test(`${employee.jobTitle || ''} ${employee.designation || ''}`);
  }) || null;
};

const editableStatus = (status: string) => status === SSJ_DRAFT || status === SSJ_RETURNED;

export const actionsForSsj = (row: Pick<SsjRecord, 'status' | 'requesterCode' | 'requesterName' | 'lineManagerCode' | 'mdCode' | 'createdBy'>, session: SessionPayload): SsjActions => {
  const superActor = sessionIsSuper(session);
  const requester = codesMatch(session.employeeCode, row.requesterCode)
    || (!row.requesterCode && compact(session.fullName) && compact(session.fullName) === compact(row.requesterName || row.createdBy));
  const lineManager = codesMatch(session.employeeCode, row.lineManagerCode);
  const md = sessionIsMd(session) || codesMatch(session.employeeCode, row.mdCode);
  const editable = editableStatus(row.status) && (requester || superActor);
  return {
    canEdit: editable,
    canSubmit: editable,
    canCheck: row.status === SSJ_LINE_MANAGER && (lineManager || superActor),
    canApprove: row.status === SSJ_MD && (md || superActor),
    canReturn: (row.status === SSJ_LINE_MANAGER && (lineManager || superActor)) || (row.status === SSJ_MD && (md || superActor)),
    canReject: (row.status === SSJ_LINE_MANAGER && (lineManager || superActor)) || (row.status === SSJ_MD && (md || superActor)),
  };
};

const mapRow = (row: Record<string, unknown>, session: SessionPayload): SsjRecord => {
  const text = (key: string) => (row[key] == null || compact(row[key]) === '' ? null : compact(row[key]));
  const record: SsjRecord = {
    ssjId: compact(row.SsjId),
    prId: text('PrId'),
    title: compact(row.Title),
    department: text('Department'),
    project: text('Project'),
    site: text('Site'),
    requesterName: text('RequesterName'),
    requesterCode: text('RequesterCode'),
    supplierId: text('SupplierId'),
    supplierName: text('SupplierName'),
    currency: compact(row.Currency) || 'NGN',
    estimatedAmount: Number(row.EstimatedAmount || 0),
    reasonCategory: text('ReasonCategory'),
    justification: text('Justification'),
    alternativesConsidered: text('AlternativesConsidered'),
    marketSearch: text('MarketSearch'),
    technicalBasis: text('TechnicalBasis'),
    consequence: text('Consequence'),
    status: compact(row.Status) || SSJ_DRAFT,
    currentStage: compact(row.CurrentStage) || SSJ_STAGE_REQUESTER,
    currentWith: text('CurrentWith'),
    lineManagerName: text('LineManagerName'),
    lineManagerCode: text('LineManagerCode'),
    mdName: text('MdName'),
    mdCode: text('MdCode'),
    checkedBy: text('CheckedBy'),
    checkedAt: toIso(row.CheckedAt),
    checkComment: text('CheckComment'),
    approvedBy: text('ApprovedBy'),
    approvedAt: toIso(row.ApprovedAt),
    approvalComment: text('ApprovalComment'),
    workflow: parseWorkflow(row.WorkflowJson),
    createdAt: toIso(row.CreatedAt),
    updatedAt: toIso(row.UpdatedAt),
    createdBy: text('CreatedBy'),
    updatedBy: text('UpdatedBy'),
    actions: { canEdit: false, canSubmit: false, canCheck: false, canApprove: false, canReturn: false, canReject: false },
  };
  record.actions = actionsForSsj(record, session);
  return record;
};

const nextSsjId = async (pool: sql.ConnectionPool) => {
  const prefix = `SSJ-${new Date().getUTCFullYear()}`;
  const result = await pool.request().input('Prefix', sql.NVarChar(20), `${prefix}-%`).query(`
    SELECT [SsjId] FROM [procurement].[SingleSourceJustifications] WHERE [SsjId] LIKE @Prefix
  `);
  let max = 0;
  for (const row of result.recordset as Array<{ SsjId?: string }>) {
    const match = compact(row.SsjId).match(/-(\d+)$/);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `${prefix}-${String(max + 1).padStart(4, '0')}`;
};

const loadRaw = async (pool: sql.ConnectionPool, ssjId: string) => {
  const result = await pool.request().input('SsjId', sql.NVarChar(40), ssjId).query(`
    SELECT * FROM [procurement].[SingleSourceJustifications] WHERE [SsjId]=@SsjId
  `);
  return (result.recordset[0] as Record<string, unknown> | undefined) || null;
};

const notifyPerson = async (input: {
  actor: string;
  employee?: DleEmployeeDirectoryRow | null;
  code?: string;
  name?: string;
  title: string;
  body: string;
  ssjId: string;
}) => {
  const href = hrefFor(input.ssjId);
  await createEnterpriseNotification({
    sub: 'system-ssj-workflow',
    username: 'system-ssj-workflow',
    fullName: input.actor,
    roles: ['System'],
    permissions: ['*'],
    status: 'Active',
    firstLoginRequired: false,
    passwordResetRequired: false,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    employeeCode: input.code,
  }, {
    kind: 'Approval',
    module: 'Procurement',
    title: input.title,
    body: input.body,
    severity: 'warning',
    recipientEmployeeCode: input.code || (input.employee ? employeeCodeOf(input.employee) : undefined) || undefined,
    href,
    channels: ['In-App', 'Email'],
    metadata: { ssjId: input.ssjId, recipientName: input.name || input.employee?.fullName || '' },
    actor: input.actor,
  }).catch((error) => console.error('[ssj-workflow] in-app notification failed', error));

  const mailbox = input.employee ? await resolveEmployeeMailbox(input.employee).catch(() => '') : '';
  if (!mailbox) return;
  await sendTransactionalEmail({
    to: mailbox,
    subject: input.title,
    text: `${input.body}\n\nOpen: ${resolveWorkflowLinkOrigin()}${href}`,
    html: `<p>${input.body}</p><p><a href="${resolveWorkflowLinkOrigin()}${href}">Open single sourced justification</a></p>`,
  }).catch((error) => console.error('[ssj-workflow] email failed', error));
};

const requireRecord = async (pool: sql.ConnectionPool, ssjId: string, session: SessionPayload) => {
  const raw = await loadRaw(pool, ssjId);
  if (!raw) throw new Error('Single sourced justification not found.');
  return mapRow(raw, session);
};

const writeWorkflow = async (
  pool: sql.ConnectionPool,
  record: SsjRecord,
  patch: Record<string, unknown>,
  event: SsjWorkflowEvent,
  actor: string,
) => {
  const workflow = [...record.workflow, event];
  await pool
    .request()
    .input('SsjId', sql.NVarChar(40), record.ssjId)
    .input('Status', sql.NVarChar(40), compact(patch.status))
    .input('CurrentStage', sql.NVarChar(40), compact(patch.currentStage))
    .input('CurrentWith', sql.NVarChar(220), patch.currentWith == null ? null : compact(patch.currentWith))
    .input('LineManagerName', sql.NVarChar(220), patch.lineManagerName === undefined ? record.lineManagerName : (patch.lineManagerName == null ? null : compact(patch.lineManagerName)))
    .input('LineManagerCode', sql.NVarChar(80), patch.lineManagerCode === undefined ? record.lineManagerCode : (patch.lineManagerCode == null ? null : compact(patch.lineManagerCode)))
    .input('MdName', sql.NVarChar(220), patch.mdName === undefined ? record.mdName : (patch.mdName == null ? null : compact(patch.mdName)))
    .input('MdCode', sql.NVarChar(80), patch.mdCode === undefined ? record.mdCode : (patch.mdCode == null ? null : compact(patch.mdCode)))
    .input('CheckedBy', sql.NVarChar(220), patch.checkedBy === undefined ? record.checkedBy : (patch.checkedBy == null ? null : compact(patch.checkedBy)))
    .input('CheckedAt', sql.DateTime2, patch.checkedAt === undefined ? (record.checkedAt ? new Date(record.checkedAt) : null) : patch.checkedAt)
    .input('CheckComment', sql.NVarChar(sql.MAX), patch.checkComment === undefined ? record.checkComment : (patch.checkComment == null ? null : compact(patch.checkComment)))
    .input('ApprovedBy', sql.NVarChar(220), patch.approvedBy === undefined ? record.approvedBy : (patch.approvedBy == null ? null : compact(patch.approvedBy)))
    .input('ApprovedAt', sql.DateTime2, patch.approvedAt === undefined ? (record.approvedAt ? new Date(record.approvedAt) : null) : patch.approvedAt)
    .input('ApprovalComment', sql.NVarChar(sql.MAX), patch.approvalComment === undefined ? record.approvalComment : (patch.approvalComment == null ? null : compact(patch.approvalComment)))
    .input('WorkflowJson', sql.NVarChar(sql.MAX), JSON.stringify(workflow))
    .input('UpdatedBy', sql.NVarChar(120), compact(actor).slice(0, 120))
    .query(`
      UPDATE [procurement].[SingleSourceJustifications] SET
        [Status]=@Status,
        [CurrentStage]=@CurrentStage,
        [CurrentWith]=@CurrentWith,
        [LineManagerName]=@LineManagerName,
        [LineManagerCode]=@LineManagerCode,
        [MdName]=@MdName,
        [MdCode]=@MdCode,
        [CheckedBy]=@CheckedBy,
        [CheckedAt]=@CheckedAt,
        [CheckComment]=@CheckComment,
        [ApprovedBy]=@ApprovedBy,
        [ApprovedAt]=@ApprovedAt,
        [ApprovalComment]=@ApprovalComment,
        [WorkflowJson]=@WorkflowJson,
        [UpdatedAt]=SYSUTCDATETIME(),
        [UpdatedBy]=@UpdatedBy
      WHERE [SsjId]=@SsjId
    `);
};

export const listSingleSourceJustifications = async (session: SessionPayload) => {
  const pool = await ensureProcurementDb();
  const [rows, suppliers, requisitions] = await Promise.all([
    pool.request().query(`
      SELECT * FROM [procurement].[SingleSourceJustifications]
      ORDER BY [UpdatedAt] DESC
    `),
    pool.request().query(`
      SELECT [SupplierId], [Name]
      FROM [procurement].[Suppliers]
      WHERE [IsActive]=1 AND ISNULL([IsBlacklisted], 0)=0
      ORDER BY [Name]
    `),
    pool.request().query(`
      SELECT [PrId], [Title], [Department], [Project], [Status], [Currency], [EstimatedAmount]
      FROM [procurement].[PurchaseRequisitions]
      ORDER BY [UpdatedAt] DESC
    `),
  ]);
  return {
    records: (rows.recordset as Record<string, unknown>[]).map((row) => mapRow(row, session)),
    suppliers: (suppliers.recordset as Array<{ SupplierId: string; Name: string }>).map((row) => ({
      supplierId: compact(row.SupplierId),
      name: compact(row.Name),
    })),
    requisitions: (requisitions.recordset as Record<string, unknown>[]).map((row) => ({
      prId: compact(row.PrId),
      title: compact(row.Title),
      department: compact(row.Department),
      project: compact(row.Project),
      status: compact(row.Status),
      currency: compact(row.Currency) || 'NGN',
      estimatedAmount: Number(row.EstimatedAmount || 0),
    })),
  };
};

export const getSingleSourceJustification = async (ssjId: string, session: SessionPayload) => {
  const pool = await ensureProcurementDb();
  return requireRecord(pool, ssjId, session);
};

const assertContent = (input: SsjInput) => {
  if (!compact(input.title)) throw new Error('Title is required.');
  if (!compact(input.supplierName)) throw new Error('Proposed supplier is required.');
  if (!compact(input.reasonCategory)) throw new Error('Reason category is required.');
  if (compact(input.justification).length < 20) throw new Error('Justification must be at least 20 characters.');
  const amount = Number(input.estimatedAmount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Estimated amount must be greater than zero.');
};

export const upsertSingleSourceJustification = async (input: SsjInput, session: SessionPayload) => {
  const pool = await ensureProcurementDb();
  const actor = session.fullName || session.username || 'Procurement User';
  const existingId = compact(input.ssjId);
  const existing = existingId ? await requireRecord(pool, existingId, session) : null;
  if (existing && !existing.actions.canEdit) {
    throw new Error('This justification can only be edited while it is a draft or has been returned to the requester.');
  }
  assertContent(input);
  const ssjId = existing?.ssjId || await nextSsjId(pool);
  const requesterCode = existing?.requesterCode || compact(session.employeeCode) || null;
  const requesterName = existing?.requesterName || compact(session.fullName) || actor;
  const status = existing?.status || SSJ_DRAFT;
  const stage = existing?.currentStage || SSJ_STAGE_REQUESTER;
  const workflow = existing?.workflow?.length
    ? existing.workflow
    : [{ at: nowIso(), action: 'Created', actor, actorCode: session.employeeCode, stage: SSJ_STAGE_REQUESTER, comment: 'Draft created.' }];

  await pool
    .request()
    .input('SsjId', sql.NVarChar(40), ssjId)
    .input('PrId', sql.NVarChar(40), compact(input.prId) || null)
    .input('Title', sql.NVarChar(300), compact(input.title).slice(0, 300))
    .input('Department', sql.NVarChar(180), compact(input.department) || null)
    .input('Project', sql.NVarChar(180), compact(input.project) || null)
    .input('Site', sql.NVarChar(180), compact(input.site) || null)
    .input('RequesterName', sql.NVarChar(220), requesterName)
    .input('RequesterCode', sql.NVarChar(80), requesterCode)
    .input('SupplierId', sql.NVarChar(40), compact(input.supplierId) || null)
    .input('SupplierName', sql.NVarChar(220), compact(input.supplierName).slice(0, 220))
    .input('Currency', sql.NVarChar(10), compact(input.currency) || 'NGN')
    .input('EstimatedAmount', sql.Decimal(19, 2), Number(input.estimatedAmount))
    .input('ReasonCategory', sql.NVarChar(80), compact(input.reasonCategory).slice(0, 80))
    .input('Justification', sql.NVarChar(sql.MAX), compact(input.justification))
    .input('AlternativesConsidered', sql.NVarChar(sql.MAX), compact(input.alternativesConsidered) || null)
    .input('MarketSearch', sql.NVarChar(sql.MAX), compact(input.marketSearch) || null)
    .input('TechnicalBasis', sql.NVarChar(sql.MAX), compact(input.technicalBasis) || null)
    .input('Consequence', sql.NVarChar(sql.MAX), compact(input.consequence) || null)
    .input('Status', sql.NVarChar(40), status)
    .input('CurrentStage', sql.NVarChar(40), stage)
    .input('CurrentWith', sql.NVarChar(220), existing?.currentWith || requesterName)
    .input('WorkflowJson', sql.NVarChar(sql.MAX), JSON.stringify(workflow))
    .input('Actor', sql.NVarChar(120), actor.slice(0, 120))
    .query(`
      IF EXISTS (SELECT 1 FROM [procurement].[SingleSourceJustifications] WHERE [SsjId]=@SsjId)
        UPDATE [procurement].[SingleSourceJustifications] SET
          [PrId]=@PrId, [Title]=@Title, [Department]=@Department, [Project]=@Project, [Site]=@Site,
          [SupplierId]=@SupplierId, [SupplierName]=@SupplierName, [Currency]=@Currency, [EstimatedAmount]=@EstimatedAmount,
          [ReasonCategory]=@ReasonCategory, [Justification]=@Justification, [AlternativesConsidered]=@AlternativesConsidered,
          [MarketSearch]=@MarketSearch, [TechnicalBasis]=@TechnicalBasis, [Consequence]=@Consequence,
          [UpdatedAt]=SYSUTCDATETIME(), [UpdatedBy]=@Actor
        WHERE [SsjId]=@SsjId
      ELSE
        INSERT INTO [procurement].[SingleSourceJustifications] (
          [SsjId], [PrId], [Title], [Department], [Project], [Site], [RequesterName], [RequesterCode],
          [SupplierId], [SupplierName], [Currency], [EstimatedAmount], [ReasonCategory], [Justification],
          [AlternativesConsidered], [MarketSearch], [TechnicalBasis], [Consequence],
          [Status], [CurrentStage], [CurrentWith], [WorkflowJson], [CreatedBy], [UpdatedBy]
        ) VALUES (
          @SsjId, @PrId, @Title, @Department, @Project, @Site, @RequesterName, @RequesterCode,
          @SupplierId, @SupplierName, @Currency, @EstimatedAmount, @ReasonCategory, @Justification,
          @AlternativesConsidered, @MarketSearch, @TechnicalBasis, @Consequence,
          @Status, @CurrentStage, @CurrentWith, @WorkflowJson, @Actor, @Actor
        )
    `);
  return requireRecord(pool, ssjId, session);
};

export const submitSingleSourceJustification = async (input: SsjInput, session: SessionPayload, comment?: string) => {
  const saved = await upsertSingleSourceJustification(input, session);
  if (!saved.actions.canSubmit) throw new Error('You cannot submit this justification.');
  const employees = (await readEmployeeDirectoryFromDb()) || [];
  const requester = findEmployee(employees, saved.requesterCode || session.employeeCode || saved.requesterName);
  if (!requester) throw new Error('Requester could not be matched to an HRIS employee. Your employee code must exist in DLE_Enterprise before submission.');
  const manager = resolveLineManagerOrThrow(requester, employees);
  const actor = session.fullName || session.username;
  const pool = await ensureProcurementDb();
  await writeWorkflow(pool, saved, {
    status: SSJ_LINE_MANAGER,
    currentStage: SSJ_STAGE_LINE_MANAGER,
    currentWith: manager.employee.fullName,
    lineManagerName: manager.employee.fullName,
    lineManagerCode: employeeCodeOf(manager.employee),
  }, {
    at: nowIso(),
    action: 'Submitted',
    actor,
    actorCode: session.employeeCode,
    stage: SSJ_STAGE_LINE_MANAGER,
    comment: compact(comment) || 'Requester submitted this single sourced justification.',
  }, actor);
  await notifyPerson({
    actor,
    employee: manager.employee,
    code: employeeCodeOf(manager.employee),
    name: manager.employee.fullName,
    title: `${saved.ssjId} awaiting line manager check`,
    body: `${requester.fullName} submitted single sourced justification ${saved.ssjId} (${saved.title}) for your check.`,
    ssjId: saved.ssjId,
  });
  return requireRecord(pool, saved.ssjId, session);
};

export const actionSingleSourceJustification = async (input: {
  ssjId: string;
  decision: string;
  comment?: string;
}, session: SessionPayload) => {
  const pool = await ensureProcurementDb();
  const record = await requireRecord(pool, compact(input.ssjId), session);
  const decision = compact(input.decision).toLowerCase();
  const comment = compact(input.comment);
  const actor = session.fullName || session.username;
  const employees = (await readEmployeeDirectoryFromDb()) || [];
  const requester = findEmployee(employees, record.requesterCode || record.requesterName);

  if (decision === 'check') {
    if (!record.actions.canCheck) throw new Error('Only the requester\'s line manager can check this justification.');
    const md = findManagingDirector(employees);
    if (!md) throw new Error('Managing Director could not be matched in HRIS. Approval cannot move forward until that employee is available.');
    await writeWorkflow(pool, record, {
      status: SSJ_MD,
      currentStage: SSJ_STAGE_MD,
      currentWith: md.fullName,
      mdName: md.fullName,
      mdCode: employeeCodeOf(md),
      checkedBy: actor,
      checkedAt: new Date(),
      checkComment: comment || 'Checked by line manager.',
    }, {
      at: nowIso(),
      action: 'Checked by Line Manager',
      actor,
      actorCode: session.employeeCode,
      stage: SSJ_STAGE_MD,
      comment: comment || 'Checked by line manager.',
    }, actor);
    await notifyPerson({
      actor,
      employee: md,
      code: employeeCodeOf(md),
      name: md.fullName,
      title: `${record.ssjId} awaiting MD approval`,
      body: `${actor} checked single sourced justification ${record.ssjId} (${record.title}). It is waiting for Managing Director approval.`,
      ssjId: record.ssjId,
    });
    if (requester) {
      await notifyPerson({
        actor,
        employee: requester,
        code: employeeCodeOf(requester),
        name: requester.fullName,
        title: `${record.ssjId} checked by line manager`,
        body: `${actor} checked your single sourced justification ${record.ssjId}. It is now with the Managing Director.`,
        ssjId: record.ssjId,
      });
    }
    return requireRecord(pool, record.ssjId, session);
  }

  if (decision === 'approve') {
    if (!record.actions.canApprove) throw new Error('Only the Managing Director can approve this justification.');
    await writeWorkflow(pool, record, {
      status: SSJ_APPROVED,
      currentStage: SSJ_STAGE_COMPLETE,
      currentWith: record.requesterName,
      approvedBy: actor,
      approvedAt: new Date(),
      approvalComment: comment || 'Approved by Managing Director.',
    }, {
      at: nowIso(),
      action: 'Approved by MD',
      actor,
      actorCode: session.employeeCode,
      stage: SSJ_STAGE_COMPLETE,
      comment: comment || 'Approved by Managing Director.',
    }, actor);
    if (requester) {
      await notifyPerson({
        actor,
        employee: requester,
        code: employeeCodeOf(requester),
        name: requester.fullName,
        title: `${record.ssjId} approved by MD`,
        body: `${actor} approved single sourced justification ${record.ssjId} (${record.title}).`,
        ssjId: record.ssjId,
      });
    }
    return requireRecord(pool, record.ssjId, session);
  }

  if (decision === 'return' || decision === 'reject') {
    const allowed = decision === 'return' ? record.actions.canReturn : record.actions.canReject;
    if (!allowed) throw new Error('You are not the current approver for this justification.');
    if (!comment) throw new Error(decision === 'return' ? 'A comment is required when returning a justification.' : 'A comment is required when rejecting a justification.');
    const status = decision === 'return' ? SSJ_RETURNED : SSJ_REJECTED;
    const stage = decision === 'return' ? SSJ_STAGE_REQUESTER : record.currentStage;
    await writeWorkflow(pool, record, {
      status,
      currentStage: stage,
      currentWith: record.requesterName,
    }, {
      at: nowIso(),
      action: status,
      actor,
      actorCode: session.employeeCode,
      stage,
      comment,
    }, actor);
    if (requester) {
      await notifyPerson({
        actor,
        employee: requester,
        code: employeeCodeOf(requester),
        name: requester.fullName,
        title: `${record.ssjId} ${status.toLowerCase()}`,
        body: `Single sourced justification ${record.ssjId} was ${status.toLowerCase()} by ${actor}. ${comment}`,
        ssjId: record.ssjId,
      });
    }
    return requireRecord(pool, record.ssjId, session);
  }

  throw new Error('Unknown justification action.');
};
