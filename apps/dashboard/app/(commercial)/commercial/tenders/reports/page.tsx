import { Suspense } from 'react';
import { ReportsBoard } from '../_components/ReportsBoard';

export default function ReportsPage() {
  return <Suspense fallback={<p className="text-sm text-slate-500">Loading reports…</p>}><ReportsBoard /></Suspense>;
}
