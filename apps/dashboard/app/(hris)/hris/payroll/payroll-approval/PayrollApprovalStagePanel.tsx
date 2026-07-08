'use client';

import { CheckCircle2, Circle, Clock3, UserCheck, XCircle } from 'lucide-react';
import {
  buildPayrollApprovalChecklist,
  payrollApprovalChecklistReady,
  type PayrollApprovalStageId,
} from '@/lib/payroll-approval-workflow';

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

type ChecklistPayload = {
  blockedEmployees?: number;
  reviewEmployees?: number;
  exceptionCount?: number;
  payrollEligible?: number;
  readyEmployees?: number;
  employees?: number;
  grossPay?: number | null;
  netPay?: number | null;
  employerCost?: number | null;
  exceptions?: Array<{ issue: string; employeeName?: string }>;
  records?: Array<{ employmentStatus?: string; payrollStatus?: string; issues?: string[]; exceptions?: string[] }>;
};

type PayrollApprovalStagePanelProps = {
  stages: StageState[];
  payload: ChecklistPayload | null;
  activeStageId: PayrollApprovalStageId | null;
  onSelectStage: (id: PayrollApprovalStageId) => void;
  onApprove: (action: string) => void;
  onReject: () => void;
  onRequestRevision: () => void;
  posting: string;
  canApproveHrManager: boolean;
  canApproveFinanceManager: boolean;
  canApproveCfo: boolean;
  canApproveMdCeo: boolean;
  canApproveAnyStage: boolean;
  canSubmit: boolean;
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
  payload,
  activeStageId,
  onSelectStage,
  onApprove,
  onReject,
  onRequestRevision,
  posting,
  canApproveHrManager,
  canApproveFinanceManager,
  canApproveCfo,
  canApproveMdCeo,
  canApproveAnyStage,
  canSubmit,
  note,
  onNoteChange,
}: PayrollApprovalStagePanelProps) {
  const active = stages.find((stage) => stage.id === activeStageId) || stages.find((stage) => stage.current) || stages[0];
  const checklist = active
    ? buildPayrollApprovalChecklist(active.id, {
        blockedEmployees: payload?.blockedEmployees || 0,
        reviewEmployees: payload?.reviewEmployees || 0,
        exceptionCount: payload?.exceptionCount || 0,
        payrollEligible: payload?.payrollEligible || payload?.employees || 0,
        readyEmployees: payload?.readyEmployees || 0,
        grossPay: payload?.grossPay ?? null,
        netPay: payload?.netPay ?? null,
        employerCost: payload?.employerCost ?? null,
        exceptions: payload?.exceptions || [],
        records: payload?.records || [],
      })
    : [];
  const checklistReady = payrollApprovalChecklistReady(checklist);

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
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
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

      {active ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <UserCheck className="h-5 w-5 text-slate-700" />
                <h2 className="text-sm font-black uppercase tracking-normal text-slate-900">{active.title} Review Checklist</h2>
              </div>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                Sequential approval: HR Manager → Finance Manager → CFO → MD / CEO. Super Administrators can action any pending stage.
              </p>
              <div className="mt-4 space-y-2">
                {checklist.map((item) => (
                  <div key={item.id} className={`rounded-xl border px-3 py-2 ${item.passed ? 'border-emerald-200 bg-emerald-50' : item.required ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'}`}>
                    <div className="flex items-start gap-2">
                      {item.passed ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <XCircle className={`mt-0.5 h-4 w-4 shrink-0 ${item.required ? 'text-red-600' : 'text-amber-600'}`} />}
                      <div>
                        <p className="text-xs font-black text-slate-900">{item.label}{item.required ? ' *' : ''}</p>
                        <p className="mt-0.5 text-[11px] font-semibold text-slate-600">{item.detail}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
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
                    disabled={!canActOnStage(active) || !checklistReady || posting === active.action}
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
              {!checklistReady && (active.current || (canApproveAnyStage && !active.done)) ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2">
                  <p className="text-xs font-bold text-red-700">Resolve required checklist items before approving this stage.</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] font-semibold text-red-700">
                    {checklist.filter((item) => item.required && !item.passed).map((item) => (
                      <li key={item.id}>{item.label}: {item.detail}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {checklistReady && active.current && !canActOnStage(active) ? (
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
