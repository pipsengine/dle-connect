import { Suspense } from 'react';
import { OpportunitiesBoard } from '../_components/OpportunitiesBoard';

export default function EnquiriesPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Loading enquiries…</p>}>
      <OpportunitiesBoard initialTab="Enquiries" />
    </Suspense>
  );
}
