import { Suspense } from 'react';
import { PurchaseRequisitionsClient } from '../_components/PurchaseRequisitionsClient';

export const metadata = { title: 'Purchase Requisitions' };

export default function Page() {
  return (
    <Suspense fallback={<div className="py-16 text-center text-sm text-slate-500">Loading purchase requisitions…</div>}>
      <PurchaseRequisitionsClient />
    </Suspense>
  );
}
