export const SSJ_DRAFT = 'Draft';
export const SSJ_LINE_MANAGER = 'Pending Line Manager';
export const SSJ_MD = 'Pending MD';
export const SSJ_APPROVED = 'Approved';
export const SSJ_RETURNED = 'Returned';
export const SSJ_REJECTED = 'Rejected';

export const SSJ_STAGE_REQUESTER = 'Requester';
export const SSJ_STAGE_LINE_MANAGER = 'Line Manager';
export const SSJ_STAGE_MD = 'Managing Director';
export const SSJ_STAGE_COMPLETE = 'Complete';

export const SSJ_REASON_CATEGORIES = [
  'Sole supplier',
  'Proprietary / OEM',
  'Emergency / operational continuity',
  'Technical compatibility',
  'Previous contract continuity',
  'Other',
] as const;

export type SsjWorkflowEvent = {
  at: string;
  action: string;
  actor: string;
  actorCode?: string;
  stage?: string;
  comment?: string;
};

export type SsjActions = {
  canEdit: boolean;
  canSubmit: boolean;
  canCheck: boolean;
  canApprove: boolean;
  canReturn: boolean;
  canReject: boolean;
};

export type SsjRecord = {
  ssjId: string;
  prId: string | null;
  title: string;
  department: string | null;
  project: string | null;
  site: string | null;
  requesterName: string | null;
  requesterCode: string | null;
  supplierId: string | null;
  supplierName: string | null;
  currency: string;
  estimatedAmount: number;
  reasonCategory: string | null;
  justification: string | null;
  alternativesConsidered: string | null;
  marketSearch: string | null;
  technicalBasis: string | null;
  consequence: string | null;
  status: string;
  currentStage: string;
  currentWith: string | null;
  lineManagerName: string | null;
  lineManagerCode: string | null;
  mdName: string | null;
  mdCode: string | null;
  checkedBy: string | null;
  checkedAt: string | null;
  checkComment: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  approvalComment: string | null;
  workflow: SsjWorkflowEvent[];
  createdAt: string | null;
  updatedAt: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  actions: SsjActions;
};

export type SsjInput = {
  ssjId?: string;
  prId?: string;
  title?: string;
  department?: string;
  project?: string;
  site?: string;
  supplierId?: string;
  supplierName?: string;
  currency?: string;
  estimatedAmount?: number | string;
  reasonCategory?: string;
  justification?: string;
  alternativesConsidered?: string;
  marketSearch?: string;
  technicalBasis?: string;
  consequence?: string;
};
