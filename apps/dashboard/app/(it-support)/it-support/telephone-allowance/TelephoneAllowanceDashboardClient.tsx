'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowRight,
  BarChart3,
  CalendarDays,
  Check,
  ChevronRight,
  Equal,
  FileCheck2,
  Minus,
  Plus,
  RefreshCw,
  TrendingUp,
  Users,
  WalletCards,
} from 'lucide-react';
import { moneyNgn, useTelephoneAllowanceApi, type TaCapabilities } from './_components/ta-shared';

type Cycle = {
  id: string;
  cycleCode: string;
  pairLabel: string;
  year: number;
  month1: number;
  month2: number;
  status: string;
  beneficiaryCount: number;
  month1Total: number;
  month2Total: number;
  bimonthlyTotal: number;
  preparedBy: string;
  currentOwnerRole: string;
  updatedAt: string;
  changes?: Array<{ changeType: string }>;
};

type DashboardPayload = {
  currentCycle: Cycle | null;
  recentCycles?: Cycle[];
  pendingActions?: Array<{ cycleId: string; cycleCode: string; status: string; href: string }>;
  openExceptions?: Array<{ id: string }>;
  capabilities: TaCapabilities;
};

const stages = [
  { label: 'IT Preparation', match: ['DRAFT', 'RETURNED_FOR_CORRECTION'] },
  { label: 'HR Review', match: ['PENDING_HR_REVIEW'] },
  { label: 'IT Validation', match: ['RETURNED_TO_IT', 'IT_VALIDATION'] },
  { label: 'HR Approval', match: ['PENDING_HR_APPROVAL'] },
  { label: 'MD Approval', match: ['PENDING_MD_APPROVAL'] },
  { label: 'CFO Authorization', match: ['PENDING_CFO_AUTHORIZATION'] },
  { label: 'Payment', match: ['AUTHORIZED_FOR_PAYMENT', 'PAYMENT_PROCESSING', 'PARTIALLY_PAID', 'PAID', 'COMPLETED'] },
];

const monthName = (year: number, month: number, style: 'long' | 'short' = 'long') =>
  new Date(Date.UTC(year, month - 1, 1)).toLocaleString('en', { month: style });

const formatDay = (iso?: string) => {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getDate()} ${date.toLocaleString('en-GB', { month: 'short' })} ${date.getFullYear()}`;
};

export default function TelephoneAllowanceDashboardClient() {
  const { get, toast, error } = useTelephoneAllowanceApi();
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await get<DashboardPayload>('dashboard'));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [get]);

  useEffect(() => {
    void load();
  }, [load]);

  const cycle = data?.currentCycle || null;
  const previous = (data?.recentCycles || []).find((row) => row.id !== cycle?.id && (row.year < (cycle?.year || 0) || (row.year === cycle?.year && row.month1 < (cycle?.month1 || 0))))
    || (data?.recentCycles || []).find((row) => row.cycleCode !== cycle?.cycleCode)
    || null;
  const total = cycle?.bimonthlyTotal || 0;
  const previousTotal = previous?.bimonthlyTotal || 0;
  const variance = total - previousTotal;
  const variancePct = previousTotal ? (variance / previousTotal) * 100 : 0;
  const changes = cycle?.changes || [];
  const added = changes.filter((row) => row.changeType === 'ADD').length;
  const removed = changes.filter((row) => row.changeType === 'REMOVE').length;
  const amountChanges = changes.filter((row) => row.changeType === 'AMOUNT' || row.changeType === 'ELIGIBILITY').length;
  const peopleDelta = (cycle?.beneficiaryCount || 0) - (previous?.beneficiaryCount || 0);
  const stageIndex = Math.max(0, stages.findIndex((stage) => cycle && stage.match.includes(cycle.status)));
  const currentStage = stages[stageIndex];
  const nextStage = stages[stageIndex + 1];
  const month1 = cycle ? monthName(cycle.year, cycle.month1) : 'Month 1';
  const month2 = cycle ? monthName(cycle.year, cycle.month2) : 'Month 2';
  const pair = cycle ? `${monthName(cycle.year, cycle.month1, 'short').toUpperCase()} – ${monthName(cycle.year, cycle.month2, 'short').toUpperCase()} ${cycle.year}` : 'No active cycle';
  const exceptions = data?.openExceptions?.length || 0;
  const continueHref = data?.pendingActions?.[0]?.href || '/it-support/telephone-allowance/manage';
  const continueTitle = cycle?.status === 'DRAFT' || cycle?.status === 'RETURNED_FOR_CORRECTION'
    ? 'Continue cycle preparation'
    : cycle
      ? `${cycle.cycleCode} is ${cycle.status.replaceAll('_', ' ').toLowerCase()}`
      : 'No cycle is open';

  return (
    <div className="space-y-4 text-slate-900">
      {toast ? (
        <div className={`rounded-xl border px-4 py-3 text-sm font-semibold ${error && toast === error ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>
          {toast}
        </div>
      ) : null}

      <p className="flex items-center gap-1 text-xs font-semibold text-slate-500">
        IT & SUPPORT <ChevronRight className="h-3 w-3" /> Telephone Allowance <ChevronRight className="h-3 w-3" />
        <span className="font-bold text-slate-800">Dashboard</span>
      </p>

      <section className="flex flex-col gap-4 rounded-2xl border border-teal-200 bg-gradient-to-r from-teal-50 to-white px-5 py-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[11px] font-extrabold tracking-[0.14em] text-teal-700">TELEPHONE ALLOWANCE</p>
          <h1 className="mt-1 text-[26px] font-black leading-tight text-slate-950">Telephone Allowance Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">Executive and operational overview of employee call-credit cycles, approvals and payment readiness.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void load()} className="inline-flex h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-xs font-bold text-slate-800">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <Link href="/it-support/telephone-allowance/manage" className="inline-flex h-11 items-center gap-2 rounded-lg bg-teal-700 px-4 text-xs font-bold text-white">
            Open Allowance Management <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Metric icon={<CalendarDays className="h-5 w-5" />} tone="bg-teal-50 text-teal-700" label="Current Cycle" value={pair} sub={cycle?.cycleCode || 'Create the next cycle'} />
        <Metric icon={<Users className="h-5 w-5" />} tone="bg-sky-50 text-sky-700" label="Beneficiaries" value={String(cycle?.beneficiaryCount ?? 0)} sub={previous ? (peopleDelta === 0 ? 'Same as previous cycle' : `${peopleDelta > 0 ? '+' : ''}${peopleDelta} vs previous cycle`) : 'Employees on this cycle'} />
        <Metric icon={<WalletCards className="h-5 w-5" />} tone="bg-emerald-50 text-emerald-700" label={month1} value={moneyNgn(cycle?.month1Total)} sub="Payable employees" />
        <Metric icon={<WalletCards className="h-5 w-5" />} tone="bg-violet-50 text-violet-700" label={month2} value={moneyNgn(cycle?.month2Total)} sub="Payable employees" />
        <Metric icon={<BarChart3 className="h-5 w-5" />} tone="bg-orange-50 text-orange-700" label="Bimonthly Total" value={moneyNgn(total)} sub={cycle ? `${month1.slice(0, 3)} + ${month2.slice(0, 3)}` : 'No cycle'} />
        <Metric icon={<Activity className="h-5 w-5" />} tone="bg-slate-100 text-slate-800" label="Current Status" value={(cycle?.status || '—').replaceAll('_', ' ')} sub={cycle ? `Owner: ${cycle.currentOwnerRole}` : 'No owner'} />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-extrabold tracking-wide text-teal-700">APPROVAL JOURNEY</p>
            <h2 className="text-base font-black">Workflow Progress</h2>
          </div>
          {cycle ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-extrabold text-slate-700">{cycle.status.replaceAll('_', ' ')}</span> : null}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-7">
          {stages.map((stage, index) => {
            const complete = Boolean(cycle) && index < stageIndex;
            const current = Boolean(cycle) && index === stageIndex;
            return (
              <div key={stage.label} className="relative text-center">
                {index < stages.length - 1 ? <span className={`absolute left-[calc(50%+18px)] right-[calc(-50%+18px)] top-4 hidden h-0.5 xl:block ${complete ? 'bg-teal-600' : 'bg-slate-200'}`} /> : null}
                <span className={`relative z-10 mx-auto grid h-9 w-9 place-items-center rounded-full border-2 text-xs font-extrabold ${complete || current ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-300 bg-white text-slate-400'}`}>
                  {complete || (current && cycle?.status === 'COMPLETED') ? <Check className="h-4 w-4" /> : index + 1}
                </span>
                <p className="mt-2 text-[11px] font-bold">{stage.label}</p>
                <p className="text-[10px] text-slate-500">{complete ? 'Completed' : current ? 'Current' : 'Pending'}</p>
                {complete && cycle ? <p className="text-[10px] text-teal-700">{formatDay(cycle.updatedAt)}</p> : null}
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-extrabold tracking-wide text-teal-700">CYCLE PERFORMANCE</p>
              <h2 className="text-base font-black">Current vs Previous Cycle</h2>
            </div>
            <Link href="/it-support/telephone-allowance/manage" className="inline-flex items-center gap-1 text-xs font-bold text-teal-800">
              View previous cycles <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="mt-4 grid items-center gap-3 md:grid-cols-[1fr_auto_1fr]">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[11px] text-slate-500">Current · {cycle ? `${cycle.pairLabel} ${cycle.year}` : '—'}</p>
              <p className="my-1 text-2xl font-black">{moneyNgn(total)}</p>
              <p className="text-[11px] text-slate-500">{cycle?.beneficiaryCount || 0} beneficiaries</p>
            </div>
            <div className="text-center text-slate-500">
              <Equal className="mx-auto h-5 w-5" />
              <p className="mt-1 text-sm font-black text-slate-800">{moneyNgn(Math.abs(variance))}</p>
              <p className="text-[10px]">{variancePct === 0 ? '0.00% variance' : `${variancePct > 0 ? '+' : ''}${variancePct.toFixed(2)}% variance`}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-[11px] text-slate-500">Previous · {previous ? `${previous.pairLabel} ${previous.year}` : '—'}</p>
              <p className="my-1 text-2xl font-black">{previous ? moneyNgn(previousTotal) : '—'}</p>
              <p className="text-[11px] text-slate-500">{previous ? `${previous.beneficiaryCount} beneficiaries` : 'No prior cycle'}</p>
            </div>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <Change icon={<Plus className="h-4 w-4" />} label="Added" value={String(added)} tone="bg-emerald-50 text-emerald-700" />
            <Change icon={<Minus className="h-4 w-4" />} label="Removed" value={String(removed)} tone="bg-rose-50 text-rose-700" />
            <Change icon={<TrendingUp className="h-4 w-4" />} label="Amount Changes" value={String(amountChanges)} tone="bg-amber-50 text-amber-700" />
            <Change icon={<Equal className="h-4 w-4" />} label="Net Beneficiary Change" value={String(peopleDelta)} tone="bg-slate-100 text-slate-700" />
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <MonthBar label={month1} value={cycle?.month1Total || 0} total={total} />
            <MonthBar label={month2} value={cycle?.month2Total || 0} total={total} />
          </div>
        </section>

        <section className="rounded-2xl border border-teal-200 bg-gradient-to-br from-teal-50 to-white p-5 shadow-sm">
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-teal-100 text-teal-800"><FileCheck2 className="h-5 w-5" /></span>
          <p className="mt-4 text-[11px] font-extrabold tracking-wide text-teal-700">PENDING ACTION</p>
          <h2 className="mt-1 text-xl font-black">{continueTitle}</h2>
          <p className="mt-2 text-xs leading-5 text-slate-600">
            {cycle ? <><b>{cycle.cycleCode}</b> is {cycle.status.replaceAll('_', ' ').toLowerCase()} and currently owned by {cycle.currentOwnerRole}.</> : 'Create the next cycle from Allowance Management.'}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-teal-100 bg-white p-3">
              <p className="text-[10px] text-slate-500">Current stage</p>
              <p className="text-xs font-bold">{currentStage?.label || '—'}</p>
            </div>
            <div className="rounded-lg border border-teal-100 bg-white p-3">
              <p className="text-[10px] text-slate-500">Next stage</p>
              <p className="text-xs font-bold">{nextStage?.label || 'Complete'}</p>
            </div>
          </div>
          <Link href={continueHref} className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-teal-700 text-xs font-bold text-white">
            Continue Preparation <ArrowRight className="h-4 w-4" />
          </Link>
          <p className="mt-3 flex gap-2 text-[11px] leading-5 text-slate-500">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            Inactive Employee Directory records are removed from the open cycle. Validate beneficiaries and monthly amounts before sending the cycle to HR.
          </p>
        </section>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-extrabold tracking-wide text-teal-700">RECENT ACTIVITY</p>
            <h2 className="text-base font-black">Cycle Snapshot</h2>
          </div>
          <Link href="/it-support/telephone-allowance/payment-reporting" className="inline-flex items-center gap-1 text-xs font-bold text-teal-800">
            Open reports <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="mt-3 grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2 xl:grid-cols-5">
          <Snap label="Prepared by" value={cycle?.preparedBy || '—'} />
          <Snap label="Last updated" value={formatDay(cycle?.updatedAt) || '—'} />
          <Snap label={month1} value={moneyNgn(cycle?.month1Total)} />
          <Snap label={month2} value={moneyNgn(cycle?.month2Total)} />
          <Snap label="Validation" value={exceptions ? `${exceptions} open exceptions` : 'Ready for review'} ok={!exceptions} />
        </div>
      </section>
    </div>
  );
}

function Metric({ icon, tone, label, value, sub }: { icon: React.ReactNode; tone: string; label: string; value: string; sub: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${tone}`}>{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase text-slate-500">{label}</p>
        <p className="truncate text-base font-black">{value}</p>
        <p className="truncate text-[10px] text-slate-500">{sub}</p>
      </div>
    </div>
  );
}

function Change({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
      <span className={`grid h-8 w-8 place-items-center rounded-lg ${tone}`}>{icon}</span>
      <div>
        <p className="text-[10px] text-slate-500">{label}</p>
        <p className="text-base font-black">{value}</p>
      </div>
    </div>
  );
}

function MonthBar({ label, value, total }: { label: string; value: number; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs font-bold">
        <span>{label}</span>
        <span>{moneyNgn(value)}</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-slate-100">
        <div className="h-2 rounded-full bg-teal-700" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-[10px] text-slate-500">{pct}% of cycle value</p>
    </div>
  );
}

function Snap({ label, value, ok = false }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="xl:border-r xl:border-slate-100 xl:pr-4 xl:last:border-0">
      <p className="text-[10px] text-slate-500">{label}</p>
      <p className={`mt-1 flex items-center gap-1 text-xs font-bold ${ok ? 'text-teal-800' : 'text-slate-900'}`}>
        {ok ? <Check className="h-3.5 w-3.5" /> : null}
        {value}
      </p>
    </div>
  );
}
