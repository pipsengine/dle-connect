'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { 
  ChevronLeft,
  ChevronRight,
  ChevronDown
} from 'lucide-react';
import { navigationConfig, NavItem } from '../../lib/config/navigation';
import { canAccessHrisPath, canAccessHrisPerformanceManagement, canAccessPayrollManagementNav, hrisRoutePermissionOptions, isHrPortalUser } from '@/lib/access/route-access';
import { PerformanceNavTree } from './PerformanceNavTree';

export function Sidebar({ isOpen, toggle }: { isOpen: boolean; toggle: () => void }) {
  const pathname = usePathname();
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [sessionContext, setSessionContext] = useState({ roles: [] as string[], permissions: [] as string[], department: '', unit: '', isGlobalAdmin: false });
  const HRIS_BASE = '/hris';
  const currentPath = pathname.startsWith(HRIS_BASE) ? pathname.slice(HRIS_BASE.length) || '/' : pathname;

  const toHref = (route?: string) => {
    if (!route) return '#';
    if (route.startsWith(HRIS_BASE)) return route;
    return `${HRIS_BASE}${route.startsWith('/') ? route : `/${route}`}`;
  };

  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((res) => res.ok ? res.json() : null)
      .then((json) => {
        if (!json?.data) return;
        setSessionContext({
          roles: Array.isArray(json.data.roles) ? json.data.roles : [],
          permissions: Array.isArray(json.data.permissions) ? json.data.permissions : [],
          department: String(json.data.department || ''),
          unit: String(json.data.unit || ''),
          isGlobalAdmin: Boolean(json.data.isGlobalAdmin),
        });
      })
      .catch(() => {
        setSessionContext({ roles: [], permissions: [], department: '', unit: '', isGlobalAdmin: false });
      });
  }, []);

  const visibleNavigation = useMemo(() => {
    const canUseHrPortal = isHrPortalUser(sessionContext);
    const canUsePayroll = canAccessPayrollManagementNav(sessionContext);
    return navigationConfig
      .map((item) => {
        if (item.id === 'payroll' && !canUsePayroll) return null;
        const subItems = item.subItems?.filter((sub) => {
          const fullPath = toHref(sub.route);
          if (item.id === 'payroll' && !canUsePayroll) return false;
          const explicitOptions = hrisRoutePermissionOptions(fullPath);
          if (!canUseHrPortal && !explicitOptions) return false;
          return canAccessHrisPath(sessionContext, fullPath);
        });
        const itemPath = item.route ? toHref(item.route) : '';
        const canSeeItem = subItems?.length || (itemPath && canAccessHrisPath(sessionContext, itemPath));
        return canSeeItem ? { ...item, subItems } : null;
      })
      .filter(Boolean) as NavItem[];
  }, [sessionContext]);

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
            if (item.id === 'performance-management') {
              if (!canAccessHrisPerformanceManagement(sessionContext)) return null;
              return <PerformanceNavTree key={item.id} isOpen={isOpen} onNavigate={undefined} />;
            }
            const hasSubMenu = item.subItems && item.subItems.length > 0;
            // For simple paths, determine active state
            const isActivePrimary = currentPath === item.route || (item.subItems && item.subItems.some(sub => currentPath === sub.route));
            const isExpanded = expandedGroups[item.id] ?? Boolean(isActivePrimary);

            return (
              <div key={item.id}>
                {hasSubMenu ? (
                  <button
                    onClick={() => {
                      if (!isOpen) toggle(); // Auto-expand sidebar if closed
                      toggleGroup(item.id);
                    }}
                    className={`flex items-center justify-between px-3 py-2.5 rounded-lg transition-all duration-200 w-full group whitespace-nowrap ${
                      isActivePrimary && !isExpanded
                        ? 'bg-dle-blue/5 text-dle-blue font-medium' 
                        : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <item.icon className={`w-5 h-5 shrink-0 ${isActivePrimary && !isExpanded ? 'text-dle-blue' : 'text-slate-400 group-hover:text-slate-600'}`} />
                      {isOpen && (
                        <span className="text-sm font-medium">
                          {item.label}
                        </span>
                      )}
                    </div>
                    {isOpen && (
                      <div className="flex items-center gap-2">
                        {item.badgeCount && (
                          <span className="bg-dle-blue/10 text-dle-blue text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                            {item.badgeCount}
                          </span>
                        )}
                        <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-180 text-dle-blue' : 'text-slate-400'}`} />
                      </div>
                    )}
                  </button>
                ) : (
                  <Link
                    href={toHref(item.route)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group whitespace-nowrap ${
                      currentPath === item.route
                        ? 'bg-dle-blue/5 text-dle-blue font-medium' 
                        : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <item.icon className={`w-5 h-5 shrink-0 ${currentPath === item.route ? 'text-dle-blue' : 'text-slate-400 group-hover:text-slate-600'}`} />
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
                            const isSubActive = currentPath === sub.route;
                            return (
                              <Link
                                key={sub.slug}
                                href={toHref(sub.route)}
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
      animate={{ width: isOpen ? 280 : 120 }}
      className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-slate-100 bg-white shadow-xl transition-transform duration-200 lg:relative lg:z-20 lg:shrink-0 lg:shadow-sm ${
        isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      }`}
    >
      <div className="h-16 flex items-center justify-between px-4 border-b border-slate-100 whitespace-nowrap overflow-hidden">
        <Link href={toHref('/dashboard/executive-hr-dashboard')} className="flex items-center w-full px-3">
          <div className="relative overflow-hidden h-14 w-full max-w-[220px]">
            <img
              src="/brand/dorman-long-logo.jpg"
              alt="Dorman Long Engineering Limited"
              className="h-full w-full object-contain"
            />
          </div>
        </Link>
      </div>

      <button 
        onClick={toggle}
        className="absolute -right-3 top-20 z-30 flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 shadow-sm transition-colors hover:border-dle-blue hover:text-dle-blue"
      >
        {isOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>

      <div className="flex-1 py-6 px-4 flex flex-col overflow-y-auto overflow-x-hidden custom-scrollbar">
        {renderNavGroup(mainItems, 'Enterprise Operations')}
        {renderNavGroup(adminItems, 'Administration')}
        {renderNavGroup(supportItems, 'Support')}

        {isOpen ? (
          <div className="mt-auto pt-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="text-xs font-bold text-emerald-700">Online</span>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                Last sync: {new Date().toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
              <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-slate-600">
                <span className="text-emerald-600">✓</span> All systems operational
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </motion.aside>
  );
}
