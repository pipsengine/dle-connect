'use client';

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { Line, LineChart, ResponsiveContainer } from 'recharts';

export const pmTokens = {
  primary: '#0052CC',
  primaryHover: '#0043A8',
  primarySoft: '#E8F1FF',
  pageBg: '#F8F9FB',
  surface: '#FFFFFF',
  border: '#E1E4E8',
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  success: '#10B981',
  successSoft: '#ECFDF5',
  warning: '#F59E0B',
  warningSoft: '#FFFBEB',
  danger: '#EF4444',
  dangerSoft: '#FEF2F2',
  purple: '#7C3AED',
  purpleSoft: '#F5F3FF',
  cyan: '#06B6D4',
  cyanSoft: '#ECFEFF',
  slate: '#64748B',
  shadowSm: '0 1px 3px rgba(15,23,42,0.06)',
  shadowMd: '0 6px 24px rgba(15,23,42,0.08)',
  radiusSm: 8,
  radiusMd: 12,
  radiusLg: 16,
};

export function PmCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <article className={`rounded-xl border border-[#E1E4E8] bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] ${className}`}>
      {children}
    </article>
  );
}

export function PmSectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#64748B]">{title}</h3>
      {action}
    </div>
  );
}

export function PmSparkline({ data, color }: { data: number[]; color: string }) {
  const chartData = data.map((value, index) => ({ index, value }));
  return (
    <div className="h-10 w-24 shrink-0">
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
        <LineChart data={chartData} margin={{ top: 4, right: 2, bottom: 4, left: 2 }}>
          <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PmKpiCard({
  label,
  value,
  sublabel,
  trend,
  sparkline,
  tone = 'blue',
}: {
  label: string;
  value: string | number;
  sublabel: string;
  trend: number;
  sparkline: number[];
  tone?: 'blue' | 'emerald' | 'amber' | 'purple' | 'cyan' | 'red';
}) {
  const tones = {
    blue: { line: '#2563EB', bg: 'bg-blue-50', text: 'text-blue-700' },
    emerald: { line: '#10B981', bg: 'bg-emerald-50', text: 'text-emerald-700' },
    amber: { line: '#F59E0B', bg: 'bg-amber-50', text: 'text-amber-700' },
    purple: { line: '#7C3AED', bg: 'bg-violet-50', text: 'text-violet-700' },
    cyan: { line: '#06B6D4', bg: 'bg-cyan-50', text: 'text-cyan-700' },
    red: { line: '#EF4444', bg: 'bg-red-50', text: 'text-red-700' },
  };
  const palette = tones[tone];
  const positive = trend >= 0;

  return (
    <PmCard className="p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#64748B]">{label}</p>
          <p className="mt-1 text-[28px] font-black leading-none text-[#0F172A]">{value}</p>
          <p className="mt-1 text-xs font-medium text-[#64748B]">{sublabel}</p>
          <div className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${palette.bg} ${palette.text}`}>
            {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {positive ? '+' : ''}{trend}% vs last cycle
          </div>
        </div>
        <PmSparkline data={sparkline} color={palette.line} />
      </div>
    </PmCard>
  );
}

export function PmBadge({
  children,
  tone = 'blue',
}: {
  children: ReactNode;
  tone?: 'blue' | 'emerald' | 'amber' | 'red' | 'slate';
}) {
  const tones = {
    blue: 'bg-blue-100 text-blue-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    amber: 'bg-amber-100 text-amber-800',
    red: 'bg-red-100 text-red-700',
    slate: 'bg-slate-100 text-slate-700',
  };
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold ${tones[tone]}`}>{children}</span>;
}

export function PmDataRow({ label, value, valueClass = '' }: { label: string; value: ReactNode; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[#F1F5F9] py-2.5 text-sm last:border-b-0">
      <span className="text-[#64748B]">{label}</span>
      <span className={`font-semibold text-[#0F172A] ${valueClass}`}>{value}</span>
    </div>
  );
}

export function PmIconBadge({ icon: Icon, tone = 'blue' }: { icon: LucideIcon; tone?: 'blue' | 'emerald' | 'amber' | 'violet' | 'cyan' | 'red' }) {
  const tones = {
    blue: 'bg-blue-100 text-blue-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    amber: 'bg-amber-100 text-amber-700',
    violet: 'bg-violet-100 text-violet-700',
    cyan: 'bg-cyan-100 text-cyan-700',
    red: 'bg-red-100 text-red-700',
  };
  return (
    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tones[tone]}`}>
      <Icon className="h-4 w-4" />
    </span>
  );
}

export function PmButton({
  children,
  variant = 'primary',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' }) {
  const variants = {
    primary: 'bg-[#0052CC] text-white hover:bg-[#0043A8]',
    secondary: 'border border-[#E1E4E8] bg-white text-[#475569] hover:bg-[#F8FAFC]',
    ghost: 'text-[#0052CC] hover:bg-[#E8F1FF]',
  };
  return (
    <button
      type="button"
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-all duration-200 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export const fmtDate = (value: string) =>
  new Date(`${value}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

export const fmtDateTime = (value: string) =>
  new Date(value).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
