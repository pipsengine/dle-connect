'use client';

import type { ComponentType, ReactNode } from 'react';
import { ChevronDown, ChevronRight, TrendingDown, TrendingUp } from 'lucide-react';

export type SetupTone = 'blue' | 'green' | 'amber' | 'red' | 'violet' | 'cyan' | 'slate';

export const setupToneStyles: Record<SetupTone, { card: string; icon: string; chip: string; accent: string }> = {
  blue: { card: 'border-[#E5E7EB] bg-white', icon: 'bg-blue-50 text-[#2563EB]', chip: 'bg-blue-50 text-blue-700 border-blue-200', accent: '#2563EB' },
  green: { card: 'border-[#E5E7EB] bg-white', icon: 'bg-emerald-50 text-[#10B981]', chip: 'bg-emerald-50 text-emerald-700 border-emerald-200', accent: '#10B981' },
  amber: { card: 'border-[#E5E7EB] bg-white', icon: 'bg-amber-50 text-[#F59E0B]', chip: 'bg-amber-50 text-amber-700 border-amber-200', accent: '#F59E0B' },
  red: { card: 'border-[#E5E7EB] bg-white', icon: 'bg-red-50 text-[#EF4444]', chip: 'bg-red-50 text-red-700 border-red-200', accent: '#EF4444' },
  violet: { card: 'border-[#E5E7EB] bg-white', icon: 'bg-violet-50 text-[#7C3AED]', chip: 'bg-violet-50 text-violet-700 border-violet-200', accent: '#7C3AED' },
  cyan: { card: 'border-[#E5E7EB] bg-white', icon: 'bg-cyan-50 text-cyan-700', chip: 'bg-cyan-50 text-cyan-700 border-cyan-200', accent: '#06B6D4' },
  slate: { card: 'border-[#E5E7EB] bg-white', icon: 'bg-slate-100 text-slate-700', chip: 'bg-slate-100 text-slate-700 border-slate-200', accent: '#64748B' },
};

const roundSparkPoint = (value: number) => Math.round(value * 100) / 100;

export function Sparkline({ seed, tone }: { seed: number; tone: SetupTone }) {
  const points = Array.from({ length: 8 }, (_, index) => {
    const wave = Math.sin(seed * 0.7 + index * 0.9) * 12 + Math.cos(seed + index) * 6;
    const y = roundSparkPoint(Math.max(4, Math.min(28, 24 - (10 + wave + index * 1.2))));
    return `${index * 14},${y}`;
  }).join(' ');
  const color = setupToneStyles[tone].accent;
  return (
    <svg viewBox="0 0 98 32" className="h-8 w-[98px]" aria-hidden>
      <polyline fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={points} />
    </svg>
  );
}

export function PremiumKpiCard({
  label,
  value,
  subtitle,
  trend,
  icon: Icon,
  tone,
  onClick,
}: {
  label: string;
  value: string;
  subtitle: string;
  trend?: number | null;
  icon: ComponentType<{ className?: string }>;
  tone: SetupTone;
  onClick?: () => void;
}) {
  const styles = setupToneStyles[tone];
  const trendUp = (trend ?? 0) >= 0;
  const Wrapper = onClick ? 'button' : 'article';
  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`group flex min-h-[148px] flex-col rounded-[18px] border p-5 text-left shadow-[0_8px_24px_rgba(15,23,42,0.05)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(15,23,42,0.08)] ${styles.card}`}
      style={{ borderTopWidth: 4, borderTopColor: styles.accent }}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-[#64748B]">{label}</p>
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${styles.icon}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-3 truncate text-[32px] font-bold leading-none text-[#0F172A]">{value}</p>
      <div className="mt-auto flex items-end justify-between gap-2 pt-3">
        <p className="text-xs font-medium text-[#64748B]">{subtitle}</p>
        {trend !== undefined && trend !== null ? (
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${trendUp ? 'text-emerald-600' : 'text-red-600'}`}>
              {trendUp ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
              {Math.abs(trend).toFixed(1)}%
            </span>
            <Sparkline seed={Math.abs(trend) + value.length} tone={tone} />
          </div>
        ) : null}
      </div>
    </Wrapper>
  );
}

export function StatusPill({ label, tone }: { label: string; tone: SetupTone }) {
  const styles = setupToneStyles[tone];
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${styles.chip}`}>{label}</span>;
}

export function MetadataPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-semibold text-[#475569] shadow-sm">
      <span className="text-[#94A3B8]">{label}</span>
      <span className="text-[#0F172A]">{value}</span>
    </span>
  );
}

export function WorkspaceTabs<T extends string>({
  tabs,
  active,
  onChange,
  badges,
}: {
  tabs: Array<{ id: T; label: string }>;
  active: T;
  onChange: (id: T) => void;
  badges?: Partial<Record<T, number>>;
}) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-[#E5E7EB] px-1">
      {tabs.map((tab) => {
        const selected = active === tab.id;
        const badge = badges?.[tab.id];
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`relative inline-flex items-center gap-2 rounded-t-xl px-4 py-3 text-sm font-semibold transition-colors ${
              selected ? 'text-[#2563EB]' : 'text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#0F172A]'
            }`}
          >
            {tab.label}
            {badge ? (
              <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{badge}</span>
            ) : null}
            {selected ? <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-[#2563EB]" /> : null}
          </button>
        );
      })}
    </div>
  );
}

export function AccordionSection({
  title,
  subtitle,
  count,
  defaultOpen = false,
  children,
}: {
  title: string;
  subtitle?: string;
  count?: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="group rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] open:bg-white" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 marker:content-none">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#0F172A]">{title}</p>
          {subtitle ? <p className="text-xs text-[#64748B]">{subtitle}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          {count !== undefined ? (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{count}</span>
          ) : null}
          <ChevronDown className="h-4 w-4 text-[#64748B] group-open:rotate-180 transition-transform" />
        </div>
      </summary>
      <div className="border-t border-[#E5E7EB] px-4 py-3">{children}</div>
    </details>
  );
}

const donutColors = ['#2563EB', '#10B981', '#F59E0B', '#7C3AED', '#06B6D4', '#EF4444', '#0F172A', '#EAB308'];

export function DonutChart({
  rows,
  centerLabel,
  centerValue,
}: {
  rows: Array<{ label: string; value: number; color?: string }>;
  centerLabel: string;
  centerValue: string;
}) {
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  let acc = 0;
  const stops = rows
    .filter((row) => row.value > 0)
    .map((row, index) => {
      const start = acc;
      const pct = total ? (row.value / total) * 100 : 0;
      acc += pct;
      return `${row.color || donutColors[index % donutColors.length]} ${start}% ${acc}%`;
    })
    .join(', ');

  return (
    <div className="space-y-4">
      <div className="relative mx-auto h-36 w-36 rounded-full" style={{ background: `conic-gradient(${stops || '#e2e8f0 0% 100%'})` }}>
        <div className="absolute inset-8 flex flex-col items-center justify-center rounded-full bg-white text-center shadow-inner">
          <span className="text-lg font-bold text-[#0F172A]">{centerValue}</span>
          <span className="text-[11px] font-semibold text-[#64748B]">{centerLabel}</span>
        </div>
      </div>
      <div className="max-h-40 space-y-2 overflow-y-auto">
        {rows.map((row, index) => (
          <div key={row.label} className="flex items-center justify-between gap-2 text-xs">
            <span className="flex min-w-0 items-center gap-2 font-medium text-[#64748B]">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: row.color || donutColors[index % donutColors.length] }} />
              <span className="truncate">{row.label}</span>
            </span>
            <span className="font-semibold text-[#0F172A]">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function HorizontalBarChart({ rows }: { rows: Array<{ label: string; value: number; color?: string }> }) {
  const max = Math.max(...rows.map((row) => row.value), 1);
  return (
    <div className="space-y-3">
      {rows.map((row, index) => (
        <div key={row.label}>
          <div className="mb-1 flex items-center justify-between gap-2 text-xs">
            <span className="truncate font-medium text-[#64748B]">{row.label}</span>
            <span className="font-semibold text-[#0F172A]">{row.value}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-[#E5E7EB]">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${(row.value / max) * 100}%`, backgroundColor: row.color || donutColors[index % donutColors.length] }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function InsightCard({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-[18px] border border-[#E5E7EB] bg-white p-5 shadow-sm">
      <h3 className="text-base font-semibold text-[#0F172A]">{title}</h3>
      <ul className="mt-4 space-y-2">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2 rounded-xl bg-[#F8FAFC] px-3 py-2 text-xs font-medium text-[#475569]">
            <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#2563EB]" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function WorkflowTimeline({
  steps,
}: {
  steps: Array<{ role: string; status: 'done' | 'pending' | 'blocked'; timestamp?: string; comment?: string }>;
}) {
  return (
    <div className="space-y-0">
      {steps.map((step, index) => {
        const tone = step.status === 'done' ? 'bg-emerald-500' : step.status === 'blocked' ? 'bg-red-500' : 'bg-amber-400';
        return (
          <div key={step.role} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className={`h-3 w-3 rounded-full ${tone}`} />
              {index < steps.length - 1 ? <span className="my-1 w-px flex-1 bg-[#E5E7EB] min-h-[28px]" /> : null}
            </div>
            <div className="pb-4">
              <p className="text-sm font-semibold text-[#0F172A]">{step.role}</p>
              <p className="text-xs capitalize text-[#64748B]">{step.status}</p>
              {step.timestamp ? <p className="mt-0.5 text-[11px] text-[#94A3B8]">{step.timestamp}</p> : null}
              {step.comment ? <p className="mt-1 text-xs text-[#475569]">{step.comment}</p> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#94A3B8]">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm font-medium text-[#0F172A] outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

export function PanelShell({ title, subtitle, children, className = '' }: { title: string; subtitle?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-[18px] border border-[#E5E7EB] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.05)] ${className}`}>
      <div className="border-b border-[#E5E7EB] px-5 py-4">
        <h2 className="text-lg font-semibold text-[#0F172A]">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-[#64748B]">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}
