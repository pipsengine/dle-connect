'use client';

import type * as React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { 
  ChevronLeft,
  ChevronRight,
  ChevronDown
} from 'lucide-react';
import { navigationConfig, NavItem } from '@/lib/config/navigation';

const requiredPermission = (route?: string) => {
  if (!route || route === '/') return 'enterprise.view';
  if (route === '/administration') return 'admin.roles.view';
  if (route.startsWith('/administration/access-control')) return 'admin.roles.view';
  if (route.startsWith('/administration/user-management')) return 'admin.users.view';
  if (route.startsWith('/administration/audit-trail')) return 'audit.view';
  if (route.startsWith('/administration/approval-workflow')) return 'workflow.configure';
  if (route.startsWith('/administration/system-settings')) return 'security.configure';
  if (route.startsWith('/administration/integrations')) return 'integration.view';
  if (route.startsWith('/administration/ai-and-automation')) return 'it.view';
  if (route.startsWith('/administration/compliance-and-governance')) return 'audit.view';
  if (route.startsWith('/hris/administration/user-management')) return 'admin.users.view';
  if (route.startsWith('/hris/administration/roles-and-permissions')) return 'admin.roles.view';
  if (route.startsWith('/hris/administration/audit-trail')) return 'audit.view';
  if (route.startsWith('/hris/payroll')) return 'payroll.view';
  if (route.startsWith('/hris/employees')) return 'employees.view';
  if (route.startsWith('/hris/leave-management')) return 'leave.view';
  if (route.startsWith('/hris')) return 'hris.view';
  if (route.startsWith('/workforce-portal')) return '';
  if (route.startsWith('/operations-center/timesheets')) return 'operations.timesheets.submit';
  if (route.startsWith('/operations-center/workforce-allocation')) return 'operations.allocation.view';
  if (route.startsWith('/operations-center/resource-planning')) return 'operations.resource-planning.view';
  if (route.startsWith('/operations-center/daily-activity-reports')) return 'operations.daily-reports.create';
  if (route.startsWith('/operations-center/production-tracking')) return 'operations.production.view';
  if (route.startsWith('/operations-center')) return 'operations.view';
  if (route.startsWith('/finance-accounting')) return 'finance.view';
  if (route.startsWith('/procurement')) return 'procurement.view';
  if (route.startsWith('/projects-engineering')) return 'project.view';
  if (route.startsWith('/hse-management')) return 'hse.view';
  if (route.startsWith('/quality-management')) return 'quality.view';
  if (route.startsWith('/document-management')) return 'documents.view';
  if (route.startsWith('/logistics-fleet')) return 'fleet.view';
  return 'enterprise.view';
};

const canAccess = (permissions: string[], required: string) => {
  if (permissions.includes('*') || permissions.includes(required)) return true;
  return permissions.includes(`${required.split('.')[0]}.*`);
};

export function Sidebar({
  isOpen,
  toggle,
  variant = 'desktop',
  onNavigate,
}: {
  isOpen: boolean;
  toggle: () => void;
  variant?: 'desktop' | 'mobile';
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [permissions, setPermissions] = useState<string[]>([]);
  const [sessionContext, setSessionContext] = useState<{ roles: string[]; department: string; unit: string; isGlobalAdmin: boolean }>({
    roles: [],
    department: '',
    unit: '',
    isGlobalAdmin: false,
  });

  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((res) => res.ok ? res.json() : null)
      .then((json) => {
        if (json?.data?.permissions) setPermissions(json.data.permissions);
        if (json?.data) {
          setSessionContext({
            roles: Array.isArray(json.data.roles) ? json.data.roles : [],
            department: String(json.data.department || ''),
            unit: String(json.data.unit || ''),
            isGlobalAdmin: Boolean(json.data.isGlobalAdmin),
          });
        }
      })
      .catch(() => setPermissions([]));
  }, []);

  const visibleNavigation = useMemo(() => {
    const hrText = `${sessionContext.department} ${sessionContext.unit} ${sessionContext.roles.join(' ')}`.toLowerCase();
    const canUseHrManagement =
      sessionContext.isGlobalAdmin ||
      sessionContext.roles.includes('Super Administrator') ||
      /\bhr\b/.test(hrText) ||
      hrText.includes('human resources') ||
      hrText.includes('human resource') ||
      hrText.includes('human capital');

    return navigationConfig
      .map((item) => {
        const subItems = item.subItems?.filter((sub) => {
          if (sub.route === '/hris') return canUseHrManagement && canAccess(permissions, requiredPermission(sub.route));
          if (sub.route === '/workforce-portal') return true;
          return canAccess(permissions, requiredPermission(sub.route));
        });
        const canSeeItem = item.id === 'hris'
          ? !!subItems?.length
          : canAccess(permissions, requiredPermission(item.route)) || !!subItems?.length;
        return canSeeItem ? { ...item, subItems } : null;
      })
      .filter(Boolean) as NavItem[];
  }, [permissions, sessionContext]);

  const activeGroupId = useMemo(() => {
    const activeGroup = visibleNavigation.find((item) => {
      if (!item.subItems?.length) return false;
      return item.subItems.some((sub) => pathname === sub.route || pathname.startsWith(`${sub.route}/`));
    });
    return activeGroup?.id;
  }, [pathname, visibleNavigation]);

  const toggleGroup = (id: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const renderNavGroup = (items: NavItem[], title?: string) => {
    if (items.length === 0) return null;
    
    return (
      <div className="mb-6">
        {title && isOpen && (
          <h3 className="px-4 text-[11px] font-bold tracking-wider text-slate-400 uppercase mb-3">
            {title}
          </h3>
        )}
        <div className="flex flex-col gap-1">
          {items.map((item) => {
            const hasSubMenu = item.subItems && item.subItems.length > 0;
            const isExpanded = !!expandedGroups[item.id] || item.id === activeGroupId;
            
            // For simple paths, determine active state
            const isActivePrimary = pathname === item.route || (item.route ? pathname.startsWith(`${item.route}/`) : false) || (item.subItems && item.subItems.some(sub => pathname === sub.route || pathname.startsWith(`${sub.route}/`)));

            return (
              <div key={item.id}>
                {hasSubMenu ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (!isOpen) toggle();
                      toggleGroup(item.id);
                    }}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left transition-all duration-200 group whitespace-nowrap ${
                      isActivePrimary
                        ? 'bg-dle-blue/5 text-dle-blue font-medium'
                        : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-3">
                      <item.icon className={`w-5 h-5 shrink-0 ${isActivePrimary ? 'text-dle-blue' : 'text-slate-400 group-hover:text-slate-600'}`} />
                      {isOpen && (
                        <span className="text-sm font-medium truncate">
                          {item.label}
                        </span>
                      )}
                    </span>
                    {isOpen && (
                      <div className="flex items-center gap-2 shrink-0">
                        {item.badgeCount && (
                          <span className="bg-dle-blue/10 text-dle-blue text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                            {item.badgeCount}
                          </span>
                        )}
                        <span className="rounded-md p-1 transition-colors group-hover:bg-white/60" aria-hidden="true">
                          <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-180 text-dle-blue' : 'text-slate-400'}`} />
                        </span>
                      </div>
                    )}
                  </button>
                ) : (
                  <Link
                    href={item.route || '#'}
                    onClick={onNavigate}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group whitespace-nowrap ${
                      pathname === item.route
                        ? 'bg-dle-blue/5 text-dle-blue font-medium' 
                        : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <item.icon className={`w-5 h-5 shrink-0 ${pathname === item.route ? 'text-dle-blue' : 'text-slate-400 group-hover:text-slate-600'}`} />
                    {isOpen && (
                      <span className="text-sm font-medium flex-1">
                        {item.label}
                      </span>
                    )}
                  </Link>
                )}

                {/* Sub Menu Links */}
                {hasSubMenu && isOpen && (
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="py-1 px-4 ml-5 mt-1 border-l border-slate-100 flex flex-col gap-1">
                          {item.subItems?.map((sub) => {
                            const isSubActive = pathname === sub.route || pathname.startsWith(`${sub.route}/`);
                            return (
                              <Link
                                key={sub.slug}
                                href={sub.route}
                                onClick={onNavigate}
                                className={`text-[13px] py-2 px-3 rounded-md transition-colors ${
                                  isSubActive 
                                    ? 'text-dle-blue font-semibold bg-dle-blue/5' 
                                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                                }`}
                              >
                                {sub.title}
                              </Link>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const mainItems = visibleNavigation.filter(i => i.group === 'main');
  const adminItems = visibleNavigation.filter(i => i.group === 'administration');
  const supportItems = visibleNavigation.filter(i => i.group === 'support');

  return (
    <motion.aside 
      initial={false}
      animate={{ width: variant === 'mobile' ? 280 : isOpen ? 280 : 80 }}
      className={`bg-white border-r border-slate-100 flex flex-col shadow-sm shrink-0 ${
        variant === 'mobile' ? 'absolute inset-y-0 left-0 z-10 max-w-[86vw]' : 'relative z-20 hidden lg:flex'
      }`}
    >
      <div className="h-16 flex items-center justify-between px-4 border-b border-slate-100 whitespace-nowrap overflow-hidden">
        <Link href="/" className="flex items-center w-full px-3" aria-label="Go to home page">
          <div className="relative overflow-hidden h-14 w-full max-w-[220px]">
            <Image src="/brand/dorman-long-logo.jpg" alt="Dorman Long Engineering Limited" fill sizes="220px" className="object-contain" priority />
          </div>
        </Link>
      </div>

      <button 
        onClick={toggle}
        className="absolute -right-3 top-20 w-6 h-6 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-400 hover:text-dle-blue hover:border-dle-blue transition-colors shadow-sm z-30"
        aria-label={variant === 'mobile' ? 'Close navigation' : 'Toggle navigation'}
      >
        {isOpen || variant === 'mobile' ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>

      <div className="flex-1 py-6 px-4 flex flex-col overflow-y-auto overflow-x-hidden custom-scrollbar">
        {renderNavGroup(mainItems, 'Main')}
        {renderNavGroup(supportItems, 'IT & Support')}
        {renderNavGroup(adminItems, 'Administration')}
      </div>
    </motion.aside>
  );
}
