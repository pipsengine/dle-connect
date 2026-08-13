'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, RefreshCw, Undo2 } from 'lucide-react';
import {
  moneyNgn,
  statusTone,
  TaShell,
  useTelephoneAllowanceApi,
  WorkflowStepper,
  type TaCapabilities,
} from '../_components/ta-shared';

type ApprovalCard = {
  id: string;
  cycleCode: string;
  pairLabel: string;
  year: number;
  status: string;
  rowVersion: number;
  beneficiaryCount: number;
  month1Total: number;
  month2Total: number;
  bimonthlyTotal: number;
  previousTotal?: number | null;
  variance?: number | null;
  preparedBy: string;
  hrReviewedBy?: string | null;
  added?: number;
  removed?: number;
  amountChanges?: number;
  currentStageLabel?: string;
};

type ApprovalsPayload = {
  pendingMyAction: ApprovalCard[];
  inProgress: ApprovalCard[];
  completed: ApprovalCard[];
  capabilities: TaCapabilities;
};

const tabs = ['Pending My Action', 'In Progress', 'Completed'] as const;

export default function TelephoneAllowanceApprovalsClient() {
  const { get, post, busy, toast, error } = useTelephoneAllowanceApi();
  const [tab, setTab] = useState<(typeof tabs)[number]>('Pending My Action');
  const [data, setData] = useState<ApprovalsPayload | null>(null);
  const [selected, setSelected] = useState<ApprovalCard | null>(null);
  const [detailTab, setDetailTab] = useState<'Summary' | 'Employees' | 'Changes' | 'Workflow'>('Summary');
  const [detail, setDetail] = useState<any>(null);

  const load = useCallback(async () => {
    const payload = await get<ApprovalsPayload>('approvals');
    setData(payload);
  }, [get]);

  useEffect(() => {
    void load().catch(console.error);
  }, [load]);

  const list = useMemo(() => {
    if (!data) return [];
    if (tab === 'Pending My Action') return data.pendingMyAction || [];
    if (tab === 'In Progress') return data.inProgress || [];
    return data.completed || [];
  }, [data, tab]);

  const openDetail = async (card: ApprovalCard) => {
    setSelected(card);
    setDetailTab('Summary');
    const res = await get<{ cycle: any }>('cycle', { cycleId: card.id });
    setDetail(res.cycle);
  };

  const act = async (action: string, extra: Record<string, unknown> = {}) => {
    if (!selected) return;
    if (action === 'authorize-cfo') {
      if (!window.confirm(`Authorize ${moneyNgn(selected.bimonthlyTotal)} for payment to ${selected.beneficiaryCount} beneficiaries?`)) return;
    }
    if (action.startsWith('approve')) {
      if (!window.confirm(`Approve ${selected.pairLabel} ${selected.year} Telephone Allowance totaling ${moneyNgn(selected.bimonthlyTotal)}?`)) return;
    }
    await post(action, { cycleId: selected.id, rowVersion: selected.rowVersion, ...extra });
    setSelected(null);
    setDetail(null);
    await load();
  };

  const caps = data?.capabilities;

  return (
    <TaShell
      title="Approvals"
      subtitle="Role-aware formal approval for HR, MD, and CFO authorization for payment."
      toast={toast}
      error={error}
    >
      <div className="flex flex-wrap gap-2">
        {tabs.map((item) => (
          <button key={item} type="button" onClick={() => setTab(item)} className={`min-h-10 rounded-lg px-3 text-xs font-black ${tab === item ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-700'}`}>
            {item}
          </button>
        ))}
        <button type="button" onClick={() => void load()} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {list.map((card) => (
          <button
            key={card.id}
            type="button"
            onClick={() => void openDetail(card)}
            className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase text-teal-700">{card.pairLabel} {card.year} Telephone Allowance</p>
                <p className="mt-1 text-sm font-semibold text-slate-500">{card.cycleCode}</p>
              </div>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${statusTone(card.status)}`}>{(card.currentStageLabel || card.status).replaceAll('_', ' ')}</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <p><span className="text-xs font-bold text-slate-500">Beneficiaries</span><br /><span className="font-black">{card.beneficiaryCount}</span></p>
              <p><span className="text-xs font-bold text-slate-500">Total</span><br /><span className="font-black">{moneyNgn(card.bimonthlyTotal)}</span></p>
              <p><span className="text-xs font-bold text-slate-500">Month 1</span><br /><span className="font-semibold">{moneyNgn(card.month1Total)}</span></p>
              <p><span className="text-xs font-bold text-slate-500">Month 2</span><br /><span className="font-semibold">{moneyNgn(card.month2Total)}</span></p>
            </div>
            <p className="mt-3 text-xs font-semibold text-slate-500">
              Added {card.added ?? 0} · Removed {card.removed ?? 0} · Amount changes {card.amountChanges ?? 0}
              {card.variance != null ? ` · Variance ${card.variance >= 0 ? '+' : ''}${moneyNgn(card.variance)}` : ''}
            </p>
          </button>
        ))}
        {!list.length ? <p className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-sm font-semibold text-slate-500">No items in this tab.</p> : null}
      </div>

      {selected ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="border-b border-slate-100 p-5">
              <h3 className="text-lg font-black text-slate-950">{selected.pairLabel} {selected.year} · {selected.cycleCode}</h3>
              <p className="mt-1 text-sm font-semibold text-slate-600">Prepared by {selected.preparedBy}{selected.hrReviewedBy ? ` · HR reviewed by ${selected.hrReviewedBy}` : ''}</p>
              <div className="mt-3"><WorkflowStepper status={selected.status} /></div>
              <div className="mt-3 flex flex-wrap gap-2">
                {(['Summary', 'Employees', 'Changes', 'Workflow'] as const).map((item) => (
                  <button key={item} type="button" onClick={() => setDetailTab(item)} className={`rounded-full px-3 py-1 text-[11px] font-black ${detailTab === item ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-700'}`}>{item}</button>
                ))}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {detailTab === 'Summary' ? (
                <div className="grid gap-3 md:grid-cols-2 text-sm">
                  <p>Beneficiaries: <strong>{selected.beneficiaryCount}</strong></p>
                  <p>Total: <strong>{moneyNgn(selected.bimonthlyTotal)}</strong></p>
                  <p>Month 1: <strong>{moneyNgn(selected.month1Total)}</strong></p>
                  <p>Month 2: <strong>{moneyNgn(selected.month2Total)}</strong></p>
                  {selected.status === 'PENDING_CFO_AUTHORIZATION' ? (
                    <p className="md:col-span-2 rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-base font-black text-indigo-950">
                      Amount to Authorize: {moneyNgn(selected.bimonthlyTotal)}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {detailTab === 'Employees' ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-[11px] font-black uppercase text-slate-500">
                      <tr>
                        <th className="px-2 py-2 text-left">Employee</th>
                        <th className="px-2 py-2 text-right">M1</th>
                        <th className="px-2 py-2 text-right">M2</th>
                        <th className="px-2 py-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(detail?.employees || []).slice(0, 200).map((e: any) => (
                        <tr key={e.id || e.employeeCode} className="border-t border-slate-100">
                          <td className="px-2 py-1.5 font-semibold">{e.employeeName}<div className="text-xs text-slate-500">{e.employeeCode}</div></td>
                          <td className="px-2 py-1.5 text-right">{moneyNgn(e.month1Amount)}</td>
                          <td className="px-2 py-1.5 text-right">{moneyNgn(e.month2Amount)}</td>
                          <td className="px-2 py-1.5 text-right font-black">{moneyNgn(e.bimonthlyTotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              {detailTab === 'Changes' ? (
                <div className="space-y-2">
                  {(detail?.changes || []).map((c: any, i: number) => (
                    <div key={i} className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-sm">
                      <p className="font-black">{c.changeType} · {c.employeeCode}</p>
                      <p className="text-xs text-slate-600">{c.reason}</p>
                    </div>
                  ))}
                  {!detail?.changes?.length ? <p className="text-sm font-semibold text-slate-500">No changes.</p> : null}
                </div>
              ) : null}
              {detailTab === 'Workflow' ? (
                <div className="space-y-2">
                  {(detail?.approvals || []).map((a: any) => (
                    <div key={a.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                      <p className="font-black">{a.stage} · {a.action}</p>
                      <p className="text-xs text-slate-500">{a.actor} · {new Date(a.createdAt).toLocaleString()}</p>
                      {a.comment || a.reason ? <p className="mt-1 text-xs">{a.comment || a.reason}</p> : null}
                    </div>
                  ))}
                  {!detail?.approvals?.length ? <p className="text-sm font-semibold text-slate-500">No approval actions yet.</p> : null}
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap justify-between gap-2 border-t border-slate-100 p-4">
              <button type="button" onClick={() => { setSelected(null); setDetail(null); }} className="min-h-10 rounded-lg border border-slate-200 px-3 text-xs font-black">Close</button>
              <div className="flex flex-wrap gap-2">
                {(caps?.canHrApprove || caps?.canMdApprove || caps?.canCfoAuthorize) && ['PENDING_HR_APPROVAL', 'PENDING_MD_APPROVAL', 'PENDING_CFO_AUTHORIZATION'].includes(selected.status) ? (
                  <button
                    type="button"
                    disabled={Boolean(busy)}
                    className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 text-xs font-black text-rose-800 disabled:opacity-50"
                    onClick={() => {
                      const reason = window.prompt('Return reason', 'Incorrect amount') || '';
                      const comment = window.prompt('Detailed comment', '') || '';
                      if (!reason) return;
                      void act('return-correction', { reason, comment });
                    }}
                  >
                    <Undo2 className="h-4 w-4" /> Return for Correction
                  </button>
                ) : null}
                {caps?.canHrApprove && selected.status === 'PENDING_HR_APPROVAL' ? (
                  <button type="button" disabled={Boolean(busy)} onClick={() => void act('approve-hr')} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-emerald-700 px-3 text-xs font-black text-white disabled:opacity-50">
                    <CheckCircle2 className="h-4 w-4" /> Approve
                  </button>
                ) : null}
                {caps?.canMdApprove && selected.status === 'PENDING_MD_APPROVAL' ? (
                  <button type="button" disabled={Boolean(busy)} onClick={() => void act('approve-md')} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-emerald-700 px-3 text-xs font-black text-white disabled:opacity-50">
                    <CheckCircle2 className="h-4 w-4" /> Approve
                  </button>
                ) : null}
                {caps?.canCfoAuthorize && selected.status === 'PENDING_CFO_AUTHORIZATION' ? (
                  <button type="button" disabled={Boolean(busy)} onClick={() => void act('authorize-cfo')} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-indigo-700 px-3 text-xs font-black text-white disabled:opacity-50">
                    <CheckCircle2 className="h-4 w-4" /> Authorize for Payment
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </TaShell>
  );
}
