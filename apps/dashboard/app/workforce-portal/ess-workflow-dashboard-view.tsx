'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock,
  Download,
  Filter,
  GitBranch,
  Search,
  ShieldAlert,
  Sparkles,
  Timer,
  UserCheck,
  XCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  EssCard,
  EssDonutChart,
  EssKpiCard,
  EssNotificationItem,
  EssProgressBar,
  EssSectionHeader,
  EssSparkline,
} from './ess-portal-ui';
import type { WorkflowIntelligence, WorkflowStageNode } from '@/lib/ess-workflow-intelligence';
import type { EssTab } from './ess-portal-shell';
import { EssWorkflowDiagnosticsBanner } from './ess-workflow-delivery-panel';

export type EssWorkflowPayload = {
  generatedAt?: string;
  employee?: { employeeId: string; fullName: string; department: string; manager: string; jobTitle?: string };
  workflowIntelligence?: WorkflowIntelligence;
};

const fmtDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const statusBadgeClass = (status: string) => {
  const text = status.toLowerCase();
  if (/approv|complet|deliver|closed/.test(text)) return 'bg-[#ECFDF5] text-[#047857]';
  if (/reject|terminat|cancel/.test(text)) return 'bg-[#FEF2F2] text-[#B91C1C]';
  if (/escalat|overdue|breach/.test(text)) return 'bg-[#FDF2F8] text-[#BE185D]';
  if (/pending|review|submitted|current/.test(text)) return 'bg-[#FFF7ED] text-[#B45309]';
  return 'bg-[#EFF6FF] text-[#1D4ED8]';
};

const stageNodeStyles = (state: WorkflowStageNode['state']) => {
  if (state === 'completed') return { ring: 'ring-emerald-200', bg: 'bg-emerald-50', border: 'border-emerald-300', dot: 'bg-emerald-500', text: 'text-emerald-800' };
  if (state === 'current') return { ring: 'ring-blue-300', bg: 'bg-blue-50', border: 'border-blue-500', dot: 'bg-blue-500 animate-pulse', text: 'text-blue-900' };
  if (state === 'escalated') return { ring: 'ring-red-300', bg: 'bg-red-50', border: 'border-red-400', dot: 'bg-red-500 animate-pulse', text: 'text-red-900' };
  if (state === 'rejected') return { ring: 'ring-red-200', bg: 'bg-red-50', border: 'border-red-300', dot: 'bg-red-500', text: 'text-red-800' };
  return { ring: 'ring-slate-200', bg: 'bg-slate-50', border: 'border-slate-200', dot: 'bg-slate-300', text: 'text-slate-600' };
};

function WorkflowNode({ stage }: { stage: WorkflowStageNode }) {
  const styles = stageNodeStyles(stage.state);
  return (
    <div className={`min-w-[132px] max-w-[148px] rounded-[16px] border p-3 shadow-[0_8px_24px_rgba(15,23,42,0.06)] ring-2 ${styles.ring} ${styles.bg} ${styles.border}`}>
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${styles.dot}`} />
        <p className={`text-[11px] font-bold uppercase tracking-wide ${styles.text}`}>{stage.label}</p>
      </div>
      <p className="mt-2 truncate text-[12px] font-semibold text-[#0F172A]">{stage.owner}</p>
      <p className="mt-1 text-[11px] capitalize text-[#64748B]">{stage.state.replace('-', ' ')}</p>
      {stage.actedAt ? <p className="mt-1 text-[10px] text-[#94A3B8]">{fmtDateTime(stage.actedAt)}</p> : null}
      {stage.state === 'current' || stage.state === 'escalated' ? (
        <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-bold text-[#B45309]">
          <Timer className="h-3 w-3" />
          {stage.elapsedHours ?? 0}h
        </p>
      ) : null}
    </div>
  );
}

function Connector({ state }: { state: WorkflowStageNode['state'] }) {
  const color = state === 'completed' ? '#22C55E' : state === 'current' || state === 'escalated' ? '#F59E0B' : state === 'rejected' ? '#EF4444' : '#CBD5E1';
  return (
    <div className="hidden min-w-[28px] flex-1 items-center md:flex">
      <div className="h-0.5 w-full rounded-full" style={{ background: `linear-gradient(90deg, ${color}, ${color}88)` }} />
      <ChevronRight className="h-4 w-4 shrink-0 text-[#94A3B8]" />
    </div>
  );
}

export default function EssWorkflowDashboardView({
  payload,
  onRefresh,
  onNavigate,
  workflowDiagnostics,
}: {
  payload: EssWorkflowPayload | null;
  onRefresh: () => void;
  onNavigate: (tab: EssTab, options?: { leaveSection?: string }) => void;
  workflowDiagnostics?: {
    mailProvider?: string | null;
    mailConfigured?: boolean;
    recentFailures?: Array<{ step: string; channel: string; status: string; createdAt: string; error?: string; requestId?: string }>;
  };
}) {
  const intelligence = payload?.workflowIntelligence;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [sortKey, setSortKey] = useState<'submittedAt' | 'elapsedHours' | 'priority'>('submittedAt');

  useEffect(() => {
    const timer = window.setInterval(() => onRefresh(), 30_000);
    return () => window.clearInterval(timer);
  }, [onRefresh]);

  const selected = useMemo(() => {
    if (!intelligence) return null;
    if (selectedId) return intelligence.register.find((row) => row.id === selectedId) || intelligence.selectedRequest;
    return intelligence.selectedRequest;
  }, [intelligence, selectedId]);

  const filteredRegister = useMemo(() => {
    if (!intelligence) return [];
    return intelligence.register
      .filter((row) => {
        if (statusFilter !== 'All' && !row.status.toLowerCase().includes(statusFilter.toLowerCase())) return false;
        if (!query.trim()) return true;
        const hay = `${row.request} ${row.requestType} ${row.employee} ${row.department} ${row.currentStage} ${row.approver}`.toLowerCase();
        return hay.includes(query.trim().toLowerCase());
      })
      .sort((a, b) => {
        if (sortKey === 'elapsedHours') return b.elapsedHours - a.elapsedHours;
        if (sortKey === 'priority') return b.priority.localeCompare(a.priority);
        return new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime();
      });
  }, [intelligence, query, sortKey, statusFilter]);

  const exportCsv = () => {
    if (!filteredRegister.length) return;
    const headers = ['Employee', 'Request', 'Department', 'Stage', 'Approver', 'Priority', 'Submitted', 'Elapsed Hours', 'SLA', 'Status'];
    const lines = filteredRegister.map((row) =>
      [row.employee, row.request, row.department, row.currentStage, row.approver, row.priority, row.submittedAt, row.elapsedHours, row.slaStatus, row.status]
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(','),
    );
    const blob = new Blob([[headers.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `workflow-register-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (!intelligence) {
    return (
      <EssCard className="p-8 text-center">
        <p className="text-[16px] font-semibold text-[#0F172A]">Loading workflow intelligence…</p>
        <p className="mt-2 text-[14px] text-[#64748B]">Fetching approval paths, SLA metrics, and audit history.</p>
      </EssCard>
    );
  }

  const kpis: Array<{ label: string; value: string; subtitle: string; icon: LucideIcon; accent: string; iconBg: string; trend: number }> = [
    { label: 'Pending Requests', value: String(intelligence.kpis.pendingRequests), subtitle: 'Open workflow items', icon: Clock, accent: '#2563EB', iconBg: '#DBEAFE', trend: intelligence.kpiTrends.pendingRequests },
    { label: 'Approved Today', value: String(intelligence.kpis.approvedToday), subtitle: 'Completed in last 24h', icon: CheckCircle2, accent: '#22C55E', iconBg: '#ECFDF5', trend: intelligence.kpiTrends.approvedToday },
    { label: 'Awaiting My Action', value: String(intelligence.kpis.awaitingMyAction), subtitle: 'Needs your approval', icon: UserCheck, accent: '#F97316', iconBg: '#FFF7ED', trend: intelligence.kpiTrends.awaitingMyAction },
    { label: 'SLA Compliance', value: `${intelligence.kpis.slaCompliancePct}%`, subtitle: 'Within target window', icon: ShieldAlert, accent: '#7C3AED', iconBg: '#F5F3FF', trend: intelligence.kpiTrends.slaCompliancePct },
    { label: 'Escalated', value: String(intelligence.kpis.escalations), subtitle: 'Overdue approvals', icon: AlertTriangle, accent: '#EF4444', iconBg: '#FEF2F2', trend: intelligence.kpiTrends.escalations },
    { label: 'Completed This Month', value: String(intelligence.kpis.completedThisMonth), subtitle: 'Closed successfully', icon: Sparkles, accent: '#06B6D4', iconBg: '#ECFEFF', trend: intelligence.kpiTrends.completedThisMonth },
  ];

  return (
    <div className="space-y-6">
      <EssWorkflowDiagnosticsBanner
        mailProvider={workflowDiagnostics?.mailProvider}
        mailConfigured={workflowDiagnostics?.mailConfigured}
        recentFailures={workflowDiagnostics?.recentFailures}
      />
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[14px] bg-[#ECFDF5] text-[#059669]">
            <GitBranch className="h-7 w-7" />
          </span>
          <div>
            <h1 className="text-[clamp(28px,3vw,40px)] font-bold tracking-tight text-[#0F172A]">Workflow & Approval Tracking</h1>
            <p className="mt-1 max-w-3xl text-[14px] leading-relaxed text-[#64748B]">
              Track every approval stage, monitor workflow health, SLA compliance, escalations, audit history and notifications.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onRefresh} className="rounded-[12px] border border-[#E2E8F0] bg-white px-4 py-2.5 text-[13px] font-semibold text-[#0F172A] shadow-[0_6px_18px_rgba(37,99,235,0.08)] hover:bg-[#F8FAFC]">
            Refresh
          </button>
          <button type="button" onClick={exportCsv} className="inline-flex items-center gap-2 rounded-[12px] bg-[#2563EB] px-4 py-2.5 text-[13px] font-semibold text-white shadow-[0_6px_18px_rgba(37,99,235,0.18)] hover:bg-[#1D4ED8]">
            <Download className="h-4 w-4" />
            Export Register
          </button>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {kpis.map((kpi) => (
          <EssKpiCard key={kpi.label} label={kpi.label} value={kpi.value} subtitle={`${kpi.trend >= 0 ? '+' : ''}${kpi.trend}% vs prior period`} icon={kpi.icon} accent={kpi.accent} iconBg={kpi.iconBg} />
        ))}
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <EssCard className="overflow-hidden p-5 sm:p-6">
            <EssSectionHeader title="Interactive Approval Flow" action={<span className="text-[12px] font-semibold text-[#64748B]">Live status · auto-refresh 30s</span>} />
            {selected ? (
              <>
                <div className="overflow-x-auto pb-2">
                  <div className="flex min-w-max items-center gap-2 py-2">
                    {selected.stages.map((stage, index) => (
                      <div key={stage.id} className="flex items-center gap-2">
                        <WorkflowNode stage={stage} />
                        {index < selected.stages.length - 1 ? <Connector state={stage.state} /> : null}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {[
                    ['Request ID', selected.id],
                    ['Request Type', selected.requestType],
                    ['Employee', selected.employee],
                    ['Department', selected.department],
                    ['Current Approver', selected.approver],
                    ['Submitted', fmtDateTime(selected.submittedAt)],
                    ['Priority', selected.priority],
                    ['SLA', selected.slaStatus],
                    ['Business Process', selected.businessProcess || 'ESS Workflow'],
                    ['Workflow Version', selected.workflowVersion || 'ESS-2026.1'],
                    ['Elapsed', `${selected.elapsedHours}h`],
                    ['Expected Completion', intelligence.aiInsights.likelyCompletion],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-[14px] border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-3">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-[#94A3B8]">{label}</p>
                      <p className="mt-1 text-[13px] font-semibold text-[#0F172A]">{value}</p>
                    </div>
                  ))}
                </div>
                {selected.comments.length ? (
                  <div className="mt-4 space-y-2">
                    {selected.comments.map((comment) => (
                      <div key={`${comment.at}-${comment.actor}`} className="rounded-[12px] border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-[#92400E]">
                        <span className="font-bold">{comment.actor}</span> · {comment.comment}
                      </div>
                    ))}
                  </div>
                ) : null}
                <div className="mt-5 flex flex-wrap gap-2">
                  {intelligence.kpis.awaitingMyAction > 0 ? (
                    <button type="button" onClick={() => onNavigate('leave', { leaveSection: 'Approvals' })} className="rounded-[12px] bg-[#059669] px-4 py-2 text-[12px] font-bold text-white hover:bg-[#047857]">
                      Approve in ESS
                    </button>
                  ) : null}
                  <button type="button" onClick={() => onNavigate('leave', { leaveSection: 'My Applications' })} className="rounded-[12px] border border-[#E2E8F0] bg-white px-4 py-2 text-[12px] font-bold text-[#0F172A] hover:bg-[#F8FAFC]">
                    View Applications
                  </button>
                  <button type="button" onClick={exportCsv} className="rounded-[12px] border border-[#E2E8F0] bg-white px-4 py-2 text-[12px] font-bold text-[#0F172A] hover:bg-[#F8FAFC]">
                    Export PDF / CSV
                  </button>
                </div>
              </>
            ) : (
              <div className="rounded-[16px] border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-6 py-10 text-center">
                <Circle className="mx-auto h-10 w-10 text-[#94A3B8]" />
                <p className="mt-3 text-[16px] font-semibold text-[#0F172A]">No active workflow selected</p>
                <p className="mt-1 text-[14px] text-[#64748B]">Submit a leave or service request, or select a row below to visualize the approval path.</p>
                <button type="button" onClick={() => onNavigate('services')} className="mt-4 rounded-[12px] bg-[#2563EB] px-4 py-2.5 text-[13px] font-bold text-white">
                  Submit Request
                </button>
              </div>
            )}
          </EssCard>

          <EssCard className="p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-2">
              <Bot className="h-5 w-5 text-[#7C3AED]" />
              <h3 className="text-[20px] font-bold text-[#0F172A]">AI Workflow Insights</h3>
              <span className="ml-auto rounded-full bg-[#F5F3FF] px-2.5 py-1 text-[11px] font-bold text-[#7C3AED]">
                {intelligence.aiInsights.confidenceScore}% confidence
              </span>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {[
                ['Delay prediction', intelligence.aiInsights.delayPrediction],
                ['Likely completion', intelligence.aiInsights.likelyCompletion],
                ['Recommended escalation', intelligence.aiInsights.recommendedEscalation],
                ['Workload balancing', intelligence.aiInsights.workloadBalance],
                ['Suggested delegate', intelligence.aiInsights.suggestedDelegate],
                ['Approval bottleneck', intelligence.aiInsights.bottleneck],
              ].map(([label, value]) => (
                <div key={label} className="rounded-[14px] border border-[#E2E8F0] bg-[#FCFCFF] p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-[#94A3B8]">{label}</p>
                  <p className="mt-2 text-[13px] font-semibold leading-relaxed text-[#0F172A]">{value}</p>
                </div>
              ))}
            </div>
          </EssCard>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <EssCard className="p-5">
              <EssSectionHeader title="Approval Time Trend" />
              <EssSparkline data={intelligence.analytics.approvalTimeTrend} color="#2563EB" />
            </EssCard>
            <EssCard className="p-5">
              <EssSectionHeader title="Workflow Distribution" />
              <EssDonutChart rows={intelligence.analytics.distribution} centerLabel="Requests" centerValue={String(intelligence.register.length)} />
            </EssCard>
            <EssCard className="p-5">
              <EssSectionHeader title="Approval Bottlenecks" />
              <div className="space-y-3">
                {intelligence.analytics.bottlenecks.map((item) => (
                  <div key={item.label}>
                    <div className="mb-1 flex items-center justify-between text-[12px] font-semibold text-[#475569]">
                      <span>{item.label}</span>
                      <span>{item.value}</span>
                    </div>
                    <EssProgressBar value={Math.min(100, item.value * 20)} color="#F59E0B" />
                  </div>
                ))}
              </div>
            </EssCard>
            <EssCard className="p-5">
              <EssSectionHeader title="Monthly Workflow Volume" />
              <EssSparkline data={intelligence.analytics.monthlyVolume} color="#06B6D4" />
            </EssCard>
          </section>

          <EssCard className="overflow-hidden p-0">
            <div className="border-b border-[#E2E8F0] p-5">
              <EssSectionHeader
                title="My Requests"
                action={
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
                      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search workflows…" className="h-10 rounded-[12px] border border-[#E2E8F0] bg-white pl-9 pr-3 text-[13px] outline-none focus:border-[#2563EB]" />
                    </label>
                    <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-10 rounded-[12px] border border-[#E2E8F0] bg-white px-3 text-[13px] font-semibold">
                      {['All', 'Pending', 'Approved', 'Rejected', 'Review'].map((item) => <option key={item}>{item}</option>)}
                    </select>
                    <select value={sortKey} onChange={(e) => setSortKey(e.target.value as typeof sortKey)} className="h-10 rounded-[12px] border border-[#E2E8F0] bg-white px-3 text-[13px] font-semibold">
                      <option value="submittedAt">Sort: Submitted</option>
                      <option value="elapsedHours">Sort: Elapsed</option>
                      <option value="priority">Sort: Priority</option>
                    </select>
                    <button type="button" onClick={exportCsv} className="inline-flex h-10 items-center gap-1 rounded-[12px] border border-[#E2E8F0] bg-white px-3 text-[12px] font-bold text-[#0F172A]">
                      <Filter className="h-4 w-4" />
                      Export
                    </button>
                  </div>
                }
              />
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[1080px] w-full text-left">
                <thead className="sticky top-0 bg-[#F8FAFC] text-[11px] font-bold uppercase tracking-wide text-[#64748B]">
                  <tr>
                    {['Employee', 'Request', 'Department', 'Stage', 'Approver', 'Priority', 'Submitted', 'Elapsed', 'SLA', 'Status', ''].map((head) => (
                      <th key={head || 'actions'} className="px-4 py-3">{head}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {filteredRegister.map((row) => (
                    <tr key={row.id} className={`hover:bg-[#F8FAFC] ${selected?.id === row.id ? 'bg-blue-50/50' : ''}`}>
                      <td className="px-4 py-3 text-[13px] font-semibold text-[#0F172A]">{row.employee}</td>
                      <td className="px-4 py-3 text-[13px] text-[#0F172A]">{row.request}</td>
                      <td className="px-4 py-3 text-[12px] text-[#64748B]">{row.department}</td>
                      <td className="px-4 py-3 text-[12px] font-semibold text-[#475569]">{row.currentStage}</td>
                      <td className="px-4 py-3 text-[12px] text-[#64748B]">{row.approver}</td>
                      <td className="px-4 py-3 text-[12px]">{row.priority}</td>
                      <td className="px-4 py-3 text-[12px] text-[#64748B]">{fmtDateTime(row.submittedAt)}</td>
                      <td className="px-4 py-3 text-[12px] font-semibold">{row.elapsedHours}h</td>
                      <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-[11px] font-bold ${statusBadgeClass(row.slaStatus)}`}>{row.slaStatus}</span></td>
                      <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-[11px] font-bold ${statusBadgeClass(row.status)}`}>{row.status}</span></td>
                      <td className="px-4 py-3">
                        <button type="button" onClick={() => setSelectedId(row.id)} className="inline-flex items-center gap-1 text-[12px] font-bold text-[#2563EB] hover:underline">
                          Drill down <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!filteredRegister.length ? (
                    <tr>
                      <td colSpan={11} className="px-4 py-10 text-center text-[14px] font-semibold text-[#64748B]">
                        No workflow items match this filter. Submit a request from Services or Leave to start tracking approvals.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </EssCard>
        </div>

        <aside className="space-y-5">
          <EssCard className="p-5">
            <EssSectionHeader title="Pending Actions" />
            <div className="space-y-3">
              {intelligence.pendingActions.length ? intelligence.pendingActions.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate('leave', { leaveSection: 'Approvals' })}
                  className="w-full rounded-[14px] border border-[#E2E8F0] bg-[#F8FAFC] p-3 text-left transition hover:border-[#2563EB] hover:bg-white"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[13px] font-bold text-[#0F172A]">{item.title}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusBadgeClass(item.status)}`}>{item.status}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-[#64748B]">{item.owner} · {item.dueLabel}</p>
                </button>
              )) : (
                <p className="text-[13px] text-[#64748B]">No pending actions right now.</p>
              )}
            </div>
          </EssCard>

          <EssCard className="p-5">
            <EssSectionHeader title="SLA Monitor" />
            <div className="flex flex-col items-center">
              <div className="relative h-36 w-36">
                <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                  <circle cx="50" cy="50" r="40" fill="none" stroke="#E9EEF5" strokeWidth="10" />
                  <circle cx="50" cy="50" r="40" fill="none" stroke="#7C3AED" strokeWidth="10" strokeDasharray={`${intelligence.slaMonitor.compliancePct * 2.51} 251`} strokeLinecap="round" />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <p className="text-[24px] font-bold text-[#0F172A]">{intelligence.slaMonitor.compliancePct}%</p>
                  <p className="text-[11px] text-[#94A3B8]">Compliance</p>
                </div>
              </div>
              <div className="mt-4 grid w-full grid-cols-1 gap-2 text-[12px]">
                <div className="flex justify-between"><span className="text-[#64748B]">Avg approval time</span><span className="font-bold">{intelligence.slaMonitor.averageApprovalHours}h</span></div>
                <div className="flex justify-between"><span className="text-[#64748B]">Overdue</span><span className="font-bold text-[#EF4444]">{intelligence.slaMonitor.overdueCount}</span></div>
                <div className="flex justify-between"><span className="text-[#64748B]">Target</span><span className="font-bold">{intelligence.slaMonitor.targetHours}h</span></div>
              </div>
            </div>
          </EssCard>

          <EssCard className="p-5">
            <EssSectionHeader title="Notification Center" />
            <div className="space-y-2">
              {intelligence.notifications.length ? intelligence.notifications.map((item) => (
                <EssNotificationItem
                  key={item.id}
                  title={item.title}
                  meta={`${item.channel} · ${fmtDateTime(item.createdAt)}`}
                  status={item.status}
                  icon={BellIconFor(item.status)}
                  iconBg="#DBEAFE"
                  iconColor="#2563EB"
                />
              )) : (
                <p className="text-[13px] text-[#64748B]">No workflow notifications yet.</p>
              )}
            </div>
          </EssCard>

          <EssCard className="p-5">
            <EssSectionHeader title="Audit Trail" />
            <div className="space-y-4">
              {intelligence.auditTimeline.map((item) => (
                <div key={item.id} className="relative pl-6">
                  <span className={`absolute left-0 top-1.5 h-3 w-3 rounded-full ${item.tone === 'green' ? 'bg-emerald-500' : item.tone === 'red' ? 'bg-red-500' : item.tone === 'amber' ? 'bg-amber-500' : 'bg-blue-500'}`} />
                  <p className="text-[13px] font-bold text-[#0F172A]">{item.action}</p>
                  <p className="text-[11px] text-[#64748B]">{item.actor} · {fmtDateTime(item.at)}</p>
                  {item.comment ? <p className="mt-1 text-[12px] text-[#475569]">{item.comment}</p> : null}
                </div>
              ))}
            </div>
          </EssCard>
        </aside>
      </section>
    </div>
  );
}

function BellIconFor(status: string): LucideIcon {
  if (/reject|fail/i.test(status)) return XCircle;
  if (/approv|deliver|complete/i.test(status)) return CheckCircle2;
  return Clock;
}
