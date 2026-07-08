'use client';

/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  Banknote,
  CalendarDays,
  CheckCircle2,
  Download,
  FileCheck2,
  Filter,
  Lock,
  Play,
  RefreshCcw,
  Search,
  Send,
  ShieldCheck,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { currencyCode, formatPayrollMoney, resolvePayCurrency } from '@/lib/payroll-currency';

type Role = 'Super Admin' | 'HR Director' | 'HR Manager' | 'Payroll Officer' | 'Finance Controller' | 'Executive Management' | 'Auditor' | 'Employee';
type Tone = 'blue' | 'green' | 'amber' | 'red' | 'violet' | 'cyan' | 'slate';
type RunStatus = 'Draft' | 'Calculated' | 'Submitted' | 'Finance Approved' | 'HR Approved' | 'Locked' | 'Posted' | 'Rejected';
type RecordStatus = 'Ready' | 'Review' | 'Blocked';

type PayrollRecord = {
  recordKey: string;
  employeeId: string;
  employeeCode: string;
  fullName: string;
  department: string;
  businessUnit: string;
  location: string;
  employmentType: string;
  employmentStatus: string;
  payrollGroup: string;
  salaryGrade: string;
  payCurrency: string;
  paymentRun: string;
  basePay: number | null;
  allowances: number | null;
  grossPay: number | null;
  paye: number | null;
  pensionEmployee: number | null;
  pensionEmployer: number | null;
  statutoryEmployee: number | null;
  statutoryEmployer: number | null;
  loanRecovery: number | null;
  totalDeductions: number | null;
  netPay: number | null;
  employerCost: number | null;
  deductionRatio: number | null;
  sageActual: null | {
    employeeCode: string;
    directoryEmployeeCode: string;
    employeePayPeriodId: number;
    lastCalcDate: string | null;
    grossPay: number | null;
    taxablePay: number | null;
    paye: number | null;
    pensionEmployee: number | null;
    totalDeductions: number | null;
    netPay: number | null;
  };
  discrepancies: {
    status: 'Matched' | 'Variance' | 'Missing Sage';
    grossVariance: number | null;
    netVariance: number | null;
    deductionVariance: number | null;
  };
  status: RecordStatus;
  issues: string[];
};

type PayrollRun = {
  id: string;
  period: string;
  periodLabel: string;
  status: RunStatus;
  employeeCount: number;
  grossPay: number;
  netPay: number;
  totalDeductions: number;
  employerCost: number;
  exceptionCount: number;
  createdAt: string;
  createdBy: Role;
  updatedAt: string;
  updatedBy: Role;
  audit: Array<{ at: string; actor: Role; action: string; from?: RunStatus; to?: RunStatus; note?: string }>;
};

type PayrollPeriodOption = {
  period: string;
  periodLabel: string;
  status: RunStatus;
  employeeCount: number;
  netPay: number;
};

type Payload = {
  generatedAt: string;
  source: string;
  dataSource?: { source: string; databaseAvailable: boolean; warning: string | null; employeeCount: number };
  period: string;
  periodLabel: string;
  role: Role;
  permissions: {
    canViewMoney: boolean;
    canCalculate: boolean;
    canSubmit: boolean;
    canApproveFinance: boolean;
    canApproveHr: boolean;
    canLock: boolean;
    canExport: boolean;
  };
  run: PayrollRun | null;
  runs: PayrollRun[];
  availablePeriods: PayrollPeriodOption[];
  configurations: Record<string, { id: string; name: string; effectiveFrom: string }>;
  summary: {
    employees: number;
    basePay: number | null;
    allowances: number | null;
    grossPay: number | null;
    totalDeductions: number | null;
    netPay: number | null;
    employerCost: number | null;
    sageGrossPay: number | null;
    sageNetPay: number | null;
    grossVariance: number | null;
    netVariance: number | null;
    discrepancyCount: number;
    ready: number;
    review: number;
    blocked: number;
    exceptionCount: number;
    averageDeductionRatio: number | null;
  };
  records: PayrollRecord[];
  breakdowns: {
    byPayrollGroup: Array<{ label: string; employees: number; grossPay: number | null; netPay: number | null; exceptions: number }>;
    byComponent: Array<{ id: string; label: string; amount: number; tone: Tone; payer: 'Employee' | 'Employer' | 'Both' }>;
  };
  controls: Array<{ id: string; label: string; status: string; detail: string; tone: Tone }>;
  enterpriseSourceActive?: boolean;
  toleranceMode?: boolean;
};

type ApiResponse<T> = { status: 'success' | 'error'; data?: T; error?: string };

const numberFmt = new Intl.NumberFormat('en-GB');
const recordCurrency = (record: Pick<PayrollRecord, 'payCurrency' | 'payrollGroup' | 'salaryGrade' | 'businessUnit'>) =>
  resolvePayCurrency({
    payCurrency: record.payCurrency,
    payrollGroup: record.payrollGroup,
    salaryGrade: record.salaryGrade,
    businessUnit: record.businessUnit,
  });
const money = (value: number | null | undefined, allowed = true, currency = 'NGN') => {
  if (!allowed || value === null || value === undefined) return 'Restricted';
  const code = currencyCode(currency);
  return formatPayrollMoney(value, code, { maximumFractionDigits: code === 'USD' ? 2 : 0 });
};
const number = (value: number | null | undefined) => numberFmt.format(Number(value || 0));

const toneStyles: Record<Tone, { card: string; icon: string; chip: string; bar: string; text: string }> = {
  blue: { card: 'bg-blue-50 border-blue-200', icon: 'bg-blue-600 text-white', chip: 'bg-blue-100 text-blue-800', bar: 'bg-blue-600', text: 'text-blue-800' },
  green: { card: 'bg-emerald-50 border-emerald-200', icon: 'bg-emerald-600 text-white', chip: 'bg-emerald-100 text-emerald-800', bar: 'bg-emerald-600', text: 'text-emerald-800' },
  amber: { card: 'bg-amber-50 border-amber-200', icon: 'bg-amber-500 text-white', chip: 'bg-amber-100 text-amber-800', bar: 'bg-amber-500', text: 'text-amber-800' },
  red: { card: 'bg-red-50 border-red-200', icon: 'bg-red-600 text-white', chip: 'bg-red-100 text-red-800', bar: 'bg-red-600', text: 'text-red-800' },
  violet: { card: 'bg-violet-50 border-violet-200', icon: 'bg-violet-600 text-white', chip: 'bg-violet-100 text-violet-800', bar: 'bg-violet-600', text: 'text-violet-800' },
  cyan: { card: 'bg-cyan-50 border-cyan-200', icon: 'bg-cyan-600 text-white', chip: 'bg-cyan-100 text-cyan-800', bar: 'bg-cyan-600', text: 'text-cyan-800' },
  slate: { card: 'bg-slate-50 border-slate-200', icon: 'bg-slate-800 text-white', chip: 'bg-slate-100 text-slate-800', bar: 'bg-slate-700', text: 'text-slate-800' },
};

const statusTone = (status: string): Tone => (status === 'Ready' || status === 'Passed' || status === 'Posted' || status === 'Locked' ? 'green' : status === 'Blocked' || status === 'Rejected' || status === 'Blocked Items' ? 'red' : status === 'Review' ? 'amber' : 'violet');

function MetricCard({ label, value, detail, icon: Icon, tone }: { label: string; value: string; detail: string; icon: any; tone: Tone }) {
  const styles = toneStyles[tone];
  return (
    <div className={`relative overflow-hidden rounded-2xl border p-4 sm:p-5 ${styles.card}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-normal text-slate-600">{label}</p>
          <p className="mt-2 truncate text-2xl font-black text-slate-950">{value}</p>
          <p className="mt-1 line-clamp-2 text-xs font-semibold text-slate-600">{detail}</p>
        </div>
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${styles.icon}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <div className={`absolute bottom-0 left-0 h-1 w-full ${styles.bar}`} />
    </div>
  );
}

function PayrollProcessingClient({ initialNow }: { initialNow: string }) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [sessionRole, setSessionRole] = useState<Role>('Payroll Officer');
  const [period, setPeriod] = useState('');
  const [periodQuery, setPeriodQuery] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('All');
  const [group, setGroup] = useState('All');
  const [tab, setTab] = useState<'lines' | 'controls' | 'components' | 'history'>('lines');
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const load = async (targetPeriod = period) => {
    setLoading(true);
    setError('');
    try {
      const suffix = targetPeriod ? `?period=${encodeURIComponent(targetPeriod)}` : '';
      const res = await fetch(`/api/hris/payroll/payroll-processing${suffix}`, { cache: 'no-store' });
      const json = (await res.json()) as ApiResponse<Payload>;
      if (!res.ok || json.status !== 'success' || !json.data) throw new Error(json.error || `Payroll processing request failed (${res.status})`);
      setPayload(json.data);
      setSessionRole(json.data.role);
      setPeriod(json.data.period);
    } catch (event) {
      setError(event instanceof Error ? event.message : 'Unable to load payroll processing');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetch('/api/auth/me', { cache: 'no-store' })
      .then((res) => res.json())
      .then((json) => {
        if (json?.data?.roles?.length) {
          const rolesText = json.data.roles.join(' ');
          if (/super administrator|global super|super admin/i.test(rolesText)) setSessionRole('Super Admin');
          else if (/finance controller/i.test(rolesText)) setSessionRole('Finance Controller');
          else if (/hr director/i.test(rolesText)) setSessionRole('HR Director');
          else if (/hr manager/i.test(rolesText)) setSessionRole('HR Manager');
          else if (/auditor/i.test(rolesText)) setSessionRole('Auditor');
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    void load(period);
  }, []);

  const canViewMoney = Boolean(payload?.permissions.canViewMoney);
  const lastLoaded = payload?.generatedAt || initialNow;
  const runStatus = payload?.run?.status || 'Draft';
  const groups = useMemo(() => ['All', ...Array.from(new Set((payload?.records || []).map((record) => record.payrollGroup || 'Unassigned'))).sort()], [payload?.records]);
  const periodOptions = useMemo(() => {
    const q = periodQuery.trim().toLowerCase();
    return (payload?.availablePeriods || []).filter((item) => {
      if (!q) return true;
      return [item.period, item.periodLabel, item.status].some((value) => String(value || '').toLowerCase().includes(q));
    });
  }, [payload?.availablePeriods, periodQuery]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (payload?.records || []).filter((record) => {
      if (status !== 'All' && record.status !== status) return false;
      if (group !== 'All' && record.payrollGroup !== group) return false;
      if (!q) return true;
      return [record.employeeId, record.fullName, record.department, record.businessUnit, record.location, record.payrollGroup, record.salaryGrade].some((item) => String(item || '').toLowerCase().includes(q));
    });
  }, [group, payload?.records, query, status]);

  const runAction = async (action: string) => {
    setPosting(action);
    setToast('');
    try {
      const res = await fetch('/api/hris/payroll/payroll-processing', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, period, note: `Payroll ${action} from processing console` }),
      });
      const json = (await res.json()) as ApiResponse<{ run: PayrollRun }>;
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Unable to update payroll run');
      setToast(`Payroll run moved to ${json.data?.run.status || 'updated'}.`);
      await load(period);
    } catch (event) {
      setToast(event instanceof Error ? event.message : 'Unable to update payroll run');
    } finally {
      setPosting('');
    }
  };

  const exportCsv = () => {
    window.location.href = `/api/hris/payroll/payroll-processing?period=${encodeURIComponent(period)}&format=csv`;
  };

  const actionButtons = [
    { action: 'calculate', label: 'Calculate', icon: Play, enabled: payload?.permissions.canCalculate },
    { action: 'submit', label: 'Submit', icon: Send, enabled: payload?.permissions.canSubmit },
    { action: 'finance-approve', label: 'Finance Approve', icon: FileCheck2, enabled: payload?.permissions.canApproveFinance },
    { action: 'hr-approve', label: 'HR Approve', icon: ShieldCheck, enabled: payload?.permissions.canApproveHr },
    { action: 'lock', label: 'Lock', icon: Lock, enabled: payload?.permissions.canLock },
    { action: 'post', label: 'Post', icon: CheckCircle2, enabled: payload?.permissions.canLock },
  ];

  return (
    <div className="min-h-screen bg-white">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-white">
              <Wallet className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-950">Payroll Processing</h1>
              <p className="mt-1 max-w-5xl text-sm font-semibold text-slate-600">
                End-to-end payroll run control for gross-to-net calculation, statutory deductions, exception gates, approvals, locking, posting, and audit-ready export.
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-extrabold text-blue-800">Period: {payload?.periodLabel || 'Loading'}</span>
            <span className={`rounded-full px-3 py-1 text-xs font-extrabold ${toneStyles[statusTone(runStatus)].chip}`}>Run: {runStatus}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-extrabold text-slate-700">Loaded: {new Date(lastLoaded).toLocaleString('en-GB')}</span>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-extrabold text-emerald-800">Source: {payload?.dataSource?.source || 'Loading'}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={periodQuery}
                onChange={(event) => setPeriodQuery(event.target.value)}
                placeholder="Search period"
                className="h-10 w-40 rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs font-extrabold text-slate-800 outline-none"
              />
            </div>
            <select
              value={period}
              onChange={(event) => {
                const nextPeriod = event.target.value;
                setPeriod(nextPeriod);
                void load(nextPeriod);
              }}
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-800 outline-none"
            >
              {periodOptions.map((item) => (
                <option key={item.period} value={item.period}>{item.periodLabel} - {item.status}</option>
              ))}
              {!periodOptions.some((item) => item.period === period) && period ? <option value={period}>{period}</option> : null}
            </select>
            <input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-800 outline-none" />
          </div>
          <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-extrabold text-violet-800">Role: {payload?.role || sessionRole}</span>
          <button type="button" onClick={() => void load(period)} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-3 text-xs font-extrabold text-white hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60">
            <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button type="button" onClick={exportCsv} disabled={!payload?.permissions.canExport} className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-3 text-xs font-extrabold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400">
            <Download className="h-4 w-4" />
            Export
          </button>
        </div>
      </div>

      {error && <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">{error}</div>}
      {toast && <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800">{toast}</div>}
      {payload?.dataSource?.warning && <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">{payload.dataSource.warning}</div>}
      {payload?.enterpriseSourceActive ? (
        <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-900">
          June 2026 onward: payroll for {payload.periodLabel} is calculated and stored 100% in DLE_Enterprise. Sage is not used for validation or payslips.
        </div>
      ) : null}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Gross Pay" value={money(payload?.summary.grossPay, canViewMoney)} detail={`${number(payload?.summary.employees)} employees in payroll scope`} icon={Banknote} tone="blue" />
        <MetricCard label="Total Deductions" value={money(payload?.summary.totalDeductions, canViewMoney)} detail={`${number(payload?.summary.averageDeductionRatio)}% average deduction ratio`} icon={Filter} tone="amber" />
        <MetricCard label="Net Pay" value={money(payload?.summary.netPay, canViewMoney)} detail="Bank payment schedule amount" icon={Wallet} tone="green" />
        <MetricCard label="Employer Cost" value={money(payload?.summary.employerCost, canViewMoney)} detail="Gross pay plus employer statutory cost" icon={Users} tone="violet" />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        <MetricCard label="Ready Lines" value={number(payload?.summary.ready)} detail="No blocking exceptions detected" icon={BadgeCheck} tone="green" />
        <MetricCard label="Review Lines" value={number(payload?.summary.review)} detail="Require payroll or compliance review" icon={AlertTriangle} tone="amber" />
        <MetricCard label="Blocked Lines" value={number(payload?.summary.blocked)} detail={`${number(payload?.summary.exceptionCount)} total exception flags`} icon={ShieldCheck} tone={(payload?.summary.blocked || 0) > 0 ? 'red' : 'green'} />
      </div>
      {!payload?.enterpriseSourceActive ? (
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          <MetricCard label="Sage Gross" value={money(payload?.summary.sageGrossPay, canViewMoney)} detail="Actual Sage gross for selected period" icon={FileCheck2} tone="cyan" />
          <MetricCard label="Gross Variance" value={money(payload?.summary.grossVariance, canViewMoney)} detail="Generated gross minus Sage gross" icon={AlertTriangle} tone={(payload?.summary.discrepancyCount || 0) > 0 ? 'amber' : 'green'} />
          <MetricCard label="Discrepancies" value={number(payload?.summary.discrepancyCount)} detail="Generated payroll lines requiring review against Sage" icon={ShieldCheck} tone={(payload?.summary.discrepancyCount || 0) > 0 ? 'amber' : 'green'} />
        </div>
      ) : null}

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-black uppercase tracking-normal text-slate-900">Run Workflow</h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">Actions are permission-controlled and blocked when payroll lines have unresolved blocking exceptions.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {actionButtons.map(({ action, label, icon: Icon, enabled }) => (
              <button key={action} type="button" onClick={() => void runAction(action)} disabled={!enabled || posting === action || loading} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-slate-950 px-3 text-xs font-extrabold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400">
                <Icon className={`h-4 w-4 ${posting === action ? 'animate-spin' : ''}`} />
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-black uppercase tracking-normal text-slate-900">Control Gates</h2>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            {(payload?.controls || []).map((control) => {
              const styles = toneStyles[control.tone];
              return (
                <div key={control.id} className={`rounded-2xl border p-4 ${styles.card}`}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-black text-slate-950">{control.label}</p>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${styles.chip}`}>{control.status}</span>
                  </div>
                  <p className="mt-2 text-xs font-semibold text-slate-600">{control.detail}</p>
                </div>
              );
            })}
          </div>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-black uppercase tracking-normal text-slate-900">Active Configurations</h2>
          <div className="mt-4 space-y-3">
            {Object.entries(payload?.configurations || {}).map(([key, config]) => (
              <div key={key} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                <p className="text-xs font-black uppercase tracking-normal text-slate-500">{key}</p>
                <p className="mt-1 text-sm font-black text-slate-950">{config.name}</p>
                <p className="text-xs font-semibold text-slate-500">Effective {config.effectiveFrom}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {[
          ['lines', 'Payroll Lines'],
          ['components', 'Components'],
          ['controls', 'Payroll Groups'],
          ['history', 'Run History'],
        ].map(([key, label]) => (
          <button key={key} type="button" onClick={() => setTab(key as any)} className={`h-10 rounded-xl px-3 text-xs font-black transition-colors ${tab === key ? 'bg-slate-950 text-white' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>{label}</button>
        ))}
      </div>

      {tab === 'lines' && (
        <section className="mt-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-4">
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-[1fr_180px_150px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search employee, department, group, location" className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-10 text-sm font-semibold outline-none focus:border-dle-blue focus:ring-2 focus:ring-dle-blue/20" />
                {query && <button type="button" onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>}
              </div>
              <select value={group} onChange={(event) => setGroup(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none">{groups.map((item) => <option key={item}>{item}</option>)}</select>
              <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none">{['All', 'Ready', 'Review', 'Blocked'].map((item) => <option key={item}>{item}</option>)}</select>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[1480px] w-full divide-y divide-slate-100">
              <thead className="bg-slate-50">
                <tr>{payload?.enterpriseSourceActive
                  ? ['Employee', 'Group', 'Gross Pay', 'PAYE', 'Pension', 'Deductions', 'Net Pay', 'Employer Cost', 'Status'].map((header) => <th key={header} className="px-4 py-3 text-left text-xs font-black uppercase tracking-normal text-slate-500">{header}</th>)
                  : ['Employee', 'Group', 'Generated Gross', 'Sage Gross', 'Gross Var.', 'PAYE', 'Pension', 'Deductions', 'Generated Net', 'Sage Net', 'Net Var.', 'Employer Cost', 'Status'].map((header) => <th key={header} className="px-4 py-3 text-left text-xs font-black uppercase tracking-normal text-slate-500">{header}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filtered.map((record) => {
                  const styles = toneStyles[statusTone(record.status)];
                  const currency = recordCurrency(record);
                  return (
                    <tr key={record.recordKey} className="hover:bg-slate-50">
                      <td className="px-4 py-3"><div className="font-black text-slate-950">{record.fullName}</div><div className="text-xs font-semibold text-slate-500">{record.employeeId} - {record.department}</div></td>
                      <td className="px-4 py-3 text-sm font-bold text-slate-700">{record.payrollGroup}<div className="text-[11px] font-semibold text-slate-400">{currency}</div></td>
                      <td className="px-4 py-3 text-sm font-black text-slate-900">{money(record.grossPay, canViewMoney, currency)}</td>
                      {!payload?.enterpriseSourceActive ? (
                        <>
                          <td className="px-4 py-3 text-sm font-black text-cyan-800">{record.sageActual ? money(record.sageActual.grossPay, canViewMoney, currency) : 'No Sage'}</td>
                          <td className={`px-4 py-3 text-sm font-black ${Number(record.discrepancies.grossVariance || 0) === 0 ? 'text-emerald-700' : 'text-amber-700'}`}>{record.discrepancies.grossVariance === null ? 'N/A' : money(record.discrepancies.grossVariance, canViewMoney, currency)}</td>
                        </>
                      ) : null}
                      <td className="px-4 py-3 text-sm font-bold text-slate-700">{money(record.paye, canViewMoney, currency)}</td>
                      <td className="px-4 py-3 text-sm font-bold text-slate-700">{money(record.pensionEmployee, canViewMoney, currency)}</td>
                      <td className="px-4 py-3 text-sm font-black text-red-700">{money(record.totalDeductions, canViewMoney, currency)}</td>
                      <td className="px-4 py-3 text-sm font-black text-emerald-700">{money(record.netPay, canViewMoney, currency)}</td>
                      {!payload?.enterpriseSourceActive ? (
                        <>
                          <td className="px-4 py-3 text-sm font-black text-cyan-800">{record.sageActual ? money(record.sageActual.netPay, canViewMoney, currency) : 'No Sage'}</td>
                          <td className={`px-4 py-3 text-sm font-black ${Number(record.discrepancies.netVariance || 0) === 0 ? 'text-emerald-700' : 'text-amber-700'}`}>{record.discrepancies.netVariance === null ? 'N/A' : money(record.discrepancies.netVariance, canViewMoney, currency)}</td>
                        </>
                      ) : null}
                      <td className="px-4 py-3 text-sm font-black text-slate-900">{money(record.employerCost, canViewMoney, currency)}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${styles.chip}`}>{record.status}</span>
                        {record.issues.length > 0 && <p className="mt-1 max-w-[260px] text-xs font-semibold text-slate-500">{record.issues.slice(0, 2).join('; ')}</p>}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={payload?.enterpriseSourceActive ? 9 : 13} className="px-4 py-12 text-center text-sm font-bold text-slate-500">No payroll lines match the current filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'components' && (
        <section className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {(payload?.breakdowns.byComponent || []).map((component) => {
            const styles = toneStyles[component.tone];
            return (
              <div key={component.id} className={`rounded-2xl border p-5 ${styles.card}`}>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-black text-slate-950">{component.label}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-600">{component.payer} component</p>
                  </div>
                  <p className="text-xl font-black text-slate-950">{money(component.amount, canViewMoney)}</p>
                </div>
              </div>
            );
          })}
          {!payload?.breakdowns.byComponent.length && <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm font-bold text-slate-600">Component values are restricted for this role.</div>}
        </section>
      )}

      {tab === 'controls' && (
        <section className="mt-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-[760px] w-full divide-y divide-slate-100">
              <thead className="bg-slate-50"><tr>{['Payroll Group', 'Employees', 'Gross Pay', 'Net Pay', 'Exceptions'].map((header) => <th key={header} className="px-4 py-3 text-left text-xs font-black uppercase tracking-normal text-slate-500">{header}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {(payload?.breakdowns.byPayrollGroup || []).map((item) => (
                  <tr key={item.label}>
                    <td className="px-4 py-3 text-sm font-black text-slate-950">{item.label}</td>
                    <td className="px-4 py-3 text-sm font-bold text-slate-700">{number(item.employees)}</td>
                    <td className="px-4 py-3 text-sm font-black text-slate-900">{money(item.grossPay, canViewMoney)}</td>
                    <td className="px-4 py-3 text-sm font-black text-emerald-700">{money(item.netPay, canViewMoney)}</td>
                    <td className="px-4 py-3 text-sm font-bold text-slate-700">{number(item.exceptions)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'history' && (
        <section className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {(payload?.runs || []).map((run) => (
            <div key={run.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-black text-slate-950">{run.periodLabel}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">{run.employeeCount} employees - updated by {run.updatedBy}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${toneStyles[statusTone(run.status)].chip}`}>{run.status}</span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] font-black uppercase text-slate-500">Gross</p><p className="font-black text-slate-900">{money(run.grossPay, canViewMoney)}</p></div>
                <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] font-black uppercase text-slate-500">Net</p><p className="font-black text-emerald-700">{money(run.netPay, canViewMoney)}</p></div>
              </div>
              <div className="mt-4 space-y-2">
                {run.audit.slice(-3).map((event) => (
                  <div key={`${event.at}-${event.action}`} className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                    <CalendarDays className="h-3.5 w-3.5" />
                    <span>{new Date(event.at).toLocaleString('en-GB')} - {event.actor} - {event.action}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {payload?.runs.length === 0 && <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm font-bold text-slate-600">No payroll runs have been saved yet. Use Calculate to create the first run snapshot.</div>}
        </section>
      )}
    </div>
  );
}

export default PayrollProcessingClient;
