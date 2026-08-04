import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';
import {
  buildPaymentRequestsWorkspace,
  createPaymentRequest,
  PAYMENT_TYPES,
  transitionPaymentRequest,
  type PaymentRequestType,
} from '@/lib/finance-intelligence/payment-requests-service';

const jsonOk = <T,>(data: T) => NextResponse.json({ status: 'success', data });
const jsonErr = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });

const resolveActor = async () => {
  const jar = await cookies();
  const token = jar.get(AUTH_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;
  return {
    actor: session?.fullName || session?.username || session?.sub || 'Finance User',
    actorCode: session?.employeeCode || session?.username || session?.sub || '',
    department: session?.department || '',
    jobTitle: '',
  };
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const paymentType = searchParams.get('paymentType') || undefined;
    const actor = await resolveActor();
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
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || 'create').trim();

    if (action === 'create') {
      const paymentType = String(body.paymentType || '').trim() as PaymentRequestType;
      if (!PAYMENT_TYPES.includes(paymentType)) {
        return jsonErr(400, 'Only Cash Advance Payment and Supplier Invoice Payment are enabled.');
      }
      const result = await createPaymentRequest({
        paymentType,
        title: body.title,
        purpose: body.purpose,
        businessJustification: body.businessJustification,
        beneficiaryCode: body.beneficiaryCode,
        beneficiaryName: body.beneficiaryName || (paymentType === 'Cash Advance Payment' ? actor.actor : ''),
        beneficiaryBankSummary: body.beneficiaryBankSummary,
        description: body.description,
        amount: Number(body.amount || 0),
        currencyCode: body.currencyCode,
        companyCode: body.companyCode,
        department: body.department || actor.department,
        costCentre: body.costCentre,
        projectCode: body.projectCode,
        priority: body.priority,
        requiredDate: body.requiredDate,
        requesterCode: actor.actorCode,
        requesterName: actor.actor,
        requesterJobTitle: actor.jobTitle,
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
        overrideOutstandingAdvance: Boolean(body.overrideOutstandingAdvance),
        overrideReason: body.overrideReason,
        submit: body.submit !== false,
        actor: actor.actor,
      });
      return jsonOk({
        ...result,
        message: result.request?.status === 'Draft' ? 'Draft saved.' : 'Payment request submitted.',
      });
    }

    if (action === 'transition') {
      const requestId = String(body.requestId || '').trim();
      if (!requestId) return jsonErr(400, 'requestId is required.');
      const result = await transitionPaymentRequest({
        requestId,
        action: body.transition,
        actor: actor.actor,
        actorCode: actor.actorCode,
        comment: body.comment,
        reason: body.reason,
        paymentReference: body.paymentReference,
      });
      return jsonOk({ ...result, message: 'Payment request updated.' });
    }

    return jsonErr(400, 'Unsupported payment request action.');
  } catch (error) {
    return jsonErr(400, error instanceof Error ? error.message : 'Unable to save payment request.');
  }
}
