import { Suspense } from 'react';
import { EnquiriesBoard } from '../_components/EnquiriesBoard';

export default function EnquiriesPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Loading enquiries…</p>}>
      <EnquiriesBoard />
    </Suspense>
  );
}
