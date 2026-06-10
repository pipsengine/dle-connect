'use client';

/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  BriefcaseBusiness,
  CheckCircle2,
  Clock,
  Download,
  FileSpreadsheet,
  Filter,
  RefreshCcw,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { PageTemplate } from '@/components/layout/page-template';

type ReportType = 'summary' | 'employee' | 'project' | 'workCenter' | 'supervisor' | 'payroll' | 'exceptions' | 'approval';

type Summary = {
  records: number;
  employees: number;
  timesheets: number;
  attendanceHours: number;
  projectHours: number;
  idleHours: number;
  totalHours: number;
  variance: number;
  payrollReadyRows: number;
  exceptionRows: number;
};

type GroupedRow = Summary & {
  label: string;
};

type DetailRow = {
  headerId: string;
  lineId: string;
  periodId: string;
  periodName: string;
  timesheetDate: string;
  supervisorName: string;
  workCenterName: string;
  normalizedStatus: string;
  payrollReady: boolean;
  employeeNo: string;
  employeeName: string;
  attendanceHours: number;
  projectHours: number;
  idleHours: number;
  totalHours: number;
  variance: number;
  validationStatus: string;
  validationMessage: string | null;
  projectCodes: string[];
  idleReasons: string[];
  payrollAcknowledgedAt: string | null;
};

type FilterOptions = {
  periods: { id: string; name: string }[];
  statuses: string[];
  supervisors: string[];
  workCenters: string[];
  projects: string[];
  employees: string[];
};

type ReportsPayload = {
  generatedAt: string;
  reportType: ReportType;
  permissions: {
    actor: string;
    role: string;
    canExport: boolean;
    canViewPayroll: boolean;
  };
  summary: Summary;
  reportRows: Array<GroupedRow | DetailRow>;
  detailRows: DetailRow[];
  breakdowns: {
    status: GroupedRow[];
    employee: GroupedRow[];
    workCenter: GroupedRow[];
    supervisor: GroupedRow[];
    project: GroupedRow[];
    period: GroupedRow[];
  };
  filterOptions: FilterOptions;
};

const reportTypes: { id: ReportType; label: string; icon: typeof BarChart3 }[] = [
  { id: 'summary', label: 'Summary', icon: BarChart3 },
  { id: 'employee', label: 'Employee', icon: Users },
  { id: 'project', label: 'Project', icon: BriefcaseBusiness },
  { id: 'workCenter', label: 'Work Center', icon: Clock },
  { id: 'supervisor', label: 'Supervisor', icon: ShieldCheck },
  { id: 'payroll', label: 'Payroll', icon: CheckCircle2 },
  { id: 'exceptions', label: 'Exceptions', icon: AlertTriangle },
  { id: 'approval', label: 'Approval', icon: FileSpreadsheet },
];

const statusClass = (status: string) => {
  if (status === 'HR_Acknowledged' || status === 'Locked' || status === 'Approved') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'Rejected' || status === 'Returned') return 'border-red-200 bg-red-50 text-red-700';
  if (status === 'Submitted') return 'border-indigo-200 bg-indigo-50 text-indigo-700';
  if (status === 'Cost_Control_Reviewed' || status === 'Project_Manager_Reviewed') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-slate-200 bg-slate-50 text-slate-700';
};

const formatStatus = (status: string) => status.replace(/_/g, ' ');
const formatHours = (value: number) => `${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}h`;
const formatNumber = (value: number) => Number(value || 0).toLocaleString();
const formatDate = (value: string) => new Intl.DateTimeFormat('en', { month: 'short', day: '2-digit', year: 'numeric' }).format(new Date(value));
const isGroupedRow = (row: GroupedRow | DetailRow): row is GroupedRow => 'label' in row;

const toCsvValue = (value: unknown) => {
  const normalized = Array.isArray(value) ? value.join('; ') : String(value ?? '');
  return `"${normalized.replace(/"/g, '""')}"`;
};

const today = new Date().toISOString().slice(0, 10);
const monthStart = `${today.slice(0, 8)}01`;

function MultiSelect({
  label,
  values,
  selected,
  onChange,
  limit = 7,
}: {
  label: string;
  values: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  limit?: number;
}) {
  const visibleValues = values.slice(0, limit);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</span>
        {selected.length > 0 && (
          <button type="button" onClick={() => onChange([])} className="text-[11px] font-bold text-dle-blue hover:text-dle-blue-deep">
            Clear
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {visibleValues.map((value) => {
          const active = selected.includes(value);
          return (
            <button
              key={value}
              type="button"
              onClick={() => onChange(active ? selected.filter((item) => item !== value) : [...selected, value])}
              className={`max-w-full rounded-lg border px-3 py-1.5 text-xs font-bold transition ${active ? 'border-dle-blue bg-blue-50 text-dle-blue' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
              title={value}
            >
              <span className="block max-w-[220px] truncate">{value}</span>
            </button>
          );
        })}
        {values.length > visibleValues.length && (
          <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-400">
            +{values.length - visibleValues.length}
          </span>
        )}
      </div>
    </div>
  );
}

export default function TimesheetReportsClient() {
  const [payload, setPayload] = useState<ReportsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reportType, setReportType] = useState<ReportType>('summary');
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [query, setQuery] = useState('');
  const [payrollReady, setPayrollReady] = useState<'all' | 'yes' | 'no'>('all');
  const [statuses, setStatuses] = useState<string[]>([]);
  const [supervisors, setSupervisors] = useState<string[]>([]);
  const [workCenters, setWorkCenters] = useState<string[]>([]);
  const [periods, setPeriods] = useState<string[]>([]);
  const [projects, setProjects] = useState<string[]>([]);

  const requestUrl = useMemo(() => {
    const params = new URLSearchParams({ reportType, from, to });
    if (query.trim()) params.set('query', query.trim());
    if (payrollReady !== 'all') params.set('payrollReady', payrollReady);
    if (statuses.length) params.set('statuses', statuses.join(','));
    if (supervisors.length) params.set('supervisors', supervisors.join(','));
    if (workCenters.length) params.set('workCenters', workCenters.join(','));
    if (periods.length) params.set('periods', periods.join(','));
    if (projects.length) params.set('projects', projects.join(','));
    return `/api/hris/time-and-logs/timesheet-reports?${params.toString()}`;
  }, [from, payrollReady, periods, projects, query, reportType, statuses, supervisors, to, workCenters]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(requestUrl, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Unable to load timesheet reports');
      setPayload(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load timesheet reports');
    } finally {
      setLoading(false);
    }
  }, [requestUrl]);

  useEffect(() => {
    void load();
  }, [load]);

  const exportCsv = () => {
    if (!payload?.detailRows.length) return;
    const columns: Array<[string, keyof DetailRow]> = [
      ['Date', 'timesheetDate'],
      ['Period', 'periodName'],
      ['Employee No', 'employeeNo'],
      ['Employee Name', 'employeeName'],
      ['Supervisor', 'supervisorName'],
      ['Work Center', 'workCenterName'],
      ['Status', 'normalizedStatus'],
      ['Attendance Hours', 'attendanceHours'],
      ['Project Hours', 'projectHours'],
      ['Idle Hours', 'idleHours'],
      ['Total Hours', 'totalHours'],
      ['Variance', 'variance'],
      ['Projects', 'projectCodes'],
      ['Idle Reasons', 'idleReasons'],
      ['Validation', 'validationStatus'],
      ['Payroll Ready', 'payrollReady'],
    ];
    const csv = [
      columns.map(([label]) => toCsvValue(label)).join(','),
      ...payload.detailRows.map((row) => columns.map(([, key]) => toCsvValue(row[key])).join(',')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `timesheet-report-${reportType}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const filterOptions = payload?.filterOptions;
  const summary = payload?.summary;

  return (
    <PageTemplate
      title="Timesheet Reports"
      description="Operational, approval, project, exception, and payroll-ready views from captured timesheets."
      breadcrumbs={[{ label: 'HRIS', href: '/hris' }, { label: 'Time & Logs', href: '/hris/time-and-logs' }, { label: 'Reports' }]}
      primaryAction={{ label: loading ? 'Refreshing' : 'Refresh', onClick: load, icon: RefreshCcw }}
      secondaryAction={{ label: 'Export CSV', onClick: exportCsv, icon: Download }}
    >
      <div className="space-y-5">
        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap gap-2">
            {reportTypes.map((item) => {
              const active = reportType === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setReportType(item.id)}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-black transition ${active ? 'border-dle-blue bg-blue-50 text-dle-blue' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.5fr_0.75fr_0.75fr_0.75fr]">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search employee, code, supervisor, work center, period..."
                className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-sm font-semibold text-slate-700 outline-none focus:border-dle-blue"
              />
            </label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-11 rounded-lg border border-slate-200 px-3 text-sm font-bold text-slate-700 outline-none focus:border-dle-blue" />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-11 rounded-lg border border-slate-200 px-3 text-sm font-bold text-slate-700 outline-none focus:border-dle-blue" />
            <select value={payrollReady} onChange={(e) => setPayrollReady(e.target.value as 'all' | 'yes' | 'no')} className="h-11 rounded-lg border border-slate-200 px-3 text-sm font-bold text-slate-700 outline-none focus:border-dle-blue">
              <option value="all">All payroll states</option>
              <option value="yes">Payroll ready only</option>
              <option value="no">Not payroll ready</option>
            </select>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-5">
            <MultiSelect label="Periods" values={(filterOptions?.periods || []).map((period) => period.name)} selected={periods.map((id) => filterOptions?.periods.find((period) => period.id === id)?.name || id)} onChange={(nextNames) => setPeriods(nextNames.map((name) => filterOptions?.periods.find((period) => period.name === name)?.id || name))} limit={6} />
            <MultiSelect label="Statuses" values={filterOptions?.statuses || []} selected={statuses} onChange={setStatuses} />
            <MultiSelect label="Supervisors" values={filterOptions?.supervisors || []} selected={supervisors} onChange={setSupervisors} />
            <MultiSelect label="Work Centers" values={filterOptions?.workCenters || []} selected={workCenters} onChange={setWorkCenters} />
            <MultiSelect label="Projects" values={filterOptions?.projects || []} selected={projects} onChange={setProjects} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {[
            { label: 'Timesheet Lines', value: formatNumber(summary?.records || 0), icon: FileSpreadsheet, sub: `${formatNumber(summary?.timesheets || 0)} timesheets` },
            { label: 'Employees', value: formatNumber(summary?.employees || 0), icon: Users, sub: 'Unique employees' },
            { label: 'Attendance Hours', value: formatHours(summary?.attendanceHours || 0), icon: Clock, sub: `${formatHours(summary?.totalHours || 0)} total booked` },
            { label: 'Project Hours', value: formatHours(summary?.projectHours || 0), icon: BriefcaseBusiness, sub: `${formatHours(summary?.idleHours || 0)} idle/break` },
            { label: 'Exceptions', value: formatNumber(summary?.exceptionRows || 0), icon: AlertTriangle, sub: `${formatNumber(summary?.payrollReadyRows || 0)} payroll ready rows` },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="rounded-lg bg-blue-50 p-2 text-dle-blue"><stat.icon className="h-5 w-5" /></div>
                <div className="text-right">
                  <div className="text-xl font-black text-slate-900">{stat.value}</div>
                  <div className="text-[11px] font-semibold text-slate-500">{stat.sub}</div>
                </div>
              </div>
              <p className="mt-3 text-[10px] font-black uppercase tracking-widest text-slate-400">{stat.label}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_360px]">
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div>
                <h2 className="text-sm font-black text-slate-900">Report View</h2>
                <p className="text-xs font-semibold text-slate-500">{loading ? 'Refreshing report data...' : `Generated ${payload ? new Date(payload.generatedAt).toLocaleString() : '-'}`}</p>
              </div>
              <Filter className="h-4 w-4 text-slate-400" />
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100 text-left text-sm">
                <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Group / Employee</th>
                    <th className="px-4 py-3 text-right">Records</th>
                    <th className="px-4 py-3 text-right">Employees</th>
                    <th className="px-4 py-3 text-right">Attendance</th>
                    <th className="px-4 py-3 text-right">Project</th>
                    <th className="px-4 py-3 text-right">Idle</th>
                    <th className="px-4 py-3 text-right">Variance</th>
                    <th className="px-4 py-3 text-right">Exceptions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(payload?.reportRows || []).slice(0, 80).map((row, index) => {
                    if (isGroupedRow(row)) {
                      return (
                        <tr key={`${row.label}-${index}`} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-black text-slate-900">{formatStatus(row.label)}</td>
                          <td className="px-4 py-3 text-right font-bold text-slate-700">{formatNumber(row.records)}</td>
                          <td className="px-4 py-3 text-right font-bold text-slate-700">{formatNumber(row.employees)}</td>
                          <td className="px-4 py-3 text-right font-bold text-slate-700">{formatHours(row.attendanceHours)}</td>
                          <td className="px-4 py-3 text-right font-bold text-slate-700">{formatHours(row.projectHours)}</td>
                          <td className="px-4 py-3 text-right font-bold text-slate-700">{formatHours(row.idleHours)}</td>
                          <td className={`px-4 py-3 text-right font-black ${Math.abs(row.variance) > 0.01 ? 'text-amber-700' : 'text-slate-600'}`}>{formatHours(row.variance)}</td>
                          <td className="px-4 py-3 text-right font-bold text-slate-700">{formatNumber(row.exceptionRows)}</td>
                        </tr>
                      );
                    }
                    return (
                      <tr key={row.lineId} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <div className="font-black text-slate-900">{row.employeeName}</div>
                          <div className="text-xs font-bold text-slate-500">{row.employeeNo} | {formatDate(row.timesheetDate)}</div>
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-slate-700">1</td>
                        <td className="px-4 py-3 text-right font-bold text-slate-700">1</td>
                        <td className="px-4 py-3 text-right font-bold text-slate-700">{formatHours(row.attendanceHours)}</td>
                        <td className="px-4 py-3 text-right font-bold text-slate-700">{formatHours(row.projectHours)}</td>
                        <td className="px-4 py-3 text-right font-bold text-slate-700">{formatHours(row.idleHours)}</td>
                        <td className={`px-4 py-3 text-right font-black ${Math.abs(row.variance) > 0.01 ? 'text-amber-700' : 'text-slate-600'}`}>{formatHours(row.variance)}</td>
                        <td className="px-4 py-3 text-right font-bold text-red-600">{row.validationStatus === 'Valid' ? 0 : 1}</td>
                      </tr>
                    );
                  })}
                  {!loading && !payload?.reportRows.length && (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-sm font-bold text-slate-400">No report data matches the current filters.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-5">
            <Breakdown title="Approval Status" rows={payload?.breakdowns.status || []} />
            <Breakdown title="Top Projects" rows={payload?.breakdowns.project || []} />
            <Breakdown title="Periods" rows={payload?.breakdowns.period || []} />
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <div>
              <h2 className="text-sm font-black text-slate-900">Line Detail</h2>
              <p className="text-xs font-semibold text-slate-500">Showing up to 500 lines for audit and export.</p>
            </div>
            <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-600">{formatNumber(payload?.detailRows.length || 0)} rows</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-left text-sm">
              <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                <tr>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Date / Period</th>
                  <th className="px-4 py-3">Supervisor</th>
                  <th className="px-4 py-3">Work Center</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Hours</th>
                  <th className="px-4 py-3">Projects</th>
                  <th className="px-4 py-3">Validation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(payload?.detailRows || []).map((row) => (
                  <tr key={row.lineId} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="font-black text-slate-900">{row.employeeName}</div>
                      <div className="text-xs font-bold text-slate-500">{row.employeeNo}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-800">{formatDate(row.timesheetDate)}</div>
                      <div className="text-xs font-semibold text-slate-500">{row.periodName}</div>
                    </td>
                    <td className="px-4 py-3 font-bold text-slate-700">{row.supervisorName || 'Unassigned'}</td>
                    <td className="px-4 py-3 font-bold text-slate-700">{row.workCenterName || 'Unassigned'}</td>
                    <td className="px-4 py-3">
                      <div className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-black ${statusClass(row.normalizedStatus)}`}>{formatStatus(row.normalizedStatus)}</div>
                      {row.payrollReady && <div className="mt-1 text-[11px] font-black text-emerald-600">Payroll ready</div>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="font-black text-slate-900">{formatHours(row.totalHours)}</div>
                      <div className="text-xs font-semibold text-slate-500">Att {formatHours(row.attendanceHours)} | Var {formatHours(row.variance)}</div>
                    </td>
                    <td className="px-4 py-3 text-xs font-bold text-slate-600">{row.projectCodes.length ? row.projectCodes.join(', ') : 'No project'}</td>
                    <td className="px-4 py-3">
                      <div className={row.validationStatus === 'Valid' ? 'font-black text-emerald-600' : 'font-black text-amber-700'}>{row.validationStatus}</div>
                      {row.validationMessage && <div className="max-w-[240px] text-xs font-semibold text-slate-500">{row.validationMessage}</div>}
                    </td>
                  </tr>
                ))}
                {!loading && !payload?.detailRows.length && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-sm font-bold text-slate-400">No timesheet lines available for this report.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </PageTemplate>
  );
}

function Breakdown({ title, rows }: { title: string; rows: GroupedRow[] }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-black text-slate-900">{title}</h2>
      </div>
      <div className="divide-y divide-slate-100">
        {rows.slice(0, 8).map((row) => (
          <div key={row.label} className="px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-sm font-black text-slate-800">{formatStatus(row.label)}</span>
              <span className="shrink-0 text-sm font-black text-slate-900">{formatHours(row.totalHours)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-3 text-[11px] font-semibold text-slate-500">
              <span>{formatNumber(row.records)} records</span>
              <span>{formatNumber(row.employees)} employees</span>
            </div>
          </div>
        ))}
        {!rows.length && <div className="px-4 py-8 text-center text-sm font-bold text-slate-400">No data</div>}
      </div>
    </div>
  );
}
