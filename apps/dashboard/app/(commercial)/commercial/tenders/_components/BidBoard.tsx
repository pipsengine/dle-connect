'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import {
  BadgeCheck,
  Calculator,
  Calendar,
  CalendarClock,
  ChartGantt,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  FileSpreadsheet,
  FileStack,
  FileText,
  LayoutGrid,
  ListChecks,
  MapPin,
  MessageSquare,
  Pencil,
  Shield,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { TenderDocument, TenderLine, TenderOpportunity } from '@/lib/commercial/tender-types';
import { daysUntil, plainNaira, workspaceStepIndex } from '@/lib/commercial/tender-present';
import { formatWhen, money } from './tender-api';
import { OpportunityModal } from './OpportunityModal';
import { Pill } from './tender-widgets';
import { useTenderRecord } from './use-tender-record';

const BID_STAGES = ['Enquiry', 'Qualification', 'Bid Preparation', 'Evaluation', 'Approvals', 'Submission', 'Negotiation', 'Award'] as const;
const STAGE_FROM_RANK = [0, 1, 2, 3, 5, 6, 7, 7] as const;

const TABS: Array<{ id: string; icon: LucideIcon }> = [
  { id: 'Overview', icon: LayoutGrid },
  { id: 'Technical Proposal', icon: FileText },
  { id: 'BOQ & Costing', icon: Calculator },
  { id: 'Commercial Proposal', icon: FileSpreadsheet },
  { id: 'Contract Documents', icon: FileStack },
  { id: 'Resource Plan', icon: Users },
  { id: 'Compliance Matrix', icon: ListChecks },
  { id: 'Team & Tasks', icon: Users },
  { id: 'Timeline', icon: ChartGantt },
  { id: 'Audit Trail', icon: ClipboardList },
];

const CHECKLIST: Array<{ label: string; group: 'technical' | 'boq' | 'commercial' | 'contract'; token: string }> = [
  { label: 'Letter of Invitation / Tender Document', group: 'contract', token: 'invitation' },
  { label: 'Technical Proposal', group: 'technical', token: 'technical' },
  { label: 'BOQ & Cost Estimate', group: 'boq', token: 'boq' },
  { label: 'Commercial Proposal', group: 'commercial', token: 'commercial' },
  { label: 'Project Execution Plan', group: 'technical', token: 'execution' },
  { label: 'Method Statements', group: 'technical', token: 'method' },
  { label: 'HSE Plan', group: 'technical', token: 'hse' },
  { label: 'Quality Plan', group: 'technical', token: 'quality' },
  { label: 'Company Profile & Legal Documents', group: 'contract', token: 'profile' },
  { label: 'Financial Statements', group: 'commercial', token: 'financial' },
];

const naira = (value: number) => `₦ ${plainNaira(value)}`;
const percent = (done: number, total: number) => (total ? Math.round((done / total) * 100) : 0);

const matchDoc = (documents: TenderDocument[], token: string) => documents.find((doc) => `${doc.category} ${doc.fileName}`.toLowerCase().includes(token));

const dateTone = (value: string) => {
  if (!value) return { label: '—', className: 'bg-slate-100 text-slate-500' };
  const left = daysUntil(value);
  if (left == null) return { label: 'Open', className: 'bg-slate-100 text-slate-500' };
  if (left < 0) return { label: 'Completed', className: 'bg-emerald-50 text-emerald-700' };
  if (left <= 90) return { label: `${left} days left`, className: 'bg-rose-50 text-rose-600' };
  return { label: 'Upcoming', className: 'bg-amber-50 text-amber-700' };
};

const statusTone = (status: string) => {
  if (status === 'Uploaded' || status === 'Completed') return 'bg-emerald-50 text-emerald-700';
  if (status === 'In Progress') return 'bg-blue-50 text-blue-700';
  if (status === 'Not Started') return 'bg-rose-50 text-rose-600';
  return 'bg-slate-100 text-slate-500';
};

export function BidBoard() {
  const record = useTenderRecord();
  const [tab, setTab] = useState('Overview');
  const [actionsOpen, setActionsOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const opportunity = record.opportunity;
  const documents = record.detail?.documents || [];
  const lines = record.detail?.lines || [];
  const items = record.detail?.items || [];
  const approvals = record.detail?.approvals || [];
  const awards = record.detail?.awards || [];
  const rank = opportunity ? workspaceStepIndex(opportunity) : null;
  const step = rank == null ? null : (rank === 3 && approvals.length > 0 ? 4 : STAGE_FROM_RANK[rank]);
  const stageLabel = step == null ? '' : BID_STAGES[step];
  const days = opportunity ? daysUntil(opportunity.submissionDeadline || opportunity.closingDate) : null;

  const checklist = CHECKLIST.map((item) => ({ ...item, document: matchDoc(documents, item.token) }));
  const uploaded = checklist.filter((item) => item.document).length;
  const technical = checklist.filter((item) => item.group === 'technical');
  const commercialDocs = checklist.filter((item) => item.group === 'commercial');
  const technicalDone = technical.filter((item) => item.document).length;
  const commercialDone = commercialDocs.filter((item) => item.document).length;
  const pricedLines = lines.filter((line) => line.unitCost > 0 || line.sell > 0);
  const boqDone = lines.length ? pricedLines.length : (checklist.find((item) => item.group === 'boq')?.document ? 1 : 0);
  const boqTotal = lines.length || (checklist.some((item) => item.group === 'boq') ? 1 : 0);
  const compliance = items.filter((item) => /comply|compliance/i.test(item.kind));
  const complianceDone = compliance.filter((item) => /done|complete|closed|answer|uploaded/i.test(item.status)).length;
  const scores = [
    percent(technicalDone, technical.length),
    percent(boqDone, boqTotal),
    percent(commercialDone, commercialDocs.length),
    percent(uploaded, checklist.length),
    percent(complianceDone, compliance.length),
  ];
  const overall = Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length);
  const priced = lines.reduce((sum, line) => sum + line.quantity * line.unitCost, 0);
  const sell = lines.reduce((sum, line) => sum + line.sell, 0);
  const direct = lines.filter((line) => !/indirect|prelim|contingen|fee|management/i.test(`${line.section} ${line.description}`));
  const groups = [
    ['Direct Cost', direct],
    ['Indirect Cost', lines.filter((line) => /indirect/i.test(`${line.section} ${line.description}`))],
    ['Preliminaries', lines.filter((line) => /prelim/i.test(`${line.section} ${line.description}`))],
    ['Contingency', lines.filter((line) => /contingen/i.test(`${line.section} ${line.description}`))],
    ['Management Fee', lines.filter((line) => /fee|management/i.test(`${line.section} ${line.description}`))],
  ] as const;
  const directCost = direct.reduce((sum, line) => sum + line.quantity * line.unitCost, 0);
  const groupedCost = groups.slice(1).reduce((sum, [, matched]) => sum + matched.reduce((inner, line) => inner + line.quantity * line.unitCost, 0), 0);
  const ungrouped = Math.max(priced - directCost - groupedCost, 0);

  const keyDates: Array<{ label: string; value: string; icon: LucideIcon; tint: string }> = [
    { label: 'Tender Briefing', value: opportunity?.invitationDate || '', icon: Calendar, tint: 'bg-blue-50 text-blue-600' },
    { label: 'Site Visit', value: opportunity?.siteVisitDate || '', icon: MapPin, tint: 'bg-emerald-50 text-emerald-600' },
    { label: 'Questions / Clarifications', value: opportunity?.clarificationDeadline || '', icon: MessageSquare, tint: 'bg-amber-50 text-amber-600' },
    { label: 'Submission Deadline', value: opportunity?.submissionDeadline || opportunity?.closingDate || '', icon: CalendarClock, tint: 'bg-rose-50 text-rose-500' },
    { label: 'Evaluation Period', value: '', icon: ClipboardList, tint: 'bg-violet-50 text-violet-600' },
    { label: 'Award Expected', value: awards[0]?.awardDate || '', icon: BadgeCheck, tint: 'bg-sky-50 text-sky-600' },
  ];

  const metrics = [
    { label: 'Overall Progress', value: `${overall}%`, note: overall === 100 ? 'Completed' : overall ? 'In Progress' : 'Not Started', progress: overall, icon: null as LucideIcon | null, tint: 'bg-white', iconTint: '' },
    { label: 'Technical Proposal', value: `${technicalDone} / ${technical.length}`, note: `${percent(technicalDone, technical.length)}% completed`, progress: percent(technicalDone, technical.length), icon: Shield, tint: 'bg-[#eef5ff]', iconTint: 'bg-blue-100 text-blue-600' },
    { label: 'BOQ & Cost Estimate', value: `${boqDone} / ${boqTotal}`, note: `${percent(boqDone, boqTotal)}% completed`, progress: percent(boqDone, boqTotal), icon: FileText, tint: 'bg-[#eefbf3]', iconTint: 'bg-emerald-100 text-emerald-600' },
    { label: 'Commercial Proposal', value: `${commercialDone} / ${commercialDocs.length}`, note: `${percent(commercialDone, commercialDocs.length)}% completed`, progress: percent(commercialDone, commercialDocs.length), icon: FileSpreadsheet, tint: 'bg-[#fff8eb]', iconTint: 'bg-amber-100 text-amber-600' },
    { label: 'Contract Documents', value: `${uploaded} / ${checklist.length}`, note: `${percent(uploaded, checklist.length)}% completed`, progress: percent(uploaded, checklist.length), icon: FileStack, tint: 'bg-[#f5f0ff]', iconTint: 'bg-violet-100 text-violet-600' },
    { label: 'Compliance Requirements', value: `${complianceDone} / ${compliance.length}`, note: `${percent(complianceDone, compliance.length)}% completed`, progress: percent(complianceDone, compliance.length), icon: Shield, tint: 'bg-[#fff1f2]', iconTint: 'bg-rose-100 text-rose-500' },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-slate-400">
        <div>Tender Management <span className="px-1">›</span> <Link href="/commercial/tenders/workspace" className="hover:text-slate-700">Tender Workspace</Link> <span className="px-1">›</span> <span className="font-semibold text-slate-600">Bid Preparation</span></div>
        {record.rows.length > 1 ? (
          <select value={record.selectedId} onChange={(event) => record.setSelectedId(event.target.value)} className="h-8 max-w-[280px] rounded-lg border border-slate-200 bg-white px-2 text-[12px] font-semibold text-slate-600" aria-label="Open opportunity">
            {record.rows.map((row) => <option key={row.id} value={row.id}>{row.referenceNo} · {row.title}</option>)}
          </select>
        ) : null}
      </div>
      {record.error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{record.error}</div> : null}

      <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#2563eb] text-white shadow-sm"><FileText className="h-6 w-6" /></span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-[22px] font-black tracking-tight text-slate-950">{opportunity?.title || (record.loading ? 'Loading bid preparation…' : 'No opportunity is open')}</h1>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">{opportunity?.tenderType || '—'}</span>
              </div>
              <p className="mt-1 text-[12px] text-slate-500">
                Client: <b className="font-semibold text-slate-700">{opportunity?.clientName || '—'}</b><span className="px-1.5 text-slate-300">|</span>Ref: <b className="font-semibold text-slate-700">{opportunity?.referenceNo || '—'}</b><span className="px-1.5 text-slate-300">|</span>Sector: <b className="font-semibold text-slate-700">{opportunity?.category || '—'}</b><span className="px-1.5 text-slate-300">|</span>Estimated Value: <b className="font-semibold text-slate-700">{opportunity ? money(opportunity.estimatedValue, opportunity.currency) : '—'}</b>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex h-11 items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 text-[12px] shadow-sm">
              <span className="text-amber-700/70">Tender Status</span>
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              <span className="font-bold text-amber-700">{stageLabel || '—'}</span>
            </div>
            <div className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 shadow-sm">
              <CalendarClock className="h-4 w-4 text-slate-400" />
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
                  <button type="button" className="block w-full px-3 py-2 text-left hover:bg-slate-50" onClick={() => { setEditing(true); setActionsOpen(false); }}>{opportunity ? 'Edit opportunity' : 'New opportunity'}</button>
                  <Link href={opportunity ? `/commercial/tenders/workspace?id=${opportunity.id}` : '/commercial/tenders/workspace'} className="block px-3 py-2 hover:bg-slate-50" onClick={() => setActionsOpen(false)}>Open workspace</Link>
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <ol className="mt-5 flex gap-1 overflow-x-auto pb-1">
          {BID_STAGES.map((label, index) => {
            const state = step == null ? 'Pending' : index < step ? 'Completed' : index === step ? 'In Progress' : 'Pending';
            const tone = state === 'Completed' ? 'bg-emerald-500 text-white' : state === 'In Progress' ? 'bg-[#2563eb] text-white' : 'bg-slate-100 text-slate-400';
            return (
              <li key={label} className="flex min-w-[118px] flex-1 items-start gap-1">
                <div className="min-w-0">
                  <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-black ${tone}`}>{state === 'Completed' ? <Check className="h-3.5 w-3.5" /> : index + 1}</span>
                  <div className="mt-1 whitespace-nowrap text-[12px] font-bold text-slate-800">{label}</div>
                  <div className={`whitespace-nowrap text-[11px] font-semibold ${state === 'Completed' ? 'text-emerald-600' : state === 'In Progress' ? 'text-blue-600' : 'text-slate-400'}`}>{state}</div>
                </div>
                {index < BID_STAGES.length - 1 ? <ChevronRight className="mt-1.5 h-4 w-4 shrink-0 text-slate-300" /> : null}
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

      {opportunity && tab !== 'Overview' ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {tab === 'BOQ & Costing' ? <LineTable lines={lines} /> : null}
          {tab === 'Team & Tasks' ? <TeamPanel opportunity={opportunity} /> : null}
          {tab === 'Timeline' || tab === 'Audit Trail' ? <AuditList events={record.detail?.audit || []} /> : null}
          {tab === 'Compliance Matrix' ? <ItemList items={compliance} empty="No compliance items have been logged." /> : null}
          {tab === 'Resource Plan' ? <p className="text-sm text-slate-600">{opportunity.teamNotes || 'No resource plan has been saved.'}</p> : null}
          {!['BOQ & Costing', 'Team & Tasks', 'Timeline', 'Audit Trail', 'Compliance Matrix', 'Resource Plan'].includes(tab) ? (
            documents.filter((doc) => tab === 'Contract Documents' || `${doc.category} ${doc.fileName}`.toLowerCase().includes(tab.split(' ')[0].toLowerCase())).length
              ? documents.filter((doc) => tab === 'Contract Documents' || `${doc.category} ${doc.fileName}`.toLowerCase().includes(tab.split(' ')[0].toLowerCase())).map((doc) => <a key={doc.id} className="block py-1 text-sm font-semibold text-blue-700" href={`/api/commercial/tenders?resource=document&documentId=${doc.id}`}>{doc.fileName}</a>)
              : <p className="text-sm text-slate-500">No documents in this tab.</p>
          ) : null}
        </section>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            {metrics.map((item) => {
              const Icon = item.icon;
              return (
              <article key={item.label} className={`rounded-2xl border border-slate-200 px-3 py-3 shadow-sm ${item.tint}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-semibold text-slate-500">{item.label}</div>
                    <div className="mt-1 text-[20px] font-black leading-none text-slate-950">{item.value}</div>
                    <div className={`mt-1 text-[11px] font-semibold ${item.label === 'Overall Progress' ? 'text-emerald-600' : 'text-slate-400'}`}>{item.note}</div>
                  </div>
                  {Icon ? <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${item.iconTint}`}><Icon className="h-4 w-4" /></span> : <Donut value={item.progress} />}
                </div>
                {item.label === 'Overall Progress' ? null : <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/80"><div className="h-1.5 rounded-full bg-[#3b82f6]" style={{ width: `${item.progress}%` }} /></div>}
              </article>
              );
            })}
          </div>

          <div className="grid items-start gap-3 xl:grid-cols-12">
            <Panel className="xl:col-span-4" title="Key Information" action={<button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-1 text-[12px] font-semibold text-blue-700"><Pencil className="h-3.5 w-3.5" /> Edit</button>}>
              <dl className="text-[13px]">
                {([
                  ['Opportunity Title', opportunity?.title || '—'],
                  ['Client', opportunity?.clientName || '—'],
                  ['Reference No.', opportunity?.referenceNo || '—'],
                  ['Tender Type', opportunity?.tenderType || '—'],
                  ['Sector', opportunity?.category || '—'],
                  ['Location', [opportunity?.projectLocation || opportunity?.location, opportunity?.site].filter(Boolean).join(', ') || '—'],
                  ['Estimated Value', opportunity ? money(opportunity.estimatedValue, opportunity.currency) : '—'],
                  ['Tendering Authority', opportunity?.clientName || '—'],
                  ['Submission Deadline', opportunity ? `${formatWhen(opportunity.submissionDeadline || opportunity.closingDate)}${days == null ? '' : ` (${days} days)`}` : '—'],
                  ['Project Duration', opportunity?.contractDuration ? `${opportunity.contractDuration} ${opportunity.durationUnit || 'Months'}` : '—'],
                  ['Project Manager', opportunity?.ownerName || '—'],
                  ['Created Date', opportunity ? formatWhen(opportunity.createdAt) : '—'],
                  ['Last Updated', opportunity ? formatWhen(opportunity.updatedAt) : '—'],
                ] as Array<[string, string]>).map(([label, value]) => (
                  <div key={label} className="flex items-start justify-between gap-4 border-b border-slate-50 py-2 last:border-0">
                    <dt className="text-slate-400">{label}</dt>
                    <dd className={`max-w-[58%] text-right font-semibold ${label === 'Submission Deadline' && days != null ? 'text-rose-600' : 'text-slate-800'}`}>{value || '—'}</dd>
                  </div>
                ))}
              </dl>
            </Panel>
            <Panel className="xl:col-span-5" title="Document Checklist" action={<button type="button" onClick={() => setTab('Contract Documents')} className="text-[12px] font-semibold text-blue-700">View All →</button>}>
              <table className="w-full text-left text-[12px]">
                <thead className="text-[11px] text-slate-400"><tr>{['#', 'Document / Requirement', 'Status', 'Version', 'Upload Date'].map((heading) => <th key={heading} className="pb-2 font-semibold">{heading}</th>)}</tr></thead>
                <tbody>
                  {checklist.map((item, index) => {
                    const status = item.document ? 'Uploaded' : 'Not Started';
                    return (
                      <tr key={item.label} className="border-t border-slate-100">
                        <td className="py-2 text-slate-400">{index + 1}</td>
                        <td className="py-2 font-semibold text-slate-800">{item.label}</td>
                        <td className="py-2"><Pill className={statusTone(status)}>{status}</Pill></td>
                        <td className="py-2 text-slate-500">—</td>
                        <td className="py-2 text-slate-500">{item.document ? formatWhen(item.document.uploadedAt) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Panel>
            <div className="space-y-3 xl:col-span-3">
              <Panel title="Key Dates" action={<button type="button" onClick={() => setTab('Timeline')} className="text-[12px] font-semibold text-blue-700">View All →</button>}>
                {keyDates.map((item) => {
                  const tone = dateTone(item.value);
                  const Icon = item.icon;
                  return (
                    <div key={item.label} className="flex items-center gap-2 border-b border-slate-50 py-2 last:border-0">
                      <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${item.tint}`}><Icon className="h-4 w-4" /></span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12px] font-semibold text-slate-800">{item.label}</div>
                        <div className="text-[11px] text-slate-400">{item.value ? formatWhen(item.value) : '—'}</div>
                      </div>
                      <Pill className={tone.className}>{tone.label}</Pill>
                    </div>
                  );
                })}
              </Panel>
              <Panel title="Team Members" action={<button type="button" onClick={() => setTab('Team & Tasks')} className="text-[12px] font-semibold text-blue-700">Manage Team →</button>}>
                <TeamPanel opportunity={opportunity} />
              </Panel>
            </div>
            <Panel className="xl:col-span-4" title="BOQ Summary" action={<button type="button" onClick={() => setTab('BOQ & Costing')} className="text-[12px] font-semibold text-blue-700">View Details →</button>}>
              <LineTable lines={lines.slice(0, 5)} />
              <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2 text-[13px]">
                <span className="font-semibold text-slate-500">Total Estimated Cost</span>
                <b className="text-[16px] text-slate-950">{naira(priced)}</b>
              </div>
            </Panel>
            <Panel className="xl:col-span-4" title="Cost Estimate Summary" action={<button type="button" onClick={() => setTab('BOQ & Costing')} className="text-[12px] font-semibold text-blue-700">View Details →</button>}>
              {groups.map(([label, matched]) => {
                const amount = matched.reduce((sum, line) => sum + line.quantity * line.unitCost, 0) + (label === 'Direct Cost' ? ungrouped : 0);
                const share = priced ? Math.round((amount / priced) * 100) : 0;
                return (
                  <div key={label} className="mb-2.5">
                    <div className="mb-1 flex items-center justify-between text-[12px]"><span className="text-slate-600">{label}</span><b className="text-slate-800">{naira(amount)} <span className="font-semibold text-slate-400">{share}%</span></b></div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-[#3b82f6]" style={{ width: `${share}%` }} /></div>
                  </div>
                );
              })}
              <div className="mt-2 text-right text-[13px] font-black text-slate-950">Total Estimated Cost {naira(priced)}</div>
            </Panel>
            <Panel className="xl:col-span-4" title="Commercial Inputs (Target)" action={<button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-1 text-[12px] font-semibold text-blue-700"><Pencil className="h-3.5 w-3.5" /> Edit</button>}>
              <dl className="text-[13px]">
                {([
                  ['Proposed Selling Price', sell ? naira(sell) : opportunity ? money(opportunity.estimatedValue, opportunity.currency) : '—'],
                  ['Expected Gross Margin', sell ? `${naira(sell - priced)} (${sell ? Math.round(((sell - priced) / sell) * 100) : 0}%)` : '—'],
                  ['Project Duration', opportunity?.contractDuration ? `${opportunity.contractDuration} ${opportunity.durationUnit || 'Months'}` : '—'],
                  ['Mobilization Advance', '—'],
                  ['Retention', opportunity ? (opportunity.retentions ? 'Applicable' : '—') : '—'],
                  ['Payment Terms', opportunity?.contractType || '—'],
                ] as Array<[string, string]>).map(([label, value]) => (
                  <div key={label} className="flex items-start justify-between gap-4 border-b border-slate-50 py-2 last:border-0"><dt className="text-slate-400">{label}</dt><dd className="text-right font-semibold text-slate-800">{value}</dd></div>
                ))}
              </dl>
            </Panel>
          </div>
        </div>
      )}

      <OpportunityModal open={editing} initial={opportunity} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); if (opportunity) record.loadDetail(opportunity.id); record.reload(); }} />
    </div>
  );
}

function Donut({ value }: { value: number }) {
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.max(0, Math.min(100, value)) / 100) * circumference;
  return (
    <svg viewBox="0 0 72 72" className="h-14 w-14 shrink-0" aria-hidden="true">
      <circle cx="36" cy="36" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="7" />
      <circle cx="36" cy="36" r={radius} fill="none" stroke="#22c55e" strokeWidth="7" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} transform="rotate(-90 36 36)" />
    </svg>
  );
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

function LineTable({ lines }: { lines: TenderLine[] }) {
  return (
    <table className="w-full text-left text-[12px]">
      <thead className="text-[11px] text-slate-400"><tr>{['#', 'Description', 'Qty', 'Unit', 'Unit Rate (₦)', 'Total (₦)'].map((heading) => <th key={heading} className="pb-2 font-semibold">{heading}</th>)}</tr></thead>
      <tbody>
        {lines.length === 0 ? <tr><td colSpan={6} className="py-6 text-center text-slate-500">No priced lines yet.</td></tr> : lines.map((line, index) => (
          <tr key={line.id} className="border-t border-slate-100">
            <td className="py-2 text-slate-400">{index + 1}</td>
            <td className="py-2 font-semibold text-slate-800">{line.description}</td>
            <td className="py-2">{line.quantity}</td>
            <td className="py-2">{line.unit || '—'}</td>
            <td className="py-2">{plainNaira(line.unitCost)}</td>
            <td className="py-2 font-semibold">{plainNaira(line.quantity * line.unitCost)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TeamPanel({ opportunity }: { opportunity?: TenderOpportunity }) {
  if (!opportunity?.ownerName) return <p className="py-4 text-center text-sm text-slate-500">No team members have been assigned.</p>;
  const initials = opportunity.ownerName.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('');
  return (
    <div className="flex items-center gap-2 py-1.5">
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-[11px] font-black text-blue-700">{initials}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-bold text-slate-800">{opportunity.ownerName}</div>
        <div className="truncate text-[11px] text-slate-400">{opportunity.designation || 'Owner'}</div>
      </div>
      <Pill className="bg-blue-50 text-blue-700">Lead</Pill>
    </div>
  );
}

function ItemList({ items, empty }: { items: Array<{ id: string; title: string; assignee: string; dueAt: string; status: string }>; empty: string }) {
  if (items.length === 0) return <p className="text-sm text-slate-500">{empty}</p>;
  return (
    <table className="w-full text-left text-[13px]">
      <thead className="text-[11px] uppercase text-slate-400"><tr>{['Title', 'Owner', 'Due', 'Status'].map((heading) => <th key={heading} className="py-2 font-semibold">{heading}</th>)}</tr></thead>
      <tbody>{items.map((item) => <tr key={item.id} className="border-t border-slate-100"><td className="py-2 font-semibold">{item.title}</td><td className="py-2">{item.assignee || '—'}</td><td className="py-2">{formatWhen(item.dueAt)}</td><td className="py-2">{item.status}</td></tr>)}</tbody>
    </table>
  );
}

function AuditList({ events }: { events: Array<{ id: number; action: string; actor: string; details: string; createdAt: string }> }) {
  if (events.length === 0) return <p className="text-sm text-slate-500">No activity has been recorded.</p>;
  return <ul className="divide-y divide-slate-100 text-sm">{events.map((event) => <li key={event.id} className="py-2"><b>{event.action}</b> · {event.actor} · {event.details} · {formatWhen(event.createdAt)}</li>)}</ul>;
}
