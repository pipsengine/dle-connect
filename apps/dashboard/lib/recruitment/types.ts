export type ApprovalStatus =
  | 'Draft'
  | 'Submitted'
  | 'HR Review'
  | 'Finance Review'
  | 'CFO Review'
  | 'MD/CEO Review'
  | 'Approved'
  | 'Rejected'
  | 'Returned';

export type CandidateStage =
  | 'Applied'
  | 'Screening'
  | 'Assessment'
  | 'Interview'
  | 'Offer'
  | 'Background Check'
  | 'Approved'
  | 'Rejected'
  | 'Talent Pool';

export interface AuditEvent {
  at: string;
  actor: string;
  action: string;
  comment?: string;
}

export interface Attachment {
  fileName: string;
  type: string;
  size: number;
  uploadedBy: string;
  uploadedAt: string;
}

export { recruitmentRoutes as ROUTES } from '@/lib/recruitment-shared';
