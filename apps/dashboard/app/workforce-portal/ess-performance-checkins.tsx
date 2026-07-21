'use client';

import { useState } from 'react';
import { Loader2, MessageSquare, Send } from 'lucide-react';
import type { EssCheckInRow, EssPerformanceWorkspace } from '@/lib/ess-performance-workspace';
import { EssCard, EssEmptyState } from './ess-portal-ui';

const CHECKIN_STATUSES = ['On Track', 'At Risk', 'Blocked', 'Ahead'];

type EssPerformanceCheckInsProps = {
  workspace: EssPerformanceWorkspace;
  saving?: boolean;
  onAction: (action: string, payload?: Record<string, unknown>) => Promise<void>;
};

export function EssPerformanceCheckInsPanel({ workspace, saving, onAction }: EssPerformanceCheckInsProps) {
  const [progress, setProgress] = useState('50');
  const [status, setStatus] = useState('On Track');
  const [sharedNotes, setSharedNotes] = useState('');
  const [reflection, setReflection] = useState('');
  const [commitment, setCommitment] = useState('');
  const [supportRequest, setSupportRequest] = useState('');
  const [barrier, setBarrier] = useState('');

  const history = workspace.self.checkIns;

  const save = async () => {
    const commitments = commitment.trim()
      ? [{ text: commitment.trim(), owner: 'Employee', dueDate: workspace.activeCycle?.endDate || new Date().toISOString().slice(0, 10), done: false }]
      : [];
    const notes = [
      sharedNotes.trim(),
      barrier.trim() ? `Barrier: ${barrier.trim()}` : '',
      supportRequest.trim() ? `Support requested: ${supportRequest.trim()}` : '',
    ].filter(Boolean).join('\n');

    await onAction('checkin.create', {
      cycleId: workspace.activeCycle?.id,
      progressPercent: Number(progress || 0),
      status,
      sharedNotes: notes,
      employeeReflection: reflection.trim(),
      commitments,
    });
    setSharedNotes('');
    setReflection('');
    setCommitment('');
    setBarrier('');
    setSupportRequest('');
  };

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <EssCard className="p-5">
        <h3 className="text-sm font-bold text-[#0F172A]">New check-in</h3>
        <p className="mt-1 text-xs text-[#64748B]">Record progress, barriers, support needs, and commitments for your manager.</p>
        <div className="mt-4 grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">Progress %</label>
              <input value={progress} onChange={(e) => setProgress(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[#E2E8F0] px-3 text-sm font-semibold" />
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[#E2E8F0] px-3 text-sm font-semibold">
                {CHECKIN_STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">Employee reflection</label>
            <textarea value={reflection} onChange={(e) => setReflection(e.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm" placeholder="What went well and what needs attention?" />
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">Shared notes / progress update</label>
            <textarea value={sharedNotes} onChange={(e) => setSharedNotes(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">Barriers</label>
            <input value={barrier} onChange={(e) => setBarrier(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[#E2E8F0] px-3 text-sm" placeholder="Optional blockers" />
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">Support requested</label>
            <input value={supportRequest} onChange={(e) => setSupportRequest(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[#E2E8F0] px-3 text-sm" placeholder="Coaching, tools, decisions needed" />
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">Commitment / milestone</label>
            <input value={commitment} onChange={(e) => setCommitment(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[#E2E8F0] px-3 text-sm" placeholder="Next agreed action" />
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-4 text-sm font-bold text-white hover:bg-[#1D4ED8] disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Save check-in
          </button>
        </div>
      </EssCard>

      <EssCard className="p-5">
        <h3 className="text-sm font-bold text-[#0F172A]">Check-in history</h3>
        <div className="mt-4 space-y-3">
          {history.length ? history.map((item) => (
            <CheckInHistoryCard key={item.id} item={item} />
          )) : (
            <EssEmptyState icon={MessageSquare} title="No check-ins yet" description="Your continuous performance updates will appear here." />
          )}
        </div>
      </EssCard>
    </div>
  );
}

export function EssManagerCoachingPanel({
  checkIns,
  saving,
  onAction,
}: {
  checkIns: EssCheckInRow[];
  saving?: boolean;
  onAction: (action: string, payload?: Record<string, unknown>) => Promise<void>;
}) {
  const [feedbackById, setFeedbackById] = useState<Record<string, string>>({});
  const [privateById, setPrivateById] = useState<Record<string, string>>({});

  if (!checkIns.length) {
    return <EssEmptyState title="No check-ins for this employee" description="When the employee logs check-ins, you can add coaching feedback here." />;
  }

  return (
    <div className="space-y-3">
      {checkIns.map((item) => (
        <article key={item.id} className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3">
          <CheckInHistoryCard item={item} />
          <div className="mt-3 grid gap-2">
            <textarea
              value={feedbackById[item.id] ?? item.managerFeedback}
              onChange={(e) => setFeedbackById((current) => ({ ...current, [item.id]: e.target.value }))}
              rows={2}
              className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm"
              placeholder="Manager coaching feedback"
            />
            <textarea
              value={privateById[item.id] ?? item.privateManagerNotes ?? ''}
              onChange={(e) => setPrivateById((current) => ({ ...current, [item.id]: e.target.value }))}
              rows={2}
              className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm"
              placeholder="Private manager notes (not shown as shared notes)"
            />
            <button
              type="button"
              disabled={saving}
              onClick={() => void onAction('checkin.update', {
                id: item.id,
                managerFeedback: feedbackById[item.id] ?? item.managerFeedback,
                privateManagerNotes: privateById[item.id] ?? item.privateManagerNotes,
              })}
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[#2563EB] px-3 text-xs font-bold text-white hover:bg-[#1D4ED8] disabled:opacity-60"
            >
              Save coaching notes
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

function CheckInHistoryCard({ item }: { item: EssCheckInRow }) {
  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white px-3 py-2">
      <p className="text-sm font-semibold text-[#0F172A]">{item.date} · {item.status} · {item.progressPercent}%</p>
      {item.employeeReflection ? <p className="mt-1 text-xs text-[#475569]"><span className="font-bold">Reflection:</span> {item.employeeReflection}</p> : null}
      {item.sharedNotes ? <p className="mt-1 text-xs text-[#64748B]">{item.sharedNotes}</p> : null}
      {item.managerFeedback ? <p className="mt-1 text-xs text-[#1D4ED8]"><span className="font-bold">Manager:</span> {item.managerFeedback}</p> : null}
      {item.commitments.length ? (
        <ul className="mt-2 space-y-1 text-xs text-[#64748B]">
          {item.commitments.map((c) => (
            <li key={c.id}>{c.done ? '✓' : '○'} {c.text} · due {c.dueDate}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
