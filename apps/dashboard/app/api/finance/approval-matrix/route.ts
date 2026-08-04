import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';
import {
  buildApprovalMatrixWorkspace,
  deleteApprovalMatrixRule,
  upsertApprovalMatrixRule,
  type ApprovalPathType,
  type ApprovalRuleStatus,
} from '@/lib/finance-intelligence/approval-matrix-service';

const jsonOk = <T,>(data: T) => NextResponse.json({ status: 'success', data });
const jsonErr = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });

const resolveActor = async () => {
  const jar = await cookies();
  const token = jar.get(AUTH_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;
  return session?.fullName || session?.username || session?.sub || 'Finance User';
};

const parseStages = (body: Record<string, unknown>) => {
  if (Array.isArray(body.stages)) {
    return body.stages.map((item) => String(item || '').trim()).filter(Boolean);
  }
  const roles = String(body.approverRoles || '').trim();
  if (!roles) return [];
  return roles.split(/→|,/).map((item) => item.trim()).filter(Boolean);
};

export async function GET() {
  try {
    return jsonOk(await buildApprovalMatrixWorkspace());
  } catch (error) {
    return jsonErr(500, error instanceof Error ? error.message : 'Unable to load approval matrix.');
  }
}

export async function POST(request: Request) {
  try {
    const actor = await resolveActor();
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || 'upsert').trim();

    if (action === 'upsert') {
      const stages = parseStages(body);
      const pathType = (/project/i.test(String(body.pathType || '')) ? 'Project' : 'Non-project') as ApprovalPathType;
      const result = await upsertApprovalMatrixRule({
        matrixId: body.matrixId,
        ruleName: body.ruleName,
        pathType,
        paymentType: 'Employee Payment',
        companyCode: body.companyCode,
        entityName: body.entityName,
        minAmount: Number(body.minAmount || 0),
        maxAmount: body.maxAmount === '' || body.maxAmount == null ? null : Number(body.maxAmount),
        approvalLevel: Number(body.approvalLevel || stages.length || 1),
        approverRoles: stages.join(' → ') || body.approverRoles,
        currencyCode: 'NGN',
        dualControl: Boolean(body.dualControl),
        status: (body.status || 'Active') as ApprovalRuleStatus,
        stages,
        actor,
      });
      return jsonOk({ ...result, message: body.matrixId ? 'Approval limit updated.' : 'Approval limit created.' });
    }

    if (action === 'delete') {
      const matrixId = String(body.matrixId || '').trim();
      if (!matrixId) return jsonErr(400, 'matrixId is required.');
      const result = await deleteApprovalMatrixRule({ matrixId, actor });
      return jsonOk({ ...result, message: 'Approval limit deleted.' });
    }

    return jsonErr(400, 'Unsupported approval matrix action.');
  } catch (error) {
    return jsonErr(400, error instanceof Error ? error.message : 'Unable to save approval matrix.');
  }
}
