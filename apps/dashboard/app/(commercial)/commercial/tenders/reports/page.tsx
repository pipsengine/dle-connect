import { Suspense } from 'react';
import { TenderDesk } from '../_components/TenderDesk';

export default function ReportsPage() {
  return <Suspense fallback={<p className="text-sm text-slate-500">Loading reports…</p>}><TenderDesk desk="reports" /></Suspense>;
}
