'use client';

import { useEffect, useState } from 'react';
import { searchVisitorEmployees } from '@/lib/security/visitor-client';
import type { DirectoryEmployee } from '@/lib/security/visitor-types';

export function EmployeeHostField({
  label = 'Person to Visit',
  value,
  department = '',
  required = false,
  onPick,
}: {
  label?: string;
  value: string;
  department?: string;
  required?: boolean;
  onPick: (employee: DirectoryEmployee | null, typed: string) => void;
}) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<DirectoryEmployee[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => setQuery(value), [value]);

  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) {
      setResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      searchVisitorEmployees(text, department).then(setResults).catch(() => setResults([]));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, department]);

  return (
    <div className="relative">
      <label className="text-xs font-medium text-slate-600 mb-1 flex items-center gap-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          onPick(null, event.target.value);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 160)}
        placeholder="Search employee name or code"
        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-300"
      />
      {open && results.length > 0 && (
        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden max-h-56 overflow-y-auto">
          {results.map((employee) => (
            <button
              key={employee.code}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setQuery(employee.name);
                setResults([]);
                setOpen(false);
                onPick(employee, employee.name);
              }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
            >
              <div className="font-medium text-slate-800">{employee.name}</div>
              <div className="text-[11px] text-slate-400">{employee.code} · {employee.department || 'No department'} · {employee.location || 'No location'}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
