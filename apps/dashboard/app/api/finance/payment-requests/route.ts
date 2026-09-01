import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { AUTH_COOKIE, hasPermission, verifySessionToken } from '@/lib/auth/session';
import { permissionsForRoles } from '@/lib/auth/rbac';
import {
  canAccessPaymentRequest,
  canActOnPaymentApproval,
  canCancelOwnPaymentRequest,
  canCommentOnPaymentRequest,
  canDownloadPaymentDocumentPdf,
  canEditReturnedPaymentRequest,
  canSubmitCashAdvanceRetirement,
  canViewAllPaymentRequests,
  isAssignedPaymentApprover,
  isMdCeoActor,
  isPaymentRequesterOnly,
  isPendingPaymentApprovalStatus,
} from '@/lib/finance-intelligence/payment-access';
import { resolveWorkflowLinkOrigin } from '@/lib/public-app-url';
import {
  ALLOWED_PAYMENT_CURRENCIES,
  buildCashAdvanceControlsWorkspace,
  buildFinancePostingWorkspace,
  buildPaymentRequestsWorkspace,
  buildTreasuryWorkspace,
  cancelOutstandingCashAdvance,
  cancelOwnPaymentRequest,
  createPaymentRequest,
  getCashAdvanceEligibility,
  getPaymentRequestById,
  grantCashAdvanceWaiver,
  addPaymentRequestComment,
  listPaymentRequestActions,
  listPaymentRequestComments,
  listRequestIdsWithApprovalActions,
  PAYMENT_TYPES,
  paymentRequestHasApprovalAction,
  repairPrematureTreasuryHandoff,
  repairMissingProjectLineManager,
  repairMisroutedProjectPathWithoutProject,
  transitionPaymentRequest,
  updateReturnedPaymentRequest,
  type PaymentRequestType,
} from '@/lib/finance-intelligence/payment-requests-service';
import { FALLBACK_EXPENSE_CODES, FALLBACK_SITES, listExpenseCodes, listPaymentSites, normalizePaymentSiteCode } from '@/lib/finance-intelligence/payment-request-lookups';
import { sendPaymentApprovalReminder } from '@/lib/finance-intelligence/payment-approval-reminder-service';

const jsonOk = <T,>(data: T) => NextResponse.json({ status: 'success', data });
const jsonErr = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });
const codesEqual = (left?: string | null, right?: string | null) =>
  String(left || '').trim().toLowerCase() === String(right || '').trim().toLowerCase()
  && Boolean(String(left || '').trim());

type PaymentRouteActor = {
  actor: string;
  actorCode: string;
  department: string;
  unit: string;
  jobTitle: string;
  roles: string[];
  permissions: string[];
  isGlobalAdmin: boolean;
  authenticated: boolean;
};

/** Always scope list payloads: Finance / Global Super Admin → all; others → own (or inbox assignment). */
const buildViewerPaymentWorkspace = async (
  actor: PaymentRouteActor,
  options?: { listScope?: string; paymentType?: string; mineOnly?: boolean; inboxOnly?: boolean },
) => {
  const viewAll = canViewAllPaymentRequests(actor);
  const scope = String(options?.listScope || '').trim().toLowerCase();
  const mineOnly = Boolean(options?.mineOnly) || scope === 'mine';
  const inboxOnly = Boolean(options?.inboxOnly) || scope === 'inbox';
  const actorCode = String(actor.actorCode || '').trim();
  const workspace = await buildPaymentRequestsWorkspace({
    paymentType: options?.paymentType,
    mineFor: (mineOnly || (!viewAll && !inboxOnly)) ? actorCode : undefined,
    awaitingApproverCode: inboxOnly && !mineOnly ? actorCode : undefined,
    includeMdCeoStage: inboxOnly && !mineOnly && isMdCeoActor(actor),
    restrictToActor: inboxOnly || !viewAll,
  });
  const pendingOwnedIds = workspace.rows
    .filter((row) => isPendingPaymentApprovalStatus(row.status)
      && (canEditReturnedPaymentRequest(actor, row, { hasApprovalAction: false })
        || canCancelOwnPaymentRequest(actor, row, { hasApprovalAction: false })))
    .map((row) => row.requestId);
  const approvedIds = await listRequestIdsWithApprovalActions(pendingOwnedIds);
  return {
    ...workspace,
    viewer: {
      actorCode: actor.actorCode,
      canViewAll: viewAll,
      approvableRequestIds: workspace.rows
        .filter((row) => isAssignedPaymentApprover(actor, row))
        .map((row) => row.requestId),
      editableReturnedRequestIds: workspace.rows
        .filter((row) => canEditReturnedPaymentRequest(actor, row, {
          hasApprovalAction: approvedIds.has(row.requestId),
        }))
        .map((row) => row.requestId),
      cancellableRequestIds: workspace.rows
        .filter((row) => canCancelOwnPaymentRequest(actor, row, {
          hasApprovalAction: approvedIds.has(row.requestId),
        }))
        .map((row) => row.requestId),
    },
  };
};

const resolveActor = async (): Promise<PaymentRouteActor> => {
  const jar = await cookies();
  const token = jar.get(AUTH_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;
  const roles = session?.roles || [];
  const permissions = session?.isGlobalAdmin
    ? ['*']
    : permissionsForRoles(roles);
  const actorCode = String(
    session?.employeeCode
    || session?.employeeId
    || session?.username
    || session?.sub
    || '',
  ).trim();
  return {
    actor: session?.fullName || session?.username || session?.sub || 'Finance User',
    actorCode,
    department: session?.department || '',
    unit: session?.unit || '',
    jobTitle: '',
    roles,
    permissions,
    isGlobalAdmin: Boolean(session?.isGlobalAdmin),
    authenticated: Boolean(session),
  };
};

const canManageCashAdvanceOverrides = (actor: Awaited<ReturnType<typeof resolveActor>>) => {
  if (actor.isGlobalAdmin) return true;
  if (hasPermission(actor.permissions, 'finance.approve') || hasPermission(actor.permissions, 'finance.*')) return true;
  return actor.roles.some((role) =>
    /^(cfo|finance manager|finance controller|finance administrator|treasury officer)$/i.test(role.trim()));
};

const canOperateTreasury = (actor: Awaited<ReturnType<typeof resolveActor>>) => {
  if (actor.isGlobalAdmin) return true;
  if (
    hasPermission(actor.permissions, 'finance.treasury.operate')
    || hasPermission(actor.permissions, 'treasury.edit')
    || hasPermission(actor.permissions, 'treasury.*')
    || hasPermission(actor.permissions, 'finance.*')
    || hasPermission(actor.permissions, 'finance.edit')
    || hasPermission(actor.permissions, 'finance.view')
  ) return true;
  return actor.roles.some((role) =>
    /^(treasury officer|finance manager|finance controller|finance administrator|cfo|accountant|accounts payable officer|accounts receivable officer)$/i.test(role.trim()));
};

const canOperatePosting = (actor: Awaited<ReturnType<typeof resolveActor>>) => {
  if (actor.isGlobalAdmin) return true;
  if (
    hasPermission(actor.permissions, 'finance.posting.operate')
    || hasPermission(actor.permissions, 'finance.approve')
    || hasPermission(actor.permissions, 'finance.*')
  ) return true;
  return actor.roles.some((role) =>
    /^(accountant|accounts payable officer|finance manager|finance controller|finance administrator|cfo)$/i.test(role.trim()));
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const actor = await resolveActor();
    if (!actor.authenticated) return jsonErr(401, 'Sign in required.');
    const view = searchParams.get('view');
    const requestId = searchParams.get('requestId');
    const viewAll = canViewAllPaymentRequests(actor);

    if (requestId) {
      let paymentRequest = await getPaymentRequestById(requestId);
      if (!paymentRequest) return jsonErr(404, 'Payment request not found.');
      paymentRequest = await repairPrematureTreasuryHandoff(paymentRequest);
      paymentRequest = await repairMissingProjectLineManager(paymentRequest);
      paymentRequest = await repairMisroutedProjectPathWithoutProject(paymentRequest);
      const actions = await listPaymentRequestActions(paymentRequest.requestId);
      const comments = await listPaymentRequestComments(paymentRequest.requestId);
      if (!canAccessPaymentRequest(actor, paymentRequest, {
        priorActorCodes: actions.map((item) => item.actorCode),
      })) {
        return jsonErr(403, 'You do not have access to this payment request.');
      }
      const hasApprovalAction = actions.some((item) => /approve/i.test(item.actionType));
      return jsonOk({
        request: paymentRequest,
        actions,
        comments,
        viewer: {
          actorCode: actor.actorCode,
          canApprove: canActOnPaymentApproval(actor, paymentRequest),
          canComment: canCommentOnPaymentRequest(actor, paymentRequest),
          canEditReturned: canEditReturnedPaymentRequest(actor, paymentRequest, { hasApprovalAction }),
          canCancelOwn: canCancelOwnPaymentRequest(actor, paymentRequest, { hasApprovalAction }),
          isRequesterOnly: isPaymentRequesterOnly(actor, paymentRequest),
          canDownloadPdf: canDownloadPaymentDocumentPdf(paymentRequest),
          canSubmitRetirement: canSubmitCashAdvanceRetirement(actor, paymentRequest),
        },
      });
    }

    if (view === 'eligibility') {
      // Eligibility is needed while composing a cash advance for the selected employee.
      // Payment list/detail remain scoped; this only returns outstanding-advance status.
      const requestedCode = String(searchParams.get('employeeCode') || actor.actorCode || '').trim();
      return jsonOk(await getCashAdvanceEligibility(requestedCode || ''));
    }

    if (view === 'cash-advance-controls') {
      if (!canManageCashAdvanceOverrides(actor)) {
        return jsonErr(403, 'Only CFO / Finance approvers can open cash advance controls.');
      }
      return jsonOk(await buildCashAdvanceControlsWorkspace());
    }

    if (view === 'treasury') {
      if (!canOperateTreasury(actor)) {
        return jsonErr(403, 'Treasury Operations requires Treasury or Finance access.');
      }
      return jsonOk(await buildTreasuryWorkspace());
    }

    if (view === 'sage-posting') {
      if (!canOperatePosting(actor)) {
        return jsonErr(403, 'Finance Posting Desk requires Finance posting access.');
      }
      return jsonOk(await buildFinancePostingWorkspace());
    }

    const paymentType = searchParams.get('paymentType') || undefined;
    const mineOnly = searchParams.get('mine') === '1';
    const inboxOnly = searchParams.get('inbox') === '1';
    const workspace = await buildViewerPaymentWorkspace(actor, {
      paymentType,
      mineOnly,
      inboxOnly,
      listScope: inboxOnly && !mineOnly ? 'inbox' : (mineOnly || !viewAll ? 'mine' : undefined),
    });
    return jsonOk(workspace);
  } catch (error) {
    return jsonErr(500, error instanceof Error ? error.message : 'Unable to load payment requests.');
  }
}

export async function POST(request: Request) {
  try {
    const actor = await resolveActor();
    if (!actor.authenticated) return jsonErr(401, 'Sign in required.');
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || 'create').trim();

    if (action === 'create') {
      const paymentType = String(body.paymentType || '').trim() as PaymentRequestType;
      if (!PAYMENT_TYPES.includes(paymentType)) {
        return jsonErr(400, 'Only Cash Advance, Supplier Invoice, and Expense payments are enabled.');
      }

      const sites = await listPaymentSites();
      const expenses = await listExpenseCodes();
      const paymentSiteCode = normalizePaymentSiteCode(body.paymentSiteCode || body.companyCode);
      const paymentSite = sites.find((site) => site.siteCode.toUpperCase() === paymentSiteCode)
        || FALLBACK_SITES.find((site) => site.siteCode.toUpperCase() === paymentSiteCode)
        || null;
      const expenseCode = String(body.expenseCode || '').trim().toUpperCase();
      const expense = expenses.find((item) => item.expenseCode.toUpperCase() === expenseCode)
        || FALLBACK_EXPENSE_CODES.find((item) => item.expenseCode.toUpperCase() === expenseCode)
        || null;
      const currencyCode = String(body.currencyCode || 'NGN').trim().toUpperCase();
      if (!ALLOWED_PAYMENT_CURRENCIES.includes(currencyCode as typeof ALLOWED_PAYMENT_CURRENCIES[number])) {
        return jsonErr(400, 'Currency must be NGN, USD, EUR or GBP.');
      }

      const title = paymentType === 'Cash Advance Payment'
        ? (expense?.label || String(body.title || '').trim())
        : String(body.title || '').trim();

      if (paymentType === 'Cash Advance Payment') {
        if (!paymentSiteCode) return jsonErr(400, 'Payment site is required.');
        if (!paymentSite) return jsonErr(400, `Select a valid payment site (unknown code: ${paymentSiteCode}).`);
        if (!expenseCode) return jsonErr(400, 'Request title (expense code) is required.');
        if (!expense) return jsonErr(400, `Select a valid request title (unknown expense code: ${expenseCode}).`);
        if (!String(body.location || '').trim()) return jsonErr(400, 'Location is required.');
        if (!String(body.department || '').trim()) return jsonErr(400, 'Department is required.');
        if (String(body.businessJustification || '').trim().length < 10) {
          return jsonErr(400, 'Business justification must be at least 10 characters.');
        }
      }

      // Keep requester (who raises) separate from beneficiary (who is paid).
      // Cash advance: beneficiary/requester are the employee for LM routing.
      // Supplier / Expense: beneficiary is the payee; requester is always the signed-in user.
      const isVendorPayment = paymentType === 'Supplier Invoice Payment' || paymentType === 'Expense Payment';
      const beneficiaryCode = String(
        paymentType === 'Cash Advance Payment'
          ? (body.employeeCode || body.beneficiaryCode || actor.actorCode || '')
          : (body.beneficiaryCode || ''),
      ).trim();
      const beneficiaryName = String(
        paymentType === 'Cash Advance Payment'
          ? (body.employeeName || body.beneficiaryName || actor.actor || '')
          : (body.beneficiaryName || ''),
      ).trim();

      const requesterCode = paymentType === 'Cash Advance Payment'
        ? (beneficiaryCode || actor.actorCode)
        : String(body.requesterCode || actor.actorCode || '').trim();
      const requesterName = paymentType === 'Cash Advance Payment'
        ? (beneficiaryName || actor.actor)
        : String(body.requesterName || actor.actor || '').trim();

      if (isVendorPayment && !requesterName) {
        return jsonErr(400, 'Requester could not be resolved from your signed-in account.');
      }

      const result = await createPaymentRequest({
        paymentType,
        title,
        purpose: expense?.description || body.purpose,
        expenseCode: expense?.expenseCode || expenseCode || undefined,
        businessJustification: body.businessJustification,
        beneficiaryCode,
        beneficiaryName: beneficiaryName || (paymentType === 'Cash Advance Payment' ? actor.actor : ''),
        beneficiaryBankSummary: body.beneficiaryBankSummary,
        description: body.description || title,
        amount: Number(body.amount || 0),
        currencyCode,
        companyCode: paymentSite?.siteCode || paymentSiteCode || body.companyCode,
        paymentSiteCode: paymentSite?.siteCode || paymentSiteCode || undefined,
        paymentSiteName: paymentSite?.siteName || body.paymentSiteName,
        department: body.department || actor.department,
        location: body.location,
        costCentre: body.costCentre,
        projectCode: body.projectCode,
        priority: body.priority,
        requiredDate: body.requiredDate,
        requesterCode: requesterCode || actor.actorCode,
        requesterName: requesterName || actor.actor,
        requesterJobTitle: body.requesterJobTitle || actor.jobTitle,
        supervisorName: body.supervisorName,
        requestCategory: body.requestCategory,
        invoiceCategory: paymentType === 'Expense Payment'
          ? 'expense-no-po'
          : paymentType === 'Supplier Invoice Payment'
            ? 'po-backed'
            : body.invoiceCategory,
        expenseNature: paymentType === 'Expense Payment' ? body.expenseNature : undefined,
        invoiceNumber: body.invoiceNumber,
        invoiceDate: body.invoiceDate,
        dueDate: body.dueDate,
        vatAmount: body.vatAmount,
        whtAmount: body.whtAmount,
        retentionAmount: body.retentionAmount,
        purchaseOrderNo: paymentType === 'Expense Payment' ? '' : body.purchaseOrderNo,
        deliveryNoteNo: paymentType === 'Expense Payment' ? '' : body.deliveryNoteNo,
        grnNo: paymentType === 'Expense Payment' ? '' : body.grnNo,
        contractNo: body.contractNo,
        submit: body.submit !== false,
        actor: actor.actor,
        attachmentUploads: Array.isArray(body.attachmentUploads) ? body.attachmentUploads : undefined,
      });
      // Never return the enterprise-wide queue to non–Finance / non–Super-Admin actors.
      const workspace = await buildViewerPaymentWorkspace(actor, { listScope: body.listScope });
      return jsonOk({
        ...result,
        workspace,
        message: result.request?.status === 'Draft' ? 'Draft saved.' : 'Payment request submitted.',
      });
    }

    if (action === 'update-returned') {
      const requestId = String(body.requestId || '').trim();
      if (!requestId) return jsonErr(400, 'requestId is required.');
      const existing = await getPaymentRequestById(requestId);
      if (!existing) return jsonErr(404, 'Payment request not found.');
      const hasApprovalAction = await paymentRequestHasApprovalAction(requestId);
      if (!canEditReturnedPaymentRequest(actor, existing, { hasApprovalAction })) {
        return jsonErr(403, 'Only the requester can edit this request before approval begins (or when it is draft/returned).');
      }

      const paymentType = existing.paymentType as PaymentRequestType;
      const sites = await listPaymentSites();
      const expenses = await listExpenseCodes();
      const paymentSiteCode = normalizePaymentSiteCode(body.paymentSiteCode || body.companyCode || existing.paymentSiteCode);
      const paymentSite = sites.find((site) => site.siteCode.toUpperCase() === paymentSiteCode)
        || FALLBACK_SITES.find((site) => site.siteCode.toUpperCase() === paymentSiteCode)
        || null;
      const expenseCode = String(body.expenseCode || existing.expenseCode || '').trim().toUpperCase();
      const expense = expenses.find((item) => item.expenseCode.toUpperCase() === expenseCode)
        || FALLBACK_EXPENSE_CODES.find((item) => item.expenseCode.toUpperCase() === expenseCode)
        || null;
      const currencyCode = String(body.currencyCode || existing.currencyCode || 'NGN').trim().toUpperCase();
      if (!ALLOWED_PAYMENT_CURRENCIES.includes(currencyCode as typeof ALLOWED_PAYMENT_CURRENCIES[number])) {
        return jsonErr(400, 'Currency must be NGN, USD, EUR or GBP.');
      }

      const title = paymentType === 'Cash Advance Payment'
        ? (expense?.label || String(body.title || existing.title || '').trim())
        : String(body.title || existing.title || '').trim();

      const beneficiaryCode = String(
        paymentType === 'Cash Advance Payment'
          ? (body.employeeCode || body.beneficiaryCode || existing.beneficiaryCode || actor.actorCode || '')
          : (body.beneficiaryCode || existing.beneficiaryCode || ''),
      ).trim();
      const beneficiaryName = String(
        paymentType === 'Cash Advance Payment'
          ? (body.employeeName || body.beneficiaryName || existing.beneficiaryName || actor.actor || '')
          : (body.beneficiaryName || existing.beneficiaryName || ''),
      ).trim();

      const result = await updateReturnedPaymentRequest({
        requestId,
        paymentType,
        title,
        purpose: expense?.description || body.purpose || existing.purpose,
        expenseCode: expense?.expenseCode || expenseCode || undefined,
        businessJustification: body.businessJustification ?? existing.businessJustification,
        beneficiaryCode,
        beneficiaryName,
        beneficiaryBankSummary: body.beneficiaryBankSummary ?? existing.beneficiaryBankSummary,
        description: body.description || title,
        amount: Number(body.amount ?? existing.grossAmount ?? 0),
        currencyCode,
        companyCode: paymentSite?.siteCode || paymentSiteCode || existing.companyCode,
        paymentSiteCode: paymentSite?.siteCode || paymentSiteCode || undefined,
        paymentSiteName: paymentSite?.siteName || body.paymentSiteName || existing.paymentSiteName,
        department: body.department || existing.department || actor.department,
        location: body.location || existing.location,
        costCentre: body.costCentre || existing.costCentre,
        projectCode: body.projectCode || existing.projectCode,
        priority: body.priority || existing.priority,
        requiredDate: body.requiredDate || existing.requiredDate || undefined,
        requesterCode: existing.requesterCode || actor.actorCode,
        requesterName: existing.requesterName || actor.actor,
        requesterJobTitle: body.requesterJobTitle || existing.requesterJobTitle || actor.jobTitle,
        supervisorName: body.supervisorName || existing.supervisorName,
        requestCategory: body.requestCategory || existing.requestCategory,
        invoiceCategory: body.invoiceCategory || existing.payload?.invoiceCategory,
        expenseNature: body.expenseNature || existing.payload?.expenseNature,
        invoiceNumber: body.invoiceNumber ?? existing.invoiceNumber,
        invoiceDate: body.invoiceDate || existing.invoiceDate || undefined,
        dueDate: body.dueDate || existing.dueDate || undefined,
        vatAmount: body.vatAmount ?? existing.vatAmount,
        whtAmount: body.whtAmount ?? existing.whtAmount,
        retentionAmount: body.retentionAmount ?? existing.retentionAmount,
        purchaseOrderNo: body.purchaseOrderNo ?? existing.purchaseOrderNo,
        deliveryNoteNo: body.deliveryNoteNo ?? existing.deliveryNoteNo,
        grnNo: body.grnNo ?? existing.grnNo,
        contractNo: body.contractNo ?? existing.contractNo,
        resubmit: body.resubmit !== false,
        actor: actor.actor,
        actorCode: actor.actorCode,
        attachmentUploads: Array.isArray(body.attachmentUploads) ? body.attachmentUploads : undefined,
        keepAttachmentIds: Array.isArray(body.keepAttachmentIds)
          ? body.keepAttachmentIds.map((id: unknown) => String(id || '').trim()).filter(Boolean)
          : undefined,
      });
      const workspace = await buildViewerPaymentWorkspace(actor, { listScope: body.listScope });
      return jsonOk({
        ...result,
        workspace,
      });
    }

    if (action === 'grant-cash-advance-waiver') {
      if (!canManageCashAdvanceOverrides(actor)) {
        return jsonErr(403, 'Only CFO / Finance approvers can grant cash advance waivers.');
      }
      const employeeCode = String(body.employeeCode || '').trim();
      const reason = String(body.reason || '').trim();
      const result = await grantCashAdvanceWaiver({
        employeeCode,
        reason,
        grantedBy: actor.actor,
        grantedByCode: actor.actorCode,
      });
      return jsonOk({
        ...result,
        message: result.alreadyActive
          ? 'An active waiver already exists for this employee.'
          : 'Outstanding cash advance waiver granted.',
      });
    }

    if (action === 'cancel-own') {
      const requestId = String(body.requestId || '').trim();
      if (!requestId) return jsonErr(400, 'requestId is required.');
      const existing = await getPaymentRequestById(requestId);
      if (!existing) return jsonErr(404, 'Payment request not found.');
      const hasApprovalAction = await paymentRequestHasApprovalAction(requestId);
      if (!canCancelOwnPaymentRequest(actor, existing, { hasApprovalAction })) {
        return jsonErr(403, 'Only the requester can cancel this request before approval begins.');
      }
      const result = await cancelOwnPaymentRequest({
        requestId,
        actor: actor.actor,
        actorCode: actor.actorCode,
        reason: String(body.reason || '').trim() || undefined,
      });
      const workspace = await buildViewerPaymentWorkspace(actor, { listScope: body.listScope });
      return jsonOk({
        ...result,
        workspace,
        message: result.message || 'Payment request cancelled.',
      });
    }

    if (action === 'cancel-outstanding-cash-advance') {
      if (!canManageCashAdvanceOverrides(actor)) {
        return jsonErr(403, 'Only CFO / Finance approvers can cancel outstanding cash advances.');
      }
      const result = await cancelOutstandingCashAdvance({
        requestId: String(body.requestId || '').trim(),
        reason: String(body.reason || '').trim(),
        actor: actor.actor,
        actorCode: actor.actorCode,
      });
      return jsonOk({ ...result, message: 'Outstanding cash advance cancelled. Retirement is no longer required.' });
    }

    if (action === 'send-reminder') {
      const requestId = String(body.requestId || '').trim();
      if (!requestId) return jsonErr(400, 'requestId is required.');
      const paymentRequest = await getPaymentRequestById(requestId);
      if (!paymentRequest) return jsonErr(404, 'Payment request not found.');
      const isRequester = codesEqual(actor.actorCode, paymentRequest.requesterCode)
        || codesEqual(actor.actorCode, paymentRequest.beneficiaryCode);
      if (!isRequester && !canViewAllPaymentRequests(actor)) {
        return jsonErr(403, 'Only the requester can send a reminder for this payment request.');
      }
      const origin = resolveWorkflowLinkOrigin();
      const result = await sendPaymentApprovalReminder({
        requestId,
        actor: actor.actor,
        actorCode: actor.actorCode,
        baseUrl: origin,
      });
      return jsonOk({
        ...result,
        message: `Reminder sent to ${paymentRequest.currentApproverName || paymentRequest.currentApproverCode || 'current approver'}.`,
      });
    }

    if (action === 'add-comment') {
      const requestId = String(body.requestId || '').trim();
      if (!requestId) return jsonErr(400, 'requestId is required.');
      const paymentRequest = await getPaymentRequestById(requestId);
      if (!paymentRequest) return jsonErr(404, 'Payment request not found.');
      const priorActions = await listPaymentRequestActions(paymentRequest.requestId);
      if (!canAccessPaymentRequest(actor, paymentRequest, {
        priorActorCodes: priorActions.map((item) => item.actorCode),
      })) {
        return jsonErr(403, 'You do not have access to this payment request.');
      }
      if (!canCommentOnPaymentRequest(actor, paymentRequest)) {
        return jsonErr(403, 'Only the initiator and the current approver can comment while this request is pending.');
      }
      const origin = resolveWorkflowLinkOrigin();
      const result = await addPaymentRequestComment({
        requestId: paymentRequest.requestId,
        actor: actor.actor,
        actorCode: actor.actorCode,
        body: String(body.comment || body.body || ''),
        baseUrl: origin,
      });
      return jsonOk({
        ...result,
        viewer: {
          actorCode: actor.actorCode,
          canApprove: canActOnPaymentApproval(actor, result.request),
          canComment: canCommentOnPaymentRequest(actor, result.request),
        },
        message: 'Comment posted.',
      });
    }

    if (action === 'transition') {
      const requestId = String(body.requestId || '').trim();
      if (!requestId) return jsonErr(400, 'requestId is required.');
      const transition = String(body.transition || '').trim();
      const treasuryActions = ['mark-paid', 'acknowledge-retirement', 'return-retirement', 'mark-ready-treasury'];
      const postingActions = ['mark-posted', 'ready-to-post'];
      const approvalActions = ['approve', 'reject', 'return', 'clarify', 'delegate', 'escalate'];
      if (treasuryActions.includes(transition) && !canOperateTreasury(actor)) {
        return jsonErr(403, 'Treasury actions require Treasury or Finance access.');
      }
      if (postingActions.includes(transition) && !canOperatePosting(actor)) {
        return jsonErr(403, 'Posting actions require Finance posting access.');
      }
      if (approvalActions.includes(transition)) {
        const paymentRequest = await getPaymentRequestById(requestId);
        if (!paymentRequest) return jsonErr(404, 'Payment request not found.');
        if (!canActOnPaymentApproval(actor, paymentRequest)) {
          return jsonErr(403, 'Only the assigned approver can action this payment request.');
        }
      }
      if (transition === 'submit-retirement') {
        const paymentRequest = await getPaymentRequestById(requestId);
        if (!paymentRequest) return jsonErr(404, 'Payment request not found.');
        if (!canSubmitCashAdvanceRetirement(actor, paymentRequest)) {
          return jsonErr(403, 'Only the requester (or beneficiary) can submit retirement for this cash advance.');
        }
      }
      const origin = resolveWorkflowLinkOrigin();
      const result = await transitionPaymentRequest({
        requestId,
        action: body.transition,
        actor: actor.actor,
        actorCode: actor.actorCode,
        comment: body.comment,
        reason: body.reason,
        paymentReference: body.paymentReference,
        sageReference: body.sageReference,
        baseUrl: origin,
        delegateToCode: body.delegateToCode,
        delegateToName: body.delegateToName,
        delegateEndsAt: body.delegateEndsAt,
        paymentEvidenceUpload: body.paymentEvidenceUpload && typeof body.paymentEvidenceUpload === 'object'
          ? body.paymentEvidenceUpload
          : undefined,
        retirementEvidenceUploads: Array.isArray(body.retirementEvidenceUploads)
          ? body.retirementEvidenceUploads
          : undefined,
      });
      const actions = result.request
        ? await listPaymentRequestActions(result.request.requestId)
        : [];
      // Never return an unscoped payment list to non–Finance / non–Super-Admin actors.
      const workspaceForViewer = await buildViewerPaymentWorkspace(actor, { listScope: body.listScope });
      return jsonOk({
        ...result,
        workspace: workspaceForViewer,
        actions,
        message: 'Payment request updated.',
      });
    }

    return jsonErr(400, 'Unsupported payment request action.');
  } catch (error) {
    return jsonErr(400, error instanceof Error ? error.message : 'Unable to save payment request.');
  }
}
