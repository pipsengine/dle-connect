'use client';

import { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import type {
  EssActivityRow,
  EssAssessmentDetail,
  EssDelegationRow,
  EssPerformanceWorkspace,
} from '@/lib/ess-performance-workspace';
import { EssCard, EssEmptyState } from './ess-portal-ui';

/** Warn on browser close/navigation when an assessment draft has unsaved edits. */
export function useEssUnsavedGuard(dirty: boolean, message = 'You have unsaved performance changes. Leave this page?') {
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = message;
      return message;
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty, message]);

  const confirmDiscard = () => {
    if (!dirty) return true;
    return window.confirm(message);
  };

  return { confirmDiscard };
}

export function EssAssessmentHistoryPanel({ detail }: { detail: EssAssessmentDetail | null }) {
  if (!detail) return null;
  return (
    <EssCard className="p-5">
      <h3 className="text-sm font-bold text-[#0F172A]">Version history</h3>
      <p className="mt-1 text-xs text-[#64748B]">
        Assessment v{detail.version}
        {detail.returnedReason ? ` · returned: ${detail.returnedReason}` : ''}
      </p>
      <div className="mt-3 space-y-2" aria-live="polite">
        {detail.history?.length ? detail.history.map((row, index) => (
          <article key={`${row.version}-${row.at}-${index}`} className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2">
            <p className="text-xs font-semibold text-[#0F172A]">v{row.version} · {row.change}</p>
            <p className="text-[11px] text-[#64748B]">
              {row.actor} · {row.at.slice(0, 16).replace('T', ' ')}
              {row.reason ? ` · ${row.reason}` : ''}
            </p>
          </article>
        )) : (
          <EssEmptyState title="No history yet" description="Saves, submits, returns, and reopen events will appear here." />
        )}
      </div>
    </EssCard>
  );
}

export function EssPerformanceActivityFeed({ rows }: { rows: EssActivityRow[] }) {
  return (
    <EssCard className="p-5">
      <h3 className="text-sm font-bold text-[#0F172A]">Recent audit activity</h3>
      <p className="mt-1 text-xs text-[#64748B]">Material performance actions in your scope, newest first.</p>
      <div className="mt-3 space-y-2" role="list" aria-label="Performance audit activity">
        {rows.length ? rows.map((row) => (
          <article key={row.id} role="listitem" className="rounded-lg border border-[#E2E8F0] px-3 py-2">
            <p className="text-sm font-semibold text-[#0F172A]">{row.action}</p>
            <p className="text-xs text-[#64748B]">
              {row.actor} · {row.entityType} · {row.at.slice(0, 16).replace('T', ' ')}
              {row.reason ? ` · ${row.reason}` : ''}
            </p>
          </article>
        )) : (
          <EssEmptyState title="No recent activity" description="Assessment, goal, and delegation events will show here." />
        )}
      </div>
    </EssCard>
  );
}

export function EssDelegationWorkspace({
  workspace,
  saving,
  onAction,
}: {
  workspace: EssPerformanceWorkspace;
  saving?: boolean;
  onAction: (action: string, payload?: Record<string, unknown>) => Promise<void>;
}) {
  const [toManagerId, setToManagerId] = useState('');
  const [toManagerName, setToManagerName] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(workspace.activeCycle?.endDate || '');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const rows = workspace.team.delegations;

  const createDelegation = async () => {
    if (!toManagerId.trim() || !endDate || !reason.trim()) {
      setError('Delegate employee ID, end date, and reason are required.');
      return;
    }
    setError('');
    await onAction('delegation.upsert', {
      toManagerId: toManagerId.trim(),
      toManagerName: toManagerName.trim() || toManagerId.trim(),
      startDate,
      endDate,
      reason: reason.trim(),
    });
    setToManagerId('');
    setToManagerName('');
    setReason('');
  };

  return (
    <EssCard className="p-5">
      <h3 className="text-sm font-bold text-[#0F172A]">Delegated manager coverage</h3>
      <p className="mt-1 text-xs text-[#64748B]">
        Temporarily assign your review queue to another manager (leave, travel, or absence). Delegates see your direct reports in My Team.
      </p>
      {workspace.team.actingAsDelegate ? (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900" role="status">
          You are acting as a delegated manager for one or more colleagues. Delegated reports are marked in the review queue.
        </p>
      ) : null}

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div>
          <label htmlFor="ess-delegate-id" className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">Delegate employee ID / code</label>
          <input id="ess-delegate-id" value={toManagerId} onChange={(e) => setToManagerId(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[#E2E8F0] px-3 text-sm font-semibold" />
        </div>
        <div>
          <label htmlFor="ess-delegate-name" className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">Delegate name</label>
          <input id="ess-delegate-name" value={toManagerName} onChange={(e) => setToManagerName(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[#E2E8F0] px-3 text-sm font-semibold" />
        </div>
        <div>
          <label htmlFor="ess-delegate-start" className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">Start date</label>
          <input id="ess-delegate-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[#E2E8F0] px-3 text-sm font-semibold" />
        </div>
        <div>
          <label htmlFor="ess-delegate-end" className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">End date</label>
          <input id="ess-delegate-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[#E2E8F0] px-3 text-sm font-semibold" />
        </div>
        <div className="md:col-span-2">
          <label htmlFor="ess-delegate-reason" className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">Reason</label>
          <input id="ess-delegate-reason" value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[#E2E8F0] px-3 text-sm font-semibold" placeholder="Annual leave cover" />
        </div>
        {error ? <p className="md:col-span-2 text-xs font-semibold text-red-700" role="alert">{error}</p> : null}
        <button type="button" disabled={saving} onClick={() => void createDelegation()} className="md:col-span-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-4 text-sm font-bold text-white disabled:opacity-60">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Create delegation
        </button>
      </div>

      <div className="mt-4 space-y-2">
        {rows.length ? rows.map((row: EssDelegationRow) => (
          <article key={row.id} className="rounded-xl border border-[#E2E8F0] px-3 py-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-[#0F172A]">
                  {row.direction === 'owned' ? `Delegated to ${row.toManagerName}` : `Covering for ${row.fromManagerName}`}
                </p>
                <p className="text-xs text-[#64748B]">{row.startDate} → {row.endDate} · {row.reason}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-bold text-slate-700">{row.status}</span>
                {row.direction === 'owned' && row.status !== 'Cancelled' ? (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void onAction('delegation.cancel', { id: row.id, reason: 'Cancelled by owner' })}
                    className="min-h-11 rounded-lg border border-[#E2E8F0] px-3 text-xs font-bold text-[#475569] disabled:opacity-60"
                  >
                    Cancel
                  </button>
                ) : null}
              </div>
            </div>
          </article>
        )) : (
          <EssEmptyState title="No delegations" description="Create a temporary cover assignment when you will be unavailable." />
        )}
      </div>
    </EssCard>
  );
}
