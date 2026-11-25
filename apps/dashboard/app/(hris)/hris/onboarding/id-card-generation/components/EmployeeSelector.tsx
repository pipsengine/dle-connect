"use client";

import { Search, Users, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { fullName, type Employee } from '../lib/employees';
import { Avatar, Checkbox, Section } from './ui';

export function EmployeeSelector({ employees, selected, onChange }: { employees: Employee[] | null; selected: string[]; onChange: (ids: string[]) => void }) {
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState('All');

  const departments = useMemo(() => ['All', ...Array.from(new Set((employees ?? []).map((e) => e.department))).sort()], [employees]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (employees ?? []).filter(
      (e) => (department === 'All' || e.department === department) && (!q || [e.id, fullName(e), e.department, e.jobTitle].some((v) => v.toLowerCase().includes(q)))
    );
  }, [employees, query, department]);

  const selectedSet = new Set(selected);
  const visibleSelected = filtered.filter((e) => selectedSet.has(e.id)).length;
  const allVisible = filtered.length > 0 && visibleSelected === filtered.length;

  const toggle = (id: string) => onChange(selectedSet.has(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const toggleAll = () =>
    onChange(allVisible ? selected.filter((id) => !filtered.some((e) => e.id === id)) : [...selected, ...filtered.map((e) => e.id).filter((id) => !selectedSet.has(id))]);

  return (
    <Section
      step={1}
      title="Select Employees"
      action={
        selected.length > 0 && (
          <span className="px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-sm font-semibold ring-1 ring-inset ring-indigo-100">{selected.length} selected</span>
        )
      }
    >
      <div className="flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            className="w-full pl-10 pr-9 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50/60 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-50 focus:border-indigo-300 transition"
            placeholder="Search name, ID or department…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100" onClick={() => setQuery('')} aria-label="Clear search">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <select
          aria-label="Filter by department"
          className="sm:w-48 px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50/60 text-slate-700 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-50 focus:border-indigo-300 transition"
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
        >
          {departments.map((d) => (
            <option key={d} value={d}>
              {d === 'All' ? 'All departments' : d}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 overflow-hidden">
        <div className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,13rem)] max-sm:grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <Checkbox checked={allVisible} indeterminate={visibleSelected > 0 && !allVisible} onChange={toggleAll} label="Select all" />
          <span className="normal-case text-sm tracking-normal text-slate-700">
            Select All <span className="font-normal text-slate-400">({filtered.length})</span>
          </span>
          <span className="max-sm:hidden pl-4">Role / Department</span>
        </div>

        <ul className="max-h-[340px] overflow-y-auto divide-y divide-slate-100" role="listbox" aria-multiselectable="true" aria-label="Employees">
          {!employees &&
            Array.from({ length: 4 }).map((_, i) => (
              <li key={i} className="flex items-center gap-4 px-4 py-3 animate-pulse">
                <span className="w-5 h-5 rounded-md bg-slate-100" />
                <span className="w-10 h-10 rounded-full bg-slate-100" />
                <span className="flex-1 space-y-1.5">
                  <span className="block h-3 w-1/3 rounded bg-slate-100" />
                  <span className="block h-2.5 w-1/5 rounded bg-slate-100" />
                </span>
              </li>
            ))}
          {employees && filtered.length === 0 && (
            <li className="px-4 py-10 text-center text-sm text-slate-500">
              No employees match your search.
              <button
                className="block mx-auto mt-1 text-indigo-600 font-medium hover:underline"
                onClick={() => {
                  setQuery('');
                  setDepartment('All');
                }}
              >
                Clear filters
              </button>
            </li>
          )}
          {filtered.map((e) => {
            const on = selectedSet.has(e.id);
            return (
              <li
                key={e.id}
                role="option"
                aria-selected={on}
                onClick={() => toggle(e.id)}
                className={`grid grid-cols-[auto_minmax(0,1fr)_minmax(0,13rem)] max-sm:grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 px-4 py-3 cursor-pointer select-none transition-colors ${
                  on ? 'bg-indigo-50/70 hover:bg-indigo-50' : 'hover:bg-slate-50'
                }`}
              >
                <Checkbox checked={on} onChange={() => toggle(e.id)} label={`Select ${fullName(e)}`} />
                <span className="flex items-center gap-3 min-w-0">
                  <Avatar employee={e} />
                  <span className="min-w-0">
                    <span className="block font-semibold text-slate-900 truncate">{fullName(e)}</span>
                    <span className="block text-sm text-slate-500 tabular-nums">
                      {e.id}
                      {e.lastIssuedAt ? <span className="text-emerald-700"> · Card on file</span> : null}
                    </span>
                  </span>
                </span>
                <span className="max-sm:hidden min-w-0 border-l border-slate-200 pl-4">
                  <span className="block text-sm font-medium text-slate-700 truncate" title={e.jobTitle}>
                    {e.jobTitle}
                  </span>
                  <span className="block text-sm text-slate-500 truncate" title={e.department}>
                    {e.department}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <div
        className={`grid transition-all duration-200 ${selected.length ? 'grid-rows-[1fr] opacity-100 mt-3' : 'grid-rows-[0fr] opacity-0'}`}
        aria-hidden={!selected.length}
      >
        <div className="overflow-hidden">
          <div className="flex items-center justify-between rounded-xl bg-indigo-50 px-4 py-3 ring-1 ring-inset ring-indigo-100">
            <span className="flex items-center gap-2.5 text-sm font-semibold text-slate-800">
              <Users className="w-5 h-5 text-indigo-600" />
              {selected.length} employee{selected.length === 1 ? '' : 's'} selected
            </span>
            <button className="text-sm font-semibold text-indigo-600 hover:text-indigo-800" onClick={() => onChange([])} tabIndex={selected.length ? 0 : -1}>
              Clear All
            </button>
          </div>
        </div>
      </div>
    </Section>
  );
}
