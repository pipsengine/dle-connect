'use client';

import { useCallback, useEffect, useState } from 'react';

export type TaCapabilities = {
  canView: boolean;
  canPrepare: boolean;
  canHrReview: boolean;
  canHrApprove: boolean;
  canMdApprove: boolean;
  canCfoAuthorize: boolean;
  canTreasury: boolean;
  canExport: boolean;
  canImport: boolean;
  canSeeFullBank: boolean;
};

export const moneyNgn = (value: number | null | undefined) =>
  `₦${Number(value || 0).toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export const statusTone = (status: string) => {
  if (/COMPLETED|PAID|AUTHORIZED/.test(status)) return 'bg-emerald-50 text-emerald-800 border-emerald-200';
  if (/PENDING|PROCESSING|IT_VALIDATION|RETURNED/.test(status)) return 'bg-amber-50 text-amber-900 border-amber-200';
  if (/DRAFT/.test(status)) return 'bg-slate-50 text-slate-700 border-slate-200';
  return 'bg-sky-50 text-sky-900 border-sky-200';
};

export const badgeTone = (badge: string) => {
  if (badge === 'ADDED') return 'bg-emerald-100 text-emerald-800';
  if (badge === 'REMOVED') return 'bg-rose-100 text-rose-800';
  if (badge.includes('AMOUNT') || badge.includes('CHANGED')) return 'bg-amber-100 text-amber-900';
  if (badge.includes('ONLY') || badge.includes('MONTH')) return 'bg-sky-100 text-sky-900';
  return 'bg-slate-100 text-slate-700';
};

async function readJson<T>(res: Response): Promise<{ status: string; data?: T; error?: string }> {
  const json = await res.json().catch(() => ({ status: 'error', error: 'Invalid response' }));
  return json;
}

export function useTelephoneAllowanceApi() {
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');

  const get = useCallback(async <T,>(view: string, params?: Record<string, string>) => {
    const qs = new URLSearchParams({ view, ...(params || {}) });
    const res = await fetch(`/api/it-support/telephone-allowance?${qs.toString()}`, { cache: 'no-store' });
    const json = await readJson<T>(res);
    if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Request failed');
    return json.data as T;
  }, []);

  const post = useCallback(async <T,>(action: string, body: Record<string, unknown> = {}) => {
    setBusy(action);
    setError('');
    try {
      const res = await fetch('/api/it-support/telephone-allowance', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, ...body }),
      });
      const json = await readJson<T & { message?: string }>(res);
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Action failed');
      setToast((json.data as { message?: string })?.message || 'Done.');
      return json.data as T;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Action failed';
      setError(msg);
      setToast(msg);
      throw e;
    } finally {
      setBusy('');
    }
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  return { get, post, busy, toast, error, setToast, setError };
}

export function TaShell({
  title,
  subtitle,
  children,
  toast,
  error,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  toast?: string;
  error?: string;
}) {
  return (
    <div className="space-y-4 p-4 md:p-6">
      <header className="rounded-2xl border border-teal-100 bg-gradient-to-r from-teal-50 to-white p-5 shadow-sm">
        <p className="text-xs font-black uppercase tracking-wide text-teal-700">Telephone Allowance</p>
        <h1 className="mt-1 text-2xl font-black text-slate-950">{title}</h1>
        {subtitle ? <p className="mt-1 max-w-4xl text-sm font-semibold text-slate-600">{subtitle}</p> : null}
      </header>
      {toast ? (
        <div className={`rounded-xl border px-4 py-3 text-sm font-semibold ${error && toast === error ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>
          {toast}
        </div>
      ) : null}
      {children}
    </div>
  );
}

export function WorkflowStepper({ status }: { status?: string }) {
  const steps = [
    { id: 'IT_PREP', label: 'IT Preparation', match: /DRAFT|RETURNED_TO_IT|RETURNED_FOR_CORRECTION|IT_VALIDATION/ },
    { id: 'HR_REVIEW', label: 'HR Review', match: /PENDING_HR_REVIEW/ },
    { id: 'IT_VAL', label: 'IT Validation', match: /RETURNED_TO_IT|IT_VALIDATION/ },
    { id: 'HR_APP', label: 'HR Approval', match: /PENDING_HR_APPROVAL/ },
    { id: 'MD', label: 'MD Approval', match: /PENDING_MD_APPROVAL/ },
    { id: 'CFO', label: 'CFO Authorization', match: /PENDING_CFO_AUTHORIZATION/ },
    { id: 'PAY', label: 'Payment', match: /AUTHORIZED|PAYMENT|PAID|COMPLETED/ },
  ];
  const order = ['DRAFT', 'PENDING_HR_REVIEW', 'RETURNED_TO_IT', 'IT_VALIDATION', 'PENDING_HR_APPROVAL', 'PENDING_MD_APPROVAL', 'PENDING_CFO_AUTHORIZATION', 'AUTHORIZED_FOR_PAYMENT', 'PAYMENT_PROCESSING', 'PARTIALLY_PAID', 'PAID', 'COMPLETED'];
  const idx = order.indexOf(status || 'DRAFT');
  return (
    <ol className="flex flex-wrap gap-2">
      {steps.map((step, i) => {
        const done = idx > i || (status === 'COMPLETED' && i <= 6);
        const current = Boolean(status && step.match.test(status) && status !== 'COMPLETED');
        return (
          <li
            key={step.id}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold ${
              done ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : current ? 'border-teal-300 bg-teal-50 text-teal-900' : 'border-slate-200 bg-white text-slate-500'
            }`}
          >
            <span>{done ? '✓' : current ? '●' : '○'}</span>
            {step.label}
          </li>
        );
      })}
    </ol>
  );
}
