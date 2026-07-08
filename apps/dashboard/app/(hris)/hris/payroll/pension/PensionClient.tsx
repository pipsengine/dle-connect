'use client';

/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BadgeCheck, Banknote, Building2, CalendarClock, Download, FileText, RefreshCcw, Search, Settings2, ShieldCheck, Users, WalletCards, X } from 'lucide-react';

type Role = 'Payroll Officer' | 'Finance Controller' | 'HR Director' | 'HR Manager' | 'Executive Management' | 'Auditor' | 'Employee';
type Tone = 'blue' | 'green' | 'amber' | 'red' | 'violet' | 'cyan' | 'slate';
type Status = 'Ready' | 'Review' | 'Blocked';

type PensionRecord = {
  employeeId: string;
  fullName: string;
  department: string;
  payrollGroup: string;
  providerName: string;
  custodian: string;
  rsaPin: string;
  pensionableEmolument: number | null;
  employeeContribution: number | null;
  employerContribution: number | null;
  voluntaryContribution: number | null;
  totalContribution: number | null;
  combinedRate: number;
  eligible: boolean;
  status: Status;
  issues: string[];
};
type PensionVersion = {
  id: string;
  name: string;
  status: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  currency: string;
  basis: string;
  notes: string;
  rules: {
    employeeRate: number;
    employerRate: number;
    minimumCombinedRate: number;
    employerFullResponsibilityMinimumRate: number;
    voluntaryContributionRate: number;
    remittanceDueDays: number;
    basisComponents: string[];
    eligibleEmploymentTypes: string[];
    excludedEmploymentTypes: string[];
  };
  providers: { id: string; name: string; status: string; custodian: string }[];
  regulatoryChanges: Array<Record<string, any>>;
};
type Payload = {
  generatedAt: string;
  source: string;
  dataSource?: { source: string; databaseAvailable: boolean; warning: string | null; employeeCount: number };
  periodLabel: string;
  permissions: { canViewMoney: boolean; canConfigure: boolean; canExport: boolean };
  config: { jurisdiction: string; activeVersionId: string; activeVersion: PensionVersion; versions: PensionVersion[]; audit: Array<Record<string, any>> };
  summary: {
    employees: number;
    eligible: number;
    pensionableEmolument: number;
    employeeContribution: number;
    employerContribution: number;
    voluntaryContribution: number;
    totalContribution: number;
    ready: number;
    review: number;
    blocked: number;
    exceptionCount: number;
  };
  breakdowns: { byProvider: { label: string; employees: number; remittance: number; exceptions: number }[] };
  records: PensionRecord[];
};
type ApiResponse<T> = { status: 'success' | 'error'; data?: T; error?: string };

const moneyFmt = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 });
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
const statusTone = (status: string): Tone => (status === 'Ready' ? 'green' : status === 'Blocked' ? 'red' : 'amber');

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
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${styles.icon}`}><Icon className="h-5 w-5" /></span>
      </div>
      <div className={`absolute bottom-0 left-0 h-1 w-full ${styles.bar}`} />
    </div>
  );
}

export default function PensionClient({ initialNow }: { initialNow: string }) {
  const [role, setRole] = useState<Role>('Payroll Officer');
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('All');
  const [status, setStatus] = useState('All');
  const [tab, setTab] = useState<'employees' | 'providers' | 'rules' | 'changes'>('employees');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/hris/payroll/pension', { headers: { 'x-hris-role': role }, cache: 'no-store' });
      const json = (await res.json()) as ApiResponse<Payload>;
      if (!res.ok || json.status !== 'success' || !json.data) throw new Error(json.error || `Pension request failed (${res.status})`);
      setPayload(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load pension payroll');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [role]);

  const canViewMoney = Boolean(payload?.permissions.canViewMoney);
  const version = payload?.config.activeVersion;
  const lastLoaded = payload?.generatedAt || initialNow;
  const groups = useMemo(() => ['All', ...Array.from(new Set((payload?.records || []).map((record) => record.payrollGroup))).sort()], [payload?.records]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (payload?.records || []).filter((record) => {
      if (group !== 'All' && record.payrollGroup !== group) return false;
      if (status !== 'All' && record.status !== status) return false;
      if (!q) return true;
      return [record.employeeId, record.fullName, record.department, record.payrollGroup, record.providerName, record.rsaPin].some((value) => String(value || '').toLowerCase().includes(q));
    });
  }, [group, payload?.records, query, status]);

  const exportCsv = () => {
    window.location.href = '/api/hris/payroll/pension?format=csv';
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-600 text-white"><ShieldCheck className="h-6 w-6" /></span>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-950">Pension</h1>
              <p className="mt-1 max-w-4xl text-sm font-semibold text-slate-600">Configurable pension contribution, PFA/RSA readiness, employer cost, employee deduction, and remittance compliance.</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-extrabold text-blue-800">Period: {payload?.periodLabel || 'Loading'}</span>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-extrabold text-emerald-800">Version: {version?.name || 'Loading'}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-extrabold text-slate-700">Loaded: {new Date(lastLoaded).toLocaleString('en-GB')}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-800 outline-none">{['Payroll Officer', 'Finance Controller', 'HR Director', 'HR Manager', 'Executive Management', 'Auditor', 'Employee'].map((item) => <option key={item}>{item}</option>)}</select>
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-3 text-xs font-extrabold text-white hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60"><RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />{loading ? 'Refreshing' : 'Refresh'}</button>
          <button type="button" onClick={exportCsv} disabled={!payload?.permissions.canExport} className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-3 text-xs font-extrabold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"><Download className="h-4 w-4" />Export</button>
        </div>
      </div>

      {error && <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">{error}</div>}
      {toast && <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800">{toast}</div>}
      {payload?.dataSource?.warning && <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">{payload.dataSource.warning}</div>}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total Remittance" value={money(payload?.summary.totalContribution, canViewMoney)} detail="Employee, employer, and voluntary contribution" icon={Banknote} tone="green" />
        <MetricCard label="Employee Contribution" value={money(payload?.summary.employeeContribution, canViewMoney)} detail={`${pctFmt.format((version?.rules.employeeRate || 0) * 100)}% configured employee rate`} icon={WalletCards} tone="blue" />
        <MetricCard label="Employer Contribution" value={money(payload?.summary.employerContribution, canViewMoney)} detail={`${pctFmt.format((version?.rules.employerRate || 0) * 100)}% configured employer rate`} icon={Building2} tone="violet" />
        <MetricCard label="Eligible Employees" value={number(payload?.summary.eligible || 0)} detail={`${number(payload?.summary.exceptionCount || 0)} validation flags`} icon={Users} tone={(payload?.summary.exceptionCount || 0) ? 'amber' : 'green'} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        <MetricCard label="Ready" value={number(payload?.summary.ready || 0)} detail="PFA/RSA and contribution checks passed" icon={BadgeCheck} tone="green" />
        <MetricCard label="Review" value={number(payload?.summary.review || 0)} detail="Non-blocking setup gaps" icon={FileText} tone="amber" />
        <MetricCard label="Blocked" value={number(payload?.summary.blocked || 0)} detail="Missing pay, inactive status, or core data" icon={AlertTriangle} tone={(payload?.summary.blocked || 0) ? 'red' : 'green'} />
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {[['employees', 'Employees'], ['providers', 'PFA Providers'], ['rules', 'Rules'], ['changes', 'Regulatory Changes']].map(([key, label]) => (
          <button key={key} type="button" onClick={() => setTab(key as any)} className={`h-10 rounded-xl px-3 text-xs font-black transition-colors ${tab === key ? 'bg-slate-950 text-white' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>{label}</button>
        ))}
      </div>

      {tab === 'employees' && (
        <section className="mt-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-4 sm:p-5">
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-[1fr_180px_150px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search employee, PFA, RSA PIN, department, payroll group" className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-10 text-sm font-semibold outline-none focus:border-dle-blue focus:ring-2 focus:ring-dle-blue/20" />
                {query && <button type="button" onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>}
              </div>
              <select value={group} onChange={(e) => setGroup(e.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none">{groups.map((item) => <option key={item}>{item}</option>)}</select>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none">{['All', 'Ready', 'Review', 'Blocked'].map((item) => <option key={item}>{item}</option>)}</select>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[1120px] w-full divide-y divide-slate-100">
              <thead className="bg-slate-50"><tr>{['Employee', 'PFA / Custodian', 'RSA PIN', 'Pensionable', 'Employee Cont.', 'Employer Cont.', 'Voluntary', 'Total', 'Rate', 'Status'].map((header) => <th key={header} className="px-4 py-3 text-left text-xs font-black uppercase tracking-normal text-slate-500">{header}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filtered.map((record) => (
                  <tr key={record.employeeId} className="hover:bg-slate-50">
                    <td className="px-4 py-3"><div className="font-black text-slate-950">{record.fullName}</div><div className="text-xs font-semibold text-slate-500">{record.employeeId} - {record.department}</div></td>
                    <td className="px-4 py-3"><div className="text-sm font-black text-slate-900">{record.providerName}</div><div className="text-xs font-semibold text-slate-500">{record.custodian}</div></td>
                    <td className="px-4 py-3 text-sm font-bold text-slate-700">{record.rsaPin || 'Missing'}</td>
                    <td className="px-4 py-3 text-sm font-black text-slate-900">{money(record.pensionableEmolument, canViewMoney)}</td>
                    <td className="px-4 py-3 text-sm font-bold text-slate-700">{money(record.employeeContribution, canViewMoney)}</td>
                    <td className="px-4 py-3 text-sm font-bold text-slate-700">{money(record.employerContribution, canViewMoney)}</td>
                    <td className="px-4 py-3 text-sm font-bold text-slate-700">{money(record.voluntaryContribution, canViewMoney)}</td>
                    <td className="px-4 py-3 text-sm font-black text-slate-900">{money(record.totalContribution, canViewMoney)}</td>
                    <td className="px-4 py-3 text-sm font-bold text-slate-700">{pctFmt.format(record.combinedRate * 100)}%</td>
                    <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-black ${toneStyles[statusTone(record.status)].chip}`}>{record.status}</span></td>
                  </tr>
                ))}
                {!loading && filtered.length === 0 && <tr><td colSpan={10} className="px-4 py-8 text-center text-sm font-bold text-slate-500">No pension records match the selected filters.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'providers' && (
        <section className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(payload?.breakdowns.byProvider || []).map((item) => (
            <div key={item.label} className={`rounded-2xl border p-4 ${item.exceptions ? toneStyles.amber.card : toneStyles.green.card}`}>
              <p className="text-sm font-black text-slate-950">{item.label}</p>
              <p className="mt-2 text-2xl font-black text-slate-950">{money(item.remittance, canViewMoney)}</p>
              <p className="mt-1 text-xs font-semibold text-slate-600">{number(item.employees)} employees, {number(item.exceptions)} flags</p>
            </div>
          ))}
        </section>
      )}

      {tab === 'rules' && (
        <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between gap-3"><div><h2 className="text-base font-black text-slate-950">Contribution Rules</h2><p className="mt-1 text-xs font-semibold text-slate-500">{version?.basis}</p></div><Settings2 className="h-5 w-5 text-slate-400" /></div>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {[
              ['Employee Rate', `${pctFmt.format((version?.rules.employeeRate || 0) * 100)}%`, 'Employee pension deduction'],
              ['Employer Rate', `${pctFmt.format((version?.rules.employerRate || 0) * 100)}%`, 'Employer counterpart'],
              ['Minimum Combined', `${pctFmt.format((version?.rules.minimumCombinedRate || 0) * 100)}%`, 'Compliance floor'],
              ['Remittance Due', `${version?.rules.remittanceDueDays || 0} days`, 'Configured due window'],
            ].map(([label, value, detail]) => (
              <div key={label} className={`rounded-2xl border p-4 ${toneStyles.blue.card}`}><p className="text-xs font-black uppercase tracking-normal text-slate-500">{label}</p><p className="mt-2 text-xl font-black text-slate-950">{value}</p><p className="mt-1 text-xs font-semibold text-slate-600">{detail}</p></div>
            ))}
          </div>
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-700">{version?.notes}</div>
        </section>
      )}

      {tab === 'changes' && (
        <section className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(version?.regulatoryChanges || []).map((item) => (
            <div key={String(item.id)} className={`rounded-2xl border p-4 ${toneStyles.cyan.card}`}>
              <p className="text-sm font-black text-slate-950">{String(item.title || item.id)}</p>
              <p className="mt-1 text-xs font-bold text-slate-600">Effective {String(item.effectiveDate || version?.effectiveFrom || '')}</p>
              <p className="mt-3 text-sm font-semibold text-slate-700">{String(item.impact || '')}</p>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
