import type { PayrollSessionRole } from '@/lib/payroll-session';
import type { UnifiedPayrollRun, UnifiedPayrollRunStatus } from '@/lib/payroll-run-store';

export type PayrollApprovalStageId = 'payroll-officer' | 'hr-manager' | 'finance-manager' | 'cfo' | 'md-ceo';

export type PayrollApprovalAction =
  | 'submit-run'
  | 'hr-manager-approve'
  | 'finance-manager-approve'
  | 'cfo-approve'
  | 'md-ceo-approve'
  | 'reject-run'
  | 'request-revision'
  | 'hr-approve'
  | 'finance-approve'
  | 'approve-run';

export type PayrollApprovalChecklistItem = {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
  required: boolean;
};

export type PayrollApprovalStageDefinition = {
  id: PayrollApprovalStageId;
  code: string;
  title: string;
  owner: string;
  action: PayrollApprovalAction;
  requiredStatuses: UnifiedPayrollRunStatus[];
  targetStatus: UnifiedPayrollRunStatus;
  roles: PayrollSessionRole[];
};

const SUPER_ADMIN_ROLES: PayrollSessionRole[] = ['Super Admin', 'System Administrator'];
const HR_MANAGER_ROLES: PayrollSessionRole[] = [...SUPER_ADMIN_ROLES, 'HR Manager', 'HR Director'];
const FINANCE_MANAGER_ROLES: PayrollSessionRole[] = [...SUPER_ADMIN_ROLES, 'Finance Manager', 'Finance Controller'];
const CFO_ROLES: PayrollSessionRole[] = [...SUPER_ADMIN_ROLES, 'CFO', 'Executive Director'];
const MD_CEO_ROLES: PayrollSessionRole[] = [...SUPER_ADMIN_ROLES, 'Executive Director', 'Executive Management'];

export const PAYROLL_APPROVAL_STAGES: PayrollApprovalStageDefinition[] = [
  {
    id: 'payroll-officer',
    code: '4.1',
    title: 'Payroll Officer',
    owner: 'Payroll Officer',
    action: 'submit-run',
    requiredStatuses: ['Computed', 'Calculated', 'Validated', 'Ready for Approval'],
    targetStatus: 'Submitted',
    roles: [...SUPER_ADMIN_ROLES, 'Payroll Officer', 'Payroll Supervisor', 'HR Manager'],
  },
  {
    id: 'hr-manager',
    code: '4.2',
    title: 'HR Manager',
    owner: 'HR Manager',
    action: 'hr-manager-approve',
    requiredStatuses: ['Submitted', 'Under Review'],
    targetStatus: 'HR Approved',
    roles: HR_MANAGER_ROLES,
  },
  {
    id: 'finance-manager',
    code: '4.3',
    title: 'Finance Manager',
    owner: 'Finance Manager',
    action: 'finance-manager-approve',
    requiredStatuses: ['HR Approved'],
    targetStatus: 'Finance Approved',
    roles: FINANCE_MANAGER_ROLES,
  },
  {
    id: 'cfo',
    code: '4.4',
    title: 'CFO',
    owner: 'CFO',
    action: 'cfo-approve',
    requiredStatuses: ['Finance Approved'],
    targetStatus: 'CFO Approved',
    roles: CFO_ROLES,
  },
  {
    id: 'md-ceo',
    code: '4.5',
    title: 'MD / CEO',
    owner: 'MD / CEO',
    action: 'md-ceo-approve',
    requiredStatuses: ['CFO Approved'],
    targetStatus: 'Approved',
    roles: MD_CEO_ROLES,
  },
];

export const normalizePayrollApprovalAction = (action: string): PayrollApprovalAction | string => {
  if (action === 'submit') return 'submit-run';
  if (action === 'reject') return 'reject-run';
  if (action === 'hr-approve') return 'hr-manager-approve';
  if (action === 'finance-approve') return 'finance-manager-approve';
  if (action === 'approve-run') return 'md-ceo-approve';
  return action;
};

export const resolvePayrollApprovalActionForRun = (action: string, run: UnifiedPayrollRun | null | undefined) => {
  const normalized = normalizePayrollApprovalAction(action);
  if (normalized !== 'md-ceo-approve' || action !== 'approve-run') return normalized;
  const status = run?.status || 'Draft';
  if (['Submitted', 'Under Review'].includes(status)) return 'hr-manager-approve';
  if (status === 'HR Approved') return 'finance-manager-approve';
  if (status === 'Finance Approved') return 'cfo-approve';
  if (status === 'CFO Approved') return 'md-ceo-approve';
  return normalized;
};

export const clearPayrollApprovalSignoffs = (run: UnifiedPayrollRun) => {
  run.submittedAt = null;
  run.submittedBy = null;
  run.hrReviewedAt = null;
  run.hrReviewedBy = null;
  run.financeReviewedAt = null;
  run.financeReviewedBy = null;
  run.cfoReviewedAt = null;
  run.cfoReviewedBy = null;
  run.approvedAt = null;
  run.approvedBy = null;
};

export const payrollApprovalStageIndex = (status: UnifiedPayrollRunStatus) => {
  if (['Approved', 'Released', 'Locked', 'Posted', 'Published', 'Closed'].includes(status)) return 5;
  if (status === 'CFO Approved') return 4;
  if (status === 'Finance Approved') return 3;
  if (status === 'HR Approved') return 2;
  if (['Submitted', 'Under Review'].includes(status)) return 1;
  return 0;
};

export const getCurrentPayrollApprovalStage = (run: UnifiedPayrollRun | null | undefined) => {
  const status = run?.status || 'Draft';
  const index = payrollApprovalStageIndex(status);
  if (index >= PAYROLL_APPROVAL_STAGES.length) return null;
  return PAYROLL_APPROVAL_STAGES[index];
};

export const getPayrollApprovalStageState = (run: UnifiedPayrollRun | null | undefined) =>
  PAYROLL_APPROVAL_STAGES.map((stage, index) => {
    const currentIndex = payrollApprovalStageIndex(run?.status || 'Draft');
    const done =
      index < currentIndex
      || (stage.id === 'payroll-officer' && Boolean(run?.submittedAt))
      || (stage.id === 'hr-manager' && Boolean(run?.hrReviewedAt))
      || (stage.id === 'finance-manager' && Boolean(run?.financeReviewedAt))
      || (stage.id === 'cfo' && Boolean(run?.cfoReviewedAt))
      || (stage.id === 'md-ceo' && Boolean(run?.approvedAt));
    const current = !done && currentIndex === index;
    const stamp =
      stage.id === 'payroll-officer' ? run?.submittedAt
        : stage.id === 'hr-manager' ? run?.hrReviewedAt
          : stage.id === 'finance-manager' ? run?.financeReviewedAt
            : stage.id === 'cfo' ? run?.cfoReviewedAt
              : run?.approvedAt;
    const by =
      stage.id === 'payroll-officer' ? run?.submittedBy
        : stage.id === 'hr-manager' ? run?.hrReviewedBy
          : stage.id === 'finance-manager' ? run?.financeReviewedBy
            : stage.id === 'cfo' ? run?.cfoReviewedBy
              : run?.approvedBy;
    return { ...stage, done, current, stamp: stamp || null, signedBy: by || null };
  });

export const canRoleApprovePayrollStage = (
  role: PayrollSessionRole,
  stageId: PayrollApprovalStageId,
  options?: { isGlobalAdmin?: boolean },
) => {
  if (options?.isGlobalAdmin) return true;
  const stage = PAYROLL_APPROVAL_STAGES.find((item) => item.id === stageId);
  return Boolean(stage?.roles.includes(role));
};

type ChecklistInput = {
  blockedEmployees: number;
  reviewEmployees: number;
  exceptionCount: number;
  payrollEligible: number;
  readyEmployees: number;
  grossPay: number | null;
  netPay: number | null;
  employerCost: number | null;
  exceptions: Array<{ issue: string; employeeName?: string }>;
  records: Array<{ employmentStatus?: string; payrollStatus?: string; issues?: string[]; exceptions?: string[] }>;
};

const issueMatches = (exceptions: ChecklistInput['exceptions'], pattern: RegExp) =>
  exceptions.some((item) => pattern.test(item.issue));

const recordIssueMatches = (records: ChecklistInput['records'], pattern: RegExp) =>
  records.some((record) => (record.issues || record.exceptions || []).some((issue) => pattern.test(issue)));

export const buildPayrollApprovalChecklist = (
  stageId: PayrollApprovalStageId,
  input: ChecklistInput,
): PayrollApprovalChecklistItem[] => {
  const noBlocked = input.blockedEmployees === 0;
  const baseGate: PayrollApprovalChecklistItem[] = [
    {
      id: 'no-blocked',
      label: 'No blocked payroll employees',
      passed: noBlocked,
      detail: noBlocked ? 'All employees passed blocking validation.' : `${input.blockedEmployees} blocked employee(s) must be resolved.`,
      required: true,
    },
    {
      id: 'exception-gate',
      label: 'Exception gate reviewed',
      passed: input.exceptionCount === 0 || input.reviewEmployees === 0,
      detail: input.exceptionCount ? `${input.exceptionCount} exception flag(s); ${input.reviewEmployees} in review.` : 'No payroll exceptions flagged.',
      required: false,
    },
  ];

  if (stageId === 'payroll-officer') {
    return [
      {
        id: 'payroll-computed',
        label: 'Payroll computed for period',
        passed: input.payrollEligible > 0 && input.grossPay !== null,
        detail: input.payrollEligible ? `${input.payrollEligible} eligible employees with calculated totals.` : 'Run payroll before submission.',
        required: true,
      },
      {
        id: 'readiness',
        label: 'Payroll readiness acceptable',
        passed: input.readyEmployees > 0 && input.readyEmployees / Math.max(input.payrollEligible, 1) >= 0.9,
        detail: `${input.readyEmployees} of ${input.payrollEligible} employees ready.`,
        required: true,
      },
      ...baseGate,
    ];
  }

  if (stageId === 'hr-manager') {
    return [
      ...baseGate,
      {
        id: 'new-hires',
        label: 'New employee payroll setup reviewed',
        passed: !recordIssueMatches(input.records, /new|hire|onboard|setup assigned/i),
        detail: 'Confirm new hires have payroll profiles and correct start dates.',
        required: false,
      },
      {
        id: 'exits',
        label: 'Exits and inactive status reviewed',
        passed: !recordIssueMatches(input.records, /inactive|terminated|exit|not payroll active/i),
        detail: 'Confirm leavers are excluded or final-settlement ready.',
        required: true,
      },
      {
        id: 'salary-changes',
        label: 'Promotions and salary changes reviewed',
        passed: !issueMatches(input.exceptions, /salary|promotion|grade|structure/i),
        detail: 'Review compensation changes effective this period.',
        required: false,
      },
      {
        id: 'leave-impact',
        label: 'Leave and attendance impact reviewed',
        passed: !issueMatches(input.exceptions, /leave|attendance|timesheet/i),
        detail: 'Confirm paid/unpaid leave and timesheet feeds are reflected.',
        required: false,
      },
    ];
  }

  if (stageId === 'finance-manager') {
    return [
      ...baseGate,
      {
        id: 'cost-centres',
        label: 'Cost centre and project allocation reviewed',
        passed: !issueMatches(input.exceptions, /cost centre|cost center|project|allocation/i),
        detail: 'Validate payroll is charged to correct cost objects.',
        required: false,
      },
      {
        id: 'budget',
        label: 'Budget and payroll totals reviewed',
        passed: input.grossPay !== null && input.netPay !== null && input.grossPay > 0,
        detail: input.grossPay !== null ? `Gross ${input.grossPay.toLocaleString('en-NG')} / Net ${input.netPay?.toLocaleString('en-NG')}.` : 'Totals unavailable.',
        required: true,
      },
      {
        id: 'variances',
        label: 'Variance analysis completed',
        passed: !issueMatches(input.exceptions, /variance|sage|discrepancy/i),
        detail: 'Review generated-vs-ledger and period-on-period variances.',
        required: false,
      },
      {
        id: 'statutory',
        label: 'Statutory deductions validated',
        passed: !issueMatches(input.exceptions, /paye|pension|nhf|nsitf|itf|statutory/i),
        detail: 'PAYE, pension, and statutory funds calculated correctly.',
        required: true,
      },
    ];
  }

  if (stageId === 'cfo') {
    return [
      ...baseGate,
      {
        id: 'summary',
        label: 'Executive payroll summary reviewed',
        passed: input.grossPay !== null && input.netPay !== null && input.employerCost !== null,
        detail: 'Gross, net, and employer cost reviewed for CFO sign-off.',
        required: true,
      },
      {
        id: 'headcount',
        label: 'Headcount and eligibility confirmed',
        passed: input.payrollEligible > 0,
        detail: `${input.payrollEligible} employees in payroll scope.`,
        required: true,
      },
      {
        id: 'employer-cost',
        label: 'Employer cost and funding reviewed',
        passed: input.employerCost !== null && input.employerCost > 0,
        detail: input.employerCost !== null ? `Employer cost ${input.employerCost.toLocaleString('en-NG')}.` : 'Employer cost not available.',
        required: true,
      },
    ];
  }

  return [
    ...baseGate,
    {
      id: 'executive-summary',
      label: 'Final executive payroll summary reviewed',
      passed: input.grossPay !== null && input.netPay !== null,
      detail: 'MD / CEO final review of payroll totals before release.',
      required: true,
    },
    {
      id: 'prior-stages',
      label: 'HR, Finance, and CFO approvals complete',
      passed: true,
      detail: 'All prior approval stages must be signed off before MD / CEO approval.',
      required: true,
    },
    {
      id: 'funding',
      label: 'Funding and bank release readiness confirmed',
      passed: input.netPay !== null && input.netPay > 0,
      detail: input.netPay !== null ? `Net payroll ${input.netPay.toLocaleString('en-NG')} ready for release.` : 'Net pay unavailable.',
      required: true,
    },
  ];
};

export const payrollApprovalChecklistReady = (items: PayrollApprovalChecklistItem[]) =>
  items.filter((item) => item.required).every((item) => item.passed);

export const payrollApprovalPermissions = (role: PayrollSessionRole, options?: { isGlobalAdmin?: boolean }) => ({
  canSubmit: options?.isGlobalAdmin || ['Super Admin', 'System Administrator', 'Payroll Officer', 'Payroll Supervisor', 'HR Manager'].includes(role),
  canApproveHrManager: canRoleApprovePayrollStage(role, 'hr-manager', options),
  canApproveFinanceManager: canRoleApprovePayrollStage(role, 'finance-manager', options),
  canApproveCfo: canRoleApprovePayrollStage(role, 'cfo', options),
  canApproveMdCeo: canRoleApprovePayrollStage(role, 'md-ceo', options),
  canApproveAnyStage: Boolean(options?.isGlobalAdmin),
  canReject: canRoleApprovePayrollStage(role, 'hr-manager', options)
    || canRoleApprovePayrollStage(role, 'finance-manager', options)
    || canRoleApprovePayrollStage(role, 'cfo', options)
    || canRoleApprovePayrollStage(role, 'md-ceo', options),
});

export const resolvePayrollApprovalNextOwner = (run: UnifiedPayrollRun | null | undefined) => {
  const stage = getCurrentPayrollApprovalStage(run);
  return stage?.owner || (run?.approvedAt ? 'Payroll Supervisor' : 'Payroll Officer');
};

export const resolvePayrollApprovalStageLabel = (run: UnifiedPayrollRun | null | undefined) => {
  const status = run?.status || 'Draft';
  if (['Approved', 'Released', 'Locked', 'Posted', 'Published', 'Closed'].includes(status)) return 'Approved';
  if (status === 'CFO Approved') return 'Awaiting MD / CEO Approval';
  if (status === 'Finance Approved') return 'Awaiting CFO Approval';
  if (status === 'HR Approved') return 'Awaiting Finance Manager Approval';
  if (['Submitted', 'Under Review'].includes(status)) return 'Awaiting HR Manager Approval';
  if (['Rejected', 'Revision Requested'].includes(status)) return status;
  return 'Preparation';
};

export const payrollStageActionForId = (stageId: PayrollApprovalStageId) =>
  PAYROLL_APPROVAL_STAGES.find((stage) => stage.id === stageId)?.action || null;

export const payrollStageIdForAction = (action: string) =>
  PAYROLL_APPROVAL_STAGES.find((stage) => stage.action === normalizePayrollApprovalAction(action))?.id || null;
