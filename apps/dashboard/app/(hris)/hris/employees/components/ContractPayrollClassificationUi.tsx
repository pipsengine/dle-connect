'use client';

import { useState } from 'react';
import { AlertTriangle, Banknote, CircleOff, Loader2 } from 'lucide-react';

export type ContractPayrollClassificationView = {
  isContractCode: boolean;
  isDailyRate: boolean;
  shouldDeactivate: boolean;
  payrollEligible: boolean;
  label: string;
  recommendation: string | null;
};

type ApiEnvelope<T> = { status: 'success' | 'error'; data?: T; error?: string };

export type ContractPayrollClassificationAction = 'deactivate-non-daily' | 'activate-daily-rate';

export const patchContractPayrollClassification = async (
  employeeId: string,
  action: ContractPayrollClassificationAction,
  reason?: string,
): Promise<ContractPayrollClassificationView> => {
  const res = await fetch(`/api/hris/employees/${encodeURIComponent(employeeId)}/contract-payroll-classification`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, reason }),
  });
  const json = (await res.json()) as ApiEnvelope<{ classification: ContractPayrollClassificationView }>;
  if (!res.ok || json.status !== 'success' || !json.data?.classification) {
    throw new Error(json.error || 'Classification update failed');
  }
  return json.data.classification;
};

export const bulkApplyContractPayrollRules = async (input: {
  action: ContractPayrollClassificationAction;
  employeeIds?: string[];
  applyAll?: boolean;
  reason?: string;
}) => {
  const res = await fetch('/api/hris/employees/contract-payroll-classification', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = (await res.json()) as ApiEnvelope<{ processed: number; succeeded: number; results: Array<{ employeeId: string; ok: boolean; error?: string }> }>;
  if (!res.ok || json.status !== 'success' || !json.data) {
    throw new Error(json.error || 'Bulk classification failed');
  }
  return json.data;
};

export function ContractPayrollBadge({ classification }: { classification?: ContractPayrollClassificationView | null }) {
  if (!classification?.isContractCode) return null;
  const tone = classification.isDailyRate
    ? 'bg-emerald-600/10 text-emerald-800 border-emerald-200'
    : classification.shouldDeactivate
      ? 'bg-amber-600/10 text-amber-900 border-amber-200'
      : 'bg-slate-100 text-slate-700 border-slate-200';
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${tone}`} title={classification.recommendation || undefined}>
      {classification.isDailyRate ? <Banknote className="w-3 h-3" /> : classification.shouldDeactivate ? <AlertTriangle className="w-3 h-3" /> : null}
      {classification.label}
    </span>
  );
}

export function ContractPayrollClassificationPanel({
  employeeId,
  employeeName,
  employmentStatus,
  classification,
  canManage,
  onUpdated,
}: {
  employeeId: string;
  employeeName: string;
  employmentStatus: string;
  classification?: ContractPayrollClassificationView | null;
  canManage: boolean;
  onUpdated: (next: ContractPayrollClassificationView) => void;
}) {
  const [busy, setBusy] = useState<ContractPayrollClassificationAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!classification?.isContractCode) return null;

  const showDeactivate = canManage && classification.shouldDeactivate && employmentStatus !== 'Inactive';
  const showActivate = canManage && classification.isContractCode && !classification.isDailyRate;

  const run = async (action: ContractPayrollClassificationAction) => {
    const label = action === 'deactivate-non-daily' ? 'deactivate this non-daily contract employee' : 'set up daily-rate payroll for this contract employee';
    if (!window.confirm(`Apply payroll classification for ${employeeName} (${employeeId})?\n\nThis will ${label} in DLE_Enterprise.`)) return;
    setBusy(action);
    setError(null);
    try {
      const next = await patchContractPayrollClassification(
        employeeId,
        action,
        action === 'deactivate-non-daily'
          ? 'Non-daily C-code contract — excluded from payroll (directory/profile action)'
          : 'Set up as daily-rate contract payroll (directory/profile action)',
      );
      onUpdated(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Classification update failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-extrabold text-slate-700">Contract payroll classification</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <ContractPayrollBadge classification={classification} />
            {classification.payrollEligible ? (
              <span className="text-[11px] font-bold text-emerald-700">Payroll eligible</span>
            ) : (
              <span className="text-[11px] font-bold text-amber-800">Excluded from payroll runs</span>
            )}
          </div>
          {classification.recommendation && <p className="mt-2 text-xs font-semibold text-slate-600 max-w-2xl">{classification.recommendation}</p>}
        </div>
        {(showDeactivate || showActivate) && (
          <div className="flex flex-wrap items-center gap-2">
            {showDeactivate && (
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => void run('deactivate-non-daily')}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-amber-300 bg-amber-50 text-xs font-extrabold text-amber-900 hover:bg-amber-100 disabled:opacity-60"
              >
                {busy === 'deactivate-non-daily' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CircleOff className="w-4 h-4" />}
                Deactivate (non-daily)
              </button>
            )}
            {showActivate && (
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => void run('activate-daily-rate')}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-emerald-300 bg-emerald-50 text-xs font-extrabold text-emerald-900 hover:bg-emerald-100 disabled:opacity-60"
              >
                {busy === 'activate-daily-rate' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Banknote className="w-4 h-4" />}
                Set up daily rate
              </button>
            )}
          </div>
        )}
      </div>
      {error && <div className="text-xs font-extrabold text-red-700">{error}</div>}
    </div>
  );
}
