export type DelegationStatus = 'Active' | 'Scheduled' | 'Expired' | 'Cancelled';
export type DelegationScope =
  | 'All Employee Payments'
  | 'Cash Advance Payment'
  | 'Supplier Invoice Payment'
  | 'Expense Payment';

export type ApprovalDelegation = {
  delegationId: string;
  fromEmployeeCode: string;
  fromEmployeeName: string;
  toEmployeeCode: string;
  toEmployeeName: string;
  /** Stage / role being covered. Empty or "All Stages" covers every stage for the principal. */
  approverRole: string;
  scope: DelegationScope;
  startsAt: string;
  endsAt: string | null;
  status: DelegationStatus;
  isActive: boolean;
  reason: string;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
};

export type ApprovalDelegationWorkspace = {
  generatedAt: string;
  source: string;
  summary: {
    total: number;
    active: number;
    scheduled: number;
    expired: number;
    cancelled: number;
    standing: number;
    temporary: number;
  };
  warnings: string[];
  rows: ApprovalDelegation[];
  audit: Array<{
    auditId: string;
    delegationId: string;
    actionType: string;
    actorName: string;
    createdAt: string;
    detail: string;
  }>;
};

export type UpsertDelegationInput = {
  delegationId?: string;
  fromEmployeeCode: string;
  fromEmployeeName?: string;
  toEmployeeCode: string;
  toEmployeeName?: string;
  approverRole?: string;
  scope?: DelegationScope | string;
  startsAt: string;
  endsAt?: string | null;
  status?: DelegationStatus;
  isActive?: boolean;
  reason?: string;
  actor: string;
};

export const DELEGATION_APPROVER_ROLE_OPTIONS = [
  'All Stages',
  'Reporting Manager',
  'Project Manager',
  'Cost Controller',
  'Finance Manager',
  'GM',
  'CFO',
  'MD/CEO',
] as const;

export const DELEGATION_SCOPE_OPTIONS: DelegationScope[] = [
  'All Employee Payments',
  'Cash Advance Payment',
  'Supplier Invoice Payment',
  'Expense Payment',
];
