'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useViewportRailCollapsed } from '@/lib/use-viewport-sidebar';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCcw,
  Shield,
  X,
} from 'lucide-react';
import { EnterpriseHomeButton } from '@/components/layout/enterprise-home-button';
import { NotificationCenter } from '@/components/layout/notification-center';
import { EnterpriseUserProfile } from '@hris/components/layout/enterprise-user-profile';
import { filterSecurityNavSections } from '@/lib/access/security-access';
import { SECURITY_MODULE } from '@/lib/security/nav';

type Props = {
  children: ReactNode;
  employee?: {
    fullName?: string;
    jobTitle?: string;
    employeeCode?: string;
    department?: string;
  };
};

export function SecurityPortalShell({ children, employee }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [railCollapsed, setRailCollapsed] = useViewportRailCollapsed();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [session, setSession] = useState({
    permissions: [] as string[],
    roles: [] as string[],
    isGlobalAdmin: false,
    employeeCode: employee?.employeeCode || '',
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
          roles: Array.isArray(json?.data?.roles) ? json.data.roles : [],
          isGlobalAdmin: Boolean(json?.data?.isGlobalAdmin),
          employeeCode: String(json?.data?.employeeCode || json?.data?.username || employee?.employeeCode || ''),
          ready: true,
        });
      })
      .catch(() => {
        if (active) setSession((current) => ({ ...current, ready: true }));
      });
    return () => {
      active = false;
    };
  }, [employee?.employeeCode, pathname]);

  const visibleSections = useMemo(
    () => filterSecurityNavSections(session.permissions, session.isGlobalAdmin),
    [session.isGlobalAdmin, session.permissions],
  );

  useEffect(() => {
    const activeSection = visibleSections.find(
      (section) =>
        (section.id !== 'overview' && (pathname === section.href || pathname.startsWith(`${section.href}/`)))
        || section.children.some((child) => child.href !== '/security' && (pathname === child.href || pathname.startsWith(`${child.href}/`)))
        || (section.id === 'overview' && (pathname === '/security' || pathname === '/security/')),
    );
    if (activeSection) {
      setExpanded((current) => ({ ...current, [activeSection.id]: true }));
    }
  }, [pathname, visibleSections]);

  useEffect(() => {
    if (!session.ready) return;
    if (visibleSections.length) return;
    router.replace('/access-denied');
  }, [router, session.ready, visibleSections.length]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setRailCollapsed(window.matchMedia('(max-width: 1279px)').matches);
  }, []);

  const widthClass = railCollapsed ? 'w-[72px]' : 'w-[278px]';
  const contentPad = railCollapsed ? 'lg:pl-[72px]' : 'lg:pl-[278px]';

  const isSectionActive = (sectionHref: string, sectionId: string, children: { href: string }[]) => {
    if (sectionId === 'overview') return pathname === '/security' || pathname === '/security/';
    if (pathname === sectionHref || pathname.startsWith(`${sectionHref}/`)) return true;
    return children.some((child) => pathname === child.href || pathname.startsWith(`${child.href}/`));
  };

  const NavBody = (
    <>
      <div className="border-b border-slate-200 px-3.5 py-4">
        <div className={`relative ${railCollapsed ? 'mx-auto h-9 w-9' : 'h-[52px] w-full max-w-[220px]'}`}>
          <Image
            src="/brand/dorman-long-logo.png"
            alt="Dorman Long Engineering Limited"
            fill
            sizes="220px"
            className="object-contain object-left"
            priority
          />
        </div>
        {!railCollapsed ? (
          <>
            <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
              {SECURITY_MODULE.shortName}
            </p>
            <p className="mt-1 text-[13px] font-semibold leading-snug text-slate-800">
              {SECURITY_MODULE.name}
            </p>
          </>
        ) : null}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-2.5 py-3">
        {visibleSections.map((section) => {
          const sectionActive = isSectionActive(section.href, section.id, section.children);
          const isOpen = Boolean(expanded[section.id]) || sectionActive;
          return (
            <div key={section.id} className="mb-1">
              <div className="flex items-center gap-1">
                <Link
                  href={section.href}
                  title={railCollapsed ? section.label : undefined}
                  onClick={() => setMobileOpen(false)}
                  className={`flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2.5 text-[13px] transition ${
                    sectionActive
                      ? 'border-l-[3px] border-slate-800 bg-slate-100 font-semibold text-slate-900'
                      : 'border-l-[3px] border-transparent font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <section.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
                  {!railCollapsed ? <span className="min-w-0 flex-1 truncate">{section.label}</span> : null}
                </Link>
                {!railCollapsed && section.children.length > 1 ? (
                  <button
                    type="button"
                    aria-label={`Toggle ${section.label}`}
                    onClick={() => setExpanded((current) => ({ ...current, [section.id]: !isOpen }))}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  >
                    <ChevronDown className={`h-4 w-4 transition ${isOpen ? '' : '-rotate-90'}`} />
                  </button>
                ) : null}
              </div>

              {!railCollapsed && isOpen && section.children.length > 0 ? (
                <div className="ml-4 mt-0.5 space-y-0.5 border-l border-slate-100 pl-2">
                  {section.children.map((child) => {
                    const active =
                      child.href === '/security'
                        ? pathname === '/security' || pathname === '/security/'
                        : pathname === child.href || pathname.startsWith(`${child.href}/`);
                    return (
                      <Link
                        key={child.id}
                        href={child.href}
                        onClick={() => setMobileOpen(false)}
                        className={`flex h-[38px] items-center gap-2 rounded-lg px-2.5 text-[12.5px] transition ${
                          active
                            ? 'bg-slate-100 font-semibold text-slate-900'
                            : 'font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                        }`}
                      >
                        <span className="min-w-0 flex-1 truncate">{child.label}</span>
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-slate-200 px-3 py-3">
        {!railCollapsed ? (
          <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-bold tracking-wide text-slate-700">
              <Shield className="h-4 w-4" />
              SITE SECURITY
            </div>
            <p className="text-[11px] leading-relaxed text-slate-600">
              Controlled visitor lifecycle with reception, host approvals, and audit-ready records.
            </p>
            <Link
              href="/security/visitor-management/dashboard"
              className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-800 hover:underline"
            >
              Open visitor dashboard
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        ) : (
          <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-700" title="Security">
            <span className="h-2.5 w-2.5 rounded-full bg-slate-700" />
          </div>
        )}
        <Link
          href="/"
          className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          {!railCollapsed ? 'Enterprise home' : null}
        </Link>
      </div>
    </>
  );

  return (
    <div className="flex min-h-dvh min-w-0 overflow-x-clip bg-[#f8fafb] text-slate-900" data-dle-shell data-security-portal>
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-slate-200 bg-white transition-[width] duration-200 lg:flex ${widthClass}`}
      >
        <div className="flex justify-end px-2 pt-2">
          <button
            type="button"
            onClick={() => setRailCollapsed((value) => !value)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            title={railCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {railCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>
        {NavBody}
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" className="absolute inset-0 bg-slate-950/40" aria-label="Close menu" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-[min(288px,calc(100vw-2.5rem))] max-w-[85vw] flex-col bg-white shadow-xl">
            <div className="flex justify-end p-2">
              <button type="button" onClick={() => setMobileOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            {NavBody}
          </aside>
        </div>
      ) : null}

      <div className={`flex min-w-0 flex-1 flex-col ${contentPad}`}>
        <header className="sticky top-0 z-20 flex min-h-[72px] flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:min-h-[92px] sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white sm:flex">
              <Shield className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-bold tracking-[0.18em] text-slate-500">
                {SECURITY_MODULE.shortName.toUpperCase()}
              </p>
              <h1 className="truncate text-base font-semibold text-slate-950">{SECURITY_MODULE.name}</h1>
            </div>
          </div>
          <div className="ml-auto flex min-w-0 shrink-0 items-center gap-1.5 sm:gap-3">
            <EnterpriseHomeButton />
            <button
              type="button"
              onClick={() => router.refresh()}
              className="hidden h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 xl:inline-flex"
              title="Refresh"
            >
              <RefreshCcw className="h-4 w-4" />
            </button>
            <NotificationCenter scope="notifications" />
            <EnterpriseUserProfile
              context="enterprise"
              name={employee?.fullName}
              role={employee?.jobTitle}
              employeeCode={employee?.employeeCode}
              department={employee?.department}
              profileHref="/"
            />
          </div>
        </header>

        <main className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-5 py-6 lg:px-8 xl:px-10">
          <div className="dle-page">{children}</div>
        </main>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white px-5 py-4 text-xs text-slate-500 sm:px-8">
          <p>© {new Date().getFullYear()} Dorman Long DLE Connect. All rights reserved.</p>
          <div className="flex flex-wrap items-center gap-3">
            <span>Privacy</span>
            <span>•</span>
            <span>Terms</span>
            <span>•</span>
            <span>Support</span>
            <span>•</span>
            <span>v2.0.0</span>
          </div>
        </footer>
      </div>
    </div>
  );
}

export function SecurityBreadcrumbs({ items }: { items: string[] }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-1 text-xs text-slate-500">
      <Link href={SECURITY_MODULE.homeHref} className="font-medium text-slate-800 hover:underline">
        Security
      </Link>
      {items.map((item) => (
        <span key={item} className="inline-flex items-center gap-1">
          <ChevronRight className="h-3 w-3 text-slate-300" />
          <span>{item}</span>
        </span>
      ))}
    </div>
  );
}
