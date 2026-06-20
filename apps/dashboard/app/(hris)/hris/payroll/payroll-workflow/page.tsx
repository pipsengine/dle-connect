import type { Metadata } from 'next';
import PayrollWorkflowClient from './PayrollWorkflowClient';

export const metadata: Metadata = {
  title: 'Payroll Workflow',
};

export default function PayrollWorkflowPage() {
  return <PayrollWorkflowClient />;
}
