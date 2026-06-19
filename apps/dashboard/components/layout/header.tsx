'use client';

import { Search, Menu } from 'lucide-react';
import { NotificationCenter } from '@/components/layout/notification-center';
import { EnterpriseUserProfile } from '@hris/components/layout/enterprise-user-profile';

export function Header({ 
  toggleSidebar,
  toggleDesktopSidebar,
}: { 
  toggleSidebar: () => void; 
  toggleDesktopSidebar?: () => void;
}) {
  return (
    <header className="h-16 bg-white border-b border-slate-100 flex items-center justify-between px-3 sm:px-6 sticky top-0 z-30">
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-4">
        <button onClick={toggleSidebar} className="p-2 -ml-2 text-slate-500 hover:text-slate-900 lg:hidden" aria-label="Open navigation">
          <Menu className="w-5 h-5" />
        </button>
        {toggleDesktopSidebar && (
          <button onClick={toggleDesktopSidebar} className="hidden p-2 -ml-2 text-slate-500 hover:text-slate-900 lg:inline-flex" aria-label="Toggle navigation">
            <Menu className="w-5 h-5" />
          </button>
        )}
        
        <div className="relative max-w-md w-full hidden md:block">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input 
            type="text" 
            placeholder="Search enterprise records, personnel, projects..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-dle-blue/20 focus:border-dle-blue transition-all"
          />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 sm:gap-3 lg:gap-4">
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-dle-green/10 text-dle-green rounded-full text-xs font-medium">
          <div className="w-2 h-2 rounded-full bg-dle-green animate-pulse"></div>
          Systems Optimal
        </div>

        <NotificationCenter scope="notifications" />

        <div className="mx-1 hidden h-6 w-px bg-slate-200 sm:block"></div>

        <EnterpriseUserProfile context="enterprise" />
      </div>
    </header>
  );
}
