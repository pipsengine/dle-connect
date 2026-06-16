import type { Metadata } from 'next';
import PayslipGenerationClient from './PayslipGenerationClient';

export const metadata: Metadata = {
  title: 'Payslip Generation',
};

export default function PayslipGenerationPage() {
  return <PayslipGenerationClient initialNow={new Date().toISOString()} />;
}
