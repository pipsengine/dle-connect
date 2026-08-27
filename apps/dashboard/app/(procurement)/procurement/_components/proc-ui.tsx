'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Download, X } from 'lucide-react';

export const inputClass =
  'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100';

export const selectClass =
  'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';

export const labelClass = 'mb-1 block text-xs font-semibold text-slate-600';

export const primaryBtnClass =
  'inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60';

export const secondaryBtnClass =
  'inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60';

export function formatWhen(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function moneyPlain(n: number | null | undefined, currency = 'NGN') {
  const amount = Number(n) || 0;
  const formatted = amount.toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${currency} ${formatted}`;
}

function statusTone(status: string): string {
  const s = status.toLowerCase();
  if (s.includes('blacklist')) return 'bg-red-100 text-red-800';
  if (s.includes('reject') || s.includes('cancel') || s === 'inactive') return 'bg-red-50 text-red-700';
  if (s.includes('return')) return 'bg-orange-50 text-orange-800';
  if (s.includes('pending') || s.includes('submitted') || s.includes('under review') || s.includes('negotiation') || s.includes('recommendation')) {
    return 'bg-amber-50 text-amber-800';
  }
  if (s.includes('approved') || s.includes('issued') || s.includes('open') || s.includes('completed') || s.includes('award') || s === 'active') {
    return 'bg-emerald-50 text-emerald-800';
  }
  if (s.includes('draft')) return 'bg-slate-100 text-slate-700';
  if (s.includes('bid comparison') || s.includes('technical') || s.includes('commercial') || s.includes('evaluation') || s.includes('in progress')) {
    return 'bg-blue-50 text-blue-800';
  }
  return 'bg-slate-100 text-slate-700';
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${statusTone(status)}`}>
      {status || '—'}
    </span>
  );
}

export function AvatarInitials({ name, size = 'md' }: { name: string | null | undefined; size?: 'sm' | 'md' }) {
  const label = (name || '?').trim();
  const parts = label.split(/\s+/).filter(Boolean);
  const initials = (parts.length >= 2 ? `${parts[0]![0]}${parts[1]![0]}` : label.slice(0, 2)).toUpperCase();
  const sizeClass = size === 'sm' ? 'h-7 w-7 text-[10px]' : 'h-8 w-8 text-xs';
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-800 ${sizeClass}`}>
      {initials}
    </span>
  );
}

export function PersonCell({ name }: { name: string | null | undefined }) {
  if (!name) return <span className="text-slate-400">—</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <AvatarInitials name={name} size="sm" />
      <span className="truncate font-medium text-slate-800">{name}</span>
    </span>
  );
}

export function KpiCard({
  label,
  value,
  href,
  icon,
  tint = 'bg-blue-50 text-blue-700',
}: {
  label: string;
  value: number | string;
  href?: string;
  icon?: ReactNode;
  tint?: string;
}) {
  const body = (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
        {icon ? <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${tint}`}>{icon}</span> : null}
      </div>
      <div className="mt-2 text-3xl font-black tabular-nums text-slate-900">{value}</div>
      {href ? <div className="mt-2 text-xs font-semibold text-blue-600">View all →</div> : null}
    </div>
  );
  return href ? (
    <Link href={href} className="block transition hover:border-blue-300">
      {body}
    </Link>
  ) : (
    body
  );
}

export function ProcModal({
  open,
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 sm:p-8">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close dialog" onClick={onClose} />
      <div
        className={`relative z-10 w-full rounded-xl border border-slate-200 bg-white shadow-xl ${wide ? 'max-w-3xl' : 'max-w-xl'}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-black text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}

export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">{children}</div>
  );
}

export function RegisterTable({
  title,
  count,
  onExport,
  children,
  actions,
}: {
  title: string;
  count: number;
  onExport?: () => void;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="text-sm font-black text-slate-900">
          {title} <span className="font-semibold text-slate-500">({count})</span>
        </div>
        <div className="flex items-center gap-2">
          {actions}
          {onExport ? (
            <button type="button" onClick={onExport} className={secondaryBtnClass}>
              <Download className="h-4 w-4" /> Export
            </button>
          ) : null}
        </div>
      </div>
      {children}
    </div>
  );
}

export function PaginationFooter({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(total, safePage * pageSize);

  const pages: number[] = [];
  const windowStart = Math.max(1, safePage - 2);
  const windowEnd = Math.min(totalPages, windowStart + 4);
  for (let i = windowStart; i <= windowEnd; i += 1) pages.push(i);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-600">
      <div>
        Showing <span className="font-semibold text-slate-800">{from}</span> to{' '}
        <span className="font-semibold text-slate-800">{to}</span> of{' '}
        <span className="font-semibold text-slate-800">{total}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={safePage <= 1}
          onClick={() => onPageChange(safePage - 1)}
          className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-semibold disabled:opacity-40"
        >
          Prev
        </button>
        {pages.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPageChange(p)}
            className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
              p === safePage ? 'bg-blue-600 text-white' : 'border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            {p}
          </button>
        ))}
        <button
          type="button"
          disabled={safePage >= totalPages}
          onClick={() => onPageChange(safePage + 1)}
          className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-semibold disabled:opacity-40"
        >
          Next
        </button>
        <select
          className="h-8 rounded-md border border-slate-200 px-2 text-xs"
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
        >
          {[10, 25, 50, 100].map((n) => (
            <option key={n} value={n}>
              {n} / page
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

export function exportCsv(filename: string, headers: string[], rows: Array<Array<string | number | null | undefined>>) {
  const escape = (v: string | number | null | undefined) => {
    const s = v == null ? '' : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  const lines = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function toDateInput(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toISOString().slice(0, 10);
}
