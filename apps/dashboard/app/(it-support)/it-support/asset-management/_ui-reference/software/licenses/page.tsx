'use client';

import { useState } from 'react';
import {
  FileText,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  CalendarClock,
  Download,
  Bell,
  Search,
  SlidersHorizontal,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Columns3,
  MoreHorizontal,
  Building2,
  Grid2x2,
  Tag,
  CircleDot,
  Plus,
  Grid3x3,
  Archive,
  Wallet,
  Coins,
  Users,
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell } from 'recharts';

// ---------- Mock Data ----------

const statCards = [
  {
    label: 'Total Licenses', value: '682', sub: 'Across 52 products', icon: FileText, color: 'blue',
    spark: [10, 14, 12, 16, 15, 18, 20], sparkColor: '#3b82f6',
  },
  {
    label: 'In Compliance', value: '512', sub: '75.1% of total', icon: CheckCircle2, color: 'green',
    spark: [12, 15, 14, 17, 16, 19, 21], sparkColor: '#22c55e',
  },
  {
    label: 'Over Licensed', value: '86', sub: '12.6% of total', icon: AlertTriangle, color: 'orange',
    spark: [18, 15, 17, 13, 16, 12, 14], sparkColor: '#f97316',
  },
  {
    label: 'Under Licensed', value: '62', sub: '9.1% of total', icon: AlertCircle, color: 'red',
    spark: [8, 12, 9, 14, 11, 15, 13], sparkColor: '#ef4444',
  },
  {
    label: 'Expiring Soon', value: '22', sub: 'In next 30 days', icon: CalendarClock, color: 'teal',
    spark: [20, 17, 19, 15, 18, 14, 16], sparkColor: '#14b8a6',
  },
] as const;

const ICON_STYLES: Record<string, string> = {
  blue: 'bg-blue-50 text-blue-600',
  green: 'bg-emerald-50 text-emerald-600',
  orange: 'bg-orange-50 text-orange-600',
  red: 'bg-red-50 text-red-600',
  teal: 'bg-teal-50 text-teal-600',
};

const filters = [
  { icon: Building2, label: 'All Publishers' },
  { icon: Grid2x2, label: 'All Categories' },
  { icon: Tag, label: 'All License Types' },
  { icon: CircleDot, label: 'All Statuses' },
];

type License = {
  software: string;
  publisher: string;
  licenseType: string;
  totalPurchased: number;
  inUse: number;
  available: number;
  status: 'In Compliance' | 'Over Licensed' | 'Under Licensed';
  renewalDate: string;
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
};

const licenses: License[] = [
  { software: 'Microsoft 365 E3', publisher: 'Microsoft', licenseType: 'Subscription', totalPurchased: 150, inUse: 132, available: 18, status: 'In Compliance', renewalDate: '15 Jun 2025', icon: Grid3x3, iconBg: 'bg-red-500' },
  { software: 'Adobe Acrobat Pro DC', publisher: 'Adobe Systems', licenseType: 'Named User', totalPurchased: 100, inUse: 96, available: 4, status: 'In Compliance', renewalDate: '20 May 2025', icon: Archive, iconBg: 'bg-red-600' },
  { software: 'Windows 11 Pro', publisher: 'Microsoft', licenseType: 'Perpetual', totalPurchased: 120, inUse: 118, available: 2, status: 'In Compliance', renewalDate: '—', icon: Grid2x2, iconBg: 'bg-blue-500' },
  { software: 'AutoCAD 2024', publisher: 'Autodesk', licenseType: 'Named User', totalPurchased: 50, inUse: 60, available: -10, status: 'Over Licensed', renewalDate: '10 Apr 2025', icon: Tag, iconBg: 'bg-blue-700' },
  { software: 'VMware vSphere', publisher: 'VMware', licenseType: 'Perpetual', totalPurchased: 30, inUse: 25, available: 5, status: 'In Compliance', renewalDate: '—', icon: CircleDot, iconBg: 'bg-slate-700' },
  { software: 'Slack Business+', publisher: 'Slack Technologies', licenseType: 'Subscription', totalPurchased: 80, inUse: 95, available: -15, status: 'Over Licensed', renewalDate: '05 Jun 2025', icon: Grid3x3, iconBg: 'bg-fuchsia-500' },
  { software: 'ESET Endpoint Security', publisher: 'ESET', licenseType: 'Subscription', totalPurchased: 200, inUse: 190, available: 10, status: 'In Compliance', renewalDate: '18 May 2025', icon: Columns3, iconBg: 'bg-sky-600' },
  { software: 'JetBrains All Products Pack', publisher: 'JetBrains', licenseType: 'Named User', totalPurchased: 40, inUse: 45, available: -5, status: 'Under Licensed', renewalDate: '02 Apr 2025', icon: FileText, iconBg: 'bg-slate-900' },
];

const licenseCompliance = [
  { name: 'In Compliance', value: 512, pct: 75.1, color: '#22c55e' },
  { name: 'Over Licensed', value: 86, pct: 12.6, color: '#f97316' },
  { name: 'Under Licensed', value: 62, pct: 9.1, color: '#ef4444' },
  { name: 'Expired', value: 12, pct: 1.8, color: '#8b5cf6' },
  { name: 'Unknown', value: 10, pct: 1.4, color: '#94a3b8' },
];

const licenseUsage = [
  { name: 'Microsoft 365 E3', inUse: 132, total: 150 },
  { name: 'Windows 11 Pro', inUse: 118, total: 120 },
  { name: 'Adobe Acrobat Pro DC', inUse: 96, total: 100 },
  { name: 'Slack Business+', inUse: 95, total: 80 },
  { name: 'AutoCAD 2024', inUse: 60, total: 50 },
];

const expiringLicenses = [
  { name: 'Adobe Acrobat Pro DC', date: '20 May 2025', daysLeft: 5, icon: Archive, iconBg: 'bg-red-600' },
  { name: 'ESET Endpoint Security', date: '18 May 2025', daysLeft: 3, icon: Columns3, iconBg: 'bg-sky-600' },
  { name: 'Microsoft 365 E3', date: '15 Jun 2025', daysLeft: 31, icon: Grid3x3, iconBg: 'bg-red-500' },
  { name: 'VMware vSphere', date: '22 Jun 2025', daysLeft: 38, icon: CircleDot, iconBg: 'bg-slate-700' },
  { name: 'Slack Business+', date: '05 Jun 2025', daysLeft: 21, icon: Grid3x3, iconBg: 'bg-fuchsia-500' },
];

const licenseSummary = [
  { label: 'Total Spend (YTD)', value: '$245,680', delta: '+12.6% vs last year', icon: Wallet, color: 'bg-blue-50 text-blue-600' },
  { label: 'Avg. Cost per License', value: '$89.65', delta: '+4.3% vs last year', icon: Coins, color: 'bg-emerald-50 text-emerald-600' },
  { label: 'Upcoming Renewals', value: '22', delta: 'In next 30 days', icon: CalendarClock, color: 'bg-violet-50 text-violet-600' },
  { label: 'Total Publishers', value: '42', delta: 'Active publishers', icon: Users, color: 'bg-amber-50 text-amber-600' },
];

// ---------- Small building blocks ----------

function StatCard({ stat }: { stat: (typeof statCards)[number] }) {
  const Icon = stat.icon;
  const sparkData = stat.spark.map((v, i) => ({ i, v }));
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${ICON_STYLES[stat.color]}`}>
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className={`text-sm font-medium ${ICON_STYLES[stat.color].split(' ')[1]}`}>{stat.label}</p>
            <p className="text-2xl font-semibold text-slate-900">{stat.value}</p>
          </div>
        </div>
        <div className="h-8 w-16 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkData}>
              <Area type="monotone" dataKey="v" stroke={stat.sparkColor} fill={stat.sparkColor} fillOpacity={0.12} strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
      <p className="mt-2 truncate text-xs text-slate-400">{stat.sub}</p>
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

function StatusPill({ status }: { status: License['status'] }) {
  const map: Record<License['status'], string> = {
    'In Compliance': 'bg-emerald-50 text-emerald-600',
    'Over Licensed': 'bg-amber-50 text-amber-600',
    'Under Licensed': 'bg-red-50 text-red-600',
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${map[status]}`}>{status}</span>;
}

function DaysLeftPill({ days }: { days: number }) {
  const color = days <= 7 ? 'bg-red-50 text-red-600' : days <= 30 ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-500';
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>{days} days</span>;
}

// ---------- Page ----------

export default function Page() {
  const [page, setPage] = useState(1);
  const totalPages = 86;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Licenses</h1>
          <p className="mt-1 text-sm text-slate-500">Manage software licenses, usage, and compliance across the organization.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
            <Download className="h-4 w-4 text-slate-400" />
            Export
          </button>
          <button className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
            <CalendarClock className="h-4 w-4 text-slate-400" />
            Renewals Report
          </button>
          <button className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">
            <Plus className="h-4 w-4" />
            Add License
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
              placeholder="Search by software, publisher, license key or SKU..."
              className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          {filters.map((f) => (
            <FilterPill key={f.label} icon={f.icon} label={f.label} />
          ))}
          <button className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
            <SlidersHorizontal className="h-4 w-4 text-slate-400" />
            More Filters
          </button>
          <button className="ml-auto text-sm font-medium text-blue-600 hover:underline">Clear All</button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between p-5">
          <h2 className="text-base font-semibold text-slate-900">License Overview (682)</h2>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
              <Columns3 className="h-4 w-4 text-slate-400" />
              Columns
            </button>
            <button className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-slate-100 text-left text-slate-400">
                <th className="whitespace-nowrap px-5 py-2.5 font-medium">Software</th>
                <th className="whitespace-nowrap px-5 py-2.5 font-medium">Publisher</th>
                <th className="whitespace-nowrap px-5 py-2.5 font-medium">License Type</th>
                <th className="whitespace-nowrap px-5 py-2.5 font-medium">Total Purchased</th>
                <th className="whitespace-nowrap px-5 py-2.5 font-medium">In Use</th>
                <th className="whitespace-nowrap px-5 py-2.5 font-medium">Available</th>
                <th className="whitespace-nowrap px-5 py-2.5 font-medium">Compliance Status</th>
                <th className="whitespace-nowrap px-5 py-2.5 font-medium">Renewal Date</th>
                <th className="whitespace-nowrap px-5 py-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {licenses.map((lic) => {
                const Icon = lic.icon;
                return (
                  <tr key={lic.software} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                    <td className="whitespace-nowrap px-5 py-2.5">
                      <span className="flex items-center gap-2.5 font-medium text-slate-800">
                        <span className={`flex h-6 w-6 items-center justify-center rounded ${lic.iconBg} text-white`}>
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        {lic.software}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-slate-600">{lic.publisher}</td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-slate-600">{lic.licenseType}</td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-slate-700">{lic.totalPurchased}</td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-slate-700">{lic.inUse}</td>
                    <td className={`whitespace-nowrap px-5 py-2.5 font-medium ${lic.available < 0 ? 'text-red-600' : 'text-slate-700'}`}>
                      {lic.available}
                    </td>
                    <td className="whitespace-nowrap px-5 py-2.5"><StatusPill status={lic.status} /></td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-slate-500">{lic.renewalDate}</td>
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
          <p className="text-sm text-slate-500">Showing 1 to 8 of 682 entries</p>
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

      {/* Footer: compliance donut + usage + expiring + summary */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        {/* License Compliance donut */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="mb-4 text-base font-semibold text-slate-900">License Compliance</h3>
          <div className="flex flex-col items-center gap-6">
            <div className="relative h-[170px] w-[170px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={licenseCompliance} dataKey="value" nameKey="name" innerRadius={55} outerRadius={82} paddingAngle={2} stroke="none">
                    {licenseCompliance.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-semibold text-slate-900">682</span>
                <span className="text-xs text-slate-400">Total</span>
              </div>
            </div>
            <ul className="w-full space-y-2.5">
              {licenseCompliance.map((item) => (
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
            View Compliance Report <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* License Usage bars */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="mb-4 text-base font-semibold text-slate-900">License Usage</h3>
          <ul className="space-y-4">
            {licenseUsage.map((item) => {
              const usedPct = Math.min((item.inUse / item.total) * 100, 100);
              const overLicensed = item.inUse > item.total;
              return (
                <li key={item.name}>
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="text-slate-700">{item.name}</span>
                    <span className={`font-medium ${overLicensed ? 'text-red-600' : 'text-slate-900'}`}>
                      {item.inUse} / {item.total}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${overLicensed ? 'bg-red-500' : 'bg-emerald-500'}`}
                      style={{ width: `${usedPct}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 flex items-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> In Use
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-slate-300" /> Available
            </span>
          </div>
          <button className="mt-4 flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline">
            View All Usage <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Expiring Licenses */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="mb-4 text-base font-semibold text-slate-900">Expiring Licenses</h3>
          <ul className="space-y-4">
            {expiringLicenses.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.name} className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${item.iconBg} text-white`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">{item.name}</p>
                      <p className="text-xs text-slate-400">{item.date}</p>
                    </div>
                  </div>
                  <DaysLeftPill days={item.daysLeft} />
                </li>
              );
            })}
          </ul>
          <button className="mt-4 flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline">
            View All Expiring <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* License Summary */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="mb-4 text-base font-semibold text-slate-900">License Summary</h3>
          <div className="grid grid-cols-2 gap-3">
            {licenseSummary.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="rounded-xl border border-slate-100 p-3">
                  <span className={`mb-2 flex h-8 w-8 items-center justify-center rounded-lg ${item.color}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <p className="text-lg font-semibold text-slate-900">{item.value}</p>
                  <p className="text-xs text-slate-500">{item.label}</p>
                  <p className="text-[11px] text-slate-400">{item.delta}</p>
                </div>
              );
            })}
          </div>
          <button className="mt-4 flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline">
            View License Analytics <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}