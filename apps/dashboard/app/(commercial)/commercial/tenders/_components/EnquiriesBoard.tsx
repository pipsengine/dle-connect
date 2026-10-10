'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, Download, FileCheck2, Filter, Mail, MailPlus, MoreHorizontal, Search, ShieldAlert } from 'lucide-react';
import type { TenderDashboard, TenderOpportunity } from '@/lib/commercial/tender-types';
import {
  SOURCE_BUCKETS,
  countCreated,
  downloadCsv,
  enquiryPill,
  enquiryTabMatch,
  monthDelta,
  MONTHS,
  nextActionOn,
  plainNaira,
  receivedOn,
  sourceBucket,
} from '@/lib/commercial/tender-present';
import { formatWhen, tenderGet, tenderPost } from './tender-api';
import { OpportunityModal } from './OpportunityModal';
import { Delta, Donut, Pager, Pill, SplitButton, TodayChip } from './tender-widgets';

const TABS = ['All Enquiries', 'New Enquiries', 'Under Qualification', 'Converted to Tender', 'Not Pursuing', 'Archived'] as const;
const PILL_CLASS: Record<string, string> = {
  New: 'bg-blue-50 text-blue-700',
  'Under Review': 'bg-orange-50 text-orange-700',
  Qualified: 'bg-emerald-50 text-emerald-700',
  'Under Qualification': 'bg-amber-50 text-amber-700',
  'Converted to Tender': 'bg-green-50 text-green-700',
  'Not Pursuing': 'bg-rose-50 text-rose-600',
  Archived: 'bg-slate-100 text-slate-600',
};
const SOURCE_CLASS: Record<string, string> = {
  Email: 'bg-emerald-50 text-emerald-700',
  'Tender Portal': 'bg-sky-50 text-sky-700',
  Portal: 'bg-sky-50 text-sky-700',
  'Client Meeting': 'bg-violet-50 text-violet-700',
  'Client Direct': 'bg-violet-50 text-violet-700',
  Website: 'bg-fuchsia-50 text-fuchsia-700',
  Referral: 'bg-amber-50 text-amber-700',
  Invitation: 'bg-sky-50 text-sky-700',
  'Public Portal': 'bg-sky-50 text-sky-700',
};
const SOURCE_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#94a3b8'];
const KPI = [
  { key: 'total', label: 'Total Enquiries', icon: Mail, wrap: 'bg-blue-50 text-blue-600' },
  { key: 'new', label: 'New Enquiries', icon: MailPlus, wrap: 'bg-violet-50 text-violet-600' },
  { key: 'qualification', label: 'Under Qualification', icon: FileCheck2, wrap: 'bg-emerald-50 text-emerald-600' },
  { key: 'converted', label: 'Converted to Tender', icon: BadgeCheck, wrap: 'bg-amber-50 text-amber-600' },
  { key: 'stopped', label: 'Not Pursuing', icon: ShieldAlert, wrap: 'bg-rose-50 text-rose-500' },
] as const;

export function EnquiriesBoard() {
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<TenderOpportunity[]>([]);
  const [dashboard, setDashboard] = useState<TenderDashboard | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<(typeof TABS)[number]>('All Enquiries');
  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [status, setStatus] = useState('All Status');
  const [category, setCategory] = useState('All Categories');
  const [client, setClient] = useState('All Clients');
  const [source, setSource] = useState('All Sources');
  const [country, setCountry] = useState('All Countries');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TenderOpportunity | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuId, setMenuId] = useState('');
  const [picked, setPicked] = useState<string[]>([]);

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
      setError(reason instanceof Error ? reason.message : 'Unable to read enquiries.');
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

  const live = rows.filter((row) => enquiryPill(row) !== 'Archived');
  const now = new Date();
  const thisMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const lastMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const band = (key: (typeof KPI)[number]['key']) => {
    if (key === 'total') return (row: TenderOpportunity) => enquiryPill(row) !== 'Archived';
    if (key === 'new') return (row: TenderOpportunity) => enquiryPill(row) === 'New';
    if (key === 'qualification') return (row: TenderOpportunity) => ['Under Qualification', 'Qualified'].includes(enquiryPill(row));
    if (key === 'converted') return (row: TenderOpportunity) => enquiryPill(row) === 'Converted to Tender';
    return (row: TenderOpportunity) => enquiryPill(row) === 'Not Pursuing';
  };
  const kpis = KPI.map((item) => {
    const pick = band(item.key);
    return {
      ...item,
      count: rows.filter(pick).length,
      delta: monthDelta(countCreated(rows, thisMonthStart, new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)), pick), countCreated(rows, lastMonthStart, thisMonthStart, pick)),
    };
  });

  const categories = useMemo(() => Array.from(new Set(rows.map((row) => row.category).filter(Boolean))).sort(), [rows]);
  const clients = useMemo(() => Array.from(new Set(rows.map((row) => row.clientName).filter(Boolean))).sort(), [rows]);
  const sources = useMemo(() => Array.from(new Set(rows.map((row) => row.source).filter(Boolean))).sort(), [rows]);
  const countries = useMemo(() => Array.from(new Set(rows.map((row) => row.location).filter(Boolean))).sort(), [rows]);

  const filtered = useMemo(() => rows.filter((row) => {
    if (!enquiryTabMatch(row, tab)) return false;
    const haystack = `${row.title} ${row.clientName} ${row.referenceNo} ${row.enquiryRef}`.toLowerCase();
    if (search && !haystack.includes(search.toLowerCase())) return false;
    if (status !== 'All Status' && enquiryPill(row) !== status) return false;
    if (category !== 'All Categories' && row.category !== category) return false;
    if (client !== 'All Clients' && row.clientName !== client) return false;
    if (source !== 'All Sources' && row.source !== source) return false;
    if (country !== 'All Countries' && row.location !== country && row.projectLocation !== country) return false;
    const received = receivedOn(row);
    if (fromDate && received && received.slice(0, 10) < fromDate) return false;
    if (toDate && received && received.slice(0, 10) > toDate) return false;
    return true;
  }), [category, client, country, fromDate, rows, search, source, status, tab, toDate]);

  useEffect(() => { setPage(1); }, [tab, search, status, category, client, source, country, fromDate, toDate, pageSize]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  const year = now.getUTCFullYear();
  const summary = MONTHS.map((month, index) => ({
    month,
    received: rows.filter((row) => inCreated(row, year, index)).length,
    converted: rows.filter((row) => inCreated(row, year, index) && enquiryPill(row) === 'Converted to Tender').length,
  }));
  const maxBar = Math.max(1, ...summary.flatMap((item) => [item.received, item.converted]));
  const sourceSlices = SOURCE_BUCKETS.map((label, index) => ({
    label,
    value: live.filter((row) => sourceBucket(row.source) === label).length,
    color: SOURCE_COLORS[index],
  }));
  const actions = dashboard?.actions || [];

  const exportRows = () => {
    const chosen = picked.length ? filtered.filter((row) => picked.includes(row.id)) : filtered;
    downloadCsv('enquiries.csv', ['Enquiry Title', 'Client', 'Reference No.', 'Received Date', 'Source', 'Category', 'Estimated Value', 'Status', 'Owner', 'Next Action Date'], chosen.map((row) => [
      row.title, row.clientName, row.enquiryRef || row.referenceNo, formatWhen(receivedOn(row)), row.source, row.category, plainNaira(row.estimatedValue), enquiryPill(row), row.ownerName, formatWhen(nextActionOn(row)),
    ]));
  };

  return (
    <div className="space-y-4">
      <div className="text-[12px] text-slate-400">Tender Management <span className="px-1">›</span> <span className="font-semibold text-slate-600">Enquiries</span></div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#2563eb] text-white shadow-sm"><Mail className="h-6 w-6" /></span>
          <div>
            <h1 className="text-[26px] font-black leading-tight tracking-tight text-slate-950">Enquiries</h1>
            <p className="text-[13px] text-slate-500">Manage all client enquiries, expressions of interest and invitations received from clients</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <TodayChip />
          <SplitButton href="/commercial/tenders/enquiries?compose=1" label="New Enquiry" open={menuOpen} onToggle={() => setMenuOpen((value) => !value)}>
            <button type="button" className="block w-full px-3 py-2 text-left font-semibold hover:bg-slate-50" onClick={() => { setEditing(null); setModalOpen(true); setMenuOpen(false); }}>New enquiry</button>
            <Link href="/commercial/tenders/opportunities" className="block px-3 py-2 font-semibold hover:bg-slate-50" onClick={() => setMenuOpen(false)}>Opportunity register</Link>
          </SplitButton>
        </div>
      </div>

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {kpis.map((item) => {
          const Icon = item.icon;
          return (
            <article key={item.key} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[28px] font-black leading-none text-slate-950">{loading ? '—' : item.count}</div>
                  <div className="mt-1 text-[12px] font-semibold text-slate-500">{item.label}</div>
                </div>
                <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${item.wrap}`}><Icon className="h-4 w-4" /></span>
              </div>
              <div className="mt-2"><Delta value={loading ? 0 : item.delta} /></div>
            </article>
          );
        })}
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex gap-1 overflow-x-auto border-b border-slate-100 px-3 pt-2">
          {TABS.map((item) => (
            <button key={item} type="button" onClick={() => setTab(item)} className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] font-semibold ${tab === item ? 'border-[#2563eb] text-[#2563eb]' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{item}</button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 px-3 py-3">
          <label className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by title, client, reference no..." className="h-10 w-full rounded-xl border border-slate-200 bg-[#f8fafc] pl-9 pr-3 text-[13px] outline-none focus:border-blue-500 focus:bg-white" />
          </label>
          <button type="button" onClick={() => { setStatus('All Status'); setCategory('All Categories'); setClient('All Clients'); setSource('All Sources'); setCountry('All Countries'); setFromDate(''); setToDate(''); }} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-[13px] font-semibold text-slate-600"><Filter className="h-3.5 w-3.5" /> Filter</button>
          <Select value={status} onChange={setStatus} options={['All Status', 'New', 'Under Review', 'Qualified', 'Under Qualification', 'Converted to Tender', 'Not Pursuing']} />
          <Select value={category} onChange={setCategory} options={['All Categories', ...categories]} />
          <Select value={client} onChange={setClient} options={['All Clients', ...clients]} />
          <Select value={source} onChange={setSource} options={['All Sources', ...sources]} />
          <Select value={country} onChange={setCountry} options={['All Countries', ...countries]} />
          <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className="h-10 rounded-xl border border-slate-200 px-2 text-[12px]" aria-label="From date" />
          <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className="h-10 rounded-xl border border-slate-200 px-2 text-[12px]" aria-label="To date" />
          <button type="button" onClick={exportRows} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-[13px] font-semibold text-slate-600"><Download className="h-3.5 w-3.5" /> Export</button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1100px] w-full text-left text-[13px]">
            <thead className="bg-[#f8fafc] text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              <tr>
                {['', 'S/N', 'Enquiry Title', 'Client', 'Reference No.', 'Received Date', 'Source', 'Category', 'Estimated Value (₦)', 'Status', 'Owner', 'Next Action Date', 'Action'].map((heading) => (
                  <th key={heading || 'check'} className="px-3 py-3 font-semibold">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr><td colSpan={13} className="px-4 py-10 text-center text-sm text-slate-500">{loading ? 'Loading register…' : 'No enquiries match this view.'}</td></tr>
              ) : pageRows.map((row, index) => {
                const pill = enquiryPill(row);
                return (
                  <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50/70">
                    <td className="px-3 py-3"><input type="checkbox" checked={picked.includes(row.id)} onChange={() => setPicked((current) => current.includes(row.id) ? current.filter((id) => id !== row.id) : [...current, row.id])} aria-label={`Select ${row.title}`} /></td>
                    <td className="px-3 py-3 text-slate-400">{(page - 1) * pageSize + index + 1}</td>
                    <td className="max-w-[220px] px-3 py-3 font-semibold text-slate-800"><Link href={`/commercial/tenders/workspace?id=${row.id}`} className="hover:text-blue-700">{row.title}</Link></td>
                    <td className="px-3 py-3">{row.clientName || '—'}</td>
                    <td className="px-3 py-3 text-slate-500">{row.enquiryRef || row.referenceNo}</td>
                    <td className="px-3 py-3">{formatWhen(receivedOn(row))}</td>
                    <td className="px-3 py-3"><Pill className={SOURCE_CLASS[row.source] || 'bg-slate-100 text-slate-600'}>{row.source || '—'}</Pill></td>
                    <td className="px-3 py-3">{row.category || '—'}</td>
                    <td className="px-3 py-3 font-semibold">{plainNaira(row.estimatedValue)}</td>
                    <td className="px-3 py-3"><Pill className={PILL_CLASS[pill]}>{pill}</Pill></td>
                    <td className="px-3 py-3">{row.ownerName || '—'}</td>
                    <td className="px-3 py-3">{formatWhen(nextActionOn(row))}</td>
                    <td className="relative px-3 py-3">
                      <button type="button" aria-label="Row actions" onClick={() => setMenuId(menuId === row.id ? '' : row.id)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><MoreHorizontal className="h-4 w-4" /></button>
                      {menuId === row.id ? (
                        <div className="absolute right-3 z-10 w-40 rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-lg">
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
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-black text-slate-900">Enquiry Summary</h2>
            <div className="flex gap-3 text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#3b82f6]" /> Enquiries Received</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#22c55e]" /> Converted to Tender</span>
            </div>
          </div>
          <svg viewBox="0 0 360 160" className="h-40 w-full">
            {summary.map((item, index) => {
              const x = 18 + index * 28;
              const received = (item.received / maxBar) * 110;
              const converted = (item.converted / maxBar) * 110;
              return (
                <g key={item.month}>
                  <rect x={x} y={128 - received} width="8" height={received} rx="2" fill="#3b82f6" />
                  <rect x={x + 10} y={128 - converted} width="8" height={converted} rx="2" fill="#22c55e" />
                  <text x={x + 8} y="148" textAnchor="middle" fontSize="8" fill="#94a3b8">{item.month}</text>
                </g>
              );
            })}
          </svg>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-sm font-black text-slate-900">Enquiries by Source</h2>
          <Donut slices={sourceSlices} center={String(live.length)} caption="Total" />
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="inline-flex items-center gap-2 text-sm font-black text-slate-900">Priority Actions <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] text-rose-600">{dashboard?.board?.actionCount ?? actions.length}</span></h2>
            <Link href="/commercial/tenders/workspace" className="text-[12px] font-semibold text-blue-700">View All</Link>
          </div>
          {actions.length === 0 ? <p className="text-sm text-slate-500">No open priority actions.</p> : (
            <ul className="space-y-3">
              {actions.slice(0, 4).map((action) => (
                <li key={action.id} className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[13px] font-semibold text-slate-800">{action.title}</div>
                    <div className="text-[11px] text-slate-400">{action.detail}</div>
                  </div>
                  <Pill className={action.tone === 'urgent' ? 'bg-rose-50 text-rose-600' : 'bg-blue-50 text-blue-700'}>{action.badge}</Pill>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <OpportunityModal open={modalOpen} initial={editing} presetType={editing ? undefined : 'Enquiry'} onClose={() => setModalOpen(false)} onSaved={() => { setModalOpen(false); load(); }} />
    </div>
  );
}

function inCreated(row: TenderOpportunity, year: number, month: number) {
  const parsed = new Date(row.createdAt);
  return !Number.isNaN(parsed.getTime()) && parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month;
}

function Select({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: string[] }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 max-w-[160px] rounded-xl border border-slate-200 bg-white px-2 text-[12px] font-semibold text-slate-600">
      {options.map((option) => <option key={option}>{option}</option>)}
    </select>
  );
}
