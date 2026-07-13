'use client';

import { useState, useMemo } from 'react';
import {
  ShieldCheck,
  CalendarCheck,
  AlertCircle,
  BellRing,
  FileText,
  Download,
  Bell,
  Search,
  SlidersHorizontal,
  List,
  Grid2x2,
  MoreHorizontal,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Plus,
  X,
  Clock,
  Laptop,
  Printer,
  Network,
  Grid3x3,
  Server,
  MonitorSmartphone,
  Shield,
  Aperture,
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell } from 'recharts';

// ---------- Mock Data ----------

const statCards = [
  { label: 'Total Assets Under Warranty', value: '237', sub: 'Across 12 categories', icon: ShieldCheck, color: 'blue' },
  { label: 'Active Warranties', value: '186', sub: '78.5% of total', icon: CalendarCheck, color: 'green' },
  { label: 'Expiring Within 30 Days', value: '18', sub: '7.6% of total', icon: AlertCircle, color: 'orange' },
  { label: 'Expired Warranties', value: '33', sub: '13.9% of total', icon: BellRing, color: 'red' },
  { label: 'Total Coverage Value', value: '$1,245,680', sub: 'Across all active warranties', icon: FileText, color: 'purple' },
] as const;

const ICON_STYLES: Record<string, string> = {
  blue: 'bg-blue-50 text-blue-600',
  green: 'bg-emerald-50 text-emerald-600',
  orange: 'bg-orange-50 text-orange-600',
  red: 'bg-red-50 text-red-600',
  purple: 'bg-violet-50 text-violet-600',
};

type WarrantyStatus = 'Active' | 'Expired' | 'Expiring Soon';

type Warranty = {
  id: string;
  assetName: string;
  assetCode: string;
  assetType: string;
  vendor: string;
  vendorIconBg: string;
  vendorIcon: React.ComponentType<{ className?: string }>;
  serial: string;
  warrantyType: string;
  coverageStart: string;
  coverageEnd: string;
  status: WarrantyStatus;
  daysLeft: number;
  assetIcon: React.ComponentType<{ className?: string }>;
};

const initialWarranties: Warranty[] = [
  { id: 'w1', assetName: 'Dell Latitude 7420', assetCode: 'IT-LAP-001', assetType: 'Laptop', vendor: 'Dell Technologies', vendorIcon: Aperture, vendorIconBg: 'bg-sky-100 text-sky-700', serial: 'ABC123DEF456', warrantyType: 'Standard', coverageStart: '15 Jul 2024', coverageEnd: '14 Jul 2026', status: 'Active', daysLeft: 42, assetIcon: Laptop },
  { id: 'w2', assetName: 'HP LaserJet Pro M404dn', assetCode: 'IT-PRN-012', assetType: 'Printer', vendor: 'HP Inc.', vendorIcon: Aperture, vendorIconBg: 'bg-sky-100 text-sky-700', serial: 'CNB3K2N7Z2', warrantyType: 'Standard', coverageStart: '10 Mar 2024', coverageEnd: '09 Mar 2026', status: 'Active', daysLeft: 275, assetIcon: Printer },
  { id: 'w3', assetName: 'Cisco Catalyst 2960-X', assetCode: 'IT-SWT-003', assetType: 'Network Switch', vendor: 'Cisco Systems', vendorIcon: Network, vendorIconBg: 'bg-sky-100 text-sky-700', serial: 'FDO2341X1A2', warrantyType: 'Standard', coverageStart: '05 Jan 2024', coverageEnd: '04 Jan 2026', status: 'Active', daysLeft: 240, assetIcon: Network },
  { id: 'w4', assetName: 'Microsoft 365 Business', assetCode: 'SUB-M365-001', assetType: 'Subscription', vendor: 'Microsoft', vendorIcon: Grid3x3, vendorIconBg: 'bg-blue-100 text-blue-700', serial: 'N/A', warrantyType: 'Subscription', coverageStart: '01 Jan 2025', coverageEnd: '31 Dec 2025', status: 'Active', daysLeft: 130, assetIcon: Grid3x3 },
  { id: 'w5', assetName: 'APC Smart-UPS 1500VA', assetCode: 'IT-UPS-007', assetType: 'UPS', vendor: 'Schneider Electric', vendorIcon: Shield, vendorIconBg: 'bg-emerald-100 text-emerald-700', serial: 'AS1234567890', warrantyType: 'Standard', coverageStart: '20 Feb 2023', coverageEnd: '19 Feb 2025', status: 'Expired', daysLeft: -15, assetIcon: Server },
  { id: 'w6', assetName: 'Lenovo ThinkPad X1 Carbon', assetCode: 'IT-LAP-008', assetType: 'Laptop', vendor: 'Lenovo', vendorIcon: Aperture, vendorIconBg: 'bg-red-100 text-red-700', serial: 'PF3MXXXX', warrantyType: 'Premium', coverageStart: '12 Jun 2024', coverageEnd: '11 Jun 2025', status: 'Expiring Soon', daysLeft: 8, assetIcon: Laptop },
  { id: 'w7', assetName: 'FortiGate 60F', assetCode: 'IT-FW-004', assetType: 'Firewall', vendor: 'Fortinet', vendorIcon: Shield, vendorIconBg: 'bg-red-100 text-red-700', serial: 'FGT60FTK22001234', warrantyType: 'Standard', coverageStart: '18 Apr 2024', coverageEnd: '17 Apr 2026', status: 'Active', daysLeft: 322, assetIcon: Shield },
  { id: 'w8', assetName: 'Epson EB-X51 Projector', assetCode: 'IT-PROJ-002', assetType: 'Projector', vendor: 'Epson', vendorIcon: MonitorSmartphone, vendorIconBg: 'bg-sky-100 text-sky-700', serial: 'X5K1234567', warrantyType: 'Standard', coverageStart: '30 Aug 2022', coverageEnd: '29 Aug 2024', status: 'Expired', daysLeft: -274, assetIcon: MonitorSmartphone },
];

const ASSET_TYPES = ['Laptop', 'Desktop', 'Printer', 'Network Switch', 'Subscription', 'UPS', 'Firewall', 'Projector', 'Server'];
const WARRANTY_TYPES = ['Standard', 'Premium', 'Subscription', 'Extended'];
const STATUSES: WarrantyStatus[] = ['Active', 'Expiring Soon', 'Expired'];

const warrantyAlerts = [
  { text: '18 warranties', sub: 'Expiring within 30 days', icon: Clock, color: 'bg-orange-50 text-orange-600' },
  { text: '33 warranties', sub: 'Already expired', icon: AlertCircle, color: 'bg-red-50 text-red-600' },
  { text: '5 warranties', sub: 'Missing registration', icon: BellRing, color: 'bg-blue-50 text-blue-600' },
];

const warrantiesByStatus = [
  { name: 'Active', value: 186, pct: 78.5, color: '#22c55e' },
  { name: 'Expiring Soon', value: 18, pct: 7.6, color: '#f97316' },
  { name: 'Expired', value: 33, pct: 13.9, color: '#ef4444' },
];

const topVendorsByAssets = [
  { name: 'Dell Technologies', count: 72, pct: 100 },
  { name: 'HP Inc.', count: 41, pct: 57 },
  { name: 'Microsoft', count: 28, pct: 39 },
  { name: 'Cisco Systems', count: 22, pct: 31 },
  { name: 'Lenovo', count: 18, pct: 25 },
];

const coverageTimeline = [
  { month: 'May \'25', active: 45, expiring: 8 },
  { month: 'Jun \'25', active: 62, expiring: 18 },
  { month: 'Jul \'25', active: 55, expiring: 12 },
  { month: 'Aug \'25', active: 68, expiring: 22 },
  { month: 'Sep \'25', active: 58, expiring: 15 },
  { month: 'Oct \'25', active: 64, expiring: 20 },
  { month: 'Nov \'25', active: 60, expiring: 17 },
  { month: 'Dec \'25', active: 66, expiring: 19 },
];

const coverageBreakdown = [
  { label: 'Hardware', amount: '$985,420', pct: 79.1 },
  { label: 'Software & Subscriptions', amount: '$210,260', pct: 16.9 },
  { label: 'Services', amount: '$49,000', pct: 3.9 },
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

function StatusPill({ status }: { status: WarrantyStatus }) {
  const map: Record<WarrantyStatus, string> = {
    Active: 'bg-emerald-50 text-emerald-600',
    Expired: 'bg-red-50 text-red-600',
    'Expiring Soon': 'bg-amber-50 text-amber-600',
  };
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${map[status]}`}>{status}</span>;
}

function DaysLeftPill({ days }: { days: number }) {
  const color = days < 0 ? 'bg-red-50 text-red-600' : days <= 30 ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-600';
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>{days}</span>;
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

// ---------- Add Warranty modal ----------

function AddWarrantyModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (w: Warranty) => void;
}) {
  const [form, setForm] = useState({
    assetName: '',
    assetCode: '',
    assetType: 'Laptop',
    vendor: '',
    serial: '',
    warrantyType: 'Standard',
    coverageStart: '',
    coverageEnd: '',
    status: 'Active' as WarrantyStatus,
  });
  const [error, setError] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.assetName.trim() || !form.vendor.trim() || !form.coverageEnd) {
      setError('Please fill in asset name, vendor, and coverage end date.');
      return;
    }

    const endDate = new Date(form.coverageEnd);
    const daysLeft = Math.round((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

    const newWarranty: Warranty = {
      id: `w-${Date.now()}`,
      assetName: form.assetName,
      assetCode: form.assetCode || '—',
      assetType: form.assetType,
      vendor: form.vendor,
      vendorIcon: Aperture,
      vendorIconBg: 'bg-blue-100 text-blue-700',
      serial: form.serial || 'N/A',
      warrantyType: form.warrantyType,
      coverageStart: form.coverageStart
        ? new Date(form.coverageStart).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })
        : '—',
      coverageEnd: new Date(form.coverageEnd).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }),
      status: form.status,
      daysLeft,
      assetIcon: Laptop,
    };

    onSave(newWarranty);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Add Warranty</h2>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Asset / Product Name *">
            <input name="assetName" value={form.assetName} onChange={handleChange} placeholder="e.g., Dell Latitude 7420" className={inputClass} />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Asset Code">
              <input name="assetCode" value={form.assetCode} onChange={handleChange} placeholder="IT-LAP-001" className={inputClass} />
            </Field>
            <Field label="Asset Type">
              <select name="assetType" value={form.assetType} onChange={handleChange} className={inputClass}>
                {ASSET_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Vendor *">
              <input name="vendor" value={form.vendor} onChange={handleChange} placeholder="e.g., Dell Technologies" className={inputClass} />
            </Field>
            <Field label="Serial Number">
              <input name="serial" value={form.serial} onChange={handleChange} placeholder="Serial / SKU" className={inputClass} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Warranty Type">
              <select name="warrantyType" value={form.warrantyType} onChange={handleChange} className={inputClass}>
                {WARRANTY_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <select name="status" value={form.status} onChange={handleChange} className={inputClass}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Coverage Start">
              <input type="date" name="coverageStart" value={form.coverageStart} onChange={handleChange} className={inputClass} />
            </Field>
            <Field label="Coverage End *">
              <input type="date" name="coverageEnd" value={form.coverageEnd} onChange={handleChange} className={inputClass} />
            </Field>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
              Add Warranty
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------- Page ----------

export default function Page() {
  const [warranties, setWarranties] = useState<Warranty[]>(initialWarranties);
  const [page, setPage] = useState(1);
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const totalPages = 30;

  const filteredWarranties = useMemo(() => {
    if (!searchQuery.trim()) return warranties;
    const q = searchQuery.toLowerCase();
    return warranties.filter(
      (w) => w.assetName.toLowerCase().includes(q) || w.serial.toLowerCase().includes(q) || w.vendor.toLowerCase().includes(q)
    );
  }, [warranties, searchQuery]);

  const handleSaveWarranty = (w: Warranty) => {
    setWarranties((prev) => [w, ...prev]);
    setIsModalOpen(false);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Warranties</h1>
          <p className="mt-1 text-sm text-slate-500">Track and manage warranty coverage for all assets and products.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
            <Download className="h-4 w-4 text-slate-400" />
            Export
          </button>
          <button className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
            <FileText className="h-4 w-4 text-slate-400" />
            Warranty Report
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Add Warranty
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
          {/* Search + filters */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
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
                  placeholder="Search by asset name, serial number, vendor..."
                  className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <button className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-50">
                All Status <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              </button>
              <button className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-50">
                All Asset Types <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              </button>
              <button className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-50">
                All Vendors <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              </button>
              <button className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
                <SlidersHorizontal className="h-4 w-4 text-slate-400" />
                More Filters
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="rounded-2xl border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 p-5">
              <h2 className="text-base font-semibold text-slate-900">Warranties ({filteredWarranties.length})</h2>
              <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
                <button
                  onClick={() => setView('list')}
                  className={`flex h-7 w-7 items-center justify-center rounded ${view === 'list' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-50'}`}
                >
                  <List className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setView('grid')}
                  className={`flex h-7 w-7 items-center justify-center rounded ${view === 'grid' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-50'}`}
                >
                  <Grid2x2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            {view === 'list' ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-y border-slate-100 text-left text-slate-400">
                      <th className="whitespace-nowrap px-5 py-2.5 font-medium">Asset / Product</th>
                      <th className="whitespace-nowrap px-5 py-2.5 font-medium">Asset Type</th>
                      <th className="whitespace-nowrap px-5 py-2.5 font-medium">Vendor</th>
                      <th className="whitespace-nowrap px-5 py-2.5 font-medium">Serial Number</th>
                      <th className="whitespace-nowrap px-5 py-2.5 font-medium">Warranty Type</th>
                      <th className="whitespace-nowrap px-5 py-2.5 font-medium">Coverage Period</th>
                      <th className="whitespace-nowrap px-5 py-2.5 font-medium">Status</th>
                      <th className="whitespace-nowrap px-5 py-2.5 font-medium">
                        <span className="flex items-center gap-1">Days Left <ChevronsUpDown className="h-3 w-3" /></span>
                      </th>
                      <th className="whitespace-nowrap px-5 py-2.5 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredWarranties.map((w) => {
                      const AssetIcon = w.assetIcon;
                      const VendorIcon = w.vendorIcon;
                      return (
                        <tr key={w.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                          <td className="whitespace-nowrap px-5 py-2.5">
                            <span className="flex items-center gap-2.5">
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                                <AssetIcon className="h-4 w-4" />
                              </span>
                              <span>
                                <p className="font-medium text-slate-800">{w.assetName}</p>
                                <p className="text-xs text-slate-400">{w.assetCode}</p>
                              </span>
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-5 py-2.5 text-slate-600">{w.assetType}</td>
                          <td className="whitespace-nowrap px-5 py-2.5">
                            <span className="flex items-center gap-2 text-slate-600">
                              <span className={`flex h-5 w-5 items-center justify-center rounded-full ${w.vendorIconBg}`}>
                                <VendorIcon className="h-3 w-3" />
                              </span>
                              {w.vendor}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-5 py-2.5 text-slate-500">{w.serial}</td>
                          <td className="whitespace-nowrap px-5 py-2.5 text-slate-600">{w.warrantyType}</td>
                          <td className="whitespace-nowrap px-5 py-2.5 text-slate-500">
                            {w.coverageStart} <span className="text-slate-300">–</span> {w.coverageEnd}
                          </td>
                          <td className="whitespace-nowrap px-5 py-2.5"><StatusPill status={w.status} /></td>
                          <td className="whitespace-nowrap px-5 py-2.5"><DaysLeftPill days={w.daysLeft} /></td>
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
            ) : (
              <div className="grid grid-cols-1 gap-4 p-5 pt-0 sm:grid-cols-2 lg:grid-cols-3">
                {filteredWarranties.map((w) => {
                  const AssetIcon = w.assetIcon;
                  return (
                    <div key={w.id} className="rounded-xl border border-slate-200 p-4">
                      <div className="mb-3 flex items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                          <AssetIcon className="h-5 w-5" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-900">{w.assetName}</p>
                          <p className="text-xs text-slate-400">{w.assetCode}</p>
                        </div>
                      </div>
                      <div className="mb-2 flex items-center justify-between">
                        <StatusPill status={w.status} />
                        <DaysLeftPill days={w.daysLeft} />
                      </div>
                      <p className="text-xs text-slate-500">{w.vendor} · {w.warrantyType}</p>
                      <p className="mt-1 text-xs text-slate-400">{w.coverageStart} – {w.coverageEnd}</p>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 p-5">
              <p className="text-sm text-slate-500">Showing 1 to {filteredWarranties.length} of 237 entries</p>
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

          {/* Footer: timeline + coverage summary + total value */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-1">
              <h3 className="mb-4 text-base font-semibold text-slate-900">Warranty Coverage Timeline</h3>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={coverageTimeline} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <Tooltip />
                    <Area type="monotone" dataKey="active" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.12} strokeWidth={2} dot={{ r: 3 }} />
                    <Area type="monotone" dataKey="expiring" stroke="#f97316" fill="#f97316" fillOpacity={0.12} strokeWidth={2} dot={{ r: 3 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 flex items-center gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-blue-500" /> Active Warranties
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-orange-500" /> Expiring Soon
                </span>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="mb-4 text-base font-semibold text-slate-900">Coverage Summary</h3>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                    <CalendarCheck className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-xs text-slate-500">Average Coverage Remaining</p>
                    <p className="text-lg font-semibold text-slate-900">214 days</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                    <ShieldCheck className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-xs text-slate-500">Longest Coverage</p>
                    <p className="text-lg font-semibold text-slate-900">1,095 days</p>
                    <p className="text-xs text-slate-400">Microsoft 365 Business</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600">
                    <Clock className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-xs text-slate-500">Shortest Coverage</p>
                    <p className="text-lg font-semibold text-slate-900">8 days</p>
                    <p className="text-xs text-slate-400">Lenovo ThinkPad X1 Carbon</p>
                  </div>
                </div>
              </div>
              <button className="mt-5 flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline">
                View Coverage Report <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="mb-1 text-base font-semibold text-slate-900">Total Coverage Value</h3>
              <p className="mb-1 text-3xl font-semibold text-slate-900">$1,245,680</p>
              <p className="mb-4 text-xs text-slate-400">Across all active warranties</p>
              <ul className="space-y-3.5">
                {coverageBreakdown.map((item) => (
                  <li key={item.label}>
                    <div className="mb-1.5 flex items-center justify-between text-sm">
                      <span className="text-slate-600">{item.label}</span>
                      <span className="font-medium text-slate-900">{item.amount}</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-blue-500" style={{ width: `${item.pct}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
              <button className="mt-4 flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline">
                View Value Report <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="mb-4 text-base font-semibold text-slate-900">Warranty Alerts</h3>
            <ul className="space-y-3">
              {warrantyAlerts.map((alert, i) => {
                const Icon = alert.icon;
                return (
                  <li key={i} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3 hover:border-slate-200">
                    <div className="flex items-center gap-3">
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${alert.color}`}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-sm font-medium text-slate-800">{alert.text}</p>
                        <p className="text-xs text-slate-500">{alert.sub}</p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                  </li>
                );
              })}
            </ul>
            <button className="mt-4 w-full rounded-lg border border-slate-200 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              View All Alerts
            </button>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="mb-4 text-base font-semibold text-slate-900">Warranties by Status</h3>
            <div className="flex items-center gap-4">
              <div className="relative h-[130px] w-[130px] shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={warrantiesByStatus} dataKey="value" nameKey="name" innerRadius={40} outerRadius={62} paddingAngle={2} stroke="none">
                      {warrantiesByStatus.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-lg font-semibold text-slate-900">237</span>
                  <span className="text-xs text-slate-400">Total</span>
                </div>
              </div>
              <ul className="flex-1 space-y-2 text-sm">
                {warrantiesByStatus.map((item) => (
                  <li key={item.name} className="flex items-center gap-2">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="text-slate-600">{item.name}</span>
                    <span className="ml-auto whitespace-nowrap font-medium text-slate-900">
                      {item.value} <span className="font-normal text-slate-400">({item.pct}%)</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="mb-4 text-base font-semibold text-slate-900">Top Vendors by Assets</h3>
            <ul className="space-y-3.5">
              {topVendorsByAssets.map((v) => (
                <li key={v.name}>
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="text-slate-700">{v.name}</span>
                    <span className="font-medium text-slate-900">{v.count}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-blue-500" style={{ width: `${v.pct}%` }} />
                  </div>
                </li>
              ))}
            </ul>
            <button className="mt-4 w-full rounded-lg border border-slate-200 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              View All Vendors
            </button>
          </div>
        </div>
      </div>

      {isModalOpen && <AddWarrantyModal onClose={() => setIsModalOpen(false)} onSave={handleSaveWarranty} />}
    </div>
  );
}