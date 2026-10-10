import { Suspense } from 'react';
import { ApprovalBoard } from '../_components/ApprovalBoard';

export default function ApprovalsPage() {
  return <Suspense fallback={<p className="text-sm text-slate-500">Loading approvals…</p>}><ApprovalBoard /></Suspense>;
}
