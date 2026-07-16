'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { RefreshCcw, Target } from 'lucide-react';
import {
  findPerformanceMenuItem,
  resolvePerformanceRoute,
} from '@/lib/performance-management-menu-config';
import type { PerformanceWorkspacePayload } from '@/lib/performance-domain-types';
import PerformanceCommandCenter from './PerformanceCommandCenter';
import PerformanceDomainWorkspace from './PerformanceDomainWorkspace';
import { fmtDateTime } from './performance-management-ui';

type ApiResponse<T> = { status: 'success' | 'error'; data?: T; error?: string };

const readApiResponse = async <T,>(res: Response): Promise<ApiResponse<T>> => {
  const text = await res.text();
  if (!text.trim()) return { status: 'error', error: `Empty response (${res.status})` };
  try {
    return JSON.parse(text) as ApiResponse<T>;
  } catch {
    return { status: 'error', error: text.slice(0, 200) };
  }
};

type PerformanceManagementClientProps = {
  initialRoute?: string;
  initialNow?: string;
};

export default function PerformanceManagementClient({
  initialRoute = 'dashboard',
  initialNow,
}: PerformanceManagementClientProps) {
  const [route, setRoute] = useState(() => resolvePerformanceRoute(initialRoute));
  const [payload, setPayload] = useState<PerformanceWorkspacePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const activeItem = useMemo(() => findPerformanceMenuItem(route), [route]);
  const resolvedRoute = resolvePerformanceRoute(route);
  const isDashboard = resolvedRoute === 'dashboard';
  const actorLabel = payload?.actor.fullName || '—';
  const scopeLabel = payload?.actor.scope === 'global' ? 'HR population' : payload?.actor.scope === 'team' ? 'My team' : 'My records';

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/hris/performance-management?route=${encodeURIComponent(route)}`, {
        cache: 'no-store',
      });
      const json = await readApiResponse<PerformanceWorkspacePayload>(res);
      if (json.status !== 'success' || !json.data) throw new Error(json.error || 'Unable to load performance workspace.');
      setPayload(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load performance workspace.');
    } finally {
      setLoading(false);
    }
  }, [route]);

  const runAction = useCallback(async (action: string, data: Record<string, unknown> = {}) => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/hris/performance-management', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, payload: data, route }),
      });
      const json = await readApiResponse<{ message?: string; payload?: PerformanceWorkspacePayload }>(res);
      if (json.status !== 'success') throw new Error(json.error || 'Action failed.');
      if (json.data?.payload) setPayload(json.data.payload);
      else await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
  }, [load, route]);

  useEffect(() => {
    setRoute(resolvePerformanceRoute(initialRoute));
  }, [initialRoute]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void load();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const status = payload?.dashboard.systemStatus;

  return (
    <div className="min-h-screen bg-[#F8F9FB] text-[#0F172A]">
      {status ? (
        <div className="border-b border-[#E1E4E8] bg-[#F1F5F9]">
          <div className="mx-auto flex max-w-[1920px] flex-wrap items-center gap-x-8 gap-y-2 px-8 py-2.5 text-xs font-semibold text-[#475569]">
            <span className="text-emerald-700">System Status: All Systems Online</span>
            <span>Last Sync: {fmtDateTime(status.lastSync)}</span>
            <span className="text-emerald-700">Active Cycle: {status.activeCycleLabel}</span>
            <span className="text-emerald-700">Attendance Devices: {status.attendanceDevicesOnline}/{status.attendanceDevicesTotal} Online</span>
          </div>
        </div>
      ) : null}

      <div className="mx-auto max-w-[1600px] px-8 py-6">
        {!isDashboard ? (
          <header className="mb-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex items-start gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#0052CC] text-white shadow-sm">
                  <Target className="h-6 w-6" />
                </span>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#0052CC]">HRIS · Performance Management</p>
                  <h1 className="mt-1 text-3xl font-black tracking-tight text-[#0F172A]">
                    {activeItem?.label || 'Performance Management'}
                  </h1>
                  <p className="mt-2 max-w-3xl text-sm text-[#64748B]">
                    Enterprise performance planning, reviews, continuous feedback, talent development, and analytics.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {payload ? (
                  <span className="inline-flex h-11 items-center rounded-lg border border-[#E1E4E8] bg-white px-3 text-xs font-semibold text-[#475569]">
                    {payload.actor.role} · {scopeLabel} · {actorLabel}
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => void load()}
                  disabled={loading}
                  className="inline-flex h-11 items-center gap-2 rounded-lg border border-[#E1E4E8] bg-white px-4 text-sm font-semibold text-[#475569] transition-colors hover:bg-[#F8FAFC] disabled:opacity-60"
                >
                  <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
                <Link href="/hris" className="inline-flex h-11 items-center rounded-lg border border-[#E1E4E8] bg-white px-4 text-sm font-semibold text-[#475569] transition-colors hover:bg-[#F8FAFC]">
                  HRIS Home
                </Link>
              </div>
            </div>
          </header>
        ) : (
          <header className="mb-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex items-start gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#0052CC] text-white shadow-sm">
                  <Target className="h-6 w-6" />
                </span>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#0052CC]">HRIS · Performance Management</p>
                  <h1 className="mt-1 text-3xl font-black tracking-tight text-[#0F172A]">Dashboard</h1>
                  <p className="mt-2 max-w-3xl text-sm text-[#64748B]">
                    Enterprise performance planning, reviews, continuous feedback, talent development, and analytics.
                  </p>
                  {payload ? (
                    <p className="mt-2 text-xs text-[#94A3B8]">Generated {fmtDateTime(payload.generatedAt)}</p>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {payload ? (
                  <span className="inline-flex h-11 items-center rounded-lg border border-[#E1E4E8] bg-white px-3 text-xs font-semibold text-[#475569]">
                    {payload.actor.role} · {scopeLabel} · {actorLabel}
                  </span>
                ) : null}
                <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex h-11 items-center gap-2 rounded-lg border border-[#E1E4E8] bg-white px-4 text-sm font-semibold text-[#475569] hover:bg-[#F8FAFC] disabled:opacity-60">
                  <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
                </button>
                <Link href="/hris" className="inline-flex h-11 items-center rounded-lg border border-[#E1E4E8] bg-white px-4 text-sm font-semibold text-[#475569] hover:bg-[#F8FAFC]">HRIS Home</Link>
              </div>
            </div>
          </header>
        )}

        <div className="min-h-[720px]">
          {error ? (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>
          ) : null}
          {loading && !payload ? (
            <div className="rounded-xl border border-[#E1E4E8] bg-white p-12 text-center text-sm text-[#64748B]">
              Loading Performance Management workspace…
            </div>
          ) : payload ? (
            isDashboard ? (
              <PerformanceCommandCenter payload={payload} />
            ) : (
              <PerformanceDomainWorkspace route={resolvedRoute} payload={payload} onAction={runAction} busy={busy || loading} />
            )
          ) : null}
        </div>

        <footer className="mt-6 flex flex-col gap-2 border-t border-[#E1E4E8] pt-4 text-xs text-[#94A3B8] sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 Dorman Long Engineering Limited.</p>
          <div className="flex flex-wrap gap-4">
            <span>Privacy Policy</span>
            <span>Terms of Service</span>
            <span>Security</span>
            <span>Help &amp; Support</span>
          </div>
          <p>Version 2.4.0 · Last Updated: {payload ? fmtDateTime(payload.generatedAt) : '—'}</p>
        </footer>
      </div>
    </div>
  );
}
