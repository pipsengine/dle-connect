import { Suspense } from 'react';
import { BidBoard } from '../_components/BidBoard';

export default function BidPreparationPage() {
  return <Suspense fallback={<p className="text-sm text-slate-500">Loading bid preparation…</p>}><BidBoard /></Suspense>;
}
