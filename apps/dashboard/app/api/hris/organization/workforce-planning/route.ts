import { NextResponse } from 'next/server';
import type { HealthStatus, PositionRecord, StructureInsight } from '@/lib/organization-data';
import { readPositions } from '@/lib/positions-store';
import {
  readWorkforcePlanningRequests,
  writeWorkforcePlanningRequests,
  type WorkforcePlanningRequestRecord,
  type WorkforceRequestStatus,
  type WorkforceRequestType,
} from '@/lib/workforce-planning-store';

type WorkforcePlanningRole = {
  id: string;
  code: string;
  title: string;
  gradeCode: string;
  positionType: PositionRecord['positionType'];
  positionStatus: PositionRecord['positionStatus'];
  criticality: PositionRecord['criticality'];
  replacementPriority: PositionRecord['replacementPriority'];
  incumbentName: string | null;
  openDays: number;
  fte: number;
  benchmarkSalaryUsd: number;
  healthStatus: HealthStatus;
};

type WorkforcePlanRecord = {
  id: string;
  businessUnit: string;
  department: string;
  location: string;
  approvedPositions: number;
  approvedFte: number;
  filledFte: number;
  openDemandFte: number;
  vacantFte: number;
  frozenFte: number;
  reviewFte: number;
  vacancyRatePct: number;
  criticalPositions: number;
  criticalGapRoles: number;
  immediateBackfills: number;
  averageOpenDays: number;
  successionCoveragePct: number;
  attritionRiskPct: number;
  approvalCoveragePct: number;
  payrollRunRateUsd: number;
  openBudgetUsd: number;
  standardizationPct: number;
  healthStatus: HealthStatus;
  planningPriority: 'Immediate' | 'Planned' | 'Monitor';
  topRisks: string[];
  recommendedAction: string;
  roles: WorkforcePlanningRole[];
};

type WorkforcePlanningPayload = {
  generatedAt: string;
  permissions: {
    canEdit: boolean;
    canExport: boolean;
    canViewCosts: boolean;
  };
  summary: {
    totalPlans: number;
    totalApprovedFte: number;
    totalFilledFte: number;
    totalOpenDemandFte: number;
    vacancyRatePct: number;
    criticalGapRoles: number;
    immediateBackfills: number;
    openBudgetUsd: number;
    avgSuccessionCoverage: number;
    avgAttritionRisk: number;
    pendingRequests: number;
    requestedFte: number;
  };
  filterOptions: {
    businessUnits: string[];
    locations: string[];
    planningPriorities: Array<WorkforcePlanRecord['planningPriority']>;
    healthStatuses: HealthStatus[];
  };
  plans: WorkforcePlanRecord[];
  requests: WorkforcePlanningRequestRecord[];
  insights: StructureInsight[];
};

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

const average = (values: number[]) => {
  if (!values.length) return 0;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
};

const round1 = (value: number) => Math.round(value * 10) / 10;
const isNonEmpty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const asNumber = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : Number.NaN);

const resolveHealth = ({
  vacancyRatePct,
  criticalGapRoles,
  successionCoveragePct,
  attritionRiskPct,
  reviewFte,
}: {
  vacancyRatePct: number;
  criticalGapRoles: number;
  successionCoveragePct: number;
  attritionRiskPct: number;
  reviewFte: number;
}): HealthStatus => {
  if (criticalGapRoles > 0 || vacancyRatePct >= 20 || successionCoveragePct < 65 || attritionRiskPct >= 12) return 'Critical';
  if (reviewFte > 0 || vacancyRatePct >= 8 || successionCoveragePct < 78 || attritionRiskPct >= 8) return 'Needs Attention';
  return 'Healthy';
};

const getPlanningPriority = ({
  criticalGapRoles,
  vacancyRatePct,
  immediateBackfills,
  reviewFte,
}: {
  criticalGapRoles: number;
  vacancyRatePct: number;
  immediateBackfills: number;
  reviewFte: number;
}): WorkforcePlanRecord['planningPriority'] => {
  if (criticalGapRoles > 0 || immediateBackfills > 0 || vacancyRatePct >= 20) return 'Immediate';
  if (reviewFte > 0 || vacancyRatePct >= 8) return 'Planned';
  return 'Monitor';
};

const getRecommendedAction = (priority: WorkforcePlanRecord['planningPriority']) => {
  if (priority === 'Immediate') return 'Prioritize recruitment, assign interim coverage, and confirm budget release for exposed roles.';
  if (priority === 'Planned') return 'Sequence hiring, succession, and role-design reviews into the next workforce cycle.';
  return 'Maintain current staffing posture and monitor readiness indicators through periodic reviews.';
};

const buildProjection = (plan: WorkforcePlanRecord, requestType: WorkforceRequestType, requestedFte: number) => {
  const averageRoleCost = plan.approvedFte ? plan.payrollRunRateUsd / Math.max(plan.filledFte, 1) : 0;

  if (requestType === 'Add Headcount') {
    const projectedApprovedFte = round1(plan.approvedFte + requestedFte);
    const projectedFilledFte = round1(plan.filledFte + requestedFte);
    const projectedGapFte = round1(Math.max(projectedApprovedFte - projectedFilledFte, 0));
    return {
      projectedApprovedFte,
      projectedFilledFte,
      projectedGapFte,
      incrementalBudgetUsd: Math.round(averageRoleCost * requestedFte),
      impactSummary: `Adds ${requestedFte} FTE to the approved structure and lifts target filled capacity to ${projectedFilledFte} FTE when the request is fully actioned.`,
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
      incrementalBudgetUsd: Math.round(averageRoleCost * requestedFte),
      impactSummary: `Backfills up to ${requestedFte} FTE from the current gap and reduces the unresolved demand to ${projectedGapFte} FTE.`,
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
      incrementalBudgetUsd: Math.round(averageRoleCost * requestedFte * 0.6),
      impactSummary: `Introduces temporary cover for ${requestedFte} FTE and reduces short-term delivery risk while permanent action is completed.`,
    };
  }

  return {
    projectedApprovedFte: plan.approvedFte,
    projectedFilledFte: plan.filledFte,
    projectedGapFte: plan.openDemandFte,
    incrementalBudgetUsd: 0,
    impactSummary: 'Triggers a structure review without changing approved FTE until redesign decisions are approved.',
  };
};

const getTopRisks = (positions: PositionRecord[], metrics: Omit<WorkforcePlanRecord, 'id' | 'businessUnit' | 'department' | 'location' | 'topRisks' | 'recommendedAction' | 'roles'>) => {
  const risks: string[] = [];
  const oldestVacancy = [...positions].filter((position) => position.positionStatus === 'Vacant').sort((a, b) => b.openDays - a.openDays)[0];
  const reviewRoles = positions.filter((position) => position.positionStatus === 'Under Review').length;
  const nonStandardRoles = positions.filter((position) => !position.standardPosition).length;

  if (metrics.criticalGapRoles > 0) risks.push(`${metrics.criticalGapRoles} critical role${metrics.criticalGapRoles === 1 ? '' : 's'} remain unfilled.`);
  if (oldestVacancy && oldestVacancy.openDays > 0) risks.push(`${oldestVacancy.title} is the longest open role at ${oldestVacancy.openDays} days.`);
  if (metrics.successionCoveragePct < 75) risks.push(`Succession coverage is below target at ${metrics.successionCoveragePct}%.`);
  if (metrics.attritionRiskPct >= 8) risks.push(`Attrition risk is elevated at ${metrics.attritionRiskPct}%.`);
  if (reviewRoles > 0) risks.push(`${reviewRoles} role${reviewRoles === 1 ? '' : 's'} are under review and may shift plan assumptions.`);
  if (nonStandardRoles > 0) risks.push(`${nonStandardRoles} non-standard role${nonStandardRoles === 1 ? '' : 's'} may require structure alignment.`);

  return risks.slice(0, 3);
};

const buildPlanRecord = (groupKey: string, positions: PositionRecord[]): WorkforcePlanRecord => {
  const [businessUnit, department, location] = groupKey.split('||');
  const approvedPositions = positions.length;
  const approvedFte = round1(positions.reduce((sum, position) => sum + position.fte, 0));
  const filled = positions.filter((position) => position.positionStatus === 'Filled');
  const openDemand = positions.filter((position) => position.positionStatus === 'Vacant' || position.positionStatus === 'Under Review');
  const vacant = positions.filter((position) => position.positionStatus === 'Vacant');
  const frozen = positions.filter((position) => position.positionStatus === 'Frozen');
  const review = positions.filter((position) => position.positionStatus === 'Under Review');
  const criticalPositions = positions.filter((position) => position.criticality === 'Critical').length;
  const criticalGapRoles = positions.filter((position) => position.criticality === 'Critical' && position.positionStatus !== 'Filled').length;
  const immediateBackfills = positions.filter((position) => position.replacementPriority === 'Immediate' && position.positionStatus !== 'Filled').length;
  const filledFte = round1(filled.reduce((sum, position) => sum + position.fte, 0));
  const openDemandFte = round1(openDemand.reduce((sum, position) => sum + position.fte, 0));
  const vacantFte = round1(vacant.reduce((sum, position) => sum + position.fte, 0));
  const frozenFte = round1(frozen.reduce((sum, position) => sum + position.fte, 0));
  const reviewFte = round1(review.reduce((sum, position) => sum + position.fte, 0));
  const vacancyRatePct = approvedFte ? round1((openDemandFte / approvedFte) * 100) : 0;
  const averageOpenDays = round1(average(openDemand.map((position) => position.openDays)));
  const successionCoveragePct = average(positions.map((position) => position.successionCoveragePct));
  const attritionRiskPct = average(positions.map((position) => position.attritionRiskPct));
  const approvalCoveragePct = average(positions.map((position) => position.approvalCoveragePct));
  const payrollRunRateUsd = Math.round(filled.reduce((sum, position) => sum + position.benchmarkSalaryUsd, 0));
  const openBudgetUsd = Math.round(openDemand.reduce((sum, position) => sum + position.benchmarkSalaryUsd, 0));
  const standardizationPct = approvedPositions ? round1((positions.filter((position) => position.standardPosition).length / approvedPositions) * 100) : 0;
  const healthStatus = resolveHealth({ vacancyRatePct, criticalGapRoles, successionCoveragePct, attritionRiskPct, reviewFte });
  const planningPriority = getPlanningPriority({ criticalGapRoles, vacancyRatePct, immediateBackfills, reviewFte });

  const recordBase = {
    approvedPositions,
    approvedFte,
    filledFte,
    openDemandFte,
    vacantFte,
    frozenFte,
    reviewFte,
    vacancyRatePct,
    criticalPositions,
    criticalGapRoles,
    immediateBackfills,
    averageOpenDays,
    successionCoveragePct,
    attritionRiskPct,
    approvalCoveragePct,
    payrollRunRateUsd,
    openBudgetUsd,
    standardizationPct,
    healthStatus,
    planningPriority,
  };

  return {
    id: `wfp-${businessUnit.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${department.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${location.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    businessUnit,
    department,
    location,
    ...recordBase,
    topRisks: getTopRisks(positions, recordBase),
    recommendedAction: getRecommendedAction(planningPriority),
    roles: [...positions]
      .sort((a, b) => {
        if (a.positionStatus !== b.positionStatus) return a.positionStatus.localeCompare(b.positionStatus);
        if (a.criticality !== b.criticality) return a.criticality.localeCompare(b.criticality);
        return a.title.localeCompare(b.title);
      })
      .map((position) => ({
        id: position.id,
        code: position.code,
        title: position.title,
        gradeCode: position.gradeCode,
        positionType: position.positionType,
        positionStatus: position.positionStatus,
        criticality: position.criticality,
        replacementPriority: position.replacementPriority,
        incumbentName: position.incumbentName,
        openDays: position.openDays,
        fte: position.fte,
        benchmarkSalaryUsd: position.benchmarkSalaryUsd,
        healthStatus: position.healthStatus,
      })),
  };
};

const buildPayload = async (): Promise<WorkforcePlanningPayload> => {
  const positions = await readPositions();
  const requests = (await readWorkforcePlanningRequests()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const grouped = positions.reduce<Map<string, PositionRecord[]>>((acc, position) => {
    const key = [position.businessUnit, position.department, position.location].join('||');
    const current = acc.get(key) || [];
    current.push(position);
    acc.set(key, current);
    return acc;
  }, new Map());

  const plans = Array.from(grouped.entries())
    .map(([key, group]) => buildPlanRecord(key, group))
    .sort((a, b) => {
      const priorityOrder = ['Immediate', 'Planned', 'Monitor'];
      const priorityCompare = priorityOrder.indexOf(a.planningPriority) - priorityOrder.indexOf(b.planningPriority);
      if (priorityCompare !== 0) return priorityCompare;
      if (b.openDemandFte !== a.openDemandFte) return b.openDemandFte - a.openDemandFte;
      return a.department.localeCompare(b.department);
    });

  const totalApprovedFte = round1(plans.reduce((sum, plan) => sum + plan.approvedFte, 0));
  const totalFilledFte = round1(plans.reduce((sum, plan) => sum + plan.filledFte, 0));
  const totalOpenDemandFte = round1(plans.reduce((sum, plan) => sum + plan.openDemandFte, 0));
  const vacancyRatePct = totalApprovedFte ? round1((totalOpenDemandFte / totalApprovedFte) * 100) : 0;
  const criticalGapRoles = plans.reduce((sum, plan) => sum + plan.criticalGapRoles, 0);
  const immediateBackfills = plans.reduce((sum, plan) => sum + plan.immediateBackfills, 0);
  const openBudgetUsd = Math.round(plans.reduce((sum, plan) => sum + plan.openBudgetUsd, 0));
  const avgSuccessionCoverage = average(plans.map((plan) => plan.successionCoveragePct));
  const avgAttritionRisk = average(plans.map((plan) => plan.attritionRiskPct));

  const highestGapPlan = [...plans].sort((a, b) => b.openDemandFte - a.openDemandFte)[0];
  const weakestCoveragePlan = [...plans].sort((a, b) => a.successionCoveragePct - b.successionCoveragePct)[0];
  const highestVacancyPlan = [...plans].sort((a, b) => b.vacancyRatePct - a.vacancyRatePct)[0];

  const insights: StructureInsight[] = [
    {
      id: 'wfp-ins-1',
      severity: highestGapPlan && highestGapPlan.openDemandFte >= 2 ? 'high' : 'medium',
      title: `${highestGapPlan?.department || 'A workforce segment'} has the largest open demand`,
      recommendation: 'Sequence recruiting, temporary cover, and budget release for the segment carrying the highest workforce gap.',
    },
    {
      id: 'wfp-ins-2',
      severity: weakestCoveragePlan && weakestCoveragePlan.successionCoveragePct < 70 ? 'high' : 'medium',
      title: `${weakestCoveragePlan?.department || 'A segment'} has the weakest succession depth`,
      recommendation: 'Build successor pools, cross-training plans, and emergency cover for low-readiness roles.',
    },
    {
      id: 'wfp-ins-3',
      severity: highestVacancyPlan && highestVacancyPlan.vacancyRatePct >= 20 ? 'high' : 'low',
      title: `${highestVacancyPlan?.department || 'A segment'} is running the highest vacancy rate`,
      recommendation: 'Review whether the current approved structure remains realistic or needs reprioritization in the next planning cycle.',
    },
  ];

  const requestedFte = round1(requests.reduce((sum, request) => sum + request.requestedFte, 0));

  return {
    generatedAt: new Date().toISOString(),
    permissions: {
      canEdit: true,
      canExport: true,
      canViewCosts: true,
    },
    summary: {
      totalPlans: plans.length,
      totalApprovedFte,
      totalFilledFte,
      totalOpenDemandFte,
      vacancyRatePct,
      criticalGapRoles,
      immediateBackfills,
      openBudgetUsd,
      avgSuccessionCoverage,
      avgAttritionRisk,
      pendingRequests: requests.filter((request) => request.status === 'Submitted' || request.status === 'Under Review').length,
      requestedFte,
    },
    filterOptions: {
      businessUnits: Array.from(new Set(plans.map((plan) => plan.businessUnit))).sort((a, b) => a.localeCompare(b)),
      locations: Array.from(new Set(plans.map((plan) => plan.location))).sort((a, b) => a.localeCompare(b)),
      planningPriorities: ['Immediate', 'Planned', 'Monitor'] as Array<WorkforcePlanRecord['planningPriority']>,
      healthStatuses: ['Healthy', 'Needs Attention', 'Critical'] as HealthStatus[],
    },
    plans,
    requests,
    insights,
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

export async function GET() {
  return ok(await buildPayload());
}

export async function POST(request: Request) {
  const current = await buildPayload();
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
    incrementalBudgetUsd: projection.incrementalBudgetUsd,
    status: 'Submitted',
    createdAt: new Date().toISOString(),
  };

  const next = [record, ...existing].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  await writeWorkforcePlanningRequests(next);
  return ok(record);
}

export async function PATCH(request: Request) {
  const payload = (await request.json()) as UpdateWorkforceRequestPayload;
  const existing = await readWorkforcePlanningRequests();
  const validationError = validateStatusUpdate(payload, existing);
  if (validationError) return err(400, validationError);

  let updatedRecord: WorkforcePlanningRequestRecord | null = null;
  const next = existing.map((item) => {
    if (item.id !== payload.requestId) return item;
    updatedRecord = { ...item, status: payload.status! };
    return updatedRecord;
  });

  await writeWorkforcePlanningRequests(next);
  return ok(updatedRecord);
}
