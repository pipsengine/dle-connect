'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  CalendarDays,
  ChartGantt,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock3,
  FileStack,
  FileText,
  Filter,
  Flame,
  FolderKanban,
  FolderOpen,
  LayoutGrid,
  ListChecks,
  MessageSquare,
  Plus,
  Receipt,
  ScrollText,
  Search,
  ShieldAlert,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { TenderApproval, TenderAward, TenderDocument, TenderItem, TenderLine, TenderOpportunity, TenderSubmission } from '@/lib/commercial/tender-types';
import { closedOut, daysUntil, plainNaira, sectorOf, stageSave, WORKSPACE_STAGES, workspaceStepIndex } from '@/lib/commercial/tender-present';
import { internalDeadlineFromExternal } from '@/lib/commercial/tender-workflow';
import { formatWhen, money, tenderGet, tenderPost, tenderUpload } from './tender-api';
import { OpportunityModal } from './OpportunityModal';
import { ItemCapture, LineCapture } from './record-capture';
import { BlueprintRegisters } from './BlueprintRegisters';

type Detail = {
  opportunity: TenderOpportunity;
  documents: TenderDocument[];
  lines: TenderLine[];
  approvals: TenderApproval[];
  submissions: TenderSubmission[];
  awards: TenderAward[];
  items: TenderItem[];
  audit: Array<{ id: number; action: string; actor: string; details: string; createdAt: string }>;
};

const TABS: Array<{ id: string; icon: LucideIcon }> = [
  { id: 'Overview', icon: LayoutGrid },
  { id: 'Details', icon: FileText },
  { id: 'Team & Tasks', icon: Users },
  { id: 'Lots / Packages', icon: FolderOpen },
  { id: 'Compliance Matrix', icon: ListChecks },
  { id: 'Documents', icon: FileStack },
  { id: 'Addenda', icon: ScrollText },
  { id: 'Clarifications (Q&A)', icon: MessageSquare },
  { id: 'Risks & Issues', icon: ShieldAlert },
  { id: 'Financials', icon: Receipt },
  { id: 'Timeline', icon: ChartGantt },
  { id: 'Audit Trail', icon: ClipboardList },
];

const PAGE_SIZE = 5;
const STAGE_BASE = [18, 32, 48, 62, 74, 84, 94, 100];

const isTender = (row: TenderOpportunity) => row.opportunityType !== 'Enquiry' && row.tenderType !== 'Enquiry';
const isComplete = (row: TenderOpportunity) => workspaceStepIndex(row) >= 6 || row.status === 'Awarded' || row.clientStatus === 'Awarded';
const isDone = (status: string) => /done|complete|closed|answer|approved|filed|resolved/i.test(status);
const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

function readinessOf(row: TenderOpportunity, detail: Detail | null) {
  const step = workspaceStepIndex(row);
  const base = STAGE_BASE[step] ?? 0;
  const fields = [
    Boolean(String(row.ownerName || '').trim()),
    Boolean(row.submissionDeadline || row.closingDate),
    Boolean(row.scopeSummary || row.description),
    row.estimatedValue > 0,
    Boolean(row.category),
    Boolean(row.bidDecision) && row.bidDecision !== 'Pending',
  ];
  let lift = Math.round((fields.filter(Boolean).length / fields.length) * 16);
  if (detail?.opportunity.id === row.id) {
    const tasks = detail.items.filter((item) => /task/i.test(item.kind));
    const compliance = detail.items.filter((item) => /comply|compliance|matrix/i.test(item.kind));
    const ratios: number[] = [];
    if (tasks.length) ratios.push(tasks.filter((item) => isDone(item.status)).length / tasks.length);
    if (compliance.length) ratios.push(compliance.filter((item) => isDone(item.status)).length / compliance.length);
    if (detail.documents.length || detail.lines.length) ratios.push(Math.min(1, (detail.documents.length + (detail.lines.length ? 1 : 0)) / 4));
    if (ratios.length) lift = Math.round((ratios.reduce((sum, value) => sum + value, 0) / ratios.length) * 16);
  }
  return clamp(base + (step >= 7 ? 0 : lift));
}

function daysLabel(days: number | null) {
  if (days == null) return '';
  if (days < 0) return `${Math.abs(days)} days overdue`;
  if (days === 0) return 'Due today';
  if (days === 1) return '1 day left';
  return `${days} days left`;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '—';
  return `${parts[0]?.[0] || ''}${parts[1]?.[0] || ''}`.toUpperCase();
}

function activityStamp(value: string) {
  if (!value) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return formatWhen(value);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return formatWhen(value);
  const date = parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const time = parsed.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${date} ${time}`;
}

function bidBadge(row: TenderOpportunity) {
  const decision = String(row.bidDecision || '').trim();
  if (/approv|go|yes|proceed/i.test(decision)) return { label: 'BID Approved', className: 'bg-emerald-50 text-emerald-700' };
  if (/no-?bid|declin|reject/i.test(decision)) return { label: decision || 'No-Bid', className: 'bg-rose-50 text-rose-700' };
  if (decision && decision !== 'Pending') return { label: decision, className: 'bg-amber-50 text-amber-700' };
  return { label: WORKSPACE_STAGES[workspaceStepIndex(row)] || 'Open', className: 'bg-blue-50 text-blue-700' };
}

function actionPriority(due: string, fallback: string) {
  const days = due ? daysUntil(due) : null;
  if (days != null && days <= 2) return 'High';
  if (/high/i.test(fallback)) return 'High';
  if (days != null && days <= 7) return 'Medium';
  if (/low/i.test(fallback)) return 'Low';
  return 'Medium';
}

export function TenderWorkspace() {
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<TenderOpportunity[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [selectedId, setSelectedId] = useState(searchParams.get('id') || '');
  const [tab, setTab] = useState('Overview');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [sector, setSector] = useState('All');
  const [stageFilter, setStageFilter] = useState('All');
  const [priorityFilter, setPriorityFilter] = useState('All');
  const [page, setPage] = useState(1);

  const loadList = async () => {
    const opportunities = await tenderGet<TenderOpportunity[]>('opportunities');
    setRows(opportunities);
    setSelectedId((current) => current || searchParams.get('id') || opportunities.find(isTender)?.id || opportunities[0]?.id || '');
    return opportunities;
  };

  const loadDetail = async (id: string) => {
    if (!id) {
      setDetail(null);
      return;
    }
    setDetail(await tenderGet<Detail>('opportunity', { id }));
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadList()
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Unable to read the register.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const requested = searchParams.get('id') || '';
    if (requested) setSelectedId(requested);
  }, [searchParams]);

  useEffect(() => {
    if (!selectedId) return;
    loadDetail(selectedId).catch((reason) => setError(reason instanceof Error ? reason.message : 'Unable to open this opportunity.'));
  }, [selectedId]);

  useEffect(() => { setPage(1); }, [query, sector, stageFilter, priorityFilter]);

  const opportunity = detail?.opportunity;
  const step = opportunity ? workspaceStepIndex(opportunity) : null;
  const stageLabel = step == null ? '' : WORKSPACE_STAGES[step];
  const externalDate = opportunity?.submissionDeadline || opportunity?.closingDate || '';
  const internalDate = externalDate ? internalDeadlineFromExternal(externalDate) : '';
  const externalDays = externalDate ? daysUntil(externalDate) : null;
  const internalDays = internalDate ? daysUntil(internalDate) : null;
  const clarifications = (detail?.items || []).filter((item) => /clarif|question/i.test(item.kind));
  const risks = (detail?.items || []).filter((item) => /risk|issue/i.test(item.kind));
  const tasks = (detail?.items || []).filter((item) => /task|team/i.test(item.kind));
  const compliance = (detail?.items || []).filter((item) => /comply|compliance|matrix/i.test(item.kind));
  const addenda = (detail?.documents || []).filter((item) => /addend/i.test(item.category));
  const openTasks = tasks.filter((item) => !isDone(item.status));
  const openClarifications = clarifications.filter((item) => !isDone(item.status));
  const submittedValue = (detail?.lines || []).reduce((sum, line) => sum + line.sell, 0) || (detail?.awards || []).reduce((sum, award) => sum + award.awardedValue, 0);
  const readiness = opportunity ? readinessOf(opportunity, detail) : 0;

  const tenders = useMemo(() => {
    const real = rows.filter(isTender);
    return real.length ? real : rows;
  }, [rows]);
  const activeTenders = tenders.filter((row) => !closedOut(row) && !isComplete(row));
  const kpis = {
    active: activeTenders.length,
    preparation: activeTenders.filter((row) => workspaceStepIndex(row) === 2).length,
    review: activeTenders.filter((row) => workspaceStepIndex(row) === 3).length,
    submission: activeTenders.filter((row) => workspaceStepIndex(row) === 4).length,
    completed: tenders.filter(isComplete).length,
  };
  const sectors = useMemo(() => Array.from(new Set(tenders.map(sectorOf))).sort(), [tenders]);
  const filtered = useMemo(() => {
    const source = activeTenders.length ? activeTenders : tenders;
    const needle = query.trim().toLowerCase();
    return source.filter((row) => {
      if (sector !== 'All' && sectorOf(row) !== sector) return false;
      if (stageFilter !== 'All' && WORKSPACE_STAGES[workspaceStepIndex(row)] !== stageFilter) return false;
      if (priorityFilter !== 'All' && (row.priority || 'Medium') !== priorityFilter) return false;
      if (!needle) return true;
      return `${row.referenceNo} ${row.title} ${row.clientName}`.toLowerCase().includes(needle);
    });
  }, [activeTenders, tenders, query, sector, stageFilter, priorityFilter]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const rangeStart = filtered.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, filtered.length);

  const saveStage = async (label: string) => {
    if (!opportunity) return;
    setError('');
    try {
      const next = stageSave(label);
      await tenderPost({ action: 'save', opportunity: { ...opportunity, ...next, saveMode: 'submit' } });
      setNotice('Status saved to DLE_Enterprise.');
      await loadDetail(opportunity.id);
      await loadList();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Status was not saved.');
    }
  };

  const savePriority = async (priority: string) => {
    if (!opportunity) return;
    setError('');
    try {
      await tenderPost({ action: 'save', opportunity: { ...opportunity, priority, stage: opportunity.stage, status: opportunity.status === 'Draft' ? 'Under Review' : opportunity.status, saveMode: 'submit' } });
      await loadDetail(opportunity.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Priority was not saved.');
    }
  };

  const technicalDocs = (detail?.documents || []).filter((item) => /tech|proposal|drawing/i.test(`${item.category} ${item.fileName}`));
  const commercialReady = (detail?.lines || []).filter((line) => line.sell > 0).length;
  const commercialTotal = (detail?.lines || []).length;
  const reviewDecided = (detail?.approvals || []).filter((item) => item.decision && !/pending/i.test(item.decision)).length;
  const execution = [
    { label: 'Technical Proposal', value: technicalDocs.length ? 100 : 0 },
    { label: 'Commercial Proposal', value: commercialTotal ? clamp((commercialReady / commercialTotal) * 100) : 0 },
    { label: 'Compliance Documentation', value: compliance.length ? clamp((compliance.filter((item) => isDone(item.status)).length / compliance.length) * 100) : 0 },
    { label: 'Internal Review', value: (detail?.approvals || []).length ? clamp((reviewDecided / (detail?.approvals || []).length) * 100) : (step != null && step > 3 ? 100 : 0) },
  ];
  const outstandingDocuments = compliance.filter((item) => !isDone(item.status)).length;
  const milestones: Array<{ label: string; date: string; days: number | null }> = opportunity ? [
    { label: 'Issue of Tender Documents', date: opportunity.invitationDate, days: opportunity.invitationDate ? daysUntil(opportunity.invitationDate) : null },
    { label: 'Clarification Submission', date: opportunity.clarificationDeadline, days: opportunity.clarificationDeadline ? daysUntil(opportunity.clarificationDeadline) : null },
    { label: 'Internal Submission (DLE)', date: internalDate, days: internalDays },
    { label: 'Client Submission', date: externalDate, days: externalDays },
    { label: 'Client Evaluation', date: '', days: null },
    { label: 'Expected Award', date: detail?.awards[0]?.awardDate || '', days: detail?.awards[0]?.awardDate ? daysUntil(detail.awards[0].awardDate) : null },
  ] : [];
  const pendingActions = [
    ...openTasks.map((item) => ({ id: item.id, title: item.title, due: item.dueAt, priority: actionPriority(item.dueAt, opportunity?.priority || '') })),
    ...openClarifications.map((item) => ({ id: item.id, title: item.title, due: item.dueAt, priority: actionPriority(item.dueAt, 'High') })),
  ].slice(0, 5);
  const teamNames = Array.from(new Set([opportunity?.ownerName || '', ...tasks.map((item) => item.assignee)].map((name) => name.trim()).filter(Boolean)));

  return (
    <div className="space-y-4">
      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}

      <section className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#2563eb] text-white shadow-sm"><FileText className="h-6 w-6" /></span>
          <div>
            <h1 className="text-[22px] font-black tracking-tight text-slate-950">Tender Workspace</h1>
            <p className="text-[13px] text-slate-500">Manage approved tenders, coordinate activities, track progress and ensure timely submission.</p>
          </div>
        </div>
        <button type="button" onClick={() => { setTab('Team & Tasks'); }} disabled={!opportunity} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#2563eb] px-4 text-sm font-bold text-white shadow-sm disabled:opacity-50">
          <Plus className="h-4 w-4" /> Create Task
        </button>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Kpi icon={FolderKanban} tint="bg-blue-50 text-blue-600" value={kpis.active} label="Active Tenders" />
        <Kpi icon={FileText} tint="bg-orange-50 text-orange-500" value={kpis.preparation} label="In Preparation" />
        <Kpi icon={ClipboardList} tint="bg-violet-50 text-violet-600" value={kpis.review} label="Internal Review" />
        <Kpi icon={Clock3} tint="bg-amber-50 text-amber-600" value={kpis.submission} label="Pending Submission" />
        <Kpi icon={CheckCircle2} tint="bg-emerald-50 text-emerald-600" value={kpis.completed} label="Completed" />
      </section>

      <section className="grid items-start gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between px-4 pt-4">
            <h2 className="text-[15px] font-black text-slate-950">Active Tenders</h2>
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[12px] font-bold text-blue-700">{activeTenders.length || tenders.length}</span>
          </div>
          <div className="flex gap-2 px-4 pt-3">
            <label className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by title, client or reference no..." className="h-9 w-full rounded-lg border border-slate-200 bg-[#f8fafc] pl-8 pr-2 text-[12px] outline-none focus:border-blue-500 focus:bg-white" aria-label="Search active tenders" />
            </label>
            <button type="button" onClick={() => { setQuery(''); setSector('All'); setStageFilter('All'); setPriorityFilter('All'); }} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50" aria-label="Reset filters"><Filter className="h-3.5 w-3.5" /></button>
          </div>
          <div className="grid grid-cols-3 gap-1.5 px-4 py-3">
            <FilterSelect label="Sector" allLabel="All Sectors" value={sector} onChange={setSector} options={['All', ...sectors]} />
            <FilterSelect label="Stage" allLabel="All Stages" value={stageFilter} onChange={setStageFilter} options={['All', ...WORKSPACE_STAGES]} />
            <FilterSelect label="Priority" allLabel="All Priorities" value={priorityFilter} onChange={setPriorityFilter} options={['All', 'High', 'Medium', 'Low']} />
          </div>
          <div className="space-y-2 px-3 pb-3">
            {pageRows.length === 0 ? <p className="px-2 py-10 text-center text-[12px] text-slate-500">{loading ? 'Loading register…' : 'No tenders match these filters.'}</p> : pageRows.map((row) => {
              const selected = row.id === selectedId;
              const score = readinessOf(row, detail);
              const due = row.submissionDeadline || row.closingDate;
              const left = due ? daysUntil(due) : null;
              return (
                <button key={row.id} type="button" onClick={() => { setSelectedId(row.id); setTab('Overview'); }} className={`w-full rounded-xl border px-3 py-3 text-left transition ${selected ? 'border-[#2563eb] bg-[#f5f9ff] shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                  <div className="text-[11px] font-semibold text-slate-400">{row.referenceNo}</div>
                  <div className="mt-0.5 line-clamp-2 text-[13px] font-bold leading-snug text-slate-900">{row.title}</div>
                  <div className="mt-1 truncate text-[11px] text-slate-500">Client: {row.clientName || '—'} <span className="text-slate-300">·</span> Sector: {sectorOf(row)}</div>
                  <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
                    <span className="inline-flex items-center gap-1 text-slate-500"><CalendarDays className="h-3 w-3" />{due ? formatWhen(due) : 'No deadline'}</span>
                    {left != null ? <span className={`font-bold ${left <= 10 ? 'text-orange-500' : 'text-slate-500'}`}>{daysLabel(left)}</span> : null}
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-[#2563eb]" style={{ width: `${score}%` }} />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-[#2563eb]">{WORKSPACE_STAGES[workspaceStepIndex(row)]}</span>
                    <span className="font-bold text-slate-700">{score}%</span>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-[11px] text-slate-500">
            <span>Showing {rangeStart} to {rangeEnd} of {filtered.length} tenders</span>
            <div className="flex items-center gap-1">
              <PagerButton label="Previous page" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft className="h-3.5 w-3.5" /></PagerButton>
              {Array.from({ length: Math.min(5, pageCount) }, (_, index) => Math.max(1, Math.min(currentPage - 2, pageCount - 4)) + index).map((number) => (
                <button key={number} type="button" onClick={() => setPage(number)} className={`h-7 min-w-7 rounded-md px-1.5 text-[11px] font-bold ${number === currentPage ? 'bg-[#2563eb] text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{number}</button>
              ))}
              <PagerButton label="Next page" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}><ChevronRight className="h-3.5 w-3.5" /></PagerButton>
            </div>
          </div>
        </article>

        <article className="min-w-0 rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#2563eb] text-white"><FileText className="h-5 w-5" /></span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-[18px] font-black tracking-tight text-slate-950">{opportunity?.title || (loading ? 'Loading workspace…' : 'No tender is open')}</h2>
                  {opportunity ? <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">{opportunity.tenderType || 'Tender'}</span> : null}
                </div>
                <p className="mt-1 text-[12px] text-slate-500">
                  Client: <b className="font-semibold text-slate-700">{opportunity?.clientName || '—'}</b>
                  <span className="px-1.5 text-slate-300">|</span>Ref: <b className="font-semibold text-slate-700">{opportunity?.referenceNo || '—'}</b>
                  <span className="px-1.5 text-slate-300">|</span>Sector: <b className="font-semibold text-slate-700">{opportunity ? sectorOf(opportunity) : '—'}</b>
                  <span className="px-1.5 text-slate-300">|</span>Tender Type: <b className="font-semibold text-slate-700">{opportunity?.tenderType || '—'}</b>
                </p>
                {opportunity ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${bidBadge(opportunity).className}`}>{bidBadge(opportunity).label}</span>
                    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold ${opportunity.priority === 'High' ? 'bg-rose-50 text-rose-600' : opportunity.priority === 'Low' ? 'bg-slate-100 text-slate-600' : 'bg-amber-50 text-amber-700'}`}>
                      {opportunity.priority === 'High' ? <Flame className="h-3 w-3" /> : null}{opportunity.priority || 'Medium'} Priority
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="relative">
              <button type="button" onClick={() => setActionsOpen((value) => !value)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#2563eb] px-4 text-sm font-bold text-white shadow-sm">Actions <ChevronDown className="h-4 w-4" /></button>
              {actionsOpen ? (
                <div className="absolute right-0 top-12 z-20 w-56 rounded-xl border border-slate-200 bg-white p-2 text-sm shadow-lg">
                  <label className="block px-2 py-1 text-[11px] font-semibold text-slate-400">Stage
                    <select disabled={!opportunity} value={stageLabel} onChange={(event) => saveStage(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-[12px] font-semibold text-slate-700">
                      {stageLabel ? null : <option value="">—</option>}
                      {WORKSPACE_STAGES.map((label) => <option key={label} value={label}>{label}</option>)}
                    </select>
                  </label>
                  <label className="mt-1 block px-2 py-1 text-[11px] font-semibold text-slate-400">Priority
                    <select disabled={!opportunity} value={opportunity?.priority || 'Medium'} onChange={(event) => savePriority(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-[12px] font-semibold text-slate-700">
                      {['High', 'Medium', 'Low'].map((label) => <option key={label}>{label}</option>)}
                    </select>
                  </label>
                  <button type="button" className="mt-1 block w-full rounded-lg px-2 py-2 text-left text-[13px] font-semibold hover:bg-slate-50" onClick={() => { setEditing(true); setActionsOpen(false); }}>{opportunity ? 'Edit opportunity' : 'New opportunity'}</button>
                  {opportunity ? <button type="button" className="block w-full rounded-lg px-2 py-2 text-left text-[13px] font-semibold hover:bg-slate-50" onClick={() => { setActionsOpen(false); tenderPost({ action: 'duplicate', id: opportunity.id }).then(() => loadList()); }}>Duplicate</button> : null}
                  <Link href="/commercial/tenders/opportunities" className="block rounded-lg px-2 py-2 text-[13px] font-semibold hover:bg-slate-50">Back to register</Link>
                </div>
              ) : null}
            </div>
          </div>

          <ol className="flex gap-1 overflow-x-auto px-4 py-4">
            {WORKSPACE_STAGES.map((label, index) => {
              const state = step != null && index < step ? 'Completed' : step != null && index === step ? 'In Progress' : 'Pending';
              const tone = state === 'Completed' ? 'bg-emerald-500 text-white' : state === 'In Progress' ? 'bg-[#2563eb] text-white' : 'bg-slate-100 text-slate-400';
              return (
                <li key={label} className="relative min-w-[108px] flex-1">
                  {index < WORKSPACE_STAGES.length - 1 ? <span className={`absolute left-7 right-0 top-3.5 h-px ${step != null && index < step ? 'bg-emerald-300' : 'bg-slate-200'}`} /> : null}
                  <span className={`relative inline-flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-black ${tone}`}>{state === 'Completed' ? <Check className="h-3.5 w-3.5" /> : index + 1}</span>
                  <div className="mt-2 text-[12px] font-bold text-slate-800">{label}</div>
                  <div className={`text-[11px] font-semibold ${state === 'Completed' ? 'text-emerald-600' : state === 'In Progress' ? 'text-[#2563eb]' : 'text-slate-400'}`}>{state}</div>
                </li>
              );
            })}
          </ol>

          <div className="flex gap-1 overflow-x-auto border-y border-slate-100 px-2">
            {TABS.map((item) => {
              const Icon = item.icon;
              const selected = tab === item.id;
              return (
                <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-3 text-[13px] font-semibold ${selected ? 'border-[#2563eb] text-[#2563eb]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                  <Icon className="h-3.5 w-3.5" />{item.id}
                </button>
              );
            })}
          </div>

          {tab === 'Overview' ? (
            <div className="space-y-3 bg-[#f8fafc] p-4">
              <div className="grid gap-3 xl:grid-cols-12">
                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:col-span-6">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-[14px] font-black text-slate-950">Overall Tender Readiness</h3>
                    <div className="text-[28px] font-black leading-none text-[#2563eb]">{opportunity ? `${readiness}%` : '—'}</div>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-[#2563eb]" style={{ width: `${readiness}%` }} />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[12px]">
                    <span className="text-slate-500">Current stage: <b className="font-semibold text-[#2563eb]">{stageLabel || '—'}</b></span>
                    <span className="text-slate-400">{opportunity ? `${100 - readiness}% outstanding` : ''}</span>
                  </div>
                </section>
                <DateCard className="xl:col-span-3" label="External Submission Date" date={externalDate} days={externalDays} tone="text-orange-500 bg-orange-50" />
                <DateCard className="xl:col-span-3" label="Internal Submission Date (Default − 24h)" date={internalDate} days={internalDays} tone="text-blue-600 bg-blue-50" />

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:col-span-9">
                  <Stat icon={ClipboardList} tint="bg-blue-50 text-blue-600" value={tasks.length} label="Assigned Tasks" />
                  <Stat icon={CheckCircle2} tint="bg-emerald-50 text-emerald-600" value={tasks.filter((item) => isDone(item.status)).length} label="Completed Tasks" />
                  <Stat icon={FileText} tint="bg-orange-50 text-orange-500" value={outstandingDocuments} label="Outstanding Documents" />
                  <Stat icon={MessageSquare} tint="bg-violet-50 text-violet-600" value={openClarifications.length} label="Open Clarifications" />
                </div>
                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:col-span-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[14px] font-black text-slate-950">Responsible Officer</h3>
                    <button type="button" onClick={() => setTab('Team & Tasks')} className="text-[12px] font-semibold text-[#2563eb]">View Team →</button>
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#2563eb] text-sm font-black text-white">{initials(opportunity?.ownerName || '')}</span>
                    <div className="min-w-0">
                      <div className="truncate text-[14px] font-bold text-slate-900">{opportunity?.ownerName || 'Unassigned'}</div>
                      <div className="truncate text-[12px] text-slate-500">{[opportunity?.designation || 'Bid Manager', opportunity?.department].filter(Boolean).join(' · ')}</div>
                    </div>
                  </div>
                  <div className="mt-3 text-[11px] font-semibold text-slate-400">Tender Team</div>
                  <div className="mt-1.5 flex items-center">
                    {teamNames.slice(0, 3).map((name, index) => (
                      <span key={name} title={name} className={`inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-[10px] font-bold text-white ${['bg-[#2563eb]', 'bg-emerald-500', 'bg-amber-500'][index]} ${index ? '-ml-1.5' : ''}`}>{initials(name)}</span>
                    ))}
                    {teamNames.length > 3 ? <span className="-ml-1.5 inline-flex h-7 min-w-7 items-center justify-center rounded-full border-2 border-white bg-slate-100 px-1 text-[10px] font-bold text-slate-600">+{teamNames.length - 3}</span> : null}
                    {teamNames.length === 0 ? <span className="text-[12px] text-slate-400">No team assigned</span> : null}
                  </div>
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:col-span-7">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-[14px] font-black text-slate-950">Tender Execution Progress</h3>
                    <button type="button" onClick={() => setTab('Documents')} className="text-[12px] font-semibold text-[#2563eb]">View All →</button>
                  </div>
                  <ul className="space-y-3">
                    {execution.map((item) => (
                      <li key={item.label}>
                        <div className="mb-1 flex items-center justify-between text-[12px]"><span className="font-semibold text-slate-700">{item.label}</span><span className="font-bold text-slate-800">{item.value}%</span></div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#2563eb]" style={{ width: `${item.value}%` }} /></div>
                      </li>
                    ))}
                  </ul>
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:col-span-5">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-[14px] font-black text-slate-950">Key Dates & Milestones</h3>
                    <button type="button" onClick={() => setTab('Timeline')} className="text-[12px] font-semibold text-[#2563eb]">View All →</button>
                  </div>
                  <ul>
                    {milestones.map((item) => {
                      const passed = item.days != null && item.days < 0;
                      const open = item.days != null && item.days >= 0;
                      return (
                        <li key={item.label} className="flex items-center gap-2 border-t border-slate-50 py-2 first:border-0">
                          {passed ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" /> : <Clock3 className={`h-4 w-4 shrink-0 ${open ? 'text-slate-400' : 'text-slate-300'}`} />}
                          <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-slate-700">{item.label}</span>
                          <span className="shrink-0 text-[12px] text-slate-500">{item.date ? formatWhen(item.date) : 'TBC'}</span>
                          {open ? <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${item.label.includes('Internal') ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-500'}`}>{daysLabel(item.days)}</span> : null}
                        </li>
                      );
                    })}
                  </ul>
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:col-span-7">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-[14px] font-black text-slate-950">Recent Activities</h3>
                    <button type="button" onClick={() => setTab('Timeline')} className="text-[12px] font-semibold text-[#2563eb]">View All →</button>
                  </div>
                  {(detail?.audit || []).length === 0 ? <p className="py-8 text-center text-[12px] text-slate-500">{opportunity ? 'No activity has been recorded.' : 'Select a tender to see activity.'}</p> : (detail?.audit || []).slice(0, 4).map((event) => (
                    <div key={event.id} className="flex items-start gap-2 border-t border-slate-50 py-2 first:border-0">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#2563eb]" />
                      <div className="min-w-0 flex-1 text-[12px] text-slate-700"><b className="font-semibold text-slate-800">{event.details || event.action}</b>{event.actor ? <span className="text-slate-400"> — {event.actor}</span> : null}</div>
                      <span className="shrink-0 text-[11px] text-slate-400">{activityStamp(event.createdAt)}</span>
                    </div>
                  ))}
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:col-span-5">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-[14px] font-black text-slate-950">Pending Actions</h3>
                    <button type="button" onClick={() => setTab('Team & Tasks')} className="text-[12px] font-semibold text-[#2563eb]">View All →</button>
                  </div>
                  {pendingActions.length === 0 ? <p className="py-8 text-center text-[12px] text-slate-500">{opportunity ? 'No pending actions.' : 'Select a tender to see actions.'}</p> : pendingActions.map((item) => (
                    <div key={item.id} className="flex items-center gap-2 border-t border-slate-50 py-2 first:border-0">
                      <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${item.priority === 'High' ? 'bg-rose-50 text-rose-600' : item.priority === 'Low' ? 'bg-slate-100 text-slate-500' : 'bg-amber-50 text-amber-700'}`}>{item.priority}</span>
                      <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-slate-800">{item.title}</span>
                      <span className={`shrink-0 text-[11px] font-semibold ${item.due && (daysUntil(item.due) ?? 99) <= 7 ? 'text-rose-500' : 'text-slate-400'}`}>{item.due ? `Due ${formatWhen(item.due)}` : 'No due date'}</span>
                    </div>
                  ))}
                </section>
              </div>
            </div>
          ) : (
            <div className="p-4">
              {!opportunity ? <p className="py-8 text-center text-sm text-slate-500">Select a tender to continue.</p> : null}
              {opportunity && tab === 'Details' ? (
                <div className="space-y-3">
                  <p className="whitespace-pre-wrap text-sm text-slate-700">{opportunity.description || opportunity.scopeSummary || 'No description has been saved.'}</p>
                  <ItemCapture opportunityId={opportunity.id} kinds={['QUALIFICATION', 'REQUIREMENT', 'CLAUSE', 'BOND', 'SCENARIO', 'CASHFLOW', 'SUPPLIER', 'DEVIATION', 'LESSON', 'HANDOVER']} onSaved={() => loadDetail(opportunity.id)} />
                  <Items items={(detail?.items || []).filter((item) => /qualif|require|clause|bond|scenario|cash|supplier|deviat|lesson|handover/i.test(item.kind))} empty="No qualification, clause, scenario or handover records yet." />
                  <BlueprintRegisters opportunityId={opportunity.id} focus="workspace" />
                </div>
              ) : null}
              {opportunity && tab === 'Lots / Packages' ? <><LineCapture opportunityId={opportunity.id} currency={opportunity.currency || 'NGN'} onSaved={() => loadDetail(opportunity.id)} /><Lines lines={detail?.lines || []} /></> : null}
              {opportunity && tab === 'Compliance Matrix' ? <><ItemCapture opportunityId={opportunity.id} kind="COMPLIANCE" onSaved={() => loadDetail(opportunity.id)} /><Items items={compliance} empty="No compliance items yet." /></> : null}
              {opportunity && tab === 'Documents' ? <Documents documents={(detail?.documents || []).filter((item) => !/addend/i.test(item.category))} opportunityId={opportunity.id} onUploaded={() => loadDetail(opportunity.id)} /> : null}
              {opportunity && tab === 'Addenda' ? <Documents documents={addenda} opportunityId={opportunity.id} category="Addendum" onUploaded={() => loadDetail(opportunity.id)} /> : null}
              {opportunity && tab === 'Clarifications (Q&A)' ? <><ItemCapture opportunityId={opportunity.id} kind="CLARIFICATION" onSaved={() => loadDetail(opportunity.id)} /><Items items={clarifications} empty="No clarifications have been logged." /></> : null}
              {opportunity && tab === 'Risks & Issues' ? <><ItemCapture opportunityId={opportunity.id} kind="RISK" onSaved={() => loadDetail(opportunity.id)} /><Items items={risks} empty="No risks or issues have been logged." /></> : null}
              {opportunity && tab === 'Financials' ? (
                <div className="space-y-3">
                  <ItemCapture opportunityId={opportunity.id} kinds={['SCENARIO', 'CASHFLOW']} onSaved={() => loadDetail(opportunity.id)} />
                  <div className="grid gap-3 md:grid-cols-3">
                    <Metric label="Estimated value" value={money(opportunity.estimatedValue, opportunity.currency)} />
                    <Metric label="Priced lines" value={money(submittedValue, opportunity.currency)} />
                    <Metric label="Awarded value" value={money((detail?.awards || []).reduce((sum, award) => sum + award.awardedValue, 0), opportunity.currency)} />
                  </div>
                  <LineCapture opportunityId={opportunity.id} currency={opportunity.currency || 'NGN'} onSaved={() => loadDetail(opportunity.id)} />
                  <Lines lines={detail?.lines || []} />
                </div>
              ) : null}
              {opportunity && tab === 'Team & Tasks' ? (
                <div className="space-y-3 text-sm">
                  <p><b>Owner:</b> {opportunity.ownerName || 'Unassigned'}</p>
                  <p className="text-slate-600">{opportunity.teamNotes || 'No team notes have been saved.'}</p>
                  <ItemCapture opportunityId={opportunity.id} kind="TASK" onSaved={() => loadDetail(opportunity.id)} />
                  <Items items={tasks} empty="No tasks have been assigned." />
                </div>
              ) : null}
              {opportunity && (tab === 'Timeline' || tab === 'Audit Trail') ? <Audit events={detail?.audit || []} /> : null}
            </div>
          )}
        </article>
      </section>

      <OpportunityModal open={editing} initial={opportunity} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); if (opportunity) loadDetail(opportunity.id); loadList(); }} />
    </div>
  );
}

function Kpi({ icon: Icon, tint, value, label }: { icon: LucideIcon; tint: string; value: number; label: string }) {
  return (
    <article className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
      <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tint}`}><Icon className="h-4 w-4" /></span>
      <div>
        <div className="text-[20px] font-black leading-none text-slate-950">{value}</div>
        <div className="mt-1 text-[11px] font-semibold text-slate-500">{label}</div>
      </div>
    </article>
  );
}

function FilterSelect({ label, allLabel, value, onChange, options }: { label: string; allLabel: string; value: string; onChange: (value: string) => void; options: readonly string[] }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} aria-label={label} className="h-8 w-full truncate rounded-lg border border-slate-200 bg-white px-1.5 text-[11px] font-semibold text-slate-600">
      {options.map((option) => <option key={option} value={option}>{option === 'All' ? allLabel : option}</option>)}
    </select>
  );
}

function PagerButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" aria-label={label} disabled={disabled} onClick={onClick} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-50 disabled:opacity-30">{children}</button>;
}

function DateCard({ label, date, days, tone, className = '' }: { label: string; date: string; days: number | null; tone: string; className?: string }) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      <div className="flex items-start gap-2">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-500"><CalendarDays className="h-4 w-4" /></span>
        <div className="min-w-0">
          <div className="text-[11px] font-semibold leading-tight text-slate-400">{label}</div>
          <div className="mt-1 text-[15px] font-black text-slate-950">{date ? formatWhen(date) : '—'}</div>
          {days != null ? <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${tone}`}>{daysLabel(days)}</span> : null}
        </div>
      </div>
    </section>
  );
}

function Stat({ icon: Icon, tint, value, label }: { icon: LucideIcon; tint: string; value: number; label: string }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${tint}`}><Icon className="h-4 w-4" /></span>
      <div className="mt-2 text-[20px] font-black leading-none text-slate-950">{value}</div>
      <div className="mt-1 text-[11px] font-semibold leading-tight text-slate-500">{label}</div>
    </article>
  );
}

function Lines({ lines }: { lines: TenderLine[] }) {
  if (lines.length === 0) return <p className="text-sm text-slate-500">No lots or priced lines yet.</p>;
  return (
    <table className="w-full text-left text-[13px]">
      <thead className="text-[11px] uppercase text-slate-400"><tr>{['Section', 'Description', 'Qty', 'Unit', 'Sell'].map((heading) => <th key={heading} className="py-2 font-semibold">{heading}</th>)}</tr></thead>
      <tbody>
        {lines.map((line) => <tr key={line.id} className="border-t border-slate-100"><td className="py-2">{line.section || '—'}</td><td className="py-2">{line.description}</td><td className="py-2">{line.quantity}</td><td className="py-2">{line.unit}</td><td className="py-2 font-semibold">{plainNaira(line.sell)}</td></tr>)}
      </tbody>
    </table>
  );
}

function Items({ items, empty }: { items: TenderItem[]; empty: string }) {
  if (items.length === 0) return <p className="text-sm text-slate-500">{empty}</p>;
  return (
    <table className="w-full text-left text-[13px]">
      <thead className="text-[11px] uppercase text-slate-400"><tr>{['Title', 'Owner', 'Due', 'Status'].map((heading) => <th key={heading} className="py-2 font-semibold">{heading}</th>)}</tr></thead>
      <tbody>
        {items.map((item) => <tr key={item.id} className="border-t border-slate-100"><td className="py-2 font-semibold">{item.title}</td><td className="py-2">{item.assignee || '—'}</td><td className="py-2">{formatWhen(item.dueAt)}</td><td className="py-2">{item.status}</td></tr>)}
      </tbody>
    </table>
  );
}

function Documents({ documents, opportunityId, category = 'General', onUploaded }: { documents: TenderDocument[]; opportunityId: string; category?: string; onUploaded: () => void }) {
  return (
    <div className="space-y-3">
      <label className="inline-flex cursor-pointer items-center rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">
        Upload
        <input type="file" className="hidden" onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) tenderUpload(opportunityId, file, category).then(onUploaded);
        }} />
      </label>
      {documents.length === 0 ? <p className="text-sm text-slate-500">No documents in this tab.</p> : documents.map((doc) => (
        <a key={doc.id} className="block text-sm font-semibold text-blue-700" href={`/api/commercial/tenders?resource=document&documentId=${doc.id}`}>{doc.fileName}</a>
      ))}
    </div>
  );
}

function Audit({ events }: { events: Detail['audit'] }) {
  if (events.length === 0) return <p className="text-sm text-slate-500">No activity has been recorded.</p>;
  return <ul className="divide-y divide-slate-100 text-sm">{events.map((event) => <li key={event.id} className="py-2"><b>{event.action}</b> · {event.actor} · {event.details} · {formatWhen(event.createdAt)}</li>)}</ul>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 p-3"><div className="text-[11px] font-semibold text-slate-400">{label}</div><div className="text-lg font-black">{value}</div></div>;
}
