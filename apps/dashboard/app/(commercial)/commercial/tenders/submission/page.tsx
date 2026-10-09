import { Suspense } from 'react';
import { TenderDesk } from '../_components/TenderDesk';

export default function SubmissionPage() {
  return <Suspense fallback={<p className="text-sm text-slate-500">Loading submissions…</p>}><TenderDesk desk="submission" /></Suspense>;
}
