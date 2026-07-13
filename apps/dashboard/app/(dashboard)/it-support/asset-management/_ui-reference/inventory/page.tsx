'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  Package,
  MonitorCheck,
  Wrench,
  ShoppingBag,
  CalendarClock,
  Download,
  Radar,
  Plus,
  Search,
  SlidersHorizontal,
  MoreHorizontal,
  Building2,
  MapPin,
  Tag,
  CircleDot,
  Factory,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Laptop,
  Monitor,
  Printer,
  Server,
  Network,
  Tablet,
  MonitorSmartphone,
  Route,
  AlertTriangle,
  ShieldAlert,
  Info,
  FileText,
} from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

// ---------- Mock Data ----------

const statCards = [
  { label: 'Total Hardware', value: '1,248', sub: 'All locations', icon: Package, color: 'blue' },
  { label: 'In Use', value: '1,006', sub: '80.6% of total', delta: '5.3%', trend: 'up', icon: MonitorCheck, color: 'green' },
  { label: 'Under Maintenance', value: '126', sub: '10.1% of total', delta: '2.1%', trend: 'up', icon: Wrench, color: 'orange' },
  { label: 'Unassigned', value: '116', sub: '9.3% of total', delta: '1.4%', trend: 'down', icon: ShoppingBag, color: 'purple' },
  { label: 'Warranties Expiring', value: '28', sub: 'Next 30 days', delta: '12.5%', trend: 'up', icon: CalendarClock, color: 'teal' },
] as const;

const ICON_STYLES: Record<string, string> = {
  blue: 'bg-blue-50 text-blue-600',
  green: 'bg-emerald-50 text-emerald-600',
  orange: 'bg-orange-50 text-orange-600',
  purple: 'bg-violet-50 text-violet-600',
  teal: 'bg-teal-50 text-teal-600',
};

const filters = [
  { icon: Building2, label: 'All Departments' },
  { icon: MapPin, label: 'All Locations' },
  { icon: Tag, label: 'All Types' },
  { icon: CircleDot, label: 'All Statuses' },
  { icon: Factory, label: 'All Manufacturers' },
];

type Asset = {
  tag: string;
  type: string;
  model: string;
  manufacturer: string;
  serial: string;
  assignedTo: string | null;
  location: string;
  status: 'In Use' | 'Under Maintenance' | 'Unassigned';
  purchaseDate: string;
  warrantyExpiry: string;
  typeIcon: React.ComponentType<{ className?: string }>;
};

const hardwareAssets: Asset[] = [
  { tag: 'HW-2025-0001', type: 'Laptop', model: 'Latitude 5430', manufacturer: 'Dell', serial: 'D3F4G6H7K8L9', assignedTo: 'Sarah Johnson', location: 'New York Office', status: 'In Use', purchaseDate: '15 Jan 2024', warrantyExpiry: '15 Jan 2026', typeIcon: Laptop },
  { tag: 'HW-2025-0002', type: 'Desktop', model: 'EliteDesk 800 G9', manufacturer: 'HP', serial: '5CD234X7K9L1', assignedTo: 'Michael Brown', location: 'London Office', status: 'In Use', purchaseDate: '10 Feb 2024', warrantyExpiry: '10 Feb 2026', typeIcon: Monitor },
  { tag: 'HW-2025-0003', type: 'Monitor', model: 'P2722H', manufacturer: 'Dell', serial: 'CNDF3K2M7L6', assignedTo: 'Emily Davis', location: 'New York Office', status: 'In Use', purchaseDate: '05 Feb 2024', warrantyExpiry: '05 Feb 2026', typeIcon: MonitorSmartphone },
  { tag: 'HW-2025-0004', type: 'Laptop', model: 'ThinkPad E14', manufacturer: 'Lenovo', serial: 'PF2A9B1C3D4E5', assignedTo: 'David Wilson', location: 'Mumbai Office', status: 'Under Maintenance', purchaseDate: '20 Dec 2023', warrantyExpiry: '20 Dec 2025', typeIcon: Laptop },
  { tag: 'HW-2025-0005', type: 'Printer', model: 'LaserJet Pro M404', manufacturer: 'HP', serial: 'CNB3H7K2L9P1', assignedTo: null, location: 'London Office', status: 'Unassigned', purchaseDate: '18 Jan 2024', warrantyExpiry: '18 Jan 2026', typeIcon: Printer },
  { tag: 'HW-2025-0006', type: 'Server', model: 'PowerEdge R750', manufacturer: 'Dell', serial: '8XG7H3J2K5L0', assignedTo: 'IT Infrastructure', location: 'New York Office', status: 'In Use', purchaseDate: '01 Nov 2023', warrantyExpiry: '01 Nov 2026', typeIcon: Server },
  { tag: 'HW-2025-0007', type: 'Switch', model: 'SG350X-24', manufacturer: 'Cisco', serial: 'FCW234X9L8K1', assignedTo: 'IT Network Team', location: 'Mumbai Office', status: 'In Use', purchaseDate: '12 Feb 2024', warrantyExpiry: '12 Feb 2026', typeIcon: Network },
  { tag: 'HW-2025-0008', type: 'Tablet', model: 'iPad Air (5th Gen)', manufacturer: 'Apple', serial: 'GG7YH3F9J2K1', assignedTo: 'Olivia Martinez', location: 'Singapore Office', status: 'In Use', purchaseDate: '22 Mar 2024', warrantyExpiry: '22 Mar 2026', typeIcon: Tablet },
  { tag: 'HW-2025-0009', type: 'UPS', model: 'Back-UPS Pro 1500', manufacturer: 'APC', serial: 'ASD234DF7G8H', assignedTo: 'IT Infrastructure', location: 'London Office', status: 'Under Maintenance', purchaseDate: '17 Dec 2023', warrantyExpiry: '17 Dec 2025', typeIcon: Package },
  { tag: 'HW-2025-0010', type: 'Router', model: 'ISR 4331', manufacturer: 'Cisco', serial: 'QWE9RTY8U7I6', assignedTo: 'IT Network Team', location: 'New York Office', status: 'In Use', purchaseDate: '28 Jan 2024', warrantyExpiry: '28 Jan 2026', typeIcon: Route },
];

const hardwareByType = [
  { name: 'Laptops', value: 620, pct: 49.7, color: '#3b82f6' },
  { name: 'Desktops', value: 320, pct: 25.6, color: '#8b5cf6' },
  { name: 'Monitors', value: 150, pct: 12.0, color: '#ec4899' },
  { name: 'Servers', value: 80, pct: 6.4, color: '#f97316' },
  { name: 'Network Devices', value: 50, pct: 4.0, color: '#22c55e' },
  { name: 'Others', value: 28, pct: 2.3, color: '#94a3b8' },
];

const hardwareByLocation = [
  { name: 'New York Office', count: 512, pct: 41.0 },
  { name: 'London Office', count: 286, pct: 22.9 },
  { name: 'Mumbai Office', count: 218, pct: 17.5 },
  { name: 'Singapore Office', count: 142, pct: 11.4 },
  { name: 'Others', count: 90, pct: 7.2 },
];

const recentAlerts = [
  { text: '28 warranties expiring in the next 30 days', icon: AlertTriangle, color: 'bg-red-50 text-red-600' },
  { text: '126 assets are under maintenance', icon: ShieldAlert, color: 'bg-amber-50 text-amber-600' },
  { text: '116 unassigned assets available', icon: Info, color: 'bg-blue-50 text-blue-600' },
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
        <div className="flex items-center gap-2">
          <p className="text-2xl font-semibold text-slate-900">{stat.value}</p>
          {'delta' in stat && stat.delta ? (
            <span className={`text-xs font-medium ${stat.trend === 'up' ? 'text-emerald-600' : 'text-red-500'}`}>
              {stat.trend === 'up' ? '↑' : '↓'} {stat.delta}
            </span>
          ) : null}
        </div>
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

function StatusPill({ status }: { status: Asset['status'] }) {
  const map: Record<Asset['status'], string> = {
    'In Use': 'bg-emerald-50 text-emerald-600',
    'Under Maintenance': 'bg-amber-50 text-amber-600',
    Unassigned: 'bg-violet-50 text-violet-600',
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${map[status]}`}>{status}</span>;
}

// ---------- Page ----------

export default function Page() {
  const [page, setPage] = useState(1);
  const totalPages = 125;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Hardware Inventory</h1>
          <p className="mt-1 text-sm text-slate-500">View and manage all hardware assets across your organization.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
            <Download className="h-4 w-4 text-slate-400" />
            Export
          </button>
          <button className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
            <Radar className="h-4 w-4 text-slate-400" />
            Scan Network
          </button>
          <Link href="/asset-management/inventory/create" className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">
            <Plus className="h-4 w-4" />
            Add New Asset
          </Link>
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
              placeholder="Search by asset tag, serial number, model, or assigned user..."
              className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <button className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
            <SlidersHorizontal className="h-4 w-4 text-slate-400" />
            Filters
          </button>
          <button className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50">
            <MoreHorizontal className="h-4 w-4" />
          </button>
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
          <h2 className="text-base font-semibold text-slate-900">Hardware Assets (1,248)</h2>
          <div className="flex items-center gap-2">
            <Link href="/asset-management/inventory/create" className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">
              <Plus className="h-4 w-4" />
              Add New Asset
            </Link>
            <button className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-slate-100 text-left text-slate-400">
                <th className="whitespace-nowrap px-5 py-2.5 font-medium">Asset Tag ⇅</th>
                <th className="whitespace-nowrap px-5 py-2.5 font-medium">Type</th>
                <th className="whitespace-nowrap px-5 py-2.5 font-medium">Model</th>
                <th className="whitespace-nowrap px-5 py-2.5 font-medium">Manufacturer</th>
                <th className="whitespace-nowrap px-5 py-2.5 font-medium">Serial Number</th>
                <th className="whitespace-nowrap px-5 py-2.5 font-medium">Assigned To</th>
                <th className="whitespace-nowrap px-5 py-2.5 font-medium">Location</th>
                <th className="whitespace-nowrap px-5 py-2.5 font-medium">Status</th>
                <th className="whitespace-nowrap px-5 py-2.5 font-medium">Purchase Date</th>
                <th className="whitespace-nowrap px-5 py-2.5 font-medium">Warranty Expiry</th>
                <th className="whitespace-nowrap px-5 py-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {hardwareAssets.map((asset) => {
                const TypeIcon = asset.typeIcon;
                return (
                  <tr key={asset.tag} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                    <td className="whitespace-nowrap px-5 py-2.5">
                      <span className="flex items-center gap-2 font-mono text-blue-600">
                        <TypeIcon className="h-3.5 w-3.5 text-slate-400" />
                        {asset.tag}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-slate-600">{asset.type}</td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-slate-700">{asset.model}</td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-slate-600">{asset.manufacturer}</td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-slate-500">{asset.serial}</td>
                    <td className="whitespace-nowrap px-5 py-2.5">
                      <span className="flex items-center gap-2">
                        <span
                          className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-medium ${
                            asset.assignedTo ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-400'
                          }`}
                        >
                          {asset.assignedTo
                            ? asset.assignedTo
                                .split(' ')
                                .map((n) => n[0])
                                .join('')
                                .slice(0, 2)
                            : '—'}
                        </span>
                        <span className={asset.assignedTo ? 'text-slate-700' : 'text-slate-400'}>
                          {asset.assignedTo ?? 'Unassigned'}
                        </span>
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-slate-600">{asset.location}</td>
                    <td className="whitespace-nowrap px-5 py-2.5"><StatusPill status={asset.status} /></td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-slate-500">{asset.purchaseDate}</td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-slate-500">{asset.warrantyExpiry}</td>
                    <td className="whitespace-nowrap px-5 py-2.5">
                      <button className="flex h-7 w-7 items-center justify-center rounded hover:bg-slate-100 text-slate-400">
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
          <p className="text-sm text-slate-500">Showing 1 to 10 of 1,248 entries</p>
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

      {/* Footer: Type donut + Location bars + Alerts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="mb-4 text-base font-semibold text-slate-900">Hardware by Type</h3>
          <div className="flex items-center gap-6">
            <div className="relative h-[150px] w-[150px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={hardwareByType} dataKey="value" nameKey="name" innerRadius={48} outerRadius={72} paddingAngle={2} stroke="none">
                    {hardwareByType.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-semibold text-slate-900">1,248</span>
                <span className="text-xs text-slate-400">Total</span>
              </div>
            </div>
            <ul className="flex-1 space-y-2.5">
              {hardwareByType.map((item) => (
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
            View Full Report <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="mb-4 text-base font-semibold text-slate-900">Hardware by Location</h3>
          <ul className="space-y-4">
            {hardwareByLocation.map((loc) => (
              <li key={loc.name}>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className="text-slate-700">{loc.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-blue-500" style={{ width: `${loc.pct}%` }} />
                  </div>
                  <span className="whitespace-nowrap text-sm font-medium text-slate-900">
                    {loc.count} <span className="font-normal text-slate-400">({loc.pct}%)</span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
          <button className="mt-4 flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline">
            View All Locations <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="mb-4 text-base font-semibold text-slate-900">Recent Alerts</h3>
          <ul className="space-y-4">
            {recentAlerts.map((alert, i) => {
              const Icon = alert.icon;
              return (
                <li key={i} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${alert.color}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <p className="text-sm text-slate-700">{alert.text}</p>
                  </div>
                  <button className="whitespace-nowrap text-sm font-medium text-blue-600 hover:underline">View Details</button>
                </li>
              );
            })}
          </ul>
          <button className="mt-4 flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline">
            View All Alerts <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}