import { NextRequest, NextResponse } from 'next/server';
import { readUsers } from '@/lib/auth/auth-store';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { sessionMatchesLeaveToken } from '@/lib/leave-approval-notification-service';
import { verifyLeaveEmailActionToken } from '@/lib/leave-email-action-token';
import { readAllEssRequests, transitionEssLeaveRequest } from '@/lib/leave-workflow-service';
import { readPayrollEmployees } from '@/lib/payroll-employee-source';
import { resolvePublicAppOriginFromRequest } from '@/lib/public-app-url';

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

const resolveSessionEmail = async (session: NonNullable<Awaited<ReturnType<typeof verifySessionToken>>>) => {
  const users = await readUsers();
  const user = users.find((item) => item.id === session.sub || item.username === session.username);
  return String(user?.email || session.username || '').trim().toLowerCase();
};

const actorForEmail = async (email: string) => {
  const { employees } = await readPayrollEmployees();
  const target = String(email || '').trim().toLowerCase();
  return employees.find((employee) =>
    [employee.officialEmail, employee.email, employee.personalEmail].map((value) => String(value || '').trim().toLowerCase()).includes(target),
  ) || null;
};

const authorizeSession = async (request: Request, tokenPayload: ReturnType<typeof verifyLeaveEmailActionToken>) => {
  const session = await verifySessionToken(cookieValue(request, AUTH_COOKIE));
  if (!session) return { error: err(401, 'Authentication required. Sign in to approve or reject leave.') };
  const sessionEmail = await resolveSessionEmail(session);
  const enriched = {
    ...tokenPayload,
    recipientEmail: tokenPayload.recipientEmail || sessionEmail,
    recipientUsername: tokenPayload.recipientUsername || session.username,
  };
  if (!session.isGlobalAdmin && !(await sessionMatchesLeaveToken(session, enriched))) {
    return { error: err(403, 'This approval link is assigned to a different approver account.') };
  }
  return { session, isGlobalAdmin: Boolean(session.isGlobalAdmin) };
};

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token') || '';
    if (!token) return err(400, 'Approval token is required.');
    const payload = verifyLeaveEmailActionToken(token);
    const leaveRequest = (await readAllEssRequests()).find((item) => item.id === payload.requestId);
    if (!leaveRequest) return err(404, 'Leave request not found for this approval link.');

    const session = await verifySessionToken(cookieValue(request, AUTH_COOKIE));
    const authenticated = Boolean(session);
    let authorized = false;
    if (session) {
      const auth = await authorizeSession(request, payload);
      authorized = !auth.error;
    }

    const stageLabel = payload.approverKind === 'hr' ? 'HR Manager / Head' : 'Line Manager / Supervisor';
    const statusOk = payload.approverKind === 'hr'
      ? leaveRequest.status === 'HR Review'
      : leaveRequest.status === 'Line Manager Review';

    return ok({
      authenticated,
      authorized,
      decision: payload.decision,
      approverKind: payload.approverKind,
      stageLabel,
      leaveType: leaveRequest.leaveType,
      employeeName: leaveRequest.title,
      startDate: leaveRequest.startDate,
      endDate: leaveRequest.endDate,
      days: leaveRequest.days,
      relieverName: leaveRequest.relieverName,
      status: leaveRequest.status,
      statusOk,
      requiresLogin: !authenticated,
    });
  } catch (error) {
    return err(400, error instanceof Error ? error.message : 'Unable to validate leave approval link.');
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const token = String(body.token || request.nextUrl.searchParams.get('token') || '').trim();
    const note = String(body.note || '').trim();
    if (!token) return err(400, 'Approval token is required.');

    const payload = verifyLeaveEmailActionToken(token);
    const auth = await authorizeSession(request, payload);
    if (auth.error) return auth.error;

    const leaveRequest = (await readAllEssRequests()).find((item) => item.id === payload.requestId);
    if (!leaveRequest) return err(404, 'Leave request not found.');

    if (!auth.isGlobalAdmin) {
      if (payload.approverKind === 'line-manager' && leaveRequest.status !== 'Line Manager Review') {
        return err(409, 'This leave request is no longer awaiting line manager approval.');
      }
      if (payload.approverKind === 'hr' && leaveRequest.status !== 'HR Review') {
        return err(409, 'This leave request is no longer awaiting HR approval.');
      }
    }

    const actor = await actorForEmail(payload.recipientEmail);
    if (!actor) return err(403, 'Approver employee record not found.');

    const result = await transitionEssLeaveRequest({
      requestId: payload.requestId,
      action: payload.decision,
      actorName: actor.fullName,
      actor,
      roles: payload.approverKind === 'hr' ? ['HR Manager'] : ['Line Manager'],
      comment: note || `Actioned from authenticated email link (${payload.decision}).`,
      emailAction: true,
      approverKind: payload.approverKind,
      isGlobalAdmin: auth.isGlobalAdmin,
      baseUrl: resolvePublicAppOriginFromRequest(request),
    });

    return ok({
      decision: payload.decision,
      status: result.request.status,
      leaveType: result.request.leaveType,
    });
  } catch (error) {
    return err(
      error instanceof Error && /permission|cannot|blocked|requires|invalid|expired|authentication|approver|not found|already/i.test(error.message) ? 409 : 500,
      error instanceof Error ? error.message : 'Unable to complete leave approval action.',
    );
  }
}
