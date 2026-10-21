'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  ArrowDownRight,
  ArrowDownToLine,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Mail,
  Plus,
  Search,
  Send,
} from 'lucide-react';
import { Cell, Pie, PieChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AttachmentViewer } from './front-desk/_components/AttachmentViewer';
import { CorrespondenceForm } from './front-desk/_components/CorrespondenceForm';
import { DepartmentRouting } from './front-desk/_components/DepartmentRouting';
import { Modal } from './front-desk/_components/ui';
import { CORRESPONDENCE_TYPES, SENDER_CATEGORIES, type Correspondence } from '@/lib/corporate-office/front-desk-types';
import { displayStatus, formatDate, unfinishedDepartmentRoutes } from '@/lib/corporate-office/front-desk-format';

type TabKey = 'all' | 'incoming' | 'outgoing' | 'assigned' | 'pending' | 'overdue' | 'closed';
type Row = {
  id: string;
  referenceNo: string;
  date: string;
  party: string;
  subject: string;
  department: string;
  status: string;
  priority: string;
  dueDate: string;
};
type PendingItem = { id: string; referenceNo: string; subject: string; dueDate: string; priority: string; status: string };
type Overview = {
  kpis: Record<'total' | 'incoming' | 'outgoing' | 'pending' | 'overdue', { total: number; change: number }>;
  tabs: Record<TabKey, number>;
  trend: Array<{ name: string; incoming: number; outgoing: number }>;
  departments: Array<{ name: string; count: number; percent: number }>;
  departmentTotal: number;
  rows: Row[];
  page: number;
  pageSize: number;
  total: number;
  pages: number;
  pending: PendingItem[];
  departmentsOptions: string[];
  access?: 'full' | 'participant';
};

const TABS: { id: TabKey; label: string }[] = [
  { id: 'all', label: 'All Correspondence' },
  { id: 'incoming', label: 'Incoming' },
  { id: 'outgoing', label: 'Outgoing' },
  { id: 'assigned', label: 'Assigned to Me' },
  { id: 'pending', label: 'Pending Actions' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'closed', label: 'Closed' },
];
const PAGE_SIZES = [10, 25, 50, 100, 250];
const COLORS = ['#3b82f6', '#22c55e', '#8b5cf6', '#f59e0b', '#06b6d4', '#ec4899', '#64748b', '#94a3b8'];
const STATUS_CLASS: Record<string, string> = {
  New: 'bg-blue-50 text-blue-600',
  Assigned: 'bg-violet-50 text-violet-600',
  'In Progress': 'bg-amber-50 text-amber-700',
  Overdue: 'bg-rose-50 text-rose-600',
  Closed: 'bg-emerald-50 text-emerald-700',
};
const PRIORITY_CLASS: Record<string, string> = {
  High: 'text-rose-600',
  Medium: 'text-amber-600',
  Low: 'text-emerald-600',
};

const countLabel = (value: number) => value.toLocaleString('en-GB');

function Delta({ value, caption }: { value: number; caption: string }) {
  const up = value >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <p className={`mt-3 flex items-center gap-1 text-xs font-semibold ${up ? 'text-emerald-600' : 'text-rose-500'}`}>
      <Icon className="h-3.5 w-3.5" />
      {Math.abs(value)}%
      <span className="font-medium text-slate-400">{caption}</span>
    </p>
  );
}

function StatusPill({ status }: { status: string }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_CLASS[status] || 'bg-slate-100 text-slate-600'}`}>{status}</span>;
}

export function CorporateOfficeOverview() {
  const [tab, setTab] = useState<TabKey>('all');
  const [searchInput, setSearchInput] = useState('');
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [department, setDepartment] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
  const [departmentRange, setDepartmentRange] = useState<'month' | 'year'>('month');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sort, setSort] = useState('date');
  const [direction, setDirection] = useState<'asc' | 'desc'>('desc');
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [detail, setDetail] = useState<Correspondence | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [cardList, setCardList] = useState<{ title: string; description: string; rows: Row[]; loading: boolean } | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const timer = window.setTimeout(() => setQ(searchInput.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (searchParams.get('log') !== '1') return;
    setLogOpen(true);
    const params = new URLSearchParams(searchParams.toString());
    params.delete('log');
    const next = params.toString();
    router.replace(next ? `/corporate-office?${next}` : '/corporate-office', { scroll: false });
  }, [router, searchParams]);

  const query = useMemo(() => {
    const params = new URLSearchParams({
      resource: 'overview',
      tab,
      q,
      category,
      department,
      type,
      status,
      from,
      to,
      year: String(year),
      departmentRange,
      page: String(page),
      pageSize: String(pageSize),
      sort,
      direction,
    });
    return params.toString();
  }, [tab, q, category, department, type, status, from, to, year, departmentRange, page, pageSize, sort, direction]);

  const load = () => {
    setLoading(true);
    return fetch(`/api/corporate-office/front-desk?${query}`, { cache: 'no-store', credentials: 'same-origin' })
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || 'Could not load the Corporate Office overview.');
        setData(json.data as Overview);
        setError('');
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Could not load the Corporate Office overview.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/corporate-office/front-desk?${query}`, { cache: 'no-store', credentials: 'same-origin' })
      .then(async (response) => {
        const json = await response.json();
        if (!active) return;
        if (!response.ok) throw new Error(json.error || 'Could not load the Corporate Office overview.');
        setData(json.data as Overview);
        setError('');
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Could not load the Corporate Office overview.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [query]);

  const openCard = (title: string, description: string, params: { tab: TabKey; department?: string }) => {
    setCardList({ title, description, rows: [], loading: true });
    const search = new URLSearchParams({
      resource: 'overview',
      tab: params.tab,
      page: '1',
      pageSize: '100',
      year: String(year),
      departmentRange,
      department: params.department || '',
    });
    fetch(`/api/corporate-office/front-desk?${search}`, { cache: 'no-store', credentials: 'same-origin' })
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || 'Could not load these correspondence records.');
        setCardList({ title, description, rows: (json.data?.rows || []) as Row[], loading: false });
      })
      .catch((cardError) => {
        setCardList(null);
        setError(cardError instanceof Error ? cardError.message : 'Could not load these correspondence records.');
      });
  };

  const openItem = async (id: string) => {
    const response = await fetch(`/api/corporate-office/front-desk?resource=item&id=${encodeURIComponent(id)}`, { cache: 'no-store', credentials: 'same-origin' });
    const json = await response.json();
    if (!response.ok) throw new Error(json.error || 'Could not open this correspondence.');
    setDetail(json.data as Correspondence);
    setNote('');
  };

  const act = async (action: string, id: string, extra: Record<string, unknown> = {}) => {
    setBusy(true);
    try {
      const response = await fetch('/api/corporate-office/front-desk', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, id, ...extra }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'The action could not be completed.');
      setDetail(json.data as Correspondence);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const toggleSort = (key: string) => {
    setPage(1);
    if (sort === key) setDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
    else {
      setSort(key);
      setDirection('asc');
    }
  };

  const clearFilters = () => {
    setSearchInput('');
    setQ('');
    setCategory('');
    setDepartment('');
    setType('');
    setStatus('');
    setFrom('');
    setTo('');
    setPage(1);
  };

  const kpis = data?.kpis;
  const rows = data?.rows || [];
  const visibleIds = rows.map((row) => row.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));
  const years = Array.from({ length: 5 }, (_, index) => new Date().getFullYear() - index);
  const start = data && data.total ? (data.page - 1) * data.pageSize + 1 : 0;
  const end = data ? Math.min(data.page * data.pageSize, data.total) : 0;

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <section className="relative overflow-hidden rounded-2xl border border-sky-100 bg-[linear-gradient(90deg,#eef6ff_0%,#f7fbff_46%,#e7f3ff_100%)] shadow-sm">
        <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[46%] bg-[radial-gradient(circle_at_70%_40%,rgba(255,255,255,0.9),transparent_42%),linear-gradient(115deg,#dbeafe,#bfdbfe_55%,#e0f2fe)] lg:block" />
        <div className="pointer-events-none absolute bottom-0 right-[8%] hidden h-24 w-16 rounded-t-full bg-emerald-700/80 lg:block" />
        <div className="pointer-events-none absolute bottom-0 right-[18%] hidden h-16 w-12 rounded-t-full bg-emerald-600/70 lg:block" />
        <div className="relative flex flex-col gap-6 p-6 lg:flex-row lg:items-center lg:justify-between lg:p-8">
          <div className="max-w-2xl">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[#2f6fed] shadow-sm"><Mail className="h-5 w-5" /></span>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Corporate Office Workspace</p>
            </div>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-950">Corporate Office Portal</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
              Manage incoming and outgoing correspondence, route to the appropriate departments, track actions, and ensure timely follow-up.
            </p>
          </div>
          {data?.access === 'participant' ? null : (
            <button type="button" onClick={() => setLogOpen(true)} className="inline-flex h-11 items-center justify-center gap-2 self-start rounded-lg bg-[#2f6fed] px-4 text-sm font-semibold text-white shadow-sm hover:bg-[#245ed4] lg:self-center">
              <Plus className="h-4 w-4" />
              Log Correspondence
            </button>
          )}
        </div>
      </section>

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { key: 'total', title: 'Total Correspondence', icon: Mail, color: 'bg-blue-50 text-blue-600', caption: 'This Month', value: kpis?.total },
          { key: 'incoming', title: 'Incoming', icon: ArrowDownToLine, color: 'bg-emerald-50 text-emerald-600', caption: 'This Month', value: kpis?.incoming },
          { key: 'outgoing', title: 'Outgoing', icon: Send, color: 'bg-violet-50 text-violet-600', caption: 'This Month', value: kpis?.outgoing },
          { key: 'pending', title: 'Pending Actions', icon: Clock3, color: 'bg-orange-50 text-orange-500', caption: 'vs Last Month', value: kpis?.pending },
          { key: 'overdue', title: 'Overdue', icon: AlertCircle, color: 'bg-rose-50 text-rose-500', caption: 'vs Last Month', value: kpis?.overdue },
        ].map((card) => (
          <button
            key={card.key}
            type="button"
            onClick={() => openCard(card.title, `${countLabel(card.value?.total || 0)} records in this view.`, { tab: card.key === 'total' ? 'all' : card.key as TabKey })}
            className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-sky-200 hover:shadow"
          >
            <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${card.color}`}><card.icon className="h-5 w-5" /></span>
            <p className="mt-4 text-sm text-slate-500">{card.title}</p>
            <p className="mt-1 text-3xl font-bold tracking-tight text-slate-950">{loading && !data ? '—' : countLabel(card.value?.total || 0)}</p>
            <Delta value={card.value?.change || 0} caption={card.caption} />
          </button>
        ))}
      </section>

      <div className="flex gap-6 overflow-x-auto border-b border-slate-200">
        {TABS.map((item) => {
          const active = tab === item.id;
          const count = data?.tabs[item.id] || 0;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => { setTab(item.id); setPage(1); }}
              className={`whitespace-nowrap border-b-2 pb-3 text-sm ${active ? 'border-[#2f6fed] font-semibold text-[#2f6fed]' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
            >
              {item.label} <span className={item.id === 'overdue' ? 'text-rose-500' : ''}>({countLabel(count)})</span>
            </button>
          );
        })}
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-[1.4fr_repeat(5,minmax(0,0.8fr))]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={searchInput} onChange={(event) => { setSearchInput(event.target.value); setPage(1); }} placeholder="Search reference, subject, sender, department..." className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none focus:border-sky-400 focus:bg-white" />
          </div>
          <select value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="">All Categories</option>{SENDER_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select>
          <select value={department} onChange={(event) => { setDepartment(event.target.value); setPage(1); }} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="">All Departments</option>{(data?.departmentsOptions || []).map((item) => <option key={item}>{item}</option>)}</select>
          <select value={type} onChange={(event) => { setType(event.target.value); setPage(1); }} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="">All Types</option>{CORRESPONDENCE_TYPES.map((item) => <option key={item}>{item}</option>)}</select>
          <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="">All Statuses</option>{['New', 'Assigned', 'In Progress', 'Overdue', 'Closed'].map((item) => <option key={item}>{item}</option>)}</select>
          <div className="flex gap-2">
            <input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} aria-label="From date" className="h-10 min-w-0 flex-1 rounded-lg border border-slate-200 px-2 text-sm" />
            <input type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} aria-label="To date" className="h-10 min-w-0 flex-1 rounded-lg border border-slate-200 px-2 text-sm" />
            <button type="button" onClick={clearFilters} className="h-10 rounded-lg px-3 text-sm font-medium text-slate-500 hover:bg-slate-50">Clear</button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.35fr_0.85fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900"><BarChart3 className="h-4 w-4 text-slate-400" />Correspondence Trend</h2>
            <select value={year} onChange={(event) => setYear(Number(event.target.value))} className="h-9 rounded-lg border border-slate-200 px-2 text-sm">{years.map((item) => <option key={item} value={item}>{item === new Date().getFullYear() ? 'This Year' : item}</option>)}</select>
          </div>
          <div className="mb-2 flex justify-end gap-4 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#3b82f6]" />Incoming</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#a78bfa]" />Outgoing</span>
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={data?.trend || []}>
              <CartesianGrid vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} width={28} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <Tooltip />
              <Bar dataKey="incoming" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={14} />
              <Bar dataKey="outgoing" fill="#a78bfa" radius={[4, 4, 0, 0]} barSize={14} />
            </BarChart>
          </ResponsiveContainer>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">Correspondence by Department</h2>
            <select value={departmentRange} onChange={(event) => setDepartmentRange(event.target.value as 'month' | 'year')} className="h-9 rounded-lg border border-slate-200 px-2 text-sm">
              <option value="month">This Month</option>
              <option value="year">This Year</option>
            </select>
          </div>
          <div className="grid items-center gap-2 sm:grid-cols-[180px_1fr]">
            <div className="relative h-[210px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data?.departments.length ? data.departments : [{ name: 'None', count: 1 }]} dataKey="count" nameKey="name" innerRadius={62} outerRadius={82} stroke="none">
                    {(data?.departments.length ? data.departments : [{ name: 'None' }]).map((entry, index) => <Cell key={entry.name} fill={data?.departments.length ? COLORS[index % COLORS.length] : '#e2e8f0'} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-2xl font-bold text-slate-950">{countLabel(data?.departmentTotal || 0)}</div>
                <div className="text-xs text-slate-400">Total</div>
              </div>
            </div>
            <ul className="space-y-2">
              {(data?.departments || []).map((item, index) => (
                <li key={item.name}>
                  <button
                    type="button"
                    onClick={() => {
                      setDepartment(item.name);
                      setTab('all');
                      setPage(1);
                      openCard(item.name, `${item.count} correspondence record${item.count === 1 ? '' : 's'} for this department.`, { tab: 'all', department: item.name });
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-lg px-1 py-1 text-left text-sm hover:bg-slate-50"
                  >
                    <span className="flex min-w-0 items-center gap-2 text-slate-600"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COLORS[index % COLORS.length] }} /><span className="truncate">{item.name}</span></span>
                    <span className="shrink-0 tabular-nums text-slate-500">{item.percent}%</span>
                  </button>
                </li>
              ))}
              {!data?.departments.length ? <li className="text-sm text-slate-400">No correspondence in this period.</li> : null}
            </ul>
          </div>
        </article>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.45fr_0.75fr]">
        <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between px-5 py-4">
            <h2 className="text-base font-semibold text-slate-900">Recent Correspondence</h2>
            <button type="button" onClick={() => { setTab('all'); setPage(1); }} className="text-sm font-medium text-[#2f6fed]">View All</button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-3"><input type="checkbox" checked={allVisibleSelected} onChange={(event) => setSelected(event.target.checked ? [...new Set([...selected, ...visibleIds])] : selected.filter((id) => !visibleIds.includes(id)))} aria-label="Select page" /></th>
                  {[
                    ['reference', 'Ref No.'],
                    ['date', 'Date Received'],
                    ['sender', 'Sender'],
                    ['subject', 'Subject'],
                    ['department', 'Department'],
                    ['status', 'Status'],
                  ].map(([key, label]) => (
                    <th key={key} className="px-3 py-3"><button type="button" onClick={() => toggleSort(key)} className="font-semibold">{label}</button></th>
                  ))}
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="px-4 py-3"><input type="checkbox" checked={selected.includes(row.id)} onChange={(event) => setSelected(event.target.checked ? [...selected, row.id] : selected.filter((id) => id !== row.id))} aria-label={`Select ${row.referenceNo}`} /></td>
                    <td className="px-3 py-3 font-medium text-[#2f6fed]">{row.referenceNo}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-600">{formatDate(row.date)}</td>
                    <td className="px-3 py-3 text-slate-700">{row.party}</td>
                    <td className="max-w-[220px] truncate px-3 py-3 text-slate-700">{row.subject}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-600">{row.department}</td>
                    <td className="px-3 py-3"><StatusPill status={row.status} /></td>
                    <td className="px-4 py-3 text-right"><button type="button" onClick={() => openItem(row.id).catch((openError) => setError(openError instanceof Error ? openError.message : 'Could not open this correspondence.'))} className="font-medium text-[#2f6fed]">View</button></td>
                  </tr>
                ))}
                {!loading && rows.length === 0 ? <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-400">No correspondence matches this view.</td></tr> : null}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 text-sm text-slate-500">
            <span>Showing {start} to {end} of {countLabel(data?.total || 0)} records</span>
            <div className="flex items-center gap-1">
              <button type="button" disabled={!data || data.page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="rounded-lg border border-slate-200 p-1.5 disabled:opacity-40" aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></button>
              {Array.from({ length: Math.min(data?.pages || 1, 5) }, (_, index) => index + 1).map((value) => (
                <button key={value} type="button" onClick={() => setPage(value)} className={`h-8 w-8 rounded-lg text-xs font-semibold ${value === data?.page ? 'bg-[#2f6fed] text-white' : 'border border-slate-200 text-slate-600'}`}>{value}</button>
              ))}
              <button type="button" disabled={!data || data.page >= data.pages} onClick={() => setPage((current) => current + 1)} className="rounded-lg border border-slate-200 p-1.5 disabled:opacity-40" aria-label="Next page"><ChevronRight className="h-4 w-4" /></button>
              <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} className="ml-2 h-8 rounded-lg border border-slate-200 px-2 text-xs" aria-label="Rows per page">
                {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
            </div>
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">My Pending Actions</h2>
            <button type="button" onClick={() => { setTab('assigned'); setPage(1); }} className="text-sm font-medium text-[#2f6fed]">View All</button>
          </div>
          <ul className="space-y-3">
            {(data?.pending || []).map((item) => (
              <li key={item.id}>
                <button type="button" onClick={() => openItem(item.id).catch(() => undefined)} className="flex w-full items-start justify-between gap-3 rounded-xl border border-slate-100 px-3 py-3 text-left hover:bg-slate-50">
                  <span>
                    <span className="block text-sm font-medium text-slate-800">{item.subject}</span>
                    <span className="mt-1 block text-xs text-slate-400">{item.referenceNo}</span>
                  </span>
                  <span className="text-right">
                    <span className="block text-xs text-slate-400">{item.dueDate ? formatDate(item.dueDate) : 'No deadline'}</span>
                    <span className={`mt-1 block text-xs font-semibold ${PRIORITY_CLASS[item.priority] || 'text-slate-500'}`}>{item.priority}</span>
                  </span>
                </button>
              </li>
            ))}
            {!loading && !(data?.pending || []).length ? <li className="py-8 text-center text-sm text-slate-400">No actions are assigned to you.</li> : null}
          </ul>
        </article>
      </section>

      <Modal isOpen={!!cardList} onClose={() => setCardList(null)} title={cardList?.title || 'Correspondence'} size="lg">
        {cardList ? (
          <>
            <p className="mb-4 -mt-2 text-sm text-slate-500">{cardList.description}</p>
            {cardList.loading ? <p className="py-10 text-center text-sm text-slate-400">Loading correspondence…</p> : cardList.rows.length === 0 ? <p className="py-10 text-center text-sm text-slate-400">Nothing in this view.</p> : (
              <ul className="max-h-[60vh] space-y-2 overflow-y-auto">
                {cardList.rows.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => { setCardList(null); openItem(row.id).catch((openError) => setError(openError instanceof Error ? openError.message : 'Could not open this correspondence.')); }}
                      className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-3 text-left hover:bg-slate-50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-slate-800">{row.subject}</span>
                        <span className="mt-1 block text-xs text-slate-400">{row.referenceNo} · {row.department || '—'} · {row.party}</span>
                      </span>
                      <span className="shrink-0 text-right">
                        <StatusPill status={row.status} />
                        <span className="mt-1 block text-xs text-slate-400">{row.dueDate ? formatDate(row.dueDate) : formatDate(row.date)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : null}
      </Modal>

      <Modal isOpen={logOpen} onClose={() => setLogOpen(false)} title="Log Correspondence" size="lg">
        <CorrespondenceForm
          onCancel={() => setLogOpen(false)}
          submitLabel="Log Correspondence"
          onSave={async (data, files) => {
            const form = new FormData();
            form.set('action', 'create');
            form.set('payload', JSON.stringify({ data }));
            for (const [id, file] of Object.entries(files)) form.append('files', file, `${id}::${file.name}`);
            const response = await fetch('/api/corporate-office/front-desk', { method: 'POST', credentials: 'same-origin', body: form });
            const json = await response.json();
            if (!response.ok) throw new Error(json.error || 'Could not log this correspondence.');
            setLogOpen(false);
            setNotice(`${json.data?.referenceNo || 'Correspondence'} logged`);
            await load();
          }}
        />
      </Modal>

      {detail ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-xs text-slate-400">{detail.referenceNo}</p>
                <h3 className="mt-1 text-xl font-semibold text-slate-950">{detail.subject}</h3>
              </div>
              <button type="button" onClick={() => setDetail(null)} className="text-sm text-slate-500">Close</button>
            </div>
            <div className="mt-4"><StatusPill status={displayStatus(detail)} /></div>
            <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
              {[
                ['Direction', detail.direction],
                ['Date', formatDate(detail.dateSent || detail.dateReceived)],
                ['Party', detail.senderCompany],
                ['Category', detail.senderCategory],
                ['Lead department', detail.department],
                ['Location', detail.location || '—'],
                ['Type', detail.type],
                ['Priority', detail.priority],
                ['Assigned', detail.assignedEmployeeName || '—'],
                ['Due', detail.dueDate ? formatDate(detail.dueDate) : '—'],
                ['Description', detail.description],
              ].map(([label, value]) => (
                <div key={label} className={label === 'Description' ? 'sm:col-span-2' : ''}>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
                  <dd className="mt-1 text-slate-800">{value}</dd>
                </div>
              ))}
            </dl>
            <DepartmentRouting item={detail} onUpdated={(next) => { setDetail(next); load().catch(() => undefined); }} />
            <div className="mt-6">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Routing history</h4>
              <ol className="mt-2 space-y-2">
                {detail.history.map((event) => (
                  <li key={event.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                    <span className="font-medium text-slate-800">{event.action}</span>
                    <span className="text-slate-500"> · {event.actor}</span>
                    {event.detail ? <span className="block text-slate-600">{event.detail}</span> : null}
                  </li>
                ))}
                {!detail.history.length ? <li className="text-sm text-slate-400">No routing history yet.</li> : null}
              </ol>
            </div>
            <div className="mt-6">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Documents</h4>
              <AttachmentViewer attachments={detail.attachments} />
            </div>
            {detail.status === 'Open' ? (
              <div className="mt-6 space-y-3 border-t border-slate-100 pt-4">
                <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} placeholder="Response or acknowledgement note" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                <div className="flex flex-wrap justify-end gap-2">
                  <button type="button" disabled={busy} onClick={() => act('acknowledge', detail.id).catch((actionError: unknown) => setError(actionError instanceof Error ? actionError.message : 'The action could not be completed.'))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">Acknowledge</button>
                  <button type="button" disabled={busy} onClick={() => act('progress', detail.id).catch((actionError: unknown) => setError(actionError instanceof Error ? actionError.message : 'The action could not be completed.'))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">In Progress</button>
                  <button type="button" disabled={busy || !note.trim()} onClick={() => act('respond', detail.id, { note }).catch((actionError: unknown) => setError(actionError instanceof Error ? actionError.message : 'The action could not be completed.'))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">Respond</button>
                  {unfinishedDepartmentRoutes(detail.routes || []).length ? (
                    <p className="mr-auto text-xs text-amber-700">Close stays unavailable until {unfinishedDepartmentRoutes(detail.routes || []).map((route) => route.department).join(', ')} is completed or waived.</p>
                  ) : (
                    <button type="button" disabled={busy} onClick={() => act('close', detail.id).then(() => undefined).catch((actionError: unknown) => setError(actionError instanceof Error ? actionError.message : 'The action could not be completed.'))} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white"><CheckCircle2 className="h-4 w-4" />Close</button>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
                <button type="button" disabled={busy} onClick={() => act('archive', detail.id).catch((actionError: unknown) => setError(actionError instanceof Error ? actionError.message : 'The action could not be completed.'))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">Archive</button>
                <button type="button" disabled={busy || !note.trim()} onClick={() => act('reopen', detail.id, { reason: note }).catch((actionError: unknown) => setError(actionError instanceof Error ? actionError.message : 'The action could not be completed.'))} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white">Reopen</button>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
