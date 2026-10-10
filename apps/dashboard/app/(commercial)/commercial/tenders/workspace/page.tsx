import { Suspense } from 'react';
import { TenderWorkspace } from '../_components/TenderWorkspace';

export default function WorkspacePage() {
  return <Suspense fallback={<p className="text-sm text-slate-500">Loading workspace…</p>}><TenderWorkspace /></Suspense>;
}
