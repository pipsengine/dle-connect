'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, RefreshCw } from 'lucide-react';
import { relativeTime, serviceDeskGet, serviceDeskPost } from '../lib/service-desk-api';
import { ServiceDeskItsmShell } from '../ServiceDeskItsmShell';

type CatalogItem = {
  serviceId: string;
  name: string;
  description: string | null;
  category: string | null;
  estimatedCompletion: string | null;
  approvalRequired: boolean;
  isPopular: boolean;
  isFeatured: boolean;
};

type RequestRow = {
  requestId: string;
  serviceId: string | null;
  serviceName: string;
  title: string;
  description: string | null;
  stage: string;
  priority: string | null;
  requesterName: string | null;
  assigneeName: string | null;
  updatedAt: string;
};

const stages = ['New', 'Approved', 'Rejected', 'Fulfilled', 'Cancelled'] as const;

type Props = {
  mode: 'all' | 'new' | 'approved' | 'rejected' | 'fulfilled' | 'cancelled' | 'templates';
  title: string;
};

export function ServiceRequestsWorkspace({ mode, title }: Props) {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [desc, setDesc] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (mode === 'new' || mode === 'templates') {
        setCatalog(await serviceDeskGet<CatalogItem[]>('service-catalog'));
      }
      const stage =
        mode === 'approved' ? 'Approved' :
        mode === 'rejected' ? 'Rejected' :
        mode === 'fulfilled' ? 'Fulfilled' :
        mode === 'cancelled' ? 'Cancelled' :
        mode === 'new' ? undefined :
        undefined;
      const rows = await serviceDeskGet<RequestRow[]>('service-requests', { stage });
      setRequests(mode === 'all' || mode === 'new' || mode === 'templates' ? rows : rows.filter((r) => r.stage === stage));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (item: CatalogItem) => {
    setSaving(true);
    try {
      await serviceDeskPost('create-service-request', {
        payload: {
          serviceId: item.serviceId,
          serviceName: item.name,
          title: item.name,
          description: desc || item.description,
          stage: item.approvalRequired ? 'New' : 'Approved',
          priority: 'Medium',
        },
      });
      setDesc('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submit failed');
    } finally {
      setSaving(false);
    }
  };

  const setStage = async (requestId: string, stage: string) => {
    await serviceDeskPost('update-service-request', { id: requestId, payload: { stage } });
    await load();
  };

  return (
    <ServiceDeskItsmShell title={title} description="Service catalog and request pipeline on DLE_Enterprise.">
      <div className="space-y-4">
        <button type="button" onClick={() => void load()} className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
        {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

        {(mode === 'new' || mode === 'templates') && (
          <>
            <textarea className="min-h-[70px] w-full rounded-md border px-3 py-2 text-sm" placeholder="Optional request notes applied to the next submission" value={desc} onChange={(e) => setDesc(e.target.value)} />
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {catalog.map((item) => (
                <div key={item.serviceId} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="text-xs font-semibold uppercase text-teal-700">{item.category}</div>
                  <div className="mt-1 text-base font-black text-slate-900">{item.name}</div>
                  <p className="mt-1 text-sm text-slate-600">{item.description}</p>
                  <div className="mt-2 text-xs text-slate-500">ETA {item.estimatedCompletion || '—'} · {item.approvalRequired ? 'Approval required' : 'Auto-approve'}</div>
                  <button type="button" disabled={saving} onClick={() => void submit(item)} className="mt-3 inline-flex h-9 items-center gap-2 rounded-md bg-teal-700 px-3 text-xs font-semibold text-white">
                    <Plus className="h-3.5 w-3.5" /> Request
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : mode !== 'templates' ? (
          mode === 'all' ? (
            <div className="grid gap-3 lg:grid-cols-5">
              {stages.map((stage) => (
                <div key={stage} className="rounded-lg border bg-slate-50 p-3">
                  <div className="mb-2 text-xs font-black uppercase text-slate-600">{stage}</div>
                  <div className="space-y-2">
                    {requests.filter((r) => r.stage === stage).map((r) => (
                      <div key={r.requestId} className="rounded-md border bg-white p-3">
                        <div className="text-xs font-mono text-slate-500">{r.requestId}</div>
                        <div className="text-sm font-semibold">{r.title}</div>
                        <div className="text-xs text-slate-500">{relativeTime(r.updatedAt)}</div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {stages.filter((s) => s !== r.stage).map((s) => (
                            <button key={s} type="button" className="rounded border px-2 py-0.5 text-[10px] font-semibold" onClick={() => void setStage(r.requestId, s)}>{s}</button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-3 text-left">ID</th>
                    <th className="px-3 py-3 text-left">Title</th>
                    <th className="px-3 py-3 text-left">Stage</th>
                    <th className="px-3 py-3 text-left">Requester</th>
                    <th className="px-3 py-3 text-left">Updated</th>
                    <th className="px-3 py-3 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r) => (
                    <tr key={r.requestId} className="border-t">
                      <td className="px-3 py-3 font-mono text-xs">{r.requestId}</td>
                      <td className="px-3 py-3 font-semibold">{r.title}</td>
                      <td className="px-3 py-3">{r.stage}</td>
                      <td className="px-3 py-3">{r.requesterName || '—'}</td>
                      <td className="px-3 py-3 text-xs text-slate-500">{relativeTime(r.updatedAt)}</td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          {stages.filter((s) => s !== r.stage).slice(0, 3).map((s) => (
                            <button key={s} type="button" className="rounded border px-2 py-1 text-xs font-semibold" onClick={() => void setStage(r.requestId, s)}>{s}</button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!requests.length ? <div className="py-12 text-center text-sm text-slate-500">No requests.</div> : null}
            </div>
          )
        ) : null}
      </div>
    </ServiceDeskItsmShell>
  );
}
