'use client';

import { useMemo, useState } from 'react';
import {
  Plus,
  Search,
  Save,
  Server,
  ShieldCheck,
  Clock3,
  FileText,
  ArrowUpRight,
} from 'lucide-react';

const INITIAL_SOFTWARE = [
  {
    id: '1',
    name: 'Microsoft 365 Apps',
    publisher: 'Microsoft',
    version: '2305 (Build 16501.20210)',
    category: 'Productivity',
    installedOn: '12 May 2025',
    devices: 156,
    compliance: 'Approved',
    lastUsed: '1 hour ago',
  },
  {
    id: '2',
    name: 'Google Chrome',
    publisher: 'Google LLC',
    version: '124.0.6367.118',
    category: 'Web Browser',
    installedOn: '10 May 2025',
    devices: 142,
    compliance: 'Approved',
    lastUsed: '30 mins ago',
  },
  {
    id: '3',
    name: 'Adobe Acrobat Reader DC',
    publisher: 'Adobe Systems',
    version: '24.002.20687',
    category: 'Utilities',
    installedOn: '09 May 2025',
    devices: 98,
    compliance: 'Approved',
    lastUsed: '2 days ago',
  },
];

const CATEGORIES = ['Productivity', 'Web Browser', 'Utilities', 'Communication', 'Security', 'Developer Tools'];
const COMPLIANCE_OPTIONS = ['Approved', 'Unapproved', 'Restricted', 'Unknown'];

type SoftwareItem = typeof INITIAL_SOFTWARE[number];

type FormState = {
  name: string;
  publisher: string;
  version: string;
  category: string;
  installedOn: string;
  devices: string;
  compliance: string;
  lastUsed: string;
};

export default function InstalledSoftwarePage() {
  const [softwareItems, setSoftwareItems] = useState<SoftwareItem[]>(INITIAL_SOFTWARE);
  const [formState, setFormState] = useState<FormState>({
    name: '',
    publisher: '',
    version: '',
    category: '',
    installedOn: '',
    devices: '',
    compliance: 'Approved',
    lastUsed: '',
  });
  const [filter, setFilter] = useState('');
  const [showForm, setShowForm] = useState(false);

  const filteredItems = useMemo(() => {
    const query = filter.toLowerCase().trim();
    if (!query) return softwareItems;
    return softwareItems.filter((item) =>
      [item.name, item.publisher, item.category, item.version, item.compliance]
        .join(' ')
        .toLowerCase()
        .includes(query)
    );
  }, [filter, softwareItems]);

  const summary = useMemo(() => {
    const total = softwareItems.length;
    const approved = softwareItems.filter((item) => item.compliance === 'Approved').length;
    return { total, approved, unapproved: softwareItems.filter((item) => item.compliance === 'Unapproved').length };
  }, [softwareItems]);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = event.target;
    setFormState((prev) => ({ ...prev, [name]: value }));
  };

  const handleAddSoftware = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const newItem: SoftwareItem = {
      id: String(Date.now()),
      name: formState.name || 'New Software',
      publisher: formState.publisher || 'Unknown',
      version: formState.version || '1.0.0',
      category: formState.category || 'Productivity',
      installedOn: formState.installedOn || new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      devices: Number(formState.devices) || 1,
      compliance: formState.compliance || 'Unknown',
      lastUsed: formState.lastUsed || 'Just now',
    };

    setSoftwareItems((prev) => [newItem, ...prev]);
    setFormState({
      name: '',
      publisher: '',
      version: '',
      category: '',
      installedOn: '',
      devices: '',
      compliance: 'Approved',
      lastUsed: '',
    });
    setShowForm(false);
  };

  return (
    <main className="p-8">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[.24em] text-slate-500">Asset Management</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-900">Installed Software</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            View and manage all software installed across your organization.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowForm((prev) => !prev)}
          className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Add Software
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-4 mb-8">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-500">Total Software</p>
          <p className="mt-3 text-3xl font-semibold text-slate-900">{summary.total}</p>
          <p className="mt-2 text-sm text-slate-500">All software installed</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-500">Approved Software</p>
          <p className="mt-3 text-3xl font-semibold text-slate-900">{summary.approved}</p>
          <p className="mt-2 text-sm text-slate-500">Compliant and approved</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-500">Unapproved Software</p>
          <p className="mt-3 text-3xl font-semibold text-slate-900">{summary.unapproved}</p>
          <p className="mt-2 text-sm text-slate-500">Requires review</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-500">Search & Filter</p>
          <p className="mt-3 text-3xl font-semibold text-slate-900">Live updates</p>
          <p className="mt-2 text-sm text-slate-500">Search by name, publisher or category</p>
        </div>
      </div>

      {showForm ? (
        <section className="mb-8 rounded-3xl border border-blue-100 bg-blue-50 p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Add Installed Software</h2>
              <p className="text-sm text-slate-600">Fill in the details below to add a new software record.</p>
            </div>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              Close
            </button>
          </div>

          <form onSubmit={handleAddSoftware} className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4 rounded-3xl bg-white p-5 shadow-sm">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Software Name</label>
                <input
                  name="name"
                  value={formState.name}
                  onChange={handleInputChange}
                  placeholder="e.g. Zoom Workplace"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Publisher</label>
                <input
                  name="publisher"
                  value={formState.publisher}
                  onChange={handleInputChange}
                  placeholder="e.g. Zoom Video Communications"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Version</label>
                  <input
                    name="version"
                    value={formState.version}
                    onChange={handleInputChange}
                    placeholder="e.g. 6.0.13"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Category</label>
                  <select
                    name="category"
                    value={formState.category}
                    onChange={handleInputChange}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="">Select category</option>
                    {CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="space-y-4 rounded-3xl bg-white p-5 shadow-sm">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Installed On</label>
                  <input
                    name="installedOn"
                    value={formState.installedOn}
                    onChange={handleInputChange}
                    type="date"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Devices Installed</label>
                  <input
                    name="devices"
                    value={formState.devices}
                    onChange={handleInputChange}
                    type="number"
                    min="1"
                    placeholder="e.g. 24"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Compliance Status</label>
                  <select
                    name="compliance"
                    value={formState.compliance}
                    onChange={handleInputChange}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  >
                    {COMPLIANCE_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Last Used</label>
                  <input
                    name="lastUsed"
                    value={formState.lastUsed}
                    onChange={handleInputChange}
                    placeholder="e.g. 3 days ago"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-1">
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
                >
                  <Save className="h-4 w-4" />
                  Save software
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </form>
        </section>
      ) : null}

      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="relative w-full md:max-w-md">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Search installed software..."
            className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <Plus className="h-4 w-4 text-blue-600" />
            Add Software
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <ArrowUpRight className="h-4 w-4 text-slate-500" />
            Export
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-6 py-4 font-medium">Software Name</th>
                <th className="px-6 py-4 font-medium">Publisher</th>
                <th className="px-6 py-4 font-medium">Version</th>
                <th className="px-6 py-4 font-medium">Category</th>
                <th className="px-6 py-4 font-medium">Installed On</th>
                <th className="px-6 py-4 font-medium">Devices</th>
                <th className="px-6 py-4 font-medium">Compliance</th>
                <th className="px-6 py-4 font-medium">Last Used</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => (
                <tr key={item.id} className="border-t border-slate-200 hover:bg-slate-50">
                  <td className="px-6 py-4 font-medium text-slate-900">{item.name}</td>
                  <td className="px-6 py-4 text-slate-600">{item.publisher}</td>
                  <td className="px-6 py-4 text-slate-600">{item.version}</td>
                  <td className="px-6 py-4 text-slate-600">{item.category}</td>
                  <td className="px-6 py-4 text-slate-600">{item.installedOn}</td>
                  <td className="px-6 py-4 text-slate-600">{item.devices}</td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                        item.compliance === 'Approved'
                          ? 'bg-emerald-100 text-emerald-700'
                          : item.compliance === 'Unapproved'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {item.compliance}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-600">{item.lastUsed}</td>
                </tr>
              ))}
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-sm text-slate-500">
                    No software matches your search.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
