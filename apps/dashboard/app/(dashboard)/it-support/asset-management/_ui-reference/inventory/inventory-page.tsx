"use client";

import { useMemo, useState } from "react";
import { Filter, Plus, Search } from "lucide-react";

type InventoryItem = {
  id: number;
  sku: string;
  name: string;
  category: "Laptop" | "Desktop" | "Server" | "Phone" | "Printer" | "Network";
  stock: number;
  status: "Available" | "Low Stock" | "Reserved" | "Out of Stock";
  location: string;
  lastUpdated: string;
};

const initialInventory: InventoryItem[] = [
  { id: 2001, sku: "LT-014", name: "ThinkPad T14", category: "Laptop", stock: 24, status: "Available", location: "London Office", lastUpdated: "2 hrs ago" },
  { id: 2002, sku: "DS-102", name: "HP ProDesk", category: "Desktop", stock: 8, status: "Low Stock", location: "Manchester Office", lastUpdated: "4 hrs ago" },
  { id: 2003, sku: "SV-221", name: "Dell PowerEdge", category: "Server", stock: 5, status: "Reserved", location: "Data Center", lastUpdated: "1 day ago" },
  { id: 2004, sku: "PH-078", name: "iPhone 15 Pro", category: "Phone", stock: 0, status: "Out of Stock", location: "Remote", lastUpdated: "6 hrs ago" },
  { id: 2005, sku: "PR-301", name: "Canon MF3010", category: "Printer", stock: 12, status: "Available", location: "Brussels Office", lastUpdated: "8 hrs ago" },
  { id: 2006, sku: "NW-440", name: "Cisco Catalyst 9300", category: "Network", stock: 3, status: "Low Stock", location: "Head Office", lastUpdated: "3 hrs ago" },
];

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>(initialInventory);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    sku: "",
    name: "",
    category: "Laptop" as InventoryItem["category"],
    stock: "",
    status: "Available" as InventoryItem["status"],
    location: "",
  });

  const visibleItems = useMemo(() => {
    return items.filter((item) => {
      const matchesSearch =
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        item.sku.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = categoryFilter === "All" || item.category === categoryFilter;
      const matchesStatus = statusFilter === "All" || item.status === statusFilter;
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [items, search, categoryFilter, statusFilter]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.sku.trim() || !form.name.trim()) return;

    const newItem: InventoryItem = {
      id: Date.now(),
      sku: form.sku.trim().toUpperCase(),
      name: form.name.trim(),
      category: form.category,
      stock: Number(form.stock) || 0,
      status: form.status,
      location: form.location.trim() || "Unassigned",
      lastUpdated: "Just now",
    };

    setItems((current) => [newItem, ...current]);
    setForm({ sku: "", name: "", category: "Laptop", stock: "", status: "Available", location: "" });
    setShowForm(false);
  };

  return (
    <div className="space-y-6">
      {/* Header banner */}
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-800 via-slate-800 to-blue-700 p-6 text-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-blue-200">Asset Management</p>
            <h1 className="mt-2 text-3xl font-semibold">Inventory</h1>
            <p className="mt-2 max-w-2xl text-sm text-blue-50/80">
              Track stocked hardware items by SKU, availability, and location for faster fulfillment.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="rounded-2xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white backdrop-blur hover:bg-white/20"
          >
            <span className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Add stock item
            </span>
          </button>
        </div>
      </div>

      {/* Add form */}
      {showForm ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Create stock entry</h2>
              <p className="text-sm text-slate-500">This form updates the inventory list instantly.</p>
            </div>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-sm text-slate-500 hover:text-slate-900"
            >
              Close
            </button>
          </div>
          <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
            <label className="text-sm font-medium text-slate-700">
              <span className="mb-1 block">SKU</span>
              <input
                required
                value={form.sku}
                onChange={(event) =>
                  setForm((current) => ({ ...current, sku: event.target.value }))
                }
                className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                placeholder="e.g. LT-015"
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              <span className="mb-1 block">Name</span>
              <input
                required
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
                className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                placeholder="Device name"
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              <span className="mb-1 block">Category</span>
              <select
                value={form.category}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    category: event.target.value as InventoryItem["category"],
                  }))
                }
                className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
              >
                <option>Laptop</option>
                <option>Desktop</option>
                <option>Server</option>
                <option>Phone</option>
                <option>Printer</option>
                <option>Network</option>
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              <span className="mb-1 block">Stock on hand</span>
              <input
                type="number"
                min="0"
                required
                value={form.stock}
                onChange={(event) =>
                  setForm((current) => ({ ...current, stock: event.target.value }))
                }
                className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                placeholder="0"
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              <span className="mb-1 block">Status</span>
              <select
                value={form.status}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    status: event.target.value as InventoryItem["status"],
                  }))
                }
                className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
              >
                <option>Available</option>
                <option>Low Stock</option>
                <option>Reserved</option>
                <option>Out of Stock</option>
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              <span className="mb-1 block">Location</span>
              <input
                value={form.location}
                onChange={(event) =>
                  setForm((current) => ({ ...current, location: event.target.value }))
                }
                className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                placeholder="Warehouse or site"
              />
            </label>
            <div className="md:col-span-2 flex justify-end">
              <button
                type="submit"
                className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
              >
                Save entry
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {/* KPI cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Total SKUs</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{items.length}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Available</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">
            {items.filter((item) => item.status === "Available").length}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Low stock</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">
            {items.filter((item) => item.status === "Low Stock").length}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Out of stock</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">
            {items.filter((item) => item.status === "Out of Stock").length}
          </p>
        </div>
      </div>

      {/* Table section */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Stock overview</h2>
            <p className="text-sm text-slate-500">Search and filter inventory records.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              <Search className="h-4 w-4" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search SKU or item"
                className="bg-transparent outline-none"
              />
            </label>
            <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              <Filter className="h-4 w-4" />
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                className="bg-transparent outline-none"
              >
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
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="bg-transparent outline-none"
              >
                <option>All</option>
                <option>Available</option>
                <option>Low Stock</option>
                <option>Reserved</option>
                <option>Out of Stock</option>
              </select>
            </label>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-4 py-3 font-semibold">SKU</th>
                <th className="px-4 py-3 font-semibold">Item</th>
                <th className="px-4 py-3 font-semibold">Category</th>
                <th className="px-4 py-3 font-semibold">Stock</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Location</th>
                <th className="px-4 py-3 font-semibold">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {visibleItems.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-semibold text-slate-900">{item.sku}</td>
                  <td className="px-4 py-3 text-slate-700">{item.name}</td>
                  <td className="px-4 py-3 text-slate-700">{item.category}</td>
                  <td className="px-4 py-3 text-slate-700">{item.stock}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        item.status === "Available"
                          ? "bg-emerald-50 text-emerald-700"
                          : item.status === "Low Stock"
                          ? "bg-amber-50 text-amber-700"
                          : item.status === "Reserved"
                          ? "bg-blue-50 text-blue-700"
                          : "bg-rose-50 text-rose-700"
                      }`}
                    >
                      {item.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{item.location}</td>
                  <td className="px-4 py-3 text-slate-500">{item.lastUpdated}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}