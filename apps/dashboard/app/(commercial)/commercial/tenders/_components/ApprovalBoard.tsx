'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ClipboardCheck, Filter, History, Search, X, XCircle } from 'lucide-react';
import { isBusinessGmCommercial, isBusinessManagingDirector } from '@/lib/access/commercial-access';
import { daysUntil, fileSize } from '@/lib/commercial/tender-present';
import {
  DEPARTMENT_REVIEW_STAGES,
  awaitsManagingDirector,
  bidChoiceOf,
  commercialKindOf,
  gmBidChoiceOf,
  departmentalReviewAllowed,
  externalDeadlineOf,
  internalDeadlineFromExternal,
  internalDeadlineOf,
  isEnquiryRecord,
  stageMatchesActor,
  tenderApprovalBucket,
} from '@/lib/commercial/tender-workflow';
import type { TenderApproval, TenderOpportunity } from '@/lib/commercial/tender-types';
import { formatWhen, tenderGet, tenderPost } from './tender-api';
import { OfficerSearch, type DirectoryEmployee } from './OfficerSearch';
import { useTenderRecord } from './use-tender-record';

type QueueTab = 'mine' | 'all' | 'completed';
type Choice = 'Bid' | 'No Bid' | '';
type DetailTab = 'details' | 'documents' | 'assessment' | 'comments' | 'related' | 'history';

const priorityTone: Record<string, string> = {
  High: 'bg-rose-50 text-rose-600',
  Medium: 'bg-amber-50 text-amber-700',
  Low: 'bg-blue-50 text-blue-700',
};

const requirementLines = (row: TenderOpportunity) => {
  const source = row.scopeSummary || row.description || '';
  return source.split(/\r?\n|•/).map((line) => line.replace(/^[\s\-*]+/, '').trim()).filter(Boolean).slice(0, 8);
};

export function ApprovalBoard() {
  const record = useTenderRecord();
  const { selectedId, setSelectedId } = record;
  const [tab, setTab] = useState<QueueTab>('mine');
  const [detailTab, setDetailTab] = useState<DetailTab>('details');
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [priority, setPriority] = useState('');
  const [sector, setSector] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [md, setMd] = useState(false);
  const [gm, setGm] = useState(false);
  const [department, setDepartment] = useState('');
  const [roles, setRoles] = useState<string[]>([]);
  const [directory, setDirectory] = useState<DirectoryEmployee[]>([]);
  const [choice, setChoice] = useState<Choice>('');
  const [comments, setComments] = useState('');
  const [officer, setOfficer] = useState('');
  const [officerCode, setOfficerCode] = useState('');
  const [internal, setInternal] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<'decision' | 'return' | ''>('');
  const [decisionOpen, setDecisionOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    tenderGet<DirectoryEmployee[]>('directory').then(setDirectory).catch(() => setDirectory([]));
    fetch('/api/auth/me', { cache: 'no-store', credentials: 'same-origin' })
      .then((response) => (response.ok ? response.json() : null))
      .then((json) => {
        const data = json?.data || {};
        const nextRoles = Array.isArray(data.roles) ? data.roles : [];
        setRoles(nextRoles);
        setDepartment(String(data.department || data.unit || ''));
        setMd(isBusinessManagingDirector(nextRoles));
        setGm(isBusinessGmCommercial(nextRoles));
      })
      .catch(() => { setMd(false); setGm(false); });
  }, []);

  const tenders = useMemo(() => record.rows.filter((row) => tenderApprovalBucket(row) !== 'enquiry'), [record.rows]);
  const pendingMine = useMemo(() => tenders.filter((row) => {
    const bucket = tenderApprovalBucket(row);
    if (gm && bucket === 'gm') return true;
    if (md && bucket === 'pending') return true;
    return bucket === 'review' && DEPARTMENT_REVIEW_STAGES.some((stage) => stageMatchesActor(stage, department, roles));
  }), [department, gm, md, roles, tenders]);
  const openApprovals = useMemo(() => tenders.filter((row) => {
    const bucket = tenderApprovalBucket(row);
    return bucket === 'pending' || bucket === 'review';
  }), [tenders]);
  const completed = useMemo(() => tenders.filter((row) => tenderApprovalBucket(row) === 'completed'), [tenders]);
  const queue = tab === 'mine' ? pendingMine : tab === 'completed' ? completed : openApprovals;
  const filtered = useMemo(() => {
    const text = search.trim().toLowerCase();
    return queue.filter((row) => {
      if (priority && row.priority !== priority) return false;
      if (sector && !(row.category || '').toLowerCase().includes(sector.trim().toLowerCase())) return false;
      if (!text) return true;
      return `${row.referenceNo} ${row.title} ${row.clientName}`.toLowerCase().includes(text);
    });
  }, [priority, queue, search, sector]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const opportunity = record.detail?.opportunity?.id === record.selectedId ? record.detail.opportunity : null;
  const approvals = record.detail?.opportunity?.id === record.selectedId ? record.detail.approvals : [];
  const documents = record.detail?.opportunity?.id === record.selectedId ? record.detail.documents : [];
  const audit = record.detail?.opportunity?.id === record.selectedId ? record.detail.audit : [];
  const decided = opportunity ? bidChoiceOf(opportunity) : '';
  const gmChoice = opportunity ? gmBidChoiceOf(opportunity) : '';
  const kind = opportunity ? commercialKindOf(opportunity) : '';
  const mdWaiting = opportunity ? awaitsManagingDirector(opportunity) : false;
  const gmTurn = Boolean(opportunity && gm && !decided && !mdWaiting);
  const mdTurn = Boolean(opportunity && md && mdWaiting);
  const external = opportunity ? externalDeadlineOf(opportunity) : '';
  const storedInternal = opportunity ? internalDeadlineOf(opportunity) : '';
  const related = useMemo(() => {
    if (!opportunity?.enquiryRef) return [];
    return record.rows.filter((row) => isEnquiryRecord(row) && (row.referenceNo === opportunity.enquiryRef || row.enquiryRef === opportunity.enquiryRef));
  }, [opportunity?.enquiryRef, record.rows]);
  const requirements = opportunity ? requirementLines(opportunity) : [];
  const externalDays = external ? daysUntil(external) : null;
  const internalDays = (storedInternal || (external ? internalDeadlineFromExternal(external) : '')) ? daysUntil(storedInternal || internalDeadlineFromExternal(external)) : null;

  useEffect(() => {
    if (!filtered.length) return;
    if (!filtered.some((row) => row.id === selectedId)) setSelectedId(filtered[0].id);
  }, [filtered, selectedId, setSelectedId]);

  useEffect(() => {
    if (!decisionOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || busy) return;
      setDecisionOpen(false);
      setHistoryOpen(false);
      setConfirming('');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, decisionOpen]);

  useEffect(() => {
    if (!opportunity) return;
    const draft = approvals.find((item) => item.decision.toUpperCase() === 'DRAFT');
    const draftChoice: Choice = draft?.comments.startsWith('BID:') ? 'Bid' : draft?.comments.startsWith('NO BID:') ? 'No Bid' : '';
    setChoice(decided || draftChoice);
    setComments(decided ? '' : (draft?.comments || '').replace(/^(BID|NO BID):\s*/, ''));
    setOfficer(opportunity.ownerName || '');
    setOfficerCode(opportunity.ownerEmployeeCode || '');
    setInternal((storedInternal || (external ? internalDeadlineFromExternal(external) : '')).slice(0, 10));
    setConfirming('');
    setDetailTab('details');
  }, [opportunity?.id, opportunity?.updatedAt]);

  const run = async (decision: string) => {
    if (!opportunity) return;
    setBusy(true);
    record.setError('');
    try {
      const gmTurn = gm && !bidChoiceOf(opportunity) && !awaitsManagingDirector(opportunity);
      if (gmTurn && decision !== 'Return') {
        await tenderPost({
          action: 'gm-decision',
          id: opportunity.id,
          decision: choice,
          comments,
          officerName: officer,
          employeeCode: officerCode,
          internalDeadline: internal,
        });
      } else {
        await tenderPost({
          action: 'bid-decision',
          id: opportunity.id,
          decision: decision === 'Return' ? 'Return' : 'Approve',
          comments,
        });
      }
      const kind = commercialKindOf(opportunity);
      const stopped = gmTurn && (choice === 'No Bid' || kind === 'EOI');
      record.setNotice(decision === 'Return' ? 'Returned to GM Commercial.' : stopped ? (choice === 'No Bid' ? 'NO BID recorded. The assigned employee and commercial team have been notified.' : 'EOI approved by GM Commercial. The assigned employee and commercial team have been notified.') : gmTurn ? 'BID approved and sent to the MD for final approval.' : 'MD final approval recorded. The assigned employee and commercial team have been notified.');
      setConfirming('');
      if (decision !== 'Draft') {
        setDecisionOpen(false);
        setHistoryOpen(false);
      }
      await record.reload();
    } catch (reason) {
      record.setError(reason instanceof Error ? reason.message : 'The decision was not saved.');
    } finally {
      setBusy(false);
    }
  };

  const review = async (stage: string, decision: 'APPROVE' | 'RETURN') => {
    if (!opportunity) return;
    if (decision === 'RETURN' && !comments.trim()) {
      record.setError('A comment is required to return this review.');
      return;
    }
    setBusy(true);
    record.setError('');
    try {
      await tenderPost({ action: 'approval', id: opportunity.id, approval: { stage, decision, comments } });
      record.setNotice(decision === 'APPROVE' ? `${stage} approved.` : `${stage} returned.`);
      setComments('');
      await record.reload();
    } catch (reason) {
      record.setError(reason instanceof Error ? reason.message : 'The review was not saved.');
    } finally {
      setBusy(false);
    }
  };

  const closeDecision = () => {
    if (busy) return;
    setDecisionOpen(false);
    setHistoryOpen(false);
    setConfirming('');
  };

  const currentReview = DEPARTMENT_REVIEW_STAGES.find((stage) => !approvals.some((item) => item.stage === stage && item.decision.toUpperCase() === 'APPROVE'));
  const canReview = Boolean(opportunity && departmentalReviewAllowed(opportunity) && currentReview && (md || stageMatchesActor(currentReview, department, roles)));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[#2563eb] text-white"><ClipboardCheck className="h-5 w-5" /></span>
          <div>
            <h1 className="text-[22px] font-black tracking-tight text-slate-950">Approvals</h1>
            <p className="text-[13px] text-slate-500">GM Commercial assigns the employee, records BID or NO BID, and approves first. ITT and RFQ bids then go to the MD. EOI and NO BID stay with GM Commercial.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {([
            ['mine', 'Pending My Action', pendingMine.length],
            ['all', 'All Approvals', openApprovals.length],
            ['completed', 'Completed', completed.length],
          ] as const).map(([id, label, count]) => (
            <button key={id} type="button" onClick={() => { setTab(id); setPage(1); }} className={`h-10 rounded-xl px-4 text-[13px] font-bold ${tab === id ? 'bg-[#2563eb] text-white shadow-sm' : 'border border-slate-200 bg-white text-slate-600'}`}>
              {label} ({count})
            </button>
          ))}
        </div>
      </div>
      {record.error ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{record.error}</p> : null}
      {record.notice ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{record.notice}</p> : null}

      <div className="grid items-start gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <h2 className="text-[15px] font-black text-slate-950">{tab === 'completed' ? 'Completed Decisions' : tab === 'all' ? 'Open Approvals' : gm && !md ? 'Awaiting GM Commercial' : md && !gm ? 'Awaiting MD Final Approval' : 'Pending My Action'}</h2>
            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-slate-100 px-2 text-[12px] font-bold text-slate-600">{filtered.length}</span>
          </div>
          <div className="flex gap-2 px-4 py-3">
            <label className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search by title, client, reference no..." className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-[13px] outline-none focus:border-blue-500 focus:bg-white" aria-label="Search approvals" />
            </label>
            <button type="button" onClick={() => setFiltersOpen((value) => !value)} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500" aria-label="Filter approvals"><Filter className="h-4 w-4" /></button>
          </div>
          {filtersOpen ? (
            <div className="grid grid-cols-2 gap-2 px-4 pb-3">
              <select value={priority} onChange={(event) => { setPriority(event.target.value); setPage(1); }} className="h-10 rounded-lg border border-slate-200 px-2 text-[12px]" aria-label="Priority filter">
                <option value="">All priorities</option>
                {['High', 'Medium', 'Low'].map((item) => <option key={item}>{item}</option>)}
              </select>
              <input value={sector} onChange={(event) => { setSector(event.target.value); setPage(1); }} placeholder="Sector" className="h-10 rounded-lg border border-slate-200 px-2 text-[12px]" aria-label="Sector filter" />
            </div>
          ) : null}
          <div className="space-y-2 px-3 pb-3">
            {pageRows.length === 0 ? <p className="px-2 py-8 text-center text-[13px] text-slate-500">{record.loading ? 'Loading approvals…' : 'No opportunities in this view.'}</p> : pageRows.map((row) => {
              const selected = row.id === record.selectedId;
              const due = externalDeadlineOf(row);
              const left = due ? daysUntil(due) : null;
              const bucket = tenderApprovalBucket(row);
              return (
                <button key={row.id} type="button" onClick={() => { record.setSelectedId(row.id); setHistoryOpen(false); setDecisionOpen(true); }} className={`w-full rounded-xl border p-3 text-left ${selected ? 'border-[#2563eb] bg-blue-50/40 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[12px] font-bold text-[#2563eb]">{row.referenceNo || '—'}</div>
                      <div className="truncate text-[13px] font-black text-slate-900">{row.title}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[12px] font-semibold text-slate-700">{due ? formatWhen(due) : '—'}</div>
                      <div className="text-[11px] font-bold text-[#2563eb]">{left == null ? '' : left < 0 ? 'Overdue' : `${left} days left`}</div>
                    </div>
                  </div>
                  <div className="mt-2 text-[12px] text-slate-500">Client: {row.clientName || '—'} · Sector: {row.category || '—'}</div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${priorityTone[row.priority] || 'bg-slate-100 text-slate-600'}`}>{row.priority || '—'}</span>
                    <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${bucket === 'completed' ? 'bg-emerald-50 text-emerald-700' : bucket === 'review' ? 'bg-blue-50 text-blue-700' : bucket === 'gm' ? 'bg-orange-50 text-orange-700' : 'bg-amber-50 text-amber-700'}`}>
                      {bucket === 'completed' ? (bidChoiceOf(row) === 'No Bid' ? 'No Bid' : 'Completed') : bucket === 'review' ? 'Bid Review' : bucket === 'gm' ? 'GM Commercial' : 'MD Final Approval'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-3 py-3 text-[12px] text-slate-500">
            <span>Showing {filtered.length === 0 ? 0 : (safePage - 1) * pageSize + 1} to {Math.min(safePage * pageSize, filtered.length)} of {filtered.length}</span>
            <div className="flex items-center gap-1">
              <button type="button" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)} className="h-8 rounded-lg border border-slate-200 px-2 disabled:opacity-40">‹</button>
              <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-lg bg-[#2563eb] px-2 font-bold text-white">{safePage}</span>
              <button type="button" disabled={safePage >= pageCount} onClick={() => setPage(safePage + 1)} className="h-8 rounded-lg border border-slate-200 px-2 disabled:opacity-40">›</button>
              <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} className="h-8 rounded-lg border border-slate-200 px-1" aria-label="Rows per page">
                {[5, 10].map((size) => <option key={size} value={size}>Show {size}</option>)}
              </select>
            </div>
          </div>
        </section>

        <section className="min-w-0 space-y-3">
          {!opportunity ? <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">{record.loading ? 'Loading opportunity…' : 'Select an opportunity to review it.'}</div> : (
            <>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-[18px] font-black text-slate-950">{opportunity.title}</h2>
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700">{decided === 'Bid' ? 'Bid approved' : decided === 'No Bid' ? 'No Bid' : mdWaiting ? 'Awaiting MD final approval' : 'Awaiting GM Commercial'}</span>
                    </div>
                    <p className="text-[12px] font-semibold text-slate-500">{opportunity.referenceNo}</p>
                  </div>
                  <Link href={`/commercial/tenders/workspace?id=${opportunity.id}`} target="_blank" className="text-[12px] font-bold text-[#2563eb]">Open in New Tab</Link>
                </div>
                <ol className="mt-4 grid gap-2 sm:grid-cols-4 xl:grid-cols-5">
                  {['Assign employee', 'GM Bid / No Bid', kind === 'EOI' || gmChoice === 'No Bid' ? 'Stops with GM' : 'MD final approval', ...DEPARTMENT_REVIEW_STAGES].map((stage, index) => {
                    const approved = index === 0 ? Boolean(opportunity.ownerName) : index === 1 ? Boolean(gmChoice || decided) : index === 2 ? Boolean(decided) || gmChoice === 'No Bid' || (kind === 'EOI' && Boolean(gmChoice)) : approvals.some((item) => item.stage === stage && item.decision.toUpperCase() === 'APPROVE');
                    const current = !approved && (index === 0 ? gmTurn && !opportunity.ownerName : index === 1 ? gmTurn : index === 2 ? mdWaiting : decided === 'Bid' && Boolean(opportunity.ownerName) && currentReview === stage);
                    return (
                      <li key={stage} className="min-w-0">
                        <div className={`mx-auto flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-bold ${approved ? 'bg-emerald-500 text-white' : current ? 'bg-[#2563eb] text-white' : 'bg-slate-100 text-slate-400'}`}>{index + 1}</div>
                        <div className="mt-1 truncate text-center text-[10px] font-semibold text-slate-600">{stage}</div>
                        <div className={`text-center text-[10px] ${approved ? 'text-emerald-600' : current ? 'text-[#2563eb]' : 'text-slate-400'}`}>{approved ? 'Complete' : current ? 'Current Stage' : 'Pending'}</div>
                      </li>
                    );
                  })}
                </ol>
              </div>

              <div className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white px-2">
                {([
                  ['details', 'Opportunity Details', 0],
                  ['documents', 'Client Documents', documents.length],
                  ['assessment', 'Bid / No Bid Assessment', 0],
                  ['comments', 'Comments', approvals.filter((item) => item.comments).length],
                  ['related', 'Related Enquiries', related.length],
                  ['history', 'History', audit.length],
                ] as const).map(([id, label, count]) => (
                  <button key={id} type="button" onClick={() => setDetailTab(id)} className={`whitespace-nowrap border-b-2 px-3 py-3 text-[13px] font-semibold ${detailTab === id ? 'border-[#2563eb] text-[#2563eb]' : 'border-transparent text-slate-500'}`}>
                    {label}{id === 'details' || id === 'assessment' ? '' : ` (${count})`}
                  </button>
                ))}
              </div>

              {detailTab === 'details' ? (
                <div className="grid gap-3 lg:grid-cols-2">
                  <article className="rounded-2xl border border-slate-200 bg-white p-4">
                    <h3 className="mb-3 text-[14px] font-black text-slate-900">Key Information</h3>
                    <dl className="space-y-2 text-[13px]">
                      <Info label="Project Title" value={opportunity.title} />
                      <Info label="Client" value={opportunity.clientName} />
                      <Info label="Sector" value={opportunity.category} />
                      <Info label="Tender Type" value={opportunity.tenderType || opportunity.contractType} />
                      <div>
                        <dt className="text-slate-400">Project Scope</dt>
                        <dd className="text-slate-800">{opportunity.description || '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-400">Key Requirements</dt>
                        <dd>{requirements.length ? <ul className="list-disc pl-4 text-slate-800">{requirements.map((line) => <li key={line}>{line}</li>)}</ul> : <span className="text-slate-500">No key requirements have been recorded.</span>}</dd>
                      </div>
                    </dl>
                    <span className={`mt-3 inline-flex rounded-md px-2 py-0.5 text-[11px] font-bold ${priorityTone[opportunity.priority] || 'bg-slate-100 text-slate-600'}`}>{opportunity.priority || '—'}</span>
                  </article>
                  <div className="space-y-3">
                    <article className="rounded-2xl border border-slate-200 bg-white p-4">
                      <h3 className="mb-3 text-[14px] font-black text-slate-900">Deadlines</h3>
                      <Deadline label="External Submission Date" value={external ? formatWhen(external) : '—'} days={externalDays} />
                      <Deadline label="Internal Submission Date (Default: 24h)" value={(storedInternal || (external ? internalDeadlineFromExternal(external) : '')) ? formatWhen(storedInternal || internalDeadlineFromExternal(external)) : '—'} days={internalDays} />
                      <button type="button" onClick={() => setDetailTab('history')} className="mt-2 text-[12px] font-bold text-[#2563eb]">View deadline history</button>
                    </article>
                    <article className="rounded-2xl border border-slate-200 bg-white p-4">
                      <h3 className="mb-3 text-[14px] font-black text-slate-900">Client Information</h3>
                      <Info label="Client" value={opportunity.clientName} />
                      <Info label="Contact Person" value={opportunity.contactPerson} />
                      <Info label="Client Reference" value={opportunity.enquiryRef} />
                      <Info label="Sector" value={opportunity.category} />
                      <Info label="Location" value={opportunity.location || opportunity.projectLocation} />
                    </article>
                  </div>
                </div>
              ) : null}

              {detailTab === 'documents' ? (
                <article className="rounded-2xl border border-slate-200 bg-white p-4">
                  {documents.length === 0 ? <p className="text-sm text-slate-500">No client documents have been uploaded.</p> : (
                    <ul className="divide-y divide-slate-100">
                      {documents.map((file) => (
                        <li key={file.id} className="flex items-center justify-between gap-3 py-2 text-[13px]">
                          <span className="min-w-0"><span className="block truncate font-semibold text-slate-800">{file.fileName}</span><span className="text-slate-400">{file.category} · {fileSize(file.sizeBytes)} · {formatWhen(file.uploadedAt)}</span></span>
                          <a className="font-bold text-[#2563eb]" href={`/api/commercial/tenders?resource=document&documentId=${file.id}`}>Open</a>
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              ) : null}

              {detailTab === 'assessment' ? <Assessment approvals={approvals} decided={decided} /> : null}
              {detailTab === 'comments' ? (
                <article className="rounded-2xl border border-slate-200 bg-white p-4">
                  {approvals.filter((item) => item.comments).length === 0 ? <p className="text-sm text-slate-500">No comments yet.</p> : approvals.filter((item) => item.comments).map((item) => (
                    <Comment key={item.id} item={item} />
                  ))}
                </article>
              ) : null}
              {detailTab === 'related' ? (
                <article className="rounded-2xl border border-slate-200 bg-white p-4">
                  {related.length === 0 ? <p className="text-sm text-slate-500">No related enquiry is linked to this opportunity.</p> : related.map((row) => (
                    <Link key={row.id} href={`/commercial/tenders/enquiries?id=${row.id}`} className="block py-2 text-[13px] font-semibold text-[#2563eb]">{row.referenceNo} · {row.title}</Link>
                  ))}
                </article>
              ) : null}
              {detailTab === 'history' ? (
                <article className="rounded-2xl border border-slate-200 bg-white p-4">
                  {audit.length === 0 ? <p className="text-sm text-slate-500">No history has been recorded.</p> : (
                    <ol className="space-y-2">{audit.map((event) => (
                      <li key={event.id} className="rounded-xl border border-slate-100 px-3 py-2 text-[13px]"><span className="font-bold text-slate-800">{event.action}</span> <span className="text-slate-500">{event.actor} · {formatWhen(event.createdAt)}</span><div className="text-slate-600">{event.details}</div></li>
                    ))}</ol>
                  )}
                </article>
              ) : null}

            </>
          )}
        </section>
      </div>

      {decisionOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDecision(); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="md-bid-title" className="my-4 w-full max-w-5xl rounded-2xl border border-slate-200 bg-white p-4 shadow-xl" onMouseDown={(event) => event.stopPropagation()}>
            {!opportunity ? <p className="py-8 text-center text-sm text-slate-500">{record.loading ? 'Loading opportunity…' : 'This opportunity could not be opened.'}</p> : (
              <>
                <div className="mb-3 flex items-start gap-2">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-[#2563eb]"><ClipboardCheck className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1">
                    <h3 id="md-bid-title" className="text-[15px] font-black text-slate-950">{mdTurn ? 'MD Final Approval' : 'GM Commercial Approval'}</h3>
                    <p className="text-[12px] text-slate-500">{mdTurn ? 'GM Commercial has assigned the employee and approved a BID. Give final approval or return it to GM Commercial.' : 'Assign the employee who will handle this opportunity, record BID or NO BID, then approve. EOI and NO BID stop here. An ITT or RFQ BID goes to the MD.'}</p>
                    <p className="mt-1 truncate text-[12px] font-semibold text-slate-700">{opportunity.referenceNo} · {opportunity.title}</p>
                  </div>
                  <button type="button" onClick={closeDecision} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close decision"><X className="h-4 w-4" /></button>
                </div>
                <div className="grid gap-3 lg:grid-cols-[1fr_1fr_280px]">
                  <DecisionCard
                    selected={choice === 'Bid'}
                    disabled={!gmTurn || busy}
                    tone="emerald"
                    title="BID"
                    points={['GM Commercial approves the bid first.', 'An ITT or RFQ then goes to the MD.', 'An EOI stays with GM Commercial.', 'Assign the employee who will handle it.', 'Notify the employee and commercial team when the outcome is final.']}
                    onSelect={() => setChoice('Bid')}
                  />
                  <DecisionCard
                    selected={choice === 'No Bid'}
                    disabled={!gmTurn || busy}
                    tone="rose"
                    title="NO BID"
                    points={['GM Commercial records NO BID.', 'The opportunity stops here.', 'It does not go to the MD.', 'A reason is required.', 'The assigned employee and commercial team are notified.']}
                    onSelect={() => setChoice('No Bid')}
                  />
                  <label className="block text-[12px] font-semibold text-slate-500">
                    Comments {choice === 'No Bid' || mdTurn ? <span className="text-rose-500">*</span> : null}
                    <textarea maxLength={1000} value={comments} onChange={(event) => setComments(event.target.value)} disabled={(!gmTurn && !mdTurn) || busy} placeholder="Enter the decision comments, reasons or instructions..." className="mt-1 min-h-36 w-full rounded-xl border border-slate-200 px-3 py-2 text-[13px] font-normal text-slate-800 outline-none focus:border-blue-500" />
                    <span className="mt-1 block text-right text-[11px] font-normal text-slate-400">{comments.length}/1000</span>
                  </label>
                </div>
                {gmTurn ? (
                  <div className="mt-3 grid gap-3 rounded-xl border border-emerald-100 bg-emerald-50/40 p-3 md:grid-cols-2">
                    <div>
                      <div className="mb-1 text-[12px] font-semibold text-slate-600">Assigned employee</div>
                      <OfficerSearch employees={directory} employeeId={officerCode} name={officer} disabled={busy} onSelect={(employee) => { setOfficer(employee?.fullName || ''); setOfficerCode(employee?.employeeId || ''); }} />
                    </div>
                    {choice !== 'No Bid' ? (
                      <label className="block text-[12px] font-semibold text-slate-600">Internal submission deadline
                        <input type="date" value={internal} onChange={(event) => setInternal(event.target.value)} disabled={busy} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-[13px]" />
                      </label>
                    ) : null}
                  </div>
                ) : null}
                {mdTurn ? <p className="mt-3 text-[12px] font-semibold text-slate-600">GM Commercial decision: BID. Assigned employee: {opportunity.ownerName || '—'}.</p> : null}
                {decided ? <p className="mt-3 text-[12px] font-semibold text-slate-600">{decided === 'Bid' ? `Bid approved. Assigned employee: ${opportunity.ownerName || '—'}.` : 'NO BID was recorded by GM Commercial. This opportunity is closed to bid preparation.'}</p> : null}
                {!gmTurn && !mdTurn && !decided ? <p className="mt-3 text-[12px] text-slate-500">GM Commercial assigns the employee and records the first decision. The MD gives final approval only for an ITT or RFQ BID.</p> : null}
                {canReview && currentReview ? (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-blue-100 bg-blue-50/50 px-3 py-2">
                    <span className="text-[12px] font-semibold text-slate-700">{currentReview} can start because the bid is approved and an officer is assigned.</span>
                    <span className="flex gap-2">
                      <button type="button" disabled={busy} onClick={() => review(currentReview, 'RETURN')} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-bold text-slate-700">Return</button>
                      <button type="button" disabled={busy} onClick={() => review(currentReview, 'APPROVE')} className="h-9 rounded-lg bg-[#2563eb] px-3 text-[12px] font-bold text-white">Approve stage</button>
                    </span>
                  </div>
                ) : null}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex gap-3 text-[12px] font-bold">
                    <button type="button" disabled={!mdTurn || busy || !comments.trim()} onClick={() => setConfirming('return')} className="text-slate-600 disabled:opacity-40">Return to GM Commercial</button>
                    <button type="button" onClick={() => setHistoryOpen((open) => !open)} className="inline-flex items-center gap-1 text-[#2563eb]"><History className="h-3.5 w-3.5" /> View History</button>
                  </div>
                  <div className="flex gap-2">
                    {mdTurn ? <button type="button" disabled={busy || !comments.trim()} onClick={() => setConfirming('return')} className="h-10 rounded-xl border border-slate-200 px-4 text-[13px] font-bold text-slate-700 disabled:opacity-40">Return to GM</button> : null}
                    <button type="button" disabled={(!gmTurn && !mdTurn) || busy || (gmTurn && (!choice || !officer)) || (gmTurn && choice === 'No Bid' && !comments.trim())} onClick={() => setConfirming('decision')} className="h-10 rounded-xl bg-[#2563eb] px-4 text-[13px] font-bold text-white disabled:opacity-40">{mdTurn ? 'Give final approval' : choice === 'No Bid' ? 'Record NO BID' : 'Approve'}</button>
                  </div>
                </div>
                {historyOpen ? (
                  <div className="mt-3 rounded-xl border border-slate-100 p-3">
                    {audit.length === 0 ? <p className="text-sm text-slate-500">No history has been recorded.</p> : (
                      <ol className="space-y-2">{audit.map((event) => (
                        <li key={event.id} className="rounded-xl border border-slate-100 px-3 py-2 text-[13px]"><span className="font-bold text-slate-800">{event.action}</span> <span className="text-slate-500">{event.actor} · {formatWhen(event.createdAt)}</span><div className="text-slate-600">{event.details}</div></li>
                      ))}</ol>
                    )}
                  </div>
                ) : null}
                {confirming ? (
                  <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[13px]">
                    <p className="font-semibold text-slate-800">{confirming === 'return' ? 'Return this opportunity to GM Commercial?' : mdTurn ? 'Give MD final approval and notify the assigned employee and commercial team?' : choice === 'No Bid' ? 'Record NO BID, stop it with GM Commercial, and send the notification?' : kind === 'EOI' ? 'Approve this EOI with GM Commercial and send the notification? It will not go to the MD.' : 'Approve this BID and send it to the MD for final approval?'}</p>
                    <div className="mt-2 flex gap-2">
                      <button type="button" disabled={busy} onClick={() => setConfirming('')} className="h-9 rounded-lg border border-slate-200 bg-white px-3 font-bold text-slate-700">Cancel</button>
                      <button type="button" disabled={busy} onClick={() => run(confirming === 'return' ? 'Return' : 'Approve')} className="h-9 rounded-lg bg-[#2563eb] px-3 font-bold text-white">{busy ? 'Saving…' : 'Confirm'}</button>
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Info({ label, value }: { label: string; value?: string }) {
  return <div className="flex justify-between gap-3"><dt className="text-slate-400">{label}</dt><dd className="text-right font-semibold text-slate-800">{value || '—'}</dd></div>;
}

function Deadline({ label, value, days }: { label: string; value: string; days: number | null }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2 text-[13px]">
      <span><span className="block text-slate-400">{label}</span><span className="font-semibold text-slate-800">{value}</span></span>
      {days != null ? <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-[#2563eb]">{days < 0 ? 'Overdue' : `${days} days left`}</span> : null}
    </div>
  );
}

function DecisionCard({ selected, disabled, tone, title, points, onSelect }: { selected: boolean; disabled: boolean; tone: 'emerald' | 'rose'; title: string; points: string[]; onSelect: () => void }) {
  const active = tone === 'emerald' ? 'border-emerald-300 bg-emerald-50' : 'border-rose-300 bg-rose-50';
  return (
    <button type="button" disabled={disabled} onClick={onSelect} className={`rounded-2xl border p-3 text-left ${selected ? active : 'border-slate-200 bg-white'} disabled:cursor-default`}>
      <div className={`mb-2 inline-flex items-center gap-2 text-[13px] font-black ${tone === 'emerald' ? 'text-emerald-700' : 'text-rose-600'}`}>
        {tone === 'emerald' ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />} {title}
      </div>
      <ul className="space-y-1 text-[12px] text-slate-600">{points.map((point) => <li key={point}>{point}</li>)}</ul>
    </button>
  );
}

function Comment({ item }: { item: TenderApproval }) {
  return <div className="border-b border-slate-100 py-2 text-[13px]"><div className="font-bold text-slate-800">{item.actor} · {item.stage} · {item.decision}</div><p className="text-slate-600">{item.comments}</p><div className="text-[11px] text-slate-400">{formatWhen(item.createdAt)}</div></div>;
}

function Assessment({ approvals, decided }: { approvals: TenderApproval[]; decided: string }) {
  const decision = approvals.find((item) => (item.stage === 'GM Commercial Approval' || item.stage === 'MD Final Approval' || item.stage === 'MD Bid / No Bid') && ['BID', 'NO BID'].includes(item.decision.toUpperCase()));
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 text-[13px] text-slate-700">
      <p>{decided ? `The recorded decision is ${decided}.` : 'No bid decision has been confirmed.'}</p>
      {decision ? <p className="mt-2">{decision.actor} · {formatWhen(decision.createdAt)}{decision.comments ? ` · ${decision.comments}` : ''}</p> : null}
    </article>
  );
}
