'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import {
  ChartColumn,
  ChartGantt,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Cog,
  Database,
  FileSpreadsheet,
  FileText,
  LayoutGrid,
  MessageSquare,
  Shield,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import type { TenderItem, TenderOpportunity } from '@/lib/commercial/tender-types';
import { daysUntil, expectedValue, plainNaira, workspaceStepIndex } from '@/lib/commercial/tender-present';
import { formatWhen, money, tenderPost } from './tender-api';
import { Pill } from './tender-widgets';
import { useTenderRecord } from './use-tender-record';

const EVAL_STAGES = ['Enquiry', 'Qualification', 'Bid Preparation', 'Evaluation', 'Approvals', 'Submission', 'Negotiation', 'Award'] as const;
const STAGE_FROM_RANK = [0, 1, 2, 3, 5, 6, 7, 7] as const;

const TABS: Array<{ id: string; icon: LucideIcon }> = [
  { id: 'Evaluation Overview', icon: LayoutGrid },
  { id: 'Technical Evaluation', icon: Cog },
  { id: 'Commercial Evaluation', icon: Database },
  { id: 'Financial Analysis', icon: ChartColumn },
  { id: 'Risk Assessment', icon: Shield },
  { id: 'Scenario Comparison', icon: FileSpreadsheet },
  { id: 'Evaluation Report', icon: FileText },
  { id: 'Team & Comments', icon: MessageSquare },
  { id: 'Audit Trail', icon: ChartGantt },
];

const naira = (value: number) => `₦ ${plainNaira(value)}`;
const score = (checks: boolean[]) => (checks.length ? Math.round((checks.filter(Boolean).length / checks.length) * 100) : 0);

const levelOf = (item: TenderItem) => {
  const text = `${item.status} ${item.title} ${item.details}`.toLowerCase();
  if (/high|critical/.test(text)) return 'High';
  if (/\blow\b/.test(text)) return 'Low';
  if (/medium|moderate/.test(text)) return 'Medium';
  return 'Open';
};

export function EvaluationBoard() {
  const record = useTenderRecord();
  const [tab, setTab] = useState('Evaluation Overview');
  const [actionsOpen, setActionsOpen] = useState(false);
  const [comment, setComment] = useState('');
  const opportunity = record.opportunity;
  const documents = record.detail?.documents || [];
  const lines = record.detail?.lines || [];
  const items = record.detail?.items || [];
  const approvals = record.detail?.approvals || [];
  const rank = opportunity ? workspaceStepIndex(opportunity) : null;
  const step = rank == null ? null : (rank === 3 && approvals.length > 0 ? 4 : STAGE_FROM_RANK[rank]);
  const days = opportunity ? daysUntil(opportunity.submissionDeadline || opportunity.closingDate) : null;
  const evaluationStage = step == null ? '—' : step < 3 ? 'Pending' : step === 3 ? 'In Progress' : 'Completed';

  const technical = opportunity ? score([Boolean(opportunity.description || opportunity.scopeSummary), documents.some((doc) => /tech/i.test(`${doc.category} ${doc.fileName}`)), Boolean(opportunity.category)]) : 0;
  const commercial = opportunity ? score([lines.length > 0, Boolean(opportunity.contractType), Boolean(opportunity.estimatedValue)]) : 0;
  const financial = opportunity ? score([lines.some((line) => line.unitCost > 0), Boolean(opportunity.currency), lines.some((line) => line.sell > 0)]) : 0;
  const execution = opportunity ? score([Boolean(opportunity.ownerName), Boolean(opportunity.department), Boolean(opportunity.site)]) : 0;
  const hse = opportunity ? score([documents.some((doc) => /hse|safe|comply/i.test(`${doc.category} ${doc.fileName}`)), items.some((item) => /comply|hse/i.test(item.kind))]) : 0;
  const risks = items.filter((item) => /risk|issue/i.test(item.kind));
  const riskScore = opportunity ? Math.max(0, 100 - risks.length * 15) : 0;
  const criteria = [
    ['Technical Readiness', 30, technical, technical >= 80 ? 'On Track' : technical >= 60 ? 'Acceptable' : 'Review'],
    ['Commercial Viability', 25, commercial, commercial >= 80 ? 'Acceptable' : commercial >= 60 ? 'Review' : 'Review'],
    ['Financial Feasibility', 20, financial, financial >= 80 ? 'Healthy' : financial >= 60 ? 'Acceptable' : 'Review'],
    ['Execution Capacity', 15, execution, execution >= 80 ? 'Acceptable' : execution >= 60 ? 'Acceptable' : 'Review'],
    ['HSE & Compliance', 5, hse, hse >= 80 ? 'Compliant' : hse >= 60 ? 'Acceptable' : 'Review'],
    ['Contract Risk Readiness', 5, riskScore, riskScore >= 80 ? 'Manageable' : riskScore >= 60 ? 'Manageable' : 'Review'],
  ] as const;
  const weighted = criteria.reduce((sum, [, weight, value]) => sum + (weight * value) / 100, 0);
  const overall = Math.round((technical + commercial + financial + riskScore) / 4);
  const cost = lines.reduce((sum, line) => sum + line.quantity * line.unitCost, 0);
  const sell = lines.reduce((sum, line) => sum + line.sell, 0);
  const margin = Math.max(0, sell - cost);
  const marginPct = sell ? ((sell - cost) / sell) * 100 : null;
  const tasks = items.filter((item) => /task/i.test(item.kind));
  const high = risks.filter((item) => levelOf(item) === 'High').length;
  const medium = risks.filter((item) => levelOf(item) === 'Medium').length;
  const low = risks.filter((item) => levelOf(item) === 'Low').length;
  const ready = overall >= 75;

  const cards: Array<{ label: string; value: number; note: string; tint: string; icon: LucideIcon; iconTint: string; bar: string }> = [
    { label: 'Technical Readiness', value: technical, note: opportunity ? (technical >= 80 ? 'On Track' : technical >= 60 ? 'Acceptable' : 'Review') : '—', tint: 'bg-[#eef5ff]', icon: Cog, iconTint: 'bg-blue-100 text-blue-600', bar: 'bg-emerald-500' },
    { label: 'Commercial Viability', value: commercial, note: opportunity ? (commercial >= 80 ? 'Acceptable' : 'Review') : '—', tint: 'bg-[#f5f0ff]', icon: Database, iconTint: 'bg-violet-100 text-violet-600', bar: 'bg-violet-500' },
    { label: 'Financial Feasibility', value: financial, note: opportunity ? (financial >= 80 ? 'Healthy' : financial >= 60 ? 'Acceptable' : 'Review') : '—', tint: 'bg-[#fff8eb]', icon: ChartColumn, iconTint: 'bg-amber-100 text-amber-600', bar: 'bg-amber-500' },
    { label: 'Risk Position', value: riskScore, note: opportunity ? (riskScore >= 80 ? 'Manageable' : riskScore >= 60 ? 'Manageable' : 'Review') : '—', tint: 'bg-[#fff1f2]', icon: Shield, iconTint: 'bg-rose-100 text-rose-500', bar: 'bg-rose-500' },
    { label: 'Overall Readiness', value: overall, note: opportunity ? (ready ? 'Recommended' : overall >= 60 ? 'Review' : 'Not Ready') : '—', tint: 'bg-[#eefbf3]', icon: Trophy, iconTint: 'bg-emerald-100 text-emerald-600', bar: 'bg-emerald-500' },
  ];

  const priceRows: Array<[string, string, boolean]> = [
    ['Contract Price (₦)', opportunity ? naira(opportunity.estimatedValue) : '—', false],
    ['Total Cost (₦)', lines.length ? naira(cost) : '—', false],
    ['Gross Margin (₦)', sell ? naira(margin) : '—', false],
    ['Gross Margin %', marginPct == null ? '—' : `${marginPct.toFixed(1)}%`, false],
    ['Expected Value (₦)', opportunity ? naira(expectedValue(opportunity)) : '—', false],
    ['Working Capital (₦)', '—', true],
    ['IRR (Project)', '—', true],
    ['Payback Period', '—', true],
  ];

  const decide = async (decision: string) => {
    if (!opportunity) return;
    record.setError('');
    try {
      await tenderPost({ action: 'approval', id: opportunity.id, approval: { stage: 'EVALUATION', decision, comments: comment } });
      record.setNotice(`Evaluation ${decision.toLowerCase()} saved.`);
      setComment('');
      await record.reload();
    } catch (reason) {
      record.setError(reason instanceof Error ? reason.message : 'Evaluation was not saved.');
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-slate-400">
        <div>Tender Management <span className="px-1">›</span> <Link href="/commercial/tenders/workspace" className="hover:text-slate-700">Tender Workspace</Link> <span className="px-1">›</span> <span className="font-semibold text-slate-600">Tender Evaluation</span></div>
        {record.rows.length > 1 ? (
          <select value={record.selectedId} onChange={(event) => record.setSelectedId(event.target.value)} className="h-8 max-w-[280px] rounded-lg border border-slate-200 bg-white px-2 text-[12px] font-semibold text-slate-600" aria-label="Open opportunity">
            {record.rows.map((row) => <option key={row.id} value={row.id}>{row.referenceNo} · {row.title}</option>)}
          </select>
        ) : null}
      </div>
      {record.error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{record.error}</div> : null}
      {record.notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{record.notice}</div> : null}

      <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#2563eb] text-white shadow-sm"><FileText className="h-6 w-6" /></span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-[22px] font-black tracking-tight text-slate-950">Tender Evaluation</h1>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">{opportunity?.tenderType || '—'}</span>
              </div>
              <p className="mt-0.5 text-[12px] text-slate-500">Evaluate technical, commercial, financial and risk factors to support bid approval</p>
              <p className="mt-1 text-[12px] text-slate-600">
                <b className="font-semibold text-slate-800">{opportunity?.title || (record.loading ? 'Loading evaluation…' : 'No opportunity is open')}</b>
                <span className="px-1.5 text-slate-300">|</span>Client: <b className="font-semibold">{opportunity?.clientName || '—'}</b>
                <span className="px-1.5 text-slate-300">|</span>Ref: <b className="font-semibold">{opportunity?.referenceNo || '—'}</b>
                <span className="px-1.5 text-slate-300">|</span>Sector: <b className="font-semibold">{opportunity?.category || '—'}</b>
                <span className="px-1.5 text-slate-300">|</span>Estimated Value: <b className="font-semibold">{opportunity ? money(opportunity.estimatedValue, opportunity.currency) : '—'}</b>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex h-11 items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 text-[12px] shadow-sm">
              <span className="text-amber-700/70">Evaluation Stage</span>
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              <span className="font-bold text-amber-700">{evaluationStage}</span>
            </div>
            <div className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 shadow-sm">
              <span>
                <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Submission Deadline</span>
                <span className="text-[12px] font-bold text-slate-800">{opportunity ? formatWhen(opportunity.submissionDeadline || opportunity.closingDate) : '—'}</span>
              </span>
              {days != null ? <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-600">{days} days left</span> : null}
            </div>
            <div className="relative">
              <button type="button" onClick={() => setActionsOpen((value) => !value)} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#2563eb] px-4 text-sm font-bold text-white shadow-sm">Actions <ChevronDown className="h-4 w-4" /></button>
              {actionsOpen ? (
                <div className="absolute right-0 top-12 z-20 w-52 rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-lg">
                  <Link href={opportunity ? `/commercial/tenders/workspace?id=${opportunity.id}` : '/commercial/tenders/workspace'} className="block px-3 py-2 hover:bg-slate-50" onClick={() => setActionsOpen(false)}>Open workspace</Link>
                  <button type="button" className="block w-full px-3 py-2 text-left hover:bg-slate-50 disabled:text-slate-300" disabled={!opportunity} onClick={() => { setActionsOpen(false); decide('APPROVE'); }}>Proceed to approval</button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <ol className="mt-5 flex gap-1 overflow-x-auto pb-1">
          {EVAL_STAGES.map((label, index) => {
            const state = step == null ? 'Pending' : index < step ? 'Completed' : index === step ? 'In Progress' : 'Pending';
            const tone = state === 'Completed' ? 'bg-emerald-500 text-white' : state === 'In Progress' ? 'bg-[#2563eb] text-white' : 'bg-slate-100 text-slate-400';
            return (
              <li key={label} className="flex min-w-[118px] flex-1 items-start gap-1">
                <div className="min-w-0">
                  <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-black ${tone}`}>{state === 'Completed' ? <Check className="h-3.5 w-3.5" /> : index + 1}</span>
                  <div className="mt-1 whitespace-nowrap text-[12px] font-bold text-slate-800">{label}</div>
                  <div className={`whitespace-nowrap text-[11px] font-semibold ${state === 'Completed' ? 'text-emerald-600' : state === 'In Progress' ? 'text-blue-600' : 'text-slate-400'}`}>{state}</div>
                </div>
                {index < EVAL_STAGES.length - 1 ? <ChevronRight className="mt-1.5 h-4 w-4 shrink-0 text-slate-300" /> : null}
              </li>
            );
          })}
        </ol>
      </section>

      <div className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white px-2 shadow-sm">
        {TABS.map((item) => {
          const Icon = item.icon;
          const selected = tab === item.id;
          return (
            <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-3 text-[13px] font-semibold ${selected ? 'border-[#2563eb] text-[#2563eb]' : 'border-transparent text-slate-500'}`}>
              <Icon className="h-3.5 w-3.5" />{item.id}
            </button>
          );
        })}
      </div>

      {opportunity && tab !== 'Evaluation Overview' ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {tab === 'Audit Trail' ? <AuditList events={record.detail?.audit || []} /> : null}
          {tab === 'Risk Assessment' ? <RiskList risks={risks} /> : null}
          {tab === 'Team & Comments' ? <Comments approvals={approvals} /> : null}
          {tab === 'Scenario Comparison' ? <p className="text-sm text-slate-500">Only the base case is priced from saved lines. Optimistic, downside and stress cases stay blank until a scenario is saved.</p> : null}
          {!['Audit Trail', 'Risk Assessment', 'Team & Comments', 'Scenario Comparison'].includes(tab) ? <p className="text-sm text-slate-600">{opportunity.scopeSummary || opportunity.description || 'No evaluation narrative has been saved for this tab.'}</p> : null}
        </section>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {cards.map((item) => {
              const Icon = item.icon;
              return (
                <article key={item.label} className={`rounded-2xl border border-slate-200 px-3 py-3 shadow-sm ${item.tint}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-[11px] font-semibold text-slate-500">{item.label}</div>
                      <div className="mt-1 text-[22px] font-black leading-none text-slate-950">{item.value}<span className="text-[13px] font-bold text-slate-400">/100</span></div>
                    </div>
                    <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${item.iconTint}`}><Icon className="h-4 w-4" /></span>
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/80"><div className={`h-1.5 rounded-full ${item.bar}`} style={{ width: `${item.value}%` }} /></div>
                  <div className="mt-1 text-[11px] font-semibold text-emerald-600">{item.note}</div>
                </article>
              );
            })}
          </div>

          <div className="grid items-start gap-3 xl:grid-cols-12">
            <Panel className="xl:col-span-4" title="Evaluation Criteria & Scoring">
              <table className="w-full text-left text-[12px]">
                <thead className="text-[11px] text-slate-400"><tr>{['#', 'Criteria', 'Weight (%)', 'Score', 'Weighted Score', 'Status'].map((heading) => <th key={heading} className="pb-2 font-semibold">{heading}</th>)}</tr></thead>
                <tbody>
                  {criteria.map(([label, weight, value, status], index) => (
                    <tr key={label} className="border-t border-slate-100">
                      <td className="py-2 text-slate-400">{index + 1}</td>
                      <td className="py-2 font-semibold text-slate-800">{label}</td>
                      <td className="py-2">{weight}</td>
                      <td className="py-2 font-semibold">{opportunity ? value : '—'}</td>
                      <td className="py-2">{opportunity ? ((weight * value) / 100).toFixed(1) : '—'}</td>
                      <td className="py-2"><Pill className={statusTone(opportunity ? status : '—')}>{opportunity ? status : '—'}</Pill></td>
                    </tr>
                  ))}
                  <tr className="border-t border-slate-200 font-black text-slate-900">
                    <td className="py-2" />
                    <td className="py-2">Total</td>
                    <td className="py-2">100</td>
                    <td className="py-2">—</td>
                    <td className="py-2">{opportunity ? weighted.toFixed(1) : '—'}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </Panel>
            <Panel className="xl:col-span-5" title="Pricing Scenario Comparison (DLE Proposal)" action={<button type="button" onClick={() => setTab('Scenario Comparison')} className="text-[12px] font-semibold text-blue-700">View Details →</button>}>
              <table className="w-full text-left text-[12px]">
                <thead className="text-[11px] text-slate-400"><tr>{['Parameter', 'Base Case', 'Optimistic', 'Downside', 'Stress'].map((heading) => <th key={heading} className="pb-2 font-semibold">{heading}</th>)}</tr></thead>
                <tbody>
                  {priceRows.map(([label, base]) => (
                    <tr key={label} className="border-t border-slate-100">
                      <td className="py-2 text-slate-600">{label}</td>
                      <td className="py-2 font-semibold text-slate-800">{base}</td>
                      <td className="py-2 text-slate-400">—</td>
                      <td className="py-2 text-slate-400">—</td>
                      <td className="py-2 text-slate-400">—</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
            <Panel className="xl:col-span-3" title="Risk Assessment Summary" action={<button type="button" onClick={() => setTab('Risk Assessment')} className="text-[12px] font-semibold text-blue-700">View All →</button>}>
              <div className="flex items-center gap-3">
                <RiskDonut high={high} medium={medium} low={low} />
                <div className="space-y-1 text-[12px]">
                  <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-rose-500" /> High <b className="ml-auto">{high}</b></div>
                  <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-amber-500" /> Medium <b>{medium}</b></div>
                  <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Low <b>{low}</b></div>
                </div>
              </div>
              <div className="mt-3 text-[12px] font-bold text-slate-700">Top Risks</div>
              {risks.length === 0 ? <p className="py-4 text-center text-sm text-slate-500">No risks have been logged.</p> : risks.slice(0, 4).map((item) => {
                const level = levelOf(item);
                return (
                  <div key={item.id} className="flex items-center justify-between gap-2 border-t border-slate-100 py-2 text-[12px]">
                    <span className="truncate font-semibold text-slate-800">{item.title}</span>
                    <Pill className={statusTone(level)}>{level === 'Open' ? (item.status || 'Open') : level}</Pill>
                  </div>
                );
              })}
            </Panel>
            <Panel className="xl:col-span-4" title="Evaluation Tasks" action={<span className="text-[12px] font-semibold text-blue-700">View All →</span>}>
              <table className="w-full text-left text-[12px]">
                <thead className="text-[11px] text-slate-400"><tr>{['S/N', 'Task', 'Assigned To', 'Due Date', 'Status'].map((heading) => <th key={heading} className="pb-2 font-semibold">{heading}</th>)}</tr></thead>
                <tbody>
                  {tasks.length === 0 ? <tr><td colSpan={5} className="py-6 text-center text-slate-500">No evaluation tasks have been assigned.</td></tr> : tasks.slice(0, 6).map((item, index) => (
                    <tr key={item.id} className="border-t border-slate-100">
                      <td className="py-2 text-slate-400">{index + 1}</td>
                      <td className="py-2 font-semibold text-slate-800">{item.title}</td>
                      <td className="py-2">{item.assignee || '—'}</td>
                      <td className="py-2">{formatWhen(item.dueAt)}</td>
                      <td className="py-2"><Pill className={statusTone(item.status || 'Open')}>{item.status || 'Open'}</Pill></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
            <Panel className="xl:col-span-5" title="Departmental Comments" action={<button type="button" onClick={() => setTab('Team & Comments')} className="text-[12px] font-semibold text-blue-700">View All →</button>}>
              <Comments approvals={approvals} />
            </Panel>
            <Panel className="xl:col-span-3" title="Evaluation Recommendation">
              <div className={`mb-3 flex items-start gap-2 rounded-xl p-3 text-[12px] ${ready ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
                <Trophy className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <div className="font-black">{ready ? 'Proceed to Approval' : opportunity ? 'Review Required' : 'No evaluation yet'}</div>
                  <p className="mt-1 leading-5">{opportunity ? `Readiness is ${overall}/100 from the saved documents, prices and risks.` : 'Open an opportunity to score this tender.'}</p>
                </div>
              </div>
              <textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Recommendation note" className="mb-2 h-16 w-full rounded-lg border border-slate-200 p-2 text-[12px]" />
              <div className="grid gap-2">
                <button type="button" disabled={!opportunity} onClick={() => decide('APPROVE')} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">Proceed to Approval</button>
                <button type="button" disabled={!opportunity} onClick={() => decide('RETURN')} className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">Return for Revision</button>
                <button type="button" disabled={!opportunity} onClick={() => decide('NO-BID')} className="rounded-lg bg-rose-500 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">Recommend No-Bid</button>
              </div>
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}

function statusTone(status: string) {
  if (/track|accept|healthy|compliant|recommend|complete|uploaded|low/i.test(status)) return 'bg-emerald-50 text-emerald-700';
  if (/progress|medium/i.test(status)) return 'bg-blue-50 text-blue-700';
  if (/manageable|upcoming|pending/i.test(status)) return 'bg-amber-50 text-amber-700';
  if (/review|high|not started|no-bid|reject/i.test(status)) return 'bg-rose-50 text-rose-600';
  return 'bg-slate-100 text-slate-500';
}

function Panel({ title, action, children, className = '' }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-[14px] font-black text-slate-900">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function RiskDonut({ high, medium, low }: { high: number; medium: number; low: number }) {
  const total = high + medium + low;
  const radius = 30;
  const circumference = 2 * Math.PI * radius;
  const parts = [
    { value: high, color: '#ef4444' },
    { value: medium, color: '#f59e0b' },
    { value: low, color: '#22c55e' },
  ];
  let cursor = 0;
  return (
    <svg viewBox="0 0 88 88" className="h-24 w-24 shrink-0" aria-hidden="true">
      <circle cx="44" cy="44" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="10" />
      {parts.map((part) => {
        const length = total ? (part.value / total) * circumference : 0;
        const node = length ? <circle key={part.color} cx="44" cy="44" r={radius} fill="none" stroke={part.color} strokeWidth="10" strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-cursor} transform="rotate(-90 44 44)" /> : null;
        cursor += length;
        return node;
      })}
      <text x="44" y="42" textAnchor="middle" fontSize="16" fontWeight="800" fill="#0f172a">{total}</text>
      <text x="44" y="54" textAnchor="middle" fontSize="8" fill="#94a3b8">Total Risks</text>
    </svg>
  );
}

function Comments({ approvals }: { approvals: Array<{ id: string; actor: string; stage: string; comments: string; decision: string; createdAt: string }> }) {
  if (approvals.length === 0) return <p className="py-4 text-center text-sm text-slate-500">No departmental comments yet.</p>;
  return (
    <div>
      {approvals.slice(0, 5).map((item) => {
        const initials = (item.actor || '—').split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('');
        return (
          <div key={item.id} className="flex gap-2 border-t border-slate-100 py-2 text-[12px] first:border-0">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[11px] font-black text-blue-700">{initials}</span>
            <div className="min-w-0">
              <div className="font-bold text-slate-800">{item.actor || '—'} <span className="font-semibold text-slate-400">{item.stage}</span> <span className="font-normal text-slate-400">{formatWhen(item.createdAt)}</span></div>
              <p className="text-slate-600">{item.comments || item.decision}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RiskList({ risks }: { risks: TenderItem[] }) {
  if (risks.length === 0) return <p className="text-sm text-slate-500">No risks have been logged.</p>;
  return (
    <table className="w-full text-left text-[13px]">
      <thead className="text-[11px] uppercase text-slate-400"><tr>{['Risk', 'Owner', 'Due', 'Status'].map((heading) => <th key={heading} className="py-2 font-semibold">{heading}</th>)}</tr></thead>
      <tbody>{risks.map((item) => <tr key={item.id} className="border-t border-slate-100"><td className="py-2 font-semibold">{item.title}</td><td className="py-2">{item.assignee || '—'}</td><td className="py-2">{formatWhen(item.dueAt)}</td><td className="py-2">{item.status || levelOf(item)}</td></tr>)}</tbody>
    </table>
  );
}

function AuditList({ events }: { events: Array<{ id: number; action: string; actor: string; details: string; createdAt: string }> }) {
  if (events.length === 0) return <p className="text-sm text-slate-500">No activity has been recorded.</p>;
  return <ul className="divide-y divide-slate-100 text-sm">{events.map((event) => <li key={event.id} className="py-2"><b>{event.action}</b> · {event.actor} · {event.details} · {formatWhen(event.createdAt)}</li>)}</ul>;
}
