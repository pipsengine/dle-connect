'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Boxes,
  ChevronLeft,
  ChevronRight,
  Laptop2,
  Plus,
  RefreshCcw,
  ShieldAlert,
  Target,
  Upload,
  UserCheck,
  Wallet,
  Wrench,
} from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { ItAssetDashboardPayload } from '@/lib/it-asset-management-store';
import { fetchAssetManagementPayload, importAssetRegisterFile, importBundledAssetRegister, initializeAssetManagement } from './lib/asset-management-api';
import { buildDashboardCategoryBreakdown, buildPageNumbers, formatAssetTypeLabel } from './lib/dashboard-utils';
import { AssetManagementShell } from './AssetManagementShell';

const currency = (value: number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(value || 0);

const number = (value: number) => new Intl.NumberFormat('en-NG').format(value || 0);

const statusTone = (status: string) => {
  const value = status.toUpperCase();
  if (value.includes('USE') || value.includes('ACTIVE')) return 'bg-emerald-50 text-emerald-700';
  if (value.includes('IDLE') || value.includes('STOCK') || value.includes('UNASSIGNED')) return 'bg-slate-100 text-slate-600';
  if (value.includes('MAINTENANCE')) return 'bg-amber-50 text-amber-700';
  return 'bg-slate-100 text-slate-700';
};

const ICON_STYLES: Record<string, string> = {
  blue: 'bg-blue-50 text-blue-600',
  green: 'bg-emerald-50 text-emerald-600',
  purple: 'bg-violet-50 text-violet-600',
  orange: 'bg-orange-50 text-orange-600',
  rose: 'bg-rose-50 text-rose-600',
  teal: 'bg-teal-50 text-teal-600',
};

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  color,
  loading,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  loading: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{loading ? '—' : value}</p>
          <p className="mt-1 text-xs text-slate-500">{hint}</p>
        </div>
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${ICON_STYLES[color]}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </div>
  );
}

export function AssetManagementHubClient() {
  const [payload, setPayload] = useState<ItAssetDashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [initializing, setInitializing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState('');
  const [error, setError] = useState('');
  const [recentPage, setRecentPage] = useState(1);
  const [recentPageSize, setRecentPageSize] = useState(10);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchAssetManagementPayload();
      setPayload(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load asset management data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleImportRegister = async () => {
    setImporting(true);
    setError('');
    setImportMessage('');
    try {
      const data = await importBundledAssetRegister();
      setPayload(data.payload);
      setImportMessage(`Imported ${data.result.imported} assets, updated ${data.result.updated}, created ${data.result.maintenanceCreated} maintenance records.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to import asset register.');
    } finally {
      setImporting(false);
    }
  };

  const handleUploadRegister = async (file: File | null) => {
    if (!file) return;
    setImporting(true);
    setError('');
    setImportMessage('');
    try {
      const data = await importAssetRegisterFile(file);
      setPayload(data.payload);
      setImportMessage(`Uploaded ${data.result.imported} assets, updated ${data.result.updated}, skipped ${data.result.skipped}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to upload asset register.');
    } finally {
      setImporting(false);
    }
  };

  const handleInitialize = async () => {
    setInitializing(true);
    setError('');
    try {
      const data = await initializeAssetManagement();
      setPayload(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to initialize asset management.');
    } finally {
      setInitializing(false);
    }
  };

  const summary = payload?.summary;
  const empty = !loading && payload && payload.databaseAvailable && (summary?.totalAssets || 0) === 0;
  const allAssets = payload?.assets || [];
  const totalAssets = summary?.totalAssets || 0;

  const statCards = useMemo(() => {
    if (!summary) return [];
    return [
      { label: 'Total Assets', value: number(summary.totalAssets), hint: 'All registered assets', icon: Boxes, color: 'blue' },
      { label: 'Active Assets', value: number(summary.activeAssets), hint: 'Assets currently in use', icon: Laptop2, color: 'green' },
      { label: 'Asset Value', value: currency(summary.totalAssetValue), hint: 'Total book value', icon: Wallet, color: 'purple' },
      { label: 'Maintenance Due', value: number(summary.maintenanceDue), hint: 'Assets due for maintenance', icon: Wrench, color: 'orange' },
      { label: 'Warranty Alerts', value: number(summary.warrantyAlerts), hint: 'Assets with expiring warranty', icon: ShieldAlert, color: 'rose' },
      { label: 'Assigned Assets', value: number(summary.assignedAssets), hint: 'Assets assigned to users', icon: UserCheck, color: 'teal' },
    ];
  }, [summary]);

  const categoryBreakdown = useMemo(() => buildDashboardCategoryBreakdown(allAssets), [allAssets]);

  const recentTotalPages = Math.max(1, Math.ceil(allAssets.length / recentPageSize));
  const recentStart = (recentPage - 1) * recentPageSize;
  const recentAssets = allAssets.slice(recentStart, recentStart + recentPageSize);
  const pageNumbers = buildPageNumbers(recentPage, recentTotalPages);

  useEffect(() => {
    if (recentPage > recentTotalPages) setRecentPage(recentTotalPages);
  }, [recentPage, recentTotalPages]);

  return (
    <AssetManagementShell title="Asset Management">
      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      {!payload?.databaseAvailable && !loading ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          DLE_Enterprise database is unavailable. Configure the database connection to enable read/write operations.
        </div>
      ) : null}

      {empty ? (
        <div className="flex min-h-[400px] flex-col items-center justify-center rounded-2xl border border-slate-100 bg-white p-12 text-center shadow-sm">
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-100 bg-slate-50 text-slate-300">
            <Target className="h-8 w-8" />
          </div>
          <h3 className="mb-2 text-lg font-semibold text-slate-900">No Active Records Found</h3>
          <p className="mb-6 max-w-md text-sm leading-relaxed text-slate-500">
            Import the DLE IT asset register into <strong>DLE_Enterprise</strong> to begin tracking hardware, assignments, preventive maintenance, and lifecycle data.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => void handleImportRegister()}
              disabled={importing || initializing}
              className="inline-flex items-center gap-2 rounded-lg bg-dle-blue px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-dle-blue-deep disabled:opacity-60"
            >
              <Upload className="h-4 w-4" />
              {importing ? 'Importing Register...' : 'Import DLE Asset Register'}
            </button>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
              <Upload className="h-4 w-4" />
              Upload CSV
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(event) => void handleUploadRegister(event.target.files?.[0] || null)}
              />
            </label>
            <button
              type="button"
              onClick={() => void handleInitialize()}
              disabled={initializing || importing}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
            >
              <Plus className="h-4 w-4" />
              {initializing ? 'Initializing...' : 'Load Sample Data'}
            </button>
          </div>
          {importMessage ? <p className="mt-4 text-sm font-medium text-emerald-700">{importMessage}</p> : null}
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3">
            <div className="text-xs font-medium text-slate-600">
              Source: <span className="font-semibold text-slate-800">{payload?.source || 'DLE_Enterprise'}</span>
              <span className="mx-2 text-slate-300">·</span>
              Updated {payload?.generatedAt ? new Date(payload.generatedAt).toLocaleString() : '—'}
            </div>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {statCards.map((card) => (
              <StatCard key={card.label} {...card} loading={loading} />
            ))}
          </section>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-slate-900">Recent Assets</h2>
                <Link href="/it-support/asset-management/hardware" className="inline-flex items-center gap-1 text-sm font-medium text-dle-blue hover:text-dle-blue-deep">
                  View all assets <ArrowRight className="h-4 w-4" />
                </Link>
              </div>

              <div className="-mx-5 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
                      <th className="whitespace-nowrap px-5 py-2.5">Tag</th>
                      <th className="whitespace-nowrap px-5 py-2.5">Model</th>
                      <th className="whitespace-nowrap px-5 py-2.5">Type</th>
                      <th className="whitespace-nowrap px-5 py-2.5">Department</th>
                      <th className="whitespace-nowrap px-5 py-2.5">Location</th>
                      <th className="whitespace-nowrap px-5 py-2.5">Assigned To</th>
                      <th className="whitespace-nowrap px-5 py-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentAssets.map((asset) => (
                      <tr key={asset.assetId} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/80">
                        <td className="whitespace-nowrap px-5 py-3 font-mono text-xs font-medium text-dle-blue">{asset.assetTag}</td>
                        <td className="whitespace-nowrap px-5 py-3 font-medium text-slate-900">{asset.model || asset.name}</td>
                        <td className="whitespace-nowrap px-5 py-3 text-slate-600">{formatAssetTypeLabel(asset)}</td>
                        <td className="whitespace-nowrap px-5 py-3 text-slate-600">{asset.department || '—'}</td>
                        <td className="whitespace-nowrap px-5 py-3 text-slate-600">{asset.location || '—'}</td>
                        <td className="whitespace-nowrap px-5 py-3 text-slate-600">{asset.assignedEmployeeName || 'Unassigned'}</td>
                        <td className="whitespace-nowrap px-5 py-3">
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusTone(asset.registerStatus || asset.status)}`}>
                            {asset.registerStatus || asset.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 text-xs text-slate-500">
                <span>
                  Showing {allAssets.length ? recentStart + 1 : 0} to {Math.min(recentStart + recentPageSize, allAssets.length)} of {number(allAssets.length)} assets
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={recentPageSize}
                    onChange={(e) => { setRecentPageSize(Number(e.target.value)); setRecentPage(1); }}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700"
                  >
                    {[5, 10, 25].map((size) => <option key={size} value={size}>{size} per page</option>)}
                  </select>
                  <button
                    type="button"
                    disabled={recentPage <= 1}
                    onClick={() => setRecentPage((p) => p - 1)}
                    className="rounded-lg border border-slate-200 p-1.5 disabled:opacity-40"
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  {pageNumbers.map((pageNumber) => (
                    <button
                      key={pageNumber}
                      type="button"
                      onClick={() => setRecentPage(pageNumber)}
                      className={`min-w-[2rem] rounded-lg border px-2 py-1 text-xs font-semibold ${
                        pageNumber === recentPage
                          ? 'border-dle-blue bg-dle-blue text-white'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {pageNumber}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={recentPage >= recentTotalPages}
                    onClick={() => setRecentPage((p) => p + 1)}
                    className="rounded-lg border border-slate-200 p-1.5 disabled:opacity-40"
                    aria-label="Next page"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-slate-900">Assets by Category</h2>
                <Link href="/it-support/asset-management/hardware" className="text-sm font-medium text-dle-blue hover:text-dle-blue-deep">
                  View report
                </Link>
              </div>

              <div className="relative mx-auto h-[200px] w-[200px]">
                {categoryBreakdown.length ? (
                  <>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={categoryBreakdown}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={62}
                          outerRadius={92}
                          paddingAngle={2}
                          stroke="none"
                        >
                          {categoryBreakdown.map((entry) => (
                            <Cell key={entry.name} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: number, _name, item) => [`${value} assets`, item.payload.name]} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-2xl font-bold text-slate-900">{number(totalAssets)}</span>
                      <span className="text-xs text-slate-400">Total Assets</span>
                    </div>
                  </>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-slate-500">No category data yet.</div>
                )}
              </div>

              <ul className="mt-5 space-y-3">
                {categoryBreakdown.map((item) => (
                  <li key={item.name} className="flex items-center gap-2 text-sm">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: item.color }} />
                    <span className="text-slate-600">{item.name}</span>
                    <span className="ml-auto whitespace-nowrap font-medium text-slate-900">
                      {item.value}
                      <span className="ml-1 font-normal text-slate-400">({item.pct}%)</span>
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 text-xs text-slate-500">
                <span>Total Categories: {categoryBreakdown.length}</span>
                <span>Total Assets: {number(totalAssets)}</span>
              </div>
            </div>
          </section>
        </div>
      )}
    </AssetManagementShell>
  );
}
