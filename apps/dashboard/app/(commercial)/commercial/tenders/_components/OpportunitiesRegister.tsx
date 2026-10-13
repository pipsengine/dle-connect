'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { CalendarDays, Check, FileText, Play, Plus, Search, UserRound, X } from 'lucide-react';
import type { TenderOpportunity } from '@/lib/commercial/tender-types';
import { closedOut, daysUntil, receivedOn, sectorOf } from '@/lib/commercial/tender-present';
import { isManagingDirector } from '@/lib/access/commercial-access';
import { internalDeadlineFromExternal } from '@/lib/commercial/tender-workflow';
import { formatWhen, tenderGet, tenderPost } from './tender-api';
import { TenderOpportunityModal } from './TenderOpportunityModal';
import { OfficerSearch, type DirectoryEmployee } from './OfficerSearch';
import { RowMenu } from './record-frame';

type OpportunityStatus = 'Not Started' | 'In Progress' | 'Submitted' | 'Closed';
type Tab = 'All Opportunities' | 'Awaiting Assignment' | OpportunityStatus | 'Overdue';

const TABS: Tab[] = ['All Opportunities', 'Awaiting Assignment', 'Not Started', 'In Progress', 'Submitted', 'Overdue', 'Closed'];
const STATUSES: OpportunityStatus[] = ['Not Started', 'In Progress', 'Submitted', 'Closed'];
const PRIORITIES = ['High', 'Medium', 'Low'];

const isTenderRow = (row: TenderOpportunity) =>
  row.opportunityType !== 'Enquiry' && row.tenderType !== 'Enquiry' && row.stage !== 'Enquiry';

const opportunityStatus = (row: TenderOpportunity): OpportunityStatus => {
  if (row.status === 'Closed' || closedOut(row) || row.status === 'Lost') return 'Closed';
  if (/submit/.test(`${row.stage} ${row.status}`)) return 'Submitted';
  if (row.status === 'Draft') return 'Not Started';
  return 'In Progress';
};

const awaitingAssignment = (row: TenderOpportunity) => !row.ownerName.trim() && opportunityStatus(row) !== 'Closed' && opportunityStatus(row) !== 'Submitted';
const internalOn = (row: TenderOpportunity) => (row.submissionDeadline ? row.closingDate : '');
const externalOn = (row: TenderOpportunity) => row.submissionDeadline || row.closingDate;
const overdue = (row: TenderOpportunity) => {
  if (opportunityStatus(row) === 'Closed' || opportunityStatus(row) === 'Submitted') return false;
  const internal = daysUntil(internalOn(row));
  const external = daysUntil(externalOn(row));
  return (internal != null && internal < 0) || (external != null && external < 0);
};

const dateTone = (value: string) => {
  const days = daysUntil(value);
  if (!value || days == null) return 'text-slate-400';
  if (days < 0) return 'rounded-md bg-rose-50 px-2 py-0.5 font-semibold text-rose-600';
  if (days <= 3) return 'rounded-md bg-orange-50 px-2 py-0.5 font-semibold text-orange-600';
  if (days <= 7) return 'rounded-md bg-amber-50 px-2 py-0.5 font-semibold text-amber-700';
  return 'rounded-md bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700';
};

const statusTone: Record<OpportunityStatus, string> = {
  'Not Started': 'bg-slate-100 text-slate-600',
  'In Progress': 'bg-blue-50 text-blue-700',
  Submitted: 'bg-emerald-50 text-emerald-700',
  Closed: 'bg-slate-100 text-slate-600',
};

const priorityTone = (value: string) => value === 'High' ? 'bg-rose-50 text-rose-600' : value === 'Low' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700';
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('') || '—';
const within = (value: string, from: string, to: string) => {
  const day = (value || '').slice(0, 10);
  if (!day) return !from && !to;
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
};

export function OpportunitiesRegister() {
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<TenderOpportunity[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('All Opportunities');
  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [client, setClient] = useState('All Clients');
  const [sector, setSector] = useState('All Sectors');
  const [officer, setOfficer] = useState('All Officers');
  const [status, setStatus] = useState('All Statuses');
  const [priority, setPriority] = useState('All Priorities');
  const [source, setSource] = useState('All Sources');
  const [internalFrom, setInternalFrom] = useState('');
  const [internalTo, setInternalTo] = useState('');
  const [externalFrom, setExternalFrom] = useState('');
  const [externalTo, setExternalTo] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [picked, setPicked] = useState<string[]>([]);
  const [menuId, setMenuId] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TenderOpportunity | null>(null);
  const [md, setMd] = useState(false);
  const [assigning, setAssigning] = useState<TenderOpportunity | null>(null);
  const [assignee, setAssignee] = useState('');
  const [assigneeCode, setAssigneeCode] = useState('');
  const [internalDate, setInternalDate] = useState('');
  const [assignReason, setAssignReason] = useState('');
  const [directory, setDirectory] = useState<DirectoryEmployee[]>([]);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await tenderGet<TenderOpportunity[]>('opportunities'));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to read tender opportunities.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); tenderGet<DirectoryEmployee[]>('directory').then(setDirectory).catch(() => setDirectory([])); }, []);
  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store', credentials: 'same-origin' })
      .then((response) => (response.ok ? response.json() : null))
      .then((json) => setMd(isManagingDirector(json?.data?.roles || [], Boolean(json?.data?.isGlobalAdmin))))
      .catch(() => setMd(false));
  }, []);
  useEffect(() => {
    const query = searchParams.get('q') || '';
    if (query) setSearch(query);
    if (searchParams.get('compose') === '1') {
      setEditing(null);
      setModalOpen(true);
    }
  }, [searchParams]);

  const tenders = useMemo(() => rows.filter(isTenderRow), [rows]);
  const counts = {
    all: tenders.length,
    awaiting: tenders.filter(awaitingAssignment).length,
    'Not Started': tenders.filter((row) => opportunityStatus(row) === 'Not Started').length,
    'In Progress': tenders.filter((row) => opportunityStatus(row) === 'In Progress').length,
    Submitted: tenders.filter((row) => opportunityStatus(row) === 'Submitted').length,
    Closed: tenders.filter((row) => opportunityStatus(row) === 'Closed').length,
    Overdue: tenders.filter(overdue).length,
  };
  const share = (count: number) => (counts.all ? Math.round((count / counts.all) * 100) : 0);
  const now = new Date();
  const windowCount = (fromDays: number, toDays: number) => tenders.filter((row) => {
    const created = new Date(row.createdAt);
    return !Number.isNaN(created.getTime()) && created >= new Date(now.getTime() - fromDays * 86400000) && created < new Date(now.getTime() - toDays * 86400000);
  }).length;
  const recent = windowCount(30, 0);
  const prior = windowCount(60, 30);
  const delta = prior ? Math.round(((recent - prior) / prior) * 100) : recent ? 100 : 0;
  const internalDue = tenders.filter((row) => {
    if (opportunityStatus(row) === 'Closed' || opportunityStatus(row) === 'Submitted') return false;
    const days = daysUntil(internalOn(row));
    return days != null && days <= 3;
  });

  const clients = useMemo(() => Array.from(new Set(tenders.map((row) => row.clientName).filter(Boolean))).sort(), [tenders]);
  const sectors = useMemo(() => Array.from(new Set(tenders.map((row) => sectorOf(row)))).sort(), [tenders]);
  const officers = useMemo(() => Array.from(new Set(tenders.map((row) => row.ownerName).filter(Boolean))).sort(), [tenders]);
  const sources = useMemo(() => Array.from(new Set(tenders.map((row) => row.source).filter(Boolean))).sort(), [tenders]);

  const filtered = useMemo(() => tenders.filter((row) => {
    if (tab === 'Awaiting Assignment' && !awaitingAssignment(row)) return false;
    if (tab === 'Overdue' && !overdue(row)) return false;
    if (tab !== 'All Opportunities' && tab !== 'Awaiting Assignment' && tab !== 'Overdue' && opportunityStatus(row) !== tab) return false;
    const haystack = `${row.title} ${row.clientName} ${row.referenceNo} ${row.enquiryRef} ${row.ownerName}`.toLowerCase();
    if (search && !haystack.includes(search.toLowerCase())) return false;
    if (client !== 'All Clients' && row.clientName !== client) return false;
    if (sector !== 'All Sectors' && sectorOf(row) !== sector) return false;
    if (officer !== 'All Officers' && row.ownerName !== officer) return false;
    if (status !== 'All Statuses' && opportunityStatus(row) !== status) return false;
    if (priority !== 'All Priorities' && row.priority !== priority) return false;
    if (source !== 'All Sources' && row.source !== source) return false;
    if (!within(internalOn(row), internalFrom, internalTo)) return false;
    if (!within(externalOn(row), externalFrom, externalTo)) return false;
    return true;
  }), [client, externalFrom, externalTo, internalFrom, internalTo, officer, priority, search, sector, source, status, tab, tenders]);

  useEffect(() => { setPage(1); }, [tab, search, client, sector, officer, status, priority, source, internalFrom, internalTo, externalFrom, externalTo, pageSize]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const pageIds = pageRows.map((row) => row.id);
  const allPicked = pageIds.length > 0 && pageIds.every((id) => picked.includes(id));

  const clearFilters = () => {
    setSearch('');
    setClient('All Clients');
    setSector('All Sectors');
    setOfficer('All Officers');
    setStatus('All Statuses');
    setPriority('All Priorities');
    setSource('All Sources');
    setInternalFrom('');
    setInternalTo('');
    setExternalFrom('');
    setExternalTo('');
  };

  const run = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await work();
      setNotice(done);
      setMenuId('');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The action was not saved.');
    } finally {
      setBusy(false);
    }
  };

  const saveStatus = (row: TenderOpportunity, next: OpportunityStatus) => {
    const patch = next === 'Not Started'
      ? { status: 'Draft', stage: row.stage === 'Enquiry' ? 'Tender/Bid' : row.stage || 'Tender/Bid', saveMode: 'draft' as const }
      : next === 'In Progress'
        ? { status: 'Open', stage: 'Tender/Bid', saveMode: 'submit' as const }
        : next === 'Submitted'
          ? { status: 'Submitted', stage: 'Submitted', saveMode: 'submit' as const }
          : { status: 'Closed', stage: row.stage || 'Tender/Bid', saveMode: 'submit' as const };
    return run(() => tenderPost({ action: 'save', opportunity: { ...row, ...patch } }), `${row.referenceNo} marked ${next}.`);
  };

  const tabCount = (item: Tab) => item === 'All Opportunities' ? counts.all : item === 'Awaiting Assignment' ? counts.awaiting : item === 'Overdue' ? counts.Overdue : counts[item];

  return (
    <div className="space-y-3">
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[#2563eb] text-white"><FileText className="h-5 w-5" /></span>
          <div>
            <h1 className="text-[22px] font-black tracking-tight text-slate-950">Tender Opportunities</h1>
            <p className="text-[12px] text-slate-500">Manage tender opportunities, assign responsible officers, set deadlines and track progress</p>
          </div>
        </div>
        <button type="button" onClick={() => { setEditing(null); setModalOpen(true); }} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#2563eb] px-4 text-[13px] font-bold text-white"><Plus className="h-4 w-4" /> New Opportunity</button>
      </section>

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <Kpi icon={FileText} tint="bg-blue-50 text-blue-600" value={counts.all} label="Total Opportunities" foot={<span className={delta >= 0 ? 'text-emerald-600' : 'text-rose-600'}>{delta >= 0 ? '↑' : '↓'} {Math.abs(delta)}% vs. last 30 days</span>} />
        <Kpi icon={UserRound} tint="bg-rose-50 text-rose-500" value={counts.awaiting} label="Awaiting MD Assignment" foot={<span className="text-rose-500">{share(counts.awaiting)}% require attention</span>} />
        <Kpi icon={Play} tint="bg-blue-50 text-blue-600" value={counts['In Progress']} label="In Progress" foot={<span className="text-slate-400">{share(counts['In Progress'])}% of total</span>} />
        <Kpi icon={Check} tint="bg-emerald-50 text-emerald-600" value={counts.Submitted} label="Submitted" foot={<span className="text-slate-400">{share(counts.Submitted)}% of total</span>} />
        <Kpi icon={CalendarDays} tint="bg-rose-50 text-rose-500" value={internalDue.length} label="Internal Deadline Due" foot={<span><span className="text-orange-600">{internalDue.filter((row) => (daysUntil(internalOn(row)) ?? 0) >= 0).length} in next 3 days</span> · <span className="text-rose-600">{internalDue.filter((row) => (daysUntil(internalOn(row)) ?? 0) < 0).length} Overdue</span></span>} />
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex gap-1 overflow-x-auto border-b border-slate-100 px-3 pt-2">
          {TABS.map((item) => (
            <button key={item} type="button" onClick={() => setTab(item)} className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] font-semibold ${tab === item ? 'border-[#2563eb] text-[#2563eb]' : 'border-transparent text-slate-500'}`}>{item} ({tabCount(item)})</button>
          ))}
        </div>
        <div className="grid gap-2 px-3 py-3 md:grid-cols-3 xl:grid-cols-6">
          <label className="relative md:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by title, client, reference..." className="h-10 w-full rounded-lg border border-slate-200 bg-[#f8fafc] pl-9 pr-3 text-[13px]" />
          </label>
          <Select label="Client" value={client} onChange={setClient} options={['All Clients', ...clients]} />
          <Select label="Sector" value={sector} onChange={setSector} options={['All Sectors', ...sectors]} />
          <Select label="Responsible Officer" value={officer} onChange={setOfficer} options={['All Officers', ...officers]} />
          <Select label="Status" value={status} onChange={setStatus} options={['All Statuses', ...STATUSES]} />
          <Select label="Priority" value={priority} onChange={setPriority} options={['All Priorities', ...PRIORITIES]} />
          <Select label="Source" value={source} onChange={setSource} options={['All Sources', ...sources]} />
          <DateRange label="Internal Deadline" from={internalFrom} to={internalTo} onFrom={setInternalFrom} onTo={setInternalTo} />
          <DateRange label="External Deadline" from={externalFrom} to={externalTo} onFrom={setExternalFrom} onTo={setExternalTo} />
          <div className="flex items-end gap-2">
            <button type="button" onClick={clearFilters} className="inline-flex h-10 items-center gap-1 rounded-lg border border-slate-200 px-3 text-[12px] font-semibold text-slate-600"><X className="h-3.5 w-3.5" /> Clear Filters</button>
            <button type="button" onClick={() => setPage(1)} className="inline-flex h-10 items-center gap-1 rounded-lg bg-[#2563eb] px-3 text-[12px] font-bold text-white"><Search className="h-3.5 w-3.5" /> Search</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-[12px]">
            <thead className="bg-[#f8fafc] text-[11px] uppercase text-slate-400">
              <tr>
                <th className="px-3 py-3"><input type="checkbox" checked={allPicked} onChange={() => setPicked(allPicked ? picked.filter((id) => !pageIds.includes(id)) : Array.from(new Set([...picked, ...pageIds])))} aria-label="Select page" /></th>
                {['#', 'Reference No.', 'Client', 'Project Title', 'Sector', 'Date Received', 'Internal Deadline', 'External Deadline', 'Priority', 'Assigned Officer', 'Status', 'Actions'].map((heading) => <th key={heading} className="px-3 py-3 font-semibold">{heading}</th>)}
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? <tr><td colSpan={13} className="px-4 py-10 text-center text-slate-500">{loading ? 'Loading register…' : 'No tender opportunities match this view.'}</td></tr> : pageRows.map((row, index) => {
                const state = opportunityStatus(row);
                return (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="px-3 py-2.5"><input type="checkbox" checked={picked.includes(row.id)} onChange={() => setPicked((current) => current.includes(row.id) ? current.filter((id) => id !== row.id) : [...current, row.id])} aria-label={`Select ${row.referenceNo}`} /></td>
                    <td className="px-3 py-2.5 text-slate-400">{(safePage - 1) * pageSize + index + 1}</td>
                    <td className="px-3 py-2.5 font-semibold text-blue-700">{row.referenceNo || '—'}</td>
                    <td className="px-3 py-2.5">{row.clientName || '—'}</td>
                    <td className="px-3 py-2.5 font-semibold text-slate-800"><Link href={`/commercial/tenders/workspace?id=${row.id}`}>{row.title}</Link></td>
                    <td className="px-3 py-2.5">{row.category || sectorOf(row)}</td>
                    <td className="px-3 py-2.5">{formatWhen(receivedOn(row))}</td>
                    <td className="px-3 py-2.5"><span className={dateTone(internalOn(row))}>{internalOn(row) ? formatWhen(internalOn(row)) : '—'}</span></td>
                    <td className="px-3 py-2.5">{externalOn(row) ? formatWhen(externalOn(row)) : '—'}</td>
                    <td className="px-3 py-2.5"><span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${priorityTone(row.priority)}`}>{row.priority || '—'}</span></td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-2">
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-[10px] font-black text-blue-700">{initials(row.ownerName || '—')}</span>
                        {row.ownerName || '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5"><span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${statusTone[state]}`}>{state}</span></td>
                    <td className="px-3 py-2.5">
                      <RowMenu open={menuId === row.id} disabled={busy} label={`Actions for ${row.referenceNo}`} onToggle={() => setMenuId(menuId === row.id ? '' : row.id)}>
                        <Link href={`/commercial/tenders/workspace?id=${row.id}`} className="block px-3 py-2 hover:bg-slate-50" onClick={() => setMenuId('')}>View workspace</Link>
                        <MenuButton label="Edit opportunity" onClick={() => { setEditing(row); setModalOpen(true); setMenuId(''); }} />
                        <MenuButton label="Assign responsible officer" onClick={() => { if (!md) { setError('Only the Managing Director can assign the responsible officer and internal submission date.'); setMenuId(''); return; } setAssigning(row); setAssignee(row.ownerName); setAssigneeCode(row.ownerEmployeeCode || ''); setInternalDate((internalOn(row) || internalDeadlineFromExternal(externalOn(row))).slice(0, 10)); setAssignReason(''); setMenuId(''); }} />
                        {row.ownerName && !row.acknowledgedAt ? <MenuButton label="Acknowledge assignment" onClick={() => run(() => tenderPost({ action: 'acknowledge', id: row.id }), `${row.referenceNo} acknowledged.`)} /> : null}
                        <MenuButton label="Mark Not Started" onClick={() => saveStatus(row, 'Not Started')} />
                        <MenuButton label="Mark In Progress" onClick={() => saveStatus(row, 'In Progress')} />
                        <MenuButton label="Mark Submitted" onClick={() => saveStatus(row, 'Submitted')} />
                        <MenuButton label="Close opportunity" onClick={() => saveStatus(row, 'Closed')} />
                        <MenuButton label="Duplicate" onClick={() => run(() => tenderPost({ action: 'duplicate', id: row.id }), `${row.referenceNo} duplicated.`)} />
                        <MenuButton label={row.watchlisted ? 'Remove from watchlist' : 'Add to watchlist'} onClick={() => run(() => tenderPost({ action: 'watchlist', id: row.id, watchlisted: !row.watchlisted }), row.watchlisted ? 'Removed from the watchlist.' : 'Added to the watchlist.')} />
                        <MenuButton label="Send notification" onClick={() => run(() => tenderPost({ action: 'notify', id: row.id, message: `${row.referenceNo} ${row.title} needs attention.` }), 'Portal notification raised.')} />
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
            <button type="button" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)} className="h-8 rounded-lg border border-slate-200 px-2 disabled:opacity-40">‹</button>
            {Array.from({ length: pageCount }, (_, index) => (
              <button key={index} type="button" onClick={() => setPage(index + 1)} className={`h-8 min-w-8 rounded-lg px-2 ${safePage === index + 1 ? 'bg-[#2563eb] text-white' : 'border border-slate-200'}`}>{index + 1}</button>
            ))}
            <button type="button" disabled={safePage >= pageCount} onClick={() => setPage(safePage + 1)} className="h-8 rounded-lg border border-slate-200 px-2 disabled:opacity-40">›</button>
            <label className="inline-flex items-center gap-1">Show
              <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} className="h-8 rounded-lg border border-slate-200 px-2" aria-label="Rows per page">
                {[10, 25, 50].map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
            </label>
          </div>
        </div>
      </section>

      {assigning ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <form className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onSubmit={(event) => {
            event.preventDefault();
            const row = assigning;
            const name = assignee.trim();
            if (!assigneeCode || !name) {
              setError('Search and select a responsible officer from the employee directory.');
              return;
            }
            setAssigning(null);
            run(() => tenderPost({
              action: 'assign',
              id: row.id,
              recordType: 'tender',
              officerName: name,
              employeeCode: assigneeCode,
              internalDeadline: internalDate,
              reason: assignReason,
            }), `${row.referenceNo} assigned to ${name}.`);
          }}>
            <h2 className="text-[16px] font-black text-slate-950">Assign responsible officer</h2>
            <p className="mt-1 text-[12px] text-slate-500">{assigning.referenceNo} · {assigning.title}. The Managing Director confirms the internal submission deadline, 24 hours before the client deadline unless a reason is recorded.</p>
            {assigning.urgentException ? <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-700">Urgent exception: the client deadline is less than 24 hours away and needs MD authorization.</p> : null}
            <div className="mt-4">
              <OfficerSearch
                employees={directory}
                employeeId={assigneeCode}
                name={assignee}
                onSelect={(person) => { setAssigneeCode(person?.employeeId || ''); setAssignee(person?.fullName || ''); }}
              />
            </div>
            <label className="mt-3 block text-[12px] font-semibold text-slate-600">Internal submission deadline
              <input type="date" value={internalDate} onChange={(event) => setInternalDate(event.target.value)} required className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal" />
            </label>
            <label className="mt-3 block text-[12px] font-semibold text-slate-600">Reason for reassignment, extension or override
              <textarea value={assignReason} onChange={(event) => setAssignReason(event.target.value)} className="mt-1 h-20 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal" />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setAssigning(null)} className="h-9 rounded-lg border border-slate-200 px-3 text-[12px] font-semibold">Cancel</button>
              <button type="submit" className="h-9 rounded-lg bg-[#2563eb] px-3 text-[12px] font-bold text-white">Save assignment</button>
            </div>
          </form>
        </div>
      ) : null}

      <TenderOpportunityModal open={modalOpen} initial={editing} clients={clients} officers={officers} onClose={() => setModalOpen(false)} onSaved={() => { setModalOpen(false); load(); }} />
    </div>
  );
}

function Kpi({ icon: Icon, tint, value, label, foot }: { icon: typeof FileText; tint: string; value: number; label: string; foot: ReactNode }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[26px] font-black leading-none text-slate-950">{value}</div>
          <div className="mt-1 text-[12px] font-semibold text-slate-500">{label}</div>
        </div>
        <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${tint}`}><Icon className="h-4 w-4" /></span>
      </div>
      <div className="mt-2 text-[11px] font-semibold">{foot}</div>
    </article>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return (
    <label className="block text-[11px] font-semibold text-slate-400">{label}
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-[12px] font-semibold text-slate-700" aria-label={label}>
        {options.map((option) => <option key={option}>{option}</option>)}
      </select>
    </label>
  );
}

function DateRange({ label, from, to, onFrom, onTo }: { label: string; from: string; to: string; onFrom: (value: string) => void; onTo: (value: string) => void }) {
  return (
    <label className="block text-[11px] font-semibold text-slate-400">{label}
      <span className="mt-1 flex gap-1">
        <input type="date" value={from} onChange={(event) => onFrom(event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 px-2 text-[12px]" aria-label={`${label} from`} />
        <input type="date" value={to} onChange={(event) => onTo(event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 px-2 text-[12px]" aria-label={`${label} to`} />
      </span>
    </label>
  );
}

function MenuButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="block w-full px-3 py-2 text-left hover:bg-slate-50">{label}</button>;
}
