import sql from 'mssql';
import { ensureFinanceDb } from '@/lib/finance-intelligence/store';

export const PAYMENT_TYPES = ['Cash Advance Payment', 'Supplier Invoice Payment'] as const;
export type PaymentRequestType = (typeof PAYMENT_TYPES)[number];

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
  department: string;
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
  createdAt: string;
  updatedAt: string;
  payload: Record<string, unknown>;
  attachments: unknown[];
  retirement: Record<string, unknown> | null;
  treasury: Record<string, unknown> | null;
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
  department?: string;
  costCentre?: string;
  projectCode?: string;
  priority?: string;
  requiredDate?: string;
  requesterCode: string;
  requesterName: string;
  requesterJobTitle?: string;
  supervisorName?: string;
  requestCategory?: string;
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
};

const compact = (value: unknown) => String(value ?? '').trim();
const nowIso = () => new Date().toISOString();
const moneyRound = (value: number) => Math.round(value * 10000) / 10000;

const APPROVAL_LIMITS = [
  { max: 100_000, stage: 'Supervisor', approverRole: 'Line Manager' },
  { max: 500_000, stage: 'Department Head', approverRole: 'Department Head' },
  { max: 2_000_000, stage: 'Finance Manager', approverRole: 'Finance Manager' },
  { max: 10_000_000, stage: 'CFO', approverRole: 'CFO' },
  { max: Number.POSITIVE_INFINITY, stage: 'Managing Director', approverRole: 'Managing Director' },
] as const;

const resolveInitialStage = (amount: number, paymentType: PaymentRequestType) => {
  if (paymentType === 'Supplier Invoice Payment') {
    return { stage: 'Department Head', status: 'Pending Approval' as const };
  }
  const limit = APPROVAL_LIMITS.find((item) => amount <= item.max) || APPROVAL_LIMITS[APPROVAL_LIMITS.length - 1];
  return { stage: limit.stage, status: 'Pending Approval' as const };
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
    department: compact(row.Department),
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
    createdAt: row.CreatedAt ? new Date(String(row.CreatedAt)).toISOString() : nowIso(),
    updatedAt: row.UpdatedAt ? new Date(String(row.UpdatedAt)).toISOString() : nowIso(),
    payload: parseJson(row.PayloadJson, {}),
    attachments: parseJson(row.AttachmentsJson, []),
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
  },
  rows: [],
});

const listRows = async (input?: {
  paymentType?: string;
  status?: string;
  requesterCode?: string;
  mineFor?: string;
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
    if (input?.requesterCode || input?.mineFor) {
      request.input('requester', sql.NVarChar(60), input.requesterCode || input.mineFor);
      where += ' AND [RequesterCode] = @requester';
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

const countOutstandingCashAdvances = async (requesterCode: string) => {
  const pool = await ensureFinanceDb().catch(() => null);
  if (!pool || !requesterCode) return 0;
  try {
    const result = await pool.request()
      .input('requester', sql.NVarChar(60), requesterCode)
      .query(`
SELECT COUNT(1) AS count
FROM [finance].[PaymentRequests]
WHERE [PaymentType] = N'Cash Advance Payment'
  AND [RequesterCode] = @requester
  AND [Status] IN (
    N'Submitted', N'Pending Approval', N'Approved', N'Ready for Treasury', N'Paid',
    N'Awaiting Retirement', N'Retirement Submitted', N'Treasury Verification', N'Finance Verification'
  )
`);
    return Number(result.recordset?.[0]?.count || 0);
  } catch {
    return 0;
  }
};

const nextRequestNumber = async () => {
  const year = new Date().getFullYear();
  const pool = await ensureFinanceDb().catch(() => null);
  if (!pool) return `PAY-${year}-00001`;
  try {
    const result = await pool.request().query(`
SELECT TOP 1 [RequestNumber]
FROM [finance].[PaymentRequests]
WHERE [RequestNumber] LIKE N'PAY-${year}-%'
ORDER BY [RequestNumber] DESC
`);
    const latest = compact(result.recordset?.[0]?.RequestNumber);
    const seq = latest ? Number(latest.split('-').pop() || '0') + 1 : 1;
    return `PAY-${year}-${String(seq).padStart(5, '0')}`;
  } catch {
    return `PAY-${year}-${String(Date.now()).slice(-5)}`;
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

export const buildPaymentRequestsWorkspace = async (input?: {
  paymentType?: string;
  mineFor?: string;
}): Promise<PaymentRequestsWorkspace> => {
  const rows = await listRows({
    paymentType: input?.paymentType,
  });
  const workspace = emptyWorkspace();
  workspace.source = rows.length || (await ensureFinanceDb().catch(() => null))
    ? 'DLE Enterprise · finance.PaymentRequests'
    : 'Local finance workspace (DB offline)';
  workspace.rows = rows;
  workspace.generatedAt = nowIso();

  const now = new Date();
  const sum = (list: PaymentRequestRow[]) => list.reduce((total, row) => total + Number(row.netAmount || 0), 0);
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
  const mine = input?.mineFor
    ? rows.filter((row) => row.requesterCode.toLowerCase() === input.mineFor!.toLowerCase())
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
  workspace.tabCounts = {
    all: rows.length,
    mine: mine.length || (input?.mineFor ? 0 : rows.length),
    drafts: drafts.length,
    pending: pending.length,
    returned: returned.length,
    approved: approved.length,
    ready: ready.length,
    paid: paidMonth.length,
    rejected: rejected.length,
  };
  return workspace;
};

export const createPaymentRequest = async (input: CreatePaymentRequestInput) => {
  if (!PAYMENT_TYPES.includes(input.paymentType)) {
    throw new Error('Only Cash Advance Payment and Supplier Invoice Payment are enabled.');
  }
  const title = compact(input.title);
  const beneficiaryName = compact(input.beneficiaryName);
  const amount = moneyRound(Number(input.amount || 0));
  if (!title) throw new Error('Request title is required.');
  if (!beneficiaryName) throw new Error('Beneficiary is required.');
  if (!(amount > 0)) throw new Error('Amount must be greater than zero.');

  if (input.paymentType === 'Cash Advance Payment') {
    const outstanding = await countOutstandingCashAdvances(input.requesterCode);
    if (outstanding > 0 && !input.overrideOutstandingAdvance) {
      throw new Error('You have one outstanding cash advance awaiting retirement. Please retire the previous advance before creating another request.');
    }
    if (outstanding > 0 && input.overrideOutstandingAdvance && !compact(input.overrideReason)) {
      throw new Error('Override reason is required when an outstanding cash advance exists.');
    }
  }

  if (input.paymentType === 'Supplier Invoice Payment') {
    if (!compact(input.invoiceNumber)) throw new Error('Invoice number is required for supplier payments.');
    if (!compact(input.beneficiaryCode) && !beneficiaryName) throw new Error('Select a supplier from the supplier master.');
  }

  const pool = await ensureFinanceDb();
  if (!pool) throw new Error('Finance database is unavailable.');

  const requestId = `PREQ-${Date.now()}`;
  const requestNumber = await nextRequestNumber();
  const vatAmount = moneyRound(Number(input.vatAmount || 0));
  const whtAmount = moneyRound(Number(input.whtAmount || 0));
  const retentionAmount = moneyRound(Number(input.retentionAmount || 0));
  const grossAmount = amount;
  const netAmount = moneyRound(grossAmount + vatAmount - whtAmount - retentionAmount);
  const submit = Boolean(input.submit);
  const stageInfo = submit
    ? resolveInitialStage(netAmount, input.paymentType)
    : { stage: 'Draft', status: 'Draft' as const };

  await pool.request()
    .input('RequestId', sql.NVarChar(60), requestId)
    .input('RequestNumber', sql.NVarChar(60), requestNumber)
    .input('PaymentType', sql.NVarChar(80), input.paymentType)
    .input('RequestCategory', sql.NVarChar(80), compact(input.requestCategory) || input.paymentType)
    .input('Title', sql.NVarChar(250), title)
    .input('Purpose', sql.NVarChar(sql.MAX), compact(input.purpose) || null)
    .input('BusinessJustification', sql.NVarChar(sql.MAX), compact(input.businessJustification) || null)
    .input('BeneficiaryType', sql.NVarChar(40), input.paymentType === 'Supplier Invoice Payment' ? 'Supplier' : 'Employee')
    .input('BeneficiaryCode', sql.NVarChar(80), compact(input.beneficiaryCode) || null)
    .input('BeneficiaryName', sql.NVarChar(250), beneficiaryName)
    .input('BeneficiaryBankSummary', sql.NVarChar(500), compact(input.beneficiaryBankSummary) || null)
    .input('Description', sql.NVarChar(sql.MAX), compact(input.description) || title)
    .input('GrossAmount', sql.Decimal(19, 4), grossAmount)
    .input('VatAmount', sql.Decimal(19, 4), vatAmount)
    .input('WhtAmount', sql.Decimal(19, 4), whtAmount)
    .input('RetentionAmount', sql.Decimal(19, 4), retentionAmount)
    .input('NetAmount', sql.Decimal(19, 4), netAmount)
    .input('CurrencyCode', sql.NVarChar(10), compact(input.currencyCode) || 'NGN')
    .input('CompanyCode', sql.NVarChar(40), compact(input.companyCode) || 'DLE')
    .input('Department', sql.NVarChar(150), compact(input.department) || null)
    .input('CostCentre', sql.NVarChar(80), compact(input.costCentre) || null)
    .input('ProjectCode', sql.NVarChar(80), compact(input.projectCode) || null)
    .input('Priority', sql.NVarChar(40), compact(input.priority) || 'Normal')
    .input('RequiredDate', sql.Date, input.requiredDate ? new Date(input.requiredDate) : null)
    .input('RequesterCode', sql.NVarChar(60), compact(input.requesterCode) || null)
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
    .input('PayloadJson', sql.NVarChar(sql.MAX), JSON.stringify({ approvalLimits: APPROVAL_LIMITS }))
    .query(`
INSERT INTO [finance].[PaymentRequests] (
  [RequestId], [RequestNumber], [PaymentType], [RequestCategory], [Title], [Purpose], [BusinessJustification],
  [BeneficiaryType], [BeneficiaryCode], [BeneficiaryName], [BeneficiaryBankSummary], [Description],
  [GrossAmount], [VatAmount], [WhtAmount], [RetentionAmount], [NetAmount], [CurrencyCode],
  [CompanyCode], [Department], [CostCentre], [ProjectCode], [Priority], [RequiredDate],
  [RequesterCode], [RequesterName], [RequesterJobTitle], [SupervisorName], [SubmittedAt],
  [CurrentStage], [Status], [OverrideOutstandingAdvance], [OverrideReason],
  [InvoiceNumber], [InvoiceDate], [DueDate], [PurchaseOrderNo], [DeliveryNoteNo], [GrnNo], [ContractNo], [PayloadJson]
) VALUES (
  @RequestId, @RequestNumber, @PaymentType, @RequestCategory, @Title, @Purpose, @BusinessJustification,
  @BeneficiaryType, @BeneficiaryCode, @BeneficiaryName, @BeneficiaryBankSummary, @Description,
  @GrossAmount, @VatAmount, @WhtAmount, @RetentionAmount, @NetAmount, @CurrencyCode,
  @CompanyCode, @Department, @CostCentre, @ProjectCode, @Priority, @RequiredDate,
  @RequesterCode, @RequesterName, @RequesterJobTitle, @SupervisorName, @SubmittedAt,
  @CurrentStage, @Status, @OverrideOutstandingAdvance, @OverrideReason,
  @InvoiceNumber, @InvoiceDate, @DueDate, @PurchaseOrderNo, @DeliveryNoteNo, @GrnNo, @ContractNo, @PayloadJson
)
`);

  await logAction({
    requestId,
    actionType: submit ? 'Submitted' : 'Created',
    stage: stageInfo.stage,
    actorName: input.actor,
    actorCode: input.requesterCode,
    comment: submit ? 'Payment request submitted for approval.' : 'Payment request saved as draft.',
    reason: input.overrideReason,
  });

  const workspace = await buildPaymentRequestsWorkspace();
  const request = workspace.rows.find((row) => row.requestId === requestId) || null;
  return { request, workspace };
};

export const transitionPaymentRequest = async (input: {
  requestId: string;
  action: 'approve' | 'reject' | 'return' | 'clarify' | 'delegate' | 'escalate' | 'mark-ready-treasury' | 'mark-paid' | 'submit-retirement';
  actor: string;
  actorCode?: string;
  comment?: string;
  reason?: string;
  paymentReference?: string;
}) => {
  const pool = await ensureFinanceDb();
  if (!pool) throw new Error('Finance database is unavailable.');

  const existing = (await listRows()).find((row) => row.requestId === input.requestId);
  if (!existing) throw new Error('Payment request not found.');

  const requiresReason = ['reject', 'return', 'delegate', 'escalate', 'clarify'].includes(input.action);
  if (requiresReason && !compact(input.reason || input.comment)) {
    throw new Error('A reason is required for this action.');
  }

  let nextStatus = existing.status;
  let nextStage = existing.currentStage;
  let paidAt: Date | null = null;
  let paymentReference = existing.paymentReference || null;

  switch (input.action) {
    case 'approve':
      if (/pending|submitted|finance review/i.test(existing.status)) {
        nextStatus = 'Approved';
        nextStage = 'Final Approval';
      } else if (/approved/i.test(existing.status)) {
        nextStatus = 'Ready for Treasury';
        nextStage = 'Treasury';
      }
      break;
    case 'reject':
      nextStatus = 'Rejected';
      nextStage = 'Rejected';
      break;
    case 'return':
      nextStatus = 'Returned';
      nextStage = 'Returned for Correction';
      break;
    case 'mark-ready-treasury':
      nextStatus = 'Ready for Treasury';
      nextStage = 'Treasury';
      break;
    case 'mark-paid':
      nextStatus = existing.paymentType === 'Cash Advance Payment' ? 'Awaiting Retirement' : 'Paid';
      nextStage = existing.paymentType === 'Cash Advance Payment' ? 'Awaiting Retirement' : 'Paid';
      paidAt = new Date();
      paymentReference = compact(input.paymentReference) || `PAYREF-${Date.now()}`;
      break;
    case 'submit-retirement':
      nextStatus = 'Retirement Submitted';
      nextStage = 'Treasury Verification';
      break;
    case 'clarify':
      nextStatus = 'Returned';
      nextStage = 'Clarification Requested';
      break;
    case 'delegate':
      nextStage = `Delegated · ${existing.currentStage}`;
      break;
    case 'escalate':
      nextStage = 'Escalated';
      break;
    default:
      break;
  }

  await pool.request()
    .input('RequestId', sql.NVarChar(60), input.requestId)
    .input('Status', sql.NVarChar(40), nextStatus)
    .input('CurrentStage', sql.NVarChar(80), nextStage)
    .input('PaidAt', sql.DateTime2, paidAt)
    .input('PaymentReference', sql.NVarChar(120), paymentReference)
    .query(`
UPDATE [finance].[PaymentRequests]
SET [Status] = @Status,
    [CurrentStage] = @CurrentStage,
    [PaidAt] = COALESCE(@PaidAt, [PaidAt]),
    [PaymentReference] = COALESCE(@PaymentReference, [PaymentReference]),
    [UpdatedAt] = SYSUTCDATETIME()
WHERE [RequestId] = @RequestId
`);

  await logAction({
    requestId: input.requestId,
    actionType: input.action,
    stage: nextStage,
    actorName: input.actor,
    actorCode: input.actorCode,
    comment: input.comment,
    reason: input.reason,
  });

  const workspace = await buildPaymentRequestsWorkspace();
  return {
    request: workspace.rows.find((row) => row.requestId === input.requestId) || null,
    workspace,
  };
};
