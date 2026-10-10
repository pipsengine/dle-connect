import { Suspense } from 'react';
import { AwardsBoard } from '../_components/AwardsBoard';

export default function AwardsPage() {
  return <Suspense fallback={<p className="text-sm text-slate-500">Loading awards…</p>}><AwardsBoard /></Suspense>;
}
