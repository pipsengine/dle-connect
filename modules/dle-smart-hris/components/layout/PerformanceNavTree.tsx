'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, ChevronRight, Target } from 'lucide-react';
import {
  filterMenuByRole,
  findParentGroupId,
  performanceMenuTree,
  performanceRouteHref,
  resolvePerformanceRole,
  resolvePerformanceRoute,
} from '@/lib/performance-management-menu-config';
import type { PerformanceBadgeMap, PerformanceMenuItem, PerformanceRole } from '@/lib/performance-management-types';

type PerformanceNavTreeProps = {
  isOpen: boolean;
  onNavigate?: () => void;
};

const badgeLabel = (value: number | string | undefined) => {
  if (value == null || value === 0) return null;
  if (typeof value === 'string') return value;
  return value > 99 ? '99+' : String(value);
};

const normalize = (path: string) =>
  path.replace(/^\/+/, '').replace(/^hris\/performance-management\/?/, '');

export function PerformanceNavTree({ isOpen, onNavigate }: PerformanceNavTreeProps) {
  const pathname = usePathname();
  const [role, setRole] = useState<PerformanceRole>('HR Officer');
  const [permissions, setPermissions] = useState<string[]>([]);
  const [badges, setBadges] = useState<PerformanceBadgeMap>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ planning: true, 'performance-reviews': true });

  const onPerformance = pathname.startsWith('/hris/performance-management');
  const [treeOpen, setTreeOpen] = useState(onPerformance);
  const activeRoute = onPerformance ? resolvePerformanceRoute(normalize(pathname)) : '';

  useEffect(() => {
    if (onPerformance) setTreeOpen(true);
  }, [onPerformance]);

  useEffect(() => {
    fetch('/api/hris/performance-management?route=dashboard', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!json?.data) return;
        setRole(resolvePerformanceRole(json.data.role));
        setPermissions(Array.isArray(json.data.sessionPermissions) ? json.data.sessionPermissions : []);
        setBadges(json.data.badges || {});
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!activeRoute) return;
    const parent = findParentGroupId(activeRoute);
    if (parent) setExpanded((prev) => ({ ...prev, [parent]: true }));
  }, [activeRoute]);

  const visibleMenu = useMemo(() => filterMenuByRole(performanceMenuTree, role, permissions), [role, permissions]);

  const isActive = (item: PerformanceMenuItem) => {
    if (!activeRoute) return false;
    const itemRoute = resolvePerformanceRoute(item.route);
    return activeRoute === itemRoute || activeRoute.startsWith(`${itemRoute}/`);
  };

  const renderBadge = (item: PerformanceMenuItem) => {
    const label = item.badgeKey ? badgeLabel(badges[item.badgeKey]) : null;
    if (!label) return null;
    const isStatus = typeof badges[item.badgeKey!] === 'string';
    return (
      <span
        className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
          isStatus ? 'bg-emerald-100 text-emerald-700' : 'bg-dle-blue/10 text-dle-blue'
        }`}
      >
        {label}
      </span>
    );
  };

  const renderChild = (child: PerformanceMenuItem) => {
    const active = isActive(child);
    return (
      <Link
        key={child.id}
        href={performanceRouteHref(child.route)}
        onClick={onNavigate}
        title={child.label}
        className={`flex items-start gap-2 rounded-md px-3 py-2 text-[13px] leading-snug outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#2563EB]/40 ${
          active ? 'bg-dle-blue/5 font-semibold text-dle-blue' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
        }`}
      >
        <span className="min-w-0 flex-1 whitespace-normal break-words">{child.label}</span>
        {renderBadge(child)}
      </Link>
    );
  };

  const renderGroup = (group: PerformanceMenuItem) => {
    const hasChildren = Boolean(group.children?.length);
    if (!hasChildren) {
      const active = isActive(group);
      return (
        <Link
          key={group.id}
          href={performanceRouteHref(group.route)}
          onClick={onNavigate}
          title={group.label}
          className={`flex items-start gap-2 rounded-md px-3 py-2 text-[13px] font-medium leading-snug outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#2563EB]/40 ${
            active ? 'bg-dle-blue/5 font-semibold text-dle-blue' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
          }`}
        >
          <group.icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <span className="min-w-0 flex-1 whitespace-normal break-words">{group.label}</span>
          {renderBadge(group)}
        </Link>
      );
    }

    const childActive = Boolean(group.children?.some((child) => isActive(child)));
    const groupExpanded = childActive || (expanded[group.id] ?? false);

    return (
      <div key={group.id}>
        <button
          type="button"
          onClick={() => setExpanded((prev) => ({ ...prev, [group.id]: !groupExpanded }))}
          title={group.label}
          className={`flex w-full items-start gap-2 rounded-md px-3 py-2 text-[13px] font-semibold leading-snug outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#2563EB]/40 ${
            childActive ? 'text-dle-blue' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
          }`}
          aria-expanded={groupExpanded}
        >
          <span className="min-w-0 flex-1 text-left whitespace-normal break-words">{group.label}</span>
          {groupExpanded ? (
            <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          ) : (
            <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          )}
        </button>
        {groupExpanded ? (
          <div className="ml-3 mt-1 flex flex-col gap-0.5 border-l border-slate-100 pl-2">
            {group.children!.map((child) => renderChild(child))}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => setTreeOpen((prev) => !prev)}
        className={`group flex w-full items-start justify-between rounded-lg px-3 py-2.5 text-left outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-[#2563EB]/40 ${
          onPerformance
            ? 'bg-dle-blue/5 font-medium text-dle-blue'
            : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
        }`}
        aria-expanded={treeOpen}
      >
        <span className="flex min-w-0 flex-1 items-start gap-3">
          <Target className={`mt-0.5 h-5 w-5 shrink-0 ${onPerformance ? 'text-dle-blue' : 'text-slate-400'}`} />
          {isOpen ? <span className="whitespace-normal break-words text-sm font-medium leading-snug">Performance Management</span> : null}
        </span>
        {isOpen ? (
          <span className="flex shrink-0 items-center gap-2">
            <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${treeOpen ? 'rotate-180 text-dle-blue' : 'text-slate-400'}`} />
          </span>
        ) : null}
      </button>

      {isOpen && treeOpen ? (
        <div className="ml-3 mt-1 flex flex-col gap-0.5 border-l border-slate-100 pl-2">
          {visibleMenu.map((item) => renderGroup(item))}
        </div>
      ) : null}
    </div>
  );
}
