import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { permissionsForRoles } from '@/lib/auth/rbac';
import {
  canAccessPaymentRequest,
  canDownloadPaymentDocumentPdf,
} from '@/lib/finance-intelligence/payment-access';
import { buildPaymentRequestDocumentPdf } from '@/lib/finance-intelligence/payment-request-pdf';
import {
  getPaymentRequestById,
  listPaymentRequestActions,
  repairPrematureTreasuryHandoff,
} from '@/lib/finance-intelligence/payment-requests-service';

const jsonErr = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });

const resolveActor = async () => {
  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;
  const roles = session?.roles || [];
  const permissions = session?.isGlobalAdmin ? ['*'] : permissionsForRoles(roles);
  return {
    actorCode: session?.employeeCode || session?.username || session?.sub || '',
    roles,
    permissions,
    isGlobalAdmin: Boolean(session?.isGlobalAdmin),
    authenticated: Boolean(session),
  };
};

/** GET /api/finance/payment-requests/pdf?requestId=... */
export async function GET(request: Request) {
  try {
    const actor = await resolveActor();
    if (!actor.authenticated) return jsonErr(401, 'Sign in required.');

    const requestId = new URL(request.url).searchParams.get('requestId') || '';
    if (!requestId.trim()) return jsonErr(400, 'requestId is required.');

    let paymentRequest = await getPaymentRequestById(requestId.trim());
    if (!paymentRequest) return jsonErr(404, 'Payment request not found.');
    paymentRequest = await repairPrematureTreasuryHandoff(paymentRequest);

    const actions = await listPaymentRequestActions(paymentRequest.requestId);
    if (!canAccessPaymentRequest(actor, paymentRequest, {
      priorActorCodes: actions.map((item) => item.actorCode),
    })) {
      return jsonErr(403, 'You do not have access to this payment request.');
    }
    if (!canDownloadPaymentDocumentPdf(paymentRequest)) {
      return jsonErr(409, 'PDF download is available after the payment is fully approved.');
    }
    const pdf = await buildPaymentRequestDocumentPdf(paymentRequest, actions);
    const fileName = `${paymentRequest.requestNumber || paymentRequest.requestId}-payment-document.pdf`;

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return jsonErr(500, error instanceof Error ? error.message : 'Unable to generate payment PDF.');
  }
}
