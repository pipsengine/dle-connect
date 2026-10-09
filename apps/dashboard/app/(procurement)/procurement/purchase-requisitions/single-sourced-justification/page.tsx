import { Suspense } from 'react';
import { SingleSourceJustificationClient } from './SingleSourceJustificationClient';

export const metadata = { title: 'Single Sourced Justification' };

export default function Page() {
  return (
    <Suspense fallback={<div className="py-16 text-center text-sm text-slate-500">Loading single sourced justifications…</div>}>
      <SingleSourceJustificationClient />
    </Suspense>
  );
}
