'use client';

import { useMemo, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import type { EssPerformanceWorkspace } from '@/lib/ess-performance-workspace';
import { EssCard, EssEmptyState } from './ess-portal-ui';

type EssPerformanceAppealPanelProps = {
  workspace: EssPerformanceWorkspace;
  saving?: boolean;
  onAction: (action: string, payload?: Record<string, unknown>) => Promise<void>;
};

export function EssPerformanceAppealPanel({ workspace, saving, onAction }: EssPerformanceAppealPanelProps) {
  const appealableResults = useMemo(
    () => workspace.self.reviews.filter((row) => row.type === 'Result' && ['Published', 'Amended'].includes(row.status)),
    [workspace.self.reviews],
  );
  const existingAppeals = workspace.self.appeals || [];

  const [resultId, setResultId] = useState(appealableResults[0]?.id || '');
  const [reason, setReason] = useState('');
  const [requestedOutcome, setRequestedOutcome] = useState('');
  const [disputedItems, setDisputedItems] = useState('');
  const [evidence, setEvidence] = useState('');
  const [error, setError] = useState('');

  const selected = appealableResults.find((row) => row.id === resultId) || null;
  const alreadyAppealed = existingAppeals.some((row) => row.resultId === resultId && !['Rejected', 'Closed', 'Upheld', 'Amended'].includes(row.status));
  const appealWindowOpen = Boolean(
    workspace.activeCycle
    && (workspace.activeCycle.status === 'Appeal Window'
      || workspace.activeCycle.status === 'Results Published'
      || workspace.cycleStages.some((stage) => stage.id === 'appeal' && (stage.state === 'active' || stage.state === 'overdue'))),
  );

  const submitAppeal = async () => {
    if (!resultId) {
      setError('Select a published result to appeal.');
      return;
    }
    if (!reason.trim() || !requestedOutcome.trim()) {
      setError('Reason and requested outcome are required.');
      return;
    }
    if (alreadyAppealed) {
      setError('An open appeal already exists for this result.');
      return;
    }
    setError('');
    await onAction('appeal.submit', {
      resultId,
      reason: reason.trim(),
      requestedOutcome: requestedOutcome.trim(),
      disputedItems: disputedItems
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      evidence: evidence.trim() || undefined,
    });
    setReason('');
    setRequestedOutcome('');
    setDisputedItems('');
    setEvidence('');
  };

  return (
    <EssCard className="p-5">
      <h3 className="text-sm font-bold text-[#0F172A]">Appeals</h3>
      <p className="mt-1 text-xs text-[#64748B]">
        Dispute a published result within the appeal window. HR and the appeal panel decide the case; your original result stays intact until amended.
      </p>
      {!appealWindowOpen ? (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900" role="status">
          Appeal window is not marked active on the cycle tracker. You can still submit if HR has published results and the deadline has not passed.
        </p>
      ) : null}

      {appealableResults.length ? (
        <div className="mt-4 grid gap-3">
          <div>
            <label htmlFor="ess-appeal-result" className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">Published result</label>
            <select
              id="ess-appeal-result"
              value={resultId}
              onChange={(e) => setResultId(e.target.value)}
              className="mt-1 min-h-11 w-full rounded-lg border border-[#E2E8F0] px-3 text-sm font-semibold"
            >
              {appealableResults.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.cycleName} · score {row.score ?? '—'} · {row.status}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="ess-appeal-items" className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">Disputed items (comma-separated)</label>
            <input
              id="ess-appeal-items"
              value={disputedItems}
              onChange={(e) => setDisputedItems(e.target.value)}
              className="mt-1 min-h-11 w-full rounded-lg border border-[#E2E8F0] px-3 text-sm font-semibold"
              placeholder="e.g. OKR delivery, behavioural rating"
            />
          </div>
          <div>
            <label htmlFor="ess-appeal-reason" className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">Reason</label>
            <textarea
              id="ess-appeal-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm"
              placeholder="Explain what is disputed and why"
            />
          </div>
          <div>
            <label htmlFor="ess-appeal-outcome" className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">Requested outcome</label>
            <input
              id="ess-appeal-outcome"
              value={requestedOutcome}
              onChange={(e) => setRequestedOutcome(e.target.value)}
              className="mt-1 min-h-11 w-full rounded-lg border border-[#E2E8F0] px-3 text-sm font-semibold"
              placeholder="e.g. Recalculate OKR section / return for reassessment"
            />
          </div>
          <div>
            <label htmlFor="ess-appeal-evidence" className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">Evidence notes</label>
            <textarea
              id="ess-appeal-evidence"
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm"
              placeholder="References to documents, dates, or check-ins"
            />
          </div>
          {selected ? (
            <p className="text-xs text-[#64748B]">Appealing result {selected.id}{selected.score != null ? ` (score ${selected.score})` : ''}.</p>
          ) : null}
          {error ? <p className="text-xs font-semibold text-red-700" role="alert">{error}</p> : null}
          <button
            type="button"
            disabled={saving || alreadyAppealed}
            onClick={() => void submitAppeal()}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-4 text-sm font-bold text-white disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {alreadyAppealed ? 'Appeal already open' : 'Submit appeal'}
          </button>
        </div>
      ) : (
        <div className="mt-4">
          <EssEmptyState title="No appealable results" description="Appeals become available after HR publishes your performance result." />
        </div>
      )}

      <div className="mt-5 space-y-2">
        <p className="text-xs font-bold uppercase tracking-wide text-[#64748B]">My appeal cases</p>
        {existingAppeals.length ? existingAppeals.map((row) => (
          <article key={row.id} className="rounded-xl border border-[#E2E8F0] px-3 py-2">
            <p className="text-sm font-semibold text-[#0F172A]">{row.status} · {row.requestedOutcome}</p>
            <p className="text-xs text-[#64748B]">{row.reason}</p>
            <p className="mt-1 text-[11px] text-[#64748B]">
              Submitted {row.createdAt.slice(0, 10)}
              {row.decidedAt ? ` · decided ${row.decidedAt.slice(0, 10)}` : ''}
              {row.panelDecision ? ` · ${row.panelDecision}` : ''}
            </p>
          </article>
        )) : (
          <p className="text-xs text-[#64748B]">No appeals submitted yet.</p>
        )}
      </div>
    </EssCard>
  );
}
