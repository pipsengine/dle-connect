'use client';

import { useState } from 'react';
import {
  FileText,
  Hourglass,
  CheckCircle2,
  XCircle,
  ClipboardCheck,
  Download,
  Bell,
  Search,
  Filter,
  MoreHorizontal,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Plus,
  UserPlus,
  ClipboardList,
  Grid3x3,
  Palette,
  Tag,
  Grid2x2,
  MonitorPlay,
  Layers,
  PenTool,
} from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

// ---------- Mock Data ----------

const statCards = [
  { label: 'Total Requests', value: '156', sub: 'All time', icon: FileText, color: 'blue' },
  { label: 'Pending', value: '28', sub: '17.9% of total', icon: Hourglass, color: 'orange' },
  { label: 'Approved', value: '84', sub: '53.8% of total', icon: CheckCircle2, color: 'green' },
  { label: 'Rejected', value: '18', sub: '11.5% of total', icon: XCircle, color: 'red' },
  { label: 'Fulfilled', value: '26', sub: '16.7% of total', icon: ClipboardCheck, color: 'purple' },
] as const;

const ICON_STYLES: Record<string, string> = {
  blue: 'bg-blue-50 text-blue-600',
  orange: 'bg-orange-50 text-orange-600',
  green: 'bg-emerald-50 text-emerald-600',
  red: 'bg-red-50 text-red-600',
  purple: 'bg-violet-50 text-violet-600',
};

const tabs = ['Board View', 'My Requests', 'All Requests', 'Drafts'];

type Priority = 'High' | 'Medium' | 'Low';

const PRIORITY_STYLES: Record<Priority, string> = {
  High: 'bg-red-50 text-red-600',
  Medium: 'bg-amber-50 text-amber-600',
  Low: 'bg-emerald-50 text-emerald-600',
};

type BoardCard = {
  title: string;
  requestedBy: string;
  date: string;
  tag: Priority | 'Approved' | 'Fulfilled' | 'Rejected' | 'Draft';
  initials: string;
};

type Column = {
  key: string;
  title: string;
  count: number;
  color: string;
  headerColor: string;
  cards: BoardCard[];
};

const columns: Column[] = [
  {
    key: 'pending',
    title: 'Pending',
    count: 28,
    color: 'border-t-orange-400',
    headerColor: 'text-orange-600',
    cards: [
      { title: 'Microsoft Visio 2024', requestedBy: 'Emily Davis', date: '14 May 2025', tag: 'Medium', initials: 'ED' },
      { title: 'Adobe Photoshop 2024', requestedBy: 'Michael Brown', date: '14 May 2025', tag: 'High', initials: 'MB' },
      { title: 'SPSS Statistics', requestedBy: 'Sophia Lee', date: '11 May 2025', tag: 'Medium', initials: 'SL' },
    ],
  },
  {
    key: 'approved',
    title: 'Approved',
    count: 84,
    color: 'border-t-emerald-400',
    headerColor: 'text-emerald-600',
    cards: [
      { title: 'Tableau Desktop', requestedBy: 'Olivia Martinez', date: '13 May 2025', tag: 'Approved', initials: 'OM' },
      { title: 'AutoCAD 2024', requestedBy: 'David Wilson', date: '12 May 2025', tag: 'Approved', initials: 'DW' },
      { title: 'Jira Software', requestedBy: 'William Clark', date: '08 May 2025', tag: 'Approved', initials: 'WC' },
    ],
  },
  {
    key: 'fulfilled',
    title: 'Fulfilled',
    count: 26,
    color: 'border-t-violet-400',
    headerColor: 'text-violet-600',
    cards: [
      { title: 'Slack', requestedBy: 'James Anderson', date: '12 May 2025', tag: 'Fulfilled', initials: 'JA' },
      { title: 'Figma Professional', requestedBy: 'Ava Thompson', date: '09 May 2025', tag: 'Fulfilled', initials: 'AT' },
      { title: 'Microsoft Project 2024', requestedBy: 'Daniel Taylor', date: '10 May 2025', tag: 'Fulfilled', initials: 'DT' },
    ],
  },
  {
    key: 'rejected',
    title: 'Rejected',
    count: 18,
    color: 'border-t-red-400',
    headerColor: 'text-red-600',
    cards: [
      { title: 'Windows 11 Pro', requestedBy: 'Sarah Johnson', date: '09 May 2025', tag: 'Rejected', initials: 'SJ' },
      { title: 'Cinema 4D', requestedBy: 'Robert Fox', date: '07 May 2025', tag: 'Rejected', initials: 'RF' },
      { title: 'Office 365 ProPlus', requestedBy: 'Kevin White', date: '06 May 2025', tag: 'Rejected', initials: 'KW' },
    ],
  },
  {
    key: 'drafts',
    title: 'Drafts',
    count: 8,
    color: 'border-t-slate-300',
    headerColor: 'text-slate-500',
    cards: [
      { title: 'MATLAB', requestedBy: 'John Smith', date: '15 May 2025', tag: 'Draft', initials: 'JS' },
      { title: 'CorelDRAW Graphics', requestedBy: 'Priya Sharma', date: '15 May 2025', tag: 'Draft', initials: 'PS' },
      { title: 'Notion (Team Plan)', requestedBy: 'Alex Johnson', date: '14 May 2025', tag: 'Draft', initials: 'AJ' },
    ],
  },
];

const tagStyles: Record<BoardCard['tag'], string> = {
  High: 'bg-red-50 text-red-600',
  Medium: 'bg-amber-50 text-amber-600',
  Low: 'bg-emerald-50 text-emerald-600',
  Approved: 'bg-emerald-50 text-emerald-600',
  Fulfilled: 'bg-violet-50 text-violet-600',
  Rejected: 'bg-red-50 text-red-600',
  Draft: 'bg-slate-100 text-slate-500',
};

const tableFilters = ['All Status', 'All Departments', 'All Priorities', 'All Categories'];

type Request = {
  id: string;
  software: string;
  requestedBy: string;
  department: string;
  priority: Priority;
  status: 'Pending' | 'Approved' | 'Fulfilled';
  requestDate: string;
  approvalBy: string;
  neededBy: string;
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
};

const requests: Request[] = [
  { id: 'SR-2025-0156', software: 'Microsoft Visio 2024', requestedBy: 'Emily Davis', department: 'Product Design', priority: 'Medium', status: 'Pending', requestDate: '14 May 2025', approvalBy: '—', neededBy: '21 May 2025', icon: PenTool, iconBg: 'bg-blue-500' },
  { id: 'SR-2025-0155', software: 'Adobe Photoshop 2024', requestedBy: 'Michael Brown', department: 'Marketing', priority: 'High', status: 'Pending', requestDate: '14 May 2025', approvalBy: '—', neededBy: '20 May 2025', icon: Palette, iconBg: 'bg-blue-700' },
  { id: 'SR-2025-0154', software: 'Tableau Desktop', requestedBy: 'Olivia Martinez', department: 'Data Analytics', priority: 'High', status: 'Approved', requestDate: '13 May 2025', approvalBy: 'John Smith', neededBy: '18 May 2025', icon: MonitorPlay, iconBg: 'bg-orange-500' },
  { id: 'SR-2025-0153', software: 'AutoCAD 2024', requestedBy: 'David Wilson', department: 'Engineering', priority: 'Medium', status: 'Approved', requestDate: '12 May 2025', approvalBy: 'Sarah Johnson', neededBy: '17 May 2025', icon: Layers, iconBg: 'bg-blue-700' },
  { id: 'SR-2025-0152', software: 'Slack', requestedBy: 'James Anderson', department: 'IT Operations', priority: 'Low', status: 'Fulfilled', requestDate: '12 May 2025', approvalBy: 'John Smith', neededBy: '12 May 2025', icon: Grid3x3, iconBg: 'bg-fuchsia-500' },
];

const requestsByPriority = [
  { name: 'High', value: 45, pct: 28.8, color: '#ef4444' },
  { name: 'Medium', value: 62, pct: 39.7, color: '#f97316' },
  { name: 'Low', value: 36, pct: 23.1, color: '#22c55e' },
  { name: 'Others', value: 30, pct: 19.2, color: '#3b82f6' },
];

const topRequestedSoftware = [
  { name: 'Microsoft Visio 2024', count: 12, icon: PenTool, iconBg: 'bg-blue-500' },
  { name: 'Adobe Photoshop 2024', count: 10, icon: Palette, iconBg: 'bg-blue-700' },
  { name: 'AutoCAD 2024', count: 9, icon: Layers, iconBg: 'bg-red-600' },
  { name: 'Slack', count: 8, icon: Grid3x3, iconBg: 'bg-fuchsia-500' },
  { name: 'Tableau Desktop', count: 7, icon: MonitorPlay, iconBg: 'bg-orange-500' },
];

// ---------- Small building blocks ----------

function StatCard({ stat }: { stat: (typeof statCards)[number] }) {
  const Icon = stat.icon;
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4">
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${ICON_STYLES[stat.color]}`}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className={`text-sm font-medium ${ICON_STYLES[stat.color].split(' ')[1]}`}>{stat.label}</p>
        <p className="text-2xl font-semibold text-slate-900">{stat.value}</p>
        <p className="truncate text-xs text-slate-400">{stat.sub}</p>
      </div>
    </div>
  );
}

function Avatar({ initials }: { initials: string }) {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[11px] font-medium text-blue-600">
      {initials}
    </span>
  );
}

function BoardColumn({ column }: { column: Column }) {
  return (
    <div className={`flex w-[260px] shrink-0 flex-col rounded-2xl border border-t-4 border-slate-200 bg-white ${column.color}`}>
      <div className="flex items-center justify-between px-4 py-3">
        <h3 className={`text-sm font-semibold ${column.headerColor}`}>{column.title}</h3>
        <span className="text-sm font-semibold text-slate-400">{column.count}</span>
      </div>
      <div className="flex-1 space-y-3 px-3 pb-2">
        {column.cards.map((card) => (
          <div key={card.title} className="rounded-xl border border-slate-100 p-3 hover:border-slate-200">
            <div className="mb-2 flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-slate-800">{card.title}</p>
              <button className="shrink-0 text-slate-300 hover:text-slate-500">
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-1.5 text-xs text-slate-400">Requested by</p>
            <div className="mb-2.5 flex items-center gap-2">
              <Avatar initials={card.initials} />
              <span className="text-sm text-slate-700">{card.requestedBy}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">{card.date}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tagStyles[card.tag]}`}>{card.tag}</span>
            </div>
          </div>
        ))}
      </div>
      <button className={`border-t border-slate-100 py-3 text-center text-sm font-medium ${column.headerColor} hover:bg-slate-50`}>
        View all {column.count}
      </button>
    </div>
  );
}

function PriorityPill({ priority }: { priority: Priority }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_STYLES[priority]}`}>{priority}</span>;
}

function StatusPill({ status }: { status: Request['status'] }) {
  const map: Record<Request['status'], string> = {
    Pending: 'bg-amber-50 text-amber-600',
    Approved: 'bg-emerald-50 text-emerald-600',
    Fulfilled: 'bg-violet-50 text-violet-600',
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${map[status]}`}>{status}</span>;
}

// ---------- Page ----------

export default function Page() {
  const [activeTab, setActiveTab] = useState('Board View');
  const [page, setPage] = useState(1);
  const totalPages = 32;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Software Requests</h1>
          <p className="mt-1 text-sm text-slate-500">Request, track and manage software requests across the organization.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
            <FileText className="h-4 w-4 text-slate-400" />
            Request Report
          </button>
          <button className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">
            <Plus className="h-4 w-4" />
            New Request
          </button>
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

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_320px]">
        {/* Main column */}
        <div className="min-w-0 space-y-6">
          {/* Tabs + search/filter */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-6 border-b border-slate-200">
              {tabs.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`-mb-px border-b-2 px-1 pb-3 text-sm font-medium ${
                    activeTab === tab ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
                <Filter className="h-4 w-4 text-slate-400" />
                Filter
              </button>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search requests..."
                  className="w-52 rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </div>
          </div>

          {/* Board */}
          <div className="flex gap-4 overflow-x-auto pb-2">
            {columns.map((col) => (
              <BoardColumn key={col.key} column={col} />
            ))}
          </div>

          {/* All Requests table */}
          <div className="rounded-2xl border border-slate-200 bg-white">
            <div className="p-5">
              <h2 className="mb-4 text-base font-semibold text-slate-900">All Requests</h2>
              <div className="flex flex-wrap items-center gap-3">
                {tableFilters.map((f) => (
                  <button
                    key={f}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
                  >
                    {f}
                    <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                  </button>
                ))}
                <button className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
                  <Filter className="h-4 w-4 text-slate-400" />
                  More Filters
                </button>
                <div className="ml-auto flex items-center gap-2">
                  <button className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
                    <Download className="h-4 w-4 text-slate-400" />
                    Export
                  </button>
                  <button className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">
                    <Grid2x2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y border-slate-100 text-left text-slate-400">
                    <th className="whitespace-nowrap px-5 py-2.5 font-medium">Request ID</th>
                    <th className="whitespace-nowrap px-5 py-2.5 font-medium">Software</th>
                    <th className="whitespace-nowrap px-5 py-2.5 font-medium">Requested By</th>
                    <th className="whitespace-nowrap px-5 py-2.5 font-medium">Department</th>
                    <th className="whitespace-nowrap px-5 py-2.5 font-medium">Priority</th>
                    <th className="whitespace-nowrap px-5 py-2.5 font-medium">Status</th>
                    <th className="whitespace-nowrap px-5 py-2.5 font-medium">Request Date</th>
                    <th className="whitespace-nowrap px-5 py-2.5 font-medium">Approval By</th>
                    <th className="whitespace-nowrap px-5 py-2.5 font-medium">Needed By</th>
                    <th className="whitespace-nowrap px-5 py-2.5 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r) => {
                    const Icon = r.icon;
                    return (
                      <tr key={r.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                        <td className="whitespace-nowrap px-5 py-2.5 font-mono text-blue-600">{r.id}</td>
                        <td className="whitespace-nowrap px-5 py-2.5">
                          <span className="flex items-center gap-2.5 font-medium text-slate-800">
                            <span className={`flex h-6 w-6 items-center justify-center rounded ${r.iconBg} text-white`}>
                              <Icon className="h-3.5 w-3.5" />
                            </span>
                            {r.software}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-5 py-2.5 text-slate-600">{r.requestedBy}</td>
                        <td className="whitespace-nowrap px-5 py-2.5 text-slate-600">{r.department}</td>
                        <td className="whitespace-nowrap px-5 py-2.5"><PriorityPill priority={r.priority} /></td>
                        <td className="whitespace-nowrap px-5 py-2.5"><StatusPill status={r.status} /></td>
                        <td className="whitespace-nowrap px-5 py-2.5 text-slate-500">{r.requestDate}</td>
                        <td className="whitespace-nowrap px-5 py-2.5 text-slate-500">{r.approvalBy}</td>
                        <td className="whitespace-nowrap px-5 py-2.5 text-slate-500">{r.neededBy}</td>
                        <td className="whitespace-nowrap px-5 py-2.5">
                          <button className="flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-slate-100">
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 p-5">
              <p className="text-sm text-slate-500">Showing 1 to 5 of 156 entries</p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 disabled:opacity-40"
                  disabled={page === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {[1, 2, 3, 4].map((p) => (
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
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right sidebar */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="mb-4 text-base font-semibold text-slate-900">Quick Actions</h3>
            <div className="space-y-3">
              <button className="flex w-full items-center gap-3 rounded-xl border border-slate-100 p-3 text-left hover:border-slate-200 hover:bg-slate-50">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <Plus className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-medium text-slate-800">New Software Request</p>
                  <p className="text-xs text-slate-400">Request a new software</p>
                </div>
              </button>
              <button className="flex w-full items-center gap-3 rounded-xl border border-slate-100 p-3 text-left hover:border-slate-200 hover:bg-slate-50">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
                  <UserPlus className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-medium text-slate-800">Request on Behalf</p>
                  <p className="text-xs text-slate-400">Request for another user</p>
                </div>
              </button>
              <button className="flex w-full items-center gap-3 rounded-xl border border-slate-100 p-3 text-left hover:border-slate-200 hover:bg-slate-50">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
                  <ClipboardList className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-medium text-slate-800">My Requests</p>
                  <p className="text-xs text-slate-400">View your submitted requests</p>
                </div>
              </button>
            </div>
          </div>

          {/* Requests by Priority */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="mb-4 text-base font-semibold text-slate-900">Requests by Priority</h3>
            <div className="flex items-center gap-6">
              <div className="relative h-[140px] w-[140px] shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={requestsByPriority} dataKey="value" nameKey="name" innerRadius={44} outerRadius={68} paddingAngle={2} stroke="none">
                      {requestsByPriority.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xl font-semibold text-slate-900">156</span>
                  <span className="text-xs text-slate-400">Total</span>
                </div>
              </div>
              <ul className="flex-1 space-y-2.5">
                {requestsByPriority.map((item) => (
                  <li key={item.name} className="flex items-center gap-2 text-sm">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="text-slate-600">{item.name}</span>
                    <span className="ml-auto whitespace-nowrap font-medium text-slate-900">
                      ({item.pct}%)
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Top Requested Software */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="mb-4 text-base font-semibold text-slate-900">Top Requested Software</h3>
            <ul className="space-y-3.5">
              {topRequestedSoftware.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.name} className="flex items-center gap-3">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${item.iconBg} text-white`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="flex-1 truncate text-sm text-slate-700">{item.name}</span>
                    <span className="text-sm font-semibold text-slate-900">{item.count}</span>
                  </li>
                );
              })}
            </ul>
            <button className="mt-4 flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline">
              View all software <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}