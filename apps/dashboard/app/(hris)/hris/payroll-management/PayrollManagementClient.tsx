'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  BadgeCheck,
  Banknote,
  BarChart3,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Coins,
  CreditCard,
  DatabaseZap,
  Download,
  FileBarChart,
  FileCheck2,
  FileSpreadsheet,
  Filter,
  GitBranch,
  Landmark,
  Lock,
  Network,
  PlayCircle,
  ReceiptText,
  RefreshCcw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  WalletCards,
  X,
} from 'lucide-react';

type Role = 'Super Admin' | 'System Administrator' | 'HR Director' | 'HR Manager' | 'HR Officer' | 'Payroll Officer' | 'Payroll Supervisor' | 'Finance Controller' | 'Finance Manager' | 'CFO' | 'Executive Director' | 'Executive Management' | 'Auditor' | 'Employee';
type PayrollRunStatus = 'Draft' | 'Open' | 'Validation' | 'Ready for Approval' | 'Submitted' | 'Under Review' | 'Approved' | 'Rejected' | 'Revision Requested' | 'Locked' | 'Posted' | 'Closed' | 'Reopened' | 'Cancelled' | 'Published';
type Tone = 'blue' | 'green' | 'amber' | 'red' | 'violet' | 'cyan' | 'slate';

type PayrollRecord = {
  employeeId: string;
  fullName: string;
  department: string;
  businessUnit: string;
  location: string;
  jobTitle: string;
  employmentType: string;
  employmentStatus: string;
  payrollGroup: string;
  salaryGrade: string;
  salaryStructure?: string;
  isDailyRate?: boolean;
  ratePerDay?: number | null;
  ratePerHour?: number | null;
  hoursPerDay?: number | null;
  payCurrency: string;
  paymentRun: string;
  paymentType: string;
  setupAssignedToPayroll: boolean;
  payrollStatus: 'Ready' | 'Review' | 'Blocked';
  riskSeverity: 'Low' | 'Medium' | 'High';
  exceptionCount: number;
  exceptions: string[];
  basePay: number | null;
  allowances: number | null;
  pension: number | null;
  paye: number | null;
  otherDeductions: number | null;
  grossPay: number | null;
  deductions: number | null;
  netPay: number | null;
};

type PayrollRun = {
  id: string;
  period: string;
  status: PayrollRunStatus;
  employeeCount: number;
  grossPay: number;
  deductions: number;
  netPay: number;
  createdAt: string;
  createdBy: string;
  approvedAt: string | null;
  approvedBy: string | null;
  lockedAt: string | null;
  postedAt: string | null;
};

type PayrollPayload = {
  generatedAt: string;
  source: string;
  dataSource?: { source: string; databaseAvailable: boolean; warning: string | null; employeeCount: number };
  role: Role;
  permissions: { canViewMoney: boolean; canManageRun: boolean; canApprove: boolean; canPost: boolean; canConfigure?: boolean; canReopen?: boolean; canExport: boolean };
  period: string;
  periodLabel: string;
  summary: {
    totalEmployees: number;
    payrollEligible: number;
    readyEmployees: number;
    reviewEmployees: number;
    blockedEmployees: number;
    payrollCoveragePct: number;
    grossPay: number;
    deductions: number;
    netPay: number;
    basePay: number;
    allowances: number;
    exceptionCount: number;
  };
  runs: PayrollRun[];
  records: PayrollRecord[];
  exceptions: { id: string; employeeId: string; employeeName: string; issue: string; severity: 'Low' | 'Medium' | 'High'; owner: string }[];
  breakdowns: {
    byPayrollGroup: { label: string; employees: number; grossPay: number; netPay: number; exceptions: number }[];
    byDepartment: { label: string; employees: number; grossPay: number; netPay: number; exceptions: number }[];
    byEmploymentType: { label: string; employees: number; grossPay: number; netPay: number; exceptions: number }[];
  };
  controls: { id: string; label: string; status: string; tone: Tone }[];
  workflow?: { currentStatus: string; nextOwner: string; blockedActions: string[]; approvalStage: string };
  auditTrail?: PayrollAuditEntry[];
};

type PayrollAuditEntry = {
  id: string;
  at: string;
  user: string;
  role: Role;
  action: string;
  record: string;
  oldValue?: string | null;
  newValue?: string | null;
  reason?: string | null;
  comment?: string | null;
  ip?: string | null;
};

type ApiResponse<T> = { status: 'success' | 'error'; data?: T; error?: string };
type SectionId = 'dashboard' | 'salary-management' | 'earnings-management' | 'deductions-management' | 'payroll-processing' | 'compliance-statutory-management' | 'finance-integration' | 'reports-analytics';

type TabConfig = {
  id: string;
  label: string;
  description: string;
  items: string[];
  outputs?: string[];
  legacyHref?: string;
};

type SectionConfig = {
  id: SectionId;
  label: string;
  title: string;
  description: string;
  icon: any;
  tone: Tone;
  tabs: TabConfig[];
};

type PayrollAction = {
  id: string;
  label: string;
  group: 'primary' | 'secondary' | 'workflow' | 'audit';
  sensitive?: boolean;
  reasonRequired?: boolean;
  roles?: Role[];
};

const readApiResponse = async <T,>(res: Response): Promise<ApiResponse<T>> => {
  const text = await res.text();
  if (!text.trim()) return { status: 'error', error: `Empty response from payroll service (${res.status})` };
  try {
    return JSON.parse(text) as ApiResponse<T>;
  } catch {
    return { status: 'error', error: text.slice(0, 240) || `Invalid response from payroll service (${res.status})` };
  }
};

const moneyFmt = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 });
const numberFmt = new Intl.NumberFormat('en-GB');
const pctFmt = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });
const money = (value: number | null | undefined, canView = true) => (!canView || value == null ? 'Restricted' : moneyFmt.format(value));
const number = (value: number | null | undefined) => numberFmt.format(Number(value || 0));
const payrollRate = (record: PayrollRecord, canView = true) => {
  if (!record.isDailyRate) return record.salaryStructure || record.salaryGrade || 'Unassigned';
  if (!canView) return 'Restricted';
  if (record.ratePerDay) return `${money(record.ratePerDay)}/day`;
  if (record.ratePerHour) return `${money(record.ratePerHour)}/hr`;
  return 'Rate missing';
};

const toneStyles: Record<Tone, { card: string; icon: string; chip: string; button: string; bar: string; text: string }> = {
  blue: { card: 'bg-blue-50 border-blue-200', icon: 'bg-blue-600 text-white', chip: 'bg-blue-100 text-blue-800', button: 'bg-blue-600 hover:bg-blue-700 text-white', bar: 'bg-blue-600', text: 'text-blue-700' },
  green: { card: 'bg-emerald-50 border-emerald-200', icon: 'bg-emerald-600 text-white', chip: 'bg-emerald-100 text-emerald-800', button: 'bg-emerald-600 hover:bg-emerald-700 text-white', bar: 'bg-emerald-600', text: 'text-emerald-700' },
  amber: { card: 'bg-amber-50 border-amber-200', icon: 'bg-amber-500 text-white', chip: 'bg-amber-100 text-amber-800', button: 'bg-amber-500 hover:bg-amber-600 text-white', bar: 'bg-amber-500', text: 'text-amber-700' },
  red: { card: 'bg-red-50 border-red-200', icon: 'bg-red-600 text-white', chip: 'bg-red-100 text-red-800', button: 'bg-red-600 hover:bg-red-700 text-white', bar: 'bg-red-600', text: 'text-red-700' },
  violet: { card: 'bg-violet-50 border-violet-200', icon: 'bg-violet-600 text-white', chip: 'bg-violet-100 text-violet-800', button: 'bg-violet-600 hover:bg-violet-700 text-white', bar: 'bg-violet-600', text: 'text-violet-700' },
  cyan: { card: 'bg-cyan-50 border-cyan-200', icon: 'bg-cyan-600 text-white', chip: 'bg-cyan-100 text-cyan-800', button: 'bg-cyan-600 hover:bg-cyan-700 text-white', bar: 'bg-cyan-600', text: 'text-cyan-700' },
  slate: { card: 'bg-slate-50 border-slate-200', icon: 'bg-slate-800 text-white', chip: 'bg-slate-100 text-slate-800', button: 'bg-slate-900 hover:bg-slate-800 text-white', bar: 'bg-slate-700', text: 'text-slate-700' },
};

const statusTone = (status: string): Tone => {
  if (['Ready', 'Approved', 'Posted', 'Passed', 'Calculated', 'Enabled'].includes(status)) return 'green';
  if (['Blocked', 'Validation', 'Attention Required'].includes(status)) return 'red';
  if (['Review', 'Draft'].includes(status)) return 'amber';
  if (status === 'Locked') return 'violet';
  return 'blue';
};

const sections: SectionConfig[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    title: 'Payroll Dashboard',
    description: 'Centralized payroll command center for KPIs, cycle status, approvals, exceptions, compliance alerts, bank status, and trends.',
    icon: WalletCards,
    tone: 'blue',
    tabs: [
      { id: 'executive-summary', label: 'Executive Summary', description: 'Payroll KPIs, cycle status, employee counts, payroll values, and quick actions.', items: ['Payroll KPIs', 'Payroll cycle status', 'Employee payroll counts', 'Gross payroll', 'Net payroll', 'Pending approvals', 'Payroll exceptions', 'Bank payment status', 'Compliance alerts', 'Payroll trends'], outputs: ['Executive summary cards', 'Charts and analytics', 'Notifications', 'Quick action shortcuts'] },
    ],
  },
  {
    id: 'salary-management',
    label: 'Salary Management',
    title: 'Salary Management',
    description: 'Salary structures, grades, employee compensation setup, compensation planning, and governance.',
    icon: Coins,
    tone: 'green',
    tabs: [
      { id: 'salary-structure', label: 'Salary Structure', description: 'Grade bands, compa-ratio, distribution, health monitoring, exceptions, and compensation governance.', legacyHref: '/hris/payroll/salary-structure', items: ['Salary grades and bands', 'Minimum, midpoint, and maximum salary ranges', 'Compa-ratio analysis', 'Payroll distribution analysis', 'Grade health monitoring', 'Salary exception management', 'Compensation governance'] },
      { id: 'salary-grades', label: 'Salary Grades', description: 'Grade hierarchy and eligibility controls with effective-dated maintenance.', items: ['Grade creation and maintenance', 'Grade hierarchy', 'Grade-to-position mapping', 'Grade eligibility rules', 'Effective date management'] },
      { id: 'employee-salary-setup', label: 'Employee Salary Setup', description: 'Employee compensation profiles, payroll eligibility, and cost center assignment.', legacyHref: '/hris/payroll/employee-salary-setup', items: ['Basic salary assignment', 'Salary structure assignment', 'Employee compensation profile', 'Payroll eligibility configuration', 'Cost center assignment'] },
      { id: 'sage-migration-review', label: 'Sage Migration Review', description: 'Detailed Sage 300 gross salary reconciliation for permanent and lump-sum payroll migration.', legacyHref: '/hris/payroll/sage-migration-review', items: ['Permanent employee gross salary migration', 'Lump-sum gross salary migration', 'Sage versus HRIS variance review', 'Earning profile mapping', 'Migration exceptions and missing gross controls'] },
      { id: 'compensation-planning', label: 'Compensation Planning', description: 'Salary review exercises, simulations, budget impact, and market comparison.', items: ['Salary review exercises', 'Annual increment planning', 'Compensation simulations', 'Budget impact analysis', 'Market comparison analysis'] },
    ],
  },
  {
    id: 'earnings-management',
    label: 'Earnings',
    title: 'Earnings Management',
    description: 'Allowances, bonuses, overtime, and daily rate pay in a single earnings workspace.',
    icon: TrendingUp,
    tone: 'cyan',
    tabs: [
      { id: 'allowances', label: 'Allowances', description: 'Allowance catalogue and rule-driven eligibility.', legacyHref: '/hris/payroll/allowances', items: ['Housing allowance', 'Transport allowance', 'Utility allowance', 'Medical allowance', 'Special allowances', 'Allowance configuration rules'] },
      { id: 'bonuses', label: 'Bonuses', description: 'Bonus schemes, workflow controls, and approval-ready submissions.', items: ['Performance bonus', 'Annual bonus', 'Project bonus', 'Special bonus', 'Bonus approval workflows'] },
      { id: 'overtime-pay', label: 'Overtime Pay', description: 'Overtime rules, calculations, approvals, and analytics.', legacyHref: '/hris/payroll/overtime-pay', items: ['Overtime rules', 'Overtime calculations', 'Overtime approvals', 'Overtime analytics'] },
      { id: 'daily-rate-pay', label: 'Daily Rate Pay', description: 'Daily rate employee management, attendance integration, calculations, and approvals.', legacyHref: '/hris/payroll/daily-rate-pay', items: ['Daily rate employee management', 'Daily attendance integration', 'Daily payroll calculations', 'Daily payroll approvals'] },
    ],
  },
  {
    id: 'deductions-management',
    label: 'Deductions',
    title: 'Deductions Management',
    description: 'Statutory deductions, loans, other deductions, and the rules engine.',
    icon: FileSpreadsheet,
    tone: 'violet',
    tabs: [
      { id: 'statutory-deductions', label: 'Statutory Deductions', description: 'PAYE, pension, NHF, NSITF, and ITF deductions.', legacyHref: '/hris/payroll/deductions', items: ['PAYE tax', 'Pension deductions', 'NHF deductions', 'NSITF deductions', 'ITF deductions'] },
      { id: 'loans-salary-advances', label: 'Loans & Salary Advances', description: 'Loan setup, approval controls, schedules, salary advance processing, and balances.', legacyHref: '/hris/payroll/loans-and-salary-advances', items: ['Loan setup', 'Loan approvals', 'Repayment schedules', 'Salary advance processing', 'Outstanding balances'] },
      { id: 'other-deductions', label: 'Other Deductions', description: 'Cooperative, union, insurance, and configurable custom deductions.', items: ['Cooperative deductions', 'Union deductions', 'Insurance deductions', 'Custom deductions'] },
      { id: 'deduction-rules-engine', label: 'Deduction Rules Engine', description: 'Formula, threshold, exemption, and effective-date governance.', items: ['Deduction formulas', 'Thresholds', 'Exemptions', 'Effective dates'] },
    ],
  },
  {
    id: 'payroll-processing',
    label: 'Processing',
    title: 'Payroll Processing',
    description: 'Payroll period management, runs, validation, approval, payslip generation, reversal, closing, and reopening controls.',
    icon: PlayCircle,
    tone: 'amber',
    tabs: [
      { id: 'payroll-period-management', label: 'Payroll Period Management', description: 'Calendar setup, period creation, statuses, closing, reopening, locking rules, and period reports.', items: ['Payroll calendar setup', 'Payroll period creation', 'Payroll period status management', 'Payroll period closing', 'Payroll period reopening', 'Payroll locking rules', 'Payroll period reports'] },
      { id: 'payroll-workflow', label: 'Payroll Workflow', description: 'End-to-end payroll computation, approval status, locking controls, audit trail, and release process.', legacyHref: '/hris/payroll/payroll-workflow', items: ['Data collection', 'Pre-validation', 'Payroll computation', 'Multi-level approval workflow', 'Audit trail capture', 'Payroll release controls'] },
      { id: 'payroll-run', label: 'Payroll Run', description: 'Monthly, weekly, daily, and batch payroll execution.', legacyHref: '/hris/payroll/payroll-processing', items: ['Monthly payroll processing', 'Weekly payroll processing', 'Daily payroll processing', 'Payroll batch execution'] },
      { id: 'payroll-validation', label: 'Payroll Validation', description: 'Exception checks, missing setup checks, duplicate detection, and audit validation.', items: ['Missing salary checks', 'Missing bank details checks', 'Duplicate payroll detection', 'Exception reporting', 'Payroll audit validation'] },
      { id: 'payroll-approval', label: 'Payroll Approval', description: 'Multi-level HR, finance, and executive approval with audit trail.', legacyHref: '/hris/payroll/payroll-approval', items: ['Multi-level approvals', 'HR approval', 'Finance approval', 'Executive approval', 'Approval audit trail'] },
      { id: 'payslip-generation', label: 'Payslip Generation', description: 'Bulk generation, ESS publishing, and secure PDF readiness.', legacyHref: '/hris/payroll/payslip-generation', items: ['Payslip generation', 'Bulk payslip generation', 'Employee self-service publishing', 'Secure PDF generation'] },
      { id: 'payroll-reversal', label: 'Payroll Reversal', description: 'Rollback, correction processing, adjustment entries, and audit tracking.', items: ['Payroll rollback', 'Correction processing', 'Adjustment entries', 'Audit tracking'] },
      { id: 'payroll-closing', label: 'Payroll Closing', description: 'Completion validation, statutory schedule confirmation, record locking, and closing audit trail.', items: ['Validate payroll completion before closing', 'Confirm all employees are processed', 'Confirm payslips are generated', 'Confirm approvals are completed', 'Confirm bank payment schedule is generated', 'Confirm payroll journal is posted', 'Confirm PAYE, pension, NHF, NSITF, and ITF schedules are generated', 'Lock payroll records after closing', 'Maintain closing audit trail'] },
      { id: 'payroll-reopening', label: 'Payroll Reopening', description: 'Controlled reopening of closed periods with reasons, approvals, and before-and-after audit history.', items: ['Allow controlled reopening of closed periods', 'Require reason for reopening', 'Require approval workflow', 'Track reopened-by, approved-by, reopened-date, and reason', 'Maintain before-and-after audit history'] },
    ],
  },
  {
    id: 'compliance-statutory-management',
    label: 'Compliance',
    title: 'Compliance & Statutory Management',
    description: 'PAYE, pension, regulatory funds, returns, reports, certificates, and submission tracking.',
    icon: ShieldCheck,
    tone: 'red',
    tabs: [
      { id: 'paye-management', label: 'PAYE Management', description: 'PAYE calculations, schedules, remittance reports, and monitoring.', legacyHref: '/hris/payroll/tax-paye', items: ['PAYE calculations', 'PAYE schedules', 'Tax remittance reports', 'Tax compliance monitoring'] },
      { id: 'pension-management', label: 'Pension Management', description: 'Employee and employer pension contributions, remittance schedules, and reports.', legacyHref: '/hris/payroll/pension', items: ['Employee contributions', 'Employer contributions', 'Pension remittance schedules', 'Pension reports'] },
      { id: 'nhf-nsitf-itf', label: 'NHF / NSITF / ITF Management', description: 'Regulatory calculations, monitoring, remittance, and reporting.', legacyHref: '/hris/payroll/nhf-nsitf-itf', items: ['Regulatory calculations', 'Compliance monitoring', 'Remittance schedules', 'Regulatory reporting'] },
      { id: 'returns-regulatory-reports', label: 'Returns & Regulatory Reports', description: 'Monthly and annual returns, certificates, and submission tracking.', items: ['Monthly returns', 'Annual returns', 'Compliance certificates', 'Submission tracking'] },
    ],
  },
  {
    id: 'finance-integration',
    label: 'Finance Integration',
    title: 'Bank Payments & Finance Integration',
    description: 'Bank schedules, payment files, journals, GL mapping, allocations, and reconciliation.',
    icon: Landmark,
    tone: 'slate',
    tabs: [
      { id: 'bank-payment-schedule', label: 'Bank Payment Schedule', description: 'Salary scheduling, payment batches, and payment status tracking.', items: ['Salary payment scheduling', 'Payment batch management', 'Payment status tracking'] },
      { id: 'salary-payment-files', label: 'Salary Payment Files', description: 'Bank file generation and electronic payment export templates.', items: ['Bank file generation', 'Electronic payment formats', 'Bank export templates'] },
      { id: 'payroll-journal', label: 'Payroll Journal', description: 'Accounting entries, journal generation, and journal approval workflows.', items: ['Payroll accounting entries', 'Journal generation', 'Journal approval workflows'] },
      { id: 'general-ledger-mapping', label: 'General Ledger Mapping', description: 'GL mapping and cost, project, department allocations.', items: ['GL account mapping', 'Cost center allocation', 'Project allocation', 'Department allocation'] },
      { id: 'reconciliation', label: 'Reconciliation', description: 'Payroll, bank, and accounting reconciliation controls.', items: ['Payroll reconciliation', 'Bank reconciliation', 'Accounting reconciliation'] },
    ],
  },
  {
    id: 'reports-analytics',
    label: 'Reports & Analytics',
    title: 'Payroll Reports & Analytics',
    description: 'Comprehensive reporting, drill-downs, exports, scheduled reports, widgets, and analytics.',
    icon: FileBarChart,
    tone: 'blue',
    tabs: [
      { id: 'payroll-summary-reports', label: 'Payroll Summary Reports', description: 'Period and company-level payroll summaries.', items: ['Payroll Summary Reports'] },
      { id: 'payroll-register', label: 'Payroll Register', description: 'Employee-level payroll register with filtering and export.', items: ['Payroll Register'] },
      { id: 'salary-analysis-reports', label: 'Salary Analysis Reports', description: 'Salary distribution and grade analysis reports.', items: ['Salary Analysis Reports'] },
      { id: 'tax-reports', label: 'Tax Reports', description: 'Tax schedules, remittance, and PAYE reports.', items: ['Tax Reports'] },
      { id: 'pension-reports', label: 'Pension Reports', description: 'Pension schedules and remittance reports.', items: ['Pension Reports'] },
      { id: 'deduction-reports', label: 'Deduction Reports', description: 'Statutory, loan, and other deduction reports.', items: ['Deduction Reports'] },
      { id: 'variance-reports', label: 'Variance Reports', description: 'Period-to-period payroll variance reporting.', items: ['Variance Reports'] },
      { id: 'bank-payment-reports', label: 'Bank Payment Reports', description: 'Payment status and bank file audit reports.', items: ['Bank Payment Reports'] },
      { id: 'compliance-reports', label: 'Compliance Reports', description: 'Compliance monitoring and statutory submissions.', items: ['Compliance Reports'] },
      { id: 'audit-reports', label: 'Audit Reports', description: 'Audit trails and payroll change logs.', items: ['Audit Reports'] },
      { id: 'executive-payroll-analytics', label: 'Executive Payroll Analytics', description: 'Graphical analytics and executive drill-downs.', items: ['Executive Payroll Analytics'] },
    ],
  },
];

const enterpriseRequirements = [
  'Role-Based Access Control (RBAC)',
  'Multi-Level Approval Workflows',
  'Audit Trails',
  'Payroll Version Control',
  'Payroll Locking After Approval',
  'Exception Management',
  'Configurable Payroll Calendars',
  'Multi-Company Support',
  'Multi-Location Support',
  'Multi-Currency Support',
  'Cost Center Management',
  'Project-Based Payroll Allocation',
  'Employee Category Support (Permanent, Lumpsum, Daily Rate)',
  'Automatic Employee Code Integration',
  'Sage ERP Integration Readiness',
  'API Integration Readiness',
  'Employee Self-Service (ESS) Integration',
  'Document Management Integration',
  'Notification and Alert Framework',
  'Enterprise Reporting and Analytics',
];

const payrollPeriodTabs: TabConfig[] = [
  {
    id: 'payroll-calendar-setup',
    label: 'Payroll Calendar Setup',
    description: 'Define payroll years, period calendars, frequencies, dates, statutory due dates, and assignment scope.',
    items: ['Create payroll year', 'Define payroll months/periods', 'Configure weekly, monthly, daily-rate, and special payroll periods', 'Set payroll start date and end date', 'Define payment date', 'Define statutory remittance due dates', 'Assign payroll frequency', 'Assign company, branch, department, location, or employee category'],
  },
  {
    id: 'payroll-period-creation',
    label: 'Payroll Period Creation',
    description: 'Create, auto-generate, validate, and scope payroll periods without duplicates or overlaps.',
    items: ['Create new payroll period', 'Auto-generate monthly payroll periods', 'Auto-generate weekly or daily-rate periods', 'Define payroll period code, period name, start date, end date, payment date, and payroll type', 'Assign payroll group', 'Assign eligible employee categories such as Permanent, Lumpsum, and Daily Rate', 'Prevent duplicate period creation', 'Validate overlapping payroll periods'],
  },
  {
    id: 'payroll-period-status-management',
    label: 'Payroll Period Status Management',
    description: 'Control payroll period state transitions from draft through close, reopening, or cancellation.',
    items: ['Draft', 'Open', 'In Progress', 'Under Validation', 'Awaiting Approval', 'Approved', 'Paid', 'Closed', 'Reopened', 'Cancelled'],
  },
  {
    id: 'payroll-period-closing',
    label: 'Payroll Period Closing',
    description: 'Close payroll only after completion, approval, banking, journal, and statutory checks pass.',
    items: ['Validate payroll completion before closing', 'Confirm all employees are processed', 'Confirm payslips are generated', 'Confirm approvals are completed', 'Confirm bank payment schedule is generated', 'Confirm payroll journal is posted', 'Confirm PAYE, pension, NHF, NSITF, and ITF schedules are generated', 'Lock payroll records after closing', 'Prevent edits after close unless reopened by authorized users', 'Maintain closing audit trail'],
  },
  {
    id: 'payroll-period-reopening',
    label: 'Payroll Period Reopening',
    description: 'Controlled reopening of closed periods through reason capture, workflow approvals, and audit history.',
    items: ['Allow controlled reopening of closed periods', 'Require reason for reopening', 'Require approval workflow', 'Track reopened-by, approved-by, reopened-date, and reason', 'Maintain before-and-after audit history'],
  },
  {
    id: 'payroll-locking-rules',
    label: 'Payroll Locking Rules',
    description: 'Lock sensitive payroll data at the correct processing milestones.',
    items: ['Lock salary changes after payroll processing starts', 'Lock employee payroll setup after validation', 'Lock payslips after approval', 'Lock payroll journal after posting', 'Lock period after closing'],
  },
  {
    id: 'payroll-period-reports',
    label: 'Payroll Period Reports',
    description: 'Period reporting for open, closed, pending, audit, checklist, exception, and calendar views.',
    items: ['Open payroll periods', 'Closed payroll periods', 'Pending payroll periods', 'Payroll period audit report', 'Payroll closing checklist', 'Payroll exception report', 'Payroll calendar report'],
  },
];

const payrollPeriodStatuses = ['Draft', 'Open', 'In Progress', 'Under Validation', 'Awaiting Approval', 'Approved', 'Paid', 'Closed', 'Reopened', 'Cancelled'];
const payrollPeriodReadiness = ['RBAC controlled', 'Approval workflow enabled', 'Audit trail active', 'Notifications ready', 'Payroll locking enforced', 'Statutory compliance mapped', 'Multi-company ready', 'Multi-location ready', 'Category filtering ready', 'Sage ERP ready'];

const roleOptions: Role[] = ['Payroll Officer', 'Payroll Supervisor', 'HR Manager', 'Finance Manager', 'CFO', 'Executive Director', 'System Administrator', 'Auditor'];
const payrollMakerRoles: Role[] = ['Payroll Officer', 'Payroll Supervisor', 'Super Admin'];
const payrollApprovalRoles: Role[] = ['HR Manager', 'Finance Manager', 'Finance Controller', 'CFO', 'Executive Director', 'Executive Management', 'Super Admin'];
const financeRoles: Role[] = ['Finance Manager', 'Finance Controller', 'CFO', 'Super Admin'];
const configRoles: Role[] = ['System Administrator', 'Super Admin'];
const viewRoles: Role[] = [...roleOptions, 'Super Admin', 'HR Director', 'HR Officer', 'Finance Controller', 'Executive Management', 'Employee'];

const action = (id: string, label: string, group: PayrollAction['group'] = 'secondary', roles: Role[] = viewRoles, sensitive = false, reasonRequired = false): PayrollAction => ({ id, label, group, roles, sensitive, reasonRequired });

const dashboardActions = [
  action('create-period', 'Create Payroll Period', 'primary', payrollMakerRoles),
  action('open-period', 'Open Current Period', 'primary', payrollMakerRoles),
  action('validate-payroll', 'Run Payroll Validation', 'workflow', payrollMakerRoles),
  action('view-exceptions', 'View Payroll Exceptions', 'secondary'),
  action('create-run', 'Process Payroll', 'primary', payrollMakerRoles, true),
  action('submit-run', 'Submit Payroll for Approval', 'workflow', payrollMakerRoles, true),
  action('approve-run', 'Approve Payroll', 'workflow', payrollApprovalRoles, true),
  action('generate-payslips', 'Generate Payslips', 'secondary', payrollMakerRoles, true),
  action('generate-bank-schedule', 'Generate Bank Schedule', 'secondary', financeRoles, true),
  action('post-run', 'Generate Payroll Journal', 'workflow', financeRoles, true),
  action('generate-statutory-schedules', 'Generate Statutory Schedules', 'secondary', payrollMakerRoles),
  action('close-period', 'Close Payroll Period', 'workflow', [...payrollApprovalRoles, ...payrollMakerRoles], true),
  action('view-audit', 'View Audit Trail', 'audit'),
];

const actionsBySection: Partial<Record<SectionId, PayrollAction[]>> = {
  'salary-management': [
    action('create-salary-structure', 'Create Salary Structure', 'primary', payrollMakerRoles),
    action('add-salary-grade', 'Add Salary Grade', 'primary', payrollMakerRoles),
    action('edit-salary-band', 'Edit Salary Band', 'secondary', payrollMakerRoles),
    action('clone-salary-structure', 'Clone Salary Structure', 'secondary', payrollMakerRoles),
    action('activate-salary-structure', 'Activate Salary Structure', 'workflow', payrollApprovalRoles, true),
    action('archive-salary-structure', 'Archive Salary Structure', 'secondary', payrollMakerRoles, true),
    action('map-grade-position', 'Map Grade to Position', 'secondary', payrollMakerRoles),
    action('assign-salary-grade', 'Assign Employee to Salary Grade', 'secondary', payrollMakerRoles),
    action('import-salary-setup', 'Import Employee Salary Setup', 'secondary', payrollMakerRoles),
    action('validate-salary-setup', 'Validate Salary Setup', 'workflow', payrollMakerRoles),
    action('run-compa-ratio', 'Run Compa-Ratio Analysis', 'secondary'),
    action('submit-salary-approval', 'Submit for Approval', 'workflow', payrollMakerRoles, true),
    action('approve-salary-structure', 'Approve Salary Structure', 'workflow', payrollApprovalRoles, true),
    action('publish-salary-structure', 'Publish Salary Structure', 'workflow', payrollApprovalRoles, true),
    action('view-audit', 'View Salary History', 'audit'),
  ],
  'earnings-management': [
    action('create-allowance', 'Create Allowance', 'primary', payrollMakerRoles),
    action('bulk-assign-allowance', 'Bulk Assign Allowance', 'secondary', payrollMakerRoles),
    action('import-allowances', 'Import Allowances', 'secondary', payrollMakerRoles),
    action('validate-allowances', 'Validate Allowances', 'workflow', payrollMakerRoles),
    action('approve-allowances', 'Approve Allowances', 'workflow', payrollApprovalRoles, true),
    action('create-bonus-batch', 'Create Bonus Batch', 'primary', payrollMakerRoles),
    action('validate-bonus-batch', 'Validate Bonus Batch', 'workflow', payrollMakerRoles),
    action('approve-bonus', 'Approve Bonus', 'workflow', payrollApprovalRoles, true),
    action('post-bonus-payroll', 'Post Bonus to Payroll', 'workflow', payrollMakerRoles, true),
    action('import-overtime', 'Import Overtime', 'secondary', payrollMakerRoles),
    action('recalculate-overtime', 'Recalculate Overtime', 'secondary', payrollMakerRoles),
    action('approve-overtime', 'Approve Overtime', 'workflow', payrollApprovalRoles, true),
    action('calculate-daily-pay', 'Calculate Daily Pay', 'primary', payrollMakerRoles),
    action('approve-daily-pay', 'Approve Daily Pay', 'workflow', payrollApprovalRoles, true),
    action('view-audit', 'View Earnings History', 'audit'),
  ],
  'deductions-management': [
    action('create-deduction', 'Create Deduction', 'primary', payrollMakerRoles),
    action('edit-deduction-rule', 'Edit Deduction Rule', 'secondary', payrollMakerRoles),
    action('bulk-assign-deduction', 'Bulk Assign Deduction', 'secondary', payrollMakerRoles),
    action('validate-deductions', 'Validate Deductions', 'workflow', payrollMakerRoles),
    action('approve-deductions', 'Approve Deductions', 'workflow', payrollApprovalRoles, true),
    action('suspend-deduction', 'Suspend Deduction', 'secondary', payrollMakerRoles, true),
    action('create-loan', 'Create Loan', 'primary', payrollMakerRoles),
    action('generate-repayment-schedule', 'Generate Repayment Schedule', 'secondary', payrollMakerRoles),
    action('approve-loan', 'Approve Loan', 'workflow', payrollApprovalRoles, true),
    action('post-loan-deduction', 'Post Loan Deduction to Payroll', 'workflow', payrollMakerRoles, true),
    action('view-audit', 'View Deduction History', 'audit'),
  ],
  'payroll-processing': [
    action('create-period', 'Create Payroll Period', 'primary', payrollMakerRoles),
    action('open-period', 'Open Payroll Period', 'primary', payrollMakerRoles),
    action('freeze-period', 'Freeze Payroll Period', 'secondary', payrollMakerRoles, true),
    action('create-run', 'Run Payroll', 'primary', payrollMakerRoles, true),
    action('validate-payroll', 'Run Validation', 'workflow', payrollMakerRoles),
    action('submit-run', 'Submit for Approval', 'workflow', payrollMakerRoles, true),
    action('approve-run', 'Approve Payroll', 'workflow', payrollApprovalRoles, true),
    action('reject-run', 'Reject Payroll', 'workflow', payrollApprovalRoles, true, true),
    action('request-revision', 'Request Revision', 'workflow', payrollApprovalRoles, true, true),
    action('generate-payslips', 'Publish Payslips to ESS', 'workflow', payrollMakerRoles, true),
    action('post-run', 'Post Journal', 'workflow', financeRoles, true),
    action('close-period', 'Close Period', 'workflow', [...payrollApprovalRoles, ...payrollMakerRoles], true),
    action('reopen-period', 'Reopen Period', 'workflow', ['CFO', 'Executive Director', 'Super Admin'], true, true),
    action('view-audit', 'View Period Audit Trail', 'audit'),
  ],
  'compliance-statutory-management': [
    action('create-tax-version', 'Create Tax Version', 'primary', configRoles),
    action('validate-tax-config', 'Validate Tax Configuration', 'workflow', [...configRoles, ...payrollMakerRoles]),
    action('run-paye-calculation', 'Run PAYE Calculation', 'primary', payrollMakerRoles),
    action('generate-paye-schedule', 'Generate PAYE Schedule', 'secondary', payrollMakerRoles),
    action('mark-paye-remitted', 'Mark PAYE as Remitted', 'workflow', financeRoles, true),
    action('configure-statutory-rule', 'Configure Statutory Rule', 'primary', configRoles),
    action('run-statutory-calculation', 'Run Statutory Calculation', 'primary', payrollMakerRoles),
    action('export-remittance-file', 'Export Remittance File', 'secondary', financeRoles, true),
    action('upload-remittance-evidence', 'Upload Evidence of Remittance', 'secondary', financeRoles),
    action('approve-configuration', 'Approve Configuration', 'workflow', payrollApprovalRoles, true),
    action('view-audit', 'View Tax Audit Trail', 'audit'),
  ],
  'finance-integration': [
    action('generate-bank-schedule', 'Generate Bank Payment Schedule', 'primary', financeRoles, true),
    action('validate-bank-accounts', 'Validate Bank Accounts', 'workflow', financeRoles),
    action('export-bank-file', 'Export Bank Payment File', 'workflow', financeRoles, true),
    action('mark-payment-sent', 'Mark Payment Sent', 'workflow', financeRoles, true),
    action('mark-payment-confirmed', 'Mark Payment Confirmed', 'workflow', financeRoles, true),
    action('reconcile-bank-payment', 'Reconcile Bank Payment', 'secondary', financeRoles),
    action('post-run', 'Post Journal to Finance', 'workflow', financeRoles, true),
    action('export-journal-sage', 'Export Journal to Sage', 'secondary', financeRoles, true),
    action('reverse-journal-posting', 'Reverse Journal Posting', 'workflow', financeRoles, true, true),
    action('view-audit', 'View Finance Approval History', 'audit'),
  ],
  'reports-analytics': [
    action('generate-report', 'Generate Report', 'primary'),
    action('filter-report', 'Filter Report', 'secondary'),
    action('export-excel', 'Export Excel', 'secondary'),
    action('export-pdf', 'Export PDF', 'secondary'),
    action('export-csv', 'Export CSV', 'secondary'),
    action('schedule-report', 'Schedule Report', 'workflow', payrollMakerRoles),
    action('email-report', 'Email Report', 'secondary'),
    action('save-report-view', 'Save Report View', 'secondary'),
    action('view-audit', 'Download Audit Report', 'audit'),
  ],
};

const sectionAliases: Record<string, SectionId> = {
  'payroll-dashboard': 'dashboard',
  'compliance-and-statutory-management': 'compliance-statutory-management',
  'bank-payments-and-finance-integration': 'finance-integration',
  'reports-and-analytics': 'reports-analytics',
};

const sectionById = (id?: string) => {
  const normalized = id || 'dashboard';
  const resolved = sectionAliases[normalized] || normalized;
  return sections.find((section) => section.id === resolved) || sections[0];
};

const actionsFor = (section: SectionConfig, tab: TabConfig) => {
  if (section.id === 'dashboard') return dashboardActions;
  const base = actionsBySection[section.id] || [];
  if (tab.id === 'payroll-period-management') return actionsBySection['payroll-processing'] || [];
  return base;
};

const canRunAction = (actionItem: PayrollAction, role: Role, payload: PayrollPayload | null) => {
  if (role === 'Auditor' && actionItem.group !== 'audit' && !actionItem.id.startsWith('export') && !actionItem.id.startsWith('view')) {
    return { allowed: false, reason: 'Auditors can view reports, exports, history, and audit trails only.' };
  }
  if (actionItem.roles && !actionItem.roles.includes(role)) return { allowed: false, reason: `${role} is not authorized for this action.` };
  const run = payload?.runs[0];
  const status = run?.status || 'Draft';
  const exceptions = payload?.summary.exceptionCount || 0;
  if (['approve-run'].includes(actionItem.id) && exceptions > 0) return { allowed: false, reason: 'Resolve validation exceptions before approval.' };
  if (['generate-payslips', 'generate-bank-schedule', 'export-bank-file', 'post-run'].includes(actionItem.id) && !['Approved', 'Locked', 'Posted'].includes(status)) return { allowed: false, reason: 'Payroll approval is required first.' };
  if (actionItem.id === 'close-period' && status !== 'Posted') return { allowed: false, reason: 'Close is blocked until payslips, bank schedule, journal, and statutory schedules are complete.' };
  if (status === 'Closed' && !['reopen-period', 'view-audit', 'generate-report', 'export-csv', 'export-excel', 'export-pdf'].includes(actionItem.id)) return { allowed: false, reason: 'Closed periods are locked until approved reopening.' };
  return { allowed: true, reason: '' };
};

function MetricCard({ label, value, detail, icon: Icon, tone }: { label: string; value: string; detail: string; icon: any; tone: Tone }) {
  const styles = toneStyles[tone];
  return (
    <div className={`relative overflow-hidden rounded-lg border p-4 ${styles.card}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-extrabold uppercase tracking-normal text-slate-600">{label}</p>
          <p className="mt-2 truncate text-2xl font-black text-slate-950">{value}</p>
          <p className="mt-1 text-xs font-semibold text-slate-600">{detail}</p>
        </div>
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${styles.icon}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <div className={`absolute bottom-0 left-0 h-1 w-full ${styles.bar}`} />
    </div>
  );
}

function ActionButton({ label, icon: Icon, onClick, disabled, tone = 'slate' }: { label: string; icon: any; onClick: () => void; disabled?: boolean; tone?: Tone }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border px-3 text-xs font-extrabold transition-colors ${
        disabled ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400' : `${toneStyles[tone].button} border-transparent`
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function FeaturePanel({ tab, section, payload, canViewMoney }: { tab: TabConfig; section: SectionConfig; payload: PayrollPayload | null; canViewMoney: boolean }) {
  const tone = toneStyles[section.tone];
  const relatedRows = payload?.breakdowns.byPayrollGroup.slice(0, 4) || [];
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-lg font-black text-slate-950">{tab.label}</h3>
            <p className="mt-1 text-sm font-semibold text-slate-600">{tab.description}</p>
          </div>
          {tab.legacyHref ? (
            <Link href={tab.legacyHref} className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-xs font-black ${tone.button}`}>
              Open Detailed Workspace <ChevronRight className="h-4 w-4" />
            </Link>
          ) : null}
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          {tab.items.map((item) => (
            <div key={item} className={`rounded-lg border p-3 ${tone.card}`}>
              <div className="flex items-start gap-3">
                <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${tone.icon}`}>
                  <CheckCircle2 className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-black text-slate-950">{item}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-600">Workflow-ready, audit-enabled, RBAC-aware, and API-ready.</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-black text-slate-950">Operational Context</h3>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
            <p className="text-[10px] font-black uppercase text-blue-700">Employees</p>
            <p className="mt-1 text-xl font-black text-slate-950">{number(payload?.summary.payrollEligible)}</p>
          </div>
          <div className="rounded-lg border border-red-100 bg-red-50 p-3">
            <p className="text-[10px] font-black uppercase text-red-700">Exceptions</p>
            <p className="mt-1 text-xl font-black text-slate-950">{number(payload?.summary.exceptionCount)}</p>
          </div>
          <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3">
            <p className="text-[10px] font-black uppercase text-emerald-700">Net Payroll</p>
            <p className="mt-1 truncate text-sm font-black text-slate-950">{money(payload?.summary.netPay, canViewMoney)}</p>
          </div>
          <div className="rounded-lg border border-violet-100 bg-violet-50 p-3">
            <p className="text-[10px] font-black uppercase text-violet-700">Period</p>
            <p className="mt-1 text-sm font-black text-slate-950">{payload?.periodLabel || 'Loading'}</p>
          </div>
        </div>
        <div className="mt-4 space-y-3">
          {relatedRows.map((row) => (
            <div key={row.label} className="rounded-lg bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="truncate text-xs font-black text-slate-800">{row.label}</p>
                <p className="text-xs font-black text-slate-950">{number(row.employees)}</p>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                <div className={`h-full ${tone.bar}`} style={{ width: `${Math.min(100, Math.max(8, (row.employees / Math.max(1, payload?.summary.totalEmployees || 1)) * 100))}%` }} />
              </div>
              <p className="mt-2 text-[11px] font-bold text-slate-600">{money(row.netPay, canViewMoney)} net - {number(row.exceptions)} exceptions</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function SalaryManagementWorkspace({ activeTab, payload, canViewMoney }: { activeTab: TabConfig; payload: PayrollPayload | null; canViewMoney: boolean }) {
  const records = payload?.records || [];
  const gradeMap = new Map<string, { employees: number; grossPay: number; netPay: number; exceptions: number }>();
  records.forEach((record) => {
    const grade = record.isDailyRate ? payrollRate(record, canViewMoney) : record.salaryGrade || 'Unassigned';
    const current = gradeMap.get(grade) || { employees: 0, grossPay: 0, netPay: 0, exceptions: 0 };
    current.employees += 1;
    current.grossPay += record.grossPay || 0;
    current.netPay += record.netPay || 0;
    current.exceptions += record.exceptionCount || 0;
    gradeMap.set(grade, current);
  });
  const gradeRows = Array.from(gradeMap.entries())
    .map(([grade, values]) => ({ grade, ...values }))
    .sort((a, b) => b.employees - a.employees)
    .slice(0, 10);
  const missingSalaryRows = records.filter((record) => !record.grossPay || record.exceptions.some((item) => item.toLowerCase().includes('salary'))).slice(0, 6);
  const permanentCount = records.filter((record) => /permanent/i.test(`${record.employmentType} ${record.payrollGroup}`)).length;
  const lumpSumCount = records.filter((record) => /lump|gross/i.test(`${record.employmentType} ${record.payrollGroup} ${record.paymentType}`)).length;
  const dailyRateCount = records.filter((record) => /daily|day/i.test(`${record.employmentType} ${record.payrollGroup} ${record.paymentType}`)).length;
  const salaryWorkspaces = [
    {
      title: 'Salary Structure',
      detail: 'Grades, bands, midpoint, compa-ratio, distribution, and structure exceptions.',
      href: '/hris/payroll/salary-structure',
      tone: 'blue' as Tone,
      icon: GitBranch,
      value: number(gradeRows.length),
      label: 'active grade groups',
    },
    {
      title: 'Employee Salary Setup',
      detail: 'Employee gross pay, basic pay, payroll group, salary grade, and eligibility setup.',
      href: '/hris/payroll/employee-salary-setup',
      tone: 'green' as Tone,
      icon: Users,
      value: number(payload?.summary.payrollEligible),
      label: 'payroll eligible',
    },
    {
      title: 'Sage Migration Review',
      detail: 'Permanent and lump-sum gross salary reconciliation from Sage 300 into HRIS.',
      href: '/hris/payroll/sage-migration-review',
      tone: 'violet' as Tone,
      icon: DatabaseZap,
      value: number(permanentCount + lumpSumCount),
      label: 'migration records',
    },
    {
      title: 'Daily Rate Pay',
      detail: 'Contract daily-rate employees, day rates, hourly equivalent, and payroll-ready days.',
      href: '/hris/payroll/daily-rate-pay',
      tone: 'amber' as Tone,
      icon: CalendarClock,
      value: number(dailyRateCount),
      label: 'daily-rate employees',
    },
  ];
  const profileRows = [
    { label: 'Permanent Staff', employees: permanentCount, detail: 'Monthly gross salary and permanent earning profile', tone: 'blue' as Tone },
    { label: 'Lump-Sum Staff', employees: lumpSumCount, detail: 'Monthly gross split into taxable and non-taxable lump-sum earnings', tone: 'violet' as Tone },
    { label: 'Daily-Rate Staff', employees: dailyRateCount, detail: 'Day-rate payroll driven by attendance and approved days worked', tone: 'amber' as Tone },
  ];

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h3 className="text-lg font-black text-slate-950">Salary Management Control Desk</h3>
            <p className="mt-1 max-w-5xl text-sm font-semibold text-slate-600">Maintain salary structures, reconcile Sage gross salaries, map employees to payroll profiles, and clear salary setup exceptions before payroll processing.</p>
          </div>
          {activeTab.legacyHref ? (
            <Link href={activeTab.legacyHref} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 text-xs font-black text-white hover:bg-slate-800">
              Open {activeTab.label} <ChevronRight className="h-4 w-4" />
            </Link>
          ) : null}
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <InfoTile label="Salary Records" value={number(records.length)} detail={`${number(payload?.summary.payrollEligible)} payroll eligible`} tone="blue" />
          <InfoTile label="Gross Payroll" value={money(payload?.summary.grossPay, canViewMoney)} detail={`${money(payload?.summary.basePay, canViewMoney)} basic/base pay`} tone="green" />
          <InfoTile label="Setup Exceptions" value={number(payload?.summary.exceptionCount)} detail={`${number(payload?.summary.blockedEmployees)} blocked records`} tone={(payload?.summary.exceptionCount || 0) ? 'red' : 'green'} />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        {salaryWorkspaces.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.title} href={item.href} className={`block rounded-lg border p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${toneStyles[item.tone].card}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-slate-950">{item.title}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-600">{item.detail}</p>
                </div>
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${toneStyles[item.tone].icon}`}>
                  <Icon className="h-5 w-5" />
                </span>
              </div>
              <div className="mt-4 flex items-end justify-between gap-3">
                <div>
                  <p className="text-2xl font-black text-slate-950">{item.value}</p>
                  <p className="text-xs font-bold text-slate-600">{item.label}</p>
                </div>
                <span className="inline-flex items-center gap-1 text-xs font-black text-slate-700">Open <ChevronRight className="h-4 w-4" /></span>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-4">
            <h3 className="text-sm font-black text-slate-950">Salary Structure Register</h3>
            <p className="mt-1 text-xs font-semibold text-slate-500">Current employee distribution by salary grade and payroll value.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[760px] w-full text-left">
              <thead className="bg-slate-50 text-xs font-black uppercase tracking-normal text-slate-500">
                <tr>{['Grade', 'Employees', 'Gross', 'Net', 'Exceptions', 'Status'].map((head) => <th key={head} className="px-4 py-3">{head}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {gradeRows.map((row) => (
                  <tr key={row.grade} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm font-black text-slate-950">{row.grade}</td>
                    <td className="px-4 py-3 text-sm font-bold text-slate-700">{number(row.employees)}</td>
                    <td className="px-4 py-3 text-sm font-black text-slate-900">{money(row.grossPay, canViewMoney)}</td>
                    <td className="px-4 py-3 text-sm font-black text-slate-900">{money(row.netPay, canViewMoney)}</td>
                    <td className="px-4 py-3 text-sm font-bold text-slate-700">{number(row.exceptions)}</td>
                    <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${row.exceptions ? toneStyles.red.chip : toneStyles.green.chip}`}>{row.exceptions ? 'Review' : 'Ready'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-black text-slate-950">Employee Pay Profiles</h3>
          <div className="mt-3 space-y-3">
            {profileRows.map((row) => (
              <div key={row.label} className={`rounded-lg border p-3 ${toneStyles[row.tone].card}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-slate-950">{row.label}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-600">{row.detail}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-black ${toneStyles[row.tone].chip}`}>{number(row.employees)}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-black uppercase text-slate-500">Active Tab</p>
            <p className="mt-1 text-sm font-black text-slate-950">{activeTab.label}</p>
            <p className="mt-1 text-xs font-semibold text-slate-600">{activeTab.description}</p>
          </div>
        </section>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-sm font-black text-slate-950">Salary Setup Exceptions</h3>
              <p className="mt-1 text-xs font-semibold text-slate-500">Records requiring salary, grade, payroll group, or migration review before payroll run.</p>
            </div>
            <span className={`w-fit rounded-full px-3 py-1 text-xs font-black ${missingSalaryRows.length ? toneStyles.red.chip : toneStyles.green.chip}`}>{number(missingSalaryRows.length)} visible</span>
          </div>
        </div>
        <div className="divide-y divide-slate-100">
          {missingSalaryRows.length ? missingSalaryRows.map((record) => (
            <div key={record.employeeId} className="grid grid-cols-1 gap-3 p-4 md:grid-cols-[1.2fr_0.8fr_0.8fr_1.2fr]">
              <div><p className="text-sm font-black text-slate-950">{record.fullName}</p><p className="text-xs font-semibold text-slate-500">{record.employeeId} - {record.department}</p></div>
              <div><p className="text-xs font-black uppercase text-slate-500">Grade</p><p className="text-sm font-bold text-slate-800">{record.salaryGrade || 'Unassigned'}</p></div>
              <div><p className="text-xs font-black uppercase text-slate-500">Gross</p><p className="text-sm font-black text-slate-900">{money(record.grossPay, canViewMoney)}</p></div>
              <div><p className="text-xs font-black uppercase text-slate-500">Exception</p><p className="text-sm font-semibold text-slate-700">{record.exceptions[0] || 'Salary setup requires review'}</p></div>
            </div>
          )) : <div className="p-4 text-sm font-bold text-emerald-700">No salary setup exceptions are visible for this period.</div>}
        </div>
      </section>
    </div>
  );
}

export default function PayrollManagementClient({ initialNow, initialSection = 'dashboard' }: { initialNow: string; initialSection?: string }) {
  const [sectionId, setSectionId] = useState<SectionId>(sectionById(initialSection).id);
  const [activeTabs, setActiveTabs] = useState<Record<string, string>>({});
  const [role, setRole] = useState<Role>('Payroll Officer');
  const [payload, setPayload] = useState<PayrollPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('All');
  const [busyAction, setBusyAction] = useState('');
  const [toast, setToast] = useState('');
  const [periodTab, setPeriodTab] = useState(payrollPeriodTabs[0].id);
  const [confirmAction, setConfirmAction] = useState<PayrollAction | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [auditOpen, setAuditOpen] = useState(false);

  const section = sectionById(sectionId);
  const activeTabId = activeTabs[section.id] || section.tabs[0].id;
  const activeTab = section.tabs.find((tab) => tab.id === activeTabId) || section.tabs[0];
  const canViewMoney = Boolean(payload?.permissions.canViewMoney);
  const currentRun = payload?.runs[0] || null;
  const lastLoaded = payload?.generatedAt || initialNow;

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/hris/payroll-management', { headers: { 'x-hris-role': role }, cache: 'no-store' });
      const json = await readApiResponse<PayrollPayload>(res);
      if (!res.ok || json.status !== 'success' || !json.data) throw new Error(json.error || `Payroll request failed (${res.status})`);
      setPayload(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load payroll management');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  const filteredRecords = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (payload?.records || []).filter((record) => {
      if (status !== 'All' && record.payrollStatus !== status) return false;
      if (!q) return true;
      return [
        record.employeeId,
        record.fullName,
        record.department,
        record.jobTitle,
        record.payrollGroup,
        record.salaryGrade,
        record.salaryStructure,
        record.isDailyRate ? 'daily rate contract' : '',
        record.ratePerDay,
        record.ratePerHour,
      ].some((value) => String(value || '').toLowerCase().includes(q));
    });
  }, [payload?.records, query, status]);

  const runAction = async (action: string, reason = '') => {
    setBusyAction(action);
    setToast('');
    try {
      const res = await fetch('/api/hris/payroll-management', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-hris-role': role },
        body: JSON.stringify({ action, runId: currentRun?.id, reason, actor: role }),
      });
      const json = await readApiResponse<{ run: PayrollRun }>(res);
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Payroll action failed');
      setToast(`${action.replace('-run', '').replace('-', ' ')} completed.`);
      await load();
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Payroll action failed');
    } finally {
      setBusyAction('');
    }
  };

  const triggerAction = (actionItem: PayrollAction) => {
    if (actionItem.id === 'view-audit') {
      setAuditOpen(true);
      return;
    }
    if (actionItem.id === 'export-csv') {
      exportCsv();
      return;
    }
    if (actionItem.sensitive) {
      setActionReason('');
      setConfirmAction(actionItem);
      return;
    }
    void runAction(actionItem.id);
  };

  const confirmSensitiveAction = () => {
    if (!confirmAction) return;
    if (confirmAction.reasonRequired && !actionReason.trim()) return;
    const actionToRun = confirmAction;
    setConfirmAction(null);
    void runAction(actionToRun.id, actionReason.trim());
  };

  const exportCsv = () => {
    window.location.href = '/api/hris/payroll-management?format=csv';
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-900 text-white">
              <WalletCards className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-950">{section.id === 'dashboard' ? 'Payroll Management' : section.title}</h1>
              <p className="mt-1 max-w-5xl text-sm font-semibold text-slate-600">{section.id === 'dashboard' ? 'Modern enterprise payroll with page-and-tab architecture for payroll operations, compliance, finance integration, Sage readiness, and reporting.' : section.description}</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-extrabold text-blue-800">Period: {payload?.periodLabel || 'Loading'}</span>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-extrabold text-emerald-800">Source: {payload?.dataSource?.source || 'DLE_Enterprise HRIS'}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-extrabold text-slate-700">Employees: {number(payload?.dataSource?.employeeCount || payload?.summary.totalEmployees)}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-extrabold text-slate-700">Loaded: {new Date(lastLoaded).toLocaleString('en-GB')}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-800 outline-none">
            {roleOptions.map((item) => <option key={item}>{item}</option>)}
          </select>
          <ActionButton label={loading ? 'Refreshing' : 'Refresh'} icon={RefreshCcw} onClick={() => void load()} disabled={loading} tone="blue" />
          <ActionButton label="Export CSV" icon={Download} onClick={exportCsv} disabled={!payload?.permissions.canExport} tone="slate" />
        </div>
      </div>

      {error ? <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">{error}</div> : null}
      {toast ? <div className="mt-5 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800">{toast}</div> : null}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Payroll Eligible" value={number(payload?.summary.payrollEligible)} detail={`${number(payload?.summary.totalEmployees)} employees in HRIS`} icon={Users} tone="blue" />
        <MetricCard label="Gross Payroll" value={money(payload?.summary.grossPay, canViewMoney)} detail={`${money(payload?.summary.netPay, canViewMoney)} net payroll`} icon={Banknote} tone="green" />
        <MetricCard label="Tax & Pension Liability" value={money(payload?.summary.deductions, canViewMoney)} detail="PAYE, pension, statutory and other deductions" icon={ReceiptText} tone="violet" />
        <MetricCard label="Payroll Exceptions" value={number(payload?.summary.exceptionCount)} detail={`${number(payload?.summary.blockedEmployees)} blocked, ${number(payload?.summary.reviewEmployees)} review`} icon={AlertTriangle} tone={(payload?.summary.exceptionCount || 0) > 0 ? 'red' : 'green'} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-[250px_1fr]">
        <aside className="rounded-lg border border-slate-200 bg-white p-2 shadow-sm xl:sticky xl:top-20">
          <nav className="grid grid-cols-2 gap-1 xl:grid-cols-1" aria-label="Payroll module pages">
            {sections.map((item) => {
              const Icon = item.icon;
              const active = section.id === item.id;
              return (
                <button key={item.id} type="button" onClick={() => setSectionId(item.id)} className={`flex min-h-11 items-center gap-2 rounded-lg px-3 text-left text-xs font-black transition-colors ${active ? `${toneStyles[item.tone].button}` : 'text-slate-700 hover:bg-slate-50'}`}>
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        <main className="min-w-0">
          <section className={`rounded-lg border p-4 ${toneStyles[section.tone].card}`}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${toneStyles[section.tone].icon}`}>
                    <section.icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate text-xl font-black text-slate-950">{section.title}</h2>
                    <p className="mt-1 text-sm font-semibold text-slate-600">{section.description}</p>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {(payload?.controls || []).map((control) => <span key={control.id} className={`rounded-full px-2.5 py-1 text-[11px] font-black ${toneStyles[control.tone].chip}`}>{control.label}: {control.status}</span>)}
              </div>
            </div>
          </section>

          {section.id !== 'salary-management' ? (
            <PayrollCommandBar
              section={section}
              activeTab={activeTab}
              role={role}
              payload={payload}
              busyAction={busyAction}
              onAction={triggerAction}
            />
          ) : null}

          <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white p-2">
            <div className="flex min-w-max gap-1">
              {section.tabs.map((tab) => (
                <button key={tab.id} type="button" onClick={() => setActiveTabs((prev) => ({ ...prev, [section.id]: tab.id }))} className={`min-h-10 rounded-lg px-3 text-xs font-black transition-colors ${activeTab.id === tab.id ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-50'}`}>
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4">
            {section.id === 'dashboard' ? (
              <DashboardWorkspace payload={payload} canViewMoney={canViewMoney} runAction={runAction} busyAction={busyAction} currentRun={currentRun} filteredRecords={filteredRecords} query={query} setQuery={setQuery} status={status} setStatus={setStatus} />
            ) : section.id === 'salary-management' ? (
              <SalaryManagementWorkspace activeTab={activeTab} payload={payload} canViewMoney={canViewMoney} />
            ) : section.id === 'payroll-processing' && activeTab.id === 'payroll-period-management' ? (
              <PayrollPeriodManagementPanel payload={payload} activeTabId={periodTab} setActiveTabId={setPeriodTab} />
            ) : (
              <FeaturePanel tab={activeTab} section={section} payload={payload} canViewMoney={canViewMoney} />
            )}
          </div>

          <section className="mt-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-sm font-black text-slate-950">Enterprise Requirements Coverage</h3>
                <p className="mt-1 text-xs font-semibold text-slate-500">Modular, scalable, maintainable, cloud-ready, API-ready, and future-proof payroll architecture.</p>
              </div>
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800">20 / 20 capability surfaces</span>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {enterpriseRequirements.map((item) => (
                <div key={item} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span className="text-xs font-bold text-slate-700">{item}</span>
                </div>
              ))}
            </div>
          </section>
        </main>
      </div>
      {confirmAction ? (
        <ConfirmationModal
          actionItem={confirmAction}
          payload={payload}
          reason={actionReason}
          setReason={setActionReason}
          onCancel={() => setConfirmAction(null)}
          onConfirm={confirmSensitiveAction}
        />
      ) : null}
      {auditOpen ? <AuditPanel payload={payload} onClose={() => setAuditOpen(false)} /> : null}
    </div>
  );
}

function DashboardWorkspace({
  payload,
  canViewMoney,
  runAction,
  busyAction,
  currentRun,
  filteredRecords,
  query,
  setQuery,
  status,
  setStatus,
}: {
  payload: PayrollPayload | null;
  canViewMoney: boolean;
  runAction: (action: string) => void;
  busyAction: string;
  currentRun: PayrollRun | null;
  filteredRecords: PayrollRecord[];
  query: string;
  setQuery: (value: string) => void;
  status: string;
  setStatus: (value: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-sm font-black text-slate-950">Payroll Cycle Status</h3>
                <p className="mt-1 text-xs font-semibold text-slate-500">Run, validation, approval, locking, posting, and version-control readiness.</p>
              </div>
              <span className={`w-fit rounded-full px-3 py-1 text-xs font-black ${toneStyles[statusTone(currentRun?.status || 'Draft')].chip}`}>{currentRun?.status || 'Draft'}</span>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-3">
            <InfoTile label="Run ID" value={currentRun?.id || `payroll-${payload?.period || ''}`} detail={`Created by ${currentRun?.createdBy || 'System'}`} tone="blue" />
            <InfoTile label="Run Value" value={money(currentRun?.netPay, canViewMoney)} detail={`${number(currentRun?.employeeCount)} employees`} tone="green" />
            <InfoTile label="Approval" value={currentRun?.approvedBy || 'Pending'} detail={currentRun?.approvedAt ? new Date(currentRun.approvedAt).toLocaleString('en-GB') : 'Awaiting approval'} tone="violet" />
          </div>
          <div className="flex flex-wrap gap-2 border-t border-slate-100 p-4">
            <ActionButton label="Run Payroll" icon={PlayCircle} onClick={() => runAction('create-run')} disabled={busyAction === 'create-run' || !payload?.permissions.canManageRun} tone="blue" />
            <ActionButton label="Approve" icon={BadgeCheck} onClick={() => runAction('approve-run')} disabled={busyAction === 'approve-run' || !payload?.permissions.canApprove} tone="green" />
            <ActionButton label="Lock" icon={Lock} onClick={() => runAction('lock-run')} disabled={busyAction === 'lock-run' || !payload?.permissions.canManageRun} tone="violet" />
            <ActionButton label="Post to Finance" icon={Send} onClick={() => runAction('post-run')} disabled={busyAction === 'post-run' || !payload?.permissions.canPost} tone="slate" />
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-4">
            <h3 className="text-sm font-black text-slate-950">Payroll Analytics</h3>
            <p className="mt-1 text-xs font-semibold text-slate-500">Coverage, readiness, exceptions, and trend-ready dashboard widgets.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
            <MetricCard label="Coverage" value={`${pctFmt.format(payload?.summary.payrollCoveragePct || 0)}%`} detail="Employees assigned to payroll setup" icon={ShieldCheck} tone="cyan" />
            <MetricCard label="Ready Records" value={number(payload?.summary.readyEmployees)} detail="No payroll-blocking exceptions" icon={CheckCircle2} tone="green" />
            <MetricCard label="Review Queue" value={number(payload?.summary.reviewEmployees)} detail="Requires validation" icon={Sparkles} tone="amber" />
            <MetricCard label="Blocked Records" value={number(payload?.summary.blockedEmployees)} detail="Must be resolved before posting" icon={AlertTriangle} tone="red" />
          </div>
        </section>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h3 className="text-sm font-black text-slate-950">Payroll Register & Exceptions</h3>
              <p className="mt-1 text-xs font-semibold text-slate-500">Search, filter, drill down, export, and resolve exceptions.</p>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[auto_1fr_160px]">
              <Link href="/hris/payroll/daily-rate-pay" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 text-xs font-black text-amber-900 hover:bg-white">
                <CalendarClock className="h-4 w-4" /> Daily Rate List
              </Link>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search employee, group, rate, department" className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-10 text-sm font-semibold outline-none focus:border-dle-blue focus:ring-2 focus:ring-dle-blue/20" />
                {query ? <button type="button" onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button> : null}
              </div>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold outline-none">
                {['All', 'Ready', 'Review', 'Blocked'].map((item) => <option key={item}>{item}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1220px] w-full text-left">
            <thead className="bg-slate-50 text-xs font-black uppercase tracking-normal text-slate-500">
              <tr>{['Employee', 'Group', 'Type', 'Rate / Structure', 'Gross', 'Deductions', 'Net', 'Status', 'Exceptions'].map((head) => <th key={head} className="px-4 py-3">{head}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRecords.slice(0, 80).map((record) => (
                <tr key={record.employeeId} className="hover:bg-slate-50">
                  <td className="px-4 py-3"><p className="text-sm font-black text-slate-950">{record.fullName}</p><p className="text-xs font-semibold text-slate-500">{record.employeeId} - {record.department}</p></td>
                  <td className="px-4 py-3 text-xs font-bold text-slate-700">{record.payrollGroup}<br /><span className="text-slate-400">{record.isDailyRate ? 'Daily rate structure' : record.salaryGrade}</span></td>
                  <td className="px-4 py-3 text-xs font-bold text-slate-700">{record.employmentType}<br /><span className="text-slate-400">{record.paymentRun}</span></td>
                  <td className="px-4 py-3 text-sm font-black text-slate-900">{payrollRate(record, canViewMoney)}</td>
                  <td className="px-4 py-3 text-sm font-black text-slate-900">{money(record.grossPay, canViewMoney)}</td>
                  <td className="px-4 py-3 text-sm font-black text-slate-900">{money(record.deductions, canViewMoney)}</td>
                  <td className="px-4 py-3 text-sm font-black text-slate-900">{money(record.netPay, canViewMoney)}</td>
                  <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${toneStyles[statusTone(record.payrollStatus)].chip}`}>{record.payrollStatus}</span></td>
                  <td className="px-4 py-3 text-xs font-semibold text-slate-600">{record.exceptions.length ? record.exceptions.slice(0, 2).join('; ') : 'Clear'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <PayrollExceptionCenter payload={payload} onAction={runAction} />
    </div>
  );
}

function PayrollExceptionCenter({ payload, onAction }: { payload: PayrollPayload | null; onAction: (action: string, reason?: string) => void }) {
  const categories = [
    'Missing salary setup',
    'Missing payroll group',
    'Missing bank account',
    'Missing tax profile',
    'Missing pension profile',
    'Missing department',
    'Missing cost center',
    'Employee not payroll eligible',
    'Duplicate payroll record',
    'Negative net pay',
    'Salary outside grade band',
    'Unapproved allowance',
    'Unapproved deduction',
    'Unprocessed employee',
    'Payslip not generated',
    'Journal not posted',
    'Bank schedule not generated',
    'Statutory schedule not generated',
  ];
  const exceptions = payload?.exceptions || [];
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h3 className="text-sm font-black text-slate-950">Payroll Exception Center</h3>
            <p className="mt-1 text-xs font-semibold text-slate-500">Assign owners, resolve, override with approval, export, comment, and review resolution history.</p>
          </div>
          <span className={`w-fit rounded-full px-3 py-1 text-xs font-black ${exceptions.length ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'}`}>{number(exceptions.length)} exceptions</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {categories.slice(0, 9).map((item) => <span key={item} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-700">{item}</span>)}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 p-4 lg:grid-cols-2">
        {exceptions.slice(0, 8).map((item) => (
          <div key={item.id} className={`rounded-lg border p-3 ${item.severity === 'High' ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'}`}>
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-sm font-black text-slate-950">{item.employeeName}</p><p className="mt-1 text-xs font-semibold text-slate-600">{item.employeeId} · Owner: {item.owner}</p></div>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${item.severity === 'High' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>{item.severity}</span>
            </div>
            <p className="mt-2 text-sm font-bold text-slate-800">{item.issue}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {['View Details', 'Assign Owner', 'Resolve', 'Override with Reason', 'Export Exception', 'Add Comment', 'View Resolution History'].map((label) => (
                <button key={label} type="button" onClick={() => onAction(label.toLowerCase().replace(/\s+/g, '-'), item.issue)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-black text-slate-700 hover:bg-slate-50">{label}</button>
              ))}
            </div>
          </div>
        ))}
        {!exceptions.length ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-black text-emerald-800">No payroll exceptions detected.</div> : null}
      </div>
    </section>
  );
}

function PayrollCommandBar({ section, activeTab, role, payload, busyAction, onAction }: { section: SectionConfig; activeTab: TabConfig; role: Role; payload: PayrollPayload | null; busyAction: string; onAction: (action: PayrollAction) => void }) {
  const actions = actionsFor(section, activeTab);
  const currentStatus = payload?.workflow?.currentStatus || payload?.runs[0]?.status || 'Draft';
  const blocked = payload?.workflow?.blockedActions || [];
  const visibleActions = actions.slice(0, 16);
  return (
    <section className="mt-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h3 className="text-sm font-black text-slate-950">Payroll Command Center</h3>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            Status: <span className="font-black text-slate-800">{currentStatus}</span> · Stage: <span className="font-black text-slate-800">{payload?.workflow?.approvalStage || 'Draft'}</span> · Next owner: <span className="font-black text-slate-800">{payload?.workflow?.nextOwner || 'Payroll Officer'}</span>
          </p>
        </div>
        <span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">Role: {role}</span>
      </div>
      {blocked.length ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-black uppercase text-amber-800">Blocked Progress</p>
          <div className="mt-2 grid grid-cols-1 gap-1">
            {blocked.map((item) => <p key={item} className="text-xs font-semibold text-amber-800">{item}</p>)}
          </div>
        </div>
      ) : null}
      <WorkflowStepper payload={payload} onAction={onAction} />
      <div className="mt-4 flex flex-wrap gap-2">
        {visibleActions.map((item) => {
          const auth = canRunAction(item, role, payload);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => auth.allowed && onAction(item)}
              disabled={!auth.allowed || busyAction === item.id}
              title={auth.reason || item.label}
              className={`inline-flex min-h-10 items-center justify-center rounded-lg px-3 text-xs font-black transition-colors ${
                !auth.allowed || busyAction === item.id
                  ? 'cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400'
                  : item.group === 'primary'
                    ? toneStyles[section.tone].button
                    : item.group === 'workflow'
                      ? 'bg-slate-900 text-white hover:bg-slate-800'
                      : item.group === 'audit'
                        ? 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}

const workflowSteps = [
  ['Period Created', 'Payroll Officer', 'create-period'],
  ['Period Opened', 'Payroll Officer', 'open-period'],
  ['Master Data Validated', 'Payroll Supervisor', 'validate-payroll'],
  ['Payroll Processed', 'Payroll Officer', 'create-run'],
  ['Exceptions Resolved', 'Payroll Officer', 'view-exceptions'],
  ['Submitted for Approval', 'Payroll Supervisor', 'submit-run'],
  ['Approved', 'HR / Finance / CFO', 'approve-run'],
  ['Payslips Generated', 'Payroll Officer', 'generate-payslips'],
  ['Bank Schedule Generated', 'Finance Manager', 'generate-bank-schedule'],
  ['Journal Posted', 'Finance Manager', 'post-run'],
  ['Statutory Reports Generated', 'Payroll Officer', 'generate-statutory-schedules'],
  ['Period Closed', 'Payroll Supervisor', 'close-period'],
];

function WorkflowStepper({ payload, onAction }: { payload: PayrollPayload | null; onAction: (action: PayrollAction) => void }) {
  const run = payload?.runs[0];
  const status = run?.status || 'Draft';
  const completed = status === 'Closed' ? 12 : status === 'Posted' ? 10 : status === 'Approved' || status === 'Locked' ? 7 : status === 'Submitted' ? 6 : status === 'Ready for Approval' ? 5 : status === 'Validation' ? 3 : 1;
  return (
    <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
      {workflowSteps.map(([label, owner, actionId], index) => {
        const done = index + 1 <= completed;
        return (
          <div key={label} className={`rounded-lg border p-3 ${done ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-black text-slate-950">{index + 1}. {label}</p>
                <p className="mt-1 text-[11px] font-semibold text-slate-500">Owner: {owner}</p>
                <p className="mt-1 text-[11px] font-semibold text-slate-500">{done ? (run?.approvedAt || run?.postedAt || run?.createdAt || payload?.generatedAt || 'Completed') : 'Pending'}</p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${done ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}`}>{done ? 'Done' : 'Open'}</span>
            </div>
            {!done ? <button type="button" onClick={() => onAction(action(actionId, label, 'workflow', viewRoles, ['approve-run', 'close-period', 'post-run'].includes(actionId)))} className="mt-2 text-[11px] font-black text-blue-700 hover:underline">Run action</button> : null}
          </div>
        );
      })}
    </div>
  );
}

function ConfirmationModal({ actionItem, payload, reason, setReason, onCancel, onConfirm }: { actionItem: PayrollAction; payload: PayrollPayload | null; reason: string; setReason: (value: string) => void; onCancel: () => void; onConfirm: () => void }) {
  const requiresReason = actionItem.reasonRequired || ['reject-run', 'request-revision', 'reopen-period', 'reverse-payroll', 'reverse-journal-posting'].includes(actionItem.id);
  const canConfirm = !requiresReason || reason.trim().length > 2;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white shadow-2xl">
        <div className="border-b border-slate-100 p-4">
          <h3 className="text-lg font-black text-slate-950">Confirm {actionItem.label}</h3>
          <p className="mt-1 text-sm font-semibold text-slate-600">Review the impact before continuing. This action will be audit logged.</p>
        </div>
        <div className="space-y-3 p-4">
          <InfoTile label="Payroll Period" value={payload?.periodLabel || 'Current Period'} detail={payload?.runs[0]?.id || 'No run selected'} tone="blue" />
          <InfoTile label="Affected Employees" value={number(payload?.summary.payrollEligible)} detail={`${number(payload?.summary.exceptionCount)} exceptions currently visible`} tone={(payload?.summary.exceptionCount || 0) ? 'amber' : 'green'} />
          <InfoTile label="Financial Amount" value={money(payload?.summary.netPay, payload?.permissions.canViewMoney)} detail="Current net payroll exposure" tone="violet" />
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-800">Sensitive payroll actions can affect employee pay, ESS visibility, bank files, journals, statutory schedules, and period locks.</div>
          {requiresReason ? (
            <label className="block">
              <span className="text-xs font-black uppercase text-slate-500">Required reason</span>
              <textarea value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1 min-h-24 w-full rounded-lg border border-slate-200 p-3 text-sm font-semibold outline-none focus:border-blue-500" placeholder="Enter approval, rejection, reopening, reversal, or correction reason" />
            </label>
          ) : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 p-4">
          <button type="button" onClick={onCancel} className="min-h-10 rounded-lg border border-slate-200 px-4 text-xs font-black text-slate-700 hover:bg-slate-50">Cancel</button>
          <button type="button" onClick={onConfirm} disabled={!canConfirm} className="min-h-10 rounded-lg bg-slate-900 px-4 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-50">Confirm Action</button>
        </div>
      </div>
    </div>
  );
}

function AuditPanel({ payload, onClose }: { payload: PayrollPayload | null; onClose: () => void }) {
  const rows = payload?.auditTrail || [];
  return (
    <div className="fixed inset-y-0 right-0 z-[90] w-full max-w-xl overflow-y-auto border-l border-slate-200 bg-white shadow-2xl">
      <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white p-4">
        <div><h3 className="text-lg font-black text-slate-950">Payroll Audit Trail</h3><p className="text-xs font-semibold text-slate-500">User, role, action, record, timestamp, reason, and device/IP where available.</p></div>
        <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-black text-slate-700">Close</button>
      </div>
      <div className="space-y-2 p-4">
        {rows.length ? rows.map((row) => (
          <div key={row.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-sm font-black text-slate-950">{row.action}</p><p className="mt-1 text-xs font-semibold text-slate-600">{row.record} · {row.role} · {row.user}</p></div>
              <span className="text-[11px] font-bold text-slate-500">{new Date(row.at).toLocaleString('en-GB')}</span>
            </div>
            <p className="mt-2 text-xs font-semibold text-slate-600">Old: {row.oldValue || '-'} · New: {row.newValue || '-'}</p>
            {row.reason || row.comment ? <p className="mt-1 text-xs font-semibold text-slate-600">Reason: {row.reason || row.comment}</p> : null}
            {row.ip ? <p className="mt-1 text-[11px] font-semibold text-slate-400">IP/device: {row.ip}</p> : null}
          </div>
        )) : <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-600">No payroll audit actions have been logged in this session yet.</div>}
      </div>
    </div>
  );
}

function InfoTile({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: Tone }) {
  return (
    <div className={`rounded-lg border p-4 ${toneStyles[tone].card}`}>
      <p className={`text-xs font-black uppercase tracking-normal ${toneStyles[tone].text}`}>{label}</p>
      <p className="mt-2 break-words text-sm font-black text-slate-950">{value}</p>
      <p className="mt-1 text-xs font-semibold text-slate-600">{detail}</p>
    </div>
  );
}

function PayrollPeriodManagementPanel({ payload, activeTabId, setActiveTabId }: { payload: PayrollPayload | null; activeTabId: string; setActiveTabId: (value: string) => void }) {
  const activeTab = payrollPeriodTabs.find((tab) => tab.id === activeTabId) || payrollPeriodTabs[0];
  const currentRun = payload?.runs[0] || null;
  const periodCode = currentRun?.id || `payroll-${payload?.period || 'period'}`;
  const periodName = payload?.periodLabel || 'Current Payroll Period';
  const employeeCategories = payload?.breakdowns.byEmploymentType.map((item) => item.label).slice(0, 6) || ['Permanent', 'Lumpsum', 'Daily Rate'];
  const completionChecks = [
    ['Employees processed', `${number(payload?.summary.payrollEligible)} eligible employees`, (payload?.summary.blockedEmployees || 0) === 0],
    ['Payslips generated', 'Generation queue available', Boolean(currentRun && ['Approved', 'Locked', 'Posted'].includes(currentRun.status))],
    ['Approvals completed', currentRun?.approvedBy || 'Awaiting approval', Boolean(currentRun?.approvedAt)],
    ['Bank schedule generated', 'Finance integration ready', Boolean(currentRun && ['Locked', 'Posted'].includes(currentRun.status))],
    ['Payroll journal posted', currentRun?.postedAt ? new Date(currentRun.postedAt).toLocaleString('en-GB') : 'Awaiting posting', Boolean(currentRun?.postedAt)],
    ['Statutory schedules generated', 'PAYE, pension, NHF, NSITF, ITF mapped', Boolean(payload?.summary.deductions)],
  ];

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h3 className="text-lg font-black text-slate-950">Payroll Period Management</h3>
            <p className="mt-1 max-w-4xl text-sm font-semibold text-slate-600">Create, validate, approve, close, reopen, lock, report, and audit payroll periods across frequencies, companies, locations, departments, and employee categories.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-amber-800">Current: {periodName}</span>
            <span className={`rounded-full px-3 py-1 text-xs font-black ${toneStyles[statusTone(currentRun?.status || 'Draft')].chip}`}>{currentRun?.status || 'Draft'}</span>
          </div>
        </div>
      </section>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white p-2">
        <div className="flex min-w-max gap-1">
          {payrollPeriodTabs.map((tab) => (
            <button key={tab.id} type="button" onClick={() => setActiveTabId(tab.id)} className={`min-h-10 rounded-lg px-3 text-xs font-black transition-colors ${activeTab.id === tab.id ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-50'}`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-lg font-black text-slate-950">{activeTab.label}</h3>
              <p className="mt-1 text-sm font-semibold text-slate-600">{activeTab.description}</p>
            </div>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800">Audit + RBAC enforced</span>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            {activeTab.items.map((item) => (
              <div key={item} className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-white"><CheckCircle2 className="h-4 w-4" /></span>
                  <div><p className="text-sm font-black text-slate-950">{item}</p><p className="mt-1 text-xs font-semibold text-slate-600">Workflow-ready, notification-enabled, and future Sage ERP integration-ready.</p></div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-black text-slate-950">Current Period Control</h3>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <InfoTile label="Period Code" value={periodCode} detail="Duplicate guarded" tone="blue" />
            <InfoTile label="Period Name" value={periodName} detail="Calendar mapped" tone="green" />
            <InfoTile label="Payment Date" value="Configured per calendar" detail="Bank schedule ready" tone="violet" />
            <InfoTile label="Payroll Type" value="Monthly / Weekly / Daily" detail="Frequency aware" tone="amber" />
          </div>
          <div className="mt-4">
            <p className="text-xs font-black uppercase text-slate-500">Eligible Categories</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {employeeCategories.map((item) => <span key={item} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-700">{item}</span>)}
            </div>
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-black text-slate-950">Status Lifecycle</h3>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {payrollPeriodStatuses.map((item) => <span key={item} className={`rounded-lg px-3 py-2 text-xs font-black ${toneStyles[statusTone(item)].chip}`}>{item}</span>)}
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-black text-slate-950">Closing Checklist</h3>
          <div className="mt-3 space-y-2">
            {completionChecks.map(([label, detail, ok]) => (
              <div key={String(label)} className="flex items-start gap-2 rounded-lg bg-slate-50 p-2">
                <CheckCircle2 className={`mt-0.5 h-4 w-4 shrink-0 ${ok ? 'text-emerald-600' : 'text-amber-500'}`} />
                <div><p className="text-xs font-black text-slate-900">{label}</p><p className="text-[11px] font-semibold text-slate-500">{detail}</p></div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-black text-slate-950">Enterprise Readiness</h3>
          <div className="mt-3 grid grid-cols-1 gap-2">
            {payrollPeriodReadiness.map((item) => (
              <div key={item} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                <span className="text-xs font-bold text-slate-700">{item}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
