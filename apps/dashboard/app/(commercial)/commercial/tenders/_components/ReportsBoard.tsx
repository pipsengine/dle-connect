'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { CalendarRange, Download, FileBarChart2 } from 'lucide-react';
import type { TenderApproval, TenderAuditEvent, TenderAward, TenderDashboard, TenderItem, TenderOpportunity, TenderSubmission } from '@/lib/commercial/tender-types';
import { MONTHS, closedOut, compactNaira, daysUntil, downloadCsv, inMonth, monthDelta, plainNaira } from '@/lib/commercial/tender-present';
import { formatWhen, tenderGet } from './tender-api';
import { Donut, Pill } from './tender-widgets';
import { Crumbs, Empty, Panel, TabBar } from './record-frame';

const TABS = ['Executive Overview', 'Tender Pipeline', 'Bid Success Analysis', 'Contract Performance', 'Spend Analysis', 'Supplier / Client Analysis', 'Risk & Compliance', 'Custom Reports'] as const;
const STATUS_LABELS = ['Open', 'Bid Submitted', 'Under Evaluation', 'Awarded', 'Closed', 'Withdrawn'] as const;
const STATUS_COLORS = ['#3b82f6', '#22c55e', '#eab308', '#a855f7', '#94a3b8', '#ef4444'];
const SECTORS = ['Oil & Gas', 'Engineering', 'Construction', 'Fabrication', 'Mechanical'] as const;
const COMPLIANCE = ['Compliant', 'Under Review', 'Non-Compliant', 'Missing'] as const;
const COMPLIANCE_COLORS = ['#22c55e', '#eab308', '#ef4444', '#94a3b8'];

const reportStatus = (row: TenderOpportunity) => {
  if (row.status === 'Awarded' || row.stage === 'Awarded') return 'Awarded';
  if (row.status === 'Closed') return 'Closed';
  if (closedOut(row)) return 'Withdrawn';
  if (row.status === 'Submitted' || row.stage === 'Submitted') return 'Bid Submitted';
  if (row.status === 'Under Review' || row.stage === 'Under Review') return 'Under Evaluation';
  return 'Open';
};

const sectorBucket = (row: TenderOpportunity) => {
  const text = `${row.category} ${row.subCategory} ${row.title}`.toLowerCase();
  if (/oil|gas/.test(text)) return 'Oil & Gas';
  if (/mech/.test(text)) return 'Mechanical';
  if (/fabric/.test(text)) return 'Fabrication';
  if (/construct|civil|infra/.test(text)) return 'Construction';
  return 'Engineering';
};

const complianceBand = (item: TenderItem) => {
  const text = `${item.status} ${item.kind}`.toLowerCase();
  if (/missing|absent/.test(text)) return 'Missing';
  if (/non|fail|reject/.test(text)) return 'Non-Compliant';
  if (/review|open|pending/.test(text)) return 'Under Review';
  if (/done|compliant|approved|closed/.test(text)) return 'Compliant';
  return 'Under Review';
};

export function ReportsBoard() {
  const [rows, setRows] = useState<TenderOpportunity[]>([]);
  const [dashboard, setDashboard] = useState<TenderDashboard | null>(null);
  const [submissions, setSubmissions] = useState<TenderSubmission[]>([]);
  const [awards, setAwards] = useState<TenderAward[]>([]);
  const [approvals, setApprovals] = useState<TenderApproval[]>([]);
  const [items, setItems] = useState<TenderItem[]>([]);
  const [audit, setAudit] = useState<TenderAuditEvent[]>([]);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<(typeof TABS)[number]>('Executive Overview');
  const year = new Date().getFullYear();
  const [fromDate, setFromDate] = useState(`${year}-01-01`);
  const [toDate, setToDate] = useState(`${year}-12-31`);

  useEffect(() => {
    Promise.all([
      tenderGet<TenderOpportunity[]>('opportunities'),
      tenderGet<TenderDashboard>('dashboard'),
      tenderGet<TenderSubmission[]>('submissions'),
      tenderGet<TenderAward[]>('awards'),
      tenderGet<TenderApproval[]>('approvals'),
      tenderGet<TenderItem[]>('items'),
      tenderGet<TenderAuditEvent[]>('audit'),
    ]).then(([opportunities, summary, submitted, awarded, approved, tasks, events]) => {
      setRows(opportunities);
      setDashboard(summary);
      setSubmissions(submitted);
      setAwards(awarded);
      setApprovals(approved);
      setItems(tasks);
      setAudit(events);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : 'Unable to read reports.'));
  }, []);

  const scoped = useMemo(() => rows.filter((row) => {
    const stamp = (row.createdAt || '').slice(0, 10);
    if (fromDate && stamp && stamp < fromDate) return false;
    if (toDate && stamp && stamp > toDate) return false;
    return true;
  }), [fromDate, rows, toDate]);

  const now = new Date();
  const thisStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const prevStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const inWindow = (value: string, from: Date, to: Date) => {
    const parsed = new Date(value);
    return !Number.isNaN(parsed.getTime()) && parsed >= from && parsed < to;
  };
  const submittedIds = new Set(submissions.map((item) => item.opportunityId));
  const awardedIds = new Set(awards.map((item) => item.opportunityId));
  const bids = scoped.filter((row) => submittedIds.has(row.id) || reportStatus(row) === 'Bid Submitted' || reportStatus(row) === 'Awarded');
  const won = scoped.filter((row) => awardedIds.has(row.id) || reportStatus(row) === 'Awarded');
  const contractValue = awards.reduce((sum, award) => sum + award.awardedValue, 0);
  const decided = scoped.filter((row) => reportStatus(row) === 'Awarded' || row.status === 'Lost');
  const winRate = decided.length ? Math.round((won.length / decided.length) * 100) : 0;
  const cycles = won.map((row) => {
    const award = awards.find((item) => item.opportunityId === row.id);
    const end = new Date(award?.awardDate || row.updatedAt);
    const start = new Date(row.createdAt);
    if (Number.isNaN(end.getTime()) || Number.isNaN(start.getTime())) return null;
    return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000));
  }).filter((value): value is number => value != null);
  const cycle = cycles.length ? Math.round(cycles.reduce((sum, value) => sum + value, 0) / cycles.length) : 0;
  const countDelta = (pick: (row: TenderOpportunity) => boolean) => monthDelta(scoped.filter((row) => inWindow(row.createdAt, thisStart, new Date()) && pick(row)).length, rows.filter((row) => inWindow(row.createdAt, prevStart, thisStart) && pick(row)).length);

  const statusSlices = STATUS_LABELS.map((label, index) => ({ label, value: scoped.filter((row) => reportStatus(row) === label).length, color: STATUS_COLORS[index] }));
  const activity = MONTHS.map((month, index) => ({
    month,
    opportunities: scoped.filter((row) => inMonth(row.createdAt, year, index)).length,
    bids: submissions.filter((item) => inMonth(item.submittedAt, year, index)).length,
    awards: awards.filter((item) => inMonth(item.awardDate || item.createdAt, year, index)).length,
  }));
  const maxActivity = Math.max(1, ...activity.flatMap((item) => [item.opportunities, item.bids, item.awards]));
  let running = 0;
  const valueTrend = MONTHS.map((month, index) => {
    const value = awards.filter((item) => inMonth(item.awardDate || item.createdAt, year, index)).reduce((sum, item) => sum + item.awardedValue, 0);
    running += value;
    return { month, value, cumulative: running };
  });
  const maxValue = Math.max(1, ...valueTrend.map((item) => item.cumulative));
  const clients = Array.from(scoped.reduce((map, row) => {
    const name = row.clientName || 'Unassigned';
    const current = map.get(name) || { tenders: 0, awarded: 0, value: 0 };
    current.tenders += 1;
    if (reportStatus(row) === 'Awarded') {
      current.awarded += 1;
      current.value += awards.filter((item) => item.opportunityId === row.id).reduce((sum, item) => sum + item.awardedValue, 0);
    }
    map.set(name, current);
    return map;
  }, new Map<string, { tenders: number; awarded: number; value: number }>())).sort((a, b) => b[1].value - a[1].value).slice(0, 5);
  const sectors = SECTORS.map((label) => {
    const matched = scoped.filter((row) => sectorBucket(row) === label);
    const wins = matched.filter((row) => reportStatus(row) === 'Awarded').length;
    const losses = matched.filter((row) => row.status === 'Lost').length;
    return { label, tenders: matched.length, contracts: wins, rate: wins + losses ? Math.round((wins / (wins + losses)) * 100) : 0 };
  });
  const complianceItems = items.filter((item) => /comply|compliance|document/i.test(item.kind));
  const complianceSlices = COMPLIANCE.map((label, index) => ({ label, value: complianceItems.filter((item) => complianceBand(item) === label).length, color: COMPLIANCE_COLORS[index] }));
  const deadlines = scoped
    .map((row) => ({ row, days: daysUntil(row.submissionDeadline || row.closingDate), date: row.submissionDeadline || row.closingDate }))
    .filter((item) => item.date && item.days != null && item.days >= 0)
    .sort((a, b) => (a.days || 0) - (b.days || 0))
    .slice(0, 5);

  const exportReport = () => downloadCsv('tender-report.csv', ['Reference', 'Title', 'Client', 'Status', 'Estimated Value', 'Owner'], scoped.map((row) => [row.referenceNo, row.title, row.clientName, reportStatus(row), plainNaira(row.estimatedValue), row.ownerName]));

  const kpis = [
    ['Total Tender Opportunities', String(scoped.length), countDelta(() => true)],
    ['Bids Submitted', String(bids.length), countDelta((row) => submittedIds.has(row.id))],
    ['Contracts Awarded', String(won.length), countDelta((row) => awardedIds.has(row.id))],
    ['Total Contract Value', compactNaira(contractValue), monthDelta(awards.filter((item) => inWindow(item.createdAt, thisStart, new Date())).reduce((sum, item) => sum + item.awardedValue, 0), awards.filter((item) => inWindow(item.createdAt, prevStart, thisStart)).reduce((sum, item) => sum + item.awardedValue, 0))],
    ['Win Rate', `${winRate}%`, dashboard?.winRateDeltaPct ?? 0],
    ['Average Tender Cycle', `${cycle} days`, null],
  ] as const;

  return (
    <div className="space-y-4">
      <Crumbs items={[{ label: 'Tender Management', href: '/commercial/tenders' }, { label: 'Reports & Intelligence' }]} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#2563eb] text-white"><FileBarChart2 className="h-6 w-6" /></span>
          <div>
            <h1 className="text-[26px] font-black tracking-tight text-slate-950">Reports & Intelligence</h1>
            <p className="text-[13px] text-slate-500">Real-time insights, analytics and reports on tender performance, pipeline and contracts</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[12px] shadow-sm">
            <CalendarRange className="h-4 w-4 text-slate-400" />
            <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} aria-label="From date" />
            <span className="text-slate-300">–</span>
            <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} aria-label="To date" />
          </div>
          <button type="button" onClick={exportReport} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#2563eb] px-4 text-sm font-bold text-white"><Download className="h-4 w-4" /> Export Report</button>
        </div>
      </div>
      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      <TabBar tabs={TABS} tab={tab} onTab={(value) => setTab(value as (typeof TABS)[number])} />

      {tab === 'Executive Overview' ? (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            {kpis.map(([label, value, delta]) => (
              <article key={label} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="text-[11px] font-semibold text-slate-500">{label}</div>
                <div className="mt-1 text-[22px] font-black leading-none text-slate-950">{value}</div>
                <div className={`mt-2 text-[11px] font-semibold ${delta != null && delta < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{delta == null ? 'This period' : `${delta > 0 ? '+' : ''}${delta}% vs. previous period`}</div>
              </article>
            ))}
          </div>
          <div className="grid gap-3 xl:grid-cols-3">
            <Panel title="Tender Status Distribution" action={<Link href="/commercial/tenders/opportunities" className="text-[12px] font-semibold text-blue-700">View Details →</Link>}>
              <Donut slices={statusSlices} center={String(scoped.length)} caption="Opportunities" />
            </Panel>
            <Panel title="Monthly Tender Activity" action={<span className="text-[12px] font-semibold text-blue-700">View Details →</span>}>
              <svg viewBox="0 0 360 150" className="h-36 w-full">
                {activity.map((item, index) => {
                  const x = 16 + index * 28;
                  return (
                    <g key={item.month}>
                      <rect x={x} y={120 - (item.opportunities / maxActivity) * 90} width="7" height={(item.opportunities / maxActivity) * 90} rx="2" fill="#3b82f6" />
                      <rect x={x + 8} y={120 - (item.bids / maxActivity) * 90} width="7" height={(item.bids / maxActivity) * 90} rx="2" fill="#22c55e" />
                      <text x={x + 8} y="140" textAnchor="middle" fontSize="8" fill="#94a3b8">{item.month}</text>
                    </g>
                  );
                })}
              </svg>
            </Panel>
            <Panel title="Contract Value Trend" action={<span className="text-[12px] font-semibold text-blue-700">View Details →</span>}>
              <svg viewBox="0 0 360 150" className="h-36 w-full">
                {valueTrend.map((item, index) => <rect key={item.month} x={16 + index * 28} y={120 - (item.value / maxValue) * 90} width="14" height={(item.value / maxValue) * 90} rx="2" fill="#60a5fa" />)}
                <path d={valueTrend.map((item, index) => `${index ? 'L' : 'M'}${23 + index * 28},${120 - (item.cumulative / maxValue) * 90}`).join(' ')} fill="none" stroke="#22c55e" strokeWidth="2" />
              </svg>
            </Panel>
          </div>
          <div className="grid gap-3 xl:grid-cols-3">
            <Panel title="Top Clients by Tender Value" action={<Link href="/commercial/tenders/opportunities" className="text-[12px] font-semibold text-blue-700">View All →</Link>}>
              {clients.length === 0 ? <Empty>No client values in this period.</Empty> : (
                <table className="w-full text-left text-[12px]">
                  <thead className="text-slate-400"><tr>{['#', 'Client', 'No. of Tenders', 'Contracts Awarded', 'Total Value (₦)'].map((heading) => <th key={heading} className="py-1 font-semibold">{heading}</th>)}</tr></thead>
                  <tbody>{clients.map(([name, value], index) => <tr key={name} className="border-t border-slate-100"><td className="py-2">{index + 1}</td><td className="py-2 font-semibold">{name}</td><td className="py-2">{value.tenders}</td><td className="py-2">{value.awarded}</td><td className="py-2">{plainNaira(value.value)}</td></tr>)}</tbody>
                </table>
              )}
            </Panel>
            <Panel title="Sector Analysis" action={<span className="text-[12px] font-semibold text-blue-700">View Details →</span>}>
              <table className="w-full text-left text-[12px]">
                <thead className="text-slate-400"><tr>{['#', 'Sector', 'No. of Tenders', 'Contracts', 'Win Rate'].map((heading) => <th key={heading} className="py-1 font-semibold">{heading}</th>)}</tr></thead>
                <tbody>{sectors.map((sector, index) => <tr key={sector.label} className="border-t border-slate-100"><td className="py-2">{index + 1}</td><td className="py-2 font-semibold">{sector.label}</td><td className="py-2">{sector.tenders}</td><td className="py-2">{sector.contracts}</td><td className="py-2"><Pill className="bg-emerald-50 text-emerald-700">{sector.rate}%</Pill></td></tr>)}</tbody>
              </table>
            </Panel>
            <Panel title="Bid Success Rate" action={<span className="text-[12px] font-semibold text-blue-700">View Details →</span>}>
              <div className="flex h-36 items-end gap-3">
                {sectors.map((sector) => (
                  <div key={sector.label} className="flex flex-1 flex-col items-center gap-1">
                    <span className="text-[10px] font-bold text-slate-500">{sector.rate}%</span>
                    <div className="w-full rounded-t bg-[#3b82f6]" style={{ height: `${Math.max(4, sector.rate)}%` }} />
                    <span className="text-center text-[10px] text-slate-400">{sector.label}</span>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
          <div className="grid gap-3 xl:grid-cols-3">
            <Panel title="Recent Tender Activities" action={<Link href="/commercial/tenders/workspace" className="text-[12px] font-semibold text-blue-700">View All →</Link>}>
              {audit.length === 0 ? <Empty>No activity has been recorded.</Empty> : (
                <table className="w-full text-left text-[12px]">
                  <thead className="text-slate-400"><tr>{['Date', 'Activity', 'Reference No.', 'Status'].map((heading) => <th key={heading} className="py-1 font-semibold">{heading}</th>)}</tr></thead>
                  <tbody>{audit.slice(0, 5).map((event) => {
                    const row = rows.find((item) => item.id === event.opportunityId);
                    return <tr key={event.id} className="border-t border-slate-100"><td className="py-2">{formatWhen(event.createdAt)}</td><td className="py-2">{event.details || event.action}</td><td className="py-2">{row?.referenceNo || '—'}</td><td className="py-2"><Pill className="bg-blue-50 text-blue-700">{row ? reportStatus(row) : event.action}</Pill></td></tr>;
                  })}</tbody>
                </table>
              )}
            </Panel>
            <Panel title="Upcoming Deadlines" action={<Link href="/commercial/tenders/opportunities" className="text-[12px] font-semibold text-blue-700">View All →</Link>}>
              {deadlines.length === 0 ? <Empty>No upcoming deadlines.</Empty> : (
                <table className="w-full text-left text-[12px]">
                  <thead className="text-slate-400"><tr>{['Date', 'Milestone', 'Reference No.', 'Days Left'].map((heading) => <th key={heading} className="py-1 font-semibold">{heading}</th>)}</tr></thead>
                  <tbody>{deadlines.map((item) => <tr key={item.row.id} className="border-t border-slate-100"><td className="py-2">{formatWhen(item.date)}</td><td className="py-2">{item.row.title}</td><td className="py-2">{item.row.referenceNo}</td><td className="py-2"><Pill className="bg-amber-50 text-amber-700">{item.days} days</Pill></td></tr>)}</tbody>
                </table>
              )}
            </Panel>
            <Panel title="Document & Compliance Status" action={<Link href="/commercial/tenders/evaluation" className="text-[12px] font-semibold text-blue-700">View Details →</Link>}>
              <Donut slices={complianceSlices} center={String(complianceItems.length)} caption="Documents" />
            </Panel>
          </div>
        </>
      ) : (
        <Panel title={tab}>
          <p className="mb-3 text-sm text-slate-500">{scoped.length} opportunities · {submissions.length} submissions · {awards.length} awards · {approvals.length} approval records in this period.</p>
          {scoped.length === 0 ? <Empty>No records in this period.</Empty> : (
            <table className="w-full text-left text-[13px]">
              <thead className="text-[11px] uppercase text-slate-400"><tr>{['Reference', 'Title', 'Client', 'Status', 'Value'].map((heading) => <th key={heading} className="py-2 font-semibold">{heading}</th>)}</tr></thead>
              <tbody>{scoped.slice(0, 12).map((row) => <tr key={row.id} className="border-t border-slate-100"><td className="py-2">{row.referenceNo}</td><td className="py-2 font-semibold"><Link href={`/commercial/tenders/workspace?id=${row.id}`} className="hover:text-blue-700">{row.title}</Link></td><td className="py-2">{row.clientName}</td><td className="py-2">{reportStatus(row)}</td><td className="py-2">{plainNaira(row.estimatedValue)}</td></tr>)}</tbody>
            </table>
          )}
        </Panel>
      )}
    </div>
  );
}
