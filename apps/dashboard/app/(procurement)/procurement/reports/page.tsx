'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { moneyNgn, procurementGet } from '../lib/procurement-api';

type Reports = {
  purchaseOrderByStatus: Array<{ label: string; count: number }>;
  spendSummary: { totalPoAmount: number; avgPoAmount: number; poCount: number };
  topSuppliersByPo: Array<{ label: string; amount: number; count: number }>;
  cbeByStatus: Array<{ label: string; count: number }>;
};

export default function ProcurementReportsPage() {
  const [data, setData] = useState<Reports | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await procurementGet<Reports>('reports'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Procurement Reports</h1>
          <p className="mt-1 text-sm text-slate-600">Aggregates from DLE_Enterprise procurement tables.</p>
        </div>
        <button type="button" onClick={() => void load()} className="inline-flex h-10 items-center gap-2 rounded-md border bg-white px-3 text-sm font-semibold">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {loading || !data ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border bg-white p-4"><div className="text-xs uppercase text-slate-500">PO spend</div><div className="text-2xl font-black">{moneyNgn(Number(data.spendSummary?.totalPoAmount || 0))}</div></div>
            <div className="rounded-lg border bg-white p-4"><div className="text-xs uppercase text-slate-500">Average PO</div><div className="text-2xl font-black">{moneyNgn(Number(data.spendSummary?.avgPoAmount || 0))}</div></div>
            <div className="rounded-lg border bg-white p-4"><div className="text-xs uppercase text-slate-500">PO count</div><div className="text-2xl font-black">{Number(data.spendSummary?.poCount || 0)}</div></div>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="POs by status" rows={(data.purchaseOrderByStatus || []).map((r) => [r.label, String(r.count)])} />
            <Panel title="CBEs by status" rows={(data.cbeByStatus || []).map((r) => [r.label, String(r.count)])} />
            <Panel title="Top suppliers by PO amount" rows={(data.topSuppliersByPo || []).map((r) => [r.label, moneyNgn(Number(r.amount || 0))])} />
          </div>
        </>
      )}
    </div>
  );
}

function Panel({ title, rows }: { title: string; rows: string[][] }) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <h3 className="text-sm font-black">{title}</h3>
      <div className="mt-3 divide-y">
        {rows.length ? rows.map(([a, b]) => (
          <div key={a} className="flex items-center justify-between py-2 text-sm">
            <span>{a}</span>
            <span className="font-bold">{b}</span>
          </div>
        )) : <div className="py-6 text-center text-sm text-slate-500">No data</div>}
      </div>
    </div>
  );
}
