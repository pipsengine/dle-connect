import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readPayrollEmployees } from '@/lib/payroll-employee-source';
import {
  DEFAULT_BEHAVIOUR_SCALE,
  DEFAULT_RATING_BANDS,
  DEFAULT_SECTION_WEIGHTS,
  bandsContinuousNonOverlapping,
  displayScore,
  finalScore,
  ratingBandForScore,
  sectionScore,
  weightsTotalOk,
} from '@/lib/performance-calculation';
import type { PerformanceDashboardData, PerformanceNavPreferences, PerformancePayload, PerformanceRole } from '@/lib/performance-management-types';
import {
  defaultPerformanceRoles,
  filterMenuByRole,
  performanceMenuTree,
  resolvePerformanceRole,
} from '@/lib/performance-management-menu-config';
import type {
  AppealCase,
  CalibrationCase,
  CheckIn,
  CompanyObjective,
  CycleEligibility,
  DevelopmentPlan,
  EmployeeGoal,
  PerformanceActionResult,
  PerformanceAnalyticsSnapshot,
  PerformanceAssessment,
  PerformanceAuditEvent,
  PerformanceConfig,
  PerformanceCycle,
  PerformanceDomainState,
  PerformanceResult,
  PerformanceTask,
  PerformanceWorkspacePayload,
  PipRecord,
  ProbationRecord,
  RaterAssignment,
  RecognitionRecommendation,
  ScheduledPerformanceReport,
} from '@/lib/performance-domain-types';
import { recordConfirmationOutcome } from '@/lib/employee-confirmation-store';
import { createEnterpriseNotification } from '@/lib/enterprise-notifications-store';
import type { SessionPayload } from '@/lib/auth/session';

const STORE_DIR = path.join(process.cwd(), 'data', 'performance');
const STORE_PATH = path.join(STORE_DIR, 'domain.json');

const nowIso = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const compact = (value: unknown) => String(value || '').trim();

const defaultConfig = (): PerformanceConfig => ({
  ratingBands: DEFAULT_RATING_BANDS.map((band) => ({ ...band })),
  sectionWeights: { ...DEFAULT_SECTION_WEIGHTS },
  achievementCap: 100,
  anonymityThreshold: 3,
  behaviourIndicators: DEFAULT_BEHAVIOUR_SCALE.map((row, index) => ({
    id: `beh-${index + 1}`,
    name: row.label,
    description: row.anchor,
    category: 'Company Values',
    weight: 20,
    anchors: [row.anchor],
  })),
});

const emptyState = (): PerformanceDomainState => ({
  version: 1,
  updatedAt: nowIso(),
  config: defaultConfig(),
  cycles: [],
  eligibility: [],
  companyObjectives: [],
  goals: [],
  checkIns: [],
  assessments: [],
  raters: [],
  calibration: [],
  results: [],
  appeals: [],
  pips: [],
  developmentPlans: [],
  recognitions: [],
  probation: [],
  tasks: [],
  audit: [],
  scheduledReports: [],
});

const navPrefs = new Map<string, PerformanceNavPreferences>();

const defaultPreferences = (): PerformanceNavPreferences => ({
  favorites: [],
  recent: [],
  expandedGroups: ['planning', 'performance-reviews', 'governance', 'outcomes'],
  sidebarCollapsed: false,
});

const ensureStore = async () => {
  await mkdir(STORE_DIR, { recursive: true });
  try {
    await access(STORE_PATH);
  } catch {
    const seeded = await seedDomain();
    await writeFile(STORE_PATH, JSON.stringify(seeded, null, 2), 'utf8');
  }
};

const readState = async (): Promise<PerformanceDomainState> => {
  await ensureStore();
  try {
    const raw = await readFile(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as PerformanceDomainState;
    return { ...emptyState(), ...parsed, config: { ...defaultConfig(), ...(parsed.config || {}) } };
  } catch {
    const seeded = await seedDomain();
    await writeFile(STORE_PATH, JSON.stringify(seeded, null, 2), 'utf8');
    return seeded;
  }
};

const writeState = async (state: PerformanceDomainState) => {
  await mkdir(STORE_DIR, { recursive: true });
  const next = { ...state, updatedAt: nowIso(), version: Number(state.version || 1) };
  await writeFile(STORE_PATH, JSON.stringify(next, null, 2), 'utf8');
  return next;
};

const pushAudit = (
  state: PerformanceDomainState,
  input: Omit<PerformanceAuditEvent, 'id' | 'at'>,
) => {
  state.audit = [
    {
      id: id('aud'),
      at: nowIso(),
      ...input,
    },
    ...state.audit,
  ].slice(0, 2000);
};

const pushTask = (state: PerformanceDomainState, task: Omit<PerformanceTask, 'id' | 'createdAt' | 'status'> & { status?: PerformanceTask['status'] }) => {
  state.tasks = [
    {
      id: id('task'),
      createdAt: nowIso(),
      status: task.status || 'Assigned',
      ...task,
    },
    ...state.tasks,
  ].slice(0, 2000);
};

const systemSession = (actor: string, employeeCode?: string): SessionPayload => ({
  sub: employeeCode || 'performance-system',
  username: employeeCode || 'performance-system',
  fullName: actor || 'Performance System',
  employeeCode: employeeCode || undefined,
  roles: ['HR Officer'],
  permissions: ['performance.view'],
  status: 'Active',
  firstLoginRequired: false,
  passwordResetRequired: false,
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 3600,
});

const notifyPerformance = async (input: {
  actor: string;
  recipientEmployeeCode?: string;
  title: string;
  body: string;
  href?: string;
  channels?: Array<'In-App' | 'Email'>;
}) => {
  try {
    await createEnterpriseNotification(systemSession(input.actor, input.recipientEmployeeCode), {
      title: input.title,
      body: input.body,
      module: 'Performance Management',
      href: input.href || '/hris/performance-management',
      actor: input.actor,
      recipientEmployeeCode: input.recipientEmployeeCode,
      channels: input.channels || ['In-App', 'Email'],
      severity: 'info',
    });
  } catch {
    /* best-effort hooks */
  }
};

const daysUntil = (isoDate: string) => {
  const end = new Date(`${isoDate.slice(0, 10)}T00:00:00.000Z`);
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return Math.ceil((end.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
};

const refreshProbationAlerts = (state: PerformanceDomainState) => {
  const thresholds = [60, 30, 14, 7];
  for (const record of state.probation) {
    if (['Confirmed', 'Not Confirmed', 'Closed'].includes(record.status)) continue;
    const remaining = daysUntil(record.endDate);
    record.alertsSent = record.alertsSent || [];
    for (const threshold of thresholds) {
      if (remaining <= threshold && !record.alertsSent.includes(threshold)) {
        record.alertsSent.push(threshold);
        record.status = remaining <= 14 ? 'Review Due' : record.status;
        pushTask(state, {
          cycleId: state.cycles.find((cycle) => !['Closed', 'Archived', 'Draft'].includes(cycle.status))?.id || '',
          employeeId: record.employeeId,
          employeeName: record.employeeName,
          type: 'Probation Review',
          title: `Probation review due in ${Math.max(remaining, 0)} day(s) for ${record.employeeName}`,
          assigneeId: record.managerId || record.employeeId,
          assigneeName: record.managerName || record.employeeName,
          dueDate: record.endDate,
          href: '/hris/performance-management/performance-reviews/probation',
        });
        void notifyPerformance({
          actor: 'Performance System',
          recipientEmployeeCode: record.employeeCode,
          title: `Probation monitoring · ${threshold}-day alert`,
          body: `${record.employeeName} probation ends ${record.endDate} (${remaining} day(s) remaining).`,
          href: '/hris/performance-management/performance-reviews/probation',
        });
      }
    }
  }
};

const buildAnalytics = (state: PerformanceDomainState): PerformanceAnalyticsSnapshot => {
  const originals = state.calibration.map((row) => Number(row.originalScore || 0)).filter((n) => n > 0);
  const approved = state.calibration
    .filter((row) => row.status === 'Approved')
    .map((row) => Number(row.approvedScore ?? row.proposedScore ?? row.originalScore ?? 0))
    .filter((n) => n > 0);
  const published = state.results.filter((row) => row.status === 'Published' || row.status === 'Amended');
  const avg = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);
  const pre = avg(originals);
  const post = avg(approved.length ? approved : published.map((row) => row.finalScore));
  const bandCounts = new Map<string, number>();
  for (const row of published) {
    bandCounts.set(row.ratingBand, (bandCounts.get(row.ratingBand) || 0) + 1);
  }
  return {
    generatedAt: nowIso(),
    preCalibrationAvg: displayScore(pre),
    postCalibrationAvg: displayScore(post),
    severityIndex: displayScore(Math.max(0, pre - post)),
    leniencyIndex: displayScore(Math.max(0, post - pre)),
    pipActive: state.pips.filter((item) => /active|track|risk|pending/i.test(item.status)).length,
    pipCompleted: state.pips.filter((item) => /complete|closed|unsuccessful/i.test(item.status)).length,
    probationConfirmed: state.probation.filter((item) => item.status === 'Confirmed' || item.decision === 'Confirm').length,
    probationExtended: state.probation.filter((item) => item.status === 'Extended' || item.decision === 'Extend').length,
    probationNotConfirmed: state.probation.filter((item) => item.status === 'Not Confirmed' || item.decision === 'Do Not Confirm').length,
    ratingDistribution: Array.from(bandCounts.entries()).map(([band, count]) => ({ band, count })),
  };
};

async function seedDomain(): Promise<PerformanceDomainState> {
  const state = emptyState();
  let employees: Array<{ employeeId: string; employeeCode: string; fullName: string; department: string; jobTitle: string; managerName: string; managerEmployeeId?: string; dateJoined?: string; status?: string }> = [];
  try {
    const source = await readPayrollEmployees();
    employees = (source.employees || []).slice(0, 40).map((row: any) => ({
      employeeId: String(row.employeeId || row.employeeCode || ''),
      employeeCode: String(row.employeeCode || row.employeeId || ''),
      fullName: String(row.fullName || 'Employee'),
      department: String(row.department || 'Unassigned'),
      jobTitle: String(row.jobTitle || row.designation || 'Employee'),
      managerName: String(row.managerName || row.manager || 'Line Manager'),
      managerEmployeeId: String(row.managerEmployeeId || row.managerId || ''),
      dateJoined: String(row.dateJoined || row.contractStartDate || ''),
      status: String(row.status || ''),
    }));
  } catch {
    employees = [];
  }

  const year = new Date().getFullYear();
  const cycleId = id('cyc');
  const cycle: PerformanceCycle = {
    id: cycleId,
    name: `H2 ${year} Performance Cycle`,
    type: 'Annual',
    year,
    description: 'Enterprise mid-year to year-end performance cycle with goals, reviews, calibration, and publication.',
    status: 'Goal Setting',
    startDate: `${year}-07-01`,
    endDate: `${year}-12-31`,
    goalSettingStart: `${year}-07-01`,
    goalSettingEnd: `${year}-08-15`,
    midYearStart: `${year}-09-01`,
    midYearEnd: `${year}-09-30`,
    yearEndStart: `${year}-11-01`,
    yearEndEnd: `${year}-12-10`,
    calibrationStart: `${year}-12-11`,
    calibrationEnd: `${year}-12-18`,
    publicationDate: `${year}-12-20`,
    appealDeadline: `${year}-12-31`,
    sectionWeights: { ...DEFAULT_SECTION_WEIGHTS },
    ratingBands: DEFAULT_RATING_BANDS.map((band) => ({ ...band })),
    achievementCap: 100,
    enable360: true,
    enableMatrix: true,
    enableCalibration: true,
    enableForcedDistribution: false,
    populationRule: 'All active confirmed employees',
    eligibilityCount: employees.length,
    version: 1,
    createdBy: 'HR Administrator',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    publishedAt: nowIso(),
  };
  state.cycles = [cycle];

  state.eligibility = employees.map((employee) => ({
    id: id('elig'),
    cycleId,
    employeeId: employee.employeeId,
    employeeCode: employee.employeeCode,
    fullName: employee.fullName,
    department: employee.department,
    jobTitle: employee.jobTitle,
    managerId: employee.managerEmployeeId || '',
    managerName: employee.managerName,
    included: true,
    reason: 'Active employee in published snapshot',
    snapshotAt: nowIso(),
  }));

  state.companyObjectives = [
    {
      id: id('co'),
      cycleId,
      code: 'CO-REV-01',
      title: 'Sustainable revenue growth',
      description: 'Deliver approved revenue plan across operating units.',
      strategicPillar: 'Growth',
      owner: 'Executive Management',
      kpi: 'Revenue vs plan',
      baseline: 90,
      target: 100,
      unit: '%',
      weight: 40,
      status: 'Published',
      version: 1,
      createdBy: 'HR Administrator',
      approvedBy: 'Executive Management',
      publishedAt: nowIso(),
    },
    {
      id: id('co'),
      cycleId,
      code: 'CO-OPS-02',
      title: 'Operational excellence and HSE',
      description: 'Zero major HSE incidents and improved delivery reliability.',
      strategicPillar: 'Operations',
      owner: 'COO',
      kpi: 'HSE + on-time delivery',
      baseline: 85,
      target: 100,
      unit: '%',
      weight: 35,
      status: 'Published',
      version: 1,
      createdBy: 'HR Administrator',
      approvedBy: 'Executive Management',
      publishedAt: nowIso(),
    },
    {
      id: id('co'),
      cycleId,
      code: 'CO-PEO-03',
      title: 'People capability and engagement',
      description: 'Build high-performing teams through capability and engagement.',
      strategicPillar: 'People',
      owner: 'HR Director',
      kpi: 'Engagement / capability index',
      baseline: 70,
      target: 85,
      unit: 'score',
      weight: 25,
      status: 'Published',
      version: 1,
      createdBy: 'HR Administrator',
      approvedBy: 'Executive Management',
      publishedAt: nowIso(),
    },
  ];

  state.goals = employees.slice(0, 12).flatMap((employee, index) => {
    const goalId = id('goal');
    return [{
      id: goalId,
      cycleId,
      employeeId: employee.employeeId,
      employeeCode: employee.employeeCode,
      employeeName: employee.fullName,
      department: employee.department,
      managerId: employee.managerEmployeeId || '',
      managerName: employee.managerName,
      title: index % 2 === 0 ? 'Deliver assigned annual workplan outcomes' : 'Improve process quality and stakeholder service',
      description: 'Measurable individual contribution aligned to company objectives.',
      type: 'Annual',
      parentObjectiveId: state.companyObjectives[index % state.companyObjectives.length]?.id,
      strategicPillar: state.companyObjectives[index % state.companyObjectives.length]?.strategicPillar,
      keyResults: [
        { id: id('kr'), title: 'Primary KPI achievement', baseline: 0, target: 100, unit: '%', weight: 60 },
        { id: id('kr'), title: 'Quality / compliance milestones', baseline: 0, target: 100, unit: '%', weight: 40 },
      ],
      weight: 100,
      startDate: cycle.goalSettingStart,
      dueDate: cycle.endDate,
      status: index < 4 ? 'Agreed' : index < 8 ? 'Assigned' : 'Draft',
      version: 1,
      progressPercent: index < 4 ? 35 + index * 5 : 0,
      acknowledgedAt: index < 4 ? nowIso() : undefined,
      agreedVersion: index < 4 ? 1 : undefined,
      createdBy: employee.managerName,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      history: [{ version: 1, at: nowIso(), actor: employee.managerName, change: 'Goal created' }],
    } satisfies EmployeeGoal];
  });

  const probationCandidates = employees.filter((employee) => /probation/i.test(employee.status || '')).slice(0, 5);
  state.probation = (probationCandidates.length ? probationCandidates : employees.slice(0, 2)).map((employee) => {
    const start = employee.dateJoined?.slice(0, 10) || `${year}-01-15`;
    const endDate = new Date(start);
    endDate.setMonth(endDate.getMonth() + 6);
    return {
      id: id('prob'),
      employeeId: employee.employeeId,
      employeeCode: employee.employeeCode,
      employeeName: employee.fullName,
      department: employee.department,
      managerId: employee.managerEmployeeId || '',
      managerName: employee.managerName,
      startDate: start,
      endDate: endDate.toISOString().slice(0, 10),
      durationMonths: 6,
      status: 'Active',
      okrs: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    } satisfies ProbationRecord;
  });

  pushAudit(state, {
    actor: 'System',
    actorRole: 'System',
    action: 'Seeded performance domain',
    entityType: 'PerformanceDomain',
    entityId: 'root',
    after: `Cycle ${cycle.name} with ${state.eligibility.length} eligible employees`,
  });

  return state;
}

const rolePermissions = (role: PerformanceRole) => {
  const isAdmin = role === 'Super Administrator';
  const isHr = role === 'HR Officer' || role === 'HR Manager' || isAdmin;
  const isManager = role === 'Supervisor' || role === 'Project Manager' || isHr;
  const isExecutive = role === 'Executive Management';
  return {
    canViewAdmin: isAdmin || isHr,
    canManageCycles: isHr,
    canReview: isManager,
    canApprove: isHr || role === 'Supervisor' || role === 'Project Manager' || isExecutive,
    canExport: isHr || isManager || isExecutive,
    canConfigure: isAdmin || role === 'HR Manager',
    readOnlyExecutive: isExecutive && !isHr,
  };
};

const activeCycle = (state: PerformanceDomainState) =>
  state.cycles.find((cycle) => !['Closed', 'Archived', 'Draft'].includes(cycle.status)) || state.cycles[0] || null;

const goalCompletionLike = (state: PerformanceDomainState) => {
  const cycle = activeCycle(state);
  const goals = state.goals.filter((goal) => !cycle || goal.cycleId === cycle.id);
  if (!goals.length) return 0;
  const agreed = goals.filter((goal) => ['Agreed', 'Active', 'Completed'].includes(goal.status)).length;
  return Math.round((agreed / goals.length) * 100);
};

const daysBetween = (from: string, to: string) => {
  const start = new Date(from);
  const end = new Date(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.ceil((end.getTime() - start.getTime()) / 86_400_000);
};

const sparkline = (base: number, variance = 0.08, points = 8) =>
  Array.from({ length: points }, (_, index) => {
    const wave = Math.sin(index * 0.9) * variance;
    return Math.max(0, Math.round(base * (1 + wave + index * 0.01)));
  });

const buildDashboard = (state: PerformanceDomainState, employeeCount: number): PerformanceDashboardData => {
  const cycle = activeCycle(state);
  const eligible = cycle?.eligibilityCount || state.eligibility.filter((row) => row.included).length || employeeCount || 1;
  const goals = state.goals.filter((goal) => !cycle || goal.cycleId === cycle.id);
  const agreed = goals.filter((goal) => ['Agreed', 'Active', 'Completed'].includes(goal.status)).length;
  const submittedSelf = state.assessments.filter((item) => item.type === 'Self' && ['Submitted', 'Approved', 'Published'].includes(item.status)).length;
  const submittedMgr = state.assessments.filter((item) => item.type === 'Manager' && ['Submitted', 'Approved', 'Published'].includes(item.status)).length;
  const pendingReviews = Math.max(0, eligible - submittedMgr);
  const reviewsCompleted = submittedMgr;
  const reviewsCompletedPct = Math.round((reviewsCompleted / eligible) * 1000) / 10;
  const pendingReviewsPct = Math.round((pendingReviews / eligible) * 1000) / 10;
  const goalCompletionPct = goals.length ? Math.round((agreed / goals.length) * 1000) / 10 : 0;
  const highPerformers = state.results.filter((item) => item.finalScore >= 90).length;
  const pipEmployees = state.pips.filter((item) => /active|track|risk/i.test(item.status)).length;
  const openTasks = state.tasks.filter((task) => !['Completed', 'Cancelled'].includes(task.status));

  const stageDefs = [
    { id: 'goals', label: 'Goal Setting', completed: agreed, total: Math.max(goals.length, 1), dueDate: cycle?.goalSettingEnd || '', tone: 'blue' as const },
    { id: 'self', label: 'Self Appraisal', completed: submittedSelf, total: eligible, dueDate: cycle?.yearEndEnd || '', tone: 'blue' as const },
    { id: 'supervisor', label: 'Supervisor Review', completed: submittedMgr, total: eligible, dueDate: cycle?.yearEndEnd || '', tone: 'orange' as const },
    { id: '360', label: '360 Review', completed: state.raters.filter((item) => item.status === 'Submitted').length, total: Math.max(state.raters.length, 1), dueDate: cycle?.yearEndEnd || '', tone: 'purple' as const },
    { id: 'calibration', label: 'Calibration', completed: state.calibration.filter((item) => item.status === 'Approved').length, total: Math.max(state.calibration.length, 1), dueDate: cycle?.calibrationEnd || '', tone: 'cyan' as const },
    { id: 'final', label: 'Results Published', completed: state.results.filter((item) => item.status === 'Published').length, total: eligible, dueDate: cycle?.publicationDate || '', tone: 'slate' as const },
  ].map((stage) => {
    const percent = Math.min(100, Math.round((stage.completed / Math.max(stage.total, 1)) * 100));
    return {
      ...stage,
      percent,
      status: (percent >= 100 ? 'completed' : percent > 0 ? 'active' : 'pending') as 'completed' | 'active' | 'pending',
    };
  });

  const deptMap = state.eligibility.reduce<Record<string, { total: number; count: number; pending: number }>>((acc, row) => {
    if (!row.included) return acc;
    const result = state.results.find((item) => item.employeeId === row.employeeId);
    acc[row.department] = acc[row.department] || { total: 0, count: 0, pending: 0 };
    acc[row.department].count += 1;
    if (result) acc[row.department].total += result.finalScore;
    else acc[row.department].pending += 1;
    return acc;
  }, {});

  return {
    employees: eligible,
    employeesTrend: 2.1,
    reviewsCompleted,
    reviewsCompletedPct,
    reviewsCompletedTrend: 4.2,
    pendingReviews,
    pendingReviewsPct,
    pendingReviewsTrend: -1.5,
    goalCompletionPct,
    goalCompletionTrend: 3.4,
    highPerformers,
    highPerformersPct: Math.round((highPerformers / Math.max(eligible, 1)) * 1000) / 10,
    highPerformersTrend: 1.2,
    pipEmployees,
    pipEmployeesPct: Math.round((pipEmployees / Math.max(eligible, 1)) * 1000) / 10,
    pipEmployeesTrend: 0,
    cycle: {
      name: cycle?.name || 'No active cycle',
      type: cycle?.type || '—',
      startDate: cycle?.startDate || '',
      endDate: cycle?.endDate || '',
      deadline: cycle?.endDate || '',
      daysRemaining: cycle ? Math.max(0, daysBetween(nowIso().slice(0, 10), cycle.endDate)) : 0,
      employeesInCycle: eligible,
      completedReviews: reviewsCompleted,
      pendingReviews,
      locked: cycle ? ['Closed', 'Archived', 'Results Published'].includes(cycle.status) : false,
    },
    workflow: {
      currentStage: stageDefs.find((stage) => stage.status === 'active')?.label || stageDefs[0]?.label || 'Planning',
      stageOwner: 'HR / Line Managers',
      autoRefreshSeconds: 60,
      stages: stageDefs,
    },
    aiInsights: [
      { id: '1', text: `${openTasks.length} open performance workflow tasks require attention.`, tone: 'blue' as const },
      { id: '2', text: `${agreed} goals agreed of ${goals.length} in the active cycle.`, tone: 'emerald' as const },
      { id: '3', text: `${state.probation.filter((item) => !['Confirmed', 'Closed', 'Not Confirmed'].includes(item.status)).length} probation cases are in progress.`, tone: 'amber' as const },
      { id: '4', text: `${state.appeals.filter((item) => !['Closed', 'Rejected', 'Upheld', 'Amended'].includes(item.status)).length} appeal cases are open.`, tone: 'violet' as const },
      { id: '5', text: `${pipEmployees} active PIP cases under monitoring.`, tone: 'red' as const },
    ],
    goalProgress: {
      completed: goals.filter((goal) => goal.status === 'Completed').length,
      inProgress: goals.filter((goal) => ['Agreed', 'Active', 'Assigned'].includes(goal.status)).length,
      notStarted: goals.filter((goal) => goal.status === 'Draft').length,
      avgCompletion: goalCompletionPct,
    },
    ratingDistribution: DEFAULT_RATING_BANDS.map((band, index) => ({
      label: band.label,
      count: state.results.filter((item) => item.ratingBand === band.label).length,
      tone: ['#10B981', '#2563EB', '#06B6D4', '#F59E0B', '#EF4444'][index] || '#64748B',
    })),
    departmentPerformance: Object.entries(deptMap)
      .map(([department, value]) => ({
        department,
        completionPct: Math.round(((value.count - value.pending) / Math.max(value.count, 1)) * 100),
        avgRating: value.count - value.pending > 0 ? displayScore(value.total / (value.count - value.pending)) / 20 : 0,
        pending: value.pending,
      }))
      .sort((a, b) => b.completionPct - a.completionPct)
      .slice(0, 8),
    performanceHealth: {
      score: Math.round((goalCompletionPct + reviewsCompletedPct + (state.calibration.length ? 80 : 60)) / 3),
      goals: Math.round(goalCompletionPct),
      reviews: Math.round(reviewsCompletedPct),
      calibration: state.calibration.length ? Math.round((state.calibration.filter((item) => item.status === 'Approved').length / state.calibration.length) * 100) : 0,
      competencies: state.config.behaviourIndicators.length ? 86 : 0,
      feedback: state.checkIns.length ? Math.min(100, state.checkIns.length * 5) : 0,
    },
    upcomingDeadlines: [
      { id: 'd1', title: 'Goal setting closes', date: cycle?.goalSettingEnd || '', daysRemaining: daysBetween(nowIso().slice(0, 10), cycle?.goalSettingEnd || ''), tone: 'amber' as const },
      { id: 'd2', title: 'Year-end assessments due', date: cycle?.yearEndEnd || '', daysRemaining: daysBetween(nowIso().slice(0, 10), cycle?.yearEndEnd || ''), tone: 'red' as const },
      { id: 'd3', title: 'Calibration window', date: cycle?.calibrationEnd || '', daysRemaining: daysBetween(nowIso().slice(0, 10), cycle?.calibrationEnd || ''), tone: 'slate' as const },
      { id: 'd4', title: 'Results publication', date: cycle?.publicationDate || '', daysRemaining: daysBetween(nowIso().slice(0, 10), cycle?.publicationDate || ''), tone: 'amber' as const },
    ].filter((item) => item.date),
    recentActivity: state.audit.slice(0, 8).map((event) => ({
      id: event.id,
      actor: event.actor,
      action: event.action,
      detail: `${event.entityType} · ${event.entityId}`,
      at: event.at,
      tone: 'blue',
    })),
    talentOverview: {
      promotionReady: state.recognitions.filter((item) => item.type === 'Promotion' && item.status === 'Approved').length,
      highPotential: highPerformers,
      successionReady: state.recognitions.filter((item) => item.type === 'Promotion').length,
      criticalTalent: highPerformers,
      retirementRisk: 0,
      attritionRisk: pipEmployees,
    },
    managerSummary: {
      teamMembers: eligible,
      pendingReviews,
      completedReviews: reviewsCompleted,
      goalCompletionPct,
      checkInsDue: Math.max(0, eligible - state.checkIns.length),
    },
    calendarEvents: [
      { date: cycle?.goalSettingEnd || '', type: 'deadline' as const, label: 'Goal setting closes' },
      { date: cycle?.midYearEnd || '', type: 'review' as const, label: 'Mid-year review' },
      { date: cycle?.yearEndEnd || '', type: 'review' as const, label: 'Year-end assessments' },
      { date: cycle?.calibrationEnd || '', type: 'calibration' as const, label: 'Calibration' },
      { date: cycle?.publicationDate || '', type: 'deadline' as const, label: 'Publication' },
    ].filter((item) => item.date),
    sparklines: {
      employees: sparkline(eligible),
      reviewsCompleted: sparkline(reviewsCompleted || 1),
      pendingReviews: sparkline(pendingReviews || 1),
      goalCompletion: sparkline(goalCompletionPct || 1),
      highPerformers: sparkline(highPerformers || 1),
      pipEmployees: sparkline(pipEmployees || 1),
    },
    systemStatus: {
      online: true,
      lastSync: state.updatedAt,
      activeCycleLabel: cycle?.name || 'No active cycle',
      attendanceDevicesOnline: 18,
      attendanceDevicesTotal: 18,
    },
  };
};

export const writePerformanceNavPreferences = (userKey: string, preferences: Partial<PerformanceNavPreferences>) => {
  const current = navPrefs.get(userKey) || defaultPreferences();
  const next = { ...current, ...preferences };
  navPrefs.set(userKey, next);
  return next;
};

export const updatePerformanceNavAction = (
  userKey: string,
  action: { type: string; route?: string; groupId?: string; collapsed?: boolean },
) => {
  const current = navPrefs.get(userKey) || defaultPreferences();
  if (action.type === 'favorite' && action.route) {
    current.favorites = current.favorites.includes(action.route)
      ? current.favorites.filter((item) => item !== action.route)
      : [...current.favorites, action.route];
  }
  if (action.type === 'recent' && action.route) {
    current.recent = [action.route, ...current.recent.filter((item) => item !== action.route)].slice(0, 12);
  }
  if (action.type === 'expand' && action.groupId) {
    current.expandedGroups = current.expandedGroups.includes(action.groupId)
      ? current.expandedGroups.filter((item) => item !== action.groupId)
      : [...current.expandedGroups, action.groupId];
  }
  if (action.type === 'sidebar') current.sidebarCollapsed = Boolean(action.collapsed);
  navPrefs.set(userKey, current);
  return current;
};

export const readPerformanceManagementPayload = async (
  route: string,
  roleInput?: string | null,
  userKey = 'default',
): Promise<PerformanceWorkspacePayload> => {
  const role = resolvePerformanceRole(roleInput) || defaultPerformanceRoles[0];
  const state = await readState();
  const alertCountBefore = state.tasks.length;
  refreshProbationAlerts(state);
  if (state.tasks.length !== alertCountBefore) await writeState(state);
  let employeeCount = state.eligibility.length;
  try {
    const source = await readPayrollEmployees();
    employeeCount = source.employees?.length || employeeCount;
  } catch {
    /* keep */
  }

  const openTasks = state.tasks.filter((task) => !['Completed', 'Cancelled'].includes(task.status));
  const summary = {
    pendingSelfAppraisal: state.assessments.filter((item) => item.type === 'Self' && ['Not Started', 'Draft', 'Returned'].includes(item.status)).length,
    pendingSupervisorReview: state.assessments.filter((item) => item.type === 'Manager' && ['Draft', 'Pending Manager', 'Returned'].includes(item.status)).length,
    pendingProjectReview: state.raters.filter((item) => item.relationship === 'Matrix' && ['Invited', 'In Progress'].includes(item.status)).length,
    activePip: state.pips.filter((item) => /active|track|risk/i.test(item.status)).length,
    promotionCandidates: state.recognitions.filter((item) => item.type === 'Promotion').length,
    trainingRecommendations: state.developmentPlans.reduce((sum, plan) => sum + plan.actions.length, 0),
    notifications: openTasks.length,
  };

  const badges: Record<string, number | string> = {
    'performance-cycles': activeCycle(state)?.status || 'None',
  };
  if (summary.pendingSelfAppraisal) badges['self-appraisal'] = summary.pendingSelfAppraisal;
  if (summary.pendingSupervisorReview) badges['supervisor-review'] = summary.pendingSupervisorReview;
  if (summary.pendingProjectReview) badges['project-manager-review'] = summary.pendingProjectReview;
  if (summary.activePip) badges.pip = summary.activePip;
  if (openTasks.length) badges.notifications = openTasks.length;

  const preferences = navPrefs.get(userKey) || defaultPreferences();
  const menu = filterMenuByRole(performanceMenuTree, role);

  return {
    generatedAt: nowIso(),
    route,
    role,
    permissions: rolePermissions(role),
    menu,
    preferences,
    badges,
    summary,
    aiHighlights: [],
    dashboard: buildDashboard(state, employeeCount),
    cyclesPage: {
      summary: {
        totalCycles: state.cycles.length,
        totalCyclesTrend: 0,
        activeCycles: state.cycles.filter((cycle) => !['Closed', 'Archived', 'Draft'].includes(cycle.status)).length,
        upcomingCycles: state.cycles.filter((cycle) => cycle.status === 'Draft' || cycle.status === 'Pending Approval').length,
        completedCycles: state.cycles.filter((cycle) => ['Closed', 'Archived', 'Results Published'].includes(cycle.status)).length,
        employeesCovered: state.eligibility.filter((row) => row.included).length,
        completionRate: goalCompletionLike(state),
        completionRateTrend: 0,
      },
      overview: {
        active: state.cycles.filter((cycle) => !['Closed', 'Archived', 'Draft', 'Pending Approval'].includes(cycle.status)).length,
        upcoming: state.cycles.filter((cycle) => cycle.status === 'Draft' || cycle.status === 'Pending Approval').length,
        completed: state.cycles.filter((cycle) => cycle.status === 'Results Published').length,
        closed: state.cycles.filter((cycle) => cycle.status === 'Closed' || cycle.status === 'Archived').length,
        total: state.cycles.length,
      },
      activeCycle: {
        name: activeCycle(state)?.name || 'None',
        period: activeCycle(state) ? `${activeCycle(state)!.startDate} → ${activeCycle(state)!.endDate}` : '—',
        employees: activeCycle(state)?.eligibilityCount || 0,
        departments: new Set(state.eligibility.map((row) => row.department)).size,
        reviewers: new Set(state.eligibility.map((row) => row.managerId).filter(Boolean)).size,
        progress: goalCompletionLike(state),
      },
      aiInsight: {
        onTrackPct: goalCompletionLike(state),
        highlights: [
          `${state.goals.filter((goal) => goal.status === 'Agreed').length} goals agreed`,
          `${state.tasks.filter((task) => !['Completed', 'Cancelled'].includes(task.status)).length} open tasks`,
        ],
        recommendation: 'Advance goal acknowledgement and open mid-year check-ins on schedule.',
      },
      workflowHealth: [
        { label: 'Goal Setting', percent: goalCompletionLike(state) },
        { label: 'Reviews', percent: Math.min(100, Math.round((state.assessments.filter((item) => item.status === 'Submitted').length / Math.max(state.eligibility.length, 1)) * 100)) },
        { label: 'Calibration', percent: state.calibration.length ? Math.round((state.calibration.filter((item) => item.status === 'Approved').length / state.calibration.length) * 100) : 0 },
      ],
      cycles: state.cycles.map((cycle) => ({
        id: cycle.id,
        name: cycle.name,
        type: cycle.type,
        period: `${cycle.startDate} → ${cycle.endDate}`,
        startDate: cycle.startDate,
        endDate: cycle.endDate,
        employees: cycle.eligibilityCount,
        progress: cycle.status === 'Draft' ? 0 : cycle.status === 'Closed' ? 100 : 45,
        status: (['Draft', 'Closed'].includes(cycle.status) ? cycle.status : cycle.status === 'Results Published' ? 'Completed' : ['Pending Approval'].includes(cycle.status) ? 'Upcoming' : 'Active') as 'Active' | 'Completed' | 'Upcoming' | 'Draft' | 'Closed',
        workflow: cycle.status,
        owner: cycle.createdBy,
        lastUpdated: cycle.updatedAt,
      })),
      departments: Array.from(new Set(state.eligibility.map((row) => row.department))).filter(Boolean),
    },
    domain: {
      cycles: state.cycles,
      companyObjectives: state.companyObjectives,
      goals: state.goals,
      checkIns: state.checkIns,
      assessments: state.assessments,
      raters: state.raters,
      calibration: state.calibration,
      results: state.results,
      appeals: state.appeals,
      pips: state.pips,
      developmentPlans: state.developmentPlans,
      recognitions: state.recognitions,
      probation: state.probation,
      tasks: state.tasks,
      audit: state.audit.slice(0, 100),
      scheduledReports: state.scheduledReports || [],
      analytics: state.analytics || buildAnalytics(state),
      config: state.config,
      activeCycleId: activeCycle(state)?.id || null,
    },
    actor: {
      role,
      employeeId: userKey,
      employeeCode: userKey,
      fullName: userKey === 'default' ? 'Performance User' : userKey,
    },
  } as PerformanceWorkspacePayload;
};

type ActionBody = {
  action: string;
  actor?: string;
  actorRole?: string;
  payload?: Record<string, unknown>;
};

export const applyPerformanceAction = async (body: ActionBody): Promise<PerformanceActionResult> => {
  const state = await readState();
  const actor = compact(body.actor) || 'System';
  const actorRole = compact(body.actorRole) || 'HR Officer';
  const data = body.payload || {};

  const fail = (error: string): PerformanceActionResult => ({ ok: false, error });

  try {
    switch (body.action) {
      case 'cycle.create': {
        const name = compact(data.name) || `Performance Cycle ${new Date().getFullYear()}`;
        const cycle: PerformanceCycle = {
          id: id('cyc'),
          name,
          type: compact(data.type) || 'Annual',
          year: Number(data.year) || new Date().getFullYear(),
          description: compact(data.description),
          status: 'Draft',
          startDate: compact(data.startDate) || `${new Date().getFullYear()}-01-01`,
          endDate: compact(data.endDate) || `${new Date().getFullYear()}-12-31`,
          goalSettingStart: compact(data.goalSettingStart) || compact(data.startDate) || `${new Date().getFullYear()}-01-01`,
          goalSettingEnd: compact(data.goalSettingEnd) || `${new Date().getFullYear()}-02-28`,
          sectionWeights: { ...state.config.sectionWeights },
          ratingBands: state.config.ratingBands.map((band) => ({ ...band })),
          achievementCap: state.config.achievementCap,
          enable360: data.enable360 !== false,
          enableMatrix: data.enableMatrix !== false,
          enableCalibration: data.enableCalibration !== false,
          enableForcedDistribution: false,
          populationRule: compact(data.populationRule) || 'All active employees',
          eligibilityCount: 0,
          version: 1,
          createdBy: actor,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        };
        state.cycles.unshift(cycle);
        pushAudit(state, { actor, actorRole, action: 'Created cycle', entityType: 'PerformanceCycle', entityId: cycle.id, after: cycle.name });
        break;
      }
      case 'cycle.submit-approval': {
        const cycle = state.cycles.find((item) => item.id === data.cycleId);
        if (!cycle) return fail('Cycle not found.');
        if (cycle.status !== 'Draft') return fail('Only draft cycles can be submitted for approval.');
        if (!weightsTotalOk([cycle.sectionWeights.companyObjectives, cycle.sectionWeights.individualOkrs, cycle.sectionWeights.behavioural])) {
          return fail('Section weights must total 100% before approval.');
        }
        if (!bandsContinuousNonOverlapping(cycle.ratingBands)) return fail('Rating bands must be continuous and non-overlapping.');
        cycle.status = 'Pending Approval';
        cycle.updatedAt = nowIso();
        pushAudit(state, { actor, actorRole, action: 'Submitted cycle for approval', entityType: 'PerformanceCycle', entityId: cycle.id });
        break;
      }
      case 'cycle.approve-publish': {
        const cycle = state.cycles.find((item) => item.id === data.cycleId);
        if (!cycle) return fail('Cycle not found.');
        if (!['Draft', 'Pending Approval'].includes(cycle.status)) return fail('Cycle cannot be published from current status.');
        if (!weightsTotalOk([cycle.sectionWeights.companyObjectives, cycle.sectionWeights.individualOkrs, cycle.sectionWeights.behavioural])) {
          return fail('Section weights must total 100%.');
        }
        let employees: any[] = [];
        try {
          const source = await readPayrollEmployees();
          employees = source.employees || [];
        } catch {
          employees = [];
        }
        state.eligibility = state.eligibility.filter((row) => row.cycleId !== cycle.id);
        const snapshot = employees.filter((row) => !/inactive|terminated|resigned|exit/i.test(String(row.status || ''))).map((row) => ({
          id: id('elig'),
          cycleId: cycle.id,
          employeeId: String(row.employeeId || row.employeeCode || ''),
          employeeCode: String(row.employeeCode || row.employeeId || ''),
          fullName: String(row.fullName || 'Employee'),
          department: String(row.department || 'Unassigned'),
          jobTitle: String(row.jobTitle || row.designation || 'Employee'),
          managerId: String(row.managerEmployeeId || row.managerId || ''),
          managerName: String(row.managerName || row.manager || 'Line Manager'),
          included: true,
          reason: 'Included by population rule',
          snapshotAt: nowIso(),
        }));
        state.eligibility.push(...snapshot);
        cycle.eligibilityCount = snapshot.length;
        cycle.status = 'Goal Setting';
        cycle.publishedAt = nowIso();
        cycle.updatedAt = nowIso();
        cycle.version += 1;
        pushAudit(state, { actor, actorRole, action: 'Published cycle', entityType: 'PerformanceCycle', entityId: cycle.id, after: `${snapshot.length} eligible` });
        snapshot.slice(0, 50).forEach((row) => {
          pushTask(state, {
            cycleId: cycle.id,
            employeeId: row.employeeId,
            employeeName: row.fullName,
            type: 'Goal Setting',
            title: `Set / acknowledge goals for ${cycle.name}`,
            assigneeId: row.managerId || row.employeeId,
            assigneeName: row.managerName || row.fullName,
            dueDate: cycle.goalSettingEnd,
            href: '/hris/performance-management/planning/employee-goals',
          });
        });
        break;
      }
      case 'cycle.advance-status': {
        const cycle = state.cycles.find((item) => item.id === data.cycleId);
        if (!cycle) return fail('Cycle not found.');
        const next = compact(data.status) as PerformanceCycle['status'];
        const allowed: PerformanceCycle['status'][] = ['Active', 'Mid-Year Review', 'Year-End Review', 'Calibration', 'Approved', 'Results Published', 'Appeal Window', 'Closed', 'Archived'];
        if (!allowed.includes(next)) return fail('Invalid cycle status.');
        const before = cycle.status;
        cycle.status = next;
        cycle.updatedAt = nowIso();
        pushAudit(state, { actor, actorRole, action: 'Advanced cycle status', entityType: 'PerformanceCycle', entityId: cycle.id, before, after: next, reason: compact(data.reason) });
        break;
      }
      case 'cycle.clone': {
        const source = state.cycles.find((item) => item.id === data.cycleId);
        if (!source) return fail('Cycle not found.');
        const clone: PerformanceCycle = {
          ...source,
          id: id('cyc'),
          name: `${source.name} (Clone)`,
          status: 'Draft',
          eligibilityCount: 0,
          version: 1,
          createdBy: actor,
          createdAt: nowIso(),
          updatedAt: nowIso(),
          publishedAt: undefined,
        };
        state.cycles.unshift(clone);
        pushAudit(state, { actor, actorRole, action: 'Cloned cycle', entityType: 'PerformanceCycle', entityId: clone.id, after: `From ${source.id}` });
        break;
      }
      case 'company-objective.upsert': {
        const cycleId = compact(data.cycleId) || activeCycle(state)?.id;
        if (!cycleId) return fail('No cycle selected.');
        const existing = state.companyObjectives.find((item) => item.id === data.id);
        if (existing) {
          Object.assign(existing, {
            title: compact(data.title) || existing.title,
            description: compact(data.description) || existing.description,
            weight: Number(data.weight ?? existing.weight),
            kpi: compact(data.kpi) || existing.kpi,
            target: Number(data.target ?? existing.target),
            baseline: Number(data.baseline ?? existing.baseline),
            strategicPillar: compact(data.strategicPillar) || existing.strategicPillar,
          });
        } else {
          state.companyObjectives.push({
            id: id('co'),
            cycleId,
            code: compact(data.code) || `CO-${state.companyObjectives.length + 1}`,
            title: compact(data.title) || 'Company objective',
            description: compact(data.description),
            strategicPillar: compact(data.strategicPillar) || 'Strategy',
            owner: compact(data.owner) || actor,
            kpi: compact(data.kpi) || 'KPI',
            baseline: Number(data.baseline || 0),
            target: Number(data.target || 100),
            unit: compact(data.unit) || '%',
            weight: Number(data.weight || 0),
            status: 'Draft',
            version: 1,
            createdBy: actor,
          });
        }
        const cycleObjectives = state.companyObjectives.filter((item) => item.cycleId === cycleId && item.status !== 'Draft' ? true : true);
        const draftOrAll = state.companyObjectives.filter((item) => item.cycleId === cycleId);
        if (draftOrAll.length && !weightsTotalOk(draftOrAll.map((item) => item.weight))) {
          /* allow drafts under 100 until publish */
        }
        pushAudit(state, { actor, actorRole, action: 'Upserted company objective', entityType: 'CompanyObjective', entityId: compact(data.id) || 'new' });
        void cycleObjectives;
        break;
      }
      case 'company-objective.publish': {
        const cycleId = compact(data.cycleId) || activeCycle(state)?.id;
        const rows = state.companyObjectives.filter((item) => item.cycleId === cycleId);
        if (!weightsTotalOk(rows.map((item) => item.weight))) return fail('Company objective weights must total 100%.');
        rows.forEach((row) => {
          row.status = 'Published';
          row.approvedBy = actor;
          row.publishedAt = nowIso();
        });
        pushAudit(state, { actor, actorRole, action: 'Published company objectives', entityType: 'CompanyObjective', entityId: cycleId || '' });
        break;
      }
      case 'company-objective.score': {
        const objective = state.companyObjectives.find((item) => item.id === data.id);
        if (!objective) return fail('Objective not found.');
        if (objective.status !== 'Published' && objective.status !== 'Scored') return fail('Only published objectives can be scored.');
        objective.corporateAchievement = Number(data.corporateAchievement);
        objective.status = 'Locked';
        objective.scoredBy = actor;
        objective.scoredAt = nowIso();
        pushAudit(state, { actor, actorRole, action: 'Scored company objective', entityType: 'CompanyObjective', entityId: objective.id, after: String(objective.corporateAchievement) });
        break;
      }
      case 'goal.upsert': {
        const cycleId = compact(data.cycleId) || activeCycle(state)?.id;
        if (!cycleId) return fail('No cycle selected.');
        const existing = state.goals.find((item) => item.id === data.id);
        const keyResults = Array.isArray(data.keyResults)
          ? (data.keyResults as any[]).map((row) => ({
              id: compact(row.id) || id('kr'),
              title: compact(row.title) || 'Key result',
              baseline: Number(row.baseline || 0),
              target: Number(row.target || 100),
              actual: row.actual == null ? undefined : Number(row.actual),
              unit: compact(row.unit) || '%',
              weight: Number(row.weight || 0),
            }))
          : existing?.keyResults || [];
        if (keyResults.length && !weightsTotalOk(keyResults.map((row) => row.weight))) return fail('Key result weights must total 100%.');
        if (existing) {
          if (existing.status === 'Agreed' || existing.status === 'Active') {
            existing.version += 1;
            existing.status = 'Assigned';
            existing.acknowledgedAt = undefined;
            existing.agreedVersion = undefined;
            existing.history.push({ version: existing.version, at: nowIso(), actor, change: 'Material change after acknowledgement', reason: compact(data.reason) || 'Goal revised' });
          }
          existing.title = compact(data.title) || existing.title;
          existing.description = compact(data.description) || existing.description;
          existing.keyResults = keyResults.length ? keyResults : existing.keyResults;
          existing.weight = Number(data.weight ?? existing.weight);
          existing.updatedAt = nowIso();
        } else {
          state.goals.unshift({
            id: id('goal'),
            cycleId,
            employeeId: compact(data.employeeId),
            employeeCode: compact(data.employeeCode),
            employeeName: compact(data.employeeName) || 'Employee',
            department: compact(data.department),
            managerId: compact(data.managerId),
            managerName: compact(data.managerName) || actor,
            title: compact(data.title) || 'Employee objective',
            description: compact(data.description),
            type: compact(data.type) || 'Annual',
            parentObjectiveId: compact(data.parentObjectiveId) || undefined,
            keyResults,
            weight: Number(data.weight || 100),
            startDate: compact(data.startDate) || nowIso().slice(0, 10),
            dueDate: compact(data.dueDate) || nowIso().slice(0, 10),
            status: 'Assigned',
            version: 1,
            progressPercent: 0,
            createdBy: actor,
            createdAt: nowIso(),
            updatedAt: nowIso(),
            history: [{ version: 1, at: nowIso(), actor, change: 'Goal created' }],
          });
          const created = state.goals[0];
          pushTask(state, {
            cycleId,
            employeeId: created.employeeId,
            employeeName: created.employeeName,
            type: 'Goal Acknowledgement',
            title: `Acknowledge goal: ${created.title}`,
            assigneeId: created.employeeId,
            assigneeName: created.employeeName,
            dueDate: created.dueDate,
            href: '/workforce-portal?tab=performance',
          });
        }
        pushAudit(state, { actor, actorRole, action: 'Upserted goal', entityType: 'EmployeeGoal', entityId: compact(data.id) || state.goals[0]?.id || '' });
        break;
      }
      case 'goal.request-discussion': {
        const goal = state.goals.find((item) => item.id === data.id);
        if (!goal) return fail('Goal not found.');
        goal.status = 'Discussion Requested';
        goal.discussionComment = compact(data.comment);
        goal.updatedAt = nowIso();
        pushTask(state, {
          cycleId: goal.cycleId,
          employeeId: goal.employeeId,
          employeeName: goal.employeeName,
          type: 'Goal Discussion',
          title: `Respond to goal discussion: ${goal.title}`,
          assigneeId: goal.managerId || actor,
          assigneeName: goal.managerName || actor,
          dueDate: goal.dueDate,
        });
        pushAudit(state, { actor, actorRole, action: 'Requested goal discussion', entityType: 'EmployeeGoal', entityId: goal.id });
        break;
      }
      case 'goal.acknowledge': {
        const goal = state.goals.find((item) => item.id === data.id);
        if (!goal) return fail('Goal not found.');
        if (!['Assigned', 'Resubmitted', 'Discussion Requested'].includes(goal.status)) return fail('Goal is not awaiting acknowledgement.');
        goal.status = 'Agreed';
        goal.acknowledgedAt = nowIso();
        goal.agreedVersion = goal.version;
        goal.updatedAt = nowIso();
        goal.history.push({ version: goal.version, at: nowIso(), actor, change: 'Employee acknowledged goal' });
        pushAudit(state, { actor, actorRole, action: 'Acknowledged goal', entityType: 'EmployeeGoal', entityId: goal.id });
        break;
      }
      case 'checkin.create': {
        const row: CheckIn = {
          id: id('chk'),
          cycleId: compact(data.cycleId) || activeCycle(state)?.id || '',
          employeeId: compact(data.employeeId),
          employeeName: compact(data.employeeName) || 'Employee',
          managerId: compact(data.managerId),
          date: compact(data.date) || nowIso().slice(0, 10),
          progressPercent: Number(data.progressPercent || 0),
          status: compact(data.status) || 'On Track',
          employeeReflection: compact(data.employeeReflection),
          managerFeedback: compact(data.managerFeedback),
          sharedNotes: compact(data.sharedNotes),
          privateManagerNotes: compact(data.privateManagerNotes) || undefined,
          commitments: Array.isArray(data.commitments)
            ? (data.commitments as any[]).map((item) => ({
                id: id('cmt'),
                text: compact(item.text),
                owner: compact(item.owner) || actor,
                dueDate: compact(item.dueDate) || nowIso().slice(0, 10),
                done: Boolean(item.done),
              }))
            : [],
          createdAt: nowIso(),
        };
        state.checkIns.unshift(row);
        pushAudit(state, { actor, actorRole, action: 'Created check-in', entityType: 'CheckIn', entityId: row.id });
        break;
      }
      case 'assessment.save': {
        const existing = state.assessments.find((item) => item.id === data.id);
        const items = Array.isArray(data.items) ? (data.items as any[]) : existing?.items || [];
        if (existing) {
          existing.items = items as any;
          existing.overallComments = compact(data.overallComments) || existing.overallComments;
          existing.strengths = compact(data.strengths) || existing.strengths;
          existing.improvements = compact(data.improvements) || existing.improvements;
          existing.status = (compact(data.status) as any) || existing.status;
          existing.updatedAt = nowIso();
        } else {
          state.assessments.unshift({
            id: id('asm'),
            cycleId: compact(data.cycleId) || activeCycle(state)?.id || '',
            employeeId: compact(data.employeeId),
            employeeName: compact(data.employeeName) || 'Employee',
            type: (compact(data.type) as any) || 'Self',
            status: (compact(data.status) as any) || 'Draft',
            items: items as any,
            overallComments: compact(data.overallComments),
            strengths: compact(data.strengths),
            improvements: compact(data.improvements),
            version: 1,
            createdAt: nowIso(),
            updatedAt: nowIso(),
          });
        }
        pushAudit(state, { actor, actorRole, action: 'Saved assessment', entityType: 'PerformanceAssessment', entityId: compact(data.id) || state.assessments[0]?.id || '' });
        break;
      }
      case 'assessment.submit': {
        const assessment = state.assessments.find((item) => item.id === data.id);
        if (!assessment) return fail('Assessment not found.');
        if (!assessment.items.length) return fail('Assessment has no items.');
        if (assessment.type === 'Manager') {
          for (const item of assessment.items) {
            if (item.selfRating != null && item.managerRating != null && Math.abs(item.selfRating - item.managerRating) >= 2 && !compact(item.varianceJustification)) {
              return fail(`Justification required for material variance on "${item.title}".`);
            }
          }
        }
        assessment.status = 'Submitted';
        assessment.submittedAt = nowIso();
        assessment.submittedBy = actor;
        assessment.updatedAt = nowIso();
        pushAudit(state, { actor, actorRole, action: 'Submitted assessment', entityType: 'PerformanceAssessment', entityId: assessment.id });
        break;
      }
      case 'rater.nominate': {
        const row: RaterAssignment = {
          id: id('rtr'),
          cycleId: compact(data.cycleId) || activeCycle(state)?.id || '',
          employeeId: compact(data.employeeId),
          employeeName: compact(data.employeeName) || 'Employee',
          raterId: compact(data.raterId),
          raterName: compact(data.raterName) || 'Rater',
          relationship: compact(data.relationship) || 'Peer',
          anonymous: data.anonymous !== false,
          status: 'Nominated',
        };
        state.raters.unshift(row);
        pushAudit(state, { actor, actorRole, action: 'Nominated 360 rater', entityType: 'RaterAssignment', entityId: row.id });
        break;
      }
      case 'rater.invite': {
        const row = state.raters.find((item) => item.id === data.id);
        if (!row) return fail('Rater assignment not found.');
        row.status = 'Invited';
        row.invitedAt = nowIso();
        pushTask(state, {
          cycleId: row.cycleId,
          employeeId: row.employeeId,
          employeeName: row.employeeName,
          type: '360 Invitation',
          title: `Complete 360 feedback for ${row.employeeName}`,
          assigneeId: row.raterId,
          assigneeName: row.raterName,
          dueDate: nowIso().slice(0, 10),
        });
        break;
      }
      case 'rater.submit': {
        const row = state.raters.find((item) => item.id === data.id);
        if (!row) return fail('Rater assignment not found.');
        row.scores = Array.isArray(data.scores) ? (data.scores as any) : [];
        row.status = 'Submitted';
        row.submittedAt = nowIso();
        pushAudit(state, { actor, actorRole, action: 'Submitted 360 response', entityType: 'RaterAssignment', entityId: row.id });
        break;
      }
      case 'calibration.propose': {
        const row = state.calibration.find((item) => item.id === data.id);
        if (row) {
          row.proposedScore = Number(data.proposedScore);
          row.proposedBand = ratingBandForScore(row.proposedScore, state.config.ratingBands);
          row.justification = compact(data.justification);
          row.status = 'Proposed';
        } else {
          state.calibration.unshift({
            id: id('cal'),
            cycleId: compact(data.cycleId) || activeCycle(state)?.id || '',
            employeeId: compact(data.employeeId),
            employeeName: compact(data.employeeName) || 'Employee',
            department: compact(data.department),
            originalScore: Number(data.originalScore || 0),
            originalBand: ratingBandForScore(Number(data.originalScore || 0), state.config.ratingBands),
            proposedScore: Number(data.proposedScore || 0),
            proposedBand: ratingBandForScore(Number(data.proposedScore || 0), state.config.ratingBands),
            justification: compact(data.justification),
            status: 'Proposed',
            committee: Array.isArray(data.committee) ? (data.committee as string[]) : ['HR Manager', 'Department Head'],
          });
        }
        pushAudit(state, { actor, actorRole, action: 'Proposed calibration adjustment', entityType: 'CalibrationCase', entityId: compact(data.id) || state.calibration[0]?.id || '' });
        break;
      }
      case 'calibration.decide': {
        const row = state.calibration.find((item) => item.id === data.id);
        if (!row) return fail('Calibration case not found.');
        const approve = compact(data.decision) === 'Approved';
        row.status = approve ? 'Approved' : 'Rejected';
        if (approve) {
          row.approvedScore = row.proposedScore ?? row.originalScore;
          row.approvedBand = ratingBandForScore(row.approvedScore, state.config.ratingBands);
        }
        row.decidedBy = actor;
        row.decidedAt = nowIso();
        pushAudit(state, { actor, actorRole, action: `Calibration ${row.status}`, entityType: 'CalibrationCase', entityId: row.id, reason: compact(data.reason) });
        break;
      }
      case 'result.compute': {
        const cycle = state.cycles.find((item) => item.id === data.cycleId) || activeCycle(state);
        if (!cycle) return fail('Cycle not found.');
        const employeeId = compact(data.employeeId);
        const goals = state.goals.filter((goal) => goal.cycleId === cycle.id && goal.employeeId === employeeId && ['Agreed', 'Active', 'Completed'].includes(goal.status));
        const managerAssessment = state.assessments.find((item) => item.cycleId === cycle.id && item.employeeId === employeeId && item.type === 'Manager' && ['Submitted', 'Approved'].includes(item.status));
        const companyScore = sectionScore(
          state.companyObjectives
            .filter((item) => item.cycleId === cycle.id && item.corporateAchievement != null)
            .map((item) => ({ weight: item.weight, achievement: Number(item.corporateAchievement) })),
          cycle.achievementCap,
        );
        const okrItems = (managerAssessment?.items.filter((item) => item.itemType === 'okr') || goals.map((goal) => ({
          weight: goal.weight,
          achievement: goal.achievementScore ?? goal.progressPercent,
        }))).map((item: any) => ({ weight: Number(item.weight || 0), achievement: Number(item.achievement ?? item.managerRating ?? 0) }));
        const behaviourItems = (managerAssessment?.items.filter((item) => item.itemType === 'behaviour') || state.config.behaviourIndicators.map((ind) => ({
          weight: ind.weight,
          achievement: 70,
        }))).map((item: any) => ({ weight: Number(item.weight || 0), achievement: Number(item.achievement ?? item.managerRating ?? 0) }));
        const score = finalScore([
          { contribution: cycle.sectionWeights.companyObjectives, items: companyScore ? [{ weight: 100, achievement: companyScore }] : [{ weight: 100, achievement: 0 }] },
          { contribution: cycle.sectionWeights.individualOkrs, items: okrItems.length ? okrItems : [{ weight: 100, achievement: 0 }] },
          { contribution: cycle.sectionWeights.behavioural, items: behaviourItems.length ? behaviourItems : [{ weight: 100, achievement: 0 }] },
        ], cycle.achievementCap);
        const calibrated = state.calibration.find((item) => item.cycleId === cycle.id && item.employeeId === employeeId && item.status === 'Approved');
        const final = calibrated?.approvedScore ?? score;
        const band = ratingBandForScore(final, cycle.ratingBands);
        const existing = state.results.find((item) => item.cycleId === cycle.id && item.employeeId === employeeId);
        if (existing) {
          existing.version += 1;
          existing.finalScore = final;
          existing.ratingBand = band;
          existing.sectionScores = {
            companyObjectives: companyScore,
            individualOkrs: sectionScore(okrItems, cycle.achievementCap),
            behavioural: sectionScore(behaviourItems, cycle.achievementCap),
          };
          existing.history.push({ version: existing.version, at: nowIso(), actor, score: final, band });
        } else {
          state.results.unshift({
            id: id('res'),
            cycleId: cycle.id,
            employeeId,
            employeeName: compact(data.employeeName) || 'Employee',
            sectionScores: {
              companyObjectives: companyScore,
              individualOkrs: sectionScore(okrItems, cycle.achievementCap),
              behavioural: sectionScore(behaviourItems, cycle.achievementCap),
            },
            finalScore: final,
            ratingBand: band,
            version: 1,
            status: 'Approved',
            managerComments: compact(data.managerComments),
            developmentRecommendations: compact(data.developmentRecommendations),
            history: [{ version: 1, at: nowIso(), actor, score: final, band }],
          });
        }
        pushAudit(state, { actor, actorRole, action: 'Computed performance result', entityType: 'PerformanceResult', entityId: employeeId, after: `${displayScore(final)} ${band}` });
        break;
      }
      case 'result.publish': {
        const result = state.results.find((item) => item.id === data.id);
        if (!result) return fail('Result not found.');
        if (!['Approved', 'Amended'].includes(result.status)) return fail('Result must be approved before publication.');
        result.status = 'Published';
        result.publishedAt = nowIso();
        pushTask(state, {
          cycleId: result.cycleId,
          employeeId: result.employeeId,
          employeeName: result.employeeName,
          type: 'Result Acknowledgement',
          title: 'Review and acknowledge published performance result',
          assigneeId: result.employeeId,
          assigneeName: result.employeeName,
          dueDate: activeCycle(state)?.appealDeadline || nowIso().slice(0, 10),
          href: '/workforce-portal?tab=performance',
        });
        pushAudit(state, { actor, actorRole, action: 'Published result', entityType: 'PerformanceResult', entityId: result.id });
        break;
      }
      case 'result.acknowledge': {
        const result = state.results.find((item) => item.id === data.id);
        if (!result) return fail('Result not found.');
        if (result.status !== 'Published' && result.status !== 'Amended') return fail('Result is not published.');
        result.acknowledgedAt = nowIso();
        pushAudit(state, { actor, actorRole, action: 'Acknowledged result', entityType: 'PerformanceResult', entityId: result.id });
        break;
      }
      case 'appeal.submit': {
        const result = state.results.find((item) => item.id === data.resultId);
        if (!result || result.status !== 'Published') return fail('Published result required.');
        const cycle = state.cycles.find((item) => item.id === result.cycleId);
        if (cycle?.appealDeadline && cycle.appealDeadline < nowIso().slice(0, 10)) return fail('Appeal window has closed.');
        const row: AppealCase = {
          id: id('apl'),
          cycleId: result.cycleId,
          resultId: result.id,
          employeeId: result.employeeId,
          employeeName: result.employeeName,
          disputedItems: Array.isArray(data.disputedItems) ? (data.disputedItems as string[]) : [compact(data.disputedItems)],
          reason: compact(data.reason),
          requestedOutcome: compact(data.requestedOutcome),
          evidence: compact(data.evidence) || undefined,
          status: 'Submitted',
          createdAt: nowIso(),
        };
        state.appeals.unshift(row);
        result.status = 'Appealed';
        pushAudit(state, { actor, actorRole, action: 'Submitted appeal', entityType: 'AppealCase', entityId: row.id });
        break;
      }
      case 'appeal.decide': {
        const appeal = state.appeals.find((item) => item.id === data.id);
        if (!appeal) return fail('Appeal not found.');
        const decision = compact(data.decision);
        appeal.status = decision === 'Amended' ? 'Amended' : decision === 'Upheld' ? 'Upheld' : 'Rejected';
        appeal.panelDecision = compact(data.panelDecision) || decision;
        appeal.decidedAt = nowIso();
        const result = state.results.find((item) => item.id === appeal.resultId);
        if (result && appeal.status === 'Amended' && data.newScore != null) {
          result.version += 1;
          result.finalScore = Number(data.newScore);
          result.ratingBand = ratingBandForScore(result.finalScore, state.config.ratingBands);
          result.status = 'Amended';
          result.history.push({ version: result.version, at: nowIso(), actor, score: result.finalScore, band: result.ratingBand, reason: 'Appeal amendment' });
        } else if (result && appeal.status !== 'Amended') {
          result.status = 'Published';
        }
        pushAudit(state, { actor, actorRole, action: `Appeal ${appeal.status}`, entityType: 'AppealCase', entityId: appeal.id });
        break;
      }
      case 'pip.upsert': {
        const existing = state.pips.find((item) => item.id === data.id);
        if (existing) {
          existing.reason = compact(data.reason) || existing.reason;
          existing.gaps = compact(data.gaps) || existing.gaps;
          existing.support = compact(data.support) || existing.support;
          existing.status = (compact(data.status) as any) || existing.status;
          existing.updatedAt = nowIso();
        } else {
          state.pips.unshift({
            id: id('pip'),
            employeeId: compact(data.employeeId),
            employeeName: compact(data.employeeName) || 'Employee',
            cycleId: compact(data.cycleId) || undefined,
            reason: compact(data.reason),
            gaps: compact(data.gaps),
            objectives: Array.isArray(data.objectives) ? (data.objectives as any) : [],
            support: compact(data.support),
            startDate: compact(data.startDate) || nowIso().slice(0, 10),
            endDate: compact(data.endDate) || nowIso().slice(0, 10),
            status: 'Pending HR',
            milestones: [],
            createdBy: actor,
            createdAt: nowIso(),
            updatedAt: nowIso(),
          });
        }
        pushAudit(state, { actor, actorRole, action: 'Upserted PIP', entityType: 'PipRecord', entityId: compact(data.id) || state.pips[0]?.id || '' });
        break;
      }
      case 'pip.activate': {
        const pip = state.pips.find((item) => item.id === data.id);
        if (!pip) return fail('PIP not found.');
        if (!pip.reason || !pip.gaps || !pip.objectives.length) return fail('PIP requires reason, gaps, and objectives before activation.');
        pip.status = 'Active';
        pip.updatedAt = nowIso();
        pushAudit(state, { actor, actorRole, action: 'Activated PIP', entityType: 'PipRecord', entityId: pip.id });
        break;
      }
      case 'development.upsert': {
        const existing = state.developmentPlans.find((item) => item.id === data.id);
        if (existing) {
          existing.need = compact(data.need) || existing.need;
          existing.actions = Array.isArray(data.actions) ? (data.actions as any) : existing.actions;
          existing.status = compact(data.status) || existing.status;
          existing.updatedAt = nowIso();
        } else {
          state.developmentPlans.unshift({
            id: id('dev'),
            employeeId: compact(data.employeeId),
            employeeName: compact(data.employeeName) || 'Employee',
            cycleId: compact(data.cycleId) || undefined,
            need: compact(data.need),
            actions: Array.isArray(data.actions) ? (data.actions as any) : [],
            priority: compact(data.priority) || 'Normal',
            status: 'Active',
            createdAt: nowIso(),
            updatedAt: nowIso(),
          });
        }
        break;
      }
      case 'recognition.upsert': {
        state.recognitions.unshift({
          id: id('rec'),
          employeeId: compact(data.employeeId),
          employeeName: compact(data.employeeName) || 'Employee',
          type: (compact(data.type) as any) || 'Recognition',
          justification: compact(data.justification),
          status: 'Pending HR',
          recommendedBy: actor,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
        pushAudit(state, { actor, actorRole, action: 'Created recognition recommendation', entityType: 'RecognitionRecommendation', entityId: state.recognitions[0].id });
        break;
      }
      case 'recognition.advance': {
        const row = state.recognitions.find((item) => item.id === data.id);
        if (!row) return fail('Recommendation not found.');
        row.status = (compact(data.status) as any) || row.status;
        row.updatedAt = nowIso();
        if (row.status === 'Approved') row.downstreamRef = `PAYROLL-INSTR-${row.id}`;
        pushAudit(state, { actor, actorRole, action: `Recognition ${row.status}`, entityType: 'RecognitionRecommendation', entityId: row.id });
        break;
      }
      case 'probation.upsert-okrs': {
        const record = state.probation.find((item) => item.id === data.id);
        if (!record) return fail('Probation record not found.');
        record.okrs = Array.isArray(data.okrs) ? (data.okrs as any) : record.okrs;
        record.status = 'Active';
        record.updatedAt = nowIso();
        pushAudit(state, { actor, actorRole, action: 'Updated probation OKRs', entityType: 'ProbationRecord', entityId: record.id });
        break;
      }
      case 'probation.recommend': {
        const record = state.probation.find((item) => item.id === data.id);
        if (!record) return fail('Probation record not found.');
        record.recommendation = compact(data.recommendation) as any;
        record.status = 'Pending HR';
        record.updatedAt = nowIso();
        pushAudit(state, { actor, actorRole, action: 'Probation recommendation', entityType: 'ProbationRecord', entityId: record.id, after: record.recommendation });
        break;
      }
      case 'probation.decide': {
        const record = state.probation.find((item) => item.id === data.id);
        if (!record) return fail('Probation record not found.');
        const decision = compact(data.decision) as ProbationRecord['decision'];
        record.decision = decision;
        record.decisionReason = compact(data.reason);
        record.decidedBy = actor;
        record.decidedAt = nowIso();
        if (decision === 'Extend') {
          record.status = 'Extended';
          record.extensionEndDate = compact(data.extensionEndDate) || record.endDate;
          record.endDate = record.extensionEndDate;
        } else if (decision === 'Confirm') {
          record.status = 'Confirmed';
        } else {
          record.status = 'Not Confirmed';
        }
        record.updatedAt = nowIso();
        pushAudit(state, { actor, actorRole, action: `Probation ${record.status}`, entityType: 'ProbationRecord', entityId: record.id, reason: record.decisionReason });
        break;
      }
      case 'config.update': {
        if (data.sectionWeights) state.config.sectionWeights = data.sectionWeights as any;
        if (Array.isArray(data.ratingBands)) state.config.ratingBands = data.ratingBands as any;
        if (data.achievementCap != null) state.config.achievementCap = Number(data.achievementCap);
        if (data.anonymityThreshold != null) state.config.anonymityThreshold = Number(data.anonymityThreshold);
        pushAudit(state, { actor, actorRole, action: 'Updated performance configuration', entityType: 'PerformanceConfig', entityId: 'config' });
        break;
      }
      default:
        return fail(`Unknown action: ${body.action}`);
    }

    const saved = await writeState(state);
    return { ok: true, state: saved, message: 'Action applied.' };
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Action failed.');
  }
};

export const getEssPerformanceBundle = async (employeeId: string, employeeCode?: string) => {
  const state = await readState();
  const match = (value: string) => {
    const idValue = compact(employeeId).toLowerCase();
    const codeValue = compact(employeeCode).toLowerCase();
    const row = compact(value).toLowerCase();
    return Boolean(row) && (row === idValue || row === codeValue);
  };
  const goals = state.goals.filter((goal) => match(goal.employeeId) || match(goal.employeeCode));
  const results = state.results.filter((item) => match(item.employeeId));
  const assessments = state.assessments.filter((item) => match(item.employeeId));
  const checkIns = state.checkIns.filter((item) => match(item.employeeId));
  const developmentPlans = state.developmentPlans.filter((item) => match(item.employeeId));
  const tasks = state.tasks.filter((item) => match(item.employeeId) || match(item.assigneeId));
  return { goals, results, assessments, checkIns, developmentPlans, tasks, appeals: state.appeals.filter((item) => match(item.employeeId)) };
};
