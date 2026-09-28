'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, DatabaseZap, Download, RefreshCcw, Search, ShieldCheck, X } from 'lucide-react';

type MigrationStatus = 'Matched' | 'Mismatch' | 'Missing HRIS' | 'Missing Sage Gross' | 'Review';
type ReviewRecord = {
  sageEmployeeId: number;
  employeeCode: string;
  sourceEmployeeCode: string;
  employeeName: string;
  employeeType: 'Permanent' | 'Lumpsum';
  status: MigrationStatus;
  issues: string[];
  sage: {
    periodSalary: number;
    annualSalary: number;
    monthlyGross: number;
    jobGrade: string;
    remunerationDefinition: string;
    paymentRun: string;
    bankName: string;
    hasAccountNumber: boolean;
    accountName: string;
    taxNumber: string;
    pensionProvider: string;
    hasPensionNumber: boolean;
  };
  hris: null | {
    employeeDbId: number;
    employmentType: string;
    employmentStatus: string;
    payrollGroup: string;
    salaryGrade: string;
    periodSalary: number;
    annualSalary: number;
    monthlyGross: number;
    earningProfileId: string;
    earningProfile: string;
    calculatedBasic: number;
    taxablePay: number;
    nonTaxablePay: number;
    bankName: string;
    hasAccountNumber: boolean;
    accountName: string;
    taxNumber: string;
    pensionProvider: string;
    hasPensionNumber: boolean;
  };
};

type Payload = {
  generatedAt: string;
  source: string;
  summary: {
    employees: number;
    permanent: number;
    lumpsum: number;
    matched: number;
    mismatch: number;
    missingHris: number;
    missingGross: number;
    sageGross: number;
    hrisGross: number;
    grossVariance: number;
  };
  records: ReviewRecord[];
};

type MigrationSummary = {
  reviewed: number;
  migrated: number;
  savedPayslipIdentities?: number;
  missingHris: number;
  skippedNoIdentity: number;
  failed: number;
  failures: { employeeCode: string; error: string }[];
};

type ApiResponse<T> = { status: 'success' | 'error'; data?: T; error?: string };

const moneyFmt = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const numberFmt = new Intl.NumberFormat('en-GB');
const money = (value: number | null | undefined) => moneyFmt.format(Number(value || 0));
const number = (value: number | null | undefined) => numberFmt.format(Number(value || 0));

const statusClass = (status: MigrationStatus) => {
  if (status === 'Matched') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'Mismatch' || status === 'Missing HRIS' || status === 'Missing Sage Gross') return 'border-red-200 bg-red-50 text-red-700';
  return 'border-amber-200 bg-amber-50 text-amber-700';
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

export default function SageMigrationReviewClient({ initialNow }: { initialNow: string }) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [type, setType] = useState('All');
  const [status, setStatus] = useState('All');
  const [selectedCode, setSelectedCode] = useState('');
  const [migratingIdentity, setMigratingIdentity] = useState(false);
  const [migrationMessage, setMigrationMessage] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/hris/payroll/sage-migration-review', { cache: 'no-store' });
      const json = (await res.json()) as ApiResponse<Payload>;
      if (!res.ok || json.status !== 'success' || !json.data) throw new Error(json.error || `Review request failed (${res.status})`);
      setPayload(json.data);
      setSelectedCode((current) => current || json.data?.records[0]?.employeeCode || '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load Sage migration review');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (payload?.records || []).filter((record) => {
      if (type !== 'All' && record.employeeType !== type) return false;
      if (status !== 'All' && record.status !== status) return false;
      if (!q) return true;
      return [record.employeeCode, record.sourceEmployeeCode, record.employeeName, record.sage.jobGrade, record.hris?.salaryGrade, record.hris?.earningProfile]
        .some((value) => String(value || '').toLowerCase().includes(q));
    });
  }, [payload?.records, query, status, type]);

  const selected = (payload?.records || []).find((record) => record.employeeCode === selectedCode) || filtered[0] || null;
  const lastLoaded = payload?.generatedAt || initialNow;

  const exportCsv = () => {
    const headers = ['Employee Code', 'Source Code', 'Name', 'Type', 'Status', 'Sage Gross', 'HRIS Gross', 'Variance', 'Profile', 'Calculated Basic', 'Issues'];
    const lines = filtered.map((record) => [
      record.employeeCode,
      record.sourceEmployeeCode,
      record.employeeName,
      record.employeeType,
      record.status,
      record.sage.monthlyGross,
      record.hris?.monthlyGross ?? '',
      Number(record.hris?.monthlyGross || 0) - record.sage.monthlyGross,
      record.hris?.earningProfile || '',
      record.hris?.calculatedBasic || '',
      record.issues.join('; '),
    ].map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(','));
    const blob = new Blob([[headers.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'sage-payroll-migration-review.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const migratePayrollIdentity = async () => {
    setMigratingIdentity(true);
    setMigrationMessage('');
    setError('');
    try {
      const res = await fetch('/api/hris/payroll/sage-migration-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'migrate-payroll-identity' }),
      });
      const json = (await res.json()) as ApiResponse<{ migratedAt: string; summary: MigrationSummary }>;
      if (!res.ok || json.status !== 'success' || !json.data) throw new Error(json.error || `Migration request failed (${res.status})`);
      const summary = json.data.summary;
      setMigrationMessage(`Migrated ${number(summary.migrated)} payroll identity records from Sage and saved ${number(summary.savedPayslipIdentities || 0)} payslip identity snapshots locally. Missing HRIS: ${number(summary.missingHris)}. No Sage identity: ${number(summary.skippedNoIdentity)}. Failed: ${number(summary.failed)}.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to migrate Sage payroll identity records');
    } finally {
      setMigratingIdentity(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-white">
              <DatabaseZap className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-950">Sage Payroll Migration Review</h1>
              <p className="mt-1 max-w-4xl text-sm font-semibold text-slate-600">
                Permanent and lump-sum gross salary reconciliation between Sage 300 People Payroll and DLE HRIS payroll setup.
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-extrabold text-blue-800">Source: {payload?.source || 'Sage 300 Payroll'}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-extrabold text-slate-700">Loaded: {new Date(lastLoaded).toLocaleString('en-GB')}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={migratePayrollIdentity} disabled={migratingIdentity || loading} className="inline-flex h-10 items-center gap-2 rounded-xl bg-cyan-600 px-3 text-xs font-extrabold text-white hover:bg-cyan-700 disabled:cursor-wait disabled:opacity-60">
            <DatabaseZap className={`h-4 w-4 ${migratingIdentity ? 'animate-pulse' : ''}`} />
            {migratingIdentity ? 'Migrating' : 'Migrate Payroll Identity'}
          </button>
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-3 text-xs font-extrabold text-white hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60">
            <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Refreshing' : 'Refresh'}
          </button>
          <button type="button" onClick={exportCsv} disabled={!payload} className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-3 text-xs font-extrabold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400">
            <Download className="h-4 w-4" />
            Export
          </button>
        </div>
      </div>

      {error && <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">{error}</div>}
      {migrationMessage && <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">{migrationMessage}</div>}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Employees" value={number(payload?.summary.employees)} detail={`${number(payload?.summary.permanent)} permanent, ${number(payload?.summary.lumpsum)} lump-sum`} tone="blue" />
        <MetricCard label="Matched" value={number(payload?.summary.matched)} detail="Sage gross equals HRIS gross" tone="green" />
        <MetricCard label="Exceptions" value={number((payload?.summary.mismatch || 0) + (payload?.summary.missingHris || 0) + (payload?.summary.missingGross || 0))} detail="Mismatch, missing HRIS, or missing gross" tone="red" />
        <MetricCard label="Sage Gross" value={money(payload?.summary.sageGross)} detail="Total monthly Sage gross" tone="violet" />
        <MetricCard label="Variance" value={money(payload?.summary.grossVariance)} detail="HRIS gross minus Sage gross" tone={payload?.summary.grossVariance ? 'red' : 'green'} />
      </div>

      <section className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-[1fr_420px]">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-4">
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-[1fr_150px_180px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search employee, source code, grade, profile" className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-10 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
                {query && <button type="button" onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>}
              </div>
              <select value={type} onChange={(e) => setType(e.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold outline-none">
                {['All', 'Permanent', 'Lumpsum'].map((item) => <option key={item}>{item}</option>)}
              </select>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold outline-none">
                {['All', 'Matched', 'Mismatch', 'Missing HRIS', 'Missing Sage Gross', 'Review'].map((item) => <option key={item}>{item}</option>)}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[1120px] w-full text-left">
              <thead className="bg-slate-50 text-xs font-black uppercase tracking-normal text-slate-500">
                <tr>{['Employee', 'Type', 'Sage Gross', 'HRIS Gross', 'Basic', 'Profile', 'Status', 'Issues'].map((head) => <th key={head} className="px-4 py-3">{head}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((record) => (
                  <tr key={`${record.sageEmployeeId}-${record.employeeCode}`} onClick={() => setSelectedCode(record.employeeCode)} className={`cursor-pointer hover:bg-slate-50 ${selected?.employeeCode === record.employeeCode ? 'bg-blue-50/60' : ''}`}>
                    <td className="px-4 py-3">
                      <p className="text-sm font-black text-slate-950">{record.employeeName}</p>
                      <p className="text-xs font-semibold text-slate-500">{record.employeeCode} / Sage {record.sourceEmployeeCode}</p>
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-slate-700">{record.employeeType}</td>
                    <td className="px-4 py-3 text-sm font-black text-slate-900">{money(record.sage.monthlyGross)}</td>
                    <td className="px-4 py-3 text-sm font-black text-slate-900">{record.hris ? money(record.hris.monthlyGross) : 'Missing'}</td>
                    <td className="px-4 py-3 text-sm font-black text-slate-900">{record.hris ? money(record.hris.calculatedBasic) : 'Missing'}</td>
                    <td className="px-4 py-3 text-sm font-bold text-slate-700">{record.hris?.earningProfile || 'Not migrated'}</td>
                    <td className="px-4 py-3"><span className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${statusClass(record.status)}`}>{record.status}</span></td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-600">{record.issues[0] || 'No issue'}</td>
                  </tr>
                ))}
                {!filtered.length && (
                  <tr><td colSpan={8} className="px-4 py-10 text-center text-sm font-bold text-slate-500">No migration records match the current filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          {selected ? (
            <div>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-normal text-slate-400">Selected Employee</p>
                  <h2 className="mt-1 text-lg font-black text-slate-950">{selected.employeeName}</h2>
                  <p className="text-sm font-bold text-slate-500">{selected.employeeCode} / Sage ID {selected.sageEmployeeId}</p>
                </div>
                {selected.status === 'Matched' ? <CheckCircle2 className="h-6 w-6 text-emerald-600" /> : <AlertTriangle className="h-6 w-6 text-red-600" />}
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <Detail label="Sage Gross" value={money(selected.sage.monthlyGross)} />
                <Detail label="HRIS Gross" value={selected.hris ? money(selected.hris.monthlyGross) : 'Missing'} />
                <Detail label="Calculated Basic" value={selected.hris ? money(selected.hris.calculatedBasic) : 'Missing'} />
                <Detail label="Taxable Pay" value={selected.hris ? money(selected.hris.taxablePay) : 'Missing'} />
                <Detail label="Non-Taxable" value={selected.hris ? money(selected.hris.nonTaxablePay) : 'Missing'} />
                <Detail label="Variance" value={selected.hris ? money(selected.hris.monthlyGross - selected.sage.monthlyGross) : 'Missing'} />
              </div>

              <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs font-black uppercase tracking-normal text-slate-400">Mapping</p>
                <div className="mt-3 space-y-2 text-sm font-semibold text-slate-700">
                  <p>Type: <span className="font-black text-slate-950">{selected.employeeType}</span></p>
                  <p>Sage grade: <span className="font-black text-slate-950">{selected.sage.jobGrade || 'Not set'}</span></p>
                  <p>HRIS grade: <span className="font-black text-slate-950">{selected.hris?.salaryGrade || 'Not set'}</span></p>
                  <p>Profile: <span className="font-black text-slate-950">{selected.hris?.earningProfile || 'Not migrated'}</span></p>
                  <p>Remuneration: <span className="font-black text-slate-950">{selected.sage.remunerationDefinition || 'Not set'}</span></p>
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-cyan-100 bg-cyan-50 p-4">
                <p className="text-xs font-black uppercase tracking-normal text-cyan-700">Payroll Identity</p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Detail label="Sage Bank" value={selected.sage.bankName || 'Not configured'} />
                  <Detail label="HRIS Bank" value={selected.hris?.bankName || 'Not configured'} />
                  <Detail label="Sage Account" value={selected.sage.hasAccountNumber ? 'Available' : 'Not configured'} />
                  <Detail label="HRIS Account" value={selected.hris?.hasAccountNumber ? 'Available' : 'Not configured'} />
                  <Detail label="Sage PFA" value={selected.sage.pensionProvider || 'Not configured'} />
                  <Detail label="HRIS PFA" value={selected.hris?.pensionProvider || 'Not configured'} />
                  <Detail label="Sage Pension No." value={selected.sage.hasPensionNumber ? 'Available' : 'Not configured'} />
                  <Detail label="HRIS Pension No." value={selected.hris?.hasPensionNumber ? 'Available' : 'Not configured'} />
                  <Detail label="Sage Tax No." value={selected.sage.taxNumber || 'Not configured'} />
                  <Detail label="HRIS Tax No." value={selected.hris?.taxNumber || 'Not configured'} />
                </div>
              </div>

              <div className="mt-5">
                <p className="text-xs font-black uppercase tracking-normal text-slate-400">Issues</p>
                <div className="mt-2 space-y-2">
                  {(selected.issues.length ? selected.issues : ['No migration issue detected']).map((issue) => (
                    <div key={issue} className="rounded-xl border border-slate-100 bg-white px-3 py-2 text-xs font-bold text-slate-700">{issue}</div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-80 flex-col items-center justify-center text-center text-slate-500">
              <ShieldCheck className="h-10 w-10" />
              <p className="mt-3 text-sm font-bold">Select a migration row to view details.</p>
            </div>
          )}
        </aside>
      </section>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-3">
      <p className="text-[10px] font-black uppercase tracking-normal text-slate-400">{label}</p>
      <p className="mt-1 break-words text-sm font-black text-slate-950">{value}</p>
    </div>
  );
}
