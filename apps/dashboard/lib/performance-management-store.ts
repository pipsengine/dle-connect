import { readPayrollEmployees } from '@/lib/payroll-employee-source';
import {
  defaultPerformanceRoles,
  filterMenuByRole,
  performanceMenuTree,
  resolvePerformanceRole,
} from '@/lib/performance-management-menu-config';
import type {
  PerformanceAiHighlight,
  PerformanceBadgeMap,
  PerformanceCyclesPageData,
  PerformanceDashboardData,
  PerformanceNavPreferences,
  PerformancePayload,
  PerformancePermissions,
  PerformanceRole,
} from '@/lib/performance-management-types';

const defaultPreferences = (): PerformanceNavPreferences => ({
  favorites: [],
  recent: [],
  expandedGroups: ['planning', 'performance-reviews'],
  sidebarCollapsed: false,
});

const rolePermissions = (role: PerformanceRole): PerformancePermissions => {
  const isAdmin = role === 'Super Administrator';
  const isHr = role === 'HR Officer' || role === 'HR Manager' || isAdmin;
  const isManager = role === 'Supervisor' || role === 'Project Manager' || isHr;
  const isExecutive = role === 'Executive Management';
  return {
    canViewAdmin: isAdmin,
    canManageCycles: isHr,
    canReview: isManager,
    canApprove: isHr || role === 'Supervisor' || role === 'Project Manager',
    canExport: isHr || isManager,
    canConfigure: isAdmin,
    readOnlyExecutive: isExecutive,
  };
};

const deriveBadges = async (role: PerformanceRole): Promise<{ badges: PerformanceBadgeMap; summary: PerformancePayload['summary'] }> => {
  let employeeCount = 0;
  try {
    const source = await readPayrollEmployees();
    employeeCount = source.employees?.length ?? 0;
  } catch {
    employeeCount = 0;
  }

  const base = Math.max(3, Math.min(25, Math.round(employeeCount * 0.08)));
  const supervisorReview = role === 'Supervisor' || role === 'Project Manager' || role === 'HR Officer' || role === 'HR Manager' || role === 'Super Administrator'
    ? Math.max(6, base + 10)
    : 0;
  const selfAppraisal = role === 'Employee' || role === 'Supervisor' || role === 'Project Manager' ? Math.max(2, Math.round(base * 0.4)) : 0;
  const pip = role === 'Supervisor' || role === 'HR Officer' || role === 'HR Manager' || role === 'Super Administrator' ? Math.max(1, Math.round(base * 0.15)) : 0;
  const promotion = role === 'Supervisor' || role === 'HR Manager' || role === 'Super Administrator' ? Math.max(4, Math.round(base * 0.6)) : 0;
  const training = role === 'HR Officer' || role === 'HR Manager' || role === 'Super Administrator' ? Math.max(8, base) : 0;
  const notifications = role === 'Super Administrator' ? 7 : role === 'HR Manager' ? 5 : 0;

  const summary = {
    pendingSelfAppraisal: selfAppraisal,
    pendingSupervisorReview: supervisorReview,
    pendingProjectReview: role === 'Project Manager' ? Math.max(3, Math.round(base * 0.35)) : 0,
    activePip: pip,
    promotionCandidates: promotion,
    trainingRecommendations: training,
    notifications,
  };

  const badges: PerformanceBadgeMap = {};
  if (supervisorReview) badges['supervisor-review'] = supervisorReview;
  if (selfAppraisal) badges['self-appraisal'] = selfAppraisal;
  if (summary.pendingProjectReview) badges['project-manager-review'] = summary.pendingProjectReview;
  if (pip) badges.pip = pip;
  if (promotion) badges['promotion-recommendations'] = promotion;
  if (training) badges['training-recommendations'] = training;
  if (notifications) badges.notifications = notifications;
  badges['performance-cycles'] = 'Active';

  return { badges, summary };
};

const deriveAiHighlights = (role: PerformanceRole, summary: PerformancePayload['summary']): PerformanceAiHighlight[] => {
  const highlights: PerformanceAiHighlight[] = [];

  if (summary.pendingSupervisorReview > 0 && (role === 'Supervisor' || role === 'Project Manager')) {
    highlights.push({
      menuId: 'supervisor-review',
      label: 'Supervisor Review',
      route: 'performance-reviews/supervisor-review',
      reason: `${summary.pendingSupervisorReview} team appraisals awaiting your review`,
      priority: 100,
    });
  }
  if (summary.pendingSelfAppraisal > 0 && (role === 'Employee' || role === 'Supervisor')) {
    highlights.push({
      menuId: 'self-appraisal',
      label: 'Self Appraisal',
      route: 'performance-reviews/self-appraisal',
      reason: 'Your self-appraisal is incomplete for the active cycle',
      priority: 95,
    });
  }
  if (role === 'HR Manager' || role === 'HR Officer' || role === 'Super Administrator') {
    highlights.push({
      menuId: 'performance-cycles',
      label: 'Performance Cycles',
      route: 'planning/performance-cycles',
      reason: 'Active appraisal cycle deadline is approaching',
      priority: 90,
    });
  }
  if (role === 'Executive Management' || role === 'HR Manager') {
    highlights.push({
      menuId: 'executive-dashboard',
      label: 'Executive Dashboard',
      route: 'reports-analytics/executive-dashboard',
      reason: 'Executive performance snapshot ready',
      priority: 85,
    });
    highlights.push({
      menuId: 'ai-insights',
      label: 'AI Insights',
      route: 'ai-intelligence/ai-insights',
      reason: 'New talent and performance signals detected',
      priority: 80,
    });
  }
  if (summary.activePip > 0 && (role === 'Supervisor' || role === 'HR Officer')) {
    highlights.push({
      menuId: 'pip',
      label: 'Performance Improvement Plan',
      route: 'improvement/pip',
      reason: `${summary.activePip} active PIP cases need attention`,
      priority: 75,
    });
  }

  return highlights.sort((a, b) => b.priority - a.priority).slice(0, 5);
};

const sparkline = (base: number, variance = 0.08, points = 8) =>
  Array.from({ length: points }, (_, index) => {
    const wave = Math.sin(index * 0.9) * variance;
    return Math.max(0, Math.round(base * (1 + wave + index * 0.01)));
  });

const deriveDashboardData = (employeeCount: number, summary: PerformancePayload['summary']): PerformanceDashboardData => {
  const employees = employeeCount || 606;
  const reviewsCompleted = Math.max(0, employees - summary.pendingSupervisorReview - summary.pendingSelfAppraisal);
  const pendingReviews = summary.pendingSupervisorReview + summary.pendingSelfAppraisal;
  const reviewsCompletedPct = employees ? Math.round((reviewsCompleted / employees) * 1000) / 10 : 0;
  const pendingReviewsPct = employees ? Math.round((pendingReviews / employees) * 1000) / 10 : 0;
  const goalCompletionPct = 84;
  const highPerformers = Math.max(1, Math.round(employees * 0.104));
  const pipEmployees = summary.activePip || 4;

  return {
    employees,
    employeesTrend: 8.4,
    reviewsCompleted,
    reviewsCompletedPct,
    reviewsCompletedTrend: 12.8,
    pendingReviews,
    pendingReviewsPct,
    pendingReviewsTrend: -4.2,
    goalCompletionPct,
    goalCompletionTrend: 6.7,
    highPerformers,
    highPerformersPct: Math.round((highPerformers / employees) * 1000) / 10,
    highPerformersTrend: 9.1,
    pipEmployees,
    pipEmployeesPct: Math.round((pipEmployees / employees) * 1000) / 10,
    pipEmployeesTrend: -0.2,
    cycle: {
      name: 'H1 2026',
      type: 'Half Yearly',
      startDate: '2026-01-01',
      endDate: '2026-06-30',
      deadline: '2026-06-30',
      daysRemaining: 17,
      employeesInCycle: employees,
      completedReviews: reviewsCompleted,
      pendingReviews,
      locked: false,
    },
    workflow: {
      currentStage: 'Supervisor Review',
      stageOwner: 'Line Managers',
      autoRefreshSeconds: 30,
      stages: [
        { id: 'self', label: 'Self Appraisal', completed: 472, total: employees, percent: 78, dueDate: '2026-05-15', status: 'completed', tone: 'blue' },
        { id: 'supervisor', label: 'Supervisor Review', completed: 318, total: employees, percent: 52, dueDate: '2026-06-10', status: 'active', tone: 'blue' },
        { id: 'manager', label: 'Manager Review', completed: 186, total: employees, percent: 31, dueDate: '2026-06-18', status: 'pending', tone: 'orange' },
        { id: '360', label: '360 Review', completed: 94, total: employees, percent: 16, dueDate: '2026-06-22', status: 'pending', tone: 'purple' },
        { id: 'calibration', label: 'Calibration', completed: 0, total: employees, percent: 0, dueDate: '2026-06-25', status: 'pending', tone: 'cyan' },
        { id: 'final', label: 'Final Rating', completed: 0, total: employees, percent: 0, dueDate: '2026-06-28', status: 'pending', tone: 'slate' },
        { id: 'completed', label: 'Completed', completed: 0, total: employees, percent: 0, dueDate: '2026-06-30', status: 'pending', tone: 'slate' },
      ],
    },
    aiInsights: [
      { id: '1', text: `${pendingReviews} reviews are pending supervisor action before the H1 deadline.`, tone: 'blue' },
      { id: '2', text: 'Engineering department is 82% complete — highest completion rate this cycle.', tone: 'emerald' },
      { id: '3', text: '14 employees show declining goal progress over the last 30 days.', tone: 'amber' },
      { id: '4', text: '8 high-potential employees are ready for succession pipeline review.', tone: 'violet' },
      { id: '5', text: '3 PIP cases require HR calibration before final evaluation.', tone: 'red' },
    ],
    goalProgress: { completed: 51, inProgress: 33, notStarted: 16, avgCompletion: goalCompletionPct },
    ratingDistribution: [
      { label: 'Excellent (5)', count: 142, tone: '#10B981' },
      { label: 'Very Good (4)', count: 218, tone: '#2563EB' },
      { label: 'Good (3)', count: 164, tone: '#06B6D4' },
      { label: 'Needs Improvement (2)', count: 58, tone: '#F59E0B' },
      { label: 'Poor (1)', count: 24, tone: '#EF4444' },
    ],
    departmentPerformance: [
      { department: 'Engineering', completionPct: 82, avgRating: 4.2, pending: 18 },
      { department: 'Operations', completionPct: 76, avgRating: 3.9, pending: 24 },
      { department: 'Finance', completionPct: 88, avgRating: 4.1, pending: 9 },
      { department: 'HR & Admin', completionPct: 91, avgRating: 4.3, pending: 6 },
      { department: 'Projects', completionPct: 69, avgRating: 3.7, pending: 31 },
    ],
    performanceHealth: { score: 91, goals: 88, reviews: 81, calibration: 72, competencies: 86, feedback: 79 },
    upcomingDeadlines: [
      { id: 'd1', title: 'Supervisor Review Cut-off', date: '2026-06-10', daysRemaining: 7, tone: 'red' },
      { id: 'd2', title: 'Manager Review Cut-off', date: '2026-06-18', daysRemaining: 15, tone: 'amber' },
      { id: 'd3', title: '360 Feedback Close', date: '2026-06-22', daysRemaining: 19, tone: 'amber' },
      { id: 'd4', title: 'Calibration Session', date: '2026-06-25', daysRemaining: 22, tone: 'slate' },
      { id: 'd5', title: 'H1 Cycle Deadline', date: '2026-06-30', daysRemaining: 27, tone: 'red' },
    ],
    recentActivity: [
      { id: 'a1', actor: 'Jane Cooper', action: 'submitted self appraisal', detail: 'Engineering · H1 2026', at: '2 hours ago', tone: 'blue' },
      { id: 'a2', actor: 'David Okonkwo', action: 'completed supervisor review', detail: 'Operations · 4.2 rating', at: '3 hours ago', tone: 'emerald' },
      { id: 'a3', actor: 'HR System', action: 'sent review reminders', detail: '114 pending supervisors', at: '5 hours ago', tone: 'amber' },
      { id: 'a4', actor: 'Sarah Mensah', action: 'updated development plan', detail: 'Finance · Leadership track', at: 'Yesterday', tone: 'violet' },
      { id: 'a5', actor: 'Michael Adeyemi', action: 'flagged for promotion review', detail: 'Projects · High performer', at: 'Yesterday', tone: 'cyan' },
    ],
    talentOverview: {
      promotionReady: 18,
      highPotential: 46,
      successionReady: 27,
      criticalTalent: 35,
      retirementRisk: 12,
      attritionRisk: 8,
    },
    managerSummary: {
      teamMembers: 24,
      pendingReviews: summary.pendingSupervisorReview || 8,
      completedReviews: 16,
      goalCompletionPct: 87,
      checkInsDue: 3,
    },
    calendarEvents: [
      { date: '2026-07-08', type: 'review', label: 'Supervisor review window' },
      { date: '2026-07-12', type: 'calibration', label: 'Calibration committee' },
      { date: '2026-07-18', type: 'deadline', label: 'Manager review deadline' },
      { date: '2026-07-22', type: 'review', label: '360 feedback close' },
      { date: '2026-07-30', type: 'deadline', label: 'H1 cycle close' },
    ],
    sparklines: {
      employees: sparkline(employees, 0.04),
      reviewsCompleted: sparkline(reviewsCompleted, 0.1),
      pendingReviews: sparkline(pendingReviews, 0.12),
      goalCompletion: sparkline(goalCompletionPct, 0.05),
      highPerformers: sparkline(highPerformers, 0.07),
      pipEmployees: sparkline(pipEmployees, 0.15),
    },
    systemStatus: {
      online: true,
      lastSync: new Date().toISOString(),
      activeCycleLabel: 'H1 2026',
      attendanceDevicesOnline: 18,
      attendanceDevicesTotal: 18,
    },
  };
};

const derivePerformanceCyclesPage = (employeesCovered: number): PerformanceCyclesPageData => ({
  summary: {
    totalCycles: 12,
    totalCyclesTrend: 18,
    activeCycles: 3,
    upcomingCycles: 2,
    completedCycles: 7,
    employeesCovered: employeesCovered || 1248,
    completionRate: 68,
    completionRateTrend: 4.2,
  },
  overview: { active: 3, upcoming: 2, completed: 7, closed: 0, total: 12 },
  activeCycle: {
    name: 'H1 2026 Performance Cycle',
    period: '01 Jan 2026 – 30 Jun 2026',
    employees: employeesCovered || 1248,
    departments: 18,
    reviewers: 284,
    progress: 68,
  },
  aiInsight: {
    onTrackPct: 78,
    highlights: [
      'Engineering Department has the highest review completion rate.',
      'Sales Department requires attention — 24% below target.',
      '12 supervisors have overdue approvals.',
    ],
    recommendation: 'Send reminder notifications to supervisors in Projects and Sales before the 10 Jun cut-off.',
  },
  workflowHealth: [
    { label: 'Goal Assignment', percent: 94 },
    { label: 'Self Review', percent: 78 },
    { label: 'Supervisor Review', percent: 52 },
    { label: 'Calibration', percent: 0 },
    { label: 'Approval', percent: 0 },
    { label: 'Completion', percent: 68 },
  ],
  departments: ['All Departments', 'Engineering', 'Projects', 'Finance', 'Procurement', 'Commercial', 'HSE', 'Human Resources', 'Operations'],
  cycles: [
    { id: 'c1', name: 'H1 2026 Performance Cycle', type: 'Half Yearly', period: 'H1 2026', startDate: '2026-01-01', endDate: '2026-06-30', employees: employeesCovered || 1248, progress: 68, status: 'Active', workflow: 'Supervisor Review', owner: 'HR Operations', lastUpdated: '2026-07-03' },
    { id: 'c2', name: 'FY 2025 Annual Review', type: 'Annual', period: 'FY 2025', startDate: '2025-01-01', endDate: '2025-12-31', employees: 1186, progress: 100, status: 'Completed', workflow: 'Closed', owner: 'HR Director', lastUpdated: '2026-01-15' },
    { id: 'c3', name: 'Q4 2025 Quarterly Review', type: 'Quarterly', period: 'Q4 2025', startDate: '2025-10-01', endDate: '2025-12-31', employees: 1205, progress: 92, status: 'Completed', workflow: 'Closed', owner: 'HR Operations', lastUpdated: '2026-01-08' },
    { id: 'c4', name: 'Q3 2025 Review', type: 'Quarterly', period: 'Q3 2025', startDate: '2025-07-01', endDate: '2025-09-30', employees: 1202, progress: 100, status: 'Completed', workflow: 'Closed', owner: 'HR Operations', lastUpdated: '2025-10-12' },
    { id: 'c5', name: 'Mid-Year Engineering Review', type: 'Half Yearly', period: 'H1 2026', startDate: '2026-01-01', endDate: '2026-06-30', employees: 982, progress: 74, status: 'Active', workflow: 'Supervisor Review', owner: 'Engineering HRBP', lastUpdated: '2026-07-02' },
    { id: 'c6', name: 'Executive Leadership Review', type: 'Annual', period: 'FY 2025', startDate: '2025-10-01', endDate: '2025-12-31', employees: 45, progress: 95, status: 'Upcoming', workflow: 'Not Started', owner: 'CHRO Office', lastUpdated: '2026-06-28' },
    { id: 'c7', name: 'Graduate Trainee Review', type: 'Probation', period: 'H1 2026', startDate: '2026-04-01', endDate: '2026-06-30', employees: 73, progress: 58, status: 'Active', workflow: 'Self Review', owner: 'Talent Development', lastUpdated: '2026-07-01' },
    { id: 'c8', name: 'Operations Performance Cycle', type: 'Quarterly', period: 'Q2 2026', startDate: '2026-04-01', endDate: '2026-06-30', employees: 324, progress: 81, status: 'Upcoming', workflow: 'Draft', owner: 'Operations HRBP', lastUpdated: '2026-06-20' },
  ],
});

const navPrefsStore = new Map<string, PerformanceNavPreferences>();

export const readPerformanceNavPreferences = (userKey: string): PerformanceNavPreferences => {
  const cached = navPrefsStore.get(userKey);
  if (cached) return cached;
  return defaultPreferences();
};

export const writePerformanceNavPreferences = (userKey: string, prefs: PerformanceNavPreferences) => {
  navPrefsStore.set(userKey, prefs);
  return prefs;
};

export const readPerformanceManagementPayload = async (
  route: string,
  roleInput?: string | null,
  userKey = 'default',
  permissions: string[] = [],
): Promise<PerformancePayload> => {
  const role = resolvePerformanceRole(roleInput);
  const { badges, summary } = await deriveBadges(role);
  let employeeCount = 0;
  try {
    const source = await readPayrollEmployees();
    employeeCount = source.employees?.length ?? 0;
  } catch {
    employeeCount = 0;
  }
  const permissionsObj = rolePermissions(role);
  const preferences = readPerformanceNavPreferences(userKey);
  const aiHighlights = deriveAiHighlights(role, summary);
  const visibleMenu = filterMenuByRole(performanceMenuTree, role, permissions);
  const dashboard = deriveDashboardData(employeeCount, summary);
  const cyclesPage = route.includes('performance-cycles') ? derivePerformanceCyclesPage(employeeCount || 1248) : undefined;

  return {
    generatedAt: new Date().toISOString(),
    source: 'performance-management-store',
    role,
    roles: defaultPerformanceRoles,
    permissions: permissionsObj,
    badges,
    aiHighlights,
    activeCycle: visibleMenu.some((item) => item.id === 'planning')
      ? { id: 'cycle-2026-h1', name: 'H1 2026 Performance Cycle', status: 'Active', deadline: '2026-06-30' }
      : null,
    summary,
    dashboard,
    cyclesPage,
    preferences,
  };
};

export const updatePerformanceNavAction = (
  userKey: string,
  action: { type: 'toggle-favorite' | 'add-recent' | 'toggle-group' | 'reorder-favorites' | 'set-collapsed'; id?: string; favorites?: string[]; collapsed?: boolean },
) => {
  const prefs = { ...readPerformanceNavPreferences(userKey) };

  if (action.type === 'toggle-favorite' && action.id) {
    const set = new Set(prefs.favorites);
    if (set.has(action.id)) set.delete(action.id);
    else set.add(action.id);
    prefs.favorites = Array.from(set);
  }
  if (action.type === 'reorder-favorites' && action.favorites) {
    prefs.favorites = action.favorites;
  }
  if (action.type === 'add-recent' && action.id) {
    prefs.recent = [action.id, ...prefs.recent.filter((item) => item !== action.id)].slice(0, 8);
  }
  if (action.type === 'toggle-group' && action.id) {
    const set = new Set(prefs.expandedGroups);
    if (set.has(action.id)) set.delete(action.id);
    else set.add(action.id);
    prefs.expandedGroups = Array.from(set);
  }
  if (action.type === 'set-collapsed' && typeof action.collapsed === 'boolean') {
    prefs.sidebarCollapsed = action.collapsed;
  }

  return writePerformanceNavPreferences(userKey, prefs);
};

export const performanceMenuForRole = (role: PerformanceRole, permissions: string[] = []) =>
  filterMenuByRole(performanceMenuTree, role, permissions);
