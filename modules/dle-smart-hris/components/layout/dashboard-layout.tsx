'use client';

import { useState } from 'react';
import { Sidebar } from './sidebar';
import { Header } from './header';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar isOpen={sidebarOpen} toggle={() => setSidebarOpen(!sidebarOpen)} />
      
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header 
          toggleSidebar={() => setSidebarOpen(!sidebarOpen)} 
        />
        
        <main className="flex-1 overflow-hidden flex flex-col relative">
          <div className="flex-1 overflow-auto p-6 space-y-8 pb-32">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
