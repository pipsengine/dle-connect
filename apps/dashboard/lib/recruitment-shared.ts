/** Client-safe recruitment types and routes. Server store lives in recruitment-store.ts */

/** Aligns with enterprise-v2 ApprovalStatus */
export type RecruitmentWorkflowStatus =
  | 'Draft'
  | 'Submitted'
  | 'HR Review'
  | 'Finance Review'
  | 'CFO Review'
  | 'MD/CEO Review'
  | 'Under Review'
  | 'Approved'
  | 'Rejected'
  | 'Returned'
  | 'Withdrawn'
  | 'Closed';

export type RecruitmentBudgetStatus = 'Pending' | 'Cleared' | 'Approved' | 'Blocked' | 'Not Required';

export type ManpowerRequestRecord = {
  id: string;
  requestNo: string;
  requestType: string;
  department: string;
  positionTitle: string;
  employmentType: string;
  headcount: number;
  needDate: string | null;
  priority: 'Low' | 'Medium' | 'High' | 'Critical';
  workLocation: string | null;
  grade: string | null;
  project: string | null;
  costCentre: string | null;
  budgeted: boolean;
  estimatedAnnualCost: number | null;
  currency: string;
  replacementEmployee: string | null;
  businessJustification: string | null;
  budgetStatus: RecruitmentBudgetStatus;
  workflowStatus: RecruitmentWorkflowStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
};

export type JobRequisitionRecord = {
  id: string;
  requisitionNo: string;
  manpowerRequestId: string | null;
  jobTitle: string;
  department: string;
  openings: number;
  hiringManager: string | null;
  priority: 'Low' | 'Medium' | 'High' | 'Critical';
  status: RecruitmentWorkflowStatus | 'Open' | 'Filled' | 'Cancelled';
  openDate: string | null;
  closeDate: string | null;
  jobDescription: string | null;
  requirements: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CandidateRecord = {
  id: string;
  candidateNo: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  currentTitle: string | null;
  yearsExperience: number | null;
  highestQualification: string | null;
  source: string | null;
  consentAt: string | null;
  status: 'Active' | 'Inactive' | 'Blacklisted' | 'Hired';
  createdAt: string;
  updatedAt: string;
};

export type ApplicationRecord = {
  id: string;
  candidateId: string;
  candidateName: string;
  requisitionId: string;
  requisitionTitle: string;
  stage: string;
  screeningScore: number | null;
  recruiterDecision: string | null;
  appliedAt: string;
};

export type InterviewRecord = {
  id: string;
  applicationId: string;
  candidateName: string;
  requisitionTitle: string;
  roundNo: number;
  scheduledAt: string | null;
  mode: string | null;
  venueOrMeeting: string | null;
  status: string;
};

export type OfferRecord = {
  id: string;
  applicationId: string;
  candidateName: string;
  positionTitle: string;
  offerVersion: number;
  grade: string | null;
  currency: string;
  basePay: number | null;
  totalPackage: number | null;
  status: string;
  issuedAt: string | null;
  expiresAt: string | null;
  acceptedAt: string | null;
};

export type BackgroundCheckRecord = {
  id: string;
  applicationId: string;
  candidateName: string;
  checkType: string;
  provider: string | null;
  status: string;
  riskRating: string | null;
  startedAt: string | null;
  completedAt: string | null;
  notes: string | null;
};

export type TalentPoolRecord = {
  id: string;
  candidateId: string;
  candidateName: string;
  poolName: string;
  primarySkill: string | null;
  availability: string | null;
  talentScore: number | null;
  addedAt: string;
};

export type ApprovalEventRecord = {
  id: string;
  entityType: string;
  entityId: string;
  stage: string;
  action: string;
  actor: string;
  comment: string | null;
  actionAt: string;
};

export type JobPostingRecord = {
  id: string;
  postingNo: string;
  requisitionId: string;
  jobTitle: string;
  channels: string;
  publishedAt: string | null;
  closingDate: string | null;
  applicants: number;
  views: number;
  status: string;
};

export type RecruitmentKpis = {
  activeManpower: number;
  pendingAction: number;
  awaitingHr: number;
  financeReview: number;
  approvedManpower: number;
  requestedHeadcount: number;
  budgetExceptions: number;
  openRequisitions: number;
  totalApplicants: number;
  shortlisted: number;
  activeCandidates: number;
  applicationsInScreening: number;
  interviewsScheduled: number;
  openOffers: number;
  checksInProgress: number;
  talentPoolSize: number;
  avgTimeToHireDays: number | null;
};

export type RecruitmentPayload = {
  source: string;
  dbConnected: boolean;
  kpis: RecruitmentKpis;
  pipeline: Array<{ stage: string; count: number }>;
  manpowerRequests: ManpowerRequestRecord[];
  requisitions: JobRequisitionRecord[];
  postings: JobPostingRecord[];
  candidates: CandidateRecord[];
  applications: ApplicationRecord[];
  interviews: InterviewRecord[];
  offers: OfferRecord[];
  backgroundChecks: BackgroundCheckRecord[];
  talentPool: TalentPoolRecord[];
  approvalEvents: ApprovalEventRecord[];
};

export const recruitmentRoutes = {
  dashboard: '/hris/recruitment/recruitment-dashboard',
  manpower: '/hris/recruitment/manpower-request',
  requisition: '/hris/recruitment/job-requisition',
  posting: '/hris/recruitment/job-posting',
  candidates: '/hris/recruitment/candidate-database',
  screening: '/hris/recruitment/application-screening',
  scheduling: '/hris/recruitment/interview-scheduling',
  evaluation: '/hris/recruitment/interview-evaluation',
  offers: '/hris/recruitment/offer-management',
  checks: '/hris/recruitment/background-checks',
  approval: '/hris/recruitment/recruitment-approval',
  talent: '/hris/recruitment/talent-pool',
  reports: '/hris/recruitment/recruitment-reports',
} as const;

export const recruitmentNavItems = [
  { title: 'Recruitment Dashboard', route: recruitmentRoutes.dashboard },
  { title: 'Manpower Request', route: recruitmentRoutes.manpower },
  { title: 'Job Requisition', route: recruitmentRoutes.requisition },
  { title: 'Job Posting', route: recruitmentRoutes.posting },
  { title: 'Candidate Database', route: recruitmentRoutes.candidates },
  { title: 'Application Screening', route: recruitmentRoutes.screening },
  { title: 'Interview Scheduling', route: recruitmentRoutes.scheduling },
  { title: 'Interview Evaluation', route: recruitmentRoutes.evaluation },
  { title: 'Offer Management', route: recruitmentRoutes.offers },
  { title: 'Background Checks', route: recruitmentRoutes.checks },
  { title: 'Recruitment Approval', route: recruitmentRoutes.approval },
  { title: 'Talent Pool', route: recruitmentRoutes.talent },
  { title: 'Recruitment Reports', route: recruitmentRoutes.reports },
] as const;

export type RecruitmentEmployeeOption = {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  department: string;
  jobTitle: string;
  email: string;
  workLocation: string;
  status: string;
};

export type RecruitmentLookups = {
  departments: string[];
  locations: string[];
  costCentres: string[];
  projects: string[];
  jobTitles: string[];
  grades: string[];
  employmentTypes: string[];
};
