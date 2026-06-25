import type { Metadata } from 'next';
import SageReconciliationClient from './SageReconciliationClient';

export const metadata: Metadata = {
  title: 'Sage vs Enterprise Payroll Reconciliation',
};

export default function SageReconciliationPage() {
  return <SageReconciliationClient initialReferencePeriod="2026-05" initialTargetPeriod="2026-06" />;
}
