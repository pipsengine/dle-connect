'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Menu, PanelLeftClose, PanelLeftOpen, Search, X } from 'lucide-react';
import { EnterpriseHomeButton } from '@/components/layout/enterprise-home-button';
import { NotificationCenter } from '@/components/layout/notification-center';
import { EnterpriseUserProfile } from '@hris/components/layout/enterprise-user-profile';
import { filterProjectsEngineeringNavGroups } from '@/lib/access/projects-engineering-access';
import { useViewportRailCollapsed } from '@/lib/use-viewport-sidebar';
import './projects-engineering.css';

type Props = { children: ReactNode };

const GROUP_STORAGE_KEY = 'dle.pe.nav.groups';

function searchPlaceholder(pathname: string) {
  if (pathname.includes('/cost-control')) return 'Search cost codes, commitments, forecasts…';
  if (pathname.includes('/planning') || pathname.includes('/portfolio')) return 'Search schedules, milestones…';
  if (pathname.includes('/timesheets')) return 'Search man-hours, projects, employees…';
  if (pathname.includes('/commercial')) return 'Search contracts, certificates, claims…';
  if (pathname.includes('/integrations')) return 'Search connectors (P6, EDMS, Sage)…';
  if (pathname.includes('/projects/new')) return 'Search project templates…';
  if (pathname.includes('/reports')) return 'Search project reports…';
  if (pathname.includes('/configuration') || pathname.includes('/settings') || pathname.includes('/admin')) {
    return 'Search configuration…';
  }
  if (pathname.includes('/projects/')) return 'Search WBS, deliverables, packages…';
  return 'Search projects, clients, managers…';
}

function readExpandedGroups(groupIds: string[]): Record<string, boolean> {
  const defaults = Object.fromEntries(groupIds.map((id) => [id, true]));
  if (typeof window === 'undefined') return defaults;
  try {
    const raw = window.localStorage.getItem(GROUP_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    return { ...defaults, ...parsed };
  } catch {
    return defaults;
  }
}

export function ProjectsEngineeringPortalShell({ children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [railCollapsed, setRailCollapsed] = useViewportRailCollapsed();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [session, setSession] = useState({
    permissions: [] as string[],
    isGlobalAdmin: false,
    department: '',
    employeeCode: '',
    employeeId: '',
    fullName: '',
    username: '',
    roles: [] as string[],
    ready: false,
    primaryProjectId: null as string | null,
  });

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [meRes, accessRes] = await Promise.all([
          fetch('/api/auth/me', { cache: 'no-store', credentials: 'same-origin' }),
          fetch('/api/projects-engineering/access', { cache: 'no-store', credentials: 'same-origin' }),
        ]);
        const meJson = meRes.ok ? await meRes.json() : null;
        const accessJson = accessRes.ok ? await accessRes.json() : null;
        if (!active) return;
        setSession({
          permissions: Array.isArray(meJson?.data?.permissions) ? meJson.data.permissions : [],
          isGlobalAdmin:
            Boolean(meJson?.data?.isGlobalAdmin)
            || Boolean(meJson?.data?.sub === 'global-admin')
            || (Array.isArray(meJson?.data?.roles) && meJson.data.roles.includes('Super Administrator'))
            || (Array.isArray(meJson?.data?.permissions) && meJson.data.permissions.includes('*')),
          department: String(meJson?.data?.department || ''),
          employeeCode: String(meJson?.data?.employeeCode || ''),
          employeeId: String(meJson?.data?.employeeId || ''),
          fullName: String(meJson?.data?.fullName || ''),
          username: String(meJson?.data?.username || ''),
          roles: Array.isArray(meJson?.data?.roles) ? meJson.data.roles : [],
          ready: true,
          primaryProjectId: accessJson?.data?.primaryProjectId || null,
        });
      } catch {
        if (active) setSession((current) => ({ ...current, ready: true }));
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [pathname]);

  const navGroups = useMemo(
    () =>
      filterProjectsEngineeringNavGroups(
        {
          permissions: session.permissions,
          isGlobalAdmin: session.isGlobalAdmin,
          department: session.department,
          employeeCode: session.employeeCode,
          employeeId: session.employeeId,
          fullName: session.fullName,
          username: session.username,
          roles: session.roles,
        },
        session.primaryProjectId,
      ),
    [session],
  );

  const navFlat = useMemo(() => navGroups.flatMap((g) => g.items), [navGroups]);

  useEffect(() => {
    setExpanded(readExpandedGroups(navGroups.map((g) => g.id)));
  }, [navGroups]);

  useEffect(() => {
    if (!session.ready) return;
    if (!navFlat.length) router.replace('/access-denied');
  }, [navFlat.length, router, session.ready]);

  const toggleGroup = (groupId: string) => {
    setExpanded((current) => {
      const next = { ...current, [groupId]: !current[groupId] };
      try {
        window.localStorage.setItem(GROUP_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const widthClass = railCollapsed ? 'w-[72px]' : 'w-[270px]';
  const contentPad = railCollapsed ? 'lg:pl-[72px]' : 'lg:pl-[270px]';
  const active = (href: string, id?: string) => {
    if (href === '/projects-engineering') {
      return pathname === '/projects-engineering' || pathname === '/projects-engineering/';
    }
    if (id === 'active-project') {
      return (
        pathname === '/projects-engineering/workspace'
        || (
          pathname.startsWith('/projects-engineering/projects/')
          && !pathname.includes('/projects/new')
          && !pathname.includes('/reports')
        )
      );
    }
    if (id === 'ai') return pathname.includes('/ai-intelligence') || pathname.endsWith('/ai');
    if (id === 'actions') return pathname.includes('/actions') && !pathname.includes('/closeout');
    if (id === 'reports-portfolio') return pathname.startsWith('/projects-engineering/reports/portfolio') || pathname === '/projects-engineering/reports';
    if (id === 'configuration') {
      return pathname.startsWith('/projects-engineering/configuration') || pathname.startsWith('/projects-engineering/settings');
    }
    if (id === 'planning') {
      return pathname.startsWith('/projects-engineering/planning') || pathname.startsWith('/projects-engineering/portfolio');
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const navLinkClass = (selected: boolean, collapsed: boolean) =>
    `flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold transition ${
      selected ? 'bg-blue-600 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'
    } ${collapsed ? 'justify-center px-2' : ''}`;

  const renderNav = (collapsed: boolean, onNavigate?: () => void) => (
    <nav className="space-y-2">
      {navGroups.map((group) => {
        const isOpen = collapsed || expanded[group.id] !== false;
        const groupHasActive = group.items.some((item) => active(item.href, item.id));
        return (
          <div key={group.id}>
            {!collapsed ? (
              <button
                type="button"
                onClick={() => toggleGroup(group.id)}
                className={`flex w-full items-center justify-between rounded-md px-3 py-1.5 text-[10px] font-black uppercase tracking-wider transition ${
                  groupHasActive ? 'text-cyan-300' : 'text-white/50 hover:text-white/80'
                }`}
              >
                <span>{group.label}</span>
                <ChevronDown className={`h-3.5 w-3.5 transition ${isOpen ? 'rotate-0' : '-rotate-90'}`} />
              </button>
            ) : null}
            {isOpen ? (
              <div className="space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const selected = active(item.href, item.id);
                  return (
                    <Link
                      key={item.id}
                      href={item.href}
                      title={item.label}
                      onClick={onNavigate}
                      className={navLinkClass(selected, collapsed)}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {!collapsed ? <span className="truncate">{item.label}</span> : null}
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

  return (
    <div className="min-h-screen bg-[#F5F8FC] text-slate-900">
      <aside
        className={`fixed inset-y-0 left-0 z-40 hidden border-r border-white/10 bg-[#081B42] transition-all lg:flex lg:flex-col ${widthClass}`}
      >
        <div className={`flex items-center gap-2 border-b border-white/10 px-3 py-4 ${railCollapsed ? 'justify-center' : ''}`}>
          <Image src="/brand/dorman-long-logo.png" alt="DLE" width={36} height={36} className="rounded bg-white/10 p-0.5" />
          {!railCollapsed ? (
            <div className="min-w-0 flex-1">
              <div className="text-sm font-black text-white">DLE Connect</div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-white/60">Projects & Engineering</div>
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => setRailCollapsed((value) => !value)}
            className="shrink-0 rounded-md p-1.5 text-white/70 hover:bg-white/10 hover:text-white"
            aria-label={railCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={railCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {railCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">{renderNav(railCollapsed)}</div>
        <div className="border-t border-white/10 p-2">
          <button
            type="button"
            onClick={() => setRailCollapsed((value) => !value)}
            className="flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-semibold text-white/70 hover:bg-white/10 hover:text-white"
          >
            {railCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            {!railCollapsed ? 'Collapse' : null}
          </button>
        </div>
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" className="absolute inset-0 bg-slate-900/40" onClick={() => setMobileOpen(false)} aria-label="Close menu" />
          <div className="absolute inset-y-0 left-0 w-[270px] bg-[#081B42] shadow-xl">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div className="text-sm font-black text-white">Projects & Engineering</div>
              <button type="button" onClick={() => setMobileOpen(false)} className="text-white/80">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto p-2">{renderNav(false, () => setMobileOpen(false))}</div>
          </div>
        </div>
      ) : null}

      <div className={`min-h-screen ${contentPad}`}>
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <button type="button" className="rounded-md border border-slate-200 p-2 lg:hidden" onClick={() => setMobileOpen(true)}>
              <Menu className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="hidden rounded-md border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 lg:inline-flex"
              onClick={() => setRailCollapsed((value) => !value)}
              aria-label={railCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={railCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {railCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </button>
            <EnterpriseHomeButton />
            <div className="shrink-0 text-sm font-black text-slate-900">Projects & Engineering</div>
            <div className="relative ml-2 hidden max-w-md flex-1 md:block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
                placeholder={searchPlaceholder(pathname)}
                aria-label="Search"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <NotificationCenter />
            <EnterpriseUserProfile />
          </div>
        </header>
        <main className="p-4 lg:p-6">
          <div className="pm-portal">{children}</div>
        </main>
      </div>
    </div>
  );
}
