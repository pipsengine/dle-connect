import { Suspense } from 'react';
import { TenderDesk } from '../_components/TenderDesk';

export default function AdministrationPage() {
  return <Suspense fallback={<p className="text-sm text-slate-500">Loading administration…</p>}><TenderDesk desk="administration" /></Suspense>;
}