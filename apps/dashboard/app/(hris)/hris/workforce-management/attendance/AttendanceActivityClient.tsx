'use client';

/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, CheckCircle2, Clock, Download, MapPin, RefreshCcw, Search, ShieldAlert, Timer, UserRoundCheck, X } from 'lucide-react';

type AttendanceStatus = 'Present' | 'Late' | 'Absent' | 'On Leave' | 'Remote' | 'Excused';
type ClockingMode = 'Ready To Clock In' | 'Clocked In' | 'Clocked Out' | 'Exception';
type ClockingEvent = {
  id: string;
  employeeId: string;
  action: 'CLOCK_IN' | 'CLOCK_OUT' | 'PUNCH';
  timestamp: string;
  source: string;
  actor: string;
  note: string | null;
  terminalName: string;
};
type ClockingRecord = {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  businessUnit: string;
  jobTitle: string;
  location: string;
  site: string;
  shift: string;
  attendanceStatus: AttendanceStatus;
  scheduledStart: string;
  scheduledEnd: string;
  clockInTime: string | null;
  clockOutTime: string | null;
  punchCount: number;
  minutesLate: number;
  overtimeHours: number;
  source: string;
  supervisor: string;
  clockingMode: ClockingMode;
  deviceName: string;
  lastActionAt: string | null;
  exceptionNote: string | null;
  events: ClockingEvent[];
};
type Payload = {
  generatedAt: string;
  attendanceDate: string;
  source: 'Live Biometric Database';
  permissions: { actor: string; role: string; canEdit: boolean; canExport: boolean; canViewAudit: boolean };
  summary: {
    totalEmployees: number;
    readyToClockIn: number;
    clockedIn: number;
    clockedOut: number;
    exceptions: number;
    latePunches: number;
    averageLateMinutes: number;
    activeSites: number;
    totalPunches: number;
  };
  filterOptions: {
    businessUnits: string[];
    locations: string[];
    sites: string[];
    shifts: string[];
    statuses: AttendanceStatus[];
    modes: ClockingMode[];
  };
  records: ClockingRecord[];
};
type ApiResponse<T> = { status: 'success' | 'error'; data?: T; error?: string };
type Tone = 'blue' | 'green' | 'amber' | 'red' | 'slate';

const numberFmt = new Intl.NumberFormat('en-GB');
const number = (value: number | undefined) => numberFmt.format(value || 0);
const todayInput = () => new Date().toISOString().slice(0, 10);
const minutesFromTime = (value: string | null) => {
  if (!value) return null;
  const [hourText, minuteText] = value.split(':');
  const hours = Number(hourText);
  const minutes = Number(minuteText);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
};
const totalWorkedMinutes = (record: Pick<ClockingRecord, 'clockInTime' | 'clockOutTime'>) => {
  const clockIn = minutesFromTime(record.clockInTime);
  const clockOut = minutesFromTime(record.clockOutTime);
  if (clockIn === null || clockOut === null) return 0;
  const adjustedClockOut = clockOut < clockIn ? clockOut + 24 * 60 : clockOut;
  return Math.max(0, adjustedClockOut - clockIn);
};
const totalWorkedHours = (record: Pick<ClockingRecord, 'clockInTime' | 'clockOutTime'>) => Math.round((totalWorkedMinutes(record) / 60) * 100) / 100;
const formatWorkedHours = (record: Pick<ClockingRecord, 'clockInTime' | 'clockOutTime'>) => {
  const minutes = totalWorkedMinutes(record);
  const hoursPart = Math.floor(minutes / 60);
  const minutesPart = minutes % 60;
  return `${hoursPart}h ${String(minutesPart).padStart(2, '0')}m`;
};

const toneClass: Record<Tone, string> = {
  blue: 'border-blue-200 bg-blue-50 text-blue-800',
  green: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  amber: 'border-amber-200 bg-amber-50 text-amber-800',
  red: 'border-red-200 bg-red-50 text-red-800',
  slate: 'border-slate-200 bg-slate-50 text-slate-700',
};

const statusTone = (value: string): Tone => {
  const text = value.toLowerCase();
  if (text.includes('exception') || text.includes('absent')) return 'red';
  if (text.includes('late') || text.includes('clocked in')) return 'amber';
  if (text.includes('present') || text.includes('clocked out') || text.includes('remote')) return 'green';
  return 'blue';
};

const formatDateTime = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('en-GB');
};

const csvValue = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;

function Metric({ label, value, detail, icon: Icon, tone }: { label: string; value: string; detail: string; icon: any; tone: Tone }) {
  return (
    <div className={`rounded-lg border p-4 ${toneClass[tone]}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase text-slate-600">{label}</p>
          <p className="mt-2 text-2xl font-black text-slate-950">{value}</p>
          <p className="mt-1 text-xs font-bold text-slate-600">{detail}</p>
        </div>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/80 text-slate-900 shadow-sm">
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </div>
  );
}

function SelectFilter({ value, onChange, options, label }: { value: string; onChange: (value: string) => void; options: string[]; label: string }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} aria-label={label} className="h-10 min-w-40 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20">
      <option value="All">{label}</option>
      {options.map((item) => <option key={item} value={item}>{item}</option>)}
    </select>
  );
}

function Chip({ value }: { value: string }) {
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-black ${toneClass[statusTone(value)]}`}>{value}</span>;
}

export default function AttendanceActivityClient({ initialNow }: { initialNow: string }) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [date, setDate] = useState(todayInput());
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState('All');
  const [status, setStatus] = useState('All');
  const [site, setSite] = useState('All');
  const [selectedId, setSelectedId] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/hris/attendance/clock-in-clock-out?date=${encodeURIComponent(date)}`, {
        headers: { 'x-hris-role': 'HR Manager' },
        cache: 'no-store',
      });
      const json = (await res.json()) as ApiResponse<Payload>;
      if (!res.ok || json.status !== 'success' || !json.data) throw new Error(json.error || `Attendance request failed (${res.status})`);
      const data = json.data;
      setPayload(data);
      setSelectedId((current) => current && data.records.some((item) => item.id === current) ? current : data.records[0]?.id || '');
    } catch (event) {
      setError(event instanceof Error ? event.message : 'Unable to load attendance activities.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [date]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (payload?.records || []).filter((item) => {
      if (mode !== 'All' && item.clockingMode !== mode) return false;
      if (status !== 'All' && item.attendanceStatus !== status) return false;
      if (site !== 'All' && item.site !== site) return false;
      if (!needle) return true;
      return [item.employeeId, item.employeeName, item.department, item.businessUnit, item.jobTitle, item.location, item.site, item.shift, item.clockingMode, item.attendanceStatus, item.deviceName, item.supervisor]
        .some((value) => String(value || '').toLowerCase().includes(needle));
    });
  }, [payload?.records, query, mode, status, site]);

  const selected = useMemo(() => filtered.find((item) => item.id === selectedId) || filtered[0] || null, [filtered, selectedId]);

  const exportCsv = () => {
    const rows = [
      ['Employee ID', 'Employee', 'Department', 'Location', 'Site', 'Shift', 'Status', 'Clocking Mode', 'Scheduled Start', 'Scheduled End', 'Clock In', 'Clock Out', 'Punches', 'Late Minutes', 'Overtime Hours', 'Device', 'Supervisor', 'Total Hours Worked'],
      ...filtered.map((item) => [item.employeeId, item.employeeName, item.department, item.location, item.site, item.shift, item.attendanceStatus, item.clockingMode, item.scheduledStart, item.scheduledEnd, item.clockInTime || '', item.clockOutTime || '', item.punchCount, item.minutesLate, item.overtimeHours, item.deviceName, item.supervisor, totalWorkedHours(item)]),
    ];
    const blob = new Blob([rows.map((row) => row.map(csvValue).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `attendance-activities-${payload?.attendanceDate || date}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-white text-slate-950">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-600 text-white"><Clock className="h-6 w-6" /></span>
            <div>
              <h1 className="text-2xl font-black tracking-tight">Attendance Activities</h1>
              <p className="mt-1 text-sm font-semibold text-slate-600">Live clock-in, clock-out, punch, lateness, open-session, device, and exception details.</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-extrabold">
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-800">{payload?.source || 'Live Biometric Database'}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">Attendance date: {payload?.attendanceDate || date}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">Loaded: {new Date(payload?.generatedAt || initialNow).toLocaleString('en-GB')}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-3 text-xs font-extrabold text-white hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60">
            <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh
          </button>
          <button type="button" onClick={exportCsv} disabled={!filtered.length} className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-950 px-3 text-xs font-extrabold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400">
            <Download className="h-4 w-4" />Export
          </button>
        </div>
      </div>

      {error ? <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">{error}</div> : null}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <Metric label="Employees" value={number(payload?.summary.totalEmployees)} detail="Attendance records" icon={UserRoundCheck} tone="blue" />
        <Metric label="Clocked In" value={number(payload?.summary.clockedIn)} detail="Open sessions" icon={Timer} tone={(payload?.summary.clockedIn || 0) ? 'amber' : 'green'} />
        <Metric label="Clocked Out" value={number(payload?.summary.clockedOut)} detail="Closed sessions" icon={CheckCircle2} tone="green" />
        <Metric label="Exceptions" value={number(payload?.summary.exceptions)} detail="No punch or invalid state" icon={ShieldAlert} tone={(payload?.summary.exceptions || 0) ? 'red' : 'green'} />
        <Metric label="Late Punches" value={number(payload?.summary.latePunches)} detail={`${number(payload?.summary.averageLateMinutes)} min average`} icon={AlertTriangle} tone={(payload?.summary.latePunches || 0) ? 'amber' : 'green'} />
        <Metric label="Punches" value={number(payload?.summary.totalPunches)} detail={`${number(payload?.summary.activeSites)} active sites`} icon={MapPin} tone="slate" />
      </div>

      <div className="mt-5 flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search employee, site, device, status, department..." className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-9 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
          {query ? <button type="button" onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <SelectFilter label="All Modes" value={mode} onChange={setMode} options={payload?.filterOptions.modes || []} />
          <SelectFilter label="All Statuses" value={status} onChange={setStatus} options={payload?.filterOptions.statuses || []} />
          <SelectFilter label="All Sites" value={site} onChange={setSite} options={payload?.filterOptions.sites || []} />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 2xl:grid-cols-[1fr_390px]">
        <section className="min-w-0 rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
            <div>
              <h2 className="text-base font-black">Time And Attendance Activity Log</h2>
              <p className="mt-1 text-xs font-bold text-slate-500">{number(filtered.length)} displayed of {number(payload?.records.length)} records</p>
            </div>
            <CalendarDays className="h-5 w-5 text-blue-600" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] divide-y divide-slate-100">
              <thead className="bg-slate-50">
                <tr>
                  {['Employee', 'Time Activity', 'Schedule', 'Punches', 'Lateness', 'Location / Device', 'Status', 'Total Hours Worked'].map((header) => (
                    <th key={header} className="px-4 py-3 text-left text-[11px] font-black uppercase text-slate-500">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((item) => (
                  <tr key={item.id} onClick={() => setSelectedId(item.id)} className={`cursor-pointer hover:bg-blue-50/50 ${selected?.id === item.id ? 'bg-blue-50' : 'bg-white'}`}>
                    <td className="px-4 py-3">
                      <div className="text-sm font-black">{item.employeeName}</div>
                      <div className="text-xs font-bold text-slate-500">{item.employeeId} - {item.department}</div>
                      <div className="mt-1 text-[11px] font-semibold text-slate-400">{item.jobTitle}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-black text-slate-900">{item.clockInTime || '--'} <span className="text-slate-400">to</span> {item.clockOutTime || '--'}</div>
                      <div className="mt-1 text-xs font-bold text-slate-500">Last action: {item.lastActionAt || 'No punch'}</div>
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-slate-700">{item.scheduledStart} to {item.scheduledEnd}<div className="mt-1 text-xs text-slate-500">{item.shift}</div></td>
                    <td className="px-4 py-3 text-sm font-black text-slate-900">{number(item.punchCount)}</td>
                    <td className="px-4 py-3 text-sm font-black text-slate-900">{number(item.minutesLate)} min</td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-bold text-slate-700">{item.location}</div>
                      <div className="text-xs font-semibold text-slate-500">{item.deviceName}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-1">
                        <Chip value={item.clockingMode} />
                        <Chip value={item.attendanceStatus} />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-black text-slate-900 tabular-nums">{formatWorkedHours(item)}</div>
                      <div className="mt-1 text-[11px] font-semibold text-slate-500">{item.clockOutTime ? 'Clock-in to clock-out' : 'Awaiting clock-out'}</div>
                    </td>
                  </tr>
                ))}
                {!filtered.length ? (
                  <tr><td colSpan={8} className="px-4 py-10 text-center text-sm font-bold text-slate-500">No attendance activity matched the selected filters.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-4">
            <h2 className="text-base font-black">Activity Detail</h2>
            <p className="mt-1 text-xs font-bold text-slate-500">{selected ? `${selected.employeeId} - ${selected.employeeName}` : 'No record selected'}</p>
          </div>
          {selected ? (
            <div className="space-y-4 p-4">
              <div className="grid grid-cols-2 gap-3">
                <Detail label="Mode" value={selected.clockingMode} />
                <Detail label="Attendance" value={selected.attendanceStatus} />
                <Detail label="Clock In" value={selected.clockInTime || '--'} />
                <Detail label="Clock Out" value={selected.clockOutTime || '--'} />
                <Detail label="Total Hours Worked" value={formatWorkedHours(selected)} />
                <Detail label="Punches" value={number(selected.punchCount)} />
                <Detail label="Late" value={`${number(selected.minutesLate)} min`} />
                <Detail label="Overtime" value={`${number(selected.overtimeHours)} hrs`} />
                <Detail label="Shift" value={selected.shift} />
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-[11px] font-black uppercase text-slate-500">Location</p>
                <p className="mt-1 text-sm font-black text-slate-900">{selected.location}</p>
                <p className="mt-1 text-xs font-bold text-slate-500">{selected.site}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-[11px] font-black uppercase text-slate-500">Device / Source</p>
                <p className="mt-1 text-sm font-black text-slate-900">{selected.deviceName}</p>
                <p className="mt-1 text-xs font-bold text-slate-500">{selected.source}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-[11px] font-black uppercase text-slate-500">Supervisor</p>
                <p className="mt-1 text-sm font-black text-slate-900">{selected.supervisor}</p>
              </div>
              {selected.exceptionNote ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <p className="text-[11px] font-black uppercase text-red-700">Exception</p>
                  <p className="mt-1 text-sm font-bold text-red-800">{selected.exceptionNote}</p>
                </div>
              ) : null}
              <div>
                <p className="text-[11px] font-black uppercase text-slate-500">Events</p>
                <div className="mt-2 space-y-2">
                  {selected.events.length ? selected.events.map((event) => (
                    <div key={event.id} className="rounded-lg border border-slate-200 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-black text-slate-900">{event.action.replace('_', ' ')}</p>
                        <p className="text-[11px] font-bold text-slate-500">{formatDateTime(event.timestamp)}</p>
                      </div>
                      <p className="mt-1 text-xs font-semibold text-slate-500">{event.terminalName}</p>
                    </div>
                  )) : <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs font-bold text-slate-500">No punch events found for this attendance date.</div>}
                </div>
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-[11px] font-black uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-black text-slate-900">{value}</p>
    </div>
  );
}
