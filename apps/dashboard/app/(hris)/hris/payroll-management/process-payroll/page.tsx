import type { Metadata } from 'next';
import PayrollManagementClient from '../PayrollManagementClient';

export const metadata: Metadata = {
  title: 'Payroll Management',
};

export default function ProcessPayrollHubPage() {
  return <PayrollManagementClient initialNow={new Date().toISOString()} initialSection="process-payroll" />;
}
