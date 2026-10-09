import { Suspense } from 'react';
import { OpportunitiesBoard } from '../_components/OpportunitiesBoard';

export default function OpportunitiesPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Loading opportunities…</p>}>
      <OpportunitiesBoard />
    </Suspense>
  );
}
