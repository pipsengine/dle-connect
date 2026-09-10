'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Clock, FileText, RefreshCcw, ShieldCheck, Users } from 'lucide-react';
import { PageTemplate } from '@/components/layout/page-template';

type TimesheetStatus =
  | 'Draft'
  | 'Submitted'
  | 'Supervisor_Reviewed'
  | 'Project_Manager_Reviewed'
  | 'Cost_Control_Reviewed'
  | 'HR_Acknowledged'
  | 'HR_Reviewed'
  | 'Project_Control_Reviewed'
  | 'Approved'
  | 'Locked'
  | 'Rejected'
  | 'Returned';

type TimesheetHeader = {
  id: string;
  timesheetDate: string;
  supervisorName: string;
  workCenterName: string;
  status: TimesheetStatus;
  submittedAt: string | null;
  submittedBy: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  currentApprovalStage?: string | null;
  currentApprover?: string | null;
};

type TimesheetLine = {
  id: string;
  employeeNo: string;
  employeeName: string;
  clockIn: string | null;
  clockOut: string | null;
  attendanceDuration: number;
  projectAllocations: Array<{ projectCode: string; projectName: string; hours: number }>;
  idleAllocations: Array<{ reasonName: string; hours: number; remarks: string | null }>;
  usedHours: number;
  idleHours: number;
  totalHours: number;
  variance: number;
  validationStatus: 'Valid' | 'Error' | 'Warning' | 'Incomplete';
  validationMessage: string | null;
};

type WorkflowStage = {
  id: TimesheetStatus;
  label: string;
  order: number;
};

type Payload = {
  period: { name: string; startDate: string; endDate: string; status: 'Open' | 'Closed' | 'Locked' };
  header: TimesheetHeader | null;
  lines: TimesheetLine[];
  workflowStages: WorkflowStage[];
  summary: {
    totalEmployees: number;
    presentEmployees: number;
    absentEmployees: number;
    usedHours: number;
    idleHours: number;
    bookedHours: number;
    productivityPct: number;
  };
};

type ApiResponse = { status: 'success' | 'error'; data?: Payload; error?: string };

const statusLabel = (status: TimesheetStatus | string) =>
  status
    .replace('Supervisor_Reviewed', 'Supervisor Reviewed')
    .replace('Project_Manager_Reviewed', 'Project Manager Reviewed')
    .replace('Cost_Control_Reviewed', 'Cost Control Reviewed')
    .replace('HR_Acknowledged', 'HR Acknowledged')
    .replace(/_/g, ' ');

const statusTone = (status: TimesheetStatus | string) => {
  if (['HR_Acknowledged', 'Approved', 'Locked'].includes(status)) return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'Rejected') return 'border-red-200 bg-red-50 text-red-700';
  if (status === 'Returned') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-indigo-200 bg-indigo-50 text-indigo-700';
};

const fmtDate = (value: string | null | undefined) =>
  value ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value)) : '-';

const fmtDateTime = (value: string | null | undefined) =>
  value ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '-';

export default function TimesheetReviewClient() {
  const searchParams = useSearchParams();
  const headerId = searchParams.get('headerId') || '';
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!headerId) {
      setError('Timesheet header ID is required.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/hris/time-and-logs/timesheet-entry?headerId=${encodeURIComponent(headerId)}`, { cache: 'no-store' });
      const json = (await res.json()) as ApiResponse;
      if (!res.ok || json.status !== 'success' || !json.data) throw new Error(json.error || 'Unable to load timesheet review');
      setPayload(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load timesheet review');
    } finally {
      setLoading(false);
    }
  }, [headerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const projectSummary = useMemo(() => {
    const projects = new Map<string, { code: string; name: string; hours: number; employees: Set<string> }>();
    for (const line of payload?.lines || []) {
      for (const allocation of line.projectAllocations || []) {
        if (!allocation.projectCode || Number(allocation.hours || 0) <= 0) continue;
        const current = projects.get(allocation.projectCode) || { code: allocation.projectCode, name: allocation.projectName || allocation.projectCode, hours: 0, employees: new Set<string>() };
        current.hours = Math.round((current.hours + Number(allocation.hours || 0)) * 10) / 10;
        current.employees.add(line.employeeNo || line.employeeName);
        projects.set(allocation.projectCode, current);
      }
    }
    return Array.from(projects.values()).sort((a, b) => b.hours - a.hours || a.code.localeCompare(b.code));
  }, [payload?.lines]);

  const activeStageIndex = Math.max(0, (payload?.workflowStages || []).findIndex((stage) => stage.id === payload?.header?.status));

  return (
    <PageTemplate
      title="Timesheet Review"
      description="Read-only timesheet detail for project manager, cost control, HR, and audit review."
      breadcrumbs={[{ label: 'HRIS', href: '/hris' }, { label: 'Workforce Management', href: '/hris/workforce-management' }, { label: 'Timesheet Review' }]}
      primaryAction={{ label: 'Refresh', onClick: load, icon: RefreshCcw }}
      secondaryAction={{ label: 'Back to Approvals', onClick: () => { window.location.href = '/hris/time-and-logs/timesheet-approval'; }, icon: ArrowLeft }}
    >
      {loading ? (
        <div className="flex h-96 items-center justify-center rounded-2xl border border-slate-200 bg-white">
          <RefreshCcw className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>
      ) : !payload?.header ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700">Timesheet not found.</div>
      ) : (
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-black tracking-tight text-slate-950">{payload.header.workCenterName}</h1>
                  <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest ${statusTone(payload.header.status)}`}>{statusLabel(payload.header.status)}</span>
                </div>
                <p className="mt-2 text-sm font-bold text-slate-500">
                  {fmtDate(payload.header.timesheetDate)} / {payload.period.name} / Supervisor: {payload.header.supervisorName}
                </p>
                {payload.header.currentApprovalStage ? (
                  <p className="mt-2 text-xs font-black uppercase tracking-widest text-indigo-700">Waiting: {payload.header.currentApprovalStage} {payload.header.currentApprover ? `/ ${payload.header.currentApprover}` : ''}</p>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-3 text-right text-xs font-bold text-slate-500 sm:grid-cols-4">
                <div><p className="uppercase tracking-widest text-slate-400">Submitted</p><p className="mt-1 text-slate-900">{fmtDateTime(payload.header.submittedAt)}</p></div>
                <div><p className="uppercase tracking-widest text-slate-400">Submitted By</p><p className="mt-1 text-slate-900">{payload.header.submittedBy || '-'}</p></div>
                <div><p className="uppercase tracking-widest text-slate-400">Period</p><p className="mt-1 text-slate-900">{payload.period.status}</p></div>
                <div><p className="uppercase tracking-widest text-slate-400">Mode</p><p className="mt-1 text-slate-900">Read Only</p></div>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-6">
              {[
                { label: 'Crew', value: payload.summary.totalEmployees, icon: Users },
                { label: 'Present', value: payload.summary.presentEmployees, icon: CheckCircle2 },
                { label: 'Absent', value: payload.summary.absentEmployees, icon: Clock },
                { label: 'Productive Hrs', value: `${payload.summary.usedHours}h`, icon: FileText },
                { label: 'Idle / Break Hrs', value: `${payload.summary.idleHours}h`, icon: Clock },
                { label: 'Productivity', value: `${payload.summary.productivityPct}%`, icon: ShieldCheck },
              ].map((metric) => (
                <div key={metric.label} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between">
                    <metric.icon className="h-4 w-4 text-indigo-600" />
                    <span className="text-lg font-black text-slate-950">{metric.value}</span>
                  </div>
                  <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-slate-400">{metric.label}</p>
                </div>
              ))}
            </div>

            <div className="mt-6">
              <div className="relative flex justify-between">
                {payload.workflowStages.map((stage, index) => (
                  <div key={stage.id} className="relative z-10 flex max-w-[120px] flex-col items-center gap-2 text-center">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-black ${index <= activeStageIndex ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 bg-white text-slate-400'}`}>
                      {index < activeStageIndex ? <CheckCircle2 className="h-4 w-4" /> : stage.order}
                    </div>
                    <span className={`text-[9px] font-black uppercase leading-tight ${index <= activeStageIndex ? 'text-indigo-700' : 'text-slate-400'}`}>{stage.label}</span>
                  </div>
                ))}
                <div className="absolute left-0 top-4 h-0.5 w-full -translate-y-1/2 bg-slate-100">
                  <div className="h-full bg-indigo-600" style={{ width: `${payload.workflowStages.length > 1 ? (activeStageIndex / (payload.workflowStages.length - 1)) * 100 : 0}%` }} />
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-sm font-black uppercase tracking-widest text-slate-900">Project Split Summary</h2>
            </div>
            <div className="grid grid-cols-1 gap-3 p-5 md:grid-cols-2 xl:grid-cols-4">
              {projectSummary.length ? projectSummary.map((project) => (
                <div key={project.code} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-black text-slate-950">{project.code}</div>
                  <div className="mt-1 truncate text-[11px] font-bold text-slate-500">{project.name}</div>
                  <div className="mt-3 flex items-end justify-between">
                    <span className="text-xl font-black text-indigo-700">{project.hours}h</span>
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{project.employees.size} employees</span>
                  </div>
                </div>
              )) : (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-700">No project allocations found.</div>
              )}
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-sm font-black uppercase tracking-widest text-slate-900">Employee Timesheet Detail</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    {['Employee', 'Clock', 'Attendance', 'Project Allocations', 'Idle / Break Detail', 'Totals', 'Status'].map((header) => (
                      <th key={header} className="px-5 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500">{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payload.lines.map((line) => (
                    <tr key={line.id} className="align-top hover:bg-slate-50/60">
                      <td className="px-5 py-4">
                        <div className="text-[10px] font-black uppercase tracking-widest text-indigo-600">{line.employeeNo}</div>
                        <div className="mt-1 font-black text-slate-950">{line.employeeName}</div>
                      </td>
                      <td className="px-5 py-4 text-xs font-black text-slate-700">{line.clockIn ? `${line.clockIn} - ${line.clockOut || '--:--'}` : 'Absent'}</td>
                      <td className="px-5 py-4 text-xs font-bold text-slate-600">{line.attendanceDuration}h</td>
                      <td className="px-5 py-4">
                        <div className="flex max-w-[360px] flex-wrap gap-2">
                          {(line.projectAllocations || []).filter((allocation) => Number(allocation.hours || 0) > 0).map((allocation) => (
                            <span key={`${line.id}-${allocation.projectCode}`} className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-[10px] font-black text-blue-800">
                              {allocation.projectCode}: {allocation.hours}h
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex max-w-[300px] flex-wrap gap-2">
                          {(line.idleAllocations || []).filter((allocation) => Number(allocation.hours || 0) > 0).map((allocation, index) => (
                            <span key={`${line.id}-idle-${index}`} className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-black text-amber-800">
                              {allocation.reasonName}: {allocation.hours}h
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="grid grid-cols-3 gap-2 text-center text-[10px] font-black">
                          <div className="rounded-lg bg-blue-50 px-2 py-1 text-blue-700">Used {line.usedHours}h</div>
                          <div className="rounded-lg bg-amber-50 px-2 py-1 text-amber-700">Idle {line.idleHours}h</div>
                          <div className="rounded-lg bg-emerald-50 px-2 py-1 text-emerald-700">Total {line.totalHours}h</div>
                        </div>
                        <div className="mt-2 text-center text-[10px] font-black text-slate-500">Variance {line.variance > 0 ? `+${line.variance}` : line.variance}</div>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${line.validationStatus === 'Valid' ? 'bg-emerald-100 text-emerald-700' : line.validationStatus === 'Error' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                          {line.validationStatus === 'Valid' ? 'Complete' : line.validationStatus}
                        </span>
                        {line.validationMessage ? <p className="mt-2 max-w-[220px] text-[10px] font-semibold text-slate-500">{line.validationMessage}</p> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="flex justify-end">
            <Link href="/hris/time-and-logs/timesheet-approval" className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white hover:bg-slate-800">
              <ArrowLeft className="h-4 w-4" />
              Back to Approval Queue
            </Link>
          </div>
        </div>
      )}
    </PageTemplate>
  );
}
