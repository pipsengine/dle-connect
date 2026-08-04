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
import { canAccessFinanceSection } from '@/lib/access/finance-access';
import {
  FINANCE_MODULE,
  FINANCE_NAV_SECTIONS,
  type FinanceBadgeTone,
} from '@/lib/finance-intelligence/nav';
import type { FinanceBadgeSnapshot } from '@/lib/finance-intelligence/store';

type Props = {
  children: ReactNode;
  badges?: FinanceBadgeSnapshot;
  employee?: {
    fullName?: string;
    jobTitle?: string;
    employeeCode?: string;
    department?: string;
  };
};

const badgeToneClass: Record<FinanceBadgeTone, string> = {
  blue: 'bg-[#EAF6FF] text-[#008FD5]',
  amber: 'bg-amber-100 text-amber-800',
  red: 'bg-rose-100 text-rose-700',
  green: 'bg-emerald-100 text-emerald-700',
  grey: 'bg-slate-100 text-slate-500',
};

const resolveBadge = (
  key: string | undefined,
  badges?: FinanceBadgeSnapshot,
): { value: number | string; tone: FinanceBadgeTone } | null => {
  if (!key || !badges) return null;
  const map: Record<string, { value: number; tone: FinanceBadgeTone }> = {
    paymentApprovals: { value: badges.paymentApprovals, tone: badges.paymentApprovals ? 'amber' : 'grey' },
    approvalInbox: { value: badges.approvalInbox, tone: badges.approvalInbox ? 'amber' : 'grey' },
    approvalMonitoring: { value: badges.approvalMonitoring, tone: badges.approvalMonitoring ? 'blue' : 'grey' },
    overdueApprovals: { value: badges.overdueApprovals, tone: badges.overdueApprovals ? 'red' : 'grey' },
    scheduledReports: { value: badges.scheduledReports, tone: badges.scheduledReports ? 'blue' : 'grey' },
    failedDeliveries: { value: badges.failedDeliveries, tone: badges.failedDeliveries ? 'red' : 'grey' },
    dataIntegration: { value: badges.dataIntegration, tone: badges.dataIntegration ? 'amber' : 'green' },
    exceptions: { value: badges.exceptions, tone: badges.exceptions ? 'red' : 'grey' },
  };
  const item = map[key];
  if (!item || item.value <= 0) {
    if (key === 'dataIntegration' && badges.dataIntegration > 0) {
      return { value: '!', tone: 'amber' };
    }
    return null;
  }
  if (key === 'dataIntegration') return { value: '!', tone: 'amber' };
  return item;
};

export function FinancePortalShell({ children, badges, employee }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [session, setSession] = useState({
    permissions: [] as string[],
    isGlobalAdmin: false,
    employeeCode: employee?.employeeCode || '',
    ready: false,
  });
  const [liveBadges, setLiveBadges] = useState<FinanceBadgeSnapshot | undefined>(badges);

  useEffect(() => {
    let active = true;
    fetch('/api/auth/me', { cache: 'no-store', credentials: 'same-origin' })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!active) return;
        setSession({
          permissions: Array.isArray(json?.data?.permissions) ? json.data.permissions : [],
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

  useEffect(() => {
    let active = true;
    fetch('/api/finance/workspace?view=badges', { cache: 'no-store', credentials: 'same-origin' })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!active || json?.status !== 'success') return;
        setLiveBadges(json.data as FinanceBadgeSnapshot);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [pathname]);

  const visibleSections = useMemo(
    () =>
      FINANCE_NAV_SECTIONS.filter((section) =>
        canAccessFinanceSection(section.id, session.permissions, session.isGlobalAdmin),
      ),
    [session],
  );

  useEffect(() => {
    const activeSection = visibleSections.find(
      (section) =>
        pathname === section.href
        || pathname.startsWith(`${section.href}/`)
        || section.children.some((child) => pathname === child.href || pathname.startsWith(`${child.href}/`)),
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

  const widthClass = railCollapsed ? 'w-[72px]' : 'w-[270px]';
  const contentPad = railCollapsed ? 'lg:pl-[72px]' : 'lg:pl-[270px]';

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
            <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
              {FINANCE_MODULE.shortName}
            </p>
            <p className="mt-1 text-[13px] font-semibold leading-snug text-slate-800">
              {FINANCE_MODULE.name}
            </p>
          </>
        ) : null}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-2.5 py-3">
        {visibleSections.map((section) => {
          const sectionActive =
            pathname === section.href
            || pathname.startsWith(`${section.href}/`)
            || section.children.some((child) => pathname === child.href || pathname.startsWith(`${child.href}/`));
          const isOpen = Boolean(expanded[section.id]) || sectionActive;
          const sectionBadge = resolveBadge(section.badgeKey, liveBadges);
          return (
            <div key={section.id} className="mb-1">
              <div className="flex items-center gap-1">
                <Link
                  href={section.href}
                  title={railCollapsed ? section.label : undefined}
                  onClick={() => setMobileOpen(false)}
                  className={`flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2.5 text-[13px] transition ${
                    sectionActive
                      ? 'border-l-[3px] border-[#008FD5] bg-[#EAF6FF] font-semibold text-[#008FD5]'
                      : 'border-l-[3px] border-transparent font-medium text-[#475569] hover:bg-[#F6F9FC] hover:text-[#0F172A]'
                  }`}
                >
                  <section.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
                  {!railCollapsed ? (
                    <>
                      <span className="min-w-0 flex-1 truncate">{section.label}</span>
                      {sectionBadge ? (
                        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${badgeToneClass[sectionBadge.tone]}`}>
                          {sectionBadge.value}
                        </span>
                      ) : null}
                    </>
                  ) : null}
                </Link>
                {!railCollapsed ? (
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

              {!railCollapsed && isOpen ? (
                <div className="mt-0.5 space-y-0.5 border-l border-slate-100 ml-4 pl-2">
                  {section.children.map((child) => {
                    const active = pathname === child.href || pathname.startsWith(`${child.href}/`);
                    const childBadge = resolveBadge(child.badgeKey, liveBadges);
                    return (
                      <Link
                        key={child.id}
                        href={child.href}
                        onClick={() => setMobileOpen(false)}
                        className={`flex h-[38px] items-center gap-2 rounded-lg px-2.5 text-[12.5px] transition ${
                          active
                            ? 'bg-[#EAF6FF] font-semibold text-[#008FD5]'
                            : 'font-medium text-[#64748B] hover:bg-[#F6F9FC] hover:text-[#0F172A]'
                        }`}
                      >
                        <span className="min-w-0 flex-1 truncate">{child.label}</span>
                        {childBadge ? (
                          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${badgeToneClass[childBadge.tone]}`}>
                            {childBadge.value}
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
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold text-slate-700">Sage X3 Integration</p>
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                Not connected
              </span>
            </div>
            <p className="mt-1.5 text-[11px] text-slate-500">Last sync: —</p>
            <Link
              href="/finance/overview/data-integration"
              className="mt-2 inline-flex text-[11px] font-semibold text-[#008FD5] hover:underline"
            >
              View status
            </Link>
          </div>
        ) : (
          <Link
            href="/finance/overview/data-integration"
            title="Sage X3 status"
            className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-500"
          >
            <span className="h-2.5 w-2.5 rounded-full bg-slate-400" />
          </Link>
        )}
        <Link
          href="/"
          className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-[#008FD5]"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          {!railCollapsed ? 'Enterprise home' : null}
        </Link>
      </div>
    </>
  );

  return (
    <div className="flex min-h-dvh bg-[#F5F7FB] text-slate-900">
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
          <aside className="absolute inset-y-0 left-0 flex w-[270px] flex-col bg-white shadow-xl">
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
        <header className="sticky top-0 z-20 flex h-[72px] items-center gap-2 border-b border-slate-200 bg-white px-3.5 sm:gap-3 sm:px-5">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="hidden min-w-0 xl:block xl:max-w-[180px]">
            <p className="truncate text-[11px] font-bold uppercase tracking-[0.14em] text-[#008FD5]">
              {FINANCE_MODULE.shortName}
            </p>
            <h1 className="truncate text-[13px] font-bold text-slate-900">{FINANCE_MODULE.name}</h1>
          </div>
          <div className="hidden items-center gap-1.5 lg:flex">
            {[
              { label: 'Company', value: 'Dorman Long Nigeria Ltd' },
              { label: 'FY', value: 'FY 2026' },
              { label: 'Period', value: 'Jul 2026' },
              { label: 'Currency', value: 'NGN' },
            ].map((item) => (
              <label key={item.label} className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-[#F8FAFC] px-2 text-[11px] text-slate-600">
                <span className="hidden text-slate-400 2xl:inline">{item.label}</span>
                <select defaultValue={item.value} className="max-w-[140px] truncate bg-transparent font-semibold text-slate-800 outline-none">
                  <option>{item.value}</option>
                </select>
                <ChevronDown className="h-3 w-3 shrink-0 text-slate-400" />
              </label>
            ))}
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <div className="hidden items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 xl:flex">
              <span className="relative flex h-2 w-2">
                <span className="relative inline-flex h-2 w-2 rounded-full bg-slate-400" />
              </span>
              <div className="leading-tight">
                <p className="text-[11px] font-semibold text-slate-700">Sage X3</p>
                <p className="text-[10px] text-slate-500">Last Sync: —</p>
              </div>
            </div>
            <EnterpriseHomeButton />
            <button
              type="button"
              onClick={() => router.refresh()}
              className="hidden h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 hover:bg-slate-50 sm:inline-flex"
            >
              <RefreshCcw className="h-4 w-4" />
              Refresh
            </button>
            <NotificationCenter scope="notifications" />
            <EnterpriseUserProfile
              context="enterprise"
              name={employee?.fullName}
              role={employee?.jobTitle || 'Finance User'}
              employeeCode={employee?.employeeCode}
              department={employee?.department}
              profileHref="/"
            />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-3.5 py-4 sm:px-5 lg:px-6">
          {children}
        </main>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white px-3.5 py-2.5 text-[11px] text-slate-500 sm:px-5">
          <p>© {new Date().getFullYear()} Dorman Long DLE Connect. All rights reserved.</p>
          <div className="flex items-center gap-3">
            <span>Privacy</span>
            <span>Terms</span>
            <span>Support</span>
            <span className="hidden text-slate-400 sm:inline">finance.view · finance.approve · finance.report</span>
          </div>
        </footer>
      </div>
    </div>
  );
}

export function FinanceBreadcrumbs({ items }: { items: string[] }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-1 text-xs text-slate-500">
      <Link href={FINANCE_MODULE.homeHref} className="font-medium text-[#008FD5] hover:underline">
        Finance
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
