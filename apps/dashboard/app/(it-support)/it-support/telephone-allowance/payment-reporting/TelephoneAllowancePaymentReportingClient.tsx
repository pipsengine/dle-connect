'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import {
  moneyNgn,
  statusTone,
  TaShell,
  useTelephoneAllowanceApi,
  type TaCapabilities,
} from '../_components/ta-shared';

type PaymentPayload = {
  payments: Array<{
    id: string;
    cycleId: string;
    cycleCode: string;
    status: string;
    authorizedAmount: number;
    paidAmount: number;
    beneficiaryCount: number;
    paymentDate?: string | null;
    paymentReference?: string | null;
    items: Array<{
      id: string;
      employeeCode: string;
      employeeName: string;
      amount: number;
      accountNoMasked: string;
      bankName: string;
      sortCode: string;
      status: string;
    }>;
  }>;
  treasuryReady?: Array<{
    id: string;
    cycleCode: string;
    status: string;
    beneficiaryCount: number;
    bimonthlyTotal: number;
  }>;
  exceptions: Array<{
    id: string;
    cycleCode: string;
    employeeCode?: string | null;
    employeeName?: string | null;
    type: string;
    severity: string;
    owner: string;
    status: string;
    createdAt: string;
  }>;
  audits: Array<{
    id: string;
    user: string;
    role: string;
    action: string;
    cycleId?: string | null;
    employeeCode?: string | null;
    reason?: string | null;
    createdAt: string;
    workflowStage?: string | null;
  }>;
  reports?: {
    paidYtd?: number;
    authorizedOutstanding?: number;
    failedItems?: number;
  };
  capabilities: TaCapabilities;
};

const tabs = ['Payment', 'Reports', 'Exceptions', 'Audit'] as const;

export default function TelephoneAllowancePaymentReportingClient() {
  const { get, post, busy, toast, error } = useTelephoneAllowanceApi();
  const [tab, setTab] = useState<(typeof tabs)[number]>('Payment');
  const [data, setData] = useState<PaymentPayload | null>(null);

  const load = useCallback(async () => {
    const [payment, exceptions, audits] = await Promise.all([
      get<PaymentPayload>('payment'),
      get<{ exceptions: PaymentPayload['exceptions']; capabilities: TaCapabilities }>('exceptions'),
      get<{ audits: PaymentPayload['audits']; capabilities: TaCapabilities }>('audit'),
    ]);
    setData({
      ...payment,
      exceptions: exceptions.exceptions || payment.exceptions || [],
      audits: audits.audits || payment.audits || [],
      capabilities: payment.capabilities,
    });
  }, [get]);

  useEffect(() => {
    void load().catch(console.error);
  }, [load]);

  const caps = data?.capabilities;
  const payments = data?.payments || [];

  return (
    <TaShell
      title="Payment & Reporting"
      subtitle="Treasury payment schedules, operational exceptions, reports, and immutable audit trail."
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

      {tab === 'Payment' ? (
        <div className="space-y-4">
          {(data?.treasuryReady || []).filter((c) => !payments.some((p) => p.cycleId === c.id)).map((cycle) => (
            <section key={cycle.id} className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
              <p className="text-xs font-black uppercase text-indigo-800">Authorized for payment</p>
              <h3 className="mt-1 text-lg font-black text-slate-950">{cycle.cycleCode}</h3>
              <p className="mt-1 text-sm font-semibold text-slate-700">{cycle.beneficiaryCount} beneficiaries · {moneyNgn(cycle.bimonthlyTotal)}</p>
              {(caps?.canTreasury || caps?.canPrepare) ? (
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  className="mt-3 min-h-10 rounded-lg bg-indigo-700 px-3 text-xs font-black text-white disabled:opacity-50"
                  onClick={() => void post('generate-payment-schedule', { cycleId: cycle.id }).then(() => load())}
                >
                  Generate Payment Schedule
                </button>
              ) : null}
            </section>
          ))}
          {!payments.length && !(data?.treasuryReady || []).length ? (
            <p className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-sm font-semibold text-slate-500">
              No CFO-authorized payment schedules yet. Authorize a cycle first, then generate the payment schedule.
            </p>
          ) : null}
          {payments.map((payment) => (
            <section key={payment.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-black uppercase text-teal-700">Telephone Allowance — {payment.cycleCode}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-600">Status: <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${statusTone(payment.status)}`}>{payment.status}</span></p>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                    <p><span className="block text-xs font-bold text-slate-500">Beneficiaries</span><span className="font-black">{payment.beneficiaryCount}</span></p>
                    <p><span className="block text-xs font-bold text-slate-500">Authorized</span><span className="font-black">{moneyNgn(payment.authorizedAmount)}</span></p>
                    <p><span className="block text-xs font-bold text-slate-500">Paid</span><span className="font-black">{moneyNgn(payment.paidAmount)}</span></p>
                    <p><span className="block text-xs font-bold text-slate-500">Reference</span><span className="font-semibold">{payment.paymentReference || '—'}</span></p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(caps?.canTreasury || caps?.canPrepare) ? (
                    <button
                      type="button"
                      disabled={Boolean(busy)}
                      onClick={() => void post('generate-payment-schedule', { cycleId: payment.cycleId }).then(() => load())}
                      className="min-h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black disabled:opacity-50"
                    >
                      Generate Payment Schedule
                    </button>
                  ) : null}
                  {(caps?.canExport || caps?.canTreasury) ? (
                    <a
                      href={`/api/it-support/telephone-allowance?view=export-payment&format=xls&cycleId=${encodeURIComponent(payment.cycleId)}`}
                      className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-emerald-700 px-3 text-xs font-black text-white"
                    >
                      <Download className="h-4 w-4" /> Export Payment File
                    </a>
                  ) : null}
                  {caps?.canTreasury ? (
                    <button
                      type="button"
                      disabled={Boolean(busy)}
                      className="min-h-10 rounded-lg bg-indigo-700 px-3 text-xs font-black text-white disabled:opacity-50"
                      onClick={() => {
                        const paymentReference = window.prompt('Payment reference', payment.paymentReference || `TA-${payment.cycleCode}`) || '';
                        const paymentDate = window.prompt('Payment date (YYYY-MM-DD)', new Date().toISOString().slice(0, 10)) || '';
                        if (!paymentReference || !paymentDate) return;
                        if (!window.confirm(`Record payment of ${moneyNgn(payment.authorizedAmount)} for ${payment.beneficiaryCount} beneficiaries?`)) return;
                        void post('record-payment', {
                          cycleId: payment.cycleId,
                          paymentReference,
                          paymentDate,
                          markCompleted: true,
                        }).then(() => load());
                      }}
                    >
                      Record Payment
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-[11px] font-black uppercase text-slate-500">
                    <tr>
                      <th className="px-2 py-2 text-left">Employee</th>
                      <th className="px-2 py-2 text-left">Bank</th>
                      <th className="px-2 py-2 text-left">Account</th>
                      <th className="px-2 py-2 text-right">Amount</th>
                      <th className="px-2 py-2 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payment.items.slice(0, 100).map((item) => (
                      <tr key={item.id} className="border-t border-slate-100">
                        <td className="px-2 py-1.5 font-semibold">{item.employeeName}<div className="text-xs text-slate-500">{item.employeeCode}</div></td>
                        <td className="px-2 py-1.5">{item.bankName}</td>
                        <td className="px-2 py-1.5 font-mono text-xs">{item.accountNoMasked}</td>
                        <td className="px-2 py-1.5 text-right font-black">{moneyNgn(item.amount)}</td>
                        <td className="px-2 py-1.5"><span className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${statusTone(item.status)}`}>{item.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      ) : null}

      {tab === 'Reports' ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-black text-slate-950">Payment & cost summary</h2>
          <p className="mt-1 text-sm font-semibold text-slate-600">Bimonthly payment process with treasury outstanding and year-to-date paid totals.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className="text-xs font-black uppercase text-slate-500">Paid YTD</p>
              <p className="mt-1 text-lg font-black">{moneyNgn(data?.reports?.paidYtd)}</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className="text-xs font-black uppercase text-slate-500">Authorized outstanding</p>
              <p className="mt-1 text-lg font-black">{moneyNgn(data?.reports?.authorizedOutstanding)}</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className="text-xs font-black uppercase text-slate-500">Failed items</p>
              <p className="mt-1 text-lg font-black">{data?.reports?.failedItems ?? 0}</p>
            </div>
          </div>
          <p className="mt-4 text-sm font-semibold text-slate-500">Export CALL CARDS-style payment files from the Payment tab for bank upload. Monthly entitlement and cycle registers are available from Allowance Management.</p>
        </section>
      ) : null}

      {tab === 'Exceptions' ? (
        <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-[11px] font-black uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">Cycle</th>
                <th className="px-3 py-2 text-left">Employee</th>
                <th className="px-3 py-2 text-left">Type</th>
                <th className="px-3 py-2 text-left">Severity</th>
                <th className="px-3 py-2 text-left">Owner</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Action</th>
              </tr>
            </thead>
            <tbody>
              {(data?.exceptions || []).map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">{row.cycleCode}</td>
                  <td className="px-3 py-2">{row.employeeName || '—'}<div className="text-xs text-slate-500">{row.employeeCode}</div></td>
                  <td className="px-3 py-2">{row.type}</td>
                  <td className="px-3 py-2">{row.severity}</td>
                  <td className="px-3 py-2">{row.owner}</td>
                  <td className="px-3 py-2"><span className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${statusTone(row.status)}`}>{row.status}</span></td>
                  <td className="px-3 py-2">
                    {row.status !== 'Resolved' && (caps?.canPrepare || caps?.canTreasury) ? (
                      <button
                        type="button"
                        className="rounded border border-slate-200 px-2 py-1 text-[10px] font-black"
                        onClick={() => {
                          const resolution = window.prompt('Resolution note', 'Corrected') || '';
                          if (!resolution) return;
                          void post('resolve-exception', { exceptionId: row.id, resolution }).then(() => load());
                        }}
                      >
                        Resolve
                      </button>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data?.exceptions?.length ? <p className="p-6 text-sm font-semibold text-slate-500">No open exceptions.</p> : null}
        </section>
      ) : null}

      {tab === 'Audit' ? (
        <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-[11px] font-black uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">When</th>
                <th className="px-3 py-2 text-left">User</th>
                <th className="px-3 py-2 text-left">Role</th>
                <th className="px-3 py-2 text-left">Action</th>
                <th className="px-3 py-2 text-left">Employee</th>
                <th className="px-3 py-2 text-left">Stage</th>
                <th className="px-3 py-2 text-left">Reason</th>
              </tr>
            </thead>
            <tbody>
              {(data?.audits || []).map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 whitespace-nowrap">{new Date(row.createdAt).toLocaleString()}</td>
                  <td className="px-3 py-2 font-semibold">{row.user}</td>
                  <td className="px-3 py-2">{row.role}</td>
                  <td className="px-3 py-2">{row.action}</td>
                  <td className="px-3 py-2">{row.employeeCode || '—'}</td>
                  <td className="px-3 py-2">{row.workflowStage || '—'}</td>
                  <td className="px-3 py-2">{row.reason || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data?.audits?.length ? <p className="p-6 text-sm font-semibold text-slate-500">No audit events yet.</p> : null}
        </section>
      ) : null}
    </TaShell>
  );
}
