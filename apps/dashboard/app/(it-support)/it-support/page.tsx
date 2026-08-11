'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  KeyRound,
  Package,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { filterItSupportModuleCards } from '@/lib/access/it-support-access';
import { IT_SUPPORT_MODULE } from '@/lib/it-support/nav';
import { ItSupportBreadcrumbs } from './it-support-portal-shell';

export default function ItSupportCommandCentrePage() {
  const [session, setSession] = useState({
    permissions: [] as string[],
    isGlobalAdmin: false,
    ready: false,
  });

  useEffect(() => {
    let active = true;
    fetch('/api/auth/me', { cache: 'no-store', credentials: 'same-origin' })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!active) return;
        setSession({
          permissions: Array.isArray(json?.data?.permissions) ? json.data.permissions : [],
          isGlobalAdmin: Boolean(json?.data?.isGlobalAdmin),
          ready: true,
        });
      })
      .catch(() => {
        if (active) setSession((current) => ({ ...current, ready: true }));
      });
    return () => {
      active = false;
    };
  }, []);

  const cards = useMemo(
    () => filterItSupportModuleCards(session.permissions, session.isGlobalAdmin),
    [session.isGlobalAdmin, session.permissions],
  );

  const liveCount = cards.filter((card) => card.status === 'live').length;
  const readyCount = cards.filter((card) => card.status === 'ready').length;

  return (
    <div className="space-y-6">
      <ItSupportBreadcrumbs items={['Command Centre']} />

      <section className="relative overflow-hidden rounded-2xl border border-teal-100 bg-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(13,148,136,0.12),_transparent_55%),linear-gradient(135deg,#F8FAFC_0%,#F0FDFA_45%,#FFFFFF_100%)]" />
        <div className="relative grid gap-6 px-6 py-7 lg:grid-cols-[1.4fr_0.8fr] lg:px-8">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-teal-200/80 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-teal-800">
              <Sparkles className="h-3.5 w-3.5" />
              Enterprise IT workspace
            </div>
            <h2 className="mt-4 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              {IT_SUPPORT_MODULE.name}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
              {IT_SUPPORT_MODULE.description}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                href="/it-support/account-recovery"
                className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"
              >
                <KeyRound className="h-4 w-4" />
                Open Account Recovery
              </Link>
              <Link
                href="/it-support/asset-management"
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Package className="h-4 w-4" />
                Asset Management
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 self-end">
            {[
              { label: 'Live modules', value: String(liveCount), icon: CheckCircle2, tone: 'text-emerald-700 bg-emerald-50' },
              { label: 'Coming online', value: String(readyCount), icon: Clock3, tone: 'text-amber-700 bg-amber-50' },
              { label: 'Access model', value: 'ACL', icon: ShieldCheck, tone: 'text-teal-700 bg-teal-50' },
              { label: 'Shell', value: 'Portal', icon: Sparkles, tone: 'text-slate-700 bg-slate-100' },
            ].map((item) => (
              <div key={item.label} className="rounded-xl border border-slate-200/80 bg-white/90 p-3.5 shadow-sm">
                <div className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${item.tone}`}>
                  <item.icon className="h-4 w-4" />
                </div>
                <p className="mt-3 text-xl font-bold text-slate-900">{session.ready ? item.value : '—'}</p>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Service catalogue</h3>
            <p className="text-xs text-slate-500">Modules available from your published IT access.</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => {
            const Icon = card.icon;
            const live = card.status === 'live';
            return (
              <Link
                key={card.id}
                href={card.href}
                className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                    <Icon className="h-5 w-5" />
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                      live ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                    }`}
                  >
                    {live ? 'Live' : 'Coming soon'}
                  </span>
                </div>
                <h4 className="mt-4 text-sm font-bold text-slate-900">{card.title}</h4>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{card.description}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-teal-700 group-hover:gap-1.5">
                  {live ? 'Open workspace' : 'Preview readiness'}
                  <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </Link>
            );
          })}
          {!session.ready ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-white p-5 text-sm text-slate-500 sm:col-span-2 xl:col-span-3">
              Loading your IT workspace access…
            </div>
          ) : null}
          {session.ready && cards.length === 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800 sm:col-span-2 xl:col-span-3">
              No IT modules are published for this account. Contact an administrator to grant IT & Support access.
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
