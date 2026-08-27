'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Menu, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { EnterpriseHomeButton } from '@/components/layout/enterprise-home-button';
import { NotificationCenter } from '@/components/layout/notification-center';
import { EnterpriseUserProfile } from '@hris/components/layout/enterprise-user-profile';
import { filterProcurementNav } from '@/lib/access/procurement-access';
import { PROCUREMENT_ACCENT } from '@/lib/procurement/nav';
import { useViewportRailCollapsed } from '@/lib/use-viewport-sidebar';

type Props = { children: ReactNode };

export function ProcurementPortalShell({ children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [railCollapsed, setRailCollapsed] = useViewportRailCollapsed();
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
        if (active) setSession((c) => ({ ...c, ready: true }));
      });
    return () => {
      active = false;
    };
  }, [pathname]);

  const nav = useMemo(
    () => filterProcurementNav(session.permissions, session.isGlobalAdmin),
    [session.isGlobalAdmin, session.permissions],
  );

  useEffect(() => {
    if (!session.ready) return;
    if (!nav.length) router.replace('/access-denied');
  }, [nav.length, router, session.ready]);

  const widthClass = railCollapsed ? 'w-[72px]' : 'w-[270px]';
  const contentPad = railCollapsed ? 'lg:pl-[72px]' : 'lg:pl-[270px]';
  const active = (href: string) =>
    href === '/procurement' ? pathname === '/procurement' || pathname === '/procurement/' : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <aside
        className={`fixed inset-y-0 left-0 z-40 hidden border-r border-slate-200 bg-white transition-all lg:flex lg:flex-col ${widthClass}`}
        style={{ borderTop: `3px solid ${PROCUREMENT_ACCENT.primary}` }}
      >
        <div className={`flex items-center gap-3 border-b border-slate-100 px-3 py-4 ${railCollapsed ? 'justify-center' : ''}`}>
          <Image src="/brand/dorman-long-logo.png" alt="DLE" width={36} height={36} className="rounded" />
          {!railCollapsed ? (
            <div>
              <div className="text-sm font-black text-slate-900">DLE Connect</div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Procurement</div>
            </div>
          ) : null}
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {!railCollapsed ? <div className="px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-500">Procurement</div> : null}
          <nav className="space-y-1">
            {nav.map((item) => {
              const Icon = item.icon;
              const selected = active(item.href);
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  title={item.label}
                  className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold transition ${
                    selected ? 'bg-blue-700 text-white' : 'text-slate-700 hover:bg-slate-50'
                  } ${railCollapsed ? 'justify-center px-2' : ''}`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!railCollapsed ? <span className="truncate">{item.label}</span> : null}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="border-t border-slate-100 p-2">
          <button
            type="button"
            onClick={() => setRailCollapsed((v) => !v)}
            className="flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            {railCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            {!railCollapsed ? 'Collapse' : null}
          </button>
        </div>
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" className="absolute inset-0 bg-slate-900/40" onClick={() => setMobileOpen(false)} aria-label="Close menu" />
          <div className="absolute inset-y-0 left-0 w-[270px] bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="text-sm font-black">Procurement</div>
              <button type="button" onClick={() => setMobileOpen(false)}><X className="h-5 w-5" /></button>
            </div>
            <nav className="space-y-1 p-2">
              {nav.map((item) => {
                const Icon = item.icon;
                return (
                  <Link key={item.id} href={item.href} onClick={() => setMobileOpen(false)} className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold ${active(item.href) ? 'bg-blue-700 text-white' : 'text-slate-700'}`}>
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      ) : null}

      <div className={`min-h-screen ${contentPad}`}>
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur">
          <div className="flex items-center gap-3">
            <button type="button" className="rounded-md border border-slate-200 p-2 lg:hidden" onClick={() => setMobileOpen(true)}>
              <Menu className="h-4 w-4" />
            </button>
            <EnterpriseHomeButton />
            <div className="text-sm font-black text-slate-900">Procurement Portal</div>
          </div>
          <div className="flex items-center gap-2">
            <NotificationCenter />
            <EnterpriseUserProfile />
          </div>
        </header>
        <main className="p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
