'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Plus,
  RefreshCcw,
  Search,
  Users,
  X,
} from 'lucide-react';
import type {
  InductionEmployeeOption,
  InductionKind,
  InductionScheduleWorkspace,
  InductionSession,
  InductionStatus,
} from '@/lib/induction-schedule-service';

type Props = {
  initialWorkspace: InductionScheduleWorkspace;
};

const numberFmt = new Intl.NumberFormat('en-GB');
const fmtNum = (value: number) => numberFmt.format(Math.round(value));
const fmtDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const statusStyles: Record<InductionStatus, string> = {
  Scheduled: 'bg-blue-100 text-blue-800',
  Completed: 'bg-emerald-100 text-emerald-800',
  Overdue: 'bg-rose-100 text-rose-800',
  'Needs Scheduling': 'bg-amber-100 text-amber-900',
  Cancelled: 'bg-slate-200 text-slate-700',
};

const STATUS_OPTIONS: InductionStatus[] = ['Scheduled', 'Completed', 'Overdue', 'Needs Scheduling', 'Cancelled'];

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

export default function InductionScheduleClient({ initialWorkspace }: Props) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<'All' | InductionKind>('All');
  const [statusFilter, setStatusFilter] = useState<'All' | InductionStatus>('All');
  const [department, setDepartment] = useState('All');
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [toast, setToast] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [employeeMenuOpen, setEmployeeMenuOpen] = useState(false);
  const employeeSearchRef = useRef<HTMLDivElement | null>(null);
  const [form, setForm] = useState({
    id: '',
    employeeCode: '',
    employeeName: '',
    department: '',
    jobTitle: '',
    location: '',
    kind: 'Department' as InductionKind,
    status: 'Scheduled' as InductionStatus,
    scheduledFor: toLocalInputValue(new Date(Date.now() + 86400000).toISOString()),
    facilitator: 'Department Head',
    venue: '',
    notes: '',
    employeeDbId: '' as string | number,
  });

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

  const departmentOptions = workspace.allDepartments?.length
    ? workspace.allDepartments
    : Array.from(new Set([...(workspace.departments || []), form.department].filter(Boolean))).sort();

  const selectEmployee = (employee: InductionEmployeeOption) => {
    setForm((prev) => ({
      ...prev,
      employeeCode: employee.employeeCode,
      employeeName: employee.employeeName,
      department: employee.department || prev.department,
      jobTitle: employee.jobTitle || prev.jobTitle,
      location: employee.location || prev.location,
      employeeDbId: employee.employeeDbId || '',
      venue: prev.venue || (employee.department ? `${employee.department} floor` : prev.venue),
    }));
    setEmployeeSearch(employee.employeeCode);
    setEmployeeMenuOpen(false);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return workspace.sessions.filter((session) => {
      if (kindFilter !== 'All' && session.kind !== kindFilter) return false;
      if (statusFilter !== 'All' && session.status !== statusFilter) return false;
      if (department !== 'All' && session.department !== department) return false;
      if (!q) return true;
      return (
        session.employeeName.toLowerCase().includes(q)
        || session.employeeCode.toLowerCase().includes(q)
        || session.department.toLowerCase().includes(q)
        || session.facilitator.toLowerCase().includes(q)
        || session.venue.toLowerCase().includes(q)
      );
    });
  }, [workspace.sessions, query, kindFilter, statusFilter, department]);

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

  const openCreate = (session?: InductionSession) => {
    if (session) {
      setForm({
        id: session.id.startsWith('INF-') ? '' : session.id,
        employeeCode: session.employeeCode,
        employeeName: session.employeeName,
        department: session.department,
        jobTitle: session.jobTitle,
        location: session.location,
        kind: session.kind,
        status: session.status === 'Needs Scheduling' ? 'Scheduled' : session.status,
        scheduledFor: toLocalInputValue(session.scheduledFor),
        facilitator: session.facilitator,
        venue: session.venue,
        notes: session.notes,
        employeeDbId: session.employeeDbId || '',
      });
      setEmployeeSearch(session.employeeCode);
    } else {
      setForm({
        id: '',
        employeeCode: '',
        employeeName: '',
        department: '',
        jobTitle: '',
        location: '',
        kind: 'Department',
        status: 'Scheduled',
        scheduledFor: toLocalInputValue(new Date(Date.now() + 86400000).toISOString()),
        facilitator: 'Department Head',
        venue: '',
        notes: '',
        employeeDbId: '',
      });
      setEmployeeSearch('');
    }
    setEmployeeMenuOpen(false);
    setComposerOpen(true);
  };

  const saveSession = async () => {
    setBusyId(form.id || 'new');
    setToast('');
    try {
      const res = await fetch('/api/hris/onboarding/induction-schedule', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'upsert-session',
          id: form.id || undefined,
          employeeDbId: form.employeeDbId === '' ? null : Number(form.employeeDbId),
          employeeCode: form.employeeCode,
          employeeName: form.employeeName,
          department: form.department,
          jobTitle: form.jobTitle,
          location: form.location,
          kind: form.kind,
          status: form.status,
          scheduledFor: new Date(form.scheduledFor).toISOString(),
          facilitator: form.facilitator,
          venue: form.venue,
          notes: form.notes,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Save failed');
      if (json.data?.workspace) setWorkspace(json.data.workspace as InductionScheduleWorkspace);
      setComposerOpen(false);
      setToast(json.data?.message || 'Induction session saved.');
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Save failed');
    } finally {
      setBusyId('');
    }
  };

  const quickComplete = async (session: InductionSession) => {
    setBusyId(session.id);
    setToast('');
    try {
      const res = await fetch('/api/hris/onboarding/induction-schedule', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'upsert-session',
          id: session.id.startsWith('INF-') ? undefined : session.id,
          employeeDbId: session.employeeDbId,
          employeeCode: session.employeeCode,
          employeeName: session.employeeName,
          department: session.department,
          jobTitle: session.jobTitle,
          location: session.location,
          kind: session.kind,
          status: 'Completed',
          scheduledFor: session.scheduledFor,
          facilitator: session.facilitator,
          venue: session.venue,
          notes: session.notes,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Update failed');
      if (json.data?.workspace) setWorkspace(json.data.workspace as InductionScheduleWorkspace);
      setToast(`Marked ${session.kind} induction complete for ${session.employeeName}.`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Update failed');
    } finally {
      setBusyId('');
    }
  };

  const kpis = [
    { label: 'Upcoming', value: workspace.summary.upcoming, color: '#2563EB', soft: '#EFF6FF', icon: CalendarClock },
    { label: 'This Week', value: workspace.summary.thisWeek, color: '#6366F1', soft: '#EEF2FF', icon: Clock3 },
    { label: 'Completed', value: workspace.summary.completed, color: '#10B981', soft: '#ECFDF5', icon: CheckCircle2 },
    { label: 'Overdue', value: workspace.summary.overdue, color: '#EF4444', soft: '#FEF2F2', icon: AlertTriangle },
    { label: 'Needs Scheduling', value: workspace.summary.needsScheduling, color: '#F59E0B', soft: '#FFFBEB', icon: Users },
  ];

  return (
    <div className="min-h-full bg-[#F5F7FB] px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1400px] space-y-5">
        <nav className="flex flex-wrap items-center gap-1.5 text-sm text-[#64748B]">
          <Link href="/hris" className="font-semibold hover:text-[#2563EB]">
            HRIS
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <Link href="/hris/onboarding/onboarding-dashboard" className="font-semibold hover:text-[#2563EB]">
            Onboarding
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="font-bold text-[#0F172A]">Induction Schedule</span>
        </nav>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="hidden h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[#EFF6FF] text-[#2563EB] sm:flex">
              <CalendarClock className="h-8 w-8" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[#0F172A] sm:text-3xl">Induction Schedule</h1>
              <p className="mt-1 max-w-2xl text-sm text-[#64748B]">
                Plan and track Department, HSE, IT, and Corporate inductions for new hires. Sessions are saved live and suggested from the onboarding cohort when none exist yet.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={loading}
              className="inline-flex min-h-10 items-center gap-2 rounded-[10px] border border-[#E6EAF2] bg-white px-4 text-sm font-bold text-[#0F172A] shadow-sm hover:bg-slate-50 disabled:opacity-60"
            >
              <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => openCreate()}
              className="inline-flex min-h-10 items-center gap-2 rounded-[10px] bg-[#2563EB] px-4 text-sm font-bold text-white shadow-sm hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Schedule Induction
            </button>
          </div>
        </div>

        {toast ? (
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-900">{toast}</div>
        ) : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {kpis.map((kpi) => {
            const Icon = kpi.icon;
            return (
              <section
                key={kpi.label}
                className="rounded-2xl border border-[#E6EAF2] bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,.04),0_8px_24px_rgba(15,23,42,.06)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">{kpi.label}</p>
                    <p className="mt-2 text-3xl font-bold tabular-nums text-[#0F172A]">{fmtNum(kpi.value)}</p>
                  </div>
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: kpi.soft, color: kpi.color }}>
                    <Icon className="h-5 w-5" />
                  </span>
                </div>
                <Sparkline color={kpi.color} />
              </section>
            );
          })}
        </div>

        <section className="rounded-2xl border border-[#E6EAF2] bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,.04),0_8px_24px_rgba(15,23,42,.06)]">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
            <label className="relative block lg:col-span-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search employee, facilitator, venue…"
                className="min-h-10 w-full rounded-[10px] border border-[#E6EAF2] bg-[#F8FAFC] py-2 pl-9 pr-3 text-sm font-semibold text-[#0F172A]"
              />
            </label>
            <select
              value={kindFilter}
              onChange={(event) => setKindFilter(event.target.value as 'All' | InductionKind)}
              className="min-h-10 rounded-[10px] border border-[#E6EAF2] bg-white px-3 text-sm font-semibold text-[#0F172A]"
            >
              <option value="All">All induction types</option>
              {workspace.kinds.map((kind) => (
                <option key={kind} value={kind}>
                  {kind}
                </option>
              ))}
            </select>
            <select
              value={department}
              onChange={(event) => setDepartment(event.target.value)}
              className="min-h-10 rounded-[10px] border border-[#E6EAF2] bg-white px-3 text-sm font-semibold text-[#0F172A]"
            >
              <option value="All">All departments</option>
              {workspace.departments.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {(['All', ...STATUS_OPTIONS] as Array<'All' | InductionStatus>).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setStatusFilter(item)}
                className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                  statusFilter === item ? 'bg-[#2563EB] text-white' : 'bg-[#F1F5F9] text-[#475569] hover:bg-[#E2E8F0]'
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </section>

        {composerOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <button
              type="button"
              aria-label="Close schedule induction modal"
              className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
              onClick={() => {
                setComposerOpen(false);
                setEmployeeMenuOpen(false);
              }}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="induction-modal-title"
              className="relative z-10 flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[#E6EAF2] bg-white shadow-[0_24px_80px_rgba(15,23,42,.28)]"
            >
              <div className="flex items-start justify-between gap-4 border-b border-[#E6EAF2] bg-gradient-to-r from-[#EFF6FF] to-white px-6 py-5">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-[#2563EB]">Onboarding</p>
                  <h2 id="induction-modal-title" className="mt-1 text-xl font-bold text-[#0F172A]">
                    {form.id ? 'Edit induction' : 'Schedule induction'}
                  </h2>
                  <p className="mt-1 text-sm text-[#64748B]">
                    Search an employee by code, confirm details, then save the live induction session.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setComposerOpen(false);
                    setEmployeeMenuOpen(false);
                  }}
                  className="rounded-xl border border-[#E6EAF2] bg-white p-2 text-[#64748B] hover:bg-slate-50 hover:text-[#0F172A]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-5">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="md:col-span-1" ref={employeeSearchRef}>
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-[#64748B]">
                      Employee code
                    </label>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
                      <input
                        value={employeeSearch}
                        onFocus={() => setEmployeeMenuOpen(true)}
                        onChange={(event) => {
                          const value = event.target.value;
                          setEmployeeSearch(value);
                          setEmployeeMenuOpen(true);
                          setForm((prev) => ({
                            ...prev,
                            employeeCode: '',
                            employeeName: '',
                            employeeDbId: '',
                          }));
                        }}
                        placeholder="Search code or name…"
                        className="min-h-11 w-full rounded-xl border border-[#E6EAF2] bg-[#F8FAFC] py-2.5 pl-9 pr-3 text-sm font-semibold text-[#0F172A] outline-none ring-[#2563EB] focus:bg-white focus:ring-2"
                        autoComplete="off"
                      />
                      {employeeMenuOpen ? (
                        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-[#E6EAF2] bg-white shadow-xl">
                          {employeeMatches.length ? (
                            employeeMatches.map((employee) => (
                              <button
                                key={`${employee.employeeCode}-${employee.employeeDbId || 'x'}`}
                                type="button"
                                onClick={() => selectEmployee(employee)}
                                className="flex w-full flex-col gap-0.5 border-b border-[#F1F5F9] px-3 py-2.5 text-left last:border-b-0 hover:bg-[#EFF6FF]"
                              >
                                <span className="text-sm font-bold text-[#0F172A]">{employee.employeeCode}</span>
                                <span className="text-xs font-semibold text-[#64748B]">
                                  {employee.employeeName} · {employee.department}
                                </span>
                              </button>
                            ))
                          ) : (
                            <p className="px-3 py-4 text-sm font-semibold text-[#64748B]">No employees match that search.</p>
                          )}
                        </div>
                      ) : null}
                    </div>
                    {form.employeeCode ? (
                      <p className="mt-1.5 text-xs font-semibold text-emerald-700">Selected: {form.employeeCode}</p>
                    ) : (
                      <p className="mt-1.5 text-xs font-semibold text-amber-700">Select an employee from the search results.</p>
                    )}
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-[#64748B]">
                      Employee name
                    </label>
                    <input
                      value={form.employeeName}
                      readOnly
                      placeholder="Populates when employee is selected"
                      className="min-h-11 w-full cursor-default rounded-xl border border-[#E6EAF2] bg-[#F1F5F9] px-3 text-sm font-semibold text-[#0F172A]"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-[#64748B]">
                      Department
                    </label>
                    <select
                      value={form.department}
                      onChange={(event) => setForm((prev) => ({
                        ...prev,
                        department: event.target.value,
                        venue: prev.venue || (event.target.value ? `${event.target.value} floor` : prev.venue),
                      }))}
                      className="min-h-11 w-full rounded-xl border border-[#E6EAF2] bg-white px-3 text-sm font-semibold text-[#0F172A] outline-none ring-[#2563EB] focus:ring-2"
                    >
                      <option value="">Select department</option>
                      {departmentOptions.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-[#64748B]">
                      Induction type
                    </label>
                    <select
                      value={form.kind}
                      onChange={(event) => {
                        const kind = event.target.value as InductionKind;
                        setForm((prev) => ({
                          ...prev,
                          kind,
                          facilitator:
                            kind === 'HSE'
                              ? 'HSE Officer'
                              : kind === 'IT'
                                ? 'IT Administrator'
                                : kind === 'Corporate'
                                  ? 'HR Officer'
                                  : 'Department Head',
                        }));
                      }}
                      className="min-h-11 w-full rounded-xl border border-[#E6EAF2] bg-white px-3 text-sm font-semibold text-[#0F172A] outline-none ring-[#2563EB] focus:ring-2"
                    >
                      {workspace.kinds.map((kind) => (
                        <option key={kind} value={kind}>
                          {kind}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-[#64748B]">
                      Status
                    </label>
                    <select
                      value={form.status}
                      onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value as InductionStatus }))}
                      className="min-h-11 w-full rounded-xl border border-[#E6EAF2] bg-white px-3 text-sm font-semibold text-[#0F172A] outline-none ring-[#2563EB] focus:ring-2"
                    >
                      {STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-[#64748B]">
                      Date & time
                    </label>
                    <input
                      type="datetime-local"
                      value={form.scheduledFor}
                      onChange={(event) => setForm((prev) => ({ ...prev, scheduledFor: event.target.value }))}
                      className="min-h-11 w-full rounded-xl border border-[#E6EAF2] bg-white px-3 text-sm font-semibold text-[#0F172A] outline-none ring-[#2563EB] focus:ring-2"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-[#64748B]">
                      Facilitator
                    </label>
                    <input
                      value={form.facilitator}
                      onChange={(event) => setForm((prev) => ({ ...prev, facilitator: event.target.value }))}
                      placeholder="Facilitator"
                      className="min-h-11 w-full rounded-xl border border-[#E6EAF2] bg-white px-3 text-sm font-semibold text-[#0F172A] outline-none ring-[#2563EB] focus:ring-2"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-[#64748B]">
                      Venue
                    </label>
                    <input
                      value={form.venue}
                      onChange={(event) => setForm((prev) => ({ ...prev, venue: event.target.value }))}
                      placeholder="Venue / room"
                      className="min-h-11 w-full rounded-xl border border-[#E6EAF2] bg-white px-3 text-sm font-semibold text-[#0F172A] outline-none ring-[#2563EB] focus:ring-2"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-[#64748B]">
                      Notes
                    </label>
                    <textarea
                      value={form.notes}
                      onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
                      rows={3}
                      placeholder="Optional notes for facilitators"
                      className="w-full rounded-xl border border-[#E6EAF2] bg-white px-3 py-2.5 text-sm font-semibold text-[#0F172A] outline-none ring-[#2563EB] focus:ring-2"
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-col-reverse gap-2 border-t border-[#E6EAF2] bg-[#F8FAFC] px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs font-semibold text-[#64748B]">
                  {form.jobTitle ? `${form.jobTitle} · ` : ''}
                  {form.location || 'Location set on save'}
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setComposerOpen(false);
                      setEmployeeMenuOpen(false);
                    }}
                    className="min-h-11 rounded-xl border border-[#E6EAF2] bg-white px-4 text-sm font-bold text-[#0F172A] hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(busyId) || !form.employeeCode || !form.employeeName || !form.department || !form.scheduledFor}
                    onClick={() => void saveSession()}
                    className="min-h-11 rounded-xl bg-[#2563EB] px-5 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {busyId ? 'Saving…' : 'Save Induction'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <section className="rounded-2xl border border-[#E6EAF2] bg-white shadow-[0_1px_2px_rgba(15,23,42,.04),0_8px_24px_rgba(15,23,42,.06)]">
          <div className="border-b border-[#E6EAF2] px-5 py-4">
            <h2 className="text-lg font-bold text-[#0F172A]">Induction register</h2>
            <p className="text-sm text-[#64748B]">
              {fmtNum(filtered.length)} session{filtered.length === 1 ? '' : 's'} · live + suggested from new-hire cohort
            </p>
          </div>

          {!filtered.length ? (
            <div className="flex flex-col items-center justify-center px-5 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#EFF6FF] text-[#2563EB]">
                <CalendarClock className="h-6 w-6" />
              </div>
              <p className="mt-4 text-base font-bold text-[#0F172A]">No induction sessions found</p>
              <p className="mt-1 max-w-md text-sm text-[#64748B]">
                Schedule the first induction, or wait for new hires to appear in the onboarding cohort.
              </p>
              <button
                type="button"
                onClick={() => openCreate()}
                className="mt-4 inline-flex items-center gap-2 rounded-[10px] bg-[#2563EB] px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" />
                Schedule Induction
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[#F8FAFC] text-xs uppercase tracking-wide text-[#64748B]">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Employee</th>
                    <th className="px-4 py-3 font-semibold">Type</th>
                    <th className="px-4 py-3 font-semibold">When</th>
                    <th className="px-4 py-3 font-semibold">Facilitator</th>
                    <th className="px-4 py-3 font-semibold">Venue</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((session) => (
                    <tr key={session.id} className="border-t border-[#E6EAF2]">
                      <td className="px-4 py-3">
                        <p className="font-bold text-[#0F172A]">{session.employeeName}</p>
                        <p className="text-xs font-semibold text-[#64748B]">
                          {session.employeeCode} · {session.department}
                        </p>
                      </td>
                      <td className="px-4 py-3 font-semibold text-[#334155]">{session.kind}</td>
                      <td className="px-4 py-3 text-[#475569]">{fmtDateTime(session.scheduledFor)}</td>
                      <td className="px-4 py-3 text-[#475569]">{session.facilitator}</td>
                      <td className="px-4 py-3 text-[#475569]">{session.venue || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${statusStyles[session.status]}`}>
                          {session.status}
                        </span>
                        {session.source === 'inferred' ? (
                          <p className="mt-1 text-[11px] font-semibold text-[#94A3B8]">Suggested</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => openCreate(session)}
                            className="rounded-lg border border-[#E6EAF2] bg-white px-2.5 py-1.5 text-xs font-bold text-[#2563EB] hover:bg-[#EFF6FF]"
                          >
                            Edit
                          </button>
                          {session.status !== 'Completed' && session.status !== 'Cancelled' ? (
                            <button
                              type="button"
                              disabled={busyId === session.id}
                              onClick={() => void quickComplete(session)}
                              className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-800 disabled:opacity-60"
                            >
                              Complete
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="flex flex-col gap-2 border-t border-[#E6EAF2] pt-4 text-xs font-semibold text-[#64748B] sm:flex-row sm:items-center sm:justify-between">
          <p>
            Module access: <span className="font-mono text-[#0F172A]">hris.onboarding.induction-schedule</span>
          </p>
          <p>
            Last loaded: {fmtDateTime(workspace.generatedAt)} · {workspace.source}
          </p>
        </div>
      </div>
    </div>
  );
}
