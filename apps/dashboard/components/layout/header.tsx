'use client';

import { Search, Bell, Menu } from 'lucide-react';
import Image from 'next/image';

export function Header({ 
  toggleSidebar
}: { 
  toggleSidebar: () => void; 
}) {
  return (
    <header className="h-16 bg-white/80 backdrop-blur-md border-b border-slate-100 flex items-center justify-between px-6 sticky top-0 z-10">
      <div className="flex items-center gap-4 flex-1">
        <button onClick={toggleSidebar} className="p-2 -ml-2 text-slate-500 hover:text-slate-900 lg:hidden">
          <Menu className="w-5 h-5" />
        </button>
        
        <div className="relative max-w-md w-full hidden md:block">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input 
            type="text" 
            placeholder="Search enterprise records, personnel, projects..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-dle-blue/20 focus:border-dle-blue transition-all"
          />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-dle-green/10 text-dle-green rounded-full text-xs font-medium">
          <div className="w-2 h-2 rounded-full bg-dle-green animate-pulse"></div>
          Systems Optimal
        </div>

        <button className="relative w-9 h-9 flex items-center justify-center text-slate-500 hover:bg-slate-50 rounded-full transition-colors">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-dle-red border-2 border-white"></span>
        </button>

        <div className="h-6 w-px bg-slate-200 mx-1"></div>

        <button className="flex items-center gap-2 pl-2">
          <div className="w-8 h-8 rounded-full bg-slate-200 overflow-hidden relative">
            <Image src="https://picsum.photos/seed/dle-exec/100/100" alt="Executive User" fill referrerPolicy="no-referrer" className="object-cover" />
          </div>
          <div className="hidden md:flex flex-col items-start leading-tight">
            <span className="text-sm font-medium text-slate-900">Engr. Adeoye</span>
            <span className="text-xs text-slate-500 font-mono">EXEC-DIR</span>
          </div>
        </button>
      </div>
    </header>
  );
}
