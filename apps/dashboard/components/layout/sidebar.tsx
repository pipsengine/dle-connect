'use client';

import type * as React from 'react';
import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { 
  ChevronLeft,
  ChevronRight,
  ChevronDown
} from 'lucide-react';
import { navigationConfig, NavItem } from '@/lib/config/navigation';

export function Sidebar({ isOpen, toggle }: { isOpen: boolean; toggle: () => void }) {
  const pathname = usePathname();
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const activeGroupId = useMemo(() => {
    const activeGroup = navigationConfig.find((item) => {
      if (!item.subItems?.length) return false;
      return item.subItems.some((sub) => sub.route === pathname);
    });
    return activeGroup?.id;
  }, [pathname]);

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
            const isActivePrimary = pathname === item.route || (item.subItems && item.subItems.some(sub => pathname === sub.route));

            return (
              <div key={item.id}>
                {hasSubMenu ? (
                  <div
                    className={`flex items-center justify-between px-3 py-2.5 rounded-lg transition-all duration-200 w-full group whitespace-nowrap ${
                      isActivePrimary
                        ? 'bg-dle-blue/5 text-dle-blue font-medium'
                        : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <Link
                      href={item.route || '#'}
                      className="flex items-center gap-3 flex-1 min-w-0"
                      onClick={() => {
                        if (!isOpen) toggle();
                      }}
                    >
                      <item.icon className={`w-5 h-5 shrink-0 ${isActivePrimary ? 'text-dle-blue' : 'text-slate-400 group-hover:text-slate-600'}`} />
                      {isOpen && (
                        <span className="text-sm font-medium truncate">
                          {item.label}
                        </span>
                      )}
                    </Link>
                    {isOpen && (
                      <div className="flex items-center gap-2 shrink-0">
                        {item.badgeCount && (
                          <span className="bg-dle-blue/10 text-dle-blue text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                            {item.badgeCount}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                            e.preventDefault();
                            e.stopPropagation();
                            toggleGroup(item.id);
                          }}
                          className="p-1 rounded-md hover:bg-white/60 transition-colors"
                          aria-label={isExpanded ? `Collapse ${item.label}` : `Expand ${item.label}`}
                        >
                          <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-180 text-dle-blue' : 'text-slate-400'}`} />
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <Link
                    href={item.route || '#'}
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
                            const isSubActive = pathname === sub.route;
                            return (
                              <Link
                                key={sub.slug}
                                href={sub.route}
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

  const mainItems = navigationConfig.filter(i => i.group === 'main');
  const adminItems = navigationConfig.filter(i => i.group === 'administration');
  const supportItems = navigationConfig.filter(i => i.group === 'support');

  return (
    <motion.aside 
      initial={false}
      animate={{ width: isOpen ? 280 : 120 }}
      className="bg-white border-r border-slate-100 flex flex-col relative z-20 shadow-sm shrink-0"
    >
      <div className="h-16 flex items-center justify-between px-4 border-b border-slate-100 whitespace-nowrap overflow-hidden">
        <Link href="/dashboard/executive-hr-dashboard" className="flex items-center w-full px-3">
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
        className="absolute -right-3 top-20 w-6 h-6 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-400 hover:text-dle-blue hover:border-dle-blue transition-colors shadow-sm z-30"
      >
        {isOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>

      <div className="flex-1 py-6 px-4 flex flex-col overflow-y-auto overflow-x-hidden custom-scrollbar">
        {renderNavGroup(mainItems, 'Main')}
        {renderNavGroup(supportItems, 'IT & Support')}
        {renderNavGroup(adminItems, 'Administration')}
      </div>
    </motion.aside>
  );
}
