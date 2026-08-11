'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Shield, Sparkles, Users } from 'lucide-react';
import { filterSecurityModuleCards } from '@/lib/access/security-access';
import { SECURITY_MODULE } from '@/lib/security/nav';
import { SecurityBreadcrumbs } from './security-portal-shell';

export default function SecurityCommandCentrePage() {
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
    () => filterSecurityModuleCards(session.permissions, session.isGlobalAdmin),
    [session.isGlobalAdmin, session.permissions],
  );

  return (
    <div className="mx-auto max-w-[1640px] space-y-6">
      <SecurityBreadcrumbs items={['Command Centre']} />

      <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-gradient-to-r from-slate-50 via-white to-white shadow-[0_12px_40px_rgba(15,23,42,0.05)]">
        <div className="grid gap-6 p-7 lg:grid-cols-[1.3fr_0.7fr]">
          <div>
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-bold tracking-[0.16em] text-slate-700">
              <Sparkles size={15} />
              SITE SECURITY WORKSPACE
            </div>
            <h1 className="mt-6 max-w-3xl text-4xl font-bold tracking-tight text-slate-950 xl:text-[40px] xl:leading-[1.1]">
              {SECURITY_MODULE.name}
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
              {SECURITY_MODULE.description}
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/security/visitor-management/dashboard"
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800"
              >
                <Users size={18} />
                Open Visitor Dashboard
              </Link>
              <Link
                href="/security/visitor-management/visitor-registration"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                <Shield size={18} />
                Register Visitor
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 self-end">
            {[
              { label: 'Live modules', value: String(cards.length) },
              { label: 'Visitor lifecycle', value: 'End-to-end' },
              { label: 'Access model', value: 'ACL' },
              { label: 'Shell', value: 'Portal' },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xl font-bold text-slate-950">{session.ready ? item.value : '—'}</p>
                <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="mb-4">
          <h2 className="text-xl font-bold text-slate-900">Security catalogue</h2>
          <p className="mt-1 text-sm text-slate-500">Modules available from your published Security access.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <Link
                key={card.id}
                href={card.href}
                className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_28px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-800">
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold tracking-wide text-emerald-700">
                    LIVE
                  </span>
                </div>
                <h3 className="mt-4 text-[15px] font-bold text-slate-950">{card.title}</h3>
                <p className="mt-2 text-[13px] leading-5 text-slate-500">{card.description}</p>
                <span className="mt-5 inline-flex items-center gap-2 text-xs font-bold text-slate-800">
                  Open workspace
                  <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                </span>
              </Link>
            );
          })}
          {!session.ready ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-5 text-sm text-slate-500 md:col-span-2 2xl:col-span-3">
              Loading your Security workspace access…
            </div>
          ) : null}
          {session.ready && cards.length === 0 ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800 md:col-span-2 2xl:col-span-3">
              No Security modules are published for this account. Contact an administrator to grant Security access.
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
