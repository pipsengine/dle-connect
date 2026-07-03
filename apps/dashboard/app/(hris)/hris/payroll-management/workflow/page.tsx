import type { Metadata } from 'next';
import PayrollWorkflowClient from '../../payroll/payroll-workflow/PayrollWorkflowClient';

export const metadata: Metadata = {
  title: 'Payroll Workflow',
};

export default function PayrollWorkflowSectionPage() {
  return <PayrollWorkflowClient />;
}
