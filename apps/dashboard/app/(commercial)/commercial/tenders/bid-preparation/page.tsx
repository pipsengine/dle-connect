import { Suspense } from 'react';
import { TenderDesk } from '../_components/TenderDesk';

export default function BidPreparationPage() {
  return <Suspense fallback={<p className="text-sm text-slate-500">Loading bid preparation…</p>}><TenderDesk desk="bid" /></Suspense>;
}
