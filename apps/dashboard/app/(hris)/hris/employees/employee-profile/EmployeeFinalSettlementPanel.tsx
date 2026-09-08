'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Banknote, ExternalLink } from 'lucide-react';

type SettlementLookup = {
  settlement: {
    id: string;
    status: string;
    period: string;
    currency: 'NGN' | 'USD';
    lastWorkingDay?: string | null;
  } | null;
  totals?: { gross: number; deductions: number; statutory: number; net: number } | null;
  registerHref?: string;
  newSettlementHref?: string;
};

const money = (amount: number, currency: 'NGN' | 'USD') => {
  const symbol = currency === 'USD' ? '$' : '₦';
  return `${symbol}${Math.round(amount || 0).toLocaleString('en-NG')}`;
};

/** Profile-side Final Settlement status + deep links (client-safe; loads via API). */
export default function EmployeeFinalSettlementPanel({
  employeeId,
  employeeCode,
}: {
  employeeId: string;
  employeeCode?: string;
}) {
  const [data, setData] = useState<SettlementLookup | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ lookup: 'employee', profile: '1' });
        if (employeeCode) params.set('employeeCode', employeeCode);
        if (employeeId) params.set('employeeId', employeeId);
        const res = await fetch(`/api/hris/offboarding/final-payroll?${params.toString()}`, { cache: 'no-store' });
        const json = await res.json();
        if (!cancelled && res.ok && json.ok) setData(json);
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [employeeId, employeeCode]);

  const settlement = data?.settlement;
  const openHref = settlement
    ? (data?.registerHref || `/hris/offboarding/final-payroll-processing?id=${encodeURIComponent(settlement.id)}`)
    : (data?.newSettlementHref
      || `/hris/offboarding/final-payroll-processing/new-settlement?employeeCode=${encodeURIComponent(employeeCode || employeeId)}`);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-2xl bg-rose-600/10 text-rose-700 flex items-center justify-center">
            <Banknote className="w-5 h-5" />
          </span>
          <div>
            <div className="text-sm font-extrabold text-slate-900">Final Payroll Settlement</div>
            <div className="text-xs text-slate-500 font-semibold mt-0.5">
              Offboarding final pay workflow linked to this employee record.
            </div>
          </div>
        </div>
        <Link
          href={openHref}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <ExternalLink className="w-4 h-4" />
          {settlement ? 'Open Settlement' : 'Start Final Settlement'}
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Status</div>
          <div className="mt-1 text-sm font-extrabold text-slate-900">
            {loading ? 'Loading…' : settlement?.status || 'Not started'}
          </div>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Period</div>
          <div className="mt-1 text-sm font-extrabold text-slate-900">
            {loading ? '—' : settlement?.period || '—'}
          </div>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Final Net</div>
          <div className="mt-1 text-sm font-extrabold text-slate-900">
            {loading || !settlement || !data?.totals
              ? '—'
              : money(data.totals.net, settlement.currency)}
          </div>
        </div>
      </div>
    </div>
  );
}
