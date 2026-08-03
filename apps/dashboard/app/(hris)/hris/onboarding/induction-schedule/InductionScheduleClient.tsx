'use client';

import { useMemo, useState } from 'react';
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
} from 'lucide-react';
import type {
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
    }
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
          <section className="rounded-2xl border border-[#BFDBFE] bg-[#EFF6FF] p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-[#0F172A]">{form.id ? 'Edit induction' : 'Schedule induction'}</h2>
              <button type="button" onClick={() => setComposerOpen(false)} className="text-sm font-bold text-[#2563EB]">
                Close
              </button>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              <input
                value={form.employeeCode}
                onChange={(event) => setForm((prev) => ({ ...prev, employeeCode: event.target.value }))}
                placeholder="Employee code"
                className="min-h-10 rounded-[10px] border border-[#E6EAF2] bg-white px-3 text-sm font-semibold"
              />
              <input
                value={form.employeeName}
                onChange={(event) => setForm((prev) => ({ ...prev, employeeName: event.target.value }))}
                placeholder="Employee name"
                className="min-h-10 rounded-[10px] border border-[#E6EAF2] bg-white px-3 text-sm font-semibold"
              />
              <input
                value={form.department}
                onChange={(event) => setForm((prev) => ({ ...prev, department: event.target.value }))}
                placeholder="Department"
                className="min-h-10 rounded-[10px] border border-[#E6EAF2] bg-white px-3 text-sm font-semibold"
              />
              <select
                value={form.kind}
                onChange={(event) => {
                  const kind = event.target.value as InductionKind;
                  setForm((prev) => ({
                    ...prev,
                    kind,
                    facilitator: prev.facilitator || (
                      kind === 'HSE' ? 'HSE Officer' : kind === 'IT' ? 'IT Administrator' : kind === 'Corporate' ? 'HR Officer' : 'Department Head'
                    ),
                  }));
                }}
                className="min-h-10 rounded-[10px] border border-[#E6EAF2] bg-white px-3 text-sm font-semibold"
              >
                {workspace.kinds.map((kind) => (
                  <option key={kind} value={kind}>
                    {kind}
                  </option>
                ))}
              </select>
              <select
                value={form.status}
                onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value as InductionStatus }))}
                className="min-h-10 rounded-[10px] border border-[#E6EAF2] bg-white px-3 text-sm font-semibold"
              >
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
              <input
                type="datetime-local"
                value={form.scheduledFor}
                onChange={(event) => setForm((prev) => ({ ...prev, scheduledFor: event.target.value }))}
                className="min-h-10 rounded-[10px] border border-[#E6EAF2] bg-white px-3 text-sm font-semibold"
              />
              <input
                value={form.facilitator}
                onChange={(event) => setForm((prev) => ({ ...prev, facilitator: event.target.value }))}
                placeholder="Facilitator"
                className="min-h-10 rounded-[10px] border border-[#E6EAF2] bg-white px-3 text-sm font-semibold"
              />
              <input
                value={form.venue}
                onChange={(event) => setForm((prev) => ({ ...prev, venue: event.target.value }))}
                placeholder="Venue"
                className="min-h-10 rounded-[10px] border border-[#E6EAF2] bg-white px-3 text-sm font-semibold"
              />
              <input
                value={form.notes}
                onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
                placeholder="Notes"
                className="min-h-10 rounded-[10px] border border-[#E6EAF2] bg-white px-3 text-sm font-semibold md:col-span-2 xl:col-span-1"
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setComposerOpen(false)}
                className="rounded-[10px] border border-[#E6EAF2] bg-white px-4 py-2 text-sm font-bold text-[#0F172A]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={Boolean(busyId) || !form.employeeCode || !form.employeeName || !form.scheduledFor}
                onClick={() => void saveSession()}
                className="rounded-[10px] bg-[#2563EB] px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
              >
                {busyId ? 'Saving…' : 'Save Induction'}
              </button>
            </div>
          </section>
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
