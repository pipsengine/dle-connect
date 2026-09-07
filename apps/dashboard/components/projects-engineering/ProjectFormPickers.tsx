'use client';

import { useEffect, useId, useRef, useState } from 'react';

export type PmEmployeeOption = {
  employeeCode: string;
  employeeId?: string;
  fullName: string;
  department?: string;
  jobTitle?: string;
  location?: string;
  email?: string;
  username?: string;
};

export type PmLookupOption = {
  id: string;
  label: string;
};

type SearchSelectProps<T> = {
  valueLabel: string;
  placeholder: string;
  required?: boolean;
  disabled?: boolean;
  emptyHint?: string;
  fetchOptions: (query: string) => Promise<T[]>;
  getKey: (option: T) => string;
  getLabel: (option: T) => string;
  getMeta?: (option: T) => string;
  onPick: (option: T) => void;
  onClear?: () => void;
  onFreeText?: (value: string) => void;
  allowFreeText?: boolean;
};

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function SearchSelect<T>({
  valueLabel,
  placeholder,
  required,
  disabled,
  emptyHint = 'No matches in DLE_Enterprise',
  fetchOptions,
  getKey,
  getLabel,
  getMeta,
  onPick,
  onClear,
  onFreeText,
  allowFreeText = false,
}: SearchSelectProps<T>) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState(valueLabel || '');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<T[]>([]);
  const debouncedQuery = useDebouncedValue(query, 250);

  useEffect(() => {
    setQuery(valueLabel || '');
  }, [valueLabel]);

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  useEffect(() => {
    if (!open && !debouncedQuery.trim()) return;
    let active = true;
    setLoading(true);
    void fetchOptions(debouncedQuery)
      .then((rows) => {
        if (active) setOptions(rows);
      })
      .catch(() => {
        if (active) setOptions([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [debouncedQuery, open, fetchOptions]);

  return (
    <div className="pm-search-select" ref={rootRef}>
      <input
        value={query}
        required={required}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          const next = event.target.value;
          setQuery(next);
          setOpen(true);
          if (!next.trim()) onClear?.();
          if (allowFreeText) onFreeText?.(next);
          else if (next !== valueLabel) onClear?.();
        }}
      />
      {open ? (
        <div className="pm-search-menu" id={listId} role="listbox">
          {loading ? <div className="pm-search-empty">Searching DLE_Enterprise…</div> : null}
          {!loading && !options.length ? <div className="pm-search-empty">{emptyHint}</div> : null}
          {!loading
            ? options.map((option) => (
                <button
                  key={getKey(option)}
                  type="button"
                  role="option"
                  className="pm-search-option"
                  onClick={() => {
                    onPick(option);
                    setQuery(getLabel(option));
                    setOpen(false);
                  }}
                >
                  <b>{getLabel(option)}</b>
                  {getMeta ? <small>{getMeta(option)}</small> : null}
                </button>
              ))
            : null}
        </div>
      ) : null}
    </div>
  );
}

export function EmployeeSearchSelect({
  value,
  required,
  disabled,
  onSelect,
}: {
  value: PmEmployeeOption | null;
  required?: boolean;
  disabled?: boolean;
  onSelect: (employee: PmEmployeeOption | null) => void;
}) {
  return (
    <SearchSelect<PmEmployeeOption>
      valueLabel={value?.fullName || ''}
      placeholder="Search employee name or code…"
      required={required}
      disabled={disabled}
      emptyHint="No employees found in DLE_Enterprise"
      fetchOptions={async (query) => {
        const res = await fetch(
          `/api/projects-engineering/lookups?section=employees&q=${encodeURIComponent(query)}&limit=12`,
          { cache: 'no-store', credentials: 'same-origin' },
        );
        const json = await res.json();
        if (!res.ok || json.status !== 'success') return [];
        return (json.data?.employees || []) as PmEmployeeOption[];
      }}
      getKey={(option) => option.employeeCode || option.employeeId || option.fullName}
      getLabel={(option) => option.fullName}
      getMeta={(option) =>
        [option.employeeCode, option.jobTitle, option.department].filter(Boolean).join(' · ')}
      onPick={onSelect}
      onClear={() => onSelect(null)}
    />
  );
}

export function LookupSearchSelect({
  section,
  value,
  placeholder,
  required,
  allowFreeText = true,
  onChange,
}: {
  section: 'locations' | 'clients';
  value: string;
  placeholder: string;
  required?: boolean;
  allowFreeText?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <SearchSelect<PmLookupOption>
      valueLabel={value}
      placeholder={placeholder}
      required={required}
      allowFreeText={allowFreeText}
      emptyHint={`No ${section} found — type to enter a new value`}
      fetchOptions={async (query) => {
        const res = await fetch(
          `/api/projects-engineering/lookups?section=${section}&q=${encodeURIComponent(query)}&limit=20`,
          { cache: 'no-store', credentials: 'same-origin' },
        );
        const json = await res.json();
        if (!res.ok || json.status !== 'success') return [];
        const key = section === 'locations' ? 'locations' : 'clients';
        return (json.data?.[key] || []) as PmLookupOption[];
      }}
      getKey={(option) => option.id}
      getLabel={(option) => option.label}
      onPick={(option) => onChange(option.label)}
      onClear={() => onChange('')}
      onFreeText={onChange}
    />
  );
}
