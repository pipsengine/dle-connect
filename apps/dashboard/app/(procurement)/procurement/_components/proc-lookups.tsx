'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Loader2, Search } from 'lucide-react';
import { procurementGet } from '../lib/procurement-api';
import { inputClass, labelClass } from './proc-ui';

export type LookupOption = {
  value: string;
  label: string;
  sub?: string;
};

export type EmployeeLookupRow = {
  employeeCode: string;
  fullName: string;
  department: string;
  location: string;
  email: string;
};

export type DepartmentLookupRow = {
  id: string;
  name: string;
  code: string;
  location: string;
};

export type LocationLookupRow = {
  id: string;
  name: string;
  code: string;
  region: string;
  recordType: string;
};

export function SearchableSelect({
  label,
  required,
  value,
  options,
  placeholder,
  onChange,
  disabled,
}: {
  label?: string;
  required?: boolean;
  value: string;
  options: LookupOption[];
  placeholder?: string;
  onChange: (value: string, option?: LookupOption) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = options.find((option) => option.value === value) || null;

  useEffect(() => {
    if (!open) setQuery(selected?.label || '');
  }, [open, selected?.label, value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || (selected && query === selected.label)) return options;
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(q)
        || option.value.toLowerCase().includes(q)
        || (option.sub || '').toLowerCase().includes(q),
    );
  }, [options, query, selected]);

  return (
    <label className="relative block text-sm">
      {label ? (
        <span className={labelClass}>
          {label}
          {required ? ' *' : ''}
        </span>
      ) : null}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        <input
          value={open ? query : selected?.label || ''}
          disabled={disabled}
          placeholder={placeholder || 'Search…'}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            if (!e.target.value) onChange('');
          }}
          onFocus={() => {
            setOpen(true);
            setQuery('');
          }}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          className={`${inputClass} pl-9 pr-9`}
          autoComplete="off"
          inputMode="search"
        />
        <ChevronDown
          className={`pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition ${open ? 'rotate-180' : ''}`}
        />
      </div>
      {open ? (
        <div className="absolute z-30 mt-1 max-h-52 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
          {filtered.length ? (
            filtered.map((option) => (
              <button
                key={option.value}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(option.value, option);
                  setQuery(option.label);
                  setOpen(false);
                }}
                className={`block w-full px-3 py-2.5 text-left text-sm hover:bg-slate-50 ${
                  option.value === value ? 'bg-blue-50 font-semibold text-blue-700' : 'text-slate-700'
                }`}
              >
                <div>{option.label}</div>
                {option.sub ? <div className="text-xs text-slate-500">{option.sub}</div> : null}
              </button>
            ))
          ) : (
            <p className="px-3 py-3 text-xs text-slate-500">No matches. Try another search.</p>
          )}
        </div>
      ) : null}
    </label>
  );
}

export function EmployeeLookup({
  label = 'Employee',
  value,
  onChange,
  required,
  placeholder = 'Search employees…',
}: {
  label?: string;
  value: string;
  onChange: (name: string, employee?: EmployeeLookupRow) => void;
  required?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value || '');
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<EmployeeLookupRow[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) setQuery(value || '');
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void (async () => {
        setLoading(true);
        try {
          const rows = await procurementGet<EmployeeLookupRow[]>('lookups', {
            kind: 'employees',
            q: query.trim(),
            limit: '25',
          });
          setOptions(rows);
        } catch {
          setOptions([]);
        } finally {
          setLoading(false);
        }
      })();
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [open, query]);

  return (
    <label className="relative block text-sm">
      <span className={labelClass}>
        {label}
        {required ? ' *' : ''}
      </span>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        <input
          value={open ? query : value || ''}
          placeholder={placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            if (!e.target.value) onChange('');
          }}
          onFocus={() => {
            setOpen(true);
            setQuery(value || '');
          }}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          className={`${inputClass} pl-9 pr-9`}
          autoComplete="off"
        />
        {loading ? (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />
        ) : (
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        )}
      </div>
      {open ? (
        <div className="absolute z-30 mt-1 max-h-52 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
          {options.length ? (
            options.map((emp) => (
              <button
                key={emp.employeeCode || emp.fullName}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(emp.fullName, emp);
                  setQuery(emp.fullName);
                  setOpen(false);
                }}
                className="block w-full px-3 py-2.5 text-left text-sm hover:bg-slate-50"
              >
                <div className="font-medium text-slate-800">{emp.fullName}</div>
                <div className="text-xs text-slate-500">
                  {[emp.employeeCode, emp.department].filter(Boolean).join(' · ')}
                </div>
              </button>
            ))
          ) : (
            <p className="px-3 py-3 text-xs text-slate-500">{loading ? 'Searching…' : 'No employees found.'}</p>
          )}
        </div>
      ) : null}
    </label>
  );
}

export function DepartmentLookup({
  label = 'Department',
  value,
  onChange,
  required,
}: {
  label?: string;
  value: string;
  onChange: (name: string) => void;
  required?: boolean;
}) {
  const [rows, setRows] = useState<DepartmentLookupRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const data = await procurementGet<DepartmentLookupRow[]>('lookups', { kind: 'departments' });
        if (active) {
          setRows(data);
          setLoaded(true);
        }
      } catch {
        if (active) setLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const options = useMemo<LookupOption[]>(
    () =>
      rows.map((d) => ({
        value: d.name,
        label: d.name,
        sub: [d.code, d.location].filter(Boolean).join(' · ') || undefined,
      })),
    [rows],
  );

  return (
    <SearchableSelect
      label={label}
      required={required}
      value={value}
      options={options}
      placeholder={loaded ? 'Search departments…' : 'Loading departments…'}
      onChange={(v) => onChange(v)}
      disabled={!loaded && !options.length}
    />
  );
}

export function LocationLookup({
  label = 'Location',
  value,
  onChange,
  required,
}: {
  label?: string;
  value: string;
  onChange: (name: string) => void;
  required?: boolean;
}) {
  const [rows, setRows] = useState<LocationLookupRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const data = await procurementGet<LocationLookupRow[]>('lookups', { kind: 'locations' });
        if (active) {
          setRows(data);
          setLoaded(true);
        }
      } catch {
        if (active) setLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const options = useMemo<LookupOption[]>(
    () =>
      rows.map((loc) => ({
        value: loc.name,
        label: loc.name,
        sub: [loc.code, loc.region, loc.recordType].filter(Boolean).join(' · ') || undefined,
      })),
    [rows],
  );

  return (
    <SearchableSelect
      label={label}
      required={required}
      value={value}
      options={options}
      placeholder={loaded ? 'Search locations…' : 'Loading locations…'}
      onChange={(v) => onChange(v)}
      disabled={!loaded && !options.length}
    />
  );
}
