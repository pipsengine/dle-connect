'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Menu, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { EnterpriseHomeButton } from '@/components/layout/enterprise-home-button';
import { NotificationCenter } from '@/components/layout/notification-center';
import { EnterpriseUserProfile } from '@hris/components/layout/enterprise-user-profile';
import { canViewGalvanizing } from '@/lib/galvanizing/access';
import { GALVANIZING_NAV } from '@/lib/galvanizing/nav';
import { useViewportRailCollapsed } from '@/lib/use-viewport-sidebar';

type Props = { children: ReactNode };

export function GalvanizingPortalShell({ children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [railCollapsed, setRailCollapsed] = useViewportRailCollapsed();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/auth/me', { cache: 'no-store', credentials: 'same-origin' })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!active) return;
        const permissions = Array.isArray(json?.data?.permissions) ? json.data.permissions : [];
        const roles = Array.isArray(json?.data?.roles) ? json.data.roles : [];
        const allowed = canViewGalvanizing({
          permissions,
          roles,
          isGlobalAdmin: Boolean(json?.data?.isGlobalAdmin),
        });
        if (!allowed) router.replace('/access-denied');
        else setReady(true);
      })
      .catch(() => {
        if (active) router.replace('/access-denied');
      });
    return () => {
      active = false;
    };
  }, [pathname, router]);

  const widthClass = railCollapsed ? 'w-[72px]' : 'w-[270px]';
  const contentPad = railCollapsed ? 'lg:pl-[72px]' : 'lg:pl-[270px]';
  const exact = (href: string) => pathname === href;
  const navLinkClass = (selected: boolean, collapsed: boolean) =>
    `flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold transition ${
      selected ? 'bg-blue-600 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'
    } ${collapsed ? 'justify-center px-2' : ''}`;

  const renderNav = (collapsed: boolean) => (
    <nav className="space-y-1">
      {GALVANIZING_NAV.map((item) => {
        const Icon = item.icon;
        const children = item.children || [];
        const sectionOn = children.length ? pathname === item.href || pathname.startsWith(`${item.href}/`) : exact(item.href) || (item.href !== '/operations-center/galvanizing' && pathname.startsWith(item.href));
        const parentSelected = children.length ? pathname === item.href : sectionOn;
        return (
          <div key={item.id}>
            <Link href={item.href} title={item.label} className={parentSelected ? navLinkClass(true, collapsed) : sectionOn ? `flex items-center gap-3 rounded-md bg-white/10 px-3 py-2.5 text-sm font-semibold text-white ${collapsed ? 'justify-center px-2' : ''}` : navLinkClass(false, collapsed)}>
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed ? <span className="truncate">{item.label}</span> : null}
            </Link>
            {!collapsed && children.length && sectionOn ? (
              <div className="ml-4 mt-0.5 space-y-0.5 border-l border-white/15 pl-2">
                {children.map((child) => (
                  <Link key={child.id} href={child.href} className={`block truncate rounded-md px-2.5 py-2 text-[13px] font-semibold ${exact(child.href) || (child.id === 'release' && pathname.startsWith(`${child.href}/`)) ? 'bg-blue-600 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}>
                    {child.label}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <aside className={`fixed inset-y-0 left-0 z-40 hidden border-r border-white/10 bg-[#0b1f4a] transition-all lg:flex lg:flex-col ${widthClass}`}>
        <div className={`flex border-b border-white/10 px-3 py-3 ${railCollapsed ? 'flex-col items-center gap-2' : 'items-center gap-2 py-4'}`}>
          <Image src="/brand/dorman-long-logo.png" alt="DLE" width={36} height={36} className="rounded bg-white/10 p-0.5" />
          {!railCollapsed ? (
            <div className="min-w-0 flex-1">
              <div className="text-sm font-black text-white">DLE Connect</div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-white/60">Galvanizing</div>
            </div>
          ) : null}
          <button type="button" onClick={() => setRailCollapsed((value) => !value)} className="shrink-0 rounded-md p-1.5 text-white/70 hover:bg-white/10 hover:text-white" aria-label={railCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            {railCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {!railCollapsed ? <div className="px-3 py-2 text-[10px] font-black uppercase tracking-wider text-white/50">Galvanizing Operations</div> : null}
          {renderNav(railCollapsed)}
        </div>
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" className="absolute inset-0 bg-slate-900/40" aria-label="Close menu" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-[270px] flex-col bg-[#0b1f4a] p-2 text-white shadow-xl">
            <div className="mb-2 flex items-center justify-between px-2 py-2">
              <div className="text-sm font-black">Galvanizing Operations</div>
              <button type="button" onClick={() => setMobileOpen(false)} aria-label="Close menu"><X className="h-5 w-5" /></button>
            </div>
            <div onClick={() => setMobileOpen(false)}>{renderNav(false)}</div>
          </div>
        </div>
      ) : null}

      <div className={`min-h-screen ${contentPad}`}>
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" className="rounded-md border border-slate-200 p-2 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
              <Menu className="h-4 w-4" />
            </button>
            <EnterpriseHomeButton />
            <div className="min-w-0">
              <div className="truncate text-sm font-black text-slate-900">Galvanizing Operations</div>
              <Link href="/operations-center" className="text-[11px] font-semibold text-blue-700 hover:underline">Operations Center</Link>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <NotificationCenter />
            <EnterpriseUserProfile />
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">{ready ? children : <div className="text-sm font-semibold text-slate-500">Opening Galvanizing Operations…</div>}</main>
      </div>
    </div>
  );
}
