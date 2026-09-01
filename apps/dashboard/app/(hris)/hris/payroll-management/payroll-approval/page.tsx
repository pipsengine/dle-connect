import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, ShieldCheck, WalletCards, PlayCircle } from 'lucide-react';
import { PAYROLL_SCHEDULE_SCOPES } from '@/lib/payroll-schedule-scope';

export const metadata: Metadata = {
  title: 'Payroll Approval',
};

export default function PayrollApprovalHubPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-600 text-white">
          <ShieldCheck className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-950">Payroll Approval</h1>
          <p className="mt-1 max-w-3xl text-sm font-semibold text-slate-600">
            Each company and pay type has its own approval page, comments, and audit trail. Open one schedule at a time.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {PAYROLL_SCHEDULE_SCOPES.map((scope) => (
          <Link
            key={scope.id}
            href={scope.approvalHref}
            className="rounded-2xl border border-[#E5E7EB] bg-white p-5 text-left shadow-sm transition hover:border-blue-300 hover:shadow-md"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#0F172A] text-white">
              {scope.pack === 'daily-rate' ? <WalletCards className="h-5 w-5" /> : <PlayCircle className="h-5 w-5" />}
            </span>
            <h2 className="mt-4 text-lg font-bold text-[#0F172A]">{scope.label}</h2>
            <p className="mt-1 text-sm text-slate-600">Approve {scope.kindLabel} for {scope.company} only.</p>
            <span className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-[#2563EB]">
              Open approval
              <ArrowRight className="h-4 w-4" />
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
