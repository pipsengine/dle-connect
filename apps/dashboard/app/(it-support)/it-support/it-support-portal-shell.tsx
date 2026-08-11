'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCcw,
  X,
} from 'lucide-react';
import { EnterpriseHomeButton } from '@/components/layout/enterprise-home-button';
import { NotificationCenter } from '@/components/layout/notification-center';
import { EnterpriseUserProfile } from '@hris/components/layout/enterprise-user-profile';
import { filterItSupportNavSections } from '@/lib/access/it-support-access';
import {
  IT_SUPPORT_CAPABILITY_HINT,
  IT_SUPPORT_MODULE,
  type ItSupportBadgeTone,
} from '@/lib/it-support/nav';

type Props = {
  children: ReactNode;
  employee?: {
    fullName?: string;
    jobTitle?: string;
    employeeCode?: string;
    department?: string;
  };
};

const badgeToneClass: Record<ItSupportBadgeTone, string> = {
  blue: 'bg-teal-50 text-teal-700',
  amber: 'bg-amber-100 text-amber-800',
  red: 'bg-rose-100 text-rose-700',
  green: 'bg-emerald-100 text-emerald-700',
  grey: 'bg-slate-100 text-slate-500',
};

const statusTone = (status?: 'live' | 'ready'): { label: string; tone: ItSupportBadgeTone } | null => {
  if (status === 'live') return { label: 'Live', tone: 'green' };
  if (status === 'ready') return { label: 'Soon', tone: 'amber' };
  return null;
};

export function ItSupportPortalShell({ children, employee }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [railCollapsed, setRailCollapsed] = useState(false);
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
    () => filterItSupportNavSections(session.permissions, session.isGlobalAdmin),
    [session.isGlobalAdmin, session.permissions],
  );

  useEffect(() => {
    const activeSection = visibleSections.find(
      (section) =>
        (section.id !== 'overview' && (pathname === section.href || pathname.startsWith(`${section.href}/`)))
        || section.children.some((child) => child.href !== '/it-support' && (pathname === child.href || pathname.startsWith(`${child.href}/`)))
        || (section.id === 'overview' && (pathname === '/it-support' || pathname === '/it-support/')),
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

  const widthClass = railCollapsed ? 'w-[72px]' : 'w-[270px]';
  const contentPad = railCollapsed ? 'lg:pl-[72px]' : 'lg:pl-[270px]';

  const isSectionActive = (sectionHref: string, sectionId: string, children: { href: string }[]) => {
    if (sectionId === 'overview') return pathname === '/it-support' || pathname === '/it-support/';
    if (pathname === sectionHref || pathname.startsWith(`${sectionHref}/`)) return true;
    return children.some((child) => pathname === child.href || pathname.startsWith(`${child.href}/`));
  };

  const NavBody = (
    <>
      <div className="border-b border-slate-200 px-3.5 py-4">
        <div className={`relative ${railCollapsed ? 'mx-auto h-9 w-9' : 'h-10 w-full'}`}>
          <Image
            src="/brand/dorman-long-logo.svg"
            alt="Dorman Long Engineering Limited"
            fill
            sizes="240px"
            className="object-contain object-left"
            priority
          />
        </div>
        {!railCollapsed ? (
          <>
            <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.16em] text-teal-700/70">
              {IT_SUPPORT_MODULE.shortName}
            </p>
            <p className="mt-1 text-[13px] font-semibold leading-snug text-slate-800">
              {IT_SUPPORT_MODULE.name}
            </p>
          </>
        ) : null}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-2.5 py-3">
        {visibleSections.map((section) => {
          const sectionActive = isSectionActive(section.href, section.id, section.children);
          const isOpen = Boolean(expanded[section.id]) || sectionActive;
          const sectionStatus = statusTone(section.status);
          return (
            <div key={section.id} className="mb-1">
              <div className="flex items-center gap-1">
                <Link
                  href={section.href}
                  title={railCollapsed ? section.label : undefined}
                  onClick={() => setMobileOpen(false)}
                  className={`flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2.5 text-[13px] transition ${
                    sectionActive
                      ? 'border-l-[3px] border-teal-600 bg-teal-50 font-semibold text-teal-800'
                      : 'border-l-[3px] border-transparent font-medium text-[#475569] hover:bg-[#F6F9FC] hover:text-[#0F172A]'
                  }`}
                >
                  <section.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
                  {!railCollapsed ? (
                    <>
                      <span className="min-w-0 flex-1 truncate">{section.label}</span>
                      {sectionStatus && sectionStatus.label === 'Soon' ? (
                        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${badgeToneClass[sectionStatus.tone]}`}>
                          {sectionStatus.label}
                        </span>
                      ) : null}
                    </>
                  ) : null}
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
                <div className="mt-0.5 space-y-0.5 border-l border-slate-100 ml-4 pl-2">
                  {section.children.map((child) => {
                    const active =
                      child.href === '/it-support'
                        ? pathname === '/it-support' || pathname === '/it-support/'
                        : pathname === child.href || pathname.startsWith(`${child.href}/`);
                    const childStatus = statusTone(child.status);
                    return (
                      <Link
                        key={child.id}
                        href={child.href}
                        onClick={() => setMobileOpen(false)}
                        className={`flex h-[38px] items-center gap-2 rounded-lg px-2.5 text-[12.5px] transition ${
                          active
                            ? 'bg-teal-50 font-semibold text-teal-800'
                            : 'font-medium text-[#64748B] hover:bg-[#F6F9FC] hover:text-[#0F172A]'
                        }`}
                      >
                        <span className="min-w-0 flex-1 truncate">{child.label}</span>
                        {childStatus && childStatus.label === 'Soon' ? (
                          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${badgeToneClass[childStatus.tone]}`}>
                            {childStatus.label}
                          </span>
                        ) : null}
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
          <div className="rounded-xl border border-teal-100 bg-gradient-to-br from-teal-50/80 to-slate-50 p-3">
            <p className="text-[11px] font-semibold text-slate-700">Operations posture</p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
              Controlled IT services with audit-ready account recovery and asset lifecycle tooling.
            </p>
          </div>
        ) : (
          <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg bg-teal-50 text-teal-700" title="IT operations">
            <span className="h-2.5 w-2.5 rounded-full bg-teal-500" />
          </div>
        )}
        <Link
          href="/"
          className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-teal-700"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          {!railCollapsed ? 'Enterprise home' : null}
        </Link>
      </div>
    </>
  );

  return (
    <div className="flex min-h-dvh min-w-0 overflow-x-clip bg-[#F4F7F8] text-slate-900" data-dle-shell data-it-support-portal>
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
        <header className="sticky top-0 z-20 flex min-h-[64px] flex-wrap items-center gap-2 border-b border-slate-200 bg-white/95 px-2.5 py-2 backdrop-blur sm:min-h-[72px] sm:gap-3 sm:px-4 lg:px-5">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-bold uppercase tracking-[0.14em] text-teal-700">
              {IT_SUPPORT_MODULE.shortName}
            </p>
            <h1 className="truncate text-[13px] font-bold text-slate-900 sm:text-sm">{IT_SUPPORT_MODULE.name}</h1>
          </div>
          <div className="ml-auto flex min-w-0 shrink-0 items-center gap-1 sm:gap-1.5">
            <EnterpriseHomeButton />
            <button
              type="button"
              onClick={() => router.refresh()}
              className="hidden h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 xl:inline-flex"
              title="Refresh"
            >
              <RefreshCcw className="h-4 w-4" />
            </button>
            <NotificationCenter scope="notifications" />
            <EnterpriseUserProfile
              context="enterprise"
              name={employee?.fullName}
              role={employee?.jobTitle || 'IT Support'}
              employeeCode={employee?.employeeCode}
              department={employee?.department}
              profileHref="/"
            />
          </div>
        </header>

        <main className="min-h-0 min-w-0 flex-1 overflow-x-clip overflow-y-auto px-2.5 py-3 sm:px-4 sm:py-4 lg:px-6">
          {children}
        </main>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white px-2.5 py-2.5 text-[11px] text-slate-500 sm:px-5">
          <p>© {new Date().getFullYear()} Dorman Long DLE Connect. All rights reserved.</p>
          <div className="flex flex-wrap items-center gap-3">
            <span>Privacy</span>
            <span>Terms</span>
            <span>Support</span>
            <span className="hidden text-slate-400 lg:inline">{IT_SUPPORT_CAPABILITY_HINT}</span>
          </div>
        </footer>
      </div>
    </div>
  );
}

export function ItSupportBreadcrumbs({ items }: { items: string[] }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-1 text-xs text-slate-500">
      <Link href={IT_SUPPORT_MODULE.homeHref} className="font-medium text-teal-700 hover:underline">
        IT & Support
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
