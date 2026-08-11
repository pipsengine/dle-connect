"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Package2,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type AssetItem = {
  id: number;
  name: string;
  owner: string;
  category: string;
  status: "In Service" | "Needs Review" | "Retired";
  warranty: "Good" | "Expiring soon" | "Expired";
};

const initialAssets: AssetItem[] = [
  { id: 1, name: "ThinkPad T14", owner: "Finance", category: "Laptop", status: "In Service", warranty: "Good" },
  { id: 2, name: "Dell PowerEdge", owner: "IT Ops", category: "Server", status: "Needs Review", warranty: "Expiring soon" },
  { id: 3, name: "iPhone 15", owner: "Sales", category: "Mobile", status: "In Service", warranty: "Good" },
  { id: 4, name: "Cisco Switch", owner: "Network", category: "Network", status: "Retired", warranty: "Expired" },
];

const overviewStats = [
  {
    title: "Total Assets",
    value: "1,284",
    change: "+8.2%",
    icon: Package2,
    tone: "text-blue-600 bg-blue-50",
  },
  {
    title: "In Service",
    value: "1,142",
    change: "+4.1%",
    icon: CheckCircle2,
    tone: "text-emerald-600 bg-emerald-50",
  },
  {
    title: "Warranty Alerts",
    value: "26",
    change: "-3",
    icon: ShieldCheck,
    tone: "text-amber-600 bg-amber-50",
  },
  {
    title: "Maintenance Due",
    value: "18",
    change: "5 overdue",
    icon: Wrench,
    tone: "text-violet-600 bg-violet-50",
  },
];

const categoryData = [
  { name: "Laptops", value: 410 },
  { name: "Servers", value: 182 },
  { name: "Mobile", value: 148 },
  { name: "Network", value: 126 },
  { name: "Peripherals", value: 94 },
];

const statusData = [
  { name: "Healthy", value: 72 },
  { name: "Needs Review", value: 18 },
  { name: "At Risk", value: 10 },
];

const deploymentTrend = [
  { month: "Jan", assets: 1180 },
  { month: "Feb", assets: 1210 },
  { month: "Mar", assets: 1238 },
  { month: "Apr", assets: 1260 },
  { month: "May", assets: 1284 },
];

const alertItems = [
  { name: "Finance laptops", detail: "4 devices due for battery replacement", due: "Today" },
  { name: "Warehouse printers", detail: "2 devices exceed warranty threshold", due: "Tomorrow" },
  { name: "Core switches", detail: "Firmware update pending", due: "2 days" },
];

const maintenanceQueue = [
  { asset: "WS-2048", task: "Patch deployment", owner: "Ops Team", eta: "09:30" },
  { asset: "LT-118", task: "Screen replacement", owner: "Hardware Desk", eta: "11:00" },
  { asset: "SRV-07", task: "Storage audit", owner: "Infrastructure", eta: "14:15" },
];

const pieColors = ["#2563eb", "#7c3aed", "#f59e0b"];

export default function AssetManagementDashboard() {
  const [assets, setAssets] = useState<AssetItem[]>(initialAssets);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    owner: "",
    category: "Laptop",
    status: "In Service" as AssetItem["status"],
    warranty: "Good" as AssetItem["warranty"],
  });

  const totalAssets = assets.length;
  const inServiceCount = assets.filter((asset) => asset.status === "In Service").length;
  const warrantyAlerts = assets.filter((asset) => asset.warranty !== "Good").length;
  const maintenanceDue = assets.filter((asset) => asset.status === "Needs Review").length;

  const stats = [
    {
      title: "Total Assets",
      value: totalAssets.toString(),
      change: "+8.2%",
      icon: Package2,
      tone: "text-blue-600 bg-blue-50",
    },
    {
      title: "In Service",
      value: inServiceCount.toString(),
      change: "+4.1%",
      icon: CheckCircle2,
      tone: "text-emerald-600 bg-emerald-50",
    },
    {
      title: "Warranty Alerts",
      value: warrantyAlerts.toString(),
      change: "-3",
      icon: ShieldCheck,
      tone: "text-amber-600 bg-amber-50",
    },
    {
      title: "Maintenance Due",
      value: maintenanceDue.toString(),
      change: "5 overdue",
      icon: Wrench,
      tone: "text-violet-600 bg-violet-50",
    },
  ];

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.name.trim() || !form.owner.trim()) return;

    const newAsset: AssetItem = {
      id: Date.now(),
      name: form.name.trim(),
      owner: form.owner.trim(),
      category: form.category,
      status: form.status,
      warranty: form.warranty,
    };

    setAssets((current) => [newAsset, ...current]);
    setForm({
      name: "",
      owner: "",
      category: "Laptop",
      status: "In Service",
      warranty: "Good",
    });
    setShowForm(false);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-blue-700 p-6 text-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-blue-100">Asset Management</p>
            <h1 className="mt-2 text-3xl font-semibold">Operations Dashboard</h1>
            <p className="mt-2 max-w-2xl text-sm text-blue-50/90">
              Track inventory health, maintenance demand, warranty exposure, and device readiness at a glance.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="rounded-2xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white backdrop-blur hover:bg-white/20"
          >
            + New asset
          </button>
        </div>
      </div>

      {showForm ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Add a new asset</h2>
              <p className="text-sm text-slate-500">This form updates the dashboard instantly.</p>
            </div>
            <button type="button" onClick={() => setShowForm(false)} className="text-sm text-slate-500 hover:text-slate-900">
              Close
            </button>
          </div>
          <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
            <label className="text-sm font-medium text-slate-700">
              <span className="mb-1 block">Asset name</span>
              <input
                required
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                placeholder="e.g. Surface Laptop"
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              <span className="mb-1 block">Owner</span>
              <input
                required
                value={form.owner}
                onChange={(event) => setForm((current) => ({ ...current, owner: event.target.value }))}
                className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                placeholder="Team or user"
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              <span className="mb-1 block">Category</span>
              <select
                value={form.category}
                onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
                className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
              >
                <option>Laptop</option>
                <option>Server</option>
                <option>Mobile</option>
                <option>Network</option>
                <option>Peripheral</option>
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              <span className="mb-1 block">Status</span>
              <select
                value={form.status}
                onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as AssetItem["status"] }))}
                className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
              >
                <option>In Service</option>
                <option>Needs Review</option>
                <option>Retired</option>
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              <span className="mb-1 block">Warranty</span>
              <select
                value={form.warranty}
                onChange={(event) => setForm((current) => ({ ...current, warranty: event.target.value as AssetItem["warranty"] }))}
                className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
              >
                <option>Good</option>
                <option>Expiring soon</option>
                <option>Expired</option>
              </select>
            </label>
            <div className="md:col-span-2 flex justify-end">
              <button type="submit" className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
                Save asset
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.title} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-slate-500">{stat.title}</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">{stat.value}</p>
                </div>
                <div className={`rounded-2xl p-2 ${stat.tone}`}>
                  <Icon className="h-5 w-5" />
                </div>
              </div>
              <p className="mt-3 text-sm text-slate-500">
                <span className="font-semibold text-slate-700">{stat.change}</span> vs last month
              </p>
            </div>
          );
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Inventory by category</h2>
              <p className="text-sm text-slate-500">Current allocation across asset groups</p>
            </div>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">+6% this quarter</span>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryData}>
                <CartesianGrid stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="value" radius={[8, 8, 0, 0]} fill="#2563eb" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Asset health</h2>
            <p className="text-sm text-slate-500">Current readiness across the estate</p>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={70} outerRadius={100} paddingAngle={3}>
                  {statusData.map((entry, index) => (
                    <Cell key={entry.name} fill={pieColors[index % pieColors.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2">
            {statusData.map((item) => (
              <div key={item.name} className="flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
                <span>{item.name}</span>
                <span className="font-semibold text-slate-900">{item.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Asset growth</h2>
              <p className="text-sm text-slate-500">Tracked asset count over recent months</p>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={deploymentTrend}>
                <CartesianGrid stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
                <Tooltip />
                <Line type="monotone" dataKey="assets" stroke="#2563eb" strokeWidth={3} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Recent additions</h2>
                <p className="text-sm text-slate-500">Latest assets submitted to the inventory</p>
              </div>
            </div>
            <div className="space-y-3">
              {assets.slice(0, 4).map((asset) => (
                <div key={asset.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">{asset.name}</p>
                    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">{asset.category}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{asset.owner}</p>
                  <p className="mt-1 text-xs text-slate-500">{asset.status} · {asset.warranty}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Priority alerts</h2>
                <p className="text-sm text-slate-500">Items that need attention</p>
              </div>
              <button type="button" className="text-sm font-medium text-blue-600 hover:text-blue-700">
                View all
              </button>
            </div>
            <div className="space-y-3">
              {alertItems.map((item) => (
                <div key={item.name} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                  <div className="rounded-xl bg-amber-50 p-2 text-amber-600">
                    <AlertTriangle className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900">{item.name}</p>
                      <span className="text-xs font-medium text-slate-500">{item.due}</span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Maintenance queue</h2>
                <p className="text-sm text-slate-500">Scheduled work for today</p>
              </div>
              <button type="button" className="text-sm font-medium text-blue-600 hover:text-blue-700">
                Open schedule
              </button>
            </div>
            <div className="space-y-3">
              {maintenanceQueue.map((item) => (
                <div key={item.asset} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{item.asset}</p>
                    <p className="text-sm text-slate-600">{item.task}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-slate-900">{item.eta}</p>
                    <p className="text-xs text-slate-500">{item.owner}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
