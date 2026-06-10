'use client';

import { useEffect, useMemo, useState } from 'react';
import { PageTemplate } from '@/components/layout/page-template';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Fingerprint,
  RefreshCcw,
  Search,
  ShieldCheck,
  TimerReset,
  Users,
} from 'lucide-react';
import type { StructureInsight } from '@/lib/organization-data';

type RegisterReviewStatus = 'Pending Review' | 'Verified' | 'Flagged' | 'Locked';

type AttendanceRegisterRow = {
  id: string;
  employeeId: string;
  employeeName: string;
  businessUnit: string;
  department: string;
  jobTitle: string;
  location: string;
  site: string;
  shift: string;
  attendanceStatus: string;
  clockingMode: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  scheduledStart: string;
  scheduledEnd: string;
  minutesLate: number;
  overtimeHours: number;
  source: string;
  supervisor: string;
  reviewStatus: RegisterReviewStatus;
  verifiedBy: string;
  payrollReady: boolean;
  note: string | null;
  reviewedAt: string;
};

type AuditEvent = {
  id: string;
  action: string;
  actor: string;
  summary: string;
  createdAt: string;
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
    totalRecords: number;
    verified: number;
    pendingReview: number;
    flagged: number;
    payrollReady: number;
    locked: number;
    exceptions: number;
    lateCases: number;
  };
  filterOptions: {
    businessUnits: string[];
    locations: string[];
    sites: string[];
    shifts: string[];
    statuses: string[];
    reviewStatuses: RegisterReviewStatus[];
  };
  rows: AttendanceRegisterRow[];
  insights: StructureInsight[];
};

const formatNumber = (value: number) => new Intl.NumberFormat('en-NG').format(value);
const formatDate = (value: string) => new Date(value).toLocaleDateString('en-NG');

const reviewTone = (status: RegisterReviewStatus) => {
  if (status === 'Flagged') return 'bg-red-50 text-red-700 border-red-200';
  if (status === 'Pending Review') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (status === 'Locked') return 'bg-slate-100 text-slate-700 border-slate-200';
  return 'bg-emerald-50 text-emerald-700 border-emerald-200';
};

const insightTone = (severity: StructureInsight['severity']) => {
  if (severity === 'high') return 'border-red-200 bg-red-50';
  if (severity === 'medium') return 'border-amber-200 bg-amber-50';
  return 'border-emerald-200 bg-emerald-50';
};

export default function AttendanceRegisterClient() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [query, setQuery] = useState('');
  const [businessUnitFilter, setBusinessUnitFilter] = useState<'All' | string>('All');
  const [locationFilter, setLocationFilter] = useState<'All' | string>('All');
  const [siteFilter, setSiteFilter] = useState<'All' | string>('All');
  const [shiftFilter, setShiftFilter] = useState<'All' | string>('All');
  const [statusFilter, setStatusFilter] = useState<'All' | string>('All');
  const [reviewFilter, setReviewFilter] = useState<'All' | RegisterReviewStatus>('All');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reviewStatus, setReviewStatus] = useState<RegisterReviewStatus>('Pending Review');
  const [verifiedBy, setVerifiedBy] = useState('');
  const [payrollReady, setPayrollReady] = useState(false);
  const [note, setNote] = useState('');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/hris/attendance/attendance-register', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || json?.status !== 'success') throw new Error(json?.error || 'Unable to load attendance register');
      const data = json.data as Payload;
      setPayload(data);
      setSelectedId((prev) => prev || data.rows[0]?.id || null);

      if (data.permissions.canViewAudit) {
        const auditRes = await fetch('/api/hris/organization/audit-log?module=attendance&limit=10', {
          cache: 'no-store',
          headers: {
            'x-hris-actor': data.permissions.actor,
            'x-hris-role': data.permissions.role,
          },
        });
        const auditJson = await auditRes.json();
        if (auditRes.ok && auditJson?.status === 'success') {
          setAuditEvents((auditJson.data?.events || []) as AuditEvent[]);
        } else {
          setAuditEvents([]);
        }
      } else {
        setAuditEvents([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load attendance register');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const visibleRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (payload?.rows || []).filter((row) => {
      if (businessUnitFilter !== 'All' && row.businessUnit !== businessUnitFilter) return false;
      if (locationFilter !== 'All' && row.location !== locationFilter) return false;
      if (siteFilter !== 'All' && row.site !== siteFilter) return false;
      if (shiftFilter !== 'All' && row.shift !== shiftFilter) return false;
      if (statusFilter !== 'All' && row.attendanceStatus !== statusFilter) return false;
      if (reviewFilter !== 'All' && row.reviewStatus !== reviewFilter) return false;
      if (!q) return true;
      return [
        row.employeeId,
        row.employeeName,
        row.department,
        row.businessUnit,
        row.site,
        row.supervisor,
        row.jobTitle,
      ]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [payload?.rows, query, businessUnitFilter, locationFilter, siteFilter, shiftFilter, statusFilter, reviewFilter]);

  const selectedRow = useMemo(
    () => visibleRows.find((row) => row.id === selectedId) || visibleRows[0] || null,
    [visibleRows, selectedId],
  );

  useEffect(() => {
    if (!selectedRow && visibleRows.length) setSelectedId(visibleRows[0].id);
  }, [selectedRow, visibleRows]);

  useEffect(() => {
    if (!selectedRow) return;
    setReviewStatus(selectedRow.reviewStatus);
    setVerifiedBy(selectedRow.verifiedBy);
    setPayrollReady(selectedRow.payrollReady);
    setNote(selectedRow.note || '');
    setSubmitError(null);
  }, [selectedRow?.id]);

  const exportCsv = () => {
    if (!payload?.permissions.canExport) return;
    const rows = [
      ['Employee ID', 'Employee Name', 'Business Unit', 'Department', 'Site', 'Shift', 'Attendance Status', 'Clocking Mode', 'Review Status', 'Payroll Ready', 'Check In', 'Check Out', 'Minutes Late', 'Verified By'],
      ...visibleRows.map((row) => [
        row.employeeId,
        row.employeeName,
        row.businessUnit,
        row.department,
        row.site,
        row.shift,
        row.attendanceStatus,
        row.clockingMode,
        row.reviewStatus,
        row.payrollReady ? 'Yes' : 'No',
        row.checkInTime || '',
        row.checkOutTime || '',
        String(row.minutesLate),
        row.verifiedBy,
      ]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'attendance-register.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const saveRegister = async () => {
    if (!selectedRow) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/hris/attendance/attendance-register', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-hris-actor': payload?.permissions.actor || 'Attendance Control Desk',
          'x-hris-role': payload?.permissions.role || 'OrganizationAdmin',
        },
        body: JSON.stringify({
          employeeId: selectedRow.employeeId,
          reviewStatus,
          verifiedBy,
          payrollReady,
          note: note || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || json?.status !== 'success') throw new Error(json?.error || 'Unable to update attendance register');
      await load();
      setSelectedId(selectedRow.id);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Unable to update attendance register');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageTemplate
      title="Attendance Register"
      description="Manage the employee-level attendance register, review status, payroll readiness, and register exceptions for the attendance day."
      breadcrumbs={[
        { label: 'HRIS', href: '/hris' },
        { label: 'Attendance', href: '/hris/attendance' },
        { label: 'Attendance Register' },
      ]}
      primaryAction={{ label: 'Refresh', onClick: () => void load(), icon: RefreshCcw }}
      secondaryAction={{ label: 'Export CSV', onClick: exportCsv, icon: Download }}
    >
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 flex flex-col xl:flex-row gap-3 xl:items-center xl:justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-900">Attendance Register Desk</div>
          <div className="text-xs text-slate-500 mt-1">
            Formal employee register from {payload?.source || 'the attendance database'}
            {payload?.attendanceDate ? ` for ${payload.attendanceDate}` : ''}.
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 font-semibold">Actor: {payload?.permissions.actor || '—'}</span>
          <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 font-semibold">Role: {payload?.permissions.role || '—'}</span>
          <span className={`px-2.5 py-1 rounded-full border font-semibold ${payload?.permissions.canEdit ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>
            {payload?.permissions.canEdit ? 'Register Updates Enabled' : 'Read Only'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
        <MetricCard icon={Users} label="Records" value={payload ? formatNumber(payload.summary.totalRecords) : '—'} detail="Attendance lines in the register" />
        <MetricCard icon={CheckCircle2} label="Verified" value={payload ? formatNumber(payload.summary.verified) : '—'} detail="Validated attendance lines" />
        <MetricCard icon={TimerReset} label="Pending" value={payload ? formatNumber(payload.summary.pendingReview) : '—'} detail="Lines awaiting review" />
        <MetricCard icon={AlertTriangle} label="Flagged" value={payload ? formatNumber(payload.summary.flagged) : '—'} detail="Exceptions needing action" />
        <MetricCard icon={ShieldCheck} label="Payroll Ready" value={payload ? formatNumber(payload.summary.payrollReady) : '—'} detail="Lines ready for payroll" />
        <MetricCard icon={Fingerprint} label="Exceptions" value={payload ? formatNumber(payload.summary.exceptions) : '—'} detail="Clocking exceptions in register" />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-7 gap-3">
        <label className="relative xl:col-span-2">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search employee, site, role, or supervisor..."
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-dle-blue/20"
          />
        </label>
        <Select value={businessUnitFilter} onChange={(value) => setBusinessUnitFilter(value as 'All' | string)} options={['All', ...(payload?.filterOptions.businessUnits || [])]} labels={{ All: 'All Business Units' }} />
        <Select value={locationFilter} onChange={(value) => setLocationFilter(value as 'All' | string)} options={['All', ...(payload?.filterOptions.locations || [])]} labels={{ All: 'All Locations' }} />
        <Select value={siteFilter} onChange={(value) => setSiteFilter(value as 'All' | string)} options={['All', ...(payload?.filterOptions.sites || [])]} labels={{ All: 'All Sites' }} />
        <Select value={shiftFilter} onChange={(value) => setShiftFilter(value as 'All' | string)} options={['All', ...(payload?.filterOptions.shifts || [])]} labels={{ All: 'All Shifts' }} />
        <Select value={statusFilter} onChange={(value) => setStatusFilter(value as 'All' | string)} options={['All', ...(payload?.filterOptions.statuses || [])]} labels={{ All: 'All Attendance Status' }} />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 flex flex-col xl:flex-row gap-3 xl:items-center xl:justify-between">
        <div className="grid grid-cols-1 md:grid-cols-[220px] gap-3">
          <Select value={reviewFilter} onChange={(value) => setReviewFilter(value as 'All' | RegisterReviewStatus)} options={['All', ...(payload?.filterOptions.reviewStatuses || [])]} labels={{ All: 'All Review Status' }} />
        </div>
        <div className="text-xs text-slate-500">
          Locked: <span className="font-semibold text-slate-700">{payload ? formatNumber(payload.summary.locked) : '—'}</span>
          {' '}<span className="mx-2">•</span>
          Late cases: <span className="font-semibold text-slate-700">{payload ? formatNumber(payload.summary.lateCases) : '—'}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[0.92fr_1.08fr] gap-6">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-slate-900">Register Explorer</div>
              <div className="text-xs text-slate-500 mt-1">Review employee-level register lines, statuses, and payroll readiness posture.</div>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-semibold">Showing: {formatNumber(visibleRows.length)}</span>
          </div>
          <div className="p-4 space-y-3 min-h-[560px]">
            {loading ? (
              <div className="text-sm text-slate-600 font-medium">Loading attendance register...</div>
            ) : error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 font-medium">{error}</div>
            ) : visibleRows.length ? (
              visibleRows.map((row) => {
                const active = selectedRow?.id === row.id;
                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => setSelectedId(row.id)}
                    className={`w-full text-left rounded-2xl border p-4 transition-colors ${active ? 'border-dle-blue/30 bg-dle-blue/5' : 'border-slate-200 hover:bg-slate-50'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{row.employeeName}</div>
                        <div className="text-xs text-slate-500 mt-1">
                          {row.employeeId} <span className="mx-2">•</span> {row.site} <span className="mx-2">•</span> {row.shift}
                        </div>
                      </div>
                      <span className={`px-2 py-1 rounded-full border text-[11px] font-semibold ${reviewTone(row.reviewStatus)}`}>{row.reviewStatus}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-semibold">{row.attendanceStatus}</span>
                      <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-semibold">{row.clockingMode}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-3 text-xs text-slate-600">
                      <span>In: {row.checkInTime || '—'}</span>
                      <span>Out: {row.checkOutTime || '—'}</span>
                      <span>Late: {formatNumber(row.minutesLate)}m</span>
                      <span>Payroll: {row.payrollReady ? 'Ready' : 'Hold'}</span>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="text-sm text-slate-600 font-medium">No attendance register lines match the current filters.</div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <div className="text-sm font-bold text-slate-900">Register Detail</div>
              <div className="text-xs text-slate-500 mt-1">Inspect attendance evidence, register posture, and payroll readiness for the selected employee line.</div>
            </div>
            <div className="p-5">
              {selectedRow ? (
                <div className="space-y-5">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold ${reviewTone(selectedRow.reviewStatus)}`}>{selectedRow.reviewStatus}</span>
                      <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-semibold">{selectedRow.attendanceStatus}</span>
                      <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-semibold">{selectedRow.clockingMode}</span>
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 mt-3">{selectedRow.employeeName}</h3>
                    <p className="text-sm text-slate-500 mt-1">{selectedRow.jobTitle}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <DetailStat label="Employee ID" value={selectedRow.employeeId} />
                    <DetailStat label="Business Unit" value={selectedRow.businessUnit} />
                    <DetailStat label="Department" value={selectedRow.department} />
                    <DetailStat label="Site" value={`${selectedRow.site}, ${selectedRow.location}`} />
                    <DetailStat label="Shift" value={selectedRow.shift} />
                    <DetailStat label="Supervisor" value={selectedRow.supervisor} />
                    <DetailStat label="Check In" value={selectedRow.checkInTime || '—'} />
                    <DetailStat label="Check Out" value={selectedRow.checkOutTime || '—'} />
                    <DetailStat label="Scheduled Start" value={selectedRow.scheduledStart} />
                    <DetailStat label="Scheduled End" value={selectedRow.scheduledEnd} />
                    <DetailStat label="Minutes Late" value={`${selectedRow.minutesLate}m`} />
                    <DetailStat label="Overtime Hours" value={`${selectedRow.overtimeHours}h`} />
                    <DetailStat label="Source" value={selectedRow.source} />
                    <DetailStat label="Verified By" value={selectedRow.verifiedBy} />
                    <DetailStat label="Payroll Ready" value={selectedRow.payrollReady ? 'Yes' : 'No'} />
                    <DetailStat label="Reviewed At" value={formatDate(selectedRow.reviewedAt)} />
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-sm font-semibold text-slate-900">Register Note</div>
                    <div className="text-sm text-slate-600 mt-2">{selectedRow.note || 'No register note recorded for this attendance line.'}</div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">Register Controls</div>
                      <div className="text-xs text-slate-500 mt-1">Update review status, verifier, payroll readiness, and exception note for the selected line.</div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <SelectField label="Review Status" value={reviewStatus} onChange={(value) => setReviewStatus(value as RegisterReviewStatus)} options={['Pending Review', 'Verified', 'Flagged', 'Locked']} />
                      <Field label="Verified By" value={verifiedBy} onChange={setVerifiedBy} />
                    </div>

                    <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <input type="checkbox" checked={payrollReady} onChange={(e) => setPayrollReady(e.target.checked)} className="rounded border-slate-300" />
                      <span className="text-sm text-slate-700 font-medium">Mark this attendance line as payroll ready</span>
                    </label>

                    <TextAreaField label="Note" value={note} onChange={setNote} placeholder="Capture the reason for flagging, verification, or payroll hold." />

                    {submitError ? <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">{submitError}</div> : null}

                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        disabled={submitting || !payload?.permissions.canEdit}
                        onClick={() => void saveRegister()}
                        className="px-4 py-2 bg-dle-blue text-white rounded-lg text-sm font-medium hover:bg-dle-blue-deep transition-colors shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {submitting ? 'Saving...' : payload?.permissions.canEdit ? 'Save Register Status' : 'Read Only Access'}
                      </button>
                      <span className="text-xs text-slate-500">Updates are permissioned and written into the attendance audit log.</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-slate-600">Select a register line to inspect attendance and review detail.</div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <div className="text-sm font-bold text-slate-900">Register Insights</div>
              <div className="text-xs text-slate-500 mt-1">Priority observations on flagged lines, pending reviews, and lateness pressure.</div>
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

          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <div className="text-sm font-bold text-slate-900">Recent Audit Activity</div>
              <div className="text-xs text-slate-500 mt-1">Recent attendance audit events for register updates and attendance governance.</div>
            </div>
            <div className="p-4 space-y-3">
              {payload?.permissions.canViewAudit ? (
                auditEvents.length ? (
                  auditEvents.map((event) => (
                    <div key={event.id} className="rounded-2xl border border-slate-200 p-4 bg-slate-50">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-slate-900">{event.action}</div>
                        <div className="text-[11px] text-slate-500 font-semibold">{formatDate(event.createdAt)}</div>
                      </div>
                      <div className="text-xs text-slate-500 mt-1">{event.actor}</div>
                      <div className="text-sm text-slate-700 mt-2">{event.summary}</div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-slate-600">No attendance audit events are available yet.</div>
                )
              ) : (
                <div className="text-sm text-slate-600">Your current role cannot view the attendance audit log.</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <div className="text-sm font-bold text-slate-900">Attendance Register</div>
          <div className="text-xs text-slate-500 mt-1">Searchable employee-level attendance register with review status and payroll readiness.</div>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50">
              <tr>
                {['Employee', 'Business Unit', 'Site', 'Attendance', 'Clocking', 'Review', 'Payroll', 'Check In', 'Late (min)', 'Verifier'].map((header) => (
                  <th key={header} className="px-4 py-3 text-[11px] font-semibold text-slate-600 uppercase tracking-wide whitespace-nowrap">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => setSelectedId(row.id)}>
                  <td className="px-4 py-3">
                    <div className="text-sm font-semibold text-slate-900">{row.employeeName}</div>
                    <div className="text-xs text-slate-500">{row.employeeId}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">{row.businessUnit}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    <div>{row.site}</div>
                    <div className="text-xs text-slate-500">{row.location}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">{row.attendanceStatus}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{row.clockingMode}</td>
                  <td className="px-4 py-3"><span className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold ${reviewTone(row.reviewStatus)}`}>{row.reviewStatus}</span></td>
                  <td className="px-4 py-3 text-sm text-slate-700">{row.payrollReady ? 'Yes' : 'No'}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{row.checkInTime || '—'}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{formatNumber(row.minutesLate)}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{row.verifiedBy}</td>
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

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
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
        rows={4}
        placeholder={placeholder}
        className="w-full py-2.5 px-3 rounded-xl border border-slate-200 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-dle-blue/20 resize-y"
      />
    </label>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
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
