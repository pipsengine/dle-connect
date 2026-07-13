'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, RefreshCcw } from 'lucide-react';

export type PaginationState = { page: number; pageSize: number; total: number };

export function SectionToolbar({
  title,
  loading,
  onRefresh,
  onExport,
  search,
  onSearchChange,
  action,
}: {
  title?: string;
  loading?: boolean;
  onRefresh?: () => void;
  onExport?: () => void;
  search?: string;
  onSearchChange?: (value: string) => void;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {title ? <h2 className="text-sm font-black text-slate-950">{title}</h2> : <div />}
      <div className="flex flex-wrap items-center gap-2">
        {onSearchChange ? (
          <input
            value={search || ''}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search..."
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        ) : null}
        {onRefresh ? (
          <button type="button" onClick={onRefresh} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh
          </button>
        ) : null}
        {onExport ? (
          <button type="button" onClick={onExport} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            <Download className="h-4 w-4" />Export CSV
          </button>
        ) : null}
        {action}
      </div>
    </div>
  );
}

export function PaginationBar({ pagination, onPageChange }: { pagination: PaginationState; onPageChange: (page: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.pageSize));
  return (
    <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
      <span>
        Page {pagination.page} of {totalPages} · {pagination.total} records
      </span>
      <div className="flex gap-2">
        <button type="button" disabled={pagination.page <= 1} onClick={() => onPageChange(pagination.page - 1)} className="rounded border border-slate-200 px-2 py-1 disabled:opacity-40">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button type="button" disabled={pagination.page >= totalPages} onClick={() => onPageChange(pagination.page + 1)} className="rounded border border-slate-200 px-2 py-1 disabled:opacity-40">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  if (!message) return null;
  return <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{message}</div>;
}

export type EmployeeOption = { employeeCode: string; fullName: string; department: string; location: string; email: string };

export function EmployeePicker({
  value,
  onSelect,
  placeholder = 'Search employee...',
}: {
  value?: EmployeeOption | null;
  onSelect: (employee: EmployeeOption | null) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState(value?.fullName || '');
  const [options, setOptions] = useState<EmployeeOption[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setQuery(value?.fullName || '');
  }, [value?.employeeCode, value?.fullName]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!open && !query.trim()) return;
      const response = await fetch(`/api/it-support/asset-management?section=employees&q=${encodeURIComponent(query)}&limit=12`, { cache: 'no-store' });
      const json = await response.json();
      if (json.status === 'success') setOptions(json.data.employees || []);
    }, 250);
    return () => clearTimeout(timer);
  }, [query, open]);

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); onSelect(null); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
      />
      {open && options.length ? (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {options.map((option) => (
            <button
              key={option.employeeCode}
              type="button"
              className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
              onClick={() => {
                onSelect(option);
                setQuery(option.fullName);
                setOpen(false);
              }}
            >
              <div className="font-medium text-slate-900">{option.fullName}</div>
              <div className="text-xs text-slate-500">{option.employeeCode} · {option.department}{option.email ? ` · ${option.email}` : ''}</div>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export const exportAssetSection = (section: string) => {
  window.open(`/api/it-support/asset-management?section=${encodeURIComponent(section)}&format=csv`, '_blank');
};
