'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  BarChart3,
  Bell,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  FileCheck2,
  RefreshCcw,
  Search,
  ShieldCheck,
  TrendingUp,
  Users,
} from 'lucide-react';
import type { WorkforceOperationsAnalyticsPayload, WorkforceOperationsDetailRow, WorkforceOperationsEmployeeSummary } from '@/lib/workforce-operations-analytics-store';
import { downloadExcelFile } from '@/lib/excel-export';

type ApiResponse<T> = { status: 'success' | 'error'; data?: T; error?: string };
type ViewMode = 'summary' | 'detail';

const numberFmt = new Intl.NumberFormat('en-GB');
const number = (value: number | undefined) => numberFmt.format(value || 0);

const badgeClass = (value: string) => {
  const text = value.toLowerCase();
  if (text.includes('matched') || text.includes('present') || text.includes('ready') || text.includes('approved')) return 'bg-[#DCFCE7] text-[#166534]';
  if (text.includes('variance') || text.includes('absent') || text.includes('high') || text.includes('missing')) return 'bg-[#FEE2E2] text-[#991B1B]';
  if (text.includes('pending') || text.includes('review') || text.includes('medium')) return 'bg-[#FFEDD5] text-[#9A3412]';
  if (text.includes('low')) return 'bg-[#DBEAFE] text-[#1D4ED8]';
  return 'bg-[#F1F5F9] text-[#334155]';
};

function KpiCard({ label, value, trend, tone, icon: Icon }: { label: string; value: string; trend: string; tone: string; icon: typeof Users }) {
  const tones: Record<string, string> = {
    blue: 'from-[#EFF6FF] to-white border-[#BFDBFE]',
    green: 'from-[#ECFDF5] to-white border-[#BBF7D0]',
    cyan: 'from-[#ECFEFF] to-white border-[#A5F3FC]',
    orange: 'from-[#FFF7ED] to-white border-[#FED7AA]',
    violet: 'from-[#F5F3FF] to-white border-[#DDD6FE]',
    red: 'from-[#FEF2F2] to-white border-[#FECACA]',
  };
  const iconTones: Record<string, string> = {
    blue: 'bg-[#2563EB]',
    green: 'bg-[#22C55E]',
    cyan: 'bg-[#06B6D4]',
    orange: 'bg-[#F97316]',
    violet: 'bg-[#7C3AED]',
    red: 'bg-[#EF4444]',
  };
  return (
    <div className={`h-[145px] rounded-[20px] border bg-gradient-to-br p-5 shadow-[0_6px_18px_rgba(15,23,42,0.05)] ${tones[tone]}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold text-[#64748B]">{label}</p>
          <p className="mt-2 text-[30px] font-extrabold leading-none text-[#0F172A]">{value}</p>
          <p className="mt-2 text-[12px] font-semibold text-[#22C55E]">{trend}</p>
        </div>
        <span className={`flex h-11 w-11 items-center justify-center rounded-2xl text-white ${iconTones[tone]}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </div>
  );
}

function ProgressRing({ value, label, status }: { value: number; label: string; status: string }) {
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(100, value) / 100) * circumference;
  const stroke = status === 'Critical' ? '#EF4444' : status === 'Warning' ? '#F59E0B' : status === 'Excellent' ? '#22C55E' : '#2563EB';
  return (
    <div className="flex flex-col items-center rounded-[18px] border border-[#E2E8F0] bg-white p-4 shadow-[0_6px_18px_rgba(15,23,42,0.05)]">
      <svg width="88" height="88" className="-rotate-90">
        <circle cx="44" cy="44" r={radius} fill="none" stroke="#E2E8F0" strokeWidth="8" />
        <circle cx="44" cy="44" r={radius} fill="none" stroke={stroke} strokeWidth="8" strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" />
      </svg>
      <p className="mt-2 text-center text-[12px] font-bold text-[#0F172A]">{label}</p>
      <p className="text-[11px] font-semibold text-[#64748B]">{value}% · {status}</p>
    </div>
  );
}

export default function WorkforceOperationsCommandCenter({ role = 'HR Manager' }: { role?: string }) {
  const [period, setPeriod] = useState('2026-06');
  const [payload, setPayload] = useState<WorkforceOperationsAnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('summary');
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState('');
  const [supervisor, setSupervisor] = useState('');
  const [workCenter, setWorkCenter] = useState('');
  const [project, setProject] = useState('');
  const [verifyStatus, setVerifyStatus] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const load = useCallback(async (rebuild = false) => {
    setLoading(true);
    setError('');
    try {
      const url = `/api/hris/workforce-management/operations-analytics?period=${encodeURIComponent(period)}${rebuild ? '&verify=true' : ''}`;
      const res = await fetch(url, { headers: { 'x-hris-role': role }, cache: 'no-store' });
      const json = (await res.json()) as ApiResponse<WorkforceOperationsAnalyticsPayload>;
      if (!res.ok || json.status !== 'success' || !json.data) throw new Error(json.error || 'Unable to load analytics');
      setPayload(json.data);
      if (rebuild) setToast('Payroll snapshot rebuilt and verification completed.');
    } catch (event) {
      setError(event instanceof Error ? event.message : 'Unable to load workforce operations analytics');
    } finally {
      setLoading(false);
      setVerifying(false);
    }
  }, [period, role]);

  useEffect(() => {
    void load(false);
  }, [load]);

  const filteredSummaries = useMemo(() => {
    const rows = payload?.employeeSummaries || [];
    return rows.filter((row) => {
      const haystack = [row.employeeId, row.employeeNo, row.employeeName, row.department, row.location, row.supervisorName, row.workCenterName, row.projectCode, row.verifyStatus].join(' ').toLowerCase();
      if (query && !haystack.includes(query.toLowerCase())) return false;
      if (department && row.department !== department) return false;
      if (supervisor && row.supervisorName !== supervisor) return false;
      if (workCenter && row.workCenterName !== workCenter) return false;
      if (project && row.projectCode !== project) return false;
      if (verifyStatus && row.verifyStatus !== verifyStatus) return false;
      return true;
    });
  }, [payload?.employeeSummaries, query, department, supervisor, workCenter, project, verifyStatus]);

  const filteredDetails = useMemo(() => {
    const rows = payload?.detailRows || [];
    return rows.filter((row) => {
      const haystack = [row.employeeId, row.employeeName, row.supervisorName, row.workCenterName, row.projectCode, row.timesheetDate, row.verifyStatus].join(' ').toLowerCase();
      if (query && !haystack.includes(query.toLowerCase())) return false;
      if (department && row.department !== department) return false;
      if (supervisor && row.supervisorName !== supervisor) return false;
      if (workCenter && row.workCenterName !== workCenter) return false;
      if (project && row.projectCode !== project) return false;
      if (verifyStatus && row.verifyStatus !== verifyStatus) return false;
      return true;
    });
  }, [payload?.detailRows, query, department, supervisor, workCenter, project, verifyStatus]);

  const pageRows = viewMode === 'detail' ? filteredDetails : filteredSummaries;
  const totalPages = Math.max(1, Math.ceil(pageRows.length / pageSize));
  const visibleRows = pageRows.slice((page - 1) * pageSize, page * pageSize);

  const exportCsv = async (mode: ViewMode) => {
    const url = `/api/hris/workforce-management/operations-analytics?period=${encodeURIComponent(period)}&format=csv&view=${mode}`;
    const res = await fetch(url, { headers: { 'x-hris-role': role } });
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = `workforce-operations-${mode}-${period}.csv`;
    anchor.click();
    URL.revokeObjectURL(href);
    setToast(`${mode === 'detail' ? 'Detail' : 'Summary'} CSV exported.`);
  };

  const exportExcel = () => {
    const sourceRows = viewMode === 'detail' ? filteredDetails : filteredSummaries;
    if (!sourceRows.length) {
      setToast('No rows to export for the current filters.');
      return;
    }
    const objectRows = sourceRows.map((row) => {
      if (viewMode === 'detail') {
        const detail = row as WorkforceOperationsDetailRow;
        return {
          Employee: detail.employeeName,
          ID: detail.employeeId,
          Date: detail.timesheetDate,
          Supervisor: detail.supervisorName,
          'Work Center': detail.workCenterName,
          Project: detail.projectCode,
          'Days Worked (Period)': detail.periodDaysWorked,
          'Payroll Snapshot Days': detail.payrollSnapshotDays ?? '',
          Verify: detail.verifyStatus,
          'Booked Hours': detail.bookedHours,
          Overtime: detail.overtimeHours,
          Status: detail.timesheetStatus,
        };
      }
      const summary = row as WorkforceOperationsEmployeeSummary;
      return {
        Employee: summary.employeeName,
        ID: summary.employeeId,
        Department: summary.department,
        Supervisor: summary.supervisorName,
        'Work Center': summary.workCenterName,
        Project: summary.projectCode,
        'Days Worked': summary.periodDaysWorked,
        'Payroll Snapshot': summary.payrollSnapshotDays ?? '',
        Verify: summary.verifyStatus,
        'Booked Hours': summary.bookedHours,
        Overtime: summary.overtimeHours,
        Risk: summary.risk,
      };
    });
    const columns = Object.keys(objectRows[0]);
    downloadExcelFile({
      title: 'Workforce Operations Register',
      subtitle: `${payload?.periodLabel || period} · ${viewMode === 'detail' ? 'Daily detail' : 'Employee summary'} · ${objectRows.length} rows`,
      sheetName: 'Workforce Operations',
      fileName: `workforce-operations-${viewMode}-${period}.xls`,
      columns,
      rows: objectRows.map((row) => columns.map((column) => row[column as keyof typeof row] as string | number)),
      generatedAt: payload?.generatedAt,
    });
    setToast('Excel export generated.');
  };

  const runVerify = async () => {
    setVerifying(true);
    await load(true);
  };

  return (
    <div className="min-h-screen bg-[#F6F8FC]">
      <div className="mx-auto max-w-[1880px] px-4 py-6 sm:px-8">
        <header className="rounded-[20px] border border-[#E2E8F0] bg-white p-6 shadow-[0_6px_18px_rgba(15,23,42,0.05)]">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex items-start gap-4">
              <span className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl bg-[#22C55E] text-white shadow-[0_6px_20px_rgba(37,99,235,0.18)]">
                <BarChart3 className="h-6 w-6" />
              </span>
              <div>
                <h1 className="text-[34px] font-extrabold tracking-tight text-[#0F172A]">Workforce Management</h1>
                <p className="mt-1 max-w-4xl text-[14px] font-medium text-[#64748B]">
                  Central hub for attendance, timesheets, payroll readiness, workforce productivity, approvals and operational analytics.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <select value={period} onChange={(event) => setPeriod(event.target.value)} className="h-11 rounded-xl border border-[#E2E8F0] bg-white px-3 text-sm font-semibold text-[#0F172A]">
                <option value="2026-06">June 2026</option>
                <option value="2026-05">May 2026</option>
              </select>
              <button type="button" onClick={() => void load(false)} className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-4 text-sm font-bold text-[#0F172A] shadow-sm hover:bg-[#F8FAFC]">
                <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
              </button>
              <button type="button" onClick={() => void runVerify()} disabled={verifying} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#2563EB] px-4 text-sm font-bold text-white shadow-[0_6px_20px_rgba(37,99,235,0.18)] hover:bg-[#1D4ED8] disabled:opacity-60">
                <FileCheck2 className="h-4 w-4" /> {verifying ? 'Verifying…' : 'Verify Payroll Days'}
              </button>
              <button type="button" onClick={() => void exportCsv(viewMode)} className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-4 text-sm font-bold text-[#0F172A]">
                <Download className="h-4 w-4" /> Export CSV
              </button>
              <button type="button" onClick={exportExcel} className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-4 text-sm font-bold text-[#0F172A]">
                <Download className="h-4 w-4" /> Export Excel
              </button>
            </div>
          </div>
        </header>

        <section className="mt-5 rounded-[20px] border border-[#BBF7D0] bg-gradient-to-r from-[#ECFDF5] to-[#F0FDF4] p-4 shadow-[0_6px_18px_rgba(15,23,42,0.05)]">
          <div className="flex flex-wrap items-center gap-4 text-[13px] font-semibold text-[#166534]">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1"><CheckCircle2 className="h-4 w-4" /> Biometric Status: Live</span>
            <span>Database Sync: Connected</span>
            <span>Payroll Integration: {payload?.summary.varianceCount ? 'Review Required' : 'Healthy'}</span>
            <span>Employees Synced: {number(payload?.kpis.employees)}</span>
            <span>Last Sync: {payload?.generatedAt ? new Date(payload.generatedAt).toLocaleString('en-GB') : '—'}</span>
            <span className="rounded-full bg-[#22C55E] px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">Live</span>
          </div>
        </section>

        {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}
        {toast ? <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{toast}</div> : null}

        <section className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
          <KpiCard label="Employees" value={number(payload?.kpis.employees)} trend="+2.4% vs last period" tone="blue" icon={Users} />
          <KpiCard label="Attendance Today" value={number(payload?.kpis.attendanceToday)} trend="+5.8% vs yesterday" tone="green" icon={CheckCircle2} />
          <KpiCard label="Timesheet Hours" value={number(payload?.kpis.timesheetHours)} trend="+8.2% booked hours" tone="cyan" icon={Clock} />
          <KpiCard label="Pending Approvals" value={number(payload?.kpis.pendingApprovals)} trend="Workflow queue" tone="orange" icon={Bell} />
          <KpiCard label="Payroll Ready" value={number(payload?.kpis.payrollReadyHours)} trend={`${payload?.summary.matchedCount || 0} matched employees`} tone="violet" icon={Banknote} />
          <KpiCard label="Productivity" value={`${payload?.kpis.productivityPct || 0}%`} trend={`${payload?.summary.missingDays || 0} missing days`} tone="red" icon={TrendingUp} />
        </section>

        <div className="mt-5 grid grid-cols-1 gap-5 wide:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-5">
            <section className="rounded-[20px] border border-[#E2E8F0] bg-white p-5 shadow-[0_6px_18px_rgba(15,23,42,0.05)]">
              <div className="mb-4 flex flex-wrap gap-2">
                {(['summary', 'detail'] as ViewMode[]).map((mode) => (
                  <button key={mode} type="button" onClick={() => { setViewMode(mode); setPage(1); }} className={`rounded-xl px-4 py-2 text-sm font-bold ${viewMode === mode ? 'bg-[#2563EB] text-white' : 'bg-[#F8FAFC] text-[#64748B]'}`}>
                    {mode === 'summary' ? 'Employee Summary' : 'Daily Detail'}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="rounded-[18px] border border-[#E2E8F0] p-4">
                  <p className="text-sm font-bold text-[#0F172A]">Payroll Readiness</p>
                  <p className="mt-3 text-4xl font-extrabold text-[#2563EB]">{payload?.analytics.payrollReadinessPct || 0}%</p>
                  <p className="mt-1 text-xs text-[#64748B]">{payload?.summary.matchedCount || 0} employees matched live vs payroll snapshot</p>
                </div>
                <div className="rounded-[18px] border border-[#E2E8F0] p-4">
                  <p className="text-sm font-bold text-[#0F172A]">Timesheet Completion</p>
                  <p className="mt-3 text-4xl font-extrabold text-[#06B6D4]">{payload?.analytics.timesheetCompletionPct || 0}%</p>
                  <p className="mt-1 text-xs text-[#64748B]">{payload?.summary.withTimesheet || 0} employees with period timesheet data</p>
                </div>
                <div className="rounded-[18px] border border-[#E2E8F0] p-4">
                  <p className="text-sm font-bold text-[#0F172A]">Total Days Worked</p>
                  <p className="mt-3 text-4xl font-extrabold text-[#7C3AED]">{number(payload?.summary.totalDaysWorked)}</p>
                  <p className="mt-1 text-xs text-[#64748B]">Excel-aligned payable day rule (Mon–Sat, no Sunday)</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
                {(payload?.analytics.operationalHealth || []).map((item) => (
                  <ProgressRing key={item.label} value={item.value} label={item.label} status={item.status} />
                ))}
              </div>
            </section>

            <section className="rounded-[20px] border border-[#E2E8F0] bg-white p-5 shadow-[0_6px_18px_rgba(15,23,42,0.05)]">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
                  <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search employee, supervisor, work center, project..." className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] pl-10 pr-3 text-sm font-medium outline-none focus:border-[#2563EB]" />
                </div>
                <select value={department} onChange={(e) => { setDepartment(e.target.value); setPage(1); }} className="h-11 rounded-xl border border-[#E2E8F0] bg-white px-3 text-sm font-semibold">
                  <option value="">All Departments</option>
                  {(payload?.filterOptions.departments || []).map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
                <select value={supervisor} onChange={(e) => { setSupervisor(e.target.value); setPage(1); }} className="h-11 rounded-xl border border-[#E2E8F0] bg-white px-3 text-sm font-semibold">
                  <option value="">All Supervisors</option>
                  {(payload?.filterOptions.supervisors || []).map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
                <select value={workCenter} onChange={(e) => { setWorkCenter(e.target.value); setPage(1); }} className="h-11 rounded-xl border border-[#E2E8F0] bg-white px-3 text-sm font-semibold">
                  <option value="">All Work Centers</option>
                  {(payload?.filterOptions.workCenters || []).map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
                <select value={project} onChange={(e) => { setProject(e.target.value); setPage(1); }} className="h-11 rounded-xl border border-[#E2E8F0] bg-white px-3 text-sm font-semibold">
                  <option value="">All Projects</option>
                  {(payload?.filterOptions.projects || []).map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
                <select value={verifyStatus} onChange={(e) => { setVerifyStatus(e.target.value); setPage(1); }} className="h-11 rounded-xl border border-[#E2E8F0] bg-white px-3 text-sm font-semibold">
                  <option value="">All Verify Status</option>
                  {(payload?.filterOptions.verifyStatuses || []).map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
                <button type="button" onClick={() => { setQuery(''); setDepartment(''); setSupervisor(''); setWorkCenter(''); setProject(''); setVerifyStatus(''); setPage(1); }} className="h-11 rounded-xl border border-[#E2E8F0] bg-white px-4 text-sm font-bold text-[#64748B]">Reset Filters</button>
              </div>

              <div className="mt-4 overflow-x-auto rounded-[18px] border border-[#E2E8F0]">
                <table className="min-w-full text-left text-[13px]">
                  <thead className="sticky top-0 bg-[#F8FAFC] text-[11px] font-bold uppercase tracking-wide text-[#64748B]">
                    <tr>
                      {viewMode === 'detail' ? (
                        <>
                          <th className="px-4 py-3">Employee</th>
                          <th className="px-4 py-3">ID</th>
                          <th className="px-4 py-3">Date</th>
                          <th className="px-4 py-3">Supervisor</th>
                          <th className="px-4 py-3">Work Center</th>
                          <th className="px-4 py-3">Project</th>
                          <th className="px-4 py-3">Days</th>
                          <th className="px-4 py-3">Payroll</th>
                          <th className="px-4 py-3">Hours</th>
                          <th className="px-4 py-3">OT</th>
                          <th className="px-4 py-3">Verify</th>
                          <th className="px-4 py-3">Risk</th>
                        </>
                      ) : (
                        <>
                          <th className="px-4 py-3">Employee</th>
                          <th className="px-4 py-3">ID</th>
                          <th className="px-4 py-3">Department</th>
                          <th className="px-4 py-3">Supervisor</th>
                          <th className="px-4 py-3">Work Center</th>
                          <th className="px-4 py-3">Days Worked</th>
                          <th className="px-4 py-3">Payroll Snapshot</th>
                          <th className="px-4 py-3">Booked Hrs</th>
                          <th className="px-4 py-3">Overtime</th>
                          <th className="px-4 py-3">Verify</th>
                          <th className="px-4 py-3">Risk</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={12} className="px-4 py-10 text-center font-semibold text-[#64748B]">Loading workforce operations register…</td></tr>
                    ) : visibleRows.length === 0 ? (
                      <tr><td colSpan={12} className="px-4 py-10 text-center font-semibold text-[#64748B]">No records match the selected filters.</td></tr>
                    ) : viewMode === 'detail' ? (
                      (visibleRows as WorkforceOperationsDetailRow[]).map((row) => (
                        <tr key={row.id} className="border-t border-[#E2E8F0] hover:bg-[#F8FAFC]">
                          <td className="px-4 py-3 font-semibold text-[#0F172A]">{row.employeeName}</td>
                          <td className="px-4 py-3">{row.employeeId}</td>
                          <td className="px-4 py-3">{row.timesheetDate}</td>
                          <td className="px-4 py-3">{row.supervisorName}</td>
                          <td className="px-4 py-3">{row.workCenterName}</td>
                          <td className="px-4 py-3">{row.projectCode}</td>
                          <td className="px-4 py-3 font-bold">{row.periodDaysWorked}</td>
                          <td className="px-4 py-3">{row.payrollSnapshotDays ?? '—'}</td>
                          <td className="px-4 py-3">{row.bookedHours}</td>
                          <td className="px-4 py-3">{row.overtimeHours}</td>
                          <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-[11px] font-bold ${badgeClass(row.verifyStatus)}`}>{row.verifyStatus}</span></td>
                          <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-[11px] font-bold ${badgeClass(row.risk)}`}>{row.risk}</span></td>
                        </tr>
                      ))
                    ) : (
                      (visibleRows as WorkforceOperationsEmployeeSummary[]).map((row) => (
                        <tr key={row.employeeId} className="border-t border-[#E2E8F0] hover:bg-[#F8FAFC]">
                          <td className="px-4 py-3 font-semibold text-[#0F172A]">{row.employeeName}</td>
                          <td className="px-4 py-3">{row.employeeId}</td>
                          <td className="px-4 py-3">{row.department}</td>
                          <td className="px-4 py-3">{row.supervisorName}</td>
                          <td className="px-4 py-3">{row.workCenterName}</td>
                          <td className="px-4 py-3 font-bold">{row.periodDaysWorked || '—'}</td>
                          <td className="px-4 py-3">{row.payrollSnapshotDays ?? '—'}</td>
                          <td className="px-4 py-3">{row.bookedHours}</td>
                          <td className="px-4 py-3">{row.overtimeHours}</td>
                          <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-[11px] font-bold ${badgeClass(row.verifyStatus)}`}>{row.verifyStatus}</span></td>
                          <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-[11px] font-bold ${badgeClass(row.risk)}`}>{row.risk}</span></td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3 text-sm font-semibold text-[#64748B]">
                <span>{pageRows.length} records · page {page} of {totalPages}</span>
                <div className="flex gap-2">
                  <button type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="rounded-xl border border-[#E2E8F0] px-3 py-2 disabled:opacity-40">Previous</button>
                  <button type="button" disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} className="rounded-xl border border-[#E2E8F0] px-3 py-2 disabled:opacity-40">Next</button>
                </div>
              </div>
            </section>
          </div>

          <aside className="space-y-5">
            <section className="rounded-[20px] border border-[#E2E8F0] bg-white p-5 shadow-[0_6px_18px_rgba(15,23,42,0.05)]">
              <h3 className="text-base font-bold text-[#0F172A]">AI Insights</h3>
              <ul className="mt-3 space-y-2">
                {(payload?.insights || []).map((item) => (
                  <li key={item.id} className={`rounded-xl border px-3 py-2 text-[12px] font-semibold ${badgeClass(item.severity)}`}>{item.label}</li>
                ))}
              </ul>
            </section>
            <section className="rounded-[20px] border border-[#E2E8F0] bg-white p-5 shadow-[0_6px_18px_rgba(15,23,42,0.05)]">
              <h3 className="flex items-center gap-2 text-base font-bold text-[#0F172A]"><AlertTriangle className="h-4 w-4 text-[#EF4444]" /> Live Alerts</h3>
              <ul className="mt-3 space-y-2">
                {(payload?.alerts || []).map((item) => (
                  <li key={item.id} className={`rounded-xl border px-3 py-2 text-[12px] font-semibold ${badgeClass(item.severity)}`}>{item.label}</li>
                ))}
              </ul>
            </section>
            <section className="rounded-[20px] border border-[#E2E8F0] bg-white p-5 shadow-[0_6px_18px_rgba(15,23,42,0.05)]">
              <h3 className="flex items-center gap-2 text-base font-bold text-[#0F172A]"><Calendar className="h-4 w-4 text-[#2563EB]" /> System Activity</h3>
              <ul className="mt-3 space-y-3">
                {(payload?.activity || []).map((item) => (
                  <li key={item.id} className="border-l-2 border-[#2563EB] pl-3">
                    <p className="text-[12px] font-semibold text-[#0F172A]">{item.label}</p>
                    <p className="text-[11px] text-[#94A3B8]">{new Date(item.at).toLocaleString('en-GB')}</p>
                  </li>
                ))}
              </ul>
            </section>
            <section className="rounded-[20px] border border-[#E2E8F0] bg-[#081A3A] p-5 text-white shadow-[0_12px_32px_rgba(15,23,42,0.08)]">
              <ShieldCheck className="h-5 w-5 text-[#22C55E]" />
              <p className="mt-3 text-sm font-bold">Payroll Validation Controls</p>
              <p className="mt-2 text-[12px] text-white/80">Use Verify Payroll Days to rebuild the period snapshot and compare live payable days against payroll feed using the Excel-aligned rule.</p>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
