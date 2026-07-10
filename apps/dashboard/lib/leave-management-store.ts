import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sql from 'mssql';
import { buildLeaveAllowanceApplicationStatus, buildLeaveAllowanceExceptions, type LeaveAllowanceExceptionRow, type LeaveApplicationLike } from '@/lib/leave-allowance-policy';
import { reconcilePayrollLeaveAllowanceEvents, syncSageLeaveAllowanceEvents } from '@/lib/payroll-leave-allowance-store';
import { getDleEnterpriseDbPool, type DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import { HRIS_LEAVE_SOURCE } from '@/lib/hris-leave-read';
import { readPayrollEmployees } from '@/lib/payroll-employee-source';
import {
  approvalStatusForEss,
  isLeaveEssRequest,
  workflowStageForEssStatus,
} from '@/lib/leave-request-shared';

export type LeaveRole = 'Leave Administrator' | 'HR Officer' | 'HR Manager' | 'Department Manager' | 'Supervisor' | 'Payroll Officer' | 'Employee' | 'Executive' | 'System Administrator' | 'Super Administrator';
export type LeaveStatus = 'Draft' | 'Submitted' | 'Under Review' | 'Approved' | 'Rejected' | 'Withdrawn' | 'Cancelled' | 'Terminated' | 'Completed';
export type WorkflowStage = 'Employee' | 'Supervisor' | 'Manager' | 'HR' | 'Final Approval' | 'Closed';
export type LeaveTone = 'blue' | 'green' | 'amber' | 'red' | 'violet' | 'cyan' | 'slate';

export type LeaveActionId =
  | 'create'
  | 'apply'
  | 'edit'
  | 'save-draft'
  | 'submit'
  | 'approve'
  | 'reject'
  | 'recall'
  | 'cancel'
  | 'withdraw'
  | 'encash'
  | 'delegate'
  | 'escalate'
  | 'reassign'
  | 'adjust-balance'
  | 'process-accrual'
  | 'process-carry-forward'
  | 'generate-report'
  | 'export'
  | 'import'
  | 'archive'
  | 'reopen'
  | 'view-history'
  | 'view-audit-trail'
  | 'request-clarification'
  | 'bulk-approve'
  | 'bulk-reject'
  | 'schedule-leave'
  | 'block-period'
  | 'publish-calendar'
  | 'post-to-payroll'
  | 'close-year';

export type LeaveAction = {
  id: LeaveActionId;
  label: string;
  roles: LeaveRole[];
  stage?: WorkflowStage[];
  requiresReason?: boolean;
  sensitive?: boolean;
};

export type LeaveAuditEntry = {
  id: string;
  at: string;
  user: string;
  role: LeaveRole;
  action: string;
  record: string;
  oldValue: string | null;
  newValue: string | null;
  comments?: string;
  reason?: string;
};

export type LeaveApplicationRecord = {
  id: string;
  sourceSystem: string;
  employeeId: string;
  fullName: string;
  department: string;
  managerName: string;
  location: string;
  employeeCategory: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  days: number;
  status: LeaveStatus;
  stage: WorkflowStage;
  approvalStatus: string;
  policyComplianceStatus: 'Compliant' | 'Attention Required' | 'Blocked';
  balanceImpact: number;
  availableBalance: number;
  actingOfficer: string;
  supportingDocuments: number;
  exceptions: string[];
  auditCount: number;
  createdAt: string;
  updatedAt: string;
  allowanceStatus?: string;
  allowanceEligible?: boolean;
  allowancePaid?: boolean;
  approvedAnnualLeaveDays?: number;
};

export type LeaveBalanceRecord = {
  employeeId: string;
  fullName: string;
  department: string;
  leaveType: string;
  currentBalance: number;
  accruedBalance: number;
  usedBalance: number;
  pendingBalance: number;
  forfeitedBalance: number;
  carryForwardBalance: number;
  liabilityValue: number;
  status: 'Healthy' | 'Review' | 'Blocked';
  exceptions: string[];
};

export type LeaveTypeRule = {
  id: string;
  name: string;
  active: boolean;
  entitlementDays: number;
  durationBasis: 'Working days' | 'Calendar days';
  eligibility: string;
  waitingPeriodDays: number;
  gradeRestrictions: string[];
  categoryRestrictions: string[];
  genderRestriction: string;
  documentRequirements: string[];
  approvalLevels: string[];
  accrualRule: string;
  carryForwardRule: string;
  encashmentRule: string;
  allowanceRule: string;
};

export type LeaveDrilldownRow = {
  employeeId: string;
  fullName: string;
  department: string;
  leaveType?: string;
  startDate?: string;
  endDate?: string;
  days?: number;
  status?: string;
  stage?: string;
  metricLabel?: string;
  metricValue?: string | number;
};

export type LeavePayload = {
  generatedAt: string;
  source: string;
  role: LeaveRole;
  section: string;
  permissions: {
    canApply: boolean;
    canApprove: boolean;
    canAdminister: boolean;
    canProcessFinancials: boolean;
    canConfigure: boolean;
    canExport: boolean;
    canViewAudit: boolean;
  };
  summary: {
    totalEmployees: number;
    employeesOnLeave: number;
    returningToday: number;
    pendingApplications: number;
    pendingApprovals: number;
    pendingHrApprovals: number;
    pendingManagerApprovals: number;
    leaveUtilizationPct: number;
    leaveLiability: number;
    encashmentRequests: number;
    recallRequests: number;
    cancellationRequests: number;
    exceptionCount: number;
    allowanceExceptionCount: number;
    allowancePendingPayrollCount: number;
  };
  current: {
    leaveStatus: string;
    availableActions: string[];
    nextRequiredAction: string;
    approvalStatus: string;
    policyComplianceStatus: string;
    leaveBalanceImpact: string;
    auditHistory: string;
    workflowProgress: string;
    exceptionIndicators: string[];
  };
  actions: LeaveAction[];
  applications: LeaveApplicationRecord[];
  balances: LeaveBalanceRecord[];
  allowanceExceptions: LeaveAllowanceExceptionRow[];
  leaveTypes: LeaveTypeRule[];
  calendar: Array<Record<string, string | number>>;
  blockedPeriods: Array<Record<string, string>>;
  workflowMatrix: Array<Record<string, string>>;
  reports: Array<Record<string, string>>;
  notifications: Array<Record<string, string>>;
  auditTrail: LeaveAuditEntry[];
  integrations: Array<Record<string, string>>;
  operationalSections: Array<{ id: string; label: string; area: 'Dashboard' | 'Transactions' | 'Planning & Balances' | 'Administration' | 'Reports & Analytics'; description: string; actions: LeaveActionId[]; controls: string[]; reports?: string[] }>;
  drilldowns: {
    totalEmployees: LeaveDrilldownRow[];
    onLeaveToday: LeaveDrilldownRow[];
    returningToday: LeaveDrilldownRow[];
    pendingApprovals: LeaveDrilldownRow[];
    pendingHrApprovals: LeaveDrilldownRow[];
    pendingManagerApprovals: LeaveDrilldownRow[];
    upcomingLeave: LeaveDrilldownRow[];
    leaveUtilization: LeaveDrilldownRow[];
    leaveLiability: LeaveDrilldownRow[];
    carryForwardProcessing: LeaveDrilldownRow[];
    cancellationRequests: LeaveDrilldownRow[];
    leaveAllowanceExceptions: LeaveDrilldownRow[];
  };
};

const nowIso = () => new Date().toISOString();
const moneyFmt = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 });
const resolveDashboardRoot = () => {
  const cwd = process.cwd();
  const dashboardSuffix = path.join('apps', 'dashboard');
  return cwd.endsWith(dashboardSuffix) ? cwd : path.join(cwd, dashboardSuffix);
};
const ESS_REQUESTS_PATH = path.join(resolveDashboardRoot(), 'data', 'hris', 'ess-requests.json');

const adminRoles: LeaveRole[] = ['Leave Administrator', 'HR Officer', 'HR Manager', 'System Administrator', 'Super Administrator'];
const managerRoles: LeaveRole[] = ['Department Manager', 'Supervisor', 'HR Manager', 'Executive', 'Super Administrator'];
const approvalRoles: LeaveRole[] = ['Supervisor', 'Department Manager', 'HR Manager', 'Executive', 'System Administrator', 'Super Administrator', 'Leave Administrator'];
const financeRoles: LeaveRole[] = ['Payroll Officer', 'HR Manager', 'Executive', 'System Administrator', 'Super Administrator'];
const allRoles: LeaveRole[] = ['Leave Administrator', 'HR Officer', 'HR Manager', 'Department Manager', 'Supervisor', 'Payroll Officer', 'Employee', 'Executive', 'System Administrator', 'Super Administrator'];

const action = (id: LeaveActionId, label: string, roles: LeaveRole[] = allRoles, stage?: WorkflowStage[], requiresReason = false, sensitive = false): LeaveAction => ({
  id,
  label,
  roles,
  stage,
  requiresReason,
  sensitive,
});

export const leaveActions: LeaveAction[] = [
  action('create', 'Create', adminRoles),
  action('apply', 'Apply Leave', allRoles),
  action('edit', 'Edit', ['Employee', ...adminRoles]),
  action('save-draft', 'Save Draft', allRoles),
  action('submit', 'Submit', allRoles, ['Employee']),
  action('approve', 'Approve', approvalRoles, ['Supervisor', 'Manager', 'HR', 'Final Approval'], false, true),
  action('reject', 'Reject', approvalRoles, ['Supervisor', 'Manager', 'HR', 'Final Approval'], true, true),
  action('recall', 'Recall', managerRoles, undefined, true, true),
  action('cancel', 'Cancel', allRoles, undefined, true),
  action('withdraw', 'Withdraw', ['Employee', ...adminRoles], undefined, true),
  action('encash', 'Encash', financeRoles, undefined, true, true),
  action('delegate', 'Delegate', managerRoles, undefined, true),
  action('escalate', 'Escalate', managerRoles, undefined, true),
  action('reassign', 'Reassign', adminRoles, undefined, true),
  action('adjust-balance', 'Adjust Balance', adminRoles, undefined, true, true),
  action('process-accrual', 'Process Accrual', adminRoles, undefined, false, true),
  action('process-carry-forward', 'Process Carry Forward', adminRoles, undefined, false, true),
  action('generate-report', 'Generate Report', [...adminRoles, ...managerRoles, 'Payroll Officer']),
  action('export', 'Export', [...adminRoles, ...managerRoles, 'Payroll Officer']),
  action('import', 'Import', adminRoles, undefined, false, true),
  action('archive', 'Archive', ['HR Manager', 'System Administrator'], undefined, true, true),
  action('reopen', 'Reopen', ['HR Manager', 'System Administrator'], undefined, true, true),
  action('view-history', 'View History', allRoles),
  action('view-audit-trail', 'View Audit Trail', [...adminRoles, 'Executive', 'System Administrator']),
  action('request-clarification', 'Request Clarification', approvalRoles, undefined, true),
  action('bulk-approve', 'Bulk Approve', approvalRoles, undefined, false, true),
  action('bulk-reject', 'Bulk Reject', approvalRoles, undefined, true, true),
  action('schedule-leave', 'Schedule Leave', allRoles),
  action('block-period', 'Block Leave Period', adminRoles, undefined, true),
  action('publish-calendar', 'Publish Calendar', adminRoles),
  action('post-to-payroll', 'Post to Payroll', financeRoles, undefined, false, true),
  action('close-year', 'Close Leave Year', ['HR Manager', 'System Administrator'], undefined, false, true),
];

const dateAdd = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

const isWorkingDate = (date: string) => {
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return day !== 0 && day !== 6;
};

const dateInRange = (date: string, startDate: string, endDate: string) =>
  date >= startDate && date <= endDate;

const isAnnualLeaveType = (leaveType: string) => /annual/i.test(String(leaveType || ''));

const appToDrilldownRow = (item: LeaveApplicationRecord): LeaveDrilldownRow => ({
  employeeId: item.employeeId,
  fullName: item.fullName,
  department: item.department,
  leaveType: item.leaveType,
  startDate: item.startDate,
  endDate: item.endDate,
  days: item.days,
  status: item.status,
  stage: item.stage,
});

const buildLeaveDrilldowns = (
  employees: DleEmployeeDirectoryRow[],
  applications: LeaveApplicationRecord[],
  balances: LeaveBalanceRecord[],
) => {
  const today = dateAdd(0);
  const activeLeaveStatuses = ['Approved', 'Completed'] as const;
  const pendingStatuses = ['Submitted', 'Under Review', 'Draft'] as const;

  const onLeaveTodayApps = applications.filter(
    (item) => activeLeaveStatuses.includes(item.status as typeof activeLeaveStatuses[number]) && dateInRange(today, item.startDate, item.endDate),
  );
  const onLeaveStatusEmployees = employees.filter((employee) => String(employee.status || '').toLowerCase().includes('on leave'));
  const onLeaveTodayKeys = new Set(onLeaveTodayApps.map((item) => item.employeeId.toUpperCase()));
  const onLeaveToday = [
    ...onLeaveTodayApps.map(appToDrilldownRow),
    ...onLeaveStatusEmployees
      .filter((employee) => !onLeaveTodayKeys.has(String(employee.employeeId || employee.employeeCode).toUpperCase()))
      .map((employee) => ({
        employeeId: employee.employeeId,
        fullName: employee.fullName,
        department: employee.department || 'Unassigned',
        status: employee.status,
        metricLabel: 'HRIS status',
        metricValue: 'On Leave',
      })),
  ];

  const returningToday = applications
    .filter((item) => activeLeaveStatuses.includes(item.status as typeof activeLeaveStatuses[number]) && item.endDate === today)
    .map(appToDrilldownRow);

  const pendingApprovals = applications
    .filter((item) => pendingStatuses.includes(item.status as typeof pendingStatuses[number]))
    .map(appToDrilldownRow);

  const pendingManagerApprovals = applications
    .filter((item) => pendingStatuses.includes(item.status as typeof pendingStatuses[number]) && (item.status === 'Submitted' || item.stage === 'Supervisor'))
    .map(appToDrilldownRow);

  const pendingHrApprovals = applications
    .filter((item) => pendingStatuses.includes(item.status as typeof pendingStatuses[number]) && (item.status === 'Under Review' || item.stage === 'HR'))
    .map(appToDrilldownRow);

  const upcomingLeave = applications
    .filter((item) => item.startDate > today && ['Approved', 'Submitted', 'Under Review'].includes(item.status))
    .map(appToDrilldownRow);

  const totalEmployees = employees
    .filter((employee) => activeStatus(employee.status))
    .map((employee) => ({
      employeeId: employee.employeeId,
      fullName: employee.fullName,
      department: employee.department || 'Unassigned',
      status: employee.status,
      metricLabel: 'Job title',
      metricValue: employee.jobTitle || employee.designation || '—',
    }));

  const annualBalances = balances.filter((item) => isAnnualLeaveType(item.leaveType));
  const leaveUtilization = annualBalances.map((item) => ({
    employeeId: item.employeeId,
    fullName: item.fullName,
    department: item.department,
    leaveType: item.leaveType,
    status: item.status,
    metricLabel: 'Used / Accrued',
    metricValue: `${item.usedBalance} / ${item.accruedBalance}`,
    days: item.usedBalance,
  }));

  const leaveLiability = annualBalances
    .filter((item) => item.liabilityValue > 0)
    .map((item) => ({
      employeeId: item.employeeId,
      fullName: item.fullName,
      department: item.department,
      leaveType: item.leaveType,
      status: item.status,
      metricLabel: 'Liability',
      metricValue: moneyFmt.format(item.liabilityValue),
      days: item.currentBalance,
    }))
    .sort((a, b) => Number(String(b.metricValue).replace(/[^\d.-]/g, '') || 0) - Number(String(a.metricValue).replace(/[^\d.-]/g, '') || 0));

  const carryForwardByEmployee = new Map<string, LeaveDrilldownRow>();
  for (const item of balances) {
    if (item.carryForwardBalance <= 0) continue;
    const existing = carryForwardByEmployee.get(item.employeeId);
    if (!existing || item.carryForwardBalance > Number(existing.days || 0)) {
      carryForwardByEmployee.set(item.employeeId, {
        employeeId: item.employeeId,
        fullName: item.fullName,
        department: item.department,
        leaveType: item.leaveType,
        status: item.status,
        metricLabel: 'Carry forward days',
        metricValue: item.carryForwardBalance,
        days: item.carryForwardBalance,
      });
    }
  }

  const cancellationRequests = applications
    .filter((item) => item.status === 'Cancelled')
    .map(appToDrilldownRow);

  return {
    totalEmployees,
    onLeaveToday,
    returningToday,
    pendingApprovals,
    pendingManagerApprovals,
    pendingHrApprovals,
    upcomingLeave,
    leaveUtilization,
    leaveLiability,
    carryForwardProcessing: [...carryForwardByEmployee.values()].sort((a, b) => Number(b.days || 0) - Number(a.days || 0)),
    cancellationRequests,
  };
};

const currentYear = new Date().getFullYear();
export const dormantLongPolicy = {
  annualPermanentDays: 30,
  annualJuniorPermanentDays: 25,
  annualContractDays: 14,
  sickDays: 10,
  casualDays: 0,
  compassionateDays: 5,
  examDays: 5,
  maternityCalendarDays: 90,
  carryForwardCap: 7,
  carryForwardExpiry: `${currentYear}-03-31`,
  allowanceMinimumAnnualDays: 10,
};

export const isLumpsumEmployee = (employee: Pick<DleEmployeeDirectoryRow, 'employeeId' | 'employeeCode' | 'employmentType' | 'employeeCategory' | 'staffCategory' | 'payrollGroup' | 'salaryGrade' | 'jobGrade'>) => {
  const categoryText = [
    employee.employmentType,
    employee.employeeCategory,
    employee.staffCategory,
    employee.payrollGroup,
    employee.salaryGrade,
    employee.jobGrade,
  ].map((value) => String(value || '').trim()).filter(Boolean).join(' ').toLowerCase();
  const code = String(employee.employeeCode || employee.employeeId || '').trim().toUpperCase();
  return /\b(lumpsum|lump sum)\b/.test(categoryText) || /^L\d+/.test(code);
};

export const isFourteenDayPaidLeaveEmployee = (employee: Pick<DleEmployeeDirectoryRow, 'employeeId' | 'employeeCode' | 'employmentType' | 'employeeCategory' | 'staffCategory' | 'payrollGroup' | 'salaryGrade' | 'jobGrade'>) => {
  const categoryText = [
    employee.employmentType,
    employee.employeeCategory,
    employee.staffCategory,
    employee.payrollGroup,
    employee.salaryGrade,
    employee.jobGrade,
  ].map((value) => String(value || '').trim()).filter(Boolean).join(' ').toLowerCase();
  const code = String(employee.employeeCode || employee.employeeId || '').trim().toUpperCase();
  return (
    /\b(contract|daily rate|casual|temporary)\b/.test(categoryText) ||
    /\b(nysc|national youth service|industrial training|intern|internship|student trainee|\bit\b)\b/.test(categoryText) ||
    /^(IT|I|NYSC|N)\d+/.test(code) ||
    (/\b(lumpsum|lump sum)\b/.test(categoryText) || /^L\d+/.test(code))
  );
};

export const isMaternityEligibleEmployee = (employee: Pick<DleEmployeeDirectoryRow, 'employeeId' | 'employeeCode' | 'employmentType' | 'employeeCategory' | 'staffCategory' | 'payrollGroup' | 'salaryGrade' | 'jobGrade' | 'status' | 'gender'>) => {
  const gender = String(employee.gender || '').trim().toLowerCase();
  if (!gender.startsWith('f')) return false;
  return isConfirmedPermanent(employee) || isLumpsumEmployee(employee);
};

const defaultLeaveTypePolicies: LeaveTypeRule[] = [
  { id: 'annual-leave', name: 'Annual Leave', active: true, entitlementDays: dormantLongPolicy.annualPermanentDays, durationBasis: 'Working days', eligibility: 'Confirmed permanent employees receive 30 working days, junior permanent employees receive 25 working days, and contract/daily/lumpsum/NYSC/IT employees receive 14 paid working days annually while active.', waitingPeriodDays: 0, gradeRestrictions: [], categoryRestrictions: ['Permanent', 'Junior Permanent', 'Contract'], genderRestriction: 'None', documentRequirements: [], approvalLevels: ['Supervisor / Line Manager', 'HR Manager / Head'], accrualRule: 'Annual entitlement grant with confirmation and grade/category validation', carryForwardRule: `Every 1 January, unused Annual Leave rolls over to a maximum of ${dormantLongPolicy.carryForwardCap} working days as Carry Forward Leave and expires on 31 March.`, encashmentRule: 'Not encashable unless separately approved by HR and Payroll policy.', allowanceRule: `Leave Allowance is payable only when at least ${dormantLongPolicy.allowanceMinimumAnnualDays} working days Annual Leave is applied from the current year's entitlement.` },
  { id: 'sick-leave', name: 'Sick Leave', active: true, entitlementDays: dormantLongPolicy.sickDays, durationBasis: 'Working days', eligibility: 'Permanent employees receive 10 working days annually with medical evidence where required.', waitingPeriodDays: 0, gradeRestrictions: [], categoryRestrictions: ['Permanent'], genderRestriction: 'None', documentRequirements: ['Medical certificate'], approvalLevels: ['Supervisor', 'HR'], accrualRule: 'Annual grant', carryForwardRule: 'No carry forward', encashmentRule: 'Not encashable', allowanceRule: 'No leave allowance' },
  { id: 'casual-leave', name: 'Casual Leave', active: false, entitlementDays: 0, durationBasis: 'Working days', eligibility: 'Retired leave type.', waitingPeriodDays: 0, gradeRestrictions: [], categoryRestrictions: [], genderRestriction: 'None', documentRequirements: [], approvalLevels: [], accrualRule: 'Retired', carryForwardRule: 'Not applicable', encashmentRule: 'Not encashable', allowanceRule: 'No leave allowance' },
  { id: 'compassionate-leave', name: 'Compassionate Leave', active: true, entitlementDays: dormantLongPolicy.compassionateDays, durationBasis: 'Working days', eligibility: 'Permanent employees receive 5 working days annually for HR-approved compassionate reasons.', waitingPeriodDays: 0, gradeRestrictions: [], categoryRestrictions: ['Permanent'], genderRestriction: 'None', documentRequirements: ['Supporting document'], approvalLevels: ['Supervisor', 'HR'], accrualRule: 'Annual grant', carryForwardRule: 'No carry forward', encashmentRule: 'Not encashable', allowanceRule: 'No leave allowance' },
  { id: 'exam-leave', name: 'Exam Leave', active: true, entitlementDays: dormantLongPolicy.examDays, durationBasis: 'Working days', eligibility: 'Permanent employees receive 5 working days annually for approved examination schedules.', waitingPeriodDays: 0, gradeRestrictions: [], categoryRestrictions: ['Permanent'], genderRestriction: 'None', documentRequirements: ['Exam timetable', 'Institution evidence'], approvalLevels: ['Manager', 'HR'], accrualRule: 'Annual grant', carryForwardRule: 'No carry forward', encashmentRule: 'Not encashable', allowanceRule: 'No leave allowance' },
  { id: 'maternity-leave', name: 'Maternity Leave', active: true, entitlementDays: dormantLongPolicy.maternityCalendarDays, durationBasis: 'Calendar days', eligibility: 'Eligible confirmed permanent and lumpsum female employees receive 90 calendar days by policy.', waitingPeriodDays: 0, gradeRestrictions: [], categoryRestrictions: ['Permanent', 'Lumpsum'], genderRestriction: 'Female', documentRequirements: ['Medical certificate', 'Expected delivery date'], approvalLevels: ['Manager', 'HR', 'Final Approval'], accrualRule: 'Policy grant', carryForwardRule: 'Not applicable', encashmentRule: 'Not encashable', allowanceRule: 'No leave allowance' },
  { id: 'unpaid-leave', name: 'Unpaid Leave', active: false, entitlementDays: 0, durationBasis: 'Working days', eligibility: 'Retired leave type.', waitingPeriodDays: 0, gradeRestrictions: [], categoryRestrictions: [], genderRestriction: 'None', documentRequirements: [], approvalLevels: [], accrualRule: 'Retired', carryForwardRule: 'Not applicable', encashmentRule: 'Not encashable', allowanceRule: 'No leave allowance' },
];

const activeStatus = (status: string) => ['active', 'confirmed', 'probation', 'on leave', 'contract active', 'reactivated'].includes(String(status || '').toLowerCase());

const isPermanentEmployee = (employee: Pick<DleEmployeeDirectoryRow, 'employmentType' | 'employeeCategory' | 'staffCategory'>) => {
  const category = [employee.employmentType, employee.employeeCategory, employee.staffCategory]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean)
    .join(' ');
  return /\b(permanent|perm)\b/.test(category);
};

export type ConfirmedPermanentInput =
  Pick<DleEmployeeDirectoryRow, 'status' | 'employmentType' | 'employeeCategory' | 'staffCategory'> &
  Partial<Pick<DleEmployeeDirectoryRow, 'confirmationDueDate' | 'probationEndDate' | 'dateJoined' | 'yearsOfService'>>;

export const isConfirmedPermanent = (employee: ConfirmedPermanentInput) => {
  const status = String(employee.status || '').toLowerCase();
  if (status.includes('confirmed') || status.includes('reactivated')) return true;
  if (status.includes('probation')) return false;

  const dueDate = String(employee.confirmationDueDate || employee.probationEndDate || '').slice(0, 10);
  if (dueDate) {
    const today = new Date().toISOString().slice(0, 10);
    if (dueDate <= today) return true;
  }

  if (isPermanentEmployee(employee) && activeStatus(employee.status)) {
    const years = Number(employee.yearsOfService || 0);
    if (years >= 1) return true;
    const joined = String(employee.dateJoined || '').slice(0, 10);
    if (joined) {
      const joinedAt = new Date(`${joined}T00:00:00.000Z`);
      if (!Number.isNaN(joinedAt.getTime())) {
        const months = (Date.now() - joinedAt.getTime()) / (30 * 24 * 60 * 60 * 1000);
        if (months >= 12) return true;
      }
    }
  }

  return false;
};

const entitlementFor = (employee: DleEmployeeDirectoryRow, leaveType = 'Annual Leave') => {
  if (leaveType === 'Annual Leave') return annualLeaveEntitlementForEmployee(employee);
  if (leaveType === 'Maternity Leave') return isMaternityEligibleEmployee(employee) ? dormantLongPolicy.maternityCalendarDays : 0;
  if (isFourteenDayPaidLeaveEmployee(employee) && leaveType !== 'Maternity Leave') return 0;
  if (leaveType === 'Sick Leave') return dormantLongPolicy.sickDays;
  if (leaveType === 'Compassionate Leave') return dormantLongPolicy.compassionateDays;
  if (leaveType === 'Exam Leave') return dormantLongPolicy.examDays;
  return 0;
};

const isJuniorPermanentEmployee = (employee: Pick<DleEmployeeDirectoryRow, 'employmentType' | 'employeeCategory' | 'staffCategory' | 'payrollGroup' | 'salaryGrade' | 'jobGrade' | 'jobTitle' | 'designation'>) => {
  const text = [
    employee.employmentType,
    employee.employeeCategory,
    employee.staffCategory,
    employee.payrollGroup,
    employee.salaryGrade,
    employee.jobGrade,
    employee.jobTitle,
    employee.designation,
  ].map((value) => String(value || '').trim()).filter(Boolean).join(' ').toLowerCase();
  return /\b(junior|jnr|jr|j[0-9])\b/.test(text) && /\b(permanent|perm)\b/.test(text);
};

export const annualLeaveEntitlementForEmployee = (employee: DleEmployeeDirectoryRow) =>
  isFourteenDayPaidLeaveEmployee(employee)
    ? dormantLongPolicy.annualContractDays
    : isJuniorPermanentEmployee(employee)
      ? dormantLongPolicy.annualJuniorPermanentDays
      : isConfirmedPermanent(employee)
        ? dormantLongPolicy.annualPermanentDays
        : 0;

type DbLeaveApplicationRow = {
  Id: string;
  SourceSystem: string;
  EmployeeId: string;
  FullName: string;
  Department: string;
  ManagerName: string;
  Location: string;
  EmployeeCategory: string;
  LeaveType: string;
  StartDate: Date | string;
  EndDate: Date | string;
  Days: number;
  StatusName: LeaveStatus;
  WorkflowStage: WorkflowStage;
  ApprovalStatus: string;
  PolicyComplianceStatus: LeaveApplicationRecord['policyComplianceStatus'];
  BalanceImpact: number;
  AvailableBalance: number;
  ActingOfficer: string;
  SupportingDocuments: number;
  ExceptionsJson: string;
  AuditCount: number;
  CreatedAt: Date | string;
  UpdatedAt: Date | string;
};

type DbLeaveBalanceRow = {
  EmployeeId: string;
  FullName: string;
  Department: string;
  LeaveType: string;
  CurrentBalance: number;
  AccruedBalance: number;
  UsedBalance: number;
  PendingBalance: number;
  ForfeitedBalance: number;
  CarryForwardBalance: number;
  LiabilityValue: number;
  StatusName: LeaveBalanceRecord['status'];
  ExceptionsJson: string;
};

type DbLeaveAuditRow = {
  Id: string;
  CreatedAt: Date | string;
  Actor: string;
  ActorRole: LeaveRole;
  ActionName: string;
  RecordId: string;
  OldValue: string | null;
  NewValue: string | null;
  Comments: string | null;
  Reason: string | null;
};

const dbReady = { value: false };
const clean = (value: unknown) => String(value || '').trim();
const round2 = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
const dateOnly = (value: Date | string | null | undefined) => value ? (value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)) : '';
const parseJsonArray = (value: string | null | undefined) => {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
};

const workflowStageForStatus = (status: LeaveStatus): WorkflowStage => {
  if (status === 'Draft') return 'Employee';
  if (status === 'Submitted') return 'Supervisor';
  if (status === 'Under Review') return 'HR';
  if (status === 'Approved') return 'Final Approval';
  return 'Closed';
};

const approvalStatusFor = (status: LeaveStatus) => {
  if (['Approved', 'Completed'].includes(status)) return 'Approved';
  if (status === 'Rejected') return 'Rejected';
  if (['Cancelled', 'Withdrawn', 'Terminated'].includes(status)) return status;
  return 'Pending';
};

const normalizeLeaveStatus = (status: string): LeaveStatus => {
  const normalized = clean(status).toLowerCase();
  if (['approved', 'closed'].includes(normalized)) return normalized === 'closed' ? 'Completed' : 'Approved';
  if (['submitted', 'pending'].includes(normalized)) return 'Submitted';
  if (['line manager review', 'hr review', 'finance review'].includes(normalized)) return 'Under Review';
  if (['under review', 'review'].includes(normalized)) return 'Under Review';
  if (['rejected', 'declined'].includes(normalized)) return 'Rejected';
  if (['withdrawn'].includes(normalized)) return 'Withdrawn';
  if (['cancelled', 'canceled'].includes(normalized)) return 'Cancelled';
  if (['terminated', 'expired'].includes(normalized)) return 'Terminated';
  if (['completed'].includes(normalized)) return 'Completed';
  return 'Draft';
};

const workingDaysBetween = (fromIso: string, toIso = new Date().toISOString()) => {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) return 0;
  let days = 0;
  for (let d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + 1)); d <= to; d = new Date(d.getTime() + 24 * 60 * 60 * 1000)) {
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) days += 1;
  }
  return days;
};

const monthlyPayFor = (employee: DleEmployeeDirectoryRow) => {
  const sageGross = employee.sagePayrollEarnings?.reduce((sum, line) => sum + Number(line.amount || 0), 0) || 0;
  if (sageGross > 0) return sageGross;
  if (Number(employee.periodSalary || 0) > 0) return Number(employee.periodSalary || 0);
  if (Number(employee.annualSalary || 0) > 0) return Number(employee.annualSalary || 0) / 12;
  if (Number(employee.ratePerDay || 0) > 0) return Number(employee.ratePerDay || 0) * 22;
  if (Number(employee.ratePerHour || 0) > 0) return Number(employee.ratePerHour || 0) * Number(employee.hoursPerPeriod || 176);
  return 0;
};

const dailyPayFor = (employee: DleEmployeeDirectoryRow) => {
  if (Number(employee.ratePerDay || 0) > 0) return Number(employee.ratePerDay || 0);
  const monthly = monthlyPayFor(employee);
  return monthly > 0 ? monthly / 22 : 0;
};

const ensureDb = async () => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new Error('DLE Enterprise database is not configured. Leave management requires HRIS database persistence.');
  if (!dbReady.value) {
    await pool.request().query(`
IF SCHEMA_ID(N'hris') IS NULL EXEC(N'CREATE SCHEMA [hris]');
IF OBJECT_ID(N'[hris].[LeaveTypePolicies]', N'U') IS NULL
CREATE TABLE [hris].[LeaveTypePolicies] (
  [Id] NVARCHAR(80) NOT NULL CONSTRAINT [PK_LeaveTypePolicies] PRIMARY KEY,
  [Name] NVARCHAR(120) NOT NULL,
  [Active] BIT NOT NULL,
  [EntitlementDays] DECIMAL(9,2) NOT NULL,
  [DurationBasis] NVARCHAR(40) NOT NULL,
  [Eligibility] NVARCHAR(800) NOT NULL,
  [WaitingPeriodDays] INT NOT NULL,
  [GradeRestrictionsJson] NVARCHAR(MAX) NOT NULL,
  [CategoryRestrictionsJson] NVARCHAR(MAX) NOT NULL,
  [GenderRestriction] NVARCHAR(40) NOT NULL,
  [DocumentRequirementsJson] NVARCHAR(MAX) NOT NULL,
  [ApprovalLevelsJson] NVARCHAR(MAX) NOT NULL,
  [AccrualRule] NVARCHAR(500) NOT NULL,
  [CarryForwardRule] NVARCHAR(500) NOT NULL,
  [EncashmentRule] NVARCHAR(500) NOT NULL,
  [AllowanceRule] NVARCHAR(500) NOT NULL,
  [CreatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_LeaveTypePolicies_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_LeaveTypePolicies_UpdatedAt] DEFAULT SYSUTCDATETIME()
);
IF OBJECT_ID(N'[hris].[LeaveApplications]', N'U') IS NULL
CREATE TABLE [hris].[LeaveApplications] (
  [Id] NVARCHAR(120) NOT NULL CONSTRAINT [PK_LeaveApplications] PRIMARY KEY,
  [SourceSystem] NVARCHAR(80) NOT NULL,
  [EmployeeId] NVARCHAR(80) NOT NULL,
  [FullName] NVARCHAR(220) NOT NULL,
  [Department] NVARCHAR(180) NOT NULL,
  [ManagerName] NVARCHAR(180) NOT NULL,
  [Location] NVARCHAR(180) NOT NULL,
  [EmployeeCategory] NVARCHAR(120) NOT NULL,
  [LeaveType] NVARCHAR(120) NOT NULL,
  [StartDate] DATE NOT NULL,
  [EndDate] DATE NOT NULL,
  [Days] DECIMAL(9,2) NOT NULL,
  [StatusName] NVARCHAR(40) NOT NULL,
  [WorkflowStage] NVARCHAR(40) NOT NULL,
  [ApprovalStatus] NVARCHAR(60) NOT NULL,
  [PolicyComplianceStatus] NVARCHAR(40) NOT NULL,
  [BalanceImpact] DECIMAL(9,2) NOT NULL,
  [AvailableBalance] DECIMAL(9,2) NOT NULL,
  [ActingOfficer] NVARCHAR(180) NOT NULL,
  [SupportingDocuments] INT NOT NULL,
  [ExceptionsJson] NVARCHAR(MAX) NOT NULL,
  [CreatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_LeaveApplications_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_LeaveApplications_UpdatedAt] DEFAULT SYSUTCDATETIME()
);
IF OBJECT_ID(N'[hris].[LeaveBalances]', N'U') IS NULL
CREATE TABLE [hris].[LeaveBalances] (
  [EmployeeId] NVARCHAR(80) NOT NULL,
  [LeaveType] NVARCHAR(120) NOT NULL,
  [FullName] NVARCHAR(220) NOT NULL,
  [Department] NVARCHAR(180) NOT NULL,
  [CurrentBalance] DECIMAL(9,2) NOT NULL,
  [AccruedBalance] DECIMAL(9,2) NOT NULL,
  [UsedBalance] DECIMAL(9,2) NOT NULL,
  [PendingBalance] DECIMAL(9,2) NOT NULL,
  [ForfeitedBalance] DECIMAL(9,2) NOT NULL,
  [CarryForwardBalance] DECIMAL(9,2) NOT NULL,
  [LiabilityValue] DECIMAL(19,2) NOT NULL,
  [StatusName] NVARCHAR(40) NOT NULL,
  [ExceptionsJson] NVARCHAR(MAX) NOT NULL,
  [SourceSystem] NVARCHAR(80) NOT NULL,
  [UpdatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_LeaveBalances_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  CONSTRAINT [PK_LeaveBalances] PRIMARY KEY ([EmployeeId], [LeaveType])
);
IF OBJECT_ID(N'[hris].[LeaveAuditTrail]', N'U') IS NULL
CREATE TABLE [hris].[LeaveAuditTrail] (
  [Id] NVARCHAR(140) NOT NULL CONSTRAINT [PK_LeaveAuditTrail] PRIMARY KEY,
  [CreatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_LeaveAuditTrail_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [Actor] NVARCHAR(180) NOT NULL,
  [ActorRole] NVARCHAR(80) NOT NULL,
  [ActionName] NVARCHAR(120) NOT NULL,
  [RecordId] NVARCHAR(180) NOT NULL,
  [OldValue] NVARCHAR(MAX) NULL,
  [NewValue] NVARCHAR(MAX) NULL,
  [Comments] NVARCHAR(700) NULL,
  [Reason] NVARCHAR(700) NULL
);
IF COL_LENGTH('[hris].[LeaveApplications]', 'WorkflowJson') IS NULL
  ALTER TABLE [hris].[LeaveApplications] ADD [WorkflowJson] NVARCHAR(MAX) NULL;
IF COL_LENGTH('[hris].[LeaveApplications]', 'CommentsJson') IS NULL
  ALTER TABLE [hris].[LeaveApplications] ADD [CommentsJson] NVARCHAR(MAX) NULL;`);
    dbReady.value = true;
  }
  return pool;
};

const syncLeaveTypePolicies = async (pool: sql.ConnectionPool) => {
  for (const type of defaultLeaveTypePolicies) {
    await pool.request()
      .input('Id', sql.NVarChar(80), type.id)
      .input('Name', sql.NVarChar(120), type.name)
      .input('Active', sql.Bit, type.active)
      .input('EntitlementDays', sql.Decimal(9, 2), type.entitlementDays)
      .input('DurationBasis', sql.NVarChar(40), type.durationBasis)
      .input('Eligibility', sql.NVarChar(800), type.eligibility)
      .input('WaitingPeriodDays', sql.Int, type.waitingPeriodDays)
      .input('GradeRestrictionsJson', sql.NVarChar(sql.MAX), JSON.stringify(type.gradeRestrictions))
      .input('CategoryRestrictionsJson', sql.NVarChar(sql.MAX), JSON.stringify(type.categoryRestrictions))
      .input('GenderRestriction', sql.NVarChar(40), type.genderRestriction)
      .input('DocumentRequirementsJson', sql.NVarChar(sql.MAX), JSON.stringify(type.documentRequirements))
      .input('ApprovalLevelsJson', sql.NVarChar(sql.MAX), JSON.stringify(type.approvalLevels))
      .input('AccrualRule', sql.NVarChar(500), type.accrualRule)
      .input('CarryForwardRule', sql.NVarChar(500), type.carryForwardRule)
      .input('EncashmentRule', sql.NVarChar(500), type.encashmentRule)
      .input('AllowanceRule', sql.NVarChar(500), type.allowanceRule)
      .query(`
MERGE [hris].[LeaveTypePolicies] AS target
USING (SELECT @Id AS [Id]) AS source
ON target.[Id] = source.[Id]
WHEN MATCHED THEN UPDATE SET
  [Name]=@Name,[Active]=@Active,[EntitlementDays]=@EntitlementDays,[DurationBasis]=@DurationBasis,[Eligibility]=@Eligibility,
  [WaitingPeriodDays]=@WaitingPeriodDays,[GradeRestrictionsJson]=@GradeRestrictionsJson,[CategoryRestrictionsJson]=@CategoryRestrictionsJson,
  [GenderRestriction]=@GenderRestriction,[DocumentRequirementsJson]=@DocumentRequirementsJson,[ApprovalLevelsJson]=@ApprovalLevelsJson,
  [AccrualRule]=@AccrualRule,[CarryForwardRule]=@CarryForwardRule,[EncashmentRule]=@EncashmentRule,[AllowanceRule]=@AllowanceRule,
  [UpdatedAt]=SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT
  ([Id],[Name],[Active],[EntitlementDays],[DurationBasis],[Eligibility],[WaitingPeriodDays],[GradeRestrictionsJson],[CategoryRestrictionsJson],[GenderRestriction],[DocumentRequirementsJson],[ApprovalLevelsJson],[AccrualRule],[CarryForwardRule],[EncashmentRule],[AllowanceRule])
VALUES
  (@Id,@Name,@Active,@EntitlementDays,@DurationBasis,@Eligibility,@WaitingPeriodDays,@GradeRestrictionsJson,@CategoryRestrictionsJson,@GenderRestriction,@DocumentRequirementsJson,@ApprovalLevelsJson,@AccrualRule,@CarryForwardRule,@EncashmentRule,@AllowanceRule);`);
  }
};

export type ApprovedPaidLeaveDay = {
  employeeId: string;
  employeeCode: string;
  fullName: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  days: number;
  status: LeaveStatus;
  requestId: string;
};

type EssLeaveRequest = {
  id: string;
  employeeId: string;
  category: string;
  status: string;
  submittedAt?: string;
  updatedAt?: string;
  leaveType?: string;
  startDate?: string;
  endDate?: string;
  days?: number;
  paidLeave?: boolean;
  relieverEmployeeId?: string;
  relieverName?: string;
  workflow?: Array<{ stage: string; owner: string; status: string; actedAt?: string | null; comment?: string | null }>;
};

const readEssLeaveRequests = async () => {
  try {
    const parsed = JSON.parse(await readFile(ESS_REQUESTS_PATH, 'utf8')) as EssLeaveRequest[];
    return Array.isArray(parsed)
      ? parsed.filter((request) => isLeaveEssRequest(request))
      : [];
  } catch {
    return [];
  }
};

const rowToApplication = (row: DbLeaveApplicationRow): LeaveApplicationRecord => ({
  id: row.Id,
  sourceSystem: row.SourceSystem,
  employeeId: row.EmployeeId,
  fullName: row.FullName,
  department: row.Department,
  managerName: row.ManagerName,
  location: row.Location,
  employeeCategory: row.EmployeeCategory,
  leaveType: row.LeaveType,
  startDate: dateOnly(row.StartDate),
  endDate: dateOnly(row.EndDate),
  days: Number(row.Days || 0),
  status: row.StatusName,
  stage: row.WorkflowStage,
  approvalStatus: row.ApprovalStatus,
  policyComplianceStatus: row.PolicyComplianceStatus,
  balanceImpact: Number(row.BalanceImpact || 0),
  availableBalance: Number(row.AvailableBalance || 0),
  actingOfficer: row.ActingOfficer,
  supportingDocuments: Number(row.SupportingDocuments || 0),
  exceptions: parseJsonArray(row.ExceptionsJson),
  auditCount: Number(row.AuditCount || 0),
  createdAt: new Date(row.CreatedAt).toISOString(),
  updatedAt: new Date(row.UpdatedAt).toISOString(),
});

const rowToBalance = (row: DbLeaveBalanceRow): LeaveBalanceRecord => ({
  employeeId: row.EmployeeId,
  fullName: row.FullName,
  department: row.Department,
  leaveType: row.LeaveType,
  currentBalance: Number(row.CurrentBalance || 0),
  accruedBalance: Number(row.AccruedBalance || 0),
  usedBalance: Number(row.UsedBalance || 0),
  pendingBalance: Number(row.PendingBalance || 0),
  forfeitedBalance: Number(row.ForfeitedBalance || 0),
  carryForwardBalance: Number(row.CarryForwardBalance || 0),
  liabilityValue: Number(row.LiabilityValue || 0),
  status: row.StatusName,
  exceptions: parseJsonArray(row.ExceptionsJson),
});

const rowToAudit = (row: DbLeaveAuditRow): LeaveAuditEntry => ({
  id: row.Id,
  at: new Date(row.CreatedAt).toISOString(),
  user: row.Actor,
  role: row.ActorRole,
  action: row.ActionName,
  record: row.RecordId,
  oldValue: row.OldValue,
  newValue: row.NewValue,
  comments: row.Comments || undefined,
  reason: row.Reason || undefined,
});

const readLeaveApplications = async (pool: sql.ConnectionPool) => {
  const result = await pool.request().query(`
SELECT a.[Id],a.[EmployeeId],a.[FullName],a.[Department],a.[ManagerName],a.[Location],a.[EmployeeCategory],a.[LeaveType],
  a.[StartDate],a.[EndDate],a.[Days],a.[StatusName],a.[WorkflowStage],a.[ApprovalStatus],a.[PolicyComplianceStatus],
  a.[BalanceImpact],a.[AvailableBalance],a.[ActingOfficer],a.[SupportingDocuments],a.[ExceptionsJson],
  a.[SourceSystem],a.[CreatedAt],a.[UpdatedAt],
  (SELECT COUNT(1) FROM [hris].[LeaveAuditTrail] aud WHERE aud.[RecordId]=a.[Id]) AS [AuditCount]
FROM [hris].[LeaveApplications] a
ORDER BY a.[StartDate] DESC, a.[UpdatedAt] DESC;`);
  return (result.recordset as DbLeaveApplicationRow[]).map(rowToApplication);
};

const readLeaveBalances = async (pool: sql.ConnectionPool) => {
  const result = await pool.request().query(`
SELECT [EmployeeId],[FullName],[Department],[LeaveType],[CurrentBalance],[AccruedBalance],[UsedBalance],[PendingBalance],
  [ForfeitedBalance],[CarryForwardBalance],[LiabilityValue],[StatusName],[ExceptionsJson]
FROM [hris].[LeaveBalances]
ORDER BY [Department], [FullName], [LeaveType];`);
  return (result.recordset as DbLeaveBalanceRow[]).map(rowToBalance);
};

const readLeaveTypes = async (pool: sql.ConnectionPool) => {
  const result = await pool.request().query(`
SELECT [Id],[Name],[Active],[EntitlementDays],[DurationBasis],[Eligibility],[WaitingPeriodDays],[GradeRestrictionsJson],
  [CategoryRestrictionsJson],[GenderRestriction],[DocumentRequirementsJson],[ApprovalLevelsJson],[AccrualRule],[CarryForwardRule],
  [EncashmentRule],[AllowanceRule]
FROM [hris].[LeaveTypePolicies]
ORDER BY [Name];`);
  return result.recordset.map((row: any) => ({
    id: row.Id,
    name: row.Name,
    active: Boolean(row.Active),
    entitlementDays: Number(row.EntitlementDays || 0),
    durationBasis: row.DurationBasis,
    eligibility: row.Eligibility,
    waitingPeriodDays: Number(row.WaitingPeriodDays || 0),
    gradeRestrictions: parseJsonArray(row.GradeRestrictionsJson),
    categoryRestrictions: parseJsonArray(row.CategoryRestrictionsJson),
    genderRestriction: row.GenderRestriction,
    documentRequirements: parseJsonArray(row.DocumentRequirementsJson),
    approvalLevels: parseJsonArray(row.ApprovalLevelsJson),
    accrualRule: row.AccrualRule,
    carryForwardRule: row.CarryForwardRule,
    encashmentRule: row.EncashmentRule,
    allowanceRule: row.AllowanceRule,
  } satisfies LeaveTypeRule));
};

const readLeaveAudit = async (pool: sql.ConnectionPool) => {
  const result = await pool.request().query(`
SELECT TOP (100) [Id],[CreatedAt],[Actor],[ActorRole],[ActionName],[RecordId],[OldValue],[NewValue],[Comments],[Reason]
FROM [hris].[LeaveAuditTrail]
ORDER BY [CreatedAt] DESC;`);
  return (result.recordset as DbLeaveAuditRow[]).map(rowToAudit);
};

const upsertEssLeaveRequests = async (pool: sql.ConnectionPool, employees: DleEmployeeDirectoryRow[]) => {
  const employeeById = new Map(employees.flatMap((employee) => [
    [employee.employeeId, employee],
    [employee.employeeCode, employee],
  ].filter(([key]) => Boolean(key)) as Array<[string, DleEmployeeDirectoryRow]>));
  const requests = await readEssLeaveRequests();
  for (const item of requests) {
    const employee = employeeById.get(item.employeeId);
    const rawStatus = item.status;
    const initialStatus = normalizeLeaveStatus(rawStatus);
    const status = ['Submitted', 'Under Review'].includes(initialStatus) && workingDaysBetween(item.updatedAt || item.submittedAt || new Date().toISOString()) > 5 ? 'Terminated' : initialStatus;
    const leaveType = clean(item.leaveType) || 'Annual Leave';
    const startDate = dateOnly(item.startDate);
    const endDate = dateOnly(item.endDate);
    if (!startDate || !endDate) continue;
    const days = Number(item.days || 0);
    const exceptions = [
      ...(days <= 0 ? ['Leave request has no calculated duration'] : []),
      ...(!employee ? ['Employee record not found in HRIS employee master'] : []),
      ...(leaveType === 'Annual Leave' && employee && !isFourteenDayPaidLeaveEmployee(employee) && !isConfirmedPermanent(employee) ? ['Annual Leave locked pending confirmation of appointment'] : []),
    ];
    const blocked = exceptions.some((entry) => entry.includes('not found') || entry.includes('locked'));
    await pool.request()
      .input('Id', sql.NVarChar(120), item.id)
      .input('SourceSystem', sql.NVarChar(80), 'ESS Leave Request')
      .input('EmployeeId', sql.NVarChar(80), employee?.employeeId || item.employeeId)
      .input('FullName', sql.NVarChar(220), employee?.fullName || item.employeeId)
      .input('Department', sql.NVarChar(180), employee?.department || 'Unassigned')
      .input('ManagerName', sql.NVarChar(180), employee?.managerName || employee?.departmentHead || 'Unassigned')
      .input('Location', sql.NVarChar(180), employee?.location || employee?.workLocation || 'Unassigned')
      .input('EmployeeCategory', sql.NVarChar(120), employee?.employeeCategory || employee?.employmentType || 'Unassigned')
      .input('LeaveType', sql.NVarChar(120), leaveType)
      .input('StartDate', sql.Date, startDate)
      .input('EndDate', sql.Date, endDate)
      .input('Days', sql.Decimal(9, 2), round2(days))
      .input('StatusName', sql.NVarChar(40), status)
      .input('WorkflowStage', sql.NVarChar(40), workflowStageForEssStatus(rawStatus, status))
      .input('ApprovalStatus', sql.NVarChar(60), approvalStatusForEss(status, rawStatus))
      .input('PolicyComplianceStatus', sql.NVarChar(40), blocked ? 'Blocked' : exceptions.length ? 'Attention Required' : 'Compliant')
      .input('BalanceImpact', sql.Decimal(9, 2), leaveType === 'Unpaid Leave' ? 0 : round2(days))
      .input('AvailableBalance', sql.Decimal(9, 2), 0)
      .input('ActingOfficer', sql.NVarChar(180), clean(item.relieverName) || clean(item.relieverEmployeeId) || 'Not configured')
      .input('SupportingDocuments', sql.Int, 0)
      .input('ExceptionsJson', sql.NVarChar(sql.MAX), JSON.stringify(exceptions))
      .query(`
MERGE [hris].[LeaveApplications] AS target
USING (SELECT @Id AS [Id]) AS source
ON target.[Id] = source.[Id]
WHEN MATCHED AND target.[StatusName] NOT IN (N'Cancelled', N'Rejected', N'Terminated', N'Completed', N'Withdrawn') THEN UPDATE SET
  [SourceSystem]=@SourceSystem,[EmployeeId]=@EmployeeId,[FullName]=@FullName,[Department]=@Department,[ManagerName]=@ManagerName,
  [Location]=@Location,[EmployeeCategory]=@EmployeeCategory,[LeaveType]=@LeaveType,[StartDate]=@StartDate,[EndDate]=@EndDate,
  [Days]=@Days,[StatusName]=@StatusName,[WorkflowStage]=@WorkflowStage,[ApprovalStatus]=@ApprovalStatus,
  [PolicyComplianceStatus]=@PolicyComplianceStatus,[BalanceImpact]=@BalanceImpact,[ActingOfficer]=@ActingOfficer,
  [SupportingDocuments]=@SupportingDocuments,[ExceptionsJson]=@ExceptionsJson,[UpdatedAt]=SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT
  ([Id],[SourceSystem],[EmployeeId],[FullName],[Department],[ManagerName],[Location],[EmployeeCategory],[LeaveType],[StartDate],[EndDate],
   [Days],[StatusName],[WorkflowStage],[ApprovalStatus],[PolicyComplianceStatus],[BalanceImpact],[AvailableBalance],[ActingOfficer],[SupportingDocuments],[ExceptionsJson])
VALUES
  (@Id,@SourceSystem,@EmployeeId,@FullName,@Department,@ManagerName,@Location,@EmployeeCategory,@LeaveType,@StartDate,@EndDate,
   @Days,@StatusName,@WorkflowStage,@ApprovalStatus,@PolicyComplianceStatus,@BalanceImpact,@AvailableBalance,@ActingOfficer,@SupportingDocuments,@ExceptionsJson);`);
  }
};

const syncLeaveBalances = async (pool: sql.ConnectionPool, employees: DleEmployeeDirectoryRow[]) => {
  const existingRows = await pool.request().query(`
SELECT [EmployeeId],[LeaveType],[CarryForwardBalance],[ForfeitedBalance]
FROM [hris].[LeaveBalances];`);
  const existing = new Map<string, { carry: number; forfeited: number }>();
  for (const row of existingRows.recordset as Array<{ EmployeeId: string; LeaveType: string; CarryForwardBalance: number; ForfeitedBalance: number }>) {
    existing.set(`${row.EmployeeId}::${row.LeaveType}`, { carry: Number(row.CarryForwardBalance || 0), forfeited: Number(row.ForfeitedBalance || 0) });
  }

  const applicationRows = await pool.request().query(`
SELECT [EmployeeId],[LeaveType],
  SUM(CASE WHEN [StatusName] IN (N'Approved',N'Completed') THEN [BalanceImpact] ELSE 0 END) AS [UsedDays],
  SUM(CASE WHEN [StatusName] IN (N'Submitted',N'Under Review',N'Line Manager Review',N'HR Review') THEN [BalanceImpact] ELSE 0 END) AS [PendingDays]
FROM [hris].[LeaveApplications]
WHERE [PolicyComplianceStatus] <> N'Blocked'
GROUP BY [EmployeeId],[LeaveType];`);
  const usage = new Map<string, { used: number; pending: number }>();
  for (const row of applicationRows.recordset as Array<{ EmployeeId: string; LeaveType: string; UsedDays: number; PendingDays: number }>) {
    usage.set(`${row.EmployeeId}::${row.LeaveType}`, { used: Number(row.UsedDays || 0), pending: Number(row.PendingDays || 0) });
  }

  for (const employee of employees.filter((row) => activeStatus(row.status))) {
    const leaveType = 'Annual Leave';
    const key = `${employee.employeeId}::${leaveType}`;
    const entitlement = entitlementFor(employee, leaveType);
    const currentExisting = existing.get(key);
    const carry = Math.min(dormantLongPolicy.carryForwardCap, Number(currentExisting?.carry || 0));
    const used = Number(usage.get(key)?.used || 0);
    const pending = Number(usage.get(key)?.pending || 0);
    const accrued = entitlement + carry;
    const current = Math.max(0, accrued - used - pending);
    const exceptions = [
      ...(current < 3 && entitlement > 0 ? ['Low leave balance'] : []),
      ...(!isFourteenDayPaidLeaveEmployee(employee) && !isConfirmedPermanent(employee) ? ['Annual Leave locked pending confirmation of appointment'] : []),
      ...(employee.hasManagerAssigned === false ? ['Reporting manager missing'] : []),
    ];
    const status: LeaveBalanceRecord['status'] = entitlement <= 0 || exceptions.some((item) => item.includes('locked')) ? 'Blocked' : exceptions.length ? 'Review' : 'Healthy';
    await pool.request()
      .input('EmployeeId', sql.NVarChar(80), employee.employeeId)
      .input('LeaveType', sql.NVarChar(120), leaveType)
      .input('FullName', sql.NVarChar(220), employee.fullName)
      .input('Department', sql.NVarChar(180), employee.department || 'Unassigned')
      .input('CurrentBalance', sql.Decimal(9, 2), round2(current))
      .input('AccruedBalance', sql.Decimal(9, 2), round2(accrued))
      .input('UsedBalance', sql.Decimal(9, 2), round2(used))
      .input('PendingBalance', sql.Decimal(9, 2), round2(pending))
      .input('ForfeitedBalance', sql.Decimal(9, 2), round2(currentExisting?.forfeited || 0))
      .input('CarryForwardBalance', sql.Decimal(9, 2), round2(carry))
      .input('LiabilityValue', sql.Decimal(19, 2), round2(current * dailyPayFor(employee)))
      .input('StatusName', sql.NVarChar(40), status)
      .input('ExceptionsJson', sql.NVarChar(sql.MAX), JSON.stringify(exceptions))
      .input('SourceSystem', sql.NVarChar(80), HRIS_LEAVE_SOURCE)
      .query(`
MERGE [hris].[LeaveBalances] AS target
USING (SELECT @EmployeeId AS [EmployeeId], @LeaveType AS [LeaveType]) AS source
ON target.[EmployeeId] = source.[EmployeeId] AND target.[LeaveType] = source.[LeaveType]
WHEN MATCHED THEN UPDATE SET
  [FullName]=@FullName,[Department]=@Department,[CurrentBalance]=@CurrentBalance,[AccruedBalance]=@AccruedBalance,
  [UsedBalance]=@UsedBalance,[PendingBalance]=@PendingBalance,[ForfeitedBalance]=@ForfeitedBalance,[CarryForwardBalance]=@CarryForwardBalance,
  [LiabilityValue]=@LiabilityValue,[StatusName]=@StatusName,[ExceptionsJson]=@ExceptionsJson,[SourceSystem]=@SourceSystem,[UpdatedAt]=SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT
  ([EmployeeId],[LeaveType],[FullName],[Department],[CurrentBalance],[AccruedBalance],[UsedBalance],[PendingBalance],[ForfeitedBalance],[CarryForwardBalance],[LiabilityValue],[StatusName],[ExceptionsJson],[SourceSystem])
VALUES
  (@EmployeeId,@LeaveType,@FullName,@Department,@CurrentBalance,@AccruedBalance,@UsedBalance,@PendingBalance,@ForfeitedBalance,@CarryForwardBalance,@LiabilityValue,@StatusName,@ExceptionsJson,@SourceSystem);`);
  }
};

export async function readEmployeeLeaveSnapshot(employee: DleEmployeeDirectoryRow, employees: DleEmployeeDirectoryRow[]) {
  const pool = await ensureDb();
  await maybeSyncLeaveTypePolicies(pool, false);
  await maybeUpsertEssLeaveRequests(pool, employees, true);
  await maybeSyncLeaveBalances(pool, employees, true);
  const keys = employeeMatchKeys(employee);
  const belongs = (employeeId: string) => keys.has(String(employeeId || '').trim().toUpperCase());
  const [applications, balances] = await Promise.all([readLeaveApplications(pool), readLeaveBalances(pool)]);
  return {
    applications: applications.filter((item) => belongs(item.employeeId)),
    balances: balances.filter((item) => belongs(item.employeeId)),
  };
}

const employeeMatchKeys = (employee: DleEmployeeDirectoryRow) =>
  new Set(
    [employee.employeeId, employee.employeeCode, employee.sourceEmployeeId]
      .map((value) => String(value || '').trim().toUpperCase())
      .filter(Boolean),
  );

export async function approvedPaidLeaveForDate(date: string): Promise<ApprovedPaidLeaveDay[]> {
  if (!date || !isWorkingDate(date)) return [];
  const employeeSource = await readPayrollEmployees();
  const pool = await ensureDb();
  await syncLeaveTypePolicies(pool);
  await upsertEssLeaveRequests(pool, employeeSource.employees);
  const employeesById = new Map(employeeSource.employees.flatMap((employee) => [
    [employee.employeeId, employee],
    [employee.employeeCode, employee],
  ].filter(([key]) => Boolean(key)) as Array<[string, DleEmployeeDirectoryRow]>));
  const applications = await readLeaveApplications(pool);
  return applications
    .filter((application) =>
      application.leaveType === 'Annual Leave' &&
      ['Approved', 'Completed'].includes(application.status) &&
      application.policyComplianceStatus !== 'Blocked' &&
      dateInRange(date, application.startDate, application.endDate),
    )
    .map((application) => {
      const employee = employeesById.get(application.employeeId);
      return {
        employeeId: application.employeeId,
        employeeCode: employee?.employeeCode || application.employeeId,
        fullName: application.fullName,
        leaveType: application.leaveType,
        startDate: application.startDate,
        endDate: application.endDate,
        days: application.days,
        status: application.status,
        requestId: application.id,
      };
    });
}

const sectionConfig: LeavePayload['operationalSections'] = [
  { id: 'dashboard', label: 'Dashboard', area: 'Dashboard', description: 'Operational leave command center with status, approvals, liability, exceptions, calendars, and action queues.', actions: ['apply', 'view-history', 'process-accrual', 'process-carry-forward', 'generate-report', 'view-audit-trail'], controls: ['Current leave status', 'Available actions', 'Next required action', 'Approval status', 'Policy compliance status', 'Leave balance impact', 'Audit history', 'Workflow progress', 'Exception indicators'] },
  { id: 'transactions', label: 'Transaction Register', area: 'Transactions', description: 'Production leave transaction register backed by HRIS leave application records, ESS workflow submissions, migrated employee context, audit trail, balance impact, reliever assignment, and payroll readiness.', actions: ['apply', 'submit', 'approve', 'reject', 'cancel', 'withdraw', 'view-history', 'view-audit-trail', 'export'], controls: ['HRIS persisted transaction ID', 'Source system', 'Employee and department', 'Leave type and dates', 'Workflow stage', 'Approval status', 'Reliever / acting officer', 'Balance impact', 'Audit count', 'Exception indicators'] },
  { id: 'applications', label: 'Applications', area: 'Transactions', description: 'Workflow-driven leave applications, drafts, document upload readiness, validation, status tracking, printing, and history.', actions: ['apply', 'save-draft', 'submit', 'edit', 'withdraw', 'cancel', 'view-history'], controls: ['Leave balance verification', 'Eligibility verification', 'Leave conflict detection', 'Public holiday validation', 'Overlapping leave detection', 'Reporting manager validation', 'Acting officer validation'] },
  { id: 'approvals', label: 'Approvals', area: 'Transactions', description: 'Multi-level supervisor, manager, HR, and final approval queue with comments, delegation, escalation, and bulk decisions.', actions: ['approve', 'reject', 'request-clarification', 'escalate', 'delegate', 'reassign', 'bulk-approve', 'bulk-reject', 'view-history'], controls: ['Department matrix', 'Grade matrix', 'Leave type matrix', 'Duration matrix', 'Employee category matrix'] },
  { id: 'recalls', label: 'Recalls', area: 'Transactions', description: 'Manager-to-HR leave recall workflow with employee notification, balance impact, compensation tracking, and audit history.', actions: ['recall', 'approve', 'reject', 'view-history'], controls: ['Recall reason', 'Recall date', 'Unused leave days', 'Compensation impact', 'Employee notification'] },
  { id: 'cancellations', label: 'Cancellations', area: 'Transactions', description: 'Cancellation requests, approval history, reversals, and balance restoration.', actions: ['cancel', 'approve', 'reject', 'reopen', 'view-history'], controls: ['Cancellation reason', 'Cancellation approval history', 'Balance restoration'] },
  { id: 'encashments', label: 'Encashments', area: 'Transactions', description: 'Encashment eligibility, value calculation, approval, payroll posting, and reporting.', actions: ['encash', 'submit', 'approve', 'reject', 'post-to-payroll', 'generate-report'], controls: ['Minimum balance requirements', 'Maximum encashment rules', 'Policy eligibility', 'Payroll integration'] },
  { id: 'leave-calendar', label: 'Leave Calendar', area: 'Planning & Balances', description: 'Daily, weekly, monthly, department, location, and company-wide leave planning calendar.', actions: ['schedule-leave', 'block-period', 'publish-calendar', 'generate-report'], controls: ['Team calendar', 'Department calendar', 'Company calendar', 'Holiday calendar', 'Conflict resolution', 'Critical date reservation'] },
  { id: 'team-leave-planner', label: 'Team Leave Planner', area: 'Planning & Balances', description: 'Manager planning surface for team coverage, resource conflicts, critical roles, and absence forecasting.', actions: ['schedule-leave', 'block-period', 'publish-calendar', 'generate-report'], controls: ['Department coverage', 'Critical role coverage', 'Reliever assignment', 'Overlap detection', 'Manager planning notes'] },
  { id: 'leave-balances', label: 'Leave Balances', area: 'Planning & Balances', description: 'Leave balance administration for current, accrued, used, pending, forfeited, carry-forward balances, and liability values.', actions: ['adjust-balance', 'import', 'export', 'view-history', 'process-accrual', 'process-carry-forward'], controls: ['Current balance', 'Accrued balance', 'Used balance', 'Pending balance', 'Forfeited balance', 'Carry forward balance', 'Leave liability value'] },
  { id: 'holiday-calendar', label: 'Holiday Calendar', area: 'Planning & Balances', description: 'Holiday and non-working-day management with region, location, payroll, and calendar integration controls.', actions: ['create', 'edit', 'publish-calendar', 'import', 'export'], controls: ['Public holidays', 'Company holidays', 'Regional observances', 'Payroll calendar sync', 'ESS visibility'] },
  { id: 'leave-types', label: 'Leave Types', area: 'Administration', description: 'Centralized Dorman Long leave type catalogue for annual, sick, casual, compassionate, exam, maternity, unpaid, contract annual, and future leave types.', actions: ['create', 'edit', 'archive', 'view-history', 'export'], controls: ['Permanent Annual Leave: 30 working days after confirmation', 'Contract/Lumpsum/NYSC/IT Annual Leave: 14 paid working days annually', 'Sick/Casual/Compassionate/Exam: 10/5/5/5 working days', 'Maternity Leave: 90 calendar days', 'Leave Allowance rule', 'Document requirements', 'Approval levels'] },
  { id: 'leave-policies', label: 'Leave Policies', area: 'Administration', description: 'Dorman Long policy configuration, cloning, activation, assignment, import/export, allowance, carry-forward, recall, cancellation, and workflow rules.', actions: ['create', 'edit', 'archive', 'import', 'export', 'view-audit-trail'], controls: ['Annual entitlement policy', 'Confirmation eligibility gate', 'Leave Allowance threshold', '31 March carry-forward expiry', 'Recall rules', 'Cancellation rules', 'Approval workflow rules'] },
  { id: 'leave-accruals', label: 'Leave Accruals', area: 'Administration', description: 'Scheduled annual entitlement processing with permanent/contract eligibility validation, confirmation checks, exception review, posting, and audit controls.', actions: ['process-accrual', 'view-history', 'generate-report', 'export'], controls: ['1 January annual grant', 'Permanent entitlement validation', 'Contract entitlement validation', 'Confirmation validation', 'Exception preview', 'Posting audit'] },
  { id: 'carry-forward-processing', label: 'Carry Forward Processing', area: 'Administration', description: 'Every 1 January, unused Annual Leave rolls over to Carry Forward Leave capped at 7 working days and expiring on 31 March.', actions: ['process-carry-forward', 'approve', 'reject', 'view-history', 'generate-report'], controls: ['7 working day cap', '31 March expiry', 'Forfeiture calculation', 'Approval requirement', 'Balance posting'] },
  { id: 'balance-adjustments', label: 'Balance Adjustments', area: 'Administration', description: 'Controlled manual balance corrections with RBAC, approval, evidence, audit, and rollback governance.', actions: ['adjust-balance', 'approve', 'reject', 'view-audit-trail', 'export'], controls: ['Adjustment reason', 'Evidence attachment', 'Approval workflow', 'Segregation of duties', 'Audit trail'] },
  { id: 'leave-year-end-processing', label: 'Leave Year-End Processing', area: 'Administration', description: 'Year-end close, 1 January entitlement grant, carry-forward posting, 31 March expiry handling, forfeiture, liability reporting, archive, and payroll handoff.', actions: ['close-year', 'process-carry-forward', 'process-accrual', 'post-to-payroll', 'archive', 'generate-report'], controls: ['Open transaction checks', '1 January annual grant', 'Carry-forward posting', '31 March expiry posting', 'Liability snapshot', 'Archive controls'] },
  { id: 'leave-allowance-exceptions', label: 'Leave Allowance Exceptions', area: 'Reports & Analytics', description: 'Payroll leave allowance policy exceptions, reversed payments, ineligible postings, and eligible requests awaiting payroll posting.', actions: ['generate-report', 'export', 'post-to-payroll', 'view-audit-trail'], controls: ['10-day annual leave threshold', 'Approved leave day validation', 'Reversed payroll events', 'Pending payroll posting queue', 'Linked leave transaction'], reports: ['Leave Allowance Exceptions Report', 'Leave Allowance Eligibility Report'] },
  { id: 'leave-reports', label: 'Leave Reports', area: 'Reports & Analytics', description: 'Executive leave report catalogue for Dorman Long utilization, balances, liability, approvals, allowance eligibility, carry-forward, history, departments, and absenteeism.', actions: ['generate-report', 'export', 'view-history'], controls: ['Schedule report', 'Email report', 'Save report view', 'Dashboard analytics'], reports: ['Leave Utilization Report', 'Leave Balance Report', 'Leave Liability Report', 'Leave Allowance Eligibility Report', 'Leave Allowance Exceptions Report', 'Carry Forward Expiry Report', 'Leave Approval Report', 'Employee Leave History', 'Department Leave Report', 'Absenteeism Report'] },
  { id: 'leave-utilization', label: 'Leave Utilization', area: 'Reports & Analytics', description: 'Utilization analytics by employee, department, location, grade, category, period, and leave type.', actions: ['generate-report', 'export', 'view-history'], controls: ['Utilization rate', 'Absence frequency', 'Department comparison', 'Leave type mix', 'Seasonality analysis'] },
  { id: 'leave-liability', label: 'Leave Liability', area: 'Reports & Analytics', description: 'Financial liability tracking for accrued, carried, pending, forfeited, and encashable balances with payroll and finance integration.', actions: ['generate-report', 'export', 'post-to-payroll', 'view-history'], controls: ['Liability valuation', 'Payroll posting readiness', 'Finance export', 'Encashment exposure', 'Year-end liability snapshot'] },
  { id: 'leave-trends', label: 'Leave Trends', area: 'Reports & Analytics', description: 'Trend analytics for leave demand, absence patterns, recurring exceptions, approval SLA, coverage risk, and workforce planning signals.', actions: ['generate-report', 'export', 'view-history'], controls: ['Monthly trend', 'Department trend', 'Exception trend', 'Approval SLA trend', 'Coverage risk trend'] },
  { id: 'approval-reports', label: 'Approval Reports', area: 'Reports & Analytics', description: 'Approval workflow analytics covering pending queues, SLA breaches, delegations, escalations, rejections, and approver performance.', actions: ['generate-report', 'export', 'view-audit-trail'], controls: ['Pending approval queue', 'SLA breach report', 'Delegation report', 'Escalation report', 'Approver audit trail'] },
];

const sectionAliases: Record<string, string> = {
  'leave-dashboard': 'dashboard',
  'planning-and-balances': 'leave-calendar',
  administration: 'leave-types',
  'reports-and-analytics': 'leave-reports',
  'leave-application': 'applications',
  'leave-approval': 'approvals',
  'leave-recall': 'recalls',
  'leave-cancellation': 'cancellations',
  'leave-encashment': 'encashments',
  'leave-balance': 'leave-balances',
  'leave-policy-setup': 'leave-policies',
  'reports-analytics': 'leave-reports',
  'annual-leave': 'leave-types',
  'sick-leave': 'leave-types',
  'maternity-leave': 'leave-types',
  'paternity-leave': 'leave-types',
  'compassionate-leave': 'leave-types',
  'study-leave': 'leave-types',
  'casual-leave': 'leave-types',
  'unpaid-leave': 'leave-types',
};

const normalizeSection = (section = 'dashboard') => sectionAliases[section] || section;

const reportList = ['Executive Leave Policy Dashboard', 'Leave Utilization Report', 'Leave Balance Report', 'Leave Liability Report', 'Leave Allowance Eligibility Report', 'Leave Allowance Exceptions Report', 'Carry Forward Expiry Report', 'Leave Approval Report', 'Leave Recall Report', 'Leave Cancellation Report', 'Leave Trend Analysis', 'Employee Leave History', 'Department Leave Report', 'Absenteeism Report'].map((name, index) => ({
  id: `rpt-${index + 1}`,
  name,
  status: 'Available',
  formats: 'Excel, PDF, CSV',
}));

const normalizeRole = (role?: string | null): LeaveRole => {
  const text = String(role || '').trim().toLowerCase();
  if (!text) return 'Leave Administrator';
  if (/super\s*admin|emergency system administration/.test(text)) return 'Super Administrator';
  if (/system\s*admin/.test(text)) return 'System Administrator';
  if (/hr\s*manager|hr\s*head|hr\s*director/.test(text)) return 'HR Manager';
  if (/hr\s*officer|hr\s*admin/.test(text)) return 'HR Officer';
  if (/department\s*manager|line\s*manager|head\s*of\s*department/.test(text)) return 'Department Manager';
  if (/supervisor|team\s*lead/.test(text)) return 'Supervisor';
  if (/payroll/.test(text)) return 'Payroll Officer';
  if (/executive|md\b|ceo\b|cfo\b/.test(text)) return 'Executive';
  if (/leave\s*admin/.test(text)) return 'Leave Administrator';
  if (/employee/.test(text)) return 'Employee';
  const found = allRoles.find((item) => item.toLowerCase() === text);
  return found || 'Leave Administrator';
};

const permissionsFor = (role: LeaveRole): LeavePayload['permissions'] => ({
  canApply: true,
  canApprove: approvalRoles.includes(role),
  canAdminister: adminRoles.includes(role),
  canProcessFinancials: financeRoles.includes(role),
  canConfigure: ['HR Manager', 'System Administrator', 'Super Administrator', 'Leave Administrator'].includes(role),
  canExport: role !== 'Employee',
  canViewAudit: role !== 'Employee',
});

let lastLeaveTypePolicySyncAt = 0;
const leaveTypePolicySyncIntervalMs = () => Number(process.env.HRIS_LEAVE_TYPE_POLICY_SYNC_MS || 3600000);

let lastEssLeaveUpsertAt = 0;
const essLeaveUpsertIntervalMs = () => Number(process.env.HRIS_ESS_LEAVE_SYNC_MS || 300000);

let lastLeaveBalanceSyncAt = 0;
const leaveBalanceSyncIntervalMs = () => Number(process.env.HRIS_LEAVE_BALANCE_SYNC_MS || 300000);

const maybeSyncLeaveTypePolicies = async (pool: sql.ConnectionPool, force = false) => {
  if (!force && Date.now() - lastLeaveTypePolicySyncAt < leaveTypePolicySyncIntervalMs()) return;
  await syncLeaveTypePolicies(pool);
  lastLeaveTypePolicySyncAt = Date.now();
};

const maybeUpsertEssLeaveRequests = async (pool: sql.ConnectionPool, employees: DleEmployeeDirectoryRow[], force = false) => {
  if (!force && Date.now() - lastEssLeaveUpsertAt < essLeaveUpsertIntervalMs()) return;
  await upsertEssLeaveRequests(pool, employees);
  lastEssLeaveUpsertAt = Date.now();
};

const maybeSyncLeaveBalances = async (pool: sql.ConnectionPool, employees: DleEmployeeDirectoryRow[], force = false) => {
  if (!force && Date.now() - lastLeaveBalanceSyncAt < leaveBalanceSyncIntervalMs()) return;
  await syncLeaveBalances(pool, employees);
  lastLeaveBalanceSyncAt = Date.now();
};

export async function readLeaveApplicationsForReconciliation(options?: { syncEss?: boolean }): Promise<LeaveApplicationLike[]> {
  const pool = await ensureDb();
  if (options?.syncEss !== false) {
    const employeeSource = await readPayrollEmployees();
    await upsertEssLeaveRequests(pool, employeeSource.employees);
  }
  const applications = await readLeaveApplications(pool);
  return applications.map((application) => ({
    id: application.id,
    employeeId: application.employeeId,
    fullName: application.fullName,
    department: application.department,
    leaveType: application.leaveType,
    startDate: application.startDate,
    endDate: application.endDate,
    days: application.days,
    status: application.status,
  }));
}

export async function readLeaveManagementPayload(
  section = 'dashboard',
  roleInput?: string | null,
  options?: { forceSync?: boolean; readOnly?: boolean },
): Promise<LeavePayload> {
  const forceSync = options?.forceSync === true;
  const readOnly = options?.readOnly === true;
  const normalizedSection = normalizeSection(section);
  const role = normalizeRole(roleInput);
  const employeeSource = await readPayrollEmployees();
  const employees = employeeSource.employees;
  const pool = await ensureDb();
  if (!readOnly) {
    await maybeSyncLeaveTypePolicies(pool, forceSync);
    await maybeUpsertEssLeaveRequests(pool, employees, forceSync);
    await maybeSyncLeaveBalances(pool, employees, forceSync);
  }
  const [applicationsRaw, balances, leaveTypes, auditTrail] = await Promise.all([
    readLeaveApplications(pool),
    readLeaveBalances(pool),
    readLeaveTypes(pool),
    readLeaveAudit(pool),
  ]);
  const allowanceEvents = forceSync
    ? await syncSageLeaveAllowanceEvents(applicationsRaw, { persist: !readOnly })
    : await reconcilePayrollLeaveAllowanceEvents(applicationsRaw, { persist: !readOnly });
  const applications = applicationsRaw.map((application) => {
    const allowance = buildLeaveAllowanceApplicationStatus(application, applicationsRaw, allowanceEvents);
    return {
      ...application,
      ...allowance,
      exceptions: [
        ...application.exceptions,
        ...(application.leaveType === 'Annual Leave'
          && Number(application.days || 0) >= dormantLongPolicy.allowanceMinimumAnnualDays
          && allowance.allowanceStatus.startsWith('Policy exception')
          ? ['Leave allowance payroll exception – review required']
          : []),
      ],
    };
  });
  const allowanceExceptions = buildLeaveAllowanceExceptions(applications, allowanceEvents);
  const allowanceExceptionCount = allowanceExceptions.filter((item) => item.severity === 'Critical').length;
  const allowancePendingPayrollCount = allowanceExceptions.filter((item) => item.severity === 'Pending').length;
  const pendingApplications = applications.filter((item) => ['Submitted', 'Under Review', 'Draft'].includes(item.status)).length;
  const pendingApprovals = applications.filter((item) => ['Submitted', 'Under Review', 'Draft'].includes(item.status)).length;
  const pendingManagerApprovals = applications.filter((item) => ['Submitted', 'Under Review', 'Draft'].includes(item.status) && (item.status === 'Submitted' || item.stage === 'Supervisor')).length;
  const pendingHrApprovals = applications.filter((item) => ['Submitted', 'Under Review', 'Draft'].includes(item.status) && (item.status === 'Under Review' || item.stage === 'HR')).length;
  const today = dateAdd(0);
  const activeLeaveStatuses = ['Approved', 'Completed'];
  const onLeaveTodayKeys = new Set(
    applications
      .filter((item) => activeLeaveStatuses.includes(item.status) && dateInRange(today, item.startDate, item.endDate))
      .map((item) => item.employeeId.toUpperCase()),
  );
  employees
    .filter((employee) => String(employee.status || '').toLowerCase().includes('on leave'))
    .forEach((employee) => onLeaveTodayKeys.add(String(employee.employeeId || employee.employeeCode).toUpperCase()));
  const employeesOnLeave = onLeaveTodayKeys.size;
  const exceptionCount = applications.reduce((sum, item) => sum + item.exceptions.length, 0) + balances.reduce((sum, item) => sum + item.exceptions.length, 0);
  const annualBalances = balances.filter((item) => isAnnualLeaveType(item.leaveType));
  const leaveLiability = annualBalances.reduce((sum, item) => sum + item.liabilityValue, 0);
  const totalAnnualAccrued = annualBalances.reduce((sum, item) => sum + item.accruedBalance, 0);
  const totalAnnualUsed = annualBalances.reduce((sum, item) => sum + item.usedBalance, 0);
  const drilldowns = {
    ...buildLeaveDrilldowns(employees, applications, balances),
    leaveAllowanceExceptions: allowanceExceptions.map((item) => ({
      employeeId: item.employeeId,
      fullName: item.fullName,
      department: item.department,
      leaveType: 'Annual Leave',
      startDate: item.payrollPeriod,
      endDate: String(item.leaveYear),
      days: item.requestDays,
      status: item.eventStatus,
      stage: item.severity,
      metricLabel: item.allowanceStatus,
      metricValue: item.recommendation,
    })),
  };
  const activeEmployeeCount = drilldowns.totalEmployees.length;
  const currentSection = sectionConfig.find((item) => item.id === normalizedSection) || sectionConfig[0];
  const availableActions = leaveActions.filter((item) => currentSection.actions.includes(item.id) && item.roles.includes(role));
  const blocked = applications.filter((item) => item.policyComplianceStatus === 'Blocked');
  const nextRequiredAction = blocked.length
    ? 'Resolve leave validation exceptions'
    : allowanceExceptionCount
      ? 'Review leave allowance payroll exceptions'
      : pendingApprovals
        ? 'Approve pending leave requests'
        : 'Run monthly accrual and publish calendar';

  return {
    generatedAt: nowIso(),
    source: `DLE_Enterprise HRIS leave tables. ${employeeSource.warning || ''}`.trim(),
    role,
    section: currentSection.id,
    permissions: permissionsFor(role),
    summary: {
      totalEmployees: activeEmployeeCount,
      employeesOnLeave,
      returningToday: drilldowns.returningToday.length,
      pendingApplications,
      pendingApprovals,
      pendingHrApprovals,
      pendingManagerApprovals,
      leaveUtilizationPct: totalAnnualAccrued > 0 ? Math.round((totalAnnualUsed / totalAnnualAccrued) * 100) : 0,
      leaveLiability,
      encashmentRequests: 0,
      recallRequests: 0,
      cancellationRequests: drilldowns.cancellationRequests.length,
      exceptionCount,
      allowanceExceptionCount,
      allowancePendingPayrollCount,
    },
    current: {
      leaveStatus: pendingApplications ? 'Operational queues active' : 'No pending employee leave queue',
      availableActions: availableActions.map((item) => item.label),
      nextRequiredAction,
      approvalStatus: pendingApprovals ? `${pendingApprovals} approvals pending` : 'No approvals pending',
      policyComplianceStatus: blocked.length ? `${blocked.length} blocked requests` : 'Compliant',
      leaveBalanceImpact: `${balances.reduce((sum, item) => sum + item.pendingBalance, 0)} pending days reserved`,
      auditHistory: `${auditTrail.length} persisted audit actions available`,
      workflowProgress: pendingApprovals ? 'Employee -> Supervisor -> Manager -> HR -> Final Approval' : 'Workflow clear',
      exceptionIndicators: [
        ...blocked.slice(0, 4).flatMap((item) => item.exceptions).slice(0, 5),
        ...(allowanceExceptionCount ? [`${allowanceExceptionCount} leave allowance payroll exception(s) require review`] : []),
      ],
    },
    actions: availableActions,
    applications,
    balances,
    allowanceExceptions,
    leaveTypes: leaveTypes.filter((type) => type.active && !/^(casual leave|unpaid leave)$/i.test(type.name)),
    calendar: applications.slice(0, 10).map((item) => ({ id: item.id, label: `${item.fullName} - ${item.leaveType}`, from: item.startDate, to: item.endDate, status: item.status, department: item.department, location: item.location })),
    blockedPeriods: [],
    workflowMatrix: [
      { dimension: 'Department', rule: 'Supervisor -> Manager -> HR' },
      { dimension: 'Grade', rule: 'Senior grades require final approval' },
      { dimension: 'Leave Type', rule: 'Maternity, Exam, Unpaid, and exception leave require HR final review' },
      { dimension: 'Duration', rule: 'Annual Leave of 10 working days or more triggers Leave Allowance payroll review' },
      { dimension: 'Employee Category', rule: 'Permanent annual leave validates confirmation; contract annual leave validates active contract entitlement' },
    ],
    reports: reportList,
    notifications: ['Leave submitted', 'Leave approved', 'Leave rejected', 'Leave recalled', 'Leave cancelled', 'Leave Allowance payroll review required', 'Annual Leave locked pending confirmation', 'Carry Forward Leave created on 1 January', 'Carry Forward Leave expires 31 March', 'Leave balance adjusted', 'Accrual completed', 'Leave year closed'].map((name, index) => ({ id: `ntf-${index + 1}`, event: name, channels: 'Email, In-app, ESS', status: 'Enabled' })),
    auditTrail,
    integrations: [
      { system: 'ESS Portal', status: 'Ready', purpose: 'Apply leave, view Dorman Long entitlements, balances, carry-forward expiry, calendars, history, status, withdrawals, and documents' },
      { system: 'Payroll Management', status: 'Ready', purpose: `Leave Allowance payable only for ${dormantLongPolicy.allowanceMinimumAnnualDays}+ current-year Annual Leave working days; unpaid leave and liability posting supported` },
      { system: 'Attendance', status: 'Ready', purpose: 'Disable clock-in during approved leave and reconcile absences' },
      { system: 'Notifications', status: 'Ready', purpose: 'Email, in-app, and ESS alerts' },
      { system: 'Finance', status: 'Ready', purpose: `Leave liability ${moneyFmt.format(leaveLiability)} export/posting with carry-forward and allowance exposure` },
    ],
    operationalSections: sectionConfig,
    drilldowns,
  };
}

export async function auditLeaveAction(input: Omit<LeaveAuditEntry, 'id' | 'at'>) {
  const pool = await ensureDb();
  await pool.request()
    .input('Id', sql.NVarChar(140), `leave-aud-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    .input('Actor', sql.NVarChar(180), input.user)
    .input('ActorRole', sql.NVarChar(80), input.role)
    .input('ActionName', sql.NVarChar(120), input.action)
    .input('RecordId', sql.NVarChar(180), input.record)
    .input('OldValue', sql.NVarChar(sql.MAX), input.oldValue)
    .input('NewValue', sql.NVarChar(sql.MAX), input.newValue)
    .input('Comments', sql.NVarChar(700), input.comments || null)
    .input('Reason', sql.NVarChar(700), input.reason || null)
    .query(`
INSERT [hris].[LeaveAuditTrail]([Id],[Actor],[ActorRole],[ActionName],[RecordId],[OldValue],[NewValue],[Comments],[Reason])
VALUES (@Id,@Actor,@ActorRole,@ActionName,@RecordId,@OldValue,@NewValue,@Comments,@Reason);`);
}

export function validateLeaveAction(actionId: LeaveActionId, roleInput: string | null | undefined, payload: LeavePayload, body: any = {}) {
  const role = normalizeRole(roleInput);
  const actionDef = leaveActions.find((item) => item.id === actionId);
  if (!actionDef) return { ok: false, status: 400, message: 'Unknown leave action.' };
  if (!actionDef.roles.includes(role)) return { ok: false, status: 403, message: `${role} is not permitted to perform ${actionDef.label}.` };
  if (actionDef.requiresReason && !String(body.reason || '').trim()) return { ok: false, status: 400, message: 'Reason is required for this leave action.' };
  if (actionId === 'approve' && body.employeeId && String(body.actor || '').toLowerCase() === String(body.employeeId || '').toLowerCase()) return { ok: false, status: 409, message: 'Self-approval is not permitted.' };
  if (['approve', 'bulk-approve'].includes(actionId)) {
    const targetIds = body.record
      ? [String(body.record)]
      : Array.isArray(body.records)
        ? body.records.map(String)
        : [];
    const blockedTargets = targetIds.length
      ? payload.applications.filter((item) => targetIds.includes(item.id) && item.policyComplianceStatus === 'Blocked')
      : payload.applications.filter((item) => item.policyComplianceStatus === 'Blocked');
    if (blockedTargets.length) return { ok: false, status: 409, message: 'Resolve blocked leave exceptions before approval.' };
  }
  if (actionId === 'apply' || actionId === 'submit') {
    const requestedDays = Number(body.days || 0);
    const leaveType = String(body.leaveType || 'Annual Leave');
    const employeeCategory = String(body.employeeCategory || body.employmentType || 'Permanent');
    const fourteenDayPaidLeaveRequest = /contract|lumpsum|lump sum|daily rate|casual|temporary|nysc|national youth service|industrial training|intern|internship|\bit\b/i.test(employeeCategory) || /^(IT|I|NYSC|N)\d+/i.test(String(body.employeeId || body.employeeCode || ''));
    const confirmed = body.confirmed === true || String(body.confirmationStatus || '').toLowerCase() === 'confirmed';
    const employeeKey = String(body.employeeId || body.employeeCode || '').trim();
    const employeeBalance = payload.balances.find((balance) => balance.employeeId === employeeKey && balance.leaveType === leaveType)
      || payload.balances.find((balance) => balance.employeeId === employeeKey)
      || payload.balances.find((balance) => balance.leaveType === leaveType);
    const availableBalance = Number.isFinite(Number(body.availableBalance))
      ? Number(body.availableBalance)
      : (employeeBalance?.currentBalance || 0);
    if (leaveType === 'Maternity Leave' && !isMaternityEligibleEmployee({ employeeId: employeeKey, employeeCode: employeeKey, employmentType: employeeCategory, employeeCategory, staffCategory: employeeCategory, payrollGroup: '', salaryGrade: '', jobGrade: '', status: body.employmentStatus || '', gender: body.gender || '' } as DleEmployeeDirectoryRow)) {
      return { ok: false, status: 409, message: 'Maternity Leave is available only to eligible permanent or lumpsum female employees.' };
    }
    if (leaveType === 'Annual Leave' && !fourteenDayPaidLeaveRequest && !confirmed) return { ok: false, status: 409, message: 'Annual Leave is available only after confirmation of appointment.' };
    if (leaveType === 'Annual Leave' && fourteenDayPaidLeaveRequest && requestedDays > dormantLongPolicy.annualContractDays) return { ok: false, status: 409, message: `Contract/Lumpsum/NYSC/IT paid Annual Leave cannot exceed ${dormantLongPolicy.annualContractDays} working days annually.` };
    if (leaveType === 'Annual Leave' && requestedDays >= dormantLongPolicy.allowanceMinimumAnnualDays && body.usesCarryForward) return { ok: false, status: 409, message: 'Leave Allowance applies only to current-year Annual Leave entitlement, not Carry Forward Leave.' };
    if (/casual leave|unpaid leave/i.test(leaveType)) return { ok: false, status: 409, message: `${leaveType} is no longer available.` };
    if (requestedDays > availableBalance) return { ok: false, status: 409, message: 'Leave application cannot proceed without sufficient balance.' };
    if (body.overlaps) return { ok: false, status: 409, message: 'Overlapping leave request detected.' };
    if (body.blockedPeriod) return { ok: false, status: 409, message: 'Leave application falls within a blocked period.' };
  }
  if (actionId === 'close-year' && payload.summary.pendingApplications + payload.summary.pendingApprovals > 0) return { ok: false, status: 409, message: 'Leave year cannot close with unresolved transactions.' };
  if (actionId === 'process-carry-forward' && !body.approved) return { ok: false, status: 409, message: 'Carry forward requires approval before processing.' };
  if (actionId === 'encash' && Number(body.days || 0) > 5) return { ok: false, status: 409, message: 'Encashment request exceeds configured policy limit.' };
  return { ok: true, status: 200, message: `${actionDef.label} completed and audit logged.` };
}
