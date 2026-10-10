'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  GitBranch,
  History,
  ListChecks,
  MessageSquare,
  RotateCcw,
  XCircle,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from 'lucide-react';
import { daysUntil, fileSize } from '@/lib/commercial/tender-present';
import { formatWhen, money, tenderPost } from './tender-api';
import { Pill } from './tender-widgets';
import { useTenderRecord } from './use-tender-record';

const TABS: Array<{ id: string; icon: LucideIcon; count?: 'comments' | 'checks' | 'related' }> = [
  { id: 'Document Review', icon: FileText },
  { id: 'Approval Comments', icon: MessageSquare, count: 'comments' },
  { id: 'Checklist', icon: ListChecks, count: 'checks' },
  { id: 'Approval Workflow', icon: GitBranch },
  { id: 'Version History', icon: History },
  { id: 'Related Items', icon: FileText, count: 'related' },
];

const CHECKS = ['Complete BOQ with unit rates', 'Cost estimation summary', 'Assumptions and basis of estimate', 'Quantity take-off sheets', 'Material price quotations', 'Labour and manpower estimate', 'Equipment and vendor quotes', 'Contingency and escalation', 'Cost breakdown by discipline', 'Management summary'];
const ROUTE = ['Engineering Review', 'Commercial Review', 'Finance Review', 'Legal Review', 'HSE Review', 'Management Approval'];

const toneFor = (status: string) => {
  if (/approv|complete|done/i.test(status)) return 'bg-emerald-50 text-emerald-700';
  if (/progress|open/i.test(status)) return 'bg-blue-50 text-blue-700';
  if (/return|pending|medium/i.test(status)) return 'bg-amber-50 text-amber-700';
  if (/reject|high|not started/i.test(status)) return 'bg-rose-50 text-rose-600';
  return 'bg-slate-100 text-slate-500';
};

export function ApprovalBoard() {
  const record = useTenderRecord();
  const [tab, setTab] = useState('Document Review');
  const [actionsOpen, setActionsOpen] = useState(false);
  const [comment, setComment] = useState('');
  const [docIndex, setDocIndex] = useState(0);
  const [zoom, setZoom] = useState(100);
  const opportunity = record.opportunity;
  const documents = record.detail?.documents || [];
  const approvals = record.detail?.approvals || [];
  const lines = record.detail?.lines || [];
  const safeIndex = documents.length ? Math.min(docIndex, documents.length - 1) : 0;
  const document = documents[safeIndex];
  const days = opportunity ? daysUntil(opportunity.submissionDeadline || opportunity.closingDate) : null;
  const rowIndex = record.rows.findIndex((row) => row.id === record.selectedId);
  const checks = CHECKS.map((label, index) => {
    const token = label.split(' ')[0].toLowerCase();
    const done = index === 0 ? lines.length > 0 : index === 1 ? Boolean(opportunity?.estimatedValue) : documents.some((item) => token.length > 2 && `${item.category} ${item.fileName}`.toLowerCase().includes(token));
    return { label, done };
  });
  const doneCount = checks.filter((item) => item.done).length;
  const progress = CHECKS.length ? Math.round((doneCount / CHECKS.length) * 100) : 0;
  const route = ROUTE.map((stage) => {
    const match = approvals.find((item) => item.decision !== 'COMMENT' && item.stage.toLowerCase().includes(stage.split(' ')[0].toLowerCase()));
    return { stage, match };
  });
  const currentRoute = route.find((item) => !item.match);
  const reviewStatus = !opportunity ? '—' : doneCount === 0 ? 'Not Started' : doneCount === CHECKS.length ? 'Completed' : 'In Progress';
  const counts = { comments: approvals.length, checks: CHECKS.length, related: documents.length };

  const act = async (decision: string) => {
    if (!opportunity) return;
    record.setError('');
    try {
      await tenderPost({ action: 'approval', id: opportunity.id, approval: { stage: 'COMMERCIAL', decision, comments: comment } });
      record.setNotice(decision === 'APPROVE' ? 'Approved and moved forward.' : decision === 'REJECT' ? 'Rejected.' : decision === 'COMMENT' ? 'Comment posted.' : 'Returned for revision.');
      setComment('');
      setActionsOpen(false);
      await record.reload();
    } catch (reason) {
      record.setError(reason instanceof Error ? reason.message : 'Approval was not saved.');
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-slate-400">
        <div>
          Tender Management <span className="px-1">›</span>
          <Link href="/commercial/tenders/workspace" className="hover:text-slate-700">Tender Workspace</Link>
          <span className="px-1">›</span> Approvals <span className="px-1">›</span>
          <span className="font-semibold text-slate-600">Approval Details</span>
        </div>
        {record.rows.length > 1 ? (
          <select value={record.selectedId} onChange={(event) => { record.setSelectedId(event.target.value); setDocIndex(0); }} className="h-8 max-w-[280px] rounded-lg border border-slate-200 bg-white px-2 text-[12px] font-semibold text-slate-600" aria-label="Open opportunity">
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
              <h1 className="text-[22px] font-black tracking-tight text-slate-950">Approval Details</h1>
              <p className="text-[12px] text-slate-500">Review document, comments and take approval action</p>
              <p className="mt-1 text-[12px] text-slate-600">
                <b className="font-semibold text-slate-800">{opportunity?.title || (record.loading ? 'Loading approval…' : 'No opportunity is open')}</b>
                <span className="px-1.5 text-slate-300">|</span>Client: <b className="font-semibold">{opportunity?.clientName || '—'}</b>
                <span className="px-1.5 text-slate-300">|</span>Ref: <b className="font-semibold">{opportunity?.referenceNo || '—'}</b>
                <span className="px-1.5 text-slate-300">|</span>Sector: <b className="font-semibold">{opportunity?.category || '—'}</b>
                <span className="px-1.5 text-slate-300">|</span>Estimated Value: <b className="font-semibold">{opportunity ? money(opportunity.estimatedValue, opportunity.currency) : '—'}</b>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex h-11 items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 text-[12px] shadow-sm">
              <span className="text-amber-700/70">Current Stage</span>
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              <span className="font-bold text-amber-700">{opportunity?.stage || '—'}</span>
            </div>
            <div className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 shadow-sm">
              <span>
                <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Due Date</span>
                <span className="text-[12px] font-bold text-slate-800">{opportunity ? formatWhen(opportunity.submissionDeadline || opportunity.closingDate) : '—'}</span>
              </span>
              {days != null ? <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-600">{days} days left</span> : null}
            </div>
            <button type="button" disabled={rowIndex <= 0} onClick={() => { record.setSelectedId(record.rows[rowIndex - 1]?.id || ''); setDocIndex(0); }} className="inline-flex h-11 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-[12px] font-bold text-slate-700 disabled:opacity-40">
              <ChevronLeft className="h-4 w-4" /> Previous
            </button>
            <div className="relative">
              <button type="button" onClick={() => setActionsOpen((value) => !value)} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#2563eb] px-4 text-sm font-bold text-white shadow-sm">Actions <ChevronDown className="h-4 w-4" /></button>
              {actionsOpen ? (
                <div className="absolute right-0 top-12 z-20 w-52 rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-lg">
                  <button type="button" className="block w-full px-3 py-2 text-left hover:bg-slate-50 disabled:text-slate-300" disabled={!opportunity} onClick={() => act('APPROVE')}>Approve</button>
                  <button type="button" className="block w-full px-3 py-2 text-left hover:bg-slate-50 disabled:text-slate-300" disabled={!opportunity} onClick={() => act('RETURN')}>Return for revision</button>
                  <button type="button" className="block w-full px-3 py-2 text-left hover:bg-slate-50 disabled:text-slate-300" disabled={!opportunity} onClick={() => act('REJECT')}>Reject</button>
                  <Link href={opportunity ? `/commercial/tenders/workspace?id=${opportunity.id}` : '/commercial/tenders/workspace'} className="block px-3 py-2 hover:bg-slate-50">Open workspace</Link>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"><FileText className="h-5 w-5" /></span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-[15px] font-black text-slate-950">{document?.fileName || 'No document uploaded'}</h2>
              <Pill className={toneFor(reviewStatus)}>{reviewStatus}</Pill>
              {opportunity?.priority ? <Pill className={toneFor(opportunity.priority === 'High' ? 'High' : opportunity.priority)}>{opportunity.priority} Priority</Pill> : null}
              <Pill className="bg-slate-100 text-slate-600">Version —</Pill>
            </div>
            <p className="text-[12px] text-slate-500">{document?.category || opportunity?.stage || '—'}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[11px] sm:grid-cols-4">
          {[['Reference No.', opportunity?.referenceNo || '—'], ['Submitted By', document?.uploadedBy || opportunity?.ownerName || '—'], ['Submitted Date', document ? formatWhen(document.uploadedAt) : '—'], ['Current Approver', currentRoute ? (opportunity?.ownerName || '—') : (route[route.length - 1]?.match?.actor || '—')]].map(([label, value]) => (
            <div key={label}><div className="text-slate-400">{label}</div><div className="font-bold text-slate-800">{value}</div></div>
          ))}
        </div>
      </section>

      <div className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white px-2 shadow-sm">
        {TABS.map((item) => {
          const Icon = item.icon;
          const selected = tab === item.id;
          const count = item.count ? counts[item.count] : null;
          return (
            <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-3 text-[13px] font-semibold ${selected ? 'border-[#2563eb] text-[#2563eb]' : 'border-transparent text-slate-500'}`}>
              <Icon className="h-3.5 w-3.5" />{item.id}{count != null ? ` (${count})` : ''}
            </button>
          );
        })}
      </div>

      {tab !== 'Document Review' ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {tab === 'Approval Comments' ? <Comments approvals={approvals} /> : null}
          {tab === 'Checklist' ? <ChecklistTable checks={checks} /> : null}
          {tab === 'Approval Workflow' ? <RouteList route={route} /> : null}
          {tab === 'Version History' ? <VersionTable documents={documents} /> : null}
          {tab === 'Related Items' ? <RelatedTable documents={documents} /> : null}
        </section>
      ) : (
        <div className="grid items-start gap-3 xl:grid-cols-12">
          <Panel className="xl:col-span-5" title="Document Viewer">
            <div className="mb-2 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5 text-[12px]">
              <div className="flex items-center gap-1">
                <button type="button" disabled={safeIndex <= 0} onClick={() => setDocIndex((value) => Math.max(0, value - 1))} className="inline-flex h-7 w-7 items-center justify-center rounded-lg hover:bg-white disabled:opacity-40" aria-label="Previous document"><ChevronLeft className="h-4 w-4" /></button>
                <span className="min-w-14 text-center font-semibold text-slate-700">{documents.length ? `${safeIndex + 1} / ${documents.length}` : '— / —'}</span>
                <button type="button" disabled={safeIndex >= documents.length - 1} onClick={() => setDocIndex((value) => value + 1)} className="inline-flex h-7 w-7 items-center justify-center rounded-lg hover:bg-white disabled:opacity-40" aria-label="Next document"><ChevronRight className="h-4 w-4" /></button>
              </div>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setZoom((value) => Math.max(80, value - 10))} className="inline-flex h-7 w-7 items-center justify-center rounded-lg hover:bg-white" aria-label="Zoom out"><ZoomOut className="h-3.5 w-3.5" /></button>
                <span className="w-10 text-center font-semibold">{zoom}%</span>
                <button type="button" onClick={() => setZoom((value) => Math.min(150, value + 10))} className="inline-flex h-7 w-7 items-center justify-center rounded-lg hover:bg-white" aria-label="Zoom in"><ZoomIn className="h-3.5 w-3.5" /></button>
                {document ? <a className="inline-flex h-7 w-7 items-center justify-center rounded-lg hover:bg-white" href={`/api/commercial/tenders?resource=document&documentId=${document.id}`} aria-label="Download document"><Download className="h-3.5 w-3.5" /></a> : <span className="inline-flex h-7 w-7 items-center justify-center text-slate-300"><Download className="h-3.5 w-3.5" /></span>}
              </div>
            </div>
            <div className="h-[420px] overflow-auto rounded-xl border border-slate-200 bg-slate-50">
              {document ? (
                /pdf|image/.test(document.contentType) ? <iframe title={document.fileName} src={`/api/commercial/tenders?resource=document&documentId=${document.id}`} className="h-full w-full origin-top-left" style={{ transform: `scale(${zoom / 100})` }} /> : (
                  <a className="flex h-full flex-col items-center justify-center text-sm font-semibold text-blue-700" href={`/api/commercial/tenders?resource=document&documentId=${document.id}`}>{document.fileName}<span className="mt-1 font-normal text-slate-400">{fileSize(document.sizeBytes)} · Open file</span></a>
                )
              ) : <div className="flex h-full items-center justify-center text-sm text-slate-500">No document has been uploaded for review.</div>}
            </div>
          </Panel>

          <Panel className="xl:col-span-4" title="Approval Checklist" action={<span className="text-[12px] font-semibold text-blue-700">{doneCount} of {CHECKS.length} completed</span>}>
            <div className="mb-2 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${progress}%` }} /></div>
              <span className="text-[12px] font-bold text-slate-500">{progress}%</span>
            </div>
            <ChecklistTable checks={checks} />
          </Panel>

          <div className="space-y-3 xl:col-span-3">
            <Panel title="Approver Actions">
              <ActionButton disabled={!opportunity} onClick={() => act('APPROVE')} icon={CheckCircle2} title="Approve" detail="Complete review and move to next stage" className="border-emerald-200 bg-emerald-50 text-emerald-700" />
              <ActionButton disabled={!opportunity} onClick={() => act('RETURN')} icon={RotateCcw} title="Return for Revision" detail="Send back with comments" className="border-amber-200 bg-amber-50 text-amber-700" />
              <ActionButton disabled={!opportunity} onClick={() => act('REJECT')} icon={XCircle} title="Reject" detail="Stop approval process" className="border-rose-200 bg-rose-50 text-rose-600" />
            </Panel>
            <Panel title="Approval Routing">
              <RouteList route={route} />
            </Panel>
            <Panel title="Related Items" action={<button type="button" onClick={() => setTab('Related Items')} className="text-[12px] font-semibold text-blue-700">View All →</button>}>
              <RelatedTable documents={documents.slice(0, 5)} />
            </Panel>
          </div>

          <Panel className="xl:col-span-7" title={`Departmental Comments (${approvals.length})`}>
            <div className="mb-3 flex gap-2">
              <input value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Add a comment… Use @ to mention team members" className="h-10 flex-1 rounded-lg border border-slate-200 px-3 text-[13px]" />
              <button type="button" disabled={!opportunity} onClick={() => act('COMMENT')} className="rounded-lg bg-[#2563eb] px-3 text-sm font-bold text-white disabled:opacity-50">Post Comment</button>
            </div>
            <Comments approvals={approvals} />
          </Panel>
          <Panel className="xl:col-span-5" title="Version History">
            <VersionTable documents={documents} />
          </Panel>
        </div>
      )}
    </div>
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

function ActionButton({ icon: Icon, title, detail, className, onClick, disabled }: { icon: LucideIcon; title: string; detail: string; className: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={`mb-2 flex w-full items-start gap-2 rounded-xl border px-3 py-2.5 text-left last:mb-0 disabled:opacity-50 ${className}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <span><span className="block text-[13px] font-black">{title}</span><span className="block text-[11px] font-medium opacity-80">{detail}</span></span>
    </button>
  );
}

function ChecklistTable({ checks }: { checks: Array<{ label: string; done: boolean }> }) {
  return (
    <table className="w-full text-left text-[12px]">
      <thead className="text-[11px] text-slate-400"><tr>{['#', 'Requirement', 'Status', 'Remarks'].map((heading) => <th key={heading} className="pb-2 font-semibold">{heading}</th>)}</tr></thead>
      <tbody>
        {checks.map((item, index) => (
          <tr key={item.label} className="border-t border-slate-100">
            <td className="py-2 text-slate-400">{index + 1}</td>
            <td className="py-2 font-semibold text-slate-800">{item.label}</td>
            <td className="py-2"><Pill className={item.done ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'}>{item.done ? 'Completed' : 'Not Started'}</Pill></td>
            <td className="py-2 text-slate-400">{item.done ? 'On file' : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RouteList({ route }: { route: Array<{ stage: string; match?: { actor: string; decision: string; createdAt: string } }> }) {
  const current = route.findIndex((item) => !item.match);
  return (
    <ol className="space-y-2">
      {route.map((item, index) => {
        const status = item.match ? (/approv/i.test(item.match.decision) ? 'Approved' : /reject/i.test(item.match.decision) ? 'Rejected' : /return/i.test(item.match.decision) ? 'Returned' : item.match.decision) : index === current ? 'In Progress' : 'Pending';
        const circle = item.match ? 'bg-emerald-500 text-white' : index === current ? 'bg-[#2563eb] text-white' : 'bg-slate-100 text-slate-400';
        return (
          <li key={item.stage} className="flex items-center gap-2 text-[12px]">
            <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-black ${circle}`}>{index + 1}</span>
            <span className="min-w-0 flex-1">
              <b className="block truncate text-slate-800">{item.stage}</b>
              <span className="block truncate text-slate-400">{item.match?.actor || '—'}</span>
            </span>
            <Pill className={toneFor(status)}>{status}</Pill>
          </li>
        );
      })}
    </ol>
  );
}

function Comments({ approvals }: { approvals: Array<{ id: string; actor: string; stage: string; comments: string; decision: string; createdAt: string }> }) {
  if (approvals.length === 0) return <p className="py-4 text-center text-sm text-slate-500">No comments yet.</p>;
  return (
    <div>
      {approvals.map((item) => {
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

function VersionTable({ documents }: { documents: Array<{ id: string; fileName: string; uploadedBy: string; uploadedAt: string; category: string }> }) {
  return (
    <table className="w-full text-left text-[12px]">
      <thead className="text-[11px] text-slate-400"><tr>{['Version', 'Date', 'Uploaded By', 'Remarks', 'Action'].map((heading) => <th key={heading} className="pb-2 font-semibold">{heading}</th>)}</tr></thead>
      <tbody>
        {documents.length === 0 ? <tr><td colSpan={5} className="py-6 text-center text-slate-500">No document versions yet.</td></tr> : documents.map((item) => (
          <tr key={item.id} className="border-t border-slate-100">
            <td className="py-2 font-semibold text-slate-500">—</td>
            <td className="py-2">{formatWhen(item.uploadedAt)}</td>
            <td className="py-2">{item.uploadedBy || '—'}</td>
            <td className="py-2">{item.category || item.fileName}</td>
            <td className="py-2"><a className="font-semibold text-blue-700" href={`/api/commercial/tenders?resource=document&documentId=${item.id}`}>View</a></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RelatedTable({ documents }: { documents: Array<{ id: string; fileName: string; category: string }> }) {
  return (
    <table className="w-full text-left text-[12px]">
      <thead className="text-[11px] text-slate-400"><tr>{['#', 'Item', 'Type', 'Status'].map((heading) => <th key={heading} className="pb-2 font-semibold">{heading}</th>)}</tr></thead>
      <tbody>
        {documents.length === 0 ? <tr><td colSpan={4} className="py-6 text-center text-slate-500">No related documents.</td></tr> : documents.map((item, index) => (
          <tr key={item.id} className="border-t border-slate-100">
            <td className="py-2 text-slate-400">{index + 1}</td>
            <td className="py-2 font-semibold text-slate-800">{item.fileName}</td>
            <td className="py-2">Document</td>
            <td className="py-2"><Pill className="bg-blue-50 text-blue-700">{item.category || 'Filed'}</Pill></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
