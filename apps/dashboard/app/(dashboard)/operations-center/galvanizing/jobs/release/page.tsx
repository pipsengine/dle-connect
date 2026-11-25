import { Suspense } from 'react';
import { JobReleaseList } from '../../galvanizing-job-release';

export default function GalvanizingReleasePage() {
  return (
    <Suspense fallback={<div className="rounded-2xl border border-slate-200 bg-white p-10 text-sm text-slate-500">Loading job releases…</div>}>
      <JobReleaseList />
    </Suspense>
  );
}
