import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { permissionsForRoles } from '@/lib/auth/rbac';
import {
  appendPaymentRequestAttachments,
  getPaymentRequestById,
  listPaymentRequestActions,
  normalizePaymentAttachmentUpload,
  PAYMENT_ATTACHMENT_MAX_BYTES,
  PAYMENT_ATTACHMENT_MAX_FILES,
  readPaymentAttachmentFile,
  savePaymentAttachmentFile,
} from '@/lib/finance-intelligence/payment-requests-service';
import { canAccessPaymentRequest } from '@/lib/finance-intelligence/payment-access';

const jsonOk = <T,>(data: T) => NextResponse.json({ status: 'success', data });
const jsonErr = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });

const resolveActor = async () => {
  const jar = await cookies();
  const token = jar.get(AUTH_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;
  const roles = session?.roles || [];
  const permissions = session?.isGlobalAdmin ? ['*'] : permissionsForRoles(roles);
  return {
    actor: session?.fullName || session?.username || session?.sub || 'Finance User',
    actorCode: session?.employeeCode || session?.username || session?.sub || '',
    permissions,
    roles,
    isGlobalAdmin: Boolean(session?.isGlobalAdmin),
    authenticated: Boolean(session),
  };
};

export async function GET(request: Request) {
  try {
    const actor = await resolveActor();
    if (!actor.authenticated) return jsonErr(401, 'Sign in required.');
    const { searchParams } = new URL(request.url);
    const requestId = String(searchParams.get('requestId') || '').trim();
    const fileName = String(searchParams.get('fileName') || '').trim();
    if (!requestId || !fileName) return jsonErr(400, 'requestId and fileName are required.');

    const paymentRequest = await getPaymentRequestById(requestId);
    if (!paymentRequest) return jsonErr(404, 'Payment request not found.');
    const actions = await listPaymentRequestActions(requestId);
    if (!canAccessPaymentRequest(actor, paymentRequest, {
      priorActorCodes: actions.map((item) => item.actorCode),
    })) {
      return jsonErr(403, 'You do not have access to this payment request attachment.');
    }

    const attachment = (paymentRequest.attachments || []).find((item) =>
      item.fileName === fileName || item.originalName === fileName || item.id === fileName);
    const storedName = attachment?.fileName || fileName;
    const { bytes } = await readPaymentAttachmentFile(requestId, storedName);
    const downloadName = attachment?.originalName || storedName;

    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'content-type': attachment?.mimeType || 'application/octet-stream',
        'content-disposition': `attachment; filename="${downloadName.replace(/"/g, '')}"`,
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    return jsonErr(500, error instanceof Error ? error.message : 'Unable to download attachment.');
  }
}

export async function POST(request: Request) {
  try {
    const actor = await resolveActor();
    if (!actor.authenticated) return jsonErr(401, 'Sign in required.');

    const form = await request.formData();
    const requestId = String(form.get('requestId') || '').trim();
    if (!requestId) return jsonErr(400, 'requestId is required.');

    const paymentRequest = await getPaymentRequestById(requestId);
    if (!paymentRequest) return jsonErr(404, 'Payment request not found.');
    const actions = await listPaymentRequestActions(requestId);
    if (!canAccessPaymentRequest(actor, paymentRequest, {
      priorActorCodes: actions.map((item) => item.actorCode),
    })) {
      return jsonErr(403, 'You do not have access to upload attachments for this request.');
    }

    const files = form.getAll('file').filter((item): item is File => item instanceof File);
    if (!files.length) return jsonErr(400, 'At least one file is required.');
    if ((paymentRequest.attachments?.length || 0) + files.length > PAYMENT_ATTACHMENT_MAX_FILES) {
      return jsonErr(400, `You can attach up to ${PAYMENT_ATTACHMENT_MAX_FILES} supporting documents.`);
    }

    const saved = [];
    for (const file of files) {
      if (file.size > PAYMENT_ATTACHMENT_MAX_BYTES) {
        return jsonErr(400, `${file.name} exceeds the 8 MB limit.`);
      }
      const bytes = Buffer.from(await file.arrayBuffer());
      const prepared = normalizePaymentAttachmentUpload({
        fileName: file.name || 'attachment.bin',
        mimeType: file.type,
        contentBase64: bytes.toString('base64'),
        uploadedBy: actor.actor,
      });
      await savePaymentAttachmentFile(requestId, prepared.meta.fileName, prepared.bytes);
      saved.push(prepared.meta);
    }

    const attachments = await appendPaymentRequestAttachments(requestId, saved);
    return jsonOk({ requestId, attachments, message: `${saved.length} supporting document(s) uploaded.` });
  } catch (error) {
    return jsonErr(400, error instanceof Error ? error.message : 'Unable to upload attachment.');
  }
}
