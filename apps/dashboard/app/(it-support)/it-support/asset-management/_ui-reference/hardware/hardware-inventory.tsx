"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Cpu,
  Filter,
  Laptop,
  Monitor,
  Plus,
  Search,
  Server,
  Smartphone,
  Wifi,
} from "lucide-react";

type Asset = {
  id: number;
  name: string;
  type: "Laptop" | "Desktop" | "Server" | "Phone" | "Printer" | "Network";
  owner: string;
  location: string;
  status: "In Service" | "Needs Review" | "Retired";
  warranty: "Good" | "Expiring soon" | "Expired";
  assignedTo: string;
  lastUpdated: string;
};

const initialAssets: Asset[] = [
  {
    id: 1001,
    name: "ThinkPad T14",
    type: "Laptop",
    owner: "Finance",
    location: "London Office",
    status: "In Service",
    warranty: "Good",
    assignedTo: "Mina Alvarez",
    lastUpdated: "2 hrs ago",
  },
  {
    id: 1002,
    name: "Dell Latitude 7420",
    type: "Laptop",
    owner: "Sales",
    location: "Remote",
    status: "Needs Review",
    warranty: "Expiring soon",
    assignedTo: "Chris Webb",
    lastUpdated: "5 hrs ago",
  },
  {
    id: 1003,
    name: "HP ProDesk",
    type: "Desktop",
    owner: "Operations",
    location: "Manchester Office",
    status: "In Service",
    warranty: "Good",
    assignedTo: "Leah Morris",
    lastUpdated: "1 day ago",
  },
  {
    id: 1004,
    name: "Dell PowerEdge R760",
    type: "Server",
    owner: "IT Ops",
    location: "Data Center",
    status: "Needs Review",
    warranty: "Expiring soon",
    assignedTo: "Alicia Chen",
    lastUpdated: "3 hrs ago",
  },
  {
    id: 1005,
    name: "iPhone 15 Pro",
    type: "Phone",
    owner: "Support",
    location: "Remote",
    status: "In Service",
    warranty: "Good",
    assignedTo: "Samir Khan",
    lastUpdated: "6 hrs ago",
  },
  {
    id: 1006,
    name: "Canon MF3010",
    type: "Printer",
    owner: "Admin",
    location: "Brussels Office",
    status: "Retired",
    warranty: "Expired",
    assignedTo: "Nina Patel",
    lastUpdated: "2 days ago",
  },
  {
    id: 1007,
    name: "Cisco Catalyst 9300",
    type: "Network",
    owner: "Network",
    location: "Head Office",
    status: "In Service",
    warranty: "Good",
    assignedTo: "Marcus Lee",
    lastUpdated: "4 hrs ago",
  },
];

const typeConfig = {
  Laptop: { icon: Laptop, tone: "bg-blue-50 text-blue-700" },
  Desktop: { icon: Monitor, tone: "bg-slate-100 text-slate-700" },
  Server: { icon: Server, tone: "bg-violet-50 text-violet-700" },
  Phone: { icon: Smartphone, tone: "bg-emerald-50 text-emerald-700" },
  Printer: { icon: Cpu, tone: "bg-amber-50 text-amber-700" },
  Network: { icon: Wifi, tone: "bg-cyan-50 text-cyan-700" },
};

export default function HardwareInventoryPage() {
  const [assets, setAssets] = useState<Asset[]>(initialAssets);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    type: "Laptop" as Asset["type"],
    owner: "",
    location: "",
    status: "In Service" as Asset["status"],
    warranty: "Good" as Asset["warranty"],
    assignedTo: "",
  });

  const visibleAssets = useMemo(() => {
    return assets.filter((asset) => {
      const matchesSearch =
        asset.name.toLowerCase().includes(search.toLowerCase()) ||
        asset.owner.toLowerCase().includes(search.toLowerCase()) ||
        asset.assignedTo.toLowerCase().includes(search.toLowerCase());
      const matchesType = typeFilter === "All" || asset.type === typeFilter;
      const matchesStatus = statusFilter === "All" || asset.status === statusFilter;
      return matchesSearch && matchesType && matchesStatus;
    });
  }, [assets, search, typeFilter, statusFilter]);

  const counts = {
    total: assets.length,
    active: assets.filter((asset) => asset.status === "In Service").length,
    review: assets.filter((asset) => asset.status === "Needs Review").length,
    warranty: assets.filter((asset) => asset.warranty !== "Good").length,
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.name.trim() || !form.owner.trim()) return;

    const newAsset: Asset = {
      id: Date.now(),
      name: form.name.trim(),
      type: form.type,
      owner: form.owner.trim(),
      location: form.location.trim() || "Unassigned",
      status: form.status,
      warranty: form.warranty,
      assignedTo: form.assignedTo.trim() || "Unassigned",
      lastUpdated: "Just now",
    };

    setAssets((current) => [newAsset, ...current]);
    setForm({
      name: "",
      type: "Laptop",
      owner: "",
      location: "",
      status: "In Service",
      warranty: "Good",
      assignedTo: "",
    });
    setShowForm(false);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-blue-700 p-6 text-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-blue-100">Asset Management</p>
            <h1 className="mt-2 text-3xl font-semibold">Hardware Inventory</h1>
            <p className="mt-2 max-w-2xl text-sm text-blue-50/90">
              Manage the full hardware estate with status, ownership, warranty, and lifecycle visibility.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="rounded-2xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white backdrop-blur hover:bg-white/20"
          >
            <span className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Add hardware
            </span>
          </button>
        </div>
      </div>

      {showForm ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Register a new hardware asset</h2>
              <p className="text-sm text-slate-500">This form updates the inventory immediately.</p>
            </div>
            <button type="button" onClick={() => setShowForm(false)} className="text-sm text-slate-500 hover:text-slate-900">
              Close
            </button>
          </div>
          <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
            <label className="text-sm font-medium text-slate-700">
              <span className="mb-1 block">Asset name</span>
              <input required value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" placeholder="e.g. Surface Pro 10" />
            </label>
            <label className="text-sm font-medium text-slate-700">
              <span className="mb-1 block">Type</span>
              <select value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value as Asset["type"] }))} className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400">
                <option>Laptop</option>
                <option>Desktop</option>
                <option>Server</option>
                <option>Phone</option>
                <option>Printer</option>
                <option>Network</option>
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              <span className="mb-1 block">Owner</span>
              <input required value={form.owner} onChange={(event) => setForm((current) => ({ ...current, owner: event.target.value }))} className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" placeholder="Department or team" />
            </label>
            <label className="text-sm font-medium text-slate-700">
              <span className="mb-1 block">Location</span>
              <input value={form.location} onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))} className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" placeholder="Office or site" />
            </label>
            <label className="text-sm font-medium text-slate-700">
              <span className="mb-1 block">Assigned to</span>
              <input value={form.assignedTo} onChange={(event) => setForm((current) => ({ ...current, assignedTo: event.target.value }))} className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" placeholder="Person or role" />
            </label>
            <label className="text-sm font-medium text-slate-700">
              <span className="mb-1 block">Status</span>
              <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as Asset["status"] }))} className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400">
                <option>In Service</option>
                <option>Needs Review</option>
                <option>Retired</option>
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              <span className="mb-1 block">Warranty</span>
              <select value={form.warranty} onChange={(event) => setForm((current) => ({ ...current, warranty: event.target.value as Asset["warranty"] }))} className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400">
                <option>Good</option>
                <option>Expiring soon</option>
                <option>Expired</option>
              </select>
            </label>
            <div className="md:col-span-2 flex justify-end">
              <button type="submit" className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">Save asset</button>
            </div>
          </form>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
          <p className="text-sm text-slate-500">Total assets</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{counts.total}</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
          <p className="text-sm text-slate-500">In service</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{counts.active}</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
          <p className="text-sm text-slate-500">Needs review</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{counts.review}</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
          <p className="text-sm text-slate-500">Warranty alerts</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{counts.warranty}</p>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Inventory list</h2>
            <p className="text-sm text-slate-500">Search, filter, and review the full hardware estate.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              <Search className="h-4 w-4" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search assets" className="bg-transparent outline-none" />
            </label>
            <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              <Filter className="h-4 w-4" />
              <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="bg-transparent outline-none">
                <option>All</option>
                <option>Laptop</option>
                <option>Desktop</option>
                <option>Server</option>
                <option>Phone</option>
                <option>Printer</option>
                <option>Network</option>
              </select>
            </label>
            <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              <Filter className="h-4 w-4" />
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="bg-transparent outline-none">
                <option>All</option>
                <option>In Service</option>
                <option>Needs Review</option>
                <option>Retired</option>
              </select>
            </label>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-4 py-3 font-semibold">Asset</th>
                <th className="px-4 py-3 font-semibold">Type</th>
                <th className="px-4 py-3 font-semibold">Owner</th>
                <th className="px-4 py-3 font-semibold">Location</th>
                <th className="px-4 py-3 font-semibold">Assigned</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Warranty</th>
                <th className="px-4 py-3 font-semibold">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {visibleAssets.map((asset) => {
                const config = typeConfig[asset.type];
                const Icon = config.icon;
                return (
                  <tr key={asset.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className={`rounded-2xl p-2 ${config.tone}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900">{asset.name}</p>
                          <p className="text-xs text-slate-500">#{asset.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{asset.type}</td>
                    <td className="px-4 py-3 text-slate-600">{asset.owner}</td>
                    <td className="px-4 py-3 text-slate-600">{asset.location}</td>
                    <td className="px-4 py-3 text-slate-600">{asset.assignedTo}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${asset.status === "In Service" ? "bg-emerald-50 text-emerald-700" : asset.status === "Needs Review" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-700"}`}>
                        {asset.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${asset.warranty === "Good" ? "bg-blue-50 text-blue-700" : asset.warranty === "Expiring soon" ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700"}`}>
                        {asset.warranty}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{asset.lastUpdated}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
