'use client';

import { useEffect, useState, type ReactNode } from 'react';

const inputClass = 'w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm transition-colors focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100';

export type DirectoryEmployee = {
  code: string;
  name: string;
  department: string;
  title: string;
  location: string;
};

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </span>
      {children}
      {error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : null}
    </div>
  );
}

export function EmployeeSearch({
  label,
  required,
  error,
  selectedName,
  selectedCode,
  department,
  placeholder,
  disabled,
  onSelect,
  onClear,
}: {
  label: string;
  required?: boolean;
  error?: string;
  selectedName: string;
  selectedCode?: string;
  department?: string;
  placeholder: string;
  disabled?: boolean;
  onSelect: (person: DirectoryEmployee) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState(selectedName);
  const [matches, setMatches] = useState<DirectoryEmployee[]>([]);
  const [open, setOpen] = useState(false);
  const [settledQuery, setSettledQuery] = useState('');

  useEffect(() => setQuery(selectedName), [selectedName]);

  useEffect(() => {
    const text = query.trim();
    if (disabled || text.length < 2 || (selectedCode && text === selectedName)) {
      setMatches([]);
      setOpen(false);
      setSettledQuery('');
      return;
    }
    setOpen(true);
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ resource: 'employees', q: text });
      if (department) params.set('department', department);
      fetch(`/api/corporate-office/front-desk?${params.toString()}`, { credentials: 'same-origin', cache: 'no-store' })
        .then((response) => response.json())
        .then((json) => {
          setMatches(Array.isArray(json.data) ? json.data : []);
          setSettledQuery(text);
        })
        .catch(() => {
          setMatches([]);
          setSettledQuery(text);
        });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [department, disabled, query, selectedCode, selectedName]);

  return (
    <Field label={label} required={required} error={error}>
      <div className="relative">
      <input
        value={query}
        placeholder={placeholder}
        disabled={disabled}
        className={inputClass}
        onFocus={() => {
          if (query.trim().length >= 2 && !(selectedCode && query.trim() === selectedName)) setOpen(true);
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          if (!event.target.value.trim()) onClear();
        }}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 150);
          if (selectedCode) setQuery(selectedName);
        }}
      />
      {open ? (
        <ul className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {matches.length ? matches.map((person) => (
            <li key={person.code}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50"
                onMouseDown={(event) => {
                  event.preventDefault();
                  onSelect(person);
                  setQuery(person.name);
                  setMatches([]);
                  setOpen(false);
                }}
              >
                <span>{person.name}</span>
                <span className="text-xs text-slate-400">{person.code} · {person.department}</span>
              </button>
            </li>
          )) : settledQuery === query.trim() ? (
            <li className="px-3 py-2 text-sm text-slate-400">No matching employees</li>
          ) : (
            <li className="px-3 py-2 text-sm text-slate-400">Searching…</li>
          )}
        </ul>
      ) : null}
      </div>
    </Field>
  );
}
