'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  Banknote,
  Download,
  FileSpreadsheet,
  History,
  Plus,
  Printer,
  RefreshCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  TimerReset,
  X,
} from 'lucide-react';
import { MetadataPill } from '../../payroll/employee-salary-setup/salary-setup-ui';
import {
  EmployeeAvatar,
  OvertimeEmptyState,
  OvertimeFormField,
  OvertimeKpiStrip,
  OvertimePageIcon,
  OvertimePanel,
  OvertimeQuickLinks,
  OvertimeStatusBadge,
  OvertimeSummaryList,
  OvertimeWorkflowProgress,
  RowActionsButton,
  ValidationOkBanner,
  overtimeStatusDisplay,
} from './overtime-management-ui';

type Tone = 'blue' | 'green' | 'amber' | 'red' | 'violet' | 'cyan' | 'slate';

export type EnterpriseOvertimeRecord = {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  jobTitle: string;
  location: string;
  date: string;
  dayType: string;
  workedHours: number;
  payableHours: number;
  grossPay: number;
  currentOwner: string;
  timesheetStatus: string;
  status: string;
  issues: string[];
  hourlyRate: number;
  multiplier: number;
  earningCode: string;
  workflow: Array<{ stage: string; status: string; owner: string; actedAt: string | null }>;
  auditTrail: Array<{ id: string; at: string; actor: string; role: string; action: string; oldStatus: string | null; newStatus: string; comment: string | null }>;
};

export type EnterpriseAuthorizationRequest = {
  id: string;
  projectCode: string;
  projectName: string;
  workDate: string;
  supervisorName: string;
  supervisorCode: string;
  workCenter: string;
  requestedHours: number;
  requestedHeadcount: number;
  currentOwnerName: string;
  currentOwnerRole: string;
  status: string;
};

export type OvertimeManagementEnterpriseViewProps = {
  initialNow: string;
  loading: boolean;
  error: string;
  toast: string;
  payloadGeneratedAt?: string;
  databaseAvailable?: boolean;
  role: string;
  roles: string[];
  onRoleChange: (role: string) => void;
  onRefresh: () => void;
  onExport: () => void;
  canExport: boolean;
  showRequest: boolean;
  onToggleRequest: () => void;
  summary: {
    records: number;
    pendingApprovals: number;
    submitted: number;
    supervisorApproved: number;
    payrollReady: number;
    payrollPosted: number;
    blocked: number;
    returned: number;
    rejected: number;
    payableHours: number;
    grossPay: number;
  };
  canViewMoney: boolean;
  authorizationRequests: EnterpriseAuthorizationRequest[];
  approvedAuthorizationCount: number;
  authorizationForm: ReactNode;
  authorizationModalOpen: boolean;
  onOpenAuthorization: () => void;
  onCloseAuthorization: () => void;
  onSubmitAuthorization: () => void;
  authorizationBusy: boolean;
  onApproveAuthorization: (id: string) => void;
  onRejectAuthorization: (id: string) => void;
  authorizationActionBusy: boolean;
  selectedAuthIds: Set<string>;
  onToggleAuthRow: (id: string) => void;
  onToggleSelectAllAuthRows: (checked: boolean) => void;
  onBulkAuthorization: (decision: 'approve' | 'reject') => void;
  bulkAuthorizationBusy: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  status: string;
  onStatusChange: (value: string) => void;
  department: string;
  onDepartmentChange: (value: string) => void;
  location: string;
  onLocationChange: (value: string) => void;
  dayType: string;
  onDayTypeChange: (value: string) => void;
  statusOptions: string[];
  departmentOptions: string[];
  locationOptions: string[];
  dayTypeOptions: string[];
  selectedRowsCount: number;
  filteredCount: number;
  onBulkAction: (action: string) => void;
  bulkBusy: boolean;
  records: EnterpriseOvertimeRecord[];
  selectedId: string;
  onSelectRecord: (id: string) => void;
  selected: EnterpriseOvertimeRecord | null;
  selectedRows: Set<string>;
  onToggleRow: (id: string) => void;
  comment: string;
  onCommentChange: (value: string) => void;
  allowedActions: string[];
  actionLabels: Record<string, string>;
  onRunAction: (action: string) => void;
  actionBusy: string;
  money: (value: number) => string;
  number: (value: number) => string;
  newRequestPanel?: ReactNode;
};

const inputClass =
  'h-11 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm font-medium text-[#0F172A] outline-none transition-shadow focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20';
const readOnlyClass =
  'h-11 w-full rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] px-3 text-sm font-medium text-[#475569] outline-none';

const AUTHORIZATION_STAGES = ['Submitted', 'Project Manager Approved', 'GM Operations Approved', 'HR Approved'] as const;
const STAGE_SHORT: Record<string, string> = {
  Submitted: 'Sup',
  'Project Manager Approved': 'PM',
  'GM Operations Approved': 'GM',
  'HR Approved': 'HR',
};

function AuthorizationStageTrack({ status }: { status: string }) {
  const rejected = status === 'Rejected' || status === 'Cancelled';
  const currentIndex = AUTHORIZATION_STAGES.indexOf(status as (typeof AUTHORIZATION_STAGES)[number]);
  const legacyDone = status === 'MD Approved';
  return (
    <div className="flex items-center gap-1">
      {AUTHORIZATION_STAGES.map((stage, index) => {
        const done = legacyDone || (currentIndex >= 0 && index <= currentIndex);
        const isCurrent = currentIndex >= 0 && index === currentIndex;
        const color = rejected
          ? 'bg-[#FEE2E2] text-[#B91C1C] border-[#FECACA]'
          : done
          ? 'bg-[#DCFCE7] text-[#166534] border-[#BBF7D0]'
          : isCurrent
          ? 'bg-[#DBEAFE] text-[#1D4ED8] border-[#93C5FD]'
          : 'bg-white text-[#94A3B8] border-[#E5E7EB]';
        return (
          <span key={stage} title={stage} className={`inline-flex h-6 min-w-[34px] items-center justify-center rounded-md border px-1.5 text-[10px] font-bold ${color}`}>
            {STAGE_SHORT[stage]}
          </span>
        );
      })}
    </div>
  );
}

export function OvertimeManagementEnterpriseView(props: OvertimeManagementEnterpriseViewProps) {
  const pendingAuthorizationIds = props.authorizationRequests
    .filter((item) => !['HR Approved', 'MD Approved', 'Rejected', 'Cancelled'].includes(item.status))
    .map((item) => item.id);
  const pendingAuthorizationCount = pendingAuthorizationIds.length;
  const allPendingSelected =
    pendingAuthorizationCount > 0 && pendingAuthorizationIds.every((id) => props.selectedAuthIds.has(id));
  const somePendingSelected =
    pendingAuthorizationIds.some((id) => props.selectedAuthIds.has(id)) && !allPendingSelected;
  const kpiItems = [
    {
      label: 'Overtime Requests',
      value: props.number(props.summary.records),
      subtitle: 'Open / Unsent requests',
      icon: TimerReset,
      tone: 'violet' as Tone,
      trend: 2.4,
    },
    {
      label: 'Pending Approvals',
      value: props.number(props.summary.pendingApprovals),
      subtitle: `${props.number(props.summary.submitted)} supervisor · ${props.number(props.summary.supervisorApproved)} HR`,
      icon: BadgeCheck,
      tone: (props.summary.pendingApprovals ? 'amber' : 'green') as Tone,
      trend: props.summary.pendingApprovals ? -1.2 : 4.1,
    },
    {
      label: 'Payroll Ready',
      value: props.number(props.summary.payrollReady),
      subtitle: `${props.number(props.summary.payrollPosted)} queued`,
      icon: Banknote,
      tone: 'green' as Tone,
      trend: 3.8,
    },
    {
      label: 'Blocked / Returned',
      value: props.number(props.summary.blocked + props.summary.returned),
      subtitle: `${props.number(props.summary.rejected)} returned`,
      icon: AlertTriangle,
      tone: (props.summary.blocked || props.summary.returned ? 'red' : 'green') as Tone,
      trend: -0.5,
    },
    {
      label: 'Gross Estimated',
      value: props.money(props.summary.grossPay),
      subtitle: `${props.number(props.summary.payableHours)} Hours`,
      icon: ShieldCheck,
      tone: 'cyan' as Tone,
      trend: null,
    },
  ];

  return (
    <div className="min-h-full bg-[#F8FAFC] pb-8">
      <div className="mx-auto max-w-[1680px] px-6 pt-6">
        {/* Page header */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-start gap-4">
              <OvertimePageIcon />
              <div>
                <h1 className="text-[32px] font-bold leading-tight tracking-tight text-[#0F172A]">Overtime Management</h1>
                <p className="mt-2 max-w-4xl text-[15px] font-medium leading-[1.4] text-[#475569]">
                  Request, validate, approve, track and release overtime from approved timesheets into payroll-ready processing with full audit control.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <MetadataPill
                    label="Last updated"
                    value={new Date(props.payloadGeneratedAt || props.initialNow).toLocaleString('en-GB')}
                  />
                  <span className="inline-flex items-center rounded-full border border-[#93C5FD] bg-[#DBEAFE] px-3 py-1.5 text-xs font-semibold text-[#1D4ED8]">
                    HRIS DB: {props.databaseAvailable ? 'Available' : 'Checking'}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={props.onToggleRequest}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#10B981] px-4 text-sm font-semibold text-white shadow-sm hover:bg-[#059669]"
            >
              <Plus className="h-4 w-4" />
              New Overtime Request
            </button>
            <button
              type="button"
              onClick={props.onRefresh}
              disabled={props.loading}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#2563EB] px-4 text-sm font-semibold text-white shadow-sm hover:bg-[#1D4ED8] disabled:opacity-60"
            >
              <RefreshCcw className={`h-4 w-4 ${props.loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              type="button"
              onClick={props.onExport}
              disabled={!props.canExport}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-4 text-sm font-semibold text-[#0F172A] hover:bg-[#F1F5F9] disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Export
            </button>
          </div>
        </div>

        {props.error ? (
          <div className="mt-5 rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm font-semibold text-[#B91C1C]">{props.error}</div>
        ) : null}
        {props.toast ? (
          <div className="mt-5 rounded-xl border border-[#93C5FD] bg-[#DBEAFE] px-4 py-3 text-sm font-semibold text-[#1D4ED8]">{props.toast}</div>
        ) : null}

        {props.showRequest && props.newRequestPanel ? <div className="mt-6">{props.newRequestPanel}</div> : null}

        {/* Pre-overtime authorization */}
        <div className="mt-6">
          <OvertimePanel
            title="Pre-Overtime Authorization"
            subtitle="Supervisor books & submits, Project Manager approves, GM Operations approves, then HR verifies & approves."
            actions={
              <>
                <span className="rounded-full border border-[#93C5FD] bg-[#DBEAFE] px-3 py-1 text-xs font-bold text-[#1D4ED8]">
                  {props.authorizationRequests.length} requests
                </span>
                <span className="rounded-full border border-[#A7F3D0] bg-[#ECFDF5] px-3 py-1 text-xs font-bold text-[#047857]">
                  {props.approvedAuthorizationCount} supervisor-ready
                </span>
              </>
            }
          >
            {props.role === 'Super Administrator' || props.role === 'Administrator' ? (
              <div className="mb-4 flex items-center gap-2 rounded-[14px] border border-[#FCD34D] bg-[#FFFBEB] px-4 py-3 text-xs font-semibold text-[#92400E]">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                Testing phase: as {props.role}, approving any request completes the full chain (Supervisor → PM → GM Operations → HR) in one step and posts overtime to the employees&apos; timesheets.
              </div>
            ) : null}
            {pendingAuthorizationCount ? (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-[#E5E7EB] bg-[#F8FAFC] px-4 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-[#475569]">
                    <input
                      type="checkbox"
                      checked={allPendingSelected}
                      ref={(element) => {
                        if (element) element.indeterminate = somePendingSelected;
                      }}
                      onChange={(event) => props.onToggleSelectAllAuthRows(event.target.checked)}
                      className="rounded border-[#CBD5E1]"
                      aria-label="Select all awaiting overtime authorizations"
                    />
                    Select all awaiting
                  </label>
                  <p className="text-xs font-semibold text-[#475569]">
                    {props.selectedAuthIds.size} selected · {pendingAuthorizationCount} awaiting your decision
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => props.onBulkAuthorization('approve')}
                    disabled={!props.selectedAuthIds.size || props.bulkAuthorizationBusy}
                    className="inline-flex h-9 items-center gap-2 rounded-xl bg-[#10B981] px-3 text-xs font-semibold text-white hover:bg-[#059669] disabled:opacity-40"
                  >
                    <BadgeCheck className="h-4 w-4" />
                    Bulk Approve{props.selectedAuthIds.size ? ` (${props.selectedAuthIds.size})` : ''}
                  </button>
                  <button
                    type="button"
                    onClick={() => props.onBulkAuthorization('reject')}
                    disabled={!props.selectedAuthIds.size || props.bulkAuthorizationBusy}
                    className="inline-flex h-9 items-center gap-2 rounded-xl border border-[#FECACA] bg-white px-3 text-xs font-semibold text-[#DC2626] hover:bg-[#FEF2F2] disabled:opacity-40"
                  >
                    Bulk Reject{props.selectedAuthIds.size ? ` (${props.selectedAuthIds.size})` : ''}
                  </button>
                </div>
              </div>
            ) : null}
            <div className="overflow-x-auto rounded-[16px] border border-[#EDF2F7]">
              <table className="min-w-[1040px] w-full text-left">
                <thead className="sticky top-0 bg-[#F8FAFC] text-[13px] font-semibold uppercase tracking-wide text-[#64748B]">
                  <tr>
                    <th className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={allPendingSelected}
                        ref={(element) => {
                          if (element) element.indeterminate = somePendingSelected;
                        }}
                        disabled={!pendingAuthorizationCount}
                        onChange={(event) => props.onToggleSelectAllAuthRows(event.target.checked)}
                        className="rounded border-[#CBD5E1] disabled:opacity-30"
                        aria-label="Select all awaiting overtime authorizations"
                        title="Select all awaiting decision"
                      />
                    </th>
                    {['Project ID', 'Date', 'Employees', 'Hours', 'Approval Stage', 'Status', 'Action'].map((head) => (
                      <th key={head} className="px-4 py-3">
                        {head}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EDF2F7] bg-white text-[15px]">
                  {props.authorizationRequests.map((item) => {
                    const actionable = !['HR Approved', 'MD Approved', 'Rejected', 'Cancelled'].includes(item.status);
                    return (
                    <tr key={item.id} className={`hover:bg-[#F8FAFC] ${props.selectedAuthIds.has(item.id) ? 'bg-[#EFF6FF]' : ''}`}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={props.selectedAuthIds.has(item.id)}
                          disabled={!actionable}
                          onChange={() => props.onToggleAuthRow(item.id)}
                          className="rounded border-[#CBD5E1] disabled:opacity-30"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-[#0F172A]">{item.projectCode}</div>
                        <div className="text-xs text-[#64748B]">{item.projectName}</div>
                      </td>
                      <td className="px-4 py-3 font-medium text-[#475569]">{item.workDate}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-[#0F172A]">{item.supervisorName}</div>
                        <div className="text-xs text-[#64748B]">
                          {item.requestedHeadcount} employee{item.requestedHeadcount === 1 ? '' : 's'}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-bold text-[#0F172A]">{props.number(item.requestedHours)}h</td>
                      <td className="px-4 py-3">
                        <AuthorizationStageTrack status={item.status} />
                      </td>
                      <td className="px-4 py-3">
                        <OvertimeStatusBadge status={item.status} />
                      </td>
                      <td className="px-4 py-3">
                        {actionable ? (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => props.onApproveAuthorization(item.id)}
                              disabled={props.authorizationActionBusy}
                              className="rounded-xl bg-[#10B981] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#059669] disabled:opacity-50"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => props.onRejectAuthorization(item.id)}
                              disabled={props.authorizationActionBusy}
                              className="rounded-xl bg-[#EF4444] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#DC2626] disabled:opacity-50"
                            >
                              Reject
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs font-medium text-[#94A3B8]">No pending action</span>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                  {!props.authorizationRequests.length ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8">
                        <OvertimeEmptyState title="No authorization requests yet." description="Click New Overtime Request to book and submit overtime." />
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </OvertimePanel>
        </div>

        {/* KPI strip */}
        <div className="mt-6">
          <OvertimeKpiStrip items={kpiItems} />
        </div>

        {/* Search & filter toolbar */}
        <section className="mt-6 rounded-[18px] border border-[#E5E7EB] bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_repeat(4,minmax(140px,180px))]">
            <label className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
              <input
                value={props.query}
                onChange={(e) => props.onQueryChange(e.target.value)}
                placeholder="Search employee..."
                className={`${inputClass} pl-10 pr-10`}
              />
              {props.query ? (
                <button type="button" onClick={() => props.onQueryChange('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#0F172A]">
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </label>
            <select value={props.status} onChange={(e) => props.onStatusChange(e.target.value)} className={inputClass}>
              <option value="All">Status</option>
              {props.statusOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {overtimeStatusDisplay(opt).label}
                </option>
              ))}
            </select>
            <select value={props.department} onChange={(e) => props.onDepartmentChange(e.target.value)} className={inputClass}>
              <option value="All">Department</option>
              {props.departmentOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
            <select value={props.location} onChange={(e) => props.onLocationChange(e.target.value)} className={inputClass}>
              <option value="All">Location</option>
              {props.locationOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
            <select value={props.dayType} onChange={(e) => props.onDayTypeChange(e.target.value)} className={inputClass}>
              <option value="All">Overtime Type</option>
              {props.dayTypeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[#EDF2F7] pt-3">
            <p className="text-xs font-medium text-[#64748B]">
              {props.selectedRowsCount} selected · {props.filteredCount} visible
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={props.onExport} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs font-semibold text-[#475569] hover:bg-[#F8FAFC]">
                <FileSpreadsheet className="h-4 w-4" />
                Export to Excel
              </button>
              <button type="button" className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs font-semibold text-[#475569] hover:bg-[#F8FAFC]">
                <History className="h-4 w-4" />
                View Audit Trail
              </button>
              <button
                type="button"
                onClick={() => props.onBulkAction('approve-supervisor')}
                disabled={!props.selectedRowsCount || props.bulkBusy}
                className="inline-flex h-10 items-center rounded-xl bg-[#2563EB] px-3 text-xs font-semibold text-white hover:bg-[#1D4ED8] disabled:opacity-40"
              >
                Batch Approve
              </button>
              <button type="button" className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs font-semibold text-[#475569] hover:bg-[#F8FAFC]">
                <Printer className="h-4 w-4" />
                Print Payroll
              </button>
            </div>
          </div>
        </section>

        {/* Main grid: register + sidebar */}
        <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[1fr_420px]">
          <section className="overflow-hidden rounded-[18px] border border-[#E5E7EB] bg-white shadow-[0_8px_20px_rgba(15,23,42,0.05)]">
            <div className="border-b border-[#EDF2F7] px-5 py-4">
              <h2 className="text-xl font-semibold text-[#0F172A]">Overtime Register</h2>
              <p className="mt-1 text-xs font-medium text-[#64748B]">Timesheet overtime lines with workflow status, owner, pay impact, and exception posture.</p>
            </div>
            <div className="max-h-[640px] overflow-auto">
              <table className="min-w-[1200px] w-full text-left">
                <thead className="sticky top-0 z-10 bg-[#F8FAFC] text-[13px] font-semibold uppercase tracking-wide text-[#64748B]">
                  <tr>
                    {[
                      { id: 'select', label: '' },
                      { id: 'employee', label: 'Employee' },
                      { id: 'date', label: 'Date' },
                      { id: 'type', label: 'Overtime Type' },
                      { id: 'hours', label: 'Hours' },
                      { id: 'payable', label: 'Payable' },
                      { id: 'gross', label: 'Gross' },
                      { id: 'owner', label: 'Owner' },
                      { id: 'timesheet', label: 'Timesheet' },
                      { id: 'workflow', label: 'Workflow' },
                      { id: 'status', label: 'Status' },
                      { id: 'actions', label: '' },
                    ].map((head) => (
                      <th key={head.id} className={`px-3 py-3 ${head.id === 'employee' ? 'sticky left-0 z-20 bg-[#F8FAFC]' : ''}`}>
                        {head.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EDF2F7] text-[15px]">
                  {props.records.map((record) => {
                    const selected = props.selected?.id === record.id;
                    const checked = props.selectedRows.has(record.id);
                    return (
                      <tr
                        key={record.id}
                        onClick={() => props.onSelectRecord(record.id)}
                        className={`cursor-pointer transition-colors hover:bg-[#F8FAFC] ${selected ? 'bg-[#EFF6FF]' : ''}`}
                      >
                        <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={checked} onChange={() => props.onToggleRow(record.id)} className="rounded border-[#CBD5E1]" />
                        </td>
                        <td className={`sticky left-0 z-[1] px-3 py-3 ${selected ? 'bg-[#EFF6FF]' : 'bg-white'}`}>
                          <div className="flex items-center gap-3">
                            <EmployeeAvatar name={record.employeeName} />
                            <div>
                              <div className="font-semibold text-[#0F172A]">{record.employeeName}</div>
                              <div className="text-xs font-medium text-[#64748B]">
                                {record.employeeId} · {record.department}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 font-medium text-[#475569]">{record.date}</td>
                        <td className="px-3 py-3">
                          <span className="rounded-full border border-[#A5F3FC] bg-[#ECFEFF] px-2.5 py-0.5 text-[11px] font-semibold text-[#0891B2]">
                            {record.dayType}
                          </span>
                        </td>
                        <td className="px-3 py-3 font-bold text-[#0F172A]">{props.number(record.workedHours)}</td>
                        <td className="px-3 py-3 font-bold text-[#0F172A]">{props.number(record.payableHours)}</td>
                        <td className="px-3 py-3 font-bold text-[#0F172A]">{props.money(record.grossPay)}</td>
                        <td className="px-3 py-3 text-sm font-medium text-[#475569]">{record.currentOwner}</td>
                        <td className="px-3 py-3">
                          <Link href="/hris/time-and-logs/timesheet-entry" className="text-sm font-semibold text-[#2563EB] hover:underline">
                            TS-{record.id.slice(-5).toUpperCase()}
                          </Link>
                        </td>
                        <td className="px-3 py-3">
                          <OvertimeWorkflowProgress workflow={record.workflow} />
                        </td>
                        <td className="px-3 py-3">
                          <OvertimeStatusBadge status={record.status} />
                        </td>
                        <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                          <RowActionsButton />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!props.records.length ? (
                <div className="p-6">
                  <OvertimeEmptyState />
                </div>
              ) : null}
            </div>
          </section>

          <aside className="space-y-5 xl:sticky xl:top-6 xl:self-start">
            <section className="rounded-[18px] border border-[#E5E7EB] bg-white shadow-[0_8px_20px_rgba(15,23,42,0.05)]">
              <div className="border-b border-[#EDF2F7] px-5 py-4">
                <h3 className="text-lg font-semibold text-[#0F172A]">Selected Overtime</h3>
              </div>
              {props.selected ? (
                <div className="space-y-4 p-5">
                  <div className="flex items-start gap-3">
                    <EmployeeAvatar name={props.selected.employeeName} />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[#0F172A]">{props.selected.employeeName}</p>
                      <p className="text-xs text-[#64748B]">
                        {props.selected.employeeId} · {props.selected.jobTitle}
                      </p>
                      <div className="mt-2">
                        <OvertimeStatusBadge status={props.selected.status} />
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {[
                      ['Hours', `${props.number(props.selected.payableHours)}h`],
                      ['Gross', props.money(props.selected.grossPay)],
                      ['Rate', props.money(props.selected.hourlyRate)],
                      ['Factor', `${props.number(props.selected.multiplier)}x`],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-xl border border-[#EDF2F7] bg-[#F8FAFC] p-3">
                        <p className="text-[10px] font-semibold uppercase text-[#94A3B8]">{label}</p>
                        <p className="mt-1 font-bold text-[#0F172A]">{value}</p>
                      </div>
                    ))}
                  </div>
                  <label className="block">
                    <span className="text-[11px] font-semibold uppercase text-[#94A3B8]">Comment</span>
                    <textarea
                      value={props.comment}
                      onChange={(e) => props.onCommentChange(e.target.value)}
                      rows={3}
                      className="mt-1.5 w-full rounded-xl border border-[#E5E7EB] px-3 py-2 text-sm font-medium outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
                      placeholder="Required for return/reject."
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {props.allowedActions.map((action) => (
                      <button
                        key={action}
                        type="button"
                        disabled={Boolean(props.actionBusy)}
                        onClick={() => props.onRunAction(action)}
                        className="rounded-xl bg-[#2563EB] px-3 py-2 text-xs font-semibold text-white hover:bg-[#1D4ED8] disabled:opacity-50"
                      >
                        {props.actionLabels[action] || action}
                      </button>
                    ))}
                  </div>
                  {props.selected.issues.length ? (
                    <ul className="space-y-1">
                      {props.selected.issues.map((issue) => (
                        <li key={issue} className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-xs font-semibold text-[#B91C1C]">
                          {issue}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <ValidationOkBanner />
                  )}
                </div>
              ) : (
                <div className="p-5">
                  <OvertimeEmptyState title="No overtime item selected." description="Select a row from the register to review details." />
                </div>
              )}
            </section>

            <section className="rounded-[18px] border border-[#E5E7EB] bg-white p-5 shadow-[0_8px_20px_rgba(15,23,42,0.05)]">
              <h3 className="flex items-center gap-2 text-lg font-semibold text-[#0F172A]">
                <History className="h-4 w-4 text-[#64748B]" />
                Audit Trail
              </h3>
              <div className="mt-3 max-h-[280px] space-y-2 overflow-y-auto">
                {props.selected?.auditTrail.length ? (
                  props.selected.auditTrail.map((audit) => (
                    <div key={audit.id} className="rounded-xl border border-[#EDF2F7] bg-[#F8FAFC] p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-[#0F172A]">{audit.action}</p>
                        <span className="text-[10px] font-medium text-[#94A3B8]">{new Date(audit.at).toLocaleString('en-GB')}</span>
                      </div>
                      <p className="mt-1 text-xs text-[#64748B]">
                        {audit.actor} · {audit.role}
                      </p>
                      {audit.comment ? <p className="mt-2 text-xs text-[#475569]">{audit.comment}</p> : null}
                    </div>
                  ))
                ) : (
                  <p className="rounded-xl border border-dashed border-[#E5E7EB] bg-[#F8FAFC] p-4 text-sm font-medium text-[#64748B]">
                    No overtime workflow action has been logged for this line yet.
                  </p>
                )}
              </div>
            </section>

            <section className="rounded-[18px] border border-[#E5E7EB] bg-white p-5 shadow-[0_8px_20px_rgba(15,23,42,0.05)]">
              <h3 className="text-lg font-semibold text-[#0F172A]">Overtime Summary</h3>
              <div className="mt-3">
                <OvertimeSummaryList
                  items={[
                    { label: 'Total Requests', value: props.number(props.summary.records) },
                    { label: 'Pending', value: props.number(props.summary.pendingApprovals) },
                    { label: 'Payroll Ready', value: props.number(props.summary.payrollReady) },
                    { label: 'Returned', value: props.number(props.summary.returned) },
                    { label: 'Gross Estimated Hours', value: props.number(props.summary.payableHours) },
                  ]}
                />
              </div>
            </section>

            <section className="rounded-[18px] border border-[#E5E7EB] bg-white p-5 shadow-[0_8px_20px_rgba(15,23,42,0.05)]">
              <h3 className="text-lg font-semibold text-[#0F172A]">Quick Links</h3>
              <div className="mt-3">
                <OvertimeQuickLinks />
              </div>
            </section>
          </aside>
        </div>
      </div>

      {props.authorizationModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#0F172A]/50 p-4 sm:p-6" role="dialog" aria-modal="true">
          <div className="my-4 w-full max-w-[1100px] rounded-[20px] border border-[#E5E7EB] bg-white shadow-[0_24px_60px_rgba(15,23,42,0.25)]">
            <div className="flex items-start justify-between gap-4 border-b border-[#EDF2F7] px-6 py-4">
              <div>
                <h2 className="text-xl font-bold text-[#0F172A]">Pre-Overtime Authorization</h2>
                <p className="mt-1 text-sm text-[#64748B]">
                  Book overtime for your assigned employees. Submission routes to Project Manager → GM Operations → HR.
                </p>
              </div>
              <button
                type="button"
                onClick={props.onCloseAuthorization}
                className="rounded-full p-2 text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#0F172A]"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-[72vh] overflow-y-auto px-6 py-5">{props.authorizationForm}</div>
            <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[#EDF2F7] px-6 py-4">
              <button
                type="button"
                onClick={props.onCloseAuthorization}
                className="inline-flex h-11 items-center rounded-xl border border-[#E5E7EB] bg-white px-5 text-sm font-semibold text-[#475569] hover:bg-[#F8FAFC]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={props.onSubmitAuthorization}
                disabled={props.authorizationBusy}
                className="inline-flex h-11 items-center rounded-xl bg-[#2563EB] px-6 text-sm font-semibold text-white hover:bg-[#1D4ED8] disabled:opacity-60"
              >
                {props.authorizationBusy ? 'Submitting…' : 'Submit Authorization'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export { inputClass, readOnlyClass };
