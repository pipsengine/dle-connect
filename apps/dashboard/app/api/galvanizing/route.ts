import { NextResponse } from 'next/server';
import {
  canGalvanizingDispatch,
  canGalvanizingIntake,
  canGalvanizingInventory,
  canGalvanizingProduction,
  canGalvanizingQc,
  canGalvanizingRelease,
  canGalvanizingScrap,
  canViewGalvanizing,
  type GalvanizingActor,
} from '@/lib/galvanizing/access';
import { GalvanizingRuleError } from '@/lib/galvanizing/rules';
import {
  advanceGalvanizingStage,
  approveGalvanizingJob,
  approveGalvanizingReceiptQc,
  closeGalvanizingNcr,
  createGalvanizingBatch,
  createGalvanizingDispatch,
  createGalvanizingJob,
  createGalvanizingReceipt,
  galvanizingSnapshot,
  inspectGalvanizingBatch,
  inspectGalvanizingReceipt,
  linkGalvanizingReceipt,
  moveGalvanizingStock,
  approveGalvanizingWaybill,
  recordGalvanizingTare,
  updateGalvanizingDispatch,
  deleteGalvanizingMaterial,
  deleteGalvanizingRelease,
  revokeGalvanizingReleaseSign,
  saveGalvanizingMaterial,
  saveGalvanizingRelease,
  signGalvanizingRelease,
} from '@/lib/galvanizing/store';

export const dynamic = 'force-dynamic';

const actorFrom = (request: Request): GalvanizingActor => ({
  permissions: (request.headers.get('x-auth-permissions') || '').split(',').map((item) => item.trim()).filter(Boolean),
  roles: (request.headers.get('x-auth-roles') || '').split(',').map((item) => item.trim()).filter(Boolean),
  isGlobalAdmin: request.headers.get('x-auth-global-admin') === '1',
  name: request.headers.get('x-hris-actor') || request.headers.get('x-auth-user') || 'DLE Connect user',
});

const denied = () => NextResponse.json({ status: 'error', error: 'You do not have permission for that galvanizing action.' }, { status: 403 });

const respond = (result: { notice?: string; data: unknown }) =>
  NextResponse.json({ status: 'success', notice: result.notice || '', data: result.data });

export async function GET(request: Request) {
  const actor = actorFrom(request);
  if (!canViewGalvanizing(actor)) return denied();
  try {
    return respond({ data: await galvanizingSnapshot(actor) });
  } catch (error) {
    const status = error instanceof GalvanizingRuleError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Galvanizing Operations could not be loaded.';
    return NextResponse.json({ status: 'error', error: message }, { status });
  }
}

export async function POST(request: Request) {
  const actor = actorFrom(request);
  if (!canViewGalvanizing(actor)) return denied();
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ status: 'error', error: 'Request body is required.' }, { status: 400 });
  }
  const action = String((body as { action?: unknown }).action || '');
  const input = body as Record<string, unknown>;
  try {
    if (action === 'create-job' || action === 'create-receipt') {
      if (!canGalvanizingIntake(actor)) return denied();
      return respond(action === 'create-job' ? await createGalvanizingJob(actor, input) : await createGalvanizingReceipt(actor, input));
    }
    if (action === 'record-tare') {
      if (!canGalvanizingIntake(actor)) return denied();
      return respond(await recordGalvanizingTare(actor, input));
    }
    if (action === 'approve-waybill') {
      if (!canGalvanizingRelease(actor)) return denied();
      return respond(await approveGalvanizingWaybill(actor, input));
    }
    if (action === 'link-job') {
      if (!canGalvanizingIntake(actor)) return denied();
      return respond(await linkGalvanizingReceipt(actor, input));
    }
    if (action === 'inspect-receipt' || action === 'inspect-batch') {
      if (!canGalvanizingQc(actor)) return denied();
      return respond(action === 'inspect-receipt' ? await inspectGalvanizingReceipt(actor, input) : await inspectGalvanizingBatch(actor, input));
    }
    if (action === 'approve-receipt-qc') {
      if (!canGalvanizingQc(actor) && !canGalvanizingRelease(actor)) return denied();
      return respond(await approveGalvanizingReceiptQc(actor, input));
    }
    if (action === 'approve-job') {
      if (!canGalvanizingRelease(actor)) return denied();
      return respond(await approveGalvanizingJob(actor, input));
    }
    if (action === 'create-batch' || action === 'advance-stage') {
      if (!canGalvanizingProduction(actor)) return denied();
      return respond(action === 'create-batch' ? await createGalvanizingBatch(actor, input) : await advanceGalvanizingStage(actor, input));
    }
    if (action === 'close-ncr') {
      if (!canGalvanizingQc(actor) && !canGalvanizingScrap(actor)) return denied();
      return respond(await closeGalvanizingNcr(actor, input, canGalvanizingScrap(actor)));
    }
    if (action === 'move-stock') {
      if (!canGalvanizingInventory(actor)) return denied();
      return respond(await moveGalvanizingStock(actor, input));
    }
    if (action === 'create-dispatch') {
      if (!canGalvanizingDispatch(actor)) return denied();
      return respond(await createGalvanizingDispatch(actor, input));
    }
    if (action === 'update-dispatch') {
      const commercial = String(input.commercialCleared || '').toUpperCase() === 'YES';
      const gate = String(input.gateVerified || '').toUpperCase() === 'YES' || String(input.weightOk || '').toUpperCase() === 'NO';
      const pod = String(input.podRef || '').trim().length > 0;
      if (commercial && !canGalvanizingRelease(actor)) return denied();
      if ((gate || pod) && !canGalvanizingDispatch(actor)) return denied();
      if (!commercial && !gate && !pod && !canGalvanizingDispatch(actor) && !canGalvanizingRelease(actor)) return denied();
      return respond(await updateGalvanizingDispatch(actor, input));
    }
    if (action === 'save-release') {
      if (!canGalvanizingIntake(actor) && !canGalvanizingRelease(actor)) return denied();
      return respond(await saveGalvanizingRelease(actor, input));
    }
    if (action === 'sign-release') return respond(await signGalvanizingRelease(actor, input));
    if (action === 'revoke-release-sign') return respond(await revokeGalvanizingReleaseSign(actor, input));
    if (action === 'delete-release') {
      if (!canGalvanizingRelease(actor)) return denied();
      return respond(await deleteGalvanizingRelease(actor, input));
    }
    if (action === 'save-material') {
      if (!canGalvanizingIntake(actor) && !canGalvanizingRelease(actor)) return denied();
      return respond(await saveGalvanizingMaterial(actor, input));
    }
    if (action === 'delete-material') {
      if (!canGalvanizingIntake(actor) && !canGalvanizingRelease(actor)) return denied();
      return respond(await deleteGalvanizingMaterial(actor, input));
    }
    return NextResponse.json({ status: 'error', error: 'Unknown galvanizing action.' }, { status: 400 });
  } catch (error) {
    const status = error instanceof GalvanizingRuleError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Galvanizing action failed.';
    return NextResponse.json({ status: 'error', error: message }, { status });
  }
}
