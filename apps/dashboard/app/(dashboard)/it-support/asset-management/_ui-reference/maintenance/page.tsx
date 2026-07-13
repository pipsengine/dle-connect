'use client';

import { useState, useMemo } from 'react';
import {
  CalendarClock,
  CheckCircle2,
  Clock,
  CalendarDays,
  AlertTriangle,
  FileText,
  Plus,
  Bell,
  Search,
  SlidersHorizontal,
  Settings2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  X,
  ClipboardList,
  BellPlus,
  CalendarCheck,
  LayoutTemplate,
  Info,
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell } from 'recharts';

// ---------- Mock Data ----------

const statCards = [
  { label: 'Total Maintenance', value: '186', sub: 'All time', icon: CalendarClock, color: 'blue', pct: null },
  { label: 'Completed', value: '112', sub: '60.2% of total', icon: CheckCircle2, color: 'green', pct: 60.2 },
  { label: 'In Progress', value: '28', sub: '15.1% of total', icon: Clock, color: 'orange', pct: 15.1 },
  { label: 'Upcoming', value: '32', sub: '17.2% of total', icon: CalendarDays, color: 'purple', pct: 17.2 },
  { label: 'Overdue', value: '14', sub: '7.5% of total', icon: AlertTriangle, color: 'red', pct: 7.5 },
] as const;

const ICON_STYLES: Record<string, { bg: string; bar: string }> = {
  blue: { bg: 'bg-blue-50 text-blue-600', bar: 'bg-blue-500' },
  green: { bg: 'bg-emerald-50 text-emerald-600', bar: 'bg-emerald-500' },
  orange: { bg: 'bg-orange-50 text-orange-600', bar: 'bg-orange-500' },
  purple: { bg: 'bg-violet-50 text-violet-600', bar: 'bg-violet-500' },
  red: { bg: 'bg-red-50 text-red-600', bar: 'bg-red-500' },
};

const overviewTrend = [
  { day: 'May 1', completed: 20, inProgress: 8, overdue: 2 },
  { day: 'May 4', completed: 24, inProgress: 10, overdue: 3 },
  { day: 'May 8', completed: 26, inProgress: 9, overdue: 2 },
  { day: 'May 11', completed: 25, inProgress: 12, overdue: 4 },
  { day: 'May 15', completed: 32, inProgress: 14, overdue: 3 },
  { day: 'May 18', completed: 28, inProgress: 11, overdue: 5 },
  { day: 'May 22', completed: 30, inProgress: 13, overdue: 4 },
  { day: 'May 25', completed: 27, inProgress: 10, overdue: 3 },
  { day: 'May 29', completed: 29, inProgress: 12, overdue: 4 },
];

const maintenanceByCategory = [
  { name: 'Hardware', value: 78, pct: 41.9, color: '#3b82f6' },
  { name: 'Software', value: 46, pct: 24.7, color: '#22c55e' },
  { name: 'Network', value: 32, pct: 17.2, color: '#f97316' },
  { name: 'Facility', value: 18, pct: 9.7, color: '#ec4899' },
  { name: 'Other', value: 12, pct: 6.5, color: '#8b5cf6' },
];

const maintenanceByStatus = [
  { name: 'Completed', value: 112, pct: 60.2, color: '#22c55e' },
  { name: 'In Progress', value: 28, pct: 15.1, color: '#f97316' },
  { name: 'Upcoming', value: 32, pct: 17.2, color: '#3b82f6' },
  { name: 'Overdue', value: 14, pct: 7.5, color: '#ef4444' },
];

type Priority = 'High' | 'Medium' | 'Low';
type MStatus = 'In Progress' | 'Upcoming' | 'Completed' | 'Overdue';

type Activity = {
  id: string;
  title: string;
  asset: string;
  category: string;
  scheduledDate: string;
  priority: Priority;
  status: MStatus;
  assignedTo: string;
  initials: string;
};

const initialActivities: Activity[] = [
  { id: 'MT-2025-0186', title: 'Quarterly UPS Inspection', asset: 'APC Smart-UPS 1500VA', category: 'Hardware', scheduledDate: '15 May 2025', priority: 'High', status: 'In Progress', assignedTo: 'Michael Brown', initials: 'MB' },
  { id: 'MT-2025-0185', title: 'Server OS Update', asset: 'Dell PowerEdge R740', category: 'Software', scheduledDate: '16 May 2025', priority: 'Medium', status: 'Upcoming', assignedTo: 'Emily Davis', initials: 'ED' },
  { id: 'MT-2025-0184', title: 'Network Switch Cleaning', asset: 'Cisco Catalyst 2960-X', category: 'Network', scheduledDate: '17 May 2025', priority: 'Low', status: 'Upcoming', assignedTo: 'David Wilson', initials: 'DW' },
  { id: 'MT-2025-0183', title: 'AC Preventive Maintenance', asset: 'Meeting Room AC Unit', category: 'Facility', scheduledDate: '18 May 2025', priority: 'Medium', status: 'Upcoming', assignedTo: 'Sarah Johnson', initials: 'SJ' },
  { id: 'MT-2025-0182', title: 'Database Backup Verification', asset: 'DB Server 01', category: 'Software', scheduledDate: '12 May 2025', priority: 'High', status: 'Completed', assignedTo: 'James Anderson', initials: 'JA' },
  { id: 'MT-2025-0181', title: 'Firewall Firmware Update', asset: 'FortiGate 60F', category: 'Network', scheduledDate: '10 May 2025', priority: 'Medium', status: 'Completed', assignedTo: 'Sophia Lee', initials: 'SL' },
  { id: 'MT-2025-0180', title: 'Generator Load Test', asset: 'Diesel Generator DG250', category: 'Hardware', scheduledDate: '08 May 2025', priority: 'High', status: 'Overdue', assignedTo: 'Robert Fox', initials: 'RF' },
  { id: 'MT-2025-0179', title: 'Workstation Disk Cleanup', asset: 'IT-WS-032', category: 'Software', scheduledDate: '07 May 2025', priority: 'Low', status: 'Overdue', assignedTo: 'Olivia Martinez', initials: 'OM' },
];

const CATEGORIES = ['Hardware', 'Software', 'Network', 'Facility', 'Other'];
const PRIORITIES: Priority[] = ['High', 'Medium', 'Low'];
const STATUSES: MStatus[] = ['Upcoming', 'In Progress', 'Completed', 'Overdue'];

const quickActions = [
  { title: 'Schedule Maintenance', sub: 'Plan new maintenance', icon: CalendarClock, color: 'bg-blue-50 text-blue-600' },
  { title: 'Request Maintenance', sub: 'Submit a maintenance request', icon: ClipboardList, color: 'bg-violet-50 text-violet-600' },
  { title: 'Maintenance Calendar', sub: 'View maintenance calendar', icon: CalendarCheck, color: 'bg-teal-50 text-teal-600' },
  { title: 'Maintenance Templates', sub: 'Manage maintenance templates', icon: LayoutTemplate, color: 'bg-amber-50 text-amber-600' },
];

const upcomingMaintenance = [
  { title: 'Quarterly UPS Inspection', asset: 'APC Smart-UPS 1500VA', datetime: '15 May 2025 · 10:00 AM', priority: 'High', icon: CalendarClock, iconBg: 'bg-blue-50 text-blue-600' },
  { title: 'Server OS Update', asset: 'Dell PowerEdge R740', datetime: '16 May 2025 · 09:00 AM', priority: 'Medium', icon: CalendarClock, iconBg: 'bg-blue-50 text-blue-600' },
  { title: 'Network Switch Cleaning', asset: 'Cisco Catalyst 2960-X', datetime: '17 May 2025 · 11:00 AM', priority: 'Low', icon: CalendarClock, iconBg: 'bg-blue-50 text-blue-600' },
  { title: 'AC Preventive Maintenance', asset: 'Meeting Room AC Unit', datetime: '18 May 2025 · 02:00 PM', priority: 'Medium', icon: CalendarClock, iconBg: 'bg-blue-50 text-blue-600' },
];

const PRIORITY_STYLES: Record<Priority, string> = {
  High: 'bg-red-50 text-red-600',
  Medium: 'bg-amber-50 text-amber-600',
  Low: 'bg-emerald-50 text-emerald-600',
};

const STATUS_STYLES: Record<MStatus, string> = {
  'In Progress': 'bg-orange-50 text-orange-600',
  Upcoming: 'bg-blue-50 text-blue-600',
  Completed: 'bg-emerald-50 text-emerald-600',
  Overdue: 'bg-red-50 text-red-600',
};

// Calendar week data (static demo week of May 11-17, 2025)
const calendarWeeks = [
  [
    { date: 11, label: 'Sun', tasks: [] },
    { date: 12, label: 'Mon', tasks: [{ time: '09:00 AM', title: 'DB Backup Verification' }, { time: '01:00 PM', title: 'Workstation Cleanup' }] },
    { date: 13, label: 'Tue', tasks: [{ time: '10:00 AM', title: 'Firewall Update' }] },
    { date: 14, label: 'Wed', tasks: [{ time: '09:30 AM', title: 'Generator Load Test' }, { time: '02:00 PM', title: 'AC Maintenance' }] },
    { date: 15, label: 'Thu', tasks: [{ time: '10:00 AM', title: 'UPS Inspection' }], today: true },
    { date: 16, label: 'Fri', tasks: [{ time: '09:00 AM', title: 'Server Update' }] },
    { date: 17, label: 'Sat', tasks: [{ time: '11:00 AM', title: 'Switch Cleaning' }] },
  ],
];

// ---------- Small building blocks ----------

function StatCard({ stat }: { stat: (typeof statCards)[number] }) {
  const Icon = stat.icon;
  const styles = ICON_STYLES[stat.color];
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${styles.bg}`}>
          <Icon className="h-5 w-5" />
        </span>
        <p className={`text-sm font-medium ${styles.bg.split(' ')[1]}`}>{stat.label}</p>
      </div>
      <p className="mt-3 text-2xl font-semibold text-slate-900">{stat.value}</p>
      <p className="mt-1 flex items-center gap-1 text-xs text-slate-400">
        {stat.sub}
        {stat.label === 'Total Maintenance' && <Info className="h-3 w-3" />}
      </p>
      {stat.pct !== null && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full rounded-full ${styles.bar}`} style={{ width: `${stat.pct}%` }} />
        </div>
      )}
    </div>
  );
}

function PriorityPill({ priority }: { priority: Priority }) {
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_STYLES[priority]}`}>{priority}</span>;
}

function StatusPill({ status }: { status: MStatus }) {
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}>{status}</span>;
}

function Avatar({ initials }: { initials: string }) {
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[10px] font-medium text-blue-600">
      {initials}
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-slate-700">{label}</label>
      {children}
    </div>
  );
}

const inputClass =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100';

// ---------- New Maintenance modal ----------

function NewMaintenanceModal({ onClose, onSave }: { onClose: () => void; onSave: (a: Activity) => void }) {
  const [form, setForm] = useState({
    title: '',
    asset: '',
    category: 'Hardware',
    scheduledDate: '',
    priority: 'Medium' as Priority,
    status: 'Upcoming' as MStatus,
    assignedTo: '',
  });
  const [error, setError] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.asset.trim() || !form.scheduledDate) {
      setError('Please fill in title, asset, and scheduled date.');
      return;
    }

    const initials = form.assignedTo
      ? form.assignedTo.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
      : '—';

    const newActivity: Activity = {
      id: `MT-2025-${Math.floor(1000 + Math.random() * 9000)}`,
      title: form.title,
      asset: form.asset,
      category: form.category,
      scheduledDate: new Date(form.scheduledDate).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }),
      priority: form.priority,
      status: form.status,
      assignedTo: form.assignedTo || 'Unassigned',
      initials,
    };

    onSave(newActivity);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">New Maintenance</h2>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Title *">
            <input name="title" value={form.title} onChange={handleChange} placeholder="e.g., Quarterly UPS Inspection" className={inputClass} />
          </Field>

          <Field label="Asset / Equipment *">
            <input name="asset" value={form.asset} onChange={handleChange} placeholder="e.g., APC Smart-UPS 1500VA" className={inputClass} />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Category">
              <select name="category" value={form.category} onChange={handleChange} className={inputClass}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Priority">
              <select name="priority" value={form.priority} onChange={handleChange} className={inputClass}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Scheduled Date *">
              <input type="date" name="scheduledDate" value={form.scheduledDate} onChange={handleChange} className={inputClass} />
            </Field>
            <Field label="Status">
              <select name="status" value={form.status} onChange={handleChange} className={inputClass}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Assigned To">
            <input name="assignedTo" value={form.assignedTo} onChange={handleChange} placeholder="e.g., Michael Brown" className={inputClass} />
          </Field>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
              Create Maintenance
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------- Page ----------

export default function Page() {
  const [activities, setActivities] = useState<Activity[]>(initialActivities);
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isNewMenuOpen, setIsNewMenuOpen] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const totalPages = 24;

  const filteredActivities = useMemo(() => {
    if (!searchQuery.trim()) return activities;
    const q = searchQuery.toLowerCase();
    return activities.filter(
      (a) => a.title.toLowerCase().includes(q) || a.asset.toLowerCase().includes(q) || a.id.toLowerCase().includes(q)
    );
  }, [activities, searchQuery]);

  const handleSaveActivity = (a: Activity) => {
    setActivities((prev) => [a, ...prev]);
    setIsModalOpen(false);
    setPage(1);
  };

  const week = calendarWeeks[0];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Maintenance</h1>
          <p className="mt-1 text-sm text-slate-500">Schedule, track, and manage maintenance activities for assets and equipment.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
            <FileText className="h-4 w-4 text-slate-400" />
            Reports
          </button>
          <div className="relative">
            <button
              onClick={() => setIsNewMenuOpen((v) => !v)}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              New Maintenance
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {isNewMenuOpen && (
              <div className="absolute right-0 z-10 mt-1 w-56 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                <button
                  onClick={() => {
                    setIsModalOpen(true);
                    setIsNewMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                >
                  <CalendarClock className="h-4 w-4 text-slate-400" />
                  Schedule Maintenance
                </button>
                <button
                  onClick={() => {
                    setIsModalOpen(true);
                    setIsNewMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                >
                  <ClipboardList className="h-4 w-4 text-slate-400" />
                  From Template
                </button>
              </div>
            )}
          </div>
          <button className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50">
            <Bell className="h-4 w-4" />
            <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-medium text-white">3</span>
          </button>
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white py-1 pl-1 pr-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-xs font-medium text-white">JS</span>
            <div className="leading-tight">
              <p className="text-xs font-medium text-slate-800">John Smith</p>
              <p className="text-[11px] text-slate-400">IT Manager</p>
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {statCards.map((stat) => (
          <StatCard key={stat.label} stat={stat} />
        ))}
      </div>

      {/* Overview + category + quick actions/upcoming */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1fr_320px]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">Maintenance Overview</h2>
            <button className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
              This Month <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
            </button>
          </div>
          <div className="mb-2 flex items-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> Completed
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-orange-500" /> In Progress
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-red-500" /> Overdue
            </span>
          </div>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={overviewTrend} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip />
                <Area type="monotone" dataKey="completed" stroke="#22c55e" fill="#22c55e" fillOpacity={0.1} strokeWidth={2} dot={{ r: 3 }} />
                <Area type="monotone" dataKey="inProgress" stroke="#f97316" fill="#f97316" fillOpacity={0.1} strokeWidth={2} dot={{ r: 3 }} />
                <Area type="monotone" dataKey="overdue" stroke="#ef4444" fill="#ef4444" fillOpacity={0.1} strokeWidth={2} dot={{ r: 3 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-4 text-base font-semibold text-slate-900">Maintenance by Category</h2>
          <div className="flex items-center gap-6">
            <div className="relative h-[160px] w-[160px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={maintenanceByCategory} dataKey="value" nameKey="name" innerRadius={52} outerRadius={78} paddingAngle={2} stroke="none">
                    {maintenanceByCategory.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-semibold text-slate-900">186</span>
                <span className="text-xs text-slate-400">Total</span>
              </div>
            </div>
            <ul className="flex-1 space-y-2.5">
              {maintenanceByCategory.map((item) => (
                <li key={item.name} className="flex items-center gap-2 text-sm">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-slate-600">{item.name}</span>
                  <span className="ml-auto whitespace-nowrap font-medium text-slate-900">
                    {item.value} <span className="font-normal text-slate-400">({item.pct}%)</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="mb-4 text-base font-semibold text-slate-900">Quick Actions</h3>
            <div className="space-y-2.5">
              {quickActions.map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.title}
                    onClick={() => setIsModalOpen(true)}
                    className="flex w-full items-center gap-3 rounded-xl border border-slate-100 p-2.5 text-left hover:border-slate-200 hover:bg-slate-50"
                  >
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${action.color}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">{action.title}</p>
                      <p className="truncate text-xs text-slate-400">{action.sub}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_320px]">
        {/* Main column */}
        <div className="min-w-0 space-y-6">
          {/* Activities table */}
          <div className="rounded-2xl border border-slate-200 bg-white">
            <div className="p-5">
              <h2 className="mb-4 text-base font-semibold text-slate-900">Maintenance Activities</h2>
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[220px]">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setPage(1);
                    }}
                    placeholder="Search by asset, title, ID..."
                    className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <button className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-50">
                  All Status <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                </button>
                <button className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-50">
                  All Categories <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                </button>
                <button className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-50">
                  All Priorities <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                </button>
                <button className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
                  <SlidersHorizontal className="h-4 w-4 text-slate-400" />
                  Filters
                </button>
                <button className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50">
                  <Settings2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y border-slate-100 text-left text-slate-400">
                    <th className="whitespace-nowrap px-5 py-2.5 font-medium">Maintenance ID</th>
                    <th className="whitespace-nowrap px-5 py-2.5 font-medium">Title</th>
                    <th className="whitespace-nowrap px-5 py-2.5 font-medium">Asset / Equipment</th>
                    <th className="whitespace-nowrap px-5 py-2.5 font-medium">Category</th>
                    <th className="whitespace-nowrap px-5 py-2.5 font-medium">Scheduled Date</th>
                    <th className="whitespace-nowrap px-5 py-2.5 font-medium">Priority</th>
                    <th className="whitespace-nowrap px-5 py-2.5 font-medium">Status</th>
                    <th className="whitespace-nowrap px-5 py-2.5 font-medium">Assigned To</th>
                    <th className="whitespace-nowrap px-5 py-2.5 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredActivities.map((a) => (
                    <tr key={a.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                      <td className="whitespace-nowrap px-5 py-2.5 font-mono text-blue-600">{a.id}</td>
                      <td className="whitespace-nowrap px-5 py-2.5 font-medium text-slate-800">{a.title}</td>
                      <td className="whitespace-nowrap px-5 py-2.5 text-slate-600">{a.asset}</td>
                      <td className="whitespace-nowrap px-5 py-2.5 text-slate-600">{a.category}</td>
                      <td className="whitespace-nowrap px-5 py-2.5 text-slate-500">{a.scheduledDate}</td>
                      <td className="whitespace-nowrap px-5 py-2.5"><PriorityPill priority={a.priority} /></td>
                      <td className="whitespace-nowrap px-5 py-2.5"><StatusPill status={a.status} /></td>
                      <td className="whitespace-nowrap px-5 py-2.5">
                        <span className="flex items-center gap-2 text-slate-600">
                          <Avatar initials={a.initials} />
                          {a.assignedTo}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-2.5">
                        <button className="flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-slate-100">
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 p-5">
              <p className="text-sm text-slate-500">Showing 1 to {filteredActivities.length} of 186 entries</p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {[1, 2, 3].map((p) => (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium ${
                      page === p ? 'bg-blue-600 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {p}
                  </button>
                ))}
                <span className="px-1 text-slate-400">…</span>
                <button
                  onClick={() => setPage(totalPages)}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium ${
                    page === totalPages ? 'bg-blue-600 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {totalPages}
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 disabled:opacity-40"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Maintenance Calendar */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                <CalendarDays className="h-4 w-4 text-slate-400" />
                Maintenance Calendar
              </h2>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setWeekOffset((w) => w - 1)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="w-28 text-center text-sm font-medium text-slate-700">
                    {weekOffset === 0 ? 'May 2025' : `${weekOffset > 0 ? '+' : ''}${weekOffset} week${Math.abs(weekOffset) === 1 ? '' : 's'}`}
                  </span>
                  <button
                    onClick={() => setWeekOffset((w) => w + 1)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
                <button className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
                  Month <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-2">
              {week.map((day) => (
                <div
                  key={day.date}
                  className={`min-h-[130px] rounded-xl border p-2 ${
                    day.today ? 'border-blue-300 bg-blue-50/40' : 'border-slate-100'
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs text-slate-400">{day.label}</span>
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                        day.today ? 'bg-blue-600 text-white' : 'text-slate-700'
                      }`}
                    >
                      {day.date}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {day.tasks.map((task, i) => (
                      <div key={i} className="rounded-md border-l-2 border-blue-400 bg-blue-50 px-1.5 py-1">
                        <p className="truncate text-[11px] font-medium text-blue-700">{task.title}</p>
                        <p className="text-[10px] text-blue-500">{task.time}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <button className="mt-4 flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline">
              View Full Calendar <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">Upcoming Maintenance</h3>
              <button className="text-sm font-medium text-blue-600 hover:underline">View Calendar</button>
            </div>
            <ul className="space-y-3">
              {upcomingMaintenance.map((item, i) => {
                const Icon = item.icon;
                return (
                  <li key={i} className="flex items-start gap-3 rounded-xl border border-slate-100 p-3 hover:border-slate-200">
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${item.iconBg}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">{item.title}</p>
                      <p className="truncate text-xs text-slate-500">{item.asset}</p>
                      <p className="text-xs text-slate-400">{item.datetime}</p>
                    </div>
                    <PriorityPill priority={item.priority as Priority} />
                  </li>
                );
              })}
            </ul>
            <button className="mt-4 w-full rounded-lg border border-slate-200 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              View All Upcoming
            </button>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="mb-4 text-base font-semibold text-slate-900">Maintenance by Status</h3>
            <div className="flex flex-col items-center gap-4">
              <div className="relative h-[160px] w-[160px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={maintenanceByStatus} dataKey="value" nameKey="name" innerRadius={52} outerRadius={78} paddingAngle={2} stroke="none">
                      {maintenanceByStatus.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xl font-semibold text-slate-900">186</span>
                  <span className="text-xs text-slate-400">Total</span>
                </div>
              </div>
              <ul className="w-full space-y-2">
                {maintenanceByStatus.map((item) => (
                  <li key={item.name} className="flex items-center gap-2 text-sm">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="text-slate-600">{item.name}</span>
                    <span className="ml-auto whitespace-nowrap font-medium text-slate-900">
                      {item.value} <span className="font-normal text-slate-400">({item.pct}%)</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <button className="mt-4 w-full rounded-lg border border-slate-200 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              View Full Report
            </button>
          </div>
        </div>
      </div>

      {isModalOpen && <NewMaintenanceModal onClose={() => setIsModalOpen(false)} onSave={handleSaveActivity} />}
    </div>
  );
}