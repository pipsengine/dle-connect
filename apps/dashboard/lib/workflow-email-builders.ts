import type { DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import { buildDleEmail, formatEmailDateTime, moneyNgn, resolveEmailLogoUrl } from '@/lib/email-templates';
import {
  createLeaveEmailActionToken,
  leaveAuthorizePageUrl,
  leavePortalUrl,
  type LeaveEmailApproverKind,
} from '@/lib/leave-email-action-token';
import {
  PAYROLL_STAGE_ACCENT_COLORS,
  type PayrollApprovalStageId,
} from '@/lib/payroll-approval-workflow';
import type { EssLeaveRequest } from '@/lib/leave-workflow-service';

export type LeaveEmailEvent = 'submitted' | 'manager-approved' | 'approved' | 'rejected' | 'approval-request';

type BrandedInput = Parameters<typeof buildDleEmail>[0];

const withBrand = (input: BrandedInput, baseUrl?: string | null) =>
  buildDleEmail({ logoUrl: resolveEmailLogoUrl(baseUrl), ...input });

const payrollRunDetails = (run: {
  periodLabel: string;
  grossPay: number;
  netPay: number;
  employeeCount: number;
}) => [
  { label: 'Payroll period', value: run.periodLabel },
  { label: 'Employees', value: String(run.employeeCount) },
  { label: 'Gross pay', value: moneyNgn(run.grossPay) },
  { label: 'Net pay', value: moneyNgn(run.netPay) },
];

const leaveDetails = (request: EssLeaveRequest) => [
  { label: 'Leave type', value: String(request.leaveType || '') },
  { label: 'Period', value: `${request.startDate} to ${request.endDate}` },
  { label: 'Days', value: String(request.days) },
  { label: 'Status', value: String(request.status || '') },
  ...(request.relieverName ? [{ label: 'Reliever', value: String(request.relieverName) }] : []),
];

export const buildLeaveWorkflowEmail = (input: {
  event: LeaveEmailEvent;
  request: EssLeaveRequest;
  recipientName: string;
  actorName?: string;
  extra?: string;
  portalLink: string;
  baseUrl?: string | null;
}) => {
  const subjectMap: Record<LeaveEmailEvent, string> = {
    submitted: `Leave submitted — ${input.request.leaveType}`,
    'manager-approved': `Leave awaiting HR approval — ${input.request.leaveType}`,
    approved: `Leave approved — ${input.request.leaveType}`,
    rejected: `Leave rejected — ${input.request.leaveType}`,
    'approval-request': `Leave approval required — ${input.request.leaveType}`,
  };
  const introMap: Record<LeaveEmailEvent, string> = {
    submitted: 'Your leave request has been submitted and routed for approval.',
    'manager-approved': 'Your line manager has approved this request. It is now awaiting HR final approval.',
    approved: 'Your leave request has received final approval.',
    rejected: 'Your leave request has been rejected.',
    'approval-request': 'A leave request requires your review and approval.',
  };
  const toneMap: Record<LeaveEmailEvent, 'info' | 'success' | 'warning' | 'danger'> = {
    submitted: 'info',
    'manager-approved': 'warning',
    approved: 'success',
    rejected: 'danger',
    'approval-request': 'warning',
  };

  return withBrand({
    recipientName: input.recipientName,
    subject: subjectMap[input.event],
    module: 'Leave Management',
    headline: subjectMap[input.event],
    intro: introMap[input.event],
    tone: toneMap[input.event],
    details: [
      ...leaveDetails(input.request),
      ...(input.actorName ? [{ label: 'Actioned by', value: String(input.actorName) }] : []),
    ],
    note: input.extra,
    actions: [{ href: input.portalLink, label: 'Open Leave Workspace', tone: 'primary' }],
    footerNote: 'Track approvals, reliever assignment, and leave balances in the workforce portal.',
  }, input.baseUrl);
};

export const buildLeaveRelieverEmail = (input: {
  request: EssLeaveRequest;
  requesterName: string;
  recipientName: string;
  actorName?: string;
  portalLink: string;
  baseUrl?: string | null;
}) => withBrand({
  recipientName: input.recipientName,
  subject: `Reliever assignment — ${input.requesterName}`,
  module: 'Leave Management',
  headline: 'You have been assigned as reliever',
  intro: `You have been assigned as reliever for ${input.requesterName}. Please coordinate handover before their leave begins.`,
  tone: 'info',
  details: [
    { label: 'Employee', value: input.requesterName },
    ...leaveDetails(input.request),
    ...(input.request.handover ? [{ label: 'Handover notes', value: String(input.request.handover) }] : []),
    ...(input.actorName ? [{ label: 'Approved by', value: String(input.actorName) }] : []),
  ],
  actions: [{ href: input.portalLink, label: 'Open Leave Workspace', tone: 'primary' }],
}, input.baseUrl);

export const buildLeaveApprovalRequestEmail = (input: {
  request: EssLeaveRequest;
  requesterName: string;
  recipientName: string;
  approverKind: LeaveEmailApproverKind;
  approveLink: string;
  rejectLink: string;
  portalLink: string;
  baseUrl?: string | null;
}) => {
  const stageLabel = input.approverKind === 'hr' ? 'HR Manager / Head' : 'Line Manager / Supervisor';
  const accent = input.approverKind === 'hr' ? '#7C3AED' : '#059669';
  return withBrand({
    recipientName: input.recipientName,
    subject: `Leave approval required — ${input.requesterName}`,
    module: 'Leave Management',
    headline: 'Leave approval required',
    intro: `A leave request is waiting for your approval as ${stageLabel}.`,
    tone: 'warning',
    accentColor: accent,
    details: [
      { label: 'Employee', value: input.requesterName },
      { label: 'Leave type', value: String(input.request.leaveType || '') },
      { label: 'Period', value: `${input.request.startDate} to ${input.request.endDate}` },
      { label: 'Days', value: String(input.request.days) },
      { label: 'Reliever', value: input.request.relieverName || 'Not configured' },
      { label: 'Approval stage', value: stageLabel },
    ],
    note: 'Authentication required: sign in with your approver account before completing this action.',
    actions: [
      { href: input.approveLink, label: 'Sign In & Approve', tone: 'success' },
      { href: input.rejectLink, label: 'Sign In & Reject', tone: 'danger' },
      { href: input.portalLink, label: 'Open Leave Workspace', tone: 'primary' },
    ],
    footerNote: 'Approval links expire after 7 days. Your login session must match the designated approver account.',
  }, input.baseUrl);
};

export const buildPayrollApprovalRequestEmail = (input: {
  recipientName: string;
  run: { periodLabel: string; grossPay: number; netPay: number; employeeCount: number };
  stageTitle: string;
  stageId: PayrollApprovalStageId;
  approveUrl: string;
  rejectUrl: string;
  workspaceUrl: string;
  baseUrl?: string | null;
}) => withBrand({
  recipientName: input.recipientName,
  subject: `Payroll approval required — ${input.run.periodLabel}`,
  module: 'Payroll Management',
  headline: `${input.stageTitle} approval required`,
  intro: `A payroll run requires your sign-off as ${input.stageTitle}. Please review the summary below and approve or reject in DLE Connect.`,
  tone: 'warning',
  accentColor: PAYROLL_STAGE_ACCENT_COLORS[input.stageId],
  details: [
    ...payrollRunDetails(input.run),
    { label: 'Approval stage', value: input.stageTitle },
  ],
  note: 'Authentication required: sign in with your approver account before completing this action.',
  actions: [
    { href: input.approveUrl, label: 'Sign In & Approve', tone: 'success' },
    { href: input.rejectUrl, label: 'Sign In & Reject', tone: 'danger' },
    { href: input.workspaceUrl, label: 'Open Approval Workspace', tone: 'primary' },
  ],
  footerNote: 'Approval links expire after 7 days. Your login session must match the designated approver account.',
}, input.baseUrl);

export const buildPayrollSubmittedEmail = (input: {
  recipientName: string;
  run: { periodLabel: string; grossPay: number; netPay: number; employeeCount: number };
  actorName?: string;
  workspaceUrl: string;
  baseUrl?: string | null;
}) => withBrand({
  recipientName: input.recipientName,
  subject: `Payroll submitted for approval — ${input.run.periodLabel}`,
  module: 'Payroll Management',
  headline: 'Payroll submitted for approval',
  intro: 'The payroll run has been submitted and routed to HR Manager for the first approval stage.',
  tone: 'info',
  accentColor: PAYROLL_STAGE_ACCENT_COLORS['payroll-officer'],
  details: [
    ...payrollRunDetails(input.run),
    ...(input.actorName ? [{ label: 'Submitted by', value: input.actorName }] : []),
    { label: 'Next stage', value: 'HR Manager approval' },
  ],
  actions: [{ href: input.workspaceUrl, label: 'Open Payroll Approval', tone: 'primary' }],
}, input.baseUrl);

export const buildPayrollStageApprovedEmail = (input: {
  recipientName: string;
  run: { periodLabel: string; grossPay: number; netPay: number; employeeCount: number };
  completedStage: string;
  nextStage: string;
  actorName: string;
  workspaceUrl: string;
  baseUrl?: string | null;
}) => withBrand({
  recipientName: input.recipientName,
  subject: `Payroll stage approved — ${input.run.periodLabel}`,
  module: 'Payroll Management',
  headline: `${input.completedStage} sign-off recorded`,
  intro: `${input.actorName} approved the ${input.completedStage} stage. The payroll is now awaiting ${input.nextStage}.`,
  tone: 'info',
  details: [
    ...payrollRunDetails(input.run),
    { label: 'Completed stage', value: input.completedStage },
    { label: 'Next stage', value: input.nextStage },
    { label: 'Approved by', value: input.actorName },
  ],
  actions: [{ href: input.workspaceUrl, label: 'View Approval Progress', tone: 'primary' }],
}, input.baseUrl);

export const buildPayrollFullyApprovedEmail = (input: {
  recipientName: string;
  run: { periodLabel: string; grossPay: number; netPay: number; employeeCount: number };
  actorName: string;
  workspaceUrl: string;
  bankFinanceUrl: string;
  bankScheduleDownloadUrl: string;
  baseUrl?: string | null;
}) => withBrand({
  recipientName: input.recipientName,
  subject: `Payroll fully approved — ${input.run.periodLabel}`,
  module: 'Payroll Management',
  headline: 'MD / CEO final approval complete',
  intro: 'All approval stages are complete. Finance and HR can now access the bank payment schedule for this payroll period.',
  tone: 'success',
  accentColor: PAYROLL_STAGE_ACCENT_COLORS['md-ceo'],
  details: [
    ...payrollRunDetails(input.run),
    { label: 'Final approver', value: input.actorName },
    { label: 'Status', value: 'Approved — bank schedule available' },
  ],
  actions: [
    { href: input.bankScheduleDownloadUrl, label: 'Download Bank Schedule', tone: 'success' },
    { href: input.bankFinanceUrl, label: 'Open Bank & Finance', tone: 'primary' },
    { href: input.workspaceUrl, label: 'Open Payroll Management', tone: 'primary' },
  ],
  footerNote: 'Release payroll when ready to finalize payslips, statutory outputs, and journal posting.',
}, input.baseUrl);

export const buildPayrollRejectedEmail = (input: {
  recipientName: string;
  run: { periodLabel: string; grossPay: number; netPay: number; employeeCount: number };
  actorName?: string;
  reason?: string;
  workspaceUrl: string;
  baseUrl?: string | null;
}) => withBrand({
  recipientName: input.recipientName,
  subject: `Payroll rejected — ${input.run.periodLabel}`,
  module: 'Payroll Management',
  headline: 'Payroll approval rejected',
  intro: 'A payroll approver has rejected this payroll run. Review the reason and correct the run before resubmitting.',
  tone: 'danger',
  details: [
    ...payrollRunDetails(input.run),
    ...(input.actorName ? [{ label: 'Rejected by', value: input.actorName }] : []),
    ...(input.reason ? [{ label: 'Reason', value: input.reason }] : []),
  ],
  actions: [{ href: input.workspaceUrl, label: 'Open Payroll Workspace', tone: 'primary' }],
}, input.baseUrl);

export const buildPayrollRevisionRequestedEmail = (input: {
  recipientName: string;
  run: { periodLabel: string; grossPay: number; netPay: number; employeeCount: number };
  actorName?: string;
  reason?: string;
  workspaceUrl: string;
  baseUrl?: string | null;
}) => withBrand({
  recipientName: input.recipientName,
  subject: `Payroll returned for revision — ${input.run.periodLabel}`,
  module: 'Payroll Management',
  headline: 'Payroll returned for revision',
  intro: 'An approver has returned this payroll run for revision. Update the payroll and resubmit when ready.',
  tone: 'warning',
  details: [
    ...payrollRunDetails(input.run),
    ...(input.actorName ? [{ label: 'Returned by', value: input.actorName }] : []),
    ...(input.reason ? [{ label: 'Comment', value: input.reason }] : []),
  ],
  actions: [{ href: input.workspaceUrl, label: 'Revise Payroll Run', tone: 'primary' }],
}, input.baseUrl);

export const buildPayrollReleasedEmail = (input: {
  recipientName: string;
  run: { periodLabel: string; grossPay: number; netPay: number; employeeCount: number };
  actorName: string;
  workspaceUrl: string;
  baseUrl?: string | null;
}) => withBrand({
  recipientName: input.recipientName,
  subject: `Payroll released — ${input.run.periodLabel}`,
  module: 'Payroll Management',
  headline: 'Payroll released',
  intro: 'The approved payroll has been released. You may now generate payslips, bank schedules, and statutory filings.',
  tone: 'success',
  details: [
    ...payrollRunDetails(input.run),
    { label: 'Released by', value: input.actorName },
    { label: 'Status', value: 'Released' },
  ],
  actions: [{ href: input.workspaceUrl, label: 'Open Payroll Outputs', tone: 'primary' }],
}, input.baseUrl);

export const buildOvertimeApprovalRequestEmail = (input: {
  recipientName: string;
  role: string;
  request: {
    projectCode: string;
    projectName: string;
    workDate: string;
    supervisorName: string;
    requestedHours: number;
    reason: string;
  };
  approveLink: string;
  rejectLink: string;
  workspaceLink: string;
  baseUrl?: string | null;
}) => withBrand({
  recipientName: input.recipientName,
  subject: `Overtime approval required — ${input.request.projectCode}`,
  module: 'Overtime Management',
  headline: 'Overtime authorization required',
  intro: `An overtime authorization request requires your approval as ${input.role}.`,
  tone: 'warning',
  accentColor: '#D97706',
  details: [
    { label: 'Project', value: `${input.request.projectCode} — ${input.request.projectName}` },
    { label: 'Work date', value: input.request.workDate },
    { label: 'Supervisor', value: input.request.supervisorName },
    { label: 'Requested hours', value: String(input.request.requestedHours) },
    { label: 'Reason', value: input.request.reason },
    { label: 'Approval stage', value: input.role },
  ],
  note: 'Authentication required: sign in with your approver account before completing this action.',
  actions: [
    { href: input.approveLink, label: 'Sign In & Approve', tone: 'success' },
    { href: input.rejectLink, label: 'Sign In & Reject', tone: 'danger' },
    { href: input.workspaceLink, label: 'Open Overtime Workspace', tone: 'primary' },
  ],
  footerNote: 'Approval links expire after 7 days. Your login session must match the designated approver account.',
}, input.baseUrl);

export const buildOvertimeApprovedEmail = (input: {
  recipientName: string;
  projectCode: string;
  workDate: string;
  requestedHours: number;
  timesheetLink: string;
  baseUrl?: string | null;
}) => withBrand({
  recipientName: input.recipientName,
  subject: `Overtime approved — ${input.projectCode}`,
  module: 'Overtime Management',
  headline: 'Overtime authorization approved',
  intro: 'Your overtime authorization has been fully approved. You can now book the approved hours on the timesheet.',
  tone: 'success',
  details: [
    { label: 'Project', value: input.projectCode },
    { label: 'Work date', value: input.workDate },
    { label: 'Approved hours', value: String(input.requestedHours) },
  ],
  actions: [{ href: input.timesheetLink, label: 'Open Timesheet Entry', tone: 'primary' }],
}, input.baseUrl);

export const buildOvertimeRejectedEmail = (input: {
  recipientName: string;
  projectCode: string;
  projectName: string;
  workDate: string;
  actorName?: string;
  reason?: string;
  workspaceLink: string;
  baseUrl?: string | null;
}) => withBrand({
  recipientName: input.recipientName,
  subject: `Overtime rejected — ${input.projectCode}`,
  module: 'Overtime Management',
  headline: 'Overtime authorization rejected',
  intro: 'An overtime authorization request has been rejected.',
  tone: 'danger',
  details: [
    { label: 'Project', value: `${input.projectCode} — ${input.projectName}` },
    { label: 'Work date', value: input.workDate },
    ...(input.actorName ? [{ label: 'Rejected by', value: input.actorName }] : []),
    ...(input.reason ? [{ label: 'Reason', value: input.reason }] : []),
  ],
  actions: [{ href: input.workspaceLink, label: 'Open Overtime Workspace', tone: 'primary' }],
}, input.baseUrl);

export const buildDleTestEmail = (input: {
  recipientName: string;
  employeeCode: string;
  appUrl: string;
  provider: string;
}) => withBrand({
  recipientName: input.recipientName,
  subject: `DLE Connect email test — ${input.employeeCode}`,
  module: 'HRIS',
  headline: 'Email delivery confirmed',
  intro: 'This is a test message confirming that DLE Connect outbound email is configured correctly.',
  tone: 'success',
  details: [
    { label: 'Employee code', value: input.employeeCode },
    { label: 'Mail provider', value: input.provider },
    { label: 'Sent at', value: formatEmailDateTime(new Date()) },
  ],
  actions: [{ href: input.appUrl, label: 'Open DLE Connect', tone: 'primary' }],
  footerNote: 'If you received this email, workflow notifications for payroll, leave, and overtime are ready.',
}, input.appUrl);

export const leaveApprovalLinks = (input: {
  request: EssLeaveRequest;
  recipientEmail: string;
  recipientUsername: string;
  approverKind: LeaveEmailApproverKind;
  baseUrl?: string | null;
}) => {
  const approveToken = createLeaveEmailActionToken({
    requestId: input.request.id,
    decision: 'approve',
    recipientEmail: input.recipientEmail,
    recipientUsername: input.recipientUsername,
    approverKind: input.approverKind,
  });
  const rejectToken = createLeaveEmailActionToken({
    requestId: input.request.id,
    decision: 'reject',
    recipientEmail: input.recipientEmail,
    recipientUsername: input.recipientUsername,
    approverKind: input.approverKind,
  });
  return {
    approveLink: leaveAuthorizePageUrl(approveToken, input.baseUrl),
    rejectLink: leaveAuthorizePageUrl(rejectToken, input.baseUrl),
    portalLink: leavePortalUrl(input.baseUrl),
  };
};

export const employeeDisplayName = (employee?: DleEmployeeDirectoryRow | null, fallback = 'Colleague') =>
  String(employee?.fullName || fallback).trim() || fallback;
