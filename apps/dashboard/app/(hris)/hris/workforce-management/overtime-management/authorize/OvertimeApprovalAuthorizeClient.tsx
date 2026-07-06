'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, Lock, ShieldCheck, XCircle } from 'lucide-react';

type PreviewPayload = {
  authenticated: boolean;
  authorized: boolean;
  decision: 'approve' | 'reject';
  stageLabel: string;
  projectCode: string;
  projectName: string;
  workDate: string;
  supervisorName: string;
  requestedHours: number;
  reason: string;
  status: string;
  statusOk: boolean;
  requiresLogin: boolean;
};

type ApiResponse<T> = { status: 'success' | 'error'; data?: T; error?: string };

export default function OvertimeApprovalAuthorizeClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token') || '';
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [done, setDone] = useState('');

  useEffect(() => {
    if (!token) {
      setError('Approval token is missing from this link.');
      setLoading(false);
      return;
    }
    void (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`/api/hris/workforce-management/overtime-management/email-action?token=${encodeURIComponent(token)}`, { cache: 'no-store' });
        const json = (await res.json()) as ApiResponse<PreviewPayload>;
        if (!res.ok || json.status !== 'success' || !json.data) throw new Error(json.error || 'Unable to load overtime approval request.');
        setPreview(json.data);
        if (json.data.requiresLogin) {
          const next = `/hris/workforce-management/overtime-management/authorize?token=${encodeURIComponent(token)}`;
          router.replace(`/login?next=${encodeURIComponent(next)}`);
        }
      } catch (event) {
        setError(event instanceof Error ? event.message : 'Unable to load overtime approval request.');
      } finally {
        setLoading(false);
      }
    })();
  }, [token, router]);

  const confirm = async () => {
    if (!token) return;
    setPosting(true);
    setError('');
    try {
      const res = await fetch('/api/hris/workforce-management/overtime-management/email-action', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, note }),
      });
      const json = (await res.json()) as ApiResponse<{ status: string; projectCode: string; decision: string }>;
      if (!res.ok || json.status !== 'success' || !json.data) throw new Error(json.error || 'Unable to complete overtime approval.');
      setDone(`${json.data.decision === 'approve' ? 'Approved' : 'Rejected'} — overtime authorization is now ${json.data.status}.`);
    } catch (event) {
      setError(event instanceof Error ? event.message : 'Unable to complete overtime approval.');
    } finally {
      setPosting(false);
    }
  };

  if (loading) {
    return <div className="mx-auto max-w-2xl px-6 py-16 text-sm font-semibold text-slate-600">Verifying authenticated overtime approval link…</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="mx-auto max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-600 text-white">
            <ShieldCheck className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-black text-slate-950">Secure Overtime Approval</h1>
            <p className="mt-1 text-sm font-semibold text-slate-600">Authenticated approval is required before this overtime action can be completed.</p>
          </div>
        </div>

        {error ? <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">{error}</div> : null}
        {done ? (
          <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
            {done}
            <div className="mt-3">
              <Link href="/hris/workforce-management/overtime-management" className="font-extrabold text-emerald-900 underline">
                Open Overtime Management
              </Link>
            </div>
          </div>
        ) : null}

        {preview && !done ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-700">
                <Lock className="h-4 w-4" />
                Session verified
              </div>
              <p className="mt-2 text-lg font-black text-slate-950">{preview.projectCode} — {preview.projectName}</p>
              <p className="text-sm font-semibold text-slate-600">{preview.stageLabel} · {preview.workDate}</p>
              <p className="text-sm font-semibold text-slate-600">Current status: {preview.status}</p>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-white p-3"><p className="text-xs font-bold uppercase text-slate-500">Supervisor</p><p className="font-black">{preview.supervisorName}</p></div>
                <div className="rounded-xl bg-white p-3"><p className="text-xs font-bold uppercase text-slate-500">Hours</p><p className="font-black">{preview.requestedHours}</p></div>
                <div className="col-span-2 rounded-xl bg-white p-3"><p className="text-xs font-bold uppercase text-slate-500">Reason</p><p className="font-black">{preview.reason}</p></div>
                <div className="rounded-xl bg-white p-3"><p className="text-xs font-bold uppercase text-slate-500">Requested Action</p><p className="font-black capitalize">{preview.decision}</p></div>
              </div>
            </div>

            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Optional approval note or rejection reason"
              className="min-h-24 w-full rounded-2xl border border-slate-200 p-3 text-sm font-semibold outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
            />

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={posting || !preview.authorized || !preview.statusOk}
                onClick={() => void confirm()}
                className={`inline-flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-50 ${preview.decision === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}`}
              >
                {preview.decision === 'approve' ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                {posting ? 'Processing…' : preview.decision === 'approve' ? 'Confirm Approval' : 'Confirm Rejection'}
              </button>
              <Link href="/hris/workforce-management/overtime-management" className="inline-flex h-11 items-center rounded-xl border border-slate-200 px-4 text-sm font-extrabold text-slate-700 hover:bg-slate-50">
                Open Overtime Workspace
              </Link>
            </div>

            {!preview.authorized ? (
              <p className="text-sm font-bold text-amber-700">Your signed-in account is not authorized for this approval link. Sign in with the designated approver account.</p>
            ) : null}
            {!preview.statusOk ? (
              <p className="text-sm font-bold text-amber-700">This overtime request has already moved to another approval stage.</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
