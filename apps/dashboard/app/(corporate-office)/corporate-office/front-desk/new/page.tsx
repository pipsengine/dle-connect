'use client';

import { ArrowLeft, Mail } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CorporateOfficeBreadcrumbs } from '../../corporate-office-portal-shell';
import { CorrespondenceForm } from '../_components/CorrespondenceForm';
import { PageHeader, ToastStack, useToasts } from '../_components/ui';
import { useCorrespondenceStore } from '../_lib/useCorrespondenceStore';

export default function NewCorrespondencePage() {
  const router = useRouter();
  const { isLoaded, error, addCorrespondence } = useCorrespondenceStore();
  const { toasts, addToast, dismissToast } = useToasts();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <CorporateOfficeBreadcrumbs items={['Front Desk', 'Log Correspondence']} />
      <PageHeader
        icon={<Mail className="h-5 w-5" />}
        iconColor="bg-indigo-50 text-indigo-600"
        title="Log Incoming Correspondence"
        description="Record a letter or document received at the front desk and route it to the right department. The record is written to the enterprise database."
        action={<Link href="/corporate-office/front-desk" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"><ArrowLeft className="h-4 w-4" />Back to Front Desk</Link>}
      />
      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div> : null}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        {isLoaded && !error ? (
          <CorrespondenceForm
            onCancel={() => router.push('/corporate-office/front-desk')}
            onSave={async (data, files) => {
              const created = await addCorrespondence(data, files);
              addToast(`${created.referenceNo} logged`);
              router.push('/corporate-office/front-desk');
            }}
          />
        ) : null}
      </div>
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
