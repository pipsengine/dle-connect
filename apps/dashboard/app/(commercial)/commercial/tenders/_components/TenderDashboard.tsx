'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  Mail,
  Send,
  Trophy,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import type { TenderAuditEvent, TenderOpportunity, TenderSubmission } from '@/lib/commercial/tender-types';
import { daysUntil } from '@/lib/commercial/tender-present';
import { awardedToDleOf, CLIENT_COLORS, clientStatusOf, externalDeadlineOf, internalDeadlineOf, PREPARATION_COLORS, preparationOf, type ClientStatus } from '@/lib/commercial/tender-workflow';
import { formatWhen, tenderGet } from './tender-api';

type Prep = 'Not Started' | 'In Progress' | 'Submitted';
type Decision = ClientStatus;

const PREP_COLORS: Record<Prep, string> = PREPARATION_COLORS;
const DECISION_COLORS: Record<Decision, string> = CLIENT_COLORS;
const DECISIONS: Decision[] = ['Pending', 'Suspended', 'Cancelled', 'Re-Opened', 'Awarded'];

const isEnquiry = (row: TenderOpportunity) => row.stage === 'Enquiry' || row.tenderType === 'Enquiry' || row.opportunityType === 'Enquiry';
const isAwardedToDle = (row: TenderOpportunity) => awardedToDleOf(row) === 'Yes';
const isTerminal = (row: TenderOpportunity) => clientStatusOf(row) === 'Awarded' || clientStatusOf(row) === 'Cancelled';

function prepOf(row: TenderOpportunity): Prep {
  return preparationOf(row);
}

function decisionOf(row: TenderOpportunity): Decision {
  return clientStatusOf(row);
}

function dueLabel(days: number) {
  if (days < 0) return 'Overdue';
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due in 1 day';
  return `Due in ${days} days`;
}

function dueTone(days: number) {
  if (days <= 1) return 'bg-orange-50 text-orange-600';
  if (days === 2) return 'bg-amber-50 text-amber-600';
  return 'bg-sky-50 text-sky-700';
}

function activityWhen(value: string) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  const dayStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const day = dayStart(parsed);
  const today = dayStart(new Date());
  const time = parsed.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if (day === today) return `Today, ${time}`;
  if (day === today - 86_400_000) return `Yesterday, ${time}`;
  return formatWhen(value);
}

function activityIcon(action: string, details: string): { icon: LucideIcon; tint: string } {
  const text = `${action} ${details}`.toLowerCase();
  if (/award|won/.test(text)) return { icon: Trophy, tint: 'bg-emerald-50 text-emerald-600' };
  if (/submit/.test(text)) return { icon: Send, tint: 'bg-blue-50 text-blue-600' };
  if (/approv|review/.test(text)) return { icon: CheckCircle2, tint: 'bg-emerald-50 text-emerald-600' };
  if (/clarif|enquir/.test(text)) return { icon: Mail, tint: 'bg-sky-50 text-sky-600' };
  return { icon: FileText, tint: 'bg-violet-50 text-violet-600' };
}

const pct = (count: number, total: number) => (total ? Math.round((count / total) * 100) : 0);

export function TenderDashboard() {
  const [rows, setRows] = useState<TenderOpportunity[]>([]);
  const [submittedIds, setSubmittedIds] = useState<Set<string>>(new Set());
  const [audit, setAudit] = useState<TenderAuditEvent[]>([]);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [deadlineTab, setDeadlineTab] = useState<'All' | 'Enquiries' | 'Tenders'>('All');
  const [pastTab, setPastTab] = useState<'All' | 'Enquiries' | 'Tenders'>('All');

  useEffect(() => {
    let active = true;
    Promise.all([
      tenderGet<TenderOpportunity[]>('opportunities'),
      tenderGet<TenderSubmission[]>('submissions'),
      tenderGet<TenderAuditEvent[]>('audit'),
    ]).then(([opportunities, submissionRows, auditRows]) => {
      if (!active) return;
      setRows(opportunities);
      setSubmittedIds(new Set(submissionRows.map((item) => item.opportunityId)));
      setAudit(auditRows);
    }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Unable to read the tender register.');
    }).finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);

  const today = useMemo(() => new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }), []);
  const year = new Date().getFullYear();

  const openRows = rows.filter((row) => !isTerminal(row));
  const met = (row: TenderOpportunity) => prepOf(row) === 'Submitted' || isAwardedToDle(row) || submittedIds.has(row.id);
  const enquiries = rows.filter(isEnquiry);
  const tenders = rows.filter((row) => !isEnquiry(row));
  const tally = (list: TenderOpportunity[]) => ({
    notStarted: list.filter((row) => prepOf(row) === 'Not Started').length,
    inProgress: list.filter((row) => prepOf(row) === 'In Progress').length,
    submitted: list.filter((row) => prepOf(row) === 'Submitted').length,
  });
  const enquiryPrep = tally(enquiries);
  const tenderPrep = tally(tenders);
  const unassignedEnquiries = enquiries.filter((row) => !row.ownerName.trim()).length;
  const unassignedTenders = tenders.filter((row) => !row.ownerName.trim()).length;

  const deadlineRows = openRows.map((row) => {
    const internal = internalDeadlineOf(row);
    const external = externalDeadlineOf(row);
    const internalDays = daysUntil(internal);
    const externalDays = daysUntil(external);
    const nearest = [internalDays, externalDays].filter((value): value is number => value != null).sort((left, right) => left - right)[0];
    return { row, internal, external, internalDays, externalDays, nearest };
  }).filter((item) => item.nearest != null).sort((left, right) => (left.nearest ?? 0) - (right.nearest ?? 0));

  const internalDue = deadlineRows.filter((item) => item.internalDays != null && item.internalDays <= 3);
  const externalDue = deadlineRows.filter((item) => item.externalDays != null && item.externalDays <= 7);
  const awardedRows = rows.filter(isAwardedToDle);
  const awardedThisYear = awardedRows.filter((row) => (row.updatedAt || row.createdAt || '').startsWith(String(year))).length;
  const awardedCount = awardedRows.length;
  const submittedBids = rows.filter((row) => !isEnquiry(row) && (prepOf(row) === 'Submitted' || submittedIds.has(row.id))).length;
  const pendingDecision = rows.filter((row) => awardedToDleOf(row) === 'Pending Decision' && prepOf(row) === 'Submitted').length;
  const unsuccessful = rows.filter((row) => awardedToDleOf(row) === 'No').length;
  const decidedOutcomes = awardedCount + unsuccessful;
  const winRatePct = pct(awardedCount, decidedOutcomes);

  const upcomingRows = deadlineRows.filter((item) => (item.nearest ?? 0) >= 0);
  const pastRows = deadlineRows.filter((item) => (item.nearest ?? 0) < 0 && !met(item.row));
  const visibleDeadlines = upcomingRows.filter((item) => deadlineTab === 'All' || (deadlineTab === 'Enquiries' ? isEnquiry(item.row) : !isEnquiry(item.row)));
  const visiblePast = pastRows.filter((item) => pastTab === 'All' || (pastTab === 'Enquiries' ? isEnquiry(item.row) : !isEnquiry(item.row)));
  const classified = rows.map((row) => decisionOf(row));
  const decisionCounts = DECISIONS.map((label) => ({ label, count: classified.filter((item) => item === label).length }));
  const decisionTotal = rows.length;

  return (
    <div className="space-y-3">
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[#2563eb] text-white"><FileText className="h-5 w-5" /></span>
          <div>
            <h1 className="text-[22px] font-black tracking-tight text-slate-950">Tender Management Dashboard</h1>
            <p className="text-[12px] text-slate-500">Overview of enquiries, tender opportunities, assignments, deadlines and outcomes</p>
          </div>
        </div>
        <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-[#f8fafc] px-3 py-2">
          <CalendarDays className="h-4 w-4 text-slate-400" />
          <span>
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Today</span>
            <span className="block text-[12px] font-bold text-slate-800">{today}</span>
          </span>
        </div>
      </section>

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={Mail} tint="bg-blue-50 text-blue-600" value={enquiries.length} label="Total Enquiries" lines={[
          [enquiryPrep.notStarted, 'Not Started', 'bg-slate-400'],
          [enquiryPrep.inProgress, 'In Progress', 'bg-blue-500'],
          [enquiryPrep.submitted, 'Submitted', 'bg-emerald-500'],
        ]} />
        <Kpi icon={FileText} tint="bg-orange-50 text-orange-500" value={tenders.length} label="Total Tender Opportunities" lines={[
          [tenderPrep.notStarted, 'Not Started', 'bg-slate-400'],
          [tenderPrep.inProgress, 'In Progress', 'bg-blue-500'],
          [tenderPrep.submitted, 'Submitted', 'bg-emerald-500'],
        ]} />
        <Kpi icon={UserRound} tint="bg-amber-50 text-amber-600" value={unassignedEnquiries} label="Enquiries Awaiting GM Commercial Assignment" lines={[
          [unassignedEnquiries, 'Awaiting assignment', 'bg-amber-500'],
        ]} />
        <Kpi icon={UserRound} tint="bg-rose-50 text-rose-500" value={unassignedTenders} label="Tenders Awaiting MD Assignment" lines={[
          [unassignedTenders, 'Awaiting assignment', 'bg-rose-500'],
        ]} />
        <Kpi icon={Clock3} tint="bg-rose-50 text-rose-500" value={internalDue.length} label="Internal Deadlines Due" lines={[
          [internalDue.filter((item) => (item.internalDays ?? 0) >= 0).length, 'in next 3 days', 'bg-rose-400'],
          [internalDue.filter((item) => (item.internalDays ?? 0) < 0).length, 'Overdue', 'bg-rose-600'],
        ]} />
        <Kpi icon={CalendarDays} tint="bg-orange-50 text-orange-500" value={externalDue.length} label="External Deadlines Due" lines={[
          [externalDue.filter((item) => (item.externalDays ?? 0) >= 0).length, 'in next 7 days', 'bg-orange-400'],
          [externalDue.filter((item) => (item.externalDays ?? 0) < 0).length, 'Overdue', 'bg-orange-600'],
        ]} />
        <Kpi icon={Send} tint="bg-blue-50 text-blue-600" value={submittedBids} label="Submitted Bids" lines={[
          [pendingDecision, 'Pending Decision', 'bg-slate-400'],
        ]} />
        <Kpi icon={Trophy} tint="bg-emerald-50 text-emerald-600" value={awardedCount} label="Awarded to DLE" lines={[
          [awardedThisYear, 'Yes, this year', 'bg-emerald-500'],
          [unsuccessful, 'No', 'bg-rose-500'],
          [pendingDecision, 'Pending Decision', 'bg-slate-400'],
        ]} />
      </section>

      <section className="grid items-start gap-3 xl:grid-cols-12">
        <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm xl:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4">
            <h2 className="text-[15px] font-black text-slate-950">Upcoming Deadlines</h2>
            <Link href="/commercial/tenders/opportunities" className="text-[12px] font-semibold text-blue-600">View All</Link>
          </div>
          <div className="flex gap-2 px-4 py-3">
            {(['All', 'Enquiries', 'Tenders'] as const).map((tab) => {
              const count = tab === 'All' ? upcomingRows.length : upcomingRows.filter((item) => (tab === 'Enquiries' ? isEnquiry(item.row) : !isEnquiry(item.row))).length;
              return <TabButton key={tab} active={deadlineTab === tab} label={`${tab} (${count})`} onClick={() => setDeadlineTab(tab)} />;
            })}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[12px]">
              <thead className="text-[11px] uppercase text-slate-400"><tr>{['#', 'Type', 'Title', 'Officer', 'Internal Deadline', 'External Deadline', 'Status'].map((heading) => <th key={heading} className="px-4 pb-2 font-semibold">{heading}</th>)}</tr></thead>
              <tbody>
                {visibleDeadlines.length === 0 ? <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">{ready ? 'No upcoming deadlines.' : 'Loading register…'}</td></tr> : visibleDeadlines.slice(0, 6).map((item, index) => (
                  <tr key={item.row.id} className="border-t border-slate-100">
                    <td className="px-4 py-2.5 text-slate-400">{index + 1}</td>
                    <td className="px-4 py-2.5 text-slate-600">{isEnquiry(item.row) ? 'Enquiry' : 'Tender'}</td>
                    <td className="px-4 py-2.5 font-semibold text-slate-800"><Link href={`/commercial/tenders/workspace?id=${item.row.id}`}>{item.row.title}</Link></td>
                    <td className="px-4 py-2.5">{item.row.ownerName || 'Unassigned'}</td>
                    <td className="px-4 py-2.5">{item.internal ? formatWhen(item.internal) : '—'}</td>
                    <td className="px-4 py-2.5">{item.external ? formatWhen(item.external) : '—'}</td>
                    <td className="px-4 py-2.5">{item.nearest == null ? '—' : <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${dueTone(item.nearest)}`}>{dueLabel(item.nearest)}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:col-span-5">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-black text-slate-950">Preparation & Submission Status</h2>
            <Link href="/commercial/tenders/bid-preparation" className="text-[12px] font-semibold text-blue-600">View Details</Link>
          </div>
          <div className="mt-3 flex gap-2">
            <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-[12px] font-bold text-slate-600">Enquiries ({enquiries.length})</span>
            <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-[12px] font-bold text-slate-600">Tenders ({tenders.length})</span>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <StatusDonut title="Enquiries" total={enquiries.length} parts={[
              ['Not Started', enquiryPrep.notStarted, PREP_COLORS['Not Started']],
              ['In Progress', enquiryPrep.inProgress, PREP_COLORS['In Progress']],
              ['Submitted', enquiryPrep.submitted, PREP_COLORS.Submitted],
            ]} />
            <StatusDonut title="Tenders" total={tenders.length} parts={[
              ['Not Started', tenderPrep.notStarted, PREP_COLORS['Not Started']],
              ['In Progress', tenderPrep.inProgress, PREP_COLORS['In Progress']],
              ['Submitted', tenderPrep.submitted, PREP_COLORS.Submitted],
            ]} />
          </div>
        </article>
      </section>

      <section className="grid items-start gap-3 xl:grid-cols-12">
        <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm xl:col-span-6">
          <div className="flex items-center justify-between px-4 pt-4">
            <h2 className="text-[15px] font-black text-slate-950">Past Deadlines</h2>
            <Link href="/commercial/tenders/opportunities" className="text-[12px] font-semibold text-blue-600">View All</Link>
          </div>
          <p className="px-4 pt-1 text-[12px] text-slate-500">Deadlines that have passed and were not met.</p>
          <div className="flex gap-2 px-4 py-3">
            {(['All', 'Enquiries', 'Tenders'] as const).map((tab) => {
              const count = tab === 'All' ? pastRows.length : pastRows.filter((item) => (tab === 'Enquiries' ? isEnquiry(item.row) : !isEnquiry(item.row))).length;
              return <TabButton key={tab} active={pastTab === tab} label={`${tab} (${count})`} onClick={() => setPastTab(tab)} />;
            })}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[12px]">
              <thead className="text-[11px] uppercase text-slate-400"><tr>{['#', 'Type', 'Title', 'Officer', 'Internal Deadline', 'External Deadline', 'Status'].map((heading) => <th key={heading} className="px-4 pb-2 font-semibold">{heading}</th>)}</tr></thead>
              <tbody>
                {visiblePast.length === 0 ? <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">{ready ? 'No past deadlines were missed.' : 'Loading register…'}</td></tr> : visiblePast.slice(0, 6).map((item, index) => (
                  <tr key={item.row.id} className="border-t border-slate-100">
                    <td className="px-4 py-2.5 text-slate-400">{index + 1}</td>
                    <td className="px-4 py-2.5 text-slate-600">{isEnquiry(item.row) ? 'Enquiry' : 'Tender'}</td>
                    <td className="px-4 py-2.5 font-semibold text-slate-800"><Link href={`/commercial/tenders/workspace?id=${item.row.id}`}>{item.row.title}</Link></td>
                    <td className="px-4 py-2.5">{item.row.ownerName || 'Unassigned'}</td>
                    <td className="px-4 py-2.5">{item.internal ? formatWhen(item.internal) : '—'}</td>
                    <td className="px-4 py-2.5">{item.external ? formatWhen(item.external) : '—'}</td>
                    <td className="px-4 py-2.5"><span className="rounded-md bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-600">{item.nearest == null ? 'Not met' : `${dueLabel(item.nearest)} · Escalated`}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:col-span-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[15px] font-black text-slate-950">Recent Activities</h2>
            <Link href="/commercial/tenders/reports" className="text-[12px] font-semibold text-blue-600">View All</Link>
          </div>
          {audit.length === 0 ? <p className="py-8 text-center text-[12px] text-slate-500">{ready ? 'No activity has been recorded.' : 'Loading register…'}</p> : audit.slice(0, 6).map((event) => {
            const visual = activityIcon(event.action, event.details);
            const Icon = visual.icon;
            const parent = rows.find((row) => row.id === event.opportunityId);
            return (
              <div key={event.id} className="flex items-start gap-2 border-t border-slate-50 py-2 first:border-0">
                <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${visual.tint}`}><Icon className="h-3.5 w-3.5" /></span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] font-semibold text-slate-800">{event.details || event.action}</div>
                  <div className="truncate text-[11px] text-slate-400">{parent?.title || event.actor || '—'}</div>
                </div>
                <div className="shrink-0 text-[11px] text-slate-400">{activityWhen(event.createdAt)}</div>
              </div>
            );
          })}
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[15px] font-black text-slate-950">Client Decision Status</h2>
            <Link href="/commercial/tenders/awards" className="text-[12px] font-semibold text-blue-600">View Details</Link>
          </div>
          <div className="flex items-center gap-3">
            <Ring
              parts={decisionCounts.map((item) => ({ value: item.count, color: DECISION_COLORS[item.label] }))}
              center={String(decisionTotal)}
              caption="Opportunities"
            />
            <ul className="space-y-2 text-[12px]">
              {decisionCounts.map((item) => (
                <li key={item.label} className="flex items-center gap-2">
                  <i className="h-2 w-2 rounded-full" style={{ background: DECISION_COLORS[item.label] }} />
                  <span className="w-28 text-slate-600">{item.label}</span>
                  <b className="text-slate-800">{item.count}</b>
                  <span className="text-slate-400">({pct(item.count, decisionTotal)}%)</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-[12px]">
            <span className="font-semibold text-slate-600">Win rate</span>
            <span>
              <b className="text-slate-800">{awardedCount}</b>
              <span className="text-slate-400"> ({winRatePct}%)</span>
            </span>
          </div>
        </article>
      </section>
    </div>
  );
}

function Kpi({ icon: Icon, tint, value, label, lines }: { icon: LucideIcon; tint: string; value: number; label: string; lines: Array<[number, string, string]> }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-start gap-2">
        <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tint}`}><Icon className="h-4 w-4" /></span>
        <div>
          <div className="text-[22px] font-black leading-none text-slate-950">{value}</div>
          <div className="mt-1 text-[11px] font-semibold leading-tight text-slate-500">{label}</div>
        </div>
      </div>
      <ul className="mt-3 space-y-1">
        {lines.map(([count, caption, dot]) => (
          <li key={caption} className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <i className={`h-1.5 w-1.5 rounded-full ${dot}`} />
            <b className="text-slate-700">{count}</b> {caption}
          </li>
        ))}
      </ul>
    </article>
  );
}

function TabButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`rounded-lg px-3 py-1.5 text-[12px] font-bold ${active ? 'bg-[#2563eb] text-white' : 'bg-slate-100 text-slate-600'}`}>{label}</button>;
}

function StatusDonut({ title, total, parts }: { title: string; total: number; parts: Array<[string, number, string]> }) {
  return (
    <div className="flex items-center gap-3">
      <Ring parts={parts.map(([, count, color]) => ({ value: count, color }))} center={String(total)} caption={title} />
      <ul className="space-y-1.5 text-[12px]">
        {parts.map(([label, count, color]) => (
          <li key={label} className="flex items-center gap-2 text-slate-600">
            <i className="h-2 w-2 rounded-full" style={{ background: color }} />
            <span className="flex-1">{label}</span>
            <b className="text-slate-800">{count}</b>
            <span className="w-10 text-right text-slate-400">{pct(count, total)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Ring({ parts, center, caption }: { parts: Array<{ value: number; color: string }>; center: string; caption: string }) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const total = parts.reduce((sum, part) => sum + part.value, 0);
  let cursor = 0;
  return (
    <svg viewBox="0 0 100 100" className="h-[118px] w-[118px] shrink-0">
      <circle cx="50" cy="50" r={radius} fill="none" stroke="#e8eef5" strokeWidth="10" />
      {total > 0 ? parts.map((part) => {
        if (!part.value) return null;
        const length = (part.value / total) * circumference;
        const node = <circle key={part.color} cx="50" cy="50" r={radius} fill="none" stroke={part.color} strokeWidth="10" strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-cursor} transform="rotate(-90 50 50)" />;
        cursor += length;
        return node;
      }) : null}
      <text x="50" y="48" textAnchor="middle" fill="#0f172a" fontSize="16" fontWeight="800">{center}</text>
      <text x="50" y="62" textAnchor="middle" fill="#94a3b8" fontSize="8">{caption}</text>
    </svg>
  );
}
