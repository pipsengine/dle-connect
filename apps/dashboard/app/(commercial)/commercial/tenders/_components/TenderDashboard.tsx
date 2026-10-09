'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { TenderDashboard as Dashboard } from '@/lib/commercial/tender-types';
import { compactMoney, money, tenderGet } from './tender-api';

export function TenderDashboard() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    tenderGet<Dashboard>('dashboard').then(setData).catch((reason) => setError(reason instanceof Error ? reason.message : 'Unable to read the tender register.'));
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-950">Tender Management</h1>
          <p className="text-sm text-slate-500">Live register from DLE_Enterprise. Open opportunities to capture a new enquiry or tender.</p>
        </div>
        <Link href="/commercial/tenders/opportunities" className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white">Open opportunity register</Link>
      </div>
      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      <div className="grid gap-3 md:grid-cols-4">
        {[
          ['Opportunities', String(data?.total ?? 0)],
          ['Pipeline', compactMoney(data?.pipelineValue || 0)],
          ['Open tenders', String(data?.openTenders ?? 0)],
          ['Closing soon', String(data?.closingSoon ?? 0)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-xs font-semibold text-slate-500">{label}</div>
            <div className="mt-1 text-2xl font-black">{data || error ? value : '—'}</div>
          </div>
        ))}
      </div>
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-black">Latest records</h2>
        {!data ? <p className="text-sm text-slate-500">Loading register…</p> : data.latest.length === 0 ? <p className="text-sm text-slate-500">The register is empty.</p> : (
          <ul className="divide-y divide-slate-100">
            {data.latest.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <Link href={`/commercial/tenders/workspace?id=${row.id}`} className="font-semibold text-blue-700">{row.referenceNo}</Link>
                <span className="flex-1 truncate text-slate-600">{row.title}</span>
                <span>{money(row.estimatedValue, row.currency)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
