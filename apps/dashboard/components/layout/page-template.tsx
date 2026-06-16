'use client';
import { useEffect } from 'react';
import { ChevronRight, Download, Plus } from 'lucide-react';
import Link from 'next/link';

interface PageTemplateProps {
  title: string;
  description?: string;
  breadcrumbs?: { label: string; href?: string }[];
  children: React.ReactNode;
  primaryAction?: { label: string; onClick: () => void; icon?: any };
  secondaryAction?: { label: string; onClick: () => void; icon?: any };
}

export function PageTemplate({ title, description, breadcrumbs = [], children, primaryAction, secondaryAction }: PageTemplateProps) {
  useEffect(() => {
    document.title = `${title} | DLE Digital Enterprise`;
  }, [title]);

  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <nav className="flex text-[13px] text-slate-500 font-medium items-center gap-2">
        {breadcrumbs.map((bc, idx) => (
          <div key={idx} className="flex items-center gap-2">
            {bc.href ? (
              <Link href={bc.href} className="hover:text-dle-blue transition-colors">{bc.label}</Link>
            ) : (
              <span className="text-slate-800">{bc.label}</span>
            )}
            {idx < breadcrumbs.length - 1 && <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
          </div>
        ))}
      </nav>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden">
        {/* Subtle decorative background block */}
        <div className="absolute right-0 top-0 w-64 h-full bg-gradient-to-l from-dle-blue/[0.03] to-transparent pointer-events-none"></div>
        
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
          <p className="text-sm text-slate-500 mt-1.5">{description}</p>
        </div>
        
        <div className="flex items-center gap-3 relative z-10 shrink-0">
          {secondaryAction && (
            <button 
              onClick={secondaryAction.onClick}
              className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors shadow-sm flex items-center gap-2"
            >
              {secondaryAction.icon && <secondaryAction.icon className="w-4 h-4" />}
              {secondaryAction.label}
            </button>
          )}
          {primaryAction && (
            <button 
              onClick={primaryAction.onClick}
              className="px-4 py-2 bg-dle-blue text-white rounded-lg text-sm font-medium hover:bg-dle-blue-deep transition-colors shadow-sm flex items-center gap-2"
            >
              {primaryAction.icon && <primaryAction.icon className="w-4 h-4" />}
              {primaryAction.label}
            </button>
          )}
        </div>
      </div>

      {children}
    </div>
  );
}
