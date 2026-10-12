'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { FormEvent, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Globe, Menu, Search, X } from 'lucide-react';
import { NotificationCenter } from '@/components/layout/notification-center';
import { EnterpriseUserProfile } from '@hris/components/layout/enterprise-user-profile';
import { canAccessCommercial } from '@/lib/access/commercial-access';
import { TENDER_NAV } from '@/lib/commercial/nav';

type Props = { children: ReactNode };

const childActive = (pathname: string, href: string) =>
  href === '/'
    ? pathname === '/'
    : href === '/commercial/tenders'
      ? pathname === '/commercial/tenders'
      : pathname === href || pathname.startsWith(`${href}/`);

export function TendersPortalShell({ children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [groupOpen, setGroupOpen] = useState(true);
  const [query, setQuery] = useState('');
  const [allowed, setAllowed] = useState(true);
  const [languageOpen, setLanguageOpen] = useState(false);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem('dle-tender-sidebar') === 'collapsed');
  }, []);

  const toggleSidebar = () => {
    setCollapsed((value) => {
      const next = !value;
      window.localStorage.setItem('dle-tender-sidebar', next ? 'collapsed' : 'open');
      return next;
    });
  };

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

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    const next = query.trim();
    router.push(next ? `/commercial/tenders/opportunities?q=${encodeURIComponent(next)}` : '/commercial/tenders/opportunities');
  };

  const linkClass = (selected: boolean) =>
    `flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-semibold ${
      selected ? 'bg-[#2563eb] text-white shadow-sm' : 'text-[#d5deea] hover:bg-white/10 hover:text-white'
    }`;

  const navBody = (onNavigate?: () => void, iconOnly = false) => (
    <nav className="space-y-0.5">
      {TENDER_NAV.map((item) => {
        const Icon = item.icon;
        const children = item.children || [];
        const sectionOn = children.length
          ? children.some((child) => childActive(pathname, child.href))
          : childActive(pathname, item.href);
        return (
          <div key={item.id}>
            {children.length && !iconOnly ? (
              <button
                type="button"
                onClick={() => setGroupOpen((value) => !value)}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13px] font-semibold text-white hover:bg-white/10"
              >
                <Icon className="h-4 w-4 shrink-0 text-sky-300" />
                <span className="flex-1 truncate text-left">{item.label}</span>
                <ChevronDown className={`h-4 w-4 text-white/70 transition ${groupOpen ? 'rotate-180' : ''}`} />
              </button>
            ) : null}
            {children.length && (iconOnly || groupOpen) ? (
              <div className={`mt-0.5 space-y-0.5 ${iconOnly ? '' : 'pl-3'}`}>
                {children.map((child) => {
                  const ChildIcon = child.icon;
                  const selected = childActive(pathname, child.href);
                  return (
                    <Link key={child.id} href={child.href} title={child.label} onClick={onNavigate} className={`${linkClass(selected)} ${iconOnly ? 'justify-center px-2' : ''}`}>
                      <ChildIcon className="h-3.5 w-3.5 shrink-0 opacity-90" />
                      {iconOnly ? null : <span className="truncate">{child.label}</span>}
                    </Link>
                  );
                })}
              </div>
            ) : null}
            {!children.length ? (
              <Link href={item.href} title={item.label} onClick={onNavigate} className={`${linkClass(sectionOn)} ${iconOnly ? 'justify-center px-2' : ''}`}>
                <Icon className="h-4 w-4 shrink-0" />
                {iconOnly ? null : <span className="truncate">{item.label}</span>}
              </Link>
            ) : null}
          </div>
        );
      })}
    </nav>
  );

  if (!allowed) return null;

  return (
    <div className="min-h-screen bg-[#f4f7fb] text-slate-900">
      <aside className={`fixed inset-y-0 left-0 z-40 hidden flex-col bg-[#071427] transition-[width] lg:flex ${collapsed ? 'w-[72px]' : 'w-[252px]'}`}>
        <div className={`flex gap-2 py-4 ${collapsed ? 'flex-col items-center px-2' : 'items-center px-4'}`}>
          <Link href="/" title="Enterprise Home" className="shrink-0">
            <Image src="/brand/dorman-long-logo.png" alt="DLE" width={34} height={34} className="rounded bg-white p-0.5" />
          </Link>
          {collapsed ? null : (
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-black tracking-wide text-white">DLE CONNECT</div>
              <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-sky-300">Enterprise</div>
            </div>
          )}
          <button type="button" onClick={toggleSidebar} className="rounded-md p-1 text-white/80 hover:bg-white/10" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-4">{navBody(undefined, collapsed)}</div>
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" className="absolute inset-0 bg-slate-900/40" onClick={() => setMobileOpen(false)} aria-label="Close menu" />
          <div className="absolute inset-y-0 left-0 flex w-[270px] flex-col bg-[#071427] shadow-xl">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="text-sm font-black text-white">DLE CONNECT</div>
              <button type="button" onClick={() => setMobileOpen(false)} className="text-white/80"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-4">{navBody(() => setMobileOpen(false))}</div>
          </div>
        </div>
      ) : null}

      <div className={`min-h-screen ${collapsed ? 'lg:pl-[72px]' : 'lg:pl-[252px]'}`}>
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200/80 bg-white px-4 lg:px-6">
          <button type="button" className="rounded-md border border-slate-200 p-2 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu className="h-4 w-4" />
          </button>
          <form onSubmit={submitSearch} className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-10 w-full max-w-xl rounded-xl border border-slate-200 bg-[#f8fafc] pl-10 pr-3 text-sm outline-none placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
              placeholder="Search enquiries, tenders, clients, reference no, documents..."
              aria-label="Search tenders"
            />
          </form>
          <div className="ml-auto flex items-center gap-2">
            <NotificationCenter />
            <div className="relative">
              <button
                type="button"
                onClick={() => setLanguageOpen((value) => !value)}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                aria-expanded={languageOpen}
              >
                <Globe className="h-4 w-4 text-slate-500" />
                English
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              </button>
              {languageOpen ? (
                <div className="absolute right-0 top-11 z-20 w-36 rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-lg">
                  <div className="px-3 py-2 font-semibold text-blue-700">English</div>
                </div>
              ) : null}
            </div>
            <EnterpriseUserProfile />
          </div>
        </header>
        <main className="px-4 py-5 lg:px-6">{children}</main>
      </div>
    </div>
  );
}
