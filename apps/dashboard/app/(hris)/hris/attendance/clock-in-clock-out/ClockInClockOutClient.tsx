'use client';

import { useEffect, useMemo, useState } from 'react';
import { PageTemplate } from '@/components/layout/page-template';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Download,
  Fingerprint,
  LogIn,
  LogOut,
  RefreshCcw,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react';
import type { StructureInsight } from '@/lib/organization-data';
import type { AttendanceStatus, BiometricSource, Shift } from '@/lib/attendance-data';

type ClockingMode = 'Ready To Clock In' | 'Clocked In' | 'Clocked Out' | 'Exception';

type ClockingEvent = {
  id: string;
  employeeId: string;
  action: 'CLOCK_IN' | 'CLOCK_OUT' | 'PUNCH';
  timestamp: string;
  source: BiometricSource;
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
  shift: Shift;
  attendanceStatus: AttendanceStatus;
  scheduledStart: string;
  scheduledEnd: string;
  clockInTime: string | null;
  clockOutTime: string | null;
  punchCount: number;
  minutesLate: number;
  overtimeHours: number;
  source: BiometricSource;
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
  permissions: {
    actor: string;
    role: string;
    canEdit: boolean;
    canExport: boolean;
    canViewAudit: boolean;
  };
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
    shifts: Shift[];
    statuses: AttendanceStatus[];
    modes: ClockingMode[];
  };
  records: ClockingRecord[];
  insights: StructureInsight[];
};

const formatNumber = (value: number) => new Intl.NumberFormat('en-NG').format(value);
const formatDate = (value: string) => new Date(value).toLocaleDateString('en-NG');
const formatDateTime = (value: string) => new Date(value).toLocaleString('en-NG');
const currentTime = () => new Date().toTimeString().slice(0, 5);

const statusTone = (status: AttendanceStatus) => {
  if (status === 'Absent') return 'bg-red-50 text-red-700 border-red-200';
  if (status === 'Late') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (status === 'Remote') return 'bg-blue-50 text-blue-700 border-blue-200';
  if (status === 'On Leave' || status === 'Excused') return 'bg-slate-100 text-slate-700 border-slate-200';
  return 'bg-emerald-50 text-emerald-700 border-emerald-200';
};

const modeTone = (mode: ClockingMode) => {
  if (mode === 'Exception') return 'bg-red-50 text-red-700 border-red-200';
  if (mode === 'Ready To Clock In') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (mode === 'Clocked In') return 'bg-blue-50 text-blue-700 border-blue-200';
  return 'bg-emerald-50 text-emerald-700 border-emerald-200';
};

const insightTone = (severity: StructureInsight['severity']) => {
  if (severity === 'high') return 'border-red-200 bg-red-50';
  if (severity === 'medium') return 'border-amber-200 bg-amber-50';
  return 'border-emerald-200 bg-emerald-50';
};

export default function ClockInClockOutClient() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [query, setQuery] = useState('');
  const [businessUnitFilter, setBusinessUnitFilter] = useState<'All' | string>('All');
  const [locationFilter, setLocationFilter] = useState<'All' | string>('All');
  const [siteFilter, setSiteFilter] = useState<'All' | string>('All');
  const [shiftFilter, setShiftFilter] = useState<'All' | Shift>('All');
  const [statusFilter, setStatusFilter] = useState<'All' | AttendanceStatus>('All');
  const [modeFilter, setModeFilter] = useState<'All' | ClockingMode>('All');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [clockTime, setClockTime] = useState(currentTime());
  const [clockSource, setClockSource] = useState<BiometricSource>('Biometric Device');
  const [overrideStatus, setOverrideStatus] = useState<AttendanceStatus>('Excused');
  const [note, setNote] = useState('');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/hris/attendance/clock-in-clock-out', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || json?.status !== 'success') throw new Error(json?.error || 'Unable to load clocking operations');
      const data = json.data as Payload;
      setPayload(data);
      setSelectedId((prev) => prev || data.records[0]?.id || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load clocking operations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filteredRecords = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (payload?.records || []).filter((record) => {
      if (businessUnitFilter !== 'All' && record.businessUnit !== businessUnitFilter) return false;
      if (locationFilter !== 'All' && record.location !== locationFilter) return false;
      if (siteFilter !== 'All' && record.site !== siteFilter) return false;
      if (shiftFilter !== 'All' && record.shift !== shiftFilter) return false;
      if (statusFilter !== 'All' && record.attendanceStatus !== statusFilter) return false;
      if (modeFilter !== 'All' && record.clockingMode !== modeFilter) return false;
      if (!q) return true;

      return [
        record.employeeId,
        record.employeeName,
        record.department,
        record.businessUnit,
        record.site,
        record.jobTitle,
        record.supervisor,
      ]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [payload?.records, query, businessUnitFilter, locationFilter, siteFilter, shiftFilter, statusFilter, modeFilter]);

  const selectedRecord = useMemo(
    () => filteredRecords.find((record) => record.id === selectedId) || filteredRecords[0] || null,
    [filteredRecords, selectedId],
  );

  useEffect(() => {
    if (!selectedRecord && filteredRecords.length) setSelectedId(filteredRecords[0].id);
  }, [selectedRecord, filteredRecords]);

  useEffect(() => {
    setClockTime(currentTime());
    setSubmitError(null);
    setNote('');
  }, [selectedRecord?.id]);

  const exportCsv = () => {
    if (!payload?.permissions.canExport) return;
    const rows = [
      ['Employee ID', 'Employee Name', 'Business Unit', 'Department', 'Site', 'Shift', 'Status', 'Clocking Mode', 'Clock In', 'Clock Out', 'Punch Count', 'Minutes Late', 'Source', 'Supervisor'],
      ...filteredRecords.map((record) => [
        record.employeeId,
        record.employeeName,
        record.businessUnit,
        record.department,
        record.site,
        record.shift,
        record.attendanceStatus,
        record.clockingMode,
        record.clockInTime || '',
        record.clockOutTime || '',
        String(record.punchCount),
        String(record.minutesLate),
        record.source,
        record.supervisor,
      ]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'clock-in-clock-out.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const runAction = async (action: 'CLOCK_IN' | 'CLOCK_OUT' | 'MANUAL_OVERRIDE') => {
    if (!selectedRecord) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/hris/attendance/clock-in-clock-out', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-hris-actor': payload?.permissions.actor || 'Attendance Control Desk',
          'x-hris-role': payload?.permissions.role || 'OrganizationAdmin',
        },
        body: JSON.stringify({
          employeeId: selectedRecord.employeeId,
          action,
          timestamp: action === 'MANUAL_OVERRIDE' ? undefined : clockTime,
          source: clockSource,
          note: note || undefined,
          overrideStatus: action === 'MANUAL_OVERRIDE' ? overrideStatus : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || json?.status !== 'success') throw new Error(json?.error || 'Unable to complete clocking action');
      await load();
      setSelectedId(selectedRecord.id);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Unable to complete clocking action');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageTemplate
      title="Clock In / Clock Out"
      description="Manage operational clocking, shift punch readiness, exceptions, and employee punch activity for the current attendance day."
      breadcrumbs={[
        { label: 'HRIS', href: '/hris' },
        { label: 'Attendance', href: '/hris/attendance' },
        { label: 'Clock In / Clock Out' },
      ]}
      primaryAction={{ label: 'Refresh', onClick: () => void load(), icon: RefreshCcw }}
      secondaryAction={{ label: 'Export CSV', onClick: exportCsv, icon: Download }}
    >
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 flex flex-col xl:flex-row gap-3 xl:items-center xl:justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-900">Clocking Operations Desk</div>
          <div className="text-xs text-slate-500 mt-1">
            Live biometric clocking feed from {payload?.source || 'the attendance database'}
            {payload?.attendanceDate ? ` for ${payload.attendanceDate}` : ''}.
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 font-semibold">Actor: {payload?.permissions.actor || '—'}</span>
          <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 font-semibold">Role: {payload?.permissions.role || '—'}</span>
          <span className={`px-2.5 py-1 rounded-full border font-semibold ${payload?.permissions.canEdit ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>
            {payload?.permissions.canEdit ? 'Clocking Enabled' : 'Live Read Only'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
        <MetricCard icon={Users} label="Employees" value={payload ? formatNumber(payload.summary.totalEmployees) : '—'} detail="Clocking roster in scope" />
        <MetricCard icon={Clock3} label="Punches" value={payload ? formatNumber(payload.summary.totalPunches) : '—'} detail="Raw biometric events" />
        <MetricCard icon={LogIn} label="Clocked In" value={payload ? formatNumber(payload.summary.clockedIn) : '—'} detail="Active open sessions" />
        <MetricCard icon={LogOut} label="Clocked Out" value={payload ? formatNumber(payload.summary.clockedOut) : '—'} detail="Completed shift punches" />
        <MetricCard icon={AlertTriangle} label="Exceptions" value={payload ? formatNumber(payload.summary.exceptions) : '—'} detail="Missing or overridden attendance" />
        <MetricCard icon={Fingerprint} label="Late Punches" value={payload ? formatNumber(payload.summary.latePunches) : '—'} detail="Punches after scheduled start" />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-7 gap-3">
        <label className="relative xl:col-span-2">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search employee, site, supervisor, or role..."
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-dle-blue/20"
          />
        </label>
        <Select value={businessUnitFilter} onChange={(value) => setBusinessUnitFilter(value as 'All' | string)} options={['All', ...(payload?.filterOptions.businessUnits || [])]} labels={{ All: 'All Business Units' }} />
        <Select value={locationFilter} onChange={(value) => setLocationFilter(value as 'All' | string)} options={['All', ...(payload?.filterOptions.locations || [])]} labels={{ All: 'All Locations' }} />
        <Select value={siteFilter} onChange={(value) => setSiteFilter(value as 'All' | string)} options={['All', ...(payload?.filterOptions.sites || [])]} labels={{ All: 'All Sites' }} />
        <Select value={shiftFilter} onChange={(value) => setShiftFilter(value as 'All' | Shift)} options={['All', ...(payload?.filterOptions.shifts || [])]} labels={{ All: 'All Shifts' }} />
        <Select value={statusFilter} onChange={(value) => setStatusFilter(value as 'All' | AttendanceStatus)} options={['All', ...(payload?.filterOptions.statuses || [])]} labels={{ All: 'All Statuses' }} />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 flex flex-col xl:flex-row gap-3 xl:items-center xl:justify-between">
        <div className="grid grid-cols-1 md:grid-cols-[220px] gap-3">
          <Select value={modeFilter} onChange={(value) => setModeFilter(value as 'All' | ClockingMode)} options={['All', ...(payload?.filterOptions.modes || [])]} labels={{ All: 'All Clocking Modes' }} />
        </div>
        <div className="text-xs text-slate-500">
          Avg late minutes: <span className="font-semibold text-slate-700">{payload ? formatNumber(payload.summary.averageLateMinutes) : '—'}</span>
          {' '}<span className="mx-2">•</span>
          Active sites: <span className="font-semibold text-slate-700">{payload ? formatNumber(payload.summary.activeSites) : '—'}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[0.92fr_1.08fr] gap-6">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-slate-900">Clocking Roster</div>
              <div className="text-xs text-slate-500 mt-1">Monitor punch readiness, active sessions, and attendance exceptions across the daily roster.</div>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-semibold">Showing: {formatNumber(filteredRecords.length)}</span>
          </div>
          <div className="p-4 space-y-3 min-h-[560px]">
            {loading ? (
              <div className="text-sm text-slate-600 font-medium">Loading clocking operations...</div>
            ) : error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 font-medium">{error}</div>
            ) : filteredRecords.length ? (
              filteredRecords.map((record) => {
                const active = selectedRecord?.id === record.id;
                return (
                  <button
                    key={record.id}
                    type="button"
                    onClick={() => setSelectedId(record.id)}
                    className={`w-full text-left rounded-2xl border p-4 transition-colors ${active ? 'border-dle-blue/30 bg-dle-blue/5' : 'border-slate-200 hover:bg-slate-50'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900">{record.employeeName}</div>
                        <div className="text-xs text-slate-500 mt-1">
                          {record.employeeId} <span className="mx-2">•</span> {record.site} <span className="mx-2">•</span> {record.shift}
                        </div>
                      </div>
                      <span className={`px-2 py-1 rounded-full border text-[11px] font-semibold ${modeTone(record.clockingMode)}`}>{record.clockingMode}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className={`px-2 py-1 rounded-full border text-[11px] font-semibold ${statusTone(record.attendanceStatus)}`}>{record.attendanceStatus}</span>
                      <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-semibold">{record.source}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-3 text-xs text-slate-600">
                      <span>In: {record.clockInTime || '—'}</span>
                      <span>Out: {record.clockOutTime || '—'}</span>
                      <span>Late: {formatNumber(record.minutesLate)}m</span>
                      <span>Punches: {formatNumber(record.punchCount)}</span>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="text-sm text-slate-600 font-medium">No employees match the current clocking filters.</div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <div className="text-sm font-bold text-slate-900">Clocking Detail</div>
              <div className="text-xs text-slate-500 mt-1">Inspect punch state, shift schedule, device context, and employee clocking history.</div>
            </div>
            <div className="p-5">
              {selectedRecord ? (
                <div className="space-y-5">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold ${modeTone(selectedRecord.clockingMode)}`}>{selectedRecord.clockingMode}</span>
                      <span className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold ${statusTone(selectedRecord.attendanceStatus)}`}>{selectedRecord.attendanceStatus}</span>
                      <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-semibold">{selectedRecord.shift}</span>
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 mt-3">{selectedRecord.employeeName}</h3>
                    <p className="text-sm text-slate-500 mt-1">{selectedRecord.jobTitle}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <DetailStat label="Employee ID" value={selectedRecord.employeeId} />
                    <DetailStat label="Department" value={selectedRecord.department} />
                    <DetailStat label="Business Unit" value={selectedRecord.businessUnit} />
                    <DetailStat label="Location" value={selectedRecord.location} />
                    <DetailStat label="Site" value={selectedRecord.site} />
                    <DetailStat label="Supervisor" value={selectedRecord.supervisor} />
                    <DetailStat label="Scheduled Start" value={selectedRecord.scheduledStart} />
                    <DetailStat label="Scheduled End" value={selectedRecord.scheduledEnd} />
                    <DetailStat label="Clock In" value={selectedRecord.clockInTime || '—'} />
                    <DetailStat label="Clock Out" value={selectedRecord.clockOutTime || '—'} />
                    <DetailStat label="Punch Count" value={formatNumber(selectedRecord.punchCount)} />
                    <DetailStat label="Minutes Late" value={`${selectedRecord.minutesLate}m`} />
                    <DetailStat label="Device" value={selectedRecord.deviceName} />
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-sm font-semibold text-slate-900">Exception Note</div>
                    <div className="text-sm text-slate-600 mt-2">{selectedRecord.exceptionNote || 'No active exception note recorded for this employee.'}</div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">Live Clocking Controls</div>
                      <div className="text-xs text-slate-500 mt-1">Punch creation is controlled by the biometric terminals; refresh this page after the device records a clock-in or clock-out.</div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <Field label="Clock Time" type="time" value={clockTime} onChange={setClockTime} />
                      <SelectField label="Source" value={clockSource} onChange={(value) => setClockSource(value as BiometricSource)} options={['Biometric Device', 'Mobile Check-In', 'Supervisor Override']} />
                      <SelectField label="Override Status" value={overrideStatus} onChange={(value) => setOverrideStatus(value as AttendanceStatus)} options={['Present', 'Late', 'Absent', 'On Leave', 'Remote', 'Excused']} />
                    </div>

                    <TextAreaField label="Review Note" value={note} onChange={setNote} placeholder="Capture an internal review note before resolving this line in Attendance Register." />

                    {submitError ? <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">{submitError}</div> : null}

                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        disabled
                        onClick={() => void runAction('CLOCK_IN')}
                        className="px-3 py-2 rounded-lg bg-dle-blue text-white text-xs font-semibold hover:bg-dle-blue-deep disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        Device Clock In
                      </button>
                      <button
                        type="button"
                        disabled
                        onClick={() => void runAction('CLOCK_OUT')}
                        className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        Device Clock Out
                      </button>
                      <button
                        type="button"
                        disabled
                        onClick={() => void runAction('MANUAL_OVERRIDE')}
                        className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        Resolve In Register
                      </button>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-100">
                      <div className="text-sm font-semibold text-slate-900">Recent Clocking Events</div>
                      <div className="text-xs text-slate-500 mt-1">Most recent punch and override actions captured for this employee.</div>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {selectedRecord.events.length ? (
                        selectedRecord.events.map((event) => (
                          <div key={event.id} className="px-4 py-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-sm font-semibold text-slate-900">{event.action}</div>
                              <div className="text-xs text-slate-500">{formatDateTime(event.timestamp)}</div>
                            </div>
                            <div className="text-xs text-slate-500 mt-1">
                              {event.terminalName || event.actor} <span className="mx-2">•</span> {event.source}
                            </div>
                            <div className="text-sm text-slate-600 mt-2">{event.note || 'No note provided for this action.'}</div>
                          </div>
                        ))
                      ) : (
                        <div className="px-4 py-4 text-sm text-slate-600">No clocking events have been recorded for this employee yet.</div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-slate-600">Select an employee to inspect and manage clocking activity.</div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <div className="text-sm font-bold text-slate-900">Clocking Insights</div>
              <div className="text-xs text-slate-500 mt-1">Priority observations on punch exceptions, lateness pressure, and open shift sessions.</div>
            </div>
            <div className="p-4 space-y-3">
              {(payload?.insights || []).map((insight) => (
                <div key={insight.id} className={`rounded-2xl border p-4 ${insightTone(insight.severity)}`}>
                  <div className="text-sm font-semibold text-slate-900">{insight.title}</div>
                  <div className="text-xs text-slate-600 mt-1">{insight.recommendation}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <div className="text-sm font-bold text-slate-900">Clocking Register</div>
          <div className="text-xs text-slate-500 mt-1">Searchable roster of employee punch state, shift timing, lateness, and device source.</div>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50">
              <tr>
                {['Employee', 'Site', 'Shift', 'Attendance Status', 'Clocking Mode', 'Clock In', 'Clock Out', 'Punches', 'Late (min)', 'Device', 'Supervisor'].map((header) => (
                  <th key={header} className="px-4 py-3 text-[11px] font-semibold text-slate-600 uppercase tracking-wide whitespace-nowrap">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map((record) => (
                <tr key={record.id} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => setSelectedId(record.id)}>
                  <td className="px-4 py-3">
                    <div className="text-sm font-semibold text-slate-900">{record.employeeName}</div>
                    <div className="text-xs text-slate-500">{record.employeeId}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    <div>{record.site}</div>
                    <div className="text-xs text-slate-500">{record.location}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">{record.shift}</td>
                  <td className="px-4 py-3"><span className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold ${statusTone(record.attendanceStatus)}`}>{record.attendanceStatus}</span></td>
                  <td className="px-4 py-3"><span className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold ${modeTone(record.clockingMode)}`}>{record.clockingMode}</span></td>
                  <td className="px-4 py-3 text-sm text-slate-700">{record.clockInTime || '—'}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{record.clockOutTime || '—'}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{formatNumber(record.punchCount)}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{formatNumber(record.minutesLate)}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{record.deviceName}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{record.supervisor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </PageTemplate>
  );
}

function MetricCard({ icon: Icon, label, value, detail }: { icon: any; label: string; value: string; detail: string }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500 font-semibold">{label}</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{value}</div>
          <div className="text-xs text-slate-500 mt-2">{detail}</div>
        </div>
        <span className="w-10 h-10 rounded-2xl bg-dle-blue/10 text-dle-blue flex items-center justify-center">
          <Icon className="w-5 h-5" />
        </span>
      </div>
    </div>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">{label}</div>
      <div className="text-sm font-semibold text-slate-900 mt-1">{value}</div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1.5">{label}</div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full py-2.5 px-3 rounded-xl border border-slate-200 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-dle-blue/20"
      />
    </label>
  );
}

function TextAreaField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1.5">{label}</div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        placeholder={placeholder}
        className="w-full py-2.5 px-3 rounded-xl border border-slate-200 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-dle-blue/20 resize-y"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <label className="block">
      <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1.5">{label}</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full py-2.5 px-3 rounded-xl border border-slate-200 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-dle-blue/20"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function Select({ value, onChange, options, labels }: { value: string; onChange: (value: string) => void; options: string[]; labels?: Record<string, string> }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full py-2.5 px-3 rounded-xl border border-slate-200 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-dle-blue/20"
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {labels?.[option] || option}
        </option>
      ))}
    </select>
  );
}
