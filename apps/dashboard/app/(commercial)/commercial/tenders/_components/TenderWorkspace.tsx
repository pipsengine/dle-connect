'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import {
  Building2,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Cog,
  FileStack,
  FileText,
  ChartGantt,
  FolderOpen,
  LayoutGrid,
  ListChecks,
  MapPin,
  MessageSquare,
  Pencil,
  Receipt,
  ScrollText,
  ShieldAlert,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { TenderApproval, TenderAward, TenderDocument, TenderItem, TenderLine, TenderOpportunity, TenderSubmission } from '@/lib/commercial/tender-types';
import { daysUntil, plainNaira, stageSave, WORKSPACE_STAGES, workspaceStepIndex } from '@/lib/commercial/tender-present';
import { formatWhen, money, tenderGet, tenderPost, tenderUpload } from './tender-api';
import { OpportunityModal } from './OpportunityModal';
import { Pill } from './tender-widgets';

type Detail = {
  opportunity: TenderOpportunity;
  documents: TenderDocument[];
  lines: TenderLine[];
  approvals: TenderApproval[];
  submissions: TenderSubmission[];
  awards: TenderAward[];
  items: TenderItem[];
  audit: Array<{ id: number; action: string; actor: string; details: string; createdAt: string }>;
};

const TABS: Array<{ id: string; icon: LucideIcon }> = [
  { id: 'Overview', icon: LayoutGrid },
  { id: 'Details', icon: FileText },
  { id: 'Lots / Packages', icon: FolderOpen },
  { id: 'Compliance Matrix', icon: ListChecks },
  { id: 'Documents', icon: FileStack },
  { id: 'Addenda', icon: ScrollText },
  { id: 'Clarifications (Q&A)', icon: MessageSquare },
  { id: 'Risk & Issues', icon: ShieldAlert },
  { id: 'Financials', icon: Receipt },
  { id: 'Team & Tasks', icon: Users },
  { id: 'Timeline', icon: ChartGantt },
  { id: 'Audit Trail', icon: ClipboardList },
];

const STEP_DATES = ['createdAt', 'invitationDate', 'siteVisitDate', 'clarificationDeadline', 'submissionDeadline', 'closingDate', 'updatedAt', 'updatedAt'] as const;

export function TenderWorkspace() {
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<TenderOpportunity[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [selectedId, setSelectedId] = useState(searchParams.get('id') || '');
  const [tab, setTab] = useState('Overview');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadList = async () => {
    const opportunities = await tenderGet<TenderOpportunity[]>('opportunities');
    setRows(opportunities);
    setSelectedId((current) => current || searchParams.get('id') || opportunities[0]?.id || '');
    return opportunities;
  };

  const loadDetail = async (id: string) => {
    if (!id) {
      setDetail(null);
      return;
    }
    setDetail(await tenderGet<Detail>('opportunity', { id }));
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadList()
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Unable to read the register.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const requested = searchParams.get('id') || '';
    if (requested) setSelectedId(requested);
  }, [searchParams]);

  useEffect(() => {
    if (!selectedId) return;
    loadDetail(selectedId).catch((reason) => setError(reason instanceof Error ? reason.message : 'Unable to open this opportunity.'));
  }, [selectedId]);

  const opportunity = detail?.opportunity;
  const step = opportunity ? workspaceStepIndex(opportunity) : null;
  const stageLabel = step == null ? '' : WORKSPACE_STAGES[step];
  const days = opportunity ? daysUntil(opportunity.submissionDeadline || opportunity.closingDate) : null;
  const clarifications = (detail?.items || []).filter((item) => /clarif|question/i.test(item.kind));
  const risks = (detail?.items || []).filter((item) => /risk|issue/i.test(item.kind));
  const tasks = (detail?.items || []).filter((item) => /task|team/i.test(item.kind));
  const compliance = (detail?.items || []).filter((item) => /comply|compliance|matrix/i.test(item.kind));
  const addenda = (detail?.documents || []).filter((item) => /addend/i.test(item.category));
  const submittedValue = (detail?.lines || []).reduce((sum, line) => sum + line.sell, 0) || (detail?.awards || []).reduce((sum, award) => sum + award.awardedValue, 0);

  const saveStage = async (label: string) => {
    if (!opportunity) return;
    setError('');
    try {
      const next = stageSave(label);
      await tenderPost({ action: 'save', opportunity: { ...opportunity, ...next, saveMode: 'submit' } });
      setNotice('Status saved to DLE_Enterprise.');
      await loadDetail(opportunity.id);
      await loadList();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Status was not saved.');
    }
  };

  const savePriority = async (priority: string) => {
    if (!opportunity) return;
    setError('');
    try {
      await tenderPost({ action: 'save', opportunity: { ...opportunity, priority, stage: opportunity.stage, status: opportunity.status === 'Draft' ? 'Under Review' : opportunity.status, saveMode: 'submit' } });
      await loadDetail(opportunity.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Priority was not saved.');
    }
  };

  const packages = [
    { icon: CircleDollarSign, tint: 'bg-blue-50 text-blue-600', label: 'Estimated Value', value: plainNaira(opportunity?.estimatedValue || 0), badge: opportunity ? `${(detail?.lines || []).length} lines` : '—', badgeClass: 'bg-blue-50 text-blue-700' },
    { icon: Receipt, tint: 'bg-violet-50 text-violet-600', label: 'Submitted Value', value: submittedValue ? plainNaira(submittedValue) : '—', badge: submittedValue ? 'Priced' : 'Pending', badgeClass: 'bg-violet-50 text-violet-700' },
    { icon: UserRound, tint: 'bg-amber-50 text-amber-600', label: 'Contact', value: opportunity?.contactPerson || '—', badge: opportunity?.designation || 'Open', badgeClass: 'bg-emerald-50 text-emerald-700' },
    { icon: MapPin, tint: 'bg-emerald-50 text-emerald-600', label: 'Location', value: opportunity?.projectLocation || opportunity?.location || '—', badge: opportunity?.site || 'Open', badgeClass: 'bg-emerald-50 text-emerald-700' },
    { icon: FileText, tint: 'bg-orange-50 text-orange-600', label: 'Contract', value: opportunity?.contractType || '—', badge: opportunity?.currency || 'NGN', badgeClass: 'bg-amber-50 text-amber-700' },
    { icon: CalendarClock, tint: 'bg-sky-50 text-sky-600', label: 'Duration', value: opportunity?.contractDuration ? `${opportunity.contractDuration} ${opportunity.durationUnit || 'Months'}` : '—', badge: opportunity?.stage || 'Open', badgeClass: 'bg-sky-50 text-sky-700' },
    { icon: ShieldAlert, tint: 'bg-rose-50 text-rose-500', label: 'Bid Decision', value: opportunity?.bidDecision || 'Pending', badge: opportunity?.priority || '—', badgeClass: 'bg-rose-50 text-rose-600' },
    { icon: Building2, tint: 'bg-fuchsia-50 text-fuchsia-600', label: 'Department', value: opportunity?.department || '—', badge: opportunity?.status || 'Open', badgeClass: 'bg-slate-100 text-slate-600' },
  ];
  const deadlineRows = [
    ['Invitation', opportunity?.invitationDate || ''],
    ['Site visit', opportunity?.siteVisitDate || ''],
    ['Clarification', opportunity?.clarificationDeadline || ''],
    ['Submission', opportunity?.submissionDeadline || ''],
    ['Closing', opportunity?.closingDate || ''],
  ] as Array<[string, string]>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-slate-400">
        <div>Tender Management <span className="px-1">›</span> <Link href="/commercial/tenders/opportunities" className="hover:text-slate-700">Tender Opportunities</Link> <span className="px-1">›</span> <span className="font-semibold text-slate-600">Tender Workspace</span></div>
        {rows.length > 1 ? (
          <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} className="h-8 max-w-[280px] rounded-lg border border-slate-200 bg-white px-2 text-[12px] font-semibold text-slate-600" aria-label="Open opportunity">
            {rows.map((row) => <option key={row.id} value={row.id}>{row.referenceNo} · {row.title}</option>)}
          </select>
        ) : null}
      </div>
      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}

      <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#2563eb] text-white shadow-sm"><FileText className="h-6 w-6" /></span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-[22px] font-black tracking-tight text-slate-950">{opportunity?.title || (loading ? 'Loading workspace…' : 'No opportunity is open')}</h1>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">{opportunity?.tenderType || '—'}</span>
              </div>
              <p className="mt-1 text-[12px] text-slate-500">
                Client: <b className="font-semibold text-slate-700">{opportunity?.clientName || '—'}</b><span className="px-1.5 text-slate-300">|</span>Ref: <b className="font-semibold text-slate-700">{opportunity?.referenceNo || '—'}</b><span className="px-1.5 text-slate-300">|</span>Sector: <b className="font-semibold text-slate-700">{opportunity?.category || '—'}</b><span className="px-1.5 text-slate-300">|</span>Estimated Value: <b className="font-semibold text-slate-700">{opportunity ? money(opportunity.estimatedValue, opportunity.currency) : '—'}</b>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-[12px] shadow-sm">
              <span className="text-slate-400">Status</span>
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <select disabled={!opportunity} value={stageLabel} onChange={(event) => saveStage(event.target.value)} className="bg-transparent font-bold text-emerald-700 outline-none disabled:text-slate-400">
                {stageLabel ? null : <option value="">—</option>}
                {WORKSPACE_STAGES.map((label) => <option key={label} value={label}>{label}</option>)}
              </select>
            </label>
            <label className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-[12px] shadow-sm">
              <span className="text-slate-400">Priority</span>
              <span className="h-2 w-2 rounded-full bg-rose-500" />
              <select disabled={!opportunity} value={opportunity?.priority || ''} onChange={(event) => savePriority(event.target.value)} className="bg-transparent font-bold text-rose-600 outline-none disabled:text-slate-400">
                {opportunity ? null : <option value="">—</option>}
                {['High', 'Medium', 'Low'].map((label) => <option key={label}>{label}</option>)}
              </select>
            </label>
            <div className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 shadow-sm">
              <CalendarClock className="h-4 w-4 text-slate-400" />
              <span>
                <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Due Date</span>
                <span className="text-[12px] font-bold text-slate-800">{opportunity ? formatWhen(opportunity.submissionDeadline || opportunity.closingDate) : '—'}</span>
              </span>
              {days != null ? <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-600">{days} days left</span> : null}
            </div>
            <div className="relative">
              <button type="button" onClick={() => setActionsOpen((value) => !value)} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#2563eb] px-4 text-sm font-bold text-white shadow-sm">Actions <ChevronDown className="h-4 w-4" /></button>
              {actionsOpen ? (
                <div className="absolute right-0 top-12 z-20 w-48 rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-lg">
                  <button type="button" className="block w-full px-3 py-2 text-left hover:bg-slate-50" onClick={() => { setEditing(true); setActionsOpen(false); }}>{opportunity ? 'Edit opportunity' : 'New opportunity'}</button>
                  {opportunity ? <button type="button" className="block w-full px-3 py-2 text-left hover:bg-slate-50" onClick={() => tenderPost({ action: 'duplicate', id: opportunity.id }).then(() => loadList())}>Duplicate</button> : null}
                  <Link href="/commercial/tenders/opportunities" className="block px-3 py-2 hover:bg-slate-50">Back to register</Link>
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <ol className="mt-5 flex gap-1 overflow-x-auto pb-1">
          {WORKSPACE_STAGES.map((label, index) => {
            const state = step != null && index < step ? 'Completed' : step != null && index === step ? 'In Progress' : 'Pending';
            const dateKey = STEP_DATES[index];
            const rawDate = opportunity && dateKey !== 'updatedAt' ? opportunity[dateKey] : '';
            const tone = state === 'Completed' ? 'bg-emerald-500 text-white' : state === 'In Progress' ? 'bg-[#2563eb] text-white' : 'bg-slate-100 text-slate-400';
            return (
                <li key={label} className="flex min-w-[124px] flex-1 items-start gap-1">
                <div className="min-w-0">
                  <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-black ${tone}`}>{state === 'Completed' ? <Check className="h-3.5 w-3.5" /> : index + 1}</span>
                  <div className="mt-1 whitespace-nowrap text-[12px] font-bold text-slate-800">{label}</div>
                  <div className={`whitespace-nowrap text-[11px] font-semibold ${state === 'Completed' ? 'text-emerald-600' : state === 'In Progress' ? 'text-blue-600' : 'text-slate-400'}`}>{state}</div>
                  <div className="h-4 text-[10px] text-slate-400">{state !== 'Pending' && rawDate ? formatWhen(rawDate) : ''}</div>
                </div>
                {index < WORKSPACE_STAGES.length - 1 ? <ChevronRight className="mt-1.5 h-4 w-4 shrink-0 text-slate-300" /> : null}
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
          {tab === 'Details' ? <p className="whitespace-pre-wrap text-sm text-slate-700">{opportunity.description || opportunity.scopeSummary || 'No description has been saved.'}</p> : null}
          {tab === 'Lots / Packages' ? <Lines lines={detail?.lines || []} /> : null}
          {tab === 'Compliance Matrix' ? <Items items={compliance} empty="No compliance items yet." /> : null}
          {tab === 'Documents' ? <Documents documents={(detail?.documents || []).filter((item) => !/addend/i.test(item.category))} opportunityId={opportunity.id} onUploaded={() => loadDetail(opportunity.id)} /> : null}
          {tab === 'Addenda' ? <Documents documents={addenda} opportunityId={opportunity.id} category="Addendum" onUploaded={() => loadDetail(opportunity.id)} /> : null}
          {tab === 'Clarifications (Q&A)' ? <Items items={clarifications} empty="No clarifications have been logged." /> : null}
          {tab === 'Risk & Issues' ? <Items items={risks} empty="No risks or issues have been logged." /> : null}
          {tab === 'Financials' ? (
            <div className="grid gap-3 md:grid-cols-3">
              <Metric label="Estimated value" value={money(opportunity.estimatedValue, opportunity.currency)} />
              <Metric label="Priced lines" value={money(submittedValue, opportunity.currency)} />
              <Metric label="Awarded value" value={money((detail?.awards || []).reduce((sum, award) => sum + award.awardedValue, 0), opportunity.currency)} />
              <div className="md:col-span-3"><Lines lines={detail?.lines || []} /></div>
            </div>
          ) : null}
          {tab === 'Team & Tasks' ? (
            <div className="space-y-3 text-sm">
              <p><b>Owner:</b> {opportunity.ownerName || 'Unassigned'}</p>
              <p className="text-slate-600">{opportunity.teamNotes || 'No team notes have been saved.'}</p>
              <Items items={tasks} empty="No tasks have been assigned." />
            </div>
          ) : null}
          {tab === 'Timeline' ? <Audit events={detail?.audit || []} /> : null}
          {tab === 'Audit Trail' ? <Audit events={detail?.audit || []} /> : null}
        </section>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <SummaryCard tint="bg-[#eef5ff]" icon={Building2} iconTint="bg-blue-100 text-blue-600" label="Client" value={opportunity?.clientName || '—'} detail={opportunity?.clientAddress || opportunity?.contactPerson || '—'} />
            <SummaryCard tint="bg-[#eefbf3]" icon={FileText} iconTint="bg-emerald-100 text-emerald-600" label="Reference No." value={opportunity?.referenceNo || '—'} detail={opportunity?.tenderType || '—'} valueClass="text-emerald-700" />
            <SummaryCard tint="bg-[#f5f0ff]" icon={Cog} iconTint="bg-violet-100 text-violet-600" label="Sector" value={opportunity?.category || '—'} detail={[opportunity?.projectLocation || opportunity?.location, opportunity?.site].filter(Boolean).join(', ') || '—'} valueClass="text-violet-700" />
            <SummaryCard tint="bg-[#fff8eb]" icon={CircleDollarSign} iconTint="bg-amber-100 text-amber-600" label="Estimated Value" value={opportunity ? money(opportunity.estimatedValue, opportunity.currency) : '—'} detail={opportunity ? `Currency ${opportunity.currency || 'NGN'}` : '—'} />
            <SummaryCard tint="bg-[#fff1f2]" icon={CalendarClock} iconTint="bg-rose-100 text-rose-500" label="Submission Deadline" value={opportunity ? formatWhen(opportunity.submissionDeadline || opportunity.closingDate) : '—'} detail={days == null ? '—' : `${days} days left`} valueClass="text-rose-600" />
            <SummaryCard tint="bg-[#eef6ff]" icon={UserRound} iconTint="bg-sky-100 text-sky-600" label="Owner" value={opportunity?.ownerName || '—'} detail={[opportunity?.designation, opportunity?.department].filter(Boolean).join(' · ') || '—'} />
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
                  ['Contract Duration', opportunity?.contractDuration ? `${opportunity.contractDuration} ${opportunity.durationUnit || 'Months'}` : '—'],
                  ['Tendering Authority', opportunity?.clientName || '—'],
                  ['Submission Mode', opportunity?.source || '—'],
                  ['Created Date', opportunity ? formatWhen(opportunity.createdAt) : '—'],
                  ['Last Updated', opportunity ? formatWhen(opportunity.updatedAt) : '—'],
                ] as Array<[string, string]>).map(([label, value]) => (
                  <div key={label} className="flex items-start justify-between gap-4 border-b border-slate-50 py-2 last:border-0"><dt className="text-slate-400">{label}</dt><dd className="max-w-[58%] text-right font-semibold text-slate-800">{value || '—'}</dd></div>
                ))}
              </dl>
            </Panel>
            <Panel className="xl:col-span-5" title="Work Load Packages" action={<button type="button" onClick={() => setTab('Lots / Packages')} className="text-[12px] font-semibold text-blue-700">View All →</button>}>
              <div className="grid gap-2 sm:grid-cols-2">
                {packages.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.label} className="flex items-start gap-2 rounded-xl border border-slate-100 bg-[#f8fafc] px-3 py-2.5">
                      <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${item.tint}`}><Icon className="h-4 w-4" /></span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] text-slate-400">{item.label}</div>
                        <div className="truncate text-[13px] font-bold text-slate-800">{item.value}</div>
                      </div>
                      <Pill className={item.badgeClass}>{item.badge}</Pill>
                    </div>
                  );
                })}
              </div>
            </Panel>
            <Panel className="xl:col-span-3" title="Submission Deadline" action={<button type="button" onClick={() => setTab('Timeline')} className="text-[12px] font-semibold text-blue-700">View All →</button>}>
              <table className="w-full text-left text-[12px]">
                <thead className="text-[11px] text-slate-400"><tr><th className="pb-2 font-semibold">Date</th><th className="pb-2 font-semibold">Milestone</th><th className="pb-2 font-semibold">Status</th></tr></thead>
                <tbody>
                  {deadlineRows.map(([label, value]) => {
                    const left = value ? daysUntil(value) : null;
                    const state = !value ? 'Pending' : left != null && left < 0 ? 'Passed' : 'Open';
                    const tone = state === 'Passed' ? 'bg-emerald-50 text-emerald-700' : state === 'Open' ? 'bg-sky-50 text-sky-700' : 'bg-slate-100 text-slate-500';
                    return <tr key={label} className="border-t border-slate-100"><td className="py-2 text-slate-500">{value ? formatWhen(value) : '—'}</td><td className="py-2 font-semibold text-slate-700">{label}</td><td className="py-2"><Pill className={tone}>{state}</Pill></td></tr>;
                  })}
                </tbody>
              </table>
            </Panel>
            <Panel className="xl:col-span-4" title="Working Documents" action={<button type="button" onClick={() => setTab('Documents')} className="text-[12px] font-semibold text-blue-700">View All →</button>}>
              <div className="grid gap-2 sm:grid-cols-2">
                {(detail?.documents || []).slice(0, 4).map((doc, index) => (
                  <a key={doc.id} href={`/api/commercial/tenders?resource=document&documentId=${doc.id}`} className="flex items-center gap-2 rounded-xl border border-slate-100 bg-white px-2.5 py-2">
                    <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl text-white ${['bg-blue-500', 'bg-emerald-500', 'bg-rose-500', 'bg-violet-500'][index % 4]}`}><FileText className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-[12px] font-bold text-slate-800">{doc.fileName}</span><span className="block truncate text-[10px] text-slate-400">{doc.category || 'General'}</span></span>
                    <Pill className="bg-emerald-50 text-emerald-700">Filed</Pill>
                  </a>
                ))}
                {(detail?.documents || []).length === 0 ? <p className="col-span-2 py-8 text-center text-sm text-slate-500">No working documents yet.</p> : null}
              </div>
            </Panel>
            <Panel className="xl:col-span-8" title="Clarifications" action={<button type="button" onClick={() => setTab('Clarifications (Q&A)')} className="text-[12px] font-semibold text-blue-700">View All →</button>}>
              <table className="w-full text-left text-[12px]">
                <thead className="text-[11px] text-slate-400"><tr>{['#', 'Question', 'Owner', 'Raised', 'Due Date', 'Status'].map((heading) => <th key={heading} className="pb-2 font-semibold">{heading}</th>)}</tr></thead>
                <tbody>
                  {clarifications.length === 0 ? <tr><td colSpan={6} className="py-6 text-center text-slate-500">No clarifications have been logged.</td></tr> : clarifications.slice(0, 5).map((item, index) => (
                    <tr key={item.id} className="border-t border-slate-100"><td className="py-2 text-slate-400">{index + 1}</td><td className="py-2 font-semibold text-slate-800">{item.title}</td><td className="py-2">{item.assignee || '—'}</td><td className="py-2">{formatWhen(item.createdAt)}</td><td className="py-2">{formatWhen(item.dueAt)}</td><td className="py-2"><Pill className={/answer|closed|done/i.test(item.status) ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}>{item.status || 'Open'}</Pill></td></tr>
                  ))}
                </tbody>
              </table>
            </Panel>
            <Panel className="xl:col-span-12" title="Associated Records" action={<Link href="/commercial/tenders/opportunities" className="text-[12px] font-semibold text-blue-700">View All →</Link>}>
              <table className="w-full text-left text-[12px]">
                <thead className="text-[11px] text-slate-400"><tr>{['S/N', 'Enquiry', 'Reference No.', 'Category', 'Department', 'Owner', 'Stage', 'Status'].map((heading) => <th key={heading} className="pb-2 font-semibold">{heading}</th>)}</tr></thead>
                <tbody>
                  {opportunity ? (
                    <tr className="border-t border-slate-100">
                      <td className="py-2">1</td>
                      <td className="py-2 font-semibold">{opportunity.enquiryRef || '—'}</td>
                      <td className="py-2">{opportunity.referenceNo}</td>
                      <td className="py-2">{opportunity.category || '—'}</td>
                      <td className="py-2">{opportunity.department || '—'}</td>
                      <td className="py-2">{opportunity.ownerName || '—'}</td>
                      <td className="py-2"><Pill className="bg-amber-50 text-amber-700">{opportunity.stage || '—'}</Pill></td>
                      <td className="py-2"><Pill className="bg-blue-50 text-blue-700">{opportunity.status || '—'}</Pill></td>
                    </tr>
                  ) : <tr><td colSpan={8} className="py-6 text-center text-slate-500">No associated records yet.</td></tr>}
                </tbody>
              </table>
            </Panel>
          </div>
        </div>
      )}

      <OpportunityModal open={editing} initial={opportunity} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); if (opportunity) loadDetail(opportunity.id); loadList(); }} />
    </div>
  );
}

function SummaryCard({ tint, icon: Icon, iconTint, label, value, detail, valueClass = 'text-slate-950' }: { tint: string; icon: LucideIcon; iconTint: string; label: string; value: string; detail: string; valueClass?: string }) {
  return (
    <article className={`rounded-2xl border border-white px-3 py-3 shadow-sm ${tint}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold text-slate-500">{label}</div>
          <div className={`mt-1 truncate text-[15px] font-black ${valueClass}`}>{value || '—'}</div>
          <div className="mt-1 truncate text-[11px] text-slate-500">{detail}</div>
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

function Lines({ lines }: { lines: TenderLine[] }) {
  if (lines.length === 0) return <p className="text-sm text-slate-500">No lots or priced lines yet.</p>;
  return (
    <table className="w-full text-left text-[13px]">
      <thead className="text-[11px] uppercase text-slate-400"><tr>{['Section', 'Description', 'Qty', 'Unit', 'Sell'].map((heading) => <th key={heading} className="py-2 font-semibold">{heading}</th>)}</tr></thead>
      <tbody>
        {lines.map((line) => <tr key={line.id} className="border-t border-slate-100"><td className="py-2">{line.section || '—'}</td><td className="py-2">{line.description}</td><td className="py-2">{line.quantity}</td><td className="py-2">{line.unit}</td><td className="py-2 font-semibold">{plainNaira(line.sell)}</td></tr>)}
      </tbody>
    </table>
  );
}

function Items({ items, empty }: { items: TenderItem[]; empty: string }) {
  if (items.length === 0) return <p className="text-sm text-slate-500">{empty}</p>;
  return (
    <table className="w-full text-left text-[13px]">
      <thead className="text-[11px] uppercase text-slate-400"><tr>{['Title', 'Owner', 'Due', 'Status'].map((heading) => <th key={heading} className="py-2 font-semibold">{heading}</th>)}</tr></thead>
      <tbody>
        {items.map((item) => <tr key={item.id} className="border-t border-slate-100"><td className="py-2 font-semibold">{item.title}</td><td className="py-2">{item.assignee || '—'}</td><td className="py-2">{formatWhen(item.dueAt)}</td><td className="py-2">{item.status}</td></tr>)}
      </tbody>
    </table>
  );
}

function Documents({ documents, opportunityId, category = 'General', onUploaded }: { documents: TenderDocument[]; opportunityId: string; category?: string; onUploaded: () => void }) {
  return (
    <div className="space-y-3">
      <label className="inline-flex cursor-pointer items-center rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">
        Upload
        <input type="file" className="hidden" onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) tenderUpload(opportunityId, file, category).then(onUploaded);
        }} />
      </label>
      {documents.length === 0 ? <p className="text-sm text-slate-500">No documents in this tab.</p> : documents.map((doc) => (
        <a key={doc.id} className="block text-sm font-semibold text-blue-700" href={`/api/commercial/tenders?resource=document&documentId=${doc.id}`}>{doc.fileName}</a>
      ))}
    </div>
  );
}

function Audit({ events }: { events: Detail['audit'] }) {
  if (events.length === 0) return <p className="text-sm text-slate-500">No activity has been recorded.</p>;
  return <ul className="divide-y divide-slate-100 text-sm">{events.map((event) => <li key={event.id} className="py-2"><b>{event.action}</b> · {event.actor} · {event.details} · {formatWhen(event.createdAt)}</li>)}</ul>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 p-3"><div className="text-[11px] font-semibold text-slate-400">{label}</div><div className="text-lg font-black">{value}</div></div>;
}
