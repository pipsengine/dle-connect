import { Suspense } from 'react';
import { TenderDesk } from '../_components/TenderDesk';

export default function WorkspacePage() {
  return <Suspense fallback={<p className="text-sm text-slate-500">Loading workspace…</p>}><TenderDesk desk="workspace" /></Suspense>;
}
