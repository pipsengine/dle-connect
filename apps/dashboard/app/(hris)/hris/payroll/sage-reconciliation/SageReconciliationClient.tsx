'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, DatabaseZap, Download, RefreshCcw, Search } from 'lucide-react';

type ReconciliationStatus = 'Matched' | 'Variance' | 'Missing Sage' | 'Missing Enterprise' | 'Wrong Profile' | 'Review';

type ReconciliationRecord = {
  employeeId: string;
  employeeCode: string;
  fullName: string;
  department: string;
  salaryGrade: string;
  payrollGroup: string;
  earningProfileId: string;
  earningProfile: string;
  status: ReconciliationStatus;
  issues: string[];
  sage: null | {
    grossPay: number;
    netPay: number;
    paye: number;
    pensionEmployee: number;
    bht: number;
    earningCodes: string[];
  };
  enterprise: null | {
    grossPay: number;
    netPay: number;
    paye: number;
    pensionEmployee: number;
    bht: number;
    earningCodes: string[];
    payrollStatus: string;
  };
  variance: {
    grossPay: number | null;
    netPay: number | null;
    paye: number | null;
    pensionEmployee: number | null;
    bht: number | null;
  };
  lineVariances: Array<{
    code: string;
    name: string;
    sageAmount: number | null;
    enterpriseAmount: number | null;
    variance: number | null;
  }>;
};

type Payload = {
  generatedAt: string;
  referencePeriod: string;
  referencePeriodLabel: string;
  targetPeriod: string;
  targetPeriodLabel: string;
  summary: {
    employees: number;
    matched: number;
    variance: number;
    missingSage: number;
    wrongProfile: number;
    sageGrossPay: number;
    enterpriseGrossPay: number;
    grossVariance: number;
    sageNetPay: number;
    enterpriseNetPay: number;
    netVariance: number;
  };
  records: ReconciliationRecord[];
};

type ApiResponse<T> = { status: 'success' | 'error'; data?: T; error?: string };

const moneyFmt = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 });
const numberFmt = new Intl.NumberFormat('en-GB');
const money = (value: number | null | undefined) => moneyFmt.format(Number(value || 0));
const number = (value: number | null | undefined) => numberFmt.format(Number(value || 0));

const statusClass = (status: ReconciliationStatus) => {
  if (status === 'Matched') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'Wrong Profile' || status === 'Variance') return 'border-red-200 bg-red-50 text-red-700';
  if (status === 'Missing Sage' || status === 'Missing Enterprise') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-slate-200 bg-slate-50 text-slate-700';
};

function MetricCard({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: 'blue' | 'green' | 'red' | 'violet' }) {
  const styles = {
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    red: 'border-red-200 bg-red-50 text-red-700',
    violet: 'border-violet-200 bg-violet-50 text-violet-700',
  }[tone];
  return (
    <div className={`rounded-2xl border p-4 ${styles}`}>
      <p className="text-xs font-black uppercase tracking-normal">{label}</p>
      <p className="mt-2 text-2xl font-black text-slate-950">{value}</p>
      <p className="mt-1 text-xs font-semibold text-slate-600">{detail}</p>
    </div>
  );
}

export default function SageReconciliationClient({
  initialReferencePeriod,
  initialTargetPeriod,
}: {
  initialReferencePeriod: string;
  initialTargetPeriod: string;
}) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('All');
  const [referencePeriod, setReferencePeriod] = useState(initialReferencePeriod);
  const [targetPeriod, setTargetPeriod] = useState(initialTargetPeriod);
  const [selectedCode, setSelectedCode] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ referencePeriod, targetPeriod, detailLimit: '80' });
      const res = await fetch(`/api/hris/payroll/sage-reconciliation?${params.toString()}`, { cache: 'no-store' });
      const json = (await res.json()) as ApiResponse<Payload>;
      if (!res.ok || json.status !== 'success' || !json.data) throw new Error(json.error || `Reconciliation request failed (${res.status})`);
      setPayload(json.data);
      setSelectedCode((current) => current || json.data?.records[0]?.employeeCode || '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load payroll reconciliation');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [referencePeriod, targetPeriod]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (payload?.records || []).filter((record) => {
      if (status !== 'All' && record.status !== status) return false;
      if (!q) return true;
      return [record.employeeCode, record.employeeId, record.fullName, record.salaryGrade, record.earningProfile]
        .some((value) => String(value || '').toLowerCase().includes(q));
    });
  }, [payload?.records, query, status]);

  const selected = filtered.find((record) => record.employeeCode === selectedCode) || filtered[0] || null;

  const exportCsv = () => {
    const headers = ['Employee', 'Name', 'Grade', 'Profile', 'Status', 'Sage Gross', 'Enterprise Gross', 'Gross Var', 'Sage Net', 'Enterprise Net', 'Net Var', 'Issues'];
    const lines = filtered.map((record) => [
      record.employeeCode,
      record.fullName,
      record.salaryGrade,
      record.earningProfile,
      record.status,
      record.sage?.grossPay ?? '',
      record.enterprise?.grossPay ?? '',
      record.variance.grossPay ?? '',
      record.sage?.netPay ?? '',
      record.enterprise?.netPay ?? '',
      record.variance.netPay ?? '',
      record.issues.join('; '),
    ].map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(','));
    const blob = new Blob([[headers.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `payroll-reconciliation-${referencePeriod}-vs-${targetPeriod}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase text-violet-700">Phase 1 · Payroll Reconciliation</p>
            <h1 className="mt-1 text-2xl font-black text-slate-950">Sage vs Enterprise Payroll Reconciliation</h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold text-slate-600">
              Compare the authoritative Sage payslip ({referencePeriod}) against the DLE enterprise engine ({targetPeriod}) for every permanent employee. Use May as the benchmark to clear June before release.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60">
              <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button type="button" onClick={exportCsv} disabled={!filtered.length} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-black text-white hover:bg-slate-800 disabled:opacity-60">
              <Download className="h-4 w-4" />
              Export CSV
            </button>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <label className="block text-sm font-bold text-slate-700">
            Sage reference period
            <input value={referencePeriod} onChange={(event) => setReferencePeriod(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 font-bold" placeholder="2026-05" />
          </label>
          <label className="block text-sm font-bold text-slate-700">
            Enterprise target period
            <input value={targetPeriod} onChange={(event) => setTargetPeriod(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 font-bold" placeholder="2026-06" />
          </label>
          <label className="block text-sm font-bold text-slate-700">
            Search employee
            <div className="relative mt-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="P0146, name, grade..." className="h-11 w-full rounded-xl border border-slate-200 pl-10 pr-3 font-bold" />
            </div>
          </label>
        </div>
      </section>

      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div> : null}

      {payload ? (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Permanent employees" value={number(payload.summary.employees)} detail={`${number(payload.summary.matched)} matched`} tone="blue" />
            <MetricCard label="Variances" value={number(payload.summary.variance)} detail={`${number(payload.summary.wrongProfile)} wrong profile`} tone="red" />
            <MetricCard label="Gross variance" value={money(payload.summary.grossVariance)} detail={`Sage ${money(payload.summary.sageGrossPay)} · Enterprise ${money(payload.summary.enterpriseGrossPay)}`} tone="violet" />
            <MetricCard label="Net variance" value={money(payload.summary.netVariance)} detail={`Sage ${money(payload.summary.sageNetPay)} · Enterprise ${money(payload.summary.enterpriseNetPay)}`} tone="green" />
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
                <div>
                  <h2 className="text-sm font-black text-slate-950">Employee reconciliation register</h2>
                  <p className="text-xs font-semibold text-slate-500">{payload.referencePeriodLabel} Sage vs {payload.targetPeriodLabel} enterprise</p>
                </div>
                <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-bold">
                  {['All', 'Matched', 'Variance', 'Wrong Profile', 'Missing Sage', 'Missing Enterprise', 'Review'].map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </div>
              <div className="max-h-[32rem] overflow-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-xs font-black uppercase text-slate-500">
                    <tr>
                      {['Employee', 'Profile', 'Sage Gross', 'Enterprise Gross', 'Net Var', 'Status'].map((head) => <th key={head} className="px-4 py-3">{head}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtered.map((record) => (
                      <tr key={record.employeeCode} onClick={() => setSelectedCode(record.employeeCode)} className={`cursor-pointer hover:bg-slate-50 ${selected?.employeeCode === record.employeeCode ? 'bg-violet-50' : ''}`}>
                        <td className="px-4 py-3">
                          <p className="font-black text-slate-950">{record.employeeCode}</p>
                          <p className="text-xs font-semibold text-slate-500">{record.fullName}</p>
                        </td>
                        <td className="px-4 py-3 text-xs font-bold text-slate-700">{record.salaryGrade}<br /><span className="text-slate-400">{record.earningProfileId}</span></td>
                        <td className="px-4 py-3 font-black">{money(record.sage?.grossPay)}</td>
                        <td className="px-4 py-3 font-black">{money(record.enterprise?.grossPay)}</td>
                        <td className="px-4 py-3 font-black text-red-700">{record.variance.netPay === null ? '—' : money(record.variance.netPay)}</td>
                        <td className="px-4 py-3"><span className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${statusClass(record.status)}`}>{record.status}</span></td>
                      </tr>
                    ))}
                    {!filtered.length ? <tr><td colSpan={6} className="px-4 py-8 text-center font-bold text-slate-600">No employees match this filter.</td></tr> : null}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              {selected ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-black uppercase text-violet-700">Selected employee</p>
                    <h3 className="mt-1 text-xl font-black text-slate-950">{selected.fullName}</h3>
                    <p className="text-sm font-semibold text-slate-600">{selected.employeeCode} · {selected.department} · {selected.salaryGrade}</p>
                  </div>
                  <div className={`rounded-xl border p-3 ${statusClass(selected.status)}`}>
                    <p className="text-xs font-black uppercase">Status: {selected.status}</p>
                    <ul className="mt-2 space-y-1 text-xs font-semibold">
                      {selected.issues.length ? selected.issues.map((issue) => <li key={issue}>• {issue}</li>) : <li>Within tolerance on gross, net, PAYE, pension, and BHT.</li>}
                    </ul>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {[
                      ['Gross', selected.sage?.grossPay, selected.enterprise?.grossPay, selected.variance.grossPay],
                      ['Net', selected.sage?.netPay, selected.enterprise?.netPay, selected.variance.netPay],
                      ['PAYE', selected.sage?.paye, selected.enterprise?.paye, selected.variance.paye],
                      ['Pension', selected.sage?.pensionEmployee, selected.enterprise?.pensionEmployee, selected.variance.pensionEmployee],
                      ['BHT', selected.sage?.bht, selected.enterprise?.bht, selected.variance.bht],
                    ].map(([label, sage, enterprise, variance]) => (
                      <div key={String(label)} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-[11px] font-black uppercase text-slate-500">{label}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-600">Sage: {money(Number(sage || 0))}</p>
                        <p className="text-xs font-semibold text-slate-600">Enterprise: {money(Number(enterprise || 0))}</p>
                        <p className="mt-1 text-xs font-black text-red-700">Var: {variance === null ? '—' : money(Number(variance || 0))}</p>
                      </div>
                    ))}
                  </div>
                  {selected.lineVariances.length ? (
                    <div>
                      <p className="text-xs font-black uppercase text-slate-500">Earning line comparison</p>
                      <div className="mt-2 max-h-56 overflow-auto rounded-xl border border-slate-200">
                        <table className="min-w-full text-xs">
                          <thead className="bg-slate-50 font-black uppercase text-slate-500">
                            <tr>{['Code', 'Sage', 'Enterprise', 'Var'].map((head) => <th key={head} className="px-3 py-2 text-left">{head}</th>)}</tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {selected.lineVariances.map((line) => (
                              <tr key={line.code}>
                                <td className="px-3 py-2 font-bold text-slate-800">{line.code}</td>
                                <td className="px-3 py-2">{line.sageAmount === null ? '—' : money(line.sageAmount)}</td>
                                <td className="px-3 py-2">{line.enterpriseAmount === null ? '—' : money(line.enterpriseAmount)}</td>
                                <td className="px-3 py-2 font-black text-red-700">{line.variance === null ? '—' : money(line.variance)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs font-semibold text-slate-500">Line-level detail is available for the first 80 employees in this run. Search P0146 to inspect earning lines.</p>
                  )}
                </div>
              ) : (
                <div className="flex h-full min-h-64 items-center justify-center text-sm font-bold text-slate-600">Select an employee to inspect variances.</div>
              )}
            </div>
          </section>
        </>
      ) : loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm font-bold text-slate-600">Loading reconciliation...</div>
      ) : null}

      <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm font-semibold text-blue-900">
        <div className="flex items-start gap-3">
          <DatabaseZap className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-black">How to use this report</p>
            <p className="mt-1">Start with P0146 and other high-value permanent staff. Matched employees are safe to release in the enterprise period. Variance and Wrong Profile rows must be cleared in Phase 2 engine fixes or master data before June payroll is approved.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
