'use client';

/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BadgeCheck, Banknote, Calculator, CheckCircle2, Download, FileWarning, Landmark, RefreshCcw, Scale, Search, ShieldCheck, Users, WalletCards, X } from 'lucide-react';

type Role = 'Payroll Officer' | 'Finance Controller' | 'HR Director' | 'HR Manager' | 'Executive Management' | 'Auditor' | 'Employee';
type Tone = 'blue' | 'green' | 'amber' | 'red' | 'violet' | 'cyan' | 'slate';
type DeductionStatus = 'Ready' | 'Review' | 'Blocked';

type DeductionRecord = {
  employeeId: string;
  fullName: string;
  department: string;
  businessUnit: string;
  location: string;
  jobTitle: string;
  employmentType: string;
  employmentStatus: string;
  payrollGroup: string;
  salaryGrade: string;
  payCurrency: string;
  paymentRun: string;
  basePay: number | null;
  grossPay: number | null;
  pension: number | null;
  paye: number | null;
  nhf: number | null;
  loan: number | null;
  unionDues: number | null;
  otherDeductions: number | null;
  totalDeductions: number | null;
  netPay: number | null;
  deductionRatio: number | null;
  status: DeductionStatus;
  issues: string[];
};

type Payload = {
  generatedAt: string;
  source: string;
  dataSource?: { source: string; databaseAvailable: boolean; warning: string | null; employeeCount: number };
  period: string;
  periodLabel: string;
  role: Role;
  permissions: { canViewMoney: boolean; canExport: boolean };
  summary: {
    employees: number;
    grossPay: number;
    totalDeductions: number;
    netPay: number;
    pension: number;
    paye: number;
    nhf: number;
    loan: number;
    unionDues: number;
    otherDeductions: number;
    ready: number;
    review: number;
    blocked: number;
    exceptionCount: number;
    averageDeductionRatio: number;
  };
  records: DeductionRecord[];
  breakdowns: {
    byPayrollGroup: { label: string; employees: number; totalDeductions: number; exceptions: number }[];
    byComponent: { label: string; amount: number; tone: Tone }[];
  };
  controls: { label: string; status: string; detail: string; tone: Tone }[];
};

type ApiResponse<T> = { status: 'success' | 'error'; data?: T; error?: string };

const moneyFmt = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const numberFmt = new Intl.NumberFormat('en-GB');
const pctFmt = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });

const money = (value: number | null | undefined, canView = true) => (!canView || value === null || value === undefined ? 'Restricted' : moneyFmt.format(value));
const number = (value: number) => numberFmt.format(value);

const toneStyles: Record<Tone, { card: string; icon: string; chip: string; bar: string }> = {
  blue: { card: 'bg-blue-50 border-blue-200', icon: 'bg-blue-600 text-white', chip: 'bg-blue-100 text-blue-800', bar: 'bg-blue-600' },
  green: { card: 'bg-emerald-50 border-emerald-200', icon: 'bg-emerald-600 text-white', chip: 'bg-emerald-100 text-emerald-800', bar: 'bg-emerald-600' },
  amber: { card: 'bg-amber-50 border-amber-200', icon: 'bg-amber-500 text-white', chip: 'bg-amber-100 text-amber-800', bar: 'bg-amber-500' },
  red: { card: 'bg-red-50 border-red-200', icon: 'bg-red-600 text-white', chip: 'bg-red-100 text-red-800', bar: 'bg-red-600' },
  violet: { card: 'bg-violet-50 border-violet-200', icon: 'bg-violet-600 text-white', chip: 'bg-violet-100 text-violet-800', bar: 'bg-violet-600' },
  cyan: { card: 'bg-cyan-50 border-cyan-200', icon: 'bg-cyan-600 text-white', chip: 'bg-cyan-100 text-cyan-800', bar: 'bg-cyan-600' },
  slate: { card: 'bg-slate-50 border-slate-200', icon: 'bg-slate-800 text-white', chip: 'bg-slate-100 text-slate-800', bar: 'bg-slate-700' },
};

const statusTone = (status: string): Tone => (status === 'Ready' ? 'green' : status === 'Blocked' ? 'red' : status === 'Review' ? 'amber' : 'blue');

function MetricCard({ label, value, detail, icon: Icon, tone }: { label: string; value: string; detail: string; icon: any; tone: Tone }) {
  const styles = toneStyles[tone];
  return (
    <div className={`relative overflow-hidden rounded-2xl border p-4 sm:p-5 ${styles.card}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-normal text-slate-600">{label}</p>
          <p className="mt-2 truncate text-2xl font-black text-slate-950">{value}</p>
          <p className="mt-1 text-xs font-semibold text-slate-600">{detail}</p>
        </div>
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${styles.icon}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <div className={`absolute bottom-0 left-0 h-1 w-full ${styles.bar}`} />
    </div>
  );
}

export default function DeductionsClient({ initialNow }: { initialNow: string }) {
  const [role, setRole] = useState<Role>('Payroll Officer');
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('All');
  const [status, setStatus] = useState('All');
  const [component, setComponent] = useState('All');
  const [selectedId, setSelectedId] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/hris/payroll/deductions', { headers: { 'x-hris-role': role }, cache: 'no-store' });
      const json = (await res.json()) as ApiResponse<Payload>;
      if (!res.ok || json.status !== 'success' || !json.data) throw new Error(json.error || `Deductions request failed (${res.status})`);
      setPayload(json.data);
      setSelectedId((current) => current || json.data?.records[0]?.employeeId || '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load deductions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [role]);

  const groups = useMemo(() => ['All', ...Array.from(new Set((payload?.records || []).map((record) => record.payrollGroup))).sort()], [payload?.records]);
  const components = ['All', 'PAYE', 'Pension', 'NHF', 'Loan', 'Union Dues', 'Other'];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (payload?.records || []).filter((record) => {
      if (group !== 'All' && record.payrollGroup !== group) return false;
      if (status !== 'All' && record.status !== status) return false;
      if (component !== 'All') {
        const key = component === 'PAYE' ? 'paye' : component === 'Pension' ? 'pension' : component === 'NHF' ? 'nhf' : component === 'Loan' ? 'loan' : component === 'Union Dues' ? 'unionDues' : 'otherDeductions';
        if (Number(record[key as keyof DeductionRecord] || 0) <= 0) return false;
      }
      if (!q) return true;
      return [record.employeeId, record.fullName, record.department, record.jobTitle, record.payrollGroup, record.salaryGrade].some((value) => String(value || '').toLowerCase().includes(q));
    });
  }, [component, group, payload?.records, query, status]);

  const selected = (payload?.records || []).find((record) => record.employeeId === selectedId) || filtered[0] || null;
  const canViewMoney = Boolean(payload?.permissions.canViewMoney);
  const lastLoaded = payload?.generatedAt || initialNow;
  const scopedTotals = filtered.reduce(
    (sum, record) => ({
      pension: sum.pension + Number(record.pension || 0),
      paye: sum.paye + Number(record.paye || 0),
      nhf: sum.nhf + Number(record.nhf || 0),
      loans: sum.loans + Number(record.loan || 0),
      total: sum.total + Number(record.totalDeductions || 0),
      net: sum.net + Number(record.netPay || 0),
      gross: sum.gross + Number(record.grossPay || 0),
      exceptions: sum.exceptions + record.issues.length,
    }),
    { pension: 0, paye: 0, nhf: 0, loans: 0, total: 0, net: 0, gross: 0, exceptions: 0 }
  );
  const scopedRatio = scopedTotals.gross ? (scopedTotals.total / scopedTotals.gross) * 100 : 0;

  const exportCsv = () => {
    window.location.href = '/api/hris/payroll/deductions?format=csv';
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-600 text-white">
              <WalletCards className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-950">Deductions</h1>
              <p className="mt-1 max-w-4xl text-sm font-semibold text-slate-600">
                Statutory, voluntary, loan, and exception deductions with payroll-ready validation and audit-focused controls.
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-extrabold text-blue-800">Period: {payload?.periodLabel || 'Loading'}</span>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-extrabold text-emerald-800">Source: {payload?.source || 'DLE_Enterprise HRIS'}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-extrabold text-slate-700">Loaded: {new Date(lastLoaded).toLocaleString('en-GB')}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-800 outline-none">
            {['Payroll Officer', 'Finance Controller', 'HR Director', 'HR Manager', 'Executive Management', 'Auditor', 'Employee'].map((item) => <option key={item}>{item}</option>)}
          </select>
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-3 text-xs font-extrabold text-white hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60">
            <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Refreshing' : 'Refresh'}
          </button>
          <button type="button" onClick={exportCsv} disabled={!payload?.permissions.canExport} className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-3 text-xs font-extrabold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400">
            <Download className="h-4 w-4" />
            Export
          </button>
        </div>
      </div>

      {error && <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">{error}</div>}
      {payload?.dataSource?.warning && <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">{payload.dataSource.warning}</div>}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total Deductions" value={money(scopedTotals.total || payload?.summary.totalDeductions, canViewMoney)} detail={`${number(filtered.length || payload?.summary.employees || 0)} employees in current scope`} icon={Banknote} tone="red" />
        <MetricCard label="Deduction Ratio" value={`${pctFmt.format(scopedRatio || payload?.summary.averageDeductionRatio || 0)}%`} detail="Deductions as percentage of gross pay" icon={Scale} tone={(scopedRatio || 0) > 35 ? 'amber' : 'blue'} />
        <MetricCard label="Net Pay After Deduction" value={money(scopedTotals.net || payload?.summary.netPay, canViewMoney)} detail="Projected take-home pay after deductions" icon={BadgeCheck} tone="green" />
        <MetricCard label="Exceptions" value={number(scopedTotals.exceptions || payload?.summary.exceptionCount || 0)} detail="Missing setup, ratios, currency, or status flags" icon={AlertTriangle} tone={(scopedTotals.exceptions || payload?.summary.exceptionCount || 0) ? 'amber' : 'green'} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-4">
        <MetricCard label="PAYE" value={money(scopedTotals.paye || payload?.summary.paye, canViewMoney)} detail="Estimated tax deduction" icon={Landmark} tone="violet" />
        <MetricCard label="Pension" value={money(scopedTotals.pension || payload?.summary.pension, canViewMoney)} detail="Employee pension contribution" icon={ShieldCheck} tone="blue" />
        <MetricCard label="NHF" value={money(scopedTotals.nhf || payload?.summary.nhf, canViewMoney)} detail="Housing fund estimate" icon={Users} tone="cyan" />
        <MetricCard label="Loans" value={money(scopedTotals.loans || payload?.summary.loan, canViewMoney)} detail="Voluntary loan recovery" icon={Calculator} tone="amber" />
      </div>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-4 sm:p-5">
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-[1fr_180px_150px_160px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search employee, department, grade, payroll group" className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-10 text-sm font-semibold outline-none focus:border-dle-blue focus:ring-2 focus:ring-dle-blue/20" />
              {query && (
                <button type="button" onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <select value={group} onChange={(e) => setGroup(e.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none">{groups.map((item) => <option key={item}>{item}</option>)}</select>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none">{['All', 'Ready', 'Review', 'Blocked'].map((item) => <option key={item}>{item}</option>)}</select>
            <select value={component} onChange={(e) => setComponent(e.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none">{components.map((item) => <option key={item}>{item}</option>)}</select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1120px] w-full divide-y divide-slate-100">
            <thead className="bg-slate-50">
              <tr>
                {['Employee', 'Payroll Group', 'Gross', 'PAYE', 'Pension', 'Other', 'Total Deduction', 'Ratio', 'Net Pay', 'Status'].map((header) => (
                  <th key={header} className="px-4 py-3 text-left text-xs font-black uppercase tracking-normal text-slate-500">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filtered.map((record) => {
                const tone = statusTone(record.status);
                return (
                  <tr key={record.employeeId} onClick={() => setSelectedId(record.employeeId)} className={`cursor-pointer hover:bg-slate-50 ${selected?.employeeId === record.employeeId ? 'bg-blue-50/50' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="font-black text-slate-950">{record.fullName}</div>
                      <div className="text-xs font-semibold text-slate-500">{record.employeeId} - {record.department}</div>
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-slate-700">{record.payrollGroup}</td>
                    <td className="px-4 py-3 text-sm font-black text-slate-900">{money(record.grossPay, canViewMoney)}</td>
                    <td className="px-4 py-3 text-sm font-bold text-slate-700">{money(record.paye, canViewMoney)}</td>
                    <td className="px-4 py-3 text-sm font-bold text-slate-700">{money(record.pension, canViewMoney)}</td>
                    <td className="px-4 py-3 text-sm font-bold text-slate-700">{money(Number(record.nhf || 0) + Number(record.loan || 0) + Number(record.unionDues || 0) + Number(record.otherDeductions || 0), canViewMoney)}</td>
                    <td className="px-4 py-3 text-sm font-black text-slate-900">{money(record.totalDeductions, canViewMoney)}</td>
                    <td className="px-4 py-3 text-sm font-bold text-slate-700">{record.deductionRatio === null ? 'Restricted' : `${pctFmt.format(record.deductionRatio)}%`}</td>
                    <td className="px-4 py-3 text-sm font-black text-slate-900">{money(record.netPay, canViewMoney)}</td>
                    <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-black ${toneStyles[tone].chip}`}>{record.status}</span></td>
                  </tr>
                );
              })}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-sm font-bold text-slate-500">No deductions match the selected filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-black text-slate-950">Deduction Components</h2>
              <p className="mt-1 text-xs font-semibold text-slate-500">Color-coded statutory and voluntary deduction mix.</p>
            </div>
            <FileWarning className="h-5 w-5 text-slate-400" />
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(payload?.breakdowns.byComponent || []).map((item) => {
              const total = payload?.summary.totalDeductions || 0;
              const pct = total ? (item.amount / total) * 100 : 0;
              return (
                <div key={item.label} className={`rounded-2xl border p-4 ${toneStyles[item.tone].card}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-normal text-slate-600">{item.label}</p>
                      <p className="mt-1 text-lg font-black text-slate-950">{money(item.amount, canViewMoney)}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-black ${toneStyles[item.tone].chip}`}>{pctFmt.format(pct)}%</span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/80">
                    <div className={`h-full ${toneStyles[item.tone].bar}`} style={{ width: `${Math.min(100, Math.max(2, pct))}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-black text-slate-950">Selected Employee</h2>
              <p className="mt-1 text-xs font-semibold text-slate-500">Deduction detail and validation findings.</p>
            </div>
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          </div>
          {selected ? (
            <div className="mt-4 space-y-3">
              <div className={`rounded-2xl border p-4 ${toneStyles[statusTone(selected.status)].card}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-slate-950">{selected.fullName}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-600">{selected.employeeId} - {selected.jobTitle}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-black ${toneStyles[statusTone(selected.status)].chip}`}>{selected.status}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  ['Gross Pay', money(selected.grossPay, canViewMoney)],
                  ['PAYE', money(selected.paye, canViewMoney)],
                  ['Pension', money(selected.pension, canViewMoney)],
                  ['NHF', money(selected.nhf, canViewMoney)],
                  ['Loans', money(selected.loan, canViewMoney)],
                  ['Net Pay', money(selected.netPay, canViewMoney)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[11px] font-black uppercase tracking-normal text-slate-500">{label}</p>
                    <p className="mt-1 text-sm font-black text-slate-900">{value}</p>
                  </div>
                ))}
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-black uppercase tracking-normal text-slate-500">Validation</p>
                <div className="mt-2 space-y-2">
                  {(selected.issues.length ? selected.issues : ['No deduction exceptions detected.']).map((issue) => (
                    <div key={issue} className="flex items-start gap-2 text-sm font-semibold text-slate-700">
                      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                      <span>{issue}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-500">Select an employee to inspect deductions.</div>
          )}
        </section>
      </div>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-base font-black text-slate-950">Control Readiness</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {(payload?.controls || []).map((control) => (
            <div key={control.label} className={`rounded-2xl border p-4 ${toneStyles[control.tone].card}`}>
              <span className={`rounded-full px-2.5 py-1 text-xs font-black ${toneStyles[control.tone].chip}`}>{control.status}</span>
              <p className="mt-3 text-sm font-black text-slate-950">{control.label}</p>
              <p className="mt-1 text-xs font-semibold text-slate-600">{control.detail}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
