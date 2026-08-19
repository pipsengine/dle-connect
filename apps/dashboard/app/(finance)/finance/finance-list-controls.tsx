'use client';

import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import type { PaymentRequestRow } from '@/lib/finance-intelligence/payment-requests-service';

export const FINANCE_PAGE_SIZE = 10;
export const FINANCE_PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

export const matchesPaymentSearch = (row: PaymentRequestRow, query: string) => {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    row.requestNumber,
    row.beneficiaryName,
    row.beneficiaryCode,
    row.description,
    row.title,
    row.purpose,
    row.paymentType,
    row.projectCode,
    row.department,
    row.status,
    row.currentStage,
    row.currentApproverName,
    row.currentApproverCode,
    row.requesterName,
    row.requesterCode,
    row.invoiceNumber,
    row.purchaseOrderNo,
    row.deliveryNoteNo,
    row.grnNo,
    row.paymentSiteCode,
    row.paymentSiteName,
    row.location,
    row.expenseCode,
    row.currencyCode,
    row.companyCode,
    row.netAmount,
    row.grossAmount,
  ].join(' ').toLowerCase();
  return haystack.includes(q);
};

export const paginateRows = <T,>(rows: T[], page: number, pageSize: number) => {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    pageRows: rows.slice(start, start + pageSize),
    totalPages,
    safePage,
    start: rows.length ? start + 1 : 0,
    end: Math.min(start + pageSize, rows.length),
  };
};

export function FinanceListSearch({
  value,
  onChange,
  placeholder = 'Search request no., vendor, description…',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative min-w-0 w-full md:ml-auto md:max-w-xs">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-9 w-full min-w-0 rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-xs outline-none focus:bg-white focus:ring-2 focus:ring-[#DBEAFE]"
      />
    </div>
  );
}

export function FinanceListPagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  noun = 'payments',
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  noun?: string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = total ? (safePage - 1) * pageSize + 1 : 0;
  const end = Math.min(safePage * pageSize, total);

  const pageButtons = () => {
    if (totalPages <= 5) return Array.from({ length: totalPages }, (_, index) => index + 1);
    if (safePage <= 3) return [1, 2, 3, 4, 5];
    if (safePage >= totalPages - 2) return [totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    return [safePage - 2, safePage - 1, safePage, safePage + 1, safePage + 2];
  };

  return (
    <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs font-medium text-slate-500">
        Showing {start}–{end} of {total} {noun}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {onPageSizeChange ? (
          <label className="inline-flex items-center gap-1.5 text-xs text-slate-500">
            <span>Rows</span>
            <select
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700"
            >
              {FINANCE_PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </label>
        ) : null}
        <button
          type="button"
          disabled={safePage <= 1}
          onClick={() => onPageChange(safePage - 1)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 disabled:opacity-40"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {pageButtons().map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onPageChange(item)}
            className={`inline-flex h-8 min-w-[32px] cursor-pointer items-center justify-center rounded-lg px-2 text-xs font-semibold ${
              item === safePage ? 'bg-[#008FD5] text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-[#EAF6FF]'
            }`}
          >
            {item}
          </button>
        ))}
        <button
          type="button"
          disabled={safePage >= totalPages}
          onClick={() => onPageChange(safePage + 1)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 disabled:opacity-40"
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
