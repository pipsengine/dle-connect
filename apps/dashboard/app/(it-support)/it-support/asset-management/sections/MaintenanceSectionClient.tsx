'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Download,
  Layers,
  MoreVertical,
  Plus,
  RefreshCcw,
  Timer,
  Wallet,
  Wrench,
} from 'lucide-react';
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ItAssetDashboardPayload, ItMaintenanceRecord } from '@/lib/it-asset-management-store';
import { fetchAssetManagementPayload, postAssetManagementAction } from '../lib/asset-management-api';
import {
  buildMaintenanceDashboardStats,
  buildMaintenancePriorityChart,
  buildMaintenanceStatusChart,
  buildMaintenanceTypeBreakdown,
  buildUpcomingSchedules,
  currencyNgn,
  enrichMaintenanceRecords,
  filterMaintenanceRecords,
  formatScheduledRelative,
  numberFmt,
  paginateRecords,
  priorityTone,
  statusDotTone,
  type EnrichedMaintenanceRecord,
} from '../lib/maintenance-dashboard-utils';
import { MAINTENANCE_STATUS_FILTERS, maintenanceStatusClass, uniqueAssetDepartments, uniqueAssetLocations } from '../lib/maintenance-utils';
import { buildPageNumbers } from '../lib/dashboard-utils';
import { AssetManagementShell } from '../AssetManagementShell';
import { ScheduleMaintenanceModal, type ScheduleMaintenanceBatchInput } from '../components/ScheduleMaintenanceModal';
import { MaintenanceCalendarModal } from '../components/MaintenanceCalendarModal';
import { ErrorBanner } from '../components/AssetManagementShared';
import type { ScheduleModalPreset } from '../lib/maintenance-utils';

const PAGE_SIZE = 7;
const filterSelectClass = 'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700';

const ICON_STYLES: Record<string, string> = {
  blue: 'bg-blue-50 text-blue-600',
  rose: 'bg-rose-50 text-rose-600',
  orange: 'bg-orange-50 text-orange-600',
  green: 'bg-emerald-50 text-emerald-600',
  teal: 'bg-teal-50 text-teal-600',
  violet: 'bg-violet-50 text-violet-600',
};

function KpiCard({
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
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1.5 text-2xl font-black text-slate-950">{loading ? '—' : value}</p>
          <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p>
        </div>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${ICON_STYLES[color]}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </div>
  );
}

function RowActionsMenu({
  row,
  onStart,
  onComplete,
}: {
  row: EnrichedMaintenanceRecord;
  onStart: () => void;
  onComplete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const isComplete = row.displayStatus === 'Completed';
  const canStart = !isComplete && row.displayStatus !== 'In Progress';

  if (isComplete) return <span className="text-xs text-slate-400">—</span>;

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((value) => !value)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
        <MoreVertical className="h-4 w-4" />
      </button>
      {open ? (
        <>
          <button type="button" className="fixed inset-0 z-10" aria-label="Close menu" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-40 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
            {canStart ? (
              <button type="button" onClick={() => { setOpen(false); onStart(); }} className="block w-full px-3 py-2 text-left text-xs font-semibold text-amber-700 hover:bg-slate-50">
                Start maintenance
              </button>
            ) : null}
            <button type="button" onClick={() => { setOpen(false); onComplete(); }} className="block w-full px-3 py-2 text-left text-xs font-semibold text-emerald-700 hover:bg-slate-50">
              Mark complete
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

export function MaintenanceSectionClient() {
  const [assets, setAssets] = useState<ItAssetDashboardPayload['assets']>([]);
  const [allRecords, setAllRecords] = useState<ItMaintenanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [scheduleModal, setScheduleModal] = useState<{ open: boolean; preset: ScheduleModalPreset }>({ open: false, preset: 'default' });
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const dashboard = await fetchAssetManagementPayload();
      setAssets(dashboard.assets);
      setAllRecords(dashboard.maintenance || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load maintenance records.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const enriched = useMemo(() => enrichMaintenanceRecords(allRecords, assets), [allRecords, assets]);
  const departments = useMemo(() => uniqueAssetDepartments(assets), [assets]);
  const locations = useMemo(() => uniqueAssetLocations(assets), [assets]);

  const stats = useMemo(() => buildMaintenanceDashboardStats(enriched), [enriched]);
  const statusChart = useMemo(() => buildMaintenanceStatusChart(enriched), [enriched]);
  const priorityChart = useMemo(() => buildMaintenancePriorityChart(enriched), [enriched]);
  const typeBreakdown = useMemo(() => buildMaintenanceTypeBreakdown(enriched), [enriched]);
  const upcoming = useMemo(() => buildUpcomingSchedules(enriched), [enriched]);

  const filtered = useMemo(
    () => filterMaintenanceRecords(enriched, {
      search,
      department: departmentFilter,
      location: locationFilter,
      status: statusFilter,
      priority: priorityFilter,
      dateFrom,
      dateTo,
    }),
    [dateFrom, dateTo, departmentFilter, enriched, locationFilter, priorityFilter, search, statusFilter],
  );

  const paged = useMemo(() => paginateRecords(filtered, page, PAGE_SIZE), [filtered, page]);
  const pageNumbers = useMemo(() => buildPageNumbers(paged.page, paged.totalPages, 5), [paged.page, paged.totalPages]);

  const resetFilters = () => {
    setSearch('');
    setDepartmentFilter('');
    setLocationFilter('');
    setStatusFilter('');
    setPriorityFilter('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  const handleSchedule = async (input: ScheduleMaintenanceBatchInput) => {
    const result = await postAssetManagementAction<{ result: { created: number } }>({
      action: 'schedule-maintenance-batch',
      ...input,
    });
    const count = result.result.created;
    const preset = scheduleModal.preset;
    const message = preset === 'work-order'
      ? `Work order created and maintenance started for ${count} asset${count === 1 ? '' : 's'}.`
      : preset === 'service-request'
        ? `Service request submitted for ${count} asset${count === 1 ? '' : 's'}.`
        : preset === 'bulk-schedule'
          ? `Scheduled maintenance for ${count} asset${count === 1 ? '' : 's'}.`
          : `Created ${count} maintenance record${count === 1 ? '' : 's'}.`;
    setSuccess(message);
    closeScheduleModal();
    await load();
  };

  const openScheduleModal = (preset: ScheduleModalPreset = 'default') => {
    setScheduleModal({ open: true, preset });
  };

  const closeScheduleModal = () => {
    setScheduleModal((current) => ({ ...current, open: false }));
  };

  const startMaintenance = async (row: EnrichedMaintenanceRecord) => {
    try {
      await postAssetManagementAction({
        action: 'update-maintenance',
        maintenanceId: row.maintenanceId,
        maintenance: { status: 'In Progress' },
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start maintenance.');
    }
  };

  const markCompleted = async (row: EnrichedMaintenanceRecord) => {
    if (row.displayStatus === 'Completed') return;
    if (!window.confirm(`Mark "${row.title}" as completed?`)) return;
    try {
      await postAssetManagementAction({
        action: 'update-maintenance',
        maintenanceId: row.maintenanceId,
        maintenance: { status: 'Completed' },
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to complete maintenance.');
    }
  };

  const kpiCards = [
    { label: 'Total Maintenance Tasks', value: numberFmt(stats.total), hint: 'All registered tasks', icon: ClipboardList, color: 'blue' },
    { label: 'Overdue Tasks', value: numberFmt(stats.overdue), hint: `${stats.overduePct}% of total tasks`, icon: Clock3, color: 'rose' },
    { label: 'Due This Week', value: numberFmt(stats.dueThisWeek), hint: `${stats.dueThisWeekPct}% of total tasks`, icon: CalendarClock, color: 'orange' },
    { label: 'Completed (This Month)', value: numberFmt(stats.completedThisMonth), hint: `${stats.completionRate}% completion rate`, icon: CheckCircle2, color: 'green' },
    { label: 'Avg. Downtime (hrs)', value: String(stats.avgDowntimeHours || '—'), hint: 'This month', icon: Timer, color: 'violet' },
    { label: 'Maintenance Cost', value: currencyNgn(stats.maintenanceCostYtd), hint: 'Year to date', icon: Wallet, color: 'teal' },
  ];

  const showingFrom = filtered.length ? (paged.page - 1) * PAGE_SIZE + 1 : 0;
  const showingTo = Math.min(paged.page * PAGE_SIZE, filtered.length);

  return (
    <AssetManagementShell title="Maintenance" description="Plan, schedule, and perform maintenance across departments, locations, or individual assets.">
      <ErrorBanner message={error} />
      {success ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {success}
          <button type="button" onClick={() => setSuccess('')} className="ml-3 text-xs font-semibold underline">Dismiss</button>
        </div>
      ) : null}

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-6">
        {kpiCards.map((card) => (
          <KpiCard key={card.label} {...card} loading={loading} />
        ))}
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-bold text-slate-950">Maintenance Status Overview</h3>
          <div className="mt-4 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusChart} dataKey="value" nameKey="name" innerRadius={52} outerRadius={78} paddingAngle={2} stroke="none">
                  {statusChart.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 space-y-1">
            {statusChart.map((item) => (
              <div key={item.name} className="flex items-center justify-between text-xs text-slate-600">
                <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />{item.name}</span>
                <span className="font-semibold text-slate-900">{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-bold text-slate-950">Tasks by Priority</h3>
          <div className="mt-4 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={priorityChart}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {priorityChart.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-bold text-slate-950">Tasks by Type</h3>
          <div className="mt-4 space-y-3">
            {typeBreakdown.map((item) => (
              <div key={item.name}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700">{item.name}</span>
                  <span className="text-slate-500">{item.value} · {item.pct}%</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100">
                  <div className="h-2 rounded-full bg-dle-blue" style={{ width: `${item.pct}%` }} />
                </div>
              </div>
            ))}
            {!typeBreakdown.length ? <p className="text-xs text-slate-500">No maintenance tasks yet.</p> : null}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <select value={departmentFilter} onChange={(e) => { setDepartmentFilter(e.target.value); setPage(1); }} className={filterSelectClass}>
              <option value="">Department</option>
              {departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <select value={locationFilter} onChange={(e) => { setLocationFilter(e.target.value); setPage(1); }} className={filterSelectClass}>
              <option value="">Location</option>
              {locations.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className={filterSelectClass}>
              <option value="">Status</option>
              {MAINTENANCE_STATUS_FILTERS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={priorityFilter} onChange={(e) => { setPriorityFilter(e.target.value); setPage(1); }} className={filterSelectClass}>
              <option value="">Priority</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
            <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className={filterSelectClass} />
            <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className={filterSelectClass} />
            <button type="button" onClick={resetFilters} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Reset</button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search maintenance tasks..."
              className="min-w-[220px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh
              </button>
              <button type="button" onClick={() => window.open('/api/it-support/asset-management?section=maintenance&format=csv', '_blank')} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                <Download className="h-4 w-4" />Export CSV
              </button>
              <button type="button" onClick={() => openScheduleModal('default')} className="inline-flex items-center gap-2 rounded-lg bg-dle-blue px-3 py-2 text-xs font-semibold text-white hover:bg-dle-blue-deep">
                <Plus className="h-4 w-4" />Schedule maintenance
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Title</th>
                    <th className="px-4 py-3">Asset</th>
                    <th className="px-4 py-3">Department</th>
                    <th className="px-4 py-3">Location</th>
                    <th className="px-4 py-3">Scheduled</th>
                    <th className="px-4 py-3">Priority</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Assigned To</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.items.map((row) => {
                    const schedule = formatScheduledRelative(row.scheduledDate, row.displayStatus);
                    return (
                      <tr key={row.maintenanceId} className="border-b border-slate-50 hover:bg-slate-50/60">
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">{row.title}</div>
                          {row.notes ? <div className="mt-0.5 line-clamp-1 text-xs text-slate-500">{row.notes}</div> : null}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-800">{row.assetName}</div>
                          {row.assetTag ? <div className="font-mono text-xs text-slate-500">{row.assetTag}</div> : null}
                        </td>
                        <td className="px-4 py-3 text-slate-700">{row.department || '—'}</td>
                        <td className="px-4 py-3 text-slate-700">{row.location || '—'}</td>
                        <td className="px-4 py-3">
                          <div className="font-mono text-xs text-slate-700">{schedule.date}</div>
                          {schedule.relative ? (
                            <div className={`text-xs ${schedule.overdue ? 'font-semibold text-rose-600' : 'text-slate-500'}`}>{schedule.relative}</div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${priorityTone(row.priority)}`}>
                            {row.priority === 'Critical' ? 'High' : row.priority}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 text-xs ${maintenanceStatusClass(row.displayStatus)}`}>
                            <span className={`h-2 w-2 rounded-full ${statusDotTone(row.displayStatus)}`} />
                            {row.displayStatus}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-slate-800">{row.assignedTo || 'Unassigned'}</div>
                          {row.department ? <div className="text-xs text-slate-500">IT Technician</div> : null}
                        </td>
                        <td className="px-4 py-3">
                          <RowActionsMenu row={row} onStart={() => void startMaintenance(row)} onComplete={() => void markCompleted(row)} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!loading && !paged.items.length ? (
                <div className="py-12 text-center text-sm text-slate-500">No maintenance tasks match your filters.</div>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
              <span>Showing {showingFrom} to {showingTo} of {filtered.length} maintenance tasks</span>
              <div className="flex items-center gap-1">
                <button type="button" disabled={paged.page <= 1} onClick={() => setPage(paged.page - 1)} className="rounded border border-slate-200 px-2 py-1 disabled:opacity-40">‹</button>
                {pageNumbers.map((pageNumber) => (
                  <button
                    key={pageNumber}
                    type="button"
                    onClick={() => setPage(pageNumber)}
                    className={`min-w-[28px] rounded border px-2 py-1 ${pageNumber === paged.page ? 'border-dle-blue bg-dle-blue text-white' : 'border-slate-200'}`}
                  >
                    {pageNumber}
                  </button>
                ))}
                <button type="button" disabled={paged.page >= paged.totalPages} onClick={() => setPage(paged.page + 1)} className="rounded border border-slate-200 px-2 py-1 disabled:opacity-40">›</button>
              </div>
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-bold text-slate-950">Maintenance Highlights</h3>
            <div className="mt-3 space-y-2">
              {statusChart.map((item) => (
                <div key={item.name} className="flex items-center justify-between text-sm">
                  <span className="inline-flex items-center gap-2 text-slate-600">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                    {item.name}
                  </span>
                  <span className="font-bold text-slate-900">{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div id="upcoming-schedules" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-bold text-slate-950">Upcoming Schedules</h3>
            <div className="mt-3 space-y-3">
              {upcoming.map(({ row, diffDays }) => (
                <div key={row.maintenanceId} className="flex gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                    <Wrench className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-900">{row.assetName}</div>
                    <div className="font-mono text-[11px] text-slate-500">{row.assetTag || '—'}</div>
                    <div className="mt-1 text-xs text-slate-500">{row.scheduledDate}</div>
                    <div className="text-xs font-semibold text-blue-700">In {diffDays} day{diffDays === 1 ? '' : 's'}</div>
                  </div>
                </div>
              ))}
              {!upcoming.length ? <p className="text-xs text-slate-500">No upcoming schedules.</p> : null}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-bold text-slate-950">Quick Actions</h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Create Work Order', sub: 'Start maintenance now', icon: Wrench, action: () => openScheduleModal('work-order') },
                { label: 'Bulk Schedule', sub: 'By dept or site', icon: Layers, action: () => openScheduleModal('bulk-schedule') },
                { label: 'Service Request', sub: 'Corrective work', icon: ClipboardList, action: () => openScheduleModal('service-request') },
                { label: 'Maintenance Calendar', sub: 'View upcoming', icon: CalendarClock, action: () => setCalendarOpen(true) },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={item.action}
                    className="rounded-xl border border-slate-100 bg-slate-50/80 p-3 text-left transition hover:border-slate-200 hover:bg-white"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-dle-blue shadow-sm">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="mt-2 text-xs font-bold text-slate-900">{item.label}</div>
                    <div className="text-[11px] text-slate-500">{item.sub}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>
      </div>

      <ScheduleMaintenanceModal
        open={scheduleModal.open}
        onClose={closeScheduleModal}
        assets={assets}
        preset={scheduleModal.preset}
        onSubmit={handleSchedule}
      />

      <MaintenanceCalendarModal
        open={calendarOpen}
        onClose={() => setCalendarOpen(false)}
        records={enriched}
        departments={departments}
        locations={locations}
        onStart={startMaintenance}
        onComplete={async (row) => {
          if (!window.confirm(`Mark "${row.title}" as completed?`)) return;
          await markCompleted(row);
        }}
      />
    </AssetManagementShell>
  );
}
