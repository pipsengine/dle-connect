'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Briefcase, ChevronDown, Plus, Search, X } from 'lucide-react';
import { isBusinessGmCommercial } from '@/lib/access/commercial-access';
import type { TenderAuditEvent, TenderDocument, TenderOpportunity } from '@/lib/commercial/tender-types';
import { daysUntil, receivedOn, sectorOf } from '@/lib/commercial/tender-present';
import {
  commercialKindOf,
  commercialReviewOf,
  isActiveResponse,
  documentChecklistFor,
  externalDeadlineOf,
  internalDeadlineOf,
  mdDecisionOf,
  preparationOf,
  clientStatusOf,
  awardedToDleOf,
  registerStatusOf,
  type CommercialKind,
  type RegisterStatus,
} from '@/lib/commercial/tender-workflow';
import { formatWhen, tenderGet, tenderPost } from './tender-api';
import { CommercialOpportunityModal } from './CommercialOpportunityModal';
import { RowMenu } from './record-frame';

type Tab = 'All Opportunities' | 'ITT' | 'RFQ' | 'EOI' | 'Awaiting GM Review' | 'Awaiting MD Decision' | RegisterStatus | 'Overdue';
type SortKey = 'reference' | 'client' | 'title' | 'type' | 'sector' | 'received' | 'internal' | 'external' | 'priority' | 'officer' | 'status';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'All Opportunities', label: 'All Opportunities' },
  { id: 'ITT', label: 'Invitation to Tender' },
  { id: 'RFQ', label: 'Request for Quotation' },
  { id: 'EOI', label: 'Expression of Interest' },
  { id: 'Awaiting GM Review', label: 'Awaiting GM Review' },
  { id: 'Awaiting MD Decision', label: 'Awaiting MD Decision' },
  { id: 'Not Started', label: 'Not Started' },
  { id: 'In Progress', label: 'In Progress' },
  { id: 'Submitted', label: 'Submitted' },
  { id: 'Overdue', label: 'Overdue' },
  { id: 'Closed', label: 'Closed' },
];

const STATUSES: RegisterStatus[] = ['Not Started', 'In Progress', 'Submitted', 'Awaiting GM Review', 'Awaiting MD Decision', 'Closed'];
const PRIORITIES = ['High', 'Medium', 'Low'];
const KIND_LABEL: Record<CommercialKind, string> = { ITT: 'ITT', RFQ: 'RFQ', EOI: 'EOI' };

const kindTone: Record<CommercialKind, string> = {
  ITT: 'bg-blue-50 text-blue-700',
  RFQ: 'bg-violet-50 text-violet-700',
  EOI: 'bg-emerald-50 text-emerald-700',
};
const statusTone: Record<RegisterStatus, string> = {
  'Not Started': 'bg-slate-100 text-slate-600',
  'In Progress': 'bg-blue-50 text-blue-700',
  Submitted: 'bg-emerald-50 text-emerald-700',
  'Awaiting GM Review': 'bg-orange-50 text-orange-700',
  'Awaiting MD Decision': 'bg-amber-50 text-amber-700',
  Closed: 'bg-slate-100 text-slate-500',
};
const priorityTone = (value: string) => value === 'High' ? 'bg-rose-50 text-rose-600' : value === 'Low' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700';

const dateTone = (value: string) => {
  const days = daysUntil(value);
  if (!value || days == null) return 'text-slate-400';
  if (days < 0) return 'font-semibold text-rose-600';
  if (days <= 3) return 'font-semibold text-orange-600';
  if (days <= 7) return 'font-semibold text-amber-700';
  return 'text-slate-700';
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
  if (state === 'Closed' || state === 'Submitted') return false;
  const internal = daysUntil(internalDeadlineOf(row));
  const external = daysUntil(externalDeadlineOf(row));
  return (internal != null && internal < 0) || (external != null && external < 0);
};

const matchesTab = (row: TenderOpportunity, tab: Tab) => {
  if (tab === 'All Opportunities') return true;
  if (tab === 'ITT' || tab === 'RFQ' || tab === 'EOI') return commercialKindOf(row) === tab;
  if (tab === 'Overdue') return overdue(row);
  return registerStatusOf(row) === tab;
};

export function OpportunitiesRegister() {
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<TenderOpportunity[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const requestedTab = searchParams.get('tab') || '';
  const [tab, setTab] = useState<Tab>(TABS.some((item) => item.id === requestedTab) ? requestedTab as Tab : 'All Opportunities');
  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [appliedSearch, setAppliedSearch] = useState(searchParams.get('q') || '');
  const [client, setClient] = useState('All Clients');
  const [sector, setSector] = useState('All Sectors');
  const [officer, setOfficer] = useState('All Officers');
  const [status, setStatus] = useState('All Statuses');
  const [priority, setPriority] = useState('All Priorities');
  const [type, setType] = useState('All Types');
  const [source, setSource] = useState('All Sources');
  const [internalFrom, setInternalFrom] = useState('');
  const [internalTo, setInternalTo] = useState('');
  const [externalFrom, setExternalFrom] = useState('');
  const [externalTo, setExternalTo] = useState('');
  const [applied, setApplied] = useState({ client: 'All Clients', sector: 'All Sectors', officer: 'All Officers', status: 'All Statuses', priority: 'All Priorities', type: 'All Types', source: 'All Sources', internalFrom: '', internalTo: '', externalFrom: '', externalTo: '' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [picked, setPicked] = useState<string[]>([]);
  const [menuId, setMenuId] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('received');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TenderOpportunity | null>(null);
  const [gm, setGm] = useState(false);
  const [detail, setDetail] = useState<TenderOpportunity | null>(null);
  const [documents, setDocuments] = useState<TenderDocument[]>([]);
  const [history, setHistory] = useState<TenderAuditEvent[]>([]);
  const [reviewNote, setReviewNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await tenderGet<TenderOpportunity[]>('opportunities'));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to read commercial opportunities.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);
  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store', credentials: 'same-origin' })
      .then((response) => (response.ok ? response.json() : null))
      .then((json) => setGm(isBusinessGmCommercial(json?.data?.roles || [])))
      .catch(() => setGm(false));
  }, []);
  useEffect(() => {
    const requested = searchParams.get('tab') || '';
    if (TABS.some((item) => item.id === requested)) setTab(requested as Tab);
    const query = searchParams.get('q') || '';
    if (query) {
      setSearch(query);
      setAppliedSearch(query);
    }
    if (searchParams.get('compose') === '1') {
      setEditing(null);
      setModalOpen(true);
    }
    const openId = searchParams.get('id') || '';
    if (openId) {
      tenderGet<{ opportunity: TenderOpportunity; documents: TenderDocument[]; audit: TenderAuditEvent[] }>('opportunity', { id: openId })
        .then((pack) => {
          setDetail(pack.opportunity);
          setDocuments(pack.documents || []);
          setHistory(pack.audit || []);
        })
        .catch(() => undefined);
    }
  }, [searchParams]);

  const registerRows = useMemo(() => {
    if (searchParams.get('view') === 'active') return rows.filter(isActiveResponse);
    if (searchParams.get('view') === 'awarded') return rows.filter((row) => awardedToDleOf(row) === 'Yes');
    return rows;
  }, [rows, searchParams]);
  const counts = useMemo(() => {
    const count = (item: Tab) => registerRows.filter((row) => matchesTab(row, item)).length;
    return Object.fromEntries(TABS.map((item) => [item.id, count(item.id)])) as Record<Tab, number>;
  }, [registerRows]);

  const clients = useMemo(() => Array.from(new Set(registerRows.map((row) => row.clientName).filter(Boolean))).sort(), [registerRows]);
  const sectors = useMemo(() => Array.from(new Set(registerRows.map((row) => sectorOf(row)))).sort(), [registerRows]);
  const officers = useMemo(() => Array.from(new Set(registerRows.map((row) => row.ownerName).filter(Boolean))).sort(), [registerRows]);
  const sources = useMemo(() => Array.from(new Set(registerRows.map((row) => row.source).filter(Boolean))).sort(), [registerRows]);

  const filtered = useMemo(() => {
    const list = registerRows.filter((row) => {
      if (!matchesTab(row, tab)) return false;
      const haystack = `${row.title} ${row.clientName} ${row.referenceNo} ${row.enquiryRef} ${row.ownerName}`.toLowerCase();
      if (appliedSearch && !haystack.includes(appliedSearch.toLowerCase())) return false;
      if (applied.client !== 'All Clients' && row.clientName !== applied.client) return false;
      if (applied.sector !== 'All Sectors' && sectorOf(row) !== applied.sector) return false;
      if (applied.officer !== 'All Officers' && row.ownerName !== applied.officer) return false;
      if (applied.status !== 'All Statuses' && registerStatusOf(row) !== applied.status) return false;
      if (applied.priority !== 'All Priorities' && row.priority !== applied.priority) return false;
      if (applied.type !== 'All Types' && commercialKindOf(row) !== applied.type) return false;
      if (applied.source !== 'All Sources' && row.source !== applied.source) return false;
      if (!within(internalDeadlineOf(row), applied.internalFrom, applied.internalTo)) return false;
      if (!within(externalDeadlineOf(row), applied.externalFrom, applied.externalTo)) return false;
      return true;
    });
    const valueOf = (row: TenderOpportunity) => {
      if (sortKey === 'reference') return row.referenceNo;
      if (sortKey === 'client') return row.clientName;
      if (sortKey === 'title') return row.title;
      if (sortKey === 'type') return commercialKindOf(row);
      if (sortKey === 'sector') return sectorOf(row);
      if (sortKey === 'received') return receivedOn(row);
      if (sortKey === 'internal') return internalDeadlineOf(row);
      if (sortKey === 'external') return externalDeadlineOf(row);
      if (sortKey === 'priority') return row.priority;
      if (sortKey === 'officer') return row.ownerName;
      return registerStatusOf(row);
    };
    return list.sort((left, right) => {
      const result = valueOf(left).localeCompare(valueOf(right));
      return sortDir === 'asc' ? result : -result;
    });
  }, [applied, appliedSearch, registerRows, sortDir, sortKey, tab]);

  useEffect(() => { setPage(1); }, [tab, applied, appliedSearch, pageSize, sortKey, sortDir]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const pageIds = pageRows.map((row) => row.id);
  const allPicked = pageIds.length > 0 && pageIds.every((id) => picked.includes(id));
  const pageWindow = Array.from({ length: pageCount }, (_, index) => index + 1).filter((number) => Math.abs(number - safePage) <= 2);

  const applyFilters = () => {
    setAppliedSearch(search.trim());
    setApplied({ client, sector, officer, status, priority, type, source, internalFrom, internalTo, externalFrom, externalTo });
    setPage(1);
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
    setSource('All Sources');
    setInternalFrom('');
    setInternalTo('');
    setExternalFrom('');
    setExternalTo('');
    setApplied({ client: 'All Clients', sector: 'All Sectors', officer: 'All Officers', status: 'All Statuses', priority: 'All Priorities', type: 'All Types', source: 'All Sources', internalFrom: '', internalTo: '', externalFrom: '', externalTo: '' });
  };
  const sortBy = (key: SortKey) => {
    if (sortKey === key) setSortDir((current) => current === 'asc' ? 'desc' : 'asc');
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const openDetail = async (row: TenderOpportunity) => {
    setDetail(row);
    setReviewNote('');
    setMenuId('');
    try {
      const pack = await tenderGet<{ documents: TenderDocument[]; audit: TenderAuditEvent[] }>('opportunity', { id: row.id });
      setDocuments(pack.documents || []);
      setHistory(pack.audit || []);
    } catch {
      setDocuments([]);
      setHistory([]);
    }
  };

  const review = async (row: TenderOpportunity, decision: 'forward' | 'return') => {
    if (decision === 'return' && !reviewNote.trim()) {
      setError('A comment is required to return this opportunity for correction.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await tenderPost({ action: 'gm-review', id: row.id, decision, comments: reviewNote });
      setNotice(decision === 'forward' ? `${row.referenceNo} forwarded to the MD.` : `${row.referenceNo} returned for correction.`);
      setDetail(null);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The review was not saved.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#2563eb] text-white"><Briefcase className="h-5 w-5" /></span>
          <div>
            <h1 className="text-[22px] font-black tracking-tight text-slate-950">Commercial Opportunities</h1>
            <p className="text-[12px] text-slate-500">Manage Invitations to Tender (ITT), Requests for Quotation (RFQ) and Expressions of Interest (EOI) from registration to client decision.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/commercial/tenders/reports" className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-bold text-slate-700"><BarChart3 className="h-4 w-4" /> View Reports</Link>
          <button type="button" onClick={() => { setEditing(null); setModalOpen(true); }} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#2563eb] px-3 text-[13px] font-bold text-white"><Plus className="h-4 w-4" /> New Opportunity <ChevronDown className="h-3.5 w-3.5" /></button>
        </div>
      </section>

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex gap-1 overflow-x-auto border-b border-slate-100 px-3 pt-2">
          {TABS.map((item) => (
            <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] font-semibold ${tab === item.id ? 'border-[#2563eb] text-[#2563eb]' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
              {item.label} <span className="text-[12px]">({counts[item.id] || 0})</span>
            </button>
          ))}
        </div>
        <div className="space-y-2 px-3 py-3">
          <div className="grid gap-2 lg:grid-cols-[minmax(220px,1.4fr)_repeat(4,minmax(140px,1fr))]">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') applyFilters(); }} placeholder="Search by title, client, reference no..." className="h-10 w-full rounded-lg border border-slate-200 bg-[#f8fafc] pl-9 pr-3 text-[13px] outline-none focus:border-blue-500 focus:bg-white" aria-label="Search opportunities" />
            </label>
            <Select label="Client" value={client} onChange={setClient} options={['All Clients', ...clients]} />
            <Select label="Sector" value={sector} onChange={setSector} options={['All Sectors', ...sectors]} />
            <Select label="Responsible Officer" value={officer} onChange={setOfficer} options={['All Officers', ...officers]} />
            <Select label="Status" value={status} onChange={setStatus} options={['All Statuses', ...STATUSES]} />
          </div>
          <div className="grid gap-2 lg:grid-cols-[repeat(5,minmax(140px,1fr))_auto]">
            <Select label="Priority" value={priority} onChange={setPriority} options={['All Priorities', ...PRIORITIES]} />
            <Select label="Opportunity Type" value={type} onChange={setType} options={['All Types', 'ITT', 'RFQ', 'EOI']} />
            <Select label="Source" value={source} onChange={setSource} options={['All Sources', ...sources]} />
            <label className="text-[11px] font-semibold text-slate-500">Internal Deadline
              <span className="mt-1 flex gap-1">
                <input type="date" value={internalFrom} onChange={(event) => setInternalFrom(event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 px-2 text-[12px]" aria-label="Internal deadline from" />
                <input type="date" value={internalTo} onChange={(event) => setInternalTo(event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 px-2 text-[12px]" aria-label="Internal deadline to" />
              </span>
            </label>
            <label className="text-[11px] font-semibold text-slate-500">External Deadline
              <span className="mt-1 flex gap-1">
                <input type="date" value={externalFrom} onChange={(event) => setExternalFrom(event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 px-2 text-[12px]" aria-label="External deadline from" />
                <input type="date" value={externalTo} onChange={(event) => setExternalTo(event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 px-2 text-[12px]" aria-label="External deadline to" />
              </span>
            </label>
            <div className="flex items-end gap-2">
              <button type="button" onClick={clearFilters} className="inline-flex h-10 items-center gap-1 rounded-lg px-2 text-[12px] font-semibold text-slate-600"><X className="h-3.5 w-3.5" /> Clear Filters</button>
              <button type="button" onClick={applyFilters} className="inline-flex h-10 items-center gap-1 rounded-lg bg-[#2563eb] px-3 text-[12px] font-bold text-white"><Search className="h-3.5 w-3.5" /> Search</button>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1280px] text-left text-[12px]">
            <thead className="bg-[#f8fafc] text-[11px] uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-3 py-3"><input type="checkbox" checked={allPicked} onChange={() => setPicked(allPicked ? picked.filter((id) => !pageIds.includes(id)) : Array.from(new Set([...picked, ...pageIds])))} aria-label="Select page" /></th>
                <th className="px-3 py-3 font-semibold">#</th>
                <SortHead label="Reference No." sort="reference" active={sortKey} dir={sortDir} onSort={sortBy} />
                <SortHead label="Client" sort="client" active={sortKey} dir={sortDir} onSort={sortBy} />
                <SortHead label="Project Title" sort="title" active={sortKey} dir={sortDir} onSort={sortBy} />
                <SortHead label="Type" sort="type" active={sortKey} dir={sortDir} onSort={sortBy} />
                <SortHead label="Sector" sort="sector" active={sortKey} dir={sortDir} onSort={sortBy} />
                <SortHead label="Date Received" sort="received" active={sortKey} dir={sortDir} onSort={sortBy} />
                <SortHead label="Internal Deadline" sort="internal" active={sortKey} dir={sortDir} onSort={sortBy} />
                <SortHead label="External Deadline" sort="external" active={sortKey} dir={sortDir} onSort={sortBy} />
                <SortHead label="Priority" sort="priority" active={sortKey} dir={sortDir} onSort={sortBy} />
                <SortHead label="Assigned Officer" sort="officer" active={sortKey} dir={sortDir} onSort={sortBy} />
                <SortHead label="Status" sort="status" active={sortKey} dir={sortDir} onSort={sortBy} />
                <th className="px-3 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? Array.from({ length: 5 }, (_, index) => (
                <tr key={index} className="border-t border-slate-100">
                  <td colSpan={14} className="px-3 py-3"><div className="h-4 animate-pulse rounded bg-slate-100" /></td>
                </tr>
              )) : pageRows.length === 0 ? (
                <tr><td colSpan={14} className="px-4 py-14 text-center text-slate-500">{loading ? 'Loading register…' : 'No commercial opportunities match this view.'}</td></tr>
              ) : pageRows.map((row, index) => {
                const state = registerStatusOf(row);
                const kind = commercialKindOf(row);
                const internal = internalDeadlineOf(row);
                const external = externalDeadlineOf(row);
                return (
                  <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50/70">
                    <td className="px-3 py-3"><input type="checkbox" checked={picked.includes(row.id)} onChange={() => setPicked((current) => current.includes(row.id) ? current.filter((id) => id !== row.id) : [...current, row.id])} aria-label={`Select ${row.referenceNo}`} /></td>
                    <td className="px-3 py-3 text-slate-400">{(safePage - 1) * pageSize + index + 1}</td>
                    <td className="px-3 py-3 font-semibold text-blue-700">{row.referenceNo || '—'}</td>
                    <td className="px-3 py-3 font-semibold text-slate-800">{row.clientName || '—'}</td>
                    <td className="max-w-[280px] px-3 py-3 text-slate-700"><button type="button" className="text-left hover:text-blue-700" onClick={() => void openDetail(row)}>{row.title}</button></td>
                    <td className="px-3 py-3"><span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${kindTone[kind]}`}>{KIND_LABEL[kind]}</span></td>
                    <td className="px-3 py-3 text-slate-600">{sectorOf(row)}</td>
                    <td className="px-3 py-3 text-slate-600">{formatWhen(receivedOn(row))}</td>
                    <td className="px-3 py-3"><span className={dateTone(internal)}>{internal ? formatWhen(internal) : '—'}</span></td>
                    <td className="px-3 py-3 text-slate-700">{external ? formatWhen(external) : '—'}</td>
                    <td className="px-3 py-3"><span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${priorityTone(row.priority)}`}>{row.priority || '—'}</span></td>
                    <td className="px-3 py-3 text-slate-700">{row.ownerName || '—'}</td>
                    <td className="px-3 py-3"><span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${statusTone[state]}`}>{state}</span></td>
                    <td className="px-3 py-3">
                      <RowMenu open={menuId === row.id} disabled={busy} label={`Actions for ${row.referenceNo}`} onToggle={() => setMenuId(menuId === row.id ? '' : row.id)}>
                        <MenuButton label="View Details" onClick={() => void openDetail(row)} />
                        <MenuButton label="Edit" onClick={() => { setEditing(row); setModalOpen(true); setMenuId(''); }} />
                        <Link href={`/commercial/tenders/approvals?id=${row.id}`} className="block px-3 py-2 hover:bg-slate-50" onClick={() => setMenuId('')}>Open Approval</Link>
                        <MenuButton label="View Documents" onClick={() => void openDetail(row)} />
                        <MenuButton label="View History" onClick={() => void openDetail(row)} />
                        {row.ownerName && !row.acknowledgedAt ? <MenuButton label="Acknowledge assignment" onClick={() => { setMenuId(''); void tenderPost({ action: 'acknowledge', id: row.id }).then(() => load()).catch((reason) => setError(reason instanceof Error ? reason.message : 'The acknowledgement was not saved.')); }} /> : null}
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
          <div className="flex items-center gap-2">
            <button type="button" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)} className="h-8 rounded-lg border border-slate-200 px-2 disabled:opacity-40" aria-label="Previous page">‹</button>
            {pageWindow.map((number) => (
              <button key={number} type="button" onClick={() => setPage(number)} className={`h-8 min-w-8 rounded-lg px-2 ${safePage === number ? 'bg-[#2563eb] text-white' : 'border border-slate-200'}`}>{number}</button>
            ))}
            <button type="button" disabled={safePage >= pageCount} onClick={() => setPage(safePage + 1)} className="h-8 rounded-lg border border-slate-200 px-2 disabled:opacity-40" aria-label="Next page">›</button>
            <label className="inline-flex items-center gap-1">Show
              <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} className="h-8 rounded-lg border border-slate-200 px-2" aria-label="Rows per page">
                {[5, 10, 25, 50].map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
            </label>
          </div>
        </div>
      </section>

      <CommercialOpportunityModal
        open={modalOpen}
        initial={editing}
        clients={clients}
        onClose={() => setModalOpen(false)}
        onSaved={(message) => { setModalOpen(false); setNotice(message); void load(); }}
      />

      {detail ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40">
          <button type="button" className="h-full flex-1" aria-label="Close details" onClick={() => setDetail(null)} />
          <aside className="h-full w-full max-w-xl overflow-y-auto bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[12px] font-semibold text-blue-700">{detail.referenceNo}</p>
                <h2 className="text-[18px] font-black text-slate-950">{detail.title}</h2>
                <p className="text-[12px] text-slate-500">{detail.clientName}</p>
              </div>
              <button type="button" onClick={() => setDetail(null)} className="rounded-lg border border-slate-200 p-2" aria-label="Close"><X className="h-4 w-4" /></button>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-[12px]">
              <Fact label="Opportunity type" value={commercialKindOf(detail)} />
              <Fact label="Commercial review" value={commercialReviewOf(detail)} />
              <Fact label="MD decision" value={mdDecisionOf(detail)} />
              <Fact label="Preparation" value={preparationOf(detail)} />
              <Fact label="Client status" value={clientStatusOf(detail)} />
              <Fact label="Awarded to DLE" value={awardedToDleOf(detail)} />
              <Fact label="Internal deadline" value={formatWhen(internalDeadlineOf(detail))} />
              <Fact label="External deadline" value={formatWhen(externalDeadlineOf(detail))} />
            </dl>
            <p className="mt-4 text-[13px] leading-6 text-slate-700">{detail.description || 'No description recorded.'}</p>
            {commercialReviewOf(detail) === 'Returned for Correction' && detail.commercialReviewNote ? <p className="mt-3 rounded-lg bg-orange-50 px-3 py-2 text-[12px] text-orange-800">{detail.commercialReviewNote}</p> : null}
            <h3 className="mt-5 text-[13px] font-black text-slate-900">Required documents</h3>
            <ul className="mt-2 space-y-1 text-[12px] text-slate-600">
              {documentChecklistFor(commercialKindOf(detail)).map((item) => <li key={item}>• {item}</li>)}
            </ul>
            <h3 className="mt-5 text-[13px] font-black text-slate-900">Documents</h3>
            {documents.length === 0 ? <p className="mt-2 text-[12px] text-slate-500">No documents attached.</p> : (
              <ul className="mt-2 space-y-1 text-[12px]">
                {documents.map((document) => <li key={document.id}><a className="font-semibold text-blue-700" href={`/api/commercial/tenders?resource=document&documentId=${document.id}`}>{document.fileName}</a></li>)}
              </ul>
            )}
            <h3 className="mt-5 text-[13px] font-black text-slate-900">History</h3>
            {history.length === 0 ? <p className="mt-2 text-[12px] text-slate-500">No history yet.</p> : (
              <ul className="mt-2 space-y-2 text-[12px]">
                {history.map((event) => <li key={event.id} className="rounded-lg bg-slate-50 px-3 py-2"><span className="font-bold text-slate-800">{event.action}</span> · {event.actor}<div className="text-slate-500">{event.details}</div></li>)}
              </ul>
            )}
            {gm && !detail.bidDecision ? (
              <div className="mt-5 space-y-2 border-t border-slate-100 pt-4">
                <textarea value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} rows={3} placeholder="Review comments" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[12px]" />
                <div className="flex gap-2">
                  <button type="button" disabled={busy} onClick={() => void review(detail, 'return')} className="h-9 rounded-lg border border-orange-200 px-3 text-[12px] font-bold text-orange-700">Return for correction</button>
                  <button type="button" disabled={busy} onClick={() => void review(detail, 'forward')} className="h-9 rounded-lg bg-[#2563eb] px-3 text-[12px] font-bold text-white">Forward to MD</button>
                </div>
              </div>
            ) : null}
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="font-semibold text-slate-800">{value || '—'}</dd>
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return (
    <label className="text-[11px] font-semibold text-slate-500">{label}
      <select value={value} onChange={(event) => onChange(event.target.value)} aria-label={label} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-[12px] font-medium text-slate-700">
        {options.map((option) => <option key={option}>{option}</option>)}
      </select>
    </label>
  );
}

function SortHead({ label, sort, active, dir, onSort }: { label: string; sort: SortKey; active: SortKey; dir: 'asc' | 'desc'; onSort: (key: SortKey) => void }) {
  return (
    <th className="px-3 py-3 font-semibold">
      <button type="button" onClick={() => onSort(sort)} className="inline-flex items-center gap-1 uppercase">
        {label}
        <span className="text-[9px] text-slate-300">{active === sort ? (dir === 'asc' ? '↑' : '↓') : ''}</span>
      </button>
    </th>
  );
}

function MenuButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="block w-full px-3 py-2 text-left hover:bg-slate-50">{label}</button>;
}
