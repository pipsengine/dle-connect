'use client';

/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import LeaveCommandCenter from './LeaveCommandCenter';
import LeaveTransactionsCommandCenter from './LeaveTransactionsCommandCenter';
import LeaveDrilldownModal, { type LeaveDrilldownPanel, type LeaveDrilldownRow } from './LeaveDrilldownModal';
import {
  AlertTriangle,
  Archive,
  BadgeCheck,
  Banknote,
  Bell,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Download,
  FileSpreadsheet,
  FileText,
  History,
  Lock,
  PlayCircle,
  Plus,
  RefreshCcw,
  RotateCcw,
  Send,
  ShieldCheck,
  UserCheck,
  Users,
  X,
  XCircle,
} from 'lucide-react';

type LeaveRole = 'Leave Administrator' | 'HR Officer' | 'HR Manager' | 'Department Manager' | 'Supervisor' | 'Payroll Officer' | 'Employee' | 'Executive' | 'System Administrator';
type LeaveTone = 'blue' | 'green' | 'amber' | 'red' | 'violet' | 'cyan' | 'slate';
type LeaveAction = { id: string; label: string; roles: LeaveRole[]; requiresReason?: boolean; sensitive?: boolean };
type AppRecord = {
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
  status: string;
  stage: string;
  approvalStatus: string;
  policyComplianceStatus: string;
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
type BalanceRecord = {
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
  status: string;
  exceptions: string[];
};
type LeaveTypeRule = {
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
type AllowanceExceptionRecord = {
  id: string;
  severity: 'Critical' | 'Review' | 'Pending';
  employeeId: string;
  fullName: string;
  department: string;
  leaveYear: number;
  payrollPeriod: string;
  approvedAnnualLeaveDays: number;
  requestDays: number;
  allowanceAmount: number;
  allowanceStatus: string;
  eventStatus: string;
  linkedRequestId?: string;
  recommendation: string;
};
type AuditEntry = { id: string; at: string; user: string; role: string; action: string; record: string; oldValue: string | null; newValue: string | null; comments?: string; reason?: string };
type SectionArea = 'Dashboard' | 'Transactions' | 'Planning & Balances' | 'Administration' | 'Reports & Analytics';
type SectionConfig = { id: string; label: string; area: SectionArea; description: string; actions: string[]; controls: string[]; reports?: string[] };
type Payload = {
  generatedAt: string;
  source: string;
  role: LeaveRole;
  section: string;
  permissions: { canApply: boolean; canApprove: boolean; canAdminister: boolean; canProcessFinancials: boolean; canConfigure: boolean; canExport: boolean; canViewAudit: boolean };
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
  applications: AppRecord[];
  balances: BalanceRecord[];
  allowanceExceptions: AllowanceExceptionRecord[];
  leaveTypes: LeaveTypeRule[];
  calendar: Array<Record<string, string | number>>;
  blockedPeriods: Array<Record<string, string>>;
  workflowMatrix: Array<Record<string, string>>;
  reports: Array<Record<string, string>>;
  notifications: Array<Record<string, string>>;
  auditTrail: AuditEntry[];
  integrations: Array<Record<string, string>>;
  operationalSections: SectionConfig[];
  drilldowns?: {
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
type ApiResponse<T> = { status: 'success' | 'error'; data?: T; error?: string };

const roles: LeaveRole[] = ['Leave Administrator', 'HR Officer', 'HR Manager', 'Department Manager', 'Supervisor', 'Payroll Officer', 'Employee', 'Executive', 'System Administrator'];
const moneyFmt = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 });
const numberFmt = new Intl.NumberFormat('en-GB');
const money = (value: number | undefined) => moneyFmt.format(value || 0);
const number = (value: number | undefined) => numberFmt.format(value || 0);
const compactMoney = (value: number | undefined) => {
  const v = value || 0;
  if (v >= 1_000_000_000) return `₦${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `₦${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `₦${(v / 1_000).toFixed(1)}K`;
  return money(v);
};

const stableDateTime = (value: string) => {
  const iso = new Date(value).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
};

const toneStyles: Record<LeaveTone, { card: string; icon: string; chip: string; button: string }> = {
  blue: { card: 'border-blue-200 bg-blue-50', icon: 'bg-blue-600 text-white', chip: 'bg-blue-100 text-blue-800', button: 'bg-blue-600 text-white hover:bg-blue-700' },
  green: { card: 'border-emerald-200 bg-emerald-50', icon: 'bg-emerald-600 text-white', chip: 'bg-emerald-100 text-emerald-800', button: 'bg-emerald-600 text-white hover:bg-emerald-700' },
  amber: { card: 'border-amber-200 bg-amber-50', icon: 'bg-amber-500 text-white', chip: 'bg-amber-100 text-amber-800', button: 'bg-amber-500 text-white hover:bg-amber-600' },
  red: { card: 'border-red-200 bg-red-50', icon: 'bg-red-600 text-white', chip: 'bg-red-100 text-red-800', button: 'bg-red-600 text-white hover:bg-red-700' },
  violet: { card: 'border-violet-200 bg-violet-50', icon: 'bg-violet-600 text-white', chip: 'bg-violet-100 text-violet-800', button: 'bg-violet-600 text-white hover:bg-violet-700' },
  cyan: { card: 'border-cyan-200 bg-cyan-50', icon: 'bg-cyan-600 text-white', chip: 'bg-cyan-100 text-cyan-800', button: 'bg-cyan-600 text-white hover:bg-cyan-700' },
  slate: { card: 'border-slate-200 bg-slate-50', icon: 'bg-slate-900 text-white', chip: 'bg-slate-100 text-slate-800', button: 'bg-slate-900 text-white hover:bg-slate-800' },
};

const statusTone = (value: string): LeaveTone => {
  const text = String(value || '').toLowerCase();
  if (text.includes('block') || text.includes('reject') || text.includes('cancel') || text.includes('exception')) return 'red';
  if (text.includes('pending') || text.includes('review') || text.includes('draft') || text.includes('attention')) return 'amber';
  if (text.includes('approve') || text.includes('complete') || text.includes('healthy') || text.includes('compliant')) return 'green';
  return 'blue';
};

const actionIcon = (id: string) => {
  if (id.includes('approve')) return BadgeCheck;
  if (id.includes('reject') || id.includes('cancel') || id.includes('withdraw')) return XCircle;
  if (id.includes('report') || id.includes('export')) return Download;
  if (id.includes('audit') || id.includes('history')) return History;
  if (id.includes('accrual') || id.includes('carry')) return RotateCcw;
  if (id.includes('calendar') || id.includes('schedule')) return CalendarDays;
  if (id.includes('payroll') || id.includes('encash')) return Banknote;
  if (id.includes('delegate') || id.includes('reassign')) return UserCheck;
  return PlayCircle;
};

const applyLeaveAction = (actions: LeaveAction[]) => actions.find((item) => item.id === 'apply') || actions.find((item) => item.id === 'create');

function HubMetricCard({ label, value, detail, icon: Icon, tone, onClick }: { label: string; value: string; detail: string; icon: any; tone: LeaveTone; onClick?: () => void }) {
  const styles = toneStyles[tone];
  const className = `rounded-xl border bg-white p-4 text-left shadow-sm transition-colors ${styles.card} ${onClick ? 'cursor-pointer hover:border-[#2563EB]/40 hover:bg-blue-50/40' : ''}`;
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
          <p className="mt-1 text-xs text-slate-600">{detail}</p>
          {onClick ? <p className="mt-2 text-xs font-semibold text-[#2563EB]">Click to view details →</p> : null}
        </div>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${styles.icon}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {content}
      </button>
    );
  }
  return <div className={className}>{content}</div>;
}

function MetricCard({ label, value, detail, icon: Icon, tone }: { label: string; value: string; detail: string; icon: any; tone: LeaveTone }) {
  const styles = toneStyles[tone];
  return (
    <div className={`relative overflow-hidden rounded-2xl border p-4 ${styles.card}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-normal text-slate-600">{label}</p>
          <p className="mt-2 truncate text-2xl font-black text-slate-950">{value}</p>
          <p className="mt-1 text-xs font-semibold text-slate-600">{detail}</p>
        </div>
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${styles.icon}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </div>
  );
}

function StatusPanel({ payload }: { payload: Payload | null }) {
  const rows = [
    ['Current leave status', payload?.current.leaveStatus || 'Loading'],
    ['Available actions', payload?.current.availableActions.join(', ') || 'Loading'],
    ['Next required action', payload?.current.nextRequiredAction || 'Loading'],
    ['Approval status', payload?.current.approvalStatus || 'Loading'],
    ['Policy compliance status', payload?.current.policyComplianceStatus || 'Loading'],
    ['Leave balance impact', payload?.current.leaveBalanceImpact || 'Loading'],
    ['Audit history', payload?.current.auditHistory || 'Loading'],
    ['Workflow progress', payload?.current.workflowProgress || 'Loading'],
  ];
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-black text-slate-950">Operational Status</h2>
          <p className="mt-1 text-xs font-semibold text-slate-500">Every leave page exposes status, action, workflow, compliance, balance, audit, and exceptions.</p>
        </div>
        <ShieldCheck className="h-5 w-5 text-emerald-600" />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {rows.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-[11px] font-black uppercase text-slate-500">{label}</p>
            <p className="mt-1 line-clamp-2 text-xs font-extrabold text-slate-900">{value}</p>
          </div>
        ))}
      </div>
      {payload?.current.exceptionIndicators.length ? (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3">
          <p className="text-xs font-black uppercase text-red-800">Exception Indicators</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {payload.current.exceptionIndicators.map((item, index) => <span key={`${item}-${index}`} className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-800">{item}</span>)}
          </div>
        </div>
      ) : null}
    </section>
  );
}

const workspaces: Array<{ id: string; label: SectionArea; defaultSection: string; description: string }> = [
  { id: 'dashboard', label: 'Dashboard', defaultSection: 'dashboard', description: 'Executive overview, command center metrics, exceptions, workflow status, and leave governance signals.' },
  { id: 'transactions', label: 'Transactions', defaultSection: 'transactions', description: 'Employee requests, manager approvals, recalls, cancellations, encashments, workflow actions, and audit-ready transaction controls.' },
  { id: 'planning-and-balances', label: 'Planning & Balances', defaultSection: 'leave-calendar', description: 'Calendars, team coverage planning, balance administration, holiday controls, liability values, and scheduling governance.' },
  { id: 'administration', label: 'Administration', defaultSection: 'leave-types', description: 'Configurable leave types, policies, accruals, carry-forward, adjustments, year-end processing, RBAC, and compliance controls.' },
  { id: 'reports-and-analytics', label: 'Reports & Analytics', defaultSection: 'leave-reports', description: 'Operational reports, utilization, liability, trends, approval analytics, exports, and scheduled reporting.' },
];

const workspaceForSection = (section: string, payload: Payload | null) => {
  const direct = workspaces.find((item) => item.id === section);
  if (direct) return direct;
  const config = payload?.operationalSections.find((item) => item.id === section);
  return workspaces.find((item) => item.label === config?.area) || workspaces[0];
};

export default function LeaveManagementClient({ initialNow, initialSection = 'dashboard' }: { initialNow: string; initialSection?: string }) {
  const [role, setRole] = useState<LeaveRole>('Leave Administrator');
  const [section, setSection] = useState(initialSection);
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState('');
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [auditOpen, setAuditOpen] = useState(false);
  const [drilldown, setDrilldown] = useState<LeaveDrilldownPanel>(null);
  const [drilldownQuery, setDrilldownQuery] = useState('');

  const openDrilldown = (panel: LeaveDrilldownPanel) => {
    setDrilldownQuery('');
    setDrilldown(panel);
  };

  const activeSection = useMemo(() => payload?.operationalSections.find((item) => item.id === section) || payload?.operationalSections[0], [payload?.operationalSections, section]);
  const activeWorkspace = useMemo(() => workspaceForSection(section, payload), [payload, section]);
  const workspaceTabs = useMemo(() => (payload?.operationalSections || []).filter((item) => item.area === activeWorkspace.label && item.id !== 'dashboard'), [activeWorkspace.label, payload?.operationalSections]);

  const load = async (nextSection = section, nextRole = role) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/hris/leave-management?section=${encodeURIComponent(nextSection)}`, { headers: { 'x-hris-role': nextRole }, cache: 'no-store' });
      const json = (await res.json()) as ApiResponse<Payload>;
      if (!res.ok || json.status !== 'success' || !json.data) throw new Error(json.error || `Leave request failed (${res.status})`);
      setPayload(json.data);
      if (json.data.section !== nextSection) setSection(json.data.section);
    } catch (event) {
      setError(event instanceof Error ? event.message : 'Unable to load Leave Management');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(section, role);
  }, [section, role]);

  const runApplicationAction = async (applicationId: string, actionId: 'approve' | 'reject') => {
    setBusyAction(`${actionId}:${applicationId}`);
    setToast('');
    try {
      const res = await fetch('/api/hris/leave-management', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-hris-role': role },
        body: JSON.stringify({
          action: actionId,
          section,
          actor: role,
          record: applicationId,
          reason: `${actionId === 'approve' ? 'Approved' : 'Rejected'} from Leave Approval Queue`,
        }),
      });
      const json = (await res.json()) as ApiResponse<{ message: string; payload: Payload }>;
      if (!res.ok || json.status !== 'success' || !json.data) throw new Error(json.error || `${actionId} failed`);
      setToast(json.data.message);
      setPayload(json.data.payload);
    } catch (event) {
      setToast(event instanceof Error ? event.message : `${actionId} failed`);
    } finally {
      setBusyAction('');
    }
  };

  const runAction = async (action: LeaveAction) => {
    if (action.id === 'view-audit-trail' || action.id === 'view-history') {
      setAuditOpen(true);
      return;
    }
    setBusyAction(action.id);
    setToast('');
    try {
      const res = await fetch('/api/hris/leave-management', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-hris-role': role },
        body: JSON.stringify({
          action: action.id,
          section,
          actor: role,
          record: payload?.applications[0]?.id || section,
          reason: action.requiresReason ? `${action.label} requested from Leave Management` : undefined,
          comments: `${action.label} executed from ${activeSection?.label || section}`,
          days: action.id === 'encash' ? 3 : 1,
          approved: action.id === 'process-carry-forward' ? true : undefined,
        }),
      });
      const json = (await res.json()) as ApiResponse<{ message: string; payload: Payload }>;
      if (!res.ok || json.status !== 'success' || !json.data) throw new Error(json.error || `${action.label} failed`);
      setToast(json.data.message);
      setPayload(json.data.payload);
    } catch (event) {
      setToast(event instanceof Error ? event.message : `${action.label} failed`);
    } finally {
      setBusyAction('');
    }
  };

  const filteredApplications = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (payload?.applications || []).filter((item) => !q || [item.id, item.employeeId, item.fullName, item.department, item.leaveType, item.status, item.stage].some((value) => String(value || '').toLowerCase().includes(q)));
  }, [payload?.applications, query]);

  const filteredBalances = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (payload?.balances || []).filter((item) => !q || [item.employeeId, item.fullName, item.department, item.leaveType, item.status].some((value) => String(value || '').toLowerCase().includes(q)));
  }, [payload?.balances, query]);

  const isDashboard = section === 'dashboard';
  const isTransactionsHub = section === 'transactions';
  const primaryApplyAction = applyLeaveAction(payload?.actions || []);

  const navigateSection = (nextSection: string) => {
    setSection(nextSection);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A]" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div className="border-b border-[#E5E7EB] bg-white px-6 py-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-white">
                <CalendarCheck className="h-5 w-5" />
              </span>
              <h1 className="text-4xl font-bold tracking-tight">{isTransactionsHub ? 'Transactions' : 'Leave Management'}</h1>
            </div>
            <p className="mt-2 max-w-3xl text-sm text-[#64748B]">
              {isTransactionsHub
                ? 'Manage leave applications, approvals, recalls, cancellations, encashments, withdrawals, and transaction workflows.'
                : 'Manage employee leave requests, approvals, balances, planning, compliance, and workforce availability.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={role} onChange={(event) => setRole(event.target.value as LeaveRole)} className="h-10 rounded-lg border border-[#E5E7EB] bg-white px-3 text-xs font-semibold text-slate-800 outline-none">
              {roles.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            {!isTransactionsHub ? (
              <>
                <button
                  type="button"
                  onClick={() => navigateSection('leave-allowance-exceptions')}
                  className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-800 hover:bg-red-100"
                >
                  <AlertTriangle className="h-4 w-4" />
                  Allowance Exceptions{payload?.summary.allowanceExceptionCount ? ` (${payload.summary.allowanceExceptionCount})` : ''}
                </button>
                <button
                  type="button"
                  onClick={() => navigateSection('leave-reports')}
                  className="inline-flex items-center gap-2 rounded-lg border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  Generate Report
                </button>
                <button
                  type="button"
                  onClick={() => navigateSection('leave-calendar')}
                  className="inline-flex items-center gap-2 rounded-lg border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <CalendarDays className="h-4 w-4" />
                  View Leave Calendar
                </button>
              </>
            ) : null}
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => {
                window.location.href = '/api/hris/leave-management?format=csv';
              }}
              disabled={!payload?.permissions.canExport}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 ${
                isTransactionsHub ? 'bg-[#2563EB] text-white hover:bg-blue-700' : 'border border-[#E5E7EB] bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Download className="h-4 w-4" />
              Export
            </button>
            {!isTransactionsHub && primaryApplyAction ? (
              <button
                type="button"
                onClick={() => void runAction(primaryApplyAction)}
                disabled={busyAction === primaryApplyAction.id}
                className="inline-flex items-center gap-2 rounded-lg bg-[#2563EB] px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                <Plus className="h-4 w-4" />
                Apply Leave
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="space-y-4 px-6 py-5">
        <div className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-sm font-semibold text-[#0F172A]">Production workflow ready</p>
            <p className="mt-1 text-xs text-[#64748B]">
              {payload?.source || 'DLE Enterprise HRIS'} · {number(payload?.summary.totalEmployees)} employees · Generated {stableDateTime(payload?.generatedAt || initialNow)}
            </p>
          </div>
          <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#10B981]">Data Source: Live</span>
        </div>

        {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">{error}</div> : null}
        {toast ? <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-800">{toast}</div> : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <HubMetricCard
            label="Total Employees"
            value={number(payload?.summary.totalEmployees)}
            detail={isTransactionsHub ? 'Multi-company workforce scope' : 'Active workforce in scope'}
            icon={Users}
            tone="blue"
            onClick={() => openDrilldown({
              title: 'Total Employees',
              note: 'Active employees from DLE_Enterprise HRIS employee directory.',
              rows: payload?.drilldowns?.totalEmployees || [],
            })}
          />
          <HubMetricCard
            label="On Leave Today"
            value={number(payload?.summary.employeesOnLeave)}
            detail={isTransactionsHub ? 'Employees currently on approved leave today' : `${number(payload?.summary.returningToday)} returning today`}
            icon={CalendarClock}
            tone="green"
            onClick={() => openDrilldown({
              title: 'On Leave Today',
              note: 'Approved or completed leave applications where today falls within the leave period, plus employees marked On Leave in HRIS.',
              rows: payload?.drilldowns?.onLeaveToday || [],
            })}
          />
          <HubMetricCard
            label="HR Pending Approvals"
            value={number(payload?.summary.pendingHrApprovals)}
            detail={`${number(payload?.summary.pendingManagerApprovals)} awaiting manager review`}
            icon={ClipboardCheck}
            tone={(payload?.summary.pendingHrApprovals || 0) ? 'amber' : 'green'}
            onClick={() => openDrilldown({
              title: 'HR Pending Approvals',
              note: 'Leave applications awaiting HR review in DLE_Enterprise.',
              rows: payload?.drilldowns?.pendingHrApprovals || [],
            })}
          />
          <HubMetricCard
            label="Leave Utilization"
            value={`${number(payload?.summary.leaveUtilizationPct)}%`}
            detail={isTransactionsHub ? 'Annual leave used against accrued balance' : 'Annual leave used against accrued balance'}
            icon={FileSpreadsheet}
            tone="violet"
            onClick={() => openDrilldown({
              title: 'Leave Utilization Detail',
              note: 'Per-employee annual leave used vs accrued balances from hris.LeaveBalances.',
              rows: payload?.drilldowns?.leaveUtilization || [],
            })}
          />
        </div>

        <div className="overflow-x-auto rounded-xl border border-[#E5E7EB] bg-white p-2 shadow-sm">
          <div className="flex min-w-max gap-1">
            {workspaces.map((item) => (
              <Link
                key={item.id}
                href={`/hris/leave-management/${item.id}`}
                onClick={() => setSection(item.defaultSection)}
                className={`rounded-lg px-3 py-2 text-xs font-semibold whitespace-nowrap ${activeWorkspace.id === item.id ? 'bg-[#2563EB] text-white' : 'text-slate-700 hover:bg-slate-100'}`}
              >
                {item.label === 'Dashboard' ? 'Overview' : item.label}
              </Link>
            ))}
          </div>
        </div>

        {!isDashboard && !isTransactionsHub && workspaceTabs.length ? (
          <div className="flex gap-2 overflow-x-auto rounded-xl border border-[#E5E7EB] bg-white p-2 shadow-sm">
            {workspaceTabs.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={`h-9 shrink-0 rounded-lg px-3 text-xs font-semibold ${section === item.id ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}

        {!isDashboard && !isTransactionsHub ? (
          <div className="relative">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search leave requests, employees, departments, types..."
              className="h-11 w-full rounded-xl border border-[#E5E7EB] bg-white px-4 pr-10 text-sm font-medium outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
            />
            {query ? (
              <button type="button" onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        ) : null}

        {isDashboard ? (
          <LeaveCommandCenter
            payload={payload}
            onNavigate={navigateSection}
            onOpenDrilldown={openDrilldown}
            onAction={(actionId) => {
              const action = payload?.actions.find((item) => item.id === actionId);
              if (action) void runAction(action);
              else if (actionId === 'view-audit-trail') setAuditOpen(true);
            }}
          />
        ) : null}

        {!isDashboard && isTransactionsHub ? (
          <LeaveTransactionsCommandCenter
            payload={payload}
            busyAction={busyAction}
            onAction={(actionId) => {
              if (actionId === 'view-audit-trail' || actionId === 'view-history') {
                setAuditOpen(true);
                return;
              }
              const action = payload?.actions.find((item) => item.id === actionId || (actionId === 'apply' && item.id === 'create'));
              if (action) void runAction(action);
            }}
            onNavigate={navigateSection}
          />
        ) : null}
        {!isDashboard && section === 'applications' ? <ApplicationView rows={filteredApplications} /> : null}
        {!isDashboard && section === 'approvals' ? <ApprovalView rows={filteredApplications} busyAction={busyAction} onAction={(applicationId, actionId) => void runApplicationAction(applicationId, actionId)} /> : null}
        {!isDashboard && section === 'leave-calendar' ? <CalendarView payload={payload} /> : null}
        {!isDashboard && section === 'leave-balances' ? <BalanceView rows={filteredBalances} /> : null}
        {!isDashboard && section === 'leave-types' ? <LeaveTypeView payload={payload} /> : null}
        {!isDashboard && section === 'leave-allowance-exceptions' ? <LeaveAllowanceExceptionsView rows={payload?.allowanceExceptions || []} /> : null}
        {!isDashboard && ['recalls', 'cancellations', 'encashments', 'team-leave-planner', 'holiday-calendar', 'leave-policies', 'leave-accruals', 'carry-forward-processing', 'balance-adjustments', 'leave-year-end-processing', 'leave-reports', 'leave-utilization', 'leave-liability', 'leave-trends', 'approval-reports'].includes(section) ? (
          <OperationalView payload={payload} section={section} />
        ) : null}
      </div>

      {auditOpen ? <AuditPanel rows={payload?.auditTrail || []} onClose={() => setAuditOpen(false)} /> : null}
      <LeaveDrilldownModal
        panel={drilldown}
        query={drilldownQuery}
        onQueryChange={setDrilldownQuery}
        onClose={() => {
          setDrilldown(null);
          setDrilldownQuery('');
        }}
      />
    </div>
  );
}


function ApplicationView({ rows }: { rows: AppRecord[] }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <TableHeader title="Leave Applications" detail="Draft, submitted, review, approved, rejected, withdrawn, cancelled, and completed requests." />
      <div className="overflow-x-auto">
        <table className="min-w-[1180px] w-full divide-y divide-slate-100">
          <thead className="bg-slate-50"><tr>{['Request', 'Employee', 'Type', 'Dates', 'Days', 'Balance', 'Stage', 'Compliance', 'Allowance', 'Exceptions'].map((header) => <th key={header} className="px-4 py-3 text-left text-xs font-black uppercase text-slate-500">{header}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100 bg-white">{rows.map((item) => <ApplicationRow key={item.id} item={item} />)}</tbody>
        </table>
      </div>
    </section>
  );
}

function ApprovalView({ rows, busyAction, onAction }: { rows: AppRecord[]; busyAction: string; onAction: (applicationId: string, action: 'approve' | 'reject') => void }) {
  const approvalRows = rows.filter((item) => !['Approved', 'Completed', 'Cancelled', 'Rejected', 'Terminated'].includes(item.status));
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <TableHeader title="Leave Approval Queue" detail="Employee -> Supervisor -> Manager -> HR -> Final Approval, with configurable matrix controls." />
      <div className="overflow-x-auto">
        <table className="min-w-[1240px] w-full divide-y divide-slate-100">
          <thead className="bg-slate-50"><tr>{['Request', 'Employee', 'Manager', 'Type', 'Duration', 'Approval Status', 'Stage', 'Action Risk', 'Actions'].map((header) => <th key={header} className="px-4 py-3 text-left text-xs font-black uppercase text-slate-500">{header}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100 bg-white">{approvalRows.map((item) => (
            <tr key={item.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 text-sm font-black text-slate-900">{item.id}</td>
              <td className="px-4 py-3"><div className="font-black text-slate-950">{item.fullName}</div><div className="text-xs font-semibold text-slate-500">{item.department}</div></td>
              <td className="px-4 py-3 text-sm font-bold text-slate-700">{item.managerName}</td>
              <td className="px-4 py-3 text-sm font-bold text-slate-700">{item.leaveType}</td>
              <td className="px-4 py-3 text-sm font-bold text-slate-700">{item.days} days<br /><span className="text-xs font-semibold text-slate-500">{item.startDate} to {item.endDate}</span></td>
              <td className="px-4 py-3"><Chip value={item.approvalStatus} /></td>
              <td className="px-4 py-3 text-sm font-bold text-slate-700">{item.stage}</td>
              <td className="px-4 py-3"><Chip value={item.policyComplianceStatus} /></td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={busyAction === `approve:${item.id}`} onClick={() => onAction(item.id, 'approve')} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:bg-slate-200 disabled:text-slate-500">Approve</button>
                  <button type="button" disabled={busyAction === `reject:${item.id}`} onClick={() => onAction(item.id, 'reject')} className="rounded-lg bg-red-600 px-3 py-2 text-xs font-black text-white disabled:bg-slate-200 disabled:text-slate-500">Reject</button>
                </div>
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  );
}

function CalendarView({ payload }: { payload: Payload | null }) {
  return (
    <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <InfoList title="Published Leave Calendar" icon={CalendarDays} rows={payload?.calendar || []} primaryKey="label" secondaryKeys={['from', 'to', 'department', 'location', 'status']} />
      <InfoList title="Blocked & Reserved Periods" icon={Archive} rows={payload?.blockedPeriods || []} primaryKey="name" secondaryKeys={['from', 'to', 'scope', 'status']} />
    </section>
  );
}

function BalanceView({ rows }: { rows: BalanceRecord[] }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <TableHeader title="Leave Balance Administration" detail="Current, accrued, used, pending, forfeited, carry-forward, liability, history, imports, exports, and recalculation readiness." />
      <div className="overflow-x-auto">
        <table className="min-w-[1120px] w-full divide-y divide-slate-100">
          <thead className="bg-slate-50"><tr>{['Employee', 'Type', 'Current', 'Accrued', 'Used', 'Pending', 'Forfeited', 'Carry Forward', 'Liability', 'Status'].map((header) => <th key={header} className="px-4 py-3 text-left text-xs font-black uppercase text-slate-500">{header}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100 bg-white">{rows.slice(0, 80).map((item) => <tr key={`${item.employeeId}-${item.leaveType}`} className="hover:bg-slate-50"><td className="px-4 py-3"><div className="font-black text-slate-950">{item.fullName}</div><div className="text-xs font-semibold text-slate-500">{item.employeeId} - {item.department}</div></td><td className="px-4 py-3 text-sm font-bold text-slate-700">{item.leaveType}</td><td className="px-4 py-3 text-sm font-black text-slate-900">{item.currentBalance}</td><td className="px-4 py-3 text-sm font-bold text-slate-700">{item.accruedBalance}</td><td className="px-4 py-3 text-sm font-bold text-slate-700">{item.usedBalance}</td><td className="px-4 py-3 text-sm font-bold text-slate-700">{item.pendingBalance}</td><td className="px-4 py-3 text-sm font-bold text-slate-700">{item.forfeitedBalance}</td><td className="px-4 py-3 text-sm font-bold text-slate-700">{item.carryForwardBalance}</td><td className="px-4 py-3 text-sm font-black text-slate-900">{money(item.liabilityValue)}</td><td className="px-4 py-3"><Chip value={item.status} /></td></tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}

function LeaveTypeView({ payload }: { payload: Payload | null }) {
  const rows = payload?.leaveTypes || [];
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <TableHeader title="Leave Types" detail="Centralized configurable records for statutory, company, unpaid, paid, evidence-based, and future leave categories." />
      <div className="overflow-x-auto">
        <table className="min-w-[1200px] w-full divide-y divide-slate-100">
          <thead className="bg-slate-50"><tr>{['Leave Type', 'Entitlement', 'Eligibility', 'Categories', 'Documents', 'Approvals', 'Accrual', 'Carry Forward', 'Allowance', 'Status'].map((header) => <th key={header} className="px-4 py-3 text-left text-xs font-black uppercase text-slate-500">{header}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {rows.map((item) => (
              <tr key={item.id} className="hover:bg-slate-50">
                <td className="px-4 py-3"><div className="font-black text-slate-950">{item.name}</div><div className="text-xs font-semibold text-slate-500">{item.genderRestriction} eligibility</div></td>
                <td className="px-4 py-3 text-sm font-black text-slate-900">{item.entitlementDays} {item.durationBasis.toLowerCase()}</td>
                <td className="px-4 py-3 text-xs font-semibold text-slate-600">{item.eligibility}</td>
                <td className="px-4 py-3 text-xs font-semibold text-slate-600">{item.categoryRestrictions.join(', ') || 'All'}</td>
                <td className="px-4 py-3 text-xs font-semibold text-slate-600">{item.documentRequirements.join(', ') || 'None'}</td>
                <td className="px-4 py-3 text-xs font-semibold text-slate-600">{item.approvalLevels.join(' -> ')}</td>
                <td className="px-4 py-3 text-xs font-semibold text-slate-600">{item.accrualRule}</td>
                <td className="px-4 py-3 text-xs font-semibold text-slate-600">{item.carryForwardRule}</td>
                <td className="px-4 py-3 text-xs font-semibold text-slate-600">{item.allowanceRule}</td>
                <td className="px-4 py-3"><Chip value={item.active ? 'Active' : 'Inactive'} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function LeaveAllowanceExceptionsView({ rows }: { rows: AllowanceExceptionRecord[] }) {
  const critical = rows.filter((item) => item.severity === 'Critical');
  const pending = rows.filter((item) => item.severity === 'Pending');
  return (
    <section className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <p className="text-xs font-black uppercase tracking-wide text-red-700">Policy Exceptions</p>
          <p className="mt-2 text-3xl font-black text-red-900">{critical.length}</p>
          <p className="mt-1 text-sm font-medium text-red-800">Reversed or ineligible payroll leave allowance postings.</p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-black uppercase tracking-wide text-amber-700">Pending Payroll</p>
          <p className="mt-2 text-3xl font-black text-amber-900">{pending.length}</p>
          <p className="mt-1 text-sm font-medium text-amber-800">Approved annual leave eligible for leave allowance posting.</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-black uppercase tracking-wide text-slate-500">Export</p>
          <button
            type="button"
            onClick={() => { window.location.href = '/api/hris/leave-management?format=allowance-exceptions-csv'; }}
            className="mt-3 inline-flex h-10 items-center rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Download CSV
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <TableHeader title="Leave Allowance Exceptions Report" detail="Validated against approved annual leave days and the 10-working-day leave allowance policy." />
        <div className="overflow-x-auto">
          <table className="min-w-[1280px] w-full divide-y divide-slate-100">
            <thead className="bg-slate-50">
              <tr>
                {['Severity', 'Employee', 'Department', 'Period', 'Request Days', 'Approved Days', 'Amount', 'Status', 'Linked Request', 'Recommendation'].map((header) => (
                  <th key={header} className="px-4 py-3 text-left text-xs font-black uppercase text-slate-500">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {rows.length ? rows.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3"><Chip value={item.severity} /></td>
                  <td className="px-4 py-3"><div className="font-black text-slate-950">{item.fullName}</div><div className="text-xs font-semibold text-slate-500">{item.employeeId}</div></td>
                  <td className="px-4 py-3 text-sm font-bold text-slate-700">{item.department}</td>
                  <td className="px-4 py-3 text-sm font-bold text-slate-700">{item.payrollPeriod}<div className="text-xs font-semibold text-slate-500">{item.leaveYear}</div></td>
                  <td className="px-4 py-3 text-sm font-black text-slate-900">{item.requestDays}</td>
                  <td className="px-4 py-3 text-sm font-black text-slate-900">{item.approvedAnnualLeaveDays}</td>
                  <td className="px-4 py-3 text-sm font-bold text-slate-700">{item.allowanceAmount > 0 ? new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(item.allowanceAmount) : '—'}</td>
                  <td className="px-4 py-3 text-xs font-semibold text-slate-600">{item.allowanceStatus}</td>
                  <td className="px-4 py-3 text-xs font-semibold text-slate-600">{item.linkedRequestId || '—'}</td>
                  <td className="px-4 py-3 text-xs font-semibold text-slate-600">{item.recommendation}</td>
                </tr>
              )) : (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-sm font-semibold text-slate-500">No leave allowance exceptions or pending payroll items.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function OperationalView({ payload, section }: { payload: Payload | null; section: string }) {
  const config = payload?.operationalSections.find((item) => item.id === section);
  const rows = (config?.reports?.length ? config.reports.map((item) => ({ control: item, value: 'Report-ready' })) : config?.controls.map((item) => ({ control: item, value: 'Configured' }))) || [];
  return <InfoList title={config?.label || 'Leave Operations'} icon={CheckCircle2} rows={rows} primaryKey="control" secondaryKeys={['value']} />;
}

function ApplicationRow({ item }: { item: AppRecord }) {
  return (
    <tr className="hover:bg-slate-50">
      <td className="px-4 py-3"><div className="font-black text-slate-950">{item.id}</div><div className="text-xs font-semibold text-slate-500">{item.status}</div></td>
      <td className="px-4 py-3"><div className="font-black text-slate-950">{item.fullName}</div><div className="text-xs font-semibold text-slate-500">{item.employeeId} - {item.department}</div></td>
      <td className="px-4 py-3 text-sm font-bold text-slate-700">{item.leaveType}</td>
      <td className="px-4 py-3 text-sm font-bold text-slate-700">{item.startDate} to {item.endDate}</td>
      <td className="px-4 py-3 text-sm font-black text-slate-900">{item.days}</td>
      <td className="px-4 py-3 text-sm font-bold text-slate-700">{item.availableBalance} available, {item.balanceImpact} impact</td>
      <td className="px-4 py-3 text-sm font-bold text-slate-700">{item.stage}</td>
      <td className="px-4 py-3"><Chip value={item.policyComplianceStatus} /></td>
      <td className="px-4 py-3 text-xs font-semibold text-slate-600">{item.allowanceStatus || 'Not eligible'}</td>
      <td className="px-4 py-3 text-xs font-semibold text-slate-600">{item.exceptions.length ? item.exceptions.join(', ') : 'None'}</td>
    </tr>
  );
}

function InfoList({ title, icon: Icon, rows, primaryKey, secondaryKeys }: { title: string; icon: any; rows: Array<Record<string, any>>; primaryKey: string; secondaryKeys: string[] }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-black text-slate-950">{title}</h3>
        <Icon className="h-5 w-5 text-slate-400" />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        {rows.map((row, index) => (
          <div key={`${String(row[primaryKey])}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-sm font-black text-slate-950">{String(row[primaryKey] || '')}</p>
            <p className="mt-1 text-xs font-semibold text-slate-600">{secondaryKeys.map((key) => row[key]).filter(Boolean).join(' - ')}</p>
          </div>
        ))}
        {!rows.length ? <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-500">No records available.</div> : null}
      </div>
    </section>
  );
}

function TableHeader({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="border-b border-slate-100 p-4">
      <h3 className="text-base font-black text-slate-950">{title}</h3>
      <p className="mt-1 text-xs font-semibold text-slate-500">{detail}</p>
    </div>
  );
}

function Chip({ value }: { value: string }) {
  const styles = toneStyles[statusTone(value)];
  return <span className={`rounded-full px-2.5 py-1 text-xs font-black ${styles.chip}`}>{value}</span>;
}

function AuditPanel({ rows, onClose }: { rows: AuditEntry[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="max-h-[86vh] w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 p-4">
          <div>
            <h3 className="text-lg font-black text-slate-950">Leave Audit Trail</h3>
            <p className="mt-1 text-xs font-semibold text-slate-500">User, action, time, old value, new value, comments, reason, and workflow history.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"><X className="h-4 w-4" /></button>
        </div>
        <div className="max-h-[65vh] overflow-y-auto p-4">
          <div className="space-y-3">
            {rows.length ? rows.map((item) => (
              <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-black text-slate-950">{item.action} - {item.record}</p>
                  <span className="text-xs font-bold text-slate-500">{stableDateTime(item.at)}</span>
                </div>
                <p className="mt-1 text-xs font-semibold text-slate-600">{item.user} / {item.role}</p>
                <p className="mt-2 text-xs font-semibold text-slate-700">{item.newValue || item.comments || 'Action logged'}</p>
                {item.reason ? <p className="mt-1 text-xs font-bold text-amber-700">Reason: {item.reason}</p> : null}
              </div>
            )) : <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-500">No leave audit actions have been logged in this session yet.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
