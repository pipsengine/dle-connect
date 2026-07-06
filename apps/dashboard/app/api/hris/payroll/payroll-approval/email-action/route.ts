import { NextRequest, NextResponse } from 'next/server';
import { readUsers } from '@/lib/auth/auth-store';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { sessionMatchesPayrollToken } from '@/lib/payroll-approval-notification-service';
import {
  getCurrentPayrollApprovalStage,
  payrollStageActionForId,
} from '@/lib/payroll-approval-workflow';
import { verifyPayrollEmailActionToken } from '@/lib/payroll-email-action-token';
import { getPayrollRunForPeriod } from '@/lib/payroll-run-store';
import { roleFromSession } from '@/lib/payroll-session';
import { executePayrollWorkflowAction } from '@/lib/payroll-workflow-service';

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

const authorizeSession = async (request: Request, tokenPayload: ReturnType<typeof verifyPayrollEmailActionToken>) => {
  const session = await verifySessionToken(cookieValue(request, AUTH_COOKIE));
  if (!session) return { error: err(401, 'Authentication required. Sign in to approve or reject payroll.') };
  const sessionEmail = await resolveSessionEmail(session);
  const enriched = {
    ...tokenPayload,
    recipientEmail: tokenPayload.recipientEmail || sessionEmail,
    recipientUsername: tokenPayload.recipientUsername || session.username,
  };
  if (!session.isGlobalAdmin && !(await sessionMatchesPayrollToken(session, enriched))) {
    return { error: err(403, 'This approval link is assigned to a different approver account.') };
  }
  const role = roleFromSession(session);
  return { session, role, actor: session.fullName || session.username, isGlobalAdmin: Boolean(session.isGlobalAdmin) };
};

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token') || '';
    if (!token) return err(400, 'Approval token is required.');
    const payload = verifyPayrollEmailActionToken(token);
    const run = await getPayrollRunForPeriod(payload.period);
    if (!run || run.id !== payload.runId) return err(404, 'Payroll run not found for this approval link.');

    const session = await verifySessionToken(cookieValue(request, AUTH_COOKIE));
    const authenticated = Boolean(session);
    let authorized = false;
    if (session) {
      const auth = await authorizeSession(request, payload);
      authorized = !auth.error;
    }

    const stageAction = payrollStageActionForId(payload.stageId);
    const workflowAction = payload.decision === 'approve' ? stageAction : 'reject-run';

    return ok({
      authenticated,
      authorized,
      tokenValid: true,
      decision: payload.decision,
      stageId: payload.stageId,
      workflowAction,
      period: run.period,
      periodLabel: run.periodLabel,
      status: run.status,
      employeeCount: run.employeeCount,
      grossPay: run.grossPay,
      netPay: run.netPay,
      employerCost: run.employerCost,
      requiresLogin: !authenticated,
    });
  } catch (error) {
    return err(400, error instanceof Error ? error.message : 'Unable to validate payroll approval link.');
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const token = String(body.token || request.nextUrl.searchParams.get('token') || '').trim();
    const note = String(body.note || '').trim();
    if (!token) return err(400, 'Approval token is required.');

    const payload = verifyPayrollEmailActionToken(token);
    const auth = await authorizeSession(request, payload);
    if (auth.error) return auth.error;

    const run = await getPayrollRunForPeriod(payload.period);
    if (!run || run.id !== payload.runId) return err(404, 'Payroll run not found.');

    const activeStage = getCurrentPayrollApprovalStage(run);
    if (!auth.isGlobalAdmin && activeStage?.id !== payload.stageId) {
      return err(409, 'This payroll approval stage has already been actioned or is no longer active.');
    }

    const stageAction = payrollStageActionForId(payload.stageId);
    const workflowAction = payload.decision === 'approve' ? stageAction : 'reject-run';
    if (!workflowAction) return err(400, 'Unsupported approval stage.');

    const origin = new URL(request.url).origin;
    const result = await executePayrollWorkflowAction({
      action: workflowAction,
      period: payload.period,
      actor: auth.actor!,
      role: auth.role!,
      comment: note || `Actioned from authenticated email link (${payload.decision}).`,
      reason: payload.decision === 'reject' ? (note || 'Rejected from email approval link.') : undefined,
      ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      isGlobalAdmin: auth.isGlobalAdmin,
      baseUrl: origin,
    });

    return ok({
      decision: payload.decision,
      status: result.run.status,
      period: result.run.period,
      periodLabel: result.run.periodLabel,
    });
  } catch (error) {
    return err(
      error instanceof Error && /permission|cannot|blocked|requires|invalid|expired|authentication|approver/i.test(error.message) ? 409 : 500,
      error instanceof Error ? error.message : 'Unable to complete payroll approval action.',
    );
  }
}
