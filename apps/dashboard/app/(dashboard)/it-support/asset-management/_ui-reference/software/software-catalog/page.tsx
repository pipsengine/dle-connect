'use client';

import { useState } from 'react';
import {
  Grid3x3,
  CheckCircle2,
  Clock,
  XCircle,
  Download,
  Bell,
  Search,
  SlidersHorizontal,
  Grid2x2,
  List,
  RefreshCw,
  MoreHorizontal,
  Tag,
  Building2,
  Monitor,
  CircleDot,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Plus,
  Apple,
  Terminal,
  Braces,
  Shield,
  MonitorPlay,
  MessageSquare,
  Archive,
  Code2,
  Wrench,
  Package,
} from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

// ---------- Mock Data ----------

const statCards = [
  { label: 'Total Software', value: '278', sub: 'All software in catalog', icon: Grid3x3, color: 'blue' },
  { label: 'Approved', value: '224', sub: '80.6% of total', icon: CheckCircle2, color: 'green' },
  { label: 'Pending Approval', value: '18', sub: '6.5% of total', icon: Clock, color: 'orange' },
  { label: 'Deprecated', value: '20', sub: '7.2% of total', icon: XCircle, color: 'purple' },
  { label: 'Recently Added', value: '16', sub: 'In last 30 days', icon: Download, color: 'teal' },
] as const;

const ICON_STYLES: Record<string, string> = {
  blue: 'bg-blue-50 text-blue-600',
  green: 'bg-emerald-50 text-emerald-600',
  orange: 'bg-orange-50 text-orange-600',
  purple: 'bg-violet-50 text-violet-600',
  teal: 'bg-teal-50 text-teal-600',
};

const filters = [
  { icon: Grid2x2, label: 'All Categories' },
  { icon: Building2, label: 'All Publishers' },
  { icon: Monitor, label: 'All Platforms' },
  { icon: CircleDot, label: 'All Status' },
];

type Software = {
  name: string;
  publisher: string;
  category: string;
  platforms: ('windows' | 'mac' | 'linux')[];
  version: string;
  status: 'Approved' | 'Pending' | 'Deprecated';
  licenseType: string;
  addedOn: string;
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
};

const softwareList: Software[] = [
  { name: 'Microsoft 365 Apps', publisher: 'Microsoft', category: 'Productivity', platforms: ['windows'], version: '2305 (Build 16501.20210)', status: 'Approved', licenseType: 'Subscription', addedOn: '12 May 2025', icon: Grid3x3, iconBg: 'bg-red-500' },
  { name: 'Adobe Acrobat Reader DC', publisher: 'Adobe Systems', category: 'Utilities', platforms: ['windows'], version: '24.002.20687', status: 'Approved', licenseType: 'Free', addedOn: '09 May 2025', icon: Archive, iconBg: 'bg-red-600' },
  { name: 'Zoom Workplace', publisher: 'Zoom Video Comm.', category: 'Communication', platforms: ['windows'], version: '6.0.13 (31634)', status: 'Approved', licenseType: 'Subscription', addedOn: '07 May 2025', icon: MessageSquare, iconBg: 'bg-blue-500' },
  { name: 'Google Chrome', publisher: 'Google LLC', category: 'Web Browser', platforms: ['windows'], version: '124.0.6367.118', status: 'Approved', licenseType: 'Free', addedOn: '10 May 2025', icon: CircleDot, iconBg: 'bg-amber-500' },
  { name: 'Java 8 Update 381', publisher: 'Oracle', category: 'Runtime', platforms: ['windows'], version: '8u381', status: 'Approved', licenseType: 'Free', addedOn: '04 May 2025', icon: Braces, iconBg: 'bg-orange-500' },
  { name: 'VLC Media Player', publisher: 'VideoLAN', category: 'Media Player', platforms: ['windows', 'mac'], version: '3.0.20', status: 'Approved', licenseType: 'Free', addedOn: '02 May 2025', icon: MonitorPlay, iconBg: 'bg-orange-600' },
  { name: 'Slack', publisher: 'Slack Technologies', category: 'Communication', platforms: ['windows', 'mac', 'linux'], version: '4.38.132', status: 'Approved', licenseType: 'Subscription', addedOn: '01 May 2025', icon: MessageSquare, iconBg: 'bg-fuchsia-500' },
  { name: '7-Zip', publisher: 'Igor Pavlov', category: 'Compression', platforms: ['windows'], version: '24.08', status: 'Pending', licenseType: 'Free', addedOn: '29 Apr 2025', icon: Package, iconBg: 'bg-slate-700' },
  { name: 'Notepad++', publisher: 'Notepad++ Team', category: 'Developer Tools', platforms: ['windows'], version: '8.6.7', status: 'Approved', licenseType: 'Free', addedOn: '05 May 2025', icon: Code2, iconBg: 'bg-emerald-600' },
  { name: 'TeamViewer', publisher: 'TeamViewer GmbH', category: 'Remote Access', platforms: ['windows', 'mac'], version: '15.54.5', status: 'Deprecated', licenseType: 'Subscription', addedOn: '10 Apr 2025', icon: Monitor, iconBg: 'bg-blue-600' },
];

const softwareByCategory = [
  { name: 'Productivity', value: 78, pct: 28.1, color: '#3b82f6' },
  { name: 'Utilities', value: 52, pct: 18.7, color: '#8b5cf6' },
  { name: 'Communication', value: 48, pct: 17.3, color: '#06b6d4' },
  { name: 'Developer Tools', value: 32, pct: 11.5, color: '#eab308' },
  { name: 'Security', value: 28, pct: 10.1, color: '#f97316' },
  { name: 'Others', value: 40, pct: 14.4, color: '#94a3b8' },
];

const softwareByPlatform = [
  { name: 'Windows', value: 212, pct: 76.3, color: '#3b82f6' },
  { name: 'macOS', value: 38, pct: 13.7, color: '#22c55e' },
  { name: 'Linux', value: 18, pct: 6.5, color: '#f97316' },
  { name: 'Web Based', value: 10, pct: 3.6, color: '#eab308' },
];

const topPublishers = [
  { name: 'Microsoft', count: 52, pct: 18.7 },
  { name: 'Google LLC', count: 32, pct: 11.5 },
  { name: 'Adobe Systems', count: 24, pct: 8.6 },
  { name: 'Oracle', count: 20, pct: 7.2 },
  { name: 'Zoom Video Comm.', count: 18, pct: 6.5 },
];

const recentAdditions = [
  { name: 'Cisco Webex', date: 'Added on 11 May 2025', icon: MonitorPlay, iconBg: 'bg-blue-500' },
  { name: 'Git for Windows', date: 'Added on 10 May 2025', icon: Terminal, iconBg: 'bg-orange-500' },
  { name: 'AnyDesk', date: 'Added on 09 May 2025', icon: Monitor, iconBg: 'bg-red-500' },
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

function FilterPill({ icon: Icon, label }: { icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <button className="flex flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
      <Icon className="h-4 w-4 text-slate-400" />
      <span className="flex-1 truncate text-left">{label}</span>
      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
    </button>
  );
}

function StatusPill({ status }: { status: Software['status'] }) {
  const map: Record<Software['status'], string> = {
    Approved: 'bg-emerald-50 text-emerald-600',
    Pending: 'bg-amber-50 text-amber-600',
    Deprecated: 'bg-red-50 text-red-600',
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${map[status]}`}>{status}</span>;
}

function PlatformIcons({ platforms }: { platforms: Software['platforms'] }) {
  return (
    <div className="flex items-center gap-1.5 text-slate-400">
      {platforms.includes('windows') && <Monitor className="h-3.5 w-3.5" />}
      {platforms.includes('mac') && <Apple className="h-3.5 w-3.5" />}
      {platforms.includes('linux') && <Terminal className="h-3.5 w-3.5" />}
    </div>
  );
}

function DonutPanel({
  title,
  data,
  total,
  reportLabel,
}: {
  title: string;
  data: { name: string; value: number; pct: number; color: string }[];
  total: number;
  reportLabel: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="mb-4 text-base font-semibold text-slate-900">{title}</h3>
      <div className="flex items-center gap-6">
        <div className="relative h-[150px] w-[150px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" innerRadius={48} outerRadius={72} paddingAngle={2} stroke="none">
                {data.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-semibold text-slate-900">{total}</span>
            <span className="text-xs text-slate-400">Total</span>
          </div>
        </div>
        <ul className="flex-1 space-y-2.5">
          {data.map((item) => (
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
      <button className="mt-4 flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline">
        {reportLabel} <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ---------- Page ----------

export default function Page() {
  const [page, setPage] = useState(1);
  const [view, setView] = useState<'grid' | 'list'>('list');
  const totalPages = 28;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Software Catalog</h1>
          <p className="mt-1 text-sm text-slate-500">Browse and manage all approved software available in your organization.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
            <Download className="h-4 w-4 text-slate-400" />
            Export
          </button>
          <button className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">
            <Plus className="h-4 w-4" />
            Add Software
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

      {/* Search + filters */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by software name, publisher, category, or tag..."
              className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <button className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
            <SlidersHorizontal className="h-4 w-4 text-slate-400" />
            Filters
          </button>
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
            <button
              onClick={() => setView('grid')}
              className={`flex h-7 w-7 items-center justify-center rounded ${view === 'grid' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-50'}`}
            >
              <Grid2x2 className="h-4 w-4" />
            </button>
            <button
              onClick={() => setView('list')}
              className={`flex h-7 w-7 items-center justify-center rounded ${view === 'list' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-50'}`}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          {filters.map((f) => (
            <FilterPill key={f.label} icon={f.icon} label={f.label} />
          ))}
          <button className="text-sm font-medium text-blue-600 hover:underline">Clear All</button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between p-5">
          <h2 className="text-base font-semibold text-slate-900">Software ({278})</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-slate-100 text-left text-slate-400">
                <th className="whitespace-nowrap px-5 py-2.5 font-medium">
                  <span className="flex items-center gap-1">
                    Software Name <ChevronsUpDown className="h-3 w-3" />
                  </span>
                </th>
                <th className="whitespace-nowrap px-5 py-2.5 font-medium">Publisher</th>
                <th className="whitespace-nowrap px-5 py-2.5 font-medium">Category</th>
                <th className="whitespace-nowrap px-5 py-2.5 font-medium">Platform</th>
                <th className="whitespace-nowrap px-5 py-2.5 font-medium">Version</th>
                <th className="whitespace-nowrap px-5 py-2.5 font-medium">Status</th>
                <th className="whitespace-nowrap px-5 py-2.5 font-medium">License Type</th>
                <th className="whitespace-nowrap px-5 py-2.5 font-medium">Added On</th>
                <th className="whitespace-nowrap px-5 py-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {softwareList.map((sw) => {
                const Icon = sw.icon;
                return (
                  <tr key={sw.name} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                    <td className="whitespace-nowrap px-5 py-2.5">
                      <span className="flex items-center gap-2.5 font-medium text-slate-800">
                        <span className={`flex h-6 w-6 items-center justify-center rounded ${sw.iconBg} text-white`}>
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        {sw.name}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-slate-600">{sw.publisher}</td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-slate-600">{sw.category}</td>
                    <td className="whitespace-nowrap px-5 py-2.5"><PlatformIcons platforms={sw.platforms} /></td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-slate-500">{sw.version}</td>
                    <td className="whitespace-nowrap px-5 py-2.5"><StatusPill status={sw.status} /></td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-slate-600">{sw.licenseType}</td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-slate-500">{sw.addedOn}</td>
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
          <p className="text-sm text-slate-500">Showing 1 to 10 of 278 entries</p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 disabled:opacity-40"
              disabled={page === 1}
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
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Footer: donuts + publishers + recent additions */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <DonutPanel title="Software by Category" data={softwareByCategory} total={278} reportLabel="View Category Report" />
        <DonutPanel title="Software by Platform" data={softwareByPlatform} total={278} reportLabel="View Platform Report" />

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="mb-4 text-base font-semibold text-slate-900">Top Publishers</h3>
          <ul className="space-y-4">
            {topPublishers.map((pub) => (
              <li key={pub.name}>
                <div className="mb-1.5 text-sm text-slate-700">{pub.name}</div>
                <div className="flex items-center gap-3">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-blue-500" style={{ width: `${pub.pct * 4}%` }} />
                  </div>
                  <span className="whitespace-nowrap text-sm font-medium text-slate-900">
                    {pub.count} <span className="font-normal text-slate-400">({pub.pct}%)</span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
          <button className="mt-4 flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline">
            View All Publishers <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="mb-4 text-base font-semibold text-slate-900">Recent Additions</h3>
          <ul className="space-y-4">
            {recentAdditions.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.name} className="flex items-center gap-3">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${item.iconBg} text-white`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">{item.name}</p>
                    <p className="text-xs text-slate-400">{item.date}</p>
                  </div>
                </li>
              );
            })}
          </ul>
          <button className="mt-4 flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline">
            View All Recent <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}