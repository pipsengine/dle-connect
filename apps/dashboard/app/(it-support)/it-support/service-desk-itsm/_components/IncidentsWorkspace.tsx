'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, RefreshCw } from 'lucide-react';
import { formatSlaTimer, relativeTime, serviceDeskGet, serviceDeskPost } from '../lib/service-desk-api';
import { ServiceDeskItsmShell } from '../ServiceDeskItsmShell';

type Incident = {
  incidentId: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  impact: string | null;
  assignedTeam: string | null;
  service: string | null;
  isMajor: boolean;
  warRoomJson: string | null;
  slaDueAt: string | null;
  updatedAt: string;
};

type Event = { eventId: string; incidentId: string; description: string; eventAt: string; actorName: string | null };

const statuses = ['Investigating', 'Identified', 'Monitoring', 'Resolved'] as const;

type Props = {
  mode: 'active' | 'major' | 'timeline' | 'reports' | 'rca';
  title: string;
};

export function IncidentsWorkspace({ mode, title }: Props) {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ title: '', description: '', priority: 'High', impact: '', assignedTeam: 'Infrastructure', service: '', isMajor: mode === 'major' });
  const [eventText, setEventText] = useState('');
  const [rcaPayload, setRcaPayload] = useState({ fiveWhys: ['', '', '', '', ''], rootCause: '', capa: '', lessons: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await serviceDeskGet<Incident[]>('incidents', {
        isMajor: mode === 'major' ? '1' : undefined,
      });
      setIncidents(mode === 'active' ? rows.filter((i) => i.status !== 'Resolved') : rows);
      setSelectedId((current) => current || rows[0]?.incidentId || '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load incidents');
    } finally {
      setLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!(mode === 'timeline' || mode === 'rca') || !selectedId) return;
    let cancelled = false;
    (async () => {
      try {
        const ev = await serviceDeskGet<Event[]>('incident-events', { id: selectedId });
        if (!cancelled) setEvents(ev);
        if (mode === 'rca') {
          const rca = await serviceDeskGet<{ payloadJson: string } | null>('incident-rca', { id: selectedId });
          if (!cancelled && rca?.payloadJson) {
            try {
              setRcaPayload(JSON.parse(rca.payloadJson));
            } catch {
              /* keep defaults */
            }
          }
        }
      } catch {
        /* ignore detail load errors; list already shown */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, selectedId]);

  const create = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      await serviceDeskPost('create-incident', { payload: { ...form, status: 'Investigating' } });
      setForm({ title: '', description: '', priority: 'High', impact: '', assignedTeam: 'Infrastructure', service: '', isMajor: mode === 'major' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setSaving(false);
    }
  };

  const move = async (incidentId: string, status: string) => {
    await serviceDeskPost('update-incident', { id: incidentId, payload: { status } });
    await load();
  };

  const addEvent = async () => {
    if (!selectedId || !eventText.trim()) return;
    await serviceDeskPost('add-incident-event', { id: selectedId, description: eventText });
    setEventText('');
    await load();
  };

  const saveRca = async () => {
    if (!selectedId) return;
    setSaving(true);
    try {
      await serviceDeskPost('save-incident-rca', { id: selectedId, payload: rcaPayload, status: 'Draft' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'RCA save failed');
    } finally {
      setSaving(false);
    }
  };

  const byStatus = statuses.map((status) => ({
    status,
    items: incidents.filter((i) => i.status === status),
  }));

  return (
    <ServiceDeskItsmShell title={title} description="Incident management persisted in DLE_Enterprise.">
      <div className="space-y-4">
        <div className="flex gap-2">
          <button type="button" onClick={() => void load()} className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold">
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </div>
        {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

        {(mode === 'active' || mode === 'major') && (
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-black">{mode === 'major' ? 'Declare major incident' : 'Report incident'}</h3>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <input className="h-10 rounded-md border px-3 text-sm md:col-span-2" placeholder="Title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
              <textarea className="min-h-[70px] rounded-md border px-3 py-2 text-sm md:col-span-2" placeholder="Description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
              <input className="h-10 rounded-md border px-3 text-sm" placeholder="Impact" value={form.impact} onChange={(e) => setForm((f) => ({ ...f, impact: e.target.value }))} />
              <input className="h-10 rounded-md border px-3 text-sm" placeholder="Service" value={form.service} onChange={(e) => setForm((f) => ({ ...f, service: e.target.value }))} />
              <select className="h-10 rounded-md border px-3 text-sm" value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}>
                {['Critical', 'High', 'Medium', 'Low'].map((p) => <option key={p}>{p}</option>)}
              </select>
              <button type="button" disabled={saving} onClick={() => void create()} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-teal-700 text-sm font-semibold text-white">
                <Plus className="h-4 w-4" /> {saving ? 'Saving…' : 'Create'}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : mode === 'reports' ? (
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-lg border bg-white p-4"><div className="text-xs uppercase text-slate-500">Total</div><div className="text-2xl font-black">{incidents.length}</div></div>
            <div className="rounded-lg border bg-white p-4"><div className="text-xs uppercase text-slate-500">Major</div><div className="text-2xl font-black">{incidents.filter((i) => i.isMajor).length}</div></div>
            <div className="rounded-lg border bg-white p-4"><div className="text-xs uppercase text-slate-500">Active</div><div className="text-2xl font-black">{incidents.filter((i) => i.status !== 'Resolved').length}</div></div>
            <div className="rounded-lg border bg-white p-4"><div className="text-xs uppercase text-slate-500">Resolved</div><div className="text-2xl font-black">{incidents.filter((i) => i.status === 'Resolved').length}</div></div>
          </div>
        ) : mode === 'timeline' || mode === 'rca' ? (
          <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
            <div className="rounded-lg border bg-white p-3">
              <div className="text-xs font-semibold uppercase text-slate-500">Incidents</div>
              <div className="mt-2 space-y-1">
                {incidents.map((i) => (
                  <button key={i.incidentId} type="button" onClick={() => setSelectedId(i.incidentId)} className={`block w-full rounded-md px-2 py-2 text-left text-sm ${selectedId === i.incidentId ? 'bg-teal-50 text-teal-800' : 'hover:bg-slate-50'}`}>
                    <div className="font-semibold">{i.incidentId}</div>
                    <div className="truncate text-xs text-slate-500">{i.title}</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              {mode === 'timeline' ? (
                <>
                  <div className="flex gap-2">
                    <input className="h-10 flex-1 rounded-md border px-3 text-sm" placeholder="Add timeline event" value={eventText} onChange={(e) => setEventText(e.target.value)} />
                    <button type="button" onClick={() => void addEvent()} className="h-10 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white">Add</button>
                  </div>
                  <div className="rounded-lg border bg-white p-4">
                    {events.length === 0 ? <div className="text-sm text-slate-500">No events yet.</div> : events.map((e) => (
                      <div key={e.eventId} className="border-b border-slate-100 py-3 last:border-0">
                        <div className="text-xs text-slate-500">{relativeTime(e.eventAt)} · {e.actorName || 'System'}</div>
                        <div className="text-sm font-medium text-slate-900">{e.description}</div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="rounded-lg border bg-white p-4 space-y-3">
                  <h3 className="text-sm font-black">Root cause analysis — {selectedId || 'select incident'}</h3>
                  {rcaPayload.fiveWhys.map((why, idx) => (
                    <input key={idx} className="h-10 w-full rounded-md border px-3 text-sm" placeholder={`Why ${idx + 1}`} value={why} onChange={(e) => setRcaPayload((p) => ({ ...p, fiveWhys: p.fiveWhys.map((w, i) => (i === idx ? e.target.value : w)) }))} />
                  ))}
                  <textarea className="min-h-[70px] w-full rounded-md border px-3 py-2 text-sm" placeholder="Root cause" value={rcaPayload.rootCause} onChange={(e) => setRcaPayload((p) => ({ ...p, rootCause: e.target.value }))} />
                  <textarea className="min-h-[70px] w-full rounded-md border px-3 py-2 text-sm" placeholder="CAPA" value={rcaPayload.capa} onChange={(e) => setRcaPayload((p) => ({ ...p, capa: e.target.value }))} />
                  <textarea className="min-h-[70px] w-full rounded-md border px-3 py-2 text-sm" placeholder="Lessons learned" value={rcaPayload.lessons} onChange={(e) => setRcaPayload((p) => ({ ...p, lessons: e.target.value }))} />
                  <button type="button" disabled={saving || !selectedId} onClick={() => void saveRca()} className="h-10 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white disabled:opacity-60">{saving ? 'Saving…' : 'Save RCA'}</button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-4">
            {byStatus.map((col) => (
              <div key={col.status} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 text-xs font-black uppercase tracking-wide text-slate-600">{col.status} ({col.items.length})</div>
                <div className="space-y-2">
                  {col.items.map((i) => (
                    <div key={i.incidentId} className="rounded-md border border-slate-200 bg-white p-3 shadow-sm">
                      <div className="text-xs font-mono text-slate-500">{i.incidentId}</div>
                      <div className="text-sm font-semibold text-slate-900">{i.title}</div>
                      <div className="mt-1 text-xs text-slate-500">{i.priority} · SLA {formatSlaTimer(i.slaDueAt)}</div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {statuses.filter((s) => s !== i.status).map((s) => (
                          <button key={s} type="button" className="rounded border px-2 py-0.5 text-[10px] font-semibold" onClick={() => void move(i.incidentId, s)}>{s}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </ServiceDeskItsmShell>
  );
}
