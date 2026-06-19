'use client';

/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BadgeCheck, Download, Eye, FileText, Mail, Printer, RefreshCcw, Search, Send, ShieldCheck, Wallet, X } from 'lucide-react';

type Role = 'Super Admin' | 'HR Director' | 'HR Manager' | 'Payroll Officer' | 'Finance Controller' | 'Executive Management' | 'Auditor' | 'Employee';
type Tone = 'blue' | 'green' | 'amber' | 'red' | 'violet' | 'cyan' | 'slate';
type PayslipStatus = 'Ready' | 'Review' | 'Blocked';
type DeliveryStatus = 'Draft' | 'Generated' | 'Released' | 'Withheld';

type Payslip = {
  payslipId: string;
  employeeId: string;
  employeeCode: string;
  fullName: string;
  jobTitle: string;
  department: string;
  businessUnit: string;
  location: string;
  payrollGroup: string;
  salaryGrade: string;
  isDailyRate?: boolean;
  payBasis?: string;
  ratePerDay?: number | null;
  ratePerHour?: number | null;
  hoursPerDay?: number;
  daysWorked?: number | null;
  attendanceHours?: number | null;
  bookedHours?: number | null;
  idleHours?: number | null;
  payCurrency: string;
  paymentRun: string;
  bankName: string;
  maskedAccount: string;
  period: string;
  periodLabel: string;
  earnings: Array<{ label: string; amount: number | null }>;
  deductions: Array<{ label: string; amount: number | null }>;
  employerContributions: Array<{ label: string; amount: number | null }>;
  grossPay: number | null;
  totalDeductions: number | null;
  netPay: number | null;
  ytdGross: number | null;
  ytdPaye: number | null;
  ytdNet: number | null;
  status: PayslipStatus;
  deliveryStatus: DeliveryStatus;
  issues: string[];
};

type Batch = {
  id: string;
  period: string;
  periodLabel: string;
  generatedAt: string;
  generatedBy: Role;
  employeeCount: number;
  releasedCount: number;
  withheldCount: number;
  netPay: number;
  grossPay: number;
  status: 'Generated' | 'Released' | 'Partial';
  audit: Array<{ at: string; actor: Role; action: string; note?: string }>;
};

type Payload = {
  generatedAt: string;
  dataSource?: { source: string; databaseAvailable: boolean; warning: string | null; employeeCount: number };
  company: { name: string; address: string; logoUrl: string; email: string; website: string };
  period: string;
  periodLabel: string;
  role: Role;
  permissions: { canViewMoney: boolean; canGenerate: boolean; canRelease: boolean; canExport: boolean };
  batch: Batch | null;
  batches: Batch[];
  summary: { employees: number; grossPay: number | null; deductions: number | null; netPay: number | null; ready: number; review: number; blocked: number; released: number; withheld: number; exceptionCount: number };
  payslips: Payslip[];
};

type ApiResponse<T> = { status: 'success' | 'error'; data?: T; error?: string };

const moneyFmt = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 });
const numberFmt = new Intl.NumberFormat('en-GB');
const money = (value: number | null | undefined, allowed = true) => (!allowed || value === null || value === undefined ? 'Restricted' : moneyFmt.format(value));
const number = (value: number | null | undefined) => numberFmt.format(Number(value || 0));
const toneStyles: Record<Tone, { card: string; icon: string; chip: string; bar: string }> = {
  blue: { card: 'bg-blue-50 border-blue-200', icon: 'bg-blue-600 text-white', chip: 'bg-blue-100 text-blue-800', bar: 'bg-blue-600' },
  green: { card: 'bg-emerald-50 border-emerald-200', icon: 'bg-emerald-600 text-white', chip: 'bg-emerald-100 text-emerald-800', bar: 'bg-emerald-600' },
  amber: { card: 'bg-amber-50 border-amber-200', icon: 'bg-amber-500 text-white', chip: 'bg-amber-100 text-amber-800', bar: 'bg-amber-500' },
  red: { card: 'bg-red-50 border-red-200', icon: 'bg-red-600 text-white', chip: 'bg-red-100 text-red-800', bar: 'bg-red-600' },
  violet: { card: 'bg-violet-50 border-violet-200', icon: 'bg-violet-600 text-white', chip: 'bg-violet-100 text-violet-800', bar: 'bg-violet-600' },
  cyan: { card: 'bg-cyan-50 border-cyan-200', icon: 'bg-cyan-600 text-white', chip: 'bg-cyan-100 text-cyan-800', bar: 'bg-cyan-600' },
  slate: { card: 'bg-slate-50 border-slate-200', icon: 'bg-slate-800 text-white', chip: 'bg-slate-100 text-slate-800', bar: 'bg-slate-700' },
};
const statusTone = (status: string): Tone => (status === 'Ready' || status === 'Released' || status === 'Generated' ? 'green' : status === 'Blocked' || status === 'Withheld' ? 'red' : status === 'Review' || status === 'Partial' ? 'amber' : 'slate');

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

function PayslipPreview({ payload, slip, canViewMoney }: { payload: Payload; slip: Payslip; canViewMoney: boolean }) {
  const tableRows = (items: Array<{ label: string; amount: number | null }>) => items.length ? items : [{ label: 'No items', amount: 0 }];
  const payslipTitle = slip.isDailyRate ? 'Daily Rate Payslip' : 'Official Payslip';
  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-100 p-4 sm:p-6 lg:p-8 print:border-0 print:bg-white print:p-0">
      <div id="payslip-print-area" className="mx-auto w-full max-w-[980px] overflow-hidden rounded-[14px] border border-slate-200 bg-white shadow-sm print:max-w-none print:rounded-none print:border-0 print:shadow-none">
        <div className="h-2 bg-blue-600 print:bg-blue-600" />
        <div className="border-b border-slate-200 bg-white px-6 py-6 sm:px-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <div className="relative h-16 w-52 shrink-0 overflow-hidden rounded-xl border border-slate-100 bg-white p-2">
                <Image src={payload.company.logoUrl} alt={payload.company.name} fill sizes="208px" className="object-contain" />
              </div>
              <div className="min-w-0">
                <h2 className="text-xl font-black text-slate-950">{payload.company.name}</h2>
                <p className="mt-1 max-w-xl text-xs font-semibold leading-5 text-slate-500">{payload.company.address}</p>
                <p className="mt-1 text-xs font-bold text-slate-500">{payload.company.website} | {payload.company.email}</p>
              </div>
            </div>
            <div className="rounded-2xl border border-blue-100 bg-blue-50 px-5 py-4 text-left sm:text-right">
              <p className="text-xs font-black uppercase tracking-normal text-blue-700">{payslipTitle}</p>
              <p className="mt-1 text-2xl font-black text-slate-950">{slip.periodLabel}</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">{slip.payslipId}</p>
            </div>
          </div>
        </div>

        <div className="px-6 py-6 sm:px-8">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_280px]">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-xs font-black uppercase tracking-normal text-slate-500">Employee Information</p>
              <div className="mt-4 grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
                {[
                  ['Employee', `${slip.fullName} (${slip.employeeId})`],
                  ['Job Title', slip.jobTitle || 'Not assigned'],
                  ['Department', slip.department],
                  ['Business Unit', slip.businessUnit],
                  ['Location', slip.location],
                  ['Grade / Group', `${slip.salaryGrade} / ${slip.payrollGroup}`],
                  ['Pay Basis', slip.payBasis || (slip.isDailyRate ? 'Daily Rate' : 'Monthly Salary')],
                  ['Payment Run', slip.paymentRun],
                  ['Bank', `${slip.bankName} ${slip.maskedAccount}`],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-[11px] font-black uppercase text-slate-400">{label}</p>
                    <p className="mt-1 text-sm font-bold leading-5 text-slate-900">{value}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-col justify-between rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
              <div>
                <p className="text-xs font-black uppercase tracking-normal text-emerald-700">Net Pay</p>
                <p className="mt-4 text-3xl font-black text-emerald-950">{money(slip.netPay, canViewMoney)}</p>
                <p className="mt-2 text-xs font-semibold text-emerald-700">Delivery: {slip.deliveryStatus}</p>
              </div>
              <span className={`mt-4 inline-flex w-fit rounded-full px-2.5 py-1 text-[11px] font-black ${toneStyles[statusTone(slip.status)].chip}`}>{slip.status}</span>
            </div>
          </div>
          {slip.isDailyRate ? (
            <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl border border-cyan-200 bg-cyan-50 p-4 sm:grid-cols-3 lg:grid-cols-6">
              <div>
                <p className="text-[11px] font-black uppercase text-cyan-700">Daily Rate</p>
                <p className="mt-1 text-sm font-black text-slate-950">{money(slip.ratePerDay, canViewMoney)}</p>
              </div>
              <div>
                <p className="text-[11px] font-black uppercase text-cyan-700">Hourly Rate</p>
                <p className="mt-1 text-sm font-black text-slate-950">{money(slip.ratePerHour, canViewMoney)}</p>
              </div>
              <div>
                <p className="text-[11px] font-black uppercase text-cyan-700">Days Worked</p>
                <p className="mt-1 text-sm font-black text-slate-950">{number(slip.daysWorked)}</p>
              </div>
              <div>
                <p className="text-[11px] font-black uppercase text-cyan-700">Booked Hours</p>
                <p className="mt-1 text-sm font-black text-slate-950">{number(slip.bookedHours)}</p>
              </div>
              <div>
                <p className="text-[11px] font-black uppercase text-cyan-700">Attendance Hours</p>
                <p className="mt-1 text-sm font-black text-slate-950">{number(slip.attendanceHours)}</p>
              </div>
              <div>
                <p className="text-[11px] font-black uppercase text-cyan-700">Basis</p>
                <p className="mt-1 text-sm font-black text-slate-950">{number(slip.hoursPerDay || 8)} hours per day</p>
              </div>
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-4 px-6 pb-6 sm:px-8 lg:grid-cols-2">
          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <div className="border-b border-slate-100 bg-blue-50 px-5 py-3 text-sm font-black text-blue-950">Earnings</div>
            <div className="divide-y divide-slate-100">
              {tableRows(slip.earnings).map((item) => (
                <div key={item.label} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                  <span className="font-semibold text-slate-600">{item.label}</span>
                  <span className="font-black text-slate-950">{money(item.amount, canViewMoney)}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between gap-4 border-t border-blue-100 bg-blue-50 px-5 py-3 text-sm">
              <span className="font-black text-blue-900">Gross Pay</span>
              <span className="font-black text-blue-900">{money(slip.grossPay, canViewMoney)}</span>
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <div className="border-b border-slate-100 bg-red-50 px-5 py-3 text-sm font-black text-red-950">Deductions</div>
            <div className="divide-y divide-slate-100">
              {tableRows(slip.deductions).map((item) => (
                <div key={item.label} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                  <span className="font-semibold text-slate-600">{item.label}</span>
                  <span className="font-black text-red-700">{money(item.amount, canViewMoney)}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between gap-4 border-t border-red-100 bg-red-50 px-5 py-3 text-sm">
              <span className="font-black text-red-900">Total Deductions</span>
              <span className="font-black text-red-900">{money(slip.totalDeductions, canViewMoney)}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 px-6 pb-6 sm:px-8 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 p-5">
            <p className="text-xs font-black uppercase tracking-normal text-slate-500">Year To Date</p>
            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-black uppercase text-slate-500">Gross</p><p className="mt-1 font-black text-slate-950">{money(slip.ytdGross, canViewMoney)}</p></div>
              <div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-black uppercase text-slate-500">PAYE</p><p className="mt-1 font-black text-red-700">{money(slip.ytdPaye, canViewMoney)}</p></div>
              <div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-black uppercase text-slate-500">Net</p><p className="mt-1 font-black text-emerald-700">{money(slip.ytdNet, canViewMoney)}</p></div>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 p-5">
            <p className="text-xs font-black uppercase tracking-normal text-slate-500">Employer Contributions</p>
            <div className="mt-4 space-y-3">
              {tableRows(slip.employerContributions).map((item) => (
                <div key={item.label} className="flex items-center justify-between gap-4 text-sm">
                  <span className="font-semibold text-slate-600">{item.label}</span>
                  <span className="font-black text-slate-950">{money(item.amount, canViewMoney)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-slate-200 bg-slate-50 px-6 py-4 text-center text-xs font-semibold leading-5 text-slate-500 sm:px-8">
          This is a computer-generated payslip. For questions, contact {payload.company.email}. Generated from DLE HRIS payroll records.
        </div>
      </div>
    </div>
  );
}

export default function PayslipGenerationClient({ initialNow }: { initialNow: string }) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [role, setRole] = useState<Role>('Payroll Officer');
  const [period, setPeriod] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('All');
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const load = async (targetPeriod = period) => {
    setLoading(true);
    setError('');
    try {
      const suffix = targetPeriod ? `?period=${encodeURIComponent(targetPeriod)}` : '';
      const res = await fetch(`/api/hris/payroll/payslip-generation${suffix}`, { headers: { 'x-hris-role': role }, cache: 'no-store' });
      const json = (await res.json()) as ApiResponse<Payload>;
      if (!res.ok || json.status !== 'success' || !json.data) throw new Error(json.error || `Payslip request failed (${res.status})`);
      const data = json.data;
      setPayload(data);
      setPeriod(data.period);
      setSelectedId((current) => current || data.payslips[0]?.employeeId || '');
    } catch (event) {
      setError(event instanceof Error ? event.message : 'Unable to load payslip generation');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(period);
  }, [role]);

  const canViewMoney = Boolean(payload?.permissions.canViewMoney);
  const selected = payload?.payslips.find((slip) => slip.employeeId === selectedId) || payload?.payslips[0] || null;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (payload?.payslips || []).filter((slip) => {
      if (status !== 'All' && slip.deliveryStatus !== status && slip.status !== status) return false;
      if (!q) return true;
      return [slip.employeeId, slip.fullName, slip.department, slip.payrollGroup, slip.location].some((item) => String(item || '').toLowerCase().includes(q));
    });
  }, [payload?.payslips, query, status]);

  const batchAction = async (action: string) => {
    setPosting(action);
    setToast('');
    try {
      const res = await fetch('/api/hris/payroll/payslip-generation', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-hris-role': role },
        body: JSON.stringify({ action, period, note: `Payslip ${action} from generation console` }),
      });
      const json = (await res.json()) as ApiResponse<{ batch: Batch }>;
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Unable to update payslip batch');
      setToast(`Payslip batch ${json.data?.batch.status || 'updated'}.`);
      await load(period);
    } catch (event) {
      setToast(event instanceof Error ? event.message : 'Unable to update payslip batch');
    } finally {
      setPosting('');
    }
  };

  const exportCsv = () => {
    window.location.href = `/api/hris/payroll/payslip-generation?period=${encodeURIComponent(period)}&format=csv`;
  };

  const printPayslip = () => window.print();

  return (
    <div className="min-h-screen bg-white">
      <style jsx global>{`
        @page { size: A4; margin: 14mm; }
        @media print {
          html, body { background: white !important; }
          body * { visibility: hidden; }
          #payslip-print-area, #payslip-print-area * { visibility: visible; }
          #payslip-print-area { position: absolute; left: 0; right: 0; top: 0; width: 100%; margin: 0 auto; }
        }
      `}</style>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between print:hidden">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-white">
              <FileText className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-950">Payslip Generation</h1>
              <p className="mt-1 max-w-5xl text-sm font-semibold text-slate-600">
                Generate branded, audit-ready Dorman Long payslips with payroll totals, statutory deductions, YTD values, delivery controls, and print-ready layouts.
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-extrabold text-blue-800">Period: {payload?.periodLabel || 'Loading'}</span>
            <span className={`rounded-full px-3 py-1 text-xs font-extrabold ${toneStyles[statusTone(payload?.batch?.status || 'Draft')].chip}`}>Batch: {payload?.batch?.status || 'Draft'}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-extrabold text-slate-700">Loaded: {new Date(payload?.generatedAt || initialNow).toLocaleString('en-GB')}</span>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-extrabold text-emerald-800">{payload?.dataSource?.employeeCount || 0} employees</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-800 outline-none" />
          <select value={role} onChange={(event) => setRole(event.target.value as Role)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-800 outline-none">
            {['Payroll Officer', 'Finance Controller', 'HR Director', 'HR Manager', 'Executive Management', 'Auditor', 'Super Admin', 'Employee'].map((item) => <option key={item}>{item}</option>)}
          </select>
          <button type="button" onClick={() => void load(period)} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-3 text-xs font-extrabold text-white hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60">
            <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button type="button" onClick={() => void batchAction('generate')} disabled={!payload?.permissions.canGenerate || posting === 'generate'} className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-3 text-xs font-extrabold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400">
            <BadgeCheck className={`h-4 w-4 ${posting === 'generate' ? 'animate-spin' : ''}`} />
            Generate
          </button>
          <button type="button" onClick={() => void batchAction('release')} disabled={!payload?.permissions.canRelease || posting === 'release'} className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-3 text-xs font-extrabold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400">
            <Send className={`h-4 w-4 ${posting === 'release' ? 'animate-spin' : ''}`} />
            Release
          </button>
        </div>
      </div>

      {error && <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800 print:hidden">{error}</div>}
      {toast && <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800 print:hidden">{toast}</div>}
      {payload?.dataSource?.warning && <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900 print:hidden">{payload.dataSource.warning}</div>}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 print:hidden">
        <MetricCard label="Payslips" value={number(payload?.summary.employees)} detail={`${number(payload?.summary.ready)} ready, ${number(payload?.summary.blocked)} withheld risk`} icon={FileText} tone="blue" />
        <MetricCard label="Gross Pay" value={money(payload?.summary.grossPay, canViewMoney)} detail="Total payslip earnings" icon={Wallet} tone="violet" />
        <MetricCard label="Net Pay" value={money(payload?.summary.netPay, canViewMoney)} detail="Total released payroll value" icon={ShieldCheck} tone="green" />
        <MetricCard label="Exceptions" value={number(payload?.summary.exceptionCount)} detail={`${number(payload?.summary.review)} review and ${number(payload?.summary.blocked)} blocked`} icon={AlertTriangle} tone={(payload?.summary.blocked || 0) > 0 ? 'red' : (payload?.summary.review || 0) > 0 ? 'amber' : 'green'} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-[380px_1fr]">
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm print:hidden">
          <div className="border-b border-slate-100 p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search payslips" className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-9 text-sm font-semibold outline-none focus:border-dle-blue focus:ring-2 focus:ring-dle-blue/20" />
              {query && <button type="button" onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>}
            </div>
            <select value={status} onChange={(event) => setStatus(event.target.value)} className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none">
              {['All', 'Ready', 'Review', 'Blocked', 'Draft', 'Generated', 'Released', 'Withheld'].map((item) => <option key={item}>{item}</option>)}
            </select>
          </div>
          <div className="max-h-[720px] overflow-y-auto divide-y divide-slate-100">
            {filtered.map((slip) => (
              <button key={slip.employeeId} type="button" onClick={() => setSelectedId(slip.employeeId)} className={`block w-full p-4 text-left hover:bg-slate-50 ${selected?.employeeId === slip.employeeId ? 'bg-blue-50' : 'bg-white'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-950">{slip.fullName}</p>
                    <p className="text-xs font-semibold text-slate-500">{slip.employeeId} - {slip.department}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black ${toneStyles[statusTone(slip.deliveryStatus)].chip}`}>{slip.deliveryStatus}</span>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs font-bold">
                  <span className="text-slate-500">{slip.payrollGroup}</span>
                  <span className="text-emerald-700">{money(slip.netPay, canViewMoney)}</span>
                </div>
              </button>
            ))}
            {filtered.length === 0 && <div className="p-8 text-center text-sm font-bold text-slate-500">No payslips match your filters.</div>}
          </div>
        </section>

        <main>
          <div className="mb-4 flex flex-wrap items-center justify-end gap-2 print:hidden">
            <button type="button" onClick={printPayslip} disabled={!selected} className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-3 text-xs font-extrabold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400">
              <Printer className="h-4 w-4" />
              Print
            </button>
            <button type="button" onClick={exportCsv} disabled={!payload?.permissions.canExport} className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-3 text-xs font-extrabold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400">
              <Download className="h-4 w-4" />
              Export Batch
            </button>
            <button type="button" className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-700">
              <Mail className="h-4 w-4" />
              Email Ready
            </button>
            <button type="button" className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-700">
              <Eye className="h-4 w-4" />
              Preview
            </button>
          </div>
          {payload && selected ? <PayslipPreview payload={payload} slip={selected} canViewMoney={canViewMoney} /> : <div className="rounded-2xl border border-slate-200 bg-slate-50 p-12 text-center text-sm font-bold text-slate-500">Select an employee payslip to preview.</div>}
        </main>
      </div>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm print:hidden">
        <h2 className="text-sm font-black uppercase tracking-normal text-slate-900">Generation History</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {(payload?.batches || []).map((batch) => (
            <div key={batch.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-black text-slate-950">{batch.periodLabel}</p>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${toneStyles[statusTone(batch.status)].chip}`}>{batch.status}</span>
              </div>
              <p className="mt-2 text-xs font-semibold text-slate-500">{batch.employeeCount} payslips - {batch.releasedCount} released - {batch.withheldCount} withheld</p>
              <p className="mt-2 text-xs font-bold text-slate-700">Generated by {batch.generatedBy} on {new Date(batch.generatedAt).toLocaleString('en-GB')}</p>
            </div>
          ))}
          {!payload?.batches.length && <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm font-bold text-slate-500">No payslip batches generated yet.</div>}
        </div>
      </section>
    </div>
  );
}
