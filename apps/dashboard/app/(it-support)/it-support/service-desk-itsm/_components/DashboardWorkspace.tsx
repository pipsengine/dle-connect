'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ClipboardList, Loader2, RefreshCw, Ticket } from 'lucide-react';
import { formatSlaTimer, relativeTime, serviceDeskGet } from '../lib/service-desk-api';
import { ServiceDeskItsmShell } from '../ServiceDeskItsmShell';

type Dashboard = {
  kpis: {
    openTickets: number;
    criticalTickets: number;
    activeIncidents: number;
    majorIncidents: number;
    openRequests: number;
    slaBreaches: number;
    slaPolicies: number;
  };
  recentTickets: Array<{ ticketId: string; subject: string; priority: string; status: string; updatedAt: string; slaDueAt: string | null }>;
  criticalItems: Array<{ ticketId: string; subject: string; status: string; slaDueAt: string | null }>;
  recentIncidents: Array<{ incidentId: string; title: string; priority: string; status: string; updatedAt: string }>;
  recentRequests: Array<{ requestId: string; title: string; stage: string; updatedAt: string }>;
  breaches: Array<{ ticketId: string; subject: string; priority: string; slaDueAt: string | null }>;
};

export function DashboardWorkspace() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await serviceDeskGet<Dashboard>('dashboard'));
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
    <ServiceDeskItsmShell title="Dashboard" description="Live Service Desk operations overview from DLE_Enterprise.">
      <div className="space-y-4">
        <div className="flex gap-2">
          <button type="button" onClick={() => void load()} className="inline-flex h-10 items-center gap-2 rounded-md border bg-white px-3 text-sm font-semibold">
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
          <Link href="/it-support/service-desk-itsm/tickets/my-tickets" className="inline-flex h-10 items-center rounded-md bg-teal-700 px-3 text-sm font-semibold text-white">New ticket</Link>
        </div>
        {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
        {loading || !data ? (
          <div className="flex items-center justify-center gap-2 py-20 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading dashboard…</div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { label: 'Open Tickets', value: data.kpis.openTickets, icon: Ticket, href: '/it-support/service-desk-itsm/tickets/open-tickets' },
                { label: 'Critical', value: data.kpis.criticalTickets, icon: AlertTriangle, href: '/it-support/service-desk-itsm/tickets/all-tickets' },
                { label: 'Active Incidents', value: data.kpis.activeIncidents, icon: AlertTriangle, href: '/it-support/service-desk-itsm/incidents/active-incidents' },
                { label: 'Open Requests', value: data.kpis.openRequests, icon: ClipboardList, href: '/it-support/service-desk-itsm/service-requests/all-requests' },
                { label: 'Major Incidents', value: data.kpis.majorIncidents, icon: AlertTriangle, href: '/it-support/service-desk-itsm/incidents/major-incidents' },
                { label: 'SLA Breaches', value: data.kpis.slaBreaches, icon: AlertTriangle, href: '/it-support/service-desk-itsm/tickets/overdue' },
                { label: 'SLA Policies', value: data.kpis.slaPolicies, icon: ClipboardList, href: '/it-support/service-desk-itsm/slas/sla-policies' },
              ].map((kpi) => {
                const Icon = kpi.icon;
                return (
                  <Link key={kpi.label} href={kpi.href} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-teal-300">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-semibold uppercase text-slate-500">{kpi.label}</div>
                      <Icon className="h-4 w-4 text-teal-700" />
                    </div>
                    <div className="mt-2 text-3xl font-black text-slate-900">{kpi.value}</div>
                  </Link>
                );
              })}
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <Panel title="Recent tickets" href="/it-support/service-desk-itsm/tickets/all-tickets">
                {data.recentTickets.map((t) => (
                  <Row key={t.ticketId} id={t.ticketId} title={t.subject} meta={`${t.priority} · ${t.status} · SLA ${formatSlaTimer(t.slaDueAt)} · ${relativeTime(t.updatedAt)}`} />
                ))}
              </Panel>
              <Panel title="Critical / overdue" href="/it-support/service-desk-itsm/tickets/overdue">
                {[...data.criticalItems, ...data.breaches].slice(0, 8).map((t) => (
                  <Row key={`${t.ticketId}-c`} id={t.ticketId} title={t.subject} meta={`${'priority' in t ? t.priority : 'Critical'} · SLA ${formatSlaTimer(t.slaDueAt)}`} />
                ))}
              </Panel>
              <Panel title="Incidents" href="/it-support/service-desk-itsm/incidents/active-incidents">
                {data.recentIncidents.map((i) => (
                  <Row key={i.incidentId} id={i.incidentId} title={i.title} meta={`${i.priority} · ${i.status} · ${relativeTime(i.updatedAt)}`} />
                ))}
              </Panel>
              <Panel title="Service requests" href="/it-support/service-desk-itsm/service-requests/all-requests">
                {data.recentRequests.map((r) => (
                  <Row key={r.requestId} id={r.requestId} title={r.title} meta={`${r.stage} · ${relativeTime(r.updatedAt)}`} />
                ))}
              </Panel>
            </div>
          </>
        )}
      </div>
    </ServiceDeskItsmShell>
  );
}

function Panel({ title, href, children }: { title: string; href: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h3 className="text-sm font-black text-slate-900">{title}</h3>
        <Link href={href} className="text-xs font-semibold text-teal-700">View all</Link>
      </div>
      <div className="divide-y divide-slate-100">{children}</div>
    </div>
  );
}

function Row({ id, title, meta }: { id: string; title: string; meta: string }) {
  return (
    <div className="px-4 py-3">
      <div className="text-xs font-mono text-slate-500">{id}</div>
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <div className="text-xs text-slate-500">{meta}</div>
    </div>
  );
}
