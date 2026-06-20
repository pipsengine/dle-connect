import { NextResponse } from 'next/server';
import { appendOrganizationAuditEvent } from '@/lib/organization-audit-store';
import { getUiPermissions, hasPermission, resolveAccessContext } from '@/lib/hris-access';
import {
  readWorkforcePlanningData,
  readWorkforcePlanningRequests,
  writeWorkforcePlanningRequests,
  type WorkforcePlanRecord,
  type WorkforcePlanningRequestRecord,
  type WorkforceRequestStatus,
  type WorkforceRequestType,
} from '@/lib/workforce-planning-store';

type CreateWorkforceRequestPayload = {
  planId?: string;
  requestType?: WorkforceRequestType;
  requestedFte?: number;
  targetQuarter?: string;
  requestedBy?: string;
  justification?: string;
};

type UpdateWorkforceRequestPayload = {
  requestId?: string;
  status?: WorkforceRequestStatus;
};

const ok = <T,>(data: T) => NextResponse.json({ status: 'success', data });
const err = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });

const round1 = (value: number) => Math.round(value * 10) / 10;
const isNonEmpty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const asNumber = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : Number.NaN);

const buildProjection = (plan: WorkforcePlanRecord, requestType: WorkforceRequestType, requestedFte: number) => {
  const averageRoleCost = plan.filledFte ? plan.payrollRunRateNgn / Math.max(plan.filledFte, 1) : 0;

  if (requestType === 'Add Headcount') {
    const projectedApprovedFte = round1(plan.approvedFte + requestedFte);
    const projectedFilledFte = round1(plan.filledFte + requestedFte);
    const projectedGapFte = round1(Math.max(projectedApprovedFte - projectedFilledFte, 0));
    return {
      projectedApprovedFte,
      projectedFilledFte,
      projectedGapFte,
      incrementalBudgetNgn: Math.round(averageRoleCost * requestedFte),
      impactSummary: `Adds ${requestedFte} FTE to the approved workforce plan and lifts target filled capacity to ${projectedFilledFte} FTE when completed.`,
    };
  }

  if (requestType === 'Backfill Gap') {
    const projectedApprovedFte = plan.approvedFte;
    const projectedFilledFte = round1(Math.min(plan.approvedFte, plan.filledFte + requestedFte));
    const projectedGapFte = round1(Math.max(plan.openDemandFte - requestedFte, 0));
    return {
      projectedApprovedFte,
      projectedFilledFte,
      projectedGapFte,
      incrementalBudgetNgn: Math.round(averageRoleCost * requestedFte),
      impactSummary: `Backfills up to ${requestedFte} FTE from the current review/demand exposure and reduces unresolved demand to ${projectedGapFte} FTE.`,
    };
  }

  if (requestType === 'Temporary Coverage') {
    const projectedApprovedFte = plan.approvedFte;
    const projectedFilledFte = round1(Math.min(plan.approvedFte, plan.filledFte + requestedFte));
    const projectedGapFte = round1(Math.max(plan.openDemandFte - requestedFte, 0));
    return {
      projectedApprovedFte,
      projectedFilledFte,
      projectedGapFte,
      incrementalBudgetNgn: Math.round(averageRoleCost * requestedFte * 0.6),
      impactSummary: `Introduces temporary cover for ${requestedFte} FTE and reduces short-term operational risk while permanent action is completed.`,
    };
  }

  return {
    projectedApprovedFte: plan.approvedFte,
    projectedFilledFte: plan.filledFte,
    projectedGapFte: plan.openDemandFte,
    incrementalBudgetNgn: 0,
    impactSummary: 'Triggers a structure review without changing approved FTE until redesign decisions are approved.',
  };
};

const buildPayload = async (request: Request) => {
  const access = resolveAccessContext(request);
  const uiPermissions = getUiPermissions(access);
  const planning = await readWorkforcePlanningData();
  const requests = (await readWorkforcePlanningRequests()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const requestedFte = round1(requests.reduce((sum, item) => sum + item.requestedFte, 0));

  return {
    ...planning,
    generatedAt: new Date().toISOString(),
    permissions: {
      actor: uiPermissions.actor,
      role: uiPermissions.role,
      canEdit: uiPermissions.canEditWorkforce,
      canExport: true,
      canViewCosts: true,
      canViewAudit: uiPermissions.canViewAudit,
    },
    summary: {
      ...planning.summary,
      pendingRequests: requests.filter((item) => item.status === 'Submitted' || item.status === 'Under Review').length,
      requestedFte,
    },
    requests,
  };
};

const validateRequest = (payload: CreateWorkforceRequestPayload, plans: WorkforcePlanRecord[]) => {
  const requestTypes: WorkforceRequestType[] = ['Add Headcount', 'Backfill Gap', 'Temporary Coverage', 'Structure Review'];

  if (!isNonEmpty(payload.planId)) return 'A workforce segment is required.';
  if (!payload.requestType || !requestTypes.includes(payload.requestType)) return 'A valid request type is required.';
  if (!isNonEmpty(payload.targetQuarter)) return 'Target quarter is required.';
  if (!isNonEmpty(payload.requestedBy)) return 'Requested by is required.';
  if (!isNonEmpty(payload.justification)) return 'Justification is required.';

  const requestedFte = asNumber(payload.requestedFte);
  if (Number.isNaN(requestedFte) || requestedFte <= 0) return 'Requested FTE must be greater than zero.';
  if (requestedFte > 25) return 'Requested FTE must be 25 or less for a single request.';
  if (!plans.some((plan) => plan.id === payload.planId)) return 'The selected workforce segment could not be found.';

  return null;
};

const validateStatusUpdate = (payload: UpdateWorkforceRequestPayload, requests: WorkforcePlanningRequestRecord[]) => {
  const allowedStatuses: WorkforceRequestStatus[] = ['Submitted', 'Under Review', 'Approved', 'Declined'];

  if (!isNonEmpty(payload.requestId)) return 'A workforce request is required.';
  if (!payload.status || !allowedStatuses.includes(payload.status)) return 'A valid request status is required.';

  const existing = requests.find((request) => request.id === payload.requestId);
  if (!existing) return 'The selected workforce request could not be found.';

  const transitions: Record<WorkforceRequestStatus, WorkforceRequestStatus[]> = {
    Submitted: ['Under Review', 'Approved', 'Declined'],
    'Under Review': ['Approved', 'Declined'],
    Approved: [],
    Declined: ['Under Review'],
  };

  if (existing.status === payload.status) return 'The request is already in the selected status.';
  if (!transitions[existing.status].includes(payload.status)) {
    return `Requests in ${existing.status} status cannot move directly to ${payload.status}.`;
  }

  return null;
};

export async function GET(request: Request) {
  try {
    return ok(await buildPayload(request));
  } catch (error) {
    return err(500, error instanceof Error ? error.message : 'Unable to load workforce planning.');
  }
}

export async function POST(request: Request) {
  const access = resolveAccessContext(request);
  if (!hasPermission(access, 'workforce.manage')) return err(403, 'You do not have permission to submit workforce requests.');

  const actor = access.actor;
  const current = await buildPayload(request);
  const payload = (await request.json()) as CreateWorkforceRequestPayload;
  const validationError = validateRequest(payload, current.plans);
  if (validationError) return err(400, validationError);

  const plan = current.plans.find((item) => item.id === payload.planId)!;
  const projection = buildProjection(plan, payload.requestType!, Number(payload.requestedFte));
  const existing = await readWorkforcePlanningRequests();
  const record: WorkforcePlanningRequestRecord = {
    id: `wfpr-${Date.now()}`,
    planId: plan.id,
    businessUnit: plan.businessUnit,
    department: plan.department,
    location: plan.location,
    requestType: payload.requestType!,
    requestedFte: round1(Number(payload.requestedFte)),
    targetQuarter: payload.targetQuarter!.trim(),
    requestedBy: payload.requestedBy!.trim(),
    justification: payload.justification!.trim(),
    impactSummary: projection.impactSummary,
    projectedApprovedFte: projection.projectedApprovedFte,
    projectedFilledFte: projection.projectedFilledFte,
    projectedGapFte: projection.projectedGapFte,
    incrementalBudgetNgn: projection.incrementalBudgetNgn,
    status: 'Submitted',
    createdAt: new Date().toISOString(),
  };

  const next = [record, ...existing].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  await writeWorkforcePlanningRequests(next);
  await appendOrganizationAuditEvent({
    module: 'workforce-planning',
    entityType: 'workforce-request',
    entityId: record.id,
    action: 'WORKFORCE_REQUEST_CREATED',
    actor,
    summary: `${actor} submitted a ${record.requestType} request for ${record.department}.`,
    before: null,
    after: record as unknown as Record<string, unknown>,
  });
  return ok(record);
}

export async function PATCH(request: Request) {
  const access = resolveAccessContext(request);
  if (!hasPermission(access, 'workforce.manage')) return err(403, 'You do not have permission to update workforce requests.');

  const actor = access.actor;
  const payload = (await request.json()) as UpdateWorkforceRequestPayload;
  const existing = await readWorkforcePlanningRequests();
  const validationError = validateStatusUpdate(payload, existing);
  if (validationError) return err(400, validationError);

  const targetRequestId = payload.requestId!;
  const previousRecord = existing.find((item) => item.id === payload.requestId) || null;
  const next = existing.map((item) => {
    if (item.id !== payload.requestId) return item;
    return { ...item, status: payload.status!, updatedAt: new Date().toISOString() };
  });

  const updatedRecord = next.find((item) => item.id === targetRequestId) || null;
  await writeWorkforcePlanningRequests(next);
  if (updatedRecord && previousRecord) {
    await appendOrganizationAuditEvent({
      module: 'workforce-planning',
      entityType: 'workforce-request',
      entityId: updatedRecord.id,
      action: 'WORKFORCE_REQUEST_STATUS_UPDATED',
      actor,
      summary: `${actor} moved workforce request ${updatedRecord.id} from ${previousRecord.status} to ${updatedRecord.status}.`,
      before: previousRecord as unknown as Record<string, unknown>,
      after: updatedRecord as unknown as Record<string, unknown>,
    });
  }
  return ok(updatedRecord);
}
