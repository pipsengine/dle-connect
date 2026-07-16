import type { PerformancePayload, PerformanceRole } from '@/lib/performance-management-types';

export type CycleStatus =
  | 'Draft'
  | 'Pending Approval'
  | 'Published'
  | 'Goal Setting'
  | 'Active'
  | 'Mid-Year Review'
  | 'Year-End Review'
  | 'Calibration'
  | 'Approved'
  | 'Results Published'
  | 'Appeal Window'
  | 'Closed'
  | 'Archived';

export type GoalStatus =
  | 'Draft'
  | 'Pending Approval'
  | 'Assigned'
  | 'Discussion Requested'
  | 'Resubmitted'
  | 'Agreed'
  | 'Active'
  | 'Completed'
  | 'Cancelled'
  | 'Deferred'
  | 'Archived';

export type AssessmentStatus =
  | 'Not Started'
  | 'Draft'
  | 'Submitted'
  | 'Returned'
  | 'Pending Contributor'
  | 'Pending Manager'
  | 'Pending HR'
  | 'Pending Calibration'
  | 'Approved'
  | 'Published'
  | 'Appealed'
  | 'Closed';

export type PerformanceAuditEvent = {
  id: string;
  at: string;
  actor: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: string | null;
  after?: string | null;
  reason?: string;
  correlationId?: string;
};

export type PerformanceTask = {
  id: string;
  cycleId: string;
  employeeId: string;
  employeeName: string;
  type: string;
  title: string;
  assigneeId: string;
  assigneeName: string;
  dueDate: string;
  status: 'Queued' | 'Assigned' | 'In Progress' | 'Completed' | 'Returned' | 'Delegated' | 'Overdue' | 'Escalated' | 'Cancelled';
  href?: string;
  createdAt: string;
  completedAt?: string;
};

export type RatingBand = { min: number; max: number; label: string };

export type PerformanceCycle = {
  id: string;
  name: string;
  type: string;
  year: number;
  description: string;
  status: CycleStatus;
  startDate: string;
  endDate: string;
  goalSettingStart: string;
  goalSettingEnd: string;
  midYearStart?: string;
  midYearEnd?: string;
  yearEndStart?: string;
  yearEndEnd?: string;
  calibrationStart?: string;
  calibrationEnd?: string;
  publicationDate?: string;
  appealDeadline?: string;
  sectionWeights: { companyObjectives: number; individualOkrs: number; behavioural: number };
  ratingBands: RatingBand[];
  achievementCap: number;
  enable360: boolean;
  enableMatrix: boolean;
  enableCalibration: boolean;
  enableForcedDistribution: boolean;
  templateId?: string;
  populationRule: string;
  eligibilityCount: number;
  version: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
};

export type CycleEligibility = {
  id: string;
  cycleId: string;
  employeeId: string;
  employeeCode: string;
  fullName: string;
  department: string;
  jobTitle: string;
  managerId: string;
  managerName: string;
  included: boolean;
  reason: string;
  snapshotAt: string;
};

export type CompanyObjective = {
  id: string;
  cycleId: string;
  code: string;
  title: string;
  description: string;
  strategicPillar: string;
  owner: string;
  kpi: string;
  baseline: number;
  target: number;
  unit: string;
  weight: number;
  status: 'Draft' | 'Pending Approval' | 'Published' | 'Scored' | 'Locked';
  corporateAchievement?: number;
  version: number;
  createdBy: string;
  approvedBy?: string;
  publishedAt?: string;
  scoredBy?: string;
  scoredAt?: string;
};

export type KeyResult = {
  id: string;
  title: string;
  baseline: number;
  target: number;
  actual?: number;
  unit: string;
  weight: number;
};

export type EmployeeGoal = {
  id: string;
  cycleId: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  department: string;
  managerId: string;
  managerName: string;
  title: string;
  description: string;
  type: string;
  parentObjectiveId?: string;
  strategicPillar?: string;
  keyResults: KeyResult[];
  weight: number;
  startDate: string;
  dueDate: string;
  status: GoalStatus;
  version: number;
  progressPercent: number;
  achievementScore?: number;
  discussionComment?: string;
  acknowledgedAt?: string;
  agreedVersion?: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  history: Array<{ version: number; at: string; actor: string; change: string; reason?: string }>;
};

export type CheckIn = {
  id: string;
  cycleId: string;
  employeeId: string;
  employeeName: string;
  managerId: string;
  date: string;
  progressPercent: number;
  status: string;
  employeeReflection: string;
  managerFeedback: string;
  sharedNotes: string;
  privateManagerNotes?: string;
  commitments: Array<{ id: string; text: string; owner: string; dueDate: string; done: boolean }>;
  createdAt: string;
};

export type AssessmentItem = {
  itemId: string;
  itemType: 'okr' | 'behaviour' | 'company';
  title: string;
  weight: number;
  selfRating?: number;
  selfNarrative?: string;
  managerRating?: number;
  managerNarrative?: string;
  achievement?: number;
  varianceJustification?: string;
  evidence?: string;
};

export type PerformanceAssessment = {
  id: string;
  cycleId: string;
  employeeId: string;
  employeeName: string;
  type: 'Self' | 'Manager' | 'Mid-Year' | 'Behavioural' | 'Matrix' | '360';
  status: AssessmentStatus;
  items: AssessmentItem[];
  overallComments?: string;
  strengths?: string;
  improvements?: string;
  submittedAt?: string;
  submittedBy?: string;
  returnedReason?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type CompetencyIndicator = {
  id: string;
  name: string;
  description: string;
  category: string;
  weight: number;
  anchors: string[];
};

export type RaterAssignment = {
  id: string;
  cycleId: string;
  employeeId: string;
  employeeName: string;
  raterId: string;
  raterName: string;
  relationship: string;
  anonymous: boolean;
  status: 'Nominated' | 'Pending Approval' | 'Invited' | 'In Progress' | 'Submitted' | 'Declined' | 'Replaced' | 'Expired' | 'Aggregated';
  scores?: Array<{ indicatorId: string; rating: number; comment?: string }>;
  invitedAt?: string;
  submittedAt?: string;
};

export type CalibrationCase = {
  id: string;
  cycleId: string;
  employeeId: string;
  employeeName: string;
  department: string;
  originalScore: number;
  proposedScore?: number;
  approvedScore?: number;
  originalBand: string;
  proposedBand?: string;
  approvedBand?: string;
  justification?: string;
  status: 'Open' | 'Proposed' | 'Approved' | 'Rejected';
  committee: string[];
  decidedBy?: string;
  decidedAt?: string;
};

export type PerformanceResult = {
  id: string;
  cycleId: string;
  employeeId: string;
  employeeName: string;
  sectionScores: { companyObjectives: number; individualOkrs: number; behavioural: number };
  finalScore: number;
  ratingBand: string;
  version: number;
  status: 'Draft' | 'Approved' | 'Published' | 'Appealed' | 'Amended';
  publishedAt?: string;
  acknowledgedAt?: string;
  managerComments?: string;
  developmentRecommendations?: string;
  history: Array<{ version: number; at: string; actor: string; score: number; band: string; reason?: string }>;
};

export type AppealCase = {
  id: string;
  cycleId: string;
  resultId: string;
  employeeId: string;
  employeeName: string;
  disputedItems: string[];
  reason: string;
  requestedOutcome: string;
  evidence?: string;
  status: 'Submitted' | 'Manager Responded' | 'HR Review' | 'Panel' | 'Upheld' | 'Amended' | 'Rejected' | 'Closed';
  managerResponse?: string;
  panelDecision?: string;
  createdAt: string;
  decidedAt?: string;
};

export type PipRecord = {
  id: string;
  employeeId: string;
  employeeName: string;
  cycleId?: string;
  reason: string;
  gaps: string;
  objectives: Array<{ id: string; title: string; target: string; weight: number; dueDate: string }>;
  support: string;
  startDate: string;
  endDate: string;
  status: 'Draft' | 'Pending HR' | 'Pending Approval' | 'Active' | 'On Track' | 'At Risk' | 'Extended' | 'Completed' | 'Unsuccessful' | 'Cancelled' | 'Closed';
  milestones: Array<{ id: string; date: string; notes: string; outcome: string }>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type DevelopmentPlan = {
  id: string;
  employeeId: string;
  employeeName: string;
  cycleId?: string;
  need: string;
  actions: Array<{ id: string; action: string; owner: string; dueDate: string; status: string; evidence?: string }>;
  priority: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type RecognitionRecommendation = {
  id: string;
  employeeId: string;
  employeeName: string;
  type: 'Recognition' | 'Spot Award' | 'Salary Review' | 'Bonus' | 'Promotion';
  justification: string;
  status: 'Draft' | 'Pending Dept' | 'Pending HR' | 'Pending Finance' | 'Approved' | 'Rejected' | 'Fulfilled';
  recommendedBy: string;
  createdAt: string;
  updatedAt: string;
  downstreamRef?: string;
};

export type ProbationRecord = {
  id: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  department: string;
  managerId: string;
  managerName: string;
  startDate: string;
  endDate: string;
  durationMonths: number;
  status: 'Setup Pending' | 'Objectives Pending' | 'Active' | 'Review Due' | 'Employee Submitted' | 'Manager Submitted' | 'Pending HR' | 'Pending Approval' | 'Confirmed' | 'Extended' | 'Not Confirmed' | 'Closed';
  okrs: EmployeeGoal[];
  recommendation?: 'Confirm' | 'Extend' | 'Do Not Confirm';
  decision?: 'Confirm' | 'Extend' | 'Do Not Confirm';
  extensionEndDate?: string;
  decisionReason?: string;
  decidedBy?: string;
  decidedAt?: string;
  /** Days-before-end alerts already raised (60/30/14/7). */
  alertsSent?: number[];
  confirmationSinkRef?: string;
  createdAt: string;
  updatedAt: string;
};

export type ScheduledPerformanceReport = {
  id: string;
  name: string;
  reportType: 'completion' | 'okr-progress' | 'rating-distribution' | 'calibration-delta' | 'pip-tracker' | 'probation-outcomes';
  cadence: 'Daily' | 'Weekly' | 'Monthly';
  recipients: string[];
  nextRunAt: string;
  lastRunAt?: string;
  createdBy: string;
  createdAt: string;
  status: 'Active' | 'Paused';
};

export type PerformanceAnalyticsSnapshot = {
  generatedAt: string;
  preCalibrationAvg: number;
  postCalibrationAvg: number;
  severityIndex: number;
  leniencyIndex: number;
  pipActive: number;
  pipCompleted: number;
  probationConfirmed: number;
  probationExtended: number;
  probationNotConfirmed: number;
  ratingDistribution: Array<{ band: string; count: number }>;
};

export type PerformanceConfig = {
  ratingBands: RatingBand[];
  sectionWeights: { companyObjectives: number; individualOkrs: number; behavioural: number };
  achievementCap: number;
  behaviourIndicators: CompetencyIndicator[];
  anonymityThreshold: number;
};

export type PerformanceDomainState = {
  version: number;
  updatedAt: string;
  config: PerformanceConfig;
  cycles: PerformanceCycle[];
  eligibility: CycleEligibility[];
  companyObjectives: CompanyObjective[];
  goals: EmployeeGoal[];
  checkIns: CheckIn[];
  assessments: PerformanceAssessment[];
  raters: RaterAssignment[];
  calibration: CalibrationCase[];
  results: PerformanceResult[];
  appeals: AppealCase[];
  pips: PipRecord[];
  developmentPlans: DevelopmentPlan[];
  recognitions: RecognitionRecommendation[];
  probation: ProbationRecord[];
  tasks: PerformanceTask[];
  audit: PerformanceAuditEvent[];
  scheduledReports: ScheduledPerformanceReport[];
  analytics?: PerformanceAnalyticsSnapshot;
};

export type PerformanceActionResult = {
  ok: boolean;
  error?: string;
  state?: PerformanceDomainState;
  message?: string;
};

export type PerformanceWorkspacePayload = PerformancePayload & {
  domain: {
    cycles: PerformanceCycle[];
    companyObjectives: CompanyObjective[];
    goals: EmployeeGoal[];
    checkIns: CheckIn[];
    assessments: PerformanceAssessment[];
    raters: RaterAssignment[];
    calibration: CalibrationCase[];
    results: PerformanceResult[];
    appeals: AppealCase[];
    pips: PipRecord[];
    developmentPlans: DevelopmentPlan[];
    recognitions: RecognitionRecommendation[];
    probation: ProbationRecord[];
    tasks: PerformanceTask[];
    audit: PerformanceAuditEvent[];
    scheduledReports: ScheduledPerformanceReport[];
    analytics: PerformanceAnalyticsSnapshot | null;
    config: PerformanceConfig;
    activeCycleId: string | null;
  };
  actor: {
    role: PerformanceRole;
    employeeId: string;
    employeeCode: string;
    fullName: string;
  };
};
