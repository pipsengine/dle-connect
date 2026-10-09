import { Suspense } from 'react';
import { TenderDesk } from '../_components/TenderDesk';

export default function AwardsPage() {
  return <Suspense fallback={<p className="text-sm text-slate-500">Loading awards…</p>}><TenderDesk desk="awards" /></Suspense>;
}
