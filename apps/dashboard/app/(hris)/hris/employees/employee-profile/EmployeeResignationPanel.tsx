'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, LogOut } from 'lucide-react';

type ResignationLookup = {
  resignation: {
    id: string;
    status: string;
    period: string;
    lastWorkingDay?: string | null;
    referenceNumber?: string;
  } | null;
  registerHref?: string;
  newResignationHref?: string;
};

/** Profile-side Resignation status + deep links (client-safe; loads via API). */
export default function EmployeeResignationPanel({
  employeeId,
  employeeCode,
}: {
  employeeId: string;
  employeeCode?: string;
}) {
  const [data, setData] = useState<ResignationLookup | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ lookup: 'employee' });
        if (employeeCode) params.set('employeeCode', employeeCode);
        if (employeeId) params.set('employeeId', employeeId);
        const res = await fetch(`/api/hris/offboarding/resignation-management?${params.toString()}`, { cache: 'no-store' });
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

  const resignation = data?.resignation;
  const openHref = resignation
    ? (data?.registerHref || `/hris/offboarding/resignation-management?id=${encodeURIComponent(resignation.id)}`)
    : (data?.newResignationHref
      || `/hris/offboarding/resignation-management/new?employeeCode=${encodeURIComponent(employeeCode || employeeId)}`);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-2xl bg-sky-600/10 text-sky-700 flex items-center justify-center">
            <LogOut className="w-5 h-5" />
          </span>
          <div>
            <div className="text-sm font-extrabold text-slate-900">Resignation Management</div>
            <div className="text-xs text-slate-500 font-semibold mt-0.5">
              Offboarding resignation workflow linked to this employee record.
            </div>
          </div>
        </div>
        <Link
          href={openHref}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <ExternalLink className="w-4 h-4" />
          {resignation ? 'Open Resignation' : 'Start Resignation'}
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Status</div>
          <div className="mt-1 text-sm font-extrabold text-slate-900">
            {loading ? 'Loading…' : resignation?.status || 'Not started'}
          </div>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Period</div>
          <div className="mt-1 text-sm font-extrabold text-slate-900">
            {loading ? '—' : resignation?.period || '—'}
          </div>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Reference</div>
          <div className="mt-1 text-sm font-extrabold text-slate-900">
            {loading ? '—' : resignation?.referenceNumber || '—'}
          </div>
        </div>
      </div>
    </div>
  );
}
