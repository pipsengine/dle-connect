'use client';

import { AlertTriangle, CheckCircle2, Loader2, Mail, RefreshCw } from 'lucide-react';

export type WorkflowDeliveryStep = {
  step: string;
  channel: string;
  status: string;
  createdAt: string;
  error?: string;
  recipientEmail?: string;
  provider?: string;
  message?: string;
};

export type WorkflowDeliveryTrace = {
  steps: WorkflowDeliveryStep[];
  failures: WorkflowDeliveryStep[];
  hasFailures: boolean;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
};

const fmtDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const statusClass = (status: string) => {
  if (status === 'success') return 'bg-emerald-50 text-emerald-800 border-emerald-200';
  if (status === 'failed') return 'bg-red-50 text-red-800 border-red-200';
  if (status === 'started') return 'bg-amber-50 text-amber-800 border-amber-200';
  return 'bg-slate-50 text-slate-700 border-slate-200';
};

export function EssWorkflowDeliveryPanel({
  requestId,
  trace,
  compact: compactMode = false,
  onRetry,
  retrying = false,
}: {
  requestId: string;
  trace?: WorkflowDeliveryTrace | null;
  compact?: boolean;
  onRetry?: (requestId: string) => Promise<void> | void;
  retrying?: boolean;
}) {
  if (!trace?.steps?.length) return null;

  return (
    <div className={`rounded-lg border ${trace.hasFailures ? 'border-red-200 bg-red-50/60' : 'border-slate-200 bg-slate-50'} p-3`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {trace.hasFailures ? <AlertTriangle className="h-4 w-4 text-red-600" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
          <p className="text-xs font-black uppercase tracking-wide text-slate-700">
            {trace.hasFailures ? 'Notification delivery issues' : 'Notification delivery trace'}
          </p>
        </div>
        {onRetry && trace.hasFailures ? (
          <button
            type="button"
            disabled={retrying}
            onClick={() => void onRetry(requestId)}
            className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2.5 py-1 text-[11px] font-bold text-red-700 disabled:opacity-50"
          >
            {retrying ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Retry email
          </button>
        ) : null}
      </div>

      <div className={`mt-2 space-y-2 ${compactMode ? 'max-h-36 overflow-y-auto' : ''}`}>
        {trace.steps.map((step) => (
          <div key={`${step.step}-${step.channel}-${step.createdAt}`} className={`rounded-md border px-2.5 py-2 ${statusClass(step.status)}`}>
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
              <span>{step.step}</span>
              <span className="rounded-full bg-white/80 px-2 py-0.5 uppercase">{step.channel}</span>
              <span className="rounded-full bg-white/80 px-2 py-0.5 uppercase">{step.status}</span>
              {step.provider ? <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{step.provider}</span> : null}
            </div>
            <p className="mt-1 text-[11px] font-semibold opacity-80">{fmtDateTime(step.createdAt)}</p>
            {step.recipientEmail ? <p className="mt-1 text-[11px]">To: {step.recipientEmail}</p> : null}
            {step.error ? <p className="mt-1 text-[11px] font-bold">Error: {step.error}</p> : null}
            {step.message ? <p className="mt-1 text-[11px]">{step.message}</p> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export function EssWorkflowDiagnosticsBanner({
  mailProvider,
  mailConfigured,
  recentFailures,
}: {
  mailProvider?: string | null;
  mailConfigured?: boolean;
  recentFailures?: WorkflowDeliveryStep[];
}) {
  if (mailConfigured && !(recentFailures?.length)) return null;
  return (
    <div className="rounded-[16px] border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-amber-950">Workflow notification diagnostics</p>
          <p className="mt-1 text-xs font-semibold text-amber-900">
            Mail provider: {mailProvider || 'not configured'}
            {!mailConfigured ? ' — email notifications cannot be sent until SMTP or Microsoft Graph is configured.' : ''}
          </p>
          {recentFailures?.length ? (
            <div className="mt-3 space-y-2">
              {recentFailures.slice(0, 5).map((item) => (
                <div key={`${item.step}-${item.createdAt}`} className="rounded-md border border-amber-200 bg-white/80 px-3 py-2 text-[11px] font-semibold text-amber-950">
                  <span className="font-black">{item.step}</span> ({item.channel}) failed{item.error ? `: ${item.error}` : '.'}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
