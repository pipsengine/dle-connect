'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import {
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Circle,
  ClipboardList,
  Clock3,
  FileStack,
  FileText,
  LayoutGrid,
  MessageSquare,
  ScrollText,
  Send,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { TenderDocument } from '@/lib/commercial/tender-types';
import { daysUntil, fileSize, workspaceStepIndex } from '@/lib/commercial/tender-present';
import { formatWhen, money } from './tender-api';
import { Pill } from './tender-widgets';
import { useTenderRecord } from './use-tender-record';

const TABS: Array<{ id: string; icon: LucideIcon }> = [
  { id: 'Submission Overview', icon: LayoutGrid },
  { id: 'Submission Package', icon: FileStack },
  { id: 'Delivery & Acknowledgement', icon: CheckCircle2 },
  { id: 'Tracking & Communication', icon: MessageSquare },
  { id: 'Amendments / Addenda', icon: ScrollText },
  { id: 'Post Submission Activities', icon: ClipboardList },
  { id: 'Audit Trail', icon: Send },
];

const toneFor = (status: string) => {
  if (/submit|receiv|complete|done|approv/i.test(status)) return 'bg-emerald-50 text-emerald-700';
  if (/progress|early/i.test(status)) return 'bg-blue-50 text-blue-700';
  if (/pending|waiting|not submitted/i.test(status)) return 'bg-slate-100 text-slate-500';
  if (/late|fail/i.test(status)) return 'bg-rose-50 text-rose-600';
  return 'bg-amber-50 text-amber-700';
};

export function SubmissionBoard() {
  const record = useTenderRecord();
  const [tab, setTab] = useState('Submission Overview');
  const [actionsOpen, setActionsOpen] = useState(false);
  const opportunity = record.opportunity;
  const documents = record.detail?.documents || [];
  const approvals = record.detail?.approvals || [];
  const awards = record.detail?.awards || [];
  const audit = record.detail?.audit || [];
  const submission = record.detail?.submissions?.[0];
  const addenda = documents.filter((doc) => /addend/i.test(doc.category));
  const rank = opportunity ? workspaceStepIndex(opportunity) : null;
  const days = opportunity ? daysUntil(opportunity.submissionDeadline || opportunity.closingDate) : null;
  const submittedAt = submission ? new Date(submission.submittedAt) : null;
  const deadline = opportunity ? new Date(opportunity.submissionDeadline || opportunity.closingDate) : null;
  const early = submittedAt && deadline && !Number.isNaN(submittedAt.getTime()) && !Number.isNaN(deadline.getTime()) ? Math.round((deadline.getTime() - submittedAt.getTime()) / 86400000) : null;
  const totalBytes = documents.reduce((sum, doc) => sum + doc.sizeBytes, 0);
  const submittedCount = submission ? documents.length : 0;
  const notSubmittedCount = submission ? 0 : documents.length;
  const awarded = Boolean(opportunity && (opportunity.status === 'Awarded' || opportunity.stage === 'Awarded' || awards.length > 0));
  const timeline = [
    { label: 'Final Approval Obtained', detail: approvals.some((item) => item.decision === 'APPROVE') ? 'Approval recorded' : 'No approval recorded', state: approvals.some((item) => item.decision === 'APPROVE') ? 'Completed' : 'Pending', when: approvals.find((item) => item.decision === 'APPROVE')?.createdAt || '', actor: approvals.find((item) => item.decision === 'APPROVE')?.actor || '' },
    { label: 'Submission Package Prepared', detail: documents.length ? `${documents.length} documents on file` : 'No documents uploaded', state: documents.length ? 'Completed' : 'Pending', when: documents[0]?.uploadedAt || '', actor: documents[0]?.uploadedBy || '' },
    { label: 'Submitted to Client', detail: submission ? submission.channel || 'Submission recorded' : 'Not submitted', state: submission ? 'Completed' : 'Pending', when: submission?.submittedAt || '', actor: submission?.submittedBy || '' },
    { label: 'Client Acknowledgement', detail: submission?.receiptReference || 'No receipt reference', state: submission?.receiptReference ? 'Completed' : 'Pending', when: '', actor: '' },
    { label: 'Under Evaluation', detail: submission ? 'Submitted and awaiting outcome' : 'Waiting for submission', state: awarded ? 'Completed' : submission && rank != null && rank >= 3 ? 'In Progress' : 'Pending', when: '', actor: '' },
    { label: 'Evaluation Outcome', detail: awarded ? (opportunity?.status || 'Awarded') : 'Pending client decision', state: awarded ? 'Completed' : 'Pending', when: awards[0]?.awardDate || '', actor: '' },
  ];
  const dates: Array<[string, string]> = [
    ['Clarification Deadline', opportunity?.clarificationDeadline || ''],
    ['Submission Deadline', opportunity?.submissionDeadline || opportunity?.closingDate || ''],
    ['Site Visit', opportunity?.siteVisitDate || ''],
    ['Award Date', awards[0]?.awardDate || ''],
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-slate-400">
        <div>Tender Management <span className="px-1">›</span> <Link href="/commercial/tenders/workspace" className="hover:text-slate-700">Tender Workspace</Link> <span className="px-1">›</span> <span className="font-semibold text-slate-600">Submission & Tracking</span></div>
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
            <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#2563eb] text-white shadow-sm"><Send className="h-6 w-6" /></span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-[22px] font-black tracking-tight text-slate-950">Submission & Tracking</h1>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">{opportunity?.tenderType || '—'}</span>
              </div>
              <p className="text-[12px] text-slate-500">Manage bid submission, track client acknowledgement and monitor tender progress</p>
              <p className="mt-1 text-[12px] text-slate-600">
                <b className="font-semibold text-slate-800">{opportunity?.title || (record.loading ? 'Loading submission…' : 'No opportunity is open')}</b>
                <span className="px-1.5 text-slate-300">|</span>Client: <b className="font-semibold">{opportunity?.clientName || '—'}</b>
                <span className="px-1.5 text-slate-300">|</span>Ref: <b className="font-semibold">{opportunity?.referenceNo || '—'}</b>
                <span className="px-1.5 text-slate-300">|</span>Sector: <b className="font-semibold">{opportunity?.category || '—'}</b>
                <span className="px-1.5 text-slate-300">|</span>Estimated Value: <b className="font-semibold">{opportunity ? money(opportunity.estimatedValue, opportunity.currency) : '—'}</b>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex h-11 items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 text-[12px] shadow-sm">
              <span className="text-amber-700/70">Tender Status</span>
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              <span className="font-bold text-amber-700">{opportunity?.stage || '—'}</span>
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
                <div className="absolute right-0 top-12 z-20 w-48 rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-lg">
                  <Link href={opportunity ? `/commercial/tenders/workspace?id=${opportunity.id}` : '/commercial/tenders/workspace'} className="block px-3 py-2 hover:bg-slate-50" onClick={() => setActionsOpen(false)}>Open workspace</Link>
                </div>
              ) : null}
            </div>
          </div>
        </div>
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

      {tab !== 'Submission Overview' ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {tab === 'Submission Package' ? <PackageTable documents={documents} submitted={Boolean(submission)} /> : null}
          {tab === 'Amendments / Addenda' ? <PackageTable documents={addenda} submitted={Boolean(submission)} /> : null}
          {tab === 'Delivery & Acknowledgement' ? <p className="text-sm text-slate-600">{submission ? `${submission.channel || 'Submission'} · ${submission.receiptReference || 'No acknowledgement'} · ${formatWhen(submission.submittedAt)}` : 'No delivery has been recorded.'}</p> : null}
          {tab === 'Tracking & Communication' || tab === 'Audit Trail' ? <AuditList events={audit} /> : null}
          {tab === 'Post Submission Activities' ? <p className="text-sm text-slate-600">{(record.detail?.items || []).length ? record.detail!.items.map((item) => item.title).join(', ') : 'No post-submission activities have been logged.'}</p> : null}
        </section>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <Metric tint="bg-[#eef5ff]" icon={FileText} iconTint="bg-blue-100 text-blue-600" label="Submission Status" value={submission ? 'Submitted' : 'Not Submitted'} note={submission ? formatWhen(submission.submittedAt) : 'No submission recorded'} extra={submission ? (early == null ? '' : early >= 0 ? 'On time' : 'Late') : ''} />
            <Metric tint="bg-[#eefbf3]" icon={CheckCircle2} iconTint="bg-emerald-100 text-emerald-600" label="Client Acknowledgement" value={submission?.receiptReference ? 'Received' : 'Waiting'} note={submission?.receiptReference || 'No receipt reference'} extra="" />
            <Metric tint="bg-[#fff1f2]" icon={CalendarClock} iconTint="bg-rose-100 text-rose-500" label="Time to Deadline" value={early == null ? (days == null ? '—' : `${days} days`) : early >= 0 ? `${early} days early` : `${Math.abs(early)} days late`} note={opportunity ? formatWhen(opportunity.submissionDeadline || opportunity.closingDate) : '—'} extra="" />
            <Metric tint="bg-[#eefbf3]" icon={FileStack} iconTint="bg-emerald-100 text-emerald-600" label="Total Documents" value={String(documents.length)} note={totalBytes ? fileSize(totalBytes) : '—'} extra="" />
            <Metric tint="bg-[#f5f0ff]" icon={Users} iconTint="bg-violet-100 text-violet-600" label="Submitted By" value={submission?.submittedBy || opportunity?.ownerName || '—'} note={submission ? formatWhen(submission.submittedAt) : 'Not submitted'} extra="" />
          </div>

          <div className="grid items-start gap-3 xl:grid-cols-12">
            <Panel className="xl:col-span-4" title="Submission Timeline">
              <ol className="space-y-3">
                {timeline.map((item, index) => (
                  <li key={item.label} className="flex items-start gap-2">
                    {item.state === 'Completed' ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" /> : item.state === 'In Progress' ? <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-blue-500" /> : <Circle className="mt-0.5 h-5 w-5 shrink-0 text-slate-300" />}
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-bold text-slate-800">{index + 1}. {item.label}</div>
                      <div className="text-[11px] text-slate-400">{item.detail}{item.when ? ` · ${formatWhen(item.when)}` : ''}{item.actor ? ` · ${item.actor}` : ''}</div>
                    </div>
                    <Pill className={toneFor(item.state)}>{item.state}</Pill>
                  </li>
                ))}
              </ol>
            </Panel>
            <Panel className="xl:col-span-4" title="Submission Details">
              <dl className="text-[13px]">
                {([
                  ['Submission Reference', submission?.id || '—'],
                  ['Submission Date', submission ? formatWhen(submission.submittedAt) : '—'],
                  ['Submission Method', submission?.channel || '—'],
                  ['Acknowledgement No.', submission?.receiptReference || '—'],
                  ['Submission Version', '—'],
                  ['Total Documents', String(documents.length)],
                  ['Total Size', totalBytes ? fileSize(totalBytes) : '—'],
                  ['Submitted By', submission?.submittedBy || opportunity?.ownerName || '—'],
                  ['Submission Status', submission ? 'Submitted' : 'Not Submitted'],
                  ['Acknowledgement Status', submission?.receiptReference ? 'Received' : 'Waiting'],
                  ['Expected Evaluation Period', '—'],
                  ['Expected Award Date', awards[0]?.awardDate ? formatWhen(awards[0].awardDate) : '—'],
                  ['Remarks', submission?.notes || '—'],
                ] as Array<[string, string]>).map(([label, value]) => (
                  <div key={label} className="flex items-start justify-between gap-3 border-b border-slate-50 py-1.5 last:border-0">
                    <dt className="text-slate-400">{label}</dt>
                    <dd className="max-w-[58%] text-right font-semibold text-slate-800">{value}</dd>
                  </div>
                ))}
              </dl>
            </Panel>
            <Panel className="xl:col-span-4" title={`Submission Package Documents (${documents.length})`} action={<button type="button" onClick={() => setTab('Submission Package')} className="text-[12px] font-semibold text-blue-700">View All →</button>}>
              <PackageTable documents={documents.slice(0, 8)} submitted={Boolean(submission)} />
            </Panel>
            <Panel className="xl:col-span-5" title="Client Communications" action={<button type="button" onClick={() => setTab('Tracking & Communication')} className="text-[12px] font-semibold text-blue-700">View All →</button>}>
              <table className="w-full text-left text-[12px]">
                <thead className="text-[11px] text-slate-400"><tr>{['Date', 'From / To', 'Subject', 'Type', 'Action'].map((heading) => <th key={heading} className="pb-2 font-semibold">{heading}</th>)}</tr></thead>
                <tbody>
                  {audit.length === 0 ? <tr><td colSpan={5} className="py-6 text-center text-slate-500">No communications have been logged.</td></tr> : audit.slice(0, 5).map((event) => (
                    <tr key={event.id} className="border-t border-slate-100">
                      <td className="py-2">{formatWhen(event.createdAt)}</td>
                      <td className="py-2">{event.actor || '—'}</td>
                      <td className="py-2 font-semibold text-slate-800">{event.details || event.action}</td>
                      <td className="py-2"><Pill className="bg-blue-50 text-blue-700">{event.action}</Pill></td>
                      <td className="py-2 text-slate-400">—</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
            <Panel className="xl:col-span-4" title="Deadlines & Key Dates">
              {dates.map(([label, value]) => {
                const left = value ? daysUntil(value) : null;
                const status = !value ? '—' : left != null && left < 0 ? 'Completed' : left != null && left <= 14 ? `${left} days left` : 'Pending';
                return (
                  <div key={label} className="flex items-center justify-between gap-2 border-b border-slate-50 py-2 text-[12px] last:border-0">
                    <span className="flex items-center gap-2">{status === 'Completed' ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Circle className="h-4 w-4 text-slate-300" />}<span>{label}<span className="block text-slate-400">{value ? formatWhen(value) : '—'}</span></span></span>
                    <Pill className={toneFor(status)}>{status}</Pill>
                  </div>
                );
              })}
            </Panel>
            <Panel className="xl:col-span-3" title="Submission Status Summary">
              <div className="flex items-center gap-4">
                <StatusDonut submitted={submittedCount} pending={0} failed={0} waiting={notSubmittedCount} />
                <ul className="space-y-1 text-[12px]">
                  <li className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Submitted <b>{submittedCount}</b></li>
                  <li className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-rose-500" /> Failed <b>0</b></li>
                  <li className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-amber-500" /> Pending <b>0</b></li>
                  <li className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-slate-300" /> Not Submitted <b>{notSubmittedCount}</b></li>
                </ul>
              </div>
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ tint, icon: Icon, iconTint, label, value, note, extra }: { tint: string; icon: LucideIcon; iconTint: string; label: string; value: string; note: string; extra: string }) {
  return (
    <article className={`rounded-2xl border border-slate-200 px-3 py-3 shadow-sm ${tint}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold text-slate-500">{label}</div>
          <div className="mt-1 truncate text-[18px] font-black text-slate-950">{value}</div>
          <div className="truncate text-[11px] text-slate-500">{note}</div>
          {extra ? <div className="text-[11px] font-semibold text-emerald-600">{extra}</div> : null}
        </div>
        <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconTint}`}><Icon className="h-4 w-4" /></span>
      </div>
    </article>
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

function PackageTable({ documents, submitted }: { documents: TenderDocument[]; submitted: boolean }) {
  return (
    <table className="w-full text-left text-[12px]">
      <thead className="text-[11px] text-slate-400"><tr>{['#', 'Document Name', 'Type', 'Size', 'Status', 'Action'].map((heading) => <th key={heading} className="pb-2 font-semibold">{heading}</th>)}</tr></thead>
      <tbody>
        {documents.length === 0 ? <tr><td colSpan={6} className="py-6 text-center text-slate-500">No documents in the package.</td></tr> : documents.map((doc, index) => (
          <tr key={doc.id} className="border-t border-slate-100">
            <td className="py-2 text-slate-400">{index + 1}</td>
            <td className="py-2 font-semibold text-slate-800">{doc.fileName}</td>
            <td className="py-2">{doc.category || 'General'}</td>
            <td className="py-2">{fileSize(doc.sizeBytes)}</td>
            <td className="py-2"><Pill className={submitted ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}>{submitted ? 'Submitted' : 'Not Submitted'}</Pill></td>
            <td className="py-2"><a className="font-semibold text-blue-700" href={`/api/commercial/tenders?resource=document&documentId=${doc.id}`}>View</a></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function StatusDonut({ submitted, pending, failed, waiting }: { submitted: number; pending: number; failed: number; waiting: number }) {
  const total = submitted + pending + failed + waiting;
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const parts = [
    { value: submitted, color: '#22c55e' },
    { value: failed, color: '#ef4444' },
    { value: pending, color: '#f59e0b' },
    { value: waiting, color: '#cbd5e1' },
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
      <text x="44" y="54" textAnchor="middle" fontSize="8" fill="#94a3b8">Documents</text>
    </svg>
  );
}

function AuditList({ events }: { events: Array<{ id: number; action: string; actor: string; details: string; createdAt: string }> }) {
  if (events.length === 0) return <p className="text-sm text-slate-500">No activity has been recorded.</p>;
  return <ul className="divide-y divide-slate-100 text-sm">{events.map((event) => <li key={event.id} className="py-2"><b>{event.action}</b> · {event.actor} · {event.details} · {formatWhen(event.createdAt)}</li>)}</ul>;
}
