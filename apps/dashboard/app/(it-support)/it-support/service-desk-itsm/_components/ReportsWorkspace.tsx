'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { serviceDeskGet } from '../lib/service-desk-api';
import { ServiceDeskItsmShell } from '../ServiceDeskItsmShell';

type Reports = {
  ticketReports: { total: number; byStatus: Record<string, number>; byPriority: Record<string, number> };
  incidentReports: { total: number; major: number; byStatus: Record<string, number> };
  slaReports: { overdue: number; policies: Array<{ name: string; priority: string; resolveMinutes: number }> };
  agentPerformance: Array<{ agent: string; assigned: number; resolved: number }>;
  executive: { tickets: number; incidents: number; requests: number; changes: number; avgRating: number };
};

type Props = { mode: 'ticket' | 'sla' | 'incident' | 'executive' | 'agent'; title: string };

export function ReportsWorkspace({ mode, title }: Props) {
  const [data, setData] = useState<Reports | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await serviceDeskGet<Reports>('reports'));
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
    <ServiceDeskItsmShell title={title} description="Aggregated Service Desk analytics from DLE_Enterprise.">
      <div className="space-y-4">
        <button type="button" onClick={() => void load()} className="inline-flex h-10 items-center gap-2 rounded-md border bg-white px-3 text-sm font-semibold">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
        {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
        {loading || !data ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : (
          <>
            {mode === 'ticket' && (
              <Stats title="Tickets" total={data.ticketReports.total} maps={[data.ticketReports.byStatus, data.ticketReports.byPriority]} />
            )}
            {mode === 'incident' && (
              <Stats title="Incidents" total={data.incidentReports.total} maps={[data.incidentReports.byStatus, { Major: data.incidentReports.major }]} />
            )}
            {mode === 'sla' && (
              <div className="space-y-3">
                <div className="rounded-lg border bg-white p-4"><div className="text-xs uppercase text-slate-500">Overdue tickets</div><div className="text-3xl font-black">{data.slaReports.overdue}</div></div>
                <div className="overflow-hidden rounded-lg border bg-white">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-3 text-left">Policy</th><th className="px-3 py-3 text-left">Priority</th><th className="px-3 py-3 text-left">Resolve (min)</th></tr></thead>
                    <tbody>
                      {data.slaReports.policies.map((p) => (
                        <tr key={p.name} className="border-t"><td className="px-3 py-3">{p.name}</td><td className="px-3 py-3">{p.priority}</td><td className="px-3 py-3">{p.resolveMinutes}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {mode === 'executive' && (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                {Object.entries(data.executive).map(([key, value]) => (
                  <div key={key} className="rounded-lg border bg-white p-4">
                    <div className="text-xs uppercase text-slate-500">{key}</div>
                    <div className="text-2xl font-black">{typeof value === 'number' ? (key === 'avgRating' ? value.toFixed(1) : value) : String(value)}</div>
                  </div>
                ))}
              </div>
            )}
            {mode === 'agent' && (
              <div className="overflow-hidden rounded-lg border bg-white">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-3 text-left">Agent</th><th className="px-3 py-3 text-left">Assigned</th><th className="px-3 py-3 text-left">Resolved</th></tr></thead>
                  <tbody>
                    {data.agentPerformance.map((a) => (
                      <tr key={a.agent} className="border-t"><td className="px-3 py-3">{a.agent}</td><td className="px-3 py-3">{a.assigned}</td><td className="px-3 py-3">{a.resolved}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </ServiceDeskItsmShell>
  );
}

function Stats({ title, total, maps }: { title: string; total: number; maps: Record<string, number>[] }) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border bg-white p-4"><div className="text-xs uppercase text-slate-500">{title} total</div><div className="text-3xl font-black">{total}</div></div>
      <div className="grid gap-3 md:grid-cols-2">
        {maps.map((map, idx) => (
          <div key={idx} className="rounded-lg border bg-white p-4">
            {Object.entries(map).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between border-b border-slate-50 py-2 text-sm last:border-0">
                <span>{k}</span><span className="font-bold">{v}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
