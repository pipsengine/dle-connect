'use client';

import { useMemo, useState } from 'react';
import {
  Banknote,
  Clock,
  FileText,
  Plane,
  Send,
  WalletCards,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { EssTravelRecord } from '@/lib/ess-portal-derived-data';
import {
  EssCard,
  EssEmptyState,
  EssKpiCard,
  EssQuickActionCard,
  EssSectionHeader,
  EssWorkflowStepper,
} from './ess-portal-ui';
import type { EssTab } from './ess-portal-shell';

type TravelAction = 'request' | 'advance' | 'trip-report' | 'settlement';

type ServiceCatalogItem = {
  id: string;
  label: string;
  area: string;
  workflow: string[];
  slaHours: number;
};

export type EssTravelPayload = {
  generatedAt?: string;
  travel?: EssTravelRecord[];
  serviceCatalog?: ServiceCatalogItem[];
  widgets?: { requests: { pending: number; approved: number; total: number } };
};

const travelActions: Array<{
  id: TravelAction;
  title: string;
  description: string;
  icon: LucideIcon;
  accent: string;
  iconBg: string;
  serviceId: string;
}> = [
  { id: 'request', title: 'Travel request', description: 'Route for approval', icon: Plane, accent: '#EA580C', iconBg: '#FFF7ED', serviceId: 'travel' },
  { id: 'advance', title: 'Travel advance', description: 'Finance workflow', icon: Banknote, accent: '#16A34A', iconBg: '#ECFDF5', serviceId: 'travel-advance' },
  { id: 'trip-report', title: 'Trip report', description: 'Post-trip evidence', icon: FileText, accent: '#2563EB', iconBg: '#DBEAFE', serviceId: 'trip-report' },
  { id: 'settlement', title: 'Travel settlement', description: 'Close advance', icon: WalletCards, accent: '#7C3AED', iconBg: '#F5F3FF', serviceId: 'travel-settlement' },
];

const statusBadge = (status: string) => {
  const value = (status || '').toLowerCase();
  if (/approv|complete|closed/.test(value)) return 'bg-[#ECFDF5] text-[#047857] ring-1 ring-[#A7F3D0]';
  if (/reject|terminat/.test(value)) return 'bg-[#FEF2F2] text-[#B91C1C] ring-1 ring-[#FECACA]';
  if (/review|submit|pending|progress/.test(value)) return 'bg-[#FFFBEB] text-[#B45309] ring-1 ring-[#FCD34D]';
  return 'bg-[#EFF6FF] text-[#1D4ED8] ring-1 ring-[#BFDBFE]';
};

const tripReportBadge = (value: string) => {
  const text = (value || '').toLowerCase();
  if (/submitted/.test(text)) return 'bg-[#ECFDF5] text-[#047857]';
  if (/due/.test(text)) return 'bg-[#FEF2F2] text-[#B91C1C]';
  return 'bg-[#F8FAFC] text-[#64748B]';
};

const formatDate = (value?: string) => {
  if (!value) return '—';
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatDateTime = (value?: string) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const money = (value: number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(value || 0);

const workflowStages = (record: EssTravelRecord) => {
  if (record.workflow.length) {
    const currentIndex = record.workflow.findIndex((stage) => /review|progress|pending|submitted/i.test(stage.status));
    return record.workflow.map((stage, index) => ({
      id: `${record.id}-${index}`,
      label: stage.owner || stage.stage,
      state:
        /approved|complete|closed/i.test(stage.status)
          ? 'completed'
          : /reject/i.test(stage.status)
            ? 'rejected'
            : index === currentIndex || (currentIndex < 0 && index === record.workflow.length - 1)
              ? 'current'
              : index < currentIndex
                ? 'completed'
                : 'upcoming',
    }));
  }
  return [
    { id: `${record.id}-emp`, label: 'Employee', state: 'completed' },
    { id: `${record.id}-mgr`, label: 'Line Manager', state: /line manager/i.test(record.status) ? 'current' : /approved|finance|admin/i.test(record.status) ? 'completed' : 'upcoming' },
    { id: `${record.id}-fin`, label: 'Finance', state: /finance|admin/i.test(record.status) ? 'current' : /approved|closed|complete/i.test(record.status) ? 'completed' : 'upcoming' },
  ];
};

const defaultDraft = () => ({
  destination: '',
  purpose: '',
  startDate: '',
  endDate: '',
  amount: '',
  linkedTrip: '',
  summary: '',
  spentAmount: '',
  balanceAmount: '',
  priority: 'Normal',
});

export function EssTravelDashboardView({
  payload,
  saving = false,
  submitError = '',
  submitNotice = '',
  onSubmit,
  onRefresh,
}: {
  payload: EssTravelPayload | null;
  saving?: boolean;
  submitError?: string;
  submitNotice?: string;
  onSubmit: (input: {
    serviceId: string;
    title: string;
    reason: string;
    startDate?: string;
    endDate?: string;
    priority: string;
  }) => Promise<void>;
  onRefresh?: () => void;
  onNavigate?: (tab: EssTab) => void;
}) {
  const travelRecords = payload?.travel ?? [];
  const [activeAction, setActiveAction] = useState<TravelAction | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | EssTravelRecord['type']>('all');
  const [draft, setDraft] = useState(defaultDraft);

  const selectedAction = travelActions.find((item) => item.id === activeAction) || null;
  const selectedCatalog = payload?.serviceCatalog?.find((item) => item.id === selectedAction?.serviceId);

  const metrics = useMemo(() => {
    const pending = travelRecords.filter((item) => !/approved|rejected|closed|complete/i.test(item.status)).length;
    const activeTrips = travelRecords.filter((item) => item.type === 'request' && !/rejected|closed/i.test(item.status)).length;
    const advances = travelRecords.filter((item) => item.type === 'advance').reduce((sum, item) => sum + item.advance, 0);
    const settlementsDue = travelRecords.filter((item) => item.type === 'request' && item.tripReport === 'Due').length;
    return { pending, activeTrips, advances, settlementsDue };
  }, [travelRecords]);

  const filteredRecords = useMemo(() => {
    if (statusFilter === 'all') return travelRecords;
    return travelRecords.filter((item) => item.type === statusFilter);
  }, [statusFilter, travelRecords]);

  const approvedTrips = useMemo(
    () => travelRecords.filter((item) => item.type === 'request' && /approved|closed|complete/i.test(item.status)),
    [travelRecords],
  );

  const openForm = (action: TravelAction) => {
    setActiveAction(action);
    setDraft(defaultDraft());
  };

  const buildSubmission = () => {
    if (!selectedAction) return null;
    if (selectedAction.id === 'request') {
      if (!draft.destination.trim() || !draft.purpose.trim() || !draft.startDate || !draft.endDate) return null;
      return {
        serviceId: selectedAction.serviceId,
        title: draft.destination.trim(),
        reason: draft.purpose.trim(),
        startDate: draft.startDate,
        endDate: draft.endDate,
        priority: draft.priority,
      };
    }
    if (selectedAction.id === 'advance') {
      if (!draft.linkedTrip.trim() || !draft.amount.trim()) return null;
      return {
        serviceId: selectedAction.serviceId,
        title: `Advance for ${draft.linkedTrip.trim()}`,
        reason: `Amount: NGN ${Number(draft.amount).toLocaleString('en-NG')} · Trip: ${draft.linkedTrip.trim()}`,
        priority: draft.priority,
      };
    }
    if (selectedAction.id === 'trip-report') {
      if (!draft.linkedTrip.trim() || !draft.summary.trim()) return null;
      return {
        serviceId: selectedAction.serviceId,
        title: `Trip report - ${draft.linkedTrip.trim()}`,
        reason: draft.summary.trim(),
        priority: draft.priority,
      };
    }
    if (!draft.linkedTrip.trim() || !draft.spentAmount.trim()) return null;
    return {
      serviceId: selectedAction.serviceId,
      title: `Settlement - ${draft.linkedTrip.trim()}`,
      reason: `Spent: NGN ${Number(draft.spentAmount).toLocaleString('en-NG')}${draft.balanceAmount ? ` · Balance: NGN ${Number(draft.balanceAmount).toLocaleString('en-NG')}` : ''}`,
      priority: draft.priority,
    };
  };

  const submitDisabled = !buildSubmission();

  const handleSubmit = async () => {
    const submission = buildSubmission();
    if (!submission) return;
    await onSubmit(submission);
    setDraft(defaultDraft());
    setActiveAction(null);
    onRefresh?.();
  };

  const inputClass = 'mt-1 h-11 w-full rounded-[12px] border border-[#E2E8F0] bg-white px-3 text-[13px] font-medium text-[#0F172A] outline-none focus:border-[#93C5FD] focus:ring-2 focus:ring-[#DBEAFE]';
  const textareaClass = 'mt-1 w-full rounded-[12px] border border-[#E2E8F0] bg-white px-3 py-2 text-[13px] font-medium text-[#0F172A] outline-none focus:border-[#93C5FD] focus:ring-2 focus:ring-[#DBEAFE]';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <EssKpiCard label="Pending approvals" value={String(metrics.pending)} subtitle="Awaiting workflow action" icon={Clock} accent="#F59E0B" iconBg="#FFFBEB" />
        <EssKpiCard label="Active trips" value={String(metrics.activeTrips)} subtitle="Requests in progress" icon={Plane} accent="#2563EB" iconBg="#DBEAFE" />
        <EssKpiCard label="Advances" value={money(metrics.advances)} subtitle="Requested travel advances" icon={Banknote} accent="#16A34A" iconBg="#ECFDF5" />
        <EssKpiCard label="Settlements due" value={String(metrics.settlementsDue)} subtitle="Approved trips needing close-out" icon={WalletCards} accent="#7C3AED" iconBg="#F5F3FF" />
      </div>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[420px_1fr]">
        <div className="space-y-4">
          <EssCard className="p-5">
            <EssSectionHeader title="Travel Management" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1">
              {travelActions.map((action) => (
                <EssQuickActionCard
                  key={action.id}
                  title={action.title}
                  description={action.description}
                  icon={action.icon}
                  accent={action.accent}
                  iconBg={action.iconBg}
                  onClick={() => openForm(action.id)}
                />
              ))}
            </div>
          </EssCard>

          {activeAction && selectedAction ? (
            <EssCard className="p-5">
              <EssSectionHeader title={selectedAction.title} />
              <p className="mb-4 text-[12px] text-[#64748B]">Complete the form and submit for approval routing.</p>

              <div className="space-y-3">
                {activeAction === 'request' ? (
                  <>
                    <div>
                      <label className="text-[11px] font-bold uppercase tracking-wide text-[#94A3B8]">Destination</label>
                      <input value={draft.destination} onChange={(e) => setDraft((prev) => ({ ...prev, destination: e.target.value }))} placeholder="e.g. Abuja" className={inputClass} />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold uppercase tracking-wide text-[#94A3B8]">Purpose</label>
                      <textarea value={draft.purpose} onChange={(e) => setDraft((prev) => ({ ...prev, purpose: e.target.value }))} rows={3} placeholder="e.g. Client visit and stakeholder meetings" className={textareaClass} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-bold uppercase tracking-wide text-[#94A3B8]">Start date</label>
                        <input type="date" value={draft.startDate} onChange={(e) => setDraft((prev) => ({ ...prev, startDate: e.target.value }))} className={inputClass} />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold uppercase tracking-wide text-[#94A3B8]">End date</label>
                        <input type="date" value={draft.endDate} onChange={(e) => setDraft((prev) => ({ ...prev, endDate: e.target.value }))} className={inputClass} />
                      </div>
                    </div>
                  </>
                ) : null}

                {activeAction === 'advance' ? (
                  <>
                    <div>
                      <label className="text-[11px] font-bold uppercase tracking-wide text-[#94A3B8]">Linked trip</label>
                      <input list="ess-travel-trip-options" value={draft.linkedTrip} onChange={(e) => setDraft((prev) => ({ ...prev, linkedTrip: e.target.value }))} placeholder="Select or enter trip destination" className={inputClass} />
                      <datalist id="ess-travel-trip-options">
                        {approvedTrips.map((trip) => <option key={trip.id} value={trip.destination} />)}
                      </datalist>
                    </div>
                    <div>
                      <label className="text-[11px] font-bold uppercase tracking-wide text-[#94A3B8]">Advance amount (NGN)</label>
                      <input type="number" min="0" value={draft.amount} onChange={(e) => setDraft((prev) => ({ ...prev, amount: e.target.value }))} placeholder="150000" className={inputClass} />
                    </div>
                  </>
                ) : null}

                {activeAction === 'trip-report' ? (
                  <>
                    <div>
                      <label className="text-[11px] font-bold uppercase tracking-wide text-[#94A3B8]">Trip</label>
                      <input list="ess-travel-trip-options-report" value={draft.linkedTrip} onChange={(e) => setDraft((prev) => ({ ...prev, linkedTrip: e.target.value }))} placeholder="Trip destination" className={inputClass} />
                      <datalist id="ess-travel-trip-options-report">
                        {approvedTrips.map((trip) => <option key={trip.id} value={trip.destination} />)}
                      </datalist>
                    </div>
                    <div>
                      <label className="text-[11px] font-bold uppercase tracking-wide text-[#94A3B8]">Trip summary & outcomes</label>
                      <textarea value={draft.summary} onChange={(e) => setDraft((prev) => ({ ...prev, summary: e.target.value }))} rows={4} placeholder="Summarize meetings, deliverables, and supporting evidence" className={textareaClass} />
                    </div>
                  </>
                ) : null}

                {activeAction === 'settlement' ? (
                  <>
                    <div>
                      <label className="text-[11px] font-bold uppercase tracking-wide text-[#94A3B8]">Linked trip</label>
                      <input list="ess-travel-trip-options-settlement" value={draft.linkedTrip} onChange={(e) => setDraft((prev) => ({ ...prev, linkedTrip: e.target.value }))} placeholder="Trip destination" className={inputClass} />
                      <datalist id="ess-travel-trip-options-settlement">
                        {approvedTrips.map((trip) => <option key={trip.id} value={trip.destination} />)}
                      </datalist>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-bold uppercase tracking-wide text-[#94A3B8]">Amount spent</label>
                        <input type="number" min="0" value={draft.spentAmount} onChange={(e) => setDraft((prev) => ({ ...prev, spentAmount: e.target.value }))} className={inputClass} />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold uppercase tracking-wide text-[#94A3B8]">Balance returned</label>
                        <input type="number" min="0" value={draft.balanceAmount} onChange={(e) => setDraft((prev) => ({ ...prev, balanceAmount: e.target.value }))} className={inputClass} />
                      </div>
                    </div>
                  </>
                ) : null}

                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wide text-[#94A3B8]">Priority</label>
                  <div className="mt-1 flex gap-2">
                    {['Low', 'Normal', 'High'].map((level) => (
                      <button
                        key={level}
                        type="button"
                        onClick={() => setDraft((prev) => ({ ...prev, priority: level }))}
                        className={`h-9 flex-1 rounded-[10px] text-[12px] font-bold ${
                          draft.priority === level ? 'bg-[#DBEAFE] text-[#2563EB] ring-1 ring-[#BFDBFE]' : 'bg-white text-[#94A3B8] ring-1 ring-[#E2E8F0]'
                        }`}
                      >
                        {level}
                      </button>
                    ))}
                  </div>
                </div>

                {submitError ? <p className="rounded-[10px] bg-[#FEF2F2] px-3 py-2 text-[12px] font-semibold text-[#DC2626]">{submitError}</p> : null}
                {submitNotice ? <p className="rounded-[10px] bg-[#ECFDF5] px-3 py-2 text-[12px] font-semibold text-[#16A34A]">{submitNotice}</p> : null}

                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={saving || submitDisabled}
                    onClick={() => void handleSubmit()}
                    className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-[12px] bg-[#2563EB] text-[13px] font-bold text-white hover:bg-[#1D4ED8] disabled:cursor-not-allowed disabled:bg-[#E2E8F0] disabled:text-[#94A3B8]"
                  >
                    <Send className="h-4 w-4" />
                    {saving ? 'Submitting…' : 'Submit for approval'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveAction(null)}
                    className="inline-flex h-11 items-center rounded-[12px] border border-[#E2E8F0] bg-white px-4 text-[13px] font-semibold text-[#0F172A] hover:bg-[#F8FAFC]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </EssCard>
          ) : null}

          {selectedCatalog ? (
            <EssCard className="p-5">
              <EssSectionHeader title="Approval route" />
              <p className="text-[12px] text-[#64748B]">{selectedCatalog.label} · SLA target {selectedCatalog.slaHours}h</p>
              <div className="mt-3 space-y-2">
                {selectedCatalog.workflow.map((stage, index) => (
                  <div key={`${stage}-${index}`} className="flex items-center gap-2 rounded-[10px] bg-[#F8FAFC] px-3 py-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#EFF6FF] text-[10px] font-bold text-[#2563EB]">{index + 1}</span>
                    <span className="text-[13px] font-semibold text-[#0F172A]">{stage}</span>
                  </div>
                ))}
              </div>
            </EssCard>
          ) : null}
        </div>

        <EssCard className="p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <EssSectionHeader title="Requests, Approvals, Advances & Settlements" />
            <div className="flex flex-wrap gap-1">
              {[
                ['all', 'All'],
                ['request', 'Requests'],
                ['advance', 'Advances'],
                ['trip-report', 'Reports'],
                ['settlement', 'Settlements'],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setStatusFilter(id as typeof statusFilter)}
                  className={`rounded-full px-3 py-1 text-[11px] font-bold ${
                    statusFilter === id ? 'bg-[#2563EB] text-white' : 'bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {filteredRecords.length ? (
            <div className="space-y-3">
              {filteredRecords.map((record) => (
                <div key={record.id} className="rounded-[16px] border border-[#E9EEF5] bg-[#F8FAFC] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[15px] font-bold text-[#0F172A]">{record.destination}</p>
                        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-[#64748B] ring-1 ring-[#E2E8F0]">{record.typeLabel}</span>
                      </div>
                      <p className="mt-1 text-[13px] text-[#64748B]">{record.purpose}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusBadge(record.status)}`}>{record.status}</span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                    <div className="rounded-[12px] border border-[#E9EEF5] bg-white px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-[#94A3B8]">Submitted</p>
                      <p className="mt-1 text-[13px] font-semibold text-[#0F172A]">{formatDateTime(record.submittedAt)}</p>
                    </div>
                    <div className="rounded-[12px] border border-[#E9EEF5] bg-white px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-[#94A3B8]">Travel dates</p>
                      <p className="mt-1 text-[13px] font-semibold text-[#0F172A]">
                        {record.startDate || record.endDate ? `${formatDate(record.startDate)} – ${formatDate(record.endDate)}` : '—'}
                      </p>
                    </div>
                    <div className="rounded-[12px] border border-[#E9EEF5] bg-white px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-[#94A3B8]">Advance</p>
                      <p className="mt-1 text-[13px] font-semibold text-[#0F172A]">{record.advance > 0 ? money(record.advance) : '—'}</p>
                    </div>
                    <div className="rounded-[12px] border border-[#E9EEF5] bg-white px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-[#94A3B8]">Trip report</p>
                      <p className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${tripReportBadge(record.tripReport)}`}>{record.tripReport}</p>
                    </div>
                  </div>

                  <div className="mt-4">
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[#94A3B8]">Workflow</p>
                    <EssWorkflowStepper stages={workflowStages(record)} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EssEmptyState
              icon={Plane}
              title="No travel requests"
              description="Submit a travel request using the action cards on the left and it will appear here with live workflow status."
            />
          )}
        </EssCard>
      </section>
    </div>
  );
}
