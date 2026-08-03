'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Hourglass,
  Plus,
  RefreshCcw,
  Search,
  Users,
} from 'lucide-react';
import type {
  ChecklistTaskStatus,
  NewHireChecklistEmployeeRow,
  NewHireChecklistWorkspace,
} from '@/lib/new-hire-checklist-service';

type Props = {
  initialWorkspace: NewHireChecklistWorkspace;
};

const numberFmt = new Intl.NumberFormat('en-GB');
const fmtNum = (value: number) => numberFmt.format(Math.round(value));
const fmtDate = (value: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};
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

const statusStyles: Record<ChecklistTaskStatus, string> = {
  Completed: 'bg-emerald-100 text-emerald-800',
  'In Progress': 'bg-blue-100 text-blue-800',
  Pending: 'bg-amber-100 text-amber-900',
  Overdue: 'bg-rose-100 text-rose-800',
  Blocked: 'bg-slate-200 text-slate-700',
};

const STATUS_OPTIONS: ChecklistTaskStatus[] = ['Pending', 'In Progress', 'Completed', 'Blocked', 'Overdue'];

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

export default function NewHireChecklistClient({ initialWorkspace }: Props) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState('All');
  const [officer, setOfficer] = useState('All');
  const [statusFilter, setStatusFilter] = useState<'All' | ChecklistTaskStatus>('All');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState('');
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(false);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return workspace.rows.filter((row) => {
      if (department !== 'All' && row.department !== department) return false;
      if (officer !== 'All' && !row.tasks.some((task) => task.responsibleOfficer === officer)) return false;
      if (statusFilter !== 'All' && !row.tasks.some((task) => task.status === statusFilter)) return false;
      if (!q) return true;
      return (
        row.employeeName.toLowerCase().includes(q)
        || row.employeeCode.toLowerCase().includes(q)
        || row.department.toLowerCase().includes(q)
        || row.jobTitle.toLowerCase().includes(q)
      );
    });
  }, [workspace.rows, query, department, officer, statusFilter]);

  const refresh = async () => {
    setLoading(true);
    setToast('');
    try {
      const res = await fetch('/api/hris/onboarding/new-hire-checklist', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Refresh failed');
      setWorkspace(json.data as NewHireChecklistWorkspace);
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Refresh failed');
    } finally {
      setLoading(false);
    }
  };

  const updateTask = async (row: NewHireChecklistEmployeeRow, externalId: string, status: ChecklistTaskStatus) => {
    if (!row.employeeDbId) {
      setToast('This employee record is not linked to the HRIS database yet, so the task cannot be saved.');
      return;
    }
    const key = `${row.employeeCode}-${externalId}`;
    setBusyKey(key);
    setToast('');
    try {
      const task = row.tasks.find((item) => item.externalId === externalId);
      const res = await fetch('/api/hris/onboarding/new-hire-checklist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'update-task',
          employeeDbId: row.employeeDbId,
          externalId,
          status,
          title: task?.title,
          responsibleOfficer: task?.responsibleOfficer,
          dueDate: task?.dueDate,
          notes: task?.notes,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Update failed');
      if (json.data?.workspace) setWorkspace(json.data.workspace as NewHireChecklistWorkspace);
      setToast(`Updated ${task?.title || 'task'} to ${status}.`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Update failed');
    } finally {
      setBusyKey('');
    }
  };

  const kpis = [
    { label: 'New Hires', value: workspace.summary.newHires, color: '#6366F1', soft: '#EEF2FF', icon: Users },
    { label: 'Open Tasks', value: workspace.summary.openTasks, color: '#F59E0B', soft: '#FFFBEB', icon: ClipboardList },
    { label: 'Completed Tasks', value: workspace.summary.completedTasks, color: '#10B981', soft: '#ECFDF5', icon: CheckCircle2 },
    { label: 'Overdue Tasks', value: workspace.summary.overdueTasks, color: '#EF4444', soft: '#FEF2F2', icon: AlertTriangle },
    { label: 'Avg. Progress', value: workspace.summary.avgProgressPct, color: '#2563EB', soft: '#EFF6FF', icon: Hourglass, suffix: '%' },
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
          <span className="font-bold text-[#0F172A]">New Hire Checklist</span>
        </nav>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="hidden h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[#EFF6FF] text-[#2563EB] sm:flex">
              <ClipboardList className="h-8 w-8" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[#0F172A] sm:text-3xl">New Hire Checklist</h1>
              <p className="mt-1 max-w-2xl text-sm text-[#64748B]">
                Track onboarding tasks for recent joiners and probation staff. Live progress comes from HRIS checklist records and employee profile readiness.
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
            <Link
              href="/hris/employees/add-new-employee"
              className="inline-flex min-h-10 items-center gap-2 rounded-[10px] bg-[#2563EB] px-4 text-sm font-bold text-white shadow-sm hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              New Onboarding
            </Link>
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
                    <p className="mt-2 text-3xl font-bold tabular-nums text-[#0F172A]">
                      {fmtNum(kpi.value)}
                      {kpi.suffix || ''}
                    </p>
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
                placeholder="Search employee, code, department…"
                className="min-h-10 w-full rounded-[10px] border border-[#E6EAF2] bg-[#F8FAFC] py-2 pl-9 pr-3 text-sm font-semibold text-[#0F172A]"
              />
            </label>
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
            <select
              value={officer}
              onChange={(event) => setOfficer(event.target.value)}
              className="min-h-10 rounded-[10px] border border-[#E6EAF2] bg-white px-3 text-sm font-semibold text-[#0F172A]"
            >
              <option value="All">All officers</option>
              {workspace.officers.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {(['All', ...STATUS_OPTIONS] as Array<'All' | ChecklistTaskStatus>).map((item) => (
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

        <section className="rounded-2xl border border-[#E6EAF2] bg-white shadow-[0_1px_2px_rgba(15,23,42,.04),0_8px_24px_rgba(15,23,42,.06)]">
          <div className="flex items-center justify-between gap-3 border-b border-[#E6EAF2] px-5 py-4">
            <div>
              <h2 className="text-lg font-bold text-[#0F172A]">Checklist register</h2>
              <p className="text-sm text-[#64748B]">
                {fmtNum(filteredRows.length)} new hire{filteredRows.length === 1 ? '' : 's'} · {workspace.template.length} standard tasks
              </p>
            </div>
          </div>

          {!filteredRows.length ? (
            <div className="flex flex-col items-center justify-center px-5 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#EFF6FF] text-[#2563EB]">
                <ClipboardList className="h-6 w-6" />
              </div>
              <p className="mt-4 text-base font-bold text-[#0F172A]">No checklist records match</p>
              <p className="mt-1 max-w-md text-sm text-[#64748B]">
                Adjust filters, or start onboarding for a new employee to generate the standard checklist.
              </p>
              <Link
                href="/hris/employees/add-new-employee"
                className="mt-4 inline-flex items-center gap-2 rounded-[10px] bg-[#2563EB] px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" />
                New Onboarding
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-[#E6EAF2]">
              {filteredRows.map((row) => {
                const open = expanded === row.employeeCode;
                return (
                  <div key={row.employeeCode} className="px-5 py-4">
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? null : row.employeeCode)}
                      className="flex w-full items-start justify-between gap-4 text-left"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-base font-bold text-[#0F172A]">{row.employeeName}</p>
                          <span className="rounded-full bg-[#F1F5F9] px-2 py-0.5 text-xs font-bold text-[#475569]">{row.employeeCode}</span>
                          {row.overdueCount > 0 ? (
                            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-800">
                              {row.overdueCount} overdue
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-sm text-[#64748B]">
                          {row.jobTitle} · {row.department} · Joined {fmtDate(row.dateJoined)}
                        </p>
                        <div className="mt-3 flex items-center gap-3">
                          <div className="h-2 max-w-xs flex-1 overflow-hidden rounded-full bg-[#E2E8F0]">
                            <div className="h-full rounded-full bg-[#2563EB]" style={{ width: `${Math.min(100, row.progressPct)}%` }} />
                          </div>
                          <span className="text-xs font-bold tabular-nums text-[#0F172A]">{row.progressPct}%</span>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <div className="hidden text-right text-xs font-semibold text-[#64748B] sm:block">
                          <p>
                            <span className="text-emerald-700">{row.completedCount}</span> done
                          </p>
                          <p>
                            <span className="text-amber-700">{row.pendingCount}</span> open
                          </p>
                        </div>
                        {open ? <ChevronDown className="h-5 w-5 text-[#94A3B8]" /> : <ChevronRight className="h-5 w-5 text-[#94A3B8]" />}
                      </div>
                    </button>

                    {open ? (
                      <div className="mt-4 overflow-x-auto rounded-xl border border-[#E6EAF2]">
                        <table className="min-w-full text-left text-sm">
                          <thead className="bg-[#F8FAFC] text-xs uppercase tracking-wide text-[#64748B]">
                            <tr>
                              <th className="px-3 py-2.5 font-semibold">Task</th>
                              <th className="px-3 py-2.5 font-semibold">Owner</th>
                              <th className="px-3 py-2.5 font-semibold">Due</th>
                              <th className="px-3 py-2.5 font-semibold">Status</th>
                              <th className="px-3 py-2.5 font-semibold">Source</th>
                            </tr>
                          </thead>
                          <tbody>
                            {row.tasks.map((task) => {
                              const busy = busyKey === `${row.employeeCode}-${task.externalId}`;
                              return (
                                <tr key={task.id} className="border-t border-[#E6EAF2]">
                                  <td className="px-3 py-2.5">
                                    <p className="font-semibold text-[#0F172A]">{task.title}</p>
                                    <p className="text-xs text-[#64748B]">{task.category}</p>
                                  </td>
                                  <td className="px-3 py-2.5 text-[#475569]">{task.responsibleOfficer}</td>
                                  <td className="px-3 py-2.5 text-[#475569]">{fmtDate(task.dueDate)}</td>
                                  <td className="px-3 py-2.5">
                                    <select
                                      value={task.status}
                                      disabled={busy || !row.employeeDbId}
                                      onChange={(event) => void updateTask(row, task.externalId, event.target.value as ChecklistTaskStatus)}
                                      className={`rounded-full px-2.5 py-1 text-xs font-bold disabled:opacity-60 ${statusStyles[task.status]}`}
                                    >
                                      {STATUS_OPTIONS.map((option) => (
                                        <option key={option} value={option}>
                                          {option}
                                        </option>
                                      ))}
                                    </select>
                                  </td>
                                  <td className="px-3 py-2.5 text-xs font-semibold text-[#64748B]">
                                    {task.source === 'sql' ? 'Saved' : 'Inferred'}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <div className="flex flex-col gap-2 border-t border-[#E6EAF2] pt-4 text-xs font-semibold text-[#64748B] sm:flex-row sm:items-center sm:justify-between">
          <p>
            Module access: <span className="font-mono text-[#0F172A]">hris.onboarding.new-hire-checklist</span>
          </p>
          <p>
            Last loaded: {fmtDateTime(workspace.generatedAt)} · {workspace.source}
          </p>
        </div>
      </div>
    </div>
  );
}
