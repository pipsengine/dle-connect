'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Briefcase,
  CheckCircle2,
  Clock,
  Copy,
  FileText,
  RefreshCcw,
  Save,
  Search,
  Send,
  Users,
  XCircle,
} from 'lucide-react';
import {
  ContextField,
  ContextSelect,
  EmployeeDetailsPanel,
  ProjectChipBar,
  SearchableContextPicker,
  StatusBadge,
  TimesheetAnalyticsStrip,
  TimesheetKpiStrip,
  TimesheetRowActionsMenu,
  ApprovedOvertimeBookingBar,
} from './timesheet-entry-ui';
import { DAILY_BREAK_HOURS, canonicalProjectCode, impliedOvertimeHoursFromClock, matrixProductiveHoursCap, projectHoursForColumn, upsertMatrixProjectHours } from '@/lib/timesheet-entry-shared';
import { overtimeProductiveHours } from '@/lib/timesheet-overtime-booking';

type DisplayColumn = { code: string; label: string; kind: 'project' | 'internal' | 'idle' | 'leave' };

type TimesheetLine = {
  id: string;
  employeeId: string;
  employeeNo: string;
  employeeName: string;
  clockIn: string | null;
  clockOut: string | null;
  attendanceDuration: number;
  projectAllocations: Array<{ projectCode: string; projectName: string; hours: number }>;
  idleAllocations: Array<{ reasonId: string; reasonName: string; hours: number }>;
  usedHours: number;
  idleHours: number;
  totalHours: number;
  variance: number;
  validationStatus: 'Valid' | 'Error' | 'Warning' | 'Incomplete';
  validationMessage: string | null;
};

type Project = { id: string; code: string; name: string };

export type TimesheetEnterpriseViewProps = {
  periodLabel: string;
  periodIsOpen: boolean;
  selectedDate: string;
  selectedShift: string;
  shiftOptions: string[];
  shiftHint?: string;
  supervisorLabel: string;
  supervisorOptions: Array<{ value: string; label: string; searchText?: string }>;
  locationOptions: string[];
  workCenterOptions: string[];
  selectedSupervisor: string;
  selectedLocation: string;
  selectedWorkCenter: string;
  onSupervisorChange: (value: string) => void;
  onLocationChange: (value: string) => void;
  onWorkCenterChange: (value: string) => void;
  onDateChange: (value: string) => void;
  onShiftChange: (value: string) => void;
  canManagePeriod: boolean;
  canEditTimesheet: boolean;
  canBookOvertime: boolean;
  showCaptureMatrix: boolean;
  submitting: boolean;
  refreshing: boolean;
  error: string | null;
  notice: string | null;
  query: string;
  onQueryChange: (value: string) => void;
  filteredLines: TimesheetLine[];
  localLines: TimesheetLine[];
  matrixColumns: DisplayColumn[];
  projects: Project[];
  payloadProjects: Project[];
  idleReasons: Array<{ id: string; name: string }>;
  selectedEmployees: string[];
  onToggleAllEmployees: (checked: boolean) => void;
  onToggleEmployee: (employeeId: string, checked: boolean) => void;
  onSelectEmployees?: (employeeIds: string[]) => void;
  selectedLineId: string | null;
  onSelectLine: (lineId: string) => void;
  onUpdateLine: (index: number, updates: Record<string, unknown>) => void;
  onAddProjectColumn: () => void;
  onMoveProjectColumn: (index: number, direction: -1 | 1) => void;
  onRemoveProjectColumn: (index: number) => void;
  onSelectColumnProject: (index: number, code: string) => void;
  onAutoDistribute: () => void;
  onClearAllProjects: () => void;
  onOpenProjectSettings: () => void;
  onSyncAttendance: () => void;
  onCopyPrevious: () => void;
  onSaveDraft: () => void;
  onOpenSubmitReview: () => void;
  onBulkOpen: () => void;
  canOpenSubmitReview: boolean;
  showEmployeeDetailsPanel: boolean;
  approvedOvertimeAuthorizations: Array<{
    id: string;
    projectCode: string;
    projectName: string;
    requestedHours: number;
    requestedHeadcount: number;
    reason: string;
  }>;
  overtimeDevRelaxed: boolean;
  overtimeRetroCorrection: boolean;
  overtimeOpenBooking?: boolean;
  onBookApprovedOvertime: (authorizationId: string, otHours: number) => void;
  summary: {
    totalEmployees: number;
    bookedHours: number;
    usedHours: number;
    idleHours: number;
    productivityPct: number;
  };
  exceptionCount: number;
  submittedCount: number;
  remainingHours: number;
  capacityHours: number;
  rightPanelTab: 'details' | 'history' | 'alerts';
  onRightPanelTabChange: (tab: 'details' | 'history' | 'alerts') => void;
  dailyPay: {
    payMode: string;
    dayRate: number;
    hourRate: number;
    paidHoursPerDay: number;
    payrollGroup: string;
    location: string;
    workCenter: string;
    timesheetDays: number;
    calculatedPay: number;
  } | null;
  readiness: { score: number; readyDays: number; issuesFound: number; blockingIssues: number };
  onSaveTimesheetSetup: () => void;
  defaultIdleReasonId: string;
  defaultIdleReasonName: string;
  grossTimesheetHours: number;
  standardTimesheetHours: number;
  footerTotals: {
    duration: number;
    projectTotals: number[];
    used: number;
    idle: number;
    total: number;
    variance: number;
  };
};

const formatWorkingDate = (value: string) => {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
};

export function TimesheetEntryEnterpriseView(props: TimesheetEnterpriseViewProps) {
  const [openActionsLineId, setOpenActionsLineId] = useState<string | null>(null);

  const selectedLine =
    props.filteredLines.find((line) => line.id === props.selectedLineId) ||
    props.filteredLines[0] ||
    null;

  const projectTotals = props.matrixColumns.map((col) => {
    const columnCode = canonicalProjectCode(col.code);
    return props.filteredLines.reduce(
      (sum, line) => sum + projectHoursForColumn(line.projectAllocations, columnCode),
      0,
    );
  });

  const kpiItems = [
    {
      label: 'Total Employees',
      value: String(props.summary.totalEmployees),
      subtitle: 'All assigned',
      tone: 'blue' as const,
      icon: Users,
    },
    {
      label: 'Booked Hours',
      value: `${props.summary.bookedHours.toFixed(1)} hrs`,
      subtitle: `${props.capacityHours > 0 ? Math.round((props.summary.bookedHours / props.capacityHours) * 100) : 0}% of capacity`,
      tone: 'green' as const,
      icon: Clock,
      trend: props.capacityHours > 0 ? (props.summary.bookedHours / props.capacityHours) * 100 - 80 : null,
    },
    {
      label: 'Productive Hours',
      value: `${props.summary.usedHours.toFixed(1)} hrs`,
      subtitle: `${props.summary.productivityPct}% productivity`,
      tone: 'violet' as const,
      icon: Briefcase,
    },
    {
      label: 'Remaining Hours',
      value: `${props.remainingHours.toFixed(1)} hrs`,
      subtitle: `${props.capacityHours > 0 ? Math.round((props.remainingHours / props.capacityHours) * 100) : 0}% remaining`,
      tone: 'amber' as const,
      icon: BarChart3,
    },
    {
      label: 'Exceptions',
      value: String(props.exceptionCount),
      subtitle: 'Need attention',
      tone: 'red' as const,
      icon: AlertTriangle,
    },
    {
      label: 'Submitted',
      value: String(props.submittedCount),
      subtitle: 'Timesheets',
      tone: 'blue' as const,
      icon: FileText,
    },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC] px-6 py-6">
      <div className="mx-auto max-w-[1680px] space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[32px] font-bold leading-tight text-[#0F172A]">Timesheet Entry</h1>
            <p className="mt-1 text-[15px] text-[#475569]">
              Record and allocate daily work hours to projects and cost centres.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/hris/time-and-logs/timesheet-reports"
              className="inline-flex h-10 items-center rounded-xl border border-[#E5E7EB] bg-white px-4 text-sm font-semibold text-[#475569] hover:bg-[#F8FAFC]"
            >
              Reports
            </Link>
            <button
              type="button"
              onClick={props.onSaveDraft}
              disabled={props.submitting || !props.canEditTimesheet}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-4 text-sm font-semibold text-[#475569] hover:bg-[#F8FAFC] disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              Save Draft
            </button>
            <button
              type="button"
              onClick={props.onOpenSubmitReview}
              disabled={props.submitting || !props.canOpenSubmitReview}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#2563EB] px-4 text-sm font-semibold text-white hover:bg-[#1D4ED8] disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              Review &amp; Submit
            </button>
          </div>
        </div>

        {(props.error || props.notice) && (
          <div
            className={`rounded-xl border px-4 py-3 text-sm font-semibold ${
              props.error ? 'border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]' : 'border-[#A7F3D0] bg-[#ECFDF5] text-[#047857]'
            }`}
          >
            {props.error || props.notice}
          </div>
        )}

        {props.canBookOvertime && !props.canEditTimesheet ? (
          <div className="rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-3 text-sm text-[#1E40AF]">
            <p className="font-bold">Overtime correction mode</p>
            <p className="mt-1 text-xs font-medium">
              This timesheet is posted to payroll. Select employees, choose OT hours on an approved authorization, then Book OT.
            </p>
          </div>
        ) : null}

        {props.canBookOvertime ? (
          <ApprovedOvertimeBookingBar
            authorizations={props.approvedOvertimeAuthorizations}
            lines={props.localLines}
            selectedEmployeeCount={props.selectedEmployees.length}
            presentEmployeeCount={props.localLines.filter((line) => line.clockIn).length}
            canEdit={props.canEditTimesheet}
            canBookOvertime={props.canBookOvertime}
            retroCorrection={props.overtimeRetroCorrection}
            openBooking={props.overtimeOpenBooking}
            devRelaxed={props.overtimeDevRelaxed}
            submitting={props.submitting}
            onBook={props.onBookApprovedOvertime}
            onSelectAllPresentEmployees={() => {
              const presentIds = props.localLines.filter((line) => line.clockIn).map((line) => line.employeeId);
              if (props.onSelectEmployees) props.onSelectEmployees(presentIds);
              else props.onToggleAllEmployees(true);
            }}
            suggestedOtHours={(() => {
              const targets = props.selectedEmployees.length
                ? props.localLines.filter((line) => props.selectedEmployees.includes(line.employeeId) && line.clockIn)
                : props.localLines.filter((line) => line.clockIn);
              if (!targets.length) return 0;
              const values = targets.map((line) => impliedOvertimeHoursFromClock(line.clockIn, line.clockOut, props.selectedShift));
              const max = Math.max(...values, 0);
              return max > 0 ? Math.round(max) : 0;
            })()}
          />
        ) : null}

        <div className="rounded-[18px] border border-[#E5E7EB] bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
          <div className="flex flex-wrap items-end gap-4">
            <ContextField label="Payroll Period">
              <p className="text-sm font-semibold text-[#0F172A]">{props.periodLabel}</p>
            </ContextField>
            <ContextField label="Working Date">
              <input
                type="date"
                value={props.selectedDate}
                onChange={(e) => props.onDateChange(e.target.value)}
                className="w-full rounded-xl border border-[#E5E7EB] px-3 py-2 text-sm font-semibold text-[#0F172A] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
              />
              <p className="mt-1 text-xs text-[#94A3B8]">{formatWorkingDate(props.selectedDate)}</p>
            </ContextField>
            <ContextField label="Supervisor">
              <SearchableContextPicker
                value={props.selectedSupervisor}
                onChange={props.onSupervisorChange}
                placeholder="Search supervisor..."
                options={props.supervisorOptions}
              />
            </ContextField>
            <ContextField label="Location / Site">
              <SearchableContextPicker
                value={props.selectedLocation}
                onChange={props.onLocationChange}
                placeholder="Search location..."
                options={props.locationOptions.map((item) => ({ value: item, label: item }))}
              />
            </ContextField>
            <ContextField label="Work Centre">
              <SearchableContextPicker
                value={props.selectedWorkCenter}
                onChange={props.onWorkCenterChange}
                placeholder="Search work centre..."
                options={props.workCenterOptions.map((item) => ({ value: item, label: item }))}
              />
            </ContextField>
            <ContextField label="Shift">
              <ContextSelect
                value={props.selectedShift}
                onChange={props.onShiftChange}
                options={(props.shiftOptions.length ? props.shiftOptions : ['01 (Day)', '02 (Night)']).map((item) => ({
                  value: item,
                  label: item.includes('Night')
                    ? `${item} · 18:00–02:00`
                    : item.includes('Day')
                      ? `${item} · 08:00–17:00`
                      : item,
                }))}
              />
              {props.shiftHint ? (
                <p className="mt-1 text-[10px] font-medium leading-snug text-[#64748B]">{props.shiftHint}</p>
              ) : null}
            </ContextField>
            <div className="flex items-end gap-2">
              <StatusBadge label={props.periodIsOpen ? 'Open' : 'Closed'} tone={props.periodIsOpen ? 'success' : 'neutral'} />
              {props.canManagePeriod ? (
                <Link
                  href="/hris/time-and-logs/timesheet-period"
                  className="h-10 rounded-xl border border-[#E5E7EB] px-3 text-xs font-semibold text-[#475569] hover:bg-[#F8FAFC]"
                >
                  Manage Period
                </Link>
              ) : null}
            </div>
          </div>
        </div>

        <TimesheetKpiStrip items={kpiItems} />

        <ProjectChipBar
          columns={props.matrixColumns}
          projects={props.payloadProjects}
          canEdit={props.canEditTimesheet}
          onAddProject={props.onAddProjectColumn}
          onAutoDistribute={props.onAutoDistribute}
          onClearAll={props.onClearAllProjects}
          onOpenSettings={props.onOpenProjectSettings}
          onMoveColumn={props.onMoveProjectColumn}
          onRemoveColumn={props.onRemoveProjectColumn}
          onSelectColumnProject={props.onSelectColumnProject}
        />

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-[#E5E7EB] bg-white px-4 py-3">
          <div className="relative min-w-[240px] flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
            <input
              value={props.query}
              onChange={(e) => props.onQueryChange(e.target.value)}
              placeholder="Search employees..."
              className="h-10 w-full rounded-xl border border-[#E5E7EB] pl-10 pr-3 text-sm focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {props.selectedEmployees.length > 0 && props.canEditTimesheet ? (
              <button
                type="button"
                onClick={props.onBulkOpen}
                className="h-9 rounded-xl bg-[#F59E0B] px-3 text-xs font-semibold text-white hover:bg-[#D97706]"
              >
                Bulk Update ({props.selectedEmployees.length})
              </button>
            ) : null}
            <button
              type="button"
              onClick={props.onSyncAttendance}
              disabled={props.submitting || !props.canEditTimesheet}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#E5E7EB] px-3 text-xs font-semibold text-[#475569] hover:bg-[#F8FAFC] disabled:opacity-50"
            >
              <RefreshCcw className={`h-3.5 w-3.5 ${props.refreshing ? 'animate-spin' : ''}`} />
              Sync Attendance
            </button>
            <button
              type="button"
              onClick={props.onCopyPrevious}
              disabled={props.submitting || !props.canEditTimesheet}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#E5E7EB] px-3 text-xs font-semibold text-[#475569] hover:bg-[#F8FAFC] disabled:opacity-50"
            >
              <Copy className="h-3.5 w-3.5" />
              Copy Previous
            </button>
            <button
              type="button"
              onClick={props.onSaveDraft}
              disabled={props.submitting || !props.canEditTimesheet}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#E5E7EB] px-3 text-xs font-semibold text-[#475569] hover:bg-[#F8FAFC] disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              Save Draft
            </button>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="min-w-0 flex-1">
            <div className="overflow-hidden rounded-[16px] border border-[#E5E7EB] bg-white shadow-[0_8px_20px_rgba(15,23,42,0.08)]">
              <div className="max-h-[58vh] overflow-auto">
                <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
                  <thead className="sticky top-0 z-20 bg-[#F8FAFC]">
                    <tr className="border-b border-[#E5E7EB]">
                      <th className="sticky left-0 z-30 min-w-[240px] bg-[#F8FAFC] px-3 py-3 text-[11px] font-bold uppercase tracking-wide text-[#94A3B8] shadow-[2px_0_6px_rgba(15,23,42,0.04)]">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={props.selectedEmployees.length === props.filteredLines.length && props.filteredLines.length > 0}
                            onChange={(e) => props.onToggleAllEmployees(e.target.checked)}
                            className="h-4 w-4 rounded border-[#CBD5E1] text-[#2563EB]"
                          />
                          <span>Employee</span>
                        </div>
                      </th>
                      <th className="px-3 py-3 text-[11px] font-bold uppercase tracking-wide text-[#94A3B8]">Log (In/Out)</th>
                      <th className="px-3 py-3 text-center text-[11px] font-bold uppercase tracking-wide text-[#94A3B8]">Dur</th>
                      {props.matrixColumns.map((col, colIdx) => {
                        const total = projectTotals[colIdx] || 0;
                        const project = props.payloadProjects.find((p) => p.code === col.code);
                        return (
                          <th key={`${col.code}-${colIdx}`} className="min-w-[88px] border-l border-[#EDF2F7] px-2 py-3 text-center text-[11px] font-bold uppercase tracking-wide text-[#94A3B8]">
                            <div>{col.code}</div>
                            <div className="mt-0.5 text-[10px] font-medium normal-case text-[#64748B]">{total.toFixed(1)} hrs</div>
                            <div className="truncate text-[9px] font-normal text-[#94A3B8]">{project?.name || col.label}</div>
                          </th>
                        );
                      })}
                      <th className="border-l border-[#EDF2F7] px-3 py-3 text-center text-[11px] font-bold uppercase tracking-wide text-[#94A3B8]">Used</th>
                      <th className="px-3 py-3 text-center text-[11px] font-bold uppercase tracking-wide text-[#94A3B8]">Idle</th>
                      <th className="px-3 py-3 text-center text-[11px] font-bold uppercase tracking-wide text-[#94A3B8]">Total</th>
                      <th className="px-3 py-3 text-center text-[11px] font-bold uppercase tracking-wide text-[#94A3B8]">Var</th>
                      <th className="px-3 py-3 text-center text-[11px] font-bold uppercase tracking-wide text-[#94A3B8]">Status</th>
                      <th className="px-3 py-3 text-center text-[11px] font-bold uppercase tracking-wide text-[#94A3B8]">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {props.filteredLines.map((line, rowIndex) => {
                      const isAbsent = !line.clockIn;
                      const originalIdx = props.localLines.findIndex((item) => item.id === line.id);
                      const isSelected = props.selectedLineId === line.id;
                      const rowBg = isSelected
                        ? 'bg-[#EFF6FF]'
                        : isAbsent
                          ? 'bg-[#F8FAFC]'
                          : line.validationStatus === 'Valid'
                            ? 'bg-[#ECFDF5]/40'
                            : line.validationStatus === 'Error'
                              ? 'bg-[#FEF2F2]/50'
                              : 'bg-white';
                      return (
                        <tr
                          key={line.id}
                          onClick={() => props.onSelectLine(line.id)}
                          className={`cursor-pointer border-b border-[#EDF2F7] hover:bg-[#F1F5F9] ${rowBg}`}
                        >
                          <td className={`sticky left-0 z-10 px-3 py-3 shadow-[2px_0_6px_rgba(15,23,42,0.04)] ${rowBg}`}>
                            <div className="flex items-center gap-2">
                              <span className="w-5 text-center text-[11px] font-semibold text-[#94A3B8]">{rowIndex + 1}</span>
                              <input
                                type="checkbox"
                                checked={props.selectedEmployees.includes(line.employeeId)}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  props.onToggleEmployee(line.employeeId, e.target.checked);
                                }}
                                onClick={(e) => e.stopPropagation()}
                                className="h-4 w-4 rounded border-[#CBD5E1] text-[#2563EB]"
                              />
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#DBEAFE] text-xs font-bold text-[#2563EB]">
                                {line.employeeName.slice(0, 1)}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-[#0F172A]">{line.employeeName}</p>
                                <p className="text-xs font-medium text-[#64748B]">{line.employeeNo}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-xs font-semibold">
                            {isAbsent ? (
                              <span className="text-[#EF4444]">ABSENT</span>
                            ) : (
                              <div className="text-[#475569]">
                                <div>{line.clockIn}</div>
                                <div>{line.clockOut || '--:--'}</div>
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-3 text-center text-xs font-bold text-[#475569]">{line.attendanceDuration}h</td>
                          {props.matrixColumns.map((col) => {
                            const columnCode = canonicalProjectCode(col.code);
                            const project = props.payloadProjects.find((p) => canonicalProjectCode(p.code) === columnCode);
                            const hours = projectHoursForColumn(line.projectAllocations, columnCode);
                            const hasOvertime = overtimeProductiveHours(line.usedHours, props.standardTimesheetHours) > 0;
                            const cellTone =
                              hours <= 0
                                ? 'bg-white'
                                : hasOvertime
                                  ? 'bg-[#FFFBEB] ring-1 ring-inset ring-[#FCD34D]'
                                  : line.validationStatus === 'Error'
                                    ? 'bg-[#FEF2F2]'
                                    : 'bg-[#EFF6FF]';
                            return (
                              <td key={col.code} className={`border-l border-[#EDF2F7] px-1 py-2 ${cellTone}`}>
                                <input
                                  type="number"
                                  step="0.5"
                                  min={0}
                                  disabled={!props.canEditTimesheet || !props.showCaptureMatrix || isAbsent}
                                  value={isAbsent ? 0 : hours || ''}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) => {
                                    const idleHours = line.idleHours || DAILY_BREAK_HOURS;
                                    const maxTotal = matrixProductiveHoursCap(
                                      line,
                                      line.usedHours,
                                      props.standardTimesheetHours,
                                      idleHours,
                                    );
                                    const projectAllocations = upsertMatrixProjectHours(
                                      line.projectAllocations,
                                      col.code,
                                      project?.name || col.label,
                                      parseFloat(e.target.value) || 0,
                                      maxTotal,
                                    );
                                    props.onUpdateLine(originalIdx, { projectAllocations });
                                  }}
                                  className="w-full rounded-lg border border-[#E5E7EB] py-1.5 text-right text-xs font-bold text-[#0F172A] focus:border-[#2563EB] focus:outline-none disabled:bg-[#F1F5F9] disabled:text-[#94A3B8]"
                                />
                              </td>
                            );
                          })}
                          <td className="border-l border-[#EDF2F7] px-3 py-3 text-center text-xs font-bold text-[#2563EB]">
                            <span>{line.usedHours}</span>
                            {overtimeProductiveHours(line.usedHours, props.standardTimesheetHours) > 0 ? (
                              <span className="mt-0.5 block text-[9px] font-semibold text-[#D97706]">
                                incl. {overtimeProductiveHours(line.usedHours, props.standardTimesheetHours)}h OT
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-3 text-center text-xs font-bold text-[#F97316]">{line.idleHours}</td>
                          <td className="px-3 py-3 text-center text-xs font-bold text-[#0F172A]">{line.totalHours}</td>
                          <td className="px-3 py-3 text-center text-xs font-bold text-[#475569]">
                            {line.variance > 0 ? `+${line.variance}` : line.variance}
                          </td>
                          <td className="px-3 py-3 text-center">
                            {line.validationStatus === 'Valid' ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-[#A7F3D0] bg-[#ECFDF5] px-2 py-0.5 text-[10px] font-bold text-[#047857]">
                                <CheckCircle2 className="h-3 w-3" />
                                Complete
                              </span>
                            ) : (
                              <div className="flex flex-col items-center gap-1">
                                <span
                                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                                    line.validationStatus === 'Error'
                                      ? 'border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]'
                                      : 'border-[#FCD34D] bg-[#FFFBEB] text-[#B45309]'
                                  }`}
                                >
                                  <AlertTriangle className="h-3 w-3" />
                                  {line.validationStatus === 'Error' ? 'Denied' : 'Review'}
                                </span>
                                {line.validationMessage ? (
                                  <span
                                    className="max-w-[220px] text-[9px] font-medium leading-tight text-[#B91C1C]"
                                    title={line.validationMessage}
                                  >
                                    {line.validationMessage}
                                  </span>
                                ) : null}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                            {originalIdx >= 0 ? (
                              <TimesheetRowActionsMenu
                                lineIndex={originalIdx}
                                line={line}
                                idleReasons={props.idleReasons}
                                defaultIdleReasonId={props.defaultIdleReasonId}
                                defaultIdleReasonName={props.defaultIdleReasonName}
                                standardTimesheetHours={props.standardTimesheetHours}
                                dailyBreakHours={DAILY_BREAK_HOURS}
                                matrixColumns={props.matrixColumns}
                                canEdit={props.canEditTimesheet && props.showCaptureMatrix}
                                isAbsent={isAbsent}
                                open={openActionsLineId === line.id}
                                onOpenChange={(next) => setOpenActionsLineId(next ? line.id : null)}
                                onUpdateLine={props.onUpdateLine}
                              />
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="sticky bottom-0 z-20 bg-[#F8FAFC]">
                    <tr className="border-t border-[#E5E7EB]">
                      <td className="sticky left-0 z-30 bg-[#F8FAFC] px-3 py-3 text-xs font-bold text-[#475569] shadow-[2px_0_6px_rgba(15,23,42,0.04)]">
                        Totals · {props.filteredLines.length} employees
                      </td>
                      <td className="px-3 py-3" />
                      <td className="px-3 py-3 text-center text-xs font-bold text-[#0F172A]">{props.footerTotals.duration.toFixed(1)}h</td>
                      {props.footerTotals.projectTotals.map((total, index) => (
                        <td key={index} className="border-l border-[#EDF2F7] px-2 py-3 text-center text-xs font-bold text-[#2563EB]">
                          {total.toFixed(1)}
                        </td>
                      ))}
                      <td className="border-l border-[#EDF2F7] px-3 py-3 text-center text-xs font-bold text-[#2563EB]">{props.footerTotals.used.toFixed(1)}</td>
                      <td className="px-3 py-3 text-center text-xs font-bold text-[#F97316]">{props.footerTotals.idle.toFixed(1)}</td>
                      <td className="px-3 py-3 text-center text-xs font-bold text-[#0F172A]">{props.footerTotals.total.toFixed(1)}</td>
                      <td className="px-3 py-3 text-center text-xs font-bold text-[#475569]">{props.footerTotals.variance.toFixed(1)}</td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <div className="mt-4">
              <TimesheetAnalyticsStrip
                bookedHours={props.summary.usedHours}
                idleHours={props.summary.idleHours}
                projectTotals={props.matrixColumns.map((col, index) => ({
                  label: col.code,
                  value: projectTotals[index] || 0,
                }))}
              />
            </div>
          </div>

          {props.showEmployeeDetailsPanel ? (
            <EmployeeDetailsPanel
              tab={props.rightPanelTab}
              onTabChange={props.onRightPanelTabChange}
              line={selectedLine}
              dailyPay={props.dailyPay}
              readiness={props.readiness}
              canEdit={props.canEditTimesheet}
              onSaveSetup={props.onSaveTimesheetSetup}
              saving={props.submitting}
              shiftLabel={props.selectedShift}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
