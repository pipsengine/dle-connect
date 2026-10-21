'use client';

import {
  AlarmClock,
  CalendarClock,
  CalendarX2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit2,
  Flame,
  FolderOpen,
  Inbox,
  Lock,
  Mail,
  Paperclip,
  PlusCircle,
  Printer,
  Search,
  Timer,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AttachmentViewer } from './_components/AttachmentViewer';
import { CorrespondenceForm } from './_components/CorrespondenceForm';
import { DepartmentRouting } from './_components/DepartmentRouting';
import {
  ConfirmDeleteModal,
  EmptyState,
  KPICard,
  KPICardSkeleton,
  LoadingState,
  Modal,
  PageHeader,
  ToastStack,
  useToasts,
} from './_components/ui';
import { exportCsv, printRegister } from './_lib/export';
import { useCorrespondenceStore, useCurrentUser } from './_lib/useCorrespondenceStore';
import { CLOSE_SLA_DAYS, addDaysISO, daysBetween, describeDue, formatDate, isOverdue, isPastDeadline, todayISO, unfinishedDepartmentRoutes } from '@/lib/corporate-office/front-desk-format';
import { CORRESPONDENCE_TYPES, SENDER_CATEGORIES, type Correspondence } from '@/lib/corporate-office/front-desk-types';

const BAR_COLOR = '#2a78d6';
const GRID_LINE = '#e1e0d9';
const INK_SECONDARY = '#52514e';
const tooltipStyle = { fontSize: 13, borderRadius: 8, border: `1px solid ${GRID_LINE}` };
const PAGE_SIZES = [10, 25, 50, 100];
const DUE_SOON_DAYS = 7;

function pageNumbers(current: number, total: number): (number | null)[] {
  const pages = [...new Set([1, current - 1, current, current + 1, total])].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);
  return pages.flatMap((page, index) => (index > 0 && page - pages[index - 1] > 1 ? [null, page] : [page]));
}

const ChartCard = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <h2 className="mb-4 text-base font-semibold text-slate-900">{title}</h2>
    {children}
  </div>
);

const StatusPill = ({ item }: { item: Correspondence }) => {
  if (item.status === 'Closed') {
    return <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600"><Lock className="h-3 w-3" />Closed</span>;
  }
  if (isOverdue(item)) return <span className="rounded-full bg-red-50 px-2 py-1 text-xs font-medium text-red-700">Open · Overdue</span>;
  return <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">Open</span>;
};

const UrgentBadge = () => (
  <span className="inline-flex items-center gap-0.5 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700">
    <Flame className="h-3 w-3" />Urgent
  </span>
);

const DueText = ({ item, className = 'text-xs' }: { item: Correspondence; className?: string }) => {
  if (!item.dueDate) return <span className={`${className} text-slate-300`}>—</span>;
  const delta = daysBetween(todayISO(), item.dueDate);
  const tone = item.status === 'Closed' ? 'text-slate-400' : delta < 0 ? 'text-red-600 font-medium' : delta <= 2 ? 'text-amber-600 font-medium' : 'text-slate-500';
  return <span className={`${className} ${tone}`}>{describeDue(item)}</span>;
};

const byDueDate = (left: Correspondence, right: Correspondence) => (left.dueDate ?? '9999').localeCompare(right.dueDate ?? '9999');

function deadlineGroups(items: Correspondence[]) {
  const today = todayISO();
  const horizon = addDaysISO(today, DUE_SOON_DAYS);
  const open = items.filter((item) => item.status === 'Open');
  return {
    dueToday: open.filter((item) => item.dueDate === today),
    dueSoon: open.filter((item) => !!item.dueDate && item.dueDate > today && item.dueDate <= horizon).sort(byDueDate),
    pastDeadline: open.filter((item) => isPastDeadline(item)).sort(byDueDate),
    urgent: open.filter((item) => item.priority === 'High').sort(byDueDate),
  };
}

type CardKey = 'total' | 'open' | 'closed' | 'avg' | 'dueToday' | 'dueSoon' | 'pastDeadline' | 'urgent';

export function FrontDeskDashboard({ onCreate }: { onCreate?: () => void }) {
  const { items, isLoaded, error, reload, updateCorrespondence, closeCorrespondence, deleteCorrespondence, addCorrespondence } = useCorrespondenceStore();
  const { toasts, addToast, dismissToast } = useToasts();
  const currentUser = useCurrentUser();
  const [search, setSearch] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [departmentOptions, setDepartmentOptions] = useState<string[]>([]);
  useEffect(() => {
    fetch('/api/corporate-office/front-desk?resource=directories', { credentials: 'same-origin', cache: 'no-store' })
      .then((response) => response.json())
      .then((json) => {
        const next = Array.isArray(json.data?.departments) ? json.data.departments.filter((item: unknown) => typeof item === 'string' && item) : [];
        if (next.length) setDepartmentOptions(next);
      })
      .catch(() => undefined);
  }, []);
  const [filterCategory, setFilterCategory] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Correspondence | null>(null);
  const [closeTarget, setCloseTarget] = useState<Correspondence | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Correspondence | null>(null);
  const [viewing, setViewing] = useState<Correspondence | null>(null);
  const [activeCard, setActiveCard] = useState<CardKey | null>(null);
  const [busy, setBusy] = useState(false);

  const stats = useMemo(() => {
    const closed = items.filter((item) => item.status === 'Closed' && item.dateClosed);
    const avgDays = closed.length ? closed.reduce((sum, item) => sum + Math.max(0, daysBetween(item.dateReceived, item.dateClosed!)), 0) / closed.length : 0;
    const month = todayISO().slice(0, 7);
    const deadlines = deadlineGroups(items);
    return {
      dueToday: deadlines.dueToday.length,
      dueSoon: deadlines.dueSoon.length,
      pastDeadline: deadlines.pastDeadline.length,
      urgent: deadlines.urgent.length,
      total: items.length,
      thisMonth: items.filter((item) => item.dateReceived.startsWith(month)).length,
      open: items.filter((item) => item.status === 'Open').length,
      overdue: items.filter((item) => isOverdue(item)).length,
      closed: closed.length,
      avgDays,
    };
  }, [items]);

  const cardDetail = useMemo(() => {
    const closeDays = (item: Correspondence) => Math.max(0, daysBetween(item.dateReceived, item.dateClosed!));
    const byNewest = (left: Correspondence, right: Correspondence) => right.dateReceived.localeCompare(left.dateReceived);
    const closed = items.filter((item) => item.status === 'Closed' && item.dateClosed);
    switch (activeCard) {
      case 'total':
        return { title: 'All Logged Items', description: `${stats.total} items in the register, ${stats.thisMonth} received this month.`, rows: [...items].sort(byNewest), meta: (item: Correspondence) => formatDate(item.dateReceived) };
      case 'open':
        return { title: 'Open Items', description: `Logged items not yet closed. Items past their deadline, or open longer than ${CLOSE_SLA_DAYS} days with no deadline, are overdue.`, rows: items.filter((item) => item.status === 'Open').sort((left, right) => left.dateReceived.localeCompare(right.dateReceived)), meta: (item: Correspondence) => { const age = daysBetween(item.dateReceived, todayISO()); return age === 0 ? 'Received today' : `Open ${age} day${age === 1 ? '' : 's'}`; } };
      case 'closed':
        return { title: 'Closed Items', description: 'Items handed over and closed. Closed records are read-only.', rows: closed.sort(byNewest), meta: (item: Correspondence) => `${item.closedBy} · ${formatDate(item.dateClosed)}` };
      case 'avg':
        return { title: 'Time to Close', description: `Average ${stats.avgDays.toFixed(1)} days from receipt to closing.`, rows: closed.sort((left, right) => closeDays(right) - closeDays(left)), meta: (item: Correspondence) => { const days = closeDays(item); return days === 0 ? 'Same day' : `${days} day${days === 1 ? '' : 's'}`; } };
      case 'dueToday':
        return { title: 'Due Today', description: 'Open items whose response deadline is today.', rows: deadlineGroups(items).dueToday, meta: (item: Correspondence) => `${item.priority === 'High' ? 'Urgent · ' : ''}${item.department}` };
      case 'dueSoon':
        return { title: `Due in the Next ${DUE_SOON_DAYS} Days`, description: 'Open items with a deadline coming up.', rows: deadlineGroups(items).dueSoon, meta: (item: Correspondence) => `${describeDue(item)} · ${formatDate(item.dueDate)}` };
      case 'pastDeadline':
        return { title: 'Past Deadline', description: 'Open items whose response deadline has passed.', rows: deadlineGroups(items).pastDeadline, meta: (item: Correspondence) => `${describeDue(item)} · was due ${formatDate(item.dueDate)}` };
      case 'urgent':
        return { title: 'Urgent Open Items', description: 'Open items marked Urgent.', rows: deadlineGroups(items).urgent, meta: (item: Correspondence) => describeDue(item) || `Received ${formatDate(item.dateReceived)}` };
      default:
        return null;
    }
  }, [activeCard, items, stats]);

  const byCategory = useMemo(() => SENDER_CATEGORIES.map((name) => ({ name, count: items.filter((item) => item.senderCategory === name).length })), [items]);
  const byDepartment = useMemo(() => departmentOptions.map((name) => ({ name, count: items.filter((item) => item.department === name).length })).filter((row) => row.count > 0).sort((left, right) => right.count - left.count), [departmentOptions, items]);
  const monthly = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      return { name: date.toLocaleDateString('en-GB', { month: 'short' }), count: items.filter((item) => item.dateReceived.startsWith(key)).length };
    });
  }, [items]);
  const topSenders = useMemo(() => {
    const counts = new Map<string, number>();
    items.forEach((item) => counts.set(item.senderCompany, (counts.get(item.senderCompany) ?? 0) + 1));
    return [...counts.entries()].sort((left, right) => right[1] - left[1]).slice(0, 5);
  }, [items]);

  const filtered = useMemo(() => {
    const query = search.toLowerCase();
    return items.filter((item) => {
      const matchesSearch = !query || [item.referenceNo, item.description, item.senderCompany, item.senderCategory, item.addressedTo, item.closedBy ?? ''].some((value) => value.toLowerCase().includes(query));
      const matchesStatus = !filterStatus || (filterStatus === 'Overdue' ? isOverdue(item) : item.status === filterStatus);
      return matchesSearch && matchesStatus && (!filterDept || item.department === filterDept) && (!filterCategory || item.senderCategory === filterCategory) && (!filterType || item.type === filterType);
    }).sort((left, right) => right.dateReceived.localeCompare(left.dateReceived) || right.referenceNo.localeCompare(left.referenceNo));
  }, [items, search, filterDept, filterCategory, filterType, filterStatus]);

  const filterKey = [search, filterDept, filterCategory, filterType, filterStatus].join('|');
  const [pageState, setPageState] = useState({ key: filterKey, page: 1 });
  const [pageSize, setPageSize] = useState(10);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(pageState.key === filterKey ? pageState.page : 1, totalPages);
  const setPage = (next: number) => setPageState({ key: filterKey, page: Math.max(1, Math.min(next, totalPages)) });
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);
  const selectClass = 'rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100';

  const openNew = () => {
    if (onCreate) {
      onCreate();
      return;
    }
    setEditing(null);
    setShowForm(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Mail className="h-5 w-5" />}
        iconColor="bg-indigo-50 text-indigo-600"
        title="Front Desk"
        description="Log incoming letters and documents, categorise them by government and regulators, vendors, clients, or others, then route them to departments."
        action={<button type="button" onClick={openNew} className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"><PlusCircle className="h-4 w-4" />Log Correspondence</button>}
      />
      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div> : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {!isLoaded ? Array.from({ length: 4 }).map((_, index) => <KPICardSkeleton key={index} />) : (
          <>
            <KPICard title="Total Logged" value={stats.total} subtitle={`${stats.thisMonth} received this month`} icon={<Inbox className="h-5 w-5" />} color="bg-indigo-50 text-indigo-600" onClick={() => setActiveCard('total')} />
            <KPICard title="Open" value={stats.open} subtitle={stats.overdue ? `${stats.overdue} overdue` : 'None overdue'} icon={<FolderOpen className="h-5 w-5" />} color="bg-amber-50 text-amber-600" onClick={() => setActiveCard('open')} />
            <KPICard title="Closed" value={stats.closed} subtitle={stats.total ? `${Math.round((stats.closed / stats.total) * 100)}% of all items` : undefined} icon={<CheckCircle2 className="h-5 w-5" />} color="bg-emerald-50 text-emerald-600" onClick={() => setActiveCard('closed')} />
            <KPICard title="Avg. Time to Close" value={`${stats.avgDays.toFixed(1)} days`} subtitle="Received → closed" icon={<Timer className="h-5 w-5" />} color="bg-sky-50 text-sky-600" onClick={() => setActiveCard('avg')} />
          </>
        )}
      </div>
      {isLoaded ? (
        <div>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Deadlines</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KPICard title="Due Today" value={stats.dueToday} subtitle="Response due by end of day" icon={<AlarmClock className="h-5 w-5" />} color="bg-amber-50 text-amber-600" onClick={() => setActiveCard('dueToday')} />
            <KPICard title={`Due in Next ${DUE_SOON_DAYS} Days`} value={stats.dueSoon} subtitle="Upcoming deadlines" icon={<CalendarClock className="h-5 w-5" />} color="bg-sky-50 text-sky-600" onClick={() => setActiveCard('dueSoon')} />
            <KPICard title="Past Deadline" value={stats.pastDeadline} subtitle={stats.pastDeadline ? 'Needs follow-up now' : 'Nothing late'} icon={<CalendarX2 className="h-5 w-5" />} color="bg-red-50 text-red-600" onClick={() => setActiveCard('pastDeadline')} />
            <KPICard title="Urgent Open" value={stats.urgent} subtitle="Marked urgent, not yet closed" icon={<Flame className="h-5 w-5" />} color="bg-rose-50 text-rose-600" onClick={() => setActiveCard('urgent')} />
          </div>
        </div>
      ) : null}
      {isLoaded && items.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-4">
          <ChartCard title="Letters by Category">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={byCategory} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid horizontal={false} stroke={GRID_LINE} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: INK_SECONDARY }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={132} tick={{ fontSize: 11, fill: INK_SECONDARY }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#f1f5f9' }} />
                <Bar dataKey="count" fill={BAR_COLOR} radius={[0, 4, 4, 0]} barSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Items by Department">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={byDepartment} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid horizontal={false} stroke={GRID_LINE} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: INK_SECONDARY }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12, fill: INK_SECONDARY }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#f1f5f9' }} />
                <Bar dataKey="count" fill={BAR_COLOR} radius={[0, 4, 4, 0]} barSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Monthly Intake (last 6 months)">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={monthly} margin={{ right: 8 }}>
                <CartesianGrid vertical={false} stroke={GRID_LINE} />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: INK_SECONDARY }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} width={28} tick={{ fontSize: 12, fill: INK_SECONDARY }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#f1f5f9' }} />
                <Bar dataKey="count" fill={BAR_COLOR} radius={[4, 4, 0, 0]} barSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Top Senders">
            <ul className="space-y-3">
              {topSenders.map(([name, count]) => (
                <li key={name}>
                  <div className="flex justify-between gap-3 text-sm">
                    <button type="button" onClick={() => setSearch(name)} className="truncate text-left text-slate-700 hover:text-indigo-600">{name}</button>
                    <span className="shrink-0 tabular-nums text-slate-500">{count}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-slate-100">
                    <div className="h-1.5 rounded-full" style={{ width: `${(count / topSenders[0][1]) * 100}%`, background: BAR_COLOR }} />
                  </div>
                </li>
              ))}
            </ul>
          </ChartCard>
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search reference, description, sender, category…" className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-10 pr-4 text-sm focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100" />
          </div>
          <select value={filterCategory} onChange={(event) => setFilterCategory(event.target.value)} className={selectClass}><option value="">All Categories</option>{SENDER_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select>
          <select value={filterDept} onChange={(event) => setFilterDept(event.target.value)} className={selectClass}><option value="">All Departments</option>{departmentOptions.map((department) => <option key={department}>{department}</option>)}</select>
          <select value={filterType} onChange={(event) => setFilterType(event.target.value)} className={selectClass}><option value="">All Types</option>{CORRESPONDENCE_TYPES.map((type) => <option key={type}>{type}</option>)}</select>
          <div className="flex gap-2">
            <select value={filterStatus} onChange={(event) => setFilterStatus(event.target.value)} className={`${selectClass} flex-1`}><option value="">All Statuses</option><option value="Open">Open</option><option value="Overdue">Open · Overdue</option><option value="Closed">Closed</option></select>
            <button type="button" onClick={() => { setSearch(''); setFilterDept(''); setFilterCategory(''); setFilterType(''); setFilterStatus(''); }} className="rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-slate-50">Clear</button>
          </div>
        </div>
      </div>

      {!isLoaded ? <LoadingState label="Loading correspondence…" /> : filtered.length === 0 ? (
        items.length === 0 ? <EmptyState icon={<Mail className="h-8 w-8" />} title="No correspondence logged yet" action={{ label: 'Log the first item', onClick: openNew }} /> : <EmptyState icon={<Search className="h-8 w-8" />} title="No items match your filters" description="Try adjusting your search, category, department, type or status filter." action={{ label: 'Clear filters', onClick: () => { setSearch(''); setFilterDept(''); setFilterCategory(''); setFilterType(''); setFilterStatus(''); } }} />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
            <span className="text-sm text-slate-500">{filtered.length === items.length ? `${items.length} items` : `${filtered.length} of ${items.length} items match your filters`}</span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => { exportCsv(filtered, `front-desk-register-${todayISO()}.csv`); addToast(`Exported ${filtered.length} item${filtered.length === 1 ? '' : 's'} to CSV`); }} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"><Download className="h-3.5 w-3.5" />Export CSV</button>
              <button type="button" onClick={() => printRegister(filtered, filtered.length === items.length ? 'All items' : 'Filtered view')} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"><Printer className="h-3.5 w-3.5" />Print</button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50">
                <tr>
                  {['Ref / Date', 'Description of Item', 'Sender', 'Addressed To', 'Department', 'Deadline', 'Closed By', 'Status'].map((heading) => <th key={heading} className="whitespace-nowrap px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">{heading}</th>)}
                  <th className="px-4 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paged.map((item) => (
                  <tr key={item.id} className="hover:bg-indigo-50/40">
                    <td className="whitespace-nowrap px-4 py-3"><div className="font-mono text-sm font-medium text-slate-700">{item.referenceNo}</div><div className="text-xs text-slate-400">{formatDate(item.dateReceived)}</div></td>
                    <td className="max-w-xs px-4 py-3">
                      <button type="button" onClick={() => setViewing(item)} className="line-clamp-2 text-left text-sm text-slate-800 hover:text-indigo-600">{item.description}</button>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
                        {item.priority === 'High' ? <UrgentBadge /> : null}
                        <span>{item.type}{item.copies > 1 ? ` · ${item.copies} copies` : ''}</span>
                        {item.attachments.length > 0 ? <button type="button" onClick={() => setViewing(item)} className="inline-flex items-center gap-0.5 text-indigo-600 hover:underline"><Paperclip className="h-3 w-3" />{item.attachments.length}</button> : null}
                      </div>
                    </td>
                    <td className="max-w-[12rem] px-4 py-3 text-sm text-slate-600"><div>{item.senderCompany}</div><div className="mt-0.5 text-xs text-slate-400">{item.senderCategory}</div></td>
                    <td className="px-4 py-3 text-sm text-slate-600">{item.addressedTo}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">{item.department}</td>
                    <td className="whitespace-nowrap px-4 py-3">{item.dueDate ? <><div className="text-sm text-slate-700">{formatDate(item.dueDate)}</div><DueText item={item} /></> : <span className="text-sm text-slate-300">—</span>}</td>
                    <td className="whitespace-nowrap px-4 py-3">{item.closedBy ? <><div className="text-sm text-slate-700">{item.closedBy}</div><div className="text-xs text-slate-400">{formatDate(item.dateClosed)}</div></> : <span className="text-sm text-slate-300">—</span>}</td>
                    <td className="px-4 py-3"><StatusPill item={item} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {item.status === 'Open' ? (
                          <>
                            <button type="button" onClick={() => setCloseTarget(item)} className="flex items-center gap-1 rounded-lg border border-emerald-200 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50"><CheckCircle2 className="h-3.5 w-3.5" />Close</button>
                            <button type="button" onClick={() => { setEditing(item); setShowForm(true); }} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" title="Edit"><Edit2 className="h-4 w-4" /></button>
                            <button type="button" onClick={() => setDeleteTarget(item)} className="rounded-lg p-1.5 text-red-600 hover:bg-red-50" title="Delete"><Trash2 className="h-4 w-4" /></button>
                          </>
                        ) : <span className="p-1.5 text-slate-300" title="Closed — read-only"><Lock className="h-4 w-4" /></span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3">
            <span className="text-sm text-slate-500">Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} of {filtered.length}</span>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setPage(page - 1)} disabled={page === 1} className="rounded-lg border border-slate-200 p-1.5 text-slate-500 disabled:opacity-40" aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></button>
              {pageNumbers(page, totalPages).map((value, index) => value === null ? <span key={`gap-${index}`} className="w-8 text-center text-xs text-slate-400">…</span> : <button key={value} type="button" onClick={() => setPage(value)} className={`h-8 w-8 rounded-lg text-xs font-medium ${value === page ? 'bg-indigo-600 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{value}</button>)}
              <button type="button" onClick={() => setPage(page + 1)} disabled={page === totalPages} className="rounded-lg border border-slate-200 p-1.5 text-slate-500 disabled:opacity-40" aria-label="Next page"><ChevronRight className="h-4 w-4" /></button>
              <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPageState({ key: filterKey, page: 1 }); }} className="ml-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs" aria-label="Rows per page">{PAGE_SIZES.map((size) => <option key={size} value={size}>{size} / page</option>)}</select>
            </div>
          </div>
        </div>
      )}

      <Modal isOpen={showForm} onClose={() => { if (!busy) { setShowForm(false); setEditing(null); } }} title={editing ? `Edit ${editing.referenceNo}` : 'Log Incoming Correspondence'} size="lg">
        <CorrespondenceForm
          key={editing?.id ?? 'new'}
          initial={editing ?? undefined}
          onCancel={() => { setShowForm(false); setEditing(null); }}
          onSave={async (data, files, removedAttachmentIds) => {
            setBusy(true);
            try {
              if (editing) {
                await updateCorrespondence(editing.id, data, files, removedAttachmentIds);
                addToast(`${editing.referenceNo} updated`);
              } else {
                const created = await addCorrespondence(data, files);
                addToast(`${created.referenceNo} logged`);
              }
              setShowForm(false);
              setEditing(null);
            } finally {
              setBusy(false);
            }
          }}
        />
      </Modal>

      <Modal isOpen={!!closeTarget} onClose={() => setCloseTarget(null)} title="Close this item?" size="sm">
        {closeTarget ? (
          <div className="space-y-4">
            <div className="rounded-xl bg-slate-50 p-3 text-sm">
              <div className="font-mono text-xs text-slate-500">{closeTarget.referenceNo}</div>
              <div className="mt-0.5 text-slate-800">{closeTarget.description}</div>
              <div className="mt-1 text-xs text-slate-500">{closeTarget.senderCompany} → {closeTarget.department}</div>
            </div>
            <p className="text-sm text-slate-600">This will be recorded as closed by <span className="font-medium text-slate-900">{currentUser.name}</span> on <span className="font-medium text-slate-900">{formatDate(todayISO())}</span>.</p>
            <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-700"><Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />Once closed, this record can no longer be edited or deleted.</p>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setCloseTarget(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50">Cancel</button>
              <button type="button" disabled={busy} onClick={async () => { setBusy(true); try { await closeCorrespondence(closeTarget.id); addToast(`${closeTarget.referenceNo} closed`); setCloseTarget(null); } catch (closeError) { addToast(closeError instanceof Error ? closeError.message : 'Could not close this item.', 'error'); } finally { setBusy(false); } }} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60">Yes, Close Item</button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal isOpen={!!cardDetail} onClose={() => setActiveCard(null)} title={cardDetail?.title ?? ''} size="lg">
        {cardDetail ? (
          <>
            <p className="mb-4 -mt-2 text-sm text-slate-500">{cardDetail.description}</p>
            {cardDetail.rows.length === 0 ? <p className="py-10 text-center text-sm text-slate-400">Nothing here right now.</p> : (
              <ul className="max-h-[28rem] space-y-2 overflow-y-auto">
                {cardDetail.rows.map((item) => (
                  <li key={item.id} className="flex items-center gap-2 rounded-xl bg-slate-50 hover:bg-indigo-50/60">
                    <button type="button" onClick={() => { setActiveCard(null); setViewing(item); }} className="flex min-w-0 flex-1 items-center justify-between gap-3 p-3 text-left">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">{item.description}</p>
                        <p className="mt-0.5 truncate text-xs text-slate-500"><span className="font-mono">{item.referenceNo}</span> · {item.senderCompany} → {item.department}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2"><StatusPill item={item} /><span className="whitespace-nowrap text-xs text-slate-400">{cardDetail.meta(item)}</span></div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : null}
      </Modal>

      <Modal isOpen={!!viewing} onClose={() => setViewing(null)} title={viewing?.referenceNo ?? ''} size="lg">
        {viewing ? (
          <>
            {viewing.priority === 'High' ? <div className="mb-4"><UrgentBadge /></div> : null}
            <dl className="grid grid-cols-1 gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
              {([
                ['Description', viewing.description],
                ['Type', viewing.type],
                ['Date Received', formatDate(viewing.dateReceived)],
                ['Copies', String(viewing.copies)],
                ['Sender', viewing.senderCompany],
                ['Category', viewing.senderCategory],
                ['Addressed To', viewing.addressedTo],
                ['Lead department', viewing.department],
                ['Location', viewing.location || '—'],
                ['Priority', viewing.priority],
                ['Response Due', viewing.dueDate ? `${formatDate(viewing.dueDate)} (${describeDue(viewing)})` : '—'],
                ['Closed By', viewing.closedBy ?? '—'],
                ['Date Closed', formatDate(viewing.dateClosed)],
                ['Remarks', viewing.remarks ?? '—'],
              ] as const).map(([label, value]) => (
                <div key={label} className={label === 'Description' ? 'sm:col-span-2' : ''}>
                  <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</dt>
                  <dd className="mt-0.5 text-slate-800">{value}</dd>
                </div>
              ))}
              <div><dt className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Status</dt><StatusPill item={viewing} /></div>
            </dl>
            <DepartmentRouting item={viewing} onUpdated={(next) => { setViewing(next); reload().catch(() => undefined); }} />
            <div className="mt-6">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Documents{viewing.attachments.length ? ` (${viewing.attachments.length})` : ''}</h3>
              <AttachmentViewer key={viewing.id} attachments={viewing.attachments} />
            </div>
            <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
              {viewing.status === 'Open' ? (
                <>
                  <button type="button" onClick={() => { setEditing(viewing); setShowForm(true); setViewing(null); }} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50"><Edit2 className="h-4 w-4" />Edit</button>
                  {unfinishedDepartmentRoutes(viewing.routes || []).length ? (
                    <p className="max-w-sm text-right text-xs text-amber-700">Close stays unavailable until {unfinishedDepartmentRoutes(viewing.routes || []).map((route) => route.department).join(', ')} is completed or waived.</p>
                  ) : (
                    <button type="button" onClick={() => { setCloseTarget(viewing); setViewing(null); }} className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"><CheckCircle2 className="h-4 w-4" />Close Item</button>
                  )}
                </>
              ) : <p className="mr-auto flex items-center gap-1.5 text-xs text-slate-500"><Lock className="h-3.5 w-3.5" />Closed by {viewing.closedBy ?? '—'} on {formatDate(viewing.dateClosed)} — this record is read-only.</p>}
            </div>
          </>
        ) : null}
      </Modal>

      <ConfirmDeleteModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        itemLabel={deleteTarget ? deleteTarget.referenceNo : 'this item'}
        onConfirm={async () => {
          if (!deleteTarget) return;
          try {
            await deleteCorrespondence(deleteTarget.id);
            addToast(`${deleteTarget.referenceNo} deleted`);
          } catch (deleteError) {
            addToast(deleteError instanceof Error ? deleteError.message : 'Could not delete this item.', 'error');
          }
        }}
      />
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
