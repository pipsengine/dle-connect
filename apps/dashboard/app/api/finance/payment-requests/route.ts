import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { AUTH_COOKIE, hasPermission, verifySessionToken } from '@/lib/auth/session';
import { permissionsForRoles } from '@/lib/auth/rbac';
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
  transitionPaymentRequest,
  type PaymentRequestType,
} from '@/lib/finance-intelligence/payment-requests-service';
import { listExpenseCodes, listPaymentSites } from '@/lib/finance-intelligence/payment-request-lookups';
import { resolvePublicAppOrigin } from '@/lib/public-app-url';

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
  ) return true;
  return actor.roles.some((role) =>
    /^(treasury officer|finance manager|finance controller|finance administrator|cfo)$/i.test(role.trim()));
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
    const view = searchParams.get('view');
    const requestId = searchParams.get('requestId');

    if (requestId) {
      const paymentRequest = await getPaymentRequestById(requestId);
      if (!paymentRequest) return jsonErr(404, 'Payment request not found.');
      const actions = await listPaymentRequestActions(paymentRequest.requestId);
      return jsonOk({ request: paymentRequest, actions });
    }

    if (view === 'eligibility') {
      const employeeCode = searchParams.get('employeeCode') || actor.actorCode;
      return jsonOk(await getCashAdvanceEligibility(employeeCode || ''));
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
    const workspace = await buildPaymentRequestsWorkspace({
      paymentType: paymentType || undefined,
      mineFor: searchParams.get('mine') === '1' ? actor.actorCode : undefined,
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
      const paymentSite = sites.find((site) => site.siteCode.toUpperCase() === paymentSiteCode) || null;
      const expenseCode = String(body.expenseCode || '').trim().toUpperCase();
      const expense = expenses.find((item) => item.expenseCode.toUpperCase() === expenseCode) || null;
      const currencyCode = String(body.currencyCode || 'NGN').trim().toUpperCase();
      if (!ALLOWED_PAYMENT_CURRENCIES.includes(currencyCode as typeof ALLOWED_PAYMENT_CURRENCIES[number])) {
        return jsonErr(400, 'Currency must be NGN, USD, EUR or GBP.');
      }

      const title = paymentType === 'Cash Advance Payment'
        ? (expense?.label || String(body.title || '').trim())
        : String(body.title || '').trim();

      if (paymentType === 'Cash Advance Payment') {
        if (!paymentSite) return jsonErr(400, 'Select a valid payment site.');
        if (!expense) return jsonErr(400, 'Select a valid request title (expense code).');
        if (!String(body.location || '').trim()) return jsonErr(400, 'Location is required.');
        if (!String(body.department || '').trim()) return jsonErr(400, 'Department is required.');
        if (String(body.businessJustification || '').trim().length < 10) {
          return jsonErr(400, 'Business justification must be at least 10 characters.');
        }
      }

      const employeeCode = String(body.beneficiaryCode || body.employeeCode || actor.actorCode || '').trim();
      const employeeName = String(body.beneficiaryName || body.employeeName || actor.actor || '').trim();

      const result = await createPaymentRequest({
        paymentType,
        title,
        purpose: expense?.description || body.purpose,
        expenseCode: expense?.expenseCode || expenseCode || undefined,
        businessJustification: body.businessJustification,
        beneficiaryCode: employeeCode,
        beneficiaryName: employeeName || (paymentType === 'Cash Advance Payment' ? actor.actor : ''),
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
        requesterCode: employeeCode || actor.actorCode,
        requesterName: employeeName || actor.actor,
        requesterJobTitle: body.requesterJobTitle || actor.jobTitle,
        supervisorName: body.supervisorName,
        requestCategory: body.requestCategory,
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
      if (treasuryActions.includes(transition) && !canOperateTreasury(actor)) {
        return jsonErr(403, 'Treasury actions require Treasury or Finance access.');
      }
      if (postingActions.includes(transition) && !canOperatePosting(actor)) {
        return jsonErr(403, 'Posting actions require Finance posting access.');
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
