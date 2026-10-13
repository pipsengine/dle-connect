'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  Calendar,
  Check,
  ClipboardList,
  Clock3,
  FileText,
  PieChart,
  ListChecks,
  MoreHorizontal,
  Plus,
  Send,
  Upload,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { TenderBlueprint, TenderDocument, TenderLine } from '@/lib/commercial/tender-types';
import { formatWhen, money, tenderGet, tenderPost } from './tender-api';
import { OpportunityModal } from './OpportunityModal';
import { DocumentCapture, ItemCapture, LineCapture, SubmissionCapture } from './record-capture';
import { BlueprintRegisters } from './BlueprintRegisters';
import { ActingEmployee } from './acting-employee';
import { useTenderRecord } from './use-tender-record';

const STEPS = [
  { title: 'Setup', note: 'Project details' },
  { title: 'Team & Plan', note: 'Assign team and tasks' },
  { title: 'Technical Proposal', note: 'Prepare technical documents' },
  { title: 'Commercial Proposal', note: 'Prepare commercial documents' },
  { title: 'Review & Approval', note: 'Internal review and approvals' },
  { title: 'Submission', note: 'Submit to client' },
] as const;

const TABS = ['Overview', 'Team & Tasks', 'Technical Proposal', 'Commercial Proposal', 'Documents', 'Approvals', 'Submission', 'History'] as const;

const percent = (done: number, total: number) => (total ? Math.round((done / total) * 100) : 0);
const matchDoc = (documents: TenderDocument[], token: string) => documents.some((doc) => `${doc.category} ${doc.fileName}`.toLowerCase().includes(token));

export function BidBoard() {
  const record = useTenderRecord();
  const [tab, setTab] = useState<(typeof TABS)[number]>('Overview');
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const opportunity = record.opportunity;
  const documents = record.detail?.documents || [];
  const lines = record.detail?.lines || [];
  const items = record.detail?.items || [];
  const approvals = record.detail?.approvals || [];
  const submissions = record.detail?.submissions || [];
  const audit = record.detail?.audit || [];
  const tasks = items.filter((item) => /task|team/i.test(item.kind));
  const currency = opportunity?.currency || 'NGN';

  const [draft, setDraft] = useState({ title: '', currency: 'NGN', submissionDeadline: '', strategy: '' });
  const [versionLabel, setVersionLabel] = useState('—');
  useEffect(() => {
    setDraft({
      title: opportunity?.title || '',
      currency: opportunity?.currency || 'NGN',
      submissionDeadline: (opportunity?.submissionDeadline || opportunity?.closingDate || '').slice(0, 10),
      strategy: opportunity?.scopeSummary || '',
    });
    setFormError('');
  }, [opportunity?.id, opportunity?.updatedAt, opportunity?.title, opportunity?.currency, opportunity?.submissionDeadline, opportunity?.closingDate, opportunity?.scopeSummary]);

  useEffect(() => {
    if (!opportunity?.id) {
      setVersionLabel('—');
      return;
    }
    let active = true;
    tenderGet<TenderBlueprint>('blueprint', { id: opportunity.id })
      .then((pack) => {
        if (!active) return;
        const latest = [...(pack.estimates || [])].sort((left, right) => right.version - left.version)[0];
        setVersionLabel(latest ? `${latest.version}.0${latest.label ? ` (${latest.label})` : ''}` : '—');
      })
      .catch(() => { if (active) setVersionLabel('—'); });
    return () => { active = false; };
  }, [opportunity?.id, opportunity?.updatedAt]);

  const technicalDone = matchDoc(documents, 'technical') || documents.some((doc) => /technical/i.test(doc.category));
  const commercialDone = matchDoc(documents, 'commercial') || lines.some((line) => line.unitCost > 0 || line.sell > 0);
  const documentsDone = documents.length > 0;
  const approved = approvals.filter((item) => item.decision === 'APPROVE');
  const managementApproved = approved.some((item) => /management|md|executive/i.test(item.stage));
  const technicalPct = technicalDone ? 100 : 0;
  const commercialPct = commercialDone ? 100 : 0;
  const progressParts = [
    { label: 'Technical Proposal', value: technicalPct, color: '#3b82f6' },
    { label: 'Commercial Proposal', value: commercialPct, color: '#22c55e' },
    { label: 'Required Documents', value: documentsDone ? 100 : 0, color: '#f59e0b' },
    { label: 'Internal Approvals', value: approvals.length ? percent(approved.length, approvals.length) : 0, color: '#ef4444' },
  ];
  const overall = Math.round(progressParts.reduce((sum, item) => sum + item.value, 0) / progressParts.length);

  const step = !opportunity ? null
    : submissions.length ? 5
      : approved.length ? 4
        : commercialDone ? 3
          : technicalDone ? 2
            : tasks.length || opportunity.ownerName ? 1
              : 0;

  const statusLabel = !opportunity ? '—'
    : /award/i.test(`${opportunity.stage} ${opportunity.status}`) ? 'Awarded'
      : submissions.length || /submit/i.test(`${opportunity.stage} ${opportunity.status}`) ? 'Submitted'
        : /bid prep/i.test(opportunity.stage) || opportunity.status === 'Open' ? 'In Preparation'
          : opportunity.stage || opportunity.status || '—';

  const checklist = [
    { label: 'Technical proposal completed', done: technicalDone },
    { label: 'Commercial proposal completed', done: commercialDone },
    { label: 'Required documents uploaded', done: documentsDone },
    { label: 'Internal review completed', done: approvals.length > 0 },
    { label: 'MD approval completed', done: managementApproved },
    { label: 'Submission package finalised', done: documentsDone && commercialDone && technicalDone },
    { label: 'Submitted to client', done: submissions.length > 0 },
  ];

  const team = [
    ...(opportunity?.ownerName ? [{ id: 'owner', name: opportunity.ownerName, role: 'Bid Manager', department: opportunity.department || '—', duty: 'Overall coordination', status: 'Active' }] : []),
    ...tasks.map((item) => ({ id: item.id, name: item.assignee || '—', role: item.title, department: '—', duty: item.details || '—', status: item.status || 'OPEN' })),
  ];

  const saveDetails = async () => {
    if (!opportunity) return;
    setSaving(true);
    setFormError('');
    try {
      await tenderPost({
        action: 'save',
        opportunity: { ...opportunity, title: draft.title || opportunity.title, currency: draft.currency, submissionDeadline: draft.submissionDeadline, scopeSummary: draft.strategy, saveMode: 'submit' },
      });
      await record.loadDetail(opportunity.id);
      await record.reload();
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : 'The bid details were not saved.');
    } finally {
      setSaving(false);
    }
  };

  const quickActions: Array<{ label: string; icon: LucideIcon; tint: string; tab: (typeof TABS)[number] }> = [
    { label: 'Create Team & Assign Tasks', icon: Users, tint: 'bg-rose-50 text-rose-500', tab: 'Team & Tasks' },
    { label: 'Upload Technical Documents', icon: Upload, tint: 'bg-blue-50 text-blue-600', tab: 'Technical Proposal' },
    { label: 'Upload Commercial Documents', icon: FileText, tint: 'bg-emerald-50 text-emerald-600', tab: 'Commercial Proposal' },
    { label: 'Start Internal Review', icon: ClipboardList, tint: 'bg-amber-50 text-amber-600', tab: 'Approvals' },
    { label: 'Submit for Approval', icon: Send, tint: 'bg-violet-50 text-violet-600', tab: 'Approvals' },
    { label: 'View Submission Checklist', icon: ListChecks, tint: 'bg-sky-50 text-sky-600', tab: 'Submission' },
  ];

  return (
    <div className="space-y-3">
      {record.error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{record.error}</div> : null}

      <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#2563eb] text-white shadow-sm"><FileText className="h-5 w-5" /></span>
            <div>
              <h1 className="text-[22px] font-black tracking-tight text-slate-950">Bid Preparation</h1>
              <p className="text-[12px] text-slate-500">Prepare, manage and consolidate DLE&apos;s technical and commercial bid proposals for each tender opportunity.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {record.rows.length > 1 ? (
              <select value={record.selectedId} onChange={(event) => record.setSelectedId(event.target.value)} className="h-9 max-w-[220px] rounded-lg border border-slate-200 bg-white px-2 text-[12px] font-semibold text-slate-600" aria-label="Open opportunity">
                {record.rows.map((row) => <option key={row.id} value={row.id}>{row.referenceNo} · {row.title}</option>)}
              </select>
            ) : null}
            <Link href="/commercial/tenders/opportunities" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-bold text-slate-700"><ArrowLeft className="h-3.5 w-3.5" /> Back to Opportunities</Link>
            <button type="button" onClick={() => { setCreating(true); setEditing(true); }} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#2563eb] px-3 text-[12px] font-bold text-white"><Plus className="h-3.5 w-3.5" /> New Bid</button>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <ol className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {STEPS.map((item, index) => {
            const state = step == null ? 'pending' : index < step ? 'done' : index === step ? 'current' : 'pending';
            return (
              <li key={item.title} className="relative flex min-w-0 items-center gap-2">
                <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-black ${state === 'done' ? 'bg-emerald-500 text-white' : state === 'current' ? 'bg-[#2563eb] text-white shadow-sm' : 'bg-slate-100 text-slate-400'}`}>
                  {state === 'done' ? <Check className="h-3.5 w-3.5" /> : index + 1}
                </span>
                <div className="min-w-0">
                  <div className={`truncate text-[13px] font-bold ${state === 'pending' ? 'text-slate-500' : 'text-slate-800'}`}>{item.title}</div>
                  <div className="truncate text-[11px] text-slate-400">{item.note}</div>
                </div>
                {index < STEPS.length - 1 ? <span className="absolute -right-2 top-3 hidden h-px w-4 bg-slate-200 xl:block" /> : null}
              </li>
            );
          })}
        </ol>
      </section>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.7fr)_320px]">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 text-[14px] font-black text-slate-900"><FileText className="h-4 w-4 text-slate-400" /> Tender Information</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Info label="Reference No." value={opportunity?.referenceNo || '—'} />
            <Info label="Title" value={opportunity?.title || '—'} />
            <Info label="Client" value={opportunity?.clientName || '—'} />
            <Info label="Sector" value={opportunity?.category || '—'} />
            <Info label="Tender Type" value={opportunity?.tenderType || '—'} />
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Info label="External Deadline" value={opportunity ? formatWhen(opportunity.submissionDeadline || opportunity.closingDate) : '—'} />
            <Info label="Internal Deadline" value={opportunity ? formatWhen(opportunity.clarificationDeadline) : '—'} />
            <div>
              <div className="mb-1 text-[11px] font-semibold text-slate-400">Status</div>
              <div className="flex h-10 items-center rounded-lg border border-slate-200 bg-[#f8fafc] px-3">
                <span className={`rounded-md px-2 py-1 text-[12px] font-bold ${statusLabel === 'Awarded' ? 'bg-emerald-50 text-emerald-700' : statusLabel === 'Submitted' ? 'bg-blue-50 text-blue-700' : statusLabel === '—' ? 'bg-slate-100 text-slate-400' : 'bg-amber-50 text-amber-600'}`}>{statusLabel}</span>
              </div>
            </div>
            <div>
              <div className="mb-1 text-[11px] font-semibold text-slate-400">Priority</div>
              <div className="flex h-10 items-center rounded-lg border border-slate-200 bg-[#f8fafc] px-3">
                <span className={`rounded-md px-2 py-1 text-[12px] font-bold ${opportunity?.priority === 'High' ? 'bg-rose-50 text-rose-500' : opportunity?.priority === 'Medium' ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-500'}`}>{opportunity?.priority || '—'}</span>
              </div>
            </div>
          </div>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-2 flex items-center gap-2 text-[14px] font-black text-slate-900"><PieChart className="h-4 w-4 text-slate-400" /> Bid Progress</h2>
          <div className="flex items-center gap-4">
            <ProgressDonut parts={progressParts} center={overall} />
            <ul className="space-y-1.5 text-[12px]">
              {progressParts.map((item) => (
                <li key={item.label} className="flex items-center gap-2 text-slate-600">
                  <span className="h-2 w-2 rounded-full" style={{ background: item.color }} />
                  <span className="flex-1">{item.label}</span>
                  <b className="text-slate-800">{item.value}%</b>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white px-2 shadow-sm">
        {TABS.map((item, index) => (
          <button key={item} type="button" onClick={() => setTab(item)} className={`inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-3 text-[13px] font-semibold ${tab === item ? 'border-[#2563eb] text-[#2563eb]' : 'border-transparent text-slate-500'}`}>
            <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black ${tab === item ? 'bg-[#2563eb] text-white' : 'bg-slate-100 text-slate-400'}`}>{index + 1}</span>
            {item}
          </button>
        ))}
      </div>

      {tab === 'Overview' ? (
        <div className="space-y-3">
          <div className="grid items-start gap-3 xl:grid-cols-12">
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:col-span-6">
              <h2 className="flex items-center gap-2 text-[14px] font-black text-slate-900"><FileText className="h-4 w-4 text-slate-400" /> Bid Details</h2>
              <div className="mt-1"><ActingEmployee /></div>
              <div className="mt-3 grid gap-3 md:grid-cols-12">
                <Field label="Bid Reference No." className="md:col-span-3"><input readOnly value={opportunity?.referenceNo || ''} placeholder="—" className="h-10 w-full rounded-lg border border-slate-200 bg-[#f8fafc] px-3 text-[13px] font-semibold text-slate-800" /></Field>
                <Field label="Version" className="md:col-span-3"><select disabled className="h-10 w-full rounded-lg border border-slate-200 bg-[#f8fafc] px-3 text-[13px] text-slate-500" aria-label="Version"><option>{versionLabel}</option></select></Field>
                <Field label="Bid Title" required className="md:col-span-6"><input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Bid title" className="h-10 w-full rounded-lg border border-slate-200 px-3 text-[13px] text-slate-800" /></Field>
                <Field label="Target Submission Date" required className="md:col-span-6"><input type="date" value={draft.submissionDeadline} onChange={(event) => setDraft({ ...draft, submissionDeadline: event.target.value })} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-[13px] text-slate-800" /></Field>
                <Field label="Bid Currency" className="md:col-span-6">
                  <select value={draft.currency} onChange={(event) => setDraft({ ...draft, currency: event.target.value })} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-[13px] text-slate-800" aria-label="Bid currency">
                    <option value="NGN">NGN - Nigerian Naira</option>
                    <option value="USD">USD - US Dollar</option>
                    <option value="EUR">EUR - Euro</option>
                    <option value="GBP">GBP - British Pound</option>
                  </select>
                </Field>
                <Field label="Bid Strategy / Approach" className="md:col-span-12">
                  <textarea value={draft.strategy} maxLength={2000} onChange={(event) => setDraft({ ...draft, strategy: event.target.value })} placeholder="Enter overall bid strategy, execution approach, key strengths, and win themes..." className="min-h-[76px] w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-slate-800" />
                  <div className="text-right text-[11px] text-slate-400">{draft.strategy.length}/2000</div>
                </Field>
              </div>
              {formError ? <p className="mt-2 text-[12px] text-rose-600">{formError}</p> : null}
              <div className="mt-2 flex justify-end">
                <button type="button" disabled={!opportunity || saving} onClick={saveDetails} className="h-9 rounded-lg bg-[#2563eb] px-4 text-[12px] font-bold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save bid details'}</button>
              </div>
            </section>
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:col-span-3">
              <h2 className="mb-1 flex items-center gap-2 text-[14px] font-black text-slate-900"><Calendar className="h-4 w-4 text-slate-400" /> Key Dates</h2>
              {[
                ['Tender Issue Date', opportunity?.invitationDate],
                ['Clarification Deadline', opportunity?.clarificationDeadline],
                ['Internal Submission Deadline', ''],
                ['Client Submission Deadline', opportunity?.submissionDeadline || opportunity?.closingDate],
                ['Expected Award Date', record.detail?.awards?.[0]?.awardDate],
              ].map(([label, value]) => (
                <div key={String(label)} className="flex items-center justify-between border-b border-slate-50 py-2 text-[12px] last:border-0">
                  <span className="text-slate-500">{label}</span>
                  <b className="text-slate-800">{value ? formatWhen(String(value)) : '—'}</b>
                </div>
              ))}
            </section>
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:col-span-3">
              <h2 className="mb-2 flex items-center gap-2 text-[14px] font-black text-slate-900"><Zap className="h-4 w-4 text-slate-400" /> Quick Actions</h2>
              <div className="space-y-2">
                {quickActions.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button key={item.label} type="button" onClick={() => setTab(item.tab)} className="flex w-full items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-left text-[12px] font-semibold text-slate-700 hover:bg-slate-50">
                      <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${item.tint}`}><Icon className="h-3.5 w-3.5" /></span>
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </section>
          </div>
          <div className="grid items-start gap-3 xl:grid-cols-12">
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:col-span-6">
              <div className="mb-2 flex items-center justify-between"><h2 className="flex items-center gap-2 text-[14px] font-black text-slate-900"><Users className="h-4 w-4 text-slate-400" /> Bid Team</h2><button type="button" onClick={() => setTab('Team & Tasks')} className="text-[12px] font-semibold text-blue-600">View All</button></div>
              <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-[12px]">
                <thead className="text-[11px] uppercase text-slate-400"><tr>{['#', 'Name', 'Role', 'Department', 'Responsibilities', 'Status', 'Action'].map((heading) => <th key={heading} className="pb-2 font-semibold">{heading}</th>)}</tr></thead>
                <tbody>
                  {team.length === 0 ? <tr><td colSpan={7} className="py-6 text-center text-slate-500">No team members have been assigned.</td></tr> : team.map((member, index) => (
                    <tr key={member.id} className="border-t border-slate-100">
                      <td className="py-2 text-slate-400">{index + 1}</td>
                      <td className="py-2">
                        <span className="inline-flex items-center gap-2 font-semibold text-slate-800">
                          <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-black ${AVATAR[index % AVATAR.length]}`}>{initials(member.name)}</span>
                          {member.name}
                        </span>
                      </td>
                      <td className="py-2 text-slate-600">{member.role}</td>
                      <td className="py-2 text-slate-600">{member.department}</td>
                      <td className="py-2 text-slate-600">{member.duty}</td>
                      <td className="py-2"><span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${/active|open/i.test(member.status) ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>{member.status}</span></td>
                      <td className="py-2"><button type="button" onClick={() => setTab('Team & Tasks')} className="text-slate-400" aria-label={`Open ${member.name}`}><MoreHorizontal className="h-4 w-4" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </section>
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:col-span-3">
              <div className="mb-2 flex items-center justify-between"><h2 className="flex items-center gap-2 text-[14px] font-black text-slate-900"><Clock3 className="h-4 w-4 text-slate-400" /> Recent Activities</h2><button type="button" onClick={() => setTab('History')} className="text-[12px] font-semibold text-blue-600">View All</button></div>
              {audit.length === 0 ? <p className="py-6 text-center text-[12px] text-slate-500">No activity has been recorded.</p> : audit.slice(0, 5).map((event) => {
                const ActivityIcon = activityIcon(event.action, event.details);
                return (
                  <div key={event.id} className="flex items-start gap-2 border-t border-slate-50 py-2 text-[12px] first:border-0">
                    <span className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${activityTint(event.action, event.details)}`}><ActivityIcon className="h-3.5 w-3.5" /></span>
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-800">{event.details || event.action}</div>
                      <div className="text-slate-400">{event.actor || '—'} · {activityWhen(event.createdAt)}</div>
                    </div>
                  </div>
                );
              })}
            </section>
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:col-span-3">
              <div className="mb-2 flex items-center justify-between"><h2 className="flex items-center gap-2 text-[14px] font-black text-slate-900"><ListChecks className="h-4 w-4 text-slate-400" /> Submission Checklist</h2><button type="button" onClick={() => setTab('Submission')} className="text-[12px] font-semibold text-blue-600">View All</button></div>
              <ul className="space-y-2">
                {checklist.map((item) => (
                  <li key={item.label} className="flex items-center gap-2 text-[12px] text-slate-700">
                    <span className={`inline-flex h-4 w-4 items-center justify-center rounded-full border ${item.done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300'}`}>{item.done ? <Check className="h-3 w-3" /> : null}</span>
                    {item.label}
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      ) : (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {!opportunity ? <p className="text-sm text-slate-500">Open or create a bid before adding records.</p> : null}
          {opportunity && tab === 'Team & Tasks' ? <><ItemCapture opportunityId={opportunity.id} kind="TASK" onSaved={() => record.loadDetail(opportunity.id)} /><TeamTable team={team} /></> : null}
          {opportunity && tab === 'Technical Proposal' ? <><DocumentCapture opportunityId={opportunity.id} category="Technical Proposal" onSaved={() => record.loadDetail(opportunity.id)} /><DocList documents={documents.filter((doc) => /technical/i.test(`${doc.category} ${doc.fileName}`))} /></> : null}
          {opportunity && tab === 'Commercial Proposal' ? (
            <div className="space-y-3">
              <DocumentCapture opportunityId={opportunity.id} category="Commercial Proposal" onSaved={() => record.loadDetail(opportunity.id)} />
              <LineCapture opportunityId={opportunity.id} currency={currency} onSaved={() => record.loadDetail(opportunity.id)} />
              <LineTable lines={lines} currency={currency} />
              <BlueprintRegisters opportunityId={opportunity.id} focus="bid" />
            </div>
          ) : null}
          {opportunity && tab === 'Documents' ? <><DocumentCapture opportunityId={opportunity.id} category="Bid Document" onSaved={() => record.loadDetail(opportunity.id)} /><DocList documents={documents} /></> : null}
          {opportunity && tab === 'Approvals' ? <ApprovalList approvals={approvals} /> : null}
          {opportunity && tab === 'Submission' ? <><SubmissionCapture opportunityId={opportunity.id} onSaved={() => record.reload()} /><p className="text-sm text-slate-600">{submissions[0] ? `${submissions[0].channel} · ${submissions[0].receiptReference} · ${formatWhen(submissions[0].submittedAt)}` : 'No submission has been recorded.'}</p></> : null}
          {tab === 'History' ? <AuditList events={audit} /> : null}
        </section>
      )}

      <OpportunityModal open={editing} initial={creating ? null : opportunity} onClose={() => { setEditing(false); setCreating(false); }} onSaved={() => { setEditing(false); setCreating(false); record.reload(); }} />
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold text-slate-400">{label}</div>
      <div className="flex h-10 items-center truncate rounded-lg border border-slate-200 bg-[#f8fafc] px-3 text-[13px] font-semibold text-slate-800">{value}</div>
    </div>
  );
}

function Field({ label, required = false, children, className = '' }: { label: string; required?: boolean; children: ReactNode; className?: string }) {
  return <label className={`block text-[12px] font-semibold text-slate-500 ${className}`}>{label}{required ? <span className="text-rose-500"> *</span> : null}<div className="mt-1">{children}</div></label>;
}

const AVATAR = ['bg-blue-100 text-blue-700', 'bg-emerald-100 text-emerald-700', 'bg-amber-100 text-amber-700', 'bg-violet-100 text-violet-700', 'bg-rose-100 text-rose-700'];
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('') || '—';

function activityIcon(action: string, details: string): LucideIcon {
  const text = `${action} ${details}`.toLowerCase();
  if (/team|member|assign/.test(text)) return Users;
  if (/approv|review/.test(text)) return Send;
  if (/commercial|price|line/.test(text)) return FileText;
  if (/clarif/.test(text)) return ClipboardList;
  if (/upload|document|technical/.test(text)) return Upload;
  return Clock3;
}

function activityTint(action: string, details: string) {
  const text = `${action} ${details}`.toLowerCase();
  if (/team|member|assign/.test(text)) return 'bg-violet-50 text-violet-600';
  if (/approv|review/.test(text)) return 'bg-amber-50 text-amber-600';
  if (/commercial|price|line/.test(text)) return 'bg-emerald-50 text-emerald-600';
  if (/clarif/.test(text)) return 'bg-sky-50 text-sky-600';
  return 'bg-blue-50 text-blue-600';
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
  return `${formatWhen(value)}, ${time}`;
}

function ProgressDonut({ parts, center }: { parts: Array<{ value: number; color: string }>; center: number }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const slot = circumference / parts.length;
  const gap = 6;
  return (
    <svg viewBox="0 0 120 120" className="h-[118px] w-[118px] shrink-0">
      <circle cx="60" cy="60" r={radius} fill="none" stroke="#e8eef5" strokeWidth="11" />
      {parts.map((item, index) => {
        const length = Math.max(0, (item.value / 100) * (slot - gap));
        if (!length) return null;
        return (
          <circle
            key={item.color}
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke={item.color}
            strokeWidth="11"
            strokeLinecap="butt"
            strokeDasharray={`${length} ${circumference - length}`}
            strokeDashoffset={-(index * slot)}
            transform="rotate(-90 60 60)"
          />
        );
      })}
      <text x="60" y="58" textAnchor="middle" fill="#0f172a" fontSize="20" fontWeight="800">{center}%</text>
      <text x="60" y="72" textAnchor="middle" fill="#94a3b8" fontSize="7">Overall Completion</text>
    </svg>
  );
}

function TeamTable({ team }: { team: Array<{ id: string; name: string; role: string; department: string; duty: string; status: string }> }) {
  if (team.length === 0) return <p className="text-sm text-slate-500">No team members have been assigned.</p>;
  return <p className="text-sm text-slate-600">{team.map((member) => `${member.name} · ${member.role}`).join(' · ')}</p>;
}

function DocList({ documents }: { documents: TenderDocument[] }) {
  if (documents.length === 0) return <p className="mt-2 text-sm text-slate-500">No documents in this tab.</p>;
  return <ul className="mt-2 divide-y divide-slate-100">{documents.map((doc) => <li key={doc.id} className="py-1"><a className="text-sm font-semibold text-blue-700" href={`/api/commercial/tenders?resource=document&documentId=${doc.id}`}>{doc.fileName}</a></li>)}</ul>;
}

function ApprovalList({ approvals }: { approvals: Array<{ id: string; stage: string; decision: string; actor: string; comments: string; createdAt: string }> }) {
  if (approvals.length === 0) return <p className="text-sm text-slate-500">No approvals have been recorded.</p>;
  return <ul className="divide-y divide-slate-100 text-sm">{approvals.map((item) => <li key={item.id} className="py-2"><b>{item.stage}</b> · {item.decision} · {item.actor} · {item.comments} · {formatWhen(item.createdAt)}</li>)}</ul>;
}

function AuditList({ events }: { events: Array<{ id: number; action: string; actor: string; details: string; createdAt: string }> }) {
  if (events.length === 0) return <p className="text-sm text-slate-500">No activity has been recorded.</p>;
  return <ul className="divide-y divide-slate-100 text-sm">{events.map((event) => <li key={event.id} className="py-2"><b>{event.action}</b> · {event.actor} · {event.details} · {formatWhen(event.createdAt)}</li>)}</ul>;
}

function LineTable({ lines, currency = 'NGN' }: { lines: TenderLine[]; currency?: string }) {
  const symbol = currency || 'NGN';
  return (
    <table className="w-full text-left text-[12px]">
      <thead className="text-[11px] text-slate-400"><tr>{['#', 'Description', 'Qty', 'Unit', `Unit Rate (${symbol})`, `Total (${symbol})`].map((heading) => <th key={heading} className="pb-2 font-semibold">{heading}</th>)}</tr></thead>
      <tbody>
        {lines.length === 0 ? <tr><td colSpan={6} className="py-6 text-center text-slate-500">No priced lines yet.</td></tr> : lines.map((line, index) => (
          <tr key={line.id} className="border-t border-slate-100">
            <td className="py-2 text-slate-400">{index + 1}</td>
            <td className="py-2 font-semibold text-slate-800">{line.description}</td>
            <td className="py-2">{line.quantity}</td>
            <td className="py-2">{line.unit || '—'}</td>
            <td className="py-2">{money(line.unitCost, currency)}</td>
            <td className="py-2 font-semibold">{money(line.quantity * line.unitCost, currency)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
