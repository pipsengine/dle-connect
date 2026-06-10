'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState } from 'react';
import { PageTemplate } from '@/components/layout/page-template';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Download,
  Fingerprint,
  MapPin,
  RefreshCcw,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react';
import type { StructureInsight } from '@/lib/organization-data';

type AttendanceStatus = 'Present' | 'Late' | 'Absent' | 'On Leave' | 'Remote' | 'Excused';
type Shift = 'Day' | 'Night' | 'Rotational';
type Health = 'Healthy' | 'Needs Attention' | 'Critical';

type AttendanceRecord = {
  id: string;
  employeeId: string;
  employeeName: string;
  businessUnit: string;
  department: string;
  jobTitle: string;
  location: string;
  site: string;
  shift: Shift;
  status: AttendanceStatus;
  checkInTime: string | null;
  checkOutTime: string | null;
  scheduledStart: string;
  scheduledEnd: string;
  minutesLate: number;
  overtimeHours: number;
  biometricSource: 'Biometric Device' | 'Mobile Check-In' | 'Supervisor Override';
  supervisor: string;
};

type AttendanceSegment = {
  id: string;
  label: string;
  location: string;
  site: string;
  headcount: number;
  present: number;
  late: number;
  absent: number;
  remote: number;
  onLeave: number;
  attendanceRatePct: number;
  punctualityPct: number;
  overtimeHours: number;
  shiftCoverage: Array<{ shift: Shift; planned: number; present: number }>;
  health: Health;
  lead: string;
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
    present: number;
    late: number;
    absent: number;
    remote: number;
    onLeave: number;
    attendanceRatePct: number;
    punctualityPct: number;
    overtimeHours: number;
    flaggedSites: number;
  };
  filterOptions: {
    businessUnits: string[];
    locations: string[];
    sites: string[];
    shifts: Shift[];
    statuses: AttendanceStatus[];
  };
  segments: AttendanceSegment[];
  records: AttendanceRecord[];
  insights: StructureInsight[];
};

const formatNumber = (value: number) => new Intl.NumberFormat('en-NG').format(value);
const formatDate = (value: string) => new Date(value).toLocaleDateString('en-NG');

const healthTone = (status: Health) => {
  if (status === 'Critical') return 'bg-red-50 text-red-700 border-red-200';
  if (status === 'Needs Attention') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-emerald-50 text-emerald-700 border-emerald-200';
};

const statusTone = (status: AttendanceStatus) => {
  if (status === 'Absent') return 'bg-red-50 text-red-700 border-red-200';
  if (status === 'Late') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (status === 'On Leave' || status === 'Excused') return 'bg-slate-100 text-slate-700 border-slate-200';
  if (status === 'Remote') return 'bg-blue-50 text-blue-700 border-blue-200';
  return 'bg-emerald-50 text-emerald-700 border-emerald-200';
};

const insightTone = (severity: StructureInsight['severity']) => {
  if (severity === 'high') return 'border-red-200 bg-red-50';
  if (severity === 'medium') return 'border-amber-200 bg-amber-50';
  return 'border-emerald-200 bg-emerald-50';
};

export default function DailyAttendanceClient() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [businessUnitFilter, setBusinessUnitFilter] = useState<'All' | string>('All');
  const [locationFilter, setLocationFilter] = useState<'All' | string>('All');
  const [siteFilter, setSiteFilter] = useState<'All' | string>('All');
  const [shiftFilter, setShiftFilter] = useState<'All' | Shift>('All');
  const [statusFilter, setStatusFilter] = useState<'All' | AttendanceStatus>('All');
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/hris/attendance/daily-attendance', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || json?.status !== 'success') throw new Error(json?.error || 'Unable to load daily attendance');
      const data = json.data as Payload;
      setPayload(data);
      setSelectedSegmentId((prev) => prev || data.segments[0]?.id || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load daily attendance');
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
      if (statusFilter !== 'All' && record.status !== statusFilter) return false;
      if (!q) return true;

      return [
        record.employeeId,
        record.employeeName,
        record.department,
        record.businessUnit,
        record.site,
        record.supervisor,
        record.jobTitle,
      ]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [payload?.records, query, businessUnitFilter, locationFilter, siteFilter, shiftFilter, statusFilter]);

  const filteredSegments = useMemo(() => {
    const segmentIds = new Set(filteredRecords.map((record) => `${record.location}||${record.site}`));
    return (payload?.segments || []).filter((segment) => segmentIds.has(`${segment.location}||${segment.site}`));
  }, [payload?.segments, filteredRecords]);

  const selectedSegment = useMemo(
    () => filteredSegments.find((segment) => segment.id === selectedSegmentId) || filteredSegments[0] || null,
    [filteredSegments, selectedSegmentId],
  );

  const segmentRecords = useMemo(
    () =>
      selectedSegment
        ? filteredRecords.filter((record) => record.location === selectedSegment.location && record.site === selectedSegment.site)
        : filteredRecords,
    [filteredRecords, selectedSegment],
  );

  const exportCsv = () => {
    if (!payload?.permissions.canExport) return;
    const rows = [
      ['Employee ID', 'Employee Name', 'Business Unit', 'Department', 'Job Title', 'Location', 'Site', 'Shift', 'Status', 'Check In', 'Check Out', 'Minutes Late', 'Overtime Hours', 'Source', 'Supervisor'],
      ...segmentRecords.map((record) => [
        record.employeeId,
        record.employeeName,
        record.businessUnit,
        record.department,
        record.jobTitle,
        record.location,
        record.site,
        record.shift,
        record.status,
        record.checkInTime || '',
        record.checkOutTime || '',
        String(record.minutesLate),
        String(record.overtimeHours),
        record.biometricSource,
        record.supervisor,
      ]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'daily-attendance.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <PageTemplate
      title="Daily Attendance"
      description="Monitor daily attendance by site, shift, and employee turn-up with operational visibility into attendance rate, punctuality, lateness, absence, and roster coverage."
      breadcrumbs={[
        { label: 'HRIS', href: '/hris' },
        { label: 'Attendance', href: '/hris/attendance' },
        { label: 'Daily Attendance' },
      ]}
      primaryAction={{ label: 'Refresh', onClick: () => void load(), icon: RefreshCcw }}
      secondaryAction={{ label: 'Export CSV', onClick: exportCsv, icon: Download }}
    >
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 flex flex-col xl:flex-row gap-3 xl:items-center xl:justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-900">Attendance Control Room</div>
          <div className="text-xs text-slate-500 mt-1">
            Live biometric attendance from {payload?.source || 'the attendance database'}
            {payload?.attendanceDate ? ` for ${payload.attendanceDate}` : ''}.
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 font-semibold">Actor: {payload?.permissions.actor || '—'}</span>
          <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 font-semibold">Role: {payload?.permissions.role || '—'}</span>
          <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 font-semibold">Generated: {payload ? formatDate(payload.generatedAt) : '—'}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
        <MetricCard icon={Users} label="Employees" value={payload ? formatNumber(payload.summary.totalEmployees) : '—'} detail="Attendance records in scope" />
        <MetricCard icon={CheckCircle2} label="Present" value={payload ? formatNumber(payload.summary.present) : '—'} detail="Reported on site or active duty" />
        <MetricCard icon={Clock3} label="Late" value={payload ? formatNumber(payload.summary.late) : '—'} detail="Reported after scheduled start" />
        <MetricCard icon={AlertTriangle} label="Absent" value={payload ? formatNumber(payload.summary.absent) : '—'} detail="No valid attendance record" />
        <MetricCard icon={ShieldCheck} label="Attendance Rate" value={payload ? `${payload.summary.attendanceRatePct}%` : '—'} detail="Daily effective attendance rate" />
        <MetricCard icon={Fingerprint} label="Flagged Sites" value={payload ? formatNumber(payload.summary.flaggedSites) : '—'} detail="Sites needing attendance action" />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
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
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 flex flex-col xl:flex-row gap-3 xl:items-center xl:justify-between">
        <div className="grid grid-cols-1 md:grid-cols-[220px] gap-3">
          <Select value={statusFilter} onChange={(value) => setStatusFilter(value as 'All' | AttendanceStatus)} options={['All', ...(payload?.filterOptions.statuses || [])]} labels={{ All: 'All Statuses' }} />
        </div>
        <div className="text-xs text-slate-500">
          Punctuality: <span className="font-semibold text-slate-700">{payload ? `${payload.summary.punctualityPct}%` : '—'}</span>
          {' '}<span className="mx-2">•</span>
          Overtime: <span className="font-semibold text-slate-700">{payload ? `${payload.summary.overtimeHours}h` : '—'}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[0.92fr_1.08fr] gap-6">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-slate-900">Site Attendance Explorer</div>
              <div className="text-xs text-slate-500 mt-1">Review location and site attendance health, shift coverage, and daily presence quality.</div>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-semibold">Showing: {formatNumber(filteredSegments.length)}</span>
          </div>
          <div className="p-4 space-y-3 min-h-[540px]">
            {loading ? (
              <div className="text-sm text-slate-600 font-medium">Loading daily attendance...</div>
            ) : error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 font-medium">{error}</div>
            ) : filteredSegments.length ? (
              filteredSegments.map((segment) => {
                const active = selectedSegment?.id === segment.id;
                return (
                  <button
                    key={segment.id}
                    type="button"
                    onClick={() => setSelectedSegmentId(segment.id)}
                    className={`w-full text-left rounded-2xl border p-4 transition-colors ${active ? 'border-dle-blue/30 bg-dle-blue/5' : 'border-slate-200 hover:bg-slate-50'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{segment.site}</div>
                        <div className="text-xs text-slate-500 mt-1">{segment.location}</div>
                      </div>
                      <span className={`px-2 py-1 rounded-full border text-[11px] font-semibold ${healthTone(segment.health)}`}>{segment.health}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-3 text-xs text-slate-600">
                      <span>Attendance: {segment.attendanceRatePct}%</span>
                      <span>Punctuality: {segment.punctualityPct}%</span>
                      <span>Absent: {formatNumber(segment.absent)}</span>
                      <span>Overtime: {segment.overtimeHours}h</span>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="text-sm text-slate-600 font-medium">No attendance segments match the current filters.</div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <div className="text-sm font-bold text-slate-900">Segment Detail</div>
              <div className="text-xs text-slate-500 mt-1">Inspect site-level attendance, shift coverage, supervisor ownership, and daily roster health.</div>
            </div>
            <div className="p-5">
              {selectedSegment ? (
                <div className="space-y-5">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold ${healthTone(selectedSegment.health)}`}>{selectedSegment.health}</span>
                      <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-semibold">{selectedSegment.location}</span>
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 mt-3">{selectedSegment.site}</h3>
                    <p className="text-sm text-slate-500 mt-1">Attendance lead: {selectedSegment.lead}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <DetailStat label="Headcount" value={formatNumber(selectedSegment.headcount)} />
                    <DetailStat label="Present" value={formatNumber(selectedSegment.present)} />
                    <DetailStat label="Late" value={formatNumber(selectedSegment.late)} />
                    <DetailStat label="Absent" value={formatNumber(selectedSegment.absent)} />
                    <DetailStat label="Remote" value={formatNumber(selectedSegment.remote)} />
                    <DetailStat label="On Leave" value={formatNumber(selectedSegment.onLeave)} />
                    <DetailStat label="Attendance Rate" value={`${selectedSegment.attendanceRatePct}%`} />
                    <DetailStat label="Punctuality" value={`${selectedSegment.punctualityPct}%`} />
                    <DetailStat label="Overtime Hours" value={`${selectedSegment.overtimeHours}h`} />
                    <DetailStat label="Supervisor" value={selectedSegment.lead} />
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-100">
                      <div className="text-sm font-semibold text-slate-900">Shift Coverage</div>
                      <div className="text-xs text-slate-500 mt-1">Planned versus effectively present attendance by shift.</div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4">
                      {selectedSegment.shiftCoverage.map((item) => (
                        <div key={item.shift} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <div className="text-sm font-semibold text-slate-900">{item.shift}</div>
                          <div className="text-xs text-slate-500 mt-1">Planned: {formatNumber(item.planned)}</div>
                          <div className="text-xs text-slate-500 mt-1">Present: {formatNumber(item.present)}</div>
                          <div className="mt-3 h-2 rounded-full bg-slate-200 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-dle-blue"
                              style={{ width: `${item.planned ? Math.min(100, (item.present / item.planned) * 100) : 0}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-100">
                      <div className="text-sm font-semibold text-slate-900">Daily Attendance Register</div>
                      <div className="text-xs text-slate-500 mt-1">Employee-level turn-up, lateness, biometric source, and daily attendance status.</div>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {segmentRecords.map((record) => (
                        <div key={record.id} className="px-4 py-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div>
                            <div className="text-sm font-semibold text-slate-900">{record.employeeName}</div>
                            <div className="text-xs text-slate-500 mt-1">
                              {record.employeeId} <span className="mx-2">•</span> {record.jobTitle} <span className="mx-2">•</span> {record.department}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className={`px-2 py-1 rounded-full border font-semibold ${statusTone(record.status)}`}>{record.status}</span>
                            <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-700 font-semibold">{record.shift}</span>
                            <span className="text-slate-600">In: {record.checkInTime || '—'}</span>
                            <span className="text-slate-600">Out: {record.checkOutTime || '—'}</span>
                            <span className="text-slate-600">Late: {record.minutesLate}m</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-slate-600">Select a site segment to inspect daily attendance detail.</div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <div className="text-sm font-bold text-slate-900">Attendance Insights</div>
              <div className="text-xs text-slate-500 mt-1">Priority daily observations on site attendance, absence pressure, and punctuality risk.</div>
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
          <div className="text-sm font-bold text-slate-900">Daily Attendance Register</div>
          <div className="text-xs text-slate-500 mt-1">Searchable table of employees, shifts, site attendance results, lateness, and biometric source.</div>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50">
              <tr>
                {['Employee', 'Business Unit', 'Site', 'Shift', 'Status', 'Check In', 'Check Out', 'Late (min)', 'Overtime', 'Source'].map((header) => (
                  <th key={header} className="px-4 py-3 text-[11px] font-semibold text-slate-600 uppercase tracking-wide whitespace-nowrap">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map((record) => (
                <tr key={record.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="text-sm font-semibold text-slate-900">{record.employeeName}</div>
                    <div className="text-xs text-slate-500">{record.employeeId}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">{record.businessUnit}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    <div>{record.site}</div>
                    <div className="text-xs text-slate-500">{record.location}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">{record.shift}</td>
                  <td className="px-4 py-3"><span className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold ${statusTone(record.status)}`}>{record.status}</span></td>
                  <td className="px-4 py-3 text-sm text-slate-700">{record.checkInTime || '—'}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{record.checkOutTime || '—'}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{formatNumber(record.minutesLate)}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{record.overtimeHours}h</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{record.biometricSource}</td>
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
