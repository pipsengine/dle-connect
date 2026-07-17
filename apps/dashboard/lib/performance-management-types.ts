import type { LucideIcon } from 'lucide-react';

export type PerformanceRole =
  | 'Employee'
  | 'Supervisor'
  | 'Project Manager'
  | 'HR Officer'
  | 'HR Manager'
  | 'Executive Management'
  | 'Super Administrator';

export type PerformanceMenuItem = {
  id: string;
  label: string;
  /** Path segment(s) under /hris/performance-management */
  route: string;
  icon: LucideIcon;
  /** Roles that can see this item. Omit = inherit from parent or all authenticated HRIS users. */
  roles?: PerformanceRole[];
  permissions?: string[];
  featureFlag?: string;
  badgeKey?: string;
  keywords?: string[];
  children?: PerformanceMenuItem[];
};

export type PerformanceNavPreferences = {
  favorites: string[];
  recent: string[];
  expandedGroups: string[];
  sidebarCollapsed: boolean;
};

export type PerformanceBadgeMap = Record<string, number | string>;

export type PerformanceAiHighlight = {
  menuId: string;
  label: string;
  route: string;
  reason: string;
  priority: number;
};

export type PerformancePermissions = {
  canViewAdmin: boolean;
  canManageCycles: boolean;
  canReview: boolean;
  canApprove: boolean;
  canExport: boolean;
  canConfigure: boolean;
  readOnlyExecutive: boolean;
};

export type PerformanceWorkflowStage = {
  id: string;
  label: string;
  completed: number;
  total: number;
  percent: number;
  dueDate: string;
  status: 'completed' | 'active' | 'pending';
  tone: 'blue' | 'orange' | 'purple' | 'cyan' | 'slate';
};

export type PerformanceDashboardData = {
  employees: number;
  employeesTrend: number | null;
  reviewsCompleted: number;
  reviewsCompletedPct: number;
  reviewsCompletedTrend: number | null;
  pendingReviews: number;
  pendingReviewsPct: number;
  pendingReviewsTrend: number | null;
  goalCompletionPct: number;
  goalCompletionTrend: number | null;
  highPerformers: number;
  highPerformersPct: number;
  highPerformersTrend: number | null;
  pipEmployees: number;
  pipEmployeesPct: number;
  pipEmployeesTrend: number | null;
  cycle: {
    name: string;
    type: string;
    startDate: string;
    endDate: string;
    deadline: string;
    daysRemaining: number;
    employeesInCycle: number;
    completedReviews: number;
    pendingReviews: number;
    locked: boolean;
  };
  workflow: {
    currentStage: string;
    stageOwner: string;
    autoRefreshSeconds: number;
    stages: PerformanceWorkflowStage[];
  };
  aiInsights: Array<{ id: string; text: string; tone: 'blue' | 'amber' | 'emerald' | 'violet' | 'red' }>;
  goalProgress: { completed: number; inProgress: number; notStarted: number; avgCompletion: number };
  ratingDistribution: Array<{ label: string; count: number; tone: string }>;
  departmentPerformance: Array<{ department: string; completionPct: number; avgRating: number; pending: number }>;
  performanceHealth: { score: number; goals: number; reviews: number; calibration: number; competencies: number; feedback: number };
  upcomingDeadlines: Array<{ id: string; title: string; date: string; daysRemaining: number; tone: 'red' | 'amber' | 'slate' }>;
  recentActivity: Array<{ id: string; actor: string; action: string; detail: string; at: string; tone: string }>;
  talentOverview: {
    promotionReady: number;
    highPotential: number;
    successionReady: number;
    criticalTalent: number;
    retirementRisk: number;
    attritionRisk: number;
  };
  managerSummary: {
    teamMembers: number;
    pendingReviews: number;
    completedReviews: number;
    goalCompletionPct: number;
    checkInsDue: number;
  };
  calendarEvents: Array<{ date: string; type: 'review' | 'calibration' | 'deadline'; label: string }>;
  sparklines: {
    employees: number[];
    reviewsCompleted: number[];
    pendingReviews: number[];
    goalCompletion: number[];
    highPerformers: number[];
    pipEmployees: number[];
  };
  systemStatus: {
    online: boolean;
    lastSync: string;
    activeCycleLabel: string;
    attendanceDevicesOnline: number;
    attendanceDevicesTotal: number;
    attendanceDevicesLabel?: string;
    dataSource?: string;
    dataWarning?: string | null;
  };
};

export type PerformanceCycleRecord = {
  id: string;
  name: string;
  type: string;
  period: string;
  startDate: string;
  endDate: string;
  employees: number;
  progress: number;
  status: 'Active' | 'Completed' | 'Upcoming' | 'Draft' | 'Closed';
  workflow: string;
  owner: string;
  lastUpdated: string;
};

export type PerformanceCyclesPageData = {
  summary: {
    totalCycles: number;
    totalCyclesTrend: number;
    activeCycles: number;
    upcomingCycles: number;
    completedCycles: number;
    employeesCovered: number;
    completionRate: number;
    completionRateTrend: number;
  };
  overview: {
    active: number;
    upcoming: number;
    completed: number;
    closed: number;
    total: number;
  };
  activeCycle: {
    name: string;
    period: string;
    employees: number;
    departments: number;
    reviewers: number;
    progress: number;
  };
  aiInsight: {
    onTrackPct: number;
    highlights: string[];
    recommendation: string;
  };
  workflowHealth: Array<{ label: string; percent: number }>;
  cycles: PerformanceCycleRecord[];
  departments: string[];
};

export type PerformancePayload = {
  generatedAt: string;
  source: string;
  role: PerformanceRole;
  roles: PerformanceRole[];
  permissions: PerformancePermissions;
  badges: PerformanceBadgeMap;
  aiHighlights: PerformanceAiHighlight[];
  activeCycle: { id: string; name: string; status: string; deadline: string | null } | null;
  summary: {
    pendingSelfAppraisal: number;
    pendingSupervisorReview: number;
    pendingProjectReview: number;
    activePip: number;
    promotionCandidates: number;
    trainingRecommendations: number;
    notifications: number;
  };
  dashboard: PerformanceDashboardData;
  cyclesPage?: PerformanceCyclesPageData;
  preferences: PerformanceNavPreferences;
};
