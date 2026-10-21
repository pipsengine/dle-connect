'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Briefcase,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileText,
  LayoutDashboard,
  Plane,
  Plus,
  Search,
  Send,
  Trophy,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { isBusinessGmCommercial, isBusinessManagingDirector } from '@/lib/access/commercial-access';
import type { TenderAuditEvent, TenderOpportunity, TenderSubmission } from '@/lib/commercial/tender-types';
import { daysUntil, receivedOn, sectorOf } from '@/lib/commercial/tender-present';
import {
  awardedToDleOf,
  bidChoiceOf,
  clientStatusOf,
  commercialKindOf,
  externalDeadlineOf,
  internalDeadlineOf,
  isActiveResponse,
  isHistoricalRegister,
  isPreparationRecord,
  registerStatusOf,
  type CommercialKind,
  type RegisterStatus,
} from '@/lib/commercial/tender-workflow';
import { formatWhen, tenderGet } from './tender-api';
import { CommercialOpportunityModal } from './CommercialOpportunityModal';
import { RowMenu } from './record-frame';

type DashTab = 'All Opportunities' | 'ITT' | 'RFQ' | 'EOI' | 'Awaiting GM Review' | 'Awaiting MD Decision' | 'Not Started' | 'In Progress' | 'Submitted' | 'Overdue' | 'Closed';
type PrepFilter = 'All Types' | CommercialKind;
type ClientSlice = 'Pending' | 'Suspended' | 'Cancelled' | 'Re-Opened' | 'Awarded (Yes)' | 'Awarded (No)';

const MAIN_TABS: DashTab[] = ['All Opportunities', 'ITT', 'RFQ', 'EOI', 'Awaiting GM Review', 'Awaiting MD Decision', 'Not Started', 'In Progress', 'Submitted'];
const MORE_TABS: DashTab[] = ['Overdue', 'Closed'];
const STATUS_ORDER: RegisterStatus[] = ['Awaiting GM Review', 'Awaiting MD Decision', 'Not Started', 'In Progress', 'Submitted', 'Closed'];
const STATUS_COLOR: Record<RegisterStatus, string> = {
  'Awaiting GM Review': '#f59e0b',
  'Awaiting MD Decision': '#ef4444',
  'Not Started': '#94a3b8',
  'In Progress': '#2563eb',
  Submitted: '#22c55e',
  Closed: '#0f172a',
  Historical: '#64748b',
};
const TYPE_COLOR: Record<CommercialKind, string> = { ITT: '#2563eb', RFQ: '#7c3aed', EOI: '#16a34a' };
const PREP_COLOR = { 'Not Started': '#94a3b8', 'In Progress': '#2563eb', Submitted: '#22c55e' };
const CLIENT_COLOR: Record<ClientSlice, string> = {
  Pending: '#94a3b8',
  Suspended: '#f59e0b',
  Cancelled: '#ef4444',
  'Re-Opened': '#a855f7',
  'Awarded (Yes)': '#16a34a',
  'Awarded (No)': '#0f172a',
};
const KIND_TONE: Record<CommercialKind, string> = {
  ITT: 'bg-blue-50 text-blue-700',
  RFQ: 'bg-violet-50 text-violet-700',
  EOI: 'bg-emerald-50 text-emerald-700',
};
const STATUS_TONE: Record<RegisterStatus, string> = {
  'Not Started': 'bg-slate-100 text-slate-600',
  'In Progress': 'bg-blue-50 text-blue-700',
  Submitted: 'bg-emerald-50 text-emerald-700',
  'Awaiting GM Review': 'bg-orange-50 text-orange-700',
  'Awaiting MD Decision': 'bg-rose-50 text-rose-600',
  Closed: 'bg-slate-100 text-slate-500',
  Historical: 'bg-slate-100 text-slate-600',
};

const pct = (count: number, total: number) => (total ? Math.round((count / total) * 100) : 0);
const priorityTone = (value: string) => value === 'High' ? 'bg-rose-50 text-rose-600' : value === 'Low' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700';
const deadlineTone = (days: number) => {
  if (days < 0) return 'text-rose-600';
  if (days <= 2) return 'text-orange-600';
  if (days <= 4) return 'text-blue-600';
  return 'text-emerald-600';
};
const within = (value: string, from: string, to: string) => {
  const day = (value || '').slice(0, 10);
  if (!day) return !from && !to;
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
};
const overdue = (row: TenderOpportunity) => {
  const state = registerStatusOf(row);
  if (state === 'Closed' || state === 'Submitted' || state === 'Historical') return false;
  const internal = daysUntil(internalDeadlineOf(row));
  const external = daysUntil(externalDeadlineOf(row));
  return (internal != null && internal < 0) || (external != null && external < 0);
};
const matchesTab = (row: TenderOpportunity, tab: DashTab) => {
  if (tab === 'All Opportunities') return true;
  if (tab === 'ITT' || tab === 'RFQ' || tab === 'EOI') return commercialKindOf(row) === tab;
  if (tab === 'Overdue') return overdue(row);
  return registerStatusOf(row) === tab;
};
const clientSliceOf = (row: TenderOpportunity): ClientSlice => {
  const award = awardedToDleOf(row);
  if (award === 'Yes') return 'Awarded (Yes)';
  if (award === 'No') return 'Awarded (No)';
  const client = clientStatusOf(row);
  if (client === 'Suspended' || client === 'Cancelled' || client === 'Re-Opened') return client;
  return 'Pending';
};
const clientHref = (label: ClientSlice) => {
  if (label === 'Awarded (Yes)') return '/commercial/tenders/awards';
  if (label === 'Awarded (No)') return '/commercial/tenders/submission?status=Not%20Successful';
  if (label === 'Pending') return '/commercial/tenders/submission?status=Awaiting%20Response';
  return '/commercial/tenders/submission';
};
const activityWhen = (value: string) => {
  const parsed = new Date(value);
  if (!value || Number.isNaN(parsed.getTime())) return '—';
  const date = parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const time = parsed.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${date} ${time}`;
};
const activityText = (event: TenderAuditEvent, reference: string) => {
  const action = event.action.toUpperCase();
  const ref = reference || 'Opportunity';
  if (action.includes('SUBMITTED_FOR_REVIEW') || action === 'CREATED') return `${ref} registered for GM Commercial review`;
  if (action.includes('FORWARDED')) return `${ref} forwarded to the MD`;
  if (action.includes('RETURNED')) return `${ref} returned for correction`;
  if (action === 'BID') return `${ref} approved as BID`;
  if (action.includes('NO_BID')) return `${ref} recorded as NO BID`;
  if (action.includes('ASSIGN')) return `${ref} assigned to a responsible officer`;
  if (action.includes('ACKNOWLEDG')) return `${ref} assignment acknowledged`;
  if (action.includes('SUBMIT')) return `${ref} submitted to the client`;
  if (action.includes('AWARD')) return `${ref} award updated`;
  if (action.includes('DEADLINE') || action.includes('REASSIGN')) return `${ref} deadline or assignment updated`;
  return `${ref} ${event.details || event.action}`;
};
const activityIcon = (action: string): { icon: LucideIcon; tint: string } => {
  const text = action.toLowerCase();
  if (/award/.test(text)) return { icon: Trophy, tint: 'bg-emerald-50 text-emerald-600' };
  if (/submit/.test(text)) return { icon: Send, tint: 'bg-blue-50 text-blue-600' };
  if (/bid|review|forward/.test(text)) return { icon: CheckCircle2, tint: 'bg-orange-50 text-orange-600' };
  if (/assign|ack/.test(text)) return { icon: UserRound, tint: 'bg-violet-50 text-violet-600' };
  return { icon: FileText, tint: 'bg-sky-50 text-sky-600' };
};

export function TenderDashboard() {
  const [rows, setRows] = useState<TenderOpportunity[]>([]);
  const [submittedIds, setSubmittedIds] = useState<Set<string>>(new Set());
  const [audit, setAudit] = useState<TenderAuditEvent[]>([]);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [viewer, setViewer] = useState<{ name: string; code: string; roles: string[]; admin: boolean } | null>(null);
  const [tab, setTab] = useState<DashTab>('All Opportunities');
  const [moreOpen, setMoreOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [client, setClient] = useState('All Clients');
  const [sector, setSector] = useState('All Sectors');
  const [officer, setOfficer] = useState('All Officers');
  const [status, setStatus] = useState('All Statuses');
  const [priority, setPriority] = useState('All Priorities');
  const [type, setType] = useState('All Types');
  const [internalFrom, setInternalFrom] = useState('');
  const [internalTo, setInternalTo] = useState('');
  const [externalFrom, setExternalFrom] = useState('');
  const [externalTo, setExternalTo] = useState('');
  const [applied, setApplied] = useState({ client: 'All Clients', sector: 'All Sectors', officer: 'All Officers', status: 'All Statuses', priority: 'All Priorities', type: 'All Types', internalFrom: '', internalTo: '', externalFrom: '', externalTo: '' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [picked, setPicked] = useState<string[]>([]);
  const [menuId, setMenuId] = useState('');
  const [prepFilter, setPrepFilter] = useState<PrepFilter>('All Types');
  const [modalOpen, setModalOpen] = useState(false);
  const today = useMemo(() => new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }), []);

  const load = async () => {
    const [opportunities, submissionRows, auditRows] = await Promise.all([
      tenderGet<TenderOpportunity[]>('opportunities'),
      tenderGet<TenderSubmission[]>('submissions'),
      tenderGet<TenderAuditEvent[]>('audit'),
    ]);
    setRows(opportunities);
    setSubmittedIds(new Set(submissionRows.map((item) => item.opportunityId)));
    setAudit(auditRows);
  };

  useEffect(() => {
    let active = true;
    load()
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Unable to read the tender register.'); })
      .finally(() => { if (active) setReady(true); });
    fetch('/api/auth/me', { cache: 'no-store', credentials: 'same-origin' })
      .then((response) => (response.ok ? response.json() : null))
      .then((json) => {
        const data = json?.data || {};
        if (!active) return;
        setViewer({
          name: String(data.fullName || ''),
          code: String(data.employeeCode || ''),
          roles: Array.isArray(data.roles) ? data.roles : [],
          admin: Boolean(data.isGlobalAdmin) || (Array.isArray(data.roles) && data.roles.includes('Super Administrator')),
        });
      })
      .catch(() => { if (active) setViewer({ name: '', code: '', roles: [], admin: false }); });
    return () => { active = false; };
  }, []);

  const scoped = useMemo(() => {
    const pipeline = rows.filter((row) => !isHistoricalRegister(row));
    if (!viewer) return pipeline;
    if (viewer.admin || isBusinessManagingDirector(viewer.roles) || isBusinessGmCommercial(viewer.roles)) return pipeline;
    const broad = viewer.roles.some((role) => /engineer|finance|legal|hse|commercial|proposal|sales|cfo|operations/i.test(role));
    if (broad) return pipeline;
    const mine = (value: string) => {
      const text = value.toLowerCase();
      return [viewer.name, viewer.code].filter(Boolean).some((part) => text.includes(part.toLowerCase()));
    };
    return pipeline.filter((row) => mine(row.ownerName) || mine(row.ownerEmployeeCode) || mine(row.createdBy));
  }, [rows, viewer]);

  const countStatus = (statusName: RegisterStatus) => scoped.filter((row) => registerStatusOf(row) === statusName).length;
  const countKind = (kind: CommercialKind) => scoped.filter((row) => commercialKindOf(row) === kind).length;
  const submittedRows = scoped.filter((row) => bidChoiceOf(row) !== 'No Bid' && (submittedIds.has(row.id) || registerStatusOf(row) === 'Submitted'));
  const activeRows = scoped.filter(isActiveResponse);
  const overdueRows = scoped.filter(overdue);
  const awardedRows = scoped.filter((row) => awardedToDleOf(row) === 'Yes');
  const prepRows = scoped.filter((row) => isPreparationRecord(row) && (prepFilter === 'All Types' || commercialKindOf(row) === prepFilter));
  const prepParts = (['Not Started', 'In Progress', 'Submitted'] as const).map((label) => ({
    label,
    count: prepRows.filter((row) => registerStatusOf(row) === label).length,
    color: PREP_COLOR[label],
    href: `/commercial/tenders/opportunities?tab=${encodeURIComponent(label)}`,
  }));
  const clientPopulation = scoped.filter((row) => bidChoiceOf(row) !== 'No Bid' && (submittedIds.has(row.id) || registerStatusOf(row) === 'Submitted' || clientStatusOf(row) !== 'Pending' || awardedToDleOf(row) !== 'Pending Decision'));
  const clientParts = (Object.keys(CLIENT_COLOR) as ClientSlice[]).map((label) => ({
    label,
    count: clientPopulation.filter((row) => clientSliceOf(row) === label).length,
    color: CLIENT_COLOR[label],
    href: clientHref(label),
  }));
  const typeParts = (['ITT', 'RFQ', 'EOI'] as const).map((label) => ({
    label: label === 'ITT' ? 'Invitation to Tender (ITT)' : label === 'RFQ' ? 'Request for Quotation (RFQ)' : 'Expression of Interest (EOI)',
    short: label,
    count: countKind(label),
    color: TYPE_COLOR[label],
    href: `/commercial/tenders/opportunities?tab=${label}`,
  }));
  const statusParts = STATUS_ORDER.map((label) => ({
    label: label === 'Closed' ? 'Closed (No Bid)' : label,
    count: countStatus(label),
    color: STATUS_COLOR[label],
    href: `/commercial/tenders/opportunities?tab=${encodeURIComponent(label)}`,
  }));

  const deadlines = scoped.flatMap((row) => {
    const items: Array<{ id: string; row: TenderOpportunity; kind: 'Internal Deadline' | 'External Deadline'; date: string; days: number; officer: string }> = [];
    const internal = internalDeadlineOf(row);
    const external = externalDeadlineOf(row);
    const internalDays = daysUntil(internal);
    const externalDays = daysUntil(external);
    if (internal && internalDays != null && internalDays >= 0 && internalDays <= 7) items.push({ id: `${row.id}-internal`, row, kind: 'Internal Deadline', date: internal, days: internalDays, officer: row.ownerName });
    if (external && externalDays != null && externalDays >= 0 && externalDays <= 7) items.push({ id: `${row.id}-external`, row, kind: 'External Deadline', date: external, days: externalDays, officer: row.ownerName });
    return items;
  }).sort((left, right) => left.days - right.days || left.date.localeCompare(right.date));

  const clients = useMemo(() => Array.from(new Set(scoped.map((row) => row.clientName).filter(Boolean))).sort(), [scoped]);
  const sectors = useMemo(() => Array.from(new Set(scoped.map((row) => sectorOf(row)))).sort(), [scoped]);
  const officers = useMemo(() => Array.from(new Set(scoped.map((row) => row.ownerName).filter(Boolean))).sort(), [scoped]);
  const tabCount = (item: DashTab) => scoped.filter((row) => matchesTab(row, item)).length;
  const filtered = useMemo(() => scoped.filter((row) => {
    if (!matchesTab(row, tab)) return false;
    const haystack = `${row.title} ${row.clientName} ${row.referenceNo} ${row.enquiryRef}`.toLowerCase();
    if (appliedSearch && !haystack.includes(appliedSearch.toLowerCase())) return false;
    if (applied.client !== 'All Clients' && row.clientName !== applied.client) return false;
    if (applied.sector !== 'All Sectors' && sectorOf(row) !== applied.sector) return false;
    if (applied.officer !== 'All Officers' && row.ownerName !== applied.officer) return false;
    if (applied.status !== 'All Statuses' && registerStatusOf(row) !== applied.status) return false;
    if (applied.priority !== 'All Priorities' && row.priority !== applied.priority) return false;
    if (applied.type !== 'All Types' && commercialKindOf(row) !== applied.type) return false;
    if (!within(internalDeadlineOf(row), applied.internalFrom, applied.internalTo)) return false;
    if (!within(externalDeadlineOf(row), applied.externalFrom, applied.externalTo)) return false;
    return true;
  }), [applied, appliedSearch, scoped, tab]);

  useEffect(() => { setPage(1); }, [applied, appliedSearch, pageSize, tab]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const pageIds = pageRows.map((row) => row.id);
  const allPicked = pageIds.length > 0 && pageIds.every((id) => picked.includes(id));
  const activities = audit.filter((event) => !event.opportunityId || scoped.some((row) => row.id === event.opportunityId)).slice(0, 5);

  const applyFilters = () => {
    setAppliedSearch(search.trim());
    setApplied({ client, sector, officer, status, priority, type, internalFrom, internalTo, externalFrom, externalTo });
  };
  const clearFilters = () => {
    setSearch('');
    setAppliedSearch('');
    setClient('All Clients');
    setSector('All Sectors');
    setOfficer('All Officers');
    setStatus('All Statuses');
    setPriority('All Priorities');
    setType('All Types');
    setInternalFrom('');
    setInternalTo('');
    setExternalFrom('');
    setExternalTo('');
    setApplied({ client: 'All Clients', sector: 'All Sectors', officer: 'All Officers', status: 'All Statuses', priority: 'All Priorities', type: 'All Types', internalFrom: '', internalTo: '', externalFrom: '', externalTo: '' });
  };

  return (
    <div className="space-y-3">
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[#2563eb] text-white"><LayoutDashboard className="h-5 w-5" /></span>
          <div>
            <h1 className="text-[22px] font-black tracking-tight text-slate-950">Tender Management Dashboard</h1>
            <p className="text-[12px] text-slate-500">Overview of commercial opportunities, key activities, deadlines and outcomes</p>
          </div>
        </div>
        <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
          <CalendarDays className="h-4 w-4 text-slate-400" />
          <span>
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Today</span>
            <span className="block text-[12px] font-bold text-slate-800">{today}</span>
          </span>
        </div>
      </section>
      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric href="/commercial/tenders/opportunities" icon={Briefcase} tint="bg-blue-50 text-blue-600" value={scoped.length} label="Total Opportunities" loading={!ready} />
        <Metric href="/commercial/tenders/opportunities?tab=ITT" icon={FileText} tint="bg-blue-50 text-blue-600" value={countKind('ITT')} label="Invitation to Tender (ITT)" loading={!ready} />
        <Metric href="/commercial/tenders/opportunities?tab=RFQ" icon={FileText} tint="bg-emerald-50 text-emerald-600" value={countKind('RFQ')} label="Request for Quotation (RFQ)" loading={!ready} />
        <Metric href="/commercial/tenders/opportunities?tab=EOI" icon={FileText} tint="bg-violet-50 text-violet-600" value={countKind('EOI')} label="Expression of Interest (EOI)" loading={!ready} />
      </section>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Metric href="/commercial/tenders/opportunities?tab=Awaiting%20GM%20Review" icon={Users} tint="bg-orange-100 text-orange-600" surface="bg-[#fff6ec]" value={countStatus('Awaiting GM Review')} label="Awaiting GM Commercial Review" loading={!ready} />
        <Metric href="/commercial/tenders/opportunities?tab=Awaiting%20MD%20Decision" icon={UserRound} tint="bg-rose-100 text-rose-600" surface="bg-[#fff1f2]" value={countStatus('Awaiting MD Decision')} label="Awaiting MD Decision" loading={!ready} />
        <Metric href="/commercial/tenders/opportunities?view=active" icon={Clock3} tint="bg-blue-100 text-blue-600" surface="bg-[#eef6ff]" value={activeRows.length} label="Active Responses" loading={!ready} />
        <Metric href="/commercial/tenders/opportunities?tab=Overdue" icon={Clock3} tint="bg-rose-100 text-rose-500" surface="bg-[#fff1f4]" value={overdueRows.length} label="Overdue Deadlines" loading={!ready} />
        <Metric href="/commercial/tenders/opportunities?tab=Submitted" icon={Plane} tint="bg-blue-100 text-blue-600" surface="bg-[#eef6ff]" value={submittedRows.length} label="Submitted Bids" loading={!ready} />
        <Metric href="/commercial/tenders/awards" icon={Trophy} tint="bg-emerald-100 text-emerald-600" surface="bg-[#eefbf3]" value={awardedRows.length} label="Awarded to DLE" loading={!ready} />
      </section>

      <section className="grid items-stretch gap-3 xl:grid-cols-3">
        <Panel title="Opportunities by Type">
          <Donut parts={typeParts} total={scoped.length} caption="Total" />
        </Panel>
        <Panel title="Opportunities by Status">
          <Donut parts={statusParts} total={scoped.length} caption="Total" />
        </Panel>
        <Panel title="Key Deadlines (Next 7 Days)" action={<Link href="/commercial/tenders/opportunities" className="text-[12px] font-semibold text-blue-600">View All</Link>}>
          {deadlines.length === 0 ? <p className="py-8 text-center text-[12px] text-slate-500">{ready ? 'No deadlines fall in the next 7 days.' : 'Loading deadlines…'}</p> : (
            <ul className="divide-y divide-slate-100">
              {deadlines.slice(0, 5).map((item) => (
                <li key={item.id}>
                  <Link href={`/commercial/tenders/opportunities?id=${item.row.id}`} className="grid grid-cols-[92px_minmax(0,1fr)_auto] items-center gap-2 py-2.5 hover:bg-slate-50" title={`${item.row.title}${item.officer ? ` · ${item.officer}` : ''}`}>
                    <span className="text-[12px] font-semibold text-slate-700">{formatWhen(item.date)}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-[12px] font-bold text-slate-800">{item.row.referenceNo}</span>
                      <span className="block truncate text-[11px] text-slate-400">{item.kind}{item.officer ? ` · ${item.officer}` : ''}</span>
                    </span>
                    <span className={`text-[12px] font-bold ${deadlineTone(item.days)}`}>{item.days === 0 ? 'Due today' : item.days === 1 ? '1 day left' : `${item.days} days left`}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </section>

      <section className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
        <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4">
            <h2 className="text-[15px] font-black text-slate-950">Recent Opportunities</h2>
            <div className="flex items-center gap-2">
              <Link href="/commercial/tenders/opportunities" className="text-[12px] font-semibold text-blue-600">View All</Link>
              <button type="button" onClick={() => setModalOpen(true)} className="inline-flex h-9 items-center gap-1 rounded-lg bg-[#2563eb] px-3 text-[12px] font-bold text-white"><Plus className="h-3.5 w-3.5" /> New Opportunity <ChevronDown className="h-3.5 w-3.5" /></button>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-1 overflow-x-auto border-b border-slate-100 px-3">
            {MAIN_TABS.map((item) => (
              <button key={item} type="button" onClick={() => setTab(item)} className={`whitespace-nowrap border-b-2 px-2.5 py-2 text-[12px] font-semibold ${tab === item ? 'border-[#2563eb] text-[#2563eb]' : 'border-transparent text-slate-500'}`}>
                {item === 'All Opportunities' ? 'All Opportunities' : item === 'Awaiting GM Review' ? 'Awaiting GM Review' : item === 'Awaiting MD Decision' ? 'Awaiting MD Decision' : item} ({tabCount(item)})
              </button>
            ))}
            <div className="relative">
              <button type="button" onClick={() => setMoreOpen((value) => !value)} className={`border-b-2 px-2 py-2 ${MORE_TABS.includes(tab) ? 'border-[#2563eb] text-[#2563eb]' : 'border-transparent text-slate-500'}`} aria-label="More register tabs"><ChevronDown className="h-4 w-4" /></button>
              {moreOpen ? (
                <div className="absolute right-0 z-10 w-40 rounded-xl border border-slate-200 bg-white py-1 text-[12px] shadow-lg">
                  {MORE_TABS.map((item) => (
                    <button key={item} type="button" onClick={() => { setTab(item); setMoreOpen(false); }} className="block w-full px-3 py-2 text-left hover:bg-slate-50">{item} ({tabCount(item)})</button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
          <div className="space-y-2 px-3 py-3">
            <div className="grid gap-2 lg:grid-cols-[minmax(180px,1.3fr)_repeat(4,minmax(120px,1fr))]">
              <label className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') applyFilters(); }} placeholder="Search by title, client, reference no..." className="h-10 w-full rounded-lg border border-slate-200 bg-[#f8fafc] pl-9 pr-3 text-[12px]" aria-label="Search opportunities" />
              </label>
              <Filter label="Client" value={client} onChange={setClient} options={['All Clients', ...clients]} />
              <Filter label="Sector" value={sector} onChange={setSector} options={['All Sectors', ...sectors]} />
              <Filter label="Officer" value={officer} onChange={setOfficer} options={['All Officers', ...officers]} />
              <Filter label="Status" value={status} onChange={setStatus} options={['All Statuses', ...STATUS_ORDER]} />
            </div>
            <div className="grid gap-2 lg:grid-cols-[repeat(4,minmax(110px,1fr))_auto]">
              <Filter label="Priority" value={priority} onChange={setPriority} options={['All Priorities', 'High', 'Medium', 'Low']} />
              <Filter label="Type" value={type} onChange={setType} options={['All Types', 'ITT', 'RFQ', 'EOI']} />
              <label className="text-[11px] font-semibold text-slate-400">Internal
                <span className="mt-1 flex gap-1"><input type="date" value={internalFrom} onChange={(event) => setInternalFrom(event.target.value)} aria-label="Internal deadline from" className="h-10 w-full rounded-lg border border-slate-200 px-1 text-[11px]" /><input type="date" value={internalTo} onChange={(event) => setInternalTo(event.target.value)} aria-label="Internal deadline to" className="h-10 w-full rounded-lg border border-slate-200 px-1 text-[11px]" /></span>
              </label>
              <label className="text-[11px] font-semibold text-slate-400">External
                <span className="mt-1 flex gap-1"><input type="date" value={externalFrom} onChange={(event) => setExternalFrom(event.target.value)} aria-label="External deadline from" className="h-10 w-full rounded-lg border border-slate-200 px-1 text-[11px]" /><input type="date" value={externalTo} onChange={(event) => setExternalTo(event.target.value)} aria-label="External deadline to" className="h-10 w-full rounded-lg border border-slate-200 px-1 text-[11px]" /></span>
              </label>
              <div className="flex items-end gap-2">
                <button type="button" onClick={clearFilters} className="inline-flex h-10 items-center gap-1 text-[12px] font-semibold text-slate-500"><X className="h-3.5 w-3.5" /> Clear Filters</button>
                <button type="button" onClick={applyFilters} className="inline-flex h-10 items-center gap-1 rounded-lg bg-[#2563eb] px-3 text-[12px] font-bold text-white"><Search className="h-3.5 w-3.5" /> Search</button>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-[12px]">
              <thead className="bg-[#f8fafc] text-[11px] uppercase tracking-wide text-slate-400">
                <tr>{['', '#', 'Reference No.', 'Client', 'Project Title', 'Type', 'Sector', 'Received', 'Internal Deadline', 'External Deadline', 'Priority', 'Status', 'Actions'].map((heading) => <th key={heading || 'select'} className="px-3 py-2.5 font-semibold">{heading === '' ? <input type="checkbox" checked={allPicked} onChange={() => setPicked(allPicked ? picked.filter((id) => !pageIds.includes(id)) : Array.from(new Set([...picked, ...pageIds])))} aria-label="Select page" /> : heading}</th>)}</tr>
              </thead>
              <tbody>
                {!ready ? Array.from({ length: 5 }, (_, index) => <tr key={index} className="border-t border-slate-100"><td colSpan={13} className="px-3 py-3"><div className="h-4 animate-pulse rounded bg-slate-100" /></td></tr>) : pageRows.length === 0 ? <tr><td colSpan={13} className="px-4 py-10 text-center text-slate-500">No commercial opportunities match this view.</td></tr> : pageRows.map((row, index) => {
                  const kind = commercialKindOf(row);
                  const state = registerStatusOf(row);
                  const internal = internalDeadlineOf(row);
                  const external = externalDeadlineOf(row);
                  const internalDays = daysUntil(internal);
                  return (
                    <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50/70">
                      <td className="px-3 py-2.5"><input type="checkbox" checked={picked.includes(row.id)} onChange={() => setPicked((current) => current.includes(row.id) ? current.filter((id) => id !== row.id) : [...current, row.id])} aria-label={`Select ${row.referenceNo}`} /></td>
                      <td className="px-3 py-2.5 text-slate-400">{(safePage - 1) * pageSize + index + 1}</td>
                      <td className="px-3 py-2.5 font-semibold text-blue-700"><Link href={`/commercial/tenders/opportunities?id=${row.id}`}>{row.referenceNo || '—'}</Link></td>
                      <td className="px-3 py-2.5 font-semibold text-slate-800">{row.clientName || '—'}</td>
                      <td className="max-w-[240px] truncate px-3 py-2.5 text-slate-700" title={row.ownerName ? `Officer: ${row.ownerName}` : row.title}><Link href={`/commercial/tenders/opportunities?id=${row.id}`}>{row.title}</Link></td>
                      <td className="px-3 py-2.5"><span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${KIND_TONE[kind]}`}>{kind}</span></td>
                      <td className="px-3 py-2.5 text-slate-600">{sectorOf(row)}</td>
                      <td className="px-3 py-2.5 text-slate-600">{formatWhen(receivedOn(row))}</td>
                      <td className={`px-3 py-2.5 font-semibold ${internalDays != null && internalDays < 0 ? 'text-rose-600' : internalDays != null && internalDays <= 3 ? 'text-orange-600' : 'text-slate-700'}`}>{internal ? formatWhen(internal) : '—'}</td>
                      <td className="px-3 py-2.5 text-slate-700">{external ? formatWhen(external) : '—'}</td>
                      <td className="px-3 py-2.5"><span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${priorityTone(row.priority)}`}>{row.priority || '—'}</span></td>
                      <td className="px-3 py-2.5"><span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${STATUS_TONE[state]}`}>{state}</span></td>
                      <td className="px-3 py-2.5">
                        <RowMenu open={menuId === row.id} label={`Actions for ${row.referenceNo}`} onToggle={() => setMenuId(menuId === row.id ? '' : row.id)}>
                          <Link href={`/commercial/tenders/opportunities?id=${row.id}`} className="block px-3 py-2 hover:bg-slate-50" onClick={() => setMenuId('')}>View details</Link>
                          <Link href={`/commercial/tenders/approvals?id=${row.id}`} className="block px-3 py-2 hover:bg-slate-50" onClick={() => setMenuId('')}>Open approval</Link>
                        </RowMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 text-[12px] text-slate-500">
            <span>Showing {filtered.length === 0 ? 0 : (safePage - 1) * pageSize + 1} to {Math.min(safePage * pageSize, filtered.length)} of {filtered.length} opportunities</span>
            <div className="flex items-center gap-1">
              <button type="button" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)} className="h-8 rounded-lg border border-slate-200 px-2 disabled:opacity-40" aria-label="Previous page">‹</button>
              {Array.from({ length: pageCount }, (_, index) => index + 1).filter((number) => Math.abs(number - safePage) <= 2).map((number) => (
                <button key={number} type="button" onClick={() => setPage(number)} className={`h-8 min-w-8 rounded-lg px-2 ${safePage === number ? 'bg-[#2563eb] text-white' : 'border border-slate-200'}`}>{number}</button>
              ))}
              <button type="button" disabled={safePage >= pageCount} onClick={() => setPage(safePage + 1)} className="h-8 rounded-lg border border-slate-200 px-2 disabled:opacity-40" aria-label="Next page">›</button>
              <label className="ml-2 inline-flex items-center gap-1">Show
                <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} className="h-8 rounded-lg border border-slate-200 px-2" aria-label="Rows per page">{[5, 10, 25].map((size) => <option key={size}>{size}</option>)}</select>
              </label>
            </div>
          </div>
        </article>

        <div className="space-y-3">
          <Panel title="Preparation & Submission Status" action={<Link href="/commercial/tenders/bid-preparation" className="text-[12px] font-semibold text-blue-600">View Details</Link>}>
            <div className="mb-3 flex gap-1">
              {(['All Types', 'ITT', 'RFQ', 'EOI'] as const).map((item) => (
                <button key={item} type="button" onClick={() => setPrepFilter(item)} className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${prepFilter === item ? 'bg-[#2563eb] text-white' : 'bg-slate-100 text-slate-600'}`}>{item}</button>
              ))}
            </div>
            <Donut parts={prepParts} total={prepRows.length} caption="Active" />
          </Panel>
          <Panel title="Client Decision Status" action={<Link href="/commercial/tenders/submission" className="text-[12px] font-semibold text-blue-600">View Details</Link>}>
            <Donut parts={clientParts} total={clientPopulation.length} caption="Submitted" />
          </Panel>
          <Panel title="Recent Activities" action={<Link href="/commercial/tenders/reports" className="text-[12px] font-semibold text-blue-600">View All</Link>}>
            {activities.length === 0 ? <p className="py-6 text-center text-[12px] text-slate-500">{ready ? 'No activity has been recorded.' : 'Loading activity…'}</p> : activities.map((event) => {
              const parent = scoped.find((row) => row.id === event.opportunityId);
              const visual = activityIcon(event.action);
              const Icon = visual.icon;
              return (
                <Link key={event.id} href={parent ? `/commercial/tenders/opportunities?id=${parent.id}` : '/commercial/tenders/reports'} className="flex items-start gap-2 border-t border-slate-50 py-2 first:border-0">
                  <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${visual.tint}`}><Icon className="h-3.5 w-3.5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-semibold text-slate-800">{activityText(event, parent?.referenceNo || '')}</span>
                    <span className="block truncate text-[11px] text-slate-400">{event.actor} · {activityWhen(event.createdAt)}</span>
                  </span>
                </Link>
              );
            })}
          </Panel>
        </div>
      </section>

      <CommercialOpportunityModal
        open={modalOpen}
        clients={clients}
        onClose={() => setModalOpen(false)}
        onSaved={() => { setModalOpen(false); void load().catch((reason) => setError(reason instanceof Error ? reason.message : 'Unable to refresh the dashboard.')); }}
      />
    </div>
  );
}

function Metric({ href, icon: Icon, tint, surface = 'bg-white', value, label, loading }: { href: string; icon: LucideIcon; tint: string; surface?: string; value: number; label: string; loading: boolean }) {
  return (
    <Link href={href} className={`flex min-h-[84px] items-center gap-3 rounded-2xl border border-slate-200/80 px-4 py-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${surface}`}>
      <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tint}`}><Icon className="h-4 w-4" /></span>
      <span>
        <span className="block text-[26px] font-black leading-none text-slate-950">{loading ? '—' : value}</span>
        <span className="mt-1 block text-[12px] font-semibold leading-tight text-slate-500">{label}</span>
      </span>
    </Link>
  );
}

function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-black text-slate-950">{title}</h2>
        {action}
      </div>
      {children}
    </article>
  );
}

function Donut({ parts, total, caption }: { parts: Array<{ label: string; count: number; color: string; href: string }>; total: number; caption: string }) {
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  let cursor = 0;
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 100 100" className="h-[132px] w-[132px] shrink-0">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="#eef2f7" strokeWidth="12" />
        {total > 0 ? parts.map((part) => {
          if (!part.count) return null;
          const length = (part.count / total) * circumference;
          const node = <circle key={part.label} cx="50" cy="50" r={radius} fill="none" stroke={part.color} strokeWidth="12" strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-cursor} strokeLinecap="butt" transform="rotate(-90 50 50)" />;
          cursor += length;
          return node;
        }) : null}
        <text x="50" y="48" textAnchor="middle" fill="#0f172a" fontSize="16" fontWeight="800">{total}</text>
        <text x="50" y="62" textAnchor="middle" fill="#94a3b8" fontSize="8">{caption}</text>
      </svg>
      <ul className="min-w-0 flex-1 space-y-1.5">
        {parts.map((part) => (
          <li key={part.label}>
            <Link href={part.href} className="flex items-center gap-2 text-[12px] text-slate-600 hover:text-blue-700">
              <i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: part.color }} />
              <span className="min-w-0 flex-1 truncate">{part.label}</span>
              <b className="text-slate-900">{part.count}</b>
              <span className="w-10 text-right text-slate-400">({pct(part.count, total)}%)</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Filter({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} aria-label={label} className="h-10 rounded-lg border border-slate-200 bg-white px-2 text-[12px] text-slate-700">
      {options.map((option) => <option key={option}>{option}</option>)}
    </select>
  );
}
