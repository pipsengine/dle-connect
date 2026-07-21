import {
  activePerformanceDelegationsForActor,
  buildPerformanceActorContext,
  listDirectReportsForActor,
  loadTeamEmployeeIds,
  scopePerformanceDomain,
  withEffectivePerformanceScope,
} from '@/lib/performance-access';
import { DEFAULT_BEHAVIOUR_SCALE, displayScore, sectionScore } from '@/lib/performance-calculation';
import type { PerformanceRole } from '@/lib/performance-management-types';
import type { AssessmentItem, EmployeeGoal, PerformanceAssessment, PerformanceCycle } from '@/lib/performance-domain-types';
import { readPerformanceDomainState, resolveActivePerformanceCycle } from '@/lib/performance-domain-store';
import { readPayrollEmployees } from '@/lib/payroll-employee-source';
import type { SessionPayload } from '@/lib/auth/session';

export { ESS_PERFORMANCE_HREF } from '@/lib/performance-routes';

const compact = (value: unknown) => String(value || '').trim();
const norm = (value: unknown) => compact(value).toLowerCase();

export type EssRatingScaleOption = {
  value: number;
  label: string;
  anchor: string;
};

export type EssAssessmentItemDto = AssessmentItem & {
  goalProgress?: number;
  goalDueDate?: string;
  keyResults?: Array<{ title: string; baseline: number; target: number; actual?: number; unit: string }>;
};

export type EssAssessmentDetail = {
  id: string;
  cycleId: string;
  cycleName: string;
  employeeId: string;
  employeeName: string;
  type: string;
  status: string;
  items: EssAssessmentItemDto[];
  overallComments?: string;
  strengths?: string;
  improvements?: string;
  submittedAt?: string;
  returnedReason?: string;
  returnedBy?: string;
  returnedAt?: string;
  version: number;
  previewScore: number | null;
  history: Array<{ version: number; at: string; actor: string; change: string; reason?: string }>;
};

export type EssActivityRow = {
  id: string;
  at: string;
  actor: string;
  action: string;
  entityType: string;
  entityId: string;
  reason?: string;
};

export type EssDelegationRow = {
  id: string;
  fromManagerId: string;
  fromManagerName: string;
  toManagerId: string;
  toManagerName: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: string;
  direction: 'owned' | 'received';
};

export type EssTeamReviewQueueRow = {
  employeeId: string;
  employeeCode: string;
  fullName: string;
  department: string;
  jobTitle: string;
  goalCount: number;
  selfStatus: string;
  managerStatus: string;
  managerAssessmentId: string | null;
  selfAssessmentId: string | null;
  dueDate: string;
  score: number | null;
  outstanding: string;
  reviewStage: string;
};

export type EssPerformanceGoalRow = {
  id: string;
  title: string;
  progress: number;
  dueDate: string;
  status: string;
  weight: number;
  acknowledgementRequired: boolean;
  employeeId?: string;
  employeeName?: string;
  description?: string;
};

export type EssPerformanceReviewRow = {
  id: string;
  cycle: string;
  cycleName: string;
  form: string;
  type: string;
  status: string;
  score: number | null;
  employeeId?: string;
  employeeName?: string;
  returnedReason?: string;
  version?: number;
};

export type EssCheckInRow = {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  status: string;
  progressPercent: number;
  sharedNotes: string;
  employeeReflection: string;
  managerFeedback: string;
  privateManagerNotes?: string;
  commitments: Array<{ id: string; text: string; owner: string; dueDate: string; done: boolean }>;
};

export type EssPerformanceTaskRow = {
  id: string;
  title: string;
  type: string;
  status: string;
  dueDate: string;
  employeeName: string;
  assigneeName: string;
  tab?: 'overview' | 'my-goals' | 'my-reviews' | 'team';
  sourceId?: string;
};

export type EssCycleStageState = 'completed' | 'active' | 'upcoming' | 'overdue' | 'locked';

export type EssCycleStage = {
  id: string;
  label: string;
  state: EssCycleStageState;
  deadline?: string;
};

export type EssCalibrationRow = {
  id: string;
  employeeId: string;
  employeeName: string;
  status: string;
  originalScore: number;
  proposedScore?: number;
  approvedScore?: number;
  originalBand: string;
  proposedBand?: string;
  approvedBand?: string;
  justification?: string;
  decidedBy?: string;
  decidedAt?: string;
};

export type EssPipRow = {
  id: string;
  employeeId: string;
  employeeName: string;
  reason: string;
  gaps: string;
  support: string;
  status: string;
  startDate: string;
  endDate: string;
  objectives: Array<{ id: string; title: string; target: string; weight: number; dueDate: string }>;
  milestones: Array<{ id: string; date: string; notes: string; outcome: string }>;
};

export type EssDevelopmentPlanRow = {
  id: string;
  employeeId: string;
  employeeName: string;
  title: string;
  need: string;
  owner: string;
  status: string;
  priority: string;
  actions: Array<{ id: string; action: string; owner: string; dueDate: string; status: string; evidence?: string }>;
};

export type EssProbationRow = {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  status: string;
  startDate: string;
  endDate: string;
  recommendation?: string;
  decision?: string;
};

export type EssCompanyObjectiveOption = {
  id: string;
  code: string;
  title: string;
  strategicPillar: string;
};

export type EssAppealRow = {
  id: string;
  resultId: string;
  cycleId: string;
  status: string;
  reason: string;
  requestedOutcome: string;
  disputedItems: string[];
  evidence?: string;
  createdAt: string;
  decidedAt?: string;
  panelDecision?: string;
};

export type EssPerformanceWorkspace = {
  scope: 'self' | 'team' | 'global';
  role: PerformanceRole;
  activeCycle: { id: string; name: string; status: string; endDate?: string } | null;
  cycleStages: EssCycleStage[];
  companyObjectives: EssCompanyObjectiveOption[];
  ratingScale: EssRatingScaleOption[];
  behaviourIndicators: Array<{ id: string; name: string; description: string; weight: number }>;
  self: {
    goals: EssPerformanceGoalRow[];
    kpis: Array<{ label: string; value: number; target: number }>;
    reviews: EssPerformanceReviewRow[];
    assessmentDetails: EssAssessmentDetail[];
    appeals: EssAppealRow[];
    developmentPlans: EssDevelopmentPlanRow[];
    tasks: EssPerformanceTaskRow[];
    checkIns: EssCheckInRow[];
    calibration: EssCalibrationRow[];
  };
  team: {
    isManager: boolean;
    actingAsDelegate: boolean;
    directReports: Array<{
      employeeId: string;
      employeeCode: string;
      fullName: string;
      department: string;
      jobTitle: string;
      viaDelegation?: boolean;
      delegatedFrom?: string;
    }>;
    reviewQueue: EssTeamReviewQueueRow[];
    assessmentDetails: EssAssessmentDetail[];
    goals: EssPerformanceGoalRow[];
    assessments: EssPerformanceReviewRow[];
    tasks: EssPerformanceTaskRow[];
    checkIns: EssCheckInRow[];
    calibration: EssCalibrationRow[];
    developmentPlans: EssDevelopmentPlanRow[];
    probation: EssProbationRow[];
    pips: EssPipRow[];
    delegations: EssDelegationRow[];
  };
  activity: EssActivityRow[];
  metrics: {
    goalsTotal: number;
    goalsAwaitingAck: number;
    pendingSelfAppraisal: number;
    pendingManagerReviews: number;
    completedManagerReviews: number;
    awaitingSelfOnTeam: number;
    readyForManagerReview: number;
    openTasks: number;
    teamSize: number;
  };
};

const cycleName = (cycleId: string, cycles: Array<{ id: string; name: string }>) =>
  cycles.find((item) => item.id === cycleId)?.name || cycleId;

const todayIso = () => new Date().toISOString().slice(0, 10);

const stageStateFromWindow = (
  start: string | undefined,
  end: string | undefined,
  cycleClosed: boolean,
  forceActive = false,
  forceCompleted = false,
): EssCycleStageState => {
  if (cycleClosed) return 'locked';
  if (forceCompleted) return 'completed';
  if (forceActive) {
    if (end && end < todayIso()) return 'overdue';
    return 'active';
  }
  if (end && end < todayIso() && start && start <= todayIso()) return 'overdue';
  if (start && start > todayIso()) return 'upcoming';
  if (end && end < todayIso()) return 'completed';
  if (start && start <= todayIso() && (!end || end >= todayIso())) return 'active';
  return 'upcoming';
};

/** Map cycle status + date windows into a lifecycle tracker for ESS. */
export const buildEssCycleStages = (cycle: PerformanceCycle | null | undefined): EssCycleStage[] => {
  if (!cycle) return [];
  const status = cycle.status;
  const closed = ['Closed', 'Archived'].includes(status);
  const order = [
    'Draft', 'Pending Approval', 'Published', 'Goal Setting', 'Active', 'Mid-Year Review',
    'Year-End Review', 'Calibration', 'Approved', 'Results Published', 'Appeal Window', 'Closed', 'Archived',
  ];
  const statusIndex = Math.max(0, order.indexOf(status));
  const reached = (label: string) => statusIndex > order.indexOf(label);
  const at = (label: string) => status === label || (label === 'Active' && status === 'Goal Setting');

  const stages: Array<{ id: string; label: string; after: string; start?: string; end?: string; activeWhen: string[] }> = [
    { id: 'goal-setting', label: 'Goal setting', after: 'Published', start: cycle.goalSettingStart, end: cycle.goalSettingEnd, activeWhen: ['Goal Setting', 'Published'] },
    { id: 'acknowledgement', label: 'Employee acknowledgement', after: 'Goal Setting', start: cycle.goalSettingStart, end: cycle.goalSettingEnd, activeWhen: ['Goal Setting'] },
    { id: 'active', label: 'Active performance', after: 'Goal Setting', start: cycle.startDate, end: cycle.endDate, activeWhen: ['Active'] },
    { id: 'check-ins', label: 'Continuous check-ins', after: 'Goal Setting', start: cycle.startDate, end: cycle.midYearStart || cycle.endDate, activeWhen: ['Active', 'Goal Setting', 'Mid-Year Review'] },
    { id: 'mid-year', label: 'Mid-year review', after: 'Active', start: cycle.midYearStart, end: cycle.midYearEnd, activeWhen: ['Mid-Year Review'] },
    { id: 'self-appraisal', label: 'Self-appraisal', after: 'Mid-Year Review', start: cycle.yearEndStart, end: cycle.yearEndEnd, activeWhen: ['Year-End Review'] },
    { id: 'manager-assessment', label: 'Manager assessment', after: 'Mid-Year Review', start: cycle.yearEndStart, end: cycle.yearEndEnd, activeWhen: ['Year-End Review'] },
    { id: 'calibration', label: 'Calibration', after: 'Year-End Review', start: cycle.calibrationStart, end: cycle.calibrationEnd, activeWhen: ['Calibration'] },
    { id: 'results-approval', label: 'Results approval', after: 'Calibration', start: cycle.calibrationEnd, end: cycle.publicationDate, activeWhen: ['Approved'] },
    { id: 'publication', label: 'Publication', after: 'Approved', start: cycle.publicationDate, end: cycle.appealDeadline, activeWhen: ['Results Published'] },
    { id: 'appeal', label: 'Appeal window', after: 'Results Published', start: cycle.publicationDate, end: cycle.appealDeadline, activeWhen: ['Appeal Window'] },
    { id: 'closure', label: 'Closure', after: 'Appeal Window', start: cycle.endDate, end: cycle.endDate, activeWhen: ['Closed', 'Archived'] },
  ];

  return stages.map((stage) => {
    const forceActive = stage.activeWhen.includes(status);
    const forceCompleted = reached(stage.after) && !forceActive && !at(stage.after);
    const completedByStatus = statusIndex > Math.max(...stage.activeWhen.map((s) => order.indexOf(s)).filter((n) => n >= 0), 0);
    return {
      id: stage.id,
      label: stage.label,
      deadline: stage.end || undefined,
      state: stageStateFromWindow(
        stage.start,
        stage.end,
        closed && stage.id !== 'closure',
        forceActive,
        forceCompleted || completedByStatus,
      ),
    };
  });
};

const mapCalibration = (row: {
  id: string;
  employeeId: string;
  employeeName: string;
  status: string;
  originalScore: number;
  proposedScore?: number;
  approvedScore?: number;
  originalBand: string;
  proposedBand?: string;
  approvedBand?: string;
  justification?: string;
  decidedBy?: string;
  decidedAt?: string;
}): EssCalibrationRow => ({
  id: row.id,
  employeeId: row.employeeId,
  employeeName: row.employeeName,
  status: row.status,
  originalScore: row.originalScore,
  proposedScore: row.proposedScore,
  approvedScore: row.approvedScore,
  originalBand: row.originalBand,
  proposedBand: row.proposedBand,
  approvedBand: row.approvedBand,
  justification: row.justification,
  decidedBy: row.decidedBy,
  decidedAt: row.decidedAt,
});

const mapPip = (row: {
  id: string;
  employeeId: string;
  employeeName: string;
  reason: string;
  gaps: string;
  support: string;
  status: string;
  startDate: string;
  endDate: string;
  objectives: Array<{ id: string; title: string; target: string; weight: number; dueDate: string }>;
  milestones: Array<{ id: string; date: string; notes: string; outcome: string }>;
}): EssPipRow => ({
  id: row.id,
  employeeId: row.employeeId,
  employeeName: row.employeeName,
  reason: row.reason,
  gaps: row.gaps,
  support: row.support,
  status: row.status,
  startDate: row.startDate,
  endDate: row.endDate,
  objectives: row.objectives || [],
  milestones: row.milestones || [],
});

const mapDevelopment = (plan: {
  id: string;
  employeeId: string;
  employeeName: string;
  need: string;
  priority: string;
  status: string;
  actions: Array<{ id: string; action: string; owner: string; dueDate: string; status: string; evidence?: string }>;
}): EssDevelopmentPlanRow => ({
  id: plan.id,
  employeeId: plan.employeeId,
  employeeName: plan.employeeName,
  title: plan.need,
  need: plan.need,
  owner: plan.actions[0]?.owner || 'Manager',
  status: plan.status,
  priority: plan.priority,
  actions: plan.actions || [],
});

const mapCheckIn = (item: {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  status: string;
  progressPercent: number;
  sharedNotes?: string;
  employeeReflection?: string;
  managerFeedback?: string;
  privateManagerNotes?: string;
  commitments?: Array<{ id: string; text: string; owner: string; dueDate: string; done: boolean }>;
}): EssCheckInRow => ({
  id: item.id,
  employeeId: item.employeeId,
  employeeName: item.employeeName,
  date: item.date,
  status: item.status,
  progressPercent: item.progressPercent,
  sharedNotes: item.sharedNotes || '',
  employeeReflection: item.employeeReflection || '',
  managerFeedback: item.managerFeedback || '',
  privateManagerNotes: item.privateManagerNotes,
  commitments: (item.commitments || []).map((c) => ({ ...c })),
});

const mapGoals = (goals: EmployeeGoal[], includeEmployee = false): EssPerformanceGoalRow[] =>
  goals.map((goal) => ({
    id: goal.id,
    title: goal.title,
    progress: goal.progressPercent,
    dueDate: goal.dueDate,
    status: goal.status,
    weight: goal.weight,
    description: goal.description,
    acknowledgementRequired: ['Assigned', 'Resubmitted', 'Discussion Requested'].includes(goal.status),
    ...(includeEmployee ? { employeeId: goal.employeeId, employeeName: goal.employeeName } : {}),
  }));

const previewFromItems = (items: AssessmentItem[], mode: 'manager' | 'self' = 'manager') => {
  const scored = mode === 'self'
    ? items.filter((item) => item.selfRating != null)
    : items.filter((item) => item.managerRating != null || item.achievement != null);
  if (!scored.length) return null;
  return displayScore(sectionScore(scored.map((item) => ({
    weight: item.weight,
    achievement: mode === 'self'
      ? Number(item.selfRating || 0) * 20
      : (item.achievement != null ? item.achievement : Number(item.managerRating || 0) * 20),
  }))));
};

const enrichItems = (items: AssessmentItem[], goals: EmployeeGoal[]): EssAssessmentItemDto[] =>
  items.map((item) => {
    const goal = goals.find((row) => row.id === item.itemId);
    return {
      ...item,
      goalProgress: goal?.progressPercent,
      goalDueDate: goal?.dueDate,
      keyResults: goal?.keyResults?.map((kr) => ({
        title: kr.title,
        baseline: kr.baseline,
        target: kr.target,
        actual: kr.actual,
        unit: kr.unit,
      })),
    };
  });

const mapAssessmentDetail = (
  assessment: PerformanceAssessment,
  cycles: Array<{ id: string; name: string }>,
  goals: EmployeeGoal[],
): EssAssessmentDetail => {
  const selfMode = assessment.type === 'Self' || assessment.type === 'Mid-Year';
  return {
    id: assessment.id,
    cycleId: assessment.cycleId,
    cycleName: cycleName(assessment.cycleId, cycles),
    employeeId: assessment.employeeId,
    employeeName: assessment.employeeName,
    type: assessment.type,
    status: assessment.status,
    items: enrichItems(assessment.items, goals),
    overallComments: assessment.overallComments,
    strengths: assessment.strengths,
    improvements: assessment.improvements,
    submittedAt: assessment.submittedAt,
    returnedReason: assessment.returnedReason,
    returnedBy: assessment.returnedBy,
    returnedAt: assessment.returnedAt,
    version: assessment.version,
    previewScore: previewFromItems(assessment.items, selfMode ? 'self' : 'manager'),
    history: (assessment.history || []).slice().reverse().slice(0, 12),
  };
};

const employeeMatches = (employeeId: string, employeeCode: string, candidateId: string, candidateCode?: string) => {
  const keys = new Set([norm(employeeId), norm(employeeCode)].filter(Boolean));
  return keys.has(norm(candidateId)) || (candidateCode ? keys.has(norm(candidateCode)) : false);
};

export const buildEssPerformanceWorkspace = async (
  session: SessionPayload,
): Promise<EssPerformanceWorkspace> => {
  const baseActor = buildPerformanceActorContext(session);
  const state = await readPerformanceDomainState();
  const payroll = await readPayrollEmployees().catch(() => ({ employees: [] as any[] }));
  const employees = payroll.employees || [];
  const teamIds = await loadTeamEmployeeIds(baseActor, employees, state.delegations || []);
  const actor = withEffectivePerformanceScope(baseActor, teamIds);
  const scoped = scopePerformanceDomain(state, actor, teamIds);
  const cycle = resolveActivePerformanceCycle(state);
  const cycleLabel = cycle
    ? { id: cycle.id, name: cycle.name, status: cycle.status, endDate: cycle.endDate }
    : null;
  const cycleStages = buildEssCycleStages(cycle);
  const companyObjectives = (state.companyObjectives || [])
    .filter((row) => !cycle || row.cycleId === cycle.id)
    .filter((row) => ['Published', 'Scored', 'Locked'].includes(row.status) || row.status === 'Draft')
    .map((row) => ({
      id: row.id,
      code: row.code,
      title: row.title,
      strategicPillar: row.strategicPillar,
    }));
  const dueDate = cycle?.endDate || '';

  const actorKeys = new Set([actor.employeeId, actor.employeeCode].map((key) => compact(key)).filter(Boolean));
  const selfGoals = scoped.goals.filter((goal) =>
    actorKeys.has(compact(goal.employeeId)) || actorKeys.has(compact(goal.employeeCode)),
  );
  const selfAssessments = scoped.assessments.filter((item) => actorKeys.has(compact(item.employeeId)));
  const selfResults = scoped.results.filter((item) => actorKeys.has(compact(item.employeeId)));
  const selfTasks = scoped.tasks.filter((task) =>
    task.assigneeId === actor.employeeId || task.assigneeId === actor.employeeCode || task.employeeId === actor.employeeId,
  );
  const selfCheckIns = scoped.checkIns.filter((item) => item.employeeId === actor.employeeId);

  const reviews: EssPerformanceReviewRow[] = [
    ...selfAssessments.map((item) => ({
      id: item.id,
      cycle: item.cycleId,
      cycleName: cycleName(item.cycleId, state.cycles),
      form: `${item.type} assessment`,
      type: item.type,
      status: item.status,
      score: previewFromItems(item.items, item.type === 'Self' || item.type === 'Mid-Year' ? 'self' : 'manager'),
      returnedReason: item.returnedReason,
      version: item.version,
    })),
    ...selfResults
      .filter((item) => item.status === 'Published' || item.status === 'Amended' || item.status === 'Appealed')
      .map((item) => ({
        id: item.id,
        cycle: item.cycleId,
        cycleName: cycleName(item.cycleId, state.cycles),
        form: 'Published result',
        type: 'Result',
        status: item.acknowledgedAt ? 'Acknowledged' : item.status,
        score: displayScore(item.finalScore),
      })),
  ];

  const selfAssessmentDetails = selfAssessments
    .filter((item) => item.type === 'Self' || item.type === 'Mid-Year')
    .map((item) => mapAssessmentDetail(item, state.cycles, selfGoals));

  const selfAppeals = (scoped.appeals || [])
    .filter((row) => actorKeys.has(compact(row.employeeId)))
    .map((row) => ({
      id: row.id,
      resultId: row.resultId,
      cycleId: row.cycleId,
      status: row.status,
      reason: row.reason,
      requestedOutcome: row.requestedOutcome,
      disputedItems: row.disputedItems || [],
      evidence: row.evidence,
      createdAt: row.createdAt,
      decidedAt: row.decidedAt,
      panelDecision: row.panelDecision,
    }));

  const { received: receivedDelegations, owned: ownedDelegations } = activePerformanceDelegationsForActor(
    actor,
    state.delegations || [],
  );
  const actingAsDelegate = receivedDelegations.length > 0;

  const ownReportRows = listDirectReportsForActor(actor, employees);
  const delegatedReportRows = receivedDelegations.flatMap((delegation) => {
    const owner = {
      employeeId: delegation.fromManagerId,
      employeeCode: delegation.fromManagerId,
      fullName: delegation.fromManagerName,
    };
    return listDirectReportsForActor(owner, employees).map((row) => ({
      ...row,
      viaDelegation: true as const,
      delegatedFrom: delegation.fromManagerName,
    }));
  });

  const reportMap = new Map<string, {
    employeeId: string;
    employeeCode: string;
    fullName: string;
    department: string;
    jobTitle: string;
    viaDelegation?: boolean;
    delegatedFrom?: string;
  }>();
  for (const row of ownReportRows) {
    const employeeId = String(row.employeeId || row.employeeCode || '');
    if (!employeeId) continue;
    reportMap.set(norm(employeeId), {
      employeeId,
      employeeCode: String(row.employeeCode || row.employeeId || ''),
      fullName: String(row.fullName || 'Employee'),
      department: String(row.department || 'Unassigned'),
      jobTitle: String(row.jobTitle || row.designation || 'Employee'),
    });
  }
  for (const row of delegatedReportRows) {
    const employeeId = String(row.employeeId || row.employeeCode || '');
    if (!employeeId || reportMap.has(norm(employeeId))) continue;
    reportMap.set(norm(employeeId), {
      employeeId,
      employeeCode: String(row.employeeCode || row.employeeId || ''),
      fullName: String(row.fullName || 'Employee'),
      department: String(row.department || 'Unassigned'),
      jobTitle: String(row.jobTitle || row.designation || 'Employee'),
      viaDelegation: true,
      delegatedFrom: row.delegatedFrom,
    });
  }
  const directReports = Array.from(reportMap.values());
  const isManager = directReports.length > 0;
  const reportKeys = new Set(
    directReports.flatMap((row) => [row.employeeId, row.employeeCode].map((value) => norm(value)).filter(Boolean)),
  );

  const teamGoals = isManager
    ? scoped.goals.filter((goal) => reportKeys.has(norm(goal.employeeId)) || reportKeys.has(norm(goal.employeeCode)))
    : [];
  const teamManagerAssessments = isManager
    ? scoped.assessments.filter((item) => item.type === 'Manager' && reportKeys.has(norm(item.employeeId)))
    : [];
  const teamSelfAssessments = isManager
    ? scoped.assessments.filter((item) => item.type === 'Self' && reportKeys.has(norm(item.employeeId)))
    : [];

  const reviewQueue: EssTeamReviewQueueRow[] = isManager
    ? directReports.map((report) => {
        const goals = teamGoals.filter((goal) => employeeMatches(report.employeeId, report.employeeCode, goal.employeeId, goal.employeeCode));
        const selfAsm = teamSelfAssessments.find((item) => employeeMatches(report.employeeId, report.employeeCode, item.employeeId));
        const mgrAsm = teamManagerAssessments.find((item) => employeeMatches(report.employeeId, report.employeeCode, item.employeeId));
        const selfStatus = selfAsm?.status || 'Not started';
        const managerStatus = mgrAsm?.status || 'Not started';
        const selfDone = Boolean(selfAsm && ['Submitted', 'Completed', 'Approved'].includes(selfAsm.status));
        const mgrDone = Boolean(mgrAsm && ['Submitted', 'Completed', 'Approved'].includes(mgrAsm.status));
        let outstanding = 'Start manager assessment';
        if (mgrDone) outstanding = 'Submitted';
        else if (mgrAsm && ['Draft', 'Returned', 'Pending Manager'].includes(mgrAsm.status)) outstanding = 'Complete manager review';
        else if (!selfDone && selfAsm) outstanding = 'Awaiting self-appraisal';
        else if (!selfDone) outstanding = 'Ready for manager review';
        else outstanding = 'Ready for manager review';

        let reviewStage = 'Not started';
        if (mgrDone) reviewStage = 'Manager submitted';
        else if (mgrAsm) reviewStage = 'Manager in progress';
        else if (selfDone) reviewStage = 'Self submitted';
        else if (selfAsm) reviewStage = 'Self in progress';
        else if (goals.length) reviewStage = 'Goals set';

        return {
          employeeId: report.employeeId,
          employeeCode: report.employeeCode,
          fullName: report.fullName,
          department: report.department,
          jobTitle: report.jobTitle,
          goalCount: goals.length,
          selfStatus,
          managerStatus,
          managerAssessmentId: mgrAsm?.id || null,
          selfAssessmentId: selfAsm?.id || null,
          dueDate,
          score: mgrAsm ? previewFromItems(mgrAsm.items) : null,
          outstanding,
          reviewStage,
        };
      })
    : [];

  const completedManagerReviews = reviewQueue.filter((row) => /submitted|completed|approved/i.test(row.managerStatus)).length;
  const awaitingSelfOnTeam = reviewQueue.filter((row) => !/submitted|completed|approved/i.test(row.selfStatus) && row.selfStatus !== 'Not started').length
    + reviewQueue.filter((row) => row.selfStatus === 'Not started' && row.goalCount > 0 && !/submitted|completed|approved/i.test(row.managerStatus)).length;
  const readyForManagerReview = reviewQueue.filter((row) => !/submitted|completed|approved/i.test(row.managerStatus)).length;
  const pendingMgr = readyForManagerReview;

  const teamAssessments: EssPerformanceReviewRow[] = teamManagerAssessments.map((item) => ({
    id: item.id,
    cycle: item.cycleId,
    cycleName: cycleName(item.cycleId, state.cycles),
    form: 'Manager assessment',
    type: item.type,
    status: item.status,
    score: previewFromItems(item.items),
    employeeId: item.employeeId,
    employeeName: item.employeeName,
  }));

  const assessmentDetails = isManager
    ? [
        ...teamManagerAssessments.map((item) => mapAssessmentDetail(item, state.cycles, teamGoals)),
        ...teamSelfAssessments.map((item) => mapAssessmentDetail(item, state.cycles, teamGoals)),
      ]
    : [];

  const teamTasks = isManager
    ? scoped.tasks.filter((task) => {
        const assignee = norm(task.assigneeId);
        const keys = new Set([actor.employeeId, actor.employeeCode].map((v) => norm(v)).filter(Boolean));
        return keys.has(assignee);
      })
    : [];
  const teamProbation = isManager
    ? scoped.probation.filter((row) => reportKeys.has(norm(row.employeeId)) || reportKeys.has(norm(row.employeeCode)))
    : [];
  const teamPips = isManager
    ? scoped.pips.filter((row) => reportKeys.has(norm(row.employeeId)))
    : [];
  const teamCheckIns = isManager
    ? scoped.checkIns.filter((item) => reportKeys.has(norm(item.employeeId)))
    : [];
  const selfCalibration = scoped.calibration.filter((row) => actorKeys.has(compact(row.employeeId)));
  const teamCalibration = isManager
    ? scoped.calibration.filter((row) => reportKeys.has(norm(row.employeeId)))
    : [];
  const teamDevelopment = isManager
    ? scoped.developmentPlans.filter((plan) => reportKeys.has(norm(plan.employeeId)))
    : [];
  const selfDevelopment = scoped.developmentPlans.filter((plan) =>
    actorKeys.has(compact(plan.employeeId)),
  );

  const goalsAck = selfGoals.filter((g) => ['Agreed', 'Active', 'Completed'].includes(g.status)).length;
  const pendingSelfReviews = selfAssessments.filter((item) => item.type === 'Self' && ['Not Started', 'Draft', 'Returned'].includes(item.status));
  const pendingSelf = pendingSelfReviews.length;
  const goalsAwaitingAck = selfGoals.filter((g) => ['Assigned', 'Resubmitted', 'Discussion Requested'].includes(g.status));
  const resultsAwaitingAck = selfResults.filter((item) => (item.status === 'Published' || item.status === 'Amended') && !item.acknowledgedAt);

  const mappedSelfTasks: EssPerformanceTaskRow[] = selfTasks
    .filter((task) => !['Completed', 'Cancelled'].includes(task.status))
    .map((task) => ({
      id: task.id,
      title: task.title,
      type: task.type,
      status: task.status,
      dueDate: task.dueDate,
      employeeName: task.employeeName,
      assigneeName: task.assigneeName,
      tab: 'overview' as const,
      sourceId: task.id,
    }));

  const synthesizedQueue: EssPerformanceTaskRow[] = [
    ...goalsAwaitingAck.map((goal) => ({
      id: `queue-goal-${goal.id}`,
      title: `Acknowledge goal: ${goal.title}`,
      type: 'Goal Acknowledgement',
      status: goal.status,
      dueDate: goal.dueDate,
      employeeName: goal.employeeName,
      assigneeName: actor.fullName,
      tab: 'my-goals' as const,
      sourceId: goal.id,
    })),
    ...pendingSelfReviews.map((item) => ({
      id: `queue-self-${item.id}`,
      title: `Complete self-appraisal (${item.status})`,
      type: 'Self Appraisal',
      status: item.status,
      dueDate: cycle?.endDate || '',
      employeeName: actor.fullName,
      assigneeName: actor.fullName,
      tab: 'my-reviews' as const,
      sourceId: item.id,
    })),
    ...resultsAwaitingAck.map((item) => ({
      id: `queue-result-${item.id}`,
      title: 'Acknowledge published performance result',
      type: 'Result Acknowledgement',
      status: item.status,
      dueDate: cycle?.appealDeadline || cycle?.endDate || '',
      employeeName: item.employeeName,
      assigneeName: actor.fullName,
      tab: 'my-reviews' as const,
      sourceId: item.id,
    })),
    ...(isManager && pendingMgr
      ? [{
          id: 'queue-team-reviews',
          title: `${pendingMgr} of ${directReports.length} team review${directReports.length === 1 ? '' : 's'} outstanding`,
          type: 'Manager Review',
          status: 'Pending',
          dueDate: cycle?.endDate || '',
          employeeName: 'Direct reports',
          assigneeName: actor.fullName,
          tab: 'team' as const,
          sourceId: '',
        }]
      : []),
  ];

  const seen = new Set<string>();
  const actionQueue = [...synthesizedQueue, ...mappedSelfTasks].filter((item) => {
    const key = `${item.type}:${item.sourceId || item.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const openTasks = actionQueue.length;
  const ratingScale: EssRatingScaleOption[] = DEFAULT_BEHAVIOUR_SCALE.map((row) => ({
    value: row.value,
    label: row.label,
    anchor: row.anchor,
  }));

  return {
    scope: actor.scope,
    role: actor.performanceRole,
    activeCycle: cycleLabel,
    cycleStages,
    companyObjectives,
    ratingScale,
    behaviourIndicators: (state.config.behaviourIndicators || []).map((ind) => ({
      id: ind.id,
      name: ind.name,
      description: ind.description,
      weight: ind.weight,
    })),
    self: {
      goals: mapGoals(selfGoals),
      kpis: [
        {
          label: 'Goal acknowledgement',
          value: selfGoals.length ? Math.round((goalsAck / selfGoals.length) * 100) : 0,
          target: 100,
        },
        {
          label: 'Check-in progress',
          value: selfCheckIns.length
            ? Math.round(selfCheckIns.reduce((sum, row) => sum + Number(row.progressPercent || 0), 0) / selfCheckIns.length)
            : 0,
          target: 80,
        },
        {
          label: 'Open tasks',
          value: openTasks,
          target: 0,
        },
      ],
      reviews,
      assessmentDetails: selfAssessmentDetails,
      appeals: selfAppeals,
      developmentPlans: selfDevelopment.map(mapDevelopment),
      tasks: actionQueue,
      checkIns: selfCheckIns.map(mapCheckIn),
      calibration: selfCalibration.map(mapCalibration),
    },
    team: {
      isManager,
      actingAsDelegate,
      directReports,
      reviewQueue,
      assessmentDetails,
      goals: mapGoals(teamGoals, true),
      assessments: teamAssessments,
      tasks: teamTasks.map((task) => ({
        id: task.id,
        title: task.title,
        type: task.type,
        status: task.status,
        dueDate: task.dueDate,
        employeeName: task.employeeName,
        assigneeName: task.assigneeName,
      })),
      checkIns: teamCheckIns.map(mapCheckIn),
      calibration: teamCalibration.map(mapCalibration),
      developmentPlans: teamDevelopment.map(mapDevelopment),
      probation: teamProbation.map((row) => ({
        id: row.id,
        employeeId: row.employeeId,
        employeeName: row.employeeName,
        department: row.department,
        status: row.status,
        startDate: row.startDate,
        endDate: row.endDate,
        recommendation: row.recommendation,
        decision: row.decision,
      })),
      pips: teamPips.map(mapPip),
      delegations: [
        ...ownedDelegations.map((row) => ({
          id: row.id,
          fromManagerId: row.fromManagerId,
          fromManagerName: row.fromManagerName,
          toManagerId: row.toManagerId,
          toManagerName: row.toManagerName,
          startDate: row.startDate,
          endDate: row.endDate,
          reason: row.reason,
          status: row.status,
          direction: 'owned' as const,
        })),
        ...receivedDelegations.map((row) => ({
          id: row.id,
          fromManagerId: row.fromManagerId,
          fromManagerName: row.fromManagerName,
          toManagerId: row.toManagerId,
          toManagerName: row.toManagerName,
          startDate: row.startDate,
          endDate: row.endDate,
          reason: row.reason,
          status: row.status,
          direction: 'received' as const,
        })),
      ],
    },
    activity: (scoped.audit || [])
      .filter((event) => [
        'PerformanceAssessment',
        'EmployeeGoal',
        'CheckIn',
        'PerformanceDelegation',
        'PipRecord',
        'DevelopmentPlan',
        'ProbationRecord',
        'AppealCase',
        'PerformanceResult',
      ].includes(event.entityType))
      .slice(0, 20)
      .map((event) => ({
        id: event.id,
        at: event.at,
        actor: event.actor,
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId,
        reason: event.reason,
      })),
    metrics: {
      goalsTotal: selfGoals.length,
      goalsAwaitingAck: goalsAwaitingAck.length,
      pendingSelfAppraisal: pendingSelf,
      pendingManagerReviews: pendingMgr,
      completedManagerReviews,
      awaitingSelfOnTeam,
      readyForManagerReview,
      openTasks,
      teamSize: directReports.length,
    },
  };
};

/** Actions permitted from ESS (employees and line managers). HR admin actions stay in HRIS. */
export const ESS_PERFORMANCE_ACTIONS = new Set([
  'goal.acknowledge',
  'result.acknowledge',
  'goal.request-discussion',
  'goal.upsert',
  'assessment.save',
  'assessment.submit',
  'assessment.return',
  'assessment.reopen',
  'checkin.create',
  'checkin.update',
  'midyear.change-request',
  'probation.recommend',
  'pip.upsert',
  'development.upsert',
  'delegation.upsert',
  'delegation.cancel',
  'appeal.submit',
]);

export const assertEssPerformanceAction = (action: string) => {
  if (!ESS_PERFORMANCE_ACTIONS.has(action)) {
    return `Action "${action}" is not available in the employee portal. Contact HR for assistance.`;
  }
  return null;
};

/** Build seeded assessment items for a manager draft (goals + behaviours). Ratings left unset unless provided. */
export const buildManagerAssessmentItems = (input: {
  goals: EmployeeGoal[];
  behaviourIndicators: Array<{ id: string; name: string; description: string; weight: number }>;
  selfItems?: AssessmentItem[];
  defaultManagerRating?: number;
}) => {
  const selfById = new Map((input.selfItems || []).map((item) => [item.itemId, item]));
  const goalItems = input.goals.map((goal) => {
    const self = selfById.get(goal.id);
    const rating = input.defaultManagerRating;
    return {
      itemId: goal.id,
      itemType: 'okr' as const,
      title: goal.title,
      weight: goal.weight,
      selfRating: self?.selfRating,
      selfNarrative: self?.selfNarrative,
      ...(rating != null ? { managerRating: rating, achievement: rating * 20 } : {}),
    };
  });
  const behaviourItems = input.behaviourIndicators.map((ind) => {
    const self = selfById.get(ind.id);
    const rating = input.defaultManagerRating;
    return {
      itemId: ind.id,
      itemType: 'behaviour' as const,
      title: ind.name,
      weight: ind.weight,
      selfRating: self?.selfRating,
      selfNarrative: self?.selfNarrative || ind.description,
      ...(rating != null ? { managerRating: rating, achievement: rating * 20 } : {}),
    };
  });
  if (goalItems.length || behaviourItems.length) return [...goalItems, ...behaviourItems];
  return [{
    itemId: 'asm-fallback',
    itemType: 'okr' as const,
    title: 'Performance objectives',
    weight: 100,
  }];
};
