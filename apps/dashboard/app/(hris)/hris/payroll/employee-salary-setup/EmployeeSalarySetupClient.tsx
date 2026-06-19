'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BadgeCheck, Banknote, CheckCircle2, Download, ListTree, RefreshCcw, Search, Settings2, ShieldCheck, UserCog, Users, X } from 'lucide-react';

type Role = 'Payroll Officer' | 'Finance Controller' | 'HR Director' | 'HR Manager' | 'Executive Management' | 'Auditor' | 'Employee';
type Tone = 'blue' | 'green' | 'amber' | 'red' | 'violet' | 'cyan' | 'slate';

type PayrollRecord = {
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
  paymentType: string;
  setupAssignedToPayroll: boolean;
  payrollStatus: 'Ready' | 'Review' | 'Blocked';
  riskSeverity: 'Low' | 'Medium' | 'High';
  exceptionCount: number;
  exceptions: string[];
  isDailyRate: boolean;
  ratePerDay: number | null;
  ratePerHour: number | null;
  hoursPerDay: number;
  earningProfile: string;
  earningProfileId: string;
  basePay: number | null;
  allowances: number | null;
  taxablePay: number | null;
  nonTaxablePay: number | null;
  earningLines: Array<{ code: string; name: string; taxable: boolean; percentOfGross: number; calculation?: string; runFrequency?: string; includeInMonthlyPayroll?: boolean; amount: number | null }>;
  annualBenefitLines: Array<{ code: string; name: string; taxable: boolean; percentOfGross: number; calculation?: string; runFrequency?: string; includeInMonthlyPayroll?: boolean; amount: number | null }>;
  pension: number | null;
  paye: number | null;
  otherDeductions: number | null;
  grossPay: number | null;
  deductions: number | null;
  netPay: number | null;
};

type PayrollPayload = {
  generatedAt: string;
  source: string;
  periodLabel: string;
  permissions: { canViewMoney: boolean; canExport: boolean };
  summary: { totalEmployees: number; payrollEligible: number; readyEmployees: number; reviewEmployees: number; blockedEmployees: number; payrollCoveragePct: number; grossPay: number; netPay: number; exceptionCount: number };
  records: PayrollRecord[];
};

type ApiResponse<T> = { status: 'success' | 'error'; data?: T; error?: string };

const moneyFmt = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 });
const numberFmt = new Intl.NumberFormat('en-GB');
const pctFmt = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });

const money = (value: number | null | undefined, canView = true) => (!canView || value === null || value === undefined ? 'Restricted' : moneyFmt.format(value));
const number = (value: number) => numberFmt.format(value);
const percent = (value: number | null | undefined) => `${pctFmt.format(Number(value || 0) * 100)}%`;
const rateMoney = (value: number | null | undefined, canView = true) => (value === null || value === undefined || value <= 0 ? 'N/A' : money(value, canView));

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

export default function EmployeeSalarySetupClient({ initialNow }: { initialNow: string }) {
  useEffect(() => {
    document.title = 'Employee Salary Setup | DLE Digital Enterprise';
  }, []);

  const [role, setRole] = useState<Role>('Payroll Officer');
  const [payload, setPayload] = useState<PayrollPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('All');
  const [group, setGroup] = useState('All');
  const [grade, setGrade] = useState('All');
  const [selectedId, setSelectedId] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/hris/payroll-management', { headers: { 'x-hris-role': role }, cache: 'no-store' });
      const json = (await res.json()) as ApiResponse<PayrollPayload>;
      if (!res.ok || json.status !== 'success' || !json.data) throw new Error(json.error || `Employee salary setup request failed (${res.status})`);
      const data = json.data;
      setPayload(data);
      setSelectedId((current) => current || data.records[0]?.employeeId || '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load employee salary setup');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  const payrollGroups = useMemo(() => ['All', ...Array.from(new Set((payload?.records || []).map((record) => record.payrollGroup))).sort()], [payload?.records]);
  const salaryGrades = useMemo(() => ['All', ...Array.from(new Set((payload?.records || []).map((record) => record.salaryGrade))).sort()], [payload?.records]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (payload?.records || []).filter((record) => {
      if (status !== 'All' && record.payrollStatus !== status) return false;
      if (group !== 'All' && record.payrollGroup !== group) return false;
      if (grade !== 'All' && record.salaryGrade !== grade) return false;
      if (!q) return true;
      return [record.employeeId, record.fullName, record.department, record.jobTitle, record.payrollGroup, record.salaryGrade].some((value) => String(value || '').toLowerCase().includes(q));
    });
  }, [grade, group, payload?.records, query, status]);

  const selected = filtered.find((record) => record.employeeId === selectedId) || filtered[0] || null;
  const canViewMoney = Boolean(payload?.permissions.canViewMoney);
  const assigned = (payload?.records || []).filter((record) => record.setupAssignedToPayroll).length;
  const missingPay = (payload?.records || []).filter((record) => !record.basePay || record.basePay <= 0).length;
  const lastLoaded = payload?.generatedAt || initialNow;

  const exportCsv = () => {
    const headers = ['Employee ID', 'Name', 'Department', 'Job Title', 'Payroll Group', 'Salary Grade', 'Earning Profile', 'Daily Rate', 'Hourly Rate', 'Currency', 'Payment Run', 'Payment Type', 'Basic Pay', 'Allowances', 'Taxable Pay', 'Non-Taxable Pay', 'Gross Pay', 'Net Pay', 'Components', 'Status', 'Exceptions'];
    const lines = filtered.map((record) =>
      [
        record.employeeId,
        record.fullName,
        record.department,
        record.jobTitle,
        record.payrollGroup,
        record.salaryGrade,
        record.earningProfile,
        record.ratePerDay,
        record.ratePerHour,
        record.payCurrency,
        record.paymentRun,
        record.paymentType,
        record.basePay,
        record.allowances,
        record.taxablePay,
        record.nonTaxablePay,
        record.grossPay,
        record.netPay,
        record.earningLines.map((line) => `${line.code}: ${line.amount ?? ''}`).join('; '),
        record.payrollStatus,
        record.exceptions.join('; '),
      ]
        .map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`)
        .join(',')
    );
    const blob = new Blob([[headers.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'employee-salary-setup.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-600 text-white">
              <UserCog className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-950">Employee Salary Setup</h1>
              <p className="mt-1 max-w-4xl text-sm font-semibold text-slate-600">
                Employee-level payroll assignment, salary grade, pay amount, deduction estimate, payment run, and exception readiness.
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
            {['Payroll Officer', 'Finance Controller', 'HR Director', 'HR Manager', 'Executive Management', 'Auditor', 'Employee'].map((item) => (
              <option key={item}>{item}</option>
            ))}
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

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Employees" value={number(payload?.summary.totalEmployees || 0)} detail={`${number(payload?.summary.payrollEligible || 0)} eligible for payroll`} icon={Users} tone="blue" />
        <MetricCard label="Assigned to Payroll" value={number(assigned)} detail={`${pctFmt.format(payload?.summary.payrollCoveragePct || 0)}% setup coverage`} icon={ShieldCheck} tone={(payload?.summary.payrollCoveragePct || 0) >= 95 ? 'green' : 'amber'} />
        <MetricCard label="Missing Pay" value={number(missingPay)} detail="Base or period salary not available" icon={AlertTriangle} tone={missingPay ? 'red' : 'green'} />
        <MetricCard label="Net Payroll" value={money(payload?.summary.netPay, canViewMoney)} detail="Role-aware salary visibility" icon={Banknote} tone="violet" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        <MetricCard label="Ready" value={number(payload?.summary.readyEmployees || 0)} detail="Employee setup can proceed to payroll" icon={CheckCircle2} tone="green" />
        <MetricCard label="Review" value={number(payload?.summary.reviewEmployees || 0)} detail="Validation needed before close" icon={BadgeCheck} tone="amber" />
        <MetricCard label="Blocked" value={number(payload?.summary.blockedEmployees || 0)} detail="Resolve before posting" icon={AlertTriangle} tone="red" />
      </div>

      <section className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-[1fr_420px]">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-4 sm:p-5">
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-[1fr_150px_180px_180px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search employee, department, grade, payroll group" className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-10 text-sm font-semibold outline-none focus:border-dle-blue focus:ring-2 focus:ring-dle-blue/20" />
                {query && (
                  <button type="button" onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold outline-none">
                {['All', 'Ready', 'Review', 'Blocked'].map((item) => <option key={item}>{item}</option>)}
              </select>
              <select value={group} onChange={(e) => setGroup(e.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold outline-none">
                {payrollGroups.map((item) => <option key={item}>{item}</option>)}
              </select>
              <select value={grade} onChange={(e) => setGrade(e.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold outline-none">
                {salaryGrades.map((item) => <option key={item}>{item}</option>)}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[1160px] w-full text-left">
              <thead className="bg-slate-50 text-xs font-black uppercase tracking-normal text-slate-500">
                <tr>{['Employee', 'Grade', 'Group', 'Profile', 'Daily Rate', 'Basic', 'Gross', 'Net', 'Setup', 'Status'].map((head) => <th key={head} className="px-4 py-3">{head}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.slice(0, 120).map((record) => {
                  const tone = statusTone(record.payrollStatus);
                  return (
                    <tr key={record.employeeId} onClick={() => setSelectedId(record.employeeId)} className={`cursor-pointer hover:bg-slate-50 ${selected?.employeeId === record.employeeId ? 'bg-blue-50/60' : ''}`}>
                      <td className="px-4 py-3">
                        <p className="text-sm font-black text-slate-950">{record.fullName}</p>
                        <p className="text-xs font-semibold text-slate-500">{record.employeeId} - {record.department}</p>
                      </td>
                      <td className="px-4 py-3 text-sm font-bold text-slate-700">{record.salaryGrade}</td>
                      <td className="px-4 py-3 text-sm font-bold text-slate-700">{record.payrollGroup}</td>
                      <td className="px-4 py-3">
                        <p className="text-xs font-black text-slate-800">{record.earningProfile}</p>
                        <p className="text-[11px] font-semibold text-slate-500">{number(record.earningLines.length)} monthly components</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className={`text-sm font-black ${record.isDailyRate ? 'text-cyan-800' : 'text-slate-400'}`}>{rateMoney(record.ratePerDay, canViewMoney)}</p>
                        {record.isDailyRate ? <p className="text-[11px] font-semibold text-slate-500">{rateMoney(record.ratePerHour, canViewMoney)} / hr</p> : null}
                      </td>
                      <td className="px-4 py-3 text-sm font-black text-slate-900">{money(record.basePay, canViewMoney)}</td>
                      <td className="px-4 py-3 text-sm font-black text-slate-900">{money(record.grossPay, canViewMoney)}</td>
                      <td className="px-4 py-3 text-sm font-black text-slate-900">{money(record.netPay, canViewMoney)}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${record.setupAssignedToPayroll ? toneStyles.green.chip : toneStyles.red.chip}`}>{record.setupAssignedToPayroll ? 'Assigned' : 'Missing'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${toneStyles[tone].chip}`}>{record.payrollStatus}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-4 sm:p-5">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
                <Settings2 className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-sm font-black text-slate-950">Setup Detail</h2>
                <p className="text-xs font-semibold text-slate-500">Selected employee salary setup.</p>
              </div>
            </div>
          </div>
          {selected ? (
            <div className="space-y-4 p-4 sm:p-5">
              <div className={`rounded-2xl border p-4 ${toneStyles[statusTone(selected.payrollStatus)].card}`}>
                <p className="text-xs font-black uppercase tracking-normal text-slate-600">Employee</p>
                <p className="mt-1 text-lg font-black text-slate-950">{selected.fullName}</p>
                <p className="mt-1 text-xs font-semibold text-slate-600">{selected.employeeId} - {selected.jobTitle}</p>
              </div>
              {[
                ['Payroll Group', selected.payrollGroup],
                ['Salary Grade', selected.salaryGrade],
                ['Currency', selected.payCurrency],
                ['Payment Run', selected.paymentRun],
                ['Payment Type', selected.paymentType],
                ['Employment Type', selected.employmentType],
                ['Employment Status', selected.employmentStatus],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <span className="text-xs font-black text-slate-500">{label}</span>
                  <span className="text-right text-xs font-black text-slate-900">{value}</span>
                </div>
              ))}
              {selected.isDailyRate ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-3">
                    <p className="text-xs font-black text-cyan-800">Daily Rate</p>
                    <p className="mt-1 text-sm font-black text-slate-950">{rateMoney(selected.ratePerDay, canViewMoney)}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-black text-slate-600">Hourly Rate</p>
                    <p className="mt-1 text-sm font-black text-slate-950">{rateMoney(selected.ratePerHour, canViewMoney)}</p>
                    <p className="mt-1 text-[11px] font-semibold text-slate-500">{number(selected.hoursPerDay || 8)} hours per day</p>
                  </div>
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
                  <p className="text-xs font-black text-blue-800">Basic</p>
                  <p className="mt-1 text-sm font-black text-slate-950">{money(selected.basePay, canViewMoney)}</p>
                </div>
                <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-3">
                  <p className="text-xs font-black text-cyan-800">Allowances</p>
                  <p className="mt-1 text-sm font-black text-slate-950">{money(selected.allowances, canViewMoney)}</p>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                  <p className="text-xs font-black text-emerald-800">Gross</p>
                  <p className="mt-1 text-sm font-black text-slate-950">{money(selected.grossPay, canViewMoney)}</p>
                </div>
                <div className="rounded-xl border border-violet-200 bg-violet-50 p-3">
                  <p className="text-xs font-black text-violet-800">Net</p>
                  <p className="mt-1 text-sm font-black text-slate-950">{money(selected.netPay, canViewMoney)}</p>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200">
                <div className="flex items-center gap-3 border-b border-slate-100 p-4">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                    <ListTree className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-black text-slate-950">Monthly Salary Component Breakdown</p>
                    <p className="text-xs font-semibold text-slate-500">{selected.earningProfile} - {selected.earningProfileId}</p>
                  </div>
                </div>
                <div className="divide-y divide-slate-100">
                  {selected.earningLines.length ? selected.earningLines.map((line) => (
                    <div key={line.code} className={`grid grid-cols-[1fr_auto] gap-3 p-3 ${line.includeInMonthlyPayroll === false ? 'bg-amber-50/70' : ''}`}>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-xs font-black text-slate-950">{line.name}</p>
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-800">Monthly</span>
                        </div>
                        <p className="mt-0.5 text-[11px] font-semibold text-slate-500">{line.code} - {line.calculation || `${percent(line.percentOfGross)} of gross`} - {line.taxable ? 'Taxable' : 'Non-taxable'}</p>
                      </div>
                      <p className="text-right text-xs font-black text-slate-900">{money(line.amount, canViewMoney)}</p>
                    </div>
                  )) : <div className="p-4 text-xs font-bold text-slate-500">No salary components available for this employee.</div>}
                </div>
                <div className="grid grid-cols-2 gap-2 border-t border-slate-100 bg-slate-50 p-3">
                  <div>
                    <p className="text-[11px] font-black uppercase text-slate-500">Taxable Pay</p>
                    <p className="text-xs font-black text-slate-950">{money(selected.taxablePay, canViewMoney)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-black uppercase text-slate-500">Non-Taxable Pay</p>
                    <p className="text-xs font-black text-slate-950">{money(selected.nonTaxablePay, canViewMoney)}</p>
                  </div>
                </div>
              </div>
              {selected.annualBenefitLines.length ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/50">
                  <div className="border-b border-amber-100 p-4">
                    <p className="text-sm font-black text-slate-950">Once-Yearly Benefits</p>
                    <p className="text-xs font-semibold text-slate-600">Not part of monthly gross; paid only when the approved payroll period triggers it.</p>
                  </div>
                  <div className="divide-y divide-amber-100">
                    {selected.annualBenefitLines.map((line) => (
                      <div key={line.code} className="grid grid-cols-[1fr_auto] gap-3 p-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-xs font-black text-slate-950">{line.name}</p>
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-800">Once yearly</span>
                          </div>
                          <p className="mt-0.5 text-[11px] font-semibold text-slate-500">{line.code} - {line.calculation || 'Annual leave allowance'} - {line.taxable ? 'Taxable when paid' : 'Non-taxable'}</p>
                        </div>
                        <p className="text-right text-xs font-black text-slate-900">{money(line.amount, canViewMoney)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="rounded-2xl border border-slate-200">
                <div className="border-b border-slate-100 p-4">
                  <p className="text-sm font-black text-slate-950">Payroll Deduction Estimate</p>
                  <p className="text-xs font-semibold text-slate-500">Estimated deductions from current payroll configuration.</p>
                </div>
                <div className="divide-y divide-slate-100">
                  {[
                    ['PAYE', selected.paye],
                    ['Pension', selected.pension],
                    ['Other Deductions', selected.otherDeductions],
                    ['Total Deductions', selected.deductions],
                  ].map(([label, value]) => (
                    <div key={label as string} className="flex items-center justify-between gap-3 p-3">
                      <span className="text-xs font-black text-slate-600">{label as string}</span>
                      <span className="text-xs font-black text-slate-950">{money(value as number | null, canViewMoney)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-xs font-black uppercase tracking-normal text-slate-600">Exceptions</p>
                <div className="mt-3 space-y-2">
                  {selected.exceptions.length ? selected.exceptions.map((issue) => <p key={issue} className="rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-800">{issue}</p>) : <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">No setup exception detected.</p>}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-5 text-sm font-bold text-slate-500">No employee selected.</div>
          )}
        </aside>
      </section>
    </div>
  );
}
