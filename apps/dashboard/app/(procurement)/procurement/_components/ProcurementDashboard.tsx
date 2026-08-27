'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { FileText, Loader2, RefreshCw, Scale, ShoppingCart, Users } from 'lucide-react';
import { procurementGet } from '../lib/procurement-api';

type Dashboard = {
  openPrCount: number;
  openRfqCount: number;
  openCbeCount: number;
  openPoCount: number;
  supplierCount: number;
  pendingApprovalCount: number;
};

export function ProcurementDashboard() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [cbes, setCbes] = useState<Array<{ cbeId: string; title: string; status: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [dash, list] = await Promise.all([
        procurementGet<Dashboard>('dashboard'),
        procurementGet<Array<{ cbeId: string; title: string; status: string }>>('cbes'),
      ]);
      setData(dash);
      setCbes(list.slice(0, 8));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Procurement Dashboard</h1>
          <p className="mt-1 text-sm text-slate-600">Live counts from DLE_Enterprise [procurement] schema.</p>
        </div>
        <button type="button" onClick={() => void load()} className="inline-flex h-10 items-center gap-2 rounded-md border bg-white px-3 text-sm font-semibold">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {loading || !data ? (
        <div className="flex items-center justify-center gap-2 py-20 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[
              { label: 'Open PRs', value: data.openPrCount, href: '/procurement/purchase-requisitions', icon: FileText },
              { label: 'Open RFQs', value: data.openRfqCount, href: '/procurement/rfqs', icon: FileText },
              { label: 'Active CBEs', value: data.openCbeCount, href: '/procurement/cbe', icon: Scale },
              { label: 'Open POs', value: data.openPoCount, href: '/procurement/purchase-orders', icon: ShoppingCart },
              { label: 'Suppliers', value: data.supplierCount, href: '/procurement/suppliers', icon: Users },
              { label: 'Pending Approvals', value: data.pendingApprovalCount, href: '/procurement/cbe', icon: Scale },
            ].map((kpi) => {
              const Icon = kpi.icon;
              return (
                <Link key={kpi.label} href={kpi.href} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-300">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold uppercase text-slate-500">{kpi.label}</div>
                    <Icon className="h-4 w-4 text-blue-700" />
                  </div>
                  <div className="mt-2 text-3xl font-black text-slate-900">{kpi.value}</div>
                </Link>
              );
            })}
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-black">Recent Competitive Bid Evaluations</h2>
              <Link href="/procurement/cbe" className="text-xs font-semibold text-blue-700">View all</Link>
            </div>
            <div className="mt-3 divide-y">
              {cbes.length ? (
                cbes.map((cbe) => (
                  <Link key={cbe.cbeId} href={`/procurement/cbe/${encodeURIComponent(cbe.cbeId)}`} className="flex items-center justify-between py-3 hover:bg-slate-50">
                    <div>
                      <div className="text-xs font-mono text-slate-500">{cbe.cbeId}</div>
                      <div className="text-sm font-semibold text-slate-900">{cbe.title}</div>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{cbe.status}</span>
                  </Link>
                ))
              ) : (
                <div className="py-8 text-center text-sm text-slate-500">No CBEs yet. Open Competitive Bid Evaluation to start.</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
