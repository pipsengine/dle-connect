'use client';

import { useState } from 'react';
import { Sidebar } from './sidebar';
import { Header } from './header';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <Sidebar isOpen={sidebarOpen} toggle={() => setSidebarOpen(!sidebarOpen)} />
      
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header 
          toggleSidebar={() => setSidebarOpen(!sidebarOpen)} 
        />
        
        <main className="flex-1 overflow-hidden flex flex-col relative">
          <div className="flex-1 overflow-auto px-6 pb-32 pt-0 space-y-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
