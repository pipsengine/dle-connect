'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { EnrichedMaintenanceRecord } from '../lib/maintenance-dashboard-utils';
import { formatScheduledRelative, priorityTone, statusDotTone } from '../lib/maintenance-dashboard-utils';
import { maintenanceStatusClass } from '../lib/maintenance-utils';

type Props = {
  open: boolean;
  onClose: () => void;
  records: EnrichedMaintenanceRecord[];
  departments: string[];
  locations: string[];
  onStart?: (record: EnrichedMaintenanceRecord) => Promise<void>;
  onComplete?: (record: EnrichedMaintenanceRecord) => Promise<void>;
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const buildCalendarCells = (month: Date) => {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstDay = new Date(year, monthIndex, 1);
  const lastDay = new Date(year, monthIndex + 1, 0);
  const cells: Array<{ date: string | null; day: number | null }> = [];
  for (let i = 0; i < firstDay.getDay(); i += 1) cells.push({ date: null, day: null });
  for (let day = 1; day <= lastDay.getDate(); day += 1) {
    const date = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    cells.push({ date, day });
  }
  return cells;
};

export function MaintenanceCalendarModal({ open, onClose, records, departments, locations, onStart, onComplete }: Props) {
  const [month, setMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  const filtered = useMemo(() => records.filter((row) => {
    if (departmentFilter && (row.department || '').toLowerCase() !== departmentFilter.toLowerCase()) return false;
    if (locationFilter && (row.location || '').toLowerCase() !== locationFilter.toLowerCase()) return false;
    return Boolean(row.scheduledDate);
  }), [departmentFilter, locationFilter, records]);

  const byDate = useMemo(() => {
    const map = new Map<string, EnrichedMaintenanceRecord[]>();
    filtered.forEach((row) => {
      if (!row.scheduledDate) return;
      const bucket = map.get(row.scheduledDate) || [];
      bucket.push(row);
      map.set(row.scheduledDate, bucket);
    });
    return map;
  }, [filtered]);

  const cells = useMemo(() => buildCalendarCells(month), [month]);
  const selectedTasks = byDate.get(selectedDate) || [];

  useEffect(() => {
    if (!open) return;
    const today = new Date();
    setMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDate(today.toISOString().slice(0, 10));
    setDepartmentFilter('');
    setLocationFilter('');
    setError('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyId) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busyId, onClose, open]);

  const shiftMonth = (delta: number) => {
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  };

  const runAction = async (record: EnrichedMaintenanceRecord, action: 'start' | 'complete') => {
    const handler = action === 'start' ? onStart : onComplete;
    if (!handler) return;
    setBusyId(record.maintenanceId);
    setError('');
    try {
      await handler(record);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update maintenance record.');
    } finally {
      setBusyId('');
    }
  };

  if (!open) return null;

  const monthLabel = month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]" aria-label="Close dialog" onClick={() => !busyId && onClose()} />
      <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Maintenance Calendar</h2>
            <p className="mt-1 text-sm text-slate-500">View upcoming and scheduled maintenance across departments and locations.</p>
          </div>
          <button type="button" onClick={() => !busyId && onClose()} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-5">
          {error ? <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <option value="">All departments</option>
              {departments.map((department) => <option key={department} value={department}>{department}</option>)}
            </select>
            <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <option value="">All locations</option>
              {locations.map((location) => <option key={location} value={location}>{location}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="mb-4 flex items-center justify-between">
                <button type="button" onClick={() => shiftMonth(-1)} className="rounded-lg border border-slate-200 p-2 hover:bg-slate-50">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <h3 className="text-sm font-bold text-slate-900">{monthLabel}</h3>
                <button type="button" onClick={() => shiftMonth(1)} className="rounded-lg border border-slate-200 p-2 hover:bg-slate-50">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase text-slate-500">
                {WEEKDAYS.map((day) => <div key={day} className="py-1">{day}</div>)}
              </div>

              <div className="mt-1 grid grid-cols-7 gap-1">
                {cells.map((cell, index) => {
                  if (!cell.date || !cell.day) return <div key={`empty-${index}`} className="h-14" />;
                  const tasks = byDate.get(cell.date) || [];
                  const isSelected = cell.date === selectedDate;
                  const isToday = cell.date === today;
                  return (
                    <button
                      key={cell.date}
                      type="button"
                      onClick={() => setSelectedDate(cell.date!)}
                      className={`h-14 rounded-lg border p-1 text-left transition ${
                        isSelected ? 'border-dle-blue bg-dle-blue/10' : 'border-slate-100 hover:bg-slate-50'
                      }`}
                    >
                      <div className={`text-xs font-semibold ${isToday ? 'text-dle-blue' : 'text-slate-800'}`}>{cell.day}</div>
                      {tasks.length ? (
                        <div className="mt-1 flex flex-wrap gap-0.5">
                          {tasks.slice(0, 3).map((task) => (
                            <span key={task.maintenanceId} className={`h-1.5 w-1.5 rounded-full ${statusDotTone(task.displayStatus)}`} />
                          ))}
                          {tasks.length > 3 ? <span className="text-[9px] text-slate-500">+{tasks.length - 3}</span> : null}
                        </div>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 p-4">
              <h3 className="text-sm font-bold text-slate-950">{selectedDate}</h3>
              <p className="mt-1 text-xs text-slate-500">{selectedTasks.length} task{selectedTasks.length === 1 ? '' : 's'} scheduled</p>
              <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">
                {selectedTasks.map((row) => {
                  const schedule = formatScheduledRelative(row.scheduledDate, row.displayStatus);
                  const isBusy = busyId === row.maintenanceId;
                  return (
                    <div key={row.maintenanceId} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                      <div className="text-sm font-semibold text-slate-900">{row.title}</div>
                      <div className="mt-1 text-xs text-slate-600">{row.assetName}{row.assetTag ? ` · ${row.assetTag}` : ''}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                        <span className={`inline-flex rounded-full px-2 py-0.5 font-semibold ring-1 ring-inset ${priorityTone(row.priority)}`}>{row.priority}</span>
                        <span className={maintenanceStatusClass(row.displayStatus)}>{row.displayStatus}</span>
                        {schedule.relative ? <span className="text-slate-500">{schedule.relative}</span> : null}
                      </div>
                      {row.displayStatus !== 'Completed' ? (
                        <div className="mt-2 flex gap-2">
                          {row.displayStatus !== 'In Progress' && onStart ? (
                            <button
                              type="button"
                              disabled={Boolean(busyId)}
                              onClick={() => void runAction(row, 'start')}
                              className="text-xs font-semibold text-amber-700 hover:text-amber-900 disabled:opacity-50"
                            >
                              {isBusy ? 'Updating...' : 'Start'}
                            </button>
                          ) : null}
                          {onComplete ? (
                            <button
                              type="button"
                              disabled={Boolean(busyId)}
                              onClick={() => void runAction(row, 'complete')}
                              className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 disabled:opacity-50"
                            >
                              {isBusy ? 'Updating...' : 'Complete'}
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                {!selectedTasks.length ? <p className="text-xs text-slate-500">No maintenance scheduled for this day.</p> : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
