'use client';

import { useState } from 'react';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { SessionPermissionRefresh } from '@/components/auth/session-permission-refresh';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  return (
    <div className="flex h-dvh min-w-0 overflow-hidden bg-white" data-dle-shell>
      <SessionPermissionRefresh />
      <Sidebar isOpen={sidebarOpen} toggle={() => setSidebarOpen(!sidebarOpen)} variant="desktop" />
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-slate-950/35"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <Sidebar
            isOpen
            toggle={() => setMobileSidebarOpen(false)}
            variant="mobile"
            onNavigate={() => setMobileSidebarOpen(false)}
          />
        </div>
      )}
      
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header 
          toggleSidebar={() => setMobileSidebarOpen(true)}
          toggleDesktopSidebar={() => setSidebarOpen(!sidebarOpen)}
        />
        
        <main className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="min-w-0 flex-1 overflow-x-clip overflow-y-auto px-2.5 pb-24 pt-0 sm:px-6 sm:pb-32">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
