'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Bell,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  FileUp,
  Hourglass,
  Plus,
  UserPlus,
  Users,
  Zap,
} from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import {
  buildOnboardingDashboardMetrics,
  type OnboardingDashboardMetrics,
  type OnboardingPeriod,
} from '@/lib/onboarding-dashboard-metrics';

type Props = {
  employees: DleEmployeeDirectoryRow[];
  initialMetrics: OnboardingDashboardMetrics;
  generatedAt: string;
  source: string;
};

const numberFmt = new Intl.NumberFormat('en-GB');
const fmtNum = (value: number) => numberFmt.format(Math.round(value));
const fmtDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const periodLabels: Record<OnboardingPeriod, string> = {
  MTD: 'This Month',
  QTD: 'This Quarter',
  YTD: 'This Year',
};

function Sparkline({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 120 28" className="mt-3 h-7 w-full" preserveAspectRatio="none" aria-hidden>
      <path
        d="M0 22 C18 20, 24 8, 36 12 C48 16, 54 24, 66 18 C78 12, 90 4, 102 10 C110 14, 116 18, 120 16"
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M0 28 L0 22 C18 20, 24 8, 36 12 C48 16, 54 24, 66 18 C78 12, 90 4, 102 10 C110 14, 116 18, 120 16 L120 28 Z"
        fill={color}
        opacity="0.12"
      />
    </svg>
  );
}

function FunnelVisual({ stages }: { stages: OnboardingDashboardMetrics['funnel'] }) {
  const max = Math.max(...stages.map((stage) => stage.count), 1);
  return (
    <div className="flex h-full min-h-[220px] items-center justify-center">
      <div className="flex w-full max-w-[200px] flex-col items-center gap-1.5">
        {stages.map((stage, index) => {
          const widthPct = 100 - index * 12;
          const fillPct = Math.max(18, Math.round((stage.count / max) * 100));
          return (
            <div
              key={stage.id}
              className="relative h-8 overflow-hidden rounded-md shadow-sm"
              style={{
                width: `${widthPct}%`,
                background: `linear-gradient(90deg, ${stage.color} 0%, ${stage.color}cc ${fillPct}%, #E8EEF8 ${fillPct}%)`,
              }}
              title={`${stage.label}: ${stage.count}`}
            />
          );
        })}
      </div>
    </div>
  );
}

export default function OnboardingDashboardClient({ employees, initialMetrics, generatedAt, source }: Props) {
  const [period, setPeriod] = useState<OnboardingPeriod>(initialMetrics.period || 'MTD');

  const metrics = useMemo(
    () => (period === initialMetrics.period ? initialMetrics : buildOnboardingDashboardMetrics(employees, period, generatedAt)),
    [employees, generatedAt, initialMetrics, period],
  );

  const statusTotal = metrics.status.reduce((sum, slice) => sum + slice.count, 0);
  const donutData = metrics.status.filter((slice) => slice.count > 0);
  const chartData = donutData.length ? donutData : [{ id: 'empty', label: 'No records', count: 1, color: '#E2E8F0' }];

  const kpis = [
    {
      id: 'active',
      label: 'Active Onboarding',
      value: metrics.kpis.active,
      delta: metrics.kpis.activeDeltaPct,
      color: '#6366F1',
      soft: '#EEF2FF',
      icon: Users,
    },
    {
      id: 'completed',
      label: 'Completed',
      value: metrics.kpis.completed,
      delta: metrics.kpis.completedDeltaPct,
      color: '#10B981',
      soft: '#ECFDF5',
      icon: CheckCircle2,
    },
    {
      id: 'pending',
      label: 'Pending Tasks',
      value: metrics.kpis.pendingTasks,
      delta: metrics.kpis.pendingDeltaPct,
      color: '#F59E0B',
      soft: '#FFFBEB',
      icon: ClipboardList,
    },
    {
      id: 'overdue',
      label: 'Overdue',
      value: metrics.kpis.overdue,
      delta: metrics.kpis.overdueDeltaPct,
      color: '#EF4444',
      soft: '#FEF2F2',
      icon: Bell,
    },
    {
      id: 'avg',
      label: 'Avg. Onboarding Days',
      value: metrics.kpis.avgOnboardingDays,
      delta: metrics.kpis.avgDaysDeltaPct,
      color: '#2563EB',
      soft: '#EFF6FF',
      icon: Hourglass,
      isDays: true,
    },
  ];

  const quickActions = [
    { label: 'Create New Onboarding', href: '/hris/employees/add-new-employee', icon: UserPlus },
    { label: 'Upload Document', href: '/hris/onboarding/document-collection', icon: FileUp },
    { label: 'Assign Task', href: '/hris/onboarding/new-hire-checklist', icon: ClipboardList },
    { label: 'Send Notification', href: '/hris/onboarding/onboarding-progress', icon: Bell },
  ];

  return (
    <div className="min-h-full bg-[#F5F7FB] px-4 py-5 sm:px-6 lg:px-8" style={{ ['--ob-primary' as string]: '#2563EB' }}>
      <div className="mx-auto max-w-[1400px] space-y-5">
        <div className="flex flex-col gap-1 text-sm text-[#64748B]">
          <nav className="flex flex-wrap items-center gap-1.5">
            <Link href="/hris" className="font-semibold hover:text-[#2563EB]">
              HRIS
            </Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="font-semibold">Onboarding</span>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="font-bold text-[#0F172A]">Onboarding Dashboard</span>
          </nav>
        </div>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="hidden h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[#EFF6FF] text-[#2563EB] sm:flex">
              <Users className="h-8 w-8" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[#0F172A] sm:text-3xl">Onboarding Dashboard</h1>
              <p className="mt-1 max-w-2xl text-sm text-[#64748B]">
                Comprehensive overview of onboarding activities, funnel progress, and induction readiness from live HRIS employee records.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={period}
              onChange={(event) => setPeriod(event.target.value as OnboardingPeriod)}
              className="min-h-10 rounded-[10px] border border-[#E6EAF2] bg-white px-3 text-sm font-semibold text-[#0F172A] shadow-sm"
            >
              {(Object.keys(periodLabels) as OnboardingPeriod[]).map((key) => (
                <option key={key} value={key}>
                  {periodLabels[key]}
                </option>
              ))}
            </select>
            <Link
              href="/hris/employees/add-new-employee"
              className="inline-flex min-h-10 items-center gap-2 rounded-[10px] bg-[#2563EB] px-4 text-sm font-bold text-white shadow-sm hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              New Onboarding
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {kpis.map((kpi) => {
            const Icon = kpi.icon;
            const deltaLabel = `${kpi.delta > 0 ? '+' : ''}${kpi.delta}% vs prior`;
            return (
              <section
                key={kpi.id}
                className="rounded-2xl border border-[#E6EAF2] bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,.04),0_8px_24px_rgba(15,23,42,.06)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">{kpi.label}</p>
                    <p className="mt-2 text-3xl font-bold tabular-nums text-[#0F172A]">
                      {kpi.isDays ? kpi.value : fmtNum(kpi.value)}
                    </p>
                    <p className={`mt-1 text-xs font-semibold ${kpi.delta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {deltaLabel}
                    </p>
                  </div>
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: kpi.soft, color: kpi.color }}>
                    <Icon className="h-5 w-5" />
                  </span>
                </div>
                <Sparkline color={kpi.color} />
              </section>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <section className="rounded-2xl border border-[#E6EAF2] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,.04),0_8px_24px_rgba(15,23,42,.06)] xl:col-span-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-[#0F172A]">Onboarding Funnel</h2>
              <Link href="/hris/onboarding/onboarding-progress" className="text-sm font-semibold text-[#2563EB] hover:underline">
                View All
              </Link>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-3">
                {metrics.funnel.map((stage) => (
                  <div key={stage.id} className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: stage.color }} />
                      <p className="truncate text-sm font-semibold text-[#334155]">{stage.label}</p>
                    </div>
                    <p className="text-sm font-bold tabular-nums text-[#0F172A]">{fmtNum(stage.count)}</p>
                  </div>
                ))}
              </div>
              <FunnelVisual stages={metrics.funnel} />
            </div>
          </section>

          <div className="space-y-4 xl:col-span-4">
            <section className="rounded-2xl border border-[#E6EAF2] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,.04),0_8px_24px_rgba(15,23,42,.06)]">
              <h2 className="text-lg font-bold text-[#0F172A]">Onboarding Status</h2>
              <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="relative mx-auto h-44 w-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={chartData} dataKey="count" nameKey="label" innerRadius={52} outerRadius={72} paddingAngle={2} stroke="none">
                        {chartData.map((slice) => (
                          <Cell key={slice.id} fill={slice.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => [fmtNum(Number(value) || 0), '']} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <p className="text-2xl font-bold text-[#0F172A]">{fmtNum(statusTotal)}</p>
                    <p className="text-xs font-semibold text-[#64748B]">Total</p>
                  </div>
                </div>
                <div className="space-y-2 self-center">
                  {metrics.status.map((slice) => (
                    <div key={slice.id} className="flex items-center justify-between gap-2 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: slice.color }} />
                        <span className="font-semibold text-[#475569]">{slice.label}</span>
                      </div>
                      <span className="font-bold tabular-nums text-[#0F172A]">{fmtNum(slice.count)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-[#E6EAF2] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,.04),0_8px_24px_rgba(15,23,42,.06)]">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold text-[#0F172A]">Recent Activities</h2>
                <Zap className="h-4 w-4 text-[#F59E0B]" />
              </div>
              {metrics.activities.length ? (
                <div className="mt-3 space-y-3">
                  {metrics.activities.slice(0, 5).map((item) => (
                    <div key={item.id} className="rounded-xl border border-[#E6EAF2] bg-[#F8FAFC] px-3 py-2.5">
                      <p className="text-sm font-bold text-[#0F172A]">{item.title}</p>
                      <p className="mt-0.5 text-xs font-semibold text-[#64748B]">
                        {item.employeeName} · {item.employeeCode}
                      </p>
                      <p className="mt-1 text-xs text-[#64748B]">{item.detail}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-6 flex flex-col items-center justify-center py-8 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#EFF6FF] text-[#2563EB]">
                    <Zap className="h-5 w-5" />
                  </div>
                  <p className="mt-3 text-sm font-semibold text-[#64748B]">No recent activities</p>
                </div>
              )}
            </section>
          </div>

          <div className="space-y-4 xl:col-span-3">
            <section className="rounded-2xl border border-[#E6EAF2] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,.04),0_8px_24px_rgba(15,23,42,.06)]">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold text-[#0F172A]">Upcoming Inductions</h2>
                <CalendarClock className="h-4 w-4 text-[#64748B]" />
              </div>
              {metrics.inductions.length ? (
                <div className="mt-3 space-y-3">
                  {metrics.inductions.map((item) => (
                    <div key={item.id} className="rounded-xl border border-[#E6EAF2] bg-[#F8FAFC] px-3 py-2.5">
                      <p className="text-sm font-bold text-[#0F172A]">{item.employeeName}</p>
                      <p className="text-xs font-semibold text-[#64748B]">
                        {item.department} · {item.kind}
                      </p>
                      <p className="mt-1 text-xs text-[#64748B]">{fmtDateTime(item.scheduledFor)}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-6 flex flex-col items-center justify-center py-6 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#F1F5F9] text-[#64748B]">
                    <CalendarClock className="h-5 w-5" />
                  </div>
                  <p className="mt-3 text-sm font-semibold text-[#64748B]">No upcoming inductions</p>
                  <p className="mt-1 text-xs text-[#94A3B8]">for the selected period</p>
                </div>
              )}
              <Link
                href="/hris/onboarding/induction-schedule"
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-[10px] border border-[#E6EAF2] bg-white px-3 py-2.5 text-sm font-bold text-[#2563EB] hover:bg-[#EFF6FF]"
              >
                Schedule Induction
                <ArrowRight className="h-4 w-4" />
              </Link>
            </section>

            <section className="rounded-2xl border border-[#E6EAF2] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,.04),0_8px_24px_rgba(15,23,42,.06)]">
              <h2 className="text-lg font-bold text-[#0F172A]">Quick Actions</h2>
              <div className="mt-3 space-y-2">
                {quickActions.map((action) => {
                  const Icon = action.icon;
                  return (
                    <Link
                      key={action.label}
                      href={action.href}
                      className="flex items-center justify-between gap-3 rounded-xl border border-[#E6EAF2] bg-[#F8FAFC] px-3 py-3 transition hover:border-[#BFDBFE] hover:bg-[#EFF6FF]"
                    >
                      <span className="flex items-center gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-[#2563EB] shadow-sm">
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="text-sm font-bold text-[#0F172A]">{action.label}</span>
                      </span>
                      <ChevronRight className="h-4 w-4 text-[#94A3B8]" />
                    </Link>
                  );
                })}
              </div>
            </section>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-[#E6EAF2] pt-4 text-xs font-semibold text-[#64748B] sm:flex-row sm:items-center sm:justify-between">
          <p>
            Module access: <span className="font-mono text-[#0F172A]">hris.onboarding.onboarding-dashboard</span>
          </p>
          <p>
            Last loaded: {fmtDateTime(generatedAt)} · {source} · Cohort {fmtNum(metrics.cohortSize)}
          </p>
        </div>
      </div>
    </div>
  );
}
