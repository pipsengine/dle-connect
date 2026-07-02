'use client';

import { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Banknote,
  BriefcaseBusiness,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileText,
  Gauge,
  Inbox,
  Layers,
  Plane,
  Send,
  Sparkles,
  TimerReset,
  UserRound,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { WorkflowIntelligence, WorkflowRegisterRow } from '@/lib/ess-workflow-intelligence';
import {
  EssCard,
  EssKpiCard,
  EssProgressBar,
  EssWorkflowStepper,
} from './ess-portal-ui';

type ServiceCatalogItem = { id: string; label: string; area: string; workflow: string[]; slaHours: number };

export type EssServicesPayload = {
  requests?: Array<{
    id: string;
    category: string;
    title: string;
    status: string;
    priority: string;
    submittedAt: string;
    updatedAt?: string;
    approvers?: string[];
  }>;
  serviceCatalog?: ServiceCatalogItem[];
  workflowIntelligence?: WorkflowIntelligence;
};

const categoryVisual = (value: string): { icon: LucideIcon; accent: string; bg: string } => {
  const text = value.toLowerCase();
  if (text.includes('leave')) return { icon: CalendarCheck, accent: '#2563EB', bg: '#DBEAFE' };
  if (text.includes('payroll') || text.includes('payslip')) return { icon: Banknote, accent: '#8B5CF6', bg: '#F5F3FF' };
  if (text.includes('claim') || text.includes('reimburse')) return { icon: FileText, accent: '#F59E0B', bg: '#FFF7ED' };
  if (text.includes('loan') || text.includes('advance')) return { icon: Banknote, accent: '#16A34A', bg: '#ECFDF5' };
  if (text.includes('travel')) return { icon: Plane, accent: '#06B6D4', bg: '#ECFEFF' };
  if (text.includes('asset') || text.includes('ppe')) return { icon: BriefcaseBusiness, accent: '#F97316', bg: '#FFF7ED' };
  if (text.includes('attendance') || text.includes('time')) return { icon: Clock, accent: '#06B6D4', bg: '#ECFEFF' };
  if (text.includes('profile')) return { icon: UserRound, accent: '#7C3AED', bg: '#F5F3FF' };
  if (text.includes('letter') || text.includes('document')) return { icon: ClipboardList, accent: '#2563EB', bg: '#EFF6FF' };
  return { icon: Layers, accent: '#64748B', bg: '#F1F5F9' };
};

const statusBadge = (status: string) => {
  const value = (status || '').toLowerCase();
  if (value.includes('approv') || value.includes('complete') || value.includes('closed') || value.includes('track')) return 'bg-[#ECFDF5] text-[#16A34A]';
  if (value.includes('reject') || value.includes('overdue') || value.includes('terminat')) return 'bg-[#FEF2F2] text-[#DC2626]';
  if (value.includes('risk')) return 'bg-[#FDF2F8] text-[#BE185D]';
  if (value.includes('submit') || value.includes('pending')) return 'bg-[#FFF7ED] text-[#D97706]';
  if (value.includes('review') || value.includes('progress')) return 'bg-[#DBEAFE] text-[#2563EB]';
  return 'bg-[#EFF6FF] text-[#2563EB]';
};

const slaChip = (sla: string) => {
  const value = (sla || '').toLowerCase();
  if (value.includes('overdue')) return { label: 'Overdue', cls: 'bg-[#FEF2F2] text-[#DC2626]' };
  if (value.includes('risk')) return { label: 'At Risk', cls: 'bg-[#FFF7ED] text-[#D97706]' };
  if (value.includes('complete')) return { label: 'Completed', cls: 'bg-[#ECFDF5] text-[#16A34A]' };
  return { label: 'On Track', cls: 'bg-[#ECFDF5] text-[#16A34A]' };
};

const dateText = (value: string) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const dateTimeText = (value: string) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const elapsedLabel = (hours: number) => {
  if (!hours || hours < 1) return 'Just now';
  if (hours < 24) return `${Math.round(hours)}h elapsed`;
  return `${Math.round(hours / 24)}d elapsed`;
};

type EssServicesViewProps = {
  payload: EssServicesPayload | null;
  requestCategory: string;
  requestTitle: string;
  requestPriority: string;
  onCategoryChange: (value: string) => void;
  onTitleChange: (value: string) => void;
  onPriorityChange: (value: string) => void;
  onSubmit: () => void;
  saving?: boolean;
};

export function EssServicesView({
  payload,
  requestCategory,
  requestTitle,
  requestPriority,
  onCategoryChange,
  onTitleChange,
  onPriorityChange,
  onSubmit,
  saving,
}: EssServicesViewProps) {
  const catalog = payload?.serviceCatalog || [];
  const workflow = payload?.workflowIntelligence;
  const register = useMemo(() => {
    const rows = workflow?.register || [];
    const realIds = new Set((payload?.requests || []).map((item) => item.id));
    // Only surface the employee's genuine submitted requests (exclude sample/demo rows).
    const liveRows = rows.filter((row) => realIds.has(row.id));
    return liveRows;
  }, [workflow?.register, payload?.requests]);
  const [statusFilter, setStatusFilter] = useState('All');
  const [selectedId, setSelectedId] = useState('');

  const selectedCatalog = catalog.find((item) => item.label === requestCategory || item.id === requestCategory);

  const filters = ['All', 'In Progress', 'Approved', 'Rejected'];
  const filteredRegister = register.filter((row) => {
    if (statusFilter === 'All') return true;
    const value = row.status.toLowerCase();
    if (statusFilter === 'In Progress') return !/approved|rejected|closed|completed|terminated/i.test(value);
    if (statusFilter === 'Approved') return /approved|closed|completed/i.test(value);
    if (statusFilter === 'Rejected') return /rejected|terminated/i.test(value);
    return true;
  });

  const selectedRow: WorkflowRegisterRow | null = filteredRegister.find((row) => row.id === selectedId) || filteredRegister[0] || null;

  // KPIs computed from the employee's real requests + live workflow rows (no sample data)
  const liveMetrics = useMemo(() => {
    const requests = payload?.requests || [];
    const isTerminal = (status: string) => /approved|rejected|closed|completed|terminated/i.test(status);
    const todayIso = new Date().toISOString().slice(0, 10);
    const monthPrefix = todayIso.slice(0, 7);
    const inProgress = requests.filter((r) => !isTerminal(r.status)).length;
    const approvedToday = requests.filter((r) => /approved|closed|completed/i.test(r.status) && (r.updatedAt || '').slice(0, 10) === todayIso).length;
    const completedThisMonth = requests.filter((r) => /approved|closed|completed/i.test(r.status) && (r.updatedAt || r.submittedAt || '').slice(0, 7) === monthPrefix).length;
    const activeRows = register.filter((row) => row.slaStatus !== 'Completed');
    const overdue = register.filter((row) => row.slaStatus === 'Overdue').length;
    const slaCompliance = activeRows.length ? Math.round((1 - overdue / activeRows.length) * 100) : 100;
    return { total: register.length, inProgress, approvedToday, escalations: overdue, slaCompliance, completedThisMonth };
  }, [payload?.requests, register]);

  const liveSla = useMemo(() => {
    const completed = register.filter((r) => r.slaStatus === 'Completed');
    const averageApprovalHours = completed.length ? Math.round(completed.reduce((s, r) => s + r.elapsedHours, 0) / completed.length) : 0;
    const targetHours = register.length ? Math.round(register.reduce((s, r) => s + r.slaHours, 0) / register.length) : 0;
    return { compliancePct: liveMetrics.slaCompliance, averageApprovalHours, overdueCount: liveMetrics.escalations, targetHours };
  }, [register, liveMetrics]);

  const liveAudit = useMemo(() => {
    const events = register.flatMap((r) => r.comments.map((c, i) => ({
      id: `${r.id}-${i}`,
      action: c.comment.length > 70 ? `${c.comment.slice(0, 70)}…` : c.comment,
      actor: c.actor,
      at: c.at,
      tone: /reject|declin/i.test(c.comment) ? 'red' : /approv|complete/i.test(c.comment) ? 'green' : 'blue',
    })));
    return events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 5);
  }, [register]);

  const liveAi = useMemo(() => {
    if (!register.length) return null;
    const active = register.filter((r) => r.slaStatus !== 'Completed');
    const stageCounts = new Map<string, number>();
    active.forEach((r) => stageCounts.set(r.currentStage, (stageCounts.get(r.currentStage) || 0) + 1));
    const bottleneck = [...stageCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    return {
      delayPrediction: liveMetrics.escalations > 0 ? `${liveMetrics.escalations} request(s) have breached SLA and need attention.` : 'All active requests are within their SLA target.',
      likelyCompletion: liveSla.averageApprovalHours ? `Average approval time is ${liveSla.averageApprovalHours}h across your requests.` : 'Approval times will populate once requests complete.',
      bottleneck: bottleneck ? `Most activity is currently at the ${bottleneck} stage.` : 'No workflow bottlenecks detected.',
      confidenceScore: liveMetrics.slaCompliance,
    };
  }, [register, liveMetrics, liveSla]);

  const kpiCards: Array<{ label: string; value: string; subtitle: string; icon: LucideIcon; accent: string; bg: string }> = [
    { label: 'My Requests', value: String(liveMetrics.total), subtitle: 'All submitted requests', icon: Layers, accent: '#2563EB', bg: '#DBEAFE' },
    { label: 'In Progress', value: String(liveMetrics.inProgress), subtitle: 'Active in workflow', icon: Clock, accent: '#F59E0B', bg: '#FFF7ED' },
    { label: 'Approved Today', value: String(liveMetrics.approvedToday), subtitle: 'Completed decisions', icon: CheckCircle2, accent: '#22C55E', bg: '#ECFDF5' },
    { label: 'Escalations', value: String(liveMetrics.escalations), subtitle: 'Breached SLA', icon: AlertTriangle, accent: '#EF4444', bg: '#FEF2F2' },
    { label: 'SLA Compliance', value: `${liveMetrics.slaCompliance}%`, subtitle: 'Requests within target', icon: Gauge, accent: '#8B5CF6', bg: '#F5F3FF' },
    { label: 'Completed (Month)', value: String(liveMetrics.completedThisMonth), subtitle: 'This calendar month', icon: TimerReset, accent: '#06B6D4', bg: '#ECFEFF' },
  ];

  return (
    <div className="space-y-2">
      {/* Executive KPI Row */}
      <section className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        {kpiCards.map((kpi) => (
          <EssKpiCard
            key={kpi.label}
            label={kpi.label}
            value={kpi.value}
            subtitle={kpi.subtitle}
            icon={kpi.icon}
            accent={kpi.accent}
            iconBg={kpi.bg}
          />
        ))}
      </section>

      <section className="grid grid-cols-1 gap-2 xl:grid-cols-[380px_1fr]">
        {/* Submit Employee Request */}
        <div className="space-y-2">
          <EssCard className="p-4">
            <h3 className="text-[15px] font-bold text-[#0F172A]">Submit Employee Request</h3>
            <p className="mt-0.5 text-[12px] text-[#64748B]">Raise a request and route it through the enterprise approval workflow.</p>

            <div className="mt-3 space-y-3">
              <div>
                <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#94A3B8]">Service</label>
                <select
                  value={requestCategory}
                  onChange={(e) => onCategoryChange(e.target.value)}
                  className="h-11 w-full rounded-[12px] border border-[#E2E8F0] bg-white px-3 text-[13px] font-semibold text-[#0F172A] outline-none focus:border-[#93C5FD] focus:ring-2 focus:ring-[#DBEAFE]"
                >
                  {catalog.map((item) => <option key={item.id}>{item.label}</option>)}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#94A3B8]">Request Title</label>
                <input
                  value={requestTitle}
                  onChange={(e) => onTitleChange(e.target.value)}
                  placeholder="Briefly describe the request"
                  className="h-11 w-full rounded-[12px] border border-[#E2E8F0] bg-white px-3 text-[13px] font-semibold text-[#0F172A] outline-none focus:border-[#93C5FD] focus:ring-2 focus:ring-[#DBEAFE]"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#94A3B8]">Priority</label>
                <div className="flex gap-1.5">
                  {['Low', 'Normal', 'High'].map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => onPriorityChange(level)}
                      className={`h-9 flex-1 rounded-[10px] text-[12px] font-bold transition ${
                        requestPriority === level
                          ? level === 'High' ? 'bg-[#FEF2F2] text-[#DC2626] ring-1 ring-[#FECACA]' : level === 'Low' ? 'bg-[#F1F5F9] text-[#475569] ring-1 ring-[#E2E8F0]' : 'bg-[#FFF7ED] text-[#D97706] ring-1 ring-[#FED7AA]'
                          : 'bg-white text-[#94A3B8] ring-1 ring-[#E2E8F0] hover:bg-[#F8FAFC]'
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={onSubmit}
                disabled={saving || !requestTitle.trim()}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[12px] bg-[#2563EB] text-[13px] font-bold text-white shadow-[0_8px_24px_rgba(37,99,235,0.20)] transition hover:bg-[#1D4ED8] disabled:cursor-not-allowed disabled:bg-[#E2E8F0] disabled:text-[#94A3B8] disabled:shadow-none"
              >
                <Send className="h-4 w-4" /> {saving ? 'Submitting…' : 'Submit Request'}
              </button>
            </div>
          </EssCard>

          {/* Selected service workflow preview */}
          {selectedCatalog ? (
            <EssCard className="p-4">
              <h4 className="text-[13px] font-bold text-[#0F172A]">Approval Route</h4>
              <p className="mt-0.5 text-[11px] text-[#64748B]">{selectedCatalog.label} · target SLA {selectedCatalog.slaHours}h</p>
              <div className="mt-2.5 space-y-2">
                {selectedCatalog.workflow.map((stage, index) => (
                  <div key={stage} className="flex items-center gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#EFF6FF] text-[10px] font-bold text-[#2563EB]">{index + 1}</span>
                    <span className="text-[12px] font-semibold text-[#0F172A]">{stage}</span>
                    {index < selectedCatalog.workflow.length - 1 ? <span className="ml-auto text-[10px] text-[#CBD5E1]">↓</span> : null}
                  </div>
                ))}
              </div>
            </EssCard>
          ) : null}
        </div>

        {/* Workflow & Approval Tracking */}
        <EssCard className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-[15px] font-bold text-[#0F172A]">Workflow &amp; Approval Tracking</h3>
            <div className="flex gap-1">
              {filters.map((filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setStatusFilter(filter)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition ${
                    statusFilter === filter ? 'bg-[#2563EB] text-white' : 'bg-[#F8FAFC] text-[#64748B] hover:bg-[#EFF6FF]'
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>

          {filteredRegister.length ? (
            <div className="mt-3 space-y-2">
              {filteredRegister.map((row) => {
                const visual = categoryVisual(row.requestType || row.request);
                const sla = slaChip(row.slaStatus);
                const expanded = selectedRow?.id === row.id;
                return (
                  <div
                    key={row.id}
                    className={`rounded-[14px] border transition ${expanded ? 'border-[#93C5FD] bg-[#FBFDFF] shadow-[0_6px_18px_rgba(37,99,235,0.08)]' : 'border-[#E2E8F0] bg-white hover:border-[#CBD5E1]'}`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedId(expanded ? '' : row.id)}
                      className="flex w-full items-start gap-3 p-3 text-left"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px]" style={{ backgroundColor: visual.bg, color: visual.accent }}>
                        <visual.icon className="h-5 w-5" strokeWidth={2} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-[13px] font-bold text-[#0F172A]">{row.request}</p>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${statusBadge(row.status)}`}>{row.status}</span>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${sla.cls}`}>{sla.label}</span>
                        </div>
                        <p className="mt-0.5 truncate text-[11px] text-[#64748B]">{row.requestType} · {dateText(row.submittedAt)} · {elapsedLabel(row.elapsedHours)}</p>
                        <div className="mt-2"><EssWorkflowStepper stages={row.stages.map((stage) => ({ id: stage.id, label: stage.label, state: stage.state }))} /></div>
                      </div>
                    </button>

                    {expanded ? (
                      <div className="border-t border-[#E2E8F0] px-3 py-2.5">
                        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                          {[
                            ['Current Stage', row.currentStage],
                            ['Approver', row.approver],
                            ['Priority', row.priority],
                            ['SLA', `${Math.round(row.slaHours)}h target`],
                          ].map(([label, value]) => (
                            <div key={String(label)} className="rounded-[10px] border border-[#E2E8F0] bg-[#F8FAFC] px-2 py-1.5">
                              <p className="text-[9px] font-semibold uppercase tracking-wide text-[#94A3B8]">{label}</p>
                              <p className="truncate text-[12px] font-bold text-[#0F172A]">{value}</p>
                            </div>
                          ))}
                        </div>
                        {row.comments.length ? (
                          <div className="mt-2 space-y-1.5">
                            {row.comments.slice(0, 3).map((c, i) => (
                              <div key={`${c.at}-${i}`} className="rounded-[10px] border border-[#E2E8F0] bg-white px-2.5 py-1.5">
                                <p className="flex items-center gap-1.5 text-[11px]"><span className="font-bold text-[#0F172A]">{c.actor}</span><span className="ml-auto text-[10px] text-[#94A3B8]">{dateTimeText(c.at)}</span></p>
                                <p className="mt-0.5 text-[12px] text-[#475569]">{c.comment}</p>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-3 flex flex-col items-center justify-center gap-2 rounded-[14px] border border-dashed border-[#E2E8F0] bg-[#F8FAFC] px-4 py-12 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#EFF6FF] text-[#2563EB]"><Inbox className="h-6 w-6" /></span>
              <p className="text-[14px] font-bold text-[#0F172A]">No requests to track yet</p>
              <p className="max-w-sm text-[12px] text-[#64748B]">Submit an employee request on the left and it will appear here with a live approval workflow, current stage, and SLA tracking.</p>
            </div>
          )}
        </EssCard>
      </section>

      {/* Supporting row: SLA monitor + Audit timeline + AI insights */}
      {register.length ? (
        <section className="grid grid-cols-1 gap-2 xl:grid-cols-3">
          <EssCard className="p-4">
            <h3 className="mb-2 flex items-center gap-1.5 text-[14px] font-bold text-[#0F172A]"><Gauge className="h-4 w-4 text-[#8B5CF6]" /> SLA Monitor</h3>
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-[#64748B]">Compliance</span>
              <span className="font-bold text-[#0F172A]">{liveSla.compliancePct}%</span>
            </div>
            <div className="mt-1.5"><EssProgressBar value={liveSla.compliancePct} color={liveSla.compliancePct >= 90 ? '#22C55E' : liveSla.compliancePct >= 70 ? '#F59E0B' : '#EF4444'} /></div>
            <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
              {[
                ['Avg. Approval', liveSla.averageApprovalHours ? `${liveSla.averageApprovalHours}h` : '—'],
                ['Overdue', String(liveSla.overdueCount)],
                ['Target', liveSla.targetHours ? `${liveSla.targetHours}h` : '—'],
              ].map(([label, value]) => (
                <div key={label} className="rounded-[10px] border border-[#E2E8F0] bg-[#F8FAFC] px-2 py-1.5">
                  <p className="text-[9px] font-semibold uppercase tracking-wide text-[#94A3B8]">{label}</p>
                  <p className="mt-0.5 text-[13px] font-bold text-[#0F172A]">{value}</p>
                </div>
              ))}
            </div>
          </EssCard>

          <EssCard className="p-4">
            <h3 className="mb-2 flex items-center gap-1.5 text-[14px] font-bold text-[#0F172A]"><Activity className="h-4 w-4 text-[#2563EB]" /> Audit Trail</h3>
            {liveAudit.length ? (
              <div className="space-y-2">
                {liveAudit.map((event, index) => (
                  <div key={event.id} className="flex gap-2">
                    <div className="flex flex-col items-center">
                      <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${event.tone === 'green' ? 'bg-[#22C55E]' : event.tone === 'red' ? 'bg-[#EF4444]' : 'bg-[#2563EB]'}`} />
                      {index < liveAudit.length - 1 ? <span className="mt-0.5 h-full w-px flex-1 bg-[#E2E8F0]" /> : null}
                    </div>
                    <div className="pb-1">
                      <p className="text-[12px] font-semibold text-[#0F172A]">{event.action}</p>
                      <p className="text-[10px] text-[#94A3B8]">{event.actor} · {dateTimeText(event.at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[12px] text-[#94A3B8]">Activity will appear as requests move through the workflow.</p>
            )}
          </EssCard>

          <div className="rounded-[20px] border border-[#E2E8F0] bg-gradient-to-b from-[#F5F3FF] to-white p-4 shadow-[0_6px_18px_rgba(15,23,42,0.05)]">
            <h3 className="mb-2 flex items-center gap-1.5 text-[14px] font-bold text-[#0F172A]"><Sparkles className="h-4 w-4 text-[#8B5CF6]" /> AI Insights</h3>
            {liveAi ? (
              <ul className="space-y-1.5 text-[11px] text-[#475569]">
                <li className="flex gap-1.5 rounded-[10px] bg-white/70 px-2.5 py-1.5"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#8B5CF6]" />{liveAi.delayPrediction}</li>
                <li className="flex gap-1.5 rounded-[10px] bg-white/70 px-2.5 py-1.5"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#8B5CF6]" />{liveAi.likelyCompletion}</li>
                <li className="flex gap-1.5 rounded-[10px] bg-white/70 px-2.5 py-1.5"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#8B5CF6]" />{liveAi.bottleneck}</li>
              </ul>
            ) : (
              <p className="text-[12px] text-[#94A3B8]">Insights appear once you have active requests.</p>
            )}
            {liveAi ? (
              <div className="mt-2 flex items-center gap-2 rounded-[10px] border border-[#DDD6FE] bg-white px-2.5 py-2">
                <div className="flex h-11 w-11 items-center justify-center rounded-full border-[4px] border-[#8B5CF6] text-[12px] font-bold text-[#8B5CF6]">{liveAi.confidenceScore}%</div>
                <div>
                  <p className="text-[11px] font-bold text-[#0F172A]">Workflow confidence</p>
                  <p className="text-[10px] text-[#94A3B8]">Based on live SLA & routing</p>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
