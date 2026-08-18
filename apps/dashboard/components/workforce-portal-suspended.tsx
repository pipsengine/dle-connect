import Link from 'next/link';
import { Construction } from 'lucide-react';
import { EnterpriseHomeButton } from '@/components/layout/enterprise-home-button';

export function WorkforcePortalSuspended() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-700 ring-1 ring-amber-100">
          <Construction className="h-6 w-6" />
        </div>
        <p className="mt-5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-amber-700">Temporarily unavailable</p>
        <h1 className="mt-2 text-2xl font-black text-slate-950">Workforce Portal is not in use yet</h1>
        <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
          Employee self-service has been suspended until the portal is ready to publish. Continue from Enterprise Home for live modules.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <EnterpriseHomeButton />
          <Link href="/" className="inline-flex h-10 items-center rounded-lg border border-slate-200 px-4 text-sm font-extrabold text-slate-700 hover:bg-slate-50">
            Go to dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
