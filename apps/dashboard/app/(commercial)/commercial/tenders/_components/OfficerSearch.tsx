'use client';

import { useMemo, useState } from 'react';

export type DirectoryEmployee = {
  employeeId: string;
  fullName: string;
  jobTitle?: string;
  department?: string;
};

export function OfficerSearch({
  employees,
  employeeId,
  name,
  disabled,
  onSelect,
}: {
  employees: DirectoryEmployee[];
  employeeId: string;
  name: string;
  disabled?: boolean;
  onSelect: (employee: DirectoryEmployee | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const selected = employees.find((item) => item.employeeId === employeeId);
  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    const matches = text
      ? employees.filter((employee) => [employee.employeeId, employee.fullName, employee.jobTitle, employee.department].join(' ').toLowerCase().includes(text))
      : employees;
    return matches.slice(0, 12);
  }, [employees, query]);

  return (
    <div className="relative">
      <input
        value={open ? query : (selected?.fullName || name)}
        disabled={disabled}
        placeholder="Search by name, staff number, or job title"
        autoComplete="off"
        aria-label="Search responsible officer"
        aria-expanded={open}
        onFocus={() => { setQuery(''); setOpen(true); }}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          const match = filtered[0];
          if (!match) return;
          onSelect(match);
          setQuery('');
          setOpen(false);
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          if (!event.target.value) onSelect(null);
        }}
        className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-[13px] text-slate-800 disabled:bg-slate-50"
      />
      {open && !disabled ? (
        <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {filtered.length ? filtered.map((employee) => (
            <button
              key={employee.employeeId}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => { onSelect(employee); setQuery(''); setOpen(false); }}
              className="block w-full border-b border-slate-50 px-3 py-2 text-left last:border-0 hover:bg-slate-50"
            >
              <span className="block text-[13px] font-semibold text-slate-800">{employee.fullName}</span>
              <span className="block text-[11px] text-slate-500">{[employee.employeeId, employee.jobTitle, employee.department].filter(Boolean).join(' · ')}</span>
            </button>
          )) : <p className="px-3 py-3 text-[12px] text-slate-500">{employees.length ? 'No matching employees.' : 'The employee directory is not available.'}</p>}
        </div>
      ) : null}
    </div>
  );
}
