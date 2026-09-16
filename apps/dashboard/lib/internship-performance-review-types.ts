export type InternshipReviewStatus =
  | 'Draft'
  | 'Assigned'
  | 'In Evaluation'
  | 'Pending HOD'
  | 'Pending HR Manager'
  | 'Pending MD'
  | 'Returned'
  | 'Approved'
  | 'HR Action'
  | 'Closed';

export type InternshipRating = 1 | 2 | 3 | 4 | 5;
export type InternshipWorkflowRole = 'HR' | 'LINE_MANAGER' | 'HOD' | 'HR_MANAGER' | 'MD';
export type InternshipRecommendation = '' | 'Yes' | 'No' | 'Extend internship';
export type InternshipApprovalStatus = 'Pending' | 'Approved' | 'Returned' | 'Skipped';

export type InternshipEmployee = {
  code: string;
  name: string;
  department: string;
  jobTitle: string;
  email: string;
  internshipStart: string;
  lineManager: string;
  hod?: string;
};

export type InternshipScore = {
  criterion: string;
  rating: InternshipRating;
  comment?: string;
};

export type InternshipApproval = {
  step: string;
  approver: string;
  role: InternshipWorkflowRole;
  status: InternshipApprovalStatus;
  comment?: string;
  at?: string;
};

export type InternshipAuditEvent = {
  id: string;
  at: string;
  actor: string;
  action: string;
  detail: string;
};

export type InternshipReview = {
  id: string;
  employee: InternshipEmployee;
  cycle: string;
  dueDate: string;
  status: InternshipReviewStatus;
  supervisor: string;
  scores: InternshipScore[];
  strength: string;
  improvement: string;
  impression: string;
  recommendation: InternshipRecommendation;
  overall: number;
  approvals: InternshipApproval[];
  instructions?: string;
  notifyManager?: boolean;
  reminders?: boolean;
  hrAction?: string;
  hrActionNotes?: string;
  hrActionDate?: string;
  proposedRole?: string;
  notifyOnHrAction?: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  audit: InternshipAuditEvent[];
};

export type InternshipReviewSettings = {
  eligibilityMonths: number;
  workflow: string;
  reminderSchedule: string;
  lockAfterSubmission: boolean;
};

export type InternshipEligibleIntern = InternshipEmployee & {
  monthsCompleted: number;
  eligible: boolean;
};
