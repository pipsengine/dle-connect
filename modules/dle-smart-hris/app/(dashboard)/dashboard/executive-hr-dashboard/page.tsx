'use client';

import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import {
  ArrowDownRight,
  ArrowUpRight,
  Users,
  CalendarCheck,
  Umbrella,
  UserPlus,
  LogOut,
  ChevronRight,
  CalendarDays,
  FileText,
  Upload,
  ClipboardCheck,
  Wallet,
  Megaphone,
  BarChart3,
  ShieldCheck,
  Zap
} from 'lucide-react';

export default function ExecutiveHRDashboard() {
  const [range, setRange] = useState<'this-month' | 'last-month'>('this-month');

  const attendanceData = useMemo(() => {
    const base = range === 'this-month'
      ? [520, 780, 690, 910, 860, 940, 880, 1020, 980, 920, 1050, 990, 1010, 930, 890]
      : [480, 650, 720, 740, 790, 810, 760, 830, 860, 840, 900, 870, 910, 880, 920];
    return base.map((value, idx) => ({ day: `May ${idx + 1}`, present: value }));
  }, [range]);

  const leaveBreakdown = useMemo(
    () => [
      { name: 'Vacation', value: 76, color: '#22c55e' },
      { name: 'Sick Leave', value: 56, color: '#3b82f6' },
      { name: 'Approval Leave', value: 40, color: '#f59e0b' },
      { name: 'Maternity/Paternity', value: 24, color: '#a855f7' },
    ],
    []
  );

  const totalLeaves = leaveBreakdown.reduce((sum, item) => sum + item.value, 0);

  const attendanceSummary = useMemo(
    () => ({
      present: { value: 1032, pct: 82.7, color: 'bg-blue-600' },
      late: { value: 116, pct: 9.3, color: 'bg-amber-500' },
      absent: { value: 100, pct: 8.0, color: 'bg-red-500' },
      undertime: { value: 54, pct: 4.3, color: 'bg-violet-500' },
    }),
    []
  );

  const kpis = useMemo(
    () => [
      {
        label: 'Total Employees',
        value: '1,248',
        meta: 'View all employees →',
        trend: { direction: 'up' as const, value: '+3.2%' },
        icon: Users,
        gradient: 'from-blue-600/12 via-blue-500/5 to-transparent',
        iconBg: 'bg-blue-600/10',
        iconFg: 'text-blue-700',
      },
      {
        label: 'Present Today',
        value: '1,032',
        meta: '82.7% of total',
        trend: { direction: 'up' as const, value: '+1.1%' },
        icon: CalendarCheck,
        gradient: 'from-emerald-600/12 via-emerald-500/5 to-transparent',
        iconBg: 'bg-emerald-600/10',
        iconFg: 'text-emerald-700',
      },
      {
        label: 'On Leave Today',
        value: '98',
        meta: '7.9% of total',
        trend: { direction: 'down' as const, value: '-0.4%' },
        icon: Umbrella,
        gradient: 'from-amber-600/12 via-amber-500/5 to-transparent',
        iconBg: 'bg-amber-600/10',
        iconFg: 'text-amber-700',
      },
      {
        label: 'New Hires (This Month)',
        value: '15',
        meta: 'View new hires →',
        trend: { direction: 'up' as const, value: '+6.0%' },
        icon: UserPlus,
        gradient: 'from-violet-600/12 via-violet-500/5 to-transparent',
        iconBg: 'bg-violet-600/10',
        iconFg: 'text-violet-700',
      },
      {
        label: 'Resignations (This Month)',
        value: '4',
        meta: 'View details →',
        trend: { direction: 'down' as const, value: '-1.5%' },
        icon: LogOut,
        gradient: 'from-slate-700/10 via-slate-500/5 to-transparent',
        iconBg: 'bg-slate-700/10',
        iconFg: 'text-slate-800',
      },
    ],
    []
  );

  const leaveRequests = useMemo(
    () => [
      { name: 'Maria Santos', role: 'Marketing Specialist', type: 'Vacation Leave', range: 'May 24 – May 28, 2024', status: 'Pending' as const },
      { name: 'Pedro Reyes', role: 'IT Support', type: 'Sick Leave', range: 'May 21 – May 22, 2024', status: 'Approved' as const },
      { name: 'Anna Lee', role: 'HR Assistant', type: 'Personal Leave', range: 'May 25, 2024', status: 'Pending' as const },
      { name: 'Michael Torres', role: 'Finance Officer', type: 'Vacation Leave', range: 'May 27 – May 31, 2024', status: 'Approved' as const },
      { name: 'Liza Garcia', role: 'Teacher', type: 'Maternity Leave', range: 'Jun 1 – Aug 30, 2024', status: 'Pending' as const },
    ],
    []
  );

  const birthdays = useMemo(
    () => [
      { name: 'Carlos Mendoza', date: 'May 24', daysLeft: 3 },
      { name: 'Jasmine Cruz', date: 'May 26', daysLeft: 5 },
      { name: 'Michael Torres', date: 'May 30', daysLeft: 9 },
      { name: 'Rhea Valdez', date: 'Jun 2', daysLeft: 12 },
      { name: 'John Patrick Dela Rosa', date: 'Jun 4', daysLeft: 14 },
    ],
    []
  );

  const announcements = useMemo(
    () => [
      { title: 'Quarterly L&D Seminar', dept: 'HR Department', date: 'May 20, 2024' },
      { title: 'Payroll Schedule for May 2024', dept: 'Finance Department', date: 'May 18, 2024' },
      { title: 'Submit Updated Documents', dept: 'HR Department', date: 'May 15, 2024' },
    ],
    []
  );

  const ChartTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const value = payload[0]?.value;
    return (
      <div className="bg-white/95 backdrop-blur border border-slate-200 rounded-xl shadow-lg px-3 py-2">
        <div className="text-xs font-bold text-slate-900">{label}</div>
        <div className="text-xs text-slate-600 mt-0.5">
          Present: <span className="font-extrabold text-blue-700">{Number(value).toLocaleString()}</span>
        </div>
      </div>
    );
  };

  const DonutTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const p = payload[0]?.payload;
    if (!p) return null;
    const pct = totalLeaves ? Math.round((p.value / totalLeaves) * 1000) / 10 : 0;
    return (
      <div className="bg-white/95 backdrop-blur border border-slate-200 rounded-xl shadow-lg px-3 py-2">
        <div className="text-xs font-bold text-slate-900">{p.name}</div>
        <div className="text-xs text-slate-600 mt-0.5">
          {p.value} <span className="text-slate-400">•</span> <span className="font-bold text-slate-700">{pct}%</span>
        </div>
      </div>
    );
  };

  return (
    <div className="relative">
      <div className="absolute inset-0 -top-6 -left-6 -right-6 bg-gradient-to-br from-blue-50 via-slate-50 to-violet-50 pointer-events-none" />
      <div className="relative space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/70 backdrop-blur border border-slate-200/70 shadow-sm">
              <Zap className="w-4 h-4 text-violet-600" />
              <span className="text-xs font-bold text-slate-700">Executive HR Dashboard</span>
              <span className="w-1 h-1 rounded-full bg-emerald-500" />
              <span className="text-xs font-semibold text-emerald-700">Live</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-3">
              Welcome back, Juan
              <span className="text-slate-400">.</span>
            </h1>
            <p className="text-sm text-slate-600 mt-1.5 max-w-2xl">
              Workforce intelligence at a glance: attendance health, leave load, and action queues.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button className="inline-flex items-center gap-2 px-3 py-2 bg-white/80 backdrop-blur border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 hover:bg-white transition-colors shadow-sm">
              <CalendarDays className="w-4 h-4 text-slate-500" />
              <span>May 21, 2024 (Tuesday)</span>
            </button>
            <button className="inline-flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-dle-blue to-dle-blue-deep text-white rounded-xl text-sm font-bold shadow-sm hover:opacity-95 transition-opacity">
              <ShieldCheck className="w-4 h-4" />
              <span>Compliance</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
          {kpis.map((kpi) => {
            const TrendIcon = kpi.trend.direction === 'up' ? ArrowUpRight : ArrowDownRight;
            const trendClass = kpi.trend.direction === 'up' ? 'text-emerald-700 bg-emerald-600/10' : 'text-red-700 bg-red-600/10';
            return (
              <button
                key={kpi.label}
                className="group text-left bg-white/85 backdrop-blur border border-slate-200/60 rounded-2xl shadow-sm p-4 relative overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all"
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${kpi.gradient}`} />
                <div className="relative flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border border-slate-200/60 ${kpi.iconBg} ${kpi.iconFg}`}>
                    <kpi.icon className="w-6 h-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[12px] font-extrabold text-slate-600">{kpi.label}</div>
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-extrabold ${trendClass}`}>
                        <TrendIcon className="w-3.5 h-3.5" />
                        {kpi.trend.value}
                      </span>
                    </div>
                    <div className="text-2xl font-extrabold text-slate-900 leading-tight mt-1">{kpi.value}</div>
                    <div className="text-xs text-dle-blue font-bold mt-1 truncate group-hover:text-dle-blue-deep transition-colors">
                      {kpi.meta}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
          <section className="xl:col-span-2 bg-white/90 backdrop-blur border border-slate-200/60 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-xl bg-blue-600/10 border border-slate-200/60 flex items-center justify-center text-blue-700">
                  <CalendarCheck className="w-5 h-5" />
                </span>
                <div>
                  <h2 className="text-sm font-extrabold text-slate-900">Attendance Overview</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Daily presence trend and exception mix</p>
                </div>
              </div>
              <select
                value={range}
                onChange={(e) => setRange(e.target.value as typeof range)}
                className="text-xs font-extrabold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-dle-blue/20 focus:border-dle-blue"
              >
                <option value="this-month">This Month</option>
                <option value="last-month">Last Month</option>
              </select>
            </div>
            <div className="p-6">
              <div className="h-[250px] w-full rounded-2xl bg-gradient-to-b from-blue-50/60 to-transparent border border-slate-100 p-3">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={attendanceData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="presentGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2563eb" stopOpacity={0.28} />
                        <stop offset="100%" stopColor="#2563eb" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} interval={2} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={40} />
                    <Tooltip content={<ChartTooltip />} cursor={{ stroke: '#94a3b8', strokeDasharray: '4 4' }} />
                    <Area type="monotone" dataKey="present" stroke="#2563eb" strokeWidth={2.25} fill="url(#presentGradient)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5">
                {[
                  { label: 'Present', value: attendanceSummary.present.value, pct: attendanceSummary.present.pct, color: attendanceSummary.present.color },
                  { label: 'Late', value: attendanceSummary.late.value, pct: attendanceSummary.late.pct, color: attendanceSummary.late.color },
                  { label: 'Absent', value: attendanceSummary.absent.value, pct: attendanceSummary.absent.pct, color: attendanceSummary.absent.color },
                  { label: 'Undertime', value: attendanceSummary.undertime.value, pct: attendanceSummary.undertime.pct, color: attendanceSummary.undertime.color },
                ].map((item) => (
                  <div key={item.label} className="rounded-2xl border border-slate-100 bg-white/70 backdrop-blur p-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full ${item.color}`} />
                      <div className="text-xs font-extrabold text-slate-700">{item.label}</div>
                    </div>
                    <div className="mt-2 flex items-baseline justify-between gap-2">
                      <div className="text-lg font-extrabold text-slate-900">{item.value.toLocaleString()}</div>
                      <div className="text-xs font-bold text-slate-500">{item.pct}%</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

        <section className="bg-white/90 backdrop-blur border border-slate-200/60 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-xl bg-emerald-600/10 border border-slate-200/60 flex items-center justify-center text-emerald-700">
                <Umbrella className="w-5 h-5" />
              </span>
              <div>
                <h2 className="text-sm font-extrabold text-slate-900">Leave Summary</h2>
                <p className="text-xs text-slate-500 mt-0.5">This month leave load distribution</p>
              </div>
            </div>
            <span className="text-xs font-extrabold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">This Month</span>
          </div>
          <div className="p-6">
            <div className="h-[220px] w-full relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={leaveBreakdown}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={70}
                    outerRadius={95}
                    paddingAngle={2}
                    stroke="transparent"
                  >
                    {leaveBreakdown.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<DonutTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <div className="text-3xl font-extrabold text-slate-900">{totalLeaves}</div>
                <div className="text-xs font-semibold text-slate-500 mt-1">Total Leaves</div>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {leaveBreakdown.map((item) => (
                <div key={item.name} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="text-slate-700 font-semibold">{item.name}</span>
                  </div>
                  <span className="text-slate-600 font-extrabold">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-white/90 backdrop-blur border border-slate-200/60 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100">
            <h2 className="text-sm font-extrabold text-slate-900">Quick Actions</h2>
          </div>
          <div className="p-4 space-y-2">
            {[
              { label: 'Add New Employee', icon: Users, tint: 'text-blue-700', bg: 'bg-blue-600/10' },
              { label: 'Request Leave', icon: Umbrella, tint: 'text-emerald-700', bg: 'bg-emerald-600/10' },
              { label: 'Approve Leave Requests', icon: ClipboardCheck, tint: 'text-amber-700', bg: 'bg-amber-600/10' },
              { label: 'Process Payroll', icon: Wallet, tint: 'text-slate-800', bg: 'bg-slate-700/10' },
              { label: 'Generate Reports', icon: BarChart3, tint: 'text-violet-700', bg: 'bg-violet-600/10' },
              { label: 'Upload Document', icon: Upload, tint: 'text-cyan-700', bg: 'bg-cyan-600/10' },
              { label: 'View Announcements', icon: Megaphone, tint: 'text-rose-700', bg: 'bg-rose-600/10' },
            ].map((action) => (
              <button
                key={action.label}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-2xl border border-slate-100 hover:bg-slate-50 transition-colors group"
              >
                <span className="flex items-center gap-3 text-sm font-extrabold text-slate-800">
                  <span className={`w-9 h-9 rounded-2xl border border-slate-100 flex items-center justify-center ${action.bg} ${action.tint}`}>
                    <action.icon className="w-4 h-4" />
                  </span>
                  {action.label}
                </span>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-colors" />
              </button>
            ))}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <section className="bg-white/90 backdrop-blur border border-slate-200/60 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-extrabold text-slate-900">Recent Leave Requests</h2>
            <button className="text-xs font-extrabold text-dle-blue hover:text-dle-blue-deep">View All</button>
          </div>
          <div className="divide-y divide-slate-100">
            {leaveRequests.map((req) => (
              <div key={`${req.name}-${req.type}`} className="px-6 py-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 border border-slate-200/60 text-slate-700 flex items-center justify-center font-extrabold text-sm shrink-0">
                  {req.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-extrabold text-slate-900 truncate">{req.name}</div>
                      <div className="text-xs text-slate-500 truncate">{req.role}</div>
                    </div>
                    <span
                      className={`text-[11px] font-extrabold px-2 py-1 rounded-full ${
                        req.status === 'Approved' ? 'bg-emerald-600/10 text-emerald-700' : 'bg-amber-600/10 text-amber-700'
                      }`}
                    >
                      {req.status}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-600 gap-3">
                    <span className="font-extrabold text-slate-700">{req.type}</span>
                    <span className="truncate">{req.range}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white/90 backdrop-blur border border-slate-200/60 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-extrabold text-slate-900">Upcoming Birthdays</h2>
            <button className="text-xs font-extrabold text-dle-blue hover:text-dle-blue-deep">View All</button>
          </div>
          <div className="divide-y divide-slate-100">
            {birthdays.map((b) => (
              <div key={b.name} className="px-6 py-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-extrabold text-slate-900 truncate">{b.name}</div>
                  <div className="text-xs text-slate-500">{b.date}</div>
                </div>
                <div className="text-xs font-extrabold text-slate-600">{b.daysLeft} days left</div>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white/90 backdrop-blur border border-slate-200/60 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-extrabold text-slate-900">HR Announcements</h2>
            <button className="text-xs font-extrabold text-dle-blue hover:text-dle-blue-deep">View All</button>
          </div>
          <div className="divide-y divide-slate-100">
            {announcements.map((a) => (
              <div key={a.title} className="px-6 py-4 flex items-start gap-4">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-slate-50 to-white border border-slate-200/60 flex items-center justify-center text-slate-700 shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-extrabold text-slate-900">{a.title}</div>
                  <div className="text-xs text-slate-500 mt-1">
                    {a.date} <span className="mx-2">•</span> {a.dept}
                  </div>
                </div>
                <div className="w-2 h-2 rounded-full bg-red-500 mt-2" />
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="bg-white/90 backdrop-blur border border-slate-200/60 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-extrabold text-slate-900">Key Reports &amp; Analytics</h2>
          <button className="text-xs font-extrabold text-dle-blue hover:text-dle-blue-deep">View All</button>
        </div>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            { title: 'Employee Demographics', subtitle: 'View workforce distribution', icon: Users, tint: 'text-blue-600' },
            { title: 'Attendance Report', subtitle: 'Detailed attendance analytics', icon: CalendarCheck, tint: 'text-amber-600' },
            { title: 'Leave Utilization Report', subtitle: 'Leave trends and statistics', icon: Umbrella, tint: 'text-green-600' },
            { title: 'Turnover Report', subtitle: 'Employee turnover analysis', icon: LogOut, tint: 'text-violet-600' },
            { title: 'Payroll Summary', subtitle: 'Payroll costs and summary', icon: Wallet, tint: 'text-slate-700' },
          ].map((card) => (
            <button
              key={card.title}
              className="flex items-start gap-3 p-3 rounded-2xl border border-slate-100 hover:bg-slate-50 transition-colors text-left group"
            >
              <span className={`w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center ${card.tint}`}>
                <card.icon className="w-5 h-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-extrabold text-slate-900 truncate">{card.title}</span>
                <span className="block text-xs text-slate-500 mt-0.5 truncate">{card.subtitle}</span>
              </span>
              <ChevronRight className="w-4 h-4 text-slate-300 ml-auto mt-1 group-hover:text-slate-500 transition-colors" />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
