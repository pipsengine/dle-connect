'use client';

import { useMemo, useState } from 'react';
import { X } from 'lucide-react';

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
  return (
    <OfficerMultiSearch
      employees={employees}
      selected={employeeId || name ? [{ employeeId, fullName: name }] : []}
      disabled={disabled}
      multiple={false}
      onChange={(next) => onSelect(next[0] || null)}
    />
  );
}

export function OfficerMultiSearch({
  employees,
  selected,
  disabled,
  multiple = true,
  onChange,
}: {
  employees: DirectoryEmployee[];
  selected: Array<{ employeeId: string; fullName: string }>;
  disabled?: boolean;
  multiple?: boolean;
  onChange: (employees: DirectoryEmployee[]) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const selectedIds = new Set(selected.map((item) => item.employeeId).filter(Boolean));
  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    const matches = text
      ? employees.filter((employee) => [employee.employeeId, employee.fullName, employee.jobTitle, employee.department].join(' ').toLowerCase().includes(text))
      : employees;
    return matches.filter((employee) => !selectedIds.has(employee.employeeId)).slice(0, 12);
  }, [employees, query, selectedIds]);

  const pick = (employee: DirectoryEmployee) => {
    if (multiple) {
      onChange([
        ...selected.map((item) => ({
          employeeId: item.employeeId,
          fullName: item.fullName,
          jobTitle: employees.find((row) => row.employeeId === item.employeeId)?.jobTitle,
          department: employees.find((row) => row.employeeId === item.employeeId)?.department,
        })),
        employee,
      ]);
    } else {
      onChange([employee]);
    }
    setQuery('');
    setOpen(false);
  };

  const remove = (employeeId: string, fullName: string) => {
    onChange(selected
      .filter((item) => !(item.employeeId === employeeId && item.fullName === fullName))
      .map((item) => ({
        employeeId: item.employeeId,
        fullName: item.fullName,
      })));
  };

  return (
    <div className="relative space-y-2">
      {selected.length ? (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((item) => (
            <span key={`${item.employeeId}-${item.fullName}`} className="inline-flex max-w-full items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[12px] font-semibold text-slate-700">
              <span className="truncate">{item.fullName || item.employeeId}</span>
              {!disabled ? (
                <button type="button" aria-label={`Remove ${item.fullName || item.employeeId}`} onClick={() => remove(item.employeeId, item.fullName)} className="rounded-full p-0.5 text-slate-400 hover:bg-white hover:text-slate-700">
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </span>
          ))}
        </div>
      ) : null}
      <input
        value={open || multiple || !selected.length ? query : (selected[0]?.fullName || '')}
        disabled={disabled}
        placeholder={multiple ? 'Search and add employees…' : 'Search by name, staff number, or job title'}
        autoComplete="off"
        aria-label={multiple ? 'Search employees to assign' : 'Search responsible officer'}
        aria-expanded={open}
        onFocus={() => { setQuery(''); setOpen(true); }}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          const match = filtered[0];
          if (!match) return;
          pick(match);
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          if (!multiple && !event.target.value) onChange([]);
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
              onClick={() => pick(employee)}
              className="block w-full border-b border-slate-50 px-3 py-2 text-left last:border-0 hover:bg-slate-50"
            >
              <span className="block text-[13px] font-semibold text-slate-800">{employee.fullName}</span>
              <span className="block text-[11px] text-slate-500">{[employee.employeeId, employee.jobTitle, employee.department].filter(Boolean).join(' · ')}</span>
            </button>
          )) : <p className="px-3 py-3 text-[12px] text-slate-500">{employees.length ? (selected.length ? 'No more matching employees.' : 'No matching employees.') : 'The employee directory is not available.'}</p>}
        </div>
      ) : null}
    </div>
  );
}
