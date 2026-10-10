'use client';

import Link from 'next/link';
import { ArrowUpRight, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import type { ReactNode } from 'react';

export function TodayChip() {
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  return (
    <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 shadow-sm">
      <CalendarDays className="h-4 w-4 text-slate-400" />
      <span>
        <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Today</span>
        <span className="block text-[12px] font-bold text-slate-800">{today}</span>
      </span>
    </div>
  );
}

export function SplitButton({
  href,
  label,
  open,
  onToggle,
  children,
}: {
  href: string;
  label: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="relative">
      <div className="inline-flex h-11 overflow-hidden rounded-xl bg-[#2563eb] text-white shadow-sm">
        <Link href={href} className="inline-flex items-center gap-2 px-4 text-sm font-bold hover:bg-blue-700">
          <Plus className="h-4 w-4" /> {label}
        </Link>
        <button type="button" aria-label={`${label} menu`} onClick={onToggle} className="inline-flex w-9 items-center justify-center border-l border-white/20 hover:bg-blue-700">
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>
      {open ? <div className="absolute right-0 top-12 z-20 w-52 rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-lg">{children}</div> : null}
    </div>
  );
}

export function Delta({ value }: { value: number | null }) {
  if (value == null) return <span className="text-[11px] font-semibold text-emerald-600">New vs last month</span>;
  const up = value >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${up ? 'text-emerald-600' : 'text-rose-600'}`}>
      <ArrowUpRight className={`h-3 w-3 ${up ? '' : 'rotate-90'}`} />
      {value > 0 ? '+' : ''}{value}% vs last month
    </span>
  );
}

export function Pill({ children, className }: { children: ReactNode; className: string }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${className}`}>{children}</span>;
}

export function Pager({
  page,
  pageCount,
  pageSize,
  total,
  onPage,
  onPageSize,
}: {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}) {
  const from = total ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(total, page * pageSize);
  const pages = Array.from({ length: pageCount }, (_, index) => index + 1).slice(0, 6);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-[12px] text-slate-500">
      <span>Showing {from} to {to} of {total}</span>
      <div className="flex items-center gap-1">
        <button type="button" className="rounded-lg border border-slate-200 p-1.5 disabled:opacity-40" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft className="h-3.5 w-3.5" /></button>
        {pages.map((item) => (
          <button key={item} type="button" onClick={() => onPage(item)} className={`h-7 min-w-7 rounded-lg text-xs font-bold ${item === page ? 'bg-[#2563eb] text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{item}</button>
        ))}
        <button type="button" className="rounded-lg border border-slate-200 p-1.5 disabled:opacity-40" disabled={page >= pageCount} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight className="h-3.5 w-3.5" /></button>
        <select value={pageSize} onChange={(event) => onPageSize(Number(event.target.value))} className="ml-2 h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold" aria-label="Rows per page">
          {[10, 25, 50].map((size) => <option key={size} value={size}>{size} / page</option>)}
        </select>
      </div>
    </div>
  );
}

export function Donut({
  slices,
  center,
  caption,
}: {
  slices: Array<{ label: string; value: number; color: string }>;
  center: string;
  caption: string;
}) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 120 120" className="h-36 w-36 shrink-0">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="#e8eef5" strokeWidth="16" />
        {total > 0 ? slices.map((slice) => {
          const length = (slice.value / total) * circumference;
          const node = (
            <circle key={slice.label} cx="60" cy="60" r={radius} fill="none" stroke={slice.color} strokeWidth="16" strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-offset} transform="rotate(-90 60 60)" />
          );
          offset += length;
          return node;
        }) : null}
        <text x="60" y="56" textAnchor="middle" fontSize="13" fontWeight="800" fill="#0f172a">{center}</text>
        <text x="60" y="72" textAnchor="middle" fontSize="9" fill="#64748b">{caption}</text>
      </svg>
      <ul className="min-w-0 flex-1 space-y-1.5 text-[12px] text-slate-600">
        {slices.map((slice) => (
          <li key={slice.label} className="flex items-center justify-between gap-3">
            <span className="inline-flex min-w-0 items-center gap-1.5"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: slice.color }} /><span className="truncate">{slice.label}</span></span>
            <span className="shrink-0 font-semibold text-slate-700">{total ? Math.round((slice.value / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
