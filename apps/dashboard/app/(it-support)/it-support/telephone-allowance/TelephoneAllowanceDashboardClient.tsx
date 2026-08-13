'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Phone, RefreshCw, Users } from 'lucide-react';
import {
  moneyNgn,
  statusTone,
  TaShell,
  useTelephoneAllowanceApi,
  WorkflowStepper,
  type TaCapabilities,
} from './_components/ta-shared';

type DashboardPayload = {
  currentCycle: null | {
    id: string;
    cycleCode: string;
    pairLabel: string;
    year: number;
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
  recentCycles?: Array<{ cycleCode: string; bimonthlyTotal: number; beneficiaryCount: number; status: string }>;
  pendingActions?: Array<{ cycleId: string; cycleCode: string; status: string; href: string }>;
  openExceptions?: Array<{ id: string }>;
  capabilities: TaCapabilities;
};

export default function TelephoneAllowanceDashboardClient() {
  const { get, toast, error } = useTelephoneAllowanceApi();
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await get<DashboardPayload>('dashboard');
      setData(payload);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [get]);

  useEffect(() => {
    void load();
  }, [load]);

  const cycle = data?.currentCycle;
  const prev = (data?.recentCycles || []).find((c) => c.cycleCode !== cycle?.cycleCode) || null;
  const variance = (cycle?.bimonthlyTotal || 0) - (prev?.bimonthlyTotal || 0);
  const changes = cycle?.changes || [];
  const added = changes.filter((c) => c.changeType === 'ADD').length;
  const removed = changes.filter((c) => c.changeType === 'REMOVE').length;
  const amountChanges = changes.filter((c) => c.changeType === 'AMOUNT').length;
  const pending = data?.pendingActions?.[0] || null;
  const pendingAction = pending
    ? {
        title: `${pending.cycleCode} needs your attention`,
        detail: `Status: ${pending.status.replaceAll('_', ' ')}`,
        href: pending.href,
      }
    : null;

  return (
    <TaShell
      title="Dashboard"
      subtitle="Executive and operational overview for employee telephone / call-credit allowances."
      toast={toast}
      error={error}
    >
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void load()} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 hover:bg-slate-50">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
        <Link href="/it-support/telephone-allowance/manage" className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-teal-700 px-3 text-xs font-black text-white hover:bg-teal-800">
          Open Allowance Management <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Current Cycle', value: cycle ? `${cycle.pairLabel} ${cycle.year}` : 'None', detail: cycle?.cycleCode || 'Create next cycle from Management', icon: Phone },
          { label: 'Beneficiaries', value: String(cycle?.beneficiaryCount ?? 0), detail: 'Employees with payable amounts', icon: Users },
          { label: 'Bimonthly Value', value: moneyNgn(cycle?.bimonthlyTotal), detail: `${moneyNgn(cycle?.month1Total)} + ${moneyNgn(cycle?.month2Total)}` },
          { label: 'Workflow Status', value: (cycle?.status || '—').replaceAll('_', ' '), detail: cycle?.currentOwnerRole || 'No active owner' },
        ].map((card) => (
          <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">{card.label}</p>
            <p className="mt-2 text-xl font-black text-slate-950">{card.value}</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">{card.detail}</p>
          </div>
        ))}
      </section>

      {cycle ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-black text-slate-950">Workflow</h2>
            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${statusTone(cycle.status)}`}>{cycle.status.replaceAll('_', ' ')}</span>
          </div>
          <WorkflowStepper status={cycle.status} />
          <p className="mt-3 text-xs font-semibold text-slate-500">Prepared by {cycle.preparedBy} · Updated {new Date(cycle.updatedAt).toLocaleString()}</p>
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-black text-slate-950">Cycle metrics</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div><p className="text-xs font-bold text-slate-500">Month 1</p><p className="font-black">{moneyNgn(cycle?.month1Total)}</p></div>
            <div><p className="text-xs font-bold text-slate-500">Month 2</p><p className="font-black">{moneyNgn(cycle?.month2Total)}</p></div>
            <div><p className="text-xs font-bold text-slate-500">Added</p><p className="font-black text-emerald-700">{added}</p></div>
            <div><p className="text-xs font-bold text-slate-500">Removed</p><p className="font-black text-rose-700">{removed}</p></div>
            <div><p className="text-xs font-bold text-slate-500">Amount changes</p><p className="font-black text-amber-700">{amountChanges}</p></div>
            <div><p className="text-xs font-bold text-slate-500">vs Previous</p><p className={`font-black ${variance >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{variance >= 0 ? '+' : ''}{moneyNgn(variance)}</p></div>
          </div>
          {prev ? <p className="mt-3 text-xs font-semibold text-slate-500">Previous: {prev.cycleCode} · {moneyNgn(prev.bimonthlyTotal)} · {prev.beneficiaryCount} beneficiaries</p> : null}
        </div>

        <div className="rounded-2xl border border-teal-100 bg-teal-50/60 p-4 shadow-sm">
          <h2 className="text-sm font-black text-teal-950">Pending action</h2>
          {pendingAction ? (
            <>
              <p className="mt-2 text-base font-black text-slate-950">{pendingAction.title}</p>
              <p className="mt-1 text-sm font-semibold text-slate-600">{pendingAction.detail}</p>
              <Link href={pendingAction.href} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg bg-teal-700 px-4 text-xs font-black text-white hover:bg-teal-800">
                Continue <ArrowRight className="h-4 w-4" />
              </Link>
            </>
          ) : (
            <p className="mt-2 text-sm font-semibold text-slate-600">No role-specific action waiting for you right now.</p>
          )}
        </div>
      </section>
    </TaShell>
  );
}
