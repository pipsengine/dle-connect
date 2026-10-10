'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Eye, MoreHorizontal, Pencil, Plus, RefreshCcw } from 'lucide-react';
import type { TenderDashboard, TenderOpportunity } from '@/lib/commercial/tender-types';
import { OpportunityModal } from './OpportunityModal';
import { compactMoney, formatWhen, money, tenderGet, tenderPost, todayLabel } from './tender-api';

const TABS = ['Opportunity Register', 'Enquiries', 'New Tender', 'Invitations', 'Prequalification', 'Bid/No-Bid', 'Client Intelligence'] as const;
const TYPE_COLORS = ['#2563eb', '#16a34a', '#7c3aed', '#f59e0b', '#94a3b8'];
const STAGE_COLORS = ['#2563eb', '#22c55e', '#f59e0b', '#8b5cf6', '#0ea5e9', '#f97316', '#14b8a6'];

const priorityClass = (value: string) => {
  if (value === 'High') return 'bg-rose-50 text-rose-600';
  if (value === 'Low') return 'bg-emerald-50 text-emerald-700';
  return 'bg-amber-50 text-amber-700';
};

const statusClass = (value: string) => {
  if (value === 'Open') return 'bg-emerald-50 text-emerald-700';
  if (value === 'Awarded') return 'bg-sky-50 text-sky-700';
  if (value === 'Prequalification') return 'bg-fuchsia-50 text-fuchsia-700';
  if (value === 'Under Review') return 'bg-violet-50 text-violet-700';
  if (value === 'Closed' || value === 'Lost' || value === 'Cancelled') return 'bg-slate-100 text-slate-600';
  return 'bg-blue-50 text-blue-700';
};

function Donut({
  slices,
  center,
  caption,
}: {
  slices: Array<{ label: string; value: number; color: string }>;
  center: string;
  caption: string;
}) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 120 120" className="h-32 w-32 shrink-0">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="14" />
        {total > 0
          ? slices.map((slice) => {
            const length = (slice.value / total) * circumference;
            const node = (
              <circle
                key={slice.label}
                cx="60"
                cy="60"
                r={radius}
                fill="none"
                stroke={slice.color}
                strokeWidth="14"
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 60 60)"
              />
            );
            offset += length;
            return node;
          })
          : null}
        <text x="60" y="58" textAnchor="middle" fontSize="16" fontWeight="700" fill="#0f172a">{center}</text>
        <text x="60" y="74" textAnchor="middle" fontSize="8" fill="#64748b">{caption}</text>
      </svg>
      <ul className="space-y-1 text-xs text-slate-600">
        {slices.map((slice) => (
          <li key={slice.label} className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: slice.color }} />{slice.label}</span>
            <span className="font-semibold text-slate-800">{total ? Math.round((slice.value / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const deltaText = (value: number | null) => {
  if (value == null) return 'New this month';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value}% vs last month`;
};

export function OpportunitiesBoard({ initialTab = 'Opportunity Register' }: { initialTab?: (typeof TABS)[number] }) {
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<TenderOpportunity[]>([]);
  const [dashboard, setDashboard] = useState<TenderDashboard | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<(typeof TABS)[number]>(initialTab);
  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [type, setType] = useState('All Types');
  const [stage, setStage] = useState('All Stages');
  const [category, setCategory] = useState('All Categories');
  const [client, setClient] = useState('All Clients');
  const [priority, setPriority] = useState('All Priorities');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TenderOpportunity | null>(null);
  const [menuId, setMenuId] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [opportunities, summary] = await Promise.all([
        tenderGet<TenderOpportunity[]>('opportunities'),
        tenderGet<TenderDashboard>('dashboard'),
      ]);
      setRows(opportunities);
      setDashboard(summary);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to read tender records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const query = searchParams.get('q') || '';
    if (query) setSearch(query);
    if (searchParams.get('compose') === '1') {
      setEditing(null);
      setModalOpen(true);
    }
  }, [searchParams]);

  const clients = useMemo(() => Array.from(new Set(rows.map((row) => row.clientName).filter(Boolean))).sort(), [rows]);
  const categories = useMemo(() => Array.from(new Set(rows.map((row) => row.category).filter(Boolean))).sort(), [rows]);

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      if (tab === 'Enquiries' && !(row.stage === 'Enquiry' || row.tenderType === 'Enquiry' || row.opportunityType === 'Enquiry')) return false;
      if (tab === 'New Tender' && !['Open', 'Draft'].includes(row.status)) return false;
      if (tab === 'Invitations' && row.stage !== 'Invited' && row.status !== 'Invited') return false;
      if (tab === 'Prequalification' && row.stage !== 'Prequalification' && row.status !== 'Prequalification') return false;
      if (tab === 'Bid/No-Bid' && row.stage !== 'Bid Preparation' && !row.bidDecision) return false;
      const haystack = `${row.title} ${row.clientName} ${row.referenceNo} ${row.enquiryRef} ${row.description}`.toLowerCase();
      if (search && !haystack.includes(search.toLowerCase())) return false;
      if (type !== 'All Types' && row.tenderType !== type) return false;
      if (stage !== 'All Stages' && row.stage !== stage) return false;
      if (category !== 'All Categories' && row.category !== category) return false;
      if (client !== 'All Clients' && row.clientName !== client) return false;
      if (priority !== 'All Priorities' && row.priority !== priority) return false;
      const deadline = row.submissionDeadline || row.closingDate;
      if (fromDate && deadline && deadline < fromDate) return false;
      if (toDate && deadline && deadline > toDate) return false;
      return true;
    });
  }, [category, client, fromDate, priority, rows, search, stage, tab, toDate, type]);

  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);
  useEffect(() => { setPage(1); }, [tab, search, type, stage, category, client, priority, fromDate, toDate]);

  const openNew = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const typeSlices = (dashboard?.byType || []).map((item, index) => ({ label: item.label, value: item.count, color: TYPE_COLORS[index % TYPE_COLORS.length] }));
  const pipelineSlices = (dashboard?.byStage || []).map((item, index) => ({ label: item.label, value: item.value, color: STAGE_COLORS[index % STAGE_COLORS.length] }));
  const maxStage = Math.max(1, ...(dashboard?.byStage || []).map((item) => item.count));

  const clientGroups = useMemo(() => {
    const map = new Map<string, { count: number; value: number }>();
    filtered.forEach((row) => {
      const current = map.get(row.clientName) || { count: 0, value: 0 };
      current.count += 1;
      current.value += row.estimatedValue;
      map.set(row.clientName, current);
    });
    return Array.from(map.entries()).sort((a, b) => b[1].value - a[1].value);
  }, [filtered]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white">
            <Plus className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-950">Tender Opportunities</h1>
            <p className="text-sm text-slate-500">Manage enquiries, invitations and all tender opportunities from clients and external sources.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-500">{todayLabel()}</div>
          <button type="button" onClick={load} className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600" aria-label="Refresh"><RefreshCcw className="h-4 w-4" /></button>
          <button type="button" onClick={openNew} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700">+ New Opportunity</button>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1">
        {TABS.map((item) => (
          <button key={item} type="button" onClick={() => setTab(item)} className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold ${tab === item ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50'}`}>{item}</button>
        ))}
      </div>

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {[
          ['Total Opportunities', dashboard?.total ?? 0, dashboard?.monthDelta.total],
          ['Enquiries Received', dashboard?.enquiries ?? 0, dashboard?.monthDelta.enquiries],
          ['Open Tenders', dashboard?.openTenders ?? 0, dashboard?.monthDelta.openTenders],
          ['Invitations', dashboard?.invitations ?? 0, dashboard?.monthDelta.invitations],
          ['Prequalification', dashboard?.prequalification ?? 0, dashboard?.monthDelta.prequalification],
          ['Closing Soon', dashboard?.closingSoon ?? 0, null],
        ].map(([label, value, delta]) => (
          <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-2xl font-black text-slate-950">{loading ? '—' : String(value)}</div>
            <div className="text-xs font-semibold text-slate-500">{label}</div>
            <div className="mt-1 text-[11px] font-semibold text-emerald-600">{loading ? '' : label === 'Closing Soon' ? 'within 14 days' : deltaText(delta as number | null)}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-black">Opportunities by Type</h2>
          <Donut slices={typeSlices} center={String(dashboard?.total ?? 0)} caption="Total" />
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-black">Opportunities by Stage</h2>
          <div className="flex h-40 items-end gap-2">
            {(dashboard?.byStage || []).map((item, index) => (
              <div key={item.label} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                <span className="text-[11px] font-bold text-slate-700">{item.count}</span>
                <div className="w-full rounded-t-md" style={{ height: `${Math.max(item.count ? 8 : 2, (item.count / maxStage) * 120)}px`, background: STAGE_COLORS[index % STAGE_COLORS.length] }} />
                <span className="text-center text-[10px] leading-tight text-slate-500">{item.label}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-black">Pipeline Value</h2>
          <Donut slices={pipelineSlices} center={compactMoney(dashboard?.pipelineValue || 0)} caption="Total Value" />
        </section>
      </div>

      {tab === 'Client Intelligence' ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-black">Client Intelligence</h2>
          {clientGroups.length === 0 ? <p className="text-sm text-slate-500">No client records yet. Register an opportunity to build client intelligence.</p> : (
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-400"><tr><th className="py-2">Client</th><th>Opportunities</th><th>Pipeline</th></tr></thead>
              <tbody>
                {clientGroups.map(([name, stats]) => (
                  <tr key={name} className="border-t border-slate-100"><td className="py-2 font-semibold">{name}</td><td>{stats.count}</td><td>{money(stats.value)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
          <input className="h-9 min-w-[220px] flex-1 rounded-lg border border-slate-200 px-3 text-sm" placeholder="Search by title, client, reference no, enquiry no…" value={search} onChange={(event) => setSearch(event.target.value)} />
          <select className="h-9 rounded-lg border border-slate-200 px-2 text-sm" value={type} onChange={(event) => setType(event.target.value)}>
            <option>All Types</option>
            {['Client Bid', 'Supplier Tender', 'Enquiry', 'Framework Agreement', 'Internal Tender', 'Other'].map((item) => <option key={item}>{item}</option>)}
          </select>
          <select className="h-9 rounded-lg border border-slate-200 px-2 text-sm" value={stage} onChange={(event) => setStage(event.target.value)}>
            <option>All Stages</option>
            {(dashboard?.byStage || []).map((item) => <option key={item.label}>{item.label}</option>)}
            <option>Open</option><option>Invited</option>
          </select>
          <select className="h-9 rounded-lg border border-slate-200 px-2 text-sm" value={category} onChange={(event) => setCategory(event.target.value)}>
            <option>All Categories</option>
            {categories.map((item) => <option key={item}>{item}</option>)}
          </select>
          <select className="h-9 rounded-lg border border-slate-200 px-2 text-sm" value={client} onChange={(event) => setClient(event.target.value)}>
            <option>All Clients</option>
            {clients.map((item) => <option key={item}>{item}</option>)}
          </select>
          <select className="h-9 rounded-lg border border-slate-200 px-2 text-sm" value={priority} onChange={(event) => setPriority(event.target.value)}>
            <option>All Priorities</option><option>High</option><option>Medium</option><option>Low</option>
          </select>
          <input className="h-9 rounded-lg border border-slate-200 px-2 text-sm" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} aria-label="From date" />
          <input className="h-9 rounded-lg border border-slate-200 px-2 text-sm" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} aria-label="To date" />
          <button type="button" className="h-9 rounded-lg px-2 text-sm font-semibold text-slate-500" onClick={() => { setSearch(''); setType('All Types'); setStage('All Stages'); setCategory('All Categories'); setClient('All Clients'); setPriority('All Priorities'); setFromDate(''); setToDate(''); }}>Reset</button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1100px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-400">
              <tr>
                {['S/N', 'Title / Description', 'Client', 'Reference No.', 'Type', 'Category', 'Stage', 'Submission Deadline', 'Value', 'Priority', 'Enquiry Ref. No.', 'Action'].map((heading) => (
                  <th key={heading} className="px-3 py-3 font-bold">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row, index) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-3 py-3 text-slate-400">{(page - 1) * pageSize + index + 1}</td>
                  <td className="px-3 py-3"><div className="font-semibold text-slate-900">{row.title}</div><div className="max-w-xs truncate text-xs text-slate-400">{row.description || row.department}</div></td>
                  <td className="px-3 py-3">{row.clientName}</td>
                  <td className="px-3 py-3 font-medium text-blue-700">{row.referenceNo}</td>
                  <td className="px-3 py-3"><span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700">{row.tenderType}</span></td>
                  <td className="px-3 py-3">{row.category || '—'}</td>
                  <td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-xs font-bold ${statusClass(row.stage)}`}>{row.stage}</span></td>
                  <td className="px-3 py-3">{formatWhen(row.submissionDeadline || row.closingDate)}</td>
                  <td className="px-3 py-3 font-semibold">{money(row.estimatedValue, row.currency)}</td>
                  <td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-xs font-bold ${priorityClass(row.priority)}`}>{row.priority}</span></td>
                  <td className="px-3 py-3">{row.enquiryRef || '—'}</td>
                  <td className="relative px-3 py-3">
                    <div className="flex items-center gap-1">
                      <Link href={`/commercial/tenders/workspace?id=${row.id}`} className="rounded-md p-1 text-slate-500 hover:bg-slate-100" aria-label="View"><Eye className="h-4 w-4" /></Link>
                      <button type="button" className="rounded-md p-1 text-slate-500 hover:bg-slate-100" aria-label="Edit" onClick={() => { setEditing(row); setModalOpen(true); }}><Pencil className="h-4 w-4" /></button>
                      <button type="button" className="rounded-md p-1 text-slate-500 hover:bg-slate-100" aria-label="More" onClick={() => setMenuId(menuId === row.id ? '' : row.id)}><MoreHorizontal className="h-4 w-4" /></button>
                    </div>
                    {menuId === row.id ? (
                      <div className="absolute right-3 z-10 mt-1 w-44 rounded-lg border border-slate-200 bg-white p-1 text-xs shadow-lg">
                        <button type="button" className="block w-full rounded px-2 py-1.5 text-left hover:bg-slate-50" onClick={async () => { try { await tenderPost({ action: 'watchlist', id: row.id, watchlisted: !row.watchlisted }); setMenuId(''); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Watchlist update failed.'); } }}>{row.watchlisted ? 'Remove from watchlist' : 'Add to watchlist'}</button>
                        <button type="button" className="block w-full rounded px-2 py-1.5 text-left hover:bg-slate-50" onClick={async () => { try { await tenderPost({ action: 'duplicate', id: row.id }); setMenuId(''); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Duplicate failed.'); } }}>Duplicate</button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
              {!loading && pageRows.length === 0 ? (
                <tr><td colSpan={12} className="px-3 py-10 text-center text-sm text-slate-500">No opportunities in DLE_Enterprise match this view. Use New Opportunity to register one.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
          <span>Showing {filtered.length === 0 ? 0 : (page - 1) * pageSize + 1} to {Math.min(page * pageSize, filtered.length)} of {filtered.length}</span>
          <div className="flex gap-1">
            {Array.from({ length: pageCount }, (_, index) => (
              <button key={index} type="button" onClick={() => setPage(index + 1)} className={`h-7 min-w-7 rounded-md px-2 ${page === index + 1 ? 'bg-blue-600 text-white' : 'hover:bg-slate-100'}`}>{index + 1}</button>
            ))}
          </div>
        </div>
      </section>

      <div className="grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-black">Tender Statistics</h2>
          <Donut
            slices={(dashboard?.byStatus || []).filter((item) => item.count > 0).map((item, index) => ({ label: item.label, value: item.count, color: STAGE_COLORS[index % STAGE_COLORS.length] }))}
            center={String(dashboard?.total ?? 0)}
            caption="Total"
          />
          <ul className="mt-3 space-y-1 text-sm text-slate-600">
            {(dashboard?.byStatus || []).map((item) => (
              <li key={item.label} className="flex justify-between"><span>{item.label}</span><b>{item.count}</b></li>
            ))}
          </ul>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-black">Latest Opportunities</h2>
            <button type="button" className="text-xs font-bold text-blue-700" onClick={() => setTab('Opportunity Register')}>View all</button>
          </div>
          {(dashboard?.latest || []).length === 0 ? <p className="text-sm text-slate-500">No opportunities have been saved yet.</p> : (
            <ul className="divide-y divide-slate-100">
              {(dashboard?.latest || []).map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-3 py-2">
                  <div>
                    <div className="text-sm font-semibold">{row.referenceNo}</div>
                    <div className="text-xs text-slate-500">{row.title}</div>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${statusClass(row.status)}`}>{row.status}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <OpportunityModal
        open={modalOpen}
        initial={editing}
        presetType={tab === 'Enquiries' ? 'Enquiry' : undefined}
        onClose={() => setModalOpen(false)}
        onSaved={load}
      />
    </div>
  );
}
