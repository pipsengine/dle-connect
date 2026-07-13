'use client';

import { useState, useMemo, type ChangeEvent, type FormEvent } from 'react';
import {
  Users,
  FileText,
  DollarSign,
  Star,
  CheckCircle2,
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
  Plus,
  X,
  Globe,
  Calendar,
  ClipboardList,
  Mail,
  Phone,
  MapPin,
  TrendingUp,
  ExternalLink,
} from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

// ---------- Mock Data ----------

const statCards = [
  { label: 'Total Vendors', value: '86', sub: 'Active vendors', icon: Users, color: 'blue' },
  { label: 'Active Contracts', value: '112', sub: 'Across all vendors', icon: FileText, color: 'green' },
  { label: 'Total Spend (YTD)', value: '$245,680.00', sub: '↑ 14.6% vs last year', icon: DollarSign, color: 'orange' },
  { label: 'Preferred Vendors', value: '24', sub: '27.9% of total', icon: Star, color: 'purple' },
  { label: 'On-Time Delivery', value: '92%', sub: 'Overall performance', icon: CheckCircle2, color: 'sky' },
] as const;

const ICON_STYLES: Record<string, string> = {
  blue: 'bg-blue-50 text-blue-600',
  green: 'bg-emerald-50 text-emerald-600',
  orange: 'bg-orange-50 text-orange-600',
  purple: 'bg-violet-50 text-violet-600',
  sky: 'bg-sky-50 text-sky-600',
};

type Vendor = {
  id: string;
  name: string;
  category: string;
  contactName: string;
  contactTitle: string;
  contactEmail: string;
  contactPhone: string;
  phone: string;
  email: string;
  status: 'Active' | 'Inactive';
  rating: number;
  iconBg: string;
  initials: string;
  since: string;
  contracts: number;
  spend: string;
  address: string[];
  website: string;
  onTimeDelivery: number;
  qualityRating: number;
  responsiveness: number;
};

const vendors: Vendor[] = [
  {
    id: 'dell', name: 'Dell Technologies', category: 'Hardware',
    contactName: 'Michael Dell', contactTitle: 'CEO', contactEmail: 'michael.dell@dell.com', contactPhone: '+1 512 338-4400',
    phone: '+1 512 338-4400', email: 'michael.dell@dell.com', status: 'Active', rating: 4.2,
    iconBg: 'bg-sky-100 text-sky-700', initials: 'DL', since: '2010', contracts: 8, spend: '$62,450.00',
    address: ['One Dell Way', 'Round Rock, TX 78682', 'United States'], website: 'www.dell.com',
    onTimeDelivery: 95, qualityRating: 4.3, responsiveness: 4.2,
  },
  {
    id: 'microsoft', name: 'Microsoft', category: 'Software',
    contactName: 'Ashley McCarthy', contactTitle: 'Account Manager', contactEmail: 'ashley@microsoft.com', contactPhone: '+1 800 642-7676',
    phone: '+1 800 642-7676', email: 'ashley@microsoft.com', status: 'Active', rating: 4.8,
    iconBg: 'bg-blue-100 text-blue-700', initials: 'MS', since: '2008', contracts: 12, spend: '$32,250.00',
    address: ['One Microsoft Way', 'Redmond, WA 98052', 'United States'], website: 'www.microsoft.com',
    onTimeDelivery: 98, qualityRating: 4.8, responsiveness: 4.7,
  },
  {
    id: 'hp', name: 'HP Inc.', category: 'Hardware',
    contactName: 'James Smith', contactTitle: 'Sales Director', contactEmail: 'james.smith@hp.com', contactPhone: '+1 650 857-1501',
    phone: '+1 650 857-1501', email: 'james.smith@hp.com', status: 'Active', rating: 4.1,
    iconBg: 'bg-sky-100 text-sky-700', initials: 'HP', since: '2012', contracts: 6, spend: '$24,500.00',
    address: ['1501 Page Mill Rd', 'Palo Alto, CA 94304', 'United States'], website: 'www.hp.com',
    onTimeDelivery: 91, qualityRating: 4.1, responsiveness: 4.0,
  },
  {
    id: 'adobe', name: 'Adobe Systems', category: 'Software',
    contactName: 'Priya Sharma', contactTitle: 'Account Executive', contactEmail: 'priya.sharma@adobe.com', contactPhone: '+1 408 536-6000',
    phone: '+1 408 536-6000', email: 'priya.sharma@adobe.com', status: 'Active', rating: 4.3,
    iconBg: 'bg-red-100 text-red-700', initials: 'AD', since: '2015', contracts: 5, spend: '$18,980.00',
    address: ['345 Park Ave', 'San Jose, CA 95110', 'United States'], website: 'www.adobe.com',
    onTimeDelivery: 93, qualityRating: 4.3, responsiveness: 4.4,
  },
  {
    id: 'cdw', name: 'CDW', category: 'Hardware',
    contactName: 'Mark Reynolds', contactTitle: 'Account Manager', contactEmail: 'mark.reynolds@cdw.com', contactPhone: '+1 847 465-6000',
    phone: '+1 847 465-6000', email: 'mark.reynolds@cdw.com', status: 'Active', rating: 4.0,
    iconBg: 'bg-red-100 text-red-700', initials: 'CD', since: '2011', contracts: 9, spend: '$12,890.00',
    address: ['200 N Milwaukee Ave', 'Vernon Hills, IL 60061', 'United States'], website: 'www.cdw.com',
    onTimeDelivery: 89, qualityRating: 4.0, responsiveness: 3.9,
  },
  {
    id: 'lenovo', name: 'Lenovo', category: 'Hardware',
    contactName: 'Sarah Johnson', contactTitle: 'Business Manager', contactEmail: 'sarah.johnson@lenovo.com', contactPhone: '+1 919 294-5900',
    phone: '+1 919 294-5900', email: 'sarah.johnson@lenovo.com', status: 'Active', rating: 4.2,
    iconBg: 'bg-red-100 text-red-700', initials: 'LN', since: '2013', contracts: 4, spend: '$9,200.00',
    address: ['1009 Think Pl', 'Morrisville, NC 27560', 'United States'], website: 'www.lenovo.com',
    onTimeDelivery: 92, qualityRating: 4.2, responsiveness: 4.1,
  },
  {
    id: 'zoom', name: 'Zoom Video Comm.', category: 'Software',
    contactName: 'Ryan Tully', contactTitle: 'Account Executive', contactEmail: 'ryan.tully@zoom.us', contactPhone: '+1 888 799-9666',
    phone: '+1 888 799-9666', email: 'ryan.tully@zoom.us', status: 'Active', rating: 4.3,
    iconBg: 'bg-blue-100 text-blue-700', initials: 'ZM', since: '2018', contracts: 3, spend: '$8,400.00',
    address: ['55 Almaden Blvd', 'San Jose, CA 95113', 'United States'], website: 'www.zoom.us',
    onTimeDelivery: 96, qualityRating: 4.4, responsiveness: 4.5,
  },
  {
    id: 'watchguard', name: 'WatchGuard', category: 'Security',
    contactName: 'Tom Brown', contactTitle: 'Regional Manager', contactEmail: 'tom.brown@watchguard.com', contactPhone: '+1 206 613-0895',
    phone: '+1 206 613-0895', email: 'tom.brown@watchguard.com', status: 'Inactive', rating: 3.2,
    iconBg: 'bg-red-100 text-red-700', initials: 'WG', since: '2016', contracts: 2, spend: '$4,100.00',
    address: ['505 5th Ave S', 'Seattle, WA 98104', 'United States'], website: 'www.watchguard.com',
    onTimeDelivery: 78, qualityRating: 3.2, responsiveness: 3.0,
  },
];

const spendByCategory = [
  { name: 'Hardware', value: 112400, pct: 45.7, color: '#3b82f6' },
  { name: 'Software', value: 78900, pct: 32.1, color: '#22c55e' },
  { name: 'Services', value: 32650, pct: 13.3, color: '#f97316' },
  { name: 'Security', value: 12730, pct: 5.2, color: '#ec4899' },
  { name: 'Others', value: 8000, pct: 3.7, color: '#94a3b8' },
];

const topVendorsBySpend = [
  { name: 'Dell Technologies', amount: 62450, pct: 100 },
  { name: 'Microsoft', amount: 32250, pct: 52 },
  { name: 'HP Inc.', amount: 24500, pct: 39 },
  { name: 'Adobe Systems', amount: 18980, pct: 30 },
  { name: 'CDW', amount: 12890, pct: 21 },
];

const vendorStatus = [
  { label: 'Active', count: 72, pct: 83.7, color: 'bg-emerald-500', textColor: 'text-emerald-600' },
  { label: 'Inactive', count: 8, pct: 9.3, color: 'bg-slate-400', textColor: 'text-slate-500' },
  { label: 'On Hold', count: 4, pct: 4.7, color: 'bg-amber-500', textColor: 'text-amber-600' },
  { label: 'Blacklisted', count: 2, pct: 2.3, color: 'bg-red-500', textColor: 'text-red-600' },
];

const contractsData = [
  { vendor: 'Dell Technologies', contract: 'Hardware Supply Agreement', expires: '15 Jun 2026', value: '$180,000.00' },
  { vendor: 'Microsoft', contract: 'Enterprise Agreement', expires: '01 Sep 2026', value: '$320,000.00' },
  { vendor: 'Adobe Systems', contract: 'Creative Cloud License', expires: '12 Mar 2026', value: '$45,000.00' },
  { vendor: 'CDW', contract: 'Managed Procurement', expires: '30 Nov 2025', value: '$96,000.00' },
];

const performanceOverview = [
  { vendor: 'Microsoft', onTime: 98, quality: 4.8, responsiveness: 4.7 },
  { vendor: 'Zoom Video Comm.', onTime: 96, quality: 4.4, responsiveness: 4.5 },
  { vendor: 'Dell Technologies', onTime: 95, quality: 4.3, responsiveness: 4.2 },
  { vendor: 'Adobe Systems', onTime: 93, quality: 4.3, responsiveness: 4.4 },
  { vendor: 'Lenovo', onTime: 92, quality: 4.2, responsiveness: 4.1 },
];

type NewVendor = Omit<Vendor, 'id' | 'iconBg' | 'initials'>;

const DEFAULT_NEW_VENDOR: NewVendor = {
  name: '',
  category: 'Hardware',
  contactName: '',
  contactTitle: '',
  contactEmail: '',
  contactPhone: '',
  phone: '',
  email: '',
  status: 'Active',
  rating: 4.0,
  since: new Date().getFullYear().toString(),
  contracts: 0,
  spend: '$0.00',
  address: ['', '', ''],
  website: '',
  onTimeDelivery: 0,
  qualityRating: 0,
  responsiveness: 0,
};

function getIconBg(name: string) {
  const label = name.toLowerCase();
  if (label.includes('dell')) return 'bg-sky-100 text-sky-700';
  if (label.includes('microsoft')) return 'bg-blue-100 text-blue-700';
  if (label.includes('adobe')) return 'bg-red-100 text-red-700';
  if (label.includes('hp')) return 'bg-sky-100 text-sky-700';
  if (label.includes('cdw')) return 'bg-red-100 text-red-700';
  if (label.includes('zoom')) return 'bg-blue-100 text-blue-700';
  return 'bg-slate-100 text-slate-700';
}

function getInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

const tabs = ['Vendor Spend', 'Contracts', 'Performance Overview'] as const;
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

function StatusPill({ status }: { status: Vendor['status'] }) {
  const map: Record<Vendor['status'], string> = {
    Active: 'bg-emerald-50 text-emerald-600',
    Inactive: 'bg-slate-100 text-slate-500',
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${map[status]}`}>{status}</span>;
}

function StarRating({ rating }: { rating: number }) {
  const rounded = Math.round(rating);
  return (
    <span className="flex items-center gap-1">
      <span className="flex">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star key={i} className={`h-3.5 w-3.5 ${i < rounded ? 'fill-amber-400 text-amber-400' : 'fill-slate-200 text-slate-200'}`} />
        ))}
      </span>
      <span className="text-sm text-slate-600">{rating.toFixed(1)}</span>
    </span>
  );
}

function ProgressRow({ label, value, display, colorClass = 'bg-emerald-500' }: { label: string; value: number; display: string; colorClass?: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-slate-500">{label}</span>
        <span className="font-medium text-slate-800">{display}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

// ---------- Page ----------

const PAGE_SIZE = 8;

export default function Page() {
  const [page, setPage] = useState(1);
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>('dell');
  const [activeTab, setActiveTab] = useState<Tab>('Vendor Spend');
  const [searchQuery, setSearchQuery] = useState('');
  const [vendorsData, setVendorsData] = useState<Vendor[]>(vendors);
  const [showForm, setShowForm] = useState(false);
  const [newVendor, setNewVendor] = useState<NewVendor>(DEFAULT_NEW_VENDOR);

  const filteredVendors = useMemo(() => {
    if (!searchQuery.trim()) return vendorsData;
    const q = searchQuery.toLowerCase();
    return vendorsData.filter(
      (v) => v.name.toLowerCase().includes(q) || v.category.toLowerCase().includes(q) || v.contactName.toLowerCase().includes(q)
    );
  }, [searchQuery, vendorsData]);

  const totalPages = Math.max(1, Math.ceil(vendorsData.length / PAGE_SIZE));
  const selectedVendor = vendorsData.find((v) => v.id === selectedVendorId) ?? null;

  const handleNewVendorChange = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = event.target;
    setNewVendor((prev) => ({
      ...prev,
      [name]: name === 'contracts' || name === 'onTimeDelivery' || name === 'qualityRating' || name === 'responsiveness' ? Number(value) : value,
    }));
  };

  const handleCreateVendor = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const vendorName = newVendor.name.trim() || 'New Vendor';
    const createdVendor: Vendor = {
      id: vendorName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name: vendorName,
      category: newVendor.category,
      contactName: newVendor.contactName || 'Unknown Contact',
      contactTitle: newVendor.contactTitle || 'Account Manager',
      contactEmail: newVendor.contactEmail || 'contact@example.com',
      contactPhone: newVendor.contactPhone || '+1 000 000 0000',
      phone: newVendor.phone || newVendor.contactPhone || '+1 000 000 0000',
      email: newVendor.email || newVendor.contactEmail || 'contact@example.com',
      status: newVendor.status,
      rating: newVendor.rating,
      iconBg: getIconBg(vendorName),
      initials: getInitials(vendorName),
      since: newVendor.since,
      contracts: newVendor.contracts,
      spend: newVendor.spend,
      address: newVendor.address,
      website: newVendor.website || 'www.example.com',
      onTimeDelivery: newVendor.onTimeDelivery,
      qualityRating: newVendor.qualityRating,
      responsiveness: newVendor.responsiveness,
    };

    setVendorsData((prev) => [createdVendor, ...prev]);
    setNewVendor(DEFAULT_NEW_VENDOR);
    setShowForm(false);
    setSelectedVendorId(createdVendor.id);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Vendors</h1>
          <p className="mt-1 text-sm text-slate-500">Manage vendor information, performance, and associated contracts.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
            <Download className="h-4 w-4 text-slate-400" />
            Export
          </button>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Add Vendor
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
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Add Vendor</h2>
              <p className="text-sm text-slate-600">Enter vendor details and save to add a new supplier record.</p>
            </div>
            <button type="button" onClick={() => setShowForm(false)} className="text-sm font-medium text-slate-600 hover:text-slate-900">
              Cancel
            </button>
          </div>
          <form onSubmit={handleCreateVendor} className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-4 rounded-3xl bg-white p-4 shadow-sm">
              <label className="block text-sm font-medium text-slate-700">Vendor Name</label>
              <input
                name="name"
                value={newVendor.name}
                onChange={handleNewVendorChange}
                placeholder="Vendor name"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div className="space-y-4 rounded-3xl bg-white p-4 shadow-sm">
              <label className="block text-sm font-medium text-slate-700">Category</label>
              <select
                name="category"
                value={newVendor.category}
                onChange={handleNewVendorChange}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              >
                <option value="Hardware">Hardware</option>
                <option value="Software">Software</option>
                <option value="Security">Security</option>
              </select>
            </div>
            <div className="space-y-4 rounded-3xl bg-white p-4 shadow-sm">
              <label className="block text-sm font-medium text-slate-700">Contact Name</label>
              <input
                name="contactName"
                value={newVendor.contactName}
                onChange={handleNewVendorChange}
                placeholder="Contact name"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div className="space-y-4 rounded-3xl bg-white p-4 shadow-sm">
              <label className="block text-sm font-medium text-slate-700">Contact Email</label>
              <input
                name="contactEmail"
                value={newVendor.contactEmail}
                onChange={handleNewVendorChange}
                type="email"
                placeholder="contact@vendor.com"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div className="space-y-4 rounded-3xl bg-white p-4 shadow-sm">
              <label className="block text-sm font-medium text-slate-700">Contact Phone</label>
              <input
                name="contactPhone"
                value={newVendor.contactPhone}
                onChange={handleNewVendorChange}
                placeholder="+1 000 000 0000"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div className="space-y-4 rounded-3xl bg-white p-4 shadow-sm">
              <label className="block text-sm font-medium text-slate-700">Status</label>
              <select
                name="status"
                value={newVendor.status}
                onChange={handleNewVendorChange}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
            <div className="space-y-4 rounded-3xl bg-white p-4 shadow-sm">
              <label className="block text-sm font-medium text-slate-700">Rating</label>
              <input
                name="rating"
                type="number"
                min="0"
                max="5"
                step="0.1"
                value={newVendor.rating}
                onChange={handleNewVendorChange}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div className="space-y-4 rounded-3xl bg-white p-4 shadow-sm">
              <label className="block text-sm font-medium text-slate-700">Since</label>
              <input
                name="since"
                value={newVendor.since}
                onChange={handleNewVendorChange}
                placeholder="2010"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div className="space-y-4 rounded-3xl bg-white p-4 shadow-sm">
              <label className="block text-sm font-medium text-slate-700">Website</label>
              <input
                name="website"
                value={newVendor.website}
                onChange={handleNewVendorChange}
                placeholder="www.vendor.com"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div className="lg:col-span-3 flex flex-col gap-3 rounded-3xl bg-white p-4 shadow-sm">
              <button type="submit" className="inline-flex items-center justify-center rounded-full bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700">
                Save Vendor
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

      <div className={`grid grid-cols-1 gap-6 ${selectedVendor ? 'xl:grid-cols-[1fr_340px]' : ''}`}>
        {/* Main column */}
        <div className="min-w-0 space-y-6">
          {/* Vendors table */}
          <div className="rounded-2xl border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 p-5">
              <h2 className="text-base font-semibold text-slate-900">Vendors ({filteredVendors.length})</h2>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setPage(1);
                    }}
                    placeholder="Search vendors..."
                    className="w-52 rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <button className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
                  <SlidersHorizontal className="h-4 w-4 text-slate-400" />
                  Filters
                </button>
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
            </div>

            {view === 'list' ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-y border-slate-100 text-left text-slate-400">
                      <th className="whitespace-nowrap px-5 py-2.5 font-medium">Vendor Name</th>
                      <th className="whitespace-nowrap px-5 py-2.5 font-medium">Category</th>
                      <th className="whitespace-nowrap px-5 py-2.5 font-medium">Contact Person</th>
                      <th className="whitespace-nowrap px-5 py-2.5 font-medium">Phone</th>
                      <th className="whitespace-nowrap px-5 py-2.5 font-medium">Email</th>
                      <th className="whitespace-nowrap px-5 py-2.5 font-medium">Status</th>
                      <th className="whitespace-nowrap px-5 py-2.5 font-medium">Performance</th>
                      <th className="whitespace-nowrap px-5 py-2.5 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredVendors.map((v) => (
                      <tr
                        key={v.id}
                        onClick={() => setSelectedVendorId(v.id)}
                        className={`cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50 ${
                          selectedVendorId === v.id ? 'bg-blue-50/60' : ''
                        }`}
                      >
                        <td className="whitespace-nowrap px-5 py-2.5">
                          <span className="flex items-center gap-2.5 font-medium text-slate-800">
                            <span className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${v.iconBg}`}>
                              {v.initials}
                            </span>
                            {v.name}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-5 py-2.5 text-slate-600">{v.category}</td>
                        <td className="whitespace-nowrap px-5 py-2.5">
                          <p className="text-slate-700">{v.contactName}</p>
                          <p className="text-xs text-slate-400">{v.contactTitle}</p>
                        </td>
                        <td className="whitespace-nowrap px-5 py-2.5 text-slate-500">{v.phone}</td>
                        <td className="whitespace-nowrap px-5 py-2.5 text-slate-500">{v.email}</td>
                        <td className="whitespace-nowrap px-5 py-2.5"><StatusPill status={v.status} /></td>
                        <td className="whitespace-nowrap px-5 py-2.5"><StarRating rating={v.rating} /></td>
                        <td className="whitespace-nowrap px-5 py-2.5">
                          <button
                            onClick={(e) => e.stopPropagation()}
                            className="flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-slate-100"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 p-5 pt-0 sm:grid-cols-2 lg:grid-cols-3">
                {filteredVendors.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => setSelectedVendorId(v.id)}
                    className={`rounded-xl border p-4 text-left hover:border-slate-300 ${
                      selectedVendorId === v.id ? 'border-blue-300 bg-blue-50/60' : 'border-slate-200'
                    }`}
                  >
                    <div className="mb-3 flex items-center gap-3">
                      <span className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold ${v.iconBg}`}>
                        {v.initials}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">{v.name}</p>
                        <p className="text-xs text-slate-500">{v.category}</p>
                      </div>
                    </div>
                    <div className="mb-2 flex items-center justify-between">
                      <StatusPill status={v.status} />
                      <StarRating rating={v.rating} />
                    </div>
                    <p className="truncate text-xs text-slate-500">{v.contactName} · {v.contactTitle}</p>
                  </button>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 p-5">
              <p className="text-sm text-slate-500">
                Showing 1 to {filteredVendors.length} of 86 entries
              </p>
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
                  onClick={() => setPage(11)}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium ${
                    page === 11 ? 'bg-blue-600 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  11
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(11, p + 1))}
                  disabled={page === 11}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 disabled:opacity-40"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Tabbed footer */}
          <div>
            <div className="mb-4 flex items-center gap-6 border-b border-slate-200">
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

            {activeTab === 'Vendor Spend' && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <h3 className="mb-4 text-base font-semibold text-slate-900">Spend by Category (YTD)</h3>
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
                  <button className="mt-4 flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline">
                    View Spend Report <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <h3 className="mb-4 text-base font-semibold text-slate-900">Top Vendors by Spend (YTD)</h3>
                  <ul className="space-y-4">
                    {topVendorsBySpend.map((v) => (
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
                    View All Vendors <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <h3 className="mb-4 text-base font-semibold text-slate-900">Vendor Status</h3>
                  <ul className="space-y-3.5">
                    {vendorStatus.map((s) => (
                      <li key={s.label} className="flex items-center gap-3 text-sm">
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${s.color}`} />
                        <span className="text-slate-600">{s.label}</span>
                        <span className="ml-auto font-medium text-slate-900">{s.count}</span>
                        <span className="w-16 text-right text-xs text-slate-400">({s.pct}%)</span>
                      </li>
                    ))}
                  </ul>
                  <button className="mt-4 flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline">
                    View All <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'Contracts' && (
              <div className="rounded-2xl border border-slate-200 bg-white">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-left text-slate-400">
                        <th className="whitespace-nowrap px-5 py-3 font-medium">Vendor</th>
                        <th className="whitespace-nowrap px-5 py-3 font-medium">Contract</th>
                        <th className="whitespace-nowrap px-5 py-3 font-medium">Expires</th>
                        <th className="whitespace-nowrap px-5 py-3 font-medium">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contractsData.map((c) => (
                        <tr key={c.contract} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                          <td className="whitespace-nowrap px-5 py-3 font-medium text-slate-800">{c.vendor}</td>
                          <td className="whitespace-nowrap px-5 py-3 text-slate-600">{c.contract}</td>
                          <td className="whitespace-nowrap px-5 py-3 text-slate-500">{c.expires}</td>
                          <td className="whitespace-nowrap px-5 py-3 font-medium text-slate-800">{c.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'Performance Overview' && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <ul className="space-y-5">
                  {performanceOverview.map((p) => (
                    <li key={p.vendor}>
                      <p className="mb-2 text-sm font-medium text-slate-800">{p.vendor}</p>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <ProgressRow label="On-Time Delivery" value={p.onTime} display={`${p.onTime}%`} colorClass="bg-emerald-500" />
                        <ProgressRow label="Quality Rating" value={(p.quality / 5) * 100} display={`${p.quality} / 5`} colorClass="bg-blue-500" />
                        <ProgressRow label="Responsiveness" value={(p.responsiveness / 5) * 100} display={`${p.responsiveness} / 5`} colorClass="bg-violet-500" />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Vendor Details side panel */}
        {selectedVendor && (
          <div className="space-y-4 xl:sticky xl:top-6 xl:self-start">
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-base font-semibold text-slate-900">Vendor Details</h3>
                <button
                  onClick={() => setSelectedVendorId(null)}
                  className="flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-slate-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mb-4 flex items-center gap-3">
                <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${selectedVendor.iconBg}`}>
                  {selectedVendor.initials}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-base font-semibold text-slate-900">{selectedVendor.name}</p>
                    <StatusPill status={selectedVendor.status} />
                  </div>
                  <p className="text-sm text-slate-500">{selectedVendor.category}</p>
                  <a href="#" className="flex items-center gap-1 text-sm text-blue-600 hover:underline">
                    {selectedVendor.website} <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>

              <div className="mb-5 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-center">
                <div>
                  <p className="flex items-center justify-center gap-1 text-xs text-slate-400">
                    <Calendar className="h-3 w-3" /> Est. Since
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{selectedVendor.since}</p>
                </div>
                <div>
                  <p className="flex items-center justify-center gap-1 text-xs text-slate-400">
                    <ClipboardList className="h-3 w-3" /> Contracts
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{selectedVendor.contracts}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Total Spend (YTD)</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{selectedVendor.spend}</p>
                </div>
              </div>

              <div className="mb-5">
                <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                  <Users className="h-3.5 w-3.5 text-slate-400" /> Primary Contact
                </h4>
                <div className="flex items-center gap-3 rounded-xl border border-slate-100 p-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-blue-600">
                    {selectedVendor.contactName.split(' ').map((n) => n[0]).join('')}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">{selectedVendor.contactName}</p>
                    <p className="text-xs text-slate-500">{selectedVendor.contactTitle}</p>
                  </div>
                </div>
                <div className="mt-2 space-y-1.5 text-sm">
                  <a href={`mailto:${selectedVendor.contactEmail}`} className="flex items-center gap-2 text-blue-600 hover:underline">
                    <Mail className="h-3.5 w-3.5" /> {selectedVendor.contactEmail}
                  </a>
                  <a href={`tel:${selectedVendor.contactPhone}`} className="flex items-center gap-2 text-slate-600 hover:text-slate-800">
                    <Phone className="h-3.5 w-3.5" /> {selectedVendor.contactPhone}
                  </a>
                </div>
              </div>

              <div className="mb-5">
                <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                  <MapPin className="h-3.5 w-3.5 text-slate-400" /> Address
                </h4>
                <p className="text-sm leading-relaxed text-slate-600">
                  {selectedVendor.address.map((line, i) => (
                    <span key={i} className="block">{line}</span>
                  ))}
                </p>
              </div>

              <div className="mb-5">
                <h4 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                  <TrendingUp className="h-3.5 w-3.5 text-slate-400" /> Performance
                </h4>
                <div className="space-y-3">
                  <ProgressRow label="On-Time Delivery" value={selectedVendor.onTimeDelivery} display={`${selectedVendor.onTimeDelivery}%`} colorClass="bg-emerald-500" />
                  <ProgressRow label="Quality Rating" value={(selectedVendor.qualityRating / 5) * 100} display={`${selectedVendor.qualityRating} / 5`} colorClass="bg-emerald-500" />
                  <ProgressRow label="Responsiveness" value={(selectedVendor.responsiveness / 5) * 100} display={`${selectedVendor.responsiveness} / 5`} colorClass="bg-emerald-500" />
                </div>
              </div>

              <button className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700">
                View Full Profile
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}