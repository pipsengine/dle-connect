import type { Metadata } from 'next';
import PayrollProcessingClient from './PayrollProcessingClient';

export const metadata: Metadata = {
  title: 'Payroll Processing',
};

export default function PayrollProcessingPage() {
  return <PayrollProcessingClient initialNow={new Date().toISOString()} />;
}
