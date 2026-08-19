import sql from 'mssql';
import path from 'node:path';
import { ensureFinanceDb } from '@/lib/finance-intelligence/store';
import { convertAmountToNgn, resolveApprovalChain, applyMdLineManagerLastApproverRule, bandRequiresMdCeo, isProjectPaymentPath } from '@/lib/finance-intelligence/approval-matrix-service';
import {
  notifyPaymentApprovalRequired,
  notifyPaymentClarificationComment,
  notifyPaymentDecision,
  resolvePaymentStageApprover,
} from '@/lib/finance-intelligence/payment-approval-notify';
import {
  describePaymentAttachmentStorage,
  ensurePaymentAttachmentsStorage,
  paymentAttachmentsRoot,
  readPaymentAttachmentFile as readPaymentAttachmentFileFromStore,
  savePaymentAttachmentFile as savePaymentAttachmentFileToStore,
} from '@/lib/finance-intelligence/payment-attachment-storage';
import { resolveWorkflowLinkOrigin } from '@/lib/public-app-url';

export const ALLOWED_PAYMENT_CURRENCIES = ['NGN', 'USD', 'EUR', 'GBP'] as const;
export const PAYMENT_TYPES = [
  'Cash Advance Payment',
  'Supplier Invoice Payment',
  'Expense Payment',
] as const;
export type PaymentRequestType = (typeof PAYMENT_TYPES)[number];

export {
  EXPENSE_NATURE_OPTIONS,
  SUPPLIER_INVOICE_CATEGORIES,
  invoiceCategoryForPaymentType,
  isExpenseNoPoPayment,
  isSupplierPoInvoicePayment,
  supplierInvoiceCategoryLabel,
  type SupplierInvoiceCategory,
} from '@/lib/finance-intelligence/payment-invoice-category';
import {
  invoiceCategoryForPaymentType,
  isExpenseNoPoPayment,
  type SupplierInvoiceCategory,
} from '@/lib/finance-intelligence/payment-invoice-category';

/** Supplier invoice (PO) or expense (no PO) — both pay a vendor/supplier. */
export const isVendorPaymentType = (paymentType?: string | null) =>
  /supplier invoice|expense payment/i.test(String(paymentType || ''));

const OUTSTANDING_CASH_ADVANCE_STATUSES = [
  'Submitted',
  'Pending Approval',
  'Approved',
  'Ready for Treasury',
  'Paid',
  'Awaiting Retirement',
  'Retirement Submitted',
  'Treasury Verification',
  'Finance Verification',
] as const;

export type CashAdvanceEligibility = {
  employeeCode: string;
  outstandingCount: number;
  canRaise: boolean;
  blocked: boolean;
  message: string;
  activeWaiver: {
    waiverId: string;
    reason: string;
    grantedBy: string;
    createdAt: string;
  } | null;
  outstanding: Array<{
    requestId: string;
    requestNumber: string;
    title: string;
    netAmount: number;
    currencyCode: string;
    status: string;
    currentStage: string;
    submittedAt: string | null;
    paymentSiteCode: string;
  }>;
};

export type CashAdvanceControlsWorkspace = {
  generatedAt: string;
  outstanding: PaymentRequestRow[];
  activeWaivers: Array<{
    waiverId: string;
    employeeCode: string;
    reason: string;
    grantedBy: string;
    createdAt: string;
  }>;
  summary: {
    outstandingCount: number;
    awaitingRetirement: number;
    activeWaivers: number;
    blockedEmployees: number;
  };
};

export const CASH_ADVANCE_STATUSES = [
  'Draft',
  'Submitted',
  'Pending Approval',
  'Approved',
  'Ready for Treasury',
  'Paid',
  'Awaiting Retirement',
  'Retirement Submitted',
  'Treasury Verification',
  'Finance Verification',
  'Retired',
  'Closed',
  'Rejected',
  'Cancelled',
  'Returned',
] as const;

export const SUPPLIER_PAYMENT_STATUSES = [
  'Draft',
  'Submitted',
  'Pending Approval',
  'Finance Review',
  'Approved',
  'Ready for Treasury',
  'Payment Scheduled',
  'Payment Processing',
  'Paid',
  'Completed',
  'Rejected',
  'Returned',
] as const;

export type PaymentRequestStatus = string;

export type PaymentPostingStatus = 'NotReady' | 'ReadyToPost' | 'Posted' | 'PostingFailed';

export type PaymentRequestRow = {
  requestId: string;
  requestNumber: string;
  paymentType: PaymentRequestType | string;
  requestCategory: string;
  title: string;
  purpose: string;
  businessJustification: string;
  beneficiaryType: string;
  beneficiaryCode: string;
  beneficiaryName: string;
  beneficiaryBankSummary: string;
  description: string;
  grossAmount: number;
  vatAmount: number;
  whtAmount: number;
  retentionAmount: number;
  netAmount: number;
  currencyCode: string;
  companyCode: string;
  paymentSiteCode: string;
  paymentSiteName: string;
  expenseCode: string;
  department: string;
  location: string;
  costCentre: string;
  projectCode: string;
  priority: string;
  requiredDate: string | null;
  requesterCode: string;
  requesterName: string;
  requesterJobTitle: string;
  supervisorName: string;
  submittedAt: string | null;
  currentStage: string;
  currentApproverCode: string;
  currentApproverName: string;
  status: PaymentRequestStatus;
  riskLevel: string;
  riskFlags: string;
  overrideOutstandingAdvance: boolean;
  overrideReason: string;
  sageReference: string;
  sourceDocumentNo: string;
  invoiceNumber: string;
  invoiceDate: string | null;
  dueDate: string | null;
  purchaseOrderNo: string;
  deliveryNoteNo: string;
  grnNo: string;
  contractNo: string;
  paidAt: string | null;
  paymentReference: string;
  postingStatus: PaymentPostingStatus;
  postedAt: string | null;
  postedBy: string;
  posting: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  stageEnteredAt: string | null;
  lastReminderAt: string | null;
  payload: Record<string, unknown>;
  attachments: PaymentRequestAttachment[];
  retirement: Record<string, unknown> | null;
  treasury: Record<string, unknown> | null;
};

export type PaymentRequestAttachment = {
  id: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  uploadedBy: string;
  /** supporting = request docs; payment-evidence = treasury proof; retirement-evidence = cash advance retirement receipts */
  kind?: 'supporting' | 'payment-evidence' | 'retirement-evidence';
};

export type PaymentRequestsWorkspace = {
  generatedAt: string;
  source: string;
  enabledTypes: PaymentRequestType[];
  summary: {
    totalRequests: number;
    totalValue: number;
    pendingApproval: number;
    pendingValue: number;
    returned: number;
    returnedValue: number;
    approved: number;
    approvedValue: number;
    readyForTreasury: number;
    readyValue: number;
    inProgress: number;
    inProgressValue: number;
    paidThisMonth: number;
    paidValue: number;
    rejected: number;
    rejectedValue: number;
  };
  tabCounts: Record<string, number>;
  rows: PaymentRequestRow[];
  /** Present when list is loaded for a signed-in viewer. */
  viewer?: {
    actorCode: string;
    /** True only for Finance department / Global Super Admin. */
    canViewAll?: boolean;
    approvableRequestIds: string[];
    editableReturnedRequestIds?: string[];
  };
};

export type CreatePaymentRequestInput = {
  paymentType: PaymentRequestType;
  title: string;
  purpose?: string;
  businessJustification?: string;
  beneficiaryCode?: string;
  beneficiaryName: string;
  beneficiaryBankSummary?: string;
  description?: string;
  amount: number;
  currencyCode?: string;
  companyCode?: string;
  paymentSiteCode?: string;
  paymentSiteName?: string;
  expenseCode?: string;
  department?: string;
  location?: string;
  costCentre?: string;
  projectCode?: string;
  priority?: string;
  requiredDate?: string;
  requesterCode: string;
  requesterName: string;
  requesterJobTitle?: string;
  supervisorName?: string;
  requestCategory?: string;
  /** Supplier invoice only: po-backed | expense-no-po */
  invoiceCategory?: SupplierInvoiceCategory | string;
  /** Optional nature when invoiceCategory is expense-no-po (Utility, LAWMA, etc.). */
  expenseNature?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  dueDate?: string;
  vatAmount?: number;
  whtAmount?: number;
  retentionAmount?: number;
  purchaseOrderNo?: string;
  deliveryNoteNo?: string;
  grnNo?: string;
  contractNo?: string;
  overrideOutstandingAdvance?: boolean;
  overrideReason?: string;
  submit?: boolean;
  actor: string;
  /** Final metadata already saved to disk (optional). */
  attachments?: PaymentRequestAttachment[];
  /** Raw uploads to persist during create (supplier invoices require at least one). */
  attachmentUploads?: Array<{
    fileName: string;
    mimeType?: string;
    contentBase64: string;
  }>;
};

const compact = (value: unknown) => String(value ?? '').trim();
const nowIso = () => new Date().toISOString();
const moneyRound = (value: number) => Math.round(value * 10000) / 10000;

const resolveInitialStage = async (
  amount: number,
  paymentType: PaymentRequestType,
  context?: {
    currencyCode?: string;
    department?: string;
    projectCode?: string;
    requesterCode?: string;
    supervisorName?: string;
  },
) => {
  try {
    const matched = await resolveApprovalChain({
      amount,
      currencyCode: context?.currencyCode || 'NGN',
      department: context?.department,
      projectCode: context?.projectCode,
      requesterCode: context?.requesterCode,
      supervisorName: context?.supervisorName,
    });
    if (matched) {
      return {
        stage: matched.currentStage,
        status: 'Pending Approval' as const,
        matrixRuleName: matched.ruleName,
        approvalLevel: matched.approvalLevel,
        stages: matched.stages,
        pathType: matched.pathType,
        amountNgn: matched.amountNgn,
        fxRate: matched.fxRate,
        fxRateDate: matched.fxRateDate,
        fxSource: matched.fxSource,
      };
    }
  } catch (error) {
    console.error('[payment-requests] approval chain resolve failed; using fallback stage', error);
  }

  // Safe fallback if matrix unavailable — still convert for consistent NGN routing metadata.
  const converted = await convertAmountToNgn(amount, context?.currencyCode || 'NGN').catch(() => ({
    amountNgn: amount,
    fxRate: 1,
    fxRateDate: new Date().toISOString().slice(0, 10),
    fxSource: 'Fallback',
  }));
  const isProject = isProjectPaymentPath({
    department: context?.department,
    projectCode: context?.projectCode,
  });
  const amountNgn = Number(converted.amountNgn || amount || 0);
  let fallbackStages: string[];
  let matrixRuleName: string | null = null;
  if (isProject) {
    if (amountNgn <= 200000) {
      fallbackStages = ['Project Manager', 'Cost Controller', 'Finance Manager'];
      matrixRuleName = 'PROJ_LE_200K';
    } else if (amountNgn <= 5000000) {
      fallbackStages = ['Project Manager', 'Cost Controller', 'Finance Manager', 'GM', 'CFO'];
      matrixRuleName = 'PROJ_LE_5M';
    } else {
      fallbackStages = ['Project Manager', 'Cost Controller', 'Finance Manager', 'GM', 'CFO', 'MD/CEO'];
      matrixRuleName = 'PROJ_GT_5M';
    }
  } else if (amountNgn <= 200000) {
    fallbackStages = ['Reporting Manager', 'Finance Manager'];
    matrixRuleName = 'NONPROJ_LE_200K';
  } else if (amountNgn <= 1000000) {
    fallbackStages = ['Reporting Manager', 'Finance Manager', 'CFO'];
    matrixRuleName = 'NONPROJ_LE_1M';
  } else {
    fallbackStages = ['Reporting Manager', 'Finance Manager', 'CFO', 'MD/CEO'];
    matrixRuleName = 'NONPROJ_GT_1M';
  }
  fallbackStages = await applyMdLineManagerLastApproverRule({
    stages: fallbackStages,
    amountNgn,
    pathType: isProject ? 'Project' : 'Non-project',
    requesterCode: context?.requesterCode,
    supervisorName: context?.supervisorName,
  });
  return {
    stage: fallbackStages[0],
    status: 'Pending Approval' as const,
    matrixRuleName,
    approvalLevel: fallbackStages.length,
    stages: fallbackStages,
    pathType: isProject ? 'Project' as const : 'Non-project' as const,
    amountNgn: converted.amountNgn,
    fxRate: converted.fxRate,
    fxRateDate: converted.fxRateDate,
    fxSource: converted.fxSource,
  };
};

const mapRow = (row: Record<string, unknown>): PaymentRequestRow => {
  const parseJson = <T,>(value: unknown, fallback: T): T => {
    if (!value) return fallback;
    try {
      return JSON.parse(String(value)) as T;
    } catch {
      return fallback;
    }
  };
  return {
    requestId: compact(row.RequestId),
    requestNumber: compact(row.RequestNumber),
    paymentType: compact(row.PaymentType),
    requestCategory: compact(row.RequestCategory),
    title: compact(row.Title),
    purpose: compact(row.Purpose),
    businessJustification: compact(row.BusinessJustification),
    beneficiaryType: compact(row.BeneficiaryType),
    beneficiaryCode: compact(row.BeneficiaryCode),
    beneficiaryName: compact(row.BeneficiaryName),
    beneficiaryBankSummary: compact(row.BeneficiaryBankSummary),
    description: compact(row.Description),
    grossAmount: Number(row.GrossAmount || 0),
    vatAmount: Number(row.VatAmount || 0),
    whtAmount: Number(row.WhtAmount || 0),
    retentionAmount: Number(row.RetentionAmount || 0),
    netAmount: Number(row.NetAmount || 0),
    currencyCode: compact(row.CurrencyCode) || 'NGN',
    companyCode: compact(row.CompanyCode),
    paymentSiteCode: compact(row.PaymentSiteCode) || compact(row.CompanyCode),
    paymentSiteName: compact(row.PaymentSiteName),
    expenseCode: compact(row.ExpenseCode),
    department: compact(row.Department),
    location: compact(row.Location),
    costCentre: compact(row.CostCentre),
    projectCode: compact(row.ProjectCode),
    priority: compact(row.Priority) || 'Normal',
    requiredDate: row.RequiredDate ? new Date(String(row.RequiredDate)).toISOString() : null,
    requesterCode: compact(row.RequesterCode),
    requesterName: compact(row.RequesterName),
    requesterJobTitle: compact(row.RequesterJobTitle),
    supervisorName: compact(row.SupervisorName),
    submittedAt: row.SubmittedAt ? new Date(String(row.SubmittedAt)).toISOString() : null,
    currentStage: compact(row.CurrentStage),
    currentApproverCode: compact(row.CurrentApproverCode),
    currentApproverName: compact(row.CurrentApproverName),
    status: compact(row.Status) || 'Draft',
    riskLevel: compact(row.RiskLevel) || 'Normal',
    riskFlags: compact(row.RiskFlags),
    overrideOutstandingAdvance: Boolean(row.OverrideOutstandingAdvance),
    overrideReason: compact(row.OverrideReason),
    sageReference: compact(row.SageReference),
    sourceDocumentNo: compact(row.SourceDocumentNo),
    invoiceNumber: compact(row.InvoiceNumber),
    invoiceDate: row.InvoiceDate ? new Date(String(row.InvoiceDate)).toISOString() : null,
    dueDate: row.DueDate ? new Date(String(row.DueDate)).toISOString() : null,
    purchaseOrderNo: compact(row.PurchaseOrderNo),
    deliveryNoteNo: compact(row.DeliveryNoteNo),
    grnNo: compact(row.GrnNo),
    contractNo: compact(row.ContractNo),
    paidAt: row.PaidAt ? new Date(String(row.PaidAt)).toISOString() : null,
    paymentReference: compact(row.PaymentReference),
    postingStatus: (compact(row.PostingStatus) as PaymentPostingStatus) || 'NotReady',
    postedAt: row.PostedAt ? new Date(String(row.PostedAt)).toISOString() : null,
    postedBy: compact(row.PostedBy),
    posting: parseJson(row.PostingJson, null),
    createdAt: row.CreatedAt ? new Date(String(row.CreatedAt)).toISOString() : nowIso(),
    updatedAt: row.UpdatedAt ? new Date(String(row.UpdatedAt)).toISOString() : nowIso(),
    stageEnteredAt: row.StageEnteredAt ? new Date(String(row.StageEnteredAt)).toISOString() : null,
    lastReminderAt: row.LastReminderAt ? new Date(String(row.LastReminderAt)).toISOString() : null,
    payload: parseJson(row.PayloadJson, {}),
    attachments: parseJson(row.AttachmentsJson, []) as PaymentRequestAttachment[],
    retirement: parseJson(row.RetirementJson, null),
    treasury: parseJson(row.TreasuryJson, null),
  };
};

const emptyWorkspace = (): PaymentRequestsWorkspace => ({
  generatedAt: nowIso(),
  source: 'DLE Enterprise · finance.PaymentRequests',
  enabledTypes: [...PAYMENT_TYPES],
  summary: {
    totalRequests: 0,
    totalValue: 0,
    pendingApproval: 0,
    pendingValue: 0,
    returned: 0,
    returnedValue: 0,
    approved: 0,
    approvedValue: 0,
    readyForTreasury: 0,
    readyValue: 0,
    inProgress: 0,
    inProgressValue: 0,
    paidThisMonth: 0,
    paidValue: 0,
    rejected: 0,
    rejectedValue: 0,
  },
  tabCounts: {
    all: 0,
    mine: 0,
    drafts: 0,
    pending: 0,
    returned: 0,
    approved: 0,
    ready: 0,
    paid: 0,
    rejected: 0,
    retirement: 0,
    awaitingRetirement: 0,
  },
  rows: [],
});

const listRows = async (input?: {
  paymentType?: string;
  status?: string;
  requesterCode?: string;
  mineFor?: string;
  /** When set without view-all rights, restrict to requester / approver / beneficiary. */
  scopedToActorCode?: string;
  /** Inbox: only pending items assigned to this approver. */
  awaitingApproverCode?: string;
  /** Inbox for MD/CEO: also include the MD/CEO stage even if the seat code differs. */
  includeMdCeoStage?: boolean;
  /** When true, never return unscoped rows (fail closed). */
  requireActorScope?: boolean;
}): Promise<PaymentRequestRow[]> => {
  const pool = await ensureFinanceDb().catch(() => null);
  if (!pool) return [];
  try {
    const request = pool.request();
    let where = '1=1';
    if (input?.paymentType) {
      request.input('paymentType', sql.NVarChar(80), input.paymentType);
      where += ' AND [PaymentType] = @paymentType';
    }
    if (input?.status) {
      request.input('status', sql.NVarChar(40), input.status);
      where += ' AND [Status] = @status';
    }
    const awaitingApprover = compact(input?.awaitingApproverCode);
    const mineFor = compact(input?.requesterCode || input?.mineFor);
    const scopedActor = compact(input?.scopedToActorCode);
    if (awaitingApprover) {
      request.input('approver', sql.NVarChar(60), awaitingApprover);
      where += ` AND [Status] IN (N'Pending Approval', N'Submitted', N'Finance Review') AND (
  [CurrentApproverCode] = @approver
  ${input?.includeMdCeoStage ? `OR [CurrentApproverCode] = N'P0413' OR LOWER(ISNULL([CurrentStage], N'')) LIKE N'%md%' OR LOWER(ISNULL([CurrentStage], N'')) LIKE N'%managing director%'` : ''}
)`;
    } else if (mineFor) {
      request.input('requester', sql.NVarChar(60), mineFor);
      where += ' AND [RequesterCode] = @requester';
    } else if (scopedActor) {
      request.input('scopedActor', sql.NVarChar(60), scopedActor);
      where += ` AND (
  [RequesterCode] = @scopedActor
  OR [CurrentApproverCode] = @scopedActor
  OR [BeneficiaryCode] = @scopedActor
)`;
    } else if (input?.requireActorScope) {
      // Fail closed: missing actor identity must never return the full payment queue.
      return [];
    }
    const result = await request.query(`
SELECT TOP 500 *
FROM [finance].[PaymentRequests]
WHERE ${where}
ORDER BY COALESCE([SubmittedAt], [CreatedAt]) DESC
`);
    return (result.recordset || []).map((row: Record<string, unknown>) => mapRow(row));
  } catch {
    return [];
  }
};

export const getPaymentRequestById = async (requestId: string): Promise<PaymentRequestRow | null> => {
  const id = compact(requestId);
  if (!id) return null;
  const pool = await ensureFinanceDb().catch(() => null);
  if (!pool) return null;
  try {
    const result = await pool.request()
      .input('RequestId', sql.NVarChar(60), id)
      .query(`
SELECT TOP 1 *
FROM [finance].[PaymentRequests]
WHERE [RequestId] = @RequestId OR [RequestNumber] = @RequestId
`);
    const row = result.recordset?.[0] as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  } catch {
    return null;
  }
};

export type PaymentRequestActionRow = {
  actionId: string;
  requestId: string;
  actionType: string;
  stage: string;
  actorName: string;
  actorCode: string;
  comment: string;
  reason: string;
  createdAt: string;
};

export type PaymentRequestCommentRow = {
  commentId: string;
  requestId: string;
  actorCode: string;
  actorName: string;
  body: string;
  createdAt: string;
};

/** Document / PDF action history shows only submission and approvals. */
export {
  filterDocumentPaymentActions,
  isDocumentVisiblePaymentAction,
} from '@/lib/finance-intelligence/payment-action-visibility';

export const listPaymentRequestActions = async (requestId: string): Promise<PaymentRequestActionRow[]> => {
  const pool = await ensureFinanceDb().catch(() => null);
  if (!pool) return [];
  try {
    const result = await pool.request()
      .input('RequestId', sql.NVarChar(60), requestId)
      .query(`
SELECT TOP 100 [ActionId], [RequestId], [ActionType], [Stage], [ActorCode], [ActorName], [Comment], [Reason], [CreatedAt]
FROM [finance].[PaymentRequestActions]
WHERE [RequestId] = @RequestId
ORDER BY [CreatedAt] DESC
`);
    return (result.recordset || []).map((row: Record<string, unknown>) => ({
      actionId: compact(row.ActionId),
      requestId: compact(row.RequestId),
      actionType: compact(row.ActionType),
      stage: compact(row.Stage),
      actorCode: compact(row.ActorCode),
      actorName: compact(row.ActorName),
      comment: compact(row.Comment),
      reason: compact(row.Reason),
      createdAt: row.CreatedAt ? new Date(String(row.CreatedAt)).toISOString() : nowIso(),
    }));
  } catch {
    return [];
  }
};

export const listPaymentRequestComments = async (requestId: string): Promise<PaymentRequestCommentRow[]> => {
  const pool = await ensureFinanceDb().catch(() => null);
  if (!pool) return [];
  try {
    const result = await pool.request()
      .input('RequestId', sql.NVarChar(60), requestId)
      .query(`
SELECT TOP 200 [CommentId], [RequestId], [ActorCode], [ActorName], [Body], [CreatedAt]
FROM [finance].[PaymentRequestComments]
WHERE [RequestId] = @RequestId
ORDER BY [CreatedAt] ASC
`);
    return (result.recordset || []).map((row: Record<string, unknown>) => ({
      commentId: compact(row.CommentId),
      requestId: compact(row.RequestId),
      actorCode: compact(row.ActorCode),
      actorName: compact(row.ActorName),
      body: compact(row.Body),
      createdAt: row.CreatedAt ? new Date(String(row.CreatedAt)).toISOString() : nowIso(),
    }));
  } catch {
    return [];
  }
};

export const addPaymentRequestComment = async (input: {
  requestId: string;
  actor: string;
  actorCode: string;
  body: string;
  baseUrl?: string | null;
}) => {
  const request = await getPaymentRequestById(input.requestId);
  if (!request) throw new Error('Payment request not found.');
  const body = compact(input.body);
  if (body.length < 2) throw new Error('Enter a comment before sending.');
  if (body.length > 4000) throw new Error('Comment must be 4,000 characters or fewer.');

  const pool = await ensureFinanceDb().catch(() => null);
  if (!pool) throw new Error('Finance database is not available.');
  const commentId = `PRC-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await pool.request()
    .input('CommentId', sql.NVarChar(60), commentId)
    .input('RequestId', sql.NVarChar(60), request.requestId)
    .input('ActorCode', sql.NVarChar(60), compact(input.actorCode) || null)
    .input('ActorName', sql.NVarChar(200), compact(input.actor) || 'Finance User')
    .input('Body', sql.NVarChar(sql.MAX), body)
    .query(`
INSERT INTO [finance].[PaymentRequestComments]
  ([CommentId], [RequestId], [ActorCode], [ActorName], [Body])
VALUES
  (@CommentId, @RequestId, @ActorCode, @ActorName, @Body)
`);

  const actorCode = compact(input.actorCode).toLowerCase();
  const isInitiator = actorCode
    && (
      compact(request.requesterCode).toLowerCase() === actorCode
      || (request.paymentType === 'Cash Advance Payment' && compact(request.beneficiaryCode).toLowerCase() === actorCode)
    );
  const recipientCode = isInitiator ? compact(request.currentApproverCode) : compact(request.requesterCode);
  const recipientName = isInitiator
    ? compact(request.currentApproverName).replace(/\s*\(Delegated.*$/i, '')
    : compact(request.requesterName);
  await notifyPaymentClarificationComment({
    request,
    actorName: compact(input.actor) || 'Finance User',
    actorCode: compact(input.actorCode),
    comment: body,
    recipientCode,
    recipientName,
    baseUrl: input.baseUrl,
  }).catch((error) => console.error('[payment-requests] comment notification failed', error));

  return {
    comment: {
      commentId,
      requestId: request.requestId,
      actorCode: compact(input.actorCode),
      actorName: compact(input.actor) || 'Finance User',
      body,
      createdAt: nowIso(),
    } satisfies PaymentRequestCommentRow,
    comments: await listPaymentRequestComments(request.requestId),
    request,
  };
};

const assignCurrentApprover = async (input: {
  requestId: string;
  stage: string;
  requesterCode?: string;
  projectCode?: string;
  supervisorName?: string;
  paymentType?: string;
}) => {
  const approver = await resolvePaymentStageApprover({
    stage: input.stage,
    requesterCode: input.requesterCode,
    projectCode: input.projectCode,
    supervisorName: input.supervisorName,
    paymentType: input.paymentType,
  });
  const displayName = approver.delegatedFrom
    ? `${approver.name} (Delegated from ${approver.delegatedFrom.name || approver.delegatedFrom.code})`
    : (approver.name || input.stage);
  const pool = await ensureFinanceDb().catch(() => null);
  if (pool) {
    try {
      await pool.request()
        .input('RequestId', sql.NVarChar(60), input.requestId)
        .input('ApproverCode', sql.NVarChar(60), approver.code || null)
        .input('ApproverName', sql.NVarChar(200), displayName)
        .query(`
UPDATE [finance].[PaymentRequests]
SET [CurrentApproverCode] = @ApproverCode,
    [CurrentApproverName] = @ApproverName,
    [StageEnteredAt] = SYSUTCDATETIME(),
    [LastReminderAt] = NULL,
    [UpdatedAt] = SYSUTCDATETIME()
WHERE [RequestId] = @RequestId
`);
    } catch {
      // best-effort — StageEnteredAt/LastReminderAt may not exist until schema migrate
      try {
        await pool.request()
          .input('RequestId', sql.NVarChar(60), input.requestId)
          .input('ApproverCode', sql.NVarChar(60), approver.code || null)
          .input('ApproverName', sql.NVarChar(200), displayName)
          .query(`
UPDATE [finance].[PaymentRequests]
SET [CurrentApproverCode] = @ApproverCode,
    [CurrentApproverName] = @ApproverName,
    [UpdatedAt] = SYSUTCDATETIME()
WHERE [RequestId] = @RequestId
`);
      } catch {
        // ignore
      }
    }
  }
  return approver;
};

const stagesFromPayload = (payload: Record<string, unknown>) => {
  const raw = payload.stages;
  if (Array.isArray(raw)) return raw.map((item) => compact(item)).filter(Boolean);
  return [] as string[];
};

const defaultStagesForPayment = (paymentType: string, projectCode?: string | null, department?: string | null) => {
  const isProject = Boolean(compact(projectCode)) || /project/i.test(compact(department));
  if (isVendorPaymentType(paymentType)) {
    return isProject
      ? ['Project Manager', 'Cost Controller', 'Finance Manager']
      : ['Finance Manager'];
  }
  return isProject
    ? ['Project Manager', 'Cost Controller', 'Finance Manager']
    : ['Reporting Manager', 'Finance Manager'];
};

const persistPayloadStages = async (
  requestId: string,
  payload: Record<string, unknown>,
  stages: string[],
  extras?: Record<string, unknown>,
) => {
  const pool = await ensureFinanceDb().catch(() => null);
  if (!pool) return { ...payload, ...extras, stages };
  const nextPayload = { ...payload, ...extras, stages };
  try {
    await pool.request()
      .input('RequestId', sql.NVarChar(60), requestId)
      .input('PayloadJson', sql.NVarChar(sql.MAX), JSON.stringify(nextPayload))
      .query(`
UPDATE [finance].[PaymentRequests]
SET [PayloadJson] = @PayloadJson,
    [UpdatedAt] = SYSUTCDATETIME()
WHERE [RequestId] = @RequestId
`);
  } catch {
    // best-effort
  }
  return nextPayload;
};

/** Re-resolve Approval Limits when payload.stages is missing/incomplete or amount band changed. */
const ensureApprovalStages = async (row: PaymentRequestRow): Promise<string[]> => {
  const existing = stagesFromPayload(row.payload);
  const hasFinanceManager = existing.some((stage) => /finance manager/i.test(stage));
  const onlyReportingManager = existing.length === 1 && /reporting manager|line manager|supervisor/i.test(existing[0]);

  let matchedStages: string[] | null = null;
  let matchedMeta: {
    matrixRuleName: string;
    approvalLevel: number;
    pathType: string;
    amountNgn: number;
    fxRate: number;
    fxRateDate: string;
    fxSource: string;
  } | null = null;
  try {
    const matched = await resolveApprovalChain({
      amount: row.netAmount,
      currencyCode: row.currencyCode || 'NGN',
      department: row.department,
      projectCode: row.projectCode,
      requesterCode: row.requesterCode,
      supervisorName: row.supervisorName,
    });
    if (matched?.stages?.length) {
      matchedStages = matched.stages;
      matchedMeta = {
        matrixRuleName: matched.ruleName,
        approvalLevel: matched.approvalLevel,
        pathType: matched.pathType,
        amountNgn: matched.amountNgn,
        fxRate: matched.fxRate,
        fxRateDate: matched.fxRateDate,
        fxSource: matched.fxSource,
      };
    }
  } catch (error) {
    console.error('[payment-requests] ensureApprovalStages re-resolve failed', error);
  }

  const stagesEqual = (left: string[], right: string[]) =>
    left.length === right.length
    && left.every((stage, index) => stage.toLowerCase() === right[index].toLowerCase());

  const currency = compact(row.currencyCode).toUpperCase() || 'NGN';
  const storedFxRate = Number(row.payload?.fxRate);
  const storedAmountNgn = Number(row.payload?.amountNgn);
  const storedFxSource = compact(row.payload?.fxSource);
  const needsFxRepair = currency !== 'NGN' && (
    !Number.isFinite(storedAmountNgn)
    || storedAmountNgn <= 0
    || !Number.isFinite(storedFxRate)
    || storedFxRate <= 0
    || !compact(row.payload?.fxRateDate)
    || !storedFxSource
    || /seed|fallback/i.test(storedFxSource)
  );

  const needsRepair = existing.length === 0
    || onlyReportingManager
    || (row.paymentType === 'Cash Advance Payment' && existing.length > 0 && !hasFinanceManager)
    || (matchedStages != null && !stagesEqual(existing, matchedStages))
    || needsFxRepair;

  if (!needsRepair) return existing;

  let stages = matchedStages || existing;
  if (!matchedStages) {
    stages = defaultStagesForPayment(row.paymentType, row.projectCode, row.department);
    if (existing[0] && !stages.some((stage) => stage.toLowerCase() === existing[0].toLowerCase())) {
      stages = [existing[0], ...stages.filter((stage) => stage.toLowerCase() !== existing[0].toLowerCase())];
    }
  }

  row.payload = await persistPayloadStages(row.requestId, row.payload, stages, {
    matrixRuleName: matchedMeta?.matrixRuleName || row.payload.matrixRuleName || null,
    approvalLevel: matchedMeta?.approvalLevel || row.payload.approvalLevel || stages.length,
    pathType: matchedMeta?.pathType || row.payload.pathType || null,
    amountNgn: matchedMeta?.amountNgn || row.payload.amountNgn || row.netAmount,
    fxRate: matchedMeta?.fxRate || row.payload.fxRate || 1,
    fxRateDate: matchedMeta?.fxRateDate || row.payload.fxRateDate || null,
    fxSource: matchedMeta?.fxSource || row.payload.fxSource || null,
    repairedStages: true,
  });
  return stages;
};

/**
 * Requests that jumped to Treasury after Reporting Manager only (missing Finance Manager)
 * are pulled back to Pending Approval at Finance Manager.
 */
export const repairPrematureTreasuryHandoff = async (row: PaymentRequestRow): Promise<PaymentRequestRow> => {
  if (!/ready for treasury/i.test(row.status) && !/^treasury$/i.test(compact(row.currentStage))) {
    return row;
  }

  const stages = await ensureApprovalStages(row);
  const financeIdx = stages.findIndex((stage) => /finance manager/i.test(stage));
  if (financeIdx < 0) return row;

  const actions = await listPaymentRequestActions(row.requestId);
  const financeApproved = actions.some((action) =>
    /approve/i.test(action.actionType)
    && /finance manager/i.test(action.stage || ''));
  if (financeApproved) return row;

  // Only rewind when the last approval stage that should run has not happened yet.
  const lastRequired = stages[stages.length - 1];
  const lastRequiredApproved = actions.some((action) =>
    /approve/i.test(action.actionType)
    && compact(action.stage).toLowerCase() === lastRequired.toLowerCase());
  if (lastRequiredApproved) return row;

  const pool = await ensureFinanceDb().catch(() => null);
  if (!pool) return row;

  const nextStage = stages[financeIdx] || 'Finance Manager';
  try {
    await pool.request()
      .input('RequestId', sql.NVarChar(60), row.requestId)
      .input('Status', sql.NVarChar(40), 'Pending Approval')
      .input('CurrentStage', sql.NVarChar(80), nextStage)
      .query(`
UPDATE [finance].[PaymentRequests]
SET [Status] = @Status,
    [CurrentStage] = @CurrentStage,
    [UpdatedAt] = SYSUTCDATETIME()
WHERE [RequestId] = @RequestId
`);
    await assignCurrentApprover({
      requestId: row.requestId,
      stage: nextStage,
      requesterCode: row.requesterCode,
      projectCode: row.projectCode,
      supervisorName: row.supervisorName,
      paymentType: row.paymentType,
    });
    await logAction({
      requestId: row.requestId,
      actionType: 'repair-stages',
      stage: nextStage,
      actorName: 'System',
      actorCode: 'system',
      comment: 'Restored Finance Manager approval step skipped by incomplete approval chain.',
    });
  } catch (error) {
    console.error('[payment-requests] repairPrematureTreasuryHandoff failed', error);
    return row;
  }

  return (await getPaymentRequestById(row.requestId)) || row;
};

const countOutstandingCashAdvances = async (employeeCode: string) => {
  const outstanding = await listOutstandingCashAdvances(employeeCode);
  return outstanding.length;
};

export const listOutstandingCashAdvances = async (employeeCode?: string): Promise<PaymentRequestRow[]> => {
  const pool = await ensureFinanceDb().catch(() => null);
  if (!pool) return [];
  try {
    const request = pool.request();
    let employeeFilter = '';
    if (compact(employeeCode)) {
      request.input('employee', sql.NVarChar(60), compact(employeeCode));
      employeeFilter = ' AND ([BeneficiaryCode] = @employee OR [RequesterCode] = @employee)';
    }
    const statusList = OUTSTANDING_CASH_ADVANCE_STATUSES.map((status) => `N'${status.replace(/'/g, "''")}'`).join(', ');
    const result = await request.query(`
SELECT *
FROM [finance].[PaymentRequests]
WHERE [PaymentType] = N'Cash Advance Payment'
  AND [Status] IN (${statusList})
  ${employeeFilter}
ORDER BY COALESCE([SubmittedAt], [CreatedAt]) DESC
`);
    return (result.recordset || []).map((row: Record<string, unknown>) => mapRow(row));
  } catch {
    return [];
  }
};

const findActiveCashAdvanceWaiver = async (employeeCode: string) => {
  const pool = await ensureFinanceDb().catch(() => null);
  if (!pool || !employeeCode) return null;
  try {
    const result = await pool.request()
      .input('employee', sql.NVarChar(60), employeeCode)
      .query(`
SELECT TOP 1 [WaiverId], [Reason], [GrantedBy], [CreatedAt]
FROM [finance].[CashAdvanceWaivers]
WHERE [EmployeeCode] = @employee
  AND [Status] = N'Active'
ORDER BY [CreatedAt] DESC
`);
    const row = result.recordset?.[0] as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      waiverId: compact(row.WaiverId),
      reason: compact(row.Reason),
      grantedBy: compact(row.GrantedBy),
      createdAt: row.CreatedAt ? new Date(String(row.CreatedAt)).toISOString() : nowIso(),
    };
  } catch {
    return null;
  }
};

const listActiveCashAdvanceWaivers = async () => {
  const pool = await ensureFinanceDb().catch(() => null);
  if (!pool) return [];
  try {
    const result = await pool.request().query(`
SELECT [WaiverId], [EmployeeCode], [Reason], [GrantedBy], [CreatedAt]
FROM [finance].[CashAdvanceWaivers]
WHERE [Status] = N'Active'
ORDER BY [CreatedAt] DESC
`);
    return (result.recordset || []).map((row: Record<string, unknown>) => ({
      waiverId: compact(row.WaiverId),
      employeeCode: compact(row.EmployeeCode),
      reason: compact(row.Reason),
      grantedBy: compact(row.GrantedBy),
      createdAt: row.CreatedAt ? new Date(String(row.CreatedAt)).toISOString() : nowIso(),
    }));
  } catch {
    return [];
  }
};

const consumeCashAdvanceWaiver = async (waiverId: string, requestId: string) => {
  const pool = await ensureFinanceDb().catch(() => null);
  if (!pool || !waiverId) return;
  await pool.request()
    .input('WaiverId', sql.NVarChar(60), waiverId)
    .input('RequestId', sql.NVarChar(60), requestId)
    .query(`
UPDATE [finance].[CashAdvanceWaivers]
SET [Status] = N'Consumed',
    [ConsumedAt] = SYSUTCDATETIME(),
    [ConsumedByRequestId] = @RequestId
WHERE [WaiverId] = @WaiverId
  AND [Status] = N'Active'
`);
};

export const getCashAdvanceEligibility = async (employeeCode: string): Promise<CashAdvanceEligibility> => {
  const code = compact(employeeCode);
  const outstanding = await listOutstandingCashAdvances(code);
  const activeWaiver = code ? await findActiveCashAdvanceWaiver(code) : null;
  const blocked = outstanding.length > 0 && !activeWaiver;
  const canRaise = !blocked && Boolean(code);
  let message = 'Eligible to raise a cash advance.';
  if (!code) message = 'Select an employee before continuing.';
  else if (blocked) {
    message = `Blocked: ${outstanding.length} outstanding cash advance${outstanding.length === 1 ? '' : 's'} must be retired first, or CFO must cancel/waive.`;
  } else if (outstanding.length > 0 && activeWaiver) {
    message = `Outstanding advance exists, but CFO waiver ${activeWaiver.waiverId} is active.`;
  }
  return {
    employeeCode: code,
    outstandingCount: outstanding.length,
    canRaise,
    blocked,
    message,
    activeWaiver,
    outstanding: outstanding.map((row) => ({
      requestId: row.requestId,
      requestNumber: row.requestNumber,
      title: row.title,
      netAmount: row.netAmount,
      currencyCode: row.currencyCode,
      status: row.status,
      currentStage: row.currentStage,
      submittedAt: row.submittedAt,
      paymentSiteCode: row.paymentSiteCode || row.companyCode,
    })),
  };
};

export const buildCashAdvanceControlsWorkspace = async (): Promise<CashAdvanceControlsWorkspace> => {
  const [outstanding, activeWaivers] = await Promise.all([
    listOutstandingCashAdvances(),
    listActiveCashAdvanceWaivers(),
  ]);
  const awaitingRetirement = outstanding.filter((row) =>
    /awaiting retirement|retirement submitted|treasury verification|finance verification/i.test(row.status));
  const blockedEmployees = new Set(
    outstanding
      .map((row) => compact(row.beneficiaryCode || row.requesterCode))
      .filter(Boolean)
      .filter((code) => !activeWaivers.some((waiver) => waiver.employeeCode === code)),
  );
  return {
    generatedAt: nowIso(),
    outstanding,
    activeWaivers,
    summary: {
      outstandingCount: outstanding.length,
      awaitingRetirement: awaitingRetirement.length,
      activeWaivers: activeWaivers.length,
      blockedEmployees: blockedEmployees.size,
    },
  };
};

export const grantCashAdvanceWaiver = async (input: {
  employeeCode: string;
  reason: string;
  grantedBy: string;
  grantedByCode?: string;
}) => {
  const employeeCode = compact(input.employeeCode);
  const reason = compact(input.reason);
  if (!employeeCode) throw new Error('Employee code is required.');
  if (reason.length < 10) throw new Error('Provide a clear CFO reason (at least 10 characters).');
  const pool = await ensureFinanceDb();
  if (!pool) throw new Error('Finance database is unavailable.');

  const existing = await findActiveCashAdvanceWaiver(employeeCode);
  if (existing) {
    return { waiverId: existing.waiverId, alreadyActive: true as const };
  }

  const outstanding = await listOutstandingCashAdvances(employeeCode);
  if (!outstanding.length) {
    throw new Error('This employee has no outstanding cash advance to waive.');
  }

  const waiverId = `CAW-${Date.now()}`;
  await pool.request()
    .input('WaiverId', sql.NVarChar(60), waiverId)
    .input('EmployeeCode', sql.NVarChar(60), employeeCode)
    .input('GrantedBy', sql.NVarChar(200), input.grantedBy)
    .input('Reason', sql.NVarChar(sql.MAX), reason)
    .query(`
INSERT INTO [finance].[CashAdvanceWaivers] ([WaiverId], [EmployeeCode], [GrantedBy], [Reason], [Status])
VALUES (@WaiverId, @EmployeeCode, @GrantedBy, @Reason, N'Active')
`);

  await logAction({
    requestId: outstanding[0].requestId,
    actionType: 'CFO Waiver Granted',
    stage: outstanding[0].currentStage,
    actorName: input.grantedBy,
    actorCode: input.grantedByCode,
    comment: `Waiver ${waiverId} granted for ${employeeCode}.`,
    reason,
  });

  return { waiverId, alreadyActive: false as const, workspace: await buildCashAdvanceControlsWorkspace() };
};

export const cancelOutstandingCashAdvance = async (input: {
  requestId: string;
  reason: string;
  actor: string;
  actorCode?: string;
}) => {
  const requestId = compact(input.requestId);
  const reason = compact(input.reason);
  if (!requestId) throw new Error('Request id is required.');
  if (reason.length < 10) throw new Error('Provide a clear CFO cancellation reason (at least 10 characters).');

  const pool = await ensureFinanceDb();
  if (!pool) throw new Error('Finance database is unavailable.');

  const existing = (await listRows()).find((row) => row.requestId === requestId);
  if (!existing) throw new Error('Payment request not found.');
  if (existing.paymentType !== 'Cash Advance Payment') {
    throw new Error('Only cash advance requests can be cancelled for retirement control.');
  }
  const outstandingMatch = OUTSTANDING_CASH_ADVANCE_STATUSES.some(
    (status) => status.toLowerCase() === existing.status.toLowerCase(),
  );
  if (!outstandingMatch) {
    throw new Error(`Request ${existing.requestNumber} is not in an outstanding state.`);
  }

  await pool.request()
    .input('RequestId', sql.NVarChar(60), requestId)
    .input('Status', sql.NVarChar(40), 'Cancelled')
    .input('CurrentStage', sql.NVarChar(80), 'CFO Cancelled – Retirement Not Required')
    .query(`
UPDATE [finance].[PaymentRequests]
SET [Status] = @Status,
    [CurrentStage] = @CurrentStage,
    [UpdatedAt] = SYSUTCDATETIME()
WHERE [RequestId] = @RequestId
`);

  await logAction({
    requestId,
    actionType: 'CFO Cancelled Outstanding',
    stage: 'CFO Cancelled – Retirement Not Required',
    actorName: input.actor,
    actorCode: input.actorCode,
    comment: 'Outstanding cash advance cancelled by CFO. Retirement requirement removed.',
    reason,
  });

  const employeeCode = compact(existing.beneficiaryCode || existing.requesterCode);
  if (employeeCode) {
    const waiver = await findActiveCashAdvanceWaiver(employeeCode);
    if (waiver) {
      await pool.request()
        .input('WaiverId', sql.NVarChar(60), waiver.waiverId)
        .input('RequestId', sql.NVarChar(60), requestId)
        .query(`
UPDATE [finance].[CashAdvanceWaivers]
SET [Status] = N'Revoked',
    [ConsumedAt] = SYSUTCDATETIME(),
    [ConsumedByRequestId] = @RequestId
WHERE [WaiverId] = @WaiverId
  AND [Status] = N'Active'
`);
    }
  }

  return {
    request: (await listRows()).find((row) => row.requestId === requestId) || null,
    workspace: await buildCashAdvanceControlsWorkspace(),
    paymentWorkspace: await buildPaymentRequestsWorkspace({ paymentType: 'Cash Advance Payment' }),
  };
};

/** Document type code kept for legacy lookups only — new numbers are site+yymm+serial. */
const normalizeSiteCode = (value?: string | null) => {
  const code = compact(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code === 'DLENG' || code === 'DLE') return 'DLE';
  if (code === 'DLPCG' || code === 'DLPC') return 'DLPC';
  return code || 'DLE';
};

/**
 * Site-scoped document number: {SITE}{yy}{mm}{serial}
 * e.g. DLE26081, DLPC26082 — serial is not zero-padded; resets per site + calendar month.
 */
const nextRequestNumber = async (input: {
  paymentType: PaymentRequestType | string;
  paymentSiteCode?: string | null;
}) => {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const site = normalizeSiteCode(input.paymentSiteCode);
  const prefix = `${site}${yy}${month}`;
  const format = (seq: number) => `${prefix}${seq}`;

  const pool = await ensureFinanceDb().catch(() => null);
  if (!pool) return format(1);
  try {
    // Match both new format (DLE26081) and any legacy numbers that share this site+month stem.
    const result = await pool.request()
      .input('prefix', sql.NVarChar(40), prefix)
      .query(`
SELECT TOP 50 [RequestNumber]
FROM [finance].[PaymentRequests]
WHERE [RequestNumber] LIKE @prefix + N'%'
ORDER BY LEN([RequestNumber]) DESC, [RequestNumber] DESC
`);
    let maxSeq = 0;
    for (const row of result.recordset || []) {
      const latest = compact(row.RequestNumber);
      if (!latest.startsWith(prefix)) continue;
      const trailing = latest.slice(prefix.length);
      if (!/^\d+$/.test(trailing)) continue;
      const seq = Number(trailing);
      if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq;
    }
    return format(maxSeq + 1);
  } catch {
    return format(1);
  }
};

const logAction = async (input: {
  requestId: string;
  actionType: string;
  stage?: string;
  actorCode?: string;
  actorName: string;
  comment?: string;
  reason?: string;
}) => {
  const pool = await ensureFinanceDb().catch(() => null);
  if (!pool) return;
  try {
    await pool.request()
      .input('ActionId', sql.NVarChar(60), `PRA-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`)
      .input('RequestId', sql.NVarChar(60), input.requestId)
      .input('ActionType', sql.NVarChar(40), input.actionType)
      .input('Stage', sql.NVarChar(80), input.stage || null)
      .input('ActorCode', sql.NVarChar(60), input.actorCode || null)
      .input('ActorName', sql.NVarChar(200), input.actorName)
      .input('Comment', sql.NVarChar(sql.MAX), input.comment || null)
      .input('Reason', sql.NVarChar(sql.MAX), input.reason || null)
      .query(`
INSERT INTO [finance].[PaymentRequestActions]
  ([ActionId], [RequestId], [ActionType], [Stage], [ActorCode], [ActorName], [Comment], [Reason])
VALUES
  (@ActionId, @RequestId, @ActionType, @Stage, @ActorCode, @ActorName, @Comment, @Reason)
`);
  } catch {
    // audit best-effort
  }
};

export const migrateLegacyExpensePayments = async () => {
  const pool = await ensureFinanceDb().catch(() => null);
  if (!pool) return { updated: 0 };
  try {
    const result = await pool.request().query(`
UPDATE [finance].[PaymentRequests]
SET [PaymentType] = N'Expense Payment',
    [RequestCategory] = COALESCE(NULLIF(LTRIM(RTRIM([RequestCategory])), N''), N'Expense (No PO)'),
    [PurchaseOrderNo] = NULL,
    [DeliveryNoteNo] = NULL,
    [GrnNo] = NULL,
    [UpdatedAt] = SYSUTCDATETIME()
WHERE [PaymentType] = N'Supplier Invoice Payment'
  AND (
    LOWER(COALESCE([RequestCategory], N'')) LIKE N'%expense%'
    OR LOWER(COALESCE([RequestCategory], N'')) LIKE N'%no po%'
    OR LOWER(COALESCE([PayloadJson], N'')) LIKE N'%"invoicecategory":"expense-no-po"%'
  )
`);
    return { updated: Number(result.rowsAffected?.[0] || 0) };
  } catch (error) {
    console.error('[payment-requests] migrateLegacyExpensePayments failed', error);
    return { updated: 0 };
  }
};

export const buildPaymentRequestsWorkspace = async (input?: {
  paymentType?: string;
  mineFor?: string;
  /** Non-elevated users: only own / assigned / beneficiary rows. */
  scopedToActorCode?: string;
  awaitingApproverCode?: string;
  includeMdCeoStage?: boolean;
  /** When true, never return the unscoped enterprise queue (missing actor code → empty). */
  restrictToActor?: boolean;
}): Promise<PaymentRequestsWorkspace> => {
  await migrateLegacyExpensePayments();
  const mineFor = compact(input?.mineFor);
  const scopedToActorCode = compact(input?.scopedToActorCode);
  const awaitingApproverCode = compact(input?.awaitingApproverCode);
  const rows = await listRows({
    paymentType: input?.paymentType,
    mineFor: mineFor || undefined,
    scopedToActorCode: scopedToActorCode || undefined,
    awaitingApproverCode: awaitingApproverCode || undefined,
    includeMdCeoStage: Boolean(input?.includeMdCeoStage),
    requireActorScope: Boolean(input?.restrictToActor),
  });

  // Repair stored chains so Project > ₦5m / Non-project > ₦1m (and CFO > ₦5m) cannot skip MD/CEO.
  for (const row of rows) {
    if (!['Pending Approval', 'Submitted', 'Finance Review'].includes(row.status)) continue;
    const stages = stagesFromPayload(row.payload);
    const hasMd = stages.some((stage) => /md\s*\/?\s*ceo|managing director/i.test(stage));
    if (hasMd) continue;
    let amountNgn = Number(row.payload?.amountNgn || 0);
    if (!(amountNgn > 0)) {
      const currency = compact(row.currencyCode).toUpperCase() || 'NGN';
      if (currency !== 'NGN') {
        try {
          const converted = await convertAmountToNgn(row.netAmount, currency);
          amountNgn = Number(converted.amountNgn || 0);
        } catch {
          amountNgn = Number(row.netAmount || 0);
        }
      } else {
        amountNgn = Number(row.netAmount || 0);
      }
    }
    const pathType = compact(row.payload?.pathType) || (compact(row.projectCode) ? 'Project' : 'Non-project');
    const atCfoOver5m = /cfo/i.test(row.currentStage) && amountNgn > 5000000;
    if (!bandRequiresMdCeo(pathType, amountNgn) && !atCfoOver5m) continue;
    try {
      await ensureApprovalStages(row);
    } catch (error) {
      console.error('[payment-requests] MD/CEO chain repair failed', row.requestNumber, error);
    }
  }

  // Backfill prevailing FX metadata for foreign-currency rows missing conversion fields
  // (or still on obsolete system seed rates).
  for (const row of rows) {
    const currency = compact(row.currencyCode).toUpperCase() || 'NGN';
    if (currency === 'NGN') continue;
    const fxSource = compact(row.payload?.fxSource);
    const hasLiveFx = Number(row.payload?.fxRate) > 0
      && Number(row.payload?.amountNgn) > 0
      && compact(row.payload?.fxRateDate)
      && fxSource
      && !/seed|fallback/i.test(fxSource);
    if (hasLiveFx) continue;
    try {
      await ensureApprovalStages(row);
    } catch (error) {
      console.error('[payment-requests] FX backfill failed', row.requestNumber, error);
    }
  }

  const workspace = emptyWorkspace();
  workspace.source = rows.length || (await ensureFinanceDb().catch(() => null))
    ? 'DLE Enterprise · finance.PaymentRequests'
    : 'Local finance workspace (DB offline)';
  workspace.rows = rows;
  workspace.generatedAt = nowIso();

  const now = new Date();
  const amountNgnOf = (row: PaymentRequestRow) => {
    const fromPayload = Number(row.payload?.amountNgn);
    if (Number.isFinite(fromPayload) && fromPayload > 0) return fromPayload;
    return Number(row.netAmount || 0);
  };
  const sum = (list: PaymentRequestRow[]) => list.reduce((total, row) => total + amountNgnOf(row), 0);
  const pending = rows.filter((row) => /pending|submitted|finance review/i.test(row.status));
  const returned = rows.filter((row) => /returned/i.test(row.status));
  const approved = rows.filter((row) => /^approved$/i.test(row.status));
  const ready = rows.filter((row) => /ready for treasury/i.test(row.status));
  const inProgress = rows.filter((row) => /payment scheduled|payment processing|awaiting retirement|retirement submitted|treasury verification|finance verification/i.test(row.status));
  const paidMonth = rows.filter((row) => {
    if (!/paid|completed|retired|closed/i.test(row.status)) return false;
    const paidAt = row.paidAt ? new Date(row.paidAt) : row.updatedAt ? new Date(row.updatedAt) : null;
    return Boolean(paidAt && paidAt.getMonth() === now.getMonth() && paidAt.getFullYear() === now.getFullYear());
  });
  const rejected = rows.filter((row) => /rejected|cancelled/i.test(row.status));
  const drafts = rows.filter((row) => /draft/i.test(row.status));
  const actorCode = compact(input?.mineFor || input?.scopedToActorCode).toLowerCase();
  const mine = actorCode
    ? rows.filter((row) => row.requesterCode.toLowerCase() === actorCode)
    : [];

  workspace.summary = {
    totalRequests: rows.length,
    totalValue: sum(rows),
    pendingApproval: pending.length,
    pendingValue: sum(pending),
    returned: returned.length,
    returnedValue: sum(returned),
    approved: approved.length,
    approvedValue: sum(approved),
    readyForTreasury: ready.length,
    readyValue: sum(ready),
    inProgress: inProgress.length,
    inProgressValue: sum(inProgress),
    paidThisMonth: paidMonth.length,
    paidValue: sum(paidMonth),
    rejected: rejected.length,
    rejectedValue: sum(rejected),
  };
  const awaitingRetirement = rows.filter((row) => /^awaiting retirement$/i.test(row.status));
  const retirementSubmitted = rows.filter((row) =>
    /retirement submitted|treasury verification|finance verification/i.test(row.status));
  workspace.tabCounts = {
    all: rows.length,
    mine: mine.length,
    drafts: drafts.length,
    pending: pending.length,
    returned: returned.length,
    approved: approved.length,
    ready: ready.length,
    paid: paidMonth.length,
    rejected: rejected.length,
    retirement: awaitingRetirement.length + retirementSubmitted.length,
    awaitingRetirement: awaitingRetirement.length,
  };
  return workspace;
};

export type EmployeePaymentDashboard = {
  generatedAt: string;
  employeeCode: string;
  summary: {
    myRequests: number;
    drafts: number;
    pendingApproval: number;
    returned: number;
    awaitingMyApproval: number;
    paidThisMonth: number;
    outstandingAdvances: number;
  };
  recentMine: PaymentRequestRow[];
  awaitingMyApproval: PaymentRequestRow[];
  outstandingAdvances: PaymentRequestRow[];
  eligibility: CashAdvanceEligibility | null;
};

export const buildEmployeePaymentDashboard = async (employeeCode: string): Promise<EmployeePaymentDashboard> => {
  const code = compact(employeeCode);
  const [mineWorkspace, scopedWorkspace, eligibility] = await Promise.all([
    buildPaymentRequestsWorkspace({ mineFor: code || undefined, restrictToActor: true }),
    buildPaymentRequestsWorkspace({ scopedToActorCode: code || undefined, restrictToActor: true }),
    code ? getCashAdvanceEligibility(code).catch(() => null) : Promise.resolve(null),
  ]);

  const mine = mineWorkspace.rows;
  const awaitingMyApproval = scopedWorkspace.rows.filter((row) =>
    code
    && String(row.currentApproverCode || '').trim().toLowerCase() === code.toLowerCase()
    && /pending|submitted|finance review/i.test(row.status));
  const outstandingAdvances = (eligibility?.outstanding || []).map((item) =>
    mine.find((row) => row.requestId === item.requestId)
    || scopedWorkspace.rows.find((row) => row.requestId === item.requestId)
    || null).filter(Boolean) as PaymentRequestRow[];

  const now = new Date();
  const paidThisMonth = mine.filter((row) => {
    if (!/paid|completed|retired|closed/i.test(row.status)) return false;
    const paidAt = row.paidAt ? new Date(row.paidAt) : row.updatedAt ? new Date(row.updatedAt) : null;
    return Boolean(paidAt && paidAt.getMonth() === now.getMonth() && paidAt.getFullYear() === now.getFullYear());
  });

  return {
    generatedAt: nowIso(),
    employeeCode: code,
    summary: {
      myRequests: mine.length,
      drafts: mine.filter((row) => /draft/i.test(row.status)).length,
      pendingApproval: mine.filter((row) => /pending|submitted|finance review/i.test(row.status)).length,
      returned: mine.filter((row) => /returned/i.test(row.status)).length,
      awaitingMyApproval: awaitingMyApproval.length,
      paidThisMonth: paidThisMonth.length,
      outstandingAdvances: eligibility?.outstandingCount || outstandingAdvances.length,
    },
    recentMine: mine.slice(0, 8),
    awaitingMyApproval: awaitingMyApproval.slice(0, 8),
    outstandingAdvances,
    eligibility,
  };
};

/** Durable finance data root (site/data/finance). Survives IIS republish. */
export { paymentAttachmentsRoot, describePaymentAttachmentStorage, ensurePaymentAttachmentsStorage };
/** @deprecated Prefer paymentAttachmentsRoot() — kept for older imports. */
export const PAYMENT_ATTACHMENTS_ROOT = paymentAttachmentsRoot();
export const PAYMENT_ATTACHMENT_MAX_BYTES = 8 * 1024 * 1024;
export const PAYMENT_ATTACHMENT_MAX_FILES = 8;
const PAYMENT_ATTACHMENT_ALLOWED_EXT = new Set([
  '.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.txt',
]);

const safeAttachmentName = (fileName: string) =>
  String(fileName || 'attachment.bin').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'attachment.bin';

export const normalizePaymentAttachmentUpload = (input: {
  fileName: string;
  mimeType?: string;
  contentBase64: string;
  uploadedBy?: string;
  kind?: 'supporting' | 'payment-evidence' | 'retirement-evidence';
}): { meta: PaymentRequestAttachment; bytes: Buffer } => {
  const originalName = compact(input.fileName) || 'attachment.bin';
  const ext = path.extname(originalName).toLowerCase();
  if (ext && !PAYMENT_ATTACHMENT_ALLOWED_EXT.has(ext)) {
    throw new Error(`Unsupported file type for ${originalName}. Use PDF, image, Word, Excel, CSV or TXT.`);
  }
  const bytes = Buffer.from(String(input.contentBase64 || ''), 'base64');
  if (!bytes.length) throw new Error(`Attachment ${originalName} is empty or invalid.`);
  if (bytes.length > PAYMENT_ATTACHMENT_MAX_BYTES) {
    throw new Error(`Attachment ${originalName} exceeds the 8 MB limit.`);
  }
  const id = `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const fileName = `${id}-${safeAttachmentName(originalName)}`;
  return {
    bytes,
    meta: {
      id,
      fileName,
      originalName,
      mimeType: compact(input.mimeType) || 'application/octet-stream',
      size: bytes.length,
      uploadedAt: nowIso(),
      uploadedBy: compact(input.uploadedBy) || 'System',
      kind: input.kind || 'supporting',
    },
  };
};

export const savePaymentAttachmentFile = async (requestId: string, fileName: string, bytes: Buffer) => {
  const saved = await savePaymentAttachmentFileToStore(requestId, fileName, bytes);
  return saved.fileName;
};

export const readPaymentAttachmentFile = async (requestId: string, fileName: string) => {
  const result = await readPaymentAttachmentFileFromStore(requestId, fileName);
  return { bytes: result.bytes, fileName: result.fileName };
};

export const appendPaymentRequestAttachments = async (
  requestId: string,
  attachments: PaymentRequestAttachment[],
) => {
  const pool = await ensureFinanceDb();
  if (!pool) throw new Error('Finance database is unavailable.');
  const existing = await getPaymentRequestById(requestId);
  if (!existing) throw new Error('Payment request not found.');
  const merged = [...(existing.attachments || []), ...attachments];
  await pool.request()
    .input('RequestId', sql.NVarChar(60), requestId)
    .input('AttachmentsJson', sql.NVarChar(sql.MAX), JSON.stringify(merged))
    .query(`
UPDATE [finance].[PaymentRequests]
SET [AttachmentsJson] = @AttachmentsJson,
    [UpdatedAt] = SYSUTCDATETIME()
WHERE [RequestId] = @RequestId
`);
  return merged;
};

export const createPaymentRequest = async (input: CreatePaymentRequestInput) => {
  if (!PAYMENT_TYPES.includes(input.paymentType)) {
    throw new Error('Only Cash Advance, Supplier Invoice, and Expense payments are enabled.');
  }
  const title = compact(input.title);
  const beneficiaryName = compact(input.beneficiaryName);
  const beneficiaryCode = compact(input.beneficiaryCode);
  const amount = moneyRound(Number(input.amount || 0));
  const paymentSiteCode = normalizeSiteCode(input.paymentSiteCode || input.companyCode);
  const paymentSiteName = compact(input.paymentSiteName);
  const expenseCode = compact(input.expenseCode);
  const department = compact(input.department);
  const location = compact(input.location);
  let waiverIdToConsume: string | null = null;

  if (!title) throw new Error('Request title is required.');
  if (!beneficiaryName) throw new Error('Employee / beneficiary is required.');
  if (!(amount > 0)) throw new Error('Amount must be greater than zero.');

  if (input.paymentType === 'Cash Advance Payment') {
    if (!beneficiaryCode) throw new Error('Employee code is required.');
    if (!paymentSiteCode) throw new Error('Payment site is required.');
    if (!expenseCode) throw new Error('Request title (expense code) is required.');
    if (!department) throw new Error('Department is required.');
    if (!location) throw new Error('Location is required.');
    if (!compact(input.businessJustification) || compact(input.businessJustification).length < 10) {
      throw new Error('Business justification must be at least 10 characters.');
    }
    const currency = compact(input.currencyCode || 'NGN').toUpperCase();
    if (!ALLOWED_PAYMENT_CURRENCIES.includes(currency as typeof ALLOWED_PAYMENT_CURRENCIES[number])) {
      throw new Error('Currency must be NGN, USD, EUR or GBP.');
    }
    input.currencyCode = currency;
    if (!(amount >= 1)) throw new Error('Amount must be at least 1.00.');

    const outstanding = await countOutstandingCashAdvances(beneficiaryCode);
    if (outstanding > 0) {
      const waiver = await findActiveCashAdvanceWaiver(beneficiaryCode);
      if (!waiver) {
        throw new Error(
          `${beneficiaryCode} has ${outstanding} outstanding cash advance${outstanding === 1 ? '' : 's'} awaiting retirement. Retire the previous advance, or ask Finance/CFO to cancel or waive it before raising a new one.`,
        );
      }
      waiverIdToConsume = waiver.waiverId;
      input.overrideOutstandingAdvance = true;
      input.overrideReason = `CFO waiver ${waiver.waiverId}: ${waiver.reason}`;
    }
  } else {
    const currency = compact(input.currencyCode || 'NGN').toUpperCase();
    if (!ALLOWED_PAYMENT_CURRENCIES.includes(currency as typeof ALLOWED_PAYMENT_CURRENCIES[number])) {
      throw new Error('Currency must be NGN, USD, EUR or GBP.');
    }
    input.currencyCode = currency;
  }

  if (input.paymentType === 'Supplier Invoice Payment') {
    if (!compact(input.invoiceNumber)) throw new Error('Invoice number is required for supplier payments.');
    if (!beneficiaryCode && !beneficiaryName) throw new Error('Select a supplier from the supplier master.');
    const uploadCount = (input.attachmentUploads?.length || 0) + (input.attachments?.length || 0);
    if (uploadCount < 1) {
      throw new Error('Supporting documents are required for supplier invoice payments.');
    }
    input.invoiceCategory = 'po-backed';
    input.requestCategory = compact(input.requestCategory) || 'PO-backed Invoice';
    input.expenseNature = '';
  }

  if (input.paymentType === 'Expense Payment') {
    if (!compact(input.invoiceNumber)) throw new Error('Bill / invoice number is required for expense payments.');
    if (!beneficiaryCode && !beneficiaryName) throw new Error('Payee / supplier name is required.');
    const uploadCount = (input.attachmentUploads?.length || 0) + (input.attachments?.length || 0);
    if (uploadCount < 1) {
      throw new Error('Supporting documents are required for expense payments.');
    }
    if (!compact(input.expenseNature)) {
      throw new Error('Expense nature is required (e.g. Utility, LAWMA).');
    }
    input.invoiceCategory = 'expense-no-po';
    input.requestCategory = 'Expense (No PO)';
    input.purchaseOrderNo = '';
    input.deliveryNoteNo = '';
    input.grnNo = '';
  }

  const pool = await ensureFinanceDb();
  if (!pool) throw new Error('Finance database is unavailable.');

  const requestId = `PREQ-${Date.now()}`;
  const preparedUploads = (input.attachmentUploads || []).map((item) =>
    normalizePaymentAttachmentUpload({ ...item, uploadedBy: input.actor }));
  if (preparedUploads.length > PAYMENT_ATTACHMENT_MAX_FILES) {
    throw new Error(`You can attach up to ${PAYMENT_ATTACHMENT_MAX_FILES} supporting documents.`);
  }
  for (const item of preparedUploads) {
    await savePaymentAttachmentFile(requestId, item.meta.fileName, item.bytes);
  }
  const attachments = [
    ...(input.attachments || []),
    ...preparedUploads.map((item) => item.meta),
  ];
  if (isVendorPaymentType(input.paymentType) && attachments.length < 1) {
    throw new Error('Supporting documents are required for supplier and expense payments.');
  }

  const requestNumber = await nextRequestNumber({
    paymentType: input.paymentType,
    paymentSiteCode,
  });
  const vatAmount = moneyRound(Number(input.vatAmount || 0));
  const whtAmount = moneyRound(Number(input.whtAmount || 0));
  const retentionAmount = moneyRound(Number(input.retentionAmount || 0));
  const grossAmount = amount;
  const netAmount = moneyRound(grossAmount + vatAmount - whtAmount - retentionAmount);
  const submit = Boolean(input.submit);
  const stageInfo = submit
    ? await resolveInitialStage(netAmount, input.paymentType, {
      currencyCode: compact(input.currencyCode) || 'NGN',
      department,
      projectCode: compact(input.projectCode),
      requesterCode: compact(input.requesterCode) || beneficiaryCode,
      supervisorName: compact(input.supervisorName),
    })
    : {
      stage: 'Draft',
      status: 'Draft' as const,
      matrixRuleName: null as string | null,
      approvalLevel: 0,
      stages: [] as string[],
      pathType: 'Non-project' as const,
      amountNgn: netAmount,
      fxRate: 1,
    };

  await pool.request()
    .input('RequestId', sql.NVarChar(60), requestId)
    .input('RequestNumber', sql.NVarChar(60), requestNumber)
    .input('PaymentType', sql.NVarChar(80), input.paymentType)
    .input('RequestCategory', sql.NVarChar(80), compact(input.requestCategory) || input.paymentType)
    .input('Title', sql.NVarChar(250), title)
    .input('Purpose', sql.NVarChar(sql.MAX), compact(input.purpose) || expenseCode || null)
    .input('BusinessJustification', sql.NVarChar(sql.MAX), compact(input.businessJustification) || null)
    .input('BeneficiaryType', sql.NVarChar(40), isVendorPaymentType(input.paymentType) ? 'Supplier' : 'Employee')
    .input('BeneficiaryCode', sql.NVarChar(80), beneficiaryCode || null)
    .input('BeneficiaryName', sql.NVarChar(250), beneficiaryName)
    .input('BeneficiaryBankSummary', sql.NVarChar(500), compact(input.beneficiaryBankSummary) || null)
    .input('Description', sql.NVarChar(sql.MAX), compact(input.description) || title)
    .input('GrossAmount', sql.Decimal(19, 4), grossAmount)
    .input('VatAmount', sql.Decimal(19, 4), vatAmount)
    .input('WhtAmount', sql.Decimal(19, 4), whtAmount)
    .input('RetentionAmount', sql.Decimal(19, 4), retentionAmount)
    .input('NetAmount', sql.Decimal(19, 4), netAmount)
    .input('CurrencyCode', sql.NVarChar(10), compact(input.currencyCode) || 'NGN')
    .input('CompanyCode', sql.NVarChar(40), paymentSiteCode || 'DLE')
    .input('PaymentSiteCode', sql.NVarChar(40), paymentSiteCode || null)
    .input('PaymentSiteName', sql.NVarChar(200), paymentSiteName || null)
    .input('ExpenseCode', sql.NVarChar(40), expenseCode || null)
    .input('Department', sql.NVarChar(150), department || null)
    .input('Location', sql.NVarChar(150), location || null)
    .input('CostCentre', sql.NVarChar(80), compact(input.costCentre) || null)
    .input('ProjectCode', sql.NVarChar(80), compact(input.projectCode) || null)
    .input('Priority', sql.NVarChar(40), compact(input.priority) || 'Normal')
    .input('RequiredDate', sql.Date, input.requiredDate ? new Date(input.requiredDate) : null)
    .input('RequesterCode', sql.NVarChar(60), compact(input.requesterCode) || beneficiaryCode || null)
    .input('RequesterName', sql.NVarChar(200), compact(input.requesterName) || input.actor)
    .input('RequesterJobTitle', sql.NVarChar(150), compact(input.requesterJobTitle) || null)
    .input('SupervisorName', sql.NVarChar(200), compact(input.supervisorName) || null)
    .input('SubmittedAt', sql.DateTime2, submit ? new Date() : null)
    .input('CurrentStage', sql.NVarChar(80), stageInfo.stage)
    .input('Status', sql.NVarChar(40), stageInfo.status)
    .input('OverrideOutstandingAdvance', sql.Bit, Boolean(input.overrideOutstandingAdvance))
    .input('OverrideReason', sql.NVarChar(sql.MAX), compact(input.overrideReason) || null)
    .input('InvoiceNumber', sql.NVarChar(120), compact(input.invoiceNumber) || null)
    .input('InvoiceDate', sql.Date, input.invoiceDate ? new Date(input.invoiceDate) : null)
    .input('DueDate', sql.Date, input.dueDate ? new Date(input.dueDate) : null)
    .input('PurchaseOrderNo', sql.NVarChar(120), compact(input.purchaseOrderNo) || null)
    .input('DeliveryNoteNo', sql.NVarChar(120), compact(input.deliveryNoteNo) || null)
    .input('GrnNo', sql.NVarChar(120), compact(input.grnNo) || null)
    .input('ContractNo', sql.NVarChar(120), compact(input.contractNo) || null)
    .input('PayloadJson', sql.NVarChar(sql.MAX), JSON.stringify({
      matrixRuleName: stageInfo.matrixRuleName,
      approvalLevel: stageInfo.approvalLevel,
      stages: 'stages' in stageInfo ? stageInfo.stages : [],
      pathType: 'pathType' in stageInfo ? stageInfo.pathType : null,
      amountNgn: 'amountNgn' in stageInfo ? stageInfo.amountNgn : netAmount,
      fxRate: 'fxRate' in stageInfo ? stageInfo.fxRate : 1,
      fxRateDate: 'fxRateDate' in stageInfo ? stageInfo.fxRateDate : null,
      fxSource: 'fxSource' in stageInfo ? stageInfo.fxSource : null,
      expenseCode,
      paymentSiteCode,
      paymentSiteName,
      location,
      invoiceCategory: invoiceCategoryForPaymentType(input.paymentType),
      expenseNature: input.paymentType === 'Expense Payment'
        ? (compact(input.expenseNature) || null)
        : null,
    }))
    .input('AttachmentsJson', sql.NVarChar(sql.MAX), JSON.stringify(attachments))
    .query(`
INSERT INTO [finance].[PaymentRequests] (
  [RequestId], [RequestNumber], [PaymentType], [RequestCategory], [Title], [Purpose], [BusinessJustification],
  [BeneficiaryType], [BeneficiaryCode], [BeneficiaryName], [BeneficiaryBankSummary], [Description],
  [GrossAmount], [VatAmount], [WhtAmount], [RetentionAmount], [NetAmount], [CurrencyCode],
  [CompanyCode], [PaymentSiteCode], [PaymentSiteName], [ExpenseCode], [Department], [Location], [CostCentre], [ProjectCode], [Priority], [RequiredDate],
  [RequesterCode], [RequesterName], [RequesterJobTitle], [SupervisorName], [SubmittedAt],
  [CurrentStage], [Status], [OverrideOutstandingAdvance], [OverrideReason],
  [InvoiceNumber], [InvoiceDate], [DueDate], [PurchaseOrderNo], [DeliveryNoteNo], [GrnNo], [ContractNo], [PayloadJson], [AttachmentsJson]
) VALUES (
  @RequestId, @RequestNumber, @PaymentType, @RequestCategory, @Title, @Purpose, @BusinessJustification,
  @BeneficiaryType, @BeneficiaryCode, @BeneficiaryName, @BeneficiaryBankSummary, @Description,
  @GrossAmount, @VatAmount, @WhtAmount, @RetentionAmount, @NetAmount, @CurrencyCode,
  @CompanyCode, @PaymentSiteCode, @PaymentSiteName, @ExpenseCode, @Department, @Location, @CostCentre, @ProjectCode, @Priority, @RequiredDate,
  @RequesterCode, @RequesterName, @RequesterJobTitle, @SupervisorName, @SubmittedAt,
  @CurrentStage, @Status, @OverrideOutstandingAdvance, @OverrideReason,
  @InvoiceNumber, @InvoiceDate, @DueDate, @PurchaseOrderNo, @DeliveryNoteNo, @GrnNo, @ContractNo, @PayloadJson, @AttachmentsJson
)
`);

  const waiverId = waiverIdToConsume;
  if (waiverId) {
    await consumeCashAdvanceWaiver(waiverId, requestId);
  }
  await logAction({
    requestId,
    actionType: submit ? 'Submitted' : 'Created',
    stage: stageInfo.stage,
    actorName: input.actor,
    actorCode: input.requesterCode,
    comment: submit ? 'Payment request submitted for approval.' : 'Payment request saved as draft.',
    reason: input.overrideReason,
  });

  if (submit && stageInfo.stage && stageInfo.stage !== 'Draft') {
    await assignCurrentApprover({
      requestId,
      stage: stageInfo.stage,
      requesterCode: compact(input.requesterCode) || beneficiaryCode,
      projectCode: compact(input.projectCode),
      supervisorName: compact(input.supervisorName),
      paymentType: input.paymentType,
    });
  }

  const workspace = await buildPaymentRequestsWorkspace();
  const request = workspace.rows.find((row) => row.requestId === requestId) || null;

  if (submit && request) {
    await notifyPaymentApprovalRequired({
      request,
      stage: request.currentStage || stageInfo.stage,
      actorName: input.actor,
      baseUrl: resolveWorkflowLinkOrigin(),
    }).catch((error) => console.error('[payment-requests] submit notification failed', error));
  }

  return { request, workspace };
};

export type UpdateReturnedPaymentRequestInput = CreatePaymentRequestInput & {
  requestId: string;
  actorCode?: string;
  /** When true (default), send back into approval. When false, keep Returned after saving edits. */
  resubmit?: boolean;
  /**
   * Supporting attachment IDs to retain. When provided, other supporting docs are removed.
   * Payment/retirement evidence is always retained.
   */
  keepAttachmentIds?: string[];
};

/** Edit a draft or returned payment request and optionally submit / resubmit into the approval chain. */
export const updateReturnedPaymentRequest = async (input: UpdateReturnedPaymentRequestInput) => {
  const requestId = compact(input.requestId);
  if (!requestId) throw new Error('requestId is required.');

  const existing = await getPaymentRequestById(requestId);
  if (!existing) throw new Error('Payment request not found.');
  const wasDraft = /^draft$/i.test(existing.status);
  const wasReturned = /^returned$/i.test(existing.status);
  if (!wasDraft && !wasReturned) {
    throw new Error('Only draft or returned payment requests can be edited.');
  }

  const actorCode = compact(input.actorCode || input.requesterCode);
  const isOwner = actorCode
    && (
      actorCode.toLowerCase() === compact(existing.requesterCode).toLowerCase()
      || (
        existing.paymentType === 'Cash Advance Payment'
        && actorCode.toLowerCase() === compact(existing.beneficiaryCode).toLowerCase()
      )
    );
  if (!isOwner) {
    throw new Error('Only the requester can edit this payment request.');
  }

  if (existing.paymentType !== input.paymentType) {
    throw new Error('Payment type cannot be changed when editing this request.');
  }

  const title = compact(input.title) || existing.title;
  const beneficiaryName = compact(input.beneficiaryName) || existing.beneficiaryName;
  const beneficiaryCode = compact(input.beneficiaryCode) || existing.beneficiaryCode;
  const amount = moneyRound(Number(input.amount || 0));
  const paymentSiteCode = normalizeSiteCode(input.paymentSiteCode || input.companyCode) || existing.paymentSiteCode;
  const paymentSiteName = compact(input.paymentSiteName) || existing.paymentSiteName;
  const expenseCode = compact(input.expenseCode) || existing.expenseCode;
  const department = compact(input.department) || existing.department;
  const location = compact(input.location) || existing.location;
  const resubmit = input.resubmit !== false;

  if (!title) throw new Error('Request title is required.');
  if (!beneficiaryName) throw new Error('Employee / beneficiary is required.');
  if (!(amount > 0)) throw new Error('Amount must be greater than zero.');

  if (existing.paymentType === 'Cash Advance Payment') {
    if (!beneficiaryCode) throw new Error('Employee code is required.');
    if (!paymentSiteCode) throw new Error('Payment site is required.');
    if (!expenseCode) throw new Error('Request title (expense code) is required.');
    if (!department) throw new Error('Department is required.');
    if (!location) throw new Error('Location is required.');
    if (!compact(input.businessJustification) || compact(input.businessJustification).length < 10) {
      throw new Error('Business justification must be at least 10 characters.');
    }
  }

  const currency = compact(input.currencyCode || existing.currencyCode || 'NGN').toUpperCase();
  if (!ALLOWED_PAYMENT_CURRENCIES.includes(currency as typeof ALLOWED_PAYMENT_CURRENCIES[number])) {
    throw new Error('Currency must be NGN, USD, EUR or GBP.');
  }

  let requestCategory = compact(input.requestCategory) || existing.requestCategory;
  let invoiceCategory = compact(input.invoiceCategory) || compact(existing.payload?.invoiceCategory) || '';
  let expenseNature = compact(input.expenseNature) || compact(existing.payload?.expenseNature);
  let purchaseOrderNo = compact(input.purchaseOrderNo);
  let deliveryNoteNo = compact(input.deliveryNoteNo);
  let grnNo = compact(input.grnNo);

  if (existing.paymentType === 'Supplier Invoice Payment') {
    if (!compact(input.invoiceNumber) && !existing.invoiceNumber) {
      throw new Error('Invoice number is required for supplier payments.');
    }
    invoiceCategory = 'po-backed';
    requestCategory = compact(input.requestCategory) || 'PO-backed Invoice';
    expenseNature = '';
  }

  if (existing.paymentType === 'Expense Payment' || isExpenseNoPoPayment(existing)) {
    if (!compact(input.invoiceNumber) && !existing.invoiceNumber) {
      throw new Error('Bill / invoice number is required for expense payments.');
    }
    invoiceCategory = 'expense-no-po';
    purchaseOrderNo = '';
    deliveryNoteNo = '';
    grnNo = '';
    requestCategory = 'Expense (No PO)';
    if (!expenseNature) {
      throw new Error('Expense nature is required (e.g. Utility, LAWMA).');
    }
  }

  const preparedUploads = (input.attachmentUploads || []).map((item) =>
    normalizePaymentAttachmentUpload({ ...item, uploadedBy: input.actor }));
  for (const item of preparedUploads) {
    await savePaymentAttachmentFile(requestId, item.meta.fileName, item.bytes);
  }
  const existingList = Array.isArray(existing.attachments) ? existing.attachments : [];
  const protectedKinds = new Set(['payment-evidence', 'retirement-evidence']);
  const keepIds = Array.isArray(input.keepAttachmentIds)
    ? new Set(input.keepAttachmentIds.map((id) => compact(id)).filter(Boolean))
    : null;
  const keepExisting = keepIds
    ? existingList.filter((att) => {
      const kind = compact(att.kind) || 'supporting';
      if (protectedKinds.has(kind)) return true;
      return keepIds.has(compact(att.id)) || keepIds.has(compact(att.fileName));
    })
    : existingList;
  const attachments = [...keepExisting, ...preparedUploads.map((item) => item.meta)];
  if (isVendorPaymentType(existing.paymentType) && attachments.filter((att) => !protectedKinds.has(compact(att.kind) || 'supporting')).length < 1) {
    throw new Error('Supporting documents are required for supplier and expense payments.');
  }

  const vatAmount = moneyRound(Number(input.vatAmount ?? existing.vatAmount ?? 0));
  const whtAmount = moneyRound(Number(input.whtAmount ?? existing.whtAmount ?? 0));
  const retentionAmount = moneyRound(Number(input.retentionAmount ?? existing.retentionAmount ?? 0));
  const grossAmount = amount;
  const netAmount = moneyRound(grossAmount + vatAmount - whtAmount - retentionAmount);

  const stageInfo = resubmit
    ? await resolveInitialStage(netAmount, existing.paymentType, {
      currencyCode: currency,
      department,
      projectCode: compact(input.projectCode) || existing.projectCode,
      requesterCode: compact(input.requesterCode) || existing.requesterCode || beneficiaryCode,
      supervisorName: compact(input.supervisorName) || existing.supervisorName,
    })
    : wasDraft
      ? {
        stage: 'Draft',
        status: 'Draft' as const,
        matrixRuleName: compact(existing.payload?.matrixRuleName) || null,
        approvalLevel: Number(existing.payload?.approvalLevel || 0),
        stages: Array.isArray(existing.payload?.stages)
          ? (existing.payload.stages as unknown[]).map((item) => compact(item)).filter(Boolean)
          : [],
        pathType: (compact(existing.payload?.pathType) || 'Non-project') as 'Project' | 'Non-project',
        amountNgn: Number(existing.payload?.amountNgn || netAmount),
        fxRate: Number(existing.payload?.fxRate || 1),
        fxRateDate: compact(existing.payload?.fxRateDate) || null,
        fxSource: compact(existing.payload?.fxSource) || null,
      }
      : {
        stage: 'Returned for Correction',
        status: 'Returned' as const,
        matrixRuleName: compact(existing.payload?.matrixRuleName) || null,
        approvalLevel: Number(existing.payload?.approvalLevel || 0),
        stages: Array.isArray(existing.payload?.stages)
          ? (existing.payload.stages as unknown[]).map((item) => compact(item)).filter(Boolean)
          : [],
        pathType: (compact(existing.payload?.pathType) || 'Non-project') as 'Project' | 'Non-project',
        amountNgn: Number(existing.payload?.amountNgn || netAmount),
        fxRate: Number(existing.payload?.fxRate || 1),
        fxRateDate: compact(existing.payload?.fxRateDate) || null,
        fxSource: compact(existing.payload?.fxSource) || null,
      };

  const pool = await ensureFinanceDb();
  if (!pool) throw new Error('Finance database is unavailable.');

  const payload = {
    ...(existing.payload || {}),
    matrixRuleName: stageInfo.matrixRuleName,
    approvalLevel: stageInfo.approvalLevel,
    stages: 'stages' in stageInfo ? stageInfo.stages : [],
    pathType: 'pathType' in stageInfo ? stageInfo.pathType : null,
    amountNgn: 'amountNgn' in stageInfo ? stageInfo.amountNgn : netAmount,
    fxRate: 'fxRate' in stageInfo ? stageInfo.fxRate : 1,
    fxRateDate: 'fxRateDate' in stageInfo ? stageInfo.fxRateDate : null,
    fxSource: 'fxSource' in stageInfo ? stageInfo.fxSource : null,
    expenseCode,
    paymentSiteCode,
    paymentSiteName,
    location,
    invoiceCategory: isVendorPaymentType(existing.paymentType)
      ? (invoiceCategory || invoiceCategoryForPaymentType(existing.paymentType))
      : null,
    expenseNature: (existing.paymentType === 'Expense Payment' || isExpenseNoPoPayment(existing))
      ? (expenseNature || null)
      : null,
  };

  await pool.request()
    .input('RequestId', sql.NVarChar(60), requestId)
    .input('RequestCategory', sql.NVarChar(80), requestCategory || existing.paymentType)
    .input('Title', sql.NVarChar(250), title)
    .input('Purpose', sql.NVarChar(sql.MAX), compact(input.purpose) || expenseCode || existing.purpose || null)
    .input('BusinessJustification', sql.NVarChar(sql.MAX), compact(input.businessJustification) || existing.businessJustification || null)
    .input('BeneficiaryCode', sql.NVarChar(80), beneficiaryCode || null)
    .input('BeneficiaryName', sql.NVarChar(250), beneficiaryName)
    .input('BeneficiaryBankSummary', sql.NVarChar(500), compact(input.beneficiaryBankSummary) || existing.beneficiaryBankSummary || null)
    .input('Description', sql.NVarChar(sql.MAX), compact(input.description) || title)
    .input('GrossAmount', sql.Decimal(19, 4), grossAmount)
    .input('VatAmount', sql.Decimal(19, 4), vatAmount)
    .input('WhtAmount', sql.Decimal(19, 4), whtAmount)
    .input('RetentionAmount', sql.Decimal(19, 4), retentionAmount)
    .input('NetAmount', sql.Decimal(19, 4), netAmount)
    .input('CurrencyCode', sql.NVarChar(10), currency)
    .input('CompanyCode', sql.NVarChar(40), paymentSiteCode || existing.companyCode || 'DLE')
    .input('PaymentSiteCode', sql.NVarChar(40), paymentSiteCode || null)
    .input('PaymentSiteName', sql.NVarChar(200), paymentSiteName || null)
    .input('ExpenseCode', sql.NVarChar(40), expenseCode || null)
    .input('Department', sql.NVarChar(150), department || null)
    .input('Location', sql.NVarChar(150), location || null)
    .input('CostCentre', sql.NVarChar(80), compact(input.costCentre) || existing.costCentre || null)
    .input('ProjectCode', sql.NVarChar(80), compact(input.projectCode) || existing.projectCode || null)
    .input('Priority', sql.NVarChar(40), compact(input.priority) || existing.priority || 'Normal')
    .input('RequiredDate', sql.Date, input.requiredDate ? new Date(input.requiredDate) : (existing.requiredDate ? new Date(existing.requiredDate) : null))
    .input('SubmittedAt', sql.DateTime2, resubmit ? new Date() : (existing.submittedAt ? new Date(existing.submittedAt) : null))
    .input('CurrentStage', sql.NVarChar(80), stageInfo.stage)
    .input('Status', sql.NVarChar(40), stageInfo.status)
    .input('InvoiceNumber', sql.NVarChar(120), compact(input.invoiceNumber) || existing.invoiceNumber || null)
    .input('InvoiceDate', sql.Date, input.invoiceDate ? new Date(input.invoiceDate) : (existing.invoiceDate ? new Date(existing.invoiceDate) : null))
    .input('DueDate', sql.Date, input.dueDate ? new Date(input.dueDate) : (existing.dueDate ? new Date(existing.dueDate) : null))
    .input('PurchaseOrderNo', sql.NVarChar(120), isVendorPaymentType(existing.paymentType) ? (purchaseOrderNo || null) : (existing.purchaseOrderNo || null))
    .input('DeliveryNoteNo', sql.NVarChar(120), isVendorPaymentType(existing.paymentType) ? (deliveryNoteNo || null) : (existing.deliveryNoteNo || null))
    .input('GrnNo', sql.NVarChar(120), isVendorPaymentType(existing.paymentType) ? (grnNo || null) : (existing.grnNo || null))
    .input('ContractNo', sql.NVarChar(120), compact(input.contractNo) || existing.contractNo || null)
    .input('PayloadJson', sql.NVarChar(sql.MAX), JSON.stringify(payload))
    .input('AttachmentsJson', sql.NVarChar(sql.MAX), JSON.stringify(attachments))
    .query(`
UPDATE [finance].[PaymentRequests]
SET [RequestCategory] = @RequestCategory,
    [Title] = @Title,
    [Purpose] = @Purpose,
    [BusinessJustification] = @BusinessJustification,
    [BeneficiaryCode] = @BeneficiaryCode,
    [BeneficiaryName] = @BeneficiaryName,
    [BeneficiaryBankSummary] = @BeneficiaryBankSummary,
    [Description] = @Description,
    [GrossAmount] = @GrossAmount,
    [VatAmount] = @VatAmount,
    [WhtAmount] = @WhtAmount,
    [RetentionAmount] = @RetentionAmount,
    [NetAmount] = @NetAmount,
    [CurrencyCode] = @CurrencyCode,
    [CompanyCode] = @CompanyCode,
    [PaymentSiteCode] = @PaymentSiteCode,
    [PaymentSiteName] = @PaymentSiteName,
    [ExpenseCode] = @ExpenseCode,
    [Department] = @Department,
    [Location] = @Location,
    [CostCentre] = @CostCentre,
    [ProjectCode] = @ProjectCode,
    [Priority] = @Priority,
    [RequiredDate] = @RequiredDate,
    [SubmittedAt] = COALESCE(@SubmittedAt, [SubmittedAt]),
    [CurrentStage] = @CurrentStage,
    [Status] = @Status,
    [InvoiceNumber] = @InvoiceNumber,
    [InvoiceDate] = @InvoiceDate,
    [DueDate] = @DueDate,
    [PurchaseOrderNo] = @PurchaseOrderNo,
    [DeliveryNoteNo] = @DeliveryNoteNo,
    [GrnNo] = @GrnNo,
    [ContractNo] = @ContractNo,
    [PayloadJson] = @PayloadJson,
    [AttachmentsJson] = @AttachmentsJson,
    [UpdatedAt] = SYSUTCDATETIME()
WHERE [RequestId] = @RequestId
`);

  await logAction({
    requestId,
    actionType: resubmit ? (wasDraft ? 'Submitted' : 'Resubmitted') : 'Updated',
    stage: stageInfo.stage,
    actorName: input.actor,
    actorCode,
    comment: resubmit
      ? (wasDraft
        ? 'Draft payment request submitted for approval.'
        : 'Payment request corrected and resent for approval.')
      : (wasDraft
        ? 'Draft payment request updated.'
        : 'Returned payment request updated.'),
  });

  if (resubmit && stageInfo.stage && stageInfo.stage !== 'Draft' && stageInfo.stage !== 'Returned for Correction') {
    await assignCurrentApprover({
      requestId,
      stage: stageInfo.stage,
      requesterCode: compact(input.requesterCode) || existing.requesterCode || beneficiaryCode,
      projectCode: compact(input.projectCode) || existing.projectCode,
      supervisorName: compact(input.supervisorName) || existing.supervisorName,
      paymentType: existing.paymentType,
    });
  } else if (!resubmit) {
    await pool.request()
      .input('RequestId', sql.NVarChar(60), requestId)
      .query(`
UPDATE [finance].[PaymentRequests]
SET [CurrentApproverCode] = NULL,
    [CurrentApproverName] = NULL,
    [UpdatedAt] = SYSUTCDATETIME()
WHERE [RequestId] = @RequestId
`);
  }

  const workspace = await buildPaymentRequestsWorkspace();
  const request = workspace.rows.find((row) => row.requestId === requestId)
    || (await getPaymentRequestById(requestId));

  if (resubmit && request) {
    await notifyPaymentApprovalRequired({
      request,
      stage: request.currentStage || stageInfo.stage,
      actorName: input.actor,
      baseUrl: resolveWorkflowLinkOrigin(),
    }).catch((error) => console.error('[payment-requests] resubmit notification failed', error));
  }

  return {
    request,
    workspace,
    message: resubmit
      ? (wasDraft ? 'Payment request submitted for approval.' : 'Payment request updated and resent for approval.')
      : (wasDraft ? 'Draft payment request saved.' : 'Returned payment request saved.'),
  };
};

export type TreasuryWorkspace = {
  generatedAt: string;
  source: string;
  summary: {
    readyToPay: number;
    readyValue: number;
    paidToday: number;
    paidTodayValue: number;
    awaitingRetirement: number;
    retirementToVerify: number;
    history: number;
  };
  readyToPay: PaymentRequestRow[];
  paidToday: PaymentRequestRow[];
  awaitingRetirement: PaymentRequestRow[];
  retirementToVerify: PaymentRequestRow[];
  history: PaymentRequestRow[];
};

export type FinancePostingWorkspace = {
  generatedAt: string;
  source: string;
  summary: {
    readyToPost: number;
    readyValue: number;
    posted: number;
    notReady: number;
    failed: number;
    withDocuments: number;
  };
  rows: PaymentRequestRow[];
  readyToPost: PaymentRequestRow[];
  posted: PaymentRequestRow[];
  notReady: PaymentRequestRow[];
};

const isSameDay = (iso: string | null | undefined, now = new Date()) => {
  if (!iso) return false;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
};

export const buildTreasuryWorkspace = async (): Promise<TreasuryWorkspace> => {
  const rows = await listRows();
  const sum = (list: PaymentRequestRow[]) => list.reduce((total, row) => total + Number(row.netAmount || 0), 0);
  const readyToPay = rows.filter((row) => /^(ready for treasury|approved)$/i.test(row.status));
  const paidToday = rows.filter((row) => Boolean(row.paidAt) && isSameDay(row.paidAt));
  const awaitingRetirement = rows.filter((row) => /^awaiting retirement$/i.test(row.status));
  const retirementToVerify = rows.filter((row) =>
    /retirement submitted|treasury verification|finance verification/i.test(row.status));
  const history = rows.filter((row) =>
    /^(paid|completed|retired|closed)$/i.test(row.status)
    || (Boolean(row.paidAt) && !isSameDay(row.paidAt)));

  return {
    generatedAt: nowIso(),
    source: 'DLE Enterprise · finance.PaymentRequests · Treasury',
    summary: {
      readyToPay: readyToPay.length,
      readyValue: sum(readyToPay),
      paidToday: paidToday.length,
      paidTodayValue: sum(paidToday),
      awaitingRetirement: awaitingRetirement.length,
      retirementToVerify: retirementToVerify.length,
      history: history.length,
    },
    readyToPay,
    paidToday,
    awaitingRetirement,
    retirementToVerify,
    history: history.slice(0, 200),
  };
};

export const buildFinancePostingWorkspace = async (): Promise<FinancePostingWorkspace> => {
  // Worklist only: payments due for books acknowledgement. Marked Posted items leave this desk.
  const candidates = (await listRows()).filter((row) => {
    if (row.postingStatus === 'Posted') return false;
    if (row.postedAt) return false;
    return /^(approved|ready for treasury|paid|awaiting retirement|retirement submitted|treasury verification|retired|completed|closed)$/i.test(row.status)
      || row.postingStatus === 'ReadyToPost'
      || row.postingStatus === 'PostingFailed';
  });

  const derivePosting = (row: PaymentRequestRow): PaymentPostingStatus => {
    if (row.postingStatus === 'Posted') return 'Posted';
    if (row.postingStatus === 'ReadyToPost' || row.postingStatus === 'PostingFailed') return row.postingStatus;
    if (/^(paid|completed|retired|closed)$/i.test(row.status)) return 'ReadyToPost';
    return row.postingStatus || 'NotReady';
  };

  const enriched = candidates
    .map((row) => ({ ...row, postingStatus: derivePosting(row) }))
    .filter((row) => row.postingStatus !== 'Posted');

  const sum = (list: PaymentRequestRow[]) => list.reduce((total, row) => total + Number(row.netAmount || 0), 0);
  const readyToPost = enriched.filter((row) => row.postingStatus === 'ReadyToPost');
  const notReady = enriched.filter((row) => row.postingStatus === 'NotReady' || row.postingStatus === 'PostingFailed');
  const failed = enriched.filter((row) => row.postingStatus === 'PostingFailed');

  return {
    generatedAt: nowIso(),
    source: 'DLE Enterprise · finance.PaymentRequests · Finance Posting',
    summary: {
      readyToPost: readyToPost.length,
      readyValue: sum(readyToPost),
      posted: 0,
      notReady: notReady.length,
      failed: failed.length,
      withDocuments: enriched.filter((row) => (row.attachments?.length || 0) > 0).length,
    },
    rows: enriched,
    readyToPost,
    posted: [],
    notReady,
  };
};

export const transitionPaymentRequest = async (input: {
  requestId: string;
  action: 'approve' | 'reject' | 'return' | 'clarify' | 'delegate' | 'escalate' | 'mark-ready-treasury' | 'mark-paid' | 'submit-retirement' | 'acknowledge-retirement' | 'return-retirement' | 'mark-posted' | 'ready-to-post';
  actor: string;
  actorCode?: string;
  comment?: string;
  reason?: string;
  paymentReference?: string;
  sageReference?: string;
  baseUrl?: string | null;
  delegateToCode?: string;
  delegateToName?: string;
  delegateEndsAt?: string | null;
  /** Treasury disbursement proof (PDF/image) required for mark-paid. */
  paymentEvidenceUpload?: {
    fileName: string;
    mimeType?: string;
    contentBase64: string;
  } | null;
  /** Cash advance retirement receipts (one or more). */
  retirementEvidenceUploads?: Array<{
    fileName: string;
    mimeType?: string;
    contentBase64: string;
  }> | null;
}) => {
  const pool = await ensureFinanceDb();
  if (!pool) throw new Error('Finance database is unavailable.');

  const existingRaw = (await listRows()).find((row) => row.requestId === input.requestId)
    || await getPaymentRequestById(input.requestId);
  if (!existingRaw) throw new Error('Payment request not found.');
  const existing = await repairPrematureTreasuryHandoff(existingRaw);

  const requiresReason = ['reject', 'return', 'delegate', 'escalate', 'clarify', 'return-retirement'].includes(input.action);
  if (requiresReason && !compact(input.reason || input.comment)) {
    throw new Error('A reason is required for this action.');
  }

  let nextStatus = existing.status;
  let nextStage = existing.currentStage;
  let paidAt: Date | null = null;
  let paymentReference = existing.paymentReference || null;
  let sageReference = existing.sageReference || null;
  let postingStatus: PaymentPostingStatus | null = null;
  let postedAt: Date | null = null;
  let postedBy: string | null = null;
  let treasuryJson: Record<string, unknown> | null = existing.treasury;
  let retirementJson: Record<string, unknown> | null = existing.retirement;
  let postingJson: Record<string, unknown> | null = existing.posting;
  let attachmentsJson: PaymentRequestAttachment[] | null = null;
  let notifyEvent: 'approved' | 'rejected' | 'returned' | 'stage-advanced' | 'paid' | 'posted' | 'retirement-submitted' | 'retirement-acknowledged' | null = null;
  let completedStage = existing.currentStage;
  let advancedTo: string | undefined;
  let assignedApprover: Awaited<ReturnType<typeof assignCurrentApprover>> | null = null;

  switch (input.action) {
    case 'approve': {
      let stages = await ensureApprovalStages(existing);
      let currentIdx = stages.findIndex((stage) => stage.toLowerCase() === compact(existing.currentStage).toLowerCase());
      // Stage label drift (e.g. "Line Manager" vs "Reporting Manager") — treat as first pending stage.
      if (currentIdx < 0 && stages.length) {
        currentIdx = 0;
      }
      const hasNext = currentIdx >= 0 && currentIdx < stages.length - 1;
      if (hasNext) {
        nextStage = stages[currentIdx + 1];
        nextStatus = 'Pending Approval';
        notifyEvent = 'stage-advanced';
        advancedTo = nextStage;
      } else if (/pending|submitted|finance review|approved/i.test(existing.status) || stages.length > 0) {
        // Final approval hands off directly to Treasury queue.
        nextStatus = 'Ready for Treasury';
        nextStage = 'Treasury';
        notifyEvent = 'approved';
      }
      break;
    }
    case 'reject':
      nextStatus = 'Rejected';
      nextStage = 'Rejected';
      notifyEvent = 'rejected';
      break;
    case 'return':
      nextStatus = 'Returned';
      nextStage = 'Returned for Correction';
      notifyEvent = 'returned';
      break;
    case 'mark-ready-treasury':
      nextStatus = 'Ready for Treasury';
      nextStage = 'Treasury';
      break;
    case 'mark-paid': {
      if (!/^(ready for treasury|approved|payment scheduled|payment processing)$/i.test(existing.status)) {
        throw new Error('Only Approved / Ready for Treasury payments can be marked paid.');
      }
      const evidenceUpload = input.paymentEvidenceUpload;
      if (!evidenceUpload?.contentBase64) {
        throw new Error('Upload payment evidence (bank receipt / transfer proof) to mark as paid.');
      }
      const prepared = normalizePaymentAttachmentUpload({
        ...evidenceUpload,
        uploadedBy: input.actor,
        kind: 'payment-evidence',
      });
      await savePaymentAttachmentFile(input.requestId, prepared.meta.fileName, prepared.bytes);
      attachmentsJson = [...(existing.attachments || []), prepared.meta];
      const reference = compact(input.paymentReference)
        || `Evidence: ${prepared.meta.originalName}`.slice(0, 120);
      const isAdvance = existing.paymentType === 'Cash Advance Payment';
      nextStatus = isAdvance ? 'Awaiting Retirement' : 'Paid';
      nextStage = isAdvance ? 'Awaiting Retirement' : 'Paid';
      paidAt = new Date();
      paymentReference = reference;
      postingStatus = isAdvance ? 'NotReady' : 'ReadyToPost';
      treasuryJson = {
        ...(existing.treasury || {}),
        paidBy: input.actor,
        paidByCode: input.actorCode || null,
        paidAt: paidAt.toISOString(),
        paymentReference: reference,
        paymentEvidenceFileName: prepared.meta.fileName,
        paymentEvidenceOriginalName: prepared.meta.originalName,
        paymentEvidenceId: prepared.meta.id,
        channel: compact(input.comment) || 'Treasury disbursement',
      };
      notifyEvent = 'paid';
      break;
    }
    case 'submit-retirement': {
      if (existing.paymentType !== 'Cash Advance Payment') {
        throw new Error('Only cash advances require retirement.');
      }
      if (!/^awaiting retirement$/i.test(existing.status)) {
        throw new Error('This cash advance is not awaiting retirement.');
      }
      const note = compact(input.comment || input.reason);
      if (note.length < 10) {
        throw new Error('Provide a retirement note (at least 10 characters) describing how the advance was used.');
      }
      const uploads = input.retirementEvidenceUploads || [];
      if (!uploads.length) {
        throw new Error('Upload at least one retirement receipt / supporting document.');
      }
      if ((existing.attachments?.length || 0) + uploads.length > PAYMENT_ATTACHMENT_MAX_FILES) {
        throw new Error(`You can attach up to ${PAYMENT_ATTACHMENT_MAX_FILES} documents in total.`);
      }
      const prepared = uploads.map((item) => normalizePaymentAttachmentUpload({
        ...item,
        uploadedBy: input.actor,
        kind: 'retirement-evidence',
      }));
      for (const item of prepared) {
        await savePaymentAttachmentFile(input.requestId, item.meta.fileName, item.bytes);
      }
      attachmentsJson = [...(existing.attachments || []), ...prepared.map((item) => item.meta)];
      nextStatus = 'Retirement Submitted';
      nextStage = 'Treasury Verification';
      retirementJson = {
        ...(existing.retirement || {}),
        submittedAt: nowIso(),
        submittedBy: input.actor,
        submittedByCode: input.actorCode || null,
        note,
        evidenceCount: prepared.length,
        evidenceFileNames: prepared.map((item) => item.meta.fileName),
      };
      notifyEvent = 'retirement-submitted';
      break;
    }
    case 'acknowledge-retirement': {
      if (!/retirement submitted|treasury verification|finance verification/i.test(existing.status)) {
        throw new Error('This payment is not awaiting retirement acknowledgement.');
      }
      nextStatus = 'Retired';
      nextStage = 'Retired';
      postingStatus = 'ReadyToPost';
      retirementJson = {
        ...(existing.retirement || {}),
        acknowledgedAt: nowIso(),
        acknowledgedBy: input.actor,
        acknowledgedByCode: input.actorCode || null,
        note: compact(input.comment || input.reason) || 'Retirement acknowledged by Treasury',
      };
      notifyEvent = 'retirement-acknowledged';
      break;
    }
    case 'return-retirement':
      nextStatus = 'Awaiting Retirement';
      nextStage = 'Returned for Retirement Fix';
      notifyEvent = 'returned';
      retirementJson = {
        ...(existing.retirement || {}),
        returnedAt: nowIso(),
        returnedBy: input.actor,
        returnReason: compact(input.reason || input.comment),
      };
      break;
    case 'ready-to-post':
      if (!existing.paidAt && !/^(paid|completed|retired|closed)$/i.test(existing.status)) {
        throw new Error('Payment must be paid or retired before it is ready to post.');
      }
      postingStatus = 'ReadyToPost';
      break;
    case 'mark-posted': {
      // Acknowledge-only: Finance marks the payment posted in their books; no Sage write from Connect.
      const voucher = compact(input.sageReference);
      sageReference = voucher || existing.sageReference || null;
      postingStatus = 'Posted';
      postedAt = new Date();
      postedBy = input.actor;
      postingJson = {
        ...(existing.posting || {}),
        postedAt: postedAt.toISOString(),
        postedBy: input.actor,
        sageReference: sageReference || null,
        notes: compact(input.comment || input.reason),
        acknowledgedInConnectOnly: true,
      };
      notifyEvent = 'posted';
      break;
    }
    case 'clarify':
      nextStatus = 'Returned';
      nextStage = 'Clarification Requested';
      notifyEvent = 'returned';
      break;
    case 'delegate': {
      const delegateToCode = compact(input.delegateToCode);
      const delegateToName = compact(input.delegateToName) || delegateToCode;
      if (!delegateToCode) {
        throw new Error('delegateToCode is required to reassign this approval.');
      }
      const principalCode = compact(existing.currentApproverCode) || compact(input.actorCode);
      const principalName = compact(existing.currentApproverName).replace(/\s*\(Delegated.*$/i, '') || compact(input.actor);
      if (principalCode) {
        const { upsertApprovalDelegation } = await import('@/lib/finance-intelligence/approval-delegation-service');
        const endsAt = input.delegateEndsAt
          ? input.delegateEndsAt
          : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        await upsertApprovalDelegation({
          fromEmployeeCode: principalCode,
          fromEmployeeName: principalName,
          toEmployeeCode: delegateToCode,
          toEmployeeName: delegateToName,
          approverRole: existing.currentStage || 'All Stages',
          scope: existing.paymentType,
          startsAt: new Date().toISOString(),
          endsAt,
          reason: compact(input.reason || input.comment) || `Ad-hoc delegation for ${existing.requestNumber}`,
          actor: input.actor,
        });
      }
      nextStage = existing.currentStage;
      nextStatus = existing.status;
      await pool.request()
        .input('RequestId', sql.NVarChar(60), input.requestId)
        .input('ApproverCode', sql.NVarChar(60), delegateToCode)
        .input('ApproverName', sql.NVarChar(200), `${delegateToName} (Delegated from ${principalName || 'current approver'})`)
        .query(`
UPDATE [finance].[PaymentRequests]
SET [CurrentApproverCode] = @ApproverCode,
    [CurrentApproverName] = @ApproverName,
    [StageEnteredAt] = SYSUTCDATETIME(),
    [LastReminderAt] = NULL,
    [UpdatedAt] = SYSUTCDATETIME()
WHERE [RequestId] = @RequestId
`);
      break;
    }
    case 'escalate':
      nextStage = 'Escalated';
      break;
    default:
      break;
  }

  const pendingStatuses = ['Pending Approval', 'Submitted', 'Finance Review'];
  const stageChanged = nextStage !== existing.currentStage || nextStatus !== existing.status;
  const enteringPending = pendingStatuses.some((status) => status.toLowerCase() === nextStatus.toLowerCase());

  await pool.request()
    .input('RequestId', sql.NVarChar(60), input.requestId)
    .input('Status', sql.NVarChar(40), nextStatus)
    .input('CurrentStage', sql.NVarChar(80), nextStage)
    .input('PaidAt', sql.DateTime2, paidAt)
    .input('PaymentReference', sql.NVarChar(120), paymentReference)
    .input('SageReference', sql.NVarChar(120), sageReference)
    .input('PostingStatus', sql.NVarChar(40), postingStatus)
    .input('PostedAt', sql.DateTime2, postedAt)
    .input('PostedBy', sql.NVarChar(120), postedBy)
    .input('TreasuryJson', sql.NVarChar(sql.MAX), treasuryJson ? JSON.stringify(treasuryJson) : null)
    .input('RetirementJson', sql.NVarChar(sql.MAX), retirementJson ? JSON.stringify(retirementJson) : null)
    .input('PostingJson', sql.NVarChar(sql.MAX), postingJson ? JSON.stringify(postingJson) : null)
    .input('AttachmentsJson', sql.NVarChar(sql.MAX), attachmentsJson ? JSON.stringify(attachmentsJson) : null)
    .input('ResetStageClock', sql.Bit, stageChanged && enteringPending ? 1 : 0)
    .input('ClearStageClock', sql.Bit, stageChanged && !enteringPending ? 1 : 0)
    .query(`
UPDATE [finance].[PaymentRequests]
SET [Status] = @Status,
    [CurrentStage] = @CurrentStage,
    [PaidAt] = COALESCE(@PaidAt, [PaidAt]),
    [PaymentReference] = COALESCE(@PaymentReference, [PaymentReference]),
    [SageReference] = COALESCE(@SageReference, [SageReference]),
    [PostingStatus] = COALESCE(@PostingStatus, [PostingStatus]),
    [PostedAt] = COALESCE(@PostedAt, [PostedAt]),
    [PostedBy] = COALESCE(@PostedBy, [PostedBy]),
    [TreasuryJson] = COALESCE(@TreasuryJson, [TreasuryJson]),
    [RetirementJson] = COALESCE(@RetirementJson, [RetirementJson]),
    [PostingJson] = COALESCE(@PostingJson, [PostingJson]),
    [AttachmentsJson] = COALESCE(@AttachmentsJson, [AttachmentsJson]),
    [StageEnteredAt] = CASE
      WHEN @ResetStageClock = 1 THEN SYSUTCDATETIME()
      WHEN @ClearStageClock = 1 THEN NULL
      ELSE [StageEnteredAt]
    END,
    [LastReminderAt] = CASE
      WHEN @ResetStageClock = 1 THEN NULL
      ELSE [LastReminderAt]
    END,
    [UpdatedAt] = SYSUTCDATETIME()
WHERE [RequestId] = @RequestId
`);

  if (notifyEvent === 'stage-advanced' && advancedTo) {
    assignedApprover = await assignCurrentApprover({
      requestId: input.requestId,
      stage: advancedTo,
      requesterCode: existing.requesterCode,
      projectCode: existing.projectCode,
      supervisorName: existing.supervisorName,
      paymentType: existing.paymentType,
    });
  } else if (notifyEvent === 'approved' || notifyEvent === 'rejected' || notifyEvent === 'returned' || notifyEvent === 'paid' || notifyEvent === 'retirement-acknowledged') {
    await pool.request()
      .input('RequestId', sql.NVarChar(60), input.requestId)
      .query(`
UPDATE [finance].[PaymentRequests]
SET [CurrentApproverCode] = NULL,
    [CurrentApproverName] = NULL,
    [UpdatedAt] = SYSUTCDATETIME()
WHERE [RequestId] = @RequestId
`);
  }

  await logAction({
    requestId: input.requestId,
    actionType: input.action,
    stage: input.action === 'approve' ? completedStage : nextStage,
    actorName: input.actor,
    actorCode: input.actorCode,
    comment: input.comment,
    reason: input.reason,
  });

  // Always reload the persisted row so notification uses the assigned Finance Manager code/name.
  const request = (await getPaymentRequestById(input.requestId)) || existing;
  if (assignedApprover) {
    request.currentApproverCode = assignedApprover.code || request.currentApproverCode;
    request.currentApproverName = assignedApprover.name || request.currentApproverName;
    request.currentStage = advancedTo || request.currentStage;
    request.status = nextStatus;
  }

  if (notifyEvent && request) {
    await notifyPaymentDecision({
      request,
      event: notifyEvent,
      actorName: input.actor,
      stage: completedStage,
      nextStage: advancedTo,
      reason: input.reason || input.comment || (notifyEvent === 'paid'
        ? (existing.paymentType === 'Cash Advance Payment'
          ? `Payment evidence uploaded (${paymentReference}). Please submit retirement with receipts.`
          : `Payment evidence uploaded (${paymentReference}).`)
        : undefined),
      baseUrl: resolveWorkflowLinkOrigin(input.baseUrl),
    }).catch((error) => console.error('[payment-requests] transition notification failed', error));
  }

  const workspace = await buildPaymentRequestsWorkspace();

  return {
    request: workspace.rows.find((row) => row.requestId === input.requestId) || request,
    workspace,
  };
};
