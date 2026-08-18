'use client';

import { Sidebar } from './sidebar';
import { Header } from './header';
import { useViewportSidebarOpen } from '@/lib/use-viewport-sidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useViewportSidebarOpen();

  return (
    <div className="flex h-dvh min-w-0 overflow-hidden bg-white" data-dle-shell>
      <Sidebar isOpen={sidebarOpen} toggle={() => setSidebarOpen(!sidebarOpen)} />
      {sidebarOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/30 lg:hidden"
        />
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header
          toggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          toggleDesktopSidebar={() => setSidebarOpen(!sidebarOpen)}
        />

        <main className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-2.5 pb-28 pt-0 sm:px-6 sm:pb-32">
            <div className="dle-page space-y-6 sm:space-y-8">{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}
