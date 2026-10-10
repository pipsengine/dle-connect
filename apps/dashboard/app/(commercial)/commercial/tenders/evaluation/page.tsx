import { Suspense } from 'react';
import { EvaluationBoard } from '../_components/EvaluationBoard';

export default function EvaluationPage() {
  return <Suspense fallback={<p className="text-sm text-slate-500">Loading evaluation…</p>}><EvaluationBoard /></Suspense>;
}
