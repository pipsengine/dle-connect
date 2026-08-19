'use client';

/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, BadgeCheck, Banknote, BarChart3, BriefcaseBusiness, CalendarCheck, CalendarClock, CheckCircle2, Clock, ClipboardList, Download, ExternalLink, FileWarning, History, Lock, MapPin, PlayCircle, RefreshCcw, Route, Send, ShieldCheck, TrendingUp, Users, X, XCircle } from 'lucide-react';

type Role = 'Employee' | 'Supervisor' | 'Manager' | 'General Manager' | 'HR Officer' | 'HR Manager' | 'Payroll Officer' | 'Payroll Manager' | 'Executive Management' | 'Administrator' | 'Super Administrator';
type Tone = 'blue' | 'green' | 'amber' | 'red' | 'violet' | 'cyan' | 'slate';
type Action = { id: string; label: string; roles: Role[]; requiresReason?: boolean; sensitive?: boolean };
type Section = { id: string; label: string; description: string; tabs: Array<{ id: string; label: string; controls: string[] }>; actions: string[] };
type RecordRow = { id: string; employeeId: string; employeeName: string; department: string; location: string; site: string; shift: string; attendanceStatus: string; timeStatus: string; approvalStatus: string; payrollStatus: string; productivityStatus: string; hoursWorked: number; overtimeHours: number; timeIn: string | null; timeOut: string | null; exceptions: string[] };
type AuditEntry = { id: string; at: string; user: string; role: string; action: string; record: string; oldValue: string | null; newValue: string | null; reason?: string; comments?: string };
type SummaryFilter = 'employees' | 'attendance' | 'timesheet-hours' | 'pending-approvals' | 'payroll-ready' | 'productivity-exceptions' | null;
type ShiftSchedule = { id: string; employeeId: string; employeeName: string; department: string; location: string; site: string; shift: string; startDate: string; endDate: string; scheduledStart: string; scheduledEnd: string; supervisor: string; status: 'Draft' | 'Published' | 'Conflict' | 'Cancelled'; notes: string; createdAt: string; createdBy: string; publishedAt?: string };
type Payload = {
  generatedAt: string;
  source: string;
  role: Role;
  section: string;
  tab: string;
  permissions: { canCapture: boolean; canApprove: boolean; canSchedule: boolean; canPostPayroll: boolean; canConfigure: boolean; canExport: boolean; canAudit: boolean };
  summary: { totalEmployees: number; presentToday: number; absentToday: number; lateToday: number; earlyDepartures: number; missingPunches: number; onLeaveToday: number; attendanceExceptions: number; timesheetHours: number; overtimeHours: number; pendingApprovals: number; payrollReadyHours: number; shiftConflicts: number; productivityPct: number };
  current: { workforceStatus: string; availableActions: string[]; nextRequiredAction: string; approvalStatus: string; complianceStatus: string; payrollImpact: string; auditHistory: string; workflowProgress: string; exceptionIndicators: string[] };
  sections: Section[];
  actions: Action[];
  records: RecordRow[];
  shiftSchedules: ShiftSchedule[];
  auditTrail: AuditEntry[];
};
type ApiResponse<T> = { status: 'success' | 'error'; data?: T; error?: string };

const roles: Role[] = ['Employee', 'Supervisor', 'Manager', 'General Manager', 'HR Officer', 'HR Manager', 'Payroll Officer', 'Payroll Manager', 'Executive Management', 'Administrator', 'Super Administrator'];
const numberFmt = new Intl.NumberFormat('en-GB');
const number = (value: number | undefined) => numberFmt.format(value || 0);
const hours = (value: number | undefined) => `${number(value)} hrs`;
const toneStyles: Record<Tone, { card: string; icon: string; chip: string; button: string }> = {
  blue: { card: 'border-blue-200 bg-blue-50', icon: 'bg-blue-600 text-white', chip: 'bg-blue-100 text-blue-800', button: 'bg-blue-600 text-white hover:bg-blue-700' },
  green: { card: 'border-emerald-200 bg-emerald-50', icon: 'bg-emerald-600 text-white', chip: 'bg-emerald-100 text-emerald-800', button: 'bg-emerald-600 text-white hover:bg-emerald-700' },
  amber: { card: 'border-amber-200 bg-amber-50', icon: 'bg-amber-500 text-white', chip: 'bg-amber-100 text-amber-800', button: 'bg-amber-500 text-white hover:bg-amber-600' },
  red: { card: 'border-red-200 bg-red-50', icon: 'bg-red-600 text-white', chip: 'bg-red-100 text-red-800', button: 'bg-red-600 text-white hover:bg-red-700' },
  violet: { card: 'border-violet-200 bg-violet-50', icon: 'bg-violet-600 text-white', chip: 'bg-violet-100 text-violet-800', button: 'bg-violet-600 text-white hover:bg-violet-700' },
  cyan: { card: 'border-cyan-200 bg-cyan-50', icon: 'bg-cyan-600 text-white', chip: 'bg-cyan-100 text-cyan-800', button: 'bg-cyan-600 text-white hover:bg-cyan-700' },
  slate: { card: 'border-slate-200 bg-slate-50', icon: 'bg-slate-900 text-white', chip: 'bg-slate-100 text-slate-800', button: 'bg-slate-900 text-white hover:bg-slate-800' },
};

const statusTone = (value: string): Tone => {
  const text = String(value || '').toLowerCase();
  if (text.includes('exception') || text.includes('absent') || text.includes('block') || text.includes('reject') || text.includes('missing')) return 'red';
  if (text.includes('late') || text.includes('pending') || text.includes('review') || text.includes('warning')) return 'amber';
  if (text.includes('present') || text.includes('ready') || text.includes('productive') || text.includes('approved') || text.includes('compliant')) return 'green';
  return 'blue';
};
const actionIcon = (id: string) => {
  if (id.includes('approve')) return BadgeCheck;
  if (id.includes('reject')) return XCircle;
  if (id.includes('payroll')) return Banknote;
  if (id.includes('report') || id.includes('export')) return Download;
  if (id.includes('audit') || id.includes('history')) return History;
  if (id.includes('lock')) return Lock;
  if (id.includes('schedule') || id.includes('roster')) return CalendarClock;
  if (id.includes('submit')) return Send;
  return PlayCircle;
};

const timesheetQuickLinks = [
  { label: 'Timesheet Entry', href: '/hris/workforce-management/timesheet-entry' },
  { label: 'Timesheet Period', href: '/hris/workforce-management/timesheet-period' },
  { label: 'Timesheet Approval', href: '/hris/workforce-management/timesheet-approval' },
  { label: 'Timesheet Reports', href: '/hris/workforce-management/timesheet-reports' },
  { label: 'Crew Mobilization', href: '/hris/workforce-management/crew-mobilization' },
];

const sumRows = (rows: RecordRow[], getter: (row: RecordRow) => number) => rows.reduce((total, row) => total + getter(row), 0);
const pct = (value: number, total: number) => total > 0 ? Math.round((value / total) * 100) : 0;
const compact = new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 });
const compactNumber = (value: number | undefined) => compact.format(value || 0);

const groupRows = (rows: RecordRow[], key: (row: RecordRow) => string, value: (row: RecordRow) => number = () => 1) => {
  const groups = new Map<string, number>();
  for (const row of rows) {
    const label = key(row) || 'Unassigned';
    groups.set(label, (groups.get(label) || 0) + value(row));
  }
  return Array.from(groups.entries())
    .map(([label, total]) => ({ label, total: Math.round(total * 100) / 100 }))
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
};

function MetricCard({ label, value, detail, icon: Icon, tone, onClick }: { label: string; value: string; detail: string; icon: any; tone: Tone; onClick?: () => void }) {
  const styles = toneStyles[tone];
  const Element = onClick ? 'button' : 'div';
  return (
    <Element type={onClick ? 'button' : undefined} onClick={onClick} className={`w-full rounded-2xl border p-4 text-left ${styles.card} ${onClick ? 'transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500/30' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-normal text-slate-600">{label}</p>
          <p className="mt-2 truncate text-2xl font-black text-slate-950">{value}</p>
          <p className="mt-1 text-xs font-semibold text-slate-600">{detail}</p>
        </div>
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${styles.icon}`}><Icon className="h-5 w-5" /></span>
      </div>
    </Element>
  );
}

export default function WorkforceManagementClient({ initialNow, initialSection = 'attendance', initialTab }: { initialNow: string; initialSection?: string; initialTab?: string }) {
  const [role, setRole] = useState<Role>('HR Manager');
  const [section, setSection] = useState(initialSection);
  const [tab, setTab] = useState(initialTab || '');
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState('');
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [summaryFilter, setSummaryFilter] = useState<SummaryFilter>(null);
  const [auditOpen, setAuditOpen] = useState(false);

  const activeSection = useMemo(() => payload?.sections.find((item) => item.id === section) || payload?.sections[0], [payload?.sections, section]);
  const activeTab = useMemo(() => activeSection?.tabs.find((item) => item.id === (tab || payload?.tab)) || activeSection?.tabs[0], [activeSection, payload?.tab, tab]);

  const load = async (nextSection = section, nextTab = tab, nextRole = role) => {
    setLoading(true);
    setError('');
    try {
      const url = `/api/hris/workforce-management?section=${encodeURIComponent(nextSection)}${nextTab ? `&tab=${encodeURIComponent(nextTab)}` : ''}`;
      const res = await fetch(url, { headers: { 'x-hris-role': nextRole }, cache: 'no-store' });
      const json = (await res.json()) as ApiResponse<Payload>;
      if (!res.ok || json.status !== 'success' || !json.data) throw new Error(json.error || `Workforce request failed (${res.status})`);
      setPayload(json.data);
      if (!nextTab) setTab(json.data.tab);
    } catch (event) {
      setError(event instanceof Error ? event.message : 'Unable to load Workforce Management');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(section, tab, role);
  }, [section, tab, role]);

  const chooseSection = (id: string) => {
    const next = payload?.sections.find((item) => item.id === id);
    setSection(id);
    setTab(next?.tabs[0]?.id || '');
  };

  const runAction = async (action: Action) => {
    if (action.id === 'view-audit-trail' || action.id === 'view-history') {
      setAuditOpen(true);
      return;
    }
    if (action.id === 'export') {
      window.open('/api/hris/workforce-management?format=csv', '_self');
      return;
    }
    setBusyAction(action.id);
    setToast('');
    try {
      const res = await fetch('/api/hris/workforce-management', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-hris-role': role },
        body: JSON.stringify({
          action: action.id,
          section,
          tab: activeTab?.id,
          actor: role,
          record: payload?.records[0]?.id || section,
          reason: action.requiresReason ? `${action.label} requested from Workforce Management` : undefined,
          comments: `${action.label} executed from ${activeSection?.label || section}`,
        }),
      });
      const json = (await res.json()) as ApiResponse<{ message: string; payload: Payload }>;
      if (!res.ok || json.status !== 'success' || !json.data) throw new Error(json.error || `${action.label} failed`);
      setToast(json.data.message);
      setPayload(json.data.payload);
    } catch (event) {
      setToast(event instanceof Error ? event.message : `${action.label} failed`);
    } finally {
      setBusyAction('');
    }
  };

  const filteredRecords = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (payload?.records || []).filter((item) => {
      const matchesSummary =
        !summaryFilter ||
        summaryFilter === 'employees' ||
        (summaryFilter === 'attendance' && ['present', 'remote', 'late', 'absent', 'on leave'].includes(item.attendanceStatus.toLowerCase())) ||
        (summaryFilter === 'timesheet-hours' && item.hoursWorked > 0) ||
        (summaryFilter === 'pending-approvals' && (item.approvalStatus.toLowerCase().includes('pending') || item.approvalStatus.toLowerCase().includes('review'))) ||
        (summaryFilter === 'payroll-ready' && (item.payrollStatus.toLowerCase().includes('ready') || item.payrollStatus.toLowerCase().includes('posted'))) ||
        (summaryFilter === 'productivity-exceptions' && item.exceptions.length > 0);
      const matchesQuery = !q || [item.employeeId, item.employeeName, item.department, item.location, item.site, item.shift, item.attendanceStatus, item.timeStatus, item.approvalStatus, item.payrollStatus, item.productivityStatus, item.exceptions.join(' ')].some((value) => String(value || '').toLowerCase().includes(q));
      return matchesSummary && matchesQuery;
    });
  }, [payload?.records, query, summaryFilter]);

  const applySummaryFilter = (next: SummaryFilter) => {
    setSummaryFilter(next);
    setQuery('');
  };

  const summaryFilterLabel = summaryFilter === 'employees'
    ? 'All employees'
    : summaryFilter === 'attendance'
      ? 'Attendance records'
      : summaryFilter === 'timesheet-hours'
        ? 'Employees with captured time'
        : summaryFilter === 'pending-approvals'
          ? 'Pending approval queue'
          : summaryFilter === 'payroll-ready'
            ? 'Payroll-ready employees'
            : summaryFilter === 'productivity-exceptions'
              ? 'Productivity and exception records'
              : '';

  return (
    <div className="min-h-screen bg-white">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-white"><Users className="h-6 w-6" /></span>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-950">Workforce Management</h1>
              <p className="mt-1 max-w-5xl text-sm font-semibold text-slate-600">Central hub for attendance, timesheets, approvals, corrections, overtime, payroll-ready hours, and workforce reports.</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-extrabold text-emerald-800">{payload?.source || 'Loading source'}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-extrabold text-slate-700">Loaded: {new Date(payload?.generatedAt || initialNow).toLocaleString('en-GB')}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={role} onChange={(event) => setRole(event.target.value as Role)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-800 outline-none">{roles.map((item) => <option key={item}>{item}</option>)}</select>
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-3 text-xs font-extrabold text-white hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60"><RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />{loading ? 'Refreshing' : 'Refresh'}</button>
          <button type="button" onClick={() => { window.open('/api/hris/workforce-management?format=csv', '_self'); }} disabled={!payload?.permissions.canExport} className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-3 text-xs font-extrabold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"><Download className="h-4 w-4" />Export</button>
        </div>
      </div>

      {error ? <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">{error}</div> : null}
      {toast ? <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800">{toast}</div> : null}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <MetricCard label="Employees" value={number(payload?.summary.totalEmployees)} detail="Directory-integrated workforce" icon={Users} tone="blue" onClick={() => applySummaryFilter('employees')} />
        <MetricCard label="Attendance Today" value={number(payload?.summary.presentToday)} detail={`${number(payload?.summary.lateToday)} late arrivals, ${number(payload?.summary.absentToday)} absences`} icon={CalendarCheck} tone="green" onClick={() => applySummaryFilter('attendance')} />
        <MetricCard label="Timesheet Hours" value={hours(payload?.summary.timesheetHours)} detail={`${hours(payload?.summary.overtimeHours)} overtime`} icon={Clock} tone="cyan" onClick={() => applySummaryFilter('timesheet-hours')} />
        <MetricCard label="Pending Approvals" value={number(payload?.summary.pendingApprovals)} detail="Workflow queue" icon={BadgeCheck} tone={(payload?.summary.pendingApprovals || 0) ? 'amber' : 'green'} onClick={() => applySummaryFilter('pending-approvals')} />
        <MetricCard label="Payroll Ready" value={hours(payload?.summary.payrollReadyHours)} detail="Approved workforce hours" icon={Banknote} tone="violet" onClick={() => applySummaryFilter('payroll-ready')} />
        <MetricCard label="Productivity" value={`${number(payload?.summary.productivityPct)}%`} detail={`${number(payload?.summary.attendanceExceptions)} exceptions`} icon={TrendingUp} tone={(payload?.summary.attendanceExceptions || 0) ? 'red' : 'green'} onClick={() => applySummaryFilter('productivity-exceptions')} />
      </div>

      {summaryFilter ? (
        <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase text-blue-700">Active KPI drill-down</p>
            <p className="mt-1 text-sm font-extrabold text-slate-900">{summaryFilterLabel}: {number(filteredRecords.length)} matching employees</p>
          </div>
          <button type="button" onClick={() => setSummaryFilter(null)} className="inline-flex h-9 items-center justify-center rounded-xl border border-blue-200 bg-white px-3 text-xs font-black text-blue-700 hover:bg-blue-100">Clear KPI Filter</button>
        </div>
      ) : null}

      <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-[300px_1fr]">
        <aside className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <p className="px-2 pb-2 text-xs font-black uppercase text-slate-500">Workforce Pages</p>
          <nav className="grid grid-cols-2 gap-1 xl:grid-cols-1" aria-label="Workforce Management pages">
            {(payload?.sections || []).map((item) => (
              <Link key={item.id} href={`/hris/workforce-management/${item.id}`} onClick={() => chooseSection(item.id)} className={`rounded-xl px-3 py-2 text-xs font-black transition-colors ${section === item.id ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-50'}`}>{item.label}</Link>
            ))}
          </nav>
          <div className="mt-4 border-t border-slate-100 pt-3">
            <p className="px-2 pb-2 text-xs font-black uppercase text-slate-500">Timesheet</p>
            <nav className="grid grid-cols-2 gap-1 xl:grid-cols-1" aria-label="Timesheet functions">
              {timesheetQuickLinks.map((item) => (
                <Link key={item.href} href={item.href} className="rounded-xl px-3 py-2 text-xs font-black text-slate-700 transition-colors hover:bg-blue-50 hover:text-blue-700">{item.label}</Link>
              ))}
            </nav>
          </div>
        </aside>

        <main className="min-w-0 space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-xl font-black text-slate-950">{activeSection?.label || 'Attendance'}</h2>
                <p className="mt-1 max-w-4xl text-sm font-semibold text-slate-600">{activeSection?.description}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(payload?.actions || []).map((item) => {
                  const Icon = actionIcon(item.id);
                  return <button key={item.id} type="button" onClick={() => void runAction(item)} disabled={busyAction === item.id} className={`inline-flex h-10 items-center gap-2 rounded-xl px-3 text-xs font-extrabold ${item.sensitive ? toneStyles.amber.button : toneStyles.blue.button} disabled:cursor-wait disabled:opacity-60`}><Icon className="h-4 w-4" />{busyAction === item.id ? 'Processing' : item.label}</button>;
                })}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {(activeSection?.tabs || []).map((item) => (
                <Link key={item.id} href={`/hris/workforce-management/${section}?tab=${item.id}`} onClick={() => setTab(item.id)} className={`rounded-xl px-3 py-2 text-xs font-black transition-colors ${activeTab?.id === item.id ? 'bg-slate-950 text-white' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>{item.label}</Link>
              ))}
            </div>
          </section>

          {section === 'time-tracking' ? (
            <TimeTrackingWorkspace payload={payload} rows={filteredRecords} query={query} setQuery={setQuery} />
          ) : section === 'shift-and-scheduling' ? (
            <ShiftSchedulingWorkspace payload={payload} role={role} onSaved={(message, nextPayload) => { setToast(message); setPayload(nextPayload); }} />
          ) : (
            <>
              <StatusPanel payload={payload} />
              {section === 'attendance' ? <AttendanceOperations payload={payload} /> : null}

              <ControlsPanel title={`${activeTab?.label || 'Selected'} Controls`} rows={activeTab?.controls || []} />

              <div className="relative">
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search employee, department, site, shift, attendance, approval, payroll..." className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 pr-10 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
                {query ? <button type="button" onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button> : null}
              </div>

              <RecordsTable rows={filteredRecords} />
            </>
          )}

        </main>
      </div>

      {auditOpen ? <AuditPanel rows={payload?.auditTrail || []} onClose={() => setAuditOpen(false)} /> : null}
    </div>
  );
}

function AttendanceOperations({ payload }: { payload: Payload | null }) {
  const rows = [
    { label: 'Valid Presence', value: payload?.summary.presentToday || 0, detail: 'Employees with valid attendance presence today', tone: 'green' as Tone, icon: CheckCircle2 },
    { label: 'Late Arrivals', value: payload?.summary.lateToday || 0, detail: 'Employees who arrived after scheduled start', tone: (payload?.summary.lateToday || 0) ? 'amber' as Tone : 'green' as Tone, icon: Clock },
    { label: 'Absences', value: payload?.summary.absentToday || 0, detail: 'Employees absent without a valid attendance transaction', tone: (payload?.summary.absentToday || 0) ? 'red' as Tone : 'green' as Tone, icon: XCircle },
    { label: 'Early Departures', value: payload?.summary.earlyDepartures || 0, detail: 'Employees who checked out before scheduled end', tone: (payload?.summary.earlyDepartures || 0) ? 'amber' as Tone : 'green' as Tone, icon: CalendarClock },
    { label: 'Missing Punches', value: payload?.summary.missingPunches || 0, detail: 'Missing clock-in or clock-out records', tone: (payload?.summary.missingPunches || 0) ? 'red' as Tone : 'green' as Tone, icon: AlertTriangle },
    { label: 'On Leave / Excused', value: payload?.summary.onLeaveToday || 0, detail: 'Approved leave or excused attendance status', tone: 'blue' as Tone, icon: ShieldCheck },
  ];
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-black text-slate-950">Attendance Operations</h3>
          <p className="mt-1 text-xs font-semibold text-slate-500">Daily attendance controls for presence, late arrivals, absences, early departures, missing punches, leave, and exceptions.</p>
        </div>
        <CalendarCheck className="h-5 w-5 text-blue-600" />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((item) => <MetricCard key={item.label} label={item.label} value={number(item.value)} detail={item.detail} icon={item.icon} tone={item.tone} />)}
      </div>
    </section>
  );
}

function ShiftSchedulingWorkspace({ payload, role, onSaved }: { payload: Payload | null; role: Role; onSaved: (message: string, payload: Payload) => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const records = payload?.records || [];
  const schedules = payload?.shiftSchedules || [];
  const employees = [...records].sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  const departments = Array.from(new Set(records.map((row) => row.department).filter(Boolean))).sort();
  const locations = Array.from(new Set(records.map((row) => (row.site || row.location || 'Unassigned')).filter(Boolean))).sort();
  const supervisors = Array.from(new Set(records.map((row) => row.employeeName).filter(Boolean))).sort();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'draft' | 'published'>('all');
  const [form, setForm] = useState({
    employeeId: employees[0]?.employeeId || '',
    shift: 'Day',
    startDate: today,
    endDate: today,
    scheduledStart: '08:00',
    scheduledEnd: '17:00',
    supervisor: '',
    notes: '',
    publish: false,
  });

  useEffect(() => {
    if (!form.employeeId && employees[0]?.employeeId) setForm((current) => ({ ...current, employeeId: employees[0].employeeId }));
  }, [employees.length]);

  const selectedEmployee = employees.find((item) => item.employeeId === form.employeeId) || employees[0];
  const visibleSchedules = schedules.filter((item) => filter === 'all' || item.status.toLowerCase() === filter);
  const draftCount = schedules.filter((item) => item.status === 'Draft').length;
  const publishedCount = schedules.filter((item) => item.status === 'Published').length;
  const scheduledEmployees = new Set(schedules.map((item) => item.employeeId)).size;
  const unscheduledEmployees = Math.max(records.length - scheduledEmployees, 0);
  const coverageRows = groupRows(schedules.map((item) => ({
    id: item.id,
    employeeId: item.employeeId,
    employeeName: item.employeeName,
    department: item.department,
    location: item.location,
    site: item.site,
    shift: item.shift,
    attendanceStatus: item.status,
    timeStatus: item.status,
    approvalStatus: item.status,
    payrollStatus: item.status,
    productivityStatus: item.status,
    hoursWorked: 1,
    overtimeHours: 0,
    timeIn: item.scheduledStart,
    timeOut: item.scheduledEnd,
    exceptions: [],
  })), (row) => row.shift).slice(0, 8);
  const departmentRows = groupRows(schedules.map((item) => ({
    id: item.id,
    employeeId: item.employeeId,
    employeeName: item.employeeName,
    department: item.department,
    location: item.location,
    site: item.site,
    shift: item.shift,
    attendanceStatus: item.status,
    timeStatus: item.status,
    approvalStatus: item.status,
    payrollStatus: item.status,
    productivityStatus: item.status,
    hoursWorked: 1,
    overtimeHours: 0,
    timeIn: item.scheduledStart,
    timeOut: item.scheduledEnd,
    exceptions: [],
  })), (row) => row.department).slice(0, 10);

  const submit = async (publish = form.publish) => {
    setSaving(true);
    setError('');
    try {
      if (!selectedEmployee) throw new Error('Select an employee before scheduling a shift.');
      const res = await fetch('/api/hris/workforce-management', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-hris-role': role },
        body: JSON.stringify({
          action: 'schedule-shift',
          section: 'shift-and-scheduling',
          tab: 'assignment',
          actor: role,
          record: selectedEmployee.employeeId,
          employeeId: selectedEmployee.employeeId,
          employeeName: selectedEmployee.employeeName,
          department: selectedEmployee.department,
          location: selectedEmployee.location,
          site: selectedEmployee.site,
          shift: form.shift,
          startDate: form.startDate,
          endDate: form.endDate,
          scheduledStart: form.scheduledStart,
          scheduledEnd: form.scheduledEnd,
          supervisor: form.supervisor || selectedEmployee.employeeName,
          notes: form.notes,
          publish,
          comments: `${publish ? 'Published' : 'Draft'} ${form.shift} shift scheduled for ${selectedEmployee.employeeName}`,
        }),
      });
      const json = (await res.json()) as ApiResponse<{ message: string; payload: Payload }>;
      if (!res.ok || json.status !== 'success' || !json.data) throw new Error(json.error || 'Unable to schedule shift.');
      onSaved(json.data.message, json.data.payload);
      setForm((current) => ({ ...current, notes: '', publish: false }));
    } catch (event) {
      setError(event instanceof Error ? event.message : 'Unable to schedule shift.');
    } finally {
      setSaving(false);
    }
  };

  const publishRoster = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/hris/workforce-management', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-hris-role': role },
        body: JSON.stringify({ action: 'publish-roster', section: 'shift-and-scheduling', tab: 'rosters', actor: role, record: 'shift-roster', comments: 'Roster published from Shift & Scheduling workspace' }),
      });
      const json = (await res.json()) as ApiResponse<{ message: string; payload: Payload }>;
      if (!res.ok || json.status !== 'success' || !json.data) throw new Error(json.error || 'Unable to publish roster.');
      onSaved(json.data.message, json.data.payload);
    } catch (event) {
      setError(event instanceof Error ? event.message : 'Unable to publish roster.');
    } finally {
      setSaving(false);
    }
  };

  const changeEmployee = (employeeId: string) => {
    const employee = employees.find((item) => item.employeeId === employeeId);
    setForm((current) => ({ ...current, employeeId, supervisor: employee?.employeeName || current.supervisor }));
  };

  return (
    <>
      <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-xl font-black text-slate-950">Shift & Scheduling Workspace</h2>
            <p className="mt-1 max-w-4xl text-sm font-semibold text-slate-600">Create shift assignments, publish rosters, monitor coverage by department/location, and keep scheduling activity auditable.</p>
          </div>
          <button type="button" onClick={publishRoster} disabled={saving || !draftCount} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-xs font-black text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500">
            <CalendarCheck className="h-4 w-4" /> Publish Draft Roster
          </button>
        </div>
        {error ? <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-800">{error}</div> : null}
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
          <MetricCard label="Employees" value={number(records.length)} detail="Available for scheduling" icon={Users} tone="blue" />
          <MetricCard label="Scheduled" value={number(scheduledEmployees)} detail={`${number(unscheduledEmployees)} unscheduled employees`} icon={CalendarClock} tone="green" />
          <MetricCard label="Draft Roster" value={number(draftCount)} detail="Awaiting publication" icon={ClipboardList} tone={draftCount ? 'amber' : 'green'} />
          <MetricCard label="Published" value={number(publishedCount)} detail="Visible to operations" icon={BadgeCheck} tone="violet" />
          <MetricCard label="Departments" value={number(departments.length)} detail={`${number(locations.length)} sites/locations`} icon={MapPin} tone="cyan" />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-black text-slate-950">Create Shift Assignment</h3>
              <p className="mt-1 text-xs font-semibold text-slate-500">Select employee, period, shift timing, supervisor, and save as draft or publish immediately.</p>
            </div>
            <CalendarClock className="h-5 w-5 text-blue-600" />
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <ShiftSelect label="Employee" value={form.employeeId} onChange={changeEmployee} options={employees.map((item) => ({ value: item.employeeId, label: `${item.employeeName} (${item.employeeId})` }))} />
            <ShiftSelect label="Shift Pattern" value={form.shift} onChange={(value) => setForm((current) => ({ ...current, shift: value }))} options={['Day', 'Night', 'Rotational', 'Weekend', 'Project', 'Emergency'].map((item) => ({ value: item, label: item }))} />
            <ShiftInput label="Start Date" type="date" value={form.startDate} onChange={(value) => setForm((current) => ({ ...current, startDate: value }))} />
            <ShiftInput label="End Date" type="date" value={form.endDate} onChange={(value) => setForm((current) => ({ ...current, endDate: value }))} />
            <ShiftInput label="Start Time" type="time" value={form.scheduledStart} onChange={(value) => setForm((current) => ({ ...current, scheduledStart: value }))} />
            <ShiftInput label="End Time" type="time" value={form.scheduledEnd} onChange={(value) => setForm((current) => ({ ...current, scheduledEnd: value }))} />
            <ShiftSelect label="Supervisor / Owner" value={form.supervisor} onChange={(value) => setForm((current) => ({ ...current, supervisor: value }))} options={[{ value: '', label: 'Use selected employee / unassigned' }, ...supervisors.slice(0, 250).map((item) => ({ value: item, label: item }))]} />
            <ShiftSelect label="Publish Mode" value={form.publish ? 'Publish' : 'Draft'} onChange={(value) => setForm((current) => ({ ...current, publish: value === 'Publish' }))} options={[{ value: 'Draft', label: 'Save as Draft' }, { value: 'Publish', label: 'Publish Immediately' }]} />
            <div className="md:col-span-2">
              <label className="text-[11px] font-black uppercase text-slate-500">Notes</label>
              <textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} className="mt-1 min-h-20 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" placeholder="Reason, coverage notes, roster instruction, handover note..." />
            </div>
          </div>
          {selectedEmployee ? (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-black uppercase text-slate-500">Selected employee context</p>
              <p className="mt-1 text-sm font-black text-slate-950">{selectedEmployee.employeeName}</p>
              <p className="mt-1 text-xs font-semibold text-slate-600">{selectedEmployee.department} / {selectedEmployee.site} / Current shift: {selectedEmployee.shift}</p>
            </div>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => void submit(false)} disabled={saving || !selectedEmployee} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-black text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"><Clock className="h-4 w-4" /> Save Draft</button>
            <button type="button" onClick={() => void submit(true)} disabled={saving || !selectedEmployee} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"><BadgeCheck className="h-4 w-4" /> Schedule & Publish</button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-base font-black text-slate-950">Shift Coverage</h3>
            <p className="mt-1 text-xs font-semibold text-slate-500">Published and draft assignments grouped by shift pattern.</p>
            <BarList rows={coverageRows} unit="employees" emptyText="No shift schedules created yet." tone="violet" />
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-base font-black text-slate-950">Department Coverage</h3>
            <p className="mt-1 text-xs font-semibold text-slate-500">Roster coverage by employee department.</p>
            <BarList rows={departmentRows} unit="employees" emptyText="No department coverage available yet." />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-base font-black text-slate-950">Shift Roster Register</h3>
            <p className="mt-1 text-xs font-semibold text-slate-500">Created schedules are stored in the HRIS workspace and remain independent of live biometric data.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(['all', 'draft', 'published'] as const).map((item) => <button key={item} type="button" onClick={() => setFilter(item)} className={`rounded-full px-3 py-1.5 text-xs font-black ${filter === item ? 'bg-slate-950 text-white' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>{item}</button>)}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1100px] w-full divide-y divide-slate-100">
            <thead className="bg-slate-50"><tr>{['Employee', 'Department / Site', 'Shift', 'Period', 'Time', 'Supervisor', 'Status', 'Notes'].map((header) => <th key={header} className="px-4 py-3 text-left text-xs font-black uppercase text-slate-500">{header}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {visibleSchedules.length ? visibleSchedules.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3"><p className="text-sm font-black text-slate-950">{item.employeeName}</p><p className="text-xs font-semibold text-slate-500">{item.employeeId}</p></td>
                  <td className="px-4 py-3"><p className="text-sm font-bold text-slate-800">{item.department}</p><p className="text-xs font-semibold text-slate-500">{item.site || item.location}</p></td>
                  <td className="px-4 py-3"><Chip value={item.shift} /></td>
                  <td className="px-4 py-3 text-xs font-bold text-slate-700">{item.startDate} to {item.endDate}</td>
                  <td className="px-4 py-3 text-xs font-black text-slate-900">{item.scheduledStart} - {item.scheduledEnd}</td>
                  <td className="px-4 py-3 text-xs font-bold text-slate-700">{item.supervisor}</td>
                  <td className="px-4 py-3"><Chip value={item.status} /></td>
                  <td className="px-4 py-3 text-xs font-semibold text-slate-600">{item.notes || '-'}</td>
                </tr>
              )) : <tr><td colSpan={8} className="px-4 py-10 text-center text-sm font-bold text-slate-500">No shift schedules found. Use Create Shift Assignment to schedule employees.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function ShiftInput({ label, value, type, onChange }: { label: string; value: string; type: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-[11px] font-black uppercase text-slate-500">{label}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
    </label>
  );
}

function ShiftSelect({ label, value, options, onChange }: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-[11px] font-black uppercase text-slate-500">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20">
        {options.map((item) => <option key={`${item.value}-${item.label}`} value={item.value}>{item.label}</option>)}
      </select>
    </label>
  );
}

function TimeTrackingWorkspace({ payload, rows, query, setQuery }: { payload: Payload | null; rows: RecordRow[]; query: string; setQuery: (value: string) => void }) {
  const [view, setView] = useState<'all' | 'exceptions' | 'pending' | 'payroll-ready' | 'no-time'>('all');
  const [drill, setDrill] = useState<{ type: 'department' | 'location' | 'status' | 'exception'; label: string } | null>(null);
  const sourceRows = payload?.records || [];
  const scopedRows = rows.filter((row) => {
    if (view === 'exceptions') return row.exceptions.length > 0;
    if (view === 'pending') return row.approvalStatus.toLowerCase().includes('pending') || row.approvalStatus.toLowerCase().includes('review');
    if (view === 'payroll-ready') return row.payrollStatus.toLowerCase().includes('ready') || row.payrollStatus.toLowerCase().includes('posted');
    if (view === 'no-time') return row.hoursWorked <= 0 || row.timeStatus.toLowerCase().includes('pending');
    return true;
  });
  const total = sourceRows.length;
  const present = sourceRows.filter((row) => ['present', 'remote'].includes(row.attendanceStatus.toLowerCase())).length;
  const captured = sourceRows.filter((row) => row.hoursWorked > 0 && !row.timeStatus.toLowerCase().includes('pending')).length;
  const pending = sourceRows.filter((row) => row.approvalStatus.toLowerCase().includes('pending') || row.approvalStatus.toLowerCase().includes('review')).length;
  const payrollReady = sourceRows.filter((row) => row.payrollStatus.toLowerCase().includes('ready') || row.payrollStatus.toLowerCase().includes('posted'));
  const exceptions = sourceRows.filter((row) => row.exceptions.length > 0);
  const departmentHours = groupRows(sourceRows, (row) => row.department, (row) => row.hoursWorked);
  const siteHours = groupRows(sourceRows, (row) => row.site || row.location, (row) => row.hoursWorked);
  const statusGroups = groupRows(sourceRows, (row) => row.timeStatus).slice(0, 6);
  const exceptionGroups = groupRows(exceptions.flatMap((row) => row.exceptions.map((exception) => ({ ...row, exception }))), (row) => (row as RecordRow & { exception: string }).exception).slice(0, 6);
  const readyHours = sumRows(payrollReady, (row) => row.hoursWorked);
  const totalHours = sumRows(sourceRows, (row) => row.hoursWorked);
  const overtimeHours = sumRows(sourceRows, (row) => row.overtimeHours);
  const readiness = pct(captured, total);
  const payrollPct = pct(payrollReady.length, total);

  const cards = [
    { id: 'all' as const, label: 'Workforce', value: number(total), detail: `${number(present)} present from attendance`, icon: Users, tone: 'blue' as Tone },
    { id: 'no-time' as const, label: 'Time Capture', value: `${readiness}%`, detail: `${number(captured)} captured, ${number(Math.max(total - captured, 0))} pending`, icon: Clock, tone: readiness >= 90 ? 'green' as Tone : readiness >= 60 ? 'amber' as Tone : 'red' as Tone },
    { id: 'pending' as const, label: 'Approval Queue', value: number(pending), detail: 'Supervisor / manager / HR review', icon: Route, tone: pending ? 'amber' as Tone : 'green' as Tone },
    { id: 'payroll-ready' as const, label: 'Payroll Ready', value: hours(readyHours), detail: `${payrollPct}% of workforce ready`, icon: Banknote, tone: payrollReady.length ? 'green' as Tone : 'amber' as Tone },
    { id: 'exceptions' as const, label: 'Exceptions', value: number(exceptions.length), detail: 'Missing time, variance, punch, workflow issues', icon: FileWarning, tone: exceptions.length ? 'red' as Tone : 'green' as Tone },
    { id: 'all' as const, label: 'Total Hours', value: hours(totalHours), detail: `${hours(overtimeHours)} overtime exposure`, icon: BarChart3, tone: 'violet' as Tone },
  ];
  const drillRows = sourceRows.filter((row) => {
    if (!drill) return false;
    if (drill.type === 'department') return row.department === drill.label;
    if (drill.type === 'location') return (row.site || row.location || 'Unassigned') === drill.label;
    if (drill.type === 'status') return row.timeStatus === drill.label;
    return row.exceptions.includes(drill.label);
  });
  const drillPresent = drillRows.filter((row) => ['present', 'remote'].includes(row.attendanceStatus.toLowerCase())).length;
  const drillPending = drillRows.filter((row) => row.timeStatus.toLowerCase().includes('pending')).length;
  const drillReady = drillRows.filter((row) => row.payrollStatus.toLowerCase().includes('ready') || row.payrollStatus.toLowerCase().includes('posted')).length;

  return (
    <>
      <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-xl font-black text-slate-950">Time Tracking Control Workspace</h2>
            <p className="mt-1 max-w-4xl text-sm font-semibold text-slate-600">Live attendance, timesheet capture, project allocation, approval status, payroll readiness, and exceptions in one operational view.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white px-3 py-1 text-xs font-extrabold text-slate-700">Source: {payload?.source || 'Loading'}</span>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-extrabold text-emerald-800">Real HRIS data</span>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {cards.map((card, index) => {
            const styles = toneStyles[card.tone];
            const active = view === card.id && index !== 5;
            const Icon = card.icon;
            return (
              <button key={`${card.label}-${index}`} type="button" onClick={() => setView(card.id)} className={`rounded-2xl border p-4 text-left shadow-sm transition ${styles.card} ${active ? 'ring-2 ring-blue-600' : 'hover:-translate-y-0.5 hover:shadow-md'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase text-slate-600">{card.label}</p>
                    <p className="mt-2 truncate text-2xl font-black text-slate-950">{card.value}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-600">{card.detail}</p>
                  </div>
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${styles.icon}`}><Icon className="h-5 w-5" /></span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-[1.5fr_1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-black text-slate-950">Hours by Department</h3>
              <p className="mt-1 text-xs font-semibold text-slate-500">Timesheet hours grouped by HRIS department from current workforce records.</p>
            </div>
            <BriefcaseBusiness className="h-5 w-5 text-blue-600" />
          </div>
          <BarList rows={departmentHours} unit="hrs" emptyText="No department time has been captured yet." onSelect={(label) => setDrill({ type: 'department', label })} activeLabel={drill?.type === 'department' ? drill.label : undefined} maxHeight="max-h-96" />
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-black text-slate-950">Time Status Mix</h3>
              <p className="mt-1 text-xs font-semibold text-slate-500">Capture and workflow status at a glance.</p>
            </div>
            <ClipboardList className="h-5 w-5 text-violet-600" />
          </div>
          <BarList rows={statusGroups} unit="records" emptyText="No time status records available." tone="violet" onSelect={(label) => setDrill({ type: 'status', label })} activeLabel={drill?.type === 'status' ? drill.label : undefined} />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-black text-slate-950">Location / Site Allocation</h3>
              <p className="mt-1 text-xs font-semibold text-slate-500">Hours by site, work location, or project site.</p>
            </div>
            <MapPin className="h-5 w-5 text-cyan-600" />
          </div>
          <BarList rows={siteHours} unit="hrs" emptyText="No site allocation hours are available." tone="cyan" onSelect={(label) => setDrill({ type: 'location', label })} activeLabel={drill?.type === 'location' ? drill.label : undefined} maxHeight="max-h-96" />
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-black text-slate-950">Exception Breakdown</h3>
              <p className="mt-1 text-xs font-semibold text-slate-500">Issues to resolve before payroll posting and approval lock.</p>
            </div>
            <AlertTriangle className="h-5 w-5 text-red-600" />
          </div>
          <BarList rows={exceptionGroups} unit="records" emptyText="No time tracking exceptions found." tone="red" onSelect={(label) => setDrill({ type: 'exception', label })} activeLabel={drill?.type === 'exception' ? drill.label : undefined} />
        </div>
      </section>

      {drill ? (
        <section className="rounded-2xl border border-blue-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase text-blue-700">{drill.type} drill-down</p>
              <h3 className="mt-1 text-lg font-black text-slate-950">{drill.label}</h3>
              <p className="mt-1 text-xs font-semibold text-slate-500">Employees matching the selected chart row, with attendance and payroll readiness.</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <MiniStat label="Employees" value={number(drillRows.length)} />
              <MiniStat label="Present" value={number(drillPresent)} tone="green" />
              <MiniStat label="Pending Time" value={number(drillPending)} tone={drillPending ? 'amber' : 'green'} />
              <MiniStat label="Payroll Ready" value={number(drillReady)} tone="violet" />
            </div>
            <button type="button" onClick={() => setDrill(null)} className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-700 hover:bg-slate-50">Clear</button>
          </div>
          <TimeTrackingTable rows={drillRows} />
        </section>
      ) : null}

      <TimesheetAccess />

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-base font-black text-slate-950">Employee Time Tracking Register</h3>
              <p className="mt-1 text-xs font-semibold text-slate-500">Click KPI cards above to filter this register. Records come from HRIS employees, live attendance, and saved timesheet transactions.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {(['all', 'no-time', 'pending', 'payroll-ready', 'exceptions'] as const).map((item) => (
                <button key={item} type="button" onClick={() => setView(item)} className={`rounded-full px-3 py-1.5 text-xs font-black ${view === item ? 'bg-slate-950 text-white' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>{item.replace('-', ' ')}</button>
              ))}
            </div>
          </div>
          <div className="relative mt-4">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search employee, department, site, attendance, time status, approval, payroll..." className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 pr-10 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
            {query ? <button type="button" onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button> : null}
          </div>
        </div>
        <TimeTrackingTable rows={scopedRows} />
      </section>
    </>
  );
}

function MiniStat({ label, value, tone = 'blue' }: { label: string; value: string; tone?: Tone }) {
  const styles = toneStyles[tone];
  return (
    <div className={`rounded-xl border px-3 py-2 ${styles.card}`}>
      <p className="text-[10px] font-black uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-black text-slate-950">{value}</p>
    </div>
  );
}

function BarList({ rows, unit, emptyText, tone = 'blue', onSelect, activeLabel, maxHeight }: { rows: Array<{ label: string; total: number }>; unit: string; emptyText: string; tone?: Tone; onSelect?: (label: string) => void; activeLabel?: string; maxHeight?: string }) {
  const max = Math.max(...rows.map((row) => row.total), 0);
  const color = tone === 'red' ? 'bg-red-600' : tone === 'violet' ? 'bg-violet-600' : tone === 'cyan' ? 'bg-cyan-600' : 'bg-blue-600';
  if (!rows.length || max <= 0) return <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-500">{emptyText}</div>;
  return (
    <div className={`mt-4 space-y-3 ${maxHeight ? `${maxHeight} overflow-y-auto pr-1` : ''}`}>
      {rows.map((row) => (
        <button key={row.label} type="button" onClick={() => onSelect?.(row.label)} className={`block w-full rounded-xl p-1 text-left transition ${onSelect ? 'hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30' : ''} ${activeLabel === row.label ? 'bg-blue-50 ring-2 ring-blue-500/30' : ''}`}>
          <div className="mb-1 flex items-center justify-between gap-3">
            <span className="truncate text-xs font-black text-slate-700">{row.label}</span>
            <span className="shrink-0 text-xs font-black text-slate-950">{compactNumber(row.total)} {unit}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(4, Math.round((row.total / max) * 100))}%` }} />
          </div>
        </button>
      ))}
    </div>
  );
}

function TimeTrackingTable({ rows }: { rows: RecordRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-[1180px] w-full divide-y divide-slate-100">
        <thead className="bg-slate-50"><tr>{['Employee', 'Department', 'Site', 'In / Out', 'Attendance', 'Time Status', 'Approval', 'Payroll', 'Hours', 'OT', 'Issues'].map((header) => <th key={header} className="px-4 py-3 text-left text-xs font-black uppercase text-slate-500">{header}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.length ? rows.map((item) => (
            <tr key={item.id} className="hover:bg-slate-50">
              <td className="px-4 py-3"><div className="font-black text-slate-950">{item.employeeName}</div><div className="text-xs font-semibold text-slate-500">{item.employeeId}</div></td>
              <td className="px-4 py-3 text-sm font-bold text-slate-700">{item.department}</td>
              <td className="px-4 py-3"><div className="text-sm font-bold text-slate-700">{item.site}</div><div className="text-xs font-semibold text-slate-500">{item.location}</div></td>
              <td className="px-4 py-3">
                <div className="text-xs font-black text-slate-900">IN: {item.timeIn || '-'}</div>
                <div className="mt-1 text-xs font-black text-slate-500">OUT: {item.timeOut || '-'}</div>
              </td>
              <td className="px-4 py-3"><Chip value={item.attendanceStatus} /></td>
              <td className="px-4 py-3"><Chip value={item.timeStatus} /></td>
              <td className="px-4 py-3"><Chip value={item.approvalStatus} /></td>
              <td className="px-4 py-3"><Chip value={item.payrollStatus} /></td>
              <td className="px-4 py-3 text-sm font-black text-slate-900">{hours(item.hoursWorked)}</td>
              <td className="px-4 py-3 text-sm font-bold text-slate-700">{hours(item.overtimeHours)}</td>
              <td className="px-4 py-3 text-xs font-semibold text-slate-600">{item.exceptions.length ? item.exceptions.join(', ') : 'None'}</td>
            </tr>
          )) : (
            <tr><td colSpan={11} className="px-4 py-10 text-center text-sm font-bold text-slate-500">No time tracking records match the selected filters.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function TimesheetAccess() {
  const details = new Map([
    ['Timesheet Entry', 'Create, edit, save draft, submit, validate, and reopen timesheets.'],
    ['Timesheet Approval', 'Supervisor, project manager, HR, and payroll approval workflow.'],
    ['Timesheet Period', 'Open the current month period from the 16th of the previous month to the 15th of the current month.'],
    ['Timesheet Reports', 'Summary, employee, project, payroll hours, and reconciliation reports.'],
  ]);
  return (
    <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-black text-slate-950">Timesheet Workbench</h3>
          <p className="mt-1 text-xs font-semibold text-slate-600">Existing detailed timesheet screens remain active and are now linked from Workforce Management.</p>
        </div>
        <Clock className="h-5 w-5 text-blue-700" />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {timesheetQuickLinks.map((item) => (
          <Link key={item.href} href={item.href} className="rounded-xl border border-blue-200 bg-white p-3 transition-colors hover:bg-blue-50">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-black text-slate-950">{item.label}</p>
              <ExternalLink className="h-4 w-4 text-blue-700" />
            </div>
            <p className="mt-2 text-xs font-semibold text-slate-600">{details.get(item.label)}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}

function StatusPanel({ payload }: { payload: Payload | null }) {
  const rows = [
    ['Workforce status', payload?.current.workforceStatus || 'Loading'],
    ['Available actions', payload?.current.availableActions.join(', ') || 'Loading'],
    ['Next required action', payload?.current.nextRequiredAction || 'Loading'],
    ['Approval status', payload?.current.approvalStatus || 'Loading'],
    ['Compliance status', payload?.current.complianceStatus || 'Loading'],
    ['Payroll impact', payload?.current.payrollImpact || 'Loading'],
    ['Audit history', payload?.current.auditHistory || 'Loading'],
    ['Workflow progress', payload?.current.workflowProgress || 'Loading'],
  ];
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3"><div><h2 className="text-base font-black text-slate-950">Operational Status</h2><p className="mt-1 text-xs font-semibold text-slate-500">Centralized status, workflow, compliance, payroll impact, audit, and exceptions across attendance and time operations.</p></div><ShieldCheck className="h-5 w-5 text-blue-600" /></div>
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">{rows.map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-[11px] font-black uppercase text-slate-500">{label}</p><p className="mt-1 line-clamp-2 text-xs font-extrabold text-slate-900">{value}</p></div>)}</div>
      {payload?.current.exceptionIndicators.length ? <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3"><p className="text-xs font-black uppercase text-red-800">Exception Indicators</p><div className="mt-2 flex flex-wrap gap-2">{payload.current.exceptionIndicators.map((item, index) => <span key={`${item}-${index}`} className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-800">{item}</span>)}</div></div> : null}
    </section>
  );
}

function RecordsTable({ rows }: { rows: RecordRow[] }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-4"><h3 className="text-base font-black text-slate-950">Workforce Operations Register</h3><p className="mt-1 text-xs font-semibold text-slate-500">Unified attendance, time, approval, payroll, productivity, shift, site, and exception posture.</p></div>
      <div className="overflow-x-auto">
        <table className="min-w-[1220px] w-full divide-y divide-slate-100">
          <thead className="bg-slate-50"><tr>{['Employee', 'Location / Site', 'Shift', 'Attendance', 'Time', 'Approval', 'Payroll', 'Hours', 'Overtime', 'Productivity', 'Exceptions'].map((header) => <th key={header} className="px-4 py-3 text-left text-xs font-black uppercase text-slate-500">{header}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {rows.map((item) => (
              <tr key={item.id} className="hover:bg-slate-50">
                <td className="px-4 py-3"><div className="font-black text-slate-950">{item.employeeName}</div><div className="text-xs font-semibold text-slate-500">{item.employeeId} - {item.department}</div></td>
                <td className="px-4 py-3"><div className="text-sm font-bold text-slate-700">{item.location}</div><div className="text-xs font-semibold text-slate-500">{item.site}</div></td>
                <td className="px-4 py-3 text-sm font-bold text-slate-700">{item.shift}</td>
                <td className="px-4 py-3"><Chip value={item.attendanceStatus} /></td>
                <td className="px-4 py-3"><Chip value={item.timeStatus} /></td>
                <td className="px-4 py-3"><Chip value={item.approvalStatus} /></td>
                <td className="px-4 py-3"><Chip value={item.payrollStatus} /></td>
                <td className="px-4 py-3 text-sm font-black text-slate-900">{hours(item.hoursWorked)}</td>
                <td className="px-4 py-3 text-sm font-bold text-slate-700">{hours(item.overtimeHours)}</td>
                <td className="px-4 py-3"><Chip value={item.productivityStatus} /></td>
                <td className="px-4 py-3 text-xs font-semibold text-slate-600">{item.exceptions.length ? item.exceptions.join(', ') : 'None'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ControlsPanel({ title, rows }: { title: string; rows: string[] }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3"><h3 className="text-base font-black text-slate-950">{title}</h3><ShieldCheck className="h-5 w-5 text-slate-400" /></div>
      <div className="mt-4 flex flex-wrap gap-2">
        {rows.map((row) => <span key={row} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700">{row}</span>)}
      </div>
    </section>
  );
}

function Chip({ value }: { value: string }) {
  const styles = toneStyles[statusTone(value)];
  return <span className={`rounded-full px-2.5 py-1 text-xs font-black ${styles.chip}`}>{value}</span>;
}

function AuditPanel({ rows, onClose }: { rows: AuditEntry[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="max-h-[86vh] w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 p-4"><div><h3 className="text-lg font-black text-slate-950">Workforce Audit Trail</h3><p className="mt-1 text-xs font-semibold text-slate-500">Attendance, time, shift, overtime, approval, correction, payroll, security, and activity logs.</p></div><button type="button" onClick={onClose} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"><X className="h-4 w-4" /></button></div>
        <div className="max-h-[65vh] overflow-y-auto p-4"><div className="space-y-3">{rows.length ? rows.map((item) => <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-black text-slate-950">{item.action} - {item.record}</p><span className="text-xs font-bold text-slate-500">{new Date(item.at).toLocaleString('en-GB')}</span></div><p className="mt-1 text-xs font-semibold text-slate-600">{item.user} / {item.role}</p><p className="mt-2 text-xs font-semibold text-slate-700">{item.newValue || item.comments || 'Action logged'}</p>{item.reason ? <p className="mt-1 text-xs font-bold text-amber-700">Reason: {item.reason}</p> : null}</div>) : <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-500">No workforce audit actions have been logged in this session yet.</div>}</div></div>
      </div>
    </div>
  );
}
