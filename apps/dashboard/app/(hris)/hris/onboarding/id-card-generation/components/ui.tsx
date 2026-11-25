import type { ReactNode } from 'react';
import { initials, type Employee } from '../lib/employees';

export function Section({ step, title, icon, action, children, className = '' }: { step?: number; title: string; icon?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_3px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.08)] ${className}`}>
      <div className="flex items-center justify-between gap-3 px-6 pt-5 pb-4">
        <h2 className="flex items-center gap-3 text-lg font-bold text-slate-900">
          {step !== undefined && <span className="w-7 h-7 rounded-full bg-[#1c1b46] text-white text-sm font-semibold flex items-center justify-center shrink-0">{step}</span>}
          {icon}
          {title}
        </h2>
        {action}
      </div>
      <div className="px-6 pb-6">{children}</div>
    </section>
  );
}

const AVATAR_TONES = ['bg-indigo-100 text-indigo-700', 'bg-sky-100 text-sky-700', 'bg-violet-100 text-violet-700', 'bg-emerald-100 text-emerald-700', 'bg-amber-100 text-amber-700', 'bg-rose-100 text-rose-700'];

export function Avatar({ employee, size = 40 }: { employee: Employee; size?: number }) {
  const style = { width: size, height: size };
  if (employee.photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- HR system photo URL
    return <img src={employee.photoUrl} alt="" style={style} className="rounded-full object-cover shrink-0 ring-2 ring-white shadow-sm" />;
  }
  const tone = AVATAR_TONES[[...employee.id].reduce((n, ch) => n + ch.charCodeAt(0), 0) % AVATAR_TONES.length];
  return (
    <span style={style} className={`rounded-full text-sm font-semibold flex items-center justify-center shrink-0 ring-2 ring-white shadow-sm ${tone}`}>
      {initials(employee)}
    </span>
  );
}

export function Checkbox({ checked, indeterminate, onChange, label }: { checked: boolean; indeterminate?: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 ${
        checked || indeterminate ? 'bg-[#1c1b46] border-[#1c1b46] text-white' : 'bg-white border-slate-300 hover:border-slate-400'
      }`}
    >
      {indeterminate ? (
        <span className="w-2.5 h-0.5 bg-white rounded" />
      ) : checked ? (
        <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.5 6.2 5 8.5l4.5-5" />
        </svg>
      ) : null}
    </button>
  );
}
