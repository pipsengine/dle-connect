'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Columns3, Download, FileText, Filter, MoreHorizontal, Search } from 'lucide-react';
import type { TenderOpportunity } from '@/lib/commercial/tender-types';
import {
  MONTHS,
  SECTORS,
  closedOut,
  compactNaira,
  daysUntil,
  downloadCsv,
  expectedValue,
  opportunityStage,
  opportunityTabMatch,
  plainNaira,
  sectorOf,
  stageRank,
  winProbability,
} from '@/lib/commercial/tender-present';
import { formatWhen, tenderGet, tenderPost } from './tender-api';
import { OpportunityModal } from './OpportunityModal';
import { Donut, Pager, Pill, SplitButton, TodayChip } from './tender-widgets';

const TABS = ['All Opportunities', 'Invitations to Tender', 'Prequalification', 'Bid/No-Bid Decision', 'Shortlisted', 'Lost / Withdrawn', 'Archived'] as const;
const FUNNEL = [
  { label: 'Enquiries', rank: 0, icon: 'bg-blue-50 text-blue-600', card: 'bg-blue-50/60' },
  { label: 'Qualified', rank: 1, icon: 'bg-emerald-50 text-emerald-600', card: 'bg-emerald-50/70' },
  { label: 'Tender/Bid', rank: 2, icon: 'bg-violet-50 text-violet-600', card: 'bg-violet-50/70' },
  { label: 'Submission', rank: 3, icon: 'bg-teal-50 text-teal-600', card: 'bg-teal-50/70' },
  { label: 'Negotiation', rank: 4, icon: 'bg-rose-50 text-rose-500', card: 'bg-rose-50/70' },
  { label: 'Awarded', rank: 5, icon: 'bg-green-50 text-green-600', card: 'bg-green-50/80' },
] as const;
const STAGE_CLASS: Record<string, string> = {
  Enquiry: 'bg-cyan-50 text-cyan-700',
  Qualified: 'bg-emerald-50 text-emerald-700',
  Prequalification: 'bg-orange-50 text-orange-700',
  'Tender/Bid': 'bg-blue-50 text-blue-700',
  Submission: 'bg-violet-50 text-violet-700',
  Negotiation: 'bg-pink-50 text-pink-700',
  Shortlisted: 'bg-fuchsia-50 text-fuchsia-700',
  Awarded: 'bg-green-50 text-green-700',
  'Bid/No-Bid': 'bg-slate-100 text-slate-600',
};
const SECTOR_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#14b8a6', '#64748b'];
const LINE_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#a855f7'];

const funnelRank = (row: TenderOpportunity) => {
  const rank = stageRank(row);
  if (rank >= 6) return 5;
  if (rank === 5) return 4;
  if (rank === 4) return 3;
  if (rank >= 2) return 2;
  return rank;
};

export function OpportunitiesRegister() {
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<TenderOpportunity[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<(typeof TABS)[number]>('All Opportunities');
  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [stage, setStage] = useState('All Stages');
  const [category, setCategory] = useState('All Categories');
  const [unit, setUnit] = useState('All Business Units');
  const [client, setClient] = useState('All Clients');
  const [country, setCountry] = useState('All Countries');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TenderOpportunity | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuId, setMenuId] = useState('');
  const [showDays, setShowDays] = useState(true);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await tenderGet<TenderOpportunity[]>('opportunities'));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to read opportunities.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const query = searchParams.get('q') || '';
    if (query) setSearch(query);
    if (searchParams.get('compose') === '1') {
      setEditing(null);
      setModalOpen(true);
    }
  }, [searchParams]);

  const openRows = rows.filter((row) => row.status !== 'Closed' && !closedOut(row));
  const funnelBase = openRows.length || rows.filter((row) => row.status !== 'Closed').length;
  const reached = (rank: number) => openRows.filter((row) => funnelRank(row) >= rank);
  const funnel = FUNNEL.map((item) => {
    const matched = item.rank === 5 ? rows.filter((row) => opportunityStage(row) === 'Awarded') : reached(item.rank);
    const count = matched.length;
    return { ...item, count, value: matched.reduce((sum, row) => sum + row.estimatedValue, 0), pct: funnelBase ? Math.round((count / funnelBase) * 100) : 0 };
  });
  const pipelineRows = openRows.filter((row) => {
    const rank = funnelRank(row);
    return rank >= 2 && rank < 5;
  });
  const pipelineValue = pipelineRows.reduce((sum, row) => sum + row.estimatedValue, 0);
  const weighted = pipelineRows.reduce((sum, row) => sum + expectedValue(row), 0);
  const weightedPct = pipelineValue ? Math.round((weighted / pipelineValue) * 100) : 0;

  const categories = useMemo(() => Array.from(new Set(rows.map((row) => row.category).filter(Boolean))).sort(), [rows]);
  const units = useMemo(() => Array.from(new Set(rows.map((row) => row.businessUnit).filter(Boolean))).sort(), [rows]);
  const clients = useMemo(() => Array.from(new Set(rows.map((row) => row.clientName).filter(Boolean))).sort(), [rows]);
  const countries = useMemo(() => Array.from(new Set(rows.map((row) => row.location).filter(Boolean))).sort(), [rows]);

  const filtered = useMemo(() => rows.filter((row) => {
    if (!opportunityTabMatch(row, tab)) return false;
    const haystack = `${row.title} ${row.clientName} ${row.referenceNo} ${row.enquiryRef}`.toLowerCase();
    if (search && !haystack.includes(search.toLowerCase())) return false;
    if (stage !== 'All Stages' && opportunityStage(row) !== stage) return false;
    if (category !== 'All Categories' && row.category !== category) return false;
    if (unit !== 'All Business Units' && row.businessUnit !== unit) return false;
    if (client !== 'All Clients' && row.clientName !== client) return false;
    if (country !== 'All Countries' && row.location !== country && row.projectLocation !== country) return false;
    const closing = (row.submissionDeadline || row.closingDate || '').slice(0, 10);
    if (fromDate && closing && closing < fromDate) return false;
    if (toDate && closing && closing > toDate) return false;
    return true;
  }), [category, client, country, fromDate, rows, search, stage, tab, toDate, unit]);

  useEffect(() => { setPage(1); }, [tab, search, stage, category, unit, client, country, fromDate, toDate, pageSize]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);
  const year = new Date().getUTCFullYear();
  const trends = MONTHS.map((month, index) => ({
    month,
    enquiries: rows.filter((row) => createdIn(row, year, index)).length,
    qualified: rows.filter((row) => createdIn(row, year, index) && funnelRank(row) >= 1).length,
    bids: rows.filter((row) => createdIn(row, year, index) && funnelRank(row) >= 2 && funnelRank(row) < 5).length,
    awards: rows.filter((row) => createdIn(row, year, index) && opportunityStage(row) === 'Awarded').length,
  }));
  const maxTrend = Math.max(1, ...trends.flatMap((item) => [item.enquiries, item.qualified, item.bids, item.awards]));
  const sectorSlices = SECTORS.map((label, index) => ({
    label,
    value: openRows.filter((row) => sectorOf(row) === label).reduce((sum, row) => sum + row.estimatedValue, 0),
    color: SECTOR_COLORS[index],
  }));
  const sectorTotal = sectorSlices.reduce((sum, slice) => sum + slice.value, 0);
  const clientBars = Array.from(openRows.reduce((map, row) => {
    const name = row.clientName || 'Unassigned';
    map.set(name, (map.get(name) || 0) + row.estimatedValue);
    return map;
  }, new Map<string, number>())).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const clientMax = Math.max(1, ...clientBars.map((item) => item[1]));
  const clientSum = clientBars.reduce((sum, item) => sum + item[1], 0);

  const exportRows = () => downloadCsv('tender-opportunities.csv', ['Opportunity Title', 'Client', 'Reference No.', 'Category', 'Stage', 'Estimated Value', 'Probability', 'Expected Value', 'Closing Date', 'Owner'], filtered.map((row) => [
    row.title, row.clientName, row.referenceNo, row.category, opportunityStage(row), plainNaira(row.estimatedValue), `${winProbability(row)}%`, plainNaira(expectedValue(row)), formatWhen(row.submissionDeadline || row.closingDate), row.ownerName,
  ]));

  return (
    <div className="space-y-4">
      <div className="text-[12px] text-slate-400">Tender Management <span className="px-1">›</span> <span className="font-semibold text-slate-600">Tender Opportunities</span></div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#2563eb] text-white shadow-sm"><FileText className="h-6 w-6" /></span>
          <div>
            <h1 className="text-[26px] font-black leading-tight tracking-tight text-slate-950">Tender Opportunities</h1>
            <p className="text-[13px] text-slate-500">Manage all qualified opportunities and invitations to tender from clients</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <TodayChip />
          <SplitButton href="/commercial/tenders/opportunities?compose=1" label="New Opportunity" open={menuOpen} onToggle={() => setMenuOpen((value) => !value)}>
            <button type="button" className="block w-full px-3 py-2 text-left font-semibold hover:bg-slate-50" onClick={() => { setEditing(null); setModalOpen(true); setMenuOpen(false); }}>New opportunity</button>
            <Link href="/commercial/tenders/enquiries?compose=1" className="block px-3 py-2 font-semibold hover:bg-slate-50">New enquiry</Link>
          </SplitButton>
        </div>
      </div>
      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      <div className="grid items-stretch gap-2 xl:grid-cols-[repeat(6,minmax(0,1fr))_200px]">
        {funnel.map((item, index) => (
          <div key={item.label} className="flex items-center gap-1">
            <article className={`min-w-0 flex-1 rounded-2xl border border-white px-3 py-3 shadow-sm ${item.card}`}>
              <div className="text-[11px] font-semibold text-slate-500">{item.label}</div>
              <div className="text-[26px] font-black leading-none text-slate-950">{loading ? '—' : item.count}</div>
              <div className="mt-1 text-[12px] font-bold text-slate-700">{compactNaira(item.value)}</div>
              <div className="text-[11px] font-semibold text-slate-400">{item.pct}%</div>
            </article>
            {index < funnel.length - 1 ? <ArrowRight className="hidden h-4 w-4 shrink-0 text-slate-300 xl:block" /> : null}
          </div>
        ))}
        <article className="rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
          <div className="text-[11px] font-semibold text-slate-500">Total Pipeline Value</div>
          <div className="mt-1 text-[22px] font-black leading-none text-slate-950">{compactNaira(pipelineValue)}</div>
          <div className="mt-2 text-[11px] text-slate-500">Weighted Forecast</div>
          <div className="text-[13px] font-bold text-slate-800">{compactNaira(weighted)} <span className="font-semibold text-slate-400">({weightedPct}%)</span></div>
        </article>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex gap-1 overflow-x-auto border-b border-slate-100 px-3 pt-2">
          {TABS.map((item) => (
            <button key={item} type="button" onClick={() => setTab(item)} className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] font-semibold ${tab === item ? 'border-[#2563eb] text-[#2563eb]' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{item}</button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 px-3 py-3">
          <label className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by title, client, reference no..." className="h-10 w-full rounded-xl border border-slate-200 bg-[#f8fafc] pl-9 pr-3 text-[13px] outline-none focus:border-blue-500 focus:bg-white" />
          </label>
          <Select value={stage} onChange={setStage} options={['All Stages', 'Enquiry', 'Qualified', 'Prequalification', 'Tender/Bid', 'Submission', 'Negotiation', 'Shortlisted', 'Awarded', 'Bid/No-Bid']} />
          <Select value={category} onChange={setCategory} options={['All Categories', ...categories]} />
          <Select value={unit} onChange={setUnit} options={['All Business Units', ...units]} />
          <Select value={client} onChange={setClient} options={['All Clients', ...clients]} />
          <Select value={country} onChange={setCountry} options={['All Countries', ...countries]} />
          <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className="h-10 rounded-xl border border-slate-200 px-2 text-[12px]" aria-label="From date" />
          <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className="h-10 rounded-xl border border-slate-200 px-2 text-[12px]" aria-label="To date" />
          <button type="button" onClick={() => { setStage('All Stages'); setCategory('All Categories'); setUnit('All Business Units'); setClient('All Clients'); setCountry('All Countries'); setFromDate(''); setToDate(''); }} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-[13px] font-semibold text-slate-600"><Filter className="h-3.5 w-3.5" /> Filter</button>
          <button type="button" onClick={exportRows} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-[13px] font-semibold text-slate-600"><Download className="h-3.5 w-3.5" /> Export</button>
          <button type="button" onClick={() => setShowDays((value) => !value)} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-[13px] font-semibold text-slate-600"><Columns3 className="h-3.5 w-3.5" /> Columns</button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1200px] w-full text-left text-[13px]">
            <thead className="bg-[#f8fafc] text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              <tr>
                {['', 'S/N', 'Opportunity Title', 'Client', 'Reference No.', 'Category', 'Stage', 'Estimated Value (₦)', 'Probability', 'Expected Value (₦)', 'Closing Date', ...(showDays ? ['Days Left'] : []), 'Owner', 'Action'].map((heading) => (
                  <th key={heading || 'check'} className="px-3 py-3 font-semibold">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr><td colSpan={14} className="px-4 py-10 text-center text-sm text-slate-500">{loading ? 'Loading register…' : 'No opportunities match this view.'}</td></tr>
              ) : pageRows.map((row, index) => {
                const label = opportunityStage(row);
                const left = daysUntil(row.submissionDeadline || row.closingDate);
                return (
                  <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50/70">
                    <td className="px-3 py-3"><input type="checkbox" aria-label={`Select ${row.title}`} /></td>
                    <td className="px-3 py-3 text-slate-400">{(page - 1) * pageSize + index + 1}</td>
                    <td className="max-w-[220px] px-3 py-3 font-semibold text-slate-800"><Link href={`/commercial/tenders/workspace?id=${row.id}`} className="hover:text-blue-700">{row.title}</Link></td>
                    <td className="px-3 py-3">{row.clientName || '—'}</td>
                    <td className="px-3 py-3 text-slate-500">{row.referenceNo}</td>
                    <td className="px-3 py-3">{row.category || '—'}</td>
                    <td className="px-3 py-3"><Pill className={STAGE_CLASS[label]}>{label}</Pill></td>
                    <td className="px-3 py-3 font-semibold">{plainNaira(row.estimatedValue)}</td>
                    <td className="px-3 py-3 font-bold text-slate-700">{winProbability(row)}%</td>
                    <td className="px-3 py-3">{plainNaira(expectedValue(row))}</td>
                    <td className="px-3 py-3">{formatWhen(row.submissionDeadline || row.closingDate)}</td>
                    {showDays ? <td className="px-3 py-3">{left == null ? '—' : <Pill className={left <= 30 ? 'bg-rose-50 text-rose-600' : left <= 60 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}>{left} days</Pill>}</td> : null}
                    <td className="px-3 py-3">{row.ownerName || '—'}</td>
                    <td className="relative px-3 py-3">
                      <button type="button" aria-label="Row actions" onClick={() => setMenuId(menuId === row.id ? '' : row.id)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><MoreHorizontal className="h-4 w-4" /></button>
                      {menuId === row.id ? (
                        <div className="absolute right-3 z-10 w-44 rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-lg">
                          <Link href={`/commercial/tenders/workspace?id=${row.id}`} className="block px-3 py-2 hover:bg-slate-50">Open workspace</Link>
                          <button type="button" className="block w-full px-3 py-2 text-left hover:bg-slate-50" onClick={() => { setEditing(row); setModalOpen(true); setMenuId(''); }}>Edit</button>
                          <button type="button" className="block w-full px-3 py-2 text-left hover:bg-slate-50" onClick={() => tenderPost({ action: 'duplicate', id: row.id }).then(load)}>Duplicate</button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pager page={Math.min(page, pageCount)} pageCount={pageCount} pageSize={pageSize} total={filtered.length} onPage={setPage} onPageSize={setPageSize} />
      </section>

      <div className="grid gap-3 xl:grid-cols-3">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-black">Opportunity Trends</h2>
            <div className="flex flex-wrap gap-2 text-[10px] text-slate-500">
              {['Enquiries', 'Qualified', 'Bids', 'Awards'].map((label, index) => <span key={label} className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: LINE_COLORS[index] }} />{label}</span>)}
            </div>
          </div>
          <TrendChart points={trends} max={maxTrend} />
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-sm font-black">Opportunity by Sector (Value)</h2>
          <Donut slices={sectorSlices} center={compactNaira(sectorTotal)} caption="Total" />
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-black">Top Clients (Pipeline Value)</h2>
          {clientBars.length === 0 ? <p className="text-sm text-slate-500">No client values yet.</p> : (
            <ul className="space-y-2.5">
              {clientBars.map(([name, value]) => (
                <li key={name}>
                  <div className="mb-1 flex justify-between text-[12px]"><span className="font-semibold text-slate-700">{name}</span><span className="text-slate-500">{compactNaira(value)} ({clientSum ? Math.round((value / clientSum) * 100) : 0}%)</span></div>
                  <div className="h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-[#3b82f6]" style={{ width: `${(value / clientMax) * 100}%` }} /></div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <OpportunityModal open={modalOpen} initial={editing} onClose={() => setModalOpen(false)} onSaved={() => { setModalOpen(false); load(); }} />
    </div>
  );
}

function createdIn(row: TenderOpportunity, year: number, month: number) {
  const parsed = new Date(row.createdAt);
  return !Number.isNaN(parsed.getTime()) && parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month;
}

function Select({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: string[] }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 max-w-[170px] rounded-xl border border-slate-200 bg-white px-2 text-[12px] font-semibold text-slate-600">
      {options.map((option) => <option key={option}>{option}</option>)}
    </select>
  );
}

function TrendChart({ points, max }: { points: Array<{ month: string; enquiries: number; qualified: number; bids: number; awards: number }>; max: number }) {
  const width = 360;
  const height = 150;
  const series = [
    points.map((item) => item.enquiries),
    points.map((item) => item.qualified),
    points.map((item) => item.bids),
    points.map((item) => item.awards),
  ];
  const path = (values: number[]) => values.map((value, index) => {
    const x = 16 + (index * (width - 32)) / 11;
    const y = 120 - (value / max) * 100;
    return `${index === 0 ? 'M' : 'L'}${x},${y}`;
  }).join(' ');
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-40 w-full">
      {series.map((values, index) => <path key={LINE_COLORS[index]} d={path(values)} fill="none" stroke={LINE_COLORS[index]} strokeWidth="2" />)}
      {points.map((item, index) => <text key={item.month} x={16 + (index * (width - 32)) / 11} y="142" textAnchor="middle" fontSize="8" fill="#94a3b8">{item.month}</text>)}
    </svg>
  );
}
