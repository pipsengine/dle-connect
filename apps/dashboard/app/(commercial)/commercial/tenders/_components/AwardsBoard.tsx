'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { CalendarClock, ChartColumn, CheckCircle2, ChevronDown, CircleDollarSign, ClipboardList, Clock3, Download, FileStack, FileText, Flag, LayoutGrid, Plus, ScrollText, Trophy, type LucideIcon } from 'lucide-react';
import type { TenderAuditEvent, TenderAward, TenderItem, TenderOpportunity } from '@/lib/commercial/tender-types';
import { MONTHS, compactNaira, daysUntil, downloadCsv, plainNaira } from '@/lib/commercial/tender-present';
import { formatWhen, tenderGet, tenderPost } from './tender-api';
import { Donut, Pager, Pill } from './tender-widgets';

const TABS: Array<{ id: string; icon: LucideIcon }> = [
  { id: 'Contracts Overview', icon: LayoutGrid },
  { id: 'Awarded Tenders', icon: Trophy },
  { id: 'Contract Details', icon: FileText },
  { id: 'Extensions & Variations', icon: ScrollText },
  { id: 'Contract Documents', icon: FileStack },
  { id: 'Milestones & Deliverables', icon: Flag },
  { id: 'Contract Performance', icon: ChartColumn },
  { id: 'Close Out', icon: ClipboardList },
];
const STATUSES = ['Active', 'In Progress', 'Completed', 'Closed', 'Not Started'] as const;
const COLORS = ['#22c55e', '#3b82f6', '#14b8a6', '#94a3b8', '#f59e0b'];

type Contract = { award: TenderAward; opportunity?: TenderOpportunity; status: (typeof STATUSES)[number]; expiry: string };

const contractStatus = (award: TenderAward, opportunity?: TenderOpportunity): (typeof STATUSES)[number] => {
  if (opportunity?.status === 'Closed') return 'Closed';
  if (/complete|closed/i.test(award.handoverNotes)) return 'Completed';
  if (/handover|progress/i.test(`${opportunity?.stage} ${award.handoverNotes}`)) return 'In Progress';
  const start = new Date(award.awardDate || award.createdAt);
  if (!Number.isNaN(start.getTime()) && start.getTime() > Date.now()) return 'Not Started';
  return 'Active';
};

const expiryOf = (award: TenderAward, opportunity?: TenderOpportunity) => {
  const start = new Date(award.awardDate || award.createdAt);
  if (Number.isNaN(start.getTime())) return '';
  const months = opportunity?.durationUnit?.toLowerCase().startsWith('year') ? (opportunity.contractDuration || 0) * 12 : (opportunity?.contractDuration || 0);
  if (!months) return '';
  start.setUTCMonth(start.getUTCMonth() + months);
  return start.toISOString().slice(0, 10);
};

export function AwardsBoard() {
  const [rows, setRows] = useState<TenderOpportunity[]>([]);
  const [awards, setAwards] = useState<TenderAward[]>([]);
  const [items, setItems] = useState<TenderItem[]>([]);
  const [audit, setAudit] = useState<TenderAuditEvent[]>([]);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('Contracts Overview');
  const [statusFilter, setStatusFilter] = useState('Active Contracts');
  const [tableStatus, setTableStatus] = useState('All Status');
  const [client, setClient] = useState('All Clients');
  const [year, setYear] = useState('All Years');
  const [range, setRange] = useState('All Dates');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ id: '', contractRef: '', awardedValue: '', awardDate: '' });

  const load = async () => {
    const [opportunities, awarded, tasks, events] = await Promise.all([
      tenderGet<TenderOpportunity[]>('opportunities'),
      tenderGet<TenderAward[]>('awards'),
      tenderGet<TenderItem[]>('items'),
      tenderGet<TenderAuditEvent[]>('audit'),
    ]);
    setRows(opportunities);
    setAwards(awarded);
    setItems(tasks);
    setAudit(events);
  };

  useEffect(() => { load().catch((reason) => setError(reason instanceof Error ? reason.message : 'Unable to read awards.')); }, []);

  const contracts = useMemo<Contract[]>(() => awards.map((award) => {
    const opportunity = rows.find((row) => row.id === award.opportunityId);
    return { award, opportunity, status: contractStatus(award, opportunity), expiry: expiryOf(award, opportunity) };
  }), [awards, rows]);
  const filtered = contracts.filter((item) => {
    if (statusFilter === 'Active Contracts' && !['Active', 'In Progress'].includes(item.status)) return false;
    if (statusFilter === 'Completed' && item.status !== 'Completed') return false;
    if (statusFilter === 'Closed' && item.status !== 'Closed') return false;
    if (client !== 'All Clients' && item.opportunity?.clientName !== client) return false;
    if (tableStatus !== 'All Status' && item.status !== tableStatus) return false;
    if (year !== 'All Years' && !(item.award.awardDate || '').startsWith(year)) return false;
    if (range === 'This Year' && !(item.award.awardDate || '').startsWith(String(new Date().getUTCFullYear()))) return false;
    if (range === 'Last 90 Days') {
      const days = daysUntil(item.award.awardDate);
      if (days == null || days > 0 || days < -90) return false;
    }
    const haystack = `${item.opportunity?.title} ${item.opportunity?.clientName} ${item.award.contractRef}`.toLowerCase();
    return !search || haystack.includes(search.toLowerCase());
  });
  useEffect(() => { setPage(1); }, [statusFilter, tableStatus, client, year, range, search, pageSize]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);
  const value = contracts.reduce((sum, item) => sum + item.award.awardedValue, 0);
  const active = contracts.filter((item) => item.status === 'Active' || item.status === 'In Progress');
  const completed = contracts.filter((item) => item.status === 'Completed');
  const expiring = contracts.filter((item) => {
    const days = daysUntil(item.expiry);
    return days != null && days >= 0 && days <= 90;
  });
  const thisYear = new Date().getUTCFullYear();
  const yearValue = contracts.filter((item) => (item.award.awardDate || '').startsWith(String(thisYear))).reduce((sum, item) => sum + item.award.awardedValue, 0);
  const slices = STATUSES.map((label, index) => ({ label, value: contracts.filter((item) => item.status === label).reduce((sum, item) => sum + item.award.awardedValue, 0), color: COLORS[index] }));
  const milestones = items.filter((item) => /milestone|deliver/i.test(item.kind)).slice(0, 5);
  const activities = audit.filter((event) => contracts.some((contract) => contract.award.opportunityId === event.opportunityId)).slice(0, 5);
  const months = MONTHS.slice(0, 6);
  const trend = months.map((month, index) => contracts.filter((item) => new Date(item.award.awardDate || item.award.createdAt).getUTCMonth() === index).reduce((sum, item) => sum + item.award.awardedValue, 0));
  const maxTrend = Math.max(1, ...trend);

  const saveAward = async () => {
    setError('');
    try {
      await tenderPost({ action: 'award', id: form.id, award: { contractRef: form.contractRef, awardedValue: Number(form.awardedValue || 0), awardDate: form.awardDate } });
      setAdding(false);
      setForm({ id: '', contractRef: '', awardedValue: '', awardDate: '' });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Award was not saved.');
    }
  };

  const share = (count: number) => (contracts.length ? Math.round((count / contracts.length) * 100) : 0);
  const kpis: Array<{ label: string; value: string; note: string; tint: string; icon: LucideIcon; iconTint: string }> = [
    { label: 'Awarded Contracts', value: String(contracts.length), note: `This Year: ${contracts.filter((item) => (item.award.awardDate || '').startsWith(String(thisYear))).length}`, tint: 'bg-[#eef5ff]', icon: Trophy, iconTint: 'bg-blue-100 text-blue-600' },
    { label: 'Total Contract Value', value: compactNaira(value), note: `This Year: ${compactNaira(yearValue)}`, tint: 'bg-[#eefbf3]', icon: CircleDollarSign, iconTint: 'bg-emerald-100 text-emerald-600' },
    { label: 'Active Contracts', value: String(active.length), note: `${share(active.length)}% of total`, tint: 'bg-[#fff8eb]', icon: Clock3, iconTint: 'bg-amber-100 text-amber-600' },
    { label: 'Completed Contracts', value: String(completed.length), note: `${share(completed.length)}% of total`, tint: 'bg-[#eefbf3]', icon: CheckCircle2, iconTint: 'bg-emerald-100 text-emerald-600' },
    { label: 'Contracts Expiring Soon', value: String(expiring.length), note: 'Within 3 months', tint: 'bg-[#fff1f2]', icon: CalendarClock, iconTint: 'bg-rose-100 text-rose-500' },
  ];
  const exportRows = () => downloadCsv('awards.csv', ['Contract', 'Client', 'Reference', 'Value', 'Status'], filtered.map((item) => [item.opportunity?.title || '', item.opportunity?.clientName || '', item.award.contractRef, plainNaira(item.award.awardedValue), item.status]));

  return (
    <div className="space-y-3">
      <div className="text-[12px] text-slate-400">Tender Management <span className="px-1">›</span> <span className="font-semibold text-slate-600">Awards & Contracts</span></div>
      <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#2563eb] text-white shadow-sm"><Trophy className="h-6 w-6" /></span>
            <div>
              <h1 className="text-[22px] font-black tracking-tight text-slate-950">Awards & Contracts</h1>
              <p className="text-[12px] text-slate-500">Manage awarded tenders, contracts, variations and contract delivery</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex h-11 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-[12px] shadow-sm">
              <span className="text-emerald-700/70">Award Status</span>
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="bg-transparent font-bold text-emerald-700 outline-none">
                {['Active Contracts', 'Completed', 'Closed', 'All'].map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <div className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 shadow-sm">
              <CircleDollarSign className="h-4 w-4 text-slate-400" />
              <span>
                <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Total Contract Value</span>
                <span className="text-[12px] font-black text-slate-800">{compactNaira(value)}</span>
              </span>
            </div>
            <div className="relative">
              <button type="button" onClick={() => setActionsOpen((open) => !open)} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#2563eb] px-4 text-sm font-bold text-white shadow-sm">Actions <ChevronDown className="h-4 w-4" /></button>
              {actionsOpen ? (
                <div className="absolute right-0 top-12 z-20 w-44 rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-lg">
                  <button type="button" className="block w-full px-3 py-2 text-left hover:bg-slate-50" onClick={() => { setAdding(true); setActionsOpen(false); }}>Add contract</button>
                  <button type="button" className="block w-full px-3 py-2 text-left hover:bg-slate-50" onClick={() => { exportRows(); setActionsOpen(false); }}>Export</button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>
      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      <div className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white px-2 shadow-sm">
        {TABS.map((item) => {
          const Icon = item.icon;
          const selected = tab === item.id;
          return <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-3 text-[13px] font-semibold ${selected ? 'border-[#2563eb] text-[#2563eb]' : 'border-transparent text-slate-500'}`}><Icon className="h-3.5 w-3.5" />{item.id}</button>;
        })}
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {kpis.map((item) => {
          const Icon = item.icon;
          return (
            <article key={item.label} className={`rounded-2xl border border-slate-200 px-3 py-3 shadow-sm ${item.tint}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[11px] font-semibold text-slate-500">{item.label}</div>
                  <div className="mt-1 text-[22px] font-black leading-none text-slate-950">{item.value}</div>
                  <div className="mt-2 text-[11px] text-slate-400">{item.note}</div>
                </div>
                <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${item.iconTint}`}><Icon className="h-4 w-4" /></span>
              </div>
            </article>
          );
        })}
      </div>
      {adding ? (
        <Panel title="Add Contract">
          <div className="grid gap-2 md:grid-cols-4">
            <select value={form.id} onChange={(event) => setForm({ ...form, id: event.target.value })} className="h-10 rounded-lg border border-slate-200 px-2 text-sm"><option value="">Opportunity</option>{rows.map((row) => <option key={row.id} value={row.id}>{row.referenceNo}</option>)}</select>
            <input value={form.contractRef} onChange={(event) => setForm({ ...form, contractRef: event.target.value })} placeholder="Contract reference" className="h-10 rounded-lg border border-slate-200 px-3 text-sm" />
            <input value={form.awardedValue} onChange={(event) => setForm({ ...form, awardedValue: event.target.value })} placeholder="Awarded value" className="h-10 rounded-lg border border-slate-200 px-3 text-sm" />
            <input type="date" value={form.awardDate} onChange={(event) => setForm({ ...form, awardDate: event.target.value })} className="h-10 rounded-lg border border-slate-200 px-2 text-sm" />
          </div>
          <button type="button" onClick={saveAward} className="mt-3 rounded-lg bg-[#2563eb] px-4 py-2 text-sm font-bold text-white">Save award</button>
        </Panel>
      ) : null}
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.4fr)_360px]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <h2 className="text-sm font-black">Awarded Contracts</h2>
            <div className="flex gap-2">
              <button type="button" onClick={() => setAdding(true)} className="inline-flex h-9 items-center gap-1 rounded-lg bg-[#2563eb] px-3 text-[12px] font-bold text-white"><Plus className="h-3.5 w-3.5" /> Add Contract</button>
              <button type="button" onClick={() => downloadCsv('awards.csv', ['Title', 'Client', 'Reference', 'Value', 'Status'], filtered.map((item) => [item.opportunity?.title || '', item.opportunity?.clientName || '', item.award.contractRef, plainNaira(item.award.awardedValue), item.status]))} className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-3 text-[12px] font-bold"><Download className="h-3.5 w-3.5" /> Export</button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 px-4 pb-3">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search contracts..." className="h-9 min-w-[180px] flex-1 rounded-lg border border-slate-200 px-3 text-[12px]" />
            <select value={client} onChange={(event) => setClient(event.target.value)} className="h-9 rounded-lg border border-slate-200 px-2 text-[12px]"><option>All Clients</option>{Array.from(new Set(rows.map((row) => row.clientName).filter(Boolean))).map((name) => <option key={name}>{name}</option>)}</select>
            <select value={tableStatus} onChange={(event) => setTableStatus(event.target.value)} className="h-9 rounded-lg border border-slate-200 px-2 text-[12px]"><option>All Status</option>{STATUSES.map((item) => <option key={item}>{item}</option>)}</select>
            <select value={year} onChange={(event) => setYear(event.target.value)} className="h-9 rounded-lg border border-slate-200 px-2 text-[12px]"><option>All Years</option>{Array.from(new Set(awards.map((award) => (award.awardDate || '').slice(0, 4)).filter(Boolean))).map((item) => <option key={item}>{item}</option>)}</select>
            <select value={range} onChange={(event) => setRange(event.target.value)} className="h-9 rounded-lg border border-slate-200 px-2 text-[12px]"><option>All Dates</option><option>This Year</option><option>Last 90 Days</option></select>
            <button type="button" onClick={() => { setClient('All Clients'); setTableStatus('All Status'); setYear('All Years'); setRange('All Dates'); setSearch(''); }} className="h-9 rounded-lg border border-slate-200 px-3 text-[12px] font-semibold">Reset</button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[860px] w-full text-left text-[12px]">
              <thead className="bg-[#f8fafc] text-[11px] uppercase text-slate-400"><tr>{['#', 'Contract Title', 'Client', 'Reference No.', 'Award Date', 'Contract Value', 'Duration', 'Status', 'Action'].map((heading) => <th key={heading} className="px-3 py-2 font-semibold">{heading}</th>)}</tr></thead>
              <tbody>
                {pageRows.length === 0 ? <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-500">No awarded contracts yet.</td></tr> : pageRows.map((item, index) => (
                  <tr key={item.award.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">{(page - 1) * pageSize + index + 1}</td>
                    <td className="px-3 py-2 font-semibold"><Link href={`/commercial/tenders/workspace?id=${item.award.opportunityId}`} className="hover:text-blue-700">{item.opportunity?.title || item.award.contractRef}</Link></td>
                    <td className="px-3 py-2">{item.opportunity?.clientName || '—'}</td>
                    <td className="px-3 py-2">{item.award.contractRef}</td>
                    <td className="px-3 py-2">{formatWhen(item.award.awardDate)}</td>
                    <td className="px-3 py-2">₦ {plainNaira(item.award.awardedValue)}</td>
                    <td className="px-3 py-2">{item.opportunity?.contractDuration ? `${item.opportunity.contractDuration} ${item.opportunity.durationUnit || 'Months'}` : '—'}</td>
                    <td className="px-3 py-2"><Pill className={item.status === 'Active' ? 'bg-emerald-50 text-emerald-700' : item.status === 'Completed' ? 'bg-teal-50 text-teal-700' : item.status === 'Closed' ? 'bg-slate-100 text-slate-500' : 'bg-amber-50 text-amber-700'}>{item.status}</Pill></td>
                    <td className="px-3 py-2"><Link href={`/commercial/tenders/awards?id=${item.award.opportunityId}`} className="font-semibold text-blue-700">View</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={Math.min(page, pageCount)} pageCount={pageCount} pageSize={pageSize} total={filtered.length} onPage={setPage} onPageSize={setPageSize} />
        </section>
        <div className="space-y-3">
          <Panel title="Contract Value by Status">
            <Donut slices={slices} center={compactNaira(value)} caption="Total" />
          </Panel>
          <Panel title="Contract Expiry Alerts" action={<span className="text-[12px] font-semibold text-blue-700">View All →</span>}>
            {expiring.length === 0 ? <p className="py-4 text-center text-sm text-slate-500">No contracts expire in the next three months.</p> : expiring.map((item) => (
              <div key={item.award.id} className="mb-2 flex items-start gap-2 text-[12px]">
                <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <div className="min-w-0 flex-1"><div className="font-semibold text-slate-800">{item.opportunity?.title || item.award.contractRef}</div><div className="text-slate-400">Expires in {daysUntil(item.expiry)} days</div></div>
                <div className="text-right text-slate-500">{formatWhen(item.expiry)}<div>{item.opportunity?.clientName || '—'}</div></div>
              </div>
            ))}
          </Panel>
        </div>
      </div>
      <div className="grid gap-3 xl:grid-cols-3">
        <Panel title="Contract Milestones" action={<button type="button" onClick={() => setTab('Milestones & Deliverables')} className="text-[12px] font-semibold text-blue-700">View All →</button>}>
          <table className="w-full text-left text-[12px]">
            <thead className="text-[11px] text-slate-400"><tr>{['#', 'Contract Title', 'Milestone', 'Due Date', 'Status'].map((heading) => <th key={heading} className="pb-2 font-semibold">{heading}</th>)}</tr></thead>
            <tbody>{milestones.length === 0 ? <tr><td colSpan={5} className="py-6 text-center text-slate-500">No milestones have been logged.</td></tr> : milestones.map((item, index) => <tr key={item.id} className="border-t border-slate-100"><td className="py-2 text-slate-400">{index + 1}</td><td className="py-2">{rows.find((row) => row.id === item.opportunityId)?.title || '—'}</td><td className="py-2 font-semibold">{item.title}</td><td className="py-2">{formatWhen(item.dueAt)}</td><td className="py-2"><Pill className="bg-blue-50 text-blue-700">{item.status || '—'}</Pill></td></tr>)}</tbody>
          </table>
        </Panel>
        <Panel title="Recent Contract Activities" action={<button type="button" onClick={() => setTab('Close Out')} className="text-[12px] font-semibold text-blue-700">View All →</button>}>
          {activities.length === 0 ? <p className="py-4 text-center text-sm text-slate-500">No contract activity yet.</p> : activities.map((event) => (
            <div key={event.id} className="flex gap-2 border-t border-slate-100 py-2 text-[12px] first:border-0"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-500" /><div><div className="font-semibold text-slate-800">{event.details || event.action}</div><div className="text-slate-400">{event.actor || '—'} · {formatWhen(event.createdAt)}</div></div></div>
          ))}
        </Panel>
        <Panel title="Contract Performance (Time vs Value)">
          <div className="mb-2 flex gap-3 text-[11px] text-slate-500"><span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-blue-400" /> Actual Value</span><span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-amber-400" /> Planned Value</span></div>
          <svg viewBox="0 0 320 150" className="h-40 w-full">
            {trend.map((amount, index) => <rect key={months[index]} x={28 + index * 48} y={118 - (amount / maxTrend) * 90} width="16" height={(amount / maxTrend) * 90} rx="2" fill="#60a5fa" />)}
            <path d={trend.map((_, index) => `${index ? 'L' : 'M'}${36 + index * 48},118`).join(' ')} fill="none" stroke="#f59e0b" strokeWidth="2" />
            {months.map((month, index) => <text key={month} x={36 + index * 48} y="140" textAnchor="middle" fontSize="9" fill="#94a3b8">{month}</text>)}
          </svg>
          <p className="text-[11px] text-slate-400">Actual bars are awarded value by month. Planned value is not stored, so that line stays at zero.</p>
        </Panel>
      </div>
    </div>
  );
}

function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-[14px] font-black text-slate-900">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
