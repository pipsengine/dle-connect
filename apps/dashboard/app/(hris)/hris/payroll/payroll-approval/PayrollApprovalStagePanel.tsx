'use client';

import { BellRing, CheckCircle2, Circle, Clock3, UserCheck } from 'lucide-react';
import type { PayrollApprovalStageId } from '@/lib/payroll-approval-workflow';

type StageState = {
  id: PayrollApprovalStageId;
  code: string;
  title: string;
  owner: string;
  action: string;
  done: boolean;
  current: boolean;
  stamp: string | null;
  signedBy: string | null;
};

type PayrollApprovalStagePanelProps = {
  stages: StageState[];
  activeStageId: PayrollApprovalStageId | null;
  onSelectStage: (id: PayrollApprovalStageId) => void;
  onApprove: (action: string) => void;
  onReject: () => void;
  onRequestRevision: () => void;
  onSendReminder?: () => void;
  posting: string;
  canApproveHrManager: boolean;
  canApproveFinanceManager: boolean;
  canApproveCfo: boolean;
  canApproveMdCeo: boolean;
  canApproveAnyStage: boolean;
  canSubmit: boolean;
  canSendReminder?: boolean;
  lastReminderAt?: string | null;
  note: string;
  onNoteChange: (value: string) => void;
};

const stageTone: Record<PayrollApprovalStageId, string> = {
  'payroll-officer': 'border-blue-200 bg-blue-50 text-blue-800',
  'hr-manager': 'border-emerald-200 bg-emerald-50 text-emerald-800',
  'finance-manager': 'border-amber-200 bg-amber-50 text-amber-800',
  cfo: 'border-violet-200 bg-violet-50 text-violet-800',
  'md-ceo': 'border-cyan-200 bg-cyan-50 text-cyan-800',
};

export default function PayrollApprovalStagePanel({
  stages,
  activeStageId,
  onSelectStage,
  onApprove,
  onReject,
  onRequestRevision,
  onSendReminder,
  posting,
  canApproveHrManager,
  canApproveFinanceManager,
  canApproveCfo,
  canApproveMdCeo,
  canApproveAnyStage,
  canSubmit,
  canSendReminder = false,
  lastReminderAt = null,
  note,
  onNoteChange,
}: PayrollApprovalStagePanelProps) {
  const active = stages.find((stage) => stage.id === activeStageId) || stages.find((stage) => stage.current) || stages[0];
  const pendingApproverStage = stages.find((stage) => stage.current && stage.id !== 'payroll-officer') || null;
  const showReminder = Boolean(canSendReminder && pendingApproverStage && onSendReminder);

  const canActOnStage = (stage: StageState) => {
    if (canApproveAnyStage && !stage.done) return true;
    if (!stage.current) return false;
    if (stage.id === 'payroll-officer') return canSubmit;
    if (stage.id === 'hr-manager') return canApproveHrManager;
    if (stage.id === 'finance-manager') return canApproveFinanceManager;
    if (stage.id === 'cfo') return canApproveCfo;
    return canApproveMdCeo;
  };

  const approveLabel =
    active?.id === 'payroll-officer' ? 'Submit for Approval'
      : active?.id === 'hr-manager' ? 'HR Manager Approve'
        : active?.id === 'finance-manager' ? 'Finance Manager Approve'
          : active?.id === 'cfo' ? 'CFO Approve'
            : 'MD / CEO Final Approve';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
        {stages.map((stage) => (
          <button
            key={stage.id}
            type="button"
            onClick={() => onSelectStage(stage.id)}
            className={`rounded-2xl border p-4 text-left transition hover:shadow-sm ${active?.id === stage.id ? 'ring-2 ring-blue-600 ring-offset-2' : ''} ${stage.done ? 'border-emerald-200 bg-emerald-50' : stage.current ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-white'}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${stageTone[stage.id]}`}>{stage.code}</span>
              {stage.done ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : stage.current ? <Clock3 className="h-4 w-4 text-blue-600" /> : <Circle className="h-4 w-4 text-slate-300" />}
            </div>
            <p className="mt-2 text-sm font-black text-slate-950">{stage.title}</p>
            <p className="mt-1 text-[11px] font-semibold text-slate-500">{stage.done ? `Signed by ${stage.signedBy || stage.owner}` : stage.current ? 'Awaiting review' : 'Pending'}</p>
            {stage.stamp ? <p className="mt-1 text-[10px] font-bold text-slate-400">{new Date(stage.stamp).toLocaleString('en-GB')}</p> : null}
          </button>
        ))}
      </div>

      {showReminder ? (
        <div className="flex flex-col gap-2 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-extrabold text-sky-950">
              Reminder · awaiting {pendingApproverStage?.owner || 'approver'}
            </p>
            <p className="mt-0.5 text-[11px] font-semibold text-sky-800">
              Auto reminder sends after 24 hours without action.
              {lastReminderAt ? ` Last reminder: ${new Date(lastReminderAt).toLocaleString('en-GB')}.` : ' No reminder sent yet for this stage.'}
            </p>
          </div>
          <button
            type="button"
            disabled={posting === 'send-reminder'}
            onClick={onSendReminder}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-sky-300 bg-white px-4 text-xs font-extrabold text-sky-900 hover:bg-sky-100 disabled:opacity-50"
          >
            <BellRing className={`h-4 w-4 ${posting === 'send-reminder' ? 'animate-pulse' : ''}`} />
            Send reminder
          </button>
        </div>
      ) : null}

      {active ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <UserCheck className="h-5 w-5 text-slate-700" />
                <h2 className="text-sm font-black uppercase tracking-normal text-slate-900">{active.title} Approval</h2>
              </div>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                {active.done
                  ? `Signed by ${active.signedBy || active.owner}${active.stamp ? ` · ${new Date(active.stamp).toLocaleString('en-GB')}` : ''}`
                  : active.current
                    ? `Awaiting ${active.owner} action.`
                    : 'This stage is not active yet.'}
              </p>
            </div>
            <div className="w-full max-w-md shrink-0 space-y-3">
              <textarea
                value={note}
                onChange={(event) => onNoteChange(event.target.value)}
                placeholder="Approval note, rejection reason, or return comment"
                className="min-h-24 w-full rounded-2xl border border-slate-200 bg-white p-3 text-sm font-semibold outline-none focus:border-dle-blue focus:ring-2 focus:ring-dle-blue/20"
              />
              {active.current || (canApproveAnyStage && !active.done) ? (
                <div className="grid grid-cols-1 gap-2">
                  <button
                    type="button"
                    disabled={!canActOnStage(active) || posting === active.action}
                    onClick={() => onApprove(active.action)}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-xs font-extrabold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                  >
                    <CheckCircle2 className={`h-4 w-4 ${posting === active.action ? 'animate-spin' : ''}`} />
                    {approveLabel}
                  </button>
                  {active.id !== 'payroll-officer' ? (
                    <>
                      <button type="button" disabled={posting === 'request-revision'} onClick={onRequestRevision} className="inline-flex h-10 items-center justify-center rounded-xl border border-amber-200 bg-amber-50 px-4 text-xs font-extrabold text-amber-900 hover:bg-amber-100 disabled:opacity-50">
                        Return for Revision
                      </button>
                      <button type="button" disabled={posting === 'reject-run'} onClick={onReject} className="inline-flex h-10 items-center justify-center rounded-xl border border-red-200 bg-red-50 px-4 text-xs font-extrabold text-red-800 hover:bg-red-100 disabled:opacity-50">
                        Reject Payroll
                      </button>
                    </>
                  ) : null}
                </div>
              ) : (
                <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
                  {active.done ? 'This stage is complete. Select the current stage to take action.' : 'This stage is not active yet.'}
                </p>
              )}
              {active.current && !canActOnStage(active) ? (
                <p className="text-xs font-bold text-amber-700">
                  Your signed-in role cannot action this stage. Wait for the stage owner, or sign in with an authorized role.
                </p>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
