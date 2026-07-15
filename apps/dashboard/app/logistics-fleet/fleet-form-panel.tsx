'use client';

import { useMemo, useState, type ReactNode } from 'react';

export type EmployeeOption = {
  employeeCode: string;
  fullName: string;
  department: string;
  location?: string;
  jobTitle?: string;
  status?: string;
  managerName?: string;
  phone?: string;
  isDirectoryDriver?: boolean;
};

type FieldProps = {
  label: string;
  children: ReactNode;
  hint?: string;
  required?: boolean;
  error?: string;
};

export function Field({ label, children, hint, required, error }: FieldProps) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">
        {label}
        {required ? <span className="ml-1 text-red-600" aria-hidden>*</span> : null}
      </span>
      {children}
      {error ? <span className="block text-[11px] font-semibold text-red-600">{error}</span> : null}
      {!error && hint ? <span className="block text-[11px] font-semibold text-slate-400">{hint}</span> : null}
    </label>
  );
}

const inputClass =
  'h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none ring-blue-500/30 placeholder:text-slate-400 focus:border-blue-500 focus:ring-4';

const inputErrorClass = 'border-red-400 focus:border-red-500 focus:ring-red-500/20';

export function TextInput({ invalid, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input {...props} className={`${inputClass} ${invalid ? inputErrorClass : ''} ${props.className || ''}`} aria-invalid={invalid || undefined} />;
}

export function TextSelect({ invalid, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return <select {...props} className={`${inputClass} ${invalid ? inputErrorClass : ''} ${props.className || ''}`} aria-invalid={invalid || undefined} />;
}

export function TextTextArea({ invalid, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return <textarea {...props} className={`min-h-[88px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none ring-blue-500/30 focus:border-blue-500 focus:ring-4 ${invalid ? inputErrorClass : ''} ${props.className || ''}`} aria-invalid={invalid || undefined} />;
}

export function EmployeePicker({
  label,
  value,
  onChange,
  employees,
  hint,
  required,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  employees: EmployeeOption[];
  hint?: string;
  required?: boolean;
  error?: string;
}) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return employees.slice(0, 40);
    return employees
      .filter((employee) =>
        [employee.employeeCode, employee.fullName, employee.department, employee.jobTitle]
          .join(' ')
          .toLowerCase()
          .includes(q),
      )
      .slice(0, 40);
  }, [employees, query]);

  const selected = employees.find((employee) => employee.employeeCode === value);

  return (
    <Field
      label={label}
      required={required}
      error={error}
      hint={hint || (selected ? `${selected.fullName} · ${selected.department || 'No department'}` : 'Search the employee directory')}
    >
      <TextInput
        invalid={Boolean(error)}
        value={query || (selected ? `${selected.employeeCode} — ${selected.fullName}` : '')}
        onChange={(event) => {
          setQuery(event.target.value);
          if (!event.target.value) onChange('');
        }}
        placeholder="Search employee code or name"
      />
      {query ? (
        <div className="mt-2 max-h-44 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50">
          {filtered.length ? filtered.map((employee) => (
            <button
              key={employee.employeeCode}
              type="button"
              onClick={() => {
                onChange(employee.employeeCode);
                setQuery('');
              }}
              className="flex w-full flex-col gap-0.5 border-b border-slate-100 px-3 py-2 text-left last:border-0 hover:bg-white"
            >
              <span className="text-sm font-black text-slate-900">{employee.fullName}</span>
              <span className="text-[11px] font-semibold text-slate-500">{employee.employeeCode} · {employee.department || '—'} · {employee.jobTitle || '—'}</span>
            </button>
          )) : (
            <p className="px-3 py-3 text-xs font-semibold text-slate-500">No matching employees.</p>
          )}
        </div>
      ) : null}
    </Field>
  );
}

export function FormPanel({
  title,
  description,
  open,
  onClose,
  onSave,
  saving,
  children,
  formError,
  saveLabel = 'Save',
}: {
  title: string;
  description?: string;
  open: boolean;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
  children: ReactNode;
  formError?: string;
  saveLabel?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-3 sm:items-center">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="sticky top-0 flex items-start justify-between gap-4 border-b border-slate-100 bg-white px-5 py-4">
          <div>
            <h3 className="text-lg font-black text-slate-950">{title}</h3>
            {description ? <p className="mt-1 text-sm font-semibold text-slate-500">{description}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-sm font-bold text-slate-500 hover:bg-slate-100">Close</button>
        </div>
        {formError ? (
          <div className="mx-5 mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {formError}
          </div>
        ) : null}
        <div className="grid gap-4 px-5 py-5 sm:grid-cols-2">{children}</div>
        <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-slate-100 bg-white px-5 py-4">
          <button type="button" onClick={onClose} className="h-10 rounded-xl px-4 text-sm font-bold text-slate-600 hover:bg-slate-100">Cancel</button>
          <button
            type="button"
            disabled={saving}
            onClick={onSave}
            className="h-10 rounded-xl bg-slate-950 px-4 text-sm font-black text-white disabled:opacity-60"
          >
            {saving ? 'Saving…' : saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ActionChip({
  label,
  onClick,
  disabled,
  tone = 'slate',
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'slate' | 'emerald' | 'amber' | 'red' | 'blue';
}) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700 hover:bg-slate-200',
    emerald: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200',
    amber: 'bg-amber-100 text-amber-800 hover:bg-amber-200',
    red: 'bg-red-100 text-red-800 hover:bg-red-200',
    blue: 'bg-blue-100 text-blue-800 hover:bg-blue-200',
  };
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg px-2.5 py-1 text-[11px] font-black disabled:opacity-50 ${tones[tone]}`}
    >
      {label}
    </button>
  );
}
