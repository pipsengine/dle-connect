import { Suspense } from 'react';
import { MyTenderDashboard } from '../_components/MyTenderDashboard';

export default function MyDashboardPage() {
  return <Suspense fallback={<p className="text-sm text-slate-500">Loading your dashboard…</p>}><MyTenderDashboard /></Suspense>;
}
