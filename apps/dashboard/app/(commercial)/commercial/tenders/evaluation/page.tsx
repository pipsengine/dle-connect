import { Suspense } from 'react';
import { TenderDesk } from '../_components/TenderDesk';

export default function EvaluationPage() {
  return <Suspense fallback={<p className="text-sm text-slate-500">Loading evaluation…</p>}><TenderDesk desk="evaluation" /></Suspense>;
}
