'use client';

import type { EssRatingScaleOption } from '@/lib/ess-performance-workspace';

type EssPerformanceRatingScaleProps = {
  value: number | null | undefined;
  onChange: (value: number) => void;
  options: EssRatingScaleOption[];
  name: string;
  legend?: string;
  disabled?: boolean;
  required?: boolean;
};

export function EssPerformanceRatingScale({
  value,
  onChange,
  options,
  name,
  legend = 'Rating',
  disabled,
  required,
}: EssPerformanceRatingScaleProps) {
  const selected = options.find((option) => option.value === value);

  return (
    <fieldset className="min-w-0" disabled={disabled}>
      <legend className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">
        {legend}
        {required ? <span className="text-red-600"> *</span> : null}
      </legend>
      <div
        role="radiogroup"
        aria-label={legend}
        className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-5"
      >
        {options.map((option) => {
          const active = value === option.value;
          return (
            <label
              key={option.value}
              className={`flex min-h-11 cursor-pointer flex-col justify-center rounded-xl border px-2 py-2 text-center transition focus-within:ring-2 focus-within:ring-[#2563EB] focus-within:ring-offset-1 ${
                active
                  ? 'border-[#2563EB] bg-[#EFF6FF] text-[#1D4ED8]'
                  : 'border-[#E2E8F0] bg-white text-[#0F172A] hover:border-[#BFDBFE]'
              } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
            >
              <input
                type="radio"
                className="sr-only"
                name={name}
                value={option.value}
                checked={active}
                disabled={disabled}
                onChange={() => onChange(option.value)}
              />
              <span className="text-sm font-black">{option.value}</span>
              <span className="mt-0.5 text-[10px] font-semibold leading-tight">{option.label}</span>
            </label>
          );
        })}
      </div>
      {selected ? (
        <p className="mt-2 text-xs font-medium text-[#64748B]">{selected.anchor}</p>
      ) : (
        <p className="mt-2 text-xs font-medium text-[#94A3B8]">Select a rating from 1 (Unsatisfactory) to 5 (Outstanding).</p>
      )}
    </fieldset>
  );
}

export const clampPerformanceRating = (value: unknown): number | null => {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n < 1 || n > 5) return null;
  return Math.round(n);
};
