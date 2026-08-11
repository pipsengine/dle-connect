'use client';

import {
  Boxes,
  Laptop2,
  Wallet,
  Wrench,
  ShieldAlert,
  Trash2,
  ChevronDown,
  Download,
  Bell,
  SlidersHorizontal,
  ShoppingCart,
  CheckCircle2,
  PackageX,
  AlertTriangle,
  ShieldCheck,
  Info,
  Headset,
  Calendar,
  MapPin,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

// ---------- Mock Data ----------

const statCards = [
  {
    label: 'Total Assets',
    value: '4,238',
    delta: '12.5%',
    trend: 'up',
    icon: Boxes,
    color: 'blue',
    spark: [12, 18, 14, 20, 17, 22, 19, 25, 21, 27],
    sparkColor: '#3b82f6',
  },
  {
    label: 'Active Assets',
    value: '3,748',
    delta: '8.3%',
    trend: 'up',
    icon: Laptop2,
    color: 'green',
    spark: [10, 14, 12, 16, 13, 18, 15, 20, 18, 22],
    sparkColor: '#22c55e',
  },
  {
    label: 'Asset Value (Total)',
    value: '$2.48M',
    delta: '15.7%',
    trend: 'up',
    icon: Wallet,
    color: 'purple',
    spark: [8, 12, 10, 15, 13, 17, 15, 19, 17, 21],
    sparkColor: '#8b5cf6',
  },
  {
    label: 'Assets Due for Maintenance',
    value: '128',
    delta: '4.2%',
    trend: 'up',
    icon: Wrench,
    color: 'orange',
    spark: [20, 16, 19, 15, 18, 14, 17, 13, 16, 12],
    sparkColor: '#f97316',
  },
  {
    label: 'Warranty Expiring Soon',
    value: '67',
    delta: '6.1%',
    trend: 'down',
    icon: ShieldAlert,
    color: 'amber',
    spark: [22, 20, 18, 19, 16, 17, 14, 15, 13, 12],
    sparkColor: '#eab308',
  },
  {
    label: 'Retirement Due (90 Days)',
    value: '82',
    delta: '3.4%',
    trend: 'up',
    icon: Trash2,
    color: 'red',
    spark: [10, 13, 11, 15, 12, 16, 14, 18, 15, 19],
    sparkColor: '#ef4444',
  },
] as const;

const ICON_STYLES: Record<string, string> = {
  blue: 'bg-blue-50 text-blue-600',
  green: 'bg-emerald-50 text-emerald-600',
  purple: 'bg-violet-50 text-violet-600',
  orange: 'bg-orange-50 text-orange-600',
  amber: 'bg-amber-50 text-amber-600',
  red: 'bg-red-50 text-red-600',
};

const assetOverview = [
  { name: 'Computers', value: 1642, pct: 38.8, color: '#3b82f6' },
  { name: 'Mobile Devices', value: 842, pct: 19.9, color: '#22c55e' },
  { name: 'Printers', value: 326, pct: 7.7, color: '#eab308' },
  { name: 'Servers', value: 284, pct: 6.7, color: '#8b5cf6' },
  { name: 'Networking', value: 512, pct: 12.1, color: '#06b6d4' },
  { name: 'Others', value: 632, pct: 14.8, color: '#94a3b8' },
];

const assetsByStatus = [
  { name: 'Active', value: 3748, pct: 88.4, color: '#22c55e' },
  { name: 'Inactive', value: 248, pct: 5.8, color: '#eab308' },
  { name: 'Under Maintenance', value: 128, pct: 3.0, color: '#f97316' },
  { name: 'Retired', value: 114, pct: 2.7, color: '#ef4444' },
];

const locations = [
  { name: 'New York Office', count: 1248, x: 26, y: 38 },
  { name: 'London Office', count: 842, x: 47, y: 30 },
  { name: 'San Francisco Office', count: 632, x: 12, y: 42 },
  { name: 'Mumbai Office', count: 486, x: 66, y: 52 },
  { name: 'Singapore Office', count: 384, x: 75, y: 60 },
  { name: 'Others', count: 646, x: 0, y: 0 },
];

const recentAssets = [
  { tag: 'AST-10045', name: 'MacBook Pro 16"', type: 'Laptop', assignedTo: 'Emily Johnson', location: 'New York Office', status: 'Active', updated: '2h ago' },
  { tag: 'AST-10046', name: 'Dell OptiPlex 7090', type: 'Desktop', assignedTo: 'Michael Brown', location: 'London Office', status: 'Active', updated: '3h ago' },
  { tag: 'AST-10047', name: 'HP LaserJet Pro M404', type: 'Printer', assignedTo: 'Unassigned', location: 'Mumbai Office', status: 'Under Maintenance', updated: '5h ago' },
  { tag: 'AST-10048', name: 'Cisco Catalyst 9300', type: 'Switch', assignedTo: 'IT Network Team', location: 'San Francisco Office', status: 'Active', updated: '6h ago' },
  { tag: 'AST-10049', name: 'iPhone 15 Pro', type: 'Mobile', assignedTo: 'Sarah Davis', location: 'Singapore Office', status: 'Active', updated: '7h ago' },
];

const warrantyOverview = [
  { name: 'Active', value: 152, pct: 54.9, color: '#22c55e' },
  { name: 'Expiring in 30 Days', value: 45, pct: 16.2, color: '#eab308' },
  { name: 'Expiring in 60 Days', value: 38, pct: 13.7, color: '#f97316' },
  { name: 'Expired', value: 42, pct: 15.2, color: '#ef4444' },
];

const lifecycleSummary = [
  { label: 'Procured', value: 320, icon: ShoppingCart, color: 'bg-blue-50 text-blue-600' },
  { label: 'Deployed', value: 287, icon: CheckCircle2, color: 'bg-emerald-50 text-emerald-600' },
  { label: 'Retired', value: 42, icon: PackageX, color: 'bg-amber-50 text-amber-600' },
  { label: 'Disposed', value: 18, icon: Trash2, color: 'bg-red-50 text-red-600' },
];

const topCategories = [
  { label: 'Servers', value: '$892K', pct: 36 },
  { label: 'Computers', value: '$782K', pct: 31 },
  { label: 'Networking', value: '$412K', pct: 17 },
  { label: 'Storage', value: '$248K', pct: 10 },
  { label: 'Others', value: '$146K', pct: 6 },
];

const alerts = [
  { text: '67 assets have warranty expiring in the next 30 days.', icon: AlertTriangle, color: 'bg-red-50 text-red-600' },
  { text: '128 assets are due for maintenance.', icon: ShieldCheck, color: 'bg-amber-50 text-amber-600' },
  { text: '82 assets are due for retirement in the next 90 days.', icon: Info, color: 'bg-blue-50 text-blue-600' },
];

// ---------- Small building blocks ----------

function StatCard({ stat }: { stat: (typeof statCards)[number] }) {
  const Icon = stat.icon;
  const sparkData = stat.spark.map((v, i) => ({ i, v }));
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${ICON_STYLES[stat.color]}`}>
          <Icon className="h-5 w-5" />
        </span>
        <p className="text-sm text-slate-500">{stat.label}</p>
      </div>
      <p className="mt-3 text-2xl font-semibold text-slate-900">{stat.value}</p>
      <p className={`mt-1 text-xs font-medium ${stat.trend === 'up' ? 'text-emerald-600' : 'text-red-500'}`}>
        {stat.trend === 'up' ? '↑' : '↓'} {stat.delta} vs last 30 days
      </p>
      <div className="mt-2 h-8">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={sparkData}>
            <Area type="monotone" dataKey="v" stroke={stat.sparkColor} fill={stat.sparkColor} fillOpacity={0.12} strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function SectionCard({
  title,
  action,
  children,
  className = '',
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-5 ${className}`}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function DonutChart({
  data,
  total,
  totalLabel,
}: {
  data: { name: string; value: number; color: string }[];
  total: number;
  totalLabel: string;
}) {
  return (
    <div className="relative mx-auto h-[190px] w-[190px] shrink-0">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={62} outerRadius={90} paddingAngle={2} stroke="none">
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-semibold text-slate-900">{total.toLocaleString()}</span>
        <span className="text-xs text-slate-400">{totalLabel}</span>
      </div>
    </div>
  );
}

function DonutLegend({ data, showPct = true }: { data: { name: string; value: number; pct?: number; color: string }[]; showPct?: boolean }) {
  return (
    <ul className="w-full space-y-3">
      {data.map((d) => (
        <li key={d.name} className="flex items-center gap-2 text-sm">
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: d.color }} />
          <span className="text-slate-600">{d.name}</span>
          <span className="ml-auto whitespace-nowrap font-medium text-slate-900">
            {d.value.toLocaleString()}
            {showPct && d.pct !== undefined ? <span className="ml-1 font-normal text-slate-400">({d.pct}%)</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    Active: 'bg-emerald-50 text-emerald-600',
    'Under Maintenance': 'bg-amber-50 text-amber-600',
    Inactive: 'bg-slate-100 text-slate-500',
    Retired: 'bg-red-50 text-red-600',
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${map[status] || 'bg-slate-100 text-slate-600'}`}>{status}</span>;
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.min(pct * 2, 100)}%` }} />
    </div>
  );
}

// ---------- Page ----------

export default function Page() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Asset Management Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">
            Dashboard <span className="mx-1 text-slate-300">›</span>
            Asset Management <span className="mx-1 text-slate-300">›</span>
            <span className="text-slate-700">Overview</span>
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
            <Calendar className="h-4 w-4 text-slate-400" />
            May 12 – May 18, 2025
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
          </button>
          <button className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
            <MapPin className="h-4 w-4 text-slate-400" />
            All Locations
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
          </button>
          <button className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
            <SlidersHorizontal className="h-4 w-4 text-slate-400" />
            More Filters
          </button>
          <button className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <Download className="h-4 w-4 text-slate-400" />
            Export
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
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {statCards.map((stat) => (
          <StatCard key={stat.label} stat={stat} />
        ))}
      </div>

      {/* Overview + Status + Location */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard title="Asset Overview">
          <div className="flex flex-col items-center gap-6 sm:flex-row">
            <DonutChart data={assetOverview} total={4238} totalLabel="Total Assets" />
            <DonutLegend data={assetOverview} />
          </div>
        </SectionCard>

        <SectionCard title="Assets by Status">
          <div className="flex flex-col items-center gap-6 sm:flex-row">
            <DonutChart data={assetsByStatus} total={4238} totalLabel="Total Assets" />
            <DonutLegend data={assetsByStatus} />
          </div>
        </SectionCard>

        <SectionCard title="Assets by Location">
          <div className="relative mb-4 h-[150px] w-full overflow-hidden rounded-xl bg-blue-50">
            <svg viewBox="0 0 100 70" className="absolute inset-0 h-full w-full opacity-40">
              <path d="M5 30 Q 20 15 35 25 T 60 20 T 95 30 L 95 50 Q 70 60 50 50 T 5 45 Z" fill="#93c5fd" />
            </svg>
            {locations
              .filter((l) => l.x > 0)
              .map((loc) => (
                <span
                  key={loc.name}
                  className="absolute flex h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-blue-600 ring-4 ring-blue-600/20"
                  style={{ left: `${loc.x}%`, top: `${loc.y}%` }}
                  title={loc.name}
                />
              ))}
          </div>
          <ul className="space-y-2.5">
            {locations.map((loc) => (
              <li key={loc.name} className="flex items-center justify-between text-sm">
                <span className="text-slate-600">{loc.name}</span>
                <span className="font-medium text-slate-900">{loc.count.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      {/* Recent assets + warranty */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard
          title="Recent Assets"
          className="lg:col-span-2"
        >
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-slate-400">
                  <th className="whitespace-nowrap px-5 py-2 font-medium">Asset Tag</th>
                  <th className="whitespace-nowrap px-5 py-2 font-medium">Asset Name</th>
                  <th className="whitespace-nowrap px-5 py-2 font-medium">Type</th>
                  <th className="whitespace-nowrap px-5 py-2 font-medium">Assigned To</th>
                  <th className="whitespace-nowrap px-5 py-2 font-medium">Location</th>
                  <th className="whitespace-nowrap px-5 py-2 font-medium">Status</th>
                  <th className="whitespace-nowrap px-5 py-2 font-medium">Last Updated</th>
                </tr>
              </thead>
              <tbody>
                {recentAssets.map((asset) => (
                  <tr key={asset.tag} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                    <td className="whitespace-nowrap px-5 py-2.5 font-mono text-blue-600">{asset.tag}</td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-slate-700">{asset.name}</td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-slate-600">{asset.type}</td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-slate-600">{asset.assignedTo}</td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-slate-600">{asset.location}</td>
                    <td className="whitespace-nowrap px-5 py-2.5"><StatusPill status={asset.status} /></td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-slate-400">{asset.updated}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="mt-4 text-sm font-medium text-blue-600 hover:underline">View All Assets</button>
        </SectionCard>

        <SectionCard title="Warranty & Contracts Overview">
          <div className="flex flex-col items-center gap-6">
            <DonutChart data={warrantyOverview} total={277} totalLabel="Total" />
            <DonutLegend data={warrantyOverview} />
          </div>
          <button className="mt-4 text-sm font-medium text-blue-600 hover:underline">View All Contracts</button>
        </SectionCard>
      </div>

      {/* Lifecycle + categories + alerts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard title="Asset Lifecycle Summary">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2">
            {lifecycleSummary.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="flex flex-col items-center rounded-xl border border-slate-100 p-4 text-center">
                  <span className={`mb-2 flex h-10 w-10 items-center justify-center rounded-full ${item.color}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <p className="text-2xl font-semibold text-slate-900">{item.value}</p>
                  <p className="text-xs text-slate-500">{item.label}</p>
                  <p className="text-[11px] text-slate-400">This Month</p>
                </div>
              );
            })}
          </div>
          <button className="mt-4 text-sm font-medium text-blue-600 hover:underline">View Lifecycle Report</button>
        </SectionCard>

        <SectionCard title="Top Asset Categories by Value">
          <ul className="space-y-4">
            {topCategories.map((cat) => (
              <li key={cat.label}>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className="text-slate-700">{cat.label}</span>
                  <span className="font-medium text-slate-900">
                    {cat.value} <span className="font-normal text-slate-400">({cat.pct}%)</span>
                  </span>
                </div>
                <ProgressBar pct={cat.pct} />
              </li>
            ))}
          </ul>
          <button className="mt-4 text-sm font-medium text-blue-600 hover:underline">View Full Report</button>
        </SectionCard>

        <SectionCard title="Alerts & Notifications">
          <ul className="space-y-4">
            {alerts.map((alert, i) => {
              const Icon = alert.icon;
              return (
                <li key={i} className="flex items-start gap-3">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${alert.color}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="flex-1">
                    <p className="text-sm text-slate-700">{alert.text}</p>
                    <button className="mt-0.5 text-xs font-medium text-blue-600 hover:underline">View Details</button>
                  </div>
                </li>
              );
            })}
          </ul>
          <button className="mt-4 text-sm font-medium text-blue-600 hover:underline">View All Alerts</button>
        </SectionCard>
      </div>
    </div>
  );
}