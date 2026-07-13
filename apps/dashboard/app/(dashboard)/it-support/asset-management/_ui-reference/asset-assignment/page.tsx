'use client';

import { useState, useMemo } from 'react';
import {
  Boxes,
  UserCheck,
  Hourglass,
  ArrowLeftRight,
  CalendarClock,
  Download,
  Bell,
  Search,
  Filter,
  MoreHorizontal,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  UserPlus,
  Layers,
  RotateCcw,
  Package,
  CheckCircle2,
  Mail,
  Phone,
  MapPin,
  Edit3,
  Undo2,
  Laptop,
  Monitor,
  Grid3x3,
  Armchair,
  Printer,
  Smartphone,
} from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

// ---------- Mock Data ----------

const statCards = [
  { label: 'Total Assets', value: '1,248', sub: 'All assets', icon: Boxes, color: 'blue' },
  { label: 'Assigned Assets', value: '1,047', sub: '83.9% of total', icon: UserCheck, color: 'green' },
  { label: 'Unassigned Assets', value: '128', sub: '10.3% of total', icon: Hourglass, color: 'orange' },
  { label: 'Under Transfer', value: '36', sub: '2.9% of total', icon: ArrowLeftRight, color: 'purple' },
  { label: 'Due for Return', value: '37', sub: 'Next 30 days', icon: CalendarClock, color: 'teal' },
] as const;

const ICON_STYLES: Record<string, string> = {
  blue: 'bg-blue-50 text-blue-600',
  green: 'bg-emerald-50 text-emerald-600',
  orange: 'bg-orange-50 text-orange-600',
  purple: 'bg-violet-50 text-violet-600',
  teal: 'bg-teal-50 text-teal-600',
};

type AssignmentStatus = 'Assigned' | 'Under Transfer';

type Assignment = {
  id: string;
  assetName: string;
  assetSub: string;
  assetId: string;
  serial: string;
  type: string;
  typeColor: string;
  assignedTo: string;
  assignedRole: string;
  email: string;
  phone: string;
  department: string;
  location: string;
  assignedOn: string;
  status: AssignmentStatus;
  employeeId: string;
  manager: string;
  purchaseDate: string;
  warrantyTill: string;
  icon: React.ComponentType<{ className?: string }>;
  initials: string;
};

const assignments: Assignment[] = [
  {
    id: 'a1', assetName: 'Dell Latitude 7420', assetSub: 'Laptop', assetId: 'AST-000123', serial: 'ABC123DEF456',
    type: 'Hardware', typeColor: 'bg-blue-50 text-blue-600', assignedTo: 'Emily Davis', assignedRole: 'Product Design',
    email: 'emily.davis@company.com', phone: '+1 512 555-0189', department: 'Product', location: 'Head Office · 3rd Floor',
    assignedOn: '12 May 2025', status: 'Assigned', employeeId: 'EMP-00456', manager: 'Sarah Johnson',
    purchaseDate: '15 Jan 2024', warrantyTill: '14 Jan 2026', icon: Laptop, initials: 'ED',
  },
  {
    id: 'a2', assetName: 'LG 24" Monitor', assetSub: 'Monitor', assetId: 'AST-000124', serial: 'LG24M789X1',
    type: 'Hardware', typeColor: 'bg-blue-50 text-blue-600', assignedTo: 'Michael Brown', assignedRole: 'Marketing',
    email: 'michael.brown@company.com', phone: '+1 512 555-0122', department: 'Marketing', location: 'Head Office · 4th Floor',
    assignedOn: '11 May 2025', status: 'Assigned', employeeId: 'EMP-00312', manager: 'Daniel Taylor',
    purchaseDate: '02 Feb 2024', warrantyTill: '01 Feb 2026', icon: Monitor, initials: 'MB',
  },
  {
    id: 'a3', assetName: 'Microsoft 365', assetSub: 'Software License', assetId: 'SWR-000567', serial: 'N/A',
    type: 'Software', typeColor: 'bg-violet-50 text-violet-600', assignedTo: 'Sophia Lee', assignedRole: 'Finance',
    email: 'sophia.lee@company.com', phone: '+1 512 555-0177', department: 'Finance', location: 'Head Office · 2nd Floor',
    assignedOn: '10 May 2025', status: 'Assigned', employeeId: 'EMP-00278', manager: 'Robert Fox',
    purchaseDate: '—', warrantyTill: '31 Dec 2025', icon: Grid3x3, initials: 'SL',
  },
  {
    id: 'a4', assetName: 'Ergonomic Chair', assetSub: 'Chair', assetId: 'AST-000125', serial: 'N/A',
    type: 'Hardware', typeColor: 'bg-blue-50 text-blue-600', assignedTo: 'David Wilson', assignedRole: 'Engineering',
    email: 'david.wilson@company.com', phone: '+1 512 555-0144', department: 'Engineering', location: 'Head Office · 3rd Floor',
    assignedOn: '09 May 2025', status: 'Assigned', employeeId: 'EMP-00391', manager: 'William Clark',
    purchaseDate: '20 Dec 2023', warrantyTill: '19 Dec 2025', icon: Armchair, initials: 'DW',
  },
  {
    id: 'a5', assetName: 'HP LaserJet Pro', assetSub: 'Printer', assetId: 'AST-000126', serial: 'HPLJ00892X',
    type: 'Hardware', typeColor: 'bg-blue-50 text-blue-600', assignedTo: 'Olivia Martinez', assignedRole: 'HR',
    email: 'olivia.martinez@company.com', phone: '+1 512 555-0166', department: 'Human Resources', location: 'Head Office · 1st Floor',
    assignedOn: '08 May 2025', status: 'Under Transfer', employeeId: 'EMP-00229', manager: 'Kevin White',
    purchaseDate: '18 Jan 2024', warrantyTill: '17 Jan 2026', icon: Printer, initials: 'OM',
  },
];

const unassignedAssets = [
  { id: 'u1', name: 'iPhone 14 Pro', assetId: 'AST-000201', type: 'Hardware', category: 'Mobile Device', location: 'IT Storage', addedOn: '10 May 2025', icon: Smartphone },
  { id: 'u2', name: 'Dell OptiPlex 7090', assetId: 'AST-000202', type: 'Hardware', category: 'Desktop', location: 'IT Storage', addedOn: '09 May 2025', icon: Monitor },
  { id: 'u3', name: 'Adobe Creative Cloud', assetId: 'SWR-000601', type: 'Software', category: 'License', location: 'N/A', addedOn: '07 May 2025', icon: Grid3x3 },
  { id: 'u4', name: 'Standing Desk', assetId: 'AST-000203', type: 'Hardware', category: 'Furniture', location: 'IT Storage', addedOn: '05 May 2025', icon: Armchair },
];

const transferHistory = [
  { id: 't1', asset: 'HP LaserJet Pro', assetId: 'AST-000126', from: 'Kevin White', to: 'Olivia Martinez', initiatedOn: '08 May 2025', status: 'In Progress' },
  { id: 't2', asset: 'MacBook Air M2', assetId: 'AST-000098', from: 'James Anderson', to: 'Priya Sharma', initiatedOn: '05 May 2025', status: 'In Progress' },
  { id: 't3', asset: 'iPad Air', assetId: 'AST-000077', from: 'Alex Johnson', to: 'Robert Fox', initiatedOn: '01 May 2025', status: 'Completed' },
];

const returnHistory = [
  { id: 'r1', asset: 'Dell Latitude 7420', assetId: 'AST-000090', returnedBy: 'James Anderson', date: '14 May 2025', reason: 'Employee Offboarding' },
  { id: 'r2', asset: 'iPhone 13', assetId: 'AST-000082', returnedBy: 'Ava Thompson', date: '13 May 2025', reason: 'Device Upgrade' },
  { id: 'r3', asset: 'Logitech MX Master 3', assetId: 'AST-000071', returnedBy: 'William Clark', date: '12 May 2025', reason: 'No Longer Needed' },
  { id: 'r4', asset: 'Docking Station WD19', assetId: 'AST-000065', returnedBy: 'Daniel Taylor', date: '11 May 2025', reason: 'Employee Offboarding' },
];

const assignmentOverview = [
  { name: 'Assigned', value: 1047, pct: 83.9, color: '#22c55e' },
  { name: 'Unassigned', value: 128, pct: 10.3, color: '#f97316' },
  { name: 'Under Transfer', value: 36, pct: 2.9, color: '#8b5cf6' },
  { name: 'Due for Return', value: 37, pct: 3.0, color: '#3b82f6' },
];

const quickActions = [
  { title: 'Assign New Asset', sub: 'Assign an asset to employee', icon: UserPlus, color: 'bg-blue-50 text-blue-600' },
  { title: 'Bulk Assignment', sub: 'Assign multiple assets', icon: Layers, color: 'bg-violet-50 text-violet-600' },
  { title: 'Initiate Transfer', sub: 'Transfer asset to another user', icon: ArrowLeftRight, color: 'bg-teal-50 text-teal-600' },
  { title: 'Process Return', sub: 'Record asset return', icon: Package, color: 'bg-amber-50 text-amber-600' },
];

const recentReturns = [
  { asset: 'Dell Latitude 7420', by: 'Returned by James Anderson', date: '14 May 2025' },
  { asset: 'iPhone 13', by: 'Returned by Ava Thompson', date: '13 May 2025' },
  { asset: 'Logitech MX Master 3', by: 'Returned by William Clark', date: '12 May 2025' },
  { asset: 'Docking Station WD19', by: 'Returned by Daniel Taylor', date: '11 May 2025' },
];

const EMPLOYEES = ['Emily Davis', 'Michael Brown', 'Sophia Lee', 'David Wilson', 'Olivia Martinez', 'James Anderson'];
const ASSET_OPTIONS = unassignedAssets.map((a) => a.name);

const tabs = ['Current Assignments', 'Unassigned Assets', 'Asset Transfers', 'Return History'] as const;
type Tab = (typeof tabs)[number];

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

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    Assigned: 'bg-emerald-50 text-emerald-600',
    'Under Transfer': 'bg-amber-50 text-amber-600',
    'In Progress': 'bg-amber-50 text-amber-600',
    Completed: 'bg-emerald-50 text-emerald-600',
  };
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${map[status] || 'bg-slate-100 text-slate-600'}`}>{status}</span>;
}

function TypePill({ type, className }: { type: string; className: string }) {
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>{type}</span>;
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

// ---------- Assign New Asset modal ----------

function AssignAssetModal({ onClose, onAssign }: { onClose: () => void; onAssign: (assetName: string, employee: string) => void }) {
  const [asset, setAsset] = useState('');
  const [employee, setEmployee] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!asset || !employee) {
      setError('Please select both an asset and an employee.');
      return;
    }
    onAssign(asset, employee);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Assign New Asset</h2>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Select Asset *">
            <select value={asset} onChange={(e) => setAsset(e.target.value)} className={inputClass}>
              <option value="">Choose an unassigned asset</option>
              {ASSET_OPTIONS.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </Field>

          <Field label="Assign To *">
            <select value={employee} onChange={(e) => setEmployee(e.target.value)} className={inputClass}>
              <option value="">Choose an employee</option>
              {EMPLOYEES.map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
          </Field>

          <Field label="Notes">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Optional notes..." className={inputClass} />
          </Field>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
              Assign Asset
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------- Page ----------

export default function Page() {
  const [activeTab, setActiveTab] = useState<Tab>('Current Assignments');
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string>('a1');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const filteredAssignments = useMemo(() => {
    if (!searchQuery.trim()) return assignments;
    const q = searchQuery.toLowerCase();
    return assignments.filter(
      (a) => a.assetName.toLowerCase().includes(q) || a.assetId.toLowerCase().includes(q) || a.assignedTo.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  const selected = assignments.find((a) => a.id === selectedId) ?? assignments[0];

  const handleAssign = (assetName: string, employee: string) => {
    setToast(`${assetName} assigned to ${employee}`);
    setIsModalOpen(false);
    setTimeout(() => setToast(null), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Asset Assignment</h1>
          <p className="mt-1 text-sm text-slate-500">Assign and manage assets across employees, departments, and locations.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <button
              onClick={() => setIsExportOpen((v) => !v)}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-4 w-4 text-slate-400" />
              Export
              <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
            </button>
            {isExportOpen && (
              <div className="absolute right-0 z-10 mt-1 w-40 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                {['Export as CSV', 'Export as PDF', 'Export as Excel'].map((opt) => (
                  <button
                    key={opt}
                    onClick={() => {
                      setToast(opt);
                      setIsExportOpen(false);
                      setTimeout(() => setToast(null), 2500);
                    }}
                    className="block w-full rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Assign New Asset
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
          {/* Tabs */}
          <div className="flex items-center gap-6 border-b border-slate-200">
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => {
                  setActiveTab(tab);
                  setPage(1);
                }}
                className={`-mb-px border-b-2 px-1 pb-3 text-sm font-medium ${
                  activeTab === tab ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Filters (shared across tabs) */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by asset name, ID, or employee..."
                className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <button className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-50">
              All Asset Types <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
            </button>
            <button className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-50">
              All Departments <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
            </button>
            <button className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-50">
              All Locations <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
            </button>
            <button className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-50">
              All Status <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
            </button>
            <button className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
              <Filter className="h-4 w-4 text-slate-400" />
              Filters
            </button>
          </div>

          {/* Table content per tab */}
          <div className="rounded-2xl border border-slate-200 bg-white">
            {activeTab === 'Current Assignments' && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-slate-400">
                      <th className="whitespace-nowrap px-5 py-2.5 font-medium">Asset</th>
                      <th className="whitespace-nowrap px-5 py-2.5 font-medium">Asset ID</th>
                      <th className="whitespace-nowrap px-5 py-2.5 font-medium">Type</th>
                      <th className="whitespace-nowrap px-5 py-2.5 font-medium">Assigned To</th>
                      <th className="whitespace-nowrap px-5 py-2.5 font-medium">Department</th>
                      <th className="whitespace-nowrap px-5 py-2.5 font-medium">Location</th>
                      <th className="whitespace-nowrap px-5 py-2.5 font-medium">Assigned On</th>
                      <th className="whitespace-nowrap px-5 py-2.5 font-medium">Status</th>
                      <th className="whitespace-nowrap px-5 py-2.5 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAssignments.map((a) => {
                      const Icon = a.icon;
                      return (
                        <tr
                          key={a.id}
                          onClick={() => setSelectedId(a.id)}
                          className={`cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50 ${
                            selectedId === a.id ? 'bg-blue-50/60' : ''
                          }`}
                        >
                          <td className="whitespace-nowrap px-5 py-2.5">
                            <span className="flex items-center gap-2.5">
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                                <Icon className="h-4 w-4" />
                              </span>
                              <span>
                                <p className="font-medium text-slate-800">{a.assetName}</p>
                                <p className="text-xs text-slate-400">{a.assetSub}</p>
                              </span>
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-5 py-2.5 text-slate-500">{a.assetId}</td>
                          <td className="whitespace-nowrap px-5 py-2.5"><TypePill type={a.type} className={a.typeColor} /></td>
                          <td className="whitespace-nowrap px-5 py-2.5">
                            <span className="flex items-center gap-2">
                              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-50 text-[10px] font-medium text-blue-600">
                                {a.initials}
                              </span>
                              <span>
                                <p className="text-slate-700">{a.assignedTo}</p>
                                <p className="text-xs text-slate-400">{a.assignedRole}</p>
                              </span>
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-5 py-2.5 text-slate-600">{a.department}</td>
                          <td className="whitespace-nowrap px-5 py-2.5 text-slate-500">{a.location}</td>
                          <td className="whitespace-nowrap px-5 py-2.5 text-slate-500">{a.assignedOn}</td>
                          <td className="whitespace-nowrap px-5 py-2.5"><StatusPill status={a.status} /></td>
                          <td className="whitespace-nowrap px-5 py-2.5">
                            <button
                              onClick={(e) => e.stopPropagation()}
                              className="flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-slate-100"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === 'Unassigned Assets' && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-slate-400">
                      <th className="whitespace-nowrap px-5 py-2.5 font-medium">Asset</th>
                      <th className="whitespace-nowrap px-5 py-2.5 font-medium">Asset ID</th>
                      <th className="whitespace-nowrap px-5 py-2.5 font-medium">Type</th>
                      <th className="whitespace-nowrap px-5 py-2.5 font-medium">Category</th>
                      <th className="whitespace-nowrap px-5 py-2.5 font-medium">Location</th>
                      <th className="whitespace-nowrap px-5 py-2.5 font-medium">Added On</th>
                      <th className="whitespace-nowrap px-5 py-2.5 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unassignedAssets.map((u) => {
                      const Icon = u.icon;
                      return (
                        <tr key={u.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                          <td className="whitespace-nowrap px-5 py-2.5">
                            <span className="flex items-center gap-2.5 font-medium text-slate-800">
                              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                                <Icon className="h-4 w-4" />
                              </span>
                              {u.name}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-5 py-2.5 text-slate-500">{u.assetId}</td>
                          <td className="whitespace-nowrap px-5 py-2.5 text-slate-600">{u.type}</td>
                          <td className="whitespace-nowrap px-5 py-2.5 text-slate-600">{u.category}</td>
                          <td className="whitespace-nowrap px-5 py-2.5 text-slate-500">{u.location}</td>
                          <td className="whitespace-nowrap px-5 py-2.5 text-slate-500">{u.addedOn}</td>
                          <td className="whitespace-nowrap px-5 py-2.5">
                            <button
                              onClick={() => setIsModalOpen(true)}
                              className="rounded-lg bg-blue-50 px-3 py-1 text-xs font-medium text-blue-600 hover:bg-blue-100"
                            >
                              Assign
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === 'Asset Transfers' && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-slate-400">
                      <th className="whitespace-nowrap px-5 py-2.5 font-medium">Asset</th>
                      <th className="whitespace-nowrap px-5 py-2.5 font-medium">Asset ID</th>
                      <th className="whitespace-nowrap px-5 py-2.5 font-medium">From</th>
                      <th className="whitespace-nowrap px-5 py-2.5 font-medium">To</th>
                      <th className="whitespace-nowrap px-5 py-2.5 font-medium">Initiated On</th>
                      <th className="whitespace-nowrap px-5 py-2.5 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transferHistory.map((t) => (
                      <tr key={t.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                        <td className="whitespace-nowrap px-5 py-2.5 font-medium text-slate-800">{t.asset}</td>
                        <td className="whitespace-nowrap px-5 py-2.5 text-slate-500">{t.assetId}</td>
                        <td className="whitespace-nowrap px-5 py-2.5 text-slate-600">{t.from}</td>
                        <td className="whitespace-nowrap px-5 py-2.5 text-slate-600">{t.to}</td>
                        <td className="whitespace-nowrap px-5 py-2.5 text-slate-500">{t.initiatedOn}</td>
                        <td className="whitespace-nowrap px-5 py-2.5"><StatusPill status={t.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === 'Return History' && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-slate-400">
                      <th className="whitespace-nowrap px-5 py-2.5 font-medium">Asset</th>
                      <th className="whitespace-nowrap px-5 py-2.5 font-medium">Asset ID</th>
                      <th className="whitespace-nowrap px-5 py-2.5 font-medium">Returned By</th>
                      <th className="whitespace-nowrap px-5 py-2.5 font-medium">Date</th>
                      <th className="whitespace-nowrap px-5 py-2.5 font-medium">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {returnHistory.map((r) => (
                      <tr key={r.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                        <td className="whitespace-nowrap px-5 py-2.5 font-medium text-slate-800">{r.asset}</td>
                        <td className="whitespace-nowrap px-5 py-2.5 text-slate-500">{r.assetId}</td>
                        <td className="whitespace-nowrap px-5 py-2.5 text-slate-600">{r.returnedBy}</td>
                        <td className="whitespace-nowrap px-5 py-2.5 text-slate-500">{r.date}</td>
                        <td className="whitespace-nowrap px-5 py-2.5 text-slate-600">{r.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 p-5">
              <p className="text-sm text-slate-500">Showing 1 to 5 of 1,047 entries</p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 disabled:opacity-40"
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
                  onClick={() => setPage(210)}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium ${
                    page === 210 ? 'bg-blue-600 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  210
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(210, p + 1))}
                  disabled={page === 210}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 disabled:opacity-40"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Assignment Details */}
          {activeTab === 'Current Assignments' && selected && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="mb-4 text-base font-semibold text-slate-900">Assignment Details</h2>
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_1fr_1fr]">
                {/* Asset image / icon block */}
                <div>
                  <div className="mb-3 flex aspect-square items-center justify-center rounded-xl bg-gradient-to-br from-slate-800 to-slate-600">
                    <selected.icon className="h-14 w-14 text-white/80" />
                  </div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold text-slate-900">{selected.assetName}</h3>
                    <TypePill type={selected.type} className={selected.typeColor} />
                  </div>
                  <dl className="mt-3 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-slate-400">Asset ID</dt>
                      <dd className="text-slate-700">{selected.assetId}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-400">Serial Number</dt>
                      <dd className="text-slate-700">{selected.serial}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-400">Status</dt>
                      <dd><StatusPill status={selected.status} /></dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-400">Purchase Date</dt>
                      <dd className="text-slate-700">{selected.purchaseDate}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-400">Warranty Valid Till</dt>
                      <dd className="text-slate-700">{selected.warrantyTill}</dd>
                    </div>
                  </dl>
                </div>

                {/* Assigned to block */}
                <div>
                  <h4 className="mb-3 text-sm font-semibold text-slate-700">Currently Assigned To</h4>
                  <div className="mb-3 flex items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-50 text-sm font-semibold text-blue-600">
                      {selected.initials}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-slate-900">{selected.assignedTo}</p>
                      <p className="text-xs text-slate-500">{selected.assignedRole}</p>
                    </div>
                  </div>
                  <div className="space-y-2 text-sm">
                    <a href={`mailto:${selected.email}`} className="flex items-center gap-2 text-blue-600 hover:underline">
                      <Mail className="h-3.5 w-3.5" /> {selected.email}
                    </a>
                    <a href={`tel:${selected.phone}`} className="flex items-center gap-2 text-slate-600">
                      <Phone className="h-3.5 w-3.5" /> {selected.phone}
                    </a>
                    <p className="flex items-center gap-2 text-slate-600">
                      <MapPin className="h-3.5 w-3.5" /> {selected.location}
                    </p>
                  </div>
                </div>

                {/* Meta + actions block */}
                <div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <div>
                      <dt className="text-slate-400">Assigned On</dt>
                      <dd className="font-medium text-slate-800">{selected.assignedOn}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">Department</dt>
                      <dd className="font-medium text-slate-800">{selected.department}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">Employee ID</dt>
                      <dd className="font-medium text-slate-800">{selected.employeeId}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">Manager</dt>
                      <dd className="font-medium text-slate-800">{selected.manager}</dd>
                    </div>
                  </dl>
                  <div className="mt-5 flex gap-3">
                    <button
                      onClick={() => setToast(`Editing assignment for ${selected.assetName}`)}
                      className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <Edit3 className="h-4 w-4" />
                      Edit Assignment
                    </button>
                    <button
                      onClick={() => setToast(`Return initiated for ${selected.assetName}`)}
                      className="flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                    >
                      <Undo2 className="h-4 w-4" />
                      Initiate Return
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="mb-4 text-base font-semibold text-slate-900">Assignment Overview</h3>
            <div className="flex items-center gap-4">
              <div className="relative h-[140px] w-[140px] shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={assignmentOverview} dataKey="value" nameKey="name" innerRadius={44} outerRadius={68} paddingAngle={2} stroke="none">
                      {assignmentOverview.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-lg font-semibold text-slate-900">1,248</span>
                  <span className="text-xs text-slate-400">Total Assets</span>
                </div>
              </div>
              <ul className="flex-1 space-y-2 text-sm">
                {assignmentOverview.map((item) => (
                  <li key={item.name} className="flex items-center gap-2">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="text-slate-600">{item.name}</span>
                    <span className="ml-auto whitespace-nowrap font-medium text-slate-900">
                      {item.value.toLocaleString()} <span className="font-normal text-slate-400">({item.pct}%)</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

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

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">Recent Returns</h3>
              <button onClick={() => setActiveTab('Return History')} className="text-sm font-medium text-blue-600 hover:underline">
                View All
              </button>
            </div>
            <ul className="space-y-3.5">
              {recentReturns.map((r, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{r.asset}</p>
                    <p className="truncate text-xs text-slate-500">{r.by}</p>
                  </div>
                  <span className="shrink-0 text-xs text-slate-400">{r.date}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {isModalOpen && <AssignAssetModal onClose={() => setIsModalOpen(false)} onAssign={handleAssign} />}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-3 text-sm text-white shadow-lg">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          {toast}
        </div>
      )}
    </div>
  );
}