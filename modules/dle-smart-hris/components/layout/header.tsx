'use client';

import { Search, Bell, Mail, Menu, ChevronDown } from 'lucide-react';
import Image from 'next/image';
import { usePathname } from 'next/navigation';

export function Header({ 
  toggleSidebar
}: { 
  toggleSidebar: () => void; 
}) {
  const pathname = usePathname();
  const title = pathname.startsWith('/hris/dashboard') ? 'Dashboard' : 'HRIS';

  return (
    <header className="h-16 bg-white/80 backdrop-blur-md border-b border-slate-100 flex items-center justify-between px-6 sticky top-0 z-10">
      <div className="flex items-center gap-3 min-w-0">
        <button onClick={toggleSidebar} className="p-2 -ml-2 text-slate-500 hover:text-slate-900 lg:hidden">
          <Menu className="w-5 h-5" />
        </button>
        
        <span className="text-sm font-semibold text-slate-900 truncate">{title}</span>
      </div>

      <div className="flex-1 px-6 hidden md:block">
        <div className="relative max-w-xl mx-auto">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input 
            type="text" 
            placeholder="Search employees, modules, documents..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-dle-blue/20 focus:border-dle-blue transition-all"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button className="relative w-9 h-9 flex items-center justify-center text-slate-500 hover:bg-slate-50 rounded-full transition-colors">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-dle-red border-2 border-white"></span>
        </button>

        <button className="relative w-9 h-9 flex items-center justify-center text-slate-500 hover:bg-slate-50 rounded-full transition-colors">
          <Mail className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-dle-blue border-2 border-white"></span>
        </button>

        <div className="h-6 w-px bg-slate-200 mx-1 hidden sm:block"></div>

        <button className="flex items-center gap-3 pl-1">
          <div className="w-9 h-9 rounded-full bg-slate-200 overflow-hidden relative shrink-0">
            <Image src="https://picsum.photos/seed/dle-hris-user/100/100" alt="User" fill referrerPolicy="no-referrer" className="object-cover" />
          </div>
          <div className="hidden md:flex flex-col items-start leading-tight">
            <span className="text-sm font-semibold text-slate-900">Juan Dela Cruz</span>
            <span className="text-xs text-slate-500">HR Manager</span>
          </div>
          <ChevronDown className="w-4 h-4 text-slate-400 hidden md:block" />
        </button>
      </div>
    </header>
  );
}
