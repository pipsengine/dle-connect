import { NextRequest, NextResponse } from 'next/server';
import { readPayrollEmployees } from '@/lib/payroll-employee-source';
import { verifyLeaveEmailActionToken, leavePortalUrl } from '@/lib/leave-email-action-token';
import { readAllEssRequests, transitionEssLeaveRequest } from '@/lib/leave-workflow-service';

const html = (title: string, body: string, status = 200) => new NextResponse(`<!doctype html>
<html>
  <head><meta charset="utf-8"><title>${title}</title></head>
  <body style="font-family:Arial,sans-serif;margin:40px;color:#0f172a;line-height:1.5">
    <h1 style="font-size:24px">${title}</h1>
    <p>${body}</p>
    <p><a href="${leavePortalUrl()}" style="color:#2563eb;font-weight:700">Open Leave in Employee Self-Service</a></p>
  </body>
</html>`, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });

const compact = (value: unknown) => String(value || '').trim().toLowerCase();

const actorForEmail = (email: string, employees: Awaited<ReturnType<typeof readPayrollEmployees>>['employees']) => {
  const target = compact(email);
  return employees.find((employee) => {
    const addresses = [employee.officialEmail, employee.email, employee.personalEmail].map(compact).filter(Boolean);
    return addresses.includes(target);
  }) || null;
};

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token') || '';
    if (!token) return html('Invalid leave approval link', 'The approval token is missing.', 400);
    const payload = verifyLeaveEmailActionToken(token);
    const leaveRequest = (await readAllEssRequests()).find((item) => item.id === payload.requestId);
    if (!leaveRequest) return html('Leave request not found', 'This leave request could not be found.', 404);
    if (payload.approverKind === 'line-manager' && leaveRequest.status !== 'Line Manager Review') {
      return html('Leave request already actioned', `This request is no longer awaiting line manager approval (current status: ${leaveRequest.status}).`, 409);
    }
    if (payload.approverKind === 'hr' && leaveRequest.status !== 'HR Review') {
      return html('Leave request already actioned', `This request is no longer awaiting HR approval (current status: ${leaveRequest.status}).`, 409);
    }
    const { employees } = await readPayrollEmployees();
    const actor = actorForEmail(payload.recipientEmail, employees);
    if (!actor) return html('Approver not found', 'No employee record matches this approval link recipient.', 403);

    const result = await transitionEssLeaveRequest({
      requestId: payload.requestId,
      action: payload.decision,
      actorName: actor.fullName,
      actor,
      roles: payload.approverKind === 'hr' ? ['HR Manager'] : ['Line Manager'],
      comment: `Actioned from email link (${payload.decision}).`,
      emailAction: true,
      approverKind: payload.approverKind,
      baseUrl: new URL(request.url).origin,
    });

    const label = payload.decision === 'approve' ? 'approved' : 'rejected';
    return html(
      `Leave request ${label}`,
      `${result.request.title || result.request.leaveType || 'Leave request'} is now <strong>${result.request.status}</strong>.`,
    );
  } catch (error) {
    return html(
      'Leave request could not be updated',
      error instanceof Error ? error.message : 'The approval link could not be processed.',
      400,
    );
  }
}
