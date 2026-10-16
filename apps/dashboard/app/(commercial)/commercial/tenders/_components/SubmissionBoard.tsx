'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { BarChart3, Check, Clock3, FileText, ListChecks, MessageSquare, Plus, Search, Send, Trophy, Upload, X, XCircle } from 'lucide-react';
import type { TenderApproval, TenderAward, TenderDocument, TenderItem, TenderLookups, TenderOpportunity, TenderSubmission } from '@/lib/commercial/tender-types';
import { daysUntil, downloadCsv, sectorOf } from '@/lib/commercial/tender-present';
import { awardedToDleOf, clientStatusOf } from '@/lib/commercial/tender-workflow';
import { formatWhen, tenderGet, tenderPost, tenderUpload } from './tender-api';
import { ActingEmployee } from './acting-employee';
import { BlueprintRegisters } from './BlueprintRegisters';
import { RowMenu } from './record-frame';

type TrackStatus = 'Submitted' | 'Awaiting Response' | 'Under Clarification' | 'Awarded' | 'Not Successful' | 'Withdrawn';
type Tab = 'All Submissions' | 'Awaiting Response' | 'Under Clarification' | 'Awarded' | 'Not Successful' | 'Withdrawn' | 'Late';
type Dialog = '' | 'submit' | 'status' | 'communication' | 'clarification' | 'upload' | 'checklist';

const TABS: Tab[] = ['All Submissions', 'Awaiting Response', 'Under Clarification', 'Awarded', 'Not Successful', 'Withdrawn', 'Late'];
const STATUSES: TrackStatus[] = ['Submitted', 'Awaiting Response', 'Under Clarification', 'Awarded', 'Not Successful', 'Withdrawn'];
const CHANNELS = ['Electronic Portal', 'Email', 'Courier', 'Hand Delivery'];

const statusTone: Record<TrackStatus, string> = {
  Submitted: 'bg-emerald-50 text-emerald-700',
  'Awaiting Response': 'bg-teal-50 text-teal-700',
  'Under Clarification': 'bg-amber-50 text-amber-700',
  Awarded: 'bg-emerald-50 text-emerald-700',
  'Not Successful': 'bg-rose-50 text-rose-600',
  Withdrawn: 'bg-slate-100 text-slate-600',
};

const isEnquiry = (row: TenderOpportunity) => row.opportunityType === 'Enquiry' || row.tenderType === 'Enquiry' || row.stage === 'Enquiry';
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('') || '—';
const within = (value: string, from: string, to: string) => {
  const day = (value || '').slice(0, 10);
  if (!day) return !from && !to;
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
};
const stamp = (value: string) => {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const responseDueOf = (submission: TenderSubmission | undefined, items: TenderItem[]) => {
  const noted = submission?.notes.match(/Response due:\s*(\d{4}-\d{2}-\d{2})/i)?.[1] || '';
  if (noted) return noted;
  return items.find((item) => item.dueAt && /response/i.test(`${item.kind} ${item.title}`))?.dueAt || '';
};

const trackStatus = (row: TenderOpportunity, submission: TenderSubmission | undefined, awarded: boolean, items: TenderItem[]): TrackStatus => {
  const outcome = awardedToDleOf(row);
  const client = clientStatusOf(row);
  if (outcome === 'No') return 'Not Successful';
  if (outcome === 'Yes' || client === 'Awarded') return 'Awarded';
  if (client === 'Cancelled') return 'Withdrawn';
  const text = `${row.status} ${row.stage}`.toLowerCase();
  if (awarded || /award/.test(text)) return 'Awarded';
  if (/withdraw/.test(text)) return 'Withdrawn';
  if (/lost|unsuccess|no-bid|no bid/.test(text)) return 'Not Successful';
  if (/clarif/.test(text) || items.some((item) => /clarif/i.test(`${item.kind} ${item.title}`) && !/done|closed/i.test(item.status))) return 'Under Clarification';
  if (/await/.test(text) || submission?.receiptReference) return 'Awaiting Response';
  return 'Submitted';
};

export function SubmissionBoard() {
  const searchParams = useSearchParams();
  const [opportunities, setOpportunities] = useState<TenderOpportunity[]>([]);
  const [submissions, setSubmissions] = useState<TenderSubmission[]>([]);
  const [awards, setAwards] = useState<TenderAward[]>([]);
  const [items, setItems] = useState<TenderItem[]>([]);
  const [approvals, setApprovals] = useState<TenderApproval[]>([]);
  const [lookups, setLookups] = useState<TenderLookups | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('All Submissions');
  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [client, setClient] = useState('All Clients');
  const [sector, setSector] = useState('All Sectors');
  const [tenderType, setTenderType] = useState('All Types');
  const requestedStatus = searchParams.get('status') || '';
  const [status, setStatus] = useState((STATUSES as string[]).includes(requestedStatus) ? requestedStatus : 'All Statuses');
  const [officer, setOfficer] = useState('All Officers');
  const [submittedFrom, setSubmittedFrom] = useState('');
  const [submittedTo, setSubmittedTo] = useState('');
  const [dueFrom, setDueFrom] = useState('');
  const [dueTo, setDueTo] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [picked, setPicked] = useState<string[]>([]);
  const [menuId, setMenuId] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [dialog, setDialog] = useState<Dialog>('');
  const [showAllComms, setShowAllComms] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [opportunityRows, submissionRows, awardRows, itemRows, approvalRows, lookupRows] = await Promise.all([
        tenderGet<TenderOpportunity[]>('opportunities'),
        tenderGet<TenderSubmission[]>('submissions'),
        tenderGet<TenderAward[]>('awards'),
        tenderGet<TenderItem[]>('items'),
        tenderGet<TenderApproval[]>('approvals'),
        tenderGet<TenderLookups>('lookups'),
      ]);
      setOpportunities(opportunityRows);
      setSubmissions(submissionRows);
      setAwards(awardRows);
      setItems(itemRows);
      setApprovals(approvalRows);
      setLookups(lookupRows);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to read submissions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const latestSubmission = useMemo(() => {
    const map = new Map<string, TenderSubmission>();
    submissions.forEach((row) => { if (!map.has(row.opportunityId)) map.set(row.opportunityId, row); });
    return map;
  }, [submissions]);
  const awardByOpportunity = useMemo(() => {
    const map = new Map<string, TenderAward>();
    awards.forEach((row) => { if (!map.has(row.opportunityId)) map.set(row.opportunityId, row); });
    return map;
  }, [awards]);
  const itemsByOpportunity = useMemo(() => {
    const map = new Map<string, TenderItem[]>();
    items.forEach((row) => map.set(row.opportunityId, [...(map.get(row.opportunityId) || []), row]));
    return map;
  }, [items]);

  const rows = useMemo(() => opportunities.filter((row) => {
    if (isEnquiry(row)) return false;
    const submission = latestSubmission.get(row.id);
    const award = awardByOpportunity.get(row.id);
    const text = `${row.status} ${row.stage}`.toLowerCase();
    return Boolean(submission || award || /submit|award|withdraw|lost|unsuccess|clarif|await/.test(text));
  }), [awardByOpportunity, itemsByOpportunity, latestSubmission, opportunities]);

  const viewOf = (row: TenderOpportunity) => {
    const submission = latestSubmission.get(row.id);
    const related = itemsByOpportunity.get(row.id) || [];
    const state = trackStatus(row, submission, awardByOpportunity.has(row.id), related);
    const due = responseDueOf(submission, related);
    const submittedOn = submission?.submittedAt || '';
    const deadline = (row.submissionDeadline || row.closingDate || '').slice(0, 10);
    const late = Boolean(submittedOn && deadline && submittedOn.slice(0, 10) > deadline);
    const updated = [row.updatedAt, submittedOn, ...related.map((item) => item.createdAt)].filter(Boolean).sort().at(-1) || '';
    return { submission, state, due, submittedOn, late, updated, related };
  };

  const counts = {
    all: rows.length,
    'Awaiting Response': rows.filter((row) => viewOf(row).state === 'Awaiting Response').length,
    'Under Clarification': rows.filter((row) => viewOf(row).state === 'Under Clarification').length,
    Awarded: rows.filter((row) => viewOf(row).state === 'Awarded').length,
    'Not Successful': rows.filter((row) => viewOf(row).state === 'Not Successful').length,
    Withdrawn: rows.filter((row) => viewOf(row).state === 'Withdrawn').length,
    Late: rows.filter((row) => viewOf(row).late).length,
    Submitted: rows.filter((row) => viewOf(row).state === 'Submitted').length,
  };
  const now = Date.now();
  const deltaFor = (matched: TenderOpportunity[], dateOf: (row: TenderOpportunity) => string) => {
    const inWindow = (fromDays: number, toDays: number) => matched.filter((row) => {
      const created = new Date(dateOf(row));
      return !Number.isNaN(created.getTime()) && created.getTime() >= now - fromDays * 86400000 && created.getTime() < now - toDays * 86400000;
    }).length;
    const recent = inWindow(30, 0);
    const prior = inWindow(60, 30);
    return prior ? Math.round(((recent - prior) / prior) * 100) : recent ? 100 : 0;
  };
  const submittedDelta = deltaFor(rows.filter((row) => viewOf(row).state === 'Submitted'), (row) => viewOf(row).submittedOn || row.updatedAt);
  const awaitingDelta = deltaFor(rows.filter((row) => viewOf(row).state === 'Awaiting Response'), (row) => viewOf(row).submittedOn || row.updatedAt);
  const awardedDelta = deltaFor(rows.filter((row) => viewOf(row).state === 'Awarded'), (row) => awardByOpportunity.get(row.id)?.awardDate || row.updatedAt);

  const clients = useMemo(() => Array.from(new Set(rows.map((row) => row.clientName).filter(Boolean))).sort(), [rows]);
  const sectors = useMemo(() => Array.from(new Set(rows.map((row) => row.category || sectorOf(row)))).sort(), [rows]);
  const types = useMemo(() => Array.from(new Set(rows.map((row) => row.tenderType).filter(Boolean))).sort(), [rows]);
  const officers = useMemo(() => Array.from(new Set(rows.map((row) => row.ownerName).filter(Boolean))).sort(), [rows]);
  const candidates = useMemo(() => opportunities.filter((row) => !isEnquiry(row)), [opportunities]);

  const filtered = useMemo(() => rows.filter((row) => {
    const view = viewOf(row);
    if (tab === 'Late' && !view.late) return false;
    if (tab !== 'All Submissions' && tab !== 'Late' && view.state !== tab) return false;
    const haystack = `${row.title} ${row.clientName} ${row.referenceNo} ${row.ownerName}`.toLowerCase();
    if (search && !haystack.includes(search.toLowerCase())) return false;
    if (client !== 'All Clients' && row.clientName !== client) return false;
    if (sector !== 'All Sectors' && (row.category || sectorOf(row)) !== sector) return false;
    if (tenderType !== 'All Types' && row.tenderType !== tenderType) return false;
    if (status !== 'All Statuses' && view.state !== status) return false;
    if (officer !== 'All Officers' && row.ownerName !== officer) return false;
    if (!within(view.submittedOn, submittedFrom, submittedTo)) return false;
    if (!within(view.due, dueFrom, dueTo)) return false;
    return true;
  }), [client, dueFrom, dueTo, officer, rows, search, sector, status, submittedFrom, submittedTo, tab, tenderType]);

  useEffect(() => { setPage(1); }, [tab, search, client, sector, tenderType, status, officer, submittedFrom, submittedTo, dueFrom, dueTo, pageSize]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const pageIds = pageRows.map((row) => row.id);
  const allPicked = pageIds.length > 0 && pageIds.every((id) => picked.includes(id));
  const selected = rows.find((row) => row.id === selectedId) || filtered[0] || null;
  const selectedView = selected ? viewOf(selected) : null;

  const clearFilters = () => {
    setSearch(''); setClient('All Clients'); setSector('All Sectors'); setTenderType('All Types');
    setStatus('All Statuses'); setOfficer('All Officers'); setSubmittedFrom(''); setSubmittedTo(''); setDueFrom(''); setDueTo('');
  };

  const run = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await work();
      setNotice(done);
      setDialog('');
      setMenuId('');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The action was not saved.');
    } finally {
      setBusy(false);
    }
  };

  const openFor = (row: TenderOpportunity, next: Dialog) => {
    setSelectedId(row.id);
    setDialog(next);
    setMenuId('');
  };

  const communications = useMemo(() => {
    if (!selected) return [];
    const related = itemsByOpportunity.get(selected.id) || [];
    const fromItems = related
      .filter((item) => /communicat|clarif|response|client/i.test(`${item.kind} ${item.title}`))
      .map((item) => ({ id: item.id, title: item.title, source: item.details || item.createdBy || selected.clientName, at: item.createdAt }));
    const fromAudit = approvals
      .filter((item) => item.opportunityId === selected.id)
      .map((item) => ({ id: item.id, title: `${item.stage} ${item.decision}`.trim(), source: item.actor || selected.clientName, at: item.createdAt }));
    return [...fromItems, ...fromAudit].sort((a, b) => (a.at < b.at ? 1 : -1));
  }, [approvals, itemsByOpportunity, selected]);

  const timeline = selected && selectedView ? buildTimeline(selected, selectedView.submission, awardByOpportunity.get(selected.id), approvals, selectedView.state) : [];

  const report = () => {
    downloadCsv('submission-tracking.csv', ['Reference', 'Title', 'Client', 'Submission Date', 'Client Response Due', 'Status', 'Officer', 'Last Update'], filtered.map((row) => {
      const view = viewOf(row);
      return [row.referenceNo, row.title, row.clientName, view.submittedOn, view.due, view.state, row.ownerName, view.updated];
    }));
  };

  return (
    <div className="space-y-3">
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[#2563eb] text-white"><Send className="h-5 w-5" /></span>
          <div>
            <h1 className="text-[22px] font-black tracking-tight text-slate-950">Submission & Tracking</h1>
            <p className="text-[12px] text-slate-500">Submit bids to clients and track submission status, client communications and decision outcomes.</p>
          </div>
        </div>
        <button type="button" onClick={() => setDialog('submit')} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#2563eb] px-4 text-[13px] font-bold text-white"><Plus className="h-4 w-4" /> Submit Bid</button>
      </section>

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <Kpi icon={Send} tint="bg-blue-50 text-blue-600" value={counts.Submitted} label="Submitted" foot={<Delta value={submittedDelta} />} />
        <Kpi icon={Clock3} tint="bg-orange-50 text-orange-500" value={counts['Awaiting Response']} label="Awaiting Client Response" foot={<Delta value={awaitingDelta} />} />
        <Kpi icon={FileText} tint="bg-blue-50 text-blue-600" value={counts['Under Clarification']} label="Under Clarification" foot={<span className="text-slate-400">Client queries received</span>} />
        <Kpi icon={Trophy} tint="bg-emerald-50 text-emerald-600" value={counts.Awarded} label="Awarded to DLE" foot={<Delta value={awardedDelta} />} />
        <Kpi icon={XCircle} tint="bg-rose-50 text-rose-500" value={counts['Not Successful']} label="Not Successful" foot={<span className="text-slate-400">Client decision received</span>} />
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex gap-1 overflow-x-auto border-b border-slate-100 px-3 pt-2">
          {TABS.map((item) => (
            <button key={item} type="button" onClick={() => setTab(item)} className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] font-semibold ${tab === item ? 'border-[#2563eb] text-[#2563eb]' : 'border-transparent text-slate-500'}`}>{item} ({item === 'All Submissions' ? counts.all : counts[item]})</button>
          ))}
        </div>
        <div className="grid gap-2 px-3 py-3 md:grid-cols-3 xl:grid-cols-6">
          <label className="relative md:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by title, client, reference..." className="h-10 w-full rounded-lg border border-slate-200 bg-[#f8fafc] pl-9 pr-3 text-[13px]" />
          </label>
          <Select label="Client" value={client} onChange={setClient} options={['All Clients', ...clients]} />
          <Select label="Sector" value={sector} onChange={setSector} options={['All Sectors', ...sectors]} />
          <Select label="Tender Type" value={tenderType} onChange={setTenderType} options={['All Types', ...types]} />
          <Select label="Submission Status" value={status} onChange={setStatus} options={['All Statuses', ...STATUSES]} />
          <DateRange label="Submission Date" from={submittedFrom} to={submittedTo} onFrom={setSubmittedFrom} onTo={setSubmittedTo} />
          <DateRange label="Client Response Due" from={dueFrom} to={dueTo} onFrom={setDueFrom} onTo={setDueTo} />
          <Select label="Responsible Officer" value={officer} onChange={setOfficer} options={['All Officers', ...officers]} />
          <div className="flex items-end gap-2">
            <button type="button" onClick={clearFilters} className="inline-flex h-10 items-center gap-1 rounded-lg border border-slate-200 px-3 text-[12px] font-semibold text-slate-600"><X className="h-3.5 w-3.5" /> Clear Filters</button>
            <button type="button" onClick={() => setPage(1)} className="inline-flex h-10 items-center gap-1 rounded-lg bg-[#2563eb] px-3 text-[12px] font-bold text-white"><Search className="h-3.5 w-3.5" /> Search</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-[12px]">
            <thead className="bg-[#f8fafc] text-[11px] uppercase text-slate-400">
              <tr>
                <th className="px-3 py-3"><input type="checkbox" checked={allPicked} onChange={() => setPicked(allPicked ? picked.filter((id) => !pageIds.includes(id)) : Array.from(new Set([...picked, ...pageIds])))} aria-label="Select page" /></th>
                {['#', 'Reference No.', 'Title', 'Client', 'Submission Date', 'Client Response Due', 'Status', 'Assigned Officer', 'Last Update', 'Actions'].map((heading) => <th key={heading} className="px-3 py-3 font-semibold">{heading}</th>)}
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? <tr><td colSpan={11} className="px-4 py-10 text-center text-slate-500">{loading ? 'Loading submissions…' : 'No submissions match this view.'}</td></tr> : pageRows.map((row, index) => {
                const view = viewOf(row);
                return (
                  <tr key={row.id} className={`border-t border-slate-100 ${selected?.id === row.id ? 'bg-blue-50/50' : ''}`} onClick={() => setSelectedId(row.id)}>
                    <td className="px-3 py-2.5"><input type="checkbox" checked={picked.includes(row.id)} onChange={() => setPicked((current) => current.includes(row.id) ? current.filter((id) => id !== row.id) : [...current, row.id])} aria-label={`Select ${row.referenceNo}`} /></td>
                    <td className="px-3 py-2.5 text-slate-400">{(safePage - 1) * pageSize + index + 1}</td>
                    <td className="px-3 py-2.5 font-semibold text-blue-700">{row.referenceNo || '—'}</td>
                    <td className="px-3 py-2.5 font-semibold text-slate-800"><Link href={`/commercial/tenders/workspace?id=${row.id}`}>{row.title}</Link></td>
                    <td className="px-3 py-2.5">{row.clientName || '—'}</td>
                    <td className="px-3 py-2.5">{view.submittedOn ? formatWhen(view.submittedOn) : '—'}</td>
                    <td className="px-3 py-2.5"><span className={view.due ? dateTone(view.due) : ''}>{view.due ? formatWhen(view.due) : '—'}</span></td>
                    <td className="px-3 py-2.5"><span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${statusTone[view.state]}`}>{view.state}</span></td>
                    <td className="px-3 py-2.5"><span className="inline-flex items-center gap-2"><span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-[10px] font-black text-blue-700">{initials(row.ownerName || '—')}</span>{row.ownerName || '—'}</span></td>
                    <td className="px-3 py-2.5">{view.updated ? formatWhen(view.updated) : '—'}</td>
                    <td className="px-3 py-2.5" onClick={(event) => event.stopPropagation()}>
                      <RowMenu open={menuId === row.id} disabled={busy} label={`Actions for ${row.referenceNo}`} onToggle={() => setMenuId(menuId === row.id ? '' : row.id)}>
                        <Link href={`/commercial/tenders/workspace?id=${row.id}`} className="block px-3 py-2 hover:bg-slate-50" onClick={() => setMenuId('')}>View workspace</Link>
                        <MenuButton label="Update submission status" onClick={() => openFor(row, 'status')} />
                        <MenuButton label="Record client communication" onClick={() => openFor(row, 'communication')} />
                        <MenuButton label="Log clarification response" onClick={() => openFor(row, 'clarification')} />
                        <MenuButton label="Upload submission documents" onClick={() => openFor(row, 'upload')} />
                        <MenuButton label="View submission checklist" onClick={() => openFor(row, 'checklist')} />
                        <MenuButton label="Send notification" onClick={() => run(() => tenderPost({ action: 'notify', id: row.id, message: `${row.referenceNo} ${row.title} submission needs attention.` }), 'Portal notification raised.')} />
                      </RowMenu>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 text-[12px] text-slate-500">
          <span>Showing {filtered.length === 0 ? 0 : (safePage - 1) * pageSize + 1} to {Math.min(safePage * pageSize, filtered.length)} of {filtered.length} submissions</span>
          <div className="flex items-center gap-2">
            <button type="button" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)} className="h-8 rounded-lg border border-slate-200 px-2 disabled:opacity-40">‹</button>
            {Array.from({ length: pageCount }, (_, index) => (
              <button key={index} type="button" onClick={() => setPage(index + 1)} className={`h-8 min-w-8 rounded-lg px-2 ${safePage === index + 1 ? 'bg-[#2563eb] text-white' : 'border border-slate-200'}`}>{index + 1}</button>
            ))}
            <button type="button" disabled={safePage >= pageCount} onClick={() => setPage(safePage + 1)} className="h-8 rounded-lg border border-slate-200 px-2 disabled:opacity-40">›</button>
            <label className="inline-flex items-center gap-1">Show
              <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} className="h-8 rounded-lg border border-slate-200 px-2" aria-label="Rows per page">
                {[10, 25, 50].map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
            </label>
          </div>
        </div>
      </section>

      <section className="grid gap-3 xl:grid-cols-3">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:col-span-1">
          <h2 className="text-[14px] font-black text-slate-950">Submission Timeline</h2>
          {selected ? <p className="mt-1 text-[12px] text-slate-500">{selected.referenceNo} · {selected.title}</p> : null}
          {timeline.length === 0 ? <p className="py-8 text-center text-[12px] text-slate-400">No submission is selected.</p> : (
            <ol className="mt-5 grid grid-cols-5 gap-1">
              {timeline.map((step, index) => (
                <li key={step.label} className="text-center">
                  <div className="relative flex items-center justify-center">
                    {index > 0 ? <span className={`absolute right-1/2 top-1/2 h-0.5 w-full -translate-y-1/2 ${step.done || timeline[index - 1].done ? 'bg-[#2563eb]' : 'bg-slate-200'}`} /> : null}
                    <span className={`relative z-10 inline-flex h-4 w-4 items-center justify-center rounded-full border-2 ${step.done ? 'border-[#2563eb] bg-[#2563eb]' : step.current ? 'border-[#2563eb] bg-white' : 'border-slate-300 bg-white'}`} />
                  </div>
                  <div className="mt-2 text-[11px] font-bold text-slate-700">{index + 1}. {step.label}</div>
                  <div className="text-[10px] text-slate-400">{step.when ? formatWhen(step.when) : step.note}</div>
                </li>
              ))}
            </ol>
          )}
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-[14px] font-black text-slate-950">Client Communications</h2>
            <button type="button" onClick={() => setShowAllComms((value) => !value)} className="text-[12px] font-semibold text-blue-700">{showAllComms ? 'Show less' : 'View All'}</button>
          </div>
          {communications.length === 0 ? <p className="py-8 text-center text-[12px] text-slate-400">No client communications are recorded.</p> : (
            <ul className="mt-3 space-y-3">
              {(showAllComms ? communications : communications.slice(0, 4)).map((item) => (
                <li key={item.id} className="flex gap-2 text-[12px]">
                  <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                  <div>
                    <div className="font-semibold text-slate-800">{item.title}</div>
                    <div className="text-slate-400">{item.source} · {stamp(item.at)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-[14px] font-black text-slate-950">Quick Actions</h2>
          <div className="mt-3 space-y-2">
            <Quick icon={Upload} label="Upload Submission Documents" onClick={() => selected ? setDialog('upload') : setError('Select a submission first.')} />
            <Quick icon={MessageSquare} label="Record Client Communication" onClick={() => selected ? setDialog('communication') : setError('Select a submission first.')} />
            <Quick icon={Check} label="Update Submission Status" onClick={() => selected ? setDialog('status') : setError('Select a submission first.')} />
            <Quick icon={FileText} label="Log Clarification Response" onClick={() => selected ? setDialog('clarification') : setError('Select a submission first.')} />
            <Quick icon={ListChecks} label="View Submission Checklist" onClick={() => selected ? setDialog('checklist') : setError('Select a submission first.')} />
            <Quick icon={BarChart3} label="Generate Submission Report" onClick={report} />
          </div>
        </article>
      </section>

      {dialog === 'submit' ? <SubmitModal opportunities={candidates} busy={busy} presetId={selected?.id || ''} onClose={() => setDialog('')} onSave={(body) => run(async () => {
        await tenderPost({ action: 'submission', id: body.opportunityId, submission: { channel: body.channel, receiptReference: body.receiptReference, notes: [body.notes, body.responseDue ? `Response due: ${body.responseDue}` : ''].filter(Boolean).join('\n') } });
        if (body.responseDue) await tenderPost({ action: 'item', id: body.opportunityId, item: { kind: 'Client Response', title: 'Client response due', details: body.notes, dueAt: body.responseDue } });
      }, 'Bid submission recorded.')} /> : null}
      {dialog === 'status' && selected ? <StatusModal row={selected} lookups={lookups} busy={busy} onClose={() => setDialog('')} onSave={(body) => run(() => saveStatus(selected, body), `${selected.referenceNo} marked ${body.status}.`)} /> : null}
      {dialog === 'communication' && selected ? <NoteModal title="Record Client Communication" busy={busy} onClose={() => setDialog('')} onSave={(body) => run(async () => {
        await tenderPost({ action: 'item', id: selected.id, item: { kind: 'Communication', title: body.title, details: body.details, dueAt: body.dueAt } });
      }, 'Client communication recorded.')} /> : null}
      {dialog === 'clarification' && selected ? <NoteModal title="Log Clarification Response" busy={busy} markClarification onClose={() => setDialog('')} onSave={(body) => run(async () => {
        await tenderPost({ action: 'item', id: selected.id, item: { kind: 'Clarification', title: body.title, details: body.details, dueAt: body.dueAt } });
        if (body.markClarification) await tenderPost({ action: 'save', opportunity: { ...selected, status: 'Under Clarification', stage: 'Submitted', saveMode: 'submit' } });
      }, 'Clarification response logged.')} /> : null}
      {dialog === 'upload' && selected ? <UploadModal busy={busy} onClose={() => setDialog('')} onSave={(file) => run(() => tenderUpload(selected.id, file, 'Submission'), `${file.name} uploaded to ${selected.referenceNo}.`)} /> : null}
      {dialog === 'checklist' && selected ? <ChecklistModal row={selected} onClose={() => setDialog('')} /> : null}
    </div>
  );
}

const saveStatus = (row: TenderOpportunity, body: { status: TrackStatus; responseDue: string; note: string; contractRef: string; awardedValue: string; department: string; location: string; site: string; estimatedValue: string }) => {
  if (body.status === 'Awarded') {
    return tenderPost({ action: 'award', id: row.id, award: { contractRef: body.contractRef, awardedValue: Number(body.awardedValue || 0), currency: row.currency || 'NGN', awardDate: new Date().toISOString().slice(0, 10), handoverNotes: body.note } });
  }
  const status = body.status === 'Not Successful' ? 'Lost' : body.status === 'Withdrawn' ? 'Withdrawn' : body.status === 'Submitted' ? 'Submitted' : body.status;
  const opportunity = {
    ...row,
    status,
    stage: 'Submitted',
    department: body.department || row.department,
    location: body.location || row.location,
    site: body.site || row.site,
    estimatedValue: body.estimatedValue ? Number(body.estimatedValue) : row.estimatedValue,
    saveMode: 'submit' as const,
  };
  return Promise.all([
    tenderPost({ action: 'save', opportunity }),
    body.responseDue ? tenderPost({ action: 'item', id: row.id, item: { kind: 'Client Response', title: 'Client response due', details: body.note, dueAt: body.responseDue } }) : Promise.resolve(),
  ]);
};

function buildTimeline(row: TenderOpportunity, submission: TenderSubmission | undefined, award: TenderAward | undefined, approvals: TenderApproval[], state: TrackStatus) {
  const approval = approvals.find((item) => item.opportunityId === row.id && item.decision === 'APPROVE');
  const decided = state === 'Awarded' || state === 'Not Successful' || state === 'Withdrawn';
  return [
    { label: 'Bid Preparation', when: row.createdAt, note: 'Pending', done: true, current: false },
    { label: 'Internal Approval', when: approval?.createdAt || '', note: approval ? 'Approved' : 'Pending', done: Boolean(approval), current: !approval },
    { label: 'Submitted to Client', when: submission?.submittedAt || '', note: submission ? 'Submitted' : 'Pending', done: Boolean(submission), current: !submission && Boolean(approval) },
    { label: 'Client Evaluation', when: '', note: submission && !decided ? 'In Progress' : decided ? 'Complete' : 'Pending', done: decided, current: Boolean(submission) && !decided },
    { label: 'Client Decision', when: award?.awardDate || (decided ? row.updatedAt : ''), note: decided ? state : 'Pending', done: decided, current: false },
  ];
}

function SubmitModal({ opportunities, presetId, busy, onClose, onSave }: { opportunities: TenderOpportunity[]; presetId: string; busy: boolean; onClose: () => void; onSave: (body: { opportunityId: string; channel: string; receiptReference: string; responseDue: string; notes: string }) => void }) {
  const [opportunityId, setOpportunityId] = useState(presetId);
  const [channel, setChannel] = useState(CHANNELS[0]);
  const [receiptReference, setReceiptReference] = useState('');
  const [responseDue, setResponseDue] = useState('');
  const [notes, setNotes] = useState('');
  return (
    <Modal title="Submit Bid" subtitle="Record the bid sent to the client." onClose={onClose}>
      <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); onSave({ opportunityId, channel, receiptReference, responseDue, notes }); }}>
        <ActingEmployee />
        <Field label="Opportunity"><select required value={opportunityId} onChange={(event) => setOpportunityId(event.target.value)} className={input} aria-label="Opportunity"><option value="">Select opportunity...</option>{opportunities.map((row) => <option key={row.id} value={row.id}>{row.referenceNo} · {row.title}</option>)}</select></Field>
        <Field label="Channel"><select value={channel} onChange={(event) => setChannel(event.target.value)} className={input} aria-label="Channel">{CHANNELS.map((item) => <option key={item}>{item}</option>)}</select></Field>
        <Field label="Receipt / acknowledgement reference"><input required value={receiptReference} onChange={(event) => setReceiptReference(event.target.value)} className={input} /></Field>
        <Field label="Client response due"><input type="date" value={responseDue} onChange={(event) => setResponseDue(event.target.value)} className={input} /></Field>
        <Field label="Notes"><textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="min-h-20 w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px]" /></Field>
        <Actions busy={busy} onClose={onClose} label="Record submission" />
      </form>
    </Modal>
  );
}

function StatusModal({ row, lookups, busy, onClose, onSave }: { row: TenderOpportunity; lookups: TenderLookups | null; busy: boolean; onClose: () => void; onSave: (body: { status: TrackStatus; responseDue: string; note: string; contractRef: string; awardedValue: string; department: string; location: string; site: string; estimatedValue: string }) => void }) {
  const [status, setStatus] = useState<TrackStatus>('Awaiting Response');
  const [responseDue, setResponseDue] = useState('');
  const [note, setNote] = useState('');
  const [contractRef, setContractRef] = useState('');
  const [awardedValue, setAwardedValue] = useState('');
  const [department, setDepartment] = useState(row.department);
  const [location, setLocation] = useState(row.location);
  const [site, setSite] = useState(row.site);
  const [estimatedValue, setEstimatedValue] = useState(row.estimatedValue ? String(row.estimatedValue) : '');
  const incomplete = !(department && location && site && Number(estimatedValue) > 0);
  return (
    <Modal title="Update Submission Status" subtitle={`${row.referenceNo} · ${row.title}`} onClose={onClose}>
      <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); onSave({ status, responseDue, note, contractRef, awardedValue, department, location, site, estimatedValue }); }}>
        <ActingEmployee />
        <Field label="Status"><select value={status} onChange={(event) => setStatus(event.target.value as TrackStatus)} className={input} aria-label="Status">{STATUSES.map((item) => <option key={item}>{item}</option>)}</select></Field>
        {status === 'Awarded' ? (
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Contract reference"><input required value={contractRef} onChange={(event) => setContractRef(event.target.value)} className={input} /></Field>
            <Field label="Awarded value"><input required type="number" min="0" step="0.01" value={awardedValue} onChange={(event) => setAwardedValue(event.target.value)} className={input} /></Field>
          </div>
        ) : (
          <>
            <Field label="Client response due"><input type="date" value={responseDue} onChange={(event) => setResponseDue(event.target.value)} className={input} /></Field>
            {incomplete ? (
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Department"><select required value={department} onChange={(event) => setDepartment(event.target.value)} className={input} aria-label="Department"><option value="">Select department</option>{(lookups?.departments || []).map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select></Field>
                <Field label="Location"><select required value={location} onChange={(event) => setLocation(event.target.value)} className={input} aria-label="Location"><option value="">Select location</option>{(lookups?.locations || []).map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select></Field>
                <Field label="Site"><select required value={site} onChange={(event) => setSite(event.target.value)} className={input} aria-label="Site"><option value="">Select site</option>{(lookups?.sites || []).map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select></Field>
                <Field label="Estimated value"><input required type="number" min="0.01" step="0.01" value={estimatedValue} onChange={(event) => setEstimatedValue(event.target.value)} className={input} /></Field>
              </div>
            ) : null}
          </>
        )}
        <Field label="Note"><textarea value={note} onChange={(event) => setNote(event.target.value)} className="min-h-20 w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px]" /></Field>
        <Actions busy={busy} onClose={onClose} label="Save status" />
      </form>
    </Modal>
  );
}

function NoteModal({ title, busy, markClarification = false, onClose, onSave }: { title: string; busy: boolean; markClarification?: boolean; onClose: () => void; onSave: (body: { title: string; details: string; dueAt: string; markClarification: boolean }) => void }) {
  const [subject, setSubject] = useState('');
  const [details, setDetails] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [mark, setMark] = useState(markClarification);
  return (
    <Modal title={title} subtitle="This is stored on the selected submission." onClose={onClose}>
      <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); onSave({ title: subject, details, dueAt, markClarification: mark }); }}>
        <ActingEmployee />
        <Field label="Subject"><input required value={subject} onChange={(event) => setSubject(event.target.value)} className={input} /></Field>
        <Field label="Details"><textarea required value={details} onChange={(event) => setDetails(event.target.value)} className="min-h-24 w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px]" /></Field>
        <Field label="Due date"><input type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} className={input} /></Field>
        {markClarification ? <label className="flex items-center gap-2 text-[12px] text-slate-600"><input type="checkbox" checked={mark} onChange={(event) => setMark(event.target.checked)} /> Mark the submission as Under Clarification</label> : null}
        <Actions busy={busy} onClose={onClose} label="Save" />
      </form>
    </Modal>
  );
}

function UploadModal({ busy, onClose, onSave }: { busy: boolean; onClose: () => void; onSave: (file: File) => void }) {
  const [file, setFile] = useState<File | null>(null);
  return (
    <Modal title="Upload Submission Documents" subtitle="The file is stored against the selected opportunity." onClose={onClose}>
      <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); if (file) onSave(file); }}>
        <ActingEmployee />
        <input required type="file" onChange={(event) => setFile(event.target.files?.[0] || null)} className="block w-full text-[13px]" />
        <Actions busy={busy} onClose={onClose} label="Upload" />
      </form>
    </Modal>
  );
}

function ChecklistModal({ row, onClose }: { row: TenderOpportunity; onClose: () => void }) {
  const [documents, setDocuments] = useState<TenderDocument[]>([]);
  const [related, setRelated] = useState<TenderItem[]>([]);
  const [submission, setSubmission] = useState<TenderSubmission | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    tenderGet<{ documents: TenderDocument[]; items: TenderItem[]; submissions: TenderSubmission[] }>('opportunity', { id: row.id })
      .then((detail) => {
        setDocuments(detail.documents || []);
        setRelated(detail.items || []);
        setSubmission(detail.submissions?.[0] || null);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Unable to read the checklist.'));
  }, [row.id]);
  const checks = [
    { label: 'Bid recorded as submitted', done: Boolean(submission) },
    { label: 'Receipt reference captured', done: Boolean(submission?.receiptReference) },
    { label: 'Submission documents uploaded', done: documents.some((item) => /submission|tender document/i.test(item.category)) || documents.length > 0 },
    { label: 'Open compliance items closed', done: related.filter((item) => /comply|compliance/i.test(item.kind)).every((item) => /done|closed|complete|waived/i.test(item.status)) },
  ];
  return (
    <Modal title="Submission Checklist" subtitle={`${row.referenceNo} · ${row.title}`} onClose={onClose} wide>
      {error ? <p className="mb-3 text-[12px] text-rose-600">{error}</p> : null}
      <ul className="space-y-2">
        {checks.map((item) => <li key={item.label} className="flex items-center gap-2 text-[13px]"><span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${item.done ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>{item.done ? '✓' : '–'}</span>{item.label}</li>)}
      </ul>
      <div className="mt-4"><BlueprintRegisters opportunityId={row.id} focus="submission" /></div>
    </Modal>
  );
}

const input = 'h-10 w-full rounded-lg border border-slate-200 px-3 text-[13px]';
const dateTone = (value: string) => {
  const days = daysUntil(value);
  if (days != null && days < 0) return 'rounded-md bg-rose-50 px-2 py-0.5 font-semibold text-rose-600';
  if (days != null && days <= 7) return 'rounded-md bg-amber-50 px-2 py-0.5 font-semibold text-amber-700';
  return 'text-slate-700';
};

function Kpi({ icon: Icon, tint, value, label, foot }: { icon: typeof Send; tint: string; value: number; label: string; foot: ReactNode }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[26px] font-black leading-none text-slate-950">{value}</div>
          <div className="mt-1 text-[12px] font-semibold text-slate-500">{label}</div>
        </div>
        <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${tint}`}><Icon className="h-4 w-4" /></span>
      </div>
      <div className="mt-2 text-[11px] font-semibold">{foot}</div>
    </article>
  );
}

function Delta({ value }: { value: number }) {
  return <span className={value >= 0 ? 'text-emerald-600' : 'text-rose-600'}>{value >= 0 ? '↑' : '↓'} {Math.abs(value)}% vs. last 30 days</span>;
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return (
    <label className="block text-[11px] font-semibold text-slate-400">{label}
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-[12px] font-semibold text-slate-700" aria-label={label}>
        {options.map((option) => <option key={option}>{option}</option>)}
      </select>
    </label>
  );
}

function DateRange({ label, from, to, onFrom, onTo }: { label: string; from: string; to: string; onFrom: (value: string) => void; onTo: (value: string) => void }) {
  return (
    <label className="block text-[11px] font-semibold text-slate-400">{label}
      <span className="mt-1 flex gap-1">
        <input type="date" value={from} onChange={(event) => onFrom(event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 px-2 text-[12px]" aria-label={`${label} from`} />
        <input type="date" value={to} onChange={(event) => onTo(event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 px-2 text-[12px]" aria-label={`${label} to`} />
      </span>
    </label>
  );
}

function MenuButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="block w-full px-3 py-2 text-left hover:bg-slate-50">{label}</button>;
}

function Quick({ icon: Icon, label, onClick }: { icon: typeof Upload; label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[13px] font-semibold text-slate-700 hover:bg-slate-50"><Icon className="h-4 w-4 text-blue-600" />{label}</button>;
}

function Modal({ title, subtitle, wide = false, onClose, children }: { title: string; subtitle: string; wide?: boolean; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4">
      <div className={`my-6 w-full rounded-2xl bg-white p-5 shadow-xl ${wide ? 'max-w-4xl' : 'max-w-lg'}`}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[16px] font-black text-slate-950">{title}</h2>
            <p className="text-[12px] text-slate-500">{subtitle}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-[12px] font-semibold text-slate-500">{label}<div className="mt-1">{children}</div></label>;
}

function Actions({ busy, onClose, label }: { busy: boolean; onClose: () => void; label: string }) {
  return (
    <div className="flex justify-end gap-2">
      <button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-200 px-3 text-[12px] font-semibold">Cancel</button>
      <button type="submit" disabled={busy} className="h-9 rounded-lg bg-[#2563eb] px-3 text-[12px] font-bold text-white disabled:opacity-50">{busy ? 'Saving…' : label}</button>
    </div>
  );
}
