'use client';

import { useState, type ChangeEvent, type FormEvent, type ComponentType } from 'react';
import {
  ShoppingCart,
  FileText,
  Truck,
  PackageCheck,
  DollarSign,
  Download,
  Bell,
  Search,
  SlidersHorizontal,
  Grid2x2,
  MoreHorizontal,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Plus,
  Calendar,
  HardDrive,
  Grid3x3,
  Truck as TruckIcon,
  Tag as TagIcon,
} from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell } from 'recharts';

// ---------- Mock Data ----------

const statCards = [
  { label: 'Total Spend (YTD)', value: '$245,680.00', sub: '↑ 14.6% vs last year', icon: ShoppingCart, color: 'blue' },
  { label: 'Purchase Orders', value: '128', sub: '24 Pending  •  98 Completed', icon: FileText, color: 'green' },
  { label: 'Pending Receipts', value: '15', sub: 'Est. Value $32,450.00', icon: Truck, color: 'orange' },
  { label: 'Completed (YTD)', value: '113', sub: 'On-time Delivery 92%', icon: PackageCheck, color: 'purple' },
  { label: 'Budget Utilization', value: '68%', sub: '$245,680 of $360,000', icon: DollarSign, color: 'sky' },
] as const;

const ICON_STYLES: Record<string, string> = {
  blue: 'bg-blue-50 text-blue-600',
  green: 'bg-emerald-50 text-emerald-600',
  orange: 'bg-orange-50 text-orange-600',
  purple: 'bg-violet-50 text-violet-600',
  sky: 'bg-sky-50 text-sky-600',
};

const spendTrend = [
  { month: 'Jan', spend: 22000 },
  { month: 'Feb', spend: 18000 },
  { month: 'Mar', spend: 32000 },
  { month: 'Apr', spend: 45000 },
  { month: 'May', spend: 58000 },
  { month: 'Jun', spend: 30000 },
  { month: 'Jul', spend: 24000 },
  { month: 'Aug', spend: 28000 },
  { month: 'Sep', spend: 38000 },
  { month: 'Oct', spend: 34000 },
  { month: 'Nov', spend: 22000 },
  { month: 'Dec', spend: 26000 },
];

const spendByCategory = [
  { name: 'Hardware', value: 112400, pct: 45.7, color: '#3b82f6' },
  { name: 'Software', value: 78900, pct: 32.1, color: '#22c55e' },
  { name: 'Services', value: 32650, pct: 13.3, color: '#f97316' },
  { name: 'Accessories', value: 21730, pct: 8.9, color: '#8b5cf6' },
];

const poStatus = [
  { label: 'Draft', count: 8, color: 'bg-slate-100 text-slate-600' },
  { label: 'Pending Approval', count: 24, color: 'bg-amber-50 text-amber-600' },
  { label: 'Approved', count: 36, color: 'bg-emerald-50 text-emerald-600' },
  { label: 'Partially Received', count: 12, color: 'bg-blue-50 text-blue-600' },
  { label: 'Completed', count: 98, color: 'bg-emerald-50 text-emerald-600' },
];

type PO = {
  id: string;
  vendor: string;
  vendorIcon: ComponentType<{ className?: string }>;
  vendorIconBg: string;
  category: string;
  categoryIcon: ComponentType<{ className?: string }>;
  poDate: string;
  expectedDate: string;
  status: 'Pending Approval' | 'Approved' | 'Partially Received' | 'Completed';
  totalAmount: string;
  receivedPct: number;
};

const initialPurchaseOrders: PO[] = [
  { id: 'PO-2025-0128', vendor: 'Dell Technologies', vendorIcon: HardDrive, vendorIconBg: 'bg-sky-100 text-sky-600', category: 'Hardware', categoryIcon: HardDrive, poDate: '12 May 2025', expectedDate: '20 May 2025', status: 'Pending Approval', totalAmount: '$18,450.00', receivedPct: 0 },
  { id: 'PO-2025-0127', vendor: 'Microsoft', vendorIcon: Grid3x3, vendorIconBg: 'bg-blue-50 text-blue-600', category: 'Software', categoryIcon: Grid3x3, poDate: '10 May 2025', expectedDate: '15 May 2025', status: 'Approved', totalAmount: '$32,250.00', receivedPct: 0 },
  { id: 'PO-2025-0126', vendor: 'CDW', vendorIcon: TruckIcon, vendorIconBg: 'bg-red-50 text-red-600', category: 'Hardware', categoryIcon: HardDrive, poDate: '08 May 2025', expectedDate: '17 May 2025', status: 'Partially Received', totalAmount: '$12,890.00', receivedPct: 60 },
  { id: 'PO-2025-0125', vendor: 'HP Inc.', vendorIcon: HardDrive, vendorIconBg: 'bg-blue-50 text-blue-600', category: 'Hardware', categoryIcon: HardDrive, poDate: '05 May 2025', expectedDate: '12 May 2025', status: 'Completed', totalAmount: '$24,500.00', receivedPct: 100 },
  { id: 'PO-2025-0124', vendor: 'Adobe Systems', vendorIcon: TagIcon, vendorIconBg: 'bg-red-50 text-red-600', category: 'Software', categoryIcon: Grid3x3, poDate: '02 May 2025', expectedDate: '08 May 2025', status: 'Completed', totalAmount: '$9,980.00', receivedPct: 100 },
];

const topVendors = [
  { name: 'Dell Technologies', amount: 62450, pct: 100 },
  { name: 'Microsoft', amount: 32250, pct: 52 },
  { name: 'HP Inc.', amount: 24500, pct: 39 },
  { name: 'CDW', amount: 21780, pct: 35 },
  { name: 'Adobe Systems', amount: 18980, pct: 30 },
];

const recentPOs = [
  { id: 'PO-2025-0128', vendor: 'Dell Technologies', status: 'Pending Approval', amount: '$18,450.00', date: '12 May 2025' },
  { id: 'PO-2025-0127', vendor: 'Microsoft', status: 'Approved', amount: '$32,250.00', date: '10 May 2025' },
  { id: 'PO-2025-0126', vendor: 'CDW', status: 'Partially Received', amount: '$12,890.00', date: '08 May 2025' },
  { id: 'PO-2025-0125', vendor: 'HP Inc.', status: 'Completed', amount: '$24,500.00', date: '05 May 2025' },
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

function StatusPill({ status }: { status: PO['status'] }) {
  const map: Record<PO['status'], string> = {
    'Pending Approval': 'bg-amber-50 text-amber-600',
    Approved: 'bg-emerald-50 text-emerald-600',
    'Partially Received': 'bg-blue-50 text-blue-600',
    Completed: 'bg-emerald-50 text-emerald-600',
  };
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${map[status]}`}>{status}</span>;
}

function ReceivedBar({ pct }: { pct: number }) {
  const color = pct === 100 ? 'bg-emerald-500' : pct > 0 ? 'bg-blue-500' : 'bg-slate-200';
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-9 text-xs text-slate-500">{pct}%</span>
    </div>
  );
}

// ---------- Page ----------

const DEFAULT_NEW_PO: Omit<PO, 'id' | 'vendorIcon' | 'vendorIconBg' | 'categoryIcon'> = {
  vendor: '',
  category: 'Hardware',
  poDate: '',
  expectedDate: '',
  status: 'Pending Approval',
  totalAmount: '',
  receivedPct: 0,
};

function getCategoryIcon(category: string) {
  return category === 'Software' ? Grid3x3 : HardDrive;
}

function getVendorIconBg(vendor: string) {
  const label = vendor.toLowerCase();
  if (label.includes('dell')) return 'bg-sky-100 text-sky-600';
  if (label.includes('microsoft')) return 'bg-blue-50 text-blue-600';
  if (label.includes('hp')) return 'bg-slate-100 text-slate-600';
  if (label.includes('cdw')) return 'bg-red-50 text-red-600';
  if (label.includes('adobe')) return 'bg-fuchsia-50 text-fuchsia-600';
  return 'bg-slate-100 text-slate-600';
}

export default function Page() {
  const [page, setPage] = useState(1);
  const [purchaseOrders, setPurchaseOrders] = useState<PO[]>(initialPurchaseOrders);
  const [showForm, setShowForm] = useState(false);
  const [newPO, setNewPO] = useState(DEFAULT_NEW_PO);
  const totalPages = 26;

  const handleNewPOChange = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = event.target;
    setNewPO((prev) => ({
      ...prev,
      [name]: name === 'receivedPct' ? Number(value) : value,
    }));
  };

  const handleCreatePO = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const categoryIcon = getCategoryIcon(newPO.category);
    const vendorIconBg = getVendorIconBg(newPO.vendor);
    const newItem: PO = {
      id: `PO-${Date.now()}`,
      vendor: newPO.vendor || 'New Vendor',
      vendorIcon: categoryIcon,
      vendorIconBg,
      category: newPO.category,
      categoryIcon,
      poDate: newPO.poDate || 'TBD',
      expectedDate: newPO.expectedDate || 'TBD',
      status: newPO.status,
      totalAmount: newPO.totalAmount ? `$${newPO.totalAmount}` : '$0.00',
      receivedPct: newPO.receivedPct || 0,
    };
    setPurchaseOrders((prev) => [newItem, ...prev]);
    setNewPO(DEFAULT_NEW_PO);
    setShowForm(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Procurement</h1>
          <p className="mt-1 text-sm text-slate-500">Manage purchase orders, track deliveries, and monitor procurement spend.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
            <Download className="h-4 w-4 text-slate-400" />
            Export
          </button>
          <button className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
            <FileText className="h-4 w-4 text-slate-400" />
            Reports
          </button>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            New Purchase Order
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

      {showForm ? (
        <div className="rounded-3xl border border-blue-200 bg-blue-50 p-6 shadow-sm">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Create Purchase Order</h2>
              <p className="text-sm text-slate-600">Enter the details below and save to add a new PO.</p>
            </div>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              Cancel
            </button>
          </div>
          <form onSubmit={handleCreatePO} className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-4 rounded-3xl bg-white p-4 shadow-sm">
              <label className="block text-sm font-medium text-slate-700">Vendor</label>
              <input
                name="vendor"
                value={newPO.vendor}
                onChange={handleNewPOChange}
                placeholder="Vendor name"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div className="space-y-4 rounded-3xl bg-white p-4 shadow-sm">
              <label className="block text-sm font-medium text-slate-700">Category</label>
              <select
                name="category"
                value={newPO.category}
                onChange={handleNewPOChange}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              >
                <option value="Hardware">Hardware</option>
                <option value="Software">Software</option>
                <option value="Services">Services</option>
              </select>
            </div>
            <div className="space-y-4 rounded-3xl bg-white p-4 shadow-sm">
              <label className="block text-sm font-medium text-slate-700">PO Date</label>
              <input
                name="poDate"
                type="date"
                value={newPO.poDate}
                onChange={handleNewPOChange}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div className="space-y-4 rounded-3xl bg-white p-4 shadow-sm">
              <label className="block text-sm font-medium text-slate-700">Expected Date</label>
              <input
                name="expectedDate"
                type="date"
                value={newPO.expectedDate}
                onChange={handleNewPOChange}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div className="space-y-4 rounded-3xl bg-white p-4 shadow-sm">
              <label className="block text-sm font-medium text-slate-700">Status</label>
              <select
                name="status"
                value={newPO.status}
                onChange={handleNewPOChange}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              >
                <option value="Pending Approval">Pending Approval</option>
                <option value="Approved">Approved</option>
                <option value="Partially Received">Partially Received</option>
                <option value="Completed">Completed</option>
              </select>
            </div>
            <div className="space-y-4 rounded-3xl bg-white p-4 shadow-sm">
              <label className="block text-sm font-medium text-slate-700">Total Amount</label>
              <input
                name="totalAmount"
                value={newPO.totalAmount}
                onChange={handleNewPOChange}
                placeholder="e.g. 18,450.00"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div className="space-y-4 rounded-3xl bg-white p-4 shadow-sm">
              <label className="block text-sm font-medium text-slate-700">Received %</label>
              <input
                name="receivedPct"
                type="number"
                min="0"
                max="100"
                value={newPO.receivedPct}
                onChange={handleNewPOChange}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div className="lg:col-span-3 flex flex-col gap-3 rounded-3xl bg-white p-4 shadow-sm">
              <button type="submit" className="inline-flex items-center justify-center rounded-full bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700">
                Create Purchase Order
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {statCards.map((stat) => (
          <StatCard key={stat.label} stat={stat} />
        ))}
      </div>

      {/* Purchase Overview */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-5 text-base font-semibold text-slate-900">Purchase Overview</h2>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.3fr_1fr_0.8fr]">
          {/* Spend Trend */}
          <div>
            <h3 className="mb-3 text-sm font-medium text-slate-500">Spend Trend (Monthly)</h3>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={spendTrend} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `$${v / 1000}K`}
                  />
                  <Tooltip formatter={((value: any) => [`$${Number(value).toLocaleString()}`, 'Spend']) as any} />
                  <Line type="monotone" dataKey="spend" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3, fill: '#3b82f6' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Spend by Category */}
          <div>
            <h3 className="mb-3 text-sm font-medium text-slate-500">Spend by Category</h3>
            <div className="flex items-center gap-6">
              <div className="relative h-[150px] w-[150px] shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={spendByCategory} dataKey="value" nameKey="name" innerRadius={48} outerRadius={72} paddingAngle={2} stroke="none">
                      {spendByCategory.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-lg font-semibold text-slate-900">$245,680</span>
                  <span className="text-xs text-slate-400">Total</span>
                </div>
              </div>
              <ul className="flex-1 space-y-2.5">
                {spendByCategory.map((item) => (
                  <li key={item.name} className="flex items-center gap-2 text-sm">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="text-slate-600">{item.name}</span>
                    <span className="ml-auto whitespace-nowrap font-medium text-slate-900">
                      ${item.value.toLocaleString()} <span className="font-normal text-slate-400">({item.pct}%)</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* PO Status */}
          <div>
            <h3 className="mb-3 text-sm font-medium text-slate-500">PO Status</h3>
            <ul className="space-y-3">
              {poStatus.map((s) => (
                <li key={s.label} className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">{s.label}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.color}`}>{s.count}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Purchase Orders table */}
      <div className="rounded-2xl border border-slate-200 bg-white">
        <div className="p-5">
          <h2 className="mb-4 text-base font-semibold text-slate-900">Purchase Orders</h2>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search PO number, vendor, item..."
                className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <button className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-50">
              All Status <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
            </button>
            <button className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-50">
              All Vendors <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
            </button>
            <button className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-50">
              All Categories <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
            </button>
            <button className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-50">
              <Calendar className="h-4 w-4 text-slate-400" />
              01 Apr 2025 - 31 May 2025
            </button>
            <button className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
              <SlidersHorizontal className="h-4 w-4 text-slate-400" />
              Filters
            </button>
            <button className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50">
              <Grid2x2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-slate-100 text-left text-slate-400">
                <th className="whitespace-nowrap px-5 py-2.5 font-medium">PO Number</th>
                <th className="whitespace-nowrap px-5 py-2.5 font-medium">Vendor</th>
                <th className="whitespace-nowrap px-5 py-2.5 font-medium">Category</th>
                <th className="whitespace-nowrap px-5 py-2.5 font-medium">PO Date</th>
                <th className="whitespace-nowrap px-5 py-2.5 font-medium">Expected Date</th>
                <th className="whitespace-nowrap px-5 py-2.5 font-medium">Status</th>
                <th className="whitespace-nowrap px-5 py-2.5 font-medium">Total Amount</th>
                <th className="whitespace-nowrap px-5 py-2.5 font-medium">Received</th>
                <th className="whitespace-nowrap px-5 py-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {purchaseOrders.map((po) => {
                const VendorIcon = po.vendorIcon;
                const CategoryIcon = po.categoryIcon;
                return (
                  <tr key={po.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                    <td className="whitespace-nowrap px-5 py-2.5 font-mono text-blue-600">{po.id}</td>
                    <td className="whitespace-nowrap px-5 py-2.5">
                      <span className="flex items-center gap-2.5 font-medium text-slate-800">
                        <span className={`flex h-6 w-6 items-center justify-center rounded-full ${po.vendorIconBg}`}>
                          <VendorIcon className="h-3.5 w-3.5" />
                        </span>
                        {po.vendor}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-2.5">
                      <span className="flex items-center gap-1.5 text-slate-600">
                        <CategoryIcon className="h-3.5 w-3.5 text-slate-400" />
                        {po.category}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-slate-500">{po.poDate}</td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-slate-500">{po.expectedDate}</td>
                    <td className="whitespace-nowrap px-5 py-2.5"><StatusPill status={po.status} /></td>
                    <td className="whitespace-nowrap px-5 py-2.5 font-medium text-slate-800">{po.totalAmount}</td>
                    <td className="whitespace-nowrap px-5 py-2.5"><ReceivedBar pct={po.receivedPct} /></td>
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
          <p className="text-sm text-slate-500">Showing 1 to 5 of 128 entries</p>
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

      {/* Footer: vendors + savings + recent POs */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Top Vendors by Spend */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="mb-4 text-base font-semibold text-slate-900">Top Vendors by Spend</h3>
          <ul className="space-y-4">
            {topVendors.map((v) => (
              <li key={v.name}>
                <div className="mb-1.5 text-sm text-slate-700">{v.name}</div>
                <div className="flex items-center gap-3">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-blue-500" style={{ width: `${v.pct}%` }} />
                  </div>
                  <span className="whitespace-nowrap text-sm font-medium text-slate-900">${v.amount.toLocaleString()}</span>
                </div>
              </li>
            ))}
          </ul>
          <button className="mt-4 flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline">
            View all vendors <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Savings Summary */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="mb-4 text-base font-semibold text-slate-900">Savings Summary</h3>
          <div className="mb-4 flex items-center gap-4 rounded-xl bg-emerald-50 p-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
              <TagIcon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm text-emerald-700">Total Savings (YTD)</p>
              <p className="text-2xl font-semibold text-emerald-700">$18,750.00</p>
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 pt-4 text-sm">
            <span className="text-slate-500">Potential Savings Identified</span>
            <span className="font-semibold text-slate-900">$6,240.00</span>
          </div>
          <button className="mt-4 flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline">
            View savings report <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Recent Purchase Orders */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="mb-4 text-base font-semibold text-slate-900">Recent Purchase Orders</h3>
          <ul className="space-y-3.5">
            {recentPOs.map((po) => (
              <li key={po.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-blue-600">{po.id}</p>
                  <p className="truncate text-xs text-slate-500">{po.vendor}</p>
                </div>
                <StatusPill status={po.status as PO['status']} />
                <div className="text-right">
                  <p className="whitespace-nowrap text-sm font-medium text-slate-800">{po.amount}</p>
                  <p className="whitespace-nowrap text-xs text-slate-400">{po.date}</p>
                </div>
              </li>
            ))}
          </ul>
          <button className="mt-4 flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline">
            View all purchase orders <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}