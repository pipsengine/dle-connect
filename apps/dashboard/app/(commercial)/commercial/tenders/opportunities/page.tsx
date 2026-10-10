import { Suspense } from 'react';
import { OpportunitiesRegister } from '../_components/OpportunitiesRegister';

export default function OpportunitiesPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Loading opportunities…</p>}>
      <OpportunitiesRegister />
    </Suspense>
  );
}
