'use client';

import { useEffect, useMemo, useRef, useState, type Ref } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowUp, ChevronDown, Search } from 'lucide-react';
import type { PaymentRequestRow } from '@/lib/finance-intelligence/payment-requests-service';

export type PaymentColumnKey =
  | 'requestNumber'
  | 'paymentType'
  | 'beneficiary'
  | 'description'
  | 'grossAmount'
  | 'netAmount'
  | 'amountNgn'
  | 'currency'
  | 'department'
  | 'project'
  | 'submitted'
  | 'currentStage'
  | 'approver'
  | 'status';

export type SortDir = 'asc' | 'desc';

export type HeaderFilterState = {
  selected?: string[] | null;
  min?: string;
  max?: string;
};

export type HeaderFilters = Partial<Record<PaymentColumnKey, HeaderFilterState>>;

export const NUMERIC_COLUMNS: PaymentColumnKey[] = ['grossAmount', 'netAmount', 'amountNgn'];
export const DATE_COLUMNS: PaymentColumnKey[] = ['submitted'];

export const PAYMENT_COLUMN_LABELS: Record<PaymentColumnKey, string> = {
  requestNumber: 'Request No.',
  paymentType: 'Payment Type',
  beneficiary: 'Beneficiary',
  description: 'Description',
  grossAmount: 'Gross Amount',
  netAmount: 'Net Amount',
  amountNgn: 'Amount (NGN)',
  currency: 'Currency',
  department: 'Department',
  project: 'Project',
  submitted: 'Submitted',
  currentStage: 'Current Stage',
  approver: 'Approver',
  status: 'Status',
};

const BLANK = '(Blank)';

export const isNumericColumn = (column: PaymentColumnKey) => NUMERIC_COLUMNS.includes(column);
export const isDateColumn = (column: PaymentColumnKey) => DATE_COLUMNS.includes(column);

export const rowAmountNgnValue = (row: PaymentRequestRow) => {
  const fromPayload = Number(row.payload?.amountNgn);
  if (Number.isFinite(fromPayload) && fromPayload > 0) return fromPayload;
  return Number(row.netAmount || 0);
};

export const columnText = (row: PaymentRequestRow, column: PaymentColumnKey) => {
  switch (column) {
    case 'requestNumber':
      return String(row.requestNumber || '').trim();
    case 'paymentType':
      return String(row.paymentType || '').trim();
    case 'beneficiary':
      return String(row.beneficiaryName || '').trim();
    case 'description':
      return String(row.description || row.title || '').trim();
    case 'currency':
      return String(row.currencyCode || '').trim();
    case 'department':
      return String(row.department || '').trim();
    case 'project':
      return String(row.projectCode || '').trim();
    case 'currentStage':
      return String(row.currentStage || '').trim();
    case 'approver':
      return String(row.currentApproverName || row.currentApproverCode || '').trim();
    case 'status':
      return String(row.status || '').trim();
    default:
      return '';
  }
};

export const columnNumber = (row: PaymentRequestRow, column: PaymentColumnKey) => {
  if (column === 'grossAmount') return Number(row.grossAmount || 0);
  if (column === 'netAmount') return Number(row.netAmount || 0);
  if (column === 'amountNgn') return rowAmountNgnValue(row);
  return 0;
};

export const columnTime = (row: PaymentRequestRow) => {
  const stamp = Date.parse(String(row.submittedAt || row.createdAt || ''));
  return Number.isFinite(stamp) ? stamp : 0;
};

export const uniqueColumnValues = (rows: PaymentRequestRow[], column: PaymentColumnKey) => {
  const values = new Set<string>();
  for (const row of rows) {
    values.add(columnText(row, column) || BLANK);
  }
  return Array.from(values).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
};

export const isHeaderFilterActive = (filter?: HeaderFilterState | null) => {
  if (!filter) return false;
  if (filter.selected) return true;
  if (String(filter.min || '').trim() || String(filter.max || '').trim()) return true;
  return false;
};

export const matchesHeaderFilters = (row: PaymentRequestRow, filters: HeaderFilters) => {
  for (const [key, filter] of Object.entries(filters) as Array<[PaymentColumnKey, HeaderFilterState | undefined]>) {
    if (!filter || !isHeaderFilterActive(filter)) continue;
    if (isNumericColumn(key)) {
      const value = columnNumber(row, key);
      const min = String(filter.min || '').trim() === '' ? null : Number(filter.min);
      const max = String(filter.max || '').trim() === '' ? null : Number(filter.max);
      if (min != null && Number.isFinite(min) && value < min) return false;
      if (max != null && Number.isFinite(max) && value > max) return false;
      continue;
    }
    if (isDateColumn(key)) {
      const stamp = row.submittedAt || row.createdAt;
      if (!stamp) return false;
      const submittedDay = new Date(stamp);
      if (Number.isNaN(submittedDay.getTime())) return false;
      const localDay = [
        submittedDay.getFullYear(),
        String(submittedDay.getMonth() + 1).padStart(2, '0'),
        String(submittedDay.getDate()).padStart(2, '0'),
      ].join('-');
      const min = String(filter.min || '').trim();
      const max = String(filter.max || '').trim();
      if (min && localDay < min) return false;
      if (max && localDay > max) return false;
      continue;
    }
    if (filter.selected) {
      if (!filter.selected.length || filter.selected[0] === '__none__') return false;
      const value = columnText(row, key) || BLANK;
      if (!filter.selected.includes(value)) return false;
    }
  }
  return true;
};

export const comparePaymentColumn = (
  a: PaymentRequestRow,
  b: PaymentRequestRow,
  column: PaymentColumnKey,
  dir: SortDir,
) => {
  const factor = dir === 'asc' ? 1 : -1;
  if (isNumericColumn(column)) {
    return (columnNumber(a, column) - columnNumber(b, column)) * factor;
  }
  if (isDateColumn(column)) {
    return (columnTime(a) - columnTime(b)) * factor;
  }
  return columnText(a, column).localeCompare(columnText(b, column), undefined, { numeric: true, sensitivity: 'base' }) * factor;
};

type PaymentColumnHeaderProps = {
  label: string;
  column: PaymentColumnKey;
  sortKey: PaymentColumnKey | null;
  sortDir: SortDir;
  onSort: (column: PaymentColumnKey) => void;
  filter: HeaderFilterState | undefined;
  options: string[];
  onFilterChange: (column: PaymentColumnKey, next: HeaderFilterState | undefined) => void;
  onSortDir: (column: PaymentColumnKey, dir: SortDir) => void;
  align?: 'left' | 'right';
};

export function PaymentColumnHeader({
  label,
  column,
  sortKey,
  sortDir,
  onSort,
  filter,
  options,
  onFilterChange,
  onSortDir,
  align = 'left',
}: PaymentColumnHeaderProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const active = sortKey === column;
  const filtered = isHeaderFilterActive(filter);

  const placeMenu = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = 280;
    const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - width - 8));
    const top = Math.min(rect.bottom + 4, window.innerHeight - 24);
    setCoords({ top, left });
  };

  useEffect(() => {
    if (!open) return;
    placeMenu();
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onReposition = () => placeMenu();
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [open]);

  return (
    <>
      <div className={`flex min-w-0 items-center gap-0.5 ${align === 'right' ? 'justify-end' : 'justify-start'}`}>
        <button
          type="button"
          onClick={() => onSort(column)}
          title={`Sort by ${label}`}
          className={`inline-flex max-w-full items-center gap-1 rounded px-0.5 py-0.5 text-left font-semibold hover:text-slate-800 ${
            active ? 'text-[#0369A1]' : 'text-slate-500'
          }`}
        >
          <span className="truncate">{label}</span>
          {active ? (sortDir === 'asc' ? <ArrowUp className="h-3 w-3 shrink-0" /> : <ArrowDown className="h-3 w-3 shrink-0" />) : null}
        </button>
        <button
          ref={buttonRef}
          type="button"
          title={`Filter ${label}`}
          onClick={(event) => {
            event.stopPropagation();
            setOpen((value) => !value);
          }}
          className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded ${
            filtered || open ? 'bg-[#EAF6FF] text-[#0369A1]' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
          }`}
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>
      {open && typeof document !== 'undefined'
        ? createPortal(
            <ColumnFilterMenu
              menuRef={menuRef}
              column={column}
              label={label}
              coords={coords}
              options={options}
              filter={filter}
              onFilterChange={(next) => onFilterChange(column, next)}
              onSort={(dir) => {
                onSortDir(column, dir);
                setOpen(false);
              }}
              sortDir={active ? sortDir : null}
              onClose={() => setOpen(false)}
            />,
            document.body,
          )
        : null}
    </>
  );
}

type MenuProps = {
  menuRef: Ref<HTMLDivElement>;
  column: PaymentColumnKey;
  label: string;
  coords: { top: number; left: number };
  options: string[];
  filter: HeaderFilterState | undefined;
  onFilterChange: (next: HeaderFilterState | undefined) => void;
  onSort: (dir: SortDir) => void;
  sortDir: SortDir | null;
  onClose: () => void;
};

const ColumnFilterMenu = ({
  menuRef,
  column,
  label,
  coords,
  options,
  filter,
  onFilterChange,
  onSort,
  sortDir,
  onClose,
}: MenuProps) => {
  const [query, setQuery] = useState('');
  const numeric = isNumericColumn(column);
  const date = isDateColumn(column);
  const selected = filter?.selected || null;

  const visibleOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((option) => option.toLowerCase().includes(q));
  }, [options, query]);

  const toggleValue = (value: string) => {
    const current = !selected || selected[0] === '__none__' ? [] : selected;
    const next = current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value];
    if (next.length === 0) {
      onFilterChange({ ...filter, selected: ['__none__'] });
      return;
    }
    if (next.length === options.length) {
      const rest = numeric || date ? { min: filter?.min, max: filter?.max } : undefined;
      onFilterChange(rest && (rest.min || rest.max) ? rest : undefined);
      return;
    }
    onFilterChange({ ...filter, selected: next });
  };

  return (
    <div
      ref={menuRef}
      style={{ top: coords.top, left: coords.left }}
      className="fixed z-[80] w-[280px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="border-b border-slate-100 px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">{label}</p>
        <div className="mt-1.5 grid grid-cols-2 gap-1">
          <button
            type="button"
            onClick={() => onSort('asc')}
            className={`rounded-lg border px-2 py-1 text-[11px] font-semibold ${
              sortDir === 'asc' ? 'border-[#93C5FD] bg-[#EAF6FF] text-[#0369A1]' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {numeric || date ? 'Low → High' : 'A → Z'}
          </button>
          <button
            type="button"
            onClick={() => onSort('desc')}
            className={`rounded-lg border px-2 py-1 text-[11px] font-semibold ${
              sortDir === 'desc' ? 'border-[#93C5FD] bg-[#EAF6FF] text-[#0369A1]' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {numeric || date ? 'High → Low' : 'Z → A'}
          </button>
        </div>
      </div>

      {numeric || date ? (
        <div className="grid grid-cols-2 gap-2 border-b border-slate-100 px-3 py-2">
          <label className="text-[10px] font-semibold text-slate-500">
            {date ? 'From' : 'Min'}
            <input
              type={date ? 'date' : 'number'}
              value={filter?.min || ''}
              onChange={(event) => onFilterChange({ ...filter, min: event.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-[#DBEAFE]"
            />
          </label>
          <label className="text-[10px] font-semibold text-slate-500">
            {date ? 'To' : 'Max'}
            <input
              type={date ? 'date' : 'number'}
              value={filter?.max || ''}
              onChange={(event) => onFilterChange({ ...filter, max: event.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-[#DBEAFE]"
            />
          </label>
        </div>
      ) : (
        <>
          <div className="relative border-b border-slate-100 px-3 py-2">
            <Search className="pointer-events-none absolute left-5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search values…"
              className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 py-1 pl-7 pr-2 text-xs outline-none focus:bg-white focus:ring-2 focus:ring-[#DBEAFE]"
            />
          </div>
          <div className="flex items-center justify-between px-3 py-1.5 text-[11px]">
            <button
              type="button"
              onClick={() => onFilterChange(undefined)}
              className="font-semibold text-[#008FD5] hover:underline"
            >
              Select all
            </button>
            <button
              type="button"
              onClick={() => onFilterChange({ selected: ['__none__'] })}
              className="font-semibold text-slate-500 hover:underline"
            >
              Clear
            </button>
          </div>
          <div className="max-h-56 overflow-y-auto px-2 pb-2">
            {visibleOptions.length ? visibleOptions.map((option) => {
              const checked = !selected || selected.includes(option);
              return (
                <label key={option} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={checked && selected?.[0] !== '__none__'}
                    onChange={() => toggleValue(option)}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-[#008FD5]"
                  />
                  <span className="truncate text-xs text-slate-700">{option}</span>
                </label>
              );
            }) : (
              <p className="px-2 py-3 text-xs text-slate-400">No matching values</p>
            )}
          </div>
        </>
      )}

      <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-3 py-2">
        <button
          type="button"
          onClick={() => {
            onFilterChange(undefined);
            onClose();
          }}
          className="rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-500 hover:bg-white"
        >
          Reset
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg bg-[#008FD5] px-2.5 py-1 text-[11px] font-semibold text-white"
        >
          Done
        </button>
      </div>
    </div>
  );
};
