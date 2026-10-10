import { Suspense } from 'react';
import { SubmissionBoard } from '../_components/SubmissionBoard';

export default function SubmissionPage() {
  return <Suspense fallback={<p className="text-sm text-slate-500">Loading submissions…</p>}><SubmissionBoard /></Suspense>;
}
