import { Suspense } from 'react';
import { TenderDesk } from '../_components/TenderDesk';

export default function ApprovalsPage() {
  return <Suspense fallback={<p className="text-sm text-slate-500">Loading approvals…</p>}><TenderDesk desk="approvals" /></Suspense>;
}
