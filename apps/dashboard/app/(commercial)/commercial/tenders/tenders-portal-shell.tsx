'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { FormEvent, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { ChevronDown, Menu, PanelLeftClose, PanelLeftOpen, Search, X } from 'lucide-react';
import { EnterpriseHomeButton } from '@/components/layout/enterprise-home-button';
import { NotificationCenter } from '@/components/layout/notification-center';
import { EnterpriseUserProfile } from '@hris/components/layout/enterprise-user-profile';
import { canAccessCommercial } from '@/lib/access/commercial-access';
import { TENDER_NAV } from '@/lib/commercial/nav';

type Props = { children: ReactNode };

const childActive = (pathname: string, href: string) =>
  href === '/commercial/tenders'
    ? pathname === '/commercial/tenders'
    : pathname === href || pathname.startsWith(`${href}/`);

export function TendersPortalShell({ children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(true);
  const [query, setQuery] = useState('');
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [allowed, setAllowed] = useState(true);

  useEffect(() => {
    let active = true;
    fetch('/api/auth/me', { cache: 'no-store', credentials: 'same-origin' })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!active) return;
        const permissions = Array.isArray(json?.data?.permissions) ? json.data.permissions : [];
        const ok = canAccessCommercial(permissions, Boolean(json?.data?.isGlobalAdmin));
        setAllowed(ok);
        if (!ok) router.replace('/access-denied');
      })
      .catch(() => {
        if (active) setAllowed(true);
      });
    return () => {
      active = false;
    };
  }, [pathname, router]);

  const widthClass = railCollapsed ? 'w-[72px]' : 'w-[260px]';
  const contentPad = railCollapsed ? 'lg:pl-[72px]' : 'lg:pl-[260px]';

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    const next = query.trim();
    router.push(next ? `/commercial/tenders/opportunities?q=${encodeURIComponent(next)}` : '/commercial/tenders/opportunities');
  };

  const navBody = (collapsed: boolean, onNavigate?: () => void) => (
    <nav className="space-y-1">
      {TENDER_NAV.map((item) => {
        const Icon = item.icon;
        const children = item.children || [];
        const sectionOn = children.length
          ? children.some((child) => childActive(pathname, child.href))
          : childActive(pathname, item.href);
        return (
          <div key={item.id}>
            {children.length ? (
              <button
                type="button"
                title={item.label}
                onClick={() => setGroupOpen((value) => !value)}
                className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold text-white/80 hover:bg-white/10 ${collapsed ? 'justify-center px-2' : ''}`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed ? <span className="flex-1 truncate text-left">{item.label}</span> : null}
                {!collapsed ? <ChevronDown className={`h-4 w-4 transition ${groupOpen ? 'rotate-180' : ''}`} /> : null}
              </button>
            ) : (
              <Link
                href={item.href}
                title={item.label}
                onClick={onNavigate}
                className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold ${
                  sectionOn ? 'bg-blue-600 text-white' : 'text-white/75 hover:bg-white/10 hover:text-white'
                } ${collapsed ? 'justify-center px-2' : ''}`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed ? <span className="truncate">{item.label}</span> : null}
              </Link>
            )}
            {!collapsed && children.length && groupOpen ? (
              <div className="ml-4 mt-0.5 space-y-0.5 border-l border-white/15 pl-2">
                {children.map((child) => {
                  const selected = childActive(pathname, child.href);
                  return (
                    <Link
                      key={child.id}
                      href={child.href}
                      onClick={onNavigate}
                      className={`block truncate rounded-md px-2.5 py-2 text-[13px] font-semibold ${
                        selected ? 'bg-blue-600 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      {child.label}
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );

  if (!allowed) return null;

  return (
    <div className="min-h-screen bg-[#f4f7fb] text-slate-900">
      <aside className={`fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-white/10 bg-[#071427] transition-all lg:flex ${widthClass}`}>
        <div className={`flex border-b border-white/10 px-3 py-4 ${railCollapsed ? 'flex-col items-center gap-2' : 'items-center gap-2'}`}>
          <Image src="/brand/dorman-long-logo.png" alt="DLE" width={36} height={36} className="rounded bg-white p-0.5" />
          {!railCollapsed ? (
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-black tracking-wide text-white">DLE CONNECT</div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-300">Enterprise</div>
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => setRailCollapsed((value) => !value)}
            className="shrink-0 rounded-md p-1.5 text-white/70 hover:bg-white/10 hover:text-white"
            aria-label={railCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {railCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">{navBody(railCollapsed)}</div>
        <div className="border-t border-white/10 px-3 py-3 text-white/70">
          {!railCollapsed ? (
            <>
              <div className="text-xs font-bold text-white">DLE Connect Enterprise</div>
              <div className="text-[11px] text-white/50">Build · Deliver · Grow</div>
            </>
          ) : null}
        </div>
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" className="absolute inset-0 bg-slate-900/40" onClick={() => setMobileOpen(false)} aria-label="Close menu" />
          <div className="absolute inset-y-0 left-0 flex w-[270px] flex-col bg-[#071427] shadow-xl">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div className="text-sm font-black text-white">Tenders Management</div>
              <button type="button" onClick={() => setMobileOpen(false)} className="text-white/80"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">{navBody(false, () => setMobileOpen(false))}</div>
          </div>
        </div>
      ) : null}

      <div className={`min-h-screen ${contentPad}`}>
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <button type="button" className="rounded-md border border-slate-200 p-2 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
              <Menu className="h-4 w-4" />
            </button>
            <EnterpriseHomeButton />
            <div className="hidden shrink-0 text-sm font-black text-slate-900 sm:block">Tenders Management</div>
            <form onSubmit={submitSearch} className="relative ml-1 hidden max-w-xl flex-1 md:block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-9 w-full rounded-full border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
                placeholder="Search tenders, enquiries, clients, reference no, documents..."
                aria-label="Search tenders"
              />
            </form>
          </div>
          <div className="flex items-center gap-2">
            <NotificationCenter />
            <EnterpriseUserProfile />
          </div>
        </header>
        <main className="p-4 lg:p-5">{children}</main>
      </div>
    </div>
  );
}
