'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Mail,
  Plus,
  RefreshCcw,
  Route,
  Search,
  Users,
  X,
} from 'lucide-react';
import type {
  InductionEmployeeOption,
  InductionScheduleWorkspace,
  InductionStop,
  InductionStopStatus,
  InductionTour,
  InductionTourStatus,
} from '@/lib/induction-schedule-service';

type Props = {
  initialWorkspace: InductionScheduleWorkspace;
};

type StopDraft = {
  department: string;
  included: boolean;
  scheduledFor: string;
  facilitatorName: string;
  facilitatorEmail: string;
  facilitatorEmployeeCode: string;
  venue: string;
  notes: string;
};

const numberFmt = new Intl.NumberFormat('en-GB');
const fmtNum = (value: number) => numberFmt.format(Math.round(value));
const fmtDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || '—';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};
const fmtDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || '—';
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const stopStatusStyles: Record<InductionStopStatus, string> = {
  Scheduled: 'bg-blue-100 text-blue-800',
  Completed: 'bg-emerald-100 text-emerald-800',
  Overdue: 'bg-rose-100 text-rose-800',
  'Needs Scheduling': 'bg-amber-100 text-amber-900',
  Cancelled: 'bg-slate-200 text-slate-700',
};

const tourStatusStyles: Record<InductionTourStatus, string> = {
  Scheduled: 'bg-blue-100 text-blue-800',
  'In Progress': 'bg-indigo-100 text-indigo-800',
  Completed: 'bg-emerald-100 text-emerald-800',
  Cancelled: 'bg-slate-200 text-slate-700',
};

const STOP_STATUS_OPTIONS: InductionStopStatus[] = ['Scheduled', 'Completed', 'Overdue', 'Needs Scheduling', 'Cancelled'];

function Sparkline({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 120 28" className="mt-3 h-7 w-full" preserveAspectRatio="none" aria-hidden>
      <path
        d="M0 22 C18 20, 24 8, 36 12 C48 16, 54 24, 66 18 C78 12, 90 4, 102 10 C110 14, 116 18, 120 16"
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M0 28 L0 22 C18 20, 24 8, 36 12 C48 16, 54 24, 66 18 C78 12, 90 4, 102 10 C110 14, 116 18, 120 16 L120 28 Z"
        fill={color}
        opacity="0.12"
      />
    </svg>
  );
}

const toLocalInputValue = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const toDateInputValue = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const defaultStartDate = () => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(10, 0, 0, 0);
  return date.toISOString();
};

export default function InductionScheduleClient({ initialWorkspace }: Props) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | InductionTourStatus>('All');
  const [department, setDepartment] = useState('All');
  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState('');
  const [toast, setToast] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [employeeMenuOpen, setEmployeeMenuOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const employeeSearchRef = useRef<HTMLDivElement | null>(null);

  const [hireForm, setHireForm] = useState({
    hireName: '',
    hireEmail: '',
    employeeCode: '',
    employeeDbId: '' as string | number,
    destinationDepartment: '',
    startDate: toDateInputValue(defaultStartDate()),
    notes: '',
    notifyManagers: true,
  });
  const [stopDrafts, setStopDrafts] = useState<StopDraft[]>([]);

  useEffect(() => {
    if (!composerOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setComposerOpen(false);
        setEmployeeMenuOpen(false);
      }
    };
    const onClick = (event: MouseEvent) => {
      if (!employeeSearchRef.current?.contains(event.target as Node)) setEmployeeMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, [composerOpen]);

  const employeeMatches = useMemo(() => {
    const q = employeeSearch.trim().toLowerCase();
    const options = workspace.employeeOptions || [];
    if (!q) return options.slice(0, 8);
    return options
      .filter((item) =>
        item.employeeCode.toLowerCase().includes(q)
        || item.employeeName.toLowerCase().includes(q)
        || item.department.toLowerCase().includes(q),
      )
      .slice(0, 12);
  }, [workspace.employeeOptions, employeeSearch]);

  const filteredTours = useMemo(() => {
    const q = query.trim().toLowerCase();
    return workspace.tours.filter((tour) => {
      if (statusFilter !== 'All' && tour.status !== statusFilter) return false;
      if (department !== 'All' && tour.destinationDepartment !== department && !tour.stops.some((stop) => stop.department === department)) {
        return false;
      }
      if (!q) return true;
      return (
        tour.hireName.toLowerCase().includes(q)
        || tour.employeeCode.toLowerCase().includes(q)
        || tour.destinationDepartment.toLowerCase().includes(q)
        || tour.stops.some((stop) => stop.department.toLowerCase().includes(q) || stop.facilitatorName.toLowerCase().includes(q))
      );
    });
  }, [workspace.tours, query, statusFilter, department]);

  const upcomingStops = useMemo(() => {
    const now = Date.now();
    return workspace.tours
      .flatMap((tour) => tour.stops.map((stop) => ({ tour, stop })))
      .filter(({ stop }) => stop.status === 'Scheduled' || stop.status === 'Overdue')
      .sort((a, b) => a.stop.scheduledFor.localeCompare(b.stop.scheduledFor))
      .filter(({ stop }) => {
        const when = new Date(stop.scheduledFor).getTime();
        return Number.isNaN(when) || when >= now - 7 * 86400000;
      })
      .slice(0, 8);
  }, [workspace.tours]);

  const openComposer = async () => {
    setToast('');
    setHireForm({
      hireName: '',
      hireEmail: '',
      employeeCode: '',
      employeeDbId: '',
      destinationDepartment: workspace.allDepartments[0] || '',
      startDate: toDateInputValue(defaultStartDate()),
      notes: '',
      notifyManagers: true,
    });
    setEmployeeSearch('');
    setComposerOpen(true);
    await loadStopPreview(toDateInputValue(defaultStartDate()), workspace.allDepartments);
  };

  const loadStopPreview = async (startDate: string, departments: string[]) => {
    setPreviewLoading(true);
    try {
      const params = new URLSearchParams({ preview: 'stops', startDate: startDate || new Date().toISOString() });
      departments.forEach((dept) => params.append('department', dept));
      const res = await fetch(`/api/hris/onboarding/induction-schedule?${params.toString()}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Unable to preview department stops.');
      const stops = (json.data?.stops || []) as Array<{
        department: string;
        scheduledFor: string;
        facilitatorName: string;
        facilitatorEmail: string;
        facilitatorEmployeeCode: string;
        venue: string;
      }>;
      setStopDrafts(
        stops.map((stop) => ({
          department: stop.department,
          included: true,
          scheduledFor: toLocalInputValue(stop.scheduledFor),
          facilitatorName: stop.facilitatorName,
          facilitatorEmail: stop.facilitatorEmail,
          facilitatorEmployeeCode: stop.facilitatorEmployeeCode,
          venue: stop.venue,
          notes: '',
        })),
      );
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Unable to preview department stops.');
      setStopDrafts(
        departments.map((dept, index) => {
          const when = new Date(startDate || Date.now());
          when.setDate(when.getDate() + index);
          when.setHours(10, 0, 0, 0);
          return {
            department: dept,
            included: true,
            scheduledFor: toLocalInputValue(when.toISOString()),
            facilitatorName: `${dept} Line Manager`,
            facilitatorEmail: '',
            facilitatorEmployeeCode: '',
            venue: `${dept} Office`,
            notes: '',
          };
        }),
      );
    } finally {
      setPreviewLoading(false);
    }
  };

  const selectEmployee = (employee: InductionEmployeeOption) => {
    setHireForm((prev) => ({
      ...prev,
      hireName: employee.employeeName,
      hireEmail: employee.email || prev.hireEmail,
      employeeCode: employee.employeeCode,
      employeeDbId: employee.employeeDbId || '',
      destinationDepartment: employee.department || prev.destinationDepartment,
    }));
    setEmployeeSearch(`${employee.employeeCode} · ${employee.employeeName}`);
    setEmployeeMenuOpen(false);
  };

  const clearEmployeeLink = () => {
    setHireForm((prev) => ({
      ...prev,
      employeeCode: '',
      employeeDbId: '',
    }));
    setEmployeeSearch('');
  };

  const refresh = async () => {
    setLoading(true);
    setToast('');
    try {
      const res = await fetch('/api/hris/onboarding/induction-schedule', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Refresh failed');
      setWorkspace(json.data as InductionScheduleWorkspace);
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Refresh failed');
    } finally {
      setLoading(false);
    }
  };

  const submitTour = async () => {
    const included = stopDrafts.filter((stop) => stop.included);
    if (!hireForm.hireName.trim()) {
      setToast('Enter the new hire name.');
      return;
    }
    if (!hireForm.destinationDepartment.trim()) {
      setToast('Select the destination department.');
      return;
    }
    if (!hireForm.startDate) {
      setToast('Select the induction start date.');
      return;
    }
    if (!included.length) {
      setToast('Include at least one department stop.');
      return;
    }

    setBusyKey('schedule-tour');
    setToast('');
    try {
      const res = await fetch('/api/hris/onboarding/induction-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'schedule-tour',
          hireName: hireForm.hireName,
          hireEmail: hireForm.hireEmail,
          employeeCode: hireForm.employeeCode,
          employeeDbId: hireForm.employeeDbId === '' ? null : hireForm.employeeDbId,
          destinationDepartment: hireForm.destinationDepartment,
          startDate: new Date(`${hireForm.startDate}T10:00:00`).toISOString(),
          notes: hireForm.notes,
          notifyManagers: hireForm.notifyManagers,
          departments: included.map((stop) => stop.department),
          stopOverrides: included.map((stop) => ({
            department: stop.department,
            scheduledFor: stop.scheduledFor ? new Date(stop.scheduledFor).toISOString() : undefined,
            facilitatorName: stop.facilitatorName,
            facilitatorEmail: stop.facilitatorEmail,
            facilitatorEmployeeCode: stop.facilitatorEmployeeCode,
            venue: stop.venue,
            notes: stop.notes,
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Unable to schedule tour.');
      setWorkspace(json.data.workspace as InductionScheduleWorkspace);
      setComposerOpen(false);
      setExpanded(json.data.tour?.tourId || null);
      setToast(json.data.message || 'Induction tour scheduled.');
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Unable to schedule tour.');
    } finally {
      setBusyKey('');
    }
  };

  const updateStop = async (tour: InductionTour, stop: InductionStop, patch: Partial<InductionStop> & { notifyManager?: boolean }) => {
    setBusyKey(`${tour.tourId}:${stop.stopId}`);
    setToast('');
    try {
      const res = await fetch('/api/hris/onboarding/induction-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update-stop',
          tourId: tour.tourId,
          stopId: stop.stopId,
          status: patch.status,
          scheduledFor: patch.scheduledFor,
          facilitatorName: patch.facilitatorName,
          facilitatorEmail: patch.facilitatorEmail,
          facilitatorEmployeeCode: patch.facilitatorEmployeeCode,
          venue: patch.venue,
          notes: patch.notes,
          notifyManager: patch.notifyManager,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Unable to update stop.');
      setWorkspace(json.data.workspace as InductionScheduleWorkspace);
      setToast(json.data.message || 'Stop updated.');
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Unable to update stop.');
    } finally {
      setBusyKey('');
    }
  };

  const includedCount = stopDrafts.filter((stop) => stop.included).length;

  return (
    <div className="min-h-full bg-[#F5F7FB] text-slate-900">
      <div className="mx-auto max-w-[1400px] space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#2563EB]">HRIS · Onboarding</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Induction Schedule</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Schedule department induction tours for incoming hires. Line managers are notified for each stop and mark completion as the hire progresses.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => void openComposer()}
              className="inline-flex items-center gap-2 rounded-xl bg-[#2563EB] px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Schedule Induction
            </button>
          </div>
        </header>

        {toast ? (
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            {toast}
          </div>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[
            { label: 'Active Tours', value: workspace.summary.activeTours, icon: Route, color: '#2563EB' },
            { label: 'Upcoming Stops', value: workspace.summary.upcomingStops, icon: CalendarClock, color: '#0EA5E9' },
            { label: 'This Week', value: workspace.summary.thisWeekStops, icon: Clock3, color: '#6366F1' },
            { label: 'Completed Stops', value: workspace.summary.completedStops, icon: CheckCircle2, color: '#10B981' },
            { label: 'Overdue', value: workspace.summary.overdueStops, icon: AlertTriangle, color: '#F43F5E' },
          ].map((card) => (
            <article key={card.label} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{card.label}</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{fmtNum(card.value)}</p>
                </div>
                <span className="rounded-xl bg-slate-50 p-2 text-slate-600">
                  <card.icon className="h-4 w-4" style={{ color: card.color }} />
                </span>
              </div>
              <Sparkline color={card.color} />
            </article>
          ))}
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.7fr_1fr]">
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search hire, department, or facilitator"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none ring-[#2563EB] focus:bg-white focus:ring-2"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as 'All' | InductionTourStatus)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                >
                  <option value="All">All statuses</option>
                  <option value="Scheduled">Scheduled</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Completed">Completed</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
                <select
                  value={department}
                  onChange={(event) => setDepartment(event.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                >
                  <option value="All">All departments</option>
                  {workspace.allDepartments.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">Induction tours</h2>
                  <p className="text-xs text-slate-500">{filteredTours.length} tour{filteredTours.length === 1 ? '' : 's'} · all-department stops</p>
                </div>
                <Users className="h-4 w-4 text-slate-400" />
              </div>

              {!filteredTours.length ? (
                <div className="px-6 py-16 text-center">
                  <Route className="mx-auto h-10 w-10 text-slate-300" />
                  <h3 className="mt-3 text-base font-semibold text-slate-800">No induction tours yet</h3>
                  <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
                    Schedule a tour for an incoming hire. Department stops are generated automatically and managers are notified by email.
                  </p>
                  <button
                    type="button"
                    onClick={() => void openComposer()}
                    className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#2563EB] px-3.5 py-2 text-sm font-semibold text-white"
                  >
                    <Plus className="h-4 w-4" />
                    Schedule Induction
                  </button>
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {filteredTours.map((tour) => {
                    const open = expanded === tour.tourId;
                    return (
                      <li key={tour.tourId}>
                        <button
                          type="button"
                          onClick={() => setExpanded(open ? null : tour.tourId)}
                          className="flex w-full items-start gap-3 px-4 py-4 text-left hover:bg-slate-50/80"
                        >
                          <span className="mt-1 text-slate-400">
                            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-sm font-semibold text-slate-900">{tour.hireName}</p>
                              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tourStatusStyles[tour.status]}`}>
                                {tour.status}
                              </span>
                              {tour.employeeCode ? (
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                                  {tour.employeeCode}
                                </span>
                              ) : (
                                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                                  Pre-registration
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-xs text-slate-500">
                              Joining {tour.destinationDepartment} · Starts {fmtDate(tour.startDate)} · {tour.completedStops}/{tour.totalStops} stops complete
                            </p>
                            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                              <div className="h-full rounded-full bg-[#2563EB]" style={{ width: `${Math.min(100, tour.progressPct)}%` }} />
                            </div>
                          </div>
                          <div className="hidden text-right sm:block">
                            <p className="text-sm font-semibold tabular-nums text-slate-900">{tour.progressPct}%</p>
                            {tour.overdueStops ? (
                              <p className="text-xs font-medium text-rose-600">{tour.overdueStops} overdue</p>
                            ) : (
                              <p className="text-xs text-slate-400">On track</p>
                            )}
                          </div>
                        </button>

                        {open ? (
                          <div className="space-y-2 bg-slate-50/70 px-4 pb-4 pt-1">
                            {tour.stops.map((stop) => {
                              const busy = busyKey === `${tour.tourId}:${stop.stopId}`;
                              return (
                                <div key={stop.stopId} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                    <div>
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Stop {stop.sequence}</span>
                                        <p className="text-sm font-semibold text-slate-900">{stop.department}</p>
                                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${stopStatusStyles[stop.status]}`}>
                                          {stop.status}
                                        </span>
                                      </div>
                                      <p className="mt-1 text-xs text-slate-500">
                                        {fmtDateTime(stop.scheduledFor)} · {stop.venue || 'Venue TBC'}
                                      </p>
                                      <p className="mt-1 text-xs text-slate-600">
                                        Facilitator: {stop.facilitatorName || '—'}
                                        {stop.facilitatorEmail ? ` · ${stop.facilitatorEmail}` : ''}
                                        {stop.notifiedAt ? ` · Notified ${fmtDateTime(stop.notifiedAt)}` : ''}
                                      </p>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <select
                                        value={stop.status}
                                        disabled={busy}
                                        onChange={(event) => void updateStop(tour, stop, { status: event.target.value as InductionStopStatus })}
                                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                                      >
                                        {STOP_STATUS_OPTIONS.map((status) => (
                                          <option key={status} value={status}>{status}</option>
                                        ))}
                                      </select>
                                      <button
                                        type="button"
                                        disabled={busy || stop.status === 'Completed'}
                                        onClick={() => void updateStop(tour, stop, { status: 'Completed' })}
                                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                                      >
                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                        Complete
                                      </button>
                                      <button
                                        type="button"
                                        disabled={busy || !stop.facilitatorEmail}
                                        onClick={() => void updateStop(tour, stop, { notifyManager: true })}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50"
                                      >
                                        <Mail className="h-3.5 w-3.5" />
                                        Notify
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                            {tour.notes ? (
                              <p className="rounded-xl border border-dashed border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                                Notes: {tour.notes}
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900">Upcoming department stops</h2>
                <Building2 className="h-4 w-4 text-slate-400" />
              </div>
              <ul className="mt-3 space-y-2">
                {!upcomingStops.length ? (
                  <li className="rounded-xl bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">No upcoming stops.</li>
                ) : upcomingStops.map(({ tour, stop }) => (
                  <li key={`${tour.tourId}-${stop.stopId}`} className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{stop.department}</p>
                        <p className="text-xs text-slate-500">{tour.hireName} · {fmtDateTime(stop.scheduledFor)}</p>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${stopStatusStyles[stop.status]}`}>
                        {stop.status}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-br from-[#2563EB] to-blue-700 p-4 text-white shadow-sm">
              <h2 className="text-sm font-semibold">How induction tours work</h2>
              <ol className="mt-3 space-y-2 text-sm text-blue-50">
                <li>1. HR schedules an incoming hire — registration optional.</li>
                <li>2. All department stops are generated with line managers assigned.</li>
                <li>3. Managers receive email alerts and complete their stop.</li>
                <li>4. Link the employee record after registration if needed.</li>
              </ol>
              <Link href="/hris/onboarding/onboarding-dashboard" className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-white/90 hover:text-white">
                Back to onboarding dashboard <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </aside>
        </section>
      </div>

      {composerOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4">
          <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
            <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#2563EB]">Schedule induction tour</p>
                <h2 className="mt-1 text-lg font-semibold text-slate-900">Incoming hire · all-department tour</h2>
                <p className="mt-1 text-sm text-slate-500">
                  New hires can be scheduled before registration. Managers are notified for each department stop.
                </p>
              </div>
              <button type="button" onClick={() => setComposerOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm sm:col-span-2">
                  <span className="mb-1.5 block font-medium text-slate-700">New hire name *</span>
                  <input
                    value={hireForm.hireName}
                    onChange={(event) => setHireForm((prev) => ({ ...prev, hireName: event.target.value }))}
                    placeholder="Full name"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-[#2563EB] focus:ring-2"
                  />
                </label>

                <label className="block text-sm">
                  <span className="mb-1.5 block font-medium text-slate-700">Hire email (optional)</span>
                  <input
                    value={hireForm.hireEmail}
                    onChange={(event) => setHireForm((prev) => ({ ...prev, hireEmail: event.target.value }))}
                    placeholder="name@example.com"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-[#2563EB] focus:ring-2"
                  />
                </label>

                <label className="block text-sm">
                  <span className="mb-1.5 block font-medium text-slate-700">Start date *</span>
                  <input
                    type="date"
                    value={hireForm.startDate}
                    onChange={(event) => {
                      const value = event.target.value;
                      setHireForm((prev) => ({ ...prev, startDate: value }));
                      void loadStopPreview(value, workspace.allDepartments);
                    }}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-[#2563EB] focus:ring-2"
                  />
                </label>

                <label className="block text-sm">
                  <span className="mb-1.5 block font-medium text-slate-700">Destination department *</span>
                  <select
                    value={hireForm.destinationDepartment}
                    onChange={(event) => setHireForm((prev) => ({ ...prev, destinationDepartment: event.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-[#2563EB] focus:ring-2"
                  >
                    <option value="">Select department</option>
                    {workspace.allDepartments.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </label>

                <div className="sm:col-span-2" ref={employeeSearchRef}>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-700">Link registered employee (optional)</span>
                    {hireForm.employeeCode ? (
                      <button type="button" onClick={clearEmployeeLink} className="text-xs font-semibold text-[#2563EB]">
                        Clear link
                      </button>
                    ) : null}
                  </div>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      value={employeeSearch}
                      onFocus={() => setEmployeeMenuOpen(true)}
                      onChange={(event) => {
                        setEmployeeSearch(event.target.value);
                        setEmployeeMenuOpen(true);
                      }}
                      placeholder="Search by code or name if already registered"
                      className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none ring-[#2563EB] focus:ring-2"
                    />
                    {employeeMenuOpen ? (
                      <div className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                        {employeeMatches.map((employee) => (
                          <button
                            key={employee.employeeCode}
                            type="button"
                            onClick={() => selectEmployee(employee)}
                            className="flex w-full flex-col px-3 py-2 text-left hover:bg-slate-50"
                          >
                            <span className="text-sm font-medium text-slate-900">{employee.employeeCode} · {employee.employeeName}</span>
                            <span className="text-xs text-slate-500">{employee.department} · {employee.jobTitle}</span>
                          </button>
                        ))}
                        {!employeeMatches.length ? (
                          <p className="px-3 py-2 text-sm text-slate-500">No matching employees.</p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>

                <label className="block text-sm sm:col-span-2">
                  <span className="mb-1.5 block font-medium text-slate-700">Notes</span>
                  <textarea
                    value={hireForm.notes}
                    onChange={(event) => setHireForm((prev) => ({ ...prev, notes: event.target.value }))}
                    rows={2}
                    placeholder="Arrival instructions, special requirements…"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-[#2563EB] focus:ring-2"
                  />
                </label>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">Department stops</h3>
                    <p className="text-xs text-slate-500">
                      {previewLoading ? 'Building tour…' : `${includedCount} of ${stopDrafts.length} departments included`}
                    </p>
                  </div>
                  <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={hireForm.notifyManagers}
                      onChange={(event) => setHireForm((prev) => ({ ...prev, notifyManagers: event.target.checked }))}
                      className="rounded border-slate-300 text-[#2563EB]"
                    />
                    Email line managers on save
                  </label>
                </div>

                <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
                  {stopDrafts.map((stop, index) => (
                    <div key={stop.department} className={`rounded-xl border bg-white p-3 ${stop.included ? 'border-slate-200' : 'border-slate-100 opacity-60'}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
                          <input
                            type="checkbox"
                            checked={stop.included}
                            onChange={(event) => {
                              const included = event.target.checked;
                              setStopDrafts((prev) => prev.map((item, i) => (i === index ? { ...item, included } : item)));
                            }}
                            className="rounded border-slate-300 text-[#2563EB]"
                          />
                          {stop.department}
                        </label>
                        <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Stop {index + 1}</span>
                      </div>
                      {stop.included ? (
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          <label className="block text-xs">
                            <span className="mb-1 block text-slate-500">When</span>
                            <input
                              type="datetime-local"
                              value={stop.scheduledFor}
                              onChange={(event) => {
                                const value = event.target.value;
                                setStopDrafts((prev) => prev.map((item, i) => (i === index ? { ...item, scheduledFor: value } : item)));
                              }}
                              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm"
                            />
                          </label>
                          <label className="block text-xs">
                            <span className="mb-1 block text-slate-500">Venue</span>
                            <input
                              value={stop.venue}
                              onChange={(event) => {
                                const value = event.target.value;
                                setStopDrafts((prev) => prev.map((item, i) => (i === index ? { ...item, venue: value } : item)));
                              }}
                              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm"
                            />
                          </label>
                          <label className="block text-xs">
                            <span className="mb-1 block text-slate-500">Facilitator</span>
                            <input
                              value={stop.facilitatorName}
                              onChange={(event) => {
                                const value = event.target.value;
                                setStopDrafts((prev) => prev.map((item, i) => (i === index ? { ...item, facilitatorName: value } : item)));
                              }}
                              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm"
                            />
                          </label>
                          <label className="block text-xs">
                            <span className="mb-1 block text-slate-500">Facilitator email</span>
                            <input
                              value={stop.facilitatorEmail}
                              onChange={(event) => {
                                const value = event.target.value;
                                setStopDrafts((prev) => prev.map((item, i) => (i === index ? { ...item, facilitatorEmail: value } : item)));
                              }}
                              placeholder="Required for notification"
                              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm"
                            />
                          </label>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 px-5 py-4">
              <p className="text-xs text-slate-500">
                Managers without email on file will be skipped; you can notify them later from each stop.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setComposerOpen(false)}
                  className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={busyKey === 'schedule-tour' || previewLoading}
                  onClick={() => void submitTour()}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#2563EB] px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  <Mail className="h-4 w-4" />
                  {busyKey === 'schedule-tour' ? 'Scheduling…' : 'Save & notify managers'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
