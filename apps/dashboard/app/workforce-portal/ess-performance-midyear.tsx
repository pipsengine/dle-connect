'use client';

import { useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import type { EssPerformanceWorkspace } from '@/lib/ess-performance-workspace';
import { EssCard, EssEmptyState } from './ess-portal-ui';

type EssPerformanceMidYearProps = {
  workspace: EssPerformanceWorkspace;
  saving?: boolean;
  onAction: (action: string, payload?: Record<string, unknown>) => Promise<void>;
};

export function EssPerformanceMidYearPanel({ workspace, saving, onAction }: EssPerformanceMidYearProps) {
  const [goalId, setGoalId] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const midYearActive = Boolean(
    workspace.activeCycle
    && (workspace.activeCycle.status === 'Mid-Year Review'
      || workspace.cycleStages.some((stage) => stage.id === 'mid-year' && (stage.state === 'active' || stage.state === 'overdue'))),
  );

  const goals = workspace.self.goals;
  const midYearReview = workspace.self.reviews.find((row) => row.type === 'Mid-Year');

  if (!workspace.activeCycle) {
    return <EssEmptyState title="No active cycle" description="Mid-year review opens when HR advances the performance cycle." />;
  }

  return (
    <EssCard className="p-5">
      <h3 className="text-sm font-bold text-[#0F172A]">Mid-year review</h3>
      <p className="mt-1 text-xs text-[#64748B]">
        {midYearActive
          ? 'Request goal amendments and complete your mid-year self-reflection while the window is open.'
          : `Cycle is currently “${workspace.activeCycle.status}”. Mid-year actions unlock during Mid-Year Review (you can still draft a change request if needed).`}
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-[#64748B]">Mid-year assessment</p>
          {midYearReview ? (
            <div className="mt-2">
              <p className="text-sm font-semibold text-[#0F172A]">{midYearReview.status}</p>
              {['Draft', 'Returned', 'Not Started'].includes(midYearReview.status) ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void onAction('assessment.submit', { id: midYearReview.id })}
                  className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-[#2563EB] px-3 text-xs font-bold text-white disabled:opacity-60"
                >
                  Submit mid-year self-review
                </button>
              ) : null}
            </div>
          ) : (
            <button
              type="button"
              disabled={saving}
              onClick={() => void onAction('assessment.save', {
                cycleId: workspace.activeCycle?.id,
                type: 'Mid-Year',
                status: 'Draft',
              })}
              className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-[#2563EB] px-3 text-xs font-bold text-white disabled:opacity-60"
            >
              Start mid-year self-review
            </button>
          )}
        </div>

        <div className="rounded-xl border border-[#E2E8F0] bg-white p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-[#64748B]">Goal change request</p>
          <select
            value={goalId}
            onChange={(e) => setGoalId(e.target.value)}
            className="mt-2 min-h-11 w-full rounded-lg border border-[#E2E8F0] px-3 text-sm font-semibold"
          >
            <option value="">Select goal</option>
            {goals.map((goal) => (
              <option key={goal.id} value={goal.id}>{goal.title}</option>
            ))}
          </select>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="mt-2 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm"
            placeholder="Why does this objective need to change?"
          />
          {error ? <p className="mt-2 text-xs font-semibold text-red-700">{error}</p> : null}
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              if (!goalId || !reason.trim()) {
                setError('Select a goal and provide a reason.');
                return;
              }
              setError('');
              void onAction('midyear.change-request', { goalId, reason: reason.trim() });
              setReason('');
            }}
            className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 text-xs font-bold text-[#0F172A] disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Submit change request
          </button>
        </div>
      </div>
    </EssCard>
  );
}
