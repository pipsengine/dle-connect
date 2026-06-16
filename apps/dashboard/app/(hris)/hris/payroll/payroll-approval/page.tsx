import type { Metadata } from 'next';
import PayrollApprovalClient from './PayrollApprovalClient';

export const metadata: Metadata = {
  title: 'Payroll Approval',
};

export default function PayrollApprovalPage() {
  return <PayrollApprovalClient initialNow={new Date().toISOString()} />;
}
