import { NextRequest, NextResponse } from 'next/server';
import { readUsers } from '@/lib/auth/auth-store';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';
import {
  expectedOvertimeStatusForStage,
  overtimeStageLabel,
  sessionMatchesOvertimeToken,
} from '@/lib/overtime-approval-notification-service';
import {
  actOnOvertimeAuthorizationRequest,
  listOvertimeAuthorizationRequests,
  markOvertimeAuthorizationTokenUsed,
  readOvertimeAuthorizationToken,
} from '@/lib/overtime-approval-workflow-store';
import { overtimeAuthorizePageUrl } from '@/lib/leave-email-action-token';
import { resolvePublicAppOriginFromRequest, resolveWorkflowLinkOriginFromRequest } from '@/lib/public-app-url';

const ok = <T,>(data: T) => NextResponse.json({ status: 'success', data });
const err = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });

const cookieValue = (request: Request, name: string) => {
  const raw = request.headers.get('cookie') || '';
  for (const pair of raw.split(';')) {
    const [key, ...rest] = pair.split('=');
    if (String(key || '').trim() === name) return decodeURIComponent(rest.join('='));
  }
  return '';
};

const authorizeSession = async (request: Request, tokenRow: NonNullable<Awaited<ReturnType<typeof readOvertimeAuthorizationToken>>>) => {
  const session = await verifySessionToken(cookieValue(request, AUTH_COOKIE));
  if (!session) return { error: err(401, 'Authentication required. Sign in to approve or reject overtime.') };
  if (!session.isGlobalAdmin && !(await sessionMatchesOvertimeToken(session, tokenRow))) {
    return { error: err(403, 'This approval link is assigned to a different approver account.') };
  }
  return { session, isGlobalAdmin: Boolean(session.isGlobalAdmin) };
};

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token') || '';
    if (!token) return err(400, 'Approval token is required.');

    const accept = request.headers.get('accept') || '';
    if (accept.includes('text/html')) {
      return NextResponse.redirect(overtimeAuthorizePageUrl(token, resolvePublicAppOriginFromRequest(request)), 307);
    }

    const tokenRow = await readOvertimeAuthorizationToken(token);
    if (!tokenRow) return err(400, 'Approval link is invalid.');
    if (tokenRow.usedAt) return err(409, 'Approval link has already been used.');
    if (new Date(tokenRow.expiresAt).getTime() < Date.now()) {
      return err(400, 'Approval link has expired. Sign in to the overtime workspace to action this request.');
    }

    const requestItem = (await listOvertimeAuthorizationRequests()).find((item) => item.id === tokenRow.requestId);
    if (!requestItem) return err(404, 'Overtime authorization request not found for this approval link.');

    const session = await verifySessionToken(cookieValue(request, AUTH_COOKIE));
    const authenticated = Boolean(session);
    let authorized = false;
    if (session) {
      const auth = await authorizeSession(request, tokenRow);
      authorized = !auth.error;
    }

    const expectedStatus = expectedOvertimeStatusForStage(tokenRow.stage);
    const statusOk = requestItem.status === expectedStatus;

    return ok({
      authenticated,
      authorized,
      decision: tokenRow.decision,
      stage: tokenRow.stage,
      stageLabel: overtimeStageLabel(tokenRow.stage),
      projectCode: requestItem.projectCode,
      projectName: requestItem.projectName,
      workDate: requestItem.workDate,
      supervisorName: requestItem.supervisorName,
      requestedHours: requestItem.requestedHours,
      reason: requestItem.reason,
      status: requestItem.status,
      statusOk,
      requiresLogin: !authenticated,
      authorizeUrl: overtimeAuthorizePageUrl(token, resolvePublicAppOriginFromRequest(request)),
    });
  } catch (error) {
    return err(400, error instanceof Error ? error.message : 'Unable to validate overtime approval link.');
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const token = String(body.token || request.nextUrl.searchParams.get('token') || '').trim();
    const note = String(body.note || '').trim();
    if (!token) return err(400, 'Approval token is required.');

    const tokenRow = await readOvertimeAuthorizationToken(token);
    if (!tokenRow) return err(400, 'Approval link is invalid.');
    if (tokenRow.usedAt) return err(409, 'Approval link has already been used.');
    if (new Date(tokenRow.expiresAt).getTime() < Date.now()) {
      return err(400, 'Approval link has expired.');
    }

    const auth = await authorizeSession(request, tokenRow);
    if (auth.error) return auth.error;

    const requestItem = (await listOvertimeAuthorizationRequests()).find((item) => item.id === tokenRow.requestId);
    if (!requestItem) return err(404, 'Overtime authorization request not found.');

    if (!auth.isGlobalAdmin) {
      const expectedStatus = expectedOvertimeStatusForStage(tokenRow.stage);
      if (requestItem.status !== expectedStatus) {
        return err(409, 'This overtime authorization request has already moved to another approval stage.');
      }
    }

    const origin = resolveWorkflowLinkOriginFromRequest(request);
    const comment = note || `Actioned from authenticated email link (${tokenRow.decision}).`;
    const updated = await actOnOvertimeAuthorizationRequest(
      tokenRow.requestId,
      tokenRow.decision,
      tokenRow.recipientName,
      comment,
      origin,
    );
    await markOvertimeAuthorizationTokenUsed(token);

    return ok({
      decision: tokenRow.decision,
      status: updated.status,
      projectCode: updated.projectCode,
      workDate: updated.workDate,
    });
  } catch (error) {
    return err(
      error instanceof Error && /permission|cannot|blocked|requires|invalid|expired|authentication|approver|already|not found/i.test(error.message) ? 409 : 500,
      error instanceof Error ? error.message : 'Unable to complete overtime approval action.',
    );
  }
}
