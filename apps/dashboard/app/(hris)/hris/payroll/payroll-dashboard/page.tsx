import type { Metadata } from 'next';
import PayrollManagementClient from '../../payroll-management/PayrollManagementClient';

export const metadata: Metadata = {
  title: 'Payroll Dashboard',
};

export default function PayrollDashboardPage() {
  return <PayrollManagementClient initialNow={new Date().toISOString()} />;
}
