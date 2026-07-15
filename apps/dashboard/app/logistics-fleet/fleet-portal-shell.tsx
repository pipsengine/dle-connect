'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Activity, Building2, ChevronDown, Menu, RefreshCcw, Search, X } from 'lucide-react';
import { NotificationCenter } from '@/components/layout/notification-center';
import { EnterpriseUserProfile } from '@hris/components/layout/enterprise-user-profile';
import {
  canAccessFleetWorkspace,
  type FleetWorkspaceAccessId,
} from '@/lib/access/fleet-access';
import { ALL_FLEET_NAV_ITEMS, FLEET_NAV_SECTIONS, type FleetWorkspaceId } from '@/lib/fleet-management/nav';

type FleetPortalShellProps = {
  workspace: FleetWorkspaceId;
  loading?: boolean;
  onRefresh?: () => void;
  employee?: {
    fullName?: string;
    jobTitle?: string;
    employeeCode?: string;
    department?: string;
  };
  children: ReactNode;
};

type SessionAccess = {
  permissions: string[];
  isGlobalAdmin: boolean;
  employeeCode: string;
  ready: boolean;
};

export function FleetPortalShell({ workspace, loading, onRefresh, employee, children }: FleetPortalShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [session, setSession] = useState<SessionAccess>({
    permissions: [],
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

  const visibleSections = useMemo(() => {
    return FLEET_NAV_SECTIONS
      .map((section) => ({
        ...section,
        items: section.items.filter((item) =>
          canAccessFleetWorkspace(
            item.id as FleetWorkspaceAccessId,
            session.permissions,
            session.isGlobalAdmin,
            session.employeeCode,
          ),
        ),
      }))
      .filter((section) => section.items.length > 0);
  }, [session]);

  const allowedWorkspaces = useMemo(
    () => visibleSections.flatMap((section) => section.items.map((item) => item.id)),
    [visibleSections],
  );

  useEffect(() => {
    if (!session.ready) return;
    const allowed = canAccessFleetWorkspace(
      workspace as FleetWorkspaceAccessId,
      session.permissions,
      session.isGlobalAdmin,
      session.employeeCode,
    );
    if (allowed) return;
    const fallback = allowedWorkspaces[0] || 'trips-dispatch';
    if (fallback !== workspace) router.replace(`/logistics-fleet/${fallback}`);
  }, [allowedWorkspaces, router, session, workspace]);

  const activeHref = useMemo(
    () => ALL_FLEET_NAV_ITEMS.find((item) => item.id === workspace)?.href || '/logistics-fleet/dashboard',
    [workspace],
  );

  const NavBody = (
    <>
      <div className="border-b border-white/10 px-5 py-5">
        <div className="relative h-12 w-full">
          <Image src="/brand/dorman-long-logo.svg" alt="Dorman Long Engineering Limited" fill sizes="240px" className="object-contain object-left brightness-0 invert" priority />
        </div>
        <p className="mt-3 text-[11px] font-black uppercase tracking-[0.18em] text-white/45">Fleet Management</p>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
        {visibleSections.map((section) => {
          const isCollapsed = Boolean(collapsed[section.id]);
          return (
            <div key={section.id}>
              <button
                type="button"
                onClick={() => setCollapsed((current) => ({ ...current, [section.id]: !current[section.id] }))}
                className="mb-1 flex w-full items-center justify-between px-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/40"
              >
                <span>{section.label}</span>
                <ChevronDown className={`h-3.5 w-3.5 transition ${isCollapsed ? '-rotate-90' : ''}`} />
              </button>
              {!isCollapsed ? (
                <div className="space-y-0.5">
                  {section.items.map((item) => {
                    const active = pathname === item.href || activeHref === item.href || workspace === item.id;
                    return (
                      <Link
                        key={item.id}
                        href={item.href}
                        onClick={() => setMobileOpen(false)}
                        className={`flex w-full items-center gap-3 rounded-[14px] px-3 py-2.5 text-left text-[13px] font-semibold transition-all duration-150 ${
                          active
                            ? 'bg-[#2563EB] text-white shadow-[0_0_20px_rgba(37,99,235,0.35)]'
                            : 'text-white/75 hover:bg-[#173067] hover:text-white'
                        }`}
                      >
                        <item.icon className="h-4 w-4 shrink-0" strokeWidth={2} />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-white/10 px-4 py-4">
        <div className="rounded-[16px] border border-white/10 bg-white/5 p-3">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
            </span>
            <span className="text-[13px] font-semibold text-emerald-400">Fleet Online</span>
          </div>
          <p className="mt-2 flex items-center gap-1 text-[11px] text-white/50">
            <Activity className="h-3 w-3 text-emerald-400" /> Logistics & Fleet portal active
          </p>
        </div>
      </div>
    </>
  );

  return (
    <div className="flex min-h-dvh bg-[#F5F8FC]" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[290px] flex-col lg:flex" style={{ backgroundColor: '#0B1F4A' }}>
        {NavBody}
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" className="absolute inset-0 bg-slate-950/50" aria-label="Close menu" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-[290px] flex-col" style={{ backgroundColor: '#0B1F4A' }}>
            <div className="flex justify-end p-3">
              <button type="button" onClick={() => setMobileOpen(false)} className="rounded-lg p-2 text-white/70 hover:bg-white/10"><X className="h-5 w-5" /></button>
            </div>
            {NavBody}
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col lg:pl-[290px]">
        <header className="sticky top-0 z-20 flex h-[80px] items-center gap-3 border-b border-[#E2E8F0] bg-white px-4 sm:px-5">
          <button type="button" onClick={() => setMobileOpen(true)} className="inline-flex h-10 w-10 items-center justify-center rounded-[14px] border border-[#E5E7EB] bg-white text-[#475569] lg:hidden">
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-[15px] font-bold text-[#0F172A]">Logistics & Fleet Portal</h1>
            <p className="truncate text-[13px] text-[#94A3B8]">{employee?.department || 'Enterprise fleet operations'}</p>
          </div>
          <div className="relative mx-auto hidden max-w-xl flex-1 lg:block">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
            <input
              type="search"
              placeholder="Search vehicles, drivers, trips, fuel, work orders..."
              className="h-11 w-full rounded-[14px] border border-[#E5E7EB] bg-[#F5F8FC] pl-11 pr-4 text-[14px] text-[#0F172A] outline-none placeholder:text-[#94A3B8] focus:border-[#93C5FD] focus:ring-2 focus:ring-[#DBEAFE]"
            />
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Link href="/" className="hidden h-10 items-center gap-2 rounded-[14px] border border-[#E5E7EB] bg-white px-3 text-[13px] font-semibold text-[#475569] hover:bg-[#F5F8FC] sm:inline-flex">
              <Building2 className="h-4 w-4" /> Enterprise Home
            </Link>
            <NotificationCenter scope="notifications" />
            <EnterpriseUserProfile
              context="enterprise"
              name={employee?.fullName}
              role={employee?.jobTitle || 'Fleet User'}
              employeeCode={employee?.employeeCode}
              department={employee?.department}
              profileHref="/"
            />
            {onRefresh ? (
              <button type="button" onClick={onRefresh} disabled={loading} className="inline-flex h-10 w-10 items-center justify-center rounded-[14px] border border-[#E5E7EB] bg-white text-[#475569] hover:bg-[#F5F8FC] disabled:opacity-60">
                <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            ) : null}
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
