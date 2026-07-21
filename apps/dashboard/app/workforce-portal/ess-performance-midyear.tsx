'use client';

import { useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import type { EssPerformanceWorkspace } from '@/lib/ess-performance-workspace';
import { EssCard, EssEmptyState } from './ess-portal-ui';
import { EssSelfAssessmentEditor } from './ess-performance-self-assessment';

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

  if (!workspace.activeCycle) {
    return <EssEmptyState title="No active cycle" description="Mid-year review opens when HR advances the performance cycle." />;
  }

  return (
    <div className="space-y-4">
      <EssCard className="p-5">
        <h3 className="text-sm font-bold text-[#0F172A]">Mid-year review</h3>
        <p className="mt-1 text-xs text-[#64748B]">
          {midYearActive
            ? 'Complete your item-level mid-year self-review and request goal amendments while the window is open.'
            : `Cycle is currently “${workspace.activeCycle.status}”. Mid-year actions unlock during Mid-Year Review (you can still draft a change request if needed).`}
        </p>

        <div className="mt-4 rounded-xl border border-[#E2E8F0] bg-white p-3">
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
      </EssCard>

      <EssSelfAssessmentEditor
        workspace={workspace}
        assessmentType="Mid-Year"
        saving={saving}
        onAction={onAction}
      />
    </div>
  );
}
