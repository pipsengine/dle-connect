'use client';

import type { ComponentType, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ArrowRight, MoreHorizontal, TrendingDown, TrendingUp, X } from 'lucide-react';

export const essTokens = {
  primary: '#2563EB',
  navy: '#081A3A',
  sidebar: '#081A3A',
  sidebarHover: '#0D2557',
  pageBg: '#F5F7FB',
  card: '#FFFFFF',
  divider: '#E9EEF5',
  border: '#E5E7EB',
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  success: '#10B981',
  successBg: '#ECFDF5',
  warning: '#F59E0B',
  warningBg: '#FFFBEB',
  danger: '#EF4444',
  purple: '#7C3AED',
  purpleBg: '#F5F3FF',
  cyan: '#06B6D4',
  orange: '#F97316',
  shadowSm: '0 2px 6px rgba(15,23,42,.05)',
  shadowMd: '0 10px 30px rgba(15,23,42,.08)',
  shadowLg: '0 20px 60px rgba(15,23,42,.10)',
  shadowHover: '0 24px 70px rgba(37,99,235,.12)',
  radiusCard: 20,
  radiusBtn: 14,
};

export function EssCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <article
      className={`rounded-[20px] border border-[#E2E8F0] bg-white shadow-[0_6px_18px_rgba(15,23,42,0.05)] ${className}`}
    >
      {children}
    </article>
  );
}

export function EssEmptyState({
  icon: Icon,
  title,
  description,
  className = '',
}: {
  icon?: LucideIcon;
  title: string;
  description: string;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 rounded-[14px] border border-dashed border-[#E2E8F0] bg-[#F8FAFC] px-6 py-10 text-center ${className}`}>
      {Icon ? (
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#EFF6FF] text-[#2563EB]">
          <Icon className="h-6 w-6" strokeWidth={2} />
        </span>
      ) : null}
      <p className="text-[14px] font-bold text-[#0F172A]">{title}</p>
      <p className="max-w-sm text-[12px] leading-relaxed text-[#64748B]">{description}</p>
    </div>
  );
}

export function EssWorkflowStepper({
  stages,
}: {
  stages: Array<{ id: string; label: string; state: string }>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {stages.map((stage, index) => (
        <div key={stage.id} className="flex items-center gap-1">
          <div
            className={`min-w-[58px] rounded-[10px] border px-2 py-1.5 text-center text-[10px] font-bold leading-tight ${
              stage.state === 'completed'
                ? 'border-[#22C55E] bg-[#ECFDF5] text-[#16A34A]'
                : stage.state === 'current' || stage.state === 'escalated'
                  ? 'border-[#2563EB] bg-[#DBEAFE] text-[#2563EB] shadow-[0_0_0_3px_rgba(37,99,235,0.12)]'
                  : stage.state === 'rejected'
                    ? 'border-[#EF4444] bg-[#FEF2F2] text-[#DC2626]'
                    : 'border-[#E2E8F0] bg-[#F8FAFC] text-[#94A3B8]'
            }`}
          >
            <p className="truncate">{stage.label.split(' ')[0]}</p>
            {stage.state === 'completed' ? <p className="text-[9px] font-semibold text-[#16A34A]">✓</p> : null}
          </div>
          {index < stages.length - 1 ? <span className="text-[10px] text-[#CBD5E1]">→</span> : null}
        </div>
      ))}
    </div>
  );
}

export function EssKpiCard({
  label,
  value,
  subtitle,
  detail,
  icon: Icon,
  accent,
  iconBg,
  sparkline,
  trend,
}: {
  label: string;
  value: string;
  subtitle: string;
  detail?: string;
  icon: LucideIcon;
  accent: string;
  iconBg: string;
  sparkline?: number[];
  trend?: number | null;
}) {
  const trendUp = (trend ?? 0) >= 0;
  return (
    <EssCard className="flex min-h-[104px] flex-col justify-between p-3.5 transition-all duration-200 hover:-translate-y-px hover:shadow-[0_8px_24px_rgba(37,99,235,0.12)]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold text-[#64748B]">{label}</p>
          <p className="mt-1 text-[26px] font-bold leading-none tracking-tight text-[#0F172A]">{value}</p>
          <p className="mt-1 text-[12px] font-medium text-[#64748B]">{subtitle}</p>
          {detail ? <p className="mt-0.5 text-[11px] text-[#94A3B8]">{detail}</p> : null}
        </div>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px]" style={{ backgroundColor: iconBg, color: accent }}>
          <Icon className="h-5 w-5" strokeWidth={2} />
        </span>
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        {sparkline?.length ? <div className="min-w-0 flex-1"><EssSparkline data={sparkline} color={accent} /></div> : <span />}
        {trend !== undefined && trend !== null ? (
          <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold ${trendUp ? 'text-[#16A34A]' : 'text-[#DC2626]'}`}>
            {trendUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {trendUp ? '+' : ''}{trend}%
          </span>
        ) : null}
      </div>
    </EssCard>
  );
}

export function EssQuickActionCard({
  title,
  description,
  icon: Icon,
  accent,
  iconBg,
  onClick,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  accent: string;
  iconBg: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-[108px] w-full flex-col rounded-[20px] border border-[#E5E7EB] bg-white p-4 text-left shadow-[0_10px_30px_rgba(15,23,42,0.08)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_24px_70px_rgba(37,99,235,0.12)]"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="flex h-11 w-11 items-center justify-center rounded-[14px]" style={{ backgroundColor: iconBg, color: accent }}>
          <Icon className="h-5 w-5" strokeWidth={2} />
        </span>
        <ArrowRight className="h-4 w-4 text-[#CBD5E1] transition-transform group-hover:translate-x-0.5 group-hover:text-[#2563EB]" />
      </div>
      <p className="mt-3 text-[15px] font-semibold text-[#0F172A]">{title}</p>
      <p className="mt-1 text-[13px] leading-snug text-[#94A3B8]">{description}</p>
    </button>
  );
}

export function EssSectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h3 className="text-[15px] font-bold tracking-tight text-[#0F172A]">{title}</h3>
      {action}
    </div>
  );
}

export function EssDonutChart({
  rows,
  centerLabel,
  centerValue,
}: {
  rows: Array<{ label: string; value: number; color: string }>;
  centerLabel: string;
  centerValue: string;
}) {
  const total = rows.reduce((sum, row) => sum + row.value, 0) || 1;
  let offset = 0;
  const segments = rows.map((row) => {
    const pct = row.value / total;
    const dash = `${pct * 251.2} 251.2`;
    const segment = { ...row, dash, offset: -offset };
    offset += pct * 251.2;
    return segment;
  });

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center">
      <div className="relative h-[132px] w-[132px] shrink-0">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          <circle cx="50" cy="50" r="40" fill="none" stroke="#E9EEF5" strokeWidth="12" />
          {segments.map((seg) => (
            <circle
              key={seg.label}
              cx="50"
              cy="50"
              r="40"
              fill="none"
              stroke={seg.color}
              strokeWidth="12"
              strokeDasharray={seg.dash}
              strokeDashoffset={seg.offset}
              strokeLinecap="round"
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <p className="text-[28px] font-bold leading-none text-[#0F172A]">{centerValue}</p>
          <p className="mt-1 text-[12px] font-medium text-[#94A3B8]">{centerLabel}</p>
        </div>
      </div>
      <div className="grid w-full flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
            <span className="text-[13px] text-[#475569]">{row.label}</span>
            <span className="ml-auto text-[13px] font-semibold text-[#0F172A]">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function EssSparkline({ data, color }: { data: number[]; color: string }) {
  if (!data.length) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const points = data
    .map((value, index) => {
      const x = (index / Math.max(data.length - 1, 1)) * 100;
      const y = 100 - ((value - min) / range) * 80 - 10;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg viewBox="0 0 100 40" className="h-10 w-full" preserveAspectRatio="none">
      <polyline fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={points} />
    </svg>
  );
}

export function EssInsightCard({
  label,
  children,
  trend,
}: {
  label: string;
  children: ReactNode;
  trend?: number | null;
}) {
  const trendUp = (trend ?? 0) >= 0;
  return (
    <EssCard className="flex min-h-[120px] flex-col p-4">
      <p className="text-[13px] font-medium text-[#475569]">{label}</p>
      <div className="mt-2 flex-1">{children}</div>
      {trend !== undefined && trend !== null ? (
        <div className={`mt-2 flex items-center gap-1 text-[12px] font-semibold ${trendUp ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
          {trendUp ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
          {trendUp ? '+' : ''}
          {trend}%
        </div>
      ) : null}
    </EssCard>
  );
}

export function EssProgressBar({ value, color = '#10B981' }: { value: number; color?: string }) {
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#E9EEF5]">
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, Math.max(0, value))}%`, backgroundColor: color }} />
    </div>
  );
}

export function EssNotificationItem({
  title,
  meta,
  status,
  icon: Icon,
  iconBg,
  iconColor,
  onClick,
  compact = false,
}: {
  title: string;
  meta: string;
  status: string;
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  onClick?: () => void;
  compact?: boolean;
}) {
  const unread = status.toLowerCase() === 'unread';
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`flex w-full items-start gap-2 rounded-[12px] border border-[#E9EEF5] bg-[#FAFBFD] text-left transition-colors hover:bg-white ${compact ? 'p-2' : 'gap-3 p-3'} ${onClick ? 'cursor-pointer' : ''}`}
    >
      <span className={`flex shrink-0 items-center justify-center rounded-[10px] ${compact ? 'h-8 w-8' : 'h-10 w-10'}`} style={{ backgroundColor: iconBg, color: iconColor }}>
        <Icon className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <p className={`font-semibold leading-snug text-[#0F172A] ${compact ? 'text-[12px]' : 'text-[14px]'}`}>{title}</p>
        <p className={`text-[#94A3B8] ${compact ? 'text-[10px]' : 'mt-0.5 text-[12px]'}`}>{meta}</p>
      </div>
      <span
        className={`shrink-0 rounded-full px-2 py-0.5 font-semibold ${compact ? 'text-[10px]' : 'px-2.5 py-1 text-[11px]'} ${
          unread ? 'bg-[#DBEAFE] text-[#2563EB]' : 'bg-[#ECFDF5] text-[#10B981]'
        }`}
      >
        {status}
      </span>
    </Wrapper>
  );
}

export function EssMiniCalendar() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const monthLabel = now.toLocaleString('en-GB', { month: 'long', year: 'numeric' });
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = Array.from({ length: 42 }, (_, index) => {
    const day = index - firstDay + 1;
    return day >= 1 && day <= daysInMonth ? day : null;
  });
  const today = now.getDate();

  return (
    <div>
      <p className="mb-2 text-[13px] font-bold text-[#0F172A]">{monthLabel}</p>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-[#94A3B8]">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, index) => <span key={`${d}-${index}`}>{d}</span>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((day, index) => (
          <span
            key={index}
            className={`flex h-7 items-center justify-center rounded-full text-[11px] font-semibold ${
              day === today ? 'bg-[#2563EB] text-white' : day ? 'text-[#475569] hover:bg-[#F1F5F9]' : ''
            }`}
          >
            {day || ''}
          </span>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-[#64748B]">
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#2563EB]" /> Leave</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#F59E0B]" /> Holiday</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#8B5CF6]" /> Training</span>
      </div>
    </div>
  );
}

export function EssEventItem({ label, date, compact = false }: { label: string; date: string; compact?: boolean }) {
  return (
    <div className={`flex items-center gap-2 border-l-2 border-[#DBEAFE] pl-3 ${compact ? 'py-1' : 'gap-3 py-2 pl-4'}`}>
      <div className={`flex shrink-0 items-center justify-center rounded-[10px] bg-[#EFF6FF] text-[#2563EB] ${compact ? 'h-7 w-7' : 'h-9 w-9'}`}>
        <svg viewBox="0 0 24 24" className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      </div>
      <div className="min-w-0 flex-1">
        <p className={`truncate font-semibold text-[#0F172A] ${compact ? 'text-[12px]' : 'text-[14px]'}`}>{label}</p>
        <p className={`text-[#94A3B8] ${compact ? 'text-[10px]' : 'text-[12px]'}`}>{date}</p>
      </div>
    </div>
  );
}

export function EssHeroIllustration() {
  return (
    <div className="relative hidden h-full min-h-[220px] w-full lg:block">
      <div className="absolute inset-0 overflow-hidden rounded-[20px]">
        <div className="absolute -right-6 top-4 h-44 w-64 rotate-[-8deg] rounded-2xl border border-white/20 bg-white/10 p-3 shadow-[0_20px_60px_rgba(0,0,0,0.25)] backdrop-blur-md">
          <div className="mb-2 h-2 w-16 rounded-full bg-white/30" />
          <div className="space-y-2">
            <div className="h-2 w-full rounded-full bg-white/20" />
            <div className="h-2 w-4/5 rounded-full bg-white/15" />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="h-8 rounded-lg bg-[#2563EB]/40" />
              <div className="h-8 rounded-lg bg-[#10B981]/40" />
            </div>
          </div>
        </div>
        <div className="absolute bottom-2 right-16 h-36 w-52 rotate-[6deg] rounded-xl border border-white/25 bg-gradient-to-br from-[#1e3a8a] to-[#2563EB] p-3 shadow-[0_20px_60px_rgba(0,0,0,0.3)]">
          <div className="mb-2 flex gap-1">
            <div className="h-1.5 w-1.5 rounded-full bg-red-400" />
            <div className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </div>
          <div className="space-y-1.5">
            <div className="h-1.5 w-full rounded bg-white/25" />
            <div className="h-1.5 w-3/4 rounded bg-white/20" />
            <div className="mt-2 h-12 rounded-lg bg-white/10" />
          </div>
        </div>
        <div className="absolute bottom-8 right-2 h-28 w-16 rotate-[12deg] rounded-[20px] border-4 border-white/30 bg-gradient-to-b from-[#312e81] to-[#4338ca] shadow-[0_16px_40px_rgba(0,0,0,0.35)]">
          <div className="mx-auto mt-3 h-1.5 w-8 rounded-full bg-white/30" />
          <div className="mx-2 mt-2 space-y-1">
            <div className="h-1 rounded bg-white/20" />
            <div className="h-1 rounded bg-white/15" />
            <div className="mt-2 h-8 rounded-md bg-white/10" />
          </div>
        </div>
        <div className="absolute right-32 top-16 h-16 w-16 rounded-2xl bg-[#10B981]/30 blur-xl" />
        <div className="absolute right-8 top-8 h-12 w-12 rounded-full bg-[#7C3AED]/25 blur-lg" />
      </div>
    </div>
  );
}

export function EssSecurityBanner({ onManage, onDismiss }: { onManage?: () => void; onDismiss?: () => void }) {
  return (
    <div
      className="relative overflow-hidden rounded-[20px] p-6 shadow-[0_20px_60px_rgba(15,23,42,0.10)]"
      style={{ background: 'linear-gradient(135deg, #0F2D6B 0%, #1e40af 50%, #2563EB 100%)' }}
    >
      {onDismiss ? (
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className="absolute right-4 top-4 rounded-lg p-1 text-white/70 hover:bg-white/10 hover:text-white">
          <X className="h-4 w-4" />
        </button>
      ) : null}
      <div className="flex flex-col items-start gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[16px] bg-white/15 text-white backdrop-blur">
            <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <div>
            <p className="text-[18px] font-bold text-white">Your Security, Our Priority</p>
            <p className="mt-1 max-w-xl text-[14px] leading-relaxed text-white/80">
              MFA is enabled on your account. Keep your credentials secure and review your security settings regularly.
            </p>
            <button
              type="button"
              onClick={onManage}
              className="mt-3 inline-flex items-center gap-1 text-[14px] font-semibold text-white hover:underline"
            >
              Manage Security <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="hidden items-center gap-3 lg:flex">
          {['🔒', '🛡️', '👆'].map((emoji, i) => (
            <div key={i} className="flex h-16 w-16 items-center justify-center rounded-[16px] bg-white/10 text-2xl backdrop-blur">
              {emoji}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function EssProfileMenuButton() {
  return (
    <button type="button" aria-label="Profile options" className="rounded-lg p-1.5 text-[#94A3B8] hover:bg-[#F5F8FC] hover:text-[#475569]">
      <MoreHorizontal className="h-5 w-5" />
    </button>
  );
}
