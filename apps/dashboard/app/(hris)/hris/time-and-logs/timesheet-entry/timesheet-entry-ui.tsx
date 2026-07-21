'use client';

import type { ComponentType, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { ChevronDown, ChevronLeft, ChevronRight, GripVertical, MoreHorizontal, Plus, Search, Trash2 } from 'lucide-react';
import {
  perEmployeeOvertimeCap,
  remainingOvertimePool,
  remainingOvertimeSlots,
  type OvertimeAuthorization,
} from '@/lib/timesheet-overtime-booking';
import { OVERTIME_HOUR_OPTIONS, DAILY_BREAK_HOURS, resolveTimesheetShift, impliedOvertimeHoursFromClock } from '@/lib/timesheet-entry-shared';
import { PremiumKpiCard } from '../../payroll/employee-salary-setup/salary-setup-ui';
import type { SetupTone } from '../../payroll/employee-salary-setup/salary-setup-ui';
import { ReadinessGauge } from '../../payroll/daily-rate-pay/daily-rate-pay-ui';

export function ContextField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 flex-1">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#94A3B8]">{label}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

export function ContextSelect({
  value,
  onChange,
  options,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-xl border border-[#E5E7EB] bg-white py-2 pl-3 pr-8 text-sm font-semibold text-[#0F172A] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 disabled:cursor-not-allowed disabled:bg-[#F8FAFC] disabled:text-[#94A3B8]"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
    </div>
  );
}

export function SearchableContextPicker({
  value,
  onChange,
  options,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string; searchText?: string }>;
  placeholder: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((option) => option.value === value);
  const visibleOptions = options
    .filter((option) => {
      const query = searchText.trim().toLowerCase();
      if (!query) return true;
      return `${option.label} ${option.value} ${option.searchText || ''}`.toLowerCase().includes(query);
    })
    .slice(0, 80);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  return (
    <div ref={wrapperRef} className="relative w-full">
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((current) => !current);
          setSearchText('');
        }}
        className="flex min-h-[38px] w-full items-center justify-between gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-left text-sm font-semibold text-[#0F172A] hover:bg-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 disabled:cursor-not-allowed disabled:bg-[#F8FAFC] disabled:text-[#94A3B8]"
      >
        <span className="truncate">{selected?.label || value || placeholder}</span>
        <ChevronRight className={`h-4 w-4 shrink-0 text-[#94A3B8] transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open ? (
        <div className="absolute left-0 right-0 z-50 mt-1 rounded-xl border border-[#E5E7EB] bg-white p-2 shadow-[0_8px_20px_rgba(15,23,42,0.12)]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
            <input
              autoFocus
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder={placeholder}
              className="h-10 w-full rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] pl-9 pr-3 text-sm font-medium text-[#0F172A] outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
            />
          </div>
          <div className="mt-2 max-h-60 overflow-y-auto">
            {visibleOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                  setSearchText('');
                }}
                className={`block w-full rounded-lg px-3 py-2 text-left text-sm font-medium hover:bg-[#EFF6FF] ${
                  option.value === value ? 'bg-[#F1F5F9] font-semibold text-[#0F172A]' : 'text-[#475569]'
                }`}
              >
                <span className="block truncate">{option.label}</span>
              </button>
            ))}
            {!visibleOptions.length ? (
              <div className="px-3 py-4 text-sm font-medium text-[#94A3B8]">No match found.</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function StatusBadge({
  label,
  tone = 'success',
}: {
  label: string;
  tone?: 'success' | 'warning' | 'danger' | 'neutral';
}) {
  const styles = {
    success: 'border-[#A7F3D0] bg-[#ECFDF5] text-[#047857]',
    warning: 'border-[#FCD34D] bg-[#FFFBEB] text-[#B45309]',
    danger: 'border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]',
    neutral: 'border-[#E5E7EB] bg-[#F8FAFC] text-[#475569]',
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${styles[tone]}`}>
      {label}
    </span>
  );
}

export function TimesheetKpiStrip({
  items,
}: {
  items: Array<{
    label: string;
    value: string;
    subtitle: string;
    tone: SetupTone;
    icon: ComponentType<{ className?: string }>;
    trend?: number | null;
  }>;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-3 2xl:grid-cols-6">
      {items.map((item) => (
        <PremiumKpiCard key={item.label} {...item} />
      ))}
    </div>
  );
}

export function ProjectChipBar({
  columns,
  projects,
  canEdit,
  onAddProject,
  onAutoDistribute,
  onClearAll,
  onOpenSettings,
  onMoveColumn,
  onRemoveColumn,
  onSelectColumnProject,
}: {
  columns: Array<{ code: string; label: string }>;
  projects: Array<{ id: string; code: string; name: string }>;
  canEdit: boolean;
  onAddProject: () => void;
  onAutoDistribute: () => void;
  onClearAll: () => void;
  onOpenSettings: () => void;
  onMoveColumn: (index: number, direction: -1 | 1) => void;
  onRemoveColumn: (index: number) => void;
  onSelectColumnProject: (index: number, code: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[16px] border border-[#E5E7EB] bg-white px-4 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        {columns.map((col, index) => {
          const project = projects.find((item) => item.code === col.code);
          return (
            <div
              key={`${col.code}-${index}`}
              className="group flex items-center gap-1 rounded-xl border border-[#DBEAFE] bg-[#EFF6FF] px-2 py-1.5"
            >
              <GripVertical className="h-3.5 w-3.5 text-[#93C5FD]" />
              <select
                value={col.code}
                disabled={!canEdit}
                onChange={(e) => onSelectColumnProject(index, e.target.value)}
                className="max-w-[110px] bg-transparent text-xs font-bold text-[#2563EB] focus:outline-none disabled:opacity-60"
              >
                <option value={col.code}>{col.code}</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.code}>
                    {p.code}
                  </option>
                ))}
              </select>
              <span className="hidden max-w-[120px] truncate text-[10px] font-medium text-[#64748B] sm:inline">
                {project?.name || 'Select project'}
              </span>
              {canEdit ? (
                <>
                  <button
                    type="button"
                    onClick={() => onMoveColumn(index, -1)}
                    disabled={index === 0}
                    className="rounded p-0.5 text-[#94A3B8] hover:bg-white hover:text-[#2563EB] disabled:opacity-30"
                    title="Move left"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onMoveColumn(index, 1)}
                    disabled={index === columns.length - 1}
                    className="rounded p-0.5 text-[#94A3B8] hover:bg-white hover:text-[#2563EB] disabled:opacity-30"
                    title="Move right"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemoveColumn(index)}
                    className="rounded px-1 text-[10px] font-bold text-[#94A3B8] hover:bg-white hover:text-[#EF4444]"
                  >
                    ×
                  </button>
                </>
              ) : null}
            </div>
          );
        })}
        {canEdit ? (
          <button
            type="button"
            onClick={onAddProject}
            className="rounded-xl border border-dashed border-[#93C5FD] px-3 py-1.5 text-xs font-semibold text-[#2563EB] hover:bg-[#EFF6FF]"
          >
            + Add Project
          </button>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onAutoDistribute}
          disabled={!canEdit || columns.length === 0}
          className="h-9 rounded-xl border border-[#E5E7EB] px-3 text-xs font-semibold text-[#475569] hover:bg-[#F8FAFC] disabled:opacity-50"
        >
          Auto Distribute
        </button>
        <button
          type="button"
          onClick={onClearAll}
          disabled={!canEdit}
          className="h-9 rounded-xl border border-[#E5E7EB] px-3 text-xs font-semibold text-[#475569] hover:bg-[#F8FAFC] disabled:opacity-50"
        >
          Clear All
        </button>
        <button
          type="button"
          onClick={onOpenSettings}
          className="h-9 rounded-xl border border-[#E5E7EB] px-3 text-xs font-semibold text-[#475569] hover:bg-[#F8FAFC]"
        >
          Settings
        </button>
      </div>
    </div>
  );
}

export function DetailAccordion({
  title,
  count,
  children,
  defaultOpen = false,
}: {
  title: string;
  count?: number;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="group rounded-xl border border-[#E5E7EB] bg-white" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-[#0F172A] marker:content-none">
        <span>
          {title}
          {count !== undefined ? <span className="ml-2 text-xs font-medium text-[#94A3B8]">({count})</span> : null}
        </span>
        <ChevronDown className="h-4 w-4 text-[#94A3B8] transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-[#EDF2F7] px-4 py-3 text-sm text-[#475569]">{children}</div>
    </details>
  );
}

export function EmployeeDetailsPanel({
  tab,
  onTabChange,
  line,
  dailyPay,
  readiness,
  canEdit,
  onSaveSetup,
  saving,
  shiftLabel,
}: {
  tab: 'details' | 'history' | 'alerts';
  onTabChange: (tab: 'details' | 'history' | 'alerts') => void;
  line: {
    employeeName: string;
    employeeNo: string;
    validationStatus: string;
    clockIn: string | null;
    clockOut?: string | null;
    usedHours: number;
    totalHours: number;
    validationMessage: string | null;
  } | null;
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
  canEdit: boolean;
  onSaveSetup: () => void;
  saving: boolean;
  shiftLabel?: string;
}) {
  const tabs = [
    { id: 'details' as const, label: 'Details' },
    { id: 'history' as const, label: 'History' },
    { id: 'alerts' as const, label: 'Alerts' },
  ];

  if (!line) {
    return (
      <aside className="flex h-full w-[420px] shrink-0 flex-col rounded-[18px] border border-[#E5E7EB] bg-white p-6 shadow-[0_8px_20px_rgba(15,23,42,0.08)]">
        <p className="text-sm text-[#94A3B8]">Select an employee row to view details.</p>
      </aside>
    );
  }

  const shift = resolveTimesheetShift(shiftLabel);
  const impliedOt = impliedOvertimeHoursFromClock(line.clockIn, line.clockOut, shift.label);

  const statusTone =
    line.validationStatus === 'Valid' ? 'success' : line.validationStatus === 'Error' ? 'danger' : 'warning';
  const statusLabel = line.validationStatus === 'Valid' ? 'Complete' : line.validationStatus === 'Error' ? 'Incomplete' : 'Review';

  return (
    <aside className="sticky top-4 flex h-[calc(100vh-8rem)] w-[420px] shrink-0 flex-col overflow-hidden rounded-[18px] border border-[#E5E7EB] bg-white shadow-[0_8px_20px_rgba(15,23,42,0.08)]">
      <div className="flex border-b border-[#EDF2F7]">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onTabChange(item.id)}
            className={`flex-1 px-3 py-3 text-xs font-bold uppercase tracking-wide ${
              tab === item.id ? 'border-b-2 border-[#2563EB] text-[#2563EB]' : 'text-[#94A3B8] hover:text-[#475569]'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-5">
        {tab === 'details' ? (
          <div className="space-y-5">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#DBEAFE] text-lg font-bold text-[#2563EB]">
                {line.employeeName.slice(0, 1)}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-base font-bold uppercase text-[#0F172A]">{line.employeeName}</h3>
                <p className="text-sm font-semibold text-[#64748B]">{line.employeeNo}</p>
                <div className="mt-2">
                  <StatusBadge label={statusLabel} tone={statusTone} />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                ['Pay Mode', dailyPay?.payMode || 'Daily'],
                ['Day Rate', dailyPay ? `₦${dailyPay.dayRate.toLocaleString()}` : '—'],
                ['Hourly Rate', dailyPay ? `₦${dailyPay.hourRate.toLocaleString()}` : '—'],
                ['Paid Hours / Day', dailyPay ? String(dailyPay.paidHoursPerDay) : '8'],
                ['Payroll Group', dailyPay?.payrollGroup || 'DLE'],
                ['Location', dailyPay?.location || '—'],
                ['Work Centre', dailyPay?.workCenter || '—'],
                ['Timesheet Days', dailyPay ? String(dailyPay.timesheetDays) : '—'],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[#94A3B8]">{label}</p>
                  <p className="mt-1 text-sm font-bold text-[#0F172A]">{value}</p>
                </div>
              ))}
            </div>
            <div className="rounded-xl border border-[#DBEAFE] bg-[#EFF6FF] p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[#2563EB]">Active Shift</p>
              <p className="mt-1 text-sm font-bold text-[#0F172A]">{shift.label}</p>
              <p className="mt-1 text-xs text-[#475569]">{shift.description}</p>
              <p className="mt-2 text-xs font-semibold text-[#1D4ED8]">
                Implied OT from clock: {impliedOt > 0 ? `${impliedOt}h after ${shift.end}` : `None (standard ends ${shift.end})`}
              </p>
            </div>
            <div className="rounded-xl border border-[#DBEAFE] bg-[#EFF6FF] p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[#2563EB]">Calculated Pay</p>
              <p className="mt-1 text-2xl font-bold text-[#0F172A]">
                {dailyPay ? `₦${dailyPay.calculatedPay.toLocaleString()}` : '—'}
              </p>
            </div>
            <button
              type="button"
              onClick={onSaveSetup}
              disabled={!canEdit || saving}
              className="h-11 w-full rounded-xl bg-[#2563EB] text-sm font-semibold text-white hover:bg-[#1D4ED8] disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Timesheet Setup'}
            </button>
            <ReadinessGauge {...readiness} />
            <div className="space-y-2">
              <DetailAccordion title="Calculation Breakdown" defaultOpen>
                <p>Productive: {line.usedHours}h · Total booked: {line.totalHours}h</p>
              </DetailAccordion>
              <DetailAccordion title="Payroll Impact">
                <p>Pay accrues from validated daily bookings in the active payroll period.</p>
              </DetailAccordion>
              <DetailAccordion title="Assignments" count={1}>
                <p>Current supervisor crew assignment for {line.employeeNo}.</p>
              </DetailAccordion>
              <DetailAccordion title="Approval History" count={3}>
                <p>Draft capture and supervisor submission events appear here.</p>
              </DetailAccordion>
              <DetailAccordion title="Notes">
                <p>{line.validationMessage || 'No notes recorded.'}</p>
              </DetailAccordion>
            </div>
          </div>
        ) : null}
        {tab === 'history' ? (
          <div className="space-y-3 text-sm text-[#475569]">
            <p>Clock in: {line.clockIn || 'Absent'}</p>
            <p>Recent booking history for this employee will appear in the audit trail.</p>
          </div>
        ) : null}
        {tab === 'alerts' ? (
          <div className="space-y-3">
            {line.validationMessage ? (
              <div className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] p-3 text-sm text-[#B91C1C]">{line.validationMessage}</div>
            ) : (
              <p className="text-sm text-[#475569]">No active alerts for this employee.</p>
            )}
          </div>
        ) : null}
      </div>
    </aside>
  );
}

type RowIdleAllocation = {
  reasonId: string;
  reasonName: string;
  hours: number;
  remarks?: string | null;
};

export function TimesheetRowActionsMenu({
  lineIndex,
  line,
  idleReasons,
  defaultIdleReasonId,
  defaultIdleReasonName,
  standardTimesheetHours,
  dailyBreakHours = DAILY_BREAK_HOURS,
  matrixColumns,
  canEdit,
  isAbsent,
  open,
  onOpenChange,
  onUpdateLine,
}: {
  lineIndex: number;
  line: {
    id: string;
    employeeName: string;
    projectAllocations: Array<{ projectCode: string; projectName?: string; hours: number }>;
    idleAllocations: RowIdleAllocation[];
  };
  idleReasons: Array<{ id: string; name: string }>;
  defaultIdleReasonId: string;
  defaultIdleReasonName: string;
  standardTimesheetHours: number;
  dailyBreakHours?: number;
  matrixColumns: Array<{ code: string; label: string }>;
  canEdit: boolean;
  isAbsent: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdateLine: (index: number, updates: { projectAllocations?: typeof line.projectAllocations; idleAllocations?: RowIdleAllocation[] }) => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });

  const idleRows =
    line.idleAllocations.length > 0
      ? line.idleAllocations
      : [{ reasonId: defaultIdleReasonId, reasonName: defaultIdleReasonName, hours: 0, remarks: null }];

  useEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const menuWidth = 300;
    setMenuPosition({
      top: rect.bottom + 6,
      left: Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8)),
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      onOpenChange(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onOpenChange]);

  const updateIdleAllocations = (next: RowIdleAllocation[]) => {
    onUpdateLine(lineIndex, { idleAllocations: next });
  };

  const applyBreakTime = () => {
    updateIdleAllocations([
      { reasonId: defaultIdleReasonId, reasonName: defaultIdleReasonName, hours: dailyBreakHours, remarks: null },
    ]);
    onOpenChange(false);
  };

  const fillStandardDay = () => {
    const fallbackCode = matrixColumns[0]?.code || line.projectAllocations[0]?.projectCode || 'GENERAL';
    const fallbackName =
      matrixColumns[0]?.label ||
      line.projectAllocations.find((item) => item.projectCode === fallbackCode)?.projectName ||
      fallbackCode;
    const projectAllocations =
      line.projectAllocations.length > 0
        ? line.projectAllocations.map((item, index) => ({
            ...item,
            hours: index === 0 ? standardTimesheetHours : 0,
          }))
        : [{ projectCode: fallbackCode, projectName: fallbackName, hours: standardTimesheetHours }];
    onUpdateLine(lineIndex, {
      projectAllocations,
      idleAllocations: [{ reasonId: defaultIdleReasonId, reasonName: defaultIdleReasonName, hours: dailyBreakHours, remarks: null }],
    });
    onOpenChange(false);
  };

  const clearProjectHours = () => {
    onUpdateLine(lineIndex, {
      projectAllocations: line.projectAllocations.map((item) => ({ ...item, hours: 0 })),
    });
    onOpenChange(false);
  };

  const clearIdleHours = () => {
    updateIdleAllocations([]);
    onOpenChange(false);
  };

  const menu =
    open && typeof document !== 'undefined' ? (
      <div
        ref={menuRef}
        style={{ position: 'fixed', top: menuPosition.top, left: menuPosition.left, width: 300, zIndex: 9999 }}
        className="rounded-xl border border-[#E5E7EB] bg-white p-3 shadow-[0_12px_32px_rgba(15,23,42,0.16)]"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[10px] font-bold uppercase tracking-wide text-[#94A3B8]">Row Actions</p>
        <p className="mt-0.5 truncate text-xs font-semibold text-[#0F172A]">{line.employeeName}</p>

        {!isAbsent ? (
          <>
            <div className="mt-3 border-t border-[#EDF2F7] pt-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-[#F97316]">Idle / Break Reasons</p>
              <div className="mt-2 space-y-2">
                {idleRows.map((alloc, idleIndex) => (
                  <div key={`${line.id}-idle-${idleIndex}`} className="flex items-center gap-1.5">
                    <select
                      value={alloc.reasonId || defaultIdleReasonId}
                      disabled={!canEdit}
                      onChange={(e) => {
                        const reason = idleReasons.find((item) => item.id === e.target.value);
                        const next = [...(line.idleAllocations.length ? line.idleAllocations : idleRows)];
                        next[idleIndex] = {
                          ...next[idleIndex],
                          reasonId: e.target.value,
                          reasonName: reason?.name || defaultIdleReasonName,
                          remarks: next[idleIndex]?.remarks ?? null,
                        };
                        updateIdleAllocations(next);
                      }}
                      className="min-w-0 flex-1 rounded-lg border border-[#E5E7EB] px-2 py-1.5 text-[11px] font-semibold text-[#0F172A] focus:border-[#2563EB] focus:outline-none disabled:bg-[#F8FAFC] disabled:text-[#64748B]"
                    >
                      {idleReasons.map((reason) => (
                        <option key={reason.id} value={reason.id}>
                          {reason.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      disabled={!canEdit}
                      value={alloc.hours || ''}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        const next = [...(line.idleAllocations.length ? line.idleAllocations : idleRows)];
                        if (next[idleIndex]) next[idleIndex] = { ...next[idleIndex], hours: val };
                        else next.push({ reasonId: defaultIdleReasonId, reasonName: defaultIdleReasonName, hours: val, remarks: null });
                        updateIdleAllocations(next);
                      }}
                      className="w-14 rounded-lg border border-[#E5E7EB] px-1.5 py-1.5 text-right text-[11px] font-bold text-[#F97316] focus:border-[#2563EB] focus:outline-none disabled:bg-[#F8FAFC] disabled:text-[#64748B]"
                    />
                    {canEdit && line.idleAllocations.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => {
                          const next = line.idleAllocations.filter((_, index) => index !== idleIndex);
                          updateIdleAllocations(next);
                        }}
                        className="rounded-lg p-1 text-[#94A3B8] hover:bg-[#FEF2F2] hover:text-[#B91C1C]"
                        title="Remove idle reason"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                ))}
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() =>
                      updateIdleAllocations([
                        ...line.idleAllocations,
                        { reasonId: defaultIdleReasonId, reasonName: defaultIdleReasonName, hours: 0, remarks: null },
                      ])
                    }
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#2563EB] hover:underline"
                  >
                    <Plus className="h-3 w-3" />
                    Add idle reason
                  </button>
                ) : null}
              </div>
            </div>

            {canEdit ? (
              <div className="mt-3 space-y-1 border-t border-[#EDF2F7] pt-3">
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-[#64748B]">Quick Actions</p>
                <button
                  type="button"
                  onClick={applyBreakTime}
                  className="flex w-full rounded-lg px-2 py-2 text-left text-xs font-semibold text-[#475569] hover:bg-[#FFFBEB]"
                >
                  Apply break time ({dailyBreakHours}h)
                </button>
                <button
                  type="button"
                  onClick={fillStandardDay}
                  className="flex w-full rounded-lg px-2 py-2 text-left text-xs font-semibold text-[#475569] hover:bg-[#EFF6FF]"
                >
                  Fill standard day ({standardTimesheetHours}h + {dailyBreakHours}h break)
                </button>
                <button
                  type="button"
                  onClick={clearProjectHours}
                  className="flex w-full rounded-lg px-2 py-2 text-left text-xs font-semibold text-[#475569] hover:bg-[#F8FAFC]"
                >
                  Clear project hours
                </button>
                <button
                  type="button"
                  onClick={clearIdleHours}
                  className="flex w-full rounded-lg px-2 py-2 text-left text-xs font-semibold text-[#475569] hover:bg-[#F8FAFC]"
                >
                  Clear idle hours
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <p className="mt-3 text-xs text-[#64748B]">No actions available for absent employees.</p>
        )}
      </div>
    ) : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpenChange(!open);
        }}
        className={`rounded-lg p-1.5 ${open ? 'bg-[#EFF6FF] text-[#2563EB]' : 'text-[#94A3B8] hover:bg-[#F1F5F9] hover:text-[#475569]'}`}
        title="Row actions"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {menu ? createPortal(menu, document.body) : null}
    </>
  );
}

export function ApprovedOvertimeBookingBar({
  authorizations,
  lines,
  selectedEmployeeCount,
  canEdit,
  canBookOvertime,
  submitting = false,
  onBook,
  suggestedOtHours = 0,
  onSelectAllPresentEmployees,
  presentEmployeeCount = 0,
}: {
  authorizations: Array<{
    id: string;
    projectCode: string;
    projectName: string;
    requestedHours: number;
    requestedHeadcount: number;
    reason?: string;
  }>;
  lines: Array<{
    id: string;
    clockIn: string | null;
    usedHours: number;
    projectAllocations: Array<{ projectCode: string; hours: number }>;
  }>;
  selectedEmployeeCount: number;
  canEdit: boolean;
  canBookOvertime: boolean;
  submitting?: boolean;
  onBook: (authorizationId: string, otHours: number) => void;
  suggestedOtHours?: number;
  onSelectAllPresentEmployees?: () => void;
  presentEmployeeCount?: number;
}) {
  const [hoursByAuth, setHoursByAuth] = useState<Record<string, number>>({});
  const defaultHours = suggestedOtHours > 0
    ? (OVERTIME_HOUR_OPTIONS.find((hours) => Math.abs(hours - suggestedOtHours) < 0.51) || OVERTIME_HOUR_OPTIONS[0])
    : OVERTIME_HOUR_OPTIONS[0];

  if (!authorizations.length) {
    if (!canBookOvertime) return null;
    return (
      <div className="overflow-hidden rounded-[16px] border border-[#E5E7EB] bg-white shadow-sm">
        <div className="border-b border-[#EDF2F7] bg-[#F8FAFC] px-4 py-3">
          <h3 className="text-sm font-bold text-[#0F172A]">Book Overtime for Assigned Employees</h3>
          <p className="mt-1 text-xs text-[#64748B]">
            No HR-approved overtime for this supervisor and date yet. Create and approve requests in Overtime Management first — same flow for Day and Night.
          </p>
        </div>
        <div className="px-4 py-6 text-center">
          <Link
            href="/hris/workforce-management/overtime-management"
            className="inline-flex h-9 items-center rounded-xl bg-[#2563EB] px-3 text-xs font-semibold text-white hover:bg-[#1D4ED8]"
          >
            Open Overtime Management
          </Link>
        </div>
      </div>
    );
  }

  const bookEnabled = canBookOvertime || canEdit;
  const targetLabel = selectedEmployeeCount > 0
    ? `${selectedEmployeeCount} selected employee${selectedEmployeeCount === 1 ? '' : 's'}`
    : `all present crew (${presentEmployeeCount || lines.filter((line) => line.clockIn).length})`;

  return (
    <div className="overflow-hidden rounded-[16px] border border-[#E5E7EB] bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#EDF2F7] bg-[#F8FAFC] px-4 py-3">
        <div>
          <h3 className="text-sm font-bold text-[#0F172A]">Book Overtime for Assigned Employees</h3>
          <p className="mt-1 text-xs text-[#64748B]">
            {authorizations.length} approved authorization{authorizations.length === 1 ? '' : 's'} · select employees (or Select all present), set OT hours, then Book OT.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onSelectAllPresentEmployees ? (
            <button
              type="button"
              onClick={onSelectAllPresentEmployees}
              className="h-9 rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs font-semibold text-[#2563EB] hover:bg-[#EFF6FF]"
            >
              Select all present
            </button>
          ) : null}
          <span className="rounded-full bg-[#DBEAFE] px-2.5 py-1 text-[11px] font-semibold text-[#1D4ED8]">
            {targetLabel}
          </span>
          <Link
            href="/hris/workforce-management/overtime-management"
            className="h-9 rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs font-semibold text-[#475569] hover:bg-[#F8FAFC]"
          >
            Overtime Management
          </Link>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[920px] w-full text-left text-sm">
          <thead className="bg-white text-[11px] font-semibold uppercase tracking-wide text-[#94A3B8]">
            <tr className="border-b border-[#EDF2F7]">
              <th className="px-4 py-3">Project</th>
              <th className="px-4 py-3">Approved</th>
              <th className="px-4 py-3">Remaining</th>
              <th className="px-4 py-3">Reason</th>
              <th className="px-4 py-3 w-44">OT Hours</th>
              <th className="px-4 py-3 w-36">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EDF2F7]">
            {authorizations.map((item) => {
              const poolRemaining = remainingOvertimePool(item as OvertimeAuthorization, lines as never);
              const slotsRemaining = remainingOvertimeSlots(item as OvertimeAuthorization, lines as never);
              const perEmployee = perEmployeeOvertimeCap(item);
              const selectedHours = hoursByAuth[item.id] ?? defaultHours;
              const canBookRow = bookEnabled
                && !submitting
                && poolRemaining >= selectedHours
                && slotsRemaining > 0;
              return (
                <tr key={item.id} className="hover:bg-[#F8FAFC]">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-[#0F172A]">{item.projectCode}</div>
                    <div className="text-xs text-[#64748B]">{item.projectName}</div>
                  </td>
                  <td className="px-4 py-3 text-[#475569]">
                    <div className="font-semibold text-[#0F172A]">{item.requestedHours}h · {item.requestedHeadcount} people</div>
                    <div className="text-xs">Max {perEmployee}h each</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-[#047857]">{poolRemaining}h</div>
                    <div className="text-xs text-[#64748B]">{slotsRemaining} slot{slotsRemaining === 1 ? '' : 's'}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-[#64748B]">{item.reason || '—'}</td>
                  <td className="px-4 py-3">
                    <select
                      value={selectedHours}
                      onChange={(event) => setHoursByAuth((current) => ({ ...current, [item.id]: Number(event.target.value) }))}
                      className="h-9 w-full rounded-xl border border-[#E5E7EB] bg-white px-2 text-xs font-semibold text-[#0F172A] focus:border-[#2563EB] focus:outline-none"
                      aria-label={`Overtime hours for ${item.projectCode}`}
                    >
                      {OVERTIME_HOUR_OPTIONS.map((hours) => (
                        <option key={hours} value={hours}>
                          {hours}h{suggestedOtHours > 0 && Math.abs(hours - suggestedOtHours) < 0.51 ? ' (suggested)' : ''}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      disabled={!canBookRow}
                      onClick={() => onBook(item.id, selectedHours)}
                      className="inline-flex h-9 items-center rounded-xl bg-[#10B981] px-3 text-xs font-semibold text-white hover:bg-[#059669] disabled:opacity-40"
                    >
                      Book OT
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function TimesheetAnalyticsStrip({
  bookedHours,
  idleHours,
  projectTotals,
}: {
  bookedHours: number;
  idleHours: number;
  projectTotals: Array<{ label: string; value: number }>;
}) {
  const maxProject = Math.max(...projectTotals.map((item) => item.value), 1);
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <div className="rounded-[18px] border border-[#E5E7EB] bg-white p-5 shadow-sm">
        <h4 className="text-sm font-semibold text-[#0F172A]">Booked vs Idle Hours</h4>
        <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-[#F1F5F9]">
          <div className="bg-[#2563EB]" style={{ width: `${(bookedHours / Math.max(bookedHours + idleHours, 1)) * 100}%` }} />
          <div className="bg-[#F97316]" style={{ width: `${(idleHours / Math.max(bookedHours + idleHours, 1)) * 100}%` }} />
        </div>
        <div className="mt-3 flex justify-between text-xs text-[#64748B]">
          <span>Booked {bookedHours.toFixed(1)}h</span>
          <span>Idle {idleHours.toFixed(1)}h</span>
        </div>
      </div>
      <div className="rounded-[18px] border border-[#E5E7EB] bg-white p-5 shadow-sm">
        <h4 className="text-sm font-semibold text-[#0F172A]">Top Projects</h4>
        <div className="mt-4 space-y-2">
          {projectTotals.slice(0, 4).map((item) => (
            <div key={item.label}>
              <div className="mb-1 flex justify-between text-xs">
                <span className="font-semibold text-[#475569]">{item.label}</span>
                <span className="font-bold text-[#0F172A]">{item.value.toFixed(1)}h</span>
              </div>
              <div className="h-2 rounded-full bg-[#F1F5F9]">
                <div className="h-2 rounded-full bg-[#2563EB]" style={{ width: `${(item.value / maxProject) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-[18px] border border-[#E5E7EB] bg-white p-5 shadow-sm">
        <h4 className="text-sm font-semibold text-[#0F172A]">Productivity Gauge</h4>
        <p className="mt-4 text-3xl font-bold text-[#10B981]">
          {bookedHours > 0 ? Math.round((bookedHours / Math.max(bookedHours + idleHours, 1)) * 100) : 0}%
        </p>
        <p className="mt-1 text-xs text-[#64748B]">Share of booked hours that are productive project time.</p>
      </div>
    </div>
  );
}
