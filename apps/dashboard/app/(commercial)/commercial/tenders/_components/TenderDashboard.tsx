'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  ChevronDown,
  Clock3,
  FileText,
  Mail,
  Plus,
  Timer,
  Trophy,
  TriangleAlert,
} from 'lucide-react';
import type { TenderDashboard as Dashboard } from '@/lib/commercial/tender-types';
import { formatWhen, tenderGet } from './tender-api';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FUNNEL_COLORS = ['#dbeafe', '#cffafe', '#ede9fe', '#d1fae5', '#fce7f3', '#dcfce7'];
const FUNNEL_TEXT = ['#1d4ed8', '#0e7490', '#6d28d9', '#047857', '#be185d', '#15803d'];
const BAR_COLORS = ['#3b82f6', '#93c5fd', '#22c55e', '#facc15', '#fb923c'];
const CATEGORY_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#94a3b8'];
const STATE_POS: Record<string, [number, number]> = {
  Lagos: [24, 82], Ogun: [30, 74], Oyo: [26, 64], Ondo: [32, 78], Edo: [36, 72], Delta: [38, 82],
  Rivers: [48, 84], Bayelsa: [42, 86], 'Akwa Ibom': [56, 80], 'Cross River': [60, 72], Imo: [50, 74],
  Abia: [52, 78], Anambra: [46, 70], Enugu: [48, 66], Kogi: [44, 58], FCT: [48, 50], Niger: [40, 46],
  Kwara: [32, 54], Kaduna: [46, 38], Kano: [56, 26], Katsina: [48, 22], Sokoto: [28, 24],
};

const billions = (value: number, digits = 2) => {
  const amount = Number(value || 0);
  const abs = Math.abs(amount);
  if (abs >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(digits)}B`;
  if (abs >= 1_000_000) return `${(amount / 1_000_000).toFixed(digits)}M`;
  return amount.toLocaleString('en-NG', { maximumFractionDigits: 0 });
};

const nairaBillions = (value: number) => `₦ ${billions(value)}`;

const plainNaira = (value: number) => Number(value || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 });

function Delta({ value, caption }: { value: number | null; caption: string }) {
  if (value == null) return <span className="text-[11px] font-semibold text-emerald-600">New</span>;
  const up = value >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${up ? 'text-emerald-600' : 'text-rose-600'}`}>
      <ArrowUpRight className={`h-3 w-3 ${up ? '' : 'rotate-90'}`} />
      {up ? '+' : ''}{value}% {caption}
    </span>
  );
}

export function TenderDashboard() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState<'thisYear' | 'last12'>('thisYear');
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    tenderGet<Dashboard>('dashboard')
      .then(setData)
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Unable to read the tender register.'));
  }, []);

  const today = useMemo(
    () => new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }),
    [],
  );
  const board = data?.board;
  const activity = period === 'thisYear'
    ? (data?.activity || MONTHS.map((month) => ({ month, opportunities: 0, submissions: 0, awards: 0 }))).map((row) => ({
        month: row.month,
        enquiries: row.opportunities,
        submissions: row.submissions,
        awards: row.awards,
      }))
    : (board?.activityRolling || []);
  const loss = board?.winLossValue?.[period] || { won: 0, lost: 0, withdrawn: 0, pending: 0 };
  const lossTotal = loss.won + loss.lost + loss.withdrawn + loss.pending;
  const share = (value: number) => (lossTotal ? Math.round((value / lossTotal) * 100) : 0);
  const categoryTotal = (board?.categories || []).reduce((sum, row) => sum + row.count, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#2563eb] text-white shadow-sm">
            <BarChart3 className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-[26px] font-black leading-tight tracking-tight text-slate-950">Tender Management Dashboard</h1>
            <p className="text-[13px] text-slate-500">Business Development & Contract Acquisition Intelligence</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
            <CalendarDays className="h-4 w-4 text-slate-400" />
            <span>
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Today</span>
              <span className="block text-[12px] font-bold text-slate-800">{today}</span>
            </span>
          </div>
          <select
            value={period}
            onChange={(event) => setPeriod(event.target.value === 'last12' ? 'last12' : 'thisYear')}
            className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-700 shadow-sm"
            aria-label="Dashboard period"
          >
            <option value="thisYear">This Year</option>
            <option value="last12">Last 12 Months</option>
          </select>
          <div className="relative">
            <Link href="/commercial/tenders/opportunities?compose=1" className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#2563eb] pl-4 pr-10 text-sm font-bold text-white shadow-sm hover:bg-blue-700">
              <Plus className="h-4 w-4" /> New Enquiry
            </Link>
            <button type="button" aria-label="More create actions" onClick={() => setMenuOpen((value) => !value)} className="absolute right-0 top-0 inline-flex h-11 w-9 items-center justify-center text-white">
              <ChevronDown className="h-4 w-4" />
            </button>
            {menuOpen ? (
              <div className="absolute right-0 top-12 z-20 w-44 rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-lg">
                <Link href="/commercial/tenders/enquiries" className="block px-3 py-2 hover:bg-slate-50" onClick={() => setMenuOpen(false)}>Enquiry register</Link>
                <Link href="/commercial/tenders/opportunities?compose=1" className="block px-3 py-2 hover:bg-slate-50" onClick={() => setMenuOpen(false)}>New opportunity</Link>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Kpi tint="bg-white" iconWrap="bg-[#e8f1ff] text-[#3b6fd8]" icon={Mail} value={board ? String(board.enquiries) : '—'} label="Client Enquiries" foot={<Delta value={board?.enquiriesDeltaPct ?? null} caption="vs last month" />} />
        <Kpi tint="bg-[#f4fbf7]" iconWrap="bg-[#e5f7ec] text-emerald-600" icon={FileText} value={board ? String(board.qualified) : '—'} label="Qualified Opportunities" foot={<Delta value={board?.qualifiedDeltaPct ?? null} caption="vs last month" />} />
        <Kpi tint="bg-[#f7f5ff]" iconWrap="bg-[#efe7ff] text-violet-600" icon={FileText} value={board ? String(board.activeTenders) : '—'} label="Active Tenders" foot={<Delta value={board?.activeDeltaPct ?? null} caption="vs last month" />} />
        <Kpi tint="bg-[#fff9ef]" iconWrap="bg-[#fff1d6] text-amber-500" icon={BarChart3} value={board ? nairaBillions(board.potentialValue) : '—'} label="Potential Contract Value" foot={<Delta value={board?.potentialDeltaPct ?? null} caption="vs last month" />} />
        <Kpi tint="bg-[#fff6f0]" iconWrap="bg-[#ffedd9] text-orange-500" icon={Trophy} value={board ? String(board.contractsWon) : '—'} label="Contracts Won" foot={<Delta value={board?.contractsWonDeltaPct ?? null} caption="vs last year" />} />
        <Kpi tint="bg-[#fff5f6]" iconWrap="bg-[#ffe4e8] text-rose-500" icon={Timer} value={board ? (board.winRateValuePct == null ? '0%' : `${board.winRateValuePct}%`) : '—'} label="Win Rate (Value)" foot={<Delta value={board?.winRateValueDeltaPct ?? null} caption="vs last year" />} />
      </section>

      <section className="grid gap-3 xl:grid-cols-12">
        <article className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm xl:col-span-5">
          <h2 className="text-[15px] font-black text-slate-950">Enquiry to Contract Pipeline</h2>
          <div className="mt-4 grid grid-cols-6 gap-1">
            {(board?.funnel || FUNNEL_COLORS.map(() => ({ label: '', count: 0, pct: 0 }))).map((stage, index) => (
              <div key={stage.label || index} className="text-center">
                <div className="rounded-lg px-1 py-2 text-[10px] font-bold leading-tight" style={{ background: FUNNEL_COLORS[index], color: FUNNEL_TEXT[index] }}>{stage.label}</div>
                <div className="mt-2 text-[20px] font-black text-slate-950">{stage.count}</div>
                <div className="text-[11px] font-semibold text-slate-400">{stage.pct}%</div>
              </div>
            ))}
          </div>
        </article>
        <article className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm xl:col-span-4">
          <h2 className="text-[15px] font-black text-slate-950">Pipeline Value by Stage (₦)</h2>
          <StageBars rows={board?.valueByStage || []} />
        </article>
        <article className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm xl:col-span-3">
          <h2 className="text-[15px] font-black text-slate-950">Opportunity Categories</h2>
          <div className="mt-2 flex items-center gap-3">
            <Donut
              slices={(board?.categories || []).map((row, index) => ({ value: row.count, color: CATEGORY_COLORS[index] }))}
              centerTop={String(categoryTotal)}
              centerBottom="Total"
            />
            <ul className="min-w-0 flex-1 space-y-1.5">
              {(board?.categories || []).map((row, index) => (
                <li key={row.label} className="flex items-center gap-2 text-[12px]">
                  <i className="h-2.5 w-2.5 rounded-full" style={{ background: CATEGORY_COLORS[index] }} />
                  <span className="flex-1 truncate text-slate-600">{row.label}</span>
                  <span className="font-bold text-slate-800">{row.count}</span>
                  <span className="w-10 text-right text-slate-400">{categoryTotal ? Math.round((row.count / categoryTotal) * 100) : 0}%</span>
                </li>
              ))}
            </ul>
          </div>
        </article>
      </section>

      <section className="grid gap-3 xl:grid-cols-12">
        <article className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm xl:col-span-5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[15px] font-black text-slate-950">Tender Activity Trend</h2>
            <div className="flex gap-3 text-[11px] font-semibold text-slate-500">
              <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-[#3b82f6]" /> Enquiries</span>
              <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-[#f59e0b]" /> Bids Submitted</span>
              <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-[#22c55e]" /> Contracts Won</span>
            </div>
          </div>
          <TrendChart rows={activity} />
        </article>
        <article className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm xl:col-span-3">
          <h2 className="text-[15px] font-black text-slate-950">Win/Loss Analysis (Value)</h2>
          <div className="mt-2 flex items-center gap-3">
            <Donut
              slices={[
                { value: loss.won, color: '#22c55e' },
                { value: loss.lost, color: '#ef4444' },
                { value: loss.withdrawn, color: '#94a3b8' },
                { value: loss.pending, color: '#f59e0b' },
              ]}
              centerTop={nairaBillions(loss.won)}
              centerBottom="Total Awarded"
            />
            <ul className="space-y-2 text-[12px]">
              <Loss color="#22c55e" label="Won" value={loss.won} pct={share(loss.won)} />
              <Loss color="#ef4444" label="Lost" value={loss.lost} pct={share(loss.lost)} />
              <Loss color="#94a3b8" label="Withdrawn" value={loss.withdrawn} pct={share(loss.withdrawn)} />
              <Loss color="#f59e0b" label="Pending" value={loss.pending} pct={share(loss.pending)} />
            </ul>
          </div>
        </article>
        <article className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm xl:col-span-4">
          <h2 className="mb-3 text-[15px] font-black text-slate-950">Top Clients by Pipeline Value</h2>
          <ClientBars rows={board?.clients || []} />
        </article>
      </section>

      <section className="grid gap-3 xl:grid-cols-12">
        <article className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm xl:col-span-5">
          <CardHead title="Upcoming Key Deadlines" href="/commercial/tenders/submission" />
          <table className="w-full text-left text-[12px]">
            <thead className="text-[10px] uppercase tracking-wide text-slate-400">
              <tr>{['Date', 'Opportunity Title', 'Client', 'Stage', 'Days Left'].map((heading) => <th key={heading} className="px-3 py-2 font-semibold">{heading}</th>)}</tr>
            </thead>
            <tbody>
              {(board?.deadlines || []).length === 0 ? <EmptyRow cols={5} text={data ? 'No upcoming deadlines.' : 'Loading register…'} /> : board?.deadlines.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-3 py-2.5 text-slate-500">{formatWhen(row.date)}</td>
                  <td className="max-w-[140px] truncate px-3 py-2.5 font-semibold text-slate-800"><Link href={`/commercial/tenders/workspace?id=${row.id}`}>{row.title}</Link></td>
                  <td className="px-3 py-2.5">{row.client}</td>
                  <td className="px-3 py-2.5 text-slate-500">{row.stage}</td>
                  <td className="px-3 py-2.5"><span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${row.daysLeft <= 7 ? 'bg-rose-50 text-rose-600' : row.daysLeft <= 14 ? 'bg-orange-50 text-orange-600' : 'bg-sky-50 text-sky-700'}`}>{row.daysLeft} days</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
        <article className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm xl:col-span-4">
          <CardHead title="Bids Awaiting Internal Approval" href="/commercial/tenders/approvals" />
          <table className="w-full text-left text-[12px]">
            <thead className="text-[10px] uppercase tracking-wide text-slate-400">
              <tr>{['Title', 'Value (₦)', 'Approval Stage', 'Priority'].map((heading) => <th key={heading} className="px-3 py-2 font-semibold">{heading}</th>)}</tr>
            </thead>
            <tbody>
              {(board?.approvals || []).length === 0 ? <EmptyRow cols={4} text={data ? 'No bids are awaiting approval.' : 'Loading register…'} /> : board?.approvals.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="max-w-[140px] truncate px-3 py-2.5 font-semibold"><Link href={`/commercial/tenders/approvals?id=${row.id}`}>{row.title}</Link></td>
                  <td className="px-3 py-2.5">{plainNaira(row.value)}</td>
                  <td className="px-3 py-2.5 text-slate-500">{row.stage}</td>
                  <td className="px-3 py-2.5"><Priority value={row.priority} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
        <article className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm xl:col-span-3">
          <CardHead title="Recent Enquiries" href="/commercial/tenders/enquiries" />
          <table className="w-full text-left text-[12px]">
            <thead className="text-[10px] uppercase tracking-wide text-slate-400">
              <tr>{['Date', 'Enquiry Title', 'Client', 'Status'].map((heading) => <th key={heading} className="px-3 py-2 font-semibold">{heading}</th>)}</tr>
            </thead>
            <tbody>
              {(board?.recent || []).length === 0 ? <EmptyRow cols={4} text={data ? 'No enquiries yet.' : 'Loading register…'} /> : board?.recent.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-3 py-2.5 text-slate-500">{formatWhen(row.date)}</td>
                  <td className="max-w-[120px] truncate px-3 py-2.5 font-semibold"><Link href={`/commercial/tenders/workspace?id=${row.id}`}>{row.title}</Link></td>
                  <td className="px-3 py-2.5">{row.client}</td>
                  <td className="px-3 py-2.5"><Status value={row.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      </section>

      <section className="grid gap-3 xl:grid-cols-12">
        <article className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm xl:col-span-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="inline-flex items-center gap-2 text-[15px] font-black text-slate-950">Priority Actions <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] text-rose-600">{board?.actionCount ?? 0}</span></h2>
            <Link href="/commercial/tenders/approvals" className="text-[12px] font-bold text-blue-600">View All →</Link>
          </div>
          {(data?.actions || []).length === 0 ? <p className="py-6 text-center text-sm text-slate-400">{data ? 'No open priority actions.' : 'Loading register…'}</p> : (
            <ul className="space-y-3">
              {data?.actions.slice(0, 3).map((action) => (
                <li key={action.id}>
                  <Link href={action.opportunityId ? `/commercial/tenders/workspace?id=${action.opportunityId}` : '/commercial/tenders/approvals'} className="flex items-start gap-3">
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-500"><FileText className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-bold text-slate-900">{action.title}</span>
                      <span className="block truncate text-[11px] text-slate-400">{action.detail}</span>
                    </span>
                    <span className="shrink-0 text-[11px] font-bold text-orange-500">{action.badge}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </article>
        <article className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm xl:col-span-4">
          <h2 className="mb-2 text-[15px] font-black text-slate-950">Geographical Distribution (Potential Value)</h2>
          <div className="flex gap-3">
            <NigeriaMap regions={board?.regions || []} />
            <ul className="min-w-[140px] flex-1 space-y-1.5">
              {(board?.regions || []).length === 0 ? <li className="text-[12px] text-slate-400">No location values yet.</li> : board?.regions.map((row) => {
                const total = (board.regions || []).reduce((sum, item) => sum + item.value, 0);
                return (
                  <li key={row.name} className="flex items-center gap-2 text-[12px]">
                    <i className="h-2 w-2 rounded-full bg-blue-500" />
                    <span className="flex-1 text-slate-600">{row.name}</span>
                    <span className="font-bold">{billions(row.value, 1)}</span>
                    <span className="w-10 text-right text-slate-400">{total ? Math.round((row.value / total) * 100) : 0}%</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </article>
        <article className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm xl:col-span-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[15px] font-black text-slate-950">Tender Insights</h2>
            <Link href="/commercial/tenders/reports" className="text-[12px] font-bold text-blue-600">View All →</Link>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Insight icon={ArrowUpRight} tone="text-emerald-600 bg-emerald-50" value={board?.insights.oilGasWinPct == null ? '0%' : `${board.insights.oilGasWinPct}%`} text="Higher win probability for Oil & Gas tenders this quarter." />
            <Insight icon={BarChart3} tone="text-blue-600 bg-blue-50" value={board ? nairaBillions(board.insights.qualifiedValue) : '—'} text="Potential value in qualified opportunities requiring management attention." />
            <Insight icon={TriangleAlert} tone="text-rose-600 bg-rose-50" value={board ? String(board.insights.highRisk) : '—'} text="High risk tenders require management attention." />
          </div>
        </article>
      </section>
    </div>
  );
}

function Kpi({ tint, iconWrap, icon: Icon, value, label, foot }: { tint: string; iconWrap: string; icon: typeof Mail; value: string; label: string; foot: ReactNode }) {
  return (
    <article className={`rounded-2xl border border-slate-200/80 p-3 shadow-sm ${tint}`}>
      <div className="flex items-start gap-2">
        <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconWrap}`}><Icon className="h-4 w-4" /></span>
        <div className="min-w-0">
          <div className="text-[22px] font-black leading-none tracking-tight text-slate-950">{value}</div>
          <div className="mt-1 text-[11px] font-semibold leading-tight text-slate-500">{label}</div>
        </div>
      </div>
      <div className="mt-2 pl-11">{foot}</div>
    </article>
  );
}

function Donut({ slices, centerTop, centerBottom }: { slices: Array<{ value: number; color: string }>; centerTop: string; centerBottom: string }) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div className="relative h-[132px] w-[132px] shrink-0">
      <svg viewBox="0 0 100 100" className="h-full w-full">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="#eef2f6" strokeWidth="12" />
        {total > 0 ? slices.map((slice, index) => {
          const length = (slice.value / total) * circumference;
          const element = <circle key={index} cx="50" cy="50" r={radius} fill="none" stroke={slice.color} strokeWidth="12" strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-offset} transform="rotate(-90 50 50)" />;
          offset += length;
          return element;
        }) : null}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <div className="text-[13px] font-black leading-none text-slate-950">{centerTop}</div>
        <div className="mt-1 text-[10px] font-semibold text-slate-400">{centerBottom}</div>
      </div>
    </div>
  );
}

function StageBars({ rows }: { rows: Array<{ label: string; value: number }> }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <div className="mt-4 flex h-[150px] items-end gap-3">
      {(rows.length ? rows : ['Enquiries', 'Qualified', 'Tender', 'Negotiation', 'Awarded'].map((label) => ({ label, value: 0 }))).map((row, index) => (
        <div key={row.label} className="flex flex-1 flex-col items-center justify-end">
          <div className="mb-1 text-[10px] font-bold text-slate-500">{billions(row.value, 1)}</div>
          <div className="w-full rounded-t-md" style={{ height: `${Math.max(row.value ? 8 : 2, (row.value / max) * 110)}px`, background: BAR_COLORS[index] }} />
          <div className="mt-1 text-center text-[10px] font-semibold text-slate-400">{row.label}</div>
        </div>
      ))}
    </div>
  );
}

function TrendChart({ rows }: { rows: Array<{ month: string; enquiries: number; submissions: number; awards: number }> }) {
  const width = 560;
  const height = 170;
  const pad = 24;
  const max = Math.max(4, ...rows.flatMap((row) => [row.enquiries, row.submissions, row.awards]));
  const x = (index: number) => pad + (index * (width - pad * 2)) / Math.max(1, rows.length - 1);
  const y = (value: number) => height - 22 - (value / max) * (height - 40);
  const path = (key: 'enquiries' | 'submissions' | 'awards') => rows.map((row, index) => `${index ? 'L' : 'M'}${x(index)},${y(row[key])}`).join(' ');
  const focus = rows.reduce((best, row, index) => (row.enquiries + row.submissions + row.awards > 0 ? index : best), Math.min(new Date().getMonth(), Math.max(0, rows.length - 1)));
  const focusRow = rows[focus];
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[180px] w-full">
        {[0, 0.5, 1].map((step) => <line key={step} x1={pad} x2={width - pad} y1={y(max * step)} y2={y(max * step)} stroke="#eef2f6" />)}
        <path d={path('enquiries')} fill="none" stroke="#3b82f6" strokeWidth="2.5" />
        <path d={path('submissions')} fill="none" stroke="#f59e0b" strokeWidth="2.5" />
        <path d={path('awards')} fill="none" stroke="#22c55e" strokeWidth="2.5" />
        {rows.map((row, index) => <text key={row.month + index} x={x(index)} y={height - 4} textAnchor="middle" fontSize="10" fill="#94a3b8">{row.month}</text>)}
      </svg>
      {focusRow ? (
        <div className="absolute right-2 top-0 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] shadow-sm">
          <div className="font-bold text-slate-700">{focusRow.month}</div>
          <div className="text-blue-600">Enquiries: {focusRow.enquiries}</div>
          <div className="text-amber-600">Bids Submitted: {focusRow.submissions}</div>
          <div className="text-emerald-600">Contracts Won: {focusRow.awards}</div>
        </div>
      ) : null}
    </div>
  );
}

function ClientBars({ rows }: { rows: Array<{ name: string; value: number }> }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  if (!rows.length) return <p className="py-8 text-center text-sm text-slate-400">No client values yet.</p>;
  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={row.name} className="grid grid-cols-[110px_1fr_52px] items-center gap-2 text-[12px]">
          <span className="truncate text-slate-600">{row.name}</span>
          <span className="h-2 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-[#3b82f6]" style={{ width: `${(row.value / max) * 100}%` }} /></span>
          <span className="text-right font-bold text-slate-800">{billions(row.value)}</span>
        </li>
      ))}
    </ul>
  );
}

function NigeriaMap({ regions }: { regions: Array<{ name: string; value: number }> }) {
  return (
    <svg viewBox="0 0 200 230" className="h-[180px] w-[140px] shrink-0">
      <path d="M78 18c22 2 48 8 70 4 24 8 40 28 38 52 8 18 6 40-8 54 10 22 4 48-16 68-24 22-52 34-78 28-22 8-46-2-58-24-14-24-16-52-6-74-12-22 2-48 24-62 16-12 28-14 34-16z" fill="#e8f1ff" stroke="#bfdbfe" />
      {regions.map((region) => {
        const pos = STATE_POS[region.name];
        if (!pos) return null;
        return <circle key={region.name} cx={pos[0] * 2} cy={pos[1] * 2.2} r="5" fill="#2563eb" />;
      })}
    </svg>
  );
}

function CardHead({ title, href }: { title: string; href: string }) {
  return (
    <div className="flex items-center justify-between px-3 pt-3">
      <h2 className="text-[15px] font-black text-slate-950">{title}</h2>
      <Link href={href} className="text-[12px] font-bold text-blue-600">View All →</Link>
    </div>
  );
}

function EmptyRow({ cols, text }: { cols: number; text: string }) {
  return <tr><td colSpan={cols} className="px-3 py-8 text-center text-sm text-slate-400">{text}</td></tr>;
}

function Priority({ value }: { value: string }) {
  const tone = /high|urgent/i.test(value) ? 'bg-rose-50 text-rose-600' : /low/i.test(value) ? 'bg-emerald-50 text-emerald-600' : 'bg-orange-50 text-orange-600';
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${tone}`}>{value}</span>;
}

function Status({ value }: { value: string }) {
  const tone = value === 'Qualified' ? 'bg-emerald-50 text-emerald-600' : value === 'Under Review' ? 'bg-orange-50 text-orange-600' : 'bg-blue-50 text-blue-600';
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${tone}`}>{value}</span>;
}

function Loss({ color, label, value, pct }: { color: string; label: string; value: number; pct: number }) {
  return (
    <li className="flex items-center gap-2">
      <i className="h-2 w-2 rounded-full" style={{ background: color }} />
      <span className="w-16 text-slate-500">{label}</span>
      <span className="font-bold text-slate-800">{billions(value, 1)} ({pct}%)</span>
    </li>
  );
}

function Insight({ icon: Icon, tone, value, text }: { icon: typeof Clock3; tone: string; value: string; text: string }) {
  return (
    <div className="rounded-xl border border-slate-100 p-2">
      <div className={`mb-2 inline-flex h-7 w-7 items-center justify-center rounded-lg ${tone}`}><Icon className="h-3.5 w-3.5" /></div>
      <div className="text-[16px] font-black text-slate-950">{value}</div>
      <p className="mt-1 text-[10px] leading-snug text-slate-400">{text}</p>
    </div>
  );
}
