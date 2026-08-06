import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { AUTH_COOKIE, hasPermission, verifySessionToken } from '@/lib/auth/session';
import { permissionsForRoles } from '@/lib/auth/rbac';
import {
  canAccessPaymentRequest,
  canActOnPaymentApproval,
  canDownloadPaymentDocumentPdf,
  canSubmitCashAdvanceRetirement,
  canViewAllPaymentRequests,
  isPaymentRequesterOnly,
} from '@/lib/finance-intelligence/payment-access';
import { resolvePublicAppOrigin } from '@/lib/public-app-url';
import {
  ALLOWED_PAYMENT_CURRENCIES,
  buildCashAdvanceControlsWorkspace,
  buildFinancePostingWorkspace,
  buildPaymentRequestsWorkspace,
  buildTreasuryWorkspace,
  cancelOutstandingCashAdvance,
  createPaymentRequest,
  getCashAdvanceEligibility,
  getPaymentRequestById,
  grantCashAdvanceWaiver,
  listPaymentRequestActions,
  PAYMENT_TYPES,
  repairPrematureTreasuryHandoff,
  transitionPaymentRequest,
  type PaymentRequestType,
} from '@/lib/finance-intelligence/payment-requests-service';
import { FALLBACK_EXPENSE_CODES, FALLBACK_SITES, listExpenseCodes, listPaymentSites } from '@/lib/finance-intelligence/payment-request-lookups';

const jsonOk = <T,>(data: T) => NextResponse.json({ status: 'success', data });
const jsonErr = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });

const resolveActor = async () => {
  const jar = await cookies();
  const token = jar.get(AUTH_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;
  const roles = session?.roles || [];
  const permissions = session?.isGlobalAdmin
    ? ['*']
    : permissionsForRoles(roles);
  return {
    actor: session?.fullName || session?.username || session?.sub || 'Finance User',
    actorCode: session?.employeeCode || session?.username || session?.sub || '',
    department: session?.department || '',
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
      if (!canAccessPaymentRequest(actor, paymentRequest)) {
        return jsonErr(403, 'You do not have access to this payment request.');
      }
      const actions = await listPaymentRequestActions(paymentRequest.requestId);
      return jsonOk({
        request: paymentRequest,
        actions,
        viewer: {
          actorCode: actor.actorCode,
          canApprove: canActOnPaymentApproval(actor, paymentRequest),
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
    const workspace = await buildPaymentRequestsWorkspace({
      paymentType: paymentType || undefined,
      // Elevated + My Requests tab → requester only.
      // Non-elevated default → own requests plus items assigned to them as approver/beneficiary.
      // Non-elevated + mine=1 → requester only.
      mineFor: mineOnly ? actor.actorCode : undefined,
      scopedToActorCode: !viewAll && !mineOnly ? actor.actorCode : undefined,
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
        return jsonErr(400, 'Only Cash Advance Payment and Supplier Invoice Payment are enabled.');
      }

      const sites = await listPaymentSites();
      const expenses = await listExpenseCodes();
      const paymentSiteCode = String(body.paymentSiteCode || body.companyCode || '').trim().toUpperCase();
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
      // Supplier invoice: beneficiary is the supplier; requester is always the signed-in user.
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

      if (paymentType === 'Supplier Invoice Payment' && !requesterName) {
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
        invoiceCategory: body.invoiceCategory,
        expenseNature: body.expenseNature,
        invoiceNumber: body.invoiceNumber,
        invoiceDate: body.invoiceDate,
        dueDate: body.dueDate,
        vatAmount: body.vatAmount,
        whtAmount: body.whtAmount,
        retentionAmount: body.retentionAmount,
        purchaseOrderNo: body.purchaseOrderNo,
        deliveryNoteNo: body.deliveryNoteNo,
        grnNo: body.grnNo,
        contractNo: body.contractNo,
        submit: body.submit !== false,
        actor: actor.actor,
        attachmentUploads: Array.isArray(body.attachmentUploads) ? body.attachmentUploads : undefined,
      });
      return jsonOk({
        ...result,
        message: result.request?.status === 'Draft' ? 'Draft saved.' : 'Payment request submitted.',
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
      const hdrs = await headers();
      const origin = resolvePublicAppOrigin(hdrs.get('origin') || hdrs.get('x-forwarded-host') || undefined);
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
      return jsonOk({ ...result, actions, message: 'Payment request updated.' });
    }

    return jsonErr(400, 'Unsupported payment request action.');
  } catch (error) {
    return jsonErr(400, error instanceof Error ? error.message : 'Unable to save payment request.');
  }
}
